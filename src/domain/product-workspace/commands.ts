// src/domain/product-workspace/commands.ts
// Pure immutable command transformations for Human Workspace Customization (PIM.MEGA.WORKSPACE.FOUNDATION1A/1B/1C).
// Fundamental Rules:
// 1. REMOVE != DELETE DATUM: Removing a block or a datum from a layout ONLY removes its presentation reference.
// 2. REVISION AUTHORITY: Any layout mutation bumps layout.revision by 1 (touchWorkspaceLayout).
// 3. NO-OP IDEMPOTENCY: Commands that result in no state change MUST NOT bump layout.revision.
// 4. BLOCK OWNERSHIP: A WorkspaceBlock belongs to exactly ONE WorkspaceSection. Removing a section cleans its owned blocks.
// Zero explicit any.

import {
  WorkspaceLayoutV1,
  WorkspaceSectionDef,
  WorkspaceBlockDef,
  WorkspaceBlockSize,
  WorkspaceBlockVisibility,
  WorkspaceDisplayOverride,
  TechnicalTableBlockDef,
  WorkspaceTechnicalTableDef,
  WorkspaceEditDraft,
  DatumChangeDraft
} from './types';
import { updateDisplayLabel, addAlias, removeAlias, createSemanticDescriptor } from './semantics';

// ============================================================================
// CANONICAL REVISION BUMP HELPER (BLOCKER 7)
// ============================================================================

/**
 * Incrementa a revisão do layout e carimba timestamp de atualização UTC.
 * Invariante: Nunca é chamado em operações NO-OP.
 */
export function touchWorkspaceLayout(layout: WorkspaceLayoutV1): WorkspaceLayoutV1 {
  return {
    ...layout,
    revision: layout.revision + 1,
    updatedAt: new Date().toISOString()
  };
}

// ============================================================================
// SECTION MUTATIONS (IMMUTABLE)
// ============================================================================

