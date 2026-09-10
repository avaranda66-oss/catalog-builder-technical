import {describe,it,expect} from 'vitest';
import {mmToU,pxToQ,ptToQ,qCss,qToU,uToQ,compareDecimal} from '@/vnext/domain/physical';
import {projectRows,resolveColumns,resolveRows,projectTracks} from '@/vnext/table/table-layout';
import type {Column,Row} from '@/vnext/domain/editorial-model';
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
  const spanQ=(heightsU:readonly number[],row:number,span:number)=>{
    const boundaries=projectRows(heightsU).boundariesQ;
    return boundaries[row+span]-boundaries[row];
  };
  it('retains the R0.1.3 Astra overlapping-rowspan regression under R0.1.4 Q constraints',()=>{
    const rows:Row[]=[0,1,2].map(i=>({id:'r'+i,role:'body',heightPolicy:{mode:'MIN_MM',minMm:10}}));
    const constraints=[{cellId:'a',row:0,column:0,span:2,requiredQ:9864},{cellId:'b',row:1,column:1,span:2,requiredQ:9864}];
    expect(qToU(9864)).toBe(407789);
    const result=resolveRows(rows,constraints);
    expect(result.heightsU).toEqual([100000,307769,100004]);
    expect(result.heightsU.reduce((a,b)=>a+b,0)).toBe(507773);
    expect(result.heightsU.reduce((a,b)=>a+b,0)).toBeLessThan(550000);
    for(const c of constraints)expect(spanQ(result.heightsU,c.row,c.span)).toBeGreaterThanOrEqual(c.requiredQ);
    expect(resolveRows(rows,[...constraints].reverse())).toEqual(result);
  });
  it('handles simple, crossing-fixed and zero-deficit spans without shrinking authored minima',()=>{
    const simple:Row[]=[0,1].map(i=>({id:'s'+i,role:'body',heightPolicy:{mode:'MIN_MM',minMm:.01}}));
    expect(resolveRows(simple,[{cellId:'simple',row:0,column:0,span:2,requiredQ:6}]).heightsU).toEqual([100,128]);
    const crossing:Row[]=[
      {id:'a',role:'body',heightPolicy:{mode:'MIN_MM',minMm:.01}},
      {id:'f',role:'body',heightPolicy:{mode:'FIXED_MM',heightMm:.01}},
      {id:'b',role:'body',heightPolicy:{mode:'MIN_MM',minMm:.01}},
    ];
    const cross=resolveRows(crossing,[{cellId:'cross',row:0,column:0,span:3,requiredQ:11}]);
    expect(cross.heightsU).toEqual([100,100,235]);
    expect(spanQ(cross.heightsU,0,3)).toBe(11);
    expect(resolveRows(simple,[{cellId:'zero',row:0,column:0,span:2,requiredQ:5}]).heightsU).toEqual([100,100]);
  });
  it('reports an impossible projected deficit when every covered row is fixed',()=>{
    const fixed:Row[]=[0,1].map(i=>({id:'f'+i,role:'body',heightPolicy:{mode:'FIXED_MM',heightMm:.01}}));
    const result=resolveRows(fixed,[{cellId:'blocked',row:0,column:0,span:2,requiredQ:6}]);
    expect(result.heightsU).toEqual([100,100]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'ROW_CONTENT_OVERFLOW',cellId:'blocked'}));
  });
  it('solves nested and same-start Q constraints globally',()=>{
    const rows:Row[]=[0,1,2,3].map(i=>({id:'n'+i,role:'body',heightPolicy:{mode:'MIN_MM',minMm:.01}}));
    const constraints=[
      {cellId:'outer',row:0,column:2,span:4,requiredQ:17},
      {cellId:'same-start',row:0,column:1,span:2,requiredQ:8},
      {cellId:'nested',row:1,column:0,span:2,requiredQ:12},
    ];
    const result=resolveRows(rows,constraints);
    for(const c of constraints)expect(spanQ(result.heightsU,c.row,c.span)).toBeGreaterThanOrEqual(c.requiredQ);
    expect(resolveRows(rows,[constraints[2],constraints[0],constraints[1]])).toEqual(result);
    expect(resolveRows(rows,[...constraints].reverse())).toEqual(result);
    const positiveGrowth=result.heightsU.map(h=>h-100).findIndex(x=>x>0);
    expect(positiveGrowth).toBeGreaterThanOrEqual(0);
  });
  it('T-Q-GROWABLE-SPAN-01: overlapping spans at awkward phase use minimum deterministic projected growth',()=>{
    const rows:Row[]=[
      {id:'prefix',role:'body',heightPolicy:{mode:'FIXED_MM',heightMm:.0021}},
      {id:'a',role:'body',heightPolicy:{mode:'MIN_MM',minMm:10}},
      {id:'b',role:'body',heightPolicy:{mode:'AUTO'}},
      {id:'c',role:'body',heightPolicy:{mode:'MIN_MM',minMm:10}},
    ];
    const constraints=[
      {cellId:'left',row:1,column:0,span:2,requiredQ:7000},
      {cellId:'right',row:2,column:1,span:2,requiredQ:7000},
      {cellId:'whole',row:1,column:2,span:3,requiredQ:12000},
    ];
    const result=resolveRows(rows,constraints);
    expect(result.heightsU).toEqual([21,100000,189388,206706]);
    for(const c of constraints)expect(spanQ(result.heightsU,c.row,c.span)).toBeGreaterThanOrEqual(c.requiredQ);
    expect(resolveRows(rows,[constraints[2],constraints[0],constraints[1]])).toEqual(result);
    expect(resolveRows(rows,[...constraints].reverse())).toEqual(result);
    for(let i=1;i<result.heightsU.length;i++)if(result.heightsU[i]>(i===2?0:100000)) {
      const reduced=[...result.heightsU];reduced[i]--;
      expect(constraints.some(c=>spanQ(reduced,c.row,c.span)<c.requiredQ)).toBe(true);
    }
  });
});
