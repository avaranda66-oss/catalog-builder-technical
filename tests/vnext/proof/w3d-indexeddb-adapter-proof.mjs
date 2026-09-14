import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/w3d-indexeddb-adapter-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.W3D_IDB_PROOF_PORT ?? 5204);
const server = await createServer({
  root,
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  logLevel: 'error',
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w3d-indexeddb.html`);
  const result = await page.evaluate(async () => {
    const adapter = await import('/src/vnext/recovery/indexeddb-repository.ts');
    const digest = await import('/src/vnext/recovery/digest.ts');
    const databaseName = `${adapter.VNEXT_RECOVERY_DATABASE_NAME}_proof`;
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('delete blocked'));
    });
    const catalogId = '11111111-1111-4111-8111-111111111111';
    const sessionA = '22222222-2222-4222-8222-222222222222';
    const sessionB = '33333333-3333-4333-8333-333333333333';
    const sessionRace = '66666666-6666-4666-8666-666666666666';
    const sessionCorrupt = '77777777-7777-4777-8777-777777777777';
    const sessionChanged = '88888888-8888-4888-8888-888888888888';
    const scopeA = 'deployment:workspace:user-a';
    const scopeB = 'deployment:workspace:user-b';
    const document = (title) => ({
      schemaVersion: 1,
      id: catalogId,
      title,
      locale: 'pt-BR',
      style: {
        fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }],
        defaultText: { fontFamily: 'Noto Sans', fontSizePt: 8, lineHeight: 1.2 },
        palette: ['#173F52'],
      },
      pages: [{ id: 'page-1', widthMm: 210, heightMm: 297, objects: [] }],
      assets: [],
    });
    const baseDigest = await digest.digestCanonicalDocument(document('Cloud base'));
    const makeRecord = async (generation, title, authorityScopeId = scopeA, openSessionId = sessionA) => {
      const documentSnapshot = document(title);
      return {
        recordFormatVersion: 1,
        authorityScopeId,
        catalogId,
        openSessionId,
        recoveryGeneration: generation,
        localEditSequence: generation,
        baseRemoteRevision: 7,
        baseRemoteSnapshotDigest: baseDigest,
        documentSchemaVersion: 1,
        documentSnapshot,
        snapshotDigestAlgorithm: 'SHA-256',
        snapshotDigest: await digest.digestCanonicalDocument(documentSnapshot),
        createdAt: '2026-09-13T00:00:00.000Z',
        updatedAt: `2026-09-13T00:00:0${generation}.000Z`,
      };
    };
    const first = new adapter.IndexedDbRecoveryRepository({ databaseName });
    const second = new adapter.IndexedDbRecoveryRepository({ databaseName });
    const g1 = await makeRecord(1, 'L1');
    const g2 = await makeRecord(2, 'L2');
    const s2 = await makeRecord(1, 'Tab two', scopeA, sessionB);
    const userB = await makeRecord(1, 'User B', scopeB, sessionA);
    const putG1 = await first.putIfNewer(g1);
    const freshRead = await second.get({ authorityScopeId: scopeA, catalogId, openSessionId: sessionA });
    const putG2 = await second.putIfNewer(g2);
    const stale = await first.putIfNewer(g1);
    const staleDelete = await first.deleteIfGeneration(
      { authorityScopeId: scopeA, catalogId, openSessionId: sessionA },
      1
    );
    await first.putIfNewer(s2);
    await first.putIfNewer(userB);
    const listA = await second.listByScope(scopeA);
    const listB = await second.listByScope(scopeB);
    const raceG1 = await makeRecord(1, 'Race G1', scopeA, sessionRace);
    const raceG2 = await makeRecord(2, 'Race G2', scopeA, sessionRace);
    await Promise.all([first.putIfNewer(raceG2), second.putIfNewer(raceG1)]);
    const raceRead = await first.get({ authorityScopeId: scopeA, catalogId, openSessionId: sessionRace });

    const opened = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const version = opened.version;
    const stores = [...opened.objectStoreNames];
    const corruptTransaction = opened.transaction(adapter.VNEXT_RECOVERY_STORE_NAME, 'readwrite');
    corruptTransaction.objectStore(adapter.VNEXT_RECOVERY_STORE_NAME).put({
      authorityScopeId: scopeA,
      catalogId,
      openSessionId: sessionCorrupt,
      recoveryGeneration: 9,
      recordToken: '{"corrupt":true}',
      rawRecord: { corrupt: true },
    });
    corruptTransaction.objectStore(adapter.VNEXT_RECOVERY_STORE_NAME).put({
      authorityScopeId: scopeA,
      catalogId,
      openSessionId: sessionChanged,
      recoveryGeneration: 10,
      recordToken: '{"unsupported":true}',
      rawRecord: { recordFormatVersion: 99 },
    });
    await new Promise((resolve, reject) => {
      corruptTransaction.oncomplete = () => resolve(undefined);
      corruptTransaction.onerror = () => reject(corruptTransaction.error);
      corruptTransaction.onabort = () => reject(corruptTransaction.error);
    });
    const transaction = opened.transaction(adapter.VNEXT_RECOVERY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(adapter.VNEXT_RECOVERY_STORE_NAME);
    const g3 = await makeRecord(3, 'Aborted L3');
    store.put({
      authorityScopeId: scopeA,
      catalogId,
      openSessionId: sessionA,
      recoveryGeneration: 3,
      recordToken: JSON.stringify(g3),
      rawRecord: g3,
    });
    transaction.abort();
    await new Promise((resolve) => {
      transaction.onabort = () => resolve(undefined);
      transaction.onerror = () => resolve(undefined);
    });
    opened.close();
    const afterAbort = await second.get({ authorityScopeId: scopeA, catalogId, openSessionId: sessionA });
    const corruptRead = await second.get({ authorityScopeId: scopeA, catalogId, openSessionId: sessionCorrupt });
    const changedInvalidRead = await second.get({ authorityScopeId: scopeA, catalogId, openSessionId: sessionChanged });
    const corruptDelete = await second.deleteIfGeneration(
      { authorityScopeId: scopeA, catalogId, openSessionId: sessionCorrupt },
      9
    );
    const invalidDelete = await second.deleteInvalidIfStillInvalid(
      { authorityScopeId: scopeA, catalogId, openSessionId: sessionCorrupt }
    );
    const changedValid = await makeRecord(1, 'Valid replacement', scopeA, sessionChanged);
    const replacementDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const replacementTransaction = replacementDatabase.transaction(adapter.VNEXT_RECOVERY_STORE_NAME, 'readwrite');
    replacementTransaction.objectStore(adapter.VNEXT_RECOVERY_STORE_NAME).put({
      authorityScopeId: scopeA,
      catalogId,
      openSessionId: sessionChanged,
      recoveryGeneration: changedValid.recoveryGeneration,
      recordToken: JSON.stringify(changedValid),
      rawRecord: changedValid,
    });
    await new Promise((resolve, reject) => {
      replacementTransaction.oncomplete = () => resolve(undefined);
      replacementTransaction.onerror = () => reject(replacementTransaction.error);
      replacementTransaction.onabort = () => reject(replacementTransaction.error);
    });
    replacementDatabase.close();
    const validPreserve = await second.deleteInvalidIfStillInvalid(
      { authorityScopeId: scopeA, catalogId, openSessionId: sessionChanged }
    );
    const corruptAfterDelete = await second.get({ authorityScopeId: scopeA, catalogId, openSessionId: sessionCorrupt });
    const changedAfterDelete = await second.get({ authorityScopeId: scopeA, catalogId, openSessionId: sessionChanged });
    const neighborAfterDelete = await second.get({ authorityScopeId: scopeA, catalogId, openSessionId: sessionB });
    await first.close();
    await second.close();
    return {
      putG1,
      freshGeneration: freshRead?.status === 'VALID' ? freshRead.record.recoveryGeneration : null,
      putG2,
      stale,
      staleDelete,
      listACount: listA.length,
      listBCount: listB.length,
      raceGeneration: raceRead?.status === 'VALID' ? raceRead.record.recoveryGeneration : null,
      version,
      stores,
      afterAbortGeneration: afterAbort?.status === 'VALID' ? afterAbort.record.recoveryGeneration : null,
      corruptStatus: corruptRead?.status,
      changedInvalidStatus: changedInvalidRead?.status,
      corruptDelete,
      invalidDelete,
      validPreserve,
      corruptAfterDelete: corruptAfterDelete?.status ?? 'NOT_FOUND',
      changedAfterDelete: changedAfterDelete?.status,
      neighborAfterDelete: neighborAfterDelete?.status,
    };
  });

  assert.deepEqual(result.putG1, { status: 'STORED', generation: 1 });
  assert.equal(result.freshGeneration, 1, 'fresh connection must observe committed G1');
  assert.deepEqual(result.putG2, { status: 'STORED', generation: 2 });
  assert.deepEqual(result.stale, { status: 'STALE', storedGeneration: 2 });
  assert.deepEqual(result.staleDelete, { status: 'STALE', storedGeneration: 2 });
  assert.equal(result.listACount, 2, 'same scope must retain two tab records');
  assert.equal(result.listBCount, 1, 'foreign scope enumeration must be separate');
  assert.equal(result.raceGeneration, 2, 'concurrent lower generation must not overwrite G2');
  assert.equal(result.version, 1);
  assert.deepEqual(result.stores, ['recoveryRecords']);
  assert.equal(result.afterAbortGeneration, 2, 'aborted later transaction must preserve G2');
  assert.equal(result.corruptStatus, 'INVALID', 'corrupt raw record must fail closed');
  assert.equal(result.changedInvalidStatus, 'INVALID', 'unsupported raw record must be inspected before replacement');
  assert.deepEqual(result.corruptDelete, { status: 'INVALID_PRESERVED' });
  assert.deepEqual(result.invalidDelete, { status: 'DELETED' });
  assert.deepEqual(result.validPreserve, { status: 'VALID_PRESERVED' });
  assert.equal(result.corruptAfterDelete, 'NOT_FOUND', 'confirmed invalid exact record must be deleted');
  assert.equal(result.changedAfterDelete, 'VALID', 'valid replacement must survive stale invalid deletion intent');
  assert.equal(result.neighborAfterDelete, 'VALID', 'neighboring exact key must remain untouched');
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ status: 'PASS', ...result }, null, 2));
  console.log(`W3.D IndexedDB adapter proof PASS: ${resolve(output, 'result.json')}`);
} finally {
  await browser?.close();
  await server.close();
}
