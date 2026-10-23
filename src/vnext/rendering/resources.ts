import type { AssetRef, CatalogDocument } from '../domain/editorial-model';
import { VNextError } from '../domain/diagnostics';
import { sha256 } from '../asset/integrity';
import { referencedAssets } from '../asset/referenced-assets';
import { allPageFooterText } from '../domain/page-footer';

export { sha256 };

export interface ResourceManifest {
  rendererVersion:string;
  schemaVersion:1;locale:string;documentHash:string;
  fonts:{family:string;revision:string;weight:number;style:string;loadedFaces:number}[];
  assets:{id:string;version:string;sha256:string;widthPx:number;heightPx:number;mime:string}[];
}

export type AssetUrlResolver=(asset:AssetRef)=>string|undefined;

/** Watchdog rejection is never considered readiness. Cleared immediately on completion. */
export async function watchdog<T>(promise:Promise<T>,code:string,milliseconds=15000):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new VNextError(code)),milliseconds);})]);}
  finally{if(timer!==undefined)clearTimeout(timer);}
}

export function verifyFontManifest(doc:CatalogDocument,root:HTMLElement):void {
  for(const node of root.querySelectorAll<HTMLElement>('[data-flow-root],[data-inline-id]')) {
    const style=getComputedStyle(node),family=style.fontFamily.replace(/["']/g,'').trim();
    if(!doc.style.fonts.some(f=>f.family===family&&String(f.weight)===style.fontWeight&&f.style===style.fontStyle))
      throw new VNextError('REQUIRED_FONT_MISSING',family+' / '+style.fontWeight+' / '+style.fontStyle);
  }
}

/**
 * FR-82: the only faces a catalog may print with. Each one is bundled with the app (rendering/styles.css imports the
 * pinned @fontsource 5.3.0 files, SIL Open Font License), so the browser embeds the very same font in every PDF and
 * never falls back to a system font. A new brand face (e.g. a condensed one) needs its files imported there and a
 * line here; until then a document that asks for it is blocked instead of printed with a stand-in.
 */
export const BUNDLED_FONT_FACES:readonly Readonly<{family:string;revision:string;weight:400|700;style:'normal'|'italic'}>[]=Object.freeze([
  {family:'Noto Sans',revision:'5.3.0',weight:400,style:'normal'},
  {family:'Noto Sans',revision:'5.3.0',weight:700,style:'normal'},
  {family:'Noto Sans',revision:'5.3.0',weight:400,style:'italic'},
  {family:'Noto Sans',revision:'5.3.0',weight:700,style:'italic'},
  {family:'Noto Sans JP',revision:'5.3.0',weight:400,style:'normal'},
]);
export function isBundledFontFace(font:{family:string;revision:string;weight:number;style:string}):boolean {
  return BUNDLED_FONT_FACES.some(face=>face.family===font.family&&face.revision===font.revision&&face.weight===font.weight&&face.style===font.style);
}

/**
 * The text whose glyphs must be loaded before printing: the document itself plus what the page footer computes
 * ("Página 2 de 11", the formatted date), which is not stored in the document (FR-55).
 */
export function fontSampleText(doc:CatalogDocument):string {
  return JSON.stringify(doc)+' '+allPageFooterText(doc);
}

export async function loadFonts(doc:CatalogDocument,root:HTMLElement):Promise<ResourceManifest['fonts']> {
  verifyFontManifest(doc,root);
  const sample=fontSampleText(doc);
  const loaded=await Promise.all(doc.style.fonts.map(async font=>{
    if(!isBundledFontFace(font))throw new VNextError('REQUIRED_FONT_MISSING',font.family+'@'+font.revision+' '+font.weight+' '+font.style);
    const descriptor=`${font.style} ${font.weight} 12pt "${font.family}"`;
    let faces:FontFace[];
    try{faces=await watchdog(document.fonts.load(descriptor,sample),'FONT_READINESS_TIMEOUT');}
    catch(error){throw new VNextError('REQUIRED_FONT_MISSING',String(error));}
    if(!faces.length||faces.some(f=>f.status!=='loaded')||!document.fonts.check(descriptor,sample))throw new VNextError('REQUIRED_FONT_MISSING',descriptor);
    return {...font,loadedFaces:faces.length};
  }));
  await watchdog(document.fonts.ready,'FONT_READINESS_TIMEOUT');
  return loaded;
}

/**
 * Fetches and verifies only the photos the pages and table cells actually use (FR-41).
 * Old photos left in `doc.assets` after a replace or delete never block publication.
 */
export async function resolveAssets(doc:CatalogDocument,resolveAssetUrl:AssetUrlResolver):Promise<{urls:Map<string,string>;manifest:ResourceManifest['assets']}> {
  const urls=new Map<string,string>(),manifest:ResourceManifest['assets']=[];
  try {
    for(const asset of referencedAssets(doc)) {
      const known=resolveAssetUrl(asset);
      if(!known)throw new VNextError('REQUIRED_ASSET_MISSING',asset.id);
      let response:Response;
      try{response=await watchdog(fetch(known,{cache:'no-store'}),'ASSET_READINESS_TIMEOUT');}
      catch(error){throw new VNextError('REQUIRED_ASSET_MISSING',String(error));}
      if(!response.ok)throw new VNextError('REQUIRED_ASSET_MISSING',asset.id);
      const bytes=await response.arrayBuffer();
      if(await sha256(bytes)!==asset.sha256)throw new VNextError('ASSET_HASH_MISMATCH',asset.id);
      const blob=new Blob([bytes],{type:asset.mime});
      urls.set(asset.id,URL.createObjectURL(blob));
      manifest.push({id:asset.id,version:asset.version,sha256:asset.sha256,widthPx:asset.widthPx,heightPx:asset.heightPx,mime:asset.mime});
    }
    return {urls,manifest};
  }catch(error){urls.forEach(url=>URL.revokeObjectURL(url));throw error;}
}

export async function decodeImages(root:HTMLElement,doc:CatalogDocument,urls:ReadonlyMap<string,string>):Promise<void> {
  const images=[...root.querySelectorAll<HTMLImageElement>('img[data-asset-id]')];
  await Promise.all(images.map(async image=>{
    const asset=doc.assets.find(a=>a.id===image.dataset.assetId);
    if(!asset)throw new VNextError('ASSET_REFERENCE_DANGLING');
    if(image.src!==urls.get(asset.id))throw new VNextError('ASSET_REVISION_CHANGED',asset.id);
    try{await watchdog(image.decode(),'IMAGE_DECODE_TIMEOUT');}catch(error){throw new VNextError('IMAGE_DECODE_FAILED',String(error));}
    if(!image.complete||!image.naturalWidth||!image.naturalHeight)throw new VNextError('IMAGE_DECODE_FAILED',asset.id);
    if(image.naturalWidth!==asset.widthPx||image.naturalHeight!==asset.heightPx)throw new VNextError('ASSET_DIMENSIONS_MISMATCH',asset.id);
  }));
}
