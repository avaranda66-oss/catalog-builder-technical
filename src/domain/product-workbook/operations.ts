// src/domain/product-workbook/operations.ts
// Pure immutable domain operations for Technical Knowledge Workbooks (PIM.W1).
// Enforces fail-closed invariants: no duplicate keys, strict foreign key existence,
// and safe state transitions.
// Zero explicit any.

import {
  ProductWorkbook,
  WorkbookOwner,
  TechnicalModule,
  TechnicalDatum,
  TechnicalValue,
  Evidence,
  CanonicalDecision,
  InheritedDatumOverride,
  ProductDataView
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
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
    revision: workbook.revision + 1,
    savedViews: filtered
  };
}
