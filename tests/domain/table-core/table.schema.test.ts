// tests/domain/table-core/table.schema.test.ts
// Testes de Validação de Schema e Invariantes Estruturais do Table Core V2.

import { describe, it, expect } from 'vitest';
import {
  TableCoreModel,
  TableCoreModelSchema,
  createTable,
  validateTableModel,
  getCellKey
} from '../../../src/domain/table-core';

describe('Table Core V2: Schema & Invariants', () => {
  it('TABLE-SCHEMA-1: Tabela mínima válida passa no Zod e no validador de domínio', () => {
    const table = createTable({
      title: 'Tabela de Teste',
      columns: [
        { semanticKey: 'code', defaultLabel: 'Código', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'range', defaultLabel: 'Faixa', widthSpec: { mode: 'fixed_mm', widthMm: 50 }, align: 'left' }
      ],
      rowsCount: 2
    });

    const zodResult = TableCoreModelSchema.safeParse(table);
    expect(zodResult.success).toBe(true);

    const validation = validateTableModel(table);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('TABLE-SCHEMA-2: Linhas com IDs duplicados são estritamente rejeitadas', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 2
    });

    // Força ID duplicado
    const corrupted: TableCoreModel = {
      ...table,
      rows: [
        { id: 'dup_row', kind: 'data' },
        { id: 'dup_row', kind: 'data' }
      ]
    };

    const validation = validateTableModel(corrupted);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('ID de linha duplicado'))).toBe(true);
  });

  it('TABLE-SCHEMA-3: Colunas com IDs duplicados são estritamente rejeitadas', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 1
    });

    const corrupted: TableCoreModel = {
      ...table,
      columns: [
        { ...table.columns[0], id: 'dup_col' },
        { ...table.columns[1], id: 'dup_col' }
      ]
    };

    const validation = validateTableModel(corrupted);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('ID de coluna duplicado'))).toBe(true);
  });

  it('TABLE-SCHEMA-4: Células com IDs duplicados são estritamente rejeitadas', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 1
    });

    const cellKeys = Object.keys(table.cells);
    const corruptedCells = { ...table.cells };
    corruptedCells[cellKeys[1]] = {
      ...corruptedCells[cellKeys[1]],
      id: corruptedCells[cellKeys[0]].id // mesmo ID
    };

    const corrupted: TableCoreModel = {
      ...table,
      cells: corruptedCells
    };

    const validation = validateTableModel(corrupted);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('ID de célula duplicado'))).toBe(true);
  });

  it('TABLE-SCHEMA-5: Células com referências órfãs de rowId ou columnId são rejeitadas', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const orphanKey = getCellKey('ghost_row', 'ghost_col');
    const corrupted: TableCoreModel = {
      ...table,
      cells: {
        ...table.cells,
        [orphanKey]: {
          id: 'cell_ghost',
          rowId: 'ghost_row',
          columnId: 'ghost_col',
          content: { kind: 'empty' },
          colSpan: 1,
          rowSpan: 1
        }
      }
    };

    const validation = validateTableModel(corrupted);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('referencia rowId inexistente'))).toBe(true);
    expect(validation.errors.some((e) => e.includes('referencia columnId inexistente'))).toBe(true);
  });

  it('TABLE-SCHEMA-6: Largura fixed_mm não-positiva é rejeitada pelo schema Zod', () => {
    const invalidSpec = {
      mode: 'fixed_mm',
      widthMm: -10
    };

    const parseRes = TableCoreModelSchema.safeParse({
      id: 'tbl_test',
      schemaVersion: 1,
      columns: [
        {
          id: 'col_1',
          semanticKey: 'k1',
          defaultLabel: 'L1',
          widthSpec: invalidSpec,
          align: 'left'
        }
      ],
      rows: [{ id: 'r1', kind: 'data' }],
      cells: {
        [getCellKey('r1', 'col_1')]: {
          id: 'c1',
          rowId: 'r1',
          columnId: 'col_1',
          content: { kind: 'empty' },
          colSpan: 1,
          rowSpan: 1
        }
      },
      presentation: {
        presetId: 'presys_clean_technical',
        density: 'regular',
        borderStyle: 'all',
        stripeStyle: 'none',
        headerBackgroundToken: 'slate_900',
        headerTextColorToken: 'white',
        fontScale: 'normal',
        tableWidth: { mode: 'auto_fill' }
      },
      paginationPolicy: {
        allowRowSplit: false,
        repeatHeaderOnBreak: true,
        keepHeaderWithFirstRow: true,
        minOrphanRows: 1
      }
    });

    expect(parseRes.success).toBe(false);
  });
});
