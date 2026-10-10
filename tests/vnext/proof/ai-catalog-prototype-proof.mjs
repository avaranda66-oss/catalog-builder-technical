import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer, preview as previewBuild } from 'vite';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const channel = process.env.AI_PROOF_BROWSER;
const output = resolve(process.env.AI_PROOF_OUTPUT ?? resolve(root, 'scratch/ai-catalog-proof'), channel ?? 'chromium');
await mkdir(output, { recursive: true });
const port = Number(process.env.AI_PROOF_PORT ?? 5312);
const production = process.env.AI_PROOF_PRODUCTION === '1';
const server = production ? await previewBuild({ root, preview: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' }) : await createServer({ root, server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
if (!production) await server.listen();
let browser;
const sourceFiles = ['contracts.ts', 'composition.ts', 'fixture.ts', 'repository.ts', 'PrototypeApp.tsx', 'prototype.css', 'prototype-entry.tsx'].map(file => `src/vnext/ai-catalog/${file}`);
const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')])));
const beforeHashes = await hashes();
const driverSha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const oracleServer = production ? await createServer({ root, server: { middlewareMode: true }, logLevel: 'error' }) : server;
const { createSyntheticSpecifications } = await oracleServer.ssrLoadModule('/src/vnext/ai-catalog/fixture.ts');
const originalInput = await createSyntheticSpecifications();
const expectedMatrix = selected => originalInput.sections.map(section => [['Característica', ...originalInput.models, 'Unidade', 'Condição / observação'], ...section.rows.map(row => [row.label, ...row.values.map(fact => fact.status === 'known' ? fact.candidate.value : fact.status === 'missing' ? 'Não informado' : selected ? fact.candidates[1].value : 'Revisar conflito'), row.unit, row.condition])]);
const projection = page => page.locator('.ai-pages [data-table-id]').evaluateAll(tables => tables.map(table => Array.from(table.querySelectorAll('[role=row]')).map(row => Array.from(row.querySelectorAll('[data-cell-id]')).map(cell => Array.from(cell.querySelectorAll('[data-flow-root] [data-paragraph-id]')).map(p => p.textContent).join('\n')))));
const ready = async page => {
  await page.waitForFunction(() => ['READY', 'BLOCKED'].includes(document.querySelector('[data-prototype-layout]')?.getAttribute('data-prototype-layout')));
  assert.equal(await page.locator('[data-prototype-layout]').getAttribute('data-prototype-layout'), 'READY', JSON.stringify(await page.locator('[data-prototype-diagnostic]').allTextContents()));
};
try {
  browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [], externalRequests = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (!request.url().startsWith(`http://127.0.0.1:${port}/`) && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) externalRequests.push(request.url()); });
  // Capture the existing verified print action, then print the same full app under its actual CSS policy.
  await page.addInitScript(() => { window.__AI_PRINT_CALLS__ = 0; window.print = () => { window.__AI_PRINT_CALLS__++; }; });
  await page.goto(`http://127.0.0.1:${port}/ai-catalog-prototype.html`);
  await page.getByRole('button', { name: 'Criar com IA', exact: true }).click();
  await page.getByRole('button', { name: 'Usar especificações de exemplo' }).click();
  await page.getByRole('button', { name: 'Gerar catálogo', exact: true }).press('Enter');
  await ready(page);
  assert.equal(await page.getByRole('button', { name: 'Aceitar catálogo para revisão' }).isEnabled(), false);
  const initial = await projection(page); assert.deepEqual(initial.map(matrix => matrix.length), [9, 7]);
  assert.deepEqual(initial, expectedMatrix(false), 'All original rows/model values/units/conditions must match independent structured fixture');
  assert.equal(initial[0][5][1], '00017-A'); assert.equal(initial[0][6][1], 'Referência interna\n4 fios'); assert.equal(initial[0][7][3], '');
  assert.equal(initial[0][8][3], 'Não informado'); assert.equal(initial[1][3][2], 'Revisar conflito');
  await page.getByRole('checkbox', { name: 'Manter “Não informado” e reconhecer a ausência' }).check();
  await page.getByRole('combobox', { name: 'Resolver TX-062 Exatidão de corrente' }).selectOption('1');
  await ready(page);
  await page.getByRole('button', { name: 'Aceitar catálogo para revisão' }).click();
  await ready(page);
  const approved = await projection(page);
  assert.deepEqual(approved, expectedMatrix(true));
  await page.getByRole('checkbox', { name: 'Conferi os dados e a disposição das dúvidas desta versão' }).check();
  await page.getByRole('button', { name: 'Salvar versão aprovada' }).click();
  await page.getByRole('button', { name: 'Revisar publicação / PDF' }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Revisar publicação / PDF' && !button.disabled));
  await page.getByRole('button', { name: 'Preparar proposta' }).click();
  await page.getByRole('button', { name: 'Cancelar proposta' }).click(); assert.deepEqual(await projection(page), approved);
  await page.getByRole('button', { name: 'Preparar proposta' }).click();
  await page.getByRole('button', { name: 'Aplicar proposta' }).click(); await ready(page);
  assert.deepEqual(await projection(page), approved); assert.equal(await page.getByRole('button', { name: 'Revisar publicação / PDF' }).isEnabled(), false);
  const padding = () => page.locator('.ai-pages [data-cell-id]').first().evaluate(cell => getComputedStyle(cell).paddingTop);
  const compact = await padding();
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click(); await ready(page); assert.notEqual(await padding(), compact); assert.deepEqual(await projection(page), approved);
  await page.getByRole('button', { name: 'Refazer', exact: true }).click(); await ready(page); assert.equal(await padding(), compact); assert.deepEqual(await projection(page), approved);
  await page.getByRole('checkbox', { name: 'Conferi os dados e a disposição das dúvidas desta versão' }).check();
  await page.getByRole('button', { name: 'Salvar versão aprovada' }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Revisar publicação / PDF' && !button.disabled));
  await page.getByRole('button', { name: 'Library local', exact: true }).click();
  await page.getByRole('button', { name: 'Reabrir catálogo' }).click(); await ready(page); assert.deepEqual(await projection(page), approved); assert.equal(await padding(), compact);
  const savedGeneration = await page.evaluate(() => JSON.parse(localStorage.getItem('catalog-builder:ai-original-prototype:v1')));
  await writeFile(resolve(output, 'saved-generation.json'), JSON.stringify(savedGeneration, null, 2));
  assert.equal(await page.getByRole('button', { name: 'Revisar publicação / PDF' }).isEnabled(), true, 'Reopen must retain verified approval');
  await page.getByRole('button', { name: 'Revisar publicação / PDF' }).click();
  await page.locator('[data-publication-status="READY"]').waitFor();
  await page.screenshot({ path: resolve(output, 'review-publication.png'), fullPage: true });
  const cellBounds = await page.locator('[data-publication-host] [data-editorial-root] .editorial-page').evaluateAll(pages => pages.map(page => {
    const origin = page.getBoundingClientRect();
    return Array.from(page.querySelectorAll('[data-cell-id]')).map(cell => {
      const rect = cell.getBoundingClientRect();
      return { id: cell.getAttribute('data-cell-id'), text: Array.from(cell.querySelectorAll('[data-flow-root] [data-paragraph-id]')).map(p => p.textContent).join('\n'), left: (rect.left - origin.left) * .75, top: (rect.top - origin.top) * .75, right: (rect.right - origin.left) * .75, bottom: (rect.bottom - origin.top) * .75 };
    });
  }));
  await page.getByRole('button', { name: 'Imprimir / salvar PDF', exact: true }).click();
  await page.waitForFunction(() => window.__AI_PRINT_CALLS__ === 1);
  assert.equal(await page.locator('[data-publication-host]').getAttribute('data-print-approved'), 'true');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('#root').evaluate(node => getComputedStyle(node).display), 'none', 'Existing policy must hide the complete app root');
  assert.equal(await page.locator('[data-publication-host]').evaluate(node => getComputedStyle(node).display), 'block', 'Approved READY portal must be printable');
  const pdfPath = resolve(output, 'catalogo-original-A4.pdf');
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  const bytes = await readFile(pdfPath), pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  assert.equal(pdf.numPages, 2);
  const normalized = text => text.replace(/\s+/gu, ' ').trim();
  let checkedCells = 0;
  for (let number = 1; number <= pdf.numPages; number++) {
    const pdfPage = await pdf.getPage(number), viewport = pdfPage.getViewport({ scale: 1 });
    // Same physical-unit criterion as the existing cell/PDF proof; CSS paper is quantized by Chromium.
    assert(Math.abs(viewport.width * 25.4 / 72 - 210) < .2 && Math.abs(viewport.height * 25.4 / 72 - 297) < .2);
    const content = await pdfPage.getTextContent();
    const items = content.items.filter(item => 'str' in item && item.str.trim()).map(item => ({ text: item.str, left: item.transform[4], baseline: viewport.height - item.transform[5], width: item.width, height: item.height }));
    for (const cell of cellBounds[number - 1]) {
      const within = items.filter(item => item.left >= cell.left - .75 && item.left < cell.right - .2 && item.baseline > cell.top && item.baseline <= cell.bottom + .75).sort((a, b) => Math.abs(a.baseline - b.baseline) < 1 ? a.left - b.left : a.baseline - b.baseline);
      // Font subsets may split a literal such as μA into adjacent runs. Add only measured spaces.
      let reconstructed = '', previous;
      for (const item of within) {
        if (previous) reconstructed += Math.abs(item.baseline - previous.baseline) >= 1 ? '\n' : item.left - (previous.left + previous.width) > .8 ? ' ' : '';
        reconstructed += item.text; previous = item;
      }
      assert.equal(normalized(reconstructed), normalized(cell.text), `PDF cell text ${number}/${cell.id}`);
      for (const item of within) assert(item.left + item.width <= cell.right + .75 && item.baseline - item.height >= cell.top - .75, `PDF clipped cell ${cell.id}`);
      checkedCells++;
    }
    assert(!items.some(item => /Criar com IA|Dados que precisam|Salvar versão|Desfazer/.test(item.text)), 'No app controls in PDF');
  }
  await pdf.destroy(); await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  assert.equal(await page.locator('[data-publication-host]').getAttribute('data-print-approved'), null);
  await page.getByRole('button', { name: 'Voltar ao editor', exact: true }).click();
  await page.getByRole('button', { name: 'Library local', exact: true }).click();
  await page.getByRole('button', { name: 'Criar com IA', exact: true }).click();
  await page.getByRole('button', { name: 'Usar especificações de exemplo' }).click();
  await page.getByRole('button', { name: 'Gerar catálogo', exact: true }).click(); await ready(page);
  await page.getByRole('button', { name: 'Rejeitar proposta', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar à Library', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('catalog-builder:ai-original-prototype:v1'))), savedGeneration, 'Rejecting a new proposal must preserve the entire previously saved record');
  await page.getByRole('button', { name: 'Reabrir catálogo', exact: true }).click(); await ready(page);
  assert.deepEqual(await projection(page), approved); assert.equal(await padding(), compact);
  // Supported-valid material can still exceed physical space. Keep source association/hash valid.
  const overlongInput = structuredClone(originalInput), row = overlongInput.sections[0].rows[0], fact = row.values[0];
  assert.equal(fact.status, 'known');
  const oldQuote = fact.candidate.source.quote;
  fact.candidate.value = 'W'.repeat(160);
  fact.candidate.source.quote = `${overlongInput.models[0]} | ${row.label} | ${fact.candidate.value} | ${row.unit} | ${row.condition}`;
  const changedSource = overlongInput.sources.find(source => source.id === fact.candidate.source.sourceId);
  const changedPage = changedSource.pages.find(sourcePage => sourcePage.number === fact.candidate.source.page);
  changedPage.text = changedPage.text.replace(oldQuote, fact.candidate.source.quote);
  changedSource.sha256 = createHash('sha256').update(JSON.stringify(changedSource.pages)).digest('hex');
  await writeFile(resolve(output, 'valid-overlong-input.json'), JSON.stringify(overlongInput, null, 2));
  await page.getByRole('button', { name: 'Library local', exact: true }).click();
  await page.getByRole('button', { name: 'Criar com IA', exact: true }).click();
  await page.getByLabel('Arquivo de especificações sintéticas').setInputFiles({ name: 'valid-overlong-input.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(overlongInput)) });
  await page.getByRole('button', { name: 'Gerar catálogo', exact: true }).click();
  const blocked = async () => { await page.locator('[data-prototype-layout="BLOCKED"]').waitFor(); assert(await page.locator('[data-prototype-diagnostic]').count() > 0); };
  await blocked();
  await page.getByRole('checkbox', { name: 'Manter “Não informado” e reconhecer a ausência' }).check(); await blocked();
  await page.getByRole('combobox', { name: 'Resolver TX-062 Exatidão de corrente' }).selectOption('1'); await blocked();
  await page.getByRole('button', { name: 'Aceitar catálogo para revisão' }).click(); await blocked();
  await page.getByRole('checkbox', { name: 'Conferi os dados e a disposição das dúvidas desta versão' }).check();
  await page.getByRole('button', { name: 'Salvar versão aprovada' }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Revisar publicação / PDF' && !button.disabled));
  await page.getByRole('button', { name: 'Revisar publicação / PDF' }).click();
  await page.locator('[data-publication-status="BLOCKED"]').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Imprimir / salvar PDF', exact: true }).isEnabled(), false, 'Physically overflowing approved input must not become printable');
  assert.equal(await page.locator('[data-publication-host]').getAttribute('data-print-approved'), null);
  assert.equal(await page.evaluate(() => window.__AI_PRINT_CALLS__), 1, 'Blocked publication must not invoke print');
  const afterNegative = await page.evaluate(() => JSON.parse(localStorage.getItem('catalog-builder:ai-original-prototype:v1')));
  assert.equal(afterNegative.records.length, 2);
  assert.deepEqual(afterNegative.records.find(record => record.envelope.catalogId === savedGeneration.records[0].envelope.catalogId), savedGeneration.records[0], 'Blocked candidate must preserve the previous approved record');
  await page.screenshot({ path: resolve(output, 'blocked-publication.png'), fullPage: true });
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []); assert.deepEqual(await hashes(), beforeHashes);
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ status: 'PASS', browser: browser.version(), channel: channel ?? 'chromium', mode: 'controlled-local-synthetic', productionBundle: production, productionCloud: false, externalModelCalls: 0, sourceHashes: beforeHashes, driverSha256, pages: 2, checkedCells, cellBounds, original: initial, selected: approved, compactPaddingPx: compact, negativeChecks: { rejectedProposalPreservesSavedRecord: true, validOverlongInputPhysicallyBlocked: true, blockedPrintDisabled: true, blockedCandidatePreservesPreviousRecord: true }, printBoundary: 'Existing verified print action captured; real browser PDF of full app with original print CSS. Native save dialog untested.', paperToleranceMm: .2, pdfSha256: createHash('sha256').update(bytes).digest('hex'), errors, externalRequests }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', channel: channel ?? 'chromium', pages: 2, checkedCells, output }));
  await context.close();
} catch (error) { await writeFile(resolve(output, 'failure.json'), JSON.stringify({ status: 'FAIL', error: String(error), sourceHashes: beforeHashes }, null, 2)); throw error; }
finally { if (browser) await browser.close(); if (production) { await oracleServer.close(); await new Promise(done => server.httpServer.close(done)); } else await server.close(); }
