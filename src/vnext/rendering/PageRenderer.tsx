import type { CatalogDocument, EditorialObject, GroupObject, LeafEditorialObject, Page } from '../domain/editorial-model';
import type { TablePlan } from './render-plan';
import { add,mmToU,qCss,uToQ } from '../domain/physical';
import { PAGE_FOOTER_GEOMETRY, pageFooterBandMm, pageFooterFont, pageFooterTexts, type PageFooterTexts } from '../domain/page-footer';
import { PrimitiveRenderer } from './PrimitiveRenderer';

/**
 * Onda 4 (FR-55): the control footer is a property of the catalog, drawn on top of the page like the page number of a
 * master page. It is never an object: it cannot be clicked, moved or deleted by accident, and screen and PDF draw the
 * same words in the same box (inside the safe area). Each part is a flow root, so the font check covers it.
 */
function PageFooterBand({page,document,texts}:{page:Page;document:CatalogDocument;texts:PageFooterTexts}) {
  const px=(mm:number)=>qCss(uToQ(mmToU(mm)));
  const band=pageFooterBandMm(page),font=pageFooterFont(document.style),g=PAGE_FOOTER_GEOMETRY;
  // The face is set on each printed part itself (not inherited), so the font check reads exactly what prints.
  const typography={fontFamily:'"'+font.family+'"',fontWeight:font.weight,fontStyle:font.style,fontSize:g.fontSizePt+'pt',lineHeight:g.lineHeight,color:g.color};
  return <div data-page-footer="" className="editorial-page-footer"
    style={{left:px(band.xMm),top:px(band.yMm),width:px(band.widthMm),height:px(band.heightMm)}}>
    <div data-flow-root="" data-page-footer-part="control" style={typography}>{texts.control}</div>
    <div data-flow-root="" data-page-footer-part="number" style={typography}>{texts.pageNumber}</div>
  </div>;
}

export function PageRenderer({page,document,pageNumber,pageCount=document.pages.length,plans,assetUrls}:{page:Page;document:CatalogDocument;pageNumber:number;pageCount?:number;plans:ReadonlyMap<string,TablePlan>;assetUrls:ReadonlyMap<string,string>}) {
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
  // Onda 3.5 (P1.2): the page's own background (colour and/or picture) is a page property, never a clickable object.
  const background=page.background,backgroundUrl=background?.image?assetUrls.get(background.image.assetId):undefined;
  const footer=pageFooterTexts(document,pageNumber,pageCount);
  return <section data-page-id={page.id} className="editorial-page" aria-label={'Página '+pageNumber}
    data-page-background={background?'':undefined}
    style={{width:px(page.widthMm),height:px(page.heightMm),
      ...(background?.color?{backgroundColor:background.color}:{}),
      ...(background?.image&&backgroundUrl?{backgroundImage:`url("${backgroundUrl.replace(/"/g,'%22')}")`,backgroundSize:background.image.fit,
        backgroundPosition:'50% 50%',backgroundRepeat:'no-repeat'}:{})}}>
    {page.objects.map((object,index)=>({object,index})).sort((a,b)=>a.object.zIndex-b.object.zIndex||a.index-b.index).map(({object})=>renderObject(object))}
    {footer&&<PageFooterBand page={page} document={document} texts={footer}/>}
  </section>;
}
