import type { Border, Cell, CellStyle, DocumentStyle, TableModel } from './proof-model';
import { mmToU, uToQ } from './physical';
import { ProofError } from './diagnostics';
export const sides=['top','right','bottom','left'] as const;
export type Side=typeof sides[number];
export interface EdgeCandidate {border:Border;sourceLevel:number}
export interface ResolvedStyle {
  fontFamily:string;fontSizePt:number;lineHeight:number;fontWeight:400|700;
  color:string;background:string;textAlign:'left'|'center'|'right';
  paddingQ:{top:number;right:number;bottom:number;left:number};
  edges:{top:EdgeCandidate;right:EdgeCandidate;bottom:EdgeCandidate;left:EdgeCandidate};
}
function definedMerge<T extends object>(base:T,patch:T):T {
  const next={...base};
  for(const key of Object.keys(patch) as (keyof T)[])if(patch[key]!==undefined)next[key]=patch[key];
  return next;
}
export function resolveStyle(defaults:CellStyle,layers:readonly (CellStyle|undefined)[]):ResolvedStyle {
  let style:CellStyle={...defaults};
  const none:EdgeCandidate={border:{pattern:'none'},sourceLevel:0};
  const edges={top:none,right:none,bottom:none,left:none};
  // Document defaults supply typography/padding. Table candidates begin at level 0.
  layers.forEach((layer,sourceLevel)=>{
    if(!layer)return;
    style={...definedMerge(style,layer),paddingMm:definedMerge(style.paddingMm??{},layer.paddingMm??{})};
    for(const side of sides)if(layer.borders?.[side])edges[side]={border:layer.borders[side]!,sourceLevel};
  });
  if(!style.fontFamily || !style.fontSizePt || !style.lineHeight)throw new ProofError('STYLE_UNRESOLVED');
  return {fontFamily:style.fontFamily,fontSizePt:style.fontSizePt,lineHeight:style.lineHeight,
    fontWeight:style.fontWeight??400,color:style.color??'#172B3A',background:style.background??'#FFFFFF',textAlign:style.textAlign??'left',
    paddingQ:{top:uToQ(mmToU(style.paddingMm?.top??0)),right:uToQ(mmToU(style.paddingMm?.right??0)),bottom:uToQ(mmToU(style.paddingMm?.bottom??0)),left:uToQ(mmToU(style.paddingMm?.left??0))},edges};
}
export function resolveCellStyle(documentStyle:DocumentStyle,table:TableModel,cell:Cell):ResolvedStyle {
  const row=table.rows.find(r=>r.id===cell.rowId),column=table.columns.find(c=>c.id===cell.columnId);
  if(!row||!column)throw new ProofError('CELL_COORDINATE_INVALID');
  return resolveStyle(documentStyle.defaultText,[table.style.base,table.style.rowRoles[row.role],column.style,row.style,cell.style]);
}
export function resolveWrap(cell:Cell):'wrap'|'nowrap' {
  return cell.contentPresentation?.wrapPolicy??(cell.content.type==='technicalCode'?'nowrap':'wrap');
}
