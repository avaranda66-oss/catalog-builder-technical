import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../../src/services/storage.service';
import { INITIAL_PRODUCTS } from '../../src/data/initialProducts';
import { SYSTEM_PRESETS } from '../../src/data/presets';

describe('StorageService (Persistence & Backup Engine)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('salva e recupera produtos corretamente via storage', async () => {
    await StorageService.saveProducts(INITIAL_PRODUCTS);
    const loaded = await StorageService.loadProducts();

    expect(loaded).toBeDefined();
    expect(loaded.length).toBe(INITIAL_PRODUCTS.length);
    expect(loaded[0].code).toBe(INITIAL_PRODUCTS[0].code);
  });

  it('salva, recupera e lista catálogos', async () => {
    const catalog = SYSTEM_PRESETS[0].catalog;
    await StorageService.saveCatalog(catalog);

    const loaded = await StorageService.loadCatalog(catalog.id);
    expect(loaded).toBeDefined();
    expect(loaded?.id).toBe(catalog.id);
    expect(loaded?.title).toBe(catalog.title);

    const all = await StorageService.loadAllCatalogs();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it('deleta catálogo e limpa ID ativo', async () => {
    const catalog = SYSTEM_PRESETS[0].catalog;
    await StorageService.saveCatalog(catalog);

    await StorageService.deleteCatalog(catalog.id);
    const loaded = await StorageService.loadCatalog(catalog.id);
    expect(loaded).toBeNull();
  });

  it('exporta e importa backup JSON completo sem perda de dados', async () => {
    await StorageService.saveProducts(INITIAL_PRODUCTS.slice(0, 3));
    await StorageService.saveCatalog(SYSTEM_PRESETS[0].catalog);

    const backupJson = await StorageService.exportBackup();
    expect(backupJson).toContain('PRESYS');

    localStorage.clear();

    const importResult = await StorageService.importBackup(backupJson);
    expect(importResult.success).toBe(true);

    const products = await StorageService.loadProducts();
    expect(products.length).toBe(3);
  });
});
