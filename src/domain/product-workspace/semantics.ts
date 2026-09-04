// src/domain/product-workspace/semantics.ts
// Pure domain engine for Semantic Identity vs Human Presentation vs AI Aliases.
// Guarantees:
// 1. Canonical key stability for integrations & AI.
// 2. Unrestricted human editing of display labels and aliases.
// 3. Complete SemanticReferenceGraph mapping internal and external reference blast radius.
// 4. Safe canonical rename planner (Plan Only, zero live execution without total proof).
// Zero explicit any.

import { isValidSemanticKey } from '../product-workbook/schema';
import { ProductWorkbookV2, ResolvedProductKnowledge, WorkbookOwner } from '../product-workbook/types';
import {
  SemanticDescriptor,
  CanonicalRenamePlan,
  RenameStepAudit,
  SemanticReferenceGraph,
  SemanticReferenceNode,
  SemanticRegistryV1,
  ProductSemanticRegistry,
  EffectiveSemanticDescriptor,
  EffectiveSemanticRegistry,
  ExternalCatalogBindingReference,
  SemanticRegistryValidationError,
  SemanticRegistryValidationReport,
  SemanticRegistryValidationException
} from './types';
import { CatalogCellBinding } from '../catalog.schema';

/**
 * Cria um SemanticDescriptor padrão a partir de chave canônica e label inicial.
 */
export function createSemanticDescriptor(params: {
  canonicalKey: string;
  displayLabel: string;
  aliases?: readonly string[];
  description?: string;
  localeLabels?: Readonly<Record<string, string>>;
}): SemanticDescriptor {
  const { canonicalKey, displayLabel, aliases = [], description, localeLabels } = params;

  if (!isValidSemanticKey(canonicalKey)) {
    throw new Error(
      `Chave canônica inválida: "${canonicalKey}". Deve seguir o formato segmentado minúsculo (ex: metrology.temperature.range)`
    );
  }

  const trimmedLabel = displayLabel.trim();
  if (!trimmedLabel) {
    throw new Error('displayLabel não pode ser vazio');
  }

  // Validação de colisão semântica: alias não pode colidir com a chave canônica
  for (const alias of aliases) {
    if (alias.trim().toLowerCase() === canonicalKey.toLowerCase()) {
      throw new Error(`Colisão de alias detectada: alias não pode ser idêntico à canonicalKey "${canonicalKey}"`);
    }
  }

  const normalizedAliases = Array.from(
    new Set(
      aliases
        .map((a) => a.trim())
        .filter((a) => a.length > 0 && a.toLowerCase() !== trimmedLabel.toLowerCase())
    )
  );

  return {
    canonicalKey,
    displayLabel: trimmedLabel,
    aliases: normalizedAliases,
    description: description?.trim() || undefined,
    localeLabels
  };
}

/**
 * Atualiza o label de exibição humano SEM alterar a chave canônica da máquina.
 */
export function updateDisplayLabel(
  descriptor: SemanticDescriptor,
  newDisplayLabel: string
): SemanticDescriptor {
  const trimmed = newDisplayLabel.trim();
  if (!trimmed) {
    throw new Error('displayLabel não pode ser vazio');
  }

  // Se o displayLabel antigo for relevante, adiciona aos aliases para não perder busca
  const oldLabel = descriptor.displayLabel.trim();
  const updatedAliases = new Set(descriptor.aliases);
  if (oldLabel.toLowerCase() !== trimmed.toLowerCase() && oldLabel.toLowerCase() !== descriptor.canonicalKey.toLowerCase()) {
    updatedAliases.add(oldLabel);
  }

  return {
    ...descriptor,
    displayLabel: trimmed,
    aliases: Array.from(updatedAliases).filter((a) => a.toLowerCase() !== trimmed.toLowerCase())
  };
}

/**
 * Adiciona um novo alias/sinônimo para busca e compreensão por IA.
 * Rejeita colisões com a chave canônica.
 */
