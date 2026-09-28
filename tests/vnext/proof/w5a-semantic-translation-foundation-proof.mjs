import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w5a-semantic-translation-foundation-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W5A_PROOF_PORT ?? 5251);
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
const url = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w5a-translation-foundation-browser.html`;
const errors = { consoleErrors: [], pageErrors: [], failedResources: [], requestFailures: [] };

function watch(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.consoleErrors.push({ text: message.text(), location: message.location() });
  });
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.failedResources.push({ status: response.status(), url: response.url() });
  });
  page.on('requestfailed', (request) => {
    errors.requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? null });
  });
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: Boolean(process.env.CI || process.env.W5A_PROOF_HEADLESS) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-w5a-proof]').waitFor();
  const result = await page.evaluate(() => window.__W5A_PROOF__.run());

  assert.equal(result.parsed, true);
  assert.equal(result.eligibleCount, 9);
  assert.deepEqual(result.eligibleKinds, [
    'catalogTitle',
    'textObject',
    'tableTitle',
    'tableCell',
    'tableAnnotation',
    'tableAnnotation',
    'tableAnnotation',
    'tableLegend',
    'textObject',
  ]);
  for (const reason of ['asset-alt', 'technical-code', 'measurement', 'marker', 'image-cell', 'shape', 'line']) {
    assert(result.excludedReasons.includes(reason), `missing exclusion ${reason}`);
  }
  assert.equal(result.groupDescendantFound, true);
  assert.equal(result.technicalPayloadExcluded, true);
  assert.equal(result.assetAltPayloadExcluded, true);
  assert.equal(result.maskedPayload, true);
  assert.equal(result.noBrowserProviderSecret, true);
  assert.equal(result.restoredTechnicalTokens, true);
  assert(result.resultRunIds.includes('w5a-text-rich:t1'));
  assert(result.resultRunIds.includes('w5a-text-rich:t4'));
  assert.equal(result.richTextIdentity[0].inlines[0].marks[0], 'bold');
  assert.equal(result.richTextIdentity[0].inlines[1].marks[0], 'italic');
  assert.equal(result.richTextIdentity[0].inlines[2].kind, 'lineBreak');
  assert.equal(result.richTextIdentity[1].list.kind, 'unordered');
  assert.equal(result.staleCode, 'STALE_RESULT');
  assert.equal(result.staleCoverageSetCode, 'STALE_RESULT');
  assert.equal(result.crossRunTokenCode, 'TECHNICAL_TOKEN_MISMATCH');
  assert.equal(result.crossUnitTokenCode, 'TECHNICAL_TOKEN_MISMATCH');
  assert.equal(result.invalidCode, 'INVALID_PROVIDER_RESPONSE');
  assert.equal(result.unsupportedCode, 'UNSUPPORTED_LANGUAGE');
  assert.equal(result.firstProviderRequests, 1);
  assert.equal(result.secondProviderRequests, 0);
  assert.equal(result.secondCacheHits, 1);
  assert.equal(result.cacheSize, 1);
  assert.equal(result.cacheKeySeparated, true);
  assert.equal(result.providerRequestCount, 1);
  assert.equal(result.sourceUnchanged, true);
  assert.equal(result.sourceBefore, result.sourceAfter);
  assert(result.sourceHashes.every(([, hash]) => /^[a-f0-9]{64}$/.test(hash)));

  assert.deepEqual(errors.consoleErrors, []);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.failedResources, []);
  assert.deepEqual(errors.requestFailures, []);

  const report = {
    status: 'PASS',
    browser: browser.version(),
    controlledProvider: true,
    liveProvider: false,
    assertions: {
      canonicalFixture: true,
      semanticCoverage: true,
      technicalExclusions: true,
      assetAltExcluded: true,
      technicalTokenProtection: true,
      strictValidation: true,
      richTextPreserved: true,
      staleProtection: true,
      fullCoverageStaleProtection: true,
      contextBoundTechnicalTokens: true,
      requestCache: true,
      sourceImmutability: true,
      noBrowserProviderSecret: true,
      unsupportedPairRejected: true,
    },
    errors,
  };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log('W5.A Semantic Translation Foundation Chromium proof: PASS');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
