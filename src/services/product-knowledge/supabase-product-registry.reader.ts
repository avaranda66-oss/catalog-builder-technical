// src/services/product-knowledge/supabase-product-registry.reader.ts
// Leitor concreto de identidades de produtos via Supabase (Emendas 2, 3 e 17).
// Leituras autoritativas nunca convertem falha em ausência e nunca usam cache retido como autoridade.
// Zero acoplamento com o domínio puro. Zero explicit any.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProductRegistryReader,
  ProductIdentity
} from '../../domain/table-binding/product-registry-reader.types';

export class SupabaseProductRegistryReader implements ProductRegistryReader {
  private readonly client: SupabaseClient | null;
  /** Cache apenas retido/observacional. Métodos de leitura não fazem short-circuit por ele. */
  private readonly cache = new Map<string, ProductIdentity>();
  private readonly productsByFamilyCache = new Map<string, ProductIdentity[]>();

  constructor(client?: SupabaseClient | null) {
    this.client = client ?? null;
  }

  private requireClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('[PRODUCT_REGISTRY_UNAVAILABLE] Supabase client não inicializado.');
    }
    return this.client;
  }

  private toIdentity(row: {
    id: string;
    code?: string | null;
    model?: string | null;
    name?: string | null;
    family_id?: string | null;
    family?: string | null;
  }): ProductIdentity {
    return {
      id: row.id,
      code: row.code || '',
      model: row.model || undefined,
      name: row.name || undefined,
      familyId: row.family_id || undefined,
      familyName: row.family || undefined
    };
  }

  public async getProductIdentity(productId: string): Promise<ProductIdentity | null> {
    if (!productId || productId.trim() === '') return null;
    const products = await this.getProductsByIds([productId]);
    return products[0] ?? null;
  }

  public async getProductsByIds(ids: string[]): Promise<ProductIdentity[]> {
    const validIds = Array.from(new Set(ids.filter((id) => Boolean(id && id.trim()))));
    if (validIds.length === 0) return [];

    const client = this.requireClient();
    const { data, error } = await client
      .from('products')
      .select('id, code, model, name, family_id, family')
      .in('id', validIds);

    if (error) {
      throw new Error(`[PRODUCT_REGISTRY_READ_FAILED] ${error.message}`);
    }
    if (!Array.isArray(data)) {
      throw new Error('[PRODUCT_REGISTRY_READ_FAILED] Resposta de produtos inválida.');
    }

    // Tombstone do cache retido para qualquer ID que a leitura verificada não retornou.
    for (const id of validIds) {
      this.cache.delete(id);
    }

    const result: ProductIdentity[] = [];
    for (const row of data) {
      const identity = this.toIdentity(row);
      this.cache.set(identity.id, identity);
      result.push(identity);
    }
    return result;
  }

  public async getProductsByFamilyIds(familyIds: string[]): Promise<ProductIdentity[]> {
    const validFamilyIds = Array.from(new Set(familyIds.filter((id) => Boolean(id && id.trim()))));
    if (validFamilyIds.length === 0) return [];

    const client = this.requireClient();
    const { data, error } = await client
      .from('products')
      .select('id, code, model, name, family_id, family')
      .in('family_id', validFamilyIds);

    if (error) {
      throw new Error(`[PRODUCT_REGISTRY_FAMILY_READ_FAILED] ${error.message}`);
    }
    if (!Array.isArray(data)) {
      throw new Error('[PRODUCT_REGISTRY_FAMILY_READ_FAILED] Resposta de famílias inválida.');
    }

    for (const familyId of validFamilyIds) {
      this.productsByFamilyCache.set(familyId, []);
    }

    const result: ProductIdentity[] = [];
    for (const row of data) {
      const identity = this.toIdentity(row);
      this.cache.set(identity.id, identity);
      result.push(identity);
      if (identity.familyId && validFamilyIds.includes(identity.familyId)) {
        const list = this.productsByFamilyCache.get(identity.familyId) ?? [];
        list.push(identity);
        this.productsByFamilyCache.set(identity.familyId, list);
      }
    }
    return result;
  }

  public async getAllProducts(): Promise<ProductIdentity[]> {
    const client = this.requireClient();
    const { data, error } = await client
      .from('products')
      .select('id, code, model, name, family_id, family');

    if (error) {
      throw new Error(`[PRODUCT_REGISTRY_READ_FAILED] ${error.message}`);
    }
    if (!Array.isArray(data)) {
      throw new Error('[PRODUCT_REGISTRY_READ_FAILED] Resposta de produtos inválida.');
    }

    this.cache.clear();
    this.productsByFamilyCache.clear();
    const result: ProductIdentity[] = [];
    for (const row of data) {
      const identity = this.toIdentity(row);
      this.cache.set(identity.id, identity);
      result.push(identity);
      if (identity.familyId) {
        const list = this.productsByFamilyCache.get(identity.familyId) ?? [];
        list.push(identity);
        this.productsByFamilyCache.set(identity.familyId, list);
      }
    }
    return result;
  }
}
