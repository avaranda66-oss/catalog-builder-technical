import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w2d-editor-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W2D_PROOF_PORT ?? 5199);
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

const numberInput = (page, field) => page.locator(`[data-inspector-field="${field}"]`);
const readMm = async (page, field) => Number.parseFloat(await numberInput(page, field).inputValue());
const near = (actual, expected, tolerance = 0.001, label = 'value') => {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
};
const waitMm = async (page, field, expected, tolerance = 0.001) => {
  await page.waitForFunction(
    ({ selector, expectedValue, toleranceValue }) => {
      const input = document.querySelector(selector);
      return input instanceof HTMLInputElement
        && Math.abs(Number.parseFloat(input.value) - expectedValue) <= toleranceValue;
    },
    { selector: `[data-inspector-field="${field}"]`, expectedValue: expected, toleranceValue: tolerance }
  );
};
const selectedOverlay = (page) => page.locator('[data-editor-object-id][data-selected="true"]');
const canonicalObject = (page, id) => page.locator(`[data-editorial-root]:not([data-unused]) [data-object-id="${id}"]`).first();

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
  await page.locator('[data-vnext-shell]').waitFor();
  assert.equal(requests.some((url) => url.includes('/src/legacy-main')), false, 'Legacy bootstrap must not load on /v2');
  assert.equal(await page.locator('[data-editor-safe-area]').count(), 1, 'Configured Page.safeArea must render once in editor overlay');

  const pageBox = await page.locator('[data-editorial-root] [data-page-id]').first().boundingBox();
  assert(pageBox);
  const pxPerMm = pageBox.width / 210;
  const scale = await page.locator('[data-vnext-page-stage]').evaluate((element) => Number.parseFloat(getComputedStyle(element).zoom));
  assert(scale > 0 && scale < 1, `Expected non-1 editor scale, got ${scale}`);

  await page.locator('[data-editor-action="add-text"]').click();
  let selected = selectedOverlay(page);
  await selected.waitFor();
  const textId = await selected.getAttribute('data-editor-object-id');
  assert(textId);

  let box = await selected.boundingBox();
  assert(box);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 19 * pxPerMm, startY, { steps: 6 });
  assert.equal(await page.locator('[data-snap-guide="x"][data-snap-guide-kind="page-edge"]').count(), 1, 'Page-edge guide must appear');
  await page.mouse.move(startX, startY, { steps: 4 });
  assert.equal(await page.locator('[data-snap-guide]').count(), 0, 'Guide must disappear when candidate moves away');
  await page.mouse.move(startX - 19 * pxPerMm, startY, { steps: 4 });
  await page.mouse.up();
  await waitMm(page, 'x', 0);
  assert.equal(await page.locator('[data-snap-guide]').count(), 0, 'Guide must disappear after commit');

  await page.locator('[data-editor-action="undo"]').click();
  await waitMm(page, 'x', 20);
  const snapToggle = page.locator('[data-editor-action="toggle-snapping"]');
  await snapToggle.click();
  assert.equal(await snapToggle.getAttribute('aria-pressed'), 'false');
  selected = selectedOverlay(page);
  box = await selected.boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 19 * pxPerMm, box.y + box.height / 2, { steps: 5 });
  assert.equal(await page.locator('[data-snap-guide]').count(), 0, 'Disabled snapping must show no guide');
  await page.mouse.up();
  await page.waitForTimeout(100);
  await waitMm(page, 'x', 1, 0.01);
  const disabledSnapRawXmm = await readMm(page, 'x');
  near(disabledSnapRawXmm, 1, 0.01, 'disabled-snap raw x');

  await page.locator('[data-editor-action="undo"]').click();
  await waitMm(page, 'x', 20);
  await snapToggle.click();
  assert.equal(await snapToggle.getAttribute('aria-pressed'), 'true');
  selected = selectedOverlay(page);
  box = await selected.boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 43 * pxPerMm, box.y + box.height / 2, { steps: 8 });
  assert.equal(await page.locator('[data-snap-guide="x"][data-snap-guide-kind="page-center"]').count(), 1, 'Page-center guide must appear');
  await page.mouse.up();
  await waitMm(page, 'x', 64);

  await page.locator('[data-editor-action="add-shape"]').click();
  selected = selectedOverlay(page);
  const shapeId = await selected.getAttribute('data-editor-object-id');
  assert(shapeId);
  box = await selected.boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 33 * pxPerMm, box.y + box.height / 2, { steps: 7 });
  const siblingGuide = page.locator('[data-snap-guide="x"][data-snap-guide-kind="object-edge"]');
  assert.equal(await siblingGuide.count(), 1, 'Sibling-edge guide must appear');
  assert.equal(await siblingGuide.getAttribute('data-snap-guide-source-object-id'), textId);
  await page.mouse.up();
  await waitMm(page, 'x', 146);

  const east = page.locator('[data-resize-handle="e"]');
  let handleBox = await east.boundingBox();
  assert(handleBox);
  const beforeResizeX = await readMm(page, 'x');
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 5 * pxPerMm, handleBox.y + handleBox.height / 2, { steps: 6 });
  assert.equal(await page.locator('[data-snap-guide="x"][data-snap-guide-kind="page-edge"]').count(), 1, 'Controlled east edge must snap to page edge');
  await page.mouse.up();
  await waitMm(page, 'width', 64);
  near(await readMm(page, 'x'), beforeResizeX, 0.001, 'east resize opposite edge');
  await page.locator('[data-diagnostic-code="SAFE_AREA_VIOLATION"][data-diagnostic-severity="WARNING"]').waitFor();
  near(await readMm(page, 'width'), 64, 0.001, 'safe-area crossing authored width');

  selected = selectedOverlay(page);
  box = await selected.boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 5 * pxPerMm, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await waitMm(page, 'x', 151, 0.01);
  await page.locator('[data-diagnostic-code="OBJECT_OUTSIDE_PAGE"][data-diagnostic-severity="ERROR"]').waitFor();
  near(await readMm(page, 'x'), 151, 0.01, 'outside-page authored x');

  await numberInput(page, 'x').fill('140');
  await numberInput(page, 'x').press('Enter');
  await waitMm(page, 'x', 140);
  await page.waitForFunction(() => !document.querySelector('[data-diagnostic-code="OBJECT_OUTSIDE_PAGE"]'));

  await page.locator('[data-editor-action="add-text"]').click();
  const overflowTextId = await selectedOverlay(page).getAttribute('data-editor-object-id');
  assert(overflowTextId);
  await numberInput(page, 'height').fill('1');
  await numberInput(page, 'height').press('Enter');
  await waitMm(page, 'height', 1);
  await page.locator('[data-diagnostic-code="TEXT_OBJECT_OVERFLOW"][data-diagnostic-severity="ERROR"]').waitFor({ timeout: 10000 });
  near(await readMm(page, 'height'), 1, 0.001, 'text overflow authored height');

  await page.locator('[data-editor-action="add-table"]').click();
  const tableId = await selectedOverlay(page).getAttribute('data-editor-object-id');
  assert(tableId);
  await numberInput(page, 'width').fill('0.0001');
  await numberInput(page, 'width').press('Enter');
  await waitMm(page, 'width', 0.0001, 0.00001);
  await page.locator('[data-diagnostic-code="TABLE_WIDTH_INFEASIBLE"][data-diagnostic-severity="ERROR"]').waitFor();
  near(await readMm(page, 'width'), 0.0001, 0.00001, 'table infeasible authored width');

  const editorialChromeCount = await page.locator(
    '[data-editorial-root] [data-snap-guide], [data-editorial-root] [data-editor-safe-area], [data-editorial-root] [data-editor-diagnostic-badge], [data-editorial-root] [data-editor-diagnostics], [data-editorial-root] [data-editor-action="toggle-snapping"]'
  ).count();
  assert.equal(editorialChromeCount, 0, 'W2.D editor chrome must remain outside every editorial root');
  assert.equal(await page.locator('[data-editor-diagnostics-probe] [data-snap-guide]').count(), 0);

  await page.screenshot({ path: resolve(output, 'w2d-v2.png'), fullPage: true });
  const evidence = {
    chromiumVersion: browser.version(),
    scale,
    pxPerMm,
    legacyBootstrapLoaded: requests.some((url) => url.includes('/src/legacy-main')),
    consoleErrors,
    pageErrors,
    textId,
    shapeId,
    overflowTextId,
    tableId,
    finalShape: { xMm: 140, widthMm: 64 },
    disabledSnapRawXmm,
    pageCenterTextXmm: 64,
    textOverflowHeightMm: 1,
    tableInfeasibleWidthMm: 0.0001,
    editorialChromeCount,
    canonicalShapePresent: await canonicalObject(page, shapeId).count() > 0,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log('W2.D Chromium /v2 proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
