// src/domain/table-binding/product-knowledge.runtime.ts
// Runtime canônico e coordenador de ciclo de vida do Product Knowledge (Emendas 3, 5, 7, 9, 10, 16).
// Fornece pré-carregamento assíncrono epoch-safe (imune a race conditions entre catálogos),
// cache em memória de ResolvedProductKnowledge e resolver síncrono composto para o Table Core V2.
// Zero dependência de Supabase concreto ou React. Zero explicit any.

import { Catalog } from '../catalog.schema';
import {
  ProductWorkbook,
  ResolvedProductKnowledge,
  WorkbookOwner,
  resolveEffectiveProductKnowledge
} from '../product-workbook';
import { TableDatumResolver } from './table-datum.types';
import {
  createProductWorkbookDatumResolver,
  composeTableDatumResolvers,
  projectTechnicalValueFailClosed
} from './product-workbook-datum.resolver';
import { createLegacyProductFieldResolver, LegacyProductLike } from './legacy-product-field.resolver';
import { ProductRegistryReader, ProductIdentity } from './product-registry-reader.types';
import {
  ProductKnowledgeSearchResult,
  ProductKnowledgeDatumResult,
  TechnicalDatasetProjection,
  SavedViewProjection,
  ProductKnowledgeProvider
} from './product-knowledge-provider.types';
import { projectPimDatasetToTechnicalDatasetProjection } from './pim-dataset-projection.adapter';
import { projectPimSavedViewToSavedViewProjection } from './pim-saved-view-projection.adapter';

export type ProductKnowledgeRuntimeStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'unavailable' | 'error';

export interface ProductWorkbookFetcher {
  getWorkbook(owner: WorkbookOwner): Promise<ProductWorkbook | null>;
}

export interface ProductKnowledgeRuntimeOptions {
  readonly registryReader?: ProductRegistryReader;
  readonly workbookFetcher?: ProductWorkbookFetcher;
}

/**
 * Coletor puro de todos os IDs de produtos referenciados em um catálogo.
 */
export function extractReferencedProductIds(catalog: Catalog): string[] {
  const productIds = new Set<string>();

  for (const page of catalog.pages || []) {
    for (const block of page.blocks || []) {
      // 1. Linhas de tabela com productRefId
      if (block.tableRows) {
        for (const row of block.tableRows) {
          if (row.productRefId && row.productRefId.trim() !== '') {
            productIds.add(row.productRefId.trim());
          }
          // 2. Células com binding explícito a produto
          if (row.cellBindings) {
            for (const binding of Object.values(row.cellBindings)) {
              if (binding.productId && binding.productId.trim() !== '') {
                productIds.add(binding.productId.trim());
              }
            }
          }
        }
      }

      // 3. CustomData de blocos com productId
      if (block.customData?.productId && typeof block.customData.productId === 'string') {
        productIds.add(block.customData.productId.trim());
      }
    }
  }

  return Array.from(productIds);
}

/**
 * Runtime e Autoridade Única de Resolução de Conhecimento Técnico para o Catálogo.
 */
export class ProductKnowledgeRuntime implements ProductKnowledgeProvider {
  private status: ProductKnowledgeRuntimeStatus = 'idle';
  private errorMessage?: string;
  private readonly knowledgeCache = new Map<string, ResolvedProductKnowledge>();
  private readonly workbookCache = new Map<string, ProductWorkbook>();
  private readonly productIdentities = new Map<string, ProductIdentity>();

  // Rastreamento estrito de integridade de preload (Emenda 5 & 10)
  private referencedProductIds: string[] = [];
  private loadedProductIds: string[] = [];
  private failedProductIds: string[] = [];
  private failureReasons = new Map<string, string>();
  private knownEmptyProductIds = new Set<string>();

  private readonly registryReader?: ProductRegistryReader;
  private readonly workbookFetcher?: ProductWorkbookFetcher;

  // Controle de concorrência epoch-safe (Emenda 9: rápida alternância Catalog A -> Catalog B)
  private currentEpoch = 0;
  private activeCatalogId?: string;

