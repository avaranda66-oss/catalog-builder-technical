import { describe, expect, it } from 'vitest';
import { mmToU, pxToQ, ptToQ, uToQ, qToU, qCss } from '@/labs/presys-editorial-proof/physical';
import { resolveColumns, projectTracks, resolveRows } from '@/labs/presys-editorial-proof/proof-layout';
import { tableHeightOverflows } from '@/labs/presys-editorial-proof/proof-preflight';

describe('normative physical arithmetic', () => {
  it.each([[1.23444,12344],[1.23445,12345],[-1.23445,-12345],[1e-7,0],[5e-5,1],[-5e-5,-1],[8.4667,84667],[9.99995,100000],[2.5e3,25000000]])('%s mm → %s U', (mm,u) => expect(mmToU(mm)).toBe(u));
  it('rejects nonfinite and unsafe magnitudes', () => {
    expect(() => mmToU(Infinity)).toThrow('PHYSICAL_LENGTH_INVALID');
    expect(() => mmToU(1e12)).toThrow('PHYSICAL_ARITHMETIC_OVERFLOW');
    expect(() => uToQ(Number.MAX_SAFE_INTEGER)).toThrow('PHYSICAL_ARITHMETIC_OVERFLOW');
  });
  it('projects scalar and CSS decimals with signed ties', () => {
    expect(uToQ(1000000)).toBe(24189);
    expect(pxToQ(-0.0078125)).toBe(-1);
    expect(pxToQ(0.015625)).toBe(1);
    expect(qCss(85)).toBe('1.328125px');
    expect(qToU(384)).toBe(15875);
    expect([.25,1,2].map(ptToQ)).toEqual([21,85,171]);
  });
});

describe('conservative columns and frozen rows', () => {
  it('rejects the required 100 versus 70+50+20 counterexample', () => {
    expect(resolveColumns([
      {id:'a',width:{mode:'fixed',mm:70},minMm:1},
      {id:'b',width:{mode:'fixed',mm:50},minMm:1},
      {id:'c',width:{mode:'flex',weight:1},minMm:20},
    ],100)).toMatchObject({ok:false,code:'TABLE_WIDTH_INFEASIBLE'});
  });
  it('apportions frame Q exactly with stable ties', () => {
    expect(projectTracks([500000,500000],1000000)).toEqual({frameQ:24189,trackQ:[12095,12094]});
    expect(() => projectTracks([1,999999],1000000)).toThrow('TRACK_PROJECTION_NONPOSITIVE');
  });
  it('never grows a fixed row and preserves every integer U at the interval boundary', () => {
    const rows = [{id:'r0',role:'body' as const,heightPolicy:{mode:'AUTO' as const}},
      {id:'r1',role:'body' as const,heightPolicy:{mode:'FIXED_MM' as const,heightMm:1}},
      {id:'r2',role:'body' as const,heightPolicy:{mode:'AUTO' as const}}];
    const result = resolveRows(rows,[10000,10000,10000],[{cellId:'a',row:0,column:0,span:3,requiredU:30003}]);
    expect(result.heightsU).toEqual([10000,10000,10003]);
    expect(resolveRows(rows,[1,10001,1],[]).diagnostics).toContainEqual(expect.objectContaining({code:'ROW_CONTENT_OVERFLOW'}));
  });
  it('compares final table overflow in Q without a false Q to U round-trip', () => {
    expect(uToQ(200000)).toBe(4838);
    expect(qToU(4838)).toBe(200008);
    expect(tableHeightOverflows(4838,200000)).toBe(false);
    expect(tableHeightOverflows(4839,200000)).toBe(true);
  });
});
