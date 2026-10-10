import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, preview as previewBuild } from 'vite';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sectionCount = Number(process.env.LONG_PROOF_SECTIONS ?? 12);
const institutional = process.env.LONG_PROOF_INSTITUTIONAL === '1';
const folder = resolve(root, 'scratch/long-institutional-a4', String(sectionCount)+'x16'+(institutional?'-premium':''));
await mkdir(folder, { recursive: true });
const port = Number(process.env.LONG_PROOF_PORT ?? 5364);
const production = process.env.LONG_PROOF_PRODUCTION === '1';
const server = production
  ? await previewBuild({ root, preview: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' })
  : await createServer({ root,
    server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } }, logLevel: 'error' });
if (!production) await server.listen();
const oracleServer = production ? await createServer({ root, server: { middlewareMode: true }, logLevel: 'error' }) : server;
let browser;
const normalize = t => t.replace(/\s+/gu, ' ').trim();

try {
  const { createInstitutionalStressInput } = await oracleServer.ssrLoadModule(
    '/tests/vnext/ai-catalog/institutional-stress-fixture.ts');
  const source = await createInstitutionalStressInput({ sections: sectionCount });
  const inputBytes = Buffer.from(JSON.stringify(source));
  const expected = source.sections.flatMap(section =>
    [section.rows.slice(0, 8), section.rows.slice(8, 16)].map(rows => [
      ['Característica', ...source.models, 'Unidade', 'Condição / observação'],
      ...rows.map(row => [row.label,
        ...row.values.map(value => value.candidate.value), row.unit, row.condition]),
    ]));
  assert.equal(expected.length, sectionCount * 2);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  const errors = []; const external = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', req => {
    if (![ 'http://127.0.0.1:' + port + '/', 'data:', 'blob:' ].some(prefix => req.url().startsWith(prefix))) external.push(req.url());
  });
  await page.addInitScript(() => {
    window.__QA_PRINT__ = 0;
    window.print = () => { window.__QA_PRINT__++; };
  });
  const begin = performance.now();
  await page.goto('http://127.0.0.1:' + port + '/ai-catalog-prototype.html');
  await page.getByRole('button', { name: 'Criar com IA', exact: true }).click();
  await page.getByLabel('Arquivo de especificações sintéticas').setInputFiles({
    name: 'institutional-original-24-page.json', mimeType: 'application/json',
    buffer: inputBytes,
  });
  if (institutional) await page.getByLabel('Descreva o cat\u00e1logo').fill('Crie um cat\u00e1logo institucional extenso com tabelas t\u00e9cnicas.');
  await page.getByRole('button', { name: 'Gerar catálogo', exact: true }).click();
  console.log('LONG_PROOF_GENERATION_SUBMITTED',sectionCount);
  try {
    await page.waitForFunction(() => ['READY','BLOCKED'].includes(
      document.querySelector('[data-prototype-layout]')?.getAttribute('data-prototype-layout')), null, { timeout: 35000 });
  } catch (error) {
    await page.screenshot({ path: resolve(folder, 'debug-failed-state.png'), fullPage: false });
    const diag = await page.evaluate(() => ({
      text: document.body.innerText.slice(0, 2500),
      layout: [...document.querySelectorAll('[data-prototype-layout]')].map(x => x.getAttribute('data-prototype-layout')),
      tables: document.querySelectorAll('.ai-pages [data-table-id]').length,
      alerts: [...document.querySelectorAll('[role=alert]')].map(e => e.textContent),
    }));
    await writeFile(resolve(folder,'debug-failed-state.json'), JSON.stringify(diag,null,2));
    throw error;
  }
  const layout = await page.locator('[data-prototype-layout]').first().getAttribute('data-prototype-layout');
  const diagnostics = await page.locator('[data-prototype-diagnostic]').allTextContents();
  if (layout !== 'READY') throw new Error('24-PAGE_PHYSICAL_PREFLIGHT_BLOCKED: '+JSON.stringify(diagnostics.slice(0, 20)));
  const projection = await page.locator('.ai-pages [data-table-id]').evaluateAll(tables => tables.map(table =>
    [...table.querySelectorAll('[role=row]')].map(row =>
      [...row.querySelectorAll('[data-cell-id]')].map(cell =>
        [...cell.querySelectorAll('[data-flow-root] [data-paragraph-id]')].map(p => p.textContent).join('\n')))));
  assert.equal(projection.length, expected.length);
  assert.deepEqual(projection, expected);
  await page.getByRole('button', { name: 'Aceitar catálogo para revisão' }).click();
  await page.waitForFunction(count => document.querySelectorAll('.ai-pages [data-table-id]').length === count, expected.length);
  const refine = process.env.LONG_PROOF_REFINE === '1';
  if (refine) {
    const allCells = async () => page.locator('.ai-pages [data-cell-id]').allTextContents();
    const padding = async () => page.locator('.ai-pages [data-cell-id]').first().evaluate(cell => getComputedStyle(cell).paddingTop);
    const beforeCells = await allCells(), beforePadding = await padding();
    await page.getByRole('button', { name: 'Preparar proposta' }).click();
    await page.getByRole('button', { name: 'Aplicar proposta' }).click();
    const afterPadding = await padding();
    assert.notEqual(afterPadding, beforePadding, 'Agent refinement must change actual document table style');
    assert.deepEqual(await allCells(), beforeCells, 'Refinement must not change one technical value');
    await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
    assert.equal(await padding(),beforePadding,'Undo must restore original typography');
    assert.deepEqual(await allCells(), beforeCells);
    await page.getByRole('button', { name: 'Refazer', exact: true }).click();
    assert.equal(await padding(),afterPadding,'Redo must restore approved refined typography');
    assert.deepEqual(await allCells(), beforeCells);
    console.log('LONG_PROOF_AGENT_REFINEMENT_UNDO_REDO_PASS');
  }
  await page.getByRole('checkbox', { name: /Conferi os dados/ }).check();
  await page.getByRole('button', { name: 'Salvar versão aprovada' }).click();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Revisar publicação / PDF');
    return Boolean(button && !button.disabled);
  });
  await page.getByRole('button', { name: 'Library local', exact: true }).click();
  await page.getByRole('button', { name: 'Reabrir catálogo' }).click();
  await page.waitForFunction(count => document.querySelectorAll('.ai-pages [data-table-id]').length === count, expected.length);
  await page.getByRole('button', { name: 'Revisar publicação / PDF' }).click();
  try {
    await page.locator('[data-publication-status="READY"]').waitFor({ timeout: 120000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      statusAttributes: [...document.querySelectorAll('[data-publication-status]')].map(node =>
        ({ tag: node.tagName, status: node.getAttribute('data-publication-status'), text: node.textContent?.slice(0, 1800) })),
      openDialogs: [...document.querySelectorAll('[role="dialog"]')].map(node => node.textContent?.slice(0, 1500)),
      warnings: [...document.querySelectorAll('[role="alert"],[data-prototype-diagnostic],.vnext-preflight-issue')]
        .slice(0, 45).map(node => node.textContent?.slice(0, 500)),
      documentPages: document.querySelectorAll('.editorial-page').length,
      tables: document.querySelectorAll('.ai-pages [data-table-id]').length,
      hasPrintPolicy: document.body.getAttribute('data-vnext-print-policy'),
      bodyLast: document.body.innerText.slice(-4500),
    }));
    await writeFile(resolve(folder, 'publication-blocker-diagnostic.json'), JSON.stringify({
      debug: diagnostics,
      expectedPages: expected.length + (institutional ? 3 : 0),
      exception: String(error), browser: browser?.version(),
    }, null, 2));
    await page.screenshot({ path: resolve(folder, 'publication-blocker.png'), fullPage: false });
    console.error('LONG_PROOF_PUBLICATION_DIAGNOSTIC',JSON.stringify(diagnostics).slice(0, 7500));
    throw error;
  }
  const pages = page.locator('[data-publication-host] .editorial-page');
  await pages.first().screenshot({ path: resolve(folder,'first-page.png') });
  await pages.last().screenshot({ path: resolve(folder,'last-page.png') });
  const cellBounds = await pages.evaluateAll(nodes => nodes.map(p => {
    const origin = p.getBoundingClientRect();
    return [...p.querySelectorAll('[data-cell-id]')].map(cell => {
      const rect = cell.getBoundingClientRect();
      return { id: cell.getAttribute('data-cell-id'),
        text: [...cell.querySelectorAll('[data-flow-root] [data-paragraph-id]')].map(p => p.textContent).join('\n'),
        left:(rect.left-origin.left)*.75, top:(rect.top-origin.top)*.75,
        right:(rect.right-origin.left)*.75, bottom:(rect.bottom-origin.top)*.75 };
    });
  }));
  const expectedPdfPages = expected.length + (institutional ? 3 : 0);
  assert.equal(cellBounds.length, expectedPdfPages);
  await page.getByRole('button', { name: 'Imprimir / salvar PDF' }).click();
  await page.waitForFunction(() => window.__QA_PRINT__ === 1);
  await page.emulateMedia({ media: 'print' });
  const pdfPath = resolve(folder,'institutional-24-pages-A4.pdf');
  await page.pdf({ path: pdfPath, format:'A4', printBackground:true, preferCSSPageSize:true,
    margin:{top:'0',right:'0',bottom:'0',left:'0'}});
  const bytes = await readFile(pdfPath);
  const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
  let checkedCells=0;
  assert.equal(pdf.numPages, expectedPdfPages, 'PDF must preserve all A4 pages');
  for (let number=1; number<=expectedPdfPages; number++) {
    const p=await pdf.getPage(number),viewport=p.getViewport({scale:1});
    assert(Math.abs(viewport.width*25.4/72-210)<.2 && Math.abs(viewport.height*25.4/72-297)<.2,'A4 sizing');
    const c=await p.getTextContent();
    const items=c.items.filter(x=>'str' in x && x.str.trim()).map(x=>({
      text:x.str,left:x.transform[4],baseline:viewport.height-x.transform[5],width:x.width,height:x.height
    }));
    for (const cell of cellBounds[number-1]) {
      const within=items.filter(x=>x.left>=cell.left-.75 && x.left<cell.right-.2 &&
        x.baseline>cell.top && x.baseline<=cell.bottom+.75)
        .sort((a,b)=>Math.abs(a.baseline-b.baseline)<1?a.left-b.left:a.baseline-b.baseline);
      let actual='',prev;
      for(const item of within) {
        if(prev) actual+=Math.abs(item.baseline-prev.baseline)>=1?'\n':item.left-(prev.left+prev.width)>.8?' ':'';
        actual+=item.text;prev=item;
      }
      assert.equal(normalize(actual),normalize(cell.text),'PDF text mismatch p'+number+' cell '+cell.id);
      for(const item of within)assert(item.left+item.width<=cell.right+.75 &&
        item.baseline-item.height>=cell.top-.75,'PDF overflow p'+number+' cell '+cell.id);
      checkedCells++;
    }
  }
  if (institutional) {
    const readPage = async number => { const p=await pdf.getPage(number); const items=await p.getTextContent(); return items.items.filter(x=>'str' in x).map(x=>x.str).join(' '); };
    const cover=await readPage(1),index=await readPage(2),references=await readPage(expectedPdfPages);
    assert(cover.includes('CADERNO INSTITUCIONAL') && cover.includes(source.title),'Institutional cover title');
    assert(index.includes(source.sections.at(-1).title),'Technical TOC contains last section');
    assert(references.includes(source.sources[0].id),'Sources page contains synthetic fixture reference');
  }
  await pdf.destroy();
  assert.equal(checkedCells,expected.length*9*7);
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  const receipt={status:'PASS',source:'original_synthetic_only',modelCalls:0,pages:expectedPdfPages, institutional,
    checkedCells,engineeringValues:sectionCount*16*4, refinementRoundtrip:refine,inputSha256:createHash('sha256').update(inputBytes).digest('hex'),
    pdfSha256:createHash('sha256').update(bytes).digest('hex'),
    pdfBytes:bytes.length,durationSeconds:Math.round((performance.now()-begin)/1000),diagnostics,
    browser:browser.version(),productionBundle:production,warnings:['No real engineering product facts validated','No external Gemini model called']};
  await writeFile(resolve(folder,'result.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify(receipt));
  await context.close();
} catch(err) {
  console.log('LONG_PROOF_FAILURE',String(err));
  await writeFile(resolve(folder,'failure.json'),JSON.stringify({status:'FAIL',error:String(err),stack:err?.stack},null,2));
  throw err;
} finally { await browser?.close();if (oracleServer !== server) await oracleServer.close();await server.close(); }
