import { describe, expect, it } from 'vitest';
import { mmToU, minimumUForProjectedQ, pxToQ, ptToQ, uToQ, qToU, qCss } from '@/labs/presys-editorial-proof/physical';
import { projectRows, resolveColumns, projectTracks, resolveRows } from '@/labs/presys-editorial-proof/proof-layout';
import { tableHeightOverflows, textObjectOverflows } from '@/labs/presys-editorial-proof/proof-preflight';
import type { Row } from '@/labs/presys-editorial-proof/proof-model';

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
  it('inverts projected Q as the exact monotone lower bound', () => {
    expect(minimumUForProjectedQ(0)).toBe(0);
    expect(minimumUForProjectedQ(4838)).toBe(199988);
    expect(minimumUForProjectedQ(4839)).toBe(200030);
    for(const q of [1,2,3,4838,4839,9864,24189]) {
      const u=minimumUForProjectedQ(q);
      expect(uToQ(u)).toBeGreaterThanOrEqual(q);
      if(u>0)expect(uToQ(u-1)).toBeLessThan(q);
    }
  });
});

describe('conservative columns and projection-safe rows', () => {
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
  it('T-Q-ROW-01: fixed 20 mm accepts exact 4838 Q content', () => {
    const rows:Row[]=[{id:'fixed',role:'body',heightPolicy:{mode:'FIXED_MM',heightMm:20}}];
    const result=resolveRows(rows,[{cellId:'exact',row:0,column:0,span:1,requiredQ:4838}]);
    expect(result.heightsU).toEqual([200000]);
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({code:'ROW_CONTENT_OVERFLOW'}));
  });
  it('T-Q-ROW-02: fixed 20 mm blocks one Q above capacity', () => {
    const rows:Row[]=[{id:'fixed',role:'body',heightPolicy:{mode:'FIXED_MM',heightMm:20}}];
    expect(resolveRows(rows,[{cellId:'over',row:0,column:0,span:1,requiredQ:4839}]).diagnostics)
      .toContainEqual(expect.objectContaining({code:'ROW_CONTENT_OVERFLOW',cellId:'over'}));
  });
  it('T-Q-PHASE-01: non-zero cumulative phase receives enough U for the actual boundary delta', () => {
    const rows:Row[]=[
      {id:'prefix',role:'body',heightPolicy:{mode:'FIXED_MM',heightMm:.0021}},
      {id:'grow',role:'body',heightPolicy:{mode:'AUTO'}},
    ];
    const result=resolveRows(rows,[{cellId:'phase',row:1,column:0,span:1,requiredQ:4838}]);
    expect(result.heightsU).toEqual([21,200009]);
    const projected=projectRows(result.heightsU);
    expect(projected.boundariesQ[2]-projected.boundariesQ[1]).toBe(4838);
  });
  it('T-Q-SPAN-01/02: all-fixed rowspan uses cumulative Q equality and blocks one Q above', () => {
    const rows:Row[]=[0,1].map(i=>({id:'f'+i,role:'body' as const,heightPolicy:{mode:'FIXED_MM' as const,heightMm:10}}));
    expect(resolveRows(rows,[{cellId:'exact-span',row:0,column:0,span:2,requiredQ:4838}]).diagnostics).toEqual([]);
    expect(resolveRows(rows,[{cellId:'over-span',row:0,column:0,span:2,requiredQ:4839}]).diagnostics)
      .toContainEqual(expect.objectContaining({code:'ROW_CONTENT_OVERFLOW',cellId:'over-span'}));
  });
  it('compares final table overflow in Q without a false Q to U round-trip', () => {
    expect(uToQ(200000)).toBe(4838);
    expect(qToU(4838)).toBe(200008);
    expect(tableHeightOverflows(4838,200000)).toBe(false);
    expect(tableHeightOverflows(4839,200000)).toBe(true);
  });
  it('T-Q-TEXT-01/02: text-object fit uses projected Q equality', () => {
    expect(textObjectOverflows({widthQ:4838,heightQ:4838},200000,200000)).toBe(false);
    expect(textObjectOverflows({widthQ:4839,heightQ:4838},200000,200000)).toBe(true);
    expect(textObjectOverflows({widthQ:4838,heightQ:4839},200000,200000)).toBe(true);
  });
});
