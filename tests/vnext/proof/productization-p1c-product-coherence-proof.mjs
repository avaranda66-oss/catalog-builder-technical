import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';


const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const phase = (process.env.P1C_PROOF_PHASE ?? 'after').toLowerCase();
const output = resolve(root, 'scratch/p1c-product-coherence-proof', phase);
const shots = [];
const observations = [];
const controls = { listError: false, listDelay: 0, createDelay: 0, saveDelay: 0, saveError: false, assetMissing: false, translationError: false };
const loginHtml = '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from "react"; import ReactDOM from "react-dom/client"; import {LoginView} from "/src/components/auth/LoginView.tsx"; import {useAuthStore} from "/src/stores/useAuthStore.ts"; import "/src/index.css"; useAuthStore.setState({status:"unauthenticated", signIn: async()=>useAuthStore.setState({errorMessage:"E-mail ou senha incorretos. Confira seus dados e tente novamente."})}); ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(LoginView));</script></body></html>';
const accessHtml = `<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><div id="root"></div><script type="module">
import React from 'react'; import ReactDOM from 'react-dom/client'; import {App} from '/src/App.tsx';
import {useAuthStore} from '/src/stores/useAuthStore.ts'; import '/src/index.css';
const status = new URL(location.href).searchParams.get('state') ?? 'session-error';
useAuthStore.setState({ status, userId: null, role: null, email: null,
  errorMessage: 'Não foi possível verificar sua sessão agora. Tente novamente.', initialize: async () => {}, retryProfile: async () => {} });
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`;
await mkdir(output, { recursive: true });
const contract = JSON.parse(await readFile(resolve(root, 'docs/vnext/pilot-c1-source-contract.json'), 'utf8'));
const approvedBytes = await readFile(resolve(root, contract.image.packagedPath));
assert.equal(createHash('sha256').update(approvedBytes).digest('hex'), contract.image.sha256);
assert.equal(approvedBytes.length, contract.image.byteLength);
const port = Number(process.env.P1C_PROOF_PORT ?? 5262);
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
      if (pathname === '/__p1c/control') { Object.assign(controls, JSON.parse((await body(req)).toString())); json(res, controls); return; }
      if (pathname === '/__p1c/login') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await devServer.transformIndexHtml(req.url, loginHtml)); return; }
      if (pathname === '/__p1c/access') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await devServer.transformIndexHtml(req.url, accessHtml)); return; }
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
        if (controls.translationError) { json(res, {error:{code:"PROVIDER_FAILURE", message:"Controlled provider unavailable"}}); return; }
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
        if (name === 'get_vnext_asset_v1') { counters.assetReads++; json(res, ok(controls.assetMissing ? null : assets.get(a.p_asset_id) ?? null)); return; }
        if (name === 'list_vnext_catalogs_v1') {
          if (controls.listDelay) await new Promise(done => setTimeout(done, controls.listDelay));
          if (controls.listError) { json(res, {data: null, error:{code:'P0001', message:'REMOTE_FAILURE'}}); return; }
          json(res, ok([...catalogs.values()].map(({ documentSnapshot: _doc, lastMutationId: _mutation, ...metadata }) => metadata))); return;
        }
        if (name === 'create_vnext_catalog_v1') {
          if (controls.createDelay) await new Promise(done => setTimeout(done, controls.createDelay));
          assert.equal(catalogs.has(a.p_document_snapshot.id), false);
          assert(a.p_document_snapshot.pages.length > 0);
          for (const ref of a.p_document_snapshot.assets) assert(assets.has(ref.id), 'CREATE must follow durable preparation');
          const value = envelope(a.p_document_snapshot, a.p_mutation_id, undefined, a.p_origin);
          catalogs.set(value.catalogId, value); counters.creates++; json(res, ok(value)); return;
        }
        if (name === 'get_vnext_catalog_v1') { assert(catalogs.has(a.p_catalog_id)); json(res, ok(catalogs.get(a.p_catalog_id))); return; }
        if (name === 'save_vnext_catalog_cas_v1') {
          if (controls.saveDelay) await new Promise(done => setTimeout(done, controls.saveDelay));
          if (controls.saveError) { json(res, { data: null, error: { code: 'P0001', message: 'Controlled save unavailable' } }); return; }
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
async function control(page, value) {
  await page.request.post(origin + '/__p1c/control', { data: value });
}
async function headerPaint(page, bytes) {
  if (await page.locator('[data-translation-review], [data-publication-host]').count() > 0) return null;
  const mark = page.locator('.vnext-topbar .vnext-brand-mark, .vnext-library-header .vnext-brand-mark').first();
  if (await mark.count() === 0 || !await mark.isVisible()) return null;
  const bounds = await mark.boundingBox();
  if (!bounds || bounds.y < 0 || bounds.y + bounds.height > page.viewportSize().height) return null;
  return page.evaluate(async ({ encoded, bounds }) => {
    const raster = new Image(); raster.src = 'data:image/png;base64,' + encoded; await raster.decode();
    const canvas = document.createElement('canvas'); canvas.width = raster.naturalWidth; canvas.height = raster.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(raster, 0, 0);
    const pixels = context.getImageData(Math.ceil(bounds.x), Math.ceil(bounds.y), Math.floor(bounds.width), Math.floor(bounds.height)).data;
    let bluePixels = 0;
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index + 2] > pixels[index] + 20 && pixels[index + 2] > pixels[index + 1] + 20) bluePixels++;
    return { bluePixels, sampledPixels: pixels.length / 4 };
  }, { encoded: bytes.toString('base64'), bounds });
}
async function shot(page, name, width) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const path = resolve(output, `${width}-${name}.png`);
  let bytes = await page.screenshot({ path, fullPage: true });
  if (phase !== 'before') {
    let paint = await headerPaint(page, bytes);
    if (paint && paint.bluePixels < 100) {
      await page.setViewportSize(page.viewportSize());
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      bytes = await page.screenshot({ path, fullPage: true });
      paint = await headerPaint(page, bytes);
    }
    if (paint) assert(paint.bluePixels >= 100, JSON.stringify({ name, width, paint }));
    observations.push({ name, width, headerPaint: paint });
  }
  shots.push(path);
  const bounds = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
  observations.push({ name, width, bounds });
  if (phase !== 'before') assert(bounds.body <= bounds.viewport && bounds.document <= bounds.viewport, JSON.stringify({ name, bounds }));
  if (phase !== 'before' && width === 820 && /^(inspector-(text|image|table)|table-advanced)/.test(name)) {
    const scroll = await page.evaluate(() => [document.scrollingElement, ...document.querySelectorAll('.vnext-shell,.vnext-workspace,.vnext-canvas-area,.vnext-info')].map(node => ({ x: node.scrollLeft, y: node.scrollTop })));
    await page.locator('.vnext-info').evaluate(node => node.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const inspectorPath = resolve(output, `${width}-${name}-inspector-visible.png`);
    await page.screenshot({ path: inspectorPath, fullPage: false }); shots.push(inspectorPath);
    await page.evaluate(scroll => [document.scrollingElement, ...document.querySelectorAll('.vnext-shell,.vnext-workspace,.vnext-canvas-area,.vnext-info')].forEach((node, index) => node.scrollTo(scroll[index].x, scroll[index].y)), scroll);
  }
}
async function modalKeyboard(page, dialog) {
  assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
  }
}
async function save(page) {
  const button = page.locator('[data-editor-action="save"]');
  if (await button.isEnabled()) await button.click();
  await page.waitForFunction(() => { const value = window.__C1_STATE__(); return value && !value.dirty && value.save.phase !== 'saving'; });
}
async function selectPage(page, index) {
  await page.locator('.vnext-page-list button').nth(index).click();
}
async function workflow(browser, width, first) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage(); watch(page, String(width));
  await page.goto(origin + '/__p1c/login', { waitUntil: 'networkidle' });
  await page.getByLabel('E-mail', { exact: true }).waitFor();
  await shot(page, 'login', width);
  await page.getByLabel('E-mail', { exact: true }).fill('proof@presys.local');
  await page.getByLabel('Senha', { exact: true }).fill('controlled');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await shot(page, 'login-error', width);
  if (phase !== 'before') {
    await page.goto(origin + '/__p1c/access?state=loading', { waitUntil: 'networkidle' });
    await page.getByRole('status').waitFor();
    await shot(page, 'session-loading', width);
    await page.goto(origin + '/__p1c/access?state=session-error', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Sessão indisponível', exact: true }).waitFor();
    await shot(page, 'session-error', width);
  }
  if (phase !== 'before') await control(page, { listDelay: 1400 });
  await page.goto(origin + '/v2', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-catalog-library]').waitFor();
  if (phase !== 'before') {
    await page.locator('.vnext-library-loading').waitFor();
    await shot(page, 'library-loading', width);
    await control(page, { listDelay: 0 });
  }
  await page.locator('.vnext-library-loading').waitFor({ state: 'detached' });
  await shot(page, first ? 'library-empty' : 'library', width);
  await page.getByRole('button', { name: 'Novo catálogo', exact: true }).click();
  const create = page.getByRole('dialog');
  await create.waitFor();
  for (const title of [/Em branco/, /Ficha técnica essencial/, /PRESYS.*TA-25N/]) assert.equal(await create.getByRole('button', { name: title }).isVisible(), true);
  if (phase !== 'before') await modalKeyboard(page, create);
  await shot(page, 'create-options', width);
  await page.keyboard.press('Escape');
  await create.waitFor({ state: 'detached' });
  if (phase !== 'before') assert.equal(await page.getByRole('button', { name: 'Novo catálogo', exact: true }).evaluate(node => node === document.activeElement), true);
  await page.getByRole('button', { name: 'Novo catálogo', exact: true }).click();
  if (phase !== 'before') await control(page, { createDelay: 1400 });
  await page.getByRole('dialog').getByRole('button', { name: /PRESYS.*TA-25N/ }).click();
  if (phase !== 'before') {
    await page.getByRole('button', { name: 'Criando catálogo', exact: true }).waitFor();
    await shot(page, 'create-pending', width);
    await control(page, { createDelay: 0 });
  }
  await page.waitForURL(/\/v2\?catalog=/);
  await page.locator('[data-vnext-shell]').waitFor();
  const created = await state(page), catalogId = created.document.id;
  const text = created.document.pages[0].objects.find(object => object.type === 'text');
  const image = created.document.pages[0].objects.find(object => object.type === 'image');
  await page.locator('[data-editorial-root] img').first().evaluate(node => node.decode());
  await shot(page, 'workspace-none', width);
  await page.locator(`[data-editor-object-id="${text.id}"]`).click();
  assert.equal((await page.locator('.vnext-info h2').textContent()).trim(), 'Texto');
  assert.equal(await page.locator('[data-inspector-authoring]').count(), 0);
  await shot(page, 'inspector-text', width);
  const beforeDisclosure = JSON.stringify((await state(page)).document);
  await page.locator('[data-editor-action="toggle-inspector-details"]').click();
  await shot(page, 'inspector-text-properties', width);
  await page.locator(`[data-editor-object-id="${image.id}"]`).click();
  assert.equal((await page.locator('.vnext-info h2').textContent()).trim(), 'Imagem');
  assert.equal(await page.locator('[data-editor-action="toggle-inspector-details"]').getAttribute('aria-expanded'), 'false');
  assert.equal(JSON.stringify((await state(page)).document), beforeDisclosure);
  await shot(page, 'inspector-image', width);
  await page.locator('[data-editor-action="toggle-advanced-tools"]').click();
  await shot(page, 'more-options', width);
  await page.locator('[data-editor-action="toggle-advanced-tools"]').click();
  await selectPage(page, 1);
  const table = (await state(page)).document.pages[1].objects.find(object => object.type === 'table');
  await page.locator(`[data-editor-object-id="${table.id}"]`).click();
  await shot(page, 'inspector-table', width);
  await page.locator('[data-editor-action="toggle-table-inspector-advanced"]').click();
  await shot(page, 'table-advanced', width);
  const tableBeforeDisclosure = JSON.stringify((await state(page)).document);
  await page.locator('[data-editor-action="toggle-table-inspector-advanced"]').click();
  assert.equal(JSON.stringify((await state(page)).document), tableBeforeDisclosure);
  await page.locator('[data-editor-action="edit-table"]').click();
  await page.locator('[data-table-grid-overlay]').waitFor();
  await page.locator('[data-table-cell="0:1"]').click();
  await shot(page, 'table-cell', width);
  await page.locator('[data-editor-action="toggle-table-options"]').click();
  await shot(page, 'table-options', width);
  await page.locator('[data-editor-action="leave-table-grid"]').click();
  await selectPage(page, 0);
  await page.locator(`[data-editor-object-id="${text.id}"]`).click();
  await page.locator(`[data-editor-object-id="${text.id}"]`).press('Enter');
  await page.locator('[data-text-edit-textarea]').fill('PRESYS · catálogo profissional TA-25N');
  await page.locator('[data-editor-action="commit-text"]').click();
  await page.locator('[data-text-edit-textarea]').waitFor({ state: 'detached' });
  await control(page, { saveDelay: 1100 });
  await page.locator('[data-editor-action="save"]').click();
  await page.waitForFunction(() => window.__C1_STATE__()?.save.phase === 'saving');
  await shot(page, 'save-pending', width);
  await save(page);
  await control(page, { saveDelay: 0 });
  await shot(page, 'save-success', width);
  if (phase !== 'before') {
    await control(page, { saveError: true });
    await page.locator(`[data-editor-object-id="${text.id}"]`).click();
    await page.locator(`[data-editor-object-id="${text.id}"]`).press('Enter');
    await page.locator('[data-text-edit-textarea]').fill('PRESYS · catálogo profissional TA-25N revisado');
    await page.locator('[data-editor-action="commit-text"]').click();
    await page.locator('[data-text-edit-textarea]').waitFor({ state: 'detached' });
    await page.locator('[data-editor-action="save"]').click();
    await page.waitForFunction(() => window.__C1_STATE__()?.save.phase === 'unavailable');
    assert.equal((await state(page)).dirty, true);
    await shot(page, 'save-error', width);
    await control(page, { saveError: false });
    await save(page);
  }
  await page.locator('[data-editor-action="translate"]').click();
  await page.locator('[data-translation-review]').waitFor();
  if (phase !== 'before') await modalKeyboard(page, page.locator('[data-translation-review]'));
  await shot(page, 'translation-dialog', width);
  holdTranslation = true;
  await page.locator('[data-translation-action="generate"]').click();
  await page.getByRole('status').filter({ hasText: /Gerando tradução/ }).waitFor();
  await shot(page, 'translation-pending', width);
  holdTranslation = false; releaseTranslation?.();
  await page.locator('[data-translation-run="0"]').waitFor();
  await shot(page, 'translation-review', width);
  await page.locator('[data-translation-action="accept"]').click();
  await page.locator('[data-translation-action="open-copy"]').waitFor();
  await shot(page, 'translation-created', width);
  const copy = [...catalogs.values()].find(item => item.origin?.originId === catalogId);
  assert(copy); assert.equal(copy.locale, 'es-ES');
  await page.keyboard.press('Escape');
  await page.locator('[data-translation-review]').waitFor({ state: 'detached' });
  if (phase !== 'before') assert.equal(await page.locator('[data-editor-action="translate"]').evaluate(node => node === document.activeElement), true);
  await page.locator('[data-editor-action="publish"]').click();
  await page.locator('[data-publication-status="READY"]').waitFor();
  assert.equal(await page.locator('[data-publication-action="print"]').isEnabled(), true);
  if (phase !== 'before') await modalKeyboard(page, page.getByRole('dialog'));
  await shot(page, 'publication-ready', width);
  if (phase !== 'before' && first) {
    await page.evaluate(() => { window.__P1C_PRINT_COUNT__ = 0; window.print = () => { window.__P1C_PRINT_COUNT__++; }; });
    await page.locator('[data-publication-action="print"]').click();
    await page.waitForFunction(() => window.__P1C_PRINT_COUNT__ === 1);
    assert.equal(await page.locator('[data-publication-host]').getAttribute('data-print-approved'), 'true');
    await page.emulateMedia({ media: 'print' });
    const pdfPath = resolve(output, 'professional-catalog.pdf');
    await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }, scale: 1 });
    const pdf = await getDocument({ data: new Uint8Array(await readFile(pdfPath)), isEvalSupported: false, useSystemFonts: false }).promise;
    assert.equal(pdf.numPages, 2);
    let contents = '';
    for (let index = 1; index <= pdf.numPages; index++) {
      const pdfPage = await pdf.getPage(index);
      assert(Math.abs((pdfPage.view[2] - pdfPage.view[0]) * 25.4 / 72 - 210) < .5);
      assert(Math.abs((pdfPage.view[3] - pdfPage.view[1]) * 25.4 / 72 - 297) < .5);
      contents += (await pdfPage.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
    }
    assert(contents.includes('TA-25N')); assert(contents.includes('A COMPLETAR'));
    assert(!contents.includes('Revisar e publicar')); assert(!contents.includes('Imprimir / salvar PDF'));
    await pdf.destroy();
    observations.push({ nativePdf: pdfPath, pageCount: 2, a4: true, interfaceExcluded: true });
    await page.emulateMedia({ media: 'screen' });
    // Media emulation removes focused print controls; restore dialog focus before keyboard assertions.
    await page.getByRole('dialog').focus();
  }
  await page.keyboard.press('Escape');
  await page.locator('[data-publication-host]').waitFor({ state: 'detached' });
  if (phase !== 'before') assert.equal(await page.locator('[data-editor-action="publish"]').evaluate(node => node === document.activeElement), true);
  await page.locator(`[data-editor-object-id="${text.id}"]`).click();
  await page.locator(`[data-editor-object-id="${text.id}"]`).press('Enter');
  await page.locator('[data-text-edit-textarea]').fill(Array(24).fill('PRESYS conteúdo longo para revisão').join('\n'));
  await page.locator('[data-editor-action="commit-text"]').click();
  await page.locator('[data-text-edit-textarea]').waitFor({ state: 'detached' });
  await save(page);
  await page.locator('[data-editor-action="publish"]').click();
  await page.locator('[data-publication-status="BLOCKED"]').waitFor();
  assert.equal(await page.locator('[data-publication-action="print"]').isEnabled(), false);
  await page.locator('[data-publication-diagnostic="TEXT_OBJECT_OVERFLOW"]').waitFor();
  await shot(page, 'publication-blocked', width);
  if (phase !== 'before') {
    const diagnostic = page.locator('[data-publication-diagnostic="TEXT_OBJECT_OVERFLOW"]').first();
    assert.equal(await diagnostic.locator('details').evaluate(node => node.open), false);
    await diagnostic.getByText('Detalhes técnicos', { exact: true }).click();
    assert((await diagnostic.locator('details').textContent()).includes('TEXT_OBJECT_OVERFLOW'));
    await shot(page, 'publication-technical-details', width);
  }
  await page.keyboard.press('Escape');
  await page.locator('[data-publication-host]').waitFor({ state: 'detached' });
  await page.locator('[data-editor-action="translate"]').click();
  await control(page, { translationError: true });
  await page.locator('[data-translation-action="generate"]').click();
  await page.locator('[data-translation-review] [role="alert"]').waitFor();
  await shot(page, 'translation-error', width);
  await control(page, { translationError: false });
  await page.keyboard.press('Escape');
  await page.locator('[data-translation-review]').waitFor({ state: 'detached' });
  await page.locator('[data-editor-action="library"]').click();
  await page.locator('[data-catalog-library]').waitFor();
  await shot(page, 'library-translated', width);
  const row = page.locator(`[data-library-catalog-id="${catalogId}"]`);
  if (phase !== 'before') {
    const copyRow = page.locator(`[data-library-catalog-id="${copy.catalogId}"]`);
    await copyRow.getByRole('button', { name: 'Abrir', exact: true }).click();
    await page.locator('[data-vnext-shell]').waitFor();
    assert.equal((await state(page)).document.locale, 'es-ES');
    await page.locator('[data-editor-action="translate"]').click();
    await page.locator('[data-translation-review]').waitFor();
    assert.equal((await page.locator('.vnext-translation-languages strong').textContent()).trim(), 'Espanhol');
    await shot(page, 'translated-copy-source-locale', width);
    await page.keyboard.press('Escape');
    await page.locator('[data-translation-review]').waitFor({ state: 'detached' });
    await page.locator('[data-editor-action="library"]').click();
    await page.locator('[data-catalog-library]').waitFor();
  }
  await row.getByRole('button', { name: 'Renomear', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await shot(page, 'rename-dialog', width);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await row.getByRole('button', { name: 'Arquivar', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await shot(page, 'archive-confirmation', width);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.getByRole('searchbox').fill('nenhum-catálogo-prova-xyz');
  await page.locator('.vnext-library-empty.is-search').waitFor();
  await shot(page, 'search-empty', width);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('tab', { name: 'Arquivados', exact: true }).click();
  await page.getByText('Nenhum catálogo arquivado', { exact: true }).waitFor();
  await shot(page, 'archived-empty', width);
  await control(page, { listError: true });
  await page.getByRole('tab', { name: 'Ativos', exact: true }).click();
  await page.locator('[data-library-list-error]').waitFor();
  await shot(page, 'library-error', width);
  await control(page, { listError: false });
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await row.waitFor();
  await row.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.locator('[data-vnext-shell]').waitFor();
  assert.equal((await state(page)).document.id, catalogId);
  assert.equal((await state(page)).dirty, false);
  await shot(page, 'workspace-reopened', width);
  if (phase !== 'before') {
    await control(page, { assetMissing: true });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-vnext-shell]').waitFor();
    await page.waitForFunction(() => window.__C1_STATE__()?.states.some(([, value]) => value.status === 'unavailable'));
    await shot(page, 'missing-image', width);
    await page.locator('[data-editor-action="publish"]').click();
    await page.locator('[data-publication-status="BLOCKED"]').waitFor();
    assert.equal(await page.locator('[data-publication-action="print"]').isEnabled(), false);
    await shot(page, 'publication-missing-image', width);
    await page.keyboard.press('Escape');
    await page.locator('[data-publication-host]').waitFor({ state: 'detached' });
    await control(page, { assetMissing: false });
  }
  await page.locator('[data-editor-action="library"]').click();
  await page.locator('[data-catalog-library]').waitFor();
  await context.close();
  return { width, catalogId, copyId: copy.catalogId, returnedToLibrary: true };
}

let browser;
try {
  await server.listen();
  console.log(`P1.C ${phase} product server: ${origin}/v2`);
  if (process.env.P1C_PROOF_SERVE === '1') {
    console.log('Controlled authorization and transport; real production bootstrap and UI.');
    await new Promise(() => {});
  }
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const [index, width] of [1600, 1280, 820].entries()) {
    results.push(await workflow(browser, width, index === 0));
    console.log(`P1.C ${phase} ${width}px captured`);
  }
  const expectedRequestFailures = errors.requestFailures.filter(item => item.error !== 'net::ERR_ABORTED');
  assert.deepEqual(errors.consoleErrors, []);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.failedResources, []);
  assert.deepEqual(expectedRequestFailures, []);
  const result = { phase, chromiumVersion: browser.version(), controlledAuthorization: true, controlledTransport: true,
    productionBootstrap: true, productionSupabaseE2E: false, results, shots, observations, counters, translationRequests, errors };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`P1.C Product Coherence Chromium ${phase} proof: PASS`);
} catch (error) {
  const last = browser?.contexts().at(-1)?.pages().at(-1);
  if (last) await last.screenshot({ path: resolve(output, 'failure-ui.png'), fullPage: true }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, shots, observations, errors }, null, 2));
  throw error;
} finally { await browser?.close(); await server.close(); }
