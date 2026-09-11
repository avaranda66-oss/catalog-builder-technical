import type { CatalogDocument } from '../domain/editorial-model';
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
export function layoutReport(doc:CatalogDocument,plans:ReadonlyMap<string,TablePlan>,snapshot:LayoutSnapshot,root:HTMLElement):Diagnostic[] {
  const result:Diagnostic[]=[...snapshot.geometryDiagnostics,...authoredFrameDiagnostics(doc)];
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
