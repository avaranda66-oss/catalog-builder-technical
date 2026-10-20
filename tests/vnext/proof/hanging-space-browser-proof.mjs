// Story: docs/stories/2026-10-17-father-ready-continuacao.md (AC3–AC5).
// Real browser regression for 001da19; no model/backend/production calls.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(process.env.HANGING_SPACE_PROOF_OUTPUT ?? resolve(root, 'scratch/hanging-space-browser-proof'));
const port = Number(process.env.HANGING_SPACE_PROOF_PORT ?? 5284);
assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535, 'valid local port');
await mkdir(output, { recursive: true });
const sourcePaths = ['src/vnext/rendering/measurement.ts', 'src/vnext/rendering/RichTextRenderer.tsx',
  'tests/vnext/proof/fixtures/hanging-space-browser.html', 'tests/vnext/proof/fixtures/hanging-space-browser.tsx',
  'tests/vnext/proof/hanging-space-browser-proof.mjs'];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
  [path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')])));
const receipt = { status: 'RUNNING', runId: randomUUID(), startedAt: new Date().toISOString(),
  boundary: 'Real Chromium Range geometry on real RichTextRenderer/intrinsicMetrics; isolated fixture, no production/cloud or whole-editor PDF acceptance claim.',
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
  sourceHashes, viewport: { width: 1366, height: 768 }, screen: [], print: [], errors: [], externalRequests: [] };
const server = await createServer({ root, cacheDir: resolve(output, '.vite'), logLevel: 'error',
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } } });
let browser;

function verify(cases, media) {
  assert.deepEqual(cases.map(item => item.id), ['hanging', 'long-word', 'nbsp', 'pre', 'nowrap', 'image']);
  for (const item of cases) {
    const label = `${media}/${item.id}`;
    assert.deepEqual(item.sourceAfter, item.sourceBefore, `${label}: source preserved`);
    assert.equal(item.domText, item.sourceBefore.paragraphs[0].inlines[0].text, `${label}: exact DOM text`);
    assert.deepEqual(item.recordsAfter, item.recordsBefore, `${label}: full text records preserved`);
    assert.deepEqual(item.metrics.records, item.recordsBefore, `${label}: returned records retain hanging space`);
    assert.deepEqual(item.metricsAgain, item.metrics, `${label}: repeated measurement stable`);
    assert.ok(item.rawTextWidthQ > item.availableWidthQ, `${label}: real Range must exceed the flow box`);
    if (item.id === 'hanging' || item.id === 'image') {
      assert.equal(item.whiteSpace, 'pre-wrap');
      assert.ok(item.firstTokenWidthQ <= item.availableWidthQ, `${label}: printed word fits`);
      assert.ok(new Set(item.recordsBefore.filter(record => record[0] === 'T').map(record => record[5])).size >= 2,
        `${label}: actual text wraps to more than one line`);
    }
    if (item.id === 'hanging') {
      assert.equal(item.metrics.widthQ, item.firstTokenWidthQ, `${label}: ignore only the hanging space`);
      assert.ok(item.metrics.widthQ <= item.availableWidthQ, `${label}: no false overflow`);
    } else if (item.id === 'image') {
      assert.ok(item.image?.loaded, `${label}: real image decoded`);
      assert.ok(item.image.rightQ > item.availableWidthQ, `${label}: image actually extends past the flow`);
      assert.ok(item.image.bottomQ > item.rawTextHeightQ, `${label}: image actually extends past the text height`);
      assert.equal(item.metrics.widthQ, item.image.rightQ - Math.min(0, item.image.leftQ), `${label}: image width retained`);
      assert.equal(item.metrics.heightQ, Math.max(item.rawTextHeightQ, item.image.bottomQ) - Math.min(0, item.image.topQ), `${label}: image height retained`);
    } else {
      assert.ok(item.metrics.widthQ > item.availableWidthQ, `${label}: real overflow remains`);
      assert.equal(item.metrics.widthQ, item.firstTokenWidthQ, `${label}: entire unbreakable token retained`);
      if (item.id === 'pre' || item.id === 'nowrap') {
        assert.equal(item.whiteSpace, item.id);
        assert.equal(item.metrics.widthQ, item.rawTextWidthQ, `${label}: whitespace width preserved`);
      }
      if (item.id === 'nbsp') assert.ok(item.domText.includes('\u00a0'), `${label}: NBSP is unchanged`);
    }
    if (item.id !== 'image') assert.equal(item.metrics.heightQ, item.rawTextHeightQ, `${label}: original height preserved`);
  }
}

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const context = await browser.newContext({ viewport: receipt.viewport, deviceScaleFactor: 1 });
  const origin = `http://127.0.0.1:${port}`;
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin !== origin) {
      receipt.externalRequests.push(url); return route.abort();
    }
    return route.continue();
  });
  await context.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  const page = await context.newPage();
  page.on('pageerror', error => receipt.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') receipt.errors.push(message.text()); });
  await page.goto(`${origin}/tests/vnext/proof/fixtures/hanging-space-browser.html`);
  await page.waitForFunction(() => Boolean(window.__HANGING_SPACE_PROOF__), undefined, { timeout: 60_000 });
  receipt.screen = await page.evaluate(() => window.__HANGING_SPACE_PROOF__.measure());
  verify(receipt.screen, 'screen');
  await page.screenshot({ path: resolve(output, 'screen.png'), fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))); });
  receipt.print = await page.evaluate(() => window.__HANGING_SPACE_PROOF__.measure());
  verify(receipt.print, 'print');
  assert.deepEqual(receipt.print, receipt.screen, 'screen/print records, height, width and source must agree');
  const pdf = await page.pdf({ path: resolve(output, 'fixture.pdf'), format: 'A4', printBackground: true });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  receipt.pdf = { bytes: pdf.length, sha256: createHash('sha256').update(pdf).digest('hex'),
    boundary: 'Native Chromium fixture PDF generated; full editor/export acceptance is outside this proof.' };
  assert.deepEqual(receipt.externalRequests, [], 'no external service calls');
  assert.deepEqual(receipt.errors, [], 'no browser errors');
  const finalHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
    [path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')])));
  assert.deepEqual(finalHashes, sourceHashes, 'source files unchanged during proof');
  receipt.status = 'PASS';
  console.log('HANGING_SPACE_BROWSER_PROOF_PASS', JSON.stringify({ cases: receipt.screen.length, media: ['screen', 'print'], output }));
} catch (error) {
  receipt.status = 'FAIL'; receipt.error = String(error); receipt.stack = error?.stack;
  throw error;
} finally {
  receipt.finishedAt = new Date().toISOString();
  await writeFile(resolve(output, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
  await browser?.close();
  await server.close();
}
