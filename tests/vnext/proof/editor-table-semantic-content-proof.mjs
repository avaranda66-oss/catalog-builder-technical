import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w4f3-table-semantic-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W4F3_PROOF_PORT ?? 5245);
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
const editorUrl = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w4f3-editor-browser.html`;
const publicationUrl = `http://127.0.0.1:${port}/src/labs/presys-editorial-proof/index.html?fixture=W2A`;

const errors = { consoleErrors: [], pageErrors: [], failedResources: [], requestFailures: [] };
const plain = (rich) => rich.paragraphs.map((paragraph) =>
  paragraph.inlines.map((inline) => inline.kind === 'text' ? inline.text : '\n').join('')
).join('\n');
const state = (page) => page.evaluate(() => window.__W4F3_PROOF__.state());
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

async function settle(page, count = 4) {
  await page.evaluate(async (frames) => {
    for (let i = 0; i < frames; i += 1) {
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    }
  }, count);
}

async function waitSequence(page, before) {
  await page.waitForFunction(
    (sequence) => window.__W4F3_PROOF__.state().localSequence > sequence,
    before,
    { timeout: 10000 }
  );
  await settle(page, 3);
}
async function selectObject(page, objectId) {
  if (await page.locator('[data-table-grid-overlay]').count()) {
    await page.locator('[data-editor-action="leave-table-grid"]').click();
    await page.locator('[data-table-grid-overlay]').waitFor({ state: 'detached' });
  }
  await page.locator(`[data-editor-object-id="${objectId}"]`).click();
  await page.locator('[data-table-semantic-title]').waitFor();
}

async function enterTable(page, objectId) {
  if (!await page.locator('[data-table-grid-overlay]').count()) {
    await selectObject(page, objectId);
    await page.locator('[data-editor-action="edit-table"]').click();
    await page.locator('[data-table-grid-overlay]').waitFor({ timeout: 20000 });
  }
  await settle(page);
}

async function selectCell(page, row, column, touch = false) {
  const target = page.locator(`[data-table-cell="${row}:${column}"]`);
  if (touch) await target.tap();
  else await target.click();
  await settle(page, 2);
}
async function setTitle(page, value, touch = false) {
  const input = page.locator('[data-table-title-input]');
  if (touch) await input.tap();
  await input.fill(value);
  const before = (await state(page)).localSequence;
  const button = page.locator('[data-editor-action="set-table-title"]');
  if (touch) await button.tap(); else await button.click();
  await waitSequence(page, before);
}

async function openSemanticPanel(page, touch = false) {
  const button = page.locator('[data-editor-action="open-table-semantics"]');
  if (touch) await button.tap(); else await button.click();
  await page.locator('[data-table-grid-overlay]').waitFor({ timeout: 20000 });
  await page.locator('[data-marker-legend-panel]').waitFor({ timeout: 20000 });
  await settle(page);
}

async function createAnnotation(page, kind, target, textValue, touch = false) {
  await page.locator('[data-annotation-kind]').selectOption(kind);
  if (kind !== 'caption') await page.locator('[data-annotation-target]').selectOption(target);
  await page.locator('[data-new-annotation-text]').fill(textValue);
  const before = await state(page);
  const button = page.locator('[data-editor-action="create-annotation"]');
  if (touch) await button.tap(); else await button.click();
  await waitSequence(page, before.localSequence);
  const after = await state(page);
  const added = after.main.table.annotations.find((entry) =>
    !before.main.table.annotations.some((old) => old.id === entry.id)
  );
  assert(added, 'Annotation creation did not allocate a canonical annotation');
  return added;
}

async function reorderAnnotation(page, annotationId, direction, touch = false) {
  const entry = page.locator(`[data-annotation-entry-id="${annotationId}"]`);
  const before = (await state(page)).localSequence;
  const button = entry.locator(`[data-editor-action="move-annotation-${direction}"]`);
  if (touch) await button.tap(); else await button.click();
  await waitSequence(page, before);
}

