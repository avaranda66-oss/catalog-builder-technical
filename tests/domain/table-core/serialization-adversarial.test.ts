// tests/domain/table-core/serialization-adversarial.test.ts
// Testes de Fronteira de Serialização e Bateria de Testes Adversariais / Fuzzing Determinístico.

import { describe, it, expect } from 'vitest';
import {
  createTable,
  addRow,
  addColumn,
  setCellContent,
  mergeCells,
  unmergeCell,
  reorderRows,
  reorderColumns,
  setTableWidth,
  applyTablePreset,
  validateTableModel,
  parseTableCoreModel,
  TablePresetId
} from '../../../src/domain/table-core';
import { parseTableCommand, executeTableCommand } from '../../../src/domain/document-commands';

describe('Table Core V2: Serialization Boundary & Adversarial Suite', () => {
  it('SERIALIZATION-1: Versão de schema diferente de 1 é rejeitada explicitamente', () => {
    const invalidVersion = {
      id: 'tbl_v2',
      schemaVersion: 2 // não suportado!
    };

    const res = parseTableCoreModel(invalidVersion);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.errorCode).toBe('UNSUPPORTED_SCHEMA_VERSION');
    }
  });

  it('SERIALIZATION-2: Roundtrip JSON.stringify -> JSON.parse preserva integridade semântica total', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'p1', defaultLabel: 'Pressão', widthSpec: { mode: 'fixed_mm', widthMm: 50 }, align: 'left' },
        { semanticKey: 'u1', defaultLabel: 'Unidade', widthSpec: { mode: 'auto' }, align: 'center' }
      ],
      rowsCount: 2
    });

    const populated = setCellContent(table, table.rows[0].id, table.columns[0].id, {
      kind: 'value_unit',
      amount: 100,
      unit: 'bar',
      qualifier: '≤'
    });

    const jsonStr = JSON.stringify(populated);
    const parsedRaw = JSON.parse(jsonStr);

    const parseResult = parseTableCoreModel(parsedRaw);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data).toEqual(populated);
    }
  });

  it('SERIALIZATION-3: parseTableCommand rejeita payloads maliciosos ou desconhecidos', () => {
    const malicious = {
      type: 'TABLE_ADD_ROW',
      tableId: 'tbl_1',
      __proto__: { admin: true },
      unexpectedScript: '<script>alert(1)</script>'
    };

    const res = parseTableCommand(malicious);
    // Como os schemas são .strict(), campos inesperados causam falha imediata
    expect(res.success).toBe(false);
  });

  it('ADVERSARIAL-1: Bateria determinística sobre 50 tabelas executando sequências multi-operação', () => {
    const presets: TablePresetId[] = [
      'presys_clean_technical',
      'dense_spec_matrix',
      'model_comparison',
      'parameter_value'
    ];

    for (let i = 0; i < 50; i++) {
      const presetId = presets[i % presets.length];
      const initialCols = (i % 3) + 2; // 2 a 4 colunas
      const initialRows = (i % 4) + 2; // 2 a 5 linhas

      // 1. Criar
      let table = createTable({
        id: `tbl_adv_${i}`,
        title: `Tabela Adversarial #${i}`,
        columns: Array.from({ length: initialCols }, (_, c) => ({
          semanticKey: `col_${c}`,
          defaultLabel: `Coluna ${c}`,
          widthSpec: { mode: 'auto' },
          align: 'left'
        })),
        rowsCount: initialRows,
        presetId
      });
      expect(validateTableModel(table).valid).toBe(true);

      // 2. Adicionar linha
      table = addRow(table, { kind: 'data' });
      expect(validateTableModel(table).valid).toBe(true);

      // 3. Adicionar coluna
      table = addColumn(table, {
        semanticKey: `col_extra_${i}`,
        defaultLabel: 'Extra',
        widthSpec: { mode: 'fixed_mm', widthMm: 30 },
        align: 'right'
      });
      expect(validateTableModel(table).valid).toBe(true);

      // 4. Inserir conteúdo tipado em uma célula
      const targetRow = table.rows[0].id;
      const targetCol = table.columns[0].id;
      table = setCellContent(table, targetRow, targetCol, {
        kind: 'number',
        value: i * 1.5,
        format: { decimals: 2 }
      });
      expect(validateTableModel(table).valid).toBe(true);

      // 5. Mesclar duas células vazias na última linha
      const lastRowId = table.rows[table.rows.length - 1].id;
      const colA = table.columns[0].id;
      table = mergeCells(table, lastRowId, colA, 2, 1);
      expect(validateTableModel(table).valid).toBe(true);

      // 6. Desfazer mesclagem
      table = unmergeCell(table, lastRowId, colA);
      expect(validateTableModel(table).valid).toBe(true);

      // 7. Reordenar linhas
      const reversedRowIds = [...table.rows.map((r) => r.id)].reverse();
      table = reorderRows(table, reversedRowIds);
      expect(validateTableModel(table).valid).toBe(true);

      // 8. Reordenar colunas
      const reversedColIds = [...table.columns.map((c) => c.id)].reverse();
      table = reorderColumns(table, reversedColIds);
      expect(validateTableModel(table).valid).toBe(true);

      // 9. Alterar largura total
      table = setTableWidth(table, { mode: 'fixed_mm', widthMm: 175 });
      expect(validateTableModel(table).valid).toBe(true);

      // 10. Aplicar outro preset
      table = applyTablePreset(table, presets[(i + 1) % presets.length]);
      expect(validateTableModel(table).valid).toBe(true);

      // 11. Teste de falha: Comando com ID errado não contamina o modelo
      const snapshot = JSON.stringify(table);
      const failRes = executeTableCommand(table, {
        type: 'TABLE_REMOVE_ROW',
        tableId: 'tabela_completamente_errada',
        rowId: table.rows[0].id
      });
      expect(failRes.success).toBe(false);
      expect(JSON.stringify(table)).toBe(snapshot);
    }
  });
});
