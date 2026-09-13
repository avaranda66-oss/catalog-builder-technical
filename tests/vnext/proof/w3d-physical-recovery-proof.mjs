import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createWriteStream, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w3d-physical-recovery-proof');
await mkdir(output, { recursive: true });
const serverPort = Number(process.env.W3D_PHYSICAL_PROOF_PORT ?? 5205);
const debugPortBase = Number(process.env.W3D_CHROMIUM_DEBUG_PORT ?? 9335);
const fixtureUrl = `http://127.0.0.1:${serverPort}/tests/vnext/proof/fixtures/w3d-browser.html`;
const blankUrl = `http://127.0.0.1:${serverPort}/tests/vnext/proof/fixtures/w3d-indexeddb.html`;
const databaseName = 'catalog_builder_vnext_recovery_physical_proof';
const requestedScenario = (process.env.W3D_PHYSICAL_PROOF_SCENARIO ?? 'ALL').toUpperCase();
const durableEvidencePath = process.env.W3D_PHYSICAL_PROOF_EVIDENCE_PATH
  ? resolve(root, process.env.W3D_PHYSICAL_PROOF_EVIDENCE_PATH)
  : undefined;
const execFileAsync = promisify(execFile);
const testedImplementationHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
const testedImplementationTree = (await execFileAsync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root })).stdout.trim();
const profilePaths = [];
const spawnedProcesses = new Set();
let debugOffset = 0;
let proofPassed = false;

const server = await createServer({
  root,
  server: {
    host: '127.0.0.1',
    port: serverPort,
    strictPort: true,
    fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] },
  },
  logLevel: 'error',
});

function waitForExit(process) {
  if (process.exitCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => process.once('exit', resolveExit));
}

