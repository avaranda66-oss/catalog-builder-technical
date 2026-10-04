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
const phase = (process.env.P2_PROOF_PHASE ?? 'after').toLowerCase();
const output = resolve(root, 'scratch/p2-multilingual-translation-center-proof', phase);
const shots = [];
const observations = [];
const controls = { listError: false, listDelay: 0, createDelay: 0, saveDelay: 0, saveError: false, assetMissing: false, translationError: false, translationOverflow: false };
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
const port = Number(process.env.P2_PROOF_PORT ?? 5286);
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
let translationEntered;
let translationRequests = 0;

// Only authorization and transport are controlled. All starter/editor/asset/create code is production code.
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><div id="root"></div><script type="module">
import { mountVNextApp } from '/src/vnext/app/bootstrap.tsx';
import { useAuthStore } from '/src/stores/useAuthStore.ts';
import { getSupabase } from '/src/services/supabase.service.ts';
import { VNextPersistenceRuntime } from '/src/vnext/persistence/index.ts';
import { TranslationFoundationService, ControlledTranslationProvider, MemoryTranslationRequestCache } from '/src/vnext/translation/index.ts';
import { materializeTranslationCandidate } from '/src/vnext/translation/candidate.ts';
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
window.__P2_SAFETY_PROOF__ = async () => {
  const source = structuredClone(window.__C1_STATE__().document);
  const original = JSON.stringify(source);
  const provider = new ControlledTranslationProvider();
  const cache = new MemoryTranslationRequestCache();
  const service = new TranslationFoundationService(provider, { cache, maxAttempts: 1 });
  const spanish = await service.translateCatalog(source, 'es-ES');
  const english = await service.translateCatalog(source, 'en-US');
  const spanishCached = await service.translateCatalog(source, 'es-ES');
  const englishCached = await service.translateCatalog(source, 'en-US');
  let unsupported = false;
  try { await service.translateCatalog(source, 'fr-FR'); }
  catch (error) { unsupported = error.code === 'UNSUPPORTED_LANGUAGE'; }
  const staleSource = structuredClone(source); staleSource.title += ' changed';
  let stale = false;
  try { await materializeTranslationCandidate(staleSource, english); }
  catch (error) { stale = error.code === 'STALE_RESULT'; }
  const englishCandidate = await materializeTranslationCandidate(source, english);
  const spanishCandidate = await materializeTranslationCandidate(source, spanish);
  return { unsupported, stale, providerRequests: provider.requests.length, cacheEntries: cache.size,
    dispatchedTargets: provider.requests.map(request => request.targetLocale),
    cacheHits: [spanishCached.cacheHits, englishCached.cacheHits],
    candidateLocales: [spanishCandidate.document.locale, englishCandidate.document.locale],
    originalUnchanged: JSON.stringify(source) === original,
    sameServiceBothTargets: spanish.profileVersion !== english.profileVersion };
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
        assert.equal(request.sourceLocale, 'pt-BR'); assert(['es-ES', 'en-US'].includes(request.targetLocale)); assert.equal(request.profileVersion, request.targetLocale === 'es-ES' ? 'w5-ptbr-eses-v2' : 'p2-ptbr-enus-v1');
        assert.equal(JSON.stringify(request).includes('documentSnapshot'), false);
        if (holdTranslation) await new Promise(resolveRequest => { releaseTranslation = resolveRequest; translationEntered?.(); });
        const translate = text => request.targetLocale === 'es-ES' ? text.replaceAll('Especificações', 'Especificaciones').replaceAll('produto', 'producto').replaceAll('Calibração', 'Calibración') : text.replaceAll('Especificações', 'Specifications').replaceAll('produto', 'product').replaceAll('Calibração', 'Calibration'); let expanded = false;
        json(res, { contractVersion: request.contractVersion, profileVersion: request.profileVersion,
          requestId: request.requestId, targetLocale: request.targetLocale,
          units: request.units.map(unit => ({ unitId: unit.unitId, runs: unit.runs.map(run => ({ runId: run.runId, translatedText: controls.translationOverflow && unit.kind === 'textObject' && !expanded ? (expanded = true, translate(run.protectedText) + ' ' + 'Editorial content for a deliberately long translation requiring manual review. '.repeat(26)) : translate(run.protectedText) })) })),
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

function authoredStructure(document) {
  const stripText = value => {
    if (Array.isArray(value)) return value.map(stripText);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) =>
      !['id', 'paragraphId', 'runId', 'pageId', 'objectId', 'tableId', 'cellId', 'rowId', 'columnId', 'annotationId', 'legendEntryId', 'assetId', 'annotationIds'].includes(key))
      .map(([key, item]) => [key, key === 'text' && typeof item === 'string' ? '<translated text>' : stripText(item)]));
  };
  return { pages: stripText(document.pages), style: document.style, assets: document.assets };
}

