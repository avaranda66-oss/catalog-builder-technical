import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { CatalogLibrary } from '@/vnext/app/CatalogLibrary';
import { VNextAccessResolving } from '@/vnext/app/bootstrap';
import {
  consumeTrustedV2ReturnTarget,
  currentTrustedV2ReturnTarget,
  storeTrustedV2ReturnTarget,
} from '@/components/auth/return-target';
import { useAuthStore, type AuthStatus } from '@/stores/useAuthStore';
import type { CatalogLibraryService } from '@/vnext/library';
import type { CatalogListItem } from '@/vnext/persistence';

type ControlledAuth = 'unauthenticated' | 'loading-hold' | 'authorized' | 'forbidden';
type RepositoryMode = 'empty' | 'populated' | 'list-error';

const AUTH_KEY = 'pilot-b-proof-auth';
const REPOSITORY_KEY = 'pilot-b-proof-repository';
const CATALOG_ID = '11111111-1111-4111-8111-111111111111';

const catalogItem: CatalogListItem = {
  catalogId: CATALOG_ID,
  remoteRevision: 1,
  title: 'Catálogo PILOT.B',
  locale: 'pt-BR',
  createdAt: '2026-09-29T12:00:00.000Z',
  updatedAt: '2026-09-29T12:00:00.000Z',
  createdBy: 'proof-user',
  updatedBy: 'proof-user',
  archivedAt: null,
  documentSchemaVersion: 1,
};

function authMode(): ControlledAuth {
  const value = sessionStorage.getItem(AUTH_KEY);
  return value === 'loading-hold' || value === 'authorized' || value === 'forbidden'
    ? value
    : 'unauthenticated';
}

function repositoryMode(): RepositoryMode {
  const value = sessionStorage.getItem(REPOSITORY_KEY);
  return value === 'populated' || value === 'list-error' ? value : 'empty';
}

function rememberTarget(): void {
  const target = currentTrustedV2ReturnTarget();
  if (target) storeTrustedV2ReturnTarget(target);
}

function toRoot(): void {
  rememberTarget();
  window.location.replace('/');
}

async function controlledSignOut(): Promise<void> {
  rememberTarget();
  sessionStorage.setItem(AUTH_KEY, 'unauthenticated');
  useAuthStore.setState({
    status: 'unauthenticated',
    userId: null,
    role: null,
    email: null,
    errorMessage: null,
  });
  window.location.replace('/');
}

function installRootAuthState(mode: ControlledAuth): void {
  const status: AuthStatus = mode === 'forbidden' ? 'forbidden' : 'unauthenticated';
  useAuthStore.setState({
    status,
    userId: null,
    role: null,
    email: null,
    errorMessage: status === 'forbidden'
      ? 'Seu acesso ainda não foi liberado. Fale com o administrador do sistema.'
      : null,
    initialize: async () => {},
    retryProfile: async () => {},
    signOut: controlledSignOut,
  });
}

function createService(mode: RepositoryMode): CatalogLibraryService {
  return {
    list: async () => {
      if (mode === 'list-error') {
        return { ok: false, error: { code: 'REMOTE_FAILURE' as const } };
      }
      return { ok: true, value: mode === 'populated' ? [catalogItem] : [] };
    },
    listStarters: () => [],
    getCreateState: () => 'idle',
    createBlank: async () => ({ ok: false, error: { code: 'REMOTE_FAILURE' as const } }),
  } as unknown as CatalogLibraryService;
}

function AuthorizedLibrary({ mode }: { readonly mode: RepositoryMode }) {
  const service = React.useMemo(() => createService(mode), [mode]);
  return (
    <CatalogLibrary
      service={service}
      onOpen={(catalogId) => window.location.assign(`/v2?catalog=${catalogId}`)}
      onSignOut={controlledSignOut}
      onUnauthorized={toRoot}
    />
  );
}

function ProofApp() {
  const mode = authMode();
  const repoMode = repositoryMode();
  const catalogId = new URLSearchParams(window.location.search).get('catalog');

  if (window.location.pathname === '/v2') {
    if (mode === 'loading-hold') return <VNextAccessResolving />;
    if (mode === 'unauthenticated' || mode === 'forbidden') {
      toRoot();
      return <VNextAccessResolving />;
    }
    if (catalogId) {
      return (
        <main data-opened-catalog={catalogId}>
          <h1>Catálogo aberto</h1>
          <button type="button" onClick={() => window.location.assign('/v2')}>Catálogos</button>
        </main>
      );
    }
    return <AuthorizedLibrary mode={repoMode} />;
  }

  if (mode === 'authorized') {
    const target = consumeTrustedV2ReturnTarget();
    if (target) {
      window.location.replace(target);
      return <VNextAccessResolving />;
    }
  }

  installRootAuthState(mode);
  return <App />;
}

const mount = document.getElementById('root');
if (!mount) throw new Error('Missing PILOT.B proof root');

ReactDOM.createRoot(mount).render(<ProofApp />);

declare global {
  interface Window {
    __PILOT_B_PROOF__: {
      setAuth(mode: ControlledAuth): void;
      setRepository(mode: RepositoryMode): void;
      authenticate(): void;
      returnTarget(): string | null;
      catalogId: string;
    };
  }
}

window.__PILOT_B_PROOF__ = {
  setAuth(mode) {
    sessionStorage.setItem(AUTH_KEY, mode);
  },
  setRepository(mode) {
    sessionStorage.setItem(REPOSITORY_KEY, mode);
  },
  authenticate() {
    sessionStorage.setItem(AUTH_KEY, 'authorized');
    const target = consumeTrustedV2ReturnTarget() ?? '/v2';
    window.location.replace(target);
  },
  returnTarget() {
    return sessionStorage.getItem('catalog-builder.auth-return.v1');
  },
  catalogId: CATALOG_ID,
};
