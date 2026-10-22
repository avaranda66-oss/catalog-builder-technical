import { describe, expect, it, vi } from 'vitest';
import type { CatalogDocument } from '@/vnext/domain';
import type { CatalogPersistenceEnvelope, CatalogRepository, PersistenceResult } from '@/vnext/persistence';
import {
  InMemoryRecoveryRepository,
  RecoveryCoordinator,
  RecoveryStartupCoordinator,
  SessionRecoveryManager,
  digestCanonicalDocument,
  recoveryKeyOf,
  type RecoveryKey,
  type SessionRecoverySource,
} from '@/vnext/recovery';
import {
  CATALOG_ID,
  MUTATION_0,
  MUTATION_1,
  SESSION_A,
  SESSION_B,
  recoveryDocument,
  recoveryRecord,
} from './fixtures';

const SCOPE = 'deployment:workspace:user-a';
const OTHER_CATALOG_ID = '66666666-6666-4666-8666-666666666666';
const SESSION_C = '77777777-7777-4777-8777-777777777777';

function documentOf(catalogId: string, title: string): CatalogDocument {
  return { ...recoveryDocument(title), id: catalogId };
}

function envelope(documentSnapshot: CatalogDocument): CatalogPersistenceEnvelope {
  return {
    catalogId: documentSnapshot.id,
    remoteRevision: 7,
    lastMutationId: MUTATION_0,
    title: documentSnapshot.title,
    locale: documentSnapshot.locale,
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-15T12:00:00.000Z',
    createdBy: null,
    updatedBy: null,
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot,
  };
}

function unavailable<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({ ok: false, error: { code: 'REMOTE_FAILURE' } });
}

function catalogRepository(): CatalogRepository & { getCatalog: ReturnType<typeof vi.fn> } {
  return {
    listCatalogs: () => unavailable(),
    getCatalog: vi.fn(async (catalogId: string) => ({
      ok: true as const,
      value: envelope(documentOf(catalogId, 'Cloud base')),
    })),
    createCatalog: () => unavailable(),
    saveCAS: () => unavailable(),
    archiveCAS: () => unavailable(),
  };
}

function coordinator(repository: InMemoryRecoveryRepository) {
  return new RecoveryCoordinator({
    repository,
    applicationDependencies: { createId: () => 'unused' },
    createOpenSessionId: () => SESSION_C,
  });
}

async function seed(repository: InMemoryRecoveryRepository, catalogId: string, title: string) {
  const record = await recoveryRecord({
    authorityScopeId: SCOPE,
    catalogId,
    openSessionId: SESSION_A,
    documentSnapshot: documentOf(catalogId, title),
    baseRemoteSnapshotDigest: await digestCanonicalDocument(documentOf(catalogId, 'Cloud base')),
  });
  await repository.putIfNewer(record);
  return record;
}

describe('FR-42 recovery startup only for the open catalog', () => {
  it('returns only the open catalog records and never reads the cloud for other catalogs', async () => {
    const recovery = new InMemoryRecoveryRepository();
    await seed(recovery, CATALOG_ID, 'Trabalho no catálogo A');
    await seed(recovery, OTHER_CATALOG_ID, 'Sobra do catálogo B');
    const repository = catalogRepository();
    const startup = new RecoveryStartupCoordinator({ coordinator: coordinator(recovery), repository });

    const scoped = await startup.discover(SCOPE, { catalogId: CATALOG_ID });

    expect(scoped.map((candidate) => candidate.inspection.key.catalogId)).toEqual([CATALOG_ID]);
    expect(repository.getCatalog).toHaveBeenCalledTimes(1);
    expect(repository.getCatalog).toHaveBeenCalledWith(CATALOG_ID);
    // The other catalog's backup is still stored for when that catalog is opened.
    expect((await recovery.listByScope(SCOPE)).map((entry) => entry.key.catalogId).sort())
      .toEqual([CATALOG_ID, OTHER_CATALOG_ID].sort());
    expect(await startup.discover(SCOPE, { catalogId: OTHER_CATALOG_ID }))
      .toEqual([expect.objectContaining({ inspection: expect.objectContaining({ key: expect.objectContaining({ catalogId: OTHER_CATALOG_ID }) }) })]);
  });

  it('keeps the previous unscoped behaviour when no catalog is given', async () => {
    const recovery = new InMemoryRecoveryRepository();
    await seed(recovery, CATALOG_ID, 'A');
    await seed(recovery, OTHER_CATALOG_ID, 'B');
    const startup = new RecoveryStartupCoordinator({ coordinator: coordinator(recovery), repository: catalogRepository() });
    expect(await startup.discover(SCOPE)).toHaveLength(2);
  });
});

class ManualClock {
  setTimeout(): number { return 0; }
  clearTimeout(): void {}
  now(): number { return 0; }
}

