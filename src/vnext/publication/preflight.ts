import type { AssetRef,CatalogDocument,CellContent,RichText,TableModel } from '../domain/editorial-model';
import type { TablePlan } from '../rendering/render-plan';
import type { LayoutSnapshot } from '../rendering/measurement';
import { findElement,intrinsicMetrics } from '../rendering/measurement';
import { add,mmToU,qToU,uToQ } from '../domain/physical';
import { diagnostic,type Diagnostic } from '../domain/diagnostics';
import { walkPageObjects } from '../domain/object-tree';
export const tableHeightOverflows=(renderedIntrinsicHeightQ:number,authoredFrameHeightU:number):boolean => renderedIntrinsicHeightQ>uToQ(authoredFrameHeightU);
export const textObjectOverflows=(metrics:{widthQ:number;heightQ:number},authoredWidthU:number,authoredHeightU:number):boolean => metrics.widthQ>uToQ(authoredWidthU)||metrics.heightQ>uToQ(authoredHeightU);
export function authoredFrameDiagnostics(doc:CatalogDocument):Diagnostic[] {
  const result:Diagnostic[]=[];
  for(const page of doc.pages) {
    const pageWidth=mmToU(page.widthMm),pageHeight=mmToU(page.heightMm);
    for(const object of page.objects) {
      const x=mmToU(object.frame.xMm),y=mmToU(object.frame.yMm),w=mmToU(object.frame.widthMm),h=mmToU(object.frame.heightMm),location={pageId:page.id,objectId:object.id};
      if(x<0||y<0||add(x,w)>pageWidth||add(y,h)>pageHeight)result.push(diagnostic('OBJECT_OUTSIDE_PAGE','Authored frame exceeds physical A4 bounds',location));
      const safe=page.safeArea;
      if(safe&&(x<mmToU(safe.leftMm)||y<mmToU(safe.topMm)||add(x,w)>pageWidth-mmToU(safe.rightMm)||add(y,h)>pageHeight-mmToU(safe.bottomMm)))
        result.push(diagnostic('SAFE_AREA_VIOLATION','Authored frame crosses configured safe area',{...location,severity:'WARNING'}));
    }
  }
  return result;
}

/** Inspect printed content, not generous authored text frames or intentional decorative backgrounds. */
export function printableContentOverlapDiagnostics(doc:CatalogDocument,root:HTMLElement,plans?:ReadonlyMap<string,TablePlan>):Diagnostic[] {
  const result:Diagnostic[]=[];
  for(const page of doc.pages) {
    // An infeasible table has no plan/grid and is already blocked by compilePlans.
    // Missing DOM for a table with a valid plan must still fail the publication check.
    const printable=walkPageObjects(page).filter(({object})=>object.type==='text'||object.type==='table');
    if(printable.length<2)continue;
    const content=printable.filter(({object})=>object.type!=='table'||!plans||plans.has(object.table.id)).map(({object})=>{
      const node=findElement(root,'data-object-id',object.id),rects:DOMRect[]=[];
      if(object.type==='table')rects.push(findElement(node,'data-table-id',object.table.id).getBoundingClientRect());
      const textRoot=object.type==='table'
        ? [...node.querySelectorAll<HTMLElement>('[data-table-title],[data-annotation-id]')]
        : [node];
      for(const text of textRoot)for(const inline of text.querySelectorAll<HTMLElement>('[data-inline-id]')) {
        if(!inline.textContent?.trim())continue;
        const range=document.createRange();range.selectNodeContents(inline);
        rects.push(...range.getClientRects());
      }
      return {object,rects};
    });
    for(let left=0;left<content.length;left++)for(let right=left+1;right<content.length;right++) {
      const first=content[left],second=content[right];
      // Half a screen pixel avoids touching edges/rounding while catching visibly colliding printed content.
      if(!first.rects.some(a=>second.rects.some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5
        &&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)))continue;
      result.push(diagnostic('PRINTABLE_CONTENT_OVERLAP','Printed content intersects another text or table object',
        {pageId:page.id,objectId:first.object.id}));
      result.push(diagnostic('PRINTABLE_CONTENT_OVERLAP','Printed content intersects another text or table object',
        {pageId:page.id,objectId:second.object.id}));
    }
  }
  return result;
}
export function layoutReport(doc:CatalogDocument,plans:ReadonlyMap<string,TablePlan>,snapshot:LayoutSnapshot,root:HTMLElement):Diagnostic[] {
  const result:Diagnostic[]=[...snapshot.geometryDiagnostics,...authoredFrameDiagnostics(doc),...printableContentOverlapDiagnostics(doc,root,plans),...contentDiagnostics(doc)];
  for(const page of doc.pages) {
    const frames=walkPageObjects(page).map(({object})=>({object,w:mmToU(object.frame.widthMm),h:mmToU(object.frame.heightMm)}));
    for(const frame of frames) {
      const {object,w,h}=frame,location={pageId:page.id,objectId:object.id};
      if(object.type==='table') {
        const plan=plans.get(object.table.id);
        if(!plan)continue;
        result.push(...plan.diagnostics);
        const fact=snapshot.facts.find(f=>f.kind==='table'&&f.tableId===object.table.id);
        if(fact?.kind==='table'&&tableHeightOverflows(fact.renderedIntrinsicHeightQ,h)) {
          const authoredHeightQ=uToQ(h);
          result.push(diagnostic('TABLE_CONTENT_OVERFLOW',`intrinsicQ=${fact.renderedIntrinsicHeightQ}, authoredHeightQ=${authoredHeightQ}, diagnosticIntrinsicU=${qToU(fact.renderedIntrinsicHeightQ)}, authoredHeightU=${h}`,{...location,tableId:object.table.id}));
        }
        for(const fact of snapshot.facts)if(fact.kind==='cell'&&fact.tableId===object.table.id) {
          const padding=plan.styles.get(fact.cellId)!.paddingQ,contentWidthQ=fact.widthQ-padding.left-padding.right,contentHeightQ=fact.heightQ-padding.top-padding.bottom;
          const cellLocation={...location,tableId:object.table.id,cellId:fact.cellId};
          if(contentWidthQ<=0||contentHeightQ<=0)result.push(diagnostic('CELL_CONTENT_BOX_NONPOSITIVE',`contentWidthQ=${contentWidthQ}, contentHeightQ=${contentHeightQ}`,cellLocation));
          if(fact.intrinsicContentWidthQ>contentWidthQ)result.push(diagnostic('CELL_CONTENT_OVERFLOW',`intrinsicWidthQ=${fact.intrinsicContentWidthQ}, contentWidthQ=${contentWidthQ}`,cellLocation));
          if(fact.intrinsicContentHeightQ>contentHeightQ&&!result.some(d=>d.code==='ROW_CONTENT_OVERFLOW'&&d.tableId===object.table.id&&d.cellId===fact.cellId))
            result.push(diagnostic('ROW_CONTENT_OVERFLOW',`intrinsicHeightQ=${fact.intrinsicContentHeightQ}, availableContentQ=${contentHeightQ}`,cellLocation));
        }
      }else if(object.type==='text') {
        const objectNode=findElement(root,'data-object-id',object.id),flow=objectNode.querySelector<HTMLElement>('[data-flow-root]')!,metrics=intrinsicMetrics(flow,object.text);
        if(textObjectOverflows(metrics,w,h))result.push(diagnostic('TEXT_OBJECT_OVERFLOW','Text exceeds authored object frame',location));
      }
    }
  }
  return result;
}

