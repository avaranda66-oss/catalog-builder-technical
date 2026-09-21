import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w4b-table-cell-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W4B_PROOF_PORT ?? 5221);
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
const editorUrl = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w4b-editor-browser.html`;
const publicationUrl = `http://127.0.0.1:${port}/src/labs/presys-editorial-proof/index.html?fixture=W2A`;
let browser;
const state = (page) => page.evaluate(() => window.__W4B_PROOF__.state());
const cell = (snapshot, id) => snapshot.cells.find((entry) => entry.id === id);
const grid = (page) => page.locator('[data-table-grid-overlay]');

async function selectTableAndEnter(page) {
  await page.locator('[data-editor-object-id="w4b-table-object"]').click();
  await page.locator('[data-editor-action="edit-table"]').click();
  await grid(page).waitFor({ timeout: 15000 });
}

async function settleReactFrame(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function selectCell(page, row, column, modifiers = []) {
  const expectedSequence = (await state(page)).localSequence;
  await page.waitForFunction((sequence) =>
    document.querySelector('[data-table-grid-overlay]')?.getAttribute('data-local-sequence') === String(sequence),
  expectedSequence);
  await settleReactFrame(page);
  await page.locator(`[data-table-cell="${row}:${column}"]`).click({ modifiers });
  await settleReactFrame(page);
}

async function startCellByKeyboard(page, row, column, key = 'Enter') {
  await selectCell(page, row, column);
  await grid(page).press(key);
  await page.locator('[data-cell-edit-session]').waitFor();
}

async function startCellByDoubleClick(page, row, column) {
  await page.locator(`[data-table-cell="${row}:${column}"]`).dblclick();
  await page.locator('[data-cell-edit-session]').waitFor();
}

async function cancelCell(page) {
  await page.locator('[data-editor-action="cancel-cell-content"]').click();
  await page.locator('[data-cell-edit-session]').waitFor({ state: 'detached' });
}
async function commitCell(page) {
  await page.locator('[data-editor-action="commit-cell-content"]').click();
  await page.locator('[data-cell-edit-session]').waitFor({ state: 'detached' });
}

async function inspectorFocus(page, selector) {
  await page.locator(selector).waitFor();
  return page.evaluate((value) => document.activeElement?.matches(value) ?? false, selector);
}

async function publishDocument(context, document) {
  const page = await context.newPage();
  await page.goto(publicationUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.proof?.result !== undefined, { timeout: 30000 });
  const report = await page.evaluate(
    (doc) => window.proof.runDocument(doc, 'W4B-CELL-CONTENT-PROPERTIES'),
    document
  );
  return { page, report };
}

async function inspectPdf(path) {
  const bytes = new Uint8Array(await readFile(path));
  const byteLength = bytes.length;
  const pdf = await getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false }).promise;
  assert.equal(pdf.numPages, 1);
  const page = await pdf.getPage(1);
  const text = await page.getTextContent();
  const operators = await page.getOperatorList();
  const textContent = text.items.filter((item) => 'str' in item).map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim();
  const imageOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat]);
  const imagePaintCount = operators.fnArray.filter((op) => imageOps.has(op)).length;
  const result = {
    bytes: byteLength,
    widthMm: (page.view[2] - page.view[0]) * 25.4 / 72,
    heightMm: (page.view[3] - page.view[1]) * 25.4 / 72,
    textContent,
    textItems: text.items.filter((item) => 'str' in item).length,
    imagePaintCount,
    vectorPathCount: operators.fnArray.filter((op) => op === OPS.constructPath).length,
  };
  await pdf.destroy();
  return result;
}

