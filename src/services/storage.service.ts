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

  // --- Catálogos ---
  static async saveCatalog(catalog: Catalog): Promise<void> {
    try {
      const db = await getDB();
      if (db) {
        await db.put('catalogs', catalog);
      } else {
        localStorage.setItem(`cb_catalog_${catalog.id}`, JSON.stringify(catalog));
      }
      localStorage.setItem('cb_active_catalog_id', catalog.id);
    } catch (err) {
      console.warn('Fallback para localStorage em saveCatalog:', err);
      localStorage.setItem(`cb_catalog_${catalog.id}`, JSON.stringify(catalog));
    }
  }

  static async loadCatalog(id?: string): Promise<Catalog | null> {
    try {
      const targetId = id || (typeof window !== 'undefined' ? localStorage.getItem('cb_active_catalog_id') : null);

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
      if (localStorage.getItem('cb_active_catalog_id') === id) {
        localStorage.removeItem('cb_active_catalog_id');
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
      version: 1,
      brand: 'PRESYS Instrumentos e Sistemas',
      exportedAt: new Date().toISOString(),
      products,
      catalogs
    };
    return JSON.stringify(backupData, null, 2);
  }

  static async importBackup(jsonString: string): Promise<{ success: boolean; message: string }> {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.products && Array.isArray(parsed.products)) {
        await this.saveProducts(parsed.products);
      }
      if (parsed.catalogs && Array.isArray(parsed.catalogs)) {
        for (const cat of parsed.catalogs) {
          await this.saveCatalog(cat);
        }
      }
      return { success: true, message: 'Backup importado com sucesso!' };
    } catch (err: any) {
      return { success: false, message: `Falha ao importar backup: ${err.message}` };
    }
  }
}
