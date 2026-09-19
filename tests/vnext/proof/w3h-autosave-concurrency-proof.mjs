import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w3h-autosave-concurrency-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W3H_PROOF_PORT ?? 5210);
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
const fixtureUrl = `http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w3h-autosave-browser.html`;
const productionUrl = `http://127.0.0.1:${port}/v2?catalog=33333333-3333-4333-8333-333333333333`;
const editorObject = (page) => page.locator('[data-editor-object-id="text-target"]');
const textarea = (page) => page.locator('[data-text-edit-textarea]');
const saveState = (page) => page.locator('[data-save-state]');

async function state(page) {
  return page.evaluate(() => window.__W3H_PROOF__.state());
}

async function openTextEditor(page) {
  await editorObject(page).click();
  await editorObject(page).press('Enter');
  await textarea(page).waitFor();
}

async function fillDraft(page, value) {
  await openTextEditor(page);
  await textarea(page).fill(value);
}

async function commitDraft(page) {
  await page.locator('[data-editor-action="commit-text"]').click();
  await textarea(page).waitFor({ state: 'detached' });
}

async function editAndCommitForAutosave(page, value) {
  await fillDraft(page, value);
  await commitDraft(page);
}

async function waitSaved(page, expectedText) {
  await page.waitForFunction((text) => {
    const current = window.__W3H_PROOF__.state();
    return current.saveLabel === 'Saved'
      && current.dirty === false
      && current.authoritativeSource?.text === text;
  }, expectedText);
}

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  for (const [label, page] of [['A', pageA], ['B', pageB]]) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => pageErrors.push(`${label}: ${error.message}`));
  }

  await pageA.goto(fixtureUrl, { waitUntil: 'networkidle' });
  await pageA.locator('[data-vnext-shell]').waitFor();
  await pageB.goto(fixtureUrl, { waitUntil: 'networkidle' });
  await pageB.locator('[data-vnext-shell]').waitFor();

  const openedA = await state(pageA);
  const openedB = await state(pageB);
  assert.equal(openedA.binding.remoteRevision, 1);
  assert.equal(openedB.binding.remoteRevision, 1);
  assert.notEqual(openedA.openSessionId, openedB.openSessionId);
  assert.equal(openedA.autosaveEnabled, true);
  assert.equal(openedB.autosaveEnabled, true);
  assert.equal((await saveState(pageA).textContent())?.trim(), 'Saved');
  assert.equal((await saveState(pageB).textContent())?.trim(), 'Saved');

  // Active Father text-edit must survive beyond debounce without dispatching remote Save.
  await editAndCommitForAutosave(pageA, 'A canonical dirty');
  await fillDraft(pageA, 'A autosave one');
  const activeDraftBeforeDebounce = await state(pageA);
  assert.equal(activeDraftBeforeDebounce.dirty, true);
  assert.equal(activeDraftBeforeDebounce.text, 'A canonical dirty');
  assert.equal(activeDraftBeforeDebounce.saveDispatchCount, 0);
  await pageA.waitForTimeout(450);
  const activeDraftAfterDebounce = await state(pageA);
  assert.equal(await textarea(pageA).inputValue(), 'A autosave one');
  assert.equal(activeDraftAfterDebounce.text, 'A canonical dirty');
  assert.equal(activeDraftAfterDebounce.authoritativeSource.text, 'Persisted N');
  assert.equal(activeDraftAfterDebounce.dirty, true);
  assert.equal(activeDraftAfterDebounce.saveDispatchCount, 0);

  // Father explicitly finishes the draft; only now autosave may dispatch.
  await pageA.evaluate(() => window.__W3H_PROOF__.holdNextSave());
  await commitDraft(pageA);
  await pageA.waitForFunction(() => {
    const current = window.__W3H_PROOF__.state();
    return current.savePhase === 'saving' && current.heldText === 'A autosave one';
  });
  assert.equal((await saveState(pageA).textContent())?.trim(), 'Saving…');
  const firstSaving = await state(pageA);
  assert.equal(firstSaving.saveDispatchCount, 1);
  await pageA.evaluate(() => window.__W3H_PROOF__.releaseHeldSave());
  await waitSaved(pageA, 'A autosave one');
  const firstSaved = await state(pageA);
  assert.equal(firstSaved.authoritativeSource.remoteRevision, 2);

  // L1/S1/L2: S1 is held, L2 is authored, then the older ACK lands.
  await pageA.evaluate(() => window.__W3H_PROOF__.holdNextSave());
  await editAndCommitForAutosave(pageA, 'A S1');
  await pageA.waitForFunction(() => {
    const current = window.__W3H_PROOF__.state();
    return current.savePhase === 'saving' && current.heldText === 'A S1';
  });
  await editAndCommitForAutosave(pageA, 'A S2 newer');
  await pageA.evaluate(() => window.__W3H_PROOF__.releaseHeldSave());
  await pageA.waitForFunction(() => {
    const current = window.__W3H_PROOF__.state();
    return current.binding.remoteRevision === 3 && current.dirty === true;
  });
  const afterOlderAck = await state(pageA);
  assert.equal(afterOlderAck.authoritativeSource.text, 'A S1');
  assert.equal(afterOlderAck.authoritativeSource.remoteRevision, 3);
  assert.equal(afterOlderAck.text, 'A S2 newer');
  assert.notEqual(afterOlderAck.saveLabel, 'Saved');
  await waitSaved(pageA, 'A S2 newer');
  const afterFollowUp = await state(pageA);
  assert.equal(afterFollowUp.authoritativeSource.remoteRevision, 4);
  assert.equal(afterFollowUp.saveDispatchCount, 3);

  // Tab B still owns the independent revision-N binding. Its autosave now loses strict CAS.
  await editAndCommitForAutosave(pageB, 'B stale local');
  await pageB.waitForFunction(() => window.__W3H_PROOF__.state().savePhase === 'conflict');
  const conflictB = await state(pageB);
  assert.equal(conflictB.binding.remoteRevision, 1);
  assert.equal(conflictB.dirty, true);
  assert.equal(conflictB.text, 'B stale local');
  assert.equal(conflictB.saveLabel, 'Conflict');
  assert.equal(conflictB.authoritativeSource.text, 'A S2 newer');
  const conflictActions = pageB.locator('[data-persistence-conflict-actions]');
  await conflictActions.waitFor();
  await conflictActions.getByRole('button', { name: 'Abrir versão mais recente', exact: true }).waitFor();
  await conflictActions.getByRole('button', { name: 'Salvar meu trabalho como cópia', exact: true }).waitFor();
  assert.equal(await conflictActions.getByRole('button').count(), 2);
  const dispatchesAtConflict = conflictB.saveDispatchCount;
  await pageB.waitForTimeout(250);
  assert.equal((await state(pageB)).saveDispatchCount, dispatchesAtConflict);

  // Father choice 1: Open latest installs a fresh clean session at remote revision 4.
  const conflictedOpenSession = conflictB.openSessionId;
  await conflictActions.getByRole('button', { name: 'Abrir versão mais recente', exact: true }).click();
  await pageB.waitForFunction((previous) => {
    const current = window.__W3H_PROOF__.state();
    return current.openSessionId !== previous
      && current.saveLabel === 'Saved'
      && current.text === 'A S2 newer';
  }, conflictedOpenSession);
  const openedLatest = await state(pageB);
  assert.equal(openedLatest.binding.remoteRevision, 4);
  assert.equal(openedLatest.canUndo, false);
  assert.equal(openedLatest.canRedo, false);
  assert.equal(openedLatest.localSequence, 0);

  // Advance A once more, then conflict B again from its now-current revision 4.
  await editAndCommitForAutosave(pageA, 'A authoritative final');
  await waitSaved(pageA, 'A authoritative final');
  const authoritativeFinal = await state(pageA);
  assert.equal(authoritativeFinal.authoritativeSource.remoteRevision, 5);

  await editAndCommitForAutosave(pageB, 'B copy work');
  await pageB.waitForFunction(() => window.__W3H_PROOF__.state().savePhase === 'conflict');
  const copyConflict = await state(pageB);
  assert.equal(copyConflict.binding.remoteRevision, 4);
  assert.equal(copyConflict.text, 'B copy work');
  assert.equal(copyConflict.authoritativeSource.text, 'A authoritative final');
  const sourceBeforeCopy = await pageB.evaluate(() =>
    window.__W3H_PROOF__.authoritative(window.__W3H_PROOF__.SOURCE_ID)
  );
  assert(sourceBeforeCopy);

  // Father choice 2: while Save-as-copy is in flight, both conflict choices are disabled.
  const conflictActionsAgain = pageB.locator('[data-persistence-conflict-actions]');
  await pageB.evaluate(() => window.__W3H_PROOF__.holdNextCopyCreate());
  await conflictActionsAgain.getByRole('button', { name: 'Salvar meu trabalho como cópia', exact: true }).click();
  await pageB.waitForFunction(() => {
    const current = window.__W3H_PROOF__.state();
    return current.conflictResolutionState === 'resolving-save-as-copy'
      && current.createDispatchCount === 1;
  });
  const conflictResolutionBusy = await state(pageB);
  const busyButtons = conflictActionsAgain.getByRole('button');
  assert.equal(await busyButtons.count(), 2);
  assert.equal(await busyButtons.nth(0).isDisabled(), true);
  assert.equal(await busyButtons.nth(1).isDisabled(), true);
  await conflictActionsAgain.getByRole('button', { name: 'Salvando cópia…', exact: true }).waitFor();
  await conflictActionsAgain.getByRole('button', { name: 'Abrir versão mais recente', exact: true }).waitFor();
  await pageB.waitForTimeout(100);
  assert.equal((await state(pageB)).createDispatchCount, 1);
  await pageB.evaluate(() => window.__W3H_PROOF__.releaseHeldCreate());
  await pageB.waitForFunction(() => {
    const current = window.__W3H_PROOF__.state();
    return current.catalogId !== window.__W3H_PROOF__.SOURCE_ID
      && current.saveLabel === 'Saved'
      && current.dirty === false;
  });
  const copyOpened = await state(pageB);
  assert.notEqual(copyOpened.catalogId, copyConflict.catalogId);
  assert.notEqual(copyOpened.openSessionId, copyConflict.openSessionId);
  assert.equal(copyOpened.canUndo, false);
  assert.equal(copyOpened.canRedo, false);
  assert.equal(copyOpened.localSequence, 0);
  assert.equal(copyOpened.catalogIds.length, 2);
  const copyAuthoritative = await pageB.evaluate((catalogId) =>
    window.__W3H_PROOF__.authoritative(catalogId), copyOpened.catalogId
  );
  assert(copyAuthoritative);
  assert.equal(copyAuthoritative.remoteRevision, 1);
  assert.equal(copyAuthoritative.text, 'B copy work');
  const sourceAfterCopy = await pageB.evaluate(() =>
    window.__W3H_PROOF__.authoritative(window.__W3H_PROOF__.SOURCE_ID)
  );
  assert.deepEqual(sourceAfterCopy, sourceBeforeCopy);

  await pageA.screenshot({ path: resolve(output, 'tab-a-autosave.png'), fullPage: true });
  await pageB.screenshot({ path: resolve(output, 'tab-b-copy.png'), fullPage: true });

  // Production bootstrap wiring smoke: real /v2 route loads the VNext bootstrap, and source wiring
  // explicitly enables autosave + the disposable online-retry bridge. No cloud multi-tab claim is made.
  const bootstrapSource = await readFile(resolve(root, 'src/vnext/app/bootstrap.tsx'), 'utf8');
  assert.match(bootstrapSource, /autosave:\s*\{\}/);
  assert.match(bootstrapSource, /attachPersistenceOnlineRetry\(runtime\)/);
  assert.match(bootstrapSource, /pagehide/);
  const productionPage = await context.newPage();
  const productionRequests = [];
  productionPage.on('request', (request) => productionRequests.push(request.url()));
  await productionPage.goto(productionUrl, { waitUntil: 'networkidle' });
  assert.equal(productionRequests.some((url) => url.includes('/src/vnext/app/bootstrap')), true);
  assert.equal(productionRequests.some((url) => url.includes('/src/legacy-main')), false);
  await productionPage.close();

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  const evidence = {
    chromiumVersion: browser.version(),
    controlledFatherFlow: {
      openedA,
      openedB,
      firstSaving,
      firstSaved,
      activeDraftBeforeDebounce,
      activeDraftAfterDebounce,
      afterOlderAck,
      afterFollowUp,
      conflictB,
      openedLatest,
      authoritativeFinal,
      copyConflict,
      conflictResolutionBusy,
      copyOpened,
      copyAuthoritative,
      sourceBeforeCopy,
      sourceAfterCopy,
      strictCasConflictGeneratedByRepository: true,
      noAutomaticRetryAfterConflict: true,
      activeTextEditNotInterruptedByAutosave: true,
      conflictChoicesMutuallyExclusiveWhileResolving: true,
    },
    productionBootstrapSmoke: {
      route: '/v2?catalog=<controlled-id>',
      vnextBootstrapLoaded: true,
      legacyBootstrapLoaded: false,
      autosaveOptInPresent: true,
      disposableOnlineRetryPresent: true,
      cloudMultiTabClaim: false,
    },
    consoleErrors,
    pageErrors,
  };
  await writeFile(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log('W3.H controlled Father-flow autosave + strict-CAS concurrency Chromium proof: PASS');
  console.log('W3.H production bootstrap wiring smoke: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
