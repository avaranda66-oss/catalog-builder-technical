import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w5c-publication-review-proof');
await mkdir(output, { recursive: true });
const contract = JSON.parse(await readFile(resolve(root, 'docs/vnext/pilot-c1-source-contract.json'), 'utf8'));
const approvedBytes = await readFile(resolve(root, contract.image.packagedPath));
assert.equal(createHash('sha256').update(approvedBytes).digest('hex'), contract.image.sha256);
assert.equal(approvedBytes.length, contract.image.byteLength);
const port = Number(process.env.W5C_PROOF_PORT ?? 5275);
const origin = `http://127.0.0.1:${port}`;
process.env.VITE_SUPABASE_URL = origin + '/controlled-supabase';
process.env.VITE_SUPABASE_ANON_KEY = 'c1-controlled-test-key';
const catalogs = new Map();
const assets = new Map();
const storage = new Map();
const counters = { uploads: 0, creates: 0, saves: 0, assetReads: 0, packagedReads: 0 };
let packagedDisabled = false;
const identity = '11111111-1111-4111-8111-111111111111';
const errors = { consoleErrors: [], pageErrors: [], failedResources: [], requestFailures: [] };
const requests = [];
let holdTranslation = false;
let releaseTranslation;
let translationRequests = 0;

// Only authorization and transport are controlled. All starter/editor/asset/create code is production code.
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><div id="root"></div><script type="module">
import { mountVNextApp } from '/src/vnext/app/bootstrap.tsx';
import { useAuthStore } from '/src/stores/useAuthStore.ts';
import { getSupabase } from '/src/services/supabase.service.ts';
import { VNextPersistenceRuntime } from '/src/vnext/persistence/index.ts';
useAuthStore.setState({ status: 'authenticated', userId: '${identity}', role: 'editor', email: 'controlled@proof.local', errorMessage: null, initialize: async () => {} });
window.__W5C_LOSE_AUTH__ = () => useAuthStore.setState({ status: 'unauthenticated', userId: null, role: null, email: null });
const supabase = getSupabase();
if (!supabase) throw new Error('Controlled infrastructure not configured');
supabase.rpc = async (name, args = {}) => {
  const response = await fetch('/__c1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  return response.json();
};
supabase.storage.from = bucket => ({
  upload: async (path, bytes, options) => {
    const response = await fetch('/__c1/storage/' + bucket + '/' + path, { method: 'POST', headers: { 'Content-Type': options.contentType }, body: bytes });
    return response.json();
  },
  createSignedUrl: async path => ({ data: { signedUrl: location.origin + '/__c1/storage/' + bucket + '/' + path }, error: null }),
});
const register = VNextPersistenceRuntime.prototype.registerAuthoringBarrier;
VNextPersistenceRuntime.prototype.registerAuthoringBarrier = function(...args) { window.__C1_RUNTIME__ = this; return register.apply(this, args); };
window.__C1_STATE__ = () => {
  const value = window.__C1_RUNTIME__?.workspace.getSnapshot();
  return value ? { document: value.session.getSnapshot().document, dirty: value.dirty, save: value.save, states: [...value.assetRuntimeStates], localSequence: value.session.getSnapshot().localSequence } : null;
};
await mountVNextApp(document.getElementById('root'));
</script></body></html>`;

const json = (res, data) => { res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
async function body(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks); }
const ok = data => ({ data, error: null });
function envelope(doc, mutation, previous, originMetadata) {
  return { catalogId: doc.id, remoteRevision: previous ? previous.remoteRevision + 1 : 1, lastMutationId: mutation,
    title: doc.title, locale: doc.locale, createdAt: previous?.createdAt ?? '2026-09-30T12:00:00Z', updatedAt: '2026-09-30T12:01:00Z',
    createdBy: identity, updatedBy: identity, archivedAt: null, documentSchemaVersion: 1, documentSnapshot: doc,
    ...(previous?.origin || originMetadata ? { origin: previous?.origin ?? originMetadata } : {}) };
}
const server = await createServer({ root, plugins: [{ name: 'c1-controlled-infrastructure', configureServer(devServer) {
  devServer.middlewares.use(async (req, res, next) => {
    const pathname = (req.url ?? '').split('?')[0];
    try {
      if (pathname === '/favicon.ico') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.end(approvedBytes);
        return;
      }
      if (pathname === contract.image.runtimePackagedPath) {
        counters.packagedReads++;
        if (packagedDisabled) { res.statusCode = 410; res.end('Packaged fallback forbidden after create'); return; }
        res.setHeader('Content-Type', 'image/png'); res.end(approvedBytes); return;
      }
      if (pathname === '/controlled-supabase/functions/v1/vnext-translation-provider') {
        const request = JSON.parse((await body(req)).toString());
        translationRequests++;
        assert.equal(request.sourceLocale, 'pt-BR'); assert.equal(request.targetLocale, 'es-ES');
        assert.equal(JSON.stringify(request).includes('documentSnapshot'), false);
        if (holdTranslation) await new Promise(resolveRequest => { releaseTranslation = resolveRequest; });
        const translate = text => text.replaceAll('Especificações', 'Especificaciones').replaceAll('produto', 'producto').replaceAll('Calibração', 'Calibración');
        json(res, { contractVersion: request.contractVersion, profileVersion: request.profileVersion,
          requestId: request.requestId, targetLocale: request.targetLocale,
          units: request.units.map(unit => ({ unitId: unit.unitId, runs: unit.runs.map(run => ({ runId: run.runId, translatedText: translate(run.protectedText) })) })),
          provider: { providerId: 'gemini', modelId: 'gemini-2.5-flash' } }); return;
      }
      if (pathname.startsWith('/__c1/storage/')) {
        const key = pathname.slice('/__c1/storage/'.length);
        assert(key.startsWith('product-assets/vnext/'));
        if (req.method === 'POST') {
          const value = await body(req);
          assert.equal(req.headers['content-type'], 'image/png');
          assert.equal(createHash('sha256').update(value).digest('hex'), contract.image.sha256);
          assert.equal(storage.has(key), false, 'Immutable storage must not upload twice');
          storage.set(key, value); counters.uploads++;
          json(res, { data: { path: key.slice('product-assets/'.length) }, error: null }); return;
        }
        const value = storage.get(key); assert(value, 'Required durable bytes missing');
        res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'no-store'); res.end(value); return;
      }
      if (pathname.startsWith('/__c1/rpc/')) {
        const name = pathname.slice('/__c1/rpc/'.length);
        const a = JSON.parse((await body(req)).toString());
        if (name === 'finalize_vnext_asset_v1') {
          assert(storage.has('product-assets/' + a.p_storage_path));
          const ref = { id: a.p_asset_id, version: a.p_version, sha256: a.p_sha256, mime: a.p_mime, widthPx: a.p_width_px, heightPx: a.p_height_px, name: a.p_name, alt: a.p_alt };
          assets.set(ref.id, { ...ref, fileSize: a.p_file_size, storageBucket: 'product-assets', storagePath: a.p_storage_path, createdAt: '2026-09-30T12:00:00Z' });
          json(res, ok(ref)); return;
        }
        if (name === 'get_vnext_asset_v1') { counters.assetReads++; json(res, ok(assets.get(a.p_asset_id) ?? null)); return; }
        if (name === 'list_vnext_catalogs_v1') {
          json(res, ok([...catalogs.values()].map(({ documentSnapshot: _doc, lastMutationId: _mutation, ...metadata }) => metadata))); return;
        }
        if (name === 'create_vnext_catalog_v1') {
          assert.equal(catalogs.has(a.p_document_snapshot.id), false);
          assert.equal(a.p_document_snapshot.pages.length, 2);
          for (const ref of a.p_document_snapshot.assets) assert(assets.has(ref.id), 'CREATE must follow durable preparation');
          const value = envelope(a.p_document_snapshot, a.p_mutation_id, undefined, a.p_origin);
          catalogs.set(value.catalogId, value); counters.creates++; json(res, ok(value)); return;
        }
        if (name === 'get_vnext_catalog_v1') { assert(catalogs.has(a.p_catalog_id)); json(res, ok(catalogs.get(a.p_catalog_id))); return; }
        if (name === 'save_vnext_catalog_cas_v1') {
          const previous = catalogs.get(a.p_catalog_id);
          assert.equal(previous.remoteRevision, a.p_expected_remote_revision);
          const value = envelope(a.p_document_snapshot, a.p_mutation_id, previous);
          catalogs.set(value.catalogId, value); counters.saves++; json(res, ok(value)); return;
        }
        throw new Error('Unexpected controlled RPC: ' + name);
      }
      if (pathname === '/v2') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await devServer.transformIndexHtml(req.url, html)); return;
      }
      next();
    } catch (error) { next(error); }
  });
} }], server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } }, logLevel: 'error' });

function watch(page, label) {
  page.on('console', event => { if (event.type() === 'error') errors.consoleErrors.push({ label, message: event.text() }); });
  page.on('pageerror', event => errors.pageErrors.push({ label, message: event.message }));
  page.on('response', response => { if (response.status() >= 400) errors.failedResources.push({ label, status: response.status(), url: response.url() }); });
  page.on('requestfailed', request => errors.requestFailures.push({ label, url: request.url(), error: request.failure()?.errorText }));
  page.on('request', request => requests.push({ label, url: request.url(), method: request.method(), afterCreate: packagedDisabled }));
}
const state = page => page.evaluate(() => window.__C1_STATE__());
async function decodedImage(page, assetId) {
  const image = page.locator('[data-editorial-root] img').first();
  await image.waitFor();
  await image.evaluate(element => element.decode());
  const dimensions = await image.evaluate(element => ({ complete: element.complete, naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight }));
  assert.deepEqual(dimensions, { complete: true, naturalWidth: 720, naturalHeight: 482 });
  assert.equal((await state(page)).states.find(([id]) => id === assetId)?.[1].status, 'resolved');
  assert.equal(await page.locator('[data-editorial-root] [data-asset-missing]').count(), 0);
  return dimensions;
}
async function saved(page) {
  await page.waitForFunction(() => { const s = window.__C1_STATE__(); return s && !s.dirty && s.save.phase !== 'saving'; });
}
async function selectPage(page, index) {
  await page.locator('.vnext-page-list button').nth(index).click();
}
async function inspectPdf(path) {
  const pdf = await getDocument({ data: new Uint8Array(await readFile(path)), isEvalSupported: false, useSystemFonts: false }).promise;
  assert.equal(pdf.numPages, 2);
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i), text = await page.getTextContent(), operators = await page.getOperatorList();
    const widthMm = (page.view[2] - page.view[0]) * 25.4 / 72, heightMm = (page.view[3] - page.view[1]) * 25.4 / 72;
    assert(Math.abs(widthMm - 210) < .5); assert(Math.abs(heightMm - 297) < .5);
    const content = text.items.filter(item => 'str' in item).map(item => item.str).join(' ');
    assert(content.length > 20); assert(!content.includes('Imprimir / salvar PDF')); assert(!content.includes('Voltar ao editor'));
    const images = operators.fnArray.filter(op => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat].includes(op)).length;
    const fonts = [...new Set(text.items.filter(item => 'fontName' in item).map(item => item.fontName))].map(id => {
      const font = page.commonObjs.get(id); assert(font); assert(/NotoSans/.test(font.name)); assert(!font.missingFile); return { name: font.name, embedded: !font.missingFile };
    });
    assert(fonts.length > 0);
    pages.push({ widthMm, heightMm, content, fonts, images, vectorOperations: operators.fnArray.filter(op => op === OPS.constructPath).length });
  }
  assert(pages[0].content.includes('catálogo revisado')); assert(pages[1].content.includes('Especificaciones'));
  assert(pages.some(page => page.content.includes('TA-25N'))); assert(pages.some(page => page.images > 0));
  const allText = pages.map(page => page.content).join(' ');
  for (const technical of ['±0,1 °C', '0,01 °C', '±0,02 °C', 'Ø25,4 mm × 124 mm', '200 W', '−1 a 24,5 mA', 'EN 61010-1:2010+A1:2019']) assert(allText.includes(technical), 'PDF technical token lost: ' + technical);
  assert(pages.some(page => page.vectorOperations > 0));
  await pdf.destroy(); return { pageCount: 2, pages };
}
let browser;
let evidence;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await context.newPage(); watch(page, 'create-edit-reopen');
  await page.goto(origin + '/v2', { waitUntil: 'networkidle' });
  await page.locator('[data-catalog-library]').waitFor();
  await page.getByRole('button', { name: 'Novo catálogo', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /Em branco/ }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: /Ficha técnica essencial/ }).isVisible(), true);
  await page.getByRole('button', { name: /PRESYS · TA-25N — produto e especificações/ }).click();
  await page.waitForURL(/\/v2\?catalog=/);
  const catalogUrl = page.url();
  const catalogId = new URL(catalogUrl).searchParams.get('catalog');
  packagedDisabled = true;
  await page.locator('[data-vnext-shell]').waitFor();
  const created = await state(page);
  assert.equal(created.document.pages.length, 2);
  for (const p of created.document.pages) assert.deepEqual([p.widthMm, p.heightMm, p.safeArea.topMm, p.safeArea.rightMm, p.safeArea.bottomMm, p.safeArea.leftMm], [210, 297, 12, 12, 12, 12]);
  assert.equal(counters.creates, 1); assert.equal(counters.uploads, 1); assert.equal(counters.packagedReads, 1);
  assert.equal(catalogs.get(catalogId).remoteRevision, 1);
  const asset = created.document.assets[0];
  assert.equal(asset.sha256, contract.image.sha256); assert.equal(asset.mime, 'image/png');
  assert.equal(asset.id === contract.assetManifestSemantics.seedAssetId, false);
  assert.equal(JSON.stringify(created.document).includes('w2c-demo-ta25n'), false);
  assert.equal(/blob:|https?:\/\//.test(JSON.stringify(created.document)), false);
  await decodedImage(page, asset.id);
  await page.screenshot({ path: resolve(output, 'page-1.png'), fullPage: true });
  const brand = created.document.pages[0].objects.find(object => object.type === 'text');
  const brandHit = page.locator(`[data-editor-object-id="${brand.id}"]`);
  await brandHit.click(); await brandHit.press('Enter');
  await page.locator('[data-text-edit-textarea]').fill('PRESYS · revisão interna C.1');
  await page.locator('[data-editor-action="commit-text"]').click();
  await page.locator('[data-text-edit-textarea]').waitFor({ state: 'detached' });
  await selectPage(page, 1);
  const technical = (await state(page)).document.pages[1].objects.find(object => object.type === 'table');
  await page.locator(`[data-editor-object-id="${technical.id}"]`).click();
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.locator('[data-editor-action="edit-table"]').click();
    try { await page.locator('[data-table-grid-overlay]').waitFor({ timeout: 500 }); break; }
    catch { if (attempt === 19) throw new Error('Measured table grid unavailable'); }
  }
  await page.locator('[data-table-cell="0:1"]').click();
  await page.locator('[data-table-grid-overlay]').press('Enter');
  await page.locator('[data-cell-rich-text]').fill('A COMPLETAR · revisar com engenharia');
  await page.locator('[data-editor-action="commit-cell-content"]').click();
  await page.locator('[data-cell-edit-session]').waitFor({ state: 'detached' });
  const save = page.locator('[data-editor-action="save"]');
  if (await save.isEnabled()) await save.click();
  await saved(page);
  await page.screenshot({ path: resolve(output, 'page-2-edited.png'), fullPage: true });
  assert(JSON.stringify(catalogs.get(catalogId).documentSnapshot).includes('revisão interna C.1'));
  assert(JSON.stringify(catalogs.get(catalogId).documentSnapshot).includes('revisar com engenharia'));
  await page.getByRole('button', { name: 'Voltar aos catálogos' }).click();
  await page.locator('[data-catalog-library]').waitFor();
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.locator('[data-vnext-shell]').waitFor();
  assert.equal(page.url(), catalogUrl);
  const reopened = await state(page);
  assert(JSON.stringify(reopened.document).includes('revisão interna C.1'));
  assert(JSON.stringify(reopened.document).includes('revisar com engenharia'));
  await decodedImage(page, asset.id);
  assert.equal(counters.uploads, 1);
  await context.close();

  const freshContext = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const fresh = await freshContext.newPage(); watch(fresh, 'translation-copy');
  await fresh.goto(catalogUrl, { waitUntil: 'networkidle' });
  await fresh.locator('[data-vnext-shell]').waitFor();
  const sourceBefore = structuredClone(catalogs.get(catalogId));
  await fresh.getByRole('button', { name: 'Traduzir', exact: true }).focus();
  await fresh.getByRole('button', { name: 'Traduzir', exact: true }).press('Enter');
  await fresh.getByRole('button', { name: 'Gerar tradução', exact: true }).click();
  await fresh.locator('[data-translation-run="0"]').waitFor();
  assert.equal(await fresh.locator('[data-translation-review]').evaluate(dialog => dialog.contains(document.activeElement)), true);
  assert.equal(await fresh.locator('[data-vnext-shell]').evaluate(shell => shell.inert), true);
  await fresh.setViewportSize({ width: 390, height: 844 });
  const translationBounds = await fresh.locator('[data-translation-review]').boundingBox();
  assert(translationBounds.x >= 0 && translationBounds.x + translationBounds.width <= 390);
  await fresh.screenshot({ path: resolve(output, 'translation-mobile.png'), fullPage: true });
  await fresh.setViewportSize({ width: 1600, height: 1100 });
  assert((await fresh.locator('[data-translation-run="0"]').inputValue()).includes('TA-25N'));
  await fresh.locator('[data-translation-run="0"]').fill('Título sem códigos');
  await fresh.locator('[data-translation-run="0"]').blur();
  assert.equal(await fresh.locator('[data-translation-action="accept"]').isEnabled(), false);
  const secondRun = fresh.locator('[data-translation-run="1"]');
  await secondRun.fill('PRESYS');
  await secondRun.blur();
  assert.equal(await fresh.locator('[data-translation-action="accept"]').isEnabled(), false);
  await fresh.locator('[data-translation-run="0"]').fill('Catálogo revisado PRESYS TA-25N');
  await fresh.locator('[data-translation-run="0"]').blur();
  assert.equal(await fresh.locator('[data-translation-action="accept"]').isEnabled(), true);
  await fresh.screenshot({ path: resolve(output, 'translation-review.png'), fullPage: true });
  await fresh.getByRole('button', { name: 'Salvar cópia traduzida', exact: true }).dblclick();
  await fresh.getByRole('button', { name: 'Abrir cópia traduzida', exact: true }).waitFor();
  assert.equal(counters.creates, 2);
  const copy = [...catalogs.values()].find(item => item.catalogId !== catalogId);
  assert(copy); assert.equal(copy.locale, 'es-ES');
  assert.deepEqual(copy.origin, { originKind: 'translation', originId: catalogId, originRevision: sourceBefore.remoteRevision });
  assert.equal(copy.documentSnapshot.title, 'Catálogo revisado PRESYS TA-25N');
  assert.deepEqual(copy.documentSnapshot.assets, sourceBefore.documentSnapshot.assets);
  const layout = document => document.pages.map(p => ({ width: p.widthMm, height: p.heightMm, safeArea: p.safeArea,
    frames: p.objects.map(o => ({ type: o.type, frame: o.frame, zIndex: o.zIndex, style: o.style, imageAsset: o.assetId })) }));
  assert.deepEqual(layout(copy.documentSnapshot), layout(sourceBefore.documentSnapshot));
  assert.deepEqual(catalogs.get(catalogId), sourceBefore);
  await fresh.getByRole('button', { name: 'Abrir cópia traduzida', exact: true }).click();
  await fresh.waitForURL(url => url.searchParams.get('catalog') === copy.catalogId);
  await fresh.locator('[data-vnext-shell]').waitFor();
  const decoded = await decodedImage(fresh, asset.id);
  const copyText = (await state(fresh)).document.pages[0].objects.find(o => o.type === 'text');
  await fresh.locator(`[data-editor-object-id="${copyText.id}"]`).click();
  await fresh.locator(`[data-editor-object-id="${copyText.id}"]`).press('Enter');
  await fresh.locator('[data-text-edit-textarea]').fill(Array(14).fill('PRESYS contenido largo para revisión').join('\n'));
  await fresh.locator('[data-editor-action="commit-text"]').click();
  await fresh.locator('[data-text-edit-textarea]').waitFor({ state: 'detached' });
  if (await fresh.locator('[data-editor-action="save"]').isEnabled()) await fresh.locator('[data-editor-action="save"]').click();
  await saved(fresh);
  await fresh.getByRole('button', { name: 'Publicar / PDF', exact: true }).click();
  await fresh.locator('[data-publication-status="BLOCKED"]').waitFor();
  assert.equal(await fresh.locator('[data-publication-host] [data-page-id]').count(), 2);
  assert.equal(await fresh.locator('[data-publication-action="print"]').isEnabled(), false);
  const blocked = await fresh.locator('[data-publication-diagnostic]').allTextContents();
  assert(await fresh.locator('[data-publication-diagnostic="TEXT_OBJECT_OVERFLOW"]').count() > 0);
  assert(blocked.some(text => text.includes('Página 1') && text.includes('texto')));
  await fresh.screenshot({ path: resolve(output, 'publication-blocked.png'), fullPage: true });
  await fresh.getByRole('button', { name: 'Voltar ao editor', exact: true }).click();
  await fresh.locator('[data-publication-host]').waitFor({ state: 'detached' });
  const correction = fresh.locator('[data-editor-object-id="' + copyText.id + '"]');
  await correction.click(); await correction.press('Enter');
  await fresh.locator('[data-text-edit-textarea]').fill('PRESYS · catálogo revisado');
  await fresh.locator('[data-editor-action="commit-text"]').click();
  await fresh.locator('[data-text-edit-textarea]').waitFor({ state: 'detached' });
  if (await fresh.locator('[data-editor-action="save"]').isEnabled()) await fresh.locator('[data-editor-action="save"]').click();
  await saved(fresh);
  await fresh.getByRole('button', { name: 'Voltar aos catálogos', exact: true }).click();
  await fresh.locator('[data-catalog-library]').waitFor();
  const copyRow = fresh.locator('[data-library-catalog-id="' + copy.catalogId + '"]');
  await copyRow.getByRole('button', { name: 'Abrir', exact: true }).click();
  await fresh.locator('[data-vnext-shell]').waitFor();
  await fresh.locator('[data-vnext-shell]').waitFor();
  assert(JSON.stringify((await state(fresh)).document).includes('catálogo revisado'));
  assert.deepEqual(catalogs.get(copy.catalogId).origin, copy.origin);
  assert.deepEqual(catalogs.get(catalogId), sourceBefore);
  await fresh.screenshot({ path: resolve(output, 'translated-copy.png'), fullPage: true });
  await fresh.evaluate(() => { window.__W5C_PRINT_COUNT__ = 0; window.print = () => { window.__W5C_PRINT_COUNT__++; }; });
  await fresh.setViewportSize({ width: 390, height: 844 });
  await fresh.getByRole('button', { name: 'Publicar / PDF', exact: true }).focus();
  await fresh.getByRole('button', { name: 'Publicar / PDF', exact: true }).press('Enter');
  await fresh.locator('[data-publication-status="READY"]').waitFor();
  const publicationBounds = await fresh.getByRole('dialog', { name: 'Revisar e publicar' }).boundingBox();
  assert(publicationBounds.x >= 0 && publicationBounds.x + publicationBounds.width <= 390);
  assert.equal(await fresh.locator('[data-publication-host] [data-page-id]').count(), 2);
  assert.equal(await fresh.locator('[data-vnext-shell]').evaluate(shell => shell.inert), true);
  const previewFacts = await fresh.locator('[data-publication-host] [data-editorial-root]').evaluate(root => ({
    transform: getComputedStyle(root).transform, zoom: getComputedStyle(root).zoom,
    pageWidth: root.querySelector('[data-page-id]').getBoundingClientRect().width,
    text: root.textContent, decoded: [...root.querySelectorAll('img')].every(image => image.complete && image.naturalWidth === 720)
  }));
  assert.equal(previewFacts.transform, 'none'); assert.equal(previewFacts.zoom, '1');
  assert(Math.abs(previewFacts.pageWidth - 210 * 96 / 25.4) < .05);
  assert(previewFacts.text.includes('Especificaciones')); assert(previewFacts.text.includes('TA-25N')); assert(previewFacts.decoded);
  const previewRegion = fresh.getByRole('region', { name: 'Prévia de todas as páginas' });
  await previewRegion.focus(); await previewRegion.press('ArrowRight');
  await fresh.waitForFunction(() => document.querySelector('.vnext-publication-pages').scrollLeft > 0);
  for (let i = 0; i < 7; i++) {
    await fresh.keyboard.press('Tab');
    assert.equal(await fresh.getByRole('dialog', { name: 'Revisar e publicar' }).evaluate(dialog => dialog.contains(document.activeElement)), true);
  }
  await fresh.locator('[data-publication-action="print"]').scrollIntoViewIfNeeded();
  await fresh.screenshot({ path: resolve(output, 'publication-mobile.png'), fullPage: true });
  await fresh.keyboard.press('Escape');
  await fresh.locator('[data-publication-host]').waitFor({ state: 'detached' });
  assert.equal(await fresh.locator('[data-vnext-shell]').evaluate(shell => shell.inert), false);
  assert.equal(await fresh.getByRole('button', { name: 'Publicar / PDF', exact: true }).evaluate(button => button === document.activeElement), true);
  await fresh.setViewportSize({ width: 1600, height: 1100 });
  await fresh.getByRole('button', { name: 'Publicar / PDF', exact: true }).click();
  await fresh.locator('[data-publication-status="READY"]').waitFor();
  const reviewedDocument = JSON.stringify((await state(fresh)).document);
  await fresh.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  assert.equal(await fresh.locator('[data-publication-host]').getAttribute('data-print-approved'), null, 'Ctrl+P must not approve');
  await fresh.locator('[data-publication-action="print"]').click();
  await fresh.waitForFunction(() => window.__W5C_PRINT_COUNT__ === 1);
  assert.equal(await fresh.locator('[data-publication-host]').getAttribute('data-print-approved'), 'true');
  await fresh.emulateMedia({ media: 'print' });
  const pdfPath = resolve(output, 'translated-catalog.pdf');
  await fresh.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true,
    displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' }, scale: 1 });
  assert.equal(JSON.stringify((await state(fresh)).document), reviewedDocument);
  assert.deepEqual(catalogs.get(catalogId), sourceBefore);
  const pdfEvidence = await inspectPdf(pdfPath);
  await fresh.emulateMedia({ media: 'screen' });
  await fresh.screenshot({ path: resolve(output, 'publication-desktop.png'), fullPage: true });
  await fresh.evaluate(() => window.__C1_RUNTIME__.workspace.getSnapshot().session.execute({ type: 'document.rename', title: 'Mutação adversarial após revisão' }));
  await fresh.locator('[data-publication-status="STALE"]').waitFor();
  assert.equal(await fresh.locator('[data-publication-action="print"]').isEnabled(), false);
  assert.equal(await fresh.locator('[data-publication-host]').getAttribute('data-print-approved'), null);
  await fresh.getByRole('button', { name: 'Voltar ao editor', exact: true }).click();
  const adversarialContext = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const adversarial = await adversarialContext.newPage(); watch(adversarial, 'stale-translation');
  await adversarial.goto(catalogUrl, { waitUntil: 'networkidle' });
  await adversarial.locator('[data-vnext-shell]').waitFor();
  await adversarial.getByRole('button', { name: 'Traduzir', exact: true }).click();
  holdTranslation = true;
  await adversarial.getByRole('button', { name: 'Gerar tradução', exact: true }).click();
  for (let wait = 0; !releaseTranslation && wait < 100; wait++) await new Promise(resolveWait => setTimeout(resolveWait, 10));
  assert(releaseTranslation);
  await adversarial.evaluate(() => window.__C1_RUNTIME__.workspace.getSnapshot().session.execute({ type: 'document.rename', title: 'Origem alterada durante tradução' }));
  releaseTranslation(); holdTranslation = false;
  await adversarial.getByRole('alert').filter({ hasText: 'origem mudou' }).waitFor();
  assert.equal(await adversarial.locator('[data-translation-action="accept"]').count(), 0);
  assert.equal(counters.creates, 2);
  assert.deepEqual(catalogs.get(catalogId), sourceBefore);
  assert.equal(counters.uploads, 1); assert.equal(counters.packagedReads, 1);
  const authorityContext = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const authority = await authorityContext.newPage(); watch(authority, 'publication-authority-loss');
  await authority.goto(origin + '/v2?catalog=' + copy.catalogId, { waitUntil: 'networkidle' });
  await authority.locator('[data-vnext-shell]').waitFor();
  await authority.getByRole('button', { name: 'Publicar / PDF', exact: true }).click();
  await authority.locator('[data-publication-status="READY"]').waitFor();
  await authority.evaluate(() => {
    window.__C1_RUNTIME__.protectForAuthorityLoss = () => new Promise(() => {});
    document.querySelector('[data-publication-host]').dataset.printApproved = 'true';
    window.__W5C_LOSE_AUTH__();
  });
  await authority.locator('[data-vnext-access-state="protecting"]').waitFor();
  assert.equal(await authority.locator('[data-publication-host]').isVisible(), false);
  assert.equal(await authority.locator('[data-publication-host]').evaluate(portal => portal.inert), true);
  assert.equal(await authority.locator('[data-publication-host]').getAttribute('data-print-approved'), null);
  assert.equal(await authority.getByRole('heading', { name: 'Protegendo alterações locais…' }).isVisible(), true);
  assert.deepEqual(errors, { consoleErrors: [], pageErrors: [], failedResources: [], requestFailures: [] });
  evidence = { result: 'PASS', infrastructure: 'controlled provider/RPC transport; production bootstrap/UI/W5.A/canonical clone/W3 create/save/reopen',
    sourceCatalogId: catalogId, copyCatalogId: copy.catalogId, sourceUnchanged: true, geometryAssetsPreserved: true,
    technicalTokensPreserved: true, correctedReview: true, provenance: copy.origin, staleResultRejected: true,
    exactlyOneCopy: true, copyEditSaveReopen: true, decoded, counters, translationRequests, errors,
    publication: { allPages: 2, overflowBlocked: true, correctedThroughUI: true, staleBlocked: true, authorityLossPortalHidden: true, keyboardPreviewScroll: true, keyboardMobile: true, canonicalPreview: previewFacts, pdf: pdfEvidence },
    realBackendAuthenticatedAcceptance: 'NOT AVAILABLE — controlled proof is not real-backend acceptance' };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
  console.log('W5.C Publication Review Chromium/PDF proof: PASS');
  await freshContext.close();
  await adversarialContext.close();
  await authorityContext.close();
} catch (error) {
  const failedPage = browser?.contexts().at(-1)?.pages().at(-1);
  const visibleUI = failedPage ? await failedPage.locator('body').innerText().catch(() => 'Page unavailable') : 'Page unavailable';
  if (failedPage) await failedPage.screenshot({ path: resolve(output, 'failure-ui.png'), fullPage: true }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ message: error.message, visibleUI, errors, counters, requests }, null, 2));
  throw error;
} finally { await browser?.close(); await server.close(); }