async function reorderLegend(page, legendId, direction, touch = false) {
  const entry = page.locator(`[data-legend-entry-id="${legendId}"]`);
  const before = (await state(page)).localSequence;
  const button = entry.locator(`[data-editor-action="move-legend-${direction}"]`);
  if (touch) await button.tap(); else await button.click();
  await waitSequence(page, before);
}
async function setCellImage(page, { fit, width, height }, touch = false) {
  await page.locator('[data-image-cell-asset]').selectOption('asset-ta25n');
  await page.locator('[data-image-cell-fit]').selectOption(fit);
  await page.locator('[data-image-cell-width]').fill(String(width));
  await page.locator('[data-image-cell-height]').fill(String(height));
  const before = (await state(page)).localSequence;
  const button = page.locator('[data-editor-action="set-cell-image"]');
  if (touch) await button.tap(); else await button.click();
  await waitSequence(page, before);
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

async function publish(context, document) {
  const page = await context.newPage();
  watch(page);
  await page.goto(publicationUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.proof?.result !== undefined, { timeout: 30000 });
  const report = await page.evaluate((doc) => window.proof.runDocument(doc, 'W4F3-SEMANTIC'), document);
  return { page, report };
}

async function saveAndReopen(page, ids) {
  await page.locator('[data-editor-action="save"]').click();
  await page.waitForFunction(() => !window.__W4F3_PROOF__.state().dirty, { timeout: 30000 });
  assert.equal((await page.evaluate((id) => window.__W4F3_PROOF__.reopen(id), ids.otherId)).ok, true);
  await page.waitForFunction((id) => window.__W4F3_PROOF__.state().catalogId === id, ids.otherId);
  assert.equal((await page.evaluate((id) => window.__W4F3_PROOF__.reopen(id), ids.primaryId)).ok, true);
  await page.waitForFunction((id) => window.__W4F3_PROOF__.state().catalogId === id, ids.primaryId);
  await settle(page, 5);
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: Boolean(process.env.CI || process.env.W4F3_PROOF_HEADLESS) });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watch(page);
  await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-vnext-shell]').waitFor();
  const ids = await page.evaluate(() => ({
    primaryId: window.__W4F3_PROOF__.primaryId,
    otherId: window.__W4F3_PROOF__.otherId,
    objectId: window.__W4F3_PROOF__.objectId,
  }));
  const initial = await state(page);
  assert.equal(initial.catalogId, ids.primaryId);
  assert(initial.main);
  const originalFrame = structuredClone(initial.main.frame);
  const originalTopology = {
    tableId: initial.main.table.id,
    rowIds: initial.main.table.rows.map((row) => row.id),
    columnIds: initial.main.table.columns.map((column) => column.id),
    cellIds: initial.main.table.cells.map((cell) => cell.id),
  };

  await selectObject(page, ids.objectId);
  const titleCreated = 'Tabela de calibração — superfícies semânticas W4.F.3';
  await setTitle(page, titleCreated);
  let current = await state(page);
  assert.equal(plain(current.main.table.title), titleCreated);
  assert.equal(current.main.frame.heightMm, originalFrame.heightMm);
  await page.locator('[data-table-title]').waitFor();
  assert((await page.locator('[data-table-title]').innerText()).includes('Tabela de calibração'));
  const titleEdited = titleCreated + ' — revisão';
  await setTitle(page, titleEdited);
  const afterTitleEdit = await state(page);
  assert.equal(plain(afterTitleEdit.main.table.title), titleEdited);
  await page.locator('[data-editor-action="undo"]').click();
  await settle(page);
  assert.equal(plain((await state(page)).main.table.title), titleCreated);
  await page.locator('[data-editor-action="redo"]').click();
  await settle(page);
  assert.equal(plain((await state(page)).main.table.title), titleEdited);

  await openSemanticPanel(page);
  await selectCell(page, 1, 1);
  const caption = await createAnnotation(
    page,
    'caption',
    'TABLE',
    'Legenda técnica extensa da tabela para documentar o contexto de calibração e ampliar o conteúdo intrínseco.'
  );
  const note = await createAnnotation(
    page,
    'note',
    'CELL',
    'Nota técnica extensa associada à célula selecionada para comprovar referência e medição sem alterar o quadro automaticamente.'
  );
  const footnote = await createAnnotation(
    page,
    'footnote',
    'TABLE',
    'Nota de rodapé extensa para validar numeração derivada, ordenação canônica, publicação e PDF.'
  );
  current = await state(page);
  assert(current.main.table.annotationIds.includes(caption.id));
  assert(current.main.table.annotationIds.includes(footnote.id));
  const selectedCell = current.main.table.cells[5];
  assert(selectedCell.annotationIds.includes(note.id));
  assert.equal(current.main.frame.heightMm, originalFrame.heightMm);

  const noteEntry = page.locator(`[data-annotation-entry-id="${note.id}"]`);
  const deleteWhileReferenced = noteEntry.locator('[data-editor-action="remove-annotation"]');
  assert.equal(await deleteWhileReferenced.isDisabled(), true);
  const beforeDisabledDelete = await state(page);
  await deleteWhileReferenced.evaluate((button) => button.click());
  await settle(page, 2);
  assert.equal((await state(page)).localSequence, beforeDisabledDelete.localSequence);

  await noteEntry.locator('[data-editor-action="annotation-cell-reference"]').click();
  await waitSequence(page, beforeDisabledDelete.localSequence);
  assert(!(await state(page)).main.table.cells[5].annotationIds?.includes(note.id));
  let beforeReattach = (await state(page)).localSequence;
  await noteEntry.locator('[data-editor-action="annotation-cell-reference"]').click();
  await waitSequence(page, beforeReattach);
  assert((await state(page)).main.table.cells[5].annotationIds.includes(note.id));

  const disposable = await createAnnotation(page, 'note', 'TABLE', 'Nota temporária para provar detach e delete.');
  const disposableEntry = page.locator(`[data-annotation-entry-id="${disposable.id}"]`);
  assert.equal(await disposableEntry.locator('[data-editor-action="remove-annotation"]').isDisabled(), true);
  const detachSeq = (await state(page)).localSequence;
  await disposableEntry.locator('[data-editor-action="annotation-table-reference"]').click();
  await waitSequence(page, detachSeq);
  const removeSeq = (await state(page)).localSequence;
  await disposableEntry.locator('[data-editor-action="remove-annotation"]').click();
  await waitSequence(page, removeSeq);
  assert(!(await state(page)).main.table.annotations.some((entry) => entry.id === disposable.id));

  current = await state(page);
  const beforeOrder = current.main.table.annotations.map((entry) => entry.id);
  assert.deepEqual(beforeOrder, [caption.id, note.id, footnote.id]);
  await reorderAnnotation(page, footnote.id, 'up');
  current = await state(page);
  assert.deepEqual(current.main.table.annotations.map((entry) => entry.id), [caption.id, footnote.id, note.id]);
  const renderedFootnote = page.locator(`[data-annotation-id="${footnote.id}"]`);
  const renderedNote = page.locator(`[data-annotation-id="${note.id}"]`);
  assert((await renderedFootnote.innerText()).trim().startsWith('1.'));
  assert((await renderedNote.innerText()).trim().startsWith('2.'));

  const legendBefore = current.main.table.legend.map((entry) => entry.id);
  assert.deepEqual(legendBefore, ['w4f3-legend-a', 'w4f3-legend-b']);
  await reorderLegend(page, 'w4f3-legend-a', 'down');
  current = await state(page);
  assert.deepEqual(current.main.table.legend.map((entry) => entry.id), ['w4f3-legend-b', 'w4f3-legend-a']);
  assert.equal(current.main.table.cells[2].content.legendEntryId, 'w4f3-legend-a');
  const renderedLegend = await page.locator('.editorial-legend').innerText();
  assert(renderedLegend.indexOf('Bloqueio') < renderedLegend.indexOf('Alarme'));

  const locateEntry = page.locator('[data-legend-entry-id="w4f3-legend-a"]');
  const beforeLocate = await state(page);
  const beforeLocateJson = JSON.stringify(beforeLocate.document);
  await locateEntry.locator('[data-editor-action="locate-legend-usage"]').click();
  await settle(page, 4);
  const afterLocate = await state(page);
  assert.equal(afterLocate.localSequence, beforeLocate.localSequence);
  assert.equal(JSON.stringify(afterLocate.document), beforeLocateJson);
  const targetBox = await page.locator('[data-table-cell="0:2"]').boundingBox();
  const highlightBox = await page.locator('[data-table-selection-highlight]').boundingBox();
  assert(targetBox && highlightBox);
  assert(Math.abs(targetBox.x - highlightBox.x) < 1);
  assert(Math.abs(targetBox.y - highlightBox.y) < 1);

  await selectCell(page, 1, 1);
  await setCellImage(page, { fit: 'contain', width: 24, height: 16 });
  current = await state(page);
  let imageCell = current.main.table.cells[5];
  assert.deepEqual(imageCell.content, { type: 'image', assetId: 'asset-ta25n' });
  assert.deepEqual(imageCell.contentPresentation.image, {
    fit: 'contain',
    targetWidthMm: 24,
    targetHeightMm: 16,
  });
  assert.equal(current.main.frame.heightMm, originalFrame.heightMm);
  const img = page.locator(`[data-cell-id="${imageCell.id}"] img[data-asset-id="asset-ta25n"]`);
  await img.waitFor();
  assert.equal(await img.evaluate((node) => getComputedStyle(node).objectFit), 'contain');

  await setCellImage(page, { fit: 'cover', width: 26.5, height: 17.25 });
  imageCell = (await state(page)).main.table.cells[5];
  assert.equal(imageCell.contentPresentation.image.fit, 'cover');
  assert.equal(imageCell.contentPresentation.image.targetWidthMm, 26.5);
  assert.equal(imageCell.contentPresentation.image.targetHeightMm, 17.25);
  assert.equal(await img.evaluate((node) => getComputedStyle(node).objectFit), 'cover');
  await page.locator('[data-image-cell-fit]').selectOption('contain');
  await page.locator('[data-image-cell-width]').fill('28');
  await page.locator('[data-image-cell-height]').fill('18');
  const uploadBefore = await state(page);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('[data-editor-action="upload-cell-image"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'w4f3-proof.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([255, 216, 255, 217]),
  });
  await page.waitForFunction(
    (count) => window.__W4F3_PROOF__.state().uploadCount > count,
    uploadBefore.uploadCount
  );
  await page.waitForFunction(
    (sequence) => window.__W4F3_PROOF__.state().localSequence > sequence,
    uploadBefore.localSequence,
    { timeout: 10000 }
  );
  current = await state(page);
  assert.equal(current.uploadCount, uploadBefore.uploadCount + 1);
  imageCell = current.main.table.cells[5];
  assert.deepEqual(imageCell.contentPresentation.image, {
    fit: 'contain',
    targetWidthMm: 28,
    targetHeightMm: 18,
  });

  const clearBefore = current.localSequence;
  await page.locator('[data-editor-action="clear-cell-image"]').click();
  await waitSequence(page, clearBefore);
  assert.equal((await state(page)).main.table.cells[5].content.type, 'empty');
  await page.locator('[data-editor-action="undo"]').click();
  await settle(page, 3);
  assert.equal((await state(page)).main.table.cells[5].content.type, 'image');
  await page.locator('[data-editor-action="redo"]').click();
  await settle(page, 3);
  assert.equal((await state(page)).main.table.cells[5].content.type, 'empty');
  await page.locator('[data-editor-action="undo"]').click();
  await settle(page, 3);
  assert.equal((await state(page)).main.table.cells[5].content.type, 'image');
  const authoredBeforeFit = await state(page);
  assert.deepEqual(authoredBeforeFit.main.frame, originalFrame);
  const blocked = await publish(context, authoredBeforeFit.document);
  assert.equal(blocked.report.status, 'BLOCKED');
  assert(blocked.report.diagnostics.some((diagnostic) => diagnostic.code === 'TABLE_CONTENT_OVERFLOW'));
  assert(blocked.report.snapshot.facts.some(
    (fact) => fact.kind === 'tableTitle' && fact.tableId === authoredBeforeFit.main.table.id
  ));
  await blocked.page.close();

  await page.waitForFunction(() => {
    const button = document.querySelector('[data-editor-action="fit-table-height"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 30000 });
  const beforeFit = await state(page);
  await page.locator('[data-editor-action="fit-table-height"]').click();
  await waitSequence(page, beforeFit.localSequence);
  const afterFit = await state(page);
  assert.equal(afterFit.main.frame.xMm, originalFrame.xMm);
  assert.equal(afterFit.main.frame.yMm, originalFrame.yMm);
  assert.equal(afterFit.main.frame.widthMm, originalFrame.widthMm);
  assert.notEqual(afterFit.main.frame.heightMm, originalFrame.heightMm);
  const semanticSnapshot = {
    frame: structuredClone(afterFit.main.frame),
    title: structuredClone(afterFit.main.table.title),
    annotations: structuredClone(afterFit.main.table.annotations),
    annotationIds: structuredClone(afterFit.main.table.annotationIds),
    legend: structuredClone(afterFit.main.table.legend),
    cells: structuredClone(afterFit.main.table.cells),
    assets: structuredClone(afterFit.document.assets),
  };

  const published = await publish(context, afterFit.document);
  assert.equal(published.report.status, 'READY', JSON.stringify(published.report.diagnostics));
  const publishedText = await published.page.locator('[data-editorial-root]').innerText();
  for (const expected of [
    'Tabela de calibração',
    'Legenda técnica extensa',
    'Nota técnica extensa',
    'Nota de rodapé extensa',
    'Alarme',
    'Bloqueio',
    'Parâmetro',
  ]) {
    assert(publishedText.includes(expected), expected);
  }
  const publishedImage = published.page.locator('[data-cell-id] img[data-asset-id="asset-ta25n"]');
  assert.equal(await publishedImage.count(), 1);
  assert.equal(await publishedImage.evaluate((node) => getComputedStyle(node).objectFit), 'contain');

  const pdfPath = resolve(output, 'w4f3-table-semantic-content.pdf');
  await published.page.emulateMedia({ media: 'print' });
  await published.page.pdf({
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
  for (const expected of [
    'Tabela de calibração',
    'Legenda técnica',
    'Nota técnica',
    'Nota de rodapé',
    'Alarme',
    'Bloqueio',
  ]) {
    assert(pdfText.includes(expected), `Missing PDF text: ${expected}`);
  }
  await pdf.destroy();
  await published.page.close();

  await saveAndReopen(page, ids);
  const reopened = await state(page);
  assert.deepEqual(reopened.main.frame, semanticSnapshot.frame);
  assert.deepEqual(reopened.main.table.title, semanticSnapshot.title);
  assert.deepEqual(reopened.main.table.annotations, semanticSnapshot.annotations);
  assert.deepEqual(reopened.main.table.annotationIds, semanticSnapshot.annotationIds);
  assert.deepEqual(reopened.main.table.legend, semanticSnapshot.legend);
  assert.deepEqual(reopened.main.table.cells, semanticSnapshot.cells);
  assert.deepEqual(reopened.document.assets, semanticSnapshot.assets);
  assert.equal(reopened.canUndo, false);
  assert.equal(reopened.main.table.id, originalTopology.tableId);
  assert.deepEqual(reopened.main.table.rows.map((row) => row.id), originalTopology.rowIds);
  assert.deepEqual(reopened.main.table.columns.map((column) => column.id), originalTopology.columnIds);
  assert.deepEqual(reopened.main.table.cells.map((cell) => cell.id), originalTopology.cellIds);

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
    const mobileIds = await mobilePage.evaluate(() => ({
      objectId: window.__W4F3_PROOF__.objectId,
    }));
    await selectObject(mobilePage, mobileIds.objectId);
    await setTitle(mobilePage, 'Título mobile', true);
    await setTitle(mobilePage, 'Título mobile revisado', true);
    await openSemanticPanel(mobilePage, true);
    await selectCell(mobilePage, 1, 1, true);
    const mobileNote = await createAnnotation(mobilePage, 'note', 'CELL', 'Nota mobile', true);
    const mobileFootnote = await createAnnotation(mobilePage, 'footnote', 'TABLE', 'Rodapé mobile', true);
    const mobileNoteEntry = mobilePage.locator(`[data-annotation-entry-id="${mobileNote.id}"]`);
    let seq = (await state(mobilePage)).localSequence;
    await mobileNoteEntry.locator('[data-editor-action="annotation-cell-reference"]').tap();
    await waitSequence(mobilePage, seq);
    seq = (await state(mobilePage)).localSequence;
    await mobileNoteEntry.locator('[data-editor-action="annotation-cell-reference"]').tap();
    await waitSequence(mobilePage, seq);
    await reorderAnnotation(mobilePage, mobileFootnote.id, 'up', true);
    await reorderLegend(mobilePage, 'w4f3-legend-a', 'down', true);

    const beforeMobileLocate = await state(mobilePage);
    await mobilePage.locator(
      '[data-legend-entry-id="w4f3-legend-a"] [data-editor-action="locate-legend-usage"]'
    ).tap();
    await settle(mobilePage);
    assert.equal((await state(mobilePage)).localSequence, beforeMobileLocate.localSequence);

    await selectCell(mobilePage, 1, 1, true);
    await setCellImage(mobilePage, { fit: 'contain', width: 22, height: 14 }, true);
    await setCellImage(mobilePage, { fit: 'cover', width: 23, height: 15 }, true);
    seq = (await state(mobilePage)).localSequence;
    await mobilePage.locator('[data-editor-action="clear-cell-image"]').tap();
    await waitSequence(mobilePage, seq);
    await setCellImage(mobilePage, { fit: 'contain', width: 24, height: 16 }, true);

    await mobilePage.locator('[data-editor-action="undo"]').tap();
    await settle(mobilePage);
    await mobilePage.locator('[data-editor-action="redo"]').tap();
    await settle(mobilePage);
    await mobilePage.locator('[data-editor-action="save"]').tap();
    await mobilePage.waitForFunction(
      () => !window.__W4F3_PROOF__.state().dirty,
      { timeout: 30000 }
    );
    const overflow = await assertNoGlobalOverflow(mobilePage, width);
    mobile.push({ width, viewport: overflow.viewport, documentWidth: overflow.documentWidth, bodyWidth: overflow.bodyWidth });
    await mobileContext.close();
  }
  assert.deepEqual(errors.consoleErrors, [], JSON.stringify(errors));
  assert.deepEqual(errors.pageErrors, [], JSON.stringify(errors));
  assert.deepEqual(errors.failedResources, [], JSON.stringify(errors));
  assert.deepEqual(errors.requestFailures, [], JSON.stringify(errors));

  const evidence = {
    status: 'PASS',
    chromiumVersion: browser.version(),
    title: { create: true, edit: true, undoRedo: true, render: true, measurement: true },
    annotations: {
      caption: true,
      note: true,
      footnote: true,
      tableReference: true,
      cellReference: true,
      reorder: true,
      numbering: true,
      detachReattach: true,
      referencedDeleteFailClosed: true,
      detachThenDelete: true,
    },
    legend: {
      reorder: true,
      renderedOrder: true,
      locateUsage: true,
      locateUsageZeroDocumentMutation: true,
      locateUsageZeroLocalSequence: true,
    },
    imageCell: {
      existingAsset: true,
      contain: true,
      cover: true,
      numericDimensions: true,
      replace: true,
      uploadBridge: true,
      clear: true,
      undoRedo: true,
    },
    w4e: {
      intrinsicGrowthOverflow: true,
      frameStableBeforeFit: true,
      noAutomaticFit: true,
      explicitFit: true,
    },
    persistence: { saveReopenExact: true, stableIdsTopology: true },
    publication: {
      ready: true,
      canonicalSemanticContent: true,
      imagePresent: true,
      nativePdfA4: true,
    },
    mobile: {
      widths: mobile,
      titleCreateEdit: true,
      semanticPanel: true,
      annotationCreate: true,
      attachDetach: true,
      annotationReorder: true,
      legendReorder: true,
      locateUsageNoHistory: true,
      imageContainCover: true,
      imageDimensions: true,
      imageReplaceRemove: true,
      undoRedoSave: true,
    },
    ...errors,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('W4.F.3 Table Semantic Content Chromium proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
