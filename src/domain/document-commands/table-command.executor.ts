// src/domain/document-commands/table-command.executor.ts
// Executor Funcional Puro de Comandos para Table Core V2.
// Totalmente desacoplado de React, Zustand e banco de dados.

import { TableCoreModel } from '../table-core/table.types';
import {
  addRow,
  removeRow,
  addColumn,
  removeColumn,
  setColumnWidth,
  setCellContent,
  mergeCells,
  unmergeCell,
  TableEngineError
} from '../table-core/table.engine';
import { applyTablePreset } from '../table-core/table.presets';
import { TableCommand, TableCommandSchema } from './table-commands.types';
import { CommandResult } from './command.types';
import { TableGeometryConstraints } from '../table-core/table.geometry';

/**
 * Executa um TableCommand estritamente tipado sobre o TableCoreModel.
 * Retorna novo TableCoreModel imutável em caso de sucesso, ou erro tipado fail-closed.
 */
export function executeTableCommand(
  table: TableCoreModel,
  command: TableCommand,
  _constraints?: TableGeometryConstraints
): CommandResult<TableCoreModel> {
  // 1. Validação de formato via Zod (Garante segurança e integridade inclusive para origens de IA)
  const parseRes = TableCommandSchema.safeParse(command);
  if (!parseRes.success) {
    return {
      success: false,
      errorCode: 'INVALID_COMMAND_PAYLOAD',
      error: `Payload do comando "${(command as any)?.type}" é inválido: ${parseRes.error.errors.map((e) => e.message).join('; ')}`
    };
  }

  // 2. Validação de Alvo (Target Mismatch)
  if (command.tableId !== table.id) {
    return {
      success: false,
      errorCode: 'TARGET_MISMATCH',
      error: `Comando direcionado à tabela "${command.tableId}", mas a tabela fornecida possui ID "${table.id}".`
    };
  }

  // 3. Despacho para o motor funcional
  try {
    let updatedTable: TableCoreModel;
    let summary: string;

    switch (command.type) {
      case 'TABLE_ADD_ROW': {
        updatedTable = addRow(
          table,
          command.row || { kind: 'data' },
          command.initialCellContents,
          command.targetIndex
        );
        summary = `Linha adicionada à tabela "${table.id}"`;
        break;
      }

      case 'TABLE_REMOVE_ROW': {
        updatedTable = removeRow(table, command.rowId);
        summary = `Linha "${command.rowId}" removida da tabela "${table.id}"`;
        break;
      }

      case 'TABLE_ADD_COLUMN': {
        updatedTable = addColumn(
          table,
          command.column,
          command.initialCellContents,
          command.targetIndex
        );
        summary = `Coluna "${command.column.semanticKey}" adicionada à tabela "${table.id}"`;
        break;
      }

      case 'TABLE_REMOVE_COLUMN': {
        updatedTable = removeColumn(table, command.columnId);
        summary = `Coluna "${command.columnId}" removida da tabela "${table.id}"`;
        break;
      }

      case 'TABLE_SET_COLUMN_WIDTH': {
        updatedTable = setColumnWidth(table, command.columnId, command.widthSpec);
        summary = `Largura da coluna "${command.columnId}" atualizada`;
        break;
      }

      case 'TABLE_SET_CELL_CONTENT': {
        updatedTable = setCellContent(
          table,
          command.rowId,
          command.columnId,
          command.content
        );
        summary = `Conteúdo da célula [${command.rowId}::${command.columnId}] atualizado`;
        break;
      }

      case 'TABLE_MERGE_CELLS': {
        updatedTable = mergeCells(
          table,
          command.startRowId,
          command.startColumnId,
          command.colSpan,
          command.rowSpan
        );
        summary = `Células mescladas a partir de [${command.startRowId}::${command.startColumnId}] (span=${command.colSpan}x${command.rowSpan})`;
        break;
      }

      case 'TABLE_UNMERGE_CELL': {
        updatedTable = unmergeCell(table, command.anchorRowId, command.anchorColumnId);
        summary = `Mesclagem desfeita na célula [${command.anchorRowId}::${command.anchorColumnId}]`;
        break;
      }

      case 'TABLE_APPLY_PRESET': {
        updatedTable = applyTablePreset(table, command.presetId);
        summary = `Preset "${command.presetId}" aplicado à tabela "${table.id}"`;
        break;
      }

      default: {
        return {
          success: false,
          errorCode: 'UNKNOWN_COMMAND_TYPE',
          error: `Tipo de comando desconhecido: "${(command as any).type}"`
        };
      }
    }

    return {
      success: true,
      data: updatedTable,
      summary
    };
  } catch (err: unknown) {
    if (err instanceof TableEngineError) {
      return {
        success: false,
        errorCode: err.code,
        error: err.message
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      errorCode: 'UNEXPECTED_ENGINE_ERROR',
      error: message
    };
  }
}
