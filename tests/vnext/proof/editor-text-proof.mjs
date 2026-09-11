import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const output=resolve(root,'scratch/w2g-editor-proof');
await mkdir(output,{recursive:true});
const port=Number(process.env.W2G_PROOF_PORT??5202);
const server=await createServer({
  root,
  server:{
    host:'127.0.0.1',
    port,
    strictPort:true,
    fs:{allow:[root,realpathSync(resolve(root,'node_modules'))]},
  },
  logLevel:'error',
});
let browser;

const canonicalObject=(page,id)=>page.locator(`[data-editorial-root] [data-object-id="${id}"]`);
const editorObject=(page,id)=>page.locator(`[data-editor-object-id="${id}"]`);
const textState=async(page,id)=>canonicalObject(page,id).evaluate((node)=>{
  const element=node;
  const flow=element.querySelector('[data-flow-root]');
  const paragraphs=[...element.querySelectorAll('[data-paragraph-id]')].map((paragraph)=>({
    id:paragraph.getAttribute('data-paragraph-id'),
    text:paragraph.textContent??'',
    inlines:[...paragraph.querySelectorAll('[data-inline-id]')].map((inline)=>({
      id:inline.getAttribute('data-inline-id'),
      text:inline.textContent??'',
      style:inline.getAttribute('style')??'',
      tag:inline.tagName,
    })),
  }));
  return {
    id:element.getAttribute('data-object-id'),
    frame:{left:element.style.left,top:element.style.top,width:element.style.width,height:element.style.height,zIndex:element.style.zIndex},
    flowStyle:flow?.getAttribute('style')??'',
    paragraphs,
    plainText:paragraphs.map((paragraph)=>paragraph.text).join('\n'),
  };
});

const textChromeInsideRoot=(page)=>page.locator(
  '[data-editorial-root] [data-text-edit-session], [data-editorial-root] [data-text-edit-textarea], [data-editorial-root] [data-editor-symbol-index], [data-editorial-root] [data-editor-action="commit-text"], [data-editorial-root] [data-editor-action="cancel-text"]'
).count();

const openWithEnter=async(page,id)=>{
  const hit=editorObject(page,id);
  await hit.click();
  await hit.press('Enter');
  await page.locator('[data-text-edit-textarea]').waitFor();
};

