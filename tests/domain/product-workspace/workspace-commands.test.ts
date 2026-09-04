// tests/domain/product-workspace/workspace-commands.test.ts
import { describe, it, expect } from 'vitest';
import {
  addSection,
  renameSection,
  removeSection,
  moveSection,
  reorderSections,
  addBlock,
  removeBlock,
  renameBlock,
  moveBlock,
  addDatumToBlock,
  removeDatumFromBlock,
  createCustomTable,
  stageDatumChange,
  discardDatumChange,
  updateDescriptorDisplayLabel,
  addDescriptorAliasCommand
} from '../../../src/domain/product-workspace/commands';
import {
  WorkspaceLayoutV1,
  FactGridBlockDef,
  WorkspaceEditDraft
} from '../../../src/domain/product-workspace/types';

describe('Workspace Pure Command Mutations & Immutability', () => {
  function createBaseLayout(): WorkspaceLayoutV1 {
    return {
      schemaVersion: 1,
      id: 'layout-base',
      productId: 'PROD-1',
      title: 'Layout Base',
      sections: [
        { id: 'sec-1', title: 'Seção 1', blockIds: ['block-1'], order: 0 },
        { id: 'sec-2', title: 'Seção 2', blockIds: ['block-2'], order: 1 }
      ],
      blocks: {
        'block-1': { id: 'block-1', kind: 'fact_grid', title: 'Bloco 1', datumIds: ['d1', 'd2'] },
        'block-2': { id: 'block-2', kind: 'fact_grid', title: 'Bloco 2', datumIds: ['d3'] }
      }
    };
  }

  it('adiciona, renomeia, remove e move seções de forma imutável', () => {
    let layout = createBaseLayout();

    // Add Section
    layout = addSection(layout, { title: 'Nova Seção', description: 'Desc' });
    expect(layout.sections.length).toBe(3);
    const addedSec = layout.sections[2];
    expect(addedSec.title).toBe('Nova Seção');

    // Rename Section
    layout = renameSection(layout, addedSec.id, 'Seção Renomeada');
    expect(layout.sections[2].title).toBe('Seção Renomeada');

    // Move Section up
    layout = moveSection(layout, addedSec.id, 'up');
    expect(layout.sections[1].title).toBe('Seção Renomeada');

    // Remove Section
    layout = removeSection(layout, addedSec.id);
    expect(layout.sections.length).toBe(2);
  });

  it('invariante fundamental: removeDatumFromBlock apenas remove referência visual, sem deletar o datum', () => {
    let layout = createBaseLayout();

    // Remove d1 do block-1
    layout = removeDatumFromBlock(layout, 'block-1', 'd1');

    const block1 = layout.blocks['block-1'] as FactGridBlockDef;
    expect(block1.datumIds).not.toContain('d1');
    expect(block1.datumIds).toContain('d2');

    // Adiciona d1 de volta
    layout = addDatumToBlock(layout, 'block-1', 'd1');
    const block1Restored = layout.blocks['block-1'] as FactGridBlockDef;
    expect(block1Restored.datumIds).toContain('d1');
  });

  it('permite adicionar, renomear, mover e remover blocos de seções', () => {
    let layout = createBaseLayout();

    // Add Block
    layout = addBlock(layout, 'sec-1', {
      id: 'block-extra',
      kind: 'text_note',
      title: 'Nota de Teste',
      content: 'Conteúdo'
    });
    expect(layout.sections[0].blockIds).toContain('block-extra');

    // Rename Block
    layout = renameBlock(layout, 'block-extra', 'Nota Atualizada');
    const renamedBlock = layout.blocks['block-extra'];
    expect(renamedBlock && renamedBlock.kind === 'text_note' && renamedBlock.title).toBe('Nota Atualizada');

    // Move Block para sec-2
    layout = moveBlock(layout, 'block-extra', 'sec-2');
    expect(layout.sections[0].blockIds).not.toContain('block-extra');
    expect(layout.sections[1].blockIds).toContain('block-extra');

    // Remove Block
    layout = removeBlock(layout, 'sec-2', 'block-extra');
    expect(layout.sections[1].blockIds).not.toContain('block-extra');
    expect(layout.blocks['block-extra']).toBeUndefined();

    // Reorder Sections
    layout = reorderSections(layout, ['sec-2', 'sec-1']);
    expect(layout.sections[0].id).toBe('sec-2');
    expect(layout.sections[1].id).toBe('sec-1');
  });

  it('cria tabela técnica customizada e associa à seção', () => {
    let layout = createBaseLayout();

    layout = createCustomTable(layout, 'sec-1', {
      id: 'custom-tbl-1',
      title: 'Tabela de Compatibilidade',
      columns: [{ id: 'col-1', label: 'Item' }],
      rows: [{ id: 'row-1', label: 'Opção 1', order: 0 }],
      cells: {}
    });

    const sec1 = layout.sections.find((s) => s.id === 'sec-1');
    expect(sec1!.blockIds.some((id) => id.includes('custom-tbl-1'))).toBe(true);
  });

  it('gerencia staging de alterações técnicas sem mutar banco live', () => {
    let draft: WorkspaceEditDraft = {
      productId: 'PROD-1',
      stagedDatumChanges: {}
    };

    draft = stageDatumChange(draft, {
      datumId: 'd1',
      semanticKey: 'metrology.temperature.range',
      oldValue: { type: 'quantity', amount: 100, unit: '°C' },
      newValue: { type: 'quantity', amount: 120, unit: '°C' },
      reason: 'Atualização de especificação',
      stagedAt: '2026-09-04T05:00:00Z'
    });

    expect(draft.stagedDatumChanges['d1']).toBeDefined();
    expect(draft.stagedDatumChanges['d1'].newValue).toEqual({
      type: 'quantity',
      amount: 120,
      unit: '°C'
    });

    draft = discardDatumChange(draft, 'd1');
    expect(draft.stagedDatumChanges['d1']).toBeUndefined();
  });

  it('atualiza rótulos humanos e aliases sem tocar na chave canônica', () => {
    let layout = createBaseLayout();

    layout = updateDescriptorDisplayLabel(layout, 'metrology.temperature.stability', 'Estabilidade Térmica');
    layout = addDescriptorAliasCommand(layout, 'metrology.temperature.stability', 'Deriva Térmica');

    const desc = layout.semanticDescriptors!['metrology.temperature.stability'];
    expect(desc.displayLabel).toBe('Estabilidade Térmica');
    expect(desc.aliases).toContain('Deriva Térmica');
    expect(desc.canonicalKey).toBe('metrology.temperature.stability');
  });
});
