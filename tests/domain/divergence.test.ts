import { describe, it, expect } from 'vitest';
import {
  calculateRowDivergences,
  getFieldDivergence,
  getEffectiveValue
} from '../../src/domain/divergence';
import { Product } from '../../src/domain/product.schema';
import { CatalogTableRow } from '../../src/domain/catalog.schema';

describe('Divergence Engine', () => {
  const mockProduct: Product = {
    id: 'prod-pcon-200',
    code: 'PCON-200',
    family: 'Transmissores',
    model: 'PCON-200-G',
    description: 'Sensor de Pressão',
    specs: {
      range: '0 a 100',
      unit: 'bar',
      accuracy: '±0.075% FS',
      output: '4-20 mA HART',
      powerSupply: '24 Vdc',
      processConnection: '1/2" NPT',
      protectionDegree: 'IP67',
      customSpecs: {}
    },
    imageUrl: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1
  };

  it('deve retornar o valor da biblioteca quando não houver override local', () => {
    const row: CatalogTableRow = {
      id: 'row-1',
      productRefId: 'prod-pcon-200',
      localOverrides: {},
      customNotes: '',
      order: 0
    };

    const val = getEffectiveValue(row, mockProduct, 'range');
    expect(val).toBe('0 a 100');

    const div = getFieldDivergence(row, mockProduct, 'range');
    expect(div).toBeNull();
  });

  it('deve retornar o valor local customizado e acusar divergência quando o valor for diferente', () => {
    const row: CatalogTableRow = {
      id: 'row-1',
      productRefId: 'prod-pcon-200',
      localOverrides: {
        range: '0 a 80' // Customizado localmente no catálogo
      },
      customNotes: '',
      order: 0
    };

    const val = getEffectiveValue(row, mockProduct, 'range');
    expect(val).toBe('0 a 80');

    const div = getFieldDivergence(row, mockProduct, 'range');
    expect(div).not.toBeNull();
    expect(div?.hasDivergence).toBe(true);
    expect(div?.localValue).toBe('0 a 80');
    expect(div?.libraryValue).toBe('0 a 100');
  });

  it('não deve acusar divergência se o override tiver exatamente o mesmo valor da biblioteca', () => {
    const row: CatalogTableRow = {
      id: 'row-1',
      productRefId: 'prod-pcon-200',
      localOverrides: {
        range: '0 a 100' // Mesmo valor
      },
      customNotes: '',
      order: 0
    };

    const divs = calculateRowDivergences(row, mockProduct);
    expect(divs.length).toBe(0);
  });
});
