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
  ProductKnowledgeProvider,
  ProductKnowledgeDependencyKind,
  ReadAuthoritySnapshot,
  ReadAuthorityState
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
      if (block.tableRows) {
        for (const row of block.tableRows) {
          if (row.productRefId && row.productRefId.trim() !== '') {
            productIds.add(row.productRefId.trim());
          }
          if (row.cellBindings) {
            for (const binding of Object.values(row.cellBindings)) {
              if (binding.productId && binding.productId.trim() !== '') {
                productIds.add(binding.productId.trim());
              }
            }
          }
        }
      }

      if (block.customData?.productId && typeof block.customData.productId === 'string') {
        productIds.add(block.customData.productId.trim());
      }
    }
  }

  return Array.from(productIds);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Runtime e Autoridade Única de Resolução de Conhecimento Técnico para o Catálogo.
 *
 * RR006: caches são somente projeções de leituras verificadas. Null autoritativo
 * tombstona a projeção anterior; falha nunca equivale a ausência; promises de
 * single-flight são descartadas ao assentar; e todo commit assíncrono é guardado
 * pelo epoch do owner/catalog atual.
 */
export class ProductKnowledgeRuntime implements ProductKnowledgeProvider {
  private status: ProductKnowledgeRuntimeStatus = 'idle';
  private errorMessage?: string;

  /** Somente dados atualmente autoritativos. */
  private readonly knowledgeCache = new Map<string, ResolvedProductKnowledge>();
  private readonly workbookCache = new Map<string, ProductWorkbook>();
  private readonly productIdentities = new Map<string, ProductIdentity>();

  private readonly dependencyStates = new Map<string, ReadAuthoritySnapshot>();
  private readonly workbookFlights = new Map<string, Promise<ProductWorkbook | null>>();
  private readonly registryFlights = new Map<string, Promise<ProductIdentity | null>>();
  private readonly productFlights = new Map<string, Promise<ResolvedProductKnowledge | null>>();
  private readonly preloadFlights = new Map<string, Promise<void>>();

  private referencedProductIds: string[] = [];
  private loadedProductIds: string[] = [];
  private failedProductIds: string[] = [];
  private failureReasons = new Map<string, string>();
  private knownEmptyProductIds = new Set<string>();

  private readonly registryReader?: ProductRegistryReader;
  private readonly workbookFetcher?: ProductWorkbookFetcher;

  private currentEpoch = 0;
  private activeCatalogId?: string;
  private activeProductIds?: Set<string>;

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

  public getDependencySnapshot(kind: ProductKnowledgeDependencyKind, id: string): ReadAuthoritySnapshot {
    return this.dependencyStates.get(this.dependencyKey(kind, id)) ?? {
      state: 'not_loaded',
      epoch: this.currentEpoch
    };
  }

  public getDependencyState(kind: ProductKnowledgeDependencyKind, id: string): ReadAuthorityState {
    return this.getDependencySnapshot(kind, id).state;
  }

  public getCachedWorkbook(kind: 'product' | 'family', id: string): ProductWorkbook | undefined {
    const dependencyKind: ProductKnowledgeDependencyKind = kind;
    if (this.getDependencyState(dependencyKind, id) !== 'verified_present') return undefined;
    return this.workbookCache.get(`${kind}:${id}`);
  }

  public getCachedIdentity(productId: string): ProductIdentity | undefined {
    if (this.getDependencyState('registry', productId) !== 'verified_present') return undefined;
    return this.productIdentities.get(productId);
  }

  public isAvailable(): boolean {
    return this.status === 'ready' || this.status === 'partial' ||
      (this.status !== 'unavailable' && this.status !== 'error' && Boolean(this.workbookFetcher));
  }

