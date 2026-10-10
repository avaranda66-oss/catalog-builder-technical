import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { jsPDF } from 'jspdf';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = resolve(root, 'scratch/real-pdf-local-index');
await mkdir(out, { recursive: true });
const port = Number(process.env.PDF_INTAKE_PROOF_PORT ?? 5443);
const server = await createServer({
  root, logLevel: 'error',
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('request', request => {
    if (![ 'http://127.0.0.1:' + port + '/', 'data:', 'blob:' ].some(prefix => request.url().startsWith(prefix))) {
      external.push(request.url());
    }
  });
  await page.goto('http://127.0.0.1:' + port + '/ai-catalog-prototype.html');
  await page.getByRole('button', { name: 'Criar com IA', exact: true }).click();
  const makePdf = (tag, pages) => {
    const doc = new jsPDF({ format: 'a4' });
    for (let index = 0; index < pages; index++) {
      if(index) doc.addPage();
      doc.text(tag + ' MODEL-A PRESSURE RANGE 0...700 kPa', 20, 30);
      doc.text(tag + ' MODEL-B PRESSURE RANGE 0...900 kPa', 20, 45);
    }
    return { name: tag + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from(doc.output('arraybuffer')) };
  };
  const first=makePdf('QA-DEVICE-ONE',2), second=makePdf('QA-DEVICE-TWO',3);
  const before=await page.evaluate(() => localStorage.length);
  await page.getByLabel('Adicionar PDFs').setInputFiles([first,second]);
  try {
    await page.waitForFunction(() => document.querySelectorAll('[data-pdf-index-summary] li').length === 2,
      null, { timeout: 10000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      alerts: [...document.querySelectorAll('[role=alert]')].map(node => node.textContent),
      status: document.body.innerText.slice(0, 2000),
      loading: [...document.querySelectorAll('input[type=file]')].map(input => input.disabled),
    }));
    await writeFile(resolve(out,'failure.json'),JSON.stringify({state, errors, external},null,2));
    await page.screenshot({ path:resolve(out,'failure.png') });
    throw error;
  }
  const items=await page.locator('[data-pdf-index-summary] li').allTextContents();
  assert(items.some(item => item.includes('QA-DEVICE-ONE.pdf') && item.includes('2 páginas')));
  assert(items.some(item => item.includes('QA-DEVICE-TWO.pdf') && item.includes('3 páginas')));
  assert(items.every(item => /hash [0-9a-f]{12}/i.test(item)));
  assert.equal(await page.getByRole('button', { name: 'Gerar catálogo' }).isEnabled(),false,'PDF indexing is not unauthorized AI generation');
  assert.equal(await page.evaluate(() => localStorage.length),before,'Raw PDFs never automatically persist in catalog Library');
  await page.screenshot({ path:resolve(out,'accepted-local-two-pdfs.png'),fullPage:true });
  const invalid={name:'QA-invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('not-a-pdf')};
  await page.getByLabel('Adicionar PDFs').setInputFiles([invalid]);
  await page.waitForFunction(() => {
    const alert=document.querySelector('[role=alert]');
    return Boolean(alert?.textContent?.includes('PDF'));
  });
  await page.waitForFunction(() => !document.querySelector('[data-pdf-index-summary]'));
  assert.deepEqual(errors,[],'Browser console runtime errors');
  assert.deepEqual(external,[],'No PDF or metadata should be uploaded over the network');
  await writeFile(resolve(out,'result.json'),JSON.stringify({
    status:'PASS',source:'locally-generated-original-PDFs',pages:[2,3],
    indexAndSourceHashes:true, invalidPdfFailClosed:true,
    commercialPdfUploads:0, providerCalls:0, external, errors,
    cloudLibraryUnmodified:true, browser:browser.version(),
  },null,2));
  console.log('REAL_PDF_LOCAL_BROWSER_PROOF_PASS');
  await context.close();
} finally {await browser?.close();await server.close();}
