import type { CatalogDocument, Page } from '../domain/editorial-model';
import type { TablePlan } from './render-plan';
import { mmToU,qCss,uToQ } from '../domain/physical';
import { PrimitiveRenderer } from './PrimitiveRenderer';

export function PageRenderer({page,document,pageNumber,plans,assetUrls}:{page:Page;document:CatalogDocument;pageNumber:number;plans:ReadonlyMap<string,TablePlan>;assetUrls:ReadonlyMap<string,string>}) {
  const px=(mm:number)=>qCss(uToQ(mmToU(mm)));
  return <section data-page-id={page.id} className="editorial-page" aria-label={'Página '+pageNumber}
    style={{width:px(page.widthMm),height:px(page.heightMm)}}>
    {page.objects.map((object,index)=>({object,index})).sort((a,b)=>a.object.zIndex-b.object.zIndex||a.index-b.index).map(({object})=><div
      key={object.id} data-object-id={object.id} className="editorial-object" style={{left:px(object.frame.xMm),top:px(object.frame.yMm),
        width:px(object.frame.widthMm),height:px(object.frame.heightMm),zIndex:object.zIndex}}>
      <PrimitiveRenderer object={object} document={document} plans={plans} assetUrls={assetUrls}/>
    </div>)}
  </section>;
}
