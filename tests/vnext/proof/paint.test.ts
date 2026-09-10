import {describe,it,expect} from 'vitest';
import {emptyTable,documentStyle} from './test-data';
import {buildPaint,chooseBorder} from '@/vnext/rendering/border-paint';
import {resolveCellStyle} from '@/vnext/rendering/style';
import {mergeCells} from '@/vnext/table/table-model';
import {projectTracks} from '@/vnext/table/table-layout';
describe('paint-only borders',()=>{
  it.each([.25,1,2])('keeps 100mm frame and unequal tracks invariant at %s pt',pt=>{
    const table=emptyTable(2,3);
    for(const edge of Object.values(table.style.base.borders!))if(edge?.pattern==='solid')edge.thicknessPt=pt;
    const {trackQ,frameQ}=projectTracks([200000,300000,500000],1000000);
    const styles=new Map(table.cells.map(c=>[c.id,resolveCellStyle(documentStyle,table,c)]));
    const {edges}=buildPaint(table,trackQ,[1000,1500],styles);
    expect(trackQ).toEqual([4838,7257,12094]);expect(frameQ).toBe(24189);
    expect(edges).toHaveLength(17);
    const t=pt===.25?21:pt===1?85:171;
    expect(edges.find(e=>e.id==='v:3:1')).toMatchObject({xQ:frameQ-t,widthQ:t});
    expect(edges.find(e=>e.id==='h:2:2')).toMatchObject({yQ:2500-t,heightQ:t});
    expect(edges.find(e=>e.id==='v:1:0')).toMatchObject({xQ:4838,widthQ:t,ownerCellId:'cell0-1'});
    expect(edges.every(e=>e.xQ>=0 && e.yQ>=0 && e.xQ+e.widthQ<=frameQ && e.yQ+e.heightQ<=2500)).toBe(true);
  });
  it.each([[1,2,1],[2,1,1],[2,2,4]])('suppresses %s×%s span interior atomic edges', (r,c,count)=>{
    const table=mergeCells(emptyTable(2,2),'cell0-0',r,c);
    const styles=new Map(table.cells.filter(c=>!c.coveredBy).map(c=>[c.id,resolveCellStyle(documentStyle,table,c)]));
    const result=buildPaint(table,[1000,2000],[1000,2000],styles);
    expect(result.suppressed).toHaveLength(count);expect(result.edges).toHaveLength(12-count);
  });
  it('resolves thickness Q, then rational pt, then source, then trailing color',()=>{
    const candidate=(pt:number,sourceLevel:number,color:string)=>({border:{pattern:'solid' as const,thicknessPt:pt,color},sourceLevel});
    expect(chooseBorder(candidate(1,4,'#111111'),candidate(2,0,'#222222'))?.color).toBe('#222222');
    expect(chooseBorder(candidate(1.001,0,'#111111'),candidate(1,4,'#222222'))?.color).toBe('#111111');
    expect(chooseBorder(candidate(1,4,'#111111'),candidate(1,3,'#222222'))?.color).toBe('#111111');
    expect(chooseBorder(candidate(1,4,'#111111'),candidate(1,4,'#222222'))?.color).toBe('#222222');
  });
});
