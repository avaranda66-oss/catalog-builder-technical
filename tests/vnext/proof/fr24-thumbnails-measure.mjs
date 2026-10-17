// FR-24 measurement for the FR-18 page thumbnails (slice 2H, Onda 2 gate). Not a CI proof: it measures
// a 10-page catalog (title, text, photo and a 23 × 8 table per page) in the simple editor, with the
// thumbnails on and off (?thumbnails=off removes IntersectionObserver, so nothing is drawn), and writes
// scratch/fr24-thumbnails/result.json. It asserts only correctness (no page errors, every thumbnail drawn).
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/fr24-thumbnails');
await mkdir(output, { recursive: true });
const port = Number(process.env.FR24_PROOF_PORT ?? 5282);
const rounds = Number(process.env.FR24_ROUNDS ?? 3);
const server = await createServer({
  root,
  cacheDir: resolve(output, '.vite'),
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  logLevel: 'error',
});
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const runs = [];
  for (let round = 0; round < rounds; round += 1) {
    for (const mode of ['on', 'off']) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`http://127.0.0.1:${port}/tests/vnext/proof/fixtures/fr24-thumbnails-browser.html?thumbnails=${mode}`);
      await page.waitForFunction(() => Boolean(window.__FR24__));
      const first = await page.evaluate(() => window.__FR24__.firstView());
      const renderFirst = await page.evaluate(() => window.__FR24__.thumbnailRenderMs());
      const scroll = await page.evaluate(() => window.__FR24__.scrollAll());
      const renderScroll = await page.evaluate(() => window.__FR24__.thumbnailRenderMs());
      const edits = await page.evaluate(() => window.__FR24__.edits(5));
      const renderEdits = await page.evaluate(() => window.__FR24__.thumbnailRenderMs());
      assert.deepEqual(errors, [], `page errors (${mode})`);
      if (mode === 'on') assert.equal(scroll.drawnPages, 10, 'every page gets its thumbnail once it is on screen');
      else assert.equal(scroll.drawnPages, 0);
      runs.push({ mode, first, scroll, edits, thumbnailRenderMs: { first: renderFirst, scroll: renderScroll - renderFirst, edits: renderEdits - renderScroll } });
      await context.close();
    }
  }
  const pick = (mode, read) => median(runs.filter((run) => run.mode === mode).map(read));
  const summary = {
    build: 'vite dev (React development build, StrictMode)', viewport: '1366x768', pages: 10, rounds,
    visibleThumbnailsDrawnAfterShellMs: pick('on', (run) => run.first.visibleDrawnMs - run.first.shellMs),
    remainingSevenDrawnOnScrollMs: pick('on', (run) => run.scroll.allDrawnMs),
    thumbnailReactRenderMs: { firstThree: pick('on', (run) => run.thumbnailRenderMs.first), otherSeven: pick('on', (run) => run.thumbnailRenderMs.scroll), fiveEdits: pick('on', (run) => run.thumbnailRenderMs.edits) },
    editedThumbnailVisibleAfterEditPaintMs: pick('on', (run) => median(run.edits.thumbnailMs.map((value, index) => value - run.edits.commitMs[index]))),
    longTaskMsForFiveEdits: { thumbnailsOn: pick('on', (run) => run.edits.longTaskMs), thumbnailsOff: pick('off', (run) => run.edits.longTaskMs) },
    editPaintMsMedian: { thumbnailsOn: pick('on', (run) => median(run.edits.commitMs)), thumbnailsOff: pick('off', (run) => median(run.edits.commitMs)) },
  };
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ summary, runs }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
