import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = process.cwd();
const output = resolve(root, 'scratch/byok-agent-conversation-proof');
await mkdir(output, { recursive: true });
const port = 5383, FAKE_KEY = 'FAKE_UNBILLABLE_GEMINI_KEY_1234567890';
process.env.VITE_SUPABASE_URL = 'https://supabase.example.invalid';
process.env.VITE_SUPABASE_ANON_KEY = 'FAKE_PUBLIC_ANON_KEY_TESTING';
process.env.VITE_VNEXT_CATALOG_AGENT_ENABLED = 'true';
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const network = [], errors = [];
  let requests = 0;
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:' + port + '/') &&
        !request.url().startsWith('data:') && !request.url().startsWith('blob:')) {
      network.push({ host: new URL(request.url()).host, method: request.method() });
    }
  });
  await page.route('https://supabase.example.invalid/**', async route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
        'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
    }
    const path = new URL(route.request().url()).pathname;
    if (path !== '/functions/v1/vnext-catalog-agent') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"mock_other_endpoint"}' });
    }
    const json = route.request().postDataJSON();
    assert.equal(json.credential?.provider, 'gemini');
    assert.equal(json.credential?.apiKey, FAKE_KEY);
    assert.equal(json.task, 'plan_catalog');
    assert.deepEqual(json.sections.map(s => s.id), ['thermal', 'electrical']);
    requests++;
    return route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*', 'cache-control': 'no-store' },
      body: JSON.stringify({ code: 'OK', reply: {
        status: 'proposal',
        plan: { version: 1, template: 'comparison-a4-v1',
          style: 'comparison', sectionOrder: ['electrical', 'thermal'], rowsPerPage: 8 },
      } }) });
  });
  await page.addInitScript(() => { window.__PRINT_ACTIONS__ = 0; window.print = () => { window.__PRINT_ACTIONS__++; }; });
  await page.goto('http://127.0.0.1:' + port + '/ai-catalog-prototype.html');
  await page.getByText('Configurar provedores de IA no dispositivo').click();
  await page.getByRole('textbox', { name: 'Chave API do provedor' }).fill(FAKE_KEY);
  await page.getByRole('textbox', { name: 'Senha de proteção do cofre' }).fill('Local-Only-Fake-Password-2026');
  await page.getByRole('button', { name: 'Salvar chave criptografada' }).click();
  await page.getByRole('textbox', { name: 'Desbloquear cofre' }).fill('Local-Only-Fake-Password-2026');
  await page.getByRole('button', { name: 'Desbloquear para esta sessão' }).click();
  await page.getByText('Chave de gemini desbloqueada apenas nesta sessão.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Criar com IA', exact: true }).click();
  await page.getByRole('button', { name: 'Usar especificações de exemplo' }).click();
  await page.getByRole('button', { name: 'Propor organização com Gemini' }).click();
  await page.getByRole('button', { name: 'Confirmar proposta e gerar catálogo' }).waitFor({ state: 'visible' });
  assert.equal(requests, 1, 'Exactly one intercepted mock provider transport');
  await page.getByRole('button', { name: 'Confirmar proposta e gerar catálogo' }).click();
  await page.getByRole('button', { name: 'Aceitar catálogo para revisão' }).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar conversa e evidências (JSON)' }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  const receiptBytes = await readFile(filePath, 'utf8');
  const receipt = JSON.parse(receiptBytes);
  assert.deepEqual(receipt.totals, { messages: 2, user: 1, assistant: 1 });
  assert.equal(receipt.approvedPlan.template, 'comparison-a4-v1');
  assert.equal(receipt.pdfOutputSha256, null);
  assert.equal(receiptBytes.includes(FAKE_KEY), false, 'Never export credential');
  assert.equal(receipt.sourceHashes.length, 2);
  await writeFile(resolve(output, 'dialogue-receipt.json'), JSON.stringify(receipt, null, 2));
  await page.screenshot({ path: resolve(output, 'catalog-after-gemini-proposal.png'), fullPage: false });
  // Complete the normal review and publication workflow, never writing to Supabase.
  await page.getByRole('checkbox', { name: 'Manter “Não informado” e reconhecer a ausência' }).check();
  await page.getByRole('combobox', { name: 'Resolver TX-062 Exatidão de corrente' }).selectOption('1');
  await page.getByRole('button', { name: 'Aceitar catálogo para revisão' }).click();
  await page.locator('[data-prototype-layout="READY"]').waitFor();
  const askEdit = async request => {
    await page.getByRole('textbox', { name: 'Peça uma alteração' }).fill(request);
    await page.getByRole('button', { name: /Enviar pedido/ }).click();
  };
  await askEdit('Deixe as tabelas mais compactas');
  await page.getByRole('log', { name: 'Histórico do catálogo' }).getByText('Compactei as tabelas no catálogo aberto', { exact: false }).waitFor();
  await page.locator('[data-prototype-layout="READY"]').waitFor();
  await askEdit('desfaça');
  await askEdit('refaça');
  await page.locator('[data-prototype-layout="READY"]').waitFor();
  for (let i = 0; i < 12; i++) await askEdit('Quero mudar um dado técnico sem fonte ' + i);
  const referencePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');
  await page.getByLabel('Anexar imagens de referência').setInputFiles({
    name: 'reference-industrial.png', mimeType: 'image/png', buffer: referencePng,
  });
  await page.getByAltText('Referência: reference-industrial.png').waitFor();
  let wbDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar histórico' }).click();
  const wbDownload = await wbDownloadPromise;
  const workbenchRecord = JSON.parse(await readFile(await wbDownload.path(), 'utf8'));
  assert.equal(workbenchRecord.count, 31);
  assert.equal(workbenchRecord.entries.length, 31);
  assert.equal(workbenchRecord.noModelInference, true);
  assert.equal(JSON.stringify(workbenchRecord).includes(FAKE_KEY), false);
  await writeFile(resolve(output, 'workbench-long-chat-receipt.json'), JSON.stringify(workbenchRecord, null, 2));
  await page.screenshot({ path: resolve(output, 'chat-beside-pdf-after-edits.png'), fullPage: false });
  await page.getByRole('checkbox', { name: 'Conferi os dados e a disposição das dúvidas desta versão' }).check();
  await page.getByRole('button', { name: 'Salvar versão aprovada' }).click();
  await page.getByRole('button', { name: 'Revisar publicação / PDF' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Revisar publicação / PDF' }).click();
  await page.locator('[data-publication-status="READY"]').waitFor();
  const sourceMatrix = await page.locator('[data-publication-host] [data-table-id]').evaluateAll(tables =>
    tables.map(table => [...table.querySelectorAll('[role=row]')].map(row =>
      [...row.querySelectorAll('[data-cell-id]')].map(cell =>
        [...cell.querySelectorAll('[data-flow-root] [data-paragraph-id]')].map(p => p.textContent).join('\n')))));
  assert.deepEqual(sourceMatrix.map(table => table.length), [7, 9]);
  assert.equal(sourceMatrix[0][3][2], '±0,0130', 'Selected source revision must be preserved');
  await page.getByRole('button', { name: 'Imprimir / salvar PDF', exact: true }).click();
  await page.waitForFunction(() => window.__PRINT_ACTIONS__ === 1);
  await page.emulateMedia({ media: 'print' });
  const pdfPath = resolve(output, 'synthetic-catalog-from-agent-dialogue-A4.pdf');
  await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true,
    displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  const pdfBytes = await readFile(pdfPath);
  const pdf = await getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: false }).promise;
  assert.equal(pdf.numPages, 2);
  const pdfText = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    const viewport = pg.getViewport({ scale: 1 });
    assert(Math.abs(viewport.width * 25.4 / 72 - 210) < .2);
    assert(Math.abs(viewport.height * 25.4 / 72 - 297) < .2);
    pdfText.push((await pg.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' '));
  }
  await pdf.destroy();
  const allPdfText = pdfText.join(' ');
  assert(allPdfText.includes('TX-062'));
  assert(allPdfText.includes('±0,0130'));
  const pdfSha256 = createHash('sha256').update(pdfBytes).digest('hex');
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.reload();
  await page.getByRole('heading', { name: 'Criar com IA' }).waitFor();
  const reloadDiagnostic = await page.evaluate(() => ({
    localStorageKeys: Array.from({ length: localStorage.length }, (_, n) => localStorage.key(n)),
    buttons: Array.from(document.querySelectorAll('button')).map(item => item.textContent?.trim()).slice(0, 16),
  }));
  console.log('REOPEN_DIAGNOSTIC', JSON.stringify(reloadDiagnostic));
  await page.screenshot({ path: resolve(output, 'reopen-after-reload.png'), fullPage: false });
  await page.getByRole('button', { name: 'Reabrir catálogo' }).click();
  await page.getByRole('button', { name: 'Revisar publicação / PDF' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Revisar publicação / PDF' }).isEnabled(), true);
  assert.equal(await page.getByLabel('Quantidade de mensagens').textContent(), '31', 'Long chat preserved after reload/reopen');
  assert.equal(requests, 1, 'No extra model request on save, print or reopen');
  await writeFile(resolve(output, 'conversation-to-pdf-receipt.json'), JSON.stringify({
    mode: 'MOCK_PROVIDER_RESPONSE',
    sourceHashes: receipt.sourceHashes,
    userMessages: receipt.totals.user,
    assistantMessages: receipt.totals.assistant,
    orderedMessages: receipt.messages,
    humanActions: ['unlock device key', 'create synthetic source', 'request proposal',
      'approve proposal', 'acknowledge missing fact', 'resolve source conflict',
      'approve catalog', 'save', 'review publication', 'print PDF', 'reopen'],
    workbenchLongChatMessages: workbenchRecord.count,
    referenceImageProcessedByGemini: false,
    selectedConflictValue: sourceMatrix[0][3][2],
    pageCount: pdfText.length, pdfSha256, bytes: pdfBytes.length,
    keyPresentInExport: receiptBytes.includes(FAKE_KEY),
    actualModelCalls: 0, cloudWrites: 0,
  }, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(network, [{ host: 'supabase.example.invalid', method: 'POST' }]);
  await writeFile(resolve(output, 'result.json'), JSON.stringify({
    status: 'PASS', mode: 'MOCK_PROVIDER_TRANSPORT_NOT_REAL_GEMINI',
    requests, messages: receipt.totals, workbenchMessages: workbenchRecord.count,
    credentialInReceipt: false,
    realGeminiCalls: 0, realCloudWrites: 0, actualDocumentFacts: 'SYNTHETIC_ONLY',
    finalPdf: { pages: 2, sha256: pdfSha256, bytes: pdfBytes.length },
    reopenedPersisted: true, errors, network,
  }, null, 2));
  console.log('BYOK_AGENT_CONVERSATION_BROWSER_PROOF_PASS', JSON.stringify(receipt.totals));
  await context.close();
} finally {
  await browser?.close();
  await server.close();
}
