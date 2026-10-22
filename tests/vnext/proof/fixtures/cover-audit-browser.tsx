// Harness de MEDIÇÃO (Onda 3.5, passo 1): monta o editor REAL (VNextApp, modo simples, como a produção)
// com um catálogo carregado de arquivos locais. Sem login, sem Supabase, sem rede.
//
// Parâmetros de URL:
//   ?dir=<pasta>      pasta servida pelo Vite com catalogs/<nome>.catalog.json e assets/<arquivo.png>
//                     (padrão: /scratch/cover-audit; copie o catálogo + assets para dentro do repo)
//   ?catalog=<nome>   nome do arquivo sem ".catalog.json" (ex.: PCON-HIBRIDO)
//   ?mode=simple|full simple (padrão) = simpleByDefault; full = painéis avançados abertos
//
// Expõe window.__COVER_AUDIT__: state() devolve o documento atual para a prova medir o efeito de cada edição.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createDocumentSession, type ApplicationExecutionDependencies } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import { CatalogDocumentSchema, type CatalogDocument } from '@/vnext/domain';
import {
  DefaultAssetPersistenceBridge,
  type AssetFinalizationResult,
  type AssetRecord,
  type AssetRepository,
} from '@/vnext/asset';
import { createPresysPageTemplateRegistry } from '@/vnext/library/presys-ta25n-starter';
import { bindPresysPageReuse, DefaultStarterDependencyPreparer } from '@/vnext/library/starter-dependencies';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';

const params = new URLSearchParams(window.location.search);
const dir = params.get('dir') ?? '/scratch/cover-audit';
const catalogName = params.get('catalog') ?? 'PCON-HIBRIDO';
const simple = params.get('mode') !== 'full';
const USER_ID = '99999999-9999-4999-8999-999999999999';
const INITIAL_MUTATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function envelope(document: CatalogDocument, revision: number, mutationId: string): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id, remoteRevision: revision, lastMutationId: mutationId,
    title: document.title, locale: document.locale,
    createdAt: '2026-10-22T12:00:00.000Z', updatedAt: '2026-10-22T12:00:00.000Z',
    createdBy: USER_ID, updatedBy: USER_ID, archivedAt: null, documentSchemaVersion: 1, documentSnapshot: document,
  };
}