async function launchProfile(profilePath) {
  const debugPort = debugPortBase + debugOffset++;
  const process = spawn(chromium.executablePath(), [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  spawnedProcesses.add(process);
  const browserLog = createWriteStream(resolve(profilePath, 'proof-chromium.log'), { flags: 'a' });
  process.stderr.pipe(browserLog);
  process.once('exit', () => browserLog.end());
  const endpoint = `http://127.0.0.1:${debugPort}/json/version`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (process.exitCode !== null) throw new Error(`Chromium exited early with ${process.exitCode}`);
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Readiness polling only; elapsed time is never a proof oracle.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  if (!ready) throw new Error('Chromium debugging endpoint did not become ready');
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context = browser.contexts()[0];
  if (!context) throw new Error('Persistent Chromium context unavailable');
  return { process, browser, context, profilePath };
}

async function waitForProfileRelease(profilePath) {
  const lockfile = resolve(profilePath, 'lockfile');
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const handle = await open(lockfile, 'r+');
      await handle.close();
      return;
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      if (error?.code !== 'EBUSY' && error?.code !== 'EPERM' && error?.code !== 'EACCES') {
        throw error;
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Spawned Chromium profile remained locked after bounded release wait: ${profilePath}`);
}

async function hardCrash(run) {
  const exited = waitForExit(run.process);
  assert.equal(run.process.kill('SIGKILL'), true, 'Spawned Chromium process must accept hard termination');
  await exited;
  spawnedProcesses.delete(run.process);
  await waitForProfileRelease(run.profilePath);
}

async function closeRun(run) {
  if (run.process.exitCode !== null) return;
  try {
    await run.browser.close();
  } catch {
    // Assertion cleanup may observe an already disconnected browser.
  }
  if (run.process.exitCode === null) {
    const exited = waitForExit(run.process);
    run.process.kill('SIGKILL');
    await exited;
  }
  spawnedProcesses.delete(run.process);
  await waitForProfileRelease(run.profilePath);
}

async function newProfile(label) {
  const path = await mkdtemp(resolve(output, `${label}-profile-`));
  profilePaths.push(path);
  return path;
}

async function pageFor(run, remote = 'base', scope = 'physical:user-a') {
  const page = run.context.pages()[0] ?? await run.context.newPage();
  await page.goto(`${fixtureUrl}?remote=${encodeURIComponent(remote)}&scope=${encodeURIComponent(scope)}`);
  await page.waitForFunction(() => window.__W3D_PROOF__?.ready === true);
  return page;
}

async function clearDatabase(run) {
  const page = run.context.pages()[0] ?? await run.context.newPage();
  await page.goto(blankUrl);
  await page.evaluate(async (name) => {
    await new Promise((resolveDelete, rejectDelete) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolveDelete(undefined);
      request.onerror = () => rejectDelete(request.error);
      request.onblocked = () => rejectDelete(new Error('Recovery database deletion blocked'));
    });
  }, databaseName);
}

async function api(page, method, ...args) {
  return page.evaluate(
    ({ methodName, methodArgs }) => window.__W3D_PROOF__[methodName](...methodArgs),
    { methodName: method, methodArgs: args }
  );
}

async function committedRecordsFromFreshConnection(page, scope = 'physical:user-a') {
  return page.evaluate(async ({ databaseName, scope }) => {
    const adapter = await import('/src/vnext/recovery/indexeddb-repository.ts');
    const application = await import('/src/vnext/application/index.ts');
    const fresh = new adapter.IndexedDbRecoveryRepository({ databaseName });
    const records = await fresh.listByScope(scope);
    await fresh.close();
    return records.map((inspection) => {
      if (inspection.status !== 'VALID') return inspection;
      const object = inspection.record.documentSnapshot.pages[0]?.objects[0];
      return {
        ...inspection,
        canonicalText: object?.type === 'text'
          ? application.projectEditableRichText(object.text)
          : null,
      };
    });
  }, { databaseName, scope });
}

async function createPendingCrash(profile, title) {
  const run = await launchProfile(profile);
  await clearDatabase(run);
  const page = await pageFor(run, 'hang');
  await api(page, 'editTitle', title);
  await api(page, 'startSave');
  await page.waitForFunction(() => window.__W3D_PROOF__.snapshot().lastSaveRequest !== undefined);
  const [inspection] = await api(page, 'list');
  assert.equal(inspection.status, 'VALID');
  assert.equal(inspection.record.pendingRemoteMutation.attemptedDocumentSnapshot.title, title);
  const pending = inspection.record.pendingRemoteMutation;
  await hardCrash(run);
  return pending;
}

const evidence = {
  testedImplementationHead,
  testedImplementationTree,
  chromiumVersion: undefined,
  hardTermination: 'Chromium OS process terminated without page, context, or browser close',
  profileReuse: true,
  proofs: {},
};

async function runD() {
  const committedProfile = await newProfile('pending-committed');
  const committedPending = await createPendingCrash(committedProfile, 'Pending committed remotely');
  let run = await launchProfile(committedProfile);
  let page = await pageFor(run, 'committed');
  await page.getByRole('dialog', { name: 'Recuperação local' }).waitFor();
  assert.equal(await page.locator('[data-save-state]').textContent(), 'Could not verify save');
  await page.getByRole('button', { name: 'Verificar gravação pendente' }).click();
  await page.getByRole('dialog', { name: 'Recuperação local' }).waitFor({ state: 'detached' });
  const committedAfterRestart = await api(page, 'snapshot');
  assert.equal(committedAfterRestart.document.title, 'Pending committed remotely');
  assert.equal(committedAfterRestart.lastSaveRequest, undefined);
  assert.equal((await api(page, 'list')).length, 0);
  evidence.proofs.D = {
    mutationId: committedPending.mutationId,
    noFalseSavedBeforeVerification: true,
    authoritativeProofWithoutReplay: true,
  };
  await closeRun(run);
}

async function runE() {
  const replayProfile = await newProfile('pending-replay');
  const replayPending = await createPendingCrash(replayProfile, 'Pending exact replay');
  let run = await launchProfile(replayProfile);
  let page = await pageFor(run, 'replay');
  await page.getByRole('button', { name: 'Verificar gravação pendente' }).click();
  await page.getByRole('dialog', { name: 'Recuperação local' }).waitFor({ state: 'detached' });
  const replaySnapshot = await api(page, 'snapshot');
  assert.equal(replaySnapshot.lastSaveRequest.mutationId, replayPending.mutationId);
  assert.deepEqual(replaySnapshot.lastSaveRequest.documentSnapshot, replayPending.attemptedDocumentSnapshot);
  assert.equal((await api(page, 'list')).length, 0);
  evidence.proofs.E = {
    originalMutationId: replayPending.mutationId,
    replayMutationId: replaySnapshot.lastSaveRequest.mutationId,
    exactPayload: true,
  };
  await closeRun(run);

  const divergentProfile = await newProfile('pending-divergent');
  await createPendingCrash(divergentProfile, 'Pending divergent');
  run = await launchProfile(divergentProfile);
  page = await pageFor(run, 'mismatch');
  await page.getByRole('dialog', { name: 'Recuperação local' }).waitFor();
  await page.getByRole('button', { name: 'Verificar gravação pendente' }).click();
  assert.equal((await api(page, 'snapshot')).lastSaveRequest, undefined);
  assert.equal((await api(page, 'list')).length, 1);
  assert.equal(await page.getByRole('button', { name: 'Recuperar minhas alterações' }).count(), 0);
  evidence.proofs.E.divergentRemotePreservedWithoutReplay = true;
  await closeRun(run);
}

async function runF() {
  const tabProfile = await newProfile('two-tabs');
  let run = await launchProfile(tabProfile);
  await clearDatabase(run);
  const tabOne = await pageFor(run, 'base');
  const tabTwo = await run.context.newPage();
  await tabTwo.goto(`${fixtureUrl}?remote=base&scope=physical%3Auser-a`);
  await tabTwo.waitForFunction(() => window.__W3D_PROOF__?.ready === true);
  await api(tabOne, 'editTitle', 'Tab one work');
  await api(tabTwo, 'editTitle', 'Tab two work');
  await api(tabOne, 'flushRecovery');
  await api(tabTwo, 'flushRecovery');
  const tabRecords = await api(tabOne, 'list');
  assert.equal(tabRecords.length, 2);
  const tabIds = new Set(tabRecords.map((entry) => entry.record.openSessionId));
  assert.equal(tabIds.size, 2);
  assert.deepEqual(
    new Set(tabRecords.map((entry) => entry.record.documentSnapshot.title)),
    new Set(['Tab one work', 'Tab two work'])
  );
  evidence.proofs.F = { recordCount: tabRecords.length, distinctOpenSessionIds: tabIds.size };
  await closeRun(run);
}

async function runG() {
  const authProfile = await newProfile('auth-scope');
  const run = await launchProfile(authProfile);
  await clearDatabase(run);
  const page = await pageFor(run, 'base', 'physical:user-a');
  await api(page, 'editTitle', 'User A protected work');
  await api(page, 'flushRecovery');
  const [candidateA] = await api(page, 'discover', 'physical:user-a');
  assert(candidateA);
  await api(page, 'updateAuth', 'physical:user-b');
  assert.equal((await api(page, 'discover', 'physical:user-a')).length, 0);
  assert.equal((await api(page, 'discover', 'physical:user-b')).length, 0);
  assert.deepEqual(
    await api(page, 'attemptForeign', candidateA, 'physical:user-a'),
    { inspectDenied: true, discardDenied: true, recoverDenied: true }
  );
  assert.equal((await api(page, 'list', 'physical:user-a')).length, 1);
  await api(page, 'updateAuth', 'physical:user-a');
  const returnedA = await api(page, 'discover', 'physical:user-a');
  assert.equal(returnedA.length, 1);
  assert.equal(returnedA[0].inspection.record.documentSnapshot.title, 'User A protected work');
  evidence.proofs.G = {
    bEnumeratedA: 0,
    bEnumeratedOwn: 0,
    bInspectDenied: true,
    bDiscardDenied: true,
    bRecoverDenied: true,
    aReturnedRecords: returnedA.length,
  };
  await closeRun(run);
}

async function runH() {
  const profile = await newProfile('fail-closed');
  let run = await launchProfile(profile);
  await clearDatabase(run);
  let page = await pageFor(run, 'base');
  await api(page, 'editTitle', 'Local protected H');
  await api(page, 'flushRecovery');
  await hardCrash(run);

  run = await launchProfile(profile);
  page = await pageFor(run, 'mismatch');
  await page.getByRole('dialog', { name: 'Recuperação local' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Recuperar minhas alterações' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Ver alterações recuperadas' }).count(), 1);
  assert.equal((await api(page, 'snapshot')).document.title, 'Unexpected same revision');
  await hardCrash(run);

  run = await launchProfile(profile);
  page = await pageFor(run, 'newer');
  await page.getByRole('dialog', { name: 'Recuperação local' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Recuperar minhas alterações' }).count(), 0);
  const newer = await api(page, 'snapshot');
  assert.equal(newer.document.title, 'Newer remote');
  assert.equal(newer.remoteRevision, 2);
  await hardCrash(run);

  run = await launchProfile(profile);
  page = await pageFor(run, 'unavailable');
  await page.getByRole('dialog', { name: 'Recuperação local' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Recuperar minhas alterações' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Abrir versão salva na nuvem' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Ver alterações recuperadas' }).count(), 1);
  const unavailable = await api(page, 'snapshot');
  assert.equal(unavailable.bindingKind, 'UNBOUND');
  assert.equal((await api(page, 'list')).length, 1);
  await page.getByRole('button', { name: 'Ver alterações recuperadas' }).click();
  assert.equal(
    await page.locator('[data-protected-recovery-inspection] [data-editorial-root]').count(),
    1
  );
  await page.screenshot({ path: resolve(output, 'H-fail-closed.png'), fullPage: true });
  evidence.proofs.H = {
    sameRevisionMismatchInstalled: false,
    newerRemoteOverwritten: false,
    remoteUnavailableBindingKind: unavailable.bindingKind,
    protectedCanonicalInspection: true,
  };
  await closeRun(run);
}

async function seedStartupRaceProfile(label, title) {
  const profile = await newProfile(label);
  const run = await launchProfile(profile);
  await clearDatabase(run);
  const page = await pageFor(run, 'base');
  await page.locator('[data-editor-action="add-shape"]').waitFor();
  const original = await api(page, 'snapshot');
  await api(page, 'editTitle', title);
  await api(page, 'flushRecovery');
  const records = await committedRecordsFromFreshConnection(page);
  const committed = records.find(
    (entry) => entry.status === 'VALID' && entry.record.openSessionId === original.openSessionId
  );
  assert(committed, 'Startup-race seed must be durably committed before restart');
  assert.equal(committed.record.documentSnapshot.title, title);
  await hardCrash(run);
  return { profile, original, committed };
}

async function runI() {
  const safe = await seedStartupRaceProfile('startup-race-safe', 'Startup race recovered work');
  let run = await launchProfile(safe.profile);
  let page = await pageFor(run, 'delayed-discovery');
  await page.locator('[data-recovery-startup-state="pending"]').waitFor();
  assert.equal(await page.locator('[data-editor-action="add-shape"]').count(), 0);
  assert.equal(await page.getByText('Verificando alterações locais…').count(), 1);

  await api(page, 'resolveDiscovery');
  await page.getByRole('dialog', { name: 'Recuperação local' }).waitFor();
  assert.equal(await page.locator('[data-editor-action="add-shape"]').count(), 0);
  await page.getByRole('button', { name: 'Recuperar minhas alterações' }).click();
  await page.locator('[data-editor-action="add-shape"]').waitFor();
  const recovered = await api(page, 'snapshot');
  assert.equal(recovered.document.title, 'Startup race recovered work');
  assert.notEqual(recovered.openSessionId, safe.original.openSessionId);
  assert.equal(recovered.canUndo, false);
  assert.equal(recovered.canRedo, false);
  await page.locator('[data-editor-action="add-shape"]').click();
  assert.equal((await api(page, 'snapshot')).document.pages[0].objects.length, 2);
  await closeRun(run);

  const adversarial = await seedStartupRaceProfile(
    'startup-race-adversarial',
    'Old recovery must remain'
  );
  run = await launchProfile(adversarial.profile);
  page = await pageFor(run, 'delayed-discovery');
  await page.locator('[data-recovery-startup-state="pending"]').waitFor();
  assert.equal(await page.locator('[data-editor-action="add-shape"]').count(), 0);
  await api(page, 'resolveDiscovery');
  await page.getByRole('dialog', { name: 'Recuperação local' }).waitFor();
  const beforeSneak = await api(page, 'snapshot');
  await api(page, 'editTitle', 'Current authored work survives');
  await page.getByRole('button', { name: 'Recuperar minhas alterações' }).click();
  await page.getByText('As alterações atuais mudaram enquanto a recuperação era verificada.').waitFor();
  const rejected = await api(page, 'snapshot');
  assert.equal(rejected.document.title, 'Current authored work survives');
  assert.equal(rejected.openSessionId, beforeSneak.openSessionId);
  assert.equal(await page.locator('[data-editor-action="add-shape"]').count(), 0);
  const preserved = (await api(page, 'list')).find(
    (entry) => entry.status === 'VALID'
      && entry.record.openSessionId === adversarial.original.openSessionId
  );
  assert(preserved, 'Rejected stale recovery must preserve the original recovery record');
  assert.equal(preserved.record.documentSnapshot.title, 'Old recovery must remain');
  evidence.proofs.I = {
    editorAbsentWhileDiscoveryPending: true,
    editorAbsentWhileDecisionPending: true,
    recoveredSessionBecameEditable: true,
    staleProgrammaticInstallRejected: true,
    currentAuthoredWorkPreserved: true,
    oldRecoveryPreserved: true,
  };
  await closeRun(run);
}

async function runA() {
  const crashProfile = await newProfile('canonical-crash');
  let run = await launchProfile(crashProfile);
  evidence.chromiumVersion = run.browser.version();
  await clearDatabase(run);
  let page = await pageFor(run, 'base');
  const beforeEdit = await api(page, 'snapshot');
  await api(page, 'editTitle', 'Canonical local title before crash');
  await api(page, 'flushRecovery');
  const [committed] = await committedRecordsFromFreshConnection(page);
  assert(committed);
  assert.equal(committed.status, 'VALID');
  assert.equal(committed.record.authorityScopeId, 'physical:user-a');
  assert.equal(committed.record.catalogId, beforeEdit.document.id);
  assert.equal(committed.record.openSessionId, beforeEdit.openSessionId);
  assert(committed.record.recoveryGeneration > 0);
  assert.equal(committed.record.documentSnapshot.title, 'Canonical local title before crash');
  await page.screenshot({ path: resolve(output, 'A-before-hard-crash.png'), fullPage: true });
  await hardCrash(run);

  run = await launchProfile(crashProfile);
  page = await pageFor(run, 'base');
  await page.getByRole('dialog', { name: 'Recuperação local' }).waitFor();
  await page.getByRole('button', { name: 'Recuperar minhas alterações' }).click();
  await page.getByRole('dialog', { name: 'Recuperação local' }).waitFor({ state: 'detached' });
  const recovered = await api(page, 'snapshot');
  assert.equal(recovered.document.title, 'Canonical local title before crash');
  assert.notEqual(recovered.openSessionId, beforeEdit.openSessionId);
  assert.equal(recovered.canUndo, false);
  assert.equal(recovered.canRedo, false);
  await api(page, 'editTitle', 'Continued after recovery');
  assert.equal((await api(page, 'snapshot')).document.title, 'Continued after recovery');
  await page.screenshot({ path: resolve(output, 'A-after-recovery.png'), fullPage: true });
  evidence.proofs.A = {
    transactionObservedFromFreshConnection: true,
    storedIdentity: {
      authorityScopeId: committed.record.authorityScopeId,
      catalogId: committed.record.catalogId,
      openSessionId: committed.record.openSessionId,
      recoveryGeneration: committed.record.recoveryGeneration,
    },
    hardRestartSameProfile: true,
    newOpenSessionId: recovered.openSessionId,
    freshUndoRedo: true,
    continuedEditing: true,
  };
  await closeRun(run);
}

async function createDraftCrash(label) {
  const profile = await newProfile(label);
  const run = await launchProfile(profile);
  await clearDatabase(run);
  const page = await pageFor(run, 'base');
  const original = await api(page, 'snapshot');
  await page.locator('[data-editor-object-id="text-target"]').click();
  await page.locator('[data-editor-action="edit-text"]').click();
  const textarea = page.locator('[data-text-edit-textarea]');
  await textarea.fill('Visible draft B');
  await textarea.dispatchEvent('compositionstart');
  await api(page, 'flushRecovery');
  const [committed] = await committedRecordsFromFreshConnection(page);
  assert(committed);
  assert.equal(committed.status, 'VALID');
  assert.equal(committed.record.openSessionId, original.openSessionId);
  assert.equal(committed.record.authoringRecoveryOverlay.draft, 'Visible draft B');
  assert.equal(committed.record.authoringRecoveryOverlay.compositionWasActive, true);
  assert.equal(committed.canonicalText, 'Canonical A');
  await hardCrash(run);
  return { profile, original, committed };
}

async function recoverDraft(profile) {
  const run = await launchProfile(profile);
  const page = await pageFor(run, 'base');
  await page.getByRole('dialog', { name: 'Recuperação local' }).waitFor();
  await page.getByRole('button', { name: 'Recuperar minhas alterações' }).click();
  await page.locator('[data-text-edit-textarea]').waitFor();
  const snapshot = await api(page, 'snapshot');
  assert.equal(await page.locator('[data-text-edit-textarea]').inputValue(), 'Visible draft B');
  assert.equal(snapshot.canonicalText, 'Canonical A');
  assert.equal(snapshot.canUndo, false);
  assert.equal(snapshot.canRedo, false);
  return { run, page, snapshot };
}

async function runB() {
  const cancelCrash = await createDraftCrash('draft-cancel');
  let recovered = await recoverDraft(cancelCrash.profile);
  const beforeCancel = await api(recovered.page, 'snapshot');
  await recovered.page.locator('[data-editor-action="cancel-text"]').click();
  const afterCancel = await api(recovered.page, 'snapshot');
  assert.equal(afterCancel.canonicalText, 'Canonical A');
  assert.equal(afterCancel.localSequence, beforeCancel.localSequence);
  assert.equal(afterCancel.canUndo, false);
  await closeRun(recovered.run);

  const confirmCrash = await createDraftCrash('draft-confirm');
  recovered = await recoverDraft(confirmCrash.profile);
  const beforeConfirm = await api(recovered.page, 'snapshot');
  await recovered.page.locator('[data-editor-action="commit-text"]').click();
  const afterConfirm = await api(recovered.page, 'snapshot');
  assert.equal(afterConfirm.canonicalText, 'Visible draft B');
  assert.equal(afterConfirm.localSequence, beforeConfirm.localSequence + 1);
  assert.equal(afterConfirm.canUndo, true);
  await recovered.page.locator('[data-editor-action="undo"]').click();
  assert.equal((await api(recovered.page, 'snapshot')).canonicalText, 'Canonical A');
  await recovered.page.screenshot({ path: resolve(output, 'B-after-recovery.png'), fullPage: true });
  evidence.proofs.B = {
    transactionObservedFromFreshConnection: true,
    compositionIntentPersisted: true,
    canonicalBeforeConfirmation: 'Canonical A',
    visibleRecoveredDraft: 'Visible draft B',
    cancelCanonicalActionCount: 0,
    confirmCanonicalActionCount: 1,
    oneActionUndoRestored: 'Canonical A',
  };
  await closeRun(recovered.run);
}

async function runC() {
  const raceProfile = await newProfile('save-race');
  const run = await launchProfile(raceProfile);
  await clearDatabase(run);
  const page = await pageFor(run, 'controlled');
  await api(page, 'editTitle', 'S1');
  await api(page, 'startSave');
  await page.waitForFunction(() => window.__W3D_PROOF__.snapshot().lastSaveRequest !== undefined);
  let [raceRecord] = await api(page, 'list');
  assert.equal(raceRecord.record.pendingRemoteMutation.attemptedDocumentSnapshot.title, 'S1');
  await api(page, 'editTitle', 'L2');
  await api(page, 'flushRecovery');
  [raceRecord] = await api(page, 'list');
  assert.equal(raceRecord.record.documentSnapshot.title, 'L2');
  const generationBeforeAck = raceRecord.record.recoveryGeneration;
  await api(page, 'resolveSave');
  await api(page, 'awaitSave');
  await api(page, 'flushRecovery');
  [raceRecord] = await api(page, 'list');
  assert.equal(raceRecord.record.documentSnapshot.title, 'L2');
  assert.equal(raceRecord.record.baseRemoteRevision, 2);
  assert.equal(raceRecord.record.pendingRemoteMutation, undefined);
  assert(raceRecord.record.recoveryGeneration > generationBeforeAck);
  evidence.proofs.C = {
    preDispatchPendingTitle: 'S1',
    newerLocalTitle: 'L2',
    survivedAck: true,
    rebasedRemoteRevision: 2,
  };
  await closeRun(run);
}

const scenarios = {
  A: runA,
  B: runB,
  C: runC,
  D: runD,
  E: runE,
  F: runF,
  G: runG,
  H: runH,
  I: runI,
};

async function runProof() {
  const selected = requestedScenario === 'ALL'
    ? Object.keys(scenarios)
    : requestedScenario.split(',').map((scenario) => scenario.trim()).filter(Boolean);
  for (const scenario of selected) {
    const proof = scenarios[scenario];
    if (!proof) throw new Error(`Unknown W3.D physical proof scenario: ${scenario}`);
    await proof();
  }
}

try {
  await server.listen();
  await runProof();
  proofPassed = true;
  const resultPath = resolve(output, `result-${requestedScenario.toLowerCase().replaceAll(',', '-')}.json`);
  const result = JSON.stringify({ status: 'PASS', scenario: requestedScenario, ...evidence }, null, 2);
  await writeFile(resultPath, result);
  if (durableEvidencePath) {
    await mkdir(dirname(durableEvidencePath), { recursive: true });
    await writeFile(durableEvidencePath, result);
  }
  console.log(`W3.D physical recovery proof PASS: ${resultPath}`);
} catch (error) {
  const resultPath = resolve(output, `result-${requestedScenario.toLowerCase().replaceAll(',', '-')}.json`);
  await writeFile(resultPath, JSON.stringify({
    status: 'FAIL',
    scenario: requestedScenario,
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
    ...evidence,
  }, null, 2));
  throw error;
} finally {
  await server.close();
  for (const process of spawnedProcesses) {
    if (process.exitCode === null) {
      const exited = waitForExit(process);
      process.kill('SIGKILL');
      await exited;
    }
  }
  spawnedProcesses.clear();
  if (proofPassed) {
    for (const profilePath of profilePaths) {
      try {
        await rm(profilePath, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
      } catch (error) {
        console.warn(`Proof profile cleanup deferred: ${profilePath}: ${String(error)}`);
      }
    }
  } else if (profilePaths.length > 0) {
    console.warn(`Failed proof profiles retained: ${profilePaths.join(', ')}`);
  }
}
