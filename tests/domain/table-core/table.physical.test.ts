// tests/domain/table-core/table.physical.test.ts
// Testes de Geometria Física A4 e Autoridade em Milímetros do Table Core V2.

import { describe, it, expect } from 'vitest';
import {
  createTable,
  resolveColumnWidthsMm,
  getDefaultMaxContentWidthMm
} from '../../../src/domain/table-core';
import { CANONICAL_A4_GEOMETRY, getPageContentBox } from '../../../src/domain/page-geometry';

describe('Table Core V2: Physical Geometry in mm', () => {
  it('TABLE-PHYSICAL-1: Largura fixa total maior que o Content Box gera warning explícito', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 1
    });

    const maxAvailable = getDefaultMaxContentWidthMm();

    // Configura largura da tabela maior que a página A4 útil
    table.presentation.tableWidthMode = 'fixed_mm';
    table.presentation.fixedTableWidthMm = maxAvailable + 50;

    const res = resolveColumnWidthsMm(table);

    expect(res.valid).toBe(true);
    expect(res.warnings.some((w) => w.includes('excede a área útil'))).toBe(true);
  });

  it('TABLE-PHYSICAL-2: Largura fixa menor ou igual a zero é rejeitada', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 1
    });

    table.presentation.tableWidthMode = 'fixed_mm';
    table.presentation.fixedTableWidthMm = -10;

    const res = resolveColumnWidthsMm(table);

    expect(res.valid).toBe(false);
    expect(res.error).toContain('maior que zero');
  });

  it('TABLE-PHYSICAL-3: Respeita estritamente a autoridade geométrica CANONICAL_A4_GEOMETRY', () => {
    const box = getPageContentBox(CANONICAL_A4_GEOMETRY);
    const defaultMax = getDefaultMaxContentWidthMm();

    expect(defaultMax).toBe(box.availableWidthMm);
    // 210 mm menos duas margens de ~8.4667 mm ≈ 193.0666 mm
    expect(defaultMax).toBeGreaterThan(190);
    expect(defaultMax).toBeLessThan(200);

    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'fixed_mm', widthMm: 40 }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 1
    });

    const res = resolveColumnWidthsMm(table);
    expect(res.valid).toBe(true);
    expect(res.columns[0].widthMm).toBe(40);
    expect(res.columns[1].widthMm).toBe(Number((defaultMax - 40).toFixed(4)));
  });
});
