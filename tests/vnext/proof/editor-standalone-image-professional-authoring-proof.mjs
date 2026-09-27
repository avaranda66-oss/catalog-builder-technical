import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w4f4-standalone-image-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W4F4_PROOF_PORT ?? 5246);
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
const editorUrl = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w4f4-editor-browser.html`;
const file = {
  name: 'w4f4-real-image.png',
  mimeType: 'image/png',
  buffer: await readFile(resolve(root, 'public/assets/vnext/w2c-replacement.png')),
};
const errors = { consoleErrors: [], pageErrors: [], failedResources: [], requestFailures: [] };
const state = (page) => page.evaluate(() => window.__W4F4_PROOF__.state());

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

async function settle(page, frames = 3) {
  await page.evaluate(async (count) => {
    for (let index = 0; index < count; index += 1) {
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    }
  }, frames);
}

async function waitSequence(page, before, delta = 1) {
  await page.waitForFunction(
    ({ sequence, increase }) => window.__W4F4_PROOF__.state().localSequence >= sequence + increase,
    { sequence: before, increase: delta },
    { timeout: 10000 }
  );
  await settle(page);
}

async function activateFile(page, action) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator(`[data-editor-action="${action}"]`).click();
  return chooser;
}

async function uploadFromAction(page, action, expectedText) {
  const before = await state(page);
  await (await activateFile(page, action)).setFiles(file);
  await page.getByRole('status').filter({ hasText: expectedText }).waitFor({ timeout: 30000 });
  await settle(page, 4);
  const after = await state(page);
  assert.equal(after.uploadCount, before.uploadCount + 1);
  return after;
}

async function selectObject(page, objectId) {
  await page.locator(`[data-editor-object-id="${objectId}"]`).click();
  await page.locator('[data-image-professional-authoring]').waitFor();
  await settle(page);
}

async function bootstrapImage(page) {
  const first = await uploadFromAction(page, 'add-image', 'Imagem adicionada.');
  const firstImage = first.document.pages[0].objects.find((object) => object.type === 'image');
  assert(firstImage, 'First standalone Image was not inserted');
  const firstId = firstImage.id;

  const second = await uploadFromAction(page, 'add-image', 'Imagem adicionada.');
  const images = second.document.pages[0].objects.filter((object) => object.type === 'image');
  assert.equal(images.length, 2);
  const secondImage = images.find((image) => image.id !== firstId);
  assert(secondImage, 'Second standalone Image was not inserted');
  assert.equal(second.document.assets.length, 2);

  const beforeDelete = second.localSequence;
  await page.locator('[data-editor-action="delete"]').click();
  await waitSequence(page, beforeDelete);
  const afterDelete = await state(page);
  assert.equal(afterDelete.document.pages[0].objects.filter((object) => object.type === 'image').length, 1);
  assert.equal(afterDelete.document.assets.length, 2, 'Deleting an Image must not delete its AssetRef');

  await selectObject(page, firstId);
  return { firstId, alternateAssetId: secondImage.assetId };
}

function imageById(snapshot, objectId) {
  const image = snapshot.document.pages[0].objects.find((object) => object.id === objectId);
  assert(image && image.type === 'image', `Image ${objectId} missing`);
  return image;
}

async function setFit(page, fit) {
  const before = await state(page);
  await page.locator('[data-image-fit]').selectOption(fit);
  if (imageById(before, await page.locator('[data-editor-object-id][data-selected="true"]').getAttribute('data-editor-object-id')).fit !== fit) {
    await waitSequence(page, before.localSequence);
  } else {
    await settle(page);
  }
  return state(page);
}

async function pressFocal(page, axis, key) {
  const before = await state(page);
  const range = page.locator(`[data-image-focal-axis="${axis}"]`);
  await range.focus();
  await range.press(key);
  await waitSequence(page, before.localSequence);
  return state(page);
}

async function assertNoGlobalOverflow(page, width) {
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  assert.equal(geometry.viewport, width);
  assert(geometry.documentWidth <= width, JSON.stringify(geometry));
  assert(geometry.bodyWidth <= width, JSON.stringify(geometry));
  return geometry;
}

async function save(page) {
  await page.locator('[data-editor-action="save"]').click();
  await page.waitForFunction(() => !window.__W4F4_PROOF__.state().dirty, { timeout: 30000 });
  return state(page);
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: Boolean(process.env.CI || process.env.W4F4_PROOF_HEADLESS) });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watch(page);
  await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-vnext-shell]').waitFor({ timeout: 30000 });

  const ids = await page.evaluate(() => ({
    primaryId: window.__W4F4_PROOF__.primaryId,
    otherId: window.__W4F4_PROOF__.otherId,
  }));
  const { firstId, alternateAssetId } = await bootstrapImage(page);
  const baselineState = await state(page);
  const baseline = {
    id: firstId,
    assetId: imageById(baselineState, firstId).assetId,
    frame: imageById(baselineState, firstId).frame,
    zIndex: imageById(baselineState, firstId).zIndex,
    fit: imageById(baselineState, firstId).fit,
    focalPoint: imageById(baselineState, firstId).focalPoint ?? { x: 0.5, y: 0.5 },
    rawFocalPoint: imageById(baselineState, firstId).focalPoint,
    localSequence: baselineState.localSequence,
  };
  assert.equal(baseline.fit, 'contain');

  // Fit and focal authoring through real Father-facing controls.
  await setFit(page, 'cover');
  let authored = await state(page);
  assert.equal(imageById(authored, firstId).fit, 'cover');
  const pad = page.locator('[data-image-focal-pad]');
  const padBox = await pad.boundingBox();
  assert(padBox, 'Focal pad must be measurable');
  const beforePad = authored.localSequence;
  await pad.click({ position: { x: padBox.width * 0.27, y: padBox.height * 0.73 } });
  await waitSequence(page, beforePad);
  authored = await state(page);
  assert.equal(authored.localSequence, beforePad + 1, 'One focal pad gesture must create one semantic transition');
  let image = imageById(authored, firstId);
  assert(Math.abs(image.focalPoint.x - 0.27) <= 0.01);
  assert(Math.abs(image.focalPoint.y - 0.73) <= 0.01);

  authored = await pressFocal(page, 'x', 'Home');
  assert.equal(imageById(authored, firstId).focalPoint.x, 0);
  authored = await pressFocal(page, 'x', 'End');
  assert.equal(imageById(authored, firstId).focalPoint.x, 1);
  authored = await pressFocal(page, 'y', 'Home');
  assert.equal(imageById(authored, firstId).focalPoint.y, 0);
  authored = await pressFocal(page, 'y', 'End');
  assert.equal(imageById(authored, firstId).focalPoint.y, 1);

  const beforeCenter = authored.localSequence;
  await page.locator('[data-editor-action="center-image"]').click();
  await waitSequence(page, beforeCenter);
  authored = await state(page);
  assert.deepEqual(imageById(authored, firstId).focalPoint, { x: 0.5, y: 0.5 });

  // Contain preserves focal semantically and disables direct focal editing.
  await setFit(page, 'contain');
  assert(await page.locator('[data-image-focal-axis="x"]').isDisabled());
  assert(await page.locator('[data-image-focal-axis="y"]').isDisabled());
  await page.locator('[data-image-contain-guidance]').waitFor();
  await setFit(page, 'cover');

  // Undo/Redo restore canonical Image state.
  const beforeUndo = await state(page);
  await page.locator('[data-editor-action="undo"]').click();
  await settle(page);
  const undone = await state(page);
  assert.notEqual(imageById(undone, firstId).fit, imageById(beforeUndo, firstId).fit);
  await page.locator('[data-editor-action="redo"]').click();
  await settle(page);
  assert.deepEqual(imageById(await state(page), firstId), imageById(beforeUndo, firstId));

  // Existing AssetRef replacement preserves presentation and geometry.
  const beforeExisting = await state(page);
  const beforeExistingImage = imageById(beforeExisting, firstId);
  await page.locator('[data-image-asset-choice]').selectOption(alternateAssetId);
  await page.locator('[data-editor-action="use-image-asset"]').click();
  await waitSequence(page, beforeExisting.localSequence);
  let afterExisting = await state(page);
  image = imageById(afterExisting, firstId);
  assert.equal(image.assetId, alternateAssetId);
  assert.deepEqual(image.frame, beforeExistingImage.frame);
  assert.equal(image.zIndex, beforeExistingImage.zIndex);
  assert.equal(image.fit, beforeExistingImage.fit);
  assert.deepEqual(image.focalPoint, beforeExistingImage.focalPoint);
  await page.locator('[data-editor-action="undo"]').click();
  await settle(page);
  await page.locator('[data-editor-action="redo"]').click();
  await settle(page);
  afterExisting = await state(page);
  assert.equal(imageById(afterExisting, firstId).assetId, alternateAssetId);

  // Successful uploaded replacement through the Asset Persistence Bridge.
  const beforeUpload = await state(page);
  const successfulUpload = await uploadFromAction(page, 'upload-image-inspector', 'Imagem substituída.');
  image = imageById(successfulUpload, firstId);
  assert.notEqual(image.assetId, imageById(beforeUpload, firstId).assetId);
  assert.deepEqual(image.frame, imageById(beforeUpload, firstId).frame);
  assert.equal(image.fit, imageById(beforeUpload, firstId).fit);
  assert.deepEqual(image.focalPoint, imageById(beforeUpload, firstId).focalPoint);
  assert(successfulUpload.urls.some(([assetId]) => assetId === image.assetId));
  assert(successfulUpload.states.some(([assetId, value]) => assetId === image.assetId && value.status === 'resolved'));

  // Delayed upload loses to a newer focal authoring command.
  await page.evaluate(() => window.__W4F4_PROOF__.hold());
  const staleFocalBefore = await state(page);
  const chooserFocal = await activateFile(page, 'upload-image-inspector');
  await chooserFocal.setFiles(file);
  await page.getByRole('status').filter({ hasText: 'Enviando imagem…' }).waitFor();
  await page.waitForFunction((count) => window.__W4F4_PROOF__.state().uploadCount === count + 1, staleFocalBefore.uploadCount);
  const changedFocal = await pressFocal(page, 'x', 'Home');
  const winningFocal = imageById(changedFocal, firstId).focalPoint;
  const assetsBeforeStaleRelease = changedFocal.document.assets.length;
  const runtimeStatesBeforeStaleRelease = changedFocal.states.length;
  await page.evaluate(() => window.__W4F4_PROOF__.release());
  await page.getByRole('status').filter({ hasText: 'O envio terminou, mas a imagem mudou.' }).waitFor({ timeout: 30000 });
  const afterStaleFocal = await state(page);
  assert.deepEqual(imageById(afterStaleFocal, firstId).focalPoint, winningFocal);
  assert.equal(afterStaleFocal.document.assets.length, assetsBeforeStaleRelease);
  assert.equal(afterStaleFocal.states.length, runtimeStatesBeforeStaleRelease);
  assert.equal(afterStaleFocal.localSequence, changedFocal.localSequence);

  // Delayed upload loses to a legitimate existing-asset replacement.
  await page.evaluate(() => window.__W4F4_PROOF__.hold());
  const staleReplaceBefore = await state(page);
  const chooserReplace = await activateFile(page, 'upload-image-inspector');
  await chooserReplace.setFiles(file);
  await page.getByRole('status').filter({ hasText: 'Enviando imagem…' }).waitFor();
  await page.waitForFunction((count) => window.__W4F4_PROOF__.state().uploadCount === count + 1, staleReplaceBefore.uploadCount);
  const currentForRace = imageById(await state(page), firstId);
  const raceWinnerAsset = (await state(page)).document.assets.find((asset) => asset.id !== currentForRace.assetId).id;
  await page.locator('[data-image-asset-choice]').selectOption(raceWinnerAsset);
  const raceSequence = (await state(page)).localSequence;
  await page.locator('[data-editor-action="use-image-asset"]').click();
  await waitSequence(page, raceSequence);
  const replaceWinner = await state(page);
  assert.equal(imageById(replaceWinner, firstId).assetId, raceWinnerAsset);
  await page.evaluate(() => window.__W4F4_PROOF__.release());
  await page.getByRole('status').filter({ hasText: 'O envio terminou, mas a imagem mudou.' }).waitFor({ timeout: 30000 });
  assert.equal(imageById(await state(page), firstId).assetId, raceWinnerAsset);

  // Geometry is deliberately outside Image CAS: newer frame must survive accepted replacement.
  await page.evaluate(() => window.__W4F4_PROOF__.hold());
  const frameRaceBefore = await state(page);
  const chooserFrame = await activateFile(page, 'upload-image-inspector');
  await chooserFrame.setFiles(file);
  await page.getByRole('status').filter({ hasText: 'Enviando imagem…' }).waitFor();
  await page.waitForFunction((count) => window.__W4F4_PROOF__.state().uploadCount === count + 1, frameRaceBefore.uploadCount);
  const frameSequence = (await state(page)).localSequence;
  const xInput = page.locator('[data-inspector-field="x"]');
  await xInput.fill('35');
  await xInput.press('Enter');
  await waitSequence(page, frameSequence);
  const movedWhilePending = imageById(await state(page), firstId);
  assert.equal(movedWhilePending.frame.xMm, 35);
  await page.evaluate(() => window.__W4F4_PROOF__.release());
  await page.getByRole('status').filter({ hasText: 'Imagem substituída.' }).waitFor({ timeout: 30000 });
  const afterFrameRace = await state(page);
  assert.equal(imageById(afterFrameRace, firstId).frame.xMm, 35);
  assert.notEqual(imageById(afterFrameRace, firstId).assetId, imageById(frameRaceBefore, firstId).assetId);

  // Duplicate through actual UI preserves canonical Image relation/presentation.
  await selectObject(page, firstId);
  const beforeDuplicate = await state(page);
  const sourceBeforeDuplicate = imageById(beforeDuplicate, firstId);
  await page.locator('[data-editor-action="duplicate"]').click();
  await waitSequence(page, beforeDuplicate.localSequence);
  const duplicatedState = await state(page);
  const selectedDuplicateId = await page.locator('[data-editor-object-id][data-selected="true"]').getAttribute('data-editor-object-id');
  assert(selectedDuplicateId && selectedDuplicateId !== firstId);
  const duplicate = imageById(duplicatedState, selectedDuplicateId);
  assert.equal(duplicate.assetId, sourceBeforeDuplicate.assetId);
  assert.equal(duplicate.fit, sourceBeforeDuplicate.fit);
  assert.deepEqual(duplicate.focalPoint, sourceBeforeDuplicate.focalPoint);
  assert.deepEqual(duplicate.frame, sourceBeforeDuplicate.frame);
  assert.deepEqual(imageById(duplicatedState, firstId), sourceBeforeDuplicate);

  // Real Save -> another catalog/session -> reopen original.
  const savedState = await save(page);
  const savedDocument = savedState.saved;
  assert(savedDocument, 'Save did not persist W4.F.4 document');
  await page.getByRole('button', { name: 'Abrir outro catálogo', exact: true }).click();
  await page.waitForFunction((id) => window.__W4F4_PROOF__.state().catalogId === id, ids.otherId);
  await page.getByRole('button', { name: 'Reabrir catálogo original', exact: true }).click();
  await page.waitForFunction((id) => window.__W4F4_PROOF__.state().catalogId === id, ids.primaryId);
  await settle(page, 5);
  const reopened = await state(page);
  assert.deepEqual(reopened.document, savedDocument);
  assert.equal(reopened.canUndo, false);
  const reopenedDuplicate = imageById(reopened, selectedDuplicateId);
  assert.deepEqual(reopenedDuplicate, duplicate);

  // Canonical DocumentRenderer + Bridge-resolved publication and native A4 PDF.
  const beforePublicationDocument = JSON.stringify(reopened.document);
  await page.getByRole('button', { name: 'Publicar prova', exact: true }).click();
  const publishedImage = page.locator(
    `[data-publication] [data-object-id="${selectedDuplicateId}"] img[data-primitive-type="image"]`
  );
  await publishedImage.waitFor({ timeout: 30000 });
  const publication = await page.evaluate(() => window.__W4F4_PROOF__.publication());
  assert.deepEqual(publication.diagnostics.filter((diagnostic) => diagnostic.severity === 'ERROR'), []);
  const publicationFacts = await publishedImage.evaluate((node) => ({
    assetId: node.getAttribute('data-asset-id'),
    objectFit: getComputedStyle(node).objectFit,
    objectPosition: getComputedStyle(node).objectPosition,
    width: node.parentElement?.style.width,
    height: node.parentElement?.style.height,
  }));
  assert.equal(publicationFacts.assetId, reopenedDuplicate.assetId);
  assert.equal(publicationFacts.objectFit, reopenedDuplicate.fit);
  assert.equal(
    publicationFacts.objectPosition,
    `${reopenedDuplicate.focalPoint.x * 100}% ${reopenedDuplicate.focalPoint.y * 100}%`
  );
  assert.equal(
    await page.locator('[data-publication] [data-editor-action], [data-publication] input').count(),
    0
  );

  const pdfPath = resolve(output, 'w4f4-standalone-image.pdf');
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  assert.equal(JSON.stringify((await state(page)).document), beforePublicationDocument);
  const pdf = await getDocument({
    data: new Uint8Array(await readFile(pdfPath)),
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  assert.equal(pdf.numPages, 1);
  const pdfPage = await pdf.getPage(1);
  const pdfTextContent = await pdfPage.getTextContent();
  const pdfText = pdfTextContent.items.filter((item) => 'str' in item).map((item) => item.str).join(' ');
  const ops = await pdfPage.getOperatorList();
  assert(Math.abs((pdfPage.view[2] - pdfPage.view[0]) * 25.4 / 72 - 210) < 0.2);
  assert(Math.abs((pdfPage.view[3] - pdfPage.view[1]) * 25.4 / 72 - 297) < 0.2);
  assert(pdfText.includes('W4.F.4 Standalone Image Professional Authoring'));
  assert(ops.fnArray.some((op) =>
    [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat].includes(op)
  ));
  await pdf.destroy();

  const desktopEvidence = {
    baseline,
    finalImage: reopenedDuplicate,
    publication: publicationFacts,
    staleFocal: true,
    staleReplacement: true,
    frameConcurrency: true,
    duplicate: true,
    saveReopen: true,
    pdf: true,
  };

  // Touch/mobile substantive authoring at the required widths.
  const mobile = [];
  for (const width of [320, 360, 390]) {
    const mobileContext = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const mobilePage = await mobileContext.newPage();
    watch(mobilePage);
    await mobilePage.goto(editorUrl, { waitUntil: 'domcontentloaded' });
    await mobilePage.locator('[data-vnext-shell]').waitFor({ timeout: 30000 });
    const boot = await bootstrapImage(mobilePage);
    let mobileState = await state(mobilePage);

    const fitBefore = mobileState.localSequence;
    await mobilePage.locator('[data-image-fit]').selectOption('cover');
    await waitSequence(mobilePage, fitBefore);

    const mobilePad = mobilePage.locator('[data-image-focal-pad]');
    const mobilePadBox = await mobilePad.boundingBox();
    assert(mobilePadBox);
    const focalBefore = (await state(mobilePage)).localSequence;
    await mobilePad.tap({ position: { x: mobilePadBox.width * 0.8, y: mobilePadBox.height * 0.2 } });
    await waitSequence(mobilePage, focalBefore);

    mobileState = await pressFocal(mobilePage, 'x', 'End');
    assert.equal(imageById(mobileState, boot.firstId).focalPoint.x, 1);
    const centerBefore = mobileState.localSequence;
    await mobilePage.locator('[data-editor-action="center-image"]').tap();
    await waitSequence(mobilePage, centerBefore);

    mobileState = await state(mobilePage);
    await mobilePage.locator('[data-image-asset-choice]').selectOption(boot.alternateAssetId);
    const existingBefore = mobileState.localSequence;
    await mobilePage.locator('[data-editor-action="use-image-asset"]').tap();
    await waitSequence(mobilePage, existingBefore);

    const mobileUploadBefore = await state(mobilePage);
    await (await activateFile(mobilePage, 'upload-image-inspector')).setFiles(file);
    await mobilePage.getByRole('status').filter({ hasText: 'Imagem substituída.' }).waitFor({ timeout: 30000 });
    const mobileAfterUpload = await state(mobilePage);
    assert.equal(mobileAfterUpload.uploadCount, mobileUploadBefore.uploadCount + 1);

    await mobilePage.locator('[data-editor-action="undo"]').tap();
    await settle(mobilePage);
    assert((await state(mobilePage)).canRedo);
    await mobilePage.locator('[data-editor-action="redo"]').tap();
    await settle(mobilePage);
    const mobileSaved = await save(mobilePage);
    assert.equal(mobileSaved.dirty, false);

    const overflow = await assertNoGlobalOverflow(mobilePage, width);
    assert(await mobilePage.locator('[data-image-professional-authoring]').isVisible());
    assert(await mobilePage.locator('[data-image-focal-pad]').isVisible());
    mobile.push({
      width,
      overflow,
      fit: imageById(mobileSaved, boot.firstId).fit,
      focalPoint: imageById(mobileSaved, boot.firstId).focalPoint,
      assetId: imageById(mobileSaved, boot.firstId).assetId,
      upload: true,
      undoRedo: true,
      save: true,
    });
    await mobileContext.close();
  }

  assert.deepEqual(errors.consoleErrors, []);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.failedResources, []);
  assert.deepEqual(errors.requestFailures, []);

  const result = {
    status: 'PASS',
    browser: browser.version(),
    visible: !process.env.CI && !process.env.W4F4_PROOF_HEADLESS,
    controlledPersistence: true,
    productionSupabaseE2E: false,
    desktop: desktopEvidence,
    mobile,
    errors,
  };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(result, null, 2));
  console.log('W4.F.4 Standalone Image Professional Authoring Chromium proof: PASS');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
