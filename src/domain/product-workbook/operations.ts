// src/domain/product-workbook/operations.ts
// Pure immutable domain operations for Technical Knowledge Workbooks (PIM.W1 / PIM.W1.2).
// Enforces fail-closed invariants: no duplicate keys, strict foreign key existence,
// and safe state transitions.
// IMPORTANT (PIM.W1.2): ProductWorkbook.revision represents the authoritative persisted/server revision
// used for optimistic concurrency (CAS). Pure domain edit operations strictly PRESERVE this revision.
// Dirty state or local mutation tracking belongs to the editing/store layer, not the canonical workbook.
// Zero explicit any.

import {
  ProductWorkbook,
  ProductWorkbookV2,
  WorkbookOwner,
  TechnicalModule,
  TechnicalDatum,
  TechnicalValue,
  Evidence,
  CanonicalDecision,
  InheritedDatumOverride,
  ProductDataView,
  TechnicalDataset,
  DatasetColumn,
  DatasetRow,
  DatasetCell,
  getDatasetCellKey,
  ensureWorkbookV2
} from './types';
import { isValidSemanticKey } from './schema';
import {
  detectEvidenceConflicts,
  isCanonicalDecisionValidForDatum
} from './provenance.engine';

/**
 * Domain Error for Product Workbook validation and invariant violations.
 */
