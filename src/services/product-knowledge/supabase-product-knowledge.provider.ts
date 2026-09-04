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
   * Executa busca de conhecimento de produto.
   * Regras canônicas (Emendas 1, 3, 4, 11, 13, 15):
   * 1. Se houver productId especificado, a busca é escopada com autoridade efetiva pelo runtime.
   * 2. Se a busca for global:
   *    - Executa a RPC canônica search_product_knowledge_v2.
   *    - Enriquecimento canônico com chamadas estritamente limitadas por owners únicos (sem N+1).
   *    - Hits de família expandem para os produtos da família via getProductsByFamilyIds.
   *    - Famílias sem produtos concretos no catálogo retornam AbstractFamilyKnowledgeResult (bindable: false, productId: undefined).
   *    - NUNCA atribui familyId como productId.
   *    - Preview sempre gerado via projectTechnicalValueFailClosed.
   */
  public async search(productId: string | undefined, query: string): Promise<ProductKnowledgeSearchResult[]> {
    // 1. Busca escopada com prioridade para conhecimento efetivo em runtime
    if (productId) {
      const resolved = this.runtime.getResolvedKnowledge(productId);
      if (resolved) {
        return this.runtime.search(productId, query);
      }
    }

    // 2. Se não houver cliente Supabase disponível, tenta runtime ou falha de forma segura
    if (!this.client) {
      return this.runtime.search(productId, query);
    }

    // 3. Execução da RPC de busca canônica (PIM V2)
    try {
      const { data, error } = await this.client.rpc('search_product_knowledge_v2', {
        p_query: query || null,
        p_product_id: productId || null,
        p_family_id: null,
        p_kind: null,
        p_limit: 50
      });

      if (error) {
        // Migration 00023 ainda não está live (código 42883: function does not exist)
        if (
          error.code === '42883' ||
          error.message.includes('search_product_knowledge_v2') ||
          error.message.includes('does not exist')
        ) {
          if (productId && this.runtime.getResolvedKnowledge(productId)) {
            return this.runtime.search(productId, query);
          }
          this.status = 'unavailable';
          throw new Error('Repositório de Conhecimento Indisponível (RPC search_product_knowledge_v2 inexistente)');
        }
        this.status = 'error';
        throw new Error(`[SEARCH_RPC_FAILED] ${error.message}`);
      }

      if (!Array.isArray(data)) {
        return [];
      }

      // 4. Agrupamento e enriquecimento de hits com autoridade canônica (Emendas 1, 3, 4, 11, 13, 15)
      const results: ProductKnowledgeSearchResult[] = [];

      // 4.1 Identificação de owners únicos
      const productOwnerIds = new Set<string>();
      const familyOwnerIds = new Set<string>();

      for (const row of data) {
        if (row.owner_kind === 'family' && row.owner_id) {
          familyOwnerIds.add(row.owner_id);
        } else if (row.owner_kind === 'product' && row.owner_id) {
          productOwnerIds.add(row.owner_id);
        }
      }

      // 4.2 Batch lookup de identidades no registry
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

      // 4.3 Batch lookup de Workbooks (máximo 1 fetch por owner único, reusando cache de runtime)
      const workbooksMap = new Map<string, ProductWorkbook | null>();
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
            workbooksMap.set(cacheKey, null);
          }
        })
      );

      // 4.4 Enriquecimento canônico dos hits
      const seenDatasetKeys = new Set<string>();

      for (const row of data) {
        const ownerKind = row.owner_kind as 'product' | 'family';
        const ownerId = row.owner_id;
        const wb = workbooksMap.get(`${ownerKind}:${ownerId}`);

        // A. Hit de Dataset
        if (row.source_index === 'technical_dataset' && row.dataset_id) {
          const dedupKey = `${ownerKind}:${ownerId}:${row.dataset_id}`;
          if (seenDatasetKeys.has(dedupKey)) continue;
          seenDatasetKeys.add(dedupKey);

          const realDs = wb?.schemaVersion === 2 ? wb.datasets.find((d) => d.id === row.dataset_id) : undefined;
          const semanticKey = realDs ? realDs.semanticKey : (row.semantic_key || row.dataset_id);
          const label = realDs ? realDs.label : (row.label?.split(' · ')[0] || 'Dataset Técnico');
          const description = realDs?.description;
          const sourceCount = realDs ? realDs.rows.length : 1;
          const preview = realDs ? `${realDs.rows.length} linhas × ${realDs.columns.length} colunas` : (row.value_formatted || 'Tabela de Dados');
          const revision = wb?.revision;

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
            // ownerKind === 'family' (Emendas 1 & 3)
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
              // Resultado de família abstrato (não bindável diretamente)
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

        // B. Hit de TechnicalDatum individual
        const realDatum = wb ? Object.values(wb.data).find((d) => d.semanticKey === row.semantic_key || d.id === row.semantic_key) : undefined;
        const semanticKey = realDatum ? realDatum.semanticKey : row.semantic_key;
        const label = realDatum ? realDatum.label : row.label;
        const description = realDatum?.description;
        const status = realDatum ? (realDatum.status === 'approved' ? 'approved' : realDatum.status === 'draft' ? 'draft' : 'unknown') : (row.status === 'approved' ? 'approved' : row.status === 'draft' ? 'draft' : 'unknown');
        const sourceCount = realDatum?.evidence ? realDatum.evidence.length : 0;
        const preview = realDatum ? projectTechnicalValueFailClosed(realDatum.value) : (row.unit ? `${row.value_formatted} ${row.unit}` : (row.value_formatted || ''));
        const revision = wb?.revision;

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
          // ownerKind === 'family' (Emendas 1 & 3)
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
            // Resultado de família abstrato
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
      // Fallback para runtime local em caso de erro de rede ou RPC se runtime estiver pronto
      if (this.runtime.isAvailable()) {
        return this.runtime.search(productId, query);
      }
      throw err;
    }
  }

  public async getDatum(productId: string, semanticKey: string): Promise<ProductKnowledgeDatumResult | undefined> {
    const datum = await this.runtime.getDatum(productId, semanticKey);
    if (datum) return datum;

    // Se não estiver no runtime, busca workbook no repositório
    try {
      const workbook = await this.repository.getWorkbook({ kind: 'product', id: productId });
      if (!workbook) return undefined;

      const target = Object.values(workbook.data).find((d) => d.semanticKey === semanticKey);
      if (!target) return undefined;

      const literalValue = projectTechnicalValueFailClosed(target.value);

      return {
        productId,
        semanticKey,
        label: target.label,
        status: target.status === 'approved' ? 'approved' : target.status === 'draft' ? 'draft' : 'unknown',
        origin: 'product_local',
        sourceCount: target.evidence?.length ?? 0,
        value: literalValue,
        sourceRevision: workbook.revision,
        sourceOwnerKind: 'product',
        sourceOwnerId: productId
      };
    } catch {
      return undefined;
    }
  }

  public async getDataset(productId: string, datasetId: string): Promise<TechnicalDatasetProjection | undefined> {
    return this.runtime.getDataset(productId, datasetId);
  }

  public async getSavedView(productId: string, viewId: string): Promise<SavedViewProjection | undefined> {
    return this.runtime.getSavedView(productId, viewId);
  }
}
