import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createDocumentSession,
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
} from '../persistence';
import { vnextRpcClientFromSupabase } from '../persistence/supabase-client';
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
  authLineageValue,
  createAuthLineageState,
} from './auth-lineage';
import { CatalogLibrary, CatalogOpenFailure } from './CatalogLibrary';
import { createW2CDemoDocument, resolveKnownW2CDemoAssetUrls } from './editor-defaults';
import { VNextApp } from './VNextApp';
import { createPresysPageTemplateRegistry } from '../library/presys-ta25n-starter';
import { DefaultStarterDependencyPreparer, bindPresysPageReuse } from '../library/starter-dependencies';
import { getSupabase } from '../../services/supabase.service';
import { useAuthStore } from '../../stores/useAuthStore';
import { TranslationFoundationService, VNextTranslationGatewayClient, vnextTranslationGatewayInvokeFromFunctionsClient } from '../translation';
import { TranslationReviewCoordinator } from '../translation/review-coordinator';
import {
  currentTrustedV2ReturnTarget,
  storeTrustedV2ReturnTarget,
} from '../../components/auth/return-target';

function createBrowserId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
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

function rememberCurrentV2Target(): void {
  const target = currentTrustedV2ReturnTarget();
  if (target) storeTrustedV2ReturnTarget(target);
}

function replaceWithCanonicalRoot(): void {
  rememberCurrentV2Target();
  window.location.replace('/');
}

const AUTHORITY_LOSS_BOUNDARY_ID = 'vnext-authority-loss-boundary';

function showAuthorityLossBoundary(
  root: HTMLElement,
  state: 'protecting' | 'protection-failed',
  message: string
): void {
  root.setAttribute('inert', '');
  root.setAttribute('aria-hidden', 'true');
  root.style.display = 'none';
  // Publication lives in a body portal, outside the protected React root.
  for (const portal of document.querySelectorAll<HTMLElement>('[data-publication-host]')) {
    portal.inert = true;
    portal.setAttribute('aria-hidden', 'true');
    portal.style.display = 'none';
    portal.removeAttribute('data-print-approved');
  }

  let boundary = document.getElementById(AUTHORITY_LOSS_BOUNDARY_ID);
  if (!boundary) {
    boundary = document.createElement('main');
    boundary.id = AUTHORITY_LOSS_BOUNDARY_ID;
    boundary.className = 'vnext-access-shell';
    root.insertAdjacentElement('afterend', boundary);
  }
  boundary.setAttribute('data-vnext-access-state', state);
  boundary.replaceChildren();
  const card = document.createElement('section');
  card.className = 'vnext-access-card';
  card.setAttribute('role', state === 'protecting' ? 'status' : 'alert');
  const heading = document.createElement('h1');
  heading.textContent = state === 'protecting'
    ? 'Protegendo alterações locais…'
    : 'Proteção local não concluída';
  const body = document.createElement('p');
  body.textContent = message;
  card.append(heading, body);
  boundary.append(card);
}

export function VNextAccessResolving({ message = 'Validando acesso…' }: { readonly message?: string }) {
  return (
    <main className="vnext-access-shell" data-vnext-access-state="resolving">
      <section className="vnext-access-card" role="status">{message}</section>
    </main>
  );
}

