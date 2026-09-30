import { mountVNextApp } from '@/vnext/app/bootstrap';
import { useAuthStore } from '@/stores/useAuthStore';
import { getSupabase } from '@/services/supabase.service';
import { IndexedDbRecoveryRepository } from '@/vnext/recovery/indexeddb-repository';
import { RecoveryStorageError } from '@/vnext/recovery/repository';
import { SessionRecoveryManager } from '@/vnext/recovery/session-manager';
import { VNextPersistenceRuntime } from '@/vnext/persistence';
import { DefaultAssetPersistenceBridge, type AssetRuntimeState } from '@/vnext/asset';
import type { CatalogDocument } from '@/vnext/domain';
import type { CatalogPersistenceEnvelope } from '@/vnext/persistence';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const CATALOG_ID = '33333333-3333-4333-8333-333333333333';
const MUTATION_0 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IDENTITY_KEY = 'l1-proof-identity';
const MODE_KEY = 'l1-proof-next-mode';

function documentFixture(title = 'Remote base'): CatalogDocument {
  return {
    schemaVersion: 1,
    id: CATALOG_ID,
    title,
    locale: 'pt-BR',
    style: {
      fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }],
      defaultText: {
        fontFamily: 'Noto Sans',
        fontSizePt: 10,
        lineHeight: 1.2,
        fontWeight: 400,
        color: '#172033',
      },
      palette: ['#172033'],
    },
    pages: [{ id: 'page-1', widthMm: 210, heightMm: 297, objects: [] }],
    assets: [],
  };
}

