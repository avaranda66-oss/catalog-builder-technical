import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const base = process.cwd();
const evidence = resolve(base, 'scratch/inline-assistant-ux-proof');
await mkdir(evidence, { recursive: true });
const port = 5496;
const server = await createServer({ root: base, logLevel: 'error',
  server: { host: '127.0.0.1', port, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1700, height: 920 } });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const errors = [], outbound = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', req => {
    if (!req.url().startsWith('http://127.0.0.1:' + port + '/') &&
        !req.url().startsWith('data:') && !req.url().startsWith('blob:')) {
      outbound.push({ host: new URL(req.url()).hostname, method: req.method() });
    }
  });
  await page.goto('http://127.0.0.1:' + port + '/tests/vnext/proof/fixtures/inline-assistant-editor-proof.html');
  await page.getByRole('button', { name: 'Abrir assistente de edição' }).waitFor();
  const initial = await page.evaluate(() => window.__INLINE_ASSISTANT_PROOF__?.snapshot());
  assert(initial?.tables > 0, 'Fixture must contain a real editable technical table');
  assert.equal(await page.locator('[data-vnext-assistant="open"]').count(), 0, 'Dock closed by default');
  await page.getByRole('button', { name: 'Abrir assistente de edição' }).click();
  const dock = page.locator('[data-vnext-assistant="open"]');
  await dock.waitFor();
  await page.getByRole('tab', { name: 'Ferramentas' }).click();
  await page.getByRole('textbox', { name: 'Peça uma alteração' }).waitFor();
  const geometry = await page.evaluate(() => {
    const stage = document.querySelector('.vnext-page-stage')?.getBoundingClientRect();
    const dock = document.querySelector('.vnext-assistant-dock')?.getBoundingClientRect();
    return { stage: stage && { left: stage.left, right: stage.right, width: stage.width },
      dock: dock && { left: dock.left, right: dock.right, width: dock.width } };
  });
  assert(geometry.stage && geometry.dock);
  assert(geometry.dock.left >= geometry.stage.right - 3,
    'On desktop the assistant must not cover the A4 sheet');
  assert(geometry.dock.right <= 1701);
  await page.screenshot({ path: resolve(evidence, 'assistant-at-right-of-real-editor-desktop.png'), fullPage: false });
  await page.getByRole('button', { name: 'Deixe as tabelas mais compactas' }).click();
  const field = page.getByRole('textbox', { name: 'Peça uma alteração' });
  assert.equal(await field.inputValue(), 'Deixe as tabelas mais compactas');
  await field.press('Enter');
  await page.getByRole('log', { name: 'Histórico do catálogo' }).getByText('Compactei as tabelas', { exact: false }).waitFor();
  const after = await page.evaluate(() => window.__INLINE_ASSISTANT_PROOF__?.snapshot());
  assert(after.revision > initial.revision);
  assert.equal(after.pages, initial.pages);
  assert.equal(after.tables, initial.tables);
  await page.getByRole('button', { name: 'Fechar painel do assistente' }).click();
  assert.equal(await page.locator('[data-vnext-assistant="open"]').count(), 0);
  await page.getByRole('button', { name: 'Abrir assistente de edição' }).click();
  await page.getByRole('log', { name: 'Histórico do catálogo' }).getByText('Compactei as tabelas', { exact: false }).waitFor();
  await page.setViewportSize({ width: 1180, height: 800 });
  await page.screenshot({ path: resolve(evidence, 'assistant-mobile-overlay-with-close-button.png'), fullPage: false });
  const mobile = await page.locator('.vnext-assistant-dock').evaluate(el => {
    const box = el.getBoundingClientRect();
    return { right: box.right, width: box.width, viewport: window.innerWidth,
      closeVisible: !!el.querySelector('[aria-label="Fechar painel do assistente"]') };
  });
  assert(mobile.width > 300 && mobile.width <= 400 && mobile.closeVisible);
  assert(mobile.right <= mobile.viewport + 1);
  await page.getByRole('button', { name: 'Fechar painel do assistente' }).click();
  await page.getByRole('button', { name: 'Abrir assistente de edição' }).click();
  // A separate acceptance proves the new chat-first creation path, not just
  // deterministic edit shortcuts. The provider here is a FAKE authenticated
  // functions adapter; no Google invocation or production catalog is touched.
  await page.setViewportSize({ width: 1700, height: 920 });
  await page.getByRole('tab', { name: 'Criar com Gemini' }).click();
  await page.getByRole('button', { name: 'Conectar Gemini' }).click();
  await page.getByRole('textbox', { name: 'Chave API do provedor' })
    .fill('test-only-fake-composer-key-not-real');
  await page.getByRole('textbox', { name: 'Senha de proteção do cofre' })
    .fill('local-test-passphrase-no-real-secret');
  await page.getByRole('button', { name: 'Salvar chave criptografada' }).click();
  await page.getByRole('textbox', { name: 'Desbloquear cofre' })
    .fill('local-test-passphrase-no-real-secret');
  await page.getByRole('button', { name: 'Desbloquear para esta sessão' }).click();
  await page.getByRole('button', { name: 'Chave desbloqueada' }).waitFor();
  await page.getByRole('textbox', { name: 'Seu pedido ao Gemini' })
    .fill('Crie uma nova capa e uma comparação técnica em duas páginas.');
  await page.getByRole('button', { name: /Enviar ao Gemini/ }).click();
  await page.getByRole('button', { name: 'Confirmar e inserir no catálogo' }).waitFor();
  const beforeApproval = await page.evaluate(() => window.__INLINE_ASSISTANT_PROOF__?.snapshot());
  assert.equal(beforeApproval.pages, after.pages, 'Proposal must never modify the editor before approval');
  await page.screenshot({ path: resolve(evidence, 'gemini-scaffold-proposal-before-approval.png'), fullPage: false });
  await page.getByRole('button', { name: 'Confirmar e inserir no catálogo' }).click();
  await page.getByRole('log', { name: 'Histórico de criação do catálogo' })
    .getByText('Apliquei 2 página(s)', { exact: false }).waitFor();
  const afterCompose = await page.evaluate(() => window.__INLINE_ASSISTANT_PROOF__?.snapshot());
  assert.equal(afterCompose.pages, after.pages + 2);
  assert.equal(afterCompose.tables, after.tables + 1);
  await page.screenshot({ path: resolve(evidence, 'gemini-scaffold-created-native-pages.png'), fullPage: false });
  assert.deepEqual(errors, [], 'No runtime exceptions');
  assert.deepEqual(outbound, [], 'Local proof must send neither documents nor keys to a provider');
  const receipt = { status: 'PASS', mode: 'LOCAL_EDITOR_FAKE_COMPOSER_NO_REAL_GEMINI',
    initial, after, afterCompose, desktop: geometry, compactWithEnter: true, reopenHistory: true,
    mobile, screenshots: [
      'assistant-at-right-of-real-editor-desktop.png',
      'assistant-mobile-overlay-with-close-button.png',
      'gemini-scaffold-proposal-before-approval.png',
      'gemini-scaffold-created-native-pages.png',
    ], authorizedProductionSession: false, liveProviderCalls: 0,
      simulatedComposerCalls: 1, cloudSaveTested: false, errors, outbound };
  await writeFile(resolve(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log('INLINE_ASSISTANT_UX_BROWSER_PASS', JSON.stringify({ desktop: geometry, after, mobile }));
  await context.close();
} finally { await browser?.close(); await server.close(); }
