import { z } from 'zod';
import {
  readNativePdfSnapshot, reconstructNativeCellRegion,
  type NativePdfBox, type NativePdfRun, type NativePdfSnapshot, type NativeCellDiagnostic,
} from './pdf-native-provenance';

/** Suggestions only. No TechnicalInput, Known, compiler or approval entry point. */
const key = z.string().regex(/^[a-z0-9-]{1,40}$/);
const coordinate = z.number().finite();
const boxSchema = z.object({ left: coordinate, bottom: coordinate, right: coordinate, top: coordinate }).strict()
  .refine(box => box.left < box.right && box.bottom < box.top, 'Invalid box');
const segmentSchema = z.object({
  runId: z.string().regex(/^p[1-9][0-9]{0,3}:i[0-9]{1,5}$/),
  start: z.number().int().min(0).max(60000), end: z.number().int().min(1).max(60000),
}).strict().refine(span => span.start < span.end, 'Invalid span');
const anchorSchema = z.object({ box: boxSchema, segments: z.array(segmentSchema).min(1).max(24) }).strict();
const columnSchema = z.object({
  id: key, model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{1,39}$/),
  left: coordinate, right: coordinate, modelHeader: anchorSchema,
}).strict().refine(column => column.left < column.right, 'Invalid column');
const rowSchema = z.object({
  id: key, field: z.enum(['power-consumption', 'weight']),
  bottom: coordinate, top: coordinate, rowLabel: anchorSchema,
}).strict().refine(row => row.bottom < row.top, 'Invalid row');
const cellSchema = z.object({
  columnId: key, rowId: key, quantity: anchorSchema, unit: anchorSchema,
  condition: anchorSchema.nullable(),
}).strict();
export const NativeTableProposalSchema = z.object({
  version: z.literal(1), pdfSha256: z.string().regex(/^[a-f0-9]{64}$/),
  parserVersion: z.literal('4.10.38'), page: z.number().int().min(1).max(1000),
  tableBox: boxSchema, columns: z.array(columnSchema).min(2).max(6),
  rows: z.array(rowSchema).min(1).max(8), cells: z.array(cellSchema).min(2).max(48),
}).strict().superRefine((proposal, context) => {
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(proposal.columns.map(column => column.id)) || !unique(proposal.columns.map(column => column.model)) ||
      !unique(proposal.rows.map(row => row.id)) || !unique(proposal.rows.map(row => row.field)) ||
      !unique(proposal.cells.map(cell => `${cell.rowId}/${cell.columnId}`)) ||
      proposal.cells.length !== proposal.columns.length * proposal.rows.length ||
      proposal.cells.some(cell => !proposal.columns.some(column => column.id === cell.columnId) ||
        !proposal.rows.some(row => row.id === cell.rowId))) {
    context.addIssue({ code: 'custom', message: 'Grid identities must be unique and complete' });
  }
});
export type NativeTableProposal = z.infer<typeof NativeTableProposalSchema>;
type Anchor = z.infer<typeof anchorSchema>;
type Segment = z.infer<typeof segmentSchema>;
export interface NativeRoleEvidence {
  readonly role: 'modelHeader' | 'rowLabel' | 'quantity' | 'unit';
  readonly literal: string;
  readonly boxKind: 'whole-run-font-metric-envelope';
  readonly box: NativePdfBox;
  readonly segments: readonly Segment[];
  readonly runs: readonly NativePdfRun[];
  readonly diagnostic: NativeCellDiagnostic;
}
export interface NativeTableCandidate {
  readonly columnId: string;
  readonly rowId: string;
  readonly status: 'geometry_verified' | 'needs_review' | 'blocked';
  readonly association: 'verified-under-declared-grid' | 'unverified';
  readonly modelLiteral: string;
  readonly labelLiteral: string;
  readonly quantityLiteral: string;
  readonly unitLiteral: string;
  readonly conditionLiteral: null;
  readonly cellLiteral: string;
  readonly sourceRoles: readonly NativeRoleEvidence[];
  readonly cellDiagnostic: NativeCellDiagnostic | null;
  readonly reasons: readonly string[];
  readonly questions: readonly string[];
}
export interface NativeTableQuarantine {
  readonly purpose: 'native-table-quarantine-only';
  readonly verifierVersion: '1';
  readonly status: 'geometry_verified' | 'needs_review' | 'blocked';
  readonly pdfSha256: string | null;
  readonly proposalSha256: string | null;
  readonly snapshot: NativePdfSnapshot | null;
  readonly candidates: readonly NativeTableCandidate[];
  readonly errors: readonly string[];
  readonly paintVisibility: 'not-attested';
  readonly approval: 'not-created';
}

