import type { Cell, TableModel } from '../domain/editorial-model';
import { cellIndex, getCellKey } from '../table/table-model';
import { cumulative } from '../table/table-layout';
import { compareDecimal, ptToQ, sum } from '../domain/physical';
import { diagnostic, VNextError, type Diagnostic } from '../domain/diagnostics';
import type { EdgeCandidate, ResolvedStyle, Side } from './style';
export interface PaintEdge {
  id:string;orientation:'horizontal'|'vertical';ownerCellId:string;ownerSide:Side;
  xQ:number;yQ:number;widthQ:number;heightQ:number;thicknessQ:number;color:string;
}
interface SolidCandidate {thicknessQ:number;thicknessPt:number;color:string;sourceLevel:number}
function solid(candidate:EdgeCandidate|undefined):SolidCandidate|undefined {
  if(!candidate||candidate.border.pattern==='none')return undefined;
  if(candidate.border.pattern!=='solid')throw new VNextError('UNSUPPORTED_BORDER_PATTERN');
  return {thicknessQ:ptToQ(candidate.border.thicknessPt),thicknessPt:candidate.border.thicknessPt,color:candidate.border.color,sourceLevel:candidate.sourceLevel};
}
export function chooseBorder(leading:EdgeCandidate|undefined,trailing:EdgeCandidate|undefined):SolidCandidate|undefined {
  const a=solid(leading),b=solid(trailing);
  if(!a)return b;if(!b)return a;
  const comparison=a.thicknessQ-b.thicknessQ || compareDecimal(a.thicknessPt,b.thicknessPt) || a.sourceLevel-b.sourceLevel;
  return comparison>0?a:b;
}
export function buildPaint(table:TableModel,trackQ:readonly number[],rowQ:readonly number[],styles:ReadonlyMap<string,ResolvedStyle>):{edges:PaintEdge[];diagnostics:Diagnostic[];suppressed:string[]} {
  const x=cumulative(trackQ),y=cumulative(rowQ),frameQ=sum(trackQ),heightQ=sum(rowQ);
  const index=cellIndex(table),byId=new Map(table.cells.map(c=>[c.id,c]));
  const slot=(r:number,c:number):Cell=>{
    const cell=index.get(getCellKey(table.rows[r].id,table.columns[c].id))!;
    return cell.coveredBy?byId.get(cell.coveredBy)!:cell;
  };
  const style=(cell:Cell):ResolvedStyle=>{const s=styles.get(cell.id);if(!s)throw new VNextError('STYLE_UNRESOLVED');return s;};
  const edges:PaintEdge[]=[],diagnostics:Diagnostic[]=[],suppressed:string[]=[];
  function emit(id:string,orientation:'horizontal'|'vertical',r:number,c:number,leading:Cell|undefined,trailing:Cell|undefined):void {
    if(leading && trailing && leading.id===trailing.id){suppressed.push(id);return;}
    const vertical=orientation==='vertical';
    const leadSide=vertical?'right':'bottom',trailSide=vertical?'left':'top';
    const chosen=chooseBorder(leading?style(leading).edges[leadSide]:undefined,trailing?style(trailing).edges[trailSide]:undefined);
    if(!chosen)return;
    const owner=trailing??leading!,ownerSide=trailing?trailSide:leadSide,t=chosen.thicknessQ;
    const ownerRow=Math.min(r,rowQ.length-1),ownerCol=Math.min(c,trackQ.length-1);
    if(t>trackQ[ownerCol]||t>rowQ[ownerRow]||t>frameQ||t>heightQ)throw new VNextError('BORDER_PAINT_GEOMETRY_INVALID',id);
    const edge:PaintEdge={id,orientation,ownerCellId:owner.id,ownerSide,
      xQ:vertical?(c===trackQ.length?frameQ-t:x[c]):x[c],
      yQ:vertical?y[r]:(r===rowQ.length?heightQ-t:y[r]),
      widthQ:vertical?t:trackQ[c],heightQ:vertical?rowQ[r]:t,thicknessQ:t,color:chosen.color};
    if(edge.xQ<0||edge.yQ<0||edge.xQ+edge.widthQ>frameQ||edge.yQ+edge.heightQ>heightQ)throw new VNextError('BORDER_PAINT_GEOMETRY_INVALID',id);
    if(style(owner).paddingQ[ownerSide]<t)diagnostics.push(diagnostic('BORDER_CONTENT_CLEARANCE',id,{severity:'WARNING',tableId:table.id,cellId:owner.id}));
    edges.push(edge);
  }
  // Frozen crossing rule: every horizontal segment before every vertical segment.
  for(let r=0;r<=rowQ.length;r++)for(let c=0;c<trackQ.length;c++)
    emit(`h:${r}:${c}`,'horizontal',r,c,r?slot(r-1,c):undefined,r<rowQ.length?slot(r,c):undefined);
  for(let c=0;c<=trackQ.length;c++)for(let r=0;r<rowQ.length;r++)
    emit(`v:${c}:${r}`,'vertical',r,c,c?slot(r,c-1):undefined,c<trackQ.length?slot(r,c):undefined);
  return {edges,diagnostics,suppressed};
}
