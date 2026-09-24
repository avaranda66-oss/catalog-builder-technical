import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w4e-table-fit-height-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W4E_PROOF_PORT ?? 5242);
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
const editorUrl = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w4e-editor-browser.html`;
const publicationUrl = `http://127.0.0.1:${port}/src/labs/presys-editorial-proof/index.html?fixture=W2A`;
let browser;

const state = (page) => page.evaluate(() => window.__W4E_PROOF__.state());
const grid = (page) => page.locator('[data-table-grid-overlay]');
const mmToU = (mm) => Math.round(mm * 10_000);

async function settle(page, frames = 3) {
  await page.evaluate(async (count) => {
    for (let index = 0; index < count; index += 1) {
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    }
  }, frames);
}
async function selectObject(page, objectId) {
  if (await grid(page).count()) {
    await page.locator('[data-editor-action="leave-table-grid"]').click();
    await grid(page).waitFor({ state: 'detached' });
  }
  await page.locator(`[data-editor-object-id="${objectId}"]`).click();
  await page.locator('[data-table-fit-height]').waitFor({ timeout: 15000 });
}
async function waitFitReady(page) {
  try {
    await page.waitForFunction(() => {
      const section = document.querySelector('[data-table-fit-height]');
      const button = document.querySelector('[data-editor-action="fit-table-height"]');
      return section instanceof HTMLElement
        && Boolean(section.dataset.fitHeightPreparedU)
        && Boolean(section.dataset.fitHeightMeasuredQ)
        && button instanceof HTMLButtonElement
        && !button.disabled;
    }, undefined, { timeout: 30000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      reason: document.querySelector('[data-fit-height-disabled-reason]')?.textContent ?? null,
      diagnostics: Array.from(document.querySelectorAll('[data-diagnostic-code]')).map((node) => ({
        code: node.getAttribute('data-diagnostic-code'),
        text: node.textContent,
      })),
      status: document.querySelector('[role="status"]')?.textContent ?? null,
    }));
    throw new Error(`Fit Height did not become ready: ${JSON.stringify(debug)}`, { cause: error });
  }
}
async function enterTable(page, objectId) {
  await selectObject(page, objectId);
  await page.locator('[data-editor-action="edit-table"]').click();
  await grid(page).waitFor({ timeout: 15000 });
}
async function selectCell(page, row, column) {
  await page.locator(`[data-table-cell="${row}:${column}"]`).click();
  await settle(page);
}async function publish(context, document, fixtureName) {
  const page = await context.newPage();
  watch(page);
  await page.goto(publicationUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.proof?.result !== undefined, { timeout: 30000 });
  const report = await page.evaluate(
    ({ doc, fixture }) => window.proof.runDocument(doc, fixture),
    { doc: document, fixture: fixtureName }
  );
  return { page, report };
}
async function pdfFacts(path) {
  const bytes = new Uint8Array(await readFile(path));
  const byteLength = bytes.length;
  const pdf = await getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false }).promise;
  assert.equal(pdf.numPages, 1);
  const page = await pdf.getPage(1);
  const text = await page.getTextContent();
  const ops = await page.getOperatorList();
  const result = {
    bytes: byteLength,
    widthMm: (page.view[2] - page.view[0]) * 25.4 / 72,
    heightMm: (page.view[3] - page.view[1]) * 25.4 / 72,
    text: text.items.filter((item) => 'str' in item).map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim(),
    vectorPathCount: ops.fnArray.filter((op) => op === OPS.constructPath).length,
  };
  await pdf.destroy();
  return result;
}

const consoleErrors = [];
const pageErrors = [];
const failedResources = [];
const requestFailures = [];
function watch(page) {
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
}

