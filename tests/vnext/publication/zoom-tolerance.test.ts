import { describe, expect, it } from 'vitest';
import { deviceSnapToleranceQ, mmToU, uToQ } from '@/vnext/domain/physical';
import { tableHeightOverflows, textObjectOverflows } from '@/vnext/publication/preflight';

// Browser zoom / OS display scaling must not block a correct catalog (RENDER_GEOMETRY_MISMATCH by the thousands),
// while 100% keeps the exact physical contract.
describe('deviceSnapToleranceQ', () => {
  it('is zero at 100%, for emulation noise and for invalid ratios, so 100% stays exact', () => {
    for (const ratio of [1, 0.9999999859116286, 1.0000000001, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(deviceSnapToleranceQ(ratio)).toBe(0);
    }
  });

  it.each([[0.9, 73], [1.1, 60], [1.25, 53], [1.5, 44], [2, 33], [1.100000023841858, 60]])(
    'allows one device pixel plus rounding at devicePixelRatio %s (%s Q)', (ratio, toleranceQ) => {
      expect(deviceSnapToleranceQ(ratio)).toBe(toleranceQ);
    });
});

describe('overflow checks with measurement tolerance', () => {
  const frameU = mmToU(20), frameQ = uToQ(frameU);

  it('keep the exact contract by default', () => {
    expect(tableHeightOverflows(frameQ, frameU)).toBe(false);
    expect(tableHeightOverflows(frameQ + 1, frameU)).toBe(true);
    expect(textObjectOverflows({ widthQ: frameQ + 1, heightQ: frameQ }, frameU, frameU)).toBe(true);
  });

  it('ignore rounding inside the tolerance and still catch real overflow', () => {
    expect(tableHeightOverflows(frameQ + 60, frameU, 60)).toBe(false);
    expect(tableHeightOverflows(frameQ + 61, frameU, 60)).toBe(true);
    expect(textObjectOverflows({ widthQ: frameQ + 60, heightQ: frameQ + 60 }, frameU, frameU, 60)).toBe(false);
    expect(textObjectOverflows({ widthQ: frameQ, heightQ: frameQ + 61 }, frameU, frameU, 60)).toBe(true);
  });
});
