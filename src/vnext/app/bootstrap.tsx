import React from 'react';
import ReactDOM from 'react-dom/client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import {
  createDocumentSession,
  createStaticPageTemplateRegistry,
  type ApplicationExecutionDependencies,
} from '../application';
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
  return session?.user.id ?? 'anonymous';
}

function activeV2Url(runtime: VNextPersistenceRuntime): string {
  const binding = runtime.workspace.getSnapshot().binding;
  return binding.kind === 'PERSISTED'
    ? `/v2?catalog=${encodeURIComponent(binding.catalogId)}`
    : '/v2';
}

export async function mountVNextApp(root: HTMLElement): Promise<void> {
  const applicationDependencies: ApplicationExecutionDependencies = {
    createId: createBrowserId,
    templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]),
  };
  const initialSession = createDocumentSession(
    createW2CDemoDocument(createBrowserId),
    applicationDependencies
  );
  const supabase = getVNextSupabaseClient();
  const repository: CatalogRepository = supabase
    ? new SupabaseCatalogRepository(vnextRpcClientFromSupabase(supabase))
    : unavailableRepository();

  const authSession = supabase ? (await supabase.auth.getSession()).data.session : null;
  let authEpoch = 0;
  let activeIdentity = authIdentity(authSession);
  const lineage = () => `${activeIdentity}:${authEpoch}`;

  const runtime = new VNextPersistenceRuntime({
    session: initialSession,
    repository,
    applicationDependencies,
    createMutationId: createBrowserId,
    createOpenSessionId: createBrowserId,
    authLineage: lineage(),
    assetUrls: resolveKnownW2CDemoAssetUrls(initialSession.getSnapshot().document),
    resolveAssetUrls: resolveKnownW2CDemoAssetUrls,
  });

  const requestedCatalogId = new URLSearchParams(window.location.search).get('catalog');
  if (requestedCatalogId) {
    const opened = await runtime.reopenCoordinator.open(
      requestedCatalogId,
      { allowDiscardUnsaved: true }
    );
    if (!opened.ok) {
      runtime.workspace.setPhase(
        opened.error.code === 'UNAUTHORIZED' ? 'unauthorized' : 'unavailable',
        opened.error.message ?? 'Não foi possível abrir o catálogo solicitado.'
      );
    }
  }

  if (supabase) {
    supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession: Session | null) => {
      const nextIdentity = authIdentity(nextSession);
      if (
        event !== 'INITIAL_SESSION'
        && (nextIdentity !== activeIdentity || event === 'SIGNED_IN' || event === 'SIGNED_OUT')
      ) {
        authEpoch += 1;
      }
      activeIdentity = nextIdentity;
      runtime.updateAuthLineage(lineage());
    });
  }

  window.addEventListener('beforeunload', (event) => {
    const snapshot = runtime.workspace.getSnapshot();
    if (!snapshot.dirty && !runtime.saveCoordinator.hasUnresolvedActiveMutation()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.addEventListener('popstate', () => {
    const targetCatalogId = new URLSearchParams(window.location.search).get('catalog');
    const active = runtime.workspace.getSnapshot().binding;
    if (!targetCatalogId) {
      if (active.kind === 'PERSISTED') {
        window.history.replaceState(null, '', activeV2Url(runtime));
      }
      return;
    }
    if (active.kind === 'PERSISTED' && active.catalogId === targetCatalogId) return;
    void runtime.reopenCoordinator.open(targetCatalogId).then((result) => {
      if (result.ok) return;
      window.history.replaceState(null, '', activeV2Url(runtime));
    });
  });

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <VNextApp runtime={runtime} />
    </React.StrictMode>
  );
}
