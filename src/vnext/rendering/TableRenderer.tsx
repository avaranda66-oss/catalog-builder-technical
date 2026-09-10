import type { AssetRef, TableModel } from '../domain/editorial-model';
import type { TablePlan } from './render-plan';
import { annotationDisplayText,cellDisplayText,legendDisplayText,referencedAnnotations } from './render-plan';
import { orderedAnchors } from '../table/table-model';
import { mmToU,qCss,uToQ } from '../domain/physical';
import { resolveWrap } from './style';
import { RichTextRenderer,typography } from './RichTextRenderer';

export function TableRenderer({table,plan,assets,assetUrls}:{table:TableModel;plan:TablePlan|undefined;assets:readonly AssetRef[];assetUrls:ReadonlyMap<string,string>}) {
  if(!plan)return <div className="invalid-table" role="alert">Tabela bloqueada: geometria inviável.</div>;
  const annotations=referencedAnnotations(table),gap=qCss(uToQ(mmToU(table.style.annotationGapMm)));
  const renderAnnotation=(annotation:typeof annotations[number])=><div key={annotation.id} data-annotation-id={annotation.id}
    className={'editorial-annotation '+annotation.kind} style={{...typography(plan.annotationStyle),marginBottom:annotation.kind==='caption'?gap:0,marginTop:annotation.kind==='caption'?0:gap}}>
    <div data-flow-root=""><RichTextRenderer rich={annotationDisplayText(annotation,table)}/></div>
  </div>;
  const anchors=orderedAnchors(table);
  return <div data-table-intrinsic={table.id} className="table-intrinsic">
    {annotations.filter(a=>a.kind==='caption').map(renderAnnotation)}
    <div data-table-id={table.id} role="table" aria-label={table.id} aria-rowcount={table.rows.length} aria-colcount={table.columns.length}
      className="editorial-grid" style={{width:qCss(plan.frameQ),gridTemplateColumns:plan.trackQ.map(qCss).join(' '),
        gridTemplateRows:plan.rowQ?.map(qCss).join(' ')}}>
      {table.rows.map((row,r)=><div key={row.id} role="row" aria-rowindex={r+1} className="logical-row">
        {anchors.filter(cell=>cell.rowId===row.id).map(cell=>{
          const c=table.columns.findIndex(col=>col.id===cell.columnId),style=plan.styles.get(cell.id)!;
          const rich=cellDisplayText(cell,table);
          const asset=cell.content.type==='image'?assets.find(a=>a.id===(cell.content.type==='image'?cell.content.assetId:'')):undefined;
          const image=cell.contentPresentation?.image;
          return <div key={cell.id} data-cell-id={cell.id} role={row.role==='header'?'columnheader':'cell'}
            aria-rowindex={r+1} aria-colindex={c+1} aria-rowspan={cell.span?.rows} aria-colspan={cell.span?.columns}
            className="editorial-cell" style={{...typography(style),background:style.background,
              gridRow:`${r+1} / span ${cell.span?.rows??1}`,gridColumn:`${c+1} / span ${cell.span?.columns??1}`,
              padding:`${qCss(style.paddingQ.top)} ${qCss(style.paddingQ.right)} ${qCss(style.paddingQ.bottom)} ${qCss(style.paddingQ.left)}`}}>
            <div data-flow-root="">
              {rich&&<RichTextRenderer rich={rich} nowrap={resolveWrap(cell)==='nowrap'}/>}
              {asset&&image&&<img data-asset-id={asset.id} src={assetUrls.get(asset.id)} alt={asset.alt} width={asset.widthPx} height={asset.heightPx}
                style={{display:'block',width:qCss(uToQ(mmToU(image.targetWidthMm))),height:qCss(uToQ(mmToU(image.targetHeightMm))),objectFit:image.fit}}/>}
            </div>
          </div>;
        })}
      </div>)}
      {plan.edges.map(edge=><div key={edge.id} data-paint-edge={edge.id} aria-hidden="true" className="paint-edge"
        style={{left:qCss(edge.xQ),top:qCss(edge.yQ),width:qCss(edge.widthQ),height:qCss(edge.heightQ),background:edge.color}}/>)}
    </div>
    {annotations.filter(a=>a.kind!=='caption').map(renderAnnotation)}
    {table.legend.length>0&&<div className="editorial-legend" style={{...typography(plan.annotationStyle),marginTop:gap}}>
      {table.legend.map(legend=><div key={legend.id} data-annotation-id={legend.id} className="legend-entry">
        <div data-flow-root=""><RichTextRenderer rich={legendDisplayText(legend)}/></div>
      </div>)}
    </div>}
  </div>;
}