export class ProductWorkbookError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[ProductWorkbook:${code}] ${message}`);
    this.name = 'ProductWorkbookError';
  }
}

/**
 * Creates a fresh empty Product Workbook with valid schemaVersion 1.
 */
export function createWorkbook(params: {
  id?: string;
  owner: WorkbookOwner;
  revision?: number;
}): ProductWorkbook {
  return {
    id: params.id ?? `wbk_${params.owner.kind}_${params.owner.id}`,
    schemaVersion: 1,
    owner: params.owner,
    revision: params.revision ?? 0,
    modules: [],
    data: {},
    overrides: params.owner.kind === 'product' ? {} : undefined,
    savedViews: []
  };
}

/**
 * Adds a new technical module to the workbook.
 */
export function addModule(
  workbook: ProductWorkbook,
  moduleData: Omit<TechnicalModule, 'datumIds'>
): ProductWorkbook {
  if (!isValidSemanticKey(moduleData.semanticKey)) {
    throw new ProductWorkbookError(
      'INVALID_SEMANTIC_KEY',
      `semanticKey do módulo "${moduleData.semanticKey}" é inválida. Deve seguir namespace.segment.`
    );
  }

  const existingWithKey = workbook.modules.find((m) => m.semanticKey === moduleData.semanticKey);
  if (existingWithKey) {
    throw new ProductWorkbookError(
      'DUPLICATE_MODULE_KEY',
      `Já existe um módulo com a semanticKey "${moduleData.semanticKey}".`
    );
  }

  const existingWithId = workbook.modules.find((m) => m.id === moduleData.id);
  if (existingWithId) {
    throw new ProductWorkbookError(
      'DUPLICATE_MODULE_ID',
      `Já existe um módulo com o ID "${moduleData.id}".`
    );
  }

  const newModule: TechnicalModule = {
    ...moduleData,
    datumIds: []
  };

  return {
    ...workbook,
    revision: workbook.revision,
    modules: [...workbook.modules, newModule]
  };
}

/**
 * Safely renames the display label of a module.
 */
export function renameModuleLabel(
  workbook: ProductWorkbook,
  moduleId: string,
  newLabel: string
): ProductWorkbook {
  const moduleIndex = workbook.modules.findIndex((m) => m.id === moduleId);
  if (moduleIndex === -1) {
    throw new ProductWorkbookError('MODULE_NOT_FOUND', `Módulo "${moduleId}" não encontrado.`);
  }

  const updatedModules = [...workbook.modules];
  updatedModules[moduleIndex] = {
    ...updatedModules[moduleIndex],
    label: newLabel
  };

  return {
    ...workbook,
    revision: workbook.revision,
    modules: updatedModules
  };
}

/**
 * Safely removes a module and all contained data points.
 */
export function removeModule(workbook: ProductWorkbook, moduleId: string): ProductWorkbook {
  const targetModule = workbook.modules.find((m) => m.id === moduleId);
  if (!targetModule) {
    throw new ProductWorkbookError('MODULE_NOT_FOUND', `Módulo "${moduleId}" não encontrado.`);
  }

  const updatedData = { ...workbook.data };
  for (const datumId of targetModule.datumIds) {
    delete updatedData[datumId];
  }

  return {
    ...workbook,
    revision: workbook.revision,
    modules: workbook.modules.filter((m) => m.id !== moduleId),
    data: updatedData
  };
}

/**
 * Adds a technical datum to a module within the workbook.
 * Optionally accepts a familyWorkbook if the module is inherited from the family.
 */
export function addDatum(
  workbook: ProductWorkbook,
  datumData: Omit<TechnicalDatum, 'id'>,
  customId?: string,
  familyWorkbook?: ProductWorkbook
): ProductWorkbook {
  if (!isValidSemanticKey(datumData.semanticKey)) {
    throw new ProductWorkbookError(
      'INVALID_SEMANTIC_KEY',
      `semanticKey "${datumData.semanticKey}" inválida. Deve seguir namespace.segment.`
    );
  }

  const moduleIndex = workbook.modules.findIndex((m) => m.id === datumData.moduleId);
  const moduleInFamily = familyWorkbook?.modules.find((m) => m.id === datumData.moduleId);

  if (moduleIndex === -1 && !moduleInFamily) {
    throw new ProductWorkbookError(
      'MODULE_NOT_FOUND',
      `Módulo pai com ID "${datumData.moduleId}" não encontrado no workbook${familyWorkbook ? ' nem na família' : ''}.`
    );
  }

  // Verificar duplicidade de semanticKey no mesmo workbook
  const existingKey = Object.values(workbook.data).find(
    (d) => d.semanticKey === datumData.semanticKey
  );
  if (existingKey) {
    throw new ProductWorkbookError(
      'DUPLICATE_DATUM_KEY',
      `Já existe um dado com a semanticKey "${datumData.semanticKey}" neste workbook.`
    );
  }

  const datumId = customId ?? `dat_${Math.random().toString(36).slice(2, 10)}`;
  const nowIso = new Date().toISOString();

  const newDatum: TechnicalDatum = {
    ...datumData,
    id: datumId,
    audit: datumData.audit ?? {
      createdAt: nowIso,
      updatedAt: nowIso
    }
  };

  let updatedModules: TechnicalModule[] = [...workbook.modules];
  if (moduleIndex !== -1) {
    const targetModule = workbook.modules[moduleIndex];
    const updatedModule: TechnicalModule = {
      ...targetModule,
      datumIds: [...targetModule.datumIds, datumId]
    };

    updatedModules[moduleIndex] = updatedModule;
  }

  return {
    ...workbook,
    revision: workbook.revision,
    modules: updatedModules,
    data: {
      ...workbook.data,
      [datumId]: newDatum
    }
  };
}

/**
 * Updates the technical value of an existing datum.
 */
export function updateDatumValue(
  workbook: ProductWorkbook,
  datumId: string,
  newValue: TechnicalValue
): ProductWorkbook {
  const existingDatum = workbook.data[datumId];
  if (!existingDatum) {
    throw new ProductWorkbookError('DATUM_NOT_FOUND', `Dado com ID "${datumId}" não encontrado.`);
  }

  const updatedDatum: TechnicalDatum = {
    ...existingDatum,
    value: newValue,
    audit: {
      ...existingDatum.audit,
      createdAt: existingDatum.audit?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };

  return {
    ...workbook,
    revision: workbook.revision,
    data: {
      ...workbook.data,
      [datumId]: updatedDatum
    }
  };
}

/**
 * Attaches a source evidence claim to a technical datum.
 */
export function attachEvidence(
  workbook: ProductWorkbook,
  datumId: string,
  evidence: Evidence
): ProductWorkbook {
  const existingDatum = workbook.data[datumId];
  if (!existingDatum) {
    throw new ProductWorkbookError('DATUM_NOT_FOUND', `Dado com ID "${datumId}" não encontrado.`);
  }

  const updatedDatum: TechnicalDatum = {
    ...existingDatum,
    evidence: [...existingDatum.evidence, evidence],
    audit: {
      ...existingDatum.audit,
      createdAt: existingDatum.audit?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };

  return {
    ...workbook,
    revision: workbook.revision,
    data: {
      ...workbook.data,
      [datumId]: updatedDatum
    }
  };
}

/**
 * Sets the canonical decision resolving among multiple observed evidences.
 * Enforces strict referential validity, non-empty rationale, and known evidence IDs (Parts A1, A2, A3).
 */
export function setCanonicalDecision(
  workbook: ProductWorkbook,
  datumId: string,
  decision: CanonicalDecision
): ProductWorkbook {
  const existingDatum = workbook.data[datumId];
  if (!existingDatum) {
    throw new ProductWorkbookError('DATUM_NOT_FOUND', `Dado com ID "${datumId}" não encontrado.`);
  }

  const validation = isCanonicalDecisionValidForDatum(decision, existingDatum);
  if (!validation.valid) {
    throw new ProductWorkbookError(
      'INVALID_CANONICAL_DECISION',
      validation.reason ?? 'Decisão canônica inválida para o dado especificado.'
    );
  }

  const updatedDatum: TechnicalDatum = {
    ...existingDatum,
    canonicalDecision: decision,
    audit: {
      ...existingDatum.audit,
      createdAt: existingDatum.audit?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };

  return {
    ...workbook,
    revision: workbook.revision,
    data: {
      ...workbook.data,
      [datumId]: updatedDatum
    }
  };
}

/**
 * Approves a datum for verified factual status.
 * Fails closed if there are unaddressed conflicting evidences without a canonical decision.
 */
export function approveDatum(
  workbook: ProductWorkbook,
  datumId: string,
  actorRef?: string
): ProductWorkbook {
  const existingDatum = workbook.data[datumId];
  if (!existingDatum) {
    throw new ProductWorkbookError('DATUM_NOT_FOUND', `Dado com ID "${datumId}" não encontrado.`);
  }

  const conflictReport = detectEvidenceConflicts(existingDatum);
  if (conflictReport.hasConflict && !conflictReport.isResolvedByCanonicalDecision) {
    throw new ProductWorkbookError(
      'CANNOT_APPROVE_CONFLICT',
      `Não é possível aprovar dado com conflito de evidências não resolvido por decisão canônica.`
    );
  }

  const updatedDatum: TechnicalDatum = {
    ...existingDatum,
    status: 'approved',
    audit: {
      ...existingDatum.audit,
      createdAt: existingDatum.audit?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: actorRef
    }
  };

  return {
    ...workbook,
    revision: workbook.revision,
    data: {
      ...workbook.data,
      [datumId]: updatedDatum
    }
  };
}

/**
 * Deprecates a datum while keeping it historical and auditable.
 */
export function deprecateDatum(
  workbook: ProductWorkbook,
  datumId: string,
  _reason?: string
): ProductWorkbook {
  const existingDatum = workbook.data[datumId];
  if (!existingDatum) {
    throw new ProductWorkbookError('DATUM_NOT_FOUND', `Dado com ID "${datumId}" não encontrado.`);
  }

  const updatedDatum: TechnicalDatum = {
    ...existingDatum,
    status: 'deprecated',
    audit: {
      ...existingDatum.audit,
      createdAt: existingDatum.audit?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };

  return {
    ...workbook,
    revision: workbook.revision,
    data: {
      ...workbook.data,
      [datumId]: updatedDatum
    }
  };
}

/**
 * Creates or updates an explicit override on an inherited family datum.
 * Allowed only on Product-owned workbooks.
 */
export function createOverride(
  workbook: ProductWorkbook,
  override: InheritedDatumOverride
): ProductWorkbook {
  if (workbook.owner.kind !== 'product') {
    throw new ProductWorkbookError(
      'INVALID_OWNER',
      'Apenas workbooks de produtos podem registrar overrides de família.'
    );
  }

  if (!isValidSemanticKey(override.targetSemanticKey)) {
    throw new ProductWorkbookError(
      'INVALID_SEMANTIC_KEY',
      `Chave semântica de destino "${override.targetSemanticKey}" é inválida.`
    );
  }

  if (override.mode === 'override' && !override.overriddenValue) {
    throw new ProductWorkbookError(
      'MISSING_OVERRIDE_VALUE',
      'Modo override exige definição de overriddenValue.'
    );
  }

  return {
    ...workbook,
    revision: workbook.revision,
    overrides: {
      ...workbook.overrides,
      [override.targetSemanticKey]: override
    }
  };
}

/**
 * Suppresses an inherited family datum for this product.
 */
export function suppressInheritedDatum(
  workbook: ProductWorkbook,
  targetSemanticKey: string,
  notes?: string
): ProductWorkbook {
  return createOverride(workbook, {
    targetSemanticKey,
    mode: 'suppress',
    notes
  });
}

/**
 * Removes an existing override or suppression, restoring natural inheritance.
 */
export function removeOverride(
  workbook: ProductWorkbook,
  targetSemanticKey: string
): ProductWorkbook {
  if (!workbook.overrides || !workbook.overrides[targetSemanticKey]) {
    return workbook;
  }

  const updatedOverrides = { ...workbook.overrides };
  delete updatedOverrides[targetSemanticKey];

  return {
    ...workbook,
    revision: workbook.revision,
    overrides: updatedOverrides
  };
}

/**
 * Creates a saved view in the workbook.
 * Enforces fail-closed validation on datumKeys: dangling keys without matching local or family datum are rejected (Part C8).
 */
export function createSavedView(
  workbook: ProductWorkbook,
  view: ProductDataView,
  familyWorkbook?: ProductWorkbook
): ProductWorkbook {
  const existingView = workbook.savedViews?.find((v) => v.id === view.id);
  if (existingView) {
    throw new ProductWorkbookError('DUPLICATE_VIEW_ID', `Visão com ID "${view.id}" já existe.`);
  }

  for (const datumKey of view.datumKeys) {
    const existsLocally = Object.values(workbook.data).some(
      (d) => d.semanticKey === datumKey || d.id === datumKey
    );
    const existsInFamily = Boolean(
      familyWorkbook &&
        Object.values(familyWorkbook.data).some(
          (d) => d.semanticKey === datumKey || d.id === datumKey
        )
    );
    if (!existsLocally && !existsInFamily) {
      throw new ProductWorkbookError(
        'DANGLING_VIEW_KEY',
        `A chave "${datumKey}" referenciada na visão "${view.name}" não existe nos dados do produto${
          familyWorkbook ? ' nem da família' : ''
        }.`
      );
    }
  }

  return {
    ...workbook,
    revision: workbook.revision,
    savedViews: [...(workbook.savedViews ?? []), view]
  };
}

/**
 * Updates an existing saved view.
 * Enforces fail-closed validation if datumKeys are updated (Part C8).
 */
export function updateSavedView(
  workbook: ProductWorkbook,
  viewId: string,
  updates: Partial<ProductDataView>,
  familyWorkbook?: ProductWorkbook
): ProductWorkbook {
  const views = workbook.savedViews ?? [];
  const viewIndex = views.findIndex((v) => v.id === viewId);
  if (viewIndex === -1) {
    throw new ProductWorkbookError('VIEW_NOT_FOUND', `Visão com ID "${viewId}" não encontrada.`);
  }

  if (updates.datumKeys) {
    for (const datumKey of updates.datumKeys) {
      const existsLocally = Object.values(workbook.data).some(
        (d) => d.semanticKey === datumKey || d.id === datumKey
      );
      const existsInFamily = Boolean(
        familyWorkbook &&
          Object.values(familyWorkbook.data).some(
            (d) => d.semanticKey === datumKey || d.id === datumKey
          )
      );
      if (!existsLocally && !existsInFamily) {
        throw new ProductWorkbookError(
          'DANGLING_VIEW_KEY',
          `A chave "${datumKey}" referenciada na atualização da visão não existe nos dados do produto${
            familyWorkbook ? ' nem da família' : ''
          }.`
        );
      }
    }
  }

  const updatedViews = [...views];
  updatedViews[viewIndex] = {
    ...updatedViews[viewIndex],
    ...updates,
    id: viewId // ID é imutável
  };

  return {
    ...workbook,
    revision: workbook.revision,
    savedViews: updatedViews
  };
}

/**
 * Deletes a saved view.
 */
export function deleteSavedView(workbook: ProductWorkbook, viewId: string): ProductWorkbook {
  const views = workbook.savedViews ?? [];
  const filtered = views.filter((v) => v.id !== viewId);
  if (filtered.length === views.length) {
    throw new ProductWorkbookError('VIEW_NOT_FOUND', `Visão com ID "${viewId}" não encontrada.`);
  }

  return {
    ...workbook,
    revision: workbook.revision,
    savedViews: filtered
  };
}

/**
 * Adiciona um TechnicalDataset ao workbook (PIM Core V1).
 */
export function addDataset(
  workbook: ProductWorkbook,
  dataset: TechnicalDataset
): ProductWorkbookV2 {
  const wbV2 = ensureWorkbookV2(workbook);

  // Valida unicidade de ID
  if (wbV2.datasets.some((d) => d.id === dataset.id)) {
    throw new ProductWorkbookError('DUPLICATE_DATASET_ID', `Dataset com ID "${dataset.id}" já existe.`);
  }

  // Valida unicidade de semanticKey
  if (wbV2.datasets.some((d) => d.semanticKey === dataset.semanticKey)) {
    throw new ProductWorkbookError(
      'DUPLICATE_DATASET_SEMANTIC_KEY',
      `Dataset com semanticKey "${dataset.semanticKey}" já existe.`
    );
  }

  // Valida existência do módulo (EMENDA 5)
  if (!wbV2.modules.some((m) => m.id === dataset.moduleId)) {
    throw new ProductWorkbookError(
      'MODULE_NOT_FOUND',
      `Módulo com ID "${dataset.moduleId}" referenciado pelo dataset não existe.`
    );
  }

  // Valida sintaxe da semanticKey
  if (!isValidSemanticKey(dataset.semanticKey)) {
    throw new ProductWorkbookError(
      'INVALID_SEMANTIC_KEY',
      `semanticKey do dataset "${dataset.semanticKey}" é inválida.`
    );
  }

  const sanitizedDataset: TechnicalDataset = {
    ...dataset,
    columns: dataset.columns ?? [],
    rows: dataset.rows ?? [],
    cells: dataset.cells ?? {}
  };

  return {
    ...wbV2,
    datasets: [...wbV2.datasets, sanitizedDataset]
  };
}

/**
 * Atualiza propriedades estruturais de um TechnicalDataset existente.
 */
export function updateDataset(
  workbook: ProductWorkbook,
  datasetId: string,
  updates: Partial<Omit<TechnicalDataset, 'id'>>
): ProductWorkbookV2 {
  const wbV2 = ensureWorkbookV2(workbook);
  const idx = wbV2.datasets.findIndex((d) => d.id === datasetId);
  if (idx === -1) {
    throw new ProductWorkbookError('DATASET_NOT_FOUND', `Dataset com ID "${datasetId}" não encontrado.`);
  }

  if (updates.semanticKey && updates.semanticKey !== wbV2.datasets[idx].semanticKey) {
    if (!isValidSemanticKey(updates.semanticKey)) {
      throw new ProductWorkbookError(
        'INVALID_SEMANTIC_KEY',
        `semanticKey do dataset "${updates.semanticKey}" é inválida.`
      );
    }
    if (wbV2.datasets.some((d) => d.id !== datasetId && d.semanticKey === updates.semanticKey)) {
      throw new ProductWorkbookError(
        'DUPLICATE_DATASET_SEMANTIC_KEY',
        `Dataset com semanticKey "${updates.semanticKey}" já existe.`
      );
    }
  }

  if (updates.moduleId && !wbV2.modules.some((m) => m.id === updates.moduleId)) {
    throw new ProductWorkbookError(
      'MODULE_NOT_FOUND',
      `Módulo com ID "${updates.moduleId}" referenciado pelo dataset não existe.`
    );
  }

  const updatedDatasets = [...wbV2.datasets];
  updatedDatasets[idx] = {
    ...updatedDatasets[idx],
    ...updates,
    id: datasetId // Imutável
  };

  return {
    ...wbV2,
    datasets: updatedDatasets
  };
}

/**
 * Remove um TechnicalDataset do workbook.
 */
export function deleteDataset(
  workbook: ProductWorkbook,
  datasetId: string
): ProductWorkbookV2 {
  const wbV2 = ensureWorkbookV2(workbook);
  const filtered = wbV2.datasets.filter((d) => d.id !== datasetId);
  if (filtered.length === wbV2.datasets.length) {
    throw new ProductWorkbookError('DATASET_NOT_FOUND', `Dataset com ID "${datasetId}" não encontrado.`);
  }

  return {
    ...wbV2,
    datasets: filtered
  };
}

/**
 * Adiciona uma coluna a um TechnicalDataset.
 */
export function addDatasetColumn(
  workbook: ProductWorkbook,
  datasetId: string,
  column: DatasetColumn
): ProductWorkbookV2 {
  const wbV2 = ensureWorkbookV2(workbook);
  const dsIndex = wbV2.datasets.findIndex((d) => d.id === datasetId);
  if (dsIndex === -1) {
    throw new ProductWorkbookError('DATASET_NOT_FOUND', `Dataset com ID "${datasetId}" não encontrado.`);
  }

  const dataset = wbV2.datasets[dsIndex];
  if (dataset.columns.some((c) => c.id === column.id)) {
    throw new ProductWorkbookError('DUPLICATE_COLUMN_ID', `Coluna com ID "${column.id}" já existe no dataset.`);
  }
  if (dataset.columns.some((c) => c.semanticKey === column.semanticKey)) {
    throw new ProductWorkbookError('DUPLICATE_COLUMN_SEMANTIC_KEY', `Coluna com semanticKey "${column.semanticKey}" já existe no dataset.`);
  }
  if (!isValidSemanticKey(column.semanticKey)) {
    throw new ProductWorkbookError('INVALID_SEMANTIC_KEY', `semanticKey de coluna "${column.semanticKey}" é inválida.`);
  }

  const updatedDatasets = [...wbV2.datasets];
  updatedDatasets[dsIndex] = {
    ...dataset,
    columns: [...dataset.columns, column]
  };

  return {
    ...wbV2,
    datasets: updatedDatasets
  };
}

/**
 * Remove uma coluna de um TechnicalDataset e limpa suas células correspondentes.
 */
export function deleteDatasetColumn(
  workbook: ProductWorkbook,
  datasetId: string,
  columnId: string
): ProductWorkbookV2 {
  const wbV2 = ensureWorkbookV2(workbook);
  const dsIndex = wbV2.datasets.findIndex((d) => d.id === datasetId);
  if (dsIndex === -1) {
    throw new ProductWorkbookError('DATASET_NOT_FOUND', `Dataset com ID "${datasetId}" não encontrado.`);
  }

  const dataset = wbV2.datasets[dsIndex];
  const filteredColumns = dataset.columns.filter((c) => c.id !== columnId);
  if (filteredColumns.length === dataset.columns.length) {
    throw new ProductWorkbookError('COLUMN_NOT_FOUND', `Coluna com ID "${columnId}" não encontrada no dataset.`);
  }

  // Remove células pertencentes a esta coluna
  const updatedCells: Record<string, DatasetCell> = {};
  for (const [key, cell] of Object.entries(dataset.cells)) {
    if (cell.columnId !== columnId) {
      updatedCells[key] = cell;
    }
  }

  const updatedDatasets = [...wbV2.datasets];
  updatedDatasets[dsIndex] = {
    ...dataset,
    columns: filteredColumns,
    cells: updatedCells
  };

  return {
    ...wbV2,
    datasets: updatedDatasets
  };
}

/**
 * Adiciona uma linha a um TechnicalDataset.
 */
export function addDatasetRow(
  workbook: ProductWorkbook,
  datasetId: string,
  row: DatasetRow
): ProductWorkbookV2 {
  const wbV2 = ensureWorkbookV2(workbook);
  const dsIndex = wbV2.datasets.findIndex((d) => d.id === datasetId);
  if (dsIndex === -1) {
    throw new ProductWorkbookError('DATASET_NOT_FOUND', `Dataset com ID "${datasetId}" não encontrado.`);
  }

  const dataset = wbV2.datasets[dsIndex];
  if (dataset.rows.some((r) => r.id === row.id)) {
    throw new ProductWorkbookError('DUPLICATE_ROW_ID', `Linha com ID "${row.id}" já existe no dataset.`);
  }
  if (row.semanticKey && !isValidSemanticKey(row.semanticKey)) {
    throw new ProductWorkbookError('INVALID_SEMANTIC_KEY', `semanticKey de linha "${row.semanticKey}" é inválida.`);
  }

  const updatedDatasets = [...wbV2.datasets];
  updatedDatasets[dsIndex] = {
    ...dataset,
    rows: [...dataset.rows, row]
  };

  return {
    ...wbV2,
    datasets: updatedDatasets
  };
}

/**
 * Remove uma linha de um TechnicalDataset e limpa suas células correspondentes.
 */
export function deleteDatasetRow(
  workbook: ProductWorkbook,
  datasetId: string,
  rowId: string
): ProductWorkbookV2 {
  const wbV2 = ensureWorkbookV2(workbook);
  const dsIndex = wbV2.datasets.findIndex((d) => d.id === datasetId);
  if (dsIndex === -1) {
    throw new ProductWorkbookError('DATASET_NOT_FOUND', `Dataset com ID "${datasetId}" não encontrado.`);
  }

  const dataset = wbV2.datasets[dsIndex];
  const filteredRows = dataset.rows.filter((r) => r.id !== rowId);
  if (filteredRows.length === dataset.rows.length) {
    throw new ProductWorkbookError('ROW_NOT_FOUND', `Linha com ID "${rowId}" não encontrada no dataset.`);
  }

  // Remove células pertencentes a esta linha
  const updatedCells: Record<string, DatasetCell> = {};
  for (const [key, cell] of Object.entries(dataset.cells)) {
    if (cell.rowId !== rowId) {
      updatedCells[key] = cell;
    }
  }

  const updatedDatasets = [...wbV2.datasets];
  updatedDatasets[dsIndex] = {
    ...dataset,
    rows: filteredRows,
    cells: updatedCells
  };

  return {
    ...wbV2,
    datasets: updatedDatasets
  };
}

/**
 * Reordena as colunas de um TechnicalDataset.
 */
export function reorderDatasetColumns(
  workbook: ProductWorkbook,
  datasetId: string,
  columnIds: readonly string[]
): ProductWorkbookV2 {
  const wbV2 = ensureWorkbookV2(workbook);
  const dsIndex = wbV2.datasets.findIndex((d) => d.id === datasetId);
  if (dsIndex === -1) {
    throw new ProductWorkbookError('DATASET_NOT_FOUND', `Dataset com ID "${datasetId}" não encontrado.`);
  }

  const dataset = wbV2.datasets[dsIndex];
  const colMap = new Map(dataset.columns.map((c) => [c.id, c]));
  const reordered: DatasetColumn[] = [];

  columnIds.forEach((id, idx) => {
    const col = colMap.get(id);
    if (col) {
      reordered.push({ ...col, order: idx });
      colMap.delete(id);
    }
  });

  for (const remaining of colMap.values()) {
    reordered.push({ ...remaining, order: reordered.length });
  }

  const updatedDatasets = [...wbV2.datasets];
  updatedDatasets[dsIndex] = { ...dataset, columns: reordered };
  return { ...wbV2, datasets: updatedDatasets };
}

/**
 * Reordena as linhas de um TechnicalDataset.
 */
export function reorderDatasetRows(
  workbook: ProductWorkbook,
  datasetId: string,
  rowIds: readonly string[]
): ProductWorkbookV2 {
  const wbV2 = ensureWorkbookV2(workbook);
  const dsIndex = wbV2.datasets.findIndex((d) => d.id === datasetId);
  if (dsIndex === -1) {
    throw new ProductWorkbookError('DATASET_NOT_FOUND', `Dataset com ID "${datasetId}" não encontrado.`);
  }

  const dataset = wbV2.datasets[dsIndex];
  const rowMap = new Map(dataset.rows.map((r) => [r.id, r]));
  const reordered: DatasetRow[] = [];

  rowIds.forEach((id, idx) => {
    const row = rowMap.get(id);
    if (row) {
      reordered.push({ ...row, order: idx });
      rowMap.delete(id);
    }
  });

  for (const remaining of rowMap.values()) {
    reordered.push({ ...remaining, order: reordered.length });
  }

  const updatedDatasets = [...wbV2.datasets];
  updatedDatasets[dsIndex] = { ...dataset, rows: reordered };
  return { ...wbV2, datasets: updatedDatasets };
}

/**
 * Define/atualiza uma célula em um TechnicalDataset.
 * Invariante (EMENDA 2): cell.datumId deve existir em workbook.data.
 * Invariante (EMENDA 3): Chave armazenada é determinística e collision-safe via getDatasetCellKey.
 */
export function setDatasetCell(
  workbook: ProductWorkbook,
  datasetId: string,
  cell: DatasetCell
): ProductWorkbookV2 {
  const wbV2 = ensureWorkbookV2(workbook);
  const dsIndex = wbV2.datasets.findIndex((d) => d.id === datasetId);
  if (dsIndex === -1) {
    throw new ProductWorkbookError('DATASET_NOT_FOUND', `Dataset com ID "${datasetId}" não encontrado.`);
  }

  const dataset = wbV2.datasets[dsIndex];

  // Valida que rowId e columnId existem no dataset
  const col = dataset.columns.find((c) => c.id === cell.columnId);
  if (!col) {
    throw new ProductWorkbookError(
      'DATASET_COLUMN_NOT_FOUND',
      `Coluna com ID "${cell.columnId}" não existe no dataset "${dataset.label}".`
    );
  }

  const row = dataset.rows.find((r) => r.id === cell.rowId);
  if (!row) {
    throw new ProductWorkbookError(
      'DATASET_ROW_NOT_FOUND',
      `Linha com ID "${cell.rowId}" não existe no dataset "${dataset.label}".`
    );
  }

  // Valida existência do datum em workbook.data (EMENDA 2)
  const datum = wbV2.data[cell.datumId];
  if (!datum) {
    throw new ProductWorkbookError(
      'DATUM_NOT_FOUND',
      `Dado com ID "${cell.datumId}" referenciado pela célula não existe em workbook.data.`
    );
  }

  // Valida compatibilidade de tipo (EMENDA 4)
  if (datum.value.type !== col.valueType) {
    throw new ProductWorkbookError(
      'TYPE_MISMATCH',
      `Tipo do valor do dado "${datum.value.type}" incompatível com o tipo da coluna "${col.valueType}".`
    );
  }

  // Valida compatibilidade de unidade (EMENDA 4)
  if (col.unit) {
    if (datum.value.type === 'quantity' && datum.value.unit !== col.unit) {
      throw new ProductWorkbookError(
        'UNIT_MISMATCH',
        `Unidade do dado "${datum.value.unit}" incompatível com a unidade da coluna "${col.unit}".`
      );
    }
    if (datum.value.type === 'range' && datum.value.unit !== col.unit) {
      throw new ProductWorkbookError(
        'UNIT_MISMATCH',
        `Unidade da faixa "${datum.value.unit}" incompatível com a unidade da coluna "${col.unit}".`
      );
    }
  }

  const cellKey = getDatasetCellKey(cell.rowId, cell.columnId);
  const updatedCells = {
    ...dataset.cells,
    [cellKey]: cell
  };

  const updatedDatasets = [...wbV2.datasets];
  updatedDatasets[dsIndex] = {
    ...dataset,
    cells: updatedCells
  };

  return {
    ...wbV2,
    datasets: updatedDatasets
  };
}

/**
 * Remove uma célula de um TechnicalDataset (torna a coordenada vazia).
 */
export function clearDatasetCell(
  workbook: ProductWorkbook,
  datasetId: string,
  rowId: string,
  columnId: string
): ProductWorkbookV2 {
  const wbV2 = ensureWorkbookV2(workbook);
  const dsIndex = wbV2.datasets.findIndex((d) => d.id === datasetId);
  if (dsIndex === -1) {
    throw new ProductWorkbookError('DATASET_NOT_FOUND', `Dataset com ID "${datasetId}" não encontrado.`);
  }

  const dataset = wbV2.datasets[dsIndex];
  const cellKey = getDatasetCellKey(rowId, columnId);
  if (!dataset.cells[cellKey]) {
    return wbV2;
  }

  const updatedCells = { ...dataset.cells };
  delete updatedCells[cellKey];

  const updatedDatasets = [...wbV2.datasets];
  updatedDatasets[dsIndex] = {
    ...dataset,
    cells: updatedCells
  };

  return {
    ...wbV2,
    datasets: updatedDatasets
  };
}

/**
 * Remove com segurança um dado técnico do workbook, desvinculando-o do módulo e das tabelas.
 */
export function deleteDatum(
  workbook: ProductWorkbook,
  datumId: string
): ProductWorkbook {
  const existingDatum = workbook.data[datumId];
  if (!existingDatum) {
    return workbook;
  }

  const updatedData = { ...workbook.data };
  delete updatedData[datumId];

  const updatedModules = workbook.modules.map((mod) => ({
    ...mod,
    datumIds: mod.datumIds.filter((id) => id !== datumId)
  }));

  // Se houver datasets, desvincula células que apontavam para este datum
  const wbV2 = workbook as ProductWorkbookV2;
  let updatedDatasets = wbV2.datasets;
  if (updatedDatasets) {
    updatedDatasets = updatedDatasets.map((ds) => {
      let cellsChanged = false;
      const filteredCells: Record<string, DatasetCell> = {};
      for (const [key, cell] of Object.entries(ds.cells)) {
        if (cell.datumId === datumId) {
          cellsChanged = true;
        } else {
          filteredCells[key] = cell;
        }
      }
      return cellsChanged ? { ...ds, cells: filteredCells } : ds;
    });
  }

  return {
    ...workbook,
    revision: workbook.revision,
    modules: updatedModules,
    data: updatedData,
    ...(updatedDatasets ? { datasets: updatedDatasets } : {})
  };
}
