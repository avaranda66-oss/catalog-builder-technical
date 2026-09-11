import type { CatalogDocument, Cell, TableAnnotation, TableLegendEntry, TableModel, RichText } from '../domain/editorial-model';
import { plainRichText } from '../domain/editorial-model';
import { orderedAnchors } from '../table/table-model';
import { projectTracks, resolveColumns } from '../table/table-layout';
import { asDiagnostic, type Diagnostic, VNextError } from '../domain/diagnostics';
import { walkPageObjects } from '../domain/object-tree';
import { resolveCellStyle, resolveStyle, type ResolvedStyle } from './style';
import type { PaintEdge } from './border-paint';

export interface TablePlan {
  tableId:string;objectId:string;pageId:string;
  frameU:number;widthsU:number[];frameQ:number;trackQ:number[];
  styles:Map<string,ResolvedStyle>;annotationStyle:ResolvedStyle;
  heightsU?:number[];rowQ?:number[];edges:PaintEdge[];suppressed:string[];
  diagnostics:Diagnostic[];
}
export function compilePlans(doc:CatalogDocument):{plans:Map<string,TablePlan>;diagnostics:Diagnostic[]} {
  const plans=new Map<string,TablePlan>(),diagnostics:Diagnostic[]=[];
  for(const page of doc.pages)for(const {object} of walkPageObjects(page))if(object.type==='table') {
    try {
      const result=resolveColumns(object.table.columns,object.frame.widthMm);
      if(!result.ok)throw new VNextError(result.code,result.details);
      const projected=projectTracks(result.widthsU,result.availableTrackWidthU);
      plans.set(object.table.id,{tableId:object.table.id,objectId:object.id,pageId:page.id,
        frameU:result.availableTrackWidthU,widthsU:result.widthsU,...projected,
        styles:new Map(orderedAnchors(object.table).map(cell=>[cell.id,resolveCellStyle(doc.style,object.table,cell)])),
        annotationStyle:resolveStyle(doc.style.defaultText,[object.table.style.annotation]),
        edges:[],suppressed:[],diagnostics:[]});
    }catch(error){diagnostics.push({...asDiagnostic(error),pageId:page.id,objectId:object.id,tableId:object.table.id});}
  }
  return {plans,diagnostics};
}
export function referencedAnnotations(table:TableModel):TableAnnotation[] {
  const refs=new Set([...(table.annotationIds??[]),...orderedAnchors(table).flatMap(cell=>cell.annotationIds??[])]);
  return table.annotations.filter(annotation=>refs.has(annotation.id));
}
export function annotationNumber(table:TableModel,id:string):number {
  return table.annotations.filter(a=>a.kind!=='caption').findIndex(a=>a.id===id)+1;
}
/** A deterministic display projection of semantic values/references; never persisted. */
export function cellDisplayText(cell:Cell,table:TableModel):RichText|undefined {
  const content=cell.content;
  let rich:RichText;
  switch(content.type) {
    case 'image':return undefined;
    case 'richText':rich=content.value;break;
    case 'empty':rich=plainRichText(cell.id+':display','');break;
    case 'technicalCode':rich=plainRichText(cell.id+':display',content.value);break;
    case 'measurement':rich=plainRichText(cell.id+':display',(content.qualifier?{approx:'≈ ',min:'≥ ',max:'≤ '}[content.qualifier]:'')+content.valueText+' '+content.unit);break;
    case 'marker': {
      const legend=table.legend.find(l=>l.id===content.legendEntryId);
      if(!legend)throw new VNextError('MARKER_LEGEND_REFERENCE_DANGLING');
      rich=plainRichText(cell.id+':display',legend.markerCode);break;
    }
  }
  if(!cell.annotationIds?.length)return rich;
  const paragraphs=rich.paragraphs.map(p=>({...p,inlines:[...p.inlines]}));
  if(!paragraphs.length)paragraphs.push({id:cell.id+':refs-p',inlines:[]});
  const last=paragraphs[paragraphs.length-1];
  cell.annotationIds.forEach(id=>last.inlines.push({kind:'text',id:cell.id+':ref:'+id,text:String(annotationNumber(table,id)),marks:['superscript']}));
  return {paragraphs};
}
export function annotationDisplayText(annotation:TableAnnotation,table:TableModel):RichText {
  if(annotation.kind==='caption')return annotation.text;
  const prefix={kind:'text' as const,id:annotation.id+':number',text:annotationNumber(table,annotation.id)+'. ',marks:[]};
  const paragraphs=annotation.text.paragraphs.map(p=>({...p,inlines:[...p.inlines]}));
  if(!paragraphs.length)paragraphs.push({id:annotation.id+':empty-p',inlines:[]});
  paragraphs[0].inlines.unshift(prefix);
  return {paragraphs};
}
export function legendDisplayText(legend:TableLegendEntry):RichText {
  const paragraphs=legend.text.paragraphs.map(p=>({...p,inlines:[...p.inlines]}));
  if(!paragraphs.length)paragraphs.push({id:legend.id+':empty-p',inlines:[]});
  paragraphs[0].inlines.unshift({kind:'text',id:legend.id+':marker',text:legend.markerCode+'  ',marks:[]});
  return {paragraphs};
}
