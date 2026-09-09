import {describe,it,expect} from 'vitest';
import {compareSnapshots,type LayoutSnapshot} from '@/vnext/rendering/measurement';
import {pxToQ} from '@/vnext/domain/physical';
describe('canonical snapshot equality',()=>{
  const source:LayoutSnapshot={geometryDiagnostics:[],facts:[
    {kind:'page',pageId:'p',authoredWidthU:2100000,authoredHeightU:2970000,widthQ:50800,heightQ:71841},
    {kind:'cell',pageId:'p',tableId:'t',cellId:'c',xQ:0,yQ:0,widthQ:1000,heightQ:200,intrinsicContentWidthQ:800,intrinsicContentHeightQ:180,textFlowSignature:'a'.repeat(64)},
  ]};
  it('accepts exact facts and raw subquantum noise only when it normalizes identically',()=>{
    expect(pxToQ(1.00001)).toBe(pxToQ(1.00002));
    expect(compareSnapshots(source,structuredClone(source))).toEqual([]);
  });
  it('rejects a single Q, altered run flow, and missing/new identities',()=>{
    const changed=structuredClone(source),cell=changed.facts[1];
    if(cell.kind!=='cell')throw Error('Fixture');
    cell.widthQ++;
    expect(compareSnapshots(source,changed)).toHaveLength(1);
    cell.widthQ--;cell.textFlowSignature='b'.repeat(64);
    expect(compareSnapshots(source,changed)[0].code).toBe('LAYOUT_UNSTABLE');
    expect(compareSnapshots(source,{...source,facts:source.facts.slice(1)})).toHaveLength(1);
    expect(compareSnapshots({...source,facts:source.facts.slice(1)},source)).toHaveLength(1);
  });
});
