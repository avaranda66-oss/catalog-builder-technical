// FR-80 / FR-18 browser check (slice 2H). Runs the real publication review on the PRESYS starters
// "Ficha técnica" and "Folder": empty, only "A COMPLETAR" blocks; filled with example text, READY with a
// PDF. Then opens the folder in the simple editor: page thumbnails with names, the "Usar modelo…"
// gallery, and inserting the "Contracapa" model. Output: scratch/fr80-archetypes/.
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/fr80-archetypes');
await mkdir(output, { recursive: true });
const port = Number(process.env.FR80_PROOF_PORT ?? 5283);
const server = await createServer({
  root,
  cacheDir: resolve(output, '.vite'),
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  logLevel: 'error',
});
const url = (query) => `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/fr80-archetypes-browser.html?${query}`;
let browser;
const receipt = { reviews: [], editor: {} };
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const doc of ['ficha', 'folder']) {
    for (const filled of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(url(`doc=${doc}${filled ? '&filled=1' : ''}`));
      await page.waitForFunction(() => Boolean(window.__FR80__), undefined, { timeout: 60000 });
      const review = await page.evaluate(() => window.__FR80__);
      const blocking = review.diagnostics.filter((item) => item.severity === 'ERROR');
      const warnings = review.diagnostics.filter((item) => item.severity !== 'ERROR');
      receipt.reviews.push({ doc, filled, status: review.status, pages: review.pages,
        blockingCodes: [...new Set(blocking.map((item) => item.code))], blockingCount: blocking.length,
        warnings: warnings.map((item) => `${item.code}@p${item.page}`), errors });
      assert.deepEqual(errors, []);
      if (filled) {
        assert.equal(review.status, 'READY', `${doc} filled must be READY: ${JSON.stringify(blocking)}`);
        await page.emulateMedia({ media: 'print' });
        await page.pdf({ path: resolve(output, `${doc}-filled.pdf`), format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
        await page.emulateMedia({ media: 'screen' });
        await page.screenshot({ path: resolve(output, `${doc}-filled.png`), fullPage: true });
      } else {
        assert.equal(review.status, 'BLOCKED');
        assert.deepEqual([...new Set(blocking.map((item) => item.code))], ['UNRESOLVED_PLACEHOLDER'], `${doc}: only "A COMPLETAR" may block`);
        assert.ok(new Set(blocking.map((item) => item.page)).size === review.pages, `${doc}: every page has something to fill`);
      }
      await context.close();
    }
  }

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url('doc=editor'));
  await page.locator('[data-vnext-shell]').waitFor();
  const nav = page.getByRole('navigation', { name: 'Navegação de páginas' });
  await page.waitForFunction(() => [...document.querySelectorAll('.vnext-page-list [data-page-thumbnail]')]
    .some((host) => host.getAttribute('data-thumbnail-state') === 'rendered'));
  assert.equal(await nav.getByRole('button', { name: 'Página 1', exact: true }).getAttribute('title'), 'Modelo (A COMPLETAR)');
  assert.equal(await nav.getByRole('button', { name: 'Página 5', exact: true }).getAttribute('title'), 'Especificações técnicas');
  // The drawn pages live in closed shadow roots: the editor still has exactly one page on its canvas.
  assert.equal(await page.locator('[data-editorial-root] [data-page-id]').count(), 1);
  receipt.editor.thumbnailWidthPx = await page.locator('.vnext-page-list [data-page-thumbnail]').first().evaluate((node) => Math.round(node.getBoundingClientRect().width));
  await page.screenshot({ path: resolve(output, 'editor-thumbnails.png') });
  await page.getByRole('button', { name: 'Usar modelo…' }).click();
  const gallery = page.getByRole('group', { name: 'Modelo de página PRESYS' });
  assert.equal(await gallery.getByRole('radio').count(), 11);
  await gallery.getByText('Contracapa', { exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-page-model-gallery] [data-page-thumbnail]')]
    .filter((host) => host.getAttribute('data-thumbnail-state') === 'rendered').length >= 3);
  await page.screenshot({ path: resolve(output, 'editor-gallery.png') });
  await page.getByRole('button', { name: 'Inserir modelo após a página atual' }).click();
  await nav.getByRole('button', { name: 'Página 2', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.vnext-page-list [data-page-nav-id]').length === 11);
  assert.equal(await nav.getByRole('button', { name: 'Página 2', exact: true }).getAttribute('aria-current'), 'page');
  await page.screenshot({ path: resolve(output, 'editor-inserted.png') });
  receipt.editor.pagesAfterInsert = await page.locator('.vnext-page-list [data-page-nav-id]').count();
  receipt.editor.errors = errors;
  assert.deepEqual(errors, []);
  await context.close();
  await writeFile(resolve(output, 'result.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
