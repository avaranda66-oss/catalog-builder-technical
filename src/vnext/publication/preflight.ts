import type { AssetRef,CatalogDocument,CellContent,EditorialObject,Page,RichText,TableModel } from '../domain/editorial-model';
import type { TablePlan } from '../rendering/render-plan';
import type { LayoutSnapshot } from '../rendering/measurement';
import { findElement,intrinsicMetrics,measurementToleranceQ } from '../rendering/measurement';
import { add,mmToU,qToU,uToQ } from '../domain/physical';
import { diagnostic,type Diagnostic } from '../domain/diagnostics';
import { walkPageObjects,type CanonicalFrameU,type ObjectTreeEntry } from '../domain/object-tree';
import { leaderGeometry } from '../rendering/native-paint';
// toleranceQ is the measurement rounding allowance (0 at 100% zoom); see deviceSnapToleranceQ.
export const tableHeightOverflows=(renderedIntrinsicHeightQ:number,authoredFrameHeightU:number,toleranceQ=0):boolean => renderedIntrinsicHeightQ>add(uToQ(authoredFrameHeightU),toleranceQ);
export const textObjectOverflows=(metrics:{widthQ:number;heightQ:number},authoredWidthU:number,authoredHeightU:number,toleranceQ=0):boolean =>
  metrics.widthQ>add(uToQ(authoredWidthU),toleranceQ)||metrics.heightQ>add(uToQ(authoredHeightU),toleranceQ);
/**
 * FR-54. Decorative bands, rules and bleed photos are intentional: a shape, line or image that touches or crosses
 * the page edge gets no safe-area warning on that same side (a photo flush with the bottom edge but 2 mm short of the
 * right edge still gets the warning for the right side), and leaving the page by up to BLEED_TOLERANCE_MM on any side
 * is a bleed warning instead of a blocking error. Text, tables and icons keep the original rules, because printed
 * content cut by the page edge is always an error. A group is judged by its children (resolved frames) and reported
 * once, at the group. The printed page is clipped at its box (rendering/styles.css, @media print), so a bleed never
 * paints on the next sheet.
 */
export const BLEED_TOLERANCE_MM=3;
export const BLEED_OBJECT_TYPES:ReadonlySet<EditorialObject['type']>=new Set<EditorialObject['type']>(['shape','line','image','polygon']);
export const OBJECT_OUTSIDE_PAGE_DIAGNOSTIC_CODE='OBJECT_OUTSIDE_PAGE';
export const SAFE_AREA_VIOLATION_DIAGNOSTIC_CODE='SAFE_AREA_VIOLATION';
/** An object turned off in "Camadas" is not printed: a warning (never blocking), so nobody loses content without knowing. */
export const OBJECT_HIDDEN_DIAGNOSTIC_CODE='OBJECT_HIDDEN';
/** A bleed keeps the canonical code; only the severity and the `bleedMm=…; toleranceMm=…` detail differ from the blocking error. */
export const isBleedWarning=(issue:Pick<Diagnostic,'code'|'severity'>):boolean => issue.code===OBJECT_OUTSIDE_PAGE_DIAGNOSTIC_CODE&&issue.severity==='WARNING';

interface PageBoundsU { widthU:number; heightU:number; safe?:{leftU:number;topU:number;rightU:number;bottomU:number} }
interface FrameVerdict { overflowU:number; bleed:boolean; safeAreaWarning:boolean }

function pageBoundsU(page:Page):PageBoundsU {
  const safe=page.safeArea;
  return {widthU:mmToU(page.widthMm),heightU:mmToU(page.heightMm),
    safe:safe&&{leftU:mmToU(safe.leftMm),topU:mmToU(safe.topMm),rightU:mmToU(safe.rightMm),bottomU:mmToU(safe.bottomMm)}};
}

