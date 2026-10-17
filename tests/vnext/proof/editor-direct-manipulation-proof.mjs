import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w2c-editor-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W2C_PROOF_PORT ?? 5198);
const server = await createServer({ root, server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
let browser;

const rounded = (value) => Math.round(value * 1000) / 1000;
const rect = async (locator) => {
  const value = await locator.boundingBox();
  assert(value, 'Expected visible bounding box');
  return Object.fromEntries(Object.entries(value).map(([key, number]) => [key, rounded(number)]));
};
const sameRect = (left, right, tolerance = 0.75) => {
  for (const key of ['x', 'y', 'width', 'height']) {
    assert(Math.abs(left[key] - right[key]) <= tolerance, `${key}: ${left[key]} vs ${right[key]}`);
  }
};

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

  await page.goto(`http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w2-editor-browser.html?demo=1`, { waitUntil: 'networkidle' });
  await page.locator('[data-vnext-shell]').waitFor();
  assert.equal(requests.some((url) => url.includes('/src/legacy-main')), false, 'Legacy bootstrap must not load in VNext editor proof');

  await page.locator('[data-editor-action="add-text"]').click();
  let selected = page.locator('[data-editor-object-id][data-selected="true"]');
  await selected.waitFor();
  assert.equal(await page.locator('[data-resize-handle]').count(), 8);
  // FR-16b: every resize handle is at least 24 x 24 px on screen at the editor zoom (counter-scaled inside the page).
  const handleSizes = await page.locator('[data-resize-handle]').evaluateAll((handles) => handles.map((handle) => {
    const box = handle.getBoundingClientRect();
    return { handle: handle.getAttribute('data-resize-handle'), width: box.width, height: box.height };
  }));
  for (const size of handleSizes) {
    assert(size.width >= 23.5 && size.height >= 23.5, `Handle ${size.handle} must be >= 24 px on screen, got ${size.width} x ${size.height}`);
  }
  // FR-16b: the grab areas reach at most 7 px into the object (the rest lies outside it), so a small object keeps its middle
  // free to be dragged. Checked on the selected text, then on the same object shrunk to 20 x 20 px on screen (DOM only,
  // restored right away, the document does not change).
  const handleReach = await selected.evaluate((target) => {
    const reachInto = (frame) => [...target.querySelectorAll('[data-resize-handle]')].map((handle) => {
      const box = handle.getBoundingClientRect();
      const side = handle.getAttribute('data-resize-handle');
      return {
        side,
        inward: Math.max(
          side.includes('n') ? box.bottom - frame.top : 0,
          side.includes('s') ? frame.bottom - box.top : 0,
          side.includes('e') ? frame.right - box.left : 0,
          side.includes('w') ? box.right - frame.left : 0,
        ),
      };
    });
    const full = reachInto(target.getBoundingClientRect());
    const { width, height } = target.style;
    try {
      target.style.width = '100px';
      const scale = target.getBoundingClientRect().width / 100;
      target.style.width = `${20 / scale}px`;
      target.style.height = `${20 / scale}px`;
      const frame = target.getBoundingClientRect();
      const hit = document.elementFromPoint(frame.left + frame.width / 2, frame.top + frame.height / 2);
      return {
        full,
        small: reachInto(frame),
        smallSize: { width: frame.width, height: frame.height },
        middleMoves: Boolean(hit && target.contains(hit) && !hit.closest('[data-resize-handle]')),
      };
    } finally {
      target.style.width = width;
      target.style.height = height;
    }
  });
  for (const { side, inward } of [...handleReach.full, ...handleReach.small]) {
    assert(inward <= 7.5, `Handle ${side} must reach at most 7 px into the object, got ${inward}`);
  }
  assert(Math.abs(handleReach.smallSize.width - 20) < 1 && Math.abs(handleReach.smallSize.height - 20) < 1, `Small object must be 20 px, got ${JSON.stringify(handleReach.smallSize)}`);
  assert(handleReach.middleMoves, 'The middle of a 20 x 20 px object must still start a move, not a resize');
  const textId = await selected.getAttribute('data-editor-object-id');
  assert(textId);
  const textCanonical = page.locator(`[data-object-id="${textId}"]`);

  const scale = await page.locator('[data-vnext-page-stage]').evaluate((element) => Number.parseFloat(getComputedStyle(element).zoom));
  // FR-16a: the default zoom is "Ajustar à largura" (about 1.2 at this viewport), so only require a non-1 scale.
  assert(scale > 0 && Math.abs(scale - 1) > 0.01, `Expected non-1 editor scale, got ${scale}`);
  const initialCanonical = await rect(textCanonical);
  const initialOverlay = await rect(selected);
  sameRect(initialCanonical, initialOverlay);

  let box = await selected.boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 42, box.y + box.height / 2 + 24, { steps: 6 });
  const duringCanonical = await rect(textCanonical);
  const duringOverlay = await rect(selected);
  sameRect(initialCanonical, duringCanonical);
  assert(Math.abs(duringOverlay.x - initialOverlay.x) > 30, 'Overlay must show drag preview');
  assert(Math.abs(duringOverlay.y - initialOverlay.y) > 15, 'Overlay must show drag preview');
  await page.mouse.up();
  const committedCanonical = await rect(textCanonical);
  selected = page.locator(`[data-editor-object-id="${textId}"]`);
  const committedOverlay = await rect(selected);
  sameRect(committedCanonical, committedOverlay);
  assert(Math.abs(committedCanonical.x - initialCanonical.x) > 30, 'Pointerup must commit move');

  await page.locator('[data-editor-action="undo"]').click();
  sameRect(await rect(textCanonical), initialCanonical);
  await page.locator('[data-editor-action="redo"]').click();
  sameRect(await rect(textCanonical), committedCanonical);

  const dragResize = async (handle, deltaX, deltaY) => {
    const resizeHandle = page.locator(`[data-resize-handle="${handle}"]`);
    const handleBox = await resizeHandle.boundingBox();
    assert(handleBox);
    const before = await rect(textCanonical);
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 5 });
    const preview = await rect(selected);
    sameRect(await rect(textCanonical), before);
    await page.mouse.up();
    const after = await rect(textCanonical);
    sameRect(after, await rect(selected));
    return { before, preview, after };
  };

  const leftResize = await dragResize('w', -30, 0);
  assert(leftResize.preview.x < leftResize.before.x - 20, 'Left resize preview must move the left edge');
  assert(leftResize.preview.width > leftResize.before.width + 20, 'Left resize preview must grow width');
  assert(leftResize.after.x < leftResize.before.x - 20, 'Left resize pointerup must commit x');
  assert(leftResize.after.width > leftResize.before.width + 20, 'Left resize pointerup must commit width');

  const topResize = await dragResize('n', 0, -24);
  assert(topResize.preview.y < topResize.before.y - 15, 'Top resize preview must move the top edge');
  assert(topResize.preview.height > topResize.before.height + 15, 'Top resize preview must grow height');
  assert(topResize.after.y < topResize.before.y - 15, 'Top resize pointerup must commit y');
  assert(topResize.after.height > topResize.before.height + 15, 'Top resize pointerup must commit height');

  const cornerResize = await dragResize('nw', -20, -16);
  assert(cornerResize.preview.x < cornerResize.before.x - 10, 'Corner resize preview must move the left edge');
  assert(cornerResize.preview.y < cornerResize.before.y - 8, 'Corner resize preview must move the top edge');
  assert(cornerResize.preview.width > cornerResize.before.width + 10, 'Corner resize preview must grow width');
  assert(cornerResize.preview.height > cornerResize.before.height + 8, 'Corner resize preview must grow height');
  assert(cornerResize.after.x < cornerResize.before.x - 10, 'Corner resize pointerup must commit x');
  assert(cornerResize.after.y < cornerResize.before.y - 8, 'Corner resize pointerup must commit y');
  assert(cornerResize.after.width > cornerResize.before.width + 10, 'Corner resize pointerup must commit width');
  assert(cornerResize.after.height > cornerResize.before.height + 8, 'Corner resize pointerup must commit height');
  const afterResize = cornerResize.after;

  box = await selected.boundingBox();
  assert(box);
  const beforeEscape = await rect(textCanonical);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 10, { steps: 4 });
  assert(Math.abs((await rect(selected)).x - beforeEscape.x) > 20, 'Escape proof requires an active preview');
  await page.keyboard.press('Escape');
  sameRect(await rect(selected), beforeEscape);
  sameRect(await rect(textCanonical), beforeEscape);
  await page.mouse.up();
  sameRect(await rect(textCanonical), beforeEscape);

  await page.locator('[data-editor-action="add-shape"]').click();
  const shapeId = await page.locator('[data-editor-object-id][data-selected="true"]').getAttribute('data-editor-object-id');
  assert(shapeId && await page.locator(`[data-object-id="${shapeId}"] [data-primitive-type="shape"]`).count() === 1);
  await page.locator('[data-editor-action="add-table"]').click();
  assert.equal(await page.locator('[data-table-id]').count(), 1);
  await page.locator('[data-editor-action="add-image"]').click();
  const imageId = await page.locator('[data-editor-object-id][data-selected="true"]').getAttribute('data-editor-object-id');
  assert(imageId);
  const image = page.locator(`[data-object-id="${imageId}"] [data-primitive-type="image"]`);
  await image.waitFor();
  const beforeAsset = await image.getAttribute('data-asset-id');
  await page.locator('[data-editor-action="replace-image"]').click();
  const afterAsset = await image.getAttribute('data-asset-id');
  assert(beforeAsset && afterAsset && beforeAsset !== afterAsset, 'Replace Image must change only asset reference');

  const inspectorX = page.locator('[data-inspector-field="x"]');
  const imageBeforeInspector = await rect(page.locator(`[data-object-id="${imageId}"]`));
  await inspectorX.fill('33.25');
  await inspectorX.press('Enter');
  await page.waitForFunction((id) => {
    const node = document.querySelector(`[data-object-id="${id}"]`);
    return node instanceof HTMLElement && Number.parseFloat(node.style.left) > 120;
  }, imageId);
  assert.equal(await inspectorX.inputValue(), '33,25', 'FR-10: the committed value is shown in pt-BR');
  const imageAfterInspector = await rect(page.locator(`[data-object-id="${imageId}"]`));
  assert(imageAfterInspector.x > imageBeforeInspector.x + 20, 'Inspector X must commit canonical object.move');
  const inspectorXCommitted = await inspectorX.inputValue();

  await page.locator('[data-editor-action="add-line"]').click();
  assert.equal(await page.locator('[data-primitive-type="line"]').count(), 1);
  const lineCountBeforeSelection = await page.locator('[data-primitive-type="line"]').count();
  const shapeOverlay = page.locator(`[data-editor-object-id="${shapeId}"]`);
  box = await shapeOverlay.boundingBox();
  assert(box);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal(await page.locator(`[data-editor-object-id="${shapeId}"][data-selected="true"]`).count(), 1);
  await page.locator('[data-editor-action="undo"]').click();
  assert.equal(lineCountBeforeSelection, 1);
  assert.equal(await page.locator('[data-primitive-type="line"]').count(), 0, 'Selection must not create a history entry');

  await page.screenshot({ path: resolve(output, 'w2c-v2.png'), fullPage: true });
  const evidence = {
    chromiumVersion: browser.version(),
    scale,
    legacyBootstrapLoaded: requests.some((url) => url.includes('/src/legacy-main')),
    consoleErrors,
    pageErrors,
    initialCanonical,
    dragPreviewOverlay: duringOverlay,
    dragCommitted: committedCanonical,
    leftResize,
    topResize,
    cornerResize,
    imageAssetBefore: beforeAsset,
    imageAssetAfter: afterAsset,
    inspectorX: inspectorXCommitted,
    imageBeforeInspector,
    imageAfterInspector,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log('W2.C Chromium editor proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
