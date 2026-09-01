import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore } from '../../src/stores/useLibraryStore';
import { INITIAL_PRODUCTS } from '../../src/data/initialProducts';

describe('useLibraryStore (Central Engineering Library)', () => {
  beforeEach(() => {
    localStorage.clear();
    useLibraryStore.getState().resetToInitial();
  });

  it('inicia com produtos oficiais e colunas padrão', () => {
    const state = useLibraryStore.getState();
    expect(state.products.length).toBe(INITIAL_PRODUCTS.length);
    expect(state.isAdmin).toBe(true);
  });

  it('permite adicionar novo produto oficial à biblioteca', () => {
    const store = useLibraryStore.getState();
    store.addProduct({
      code: 'TEST-100',
      model: 'TEST-100-MODEL',
      family: 'Transmissores de Pressão Relativa',
      description: 'Sensor de teste',
      specs: {
        range: '0 a 50',
        unit: 'bar',
        accuracy: '±0.05% FS',
        output: '4-20 mA',
        powerSupply: '24 Vdc',
        processConnection: '1/4 NPT',
        protectionDegree: 'IP67',
        customSpecs: {}
      },
      imageUrl: ''
    });

    const updated = useLibraryStore.getState();
    const created = updated.products.find((p) => p.code === 'TEST-100');
    expect(created).toBeDefined();
    expect(created?.specs.range).toBe('0 a 50');
  });

  it('permite atualizar célula de produto diretamente', () => {
    const store = useLibraryStore.getState();
    const target = store.products[0];

    store.updateProductCell(target.id, 'range', '0 a 250');

    const updated = useLibraryStore.getState().getProduct(target.id);
    expect(updated?.specs.range).toBe('0 a 250');
  });

  it('permite gerenciar colunas dinâmicas por família', () => {
    const store = useLibraryStore.getState();
    const family = 'Transmissores de Pressão Relativa';

    store.addFamilyColumn(family, 'materialFlange', 'Material do Flange');
    const cols = store.getColumnsForFamily(family);
    expect(cols.some((c) => c.key === 'materialFlange')).toBe(true);

    store.renameFamilyColumn(family, 'materialFlange', 'Flange em Inox');
    const renamedCols = store.getColumnsForFamily(family);
    expect(renamedCols.find((c) => c.key === 'materialFlange')?.label).toBe('Flange em Inox');

    store.removeFamilyColumn(family, 'materialFlange');
    const finalCols = store.getColumnsForFamily(family);
    expect(finalCols.some((c) => c.key === 'materialFlange')).toBe(false);
  });

  it('permite deletar produto oficial', () => {
    const store = useLibraryStore.getState();
    const target = store.products[0];
    const initialCount = store.products.length;

    store.deleteProduct(target.id);

    const updated = useLibraryStore.getState();
    expect(updated.products.length).toBe(initialCount - 1);
    expect(updated.getProduct(target.id)).toBeUndefined();
  });
});
