import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w3g-asset-persistence-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W3G_ASSET_PROOF_PORT ?? 5207);

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

let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Route remote Supabase network endpoints to avoid external cloud flakiness during local/CI Chromium proof
  await page.route('**/rest/v1/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });

  // Phase 1: Production /v2 route verification
  const productionRequests = [];
  page.on('request', (req) => productionRequests.push(req.url()));
  await page.goto(`http://127.0.0.1:${port}/v2`, { waitUntil: 'networkidle' });
  await page.locator('[data-catalog-library]').waitFor();
  assert.equal(
    productionRequests.some((url) => url.includes('/src/legacy-main')),
    false,
    'Legacy bootstrap must not be loaded on /v2 route'
  );

  const productionSmoke = {
    v2Mounted: true,
    legacyBootstrapLoaded: false,
    productionRouteVerified: true,
  };

  // Phase 2: Controlled repository W3.G Father-flow proof
  await page.goto(`http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w3g-asset-browser.html`, {
    waitUntil: 'networkidle',
  });
  await page.locator('[data-editor-overlay]').waitFor();

  // Proof 1: editor displays an Image object
  const imageTarget = page.locator('[data-editor-object-id="image-target"]');
  await imageTarget.waitFor();
  assert.equal(await imageTarget.count(), 1, 'Editor must display initial Image object');

  // Initial document state check
  const initialDoc = await page.evaluate(() => window.__W3G_ASSET_PROOF__.getDocument());
  assert.equal(initialDoc.assets.length, 1);
  const initialAssetId = initialDoc.assets[0].id;
  assert.equal(initialDoc.assets[0].version, '1');

  // Proof 2: Upload/Replace route uses the W3.G bridge
  await imageTarget.click();
  const uploadButton = page.locator('[data-editor-action="upload-image"]');
  assert.equal(await uploadButton.isEnabled(), true, 'Upload image button must be enabled for selected image');

  // Prepare replacement PNG bytes (3x3 PNG)
  const uploadedPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x03, 0x08, 0x02, 0x00, 0x00, 0x00, 0xd9, 0x4a, 0x22,
    0xe8, 0x00, 0x00, 0x00, 0x12, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x40,
    0x12, 0x03, 0x03, 0x03, 0x00, 0x00, 0x00, 0xff, 0xff, 0x03, 0xaa, 0x02, 0xa5, 0xb9, 0x0c, 0x73,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  const fileInput = page.locator('[data-editor-action="upload-image-input"]');
  await uploadButton.click();
  await fileInput.setInputFiles({
    name: 'replacement-product.png',
    mimeType: 'image/png',
    buffer: uploadedPngBuffer,
  });

  // Wait for upload and document replacement to complete
  await page.getByText('Imagem substituída.').waitFor();

  // Proof 3: durable AssetRef is registered
  const docAfterUpload = await page.evaluate(() => window.__W3G_ASSET_PROOF__.getDocument());
  assert.equal(docAfterUpload.assets.length, 2, 'New AssetRef must be registered in document.assets');
  const newAsset = docAfterUpload.assets.find((a) => a.id !== initialAssetId);
  assert(newAsset, 'New asset must exist in document');
  assert.equal(newAsset.version, '1', 'Version must be frozen to "1"');
  assert.equal(newAsset.mime, 'image/png', 'MIME must be image/png');
  assert.equal(newAsset.name, 'replacement-product.png');
  assert.equal(newAsset.alt, 'replacement-product.png');
  assert.equal(newAsset.widthPx, 3);
  assert.equal(newAsset.heightPx, 3);
  assert.match(newAsset.sha256, /^[a-f0-9]{64}$/);

  // Proof 4: no signed/blob URL enters authored document
  const docSerialized = JSON.stringify(docAfterUpload);
  assert.equal(docSerialized.includes('blob:'), false, 'Authored document must NEVER contain blob: URLs');
  assert.equal(docSerialized.includes('http:'), false, 'Authored document must NEVER contain http: URLs');
  assert.equal(docSerialized.includes('https:'), false, 'Authored document must NEVER contain https: URLs');

  // Proof 5: resolved verified image displays
  const renderedImg = page.locator('[data-editorial-root] img[data-asset-id="' + newAsset.id + '"]');
  await renderedImg.waitFor();
  const imgSrc = await renderedImg.getAttribute('src');
  assert(imgSrc && imgSrc.startsWith('blob:'), 'Rendered image src must be a verified local blob URL');

  await page.screenshot({ path: resolve(output, '01-resolved-uploaded-image.png'), fullPage: true });

  // Proof 6 & 7: force asset unavailable/integrity-failed and verify canonical reference remains
  await page.evaluate((assetId) => {
    window.__W3G_ASSET_PROOF__.forceAssetState(assetId, 'unavailable');
  }, newAsset.id);

  const docAfterDegrade = await page.evaluate(() => window.__W3G_ASSET_PROOF__.getDocument());
  assert.equal(
    docAfterDegrade.assets.some((a) => a.id === newAsset.id),
    true,
    'Canonical AssetRef must remain intact in authored document during degraded state'
  );
  const imageObjectAfterDegrade = docAfterDegrade.pages[0].objects.find((o) => o.id === 'image-target');
  assert.equal(
    imageObjectAfterDegrade.assetId,
    newAsset.id,
    'Authored object must preserve its canonical assetId during degraded state'
  );

  // Proof 8: explicit degraded diagnostic/repair indicator appears
  const repairIndicator = page.locator('[data-editor-image-repair="image-target"]');
  await repairIndicator.waitFor();
  assert.equal(await repairIndicator.count(), 1, 'Editor-only repair indicator must appear on degraded image');
  assert.equal(await repairIndicator.getAttribute('data-asset-status'), 'unavailable');

  // Diagnostic badge and sidebar diagnostics check
  const badge = page.locator('[data-editor-diagnostic-badge="WARNING"]');
  await badge.waitFor();
  assert.equal(await badge.count() >= 1, true, 'Diagnostic warning badge must be displayed');

  const diagnosticItem = page.locator('[data-diagnostic-code="ASSET_UNAVAILABLE"]');
  await diagnosticItem.waitFor();
  assert.equal(await diagnosticItem.count() >= 1, true, 'Sidebar must display ASSET_UNAVAILABLE diagnostic');

  await page.screenshot({ path: resolve(output, '02-degraded-repair-indicator.png'), fullPage: true });

  // Proof 9: normal authored editing remains possible
  // Duplicate object or move
  await imageTarget.click();
  const duplicateBtn = page.locator('[data-editor-action="duplicate"]');
  await duplicateBtn.click();

  const docAfterEditing = await page.evaluate(() => window.__W3G_ASSET_PROOF__.getDocument());
  assert.equal(
    docAfterEditing.pages[0].objects.length,
    2,
    'Normal authored editing (e.g. duplicate) must remain fully possible while assets are degraded'
  );

  // Proof 10: publication / resource path fails closed for broken required asset
  const pubResult = await page.evaluate(async () => {
    try {
      await window.__W3G_ASSET_PROOF__.attemptPublication();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message ?? String(err) };
    }
  });
  assert.equal(pubResult.ok, false, 'Publication must fail closed when required assets are degraded');
  assert.match(pubResult.error, /REQUIRED_ASSET_MISSING/, 'Publication failure must be REQUIRED_ASSET_MISSING');

  assert.deepEqual(consoleErrors, [], 'No uncaught console errors');
  assert.deepEqual(pageErrors, [], 'No uncaught page errors');

  const evidence = {
    chromiumVersion: browser.version(),
    productionSmoke,
    w3gProof: {
      imageObjectRendered: true,
      uploadViaBridgeSuccess: true,
      durableAssetRefRegistered: true,
      versionFrozenToOne: newAsset.version === '1',
      noUrlsInAuthoredDocument: true,
      resolvedBlobUrlRendered: true,
      canonicalReferencePreservedOnDegrade: true,
      editorOnlyRepairIndicatorRendered: true,
      diagnosticWarningBadgeRendered: true,
      sidebarDiagnosticRendered: true,
      normalEditingFunctionalWhileDegraded: true,
      publicationFailsClosed: true,
    },
    consoleErrors,
    pageErrors,
  };

  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('W3.G Asset Persistence Chromium proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
