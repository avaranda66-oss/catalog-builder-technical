import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(process.env.FATHER_TRANSLATION_OUTPUT ?? resolve(root, 'scratch/father-translation-batching-proof'));
await mkdir(output, { recursive: true });
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import ReactDOM from 'react-dom/client';
import { TranslationReview } from '/src/vnext/app/TranslationReview.tsx';
import { TranslationReviewCoordinator } from '/src/vnext/translation/review-coordinator.ts';
import { ControlledTranslationProvider, TranslationFoundationError, createTranslationCenterFoundation, resolveTranslationProfile } from '/src/vnext/translation/index.ts';
import { materializeTranslationCandidate } from '/src/vnext/translation/candidate.ts';
import { fatherTranslationCatalog } from '/tests/vnext/translation/father-translation-fixture.ts';
import '/src/vnext/app/styles.css'; import '/src/index.css';
const responseFor = request => {
 const profile = resolveTranslationProfile(request.sourceLocale, request.targetLocale, request.profileVersion);
 return { contractVersion: profile.contractVersion, profileVersion: profile.profileVersion, requestId: request.requestId, targetLocale: profile.targetLocale,
  provider: { providerId: profile.providerId, modelId: profile.modelId }, units: request.units.map(unit => ({ unitId: unit.unitId,
  runs: unit.runs.map(run => ({ runId: run.runId, translatedText: run.protectedText })) })) };
};
window.runDatasets = async () => {
 const rows = [];
 for (const size of ['small','medium','large']) for (const target of ['es-ES','en-US']) {
  const source = fatherTranslationCatalog(size); const before = JSON.stringify(source);
  const provider = new ControlledTranslationProvider(responseFor); const foundation = createTranslationCenterFoundation(provider);
  const start = performance.now(); const result = await foundation.translateCatalog(source, target); const translatedMs = performance.now() - start;
  const candidate = await materializeTranslationCandidate(source, result);
  const retryStart = performance.now(); const cached = await foundation.translateCatalog(source, target); const cachedMs = performance.now() - retryStart;
  const objects = source.pages.flatMap(page => page.objects); const tables = objects.filter(object => object.type === 'table');
  rows.push({ size, target, pages: source.pages.length, objects: objects.length, tables: tables.length,
   largestTable: Math.max(...tables.map(object => object.table.rows.length)) + 'x' + Math.max(...tables.map(object => object.table.columns.length)),
   bytes: new TextEncoder().encode(before).length, eligibleUnits: result.units.length, excludedSurfaces: result.coverage.excluded.length,
   batches: result.providerRequests, cachedBatches: cached.cacheHits, retryProviderRequests: cached.providerRequests,
   translatedMs: Math.round(translatedMs), cachedMs: Math.round(cachedMs), immutable: JSON.stringify(source) === before,
   assembledExact: JSON.stringify({ ...candidate.document, locale: source.locale }) === before,
   uniqueFinalUnits: new Set(result.units.map(unit => unit.unitId)).size === result.units.length,
   maxRequestUnits: Math.max(...provider.requests.map(request => request.units.length)),
   maxRequestChars: Math.max(...provider.requests.map(request => request.units.flatMap(unit => unit.runs).reduce((sum,run) => sum + run.protectedText.length,0))),
   maxRunChars: Math.max(...provider.requests.flatMap(request => request.units.flatMap(unit => unit.runs.map(run => run.protectedText.length)))) });
 }
 return rows;
};
const source = fatherTranslationCatalog('medium'); const original = JSON.stringify(source);
const envelope = (document, mutationId, origin) => ({ catalogId: document.id, documentSnapshot: structuredClone(document), remoteRevision: 1,
 lastMutationId: mutationId, title: document.title, locale: document.locale, createdAt: '2026-10-07T12:00:00Z', updatedAt: '2026-10-07T12:00:00Z',
 createdBy: null, updatedBy: null, archivedAt: null, documentSchemaVersion: 1, ...(origin ? {origin} : {}) });
const catalogs = new Map([[source.id,envelope(source,crypto.randomUUID())]]); let creates=0;
const repository = { listCatalogs: async()=>({ok:true,value:[...catalogs.values()]}), getCatalog: async id => catalogs.has(id) ? ({ok:true,value:structuredClone(catalogs.get(id))}) : ({ok:false,error:{code:'NOT_FOUND'}}),
 createCatalog: async request => { creates++; const value=envelope(request.documentSnapshot,request.mutationId,request.origin); catalogs.set(value.catalogId,value); return {ok:true,value}; },
 saveCAS: async()=>({ok:false,error:{code:'REMOTE_FAILURE'}}), archiveCAS: async()=>({ok:false,error:{code:'REMOTE_FAILURE'}}) };
