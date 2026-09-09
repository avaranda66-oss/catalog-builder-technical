import {describe,it,expect} from 'vitest';
import {mmToU,pxToQ,ptToQ,qCss,uToQ,compareDecimal} from '@/labs/presys-editorial-proof/physical';
import {resolveColumns,resolveRows,projectTracks} from '@/labs/presys-editorial-proof/proof-layout';
import type {Column,Row} from '@/labs/presys-editorial-proof/proof-model';
describe('independent arithmetic edge cases',()=>{
  it('exercises fifth-digit ties across carries, signs and scientific notation',()=>{
    for(const sign of [1,-1])for(const [input,expected] of [[.000049999999,0],[.000050000001,1],[.99995,10000],[10.00005,100001],[123.45675,1234568],[1.2345e-2,123],[1.2345e2,1234500],[1e-300,0],[1e-4,1]])
      expect(mmToU(sign*input)).toBe(expected===0?0:sign*expected);
    expect(mmToU(-0)).toBe(0);
    expect(()=>mmToU(NaN)).toThrow('PHYSICAL_LENGTH_INVALID');
    expect(()=>mmToU(Number.MAX_VALUE)).toThrow('PHYSICAL_ARITHMETIC_OVERFLOW');
    expect(()=>ptToQ(.00001)).toThrow('BORDER_THICKNESS_PROJECTS_TO_ZERO');
    expect(compareDecimal(.00012,.00012001)).toBe(-1);
  });
  it('roundtrips 2049 exact CSS Q values including negative half ties',()=>{
    for(let q=-1024;q<=1024;q++)expect(pxToQ(Number(qCss(q).slice(0,-2)))).toBe(q);
    expect(pxToQ(1/128)).toBe(1);expect(pxToQ(-1/128)).toBe(-1);
  });
  it('caps weighted flex then redistributes, with stable largest remainder',()=>{
    const columns:Column[]=[
      {id:'a',minMm:1,maxMm:20,width:{mode:'flex',weight:1}},
      {id:'b',minMm:1,width:{mode:'flex',weight:2}},
      {id:'c',minMm:1,width:{mode:'flex',weight:1}},
    ];
    expect(resolveColumns(columns,100)).toEqual({ok:true,availableTrackWidthU:1000000,widthsU:[200000,530000,270000]});
    const equal:Column[]=[1,2,3].map(i=>({id:String(i),minMm:.0001,width:{mode:'flex',weight:1}}));
    expect(resolveColumns(equal,1)).toMatchObject({ok:true,widthsU:[3334,3333,3333]});
    expect(resolveColumns(columns.map(c=>({...c,maxMm:20})),100)).toMatchObject({ok:false,code:'TABLE_WIDTH_INFEASIBLE'});
    expect(resolveColumns([{id:'x',minMm:1,width:{mode:'fixed',mm:101}}],100)).toMatchObject({ok:false,code:'TABLE_WIDTH_INFEASIBLE'});
  });
  it('rejects invalid limits and unsafe proportional products',()=>{
    expect(resolveColumns([{id:'x',minMm:20,maxMm:10,width:{mode:'flex',weight:1}}],100)).toMatchObject({ok:false,code:'COLUMN_LIMIT_INVALID'});
    expect(resolveColumns([{id:'x',minMm:1,width:{mode:'flex',weight:Number.MAX_SAFE_INTEGER}}],100)).toMatchObject({ok:false,code:'PHYSICAL_ARITHMETIC_OVERFLOW'});
    expect(()=>projectTracks([Number.MAX_SAFE_INTEGER],Number.MAX_SAFE_INTEGER)).toThrow('PHYSICAL_ARITHMETIC_OVERFLOW');
  });
  it('conserves exact width over 250 deterministic heterogeneous cases',()=>{
    for(let n=1;n<=250;n++) {
      const columns:Column[]=Array.from({length:2+n%9},(_,i)=>({id:String(i),minMm:1,width:{mode:'flex',weight:1+(n*(i+3))%17}}));
      const width=50+n/10000,result=resolveColumns(columns,width);
      expect(result.ok).toBe(true);
      if(!result.ok)throw Error(result.code);
      expect(result.widthsU.reduce((a,b)=>a+b,0)).toBe(mmToU(width));
      expect(result.widthsU.every(w=>w>=10000)).toBe(true);
      const projected=projectTracks(result.widthsU,result.availableTrackWidthU);
      expect(projected.trackQ.reduce((a,b)=>a+b,0)).toBe(uToQ(mmToU(width)));
      expect(resolveColumns(columns,width)).toEqual(result);
    }
  });
  it('solves the exact Astra overlapping-rowspan counterexample at minimum total height',()=>{
    const rows:Row[]=[0,1,2].map(i=>({id:'r'+i,role:'body',heightPolicy:{mode:'MIN_MM',minMm:10}}));
    const constraints=[{cellId:'a',row:0,column:0,span:2,requiredU:407789},{cellId:'b',row:1,column:1,span:2,requiredU:407789}];
    const result=resolveRows(rows,[100000,100000,100000],constraints);
    expect(result.heightsU).toEqual([100000,307789,100000]);
    expect(result.heightsU.reduce((a,b)=>a+b,0)).toBe(507789);
    expect(resolveRows(rows,[100000,100000,100000],[...constraints].reverse())).toEqual(result);
  });
  it('handles simple, crossing-fixed and zero-deficit spans without shrinking bases',()=>{
    const simple:Row[]=[0,1].map(i=>({id:'s'+i,role:'body',heightPolicy:{mode:'AUTO'}}));
    expect(resolveRows(simple,[100,100],[{cellId:'simple',row:0,column:0,span:2,requiredU:251}]).heightsU).toEqual([100,151]);
    const crossing:Row[]=[
      {id:'a',role:'body',heightPolicy:{mode:'AUTO'}},
      {id:'f',role:'body',heightPolicy:{mode:'FIXED_MM',heightMm:.01}},
      {id:'b',role:'body',heightPolicy:{mode:'MIN_MM',minMm:.01}},
    ];
    expect(resolveRows(crossing,[100,100,100],[{cellId:'cross',row:0,column:0,span:3,requiredU:451}]).heightsU).toEqual([100,100,251]);
    expect(resolveRows(simple,[100,100],[{cellId:'zero',row:0,column:0,span:2,requiredU:200}]).heightsU).toEqual([100,100]);
  });
  it('reports an impossible positive deficit when every covered row is fixed',()=>{
    const fixed:Row[]=[0,1].map(i=>({id:'f'+i,role:'body',heightPolicy:{mode:'FIXED_MM',heightMm:.01}}));
    const result=resolveRows(fixed,[100,100],[{cellId:'blocked',row:0,column:0,span:2,requiredU:201}]);
    expect(result.heightsU).toEqual([100,100]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'ROW_CONTENT_OVERFLOW',cellId:'blocked'}));
  });
  it('solves nested and same-start constraints globally',()=>{
    const rows:Row[]=[0,1,2,3].map(i=>({id:'n'+i,role:'body',heightPolicy:{mode:'AUTO'}}));
    const constraints=[
      {cellId:'outer',row:0,column:2,span:4,requiredU:700},
      {cellId:'same-start',row:0,column:1,span:2,requiredU:350},
      {cellId:'nested',row:1,column:0,span:2,requiredU:500},
    ];
    const result=resolveRows(rows,[100,100,100,100],constraints);
    expect(result.heightsU).toEqual([100,250,250,100]);
    for(const c of constraints)expect(result.heightsU.slice(c.row,c.row+c.span).reduce((a,b)=>a+b,0)).toBeGreaterThanOrEqual(c.requiredU);
    expect(result.heightsU.reduce((a,b)=>a+b,0)).toBe(700);
  });
  it('uses exact integer-U tie constraints and is invariant to constraint permutation',()=>{
    const rows:Row[]=[0,1,2].map(i=>({id:'t'+i,role:'body',heightPolicy:{mode:'AUTO'}}));
    const constraints=[
      {cellId:'left',row:0,column:0,span:2,requiredU:201},
      {cellId:'right',row:1,column:1,span:2,requiredU:201},
      {cellId:'whole',row:0,column:2,span:3,requiredU:302},
    ];
    const expected=[100,101,101];
    expect(resolveRows(rows,[100,100,100],constraints).heightsU).toEqual(expected);
    expect(resolveRows(rows,[100,100,100],[constraints[2],constraints[0],constraints[1]]).heightsU).toEqual(expected);
    expect(resolveRows(rows,[100,100,100],[...constraints].reverse()).heightsU).toEqual(expected);
  });
});
