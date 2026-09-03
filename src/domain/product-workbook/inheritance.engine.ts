// src/domain/product-workbook/inheritance.engine.ts
// Pure domain inheritance resolver for Family -> Product Technical Knowledge (PIM.W1).
// Resolves inheritance, overrides, and suppressions without copying family data physically.
// Zero dependencies on React, databases, or UI.
// Zero explicit any.

import {
  ProductWorkbook,
  TechnicalModule,
  TechnicalDatum,
  EffectiveDatum,
  EffectiveDataset,
  ResolvedProductKnowledge,
  ResolutionPolicy
} from './types';
import { deriveDatumStatus } from './provenance.engine';

/**
 * Resolves effective technical knowledge for a product by combining family knowledge base
 * with product overrides and product-local data.
 *
 * Invariants strictly guaranteed:
 * 1. ZERO physical cloning: Family data remains in its own workbook and is referenced via metadata.
 * 2. Suppression: Suppressed inherited data does not appear in effective product facts.
 * 3. Publication/AI truth safety: Draft product overrides cannot silently overwrite approved family facts.
 */
export function resolveEffectiveProductKnowledge(params: {
  familyWorkbook?: ProductWorkbook;
  productWorkbook: ProductWorkbook;
  policy?: ResolutionPolicy;
}): ResolvedProductKnowledge {
  const { familyWorkbook, productWorkbook } = params;
  const policy: ResolutionPolicy = params.policy ?? 'effective_for_editing';

  if (productWorkbook.owner.kind !== 'product') {
    throw new Error('resolveEffectiveProductKnowledge exige que o workbook principal pertença a um produto.');
  }

  const productId = productWorkbook.owner.id;
  const familyId = familyWorkbook?.owner.id;

  const effectiveData = new Map<string, EffectiveDatum>();
  const suppressedKeys: string[] = [];
  let conflictsCount = 0;

  // 1. Processar dados herdados da Família
  if (familyWorkbook) {
    for (const familyDatum of Object.values(familyWorkbook.data)) {
      const semKey = familyDatum.semanticKey;
      const override = productWorkbook.overrides?.[semKey];

      if (override) {
        if (override.mode === 'suppress') {
          suppressedKeys.push(semKey);
          continue;
        }

        if (override.mode === 'override') {
          const overrideStatus = override.overriddenStatus ?? 'draft';

          // POLÍTICA DE RESOLUÇÃO: Proteção da verdade para publicação e IA
          if (
            (policy === 'effective_for_publishing' || policy === 'effective_for_ai') &&
            overrideStatus === 'draft' &&
            (familyDatum.status === 'approved' || familyDatum.status === 'verified')
          ) {
            // Mantém a verdade aprovada da família e sinaliza override pendente em rascunho
            const derivedFamilyStatus = deriveDatumStatus(familyDatum);
            if (derivedFamilyStatus === 'conflicting') conflictsCount++;

            effectiveData.set(semKey, {
              datum: familyDatum,
              origin: 'family',
              effectiveStatus: derivedFamilyStatus,
              familyDatumId: familyDatum.id,
              overrideMode: 'inherit',
              isPendingOverride: true
            });
            continue;
          }

          // Monta datum sintetizado de override
          const overrideDatum: TechnicalDatum = {
            id: `ovr_${productWorkbook.id}_${familyDatum.id}`,
            semanticKey: semKey,
            moduleId: familyDatum.moduleId,
            label: familyDatum.label,
            description: familyDatum.description,
            localizedLabels: familyDatum.localizedLabels,
            value: override.overriddenValue!,
            evidence: override.evidence ?? [],
            canonicalDecision: override.canonicalDecision,
            status: overrideStatus,
            audit: {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          };

          const derivedStatus = deriveDatumStatus(overrideDatum);
          if (derivedStatus === 'conflicting') conflictsCount++;

          effectiveData.set(semKey, {
            datum: overrideDatum,
            origin: 'product_override',
            effectiveStatus: derivedStatus,
            familyDatumId: familyDatum.id,
            overrideMode: 'override',
            isPendingOverride: false
          });
          continue;
        }
      }

      // Herança pura direta da Família
      const derivedStatus = deriveDatumStatus(familyDatum);
      if (derivedStatus === 'conflicting') conflictsCount++;

      effectiveData.set(semKey, {
        datum: familyDatum,
        origin: 'family',
        effectiveStatus: derivedStatus,
        familyDatumId: familyDatum.id,
        overrideMode: 'inherit',
        isPendingOverride: false
      });
    }
  }

  // 2. Processar dados locais do Produto (product_local)
  for (const productDatum of Object.values(productWorkbook.data)) {
    const semKey = productDatum.semanticKey;

    // Se já foi registrado pela família, os dados do produto local não colidem
    // (a substituição de dados da família deve ser feita via overrides explícitos)
    if (effectiveData.has(semKey)) {
      continue;
    }

    const derivedStatus = deriveDatumStatus(productDatum);
    if (derivedStatus === 'conflicting') conflictsCount++;

    effectiveData.set(semKey, {
      datum: productDatum,
      origin: 'product_local',
      effectiveStatus: derivedStatus,
      productDatumId: productDatum.id,
      overrideMode: undefined,
      isPendingOverride: false
    });
  }

  // 3. Mesclar e reconstruir módulos técnicos efetivos
  const moduleMap = new Map<string, TechnicalModule>();

  // Adiciona módulos da família
  if (familyWorkbook) {
    for (const mod of familyWorkbook.modules) {
      moduleMap.set(mod.id, {
        ...mod,
        datumIds: [] // recalculado abaixo com base nos dados efetivos
      });
    }
  }

  // Adiciona módulos locais do produto
  for (const mod of productWorkbook.modules) {
    if (!moduleMap.has(mod.id)) {
      moduleMap.set(mod.id, {
        ...mod,
        datumIds: []
      });
    }
  }

  // Indexar datumIds nos módulos correspondentes
  for (const effective of effectiveData.values()) {
    const targetModule = moduleMap.get(effective.datum.moduleId);
    if (targetModule) {
      moduleMap.set(targetModule.id, {
        ...targetModule,
        datumIds: [...targetModule.datumIds, effective.datum.id]
      });
    }
  }

  const sortedModules = Array.from(moduleMap.values()).sort((a, b) => a.order - b.order);

  // 4. Resolver TechnicalDatasets efetivos com herança da Família (PIM.REUSE1.3)
  const effectiveDatasets = new Map<string, EffectiveDataset>();
  const suppressedDatasetKeys: string[] = [];

  const familyDatasets =
    familyWorkbook && 'datasets' in familyWorkbook && Array.isArray(familyWorkbook.datasets)
      ? familyWorkbook.datasets
      : [];
  const productDatasets =
    'datasets' in productWorkbook && Array.isArray(productWorkbook.datasets)
      ? productWorkbook.datasets
      : [];
  const datasetOverrides =
    'datasetOverrides' in productWorkbook && productWorkbook.datasetOverrides
      ? productWorkbook.datasetOverrides
      : {};

  // Processa datasets da família
  for (const familyDs of familyDatasets) {
    const semKey = familyDs.semanticKey;
    const override = datasetOverrides[semKey];

    if (override) {
      if (override.mode === 'suppress') {
        suppressedDatasetKeys.push(semKey);
        continue;
      }
      if (override.mode === 'override') {
        effectiveDatasets.set(semKey, {
          dataset: {
            ...familyDs,
            label: override.overriddenLabel ?? familyDs.label,
            description: override.overriddenDescription ?? familyDs.description
          },
          origin: 'product_override',
          familyDatasetId: familyDs.id,
          isSuppressed: false
        });
        continue;
      }
    }

    // Se o produto definir localmente um dataset com a mesma chave semântica, o local assume como override
    const localMatch = productDatasets.find((d) => d.semanticKey === semKey);
    if (localMatch) {
      effectiveDatasets.set(semKey, {
        dataset: localMatch,
        origin: 'product_override',
        familyDatasetId: familyDs.id,
        isSuppressed: false
      });
      continue;
    }

    // Herança direta da família (NENHUMA cópia física; single-source de verdade comum)
    effectiveDatasets.set(semKey, {
      dataset: familyDs,
      origin: 'family',
      familyDatasetId: familyDs.id,
      isSuppressed: false
    });
  }

  // Processa datasets locais do produto
  for (const productDs of productDatasets) {
    if (!effectiveDatasets.has(productDs.semanticKey)) {
      effectiveDatasets.set(productDs.semanticKey, {
        dataset: productDs,
        origin: 'product_local',
        isSuppressed: false
      });
    }
  }

  return {
    productId,
    productRevision: productWorkbook.revision,
    familyId,
    familyRevision: familyWorkbook?.revision,
    modules: sortedModules,
    effectiveData,
    effectiveDatasets,
    suppressedKeys,
    suppressedDatasetKeys,
    conflictsCount
  };
}
