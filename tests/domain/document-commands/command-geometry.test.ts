// tests/domain/document-commands/command-geometry.test.ts
// Testes de Execução de Restrições Geométricas via Executor de Comandos.

import { describe, it, expect } from 'vitest';
import { createTable, getDefaultMaxContentWidthMm } from '../../../src/domain/table-core';
import { executeTableCommand } from '../../../src/domain/document-commands';

describe('Document Commands: Geometry Constraints Enforcement', () => {
  it('COMMAND-GEOMETRY-1: Largura inválida ou negativa na execução é rejeitada e modelo não é alterado', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const snapshot = JSON.stringify(table);

    const cmd = {
      type: 'TABLE_SET_COLUMN_WIDTH',
      tableId: table.id,
      columnId: table.columns[0].id,
      widthSpec: { mode: 'fixed_mm', widthMm: -15 }
    };

    const res = executeTableCommand(table, cmd);
    expect(res.success).toBe(false);
    expect(JSON.stringify(table)).toBe(snapshot);
  });

  it('COMMAND-GEOMETRY-2: Transbordo sobre o Content Box A4 retorna warning explícito mas permite sucesso', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const maxA4 = getDefaultMaxContentWidthMm();

    // Define largura maior que a folha A4 útil (193.0666 mm)
    const cmd = {
      type: 'TABLE_SET_TABLE_WIDTH',
      tableId: table.id,
      widthSpec: { mode: 'fixed_mm', widthMm: maxA4 + 30 }
    };

    const res = executeTableCommand(table, cmd);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.warnings).toBeDefined();
      expect(res.warnings?.some((w) => w.includes('excede a área útil'))).toBe(true);
      expect(res.data.presentation.tableWidth).toEqual({ mode: 'fixed_mm', widthMm: maxA4 + 30 });
    }
  });

  it('COMMAND-GEOMETRY-3: Restrição de largura máxima customizada é estritamente respeitada', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    // Tabela com 150mm em um container de 100mm
    const cmd = {
      type: 'TABLE_SET_TABLE_WIDTH',
      tableId: table.id,
      widthSpec: { mode: 'fixed_mm', widthMm: 150 }
    };

    const res = executeTableCommand(table, cmd, { maxAvailableWidthMm: 100 });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.warnings).toBeDefined();
      expect(res.warnings?.some((w) => w.includes('excede a área útil da página A4 (100 mm)'))).toBe(true);
    }
  });

  it('COMMAND-GEOMETRY-4: Comandos não-geométricos não produzem nem calculam warnings geométricos', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const cmd = {
      type: 'TABLE_SET_CELL_CONTENT',
      tableId: table.id,
      rowId: table.rows[0].id,
      columnId: table.columns[0].id,
      content: { kind: 'text', text: 'Sem impacto geométrico' }
    };

    const res = executeTableCommand(table, cmd);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.warnings).toBeUndefined();
    }
  });
});
