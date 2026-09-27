import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w4f5-object-arrangement-locking-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W4F5_PROOF_PORT ?? 5247);
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
const editorUrl = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w4f5-editor-browser.html`;
const imageFile = {
  name: 'w4f5-proof-image.png',
  mimeType: 'image/png',
  buffer: await readFile(resolve(root, 'public/assets/vnext/w2c-replacement.png')),
};
const errors = { consoleErrors: [], pageErrors: [], failedResources: [], requestFailures: [] };
const state = (page) => page.evaluate(() => window.__W4F5_PROOF__.state());

function watch(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.consoleErrors.push({ text: message.text(), location: message.location() });
  });
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.failedResources.push({ status: response.status(), url: response.url() });
  });
  page.on('requestfailed', (request) => {
    errors.requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? null });
  });
}

async function settle(page, frames = 3) {
  await page.evaluate(async (count) => {
    for (let index = 0; index < count; index += 1) {
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    }
  }, frames);
}

async function waitSequence(page, before, delta = 1) {
  await page.waitForFunction(
    ({ sequence, increase }) => window.__W4F5_PROOF__.state().localSequence >= sequence + increase,
    { sequence: before, increase: delta },
    { timeout: 10000 }
  );
  await settle(page);
}

function objectById(snapshot, objectId) {
  const object = snapshot.document.pages.flatMap((page) => page.objects).find((entry) => entry.id === objectId);
  assert(object, `Object ${objectId} missing`);
  return object;
}

function toU(mm) {
  const u = Math.round(mm * 10000);
  assert(Number.isSafeInteger(u));
  return u;
}

function roundRatio(numerator, denominator) {
  const sign = numerator < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  const base = Math.floor(n / denominator);
  const magnitude = base + ((n % denominator) * 2 >= denominator ? 1 : 0);
  return magnitude === 0 ? 0 : sign * magnitude;
}

function visualIndexMap(snapshot) {
  const page = snapshot.document.pages[0];
  const ordered = page.objects
    .map((object, arrayIndex) => ({ object, arrayIndex }))
    .sort((a, b) => a.object.zIndex - b.object.zIndex || a.arrayIndex - b.arrayIndex);
  return new Map(ordered.map((entry, index) => [entry.object.id, index]));
}

function expectedDistribution(snapshot, ids, axis) {
  const visual = visualIndexMap(snapshot);
  const entries = ids.map((id) => {
    const object = objectById(snapshot, id);
    return {
      id,
      xU: toU(object.frame.xMm),
      yU: toU(object.frame.yMm),
      widthU: toU(object.frame.widthMm),
      heightU: toU(object.frame.heightMm),
      visualIndex: visual.get(id),
    };
  });
  entries.sort((a, b) => {
    const primary = axis === 'horizontal' ? a.xU - b.xU : a.yU - b.yU;
    if (primary !== 0) return primary;
    const secondary = axis === 'horizontal' ? a.yU - b.yU : a.xU - b.xU;
    if (secondary !== 0) return secondary;
    return a.visualIndex - b.visualIndex;
  });
  const first = entries[0];
  const last = entries.at(-1);
  const middle = entries.slice(1, -1);
  const extent = middle.reduce((total, entry) => total + (axis === 'horizontal' ? entry.widthU : entry.heightU), 0);
  const firstEnd = axis === 'horizontal' ? first.xU + first.widthU : first.yU + first.heightU;
  const lastStart = axis === 'horizontal' ? last.xU : last.yU;
  const corridor = lastStart - firstEnd - extent;
  const expected = new Map(entries.map((entry) => [entry.id, {
    xU: entry.xU,
    yU: entry.yU,
  }]));
  let priorExtent = 0;
  for (let index = 1; index < entries.length - 1; index += 1) {
    const entry = entries[index];
    const position = firstEnd + priorExtent + roundRatio(corridor * index, entries.length - 1);
    expected.set(entry.id, axis === 'horizontal'
      ? { xU: position, yU: entry.yU }
      : { xU: entry.xU, yU: position });
    priorExtent += axis === 'horizontal' ? entry.widthU : entry.heightU;
  }
  return expected;
}

function scrubPosition(object) {
  return {
    ...object,
    frame: { ...object.frame, xMm: 0, yMm: 0 },
  };
}

async function addImage(page) {
  const before = await state(page);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-editor-action="add-image"]').click();
  await (await chooser).setFiles(imageFile);
  await page.getByRole('status').filter({ hasText: 'Imagem adicionada.' }).waitFor({ timeout: 30000 });
  await waitSequence(page, before.localSequence);
  const after = await state(page);
  const images = after.document.pages[0].objects.filter((object) => object.type === 'image');
  assert.equal(images.length, 1);
  return images[0].id;
}

async function setMulti(page, armed, tap = false) {
  const toggle = page.locator('[data-editor-action="toggle-multi-select"]');
  const current = await toggle.getAttribute('aria-pressed');
  if ((current === 'true') !== armed) {
    if (tap) await toggle.tap();
    else await toggle.click();
    await settle(page);
  }
  assert.equal(await toggle.getAttribute('aria-pressed'), armed ? 'true' : 'false');
}

async function selectMany(page, ids, tap = false) {
  await setMulti(page, true, tap);
  for (const id of ids) {
    const locator = page.locator(`[data-editor-object-id="${id}"]`);
    if (tap) await locator.tap();
    else await locator.click();
  }
  await settle(page);
  assert.equal(await page.locator('[data-editor-object-id][data-selected="true"]').count(), ids.length);
}

async function selectSingle(page, id, tap = false) {
  await setMulti(page, false, tap);
  const locator = page.locator(`[data-editor-object-id="${id}"]`);
  if (tap) await locator.tap();
  else await locator.click();
  await settle(page);
  assert.equal(await page.locator('[data-editor-object-id][data-selected="true"]').count(), 1);
  assert.equal(await page.locator('[data-editor-object-id][data-selected="true"]').getAttribute('data-editor-object-id'), id);
}

async function clickSemantic(page, action, tap = false) {
  const before = await state(page);
  const locator = page.locator(`[data-editor-action="${action}"]`);
  if (tap) await locator.tap();
  else await locator.click();
  await waitSequence(page, before.localSequence);
  return state(page);
}

async function save(page) {
  await page.locator('[data-editor-action="save"]').click();
  await page.waitForFunction(() => !window.__W4F5_PROOF__.state().dirty, { timeout: 30000 });
  return state(page);
}

async function assertNoGlobalOverflow(page, width) {
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  assert.equal(geometry.viewport, width);
  assert(geometry.documentWidth <= width, JSON.stringify(geometry));
  assert(geometry.bodyWidth <= width, JSON.stringify(geometry));
  return geometry;
}

async function exerciseTableLockLifecycle(page) {
  const tableId = 'proof-table';
  const tableNode = () => page.locator(`[data-editor-object-id="${tableId}"]`);
  const grid = () => page.locator('[data-table-grid-overlay]');
  const tableCellValue = (snapshot) => objectById(snapshot, tableId).table.cells.find((cell) => cell.id === 'proof-cell-0-0')?.content?.value;

  await selectSingle(page, tableId);
  await page.locator('[data-editor-action="edit-table"]').click();
  await grid().waitFor({ timeout: 20000 });
  await page.locator('[data-editor-action="open-table-semantics"]').click();
  await page.locator('[data-marker-legend-panel]').waitFor();
  const gridBeforeLock = await state(page);
  const lockedFromGrid = await clickSemantic(page, 'toggle-object-lock');
  await grid().waitFor({ state: 'detached' });
  assert.equal(objectById(lockedFromGrid, tableId).locked, true);
  assert.equal(lockedFromGrid.localSequence, gridBeforeLock.localSequence + 1);
  assert.equal(await tableNode().getAttribute('data-selected'), 'true');
  assert.equal(await page.locator('[data-table-axis-toolbar]').count(), 0);
  assert.equal(await page.locator('[data-marker-legend-panel]').count(), 0);
  assert.equal(await page.locator('[data-editor-action="open-table-semantics"]').isDisabled(), true);
  assert.equal((await page.locator('[data-editor-action="toggle-object-lock"]').textContent()).trim(), 'Desbloquear objeto');

  const unlockedAfterGrid = await clickSemantic(page, 'toggle-object-lock');
  assert.equal(objectById(unlockedAfterGrid, tableId).locked, undefined);
  assert.equal(await grid().count(), 0);
  assert.equal(await page.locator('[data-editor-action="edit-table"]').isDisabled(), false);

  await page.locator('[data-editor-action="edit-table"]').click();
  await grid().waitFor({ timeout: 20000 });
  await page.locator('[data-table-cell="0:0"]').click();
  await grid().press('F2');
  await page.locator('[data-cell-edit-session]').waitFor();
  const technical = page.locator('[data-cell-technical-code]');
  await technical.fill('DIRTY-MUST-NOT-COMMIT');
  const dirtyBeforeLock = await state(page);
  assert.equal(tableCellValue(dirtyBeforeLock), 'LOCK-ORIGINAL');
  const cellLocked = await clickSemantic(page, 'toggle-object-lock');
  await page.locator('[data-cell-edit-session]').waitFor({ state: 'detached' });
  await grid().waitFor({ state: 'detached' });
  assert.equal(objectById(cellLocked, tableId).locked, true);
  assert.equal(tableCellValue(cellLocked), 'LOCK-ORIGINAL');
  assert.equal(cellLocked.localSequence, dirtyBeforeLock.localSequence + 1);
  assert.equal(await tableNode().getAttribute('data-selected'), 'true');
  assert.equal((await page.locator('[data-editor-action="toggle-object-lock"]').textContent()).trim(), 'Desbloquear objeto');

  await clickSemantic(page, 'toggle-object-lock');
  assert.equal(await grid().count(), 0);
  await page.locator('[data-editor-action="edit-table"]').click();
  await grid().waitFor({ timeout: 20000 });
  const concurrentBefore = await state(page);
  const concurrentResult = await page.evaluate(() => window.__W4F5_PROOF__.execute({
    type: 'object.setLocked',
    objectId: 'proof-table',
    expectedLocked: false,
    locked: true,
  }));
  assert.equal(concurrentResult.ok, true);
  await page.waitForFunction(() => window.__W4F5_PROOF__.state().document.pages[0].objects.find((object) => object.id === 'proof-table')?.locked === true);
  await grid().waitFor({ state: 'detached' });
  const concurrentLocked = await state(page);
  assert.equal(concurrentLocked.localSequence, concurrentBefore.localSequence + 1);
  assert.equal(objectById(concurrentLocked, tableId).locked, true);
  assert.equal(await tableNode().getAttribute('data-selected'), 'true');
  assert.equal(await page.locator('[data-table-axis-toolbar]').count(), 0);
  assert.equal(await page.locator('[data-editor-action="open-table-semantics"]').isDisabled(), true);

  const finalUnlocked = await clickSemantic(page, 'toggle-object-lock');
  assert.equal(objectById(finalUnlocked, tableId).locked, undefined);
  assert.equal(await grid().count(), 0);
  assert.equal(await page.locator('[data-editor-action="edit-table"]').isDisabled(), false);
  return {
    localGridLock: true,
    dirtyCellDraftCancelled: true,
    canonicalCellPreserved: tableCellValue(finalUnlocked) === 'LOCK-ORIGINAL',
    concurrentLock: true,
    selectionPreserved: true,
    unlockExplicit: true,
  };
}

async function exerciseArrangement(page, imageId, tap = false) {
  const ids = ['movable-group', 'arrange-line', imageId];
  const baseline = await state(page);
  const groupChildren = structuredClone(objectById(baseline, 'movable-group').objects);
  const beforeObjects = new Map(ids.map((id) => [id, structuredClone(objectById(baseline, id))]));
  const minXU = Math.min(...ids.map((id) => toU(objectById(baseline, id).frame.xMm)));

  const overlay = page.locator('[data-editor-overlay]');
  if (tap) await overlay.tap({ position: { x: 5, y: 5 } });
  else await overlay.click({ position: { x: 5, y: 5 } });
  await settle(page);
  assert.equal(await page.locator('[data-editor-object-id][data-selected="true"]').count(), 0);

  await selectMany(page, ids, tap);
  const selectedLabel = page.locator('.vnext-info h2');
  await selectedLabel.waitFor();
  assert.equal((await selectedLabel.textContent()).trim(), '3 objetos selecionados');

  let aligned = await clickSemantic(page, 'align-left', tap);
  for (const id of ids) {
    const object = objectById(aligned, id);
    assert.equal(toU(object.frame.xMm), minXU);
    assert.deepEqual(scrubPosition(object), scrubPosition(beforeObjects.get(id)));
  }
  assert.deepEqual(objectById(aligned, 'movable-group').objects, groupChildren);

  const alignedDocument = structuredClone(aligned.document);
  const beforeUndoSequence = aligned.localSequence;
  if (tap) await page.locator('[data-editor-action="undo"]').tap();
  else await page.locator('[data-editor-action="undo"]').click();
  await waitSequence(page, beforeUndoSequence);
  assert.deepEqual((await state(page)).document, baseline.document);

  const beforeRedoSequence = (await state(page)).localSequence;
  if (tap) await page.locator('[data-editor-action="redo"]').tap();
  else await page.locator('[data-editor-action="redo"]').click();
  await waitSequence(page, beforeRedoSequence);
  aligned = await state(page);
  assert.deepEqual(aligned.document, alignedDocument);

  const expected = expectedDistribution(aligned, ids, 'horizontal');
  const distributed = await clickSemantic(page, 'distribute-horizontal', tap);
  for (const id of ids) {
    const object = objectById(distributed, id);
    assert.equal(toU(object.frame.xMm), expected.get(id).xU);
    assert.equal(toU(object.frame.yMm), expected.get(id).yU);
    assert.deepEqual(scrubPosition(object), scrubPosition(objectById(aligned, id)));
  }
  assert.deepEqual(objectById(distributed, 'movable-group').objects, groupChildren);
  return { baseline, aligned, distributed, ids, groupChildren };
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: Boolean(process.env.CI || process.env.W4F5_PROOF_HEADLESS) });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watch(page);
  await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-vnext-shell]').waitFor({ timeout: 30000 });

  const ids = await page.evaluate(() => ({
    primaryId: window.__W4F5_PROOF__.primaryId,
    otherId: window.__W4F5_PROOF__.otherId,
  }));
  const imageId = await addImage(page);
  const arranged = await exerciseArrangement(page, imageId);
  const tableLockLifecycle = await exerciseTableLockLifecycle(page);

  // Own-lock and Group closure-lock stay distinct in the Father-facing UI.
  await selectSingle(page, 'locked-group');
  assert.equal((await page.locator('[data-editor-action="toggle-object-lock"]').textContent()).trim(), 'Bloquear objeto');
  await page.locator('#vnext-object-closure-lock-reason').filter({
    hasText: 'Este grupo contém um objeto interno bloqueado e não pode ser organizado nesta versão.',
  }).waitFor();
  assert(await page.locator('[data-inspector-field="x"]').isDisabled());
  await setMulti(page, true);
  await page.locator('[data-editor-object-id="proof-heading"]').click();
  await page.locator('[data-object-arrangement]').waitFor();
  assert(await page.locator('[data-editor-action="align-left"]').isDisabled());
  await page.locator('[data-object-arrangement]').filter({
    hasText: 'Um dos grupos selecionados contém um objeto interno bloqueado.',
  }).waitFor();

  // Single-object Layer labels still present the existing object.reorder authority professionally.
  const lockTargetId = 'proof-heading';
  await selectSingle(page, lockTargetId);
  assert.equal((await page.locator('[data-editor-action="send-back"]').textContent()).trim(), 'Enviar para o fundo');
  assert.equal((await page.locator('[data-editor-action="send-backward"]').textContent()).trim(), 'Recuar uma camada');
  assert.equal((await page.locator('[data-editor-action="bring-forward"]').textContent()).trim(), 'Avançar uma camada');
  assert.equal((await page.locator('[data-editor-action="bring-front"]').textContent()).trim(), 'Trazer para frente');

  // Lock keeps selection but blocks ordinary authoring; explicit unlock restores it.
  const beforeLock = await state(page);
  let locked = await clickSemantic(page, 'toggle-object-lock');
  assert.equal(objectById(locked, lockTargetId).locked, true);
  assert.equal(await page.locator(`[data-editor-object-id="${lockTargetId}"]`).getAttribute('data-selected'), 'true');
  assert.equal(await page.locator('[data-resize-handle]').count(), 0);
  for (const action of ['duplicate', 'delete', 'send-back', 'send-backward', 'bring-forward', 'bring-front', 'edit-text']) {
    assert(await page.locator(`[data-editor-action="${action}"]`).isDisabled(), `${action} must be disabled while locked`);
  }
  for (const field of ['x', 'y', 'width', 'height']) assert(await page.locator(`[data-inspector-field="${field}"]`).isDisabled());
  assert.equal((await page.locator('[data-editor-action="toggle-object-lock"]').textContent()).trim(), 'Desbloquear objeto');
  assert.equal(locked.localSequence, beforeLock.localSequence + 1);

  const unlocked = await clickSemantic(page, 'toggle-object-lock');
  assert.equal(objectById(unlocked, lockTargetId).locked, undefined);
  assert.equal(await page.locator('[data-resize-handle]').count(), 8);
  assert(!(await page.locator('[data-inspector-field="x"]').isDisabled()));
  assert(!(await page.locator('[data-editor-action="edit-text"]').isDisabled()));

  // Persist a root lock as part of the Save/reopen evidence.
  locked = await clickSemantic(page, 'toggle-object-lock');
  assert.equal(objectById(locked, lockTargetId).locked, true);
  const savedState = await save(page);
  const savedDocument = structuredClone(savedState.saved);
  assert(savedDocument, 'Save did not persist W4.F.5 document');

  await page.getByRole('button', { name: 'Abrir outro catálogo', exact: true }).click();
  await page.waitForFunction((id) => window.__W4F5_PROOF__.state().catalogId === id, ids.otherId);
  await page.getByRole('button', { name: 'Reabrir catálogo original', exact: true }).click();
  await page.waitForFunction((id) => window.__W4F5_PROOF__.state().catalogId === id, ids.primaryId);
  await settle(page, 5);
  const reopened = await state(page);
  assert.deepEqual(reopened.document, savedDocument);
  assert.equal(reopened.canUndo, false);
  assert.equal(objectById(reopened, lockTargetId).locked, true);
  for (const id of arranged.ids) {
    const finalObject = objectById(savedState, id);
    const reopenedObject = objectById(reopened, id);
    assert.deepEqual(reopenedObject.frame, finalObject.frame);
    assert.deepEqual(scrubPosition(reopenedObject), scrubPosition(finalObject));
  }

  // Canonical publication and native A4 PDF. Lock has no publication visual semantics.
  const beforePublicationDocument = JSON.stringify(reopened.document);
  await page.getByRole('button', { name: 'Publicar prova', exact: true }).click();
  await page.locator('[data-publication] [data-editorial-root]').waitFor({ timeout: 30000 });
  const publication = await page.evaluate(() => window.__W4F5_PROOF__.publication());
  assert.deepEqual(publication.diagnostics.filter((diagnostic) => diagnostic.severity === 'ERROR'), []);

  for (const id of ['arrange-line', imageId]) {
    const canonical = objectById(reopened, id);
    const facts = await page.locator(`[data-publication] [data-object-id="${id}"]`).evaluate((node) => ({
      left: parseFloat(node.style.left),
      top: parseFloat(node.style.top),
      width: parseFloat(node.style.width),
      height: parseFloat(node.style.height),
    }));
    const px = (mm) => mm * 96 / 25.4;
    assert(Math.abs(facts.left - px(canonical.frame.xMm)) < 0.03);
    assert(Math.abs(facts.top - px(canonical.frame.yMm)) < 0.03);
    assert(Math.abs(facts.width - px(canonical.frame.widthMm)) < 0.03);
    assert(Math.abs(facts.height - px(canonical.frame.heightMm)) < 0.03);
  }
  assert.equal(await page.locator('[data-publication] [data-editor-action], [data-publication] input').count(), 0);

  const pdfPath = resolve(output, 'w4f5-object-arrangement-locking.pdf');
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  assert.equal(JSON.stringify((await state(page)).document), beforePublicationDocument);
  const pdf = await getDocument({
    data: new Uint8Array(await readFile(pdfPath)),
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  assert.equal(pdf.numPages, 1);
  const pdfPage = await pdf.getPage(1);
  const textContent = await pdfPage.getTextContent();
  const pdfText = textContent.items.filter((item) => 'str' in item).map((item) => item.str).join(' ');
  const ops = await pdfPage.getOperatorList();
  assert(Math.abs((pdfPage.view[2] - pdfPage.view[0]) * 25.4 / 72 - 210) < 0.2);
  assert(Math.abs((pdfPage.view[3] - pdfPage.view[1]) * 25.4 / 72 - 297) < 0.2);
  assert(pdfText.includes('W4.F.5 Object Arrangement + Locking'));
  assert(ops.fnArray.some((op) => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat].includes(op)));
  await pdf.destroy();

  const mobile = [];
  for (const width of [320, 360, 390]) {
    const mobileContext = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const mobilePage = await mobileContext.newPage();
    watch(mobilePage);
    await mobilePage.goto(editorUrl, { waitUntil: 'domcontentloaded' });
    await mobilePage.locator('[data-vnext-shell]').waitFor({ timeout: 30000 });
    const mobileImageId = await addImage(mobilePage);
    const mobileArrangement = await exerciseArrangement(mobilePage, mobileImageId, true);

    const mobileLockTargetId = 'proof-heading';
    await selectSingle(mobilePage, mobileLockTargetId, true);
    const lockBefore = await state(mobilePage);
    const mobileLocked = await clickSemantic(mobilePage, 'toggle-object-lock', true);
    assert.equal(objectById(mobileLocked, mobileLockTargetId).locked, true);
    const mobileUnlocked = await clickSemantic(mobilePage, 'toggle-object-lock', true);
    assert.equal(objectById(mobileUnlocked, mobileLockTargetId).locked, undefined);

    const undoBefore = mobileUnlocked.localSequence;
    await mobilePage.locator('[data-editor-action="undo"]').tap();
    await waitSequence(mobilePage, undoBefore);
    assert.equal(objectById(await state(mobilePage), mobileLockTargetId).locked, true);
    const redoBefore = (await state(mobilePage)).localSequence;
    await mobilePage.locator('[data-editor-action="redo"]').tap();
    await waitSequence(mobilePage, redoBefore);
    assert.equal(objectById(await state(mobilePage), mobileLockTargetId).locked, undefined);

    const overflow = await assertNoGlobalOverflow(mobilePage, width);
    mobile.push({
      width,
      imageId: mobileImageId,
      arrangement: mobileArrangement.ids,
      lockSequenceDelta: mobileUnlocked.localSequence - lockBefore.localSequence,
      undoRedo: true,
      overflow,
    });
    await mobileContext.close();
  }

  assert.deepEqual(errors.consoleErrors, []);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.failedResources, []);
  assert.deepEqual(errors.requestFailures, []);

  const result = {
    status: 'PASS',
    browser: browser.version(),
    visible: !process.env.CI && !process.env.W4F5_PROOF_HEADLESS,
    controlledPersistence: true,
    productionSupabaseE2E: false,
    desktop: {
      imageId,
      alignUndoRedo: true,
      distribution: true,
      groupRootPreserved: true,
      descendantLockBarrier: true,
      ownLock: true,
      tableLockLifecycle,
      layerUx: true,
      saveReopen: true,
      publication: true,
      pdf: true,
    },
    mobile,
    errors,
  };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(result, null, 2));
  console.log('W4.F.5 Object Arrangement + Locking Chromium proof: PASS');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
