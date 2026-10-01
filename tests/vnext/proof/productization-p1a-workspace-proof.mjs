import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/p1a-productization-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.P1A_PROOF_PORT ?? 5260);
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
const state = page => page.evaluate(() => window.__P1A_PROOF__.state());
const settle = page => page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
async function waitSequence(page, before) {
  await page.waitForFunction(previous => window.__P1A_PROOF__.state().localSequence > previous, before, { timeout: 15000 });
  await settle(page);
}

async function desktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  watch(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const shell = page.locator('[data-vnext-shell]');
  await shell.waitFor({ timeout: 30000 });
  assert.equal(await shell.getAttribute('data-simple-by-default'), 'true');

  for (const action of ['add-text', 'add-image', 'add-table']) {
    assert.equal(await page.locator(`[data-editor-action="${action}"]`).count(), 1);
  }
  for (const action of ['add-shape', 'add-line', 'toggle-multi-select', 'group']) {
    assert.equal(await page.locator(`[data-editor-action="${action}"]`).count(), 0);
  }
  for (const action of ['library', 'save', 'translate', 'publish']) {
    assert.equal(await page.locator(`[data-editor-action="${action}"]`).count(), 1);
  }
  assert.equal(await page.locator('.vnext-badge').count(), 0);
  assert.equal(await page.locator('[data-save-state]').count(), 1);

  const reuse = page.locator('[data-editor-action="toggle-page-reuse"]');
  assert.equal(await reuse.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('[data-editor-action="insert-template"]').count(), 0);
  await reuse.click();
  assert.equal(await reuse.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('[data-editor-action="insert-template"]').count(), 1);
  await reuse.click();

  const more = page.locator('[data-editor-action="toggle-advanced-tools"]');
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
  await more.click();
  assert.equal(await page.locator('[data-editor-action="add-shape"]').count(), 1);
  assert.equal(await page.locator('[data-editor-action="toggle-multi-select"]').count(), 1);
  await page.locator('[data-editor-object-id="w4f1-table-object"]').click();
  await page.locator('[data-editor-action="edit-table"]').click();
  await page.locator('[data-table-grid-overlay]').waitFor({ timeout: 20000 });
  const independentTableOptions = page.locator('[data-editor-action="toggle-table-options"]');
  assert.equal(await independentTableOptions.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('[data-editor-action="insert-row-before"]').count(), 0);
  await page.locator('[data-editor-action="leave-table-grid"]').click();
  await more.click();

  const ids = await page.evaluate(() => ({
    image: window.__P1A_PROOF__.imageId,
    text: window.__P1A_PROOF__.textId,
  }));
  await page.locator(`[data-editor-object-id="${ids.text}"]`).click();
  assert.equal(await page.locator('[data-editor-action="edit-text"]').count(), 1);
  let before = (await state(page)).localSequence;
  await page.locator('[data-editor-action="edit-text"]').click();
  await page.locator('[data-text-edit-textarea]').fill('Texto P1.A simples por padrão');
  await page.locator('[data-editor-action="commit-text"]').click();
  await waitSequence(page, before);

  await page.locator(`[data-editor-object-id="${ids.image}"]`).click();
  await page.locator('[data-image-professional-authoring]').waitFor();
  assert.equal(await page.locator('[data-editor-action="replace-image"]').count(), 0);

  await page.locator('[data-editor-object-id="w4f1-table-object"]').click();
  await page.locator('[data-editor-action="edit-table"]').click();
  await page.locator('[data-table-grid-overlay]').waitFor({ timeout: 20000 });
  assert.equal(await page.locator('[data-editor-action="insert-row-before"]').count(), 0);
  const tableOptions = page.locator('[data-editor-action="toggle-table-options"]');
  assert.equal(await tableOptions.getAttribute('aria-expanded'), 'false');

  await page.locator('[data-table-cell="1:0"]').click();
  await page.locator('[data-table-grid-overlay]').press('Enter');
  await page.locator('[data-cell-edit-session]').waitFor();
  before = (await state(page)).localSequence;
  await page.locator('[data-cell-rich-text]').fill('Valor P1.A');
  await page.locator('[data-editor-action="commit-cell-content"]').click();
  await waitSequence(page, before);
  await page.locator('[data-editor-action="leave-table-grid"]').click();

  const dirty = await state(page);
  assert.equal(dirty.dirty, true);
  await page.locator('[data-editor-action="save"]').click();
  await page.waitForFunction(() => {
    const current = window.__P1A_PROOF__.state();
    return !current.dirty && current.savePhase === 'idle';
  }, undefined, { timeout: 30000 });
  assert.equal((await page.locator('[data-save-state]').textContent())?.trim(), 'Salvo');

  before = (await state(page)).localSequence;
  await page.getByRole('button', { name: 'Adicionar nova página após a página atual' }).click();
  await waitSequence(page, before);
  assert.equal((await state(page)).document.pages.length, 2);
  assert.match((await page.locator('.vnext-canvas-meta strong').textContent()) ?? '', /Página 2 de 2/);

  before = (await state(page)).localSequence;
  await page.locator('[data-editor-action="undo"]').click();
  await waitSequence(page, before);
  assert.equal((await state(page)).document.pages.length, 1);
  before = (await state(page)).localSequence;
  await page.locator('[data-editor-action="redo"]').click();
  await waitSequence(page, before);
  assert.equal((await state(page)).document.pages.length, 2);

  await page.screenshot({ path: resolve(output, 'desktop-simple-workspace.png'), fullPage: true });
  await context.close();
  return {
    compactDefault: true,
    text: true,
    image: true,
    tableValue: true,
    save: true,
    pages: true,
    undoRedo: true,
    translateEntry: true,
    publicationEntry: true,
  };
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
    simple: document.querySelector('[data-vnext-shell]')?.getAttribute('data-simple-by-default'),
  }));
  assert.equal(geometry.simple, 'true');
  assert(geometry.documentWidth <= geometry.viewport, JSON.stringify(geometry));
  assert(geometry.bodyWidth <= geometry.viewport, JSON.stringify(geometry));
  assert.equal(await page.locator('[data-editor-action="add-shape"]').count(), 0);
  await page.screenshot({ path: resolve(output, 'narrow-820.png'), fullPage: true });
  await context.close();
  return geometry;
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: Boolean(process.env.CI || process.env.P1A_PROOF_HEADLESS) });
  const desktopResult = await desktop(browser);
  const narrowResult = await narrow(browser);
  assert.deepEqual(errors.consoleErrors, []);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.failedResources, []);
  assert.deepEqual(errors.requestFailures, []);
  const report = {
    status: 'PASS',
    browser: browser.version(),
    slice: 'P1.A simple-by-default workspace',
    desktop: desktopResult,
    narrow: narrowResult,
    advancedCapabilitiesPreservedBehindDisclosure: true,
    fatherPilotStarted: false,
    errors,
  };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log('P1.A Productization Chromium proof: PASS');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
