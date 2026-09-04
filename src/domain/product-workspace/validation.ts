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
  getDatasetCellKey,
  parseDatasetCellKey
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
  const { layout, workbook, effectiveKnowledge, sources } = params;
  const errors: WorkspaceValidationError[] = [];

  // 1. Mapeamento de Datums válidos exclusivamente por ID estável (BLOCKER 2: datumIds means datum.id)
  const availableDatumIds = new Set<string>();

  for (const d of Object.values(workbook.data)) {
    availableDatumIds.add(d.id);
  }

  if (effectiveKnowledge?.effectiveData) {
    for (const eff of effectiveKnowledge.effectiveData.values()) {
      availableDatumIds.add(eff.datum.id);
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

  // 3. Mapeamento de Documentos de Origem válidos (quando fornecidos)
  const availableSourceIds = sources ? new Set<string>(sources.map((s) => s.id)) : new Set<string>();

  // 4. Verificação de cada bloco do layout
  for (const [blockId, block] of Object.entries(layout.blocks)) {
    const basePath = `blocks.${blockId}`;

    switch (block.kind) {
      case 'fact_grid':
      case 'datum_list': {
        for (let idx = 0; idx < block.datumIds.length; idx++) {
          const dId = block.datumIds[idx];
          // BLOCKER 2: Rejeita semanticKey e aceita estritamente datum.id
          if (!availableDatumIds.has(dId)) {
            errors.push({
              code: 'DATUM_NOT_FOUND',
              message: `Bloco "${block.title || blockId}" referencia datumId inexistente no ProductWorkbook: "${dId}"`,
              path: `${basePath}.datumIds[${idx}]`,
              entityId: dId
            });
          }
        }
        break;
      }

      case 'dataset_view': {
        const ds = availableDatasets.get(block.datasetId);
        if (!ds) {
          errors.push({
            code: 'DATASET_NOT_FOUND',
            message: `Bloco "${block.customTitle || blockId}" referencia datasetId inexistente no ProductWorkbook: "${block.datasetId}"`,
            path: `${basePath}.datasetId`,
            entityId: block.datasetId
          });
        } else if (block.visibleColumnIds && block.visibleColumnIds.length > 0) {
          // BLOCKER 10: Valida visibleColumnIds contra dataset.columns
          const dsColIds = new Set(ds.columns.map((c) => c.id));
          for (let cIdx = 0; cIdx < block.visibleColumnIds.length; cIdx++) {
            const colId = block.visibleColumnIds[cIdx];
            if (!dsColIds.has(colId)) {
              errors.push({
                code: 'DATASET_COLUMN_NOT_FOUND',
                message: `Bloco "${block.customTitle || blockId}" referencia visibleColumnId inexistente "${colId}" no dataset "${ds.label}"`,
                path: `${basePath}.visibleColumnIds[${cIdx}]`,
                entityId: colId
              });
            }
          }
        }
        break;
      }

      case 'source_group': {
        // BLOCKER 9: Distingue sources === undefined (contexto ausente) de sources === [] (universo vazio)
        if (sources === undefined) {
          if (block.sourceDocumentIds.length > 0) {
            errors.push({
              code: 'SOURCE_CONTEXT_UNAVAILABLE',
              message: `Bloco "${block.title || blockId}" referencia ${block.sourceDocumentIds.length} documento(s) de fonte, mas o contexto de fontes não foi fornecido para validação.`,
              path: `${basePath}.sourceDocumentIds`,
              entityId: blockId
            });
          }
        } else {
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
        // BLOCKER 1: Validação estrita de chaves de célula canônicas getDatasetCellKey
        const table = block.tableDef;
        const validRowIds = new Set(table.rows.map((r) => r.id));
        const validColIds = new Set(table.columns.map((c) => c.id));

        for (const [cellKey, cell] of Object.entries(table.cells)) {
          const cellPath = `${basePath}.tableDef.cells[${cellKey}]`;

          // A) Validar se a chave do mapa corresponde exatamente à chave canônica collision-safe
          let parsed: { rowId: string; columnId: string } | null = null;
          try {
            parsed = parseDatasetCellKey(cellKey);
          } catch {
            parsed = null;
          }

          if (!parsed) {
            errors.push({
              code: 'TABLE_CELL_KEY_INVALID',
              message: `Chave de célula "${cellKey}" é inválida. Deve seguir o formato canônico collision-safe getDatasetCellKey(rowId, columnId) (ex: r3:row|c3:col). Formatos simples como row:col são proibidos.`,
              path: cellPath,
              entityId: cellKey
            });
            continue;
          }

          // B) Validar existência de rowId nas linhas da tabela
          if (!validRowIds.has(parsed.rowId)) {
            errors.push({
              code: 'DATASET_ROW_NOT_FOUND',
              message: `Célula "${cellKey}" referencia rowId inexistente nas linhas da tabela: "${parsed.rowId}"`,
              path: `${cellPath}.rowId`,
              entityId: parsed.rowId
            });
          }

          // C) Validar existência de columnId nas colunas da tabela
          if (!validColIds.has(parsed.columnId)) {
            errors.push({
              code: 'DATASET_COLUMN_NOT_FOUND',
              message: `Célula "${cellKey}" referencia columnId inexistente nas colunas da tabela: "${parsed.columnId}"`,
              path: `${cellPath}.columnId`,
              entityId: parsed.columnId
            });
          }

          // D) Validar que a chave é estritamente a canônica esperada
          const expectedKey = getDatasetCellKey(parsed.rowId, parsed.columnId);
          if (expectedKey !== cellKey) {
            errors.push({
              code: 'TABLE_CELL_KEY_INVALID',
              message: `Chave de célula "${cellKey}" não corresponde à chave canônica esperada "${expectedKey}".`,
              path: cellPath,
              entityId: cellKey
            });
          }

          // E) Validar referências técnicas
          if (cell.type === 'datum_ref') {
            if (!availableDatumIds.has(cell.datumId)) {
              errors.push({
                code: 'DATUM_NOT_FOUND',
                message: `Célula da tabela "${table.title || blockId}" (${cellKey}) referencia datumId inexistente: "${cell.datumId}"`,
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
              const rowExists = ds.rows.some((r) => r.id === cell.rowId);
              if (!rowExists) {
                errors.push({
                  code: 'DATASET_ROW_NOT_FOUND',
                  message: `Célula da tabela referencia rowId inexistente "${cell.rowId}" no dataset "${ds.label}"`,
                  path: `${cellPath}.rowId`,
                  entityId: cell.rowId
                });
              }

              const colExists = ds.columns.some((c) => c.id === cell.columnId);
              if (!colExists) {
                errors.push({
                  code: 'DATASET_COLUMN_NOT_FOUND',
                  message: `Célula da tabela referencia columnId inexistente "${cell.columnId}" no dataset "${ds.label}"`,
                  path: `${cellPath}.columnId`,
                  entityId: cell.columnId
                });
              }

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