  private readonly listeners = new Set<(status: ProductKnowledgeRuntimeStatus) => void>();

  constructor(options?: ProductKnowledgeRuntimeOptions) {
    this.registryReader = options?.registryReader;
    this.workbookFetcher = options?.workbookFetcher;
  }

  public getStatus(): ProductKnowledgeRuntimeStatus {
    return this.status;
  }

  public getErrorMessage(): string | undefined {
    return this.errorMessage;
  }

  public getReferencedProductIds(): readonly string[] {
    return this.referencedProductIds;
  }

  public getLoadedProductIds(): readonly string[] {
    return this.loadedProductIds;
  }

  public getFailedProductIds(): readonly string[] {
    return this.failedProductIds;
  }

  public getFailureReasons(): ReadonlyMap<string, string> {
    return this.failureReasons;
  }

  public getKnownEmptyProductIds(): readonly string[] {
    return Array.from(this.knownEmptyProductIds);
  }

  public getCachedWorkbook(kind: 'product' | 'family', id: string): ProductWorkbook | undefined {
    return this.workbookCache.get(`${kind}:${id}`);
  }

  public getCachedIdentity(productId: string): ProductIdentity | undefined {
    return this.productIdentities.get(productId);
  }

  public isAvailable(): boolean {
    return this.status === 'ready' || this.status === 'partial' || (this.status !== 'unavailable' && this.status !== 'error' && Boolean(this.workbookFetcher));
  }

