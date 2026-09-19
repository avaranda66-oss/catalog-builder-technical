import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w3i-father-browser-flow-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W3I_PROOF_PORT ?? 5211);
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

const databaseName = `catalog_builder_vnext_w3i_${Date.now()}`;
const fixtureBase = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w3i-father-browser.html`;
const fixtureUrl = `${fixtureBase}?db=${encodeURIComponent(databaseName)}`;
const resetUrl = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w3d-indexeddb.html`;
const productionUrl = `http://127.0.0.1:${port}/v2`;
const forbiddenFatherTerms = /\b(?:CAS|expectedRevision|revision ID|mutationId|IndexedDB|storage key|repository|row version|JSON|database)\b/i;
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

let browser;
const consoleErrors = [];
const pageErrors = [];
const fatherLanguageSurfaces = new Set();

function observe(page, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', (error) => pageErrors.push(`${label}: ${error.message}`));
}

async function state(page) {
  return page.evaluate(() => window.__W3I_PROOF__.state());
}

async function catalog(page, catalogId) {
  return page.evaluate((id) => window.__W3I_PROOF__.catalog(id), catalogId);
}

async function waitForEditor(page) {
  await page.locator('[data-vnext-shell]').waitFor();
  await page.waitForFunction(() => window.__W3I_PROOF__?.state().runtime !== null);
}

async function waitForLibrary(page) {
  await page.locator('[data-catalog-library]').waitFor();
  await page.getByRole('heading', { name: 'Catálogos', exact: true }).waitFor();
}

async function resolveRecoveryByDiscardingThroughUi(page) {
  const dialog = page.getByRole('dialog', { name: 'Recuperação local' });
  const shell = page.locator('[data-vnext-shell]');
  await Promise.race([dialog.waitFor(), shell.waitFor()]);
  for (let attempts = 0; attempts < 8 && await dialog.isVisible().catch(() => false); attempts += 1) {
    const discard = dialog.getByRole('button', { name: 'Descartar recuperação local', exact: true }).first();
    if (!await discard.isVisible().catch(() => false)) break;
    await discard.click();
    await dialog.getByRole('button', { name: 'Confirmar descarte local', exact: true }).first().click();
  }
  await waitForEditor(page);
}

async function openTextEditor(page) {
  const current = await state(page);
  const objectId = current.runtime?.textObjectId;
  assert(objectId, 'The integrated Father document must expose a Text object');
  const object = page.locator(`[data-editor-object-id="${objectId}"]`);
  await object.click();
  await object.press('Enter');
  await page.locator('[data-text-edit-textarea]').waitFor();
}

async function fillDraft(page, value) {
  await openTextEditor(page);
  await page.locator('[data-text-edit-textarea]').fill(value);
}

async function commitDraft(page) {
  await page.locator('[data-editor-action="commit-text"]').click();
  await page.locator('[data-text-edit-textarea]').waitFor({ state: 'detached' });
}

async function editAndCommit(page, value) {
  await fillDraft(page, value);
  await commitDraft(page);
}

async function waitSaved(page, expectedText) {
  await page.waitForFunction((text) => {
    const current = window.__W3I_PROOF__.state().runtime;
    return current?.saveLabel === 'Saved'
      && current.dirty === false
      && current.authoritative?.text === text;
  }, expectedText);
}

async function assertNoFatherJargon(page, surface, selector) {
  const root = selector ? page.locator(selector) : page.locator('body');
  const visibleText = await root.innerText();
  assert.equal(
    forbiddenFatherTerms.test(visibleText),
    false,
    `${surface} exposed technical persistence jargon: ${visibleText}`
  );
  fatherLanguageSurfaces.add(surface);
}

async function assertNoHorizontalOverflow(page, width, requiredButtonNames = []) {
  await page.setViewportSize({ width, height: 900 });
  const overflow = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const offenders = [...document.querySelectorAll('*')]
      .map((element) => {
        const html = element;
        const rect = html.getBoundingClientRect();
        const style = getComputedStyle(html);
        return {
          tag: html.tagName,
          className: html.className,
          width: rect.width,
          left: rect.left,
          right: rect.right,
          scrollWidth: html.scrollWidth,
          minWidth: style.minWidth,
          position: style.position,
        };
      })
      .filter((entry) => entry.width > viewport || entry.right > viewport + 1 || entry.left < -1)
      .sort((left, right) => right.width - left.width)
      .slice(0, 12);
    return {
      viewport,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      hasEditorShell: Boolean(document.querySelector('[data-vnext-shell]')),
      offenders,
    };
  });
  assert(overflow.documentWidth <= overflow.viewport, `Document overflow at ${width}px: ${JSON.stringify(overflow)}`);
  assert(overflow.bodyWidth <= overflow.viewport, `Body overflow at ${width}px: ${JSON.stringify(overflow)}`);
  for (const name of requiredButtonNames) {
    const button = page.getByRole('button', { name, exact: true }).first();
    await button.waitFor();
    assert.equal(await button.isVisible(), true, `${name} must be reachable at ${width}px`);
  }
  return overflow;
}

