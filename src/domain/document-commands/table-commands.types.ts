// src/domain/document-commands/table-commands.types.ts
// Comandos Tipados Específicos para o Table Core V2.
// Cada comando possui payload estrito validável por Zod.

import { z } from 'zod';
import { BaseDocumentCommand } from './command.types';
import {
  TableCellContent,
  ColumnWidthSpec,
  TablePresetId,
  TableColumnModel,
  TableRowModel
} from '../table-core/table.types';
import {
  ColumnWidthSpecSchema,
  TablePresetIdSchema,
  TableCellContentSchema
} from '../table-core/table.schema';

export interface TableAddRowCommand extends BaseDocumentCommand {
  type: 'TABLE_ADD_ROW';
  tableId: string;
  row?: Omit<TableRowModel, 'id'> & { id?: string };
  initialCellContents?: Record<string, TableCellContent>;
  targetIndex?: number;
}

export interface TableRemoveRowCommand extends BaseDocumentCommand {
  type: 'TABLE_REMOVE_ROW';
  tableId: string;
  rowId: string;
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

export interface TableSetColumnWidthCommand extends BaseDocumentCommand {
  type: 'TABLE_SET_COLUMN_WIDTH';
  tableId: string;
  columnId: string;
  widthSpec: ColumnWidthSpec;
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

/**
 * Discriminated Union de todos os Comandos de Tabela.
 */
export type TableCommand =
  | TableAddRowCommand
  | TableRemoveRowCommand
  | TableAddColumnCommand
  | TableRemoveColumnCommand
  | TableSetColumnWidthCommand
  | TableSetCellContentCommand
  | TableMergeCellsCommand
  | TableUnmergeCellCommand
  | TableApplyPresetCommand;

// =========================================================================
// ZOD SCHEMAS PARA PARSE SEGURO (Demonstração de AI Safety)
// =========================================================================

export const TableAddRowCommandSchema = z.object({
  type: z.literal('TABLE_ADD_ROW'),
  tableId: z.string().min(1),
  row: z.object({
    id: z.string().optional(),
    kind: z.enum(['data', 'header', 'footer', 'divider']).optional(),
    minHeightMm: z.number().positive().optional(),
    isHeader: z.boolean().optional()
  }).optional(),
  initialCellContents: z.record(TableCellContentSchema).optional(),
  targetIndex: z.number().int().min(0).optional(),
  origin: z.enum(['user', 'inspector', 'tool_rail', 'keyboard', 'ai', 'system', 'migration']).optional()
});

export const TableRemoveRowCommandSchema = z.object({
  type: z.literal('TABLE_REMOVE_ROW'),
  tableId: z.string().min(1),
  rowId: z.string().min(1),
  origin: z.enum(['user', 'inspector', 'tool_rail', 'keyboard', 'ai', 'system', 'migration']).optional()
});

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
  }),
  initialCellContents: z.record(TableCellContentSchema).optional(),
  targetIndex: z.number().int().min(0).optional(),
  origin: z.enum(['user', 'inspector', 'tool_rail', 'keyboard', 'ai', 'system', 'migration']).optional()
});

export const TableRemoveColumnCommandSchema = z.object({
  type: z.literal('TABLE_REMOVE_COLUMN'),
  tableId: z.string().min(1),
  columnId: z.string().min(1),
  origin: z.enum(['user', 'inspector', 'tool_rail', 'keyboard', 'ai', 'system', 'migration']).optional()
});

export const TableSetColumnWidthCommandSchema = z.object({
  type: z.literal('TABLE_SET_COLUMN_WIDTH'),
  tableId: z.string().min(1),
  columnId: z.string().min(1),
  widthSpec: ColumnWidthSpecSchema,
  origin: z.enum(['user', 'inspector', 'tool_rail', 'keyboard', 'ai', 'system', 'migration']).optional()
});

export const TableSetCellContentCommandSchema = z.object({
  type: z.literal('TABLE_SET_CELL_CONTENT'),
  tableId: z.string().min(1),
  rowId: z.string().min(1),
  columnId: z.string().min(1),
  content: TableCellContentSchema,
  origin: z.enum(['user', 'inspector', 'tool_rail', 'keyboard', 'ai', 'system', 'migration']).optional()
});

export const TableMergeCellsCommandSchema = z.object({
  type: z.literal('TABLE_MERGE_CELLS'),
  tableId: z.string().min(1),
  startRowId: z.string().min(1),
  startColumnId: z.string().min(1),
  colSpan: z.number().int().min(1),
  rowSpan: z.number().int().min(1),
  origin: z.enum(['user', 'inspector', 'tool_rail', 'keyboard', 'ai', 'system', 'migration']).optional()
});

export const TableUnmergeCellCommandSchema = z.object({
  type: z.literal('TABLE_UNMERGE_CELL'),
  tableId: z.string().min(1),
  anchorRowId: z.string().min(1),
  anchorColumnId: z.string().min(1),
  origin: z.enum(['user', 'inspector', 'tool_rail', 'keyboard', 'ai', 'system', 'migration']).optional()
});

export const TableApplyPresetCommandSchema = z.object({
  type: z.literal('TABLE_APPLY_PRESET'),
  tableId: z.string().min(1),
  presetId: TablePresetIdSchema,
  origin: z.enum(['user', 'inspector', 'tool_rail', 'keyboard', 'ai', 'system', 'migration']).optional()
});

export const TableCommandSchema = z.discriminatedUnion('type', [
  TableAddRowCommandSchema,
  TableRemoveRowCommandSchema,
  TableAddColumnCommandSchema,
  TableRemoveColumnCommandSchema,
  TableSetColumnWidthCommandSchema,
  TableSetCellContentCommandSchema,
  TableMergeCellsCommandSchema,
  TableUnmergeCellCommandSchema,
  TableApplyPresetCommandSchema
]);
