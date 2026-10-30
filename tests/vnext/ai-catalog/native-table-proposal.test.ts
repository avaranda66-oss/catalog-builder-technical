// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { nativePdfFixture } from './native-pdf-fixture';
import { readNativePdfSnapshot, type NativePdfRun } from '../../../src/vnext/ai-catalog/pdf-native-provenance';
import { NativeTableProposalSchema, verifyNativeTableProposal, type NativeTableProposal } from '../../../src/vnext/ai-catalog/native-table-proposal';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const text = (value: string, x: number, y: number): string => `BT /F1 12 Tf 1 0 0 1 ${x} ${y} Tm (${value}) Tj ET`;
const operators = [text('AX-041N', 220, 730), text('BX-062N', 330, 730), text('CZ-087N', 440, 730),
  text('Power Consumption', 40, 680), text('700 W', 220, 680), text('800 W', 330, 680), text('900 W', 440, 680),
  text('Weight', 40, 640), text('-10.25 kg', 220, 640), text('11.05 kg', 330, 640), text('12.50 kg', 440, 640)].join('\n');
type Anchor = NativeTableProposal['columns'][number]['modelHeader'];
function anchor(run: NativePdfRun, start = 0, end = run.str.length): Anchor {
  return { box: { ...run.metricBox! }, segments: [{ runId: run.id, start, end }] };
}
async function setup(source = operators, options: Parameters<typeof nativePdfFixture>[1] = {}): Promise<{ bytes: ArrayBuffer; proposal: NativeTableProposal }> {
  const bytes = nativePdfFixture(source, options);
  const snapshot = await readNativePdfSnapshot('original-grid.pdf', bytes, { pages: [1] });
  const runs = snapshot.pages[0].runs;
  const find = (literal: string): NativePdfRun => runs.find(run => run.str === literal)!;
  const columns = ['AX-041N', 'BX-062N', 'CZ-087N'].map((model, position) => ({
    id: `model-${position}`, model, left: 200 + position * 110, right: 310 + position * 110, modelHeader: anchor(find(model)),
  }));
  const rows: NativeTableProposal['rows'] = [
    { id: 'power', field: 'power-consumption', bottom: 665, top: 695, rowLabel: anchor(find('Power Consumption')) },
    { id: 'weight', field: 'weight', bottom: 625, top: 655, rowLabel: anchor(find('Weight')) },
  ];
  const cells = rows.flatMap((row, ri) => columns.map((column, ci) => {
    const literal = ri ? ['-10.25 kg', '11.05 kg', '12.50 kg'][ci] : ['700 W', '800 W', '900 W'][ci];
    const run = find(literal), unitAt = literal.indexOf(' ');
    return { columnId: column.id, rowId: row.id, quantity: anchor(run, 0, unitAt), unit: anchor(run, unitAt), condition: null };
  }));
  return { bytes, proposal: { version: 1, pdfSha256: snapshot.sha256, parserVersion: '4.10.38', page: 1,
    tableBox: { left: 30, bottom: 610, right: 560, top: 750 }, columns, rows, cells } };
}
const verify = (bytes: ArrayBuffer, proposal: unknown) => verifyNativeTableProposal('original-grid.pdf', bytes, proposal);

