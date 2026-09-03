// tests/domain/table-core/width-binding.test.ts
// Testes dos Contratos Discriminados de Largura e Semântica de Binding.

import { describe, it, expect } from 'vitest';
import {
  ColumnWidthSpecSchema,
  TableWidthSpecSchema,
  TableCellBoundContentSchema
} from '../../../src/domain/table-core/table.schema';

describe('Table Core V2: Width & Binding Contract Hardening', () => {
  it('WIDTH-SCHEMA-AUTO-1: auto com campo adicional widthMm é estritamente rejeitado', () => {
    const res = ColumnWidthSpecSchema.safeParse({
      mode: 'auto',
      widthMm: 45
    });
    expect(res.success).toBe(false);
  });

  it('WIDTH-SCHEMA-FIXED-1: fixed_mm sem widthMm é estritamente rejeitado', () => {
    const res = ColumnWidthSpecSchema.safeParse({
      mode: 'fixed_mm'
    });
    expect(res.success).toBe(false);
  });

  it('WIDTH-SCHEMA-WEIGHTED-1: weighted sem weight é estritamente rejeitado', () => {
    const res = ColumnWidthSpecSchema.safeParse({
      mode: 'weighted'
    });
    expect(res.success).toBe(false);
  });

  it('WIDTH-SCHEMA-CROSS-1: campos cruzados irrelevantes são rejeitados', () => {
    // fixed_mm com weight
    const res1 = ColumnWidthSpecSchema.safeParse({
      mode: 'fixed_mm',
      widthMm: 40,
      weight: 2
    });
    expect(res1.success).toBe(false);

    // weighted com widthMm
    const res2 = ColumnWidthSpecSchema.safeParse({
      mode: 'weighted',
      weight: 1.5,
      widthMm: 50
    });
    expect(res2.success).toBe(false);
  });

  it('TABLE-WIDTH-1: largura fixa da tabela exige widthMm estritamente positivo', () => {
    const missing = TableWidthSpecSchema.safeParse({
      mode: 'fixed_mm'
    });
    expect(missing.success).toBe(false);

    const negative = TableWidthSpecSchema.safeParse({
      mode: 'fixed_mm',
      widthMm: -20
    });
    expect(negative.success).toBe(false);

    const valid = TableWidthSpecSchema.safeParse({
      mode: 'fixed_mm',
      widthMm: 180
    });
    expect(valid.success).toBe(true);

    const autoFill = TableWidthSpecSchema.safeParse({
      mode: 'auto_fill'
    });
    expect(autoFill.success).toBe(true);
  });

  it('BINDING-DATUM-1: datum_reference com bindingMode="literal" é estritamente proibido', () => {
    const res = TableCellBoundContentSchema.safeParse({
      kind: 'datum_reference',
      productId: 'prod_123',
      datumKey: 'accuracy',
      bindingMode: 'literal'
    });
    expect(res.success).toBe(false);
  });

  it('BINDING-SNAPSHOT-1: datum_reference em modo "snapshot" exige snapshot materializado', () => {
    const res = TableCellBoundContentSchema.safeParse({
      kind: 'datum_reference',
      productId: 'prod_123',
      datumKey: 'accuracy',
      bindingMode: 'snapshot'
      // faltando snapshot obrigatório!
    });
    expect(res.success).toBe(false);
  });

  it('BINDING-SNAPSHOT-2: datum_reference em modo "snapshot" com snapshot válido é aceito', () => {
    const res = TableCellBoundContentSchema.safeParse({
      kind: 'datum_reference',
      productId: 'prod_123',
      datumKey: 'accuracy',
      bindingMode: 'snapshot',
      snapshot: {
        kind: 'value_unit',
        amount: 0.025,
        unit: '% FE',
        qualifier: '±'
      }
    });
    expect(res.success).toBe(true);
  });
});