try {
  await server.listen();
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1500,height:1100},deviceScaleFactor:1});
  const page=await context.newPage();
  const consoleErrors=[];
  const pageErrors=[];
  const requests=[];
  page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('pageerror',(error)=>pageErrors.push(error.message));
  page.on('request',(request)=>requests.push(request.url()));

  await page.goto(`http://127.0.0.1:${port}/v2`,{waitUntil:'networkidle'});
  await page.locator('[data-vnext-shell]').waitFor();
  assert.equal(requests.some((url)=>url.includes('/src/legacy-main')),false,'Legacy bootstrap must not load on /v2');

  await page.locator('[data-editor-action="add-text"]').click();
  const textId=await page.locator('[data-editor-object-id][data-selected="true"]').getAttribute('data-editor-object-id');
  assert(textId,'Expected inserted Text selection');
  const original=await textState(page,textId);
  assert.equal(original.plainText,'Novo texto');

  const hit=editorObject(page,textId);
  const hitBox=await hit.boundingBox();
  assert(hitBox,'Expected Text hit target bounds');
  const centerX=hitBox.x+hitBox.width/2;
  const centerY=hitBox.y+hitBox.height/2;
  await page.mouse.move(centerX,centerY);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(40);
  await page.mouse.move(centerX+2,centerY+1);
  await page.mouse.down();
  await page.mouse.up();
  await page.locator('[data-text-edit-textarea]').waitFor();
  const afterJitterActivation=await textState(page,textId);
  assert.deepEqual(afterJitterActivation.frame,original.frame,'Double activation jitter must not change authored frame');

  const textarea=page.locator('[data-text-edit-textarea]');
  const draftBase='± 0.05 °C\n100 Ω\n≤ 50 µV · ≥ 0 ';
  const finalText='± 0.05 °C\n100 Ω\n≤ 50 µV · ≥ 0 ≈';
  await textarea.fill(draftBase);
  assert.deepEqual(await textState(page,textId),original,'Typing must not mutate canonical RichText');
  assert.equal(await textChromeInsideRoot(page),0,'Text-edit chrome must remain outside the editorial root');
  await page.locator('[data-editor-symbol-index="6"]').click();
  assert.equal(await textarea.inputValue(),finalText,'Technical symbol insertion must occur at the textarea caret');
  assert.equal(await textarea.evaluate((element)=>document.activeElement===element),true,'Symbol insertion must restore textarea focus');
  assert.deepEqual(await textState(page,textId),original,'Symbol insertion must not commit canonical content');

  await textarea.press('Escape');
  await page.locator('[data-text-edit-textarea]').waitFor({state:'detached'});
  assert.deepEqual(await textState(page,textId),original,'Escape must discard the draft');

  await openWithEnter(page,textId);
  const commitTextarea=page.locator('[data-text-edit-textarea]');
  await commitTextarea.fill(draftBase);
  await page.locator('[data-editor-symbol-index="6"]').click();
  await page.locator('[data-editor-action="commit-text"]').click();
  await page.locator('[data-text-edit-textarea]').waitFor({state:'detached'});
  const committed=await textState(page,textId);
  assert.equal(committed.plainText,finalText,'Explicit commit must publish the exact multiline technical text');
  assert.equal(committed.id,original.id,'Text object ID must remain exact');
  assert.deepEqual(committed.frame,original.frame,'Text content commit must preserve authored frame');
  assert.equal(committed.flowStyle,original.flowStyle,'Text content commit must preserve rendered typography/style');
  assert.notDeepEqual(committed.paragraphs,original.paragraphs,'Committed RichText structure must reflect the multiline edit');

  const technicalPdfPath=resolve(output,'w2g-technical.pdf');
  await page.pdf({path:technicalPdfPath,format:'A4',printBackground:true});
  const technicalPdf=await getDocument({data:new Uint8Array(await readFile(technicalPdfPath)),isEvalSupported:false,useSystemFonts:false}).promise;
  const technicalPage=await technicalPdf.getPage(1);
  const technicalText=(await technicalPage.getTextContent()).items.filter((item)=>'str' in item).map((item)=>item.str).join(' ');
  for(const token of ['±','0.05','°C','100','Ω','≤','50','µV','≥','0','≈']) assert(technicalText.normalize('NFKC').includes(token.normalize('NFKC')),`PDF missing ${token}: ${JSON.stringify(technicalText)}`);
  await technicalPdf.destroy();

  await page.locator('[data-editor-action="undo"]').click();
  await page.waitForFunction((id)=>{
    const object=document.querySelector(`[data-editorial-root] [data-object-id="${id}"]`);
    return object?.textContent?.includes('Novo texto');
  },textId);
  assert.deepEqual(await textState(page,textId),original,'Undo must restore the exact original RichText identities');

  await page.locator('[data-editor-action="redo"]').click();
  await page.waitForFunction(({id,text})=>{
    const object=document.querySelector(`[data-editorial-root] [data-object-id="${id}"]`);
    if(!object)return false;
    const paragraphs=[...object.querySelectorAll('[data-paragraph-id]')].map((node)=>node.textContent??'');
    return paragraphs.join('\n')===text;
  },{id:textId,text:finalText});
  assert.deepEqual(await textState(page,textId),committed,'Redo must restore the exact edited RichText identities');
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-diagnostic-code="TEXT_OBJECT_OVERFLOW"]').count(),0,'Three-line committed text should fit before overflow case');

  const beforeOverflow=await textState(page,textId);
  await openWithEnter(page,textId);
  const longText=Array.from({length:12},(_,index)=>`Linha ${index+1}: ± 0.05 °C · 100 Ω · ≤ 50 µV · ≥ 0 · ≈`).join('\n');
  await page.locator('[data-text-edit-textarea]').fill(longText);
  assert.deepEqual(await textState(page,textId),beforeOverflow,'Overflow draft must remain outside canonical publication truth');
  await page.locator('[data-editor-action="commit-text"]').click();
  await page.locator('[data-diagnostic-code="TEXT_OBJECT_OVERFLOW"][data-diagnostic-severity="ERROR"]').waitFor({timeout:10000});
  const overflowCommitted=await textState(page,textId);
  assert.equal(overflowCommitted.plainText,longText);
  assert.deepEqual(overflowCommitted.frame,beforeOverflow.frame,'Overflow commit must not auto-grow or otherwise rewrite authored frame');

  await openWithEnter(page,textId);
  await page.locator('[data-text-edit-textarea]').fill('DRAFT-UNCOMMITTED');
  assert.equal((await textState(page,textId)).plainText,longText,'Active textarea draft must never become editorial/publication truth');
  assert.equal(await page.locator('[data-editorial-root]').getByText('DRAFT-UNCOMMITTED',{exact:true}).count(),0);
  assert.equal(await textChromeInsideRoot(page),0);
  await page.locator('[data-editor-action="cancel-text"]').click();

  await page.screenshot({path:resolve(output,'w2g-v2.png'),fullPage:true});
  const evidence={
    chromiumVersion:browser.version(),
    textId,
    original,
    committed,
    overflowCommitted,
    finalText,
    technicalPdfText:technicalText,
    longText,
    textEditChromeInsideEditorialRoot:await textChromeInsideRoot(page),
    legacyBootstrapLoaded:requests.some((url)=>url.includes('/src/legacy-main')),
    consoleErrors,
    pageErrors,
  };
  await writeFile(resolve(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n','utf8');
  assert.deepEqual(consoleErrors,[]);
  assert.deepEqual(pageErrors,[]);
  console.log('W2.G Chromium /v2 direct Text editing proof: PASS');
  console.log(JSON.stringify(evidence,null,2));
  await context.close();
} finally {
  if(browser)await browser.close();
  await server.close();
}
