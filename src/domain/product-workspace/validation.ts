// src/domain/product-workspace/validation.ts
// Domain validator for Workspace Layout referential integrity against ProductWorkbook & Knowledge Truth.
// Guarantees:
// 1. Every datum_ref points to an existing TechnicalDatum in ProductWorkbook or EffectiveKnowledge.
// 2. Every dataset_ref points to an existing TechnicalDataset.
// 3. Every dataset_cell_ref proves dataset, row, column, and cell referential existence.
// 4. Every sourceDocumentId points to an existing SourceDocument when sources are provided.
// 5. Returns deterministic, human-readable errors with exact path and code (BLOCKER 10).
// Zero explicit any.

import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  SourceDocument,
  TechnicalDataset,
  getDatasetCellKey
} from '../product-workbook';
import {
  WorkspaceLayoutV1,
  WorkspaceValidationError,
  WorkspaceValidationReport
} from './types';

export interface ValidateWorkspaceAgainstKnowledgeParams {
  layout: WorkspaceLayoutV1;
  workbook: ProductWorkbookV2;
  effectiveKnowledge?: ResolvedProductKnowledge;
  sources?: readonly SourceDocument[];
}

/**
 * Valida exaustivamente todas as referências do layout contra a verdade técnica do ProductWorkbook.
 * Falhas são estruturadas, determinísticas e humanamente compreensíveis.
 */
export function validateWorkspaceAgainstKnowledge(
  params: ValidateWorkspaceAgainstKnowledgeParams
): WorkspaceValidationReport {
  const { layout, workbook, effectiveKnowledge, sources = [] } = params;
  const errors: WorkspaceValidationError[] = [];

  // 1. Mapeamento de Datums válidos (locais + herdados)
  const availableDatumIds = new Set<string>();
  const availableSemanticKeys = new Set<string>();

  for (const d of Object.values(workbook.data)) {
    availableDatumIds.add(d.id);
    availableSemanticKeys.add(d.semanticKey);
  }

  if (effectiveKnowledge?.effectiveData) {
    for (const eff of effectiveKnowledge.effectiveData.values()) {
      availableDatumIds.add(eff.datum.id);
      availableSemanticKeys.add(eff.datum.semanticKey);
    }
  }

  // 2. Mapeamento de Datasets válidos
  const availableDatasets = new Map<string, TechnicalDataset>();

  if (workbook.datasets) {
    for (const ds of workbook.datasets) {
      availableDatasets.set(ds.id, ds);
    }
  }

  if (effectiveKnowledge?.effectiveDatasets) {
    for (const effDs of effectiveKnowledge.effectiveDatasets.values()) {
      if (!availableDatasets.has(effDs.dataset.id)) {
        availableDatasets.set(effDs.dataset.id, effDs.dataset);
      }
    }
  }

  // 3. Mapeamento de Documentos de Origem válidos
  const availableSourceIds = new Set<string>(sources.map((s) => s.id));

  // 4. Verificação de cada bloco do layout
  for (const [blockId, block] of Object.entries(layout.blocks)) {
    const basePath = `blocks.${blockId}`;

    switch (block.kind) {
      case 'fact_grid':
      case 'datum_list': {
        for (let idx = 0; idx < block.datumIds.length; idx++) {
          const dId = block.datumIds[idx];
          if (!availableDatumIds.has(dId) && !availableSemanticKeys.has(dId)) {
            errors.push({
              code: 'DATUM_NOT_FOUND',
              message: `Bloco "${block.title || blockId}" referencia datumId/semanticKey inexistente no ProductWorkbook: "${dId}"`,
              path: `${basePath}.datumIds[${idx}]`,
              entityId: dId
            });
          }
        }
        break;
      }

      case 'dataset_view': {
        if (!availableDatasets.has(block.datasetId)) {
          errors.push({
            code: 'DATASET_NOT_FOUND',
            message: `Bloco "${block.customTitle || blockId}" referencia datasetId inexistente no ProductWorkbook: "${block.datasetId}"`,
            path: `${basePath}.datasetId`,
            entityId: block.datasetId
          });
        }
        break;
      }

      case 'source_group': {
        if (sources.length > 0) {
          for (let idx = 0; idx < block.sourceDocumentIds.length; idx++) {
            const srcId = block.sourceDocumentIds[idx];
            if (!availableSourceIds.has(srcId)) {
              errors.push({
                code: 'SOURCE_DOCUMENT_NOT_FOUND',
                message: `Bloco "${block.title || blockId}" referencia documento de fonte inexistente: "${srcId}"`,
                path: `${basePath}.sourceDocumentIds[${idx}]`,
                entityId: srcId
              });
            }
          }
        }
        break;
      }

      case 'technical_table': {
        const table = block.tableDef;
        for (let rIdx = 0; rIdx < table.rows.length; rIdx++) {
          const row = table.rows[rIdx];
          for (let cIdx = 0; cIdx < table.columns.length; cIdx++) {
            const col = table.columns[cIdx];
            const cellKey = `${row.id}:${col.id}`;
            const cell = table.cells[cellKey];

            if (cell) {
              const cellPath = `${basePath}.tableDef.cells[${cellKey}]`;

              if (cell.type === 'datum_ref') {
                if (!availableDatumIds.has(cell.datumId)) {
                  errors.push({
                    code: 'DATUM_NOT_FOUND',
                    message: `Célula da tabela "${table.title || blockId}" (linha ${row.id}, coluna ${col.id}) referencia datumId inexistente: "${cell.datumId}"`,
                    path: `${cellPath}.datumId`,
                    entityId: cell.datumId
                  });
                }
              } else if (cell.type === 'dataset_cell_ref') {
                const ds = availableDatasets.get(cell.datasetId);
                if (!ds) {
                  errors.push({
                    code: 'DATASET_NOT_FOUND',
                    message: `Célula da tabela referencia datasetId inexistente: "${cell.datasetId}"`,
                    path: `${cellPath}.datasetId`,
                    entityId: cell.datasetId
                  });
                } else {
                  // Valida row no dataset
                  const rowExists = ds.rows.some((r) => r.id === cell.rowId);
                  if (!rowExists) {
                    errors.push({
                      code: 'DATASET_ROW_NOT_FOUND',
                      message: `Célula da tabela referencia rowId inexistente "${cell.rowId}" no dataset "${ds.label}"`,
                      path: `${cellPath}.rowId`,
                      entityId: cell.rowId
                    });
                  }

                  // Valida column no dataset
                  const colExists = ds.columns.some((c) => c.id === cell.columnId);
                  if (!colExists) {
                    errors.push({
                      code: 'DATASET_COLUMN_NOT_FOUND',
                      message: `Célula da tabela referencia columnId inexistente "${cell.columnId}" no dataset "${ds.label}"`,
                      path: `${cellPath}.columnId`,
                      entityId: cell.columnId
                    });
                  }

                  // Valida existência da célula no dataset se row e col existirem
                  if (rowExists && colExists) {
                    const dsCellKey = getDatasetCellKey(cell.rowId, cell.columnId);
                    if (!ds.cells[dsCellKey]) {
                      errors.push({
                        code: 'DATASET_CELL_NOT_FOUND',
                        message: `Célula coordenada (${cell.rowId}, ${cell.columnId}) não está definida no dataset "${ds.label}"`,
                        path: cellPath,
                        entityId: dsCellKey
                      });
                    }
                  }
                }
              }
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
