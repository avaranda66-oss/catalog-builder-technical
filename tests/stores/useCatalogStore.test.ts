import { describe, it, expect, beforeEach } from 'vitest';
import { useCatalogStore } from '../../src/stores/useCatalogStore';

describe('useCatalogStore', () => {
  beforeEach(() => {
    useCatalogStore.getState().createCatalogFromPreset('Catálogo de Teste TA-25N', 'preset-presys-ta-25n-datasheet');
  });

  it('deve inicializar com o preset oficial do TA-25N contendo 3 páginas', () => {
    const catalog = useCatalogStore.getState().currentCatalog;
    expect(catalog).not.toBeNull();
    expect(catalog?.pages.length).toBe(3);
    expect(catalog?.pages[0].pageType).toBe('cover');
    expect(catalog?.pages[1].pageType).toBe('technical');
    expect(catalog?.pages[2].pageType).toBe('technical');
  });

  it('deve registrar override local na tabela do catálogo sem mutar a estrutura global', () => {
    const store = useCatalogStore.getState();
    const catalog = store.currentCatalog!;
    const tableBlock = catalog.pages[1].blocks!.find((b) => b.type === 'table')!;
    const firstRow = tableBlock.tableRows![0];

    store.updateCellOverride(tableBlock.id, firstRow.id, 'range', '-25 a 140 °C (Personalizado)');

    const updatedCatalog = useCatalogStore.getState().currentCatalog!;
    const updatedTable = updatedCatalog.pages[1].blocks!.find((b) => b.type === 'table')!;
    const updatedRow = updatedTable.tableRows![0];

    expect(updatedRow.localOverrides?.['range']).toBe('-25 a 140 °C (Personalizado)');
  });

  it('deve restaurar o valor oficial removendo a chave de override local', () => {
    const store = useCatalogStore.getState();
    const catalog = store.currentCatalog!;
    const tableBlock = catalog.pages[1].blocks!.find((b) => b.type === 'table')!;
    const firstRow = tableBlock.tableRows![0];

    // Aplica override
    store.updateCellOverride(tableBlock.id, firstRow.id, 'range', '-25 a 140 °C (Personalizado)');
    const page1Table = useCatalogStore.getState().currentCatalog!.pages[1].blocks.find((b) => b.type === 'table')!;
    expect(page1Table.tableRows![0].localOverrides?.['range']).toBe('-25 a 140 °C (Personalizado)');

    // Restaura
    store.restoreCellToLibrary(tableBlock.id, firstRow.id, 'range');
    const restoredTable = useCatalogStore.getState().currentCatalog!.pages[1].blocks.find((b) => b.type === 'table')!;
    expect(restoredTable.tableRows![0].localOverrides?.['range']).toBeUndefined();
  });
});