function frameVerdict(frame:CanonicalFrameU,type:EditorialObject['type'],page:PageBoundsU):FrameVerdict {
  const right=add(frame.xU,frame.widthU),bottom=add(frame.yU,frame.heightU);
  const overflowU=Math.max(0,-frame.xU,-frame.yU,right-page.widthU,bottom-page.heightU);
  const bleedable=BLEED_OBJECT_TYPES.has(type),safe=page.safe;
  // Per side: crossing the safe area counts unless a bleedable object touches or crosses the page edge on that very side.
  const sideWarns=(crossesSafe:boolean,touchesEdge:boolean)=>crossesSafe&&!(bleedable&&touchesEdge);
  const crossesSafeArea=safe!==undefined&&(
    sideWarns(frame.xU<safe.leftU,frame.xU<=0)
    ||sideWarns(frame.yU<safe.topU,frame.yU<=0)
    ||sideWarns(right>page.widthU-safe.rightU,right>=page.widthU)
    ||sideWarns(bottom>page.heightU-safe.bottomU,bottom>=page.heightU));
  return {overflowU,bleed:bleedable&&overflowU<=mmToU(BLEED_TOLERANCE_MM),safeAreaWarning:crossesSafeArea};
}

/**
 * Onda 3.5 (E3): a callout's pointer is painted outside its label box, so the page-edge checks use the painted
 * extent (label plus pointer). Every other object paints inside its frame.
 */
export function paintedFrameU(entry:Pick<ObjectTreeEntry,'object'|'resolvedFrameU'>):CanonicalFrameU {
  const {object,resolvedFrameU:frame}=entry;
  if(object.type!=='text'||!object.leader)return frame;
  const {bounds}=leaderGeometry(object.frame,object.leader);
  const minX=add(frame.xU,mmToU(Math.round(bounds.minX*1000)/1000)),minY=add(frame.yU,mmToU(Math.round(bounds.minY*1000)/1000));
  const maxX=add(frame.xU,mmToU(Math.round(bounds.maxX*1000)/1000)),maxY=add(frame.yU,mmToU(Math.round(bounds.maxY*1000)/1000));
  return {xU:minX,yU:minY,widthU:add(maxX,-minX),heightU:add(maxY,-minY)};
}

/** Grouped children keyed by the index of their top-level group, so each page is walked once. */
function childrenByTopLevel(entries:readonly ObjectTreeEntry[]):Map<number,ObjectTreeEntry[]> {
  const byTop=new Map<number,ObjectTreeEntry[]>();
  for(const entry of entries) {
    if(entry.depth!==1)continue;
    const list=byTop.get(entry.topLevelIndex);
    if(list)list.push(entry);else byTop.set(entry.topLevelIndex,[entry]);
  }
  return byTop;
}

