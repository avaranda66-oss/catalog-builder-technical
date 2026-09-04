// src/domain/product-workspace/commands.ts
// Pure immutable command transformations for Human Workspace Customization (PIM.MEGA.WORKSPACE.FOUNDATION1A).
// Fundamental Rule: REMOVE != DELETE DATUM.
// Removing a block or a datum from a layout ONLY removes its presentation reference.
// The canonical TechnicalDatum in ProductWorkbook remains 100% intact and unmutated.
// Zero explicit any.

import {
  WorkspaceLayoutV1,
  WorkspaceSectionDef,
  WorkspaceBlockDef,
  WorkspaceBlockSize,
  WorkspaceBlockVisibility,
  TechnicalTableBlockDef,
  WorkspaceTechnicalTableDef,
  WorkspaceEditDraft,
  DatumChangeDraft
} from './types';
import { updateDisplayLabel, addAlias, removeAlias, createSemanticDescriptor } from './semantics';

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

  return {
    ...layout,
    sections: [...layout.sections, newSection]
  };
}

export function renameSection(
  layout: WorkspaceLayoutV1,
  sectionId: string,
  newTitle: string,
  newDescription?: string
): WorkspaceLayoutV1 {
  const trimmed = newTitle.trim();
  if (!trimmed) throw new Error('Título da seção não pode ser vazio');

  return {
    ...layout,
    sections: layout.sections.map((sec) =>
      sec.id === sectionId
        ? {
            ...sec,
            title: trimmed,
            description: newDescription !== undefined ? newDescription.trim() : sec.description
          }
        : sec
    )
  };
}

export function removeSection(layout: WorkspaceLayoutV1, sectionId: string): WorkspaceLayoutV1 {
  const sectionToRemove = layout.sections.find((s) => s.id === sectionId);
  if (!sectionToRemove) return layout;

  const remainingSections = layout.sections
    .filter((s) => s.id !== sectionId)
    .map((s, idx) => ({ ...s, order: idx }));

  // Remove também blocos órfãos pertencentes apenas a esta seção
  const remainingBlocks = { ...layout.blocks };
  for (const bId of sectionToRemove.blockIds) {
    delete remainingBlocks[bId];
  }

  return {
    ...layout,
    sections: remainingSections,
    blocks: remainingBlocks
  };
}

export function moveSection(
  layout: WorkspaceLayoutV1,
  sectionId: string,
  direction: 'up' | 'down'
): WorkspaceLayoutV1 {
  const index = layout.sections.findIndex((s) => s.id === sectionId);
  if (index === -1) return layout;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= layout.sections.length) return layout;

  const newSections = [...layout.sections];
  const [removed] = newSections.splice(index, 1);
  newSections.splice(targetIndex, 0, removed);

  return {
    ...layout,
    sections: newSections.map((s, idx) => ({ ...s, order: idx }))
  };
}

export function reorderSections(layout: WorkspaceLayoutV1, sectionIds: readonly string[]): WorkspaceLayoutV1 {
  const sectionMap = new Map(layout.sections.map((s) => [s.id, s]));
  const orderedSections: WorkspaceSectionDef[] = [];

  for (const sId of sectionIds) {
    const sec = sectionMap.get(sId);
    if (sec) {
      orderedSections.push(sec);
      sectionMap.delete(sId);
    }
  }

  // Anexa seções que porventura não tenham sido incluídas na lista
  for (const remaining of sectionMap.values()) {
    orderedSections.push(remaining);
  }

  return {
    ...layout,
    sections: orderedSections.map((s, idx) => ({ ...s, order: idx }))
  };
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

  return {
    ...layout,
    blocks: {
      ...layout.blocks,
      [block.id]: block
    },
    sections: layout.sections.map((s) =>
      s.id === sectionId ? { ...s, blockIds: [...s.blockIds, block.id] } : s
    )
  };
}