const pua = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u;
const policies = {
  'power-consumption': { label: 'Power Consumption', unit: /^[ \t]*W$/u },
  weight: { label: 'Weight', unit: /^[ \t]*kg$/u },
};
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function contains(a: NativePdfBox, b: NativePdfBox): boolean {
  return b.left >= a.left && b.right <= a.right && b.bottom >= a.bottom && b.top <= a.top;
}
function sameBox(a: NativePdfBox, b: NativePdfBox): boolean {
  return a.left === b.left && a.right === b.right && a.bottom === b.bottom && a.top === b.top;
}
function envelope(runs: readonly NativePdfRun[]): NativePdfBox {
  return {
    left: Math.min(...runs.map(run => run.metricBox!.left)), right: Math.max(...runs.map(run => run.metricBox!.right)),
    bottom: Math.min(...runs.map(run => run.metricBox!.bottom)), top: Math.max(...runs.map(run => run.metricBox!.top)),
  };
}
function ordered(runs: readonly NativePdfRun[]): NativePdfRun[] {
  return [...runs].sort((a, b) => a.transform[4] - b.transform[4] || a.itemIndex - b.itemIndex);
}
function proofError(code: string): never { throw new Error(code); }
function resolveRole(snapshot: NativePdfSnapshot, proposal: NativeTableProposal, anchor: Anchor, role: NativeRoleEvidence['role']): NativeRoleEvidence {
  const page = snapshot.pages[0];
  const index = new Map(page.runs.map(run => [run.id, run]));
  const spans = anchor.segments;
  const selected = spans.map(span => {
    const run = index.get(span.runId);
    if (!run || !run.str.length || span.end > run.str.length) proofError('ROLE_RUN_OR_SPAN_INVALID');
    // Spans are string offsets only. The box always covers the COMPLETE runs.
    if (run.evidenceRole !== 'content') proofError('ROLE_NOT_NATIVE_CONTENT');
    if (!run.geometrySupported || !run.metricBox) proofError('ROLE_GEOMETRY_UNSUPPORTED');
    if (pua.test(run.str)) proofError('PRIVATE_USE_GLYPH');
    if ((span.start && /[\uD800-\uDBFF]/u.test(run.str[span.start - 1])) ||
        (span.end < run.str.length && /[\uD800-\uDBFF]/u.test(run.str[span.end - 1]))) proofError('SPAN_SPLITS_CODE_POINT');
    return run;
  });
  const uniqueRuns = ordered([...new Map(selected.map(run => [run.id, run])).values()]);
  if (uniqueRuns.some(run => run.transform[5] !== uniqueRuns[0].transform[5])) proofError('ROLE_MULTIPLE_BASELINES');
  const computed = envelope(uniqueRuns);
  if (!sameBox(anchor.box, computed) || !contains(proposal.tableBox, computed)) proofError('ROLE_BOX_NOT_NATIVE_ENVELOPE');
  const rank = new Map(uniqueRuns.map((run, position) => [run.id, position]));
  const sorted = [...spans].sort((a, b) => rank.get(a.runId)! - rank.get(b.runId)! || a.start - b.start);
  if (spans.some((span, position) => span.runId !== sorted[position].runId || span.start !== sorted[position].start || span.end !== sorted[position].end)) proofError('ROLE_SPANS_OUT_OF_ORDER');
  for (let position = 1; position < sorted.length; position++) {
    const previous = sorted[position - 1], current = sorted[position];
    if (previous.runId === current.runId && previous.end > current.start) proofError('ROLE_SPANS_OVERLAP');
  }
  if ((role === 'modelHeader' || role === 'rowLabel') && uniqueRuns.some(run => {
    const parts = sorted.filter(span => span.runId === run.id);
    return parts.length !== 1 || parts[0].start !== 0 || parts[0].end !== run.str.length;
  })) proofError('HEADER_OR_LABEL_PARTIAL_TOKEN');
  const diagnostic = reconstructNativeCellRegion(snapshot, { page: proposal.page, box: computed, expectedRunIds: uniqueRuns.map(run => run.id) });
  return freeze({ role, literal: sorted.map(span => index.get(span.runId)!.str.slice(span.start, span.end)).join(''),
    boxKind: 'whole-run-font-metric-envelope' as const, box: computed, segments: sorted, runs: uniqueRuns, diagnostic });
}
function baselineInside(runs: readonly NativePdfRun[], bottom: number, top: number): boolean {
  return runs.every(run => run.transform[5] > bottom && run.transform[5] < top);
}
function withinColumn(runs: readonly NativePdfRun[], left: number, right: number): boolean {
  return runs.every(run => run.metricBox!.left >= left && run.metricBox!.right <= right);
}
function assessDiagnostic(diagnostic: NativeCellDiagnostic, own: readonly NativePdfRun[]): string[] {
  if (diagnostic.status !== 'BLOCKED') return diagnostic.reasons.slice();
  // Preserve BLOCKED verbatim. A coarse envelope crossing another baseline can
  // be reviewed in quarantine, but is NEVER rewritten as LITERAL or approved.
  if (diagnostic.reasons.length === 1 && diagnostic.reasons[0] === 'REGION_CUTS_RUN' &&
      diagnostic.runs.every(run => own.some(selected => selected.id === run.id) ||
        (run.geometrySupported && run.evidenceRole === 'content' && run.transform[5] !== own[0].transform[5]))) {
    return ['READER_BLOCKED_METRIC_ENVELOPE_REVIEW'];
  }
  proofError(diagnostic.reasons[0] ?? 'READER_BLOCKED');
}
function verifyGrid(snapshot: NativePdfSnapshot, proposal: NativeTableProposal): { headers: NativeRoleEvidence[]; labels: NativeRoleEvidence[] } {
  const page = snapshot.pages[0];
  if (snapshot.blockedReasons.length || page.blockedReasons.length) proofError(snapshot.blockedReasons[0] ?? page.blockedReasons[0]);
  if (snapshot.parser.version !== proposal.parserVersion) proofError('PARSER_VERSION_MISMATCH');
  const view = { left: page.view[0], bottom: page.view[1], right: page.view[2], top: page.view[3] };
  if (!contains(view, proposal.tableBox)) proofError('TABLE_OUTSIDE_VISIBLE_PAGE');
  const headers = proposal.columns.map(column => resolveRole(snapshot, proposal, column.modelHeader, 'modelHeader'));
  const labels = proposal.rows.map(row => resolveRole(snapshot, proposal, row.rowLabel, 'rowLabel'));
  const headerY = headers[0].runs[0].transform[5];
  for (let position = 0; position < proposal.columns.length; position++) {
    const column = proposal.columns[position], header = headers[position];
    if (column.left < proposal.tableBox.left || column.right > proposal.tableBox.right ||
        !withinColumn(header.runs, column.left, column.right) || header.literal !== column.model ||
        header.runs.some(run => run.transform[5] !== headerY)) proofError('MODEL_COLUMN_MISMATCH');
    if (position && proposal.columns[position - 1].right > column.left) proofError('COLUMN_OVERLAP_OR_ORDER');
    const selected = new Set(header.runs.map(run => run.id));
    if (page.runs.some(run => run.evidenceRole === 'content' && /\S/u.test(run.str) && run.transform[5] === headerY &&
      run.metricBox && run.metricBox.left < column.right && run.metricBox.right > column.left && !selected.has(run.id))) proofError('COMPETING_MODEL_HEADER');
  }
  for (let position = 0; position < proposal.rows.length; position++) {
    const row = proposal.rows[position], label = labels[position];
    if (row.bottom < proposal.tableBox.bottom || row.top > proposal.tableBox.top || row.top >= headerY ||
        !baselineInside(label.runs, row.bottom, row.top) || label.literal !== policies[row.field].label ||
        label.box.right > proposal.columns[0].left) proofError('FIELD_ROW_MISMATCH');
    if (position && proposal.rows[position - 1].bottom < row.top) proofError('ROW_OVERLAP_OR_ORDER');
    const selected = new Set(label.runs.map(run => run.id));
    if (page.runs.some(run => run.evidenceRole === 'content' && /\S/u.test(run.str) &&
      run.transform[5] === label.runs[0].transform[5] && run.metricBox && run.metricBox.left < proposal.columns[0].left &&
      run.metricBox.right > proposal.tableBox.left && !selected.has(run.id))) proofError('COMPETING_ROW_LABEL');
  }
  return { headers, labels };
}
function verifyCell(snapshot: NativePdfSnapshot, proposal: NativeTableProposal, cell: NativeTableProposal['cells'][number], headers: NativeRoleEvidence[], labels: NativeRoleEvidence[]): NativeTableCandidate {
  const ci = proposal.columns.findIndex(column => column.id === cell.columnId), ri = proposal.rows.findIndex(row => row.id === cell.rowId);
  const column = proposal.columns[ci], row = proposal.rows[ri], header = headers[ci], label = labels[ri];
  const roles: NativeRoleEvidence[] = [header, label];
  let diagnostic: NativeCellDiagnostic | null = null;
  let quantity = '', unit = '', cellLiteral = '';
  try {
    if (cell.condition !== null) proofError('CONDITION_LINK_UNSUPPORTED');
    const q = resolveRole(snapshot, proposal, cell.quantity, 'quantity'), u = resolveRole(snapshot, proposal, cell.unit, 'unit');
    roles.push(q, u); quantity = q.literal; unit = u.literal;
    const runs = ordered([...new Map([...q.runs, ...u.runs].map(run => [run.id, run])).values()]);
    if (!withinColumn(runs, column.left, column.right) || !baselineInside(runs, row.bottom, row.top) ||
        runs.some(run => run.transform[5] !== label.runs[0].transform[5])) proofError('CELL_ROW_OR_COLUMN_MISMATCH');
    const all = [...q.segments, ...u.segments];
    for (const run of runs) {
      const parts = all.filter(span => span.runId === run.id).sort((a, b) => a.start - b.start);
      let end = 0;
      for (const part of parts) { if (part.start !== end) proofError('CELL_SPAN_COVERAGE_INCOMPLETE'); end = part.end; }
      if (end !== run.str.length) proofError('CELL_SPAN_COVERAGE_INCOMPLETE');
    }
    const sourceRuns = snapshot.pages[0].runs;
    if (sourceRuns.some(run => run.evidenceRole === 'content' && /\S/u.test(run.str) &&
      run.transform[5] === runs[0].transform[5] && run.metricBox &&
      run.metricBox.left < column.right && run.metricBox.right > column.left && !runs.some(selected => selected.id === run.id))) proofError('UNACCOUNTED_CELL_CONTENT');
    if (!/^[+-]?\d+(?:[.,]\d+)?$/u.test(quantity) || !policies[row.field].unit.test(unit)) proofError('QUANTITY_OR_UNIT_TOKEN_INCOMPLETE');
    cellLiteral = runs.map(run => run.str).join('');
    diagnostic = reconstructNativeCellRegion(snapshot, { page: proposal.page, box: envelope(runs), expectedRunIds: runs.map(run => run.id) });
    const reasons = new Set<string>(['PAINT_VISIBILITY_NOT_ATTESTED']);
    for (const role of roles) for (const reason of assessDiagnostic(role.diagnostic, role.runs)) reasons.add(reason);
    for (const reason of assessDiagnostic(diagnostic, runs)) reasons.add(reason);
    // Geometric cell completeness above does not remove uncertainty of joins.
    for (let index = 1; index < runs.length; index++) {
      if (runs[index - 1].transform[4] === runs[index].transform[4]) proofError('OVERLAPPING_ORDER_AMBIGUOUS');
      const gap = runs[index].transform[4] - (runs[index - 1].transform[4] + runs[index - 1].width);
      if (gap > 0) reasons.add('GAP_WITHOUT_CERTIFIED_SEPARATOR');
    }
    if (runs.some(run => run.parserWhitespace)) reasons.add('PARSER_WHITESPACE_UNATTESTED');
    return freeze({ columnId: cell.columnId, rowId: cell.rowId, status: 'needs_review' as const,
      association: 'verified-under-declared-grid' as const, modelLiteral: header.literal, labelLiteral: label.literal,
      quantityLiteral: quantity, unitLiteral: unit, conditionLiteral: null, cellLiteral, sourceRoles: roles, cellDiagnostic: diagnostic,
      reasons: [...reasons], questions: ['Confirme visualmente o modelo, a linha, todos os fragmentos e a unidade na fonte exata.',
        'O leitor não certifica pintura, clipping ou separadores inferidos. Uma revisão explícita futura é obrigatória.'] });
  } catch (error) {
    return freeze({ columnId: cell.columnId, rowId: cell.rowId, status: 'blocked' as const, association: 'unverified' as const,
      modelLiteral: header.literal, labelLiteral: label.literal, quantityLiteral: quantity, unitLiteral: unit, conditionLiteral: null,
      cellLiteral, sourceRoles: roles, cellDiagnostic: diagnostic, reasons: [error instanceof Error ? error.message : 'CELL_VERIFICATION_FAILED'], questions: [] });
  }
}

