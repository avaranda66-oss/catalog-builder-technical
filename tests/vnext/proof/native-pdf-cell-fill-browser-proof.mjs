import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {jsPDF} from 'jspdf';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const root=process.cwd(),output=resolve(root,'scratch/native-pdf-cell-fill-proof');
await mkdir(output,{recursive:true});
const sources=[],manifest={sources:[],proposal:{
  version:1,title:'Instrumentos industriais — fontes textuais locais',
  models:['AX-041','BX-062'],sections:[{id:'technical',title:'Tabela de especificações',
    rows:['PRESSURE RANGE','RESOLUTION','PRODUCT CODE'].map((label,i)=>({
      id:'item-'+i,label,unit:i===2?'':'kPa',condition:'',values:[],
    }))}],
}};
const examples=[['AX-041','0...700','0.001','00017'],['BX-062','0...900','0.002','00024']];
for(const [index,row] of examples.entries()){
  const pdf=new jsPDF({format:'a4'});
  const lines=[
    row[0]+' PRESSURE RANGE '+row[1]+' kPa',
    row[0]+' RESOLUTION '+row[2]+' kPa',
    row[0]+' PRODUCT CODE '+row[3],
  ];
  lines.forEach((line,i)=>pdf.text(line,20,30+i*13));
  const bytes=pdf.output('arraybuffer');
  const filename=resolve(output,row[0]+'.pdf');
  await writeFile(filename,new Uint8Array(bytes));
  sources.push({model:row[0],path:filename,sha256:createHash('sha256').update(new Uint8Array(bytes)).digest('hex')});
  const p=await getDocument({data:new Uint8Array(bytes.slice(0)),useSystemFonts:true}).promise;
  const txt=await (await p.getPage(1)).getTextContent();
  const text=txt.items.filter(item=>'str' in item)
    .map(item=>item.str+(item.hasEOL?'\n':' ')).join('').trim();
  await p.destroy();
  manifest.sources.push({sourceId:row[0].toLowerCase(),fileName:row[0]+'.pdf',revision:'1'});
  for(let i=0;i<3;i++) {
    const quote=text.split('\n').find(line=>line.includes(lines[i]))?.trim();
    assert(quote,'Source quote not found in actual PDF text');
    manifest.proposal.sections[0].rows[i].values.push({
      status:'known',candidate:{value:row[i+1],
        source:{sourceId:row[0].toLowerCase(),page:1,quote}},
    });
  }
}
const json=resolve(output,'fontes-verificadas.json');
await writeFile(json,JSON.stringify(manifest,null,2));
const port=Number(process.env.PDF_FILL_PROOF_PORT||5544);
const server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port,strictPort:true}});
await server.listen();
let browser;
const failures=[],remote=[];
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1700,height:960}});
  const page=await context.newPage();
  page.setDefaultTimeout(35000);
  page.on('pageerror',e=>failures.push(String(e)));
  page.on('request',request=>{
    if(!request.url().startsWith('http://127.0.0.1:'+port+'/') &&
       !request.url().startsWith('blob:') &&
       !request.url().startsWith('data:'))remote.push(request.url());
  });
  await page.goto('http://127.0.0.1:'+port+'/tests/vnext/proof/fixtures/native-pdf-table-fill-browser.html',
    {waitUntil:'networkidle'});
  const original=await page.evaluate(()=>window.__PDF_NATIVE_UI_PROOF__.state());
  assert.deepEqual(original.tableMatrix,[
    ['Característica','AX-041','BX-062'],
    ['PRESSURE RANGE','',''],['RESOLUTION','',''],['PRODUCT CODE','',''],
  ]);
  await page.locator('[data-editor-object-id="'+original.objectId+'"]').click();
  await page.getByRole('button',{name:'Abrir assistente de edição'}).click();
  await page.getByRole('tab',{name:'Criar com Gemini'}).waitFor();
  await page.getByText('Preencher tabela com PDFs (revisão técnica)').click();
  await page.getByLabel('PDFs originais para validação')
    .setInputFiles(sources.map(source=>source.path));
  await page.getByLabel('Manifesto das fontes PDF').setInputFiles(json);
  await page.getByRole('button',{name:'Conferir citações nos PDFs'}).click();
  await page.getByRole('group',{name:'Revisar valores e citações PDF'}).waitFor();
  const prepared=await page.evaluate(()=>window.__PDF_NATIVE_UI_PROOF__.state());
  assert.deepEqual(prepared.tableMatrix,original.tableMatrix,
    'Unconfirmed PDF citations must not alter a document');
  assert.equal(await page.locator('[role=group][aria-label="Revisar valores e citações PDF"] li').count(),6);
  await page.screenshot({path:resolve(output,'evidence-review-before-approval.png')});
  await page.getByRole('button',{name:'Confirmar preenchimento desta tabela'}).click();
  await page.getByText('Inseridos 6 valores apoiados por citações locais.',{exact:false}).waitFor();
  const filled=await page.evaluate(()=>window.__PDF_NATIVE_UI_PROOF__.state());
  assert.deepEqual(filled.tableMatrix,[
    ['Característica','AX-041','BX-062'],
    ['PRESSURE RANGE','0...700 kPa','0...900 kPa'],
    ['RESOLUTION','0.001 kPa','0.002 kPa'],
    ['PRODUCT CODE','00017','00024'],
  ]);
  assert(filled.revision>original.revision);
  const receiptDownloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Baixar comprovante de fontes e valores (JSON)'}).click();
  const downloaded=await receiptDownloadPromise;
  const sourceReceipt=resolve(output,'source-evidence-receipt.json');
  await downloaded.saveAs(sourceReceipt);
  const evidence=JSON.parse(await readFile(sourceReceipt,'utf8'));
  assert.equal(evidence.schema,'PRESYS_NATIVE_PDF_LITERAL_EVIDENCE_V1');
  assert.equal(evidence.values.length,6);
  assert.deepEqual(evidence.sourceHashes.map(s=>s.sha256).sort(),
    sources.map(s=>s.sha256).sort());
  assert(evidence.values.every(cell=>cell.source?.quote.includes(cell.source?.sourceId==='ax-041'?'AX-041':'BX-062')));
  await page.screenshot({path:resolve(output,'native-table-filled-from-real-pdf-bytes.png')});
  assert.equal(await page.evaluate(()=>window.__PDF_NATIVE_UI_PROOF__.undo()),true);
  const undone=await page.evaluate(()=>window.__PDF_NATIVE_UI_PROOF__.state());
  assert.deepEqual(undone.tableMatrix,original.tableMatrix);
  assert.equal(await page.evaluate(()=>window.__PDF_NATIVE_UI_PROOF__.redo()),true);
  await page.waitForFunction(()=>{const s=window.__PDF_NATIVE_UI_PROOF__?.state();
    return s && !s.dirty && s.saves>=1;},undefined,{timeout:45000});
  const redone=await page.evaluate(()=>window.__PDF_NATIVE_UI_PROOF__.state());
  assert.deepEqual(redone.tableMatrix,filled.tableMatrix);
  await page.getByRole('button',{name:'Fechar painel do assistente'}).click();
  await page.getByRole('button',{name:'Publicar / PDF',exact:true}).click();
  await page.locator('[data-publication-status="READY"]').waitFor({timeout:60000});
  await page.evaluate(()=>{window.print=()=>{};});
  await page.locator('[data-publication-action="print"]').click();
  await page.waitForFunction(()=>
    document.querySelector('[data-publication-host]')?.dataset.printApproved==='true');
  await page.emulateMedia({media:'print'});
  const outputPdf=resolve(output,'CATALOGO_FICHA_TECNICA_PDF_FONTE_LITERAL_VALIDADA.pdf');
  await page.pdf({path:outputPdf,format:'A4',preferCSSPageSize:true,
    printBackground:true,displayHeaderFooter:false,
    margin:{top:'0',right:'0',bottom:'0',left:'0'}});
  const resultBytes=await readFile(outputPdf);
  const printed=await getDocument({data:new Uint8Array(resultBytes),useSystemFonts:true}).promise;
  assert.equal(printed.numPages,1);
  const printedText=(await (await printed.getPage(1)).getTextContent()).items
    .filter(item=>'str' in item).map(item=>item.str).join(' ');
  for(const fact of ['0...700','0...900','0.001','0.002','00017','00024']){
    assert(printedText.includes(fact),'Published PDF missing source-backed literal '+fact);
  }
  await printed.destroy();
  await page.screenshot({path:resolve(output,'published-catalog-with-real-pdf-source-data.png')});
  await page.emulateMedia({media:'screen'});
  await page.getByRole('button',{name:'Voltar ao editor',exact:true}).click();
  await page.evaluate(()=>window.__PDF_NATIVE_UI_PROOF__.reopen());
  await page.waitForFunction(()=>{const s=window.__PDF_NATIVE_UI_PROOF__?.state();
    return s && !s.dirty && s.tableMatrix[1]?.[1]==='0...700 kPa';},undefined,{timeout:45000});
  const reopened=await page.evaluate(()=>window.__PDF_NATIVE_UI_PROOF__.state());
  assert.deepEqual(reopened.tableMatrix,filled.tableMatrix);
  assert.deepEqual(failures,[]);
  assert.deepEqual(remote,[]);
  const receipt={status:'PASS',scope:'ACTUAL_PDF_BYTES_TO_NATIVE_EDITOR_WITH_HUMAN_APPROVAL',
    realGoogleCalls:0,realSupabaseWrites:0,sourcePdfCount:2,
    localPdfSha256:sources.map(s=>({model:s.model,sha256:s.sha256})),
    counts:{evidenceReviewCells:6,sourceVerifiedCells:6,rows:4,modelColumns:2},
    sourceEvidenceReceipt:'source-evidence-receipt.json',
    matrixBefore:original.tableMatrix,matrixAfter:filled.tableMatrix,
    unchangedBeforeApproval:true,undoRestoredOriginal:true,redoReappliedValues:true,
    localCatalogSaved:true,reopenedExactMatrix:true,localCasSaves:reopened.saves,
    outputPdf:{file:'CATALOGO_FICHA_TECNICA_PDF_FONTE_LITERAL_VALIDADA.pdf',
      pages:1,bytes:resultBytes.length,
      sha256:createHash('sha256').update(resultBytes).digest('hex'),
      containsEverySourceValue:true},
    warns:'Text-searchable contiguous PDF clauses only; no 2D geometry attestation or scanned PDF approval',
    errors:failures,outboundRequests:remote};
  await writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2));
  console.log('PDF_TO_NATIVE_TABLE_BROWSER_PASS',JSON.stringify({
    cells:6,files:2,changed:filled.revision>original.revision,undo:true}));
  await context.close();
}finally{await browser?.close();await server.close();}