async function returnToLibrary(page) {
  await page.locator('[data-editor-action="library"]').click();
  await page.locator('[data-catalog-library]').waitFor();
  await page.locator('.vnext-library-loading').waitFor({ state: 'detached' });
}
async function openCatalog(page, catalogId) {
  await page.locator('[data-library-catalog-id="' + catalogId + '"]').getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.locator('[data-vnext-shell]').waitFor();
  await page.waitForFunction(id => window.__C1_STATE__()?.document.id === id, catalogId);
}
async function closePublication(page) {
  await page.keyboard.press('Escape');
  await page.locator('[data-publication-host]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-editor-action="publish"]').evaluate(node => node === document.activeElement), true);
}
async function printProof(page, name) {
  await page.evaluate(() => { window.__P2_PRINT_COUNT__ = 0; window.print = () => { window.__P2_PRINT_COUNT__++; }; });
  await page.locator('[data-publication-action="print"]').click();
  await page.waitForFunction(() => window.__P2_PRINT_COUNT__ === 1);
  assert.equal(await page.locator('[data-publication-host]').getAttribute('data-print-approved'), 'true');
  await page.emulateMedia({ media: 'print' });
  const path = resolve(output, name + '.pdf');
  await page.pdf({ path, format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }, scale: 1 });
  const pdf = await getDocument({ data: new Uint8Array(await readFile(path)), isEvalSupported: false, useSystemFonts: false }).promise;
  assert.equal(pdf.numPages, 2);
  let content = '';
  for (let index = 1; index <= pdf.numPages; index++) {
    const pdfPage = await pdf.getPage(index);
    assert(Math.abs((pdfPage.view[2] - pdfPage.view[0]) * 25.4 / 72 - 210) < .5);
    assert(Math.abs((pdfPage.view[3] - pdfPage.view[1]) * 25.4 / 72 - 297) < .5);
    content += (await pdfPage.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
  }
  assert(content.includes('TA-25N')); assert(content.includes('A COMPLETAR'));
  assert(!content.includes('Centro de Tradução')); assert(!content.includes('Imprimir / salvar PDF'));
  await pdf.destroy();
  observations.push({ pdf: path, pages: 2, a4: true, interfaceExcluded: true, text: content });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('dialog').focus();
}

