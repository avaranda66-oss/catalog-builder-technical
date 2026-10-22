import type { CatalogDocument, EditorialObject, GroupObject, LeafEditorialObject, Page } from '../domain/editorial-model';
import type { TablePlan } from './render-plan';
import { add,mmToU,qCss,uToQ } from '../domain/physical';
import { PrimitiveRenderer } from './PrimitiveRenderer';

export function PageRenderer({page,document,pageNumber,plans,assetUrls}:{page:Page;document:CatalogDocument;pageNumber:number;plans:ReadonlyMap<string,TablePlan>;assetUrls:ReadonlyMap<string,string>}) {
  const px=(mm:number)=>qCss(uToQ(mmToU(mm)));
  // A hidden object ("Camadas") keeps its box, so measurement still finds it, but it is never painted: screen and PDF agree.
  const visibility=(object:EditorialObject)=>object.hidden?{visibility:'hidden' as const}:{};
  const leaf=(object:LeafEditorialObject,left=px(object.frame.xMm),top=px(object.frame.yMm))=><div key={object.id} data-object-id={object.id} data-object-type={object.type} className="editorial-object"
    data-object-hidden={object.hidden?'true':undefined}
    style={{left,top,width:px(object.frame.widthMm),height:px(object.frame.heightMm),zIndex:object.zIndex,...visibility(object)}}>
    <PrimitiveRenderer object={object} document={document} plans={plans} assetUrls={assetUrls}/>
  </div>;
  const group=(object:GroupObject)=>{
    const groupXU=mmToU(object.frame.xMm),groupYU=mmToU(object.frame.yMm);
    const groupXQ=uToQ(groupXU),groupYQ=uToQ(groupYU);
    const groupedLeaf=(child:LeafEditorialObject)=>leaf(
      child,
      qCss(add(uToQ(add(groupXU,mmToU(child.frame.xMm))),-groupXQ)),
      qCss(add(uToQ(add(groupYU,mmToU(child.frame.yMm))),-groupYQ)),
    );
    return <div key={object.id} data-object-id={object.id} data-object-type="group" className="editorial-object editorial-group"
      data-object-hidden={object.hidden?'true':undefined}
      style={{left:qCss(groupXQ),top:qCss(groupYQ),width:px(object.frame.widthMm),height:px(object.frame.heightMm),zIndex:object.zIndex,...visibility(object)}}>
      {object.objects.map((child,index)=>({child,index})).sort((a,b)=>a.child.zIndex-b.child.zIndex||a.index-b.index).map(({child})=>groupedLeaf(child))}
    </div>;
  };
  const renderObject=(object:EditorialObject)=>object.type==='group'?group(object):leaf(object);
  return <section data-page-id={page.id} className="editorial-page" aria-label={'Página '+pageNumber}
    style={{width:px(page.widthMm),height:px(page.heightMm)}}>
    {page.objects.map((object,index)=>({object,index})).sort((a,b)=>a.object.zIndex-b.object.zIndex||a.index-b.index).map(({object})=>renderObject(object))}
  </section>;
}
