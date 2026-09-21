import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w4a-table-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W4A_PROOF_PORT ?? 5207);
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
const url = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w4a-editor-browser.html`;

const close = (actual, expected, label, tolerance = 0.75) => {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
};
const state = (page) => page.evaluate(() => window.__W4A_PROOF__.state());
const selectTableAndEnter = async (page) => {
  await page.locator('[data-editor-object-id="w4a-table-object"]').click();
  await page.locator('[data-editor-action="edit-table"]').click();
  await page.locator('[data-table-grid-overlay]').waitFor({ timeout: 15000 });
};
const waitForMeasuredGrid = async (page) => {
  await page.locator('[data-table-grid-overlay]').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('[data-table-row-selector]');
    return rows.length > 0 && [...rows].every((node) => node.getBoundingClientRect().height > 0);
  });
};

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('[data-vnext-shell]').waitFor();
  const initial = await state(page);
  assert.deepEqual(initial.rows, ['w4a-row-header', 'w4a-row-min', 'w4a-row-auto']);
  assert.deepEqual(initial.columns, ['w4a-column-a', 'w4a-column-b', 'w4a-column-c']);
  await selectTableAndEnter(page);
  await waitForMeasuredGrid(page);
  assert.equal(await page.locator('[data-resize-handle]').count(), 0, 'Grid mode must suspend resize handles');
  assert.equal(await page.locator('[data-editorial-root] [data-table-grid-overlay], [data-editorial-root] [data-table-axis-toolbar]').count(), 0, 'Editor chrome must not enter publication root');
  await page.locator('[data-editor-object-id="w4a-single-table-object"]').click();
  assert.equal(await page.locator('[data-table-grid-overlay]').count(), 0, 'Selecting another object must leave grid mode');
  assert.equal(await page.locator('[data-editor-object-id="w4a-single-table-object"][data-selected="true"]').count(), 1, 'The newly targeted object must remain selectable');
  await selectTableAndEnter(page);
  await waitForMeasuredGrid(page);
  await page.locator('[data-editor-overlay]').click({ position: { x: 4, y: 4 } });
  assert.equal(await page.locator('[data-table-grid-overlay]').count(), 0, 'Clicking empty canvas must leave grid mode');
  assert.equal(await page.locator('[data-editor-object-id][data-selected="true"]').count(), 0, 'Clicking empty canvas must clear object selection');
  await selectTableAndEnter(page);
  await waitForMeasuredGrid(page);
  await page.locator('[data-table-grid-overlay]').press('Shift+Tab');
  await page.locator('[data-table-grid-overlay]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-resize-handle]').count(), 8, 'Shift+Tab at the first stop must exit predictably');
  await page.locator('[data-editor-action="edit-table"]').click();
  await waitForMeasuredGrid(page);

  const gridRect = await page.locator('[data-editorial-root] [data-table-id="w4a-table"]').boundingBox();
  const objectRect = await page.locator('[data-editorial-root] [data-object-id="w4a-table-object"]').boundingBox();
  assert(gridRect && objectRect);
  assert(gridRect.y > objectRect.y, 'Caption must place the measured grid below the object top');

  const rowGeometry = [];
  await page.locator('[data-table-row-selector="0"]').click();
  const fixedHighlight = await page.locator('[data-table-selection-highlight]').boundingBox();
  const fixedCell = await page.locator('[data-editorial-root] [data-cell-id="w4a-cell-0-0"]').boundingBox();
  assert(fixedHighlight && fixedCell);
  close(fixedHighlight.y, fixedCell.y, 'FIXED row selection y');
  close(fixedHighlight.height, fixedCell.height, 'FIXED row selection height');
  close(fixedHighlight.x, gridRect.x, 'FIXED row selection x');
  close(fixedHighlight.width, gridRect.width, 'FIXED row selection width');
  rowGeometry.push({ rowIndex: 0, highlight: fixedHighlight, cell: fixedCell });

  await page.locator('[data-table-cell="1:0"]').click();
  const minHighlight = await page.locator('[data-table-selection-highlight]').boundingBox();
  const minCell = await page.locator('[data-editorial-root] [data-cell-id="w4a-cell-1-0"]').boundingBox();
  assert(minHighlight && minCell);
  close(minHighlight.x, minCell.x, 'MIN row cell selection x');
  close(minHighlight.y, minCell.y, 'MIN row cell selection y');
  close(minHighlight.width, minCell.width, 'MIN row cell selection width');
  close(minHighlight.height, minCell.height, 'MIN row cell selection height');
  rowGeometry.push({ rowIndex: 1, highlight: minHighlight, cell: minCell });

  await page.locator('[data-table-cell="0:0"]').click();
  await page.locator('[data-table-cell="1:0"]').click({ modifiers: ['Shift'] });
  const shiftedRange = await page.locator('[data-table-selection-highlight]').boundingBox();
  assert(shiftedRange && shiftedRange.height > fixedHighlight.height, 'Shift+click must extend the current cell range');

  const cell00 = page.locator('[data-table-cell="0:0"]');
  const cell10 = page.locator('[data-table-cell="1:0"]');
  const from = await cell10.boundingBox();
  const to = await cell00.boundingBox();
  assert(from && to);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2);
  await page.mouse.up();
  const reverseRange = await page.locator('[data-table-selection-highlight]').boundingBox();
  assert(reverseRange);
  close(reverseRange.y, gridRect.y, 'reverse drag starts at first row');
  assert(reverseRange.height > rowGeometry[0].highlight.height, 'Reverse drag must span two rows');
  await page.locator('[data-table-grid-overlay]').press('Shift+ArrowRight');
  await page.locator('[data-table-grid-overlay]').press('ArrowDown');

  await page.locator('[data-table-row-selector="0"]').click();
  const beforeRowInsert = await state(page);
  await page.locator('[data-editor-action="insert-row-before"]').click();
  await waitForMeasuredGrid(page);
  const insertedRow = await state(page);
  assert.equal(insertedRow.rows.length, beforeRowInsert.rows.length + 1);
  assert.deepEqual(insertedRow.frame, initial.frame, 'Row insertion must preserve authored frame');
  const freshRowId = insertedRow.rows.find((id) => !beforeRowInsert.rows.includes(id));
  assert(freshRowId, 'Inserted row must have a fresh stable ID');
  assert.equal(await page.locator('[data-editor-action="remove-row"]').isEnabled(), true, 'Inserted row must become explicit selection');

  await page.locator('[data-editor-action="undo"]').click();
  await page.waitForFunction((expected) => JSON.stringify(window.__W4A_PROOF__.state().rows) === JSON.stringify(expected), beforeRowInsert.rows);
  await page.locator('[data-editor-action="redo"]').click();
  await page.waitForFunction((expected) => JSON.stringify(window.__W4A_PROOF__.state().rows) === JSON.stringify(expected), insertedRow.rows);
  assert.deepEqual((await state(page)).rows, insertedRow.rows, 'Redo must restore the exact inserted row ID');
  await waitForMeasuredGrid(page);
  const restoredRowIndex = (await state(page)).rows.indexOf(freshRowId);
  await page.locator(`[data-table-row-selector="${restoredRowIndex}"]`).click();
  await page.locator('[data-editor-action="remove-row"]').click();
  await page.waitForFunction((expected) => JSON.stringify(window.__W4A_PROOF__.state().rows) === JSON.stringify(expected), beforeRowInsert.rows);

  await waitForMeasuredGrid(page);
  await page.locator('[data-table-column-selector="0"]').click();
  const beforeColumnInsert = await state(page);
  await page.locator('[data-editor-action="insert-column-before"]').click();
  await waitForMeasuredGrid(page);
  const insertedColumn = await state(page);
  assert.equal(insertedColumn.columns.length, beforeColumnInsert.columns.length + 1);
  assert.deepEqual(insertedColumn.frame, initial.frame, 'Column insertion must preserve authored frame');
  const freshColumnId = insertedColumn.columns.find((id) => !beforeColumnInsert.columns.includes(id));
  assert(freshColumnId, 'Inserted column must have a fresh stable ID');
  await page.locator('[data-editor-action="remove-column"]').click();
  await page.waitForFunction((expected) => JSON.stringify(window.__W4A_PROOF__.state().columns) === JSON.stringify(expected), beforeColumnInsert.columns);

  await waitForMeasuredGrid(page);
  await page.locator('[data-table-column-selector="1"]').click();
  const beforeSpanFailure = await state(page);
  await page.locator('[data-editor-action="remove-column"]').click();
  await page.getByText('A remoção cruza uma célula mesclada.', { exact: false }).waitFor();
  assert.deepEqual(await state(page), beforeSpanFailure, 'Span rejection must preserve document and history sequence');

  await page.locator('[data-table-selector="table"]').click();
  const whole = await page.locator('[data-table-selection-highlight]').boundingBox();
  assert(whole);
  close(whole.x, gridRect.x, 'whole table x');
  close(whole.y, gridRect.y, 'whole table y');
  close(whole.width, gridRect.width, 'whole table width');
  await page.locator('[data-table-row-selector="0"]').click();
  await page.locator('[data-editor-action="insert-row-after"]').click();
  await waitForMeasuredGrid(page);
  assert.equal((await state(page)).rows.length, initial.rows.length + 1, 'A changed Table must remain for Save/reopen proof');
  await page.locator('[data-editor-action="leave-table-grid"]').click();
  assert.equal(await page.locator('[data-table-grid-overlay]').count(), 0);
  assert.equal(await page.locator('[data-resize-handle]').count(), 8, 'Object mode must restore resize affordances');
  assert.deepEqual((await state(page)).frame, initial.frame, 'All structural editing must preserve authored frame');

  await page.locator('[data-editor-object-id="w4a-single-table-object"]').click();
  await page.locator('[data-editor-action="edit-table"]').click();
  await waitForMeasuredGrid(page);
  await page.locator('[data-table-row-selector="0"]').click();
  const beforeLastAxisFailure = await state(page);
  await page.locator('[data-editor-action="remove-row"]').click();
  await page.getByText('A última linha ou coluna não pode ser removida.', { exact: true }).waitFor();
  assert.equal((await state(page)).localSequence, beforeLastAxisFailure.localSequence, 'Last-axis rejection must preserve history sequence');
  await page.locator('[data-editor-action="leave-table-grid"]').click();

  const savedShape = await state(page);
  assert.equal(savedShape.dirty, true, 'Structural Table change must mark the W3 workspace dirty');
  await page.locator('[data-editor-action="save"]').click();
  await page.waitForFunction(() => !window.__W4A_PROOF__.state().dirty && window.__W4A_PROOF__.state().savePhase === 'idle');
  await page.evaluate(() => window.__W4A_PROOF__.reopen(window.__W4A_PROOF__.otherId));
  await page.waitForFunction(() => window.__W4A_PROOF__.state().catalogId === window.__W4A_PROOF__.otherId);
  await page.evaluate(() => window.__W4A_PROOF__.reopen(window.__W4A_PROOF__.primaryId));
  await page.waitForFunction(() => window.__W4A_PROOF__.state().catalogId === window.__W4A_PROOF__.primaryId);
  const reopened = await state(page);
  assert.deepEqual(reopened.rows, savedShape.rows, 'Reopen must restore saved row identities');
  assert.deepEqual(reopened.columns, savedShape.columns, 'Reopen must restore saved column identities');
  assert.deepEqual(reopened.frame, savedShape.frame, 'Reopen must preserve authored frame');

  await page.screenshot({ path: resolve(output, 'desktop-grid.png'), fullPage: true });
  const mobile = [];
  for (const width of [320, 360, 390]) {
    const mobilePage = await context.newPage();
    await mobilePage.setViewportSize({ width, height: 844 });
    await mobilePage.goto(url, { waitUntil: 'networkidle' });
    await mobilePage.locator('[data-vnext-shell]').waitFor();
    const overflow = await mobilePage.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    assert(overflow.documentWidth <= overflow.viewport, `${width}px document overflow: ${JSON.stringify(overflow)}`);
    assert(overflow.bodyWidth <= overflow.viewport, `${width}px body overflow: ${JSON.stringify(overflow)}`);
    await selectTableAndEnter(mobilePage);
    await mobilePage.locator('[data-table-axis-toolbar]').scrollIntoViewIfNeeded();
    assert(await mobilePage.locator('[data-editor-action="leave-table-grid"]').isVisible());
    assert(await mobilePage.locator('[data-table-row-selector="0"]').isVisible());
    await mobilePage.screenshot({ path: resolve(output, `mobile-${width}.png`), fullPage: true });
    mobile.push({ width, ...overflow, gridReachable: true });
    await mobilePage.close();
  }

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  const evidence = {
    chromiumVersion: browser.version(),
    initial,
    rowGeometry,
    shiftedRange,
    reverseRange,
    freshRowId,
    freshColumnId,
    beforeSpanFailure,
    beforeLastAxisFailure,
    savedShape,
    reopened,
    editorChromeInsidePublicationRoot: 0,
    mobile,
    consoleErrors,
    pageErrors,
    persistenceEnvironment: 'Controlled in-browser CatalogRepository; not real-production Supabase E2E.',
  };
  await writeFile(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log('W4.A Chromium Table selection and axis authoring proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