export function VNextServerAccessUnavailable({
  onRetry,
  onSignOut,
}: {
  readonly onRetry: () => void;
  readonly onSignOut: () => void;
}) {
  return (
    <main className="vnext-access-shell" data-vnext-access-state="server-unauthorized">
      <section className="vnext-access-card">
        <h1>Acesso não disponível</h1>
        <p>Não foi possível confirmar seu acesso com o servidor. Tente novamente.</p>
        <div className="vnext-access-actions">
          <button type="button" onClick={onRetry}>Tentar novamente</button>
          <button type="button" className="is-primary" onClick={onSignOut}>Sair</button>
        </div>
      </section>
    </main>
  );
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
  const reactRoot = ReactDOM.createRoot(root);
  const renderResolving = (message?: string) => {
    reactRoot.render(
      <React.StrictMode>
        <VNextAccessResolving message={message} />
      </React.StrictMode>
    );
  };

  renderResolving();
  await useAuthStore.getState().initialize();

  const initialAuth = useAuthStore.getState();
  if (initialAuth.status !== 'authenticated' || !initialAuth.userId) {
    replaceWithCanonicalRoot();
    return;
  }

  const authorizedUserId = initialAuth.userId;
  const supabase = getSupabase();
  if (!supabase) {
    replaceWithCanonicalRoot();
    return;
  }

  const presysTemplates = createPresysPageTemplateRegistry();
  const applicationDependencies: ApplicationExecutionDependencies = {
    createId: createBrowserId,
    templateRegistry: presysTemplates,
  };
  const repository: CatalogRepository = new SupabaseCatalogRepository(
    vnextRpcClientFromSupabase(supabase)
  );
  const authLineage = createAuthLineageState(authorizedUserId);
  const lineage = () => authLineageValue(authLineage);
  const requestedCatalogId = new URLSearchParams(window.location.search).get('catalog');

  let authorityInvalidated = false;
  let revalidatingServerAccess = false;
  let runtime: VNextPersistenceRuntime | undefined;
  let detachOnlineRetry: (() => void) | undefined;
  let authorityExit: Promise<void> | undefined;

  const exitProtectedVNext = (): Promise<void> => {
    if (authorityExit) return authorityExit;
    authorityInvalidated = true;
    detachOnlineRetry?.();
    showAuthorityLossBoundary(
      root,
      'protecting',
      'A edição foi bloqueada enquanto protegemos suas alterações no Recovery local.'
    );
    const activeRuntime = runtime;
    authorityExit = (async () => {
      try {
        await activeRuntime?.protectForAuthorityLoss();
      } catch {
        showAuthorityLossBoundary(
          root,
          'protection-failed',
          'Não foi possível confirmar a proteção local. Esta aba continuará bloqueada para evitar perda ou atribuição incorreta das alterações.'
        );
        return;
      }
      unsubscribeAuth();
      replaceWithCanonicalRoot();
    })();
    return authorityExit;
  };

  const unsubscribeAuth = useAuthStore.subscribe((state) => {
    if (revalidatingServerAccess || authorityInvalidated) return;
    if (state.status !== 'authenticated' || state.userId !== authorizedUserId) {
      void exitProtectedVNext();
    }
  });
  window.addEventListener('pagehide', unsubscribeAuth, { once: true });

  const revalidateAfterServerUnauthorized = async () => {
    if (authorityInvalidated || revalidatingServerAccess) return;
    revalidatingServerAccess = true;
    renderResolving();
    await useAuthStore.getState().initialize();
    const nextAuth = useAuthStore.getState();
    revalidatingServerAccess = false;

    if (nextAuth.status !== 'authenticated' || nextAuth.userId !== authorizedUserId) {
      await exitProtectedVNext();
      return;
    }

    reactRoot.render(
      <React.StrictMode>
        <VNextServerAccessUnavailable
          onRetry={() => {
            void (async () => {
              revalidatingServerAccess = true;
              renderResolving();
              await useAuthStore.getState().initialize();
              const retryAuth = useAuthStore.getState();
              revalidatingServerAccess = false;
              if (retryAuth.status !== 'authenticated' || retryAuth.userId !== authorizedUserId) {
                await exitProtectedVNext();
                return;
              }
              window.location.reload();
            })();
          }}
          onSignOut={() => { void useAuthStore.getState().signOut(); }}
        />
      </React.StrictMode>
    );
  };

  const assetRepository = new SupabaseAssetRepository(
    vnextRpcClientFromSupabase(supabase),
    supabaseStorageClientFromSupabase(supabase.storage)
  );
  let getActiveLineage: () => AssetLineageContext = () => ({
    authLineage: lineage(),
    authorityScopeId: authorityScopeId(authorizedUserId),
  });
  const assetBridge = new DefaultAssetPersistenceBridge(assetRepository, {
    getActiveLineage: () => authorityInvalidated ? { authLineage: '', authorityScopeId: '' } : getActiveLineage(),
  });
  const starterDependencies = new DefaultStarterDependencyPreparer(assetBridge);

  if (!requestedCatalogId) {
    const library = new CatalogLibraryService({
      repository,
      applicationDependencies,
      createId: createBrowserId,
      createMutationId: createBrowserId,
      createOpenSessionId: createBrowserId,
      authLineage: () => authorityInvalidated ? '' : lineage(),
      authorityScopeId: () => authorityInvalidated ? '' : authorityScopeId(authorizedUserId),
      starterRegistry: createDefaultCatalogStarterRegistry(),
      starterDependencies,
    });

    reactRoot.render(
      <React.StrictMode>
        <CatalogLibrary
          service={library}
          onOpen={(catalogId) => window.location.assign(`/v2?catalog=${encodeURIComponent(catalogId)}`)}
          onSignOut={() => useAuthStore.getState().signOut()}
          onUnauthorized={revalidateAfterServerUnauthorized}
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
  const resolveAssetUrls = async (
    doc: CatalogDocument
  ): Promise<{ urls: ReadonlyMap<string, string>; states: ReadonlyMap<string, AssetRuntimeState> }> => {
    const urls = new Map<string, string>(resolveKnownW2CDemoAssetUrls(doc));
    const states = new Map<string, AssetRuntimeState>();
    try {
      const resolved = await assetBridge.resolveDocumentAssets(doc, { authLineage: lineage() });
      for (const [id, url] of resolved.urls.entries()) urls.set(id, url);
      for (const [id, state] of resolved.states.entries()) states.set(id, state);
    } catch {
      // Degraded editing: remote asset failure is ephemeral runtime state.
    }
    return { urls, states };
  };

  runtime = new VNextPersistenceRuntime({
    session: initialSession,
    repository,
    applicationDependencies,
    createMutationId: createBrowserId,
    createOpenSessionId: createBrowserId,
    authLineage: lineage(),
    authorityScopeId: authorityScopeId(authorizedUserId),
    recoveryRepository,
    autosave: {},
    assetUrls: resolveKnownW2CDemoAssetUrls(initialSession.getSnapshot().document),
    resolveAssetUrls,
  });

  getActiveLineage = (): AssetLineageContext => {
    const snapshot = runtime!.workspace.getSnapshot();
    return {
      authLineage: lineage(),
      authorityScopeId: authorityScopeId(authorizedUserId),
      openSessionId: snapshot.binding.openSessionId,
      catalogId: snapshot.binding.kind === 'PERSISTED' ? snapshot.binding.catalogId : undefined,
    };
  };

  let editorRuntimeInstalled = false;
  const installEditorRuntime = () => {
    if (!runtime || editorRuntimeInstalled || authorityInvalidated) return;
    editorRuntimeInstalled = true;

    void navigator.storage?.persist?.().catch(() => false);

    window.addEventListener('beforeunload', (event) => {
      const snapshot = runtime!.workspace.getSnapshot();
      if (!snapshot.dirty && !runtime!.saveCoordinator.hasUnresolvedActiveMutation()) return;
      event.preventDefault();
      event.returnValue = '';
    });

    detachOnlineRetry = attachPersistenceOnlineRetry(runtime);
    window.addEventListener('pagehide', () => {
      detachOnlineRetry?.();
      void runtime?.dispose();
    }, { once: true });

    window.addEventListener('popstate', () => {
      const targetCatalogId = new URLSearchParams(window.location.search).get('catalog');
      const snapshot = runtime!.workspace.getSnapshot();
      const active = snapshot.binding;
      if (active.kind === 'PERSISTED' && targetCatalogId === active.catalogId) return;
      if (snapshot.dirty || runtime!.saveCoordinator.hasUnresolvedActiveMutation()) {
        window.history.replaceState(null, '', activeV2Url(runtime!));
        runtime!.workspace.setPhase('blocked', 'Salve suas alterações antes de sair deste catálogo.');
        return;
      }
      window.location.reload();
    });

    const requestLibrary = () => {
      const snapshot = runtime!.workspace.getSnapshot();
      if (snapshot.dirty || runtime!.saveCoordinator.hasUnresolvedActiveMutation()) {
        runtime!.workspace.setPhase('blocked', 'Salve suas alterações antes de voltar aos catálogos.');
        return;
      }
      window.location.assign('/v2');
    };

    let reusableSession = runtime.workspace.getSnapshot().session;
    const bindReusableSession = () => {
      if (authorityInvalidated) return;
      reusableSession = runtime!.workspace.getSnapshot().session;
      const boundSession = reusableSession;
      bindPresysPageReuse(boundSession, {
        templates: presysTemplates,
        preparer: starterDependencies,
        getLineage: () => getActiveLineage(),
        isCurrent: () => !authorityInvalidated && runtime!.workspace.getSnapshot().session === boundSession,
        installRuntimeAsset: (asset, state) => {
          runtime!.workspace.setAssetRuntimeState(asset.id, state);
          runtime!.workspace.setAssetUrl(asset.id, state.url);
        },
      });
    };
    bindReusableSession();
    // Recovery can install a new canonical session. Bind its page UI without changing Recovery ownership.
    const detachPageReuse = runtime.workspace.subscribe(() => {
      if (runtime!.workspace.getSnapshot().session !== reusableSession) bindReusableSession();
    });
    window.addEventListener('pagehide', detachPageReuse, { once: true });
    const translation = new TranslationReviewCoordinator({
      foundation: new TranslationFoundationService(new VNextTranslationGatewayClient(vnextTranslationGatewayInvokeFromFunctionsClient(supabase))),
      repository,
      createId: createBrowserId,
      createMutationId: createBrowserId,
      authLineage: () => authorityInvalidated ? '' : lineage(),
      authorityScopeId: () => authorityInvalidated ? '' : authorityScopeId(authorizedUserId),
      getSource: () => {
        if (authorityInvalidated || !runtime) return undefined;
        const source = runtime.workspace.getSnapshot();
        const binding = source.binding;
        if (binding.kind !== 'PERSISTED' || source.dirty || source.save.phase !== 'idle' || runtime.saveCoordinator.hasUnresolvedActiveMutation()) return undefined;
        return { document: source.session.getSnapshot().document, remoteRevision: binding.remoteRevision,
          openSessionId: binding.openSessionId, authLineage: lineage(), authorityScopeId: authorityScopeId(authorizedUserId) };
      },
    });
    window.addEventListener('pagehide', () => { translation.cancel(); }, { once: true });
    reactRoot.render(
      <React.StrictMode>
        <VNextApp
          runtime={runtime}
          assetBridge={assetBridge}
          simpleByDefault
          onRequestLibrary={requestLibrary}
          translation={translation}
          onOpenTranslatedCopy={catalogId => window.location.assign(`/v2?catalog=${encodeURIComponent(catalogId)}`)}
          getPublicationSource={() => {
            if (authorityInvalidated || !runtime) return undefined;
            const source = runtime.workspace.getSnapshot(), binding = source.binding;
            if (binding.kind !== 'PERSISTED' || source.dirty || source.save.phase !== 'idle' || runtime.saveCoordinator.hasUnresolvedActiveMutation()) return undefined;
            return { document: source.session.getSnapshot().document, remoteRevision: binding.remoteRevision,
              openSessionId: binding.openSessionId, authLineage: lineage(), authorityScopeId: authorityScopeId(authorizedUserId), assetUrls: source.assetUrls };
          }}
        />
      </React.StrictMode>
    );
  };

  const openRequestedCatalog = async () => {
    if (!runtime || authorityInvalidated) return;
    renderResolving('Abrindo catálogo…');
    const opened = await runtime.reopenCoordinator.open(
      requestedCatalogId,
      { allowDiscardUnsaved: true }
    );
    if (authorityInvalidated) return;

    if (!opened.ok) {
      const code = openFailureCode(opened.error.code);
      if (code === 'UNAUTHORIZED') {
        await revalidateAfterServerUnauthorized();
        return;
      }
      const retryable = code === 'OFFLINE' || code === 'REMOTE_FAILURE';
      reactRoot.render(
        <React.StrictMode>
          <CatalogOpenFailure
            code={code}
            onBack={() => window.location.assign('/v2')}
            onRetry={retryable ? () => { void openRequestedCatalog(); } : undefined}
          />
        </React.StrictMode>
      );
      return;
    }

    installEditorRuntime();
  };

  await openRequestedCatalog();
}
