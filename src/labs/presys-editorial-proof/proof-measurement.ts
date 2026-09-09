import type { CatalogDocument, RichText, TableModel } from './proof-model';
import { add,mmToU,pxToQ,qToU,sum,uToQ } from './physical';
import { cumulative,projectRows,resolveRows,type SpanConstraint } from './proof-layout';
import { buildPaint } from './proof-paint';
import { orderedAnchors } from './proof-table';
import { annotationDisplayText,cellDisplayText,legendDisplayText,referencedAnnotations,type TablePlan } from './proof-render-plan';
import { diagnostic,ProofError,type Diagnostic } from './diagnostics';
import { sha256 } from './proof-resources';

export function findElement(root:ParentNode,attribute:string,id:string):HTMLElement {
  const element=root.querySelector<HTMLElement>('['+attribute+'="'+CSS.escape(id)+'"]');
  if(!element)throw new ProofError('RENDER_ELEMENT_MISSING',attribute+'='+id);
  return element;
}
export function assertTransformFree(root:HTMLElement):void {
  let element:HTMLElement|null=root;
  while(element) {
    const style=getComputedStyle(element);
    if(style.transform!=='none'||style.scale!=='none'||style.translate!=='none'||style.rotate!=='none'||!['1','normal',''].includes(style.zoom))
      throw new ProofError('MEASUREMENT_ROOT_TRANSFORMED',element.tagName);
    element=element.parentElement;
  }
}
function assertDomIds(root:ParentNode,attribute:string,expected:readonly string[]):void {
  const actual=[...root.querySelectorAll('['+attribute+']')].map(node=>node.getAttribute(attribute)!).sort();
  if(JSON.stringify(actual)!==JSON.stringify([...expected].sort()))throw new ProofError('LAYOUT_UNSTABLE','Unexpected/missing/duplicate DOM identity: '+attribute);
}
export type TextFlowRecord=['P',string]|['T',string,string,number,number,number,number,number]|['B',string,string];
export function textFlowRecords(flow:HTMLElement,rich:RichText):TextFlowRecord[] {
  const origin=flow.getBoundingClientRect(),records:TextFlowRecord[]=[];
  for(const paragraph of rich.paragraphs) {
    records.push(['P',paragraph.id]);
    for(const inline of paragraph.inlines) {
      const element=findElement(flow,'data-inline-id',inline.id);
      if(inline.kind==='lineBreak'){records.push(['B',paragraph.id,inline.id]);continue;}
      if(element.childNodes.length!==1||element.firstChild?.nodeType!==Node.TEXT_NODE||element.textContent!==inline.text)
        throw new ProofError('TEXT_RUN_DOM_MISMATCH',inline.id);
      const range=document.createRange();range.selectNodeContents(element.firstChild);
      [...range.getClientRects()].forEach((rect,index)=>records.push(['T',paragraph.id,inline.id,index,
        pxToQ(rect.left-origin.left),pxToQ(rect.top-origin.top),pxToQ(rect.width),pxToQ(rect.height)]));
    }
  }
  return records;
}
export interface IntrinsicMetrics {widthQ:number;heightQ:number;records?:TextFlowRecord[]}
export function intrinsicMetrics(flow:HTMLElement,rich?:RichText):IntrinsicMetrics {
  const rect=flow.getBoundingClientRect(),records=rich?textFlowRecords(flow,rich):undefined;
  let left=0,right=0,top=0,bottom=pxToQ(rect.height);
  for(const record of records??[])if(record[0]==='T') {
    left=Math.min(left,record[4]);right=Math.max(right,add(record[4],record[6]));
    top=Math.min(top,record[5]);bottom=Math.max(bottom,add(record[5],record[7]));
  }
  for(const image of flow.querySelectorAll('img')) {
    const imageRect=image.getBoundingClientRect();
    left=Math.min(left,pxToQ(imageRect.left-rect.left));right=Math.max(right,pxToQ(imageRect.right-rect.left));
    top=Math.min(top,pxToQ(imageRect.top-rect.top));bottom=Math.max(bottom,pxToQ(imageRect.bottom-rect.top));
  }
  return {widthQ:add(right,-left),heightQ:add(bottom,-top),records};
}
export function measureTables(doc:CatalogDocument,plans:Map<string,TablePlan>,root:HTMLElement):void {
  assertTransformFree(root);
  for(const page of doc.pages)for(const object of page.objects)if(object.type==='table') {
    const table=object.table,plan=plans.get(table.id);
    if(!plan)continue;
    const measured=tableConstraints(table,root,plan);
    const resolved=resolveRows(table.rows,measured.baseIntrinsicU,measured.constraints);
    const projected=projectRows(resolved.heightsU);
    const paint=buildPaint(table,plan.trackQ,projected.rowQ,plan.styles);
    plan.heightsU=resolved.heightsU;plan.rowQ=projected.rowQ;plan.edges=paint.edges;plan.suppressed=paint.suppressed;
    plan.diagnostics=[...resolved.diagnostics,...paint.diagnostics].map(d=>({...d,pageId:page.id,objectId:object.id,tableId:table.id}));
  }
}
interface Bounds {xQ:number;yQ:number;widthQ:number;heightQ:number}
type Identity={pageId:string};
export type PhysicalLayoutFact=
 | ({kind:'page';authoredWidthU:number;authoredHeightU:number;widthQ:number;heightQ:number}&Identity)
 | ({kind:'object';objectId:string;authoredXU:number;authoredYU:number;authoredWidthU:number;authoredHeightU:number;textFlowSignature?:string}&Bounds&Identity)
 | ({kind:'table';objectId:string;tableId:string;frameWidthU:number;columnWidthsU:number[];frameQ:number;trackQ:number[];renderedIntrinsicHeightQ:number}&Identity)
 | ({kind:'row';tableId:string;rowId:string;resolvedHeightU:number;yQ:number;heightQ:number}&Identity)
 | ({kind:'cell';tableId:string;cellId:string;intrinsicContentWidthQ:number;intrinsicContentHeightQ:number;textFlowSignature?:string}&Bounds&Identity)
 | ({kind:'annotation';tableId:string;annotationId:string;intrinsicContentHeightQ:number;textFlowSignature?:string}&Bounds&Identity)
 | ({kind:'paintEdge';tableId:string;edgeId:string;thicknessQ:number}&Bounds&Identity)
 | ({kind:'image';tableId:string;cellId:string;assetId:string;naturalWidthQ:number;naturalHeightQ:number}&Identity);
