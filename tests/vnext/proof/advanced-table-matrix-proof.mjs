import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Reproduce: node tests/vnext/proof/advanced-table-matrix-proof.mjs
// Optional ADVANCED_TABLE_DURABLE_OUTPUT preserves a separate timestamped receipt directory.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = process.env.ADVANCED_TABLE_OUTPUT ?? resolve(root, 'scratch/advanced-table-matrix-proof');
const durable = process.env.ADVANCED_TABLE_DURABLE_OUTPUT;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const port = Number(process.env.ADVANCED_TABLE_PORT ?? 5288);
const fullSizes = [[2, 2], [3, 4], [5, 5], [10, 4], [15, 5], [20, 6], [30, 8], [40, 6], [50, 8], [75, 8], [100, 8], [110, 8], [150, 10], [3, 1]];
const sizes = process.env.ADVANCED_TABLE_SIZES ? process.env.ADVANCED_TABLE_SIZES.split(',').map(value => value.split('x').map(Number)) : fullSizes;
const browserNames = (process.env.ADVANCED_TABLE_BROWSERS ?? 'chromium,edge').split(',');
const densityEnabled = process.env.ADVANCED_TABLE_DENSITY !== '0';
const layoutRepairOnly = process.env.ADVANCED_TABLE_LAYOUT_REPAIR_ONLY === '1';
const counters = { seeds: 0, saves: 0, gets: 0 };
const records = new Map();
await mkdir(output, { recursive: true });
const sourcePaths = ['src/vnext/app/EditorWorkspace.tsx', 'src/vnext/app/editor-defaults.ts', 'src/vnext/app/styles.css', 'src/vnext/app/table-grid-overlay.tsx',
  'src/vnext/editor/table-bulk-authoring.ts', 'src/vnext/editor/table-tsv.ts', 'src/vnext/editor/table-selection.ts', 'src/vnext/editor/table-merge-authoring.ts',
  'src/vnext/table/table-model.ts', 'src/vnext/rendering/measurement.ts', 'tests/vnext/proof/advanced-table-matrix-proof.mjs',
  'tests/vnext/proof/fixtures/advanced-table-matrix-data.ts', 'tests/vnext/proof/fixtures/advanced-table-matrix-browser.tsx',
  'tests/vnext/proof/fixtures/advanced-table-matrix-browser.html'];
const sourceManifest = async () => Promise.all(sourcePaths.map(async path => ({ path, sha256: createHash('sha256').update(await readFile(resolve(root, path))).digest('hex') })));
const results = { result: 'RUNNING', startedAt: new Date().toISOString(),
  nodeVersion: process.version, platform: process.platform, browserVersions: {},
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim(),
  gitStatusAtStart: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim(),
  workingTreeSourceManifest: await sourceManifest(),
  environment: 'LOCAL CONTROLLED', infrastructure: 'Real editor/application/history/persistence/publication with a local HTTP CAS adapter. No authenticated Supabase, actual Excel/Sheets application, Vercel Preview, production or human-pilot claim.',
  measurementBoundary: 'UI wall durations include Playwright/protocol/actionability and two animation frames; selection calculation series isolate normalizeTableSelection. These are development-server measurements, not React Profiler or backend timings.',
  configuration: { sizes, browserNames, densityEnabled, layoutRepairOnly }, matrix: [], creation: [], density: [], multipage: [], layoutRepairs: [], errors: [], counters };
const json = (res, value) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true,
  fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } }, plugins: [{ name: 'advanced-controlled-repository',
  configureServer(dev) { dev.middlewares.use(async (req, res, next) => {
    const path = req.url?.split('?')[0];
    if (!path?.startsWith('/__advanced/')) return next();
    if (path.startsWith('/__advanced/record/')) { counters.gets++; return json(res, records.get(path.slice('/__advanced/record/'.length)) ?? null); }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (path === '/__advanced/seed') { counters.seeds++; records.set(body.catalogId, body); return json(res, { ok: true }); }
    if (path === '/__advanced/save') {
      const before = records.get(body.catalogId);
      if (!before || before.remoteRevision !== body.expectedRemoteRevision) return json(res, { ok: false, error: { code: 'CONFLICT' } });
      counters.saves++;
      const value = { ...before, remoteRevision: before.remoteRevision + 1, lastMutationId: body.mutationId,
        title: body.documentSnapshot.title, locale: body.documentSnapshot.locale, documentSnapshot: body.documentSnapshot };
      records.set(body.catalogId, value); return json(res, { ok: true, value });
    }
    next();
  }); } }] });
