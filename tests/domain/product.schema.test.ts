import { describe, it, expect } from 'vitest';
import { ProductSchema } from '../../src/domain/product.schema';

describe('Product & TechnicalSpec Zod Schemas', () => {
  it('deve validar com sucesso um produto com especificações técnicas completas', () => {
    const validProduct = {
      id: 'prod-123',
      code: 'PCON-200',
      family: 'Transmissores de Pressão',
      model: 'PCON-200-G',
      description: 'Sensor inteligente',
      specs: {
        range: '0 a 100',
        unit: 'bar',
        accuracy: '±0.075% FS',
        output: '4-20 mA HART',
        powerSupply: '24 Vdc',
        processConnection: '1/2" NPT',
        protectionDegree: 'IP67'
      }
    };

    const parsed = ProductSchema.parse(validProduct);
    expect(parsed.code).toBe('PCON-200');
    expect(parsed.specs.unit).toBe('bar');
    expect(parsed.version).toBe(1);
  });

  it('deve falhar se código ou modelo estiverem vazios', () => {
    const invalidProduct = {
      id: 'prod-123',
      code: '',
      family: 'Transmissores',
      model: '',
      specs: {
        range: '0 a 100',
        unit: 'bar',
        accuracy: '0.1%'
      }
    };

    expect(() => ProductSchema.parse(invalidProduct)).toThrow();
  });
});