try {
  await server.listen();
  browser = await chromium.launch({ headless: Boolean(process.env.CI || process.env.W4E_PROOF_HEADLESS) });
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1100 },
    deviceScaleFactor: 1,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  watch(page);
  await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-vnext-shell]').waitFor();
  const initial = await state(page);
  const primaryId = await page.evaluate(() => window.__W4E_PROOF__.primaryId);
  const diagnosticId = await page.evaluate(() => window.__W4E_PROOF__.diagnosticId);
  const pageBoundId = await page.evaluate(() => window.__W4E_PROOF__.pageBoundId);
  const fitObjectId = await page.evaluate(() => window.__W4E_PROOF__.fitObjectId);
  const internalObjectId = await page.evaluate(() => window.__W4E_PROOF__.internalObjectId);
  const pageBoundObjectId = await page.evaluate(() => window.__W4E_PROOF__.pageBoundObjectId);
  assert.equal(initial.catalogId, primaryId);
  assert(initial.fit);

  // Initial measurement is read-only and exposes canonical outer-height overflow.
  const beforeMeasurement = await state(page);
  await selectObject(page, fitObjectId);
  await page.locator('[data-diagnostic-code="TABLE_CONTENT_OVERFLOW"]').waitFor({ timeout: 30000 });
  await waitFitReady(page);
  const afterMeasurement = await state(page);
  assert.deepEqual(afterMeasurement.document, beforeMeasurement.document);
  assert.equal(afterMeasurement.localSequence, beforeMeasurement.localSequence);
  assert.equal(afterMeasurement.dirty, beforeMeasurement.dirty);
  const fitSection = page.locator('[data-table-fit-height]');
  const firstPreparedU = Number(await fitSection.getAttribute('data-fit-height-prepared-u'));
  const firstMeasuredQ = Number(await fitSection.getAttribute('data-fit-height-measured-q'));
  assert(firstPreparedU > 0 && firstMeasuredQ > 0);

  // W4.B active Cell Editing explicitly disables Fit Height.
  await enterTable(page, fitObjectId);
  await selectCell(page, 0, 0);
  await page.locator('[data-editor-action="edit-cell-content"]').click();
  const fitButton = page.locator('[data-editor-action="fit-table-height"]');
  assert.equal(await fitButton.isDisabled(), true);
  assert((await page.locator('[data-fit-height-disabled-reason]').innerText())
    .includes('Conclua ou cancele a edição da célula para ajustar a altura'));
  await page.locator('[data-editor-action="cancel-cell-content"]').click();
  await page.locator('[data-editor-action="leave-table-grid"]').click();
  await waitFitReady(page);

  // Actual explicit Fit: height only, one history transition, canonical diagnostic clears.
  const beforeFit = await state(page);
  const beforeFitTable = structuredClone(beforeFit.fit.table);
  const beforeFitFrame = structuredClone(beforeFit.fit.frame);
  await fitButton.click();
  await page.waitForFunction((sequence) => window.__W4E_PROOF__.state().localSequence === sequence + 1, beforeFit.localSequence);
  await page.locator('[data-diagnostic-code="TABLE_CONTENT_OVERFLOW"]').waitFor({ state: 'detached', timeout: 30000 });
  await waitFitReady(page);
  const fitted = await state(page);
  assert.equal(mmToU(fitted.fit.frame.heightMm), firstPreparedU);
  assert.equal(fitted.fit.frame.xMm, beforeFitFrame.xMm);
  assert.equal(fitted.fit.frame.yMm, beforeFitFrame.yMm);
  assert.equal(fitted.fit.frame.widthMm, beforeFitFrame.widthMm);
  assert.deepEqual(fitted.fit.table, beforeFitTable);
  assert.equal(fitted.localSequence, beforeFit.localSequence + 1);

  // Undo/Redo exactness and repeated semantic no-op.
  await page.locator('[data-editor-action="undo"]').click();
  await page.locator('[data-diagnostic-code="TABLE_CONTENT_OVERFLOW"]').waitFor({ timeout: 30000 });
  const undone = await state(page);
  assert.deepEqual(undone.fit.frame, beforeFitFrame);
  await page.locator('[data-editor-action="redo"]').click();
  await page.locator('[data-diagnostic-code="TABLE_CONTENT_OVERFLOW"]').waitFor({ state: 'detached', timeout: 30000 });
  await waitFitReady(page);
  const redone = await state(page);
  assert.deepEqual(redone.fit.frame, fitted.fit.frame);
  const sequenceBeforeNoop = redone.localSequence;
  await fitButton.click();
  await settle(page);
  assert.equal((await state(page)).localSequence, sequenceBeforeNoop);
  // W4.D external TSV paste grows content, but never auto-grows the authored frame.
  await enterTable(page, fitObjectId);
  await selectCell(page, 0, 0);
  const beforePaste = await state(page);
  const fittedHeightBeforePaste = beforePaste.fit.frame.heightMm;
  await page.locator('[data-editor-action="paste-table-cells"]').click();
  const pasteText = '"Linha 1\nLinha 2\nLinha 3\nLinha 4\nLinha 5\nLinha 6\nLinha 7\nLinha 8"';
  await page.locator('[data-table-paste-textarea]').fill(pasteText);
  await page.locator('[data-editor-action="apply-native-table-paste"]').click();
  await page.waitForFunction((sequence) => window.__W4E_PROOF__.state().localSequence === sequence + 1, beforePaste.localSequence);
  assert.equal((await state(page)).fit.frame.heightMm, fittedHeightBeforePaste);
  await page.locator('[data-diagnostic-code="TABLE_CONTENT_OVERFLOW"]').waitFor({ timeout: 30000 });
  await page.locator('[data-editor-action="leave-table-grid"]').click();
  await waitFitReady(page);
  const beforeSecondFit = await state(page);
  await fitButton.click();
  await page.waitForFunction((sequence) => window.__W4E_PROOF__.state().localSequence === sequence + 1, beforeSecondFit.localSequence);
  await page.locator('[data-diagnostic-code="TABLE_CONTENT_OVERFLOW"]').waitFor({ state: 'detached', timeout: 30000 });
  await waitFitReady(page);
  const afterSecondFit = await state(page);
  assert(afterSecondFit.fit.frame.heightMm > fittedHeightBeforePaste);

  // Stale prepared Fit cannot overwrite a newer manual frame change.
  const staleQ = Number(await fitSection.getAttribute('data-fit-height-measured-q'));
  const staleU = Number(await fitSection.getAttribute('data-fit-height-prepared-u'));
  const staleBase = await state(page);
  const staleAction = {
    type: 'table.fitHeight',
    pageId: staleBase.document.pages[0].id,
    objectId: fitObjectId,
    tableId: staleBase.fit.table.id,
    expectedFrame: {
      xU: mmToU(staleBase.fit.frame.xMm),
      yU: mmToU(staleBase.fit.frame.yMm),
      widthU: mmToU(staleBase.fit.frame.widthMm),
      heightU: mmToU(staleBase.fit.frame.heightMm),
    },
    expectedTable: staleBase.fit.table,
    expectedTypography: {
      fonts: staleBase.document.style.fonts,
      defaultText: staleBase.document.style.defaultText,
    },
    measuredIntrinsicHeightQ: staleQ,
    preparedHeightU: staleU,
  };
  const manualHeight = staleBase.fit.frame.heightMm + 1;
  const heightInput = page.locator('[data-inspector-field="height"]');
  await heightInput.fill(String(manualHeight));
  await heightInput.press('Enter');
  await page.waitForFunction((sequence) => window.__W4E_PROOF__.state().localSequence === sequence + 1, staleBase.localSequence);
  const afterManual = await state(page);
  const staleResult = await page.evaluate((action) => window.__W4E_PROOF__.execute(action), staleAction);
  assert.equal(staleResult.ok, false);
  assert.equal(staleResult.error.code, 'TARGET_STALE');
  const afterStale = await state(page);
  assert.deepEqual(afterStale.fit.frame, afterManual.fit.frame);
  assert.equal(afterStale.localSequence, afterManual.localSequence);
  await page.locator('[data-editor-action="undo"]').click();
  await waitFitReady(page);
  // Save primary fitted state before switching catalogs.
  const primaryBeforeSave = await state(page);
  const persistedHeight = primaryBeforeSave.fit.frame.heightMm;
  const saveButton = page.locator('[data-editor-action="save"]');
  await saveButton.click();
  await page.waitForFunction(() => !window.__W4E_PROOF__.state().dirty, { timeout: 30000 });

  // Diagnostic-only catalog runs in a fresh real EditorWorkspace to avoid coupling proof timing to a reopen remount.
  const diagnosticPage = await context.newPage();
  watch(diagnosticPage);
  await diagnosticPage.goto(editorUrl + '?catalog=diagnostic', { waitUntil: 'domcontentloaded' });
  await diagnosticPage.locator('[data-vnext-shell]').waitFor();
  assert.equal((await state(diagnosticPage)).catalogId, diagnosticId);

  // FIXED row and horizontal Cell errors are never misrepresented as Fit fixes.
  await selectObject(diagnosticPage, internalObjectId);
  const rowError = diagnosticPage.locator('[data-diagnostic-code="ROW_CONTENT_OVERFLOW"]').first();
  await rowError.waitFor({ timeout: 30000 });
  assert((await rowError.innerText()).includes('Linha fixa não comporta o conteúdo'));
  assert.equal(await rowError.locator('[data-diagnostic-action="fit-height"]').count(), 0);
  const cellError = diagnosticPage.locator('[data-diagnostic-code="CELL_CONTENT_OVERFLOW"]').first();
  await cellError.waitFor({ timeout: 30000 });
  assert((await cellError.innerText()).includes('Conteúdo excede a largura da célula'));
  assert.equal(await cellError.locator('[data-diagnostic-action="fit-height"]').count(), 0);
  await rowError.locator('[data-diagnostic-action="locate"]').click();
  await grid(diagnosticPage).waitFor({ timeout: 15000 });
  assert.equal(await grid(diagnosticPage).getAttribute('data-table-id'), (await state(diagnosticPage)).internal.table.id);

  await diagnosticPage.close();

  // Page-bound Fit gets its own stable document: no clamp/reposition/page creation, then publication is blocked truthfully.
  const pageBoundPage = await context.newPage();
  watch(pageBoundPage);
  await pageBoundPage.goto(editorUrl + '?catalog=pagebound', { waitUntil: 'domcontentloaded' });
  await pageBoundPage.locator('[data-vnext-shell]').waitFor();
  assert.equal((await state(pageBoundPage)).catalogId, pageBoundId);
  await selectObject(pageBoundPage, pageBoundObjectId);
  await pageBoundPage.locator('[data-diagnostic-code="TABLE_CONTENT_OVERFLOW"]').waitFor({ timeout: 30000 });
  await waitFitReady(pageBoundPage);
  const pageBoundBefore = await state(pageBoundPage);
  const pageCountBefore = pageBoundBefore.document.pages.length;
  const yBefore = pageBoundBefore.pageBound.frame.yMm;
  await pageBoundPage.locator('[data-editor-action="fit-table-height"]').click();
  await pageBoundPage.waitForFunction((sequence) => window.__W4E_PROOF__.state().localSequence === sequence + 1, pageBoundBefore.localSequence);
  await pageBoundPage.locator('[data-diagnostic-code="OBJECT_OUTSIDE_PAGE"]').waitFor({ timeout: 30000 });
  const pageBoundAfter = await state(pageBoundPage);
  assert.equal(pageBoundAfter.pageBound.frame.yMm, yBefore);
  assert.equal(pageBoundAfter.document.pages.length, pageCountBefore);
  assert(await pageBoundPage.locator('[data-diagnostic-code="SAFE_AREA_VIOLATION"]').count() > 0);
  const { page: blockedPublication, report: blockedReport } = await publish(context, pageBoundAfter.document, 'W4E-PAGE-BOUND');
  assert.equal(blockedReport.status, 'BLOCKED');
  assert(blockedReport.diagnostics.some((entry) => entry.code === 'OBJECT_OUTSIDE_PAGE' && entry.severity === 'ERROR'));
  await blockedPublication.close();
  await pageBoundPage.close();

  // Reopen saved primary across an intermediate catalog: exact authored fitted height survives; history resets.
  const switched = await page.evaluate((id) => window.__W4E_PROOF__.reopen(id), diagnosticId);
  assert.equal(switched.ok, true, JSON.stringify(switched));
  await page.waitForFunction((id) => window.__W4E_PROOF__.state().catalogId === id, diagnosticId);
  const reopenedPrimary = await page.evaluate((id) => window.__W4E_PROOF__.reopen(id), primaryId);
  assert.equal(reopenedPrimary.ok, true, JSON.stringify(reopenedPrimary));
  await page.waitForFunction((id) => window.__W4E_PROOF__.state().catalogId === id, primaryId);
  const reopened = await state(page);
  assert.equal(reopened.fit.frame.heightMm, persistedHeight);
  assert.equal(reopened.canUndo, false);
  // Canonical publication + native PDF from the valid fitted primary state.
  const { page: publicationPage, report } = await publish(context, reopened.document, 'W4E-FIT-HEIGHT');
  assert.equal(report.status, 'READY', JSON.stringify(report.diagnostics));
  assert.deepEqual(report.diagnostics.filter((entry) => entry.severity === 'ERROR'), []);
  const publicationFacts = await publicationPage.evaluate(() => ({
    editorChrome: document.querySelectorAll(
      '[data-editorial-root] [data-editor-action], [data-editorial-root] [data-editor-overlay], [data-editorial-root] [data-table-fit-height]'
    ).length,
    text: document.querySelector('[data-editorial-root]')?.textContent ?? '',
  }));
  assert.equal(publicationFacts.editorChrome, 0);
  assert(publicationFacts.text.includes('Linha 1'));
  const beforePdf = await publicationPage.evaluate(() => window.proof.beforeExport());
  const pdfPath = resolve(output, 'w4e-fit-height.pdf');
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
  assert.equal(afterPdf.layoutStable, true);
  const pdf = await pdfFacts(pdfPath);
  assert(pdf.bytes > 0);
  assert(Math.abs(pdf.widthMm - 210) < 0.2 && Math.abs(pdf.heightMm - 297) < 0.2);
  assert(pdf.text.includes('Linha 1'));
  assert(pdf.vectorPathCount > 0);

  // Touch/mobile reachability at 320 / 360 / 390 without hover, Shift, or hardware keyboard.
  const mobile = [];
  for (const width of [320, 360, 390]) {
    const mobileContext = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    const mp = await mobileContext.newPage();
    watch(mp);
    await mp.goto(editorUrl, { waitUntil: 'domcontentloaded' });
    await mp.locator('[data-vnext-shell]').waitFor();
    await mp.locator(`[data-editor-object-id="${fitObjectId}"]`).tap();
    await mp.locator('[data-diagnostic-code="TABLE_CONTENT_OVERFLOW"]').waitFor({ timeout: 30000 });
    await waitFitReady(mp);
    const mBefore = await state(mp);
    const mFit = mp.locator('[data-editor-action="fit-table-height"]');
    await mFit.scrollIntoViewIfNeeded();
    await mFit.tap();
    await mp.waitForFunction((sequence) => window.__W4E_PROOF__.state().localSequence === sequence + 1, mBefore.localSequence);
    await mp.locator('[data-diagnostic-code="TABLE_CONTENT_OVERFLOW"]').waitFor({ state: 'detached', timeout: 30000 });
    const toggle = mp.locator('[data-editor-action="toggle-diagnostics"]');
    await toggle.scrollIntoViewIfNeeded();
    await toggle.tap();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.tap();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    const undo = mp.locator('[data-editor-action="undo"]');
    const redo = mp.locator('[data-editor-action="redo"]');
    await undo.scrollIntoViewIfNeeded();
    await undo.tap();
    await redo.scrollIntoViewIfNeeded();
    await redo.tap();
    const save = mp.locator('[data-editor-action="save"]');
    await save.scrollIntoViewIfNeeded();
    await save.tap();
    await mp.waitForFunction(() => !window.__W4E_PROOF__.state().dirty);
    const overflow = await mp.evaluate(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    assert(overflow.documentWidth <= overflow.viewport);
    assert(overflow.bodyWidth <= overflow.viewport);
    mobile.push({ width, ...overflow, fit: true, diagnosticsToggle: true, undo: true, redo: true, save: true });
    await mobileContext.close();
  }
  assert.deepEqual(consoleErrors, [], JSON.stringify({ consoleErrors, pageErrors, failedResources, requestFailures }));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedResources, []);
  assert.deepEqual(requestFailures, []);

  const evidence = {
    status: 'PASS',
    chromiumVersion: browser.version(),
    controlledPersistence: true,
    productionSupabaseE2E: false,
    measurement: {
      zeroMutation: true,
      stableTwoSnapshotGate: true,
      measuredIntrinsicHeightQ: firstMeasuredQ,
      preparedHeightU: firstPreparedU,
    },
    fit: {
      explicitOnly: true,
      heightOnly: true,
      oneHistoryTransition: true,
      growAndRepeatNoop: true,
      exactPreparedU: true,
    },
    draftBoundary: { disabledWhileCellEditing: true },
    w4dIntegration: { pasteDoesNotAutoFit: true, overflowReturns: true, explicitRefit: true },
    staleCas: { manualFrameChangeRejected: true, code: 'TARGET_STALE' },
    internalOverflow: { fixedRowNoFakeFit: true, horizontalCellNoFakeFit: true, locate: true },
    pageBounds: { actionSucceeds: true, noClamp: true, noMove: true, noPageCreation: true, publicationBlocked: true },
    safeArea: { warning: true },
    persistence: { saveReopenExactHeight: true, reopenedHistoryReset: true },
    mobile,
    publication: { status: report.status, diagnostics: report.diagnostics, ...publicationFacts },
    pdf,
    consoleErrors,
    pageErrors,
    failedResources,
    requestFailures,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('W4.E Fit Height + Layout Diagnostics Chromium proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await publicationPage.close();
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
