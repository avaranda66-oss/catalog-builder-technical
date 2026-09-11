import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useState } from 'react';
import {
  CatalogDocumentSchema,
  VNextError,
  asDiagnostic,
  authoredFrames,
  walkPageObjects,
  validateDocument,
  type CatalogDocument,
  type Diagnostic,
} from '@/vnext';
import {
  DocumentRenderer,
  captureSnapshot,
  compareSnapshots,
  compilePlans,
  decodeImages,
  loadFonts,
  measureTables,
  resolveAssets,
  sha256,
  tableConstraints,
  verifyFontManifest,
  type LayoutSnapshot,
  type ResourceManifest,
  type TablePlan,
} from '@/vnext/rendering';
import { layoutReport } from '@/vnext/publication';
import { makeFixture,fixtureNames,type FixtureName } from './fixtures';
import './proof.css';

const ta25nUrl=new URL('./assets/ta-25n.jpg',import.meta.url).href;
const labAssetRegistry=new Map([['asset-ta25n',ta25nUrl]]);

export interface PhaseRecord {phase:string;documentHash:string;framesHash:string;elapsedMs:number}
export interface ProofResult {
  status:'READY'|'BLOCKED';fixture:string;diagnostics:Diagnostic[];phases:PhaseRecord[];
  manifest?:ResourceManifest;snapshot?:LayoutSnapshot;
  durations:{renderMs:number;resourcesMs:number;measurementMs:number;preflightStabilityMs:number;totalMs:number};
  tables:{id:string;rows:number;columns:number;cells:number;anchors:number;widthsU:number[];trackQ:number[];heightsU:number[];rowQ:number[];paintEdges:number;suppressed:string[]}[];
}
const host=document.getElementById('editorial-host')!,editorialRoot=createRoot(host);
let currentDocument:CatalogDocument;
let currentPlans=new Map<string,TablePlan>(),currentUrls=new Map<string,string>();
let currentResult:ProofResult|undefined,busy=false;
let currentJobStart=0;
let notify:(result:ProofResult|undefined,busy:boolean)=>void=()=>{};
function renderTree():void {
  flushSync(()=>editorialRoot.render(<DocumentRenderer document={currentDocument} plans={currentPlans} assetUrls={currentUrls}/>));
  decorateProofPages();
}
function decorateProofPages():void {
  const pages=[...host.querySelectorAll<HTMLElement>('[data-editorial-root] .editorial-page')];
  pages.forEach((page,index)=>{
    page.querySelector('.proof-page-footer')?.remove();
    const footer=document.createElement('div');footer.className='proof-page-footer';
    footer.style.fontFamily='"'+currentDocument.style.defaultText.fontFamily+'"';
    const label=document.createElement('span');label.textContent='PRESYS · PROVA EDITORIAL R0';
    const pageNumber=document.createElement('span');pageNumber.textContent=(index+1)+' / '+pages.length;
    footer.append(label,pageNumber);page.append(footer);
  });
}
function freeze<T>(value:T):T {
  if(value && typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}
  return value;
}
async function checkpoint(phase:string,start:number,phases:PhaseRecord[]):Promise<void> {
  phases.push({phase,documentHash:await sha256(JSON.stringify(currentDocument)),framesHash:await sha256(authoredFrames(currentDocument)),elapsedMs:performance.now()-start});
  if(phases.some(p=>p.documentHash!==phases[0].documentHash||p.framesHash!==phases[0].framesHash))throw new VNextError('AUTHORSHIP_MUTATED',phase);
}
async function runDocument(input:CatalogDocument,fixture:string):Promise<ProofResult> {
  if(busy)throw new VNextError('PROOF_JOB_BUSY');
  busy=true;currentResult=undefined;notify(undefined,true);
  flushSync(()=>editorialRoot.render(null));
  currentUrls.forEach(url=>URL.revokeObjectURL(url));currentUrls=new Map();currentPlans=new Map();
  currentDocument=freeze(structuredClone(input));
  const start=performance.now(),phases:PhaseRecord[]=[],diagnostics:Diagnostic[]=[];
  currentJobStart=start;
  const durations={renderMs:0,resourcesMs:0,measurementMs:0,preflightStabilityMs:0,totalMs:0};
  let manifest:ResourceManifest|undefined,snapshot:LayoutSnapshot|undefined;
  try {
    await checkpoint('before-validation',start,phases);
    diagnostics.push(...validateDocument(currentDocument));
    await checkpoint('validation',start,phases);
    if(diagnostics.some(d=>d.severity==='ERROR'))throw new VNextError('DOCUMENT_VALIDATION_BLOCKED');
    CatalogDocumentSchema.parse(currentDocument);
    const compiled=compilePlans(currentDocument);currentPlans=compiled.plans;diagnostics.push(...compiled.diagnostics);
    const renderStart=performance.now();renderTree();durations.renderMs=performance.now()-renderStart;
    await checkpoint('render',start,phases);
    const resourcesStart=performance.now();
    const fonts=await loadFonts(currentDocument,host);await checkpoint('fonts-loaded',start,phases);
    const assets=await resolveAssets(currentDocument,asset=>labAssetRegistry.get(asset.id));currentUrls=assets.urls;
    await checkpoint('assets-resolved',start,phases);
    renderTree();await decodeImages(host,currentDocument,currentUrls);
    await checkpoint('images-decoded',start,phases);durations.resourcesMs=performance.now()-resourcesStart;
    manifest={rendererVersion:'foundation-proof-01-r1',schemaVersion:1,locale:currentDocument.locale,documentHash:phases[0].documentHash,fonts,assets:assets.manifest};
    const measurementStart=performance.now();measureTables(currentDocument,currentPlans,host);renderTree();
    durations.measurementMs=performance.now()-measurementStart;await checkpoint('measurement',start,phases);
    const stabilityStart=performance.now();
    const a=await captureSnapshot(currentDocument,currentPlans,host);
    diagnostics.push(...layoutReport(currentDocument,currentPlans,a,host));await checkpoint('preflight',start,phases);
    const b=await captureSnapshot(currentDocument,currentPlans,host);
    diagnostics.push(...compareSnapshots(a,b));snapshot=b;
    await checkpoint('stability',start,phases);durations.preflightStabilityMs=performance.now()-stabilityStart;
  }catch(error){diagnostics.push(asDiagnostic(error));}
  finally{await checkpoint('job-end',start,phases);busy=false;}
  durations.totalMs=performance.now()-start;
  const tables=[...currentPlans.values()].map(plan=>{
    const object=currentDocument.pages.flatMap(p=>walkPageObjects(p).map(entry=>entry.object)).find(o=>o.type==='table'&&o.table.id===plan.tableId)!;
    if(object.type!=='table')throw new VNextError('TABLE_NOT_FOUND');
    return {id:plan.tableId,rows:object.table.rows.length,columns:object.table.columns.length,cells:object.table.cells.length,
      anchors:object.table.cells.filter(c=>!c.coveredBy).length,widthsU:plan.widthsU,trackQ:plan.trackQ,heightsU:plan.heightsU??[],rowQ:plan.rowQ??[],paintEdges:plan.edges.length,suppressed:plan.suppressed};
  });
  currentResult={status:diagnostics.some(d=>d.severity==='ERROR')?'BLOCKED':'READY',fixture,diagnostics,phases,manifest,snapshot,durations,tables};
  notify(currentResult,false);return currentResult;
}
export const proofApi={
  loadFixture:(name:FixtureName|'all')=>runDocument(makeFixture(name),name),
  runDocument,
  makeFixture,
  get result(){return currentResult;},
  get document(){return currentDocument;},
  get busy(){return busy;},
  snapshot:()=>captureSnapshot(currentDocument,currentPlans,host),
  compareSnapshots,
  preflight:async()=>{
    const snapshot=await captureSnapshot(currentDocument,currentPlans,host);
    return layoutReport(currentDocument,currentPlans,snapshot,host);
  },
  beforeExport:async()=>{
    if(!currentResult||currentResult.status!=='READY'||!currentResult.snapshot)throw new VNextError('PDF_EXPORT_BLOCKED');
    verifyFontManifest(currentDocument,host);
    await decodeImages(host,currentDocument,currentUrls);
    const a=await captureSnapshot(currentDocument,currentPlans,host);
    const issues=[...layoutReport(currentDocument,currentPlans,a,host),...compareSnapshots(currentResult.snapshot,a)];
    const b=await captureSnapshot(currentDocument,currentPlans,host);issues.push(...compareSnapshots(a,b));
    if(issues.some(d=>d.severity==='ERROR'))throw new VNextError('PDF_EXPORT_BLOCKED',JSON.stringify(issues));
    await checkpoint('before-pdf',currentJobStart,currentResult.phases);
    return {documentHash:await sha256(JSON.stringify(currentDocument)),framesHash:await sha256(authoredFrames(currentDocument)),snapshot:b};
  },
  afterExport:async()=>{
    if(!currentResult)throw new VNextError('PDF_EXPORT_BLOCKED');
    const snapshot=await captureSnapshot(currentDocument,currentPlans,host);
    if(!currentResult.snapshot||compareSnapshots(currentResult.snapshot,snapshot).length)throw new VNextError('LAYOUT_UNSTABLE','Layout changed during PDF generation');
    await checkpoint('after-pdf',currentJobStart,currentResult.phases);
    return {documentHash:await sha256(JSON.stringify(currentDocument)),framesHash:await sha256(authoredFrames(currentDocument)),layoutStable:true};
  },
  constraints:()=>currentDocument.pages.flatMap(p=>walkPageObjects(p).map(entry=>entry.object)).filter(o=>o.type==='table').map(o=>{
    if(o.type!=='table')throw new VNextError('TABLE_NOT_FOUND');
    const plan=currentPlans.get(o.table.id)!;
    return {tableId:o.table.id,frameHeightMm:o.frame.heightMm,...tableConstraints(o.table,host,plan),heightsU:plan.heightsU,rows:o.table.rows};
  }),
};
declare global {interface Window {proof:typeof proofApi}}
window.proof=proofApi;
function LabControls() {
  const [result,setResult]=useState<ProofResult>(),[running,setRunning]=useState(false);
  notify=(value,busy)=>{setResult(value);setRunning(busy);};
  return <>
    <header className="lab-toolbar"><strong>PRESYS · Foundation proof</strong>
      {[...fixtureNames,'all' as const].map(name=><button key={name} disabled={running} onClick={()=>{void proofApi.loadFixture(name);}}>{name==='all'?'G01–G04 · PDF':name}</button>)}
      <span>{running?'Verificando…':result?.status==='READY'?'Pronto para exportação verificada':'Prova local'}</span>
    </header>
    <div className="lab-summary" data-status={result?.status??'RUNNING'}>
      {result?result.fixture+' · '+result.status+' · '+result.tables.length+' tabelas · '+result.diagnostics.length+' diagnósticos · '+result.durations.totalMs.toFixed(0)+' ms':'Preparando documento, fontes e imagens.'}
    </div>
    {!!result?.diagnostics.length&&<ul className="lab-diagnostics">{result.diagnostics.map((d,i)=><li key={i}>{d.severity} · {d.code} · {d.cellId??d.objectId??''} · {d.details}</li>)}</ul>}
  </>;
}
flushSync(()=>createRoot(document.getElementById('lab-host')!).render(<LabControls/>));
const requested=new URLSearchParams(location.search).get('fixture');
void proofApi.loadFixture(requested==='all'||fixtureNames.includes(requested as FixtureName)?requested as FixtureName|'all':'G01');
