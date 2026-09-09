/* global window, document, getComputedStyle, structuredClone, CSS */
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import process from 'node:process';
import console from 'node:console';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument,OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const output=resolve(root,'scratch/presys-editorial-proof');
for(const name of ['matrix','pdf','png','screens','adversarial'])await mkdir(resolve(output,name),{recursive:true});
const write=(path,value)=>writeFile(resolve(output,path),JSON.stringify(value,null,2)+'\n','utf8');
const hash=value=>createHash('sha256').update(typeof value==='string'||value instanceof Uint8Array?value:JSON.stringify(value)).digest('hex');
const runStarted=performance.now();
const evidence={startedAt:new Date().toISOString(),machine:{platform:os.platform(),release:os.release(),arch:os.arch(),cpus:os.cpus()[0]?.model,logicalCPUs:os.cpus().length,totalMemoryBytes:os.totalmem()},matrix:[],adversarial:[],pdf:undefined};
const port=Number(process.env.PROOF_PORT??5197);
const server=await createServer({root,server:{host:'127.0.0.1',port,strictPort:true},logLevel:'error'});
let browser;
const url=`http://127.0.0.1:${port}/src/labs/presys-editorial-proof/index.html`;
async function openPage(context,fixture='all') {
  const page=await context.newPage();
  page.on('pageerror',error=>console.error('Browser error:',error.message));
  await page.goto(url+'?fixture='+fixture,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.proof?.result!==undefined,{timeout:30000});
  return page;
}
async function result(page){return page.evaluate(()=>window.proof.result);}
async function load(page,name){return page.evaluate(name=>window.proof.loadFixture(name),name);}
async function runDoc(page,doc,label){return page.evaluate(({doc,label})=>window.proof.runDocument(doc,label),{doc,label});}
async function sampledLines(page) {
  return page.evaluate(()=>{
    const ids=['g03-note-text:t','g03-footnote-text:t','g03-image:1:2:text:t','g02-c:7:1:display:t','g01-note-text:t'];
    return ids.map(id=>{
      const element=document.querySelector('[data-inline-id="'+CSS.escape(id)+'"]'),text=element.textContent;
      const lines=new Map();
      for(let i=0;i<text.length;i++) {
        const range=document.createRange();range.setStart(element.firstChild,i);range.setEnd(element.firstChild,i+1);
        const rect=range.getClientRects()[0];if(!rect)continue;
        const key=String(rect.top);lines.set(key,(lines.get(key)??'')+text[i]);
      }
      return {id,pageId:element.closest('[data-page-id]').dataset.pageId,lines:[...lines.values()].map(s=>s.trim()).filter(Boolean)};
    });
  });
}
function probeDocument(source,{thickness=1,span='none',equal=false,rowHeights=[10,15],frameHeight=30}={}) {
  const doc=structuredClone(source),t=structuredClone(doc.pages[0].objects.find(o=>o.type==='table').table);
  const widths=equal?[50,50]:[20,30,50],tableId='border-probe';
  t.id=tableId;t.columns=widths.map((mm,i)=>({id:'probe-c'+i,minMm:1,width:{mode:'fixed',mm}}));
  t.rows=rowHeights.map((heightMm,i)=>({id:'probe-r'+i,role:'body',heightPolicy:{mode:'FIXED_MM',heightMm}}));
  t.cells=t.rows.flatMap((row,r)=>t.columns.map((column,c)=>({id:`probe-${r}-${c}`,rowId:row.id,columnId:column.id,content:{type:'technicalCode',value:`R${r}/C${c}`}})));
  for(const side of ['top','right','bottom','left'])t.style.base.borders[side]=thickness?{pattern:'solid',thicknessPt:thickness,color:'#123F59'}:{pattern:'none'};
  t.annotations=[];t.annotationIds=[];t.legend=[];
  if(span!=='none') {
    const rs=span==='column'?1:2,cs=span==='row'?1:2;
    t.cells[0].span={rows:rs,columns:cs};
    for(let r=0;r<rs;r++)for(let c=0;c<cs;c++)if(r||c){const cell=t.cells[r*widths.length+c];cell.content={type:'empty'};cell.coveredBy=t.cells[0].id;}
  }
  doc.pages=[{id:'probe-page',widthMm:210,heightMm:297,safeArea:{topMm:10,rightMm:10,bottomMm:10,leftMm:10},objects:[
    {id:'probe-object',type:'table',frame:{xMm:12,yMm:20,widthMm:100,heightMm:frameHeight},zIndex:0,table:t},
  ]}];doc.assets=[];return doc;
}
async function expectUnstable(page,label,mutate) {
  await load(page,'all');
  const a=await page.evaluate(()=>window.proof.snapshot());
  const sourceBefore=await page.evaluate(()=>JSON.stringify(window.proof.document));
  await mutate();
  const b=await page.evaluate(()=>window.proof.snapshot());
  const changes=await page.evaluate(({a,b})=>window.proof.compareSnapshots(a,b),{a,b});
  assert(changes.length>0,label+' must alter normalized facts');
  assert(changes.every(d=>d.code==='LAYOUT_UNSTABLE'));
  assert.equal(await page.evaluate(()=>JSON.stringify(window.proof.document)),sourceBefore);
  const rejected=await page.evaluate(async()=>{try{await window.proof.beforeExport();return false;}catch{return true;}});
  assert(rejected,label+' must reject export');
  evidence.adversarial.push({label,passed:true,changedFacts:changes.length,exportRejected:true,sourceUnchanged:true});
  await write('adversarial/'+label+'.json',{changes,geometryDiagnostics:b.geometryDiagnostics,beforeHash:hash(a.facts),afterHash:hash(b.facts)});
}
async function assertBlocked(page,label,expectedCodes,report) {
  assert.equal(report.status,'BLOCKED',label+' must block');
  for(const code of expectedCodes)assert(report.diagnostics.some(d=>d.code===code),label+' missing '+code);
  const rejection=await page.evaluate(async()=>{try{await window.proof.beforeExport();return '';}catch(error){return error.message;}});
  assert.match(rejection,/PDF_EXPORT_BLOCKED/);
  evidence.adversarial.push({label,passed:true,codes:report.diagnostics.map(d=>d.code),documentHashes:[...new Set(report.phases.map(p=>p.documentHash))],exportRejected:true});
  assert.equal(new Set(report.phases.map(p=>p.documentHash)).size,1,label+' mutated source');
  assert.equal(new Set(report.phases.map(p=>p.framesHash)).size,1,label+' mutated frames');
  await write('adversarial/'+label+'.json',report);
}
function transformedPoint(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];}
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function imageBounds(m) {
  const points=[[0,0],[0,1],[1,0],[1,1]].map(([x,y])=>transformedPoint(m,x,y));
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
async function inspectPdf(path) {
  const bytes=new Uint8Array(await readFile(path));
  const pdf=await getDocument({data:bytes,isEvalSupported:false,useSystemFonts:false}).promise;
  const pages=[],names=new Map(Object.entries(OPS).map(([name,value])=>[value,name]));
  const imageOpNames=['paintImageXObject','paintInlineImageXObject','paintImageXObjectRepeat','paintInlineImageXObjectGroup','paintImageMaskXObject','paintImageMaskXObjectGroup','paintImageMaskXObjectRepeat','paintSolidColorImageMask'];
  for(let n=1;n<=pdf.numPages;n++) {
    const page=await pdf.getPage(n),text=await page.getTextContent(),operators=await page.getOperatorList();
    const items=text.items.filter(item=>'str' in item),counts={},images=[];
    let matrix=[1,0,0,1,0,0];const stack=[];
    for(let i=0;i<operators.fnArray.length;i++) {
      const name=names.get(operators.fnArray[i])??String(operators.fnArray[i]),args=operators.argsArray[i];
      counts[name]=(counts[name]??0)+1;
      if(name==='save')stack.push([...matrix]);
      if(name==='restore')matrix=stack.pop()??[1,0,0,1,0,0];
      if(name==='transform')matrix=multiply(matrix,args);
      if(imageOpNames.includes(name))images.push({operator:name,args:args.map(arg=>typeof arg==='object'?'[image data]':arg),matrix:[...matrix],bounds:imageBounds(matrix)});
    }
    const textContent=items.map(item=>item.str).join(' ').replace(/\s+/g,' ').trim();
    const fontNames=[...new Set(items.map(item=>item.fontName))].map(id=>{
      try{const font=page.commonObjs.get(id);return {id,name:font.name,fallbackName:font.fallbackName};}catch{return {id,name:'unresolved'};}
    });
    pages.push({page:n,view:page.view,widthMm:(page.view[2]-page.view[0])*25.4/72,heightMm:(page.view[3]-page.view[1])*25.4/72,
      textItems:items.length,textContent,fontNames,operatorCounts:counts,imagePaintCount:images.length,images,
      items:items.map(item=>({str:item.str,transform:item.transform,width:item.width,height:item.height,fontName:item.fontName}))});
  }
  await pdf.destroy();
  return {path,bytes:bytes.length,sha256:hash(bytes),pageCount:pages.length,pages};
}
try {
  await server.listen();browser=await chromium.launch({headless:true});
  evidence.chromiumVersion=browser.version();evidence.port=port;evidence.serverLifecycle='Runner creates Vite programmatically; finally closes only this server and its Chromium.';
  let baseline,finalPage,finalContext;
  for(const width of [900,1500])for(const dpr of [1,2])for(const media of ['screen','print']) {
    const context=await browser.newContext({viewport:{width,height:1200},deviceScaleFactor:dpr});
    const page=await context.newPage();await page.emulateMedia({media});
    const fontResponses=[];
    page.on('response',response=>{
      if(/\.woff2?(?:\?.*)?$/.test(response.url())&&response.status()===200)
        fontResponses.push(response.body().then(bytes=>({url:new URL(response.url()).pathname,sha256:hash(bytes),bytes:bytes.length})));
    });
    await page.goto(url+'?fixture=all',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.proof?.result!==undefined,{timeout:30000});
    const report=await result(page);
    await write(`matrix/${width}-dpr${dpr}-${media}.json`,report);
    assert.equal(report.status,'READY',JSON.stringify(report.diagnostics));
    assert.equal(report.snapshot.geometryDiagnostics.length,0);
    assert.equal(new Set(report.phases.map(p=>p.documentHash)).size,1);
    assert.equal(new Set(report.phases.map(p=>p.framesHash)).size,1);
    if(!baseline)baseline=report.snapshot.facts;
    assert.deepEqual(report.snapshot.facts,baseline,`Exact U/Q and text-flow parity: ${width}/${dpr}/${media}`);
    const semantic=await page.evaluate(()=>({
      tableCount:document.querySelectorAll('[data-table-id]').length,
      nativeTables:document.querySelectorAll('table,thead').length,
      headerlessHeaders:document.querySelector('[data-table-id="g02-c"]').querySelectorAll('[role="columnheader"]').length,
      headerlessRows:document.querySelector('[data-table-id="g02-c"]').querySelectorAll('[role="row"]').length,
      images:[...document.querySelectorAll('img[data-asset-id]')].map(img=>({complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight})),
    }));
    assert.equal(semantic.tableCount,7);assert.equal(semantic.nativeTables,0);assert.equal(semantic.headerlessHeaders,0);assert.equal(semantic.headerlessRows,8);
    assert.deepEqual(semantic.images,[{complete:true,naturalWidth:545,naturalHeight:767}]);
    evidence.matrix.push({width,dpr,media,status:'PASS',factCount:report.snapshot.facts.length,factsHash:hash(report.snapshot.facts),semantic,durations:report.durations});
    console.log('PASS matrix',width,dpr,media,report.snapshot.facts.length,'facts');
    if(width===900&&dpr===1&&media==='screen') {
      for(const name of ['g01','g02','g03','g04'])await page.locator(`[data-page-id="${name}"]`).screenshot({path:resolve(output,'screens',name+'-screen.png')});
      await write('fixture-inventory.json',report.tables);
      await write('resource-manifest.json',report.manifest);
      const fontFiles=await Promise.all(fontResponses);
      await write('font-file-manifest.json',fontFiles.sort((a,b)=>a.url.localeCompare(b.url)));
      const fixtureDoc=await page.evaluate(()=>window.proof.document);await write('authored-document.json',fixtureDoc);
    }
    if(width===1500&&dpr===1&&media==='print'){finalPage=page;finalContext=context;}else await context.close();
  }
  const lineSamples=await sampledLines(finalPage);
  const cdp=await finalContext.newCDPSession(finalPage);
  await cdp.send('DOM.enable');await cdp.send('CSS.enable');
  const cdpDocument=await cdp.send('DOM.getDocument');
  evidence.platformFonts=[];
  for(const selector of ['[data-cell-id="g01-spec:8:1"]','[data-cell-id="g04-matrix:1:2"]','[data-cell-id="g04-matrix:1:3"]']) {
    const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:cdpDocument.root.nodeId,selector});
    const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
    assert(fonts.every(font=>font.isCustomFont),'Unpinned system-font fallback: '+JSON.stringify(fonts));
    evidence.platformFonts.push({selector,fonts});
  }
  // First baseline PDF is emitted only after complete readiness, preflight and exact stability.
  const before=await finalPage.evaluate(()=>window.proof.beforeExport());
  const pdfPath=resolve(output,'pdf','presys-foundation-g01-g04.pdf'),pdfStart=performance.now();
  await finalPage.pdf({path:pdfPath,format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,margin:{top:'0',right:'0',bottom:'0',left:'0'},scale:1});
  evidence.pdfGenerationMs=performance.now()-pdfStart;
  const after=await finalPage.evaluate(()=>window.proof.afterExport());
  assert.equal(before.documentHash,after.documentHash);assert.equal(before.framesHash,after.framesHash);
  assert.equal(after.layoutStable,true);await write('pdf/export-job.json',await result(finalPage));
  evidence.pdfImmutability={before:{documentHash:before.documentHash,framesHash:before.framesHash},after};
  const forensic=await inspectPdf(pdfPath);await write('pdf/forensics.json',forensic);
  assert.equal(forensic.pageCount,4);
  const expectedText=[['-10.000 mV','0.001 Ω','23 °C','1 / 4'],['06.04.0121-00/IN1P','2 / 4'],['Observação de montagem:','Fotografia proveniente','TA-25N','3 / 4'],['Incluído na configuração','Compatibilidade inteiramente sintética','4 / 4']];
  for(let i=0;i<4;i++) {
    const page=forensic.pages[i];assert(Math.abs(page.widthMm-210)<.2&&Math.abs(page.heightMm-297)<.2);
    for(const text of expectedText[i])assert(page.textContent.includes(text),'PDF missing '+text);
    assert(page.textItems>40);assert((page.operatorCounts.constructPath??0)>20);assert((page.operatorCounts.fill??0)>20);
    assert.equal(page.imagePaintCount,i===2?1:0,'Only the declared photograph may be raster');
    assert(page.fontNames.every(font=>/NotoSans/.test(font.name)),'Undeclared PDF font substitution');
    if(i===2){assert(page.images[0].bounds.width<130);assert(page.images[0].bounds.height<180);}
  }
  evidence.pdf={path:pdfPath,pageCount:4,bytes:forensic.bytes,sha256:forensic.sha256,pages:forensic.pages.map(page=>({page:page.page,widthMm:page.widthMm,heightMm:page.heightMm,textItems:page.textItems,fontNames:page.fontNames,operatorCounts:page.operatorCounts,images:page.images,imagePaintCount:page.imagePaintCount}))};
  const normalize=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
  const lineParity=lineSamples.map(sample=>{
    const page=forensic.pages[Number(sample.pageId.slice(-1))-1],groups=new Map();
    for(const item of page.items){const y=item.transform[5].toFixed(2);if(!groups.has(y))groups.set(y,[]);groups.get(y).push(item);}
    const pdfLines=[...groups.values()].map(items=>normalize(items.sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join('')));
    const lines=sample.lines.map(line=>({text:line,matched:pdfLines.some(pdfLine=>pdfLine.includes(normalize(line)))}));
    return {...sample,lines,pdfLines};
  });
  await write('pdf/line-parity.json',lineParity);
  assert(lineParity.every(sample=>sample.lines.every(line=>line.matched)),'Final PDF line wrapping differs from Chromium print sample');
  evidence.pdfLineParity={samples:lineParity.length,lines:lineParity.reduce((sum,s)=>sum+s.lines.length,0),matched:true};
  await promisify(execFile)('pdftoppm',['-r','150','-png',pdfPath,resolve(output,'png','presys-foundation')],{windowsHide:true});
  evidence.pdfDerivedPngs=[1,2,3,4].map(n=>resolve(output,'png',`presys-foundation-${n}.png`));
  console.log('PASS native PDF + PDF.js forensics');
  await finalContext.close();

  const context=await browser.newContext({viewport:{width:1500,height:1200}});
  const page=await openPage(context,'G05');
  await assertBlocked(page,'G05',['CELL_CONTENT_OVERFLOW','ROW_CONTENT_OVERFLOW','TABLE_CONTENT_OVERFLOW','TABLE_WIDTH_INFEASIBLE','OBJECT_OUTSIDE_PAGE'],await result(page));
  const g05=await page.evaluate(()=>window.proof.document);
  assert.equal(g05.pages[0].objects.find(o=>o.type==='table'&&o.table.id==='g05-code').table.cells[0].content.value,'06.04.0121-00/IN1P/TA-50N-NH-PB-XXXXXXXXXXXX');
  for(const code of ['SAFE_AREA_VIOLATION','OBJECT_OVERLAP'])assert((await result(page)).diagnostics.some(d=>d.code===code&&d.severity==='WARNING'));
  await page.screenshot({path:resolve(output,'screens','g05-adversarial.png'),fullPage:true});
  const watch=await load(page,'rowspan-watch');await write('adversarial/rowspan-watch.json',{report:watch,constraints:await page.evaluate(()=>window.proof.constraints())});
  const observed=(await page.evaluate(()=>window.proof.constraints()))[0];
  assert.equal(observed.constraints.length,2);
  const base=observed.rows.map((row,i)=>Math.max(observed.baseIntrinsicU[i],row.heightPolicy.minMm*10000));
  const middle=Math.max(base[1],observed.constraints[0].requiredU-base[0],observed.constraints[1].requiredU-base[2]);
  const witness=[base[0],middle,base[2]];
  assert(observed.constraints.every(c=>witness.slice(c.row,c.row+c.span).reduce((a,b)=>a+b,0)>=c.requiredU));
  const frozenTotalU=observed.heightsU.reduce((a,b)=>a+b,0),witnessTotalU=witness.reduce((a,b)=>a+b,0);
  assert(frozenTotalU>550000&&witnessTotalU<=550000);
  evidence.rowspan={classification:'ROWSPAN HEIGHT DECISION REOPEN REQUIRED',requiredU:observed.constraints.map(c=>c.requiredU),baseU:base,frozenHeightsU:observed.heightsU,frozenTotalU,witnessHeightsU:witness,witnessTotalU,artificialExpansionU:frozenTotalU-witnessTotalU,expansionPercent:(frozenTotalU/witnessTotalU-1)*100,frameHeightU:550000,falsePracticalOverflow:true,witnessIsAlternateSolver:false};
  await write('adversarial/rowspan-counterexample.json',evidence.rowspan);
  await page.screenshot({path:resolve(output,'screens','rowspan-watch.png'),fullPage:true});
  const witnessDoc=await page.evaluate(()=>window.proof.makeFixture('rowspan-watch'));
  const witnessTable=witnessDoc.pages[0].objects.find(o=>o.type==='table').table;
  witnessTable.rows.forEach((row,i)=>{row.heightPolicy={mode:'FIXED_MM',heightMm:witness[i]/10000};});
  const witnessReport=await runDoc(page,witnessDoc,'rowspan-manual-fixed-witness');
  assert.equal(witnessReport.status,'READY',JSON.stringify(witnessReport.diagnostics));
  evidence.rowspan.manualWitnessRendered=true;
  evidence.rowspan.manualWitnessChanges='Test-only authored FIXED_MM row assignment; content, fonts, padding, columns and object frames unchanged. No alternate solver.';
  await write('adversarial/rowspan-manual-fixed-witness.json',witnessReport);
  await page.screenshot({path:resolve(output,'screens','rowspan-manual-fixed-witness.png'),fullPage:true});
  console.log('ROWSPAN watch:',watch.status,watch.diagnostics.map(d=>d.code));
  const goldens=[];
  for(const name of ['G01','G03']) {
    const report=await load(page,name),constraints=await page.evaluate(()=>window.proof.constraints());
    goldens.push({name,status:report.status,tables:constraints.map(table=>{
      const baseResolvedU=table.rows.map((row,i)=>row.heightPolicy.mode==='AUTO'?table.baseIntrinsicU[i]:row.heightPolicy.mode==='MIN_MM'?Math.max(table.baseIntrinsicU[i],row.heightPolicy.minMm*10000):row.heightPolicy.heightMm*10000);
      return {...table,baseResolvedU,spanAddedU:table.heightsU.reduce((a,b)=>a+b,0)-baseResolvedU.reduce((a,b)=>a+b,0)};
    })});
    assert.equal(report.status,'READY');
  }
  await write('adversarial/golden-rowspan-observation.json',goldens);
  const withNotes=await load(page,'G03'),withoutNotes=await page.evaluate(()=>window.proof.makeFixture('G03'));
  const noteTable=withoutNotes.pages[0].objects.find(o=>o.type==='table').table;
  noteTable.annotationIds=[];noteTable.cells.forEach(c=>{delete c.annotationIds;});
  const withoutNotesReport=await runDoc(page,withoutNotes,'G03-without-annotations');
  const tableHeight=report=>report.snapshot.facts.find(f=>f.kind==='table'&&f.tableId==='g03-image').renderedIntrinsicHeightQ;
  assert(tableHeight(withNotes)>tableHeight(withoutNotesReport));
  evidence.adversarial.push({label:'annotations-participate-in-height',passed:true,withAnnotationsQ:tableHeight(withNotes),withoutAnnotationsQ:tableHeight(withoutNotesReport),differenceQ:tableHeight(withNotes)-tableHeight(withoutNotesReport)});

  // Independent object frames: change A's width and content; inspect B/C rather than merely source hashing.
  const g02=await page.evaluate(()=>window.proof.makeFixture('G02'));
  const original=await runDoc(page,g02,'G02-original');
  const changed=structuredClone(g02),a=changed.pages[0].objects.find(o=>o.type==='table');
  a.frame.widthMm=87;a.table.cells.find(c=>c.rowId===a.table.rows[1].id).content={type:'technicalCode',value:'A-MOD'};
  const changedReport=await runDoc(page,changed,'G02-change-A');assert.equal(changedReport.status,'READY');
  const siblings=report=>report.snapshot.facts.filter(f=>(f.kind==='object'&&['g02-b:object','g02-c:object'].includes(f.objectId))||('tableId' in f&&['g02-b','g02-c'].includes(f.tableId)));
  assert.deepEqual(siblings(changedReport),siblings(original));
  evidence.adversarial.push({label:'G02-independent-frames',passed:true,siblingFacts:siblings(original).length});

  // Border widths and span topology undergo the same real-browser matrix.
  const borderResults=[];
  const dpr2Context=await browser.newContext({viewport:{width:900,height:1200},deviceScaleFactor:2});
  const dpr2Page=await openPage(dpr2Context,'G02');
  for(const config of [{thickness:0,equal:true},{thickness:1,equal:true},{thickness:.25},{thickness:2},{thickness:1,span:'column'},{thickness:1,span:'row'},{thickness:2,span:'both'}]) {
    const probe=probeDocument(g02,config);let reference;
    for(const dpr of [1,2])for(const width of [900,1500])for(const media of ['screen','print']) {
      const target=dpr===1?page:dpr2Page;
      await target.setViewportSize({width,height:1200});await target.emulateMedia({media});
      const report=await runDoc(target,probe,'border-'+JSON.stringify(config));
      assert.equal(report.status,'READY',JSON.stringify(report.diagnostics));
      if(!reference)reference=report.snapshot.facts;
      assert.deepEqual(report.snapshot.facts,reference);
      const expectedQ=config.thickness===0?0:config.thickness===.25?21:config.thickness===1?85:171;
      const edges=report.snapshot.facts.filter(f=>f.kind==='paintEdge');
      assert(edges.every(edge=>edge.thicknessQ===expectedQ));
      if(!expectedQ)assert.equal(edges.length,0);
      if(config.span)assert(report.tables[0].suppressed.length>0);
      borderResults.push({config,width,dpr,media,trackQ:report.tables[0].trackQ,rowQ:report.tables[0].rowQ,edgeCount:edges.length,suppressed:report.tables[0].suppressed,hash:hash(report.snapshot.facts)});
    }
  }
  await dpr2Context.close();
  await write('matrix/border-matrix.json',borderResults);evidence.borderMatrixRuns=borderResults.length;
  await page.emulateMedia({media:'screen'});
  // The frozen Q→U overflow comparison is also exercised at an exact authored boundary.
  const boundary=await runDoc(page,probeDocument(g02,{rowHeights:[20],frameHeight:20}),'exact-height-boundary');
  const boundaryTable=boundary.snapshot.facts.find(f=>f.kind==='table'),boundaryObject=boundary.snapshot.facts.find(f=>f.kind==='object');
  evidence.quantizationBoundary={status:boundary.status,codes:boundary.diagnostics.map(d=>d.code),tableHeightQ:boundaryTable.renderedIntrinsicHeightQ,objectHeightQ:boundaryObject.heightQ,authoredHeightU:boundaryObject.authoredHeightU};
  assert.equal(boundaryTable.renderedIntrinsicHeightQ,boundaryObject.heightQ);
  await write('adversarial/exact-height-boundary.json',boundary);

  // Explicitly stable normalized facts, UI zoom outside authority, and real late changes.
  await load(page,'all');
  const zoom=await page.evaluate(async()=>{
    const a=await window.proof.snapshot(),root=document.querySelector('[data-editorial-root]'),clone=root.cloneNode(true);
    clone.removeAttribute('data-editorial-root');clone.style.position='absolute';clone.style.left='3000px';clone.style.top='0';clone.style.transform='scale(1.25)';clone.style.transformOrigin='0 0';
    document.body.append(clone);
    const originalWidth=root.getBoundingClientRect().width,visualWidth=clone.getBoundingClientRect().width;
    const b=await window.proof.snapshot();clone.remove();
    return {originalWidth,visualWidth,changes:window.proof.compareSnapshots(a,b)};
  });
  assert.equal(zoom.visualWidth,zoom.originalWidth*1.25);assert.equal(zoom.changes.length,0);
  evidence.adversarial.push({label:'transform-free-zoom-authority',passed:true,...zoom});
  await expectUnstable(page,'late-text-reflow',()=>page.evaluate(()=>{document.querySelector('[data-cell-id="g03-image:1:2"] [data-flow-root]').style.width='55%';}));
  await expectUnstable(page,'late-font-layout-change',()=>page.evaluate(()=>{document.querySelector('[data-cell-id="g03-image:1:2"] [data-flow-root]').style.fontFamily='serif';}));
  await expectUnstable(page,'late-loaded-font-weight-change',()=>page.evaluate(()=>{document.querySelector('[data-cell-id="g03-image:1:2"] [data-flow-root]').style.fontWeight='700';}));
  await expectUnstable(page,'late-row-height-change',()=>page.evaluate(()=>{
    const grid=document.querySelector('[data-table-id="g01-spec"]'),rows=getComputedStyle(grid).gridTemplateRows.split(' ');
    rows[0]=(parseFloat(rows[0])+2)+'px';grid.style.gridTemplateRows=rows.join(' ');
  }));
  await expectUnstable(page,'late-image-layout-change',()=>page.evaluate(()=>{
    const img=document.querySelector('img[data-asset-id]');img.style.width=(parseFloat(getComputedStyle(img).width)+9)+'px';
  }));
  await expectUnstable(page,'late-image-intrinsic-change',()=>page.evaluate(async()=>{
    const img=document.querySelector('img[data-asset-id]');
    img.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    await img.decode();
  }));
  const missingAsset=await page.evaluate(()=>window.proof.makeFixture('G03'));missingAsset.assets=[];
  await assertBlocked(page,'missing-asset-reference',['ASSET_REFERENCE_DANGLING'],await runDoc(page,missingAsset,'missing-asset-reference'));
  const missingFont=await page.evaluate(()=>window.proof.makeFixture('G01'));
  missingFont.style.defaultText.fontFamily='Missing Proof Font';
  await assertBlocked(page,'missing-font-manifest',['REQUIRED_FONT_MISSING'],await runDoc(page,missingFont,'missing-font-manifest'));

  await load(page,'G01');
  let releaseImage,requestSeen;
  const gate=new Promise(resolve=>{releaseImage=resolve;}),seen=new Promise(resolve=>{requestSeen=resolve;});
  await context.route('**/assets/ta-25n.jpg',async route=>{requestSeen();await gate;await route.continue();});
  const lateLoad=load(page,'G03');await seen;
  const held=await page.evaluate(()=>({busy:window.proof.busy,result:window.proof.result,document:JSON.stringify(window.proof.document)}));
  assert(held.busy&&!held.result);releaseImage();
  const lateResult=await lateLoad;assert.equal(lateResult.status,'READY');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.proof.document)),held.document);
  evidence.adversarial.push({label:'late-image-readiness',passed:true,blockedUntilResponse:true,phases:lateResult.phases.map(p=>p.phase)});
  await context.unroute('**/assets/ta-25n.jpg');
  await context.route('**/assets/ta-25n.jpg',route=>route.fulfill({status:404,body:'missing'}));
  await assertBlocked(page,'image-http-failure',['REQUIRED_ASSET_MISSING'],await load(page,'G03'));
  await context.unroute('**/assets/ta-25n.jpg');
  const broken=await page.evaluate(()=>window.proof.makeFixture('G03'));broken.assets[0].sha256=hash('not an image');
  await context.route('**/assets/ta-25n.jpg',route=>route.fulfill({status:200,contentType:'image/jpeg',body:'not an image'}));
  await assertBlocked(page,'image-decode-failure',['IMAGE_DECODE_FAILED'],await runDoc(page,broken,'image-decode-failure'));
  await context.unroute('**/assets/ta-25n.jpg');
  await context.close();
  const fontContext=await browser.newContext();
  await fontContext.route(/\.woff2?(?:\?.*)?$/,route=>route.abort('failed'));
  const fontPage=await openPage(fontContext,'G01');
  await assertBlocked(fontPage,'font-http-failure',['REQUIRED_FONT_MISSING'],await result(fontPage));
  await fontContext.close();
  evidence.status='ASSERTIONS_PASSED';evidence.foundationVerdict='ARCHITECTURE COUNTEREXAMPLES FOUND — DO NOT PROMOTE';evidence.recommendation='C';evidence.durationMs=performance.now()-runStarted;
  evidence.nodeMemory=process.memoryUsage();await write('proof-manifest.json',evidence);
}catch(error) {
  evidence.status='FAIL';evidence.failure=error.stack??String(error);evidence.durationMs=performance.now()-runStarted;
  await write('proof-manifest.json',evidence);console.error(error);process.exitCode=1;
}finally {
  if(browser)await browser.close();await server.close();
}
