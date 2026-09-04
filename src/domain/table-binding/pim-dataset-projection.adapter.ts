// src/domain/table-binding/pim-dataset-projection.adapter.ts
// Adapter puro para conversão canônica de TechnicalDataset em TechnicalDatasetProjection (PIM ↔ Table Core).
// Preserva rastreabilidade estrita: datasetId, productId, canonical rowId, canonical colId, datumId, datumKey, sourceRevision.
// Zero explicit any. Zero dependência de Supabase ou React.

import {
  TechnicalDataset,
  TechnicalDatum,
  getDatasetCellKey
} from '../product-workbook';
import {
  TechnicalDatasetProjection,
  TechnicalDatasetColumn,
  TechnicalDatasetRow,
  TechnicalDatasetCellProjection
} from './product-knowledge-provider.types';
import { TableBindingMode } from '../table-core/table.types';
import { mapTechnicalValueToTableLiteralV2 } from './product-workbook-datum.resolver';

export interface ProjectPimDatasetParams {
  readonly dataset: TechnicalDataset;
  readonly productId: string;
  readonly datums: Readonly<Record<string, TechnicalDatum>> | ReadonlyMap<string, TechnicalDatum>;
  readonly bindingMode?: TableBindingMode;
  readonly sourceRevision?: number;
}

/**
 * Converte um TechnicalDataset canônico do Product Workbook em uma TechnicalDatasetProjection
 * para consumo pelo Table Core V2 e Knowledge Picker.
 * Invariante (Emenda 6 & 13):
 * - Garante mapeamento exato de datumId -> TechnicalDatum.semanticKey.
 * - Nunca confunde column.semanticKey com TechnicalDatum.semanticKey.
 */
export function projectPimDatasetToTechnicalDatasetProjection(
  params: ProjectPimDatasetParams
): TechnicalDatasetProjection {
  const { dataset, productId, datums, bindingMode = 'live', sourceRevision } = params;

  const getDatum = (datumId: string): TechnicalDatum | undefined => {
    if (datums instanceof Map) {
      return datums.get(datumId);
    }
    return (datums as Record<string, TechnicalDatum>)[datumId];
  };

  // 1. Projeção de Colunas canônicas
  const columns: TechnicalDatasetColumn[] = dataset.columns.map((col) => ({
    id: col.id,
    key: col.semanticKey,
    label: col.label,
    align: 'left'
  }));

  // 2. Projeção de Linhas e Células
  const rows: TechnicalDatasetRow[] = dataset.rows.map((row) => {
    const cells: Record<string, TechnicalDatasetCellProjection> = {};

    for (const col of dataset.columns) {
      const cellCoordKey = getDatasetCellKey(row.id, col.id);
      const datasetCell = dataset.cells[cellCoordKey];

      if (datasetCell && datasetCell.datumId) {
        const datum = getDatum(datasetCell.datumId);
        if (datum) {
          const literalRes = mapTechnicalValueToTableLiteralV2(datum.value);
          const literalValue = literalRes.supported ? literalRes.content : ({ kind: 'text', text: '' } as const);

          cells[col.semanticKey] = {
            datumId: datum.id,
            datumKey: datum.semanticKey,
            value: literalValue
          };
        }
      }
    }

    return {
      rowId: row.id,
      label: row.label,
      cells
    };
  });

  return {
    datasetId: dataset.id,
    productId,
    title: dataset.label,
    columns,
    rows,
    bindingMode,
    sourceRevision
  };
}
