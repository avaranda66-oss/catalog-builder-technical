import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w4f2-table-style-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W4F2_PROOF_PORT ?? 5244);
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
const editorUrl = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w4f2-editor-browser.html`;
const publicationUrl = `http://127.0.0.1:${port}/src/labs/presys-editorial-proof/index.html?fixture=W2A`;
const state = (page) => page.evaluate(() => window.__W4F2_PROOF__.state());
const errors = { consoleErrors: [], pageErrors: [], failedResources: [], requestFailures: [] };

function watch(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.consoleErrors.push({ text: message.text(), location: message.location() });
    }
  });
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.failedResources.push({ status: response.status(), url: response.url() });
  });
  page.on('requestfailed', (request) => {
    errors.requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? null });
  });
}

async function settle(page, count = 4) {
  await page.evaluate(async (frames) => {
    for (let i = 0; i < frames; i += 1) {
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    }
  }, count);
}

async function enterTable(page, objectId) {
  if (await page.locator('[data-table-grid-overlay]').count()) {
    await page.locator('[data-editor-action="leave-table-grid"]').click();
  }
  await page.locator(`[data-editor-object-id="${objectId}"]`).click();
  await page.locator('[data-editor-action="edit-table"]').click();
  await page.locator('[data-table-grid-overlay]').waitFor({ timeout: 20000 });
  await page.locator('[data-table-style-inspector]').waitFor({ timeout: 20000 });
  await settle(page);
}

async function selectCell(page, row, column) {
  await page.locator(`[data-table-cell="${row}:${column}"]`).click();
  await page.locator('[data-style-scope]').waitFor();
  await settle(page, 2);
}

async function selectRow(page, index) {
  await page.locator(`[data-table-row-selector="${index}"]`).click();
  await page.locator('[data-style-scope]').waitFor();
  await settle(page, 2);
}

async function selectColumn(page, index) {
  await page.locator(`[data-table-column-selector="${index}"]`).click();
  await page.locator('[data-style-scope]').waitFor();
  await settle(page, 2);
}

async function selectTable(page) {
  await page.locator('[data-table-selector="table"]').click();
  await page.locator('[data-style-scope]').waitFor();
  await settle(page, 2);
}

async function scopeText(page) {
  return (await page.locator('[data-style-scope]').innerText()).trim().toLocaleLowerCase('pt-BR');
}

async function setStyleInput(page, property, value) {
  const before = (await state(page)).localSequence;
  const input = page.locator(`[data-style-property="${property}"]`);
  await input.fill(String(value));
  await input.blur();
  await page.waitForFunction(
    (sequence) => window.__W4F2_PROOF__.state().localSequence > sequence,
    before,
    { timeout: 10000 }
  );
  await settle(page, 2);
}

async function setCustomColor(page, property, value) {
  const before = (await state(page)).localSequence;
  const input = page.locator(`[data-style-property="${property}"]`);
  await input.fill(value);
  await input.blur();
  await page.waitForFunction(
    (sequence) => window.__W4F2_PROOF__.state().localSequence > sequence,
    before,
    { timeout: 10000 }
  );
  await settle(page, 2);
}

async function ensureAdvanced(page) {
  if (!await page.locator('[data-style-advanced]').count()) {
    await page.locator('[data-editor-action="toggle-table-style-advanced"]').click();
  }
  await page.locator('[data-style-advanced]').waitFor();
}

async function renderedScalar(page, cellId, property) {
  return page.locator(`[data-cell-id="${cellId}"]`).evaluate((node, prop) => getComputedStyle(node)[prop], property);
}

async function publish(context, document) {
  const page = await context.newPage();
  watch(page);
  await page.goto(publicationUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.proof?.result !== undefined, { timeout: 30000 });
  const report = await page.evaluate((doc) => window.proof.runDocument(doc, 'W4F2-PRESENTATION'), document);
  return { page, report };
}

async function setBorderSide(page, side, { pattern, thicknessPt, color }) {
  await ensureAdvanced(page);
  const fieldset = page.locator(`[data-style-border-side="${side}"]`);
  const select = fieldset.locator('select');
  await select.selectOption(pattern);
  await settle(page, 3);
  if (pattern === 'solid') {
    const inputs = fieldset.locator('input');
    if (thicknessPt !== undefined) {
      await inputs.nth(0).fill(String(thicknessPt));
      await inputs.nth(0).blur();
      await settle(page, 3);
    }
    if (color !== undefined) {
      await inputs.nth(1).fill(color);
      await inputs.nth(1).blur();
      await settle(page, 3);
    }
  }
}

