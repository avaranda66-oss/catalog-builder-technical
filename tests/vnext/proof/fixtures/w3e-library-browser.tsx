import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  CatalogCloneService,
  authoredStructuralIdentityIds,
  createCatalogDocument,
  createDocumentSession,
  createStaticPageTemplateRegistry,
  type ApplicationExecutionDependencies,
} from '@/vnext/application';
import { CatalogLibrary } from '@/vnext/app/CatalogLibrary';
import { VNextApp } from '@/vnext/app/VNextApp';
import { CatalogLibraryService, createDefaultCatalogStarterRegistry } from '@/vnext/library';
import type {
  ArchiveCatalogCasRequest,
  CatalogListItem,
  CatalogListQuery,
  CatalogPersistenceEnvelope,
  CatalogPersistenceMetadata,
  CatalogRepository,
  CreateCatalogRequest,
  PersistenceResult,
  SaveCatalogCasRequest,
} from '@/vnext/persistence';
import { VNextPersistenceRuntime, canonicalDocumentEquivalence } from '@/vnext/persistence';
import {
  CURRENT_RECOVERY_RECORD_FORMAT_VERSION,
  InMemoryRecoveryRepository,
  RECOVERY_DIGEST_ALGORITHM,
  digestCanonicalDocument,
  type RecoveryRecord,
} from '@/vnext/recovery';

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

let generated = 1000;
const createId = (): string => uuid(++generated);
const dependencies: ApplicationExecutionDependencies = {
  createId,
  templateRegistry: createStaticPageTemplateRegistry([]),
};
const starterRegistry = createDefaultCatalogStarterRegistry();

function envelope(
  id: string,
  title: string,
  updatedAt: string,
  archivedAt: string | null = null
): CatalogPersistenceEnvelope {
  let rootPending = true;
  const documentSnapshot = createCatalogDocument(() => {
    if (rootPending) {
      rootPending = false;
      return id;
    }
    return createId();
  }, title);
  return {
    catalogId: id,
    remoteRevision: archivedAt ? 2 : 1,
    lastMutationId: uuid(Number(id.slice(-4)) + 5000),
    title,
    locale: documentSnapshot.locale,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt,
    createdBy: 'proof-user',
    updatedBy: 'proof-user',
    archivedAt,
    documentSchemaVersion: 1,
    documentSnapshot,
  };
}

function nontrivialEnvelope(id: string, title: string, updatedAt: string): CatalogPersistenceEnvelope {
  const starter = starterRegistry.get('essential-technical-sheet');
  if (!starter) throw new Error('Missing proof starter');
  let rootPending = true;
  const documentSnapshot = new CatalogCloneService(() => {
    if (rootPending) {
      rootPending = false;
      return id;
    }
    return createId();
  }).clone(starter.sourceDocument, { title });
  return {
    catalogId: id,
    remoteRevision: 4,
    lastMutationId: createId(),
    title,
    locale: documentSnapshot.locale,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt,
    createdBy: 'proof-user',
    updatedBy: 'proof-user',
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot,
  };
}

class BrowserLibraryRepository implements CatalogRepository {
  readonly records = new Map<string, CatalogPersistenceEnvelope>();
  listCalls = 0;
  getCalls = 0;
  private ambiguousArmed = false;
  private ambiguousAttempt?: CreateCatalogRequest;
  private ambiguousReplay?: CreateCatalogRequest;
  private ambiguousFirstVerificationNotFound = false;
  private ambiguousReplayAccepted = false;

  constructor(initial: readonly CatalogPersistenceEnvelope[]) {
    for (const record of initial) this.records.set(record.catalogId, record);
  }

  armAmbiguousCreate(): void {
    this.ambiguousArmed = true;
    this.ambiguousAttempt = undefined;
    this.ambiguousReplay = undefined;
    this.ambiguousFirstVerificationNotFound = false;
    this.ambiguousReplayAccepted = false;
  }

