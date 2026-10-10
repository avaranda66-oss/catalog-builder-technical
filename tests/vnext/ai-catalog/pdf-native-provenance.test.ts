import { describe, expect, it } from 'vitest';
import {
  readNativePdfSnapshot, reconstructNativeCellRegion,
  type NativePdfSnapshot, type NativePdfRun,
} from '../../../src/vnext/ai-catalog/pdf-native-provenance';
import { nativePdfFixture } from './native-pdf-fixture';

const splitNumber = 'BT /F1 12 Tf 1 0 0 1 40 750 Tm (-) Tj /F2 12 Tf 1 0 0 1 43.996 750 Tm (0,) Tj /F1 12 Tf 1 0 0 1 58.396 750 Tm (001) Tj ET';
function boxAround(runs: readonly NativePdfRun[]) {
  return {
    left: Math.min(...runs.map(run => run.metricBox!.left)),
    bottom: Math.min(...runs.map(run => run.metricBox!.bottom)),
    right: Math.max(...runs.map(run => run.metricBox!.right)),
    top: Math.max(...runs.map(run => run.metricBox!.top)),
  };
}
async function read(operators = splitNumber, options: Parameters<typeof nativePdfFixture>[1] = {}) {
  return readNativePdfSnapshot('original-fixture.pdf', nativePdfFixture(operators, options), { pages: [1] });
}