/**
 * Content preflight (FR-51). Pure checks over the canonical document: they never read the DOM and never edit.
 * Provisional text blocks publication with its exact location; empty rows and soft images are review points.
 */
export const PLACEHOLDER_DIAGNOSTIC_CODE='UNRESOLVED_PLACEHOLDER';
export const EMPTY_TABLE_ROW_DIAGNOSTIC_CODE='EMPTY_TABLE_ROW';
export const IMAGE_LOW_RESOLUTION_DIAGNOSTIC_CODE='IMAGE_LOW_RESOLUTION';
export const MINIMUM_PRINT_PPI=150;
type DiagnosticLocation=Partial<Omit<Diagnostic,'code'|'details'>>;

// Letters/digits around a match mean it is part of another word. For "XXX" a hyphen, slash, dot or underscore
// also counts, so ordering-code masks such as "TA-50N-PB-XXXX" stay legitimate content.
const PLACEHOLDER_PATTERNS:readonly RegExp[]=[
  /(?<![\p{L}\p{N}])a\s+completar(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])a\s+confirmar(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])tbd(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}\-/._])x{3,}(?![\p{L}\p{N}\-/._])/iu,
  /(?<![\p{L}\p{N}])revisar\s+com\s+(?:a\s+)?engenharia(?![\p{L}\p{N}])/iu,
];

/** Returns the provisional marker found in printed text, exactly as written, or undefined. */
export function findPlaceholder(text:string):string|undefined {
  let first:{index:number;value:string}|undefined;
  for(const pattern of PLACEHOLDER_PATTERNS) {
    const match=pattern.exec(text);
    if(match&&(!first||match.index<first.index))first={index:match.index,value:match[0].replace(/\s+/g,' ')};
  }
  return first?.value;
}

export function richTextPlainText(rich:RichText):string {
  return rich.paragraphs.map(paragraph=>paragraph.inlines.map(inline=>inline.kind==='text'?inline.text:'\n').join('')).join('\n');
}

function cellText(content:CellContent):string|undefined {
  if(content.type==='richText')return richTextPlainText(content.value);
  if(content.type==='technicalCode')return content.value;
  return undefined;
}