async function assertRecoveryPreviewAtViewport(page, width, minimumButtonHeight) {
  await page.setViewportSize({ width, height: 900 });
  const dialog = page.getByRole('dialog', { name: 'Recuperação local' });
  const panel = dialog.locator('.vnext-recovery-panel');
  const inspection = dialog.locator('[data-protected-recovery-inspection]');
  const preview = inspection.locator('.vnext-recovery-document-preview');
  const editorial = preview.locator('[data-editorial-root]');
  await editorial.waitFor();
  assert.equal(await preview.isVisible(), true, `Recovery preview must be visible at ${width}px`);
  assert.equal(await editorial.isVisible(), true, `Recovered A4 content must be visible at ${width}px`);

  const geometry = await page.evaluate(() => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const panelElement = document.querySelector('.vnext-recovery-panel');
    const inspectionElement = document.querySelector('[data-protected-recovery-inspection]');
    const previewElement = inspectionElement?.querySelector('.vnext-recovery-document-preview');
    const editorialElement = previewElement?.querySelector('[data-editorial-root]');
    if (!panelElement || !inspectionElement || !previewElement || !editorialElement) {
      throw new Error('Recovery preview geometry target is missing');
    }
    const editorialRect = rect(editorialElement);
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      panel: rect(panelElement),
      inspection: {
        ...rect(inspectionElement),
        clientWidth: inspectionElement.clientWidth,
        scrollWidth: inspectionElement.scrollWidth,
      },
      preview: {
        ...rect(previewElement),
        clientWidth: previewElement.clientWidth,
        scrollWidth: previewElement.scrollWidth,
      },
      editorial: {
        ...editorialRect,
        offsetWidth: editorialElement.offsetWidth,
        offsetHeight: editorialElement.offsetHeight,
        scaleX: editorialRect.width / editorialElement.offsetWidth,
        scaleY: editorialRect.height / editorialElement.offsetHeight,
      },
    };
  });

  assert(geometry.documentWidth <= width, `Recovery document overflow at ${width}px: ${JSON.stringify(geometry)}`);
  assert(geometry.bodyWidth <= width, `Recovery body overflow at ${width}px: ${JSON.stringify(geometry)}`);
  assert(geometry.panel.left >= -1 && geometry.panel.right <= width + 1, `Recovery panel must fit ${width}px`);
  assert(geometry.inspection.scrollWidth <= geometry.inspection.clientWidth + 1, `Protected inspection must not clip horizontally at ${width}px`);
  assert(geometry.preview.scrollWidth <= geometry.preview.clientWidth + 1, `Recovery preview must not hide horizontal content at ${width}px`);
  assert(geometry.editorial.scaleX > 0 && geometry.editorial.scaleX < 1, `Recovered A4 preview must be scaled at ${width}px`);
  assert(Math.abs(geometry.editorial.scaleX - geometry.editorial.scaleY) < 0.01, `Recovered A4 preview scale must be uniform at ${width}px`);
  assert(geometry.editorial.left >= geometry.preview.left - 1, `Recovered preview left edge is clipped at ${width}px`);
  assert(geometry.editorial.right <= geometry.preview.right + 1, `Recovered preview right edge is clipped at ${width}px`);
  assert(geometry.editorial.top >= geometry.preview.top - 1, `Recovered preview top edge is clipped at ${width}px`);
  assert(geometry.editorial.bottom <= geometry.preview.bottom + 1, `Recovered preview bottom edge is clipped at ${width}px`);

  const actions = [
    'Recuperar minhas alterações',
    'Ver alterações recuperadas',
    'Descartar recuperação local',
  ];
  const buttonGeometry = {};
  for (const name of actions) {
    const button = dialog.getByRole('button', { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    assert(box, `${name} must have usable geometry at ${width}px`);
    assert(box.width >= 44, `${name} must remain wide enough at ${width}px`);
    assert(box.height >= minimumButtonHeight, `${name} must remain tall enough at ${width}px`);
    assert(box.x >= -1 && box.x + box.width <= width + 1, `${name} must remain horizontally reachable at ${width}px`);
    assert(box.y >= -1 && box.y + box.height <= 901, `${name} must remain vertically reachable at ${width}px`);
    buttonGeometry[name] = box;
  }
  return { width, geometry, buttonGeometry };
}

function intersection(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });

  const resetPage = await context.newPage();
  await resetPage.goto(resetUrl);
  await resetPage.evaluate(async (dbName) => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('w3i-proof:')) localStorage.removeItem(key);
    }
    await new Promise((resolvePromise, rejectPromise) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolvePromise(undefined);
      request.onerror = () => rejectPromise(request.error);
      request.onblocked = () => rejectPromise(new Error('W3.I recovery database deletion blocked'));
    });
  }, databaseName);
  await resetPage.close();

  const father = await context.newPage();
  observe(father, 'father');
  await father.goto(fixtureUrl, { waitUntil: 'networkidle' });
  await waitForLibrary(father);
  await assertNoFatherJargon(father, 'Library');

  // W3I-01: Father enters the real Library component and creates from a registered Starter.
  await father.getByRole('button', { name: 'Novo catálogo', exact: true }).click();
  await father.getByRole('dialog', { name: 'Novo catálogo' }).waitFor();
  await father.getByRole('button', { name: /Ficha técnica essencial/ }).click();
  await waitForEditor(father);
  const created = await state(father);
  assert(created.runtime);
  assert.equal(created.runtime.bindingKind, 'PERSISTED');
  assert.equal(created.runtime.remoteRevision, 1);
  assert.equal(created.runtime.localSequence, 0);
  assert.equal(created.runtime.canUndo, false);
  assert.equal(created.runtime.canRedo, false);
  assert.equal(created.runtime.saveLabel, 'Saved');
  assert.equal((await father.locator('[data-save-state]').textContent())?.trim(), 'Salvo');
  await assertNoFatherJargon(father, 'Editor', '[data-vnext-shell]');
  const sourceCatalogId = created.runtime.catalogId;
  const sourceOpenSessionId = created.runtime.openSessionId;
  const starterCatalog = await catalog(father, sourceCatalogId);
  assert(starterCatalog);
  assert.equal(starterCatalog.origin?.originKind, 'starter');
  assert.equal(starterCatalog.origin?.originId, 'essential-technical-sheet');

  // W3I-02: active draft blocks autosave beyond debounce; explicit completion enables Saving -> Saved.
  await editAndCommit(father, 'Pai canonical antes do rascunho');
  await fillDraft(father, 'Texto do Pai salvo automaticamente');
  const activeDraftBefore = await state(father);
  assert.equal(activeDraftBefore.runtime?.text, 'Pai canonical antes do rascunho');
  assert.equal(await father.locator('[data-text-edit-textarea]').inputValue(), 'Texto do Pai salvo automaticamente');
  assert.equal(activeDraftBefore.saveDispatchCount, 0);
  await father.waitForTimeout(400);
  const activeDraftAfter = await state(father);
  assert.equal(activeDraftAfter.runtime?.text, 'Pai canonical antes do rascunho');
  assert.equal(activeDraftAfter.runtime?.authoritative?.text, 'Ficha técnica');
  assert.equal(activeDraftAfter.saveDispatchCount, 0);
  await father.evaluate(() => window.__W3I_PROOF__.holdNextSave());
  await commitDraft(father);
  await father.waitForFunction(() => {
    const current = window.__W3I_PROOF__.state();
    return current.runtime?.savePhase === 'saving'
      && current.heldSaveText === 'Texto do Pai salvo automaticamente';
  });
  const saving = await state(father);
  assert.equal(saving.runtime?.saveLabel, 'Saving…');
  assert.equal((await father.locator('[data-save-state]').textContent())?.trim(), 'Salvando…');
  assert.equal(await father.getByRole('button', { name: 'Salvo', exact: true }).count(), 0);
  assert.equal(saving.saveDispatchCount, 1);
  await father.evaluate(() => window.__W3I_PROOF__.releaseHeldSave());
  await waitSaved(father, 'Texto do Pai salvo automaticamente');
  const autosaved = await state(father);
  assert.equal((await father.locator('[data-save-state]').textContent())?.trim(), 'Salvo');
  assert.equal(autosaved.runtime?.canUndo, true);
  assert.equal(autosaved.runtime?.remoteRevision, 2);

  // W3I-03: image selection/upload goes through the real Editor UI and canonical Asset bridge.
  const imageObjectId = (await state(father)).runtime?.imageObjectId;
  assert(imageObjectId);
  await father.locator(`[data-editor-object-id="${imageObjectId}"]`).click();
  await father.locator('[data-editor-action="upload-image-input"]').setInputFiles({
    name: 'father-proof.png',
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  try {
    await father.waitForFunction(() => {
      const runtime = window.__W3I_PROOF__.state().runtime;
      return runtime?.document.assets.some((asset) => asset.id !== '11111111-1111-4111-8111-111111111111')
        && runtime.assetRuntimeStates.some((entry) => entry.status === 'resolved');
    }, undefined, { timeout: 8_000 });
  } catch (error) {
    console.error('W3.I asset checkpoint', JSON.stringify({
      state: await state(father),
      visibleText: await father.locator('body').innerText(),
    }, null, 2));
    throw error;
  }
  await waitSaved(father, 'Texto do Pai salvo automaticamente');
  const assetSaved = await state(father);
  assert(assetSaved.runtime);
  const savedImage = assetSaved.runtime.document.pages
    .flatMap((page) => page.objects)
    .find((object) => object.type === 'image');
  assert(savedImage && savedImage.type === 'image');
  const canonicalAssetRef = assetSaved.runtime.document.assets.find((asset) => asset.id === savedImage.assetId);
  assert(canonicalAssetRef);
  const canonicalDocumentJson = JSON.stringify(assetSaved.runtime.document);
  assert.equal(/blob:|token=|data:image|base64/i.test(canonicalDocumentJson), false);
  const uploadedRuntimeState = assetSaved.runtime.assetRuntimeStates.find((entry) => entry.id === canonicalAssetRef.id);
  assert(uploadedRuntimeState);
  assert.equal(canonicalDocumentJson.includes(uploadedRuntimeState.runtimeUrl), false);
  assert.equal(uploadedRuntimeState.status, 'resolved');

  // W3I-04: leave through UI and exact reopen through Library with a fresh clean session.
  const documentBeforeReopen = assetSaved.runtime.document;
  await father.getByRole('button', { name: 'Voltar aos catálogos', exact: true }).click();
  await waitForLibrary(father);
  const sourceRow = father.locator(`[data-library-catalog-id="${sourceCatalogId}"]`);
  await sourceRow.getByRole('button', { name: 'Abrir', exact: true }).click();
  await waitForEditor(father);
  const reopened = await state(father);
  assert(reopened.runtime);
  assert.notEqual(reopened.runtime.openSessionId, sourceOpenSessionId);
  assert.equal(reopened.runtime.canUndo, false);
  assert.equal(reopened.runtime.canRedo, false);
  assert.equal(reopened.runtime.localSequence, 0);
  assert.equal(reopened.runtime.saveLabel, 'Saved');
  assert.deepEqual(reopened.runtime.document, documentBeforeReopen);
  assert.equal(reopened.runtime.assetRuntimeStates[0].status, 'resolved');

  // W3I-05: Duplicate through Father UI, with controlled ambiguous Create reconciliation.
  await father.getByRole('button', { name: 'Voltar aos catálogos', exact: true }).click();
  await waitForLibrary(father);
  const sourceBeforeDuplicate = await catalog(father, sourceCatalogId);
  const createDispatchesBeforeDuplicate = (await state(father)).createDispatchCount;
  await father.evaluate(() => window.__W3I_PROOF__.armAmbiguousCreate());
  await father.locator(`[data-library-catalog-id="${sourceCatalogId}"]`).getByRole('button', { name: 'Duplicar', exact: true }).click();
  await father.getByText('Cópia de Ficha técnica essencial', { exact: true }).waitFor();
  const afterDuplicate = await state(father);
  assert.equal(afterDuplicate.createDispatchCount, createDispatchesBeforeDuplicate + 1);
  const duplicateCatalogId = afterDuplicate.catalogIds.find((id) => id !== sourceCatalogId);
  assert(duplicateCatalogId);
  const duplicateAtCreate = await catalog(father, duplicateCatalogId);
  assert(duplicateAtCreate);
  assert.equal(duplicateAtCreate.origin?.originKind, 'duplicate');
  assert.equal(duplicateAtCreate.origin?.originId, sourceCatalogId);
  assert.deepEqual(duplicateAtCreate.assetRefs, sourceBeforeDuplicate?.assetRefs);
  assert.deepEqual(intersection(sourceBeforeDuplicate.structuralIds, duplicateAtCreate.structuralIds), []);
  assert.deepEqual(await catalog(father, sourceCatalogId), sourceBeforeDuplicate);

  // Reopen source and duplicate independently, then edit/save only the duplicate.
  await father.locator(`[data-library-catalog-id="${sourceCatalogId}"]`).getByRole('button', { name: 'Abrir', exact: true }).click();
  await waitForEditor(father);
  const sourceIndependentOpen = await state(father);
  await father.getByRole('button', { name: 'Voltar aos catálogos', exact: true }).click();
  await waitForLibrary(father);
  await father.locator(`[data-library-catalog-id="${duplicateCatalogId}"]`).getByRole('button', { name: 'Abrir', exact: true }).click();
  await waitForEditor(father);
  const duplicateIndependentOpen = await state(father);
  assert.notEqual(sourceIndependentOpen.runtime?.openSessionId, duplicateIndependentOpen.runtime?.openSessionId);
  await editAndCommit(father, 'Cópia independente do Pai');
  await waitSaved(father, 'Cópia independente do Pai');
  assert.deepEqual(await catalog(father, sourceCatalogId), sourceBeforeDuplicate);
  assert.equal((await catalog(father, duplicateCatalogId)).text, 'Cópia independente do Pai');

  // W3I-06: active draft is physically recovered through IndexedDB after page reload.
  await fillDraft(father, 'Rascunho recuperado do Pai');
  const recoveryBeforeCrash = await state(father);
  await father.evaluate(() => window.__W3I_PROOF__.flushRecovery());
  const storedRecovery = await father.evaluate(() => window.__W3I_PROOF__.recoveryRecords());
  assert.equal(storedRecovery.length, 1);
  assert.equal(storedRecovery[0].authorityScopeId, 'father-proof:workspace:user');
  assert.equal(storedRecovery[0].catalogId, duplicateCatalogId);
  assert.equal(storedRecovery[0].openSessionId, recoveryBeforeCrash.runtime.openSessionId);
  assert.equal(storedRecovery[0].canonicalText, 'Cópia independente do Pai');
  assert.equal(storedRecovery[0].draft, 'Rascunho recuperado do Pai');
  await father.reload({ waitUntil: 'networkidle' });
  const recoveryDialog = father.getByRole('dialog', { name: 'Recuperação local' });
  await recoveryDialog.waitFor();
  const inspectRecovery = recoveryDialog.getByRole('button', { name: 'Ver alterações recuperadas', exact: true });
  assert.equal(await inspectRecovery.isVisible(), true);
  await inspectRecovery.click();
  const protectedInspection = recoveryDialog.locator('[data-protected-recovery-inspection]');
  await protectedInspection.waitFor();
  assert.equal(await protectedInspection.count(), 1);
  assert.equal(await protectedInspection.locator('[data-editorial-root]').count(), 1);
  await assertNoFatherJargon(father, 'Recovery', '[role="dialog"][aria-label="Recuperação local"]');
  const recoveryPreviewMobile = [];
  for (const width of [320, 360, 390]) {
    recoveryPreviewMobile.push(await assertRecoveryPreviewAtViewport(father, width, 44));
  }
  const recoveryPreviewDesktop = await assertRecoveryPreviewAtViewport(father, 1280, 36);
  await father.getByRole('button', { name: 'Recuperar minhas alterações', exact: true }).click();
  await father.locator('[data-text-edit-textarea]').waitFor();
  const recovered = await state(father);
  assert(recovered.runtime);
  assert.notEqual(recovered.runtime.openSessionId, recoveryBeforeCrash.runtime.openSessionId);
  assert.equal(recovered.runtime.text, 'Cópia independente do Pai');
  assert.equal(await father.locator('[data-text-edit-textarea]').inputValue(), 'Rascunho recuperado do Pai');
  assert.notEqual(recovered.runtime.saveLabel, 'Saved');
  assert.equal(recovered.runtime.canUndo, false);
  assert.equal(recovered.runtime.canRedo, false);
  assert.deepEqual(await father.evaluate(() => window.__W3I_PROOF__.recoveryRecords('father-proof:workspace:other-user')), []);
  await commitDraft(father);
  await waitSaved(father, 'Rascunho recuperado do Pai');
  await father.setViewportSize({ width: 1500, height: 1100 });

  // W3I-07: two independent sessions race; stale autosave conflicts, then Father opens latest.
  const pageA = father;
  const pageB = await context.newPage();
  observe(pageB, 'conflict-b');
  const directDuplicateUrl = `${fixtureUrl}&catalog=${encodeURIComponent(duplicateCatalogId)}`;
  await pageB.goto(directDuplicateUrl, { waitUntil: 'networkidle' });
  await waitForEditor(pageB);
  const openedA = await state(pageA);
  const openedB = await state(pageB);
  assert.equal(openedA.runtime?.remoteRevision, openedB.runtime?.remoteRevision);
  assert.notEqual(openedA.runtime?.openSessionId, openedB.runtime?.openSessionId);
  await editAndCommit(pageA, 'Autoridade avançada pelo Pai A');
  await waitSaved(pageA, 'Autoridade avançada pelo Pai A');
  await editAndCommit(pageB, 'Trabalho local preservado do Pai B');
  await pageB.waitForFunction(() => window.__W3I_PROOF__.state().runtime?.savePhase === 'conflict');
  const conflictOpenLatest = await state(pageB);
  assert.equal(conflictOpenLatest.runtime?.dirty, true);
  assert.equal(conflictOpenLatest.runtime?.text, 'Trabalho local preservado do Pai B');
  const conflictActions = pageB.locator('[data-persistence-conflict-actions]');
  assert.equal(await conflictActions.getByRole('button').count(), 2);
  assert.equal((await pageB.locator('[data-save-state]').textContent())?.trim(), 'Conflito');
  await assertNoFatherJargon(pageB, 'Conflict', '[data-vnext-shell]');
  for (const width of [320, 360, 390]) {
    await assertNoHorizontalOverflow(pageB, width, [
      'Abrir versão mais recente',
      'Salvar meu trabalho como cópia',
    ]);
  }
  const conflictedOpenSessionId = conflictOpenLatest.runtime.openSessionId;
  await conflictActions.getByRole('button', { name: 'Abrir versão mais recente', exact: true }).click();
  await pageB.waitForFunction((previous) => {
    const current = window.__W3I_PROOF__.state().runtime;
    return current?.openSessionId !== previous
      && current.saveLabel === 'Saved'
      && current.text === 'Autoridade avançada pelo Pai A';
  }, conflictedOpenSessionId);
  const openedLatest = await state(pageB);
  assert.equal(openedLatest.runtime?.canUndo, false);
  assert.equal(openedLatest.runtime?.canRedo, false);
  const protectedConflictRecovery = await pageB.evaluate(() => window.__W3I_PROOF__.recoveryRecords());
  assert(protectedConflictRecovery.some((record) => record.canonicalText === 'Trabalho local preservado do Pai B'));

  // W3I-08: second conflict resolves via one single-flight Save-as-copy Create.
  await pageA.setViewportSize({ width: 1500, height: 1100 });
  await pageB.setViewportSize({ width: 1500, height: 1100 });
  await editAndCommit(pageA, 'Autoridade final do catálogo fonte');
  await waitSaved(pageA, 'Autoridade final do catálogo fonte');
  await editAndCommit(pageB, 'Meu trabalho como cópia');
  await pageB.waitForFunction(() => window.__W3I_PROOF__.state().runtime?.savePhase === 'conflict');
  const copyConflict = await state(pageB);
  const sourceBeforeCopy = await catalog(pageB, duplicateCatalogId);
  const createBeforeCopy = copyConflict.createDispatchCount;
  const copyActions = pageB.locator('[data-persistence-conflict-actions]');
  await pageB.evaluate(() => window.__W3I_PROOF__.holdNextCreate());
  await copyActions.getByRole('button', { name: 'Salvar meu trabalho como cópia', exact: true }).click();
  await pageB.waitForFunction((before) => {
    const current = window.__W3I_PROOF__.state();
    return current.runtime?.conflictResolutionState === 'resolving-save-as-copy'
      && current.createDispatchCount === before + 1;
  }, createBeforeCopy);
  assert.equal(await copyActions.getByRole('button').nth(0).isDisabled(), true);
  assert.equal(await copyActions.getByRole('button').nth(1).isDisabled(), true);
  await pageB.waitForTimeout(100);
  assert.equal((await state(pageB)).createDispatchCount, createBeforeCopy + 1);
  await pageB.evaluate(() => window.__W3I_PROOF__.releaseHeldCreate());
  await pageB.waitForFunction((sourceId) => {
    const current = window.__W3I_PROOF__.state().runtime;
    return current?.catalogId !== sourceId && current.saveLabel === 'Saved' && current.dirty === false;
  }, duplicateCatalogId);
  const copyOpened = await state(pageB);
  const conflictCopyId = copyOpened.runtime.catalogId;
  const conflictCopy = await catalog(pageB, conflictCopyId);
  const sourceAfterCopy = await catalog(pageB, duplicateCatalogId);
  assert.deepEqual(sourceAfterCopy, sourceBeforeCopy);
  assert.equal(conflictCopy.text, 'Meu trabalho como cópia');
  assert.deepEqual(intersection(sourceBeforeCopy.structuralIds, conflictCopy.structuralIds), []);
  assert.deepEqual(conflictCopy.assetRefs, sourceBeforeCopy.assetRefs);
  assert.notEqual(copyOpened.runtime.openSessionId, copyConflict.runtime.openSessionId);
  assert.equal(copyOpened.runtime.canUndo, false);
  assert.equal(copyOpened.runtime.canRedo, false);

  // W3I-09: keep a stale session, then Rename and Archive through Library UI.
  const stalePage = await context.newPage();
  observe(stalePage, 'archive-stale');
  await stalePage.goto(`${fixtureUrl}&catalog=${encodeURIComponent(conflictCopyId)}`, { waitUntil: 'networkidle' });
  await resolveRecoveryByDiscardingThroughUi(stalePage);
  const staleBeforeArchive = await state(stalePage);
  await pageB.getByRole('button', { name: 'Voltar aos catálogos', exact: true }).click();
  await waitForLibrary(pageB);
  const copyRow = pageB.locator(`[data-library-catalog-id="${conflictCopyId}"]`);
  await copyRow.getByRole('button', { name: 'Renomear', exact: true }).click();
  const renameDialog = pageB.getByRole('dialog', { name: 'Renomear catálogo' });
  await renameDialog.getByLabel('Nome do catálogo').fill('Fechamento Pai W3.I');
  await renameDialog.getByRole('button', { name: 'Salvar nome', exact: true }).click();
  await pageB.getByText('Fechamento Pai W3.I', { exact: true }).waitFor();
  await pageB.locator(`[data-library-catalog-id="${conflictCopyId}"]`).getByRole('button', { name: 'Abrir', exact: true }).click();
  await waitForEditor(pageB);
  const renamedReopen = await state(pageB);
  assert.equal(renamedReopen.runtime?.title, 'Fechamento Pai W3.I');
  assert.equal((await catalog(pageB, conflictCopyId)).title, 'Fechamento Pai W3.I');
  await pageB.getByRole('button', { name: 'Voltar aos catálogos', exact: true }).click();
  await waitForLibrary(pageB);
  await pageB.locator(`[data-library-catalog-id="${conflictCopyId}"]`).getByRole('button', { name: 'Arquivar', exact: true }).click();
  await pageB.getByRole('dialog', { name: /Arquivar/ }).getByRole('button', { name: 'Arquivar catálogo', exact: true }).click();
  await pageB.getByRole('tab', { name: 'Arquivados', exact: true }).click();
  await pageB.locator(`[data-library-catalog-id="${conflictCopyId}"]`).waitFor();
  assert.equal((await catalog(pageB, conflictCopyId)).archivedAt === null, false);
  await pageB.getByRole('tab', { name: 'Ativos', exact: true }).click();
  await pageB.locator(`[data-library-catalog-id="${conflictCopyId}"]`).waitFor({ state: 'detached' });
  await pageB.getByRole('tab', { name: 'Arquivados', exact: true }).click();
  await pageB.locator(`[data-library-catalog-id="${conflictCopyId}"]`).waitFor();

  await editAndCommit(stalePage, 'Tentativa obsoleta após arquivamento');
  await stalePage.waitForFunction(() => window.__W3I_PROOF__.state().runtime?.savePhase === 'blocked');
  const staleAfterArchive = await state(stalePage);
  const archivedAfterStaleSave = await catalog(stalePage, conflictCopyId);
  assert.equal(staleAfterArchive.runtime?.dirty, true);
  assert.equal(archivedAfterStaleSave.archivedAt === null, false);
  assert.equal(archivedAfterStaleSave.title, 'Fechamento Pai W3.I');
  assert.notEqual(archivedAfterStaleSave.text, 'Tentativa obsoleta após arquivamento');
  assert.equal(archivedAfterStaleSave.remoteRevision, staleBeforeArchive.runtime.remoteRevision + 2);

  // W3I-10 and mobile sanity: Library actions remain reachable without horizontal overflow.
  await pageB.getByRole('tab', { name: 'Ativos', exact: true }).click();
  for (const width of [320, 360, 390]) {
    await assertNoHorizontalOverflow(pageB, width, ['Novo catálogo']);
    const activeRow = pageB.locator(`[data-library-catalog-id="${sourceCatalogId}"]`);
    for (const action of ['Abrir', 'Duplicar', 'Renomear', 'Arquivar']) {
      assert.equal(await activeRow.getByRole('button', { name: action, exact: true }).isVisible(), true);
    }
    await pageB.getByRole('button', { name: 'Novo catálogo', exact: true }).click();
    assert.equal(await pageB.getByRole('button', { name: /Ficha técnica essencial/ }).isVisible(), true);
    await pageB.getByRole('button', { name: 'Fechar', exact: true }).click();
  }
  await assertNoFatherJargon(pageB, 'Library');

  const saveCountBeforeDispose = staleAfterArchive.saveDispatchCount;
  const disposal = await stalePage.evaluate(() => window.__W3I_PROOF__.dispose());
  await stalePage.waitForTimeout(350);
  assert.equal((await state(stalePage)).saveDispatchCount, saveCountBeforeDispose);
  assert(disposal.disposedRuntimeCount >= 1);

  // Layer 1: real /v2 production bootstrap smoke and canonical W3 wiring source assertions.
  const productionPage = await context.newPage();
  observe(productionPage, 'production-smoke');
  const productionRequests = [];
  productionPage.on('request', (request) => productionRequests.push(request.url()));
  await productionPage.goto(productionUrl, { waitUntil: 'networkidle' });
  await productionPage.locator('[data-catalog-library]').waitFor();
  assert.equal(productionRequests.some((url) => url.includes('/src/vnext/app/bootstrap')), true);
  assert.equal(productionRequests.some((url) => url.includes('/src/legacy-main')), false);
  const bootstrapSource = await readFile(resolve(root, 'src/vnext/app/bootstrap.tsx'), 'utf8');
  for (const seam of [
    'SupabaseCatalogRepository',
    'VNextPersistenceRuntime',
    'IndexedDbRecoveryRepository',
    'DefaultAssetPersistenceBridge',
    'autosave: {}',
    'attachPersistenceOnlineRetry(runtime)',
  ]) {
    assert(bootstrapSource.includes(seam), `Production bootstrap must wire ${seam}`);
  }

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  const finalStateA = await state(pageA);
  const finalStateB = await state(pageB);
  const evidence = {
    chromiumVersion: browser.version(),
    productionBootstrapSmoke: {
      route: '/v2',
      vnextBootstrapLoaded: true,
      legacyBootstrapLoaded: false,
      canonicalRuntimeSeams: [
        'SupabaseCatalogRepository',
        'VNextPersistenceRuntime',
        'IndexedDbRecoveryRepository',
        'DefaultAssetPersistenceBridge',
        'AutosaveCoordinator via autosave opt-in',
      ],
      realSupabaseFatherJourneyClaim: false,
    },
    controlledFatherFlow: {
      W3I01: { sourceCatalogId, sourceOpenSessionId, starterOrigin: starterCatalog.origin },
      W3I02: { activeDraftBefore, activeDraftAfter, saving, autosaved },
      W3I03: { canonicalAssetRef, runtimeAssetState: uploadedRuntimeState, canonicalDocumentJsonLeakFree: true },
      W3I04: { beforeOpenSessionId: sourceOpenSessionId, afterOpenSessionId: reopened.runtime.openSessionId, exactDocument: true },
      W3I05: {
        sourceCatalogId,
        duplicateCatalogId,
        sourceBeforeDuplicate,
        duplicateAtCreate,
        ambiguousCreateDispatches: afterDuplicate.createDispatchCount - createDispatchesBeforeDuplicate,
      },
      W3I06: {
        recoveryBeforeCrash,
        storedRecovery,
        recovered,
        foreignScopeRecords: [],
        protectedInspectionMounted: true,
        recoveredPreviewMounted: true,
        recoveryPreviewMobile,
        recoveryPreviewDesktop,
      },
      W3I07: { openedA, openedB, conflictOpenLatest, openedLatest, protectedConflictRecovery },
      W3I08: { copyConflict, copyOpened, conflictCopy, sourceBeforeCopy, sourceAfterCopy },
      W3I09: { conflictCopyId, renamedReopen, staleBeforeArchive, staleAfterArchive, archivedAfterStaleSave },
      W3I10: {
        finalStateA,
        finalStateB,
        disposedRuntimeCount: disposal.disposedRuntimeCount,
        duplicateSaveMutationIds: finalStateA.saveMutationIds.length !== new Set(finalStateA.saveMutationIds).size
          || finalStateB.saveMutationIds.length !== new Set(finalStateB.saveMutationIds).size,
        duplicateCreateMutationIds: finalStateA.createMutationIds.length !== new Set(finalStateA.createMutationIds).size
          || finalStateB.createMutationIds.length !== new Set(finalStateB.createMutationIds).size,
        fatherLanguageSurfaces: [...fatherLanguageSurfaces].sort(),
      },
    },
    mobileSanity: {
      widths: [320, 360, 390],
      horizontalOverflow: false,
      libraryEditorConflictRecoveryActionsReachable: true,
      recoveryPreviewMountedVisibleAndFitted: true,
    },
    evidenceBoundary: {
      productionLayer: 'Real /v2 bootstrap and canonical production wiring smoke.',
      controlledLayer: 'Real React UI interactions with deterministic shared strict-CAS, IndexedDB recovery, and asset adapter dependencies.',
      realSupabaseEvidence: 'Existing separate W3.B rehearsal only; W3.I does not claim cloud multi-tab execution.',
    },
    consoleErrors,
    pageErrors,
  };
  assert.equal(evidence.controlledFatherFlow.W3I10.duplicateSaveMutationIds, false);
  assert.equal(evidence.controlledFatherFlow.W3I10.duplicateCreateMutationIds, false);
  assert.deepEqual(evidence.controlledFatherFlow.W3I10.fatherLanguageSurfaces, [
    'Conflict',
    'Editor',
    'Library',
    'Recovery',
  ]);
  await writeFile(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const evidenceSummary = {
    chromiumVersion: evidence.chromiumVersion,
    productionBootstrapSmoke: evidence.productionBootstrapSmoke,
    catalogIds: {
      source: sourceCatalogId,
      duplicate: duplicateCatalogId,
      conflictCopy: conflictCopyId,
    },
    openSessionIds: {
      source: sourceOpenSessionId,
      reopened: reopened.runtime.openSessionId,
      recovered: recovered.runtime.openSessionId,
      openLatest: openedLatest.runtime.openSessionId,
      conflictCopy: copyOpened.runtime.openSessionId,
    },
    remoteRevisions: {
      autosaved: autosaved.runtime.remoteRevision,
      reopened: reopened.runtime.remoteRevision,
      conflictCopy: conflictCopy.remoteRevision,
      archived: archivedAfterStaleSave.remoteRevision,
    },
    mutationDispatchCounts: {
      ambiguousCreate: afterDuplicate.createDispatchCount - createDispatchesBeforeDuplicate,
      sessionASaves: finalStateA.saveDispatchCount,
      sessionACreates: finalStateA.createDispatchCount,
      sessionBSaves: finalStateB.saveDispatchCount,
      sessionBCreates: finalStateB.createDispatchCount,
    },
    activeDraft: {
      canonicalText: activeDraftAfter.runtime.text,
      visibleText: 'Texto do Pai salvo automaticamente',
      saveDispatchesWhileActive: activeDraftAfter.saveDispatchCount,
    },
    assetRef: canonicalAssetRef,
    assetRuntimeUrlLeakedIntoDocument: false,
    recovery: {
      choice: 'Ver alterações recuperadas, then Recuperar minhas alterações',
      beforeOpenSessionId: recoveryBeforeCrash.runtime.openSessionId,
      afterOpenSessionId: recovered.runtime.openSessionId,
      recoveredCanonicalText: recovered.runtime.text,
      protectedInspectionMounted: true,
      previewMountedVisibleAndFitted: true,
      mobileWidths: recoveryPreviewMobile.map((entry) => entry.width),
      desktopWidth: recoveryPreviewDesktop.width,
    },
    conflicts: {
      openLatestInstalledAuthoritativeText: openedLatest.runtime.text,
      saveAsCopyCatalogId: conflictCopyId,
      duplicateSaveMutationIds: evidence.controlledFatherFlow.W3I10.duplicateSaveMutationIds,
      duplicateCreateMutationIds: evidence.controlledFatherFlow.W3I10.duplicateCreateMutationIds,
    },
    archive: {
      catalogId: conflictCopyId,
      archivedAt: archivedAfterStaleSave.archivedAt,
      staleSaveDidNotRecreate: true,
    },
    mobileSanity: evidence.mobileSanity,
    evidenceBoundary: evidence.evidenceBoundary,
    consoleErrors,
    pageErrors,
  };
  console.log('W3.I integrated controlled Father browser flow: PASS');
  console.log('W3.I production /v2 bootstrap smoke: PASS');
  console.log(JSON.stringify(evidenceSummary, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