async function workflow(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage(); watch(page, String(width));
  await page.goto(origin + '/v2', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Novo catálogo', exact: true }).click();
  await page.getByRole('button', { name: /PRESYS.*TA-25N/ }).click();
  await page.locator('[data-vnext-shell]').waitFor();
  await page.locator('[data-editorial-root] img').first().evaluate(node => node.decode());
  const source = (await state(page)).document;
  const original = JSON.stringify(source);
  const sourceId = source.id;
  const result = { width, sourceId, copies: [] };
  const safety = await page.evaluate(() => window.__P2_SAFETY_PROOF__());
  assert.equal(safety.unsupported, true);
  assert.equal(safety.stale, true);
  assert.equal(safety.providerRequests, 2);
  assert.equal(safety.cacheEntries, 2);
  assert.deepEqual(safety.dispatchedTargets, ['es-ES', 'en-US']);
  assert.deepEqual(safety.cacheHits, [1, 1]);
  assert.deepEqual(safety.candidateLocales, ['es-ES', 'en-US']);
  assert.equal(safety.originalUnchanged, true);
  assert.equal(safety.sameServiceBothTargets, true);
  result.safety = safety;
  await shot(page, 'source-workspace', width);
  for (const targetLocale of ['es-ES', 'en-US']) {
    const language = targetLocale === 'es-ES' ? 'Espanhol (Espanha)' : 'Inglês (Estados Unidos)';
    await page.locator('[data-editor-action="translate"]').click();
    const dialog = page.locator('[data-translation-review]');
    await dialog.waitFor();
    const selector = page.getByLabel('Idioma de destino', { exact: true });
    assert.deepEqual(await selector.locator('option').evaluateAll(nodes => nodes.map(node => node.value)), ['es-ES', 'en-US']);
    await selector.selectOption(targetLocale);
    await modalKeyboard(page, dialog);
    await shot(page, targetLocale + '-language', width);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-editor-action="translate"]').evaluate(node => node === document.activeElement), true);
    await page.locator('[data-editor-action="translate"]').click();
    await selector.selectOption(targetLocale);
    if (width === 1600 && targetLocale === 'es-ES') {
      await control(page, { translationError: true });
      await page.locator('[data-translation-action="generate"]').click();
      await dialog.getByRole('alert').first().waitFor();
      await shot(page, 'provider-error', width);
      await control(page, { translationError: false });
      holdTranslation = true;
      const requestArrived = new Promise(done => { translationEntered = done; });
      const lateResponse = page.waitForResponse(response => response.url().includes('/functions/v1/vnext-translation-provider'));
      await page.locator('[data-translation-action="generate"]').click();
      await dialog.getByRole('status').filter({ hasText: /Gerando tradução/ }).waitFor();
      await requestArrived;
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await page.locator('[data-editor-action="translate"]').evaluate(node => node === document.activeElement), true);
      holdTranslation = false; translationEntered = undefined; releaseTranslation();
      await (await lateResponse).finished();
      await page.locator('[data-editor-action="translate"]').click();
      await dialog.waitFor();
      assert.equal(await page.locator('[data-translation-run]').count(), 0, 'Canceled late output cannot reopen review');
      assert.equal([...catalogs.values()].filter(item => item.origin?.originId === sourceId).length, 0);
      assert.equal(JSON.stringify(catalogs.get(sourceId).documentSnapshot), original);
      await selector.selectOption(targetLocale);
      await shot(page, 'canceled-generation', width);
      result.canceledGenerationDiscarded = true;
    }
    await control(page, { translationOverflow: true });
    holdTranslation = true;
    await page.locator('[data-translation-action="generate"]').click();
    await dialog.getByRole('status').filter({ hasText: /Gerando tradução/ }).waitFor();
    assert.equal(await selector.isDisabled(), true);
    await shot(page, targetLocale + '-generating', width);
    holdTranslation = false; releaseTranslation?.();
    await page.locator('[data-translation-run="0"]').waitFor();
    assert.equal(await selector.isDisabled(), true, 'Target stays pinned to the generated candidate');
    await modalKeyboard(page, dialog);
    await shot(page, targetLocale + '-review', width);
    const title = page.locator('[data-translation-run="0"]');
    const translatedTitle = await title.inputValue();
    await title.fill(translatedTitle.replace('TA-25N', 'TA-35N'));
    await dialog.locator('h2').click();
    await dialog.getByRole('alert').first().waitFor();
    assert.equal(await page.locator('[data-translation-action="accept"]').isDisabled(), true);
    await shot(page, targetLocale + '-technical-warning', width);
    await title.fill(translatedTitle + ' · revisado');
    await dialog.locator('h2').click();
    assert.equal(await page.locator('[data-translation-action="accept"]').isEnabled(), true);
    await shot(page, targetLocale + '-corrected', width);
    await control(page, { createDelay: 900 });
    await page.locator('[data-translation-action="accept"]').evaluate(node => { node.click(); node.click(); });
    await dialog.getByRole('status').filter({ hasText: /Salvando e verificando/ }).waitFor();
    assert.equal(await page.locator('[data-translation-action="accept"]').isDisabled(), true);
    await shot(page, targetLocale + '-saving-copy', width);
    await page.locator('[data-translation-action="open-copy"]').waitFor();
    await control(page, { createDelay: 0, translationOverflow: false });
    const copies = [...catalogs.values()].filter(item => item.origin?.originId === sourceId && item.locale === targetLocale);
    assert.equal(copies.length, 1, 'One logical double acceptance creates exactly one canonical copy');
    const copy = copies[0];
    assert.equal(copy.documentSnapshot.locale, targetLocale);
    assert.equal(copy.origin.originKind, 'translation');
    assert.equal(copy.origin.originRevision, catalogs.get(sourceId).remoteRevision);
    assert.notEqual(copy.catalogId, sourceId);
    assert.equal(JSON.stringify(catalogs.get(sourceId).documentSnapshot), original);
    assert.deepEqual(authoredStructure(copy.documentSnapshot), authoredStructure(source));
    await shot(page, targetLocale + '-accepted', width);
    await page.locator('[data-translation-action="open-copy"]').click();
    await page.locator('[data-vnext-shell]').waitFor();
    await page.waitForFunction(id => window.__C1_STATE__()?.document.id === id, copy.catalogId);
    await shot(page, targetLocale + '-copy-workspace', width);
    await returnToLibrary(page);
    const row = page.locator('[data-library-catalog-id="' + copy.catalogId + '"]');
    assert((await row.innerText()).includes(language));
    assert((await row.innerText()).includes('Cópia traduzida'));
    assert((await row.innerText()).includes('Origem: ' + source.title));
    await shot(page, targetLocale + '-library', width);
    await openCatalog(page, copy.catalogId);
    assert.equal((await state(page)).document.locale, targetLocale);
    await page.locator('[data-editor-action="publish"]').click();
    await page.locator('[data-publication-status="BLOCKED"]').waitFor();
    assert.equal(await page.locator('[data-publication-action="print"]').isDisabled(), true);
    await page.locator('[data-publication-diagnostic="TEXT_OBJECT_OVERFLOW"]').first().waitFor();
    await shot(page, targetLocale + '-publication-blocked', width);
    await closePublication(page);
    const copyDocument = (await state(page)).document;
    const text = copyDocument.pages[0].objects.find(object => object.type === 'text');
    const sourceText = source.pages[0].objects.find(object => object.type === 'text');
    const frame = structuredClone(text.frame);
    await page.locator('[data-editor-object-id="' + text.id + '"]').click();
    await page.locator('[data-editor-object-id="' + text.id + '"]').press('Enter');
    const authoredText = sourceText.text.paragraphs.flatMap(paragraph => paragraph.inlines)
      .filter(run => run.kind === 'text').map(run => run.text).join(' ');
    assert.equal(authoredText, 'PRESYS', 'The overflow fixture expands the language-neutral brand object');
    const correctedText = authoredText + (targetLocale === 'es-ES' ? ' · revisado' : ' · reviewed');
    await page.locator('[data-text-edit-textarea]').fill(correctedText);
    await page.locator('[data-editor-action="commit-text"]').click();
    await page.locator('[data-text-edit-textarea]').waitFor({ state: 'detached' });
    await save(page);
    assert.deepEqual((await state(page)).document.pages[0].objects.find(object => object.id === text.id).frame, frame);
    assert(catalogs.get(copy.catalogId).remoteRevision >= 2);
    await returnToLibrary(page); await openCatalog(page, copy.catalogId);
    assert.equal((await state(page)).document.locale, targetLocale);
    assert.deepEqual(catalogs.get(copy.catalogId).origin, copy.origin);
    await page.locator('[data-editor-action="publish"]').click();
    await page.locator('[data-publication-status="READY"]').waitFor();
    assert.equal(await page.locator('[data-publication-action="print"]').isEnabled(), true);
    await modalKeyboard(page, page.getByRole('dialog'));
    await shot(page, targetLocale + '-publication-ready', width);
    if (width === 1600) await printProof(page, targetLocale + '-translated-catalog');
    await closePublication(page);
    assert.equal(JSON.stringify(catalogs.get(sourceId).documentSnapshot), original);
    result.copies.push({ targetLocale, catalogId: copy.catalogId, sourceRevision: copy.origin.originRevision,
      savedRevision: catalogs.get(copy.catalogId).remoteRevision, originalUnchanged: true,
      duplicateAcceptCreatedOnce: true, reopenPreserved: true, overflowBlocked: true, manualCorrectionReady: true,
      manualCorrection: correctedText });
    await returnToLibrary(page); await openCatalog(page, sourceId);
  }
  await returnToLibrary(page);
  await shot(page, 'return-library', width);
  await context.close();
  return result;
}