describe('read-only native PDF provenance boundary', () => {
  it('retains a rotated native Artifact in the source while excluding it only from a region diagnostic', async () => {
    const snapshot = await read('BT /F1 12 Tf 40 750 Td (AX-041N) Tj ET /Artifact BMC BT /F2 12 Tf 0.7071 0.7071 -0.7071 0.7071 60 748 Tm (ORIGINAL BACKGROUND) Tj ET EMC');
    const ordinary = snapshot.pages[0].runs.filter(run => run.str === 'AX-041N');
    const artifact = snapshot.pages[0].runs.find(run => run.str === 'ORIGINAL BACKGROUND')!;
    expect(artifact.geometrySupported).toBe(false);
    expect(artifact.evidenceRole).toBe('artifact');
    expect(artifact.markedTags).toEqual(['Artifact']);
    expect(snapshot.pages[0].markedContent).toMatchObject({ textMappingExact: true, operatorsBalanced: true, textMaxDepth: 1 });
    const result = reconstructNativeCellRegion(snapshot, { page: 1, box: boxAround(ordinary) });
    expect(result.status).toBe('LITERAL');
    expect(result.rawLiteral).toBe('AX-041N');
    expect(result.excludedArtifactRunIds).toContain(artifact.id);
    expect(snapshot.pages[0].runs).toContain(artifact);
  });

  it('preserves original split minus/decimal/digits and combines only touching or overlapping runs', async () => {
    const snapshot = await read();
    const runs = snapshot.pages[0].runs.filter(run => /\S/u.test(run.str));
    expect(runs.map(run => run.str)).toEqual(['-', '0,', '001']);
    expect(new Set(runs.map(run => run.font!.name)).size).toBe(2);
    const result = reconstructNativeCellRegion(snapshot, { page: 1, box: boxAround(runs), expectedRunIds: runs.map(run => run.id) });
    expect(result.status).toBe('LITERAL');
    expect(result.rawLiteral).toBe('-0,001');
    expect(result.joins.every(join => join.gap <= 0)).toBe(true);
    expect(result.runs.map(run => run.id)).toEqual(runs.map(run => run.id));
    expect(snapshot.parser.unicodeNormalization).toBe(false);
    expect(snapshot.purpose).toBe('native-pdf-diagnostic-only');
  });

  it('does not infer a separator or accept even a small positive gap without literal whitespace', async () => {
    const snapshot = await read(splitNumber.replace('43.996', '44.026').replace('58.396', '58.426'));
    const runs = snapshot.pages[0].runs.filter(run => run.str.length);
    const result = reconstructNativeCellRegion(snapshot, { page: 1, box: boxAround(runs) });
    expect(result.status).toBe('UNCERTAIN');
    expect(result.reasons).toContain('GAP_WITHOUT_LITERAL_SEPARATOR');
    expect(result.rawLiteral).toBe('-0,001');
    expect(result.joins.some(join => join.gap > 0 && join.gap < 0.15)).toBe(true);
  });

  it('blocks a region that clips part of a run rather than returning a substring', async () => {
    const snapshot = await read('BT /F1 12 Tf 40 750 Td (AX-041N Range -0,001 kPa) Tj ET');
    const runs = snapshot.pages[0].runs.filter(run => /\S/u.test(run.str));
    const box = boxAround(runs);
    const result = reconstructNativeCellRegion(snapshot, { page: 1, box: { ...box, right: box.right - 1 } });
    expect(result.status).toBe('BLOCKED');
    expect(result.reasons).toContain('REGION_CUTS_RUN');
    expect(result.runs[0].str).toBe('AX-041N Range -0,001 kPa');
  });

  it('does not present adjacent columns as a certified literal because PDF.js emitted a heuristic space', async () => {
    const snapshot = await read('BT /F1 12 Tf 1 0 0 1 40 750 Tm (AX-041N) Tj 1 0 0 1 260 750 Tm (BX-062N) Tj ET');
    const runs = snapshot.pages[0].runs.filter(run => run.str.length);
    expect(runs.some(run => run.parserWhitespace)).toBe(true);
    const result = reconstructNativeCellRegion(snapshot, { page: 1, box: boxAround(runs) });
    expect(result.status).toBe('UNCERTAIN');
    expect(result.reasons).toContain('PARSER_WHITESPACE_UNATTESTED');
    expect(result.rawLiteral).toContain('AX-041N');
    expect(result.rawLiteral).toContain('BX-062N');
  });

  it('binds hashing and parsing to an owned snapshot when caller bytes and selected pages mutate during await', async () => {
    const input = nativePdfFixture(splitNumber);
    const originalDigest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', input))].map(value => value.toString(16).padStart(2, '0')).join('');
    const pages = [1];
    const pending = readNativePdfSnapshot('race.pdf', input, { pages, expectedSha256: originalDigest });
    new Uint8Array(input).fill(0);
    pages[0] = 999;
    const snapshot = await pending;
    expect(snapshot.sha256).toBe(originalDigest);
    expect(snapshot.selectedPages).toEqual([1]);
    expect(snapshot.pages[0].runs.map(run => run.str).join('')).toBe('-0,001');
    expect(Object.isFrozen(snapshot.pages[0].runs[0].transform)).toBe(true);
    expect(Object.isFrozen(snapshot.pages[0].runs[0].font)).toBe(true);
  });

  it('rejects mismatched byte hashes and does not trust a JSON copy as a native snapshot', async () => {
    await expect(readNativePdfSnapshot('wrong-hash.pdf', nativePdfFixture(splitNumber), { pages: [1], expectedSha256: '0'.repeat(64) })).rejects.toThrow('PDF_NATIVE_HASH_MISMATCH');
    const snapshot = await read();
    const fabricated = JSON.parse(JSON.stringify(snapshot)) as NativePdfSnapshot;
    expect(reconstructNativeCellRegion(fabricated, { page: 1, box: boxAround(snapshot.pages[0].runs) }).reasons).toEqual(['UNTRUSTED_SNAPSHOT']);
    const repeated = await read();
    expect(repeated.sha256).toBe(snapshot.sha256);
    expect(repeated.pages[0].runStringsSha256).toBe(snapshot.pages[0].runStringsSha256);
    expect(repeated.pages[0].runs.map(run => run.id)).toEqual(snapshot.pages[0].runs.map(run => run.id));
  });

  it('blocks fabricated run selections and out-of-CropBox regions', async () => {
    const snapshot = await read(splitNumber, { cropBox: '[20 20 580 820]', userUnit: 2 });
    const runs = snapshot.pages[0].runs.filter(run => run.str.length);
    expect(snapshot.pages[0].view).toEqual([20, 20, 580, 820]);
    expect(snapshot.pages[0].userUnit).toBe(2);
    expect(reconstructNativeCellRegion(snapshot, { page: 1, box: boxAround(runs), expectedRunIds: ['p1:i999'] }).reasons).toEqual(['RUN_SELECTION_MISMATCH']);
    expect(reconstructNativeCellRegion(snapshot, { page: 1, box: { left: 0, bottom: 700, right: 500, top: 800 } }).reasons).toEqual(['REGION_OUTSIDE_VISIBLE_PAGE']);
  });

  it('blocks private-use glyphs, rotated pages, scan-only pages and truncated text', async () => {
    const glyph = await read('BT /F1 12 Tf 40 750 Td (A) Tj ET', { unicodeHex: 'E001' });
    const glyphRuns = glyph.pages[0].runs.filter(run => run.str.length);
    expect(glyphRuns[0].str).toBe('\uE001');
    expect(reconstructNativeCellRegion(glyph, { page: 1, box: boxAround(glyphRuns) }).reasons).toEqual(['PRIVATE_USE_GLYPH']);
    const rotated = await read(splitNumber, { rotation: 90 });
    expect(reconstructNativeCellRegion(rotated, { page: 1, box: { left: 20, bottom: 20, right: 500, top: 800 } }).reasons).toEqual(['PAGE_ROTATION_UNSUPPORTED']);
    const scan = await read('0 0 100 100 re f');
    expect(reconstructNativeCellRegion(scan, { page: 1, box: { left: 20, bottom: 20, right: 500, top: 800 } }).reasons).toEqual(['NO_NATIVE_TEXT']);
    // Small positive text scale keeps all 60,001 characters within the page;
    // otherwise PDF.js discards out-of-view content before our budget is reached.
    const truncated = await read(`BT /F1 0.001 Tf 40 750 Td (${'7'.repeat(60_001)}) Tj ET`);
    expect(truncated.pages[0].truncated).toBe(true);
    expect(reconstructNativeCellRegion(truncated, { page: 1, box: { left: 20, bottom: 20, right: 500, top: 800 } }).reasons).toEqual(['PAGE_TRUNCATED']);
  }, 45000);

  it('blocks multiline and duplicate-overprint order rather than assigning table ownership', async () => {
    const multiline = await read('BT /F1 12 Tf 1 0 0 1 40 750 Tm (10 min) Tj 1 0 0 1 40 730 Tm (at 23 C) Tj ET');
    expect(reconstructNativeCellRegion(multiline, { page: 1, box: boxAround(multiline.pages[0].runs.filter(run => run.str.length)) }).reasons).toEqual(['MULTIPLE_BASELINES_UNSUPPORTED']);
    const overprint = await read('BT /F1 12 Tf 1 0 0 1 40 750 Tm (AX-041N) Tj /F2 12 Tf 1 0 0 1 40 750 Tm (BX-062N) Tj ET');
    expect(reconstructNativeCellRegion(overprint, { page: 1, box: boxAround(overprint.pages[0].runs.filter(run => run.str.length)) }).reasons).toEqual(['OVERLAPPING_ORDER_AMBIGUOUS']);
  });

  it('rejects invalid signatures/pages and keeps intentionally selected coverage distinct from truncation', async () => {
    await expect(readNativePdfSnapshot('bad.pdf', new TextEncoder().encode('not PDF input').buffer, { pages: [1] })).rejects.toThrow('PDF_SIGNATURE_INVALID');
    await expect(readNativePdfSnapshot('fixture.pdf', nativePdfFixture(splitNumber), { pages: [1, 1] })).rejects.toThrow('PDF_NATIVE_PAGE_SELECTION_INVALID');
    await expect(readNativePdfSnapshot('fixture.pdf', nativePdfFixture(splitNumber), { pages: [2] })).rejects.toThrow('PDF_NATIVE_PAGE_OUT_OF_RANGE');
    const snapshot = await read();
    expect(snapshot.pages[0].truncated).toBe(false);
    expect(reconstructNativeCellRegion(snapshot, { page: 2, box: { left: 20, bottom: 700, right: 500, top: 800 } }).reasons).toEqual(['PAGE_NOT_SELECTED']);
  });
});
