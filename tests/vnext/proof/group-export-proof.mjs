/* global window, document, getComputedStyle, structuredClone */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const output=resolve(root,'scratch/w2f-group-export-proof');
await mkdir(output,{recursive:true});
const port=Number(process.env.W2F_EXPORT_PROOF_PORT??5202);
const server=await createServer({root,server:{host:'127.0.0.1',port,strictPort:true},logLevel:'error'});
const url=`http://127.0.0.1:${port}/src/labs/presys-editorial-proof/index.html`;
let browser;

async function openPage(context) {
  const page=await context.newPage();
  await page.goto(url+'?fixture=W2A',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.proof?.result!==undefined,{timeout:30000});
  return page;
}

async function groupDocument(page) {
  return page.evaluate(()=>{
    const doc=structuredClone(window.proof.makeFixture('W2A'));
    const source=doc.pages[0].objects;
    const text=structuredClone(source.find((object)=>object.id==='w2a-text'));
    const image=structuredClone(source.find((object)=>object.id==='w2a-image'));
    const table=structuredClone(source.find((object)=>object.id==='w2a-table:object'));
    if(!text||!image||!table)throw new Error('W2A representative objects missing');
    text.frame={...text.frame,xMm:0,yMm:0};text.zIndex=0;
    image.frame={...image.frame,xMm:38,yMm:24};image.zIndex=1;
    table.frame={...table.frame,xMm:0,yMm:72};table.zIndex=2;
    doc.id='w2f-group-export-document';
    doc.title='W2.F Group publication proof';
    doc.pages=[{
      ...doc.pages[0],
      id:'w2f-group-page',
      objects:[{
        id:'w2f-group',
        type:'group',
        frame:{xMm:12,yMm:12,widthMm:114,heightMm:106},
        zIndex:0,
        objects:[text,image,table],
      }],
    }];
    return doc;
  });
}

async function browserFacts(page) {
  return page.evaluate(()=>{
    const group=document.querySelector('[data-object-id="w2f-group"][data-object-type="group"]');
    if(!(group instanceof HTMLElement))throw new Error('Group wrapper missing');
    const ids=[...document.querySelectorAll('[data-object-id]')].map((node)=>node.getAttribute('data-object-id'));
    const groupedIds=[...group.querySelectorAll(':scope > [data-object-id]')].map((node)=>node.getAttribute('data-object-id'));
    const style=getComputedStyle(group);
    return {
      ids,
      groupedIds,
      groupStyle:{transform:style.transform,translate:style.translate,scale:style.scale,rotate:style.rotate,position:style.position},
      textCount:[...document.querySelectorAll('[data-object-id="w2a-text"]')].length,
      imageCount:[...document.querySelectorAll('[data-object-id="w2a-image"]')].length,
      tableObjectCount:[...document.querySelectorAll('[data-object-id="w2a-table:object"]')].length,
      tableCount:[...document.querySelectorAll('[data-table-id="w2a-table"]')].length,
      editorChromeCount:document.querySelectorAll(
        '[data-editorial-root] [data-editor-action], [data-editorial-root] [data-editor-overlay], [data-editorial-root] [data-resize-handle], [data-editorial-root] [data-selected]'
      ).length,
      textContent:document.querySelector('[data-object-id="w2a-text"]')?.textContent??'',
      imageNaturalWidth:document.querySelector('[data-object-id="w2a-image"] img')?.naturalWidth??0,
    };
  });
}

async function inspectPdf(path) {
  const bytes=new Uint8Array(await readFile(path));
  const pdf=await getDocument({data:bytes,isEvalSupported:false,useSystemFonts:false}).promise;
  assert.equal(pdf.numPages,1);
  const page=await pdf.getPage(1);
  const text=await page.getTextContent();
  const operators=await page.getOperatorList();
  const names=new Map(Object.entries(OPS).map(([name,value])=>[value,name]));
  const counts={};
  const imageOps=new Set([
    'paintImageXObject','paintInlineImageXObject','paintImageXObjectRepeat',
    'paintInlineImageXObjectGroup','paintImageMaskXObject','paintImageMaskXObjectGroup',
    'paintImageMaskXObjectRepeat','paintSolidColorImageMask',
  ]);
  let imagePaintCount=0;
  for(const op of operators.fnArray) {
    const name=names.get(op)??String(op);
    counts[name]=(counts[name]??0)+1;
    if(imageOps.has(name))imagePaintCount+=1;
  }
  const textContent=text.items.filter((item)=>'str' in item).map((item)=>item.str).join(' ').replace(/\s+/g,' ').trim();
  const result={
    bytes:bytes.length,
    widthMm:(page.view[2]-page.view[0])*25.4/72,
    heightMm:(page.view[3]-page.view[1])*25.4/72,
    textItems:text.items.filter((item)=>'str' in item).length,
    textContent,
    imagePaintCount,
    operatorCounts:counts,
  };
  await pdf.destroy();
  return result;
}

