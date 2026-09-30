import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/l1-authority-loss-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.L1_PROOF_PORT ?? 5271);
const origin = 'http://127.0.0.1:' + port;
process.env.VITE_SUPABASE_URL = origin + '/controlled-supabase';
process.env.VITE_SUPABASE_ANON_KEY = 'l1-controlled-anon-key';
const fixture = await readFile(resolve(root, 'tests/vnext/proof/fixtures/l1-authority-loss-browser.html'), 'utf8');
const server = await createServer({
  root,
  plugins: [{ name: 'l1-controlled-routes', configureServer(devServer) {
    devServer.middlewares.use(async (req, res, next) => {
      const pathname = (req.url ?? '').split('?')[0];
      if (pathname !== '/' && pathname !== '/v2') return next();
      try {
        const html = await devServer.transformIndexHtml(req.url ?? pathname, fixture);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      } catch (error) { next(error); }
    });
  }}],
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  logLevel: 'error',
});
const errors = { consoleErrors: [], pageErrors: [], failedResources: [], requestFailures: [] };
function watch(page, label) {
  page.on('console', m => { if (m.type() === 'error') errors.consoleErrors.push({ label, text: m.text() }); });
  page.on('pageerror', e => errors.pageErrors.push({ label, message: e.message }));
  page.on('response', r => { if (r.status() >= 400) errors.failedResources.push({ label, status: r.status(), url: r.url() }); });
  page.on('requestfailed', r => errors.requestFailures.push({ label, url: r.url(), error: r.failure()?.errorText ?? null }));
}
async function setIdentityAtRoot(page, identity) {
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-l1-proof-root]').waitFor();
  await page.evaluate(id => window.__L1_PROOF__.setNextIdentity(id), identity);
}
async function openEditor(page) {
  const id = await page.evaluate(() => window.__L1_PROOF__.catalogId);
  await page.goto(origin + '/v2?catalog=' + encodeURIComponent(id), { waitUntil: 'domcontentloaded' });
  await page.locator('[data-vnext-shell]').waitFor();
}
const rec = (page, identity) => page.evaluate(id => window.__L1_PROOF__.recoveryFor(id), identity);
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  watch(page, 'A-B-A');
  await setIdentityAtRoot(page, A);
  await openEditor(page);
  await page.evaluate(() => window.__L1_PROOF__.blockRecovery());
  await page.evaluate(() => {
    window.__L1_PROOF__.editTitle('L1 latest A draft');
    window.__L1_PROOF__.loseAuthority();
  });
  await page.locator('[data-vnext-access-state="protecting"]').waitFor();
  await page.evaluate(() => window.__L1_PROOF__.waitRecoveryStarted());
  assert.equal(new URL(page.url()).pathname, '/v2');
  assert.equal(await page.locator('[data-vnext-shell]').isVisible(), false);
  assert.equal(await page.getByRole('heading', { name: 'Protegendo alterações locais…' }).isVisible(), true);
  await page.evaluate(() => window.__L1_PROOF__.releaseRecovery());
  await page.waitForURL(origin + '/');
  await page.locator('[data-l1-proof-root]').waitFor();

  const recoveryA = await rec(page, A);
  assert.equal(recoveryA.length, 1);
  assert.equal(recoveryA[0].status, 'VALID');
  assert.equal(recoveryA[0].title, 'L1 latest A draft');

  await page.evaluate(id => window.__L1_PROOF__.setNextIdentity(id), B);
  await openEditor(page);
  assert.equal(await page.getByRole('dialog', { name: 'Recuperação local' }).count(), 0);
  assert.deepEqual(await rec(page, B), []);
  const aWhileB = await rec(page, A);
  assert.equal(aWhileB.length, 1);
  assert.equal(aWhileB[0].title, 'L1 latest A draft');

  await setIdentityAtRoot(page, A);
  const catalogId = await page.evaluate(() => window.__L1_PROOF__.catalogId);
  await page.goto(origin + '/v2?catalog=' + encodeURIComponent(catalogId), { waitUntil: 'domcontentloaded' });
  const recoveryDialog = page.getByRole('dialog', { name: 'Recuperação local' });
  await recoveryDialog.waitFor();
  await recoveryDialog.getByRole('button', { name: 'Recuperar minhas alterações' }).click();
  await page.locator('[data-vnext-shell]').waitFor();
  const restored = await page.evaluate(() => window.__L1_PROOF__.runtimeState());
  assert.equal(restored.title, 'L1 latest A draft');
  assert.equal(restored.bindingAuthorityScopeId.includes(A), true);
  const identityEvidence = {
    protectedBeforeNavigation: true,
    recoveryTitle: recoveryA[0].title,
    bRecoveryCount: 0,
    restoredTitle: restored.title,
  };
  await context.close();

  const openContext = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const openPage = await openContext.newPage();
  watch(openPage, 'pending-open');
  await setIdentityAtRoot(openPage, A);
  await openPage.evaluate(() => window.__L1_PROOF__.beginPendingOpen());
  const pendingCatalog = await openPage.evaluate(() => window.__L1_PROOF__.catalogId);
  await openPage.goto(origin + '/v2?catalog=' + encodeURIComponent(pendingCatalog), { waitUntil: 'domcontentloaded' });
  await openPage.evaluate(() => window.__L1_PROOF__.waitPendingOpenStarted());
  await openPage.evaluate(() => {
    window.__L1_PROOF__.blockAuthorityProtection();
    window.__L1_PROOF__.loseAuthority();
  });
  await openPage.locator('[data-vnext-access-state="protecting"]').waitFor();
  await openPage.evaluate(() => window.__L1_PROOF__.waitAuthorityProtectionStarted());
  await openPage.evaluate(() => window.__L1_PROOF__.resolvePendingOpen('Late open must not mount'));
  await openPage.waitForTimeout(50);
  assert.equal(await openPage.locator('[data-vnext-shell]').count(), 0);
  assert.equal(new URL(openPage.url()).pathname, '/v2');
  await openPage.evaluate(() => window.__L1_PROOF__.releaseAuthorityProtection());
  await openPage.waitForURL(origin + '/');
  const pendingOpenEvidence = { lateEditorMounted: false, navigatedAfterProtection: true };
  await openContext.close();

  const assetContext = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const assetPage = await assetContext.newPage();
  watch(assetPage, 'pending-asset');
  await setIdentityAtRoot(assetPage, A);
  await assetPage.evaluate(() => window.__L1_PROOF__.beginPendingAsset());
  const assetCatalog = await assetPage.evaluate(() => window.__L1_PROOF__.catalogId);
  await assetPage.goto(origin + '/v2?catalog=' + encodeURIComponent(assetCatalog), { waitUntil: 'domcontentloaded' });
  await assetPage.evaluate(() => window.__L1_PROOF__.waitPendingAssetStarted());
  await assetPage.evaluate(() => {
    window.__L1_PROOF__.blockAuthorityProtection();
    window.__L1_PROOF__.loseAuthority();
  });
  await assetPage.locator('[data-vnext-access-state="protecting"]').waitFor();
  await assetPage.evaluate(() => window.__L1_PROOF__.waitAuthorityProtectionStarted());
  await assetPage.evaluate(() => window.__L1_PROOF__.resolvePendingAsset());
  await assetPage.waitForTimeout(50);
  assert.equal(await assetPage.locator('[data-vnext-shell]').count(), 0);
  assert.equal(new URL(assetPage.url()).pathname, '/v2');
  await assetPage.evaluate(() => window.__L1_PROOF__.releaseAuthorityProtection());
  await assetPage.waitForURL(origin + '/');
  const pendingAssetEvidence = { lateEditorMounted: false, navigatedAfterProtection: true };
  await assetContext.close();

  const preDispatchContext = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const preDispatchPage = await preDispatchContext.newPage();
  watch(preDispatchPage, 'pre-dispatch-A-B');
  await setIdentityAtRoot(preDispatchPage, A);
  await openEditor(preDispatchPage);
  await preDispatchPage.evaluate(() => {
    window.__L1_PROOF__.blockRecovery();
    window.__L1_PROOF__.blockAuthorityProtection();
    window.__L1_PROOF__.editTitle('Prepared by A before dispatch');
  });
  const preDispatchSave = preDispatchPage.evaluate(() => window.__L1_PROOF__.save());
  await preDispatchPage.evaluate(() => window.__L1_PROOF__.waitRecoveryStarted());
  assert.equal((await preDispatchPage.evaluate(() => window.__L1_PROOF__.rpcState())).saveCount, 0);
  await preDispatchPage.evaluate(id => window.__L1_PROOF__.setNextIdentity(id), B);
  await preDispatchPage.locator('[data-vnext-access-state="protecting"]').waitFor();
  await preDispatchPage.evaluate(() => window.__L1_PROOF__.waitAuthorityProtectionStarted());
  await preDispatchPage.evaluate(() => window.__L1_PROOF__.releaseRecovery());
  assert.deepEqual(await preDispatchSave, {
    ok: false,
    error: { code: 'STALE_RESULT' },
  });
  const preDispatchRpc = await preDispatchPage.evaluate(() => window.__L1_PROOF__.rpcState());
  assert.equal(preDispatchRpc.saveCount, 0);
  const preDispatchRecoveryA = await rec(preDispatchPage, A);
  assert.equal(preDispatchRecoveryA.length, 1);
  assert.equal(preDispatchRecoveryA[0].title, 'Prepared by A before dispatch');
  assert.deepEqual(await rec(preDispatchPage, B), []);
  await preDispatchPage.evaluate(() => window.__L1_PROOF__.releaseAuthorityProtection());
  await preDispatchPage.waitForURL(origin + '/');
  const preDispatchEvidence = {
    saveDispatchCount: preDispatchRpc.saveCount,
    aRecoveryTitle: preDispatchRecoveryA[0].title,
    bRecoveryCount: 0,
    staleResult: true,
  };
  await preDispatchContext.close();

  const saveContext = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const savePage = await saveContext.newPage();
  watch(savePage, 'pending-save');
  await setIdentityAtRoot(savePage, A);
  await openEditor(savePage);
  await savePage.evaluate(() => {
    window.__L1_PROOF__.beginPendingSave();
    window.__L1_PROOF__.editTitle('Dispatched by A');
    void window.__L1_PROOF__.save();
  });
  await savePage.evaluate(() => window.__L1_PROOF__.waitPendingSaveStarted());
  await savePage.evaluate(() => {
    window.__L1_PROOF__.blockAuthorityProtection();
    window.__L1_PROOF__.blockRecovery();
    window.__L1_PROOF__.editTitle('Newer A after dispatch');
    window.__L1_PROOF__.loseAuthority();
  });
  await savePage.locator('[data-vnext-access-state="protecting"]').waitFor();
  await Promise.all([
    savePage.evaluate(() => window.__L1_PROOF__.waitAuthorityProtectionStarted()),
    savePage.evaluate(() => window.__L1_PROOF__.waitRecoveryStarted()),
  ]);
  const beforeSaveResolve = await savePage.evaluate(() => window.__L1_PROOF__.rpcState());
  assert.equal(beforeSaveResolve.saveCount, 1);
  assert.equal(beforeSaveResolve.saveRequest.p_document_snapshot.title, 'Dispatched by A');
  await savePage.evaluate(() => window.__L1_PROOF__.resolvePendingSave());
  await savePage.evaluate(() => window.__L1_PROOF__.releaseRecovery());
  await savePage.waitForFunction(() => {
    const state = window.__L1_PROOF__.runtimeState();
    return state?.title === 'Newer A after dispatch' && state?.phase === 'idle' && state?.dirty === true;
  });
  assert.equal((await savePage.evaluate(() => window.__L1_PROOF__.rpcState())).saveCount, 1);
  const protectedBeforeTeardown = await rec(savePage, A);
  assert.equal(protectedBeforeTeardown.length, 1);
  assert.equal(protectedBeforeTeardown[0].title, 'Newer A after dispatch');
  await savePage.evaluate(() => window.__L1_PROOF__.releaseAuthorityProtection());
  await savePage.waitForURL(origin + '/');
  const saveRecoveryA = await rec(savePage, A);
  assert.equal(saveRecoveryA.length, 1);
  assert.equal(saveRecoveryA[0].title, 'Newer A after dispatch');
  const pendingSaveEvidence = {
    saveDispatchCount: beforeSaveResolve.saveCount,
    dispatchedTitle: beforeSaveResolve.saveRequest.p_document_snapshot.title,
    protectedLatestTitle: saveRecoveryA[0].title,
  };
  await saveContext.close();

  const ambiguousContext = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const ambiguousPage = await ambiguousContext.newPage();
  watch(ambiguousPage, 'ambiguous-after-authority-loss');
  await setIdentityAtRoot(ambiguousPage, A);
  await openEditor(ambiguousPage);
  await ambiguousPage.evaluate(() => {
    window.__L1_PROOF__.beginPendingSave();
    window.__L1_PROOF__.blockAuthorityProtection();
    window.__L1_PROOF__.editTitle('Ambiguous A before authority loss');
  });
  const ambiguousSave = ambiguousPage.evaluate(() => window.__L1_PROOF__.save());
  await ambiguousPage.evaluate(() => window.__L1_PROOF__.waitPendingSaveStarted());
  const ambiguousBefore = await ambiguousPage.evaluate(() => window.__L1_PROOF__.rpcState());
  assert.equal(ambiguousBefore.saveCount, 1);
  await ambiguousPage.evaluate(() => window.__L1_PROOF__.loseAuthority());
  await ambiguousPage.locator('[data-vnext-access-state="protecting"]').waitFor();
  await ambiguousPage.evaluate(() => window.__L1_PROOF__.waitAuthorityProtectionStarted());
  await ambiguousPage.evaluate(() => window.__L1_PROOF__.resolvePendingSaveAmbiguous());
  assert.deepEqual(await ambiguousSave, { ok: false, error: { code: 'STALE_RESULT' } });
  const ambiguousAfter = await ambiguousPage.evaluate(() => window.__L1_PROOF__.rpcState());
  assert.equal(ambiguousAfter.saveCount, 1);
  assert.equal(ambiguousAfter.getCount, ambiguousBefore.getCount);
  const ambiguousRecoveryA = await rec(ambiguousPage, A);
  assert.equal(ambiguousRecoveryA.length, 1);
  assert.equal(ambiguousRecoveryA[0].pendingMutationId !== undefined, true);
  assert.deepEqual(await rec(ambiguousPage, B), []);
  await ambiguousPage.evaluate(() => window.__L1_PROOF__.releaseAuthorityProtection());
  await ambiguousPage.waitForURL(origin + '/');
  const ambiguousEvidence = {
    initialSaveDispatchCount: ambiguousBefore.saveCount,
    verificationDispatchDelta: ambiguousAfter.getCount - ambiguousBefore.getCount,
    replayDispatchCount: ambiguousAfter.saveCount - ambiguousBefore.saveCount,
    pendingMutationPreserved: ambiguousRecoveryA[0].pendingMutationId !== undefined,
    bRecoveryCount: 0,
    staleResult: true,
  };
  await ambiguousContext.close();

  const failureContext = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const failurePage = await failureContext.newPage();
  watch(failurePage, 'protection-failure');
  await setIdentityAtRoot(failurePage, A);
  await openEditor(failurePage);
  await failurePage.evaluate(() => {
    window.__L1_PROOF__.failRecovery(true);
    window.__L1_PROOF__.editTitle('Protection must fail closed');
    window.__L1_PROOF__.loseAuthority();
  });
  await failurePage.locator('[data-vnext-access-state="protection-failed"]').waitFor();
  assert.equal(new URL(failurePage.url()).pathname, '/v2');
  assert.equal(await failurePage.locator('[data-vnext-shell]').isVisible(), false);
  assert.equal(await failurePage.getByRole('heading', { name: 'Proteção local não concluída' }).isVisible(), true);
  const failureRpc = await failurePage.evaluate(() => window.__L1_PROOF__.rpcState());
  assert.equal(failureRpc.saveCount, 0);
  assert.deepEqual(await rec(failurePage, B), []);
  await failurePage.screenshot({ path: resolve(output, 'l1-protection-failure.png'), fullPage: true });
  const failureEvidence = {
    stayedOnV2: true,
    protectedEditorVisible: false,
    saveDispatchCount: failureRpc.saveCount,
    bRecoveryCount: 0,
  };
  await failureContext.close();

  assert.deepEqual(errors.consoleErrors, []);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.failedResources, []);
  assert.deepEqual(errors.requestFailures, []);
  const evidence = {
    chromiumVersion: browser.version(),
    crossings: {
      dirtyAuthorityLossAndIdentityIsolation: identityEvidence,
      pendingOpen: pendingOpenEvidence,
      pendingAssetResolution: pendingAssetEvidence,
      preDispatchAuthorityLossAtoB: preDispatchEvidence,
      alreadyDispatchedSave: pendingSaveEvidence,
      ambiguousAfterAuthorityLoss: ambiguousEvidence,
      protectionFailure: failureEvidence,
    },
    ...errors,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('L1 authority-loss Chromium proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