  ambiguousCreateEvidence() {
    const first = this.ambiguousAttempt;
    const replay = this.ambiguousReplay;
    const sameDocument = Boolean(first && replay
      && canonicalDocumentEquivalence(first.documentSnapshot) === canonicalDocumentEquivalence(replay.documentSnapshot));
    const sameOrigin = Boolean(first && replay
      && JSON.stringify(first.origin ?? null) === JSON.stringify(replay.origin ?? null));
    const logicalCatalogCount = first
      ? [...this.records.values()].filter((record) => record.catalogId === first.documentSnapshot.id).length
      : 0;
    return {
      dispatches: Number(Boolean(first)) + Number(Boolean(replay)),
      firstVerificationNotFound: this.ambiguousFirstVerificationNotFound,
      replayAccepted: this.ambiguousReplayAccepted,
      firstCatalogId: first?.documentSnapshot.id ?? null,
      replayCatalogId: replay?.documentSnapshot.id ?? null,
      firstMutationId: first?.mutationId ?? null,
      replayMutationId: replay?.mutationId ?? null,
      sameDocument,
      sameOrigin,
      logicalCatalogCount,
    };
  }

  listCatalogs = async (query: CatalogListQuery = {}): Promise<PersistenceResult<readonly CatalogListItem[]>> => {
    this.listCalls += 1;
    const value = [...this.records.values()]
      .filter((record) => query.includeArchived || record.archivedAt === null)
      .map(({ documentSnapshot: _snapshot, lastMutationId: _mutation, ...item }) => item);
    return { ok: true, value };
  };

  getCatalog = async (catalogId: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    this.getCalls += 1;
    const record = this.records.get(catalogId);
    if (!record && this.ambiguousAttempt?.documentSnapshot.id === catalogId) {
      this.ambiguousFirstVerificationNotFound = true;
    }
    return record
      ? { ok: true, value: record }
      : { ok: false, error: { code: 'NOT_FOUND' } };
  };