export function addAlias(
  descriptor: SemanticDescriptor,
  newAlias: string,
  existingCanonicalKeys?: readonly string[]
): SemanticDescriptor {
  const trimmed = newAlias.trim();
  if (!trimmed) return descriptor;

  // Rejeita colisão com a própria chave canônica
  if (trimmed.toLowerCase() === descriptor.canonicalKey.toLowerCase()) {
    throw new Error(`Colisão semântica: alias "${trimmed}" não pode ser idêntico à canonicalKey.`);
  }

  // Rejeita colisão com outras chaves canônicas conhecidas
  if (existingCanonicalKeys && existingCanonicalKeys.includes(trimmed.toLowerCase())) {
    throw new Error(`Colisão semântica: alias "${trimmed}" colide com chave canônica de produto existente.`);
  }

  if (trimmed.toLowerCase() === descriptor.displayLabel.toLowerCase()) {
    return descriptor;
  }

  const exists = descriptor.aliases.some((a) => a.toLowerCase() === trimmed.toLowerCase());
  if (exists) return descriptor;

  return {
    ...descriptor,
    aliases: [...descriptor.aliases, trimmed]
  };
}

/**
 * Remove um alias existente.
 */
export function removeAlias(descriptor: SemanticDescriptor, aliasToRemove: string): SemanticDescriptor {
  const target = aliasToRemove.trim().toLowerCase();
  return {
    ...descriptor,
    aliases: descriptor.aliases.filter((a) => a.toLowerCase() !== target)
  };
}

/**
 * Avalia se um termo de busca bate com o descritor (display label, canonicalKey ou aliases).
 */
export function matchesSemanticQuery(descriptor: SemanticDescriptor, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;

  if (descriptor.displayLabel.toLowerCase().includes(q)) return true;
  if (descriptor.canonicalKey.toLowerCase().includes(q)) return true;
  if (descriptor.description && descriptor.description.toLowerCase().includes(q)) return true;

  for (const alias of descriptor.aliases) {
    if (alias.toLowerCase().includes(q)) return true;
  }

  if (descriptor.deprecatedAliases) {
    for (const dep of descriptor.deprecatedAliases) {
      if (dep.toLowerCase().includes(q)) return true;
    }
  }

  return false;
}

// ============================================================================
// CANONICAL SEMANTIC REGISTRY OPERATIONS (BLOCKER 13 & 5)
// ============================================================================

export function createSemanticRegistry(params: {
  owner: WorkbookOwner;
  revision?: number;
  descriptors?: Record<string, SemanticDescriptor>;
}): SemanticRegistryV1 {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    owner: params.owner,
    revision: params.revision ?? 1,
    descriptors: params.descriptors || {},
    createdAt: now,
    updatedAt: now
  };
}

export function createProductSemanticRegistry(params: {
  productId?: string;
  owner?: WorkbookOwner;
  revision?: number;
  descriptors?: Record<string, SemanticDescriptor>;
}): SemanticRegistryV1 {
  const owner: WorkbookOwner = params.owner || {
    kind: 'product',
    id: params.productId || 'unknown'
  };
  return createSemanticRegistry({
    owner,
    revision: params.revision,
    descriptors: params.descriptors
  });
}

function areDescriptorsEqual(a: SemanticDescriptor, b: SemanticDescriptor): boolean {
  if (a.canonicalKey !== b.canonicalKey) return false;
  if (a.displayLabel !== b.displayLabel) return false;
  if ((a.description || undefined) !== (b.description || undefined)) return false;

  const aAliases = [...a.aliases].map((x) => x.toLowerCase()).sort();
  const bAliases = [...b.aliases].map((x) => x.toLowerCase()).sort();
  if (aAliases.length !== bAliases.length) return false;
  for (let i = 0; i < aAliases.length; i++) {
    if (aAliases[i] !== bAliases[i]) return false;
  }

  const aDep = [...(a.deprecatedAliases || [])].map((x) => x.toLowerCase()).sort();
  const bDep = [...(b.deprecatedAliases || [])].map((x) => x.toLowerCase()).sort();
  if (aDep.length !== bDep.length) return false;
  for (let i = 0; i < aDep.length; i++) {
    if (aDep[i] !== bDep[i]) return false;
  }

  const aLoc = a.localeLabels || {};
  const bLoc = b.localeLabels || {};
  const aLocKeys = Object.keys(aLoc).sort();
  const bLocKeys = Object.keys(bLoc).sort();
  if (aLocKeys.length !== bLocKeys.length) return false;
  for (let i = 0; i < aLocKeys.length; i++) {
    const k = aLocKeys[i];
    if (k !== bLocKeys[i] || aLoc[k] !== bLoc[k]) return false;
  }

  return true;
}

/**
 * Validação semântica pura com domínio de erro próprio (Emenda A).
 * Verifica integridade canônica, descompassos de chave e colisões de aliases.
 */
