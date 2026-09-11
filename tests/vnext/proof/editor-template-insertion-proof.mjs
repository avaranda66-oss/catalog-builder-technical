import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w2e-editor-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W2E_PROOF_PORT ?? 5200);
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

const input = (page, field) => page.locator(`[data-inspector-field="${field}"]`);
const readMm = async (page, field) => Number.parseFloat(await input(page, field).inputValue());
const waitMm = async (page, field, expected, tolerance = 0.01) => {
  await page.waitForFunction(
    ({ selector, expectedValue, toleranceValue }) => {
      const element = document.querySelector(selector);
      return element instanceof HTMLInputElement
        && Math.abs(Number.parseFloat(element.value) - expectedValue) <= toleranceValue;
    },
    { selector: `[data-inspector-field="${field}"]`, expectedValue: expected, toleranceValue: tolerance }
  );
};
const rootObjectIds = async (page) => page.locator('[data-editorial-root] [data-page-id] > [data-object-id]')
  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-object-id')));

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const requests = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));

  await page.goto(`http://127.0.0.1:${port}/v2`, { waitUntil: 'networkidle' });
  const shell = page.locator('[data-vnext-shell]');
  await shell.waitFor();
  const initialPageId = await shell.getAttribute('data-active-page-id');
  assert(initialPageId);
  assert.equal(await page.locator('.vnext-page-list button').count(), 1);
  assert.equal(requests.some((url) => url.includes('/src/legacy-main')), false, 'Legacy bootstrap must not load on /v2');

  await page.locator('[data-editor-action="insert-template"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.vnext-page-list button').length === 2);
  const insertedPageId = await shell.getAttribute('data-active-page-id');
  assert(insertedPageId && insertedPageId !== initialPageId, 'Inserted template page must become active');

  assert.equal(await page.locator('[data-primitive-type="text"]').count(), 1, 'Template Text must render normally');
  assert.equal(await page.locator('[data-primitive-type="shape"]').count(), 1, 'Template Shape must render normally');
  assert.equal(await page.locator('[data-primitive-type="image"]').count(), 1, 'Template Image must render normally');
  assert.equal(await page.locator('[data-table-id]').count(), 1, 'Template Table must render normally');
  const insertedObjectIds = await rootObjectIds(page);
  assert.equal(insertedObjectIds.length, 4);

  const shapeId = await page.locator('[data-primitive-type="shape"]').evaluate((node) =>
    node.closest('[data-object-id]')?.getAttribute('data-object-id')
  );
  assert(shapeId);
  let shapeOverlay = page.locator(`[data-editor-object-id="${shapeId}"]`);
  let box = await shapeOverlay.boundingBox();
  assert(box);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator(`[data-editor-object-id="${shapeId}"][data-selected="true"]`).waitFor();
  assert.equal(await page.locator('[data-resize-handle]').count(), 8);

  const pageBox = await page.locator('[data-editorial-root] [data-page-id]').boundingBox();
  assert(pageBox);
  const pxPerMm = pageBox.width / 210;
  shapeOverlay = page.locator(`[data-editor-object-id="${shapeId}"][data-selected="true"]`);
  box = await shapeOverlay.boundingBox();
  assert(box);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 131 * pxPerMm, startY, { steps: 10 });
  assert.equal(
    await page.locator('[data-snap-guide="x"][data-snap-guide-kind="page-edge"]').count(),
    1,
    'Move preview must snap to the page edge'
  );
  await page.mouse.up();
  await waitMm(page, 'x', 0);
  const movedXmm = await readMm(page, 'x');

  const east = page.locator('[data-resize-handle="e"]');
  const eastBox = await east.boundingBox();
  assert(eastBox);
  const widthBeforeResize = await readMm(page, 'width');
  await page.mouse.move(eastBox.x + eastBox.width / 2, eastBox.y + eastBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(eastBox.x + eastBox.width / 2 + 5 * pxPerMm, eastBox.y + eastBox.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(
    ({ selector, before }) => {
      const element = document.querySelector(selector);
      return element instanceof HTMLInputElement && Number.parseFloat(element.value) > before + 4;
    },
    { selector: '[data-inspector-field="width"]', before: widthBeforeResize }
  );
  const widthAfterResize = await readMm(page, 'width');
  assert(widthAfterResize > widthBeforeResize + 4, 'Resize must commit on inserted canonical object');

  const templateChromeInsideEditorialRoot = await page.locator(
    '[data-editorial-root] [data-editor-action="insert-template"], [data-editorial-root] [data-template-id], [data-editorial-root] [data-template-editor]'
  ).count();
  assert.equal(templateChromeInsideEditorialRoot, 0, 'Template editor chrome must remain outside canonical rendering');

  await page.locator('[data-editor-action="undo"]').click();
  await waitMm(page, 'width', widthBeforeResize);
  await page.locator('[data-editor-action="undo"]').click();
  await waitMm(page, 'x', 132);
  await page.locator('[data-editor-action="undo"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.vnext-page-list button').length === 1);
  assert.equal(await shell.getAttribute('data-active-page-id'), initialPageId);

  await page.locator('[data-editor-action="redo"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.vnext-page-list button').length === 2);
  await page.getByRole('button', { name: 'Página 2' }).click();
  await page.waitForFunction((id) => document.querySelector('[data-vnext-shell]')?.getAttribute('data-active-page-id') === id, insertedPageId);
  const restoredObjectIds = await rootObjectIds(page);
  assert.equal(await shell.getAttribute('data-active-page-id'), insertedPageId);
  assert.deepEqual(restoredObjectIds, insertedObjectIds, 'Redo must restore exact materialized object identities');
  assert.equal(await page.locator('[data-primitive-type="text"]').count(), 1);
  assert.equal(await page.locator('[data-primitive-type="shape"]').count(), 1);
  assert.equal(await page.locator('[data-primitive-type="image"]').count(), 1);
  assert.equal(await page.locator('[data-table-id]').count(), 1);

  await page.screenshot({ path: resolve(output, 'w2e-v2.png'), fullPage: true });
  const evidence = {
    chromiumVersion: browser.version(),
    initialPageId,
    insertedPageId,
    insertedObjectIds,
    restoredObjectIds,
    movedXmm,
    widthBeforeResize,
    widthAfterResize,
    templateChromeInsideEditorialRoot,
    legacyBootstrapLoaded: requests.some((url) => url.includes('/src/legacy-main')),
    consoleErrors,
    pageErrors,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log('W2.E Chromium /v2 proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
