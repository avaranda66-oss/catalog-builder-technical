// src/domain/document-commands/table-commands.types.ts
// Comandos Tipados Específicos para o Table Core V2.
// Cada comando possui payload estrito validável por Zod com .strict().
// Zero explicit any.

import { z } from 'zod';
import { BaseDocumentCommand } from './command.types';
import {
  TableCellContent,
  ColumnWidthSpec,
  TableWidthSpec,
  TablePresetId,
  TableColumnModel,
  TableRowKind
} from '../table-core/table.types';
import {
  ColumnWidthSpecSchema,
  TableWidthSpecSchema,
  TablePresetIdSchema,
  TableCellContentSchema
} from '../table-core/table.schema';

export interface TableAddRowCommand extends BaseDocumentCommand {
  type: 'TABLE_ADD_ROW';
  tableId: string;
  row?: {
    id?: string;
    kind?: TableRowKind;
    minHeightMm?: number;
    isHeader?: boolean;
  };
  initialCellContents?: Record<string, TableCellContent>;
  targetIndex?: number;
}

export interface TableRemoveRowCommand extends BaseDocumentCommand {
  type: 'TABLE_REMOVE_ROW';
  tableId: string;
  rowId: string;
}

export interface TableReorderRowsCommand extends BaseDocumentCommand {
  type: 'TABLE_REORDER_ROWS';
  tableId: string;
  newRowOrderIds: string[];
}

export interface TableAddColumnCommand extends BaseDocumentCommand {
  type: 'TABLE_ADD_COLUMN';
  tableId: string;
  column: Omit<TableColumnModel, 'id'> & { id?: string };
  initialCellContents?: Record<string, TableCellContent>;
  targetIndex?: number;
}

export interface TableRemoveColumnCommand extends BaseDocumentCommand {
  type: 'TABLE_REMOVE_COLUMN';
  tableId: string;
  columnId: string;
}

export interface TableReorderColumnsCommand extends BaseDocumentCommand {
  type: 'TABLE_REORDER_COLUMNS';
  tableId: string;
  newColumnOrderIds: string[];
}

export interface TableSetColumnWidthCommand extends BaseDocumentCommand {
  type: 'TABLE_SET_COLUMN_WIDTH';
  tableId: string;
  columnId: string;
  widthSpec: ColumnWidthSpec;
}

export interface TableSetTableWidthCommand extends BaseDocumentCommand {
  type: 'TABLE_SET_TABLE_WIDTH';
  tableId: string;
  widthSpec: TableWidthSpec;
}

export interface TableSetRowMinHeightCommand extends BaseDocumentCommand {
  type: 'TABLE_SET_ROW_MIN_HEIGHT';
  tableId: string;
  rowId: string;
  minHeightMm?: number;
}

export interface TableSetCellContentCommand extends BaseDocumentCommand {
  type: 'TABLE_SET_CELL_CONTENT';
  tableId: string;
  rowId: string;
  columnId: string;
  content: TableCellContent;
}

export interface TableMergeCellsCommand extends BaseDocumentCommand {
  type: 'TABLE_MERGE_CELLS';
  tableId: string;
  startRowId: string;
  startColumnId: string;
  colSpan: number;
  rowSpan: number;
}

export interface TableUnmergeCellCommand extends BaseDocumentCommand {
  type: 'TABLE_UNMERGE_CELL';
  tableId: string;
  anchorRowId: string;
  anchorColumnId: string;
}

export interface TableApplyPresetCommand extends BaseDocumentCommand {
  type: 'TABLE_APPLY_PRESET';
  tableId: string;
  presetId: TablePresetId;
}

export type TableCommand =
  | TableAddRowCommand
  | TableRemoveRowCommand
  | TableReorderRowsCommand
  | TableAddColumnCommand
  | TableRemoveColumnCommand
  | TableReorderColumnsCommand
  | TableSetColumnWidthCommand
  | TableSetTableWidthCommand
  | TableSetRowMinHeightCommand
  | TableSetCellContentCommand
  | TableMergeCellsCommand
  | TableUnmergeCellCommand
  | TableApplyPresetCommand;

// =========================================================================
// ZOD SCHEMAS ESTRITOS (.strict()) PARA PARSE SEGURO E IA SAFETY
// =========================================================================

const CommandOriginSchema = z.enum(['user', 'inspector', 'tool_rail', 'keyboard', 'ai', 'system', 'migration']);

