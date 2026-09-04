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
import { TableCellLiteralContent } from '../table-values';
import { getCellKey, validateTableModel } from '../table-core/table.validator';
import { getTablePreset } from '../table-core/table.presets';
import { DEFAULT_TABLE_PAGINATION_POLICY } from '../table-core/table.pagination';
import { TechnicalDatasetProjection } from './product-knowledge-provider.types';

export interface DatasetProjectionOptions {
  tableId?: string;
  presetId?: TablePresetId;
  customTitle?: string;
}

function safeToken(value: string): string {
  const enc = encodeURIComponent(value).replace(/%/g, 'x');
  return `${enc.length}x${enc}`;
}

export function generateDeterministicDatasetColumnId(datasetId: string, colKeyOrId: string): string {
  return `col_ds_${safeToken(datasetId)}_${safeToken(colKeyOrId)}`;
}

export function generateDeterministicDatasetRowId(datasetId: string, rowId: string): string {
  return `row_ds_${safeToken(datasetId)}_${safeToken(rowId)}`;
}

export function generateDeterministicDatasetCellId(tableId: string, rowId: string, colId: string): string {
  return `cell_ds_${safeToken(tableId)}_${safeToken(rowId)}_${safeToken(colId)}`;
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

  // 1. Projeção de Colunas estáveis (Zero array-index, derivado de datasetId + colIdentifier)
  const columns: TableColumnModel[] = dataset.columns.map((col) => {
    const colIdentifier = col.id || col.key;
    return {
      id: generateDeterministicDatasetColumnId(dataset.datasetId, colIdentifier),
      semanticKey: col.key,
      defaultLabel: col.label,
      widthSpec: col.widthMm ? { mode: 'fixed_mm', widthMm: col.widthMm } : { mode: 'auto' },
      align: col.align || 'left',
      isCustom: col.isCustom
    };
  });

  // 2. Projeção de Linhas estáveis (Zero array-index, derivado de datasetId + canonical rowId)
  const rows: TableRowModel[] = dataset.rows.map((r) => ({
    id: generateDeterministicDatasetRowId(dataset.datasetId, r.rowId),
    kind: 'data'
  }));

  // 3. Projeção de Células com validação canônica de identidade (Emenda 5)
  const cells: Record<string, TableCellModel> = {};

  rows.forEach((row, rIdx) => {
    const dsRow = dataset.rows[rIdx];

    columns.forEach((col) => {
      const cellId = generateDeterministicDatasetCellId(tableId, row.id, col.id);
      const key = getCellKey(row.id, col.id);

      const cellItem = dsRow.cells[col.semanticKey];
      let content: TableCellContent;

      if (cellItem) {
        const isCellProjection = typeof cellItem === 'object' && cellItem !== null && 'datumKey' in cellItem;
        const cellProjection = isCellProjection ? (cellItem as { datumId: string; datumKey: string; value: TableCellLiteralContent }) : undefined;
        const cellValue: TableCellLiteralContent = cellProjection ? cellProjection.value : (cellItem as TableCellLiteralContent);

        // EMENDA 5: Para toda célula dataset vinculada exigir datumId e datumKey canônico real.
        // Se live/review binding não possuir identidade canônica: FAIL CLOSED.
        if (dataset.bindingMode !== 'snapshot') {
          if (!cellProjection || !cellProjection.datumKey || !cellProjection.datumId) {
            throw new Error(
              `[FAIL_CLOSED] Célula de dataset vinculada (${col.semanticKey}, row: ${dsRow.rowId}) em modo ${dataset.bindingMode} não possui datumId e datumKey canônicos.`
            );
          }
        }

        const canonicalDatumKey = cellProjection?.datumKey || `canonical_datum_${cellProjection?.datumId || 'snapshot'}`;

        if (dataset.bindingMode === 'snapshot') {
          content = {
            kind: 'datum_reference',
            productId: dataset.productId,
            datasetId: dataset.datasetId,
            datumKey: canonicalDatumKey,
            bindingMode: 'snapshot',
            snapshot: cellValue,
            sourceRevision: dataset.sourceRevision
          };
        } else {
          content = {
            kind: 'datum_reference',
            productId: dataset.productId,
            datasetId: dataset.datasetId,
            datumKey: canonicalDatumKey,
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
