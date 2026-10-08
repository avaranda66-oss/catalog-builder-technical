import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = process.env.FATHER_LARGE_OUTPUT ?? resolve(root, 'scratch/father-large-catalog-proof');
const matrixOnly = process.env.FATHER_TABLE_MATRIX_ONLY === '1';
await mkdir(output, { recursive: true });
const records = new Map();
const counters = { seeds: 0, saves: 0, gets: 0 };
const json = (res, data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5281, strictPort: true }, logLevel: 'error', plugins: [{ name: 'father-controlled-repository', configureServer(dev) { dev.middlewares.use(async (req, res, next) => {
  const path = req.url?.split('?')[0];
  if (!path?.startsWith('/__father/')) return next();
  if (path.startsWith('/__father/record/')) { counters.gets++; return json(res, records.get(path.slice('/__father/record/'.length)) ?? null); }
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (path === '/__father/seed') { counters.seeds++; records.set(body.catalogId, body); return json(res, { ok: true }); }
  if (path === '/__father/save') {
    const before = records.get(body.catalogId);
    if (!before || before.remoteRevision !== body.expectedRemoteRevision) return json(res, { ok: false, error: { code: 'CONFLICT' } });
    counters.saves++;
    const value = { ...before, remoteRevision: before.remoteRevision + 1, lastMutationId: body.mutationId, title: body.documentSnapshot.title, locale: body.documentSnapshot.locale, documentSnapshot: body.documentSnapshot };
    records.set(body.catalogId, value); return json(res, { ok: true, value });
  }
  next();
}); } }] });
const url = level => `http://127.0.0.1:5281/tests/vnext/proof/fixtures/father-large-catalog-browser.html?level=${level}`;
const state = page => page.evaluate(() => window.__FATHER_LARGE__.state());
const saved = page => page.waitForFunction(() => { const s = window.__FATHER_LARGE__.state(); return !s.dirty && !['PREPARING', 'SAVING', 'VERIFYING'].includes(s.phase); });
const results = { result: 'RUNNING', infrastructure: 'Local HTTP repository adapter + real product session/editor/publication; no authenticated Supabase or Gemini proof', datasets: [], browsers: {}, errors: [] };
let browser;
const watch = page => { page.on('pageerror', error => results.errors.push(error.message)); page.on('console', event => { if (event.type() === 'error') results.errors.push(event.text()); }); };
async function publish(page, name, pages) {
  await page.getByRole('button', { name: 'Publicar / PDF', exact: true }).click();
  await page.locator('[data-publication-status="READY"]').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('[data-publication-host] [data-page-id]').count(), pages);
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator('[data-publication-action="print"]').click();
  await page.waitForFunction(() => document.querySelector('[data-publication-host]')?.dataset.printApproved === 'true');
  await page.emulateMedia({ media: 'print' });
  const path = resolve(output, `${name}.pdf`);
  await page.pdf({ path, format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  const pdf = await getDocument({ data: new Uint8Array(await readFile(path)), useSystemFonts: true }).promise;
  assert.equal(pdf.numPages, pages);
  const texts = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const sheet = await pdf.getPage(p); const viewport = sheet.getViewport({ scale: 1 });
    assert(Math.abs(viewport.width - 595.28) < 1); assert(Math.abs(viewport.height - 841.89) < 1);
    texts.push((await sheet.getTextContent()).items.map(item => item.str).join(' '));
  }
  const all = texts.join(' ');
  for (const token of ['PRESYS', '±', '°C', 'Ω', 'Ø', '×', 'CH-']) assert(all.includes(token), `PDF missing ${token}`);
  const proof = { path, pages: pdf.numPages, bytes: (await readFile(path)).length, symbolsPreserved: true, textCharacters: all.length };
  await pdf.destroy(); await page.emulateMedia({ media: 'screen' });
  await page.screenshot({ path: resolve(output, `${name}-publication.png`), fullPage: true });
  await page.getByRole('button', { name: 'Voltar ao editor', exact: true }).click();
  return proof;
}
async function benchmark(page) {
  return page.evaluate(async () => {
    const { normalizeTableSelection, tableCellSelection, tableSelectionIdentity } = await import('/src/vnext/editor/table-selection.ts');
    const { fatherTable } = await import('/tests/vnext/proof/fixtures/father-large-catalog-data.ts');
    return [[2,2],[5,5],[10,10],[20,10],[50,8],[110,8]].map(([rows, columns]) => {
      const table = fatherTable('benchmark', rows, columns);
      const selection = tableCellSelection(tableSelectionIdentity('p', 'o', 'benchmark'), { rowId: table.rows[0].id, columnId: table.columns[0].id });
      const samplesMs = []; for (let n = 0; n < 8; n++) { const start = performance.now(); normalizeTableSelection(table, selection); samplesMs.push(performance.now() - start); }
      return { rows, columns, cells: table.cells.length, samplesMs, medianMs: [...samplesMs].sort((a,b) => a-b)[4] };
    });
  });
}
const currentTable = async page => (await state(page)).document.pages[0].objects.find(object => object.type === 'table').table;
const waitRows = (page, rows) => page.waitForFunction(count => window.__FATHER_LARGE__.state().document.pages[0].objects.find(object => object.type === 'table').table.rows.length === count, rows);
const waitChange = (page, sequence) => page.waitForFunction(before => window.__FATHER_LARGE__.state().sequence > before, sequence);
async function tableMatrix(level, rows, columns) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } }); watch(page);
  await page.goto(url(level), { waitUntil: 'networkidle' }); await page.locator('[data-vnext-shell]').waitFor();
  const initial = await currentTable(page); assert.equal(initial.rows.length, rows); assert.equal(initial.columns.length, columns);
  await page.locator('[data-editor-object-id$="-table"]').click(); await page.locator('[data-editor-action="edit-table"]').click();
  await page.locator('[data-table-grid-overlay]').waitFor(); await page.locator('[data-editor-action="toggle-table-options"]').click();
  await page.locator('[data-table-row-selector="1"]').click(); await page.locator('[data-table-row-count]').fill('3');
  const start = performance.now(); await page.locator('[data-editor-action="insert-rows-after"]').click(); await waitRows(page, rows + 3);
  const insert3RowsMs = performance.now() - start, inserted = await currentTable(page);
  assert.equal(inserted.cells.length, (rows + 3) * columns);
  await page.locator('[data-table-row-selector="2"]').click(); await page.locator('[data-editor-action="remove-row"]').click(); await waitRows(page, rows + 2);
  await page.locator('[data-editor-action="undo"]').click(); await waitRows(page, rows + 3); assert.deepEqual(await currentTable(page), inserted);
  // Removal accepts one selected row. Verify the multi-selection guard before two sequential removals.
  await page.locator('[data-table-row-selector="2"]').click();
  await page.locator('[data-table-row-selector="3"]').click({ modifiers: ['Shift'] });
  const beforeMultiRemove = (await state(page)).sequence;
  assert.equal(await page.locator('[data-editor-action="remove-row"]').isEnabled(), false);
  assert.equal(await page.locator('[data-editor-action="remove-row"]').getAttribute('title'), 'Selecione uma única linha pelo seletor lateral.');
  assert.equal((await state(page)).sequence, beforeMultiRemove);
  assert.deepEqual(await currentTable(page), inserted);
  await page.locator('[data-table-row-selector="2"]').click();
  await page.locator('[data-editor-action="remove-row"]').click(); await waitRows(page, rows + 2);
  const firstRemoved = await currentTable(page);
  assert.equal((await state(page)).sequence, beforeMultiRemove + 1);
  await page.locator('[data-table-row-selector="2"]').click();
  await page.locator('[data-editor-action="remove-row"]').click(); await waitRows(page, rows + 1);
  assert.equal((await state(page)).sequence, beforeMultiRemove + 2);
  const multiRemoved = await currentTable(page);
  assert.equal(multiRemoved.cells.length, (rows + 1) * columns);
  assert.deepEqual(multiRemoved.rows.map(row => row.id), inserted.rows.filter((_, index) => index !== 2 && index !== 3).map(row => row.id));
  await page.locator('[data-editor-action="undo"]').click(); await waitRows(page, rows + 2); assert.deepEqual(await currentTable(page), firstRemoved);
  await page.locator('[data-editor-action="undo"]').click(); await waitRows(page, rows + 3); assert.deepEqual(await currentTable(page), inserted);
  await page.locator('[data-editor-action="redo"]').click(); await waitRows(page, rows + 2); assert.deepEqual(await currentTable(page), firstRemoved);
  await page.locator('[data-editor-action="redo"]').click(); await waitRows(page, rows + 1); assert.deepEqual(await currentTable(page), multiRemoved);
  await page.locator('[data-editor-action="undo"]').click(); await waitRows(page, rows + 2); assert.deepEqual(await currentTable(page), firstRemoved);
  await page.locator('[data-editor-action="undo"]').click(); await waitRows(page, rows + 3); assert.deepEqual(await currentTable(page), inserted);
  await page.locator('[data-editor-action="undo"]').click(); await waitRows(page, rows); assert.deepEqual(await currentTable(page), initial);
  await page.locator('[data-editor-action="redo"]').click(); await waitRows(page, rows + 3); assert.deepEqual(await currentTable(page), inserted);
  await page.locator('[data-editor-action="undo"]').click(); await waitRows(page, rows); assert.deepEqual(await currentTable(page), initial);
  await page.locator('[data-table-cell="0:0"]').click(); await page.locator('[data-editor-action="paste-table-cells"]').click();
  await page.locator('[data-table-paste-textarea]').fill('Canal\tSinal\nCH-001\t±0,1 °C');
  let sequence = (await state(page)).sequence; await page.locator('[data-editor-action="apply-native-table-paste"]').click(); await waitChange(page, sequence);
  const pasted = await currentTable(page), firstBody = pasted.cells.find(cell => cell.rowId === pasted.rows[1].id && cell.columnId === pasted.columns[1].id);
  assert.equal(firstBody.content.type, 'richText'); assert.equal(firstBody.content.value.paragraphs[0].inlines[0].text, '±0,1 °C');
  await page.locator('[data-editor-action="undo"]').click(); assert.deepEqual(await currentTable(page), initial);
  await page.locator('[data-editor-action="redo"]').click(); assert.deepEqual(await currentTable(page), pasted);
  await page.locator('[data-table-row-selector="0"]').click(); await page.locator('[data-editor-action="toggle-table-inspector-advanced"]').click();
  sequence = (await state(page)).sequence; await page.locator('[data-row-property="height-mode"]').selectOption('MIN_MM'); await waitChange(page, sequence);
  sequence = (await state(page)).sequence; await page.locator('[data-row-property="height-mm"]').fill('12'); await page.locator('[data-row-property="height-mm"]').blur(); await waitChange(page, sequence);
  assert.deepEqual((await currentTable(page)).rows[0].heightPolicy, { mode: 'MIN_MM', minMm: 12 });
  await page.locator('[data-table-column-selector="1"]').click();
  sequence = (await state(page)).sequence; await page.locator('[data-column-property="width-mode"]').selectOption('fixed'); await waitChange(page, sequence);
  sequence = (await state(page)).sequence; await page.locator('[data-column-property="fixed-mm"]').fill('20'); await page.locator('[data-column-property="fixed-mm"]').blur(); await waitChange(page, sequence);
  assert.deepEqual((await currentTable(page)).columns[1].width, { mode: 'fixed', mm: 20 });
  await page.locator('[data-editor-action="save"]').click(); await saved(page); const beforeReopen = (await state(page)).document;
  await page.evaluate(() => window.__FATHER_LARGE__.reopen()); assert.deepEqual((await state(page)).document, beforeReopen);
  let pdf;
  if (rows <= 10) pdf = await publish(page, `${level}-matrix-chromium`, 1);
  else {
    await page.getByRole('button', { name: 'Publicar / PDF', exact: true }).click(); await page.locator('[data-publication-status="BLOCKED"]').waitFor();
    assert.equal(await page.locator('[data-publication-action="print"]').isEnabled(), false);
    assert(await page.locator('[data-publication-diagnostic="TABLE_CONTENT_OVERFLOW"]').count() > 0);
    await page.screenshot({ path: resolve(output, `${level}-matrix-blocked.png`), fullPage: true });
  }
  await page.close();
  return { rows, columns, insert3RowsMs, batchInsert: true, removeRow: true, multiRowRemoveMode: 'two sequential single-row actions', multiRowRemoveGuard: true, atomicUndoRedo: true, tsvPaste: true,
    rowResize: true, columnResize: true, savedReopenedExact: true, publication: pdf ? 'READY' : 'BLOCKED — oversized single A4 table', pdf };
}
try {
  await server.listen(); browser = await chromium.launch({ headless: true });
  for (const level of matrixOnly ? [] : ['small', 'medium', 'large']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } }); watch(page);
    const start = performance.now(); await page.goto(url(level), { waitUntil: 'networkidle' }); await page.locator('[data-vnext-shell]').waitFor();
    const openMs = performance.now() - start, initial = await state(page);
    const title = `${level} revisado · PRESYS ±0,1 °C`;
    await page.locator('[data-editor-object-id$="-title"]').click(); await page.locator('[data-editor-object-id$="-title"]').press('Enter');
    await page.locator('[data-text-edit-textarea]').fill(title); await page.locator('[data-editor-action="commit-text"]').click();
    const saveStart = performance.now(); await saved(page); const saveMs = performance.now() - saveStart;
    const before = (await state(page)).document; const reopenStart = performance.now(); await page.evaluate(() => window.__FATHER_LARGE__.reopen()); await page.locator('[data-vnext-shell]').waitFor();
    const reopenMs = performance.now() - reopenStart; assert.deepEqual((await state(page)).document, before);
    assert.equal(await page.locator('[data-editorial-root] img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth === 720)), true);
    const pdf = await publish(page, `${level}-chromium`, initial.document.pages.length);
    const objects = initial.document.pages.flatMap(p => p.objects), tables = objects.filter(o => o.type === 'table');
    results.datasets.push({ level, pages: initial.document.pages.length, objects: objects.length, tables: tables.length, largestTable: Math.max(...tables.map(o => o.table.rows.length)), cells: tables.reduce((n,o) => n+o.table.cells.length,0), assets: initial.document.assets.length, documentBytes: Buffer.byteLength(JSON.stringify(before)), openMs, saveMs, reopenMs, exactReopen: true, pdf });
    if (level === 'large') {
      results.benchmarkAfter = await benchmark(page);
      // A visible overlap must be blocked, then repair through actual object movement and republish.
      const moved = await page.evaluate(async () => { const { mmToU } = await import('/src/vnext/domain/physical.ts'); const s = window.__FATHER_LARGE__.state(); const title = s.document.pages[0].objects.find(o => o.id.endsWith('-title')); return window.__FATHER_LARGE__.execute({ type: 'object.move', objectId: title.id, xU: mmToU(12), yU: mmToU(68) }); });
      assert.equal(moved.ok, true); await saved(page); await page.getByRole('button', { name: 'Publicar / PDF', exact: true }).click();
      await page.locator('[data-publication-status="BLOCKED"]').waitFor(); assert(await page.locator('[data-publication-diagnostic="PRINTABLE_CONTENT_OVERLAP"]').count() >= 2);
      await page.screenshot({ path: resolve(output, 'visible-content-overlap-blocked.png'), fullPage: true });
      await page.getByRole('button', { name: 'Voltar ao editor', exact: true }).click();
      await page.evaluate(async () => { const { mmToU } = await import('/src/vnext/domain/physical.ts'); const s = window.__FATHER_LARGE__.state(); const title = s.document.pages[0].objects.find(o => o.id.endsWith('-title')); return window.__FATHER_LARGE__.execute({ type: 'object.move', objectId: title.id, xU: mmToU(13), yU: mmToU(14) }); });
      await saved(page); results.overlapRepair = await publish(page, 'large-repaired-chromium', 8);
    }
    await page.close();
  }
  results.tableMatrix = [];
  for (const [level, rows, columns] of [['table2', 2, 2], ['table10', 10, 10], ['table50', 50, 8], ['stress', 110, 8]]) {
    results.tableMatrix.push(await tableMatrix(level, rows, columns));
  }
  const stress = await browser.newPage({ viewport: { width: 1600, height: 1100 } }); watch(stress); await stress.goto(url('stress'), { waitUntil: 'networkidle' });
  await stress.locator('[data-editor-object-id$="-table"]').click(); await stress.locator('[data-editor-action="edit-table"]').click(); await stress.locator('[data-table-grid-overlay]').waitFor();
  await stress.locator('[data-editor-action="toggle-table-options"]').click(); await stress.locator('[data-table-row-selector="1"]').click();
  await stress.locator('[data-table-row-count]').fill('30'); const start = performance.now(); await stress.locator('[data-editor-action="insert-rows-after"]').click();
  await stress.waitForFunction(() => window.__FATHER_LARGE__.state().document.pages[0].objects.find(o => o.type === 'table').table.rows.length === 140);
  const insert30RowsMs = performance.now() - start;
  await stress.locator('[data-editor-action="undo"]').click(); await stress.waitForFunction(() => window.__FATHER_LARGE__.state().document.pages[0].objects.find(o => o.type === 'table').table.rows.length === 110);
  await stress.locator('[data-editor-action="redo"]').click(); await stress.waitForFunction(() => window.__FATHER_LARGE__.state().document.pages[0].objects.find(o => o.type === 'table').table.rows.length === 140);
  await saved(stress); const stressSaved = (await state(stress)).document; await stress.evaluate(() => window.__FATHER_LARGE__.reopen()); assert.deepEqual((await state(stress)).document, stressSaved);
  await stress.getByRole('button', { name: 'Publicar / PDF', exact: true }).click(); await stress.locator('[data-publication-status="BLOCKED"]').waitFor();
  assert.equal(await stress.locator('[data-publication-action="print"]').isEnabled(), false); assert(await stress.locator('[data-publication-diagnostic="TABLE_CONTENT_OVERFLOW"]').count() > 0);
  await stress.screenshot({ path: resolve(output, '140-row-table-overflow-protected.png'), fullPage: true });
  results.tableStress = { authoredRows: 110, afterBatchRows: 140, columns: 8, insert30RowsMs, atomicUndoRedo: true, savedReopened: true, oversizedA4PrintBlocked: true, automaticTablePagination: false };
  results.browsers.chromium = 'PASS'; await browser.close();
  if (!matrixOnly) {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const edge = await browser.newPage({ viewport: { width: 1600, height: 1100 } }); watch(edge); await edge.goto(url('large'), { waitUntil: 'networkidle' });
  assert(JSON.stringify((await state(edge)).document).includes('large revisado')); results.edgePdf = await publish(edge, 'large-edge', 8); results.browsers.edge = 'PASS — fresh browser reopened saved HTTP-adapter catalog and printed A4 PDF';
  }
  assert.deepEqual(results.errors, []); results.result = 'PASS'; results.counters = counters;
  await writeFile(resolve(output, 'result.json'), JSON.stringify(results, null, 2) + '\n'); console.log(JSON.stringify(results, null, 2));
} catch (error) {
  const page = browser?.contexts().at(-1)?.pages().at(-1); if (page) { await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {}); results.visibleUI = await page.locator('body').innerText().catch(() => ''); }
  results.result = 'FAIL'; results.failure = error.message; await writeFile(resolve(output, 'result.json'), JSON.stringify(results, null, 2) + '\n'); throw error;
} finally { await browser?.close(); await server.close(); }