try {
  await server.listen();
  browser=await chromium.launch({headless:true});
  const evidence={chromiumVersion:browser.version(),matrix:[]};
  let baselineFacts;
  let proofDocument;
  for(const dpr of [1,2])for(const media of ['screen','print']) {
    const context=await browser.newContext({viewport:{width:1200,height:1200},deviceScaleFactor:dpr});
    const page=await openPage(context);
    await page.emulateMedia({media});
    proofDocument=proofDocument??await groupDocument(page);
    const report=await page.evaluate(({doc,label})=>window.proof.runDocument(doc,label),{doc:proofDocument,label:`W2F-GROUP-${media}-DPR${dpr}`});
    assert.equal(report.status,'READY',JSON.stringify(report.diagnostics));
    assert.deepEqual(report.snapshot.geometryDiagnostics,[]);
    assert.equal(report.tables.length,1);
    assert.equal(report.tables[0].id,'w2a-table');
    const facts=await browserFacts(page);
    assert.deepEqual(facts.ids,['w2f-group','w2a-text','w2a-image','w2a-table:object']);
    assert.deepEqual(facts.groupedIds,['w2a-text','w2a-image','w2a-table:object']);
    assert.equal(facts.textCount,1);
    assert.equal(facts.imageCount,1);
    assert.equal(facts.tableObjectCount,1);
    assert.equal(facts.tableCount,1);
    assert.equal(facts.editorChromeCount,0);
    assert.equal(facts.groupStyle.position,'absolute');
    assert.equal(facts.groupStyle.transform,'none');
    assert.equal(facts.groupStyle.translate,'none');
    assert.equal(facts.groupStyle.scale,'none');
    assert.equal(facts.groupStyle.rotate,'none');
    assert.equal(facts.textContent.includes('W2.A primitive browser proof'),true);
    assert(facts.imageNaturalWidth>0);
    if(!baselineFacts)baselineFacts=report.snapshot.facts;
    else assert.deepEqual(report.snapshot.facts,baselineFacts,`Group snapshot diverged for DPR ${dpr} / ${media}`);
    evidence.matrix.push({dpr,media,factCount:report.snapshot.facts.length,facts});
    await context.close();
  }

  const pdfContext=await browser.newContext({viewport:{width:1200,height:1200},deviceScaleFactor:1});
  const pdfPage=await openPage(pdfContext);
  await pdfPage.emulateMedia({media:'print'});
  const report=await pdfPage.evaluate(({doc})=>window.proof.runDocument(doc,'W2F-GROUP-PDF'),{doc:proofDocument});
  assert.equal(report.status,'READY',JSON.stringify(report.diagnostics));
  const before=await pdfPage.evaluate(()=>window.proof.beforeExport());
  const pdfPath=resolve(output,'w2f-group.pdf');
  await pdfPage.pdf({path:pdfPath,format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,margin:{top:'0',right:'0',bottom:'0',left:'0'},scale:1});
  const after=await pdfPage.evaluate(()=>window.proof.afterExport());
  assert.equal(before.documentHash,after.documentHash);
  assert.equal(before.framesHash,after.framesHash);
  assert.equal(after.layoutStable,true);
  const forensic=await inspectPdf(pdfPath);
  assert(Math.abs(forensic.widthMm-210)<.2&&Math.abs(forensic.heightMm-297)<.2);
  assert.equal((forensic.textContent.match(/W2\.A primitive browser proof/g)??[]).length,1);
  assert.equal((forensic.textContent.match(/Grandeza/g)??[]).length,1);
  assert(forensic.textContent.includes('10.000 mV'));
  assert(forensic.textItems>0,'Grouped Text/Table must remain PDF text');
  assert.equal(forensic.imagePaintCount,1,'Only the declared grouped Image may be raster-painted');
  assert((forensic.operatorCounts.constructPath??0)>0,'Grouped Table/paint must remain vector path content');
  assert((forensic.operatorCounts.fill??0)>0,'Grouped vector content must remain vector-filled');
  const finalFacts=await browserFacts(pdfPage);
  assert.equal(finalFacts.editorChromeCount,0);
  await pdfPage.screenshot({path:resolve(output,'w2f-group-print.png'),fullPage:true});
  evidence.pdf={path:pdfPath,before:{documentHash:before.documentHash,framesHash:before.framesHash},after,forensic,finalFacts};
  await writeFile(resolve(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n','utf8');
  console.log('W2.F Group publication/PDF proof: PASS');
  console.log(JSON.stringify(evidence,null,2));
  await pdfContext.close();
} finally {
  if(browser)await browser.close();
  await server.close();
}
