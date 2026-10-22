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
  // C1: one assistant, like a chat app; quick actions run from short requests or the options menu, without the AI.
  await page.getByRole('textbox', { name: 'Seu pedido ao Gemini' }).waitFor();
  assert.equal(await dock.getByRole('tab').count(), 0, 'No "Criar com Gemini" / "Ferramentas" tabs inside the assistant');
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
  const field = page.getByRole('textbox', { name: 'Seu pedido ao Gemini' });
  await field.fill('Deixe as tabelas mais compactas');
  await field.press('Enter');
  await page.getByRole('log', { name: 'Conversa com o assistente' }).getByText('Compactei as tabelas', { exact: false }).waitFor();
  const after = await page.evaluate(() => window.__INLINE_ASSISTANT_PROOF__?.snapshot());
  assert(after.revision > initial.revision);
  assert.equal(after.pages, initial.pages);
  assert.equal(after.tables, initial.tables);
  await page.getByRole('button', { name: 'Fechar painel do assistente' }).click();
  assert.equal(await page.locator('[data-vnext-assistant="open"]').count(), 0);
  // FR-17: closing from inside gives the keyboard focus back to the button that opened the assistant.
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Abrir assistente de edição',
    'Closing the assistant must give the focus back to the top bar button');
  await page.getByRole('button', { name: 'Abrir assistente de edição' }).click();
  await page.getByRole('log', { name: 'Conversa com o assistente' }).getByText('Compactei as tabelas', { exact: false }).waitFor();
  // FR-17: on a laptop (1366 and 1440 px) the assistant is the "Assistente" tab of the right column, in the place of
  // "Propriedades". It no longer covers the page panel, the properties or the A4 sheet.
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(200);
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        return box && { left: box.left, right: box.right, width: box.width };
      };
      const dock = document.querySelector('.vnext-assistant-dock');
      return { dock: rect('.vnext-assistant-dock'), column: rect('.vnext-side-column'), pages: rect('.vnext-pages'),
        stage: rect('.vnext-page-stage'), fixed: dock ? getComputedStyle(dock).position === 'fixed' : null,
        viewport: window.innerWidth };
    });
    assert(layout.dock && layout.column && layout.pages && layout.stage, `Editor parts missing at ${viewport.width} px`);
    assert.equal(layout.fixed, false, `At ${viewport.width} px the assistant must sit in the right column, not over the screen`);
    assert(layout.dock.left >= layout.column.left - 1 && layout.dock.right <= layout.column.right + 1,
      `At ${viewport.width} px the assistant must fill the right column only`);
    assert(layout.dock.left >= layout.stage.right - 3, `At ${viewport.width} px the assistant must not cover the A4 sheet`);
    assert(layout.dock.left >= layout.pages.right, `At ${viewport.width} px the assistant must not cover the page panel`);
    assert(layout.dock.right <= layout.viewport + 1);
    await page.screenshot({ path: resolve(evidence, `assistant-tab-${viewport.width}.png`), fullPage: false });
  }
  // "Propriedades" comes back in the same place; the conversation is still there in "Assistente".
  await page.getByRole('tab', { name: 'Propriedades', exact: true }).click();
  assert.equal(await page.locator('[data-vnext-assistant="open"]').count(), 0);
  await page.getByRole('complementary', { name: 'Propriedades do objeto' }).waitFor();
  await page.getByRole('tab', { name: 'Assistente', exact: true }).click();
  await page.getByRole('log', { name: 'Conversa com o assistente' }).getByText('Compactei as tabelas', { exact: false }).waitFor();
  // Only below 900 px the assistant covers the screen, with its own "Fechar".
  await page.setViewportSize({ width: 860, height: 800 });
  await page.screenshot({ path: resolve(evidence, 'assistant-mobile-overlay-with-close-button.png'), fullPage: false });
  const mobile = await page.locator('.vnext-assistant-dock').evaluate(el => {
    const box = el.getBoundingClientRect();
    return { right: box.right, width: box.width, viewport: window.innerWidth, fixed: getComputedStyle(el).position === 'fixed',
      closeVisible: !!el.querySelector('[aria-label="Fechar painel do assistente"]') };
  });
  assert(mobile.fixed, 'Below 900 px the assistant must be a panel over the screen');
  assert(mobile.width > 300 && mobile.width <= 440 && mobile.closeVisible);
  assert(mobile.right <= mobile.viewport + 1);
  await page.getByRole('button', { name: 'Fechar painel do assistente' }).click();
  await page.getByRole('button', { name: 'Abrir assistente de edição' }).click();
  // A separate acceptance proves the new chat-first creation path, not just
  // deterministic edit shortcuts. The provider here is a FAKE authenticated
  // functions adapter; no Google invocation or production catalog is touched.
  await page.setViewportSize({ width: 1700, height: 920 });
  // Server key by default (FR-60): no personal key, password or vault step.
  await page.getByText('IA pronta.', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Seu pedido ao Gemini' })
    .fill('Crie uma nova capa e uma comparação técnica em duas páginas.');
  await page.getByRole('button', { name: /Enviar ao Gemini/ }).click();
  await page.getByRole('group', { name: 'Proposta de páginas' }).getByRole('button', { name: 'Aplicar', exact: true }).waitFor();
  const beforeApproval = await page.evaluate(() => window.__INLINE_ASSISTANT_PROOF__?.snapshot());
  assert.equal(beforeApproval.pages, after.pages, 'Proposal must never modify the editor before approval');
  await page.screenshot({ path: resolve(evidence, 'gemini-scaffold-proposal-before-approval.png'), fullPage: false });
  await page.getByRole('group', { name: 'Proposta de páginas' }).getByRole('button', { name: 'Aplicar', exact: true }).click();
  await page.getByRole('log', { name: 'Conversa com o assistente' })
    .getByText('Apliquei 2 página(s)', { exact: false }).waitFor();
  const afterCompose = await page.evaluate(() => window.__INLINE_ASSISTANT_PROOF__?.snapshot());
  assert.equal(afterCompose.pages, after.pages + 2);
  assert.equal(afterCompose.tables, after.tables + 1);
  await page.screenshot({ path: resolve(evidence, 'gemini-scaffold-created-native-pages.png'), fullPage: false });
  // Select real editorial prose on the A4 page. Its contents are never sent
  // to the fake backend until the author asks to rewrite this selection.
  const textId = await page.evaluate(() => window.__INLINE_ASSISTANT_PROOF__?.snapshot().editableTextObjectId);
  assert(textId, 'Need plain editorial text on the active A4 page');
  // FR-16b: selecting an object never changes the height of the toolbar above the page (the sheet does not jump).
  const toolbarHeight = () => page.locator('.vnext-authoring-toolbar').evaluate(el => el.getBoundingClientRect().height);
  const toolbarBeforeSelection = await toolbarHeight();
  await page.locator('[data-editor-object-id="' + textId + '"]').click();
  await page.getByRole('button', { name: 'Reescrever este texto com Gemini' }).waitFor();
  assert(Math.abs(await toolbarHeight() - toolbarBeforeSelection) < 1, 'Selecting a text must not push the page down');
  await page.getByRole('button', { name: 'Reescrever este texto com Gemini' }).click();
  await page.getByRole('textbox', { name: 'Como deseja reescrever o texto selecionado?' })
    .fill('Reescreva o texto de apresentação em linguagem editorial profissional.');
  await page.getByRole('button', { name: /Pedir reescrita ao Gemini/ }).click();
  await page.getByRole('group', { name: 'Revisão de texto selecionado' }).getByRole('button', { name: 'Aplicar', exact: true }).waitFor();
  const beforeRewrite = await page.evaluate(() => window.__INLINE_ASSISTANT_PROOF__?.snapshot());
  await page.screenshot({ path: resolve(evidence, 'gemini-selected-text-before-approval.png'), fullPage: false });
  await page.getByRole('group', { name: 'Revisão de texto selecionado' }).getByRole('button', { name: 'Aplicar', exact: true }).click();
  await page.getByRole('log', { name: 'Conversa com o assistente' })
    .getByText('Reescrevi o texto editorial selecionado', { exact: false }).waitFor();
  const afterRewrite = await page.evaluate(() => window.__INLINE_ASSISTANT_PROOF__?.snapshot());
  assert(afterRewrite.revision > beforeRewrite.revision);
  assert.equal(afterRewrite.pages, beforeRewrite.pages);
  assert.equal(afterRewrite.tables, beforeRewrite.tables);
  await page.screenshot({ path: resolve(evidence, 'gemini-selected-text-after-approval.png'), fullPage: false });
  assert.deepEqual(errors, [], 'No runtime exceptions');
  assert.deepEqual(outbound, [], 'Local proof must send neither documents nor keys to a provider');
  const receipt = { status: 'PASS', mode: 'LOCAL_EDITOR_FAKE_COMPOSER_NO_REAL_GEMINI',
    initial, after, afterCompose, beforeRewrite, afterRewrite,
    desktop: geometry, compactWithEnter: true, reopenHistory: true,
    mobile, screenshots: [
      'assistant-at-right-of-real-editor-desktop.png',
      'assistant-mobile-overlay-with-close-button.png',
      'gemini-scaffold-proposal-before-approval.png',
      'gemini-scaffold-created-native-pages.png',
      'gemini-selected-text-before-approval.png',
      'gemini-selected-text-after-approval.png',
    ], authorizedProductionSession: false, liveProviderCalls: 0,
      simulatedComposerCalls: 1, cloudSaveTested: false, errors, outbound };
  await writeFile(resolve(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log('INLINE_ASSISTANT_UX_BROWSER_PASS', JSON.stringify({ desktop: geometry, after, mobile }));
  await context.close();
} finally { await browser?.close(); await server.close(); }
