// src/services/product-knowledge/supabase-product-knowledge.provider.ts
// Provedor real de conhecimento de produtos conectado ao Supabase e PIM Core V1 (Emendas 2, 4, 5, 6, 8, 11, 13, 17).
// Integra RPC search_product_knowledge_v2, ProductWorkbookRepository e ProductKnowledgeRuntime.
// Estritamente Fail-Closed: NUNCA retorna dados mockados em produção. Zero explicit any.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProductKnowledgeProvider,
  ProductKnowledgeProviderStatus,
  ProductKnowledgeSearchResult,
  ProductKnowledgeDatumResult,
  TechnicalDatasetProjection,
  SavedViewProjection
} from '../../domain/table-binding/product-knowledge-provider.types';
import { ProductKnowledgeRuntime } from '../../domain/table-binding/product-knowledge.runtime';
import { ProductRegistryReader } from '../../domain/table-binding/product-registry-reader.types';
import { ProductWorkbookRepository } from '../product-workbook/persistence.types';
import { SupabaseProductWorkbookRepository } from '../product-workbook/product-workbook.repository';
import { SupabaseProductRegistryReader } from './supabase-product-registry.reader';
import { getSupabase } from '../supabase.service';
import { projectTechnicalValueFailClosed } from '../../domain/table-binding/product-workbook-datum.resolver';
import { ProductWorkbook } from '../../domain/product-workbook/types';

export interface SupabaseProductKnowledgeProviderOptions {
  readonly client?: SupabaseClient | null;
  readonly repository?: ProductWorkbookRepository;
  readonly registryReader?: ProductRegistryReader;
  readonly runtime?: ProductKnowledgeRuntime;
}

export class SupabaseProductKnowledgeProvider implements ProductKnowledgeProvider {
  private readonly client: SupabaseClient | null;
  private readonly repository: ProductWorkbookRepository;
  private readonly registryReader: ProductRegistryReader;
  private readonly runtime: ProductKnowledgeRuntime;
  private status: ProductKnowledgeProviderStatus = 'ready';

  constructor(options?: SupabaseProductKnowledgeProviderOptions) {
    this.client = options?.client !== undefined ? options.client : (options as any)?.supabaseClient !== undefined ? (options as any).supabaseClient : getSupabase();
    this.repository = options?.repository ?? new SupabaseProductWorkbookRepository(this.client);
    this.registryReader = options?.registryReader ?? new SupabaseProductRegistryReader(this.client);
    this.runtime =
      options?.runtime ??
      new ProductKnowledgeRuntime({
        registryReader: this.registryReader,
        workbookFetcher: this.repository
      });
  }

  public isAvailable(): boolean {
    if (this.status === 'unavailable' || this.status === 'error') {
      return false;
    }
    return Boolean(this.client) || this.runtime.isAvailable();
  }

  public getStatus(): ProductKnowledgeProviderStatus {
    if (this.status !== 'ready') {
      return this.status;
    }
    if (!this.client && !this.runtime.isAvailable()) {
      return 'unavailable';
    }
    return this.runtime.getStatus();
  }

  public getRuntime(): ProductKnowledgeRuntime {
    return this.runtime;
  }

