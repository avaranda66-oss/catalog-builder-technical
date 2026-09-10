import { CatalogDocumentSchema, TableModelSchema } from '../domain/editorial-model';
import type { AssetRef, CatalogDocument, Cell, Column, Row, TableModel } from '../domain/editorial-model';
import { diagnostic, VNextError, type Diagnostic } from '../domain/diagnostics';
import { mul } from '../domain/physical';

/** Ported verbatim concept from legacy table.types.ts; no legacy runtime import. */
export function getCellKey(rowId:string,columnId:string):string {
  if(!rowId || !columnId) throw new VNextError('CELL_COORDINATE_INVALID');
  return `r${rowId.length}:${rowId}|c${columnId.length}:${columnId}`;
}
export function cellIndex(table:TableModel):Map<string,Cell> {
  return new Map(table.cells.map(c=>[getCellKey(c.rowId,c.columnId),c]));
}
export function orderedAnchors(table:TableModel):Cell[] {
  const index=cellIndex(table);
  return table.rows.flatMap(row=>table.columns.map(column=>index.get(getCellKey(row.id,column.id))!)).filter(cell=>!cell.coveredBy);
}
function unique(ids:string[],out:Diagnostic[],tableId?:string):void {
  const seen=new Set<string>();
  for(const id of ids) {
    if(seen.has(id))out.push(diagnostic('DUPLICATE_ID',id,{tableId}));
    seen.add(id);
  }
}
export function validateTable(input:unknown,assets?:readonly AssetRef[]):Diagnostic[] {
  const parsed=TableModelSchema.safeParse(input);
  if(!parsed.success) return parsed.error.issues.map(i=>diagnostic(
    i.path.includes('pattern')?'UNSUPPORTED_BORDER_PATTERN':i.message.startsWith('PHYSICAL_')?i.message:i.message==='DUPLICATE_ID'?'DUPLICATE_ID':'TABLE_SCHEMA_INVALID',
    i.path.join('.')+': '+i.message));
  const table=parsed.data;
  const out:Diagnostic[]=[];
  const report=(code:string,details:string,cellId?:string)=>out.push(diagnostic(code,details,{tableId:table.id,cellId}));
  unique([table.id,...table.rows.map(r=>r.id),...table.columns.map(c=>c.id),...table.cells.map(c=>c.id),...table.annotations.map(a=>a.id),...table.legend.map(l=>l.id)],out,table.id);
  const rows=new Map(table.rows.map((r,i)=>[r.id,i]));
  const columns=new Map(table.columns.map((c,i)=>[c.id,i]));
  const byId=new Map(table.cells.map(c=>[c.id,c]));
  const index=cellIndex(table);
  if(table.cells.length!==mul(table.rows.length,table.columns.length) || index.size!==table.cells.length)report('TABLE_GRID_INCOMPLETE','Full grid has missing or duplicate coordinates');
  for(const row of table.rows)for(const column of table.columns)
    if(!index.has(getCellKey(row.id,column.id)))report('TABLE_GRID_INCOMPLETE',getCellKey(row.id,column.id));
  const occupancy=new Map<string,string>();
  for(const cell of table.cells) {
    const r=rows.get(cell.rowId),c=columns.get(cell.columnId);
    if(r===undefined || c===undefined){report('CELL_COORDINATE_INVALID','Unknown row or column',cell.id);continue;}
    const rs=cell.span?.rows??1,cs=cell.span?.columns??1;
    if(cell.coveredBy) {
      if(cell.content.type!=='empty' || cell.annotationIds?.length || rs!==1 || cs!==1)report('COVERED_CELL_INVALID','Covered cell carries data, annotation or span',cell.id);
      const anchor=byId.get(cell.coveredBy);
      if(!anchor)report('COVERED_BY_DANGLING',cell.coveredBy,cell.id);
      else if(anchor.coveredBy)report('COVERED_BY_INVALID','CoveredBy must point directly to an anchor',cell.id);
      continue;
    }
    if(r+rs>table.rows.length || c+cs>table.columns.length){report('SPAN_OUT_OF_BOUNDS','Span exceeds grid',cell.id);continue;}
    if(table.rows.slice(r,r+rs).some(row=>(row.role==='header')!==(table.rows[r].role==='header')))
      report('MERGE_HEADER_BOUNDARY','Span crosses header/non-header boundary',cell.id);
    for(let ri=r;ri<r+rs;ri++)for(let ci=c;ci<c+cs;ci++) {
      const key=getCellKey(table.rows[ri].id,table.columns[ci].id);
      if(occupancy.has(key))report('MERGE_OVERLAP','Multiple anchors occupy '+key,cell.id);
      occupancy.set(key,cell.id);
      const covered=index.get(key);
      if(covered && covered.id!==cell.id && covered.coveredBy!==cell.id)report('COVERED_BY_INVALID','Span coverage does not match anchor',covered.id);
    }
  }
  for(const cell of table.cells) {
    if(cell.coveredBy && occupancy.get(getCellKey(cell.rowId,cell.columnId))!==cell.coveredBy)
      report('COVERED_BY_INVALID','Cell is outside referenced span',cell.id);
    if(cell.content.type==='marker') {
      const ref=cell.content.legendEntryId;
      if(!table.legend.some(l=>l.id===ref))report('MARKER_LEGEND_REFERENCE_DANGLING',ref,cell.id);
    }
    if(cell.content.type==='image' && assets) {
      const ref=cell.content.assetId;
      if(!assets.some(a=>a.id===ref))report('ASSET_REFERENCE_DANGLING',ref,cell.id);
    }
  }
  const checkRefs=(refs:readonly string[],cellId?:string)=>{
    const seen=new Set<string>();
    for(const ref of refs) {
      if(seen.has(ref))report('ANNOTATION_REFERENCE_DUPLICATE',ref,cellId);
      seen.add(ref);
      const annotation=table.annotations.find(a=>a.id===ref);
      if(!annotation)report('ANNOTATION_REFERENCE_DANGLING',ref,cellId);
      else if(cellId && annotation.kind==='caption')report('ANNOTATION_SCOPE_INVALID','Cell cannot reference caption',cellId);
    }
  };
  checkRefs(table.annotationIds??[]);
  table.cells.forEach(cell=>checkRefs(cell.annotationIds??[],cell.id));
  return out;
}
export function validateDocument(input:unknown):Diagnostic[] {
  const parsed=CatalogDocumentSchema.safeParse(input);
  if(!parsed.success)return parsed.error.issues.map(i=>diagnostic(i.path.includes('pattern')?'UNSUPPORTED_BORDER_PATTERN':i.message.startsWith('PHYSICAL_')?i.message:'DOCUMENT_SCHEMA_INVALID',i.path.join('.')+': '+i.message));
  const doc=parsed.data,out:Diagnostic[]=[];
  const ids=[doc.id,...doc.assets.map(a=>a.id)];
  for(const page of doc.pages) {
    ids.push(page.id);
    for(const object of page.objects) {
      ids.push(object.id);
      if(object.type==='table') {
        const t=object.table;
        ids.push(t.id,...t.columns.map(c=>c.id),...t.rows.map(r=>r.id),...t.cells.map(c=>c.id),...t.annotations.map(a=>a.id),...t.legend.map(l=>l.id));
        out.push(...validateTable(t,doc.assets).map(d=>({...d,pageId:page.id,objectId:object.id})));
      }
      if((object.type==='image'||object.type==='icon')&&!doc.assets.some(asset=>asset.id===object.assetId))
        out.push(diagnostic('ASSET_REFERENCE_DANGLING',object.assetId,{pageId:page.id,objectId:object.id}));
    }
  }
  unique(ids,out);
  return out;
}
export function assertTable(table:TableModel):void {
  const errors=validateTable(table);
  if(errors.length)throw new VNextError(errors[0].code,errors[0].details);
}
/** Fail-closed immutable operation, adapted to the new strict array model. */
export function mergeCells(table:TableModel,anchorId:string,rows:number,columns:number):TableModel {
  assertTable(table);
  if(!Number.isSafeInteger(rows)||!Number.isSafeInteger(columns)||rows<1||columns<1)throw new VNextError('INVALID_SPAN');
  const anchor=table.cells.find(c=>c.id===anchorId);
  if(!anchor)throw new VNextError('CELL_NOT_FOUND');
  if(anchor.coveredBy)throw new VNextError('MERGE_INTERSECTION');
  if(rows===1 && columns===1)return table;
  const r=table.rows.findIndex(row=>row.id===anchor.rowId),c=table.columns.findIndex(col=>col.id===anchor.columnId);
  if(r+rows>table.rows.length || c+columns>table.columns.length)throw new VNextError('SPAN_OUT_OF_BOUNDS');
  if(table.rows.slice(r,r+rows).some(row=>(row.role==='header')!==(table.rows[r].role==='header')))throw new VNextError('MERGE_HEADER_BOUNDARY');
  const region=new Set<string>();
  const index=cellIndex(table);
  for(let ri=r;ri<r+rows;ri++)for(let ci=c;ci<c+columns;ci++) {
    const cell=index.get(getCellKey(table.rows[ri].id,table.columns[ci].id))!;
    if(cell.coveredBy || (cell.span?.rows??1)>1 || (cell.span?.columns??1)>1)throw new VNextError('MERGE_OVERLAP');
    if(cell.id!==anchorId && (cell.content.type!=='empty' || cell.annotationIds?.length))throw new VNextError('MERGE_WOULD_DISCARD_CONTENT',cell.id);
    region.add(cell.id);
  }
  const result={...table,cells:table.cells.map(cell=>cell.id===anchorId?{...cell,span:{rows,columns}}:region.has(cell.id)?{...cell,coveredBy:anchorId}:cell)};
  assertTable(result);return result;
}
export function unmergeCell(table:TableModel,anchorId:string):TableModel {
  assertTable(table);
  const anchor=table.cells.find(c=>c.id===anchorId);
  if(!anchor)throw new VNextError('CELL_NOT_FOUND');
  if(anchor.coveredBy)throw new VNextError('MERGE_INTERSECTION');
  if(!anchor.span)return table;
  const result={...table,cells:table.cells.map(cell=>{
    if(cell.id===anchorId){const {span:_span,...rest}=cell;return rest;}
    if(cell.coveredBy===anchorId){const {coveredBy:_covered,...rest}=cell;return rest;}
    return cell;
  })};
  assertTable(result);return result;
}
export function assertAxisManipulation(table:TableModel,axis:'row'|'column',id:string):void {
  assertTable(table);
  const items=axis==='row'?table.rows:table.columns;
  const position=items.findIndex(item=>item.id===id);
  if(position<0)throw new VNextError('AXIS_NOT_FOUND');
  for(const anchor of orderedAnchors(table)) {
    if((anchor.span?.rows??1)===1 && (anchor.span?.columns??1)===1)continue;
    const start=items.findIndex(item=>item.id===(axis==='row'?anchor.rowId:anchor.columnId));
    const length=axis==='row'?(anchor.span?.rows??1):(anchor.span?.columns??1);
    if(position>=start && position<start+length)throw new VNextError('MERGE_INTERSECTION');
  }
}
export function deleteAxis(table:TableModel,axis:'row'|'column',id:string):TableModel {
  assertAxisManipulation(table,axis,id);
  if((axis==='row'?table.rows:table.columns).length===1)throw new VNextError('TABLE_LAST_AXIS');
  const next={...table,rows:axis==='row'?table.rows.filter(r=>r.id!==id):table.rows,
    columns:axis==='column'?table.columns.filter(c=>c.id!==id):table.columns,
    cells:table.cells.filter(c=>(axis==='row'?c.rowId:c.columnId)!==id)};
  assertTable(next);return next;
}
export function reorderAxis(table:TableModel,axis:'row'|'column',order:string[]):TableModel {
  assertTable(table);
  const items=axis==='row'?table.rows:table.columns;
  if(order.length!==items.length || new Set(order).size!==items.length || order.some(id=>!items.some(i=>i.id===id)))throw new VNextError('AXIS_ORDER_INVALID');
  items.forEach((item,i)=>{if(order[i]!==item.id)assertAxisManipulation(table,axis,item.id);});
  const next={...table,rows:axis==='row'?order.map(id=>table.rows.find(r=>r.id===id)!):table.rows,
    columns:axis==='column'?order.map(id=>table.columns.find(c=>c.id===id)!):table.columns};
  assertTable(next);return next;
}
/** New IDs/cells are provided by a command caller, never generated by the engine. */
export function insertAxis(table:TableModel,axis:'row'|'column',at:number,item:Row|Column,newCells:Cell[]):TableModel {
  assertTable(table);
  const items=axis==='row'?table.rows:table.columns;
  if(!Number.isSafeInteger(at)||at<0||at>items.length)throw new VNextError('AXIS_INDEX_INVALID');
  const nextRows=[...table.rows],nextColumns=[...table.columns];
  if(axis==='row')nextRows.splice(at,0,item as Row);else nextColumns.splice(at,0,item as Column);
  const anchors=orderedAnchors(table);
  const expanded=new Map<string,Cell>();
  const inserted=newCells.map(cell=>({...cell}));
  for(const anchor of anchors) {
    const start=items.findIndex(i=>i.id===(axis==='row'?anchor.rowId:anchor.columnId));
    const length=axis==='row'?(anchor.span?.rows??1):(anchor.span?.columns??1);
    if(at<=start||at>=start+length)continue;
    const span={rows:anchor.span?.rows??1,columns:anchor.span?.columns??1};
    if(axis==='row')span.rows++;else span.columns++;
    expanded.set(anchor.id,{...anchor,span});
    const orthogonal=axis==='row'?table.columns:table.rows;
    const os=orthogonal.findIndex(i=>i.id===(axis==='row'?anchor.columnId:anchor.rowId));
    const ol=axis==='row'?span.columns:span.rows;
    const coveredIds=new Set(orthogonal.slice(os,os+ol).map(i=>i.id));
    for(const cell of inserted)if(coveredIds.has(axis==='row'?cell.columnId:cell.rowId)) {
      if(cell.content.type!=='empty'||cell.annotationIds?.length)throw new VNextError('MERGE_WOULD_DISCARD_CONTENT');
      cell.coveredBy=anchor.id;
    }
  }
  const next={...table,rows:nextRows,columns:nextColumns,cells:[...table.cells.map(c=>expanded.get(c.id)??c),...inserted]};
  assertTable(next);return next;
}
export function authoredFrames(doc:CatalogDocument):string {
  if(!doc||!Array.isArray(doc.pages))return 'null';
  return JSON.stringify(doc.pages.map(page=>({id:page?.id,objects:Array.isArray(page?.objects)?page.objects.map(object=>({id:object?.id,frame:object?.frame})):null})));
}