export function removeBlock(
  layout: WorkspaceLayoutV1,
  sectionId: string,
  blockId: string
): WorkspaceLayoutV1 {
  const newBlocks = { ...layout.blocks };
  delete newBlocks[blockId];

  return {
    ...layout,
    blocks: newBlocks,
    sections: layout.sections.map((s) =>
      s.id === sectionId ? { ...s, blockIds: s.blockIds.filter((id) => id !== blockId) } : s
    )
  };
}

export function renameBlock(layout: WorkspaceLayoutV1, blockId: string, newTitle: string): WorkspaceLayoutV1 {
  const block = layout.blocks[blockId];
  if (!block) return layout;

  const trimmed = newTitle.trim();
  let updatedBlock: WorkspaceBlockDef;

  switch (block.kind) {
    case 'fact_grid':
      updatedBlock = { ...block, title: trimmed };
      break;
    case 'datum_list':
      updatedBlock = { ...block, title: trimmed };
      break;
    case 'technical_table':
      updatedBlock = { ...block, tableDef: { ...block.tableDef, title: trimmed } };
      break;
    case 'dataset_view':
      updatedBlock = { ...block, customTitle: trimmed };
      break;
    case 'text_note':
      updatedBlock = { ...block, title: trimmed };
      break;
    case 'source_group':
      updatedBlock = { ...block, title: trimmed };
      break;
    default:
      return layout;
  }

  return {
    ...layout,
    blocks: {
      ...layout.blocks,
      [blockId]: updatedBlock
    }
  };
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
    const ids = sourceSection.blockIds.filter((id) => id !== blockId);
    const insertAt = targetIndex !== undefined ? Math.max(0, Math.min(ids.length, targetIndex)) : ids.length;
    ids.splice(insertAt, 0, blockId);

    return {
      ...layout,
      sections: layout.sections.map((s) => (s.id === targetSectionId ? { ...s, blockIds: ids } : s))
    };
  }

  // Entre seções diferentes
  return {
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

  const updatedBlock: WorkspaceBlockDef = {
    ...block,
    size
  };

  return {
    ...layout,
    revision: layout.revision + 1,
    updatedAt: new Date().toISOString(),
    blocks: {
      ...layout.blocks,
      [blockId]: updatedBlock
    }
  };
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

  const updatedBlock: WorkspaceBlockDef = {
    ...block,
    visibility
  };

  return {
    ...layout,
    revision: layout.revision + 1,
    updatedAt: new Date().toISOString(),
    blocks: {
      ...layout.blocks,
      [blockId]: updatedBlock
    }
  };
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
    if (block.datumIds.includes(datumId)) return layout;
    const updated = { ...block, datumIds: [...block.datumIds, datumId] };
    return {
      ...layout,
      blocks: { ...layout.blocks, [blockId]: updated }
    };
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
    const updated = { ...block, datumIds: block.datumIds.filter((id) => id !== datumId) };
    return {
      ...layout,
      blocks: { ...layout.blocks, [blockId]: updated }
    };
  }

  return layout;
}

export function moveDatumBetweenGroups(
  layout: WorkspaceLayoutV1,
  datumId: string,
  sourceBlockId: string,
  targetBlockId: string
): WorkspaceLayoutV1 {
  let nextLayout = removeDatumFromBlock(layout, sourceBlockId, datumId);
  nextLayout = addDatumToBlock(nextLayout, targetBlockId, datumId);
  return nextLayout;
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
// SEMANTIC DESCRIPTOR COMMANDS
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

  return {
    ...layout,
    semanticDescriptors: {
      ...currentDescriptors,
      [canonicalKey]: updatedDesc
    }
  };
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

  return {
    ...layout,
    semanticDescriptors: {
      ...currentDescriptors,
      [canonicalKey]: updatedDesc
    }
  };
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

  return {
    ...layout,
    semanticDescriptors: {
      ...currentDescriptors,
      [canonicalKey]: updatedDesc
    }
  };
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
