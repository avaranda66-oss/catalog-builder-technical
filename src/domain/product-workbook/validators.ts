// src/domain/product-workbook/validators.ts
// Pure domain invariant validators for Product Workbook and Knowledge Bundle (PIM.W1.1).
// Provides structured error and warning reporting without side effects.
// Zero dependencies on external libraries or databases.
// Zero explicit any.

import {
  ProductWorkbook,
  ProductKnowledgeBundle,
  TechnicalDatum,
  ValidationResult,
  ValidationIssue,
  DatasetColumn,
  getDatasetCellKey
} from './types';
import { isValidSemanticKey } from './schema';

/**
 * Standard BCP-47 language tag regular expression.
 * Supports primary language (2-3 chars), optional 4-letter script, and optional region/numeric subtag.
 * Examples accepted: 'en', 'pt-BR', 'zh-Hans', 'sr-Cyrl', 'es-419', 'pt', 'de-DE'.
 */
export const BCP47_REGEX = /^[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?$/i;

/**
 * Validates whether a string conforms to a clean BCP-47 language tag.
 */
export function isValidBcp47LanguageTag(tag: string): boolean {
  if (typeof tag !== 'string') return false;
  const trimmed = tag.trim();
  if (trimmed !== tag || trimmed.length < 2 || trimmed.length > 35) return false;
  return BCP47_REGEX.test(trimmed);
}

/**
 * ISO-8601 string regular expression for calendar dates and timestamps (PIM.W2C.4).
 * Accepts: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ss...' with strictly validated year [0001-9999],
 * hour [00-23], minute [00-59], second [00-59], optional millisecond fraction (1-3 digits)
 * and optional timezone (Z or displacement in range [+-]00:00 to [+-]15:59).
 */
export const ISO_DATE_REGEX =
  /^(000[1-9]|00[1-9]\d|0[1-9]\d{2}|[1-9]\d{3})-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?(Z|[+-](0\d|1[0-5]):?[0-5]\d)?)?$/;

/**
 * Validates whether a string is a well-formed, parseable ISO-8601 date/timestamp
 * with strict calendar validity (leap years, days per month, hours/minutes/seconds)
 * and Gregorian AD range (year 0001-9999, timezone displacement <= 15:59).
 */
