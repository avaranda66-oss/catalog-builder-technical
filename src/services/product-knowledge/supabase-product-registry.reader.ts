// src/services/product-knowledge/supabase-product-registry.reader.ts
// Leitor concreto de identidades de produtos via Supabase (Emendas 2, 3 e 17).
// Elimina consultas N+1 utilizando queries em batch com filtro .in('id', ids).
// Zero acoplamento com o domínio puro. Zero explicit any.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProductRegistryReader,
  ProductIdentity
} from '../../domain/table-binding/product-registry-reader.types';

export class SupabaseProductRegistryReader implements ProductRegistryReader {
  private readonly client: SupabaseClient | null;
  private readonly cache = new Map<string, ProductIdentity>();
  private readonly loadedFamilyIds = new Set<string>();
  private readonly productsByFamilyCache = new Map<string, ProductIdentity[]>();

  constructor(client?: SupabaseClient | null) {
    this.client = client ?? null;
  }

  public async getProductIdentity(productId: string): Promise<ProductIdentity | null> {
    if (!productId || productId.trim() === '') return null;

    const cached = this.cache.get(productId);
    if (cached) return cached;

    const products = await this.getProductsByIds([productId]);
    return products[0] ?? null;
  }

  public async getProductsByIds(ids: string[]): Promise<ProductIdentity[]> {
    const validIds = Array.from(new Set(ids.filter((id) => Boolean(id && id.trim()))));
    if (validIds.length === 0) return [];

    const result: ProductIdentity[] = [];
    const missingIds: string[] = [];

    for (const id of validIds) {
      const cached = this.cache.get(id);
      if (cached) {
        result.push(cached);
      } else {
        missingIds.push(id);
      }
    }

    if (missingIds.length === 0 || !this.client) {
      return result;
    }

    try {
      const { data, error } = await this.client
        .from('products')
        .select('id, code, model, name, family_id, family')
        .in('id', missingIds);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const identity: ProductIdentity = {
            id: row.id,
            code: row.code || '',
            model: row.model || undefined,
            name: row.name || undefined,
            familyId: row.family_id || undefined,
            familyName: row.family || undefined
          };
          this.cache.set(identity.id, identity);
          result.push(identity);
        }
      }
    } catch {
      // Falha segura: retorna os itens que estiverem disponíveis no cache
    }

    return result;
  }

  public async getProductsByFamilyIds(familyIds: string[]): Promise<ProductIdentity[]> {
    const validFamilyIds = Array.from(new Set(familyIds.filter((id) => Boolean(id && id.trim()))));
    if (validFamilyIds.length === 0) return [];

    const missingFamilyIds = validFamilyIds.filter((fid) => !this.loadedFamilyIds.has(fid));

    if (missingFamilyIds.length > 0 && this.client) {
      try {
        const { data, error } = await this.client
          .from('products')
          .select('id, code, model, name, family_id, family')
          .in('family_id', missingFamilyIds);

        if (!error && Array.isArray(data)) {
          for (const fid of missingFamilyIds) {
            if (!this.productsByFamilyCache.has(fid)) {
              this.productsByFamilyCache.set(fid, []);
            }
            this.loadedFamilyIds.add(fid);
          }

          for (const row of data) {
            const identity: ProductIdentity = {
              id: row.id,
              code: row.code || '',
              model: row.model || undefined,
              name: row.name || undefined,
              familyId: row.family_id || undefined,
              familyName: row.family || undefined
            };
            this.cache.set(identity.id, identity);
            if (row.family_id) {
              const list = this.productsByFamilyCache.get(row.family_id) || [];
              list.push(identity);
              this.productsByFamilyCache.set(row.family_id, list);
            }
          }
        }
      } catch {
        // Falha segura
      }
    }

    const results: ProductIdentity[] = [];
    for (const fid of validFamilyIds) {
      const list = this.productsByFamilyCache.get(fid);
      if (list) {
        results.push(...list);
      }
    }
    return results;
  }

  public async getAllProducts(): Promise<ProductIdentity[]> {
    if (!this.client) {
      return Array.from(this.cache.values());
    }

    try {
      const { data, error } = await this.client
        .from('products')
        .select('id, code, model, name, family_id, family');

      if (!error && Array.isArray(data)) {
        const list: ProductIdentity[] = [];
        for (const row of data) {
          const identity: ProductIdentity = {
            id: row.id,
            code: row.code || '',
            model: row.model || undefined,
            name: row.name || undefined,
            familyId: row.family_id || undefined,
            familyName: row.family || undefined
          };
          this.cache.set(identity.id, identity);
          list.push(identity);
        }
        return list;
      }
    } catch {
      // Fallback para cache local
    }

    return Array.from(this.cache.values());
  }
}
