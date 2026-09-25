import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w4f1-table-dimensions-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W4F1_PROOF_PORT ?? 5243);
const server = await createServer({ root, server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } }, logLevel: 'error' });
const editorUrl = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w4f1-editor-browser.html`;
const publicationUrl = `http://127.0.0.1:${port}/src/labs/presys-editorial-proof/index.html?fixture=W2A`;
const state = (page) => page.evaluate(() => window.__W4F1_PROOF__.state());
const errors = { consoleErrors: [], pageErrors: [], failedResources: [], requestFailures: [] };
function watch(page) {
  page.on('console', (m) => { if (m.type() === 'error') errors.consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => errors.pageErrors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400) errors.failedResources.push({ status: r.status(), url: r.url() }); });
  page.on('requestfailed', (r) => errors.requestFailures.push({ url: r.url(), error: r.failure()?.errorText ?? null }));
}
async function settle(page, count = 3) { await page.evaluate(async (n) => { for (let i = 0; i < n; i += 1) await new Promise((r) => requestAnimationFrame(r)); }, count); }
async function enterTable(page, objectId) {
  if (await page.locator('[data-table-grid-overlay]').count()) await page.locator('[data-editor-action="leave-table-grid"]').click();
  await page.locator(`[data-editor-object-id="${objectId}"]`).click();
  await page.locator('[data-editor-action="edit-table"]').click();
  await page.locator('[data-table-grid-overlay]').waitFor({ timeout: 20000 });
  await settle(page);
}
async function selectRow(page, index) { await page.locator(`[data-table-row-selector="${index}"]`).click(); await page.locator('[data-table-row-dimensions]').waitFor(); }
async function selectColumn(page, index) { await page.locator(`[data-table-column-selector="${index}"]`).click(); await page.locator('[data-table-column-dimensions]').waitFor(); }
async function setInput(page, selector, value) { const input = page.locator(selector); await input.fill(String(value)); await input.blur(); await settle(page); }
async function publish(context, document) {
  const page = await context.newPage(); watch(page); await page.goto(publicationUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.proof?.result !== undefined, { timeout: 30000 });
  const report = await page.evaluate((doc) => window.proof.runDocument(doc, 'W4F1-DIMENSIONS'), document);
  return { page, report };
}

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const POINTER_TOLERANCE_PX = 1.5;
const DIMENSION_TOLERANCE_MM = 0.08;

