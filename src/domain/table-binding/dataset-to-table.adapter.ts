// src/domain/table-binding/dataset-to-table.adapter.ts
// Adapter puro de integração para projeção de TechnicalDataset em TableCoreModel (Fase 16, Emendas 9, 14).
// Totalmente desacoplado de React, Zustand, UI e Supabase.
// Zero explicit any.

import {
  TableCoreModel,
  TableColumnModel,
  TableRowModel,
  TableCellModel,
  TableCellContent,
  TablePresetId
} from '../table-core/table.types';
import { getCellKey, validateTableModel } from '../table-core/table.validator';
import { getTablePreset } from '../table-core/table.presets';
import { DEFAULT_TABLE_PAGINATION_POLICY } from '../table-core/table.pagination';
import { TechnicalDatasetProjection } from './product-knowledge-provider.types';

export interface DatasetProjectionOptions {
  tableId?: string;
  presetId?: TablePresetId;
  customTitle?: string;
}

/**
 * Converte de forma determinística uma projeção pura de TechnicalDataset em um TableCoreModel.
 * Preserva rastreabilidade total: datasetId, productId, bindingMode e sourceRevision.
 */
export function projectTechnicalDatasetToTableCore(
  dataset: TechnicalDatasetProjection,
  options?: DatasetProjectionOptions
): TableCoreModel {
  const tableId = options?.tableId || `tbl_ds_${dataset.productId}_${dataset.datasetId}`;
  const presetId = options?.presetId || 'dense_spec_matrix';
  const title = options?.customTitle || dataset.title || 'Tabela Técnica de Conjunto';

  // 1. Projeção de Colunas estáveis
  const columns: TableColumnModel[] = dataset.columns.map((col, idx) => ({
    id: `col_ds_${idx}_${col.key}`,
    semanticKey: col.key,
    defaultLabel: col.label,
    widthSpec: col.widthMm ? { mode: 'fixed_mm', widthMm: col.widthMm } : { mode: 'auto' },
    align: col.align || 'left',
    isCustom: col.isCustom
  }));

  // 2. Projeção de Linhas estáveis
  const rows: TableRowModel[] = dataset.rows.map((r, rIdx) => ({
    id: `row_ds_${rIdx}_${r.rowId}`,
    kind: 'data'
  }));

  // 3. Projeção de Células
  const cells: Record<string, TableCellModel> = {};

  rows.forEach((row, rIdx) => {
    const dsRow = dataset.rows[rIdx];

    columns.forEach((col) => {
      const cellId = `cell_ds_${row.id}_${col.id}`;
      const key = getCellKey(row.id, col.id);

      const cellValue = dsRow.cells[col.semanticKey];
      let content: TableCellContent;

      if (cellValue) {
        if (dataset.bindingMode === 'snapshot') {
          content = {
            kind: 'datum_reference',
            productId: dataset.productId,
            datasetId: dataset.datasetId,
            datumKey: `dataset.${dataset.datasetId}.${dsRow.rowId}.${col.semanticKey}`,
            bindingMode: 'snapshot',
            snapshot: cellValue,
            sourceRevision: dataset.sourceRevision
          };
        } else {
          content = {
            kind: 'datum_reference',
            productId: dataset.productId,
            datasetId: dataset.datasetId,
            datumKey: `dataset.${dataset.datasetId}.${dsRow.rowId}.${col.semanticKey}`,
            bindingMode: dataset.bindingMode,
            snapshot: cellValue,
            sourceRevision: dataset.sourceRevision
          };
        }
      } else {
        content = { kind: 'empty' };
      }

      cells[key] = {
        id: cellId,
        rowId: row.id,
        columnId: col.id,
        content,
        colSpan: 1,
        rowSpan: 1
      };
    });
  });

  const tableModel: TableCoreModel = {
    id: tableId,
    schemaVersion: 1,
    title,
    columns,
    rows,
    cells,
    presentation: getTablePreset(presetId),
    paginationPolicy: structuredClone(DEFAULT_TABLE_PAGINATION_POLICY)
  };

  const validation = validateTableModel(tableModel);
  if (!validation.valid) {
    throw new Error(`Falha ao projetar TechnicalDataset para TableCoreModel: ${validation.errors.join('; ')}`);
  }

  return tableModel;
}