function isEmptyCellContent(content:CellContent):boolean {
  if(content.type==='empty')return true;
  const text=cellText(content);
  return text!==undefined&&text.trim().length===0;
}

export function placeholderDiagnostics(doc:CatalogDocument):Diagnostic[] {
  const result:Diagnostic[]=[];
  const report=(text:string,surface:string,location:DiagnosticLocation)=>{
    const token=findPlaceholder(text);
    if(token)result.push(diagnostic(PLACEHOLDER_DIAGNOSTIC_CODE,`surface=${surface}; token=${token}`,location));
  };
  for(const page of doc.pages)for(const {object} of walkPageObjects(page)) {
    const location={pageId:page.id,objectId:object.id};
    if(object.type==='text') { report(richTextPlainText(object.text),'text',location); continue; }
    if(object.type!=='table')continue;
    const table=object.table,tableLocation={...location,tableId:table.id};
    if(table.title)report(richTextPlainText(table.title),'title',tableLocation);
    for(const cell of table.cells) {
      if(cell.coveredBy)continue;
      const text=cellText(cell.content);
      if(text!==undefined)report(text,'cell',{...tableLocation,rowId:cell.rowId,cellId:cell.id});
    }
    for(const annotation of table.annotations)report(richTextPlainText(annotation.text),'note',{...tableLocation,annotationId:annotation.id});
    for(const entry of table.legend)report(`${entry.markerCode} ${richTextPlainText(entry.text)}`,'legend',tableLocation);
  }
  return result;
}

/** One review point per table, anchored at its first fully empty row (section rows are visual separators). */
export function emptyTableRowDiagnostics(doc:CatalogDocument):Diagnostic[] {
  const result:Diagnostic[]=[];
  for(const page of doc.pages)for(const {object} of walkPageObjects(page)) {
    if(object.type!=='table')continue;
    const rowIds=emptyTableRowIds(object.table);
    if(rowIds.length===0)continue;
    result.push(diagnostic(EMPTY_TABLE_ROW_DIAGNOSTIC_CODE,`emptyRows=${rowIds.length}`,
      {pageId:page.id,objectId:object.id,tableId:object.table.id,rowId:rowIds[0],severity:'WARNING'}));
  }
  return result;
}

export function emptyTableRowIds(table:TableModel):string[] {
  const byId=new Map(table.cells.map(cell=>[cell.id,cell]));
  return table.rows.filter(row=>row.role!=='section').filter(row=>{
    const cells=table.cells.filter(cell=>cell.rowId===row.id);
    return cells.length>0&&cells.every(cell=>{
      const owner=cell.coveredBy?byId.get(cell.coveredBy):cell;
      return !owner||isEmptyCellContent(owner.content);
    });
  }).map(row=>row.id);
}

/** Effective print density of an asset drawn into a box, honouring contain/cover scaling. */
export function effectivePpi(asset:Pick<AssetRef,'widthPx'|'heightPx'>,boxWidthMm:number,boxHeightMm:number,fit:'contain'|'cover'):number {
  const horizontal=asset.widthPx/(boxWidthMm/25.4),vertical=asset.heightPx/(boxHeightMm/25.4);
  return fit==='cover'?Math.min(horizontal,vertical):Math.max(horizontal,vertical);
}

export function imageResolutionDiagnostics(doc:CatalogDocument):Diagnostic[] {
  const result:Diagnostic[]=[];
  const assets=new Map(doc.assets.map(asset=>[asset.id,asset]));
  const check=(assetId:string,widthMm:number,heightMm:number,fit:'contain'|'cover',location:DiagnosticLocation)=>{
    const asset=assets.get(assetId);
    if(!asset)return;
    const ppi=Math.floor(effectivePpi(asset,widthMm,heightMm,fit));
    if(ppi<MINIMUM_PRINT_PPI)result.push(diagnostic(IMAGE_LOW_RESOLUTION_DIAGNOSTIC_CODE,
      `effectivePpi=${ppi}; minimumPpi=${MINIMUM_PRINT_PPI}`,{...location,severity:'WARNING'}));
  };
  for(const page of doc.pages)for(const {object} of walkPageObjects(page)) {
    if(object.type==='image')check(object.assetId,object.frame.widthMm,object.frame.heightMm,object.fit,{pageId:page.id,objectId:object.id});
    if(object.type!=='table')continue;
    for(const cell of object.table.cells) {
      const image=cell.contentPresentation?.image;
      if(cell.content.type==='image'&&image)check(cell.content.assetId,image.targetWidthMm,image.targetHeightMm,image.fit,
        {pageId:page.id,objectId:object.id,tableId:object.table.id,rowId:cell.rowId,cellId:cell.id});
    }
  }
  return result;
}

export function contentDiagnostics(doc:CatalogDocument):Diagnostic[] {
  return [...placeholderDiagnostics(doc),...emptyTableRowDiagnostics(doc),...imageResolutionDiagnostics(doc)];
}
