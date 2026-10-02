import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/p1b-contextual-inspector-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.P1B_PROOF_PORT ?? 5261);
const server = await createServer({
  root,
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  logLevel: 'error',
});
const url = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/p1a-productization-browser.html`;
const errors = { consoleErrors: [], pageErrors: [], failedResources: [], requestFailures: [] };

function watch(page) {
  page.on('console', message => { if (message.type() === 'error') errors.consoleErrors.push(message.text()); });
  page.on('pageerror', error => errors.pageErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.failedResources.push({ status: response.status(), url: response.url() }); });
  page.on('requestfailed', request => errors.requestFailures.push(request.url()));
}

async function desktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  watch(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-vnext-shell]').waitFor({ timeout: 30000 });
  const ids = await page.evaluate(() => ({
    text: window.__P1A_PROOF__.textId,
    image: window.__P1A_PROOF__.imageId,
    table: window.__P1A_PROOF__.tableObjectId,
  }));

  await page.locator(`[data-editor-object-id="${ids.text}"]`).click();
  assert.equal((await page.locator('.vnext-info h2').textContent())?.trim(), 'Texto');
  const details = page.locator('[data-editor-action="toggle-inspector-details"]');
  assert.equal(await details.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('[data-inspector-authoring]').count(), 0);
  assert.equal(await page.locator('[data-object-locking]').count(), 0);
  await details.click();
  assert.equal(await details.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('[data-inspector-authoring]').count(), 1);
  assert.equal(await page.locator('[data-object-locking]').count(), 1);

  await page.locator(`[data-editor-object-id="${ids.image}"]`).click();
  assert.equal((await page.locator('.vnext-info h2').textContent())?.trim(), 'Imagem');
  assert.equal(await page.locator('[data-editor-action="toggle-inspector-details"]').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('[data-inspector-authoring]').count(), 0);
  assert.equal(await page.locator('[data-image-professional-authoring]').count(), 1);

  await page.locator(`[data-editor-object-id="${ids.table}"]`).click();
  assert.equal((await page.locator('.vnext-info h2').textContent())?.trim(), 'Tabela');
  assert.equal(await page.locator('[data-table-semantic-title]').count(), 1);
  const tableDetails = page.locator('[data-editor-action="toggle-table-inspector-advanced"]');
  assert.equal(await tableDetails.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('[data-table-advanced-details]').count(), 0);
  assert.equal(await page.locator('[data-table-fit-height]').count(), 0);
  await tableDetails.click();
  assert.equal(await tableDetails.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('[data-table-fit-height]').count(), 1);
  await tableDetails.click();

  await page.locator('[data-editor-action="edit-table"]').click();
  await page.locator('[data-table-grid-overlay]').waitFor({ timeout: 20000 });
  await page.locator('[data-table-cell="1:0"]').click();
  assert.equal(await page.locator('[data-table-cell-inspector]').count(), 1);
  assert.equal(await page.locator('[data-table-row-dimensions]').count(), 0);
  assert.equal(await page.locator('[data-table-column-dimensions]').count(), 0);
  assert.equal(await page.locator('[data-image-cell-authoring]').count(), 0);
  assert.equal(await page.locator('[data-cell-property]').count(), 0);
  await tableDetails.click();
  assert.equal(await page.locator('[data-table-advanced-details]').count(), 1);
  assert.equal(await page.locator('[data-table-fit-height]').count(), 1);
  assert.equal(await page.locator('[data-image-cell-authoring]').count(), 1);
  assert((await page.locator('[data-cell-property]').count()) > 0);
  await tableDetails.click();

  await page.screenshot({ path: resolve(output, 'desktop-contextual-inspector.png'), fullPage: true });
  await context.close();
  return { textContextual: true, imageContextual: true, tableContextual: true, cellEditingVisible: true };
}

async function narrow(browser) {
  const context = await browser.newContext({ viewport: { width: 820, height: 900 } });
  const page = await context.newPage();
  watch(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-vnext-shell]').waitFor({ timeout: 30000 });
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  assert(geometry.documentWidth <= geometry.viewport, JSON.stringify(geometry));
  assert(geometry.bodyWidth <= geometry.viewport, JSON.stringify(geometry));
  await page.screenshot({ path: resolve(output, 'narrow-820.png'), fullPage: true });
  await context.close();
  return geometry;
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: Boolean(process.env.CI || process.env.P1B_PROOF_HEADLESS) });
  const desktopResult = await desktop(browser);
  const narrowResult = await narrow(browser);
  assert.deepEqual(errors.consoleErrors, []);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.failedResources, []);
  assert.deepEqual(errors.requestFailures, []);
  const report = {
    status: 'PASS',
    browser: browser.version(),
    slice: 'P1.B contextual inspector',
    desktop: desktopResult,
    narrow: narrowResult,
    technicalSurfacePreservedByDefault: true,
    p2Started: false,
    fatherPilotStarted: false,
    errors,
  };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log('P1.B Contextual Inspector Chromium proof: PASS');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