const provider = new ControlledTranslationProvider(async (request, invocation) => {
 if (invocation === 2) { await new Promise(resolve => { window.releaseFailedBatch = resolve; }); throw new TranslationFoundationError('PROVIDER_RATE_LIMIT','Controlled rate limit'); }
 return responseFor(request);
});
const coordinator = new TranslationReviewCoordinator({ foundation:createTranslationCenterFoundation(provider),repository,
 getSource:()=>({document:source,remoteRevision:1,openSessionId:'proof-open',authLineage:'proof-user',authorityScopeId:'proof-scope'}),
 authLineage:()=> 'proof-user',authorityScopeId:()=> 'proof-scope',createId:()=>crypto.randomUUID(),createMutationId:()=>crypto.randomUUID() });
window.snapshot = coordinator.getSnapshot; window.finalProof = async()=>({snapshot:coordinator.getSnapshot(),creates,requests:provider.requests.length,
 immutable:JSON.stringify(source)===original,reopened:coordinator.getSnapshot().copy ? await repository.getCatalog(coordinator.getSnapshot().copy.catalogId) : null});
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(TranslationReview,{coordinator,sourceLocale:source.locale,sourceTitle:source.title,onClose:()=>{},onOpenCopy:()=>{}}));
</script></body></html>`;
const server = await createServer({ root, plugins: [{ name: 'father-translation-browser-proof', configureServer(devServer) {
  devServer.middlewares.use(async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/father-translation-proof') return next();
    res.setHeader('Content-Type', 'text/html'); res.end(await devServer.transformIndexHtml(req.url, html));
  });
} }], server: { host: '127.0.0.1', port: 5297, strictPort: true }, logLevel: 'error' });
await server.listen();
const result = { kind: 'local controlled-provider browser proof; not Gemini/Supabase production acceptance', datasets: [], browsers: [] };
try {
  for (const browserName of ['chromium', 'edge']) {
    const browser = await chromium.launch({ headless: true, ...(browserName === 'edge' ? { channel: 'msedge' } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:5297/father-translation-proof');
      await page.getByRole('dialog', { name: 'Centro de Tradução' }).waitFor();
      await page.getByRole('button', { name: 'Gerar tradução' }).click();
      await page.waitForFunction(() => window.snapshot().phase === 'generating' && window.snapshot().batchProgress?.completedBatches === 1);
      assert.equal(await page.getByRole('progressbar', { name: 'Progresso da tradução' }).getAttribute('value'), '1');
      await page.screenshot({ path: resolve(output, browserName + '-progress.png') });
      await page.evaluate(() => window.releaseFailedBatch());
      await page.getByRole('button', { name: 'Tentar tradução novamente' }).waitFor();
      assert((await page.getByRole('alert').textContent()).includes('Aguarde um pouco'));
      assert.equal((await page.evaluate(() => window.finalProof())).requests, 2);
      await page.screenshot({ path: resolve(output, browserName + '-partial-failure.png') });
      await page.getByRole('button', { name: 'Tentar tradução novamente' }).click();
      await page.getByRole('heading', { name: 'Revise a tradução' }).waitFor();
      const review = await page.evaluate(() => window.finalProof());
      assert.equal(review.snapshot.batchProgress.cacheHits, 1); assert.equal(review.creates, 0);
      await page.getByRole('button', { name: 'Salvar cópia traduzida' }).click();
      await page.getByRole('button', { name: 'Abrir cópia traduzida' }).waitFor();
      const final = await page.evaluate(() => window.finalProof());
      assert.equal(final.creates, 1); assert.equal(final.immutable, true); assert.equal(final.reopened.ok, true);
      assert.equal(final.reopened.value.locale, 'es-ES'); assert.equal(final.reopened.value.origin.originKind, 'translation');
      await page.screenshot({ path: resolve(output, browserName + '-copy-confirmed.png') });
      if (browserName === 'chromium') result.datasets = await page.evaluate(() => window.runDatasets());
      result.browsers.push({ browser: browserName, progress: true, partialFailure: true, manualRetryCacheHits: 1,
        creates: final.creates, originalImmutable: final.immutable, reopened: final.reopened.ok, errors });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
  for (const row of result.datasets) {
    assert(row.immutable && row.assembledExact && row.uniqueFinalUnits); assert.equal(row.retryProviderRequests, 0);
    assert(row.maxRequestUnits <= 60 && row.maxRequestChars <= 30000 && row.maxRunChars <= 4000);
  }
  await writeFile(resolve(output, 'browser-translation-proof.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await server.close(); }