const url = (rows, columns, run, pages = 1) => `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/advanced-table-matrix-browser.html?rows=${rows}&columns=${columns}&run=${run}&pages=${pages}`;
const state = page => page.evaluate(() => window.__ADVANCED_TABLE__.state());
const tableOf = document => document.pages[0].objects.find(object => object.type === 'table').table;
const textOf = cell => cell.content.type === 'empty' ? '' : cell.content.value.paragraphs.map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : '\n').join('')).join('\n');
function matrixOf(table) {
  const slots = new Map(table.cells.map(cell => [`${cell.rowId}\0${cell.columnId}`, cell]));
  return table.rows.map(row => table.columns.map(column => textOf(slots.get(`${row.id}\0${column.id}`))));
}
const quoteTsv = value => /[\t\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
const tsvOf = matrix => matrix.map((row, index) => row.map(value => row.length === 1 && index === matrix.length - 1 && value === '' ? '""' : quoteTsv(value)).join('\t')).join('\n');
const series = samplesMs => {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return { samplesMs, n: sorted.length, p50Ms: sorted[Math.ceil(sorted.length * .5) - 1], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] };
};
const frames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const saved = page => page.waitForFunction(() => { const value = window.__ADVANCED_TABLE__.state(); return !value.dirty && !['PREPARING', 'SAVING', 'VERIFYING'].includes(value.phase); });
const changed = (page, sequence) => page.waitForFunction(before => window.__ADVANCED_TABLE__.state().sequence > before, sequence);
const action = (page, name) => page.locator(`[data-editor-action="${name}"]`);
const watch = page => { page.on('pageerror', error => results.errors.push(error.message)); page.on('console', event => { if (event.type() === 'error') results.errors.push(event.text()); }); };
async function enterTable(page) {
  await page.locator('[data-editor-object-id$="-table"]').first().click();
  await action(page, 'edit-table').click();
  await page.locator('[data-table-grid-overlay]').waitFor();
  await frames(page);
}
async function paste(page, matrix) {
  await page.locator('[data-table-cell="0:0"]').click();
  await action(page, 'toggle-table-options').click();
  await action(page, 'paste-table-cells').click();
  await page.locator('[data-table-paste-textarea]').fill(tsvOf(matrix));
  const sequence = (await state(page)).sequence;
  const start = performance.now(); await action(page, 'apply-native-table-paste').click(); await changed(page, sequence); await frames(page);
  assert.equal((await state(page)).sequence, sequence + 1, 'Entire rectangle must be one history action');
  return performance.now() - start;
}
async function selectionBenchmark(page, rows, columns) {
  return page.evaluate(async ({ rows, columns }) => {
    const { normalizeTableSelection, tableCellSelection, tableSelectionIdentity } = await import('/src/vnext/editor/table-selection.ts');
    const { fatherTable } = await import('/tests/vnext/proof/fixtures/father-large-catalog-data.ts');
    const table = fatherTable('advanced-benchmark', rows, columns);
    const selection = tableCellSelection(tableSelectionIdentity('p', 'o', table.id), { rowId: table.rows[0].id, columnId: table.columns[0].id });
    for (let n = 0; n < 5; n++) normalizeTableSelection(table, selection);
    const samples = []; for (let n = 0; n < 30; n++) { const start = performance.now(); normalizeTableSelection(table, selection); samples.push(performance.now() - start); }
    return samples;
  }, { rows, columns });
}
async function inspectPdf(page, name, document) {
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator('[data-publication-action="print"]').click();
  await page.waitForFunction(() => document.querySelector('[data-publication-host]')?.dataset.printApproved === 'true');
  await page.emulateMedia({ media: 'print' });
  const pageCellBounds = await page.locator('[data-publication-host] [data-page-id]').evaluateAll(pages => pages.map(sheet => {
    const pageRect = sheet.getBoundingClientRect();
    return { pageId: sheet.getAttribute('data-page-id'), cells: [...sheet.querySelectorAll('[data-cell-id]')].map(cell => {
      const rect = cell.getBoundingClientRect();
      return { id: cell.getAttribute('data-cell-id'), leftPt: (rect.left - pageRect.left) / pageRect.width * 595.28,
        rightPt: (rect.right - pageRect.left) / pageRect.width * 595.28, topPt: (rect.top - pageRect.top) / pageRect.height * 841.89,
        bottomPt: (rect.bottom - pageRect.top) / pageRect.height * 841.89 };
    }) };
  }));
  assert.equal(pageCellBounds.length, document.pages.length);
  const path = resolve(output, `${name}.pdf`);
  await page.pdf({ path, format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  const bytes = await readFile(path);
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
  assert.equal(pdf.numPages, document.pages.length);
  const sheets = [];
  for (let index = 0; index < pdf.numPages; index++) {
    const sheet = await pdf.getPage(index + 1); const viewport = sheet.getViewport({ scale: 1.2 });
    assert(Math.abs(viewport.width / 1.2 - 595.28) < 1); assert(Math.abs(viewport.height / 1.2 - 841.89) < 1);
    const content = await sheet.getTextContent(); const items = content.items.filter(item => 'str' in item);
    const extracted = items.map(item => item.str).join(' ');
    const compact = extracted.replace(/\s/g, '');
    const canonicalCells = new Map(document.pages[index].objects.filter(object => object.type === 'table').flatMap(object => object.table.cells).map(cell => [cell.id, cell]));
    const bounds = pageCellBounds[index].cells;
    assert.equal(bounds.length, canonicalCells.size, 'Every canonical cell must have a publication DOM rectangle');
    const positioned = items.filter(item => item.str.replace(/\s/g, '')).map(item => ({ text: item.str, x: item.transform[4],
      right: item.transform[4] + item.width, centerX: item.transform[4] + item.width / 2,
      baselineTop: viewport.height / 1.2 - item.transform[5], height: item.height }));
    const cellEvidence = [];
    for (const boundsCell of bounds) {
      assert(boundsCell.leftPt >= -.75 && boundsCell.rightPt <= 595.28 + .75 && boundsCell.topPt >= -.75 && boundsCell.bottomPt <= 841.89 + .75,
        `Cell ${boundsCell.id} escapes A4 bounds`);
      const matched = positioned.filter(item => item.centerX >= boundsCell.leftPt - .25 && item.centerX <= boundsCell.rightPt + .25
        && item.baselineTop >= boundsCell.topPt - .25 && item.baselineTop <= boundsCell.bottomPt + .25)
        .sort((a, b) => Math.abs(a.baselineTop - b.baselineTop) > .5 ? a.baselineTop - b.baselineTop : a.x - b.x);
      for (const item of matched) assert(item.x >= boundsCell.leftPt - .75 && item.right <= boundsCell.rightPt + .75
        && item.baselineTop - item.height >= boundsCell.topPt - 2 && item.baselineTop <= boundsCell.bottomPt + .75,
      `PDF text ${JSON.stringify(item.text)} is clipped by or escapes ${boundsCell.id}`);
      const canonical = canonicalCells.get(boundsCell.id); assert(canonical, `Unknown publication cell ${boundsCell.id}`);
      const expectedCellText = textOf(canonical).replace(/\s/g, '');
      const actualCellText = matched.map(item => item.text).join('').replace(/\s/g, '');
      assert.equal(actualCellText, expectedCellText, `PDF changed, omitted, duplicated or reordered text in ${boundsCell.id}`);
      cellEvidence.push({ ...boundsCell, expectedCellText, actualCellText, itemCount: matched.length, cellTextExact: true });
    }
    const expected = document.pages[index].objects.filter(object => object.type === 'table').flatMap(object => matrixOf(object.table).flat()).filter(Boolean);
    for (const value of expected) assert(compact.includes(value.replace(/\s/g, '')), `PDF page ${index + 1} omitted or changed ${JSON.stringify(value)}`);
    for (const token of ['00017', '1.234,56', '1,234.56', 'μA', 'Δ', '±', '≤', '≥', '×', 'Ω', 'Linha um', 'Linha dois']) assert(compact.includes(token.replace(/\s/g, '')), `PDF page ${index + 1} missing ${token}`);
    const operators = await sheet.getOperatorList();
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await sheet.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const renderPath = resolve(output, `${name}-page-${index + 1}.png`);
    await writeFile(renderPath, canvas.toBuffer('image/png'));
    sheets.push({ page: index + 1, renderPath, extractedText: extracted, expectedNonemptyCellValues: expected.length, cellEvidence,
      imagePaintCount: operators.fnArray.filter(operator => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat].includes(operator)).length,
      a4: true, cellTextPreserved: true, symbolTextPreserved: true, everyCellExactByPdfPosition: true,
      geometryTolerancePt: { horizontal: .75, verticalFontAscender: 2, cellMembership: .25 } });
  }
  await pdf.destroy(); await page.emulateMedia({ media: 'screen' });
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), pages: sheets };
}
async function publish(page, name, document, rows) {
  const start = performance.now(); await action(page, 'publish').click();
  await page.locator('[data-publication-status="READY"], [data-publication-status="BLOCKED"]').waitFor({ timeout: 30000 });
  const status = await page.locator('[data-publication-status]').getAttribute('data-publication-status');
  const preflightMs = performance.now() - start;
  await page.screenshot({ path: resolve(output, `${name}-publication.png`), fullPage: true });
  if (rows <= 10) assert.equal(status, 'READY', 'Small technical matrix should publish legibly');
  if (rows >= 50) assert.equal(status, 'BLOCKED', 'Oversized A4 matrix should not omit content to print');
  if (status === 'BLOCKED') {
    assert.equal(await page.locator('[data-publication-action="print"]').isEnabled(), false);
    const diagnostics = await page.locator('[data-publication-diagnostic]').evaluateAll(nodes => nodes.map(node => ({ code: node.getAttribute('data-publication-diagnostic'), text: node.textContent })));
    assert(diagnostics.some(entry => /TABLE_CONTENT_OVERFLOW|OUTSIDE|FRAME|SAFE_AREA/.test(entry.code)), 'Blocked oversized table must explain physical/content overflow');
    return { status, preflightMs, diagnostics, automaticTablePagination: false };
  }
  const pdfStart = performance.now(); const pdf = await inspectPdf(page, name, document);
  return { status, preflightMs, pdfMs: performance.now() - pdfStart, pdf };
}
let browser;
let run = 1;
async function matrixCase(browserName, rows, columns, pages = 1) {
  const name = `table-${rows}x${columns}-${browserName}${pages > 1 ? '-manual-two-pages' : ''}`;
  const record = { id: `TABLE-COMPLEX-${String(results.matrix.length + results.multipage.length + 1).padStart(3, '0')}`, browser: browserName, rows, columns, pages,
    cells: rows * columns * pages, name, status: 'RUNNING', actions: ['UI fallback TSV rectangle paste', 'atomic undo/redo', 'UI selection/edit', 'save', 'HTTP adapter reopen', 'publication', 'A4 PDF when fitting'] };
  (pages === 1 ? results.matrix : results.multipage).push(record);
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] }); watch(page);
  try {
    const openStart = performance.now(); await page.goto(url(rows, columns, run++, pages), { waitUntil: 'networkidle' }); await page.locator('[data-vnext-shell]').waitFor();
    record.openMs = performance.now() - openStart;
    const initial = await state(page); const source = await page.evaluate(() => window.__ADVANCED_TABLE__.source());
    await enterTable(page); record.pasteMs = await paste(page, source);
    let pasted = tableOf((await state(page)).document); assert.deepEqual(matrixOf(pasted), source);
    await action(page, 'undo').click(); await frames(page); assert.deepEqual(tableOf((await state(page)).document), tableOf(initial.document));
    await action(page, 'redo').click(); await frames(page); assert.deepEqual(tableOf((await state(page)).document), pasted);
    record.rectanglePasteExact = true; record.atomicPasteUndoRedo = true;
    if (columns === 1) {
      await page.locator('[data-table-cell="0:0"]').click();
      await page.locator(`[data-table-cell="${rows - 1}:0"]`).click({ modifiers: ['Shift'] });
      await action(page, 'copy-table-cells').click();
      const clipboard = await page.evaluate(() => navigator.clipboard.readText());
      assert.equal(clipboard.replace(/\r\n?/g, '\n'), tsvOf(source), 'Product Copy must preserve final empty single-column row (native clipboard line endings normalized)');
      const beforeClear = (await state(page)).sequence; await action(page, 'clear-table-cells').click(); await changed(page, beforeClear);
      assert.deepEqual(matrixOf(tableOf((await state(page)).document)), Array.from({ length: rows }, () => ['']));
      await page.locator('[data-table-cell="0:0"]').click(); await action(page, 'paste-table-cells').click();
      await page.locator('[data-table-paste-textarea]').fill(clipboard);
      const before = (await state(page)).sequence; await action(page, 'apply-native-table-paste').click(); await changed(page, before);
      assert.deepEqual(matrixOf(tableOf((await state(page)).document)), source);
      pasted = tableOf((await state(page)).document);
      record.productCopyPlainPasteFinalEmptyRowExact = true;
    }
    record.selectionCalculation = series(await selectionBenchmark(page, rows, columns));
    const selectionSamples = [];
    for (let sample = 0; sample < 6; sample++) {
      const start = performance.now(); await page.locator(`[data-table-cell="${sample % 2}:${sample % columns}"]`).click(); await frames(page); selectionSamples.push(performance.now() - start);
    }
    record.selectionUi = series(selectionSamples);
    await page.locator('[data-table-cell="1:0"]').dblclick(); await page.locator('[data-cell-edit-session]').waitFor();
    await page.locator('[data-cell-rich-text]').fill(source[1][0] + ' revisado');
    const editStart = performance.now(); const beforeEdit = (await state(page)).sequence;
    await action(page, 'commit-cell-content').click(); await changed(page, beforeEdit); await frames(page); record.editCommitMs = performance.now() - editStart;
    const edited = tableOf((await state(page)).document); const expected = structuredClone(source); expected[1][0] += ' revisado';
    assert.deepEqual(matrixOf(edited), expected);
    const undoSamples = [], redoSamples = [];
    for (let sample = 0; sample < 5; sample++) {
      let start = performance.now(); await action(page, 'undo').click(); await frames(page); undoSamples.push(performance.now() - start); assert.deepEqual(tableOf((await state(page)).document), pasted);
      start = performance.now(); await action(page, 'redo').click(); await frames(page); redoSamples.push(performance.now() - start); assert.deepEqual(tableOf((await state(page)).document), edited);
    }
    record.undoUi = series(undoSamples); record.redoUi = series(redoSamples); record.cellEditExact = true;
    const saveStart = performance.now(); await action(page, 'save').click(); await saved(page); record.saveMs = performance.now() - saveStart;
    const beforeReopen = (await state(page)).document; const persisted = records.get(initial.catalogId)?.documentSnapshot;
    assert.deepEqual(persisted, beforeReopen); assert.deepEqual(matrixOf(tableOf(persisted)), expected);
    const reopenStart = performance.now(); await page.evaluate(() => window.__ADVANCED_TABLE__.reopen()); await frames(page); record.reopenMs = performance.now() - reopenStart;
    assert.deepEqual((await state(page)).document, beforeReopen); record.savedReopenedExact = true;
    await writeFile(resolve(output, `${name}-canonical.json`), JSON.stringify({ source, expectedAfterEdit: expected, persisted: beforeReopen }, null, 2));
    await page.screenshot({ path: resolve(output, `${name}-editor.png`), fullPage: true });
    record.publication = await publish(page, name, beforeReopen, rows);
    record.status = 'PASS';
    await writeFile(resolve(output, 'result.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ case: name, result: 'PASS', publication: record.publication.status, cells: record.cells }));
    return record;
  } catch (error) {
    record.status = 'FAIL'; record.failure = error.message;
    record.visibleUI = await page.locator('body').innerText().catch(() => '');
    await page.screenshot({ path: resolve(output, `${name}-failure.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally { await page.close(); }
}
async function densityCase(browserName, width, height) {
  const page = await browser.newPage({ viewport: { width, height } }); watch(page);
  const name = `density-${width}x${height}-${browserName}`;
  try {
    await page.goto(url(15, 5, run++), { waitUntil: 'networkidle' }); await page.locator('[data-vnext-shell]').waitFor();
    await enterTable(page); const source = await page.evaluate(() => window.__ADVANCED_TABLE__.source()); await paste(page, source);
    assert.deepEqual(matrixOf(tableOf((await state(page)).document)), source);
    await page.locator('[data-table-cell="1:0"]').dblclick(); await page.locator('[data-cell-edit-session]').waitFor();
    const before = (await state(page)).document; await action(page, 'cancel-cell-content').click(); await frames(page); assert.deepEqual((await state(page)).document, before);
    const geometry = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      editor: (() => { const rect = document.querySelector('[data-vnext-shell]').getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; })(),
      controls: ['save', 'undo', 'redo', 'paste-table-cells'].map(name => { const node = document.querySelector(`[data-editor-action="${name}"]`); const rect = node.getBoundingClientRect(); return { name, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }; }),
      stageScrollContainers: [...document.querySelectorAll('[data-vnext-shell] *')].filter(node => /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight).map(node => ({ className: node.className, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight })) }));
    assert.equal(geometry.documentWidth <= width + 1, true, `${name}: document horizontally overflows viewport`);
    for (const control of geometry.controls) assert(control.width > 0 && control.x >= 0 && control.right <= width + 1, `${name}: ${control.name} outside viewport horizontally`);
    await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
    results.density.push({ id: `TABLE-RESOLUTION-${String(results.density.length + 1).padStart(3, '0')}`, browser: browserName, width, height, rows: 15, columns: 5, sourceCanonicalExact: true, editCancelExact: true, geometry, status: 'PASS' });
  } finally { await page.close(); }
}
async function creationCase(browserName) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); watch(page);
  try {
    await page.goto(url(1, 1, run++) + '&empty=1', { waitUntil: 'networkidle' }); await page.locator('[data-vnext-shell]').waitFor();
    const initial = await state(page); assert.equal(initial.document.pages[0].objects.length, 0);
    const start = performance.now();
    await action(page, 'new-table-size').click();
    await page.getByRole('spinbutton', { name: 'Linhas da nova tabela', exact: true }).fill('10');
    await page.getByRole('spinbutton', { name: 'Colunas da nova tabela', exact: true }).fill('5');
    await action(page, 'add-table').click(); await changed(page, initial.sequence); await frames(page);
    const durationMs = performance.now() - start;
    const inserted = (await state(page)).document; const table = tableOf(inserted);
    assert.equal(table.rows.length, 10); assert.equal(table.columns.length, 5); assert.equal(table.cells.length, 50);
    assert(table.cells.every(cell => cell.content.type === 'empty')); assert.equal((await state(page)).sequence, initial.sequence + 1);
    await action(page, 'undo').click(); await frames(page); assert.deepEqual((await state(page)).document, initial.document);
    await action(page, 'redo').click(); await frames(page); assert.deepEqual((await state(page)).document, inserted);
    await action(page, 'save').click(); await saved(page); await page.evaluate(() => window.__ADVANCED_TABLE__.reopen()); await frames(page);
    assert.deepEqual((await state(page)).document, inserted);
    await page.screenshot({ path: resolve(output, `new-table-10x5-${browserName}.png`), fullPage: true });
    results.creation.push({ id: `TABLE-HUMAN-${String(results.creation.length + 1).padStart(3, '0')}`, browser: browserName,
      rows: 10, columns: 5, actions: ['Open Tamanho da nova tabela', 'Fill Linhas=10', 'Fill Colunas=5', 'Click Tabela'],
      interactions: 4, durationMs, blankCells: 50, atomicUndoRedo: true, savedReopenedExact: true, status: 'PASS',
      boundary: 'Agent-operated UI task; no human discovery measurement or historical baseline timing claim.' });
    for (const [label, rows, columns] of [['valid', '10', '5'], ['invalid', '0', '11']]) {
      await page.goto(url(1, 1, run++) + '&empty=1', { waitUntil: 'networkidle' }); await page.locator('[data-vnext-shell]').waitFor();
      const before = await state(page); assert.equal(before.document.pages[0].objects.length, 0);
      await action(page, 'new-table-size').click();
      await page.getByRole('spinbutton', { name: 'Linhas da nova tabela', exact: true }).fill(rows);
      await page.getByRole('spinbutton', { name: 'Colunas da nova tabela', exact: true }).fill(columns);
      await action(page, 'new-table-size').click();
      assert.equal(await page.getByRole('region', { name: 'Tamanho da nova tabela', exact: true }).count(), 0);
      await action(page, 'add-table').click(); await changed(page, before.sequence); await frames(page);
      const insertedDefault = (await state(page)).document; const defaultTable = tableOf(insertedDefault);
      assert.equal(defaultTable.rows.length, 1); assert.equal(defaultTable.columns.length, 1); assert.equal(defaultTable.cells.length, 1);
      assert.equal(defaultTable.cells[0].content.type, 'empty'); assert.equal((await state(page)).sequence, before.sequence + 1);
      await action(page, 'undo').click(); await frames(page); assert.deepEqual((await state(page)).document, before.document);
      await action(page, 'redo').click(); await frames(page); assert.deepEqual((await state(page)).document, insertedDefault);
      await action(page, 'save').click(); await saved(page); await page.evaluate(() => window.__ADVANCED_TABLE__.reopen()); await frames(page);
      assert.deepEqual((await state(page)).document, insertedDefault);
      await page.screenshot({ path: resolve(output, `new-table-closed-panel-${label}-${browserName}.png`), fullPage: true });
      results.creation.push({ id: `TABLE-CLOSED-SIZE-${String(results.creation.length + 1).padStart(3, '0')}`, browser: browserName,
        hiddenInputs: { rows, columns }, panelClosed: true, rows: 1, columns: 1, blankCells: 1,
        atomicUndoRedo: true, savedReopenedExact: true, status: 'PASS' });
    }
  } finally { await page.close(); }
}
async function layoutRepairCase(browserName) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); watch(page);
  const name = `table-20x6-ui-layout-repair-${browserName}`;
  const record = { id: `TABLE-HUMAN-LAYOUT-${String(results.layoutRepairs.length + 1).padStart(3, '0')}`, browser: browserName,
    rows: 20, columns: 6, status: 'RUNNING', boundary: 'Actual UI width and fit-height changes; no fixture replacement, font shrinking or automatic pagination.' };
  results.layoutRepairs.push(record);
  try {
    await page.goto(url(20, 6, run++), { waitUntil: 'networkidle' }); await page.locator('[data-vnext-shell]').waitFor();
    await enterTable(page); const source = await page.evaluate(() => window.__ADVANCED_TABLE__.source()); await paste(page, source);
    await page.locator('[data-table-cell="1:0"]').dblclick(); await page.locator('[data-cell-edit-session]').waitFor();
    const expected = structuredClone(source); expected[1][0] += ' revisado';
    await page.locator('[data-cell-rich-text]').fill(expected[1][0]);
    let sequence = (await state(page)).sequence; await action(page, 'commit-cell-content').click(); await changed(page, sequence);
    await action(page, 'save').click(); await saved(page);
    const before = (await state(page)).document; assert.deepEqual(matrixOf(tableOf(before)), expected);
    record.before = await publish(page, `${name}-before`, before, 20); assert.equal(record.before.status, 'BLOCKED');
    await page.getByRole('button', { name: 'Voltar ao editor', exact: true }).click(); await enterTable(page);
    await page.locator('[data-table-column-selector="0"]').click(); await action(page, 'toggle-table-inspector-advanced').click();
    const widthStart = performance.now();
    sequence = (await state(page)).sequence; await page.locator('[data-column-property="width-mode"]').selectOption('fixed'); await changed(page, sequence);
    sequence = (await state(page)).sequence; await page.locator('[data-column-property="fixed-mm"]').fill('40'); await page.locator('[data-column-property="fixed-mm"]').blur(); await changed(page, sequence);
    record.columnWidthUiMs = performance.now() - widthStart;
    await page.waitForFunction(() => { const button = document.querySelector('[data-editor-action="fit-table-height"]'); return button && !button.disabled; });
    const fitStart = performance.now(); sequence = (await state(page)).sequence; await action(page, 'fit-table-height').click(); await changed(page, sequence); await frames(page);
    record.fitHeightUiMs = performance.now() - fitStart;
    await action(page, 'save').click(); await saved(page); const after = (await state(page)).document;
    assert.deepEqual(matrixOf(tableOf(after)), expected); assert.deepEqual(tableOf(after).style, tableOf(before).style, 'Repair must preserve original font and style');
    assert.deepEqual(tableOf(after).columns[0].width, { mode: 'fixed', mm: 40 });
    const frame = after.pages[0].objects.find(object => object.type === 'table').frame;
    assert(frame.yMm + frame.heightMm <= 269, 'Repaired table must stay above footer');
    record.frameAfter = frame; record.firstColumnAfter = tableOf(after).columns[0].width;
    await page.evaluate(() => window.__ADVANCED_TABLE__.reopen()); await frames(page); assert.deepEqual((await state(page)).document, after);
    record.savedReopenedExact = true; record.originalStylePreserved = true;
    await page.screenshot({ path: resolve(output, `${name}-editor-after.png`), fullPage: true });
    record.after = await publish(page, `${name}-after`, after, 20); assert.equal(record.after.status, 'READY', 'Width and fit-height repair must produce a legible PDF');
    await writeFile(resolve(output, `${name}-canonical.json`), JSON.stringify({ source, expected, before, after }, null, 2));
    record.status = 'PASS'; console.log(JSON.stringify({ case: name, result: 'PASS', before: record.before.status, after: record.after.status }));
  } catch (error) {
    record.status = 'FAIL'; record.failure = error.message; record.visibleUI = await page.locator('body').innerText().catch(() => '');
    await page.screenshot({ path: resolve(output, `${name}-failure.png`), fullPage: true }).catch(() => {}); throw error;
  } finally { await page.close(); }
}
async function preserve() {
  results.finishedAt = new Date().toISOString();
  if (durable) results.durableArtifacts = resolve(durable, `matrix-${stamp}`);
  await writeFile(resolve(output, 'result.json'), JSON.stringify(results, null, 2) + '\n');
  if (durable) { await mkdir(durable, { recursive: true }); await cp(output, results.durableArtifacts, { recursive: true, force: false, errorOnExist: true }); }
}
try {
  await server.listen();
  for (const browserName of browserNames) {
    browser = await chromium.launch({ headless: true, ...(browserName === 'edge' ? { channel: 'msedge' } : {}) });
    results.browserVersions[browserName] = browser.version();
    if (!layoutRepairOnly) {
      for (const [rows, columns] of sizes) await matrixCase(browserName, rows, columns);
      await matrixCase(browserName, 10, 4, 2);
    }
    await layoutRepairCase(browserName);
    await creationCase(browserName);
    if (densityEnabled) for (const [width, height] of [[1920,1080],[1600,900],[1366,768],[1280,800],[1024,768],[820,720]]) await densityCase(browserName, width, height);
    await browser.close(); browser = undefined;
  }
  assert.deepEqual(await sourceManifest(), results.workingTreeSourceManifest, 'Product or proof source changed while measurements were running');
  assert.deepEqual(results.errors, []); results.result = 'PASS'; await preserve();
  console.log(JSON.stringify({ result: results.result, matrixCases: results.matrix.length, multipageCases: results.multipage.length, densityCases: results.density.length, output, durableArtifacts: results.durableArtifacts }));
} catch (error) {
  results.result = 'FAIL'; results.failure = error.message;
  const page = browser?.contexts().at(-1)?.pages().at(-1);
  if (page) await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  await preserve(); throw error;
} finally { await browser?.close(); await server.close(); }