export function authoredFrameDiagnostics(doc:CatalogDocument):Diagnostic[] {
  const result:Diagnostic[]=[];
  for(const page of doc.pages) {
    const bounds=pageBoundsU(page),entries=walkPageObjects(page),byTop=childrenByTopLevel(entries);
    for(const entry of entries) {
      if(entry.depth!==0)continue;
      const {object}=entry,location={pageId:page.id,objectId:object.id};
      const children=byTop.get(entry.topLevelIndex)??[];
      const verdicts=(children.length>0?children:[entry]).map(leaf=>frameVerdict(paintedFrameU(leaf),leaf.object.type,bounds));
      const outside=verdicts.filter(verdict=>verdict.overflowU>0);
      if(outside.some(verdict=>!verdict.bleed))result.push(diagnostic(OBJECT_OUTSIDE_PAGE_DIAGNOSTIC_CODE,'Authored frame exceeds physical A4 bounds',location));
      else if(outside.length>0)result.push(diagnostic(OBJECT_OUTSIDE_PAGE_DIAGNOSTIC_CODE,
        `bleedMm=${Math.max(...outside.map(verdict=>verdict.overflowU))/mmToU(1)}; toleranceMm=${BLEED_TOLERANCE_MM}`,{...location,severity:'WARNING'}));
      if(verdicts.some(verdict=>verdict.safeAreaWarning))
        result.push(diagnostic(SAFE_AREA_VIOLATION_DIAGNOSTIC_CODE,'Authored frame crosses configured safe area',{...location,severity:'WARNING'}));
      if(object.hidden||children.some(child=>child.object.hidden))
        result.push(diagnostic(OBJECT_HIDDEN_DIAGNOSTIC_CODE,'Object is hidden and will not be printed',{...location,severity:'WARNING'}));
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
    const printable=walkPageObjects(page).filter(({object,parentGroup})=>(object.type==='text'||object.type==='table')&&!object.hidden&&!parentGroup?.hidden);
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
  const toleranceQ=measurementToleranceQ(root);
  for(const page of doc.pages) {
    const frames=walkPageObjects(page).map(({object})=>({object,w:mmToU(object.frame.widthMm),h:mmToU(object.frame.heightMm)}));
    for(const frame of frames) {
      const {object,w,h}=frame,location={pageId:page.id,objectId:object.id};
      if(object.type==='table') {
        const plan=plans.get(object.table.id);
        if(!plan)continue;
        result.push(...plan.diagnostics);
        const fact=snapshot.facts.find(f=>f.kind==='table'&&f.tableId===object.table.id);
        if(fact?.kind==='table'&&tableHeightOverflows(fact.renderedIntrinsicHeightQ,h,toleranceQ)) {
          const authoredHeightQ=uToQ(h);
          result.push(diagnostic('TABLE_CONTENT_OVERFLOW',`intrinsicQ=${fact.renderedIntrinsicHeightQ}, authoredHeightQ=${authoredHeightQ}, diagnosticIntrinsicU=${qToU(fact.renderedIntrinsicHeightQ)}, authoredHeightU=${h}`,{...location,tableId:object.table.id}));
        }
        for(const fact of snapshot.facts)if(fact.kind==='cell'&&fact.tableId===object.table.id) {
          const padding=plan.styles.get(fact.cellId)!.paddingQ,contentWidthQ=fact.widthQ-padding.left-padding.right,contentHeightQ=fact.heightQ-padding.top-padding.bottom;
          const cellLocation={...location,tableId:object.table.id,cellId:fact.cellId};
          if(contentWidthQ<=0||contentHeightQ<=0)result.push(diagnostic('CELL_CONTENT_BOX_NONPOSITIVE',`contentWidthQ=${contentWidthQ}, contentHeightQ=${contentHeightQ}`,cellLocation));
          if(fact.intrinsicContentWidthQ>contentWidthQ+toleranceQ)result.push(diagnostic('CELL_CONTENT_OVERFLOW',`intrinsicWidthQ=${fact.intrinsicContentWidthQ}, contentWidthQ=${contentWidthQ}`,cellLocation));
          if(fact.intrinsicContentHeightQ>contentHeightQ+toleranceQ&&!result.some(d=>d.code==='ROW_CONTENT_OVERFLOW'&&d.tableId===object.table.id&&d.cellId===fact.cellId))
            result.push(diagnostic('ROW_CONTENT_OVERFLOW',`intrinsicHeightQ=${fact.intrinsicContentHeightQ}, availableContentQ=${contentHeightQ}`,cellLocation));
        }
      }else if(object.type==='text') {
        const objectNode=findElement(root,'data-object-id',object.id),flow=objectNode.querySelector<HTMLElement>('[data-flow-root]')!,metrics=intrinsicMetrics(flow,object.text);
        // A "Selo" keeps its side padding free of text.
        const textWidthU=object.box?Math.max(1,add(w,-mmToU(object.box.paddingMm*2))):w;
        if(textObjectOverflows(metrics,textWidthU,h,toleranceQ))result.push(diagnostic('TEXT_OBJECT_OVERFLOW','Text exceeds authored object frame',location));
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
  for(const page of doc.pages) {
    const background=page.background?.image;
    if(background)check(background.assetId,page.widthMm,page.heightMm,background.fit,{pageId:page.id});
  }
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
