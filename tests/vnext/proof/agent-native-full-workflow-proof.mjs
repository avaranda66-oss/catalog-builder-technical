import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root=process.cwd();
const output=process.env.AGENT_FULL_PROOF_OUTPUT ??
  resolve(root,'scratch/agent-native-full-workflow-proof');
await mkdir(output,{recursive:true});
const port=Number(process.env.AGENT_FULL_PROOF_PORT ?? 5533);
const server=await createServer({root,logLevel:'error',
  server:{host:'127.0.0.1',port,strictPort:true}});
await server.listen();
let browser;
const errors=[],external=[],steps=[],inputOutput=[];
const now=()=>new Date().toISOString();
const waitSaved=async page=>{
  await page.waitForFunction(()=>{
    const state=window.__AGENT_FULL_PROOF__?.state();
    return state && !state.dirty && !['PREPARING','SAVING','VERIFYING'].includes(state.phase);
  },undefined,{timeout:45000});
};
const state=page=>page.evaluate(()=>window.__AGENT_FULL_PROOF__?.state());
try{
  browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:1620,height:970}});
  const page=await ctx.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',req=>{
    if(!req.url().startsWith('http://127.0.0.1:'+port+'/') &&
       !req.url().startsWith('blob:') && !req.url().startsWith('data:')){
      external.push({url:req.url(),method:req.method()});
    }
  });
  await page.goto('http://127.0.0.1:'+port+'/tests/vnext/proof/fixtures/agent-full-workflow-browser.html',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Abrir assistente de edição'}).waitFor();
  const baseline=await state(page);
  assert.equal(baseline.pageCount,1);
  await page.getByRole('button',{name:'Abrir assistente de edição'}).click();
  await page.getByRole('tab',{name:'Criar com Gemini'}).waitFor();
  await page.getByRole('button',{name:'Conectar Gemini'}).click();
  await page.getByRole('textbox',{name:'Chave API do provedor'})
    .fill('FAKE_TEST_ONLY_GEMINI_KEY_NO_EXTERNAL_CALL');
  await page.getByRole('textbox',{name:'Senha de proteção do cofre'})
    .fill('FAKE_TEST_ONLY_ENCRYPTION_PASSWORD');
  await page.getByRole('button',{name:'Salvar chave criptografada'}).click();
  await page.getByRole('textbox',{name:'Desbloquear cofre'})
    .fill('FAKE_TEST_ONLY_ENCRYPTION_PASSWORD');
  await page.getByRole('button',{name:'Desbloquear para esta sessão'}).click();
  await page.getByRole('button',{name:'Chave desbloqueada'}).waitFor();

  for(let turn=1;turn<=4;turn++){
    const prompt=turn===1?
      'Crie a primeira versão institucional do catálogo com capa, apresentação e uma tabela comparativa com três modelos.':
      'Continue a estrutura do catálogo existente, acrescente três novas páginas e uma tabela comparativa de outro capítulo; preserve as páginas anteriores.';
    const before=await state(page);
    await page.getByRole('textbox',{name:'Seu pedido ao Gemini'}).fill(prompt);
    await page.getByRole('button',{name:/Enviar ao Gemini/}).click();
    await page.getByRole('button',{name:'Confirmar e inserir no catálogo'}).waitFor();
    const pending=await state(page);
    assert.equal(pending.pageCount,before.pageCount,'Provider cannot directly mutate document');
    await page.getByRole('button',{name:'Confirmar e inserir no catálogo'}).click();
    await page.getByRole('log',{name:'Histórico de criação do catálogo'})
      .getByText('Apliquei 3 página(s)',{exact:false}).last().waitFor();
    await waitSaved(page);
    const after=await state(page);
    assert.equal(after.pageCount,turn*3);
    assert.equal(after.tableCount,turn);
    assert(after.emptyEngineeringCells>=turn*12);
    assert(after.saves>=turn);
    assert.equal(after.modelRequests,turn);
    steps.push({turn,request:prompt,reply:'three editorial pages with comparison scaffold only',
      beforePages:before.pageCount,afterPages:after.pageCount,
      tables:after.tableCount,emptyEngineeringCells:after.emptyEngineeringCells,
      saves:after.saves,remoteRevision:after.remoteRevision,
      modelRequests:after.modelRequests,contextHistory:after.lastHistoryLength,at:now()});
    inputOutput.push({turn,request:prompt,result:{pageCount:after.pageCount,
      tableCount:after.tableCount,technicalValues:'INTENTIONALLY_EMPTY'}});
    if(turn===1 || turn===4)await page.screenshot({
      path:resolve(output,'authoring-turn-'+turn+'.png'),fullPage:false});
  }

  const finalBefore=await state(page);
  assert.equal(finalBefore.pageCount,12);
  assert.equal(finalBefore.tableCount,4);
  assert.equal(finalBefore.modelRequests,4);
  assert.equal(finalBefore.lastHistoryLength,8,
    'The last eight conversation turns must reach the next proposal without truncating UI history');
  const snapshotHash=createHash('sha256')
    .update(JSON.stringify(finalBefore.stored.documentSnapshot)).digest('hex');
  await page.getByRole('button',{name:'Fechar painel do assistente'}).click();
  await page.getByRole('button',{name:'Publicar / PDF',exact:true}).click();
  await page.locator('[data-publication-status="READY"]').waitFor({timeout:60000});
  const rendered=await page.locator('[data-publication-host] [data-page-id]').count();
  assert.equal(rendered,12);
  await page.evaluate(()=>{window.print=()=>{};});
  await page.locator('[data-publication-action="print"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-publication-host]')?.dataset.printApproved==='true');
  await page.emulateMedia({media:'print'});
  const pdfPath=resolve(output,'catalogo-nativo-conversacional-12pag-A4-SOMENTE-ESTRUTURA.pdf');
  await page.pdf({path:pdfPath,format:'A4',preferCSSPageSize:true,printBackground:true,
    displayHeaderFooter:false,margin:{top:'0',right:'0',bottom:'0',left:'0'}});
  const pdfBytes=await readFile(pdfPath);
  const pdf=await getDocument({data:new Uint8Array(pdfBytes),useSystemFonts:true}).promise;
  assert.equal(pdf.numPages,12);
  const pageTexts=[];
  for(let i=1;i<=pdf.numPages;i++){
    const pg=await pdf.getPage(i);
    const view=pg.getViewport({scale:1});
    assert(Math.abs(view.width-595.28)<1);
    assert(Math.abs(view.height-841.89)<1);
    pageTexts.push((await pg.getTextContent()).items
      .filter(item=>'str' in item).map(item=>item.str).join(' '));
  }
  const content=pageTexts.join(' ');
  for(const needle of ['Catálogo institucional PRESYS','Visão geral dos instrumentos',
    'Famílias de produtos e modelos','Faixa de medição','Exatidão','Modelo A','Modelo C']){
    assert(content.includes(needle),'Generated PDF missing '+needle);
  }
  const wordsPerPage=pageTexts.map(value=>value.trim().split(/\s+/).filter(Boolean).length);
  const sparsePages=wordsPerPage.filter(count=>count<40).length;
  const imageObjects=finalBefore.document.pages.flatMap(p=>p.objects)
    .filter(object=>object.type==='image').length;
  const editorialQuality={result:'FAIL_FATHER_READY_VISUAL_ACCEPTANCE',
    allPagesHaveLessThan40Words:sparsePages===pageTexts.length,
    sparsePages,wordsPerPage,documentImageObjects:imageObjects,
    missingImages:imageObjects===0,
    unfilledEngineeringCells:finalBefore.emptyEngineeringCells,
    notes:['Only editorial scaffolds; no verified technical table values',
      'Repeated simple four-column comparison matrices',
      'No images or brand-designed cover: human client must not receive this as finished catalog']};
  await pdf.destroy();
  await page.screenshot({path:resolve(output,'publication-final-12pages.png'),fullPage:false});
  await page.emulateMedia({media:'screen'});
  await page.getByRole('button',{name:'Voltar ao editor',exact:true}).click();
  const reopened=await page.evaluate(async()=>window.__AGENT_FULL_PROOF__.reopen());
  await page.waitForFunction((rev)=>{
    const s=window.__AGENT_FULL_PROOF__?.state();
    return s?.pageCount===12 && s.remoteRevision>=rev && !s.dirty;
  },finalBefore.remoteRevision,{timeout:45000});
  const afterReopen=await state(page);
  assert.equal(afterReopen.pageCount,12);
  assert.equal(afterReopen.tableCount,4);
  assert.equal(createHash('sha256').update(JSON.stringify(afterReopen.document)).digest('hex'),snapshotHash);
  await page.getByRole('button',{name:'Abrir assistente de edição'}).click();
  const dialogueCount=Number(await page.getByLabel('Quantidade de mensagens').textContent());
  assert.equal(dialogueCount,12,'Conversation history must survive catalog reopen');
  assert.equal(afterReopen.modelRequests,4,'Reopen cannot silently call a provider again');
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  const receipt={result:'PASS',mode:'FAKE_PROVIDER_LOCAL_PERSISTENCE_NOT_REAL_GEMINI_OR_SUPABASE',
    proof:'NATIVE_VNEXT_EDITOR_SAVE_REOPEN_PUBLICATION_PDF',
    baselinePages:baseline.pageCount,steps,rounds:4,totalUserRequests:4,
    modelCalls:{simulated:4,realGoogle:0},supabaseWrites:0,
    dialogueMessagesAfterReopen:dialogueCount,
    editorialQuality,
    document:{pages:12,tables:4,engineeringCellsBlank:afterReopen.emptyEngineeringCells,
      finalSnapshotSha256:snapshotHash,localSaves:afterReopen.saves,
      reopened:true,revision:afterReopen.remoteRevision},
    pdf:{file:'catalogo-nativo-conversacional-12pag-A4-SOMENTE-ESTRUTURA.pdf',
      pages:12,bytes:pdfBytes.length,sha256:createHash('sha256').update(pdfBytes).digest('hex'),
      excerpts:pageTexts.map((s,i)=>({page:i+1,text:s.slice(0,240)}))},
    security:{fakeDeviceCredentialOnly:true,providerExternalRequests:0,
      actualPaidCalls:0,engineeredFactsVerified:false,failClosedTechnicalCells:true},
    errors,external};
  await writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2));
  await writeFile(resolve(output,'four-turn-input-output.json'),JSON.stringify(inputOutput,null,2));
  console.log('AGENT_NATIVE_FULL_WORKFLOW_PASS',JSON.stringify({
    pages:12,tables:4,pdfBytes:pdfBytes.length,saves:afterReopen.saves}));
  await ctx.close();
}finally{await browser?.close();await server.close();}