async function dragBoundaryWithPhysicalEvidence(page, axis, index, deltaPx) {
  const boundary = page.locator(`[data-table-${axis}-boundary="${index}"]`);
  const selector = page.locator(`[data-table-${axis}-selector="${index}"]`);
  const adjacentSelector = axis === 'column'
    ? page.locator(`[data-table-column-selector="${index + 1}"]`)
    : null;
  const pageBox = await page.locator('[data-editorial-root] [data-page-id]').boundingBox();
  const boundaryBox = await boundary.boundingBox();
  const selectorBox = await selector.boundingBox();
  const adjacentBox = adjacentSelector ? await adjacentSelector.boundingBox() : null;
  assert(pageBox && boundaryBox && selectorBox);
  if (axis === 'column') assert(adjacentBox);

  const startX = boundaryBox.x + boundaryBox.width / 2;
  const startY = boundaryBox.y + boundaryBox.height / 2;
  const targetX = axis === 'column' ? startX + deltaPx : startX;
  const targetY = axis === 'row' ? startY + deltaPx : startY;
  const before = await state(page);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 4 });
  const preview = page.locator(`[data-table-dimension-preview="${axis}"]`);
  await preview.waitFor();
  const previewBox = await preview.boundingBox();
  assert(previewBox);
  const previewCoordinate = axis === 'column'
    ? previewBox.x + previewBox.width / 2
    : previewBox.y + previewBox.height / 2;
  const pointerCoordinate = axis === 'column' ? targetX : targetY;
  const previewErrorPx = Math.abs(previewCoordinate - pointerCoordinate);
  assert(previewErrorPx <= POINTER_TOLERANCE_PX, `${axis} preview missed pointer by ${previewErrorPx}px`);
  assert.equal((await state(page)).localSequence, before.localSequence);

  await page.mouse.up();
  await page.waitForFunction((sequence) => window.__W4F1_PROOF__.state().localSequence === sequence + 1, before.localSequence);
  await settle(page, 5);

  const after = await state(page);
  const committedBoundaryBox = await boundary.boundingBox();
  assert(committedBoundaryBox);
  const committedCoordinate = axis === 'column'
    ? committedBoundaryBox.x + committedBoundaryBox.width / 2
    : committedBoundaryBox.y + committedBoundaryBox.height / 2;
  const commitErrorPx = Math.abs(committedCoordinate - pointerCoordinate);
  assert(commitErrorPx <= POINTER_TOLERANCE_PX, `${axis} committed boundary missed pointer by ${commitErrorPx}px`);

  const pageExtentMm = axis === 'column' ? PAGE_WIDTH_MM : PAGE_HEIGHT_MM;
  const renderedPageExtentPx = axis === 'column' ? pageBox.width : pageBox.height;
  const startDimensionPx = axis === 'column' ? selectorBox.width : selectorBox.height;
  const startDimensionMm = startDimensionPx * pageExtentMm / renderedPageExtentPx;
  const expectedDeltaMm = deltaPx * pageExtentMm / renderedPageExtentPx;
  const expectedDimensionMm = startDimensionMm + expectedDeltaMm;

  let committedDimensionMm;
  let combinedBeforeMm;
  let combinedAfterMm;
  if (axis === 'column') {
    const left = after.main.table.columns[index].width;
    const right = after.main.table.columns[index + 1].width;
    assert.equal(left.mode, 'fixed');
    assert.equal(right.mode, 'fixed');
    committedDimensionMm = left.mm;
    combinedBeforeMm = (selectorBox.width + adjacentBox.width) * pageExtentMm / renderedPageExtentPx;
    combinedAfterMm = left.mm + right.mm;
    assert(Math.abs(combinedAfterMm - combinedBeforeMm) <= DIMENSION_TOLERANCE_MM);
  } else {
    const policy = after.main.table.rows[index].heightPolicy;
    assert.equal(policy.mode, 'FIXED_MM');
    committedDimensionMm = policy.heightMm;
  }
  const dimensionErrorMm = Math.abs(committedDimensionMm - expectedDimensionMm);
  assert(
    dimensionErrorMm <= DIMENSION_TOLERANCE_MM,
    `${axis} canonical dimension differed from viewport-calibrated expectation by ${dimensionErrorMm}mm`
  );

  return {
    axis,
    index,
    pointerDeltaPx: deltaPx,
    renderedPageExtentPx,
    startDimensionMm,
    expectedDeltaMm,
    committedDimensionMm,
    previewErrorPx,
    commitErrorPx,
    dimensionErrorMm,
    combinedBeforeMm,
    combinedAfterMm,
  };
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: Boolean(process.env.CI || process.env.W4F1_PROOF_HEADLESS) });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage(); watch(page);
  await page.goto(editorUrl, { waitUntil: 'domcontentloaded' }); await page.locator('[data-vnext-shell]').waitFor();
  const ids = await page.evaluate(() => ({ primaryId: window.__W4F1_PROOF__.primaryId, otherId: window.__W4F1_PROOF__.otherId, objectId: window.__W4F1_PROOF__.mainObjectId, mergedObjectId: window.__W4F1_PROOF__.mergedObjectId }));
  const initial = await state(page); assert.equal(initial.catalogId, ids.primaryId); assert(initial.main);
  const initialFrame = structuredClone(initial.main.frame);
  const initialCellIds = initial.main.table.cells.map((x) => x.id);
  await enterTable(page, ids.objectId);

  await selectRow(page, 1);
  await page.locator('[data-row-property="role"]').selectOption('section'); await settle(page);
  assert.equal((await state(page)).main.table.rows[1].role, 'section');
  await page.locator('[data-editor-action="undo"]').click(); assert.equal((await state(page)).main.table.rows[1].role, 'body');
  await page.locator('[data-editor-action="redo"]').click(); assert.equal((await state(page)).main.table.rows[1].role, 'section');
  // Use an already-resolved FIXED row so mode switches never depend on provisional AUTO measurement.
  await selectRow(page, 0);
  const rowMode = page.locator('[data-row-property="height-mode"]');
  await rowMode.selectOption('MIN_MM'); await settle(page);
  await setInput(page, '[data-row-property="height-mm"]', 14);
  assert.deepEqual((await state(page)).main.table.rows[0].heightPolicy, { mode: 'MIN_MM', minMm: 14 });
  await rowMode.selectOption('FIXED_MM'); await settle(page);
  await setInput(page, '[data-row-property="height-mm"]', 16);
  assert.deepEqual((await state(page)).main.table.rows[0].heightPolicy, { mode: 'FIXED_MM', heightMm: 16 });
  await page.locator('[data-editor-action="row-height-auto"]').click();
  assert.deepEqual((await state(page)).main.table.rows[0].heightPolicy, { mode: 'AUTO' });

  const rowDragDefault = await dragBoundaryWithPhysicalEvidence(page, 'row', 1, 14);
  assert.equal((await state(page)).main.table.rows[1].heightPolicy.mode, 'FIXED_MM');
  assert.deepEqual((await state(page)).main.frame, initialFrame);
  await page.locator('[data-editor-action="undo"]').click(); await page.locator('[data-editor-action="redo"]').click();

  await selectColumn(page, 1);
  const widthMode = page.locator('[data-column-property="width-mode"]');
  await widthMode.selectOption('fixed'); await setInput(page, '[data-column-property="fixed-mm"]', 32);
  assert.deepEqual((await state(page)).main.table.columns[1].width, { mode: 'fixed', mm: 32 });
  await page.locator('[data-editor-action="toggle-column-dimension-advanced"]').click();
  await setInput(page, '[data-column-property="min-mm"]', 18); await setInput(page, '[data-column-property="max-mm"]', 55);
  let current = await state(page); assert.equal(current.main.table.columns[1].minMm, 18); assert.equal(current.main.table.columns[1].maxMm, 55);
  await widthMode.selectOption('flex'); await setInput(page, '[data-column-property="weight"]', 3);
  assert.deepEqual((await state(page)).main.table.columns[1].width, { mode: 'flex', weight: 3 });

  const columnDragDefault = await dragBoundaryWithPhysicalEvidence(page, 'column', 1, 16);
  current = await state(page); assert.equal(current.main.table.columns[1].width.mode, 'fixed'); assert.equal(current.main.table.columns[2].width.mode, 'fixed');
  assert.deepEqual(current.main.frame, initialFrame);

  await selectColumn(page, 1); await page.locator('[data-editor-action="extend-table-selection"]').click(); await page.locator('[data-table-column-selector="2"]').click();
  const beforeEqualize = await state(page); await page.locator('[data-editor-action="equalize-columns"]').click();
  await page.waitForFunction((s) => window.__W4F1_PROOF__.state().localSequence === s + 1, beforeEqualize.localSequence);
  current = await state(page); assert.equal(current.main.table.columns[1].width.mode, 'fixed'); assert.equal(current.main.table.columns[2].width.mode, 'fixed');
  assert(Math.abs(current.main.table.columns[1].width.mm - current.main.table.columns[2].width.mm) <= 0.0001);

  await selectRow(page, 1); const rowId = (await state(page)).main.table.rows[1].id;
  await page.locator('[data-editor-action="move-row-down"]').click(); assert.equal((await state(page)).main.table.rows[2].id, rowId);
  await page.locator('[data-editor-action="move-row-up"]').click(); assert.equal((await state(page)).main.table.rows[1].id, rowId);
  await selectColumn(page, 1); const columnId = (await state(page)).main.table.columns[1].id;
  await page.locator('[data-editor-action="move-column-right"]').click(); assert.equal((await state(page)).main.table.columns[2].id, columnId);
  await page.locator('[data-editor-action="move-column-left"]').click(); assert.equal((await state(page)).main.table.columns[1].id, columnId);
  assert.deepEqual((await state(page)).main.table.cells.map((x) => x.id).sort(), [...initialCellIds].sort());

  // W4.C merged topology remains authority: unsupported reorder fails closed with zero mutation.
  await enterTable(page, ids.mergedObjectId);
  await selectRow(page, 0);
  const beforeMergedReorder = await state(page);
  await page.locator('[data-editor-action="move-row-down"]').click();
  await settle(page);
  const afterMergedReorder = await state(page);
  assert.equal(afterMergedReorder.localSequence, beforeMergedReorder.localSequence);
  assert.deepEqual(afterMergedReorder.merged, beforeMergedReorder.merged);
  assert((await page.locator('[role="status"]').last().innerText()).includes('mesclada'));
  await enterTable(page, ids.objectId);

  await page.locator('[data-table-cell="1:1"]').click(); await page.locator('[data-editor-action="edit-cell-content"]').click();
  assert.equal(await page.locator('[data-table-row-boundary="1"]').count(), 0);
  await page.locator('[data-editor-action="cancel-cell-content"]').click();

  await selectColumn(page, 1); await widthMode.selectOption('fixed'); await setInput(page, '[data-column-property="fixed-mm"]', 20); await settle(page, 6);
  assert.deepEqual((await state(page)).main.frame, initialFrame);

  const beforeSave = await state(page); await page.locator('[data-editor-action="save"]').click();
  await page.waitForFunction(() => !window.__W4F1_PROOF__.state().dirty, { timeout: 30000 });
  assert.equal((await page.evaluate((id) => window.__W4F1_PROOF__.reopen(id), ids.otherId)).ok, true);
  await page.waitForFunction((id) => window.__W4F1_PROOF__.state().catalogId === id, ids.otherId);
  assert.equal((await page.evaluate((id) => window.__W4F1_PROOF__.reopen(id), ids.primaryId)).ok, true);
  await page.waitForFunction((id) => window.__W4F1_PROOF__.state().catalogId === id, ids.primaryId);
  const reopened = await state(page); assert.deepEqual(reopened.main.table.rows, beforeSave.main.table.rows); assert.deepEqual(reopened.main.table.columns, beforeSave.main.table.columns);
  assert.deepEqual(reopened.main.table.cells.map((x) => x.id), beforeSave.main.table.cells.map((x) => x.id)); assert.equal(reopened.canUndo, false);

  // W4.E remains explicit: the narrowed column may block publication until Father chooses Fit Height.
  const blocked = await publish(context, reopened.document);
  assert.equal(blocked.report.status, 'BLOCKED');
  assert(blocked.report.diagnostics.some((x) => x.code === 'TABLE_CONTENT_OVERFLOW'));
  await blocked.page.close();
  await enterTable(page, ids.objectId);
  await selectRow(page, 1);
  await page.locator('[data-editor-action="row-height-auto"]').click();
  await settle(page, 6);
  await page.locator('[data-editor-action="leave-table-grid"]').click();
  await page.locator('[data-table-grid-overlay]').waitFor({ state: 'detached' });
  await page.locator(`[data-editor-object-id="${ids.objectId}"]`).click();
  await page.locator('[data-table-fit-height]').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-editor-action="fit-table-height"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 30000 });
  await page.locator('[data-editor-action="fit-table-height"]').click();
  await settle(page, 6);
  const publishable = await state(page);
  const { page: publicationPage, report } = await publish(context, publishable.document);
  assert.equal(report.status, 'READY', JSON.stringify(report.diagnostics)); assert.equal(await publicationPage.locator('[data-editorial-root] [data-editor-action]').count(), 0);
  const pdfPath = resolve(output, 'w4f1-table-dimensions.pdf');
  await publicationPage.emulateMedia({ media: 'print' });
  await publicationPage.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  const pdf = await getDocument({ data: new Uint8Array(await readFile(pdfPath)), isEvalSupported: false, useSystemFonts: false }).promise;
  assert.equal(pdf.numPages, 1); const pp = await pdf.getPage(1); const txt = await pp.getTextContent(); const pdfText = txt.items.filter((x) => 'str' in x).map((x) => x.str).join(' ');
  assert(Math.abs((pp.view[2] - pp.view[0]) * 25.4 / 72 - 210) < 0.2); assert(Math.abs((pp.view[3] - pp.view[1]) * 25.4 / 72 - 297) < 0.2); assert(pdfText.includes('Parâmetro'));
  await pdf.destroy(); await publicationPage.close();

  // Prove the same physical calibration at a second desktop breakpoint with a different rendered page scale.
  const secondDesktopContext = await browser.newContext({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1 });
  const secondDesktopPage = await secondDesktopContext.newPage();
  watch(secondDesktopPage);
  await secondDesktopPage.goto(editorUrl, { waitUntil: 'domcontentloaded' });
  await secondDesktopPage.locator('[data-vnext-shell]').waitFor();
  const secondIds = await secondDesktopPage.evaluate(() => ({ objectId: window.__W4F1_PROOF__.mainObjectId }));
  const secondInitial = await state(secondDesktopPage);
  await enterTable(secondDesktopPage, secondIds.objectId);
  const rowDragSecondScale = await dragBoundaryWithPhysicalEvidence(secondDesktopPage, 'row', 1, 11);
  const columnDragSecondScale = await dragBoundaryWithPhysicalEvidence(secondDesktopPage, 'column', 1, 13);
  assert.deepEqual((await state(secondDesktopPage)).main.frame, secondInitial.main.frame);
  assert(Math.abs(rowDragDefault.renderedPageExtentPx - rowDragSecondScale.renderedPageExtentPx) > 10);
  assert(Math.abs(columnDragDefault.renderedPageExtentPx - columnDragSecondScale.renderedPageExtentPx) > 10);
  await secondDesktopContext.close();

  const mobile = [];
  for (const width of [320, 360, 390]) {
    const mc = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const mp = await mc.newPage(); watch(mp); await mp.goto(editorUrl, { waitUntil: 'domcontentloaded' }); await mp.locator('[data-vnext-shell]').waitFor(); await enterTable(mp, ids.objectId);
    await mp.locator('[data-table-row-selector="0"]').tap(); await mp.locator('[data-row-property="role"]').selectOption('section');
    await mp.locator('[data-row-property="height-mode"]').selectOption('MIN_MM'); await settle(mp);
    await setInput(mp, '[data-row-property="height-mm"]', 13); await mp.locator('[data-editor-action="move-row-down"]').tap();
    await mp.locator('[data-table-column-selector="1"]').tap(); await mp.locator('[data-column-property="width-mode"]').selectOption('fixed'); await setInput(mp, '[data-column-property="fixed-mm"]', 30);
    await mp.locator('[data-editor-action="toggle-column-dimension-advanced"]').tap(); await setInput(mp, '[data-column-property="min-mm"]', 18);
    await mp.locator('[data-editor-action="extend-table-selection"]').tap(); await mp.locator('[data-table-column-selector="2"]').tap(); await mp.locator('[data-editor-action="equalize-columns"]').tap();
    await mp.locator('[data-table-column-selector="1"]').tap(); await mp.locator('[data-editor-action="move-column-right"]').tap();
    await mp.locator('[data-editor-action="undo"]').tap(); await mp.locator('[data-editor-action="redo"]').tap(); await mp.locator('[data-editor-action="save"]').tap();
    await mp.waitForFunction(() => !window.__W4F1_PROOF__.state().dirty);
    const overflow = await mp.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }));
    assert(overflow.documentWidth <= overflow.viewport); assert(overflow.bodyWidth <= overflow.viewport);
    mobile.push({ width, ...overflow, rowRole: true, rowHeight: true, columnDimension: true, equalize: true, rowReorder: true, columnReorder: true, undoRedo: true, save: true });
    await mc.close();
  }

  assert.deepEqual(errors.consoleErrors, [], JSON.stringify(errors)); assert.deepEqual(errors.pageErrors, []); assert.deepEqual(errors.failedResources, []); assert.deepEqual(errors.requestFailures, []);
  const evidence = {
    status: 'PASS',
    chromiumVersion: browser.version(),
    row: { roles: true, autoMinFixed: true, boundaryDrag: true },
    column: { fixedFlex: true, minMaxWeight: true, boundaryDrag: true, equalize: true },
    dragPhysicalFidelity: {
      defaultDesktop: { row: rowDragDefault, column: columnDragDefault },
      secondDesktopScale: { row: rowDragSecondScale, column: columnDragSecondScale },
      pointerTolerancePx: POINTER_TOLERANCE_PX,
      dimensionToleranceMm: DIMENSION_TOLERANCE_MM,
    },
    reorder: { row: true, column: true, stableIds: true },
    draftBarrier: true,
    persistence: { saveReopenExact: true },
    publication: { status: report.status, nativePdfA4: true },
    mobile,
    ...errors,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('W4.F.1 Professional Table Dimensions Chromium proof: PASS'); console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally { if (browser) await browser.close(); await server.close(); }
