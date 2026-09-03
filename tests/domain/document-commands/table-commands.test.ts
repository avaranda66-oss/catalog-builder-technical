// tests/domain/document-commands/table-commands.test.ts
// Testes do Protocolo Canônico de Comandos do Table Core V2.
// Demonstra validação contra payloads inválidos, target mismatch e paridade de segurança para IA.

import { describe, it, expect } from 'vitest';
import { createTable, getCellKey } from '../../../src/domain/table-core';
import {
  executeTableCommand,
  TableAddRowCommand,
  TableSetCellContentCommand,
  TableApplyPresetCommand
} from '../../../src/domain/document-commands';

describe('Document Command Protocol: Table Commands & Executor', () => {
  it('COMMAND-TABLE-1: Comando válido executa e retorna novo modelo atualizado', () => {
    const table = createTable({
      columns: [{ semanticKey: 'code', defaultLabel: 'Código', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const cmd: TableAddRowCommand = {
      type: 'TABLE_ADD_ROW',
      tableId: table.id,
      row: { kind: 'data', minHeightMm: 12 },
      origin: 'inspector'
    };

    const res = executeTableCommand(table, cmd);

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.rows).toHaveLength(2);
      expect(res.data.rows[1].minHeightMm).toBe(12);
      expect(res.summary).toContain('adicionada');
    }
  });

  it('COMMAND-TABLE-2: Comando com tableId divergente é rejeitado com TARGET_MISMATCH', () => {
    const table = createTable({
      columns: [{ semanticKey: 'code', defaultLabel: 'Código', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const cmd: TableAddRowCommand = {
      type: 'TABLE_ADD_ROW',
      tableId: 'outra_tabela_diferente',
      origin: 'user'
    };

    const res = executeTableCommand(table, cmd);

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.errorCode).toBe('TARGET_MISMATCH');
    }
  });

  it('COMMAND-TABLE-3: Comando com payload inválido é rejeitado sem mutação', () => {
    const table = createTable({
      columns: [{ semanticKey: 'code', defaultLabel: 'Código', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    // Envia comando com tipo correto mas payload faltando dados obrigatórios
    const invalidCmd: any = {
      type: 'TABLE_SET_COLUMN_WIDTH',
      tableId: table.id,
      columnId: 'col_1',
      widthSpec: { mode: 'fixed_mm', widthMm: -5 } // negativo!
    };

    const res = executeTableCommand(table, invalidCmd);

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.errorCode).toBe('INVALID_COMMAND_PAYLOAD');
    }
  });

  it('COMMAND-TABLE-4: Comando com tipo desconhecido é rejeitado', () => {
    const table = createTable({
      columns: [{ semanticKey: 'code', defaultLabel: 'Código', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const unknownCmd: any = {
      type: 'UNKNOWN_MAGIC_COMMAND',
      tableId: table.id
    };

    const res = executeTableCommand(table, unknownCmd);

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.errorCode).toBe('INVALID_COMMAND_PAYLOAD');
    }
  });

  it('COMMAND-TABLE-5: Comando inválido preserva o modelo de entrada 100% inalterado', () => {
    const table = createTable({
      columns: [{ semanticKey: 'code', defaultLabel: 'Código', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const snapshot = JSON.stringify(table);

    const invalidCmd: any = {
      type: 'TABLE_REMOVE_ROW',
      tableId: table.id,
      rowId: 'row_fantasma'
    };

    const res = executeTableCommand(table, invalidCmd);
    expect(res.success).toBe(false);

    // O objeto original não foi tocado
    expect(JSON.stringify(table)).toBe(snapshot);
  });

  it('COMMAND-TABLE-6: Comandos originados de IA passam exatamente pelo mesmo pipeline estrito', () => {
    const table = createTable({
      columns: [{ semanticKey: 'accuracy', defaultLabel: 'Exatidão', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;

    // Comando emitido por IA
    const aiCmd: TableSetCellContentCommand = {
      type: 'TABLE_SET_CELL_CONTENT',
      tableId: table.id,
      rowId: r0,
      columnId: c0,
      content: {
        kind: 'value_unit',
        amount: 0.05,
        unit: 'bar',
        qualifier: '≤'
      },
      origin: 'ai'
    };

    const res = executeTableCommand(table, aiCmd);

    expect(res.success).toBe(true);
    if (res.success) {
      const cell = res.data.cells[getCellKey(r0, c0)];
      expect(cell.content).toEqual({
        kind: 'value_unit',
        amount: 0.05,
        unit: 'bar',
        qualifier: '≤'
      });
    }

    // Se a IA emitir payload com unidade vazia em value_unit, falha sumariamente:
    const invalidAiCmd: any = {
      type: 'TABLE_SET_CELL_CONTENT',
      tableId: table.id,
      rowId: r0,
      columnId: c0,
      content: {
        kind: 'value_unit',
        amount: 0.05,
        unit: '' // inválido: vazio!
      },
      origin: 'ai'
    };

    const failRes = executeTableCommand(table, invalidAiCmd);
    expect(failRes.success).toBe(false);
  });

  it('COMMAND-TABLE-7: Comando TABLE_APPLY_PRESET aplica preset de apresentação com sucesso', () => {
    const table = createTable({
      columns: [{ semanticKey: 'code', defaultLabel: 'Código', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const cmd: TableApplyPresetCommand = {
      type: 'TABLE_APPLY_PRESET',
      tableId: table.id,
      presetId: 'dense_spec_matrix',
      origin: 'user'
    };

    const res = executeTableCommand(table, cmd);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.presentation.presetId).toBe('dense_spec_matrix');
      expect(res.data.presentation.density).toBe('compact');
    }
  });
});
