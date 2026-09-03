// src/domain/document-commands/table-command.executor.ts
// Executor Funcional Puro de Comandos para Table Core V2.
// Recebe inputs não-confiáveis (unknown), valida via Zod e consome exclusivamente dados parseados.
// Totalmente desacoplado de React, Zustand e banco de dados.
// Zero explicit any.

import { TableCoreModel } from '../table-core/table.types';
import {
  addRow,
  removeRow,
  reorderRows,
  addColumn,
  removeColumn,
  reorderColumns,
  setColumnWidth,
  setTableWidth,
  setRowMinHeight,
  setCellContent,
  mergeCells,
  unmergeCell,
  TableEngineError
} from '../table-core/table.engine';
import { applyTablePreset } from '../table-core/table.presets';
import { TableCommandSchema } from './table-commands.types';
import { CommandResult } from './command.types';
import { TableGeometryConstraints, resolveColumnWidthsMm } from '../table-core/table.geometry';

/**
 * Conjunto de tipos de comando que alteram a geometria física da tabela.
 */
const GEOMETRY_AFFECTING_COMMANDS = new Set([
  'TABLE_ADD_COLUMN',
  'TABLE_REMOVE_COLUMN',
  'TABLE_REORDER_COLUMNS',
  'TABLE_SET_COLUMN_WIDTH',
  'TABLE_SET_TABLE_WIDTH',
  'TABLE_APPLY_PRESET'
]);

/**
 * Executa um comando documental sobre TableCoreModel a partir de entrada não-confiável (unknown).
 * Retorna novo TableCoreModel imutável em caso de sucesso, ou erro tipado fail-closed.
 */
export function executeTableCommand(
  table: TableCoreModel,
  commandInput: unknown,
  constraints?: TableGeometryConstraints
): CommandResult<TableCoreModel> {
  // 1. Validação de formato via Zod estrito sobre entrada não-confiável
  const parseRes = TableCommandSchema.safeParse(commandInput);
  if (!parseRes.success) {
    return {
      success: false,
      errorCode: 'INVALID_COMMAND_PAYLOAD',
      error: `Payload do comando é inválido: ${parseRes.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`
    };
  }

  // A partir deste ponto, utiliza-se EXCLUSIVAMENTE o objeto tipado e sanitizado pelo Zod
  const command = parseRes.data;

  // 2. Validação de Alvo (Target Mismatch)
  if (command.tableId !== table.id) {
    return {
      success: false,
      errorCode: 'TARGET_MISMATCH',
      error: `Comando direcionado à tabela "${command.tableId}", mas a tabela fornecida possui ID "${table.id}".`
    };
  }

  // 3. Despacho para o motor funcional puro
  try {
    let updatedTable: TableCoreModel;
    let summary: string;

    switch (command.type) {
      case 'TABLE_ADD_ROW': {
        updatedTable = addRow(
          table,
          {
            id: command.row?.id,
            kind: command.row?.kind ?? 'data',
            minHeightMm: command.row?.minHeightMm,
            isHeader: command.row?.isHeader
          },
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

      case 'TABLE_REORDER_ROWS': {
        updatedTable = reorderRows(table, command.newRowOrderIds);
        summary = `Linhas reordenadas na tabela "${table.id}"`;
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

      case 'TABLE_REORDER_COLUMNS': {
        updatedTable = reorderColumns(table, command.newColumnOrderIds);
        summary = `Colunas reordenadas na tabela "${table.id}"`;
        break;
      }

      case 'TABLE_SET_COLUMN_WIDTH': {
        updatedTable = setColumnWidth(table, command.columnId, command.widthSpec);
        summary = `Largura da coluna "${command.columnId}" atualizada`;
        break;
      }

      case 'TABLE_SET_TABLE_WIDTH': {
        updatedTable = setTableWidth(table, command.widthSpec);
        summary = `Largura total da tabela "${table.id}" atualizada`;
        break;
      }

      case 'TABLE_SET_ROW_MIN_HEIGHT': {
        updatedTable = setRowMinHeight(table, command.rowId, command.minHeightMm);
        summary = `Altura mínima da linha "${command.rowId}" atualizada`;
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

      case 'TABLE_RESTORE_CELL': {
        updatedTable = setCellContent(
          table,
          command.rowId,
          command.columnId,
          { kind: 'empty' }
        );
        summary = `Célula [${command.rowId}::${command.columnId}] restaurada`;
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
    }

    // 4. Execução de restrições de geometria (Geometry Constraints Enforcement)
    let warnings: string[] | undefined;
    if (GEOMETRY_AFFECTING_COMMANDS.has(command.type)) {
      const geometryResult = resolveColumnWidthsMm(updatedTable, constraints);
      if (!geometryResult.valid) {
        return {
          success: false,
          errorCode: 'INVALID_GEOMETRY',
          error: geometryResult.error || 'A geometria resultante da tabela é inválida.'
        };
      }
      if (geometryResult.warnings.length > 0) {
        warnings = geometryResult.warnings;
      }
    }

    return {
      success: true,
      data: updatedTable,
      summary,
      warnings
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