export interface LayoutSnapshot {facts:PhysicalLayoutFact[];geometryDiagnostics:Diagnostic[]}
export function factKey(fact:PhysicalLayoutFact):string {
  switch(fact.kind) {
    case 'page':return JSON.stringify([fact.kind,fact.pageId]);
    case 'object':return JSON.stringify([fact.kind,fact.pageId,fact.objectId]);
    case 'table':return JSON.stringify([fact.kind,fact.pageId,fact.tableId]);
    case 'row':return JSON.stringify([fact.kind,fact.pageId,fact.tableId,fact.rowId]);
    case 'cell':case 'image':return JSON.stringify([fact.kind,fact.pageId,fact.tableId,fact.cellId]);
    case 'annotation':return JSON.stringify([fact.kind,fact.pageId,fact.tableId,fact.annotationId]);
    case 'paintEdge':return JSON.stringify([fact.kind,fact.pageId,fact.tableId,fact.edgeId]);
  }
}
function bounds(element:HTMLElement,origin:DOMRect):Bounds {
  const rect=element.getBoundingClientRect();
  return {xQ:pxToQ(rect.left-origin.left),yQ:pxToQ(rect.top-origin.top),widthQ:pxToQ(rect.width),heightQ:pxToQ(rect.height)};
}
export async function captureSnapshot(doc:CatalogDocument,plans:ReadonlyMap<string,TablePlan>,root:HTMLElement):Promise<LayoutSnapshot> {
  assertTransformFree(root);
  assertDomIds(root,'data-page-id',doc.pages.map(p=>p.id));
  assertDomIds(root,'data-object-id',doc.pages.flatMap(p=>p.objects.map(o=>o.id)));
  assertDomIds(root,'data-table-id',[...plans.keys()]);
  const facts:PhysicalLayoutFact[]=[],geometryDiagnostics:Diagnostic[]=[];
  const check=(actual:number,expected:number,description:string,location:Partial<Diagnostic>)=>{
    if(actual!==expected)geometryDiagnostics.push(diagnostic('RENDER_GEOMETRY_MISMATCH',`${description}: actualQ=${actual}, expectedQ=${expected}`,location));
  };
  for(const page of doc.pages) {
    const element=findElement(root,'data-page-id',page.id),rect=element.getBoundingClientRect();
    const authoredWidthU=mmToU(page.widthMm),authoredHeightU=mmToU(page.heightMm),widthQ=pxToQ(rect.width),heightQ=pxToQ(rect.height);
    facts.push({kind:'page',pageId:page.id,authoredWidthU,authoredHeightU,widthQ,heightQ});
    check(widthQ,uToQ(authoredWidthU),'page width',{pageId:page.id});check(heightQ,uToQ(authoredHeightU),'page height',{pageId:page.id});
    for(const object of page.objects) {
      const node=findElement(element,'data-object-id',object.id),b=bounds(node,rect);
      const authoredXU=mmToU(object.frame.xMm),authoredYU=mmToU(object.frame.yMm),authoredWidthU=mmToU(object.frame.widthMm),authoredHeightU=mmToU(object.frame.heightMm);
      const location={pageId:page.id,objectId:object.id};
      const textFlowSignature=object.type==='text'?await sha256(JSON.stringify(textFlowRecords(node.querySelector<HTMLElement>('[data-flow-root]')!,object.text))):undefined;
      facts.push({kind:'object',...location,authoredXU,authoredYU,authoredWidthU,authoredHeightU,...b,...(textFlowSignature?{textFlowSignature}:{})});
      check(b.xQ,uToQ(authoredXU),'object x',location);check(b.yQ,uToQ(authoredYU),'object y',location);
      check(b.widthQ,uToQ(authoredWidthU),'object width',location);check(b.heightQ,uToQ(authoredHeightU),'object height',location);
      if(object.type!=='table')continue;
      const table=object.table,plan=plans.get(table.id);
      if(!plan?.rowQ||!plan.heightsU)continue;
      const grid=findElement(node,'data-table-id',table.id),gridRect=grid.getBoundingClientRect(),computed=getComputedStyle(grid);
      assertDomIds(grid,'data-cell-id',orderedAnchors(table).map(c=>c.id));
      assertDomIds(grid,'data-paint-edge',plan.edges.map(e=>e.id));
      const trackQ=computed.gridTemplateColumns.split(' ').map(value=>pxToQ(parseFloat(value)));
      const rowQ=computed.gridTemplateRows.split(' ').map(value=>pxToQ(parseFloat(value)));
      const frameQ=pxToQ(gridRect.width);
      const intrinsic=findElement(node,'data-table-intrinsic',table.id);
      facts.push({kind:'table',...location,tableId:table.id,frameWidthU:plan.frameU,columnWidthsU:[...plan.widthsU],frameQ,trackQ,renderedIntrinsicHeightQ:pxToQ(intrinsic.getBoundingClientRect().height)});
      check(frameQ,plan.frameQ,'table frame',{...location,tableId:table.id});
      if(trackQ.length!==plan.trackQ.length||rowQ.length!==plan.rowQ.length)throw new ProofError('RENDER_GEOMETRY_MISMATCH','Computed track count differs');
      trackQ.forEach((q,i)=>check(q,plan.trackQ[i],'column '+i,{...location,tableId:table.id}));
      rowQ.forEach((q,i)=>check(q,plan.rowQ![i],'row '+i,{...location,tableId:table.id,rowId:table.rows[i].id}));
      const x=cumulative(plan.trackQ),y=cumulative(plan.rowQ),actualY=cumulative(rowQ);
      table.rows.forEach((row,i)=>facts.push({kind:'row',pageId:page.id,tableId:table.id,rowId:row.id,resolvedHeightU:plan.heightsU![i],yQ:actualY[i],heightQ:rowQ[i]}));
      for(const cell of orderedAnchors(table)) {
        const cellNode=findElement(grid,'data-cell-id',cell.id),flow=cellNode.querySelector<HTMLElement>('[data-flow-root]')!;
        const b=bounds(cellNode,gridRect),metrics=intrinsicMetrics(flow,cellDisplayText(cell,table));
        const r=table.rows.findIndex(row=>row.id===cell.rowId),c=table.columns.findIndex(col=>col.id===cell.columnId);
        const cellLocation={...location,tableId:table.id,cellId:cell.id};
        check(b.xQ,x[c],'cell x',cellLocation);check(b.yQ,y[r],'cell y',cellLocation);
        check(b.widthQ,x[c+(cell.span?.columns??1)]-x[c],'cell width',cellLocation);
        check(b.heightQ,y[r+(cell.span?.rows??1)]-y[r],'cell height',cellLocation);
        const css=getComputedStyle(cellNode),padding=plan.styles.get(cell.id)!.paddingQ;
        for(const side of ['top','right','bottom','left'] as const)check(pxToQ(parseFloat(css.getPropertyValue('padding-'+side))),padding[side],'cell padding '+side,cellLocation);
        facts.push({kind:'cell',pageId:page.id,tableId:table.id,cellId:cell.id,...b,
          intrinsicContentWidthQ:metrics.widthQ,intrinsicContentHeightQ:metrics.heightQ,...(metrics.records?{textFlowSignature:await sha256(JSON.stringify(metrics.records))}:{})});
        if(cell.content.type==='image') {
          const img=flow.querySelector('img')!;
          facts.push({kind:'image',pageId:page.id,tableId:table.id,cellId:cell.id,assetId:cell.content.assetId,naturalWidthQ:pxToQ(img.naturalWidth),naturalHeightQ:pxToQ(img.naturalHeight)});
        }
      }
      const annotationTexts=[...referencedAnnotations(table).map(a=>({id:a.id,rich:annotationDisplayText(a,table)})),...table.legend.map(l=>({id:l.id,rich:legendDisplayText(l)}))];
      for(const annotation of annotationTexts) {
        const node=findElement(intrinsic,'data-annotation-id',annotation.id),flow=node.querySelector<HTMLElement>('[data-flow-root]')!,metrics=intrinsicMetrics(flow,annotation.rich);
        facts.push({kind:'annotation',pageId:page.id,tableId:table.id,annotationId:annotation.id,...bounds(node,intrinsic.getBoundingClientRect()),
          intrinsicContentHeightQ:metrics.heightQ,textFlowSignature:await sha256(JSON.stringify(metrics.records))});
      }
      for(const edge of plan.edges) {
        const node=findElement(grid,'data-paint-edge',edge.id),b=bounds(node,gridRect);
        for(const field of ['xQ','yQ','widthQ','heightQ'] as const)check(b[field],edge[field],'edge '+edge.id+' '+field,{...location,tableId:table.id});
        facts.push({kind:'paintEdge',pageId:page.id,tableId:table.id,edgeId:edge.id,...b,thicknessQ:edge.orientation==='vertical'?b.widthQ:b.heightQ});
      }
    }
  }
  facts.sort((a,b)=>factKey(a)<factKey(b)?-1:factKey(a)>factKey(b)?1:0);
  return {facts,geometryDiagnostics};
}
export function compareSnapshots(a:LayoutSnapshot,b:LayoutSnapshot):Diagnostic[] {
  const before=new Map(a.facts.map(f=>[factKey(f),JSON.stringify(f)])),after=new Map(b.facts.map(f=>[factKey(f),JSON.stringify(f)]));
  const keys=[...new Set([...before.keys(),...after.keys()])].sort();
  return keys.filter(key=>before.get(key)!==after.get(key)).map(key=>diagnostic('LAYOUT_UNSTABLE',key));
}
export function tableConstraints(table:TableModel,root:HTMLElement,plan:TablePlan):{baseIntrinsicU:number[];constraints:SpanConstraint[]} {
  const baseIntrinsicU=table.rows.map(()=>0),constraints:SpanConstraint[]=[];
  const grid=findElement(root,'data-table-id',table.id);
  for(const cell of orderedAnchors(table)) {
    const flow=findElement(grid,'data-cell-id',cell.id).querySelector<HTMLElement>('[data-flow-root]')!;
    const metrics=intrinsicMetrics(flow,cellDisplayText(cell,table)),padding=plan.styles.get(cell.id)!.paddingQ;
    const requiredU=qToU(sum([metrics.heightQ,padding.top,padding.bottom]));
    const row=table.rows.findIndex(r=>r.id===cell.rowId),column=table.columns.findIndex(c=>c.id===cell.columnId),span=cell.span?.rows??1;
    if(span>1)constraints.push({cellId:cell.id,row,column,span,requiredU});else baseIntrinsicU[row]=Math.max(baseIntrinsicU[row],requiredU);
  }
  return {baseIntrinsicU,constraints};
}
