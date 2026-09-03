// tests/components/specs-table-hardening.test.tsx
// Suíte de Testes Canônicos de Hardening: CORE.T2C.2
// TABLE CORE PILOT HARDENING — BRIDGE COLLISION, UNIFIED RESTORE, STALE SELECTION & LIVE BINDING

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { PropertiesPanel } from '../../src/components/editor/PropertiesPanel';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { useLibraryStore } from '../../src/stores/useLibraryStore';
import { Catalog, ContentBlock } from '../../src/domain/catalog.schema';
import {
  adaptLegacyBlockToTableCore,
  buildLegacyTableCoordinateBridge,
  executeTableCommandOnLegacyBlock,
  LegacyBridgeCommandContext,
  LegacyCellCoordinateMapping
} from '../../src/domain/table-core';
import {
  TableSetCellContentCommand
} from '../../src/domain/document-commands/table-commands.types';
import { executeTableCommand } from '../../src/domain/document-commands/table-command.executor';

// Mock de localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock de matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});

// Mock de IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver
});

describe('Table Core Pilot Hardening (CORE.T2C.2)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const mockProduct = {
    id: 'prod_test_hardening',
    code: 'HARD-01',
    model: 'HARD-01',
    family: 'Termometria',
    description: 'Calibrador de Teste',
    specs: {
      range: '0 a 100 °C',
      accuracy: '± 0.05 °C',
      unit: '°C',
      output: '4-20 mA',
      powerSupply: '220 VAC',
      processConnection: '1/2" NPT',
      protectionDegree: 'IP65',
      customSpecs: {}
    },
    imageUrl: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1
  };

  const createHardeningCatalog = (): Catalog => ({
    id: 'cat_hardening',
    title: 'Catálogo de Teste Hardening',
    themeId: 'default',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1,
    pages: [
      {
        id: 'page_h1',
        pageNumber: 1,
        title: 'Página Hardening',
        blocks: [
          {
            id: 'blk_h_specs',
            type: 'specs_table',
            title: 'Tabela Hardening',
            tableColumns: [
              { key: 'code', label: 'Código', visible: true },
              { key: 'range', label: 'Faixa', visible: true },
              { key: 'accuracy', label: 'Exatidão', visible: true }
            ],
            tableRows: [
              {
                id: 'row_h1',
                productRefId: 'prod_test_hardening',
                localOverrides: {
                  accuracy: '± 0.01 °C (Override Inicial)'
                }
              }
            ]
          }
        ]
      }
    ]
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    useLibraryStore.setState({
      products: [mockProduct],
      families: []
    });

    const catalog = createHardeningCatalog();
    useCatalogStore.setState({
      currentCatalog: catalog,
      activePageIndex: 0,
      selectedBlockId: null,
      selectedChildId: null,
      localRevision: 0,
      isDirty: false
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  const renderComponent = (ui: React.ReactElement) => {
    act(() => {
      root = createRoot(container);
      root.render(ui);
    });
  };

  // =========================================================================
  // T2C-BRIDGE-COLLISION-1: IDs com delimitadores não colidem (adversarial)
  // =========================================================================
  it('T2C-BRIDGE-COLLISION-1: IDs adversariais row "a:b", col "c" e row "a", col "b:c" não colidem', () => {
    const block: ContentBlock = {
      id: 'blk_collision_test',
      type: 'specs_table',
      title: 'Teste de Colisão',
      tableColumns: [],
      tableRows: []
    };

    // Par adversarial 1: row "a:b", col "c"
    const mapping1: LegacyCellCoordinateMapping = {
      cellId: 'cell_adv_1',
      rowId: 'a:b',
      columnId: 'c',
      legacyBlockId: 'blk_collision_test',
      legacyRowId: 'leg_row_a:b',
      legacyColKey: 'c',
      content: { kind: 'text', text: 'Conteúdo 1' },
      isOverride: false,
      hasProductBinding: false
    };

    // Par adversarial 2: row "a", col "b:c"
    const mapping2: LegacyCellCoordinateMapping = {
      cellId: 'cell_adv_2',
      rowId: 'a',
      columnId: 'b:c',
      legacyBlockId: 'blk_collision_test',
      legacyRowId: 'leg_row_a',
      legacyColKey: 'b:c',
      content: { kind: 'text', text: 'Conteúdo 2' },
      isOverride: false,
      hasProductBinding: false
    };

    const bridge = buildLegacyTableCoordinateBridge(block, 'table_adv', [mapping1, mapping2]);

    // Lookup por coordenadas TableCore (length-prefixed via getCellKey)
    const lookedUp1 = bridge.getByCoordinates('a:b', 'c');
    const lookedUp2 = bridge.getByCoordinates('a', 'b:c');

    expect(lookedUp1).toBeDefined();
    expect(lookedUp1?.cellId).toBe('cell_adv_1');
    expect(lookedUp1?.content).toEqual({ kind: 'text', text: 'Conteúdo 1' });

    expect(lookedUp2).toBeDefined();
    expect(lookedUp2?.cellId).toBe('cell_adv_2');
    expect(lookedUp2?.content).toEqual({ kind: 'text', text: 'Conteúdo 2' });

    // Lookup por coordenadas legadas (nested map)
    const lookedUpLeg1 = bridge.getByLegacyCoordinates('leg_row_a:b', 'c');
    const lookedUpLeg2 = bridge.getByLegacyCoordinates('leg_row_a', 'b:c');

    expect(lookedUpLeg1).toBeDefined();
    expect(lookedUpLeg1?.cellId).toBe('cell_adv_1');

    expect(lookedUpLeg2).toBeDefined();
    expect(lookedUpLeg2?.cellId).toBe('cell_adv_2');

    // Casos cruzados inexistentes retornam estritamente undefined (zero falso positivo)
    expect(bridge.getByCoordinates('a', 'c')).toBeUndefined();
    expect(bridge.getByCoordinates('a:b', 'b:c')).toBeUndefined();
    expect(bridge.getByLegacyCoordinates('leg_row_a', 'c')).toBeUndefined();
  });

  // =========================================================================
  // T2C-BRIDGE-BLOCK-1: Bridge de bloco A não executa mutation em bloco B
  // =========================================================================
  it('T2C-BRIDGE-BLOCK-1: bridge de bloco A falha fechada se executada com contexto do bloco B', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const blockA = catalog.pages[0].blocks[0];
    const adaptResA = adaptLegacyBlockToTableCore(blockA);
    if (!adaptResA.supported) return;

    const blockB: ContentBlock = {
      id: 'blk_b_divergent',
      type: 'specs_table',
      title: 'Bloco B',
      tableColumns: [],
      tableRows: []
    };

    const mockUpdate = vi.fn();
    const mockRestore = vi.fn();

    // Contexto com bloco B mas bridge do bloco A
    const divergentContext: LegacyBridgeCommandContext = {
      block: blockB,
      bridge: adaptResA.bridge,
      onUpdateOverride: mockUpdate,
      onRestoreOverride: mockRestore
    };

    const cmd: TableSetCellContentCommand = {
      type: 'TABLE_SET_CELL_CONTENT',
      tableId: adaptResA.bridge.tableId,
      rowId: adaptResA.table.rows[0].id,
      columnId: adaptResA.table.columns[0].id,
      content: { kind: 'text', text: 'Valor Intruso' },
      origin: 'inspector'
    };

    const res = executeTableCommandOnLegacyBlock(cmd, divergentContext);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.errorCode).toBe('BLOCK_MISMATCH');
    }
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRestore).not.toHaveBeenCalled();
  });

  // =========================================================================
  // T2C-BRIDGE-STALE-1: cellId removido não resolve para outra célula
  // =========================================================================
  it('T2C-BRIDGE-STALE-1: cellId removido não resolve para outra célula e Inspector fail-closed', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;

    // Seleção de um cellId fictício/removido
    const staleCellId = 'cell_removed_previously_999';
    expect(adaptRes.bridge.getByCellId(staleCellId)).toBeUndefined();

    useCatalogStore.getState().selectEditorElement({
      blockId: block.id,
      childId: staleCellId
    });

    // Renderiza o painel com a seleção stale
    renderComponent(<PropertiesPanel />);

    // Não deve crashar e deve renderizar a visualização global da tabela (fallback fail-closed)
    const globalInspector = container.querySelector('[data-testid="specs-table-global-inspector"]');
    expect(globalInspector).not.toBeNull();
    expect(container.querySelector('[data-testid="specs-table-cell-inspector"]')).toBeNull();
  });

  // =========================================================================
  // T2C-RESTORE-SEMANTICS-1: Restore produz exatamente o binding canônico original
  // =========================================================================
  it('T2C-RESTORE-SEMANTICS-1: restore produz exatamente o binding canônico original via TABLE_SET_CELL_CONTENT', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;

    // row_h1, accuracy tem override '± 0.01 °C (Override Inicial)'
    const cellMapping = adaptRes.bridge.getByLegacyCoordinates('row_h1', 'accuracy')!;
    expect(cellMapping.isOverride).toBe(true);
    expect(cellMapping.canonicalBoundContent).toEqual({
      kind: 'datum_reference',
      productId: 'prod_test_hardening',
      datumKey: 'legacy.product_field.accuracy',
      bindingMode: 'live'
    });

    const mockRestore = vi.fn();
    const context: LegacyBridgeCommandContext = {
      block,
      bridge: adaptRes.bridge,
      onUpdateOverride: vi.fn(),
      onRestoreOverride: mockRestore
    };

    // Comando tipado de restauração: TABLE_SET_CELL_CONTENT com o canonicalBoundContent
    const restoreCmd: TableSetCellContentCommand = {
      type: 'TABLE_SET_CELL_CONTENT',
      tableId: adaptRes.bridge.tableId,
      rowId: cellMapping.rowId,
      columnId: cellMapping.columnId,
      content: cellMapping.canonicalBoundContent!,
      origin: 'inspector'
    };

    const result = executeTableCommandOnLegacyBlock(restoreCmd, context);
    expect(result.success).toBe(true);
    expect(mockRestore).toHaveBeenCalledWith('row_h1', 'accuracy');
  });

  // =========================================================================
  // T2C-RESTORE-SEMANTICS-2: Native TableCore e Legacy Bridge representam a mesma intenção
  // =========================================================================
  it('T2C-RESTORE-SEMANTICS-2: native TableCore e legacy bridge executam a mesma intenção semântica com TABLE_SET_CELL_CONTENT', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;

    const cellMapping = adaptRes.bridge.getByLegacyCoordinates('row_h1', 'accuracy')!;
    const boundContent = cellMapping.canonicalBoundContent!;

    const cmd: TableSetCellContentCommand = {
      type: 'TABLE_SET_CELL_CONTENT',
      tableId: adaptRes.bridge.tableId,
      rowId: cellMapping.rowId,
      columnId: cellMapping.columnId,
      content: boundContent,
      origin: 'inspector'
    };

    // 1. Execução no modelo nativo TableCore
    const nativeRes = executeTableCommand(adaptRes.table, cmd);
    expect(nativeRes.success).toBe(true);
    if (nativeRes.success) {
      const cell = nativeRes.data.cells[`r${cellMapping.rowId.length}:${cellMapping.rowId}|c${cellMapping.columnId.length}:${cellMapping.columnId}`];
      expect(cell.content).toEqual(boundContent);
    }

    // 2. Execução na Legacy Bridge
    const mockRestore = vi.fn();
    const legacyRes = executeTableCommandOnLegacyBlock(cmd, {
      block,
      bridge: adaptRes.bridge,
      onUpdateOverride: vi.fn(),
      onRestoreOverride: mockRestore
    });
    expect(legacyRes.success).toBe(true);
    expect(mockRestore).toHaveBeenCalledWith('row_h1', 'accuracy');
  });

  // =========================================================================
  // T2C-RESTORE-ATTACK-1: datum_reference adulterado é rejeitado com fail-closed
  // =========================================================================
  it('T2C-RESTORE-ATTACK-1: datum_reference adulterado para outro productId ou datumKey é estritamente rejeitado', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;

    const cellMapping = adaptRes.bridge.getByLegacyCoordinates('row_h1', 'accuracy')!;

    const mockRestore = vi.fn();
    const context: LegacyBridgeCommandContext = {
      block,
      bridge: adaptRes.bridge,
      onUpdateOverride: vi.fn(),
      onRestoreOverride: mockRestore
    };

    // Ataque 1: productId adulterado
    const attackCmd1: TableSetCellContentCommand = {
      type: 'TABLE_SET_CELL_CONTENT',
      tableId: adaptRes.bridge.tableId,
      rowId: cellMapping.rowId,
      columnId: cellMapping.columnId,
      content: {
        kind: 'datum_reference',
        productId: 'prod_malicious_attacker',
        datumKey: 'legacy.product_field.accuracy',
        bindingMode: 'live'
      },
      origin: 'inspector'
    };

    const res1 = executeTableCommandOnLegacyBlock(attackCmd1, context);
    expect(res1.success).toBe(false);
    if (!res1.success) {
      expect(res1.errorCode).toBe('BINDING_MISMATCH');
    }
    expect(mockRestore).not.toHaveBeenCalled();

    // Ataque 2: datumKey adulterado
    const attackCmd2: TableSetCellContentCommand = {
      type: 'TABLE_SET_CELL_CONTENT',
      tableId: adaptRes.bridge.tableId,
      rowId: cellMapping.rowId,
      columnId: cellMapping.columnId,
      content: {
        kind: 'datum_reference',
        productId: 'prod_test_hardening',
        datumKey: 'legacy.product_field.unauthorized_key',
        bindingMode: 'live'
      },
      origin: 'inspector'
    };

    const res2 = executeTableCommandOnLegacyBlock(attackCmd2, context);
    expect(res2.success).toBe(false);
    if (!res2.success) {
      expect(res2.errorCode).toBe('BINDING_MISMATCH');
    }
    expect(mockRestore).not.toHaveBeenCalled();
  });

  // =========================================================================
  // T2C-INSPECTOR-LIVE-1: Binding externo atualizado reflete no Inspector sem trocar seleção
  // =========================================================================
  it('T2C-INSPECTOR-LIVE-1: alteração no binding externo da biblioteca sincroniza input do Inspector mantendo a mesma seleção', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];

    // Remove qualquer override prévio para expor o binding live puro
    useCatalogStore.getState().restoreCellToLibrary(block.id, 'row_h1', 'range');

    const adaptRes = adaptLegacyBlockToTableCore(useCatalogStore.getState().currentCatalog!.pages[0].blocks[0]);
    if (!adaptRes.supported) return;

    const cellMapping = adaptRes.bridge.getByLegacyCoordinates('row_h1', 'range')!;
    useCatalogStore.getState().selectEditorElement({
      blockId: block.id,
      childId: cellMapping.cellId
    });

    renderComponent(<PropertiesPanel />);

    const cellInspector = container.querySelector('[data-testid="specs-table-cell-inspector"]');
    expect(cellInspector).not.toBeNull();
    const input = cellInspector!.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe('0 a 100 °C');

    // Simula atualização externa na biblioteca de produtos (ex: sync em tempo real)
    act(() => {
      useLibraryStore.setState({
        products: [
          {
            ...mockProduct,
            specs: {
              ...mockProduct.specs,
              range: '-50 a 150 °C (Atualizado na Biblioteca)'
            }
          }
        ]
      });
    });

    // Sem trocar a seleção da célula, o input do Inspector sincroniza automaticamente
    expect(input.value).toBe('-50 a 150 °C (Atualizado na Biblioteca)');
  });

  // =========================================================================
  // T2C-INSPECTOR-DRAFT-1: Update externo não destrói texto que usuário está digitando
  // =========================================================================
  it('T2C-INSPECTOR-DRAFT-1: alteração externa na biblioteca NÃO destrói o rascunho digitado pelo usuário (isInputDirty)', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    useCatalogStore.getState().restoreCellToLibrary(block.id, 'row_h1', 'range');

    const adaptRes = adaptLegacyBlockToTableCore(useCatalogStore.getState().currentCatalog!.pages[0].blocks[0]);
    if (!adaptRes.supported) return;

    const cellMapping = adaptRes.bridge.getByLegacyCoordinates('row_h1', 'range')!;
    useCatalogStore.getState().selectEditorElement({
      blockId: block.id,
      childId: cellMapping.cellId
    });

    renderComponent(<PropertiesPanel />);

    const cellInspector = container.querySelector('[data-testid="specs-table-cell-inspector"]');
    const input = cellInspector!.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe('0 a 100 °C');

    // O usuário começa a digitar um valor personalizado no input (marcando isInputDirty = true)
    act(() => {
      fireEvent.change(input, { target: { value: 'Meu Rascunho Em Andamento...' } });
    });
    expect(input.value).toBe('Meu Rascunho Em Andamento...');

    // Durante a digitação, a biblioteca externa recebe um update
    act(() => {
      useLibraryStore.setState({
        products: [
          {
            ...mockProduct,
            specs: {
              ...mockProduct.specs,
              range: '0 a 200 °C (Novo da Biblioteca)'
            }
          }
        ]
      });
    });

    // O rascunho do usuário NÃO foi destruído!
    expect(input.value).toBe('Meu Rascunho Em Andamento...');
  });
});
