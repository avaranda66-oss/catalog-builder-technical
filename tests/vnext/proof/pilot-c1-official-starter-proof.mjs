import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/pilot-c1-official-starter-proof');
await mkdir(output, { recursive: true });
const contract = JSON.parse(await readFile(resolve(root, 'docs/vnext/pilot-c1-source-contract.json'), 'utf8'));
const approvedBytes = await readFile(resolve(root, contract.image.packagedPath));
assert.equal(createHash('sha256').update(approvedBytes).digest('hex'), contract.image.sha256);
assert.equal(approvedBytes.length, contract.image.byteLength);
const port = Number(process.env.C1_PROOF_PORT ?? 5273);
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

// Only authorization and transport are controlled. All starter/editor/asset/create code is production code.
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><div id="root"></div><script type="module">
import { mountVNextApp } from '/src/vnext/app/bootstrap.tsx';
import { useAuthStore } from '/src/stores/useAuthStore.ts';
import { getSupabase } from '/src/services/supabase.service.ts';
import { VNextPersistenceRuntime } from '/src/vnext/persistence/index.ts';
useAuthStore.setState({ status: 'authenticated', userId: '${identity}', role: 'editor', email: 'controlled@proof.local', errorMessage: null, initialize: async () => {} });
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
} }], server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });

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
  const fresh = await freshContext.newPage(); watch(fresh, 'fresh-session');
  await fresh.goto(catalogUrl, { waitUntil: 'networkidle' });
  await fresh.locator('[data-vnext-shell]').waitFor();
  const freshState = await state(fresh);
  assert(JSON.stringify(freshState.document).includes('revisão interna C.1'));
  assert(JSON.stringify(freshState.document).includes('revisar com engenharia'));
  const decoded = await decodedImage(fresh, asset.id);
  assert.equal(counters.uploads, 1); assert.equal(counters.packagedReads, 1);
  const afterCreate = requests.filter(request => request.afterCreate);
  assert.equal(afterCreate.some(request => /presys\.com\.br|ta-25n-official\.jpg|w2c-demo|\/labs\/|ta-25n-starter-v1\.png/.test(request.url)), false);
  assert.deepEqual(errors, { consoleErrors: [], pageErrors: [], failedResources: [], requestFailures: [] });
  evidence = { result: 'PASS', infrastructure: 'controlled transport; production bootstrap, registry, Library service, prepared create, editor and asset bridge/repository',
    catalogId, pages: 2, pageSizeMm: [210, 297], safeAreaMm: 12, hash: asset.sha256, assetId: asset.id, decoded,
    editableText: true, editableTechnicalTable: true, reopenEditsPersist: true, freshContextReopen: true,
    counters, uploadCountCreate: 1, uploadCountReopen: 0, uploadCountFreshContext: 0,
    noPackagedFallbackAfterCreate: true, noExternalOrDemoDependency: true, errors,
    realBackendAuthenticatedAcceptance: 'NOT AVAILABLE — controlled proof is not real-backend acceptance' };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
  await freshContext.close();
} catch (error) {
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ message: error.message, errors, counters, requests }, null, 2));
  throw error;
} finally { await browser?.close(); await server.close(); }
