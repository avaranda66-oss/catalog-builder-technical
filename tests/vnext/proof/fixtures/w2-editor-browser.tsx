import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createDocumentSession,
  createStaticPageTemplateRegistry,
  type ApplicationExecutionDependencies,
} from '@/vnext/application';
import { createW2CDemoDocument, resolveKnownW2CDemoAssetUrls } from '@/vnext/app/editor-defaults';
import { W2E_PAGE_TEMPLATE } from '@/vnext/app/page-template-fixtures';
import { VNextApp } from '@/vnext/app/VNextApp';
import {
  VNextPersistenceRuntime,
  type CatalogRepository,
  type PersistenceResult,
} from '@/vnext/persistence';

function createBrowserId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

function unavailable<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({
    ok: false,
    error: { code: 'OFFLINE', message: 'Remote persistence is unavailable in editor regression proof' },
  });
}

const repository: CatalogRepository = {
  listCatalogs: () => unavailable(),
  getCatalog: () => unavailable(),
  createCatalog: () => unavailable(),
  saveCAS: () => unavailable(),
  archiveCAS: () => unavailable(),
};

const applicationDependencies: ApplicationExecutionDependencies = {
  createId: createBrowserId,
  templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]),
};
const session = createDocumentSession(
  createW2CDemoDocument(createBrowserId),
  applicationDependencies
);
const runtime = new VNextPersistenceRuntime({
  session,
  repository,
  applicationDependencies,
  createMutationId: createBrowserId,
  createOpenSessionId: createBrowserId,
  authLineage: 'proof-user:0',
  authorityScopeId: 'proof:w2-editor',
  assetUrls: resolveKnownW2CDemoAssetUrls(session.getSnapshot().document),
  resolveAssetUrls: resolveKnownW2CDemoAssetUrls,
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing VNext editor proof root');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get('demo') === '1'
      ? <VNextApp session={session} />
      : <VNextApp runtime={runtime} />}
  </React.StrictMode>
);