export const TableAddRowCommandSchema = z.object({
  type: z.literal('TABLE_ADD_ROW'),
  tableId: z.string().min(1),
  row: z.object({
    id: z.string().optional(),
    kind: z.enum(['data', 'header', 'footer', 'divider']).optional(),
    minHeightMm: z.number().positive().optional(),
    isHeader: z.boolean().optional()
  }).strict().optional(),
  initialCellContents: z.record(TableCellContentSchema).optional(),
  targetIndex: z.number().int().min(0).optional(),
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableRemoveRowCommandSchema = z.object({
  type: z.literal('TABLE_REMOVE_ROW'),
  tableId: z.string().min(1),
  rowId: z.string().min(1),
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableReorderRowsCommandSchema = z.object({
  type: z.literal('TABLE_REORDER_ROWS'),
  tableId: z.string().min(1),
  newRowOrderIds: z.array(z.string().min(1)).min(1),
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableAddColumnCommandSchema = z.object({
  type: z.literal('TABLE_ADD_COLUMN'),
  tableId: z.string().min(1),
  column: z.object({
    id: z.string().optional(),
    semanticKey: z.string().min(1),
    defaultLabel: z.string().default(''),
    widthSpec: ColumnWidthSpecSchema,
    align: z.enum(['left', 'center', 'right']).default('left'),
    isCustom: z.boolean().optional()
  }).strict(),
  initialCellContents: z.record(TableCellContentSchema).optional(),
  targetIndex: z.number().int().min(0).optional(),
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableRemoveColumnCommandSchema = z.object({
  type: z.literal('TABLE_REMOVE_COLUMN'),
  tableId: z.string().min(1),
  columnId: z.string().min(1),
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableReorderColumnsCommandSchema = z.object({
  type: z.literal('TABLE_REORDER_COLUMNS'),
  tableId: z.string().min(1),
  newColumnOrderIds: z.array(z.string().min(1)).min(1),
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableSetColumnWidthCommandSchema = z.object({
  type: z.literal('TABLE_SET_COLUMN_WIDTH'),
  tableId: z.string().min(1),
  columnId: z.string().min(1),
  widthSpec: ColumnWidthSpecSchema,
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableSetTableWidthCommandSchema = z.object({
  type: z.literal('TABLE_SET_TABLE_WIDTH'),
  tableId: z.string().min(1),
  widthSpec: TableWidthSpecSchema,
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableSetRowMinHeightCommandSchema = z.object({
  type: z.literal('TABLE_SET_ROW_MIN_HEIGHT'),
  tableId: z.string().min(1),
  rowId: z.string().min(1),
  minHeightMm: z.number().positive().optional(),
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableSetCellContentCommandSchema = z.object({
  type: z.literal('TABLE_SET_CELL_CONTENT'),
  tableId: z.string().min(1),
  rowId: z.string().min(1),
  columnId: z.string().min(1),
  content: TableCellContentSchema,
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableMergeCellsCommandSchema = z.object({
  type: z.literal('TABLE_MERGE_CELLS'),
  tableId: z.string().min(1),
  startRowId: z.string().min(1),
  startColumnId: z.string().min(1),
  colSpan: z.number().int().min(1),
  rowSpan: z.number().int().min(1),
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableUnmergeCellCommandSchema = z.object({
  type: z.literal('TABLE_UNMERGE_CELL'),
  tableId: z.string().min(1),
  anchorRowId: z.string().min(1),
  anchorColumnId: z.string().min(1),
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableApplyPresetCommandSchema = z.object({
  type: z.literal('TABLE_APPLY_PRESET'),
  tableId: z.string().min(1),
  presetId: TablePresetIdSchema,
  commandId: z.string().optional(),
  origin: CommandOriginSchema.optional(),
  timestamp: z.string().optional()
}).strict();

export const TableCommandSchema = z.discriminatedUnion('type', [
  TableAddRowCommandSchema,
  TableRemoveRowCommandSchema,
  TableReorderRowsCommandSchema,
  TableAddColumnCommandSchema,
  TableRemoveColumnCommandSchema,
  TableReorderColumnsCommandSchema,
  TableSetColumnWidthCommandSchema,
  TableSetTableWidthCommandSchema,
  TableSetRowMinHeightCommandSchema,
  TableSetCellContentCommandSchema,
  TableMergeCellsCommandSchema,
  TableUnmergeCellCommandSchema,
  TableApplyPresetCommandSchema
]);

export type ParseTableCommandResult =
  | { success: true; data: TableCommand }
  | { success: false; errorCode: 'INVALID_COMMAND_PAYLOAD'; error: string };

/**
 * Valida e desserializa um comando não-confiável em um TableCommand tipado.
 */
export function parseTableCommand(input: unknown): ParseTableCommandResult {
  const parseRes = TableCommandSchema.safeParse(input);
  if (!parseRes.success) {
    return {
      success: false,
      errorCode: 'INVALID_COMMAND_PAYLOAD',
      error: `Comando inválido: ${parseRes.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`
    };
  }
  return {
    success: true,
    data: parseRes.data
  };
}
