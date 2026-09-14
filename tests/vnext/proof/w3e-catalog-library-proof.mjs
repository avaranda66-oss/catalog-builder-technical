import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w3e-catalog-library-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W3E_LIBRARY_PROOF_PORT ?? 5205);
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
let browser;

const rowTitles = (page) => page.locator('[data-library-catalog-id] h2').allTextContents();

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const requests = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));

  await page.goto(`http://127.0.0.1:${port}/v2`, { waitUntil: 'networkidle' });
  await page.locator('[data-catalog-library]').waitFor();
  assert.equal(requests.some((url) => url.includes('/src/legacy-main')), false, 'Production /v2 must not load the Legacy app');

  await page.goto(`http://127.0.0.1:${port}/v2?catalog=99999999-9999-4999-8999-999999999999`, { waitUntil: 'networkidle' });
  await page.locator('[data-catalog-open-failure]').waitFor();
  assert.equal(await page.locator('[data-vnext-shell]').count(), 0, 'Failed production exact-open must not expose demo editor fallback');

  await page.goto(`http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w3e-library-browser.html`, { waitUntil: 'networkidle' });
  await page.locator('[data-catalog-library]').waitFor();

  const initialRepositoryFacts = await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.state());
  assert(initialRepositoryFacts.listCalls >= 1, 'Library must list through lightweight metadata repository query');
  assert.equal(initialRepositoryFacts.getCalls, 0, 'Initial Library listing must not fetch full CatalogDocument rows');
  assert.deepEqual(await rowTitles(page), ['Beta Pressão', 'Álpha Calibradores', 'Zeta Temperatura']);
  assert.equal(await page.getByText('Duplicar', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Excluir', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Restaurar', { exact: true }).count(), 0);

  await page.getByPlaceholder('Buscar catálogos').fill('alpha');
  assert.deepEqual(await rowTitles(page), ['Álpha Calibradores']);
  await page.getByPlaceholder('Buscar catálogos').fill('');
  await page.locator('.vnext-library-sort select').selectOption('title-asc');
  assert.deepEqual(await rowTitles(page), ['Álpha Calibradores', 'Beta Pressão', 'Zeta Temperatura']);

  const alphaRow = page.locator('[data-library-catalog-id]').filter({ hasText: 'Álpha Calibradores' });
  await alphaRow.getByRole('button', { name: 'Abrir' }).click();
  const alphaId = await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.ids.alpha);
  await page.waitForFunction((catalogId) => window.__W3E_LIBRARY_PROOF__.state().lastCanonicalOpen?.catalogId === catalogId, alphaId);
  const openState = await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.state());
  assert.equal(openState.lastOpenedCatalogId, alphaId);
  assert.deepEqual(openState.lastCanonicalOpen, { catalogId: alphaId, ok: true });

  const missingId = '99999999-9999-4999-8999-999999999999';
  assert.deepEqual(
    await page.evaluate((catalogId) => window.__W3E_LIBRARY_PROOF__.openExact(catalogId), missingId),
    { ok: false, code: 'NOT_FOUND' },
    'Missing exact ID must fail without opening another catalog'
  );

  const persistedEdit = await page.evaluate((catalogId) => window.__W3E_LIBRARY_PROOF__.editSaveReopen(catalogId), alphaId);
  assert.equal(persistedEdit.afterSavePages, persistedEdit.beforePages + 1, 'Browser edit must persist a complete changed document');
  assert.equal(persistedEdit.reopenedPages, persistedEdit.afterSavePages, 'Canonical reopen must observe the saved document');
  assert(persistedEdit.remoteRevision >= 2, 'Save acknowledgement must advance remote lineage');

  const renameButton = alphaRow.getByRole('button', { name: 'Renomear' });
  await renameButton.focus();
  assert.equal(await renameButton.evaluate((button) => button === document.activeElement), true, 'Rename action must be keyboard focusable');
  await page.keyboard.press('Enter');
  const renameDialog = page.getByRole('dialog', { name: 'Renomear catálogo' });
  await renameDialog.locator('input').fill('Álpha Industrial');
  await renameDialog.getByRole('button', { name: 'Salvar nome' }).click();
  await page.getByText('Álpha Industrial', { exact: true }).waitFor();

  const betaRow = page.locator('[data-library-catalog-id]').filter({ hasText: 'Beta Pressão' });
  await betaRow.getByRole('button', { name: 'Arquivar' }).click();
  const archiveDialog = page.getByRole('dialog', { name: /Arquivar “Beta Pressão”/ });
  assert.match(await archiveDialog.textContent(), /não será excluído permanentemente/i);
  await archiveDialog.getByRole('button', { name: 'Arquivar catálogo' }).click();
  await page.waitForFunction(() => !document.body.textContent?.includes('Beta Pressão'));

  await page.getByRole('tab', { name: 'Arquivados' }).click();
  await page.getByText('Catálogo Histórico', { exact: true }).waitFor();
  const archivedTitles = await rowTitles(page);
  assert.deepEqual(archivedTitles, ['Beta Pressão', 'Catálogo Histórico']);
  assert.equal(await page.getByRole('button', { name: 'Abrir' }).count(), 0);

  const staleArchiveRace = await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.staleSaveAfterArchive());
  assert.equal(staleArchiveRace.archiveOk, true);
  assert.equal(staleArchiveRace.staleSaveOk, false);
  assert.equal(staleArchiveRace.staleSaveCode, 'ARCHIVED');
  assert(staleArchiveRace.archivedAt, 'Archive must remain authoritative after stale Save attempt');
  assert.equal(staleArchiveRace.pageCount, 1, 'Stale edited page must not resurrect into archived remote document');
  assert.equal(staleArchiveRace.remoteRevision, 2, 'Only Archive may advance the race catalog revision');

  await page.getByRole('tab', { name: 'Ativos' }).click();
  const beforeCreateOpenId = (await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.state())).lastOpenedCatalogId;
  await page.getByRole('button', { name: 'Novo catálogo' }).click();
  await page.waitForFunction((previous) => window.__W3E_LIBRARY_PROOF__.state().lastOpenedCatalogId !== previous, beforeCreateOpenId);
  const afterCreate = await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.state());
  assert(afterCreate.activeTitles.includes('Novo catálogo'));
  await page.waitForFunction(
    (catalogId) => window.__W3E_LIBRARY_PROOF__.state().lastCanonicalOpen?.catalogId === catalogId
      && window.__W3E_LIBRARY_PROOF__.state().lastCanonicalOpen?.ok === true,
    afterCreate.lastOpenedCatalogId
  );

  const zetaId = await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.ids.zeta);
  const seededRecovery = await page.evaluate((catalogId) => window.__W3E_LIBRARY_PROOF__.seedRecovery(catalogId), zetaId);
  assert.equal(seededRecovery.catalogId, zetaId);
  assert.equal(await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.recoveryCount()), 1);
  const zetaRow = page.locator('[data-library-catalog-id]').filter({ hasText: 'Zeta Temperatura' });
  await zetaRow.getByRole('button', { name: 'Abrir' }).click();
  const recoveryDialog = page.getByRole('dialog', { name: 'Recuperação local' });
  await recoveryDialog.waitFor();
  assert.equal(await page.locator('[data-vnext-shell]').count(), 0, 'W3.D gate must keep editor absent before recovery decision');
  assert.equal(await page.locator('[data-editor-action="save"]').count(), 0, 'Save must be structurally unavailable before recovery decision');
  await recoveryDialog.getByRole('button', { name: 'Abrir versão salva na nuvem' }).click();
  await page.locator('[data-vnext-shell]').waitFor();
  assert.equal(await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.recoveryCount()), 1, 'Cloud-open choice preserves recoverable local record under W3.D retention semantics');
  await page.getByRole('button', { name: 'Catálogos' }).click();
  await page.locator('[data-catalog-library]').waitFor();
  assert.equal(await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.recoveryCount()), 1, 'Library navigation must not broadly delete Recovery records');

  await page.screenshot({ path: resolve(output, 'desktop-library.png'), fullPage: true });

  const mobileMatrix = [];
  let actionHeights = [];
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-catalog-library]').waitFor();
    const facts = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      shellScrollWidth: document.querySelector('[data-catalog-library]')?.scrollWidth ?? 0,
      createHeight: document.querySelector('.vnext-library-create')?.getBoundingClientRect().height ?? 0,
      searchWidth: document.querySelector('.vnext-library-search')?.getBoundingClientRect().width ?? 0,
    }));
    assert(facts.bodyScrollWidth <= facts.innerWidth);
    assert(facts.documentScrollWidth <= facts.innerWidth);
    assert(facts.shellScrollWidth <= facts.innerWidth);
    assert(facts.createHeight >= 42);
    assert(facts.searchWidth > 0 && facts.searchWidth <= facts.innerWidth - 20);
    await page.getByPlaceholder('Buscar catálogos').fill('alpha');
    assert.deepEqual(await rowTitles(page), ['Álpha Calibradores']);
    await page.getByPlaceholder('Buscar catálogos').fill('');
    await page.getByRole('tab', { name: 'Arquivados' }).click();
    await page.getByRole('tab', { name: 'Ativos' }).click();
    const firstRow = page.locator('[data-library-catalog-id]').first();
    actionHeights = await firstRow.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    assert(actionHeights.length >= 3 && actionHeights.every((height) => height >= 44));
    mobileMatrix.push({ width, ...facts, actionHeights });
    if (width === 360) {
      await firstRow.getByRole('button', { name: 'Renomear' }).click();
      const mobileRenameDialog = page.getByRole('dialog', { name: 'Renomear catálogo' });
      const renameDialogBox = await mobileRenameDialog.boundingBox();
      assert(renameDialogBox && renameDialogBox.width <= 340 && renameDialogBox.x >= 0);
      await mobileRenameDialog.getByRole('button', { name: 'Cancelar' }).click();
      await firstRow.getByRole('button', { name: 'Arquivar' }).click();
      const mobileDialog = page.getByRole('dialog');
      const dialogBox = await mobileDialog.boundingBox();
      assert(dialogBox && dialogBox.width <= 340 && dialogBox.x >= 0);
      await page.screenshot({ path: resolve(output, 'mobile-library-360.png'), fullPage: true });
      await mobileDialog.getByRole('button', { name: 'Cancelar' }).click();
    }
  }

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  const evidence = {
    chromiumVersion: browser.version(),
    initialRepositoryFacts: {
      listCalls: initialRepositoryFacts.listCalls,
      getCalls: initialRepositoryFacts.getCalls,
    },
    persistedEdit,
    staleArchiveRace,
    seededRecovery,
    mobileMatrix,
    actionHeights,
    archivedTitles,
    afterCreate,
    consoleErrors,
    pageErrors,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('W3.E Catalog Library Chromium + mobile proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