  createCatalog = async (request: CreateCatalogRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    if (this.ambiguousArmed) {
      this.ambiguousArmed = false;
      this.ambiguousAttempt = request;
      return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } };
    }
    if (
      this.ambiguousAttempt
      && !this.ambiguousReplayAccepted
      && request.documentSnapshot.id === this.ambiguousAttempt.documentSnapshot.id
    ) {
      this.ambiguousReplay = request;
      const exactReplay = request.mutationId === this.ambiguousAttempt.mutationId
        && canonicalDocumentEquivalence(request.documentSnapshot)
          === canonicalDocumentEquivalence(this.ambiguousAttempt.documentSnapshot)
        && JSON.stringify(request.origin ?? null) === JSON.stringify(this.ambiguousAttempt.origin ?? null);
      if (!exactReplay) return { ok: false, error: { code: 'CONFLICT' } };
    }
    if (this.records.has(request.documentSnapshot.id)) return { ok: false, error: { code: 'CONFLICT' } };
    const next: CatalogPersistenceEnvelope = {
      catalogId: request.documentSnapshot.id,
      remoteRevision: 1,
      lastMutationId: request.mutationId,
      title: request.documentSnapshot.title,
      locale: request.documentSnapshot.locale,
      createdAt: '2026-09-14T13:00:00.000Z',
      updatedAt: '2026-09-14T13:00:00.000Z',
      createdBy: 'proof-user',
      updatedBy: 'proof-user',
      archivedAt: null,
      ...(request.origin ? { origin: request.origin } : {}),
      documentSchemaVersion: 1,
      documentSnapshot: request.documentSnapshot,
    };
    this.records.set(next.catalogId, next);
    if (this.ambiguousReplay) this.ambiguousReplayAccepted = true;
    return { ok: true, value: next };
  };

  saveCAS = async (request: SaveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const current = this.records.get(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.archivedAt) return { ok: false, error: { code: 'ARCHIVED' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) return { ok: false, error: { code: 'CONFLICT' } };
    const next: CatalogPersistenceEnvelope = {
      ...current,
      remoteRevision: current.remoteRevision + 1,
      lastMutationId: request.mutationId,
      title: request.documentSnapshot.title,
      locale: request.documentSnapshot.locale,
      updatedAt: '2026-09-14T13:10:00.000Z',
      documentSnapshot: request.documentSnapshot,
    };
    this.records.set(next.catalogId, next);
    return { ok: true, value: next };
  };

  archiveCAS = async (request: ArchiveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceMetadata>> => {
    const current = this.records.get(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.archivedAt) return { ok: false, error: { code: 'ARCHIVED' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) return { ok: false, error: { code: 'CONFLICT' } };
    const next: CatalogPersistenceEnvelope = {
      ...current,
      remoteRevision: current.remoteRevision + 1,
      lastMutationId: request.mutationId,
      updatedAt: '2026-09-14T13:20:00.000Z',
      archivedAt: '2026-09-14T13:20:00.000Z',
    };
    this.records.set(next.catalogId, next);
    const { documentSnapshot: _snapshot, ...metadata } = next;
    return { ok: true, value: metadata };
  };
}

const IDS = {
  alpha: uuid(101),
  beta: uuid(102),
  zeta: uuid(103),
  archived: uuid(104),
} as const;

const repository = new BrowserLibraryRepository([
  nontrivialEnvelope(IDS.alpha, 'Álpha Calibradores', '2026-09-14T10:00:00.000Z'),
  envelope(IDS.beta, 'Beta Pressão', '2026-09-14T11:00:00.000Z'),
  envelope(IDS.zeta, 'Zeta Temperatura', '2026-09-14T09:00:00.000Z'),
  envelope(IDS.archived, 'Catálogo Histórico', '2026-09-13T09:00:00.000Z', '2026-09-13T10:00:00.000Z'),
]);

const service = new CatalogLibraryService({
  repository,
  applicationDependencies: dependencies,
  createId,
  createMutationId: createId,
  createOpenSessionId: createId,
  authLineage: () => 'proof-user:0',
  authorityScopeId: () => 'proof:workspace:user',
  starterRegistry,
});

let lastOpenedCatalogId: string | null = null;
let lastCanonicalOpen: { readonly catalogId: string; readonly ok: boolean; readonly code?: string } | null = null;
let recoveryTargetCatalogId: string | null = null;
const recoveryRepository = new InMemoryRecoveryRepository();
const authorityScopeId = 'proof:workspace:user';
const w3fMode = new URLSearchParams(window.location.search).get('proof') === 'w3f';

function createRuntime(binding?: CatalogPersistenceEnvelope, withRecovery = false): VNextPersistenceRuntime {
  const document = binding?.documentSnapshot ?? createCatalogDocument(createId, 'Proof bootstrap');
  const session = createDocumentSession(document, dependencies);
  return new VNextPersistenceRuntime({
    session,
    repository,
    applicationDependencies: dependencies,
    createMutationId: createId,
    createOpenSessionId: createId,
    authLineage: 'proof-user:0',
    authorityScopeId,
    ...(withRecovery ? { recoveryRepository } : {}),
    ...(binding ? { binding } : {}),
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing W3.E Library proof root');
const rootRenderer = ReactDOM.createRoot(root);

function renderLibrary(): void {
  rootRenderer.render(
    <React.StrictMode>
      <CatalogLibrary service={service} onOpen={(catalogId) => { void openFromLibrary(catalogId); }} />
    </React.StrictMode>
  );
}

async function openFromLibrary(catalogId: string): Promise<void> {
  lastOpenedCatalogId = catalogId;
  const withRecovery = recoveryTargetCatalogId === catalogId;
  const runtime = createRuntime(undefined, withRecovery);
  const opened = await runtime.reopenCoordinator.open(catalogId, { allowDiscardUnsaved: true });
  lastCanonicalOpen = opened.ok
    ? { catalogId, ok: true }
    : { catalogId, ok: false, code: opened.error.code };
  if (opened.ok && (withRecovery || w3fMode)) {
    rootRenderer.render(
      <React.StrictMode>
        <VNextApp runtime={runtime} onRequestLibrary={renderLibrary} />
      </React.StrictMode>
    );
  }
}

async function editSaveReopen(catalogId: string) {
  const current = repository.records.get(catalogId);
  if (!current) throw new Error(`Missing proof catalog ${catalogId}`);
  const runtime = createRuntime(current);
  const beforePages = runtime.workspace.getSnapshot().session.getSnapshot().document.pages.length;
  const edited = runtime.workspace.getSnapshot().session.execute({ type: 'page.add' });
  if (!edited.ok) throw new Error(`Proof edit rejected: ${edited.error.code}`);
  const saved = await runtime.saveCoordinator.save();
  if (!saved.ok) throw new Error(`Proof save rejected: ${saved.error.code}`);
  const authoritativeAfterSave = repository.records.get(catalogId);
  if (!authoritativeAfterSave) throw new Error('Saved catalog disappeared');

  const reopenedRuntime = createRuntime();
  const reopened = await reopenedRuntime.reopenCoordinator.open(catalogId, { allowDiscardUnsaved: true });
  if (!reopened.ok) throw new Error(`Proof reopen rejected: ${reopened.error.code}`);
  return {
    beforePages,
    afterSavePages: authoritativeAfterSave.documentSnapshot.pages.length,
    reopenedPages: reopenedRuntime.workspace.getSnapshot().session.getSnapshot().document.pages.length,
    remoteRevision: authoritativeAfterSave.remoteRevision,
  };
}

async function staleSaveAfterArchive() {
  const raceId = uuid(901);
  const record = envelope(raceId, 'Race Archive Proof', '2026-09-14T12:30:00.000Z');
  repository.records.set(raceId, record);
  const staleRuntime = createRuntime(record);
  const edited = staleRuntime.workspace.getSnapshot().session.execute({ type: 'page.add' });
  if (!edited.ok) throw new Error(`Stale proof edit rejected: ${edited.error.code}`);
  const archived = await service.archive(raceId);
  if (!archived.ok) throw new Error(`Archive proof rejected: ${archived.error.code}`);
  const staleSave = await staleRuntime.saveCoordinator.save();
  const current = repository.records.get(raceId);
  return {
    raceId,
    archiveOk: archived.ok,
    staleSaveOk: staleSave.ok,
    staleSaveCode: staleSave.ok ? null : staleSave.error.code,
    archivedAt: current?.archivedAt ?? null,
    pageCount: current?.documentSnapshot.pages.length ?? -1,
    remoteRevision: current?.remoteRevision ?? -1,
  };
}

async function seedRecovery(catalogId: string) {
  const current = repository.records.get(catalogId);
  if (!current) throw new Error(`Missing recovery proof catalog ${catalogId}`);
  const localSession = createDocumentSession(current.documentSnapshot, dependencies);
  const edited = localSession.execute({ type: 'page.add' });
  if (!edited.ok) throw new Error(`Recovery proof edit rejected: ${edited.error.code}`);
  const recoveredDocument = localSession.getSnapshot().document;
  const now = '2026-09-14T13:30:00.000Z';
  const record: RecoveryRecord = {
    recordFormatVersion: CURRENT_RECOVERY_RECORD_FORMAT_VERSION,
    authorityScopeId,
    catalogId,
    openSessionId: createId(),
    recoveryGeneration: 1,
    localEditSequence: localSession.getSnapshot().localSequence,
    baseRemoteRevision: current.remoteRevision,
    baseRemoteSnapshotDigest: await digestCanonicalDocument(current.documentSnapshot),
    documentSchemaVersion: 1,
    documentSnapshot: recoveredDocument,
    snapshotDigestAlgorithm: RECOVERY_DIGEST_ALGORITHM,
    snapshotDigest: await digestCanonicalDocument(recoveredDocument),
    createdAt: now,
    updatedAt: now,
  };
  await recoveryRepository.putIfNewer(record);
  recoveryTargetCatalogId = catalogId;
  return { catalogId, openSessionId: record.openSessionId, recoveryGeneration: record.recoveryGeneration };
}

declare global {
  interface Window {
    __W3E_LIBRARY_PROOF__: {
      readonly ids: typeof IDS;
      state(): {
      readonly lastOpenedCatalogId: string | null;
        readonly lastCanonicalOpen: typeof lastCanonicalOpen;
        readonly activeTitles: readonly string[];
        readonly archivedTitles: readonly string[];
        readonly listCalls: number;
        readonly getCalls: number;
      };
      openExact(catalogId: string): Promise<{ readonly ok: boolean; readonly code?: string }>;
      editSaveReopen(catalogId: string): Promise<{
        readonly beforePages: number;
        readonly afterSavePages: number;
        readonly reopenedPages: number;
        readonly remoteRevision: number;
      }>;
      staleSaveAfterArchive(): Promise<{
        readonly raceId: string;
        readonly archiveOk: boolean;
        readonly staleSaveOk: boolean;
        readonly staleSaveCode: string | null;
        readonly archivedAt: string | null;
        readonly pageCount: number;
        readonly remoteRevision: number;
      }>;
      seedRecovery(catalogId: string): Promise<{
        readonly catalogId: string;
        readonly openSessionId: string;
        readonly recoveryGeneration: number;
      }>;
      recoveryCount(): Promise<number>;
      catalog(catalogId: string): {
        readonly catalogId: string;
        readonly title: string;
        readonly remoteRevision: number;
        readonly origin: CatalogPersistenceEnvelope['origin'];
        readonly pageCount: number;
        readonly objectTypes: readonly string[];
        readonly structuralIds: readonly string[];
        readonly equivalence: string;
      } | null;
      armAmbiguousCreate(): void;
      ambiguousCreateEvidence(): ReturnType<BrowserLibraryRepository['ambiguousCreateEvidence']>;
    };
  }
}

window.__W3E_LIBRARY_PROOF__ = {
  ids: IDS,
  state: () => ({
    lastOpenedCatalogId,
    lastCanonicalOpen,
    activeTitles: [...repository.records.values()].filter((item) => !item.archivedAt).map((item) => item.title),
    archivedTitles: [...repository.records.values()].filter((item) => Boolean(item.archivedAt)).map((item) => item.title),
    listCalls: repository.listCalls,
    getCalls: repository.getCalls,
  }),
  openExact: async (catalogId) => {
    const runtime = createRuntime();
    const result = await runtime.reopenCoordinator.open(catalogId, { allowDiscardUnsaved: true });
    return result.ok ? { ok: true } : { ok: false, code: result.error.code };
  },
  editSaveReopen,
  staleSaveAfterArchive,
  seedRecovery,
  recoveryCount: async () => (await recoveryRepository.listByScope(authorityScopeId)).length,
  catalog: (catalogId) => {
    const record = repository.records.get(catalogId);
    return record
      ? {
          catalogId: record.catalogId,
          title: record.title,
          remoteRevision: record.remoteRevision,
          origin: record.origin,
          pageCount: record.documentSnapshot.pages.length,
          objectTypes: record.documentSnapshot.pages.flatMap((page) => page.objects.map((object) => object.type)),
          structuralIds: [...authoredStructuralIdentityIds(record.documentSnapshot)].sort(),
          equivalence: canonicalDocumentEquivalence(record.documentSnapshot),
        }
      : null;
  },
  armAmbiguousCreate: () => repository.armAmbiguousCreate(),
  ambiguousCreateEvidence: () => repository.ambiguousCreateEvidence(),
};

renderLibrary();