let browser;
try {
  await server.listen();
  console.log('P2 Translation Center product server: ' + origin + '/v2');
  if (process.env.P2_PROOF_SERVE === '1') {
    console.log('Controlled authorization/transport/provider; real production bootstrap and UI.');
    await new Promise(() => {});
  }
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const width of [1600, 1280, 820]) {
    results.push(await workflow(browser, width));
    console.log('P2 ' + width + 'px captured: Spanish and English');
  }
  assert.deepEqual(errors.consoleErrors, []); assert.deepEqual(errors.pageErrors, []); assert.deepEqual(errors.failedResources, []);
  assert.deepEqual(errors.requestFailures.filter(item => item.error !== 'net::ERR_ABORTED'), []);
  await writeFile(resolve(output, 'result.json'), JSON.stringify({
    phase, chromiumVersion: browser.version(), productionBootstrap: true,
    controlledAuthorization: true, controlledTransport: true, controlledProvider: true,
    REAL_GEMINI: 'NOT AVAILABLE', REAL_SUPABASE_PERSISTENCE: 'NOT AVAILABLE', realGeminiCalls: 0,
    results, shots, observations, counters, translationRequests, errors,
  }, null, 2) + '\n');
  console.log('P2 Multilingual Translation Center Chromium/PDF controlled proof: PASS');
} catch (error) {
  const last = browser?.contexts().at(-1)?.pages().at(-1);
  if (last) await last.screenshot({ path: resolve(output, 'failure-ui.png'), fullPage: true }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, shots, observations, errors }, null, 2));
  throw error;
} finally { await browser?.close(); await server.close(); }