/** Owns raw proposal and bytes before yielding; always re-extracts the current PDF. */
export async function verifyNativeTableProposal(fileName: string, bytes: ArrayBuffer, raw: unknown): Promise<NativeTableQuarantine> {
  const parsed = NativeTableProposalSchema.safeParse(raw);
  const result = (errors: readonly string[], snapshot: NativePdfSnapshot | null = null,
    candidates: readonly NativeTableCandidate[] = [], proposalSha256: string | null = null): NativeTableQuarantine => freeze({
      purpose: 'native-table-quarantine-only' as const, verifierVersion: '1' as const,
      status: errors.length || candidates.some(candidate => candidate.status === 'blocked') ? 'blocked' as const : 'needs_review' as const,
      pdfSha256: snapshot?.sha256 ?? null, proposalSha256, snapshot, candidates, errors,
      paintVisibility: 'not-attested' as const, approval: 'not-created' as const,
    });
  if (!parsed.success) return result(['PROPOSAL_SCHEMA_INVALID']);
  const proposal = freeze(parsed.data);
  // Both the parser's owned byte copy and schema's cloned data exist before await.
  const reading = readNativePdfSnapshot(fileName, bytes, { pages: [proposal.page], expectedSha256: proposal.pdfSha256 });
  let snapshot: NativePdfSnapshot | null = null;
  let digest: string | null = null;
  try {
    snapshot = await reading;
    const encoded = new TextEncoder().encode(JSON.stringify(proposal));
    digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoded))].map(value => value.toString(16).padStart(2, '0')).join('');
    const { headers, labels } = verifyGrid(snapshot, proposal);
    return result([], snapshot, proposal.cells.map(cell => verifyCell(snapshot!, proposal, cell, headers, labels)), digest);
  } catch (error) {
    return result([error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message) ? error.message : 'PDF_VERIFICATION_FAILED'], snapshot, [], digest);
  }
}