  public subscribe(listener: (status: ProductKnowledgeRuntimeStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(status: ProductKnowledgeRuntimeStatus, errorMessage?: string): void {
    this.status = status;
    this.errorMessage = errorMessage;
    for (const listener of this.listeners) {
      listener(status);
    }
  }

  /**
   * Registra manualmente um ResolvedProductKnowledge no runtime (útil para testes e preloads locais).
   */
  public registerResolvedKnowledge(productId: string, knowledge: ResolvedProductKnowledge): void {
    this.knowledgeCache.set(productId, knowledge);
    if (this.status === 'idle') {
      this.setStatus('ready');
    }
  }

  public getActiveCatalogId(): string | undefined {
    return this.activeCatalogId;
  }

  /**
   * Obtém o conhecimento efetivo resolvido de um produto de forma síncrona.
   */
  public getResolvedKnowledge(productId: string): ResolvedProductKnowledge | undefined {
    return this.knowledgeCache.get(productId);
  }

  /**
   * Carrega sob demanda o conhecimento efetivo de um produto específico.
   */
  public async loadProductKnowledge(productId: string): Promise<ResolvedProductKnowledge | null> {
    const cached = this.knowledgeCache.get(productId);
    if (cached) return cached;
    if (!this.workbookFetcher) return null;

    let identity = this.productIdentities.get(productId);
    if (!identity && this.registryReader) {
      identity = (await this.registryReader.getProductIdentity(productId)) ?? undefined;
      if (identity) {
        this.productIdentities.set(productId, identity);
      }
    }

    let familyWorkbook: ProductWorkbook | undefined;
    if (identity?.familyId) {
      const cachedFw = this.workbookCache.get(`family:${identity.familyId}`);
      if (cachedFw) {
        familyWorkbook = cachedFw;
      } else {
        const fw = await this.workbookFetcher.getWorkbook({ kind: 'family', id: identity.familyId });
        if (fw) {
          familyWorkbook = fw;
          this.workbookCache.set(`family:${identity.familyId}`, fw);
        }
      }
    }

    let pw: ProductWorkbook | null = null;
    try {
      pw = await this.workbookFetcher.getWorkbook({ kind: 'product', id: productId });
    } catch {
      return null;
    }

    if (!pw) {
      // Emenda 4 & 16: Se não possui Product Workbook, mas possui Family Workbook, resolve conhecimento efetivo
      if (familyWorkbook) {
        const resolved = resolveEffectiveProductKnowledge({
          productId,
          productWorkbook: null,
          familyWorkbook
        });
        this.knowledgeCache.set(productId, resolved);
        if (this.status === 'idle') {
          this.setStatus('ready');
        }
        return resolved;
      }
      return null;
    }

    this.workbookCache.set(`product:${productId}`, pw);

    const resolved = resolveEffectiveProductKnowledge({
      productId,
      productWorkbook: pw,
      familyWorkbook
    });

    this.knowledgeCache.set(productId, resolved);
    if (this.status === 'idle') {
      this.setStatus('ready');
    }
    return resolved;
  }

  /**
   * Pré-carrega de forma assíncrona todo o conhecimento de produtos exigido por um catálogo.
   * Totalmente imune a race conditions via commits atômicos pós-validação de epoch e catalogId (Emendas 6 e 9).
   */
  public async preloadCatalogProductKnowledge(catalog: Catalog): Promise<void> {
    const epoch = ++this.currentEpoch;
    this.activeCatalogId = catalog.id;

    if (!this.workbookFetcher) {
      this.setStatus('unavailable', 'Workbook fetcher não configurado.');
      return;
    }

    const referencedProductIds = extractReferencedProductIds(catalog);
    this.referencedProductIds = referencedProductIds;
    this.loadedProductIds = [];
    this.failedProductIds = [];
    this.failureReasons.clear();
    this.knownEmptyProductIds.clear();

    if (referencedProductIds.length === 0) {
      this.setStatus('ready');
      return;
    }

    this.setStatus('loading');

    try {
      // Estruturas locais isoladas para evitar contaminação pré-epoch (Emenda 6 / Ponto 6)
      const tempIdentities = new Map<string, ProductIdentity>();
      const tempWorkbooks = new Map<string, ProductWorkbook>();
      const tempKnowledge = new Map<string, ResolvedProductKnowledge>();

      // 1. Carregar identidades de produtos sem N+1 (Emenda 3 & 17)
      if (this.registryReader) {
        const identities = await this.registryReader.getProductsByIds(referencedProductIds);
        if (epoch !== this.currentEpoch || catalog.id !== this.activeCatalogId) return;

        for (const identity of identities) {
          tempIdentities.set(identity.id, identity);
        }
      }

      // 2. Coletar e agrupar owners únicos para produtos e famílias
      const familyIdsToLoad = new Set<string>();
      for (const productId of referencedProductIds) {
        const identity = tempIdentities.get(productId) || this.productIdentities.get(productId);
        if (identity?.familyId) {
          familyIdsToLoad.add(identity.familyId);
        }
      }

      // 3. Buscar workbooks de famílias em paralelo
      const familyWorkbooks = new Map<string, ProductWorkbook>();
      await Promise.all(
        Array.from(familyIdsToLoad).map(async (familyId) => {
          try {
            const fw = await this.workbookFetcher!.getWorkbook({ kind: 'family', id: familyId });
            if (fw) {
              familyWorkbooks.set(familyId, fw);
              tempWorkbooks.set(`family:${familyId}`, fw);
            }
          } catch {
            // Falha não crítica de família individual
          }
        })
      );

      if (epoch !== this.currentEpoch || catalog.id !== this.activeCatalogId) return;

      // 4. Buscar workbooks de produtos em paralelo com distinção rigorosa de falhas vs known-empty (Emenda 5)
      const loadedIds: string[] = [];
      const failedIds: string[] = [];
      const reasons = new Map<string, string>();
      const knownEmpty = new Set<string>();

      await Promise.all(
        referencedProductIds.map(async (productId) => {
          const identity = tempIdentities.get(productId) || this.productIdentities.get(productId);
          const familyWorkbook = identity?.familyId ? familyWorkbooks.get(identity.familyId) : undefined;

          try {
            const pw = await this.workbookFetcher!.getWorkbook({ kind: 'product', id: productId });
            if (pw) {
              tempWorkbooks.set(`product:${productId}`, pw);
              const resolved = resolveEffectiveProductKnowledge({
                productId,
                productWorkbook: pw,
                familyWorkbook
              });
              tempKnowledge.set(productId, resolved);
              loadedIds.push(productId);
            } else {
              // Product workbook é legitimamente nulo (Emenda 4 & 5)
              if (familyWorkbook) {
                // Herança family-only válida
                const resolved = resolveEffectiveProductKnowledge({
                  productId,
                  productWorkbook: null,
                  familyWorkbook
                });
                tempKnowledge.set(productId, resolved);
                loadedIds.push(productId);
              } else {
                // Known-empty: produto sem fatos técnicos locais nem familiares
                knownEmpty.add(productId);
                loadedIds.push(productId);
              }
            }
          } catch (err: unknown) {
            // Erro real de rede ou infraestrutura
            failedIds.push(productId);
            const msg = err instanceof Error ? err.message : 'Erro ao carregar workbook.';
            reasons.set(productId, msg);
          }
        })
      );

      // Validação estrita de epoch ANTES de qualquer escrita nos caches de runtime (Emenda 6 / Ponto 6)
      if (epoch !== this.currentEpoch || catalog.id !== this.activeCatalogId) {
        return;
      }

      // Commit atômico nos caches oficiais
      for (const [id, identity] of tempIdentities) {
        this.productIdentities.set(id, identity);
      }
      for (const [key, wb] of tempWorkbooks) {
        this.workbookCache.set(key, wb);
      }
      for (const [id, kn] of tempKnowledge) {
        this.knowledgeCache.set(id, kn);
      }

      this.loadedProductIds = loadedIds;
      this.failedProductIds = failedIds;
      this.failureReasons = reasons;
      this.knownEmptyProductIds = knownEmpty;

      // Determinação de status de integridade (Emenda 5 & 10)
      if (failedIds.length === 0) {
        this.setStatus('ready');
      } else if (loadedIds.length > 0) {
        this.setStatus('partial', 'Conhecimento técnico de produtos parcialmente carregado.');
      } else {
        this.setStatus('error', 'Falha ao carregar conhecimento técnico dos produtos.');
      }
    } catch (err: unknown) {
      if (epoch !== this.currentEpoch || catalog.id !== this.activeCatalogId) return;
      const message = err instanceof Error ? err.message : 'Erro ao carregar conhecimento técnico.';
      this.setStatus('error', message);
    }
  }

  /**
   * Cria o resolver síncrono composto com a precedência estrita exigida (Requisito 4):
   * 1. Product Workbook / PIM Datum Resolver (para chaves canônicas e datasets)
   * 2. Legacy Product Field Resolver (estritamente para prefixo 'legacy.*')
   */
  public getCompositeDatumResolver(
    getProductLegacy?: (productId: string) => LegacyProductLike | undefined | null
  ): TableDatumResolver {
    const pimResolver = createProductWorkbookDatumResolver(
      (productId: string) => this.knowledgeCache.get(productId),
      { enableV2Literals: true }
    );

    const legacyResolver = getProductLegacy
      ? createLegacyProductFieldResolver(getProductLegacy)
      : undefined;

    return composeTableDatumResolvers(pimResolver, legacyResolver);
  }

  // =========================================================================
  // IMPLEMENTAÇÃO DE ProductKnowledgeProvider
  // =========================================================================

  /**
   * Busca de conhecimento técnico.
   * Suporta:
   * - Busca escopada por produto (Emenda 5): Retorna dados EFETIVOS (local + override + herdado - suprimido).
   * - Busca global entre produtos carregados no runtime.
   */
  public async search(productId: string | undefined, query: string): Promise<ProductKnowledgeSearchResult[]> {
    if (this.status === 'unavailable') {
      throw new Error('Conhecimento Técnico Indisponível (PIM indisponível)');
    }
    if (this.status === 'error') {
      throw new Error(this.errorMessage || 'Erro ao carregar conhecimento técnico.');
    }

    const q = query.toLowerCase().trim();
    const results: ProductKnowledgeSearchResult[] = [];

    // 1. Busca escopada em um produto específico
    if (productId) {
      let knowledge = this.knowledgeCache.get(productId);
      if (!knowledge && this.workbookFetcher) {
        knowledge = (await this.loadProductKnowledge(productId)) ?? undefined;
      }
      const productWb = this.workbookCache.get(`product:${productId}`);
      const identity = this.productIdentities.get(productId);
      const productModel = identity?.model || identity?.code;

      if (knowledge) {
        // 1.1 Fatos técnicos efetivos (Emenda 5: local + override + herdado - suprimido)
        for (const [semKey, eff] of knowledge.effectiveData.entries()) {
          const datum = eff.datum;
          const match =
            !q ||
            datum.label.toLowerCase().includes(q) ||
            semKey.toLowerCase().includes(q) ||
            (datum.description && datum.description.toLowerCase().includes(q));

          if (match) {
            const preview = projectTechnicalValueFailClosed(datum.value);

            const sourceOwnerKind: 'product' | 'family' = eff.origin === 'family' ? 'family' : 'product';
            const sourceOwnerId = eff.origin === 'family' ? (knowledge.familyId ?? productId) : productId;
            const sourceRevision = eff.origin === 'family' ? knowledge.familyRevision : knowledge.productRevision;

            results.push({
              bindable: true,
              id: datum.id,
              kind: 'datum',
              productId,
              productModel,
              semanticKey: semKey,
              label: datum.label,
              description: datum.description,
              status: eff.effectiveStatus === 'approved' ? 'approved' : eff.effectiveStatus === 'draft' ? 'draft' : 'unknown',
              origin: eff.origin,
              sourceCount: datum.evidence ? datum.evidence.length : 0,
              preview,
              sourceRevision,
              sourceOwnerKind,
              sourceOwnerId
            });
          }
        }

        // 1.2 Datasets efetivos (Emenda 4 & 13: agregados por datasetId com semântica canônica)
        if (knowledge.effectiveDatasets) {
          for (const [dsKey, effDs] of knowledge.effectiveDatasets.entries()) {
            const ds = effDs.dataset;
            const match =
              !q ||
              ds.label.toLowerCase().includes(q) ||
              dsKey.toLowerCase().includes(q) ||
              (ds.description && ds.description.toLowerCase().includes(q));

            if (match) {
              const sourceOwnerKind: 'product' | 'family' = effDs.origin === 'family' ? 'family' : 'product';
              const sourceOwnerId = effDs.origin === 'family' ? (knowledge.familyId ?? productId) : productId;
              const sourceRevision = effDs.origin === 'family' ? knowledge.familyRevision : knowledge.productRevision;

              results.push({
                bindable: true,
                id: ds.id,
                kind: 'dataset',
                productId,
                productModel,
                semanticKey: ds.semanticKey,
                label: ds.label,
                description: ds.description,
                status: 'approved',
                origin: effDs.origin === 'family' ? 'Dataset da Família' : 'Dataset Local',
                sourceCount: ds.rows.length,
                preview: `${ds.rows.length} linhas × ${ds.columns.length} colunas`,
                datasetId: ds.id,
                sourceRevision,
                sourceOwnerKind,
                sourceOwnerId
              });
            }
          }
        }

        // 1.3 Saved Views do Product Workbook (Emenda 4 & 12: busca em memória de views reais)
        if (productWb?.savedViews) {
          for (const sv of productWb.savedViews) {
            const match =
              !q ||
              sv.name.toLowerCase().includes(q) ||
              (sv.description && sv.description.toLowerCase().includes(q));

            if (match) {
              results.push({
                bindable: true,
                id: sv.id,
                kind: 'saved_view',
                productId,
                productModel,
                semanticKey: `view:${sv.id}`,
                label: sv.name,
                description: sv.description,
                status: 'approved',
                origin: 'View Salva PIM',
                sourceCount: sv.datumKeys.length,
                preview: `${sv.datumKeys.length} parâmetros definidos`,
                savedViewId: sv.id,
                sourceRevision: productWb.revision,
                sourceOwnerKind: 'product',
                sourceOwnerId: productId
              });
            }
          }
        }
      }

      return results;
    }

    // 2. Busca global entre todos os produtos no cache do runtime
    for (const prodId of this.knowledgeCache.keys()) {
      const subResults = await this.search(prodId, query);
      results.push(...subResults);
    }

    return results;
  }

  public async getDatum(productId: string, semanticKey: string): Promise<ProductKnowledgeDatumResult | undefined> {
    const knowledge = this.knowledgeCache.get(productId);
    if (!knowledge) return undefined;

    const eff = knowledge.effectiveData.get(semanticKey);
    if (!eff) return undefined;

    const value = projectTechnicalValueFailClosed(eff.datum.value);

    const sourceOwnerKind: 'product' | 'family' = eff.origin === 'family' ? 'family' : 'product';
    const sourceOwnerId = eff.origin === 'family' ? (knowledge.familyId ?? productId) : productId;
    const sourceRevision = eff.origin === 'family' ? knowledge.familyRevision : knowledge.productRevision;

    return {
      productId,
      semanticKey,
      label: eff.datum.label,
      status: eff.effectiveStatus === 'approved' ? 'approved' : eff.effectiveStatus === 'draft' ? 'draft' : 'unknown',
      origin: eff.origin,
      sourceCount: eff.datum.evidence?.length ?? 0,
      value,
      sourceRevision,
      sourceOwnerKind,
      sourceOwnerId
    };
  }

  public async getDataset(productId: string, datasetId: string): Promise<TechnicalDatasetProjection | undefined> {
    const knowledge = this.knowledgeCache.get(productId);
    const productWb = this.workbookCache.get(`product:${productId}`);
    if (!knowledge) return undefined;

    let targetDataset = productWb?.schemaVersion === 2 ? productWb.datasets.find((d) => d.id === datasetId) : undefined;
    let structureOwnerKind: 'product' | 'family' = 'product';
    let structureOwnerId: string = productId;
    let structureRevision: number | undefined = knowledge.productRevision;

    if (!targetDataset && knowledge.effectiveDatasets) {
      for (const eff of knowledge.effectiveDatasets.values()) {
        if (eff.dataset.id === datasetId) {
          targetDataset = eff.dataset;
          structureOwnerKind = eff.origin === 'family' ? 'family' : 'product';
          structureOwnerId = eff.origin === 'family' ? (knowledge.familyId ?? productId) : productId;
          structureRevision = eff.origin === 'family' ? knowledge.familyRevision : knowledge.productRevision;
          break;
        }
      }
    }

    if (!targetDataset) return undefined;

    // Coleta todos os datums disponíveis (efetivos e locais)
    const datumsMap = new Map(Array.from(knowledge.effectiveData.values()).map((e) => [e.datum.id, e.datum]));
    if (productWb) {
      for (const d of Object.values(productWb.data)) {
        if (!datumsMap.has(d.id)) {
          datumsMap.set(d.id, d);
        }
      }
    }

    return projectPimDatasetToTechnicalDatasetProjection({
      dataset: targetDataset,
      productId,
      datums: datumsMap,
      bindingMode: 'live',
      sourceRevision: structureRevision,
      sourceOwnerKind: structureOwnerKind,
      sourceOwnerId: structureOwnerId,
      effectiveKnowledge: knowledge
    });
  }

  public async getSavedView(productId: string, viewId: string): Promise<SavedViewProjection | undefined> {
    const knowledge = this.knowledgeCache.get(productId);
    const productWb = this.workbookCache.get(`product:${productId}`);
    if (!knowledge || !productWb?.savedViews) return undefined;

    const targetView = productWb.savedViews.find((v) => v.id === viewId);
    if (!targetView) return undefined;

    return projectPimSavedViewToSavedViewProjection({
      view: targetView,
      knowledge,
      bindingMode: 'live'
    });
  }
}
