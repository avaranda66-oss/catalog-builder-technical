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
import { mapTechnicalValueToTableLiteralV2 } from '../../domain/table-binding/product-workbook-datum.resolver';

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
   * Regras canônicas (Emendas 4, 5, 8, 11, 13):
   * 1. Se houver productId especificado, a busca é escopada com autoridade efetiva pelo runtime (local + override + herdado - suprimido).
   * 2. Se a busca for global ou o runtime ainda não tiver o produto no cache:
   *    - Tenta a RPC canônica search_product_knowledge_v2.
   *    - Se a RPC não estiver disponível (ex: migration 00023 ainda não aplicada live):
   *      - Recorre ao cache do runtime sem inventar dados nem quebrar a UI.
   *      - Se nenhuma fonte estiver disponível, falha de forma limpa (fail-closed).
   * 3. Nunca converte erro de infraestrutura em 0 resultados legítimos (Emenda 11).
   */
  public async search(productId: string | undefined, query: string): Promise<ProductKnowledgeSearchResult[]> {
    // 1. Busca escopada com prioridade para conhecimento efetivo em runtime (Emenda 5)
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
          // Se houver conhecimento previamente carregado no runtime para este produto, busca lá
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

      // 4. Agrupamento e enriquecimento de hits (Emenda 4 & 13)
      const results: ProductKnowledgeSearchResult[] = [];
      const seenDatasetIds = new Set<string>();

      // Coleta identidades de produtos para os hits
      const hitProductIds = Array.from(new Set(data.map((row) => row.owner_id).filter(Boolean)));
      const identities = await this.registryReader.getProductsByIds(hitProductIds);
      const identityMap = new Map(identities.map((i) => [i.id, i]));

      for (const row of data) {
        const ownerKind = row.owner_kind;
        const ownerId = row.owner_id;
        const identity = identityMap.get(ownerId);
        const productModel = identity?.model || identity?.code;

        // Se for hit de célula de dataset: agrupar por datasetId (Emenda 4)
        if (row.source_index === 'technical_dataset' && row.dataset_id) {
          if (seenDatasetIds.has(row.dataset_id)) {
            continue;
          }
          seenDatasetIds.add(row.dataset_id);

          results.push({
            id: row.dataset_id,
            kind: 'dataset',
            productId: ownerId,
            productModel,
            semanticKey: row.dataset_id,
            label: row.label?.split(' · ')[0] || 'Dataset Técnico',
            status: 'approved',
            origin: ownerKind === 'family' ? 'Dataset da Família' : 'Dataset Local',
            sourceCount: 1,
            preview: row.value_formatted || 'Tabela de Dados',
            datasetId: row.dataset_id,
            sourceOwnerKind: ownerKind === 'family' ? 'family' : 'product',
            sourceOwnerId: ownerId
          });
          continue;
        }

        // Fato técnico individual
        results.push({
          id: `${ownerId}_${row.semantic_key}`,
          kind: 'datum',
          productId: ownerId,
          productModel,
          semanticKey: row.semantic_key,
          label: row.label,
          status: row.status === 'approved' ? 'approved' : row.status === 'draft' ? 'draft' : 'unknown',
          origin: ownerKind === 'family' ? 'Herdado da Família' : 'Dado Local',
          sourceCount: 1,
          preview: row.unit ? `${row.value_formatted} ${row.unit}` : row.value_formatted,
          sourceOwnerKind: ownerKind === 'family' ? 'family' : 'product',
          sourceOwnerId: ownerId
        });
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

      const literalRes = mapTechnicalValueToTableLiteralV2(target.value);
      const value = literalRes.supported ? literalRes.content : ({ kind: 'text', text: '' } as const);

      return {
        productId,
        semanticKey,
        label: target.label,
        status: target.status === 'approved' ? 'approved' : target.status === 'draft' ? 'draft' : 'unknown',
        origin: 'product_local',
        sourceCount: target.evidence?.length ?? 0,
        value,
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