  public subscribe(listener: (status: ProductKnowledgeRuntimeStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(status: ProductKnowledgeRuntimeStatus, message?: string): void {
    this.status = status;
    this.errorMessage = message;
    for (const listener of this.listeners) {
      listener(status);
    }
  }

  private dependencyKey(kind: ProductKnowledgeDependencyKind, id: string): string {
    return `${kind}:${id}`;
  }

  private setDependencyState(
    kind: ProductKnowledgeDependencyKind,
    id: string,
    state: ReadAuthorityState,
    epoch: number,
    error?: string
  ): void {
    if (epoch !== this.currentEpoch) return;
    this.dependencyStates.set(this.dependencyKey(kind, id), { state, epoch, error });
  }

  private isCurrentEpoch(epoch: number): boolean {
    return epoch === this.currentEpoch;
  }

  private isProductInActiveScope(productId: string): boolean {
    return !this.activeProductIds || this.activeProductIds.has(productId);
  }

  private invalidateAllAuthorityForOwnerSwitch(): void {
    for (const [key, snapshot] of this.dependencyStates) {
      if (snapshot.state === 'verified_present' || snapshot.state === 'verified_absent') {
        this.dependencyStates.set(key, {
          state: 'cached_unverified',
          epoch: this.currentEpoch
        });
      }
    }
    this.knowledgeCache.clear();
    this.workbookCache.clear();
    this.productIdentities.clear();
    this.knownEmptyProductIds.clear();
  }

  private invalidateProductAuthority(productId: string): void {
    const oldIdentity = this.productIdentities.get(productId);
    const oldFamilyId = oldIdentity?.familyId;

    this.knowledgeCache.delete(productId);
    this.workbookCache.delete(`product:${productId}`);
    this.productIdentities.delete(productId);
    this.knownEmptyProductIds.delete(productId);

    if (oldFamilyId) {
      this.workbookCache.delete(`family:${oldFamilyId}`);
      for (const [otherProductId, identity] of this.productIdentities) {
        if (identity.familyId === oldFamilyId) {
          this.knowledgeCache.delete(otherProductId);
          this.knownEmptyProductIds.delete(otherProductId);
        }
      }
    }
  }

  private async readWorkbook(owner: WorkbookOwner, epoch: number): Promise<ProductWorkbook | null> {
    if (!this.workbookFetcher) {
      throw new Error('Workbook fetcher não configurado.');
    }

    const dependencyKind: ProductKnowledgeDependencyKind = owner.kind;
    const ownerKey = `${owner.kind}:${owner.id}`;
    const flightKey = `${epoch}:${ownerKey}`;
    const existing = this.workbookFlights.get(flightKey);
    if (existing) return existing;

    this.workbookCache.delete(ownerKey);
    this.setDependencyState(dependencyKind, owner.id, 'loading', epoch);

    const request = this.workbookFetcher.getWorkbook(owner)
      .then((workbook) => {
        if (!this.isCurrentEpoch(epoch)) return workbook;
        if (workbook) {
          this.workbookCache.set(ownerKey, workbook);
          this.setDependencyState(dependencyKind, owner.id, 'verified_present', epoch);
        } else {
          this.workbookCache.delete(ownerKey);
          this.setDependencyState(dependencyKind, owner.id, 'verified_absent', epoch);
        }
        return workbook;
      })
      .catch((error: unknown) => {
        if (this.isCurrentEpoch(epoch)) {
          this.workbookCache.delete(ownerKey);
          this.setDependencyState(
            dependencyKind,
            owner.id,
            'failed',
            epoch,
            errorMessage(error, 'Erro ao carregar workbook.')
          );
        }
        throw error;
      });

    const tracked = request.finally(() => {
      if (this.workbookFlights.get(flightKey) === tracked) {
        this.workbookFlights.delete(flightKey);
      }
    });
    this.workbookFlights.set(flightKey, tracked);
    return tracked;
  }

  private async readRegistryIdentity(productId: string, epoch: number): Promise<ProductIdentity | null> {
    if (!this.registryReader) return null;

    const flightKey = `${epoch}:${productId}`;
    const existing = this.registryFlights.get(flightKey);
    if (existing) return existing;

    this.productIdentities.delete(productId);
    this.setDependencyState('registry', productId, 'loading', epoch);

    const request = this.registryReader.getProductIdentity(productId)
      .then((identity) => {
        if (!this.isCurrentEpoch(epoch)) return identity;
        if (identity) {
          this.productIdentities.set(productId, identity);
          this.setDependencyState('registry', productId, 'verified_present', epoch);
        } else {
          this.productIdentities.delete(productId);
          this.setDependencyState('registry', productId, 'verified_absent', epoch);
        }
        return identity;
      })
      .catch((error: unknown) => {
        if (this.isCurrentEpoch(epoch)) {
          this.productIdentities.delete(productId);
          this.setDependencyState(
            'registry',
            productId,
            'failed',
            epoch,
            errorMessage(error, 'Erro ao carregar identidade do produto.')
          );
        }
        throw error;
      });

    const tracked = request.finally(() => {
      if (this.registryFlights.get(flightKey) === tracked) {
        this.registryFlights.delete(flightKey);
      }
    });
    this.registryFlights.set(flightKey, tracked);
    return tracked;
  }

  private async readRegistryBatch(productIds: readonly string[], epoch: number): Promise<void> {
    if (!this.registryReader || productIds.length === 0) return;

    for (const productId of productIds) {
      this.productIdentities.delete(productId);
      this.setDependencyState('registry', productId, 'loading', epoch);
    }

    try {
      const identities = await this.registryReader.getProductsByIds([...productIds]);
      if (!this.isCurrentEpoch(epoch)) return;
      const byId = new Map(identities.map((identity) => [identity.id, identity]));
      for (const productId of productIds) {
        const identity = byId.get(productId);
        if (identity) {
          this.productIdentities.set(productId, identity);
          this.setDependencyState('registry', productId, 'verified_present', epoch);
        } else {
          this.productIdentities.delete(productId);
          this.setDependencyState('registry', productId, 'verified_absent', epoch);
        }
      }
    } catch (error: unknown) {
      if (!this.isCurrentEpoch(epoch)) return;
      const message = errorMessage(error, 'Erro ao carregar identidades de produtos.');
      for (const productId of productIds) {
        this.productIdentities.delete(productId);
        this.setDependencyState('registry', productId, 'failed', epoch, message);
      }
    }
  }

  private materializeVerifiedKnowledge(productId: string): ResolvedProductKnowledge | null {
    this.knowledgeCache.delete(productId);
    this.knownEmptyProductIds.delete(productId);

    const productState = this.getDependencyState('product', productId);
    if (productState === 'failed' || productState === 'loading' || productState === 'not_loaded' || productState === 'cached_unverified') {
      return null;
    }

    const identityState = this.getDependencyState('registry', productId);
    const identity = identityState === 'verified_present' ? this.productIdentities.get(productId) : undefined;
    const familyId = identity?.familyId;
    const familyState = familyId ? this.getDependencyState('family', familyId) : 'not_loaded';
    const familyWorkbook = familyId && identityState === 'verified_present' && familyState === 'verified_present'
      ? this.workbookCache.get(`family:${familyId}`)
      : undefined;

    if (productState === 'verified_present') {
      const productWorkbook = this.workbookCache.get(`product:${productId}`);
      if (!productWorkbook) return null;
      const resolved = resolveEffectiveProductKnowledge({
        productId,
        productWorkbook,
        familyWorkbook
      });
      this.knowledgeCache.set(productId, resolved);
      return resolved;
    }

    if (productState !== 'verified_absent') return null;

    if (identityState === 'verified_present' && familyId) {
      if (familyState === 'verified_present' && familyWorkbook) {
        const resolved = resolveEffectiveProductKnowledge({
          productId,
          productWorkbook: null,
          familyWorkbook
        });
        this.knowledgeCache.set(productId, resolved);
        return resolved;
      }
      if (familyState === 'verified_absent') {
        this.knownEmptyProductIds.add(productId);
      }
      return null;
    }

    if (identityState === 'verified_present' || identityState === 'verified_absent') {
      this.knownEmptyProductIds.add(productId);
    }
    return null;
  }

  private productHasFailedDependency(productId: string): boolean {
    if (this.getDependencyState('product', productId) === 'failed') return true;

    const productState = this.getDependencyState('product', productId);
    const registryState = this.getDependencyState('registry', productId);
    if (registryState === 'failed' && productState !== 'verified_present') return true;

    const identity = registryState === 'verified_present' ? this.productIdentities.get(productId) : undefined;
    if (identity?.familyId && this.getDependencyState('family', identity.familyId) === 'failed') return true;
    return false;
  }

  private productFailureReason(productId: string): string | undefined {
    const product = this.getDependencySnapshot('product', productId);
    if (product.state === 'failed') return product.error;
    const registry = this.getDependencySnapshot('registry', productId);
    if (registry.state === 'failed') return registry.error;
    const identity = registry.state === 'verified_present' ? this.productIdentities.get(productId) : undefined;
    if (identity?.familyId) {
      const family = this.getDependencySnapshot('family', identity.familyId);
      if (family.state === 'failed') return family.error;
    }
    return undefined;
  }

  private updateStatusForSingleProduct(productId: string): void {
    if (this.productHasFailedDependency(productId)) {
      if (this.knowledgeCache.has(productId)) {
        this.setStatus('partial', this.productFailureReason(productId));
      } else {
        this.setStatus('error', this.productFailureReason(productId) ?? 'Falha ao carregar conhecimento técnico do produto.');
      }
      return;
    }
    this.setStatus('ready');
  }

  /**
   * Registra manualmente um ResolvedProductKnowledge no runtime (útil para testes e preloads locais).
   */
  public registerResolvedKnowledge(productId: string, knowledge: ResolvedProductKnowledge): void {
    this.knowledgeCache.set(productId, knowledge);
    this.setDependencyState('product', productId, 'verified_present', this.currentEpoch);
    if (this.status === 'idle') {
      this.setStatus('ready');
    }
  }

  public getActiveCatalogId(): string | undefined {
    return this.activeCatalogId;
  }

  public getResolvedKnowledge(productId: string): ResolvedProductKnowledge | undefined {
    if (!this.isProductInActiveScope(productId)) return undefined;
    return this.knowledgeCache.get(productId);
  }

  private startProductRead(productId: string, forceRefresh: boolean): Promise<ResolvedProductKnowledge | null> {
    if (!this.workbookFetcher || !this.isProductInActiveScope(productId)) {
      return Promise.resolve(null);
    }

    const epoch = this.currentEpoch;
    const flightKey = `${epoch}:${productId}`;
    const existing = this.productFlights.get(flightKey);
    if (existing) return existing;

    if (!forceRefresh) {
      const cached = this.knowledgeCache.get(productId);
      if (cached) return Promise.resolve(cached);
      const productState = this.getDependencyState('product', productId);
      if (productState === 'verified_absent' || productState === 'failed') {
        return Promise.resolve(null);
      }
    } else {
      this.invalidateProductAuthority(productId);
    }

    this.setStatus('loading');

    const request = this.performProductRead(productId, epoch)
      .then((resolved) => {
        if (this.isCurrentEpoch(epoch) && this.isProductInActiveScope(productId)) {
          this.updateStatusForSingleProduct(productId);
        }
        return resolved;
      });

    const tracked = request.finally(() => {
      if (this.productFlights.get(flightKey) === tracked) {
        this.productFlights.delete(flightKey);
      }
    });
    this.productFlights.set(flightKey, tracked);
    return tracked;
  }

  private async performProductRead(productId: string, epoch: number): Promise<ResolvedProductKnowledge | null> {
    let identity: ProductIdentity | null = null;
    if (this.registryReader) {
      try {
        identity = await this.readRegistryIdentity(productId, epoch);
      } catch {
        identity = null;
      }
    }

    if (!this.isCurrentEpoch(epoch) || !this.isProductInActiveScope(productId)) return null;

    const productRead = this.readWorkbook({ kind: 'product', id: productId }, epoch);
    const familyRead = identity?.familyId && this.getDependencyState('registry', productId) === 'verified_present'
      ? this.readWorkbook({ kind: 'family', id: identity.familyId }, epoch)
      : undefined;

    await Promise.allSettled(familyRead ? [productRead, familyRead] : [productRead]);
    if (!this.isCurrentEpoch(epoch) || !this.isProductInActiveScope(productId)) return null;

    return this.materializeVerifiedKnowledge(productId);
  }

  /**
   * Carrega sob demanda somente quando a dependência ainda não foi verificada.
   * Estados failed/verified_absent não disparam retries automáticos.
   */
  public loadProductKnowledge(productId: string): Promise<ResolvedProductKnowledge | null> {
    return this.startProductRead(productId, false);
  }

  /**
   * Revalidação autoritativa explícita. A autoridade anterior é retirada antes da rede.
   */
  public refreshProductKnowledge(productId: string): Promise<ResolvedProductKnowledge | null> {
    return this.startProductRead(productId, true);
  }

  /**
   * Retry explícito: repete somente a dependência que falhou quando isso é suficiente.
   * Assim uma falha de família em P→F não relê registry nem product workbook.
   */
  public async retryProductKnowledge(productId: string): Promise<ResolvedProductKnowledge | null> {
    if (!this.workbookFetcher || !this.isProductInActiveScope(productId)) return null;

    const epoch = this.currentEpoch;
    const flightKey = `${epoch}:${productId}`;
    const existing = this.productFlights.get(flightKey);
    if (existing) return existing;

    const productState = this.getDependencyState('product', productId);
    const registryState = this.getDependencyState('registry', productId);
    const identity = registryState === 'verified_present' ? this.productIdentities.get(productId) : undefined;
    const familyId = identity?.familyId;

    if (familyId && this.getDependencyState('family', familyId) === 'failed' && productState !== 'failed') {
      this.setStatus('loading');
      try {
        await this.readWorkbook({ kind: 'family', id: familyId }, epoch);
      } catch {
        // Estado failed já foi registrado pela leitura exata.
      }
      if (!this.isCurrentEpoch(epoch)) return null;
      const resolved = this.materializeVerifiedKnowledge(productId);
      this.updateStatusForSingleProduct(productId);
      return resolved;
    }

    if (productState === 'failed' && registryState !== 'failed') {
      this.setStatus('loading');
      try {
        await this.readWorkbook({ kind: 'product', id: productId }, epoch);
      } catch {
        // Estado failed já foi registrado pela leitura exata.
      }
      if (!this.isCurrentEpoch(epoch)) return null;
      const resolved = this.materializeVerifiedKnowledge(productId);
      this.updateStatusForSingleProduct(productId);
      return resolved;
    }

    return this.refreshProductKnowledge(productId);
  }

  public preloadCatalogProductKnowledge(catalog: Catalog): Promise<void> {
    const referencedProductIds = extractReferencedProductIds(catalog);
    const signature = `${catalog.id}:${[...referencedProductIds].sort().join(',')}`;
    const existing = this.preloadFlights.get(signature);
    if (existing) return existing;

    const request = this.preloadCatalogProductKnowledgeInternal(catalog, referencedProductIds);
    const tracked = request.finally(() => {
      if (this.preloadFlights.get(signature) === tracked) {
        this.preloadFlights.delete(signature);
      }
    });
    this.preloadFlights.set(signature, tracked);
    return tracked;
  }

  private async preloadCatalogProductKnowledgeInternal(catalog: Catalog, referencedProductIds: string[]): Promise<void> {
    const epoch = ++this.currentEpoch;
    this.activeCatalogId = catalog.id;
    this.activeProductIds = new Set(referencedProductIds);
    this.invalidateAllAuthorityForOwnerSwitch();

    this.referencedProductIds = referencedProductIds;
    this.loadedProductIds = [];
    this.failedProductIds = [];
    this.failureReasons.clear();

    if (!this.workbookFetcher) {
      this.setStatus('unavailable', 'Workbook fetcher não configurado.');
      return;
    }

    if (referencedProductIds.length === 0) {
      this.setStatus('ready');
      return;
    }

    this.setStatus('loading');

    await this.readRegistryBatch(referencedProductIds, epoch);
    if (!this.isCurrentEpoch(epoch) || catalog.id !== this.activeCatalogId) return;

    const familyIds = new Set<string>();
    for (const productId of referencedProductIds) {
      if (this.getDependencyState('registry', productId) !== 'verified_present') continue;
      const familyId = this.productIdentities.get(productId)?.familyId;
      if (familyId) familyIds.add(familyId);
    }

    const reads: Promise<unknown>[] = [];
    for (const familyId of familyIds) {
      reads.push(this.readWorkbook({ kind: 'family', id: familyId }, epoch));
    }
    for (const productId of referencedProductIds) {
      reads.push(this.readWorkbook({ kind: 'product', id: productId }, epoch));
    }
    await Promise.allSettled(reads);

    if (!this.isCurrentEpoch(epoch) || catalog.id !== this.activeCatalogId) return;

    const loadedIds: string[] = [];
    const failedIds: string[] = [];
    const reasons = new Map<string, string>();
    const knownEmpty = new Set<string>();

    for (const productId of referencedProductIds) {
      const resolved = this.materializeVerifiedKnowledge(productId);
      if (resolved || this.knownEmptyProductIds.has(productId)) {
        loadedIds.push(productId);
      } else if (this.getDependencyState('product', productId) === 'verified_present') {
        loadedIds.push(productId);
      }

      if (this.knownEmptyProductIds.has(productId)) {
        knownEmpty.add(productId);
      }
      if (this.productHasFailedDependency(productId)) {
        failedIds.push(productId);
        reasons.set(productId, this.productFailureReason(productId) ?? 'Falha ao carregar conhecimento técnico do produto.');
      }
    }

    this.loadedProductIds = loadedIds;
    this.failedProductIds = failedIds;
    this.failureReasons = reasons;
    this.knownEmptyProductIds = knownEmpty;

    if (failedIds.length === 0) {
      this.setStatus('ready');
    } else if (loadedIds.length > 0) {
      this.setStatus('partial', 'Conhecimento técnico de produtos parcialmente carregado.');
    } else {
      this.setStatus('error', 'Falha ao carregar conhecimento técnico dos produtos.');
    }
  }

  public getCompositeDatumResolver(
    getProductLegacy?: (productId: string) => LegacyProductLike | undefined | null
  ): TableDatumResolver {
    const pimResolver = createProductWorkbookDatumResolver(
      (productId: string) => this.getResolvedKnowledge(productId),
      { enableV2Literals: true }
    );

    const legacyResolver = getProductLegacy
      ? createLegacyProductFieldResolver(getProductLegacy)
      : undefined;

    return composeTableDatumResolvers(pimResolver, legacyResolver);
  }

  private async ensureProductReadIfNeeded(productId: string): Promise<void> {
    if (!this.isProductInActiveScope(productId)) return;
    if (this.knowledgeCache.has(productId)) return;
    const state = this.getDependencyState('product', productId);
    if (state === 'not_loaded' || state === 'cached_unverified') {
      await this.loadProductKnowledge(productId);
    }
  }

  public async search(productId: string | undefined, query: string): Promise<ProductKnowledgeSearchResult[]> {
    if (this.status === 'unavailable') {
      throw new Error('Conhecimento Técnico Indisponível (PIM indisponível)');
    }

    if (productId) {
      await this.ensureProductReadIfNeeded(productId);
      if (this.productHasFailedDependency(productId) && !this.knowledgeCache.has(productId)) {
        throw new Error(this.productFailureReason(productId) ?? 'Erro ao carregar conhecimento técnico.');
      }
      return this.searchLoadedProduct(productId, query);
    }

    const results: ProductKnowledgeSearchResult[] = [];
    for (const prodId of this.knowledgeCache.keys()) {
      results.push(...this.searchLoadedProduct(prodId, query));
    }
    return results;
  }

  private searchLoadedProduct(productId: string, query: string): ProductKnowledgeSearchResult[] {
    if (!this.isProductInActiveScope(productId)) return [];

    const q = query.toLowerCase().trim();
    const results: ProductKnowledgeSearchResult[] = [];
    const knowledge = this.knowledgeCache.get(productId);
    const productWb = this.getCachedWorkbook('product', productId);
    const identity = this.getCachedIdentity(productId);
    const productModel = identity?.model || identity?.code;

    if (!knowledge) return results;

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

    return results;
  }

  public async getDatum(productId: string, semanticKey: string): Promise<ProductKnowledgeDatumResult | undefined> {
    await this.ensureProductReadIfNeeded(productId);
    const knowledge = this.getResolvedKnowledge(productId);
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
    await this.ensureProductReadIfNeeded(productId);
    const knowledge = this.getResolvedKnowledge(productId);
    const productWb = this.getCachedWorkbook('product', productId);
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
    await this.ensureProductReadIfNeeded(productId);
    const knowledge = this.getResolvedKnowledge(productId);
    const productWb = this.getCachedWorkbook('product', productId);
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
