// Real browser proof: publication review must not block a correct catalog under browser zoom / OS display scaling.
// Chromium is launched with --force-device-scale-factor, the same device-pixel path as page zoom and Windows scaling.
// Usage: PUBLICATION_ZOOM_CATALOGS=<dir with *.catalog.json and assets/> node tests/vnext/proof/publication-zoom-proof.mjs
// Contract: zoom never changes the verdict. Each catalog gets the same diagnostic codes at every scale as at 1.0,
// and a catalog READY at 1.0 is READY and print-approved at every scale.
// PUBLICATION_ZOOM_EXPECT=report only records results (used to show the baseline failure before a fix).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(process.env.PUBLICATION_ZOOM_OUTPUT ?? resolve(root, 'scratch/publication-zoom-proof'));
const catalogs = resolve(process.env.PUBLICATION_ZOOM_CATALOGS ?? resolve(output, 'catalogs'));
const scales = (process.env.PUBLICATION_ZOOM_SCALES ?? '1,0.9,1.1,1.25').split(',').map(Number);
const expectReady = process.env.PUBLICATION_ZOOM_EXPECT !== 'report';
const port = Number(process.env.PUBLICATION_ZOOM_PORT ?? 5291);
assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535, 'valid local port');
assert.ok(scales.length && scales.every(scale => scale > 0) && scales[0] === 1, 'valid device scale factors, starting at 1');
assert.ok(existsSync(resolve(catalogs, 'assets')), `catalog folder with assets/ required: ${catalogs}`);
assert.ok(catalogs.startsWith(root), 'catalog folder must live inside the repository (e.g. scratch/) for the local server');
await mkdir(output, { recursive: true });
const files = (await readdir(catalogs)).filter(name => name.endsWith('.catalog.json')).sort();
assert.ok(files.length, 'at least one *.catalog.json');

const sourcePaths = ['src/vnext/rendering/measurement.ts', 'src/vnext/publication/review.ts',
  'tests/vnext/proof/fixtures/publication-zoom-browser.html', 'tests/vnext/proof/fixtures/publication-zoom-browser.tsx',
  'tests/vnext/proof/publication-zoom-proof.mjs'];
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const receipt = { status: 'RUNNING', runId: randomUUID(), startedAt: new Date().toISOString(), expectReady,
  boundary: 'Real Chromium + real publication pipeline (reviewPublication, verifyPublicationForPrint) on local catalog snapshots; no backend/production calls.',
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
  sourceHashes: Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, await hash(resolve(root, path))]))),
  catalogs: Object.fromEntries(await Promise.all(files.map(async file => [file, await hash(resolve(catalogs, file))]))),
  results: [], failures: [] };
const server = await createServer({ root, cacheDir: resolve(output, '.vite'), logLevel: 'error',
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } } });
const base = `http://127.0.0.1:${port}`, folder = '/' + relative(root, catalogs).replaceAll('\\', '/');

try {
  await server.listen();
  const baseline = new Map();
  for (const scale of scales) {
    // No viewport emulation: Playwright's emulated viewport would report devicePixelRatio 1 over a scaled layout.
    const browser = await chromium.launch({ args: [`--force-device-scale-factor=${scale}`, '--window-size=1366,900'] });
    try {
      const page = await (await browser.newContext({ viewport: null })).newPage();
      page.on('pageerror', error => receipt.failures.push({ scale, error: String(error) }));
      for (const file of files) {
        const url = `${base}/tests/vnext/proof/fixtures/publication-zoom-browser.html?doc=${encodeURIComponent(`${folder}/${file}`)}&assets=${encodeURIComponent(`${folder}/assets/`)}`;
        await page.goto(url);
        await page.waitForFunction(() => document.documentElement.dataset.proofDone === 'true', null, { timeout: 240_000 });
        const proof = await page.evaluate(() => window.zoomProof);
        const entry = { scale, file, ...proof };
        receipt.results.push(entry);
        console.log(`${scale.toFixed(2)}x dpr=${proof.devicePixelRatio} ${file}: ${proof.status} / ${proof.print} ${JSON.stringify(proof.codes)}`);
        assert.ok(Math.abs(proof.devicePixelRatio - scale) < 0.01, `${file}@${scale}: Chromium applied the device scale`);
        if (scale === 1) { baseline.set(file, proof); continue; }
        if (expectReady) {
          const reference = baseline.get(file);
          assert.deepEqual(proof.codes, reference.codes, `${file}@${scale}: same diagnostics as at 100% (${JSON.stringify(proof.errors)})`);
          assert.equal(proof.status, reference.status, `${file}@${scale}: same verdict as at 100%`);
          if (reference.status === 'READY') assert.equal(proof.print, 'APPROVED', `${file}@${scale}: print verification approved`);
        }
      }
    } finally { await browser.close(); }
  }
  receipt.status = 'PASS';
} catch (error) {
  receipt.status = 'FAIL'; receipt.failures.push({ error: String(error) }); process.exitCode = 1;
} finally {
  receipt.finishedAt = new Date().toISOString();
  await writeFile(resolve(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  await server.close();
}
console.log(`publication zoom proof: ${receipt.status} (${receipt.results.length} reviews) -> ${relative(root, resolve(output, 'receipt.json'))}`);