function envelope(
  document = documentFixture(),
  remoteRevision = 1,
  lastMutationId = MUTATION_0
): CatalogPersistenceEnvelope {
  return {
    catalogId: CATALOG_ID,
    remoteRevision,
    lastMutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-30T12:00:00.000Z',
    updatedAt: '2026-09-30T12:00:00.000Z',
    createdBy: A,
    updatedBy: A,
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let runtime: VNextPersistenceRuntime | undefined;
function rememberRuntime(value: VNextPersistenceRuntime): void {
  runtime = value;
}
let blockRecovery = false;
let failRecovery = false;
let recoveryStarted = deferred<void>();
let recoveryRelease = deferred<void>();
let authorityProtectionGate: Deferred<void> | undefined;
let authorityProtectionStarted = deferred<void>();
let pendingOpen: Deferred<{ data: unknown; error: null }> | undefined;
let pendingOpenStarted = deferred<void>();
let pendingAsset: Deferred<{ urls: Map<string, string>; states: Map<string, AssetRuntimeState> }> | undefined;
let pendingAssetStarted = deferred<void>();
let pendingSave: Deferred<{ data: unknown; error: null }> | undefined;
let pendingSaveStarted = deferred<void>();
let saveCount = 0;
let getCount = 0;
let saveRequest: Record<string, unknown> | undefined;

const armedMode = sessionStorage.getItem(MODE_KEY);
sessionStorage.removeItem(MODE_KEY);
if (armedMode === 'pending-open') pendingOpen = deferred<{ data: unknown; error: null }>();
if (armedMode === 'pending-asset') pendingAsset = deferred();

const originalRegister = VNextPersistenceRuntime.prototype.registerAuthoringBarrier;
VNextPersistenceRuntime.prototype.registerAuthoringBarrier = function(openSessionId, barrier) {
  rememberRuntime(this);
  return originalRegister.call(this, openSessionId, barrier);
};

const originalProtectCurrent = SessionRecoveryManager.prototype.protectCurrent;
SessionRecoveryManager.prototype.protectCurrent = async function() {
  if (authorityProtectionGate) {
    authorityProtectionStarted.resolve();
    await authorityProtectionGate.promise;
    authorityProtectionGate = undefined;
  }
  return originalProtectCurrent.call(this);
};

const originalPut = IndexedDbRecoveryRepository.prototype.putIfNewer;
IndexedDbRecoveryRepository.prototype.putIfNewer = async function(record) {
  if (failRecovery) {
    throw new RecoveryStorageError('STORAGE_UNAVAILABLE', 'L1 controlled IndexedDB failure');
  }
  if (blockRecovery) {
    recoveryStarted.resolve();
    await recoveryRelease.promise;
    blockRecovery = false;
  }
  return originalPut.call(this, record);
};

DefaultAssetPersistenceBridge.prototype.resolveDocumentAssets = async function() {
  if (pendingAsset) {
    pendingAssetStarted.resolve();
    return pendingAsset.promise;
  }
  return { urls: new Map<string, string>(), states: new Map<string, AssetRuntimeState>() };
};

function scopeFor(identity: string): string {
  const deployment = import.meta.env.VITE_SUPABASE_URL || window.location.origin;
  return JSON.stringify(['catalog-builder-vnext', deployment, window.location.origin, identity]);
}

function activeIdentity(): string {
  return sessionStorage.getItem(IDENTITY_KEY) || A;
}

function installAuth(identity: string): void {
  useAuthStore.setState({
    status: 'authenticated',
    userId: identity,
    role: 'editor',
    email: identity + '@proof.local',
    errorMessage: null,
    initialize: async () => {},
    retryProfile: async () => {},
    signOut: async () => {
      useAuthStore.setState({
        status: 'unauthenticated',
        userId: null,
        role: null,
        email: null,
        errorMessage: null,
      });
    },
  });
}

function controlledRpc(functionName: string, args: Record<string, unknown> = {}) {
  if (functionName === 'get_vnext_catalog_v1') {
    getCount += 1;
    if (pendingOpen) {
      pendingOpenStarted.resolve();
      return pendingOpen.promise;
    }
    return Promise.resolve({ data: envelope(), error: null });
  }
  if (functionName === 'save_vnext_catalog_cas_v1') {
    saveCount += 1;
    saveRequest = args;
    if (pendingSave) {
      pendingSaveStarted.resolve();
      return pendingSave.promise;
    }
    const document = args.p_document_snapshot as CatalogDocument;
    const expected = args.p_expected_remote_revision as number;
    const mutationId = args.p_mutation_id as string;
    return Promise.resolve({
      data: envelope(document, expected + 1, mutationId),
      error: null,
    });
  }
  if (functionName === 'list_vnext_catalogs_v1') {
    return Promise.resolve({ data: [], error: null });
  }
  return Promise.resolve({
    data: null,
    error: { code: 'L1_PROOF_UNEXPECTED_RPC', message: functionName },
  });
}

const supabase = getSupabase();
if (!supabase) throw new Error('L1 proof requires controlled Supabase env');
(supabase as unknown as {
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}).rpc = controlledRpc;

interface RecoveryView {
  status: string;
  title?: string;
  authorityScopeId: string;
  openSessionId: string;
  generation?: number;
  pendingMutationId?: string;
}

async function recoveryFor(identity: string): Promise<RecoveryView[]> {
  const repository = new IndexedDbRecoveryRepository();
  const rows = await repository.listByScope(scopeFor(identity));
  return rows.map((entry) => entry.status === 'VALID'
    ? {
        status: entry.status,
        title: entry.record.documentSnapshot.title,
        authorityScopeId: entry.record.authorityScopeId,
        openSessionId: entry.record.openSessionId,
        generation: entry.record.recoveryGeneration,
        pendingMutationId: entry.record.pendingRemoteMutation?.mutationId,
      }
    : {
        status: entry.status,
        authorityScopeId: entry.key.authorityScopeId,
        openSessionId: entry.key.openSessionId,
      });
}

declare global {
  interface Window {
    __L1_PROOF__: {
      A: string;
      B: string;
      catalogId: string;
      setNextIdentity(identity: string): void;
      loseAuthority(): void;
      runtimeState(): unknown;
      editTitle(title: string): void;
      save(): Promise<unknown>;
      blockRecovery(): void;
      waitRecoveryStarted(): Promise<void>;
      releaseRecovery(): void;
      failRecovery(enabled: boolean): void;
      blockAuthorityProtection(): void;
      waitAuthorityProtectionStarted(): Promise<void>;
      releaseAuthorityProtection(): void;
      beginPendingOpen(): void;
      waitPendingOpenStarted(): Promise<void>;
      resolvePendingOpen(title?: string): void;
      beginPendingAsset(): void;
      waitPendingAssetStarted(): Promise<void>;
      resolvePendingAsset(): void;
      beginPendingSave(): void;
      waitPendingSaveStarted(): Promise<void>;
      resolvePendingSave(): void;
      recoveryFor(identity: string): Promise<RecoveryView[]>;
      rpcState(): unknown;
    };
  }
}

window.__L1_PROOF__ = {
  A,
  B,
  catalogId: CATALOG_ID,
  setNextIdentity(identity) {
    sessionStorage.setItem(IDENTITY_KEY, identity);
    installAuth(identity);
  },
  loseAuthority() {
    useAuthStore.setState({
      status: 'unauthenticated',
      userId: null,
      role: null,
      email: null,
      errorMessage: null,
    });
  },
  runtimeState() {
    if (!runtime) return null;
    const snapshot = runtime.workspace.getSnapshot();
    return {
      title: snapshot.session.getSnapshot().document.title,
      dirty: snapshot.dirty,
      phase: snapshot.save.phase,
      localProtection: snapshot.localProtection,
      activeAuthorityScopeId: snapshot.activeAuthorityScopeId,
      bindingAuthorityScopeId: snapshot.binding.authorityScopeId,
      bindingAuthLineage: snapshot.binding.authLineage,
      openSessionId: snapshot.binding.openSessionId,
    };
  },
  editTitle(title) {
    if (!runtime) throw new Error('Runtime not mounted');
    runtime.workspace.getSnapshot().session.execute({ type: 'document.rename', title });
  },
  save() {
    if (!runtime) throw new Error('Runtime not mounted');
    return runtime.manualSave();
  },
  blockRecovery() {
    blockRecovery = true;
    recoveryStarted = deferred<void>();
    recoveryRelease = deferred<void>();
  },
  waitRecoveryStarted() {
    return recoveryStarted.promise;
  },
  releaseRecovery() {
    recoveryRelease.resolve();
  },
  failRecovery(enabled) {
    failRecovery = enabled;
  },
  blockAuthorityProtection() {
    authorityProtectionGate = deferred<void>();
    authorityProtectionStarted = deferred<void>();
  },
  waitAuthorityProtectionStarted() {
    return authorityProtectionStarted.promise;
  },
  releaseAuthorityProtection() {
    authorityProtectionGate?.resolve();
  },
  beginPendingOpen() {
    sessionStorage.setItem(MODE_KEY, 'pending-open');
    pendingOpenStarted = deferred<void>();
  },
  waitPendingOpenStarted() {
    return pendingOpenStarted.promise;
  },
  resolvePendingOpen(title = 'Late open') {
    pendingOpen?.resolve({ data: envelope(documentFixture(title)), error: null });
    pendingOpen = undefined;
  },
  beginPendingAsset() {
    sessionStorage.setItem(MODE_KEY, 'pending-asset');
    pendingAssetStarted = deferred<void>();
  },
  waitPendingAssetStarted() {
    return pendingAssetStarted.promise;
  },
  resolvePendingAsset() {
    pendingAsset?.resolve({ urls: new Map<string, string>(), states: new Map<string, AssetRuntimeState>() });
    pendingAsset = undefined;
  },
  beginPendingSave() {
    pendingSave = deferred<{ data: unknown; error: null }>();
    pendingSaveStarted = deferred<void>();
  },
  waitPendingSaveStarted() {
    return pendingSaveStarted.promise;
  },
  resolvePendingSave() {
    if (!pendingSave || !saveRequest) throw new Error('No pending save');
    const document = saveRequest.p_document_snapshot as CatalogDocument;
    const expected = saveRequest.p_expected_remote_revision as number;
    const mutationId = saveRequest.p_mutation_id as string;
    pendingSave.resolve({ data: envelope(document, expected + 1, mutationId), error: null });
    pendingSave = undefined;
  },
  recoveryFor,
  rpcState() {
    return { saveCount, getCount, saveRequest };
  },
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing L1 proof root');

if (window.location.pathname === '/v2') {
  installAuth(activeIdentity());
  void mountVNextApp(root);
} else {
  root.innerHTML = '<main data-l1-proof-root><h1>L1 controlled root</h1></main>';
}
