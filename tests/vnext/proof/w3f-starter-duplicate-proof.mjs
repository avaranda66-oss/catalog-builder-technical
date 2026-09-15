import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w3f-starter-duplicate-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W3F_CLONE_PROOF_PORT ?? 5206);
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

const structuralIntersection = (left, right) => left.filter((identity) => right.includes(identity));
const rowByTitle = async (page, title) => {
  const rows = page.locator('[data-library-catalog-id]');
  const titles = await rows.locator('h2').allTextContents();
  const index = titles.indexOf(title);
  assert(index >= 0, `Missing Library row: ${title}`);
  return rows.nth(index);
};

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/rest/v1/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });

  // Phase 1: Production /v2 bootstrap + W3.F wiring smoke
  const productionRequests = [];
  page.on('request', (req) => productionRequests.push(req.url()));
  await page.goto(`http://127.0.0.1:${port}/v2`, { waitUntil: 'networkidle' });
  await page.locator('[data-catalog-library]').waitFor();
  assert.equal(
    productionRequests.some((url) => url.includes('/src/legacy-main')),
    false,
    'Legacy bootstrap must not be loaded on /v2 route'
  );
  await page.getByRole('button', { name: 'Novo catálogo', exact: true }).click();
  const productionChooser = page.getByRole('dialog', { name: 'Novo catálogo' });
  await productionChooser.waitFor();
  assert.equal(
    await productionChooser.getByRole('button', { name: /Ficha técnica essencial/ }).count(),
    1,
    'Registered production Starter "Ficha técnica essencial" must be present in the production chooser'
  );
  await productionChooser.getByRole('button', { name: 'Fechar' }).click();
  await productionChooser.waitFor({ state: 'detached' });
  const productionSmoke = {
    v2Mounted: true,
    legacyBootstrapLoaded: false,
    essentialStarterPresent: true,
    chooserDismissedCleanly: true,
  };

  // Phase 2: Controlled repository Father-flow proof
  await page.goto(`http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w3e-library-browser.html?proof=w3f`, { waitUntil: 'networkidle' });
  await page.locator('[data-catalog-library]').waitFor();

  const sourceId = await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.ids.alpha);
  const sourceBefore = await page.evaluate((catalogId) => window.__W3E_LIBRARY_PROOF__.catalog(catalogId), sourceId);
  assert(sourceBefore, 'Nontrivial duplicate source must exist');
  assert.deepEqual(sourceBefore.objectTypes, ['text', 'table']);
  assert.equal(sourceBefore.pageCount, 1);

  const sourceRow = await rowByTitle(page, 'Álpha Calibradores');
  await sourceRow.getByRole('button', { name: 'Duplicar' }).click();
  await page.getByText('Cópia de Álpha Calibradores', { exact: true }).waitFor();
  const duplicateRow = await rowByTitle(page, 'Cópia de Álpha Calibradores');
  const duplicateId = await duplicateRow.getAttribute('data-library-catalog-id');
  assert(duplicateId && duplicateId !== sourceId, 'Duplicate must have a fresh root identity');
  const duplicateBeforeEdit = await page.evaluate((catalogId) => window.__W3E_LIBRARY_PROOF__.catalog(catalogId), duplicateId);
  assert(duplicateBeforeEdit);
  assert.deepEqual(duplicateBeforeEdit.origin, {
    originKind: 'duplicate',
    originId: sourceId,
    originRevision: sourceBefore.remoteRevision,
  });
  assert.deepEqual(duplicateBeforeEdit.objectTypes, sourceBefore.objectTypes);
  assert.equal(structuralIntersection(sourceBefore.structuralIds, duplicateBeforeEdit.structuralIds).length, 0);

  await duplicateRow.getByRole('button', { name: 'Abrir' }).click();
  await page.locator('[data-vnext-shell]').waitFor();
  await page.getByRole('heading', { name: 'Cópia de Álpha Calibradores' }).waitFor();
  assert.equal(await page.getByText('Ficha técnica', { exact: true }).count() > 0, true);
  assert.equal(await page.getByText('Modelo', { exact: true }).count() > 0, true);
  assert.equal(await page.locator('[data-editorial-root] [data-table-id]').count(), 1, 'Duplicate must render the preserved table layout');

  await page.getByRole('button', { name: 'Adicionar nova página após a página atual' }).click();
  const saveButton = page.locator('[data-editor-action="save"]');
  await saveButton.waitFor();
  assert.equal(await saveButton.isEnabled(), true, 'Duplicate edit must make Save available');
  await saveButton.click();
  await page.waitForFunction(
    ({ catalogId, revision }) => window.__W3E_LIBRARY_PROOF__.catalog(catalogId)?.remoteRevision === revision + 1,
    { catalogId: duplicateId, revision: duplicateBeforeEdit.remoteRevision }
  );
  const duplicateAfterEdit = await page.evaluate((catalogId) => window.__W3E_LIBRARY_PROOF__.catalog(catalogId), duplicateId);
  const sourceAfterDuplicateSave = await page.evaluate((catalogId) => window.__W3E_LIBRARY_PROOF__.catalog(catalogId), sourceId);
  assert(duplicateAfterEdit && sourceAfterDuplicateSave);
  assert.equal(duplicateAfterEdit.pageCount, 2);
  assert.equal(sourceAfterDuplicateSave.pageCount, sourceBefore.pageCount);
  assert.equal(sourceAfterDuplicateSave.equivalence, sourceBefore.equivalence, 'Saving the duplicate must not mutate the source');

  await page.getByRole('button', { name: 'Voltar aos catálogos' }).click();
  await page.locator('[data-catalog-library]').waitFor();

  const createStarter = async () => {
    await page.getByRole('button', { name: 'Novo catálogo' }).click();
    const chooser = page.getByRole('dialog', { name: 'Novo catálogo' });
    await chooser.waitFor();
    await chooser.getByRole('button', { name: /Ficha técnica essencial/ }).click();
    await page.locator('[data-vnext-shell]').waitFor();
    const catalogId = await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.state().lastOpenedCatalogId);
    assert(catalogId, 'Starter creation must open its exact fresh catalog');
    const catalog = await page.evaluate((id) => window.__W3E_LIBRARY_PROOF__.catalog(id), catalogId);
    assert(catalog);
    await page.getByRole('heading', { name: 'Ficha técnica essencial' }).waitFor();
    assert.equal(await page.locator('[data-editorial-root] [data-table-id]').count(), 1);
    await page.getByRole('button', { name: 'Voltar aos catálogos' }).click();
    await page.locator('[data-catalog-library]').waitFor();
    return catalog;
  };

  const starterOne = await createStarter();
  const starterTwo = await createStarter();
  assert.notEqual(starterOne.catalogId, starterTwo.catalogId);
  assert.deepEqual(starterOne.origin, {
    originKind: 'starter',
    originId: 'essential-technical-sheet',
    originRevision: 1,
  });
  assert.deepEqual(starterTwo.origin, starterOne.origin);
  assert.equal(structuralIntersection(starterOne.structuralIds, starterTwo.structuralIds).length, 0);

  // Unresolved ambiguity phase: arm ambiguous create with verification held offline
  await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.armAmbiguousCreate(true));
  const sourceRowForReplay = await rowByTitle(page, 'Álpha Calibradores');
  await sourceRowForReplay.getByRole('button', { name: 'Duplicar' }).click();

  // 1. Pending state must become visible and primary action is "Verificar criação"
  const pendingAlert = page.getByRole('alert');
  await pendingAlert.waitFor();
  const verifyButtons = page.getByRole('button', { name: 'Verificar criação' });
  assert((await verifyButtons.count()) >= 1, 'Primary resolution action "Verificar criação" must be visible');
  assert.equal(await page.getByRole('button', { name: 'Novo catálogo' }).count(), 0, 'Novo catálogo must not be accessible during pending create');

  // 2. All row Open/Duplicate/Rename/Archive actions must be disabled
  const sourceActionButtons = sourceRowForReplay.locator('button');
  const sourceActionCount = await sourceActionButtons.count();
  assert.equal(sourceActionCount, 4, 'Row must have 4 action buttons');
  for (let i = 0; i < sourceActionCount; i += 1) {
    assert.equal(await sourceActionButtons.nth(i).isDisabled(), true, 'Row action button must be disabled while createPending is true');
  }

  // 3. Allow authoritative verification and resolve pending create
  await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.allowVerification());
  await verifyButtons.first().click();
  await page.waitForFunction(() => window.__W3E_LIBRARY_PROOF__.ambiguousCreateEvidence().replayAccepted);

  const ambiguousDuplicate = await page.evaluate(() => window.__W3E_LIBRARY_PROOF__.ambiguousCreateEvidence());
  assert.equal(ambiguousDuplicate.dispatches, 2);
  assert.equal(ambiguousDuplicate.firstVerificationNotFound, true);
  assert.equal(ambiguousDuplicate.firstCatalogId, ambiguousDuplicate.replayCatalogId);
  assert.equal(ambiguousDuplicate.firstMutationId, ambiguousDuplicate.replayMutationId);
  assert.equal(ambiguousDuplicate.sameDocument, true);
  assert.equal(ambiguousDuplicate.sameOrigin, true);
  assert.equal(ambiguousDuplicate.logicalCatalogCount, 1, 'Ambiguous Duplicate must not create a ghost catalog');

  // 4. Once resolved, row actions must be re-enabled and "Novo catálogo" restored
  await page.getByRole('button', { name: 'Novo catálogo' }).waitFor();
  for (let i = 0; i < sourceActionCount; i += 1) {
    assert.equal(await sourceActionButtons.nth(i).isDisabled(), false, 'Row action button must re-enable once pending create is resolved');
  }

  const sourceAfterAllClones = await page.evaluate((catalogId) => window.__W3E_LIBRARY_PROOF__.catalog(catalogId), sourceId);
  assert.equal(sourceAfterAllClones?.equivalence, sourceBefore.equivalence);

  const seededRecovery = await page.evaluate((catalogId) => window.__W3E_LIBRARY_PROOF__.seedRecovery(catalogId), duplicateId);
  assert.equal(seededRecovery.catalogId, duplicateId);
  const exactDuplicateRow = page.locator(`[data-library-catalog-id="${duplicateId}"]`);
  await exactDuplicateRow.getByRole('button', { name: 'Abrir' }).click();
  const recoveryDialog = page.getByRole('dialog', { name: 'Recuperação local' });
  await recoveryDialog.waitFor();
  assert.equal(await page.locator('[data-vnext-shell]').count(), 0, 'W3.D must still gate the editor before a Recovery decision');
  await recoveryDialog.getByRole('button', { name: 'Abrir versão salva na nuvem' }).click();
  await page.locator('[data-vnext-shell]').waitFor();
  await page.getByRole('button', { name: 'Voltar aos catálogos' }).click();
  await page.locator('[data-catalog-library]').waitFor();

  await page.screenshot({ path: resolve(output, 'desktop-w3f-library.png'), fullPage: true });

  const mobileMatrix = [];
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-catalog-library]').waitFor();
    const sourceMobileRow = await rowByTitle(page, 'Álpha Calibradores');
    const actionHeights = await sourceMobileRow.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    const overflow = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      library: document.querySelector('[data-catalog-library]')?.scrollWidth ?? 0,
    }));
    assert(overflow.body <= overflow.innerWidth);
    assert(overflow.document <= overflow.innerWidth);
    assert(overflow.library <= overflow.innerWidth);
    assert.equal(actionHeights.length, 4);
    assert(actionHeights.every((height) => height >= 44));

    await page.getByRole('button', { name: 'Novo catálogo' }).click();
    const chooser = page.getByRole('dialog', { name: 'Novo catálogo' });
    const chooserBox = await chooser.boundingBox();
    assert(chooserBox && chooserBox.width <= width - 20 && chooserBox.x >= 0);
    const chooserHeights = await chooser.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    assert(chooserHeights.every((height) => height >= 44));
    if (width === 360) await page.screenshot({ path: resolve(output, 'mobile-w3f-360.png'), fullPage: true });
    await chooser.getByRole('button', { name: 'Fechar' }).click();
    mobileMatrix.push({ width, overflow, actionHeights, chooserHeights, chooserBox });
  }

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  const evidence = {
    chromiumVersion: browser.version(),
    productionSmoke,
    pendingNavigationAmendment: {
      rowActionsDisabledDuringPending: true,
      resolutionViaVerificarCriacao: true,
      reenabledAfterResolution: true,
    },
    sourceBefore,
    duplicateBeforeEdit,
    duplicateAfterEdit,
    sourceAfterDuplicateSave,
    starterOne,
    starterTwo,
    ambiguousDuplicate,
    seededRecovery,
    mobileMatrix,
    consoleErrors,
    pageErrors,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('W3.F Starter / Duplicate Chromium + mobile proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
