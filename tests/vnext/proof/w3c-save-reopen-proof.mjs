import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w3c-save-reopen-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W3C_PROOF_PORT ?? 5203);
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

const editorObject = (page) => page.locator('[data-editor-object-id="text-target"]');
const textarea = (page) => page.locator('[data-text-edit-textarea]');
const saveState = (page) => page.locator('[data-save-state]');
const saveButton = (page) => page.locator('[data-editor-action="save"]');

async function proofState(page) {
  return page.evaluate(() => window.__W3C_PROOF__.state());
}

async function openTextEditor(page) {
  const hit = editorObject(page);
  await hit.click();
  await hit.press('Enter');
  await textarea(page).waitFor();
}

async function acknowledgeNext(page) {
  await page.evaluate(() => window.__W3C_PROOF__.acknowledgeNext());
}

async function canonicalText(page) {
  return page.locator('[data-editorial-root] [data-object-id="text-target"]').innerText();
}

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(
    `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w3c-browser.html`,
    { waitUntil: 'networkidle' }
  );
  await page.locator('[data-vnext-shell]').waitFor();
  assert.equal((await saveState(page).textContent())?.trim(), 'Saved');

  const initial = await proofState(page);
  assert.equal(initial.catalogId, '11111111-1111-4111-8111-111111111111');
  assert.equal(initial.text, 'A persisted');
  assert.equal(initial.canUndo, false);
  assert.equal(initial.canRedo, false);

  // Valid visible Text draft crosses the authoring barrier before snapshot capture.
  await openTextEditor(page);
  await textarea(page).fill('A save one');
  assert.equal((await saveState(page).textContent())?.trim(), 'Unsaved changes');
  await saveButton(page).click();
  await textarea(page).waitFor({ state: 'detached' });
  await page.waitForFunction(() => window.__W3C_PROOF__.state().pendingSaves === 1);
  let saving = await proofState(page);
  assert.equal(saving.saveLabel, 'Saving…');
  assert.equal(saving.pendingText, 'A save one');
  assert.equal(saving.text, 'A save one');

  // New visible work while S1 is in flight must survive ACK S1 and remain dirty.
  await openTextEditor(page);
  await textarea(page).fill('A local two');
  saving = await proofState(page);
  assert.equal(saving.pendingSaves, 1);
  assert.equal(saving.dirty, true);
  await acknowledgeNext(page);
  await page.waitForFunction(() => window.__W3C_PROOF__.state().saveLabel === 'Unsaved changes');
  const afterOldAck = await proofState(page);
  assert.equal(afterOldAck.text, 'A save one');
  assert.equal(await textarea(page).inputValue(), 'A local two');
  assert.equal(afterOldAck.dirty, true);
  assert.equal(afterOldAck.binding.remoteRevision, 2);

  // Save the newer draft and prove Saved only after the authoritative ACK.
  await saveButton(page).click();
  await page.waitForFunction(() => window.__W3C_PROOF__.state().pendingSaves === 1);
  assert.equal((await saveState(page).textContent())?.trim(), 'Saving…');
  const secondFlight = await proofState(page);
  assert.equal(secondFlight.pendingText, 'A local two');
  await acknowledgeNext(page);
  await page.waitForFunction(() => window.__W3C_PROOF__.state().saveLabel === 'Saved');
  const savedTwo = await proofState(page);
  assert.equal(savedTwo.text, 'A local two');
  assert.equal(savedTwo.dirty, false);
  assert.equal(savedTwo.binding.remoteRevision, 3);
  const authoritativeA = await page.evaluate(() =>
    window.__W3C_PROOF__.authoritative(window.__W3C_PROOF__.A_ID)
  );
  assert.equal(authoritativeA.text, 'A local two');
  assert.equal(authoritativeA.remoteRevision, 3);

  // Exact canonical reopen must install a fresh session/history and restore saved content.
  const beforeReopenOpenSession = savedTwo.openSessionId;
  const reopenedA = await page.evaluate(() =>
    window.__W3C_PROOF__.open(window.__W3C_PROOF__.A_ID)
  );
  assert.equal(reopenedA.ok, true);
  await page.waitForFunction((previous) =>
    window.__W3C_PROOF__.state().openSessionId !== previous,
  beforeReopenOpenSession);
  const afterReopen = await proofState(page);
  assert.equal(afterReopen.text, 'A local two');
  assert.equal(afterReopen.canUndo, false);
  assert.equal(afterReopen.canRedo, false);
  assert.equal(afterReopen.localSequence, 0);
  assert.equal(afterReopen.dirty, false);
  assert.equal(await canonicalText(page), 'A local two');

  // The reopened session accepts new edits and has its own fresh history.
  await openTextEditor(page);
  await textarea(page).fill('A after reopen');
  await page.locator('[data-editor-action="commit-text"]').click();
  await textarea(page).waitFor({ state: 'detached' });
  let afterReopenEdit = await proofState(page);
  assert.equal(afterReopenEdit.text, 'A after reopen');
  assert.equal(afterReopenEdit.canUndo, true);
  assert.equal(afterReopenEdit.dirty, true);

  // Return to the acknowledged state, then prove composing draft blocks Save without dispatch.
  await page.locator('[data-editor-action="undo"]').click();
  await page.waitForFunction(() => window.__W3C_PROOF__.state().text === 'A local two');
  assert.equal((await proofState(page)).dirty, false);
  await openTextEditor(page);
  await textarea(page).fill('まだ入力中');
  await textarea(page).dispatchEvent('compositionstart');
  await saveButton(page).click();
  await page.waitForTimeout(50);
  const blocked = await proofState(page);
  assert.equal(blocked.pendingSaves, 0);
  assert.equal(blocked.saveLabel, 'Unsaved changes');
  assert.equal(await textarea(page).inputValue(), 'まだ入力中');
  await textarea(page).dispatchEvent('compositionend');
  await page.locator('[data-editor-action="cancel-text"]').click();
  await textarea(page).waitFor({ state: 'detached' });

  // Dirty route/open transition must be guarded.
  await openTextEditor(page);
  await textarea(page).fill('A guarded draft');
  const guardedOpen = await page.evaluate(() =>
    window.__W3C_PROOF__.open(window.__W3C_PROOF__.B_ID)
  );
  assert.equal(guardedOpen.ok, false);
  assert.equal(guardedOpen.error.code, 'UNSAVED_CHANGES');
  assert.equal((await proofState(page)).catalogId, '11111111-1111-4111-8111-111111111111');
  assert.equal(await textarea(page).inputValue(), 'A guarded draft');
  await page.locator('[data-editor-action="cancel-text"]').click();
  await textarea(page).waitFor({ state: 'detached' });

  // Delayed Save A followed by explicit discard/open B: late ACK A must be inert for active B.
  await openTextEditor(page);
  await textarea(page).fill('A pending during switch');
  await saveButton(page).click();
  await page.waitForFunction(() => window.__W3C_PROOF__.state().pendingSaves === 1);
  const openB = await page.evaluate(() =>
    window.__W3C_PROOF__.open(window.__W3C_PROOF__.B_ID, true)
  );
  assert.equal(openB.ok, true);
  await page.waitForFunction(() =>
    window.__W3C_PROOF__.state().catalogId === window.__W3C_PROOF__.B_ID
  );
  const beforeLateAckB = await proofState(page);
  assert.equal(beforeLateAckB.text, 'B persisted');
  assert.equal(beforeLateAckB.canUndo, false);
  await acknowledgeNext(page);
  await page.waitForTimeout(80);
  const afterLateAckB = await proofState(page);
  assert.equal(afterLateAckB.catalogId, '22222222-2222-4222-8222-222222222222');
  assert.equal(afterLateAckB.text, 'B persisted');
  assert.equal(afterLateAckB.binding.remoteRevision, 5);
  assert.equal(afterLateAckB.saveLabel, 'Saved');
  assert.equal(afterLateAckB.dirty, false);
  const authoritativeAfterLateA = await page.evaluate(() =>
    window.__W3C_PROOF__.authoritative(window.__W3C_PROOF__.A_ID)
  );
  assert.equal(authoritativeAfterLateA.text, 'A pending during switch');
  assert.equal(authoritativeAfterLateA.remoteRevision, 4);

  await page.screenshot({ path: resolve(output, 'w3c-save-reopen.png'), fullPage: true });
  const evidence = {
    chromiumVersion: browser.version(),
    initial,
    afterOldAck,
    savedTwo,
    afterReopen,
    afterReopenEdit,
    blocked,
    guardedOpen,
    beforeLateAckB,
    afterLateAckB,
    authoritativeA,
    authoritativeAfterLateA,
    consoleErrors,
    pageErrors,
  };
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log('W3.C manual Save + canonical Reopen Chromium proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
