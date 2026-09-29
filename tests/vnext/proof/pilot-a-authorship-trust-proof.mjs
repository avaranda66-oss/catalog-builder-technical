import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/pilot-a-authorship-trust-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.PILOT_A_PROOF_PORT ?? 5261);
const server = await createServer({
  root,
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] },
  },
  logLevel: 'error',
});
const url = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/pilot-a-authorship-browser.html`;
const errors = { consoleErrors: [], pageErrors: [], failedResources: [], requestFailures: [] };
function watch(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.consoleErrors.push({
      text: message.text(),
      location: message.location(),
    });
  });
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.failedResources.push({
      status: response.status(),
      url: response.url(),
    });
  });
  page.on('requestfailed', (request) => errors.requestFailures.push({
    url: request.url(),
    error: request.failure()?.errorText ?? null,
  }));
}
const state = (page) => page.evaluate(() => window.__PILOT_A_PROOF__.state());
const saveState = (page) => page.locator('[data-save-state]');
const saveButton = (page) => page.locator('[data-editor-action="save"]');
const activePageId = (page) => page.locator('[data-vnext-shell]').getAttribute('data-active-page-id');

async function selectText(page, id) {
  const hit = page.locator(`[data-editor-object-id="${id}"]`);
  await hit.dispatchEvent('pointerdown', { pointerId: 41, button: 0, clientX: 10, clientY: 10 });
  await hit.dispatchEvent('pointerup', { pointerId: 41, button: 0, clientX: 10, clientY: 10 });
  await hit.focus();
  await hit.press('Enter');
  await page.locator('[data-text-edit-textarea]').waitFor();
}
async function selectTable(page, id) {
  const hit = page.locator(`[data-editor-object-id="${id}"]`);
  await hit.dispatchEvent('pointerdown', { pointerId: 42, button: 0, clientX: 10, clientY: 10 });
  await hit.dispatchEvent('pointerup', { pointerId: 42, button: 0, clientX: 10, clientY: 10 });
  await page.locator('[data-table-title-input]').waitFor();
}
async function saveAndWait(page) {
  await saveButton(page).click();
  await page.waitForFunction(() => {
    const current = window.__PILOT_A_PROOF__.state();
    return current.saveLabel === 'Saved' && current.dirty === false;
  }, { timeout: 15000 });
  assert.equal((await saveState(page).textContent())?.trim(), 'Salvo');
}
async function reopen(page, id) {
  const result = await page.evaluate((catalogId) => window.__PILOT_A_PROOF__.reopen(catalogId), id);
  assert.equal(result.ok, true);
  await page.waitForFunction((catalogId) =>
    window.__PILOT_A_PROOF__.state().catalogId === catalogId,
  id);
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watch(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('[data-vnext-shell]').waitFor();

  const ids = await page.evaluate(() => ({
    primaryId: window.__PILOT_A_PROOF__.primaryId,
    otherId: window.__PILOT_A_PROOF__.otherId,
    tableObjectId: window.__PILOT_A_PROOF__.tableObjectId,
    textObjectId: window.__PILOT_A_PROOF__.textObjectId,
    secondPageId: window.__PILOT_A_PROOF__.secondPageId,
  }));
  const initial = await state(page);
  assert.equal(initial.dirty, false);
  assert.equal(initial.saveLabel, 'Saved');

  // 1. Text -> page switch: draft becomes canonical before navigation.
  await selectText(page, ids.textObjectId);
  await page.locator('[data-text-edit-textarea]').fill('Texto canonicalizado antes da página');
  await page.locator('[aria-label="Navegação de páginas"] button').nth(1).click();
  await page.waitForFunction((pageId) =>
    document.querySelector('[data-vnext-shell]')?.getAttribute('data-active-page-id') === pageId,
  ids.secondPageId);
  const textPageSwitch = await state(page);
  assert.equal(textPageSwitch.text, 'Texto canonicalizado antes da página');
  assert.equal(textPageSwitch.dirty, true);
  await page.locator('[aria-label="Navegação de páginas"] button').nth(0).click();
  await saveAndWait(page);

  // 2. Text -> Catálogos: pointerdown canonicalizes; dirty guard blocks route intent.
  await selectText(page, ids.textObjectId);
  await page.locator('[data-text-edit-textarea]').fill('Texto canonicalizado antes de Catálogos');
  await page.locator('[data-editor-action="library"]').click();
  await page.locator('[data-text-edit-textarea]').waitFor({ state: 'detached' });
  const textCatalogs = await state(page);
  assert.equal(textCatalogs.text, 'Texto canonicalizado antes de Catálogos');
  assert.equal(textCatalogs.libraryAttempts, 1);
  assert.equal(textCatalogs.libraryBlocks, 1);
  assert.equal(textCatalogs.libraryNavigations, 0);
  assert.equal(textCatalogs.dirty, true);
  await saveAndWait(page);

  // 3. Table Title -> pending/unsaved -> general Save -> canonical reopen.
  await selectTable(page, ids.tableObjectId);
  const titleInput = page.locator('[data-table-title-input]');
  await titleInput.fill('Título salvo PILOT.A');
  assert.equal((await saveState(page).textContent())?.trim(), 'Alterações não salvas');
  const titlePending = await state(page);
  assert.equal(titlePending.pendingDraft, true);
  assert.equal(titlePending.overlay?.kind, 'TABLE_TITLE_DRAFT_V1');
  await saveAndWait(page);
  const titleSaved = await state(page);
  assert.equal(titleSaved.title, 'Título salvo PILOT.A');
  const authoritativeSaved = await page.evaluate((id) =>
    window.__PILOT_A_PROOF__.authoritative(id), ids.primaryId);
  assert.equal(authoritativeSaved.title, 'Título salvo PILOT.A');
  await reopen(page, ids.otherId);
  await reopen(page, ids.primaryId);
  await selectTable(page, ids.tableObjectId);
  assert.equal(await page.locator('[data-table-title-input]').inputValue(), 'Título salvo PILOT.A');

  // 4. Table Title Recovery/reload: overlay survives while canonical cloud title stays old.
  await page.locator('[data-table-title-input]').fill('Título recuperado após queda');
  const beforeRecovery = await state(page);
  assert.equal(beforeRecovery.overlay?.kind, 'TABLE_TITLE_DRAFT_V1');
  assert.equal(beforeRecovery.title, 'Título salvo PILOT.A');
  const recovery = await page.evaluate(() => window.__PILOT_A_PROOF__.recoverFromCrash());
  assert.equal(recovery.ok, true);
  await page.waitForFunction(() =>
    document.querySelector('[data-table-title-input]')?.value === 'Título recuperado após queda',
  { timeout: 15000 });
  const afterRecovery = await state(page);
  assert.equal(afterRecovery.title, 'Título salvo PILOT.A');
  assert.equal(afterRecovery.pendingDraft, true);
  assert.equal(afterRecovery.overlay?.kind, 'TABLE_TITLE_DRAFT_V1');
  assert.equal(afterRecovery.overlay?.draft, 'Título recuperado após queda');
  await page.locator('[data-editor-action="cancel-table-title-draft"]').click();
  await page.waitForFunction(() => window.__PILOT_A_PROOF__.state().pendingDraft === false);
  assert.equal(await page.locator('[data-table-title-input]').inputValue(), 'Título salvo PILOT.A');

  // 5. IME composition blocks title context transition and preserves the draft.
  await page.locator('[data-table-title-input]').fill('Título em composição');
  await page.locator('[data-table-title-input]').dispatchEvent('compositionstart');
  await page.locator('[aria-label="Navegação de páginas"] button').nth(1).click();
  const compositionBlocked = await state(page);
  assert.notEqual(await activePageId(page), ids.secondPageId);
  assert.equal(await page.locator('[data-table-title-input]').inputValue(), 'Título em composição');
  assert.equal(compositionBlocked.title, 'Título salvo PILOT.A');
  assert.equal(compositionBlocked.pendingDraft, true);
  await page.locator('[data-table-title-input]').dispatchEvent('compositionend');
  await page.locator('[data-editor-action="cancel-table-title-draft"]').click();

  // 6. Invalid Inspector draft blocks context replacement and remains visible.
  const xInput = page.locator('[data-inspector-field="x"]');
  const canonicalX = String((await state(page)).document.pages[0].objects
    .find((entry) => entry.id === ids.tableObjectId).frame.xMm);
  await xInput.fill('not-a-number');
  await page.locator('[aria-label="Navegação de páginas"] button').nth(1).click();
  const inspectorBlocked = await state(page);
  assert.notEqual(await activePageId(page), ids.secondPageId);
  assert.equal(await xInput.inputValue(), 'not-a-number');
  assert.equal(inspectorBlocked.overlay?.kind, 'INSPECTOR_FRAME_DRAFT_V1');
  assert.equal(inspectorBlocked.pendingDraft, true);

  await xInput.fill(canonicalX);
  await xInput.blur();
  await page.screenshot({ path: resolve(output, 'pilot-a-authorship-trust.png'), fullPage: true });

  const evidence = {
    chromiumVersion: browser.version(),
    ids,
    initial,
    textPageSwitch,
    textCatalogs,
    titlePending,
    titleSaved,
    authoritativeSaved,
    beforeRecovery,
    recovery,
    afterRecovery,
    compositionBlocked,
    inspectorBlocked,
    final: await state(page),
    consoleErrors: errors.consoleErrors,
    pageErrors: errors.pageErrors,
    failedResources: errors.failedResources,
    requestFailures: errors.requestFailures,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  assert.deepEqual(errors.consoleErrors, []);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.failedResources, []);
  assert.deepEqual(errors.requestFailures, []);
  console.log('PILOT.A Authorship Trust Chromium proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