  /**
   * Quando o runtime já iniciou uma leitura escopada, seu estado de autoridade
   * é exclusivo e impede RPC/repository de ressuscitar dado tombstonado ou falho.
   * Um produto ainda not_loaded segue pela RPC canônica; não há autoridade local
   * anterior a proteger nesse caso. Busca global também usa a RPC canônica.
   */
  public async search(productId: string | undefined, query: string): Promise<ProductKnowledgeSearchResult[]> {
    if (productId && this.runtime.getDependencyState('product', productId) !== 'not_loaded') {
      return this.runtime.search(productId, query);
    }

    if (!this.client) {
      return this.runtime.search(productId, query);
    }

    try {
      const { data, error } = await this.client.rpc('search_product_knowledge_v2', {
        p_query: query || null,
        p_product_id: productId || null,
        p_family_id: null,
        p_kind: null,
        p_limit: 50
      });

      if (error) {
        if (
          error.code === '42883' ||
          error.message.includes('search_product_knowledge_v2') ||
          error.message.includes('does not exist')
        ) {
          this.status = 'unavailable';
          throw new Error('Repositório de Conhecimento Indisponível (RPC search_product_knowledge_v2 inexistente)');
        }
        this.status = 'error';
        throw new Error(`[SEARCH_RPC_FAILED] ${error.message}`);
      }

      if (!Array.isArray(data)) {
        return [];
      }

      const results: ProductKnowledgeSearchResult[] = [];
      const productOwnerIds = new Set<string>();
      const familyOwnerIds = new Set<string>();

      for (const row of data) {
        if (row.owner_kind === 'family' && row.owner_id) {
          familyOwnerIds.add(row.owner_id);
        } else if (row.owner_kind === 'product' && row.owner_id) {
          productOwnerIds.add(row.owner_id);
        }
      }

      const [productIdentities, familyProducts] = await Promise.all([
        productOwnerIds.size > 0 ? this.registryReader.getProductsByIds(Array.from(productOwnerIds)) : Promise.resolve([]),
        familyOwnerIds.size > 0 ? this.registryReader.getProductsByFamilyIds(Array.from(familyOwnerIds)) : Promise.resolve([])
      ]);

      const identityMap = new Map(productIdentities.map((i) => [i.id, i]));
      const familyProductsMap = new Map<string, typeof familyProducts>();
      for (const p of familyProducts) {
        if (p.familyId) {
          const list = familyProductsMap.get(p.familyId) ?? [];
          list.push(p);
          familyProductsMap.set(p.familyId, list);
        }
      }

      const workbooksMap = new Map<string, ProductWorkbook | null>();
      const failedOwners = new Set<string>();
      const uniqueOwners: Array<{ kind: 'product' | 'family'; id: string }> = [
        ...Array.from(productOwnerIds).map((id) => ({ kind: 'product' as const, id })),
        ...Array.from(familyOwnerIds).map((id) => ({ kind: 'family' as const, id }))
      ];

      await Promise.all(
        uniqueOwners.map(async ({ kind, id }) => {
          const cacheKey = `${kind}:${id}`;
          const cached = this.runtime.getCachedWorkbook(kind, id);
          if (cached) {
            workbooksMap.set(cacheKey, cached);
            return;
          }
          try {
            const wb = await this.repository.getWorkbook({ kind, id });
            workbooksMap.set(cacheKey, wb);
          } catch {
            failedOwners.add(cacheKey);
          }
        })
      );

      const seenDatasetKeys = new Set<string>();

      for (const row of data) {
        const ownerKind = row.owner_kind as 'product' | 'family';
        const ownerId = row.owner_id;
        const ownerKey = `${ownerKind}:${ownerId}`;
        if (failedOwners.has(ownerKey)) continue;

        const wb = workbooksMap.get(ownerKey);
        // RPC hit sem workbook autoritativo é inconsistente/stale e não é bindável.
        if (!wb) continue;

        if (row.source_index === 'technical_dataset' && row.dataset_id) {
          const dedupKey = `${ownerKind}:${ownerId}:${row.dataset_id}`;
          if (seenDatasetKeys.has(dedupKey)) continue;
          seenDatasetKeys.add(dedupKey);

          const realDs = wb.schemaVersion === 2 ? wb.datasets.find((d) => d.id === row.dataset_id) : undefined;
          const semanticKey = realDs ? realDs.semanticKey : (row.semantic_key || row.dataset_id);
          const label = realDs ? realDs.label : (row.label?.split(' · ')[0] || 'Dataset Técnico');
          const description = realDs?.description;
          const sourceCount = realDs ? realDs.rows.length : 1;
          const preview = realDs ? `${realDs.rows.length} linhas × ${realDs.columns.length} colunas` : (row.value_formatted || 'Tabela de Dados');
          const revision = wb.revision;

          if (ownerKind === 'product') {
            const identity = identityMap.get(ownerId);
            results.push({
              bindable: true,
              id: row.dataset_id,
              kind: 'dataset',
              productId: ownerId,
              productModel: identity?.model || identity?.code,
              semanticKey,
              label,
              description,
              status: 'approved',
              origin: 'Dataset Local',
              sourceCount,
              preview,
              datasetId: row.dataset_id,
              sourceRevision: revision,
              sourceOwnerKind: 'product',
              sourceOwnerId: ownerId
            });
          } else {
            const productsInFamily = familyProductsMap.get(ownerId) ?? [];
            if (productsInFamily.length > 0) {
              for (const p of productsInFamily) {
                results.push({
                  bindable: true,
                  id: `${p.id}_${row.dataset_id}`,
                  kind: 'dataset',
                  productId: p.id,
                  productModel: p.model || p.code,
                  semanticKey,
                  label,
                  description,
                  status: 'approved',
                  origin: 'Dataset da Família',
                  sourceCount,
                  preview,
                  datasetId: row.dataset_id,
                  sourceRevision: revision,
                  sourceOwnerKind: 'family',
                  sourceOwnerId: ownerId
                });
              }
            } else {
              results.push({
                bindable: false,
                id: `family_${ownerId}_${row.dataset_id}`,
                kind: 'dataset',
                productId: undefined,
                productModel: undefined,
                semanticKey,
                label,
                description,
                status: 'approved',
                origin: 'Dataset da Família (Abstrato)',
                sourceCount,
                preview,
                datasetId: row.dataset_id,
                sourceRevision: revision,
                sourceOwnerKind: 'family',
                sourceOwnerId: ownerId
              });
            }
          }
          continue;
        }

        const realDatum = Object.values(wb.data).find((d) => d.semanticKey === row.semantic_key || d.id === row.semantic_key);
        const semanticKey = realDatum ? realDatum.semanticKey : row.semantic_key;
        const label = realDatum ? realDatum.label : row.label;
        const description = realDatum?.description;
        const status = realDatum ? (realDatum.status === 'approved' ? 'approved' : realDatum.status === 'draft' ? 'draft' : 'unknown') : (row.status === 'approved' ? 'approved' : row.status === 'draft' ? 'draft' : 'unknown');
        const sourceCount = realDatum?.evidence ? realDatum.evidence.length : 0;
        const preview = realDatum ? projectTechnicalValueFailClosed(realDatum.value) : (row.unit ? `${row.value_formatted} ${row.unit}` : (row.value_formatted || ''));
        const revision = wb.revision;

        if (ownerKind === 'product') {
          const identity = identityMap.get(ownerId);
          results.push({
            bindable: true,
            id: realDatum ? realDatum.id : `${ownerId}_${row.semantic_key}`,
            kind: 'datum',
            productId: ownerId,
            productModel: identity?.model || identity?.code,
            semanticKey,
            label,
            description,
            status,
            origin: 'Dado Local',
            sourceCount,
            preview,
            sourceRevision: revision,
            sourceOwnerKind: 'product',
            sourceOwnerId: ownerId
          });
        } else {
          const productsInFamily = familyProductsMap.get(ownerId) ?? [];
          if (productsInFamily.length > 0) {
            for (const p of productsInFamily) {
              results.push({
                bindable: true,
                id: `${p.id}_${realDatum ? realDatum.id : row.semantic_key}`,
                kind: 'datum',
                productId: p.id,
                productModel: p.model || p.code,
                semanticKey,
                label,
                description,
                status,
                origin: 'Herdado da Família',
                sourceCount,
                preview,
                sourceRevision: revision,
                sourceOwnerKind: 'family',
                sourceOwnerId: ownerId
              });
            }
          } else {
            results.push({
              bindable: false,
              id: `family_${ownerId}_${realDatum ? realDatum.id : row.semantic_key}`,
              kind: 'datum',
              productId: undefined,
              productModel: undefined,
              semanticKey,
              label,
              description,
              status,
              origin: 'Conhecimento da Família (Abstrato)',
              sourceCount,
              preview,
              sourceRevision: revision,
              sourceOwnerKind: 'family',
              sourceOwnerId: ownerId
            });
          }
        }
      }

      return results;
    } catch (err) {
      if (this.status === 'unavailable' || this.status === 'error') {
        throw err;
      }
      if (this.runtime.isAvailable()) {
        return this.runtime.search(productId, query);
      }
      throw err;
    }
  }

  public async getDatum(productId: string, semanticKey: string): Promise<ProductKnowledgeDatumResult | undefined> {
    return this.runtime.getDatum(productId, semanticKey);
  }

  public async getDataset(productId: string, datasetId: string): Promise<TechnicalDatasetProjection | undefined> {
    return this.runtime.getDataset(productId, datasetId);
  }

  public async getSavedView(productId: string, viewId: string): Promise<SavedViewProjection | undefined> {
    return this.runtime.getSavedView(productId, viewId);
  }
}