function managerHarness(initial: SessionRecoverySource) {
  const recovery = new InMemoryRecoveryRepository();
  const deleteSpy = vi.spyOn(recovery, 'deleteIfGeneration');
  let source = initial;
  const listeners = new Set<() => void>();
  const manager = new SessionRecoveryManager({
    coordinator: coordinator(recovery),
    getSource: () => source,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    clock: new ManualClock(),
  });
  return {
    recovery,
    deleteSpy,
    manager,
    async change(next: SessionRecoverySource) {
      source = next;
      listeners.forEach((listener) => listener());
      await manager.flush();
    },
  };
}

function source(overrides: Partial<SessionRecoverySource> = {}): SessionRecoverySource {
  const catalogId = overrides.catalogId ?? CATALOG_ID;
  return {
    ownerAuthorityScopeId: SCOPE,
    activeAuthorityScopeId: SCOPE,
    catalogId,
    openSessionId: SESSION_A,
    localEditSequence: 1,
    documentSnapshot: documentOf(catalogId, 'Trabalho local'),
    baseRemoteRevision: 7,
    baseRemoteSnapshot: documentOf(catalogId, 'Cloud base'),
    dirty: true,
    ...overrides,
  };
}

const keyA: RecoveryKey = { authorityScopeId: SCOPE, catalogId: CATALOG_ID, openSessionId: SESSION_A };

describe('FR-42 session recovery deletes the record it wrote, never the new session key', () => {
  it('deletes its own record when the same session becomes clean', async () => {
    const harness = managerHarness(source());
    harness.manager.start();
    await harness.manager.flush();
    expect((await harness.recovery.get(keyA))?.status).toBe('VALID');

    await harness.change(source({ dirty: false, localEditSequence: 2 }));

    expect(harness.deleteSpy).toHaveBeenCalledWith(keyA, 1);
    expect(await harness.recovery.get(keyA)).toBeUndefined();
  });

  it('after "Salvar como cópia" (another catalog opened) removes the old session record by its own key', async () => {
    const harness = managerHarness(source());
    harness.manager.start();
    await harness.manager.flush();

    await harness.change(source({ catalogId: OTHER_CATALOG_ID, openSessionId: SESSION_B, dirty: false, localEditSequence: 0 }));

    expect(harness.deleteSpy).toHaveBeenCalledTimes(1);
    expect(harness.deleteSpy).toHaveBeenCalledWith(keyA, 1);
    expect(await harness.recovery.get(keyA)).toBeUndefined();
    expect(await harness.recovery.listByScope(SCOPE)).toEqual([]);
  });

  it('keeps the replaced changes when the same catalog is reopened, so they are offered next time', async () => {
    const harness = managerHarness(source());
    harness.manager.start();
    await harness.manager.flush();

    await harness.change(source({ openSessionId: SESSION_B, dirty: false, localEditSequence: 0 }));

    expect(harness.deleteSpy).not.toHaveBeenCalled();
    expect((await harness.recovery.get(keyA))?.status).toBe('VALID');
  });

  it('keeps a record with an unconfirmed save even when another catalog takes over', async () => {
    const harness = managerHarness(source());
    harness.manager.start();
    const attempted = documentOf(CATALOG_ID, 'Tentativa');
    await harness.manager.flushPendingMutation({
      mutationId: MUTATION_1,
      catalogId: CATALOG_ID,
      expectedRemoteRevision: 7,
      previousLastMutationId: MUTATION_0,
      capturedLocalEditSequence: 1,
      attemptedDocumentSnapshot: attempted,
      attemptDigestAlgorithm: 'SHA-256',
      attemptDigest: await digestCanonicalDocument(attempted),
    });

    // Reopen normally waits for the save; if a switch still happened, the unconfirmed save is never dropped.
    await harness.change(source({ catalogId: OTHER_CATALOG_ID, openSessionId: SESSION_B, dirty: false, localEditSequence: 0 }))
      .catch(() => undefined);

    expect(harness.deleteSpy).not.toHaveBeenCalled();
    const kept = await harness.recovery.get(keyA);
    expect(kept?.status === 'VALID' && kept.record.pendingRemoteMutation?.mutationId).toBe(MUTATION_1);
  });

  it('writes the new session under its own key while preserving the replaced same-catalog record', async () => {
    const harness = managerHarness(source());
    harness.manager.start();
    await harness.manager.flush();

    await harness.change(source({ openSessionId: SESSION_B, localEditSequence: 3 }));

    const keys = (await harness.recovery.listByScope(SCOPE)).map((entry) => recoveryKeyOf(entry.key).openSessionId).sort();
    expect(keys).toEqual([SESSION_A, SESSION_B].sort());
    expect(harness.manager.getLastWrittenRecord()?.openSessionId).toBe(SESSION_B);
  });
});
