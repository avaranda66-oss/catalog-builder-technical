import React from 'react';
import ReactDOM from 'react-dom/client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import {
  createDocumentSession,
  createStaticPageTemplateRegistry,
  type ApplicationExecutionDependencies,
} from '../application';
import {
  CatalogLibraryService,
  createDefaultCatalogStarterRegistry,
  type CatalogLibraryFailureCode,
} from '../library';
import {
  SupabaseCatalogRepository,
  VNextPersistenceRuntime,
  type CatalogRepository,
  type PersistenceResult,
} from '../persistence';
import {
  getVNextSupabaseClient,
  vnextRpcClientFromSupabase,
} from '../persistence/supabase-client';
import type { CatalogDocument } from '../domain';
import {
  DefaultAssetPersistenceBridge,
  SupabaseAssetRepository,
  supabaseStorageClientFromSupabase,
  type AssetRuntimeState,
  type AssetLineageContext,
} from '../asset';
import { IndexedDbRecoveryRepository } from '../recovery';
import {
  ANONYMOUS_AUTH_IDENTITY,
  advanceAuthLineage,
  authLineageValue,
  createAuthLineageState,
} from './auth-lineage';
import { CatalogLibrary, CatalogOpenFailure } from './CatalogLibrary';
import { createW2CDemoDocument, resolveKnownW2CDemoAssetUrls } from './editor-defaults';
import { VNextApp } from './VNextApp';
import { W2E_PAGE_TEMPLATE } from './page-template-fixtures';

function createBrowserId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

function unavailable<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({
    ok: false,
    error: { code: 'OFFLINE', message: 'Remote persistence is unavailable' },
  });
}

function unavailableRepository(): CatalogRepository {
  return {
    listCatalogs: () => unavailable(),
    getCatalog: () => unavailable(),
    createCatalog: () => unavailable(),
    saveCAS: () => unavailable(),
    archiveCAS: () => unavailable(),
  };
}

function authIdentity(session: Session | null): string {
  return session?.user.id ?? ANONYMOUS_AUTH_IDENTITY;
}

function authorityScopeId(identity: string): string {
  const deployment = import.meta.env.VITE_SUPABASE_URL || window.location.origin;
  return JSON.stringify(['catalog-builder-vnext', deployment, window.location.origin, identity]);
}

function activeV2Url(runtime: VNextPersistenceRuntime): string {
  const binding = runtime.workspace.getSnapshot().binding;
  return binding.kind === 'PERSISTED'
    ? `/v2?catalog=${encodeURIComponent(binding.catalogId)}`
    : '/v2';
}

function openFailureCode(code: string): CatalogLibraryFailureCode {
  if (code === 'REQUESTED_ID_MISMATCH') return 'ENVELOPE_MISMATCH';
  if (code === 'UNSAVED_CHANGES') return 'STALE_RESULT';
  return code as CatalogLibraryFailureCode;
}

export function attachPersistenceOnlineRetry(
  runtime: VNextPersistenceRuntime,
  target: Window = window
): () => void {
  let retry: Promise<unknown> | undefined;
  const onOnline = () => {
    const snapshot = runtime.workspace.getSnapshot();
    if (
      retry
      || !snapshot.dirty
      || (snapshot.save.phase !== 'unavailable' && snapshot.save.phase !== 'ambiguous')
    ) return;
    retry = runtime.retryRemoteSave().finally(() => {
      retry = undefined;
    });
  };
  target.addEventListener('online', onOnline);
  return () => target.removeEventListener('online', onOnline);
}