export function addSection(
  layout: WorkspaceLayoutV1,
  params: { title: string; description?: string; icon?: string }
): WorkspaceLayoutV1 {
  const trimmed = params.title.trim();
  if (!trimmed) throw new Error('Título da seção não pode ser vazio');

  const newId = `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newSection: WorkspaceSectionDef = {
    id: newId,
    title: trimmed,
    description: params.description?.trim(),
    icon: params.icon,
    blockIds: [],
    order: layout.sections.length
  };

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    sections: [...layout.sections, newSection]
  };

  return touchWorkspaceLayout(updated);
}

export function renameSection(
  layout: WorkspaceLayoutV1,
  sectionId: string,
  newTitle: string,
  newDescription?: string
): WorkspaceLayoutV1 {
  const trimmed = newTitle.trim();
  if (!trimmed) throw new Error('Título da seção não pode ser vazio');

  const section = layout.sections.find((s) => s.id === sectionId);
  if (!section) return layout;

  const targetDescription = newDescription !== undefined ? newDescription.trim() : section.description;
  if (section.title === trimmed && section.description === targetDescription) {
    // NO-OP: Nenhuma alteração real
    return layout;
  }

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    sections: layout.sections.map((sec) =>
      sec.id === sectionId
        ? {
            ...sec,
            title: trimmed,
            description: targetDescription
          }
        : sec
    )
  };

  return touchWorkspaceLayout(updated);
}

export function removeSection(layout: WorkspaceLayoutV1, sectionId: string): WorkspaceLayoutV1 {
  const sectionToRemove = layout.sections.find((s) => s.id === sectionId);
  if (!sectionToRemove) {
    // NO-OP: Seção inexistente
    return layout;
  }

  const remainingSections = layout.sections
    .filter((s) => s.id !== sectionId)
    .map((s, idx) => ({ ...s, order: idx }));

  // BLOCKER 8/9: Invariante de propriedade estrita: um bloco pertence a exatamente uma seção.
  // Ao remover a seção, limpamos todos os blocos pertencentes a ela de layout.blocks para evitar dangling/órfãos.
  const remainingBlocks = { ...layout.blocks };
  for (const bId of sectionToRemove.blockIds) {
    delete remainingBlocks[bId];
  }

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    sections: remainingSections,
    blocks: remainingBlocks
  };

  return touchWorkspaceLayout(updated);
}

export function moveSection(
  layout: WorkspaceLayoutV1,
  sectionId: string,
  direction: 'up' | 'down'
): WorkspaceLayoutV1 {
  const index = layout.sections.findIndex((s) => s.id === sectionId);
  if (index === -1) return layout;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= layout.sections.length || index === targetIndex) {
    // NO-OP: Já no limite
    return layout;
  }

  const newSections = [...layout.sections];
  const [removed] = newSections.splice(index, 1);
  newSections.splice(targetIndex, 0, removed);

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    sections: newSections.map((s, idx) => ({ ...s, order: idx }))
  };

  return touchWorkspaceLayout(updated);
}

export function reorderSections(layout: WorkspaceLayoutV1, sectionIds: readonly string[]): WorkspaceLayoutV1 {
  const currentIds = layout.sections.map((s) => s.id);
  const sectionMap = new Map(layout.sections.map((s) => [s.id, s]));
  const orderedSections: WorkspaceSectionDef[] = [];

  for (const sId of sectionIds) {
    const sec = sectionMap.get(sId);
    if (sec) {
      orderedSections.push(sec);
      sectionMap.delete(sId);
    }
  }

  for (const remaining of sectionMap.values()) {
    orderedSections.push(remaining);
  }

  const newIds = orderedSections.map((s) => s.id);
  const isIdentical =
    currentIds.length === newIds.length && currentIds.every((id, idx) => id === newIds[idx]);

  if (isIdentical) {
    // NO-OP: Ordem não se alterou
    return layout;
  }

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    sections: orderedSections.map((s, idx) => ({ ...s, order: idx }))
  };

  return touchWorkspaceLayout(updated);
}

// ============================================================================
// BLOCK MUTATIONS (IMMUTABLE)
// ============================================================================

export function addBlock(
  layout: WorkspaceLayoutV1,
  sectionId: string,
  block: WorkspaceBlockDef
): WorkspaceLayoutV1 {
  const section = layout.sections.find((s) => s.id === sectionId);
  if (!section) throw new Error(`Seção "${sectionId}" não encontrada.`);

  // BLOCKER 8: Detecção e rejeição estrita de colisão de ID de bloco
  const existingBlock = layout.blocks[block.id];
  if (existingBlock) {
    const isExactMatch = JSON.stringify(existingBlock) === JSON.stringify(block);
    const isSameOwner = section.blockIds.includes(block.id);
    if (isExactMatch && isSameOwner) {
      // Same exact block + same owner: NO-OP aceitável (não bumpa revisão)
      return layout;
    }
    // Different block ou owner divergente: rejeita colisão
    throw new Error(
      `Colisão de blockId: Bloco com id "${block.id}" já existe no workspace e não pode ser sobrescrito.`
    );
  }

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    blocks: {
      ...layout.blocks,
      [block.id]: block
    },
    sections: layout.sections.map((s) =>
      s.id === sectionId ? { ...s, blockIds: [...s.blockIds, block.id] } : s
    )
  };

  return touchWorkspaceLayout(updated);
}

export function removeBlock(
  layout: WorkspaceLayoutV1,
  sectionId: string,
  blockId: string
): WorkspaceLayoutV1 {
  if (!layout.blocks[blockId]) {
    // NO-OP: Bloco não existe
    return layout;
  }

  // BLOCKER 7: Invariante de propriedade de bloco (Fail Closed / Controlled Error)
  const ownerSection = layout.sections.find((s) => s.blockIds.includes(blockId));
  if (!ownerSection) {
    // Bloco órfão sem seção proprietária: limpa de layout.blocks de forma segura
    const newBlocks = { ...layout.blocks };
    delete newBlocks[blockId];
    return touchWorkspaceLayout({ ...layout, blocks: newBlocks });
  }

  if (ownerSection.id !== sectionId) {
    // Tentativa de remover bloco informando seção errada
    // Fail closed / controlled error: o layout permanece 100% íntegro e zero revision bump
    throw new Error(
      `Inconsistência de propriedade: Bloco "${blockId}" pertence à seção "${ownerSection.id}", mas foi solicitada remoção na seção "${sectionId}". Layout não alterado.`
    );
  }

  const newBlocks = { ...layout.blocks };
  delete newBlocks[blockId];

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    blocks: newBlocks,
    sections: layout.sections.map((s) =>
      s.id === sectionId ? { ...s, blockIds: s.blockIds.filter((id) => id !== blockId) } : s
    )
  };

  return touchWorkspaceLayout(updated);
}

export function renameBlock(layout: WorkspaceLayoutV1, blockId: string, newTitle: string): WorkspaceLayoutV1 {
  const block = layout.blocks[blockId];
  if (!block) return layout;

  const trimmed = newTitle.trim();
  let updatedBlock: WorkspaceBlockDef;

  switch (block.kind) {
    case 'fact_grid':
      if (block.title === trimmed) return layout; // NO-OP
      updatedBlock = { ...block, title: trimmed };
      break;
    case 'datum_list':
      if (block.title === trimmed) return layout; // NO-OP
      updatedBlock = { ...block, title: trimmed };
      break;
    case 'technical_table':
      if (block.tableDef.title === trimmed) return layout; // NO-OP
      updatedBlock = { ...block, tableDef: { ...block.tableDef, title: trimmed } };
      break;
    case 'dataset_view':
      if (block.customTitle === trimmed) return layout; // NO-OP
      updatedBlock = { ...block, customTitle: trimmed };
      break;
    case 'text_note':
      if (block.title === trimmed) return layout; // NO-OP
      updatedBlock = { ...block, title: trimmed };
      break;
    case 'source_group':
      if (block.title === trimmed) return layout; // NO-OP
      updatedBlock = { ...block, title: trimmed };
      break;
    default:
      return layout;
  }

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    blocks: {
      ...layout.blocks,
      [blockId]: updatedBlock
    }
  };

  return touchWorkspaceLayout(updated);
}

export function moveBlock(
  layout: WorkspaceLayoutV1,
  blockId: string,
  targetSectionId: string,
  targetIndex?: number
): WorkspaceLayoutV1 {
  const block = layout.blocks[blockId];
  if (!block) return layout;

  const sourceSection = layout.sections.find((s) => s.blockIds.includes(blockId));
  const targetSection = layout.sections.find((s) => s.id === targetSectionId);
  if (!targetSection) return layout;

  // Se for na mesma seção
  if (sourceSection && sourceSection.id === targetSectionId) {
    const currentIndex = sourceSection.blockIds.indexOf(blockId);
    const ids = sourceSection.blockIds.filter((id) => id !== blockId);
    const insertAt = targetIndex !== undefined ? Math.max(0, Math.min(ids.length, targetIndex)) : ids.length;

    if (currentIndex === insertAt) {
      // NO-OP: Bloco permaneceu no mesmo índice da mesma seção
      return layout;
    }

    ids.splice(insertAt, 0, blockId);

    const updated: WorkspaceLayoutV1 = {
      ...layout,
      sections: layout.sections.map((s) => (s.id === targetSectionId ? { ...s, blockIds: ids } : s))
    };

    return touchWorkspaceLayout(updated);
  }

  // Entre seções diferentes
  const updated: WorkspaceLayoutV1 = {
    ...layout,
    sections: layout.sections.map((s) => {
      if (sourceSection && s.id === sourceSection.id) {
        return { ...s, blockIds: s.blockIds.filter((id) => id !== blockId) };
      }
      if (s.id === targetSectionId) {
        const ids = [...s.blockIds];
        const insertAt = targetIndex !== undefined ? Math.max(0, Math.min(ids.length, targetIndex)) : ids.length;
        ids.splice(insertAt, 0, blockId);
        return { ...s, blockIds: ids };
      }
      return s;
    })
  };

  return touchWorkspaceLayout(updated);
}

/**
 * Altera o tamanho visual de um bloco (small | medium | large | full).
 * Mutação pura e imutável que altera apenas a apresentação e incrementa a revisão do layout.
 */
export function resizeBlock(
  layout: WorkspaceLayoutV1,
  blockId: string,
  size: WorkspaceBlockSize
): WorkspaceLayoutV1 {
  const block = layout.blocks[blockId];
  if (!block) return layout;

  if (block.size === size) {
    // NO-OP: Tamanho já é o desejado
    return layout;
  }

  const updatedBlock: WorkspaceBlockDef = {
    ...block,
    size
  };

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    blocks: {
      ...layout.blocks,
      [blockId]: updatedBlock
    }
  };

  return touchWorkspaceLayout(updated);
}

/**
 * Altera a visibilidade de um bloco (visible | hidden).
 * Permite que humanos ocultem blocos de sua visualização sem deletar referências nem dados canônicos.
 */
export function setBlockVisibility(
  layout: WorkspaceLayoutV1,
  blockId: string,
  visibility: WorkspaceBlockVisibility
): WorkspaceLayoutV1 {
  const block = layout.blocks[blockId];
  if (!block) return layout;

  if (block.visibility === visibility) {
    // NO-OP: Visibilidade já é a desejada
    return layout;
  }

  const updatedBlock: WorkspaceBlockDef = {
    ...block,
    visibility
  };

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    blocks: {
      ...layout.blocks,
      [blockId]: updatedBlock
    }
  };

  return touchWorkspaceLayout(updated);
}

// ============================================================================
// DATUM REFERENCE COMMANDS (REMOVE != DELETE DATUM)
// ============================================================================

export function addDatumToBlock(
  layout: WorkspaceLayoutV1,
  blockId: string,
  datumId: string
): WorkspaceLayoutV1 {
  const block = layout.blocks[blockId];
  if (!block) return layout;

  if (block.kind === 'fact_grid' || block.kind === 'datum_list') {
    if (block.datumIds.includes(datumId)) {
      // NO-OP: Já contém o dado
      return layout;
    }
    const updatedBlock = { ...block, datumIds: [...block.datumIds, datumId] };
    const updated: WorkspaceLayoutV1 = {
      ...layout,
      blocks: { ...layout.blocks, [blockId]: updatedBlock }
    };
    return touchWorkspaceLayout(updated);
  }

  return layout;
}

/**
 * Remove a referência de um datum de um bloco visual do layout.
 * O TechnicalDatum canônico NÃO é apagado do banco de dados nem do ProductWorkbook!
 */
export function removeDatumFromBlock(
  layout: WorkspaceLayoutV1,
  blockId: string,
  datumId: string
): WorkspaceLayoutV1 {
  const block = layout.blocks[blockId];
  if (!block) return layout;

  if (block.kind === 'fact_grid' || block.kind === 'datum_list') {
    if (!block.datumIds.includes(datumId)) {
      // NO-OP: Dado não constava no bloco
      return layout;
    }
    const updatedBlock = { ...block, datumIds: block.datumIds.filter((id) => id !== datumId) };
    const updated: WorkspaceLayoutV1 = {
      ...layout,
      blocks: { ...layout.blocks, [blockId]: updatedBlock }
    };
    return touchWorkspaceLayout(updated);
  }

  return layout;
}

export function moveDatumBetweenGroups(
  layout: WorkspaceLayoutV1,
  datumId: string,
  sourceBlockId: string,
  targetBlockId: string
): WorkspaceLayoutV1 {
  if (sourceBlockId === targetBlockId) return layout; // NO-OP

  const sourceBlock = layout.blocks[sourceBlockId];
  const targetBlock = layout.blocks[targetBlockId];
  if (!sourceBlock || !targetBlock) return layout;

  if (
    (sourceBlock.kind !== 'fact_grid' && sourceBlock.kind !== 'datum_list') ||
    (targetBlock.kind !== 'fact_grid' && targetBlock.kind !== 'datum_list')
  ) {
    return layout;
  }

  if (!sourceBlock.datumIds.includes(datumId)) {
    // NO-OP: Dado não existe no bloco de origem
    return layout;
  }

  const updatedSource = {
    ...sourceBlock,
    datumIds: sourceBlock.datumIds.filter((id) => id !== datumId)
  };
  const updatedTarget = {
    ...targetBlock,
    datumIds: targetBlock.datumIds.includes(datumId)
      ? targetBlock.datumIds
      : [...targetBlock.datumIds, datumId]
  };

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    blocks: {
      ...layout.blocks,
      [sourceBlockId]: updatedSource,
      [targetBlockId]: updatedTarget
    }
  };

  return touchWorkspaceLayout(updated);
}

// ============================================================================
// CUSTOM TABLE CREATION
// ============================================================================

export function createCustomTable(
  layout: WorkspaceLayoutV1,
  sectionId: string,
  tableDef: WorkspaceTechnicalTableDef
): WorkspaceLayoutV1 {
  const blockId = `block_table_${tableDef.id}`;
  const block: TechnicalTableBlockDef = {
    id: blockId,
    kind: 'technical_table',
    tableDef
  };

  return addBlock(layout, sectionId, block);
}

// ============================================================================
// WORKSPACE DISPLAY OVERRIDE COMMANDS (BLOCKER 14)
// ============================================================================

/**
 * Atualiza ou define um override de exibição visual exclusivo deste layout.
 * Não altera nem contamina a verdade semântica canônica do produto.
 */
export function updateDisplayOverride(
  layout: WorkspaceLayoutV1,
  canonicalKey: string,
  override: WorkspaceDisplayOverride
): WorkspaceLayoutV1 {
  const currentOverrides = layout.displayOverrides || {};
  const existing = currentOverrides[canonicalKey];

  if (
    existing &&
    existing.customLabel === override.customLabel &&
    existing.customDescription === override.customDescription
  ) {
    // NO-OP: Override idêntico
    return layout;
  }

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    displayOverrides: {
      ...currentOverrides,
      [canonicalKey]: override
    }
  };

  return touchWorkspaceLayout(updated);
}

// ============================================================================
// SEMANTIC DESCRIPTOR COMMANDS (FALLBACK / MIGRATION COMPATIBILITY)
// ============================================================================

export function updateDescriptorDisplayLabel(
  layout: WorkspaceLayoutV1,
  canonicalKey: string,
  newDisplayLabel: string
): WorkspaceLayoutV1 {
  const currentDescriptors = layout.semanticDescriptors || {};
  const currentDesc = currentDescriptors[canonicalKey] || createSemanticDescriptor({
    canonicalKey,
    displayLabel: newDisplayLabel
  });

  const updatedDesc = updateDisplayLabel(currentDesc, newDisplayLabel);

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    semanticDescriptors: {
      ...currentDescriptors,
      [canonicalKey]: updatedDesc
    }
  };

  return touchWorkspaceLayout(updated);
}

export function addDescriptorAliasCommand(
  layout: WorkspaceLayoutV1,
  canonicalKey: string,
  alias: string
): WorkspaceLayoutV1 {
  const currentDescriptors = layout.semanticDescriptors || {};
  const currentDesc = currentDescriptors[canonicalKey] || createSemanticDescriptor({
    canonicalKey,
    displayLabel: canonicalKey
  });

  const updatedDesc = addAlias(currentDesc, alias);

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    semanticDescriptors: {
      ...currentDescriptors,
      [canonicalKey]: updatedDesc
    }
  };

  return touchWorkspaceLayout(updated);
}

export function removeDescriptorAliasCommand(
  layout: WorkspaceLayoutV1,
  canonicalKey: string,
  aliasToRemove: string
): WorkspaceLayoutV1 {
  const currentDescriptors = layout.semanticDescriptors || {};
  const currentDesc = currentDescriptors[canonicalKey];
  if (!currentDesc) return layout;

  const updatedDesc = removeAlias(currentDesc, aliasToRemove);

  const updated: WorkspaceLayoutV1 = {
    ...layout,
    semanticDescriptors: {
      ...currentDescriptors,
      [canonicalKey]: updatedDesc
    }
  };

  return touchWorkspaceLayout(updated);
}

// ============================================================================
// STAGING EDITS
// ============================================================================

export function stageDatumChange(
  draft: WorkspaceEditDraft,
  change: DatumChangeDraft
): WorkspaceEditDraft {
  return {
    ...draft,
    stagedDatumChanges: {
      ...draft.stagedDatumChanges,
      [change.datumId]: change
    }
  };
}

export function discardDatumChange(
  draft: WorkspaceEditDraft,
  datumId: string
): WorkspaceEditDraft {
  const updated = { ...draft.stagedDatumChanges };
  delete updated[datumId];
  return {
    ...draft,
    stagedDatumChanges: updated
  };
}
