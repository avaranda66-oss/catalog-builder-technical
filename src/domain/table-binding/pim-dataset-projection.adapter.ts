// src/domain/table-binding/pim-dataset-projection.adapter.ts
// Adapter puro para conversão canônica de TechnicalDataset em TechnicalDatasetProjection (PIM ↔ Table Core).
// Preserva rastreabilidade estrita: datasetId, productId, canonical rowId, canonical colId, datumId, datumKey, sourceRevision.
// Zero explicit any. Zero dependência de Supabase ou React.

import {
  TechnicalDataset,
  TechnicalDatum,
  ResolvedProductKnowledge,
  getDatasetCellKey
} from '../product-workbook';
import {
  TechnicalDatasetProjection,
  TechnicalDatasetColumn,
  TechnicalDatasetRow,
  TechnicalDatasetCellProjection
} from './product-knowledge-provider.types';
import { TableBindingMode } from '../table-core/table.types';
import { projectTechnicalValueFailClosed } from './product-workbook-datum.resolver';

export interface ProjectPimDatasetParams {
  readonly dataset: TechnicalDataset;
  readonly productId: string;
  readonly datums: Readonly<Record<string, TechnicalDatum>> | ReadonlyMap<string, TechnicalDatum>;
  readonly bindingMode?: TableBindingMode;
  readonly sourceRevision?: number;
  readonly sourceOwnerKind?: 'product' | 'family';
  readonly sourceOwnerId?: string;
  readonly effectiveKnowledge?: ResolvedProductKnowledge;
}

/**
 * Converte um TechnicalDataset canônico do Product Workbook em uma TechnicalDatasetProjection
 * para consumo pelo Table Core V2 e Knowledge Picker.
 * Invariantes (Emendas 6, 7 e 13):
 * - Garante mapeamento exato de datumId -> TechnicalDatum.semanticKey REAL.
 * - Suporta dual-source identity: dataset structure source vs individual effective cell datum source.
 * - Valores não suportados/desconhecidos usam projectTechnicalValueFailClosed (NUNCA string vazia).
 */
export function projectPimDatasetToTechnicalDatasetProjection(
  params: ProjectPimDatasetParams
): TechnicalDatasetProjection {
  const {
    dataset,
    productId,
    datums,
    bindingMode = 'live',
    sourceRevision,
    sourceOwnerKind,
    sourceOwnerId,
    effectiveKnowledge
  } = params;

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
        let datum = getDatum(datasetCell.datumId);
        let cellOwnerKind = sourceOwnerKind;
        let cellOwnerId = sourceOwnerId;
        let cellRevision = sourceRevision;

        // Se houver effectiveKnowledge disponível, resolve overrides locais por semanticKey (Emenda 7)
        if (effectiveKnowledge && datum) {
          const semKey = datum.semanticKey;
          if (effectiveKnowledge.effectiveData.has(semKey)) {
            const eff = effectiveKnowledge.effectiveData.get(semKey)!;
            datum = eff.datum;
            cellOwnerKind = eff.origin === 'family' ? 'family' : 'product';
            cellOwnerId = eff.origin === 'family' ? (effectiveKnowledge.familyId ?? productId) : productId;
            cellRevision = eff.origin === 'family' ? effectiveKnowledge.familyRevision : effectiveKnowledge.productRevision;
          }
        }

        if (datum) {
          const literalValue = projectTechnicalValueFailClosed(datum.value);

          cells[col.semanticKey] = {
            datumId: datum.id,
            datumKey: datum.semanticKey,
            value: literalValue,
            sourceOwnerKind: cellOwnerKind,
            sourceOwnerId: cellOwnerId,
            sourceRevision: cellRevision
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
    sourceRevision,
    sourceOwnerKind,
    sourceOwnerId
  };
}
