// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MAX_NATIVE_SELECTED_PAGES, readNativePdfSnapshot, reconstructNativeCellRegion,
  type NativePdfBox, type NativePdfRun,
} from '@/vnext/ai-catalog/pdf-native-provenance';
import { nativePdfFixture } from './native-pdf-fixture';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

const ordinary = 'BT /F1 12 Tf 1 0 0 1 40 750 Tm (AX-041N) Tj ET';
const rotated = 'BT /F2 12 Tf 0.7071 0.7071 -0.7071 0.7071 80 748 Tm (presys) Tj ET';
function boxAround(runs: readonly NativePdfRun[]): NativePdfBox {
  return {
    left: Math.min(...runs.map(run => run.metricBox!.left)),
    bottom: Math.min(...runs.map(run => run.metricBox!.bottom)),
    right: Math.max(...runs.map(run => run.metricBox!.right)),
    top: Math.max(...runs.map(run => run.metricBox!.top)),
  };
}
async function read(operators: string, options: Parameters<typeof nativePdfFixture>[1] = {}) {
  return readNativePdfSnapshot('original-independent-fixture.pdf', nativePdfFixture(operators, options), { pages: [1] });
}

describe('independent native-reader trust boundary', () => {
  it('cannot mutate an issued snapshot hash, literals or geometry through nested references', async () => {
    const snapshot = await read(ordinary);
    const page = snapshot.pages[0], run = page.runs.find(item => item.str === 'AX-041N')!;
    const beforeHash = snapshot.sha256, beforeBox = { ...run.metricBox! };
    expect(Reflect.set(snapshot, 'sha256', '0'.repeat(64))).toBe(false);
    expect(Reflect.set(page.view, 0, -999)).toBe(false);
    expect(Reflect.set(run, 'str', 'BX-062N')).toBe(false);
    expect(Reflect.set(run.transform, 4, -999)).toBe(false);
    expect(Reflect.set(run.metricBox!, 'left', -999)).toBe(false);
    expect(Reflect.set(run.font!, 'ascent', -999)).toBe(false);
    expect(Reflect.set(run, 'evidenceRole', 'artifact')).toBe(false);
    expect(Reflect.set(run.markedTags, 0, 'Artifact')).toBe(false);
    expect(Reflect.set(page.markedContent, 'operatorsBalanced', false)).toBe(false);
    const result = reconstructNativeCellRegion(snapshot, { page: 1, box: beforeBox, expectedRunIds: [run.id] });
    expect(result.status).toBe('LITERAL');
    expect(result.sha256).toBe(beforeHash);
    expect(result.rawLiteral).toBe('AX-041N');
    expect(result.runs[0].metricBox).toEqual(beforeBox);
  });

  it.each([
    { left: NaN, bottom: 0, right: 100, top: 100 },
    { left: 0, bottom: 0, right: 100, top: Infinity },
    { left: 50, bottom: 0, right: 50, top: 100 },
  ])('rejects nonfinite or zero-area region coordinates without changing the issued snapshot', async box => {
    const snapshot = await read(ordinary);
    const result = reconstructNativeCellRegion(snapshot, { page: 1, box });
    expect(result.status).toBe('BLOCKED');
    expect(result.reasons).toContain('REGION_INVALID');
    expect(snapshot.pages[0].runs.some(run => run.str === 'AX-041N')).toBe(true);
  });

  it.each([{ pages: [] }, { pages: [0] }, { pages: Array.from({ length: MAX_NATIVE_SELECTED_PAGES + 1 }, (_, index) => index + 1) }])(
    'rejects empty, invalid or over-budget selected-page coverage before returning a snapshot', async ({ pages }) => {
      await expect(readNativePdfSnapshot('original.pdf', nativePdfFixture(ordinary), { pages })).rejects.toThrow('PDF_NATIVE_PAGE_SELECTION_INVALID');
    },
  );

  it('preserves a Unicode ligature rather than converting its parser string into an expanded value', async () => {
    const snapshot = await read('BT /F1 12 Tf 40 750 Td (A) Tj ET', { unicodeHex: 'FB01' });
    const runs = snapshot.pages[0].runs.filter(run => /\S/u.test(run.str));
    expect(runs.map(run => run.str)).toEqual(['\uFB01']);
    const result = reconstructNativeCellRegion(snapshot, { page: 1, box: boxAround(runs) });
    expect(result.rawLiteral).toBe('\uFB01');
    expect(result.rawLiteral).not.toBe('fi');
    expect(result.purpose).toBe('native-pdf-diagnostic-only');
  });

  it('keeps a supplementary private-use glyph intact and blocks it instead of substituting a public symbol', async () => {
    const snapshot = await read('BT /F1 12 Tf 40 750 Td (A) Tj ET', { unicodeHex: 'DB80DC01' });
    const runs = snapshot.pages[0].runs.filter(run => /\S/u.test(run.str));
    expect(runs.map(run => run.str)).toEqual(['\u{F0001}']);
    const result = reconstructNativeCellRegion(snapshot, { page: 1, box: boxAround(runs) });
    expect(result.status).toBe('BLOCKED');
    expect(result.reasons).toContain('PRIVATE_USE_GLYPH');
    expect(result.rawLiteral).toBe('\u{F0001}');
  });
});

describe('independent native Artifact exclusion controls', () => {
  it.each([
    { name: 'ordinary rotated text named presys', operators: rotated },
    { name: 'Artifact written as text rather than an actual content marker', operators: rotated.replace('(presys)', '(presys /Artifact)') },
    { name: 'non-Artifact native Span tag', operators: `/Span BMC ${rotated} EMC` },
  ])('does not give $name authority to bypass unsupported geometry', async ({ operators }) => {
    const snapshot = await read(`${ordinary} ${operators}`);
    const runs = snapshot.pages[0].runs.filter(run => run.str === 'AX-041N');
    const result = reconstructNativeCellRegion(snapshot, { page: 1, box: boxAround(runs) });
    expect(result.status).toBe('BLOCKED');
    expect(result.reasons).toContain('RUN_GEOMETRY_UNSUPPORTED');
    expect(snapshot.pages[0].runs.some(run => run.str.includes('presys'))).toBe(true);
  });

  it.each([
    { name: 'Artifact opener without its closing operator', operators: `/Artifact BMC ${rotated}` },
    { name: 'extra closing operator hidden from getTextContent before a balanced Artifact', operators: `EMC /Artifact BMC ${rotated} EMC` },
    { name: 'nested text content tags outside the supported one-level association', operators: `/Artifact BMC /Span BMC ${rotated} EMC EMC` },
  ])('blocks $name instead of acquiring exclusion authority', async ({ operators }) => {
    const snapshot = await read(`${ordinary} ${operators}`);
    const runs = snapshot.pages[0].runs.filter(run => run.str === 'AX-041N');
    const result = reconstructNativeCellRegion(snapshot, { page: 1, box: boxAround(runs) });
    expect(result.status).toBe('BLOCKED');
    expect(snapshot.pages[0].runs.some(run => run.str.includes('presys'))).toBe(true);
    expect(result.purpose).toBe('native-pdf-diagnostic-only');
  });
});
