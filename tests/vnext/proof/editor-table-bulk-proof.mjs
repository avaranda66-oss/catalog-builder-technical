import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w4d-table-bulk-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W4D_PROOF_PORT ?? 5241);
const server = await createServer({
  root,
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  logLevel: 'error',
});
const editorUrl = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w4d-editor-browser.html`;
const publicationUrl = `http://127.0.0.1:${port}/src/labs/presys-editorial-proof/index.html?fixture=W2A`;
const MIME = 'application/x-presys-catalog-builder-vnext-table+json';
let browser;

const state = (page) => page.evaluate(() => window.__W4D_PROOF__.state());
const grid = (page) => page.locator('[data-table-grid-overlay]');
const cell = (table, id) => table.cells.find((entry) => entry.id === id);
const legend = (table, code) => table.legend.find((entry) => entry.markerCode === code);
const richText = (content) => content?.type === 'richText'
  ? content.value.paragraphs.map((p) => p.inlines.map((i) => i.kind === 'text' ? i.text : '\n').join('')).join('\n')
  : undefined;
const richIds = (content) => content?.type === 'richText'
  ? content.value.paragraphs.flatMap((p) => [p.id, ...p.inlines.map((i) => i.id)])
  : [];

async function settle(page) {
  await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
}
async function enterTable(page, objectId) {
  if (await grid(page).count()) {
    await page.locator('[data-editor-action="leave-table-grid"]').click();
    await grid(page).waitFor({ state: 'detached' });
  }
  await page.locator(`[data-editor-object-id="${objectId}"]`).click();
  await page.locator('[data-editor-action="edit-table"]').click();
  await grid(page).waitFor({ timeout: 15000 });
}
async function selectCell(page, row, column) {
  await page.locator(`[data-table-cell="${row}:${column}"]`).click();
  await settle(page);
}
async function selectRange(page, r1, c1, r2, c2) {
  await selectCell(page, r1, c1);
  await page.locator(`[data-table-cell="${r2}:${c2}"]`).click({ modifiers: ['Shift'] });
  await settle(page);
}
async function copyEvent(page) {
  return page.evaluate((mime) => {
    const target = document.querySelector('[data-table-grid-overlay]');
    if (!(target instanceof HTMLElement)) throw new Error('Missing Table Grid');
    const data = new DataTransfer();
    const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data });
    target.dispatchEvent(event);
    return {
      defaultPrevented: event.defaultPrevented,
      types: Array.from(data.types),
      plain: data.getData('text/plain'),
      typed: data.getData(mime),
    };
  }, MIME);
}
async function pasteEvent(page, { typed = '', plain = '' }) {
  await page.evaluate(({ mime, typedText, plainText }) => {
    const target = document.querySelector('[data-table-grid-overlay]');
    if (!(target instanceof HTMLElement)) throw new Error('Missing Table Grid');
    const data = new DataTransfer();
    if (typedText) data.setData(mime, typedText);
    data.setData('text/plain', plainText);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
    target.dispatchEvent(event);
    if (!event.defaultPrevented) throw new Error('Grid paste event was not owned');
  }, { mime: MIME, typedText: typed, plainText: plain });
  await settle(page);
}
async function publish(context, document) {
  const page = await context.newPage();
  watch(page);
  await page.goto(publicationUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.proof?.result !== undefined, { timeout: 30000 });
  const report = await page.evaluate((doc) => window.proof.runDocument(doc, 'W4D-BULK-AUTHORING-MARKERS'), document);
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
  browser = await chromium.launch({ headless: Boolean(process.env.CI || process.env.W4D_PROOF_HEADLESS) });
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
  assert.equal(initial.catalogId, 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
  assert.equal(initial.tableA.cells.length, 16);
  assert.equal(initial.tableB.cells.length, 16);

  // Actual Grid Copy: 2x2 semantic matrix, typed MIME, zero mutation/history/dirty/localSequence.
  await enterTable(page, initial.document.pages[0].objects[0].id);
  await selectRange(page, 0, 0, 1, 1);
  const copyBefore = await state(page);
  const copied = await copyEvent(page);
  const copyAfter = await state(page);
  assert.equal(copied.defaultPrevented, true);
  assert(copied.types.includes('text/plain'));
  assert(copied.types.includes(MIME));
  const payload = JSON.parse(copied.typed);
  assert.deepEqual({ version: payload.version, rows: payload.rows, columns: payload.columns }, { version: 1, rows: 2, columns: 2 });
  assert.deepEqual(payload.cells.map((entry) => entry.type), ['richText', 'technicalCode', 'measurement', 'marker']);
  assert.equal(copied.plain, 'Alpha bulk\tTC-SRC\n≥ 12.500 V\t*');
  assert(!copied.typed.includes('"style"'));
  assert(!copied.typed.includes('"cellId"'));
  assert.deepEqual(copyAfter.document, copyBefore.document);
  assert.equal(copyAfter.localSequence, copyBefore.localSequence);
  assert.equal(copyAfter.dirty, copyBefore.dirty);
  assert.equal(copyAfter.canUndo, copyBefore.canUndo);

  // Same-app typed paste into different Table: semantic types, fresh identities, style preservation, one history step.
  await enterTable(page, initial.document.pages[0].objects[1].id);
  await selectCell(page, 0, 0);
  const pasteBefore = await state(page);
  const beforeStyles = ['b-cell-0-0','b-cell-0-1','b-cell-1-0','b-cell-1-1'].map((id) => ({
    id, style: structuredClone(cell(pasteBefore.tableB, id).style), presentation: structuredClone(cell(pasteBefore.tableB, id).presentation),
  }));
  const sourceRichIds = richIds(cell(pasteBefore.tableA, 'a-cell-0-0').content);
  await pasteEvent(page, { typed: copied.typed, plain: copied.plain });
  const pasted = await state(page);
  assert.equal(pasted.localSequence, pasteBefore.localSequence + 1);
  assert.equal(richText(cell(pasted.tableB, 'b-cell-0-0').content), 'Alpha bulk');
  assert.equal(cell(pasted.tableB, 'b-cell-0-1').content.type, 'technicalCode');
  assert.equal(cell(pasted.tableB, 'b-cell-1-0').content.type, 'measurement');
  assert.equal(cell(pasted.tableB, 'b-cell-1-1').content.type, 'marker');
  const star = legend(pasted.tableB, '*');
  assert(star);
  assert.notEqual(star.id, 'w4d-src-star');
  assert.equal(cell(pasted.tableB, 'b-cell-1-1').content.legendEntryId, star.id);
  const destinationRichIds = richIds(cell(pasted.tableB, 'b-cell-0-0').content);
  assert(destinationRichIds.length > 0);
  assert(destinationRichIds.every((id) => !sourceRichIds.includes(id)));
  for (const before of beforeStyles) {
    assert.deepEqual(cell(pasted.tableB, before.id).style, before.style);
    assert.deepEqual(cell(pasted.tableB, before.id).presentation, before.presentation);
  }
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-table-grid-overlay')), true);
  await page.locator('[data-editor-action="undo"]').click();
  const pasteUndone = await state(page);
  assert.deepEqual(pasteUndone.tableB, pasteBefore.tableB);
  await page.locator('[data-editor-action="redo"]').click();
  const pasteRedone = await state(page);
  assert.deepEqual(pasteRedone.tableB, pasted.tableB);

  // External text/plain TSV: quotes, embedded TAB/newline, escaped quote, empty; never guesses Measurement/Marker.
  await selectCell(page, 2, 0);
  const external = '"A\tB"\t"Line1\nLine2"\r\n"Quote ""ok"""\t';
  await pasteEvent(page, { plain: external });
  const externalState = await state(page);
  assert.equal(richText(cell(externalState.tableB, 'b-cell-2-0').content), 'A\tB');
  assert.equal(richText(cell(externalState.tableB, 'b-cell-2-1').content), 'Line1\nLine2');
  assert.equal(richText(cell(externalState.tableB, 'b-cell-3-0').content), 'Quote "ok"');
  assert.equal(cell(externalState.tableB, 'b-cell-3-1').content.type, 'empty');
  await selectCell(page, 0, 2);
  await pasteEvent(page, { plain: '12.5 V\t*' });
  const noGuess = await state(page);
  assert.equal(cell(noGuess.tableB, 'b-cell-0-2').content.type, 'richText');
  assert.equal(richText(cell(noGuess.tableB, 'b-cell-0-2').content), '12.5 V');
  assert.equal(cell(noGuess.tableB, 'b-cell-0-3').content.type, 'richText');
  assert.equal(richText(cell(noGuess.tableB, 'b-cell-0-3').content), '*');

  // Visible Father-facing paste fallback uses the same canonical bulk action.
  await selectCell(page, 0, 2);
  const fallbackBefore = await state(page);
  await page.locator('[data-editor-action="paste-table-cells"]').click();
  await page.locator('[data-table-paste-textarea]').fill('Fallback\tTSV');
  await page.locator('[data-editor-action="apply-native-table-paste"]').click();
  await settle(page);
  const fallbackAfter = await state(page);
  assert.equal(fallbackAfter.localSequence, fallbackBefore.localSequence + 1);
  assert.equal(richText(cell(fallbackAfter.tableB, 'b-cell-0-2').content), 'Fallback');
  assert.equal(richText(cell(fallbackAfter.tableB, 'b-cell-0-3').content), 'TSV');
  assert.equal(await page.locator('[data-table-paste-fallback]').count(), 0);

  // Native input authority: Backspace edits fallback text only, never canonical Table state.
  await page.locator('[data-editor-action="paste-table-cells"]').click();
  const inputBefore = await state(page);
  const fallbackInput = page.locator('[data-table-paste-textarea]');
  await fallbackInput.fill('ABC');
  await fallbackInput.press('Backspace');
  assert.equal(await fallbackInput.inputValue(), 'AB');
  const inputAfter = await state(page);
  assert.deepEqual(inputAfter.document, inputBefore.document);
  assert.equal(inputAfter.localSequence, inputBefore.localSequence);
  await page.locator('[data-editor-action="cancel-native-table-paste"]').click();

  // Cross-Table Marker scenario 2: equivalent code/text reuses destination Legend ID.
  await enterTable(page, initial.document.pages[0].objects[0].id);
  await selectCell(page, 1, 3);
  const hashCopy = await copyEvent(page);
  await enterTable(page, initial.document.pages[0].objects[1].id);
  await selectCell(page, 2, 2);
  const hashBefore = await state(page);
  await pasteEvent(page, { typed: hashCopy.typed, plain: hashCopy.plain });
  const hashAfter = await state(page);
  assert.equal(hashAfter.localSequence, hashBefore.localSequence + 1);
  assert.equal(cell(hashAfter.tableB, 'b-cell-2-2').content.legendEntryId, 'w4d-dest-hash');
  assert.equal(hashAfter.tableB.legend.filter((entry) => entry.markerCode === '#').length, 1);

  // Cross-Table conflict: same code, different meaning fails atomically.
  await enterTable(page, initial.document.pages[0].objects[0].id);
  await selectCell(page, 3, 0);
  const bangCopy = await copyEvent(page);
  await enterTable(page, initial.document.pages[0].objects[1].id);
  await selectCell(page, 2, 3);
  const conflictBefore = await state(page);
  await pasteEvent(page, { typed: bangCopy.typed, plain: bangCopy.plain });
  const conflictAfter = await state(page);
  assert.deepEqual(conflictAfter.document, conflictBefore.document);
  assert.equal(conflictAfter.localSequence, conflictBefore.localSequence);
  assert((await page.getByRole('status').innerText()).includes('outro significado'));

  // Repeated foreign Markers create ONE destination Legend and never install source ID.
  await enterTable(page, initial.document.pages[0].objects[0].id);
  await selectRange(page, 2, 2, 2, 3);
  const caretCopy = await copyEvent(page);
  await enterTable(page, initial.document.pages[0].objects[1].id);
  await selectCell(page, 3, 2);
  const caretBefore = await state(page);
  await pasteEvent(page, { typed: caretCopy.typed, plain: caretCopy.plain });
  const caretAfter = await state(page);
  assert.equal(caretAfter.localSequence, caretBefore.localSequence + 1);
  const caretLegends = caretAfter.tableB.legend.filter((entry) => entry.markerCode === '^');
  assert.equal(caretLegends.length, 1);
  assert.notEqual(caretLegends[0].id, 'w4d-src-caret');
  assert.equal(cell(caretAfter.tableB, 'b-cell-3-2').content.legendEntryId, caretLegends[0].id);
  assert.equal(cell(caretAfter.tableB, 'b-cell-3-3').content.legendEntryId, caretLegends[0].id);

  // Merged topology: matrix crossing span blocked; scalar to one semantic owner writes anchor once.
  await enterTable(page, initial.document.pages[0].objects[0].id);
  await selectRange(page, 2, 0, 2, 2);
  const mergeBlockedBefore = await state(page);
  await pasteEvent(page, { plain: 'X\tY\tZ' });
  const mergeBlockedAfter = await state(page);
  assert.deepEqual(mergeBlockedAfter.document, mergeBlockedBefore.document);
  assert.equal(mergeBlockedAfter.localSequence, mergeBlockedBefore.localSequence);
  assert((await page.getByRole('status').innerText()).includes('mescladas'));

  // An explicit range covering exactly one merged span is still a multi-slot selection.
  await selectRange(page, 2, 0, 2, 1);
  const exactMergedRangeBefore = await state(page);
  await pasteEvent(page, { plain: 'RANGE-MERGE' });
  const exactMergedRangeAfter = await state(page);
  assert.deepEqual(exactMergedRangeAfter.document, exactMergedRangeBefore.document);
  assert.equal(exactMergedRangeAfter.localSequence, exactMergedRangeBefore.localSequence);
  assert((await page.getByRole('status').innerText()).includes('mescladas'));

  await selectCell(page, 2, 0);
  const scalarBefore = await state(page);
  await pasteEvent(page, { plain: 'MERGED-W4D' });
  const scalarAfter = await state(page);
  assert.equal(scalarAfter.localSequence, scalarBefore.localSequence + 1);
  assert.equal(richText(cell(scalarAfter.tableA, 'a-cell-2-0').content), 'MERGED-W4D');
  assert.deepEqual(cell(scalarAfter.tableA, 'a-cell-2-0').span, { rows: 1, columns: 2 });
  assert.equal(cell(scalarAfter.tableA, 'a-cell-2-1').coveredBy, 'a-cell-2-0');

  // Mixed Image clear fails atomically.
  await selectRange(page, 3, 2, 3, 3);
  const imageBefore = await state(page);
  await page.locator('[data-editor-action="clear-table-cells"]').click();
  await settle(page);
  const imageAfter = await state(page);
  assert.deepEqual(imageAfter.document, imageBefore.document);
  assert.equal(imageAfter.localSequence, imageBefore.localSequence);
  assert((await page.getByRole('status').innerText()).includes('imagem'));

  // Bulk clear ordinary content: content only, annotations/style/topology preserved, one history step, Undo/Redo exact.
  await enterTable(page, initial.document.pages[0].objects[1].id);
  await selectRange(page, 2, 0, 2, 1);
  const clearBefore = await state(page);
  const clearStyle = ['b-cell-2-0','b-cell-2-1'].map((id) => ({
    id, style: structuredClone(cell(clearBefore.tableB, id).style), presentation: structuredClone(cell(clearBefore.tableB, id).presentation),
    annotationIds: structuredClone(cell(clearBefore.tableB, id).annotationIds),
  }));
  await page.locator('[data-editor-action="clear-table-cells"]').click();
  await settle(page);
  const cleared = await state(page);
  assert.equal(cleared.localSequence, clearBefore.localSequence + 1);
  assert.equal(cell(cleared.tableB, 'b-cell-2-0').content.type, 'empty');
  assert.equal(cell(cleared.tableB, 'b-cell-2-1').content.type, 'empty');
  assert.deepEqual(cleared.tableB.annotations, clearBefore.tableB.annotations);
  for (const before of clearStyle) {
    assert.deepEqual(cell(cleared.tableB, before.id).style, before.style);
    assert.deepEqual(cell(cleared.tableB, before.id).presentation, before.presentation);
    assert.deepEqual(cell(cleared.tableB, before.id).annotationIds, before.annotationIds);
  }
  await page.locator('[data-editor-action="undo"]').click();
  assert.deepEqual((await state(page)).tableB, clearBefore.tableB);
  await page.locator('[data-editor-action="redo"]').click();
  assert.deepEqual((await state(page)).tableB, cleared.tableB);

  // Existing Marker assignment, shared Legend edit semantics, in-use delete safety, detach then explicit delete.
  const starLive = legend((await state(page)).tableB, '*');
  assert(starLive);
  await selectCell(page, 1, 2);
  await page.locator('[data-editor-action="marker-panel"]').click();
  await page.locator('[data-marker-legend-panel]').waitFor();
  await page.locator('[data-marker-picker]').selectOption(starLive.id);
  const assignBefore = await state(page);
  await page.locator('[data-editor-action="apply-existing-marker"]').click();
  await settle(page);
  const assigned = await state(page);
  assert.equal(assigned.localSequence, assignBefore.localSequence + 1);
  assert.equal(cell(assigned.tableB, 'b-cell-1-1').content.legendEntryId, starLive.id);
  assert.equal(cell(assigned.tableB, 'b-cell-1-2').content.legendEntryId, starLive.id);
  const row = page.locator(`[data-legend-entry-id="${starLive.id}"]`);
  assert((await row.innerText()).includes('2 uso(s)'));
  await row.locator(`[data-legend-text="${starLive.id}"]`).fill('Opcional atualizado');
  await row.locator('[data-editor-action="update-legend"]').click();
  await settle(page);
  const textUpdated = await state(page);
  assert.equal(cell(textUpdated.tableB, 'b-cell-1-1').content.legendEntryId, starLive.id);
  assert.equal(cell(textUpdated.tableB, 'b-cell-1-2').content.legendEntryId, starLive.id);
  await row.locator(`[data-legend-marker-code="${starLive.id}"]`).fill('§');
  await row.locator('[data-editor-action="update-legend"]').click();
  await settle(page);
  const codeUpdated = await state(page);
  assert.equal(codeUpdated.tableB.legend.find((entry) => entry.id === starLive.id).markerCode, '§');
  assert.equal(cell(codeUpdated.tableB, 'b-cell-1-1').content.legendEntryId, starLive.id);
  const removeInUse = row.locator('[data-editor-action="remove-legend"]');
  assert.equal(await removeInUse.isDisabled(), true);
  assert((await removeInUse.getAttribute('title')).includes('2 célula(s)'));
  await selectRange(page, 1, 1, 1, 2);
  await page.locator('[data-editor-action="detach-marker"]').click();
  await settle(page);
  const detached = await state(page);
  assert.equal(cell(detached.tableB, 'b-cell-1-1').content.type, 'empty');
  assert.equal(cell(detached.tableB, 'b-cell-1-2').content.type, 'empty');
  const detachedRow = page.locator(`[data-legend-entry-id="${starLive.id}"]`);
  assert((await detachedRow.innerText()).includes('0 uso(s)'));
  const deleteBefore = await state(page);
  await detachedRow.locator('[data-editor-action="remove-legend"]').click();
  await settle(page);
  const deleted = await state(page);
  assert.equal(deleted.localSequence, deleteBefore.localSequence + 1);
  assert.equal(deleted.tableB.legend.some((entry) => entry.id === starLive.id), false);
  await page.locator('[data-editor-action="undo"]').click();
  assert((await state(page)).tableB.legend.some((entry) => entry.id === starLive.id));
  await page.locator('[data-editor-action="redo"]').click();
  assert.equal((await state(page)).tableB.legend.some((entry) => entry.id === starLive.id), false);

  // Create + assign is one action/history transition; Undo/Redo restores Legend + Marker identities together.
  await selectRange(page, 1, 1, 1, 2);
  await page.locator('[data-editor-action="marker-panel"]').click();
  await page.locator('[data-new-marker-code]').fill('†');
  await page.locator('[data-new-marker-text]').fill('Sob consulta');
  const createAssignBefore = await state(page);
  await page.locator('[data-editor-action="create-and-assign-marker"]').click();
  await settle(page);
  const createAssigned = await state(page);
  assert.equal(createAssigned.localSequence, createAssignBefore.localSequence + 1);
  const dagger = legend(createAssigned.tableB, '†');
  assert(dagger);
  assert.equal(cell(createAssigned.tableB, 'b-cell-1-1').content.legendEntryId, dagger.id);
  assert.equal(cell(createAssigned.tableB, 'b-cell-1-2').content.legendEntryId, dagger.id);
  await page.locator('[data-editor-action="undo"]').click();
  const createAssignUndone = await state(page);
  assert.equal(createAssignUndone.tableB.legend.some((entry) => entry.id === dagger.id), false);
  assert.deepEqual(cell(createAssignUndone.tableB, 'b-cell-1-1').content, cell(createAssignBefore.tableB, 'b-cell-1-1').content);
  await page.locator('[data-editor-action="redo"]').click();
  const createAssignRedone = await state(page);
  assert.deepEqual(createAssignRedone.tableB, createAssigned.tableB);

  // Save/reopen exact canonical state and IDs.
  assert.equal(createAssignRedone.dirty, true);
  const savedShape = structuredClone({ tableA: createAssignRedone.tableA, tableB: createAssignRedone.tableB });
  await page.locator('[data-editor-action="save"]').click();
  await page.waitForFunction(() => {
    const s = window.__W4D_PROOF__.state();
    return !s.dirty && s.savePhase === 'idle';
  });
  await page.evaluate(() => window.__W4D_PROOF__.reopen(window.__W4D_PROOF__.otherId));
  await page.waitForFunction(() => window.__W4D_PROOF__.state().catalogId === window.__W4D_PROOF__.otherId);
  await page.evaluate(() => window.__W4D_PROOF__.reopen(window.__W4D_PROOF__.primaryId));
  await page.waitForFunction(() => window.__W4D_PROOF__.state().catalogId === window.__W4D_PROOF__.primaryId);
  const reopened = await state(page);
  assert.deepEqual(reopened.tableA, savedShape.tableA);
  assert.deepEqual(reopened.tableB, savedShape.tableB);

  // Mobile functional proof at all frozen widths.
  const mobile = [];
  for (const width of [320, 360, 390]) {
    const mp = await context.newPage();
    watch(mp);
    await mp.setViewportSize({ width, height: 900 });
    await mp.goto(editorUrl, { waitUntil: 'domcontentloaded' });
    await mp.locator('[data-vnext-shell]').waitFor();
    const ms = await state(mp);
    await enterTable(mp, ms.document.pages[0].objects[1].id);
    await selectRange(mp, 0, 0, 0, 1);
    for (const action of ['copy-table-cells','paste-table-cells','clear-table-cells','marker-panel','legend-panel']) {
      const button = mp.locator(`[data-editor-action="${action}"]`);
      await button.scrollIntoViewIfNeeded();
      assert(await button.isVisible(), `${action} must be visible at ${width}px`);
    }
    const mobileCopyBefore = await state(mp);
    await mp.locator('[data-editor-action="copy-table-cells"]').click();
    await settle(mp);
    const copyStatus = await mp.getByRole('status').innerText();
    const mobileCopyAfter = await state(mp);
    assert.deepEqual(mobileCopyAfter.document, mobileCopyBefore.document);
    assert.equal(mobileCopyAfter.localSequence, mobileCopyBefore.localSequence);
    assert(
      copyStatus.includes('TSV copiado')
      || copyStatus.includes('não está disponível')
      || copyStatus.includes('não permitiu copiar'),
      `Visible Copy must report success or a truthful browser restriction at ${width}px: ${copyStatus}`
    );
    await mp.locator('[data-editor-action="paste-table-cells"]').click();
    const area = mp.locator('[data-table-paste-textarea]');
    await area.scrollIntoViewIfNeeded();
    assert(await area.isVisible());
    await area.fill('MOBILE-A\tMOBILE-B');
    await mp.locator('[data-editor-action="apply-native-table-paste"]').click();
    await settle(mp);
    let mstate = await state(mp);
    assert.equal(richText(cell(mstate.tableB, 'b-cell-0-0').content), 'MOBILE-A');
    assert.equal(richText(cell(mstate.tableB, 'b-cell-0-1').content), 'MOBILE-B');
    await mp.locator('[data-editor-action="clear-table-cells"]').click();
    await settle(mp);
    mstate = await state(mp);
    assert.equal(cell(mstate.tableB, 'b-cell-0-0').content.type, 'empty');
    await mp.locator('[data-editor-action="marker-panel"]').click();
    await mp.locator('[data-marker-legend-panel]').scrollIntoViewIfNeeded();
    assert(await mp.locator('[data-marker-legend-panel]').isVisible());
    await mp.locator('[data-new-marker-code]').fill(`M${width}`);
    await mp.locator('[data-new-marker-text]').fill('Marcador mobile');
    await mp.locator('[data-editor-action="create-and-assign-marker"]').click();
    await settle(mp);
    mstate = await state(mp);
    assert.equal(cell(mstate.tableB, 'b-cell-0-0').content.type, 'marker');
    const undo = mp.locator('[data-editor-action="undo"]');
    const redo = mp.locator('[data-editor-action="redo"]');
    await undo.scrollIntoViewIfNeeded();
    assert(await undo.isVisible());
    await undo.click();
    await redo.scrollIntoViewIfNeeded();
    assert(await redo.isVisible());
    await redo.click();
    const save = mp.locator('[data-editor-action="save"]');
    await save.scrollIntoViewIfNeeded();
    assert(await save.isVisible());
    await save.click();
    await mp.waitForFunction(() => !window.__W4D_PROOF__.state().dirty);
    const overflow = await mp.evaluate(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    assert(overflow.documentWidth <= overflow.viewport);
    assert(overflow.bodyWidth <= overflow.viewport);
    mobile.push({ width, ...overflow, copy: true, pasteFallback: true, clear: true, marker: true, legend: true, save: true, undo: true, redo: true });
    await mp.close();
  }

  // Canonical publication and native Chromium PDF + PDF.js semantic extraction.
  const { page: publicationPage, report } = await publish(context, reopened.document);
  assert.equal(report.status, 'READY', JSON.stringify(report.diagnostics));
  assert.deepEqual(report.diagnostics.filter((entry) => entry.severity === 'ERROR'), []);
  const publicationFacts = await publicationPage.evaluate(() => ({
    editorChrome: document.querySelectorAll('[data-editorial-root] [data-editor-action], [data-editorial-root] [data-editor-overlay], [data-editorial-root] [data-table-grid-overlay]').length,
    text: document.querySelector('[data-editorial-root]')?.textContent ?? '',
  }));
  assert.equal(publicationFacts.editorChrome, 0);
  assert(publicationFacts.text.includes('Alpha bulk'));
  assert(publicationFacts.text.includes('†'));
  assert(publicationFacts.text.includes('Sob consulta'));
  const beforePdf = await publicationPage.evaluate(() => window.proof.beforeExport());
  const pdfPath = resolve(output, 'w4d-bulk-authoring-markers.pdf');
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
  assert(pdf.text.includes('Alpha bulk'));
  assert(pdf.text.includes('†'));
  assert(pdf.text.includes('Sob consulta'));
  assert(pdf.vectorPathCount > 0);

  assert.deepEqual(consoleErrors, [], JSON.stringify({ consoleErrors, pageErrors, failedResources, requestFailures }));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedResources, []);
  assert.deepEqual(requestFailures, []);

  const evidence = {
    status: 'PASS',
    chromiumVersion: browser.version(),
    controlledPersistence: true,
    productionSupabaseE2E: false,
    clipboard: {
      plain: copied.plain,
      payloadVersion: payload.version,
      payloadTypes: payload.cells.map((entry) => entry.type),
      zeroMutation: true,
    },
    typedPaste: {
      oneHistoryTransition: true,
      freshRichTextIds: true,
      stylePreserved: true,
      crossTableFreshLegend: true,
    },
    externalTsv: {
      quoted: true,
      embeddedTab: true,
      embeddedNewline: true,
      escapedQuote: true,
      emptyField: true,
      noSemanticGuessing: true,
    },
    merge: {
      matrixBlockedAtomically: true,
      scalarOwnerWritesOnce: true,
      topologyPreserved: true,
    },
    imageBoundary: { mixedClearBlockedAtomically: true },
    markerLegend: {
      equivalentReuse: true,
      conflictBlocked: true,
      repeatedSourceOneLegend: true,
      sharedUpdate: true,
      inUseDeleteDisabled: true,
      detachThenDelete: true,
      createAssignAtomic: true,
    },
    persistence: { saveReopenExact: true, idsPreserved: true },
    mobile,
    publication: { status: report.status, diagnostics: report.diagnostics, ...publicationFacts },
    pdf,
    consoleErrors,
    pageErrors,
    failedResources,
    requestFailures,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('W4.D Chromium Bulk Authoring / TSV / Clipboard / Markers proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await publicationPage.close();
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
