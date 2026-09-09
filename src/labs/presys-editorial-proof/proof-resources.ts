import type { CatalogDocument } from './proof-model';
import { ProofError } from './diagnostics';
const ta25nUrl=new URL('./assets/ta-25n.jpg',import.meta.url).href;
const registry=new Map([['asset-ta25n',ta25nUrl]]);
export async function sha256(value:string|ArrayBuffer):Promise<string> {
  const bytes=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export interface ResourceManifest {
  rendererVersion:'foundation-proof-01-r1';
  schemaVersion:1;locale:string;documentHash:string;
  fonts:{family:string;revision:string;weight:number;style:string;loadedFaces:number}[];
  assets:{id:string;version:string;sha256:string;widthPx:number;heightPx:number;mime:string}[];
}
/** Watchdog rejection is never considered readiness. Cleared immediately on completion. */
export async function watchdog<T>(promise:Promise<T>,code:string,milliseconds=15000):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new ProofError(code)),milliseconds);})]);}
  finally{if(timer!==undefined)clearTimeout(timer);}
}
export function verifyFontManifest(doc:CatalogDocument,root:HTMLElement):void {
  for(const node of root.querySelectorAll<HTMLElement>('[data-flow-root],[data-inline-id]')) {
    const style=getComputedStyle(node),family=style.fontFamily.replace(/["']/g,'').trim();
    if(!doc.style.fonts.some(f=>f.family===family&&String(f.weight)===style.fontWeight&&f.style===style.fontStyle))
      throw new ProofError('REQUIRED_FONT_MISSING',family+' / '+style.fontWeight+' / '+style.fontStyle);
  }
}
export async function loadFonts(doc:CatalogDocument,root:HTMLElement):Promise<ResourceManifest['fonts']> {
  verifyFontManifest(doc,root);
  const sample=JSON.stringify(doc);
  const loaded=await Promise.all(doc.style.fonts.map(async font=>{
    if(!['Noto Sans','Noto Sans JP'].includes(font.family)||font.revision!=='5.3.0')throw new ProofError('REQUIRED_FONT_MISSING',font.family+'@'+font.revision);
    const descriptor=`${font.style} ${font.weight} 12pt "${font.family}"`;
    let faces:FontFace[];
    try{faces=await watchdog(document.fonts.load(descriptor,sample),'FONT_READINESS_TIMEOUT');}
    catch(error){throw new ProofError('REQUIRED_FONT_MISSING',String(error));}
    if(!faces.length||faces.some(f=>f.status!=='loaded')||!document.fonts.check(descriptor,sample))throw new ProofError('REQUIRED_FONT_MISSING',descriptor);
    return {...font,loadedFaces:faces.length};
  }));
  await watchdog(document.fonts.ready,'FONT_READINESS_TIMEOUT');
  return loaded;
}
export async function resolveAssets(doc:CatalogDocument):Promise<{urls:Map<string,string>;manifest:ResourceManifest['assets']}> {
  const urls=new Map<string,string>(),manifest:ResourceManifest['assets']=[];
  try {
    for(const asset of doc.assets) {
      const known=registry.get(asset.id);
      if(!known)throw new ProofError('REQUIRED_ASSET_MISSING',asset.id);
      let response:Response;
      try{response=await watchdog(fetch(known,{cache:'no-store'}),'ASSET_READINESS_TIMEOUT');}
      catch(error){throw new ProofError('REQUIRED_ASSET_MISSING',String(error));}
      if(!response.ok)throw new ProofError('REQUIRED_ASSET_MISSING',asset.id);
      const bytes=await response.arrayBuffer();
      if(await sha256(bytes)!==asset.sha256)throw new ProofError('ASSET_HASH_MISMATCH',asset.id);
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
    if(!asset)throw new ProofError('ASSET_REFERENCE_DANGLING');
    if(image.src!==urls.get(asset.id))throw new ProofError('ASSET_REVISION_CHANGED',asset.id);
    try{await watchdog(image.decode(),'IMAGE_DECODE_TIMEOUT');}catch(error){throw new ProofError('IMAGE_DECODE_FAILED',String(error));}
    if(!image.complete||!image.naturalWidth||!image.naturalHeight)throw new ProofError('IMAGE_DECODE_FAILED',asset.id);
    if(image.naturalWidth!==asset.widthPx||image.naturalHeight!==asset.heightPx)throw new ProofError('ASSET_DIMENSIONS_MISMATCH',asset.id);
  }));
}
