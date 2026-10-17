// Harness "father-journeys": réplica do modo de produção (src/vnext/app/bootstrap.tsx) com
// persistência LOCAL. Sem Supabase, sem login, sem rede.
//
// O que é igual à produção: CatalogLibrary com o registro padrão de modelos e o preparador de
// dependências; VNextApp com simpleByDefault; ponte de imagens (DefaultAssetPersistenceBridge);
// recuperação em IndexedDB; autosave padrão; aviso ao fechar a aba com trabalho não salvo;
// "Meus catálogos" só sai depois de um salvamento verificado; reaproveitamento de páginas PRESYS;
// TranslationReviewCoordinator; getPublicationSource; navegação por recarga de página
// (biblioteca -> ?catalog=<id> -> biblioteca), como /v2 faz.
//
// O que é falso/local: o "servidor" é o localStorage desta origem (compartilhado entre abas e
// entre os dois "funcionários" ?user=A|B); as imagens ficam em memória + localStorage; a IA é um
// composer falso que nunca pede chave; a tradução usa o ControlledTranslationProvider (resposta
// padrão "EN: ..."/"ES: ...").
//
// Parâmetros de URL:
//   ?db=<nome>        nome do banco de recuperação (IndexedDB). Padrão: catalog_builder_vnext_father_journeys
//   ?user=A|B         identidade do funcionário (lineage + authority scope). Padrão: A
//   ?ia=limite|off    IA: limite diário atingido (429 AGENT_DAILY_BUDGET_EXCEEDED) | servidor sem IA
//                     (503 PROVIDER_NOT_CONFIGURED). Sem o parâmetro, a IA responde uma proposta.
//   ?catalog=<id>     abre o editor direto neste catálogo (como /v2?catalog=<id>)
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createCatalogDocument,
  createDocumentSession,
  type ApplicationExecutionDependencies,
} from '@/vnext/application';
import { CatalogLibrary, CatalogOpenFailure } from '@/vnext/app/CatalogLibrary';
import { VNextApp } from '@/vnext/app/VNextApp';
import { createSaveBeforeLibraryNavigation } from '@/vnext/app/catalog-navigation';
import {
  DefaultAssetPersistenceBridge,
  type AssetFinalizationResult,
  type AssetLineageContext,
  type AssetRecord,
  type AssetRepository,
} from '@/vnext/asset';
import type { CatalogDocument } from '@/vnext/domain';
import {
  CatalogLibraryService,
  createDefaultCatalogStarterRegistry,
  type CatalogLibraryFailureCode,
} from '@/vnext/library';
import { createPresysPageTemplateRegistry } from '@/vnext/library/presys-ta25n-starter';
import { DefaultStarterDependencyPreparer, bindPresysPageReuse } from '@/vnext/library/starter-dependencies';
import {
  VNextPersistenceRuntime,
  type ArchiveCatalogCasRequest,
  type CatalogListItem,
  type CatalogListQuery,
  type CatalogPersistenceEnvelope,
  type CatalogPersistenceMetadata,
  type CatalogRepository,
  type CreateCatalogRequest,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import { IndexedDbRecoveryRepository } from '@/vnext/recovery';
import type { PublicationSource } from '@/vnext/publication/review';
import type { NativeComposeFunctionsClient } from '@/vnext/ai-catalog/native-compose-client';
import type { ComposerErrorCode } from '@/vnext/ai-catalog/composer-codes';
import {
  ControlledTranslationProvider,
  MemoryTranslationRequestCache,
  createTranslationCenterFoundation,
} from '@/vnext/translation';
import { TranslationReviewCoordinator } from '@/vnext/translation/review-coordinator';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';

// ---------------------------------------------------------------------------------------------
// Parâmetros e identidade
// ---------------------------------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const recoveryDatabaseName = params.get('db') ?? 'catalog_builder_vnext_father_journeys';
const user: 'A' | 'B' = params.get('user') === 'B' ? 'B' : 'A';
const iaParam = params.get('ia');
const iaMode: 'ok' | 'limite' | 'off' = iaParam === 'limite' ? 'limite' : iaParam === 'off' ? 'off' : 'ok';

// Mesma forma da produção (authorityScopeId = JSON de [app, deployment, origin, identidade]).
const AUTH_LINEAGE = `father-journeys:${user}:0`;
const AUTHORITY_SCOPE_ID = JSON.stringify(['catalog-builder-vnext', 'father-journeys', window.location.origin, user]);

// O localStorage faz o papel do servidor: o prefixo NÃO depende do usuário, então A e B veem os
// mesmos catálogos (como dois funcionários da mesma empresa).
const STORAGE_PREFIX = 'father-journeys:';
const CATALOG_PREFIX = `${STORAGE_PREFIX}catalog:`;
const ASSET_RECORD_PREFIX = `${STORAGE_PREFIX}asset-record:`;
const ASSET_BYTES_PREFIX = `${STORAGE_PREFIX}asset-bytes:`;

function createUuid(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

function harnessHref(catalogId?: string): string {
  const next = new URLSearchParams();
  next.set('db', recoveryDatabaseName);
  if (user !== 'A') next.set('user', user);
  if (iaMode !== 'ok') next.set('ia', iaMode);
  if (catalogId) next.set('catalog', catalogId);
  return `${window.location.pathname}?${next.toString()}`;
}

/** Como a produção: trocar de tela é recarregar a página (/v2 <-> /v2?catalog=). */
function navigateTo(catalogId?: string): void {
  window.location.assign(harnessHref(catalogId));
}

// ---------------------------------------------------------------------------------------------
// "Servidor" local de catálogos (localStorage)
// ---------------------------------------------------------------------------------------------
const catalogKey = (catalogId: string) => `${CATALOG_PREFIX}${catalogId}`;

function readCatalog(catalogId: string): CatalogPersistenceEnvelope | undefined {
  const raw = localStorage.getItem(catalogKey(catalogId));
  return raw ? JSON.parse(raw) as CatalogPersistenceEnvelope : undefined;
}

function writeCatalog(envelope: CatalogPersistenceEnvelope): void {
  localStorage.setItem(catalogKey(envelope.catalogId), JSON.stringify(envelope));
}

function allCatalogs(): CatalogPersistenceEnvelope[] {
  const records: CatalogPersistenceEnvelope[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(CATALOG_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (raw) records.push(JSON.parse(raw) as CatalogPersistenceEnvelope);
  }
  return records;
}

function envelope(
  doc: CatalogDocument,
  remoteRevision: number,
  lastMutationId: string,
  origin?: CatalogPersistenceEnvelope['origin'],
  archivedAt: string | null = null,
  createdAt?: string
): CatalogPersistenceEnvelope {
  const now = new Date().toISOString();
  return {
    catalogId: doc.id,
    remoteRevision,
    lastMutationId,
    title: doc.title,
    locale: doc.locale,
    createdAt: createdAt ?? now,
    updatedAt: now,
    createdBy: `father-journeys:${user}`,
    updatedBy: `father-journeys:${user}`,
    archivedAt,
    ...(origin ? { origin } : {}),
    documentSchemaVersion: 1,
    documentSnapshot: doc,
  };
}

class LocalCatalogRepository implements CatalogRepository {
  saveDispatchCount = 0;
  createDispatchCount = 0;
  archiveDispatchCount = 0;
  holdSaves = false;
  private held: Array<() => void> = [];

  listCatalogs = async (query: CatalogListQuery = {}): Promise<PersistenceResult<readonly CatalogListItem[]>> => ({
    ok: true,
    value: allCatalogs()
      .filter((record) => query.includeArchived || record.archivedAt === null)
      .map(({ documentSnapshot: _document, lastMutationId: _mutation, ...item }) => item),
  });

  getCatalog = async (catalogId: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const value = readCatalog(catalogId);
    return value ? { ok: true, value } : { ok: false, error: { code: 'NOT_FOUND' } };
  };

  createCatalog = async (request: CreateCatalogRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    this.createDispatchCount += 1;
    if (readCatalog(request.documentSnapshot.id)) return { ok: false, error: { code: 'CONFLICT' } };
    const created = envelope(request.documentSnapshot, 1, request.mutationId, request.origin);
    writeCatalog(created);
    return { ok: true, value: created };
  };

  saveCAS = async (request: SaveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    this.saveDispatchCount += 1;
    if (this.holdSaves) {
      return new Promise((resolve) => {
        this.held.push(() => resolve(this.commitSave(request)));
      });
    }
    return this.commitSave(request);
  };

  /** Libera os salvamentos segurados por holdSaves(true). Devolve quantos foram liberados. */
  releaseHeld(): number {
    const pending = this.held;
    this.held = [];
    pending.forEach((run) => run());
    return pending.length;
  }

  archiveCAS = async (request: ArchiveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceMetadata>> => {
    this.archiveDispatchCount += 1;
    const current = readCatalog(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.archivedAt) return { ok: false, error: { code: 'ARCHIVED' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) return { ok: false, error: { code: 'CONFLICT' } };
    const next: CatalogPersistenceEnvelope = {
      ...current,
      remoteRevision: current.remoteRevision + 1,
      lastMutationId: request.mutationId,
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeCatalog(next);
    const { documentSnapshot: _document, ...metadata } = next;
    return { ok: true, value: metadata };
  };

  private commitSave(request: SaveCatalogCasRequest): PersistenceResult<CatalogPersistenceEnvelope> {
    const current = readCatalog(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.archivedAt) return { ok: false, error: { code: 'ARCHIVED' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) return { ok: false, error: { code: 'CONFLICT' } };
    const saved = envelope(
      request.documentSnapshot,
      current.remoteRevision + 1,
      request.mutationId,
      current.origin,
      current.archivedAt,
      current.createdAt
    );
    writeCatalog(saved);
    return { ok: true, value: saved };
  }
}

// ---------------------------------------------------------------------------------------------
// Imagens: memória + localStorage (quando couber)
// ---------------------------------------------------------------------------------------------
interface StoredAssetBytes {
  readonly mime: string;
  readonly bytes: number[];
}

const memoryBytes = new Map<string, { mime: string; bytes: Uint8Array }>();

class LocalAssetRepository implements AssetRepository {
  uploads: Array<{ storagePath: string; mime: string; size: number }> = [];
  finalized: Array<{ widthPx: number; heightPx: number; mime: string; fileSize: number; name: string }> = [];

  async finalizeAsset(input: {
    readonly assetId: string;
    readonly version: string;
    readonly sha256: string;
    readonly mime: string;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly name: string;
    readonly alt: string;
    readonly fileSize: number;
    readonly storagePath: string;
  }): Promise<AssetFinalizationResult> {
    if (localStorage.getItem(`${ASSET_RECORD_PREFIX}${input.assetId}`)) {
      return { ok: false, error: { code: 'CONFLICT', message: 'Asset already exists' } };
    }
    const record: AssetRecord = {
      id: input.assetId,
      version: '1',
      sha256: input.sha256,
      mime: input.mime as AssetRecord['mime'],
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      name: input.name,
      alt: input.alt,
      storageBucket: 'product-assets',
      storagePath: input.storagePath,
      fileSize: input.fileSize,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(`${ASSET_RECORD_PREFIX}${record.id}`, JSON.stringify(record));
    this.finalized.push({
      widthPx: input.widthPx, heightPx: input.heightPx, mime: input.mime, fileSize: input.fileSize, name: input.name,
    });
    return {
      ok: true,
      asset: {
        id: record.id,
        version: record.version,
        sha256: record.sha256,
        mime: record.mime,
        widthPx: record.widthPx,
        heightPx: record.heightPx,
        name: record.name,
        alt: record.alt,
      },
    };
  }

  async getAsset(id: string): Promise<
    { ok: true; record: AssetRecord | null }
    | { ok: false; error: { code: string; message: string } }
  > {
    const raw = localStorage.getItem(`${ASSET_RECORD_PREFIX}${id}`);
    return { ok: true, record: raw ? JSON.parse(raw) as AssetRecord : null };
  }

  async uploadBytes(storagePath: string, input: ArrayBuffer | Uint8Array, mime: string) {
    const bytes = input instanceof Uint8Array ? input.slice() : new Uint8Array(input);
    memoryBytes.set(storagePath, { mime, bytes });
    this.uploads.push({ storagePath, mime, size: bytes.byteLength });
    try {
      const stored: StoredAssetBytes = { mime, bytes: [...bytes] };
      localStorage.setItem(`${ASSET_BYTES_PREFIX}${storagePath}`, JSON.stringify(stored));
    } catch {
      // Cota do localStorage: a imagem fica só em memória nesta carga da página.
    }
    return { ok: true, storagePath };
  }

  async createSignedUrl(storagePath: string, _expiresInSeconds: number) {
    let stored = memoryBytes.get(storagePath);
    if (!stored) {
      const raw = localStorage.getItem(`${ASSET_BYTES_PREFIX}${storagePath}`);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredAssetBytes;
        stored = { mime: parsed.mime, bytes: Uint8Array.from(parsed.bytes) };
      }
    }
    if (!stored) return { ok: false, error: 'Asset bytes not found' };
    const blob = new Blob([stored.bytes.slice().buffer], { type: stored.mime });
    return { ok: true, signedUrl: URL.createObjectURL(blob) };
  }
}

// ---------------------------------------------------------------------------------------------
// IA: composer FALSO. Nunca pede chave; nunca usa rede.
// ---------------------------------------------------------------------------------------------
const composerCalls: Array<{ task: string; outcome: string }> = [];

/** Mesma forma que o supabase-js devolve para uma Edge Function com status não-2xx. */
function composerHttpFailure(code: ComposerErrorCode, status: number) {
  return {
    data: null,
    error: {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ code }), { status, headers: { 'content-type': 'application/json' } }),
    },
  };
}

const composerClient = {
  functions: {
    invoke: async (name, { body }) => {
      const task = typeof body.task === 'string' ? body.task : 'unknown';
      const record = (outcome: string) => { composerCalls.push({ task, outcome }); };
      if (name !== 'vnext-catalog-composer') {
        record('INVALID_REQUEST');
        return composerHttpFailure('INVALID_REQUEST', 400);
      }
      if (iaMode === 'limite') {
        // Mesmo código que o composer real devolve quando o orçamento diário acabou (HTTP 429).
        record('AGENT_DAILY_BUDGET_EXCEEDED');
        return composerHttpFailure('AGENT_DAILY_BUDGET_EXCEEDED', 429);
      }
      if (body.task === 'status') {
        record('OK');
        return {
          data: {
            code: 'OK',
            status: {
              enabled: true,
              mode: 'bounded-acceptance',
              serverKey: iaMode === 'ok',
              byok: false,
              remainingMicrousd: null,
              callReserveMicrousd: 7800,
            },
          },
          error: null,
        };
      }
      if (iaMode === 'off') {
        // Servidor sem chave da IA (HTTP 503), como em supabase/functions/vnext-catalog-composer.
        record('PROVIDER_NOT_CONFIGURED');
        return composerHttpFailure('PROVIDER_NOT_CONFIGURED', 503);
      }
      if (body.task === 'compose_scaffold') {
        record('proposal');
        return {
          data: {
            reply: {
              status: 'proposal',
              version: 1,
              summary: 'Estrutura de ficha técnica em três páginas, com os campos técnicos em branco para você preencher.',
              pages: [
                { type: 'cover', heading: 'Catálogo técnico PRESYS', subtitle: 'Proposta para sua revisão' },
                {
                  type: 'comparison',
                  heading: 'Ficha técnica',
                  table: {
                    columns: ['Característica', 'Modelo A', 'Modelo B'],
                    rowLabels: ['Faixa de medição', 'Exatidão', 'Conexão ao processo', 'Proteção'],
                    design: 'datasheet',
                  },
                },
                { type: 'section', heading: 'Notas de revisão', subtitle: 'Confira o manual de origem antes de preencher' },
              ],
            },
          },
          error: null,
        };
      }
      record('INVALID_REQUEST');
      return composerHttpFailure('INVALID_REQUEST', 400);
    },
  },
} as NativeComposeFunctionsClient;

// ---------------------------------------------------------------------------------------------
// Montagem (espelha mountVNextApp)
// ---------------------------------------------------------------------------------------------
const presysTemplates = createPresysPageTemplateRegistry();
const applicationDependencies: ApplicationExecutionDependencies = {
  createId: createUuid,
  templateRegistry: presysTemplates,
};
const repository = new LocalCatalogRepository();
const recoveryRepository = new IndexedDbRecoveryRepository({ databaseName: recoveryDatabaseName });
const assetRepository = new LocalAssetRepository();
const translationProvider = new ControlledTranslationProvider();

let activeRuntime: VNextPersistenceRuntime | undefined;
let activeBridge: DefaultAssetPersistenceBridge | undefined;
let activeTranslation: TranslationReviewCoordinator | undefined;
let cleanups: Array<() => void> = [];
let mode: 'library' | 'opening' | 'editor' | 'open-failed' = 'library';

const libraryBridge = new DefaultAssetPersistenceBridge(assetRepository, {
  getActiveLineage: () => ({ authLineage: AUTH_LINEAGE, authorityScopeId: AUTHORITY_SCOPE_ID }),
});
const libraryService = new CatalogLibraryService({
  repository,
  applicationDependencies,
  createId: createUuid,
  createMutationId: createUuid,
  createOpenSessionId: createUuid,
  authLineage: () => AUTH_LINEAGE,
  authorityScopeId: () => AUTHORITY_SCOPE_ID,
  starterRegistry: createDefaultCatalogStarterRegistry(),
  starterDependencies: new DefaultStarterDependencyPreparer(libraryBridge),
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing father-journeys harness root');
const renderer = ReactDOM.createRoot(root);

function Resolving({ message }: { readonly message: string }) {
  return (
    <main className="vnext-access-shell" data-vnext-access-state="resolving">
      <section className="vnext-access-card" role="status">{message}</section>
    </main>
  );
}

function openFailureCode(code: string): CatalogLibraryFailureCode {
  if (code === 'REQUESTED_ID_MISMATCH') return 'ENVELOPE_MISMATCH';
  if (code === 'UNSAVED_CHANGES') return 'STALE_RESULT';
  return code as CatalogLibraryFailureCode;
}

function activeLineage(runtime: VNextPersistenceRuntime): AssetLineageContext {
  const snapshot = runtime.workspace.getSnapshot();
  return {
    authLineage: AUTH_LINEAGE,
    authorityScopeId: AUTHORITY_SCOPE_ID,
    openSessionId: snapshot.binding.openSessionId,
    catalogId: snapshot.binding.kind === 'PERSISTED' ? snapshot.binding.catalogId : undefined,
  };
}

/** Igual ao getPublicationSource da produção: só com tudo salvo e sem mutação pendente. */
function publicationSource(runtime: VNextPersistenceRuntime): PublicationSource | undefined {
  if (activeRuntime !== runtime) return undefined;
  const source = runtime.workspace.getSnapshot();
  const binding = source.binding;
  if (binding.kind !== 'PERSISTED' || source.dirty || source.save.phase !== 'idle'
    || runtime.saveCoordinator.hasUnresolvedActiveMutation()) return undefined;
  return {
    document: source.session.getSnapshot().document,
    remoteRevision: binding.remoteRevision,
    openSessionId: binding.openSessionId,
    authLineage: AUTH_LINEAGE,
    authorityScopeId: AUTHORITY_SCOPE_ID,
    assetUrls: source.assetUrls,
  };
}

/** Cópia de attachPersistenceOnlineRetry (bootstrap.tsx) sem importar o bootstrap (que puxa Supabase). */
function attachOnlineRetry(runtime: VNextPersistenceRuntime): () => void {
  let retry: Promise<unknown> | undefined;
  const onOnline = () => {
    const snapshot = runtime.workspace.getSnapshot();
    if (retry || !snapshot.dirty
      || (snapshot.save.phase !== 'unavailable' && snapshot.save.phase !== 'ambiguous')) return;
    retry = runtime.retryRemoteSave().finally(() => { retry = undefined; });
  };
  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}

async function disposeActiveRuntime(): Promise<void> {
  const runtime = activeRuntime;
  const bridge = activeBridge;
  const translation = activeTranslation;
  const pending = cleanups;
  activeRuntime = undefined;
  activeBridge = undefined;
  activeTranslation = undefined;
  cleanups = [];
  translation?.cancel();
  for (const cleanup of pending) cleanup();
  if (runtime) await runtime.dispose();
  bridge?.revokeObjectURLs();
}

function renderLibrary(): void {
  mode = 'library';
  renderer.render(
    <React.StrictMode>
      <CatalogLibrary service={libraryService} onOpen={(catalogId) => navigateTo(catalogId)} />
    </React.StrictMode>
  );
}

function installEditorRuntime(runtime: VNextPersistenceRuntime, bridge: DefaultAssetPersistenceBridge): void {
  void navigator.storage?.persist?.().catch(() => false);

  // Como a produção: fechar/recarregar a aba com trabalho não salvo pede confirmação do navegador.
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    const snapshot = runtime.workspace.getSnapshot();
    if (!snapshot.dirty && !runtime.saveCoordinator.hasUnresolvedActiveMutation()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  cleanups.push(() => window.removeEventListener('beforeunload', onBeforeUnload));
  cleanups.push(attachOnlineRetry(runtime));

  const starterDependencies = new DefaultStarterDependencyPreparer(bridge);
  let reusableSession = runtime.workspace.getSnapshot().session;
  const bindReusableSession = () => {
    reusableSession = runtime.workspace.getSnapshot().session;
    const boundSession = reusableSession;
    bindPresysPageReuse(boundSession, {
      templates: presysTemplates,
      preparer: starterDependencies,
      getLineage: () => activeLineage(runtime),
      isCurrent: () => activeRuntime === runtime && runtime.workspace.getSnapshot().session === boundSession,
      installRuntimeAsset: (asset, state) => {
        runtime.workspace.setAssetRuntimeState(asset.id, state);
        runtime.workspace.setAssetUrl(asset.id, state.url);
      },
    });
  };
  bindReusableSession();
  cleanups.push(runtime.workspace.subscribe(() => {
    if (runtime.workspace.getSnapshot().session !== reusableSession) bindReusableSession();
  }));

  const translation = new TranslationReviewCoordinator({
    foundation: createTranslationCenterFoundation(translationProvider, { cache: new MemoryTranslationRequestCache() }),
    repository,
    createId: createUuid,
    createMutationId: createUuid,
    authLineage: () => AUTH_LINEAGE,
    authorityScopeId: () => AUTHORITY_SCOPE_ID,
    getSource: () => publicationSource(runtime),
  });
  activeTranslation = translation;

  const requestLibrary = createSaveBeforeLibraryNavigation(runtime, () => navigateTo(), () => activeRuntime === runtime);

  mode = 'editor';
  renderer.render(
    <React.StrictMode>
      <VNextApp
        runtime={runtime}
        assetBridge={bridge}
        composerClient={composerClient}
        simpleByDefault
        onRequestLibrary={() => { void requestLibrary(); }}
        translation={translation}
        onOpenTranslatedCopy={(catalogId) => navigateTo(catalogId)}
        getPublicationSource={() => publicationSource(runtime)}
      />
    </React.StrictMode>
  );
}

async function openCatalog(catalogId: string): Promise<void> {
  await disposeActiveRuntime();
  mode = 'opening';
  renderer.render(
    <React.StrictMode>
      <Resolving message="Abrindo catálogo…" />
    </React.StrictMode>
  );
  const bridge = new DefaultAssetPersistenceBridge(assetRepository, {
    getActiveLineage: () => activeRuntime ? activeLineage(activeRuntime) : {
      authLineage: AUTH_LINEAGE, authorityScopeId: AUTHORITY_SCOPE_ID,
    },
  });
  const initial = createCatalogDocument(createUuid, 'Abrindo');
  const runtime = new VNextPersistenceRuntime({
    session: createDocumentSession(initial, applicationDependencies),
    repository,
    applicationDependencies,
    createMutationId: createUuid,
    createOpenSessionId: createUuid,
    authLineage: AUTH_LINEAGE,
    authorityScopeId: AUTHORITY_SCOPE_ID,
    recoveryRepository,
    autosave: {},
    resolveAssetUrls: async (doc) => {
      try {
        return await bridge.resolveDocumentAssets(doc, { authLineage: AUTH_LINEAGE });
      } catch {
        // Edição degradada: falha ao resolver imagem é estado de execução, não do documento.
        return { urls: new Map(), states: new Map() };
      }
    },
  });
  activeRuntime = runtime;
  activeBridge = bridge;
  const opened = await runtime.reopenCoordinator.open(catalogId, { allowDiscardUnsaved: true });
  if (activeRuntime !== runtime) return;
  if (!opened.ok) {
    mode = 'open-failed';
    const code = openFailureCode(opened.error.code);
    const retryable = code === 'OFFLINE' || code === 'REMOTE_FAILURE';
    renderer.render(
      <React.StrictMode>
        <CatalogOpenFailure
          code={code}
          onBack={() => navigateTo()}
          onRetry={retryable ? () => { void openCatalog(catalogId); } : undefined}
        />
      </React.StrictMode>
    );
    return;
  }
  installEditorRuntime(runtime, bridge);
}

// ---------------------------------------------------------------------------------------------
// API de inspeção para as provas (window.__FATHER__)
// ---------------------------------------------------------------------------------------------
const api = {
  ready: true,
  user,
  iaMode,
  recoveryDatabaseName,
  authorityScopeId: AUTHORITY_SCOPE_ID,
  state() {
    const runtime = activeRuntime;
    const workspace = runtime?.workspace.getSnapshot();
    const session = workspace?.session.getSnapshot();
    return {
      mode,
      user,
      iaMode,
      catalogs: allCatalogs().map((record) => ({ id: record.catalogId, title: record.title, archivedAt: record.archivedAt })),
      runtime: runtime && workspace && session ? {
        title: session.document.title,
        dirty: workspace.dirty,
        savePhase: workspace.save.phase,
        saveLabel: workspace.save.label,
        canUndo: session.canUndo,
        canRedo: session.canRedo,
        remoteRevision: workspace.binding.kind === 'PERSISTED' ? workspace.binding.remoteRevision : null,
        catalogId: workspace.binding.kind === 'PERSISTED' ? workspace.binding.catalogId : null,
        openSessionId: workspace.binding.openSessionId,
        document: session.document,
        stored: workspace.binding.kind === 'PERSISTED'
          ? readCatalog(workspace.binding.catalogId)?.documentSnapshot ?? null
          : null,
        assetRuntimeStates: [...workspace.assetRuntimeStates.entries()].map(([id, state]) => ({
          id,
          status: state.status,
          url: state.status === 'resolved' ? state.url : null,
        })),
      } : null,
      saveDispatchCount: repository.saveDispatchCount,
      createDispatchCount: repository.createDispatchCount,
      archiveDispatchCount: repository.archiveDispatchCount,
      uploads: [...assetRepository.uploads],
      finalized: [...assetRepository.finalized],
      composerCalls: [...composerCalls],
      translationRequests: translationProvider.requests.length,
    };
  },
  holdSaves(value: boolean) { repository.holdSaves = value; },
  releaseHeld() { return repository.releaseHeld(); },
  flushRecovery() { return activeRuntime?.recoveryManager?.flush(); },
  async recoveryRecords() {
    const records = await recoveryRepository.listByScope(AUTHORITY_SCOPE_ID);
    return records.map((inspection) => ({
      status: inspection.status,
      catalogId: inspection.status === 'VALID' ? inspection.record.catalogId : inspection.key.catalogId,
    }));
  },
  /** Como a produção: abrir um catálogo é navegar para ?catalog=<id> (a página recarrega). */
  open(catalogId: string) { navigateTo(catalogId); },
  /** Volta à biblioteca por navegação direta (sem passar pelo botão "Meus catálogos"). */
  library() { navigateTo(); },
  href(catalogId?: string) { return harnessHref(catalogId); },
  async dispose() { await disposeActiveRuntime(); },
};
declare global { interface Window { __FATHER__: typeof api } }
window.__FATHER__ = api;
window.addEventListener('pagehide', () => { void disposeActiveRuntime(); }, { once: true });

const requestedCatalogId = params.get('catalog');
if (requestedCatalogId) void openCatalog(requestedCatalogId);
else renderLibrary();