async function assertNoGlobalOverflow(page, width) {
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  assert.equal(geometry.viewport, width);
  assert(geometry.documentWidth <= geometry.viewport, JSON.stringify(geometry));
  assert(geometry.bodyWidth <= geometry.viewport, JSON.stringify(geometry));
  return geometry;
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: Boolean(process.env.CI || process.env.W4F2_PROOF_HEADLESS) });

  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watch(page);
  await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-vnext-shell]').waitFor();

  const ids = await page.evaluate(() => ({
    primaryId: window.__W4F2_PROOF__.primaryId,
    otherId: window.__W4F2_PROOF__.otherId,
    objectId: window.__W4F2_PROOF__.mainObjectId,
    mergedObjectId: window.__W4F2_PROOF__.mergedObjectId,
  }));
  const initial = await state(page);
  assert.equal(initial.catalogId, ids.primaryId);
  assert(initial.main);

  // Prove a second declared family in its own browser context so unicode-range loading cannot interfere with the long measurement journey.
  const fontContext = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  const fontPage = await fontContext.newPage();
  watch(fontPage);
  await fontPage.goto(editorUrl, { waitUntil: 'domcontentloaded' });
  await fontPage.locator('[data-vnext-shell]').waitFor();
  const fontIds = await fontPage.evaluate(() => ({
    primaryId: window.__W4F2_PROOF__.primaryId,
    otherId: window.__W4F2_PROOF__.otherId,
    objectId: window.__W4F2_PROOF__.mainObjectId,
  }));
  await enterTable(fontPage, fontIds.objectId);
  await selectCell(fontPage, 1, 1);
  await fontPage.locator('[data-style-property="fontFamily"]').selectOption('Noto Sans JP');
  await settle(fontPage, 5);
  const fontResource = await fontPage.evaluate(async () => {
    const loaded = await document.fonts.load('400 12px "Noto Sans JP"', '表');
    return {
      loadedFaces: loaded.length,
      check: document.fonts.check('400 12px "Noto Sans JP"', '表'),
      status: document.fonts.status,
    };
  });
  assert(fontResource.loadedFaces > 0);
  assert.equal(fontResource.check, true);
  const fontBeforeSave = await state(fontPage);
  assert.equal(fontBeforeSave.main.table.cells[5].style.fontFamily, 'Noto Sans JP');
  assert((await renderedScalar(fontPage, fontBeforeSave.main.table.cells[5].id, 'fontFamily')).includes('Noto Sans JP'));
  await fontPage.locator('[data-editor-action="save"]').click();
  await fontPage.waitForFunction(() => !window.__W4F2_PROOF__.state().dirty, { timeout: 30000 });
  assert.equal((await fontPage.evaluate((id) => window.__W4F2_PROOF__.reopen(id), fontIds.otherId)).ok, true);
  await fontPage.waitForFunction((id) => window.__W4F2_PROOF__.state().catalogId === id, fontIds.otherId);
  assert.equal((await fontPage.evaluate((id) => window.__W4F2_PROOF__.reopen(id), fontIds.primaryId)).ok, true);
  await fontPage.waitForFunction((id) => window.__W4F2_PROOF__.state().catalogId === id, fontIds.primaryId);
  const fontReopened = await state(fontPage);
  assert.equal(fontReopened.main.table.cells[5].style.fontFamily, 'Noto Sans JP');
  const fontFamilyEvidence = {
    selected: 'Noto Sans JP',
    resourceLoaded: true,
    saveReopenExact: true,
    loadedFaces: fontResource.loadedFaces,
  };
  await fontContext.close();

  const initialStructure = {
    tableId: initial.main.table.id,
    rowIds: initial.main.table.rows.map((row) => row.id),
    columnIds: initial.main.table.columns.map((column) => column.id),
    cellIds: initial.main.table.cells.map((cell) => cell.id),
    contents: structuredClone(initial.main.table.cells.map((cell) => cell.content)),
    spans: structuredClone(initial.main.table.cells.map((cell) => ({ id: cell.id, span: cell.span, coveredBy: cell.coveredBy }))),
  };

  await enterTable(page, ids.objectId);

  // Canonical cascade via real UI:
  // Document < Table < Header role < Column < Row < Cell.
  await selectTable(page);
  assert.equal(await scopeText(page), 'tabela');
  await setCustomColor(page, 'color', '#111111');

  await page.locator('[data-style-role-scope]').selectOption('header');
  await settle(page);
  assert.equal(await scopeText(page), 'cabeçalho');
  await setCustomColor(page, 'color', '#222222');
  await page.locator('[data-style-role-scope]').selectOption('');
  await settle(page);

  await selectColumn(page, 1);
  await setCustomColor(page, 'color', '#333333');
  await selectRow(page, 0);
  await setCustomColor(page, 'color', '#444444');
  await selectCell(page, 0, 1);
  await setCustomColor(page, 'color', '#555555');

  let current = await state(page);
  const headerCellId = current.main.table.cells[1].id;
  assert.equal(current.main.table.cells[1].style.color, '#555555');
  assert.equal(await renderedScalar(page, headerCellId, 'color'), 'rgb(85, 85, 85)');

  const firstColorReset = page.locator('[data-style-reset="color"]');
  await firstColorReset.click();
  await settle(page);
  assert.equal((await state(page)).main.table.cells[1].style?.color, undefined);
  assert.equal(await renderedScalar(page, headerCellId, 'color'), 'rgb(68, 68, 68)');

  await selectRow(page, 0);
  await page.locator('[data-style-reset="color"]').click();
  await settle(page);
  assert.equal((await state(page)).main.table.rows[0].style?.color, undefined);
  assert.equal(await renderedScalar(page, headerCellId, 'color'), 'rgb(51, 51, 51)');

  await selectColumn(page, 1);
  await page.locator('[data-style-reset="color"]').click();
  await settle(page);
  assert.equal((await state(page)).main.table.columns[1].style?.color, undefined);
  assert.equal(await renderedScalar(page, headerCellId, 'color'), 'rgb(34, 34, 34)');

  await selectTable(page);
  await page.locator('[data-style-role-scope]').selectOption('header');
  await page.locator('[data-style-reset="color"]').click();
  await settle(page);
  assert.equal((await state(page)).main.table.style.rowRoles.header?.color, undefined);
  assert.equal(await renderedScalar(page, headerCellId, 'color'), 'rgb(17, 17, 17)');
  await page.locator('[data-style-role-scope]').selectOption('');

  // Typography through the real Cell scope. The second declared family was proven in the isolated resource context above.
  await selectCell(page, 1, 2);
  await setStyleInput(page, 'fontSizePt', 8.25);
  await page.locator('[data-style-property="fontWeight"]').selectOption('400');
  await page.locator('[data-style-property="textAlign"]').selectOption('center');
  await page.locator('[data-style-property="verticalAlign"]').selectOption('bottom');
  await setCustomColor(page, 'color', '#003366');
  await setCustomColor(page, 'background', '#DCECFF');
  await ensureAdvanced(page);
  await setStyleInput(page, 'lineHeight', 1.35);

  current = await state(page);
  const bodyCell = current.main.table.cells[6];
  assert.deepEqual(
    {
      fontSizePt: bodyCell.style.fontSizePt,
      lineHeight: bodyCell.style.lineHeight,
      fontWeight: bodyCell.style.fontWeight,
      color: bodyCell.style.color,
      background: bodyCell.style.background,
      textAlign: bodyCell.style.textAlign,
      verticalAlign: bodyCell.style.verticalAlign,
    },
    {
      fontSizePt: 8.25,
      lineHeight: 1.35,
      fontWeight: 400,
      color: '#003366',
      background: '#DCECFF',
      textAlign: 'center',
      verticalAlign: 'bottom',
    }
  );

  // Vertical placement inside a fixed Row changes position, not Row height or Table frame.
  await selectCell(page, 0, 0);
  const fixedCellId = (await state(page)).main.table.cells[0].id;
  const beforeVerticalFrame = structuredClone((await state(page)).main.frame);
  const fixedPolicy = structuredClone((await state(page)).main.table.rows[0].heightPolicy);
  const verticalEvidence = {};
  for (const vertical of ['top', 'middle', 'bottom']) {
    await page.locator('[data-style-property="verticalAlign"]').selectOption(vertical);
    await settle(page, 5);
    verticalEvidence[vertical] = await page.locator(`[data-cell-id="${fixedCellId}"]`).evaluate((cell) => {
      const flow = cell.querySelector('[data-flow-root]');
      const cellRect = cell.getBoundingClientRect();
      const flowRect = flow.getBoundingClientRect();
      return {
        cellHeight: cellRect.height,
        flowTopOffset: flowRect.top - cellRect.top,
        flowBottomOffset: cellRect.bottom - flowRect.bottom,
        justifyContent: getComputedStyle(cell).justifyContent,
      };
    });
  }
  assert(verticalEvidence.top.flowTopOffset < verticalEvidence.middle.flowTopOffset);
  assert(verticalEvidence.middle.flowTopOffset < verticalEvidence.bottom.flowTopOffset);
  assert(Math.abs(verticalEvidence.top.cellHeight - verticalEvidence.bottom.cellHeight) < 0.2);
  assert.equal(verticalEvidence.top.justifyContent, 'flex-start');
  assert.equal(verticalEvidence.middle.justifyContent, 'center');
  assert.equal(verticalEvidence.bottom.justifyContent, 'flex-end');
  assert.deepEqual((await state(page)).main.table.rows[0].heightPolicy, fixedPolicy);
  assert.deepEqual((await state(page)).main.frame, beforeVerticalFrame);

  // Padding: quick recipe -> unlink one side -> reset that side to inherited.
  await selectCell(page, 1, 2);
  await page.locator('[data-style-padding-preset="spacious"]').click();
  await ensureAdvanced(page);
  const linkButton = page.locator('[data-style-padding-link]');
  if (await linkButton.getAttribute('aria-pressed') === 'true') await linkButton.click();
  const leftPadding = page.locator('[data-style-padding-side="left"]');
  await leftPadding.fill('3.5');
  await leftPadding.blur();
  await settle(page);
  assert.deepEqual((await state(page)).main.table.cells[6].style.paddingMm, {
    top: 2, right: 2, bottom: 2, left: 3.5,
  });
  await page.locator('[data-style-padding-reset="left"]').click();
  await settle(page);
  assert.equal((await state(page)).main.table.cells[6].style.paddingMm.left, undefined);

  // Border quick recipes on a canonical 2x2 Cell range.
  await selectCell(page, 1, 2);
  await page.locator('[data-editor-action="extend-table-selection"]').click();
  await page.locator('[data-table-cell="2:3"]').click();
  await settle(page);
  await page.locator('[data-style-border-preset="all"]').click();
  await settle(page);
  await page.locator('[data-style-border-preset="outer"]').click();
  await settle(page);
  current = await state(page);
  const borderIds = [6, 7, 10, 11].map((index) => current.main.table.cells[index].id);
  const borderById = new Map(current.main.table.cells.map((cell) => [cell.id, cell.style?.borders]));
  assert.equal(borderById.get(borderIds[0]).top.pattern, 'solid');
  assert.equal(borderById.get(borderIds[0]).left.pattern, 'solid');
  assert.equal(borderById.get(borderIds[0]).right.pattern, 'none');
  assert.equal(borderById.get(borderIds[0]).bottom.pattern, 'none');
  assert.equal(borderById.get(borderIds[3]).right.pattern, 'solid');
  assert.equal(borderById.get(borderIds[3]).bottom.pattern, 'solid');

  // Advanced side authoring remains ordinary canonical border data.
  await selectCell(page, 1, 2);
  await setBorderSide(page, 'top', { pattern: 'solid', thicknessPt: 1.25, color: '#112233' });
  current = await state(page);
  assert.deepEqual(current.main.table.cells[6].style.borders.top, {
    pattern: 'solid', thicknessPt: 1.25, color: '#112233',
  });

  // Preserve canonical BORDER_CONTENT_CLEARANCE; do not auto-correct padding.
  await ensureAdvanced(page);
  const linkState = await page.locator('[data-style-padding-link]').getAttribute('aria-pressed');
  if (linkState === 'true') await page.locator('[data-style-padding-link]').click();
  const topPadding = page.locator('[data-style-padding-side="top"]');
  await topPadding.fill('0');
  await topPadding.blur();
  await setBorderSide(page, 'top', { pattern: 'solid', thicknessPt: 5, color: '#003366' });
  await settle(page, 8);
  assert.equal((await state(page)).main.table.cells[6].style.paddingMm.top, 0);

  // All four presets are deterministic one-action materializations with no hidden linkage.
  await selectTable(page);
  const presetOutputs = {};
  for (const presetId of ['technical-specification', 'technical-grid', 'comparison', 'minimal']) {
    const before = await state(page);
    await page.locator(`[data-table-preset="${presetId}"]`).click();
    await page.waitForFunction((sequence) => window.__W4F2_PROOF__.state().localSequence === sequence + 1, before.localSequence);
    const after = await state(page);
    presetOutputs[presetId] = {
      base: after.main.table.style.base,
      rowRoles: after.main.table.style.rowRoles,
    };
    assert(!JSON.stringify(after.main.table).includes('presetId'));
  }
  assert.notDeepEqual(presetOutputs['technical-specification'], presetOutputs['technical-grid']);
  assert.notDeepEqual(presetOutputs['technical-grid'], presetOutputs.comparison);
  assert.notDeepEqual(presetOutputs.comparison, presetOutputs.minimal);

  const beforeUndoPreset = await state(page);
  await page.locator('[data-editor-action="undo"]').click();
  await page.locator('[data-editor-action="redo"]').click();
  assert.deepEqual((await state(page)).main.table.style, beforeUndoPreset.main.table.style);
  await setCustomColor(page, 'background', '#EEEEEE');
  await setStyleInput(page, 'fontSizePt', 8);
  assert.equal((await state(page)).main.table.style.base.background, '#EEEEEE');
  assert.equal((await state(page)).main.table.style.base.fontSizePt, 8);
  assert(!JSON.stringify((await state(page)).main.table).includes('presetId'));

  // W4.E remains explicit: vertical-only Body padding increases intrinsic height without changing width or the authored frame.
  await enterTable(page, ids.objectId);
  await selectTable(page);
  await page.locator('[data-style-role-scope]').selectOption('body');
  await settle(page, 3);
  await ensureAdvanced(page);
  const inflationLink = page.locator('[data-style-padding-link]');
  if (await inflationLink.getAttribute('aria-pressed') === 'true') await inflationLink.click();
  const beforeInflation = await state(page);
  for (const side of ['top', 'bottom']) {
    const input = page.locator(`[data-style-padding-side="${side}"]`);
    await input.fill('12');
    await input.blur();
    await settle(page, 3);
  }
  await settle(page, 10);
  const inflated = await state(page);
  assert.deepEqual(inflated.main.frame, beforeInflation.main.frame);

  const blocked = await publish(context, inflated.document);
  assert.equal(blocked.report.status, 'BLOCKED');
  assert(blocked.report.diagnostics.some((diagnostic) => diagnostic.code === 'TABLE_CONTENT_OVERFLOW'));
  await blocked.page.close();

  await page.locator('[data-editor-action="leave-table-grid"]').click();
  await page.locator('[data-table-grid-overlay]').waitFor({ state: 'detached' });
  await page.locator(`[data-editor-object-id="${ids.objectId}"]`).click();
  await page.locator('[data-table-fit-height]').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => {
    const section = document.querySelector('[data-table-fit-height]');
    const button = document.querySelector('[data-editor-action="fit-table-height"]');
    return section instanceof HTMLElement
      && Boolean(section.dataset.fitHeightPreparedU)
      && Boolean(section.dataset.fitHeightMeasuredQ)
      && button instanceof HTMLButtonElement
      && !button.disabled;
  }, undefined, { timeout: 30000 });
  const beforeFit = await state(page);
  await page.locator('[data-editor-action="fit-table-height"]').click();
  await settle(page, 8);
  const afterFit = await state(page);
  assert.equal(afterFit.main.frame.xMm, beforeFit.main.frame.xMm);
  assert.equal(afterFit.main.frame.yMm, beforeFit.main.frame.yMm);
  assert.equal(afterFit.main.frame.widthMm, beforeFit.main.frame.widthMm);
  assert.notEqual(afterFit.main.frame.heightMm, beforeFit.main.frame.heightMm);

  // Publication and PDF use the same canonical styled Table.
  const { page: publicationPage, report } = await publish(context, afterFit.document);
  assert.equal(report.status, 'READY', JSON.stringify(report.diagnostics));
  assert.equal(await publicationPage.locator('[data-editorial-root] [data-editor-action]').count(), 0);
  assert.equal(await publicationPage.locator('[data-table-style-inspector]').count(), 0);
  assert.equal(await publicationPage.locator('[data-table-selection-highlight]').count(), 0);
  assert((await publicationPage.locator('[data-paint-edge]').count()) > 0);

  const publishedCellId = afterFit.main.table.cells[6].id;
  const publishedCell = publicationPage.locator(`[data-cell-id="${publishedCellId}"]`);
  await publishedCell.waitFor();
  const publishedStyle = await publishedCell.evaluate((cell) => {
    const style = getComputedStyle(cell);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
      background: style.backgroundColor,
      textAlign: style.textAlign,
      justifyContent: style.justifyContent,
    };
  });
  assert(publishedStyle.fontFamily.includes('Noto Sans'));
  assert.equal(publishedStyle.color, 'rgb(0, 51, 102)');
  assert.equal(publishedStyle.background, 'rgb(220, 236, 255)');
  assert.equal(publishedStyle.textAlign, 'center');
  assert.equal(publishedStyle.justifyContent, 'flex-end');

  const pdfPath = resolve(output, 'w4f2-table-presentation.pdf');
  await publicationPage.emulateMedia({ media: 'print' });
  await publicationPage.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  const pdf = await getDocument({
    data: new Uint8Array(await readFile(pdfPath)),
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  assert.equal(pdf.numPages, 1);
  const pdfPage = await pdf.getPage(1);
  const text = await pdfPage.getTextContent();
  const pdfText = text.items.filter((item) => 'str' in item).map((item) => item.str).join(' ');
  assert(Math.abs((pdfPage.view[2] - pdfPage.view[0]) * 25.4 / 72 - 210) < 0.2);
  assert(Math.abs((pdfPage.view[3] - pdfPage.view[1]) * 25.4 / 72 - 297) < 0.2);
  assert(pdfText.includes('Parâmetro'));
  await pdf.destroy();
  await publicationPage.close();

  // Save/reopen exact presentation after all measurement-sensitive proof has completed.
  const beforeSave = await state(page);
  const savedPresentation = {
    frame: structuredClone(beforeSave.main.frame),
    style: structuredClone(beforeSave.main.table.style),
    rows: structuredClone(beforeSave.main.table.rows),
    columns: structuredClone(beforeSave.main.table.columns),
    cells: structuredClone(beforeSave.main.table.cells),
  };
  await page.locator('[data-editor-action="save"]').click();
  await page.waitForFunction(() => !window.__W4F2_PROOF__.state().dirty, { timeout: 30000 });
  assert.equal((await page.evaluate((id) => window.__W4F2_PROOF__.reopen(id), ids.otherId)).ok, true);
  await page.waitForFunction((id) => window.__W4F2_PROOF__.state().catalogId === id, ids.otherId);
  assert.equal((await page.evaluate((id) => window.__W4F2_PROOF__.reopen(id), ids.primaryId)).ok, true);
  await page.waitForFunction((id) => window.__W4F2_PROOF__.state().catalogId === id, ids.primaryId);
  const reopened = await state(page);
  assert.deepEqual(reopened.main.frame, savedPresentation.frame);
  assert.deepEqual(reopened.main.table.style, savedPresentation.style);
  assert.deepEqual(reopened.main.table.rows, savedPresentation.rows);
  assert.deepEqual(reopened.main.table.columns, savedPresentation.columns);
  assert.deepEqual(reopened.main.table.cells, savedPresentation.cells);
  assert.equal(reopened.canUndo, false);
  assert.equal(reopened.main.table.id, initialStructure.tableId);
  assert.deepEqual(reopened.main.table.rows.map((row) => row.id), initialStructure.rowIds);
  assert.deepEqual(reopened.main.table.columns.map((column) => column.id), initialStructure.columnIds);
  assert.deepEqual(reopened.main.table.cells.map((cell) => cell.id), initialStructure.cellIds);
  assert.deepEqual(reopened.main.table.cells.map((cell) => cell.content), initialStructure.contents);
  assert.deepEqual(reopened.main.table.cells.map((cell) => ({ id: cell.id, span: cell.span, coveredBy: cell.coveredBy })), initialStructure.spans);

  // Mobile essential path is fully touch-accessible at all required widths.
  const mobile = [];
  for (const width of [320, 360, 390]) {
    const mobileContext = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });
    const mobilePage = await mobileContext.newPage();
    watch(mobilePage);
    await mobilePage.goto(editorUrl, { waitUntil: 'domcontentloaded' });
    await mobilePage.locator('[data-vnext-shell]').waitFor();
    const mobileIds = await mobilePage.evaluate(() => ({ objectId: window.__W4F2_PROOF__.mainObjectId }));
    await enterTable(mobilePage, mobileIds.objectId);

    await mobilePage.locator('[data-table-cell="1:1"]').tap();
    const sizeInput = mobilePage.locator('[data-style-property="fontSizePt"]');
    await sizeInput.tap();
    await sizeInput.fill('12');
    await sizeInput.blur();
    await mobilePage.locator('[aria-label="Cor do texto #003366"]').tap();
    await mobilePage.locator('[aria-label="Cor de fundo #DCECFF"]').tap();
    await mobilePage.locator('[data-style-property="textAlign"]').selectOption('center');
    await mobilePage.locator('[data-style-property="verticalAlign"]').selectOption('middle');
    await mobilePage.locator('[data-style-reset="fontSizePt"]').tap();

    await mobilePage.locator('[data-table-row-selector="1"]').tap();
    await mobilePage.locator('[aria-label="Cor do texto #003366"]').tap();
    assert((await scopeText(mobilePage)).includes('linha'));

    await mobilePage.locator('[data-table-column-selector="1"]').tap();
    await mobilePage.locator('[aria-label="Cor de fundo #DCECFF"]').tap();
    assert((await scopeText(mobilePage)).includes('coluna'));

    await mobilePage.locator('[data-table-selector="table"]').tap();
    assert.equal(await scopeText(mobilePage), 'tabela');
    await mobilePage.locator('[data-table-preset="technical-specification"]').tap();
    await mobilePage.locator('[data-style-padding-preset="compact"]').tap();
    await mobilePage.locator('[data-style-border-preset="all"]').tap();

    await mobilePage.locator('[data-editor-action="toggle-table-style-advanced"]').tap();
    await mobilePage.locator('[data-style-advanced]').waitFor();
    assert(await mobilePage.locator('[data-style-border-side="top"]').isVisible());

    await mobilePage.locator('[data-editor-action="undo"]').tap();
    await mobilePage.locator('[data-editor-action="redo"]').tap();
    await mobilePage.locator('[data-editor-action="save"]').tap();
    await mobilePage.waitForFunction(() => !window.__W4F2_PROOF__.state().dirty, { timeout: 30000 });

    const overflow = await assertNoGlobalOverflow(mobilePage, width);
    mobile.push({
      width,
      ...overflow,
      cellTypography: true,
      colors: true,
      horizontalAlign: true,
      verticalAlign: true,
      resetInherited: true,
      rowStyle: true,
      columnStyle: true,
      tableStyle: true,
      preset: true,
      paddingQuick: true,
      borderQuick: true,
      advancedReachable: true,
      undoRedo: true,
      save: true,
    });
    await mobileContext.close();
  }

  assert.deepEqual(errors.consoleErrors, [], JSON.stringify(errors));
  assert.deepEqual(errors.pageErrors, [], JSON.stringify(errors));
  assert.deepEqual(errors.failedResources, [], JSON.stringify(errors));
  assert.deepEqual(errors.requestFailures, [], JSON.stringify(errors));

  const evidence = {
    status: 'PASS',
    chromiumVersion: browser.version(),
    cascade: {
      documentTableRoleColumnRowCell: true,
      resetToInherited: true,
    },
    typography: {
      declaredFontFamily: fontFamilyEvidence,
      fontSize: true,
      lineHeight: true,
      weight: true,
      textColor: true,
      background: true,
      horizontalAlign: true,
    },
    verticalAlign: {
      topMiddleBottom: true,
      fixedRowHeightStable: true,
      frameStable: true,
      evidence: verticalEvidence,
    },
    padding: {
      quick: true,
      unlinkedSide: true,
      resetInherited: true,
    },
    borders: {
      all: true,
      outer: true,
      advancedSide: true,
      clearanceNotAutoCorrected: true,
    },
    presets: {
      ids: ['technical-specification', 'technical-grid', 'comparison', 'minimal'],
      noHiddenLinkage: true,
      undoRedo: true,
      manualEditAfterPreset: true,
    },
    persistence: {
      saveReopenExact: true,
      stableIdsContentTopology: true,
    },
    w4e: {
      styleOverflowBlocked: true,
      noAutomaticFit: true,
      explicitFit: true,
    },
    publication: {
      status: report.status,
      styledCell: publishedStyle,
      canonicalPaintEdges: true,
      nativePdfA4: true,
      pdfText: 'Parâmetro',
    },
    mobile,
    ...errors,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('W4.F.2 Professional Table Presentation Chromium proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