describe('bounded native table quarantine', () => {
  it('derives all six model/field values from current bytes, retaining signs and decimals without approval', async () => {
    const { bytes, proposal } = await setup();
    const result = await verify(bytes, proposal);
    expect(result.errors).toEqual([]);
    expect(result.status).toBe('needs_review');
    expect(result.candidates).toHaveLength(6);
    expect(result.candidates.every(candidate => candidate.association === 'verified-under-declared-grid')).toBe(true);
    expect(result.candidates.map(candidate => candidate.quantityLiteral)).toEqual(['700', '800', '900', '-10.25', '11.05', '12.50']);
    expect(result.candidates.map(candidate => candidate.unitLiteral)).toEqual([' W', ' W', ' W', ' kg', ' kg', ' kg']);
    expect(result.paintVisibility).toBe('not-attested');
    expect(result.approval).toBe('not-created');
    expect(result.candidates.every(candidate => candidate.reasons.includes('PAINT_VISIBILITY_NOT_ATTESTED'))).toBe(true);
    expect(Object.isFrozen(result.candidates[0].sourceRoles[0].segments[0])).toBe(true);
    expect('known' in result).toBe(false);
  });

  it('rejects unknown/free-form fields, malformed identities, excessive arrays and unsupported range before source promotion', async () => {
    const { bytes, proposal } = await setup();
    for (const raw of [{ ...proposal, html: '<script>approve()</script>' },
      { ...proposal, parserVersion: 'invented' }, { ...proposal, page: 0 },
      { ...proposal, cells: [...proposal.cells, proposal.cells[0]] },
      { ...proposal, columns: Array(7).fill(proposal.columns[0]) },
      { ...proposal, rows: [{ ...proposal.rows[0], field: 'operating-range' }] },
      { ...proposal, columns: proposal.columns.map((column, i) => i ? column : { ...column, model: '<b>AX-041N</b>' }) }]) {
      expect((await verify(bytes, raw)).errors).toEqual(['PROPOSAL_SCHEMA_INVALID']);
    }
    expect(NativeTableProposalSchema.safeParse({ ...proposal, quote: 'AX-041N | Power | 700 W' }).success).toBe(false);
  });

  it('blocks stale/forged SHA or IDs and boxes rather than trusting a serialized suggestion', async () => {
    const { bytes, proposal } = await setup();
    expect((await verify(bytes, { ...proposal, pdfSha256: 'a'.repeat(64) })).errors).toEqual(['PDF_NATIVE_HASH_MISMATCH']);
    const badId = structuredClone(proposal); badId.columns[0].modelHeader.segments[0].runId = 'p1:i9999';
    expect((await verify(bytes, badId)).errors).toEqual(['ROLE_RUN_OR_SPAN_INVALID']);
    const box = structuredClone(proposal); box.columns[0].modelHeader.box.right -= 0.01;
    expect((await verify(bytes, box)).errors).toEqual(['ROLE_BOX_NOT_NATIVE_ENVELOPE']);
    const outside = structuredClone(proposal); outside.tableBox.left = -1;
    expect((await verify(bytes, outside)).errors).toEqual(['TABLE_OUTSIDE_VISIBLE_PAGE']);
  });

  it('rejects swapped model headers, value columns and row labels', async () => {
    const { bytes, proposal } = await setup();
    const headers = structuredClone(proposal);
    [headers.columns[0].modelHeader, headers.columns[1].modelHeader] = [headers.columns[1].modelHeader, headers.columns[0].modelHeader];
    expect((await verify(bytes, headers)).errors).toEqual(['MODEL_COLUMN_MISMATCH']);
    const cells = structuredClone(proposal);
    [cells.cells[0].quantity, cells.cells[1].quantity] = [cells.cells[1].quantity, cells.cells[0].quantity];
    expect((await verify(bytes, cells)).candidates[0].reasons).toContain('CELL_ROW_OR_COLUMN_MISMATCH');
    const rows = structuredClone(proposal);
    [rows.rows[0].rowLabel, rows.rows[1].rowLabel] = [rows.rows[1].rowLabel, rows.rows[0].rowLabel];
    expect((await verify(bytes, rows)).errors).toEqual(['FIELD_ROW_MISMATCH']);
  });

  it('requires complete source-token coverage: cannot omit minus, decimal, unit or model suffix', async () => {
    const { bytes, proposal } = await setup();
    for (const change of [(p: NativeTableProposal) => { p.cells[3].quantity.segments[0].start = 1; },
      (p: NativeTableProposal) => { p.cells[3].quantity.segments[0].end = 3; },
      (p: NativeTableProposal) => { p.cells[0].unit.segments[0].end -= 1; },
      (p: NativeTableProposal) => { p.cells[0].quantity.segments[0].end += 1; }]) {
      const modified = structuredClone(proposal); change(modified);
      const result = await verify(bytes, modified);
      expect(result.status).toBe('blocked');
      expect(result.candidates.some(candidate => candidate.reasons.includes('CELL_SPAN_COVERAGE_INCOMPLETE'))).toBe(true);
    }
    const partial = structuredClone(proposal); partial.columns[0].modelHeader.segments[0].end--;
    expect((await verify(bytes, partial)).errors).toEqual(['HEADER_OR_LABEL_PARTIAL_TOKEN']);
  });

  it('blocks shared columns, competing source values and any unsupported note/condition link', async () => {
    const { bytes, proposal } = await setup();
    const shared = structuredClone(proposal); shared.columns[0].right = shared.columns[1].right;
    expect((await verify(bytes, shared)).errors).toEqual(['COMPETING_MODEL_HEADER']);
    const note = structuredClone(proposal); note.cells[0].condition = note.rows[0].rowLabel;
    expect((await verify(bytes, note)).candidates[0].reasons).toEqual(['CONDITION_LINK_UNSUPPORTED']);
    const duplicate = await setup(operators + '\n' + text('999 W', 270, 680));
    const result = await verify(duplicate.bytes, duplicate.proposal);
    expect(result.candidates[0].reasons).toContain('UNACCOUNTED_CELL_CONTENT');
  });

  it('copies caller bytes and suggestion synchronously, preventing await races', async () => {
    const { bytes, proposal } = await setup();
    const original = proposal.pdfSha256;
    const pending = verify(bytes, proposal);
    new Uint8Array(bytes).fill(0); proposal.columns[0].model = 'FORGED'; proposal.cells[0].quantity.segments[0].end = 1;
    const result = await pending;
    expect(result.pdfSha256).toBe(original);
    expect(result.errors).toEqual([]);
    expect(result.candidates[0].modelLiteral).toBe('AX-041N');
    expect(result.candidates[0].quantityLiteral).toBe('700');
  });

  it('does not approve invisible or clipped text even when parser concatenation is LITERAL', async () => {
    for (const extra of ['3 Tr\n', 'q 0 0 10 10 re W n\n']) {
      const { bytes, proposal } = await setup(extra + operators + (extra.startsWith('q') ? '\nQ' : ''));
      const result = await verify(bytes, proposal);
      expect(result.errors).toEqual([]);
      expect(result.candidates[0].cellDiagnostic?.status).toBe('LITERAL');
      expect(result.status).toBe('needs_review');
      expect(result.approval).toBe('not-created');
    }
  });

  it('blocks malformed markers, ordinary rotated text, Artifact-selected roles and scan input', async () => {
    const { bytes, proposal } = await setup();
    const unbalanced = await setup(operators + '\nEMC');
    expect((await verify(unbalanced.bytes, unbalanced.proposal)).errors).toEqual(['MARKED_CONTENT_OPERATORS_UNBALANCED']);
    const rotated = await setup(operators + '\nBT /F1 12 Tf 0.7 0.7 -0.7 0.7 80 500 Tm (ordinary) Tj ET');
    expect((await verify(rotated.bytes, rotated.proposal)).candidates[0].reasons).toContain('RUN_GEOMETRY_UNSUPPORTED');
    const artifact = await setup(operators + '\n/Artifact BMC\n' + text('not-a-role', 500, 600) + '\nEMC');
    const snapshot = await readNativePdfSnapshot('original-grid.pdf', artifact.bytes, { pages: [1] });
    const run = snapshot.pages[0].runs.find(item => item.str === 'not-a-role')!;
    artifact.proposal.columns[0].modelHeader = anchor(run);
    expect((await verify(artifact.bytes, artifact.proposal)).errors).toEqual(['ROLE_NOT_NATIVE_CONTENT']);
    const scan = nativePdfFixture('0 0 10 10 re f');
    const scanSnapshot = await readNativePdfSnapshot('original-grid.pdf', scan, { pages: [1] });
    expect((await verify(scan, { ...proposal, pdfSha256: scanSnapshot.sha256 })).errors).toEqual(['NO_NATIVE_TEXT']);
    expect((await verify(bytes, proposal)).approval).toBe('not-created');
  });
});