export function isValidIsoDate(dateStr: string): boolean {
  if (typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (trimmed !== dateStr || !ISO_DATE_REGEX.test(trimmed)) return false;

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/);
  if (!match) return false;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (year < 1 || year > 9999) return false;
  if (month < 1 || month > 12) return false;

  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const maxDaysPerMonth = [0, 31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (day < 1 || day > maxDaysPerMonth[month]) return false;

  if (match[4] !== undefined) {
    const hours = parseInt(match[4], 10);
    const minutes = parseInt(match[5], 10);
    const seconds = parseInt(match[6], 10);

    if (hours < 0 || hours > 23) return false;
    if (minutes < 0 || minutes > 59) return false;
    if (seconds < 0 || seconds > 59) return false;
  }

  // Timezone displacement check (if present, displacement hour must be <= 15)
  const tzMatch = trimmed.match(/([+-])(\d{2}):?(\d{2})$/);
  if (tzMatch) {
    const tzHours = parseInt(tzMatch[2], 10);
    const tzMinutes = parseInt(tzMatch[3], 10);
    if (tzHours > 15 || (tzHours === 15 && tzMinutes > 59)) return false;
  }

  const parsed = Date.parse(trimmed);
  return !Number.isNaN(parsed);
}

/**
 * Regex canônica para URLs HTTP ou HTTPS compartilhada entre domínio e SQL (PIM.W2C.3).
 * Aceita protocolo http:// ou https://, host estruturado (FQDN com TLD >= 2 letras, localhost ou IPv4 válido),
 * porta opcional estritamente no intervalo [0, 65535] e caminho/query/hash opcionais sem whitespace.
 */
export const CANONICAL_HTTP_URL_REGEX =
  /^https?:\/\/(([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}|localhost|((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9]))(:(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}|0))?(\/[^\s]*)?$/i;

/**
 * Valida se uma string é uma URL HTTP ou HTTPS canônica válida com porta [0, 65535] (PIM.W2C.3).
 */
export function isValidHttpUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed !== url || !CANONICAL_HTTP_URL_REGEX.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const portMatch = trimmed.match(/:(\d+)(?:\/|$|\?|#)/);
    if (portMatch) {
      const port = parseInt(portMatch[1], 10);
      if (port < 0 || port > 65535) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Options for validating a Product Workbook in context.
 */
export interface WorkbookValidationOptions {
  readonly familyWorkbook?: ProductWorkbook;
  readonly tolerateDanglingViews?: boolean;
}

/**
 * Validates all structural, referential, and semantic invariants of a ProductWorkbook.
 * Returns structured errors and warnings.
 */
export function validateProductWorkbook(
  workbook: ProductWorkbook,
  options?: WorkbookValidationOptions
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Schema Version & Revision
  if (workbook.schemaVersion !== 1 && workbook.schemaVersion !== 2) {
    errors.push({
      path: 'schemaVersion',
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `schemaVersion ${(workbook as { schemaVersion?: unknown }).schemaVersion} não suportada. Esperado: 1 ou 2.`
    });
  }

  if (typeof workbook.revision !== 'number' || workbook.revision < 0 || !Number.isInteger(workbook.revision)) {
    errors.push({
      path: 'revision',
      code: 'INVALID_REVISION',
      message: 'Revisão do workbook deve ser um número inteiro maior ou igual a zero.'
    });
  }

  // 2. Modules Integrity
  const seenModuleIds = new Set<string>();
  const seenModuleSemanticKeys = new Set<string>();

  for (let i = 0; i < workbook.modules.length; i++) {
    const mod = workbook.modules[i];
    const modPath = `modules[${i}]`;

    // C4. Unique module IDs
    if (seenModuleIds.has(mod.id)) {
      errors.push({
        path: `${modPath}.id`,
        code: 'DUPLICATE_MODULE_ID',
        message: `ID de módulo duplicado: "${mod.id}".`
      });
    } else {
      seenModuleIds.add(mod.id);
    }

    // C5. Unique module semantic keys
    if (seenModuleSemanticKeys.has(mod.semanticKey)) {
      errors.push({
        path: `${modPath}.semanticKey`,
        code: 'DUPLICATE_MODULE_SEMANTIC',
        message: `semanticKey de módulo duplicada: "${mod.semanticKey}".`
      });
    } else {
      seenModuleSemanticKeys.add(mod.semanticKey);
    }

    if (!isValidSemanticKey(mod.semanticKey)) {
      errors.push({
        path: `${modPath}.semanticKey`,
        code: 'INVALID_SEMANTIC_KEY',
        message: `semanticKey do módulo "${mod.semanticKey}" inválida. Deve seguir o padrão namespace.segment.`
      });
    }

    // Localized labels validation (Part G)
    if (mod.localizedLabels) {
      for (const [lang, text] of Object.entries(mod.localizedLabels)) {
        if (!isValidBcp47LanguageTag(lang)) {
          errors.push({
            path: `${modPath}.localizedLabels[${lang}]`,
            code: 'INVALID_BCP47_TAG',
            message: `Tag de idioma BCP-47 inválida: "${lang}".`
          });
        }
        if (!text || text.trim().length === 0) {
          errors.push({
            path: `${modPath}.localizedLabels[${lang}]`,
            code: 'EMPTY_LOCALIZED_TEXT',
            message: `Texto localizado para idioma "${lang}" não pode ser vazio.`
          });
        }
      }
    }
  }

  // 3. Data Record Integrity
  const seenDatumSemanticKeys = new Set<string>();
  const localModuleDatumCounts = new Map<string, number>();

  for (const [dataKey, datum] of Object.entries(workbook.data)) {
    const datumPath = `data[${dataKey}]`;

    if (!datum || typeof datum !== 'object') {
      errors.push({
        path: datumPath,
        code: 'INVALID_DATUM_OBJECT',
        message: `Dado "${dataKey}" é nulo ou inválido.`
      });
      continue;
    }

    // C1. Data Record Key Match
    if (datum.id !== dataKey) {
      errors.push({
        path: datumPath,
        code: 'DATA_KEY_ID_MISMATCH',
        message: `Chave do mapa "${dataKey}" não corresponde ao id interno do dado "${datum.id}".`
      });
    }

    // C6. Unique Datum Semantic Keys
    if (seenDatumSemanticKeys.has(datum.semanticKey)) {
      errors.push({
        path: `${datumPath}.semanticKey`,
        code: 'DUPLICATE_DATUM_SEMANTIC',
        message: `semanticKey de dado duplicada neste workbook: "${datum.semanticKey}".`
      });
    } else {
      seenDatumSemanticKeys.add(datum.semanticKey);
    }

    if (!isValidSemanticKey(datum.semanticKey)) {
      errors.push({
        path: `${datumPath}.semanticKey`,
        code: 'INVALID_SEMANTIC_KEY',
        message: `semanticKey do dado "${datum.semanticKey}" inválida.`
      });
    }

    // C2. Module Reference
    const isLocalModule = seenModuleIds.has(datum.moduleId);
    const isFamilyModule = Boolean(
      options?.familyWorkbook?.modules.some((m) => m.id === datum.moduleId)
    );

    if (!isLocalModule && !isFamilyModule) {
      errors.push({
        path: `${datumPath}.moduleId`,
        code: 'DATUM_MODULE_NOT_FOUND',
        message: `Módulo "${datum.moduleId}" referenciado pelo dado "${datum.id}" não existe no workbook${
          options?.familyWorkbook ? ' nem na família associada' : ''
        }.`
      });
    }

    // Track for module.datumIds verification
    if (isLocalModule) {
      localModuleDatumCounts.set(datum.id, (localModuleDatumCounts.get(datum.id) ?? 0) + 1);
    }

    // Localized labels
    if (datum.localizedLabels) {
      for (const [lang, text] of Object.entries(datum.localizedLabels)) {
        if (!isValidBcp47LanguageTag(lang)) {
          errors.push({
            path: `${datumPath}.localizedLabels[${lang}]`,
            code: 'INVALID_BCP47_TAG',
            message: `Tag de idioma BCP-47 inválida no dado "${datum.id}": "${lang}".`
          });
        }
        if (!text || text.trim().length === 0) {
          errors.push({
            path: `${datumPath}.localizedLabels[${lang}]`,
            code: 'EMPTY_LOCALIZED_TEXT',
            message: `Texto localizado para idioma "${lang}" no dado "${datum.id}" não pode ser vazio.`
          });
        }
      }
    }

    // Evidence validations
    const evidenceIds = new Set<string>();
    for (let eIdx = 0; eIdx < datum.evidence.length; eIdx++) {
      const ev = datum.evidence[eIdx];
      const evPath = `${datumPath}.evidence[${eIdx}]`;

      if (evidenceIds.has(ev.id)) {
        errors.push({
          path: `${evPath}.id`,
          code: 'DUPLICATE_EVIDENCE_ID',
          message: `ID de evidência duplicado no mesmo dado: "${ev.id}".`
        });
      } else {
        evidenceIds.add(ev.id);
      }

      if (ev.capturedAt && !isValidIsoDate(ev.capturedAt)) {
        errors.push({
          path: `${evPath}.capturedAt`,
          code: 'INVALID_ISO_DATE',
          message: `capturedAt "${ev.capturedAt}" não é uma data ISO-8601 válida.`
        });
      }
    }

    // Canonical Decision Integrity (Part A)
    if (datum.canonicalDecision) {
      validateCanonicalDecision(datum.canonicalDecision, datum, `${datumPath}.canonicalDecision`, errors);
    }

    // Audit timestamps
    if (datum.audit) {
      if (!isValidIsoDate(datum.audit.createdAt)) {
        errors.push({
          path: `${datumPath}.audit.createdAt`,
          code: 'INVALID_ISO_DATE',
          message: `createdAt "${datum.audit.createdAt}" não é uma data ISO-8601 válida.`
        });
      }
      if (!isValidIsoDate(datum.audit.updatedAt)) {
        errors.push({
          path: `${datumPath}.audit.updatedAt`,
          code: 'INVALID_ISO_DATE',
          message: `updatedAt "${datum.audit.updatedAt}" não é uma data ISO-8601 válida.`
        });
      }
    }
  }

  // C3. Module.datumIds integrity
  for (let i = 0; i < workbook.modules.length; i++) {
    const mod = workbook.modules[i];
    const modPath = `modules[${i}].datumIds`;
    const seenInModule = new Set<string>();

    for (let dIdx = 0; dIdx < mod.datumIds.length; dIdx++) {
      const datumId = mod.datumIds[dIdx];

      if (seenInModule.has(datumId)) {
        errors.push({
          path: `${modPath}[${dIdx}]`,
          code: 'DUPLICATE_MODULE_DATUM_REF',
          message: `Dado "${datumId}" aparece mais de uma vez em datumIds do módulo "${mod.id}".`
        });
      } else {
        seenInModule.add(datumId);
      }

      const referencedDatum = workbook.data[datumId];
      if (!referencedDatum) {
        errors.push({
          path: `${modPath}[${dIdx}]`,
          code: 'MODULE_DATUM_NOT_FOUND',
          message: `Dado "${datumId}" presente em datumIds do módulo "${mod.id}" não existe no mapa data.`
        });
      } else if (referencedDatum.moduleId !== mod.id) {
        errors.push({
          path: `${modPath}[${dIdx}]`,
          code: 'DATUM_MODULE_MISMATCH',
          message: `Dado "${datumId}" está listado no módulo "${mod.id}", mas seu moduleId aponta para "${referencedDatum.moduleId}".`
        });
      }
    }
  }

  // C3. Verify every local datum appears in its module's datumIds
  for (const datumId of localModuleDatumCounts.keys()) {
    const datum = workbook.data[datumId];
    if (!datum) continue;
    const mod = workbook.modules.find((m) => m.id === datum.moduleId);
    if (mod && !mod.datumIds.includes(datumId)) {
      errors.push({
        path: `data[${datumId}]`,
        code: 'DATUM_NOT_IN_MODULE_DATUM_IDS',
        message: `Dado local "${datumId}" não está registrado na lista datumIds de seu módulo "${datum.moduleId}".`
      });
    }
  }

  // C7. Overrides integrity
  if (workbook.owner.kind === 'family' && workbook.overrides && Object.keys(workbook.overrides).length > 0) {
    errors.push({
      path: 'overrides',
      code: 'FAMILY_CANNOT_HAVE_OVERRIDES',
      message: 'Workbooks de família não podem definir overrides.'
    });
  }

  if (workbook.overrides) {
    for (const [ovKey, override] of Object.entries(workbook.overrides)) {
      const ovPath = `overrides[${ovKey}]`;

      if (override.targetSemanticKey !== ovKey) {
        errors.push({
          path: ovPath,
          code: 'OVERRIDE_KEY_MISMATCH',
          message: `Chave do mapa de override "${ovKey}" não corresponde a targetSemanticKey "${override.targetSemanticKey}".`
        });
      }

      if (!isValidSemanticKey(override.targetSemanticKey)) {
        errors.push({
          path: `${ovPath}.targetSemanticKey`,
          code: 'INVALID_SEMANTIC_KEY',
          message: `targetSemanticKey "${override.targetSemanticKey}" é inválida.`
        });
      }

      if (override.mode === 'override' && !override.overriddenValue) {
        errors.push({
          path: ovPath,
          code: 'MISSING_OVERRIDE_VALUE',
          message: `Override para "${override.targetSemanticKey}" em modo "override" exige overriddenValue.`
        });
      }
    }
  }

  // C8. Saved Views integrity
  if (workbook.savedViews) {
    const seenViewIds = new Set<string>();

    for (let vIdx = 0; vIdx < workbook.savedViews.length; vIdx++) {
      const view = workbook.savedViews[vIdx];
      const viewPath = `savedViews[${vIdx}]`;

      if (seenViewIds.has(view.id)) {
        errors.push({
          path: `${viewPath}.id`,
          code: 'DUPLICATE_VIEW_ID',
          message: `ID de visão salva duplicado: "${view.id}".`
        });
      } else {
        seenViewIds.add(view.id);
      }

      // Check datumKeys existence
      for (const datumKey of view.datumKeys) {
        const existsInLocal = Object.values(workbook.data).some(
          (d) => d.semanticKey === datumKey || d.id === datumKey
        );
        const existsInFamily = Boolean(
          options?.familyWorkbook &&
            Object.values(options.familyWorkbook.data).some(
              (d) => d.semanticKey === datumKey || d.id === datumKey
            )
        );

        if (!existsInLocal && !existsInFamily) {
          const issue: ValidationIssue = {
            path: `${viewPath}.datumKeys`,
            code: 'VIEW_DANGLING_DATUM_KEY',
            message: `Visão salva "${view.name}" referencia chave/id inexistente: "${datumKey}".`
          };

          if (options?.tolerateDanglingViews) {
            warnings.push(issue);
          } else {
            errors.push(issue);
          }
        }
      }
    }
  }

  // C9. TechnicalDataset integrity (PIM Core V1 / SchemaVersion 2)
  if ('datasets' in workbook && workbook.datasets) {
    const seenDatasetIds = new Set<string>();
    const seenDatasetSemanticKeys = new Set<string>();
    const availableModuleIds = new Set(workbook.modules.map((m) => m.id));

    for (let dsIdx = 0; dsIdx < workbook.datasets.length; dsIdx++) {
      const dataset = workbook.datasets[dsIdx];
      const dsPath = `datasets[${dsIdx}]`;

      // Dataset ID uniqueness
      if (seenDatasetIds.has(dataset.id)) {
        errors.push({
          path: `${dsPath}.id`,
          code: 'DUPLICATE_DATASET_ID',
          message: `ID de dataset duplicado: "${dataset.id}".`
        });
      } else {
        seenDatasetIds.add(dataset.id);
      }

      // Dataset semanticKey uniqueness and format
      if (seenDatasetSemanticKeys.has(dataset.semanticKey)) {
        errors.push({
          path: `${dsPath}.semanticKey`,
          code: 'DUPLICATE_DATASET_SEMANTIC_KEY',
          message: `semanticKey de dataset duplicada: "${dataset.semanticKey}".`
        });
      } else {
        seenDatasetSemanticKeys.add(dataset.semanticKey);
      }

      if (!isValidSemanticKey(dataset.semanticKey)) {
        errors.push({
          path: `${dsPath}.semanticKey`,
          code: 'INVALID_SEMANTIC_KEY',
          message: `semanticKey de dataset "${dataset.semanticKey}" inválida.`
        });
      }

      // EMENDA 5: Module relationship
      if (!availableModuleIds.has(dataset.moduleId)) {
        errors.push({
          path: `${dsPath}.moduleId`,
          code: 'DATASET_MODULE_NOT_FOUND',
          message: `Dataset "${dataset.label}" vinculado a moduleId inexistente: "${dataset.moduleId}".`
        });
      }

      // Columns validation
      const seenColumnIds = new Set<string>();
      const seenColumnSemanticKeys = new Set<string>();
      const columnById = new Map<string, DatasetColumn>();

      for (let cIdx = 0; cIdx < dataset.columns.length; cIdx++) {
        const col = dataset.columns[cIdx];
        const colPath = `${dsPath}.columns[${cIdx}]`;

        if (seenColumnIds.has(col.id)) {
          errors.push({
            path: `${colPath}.id`,
            code: 'DUPLICATE_DATASET_COLUMN_ID',
            message: `ID de coluna duplicado no dataset "${dataset.label}": "${col.id}".`
          });
        } else {
          seenColumnIds.add(col.id);
        }

        if (seenColumnSemanticKeys.has(col.semanticKey)) {
          errors.push({
            path: `${colPath}.semanticKey`,
            code: 'DUPLICATE_DATASET_COLUMN_SEMANTIC_KEY',
            message: `semanticKey de coluna duplicada no dataset "${dataset.label}": "${col.semanticKey}".`
          });
        } else {
          seenColumnSemanticKeys.add(col.semanticKey);
        }

        if (!isValidSemanticKey(col.semanticKey)) {
          errors.push({
            path: `${colPath}.semanticKey`,
            code: 'INVALID_SEMANTIC_KEY',
            message: `semanticKey de coluna "${col.semanticKey}" inválida.`
          });
        }

        columnById.set(col.id, col);
      }

      // Rows validation
      const seenRowIds = new Set<string>();
      for (let rIdx = 0; rIdx < dataset.rows.length; rIdx++) {
        const row = dataset.rows[rIdx];
        const rowPath = `${dsPath}.rows[${rIdx}]`;

        if (seenRowIds.has(row.id)) {
          errors.push({
            path: `${rowPath}.id`,
            code: 'DUPLICATE_DATASET_ROW_ID',
            message: `ID de linha duplicado no dataset "${dataset.label}": "${row.id}".`
          });
        } else {
          seenRowIds.add(row.id);
        }

        if (row.semanticKey && !isValidSemanticKey(row.semanticKey)) {
          errors.push({
            path: `${rowPath}.semanticKey`,
            code: 'INVALID_SEMANTIC_KEY',
            message: `semanticKey de linha "${row.semanticKey}" inválida.`
          });
        }
      }

      // Cells validation (EMENDA 2, 3, 4)
      const seenCellCoords = new Set<string>();

      for (const [cellKey, cell] of Object.entries(dataset.cells)) {
        const cellPath = `${dsPath}.cells["${cellKey}"]`;

        // EMENDA 3: Key must match getDatasetCellKey
        let expectedKey: string | null = null;
        try {
          expectedKey = getDatasetCellKey(cell.rowId, cell.columnId);
        } catch {
          errors.push({
            path: cellPath,
            code: 'INVALID_CELL_COORDINATES',
            message: `Coordenadas da célula inválidas: rowId="${cell.rowId}", columnId="${cell.columnId}".`
          });
        }

        if (expectedKey && cellKey !== expectedKey) {
          errors.push({
            path: cellPath,
            code: 'CELL_KEY_COORDINATE_MISMATCH',
            message: `Chave da célula "${cellKey}" não corresponde à chave determinística esperada "${expectedKey}".`
          });
        }

        const coord = `${cell.rowId}#${cell.columnId}`;
        if (seenCellCoords.has(coord)) {
          errors.push({
            path: cellPath,
            code: 'DUPLICATE_CELL_COORDINATE',
            message: `Coordenada duplicada no dataset "${dataset.label}": linha "${cell.rowId}", coluna "${cell.columnId}".`
          });
        } else {
          seenCellCoords.add(coord);
        }

        // Row existence
        if (!seenRowIds.has(cell.rowId)) {
          errors.push({
            path: `${cellPath}.rowId`,
            code: 'DATASET_ROW_NOT_FOUND',
            message: `Célula referencia rowId inexistente no dataset: "${cell.rowId}".`
          });
        }

        // Column existence
        const col = columnById.get(cell.columnId);
        if (!col) {
          errors.push({
            path: `${cellPath}.columnId`,
            code: 'DATASET_COLUMN_NOT_FOUND',
            message: `Célula referencia columnId inexistente no dataset: "${cell.columnId}".`
          });
        }

        // EMENDA 2: Datum existence in workbook.data
        const datum = workbook.data[cell.datumId];
        if (!datum) {
          errors.push({
            path: `${cellPath}.datumId`,
            code: 'DATASET_DATUM_NOT_FOUND',
            message: `Célula referencia datumId inexistente no mapa data do workbook: "${cell.datumId}".`
          });
        } else if (col) {
          // EMENDA 4: Type compatibility constraint
          if (datum.value.type !== col.valueType) {
            errors.push({
              path: `${cellPath}.datumId`,
              code: 'DATASET_CELL_TYPE_MISMATCH',
              message: `Tipo do valor do dado "${datum.value.type}" não é compatível com o valueType da coluna "${col.valueType}".`
            });
          }

          // EMENDA 4: Unit compatibility constraint
          if (col.unit) {
            if (datum.value.type === 'quantity' && datum.value.unit !== col.unit) {
              errors.push({
                path: `${cellPath}.datumId`,
                code: 'DATASET_CELL_UNIT_MISMATCH',
                message: `Unidade da quantidade do dado "${datum.value.unit}" difere da unidade exigida pela coluna "${col.unit}".`
              });
            } else if (datum.value.type === 'range' && datum.value.unit !== col.unit) {
              errors.push({
                path: `${cellPath}.datumId`,
                code: 'DATASET_CELL_UNIT_MISMATCH',
                message: `Unidade da faixa do dado "${datum.value.unit}" difere da unidade exigida pela coluna "${col.unit}".`
              });
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates canonical decision invariants on a datum (Parts A1, A2, A3, D1).
 */
function validateCanonicalDecision(
  decision: TechnicalDatum['canonicalDecision'],
  datum: TechnicalDatum,
  path: string,
  errors: ValidationIssue[]
): void {
  if (!decision) return;

  // A2. Non-empty rationale
  if (!decision.rationale || decision.rationale.trim().length === 0) {
    errors.push({
      path: `${path}.rationale`,
      code: 'EMPTY_DECISION_RATIONALE',
      message: 'Decisão canônica deve conter justificativa não vazia (rationale).'
    });
  }

  // D1. Valid ISO-8601 decidedAt
  if (!isValidIsoDate(decision.decidedAt)) {
    errors.push({
      path: `${path}.decidedAt`,
      code: 'INVALID_ISO_DATE',
      message: `decidedAt "${decision.decidedAt}" não é uma data ISO-8601 válida.`
    });
  }

  const availableEvidenceIds = new Set(datum.evidence.map((e) => e.id));

  // A3. Referential evidence existence
  switch (decision.kind) {
    case 'selected_evidence': {
      if (!decision.selectedEvidenceId) {
        errors.push({
          path: `${path}.selectedEvidenceId`,
          code: 'MISSING_SELECTED_EVIDENCE_ID',
          message: 'Decisão do tipo selected_evidence exige selectedEvidenceId.'
        });
      } else if (!availableEvidenceIds.has(decision.selectedEvidenceId)) {
        errors.push({
          path: `${path}.selectedEvidenceId`,
          code: 'ORPHAN_EVIDENCE_REF',
          message: `selectedEvidenceId "${decision.selectedEvidenceId}" não existe nas evidências anexadas ao dado.`
        });
      }
      break;
    }

    case 'engineering_decision': {
      if (!decision.basisEvidenceIds || decision.basisEvidenceIds.length === 0) {
        errors.push({
          path: `${path}.basisEvidenceIds`,
          code: 'MISSING_BASIS_EVIDENCE_IDS',
          message: 'Decisão de engenharia exige ao menos uma evidência de base em basisEvidenceIds.'
        });
      } else {
        for (const evId of decision.basisEvidenceIds) {
          if (!availableEvidenceIds.has(evId)) {
            errors.push({
              path: `${path}.basisEvidenceIds`,
              code: 'ORPHAN_EVIDENCE_REF',
              message: `basisEvidenceId "${evId}" não existe nas evidências anexadas ao dado.`
            });
          }
        }
      }
      break;
    }

    case 'verified_consensus': {
      if (!decision.verifiedEvidenceIds || decision.verifiedEvidenceIds.length === 0) {
        errors.push({
          path: `${path}.verifiedEvidenceIds`,
          code: 'MISSING_VERIFIED_EVIDENCE_IDS',
          message: 'Consenso verificado exige ao menos uma evidência em verifiedEvidenceIds.'
        });
      } else {
        for (const evId of decision.verifiedEvidenceIds) {
          if (!availableEvidenceIds.has(evId)) {
            errors.push({
              path: `${path}.verifiedEvidenceIds`,
              code: 'ORPHAN_EVIDENCE_REF',
              message: `verifiedEvidenceId "${evId}" não existe nas evidências anexadas ao dado.`
            });
          }
        }
      }
      break;
    }

    default:
      errors.push({
        path: `${path}.kind`,
        code: 'UNKNOWN_DECISION_KIND',
        message: `Tipo de decisão canônica desconhecido.`
      });
  }
}

/**
 * Validates bundle-level referential integrity across multiple workbooks and sources (Part B).
 */
export function validateProductKnowledgeBundle(bundle: ProductKnowledgeBundle): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // B2. Unique Source Document IDs
  const sourceDocIds = new Set<string>();
  for (let sIdx = 0; sIdx < bundle.sources.length; sIdx++) {
    const src = bundle.sources[sIdx];
    const srcPath = `sources[${sIdx}]`;

    if (sourceDocIds.has(src.id)) {
      errors.push({
        path: `${srcPath}.id`,
        code: 'DUPLICATE_SOURCE_ID',
        message: `ID de documento fonte duplicado no bundle: "${src.id}".`
      });
    } else {
      sourceDocIds.add(src.id);
    }

    // Source language validation (Part D)
    if (src.language && !isValidBcp47LanguageTag(src.language)) {
      errors.push({
        path: `${srcPath}.language`,
        code: 'INVALID_BCP47_TAG',
        message: `Código de idioma BCP-47 inválido no documento fonte: "${src.language}".`
      });
    }

    // Source publication date
    if (src.publicationDate && !isValidIsoDate(src.publicationDate)) {
      errors.push({
        path: `${srcPath}.publicationDate`,
        code: 'INVALID_ISO_DATE',
        message: `publicationDate "${src.publicationDate}" não é uma data ISO-8601 válida.`
      });
    }
  }

  // B3. Unique Workbook Owner Identity (one active workbook per owner identity)
  const seenOwners = new Set<string>();
  for (let wIdx = 0; wIdx < bundle.workbooks.length; wIdx++) {
    const wb = bundle.workbooks[wIdx];
    const wbPath = `workbooks[${wIdx}]`;
    const ownerKey = `${wb.owner.kind}:${wb.owner.id}`;

    if (seenOwners.has(ownerKey)) {
      errors.push({
        path: `${wbPath}.owner`,
        code: 'DUPLICATE_WORKBOOK_OWNER',
        message: `Já existe um workbook ativo no bundle para o proprietário "${ownerKey}".`
      });
    } else {
      seenOwners.add(ownerKey);
    }

    // B1. Validate that all Evidence.sourceDocumentId reference a SourceDocument present in bundle
    for (const [datumId, datum] of Object.entries(wb.data)) {
      for (let eIdx = 0; eIdx < datum.evidence.length; eIdx++) {
        const ev = datum.evidence[eIdx];
        if (!sourceDocIds.has(ev.sourceDocumentId)) {
          errors.push({
            path: `${wbPath}.data[${datumId}].evidence[${eIdx}].sourceDocumentId`,
            code: 'ORPHAN_SOURCE_DOCUMENT_REF',
            message: `Evidência "${ev.id}" referencia sourceDocumentId inexistente no bundle: "${ev.sourceDocumentId}".`
          });
        }
      }
    }

    // Validate overrides evidence
    if (wb.overrides) {
      for (const [ovKey, override] of Object.entries(wb.overrides)) {
        if (override.evidence) {
          for (let eIdx = 0; eIdx < override.evidence.length; eIdx++) {
            const ev = override.evidence[eIdx];
            if (!sourceDocIds.has(ev.sourceDocumentId)) {
              errors.push({
                path: `${wbPath}.overrides[${ovKey}].evidence[${eIdx}].sourceDocumentId`,
                code: 'ORPHAN_SOURCE_DOCUMENT_REF',
                message: `Evidência de override "${ev.id}" referencia sourceDocumentId inexistente no bundle: "${ev.sourceDocumentId}".`
              });
            }
          }
        }
      }
    }

    // Run workbook internal validation
    const wbValidation = validateProductWorkbook(wb);
    for (const err of wbValidation.errors) {
      errors.push({
        path: `${wbPath}.${err.path}`,
        code: err.code,
        message: err.message
      });
    }
    for (const warn of wbValidation.warnings) {
      warnings.push({
        path: `${wbPath}.${warn.path}`,
        code: warn.code,
        message: warn.message
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