try {
  await server.listen();
  browser = await chromium.launch({
    headless: Boolean(process.env.CI || process.env.W4B_PROOF_HEADLESS),
  });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedResources = [];
  const requestFailures = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), location: message.location() });
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failedResources.push({ status: response.status(), url: response.url() });
  });
  page.on('requestfailed', (request) => {
    requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? null });
  });

  await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-vnext-shell]').waitFor();
  const initial = await state(page);
  assert.equal(initial.catalogId, '66666666-6666-4666-8666-666666666666');
  assert.equal(initial.cells.length, 9);
  await selectTableAndEnter(page);
  assert.equal(await page.locator('[data-editorial-root] [data-table-grid-overlay]').count(), 0);
  assert(await page.locator('[data-editor-diagnostics]').isVisible());

  // RichText: Enter -> Inspector focus -> edit -> one commit -> Undo/Redo.
  await startCellByKeyboard(page, 0, 0, 'Enter');
  assert.equal(await inspectorFocus(page, '[data-cell-rich-text]'), true, 'Cell editor must receive focus');
  const richBefore = await state(page);
  await page.locator('[data-cell-rich-text]').fill('Texto W4.B final');
  assert.deepEqual(cell(await state(page), 'w4b-rich').content, cell(richBefore, 'w4b-rich').content, 'Typing must remain ephemeral');
  await commitCell(page);
  const richCommitted = await state(page);
  assert.equal(richCommitted.localSequence, richBefore.localSequence + 1);
  assert.equal(cell(richCommitted, 'w4b-rich').content.type, 'richText');
  assert.equal(richCommitted.canUndo, true);
  await page.locator('[data-editor-action="undo"]').click();
  assert.deepEqual(cell(await state(page), 'w4b-rich').content, cell(richBefore, 'w4b-rich').content);
  await page.locator('[data-editor-action="redo"]').click();
  assert.deepEqual(cell(await state(page), 'w4b-rich').content, cell(richCommitted, 'w4b-rich').content);

  // Draft Undo boundary: draft closes first and does not mutate canonical/history.
  await startCellByKeyboard(page, 0, 1, 'F2');
  const undoDraftBefore = await state(page);
  await page.locator('[data-cell-technical-code]').fill('TEMP-NOT-CANONICAL');
  await page.locator('[data-editor-action="undo"]').click();
  await page.locator('[data-cell-edit-session]').waitFor({ state: 'detached' });
  const undoDraftAfter = await state(page);
  assert.equal(undoDraftAfter.localSequence, undoDraftBefore.localSequence);
  assert.deepEqual(cell(undoDraftAfter, 'w4b-code').content, cell(undoDraftBefore, 'w4b-code').content);

  await startCellByKeyboard(page, 0, 1, 'F2');
  const keyboardUndoBefore = await state(page);
  await page.locator('[data-cell-technical-code]').fill('KEYBOARD-UNDO-DRAFT');
  await page.locator('[data-cell-technical-code]').press('Control+z');
  await page.locator('[data-cell-edit-session]').waitFor({ state: 'detached' });
  const keyboardUndoAfter = await state(page);
  assert.equal(keyboardUndoAfter.localSequence, keyboardUndoBefore.localSequence);
  assert.deepEqual(cell(keyboardUndoAfter, 'w4b-code').content, cell(keyboardUndoBefore, 'w4b-code').content);

  await startCellByKeyboard(page, 0, 1, 'F2');
  const keyboardRedoBefore = await state(page);
  await page.locator('[data-cell-technical-code]').fill('KEYBOARD-REDO-DRAFT');
  await page.locator('[data-cell-technical-code]').press('Control+y');
  await page.locator('[data-cell-edit-session]').waitFor({ state: 'detached' });
  const keyboardRedoAfter = await state(page);
  assert.equal(keyboardRedoAfter.localSequence, keyboardRedoBefore.localSequence);
  assert.deepEqual(cell(keyboardRedoAfter, 'w4b-code').content, cell(keyboardRedoBefore, 'w4b-code').content);

  // Technical code valid and invalid visible paths.
  await startCellByDoubleClick(page, 0, 1);
  const codeBefore = await state(page);
  await page.locator('[data-cell-technical-code]').fill('');
  await page.locator('[data-editor-action="commit-cell-content"]').click();
  await page.locator('[data-cell-edit-session]').waitFor();
  assert.equal((await state(page)).localSequence, codeBefore.localSequence, 'Invalid code cannot mutate document');
  assert.deepEqual(cell(await state(page), 'w4b-code').content, cell(codeBefore, 'w4b-code').content);
  assert((await page.getByRole('status').last().textContent()).includes('código'));
  await page.locator('[data-cell-technical-code]').fill('12 V');
  await page.locator('[data-cell-technical-code]').press('Enter');
  await page.locator('[data-cell-edit-session]').waitFor({ state: 'detached' });
  assert.deepEqual(cell(await state(page), 'w4b-code').content, { type: 'technicalCode', value: '12 V' });

  // Measurement preserves exact strings and blocks invalid value without mutation.
  await startCellByKeyboard(page, 0, 2);
  const measurementBefore = await state(page);
  await page.locator('[data-cell-measurement-value]').fill('1,2');
  await page.locator('[data-cell-measurement-unit]').fill('mV');
  await page.locator('[data-cell-measurement-qualifier]').selectOption('approx');
  await page.locator('[data-editor-action="commit-cell-content"]').click();
  await page.locator('[data-cell-edit-session]').waitFor();
  assert.equal((await state(page)).localSequence, measurementBefore.localSequence);
  assert.deepEqual(cell(await state(page), 'w4b-measure').content, cell(measurementBefore, 'w4b-measure').content);
  await page.locator('[data-cell-measurement-value]').fill('0.010');
  await page.locator('[data-cell-measurement-unit]').fill('mV');
  await page.locator('[data-cell-measurement-qualifier]').selectOption('approx');
  await commitCell(page);
  assert.deepEqual(cell(await state(page), 'w4b-measure').content, {
    type: 'measurement', valueText: '0.010', unit: 'mV', qualifier: 'approx',
  });
  // Explicit clear and explicit destructive type change: dropdown alone cannot mutate.
  await startCellByKeyboard(page, 1, 2);
  const clearBefore = await state(page);
  await page.locator('[data-editor-action="clear-cell-content"]').click();
  assert(await page.locator('[data-cell-type-confirmation]').isVisible());
  assert.deepEqual(cell(await state(page), 'w4b-plain').content, cell(clearBefore, 'w4b-plain').content);
  await page.getByRole('button', { name: 'Confirmar substituição' }).click();
  await commitCell(page);
  assert.deepEqual(cell(await state(page), 'w4b-plain').content, { type: 'empty' });

  await startCellByKeyboard(page, 0, 1);
  const switchBefore = await state(page);
  await page.locator('[data-cell-content-type]').selectOption('measurement');
  assert(await page.locator('[data-cell-type-confirmation]').isVisible());
  assert.deepEqual(cell(await state(page), 'w4b-code').content, cell(switchBefore, 'w4b-code').content);
  await page.getByRole('button', { name: 'Confirmar substituição' }).click();
  await page.locator('[data-cell-measurement-value]').fill('7.50');
  await page.locator('[data-cell-measurement-unit]').fill('bar');
  await page.locator('[data-cell-measurement-qualifier]').selectOption('');
  await commitCell(page);
  assert.deepEqual(cell(await state(page), 'w4b-code').content, {
    type: 'measurement', valueText: '7.50', unit: 'bar',
  });

  // Single-cell properties and reset/inheritance.
  await selectCell(page, 0, 2);
  const propertyStart = await state(page);
  await page.locator('[data-cell-property="textAlign"]').selectOption('right');
  assert.equal(cell(await state(page), 'w4b-measure').style.textAlign, 'right');
  await page.locator('[data-cell-property="textAlign"]').selectOption('');
  assert.equal(cell(await state(page), 'w4b-measure').style?.textAlign, undefined);
  await page.locator('[data-cell-property="fontWeight"]').selectOption('700');
  await page.locator('[data-cell-property="wrapPolicy"]').selectOption('nowrap');
  const color = page.locator('[data-cell-property="color"]');
  await color.fill('#112233');
  await color.blur();
  const background = page.locator('[data-cell-property="background"]');
  await background.fill('#fff3cd');
  await background.blur();
  const paddingTop = page.locator('[data-cell-padding="top"]');
  await paddingTop.fill('2.5');
  await paddingTop.press('Enter');
  const propertySet = cell(await state(page), 'w4b-measure');
  assert.equal(propertySet.style.fontWeight, 700);
  assert.equal(propertySet.style.color, '#112233');
  assert.equal(propertySet.style.background, '#fff3cd');
  assert.equal(propertySet.style.paddingMm.top, 2.5);
  assert.equal(propertySet.presentation.wrapPolicy, 'nowrap');
  assert.equal((await state(page)).localSequence > propertyStart.localSequence, true);

  // Measurement → Image regression: Inspector Enter must stay local, then the grid selection must win.
  assert.equal(await page.locator('[data-cell-edit-session]').count(), 0);
  const measurementWrapBeforeImage = cell(await state(page), 'w4b-measure').presentation.wrapPolicy;
  await selectCell(page, 1, 1);
  const imageBefore = structuredClone(cell(await state(page), 'w4b-image').presentation.image);
  await page.locator('[data-cell-property="wrapPolicy"]').selectOption('wrap');
  await page.waitForFunction(() =>
    window.__W4B_PROOF__.state().cells.find((entry) => entry.id === 'w4b-image')?.presentation?.wrapPolicy === 'wrap'
  );
  const afterImageSelection = await state(page);
  assert.equal(cell(afterImageSelection, 'w4b-image').presentation.wrapPolicy, 'wrap');
  assert.equal(cell(afterImageSelection, 'w4b-measure').presentation.wrapPolicy, measurementWrapBeforeImage);
  await page.locator('[data-cell-property="wrapPolicy"]').selectOption('');
  await page.waitForFunction(() =>
    window.__W4B_PROOF__.state().cells.find((entry) => entry.id === 'w4b-image')?.presentation?.wrapPolicy === undefined
  );
  const imageAfter = cell(await state(page), 'w4b-image');
  assert.deepEqual(imageAfter.presentation.image, imageBefore);
  assert.equal(imageAfter.presentation.wrapPolicy, undefined);

  // Multi-cell property action is atomic and one history entry.
  await selectCell(page, 0, 0);
  await selectCell(page, 0, 1, ['Shift']);
  const multiBefore = await state(page);
  await page.locator('[data-cell-property="fontWeight"]').selectOption('700');
  const multiAfter = await state(page);
  assert.equal(multiAfter.localSequence, multiBefore.localSequence + 1);
  assert.equal(cell(multiAfter, 'w4b-rich').style.fontWeight, 700);
  assert.equal(cell(multiAfter, 'w4b-code').style.fontWeight, 700);
  await page.locator('[data-editor-action="undo"]').click();
  const multiUndone = await state(page);
  assert.equal(cell(multiUndone, 'w4b-rich').style?.fontWeight, undefined);
  assert.equal(cell(multiUndone, 'w4b-code').style?.fontWeight, undefined);
  await page.locator('[data-editor-action="redo"]').click();
  assert.equal(cell(await state(page), 'w4b-rich').style.fontWeight, 700);

  // Merged display slot resolves to the canonical anchor; covered storage is untouched.
  const coveredBefore = structuredClone(cell(await state(page), 'w4b-covered'));
  await startCellByDoubleClick(page, 2, 1);
  assert.equal(await page.locator('[data-table-cell="2:0"][data-cell-editing="true"]').count(), 1);
  assert.equal(await page.locator('[data-table-cell="2:1"][data-cell-editing="true"]').count(), 1);
  await page.locator('[data-cell-technical-code]').fill('MERGED-EDIT');
  await commitCell(page);
  const mergedAfter = await state(page);
  assert.deepEqual(cell(mergedAfter, 'w4b-merged').content, { type: 'technicalCode', value: 'MERGED-EDIT' });
  assert.deepEqual(cell(mergedAfter, 'w4b-covered'), coveredBefore);

  // Marker and image content remain read-only in Cell Editing.
  await startCellByKeyboard(page, 1, 0);
  assert(await page.locator('[data-cell-readonly-content]').isVisible());
  assert(await page.locator('[data-cell-content-type]').isDisabled());
  assert(await page.locator('[data-editor-action="commit-cell-content"]').isDisabled());
  await cancelCell(page);
  await startCellByKeyboard(page, 1, 1);
  assert(await page.locator('[data-cell-readonly-content]').isVisible());
  assert(await page.locator('[data-cell-content-type]').isDisabled());
  assert(await page.locator('[data-editor-action="commit-cell-content"]').isDisabled());
  await cancelCell(page);

  // Invalid draft blocks context change and remains visible.
  await startCellByKeyboard(page, 2, 0);
  await page.locator('[data-cell-technical-code]').fill('');
  await page.locator('[data-editor-overlay]').click({ position: { x: 4, y: 4 } });
  assert(await page.locator('[data-cell-edit-session]').isVisible());
  await page.locator('[data-cell-technical-code]').fill('MERGED-EDIT');
  await cancelCell(page);

  // Stale draft is preserved and cannot overwrite the changed canonical cell.
  await startCellByKeyboard(page, 2, 0);
  await page.locator('[data-cell-technical-code]').fill('STALE-DRAFT');
  const staleMutation = await page.evaluate(() =>
    window.__W4B_PROOF__.mutateContent('w4b-merged', { type: 'technicalCode', value: 'EXTERNAL-MERGED' })
  );
  assert.equal(staleMutation, true);
  await page.locator('[data-editor-action="commit-cell-content"]').click();
  assert(await page.locator('[data-cell-edit-session]').isVisible());
  assert.equal(await page.locator('[data-cell-technical-code]').inputValue(), 'STALE-DRAFT');
  assert.deepEqual(cell(await state(page), 'w4b-merged').content, { type: 'technicalCode', value: 'EXTERNAL-MERGED' });
  await cancelCell(page);
  await page.locator('[data-editor-action="undo"]').click();
  assert.deepEqual(cell(await state(page), 'w4b-merged').content, { type: 'technicalCode', value: 'MERGED-EDIT' });

  // IME blocks Save; then a valid dirty draft crosses AuthoringBarrier and is saved.
  await startCellByKeyboard(page, 2, 0);
  const imeInput = page.locator('[data-cell-technical-code]');
  await imeInput.fill('IME-DRAFT');
  await imeInput.dispatchEvent('compositionstart');
  const saveCallsBeforeIme = (await state(page)).saveCalls;
  await page.locator('[data-editor-action="save"]').click();
  assert.equal((await state(page)).saveCalls, saveCallsBeforeIme);
  assert(await page.locator('[data-cell-edit-session]').isVisible());
  assert.deepEqual(cell(await state(page), 'w4b-merged').content, { type: 'technicalCode', value: 'MERGED-EDIT' });
  await imeInput.dispatchEvent('compositionend');
  await imeInput.fill('MERGED-SAVED-BARRIER');
  const saveCallsBeforeValid = (await state(page)).saveCalls;
  await page.locator('[data-editor-action="save"]').click();
  await page.locator('[data-cell-edit-session]').waitFor({ state: 'detached' });
  await page.waitForFunction((expected) => {
    const value = window.__W4B_PROOF__.state();
    return value.saveCalls > expected && !value.dirty && value.savePhase === 'idle';
  }, saveCallsBeforeValid);
  assert.deepEqual(cell(await state(page), 'w4b-merged').content, {
    type: 'technicalCode', value: 'MERGED-SAVED-BARRIER',
  });

  const savedShape = await state(page);
  assert.equal(savedShape.dirty, false);
  await page.evaluate(() => window.__W4B_PROOF__.reopen(window.__W4B_PROOF__.otherId));
  await page.waitForFunction(() => window.__W4B_PROOF__.state().catalogId === window.__W4B_PROOF__.otherId);
  await page.evaluate(() => window.__W4B_PROOF__.reopen(window.__W4B_PROOF__.primaryId));
  await page.waitForFunction(() => window.__W4B_PROOF__.state().catalogId === window.__W4B_PROOF__.primaryId);
  const reopened = await state(page);
  assert.deepEqual(reopened.cells, savedShape.cells, 'Save/reopen must preserve canonical cells exactly');
  assert.deepEqual(cell(reopened, 'w4b-measure').content, {
    type: 'measurement', valueText: '0.010', unit: 'mV', qualifier: 'approx',
  });
  assert.equal(cell(reopened, 'w4b-measure').style.textAlign, undefined, 'Reset alignment must remain absent');
  assert.equal(cell(reopened, 'w4b-measure').style.fontWeight, 700);
  assert.equal(cell(reopened, 'w4b-measure').presentation.wrapPolicy, 'nowrap');
  assert.deepEqual(cell(reopened, 'w4b-image').presentation.image, imageBefore);

  await page.screenshot({ path: resolve(output, 'desktop-editor.png'), fullPage: true });

  // Mobile functional matrix: not screenshot-only.
  const mobile = [];
  for (const width of [320, 360, 390]) {
    const mobilePage = await context.newPage();
    await mobilePage.setViewportSize({ width, height: 900 });
    await mobilePage.goto(editorUrl, { waitUntil: 'domcontentloaded' });
    await mobilePage.locator('[data-vnext-shell]').waitFor();
    const overflowBefore = await mobilePage.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    assert(overflowBefore.documentWidth <= overflowBefore.viewport, `${width}px document overflow before interaction`);
    assert(overflowBefore.bodyWidth <= overflowBefore.viewport, `${width}px body overflow before interaction`);
    await selectTableAndEnter(mobilePage);
    await startCellByDoubleClick(mobilePage, 0, 2);
    const measurement = mobilePage.locator('[data-cell-measurement]');
    await measurement.scrollIntoViewIfNeeded();
    assert(await measurement.isVisible());
    const valueField = mobilePage.locator('[data-cell-measurement-value]');
    const unitField = mobilePage.locator('[data-cell-measurement-unit]');
    await valueField.fill('0.010');
    await valueField.press('Tab');
    assert.equal(await unitField.evaluate((node) => node === document.activeElement), true, 'Measurement Tab must use normal form navigation');
    await unitField.fill('V');
    assert(await mobilePage.locator('[data-editor-action="commit-cell-content"]').isVisible());
    assert(await mobilePage.locator('[data-editor-action="cancel-cell-content"]').isVisible());
    assert(await mobilePage.locator('[data-cell-property="textAlign"]').isVisible());
    await cancelCell(mobilePage);
    await mobilePage.locator('[data-editor-action="undo"]').scrollIntoViewIfNeeded();
    assert(await mobilePage.locator('[data-editor-action="undo"]').isVisible());
    assert(await mobilePage.locator('[data-editor-action="redo"]').isVisible());
    const overflowAfter = await mobilePage.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    assert(overflowAfter.documentWidth <= overflowAfter.viewport, `${width}px document overflow after interaction`);
    assert(overflowAfter.bodyWidth <= overflowAfter.viewport, `${width}px body overflow after interaction`);
    await mobilePage.screenshot({ path: resolve(output, `mobile-${width}.png`), fullPage: true });
    mobile.push({ width, overflowBefore, overflowAfter, grid: true, cellEditing: true, inspector: true, measurementTab: true });
    await mobilePage.close();
  }

  // Canonical publication + native PDF through the existing renderer.
  const { page: publicationPage, report } = await publishDocument(context, reopened.document);
  assert.equal(report.status, 'READY', JSON.stringify(report.diagnostics));
  assert.deepEqual(report.diagnostics.filter((entry) => entry.severity === 'ERROR'), []);
  const publicationFacts = await publicationPage.evaluate(() => ({
    editorChrome: document.querySelectorAll(
      '[data-editorial-root] [data-editor-action], [data-editorial-root] [data-editor-overlay], ' +
      '[data-editorial-root] [data-table-grid-overlay], [data-editorial-root] [data-table-cell-inspector], ' +
      '[data-editorial-root] input, [data-editorial-root] textarea'
    ).length,
    text: document.querySelector('[data-editorial-root]')?.textContent ?? '',
  }));
  assert.equal(publicationFacts.editorChrome, 0);
  assert(publicationFacts.text.includes('Texto W4.B final'));
  assert(publicationFacts.text.includes('0.010'));
  assert(publicationFacts.text.includes('mV'));
  assert(publicationFacts.text.includes('MERGED-SAVED-BARRIER'));

  const beforePdf = await publicationPage.evaluate(() => window.proof.beforeExport());
  const pdfPath = resolve(output, 'w4b-cell-content-properties.pdf');
  await publicationPage.emulateMedia({ media: 'print' });
  await publicationPage.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  const afterPdf = await publicationPage.evaluate(() => window.proof.afterExport());
  assert.equal(beforePdf.documentHash, afterPdf.documentHash);
  assert.equal(beforePdf.framesHash, afterPdf.framesHash);
  assert.equal(afterPdf.layoutStable, true);
  const pdf = await inspectPdf(pdfPath);
  assert(Math.abs(pdf.widthMm - 210) < 0.2 && Math.abs(pdf.heightMm - 297) < 0.2);
  assert(pdf.textContent.includes('Texto W4.B final'));
  assert(pdf.textContent.includes('0.010'));
  assert(pdf.textContent.includes('mV'));
  assert(pdf.textContent.includes('MERGED-SAVED-BARRIER'));
  assert(pdf.textItems > 0);
  assert(pdf.imagePaintCount >= 1, 'Image cell must remain a real raster image in PDF');
  assert(pdf.vectorPathCount > 0, 'Table paint must remain vector path content');

  assert.deepEqual(consoleErrors, [], JSON.stringify({ failedResources, requestFailures }));
  assert.deepEqual(pageErrors, []);
  const evidence = {
    status: 'PASS',
    chromiumVersion: browser.version(),
    visibleLocalRun: !process.env.CI && !process.env.W4B_PROOF_HEADLESS,
    controlledPersistence: true,
    productionSupabaseE2E: false,
    initial,
    richCommitted,
    savedShape,
    reopened,
    mobile,
    publication: { status: report.status, diagnostics: report.diagnostics, publicationFacts },
    pdf,
    consoleErrors,
    pageErrors,
    failedResources,
    requestFailures,
    lockProtection: 'Covered by focused W4.B application tests; controlled browser fixture is intentionally unlocked.',
    coveredDirectAuthoring: 'Visible covered slot resolves to canonical merged anchor; direct covered-cell action rejection is covered by application tests.',
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('W4.B Chromium Cell Content + Properties proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await publicationPage.close();
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