export function validateSemanticRegistry(registry: SemanticRegistryV1): SemanticRegistryValidationReport {
  const errors: SemanticRegistryValidationError[] = [];
  const canonicalKeysLower = new Set<string>();
  const aliasToKeyMap = new Map<string, string>(); // aliasLower -> canonicalKey

  // Primeira passagem: validação estrutural de chaves e labels
  for (const [key, desc] of Object.entries(registry.descriptors)) {
    if (desc.canonicalKey !== key) {
      errors.push({
        code: 'DESCRIPTOR_KEY_MISMATCH',
        message: `Chave do mapa "${key}" não coincide com descritor.canonicalKey "${desc.canonicalKey}".`,
        canonicalKey: desc.canonicalKey
      });
    }

    if (!isValidSemanticKey(desc.canonicalKey)) {
      errors.push({
        code: 'INVALID_CANONICAL_KEY',
        message: `Chave canônica "${desc.canonicalKey}" possui formato inválido. Deve ser segmentada minúscula (ex: grupo.subgrupo.item).`,
        canonicalKey: desc.canonicalKey
      });
    }

    if (!desc.displayLabel || !desc.displayLabel.trim()) {
      errors.push({
        code: 'EMPTY_DISPLAY_LABEL',
        message: `displayLabel para "${desc.canonicalKey}" não pode ser vazio.`,
        canonicalKey: desc.canonicalKey
      });
    }

    canonicalKeysLower.add(desc.canonicalKey.toLowerCase());
  }

  // Segunda passagem: checagem de colisões (alias vs canonical, alias vs alias, deprecated vs canonical)
  for (const desc of Object.values(registry.descriptors)) {
    const selfCanonicalLower = desc.canonicalKey.toLowerCase();

    for (const alias of desc.aliases) {
      const aliasLower = alias.trim().toLowerCase();
      if (!aliasLower) continue;

      if (aliasLower === selfCanonicalLower) {
        errors.push({
          code: 'ALIAS_CANONICAL_COLLISION',
          message: `Alias "${alias}" colide com a própria canonicalKey "${desc.canonicalKey}".`,
          canonicalKey: desc.canonicalKey,
          alias
        });
      } else if (canonicalKeysLower.has(aliasLower)) {
        errors.push({
          code: 'ALIAS_CANONICAL_COLLISION',
          message: `Alias "${alias}" de "${desc.canonicalKey}" colide com canonicalKey ativa existente no registro.`,
          canonicalKey: desc.canonicalKey,
          alias
        });
      }

      const existingOwnerKey = aliasToKeyMap.get(aliasLower);
      if (existingOwnerKey && existingOwnerKey !== desc.canonicalKey) {
        errors.push({
          code: 'ALIAS_ALIAS_COLLISION',
          message: `Alias "${alias}" de "${desc.canonicalKey}" colide com alias já registrado em "${existingOwnerKey}".`,
          canonicalKey: desc.canonicalKey,
          alias
        });
      } else {
        aliasToKeyMap.set(aliasLower, desc.canonicalKey);
      }
    }

    if (desc.deprecatedAliases) {
      for (const dep of desc.deprecatedAliases) {
        const depLower = dep.trim().toLowerCase();
        if (canonicalKeysLower.has(depLower)) {
          errors.push({
            code: 'DEPRECATED_ALIAS_CANONICAL_COLLISION',
            message: `Alias depreciado "${dep}" colide com canonicalKey ativa "${depLower}".`,
            canonicalKey: desc.canonicalKey,
            alias: dep
          });
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function registerSemanticDescriptor(
  registry: SemanticRegistryV1,
  descriptor: SemanticDescriptor
): SemanticRegistryV1 {
  const existing = registry.descriptors[descriptor.canonicalKey];
  if (existing && areDescriptorsEqual(existing, descriptor)) {
    return registry; // NO-OP: descritor idêntico não sobe revisão (Emenda K)
  }

  const candidate: SemanticRegistryV1 = {
    ...registry,
    revision: registry.revision + 1,
    descriptors: {
      ...registry.descriptors,
      [descriptor.canonicalKey]: descriptor
    },
    updatedAt: new Date().toISOString()
  };

  const validation = validateSemanticRegistry(candidate);
  if (!validation.isValid) {
    throw new SemanticRegistryValidationException(validation);
  }

  return candidate;
}

export function updateCanonicalDisplayLabel(
  registry: SemanticRegistryV1,
  canonicalKey: string,
  newDisplayLabel: string
): SemanticRegistryV1 {
  const trimmed = newDisplayLabel.trim();
  const existing = registry.descriptors[canonicalKey];
  if (existing && existing.displayLabel.trim() === trimmed) {
    return registry; // NO-OP: label idêntico não sobe revisão (Emenda K)
  }

  const baseDescriptor =
    existing ||
    createSemanticDescriptor({
      canonicalKey,
      displayLabel: trimmed
    });

  const updated = updateDisplayLabel(baseDescriptor, trimmed);

  const candidate: SemanticRegistryV1 = {
    ...registry,
    revision: registry.revision + 1,
    descriptors: {
      ...registry.descriptors,
      [canonicalKey]: updated
    },
    updatedAt: new Date().toISOString()
  };

  const validation = validateSemanticRegistry(candidate);
  if (!validation.isValid) {
    throw new SemanticRegistryValidationException(validation);
  }

  return candidate;
}

export function addCanonicalAlias(
  registry: SemanticRegistryV1,
  canonicalKey: string,
  alias: string
): SemanticRegistryV1 {
  const trimmed = alias.trim();
  if (!trimmed) return registry;

  const existing = registry.descriptors[canonicalKey];
  if (existing) {
    const hasAlias = existing.aliases.some((a) => a.toLowerCase() === trimmed.toLowerCase());
    if (hasAlias || trimmed.toLowerCase() === existing.displayLabel.toLowerCase()) {
      return registry; // NO-OP: alias existente não sobe revisão (Emenda K)
    }
  }

  const baseDescriptor =
    existing ||
    createSemanticDescriptor({
      canonicalKey,
      displayLabel: canonicalKey
    });

  const updated = addAlias(baseDescriptor, trimmed);
  if (existing && areDescriptorsEqual(existing, updated)) {
    return registry; // NO-OP
  }

  const candidate: SemanticRegistryV1 = {
    ...registry,
    revision: registry.revision + 1,
    descriptors: {
      ...registry.descriptors,
      [canonicalKey]: updated
    },
    updatedAt: new Date().toISOString()
  };

  const validation = validateSemanticRegistry(candidate);
  if (!validation.isValid) {
    throw new SemanticRegistryValidationException(validation);
  }

  return candidate;
}

export function removeCanonicalAlias(
  registry: SemanticRegistryV1,
  canonicalKey: string,
  aliasToRemove: string
): SemanticRegistryV1 {
  const existing = registry.descriptors[canonicalKey];
  if (!existing) return registry; // NO-OP: descritor inexistente

  const target = aliasToRemove.trim().toLowerCase();
  const hasAlias = existing.aliases.some((a) => a.toLowerCase() === target);
  if (!hasAlias) {
    return registry; // NO-OP: remoção de alias inexistente não sobe revisão (Emenda K)
  }

  const updated = removeAlias(existing, aliasToRemove);

  const candidate: SemanticRegistryV1 = {
    ...registry,
    revision: registry.revision + 1,
    descriptors: {
      ...registry.descriptors,
      [canonicalKey]: updated
    },
    updatedAt: new Date().toISOString()
  };

  const validation = validateSemanticRegistry(candidate);
  if (!validation.isValid) {
    throw new SemanticRegistryValidationException(validation);
  }

  return candidate;
}

export interface ResolveSemanticRegistryParams {
  familyRegistry?: SemanticRegistryV1;
  productRegistry?: SemanticRegistryV1;
  productOwner?: WorkbookOwner;
  targetOwner?: WorkbookOwner;
  contextKind?: 'product' | 'family';
}

/**
 * Pure domain resolver de herança semântica entre Família e Produto (BLOCKER 5).
 * - Descriptores da família são herdados com zero cópia física;
 * - Descriptores de produto podem complementar ou sobrepor (product_override);
 * - Aliases são combinados e preservados sem duplicidade.
 * - Effective Owner: Em contexto de produto, o produto alvo é o owner efetivo, nunca o familyRegistry por omissão silenciosa.
 */
export function resolveSemanticRegistry(
  params: ResolveSemanticRegistryParams
): EffectiveSemanticRegistry {
  const { familyRegistry, productRegistry, productOwner, targetOwner, contextKind } = params;
  const explicitTargetOwner = productOwner || targetOwner;

  let owner: WorkbookOwner;
  if (explicitTargetOwner) {
    owner = explicitTargetOwner;
  } else if (productRegistry?.owner) {
    owner = productRegistry.owner;
  } else if (familyRegistry?.owner) {
    if (contextKind === 'product') {
      throw new Error(
        '[resolveSemanticRegistry:PRODUCT_OWNER_REQUIRED] Resolução de registro semântico em contexto de produto requer productOwner ou productRegistry.'
      );
    }
    owner = familyRegistry.owner;
  } else {
    owner = { kind: 'product', id: 'unknown' };
  }

  const effectiveDescriptors = new Map<string, EffectiveSemanticDescriptor>();
  const resolvedDescriptors: Record<string, SemanticDescriptor> = {};

  // 1. Incorpora descritores da família (se houver)
  if (familyRegistry) {
    for (const [key, famDesc] of Object.entries(familyRegistry.descriptors)) {
      effectiveDescriptors.set(key, {
        descriptor: famDesc,
        origin: 'family',
        isInherited: true
      });
      resolvedDescriptors[key] = famDesc;
    }
  }

  // 2. Incorpora / sobrepõe descritores do produto
  if (productRegistry) {
    for (const [key, prodDesc] of Object.entries(productRegistry.descriptors)) {
      const famEntry = effectiveDescriptors.get(key);
      if (famEntry) {
        // Produto complementa / sobrepõe a família (product_override)
        const mergedAliases = Array.from(new Set([...famEntry.descriptor.aliases, ...prodDesc.aliases]));
        const mergedDesc: SemanticDescriptor = {
          ...prodDesc,
          aliases: mergedAliases,
          description: prodDesc.description || famEntry.descriptor.description,
          localeLabels: {
            ...famEntry.descriptor.localeLabels,
            ...prodDesc.localeLabels
          }
        };
        effectiveDescriptors.set(key, {
          descriptor: mergedDesc,
          origin: 'product_override',
          isInherited: false
        });
        resolvedDescriptors[key] = mergedDesc;
      } else {
        // Descritor exclusivo do produto (product_local)
        effectiveDescriptors.set(key, {
          descriptor: prodDesc,
          origin: 'product_local',
          isInherited: false
        });
        resolvedDescriptors[key] = prodDesc;
      }
    }
  }

  return {
    owner,
    familyRevision: familyRegistry?.revision,
    productRevision: productRegistry?.revision,
    descriptors: resolvedDescriptors,
    effectiveDescriptors
  };
}

// ============================================================================
// SEMANTIC REFERENCE GRAPH ENGINE
// ============================================================================

export interface BuildSemanticReferenceGraphParams {
  canonicalKey: string;
  workbook: ProductWorkbookV2;
  resolvedKnowledge?: ResolvedProductKnowledge;
  familyWorkbook?: ProductWorkbookV2;
  semanticRegistry?: ProductSemanticRegistry;
  externalCatalogBindings?: readonly (CatalogCellBinding | ExternalCatalogBindingReference)[];
  isExternalIndexComplete?: boolean;
}

/**
 * Constrói o grafo exaustivo de referências para uma chave semântica.
 * Mapeia cada ponto do sistema onde a chave canônica é lida ou escrita.
 */
export function buildSemanticReferenceGraph(
  params: BuildSemanticReferenceGraphParams
): SemanticReferenceGraph {
  const {
    canonicalKey,
    workbook,
    resolvedKnowledge,
    familyWorkbook,
    externalCatalogBindings,
    isExternalIndexComplete
  } = params;

  const internalRefs: SemanticReferenceNode[] = [];
  const externalRefs: SemanticReferenceNode[] = [];

  // 1. TechnicalDatum.semanticKey
  for (const datum of Object.values(workbook.data)) {
    if (datum.semanticKey === canonicalKey) {
      internalRefs.push({
        locationType: 'technical_datum',
        containerId: datum.id,
        containerLabel: datum.label,
        path: `data.${datum.id}.semanticKey`,
        isExternal: false
      });
    }
  }

  // 2. TechnicalDataset.semanticKey & 3. DatasetColumn.semanticKey
  if (workbook.datasets) {
    for (const ds of workbook.datasets) {
      if (ds.semanticKey === canonicalKey) {
        internalRefs.push({
          locationType: 'technical_dataset',
          containerId: ds.id,
          containerLabel: ds.label,
          path: `datasets[${ds.id}].semanticKey`,
          isExternal: false
        });
      }
      for (const col of ds.columns) {
        if (col.semanticKey === canonicalKey) {
          internalRefs.push({
            locationType: 'dataset_column',
            containerId: `${ds.id}:${col.id}`,
            containerLabel: `${ds.label} -> ${col.label}`,
            path: `datasets[${ds.id}].columns[${col.id}].semanticKey`,
            isExternal: false
          });
        }
      }
    }
  }

  // 4. SavedView.datumKeys & 5. SavedView.ordering
  if (workbook.savedViews) {
    for (const sv of workbook.savedViews) {
      if (sv.datumKeys && sv.datumKeys.includes(canonicalKey)) {
        internalRefs.push({
          locationType: 'saved_view_datum_keys',
          containerId: sv.id,
          containerLabel: sv.name,
          path: `savedViews[${sv.id}].datumKeys`,
          isExternal: false
        });
      }

      const svAny = sv as unknown as Record<string, unknown>;
      const isOrderedByKey =
        (Array.isArray(sv.ordering) && sv.ordering.includes(canonicalKey)) ||
        (svAny.ordering as unknown) === canonicalKey ||
        svAny.sortBy === canonicalKey ||
        (Array.isArray(svAny.columnOrder) && svAny.columnOrder.includes(canonicalKey));

      if (isOrderedByKey) {
        internalRefs.push({
          locationType: 'saved_view_ordering',
          containerId: sv.id,
          containerLabel: sv.name,
          path: `savedViews[${sv.id}].ordering`,
          isExternal: false
        });
      }
    }
  }

  // 6. Overrides targetSemanticKey & 7. DatasetOverrides targetSemanticKey & 9. Product inherited resolution
  if (workbook.overrides) {
    for (const [key, ov] of Object.entries(workbook.overrides)) {
      if (ov.targetSemanticKey === canonicalKey || key === canonicalKey) {
        internalRefs.push({
          locationType: 'product_override_target',
          containerId: key,
          containerLabel: `Product Override: ${ov.targetSemanticKey} (${ov.mode})`,
          path: `overrides.${key}.targetSemanticKey`,
          isExternal: false
        });
      }
    }
  }

  if (workbook.datasetOverrides) {
    for (const [key, ov] of Object.entries(workbook.datasetOverrides)) {
      if (ov.targetSemanticKey === canonicalKey || key === canonicalKey) {
        internalRefs.push({
          locationType: 'dataset_override_target',
          containerId: key,
          containerLabel: `Dataset Override: ${ov.targetSemanticKey} (${ov.mode})`,
          path: `datasetOverrides.${key}.targetSemanticKey`,
          isExternal: false
        });
      }
    }
  }

  if (resolvedKnowledge) {
    // Resolução de dados e detecção de overrides em tempo de execução
    if (resolvedKnowledge.effectiveData && resolvedKnowledge.effectiveData.has(canonicalKey)) {
      const eff = resolvedKnowledge.effectiveData.get(canonicalKey)!;
      if (eff.origin === 'product_override') {
        const alreadyMapped = internalRefs.some(
          (r) => r.locationType === 'product_override_target' && r.containerId === eff.datum.id
        );
        if (!alreadyMapped) {
          internalRefs.push({
            locationType: 'product_override_target',
            containerId: eff.datum.id,
            containerLabel: `Override Datum: ${eff.datum.label}`,
            path: `resolvedKnowledge.effectiveData[${canonicalKey}]`,
            isExternal: false
          });
        }
      }
      internalRefs.push({
        locationType: 'inherited_resolution',
        containerId: eff.datum.id,
        containerLabel: `Resolved: ${eff.origin}`,
        path: `resolvedKnowledge.effectiveData[${canonicalKey}]`,
        isExternal: false
      });
    }

    // Overrides de datasets
    if (resolvedKnowledge.effectiveDatasets && resolvedKnowledge.effectiveDatasets.has(canonicalKey)) {
      const effDs = resolvedKnowledge.effectiveDatasets.get(canonicalKey)!;
      if (effDs.origin === 'product_override') {
        const alreadyMapped = internalRefs.some(
          (r) => r.locationType === 'dataset_override_target' && r.containerId === effDs.dataset.id
        );
        if (!alreadyMapped) {
          internalRefs.push({
            locationType: 'dataset_override_target',
            containerId: effDs.dataset.id,
            containerLabel: `Override Dataset: ${effDs.dataset.label}`,
            path: `resolvedKnowledge.effectiveDatasets[${canonicalKey}]`,
            isExternal: false
          });
        }
      }
    }
  }

  // 8. Family workbook references
  if (familyWorkbook) {
    for (const fDatum of Object.values(familyWorkbook.data)) {
      if (fDatum.semanticKey === canonicalKey) {
        internalRefs.push({
          locationType: 'family_datum_reference',
          containerId: fDatum.id,
          containerLabel: `Family Datum: ${fDatum.label}`,
          path: `familyWorkbook.data.${fDatum.id}.semanticKey`,
          isExternal: false
        });
      }
    }
  }

  // 10. External References (CatalogCellBindings reais fora do ProductWorkbook - Blocker 18)
  if (externalCatalogBindings) {
    for (const item of externalCatalogBindings) {
      const binding: CatalogCellBinding = 'binding' in item ? item.binding : item;
      const isContextualized = 'catalogId' in item;

      if (binding.semanticKey === canonicalKey) {
        const containerId = isContextualized
          ? `${item.catalogId}:${item.pageId}:${item.blockId}`
          : binding.productId;
        const containerLabel = isContextualized
          ? `Catálogo ${item.catalogId} (Página ${item.pageId}, Bloco ${item.blockId}${item.cellKey ? `, Célula ${item.cellKey}` : ''})`
          : `Catalog Binding (${binding.sourceKind} - ${binding.bindingMode})`;
        const path = isContextualized
          ? `catalogs[${item.catalogId}].pages[${item.pageId}].blocks[${item.blockId}]${item.cellKey ? `.cells[${item.cellKey}]` : ''}`
          : `catalogs[${binding.productId}].cellBindings.${canonicalKey}`;

        externalRefs.push({
          locationType: 'catalog_cell_binding',
          containerId,
          containerLabel,
          path,
          isExternal: true
        });
      }
    }
  }

  const hasExternalUncertainty = isExternalIndexComplete !== true;
  const externalStatus: 'KNOWN' | 'UNKNOWN' | 'REQUIRES_INDEX' =
    isExternalIndexComplete === true ? 'KNOWN' : externalRefs.length > 0 ? 'UNKNOWN' : 'REQUIRES_INDEX';

  const externalWarning =
    externalStatus !== 'KNOWN'
      ? 'Atenção: Os bindings reais de catálogos e tabelas editoriais fora do ProductWorkbook não foram indexados exaustivamente. Não é seguro executar a renomeação sem indexação reversa.'
      : undefined;

  return {
    canonicalKey,
    internalReferences: internalRefs,
    externalReferences: {
      status: externalStatus,
      items: externalRefs,
      warning: externalWarning
    },
    totalReferenceCount: internalRefs.length + externalRefs.length,
    hasExternalUncertainty
  };
}

// ============================================================================
// CANONICAL RENAME PLANNER (10-STEP SAFE DOMAIN ARCHITECTURE - PLAN ONLY)
// ============================================================================

export interface PlanCanonicalRenameParams {
  workbook: ProductWorkbookV2;
  resolvedKnowledge?: ResolvedProductKnowledge;
  familyWorkbook?: ProductWorkbookV2;
  semanticRegistry?: ProductSemanticRegistry;
  externalCatalogBindings?: readonly (CatalogCellBinding | ExternalCatalogBindingReference)[];
  isExternalIndexComplete?: boolean;
  oldCanonicalKey: string;
  newCanonicalKey: string;
  rationale: string;
  plannedBy?: string;
}

/**
 * Planejador puro de renomeação controlada de uma canonicalKey.
 * Mapeia o grafo real de impacto sem executar mutações live.
 * Fail-Closed: se houver incerteza sobre bindings externos, isExecutable = false.
 */
export function planCanonicalRename(params: PlanCanonicalRenameParams): CanonicalRenamePlan {
  const {
    workbook,
    resolvedKnowledge,
    familyWorkbook,
    semanticRegistry,
    externalCatalogBindings,
    isExternalIndexComplete,
    oldCanonicalKey,
    newCanonicalKey,
    rationale,
    plannedBy
  } = params;
  const errors: string[] = [];

  // Validação 1: Sintaxe da nova chave
  if (!isValidSemanticKey(newCanonicalKey)) {
    errors.push(
      `Nova chave "${newCanonicalKey}" é inválida. Deve seguir o formato segmentado minúsculo (ex: metrology.temperature.range)`
    );
  }

  if (oldCanonicalKey === newCanonicalKey) {
    errors.push('A nova chave canônica não pode ser idêntica à chave antiga.');
  }

  // Validação 2: Existência da chave antiga
  const datumEntries = Object.values(workbook.data);
  const matchingOldDatums = datumEntries.filter((d) => d.semanticKey === oldCanonicalKey);
  const affectedDatumIds = matchingOldDatums.map((d) => d.id);

  if (matchingOldDatums.length === 0) {
    errors.push(`Chave antiga "${oldCanonicalKey}" não foi encontrada nos dados do workbook.`);
  }

  // Validação 3: Checagem rigorosa de colisão (Blocker 17: canônicas E aliases reservados)
  const datasets = workbook.datasets || [];
  const collisionDatum = datumEntries.find((d) => d.semanticKey === newCanonicalKey);
  const collisionDataset = datasets.find((ds) => ds.semanticKey === newCanonicalKey);

  // Checa se a nova chave coincide com aliases reservados por outro descritor semântico
  let aliasCollisionDescriptor: SemanticDescriptor | undefined;
  if (semanticRegistry?.descriptors) {
    for (const desc of Object.values(semanticRegistry.descriptors)) {
      if (desc.canonicalKey !== oldCanonicalKey) {
        if (
          desc.aliases.map((a) => a.toLowerCase()).includes(newCanonicalKey.toLowerCase()) ||
          desc.deprecatedAliases?.map((a) => a.toLowerCase()).includes(newCanonicalKey.toLowerCase())
        ) {
          aliasCollisionDescriptor = desc;
          break;
        }
      }
    }
  }

  const hasCollision = Boolean(collisionDatum || collisionDataset || aliasCollisionDescriptor);
  const conflictingTarget = collisionDatum
    ? `TechnicalDatum:${collisionDatum.id}`
    : collisionDataset
    ? `TechnicalDataset:${collisionDataset.id}`
    : aliasCollisionDescriptor
    ? `SemanticAlias:${aliasCollisionDescriptor.canonicalKey}`
    : undefined;

  if (hasCollision) {
    errors.push(
      `Colisão detectada: a nova chave "${newCanonicalKey}" já está em uso por ${conflictingTarget}.`
    );
  }

  // Construção do Grafo Exaustivo de Referências
  const referenceGraph = buildSemanticReferenceGraph({
    canonicalKey: oldCanonicalKey,
    workbook,
    resolvedKnowledge,
    familyWorkbook,
    semanticRegistry,
    externalCatalogBindings,
    isExternalIndexComplete
  });

  // Mapeamento de Datasets afetados
  const affectedDatasetIds = Array.from(
    new Set(
      referenceGraph.internalReferences
        .filter((ref) => ref.locationType === 'technical_dataset' || ref.locationType === 'dataset_column')
        .map((ref) => ref.containerId.split(':')[0])
    )
  );

  // Mapeamento de Saved Views afetadas
  const affectedSavedViewIds = Array.from(
    new Set(
      referenceGraph.internalReferences
        .filter((ref) => ref.locationType === 'saved_view_datum_keys' || ref.locationType === 'saved_view_ordering')
        .map((ref) => ref.containerId)
    )
  );

  // Mapeamento de Table Bindings externos
  const affectedTableBindingIds = referenceGraph.externalReferences.items.map((ref) => ref.containerId);

  // Validação de Rationale obrigatória
  const trimmedRationale = rationale.trim();
  if (trimmedRationale.length < 5) {
    errors.push('Rationale detalhada (mínimo 5 caracteres) é obrigatória para planejar renomeação canônica.');
  }

  const auditEntry: RenameStepAudit = {
    plannedAt: new Date().toISOString(),
    plannedBy,
    rationale: trimmedRationale
  };

  const rollbackInstructions =
    `Para reverter, aplicar plano inverso: trocar "${newCanonicalKey}" de volta para "${oldCanonicalKey}", ` +
    `remover "${newCanonicalKey}" dos aliases e restaurar referências originais em datasets, saved views e catálogos.`;

  // BLOCKER 4 & 5: Fail closed para execução live
  // O plano é válido estruturalmente se não violar regras de domínio,
  // mas só é executável se NÃO houver incerteza em referências externas!
  const isValid = errors.length === 0;
  const isExecutable = isValid && !hasCollision && !referenceGraph.hasExternalUncertainty;

  return {
    oldCanonicalKey,
    newCanonicalKey,
    referenceGraph,
    affectedDatumIds,
    affectedDatasetIds,
    affectedSavedViewIds,
    affectedTableBindingIds,
    aliasPreserved: true, // Invariante: oldKey é mandatória como alias
    collisionCheck: {
      hasCollision,
      conflictingTarget
    },
    rollbackPlan: {
      canRollback: true,
      instructions: rollbackInstructions
    },
    auditEntry,
    isValid,
    validationErrors: errors,
    isExecutable
  };
}