export async function mountVNextApp(root: HTMLElement): Promise<void> {
  const applicationDependencies: ApplicationExecutionDependencies = {
    createId: createBrowserId,
    templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]),
  };
  const supabase = getVNextSupabaseClient();
  const repository: CatalogRepository = supabase
    ? new SupabaseCatalogRepository(vnextRpcClientFromSupabase(supabase))
    : unavailableRepository();

  const authSession = supabase ? (await supabase.auth.getSession()).data.session : null;
  let authLineage = createAuthLineageState(authIdentity(authSession));
  const lineage = () => authLineageValue(authLineage);
  const identity = () => authLineage.identity;
  const requestedCatalogId = new URLSearchParams(window.location.search).get('catalog');

  if (!requestedCatalogId) {
    const library = new CatalogLibraryService({
      repository,
      applicationDependencies,
      createId: createBrowserId,
      createMutationId: createBrowserId,
      createOpenSessionId: createBrowserId,
      authLineage: lineage,
      authorityScopeId: () => authorityScopeId(identity()),
      starterRegistry: createDefaultCatalogStarterRegistry(),
    });
    if (supabase) {
      supabase.auth.onAuthStateChange((_event: AuthChangeEvent, nextSession: Session | null) => {
        const previousIdentity = authLineage.identity;
        const nextIdentity = authIdentity(nextSession);
        authLineage = advanceAuthLineage(authLineage, nextIdentity);
        if (nextIdentity !== previousIdentity) window.location.reload();
      });
    }
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <CatalogLibrary
          service={library}
          onOpen={(catalogId) => window.location.assign(`/v2?catalog=${encodeURIComponent(catalogId)}`)}
        />
      </React.StrictMode>
    );
    return;
  }

  const initialSession = createDocumentSession(
    createW2CDemoDocument(createBrowserId),
    applicationDependencies
  );
  const recoveryRepository = new IndexedDbRecoveryRepository();
  const assetRepository = supabase
    ? new SupabaseAssetRepository(
        vnextRpcClientFromSupabase(supabase),
        supabaseStorageClientFromSupabase(supabase.storage)
      )
    : undefined;
  let getActiveLineage: () => AssetLineageContext = () => ({
    authLineage: lineage(),
    authorityScopeId: authorityScopeId(identity()),
  });

  const assetBridge = assetRepository
    ? new DefaultAssetPersistenceBridge(assetRepository, {
        getActiveLineage: () => getActiveLineage(),
      })
    : undefined;

  const resolveAssetUrls = async (
    doc: CatalogDocument
  ): Promise<{ urls: ReadonlyMap<string, string>; states: ReadonlyMap<string, AssetRuntimeState> }> => {
    const urls = new Map<string, string>(resolveKnownW2CDemoAssetUrls(doc));
    const states = new Map<string, AssetRuntimeState>();
    if (assetBridge) {
      try {
        const resolved = await assetBridge.resolveDocumentAssets(doc, { authLineage: lineage() });
        for (const [id, url] of resolved.urls.entries()) {
          urls.set(id, url);
        }
        for (const [id, state] of resolved.states.entries()) {
          states.set(id, state);
        }
      } catch {
        // Degraded editing: remote asset failure is ephemeral runtime state
      }
    }
    return { urls, states };
  };

  const runtime = new VNextPersistenceRuntime({
    session: initialSession,
    repository,
    applicationDependencies,
    createMutationId: createBrowserId,
    createOpenSessionId: createBrowserId,
    authLineage: lineage(),
    authorityScopeId: authorityScopeId(identity()),
    recoveryRepository,
    autosave: {},
    assetUrls: resolveKnownW2CDemoAssetUrls(initialSession.getSnapshot().document),
    resolveAssetUrls,
  });

  getActiveLineage = (): AssetLineageContext => {
    const snapshot = runtime.workspace.getSnapshot();
    return {
      authLineage: lineage(),
      authorityScopeId: authorityScopeId(identity()),
      openSessionId: snapshot.binding.openSessionId,
      catalogId: snapshot.binding.kind === 'PERSISTED' ? snapshot.binding.catalogId : undefined,
    };
  };

  let authorityInvalidated = false;
  let detachOnlineRetry: (() => void) | undefined;
  if (supabase) {
    supabase.auth.onAuthStateChange((_event: AuthChangeEvent, nextSession: Session | null) => {
      const previousIdentity = authLineage.identity;
      const nextIdentity = authIdentity(nextSession);
      authLineage = advanceAuthLineage(authLineage, nextIdentity);
      runtime.updateAuthContext(lineage(), authorityScopeId(nextIdentity));
      if (nextIdentity === previousIdentity) return;
      authorityInvalidated = true;
      detachOnlineRetry?.();
      void runtime.dispose();
      root.replaceChildren();
      window.location.reload();
    });
  }

  if (authorityInvalidated) return;

  const opened = await runtime.reopenCoordinator.open(
    requestedCatalogId,
    { allowDiscardUnsaved: true }
  );
  if (authorityInvalidated) return;
  if (!opened.ok) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <CatalogOpenFailure
          code={openFailureCode(opened.error.code)}
          onBack={() => window.location.assign('/v2')}
        />
      </React.StrictMode>
    );
    return;
  }

  void navigator.storage?.persist?.().catch(() => false);

  window.addEventListener('beforeunload', (event) => {
    const snapshot = runtime.workspace.getSnapshot();
    if (!snapshot.dirty && !runtime.saveCoordinator.hasUnresolvedActiveMutation()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  detachOnlineRetry = attachPersistenceOnlineRetry(runtime);
  window.addEventListener('pagehide', () => {
    detachOnlineRetry?.();
    void runtime.dispose();
  }, { once: true });

  window.addEventListener('popstate', () => {
    const targetCatalogId = new URLSearchParams(window.location.search).get('catalog');
    const snapshot = runtime.workspace.getSnapshot();
    const active = snapshot.binding;
    if (active.kind === 'PERSISTED' && targetCatalogId === active.catalogId) return;
    if (snapshot.dirty || runtime.saveCoordinator.hasUnresolvedActiveMutation()) {
      window.history.replaceState(null, '', activeV2Url(runtime));
      runtime.workspace.setPhase('blocked', 'Salve suas alterações antes de sair deste catálogo.');
      return;
    }
    window.location.reload();
  });

  const requestLibrary = () => {
    const snapshot = runtime.workspace.getSnapshot();
    if (snapshot.dirty || runtime.saveCoordinator.hasUnresolvedActiveMutation()) {
      runtime.workspace.setPhase('blocked', 'Salve suas alterações antes de voltar aos catálogos.');
      return;
    }
    window.location.assign('/v2');
  };

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <VNextApp
        runtime={runtime}
        assetBridge={assetBridge}
        onRequestLibrary={requestLibrary}
      />
    </React.StrictMode>
  );
}
