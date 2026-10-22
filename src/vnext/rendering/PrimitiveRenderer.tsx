import React, { type CSSProperties } from 'react';
import type { AssetRef, Border, CatalogDocument, ImageObject, LeafEditorialObject, TextObject } from '../domain/editorial-model';
import { DEFAULT_IMAGE_FOCAL_POINT } from '../domain/editorial-model';
import { VNextError } from '../domain/diagnostics';
import type { TablePlan } from './render-plan';
import { RichTextRenderer, typography } from './RichTextRenderer';
import { resolveStyle } from './style';
import { TableRenderer } from './TableRenderer';
import { cssStroke, LeaderPaint, LinePaint, lineHasStyle, PolygonPaint, useTextFitScale } from './native-paint';
import { mmToU, qCss, uToQ } from '../domain/physical';

export function imageObjectPosition(image:Pick<ImageObject,'fit'|'focalPoint'>):string {
  if(image.fit==='contain')return '50% 50%';
  const focalPoint=image.focalPoint??DEFAULT_IMAGE_FOCAL_POINT;
  return `${focalPoint.x*100}% ${focalPoint.y*100}%`;
}

function assetFor(assets:readonly AssetRef[],assetId:string):AssetRef {
  const asset=assets.find(candidate=>candidate.id===assetId);
  if(!asset)throw new VNextError('ASSET_REFERENCE_DANGLING',assetId);
  return asset;
}

function strokeStyle(stroke:Border|undefined):CSSProperties['border'] {
  if(!stroke||stroke.pattern==='none')return 'none';
  return `${stroke.thicknessPt}pt solid ${stroke.color}`;
}

/**
 * A text box, optionally with its own background ("Selo", Onda 3.5 E2) and pointer ("Chamada", E3). A plain text
 * box renders exactly as before; the box and the pointer are drawn by the same object, so they never come apart.
 */
function TextPrimitive({object,document}:{object:TextObject;document:CatalogDocument}) {
  const flowRef=React.useRef<HTMLDivElement>(null);
  const style=resolveStyle(document.style.defaultText,[object.style]);
  const box=object.box;
  const paddingMm=box?.paddingMm??0;
  const fit=box?.fitText===true;
  const resetKey=JSON.stringify([object.text,object.style,object.frame.widthMm,paddingMm]);
  const scale=useTextFitScale(flowRef,fit,object.frame.widthMm-2*paddingMm,resetKey);
  const letterSpacing=object.style.letterSpacingEm!==undefined?`${object.style.letterSpacingEm}em`:undefined;
  const base={...typography(style),letterSpacing,...(scale<1?{fontSize:`${Math.round(style.fontSizePt*scale*100)/100}pt`}:{})};
  const px=(mm:number)=>qCss(uToQ(mmToU(mm)));
  const boxStyle:CSSProperties|undefined=box&&{
    position:'relative',width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'center',
    paddingLeft:px(paddingMm),paddingRight:px(paddingMm),background:box.fill??'transparent',border:cssStroke(box.stroke,undefined),
    borderRadius:box.cornerRadiusMm!==undefined?px(box.cornerRadiusMm):px(Math.min(object.frame.widthMm,object.frame.heightMm)/2),
  };
  return <div data-primitive-type="text" data-text-box={box?'':undefined} data-text-fit-scale={fit?String(scale):undefined}
    className="editorial-text" style={{...base,...boxStyle,...(object.leader&&!box?{position:'relative',width:'100%',height:'100%'}:{})}}>
    <div data-flow-root="" ref={flowRef}><RichTextRenderer rich={object.text} nowrap={fit}/></div>
    {object.leader&&<LeaderPaint size={object.frame} leader={object.leader}/>}
  </div>;
}

function assertNever(value:never):never {
  throw new VNextError('UNSUPPORTED_PRIMITIVE',JSON.stringify(value));
}

export function PrimitiveRenderer({
  object,
  document,
  plans,
  assetUrls,
}:{
  object:LeafEditorialObject;
  document:CatalogDocument;
  plans:ReadonlyMap<string,TablePlan>;
  assetUrls:ReadonlyMap<string,string>;
}) {
  switch(object.type) {
    case 'table':
      return <TableRenderer table={object.table} plan={plans.get(object.table.id)} assets={document.assets} assetUrls={assetUrls}/>;
    case 'text':
      if(object.box||object.leader||object.style.letterSpacingEm!==undefined)return <TextPrimitive object={object} document={document}/>;
      return <div data-primitive-type="text" className="editorial-text" style={typography(resolveStyle(document.style.defaultText,[object.style]))}>
        <div data-flow-root=""><RichTextRenderer rich={object.text}/></div>
      </div>;
    case 'image': {
      const asset=assetFor(document.assets,object.assetId);
      return <img data-primitive-type="image" data-asset-id={asset.id} className="editorial-media editorial-image"
        src={assetUrls.get(asset.id) || undefined} alt={asset.alt} width={asset.widthPx} height={asset.heightPx}
        style={{display:'block',width:'100%',height:'100%',objectFit:object.fit,objectPosition:imageObjectPosition(object)}}/>;
    }
    case 'shape':
      return <div data-primitive-type="shape" data-shape={object.shape} className="editorial-shape" aria-hidden="true"
        style={{width:'100%',height:'100%',background:object.style.fill??'transparent',
          border:object.style.strokeDash?cssStroke(object.style.stroke,object.style.strokeDash):strokeStyle(object.style.stroke),
          borderRadius:object.shape==='ellipse'?'50%':object.style.cornerRadiusMm!==undefined?qCss(uToQ(mmToU(object.style.cornerRadiusMm))):0,
          opacity:object.style.opacity}}/>;
    case 'line':
      if(lineHasStyle(object))return <LinePaint object={object}/>;
      return <div data-primitive-type="line" data-line-axis={object.axis} className="editorial-line" aria-hidden="true"
        style={{width:'100%',height:'100%',background:object.color}}/>;
    case 'polygon':
      return <PolygonPaint object={object}/>;
    case 'icon': {
      const asset=assetFor(document.assets,object.assetId);
      return <img data-primitive-type="icon" data-asset-id={asset.id} className="editorial-media editorial-icon"
        src={assetUrls.get(asset.id) || undefined} alt={asset.alt} width={asset.widthPx} height={asset.heightPx}
        style={{display:'block',width:'100%',height:'100%',objectFit:'contain',objectPosition:'50% 50%'}}/>;
    }
    default:return assertNever(object);
  }
}
