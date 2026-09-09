import type { CatalogDocument, Page } from '../domain/editorial-model';
import type { TablePlan } from './render-plan';
import { mmToU,qCss,uToQ } from '../domain/physical';
import { TableRenderer } from './TableRenderer';
import { RichTextRenderer,typography } from './RichTextRenderer';
import { resolveStyle } from './style';

export function PageRenderer({page,document,pageNumber,pageCount,plans,assetUrls,footerLabel}:{page:Page;document:CatalogDocument;pageNumber:number;pageCount:number;plans:ReadonlyMap<string,TablePlan>;assetUrls:ReadonlyMap<string,string>;footerLabel?:string}) {
  const px=(mm:number)=>qCss(uToQ(mmToU(mm)));
  return <section data-page-id={page.id} className="editorial-page" aria-label={'Página '+pageNumber}
    style={{width:px(page.widthMm),height:px(page.heightMm)}}>
    {page.objects.map((object,index)=>({object,index})).sort((a,b)=>a.object.zIndex-b.object.zIndex||a.index-b.index).map(({object})=><div
      key={object.id} data-object-id={object.id} className="editorial-object" style={{left:px(object.frame.xMm),top:px(object.frame.yMm),
        width:px(object.frame.widthMm),height:px(object.frame.heightMm),zIndex:object.zIndex}}>
      {object.type==='table'?<TableRenderer table={object.table} plan={plans.get(object.table.id)} assets={document.assets} assetUrls={assetUrls}/>:<div
        className="editorial-text" style={typography(resolveStyle(document.style.defaultText,[object.style]))}>
        <div data-flow-root=""><RichTextRenderer rich={object.text}/></div>
      </div>}
    </div>)}
    {footerLabel&&<div className="editorial-page-number" data-page-number={pageNumber} style={{left:px(12),right:px(12),bottom:px(6),fontFamily:'"'+document.style.defaultText.fontFamily+'"'}}>
      <span>{footerLabel}</span><span>{pageNumber} / {pageCount}</span>
    </div>}
  </section>;
}
