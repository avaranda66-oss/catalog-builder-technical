import type { CSSProperties } from 'react';
import type { AssetRef, Border, CatalogDocument, ImageObject, LeafEditorialObject } from '../domain/editorial-model';
import { DEFAULT_IMAGE_FOCAL_POINT } from '../domain/editorial-model';
import { VNextError } from '../domain/diagnostics';
import type { TablePlan } from './render-plan';
import { RichTextRenderer, typography } from './RichTextRenderer';
import { resolveStyle } from './style';
import { TableRenderer } from './TableRenderer';

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
      return <div data-primitive-type="text" className="editorial-text" style={typography(resolveStyle(document.style.defaultText,[object.style]))}>
        <div data-flow-root=""><RichTextRenderer rich={object.text}/></div>
      </div>;
    case 'image': {
      const asset=assetFor(document.assets,object.assetId);
      return <img data-primitive-type="image" data-asset-id={asset.id} className="editorial-media editorial-image"
        src={assetUrls.get(asset.id)} alt={asset.alt} width={asset.widthPx} height={asset.heightPx}
        style={{display:'block',width:'100%',height:'100%',objectFit:object.fit,objectPosition:imageObjectPosition(object)}}/>;
    }
    case 'shape':
      return <div data-primitive-type="shape" data-shape={object.shape} className="editorial-shape" aria-hidden="true"
        style={{width:'100%',height:'100%',background:object.style.fill??'transparent',border:strokeStyle(object.style.stroke),
          borderRadius:object.shape==='ellipse'?'50%':0}}/>;
    case 'line':
      return <div data-primitive-type="line" data-line-axis={object.axis} className="editorial-line" aria-hidden="true"
        style={{width:'100%',height:'100%',background:object.color}}/>;
    case 'icon': {
      const asset=assetFor(document.assets,object.assetId);
      return <img data-primitive-type="icon" data-asset-id={asset.id} className="editorial-media editorial-icon"
        src={assetUrls.get(asset.id)} alt={asset.alt} width={asset.widthPx} height={asset.heightPx}
        style={{display:'block',width:'100%',height:'100%',objectFit:'contain',objectPosition:'50% 50%'}}/>;
    }
    default:return assertNever(object);
  }
}
