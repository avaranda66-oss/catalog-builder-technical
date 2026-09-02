import { openDB, IDBPDatabase } from 'idb';
import { Product, ProductSchema } from '../domain/product.schema';
import { Catalog, CatalogSchema } from '../domain/catalog.schema';
import { z } from 'zod';

const DB_NAME = 'catalog_builder_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise && typeof window !== 'undefined' && window.indexedDB) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('products')) {
          db.createObjectStore('products', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('catalogs')) {
          db.createObjectStore('catalogs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      }
    });
  }
  return dbPromise;
}

export class StorageService {
  // --- Preferência de Navegação (Active Catalog ID) ---
  static getActiveCatalogId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('cb_active_catalog_id');
  }

  static setActiveCatalogId(id: string | null): void {
    if (typeof window === 'undefined') return;
    if (id) {
      localStorage.setItem('cb_active_catalog_id', id);
    } else {
      localStorage.removeItem('cb_active_catalog_id');
    }
  }

  // --- Produtos ---
  static async saveProducts(products: Product[]): Promise<void> {
    try {
      const db = await getDB();
      if (db) {
        const tx = db.transaction('products', 'readwrite');
        await tx.store.clear();
        for (const product of products) {
          await tx.store.put(product);
        }
        await tx.done;
      } else {
        localStorage.setItem('cb_products', JSON.stringify(products));
      }
    } catch (err) {
      console.warn('Fallback para localStorage em saveProducts:', err);
      localStorage.setItem('cb_products', JSON.stringify(products));
    }
  }

  static async loadProducts(): Promise<Product[]> {
    try {
      const db = await getDB();
      if (db) {
        const products = await db.getAll('products');
        if (products && products.length > 0) {
          return z.array(ProductSchema).parse(products);
        }
      }
      const raw = localStorage.getItem('cb_products');
      if (raw) {
        return z.array(ProductSchema).parse(JSON.parse(raw));
      }
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
    }
    return [];
  }

  // --- Catálogos (Cache de Conteúdo — NÃO altera cb_active_catalog_id) ---
  static async cacheCatalog(catalog: Catalog): Promise<void> {
    try {
      const db = await getDB();
      if (db) {
        await db.put('catalogs', catalog);
      } else {
        localStorage.setItem(`cb_catalog_${catalog.id}`, JSON.stringify(catalog));
      }
    } catch (err) {
      console.warn('Fallback para localStorage em cacheCatalog:', err);
      localStorage.setItem(`cb_catalog_${catalog.id}`, JSON.stringify(catalog));
    }
  }

  // Alias para retrocompatibilidade
  static async saveCatalog(catalog: Catalog): Promise<void> {
    await this.cacheCatalog(catalog);
  }

  static async loadCatalog(id?: string): Promise<Catalog | null> {
    try {
      const targetId = id || this.getActiveCatalogId();

      const db = await getDB();
      if (db) {
        if (targetId) {
          const catalog = await db.get('catalogs', targetId);
          if (catalog) return CatalogSchema.parse(catalog);
        }
        // Se não achou pelo ID, pega o primeiro
        const all = await db.getAll('catalogs');
        if (all && all.length > 0) {
          return CatalogSchema.parse(all[0]);
        }
      }

      if (targetId) {
        const raw = localStorage.getItem(`cb_catalog_${targetId}`);
        if (raw) {
          return CatalogSchema.parse(JSON.parse(raw));
        }
      }
    } catch (err) {
      console.error(`Erro ao carregar catálogo:`, err);
    }
    return null;
  }

  static async loadAllCatalogs(): Promise<Catalog[]> {
    try {
      const db = await getDB();
      if (db) {
        const catalogs = await db.getAll('catalogs');
        if (catalogs && catalogs.length > 0) {
          return z.array(CatalogSchema).parse(catalogs);
        }
      }
      const catalogs: Catalog[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cb_catalog_')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            catalogs.push(CatalogSchema.parse(JSON.parse(raw)));
          }
        }
      }
      return catalogs;
    } catch (err) {
      console.error('Erro ao carregar lista de catálogos:', err);
    }
    return [];
  }

  static async deleteCatalog(id: string): Promise<void> {
    try {
      const db = await getDB();
      if (db) {
        await db.delete('catalogs', id);
      }
      localStorage.removeItem(`cb_catalog_${id}`);
      if (this.getActiveCatalogId() === id) {
        this.setActiveCatalogId(null);
      }
    } catch (err) {
      console.error('Erro ao deletar catálogo:', err);
    }
  }

  // --- Backup Completo (JSON) ---
  static async exportBackup(): Promise<string> {
    const products = await this.loadProducts();
    const catalogs = await this.loadAllCatalogs();
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      products,
      catalogs,
      familyColumns: localStorage.getItem('cb_family_columns')
        ? JSON.parse(localStorage.getItem('cb_family_columns')!)
        : undefined,
      customPresets: localStorage.getItem('cb_custom_presets')
        ? JSON.parse(localStorage.getItem('cb_custom_presets')!)
        : undefined
    };
    return JSON.stringify(backupData, null, 2);
  }

  static async importBackup(jsonString: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = JSON.parse(jsonString);
      if (data.products && Array.isArray(data.products)) {
        await this.saveProducts(data.products);
      }
      if (data.catalogs && Array.isArray(data.catalogs)) {
        for (const cat of data.catalogs) {
          await this.cacheCatalog(cat);
        }
      }
      if (data.familyColumns) {
        localStorage.setItem('cb_family_columns', JSON.stringify(data.familyColumns));
      }
      if (data.customPresets) {
        localStorage.setItem('cb_custom_presets', JSON.stringify(data.customPresets));
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
