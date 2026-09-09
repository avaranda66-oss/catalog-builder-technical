import type { CatalogDocument, Page } from './proof-model';
import type { TablePlan } from './proof-render-plan';
import { mmToU,qCss,uToQ } from './physical';
import { ProofTable } from './ProofTable';
import { ProofRichText,typography } from './ProofRichText';
import { resolveStyle } from './proof-style';
export function ProofPage({page,document,pageNumber,pageCount,plans,assetUrls}:{page:Page;document:CatalogDocument;pageNumber:number;pageCount:number;plans:ReadonlyMap<string,TablePlan>;assetUrls:ReadonlyMap<string,string>}) {
  const px=(mm:number)=>qCss(uToQ(mmToU(mm)));
  return <section data-page-id={page.id} className="proof-page" aria-label={'Página '+pageNumber}
    style={{width:px(page.widthMm),height:px(page.heightMm)}}>
    {page.objects.map((object,index)=>({object,index})).sort((a,b)=>a.object.zIndex-b.object.zIndex||a.index-b.index).map(({object})=><div
      key={object.id} data-object-id={object.id} className="proof-object" style={{left:px(object.frame.xMm),top:px(object.frame.yMm),
        width:px(object.frame.widthMm),height:px(object.frame.heightMm),zIndex:object.zIndex}}>
      {object.type==='table'?<ProofTable table={object.table} plan={plans.get(object.table.id)} assets={document.assets} assetUrls={assetUrls}/>:<div
        className="proof-text" style={typography(resolveStyle(document.style.defaultText,[object.style]))}>
        <div data-flow-root=""><ProofRichText rich={object.text}/></div>
      </div>}
    </div>)}
    <div className="page-number" data-page-number={pageNumber} style={{left:px(12),right:px(12),bottom:px(6),fontFamily:'"'+document.style.defaultText.fontFamily+'"'}}>
      <span>PRESYS · PROVA EDITORIAL R0</span><span>{pageNumber} / {pageCount}</span>
    </div>
  </section>;
}