class LocalRepository implements CatalogRepository {
  readonly records = new Map<string, CatalogPersistenceEnvelope>();
  listCatalogs = async () => ({ ok: true as const, value: [] });
  createCatalog = async () => ({ ok: false as const, error: { code: 'REMOTE_FAILURE' as const } });
  archiveCAS = async () => ({ ok: false as const, error: { code: 'REMOTE_FAILURE' as const } });
  getCatalog = async (id: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const item = this.records.get(id);
    return item ? { ok: true, value: item } : { ok: false, error: { code: 'NOT_FOUND' } };
  };
  saveCAS = async (request: SaveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const current = this.records.get(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    const next = envelope(request.documentSnapshot, current.remoteRevision + 1, request.mutationId);
    this.records.set(request.catalogId, next);
    return { ok: true, value: next };
  };
}

/** Imagens do catálogo: já existem em `dir/assets`; envios novos (trocar foto) ficam em memória. */
class LocalAssets implements AssetRepository {
  records = new Map<string, AssetRecord>();
  bytes = new Map<string, { bytes: Uint8Array; mime: string }>();
  uploads = 0;
  async uploadBytes(path: string, bytes: ArrayBuffer | Uint8Array, mime: string) {
    this.uploads += 1;
    this.bytes.set(path, { bytes: new Uint8Array(bytes), mime });
    return { ok: true as const, storagePath: path };
  }
  async finalizeAsset(p: Parameters<AssetRepository['finalizeAsset']>[0]): Promise<AssetFinalizationResult> {
    const asset = { id: p.assetId, version: '1' as const, sha256: p.sha256, mime: p.mime as AssetRecord['mime'], widthPx: p.widthPx, heightPx: p.heightPx, name: p.name, alt: p.alt };
    this.records.set(asset.id, { ...asset, storageBucket: 'product-assets', storagePath: p.storagePath, fileSize: p.fileSize, createdAt: '2026-10-22T00:00:00Z' });
    return { ok: true, asset };
  }
  async getAsset(id: string) { return { ok: true as const, record: this.records.get(id) ?? null }; }
  async createSignedUrl(path: string) {
    if (path.startsWith('/')) return { ok: true as const, signedUrl: path };
    const stored = this.bytes.get(path);
    return stored
      ? { ok: true as const, signedUrl: URL.createObjectURL(new Blob([new Uint8Array(stored.bytes).buffer], { type: stored.mime })) }
      : { ok: false as const };
  }
}

async function boot() {
  const raw = await (await fetch(`${dir}/catalogs/${catalogName}.catalog.json`)).json();
  const parsed = CatalogDocumentSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Catálogo inválido: ' + JSON.stringify(parsed.error.issues.slice(0, 3)));
  const doc = parsed.data;
  const repository = new LocalRepository();
  repository.records.set(doc.id, envelope(doc, 1, INITIAL_MUTATION_ID));
  const assets = new LocalAssets();
  for (const a of doc.assets) {
    assets.records.set(a.id, { ...a, version: '1' as const, storageBucket: 'product-assets', storagePath: `${dir}/assets/${a.name}`, fileSize: 1, createdAt: '2026-10-22T00:00:00Z' });
  }
  // Onda 3.5 (S3): "Usar modelo…" offers the PRESYS page models (P1–P9 and the native PCON cover), as in production.
  const templates = createPresysPageTemplateRegistry();
  const dependencies: ApplicationExecutionDependencies = { createId: () => crypto.randomUUID(), templateRegistry: templates };
  const session = createDocumentSession(doc, dependencies);
  let runtime: VNextPersistenceRuntime;
  const bridge = new DefaultAssetPersistenceBridge(assets, { getActiveLineage: () => {
    const snap = runtime.workspace.getSnapshot();
    return {
      authLineage: snap.binding.authLineage, openSessionId: snap.binding.openSessionId,
      authorityScopeId: snap.activeAuthorityScopeId,
      catalogId: snap.binding.kind === 'PERSISTED' ? snap.binding.catalogId : doc.id,
    } as never;
  } });
  bindPresysPageReuse(session, {
    templates, preparer: new DefaultStarterDependencyPreparer(bridge),
    getLineage: () => ({ authLineage: 'cover-audit', authorityScopeId: 'cover-audit:harness', openSessionId: 'cover-audit', catalogId: doc.id }),
    isCurrent: () => true, installRuntimeAsset: () => undefined,
  });
  runtime = new VNextPersistenceRuntime({
    session, repository, applicationDependencies: dependencies,
    createMutationId: () => crypto.randomUUID(), createOpenSessionId: () => crypto.randomUUID(),
    authLineage: 'cover-audit', authorityScopeId: 'cover-audit:harness',
    binding: envelope(doc, 1, INITIAL_MUTATION_ID), autosave: false,
    // As imagens do catálogo são arquivos locais (sem verificação de bytes); envios novos passam pela ponte.
    assetUrls: new Map(doc.assets.map((a) => [a.id, `${dir}/assets/${a.name}`])),
    resolveAssetUrls: (d) => bridge.resolveDocumentAssets(d),
  });
  (window as unknown as { __COVER_AUDIT__: unknown }).__COVER_AUDIT__ = {
    state: () => {
      const snap = runtime.workspace.getSnapshot();
      return { document: snap.session.getSnapshot().document, canUndo: snap.session.getSnapshot().canUndo, uploads: assets.uploads };
    },
  };
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><VNextApp runtime={runtime} assetBridge={bridge} simpleByDefault={simple} /></React.StrictMode>
  );
}
void boot();
