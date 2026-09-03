// tests/components/specs-table-inspector-command.test.tsx
// Suíte de Testes Canônicos de Produção: CORE.T2C.1
// TABLE CORE SPECS PILOT — SELECTION + INSPECTOR + COMMAND DISPATCH
// Valida o ciclo completo:
// Canvas -> Selection -> Inspector -> Typed Command -> Mutation -> Re-adaptation -> TableCoreRenderer -> CleanA4

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { A4Canvas } from '../../src/components/editor/A4Canvas';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';
import { PropertiesPanel } from '../../src/components/editor/PropertiesPanel';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { useLibraryStore } from '../../src/stores/useLibraryStore';
import { Catalog } from '../../src/domain/catalog.schema';
import {
  adaptLegacyBlockToTableCore,
  executeTableCommandOnLegacyBlock,
  LegacyBridgeCommandContext
} from '../../src/domain/table-core';
import { TableSetCellContentCommand } from '../../src/domain/document-commands/table-commands.types';

// Mock de localStorage e WebCrypto
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

// Mock de IntersectionObserver para A4Canvas
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


describe('Table Core V2: Selection, Inspector & Command Dispatch (CORE.T2C.1)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const mockProductTA25N = {
    id: 'prod_ta25n_uuid',
    code: 'TA-25N',
    model: 'TA-25N',
    family: 'Termometria',
    description: 'Calibrador de Temperatura',
    specs: {
      range: '-25 a 140 °C',
      accuracy: '± 0,1 °C',
      unit: '°C',
      output: '4-20 mA',
      powerSupply: '220 VAC',
      processConnection: '1/2" NPT',
      protectionDegree: 'IP65',
      customSpecs: {
        estabilidade: '± 0,05 °C',
        resolucao: '0,01 °C'
      }
    },
    imageUrl: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1
  };

  const mockProductTA50N = {
    id: 'prod_ta50n_uuid',
    code: 'TA-50N',
    model: 'TA-50N',
    family: 'Termometria',
    description: 'Calibrador de Alta Temperatura',
    specs: {
      range: '50 a 500 °C',
      accuracy: '± 0,2 °C',
      unit: '°C',
      output: '4-20 mA',
      powerSupply: '220 VAC',
      processConnection: '1/2" NPT',
      protectionDegree: 'IP65',
      customSpecs: {
        estabilidade: '± 0,08 °C',
        resolucao: '0,01 °C'
      }
    },
    imageUrl: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1
  };

  const createPilotCatalog = (): Catalog => ({
    id: 'cat_t2c_pilot',
    title: 'Catálogo Piloto Table Core V2 - Fase T2C.1',
    themeId: 'default',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1,
    pages: [
      {
        id: 'page_t2c_1',
        pageNumber: 1,
        title: 'Especificações Técnicas',
        blocks: [
          {
            id: 'blk_t2c_specs',
            type: 'specs_table',
            title: 'Tabela de Calibradores',
            tableColumns: [
              { key: 'code', label: 'Código', visible: true },
              { key: 'range', label: 'Faixa Operacional', visible: true },
              { key: 'accuracy', label: 'Exatidão', visible: true }
            ],
            tableRows: [
              {
                id: 'row_1_ta25n',
                productRefId: 'prod_ta25n_uuid',
                localOverrides: {
                  accuracy: '± 0,08 °C (Override Calibrado)'
                }
              },
              {
                id: 'row_2_ta50n',
                productRefId: 'prod_ta50n_uuid',
                localOverrides: {}
              },
              {
                id: 'row_3_custom',
                localOverrides: {
                  code: 'CUSTOM-01',
                  range: '0 a 100 °C'
                  // accuracy está omitido -> célula vazia intencional
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

    // Configura o Library Store com os produtos mock
    useLibraryStore.setState({
      products: [mockProductTA25N, mockProductTA50N],
      families: []
    });

    // Configura o Catalog Store com o catálogo do piloto
    const catalog = createPilotCatalog();
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
  // T2C-SELECT-1: Clicar na célula seleciona exatamente sua identidade estável
  // =========================================================================
  it('T2C-SELECT-1: clicar na célula seleciona exatamente sua identidade estável', () => {
    renderComponent(<A4Canvas />);

    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    expect(adaptRes.supported).toBe(true);
    if (!adaptRes.supported) return;

    // Encontra a célula row_1_ta25n, coluna range via bridge
    const cellMapping = adaptRes.bridge.getByLegacyCoordinates('row_1_ta25n', 'range');
    expect(cellMapping).toBeDefined();
    const targetCellId = cellMapping!.cellId;

    // Localiza o elemento td no DOM com data-cell-id
    const cellEl = container.querySelector(`td[data-cell-id="${targetCellId}"]`) as HTMLTableCellElement;
    expect(cellEl).not.toBeNull();

    // Simula o clique na célula
    act(() => {
      cellEl.click();
    });

    // Valida que o store registrou selectedBlockId e selectedChildId estáveis
    const state = useCatalogStore.getState();
    expect(state.selectedBlockId).toBe('blk_t2c_specs');
    expect(state.selectedChildId).toBe(targetCellId);

    // Valida que o TableCoreRenderer marcou a célula com anel visual de seleção
    expect(cellEl.className).toContain('outline-blue-500');
  });

  // =========================================================================
  // T2C-SELECT-2: Selecionar não muta documento/store
  // =========================================================================
  it('T2C-SELECT-2: selecionar célula não muta documento nem incrementa revisão', () => {
    const catalogBefore = JSON.parse(JSON.stringify(useCatalogStore.getState().currentCatalog));
    const revisionBefore = useCatalogStore.getState().localRevision;

    renderComponent(<A4Canvas />);

    const block = catalogBefore.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;

    const cellMapping = adaptRes.bridge.getByLegacyCoordinates('row_2_ta50n', 'range');
    const cellEl = container.querySelector(`td[data-cell-id="${cellMapping!.cellId}"]`) as HTMLTableCellElement;

    act(() => {
      cellEl.click();
    });

    const stateAfter = useCatalogStore.getState();
    expect(stateAfter.localRevision).toBe(revisionBefore);
    expect(stateAfter.isDirty).toBe(false);

    // O catálogo permaneceu estritamente idêntico
    expect(stateAfter.currentCatalog).toEqual(catalogBefore);
  });

  // =========================================================================
  // T2C-EDIT-1: Editar override pelo Inspector produz command e altera a célula correta
  // =========================================================================
  it('T2C-EDIT-1: editar override pelo Inspector produz command e altera a célula correta', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;

    // Seleciona a célula row_1_ta25n, accuracy (que possui override)
    const cellMapping = adaptRes.bridge.getByLegacyCoordinates('row_1_ta25n', 'accuracy')!;
    useCatalogStore.getState().selectEditorElement({
      blockId: block.id,
      childId: cellMapping.cellId
    });

    renderComponent(<PropertiesPanel />);

    // Verifica que o Inspector de célula foi montado
    const cellInspector = container.querySelector('[data-testid="specs-table-cell-inspector"]');
    expect(cellInspector).not.toBeNull();

    // Encontra o input de edição de valor
    const input = cellInspector!.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('± 0,08 °C (Override Calibrado)');

    // Altera o valor no input
    act(() => {
      fireEvent.change(input, { target: { value: '± 0,03 °C (Super Aferido)' } });
    });

    // Clica no botão Aplicar
    const applyBtn = cellInspector!.querySelector('button[title*="Salvar"]') as HTMLButtonElement;
    act(() => {
      applyBtn.click();
    });

    // Verifica que o Store legado recebeu o override na célula correta
    const updatedCatalog = useCatalogStore.getState().currentCatalog!;
    const updatedBlock = updatedCatalog.pages[0].blocks[0];
    const updatedRow = updatedBlock.tableRows?.find((r) => r.id === 'row_1_ta25n');
    expect(updatedRow?.localOverrides?.accuracy).toBe('± 0,03 °C (Super Aferido)');
    expect(useCatalogStore.getState().localRevision).toBe(1);
  });

  // =========================================================================
  // T2C-EDIT-2: Outra célula/linha não é alterada
  // =========================================================================
  it('T2C-EDIT-2: edição pontual de override preserva estritamente todas as outras células e linhas', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;

    const cellMapping = adaptRes.bridge.getByLegacyCoordinates('row_1_ta25n', 'accuracy')!;
    useCatalogStore.getState().selectEditorElement({
      blockId: block.id,
      childId: cellMapping.cellId
    });

    renderComponent(<PropertiesPanel />);

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: '± 0,01 °C (Modificado)' } });
    });

    const applyBtn = container.querySelector('button[title*="Salvar"]') as HTMLButtonElement;
    act(() => {
      applyBtn.click();
    });

    const updatedBlock = useCatalogStore.getState().currentCatalog!.pages[0].blocks[0];
    const row2 = updatedBlock.tableRows?.find((r) => r.id === 'row_2_ta50n');
    const row3 = updatedBlock.tableRows?.find((r) => r.id === 'row_3_custom');

    // Linha 2 permaneceu intacta (sem overrides)
    expect(row2?.localOverrides).toEqual({});

    // Linha 3 permaneceu intacta (apenas code e range)
    expect(row3?.localOverrides).toEqual({
      code: 'CUSTOM-01',
      range: '0 a 100 °C'
    });
  });

  // =========================================================================
  // T2C-BINDING-1: Binding de produto permanece binding enquanto não existir override explícito
  // =========================================================================
  it('T2C-BINDING-1: binding de produto permanece binding dinâmico enquanto não existir override explícito', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;

    // Seleciona a célula row_2_ta50n, coluna range (vinculada à biblioteca, sem override)
    const cellMapping = adaptRes.bridge.getByLegacyCoordinates('row_2_ta50n', 'range')!;
    useCatalogStore.getState().selectEditorElement({
      blockId: block.id,
      childId: cellMapping.cellId
    });

    renderComponent(<PropertiesPanel />);

    // Verifica que o Inspector identificou como dado da biblioteca
    expect(container.textContent).toContain('Dado da Biblioteca');
    expect(container.textContent).toContain('Valor resolvido dinamicamente da Biblioteca de Produtos');

    // Verifica que o store NÃO possui override para essa célula
    const row2 = useCatalogStore.getState().currentCatalog!.pages[0].blocks[0].tableRows![1];
    expect(row2.localOverrides?.range).toBeUndefined();
  });

  // =========================================================================
  // T2C-RESTORE-1: Restore remove override e volta a resolver dado da Library
  // =========================================================================
  it('T2C-RESTORE-1: restore remove override via command explícito e volta a resolver dado da Library', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;

    // row_1_ta25n, accuracy possui override '± 0,08 °C (Override Calibrado)'
    const cellMapping = adaptRes.bridge.getByLegacyCoordinates('row_1_ta25n', 'accuracy')!;
    useCatalogStore.getState().selectEditorElement({
      blockId: block.id,
      childId: cellMapping.cellId
    });

    renderComponent(<PropertiesPanel />);

    // Botão de restaurar deve estar visível
    const restoreBtn = container.querySelector('button[title*="Remove o override"]') as HTMLButtonElement;
    expect(restoreBtn).not.toBeNull();
    expect(restoreBtn.textContent).toContain('Restaurar Padrão da Biblioteca');

    // Executa o restore
    act(() => {
      restoreBtn.click();
    });

    // Verifica que o override foi removido do store legado
    const updatedBlock = useCatalogStore.getState().currentCatalog!.pages[0].blocks[0];
    const row1 = updatedBlock.tableRows?.find((r) => r.id === 'row_1_ta25n');
    expect(row1?.localOverrides?.accuracy).toBeUndefined();

    // Re-adapta o bloco e confirma que o datum agora resolve para o valor original da biblioteca
    const reAdapted = adaptLegacyBlockToTableCore(updatedBlock);
    expect(reAdapted.supported).toBe(true);
    if (reAdapted.supported) {
      const restoredCell = reAdapted.bridge.getByLegacyCoordinates('row_1_ta25n', 'accuracy');
      expect(restoredCell?.content.kind).toBe('datum_reference');
    }
  });

  // =========================================================================
  // T2C-NO-GHOST-1: Empty/missing datum não materializa conteúdo inventado
  // =========================================================================
  it('T2C-NO-GHOST-1: célula vazia não materializa conteúdo inventado e esconde botão de restore', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;

    // row_3_custom, accuracy é intencionalmente vazia (sem productRefId e sem override)
    const cellMapping = adaptRes.bridge.getByLegacyCoordinates('row_3_custom', 'accuracy')!;
    expect(cellMapping.content.kind).toBe('empty');

    useCatalogStore.getState().selectEditorElement({
      blockId: block.id,
      childId: cellMapping.cellId
    });

    renderComponent(<PropertiesPanel />);

    expect(container.textContent).toContain('Célula Vazia');

    // O botão de restaurar NUNCA deve ser exibido para célula sem produto
    const restoreBtn = container.querySelector('button[title*="Remove o override"]');
    expect(restoreBtn).toBeNull();
  });

  // =========================================================================
  // T2C-EXPORT-1: CleanA4 não recebe atributos/handlers de edição
  // =========================================================================
  it('T2C-EXPORT-1: CleanA4Document não recebe atributos/handlers interativos de seleção', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    renderComponent(<CleanA4Document document={catalog} />);

    // Modo export: data-cell-id interativo NÃO deve ser renderizado
    const interactiveCell = container.querySelector('td[data-cell-id]');
    expect(interactiveCell).toBeNull();

    // Modo export: outline de seleção azul não deve existir
    expect(container.innerHTML).not.toContain('outline-blue-500');
  });

  // =========================================================================
  // T2C-PARITY-1: Após edição legítima, Editor e CleanA4 apresentam o mesmo printable content
  // =========================================================================
  it('T2C-PARITY-1: após edição legítima, Editor e CleanA4 apresentam o mesmo printable content', () => {
    // 1. Aplica override no store
    useCatalogStore.getState().updateCellOverride('blk_t2c_specs', 'row_1_ta25n', 'range', '-30 a 150 °C (Personalizado)');

    // 2. Renderiza no Editor
    renderComponent(<A4Canvas />);
    const editorText = container.textContent || '';
    act(() => {
      root?.unmount();
      root = null;
    });

    // 3. Renderiza no CleanA4Document
    const updatedCatalog = useCatalogStore.getState().currentCatalog!;
    renderComponent(<CleanA4Document document={updatedCatalog} />);
    const exportText = container.textContent || '';

    // Ambas as superfícies renderizam o dado modificado
    expect(editorText).toContain('-30 a 150 °C (Personalizado)');
    expect(exportText).toContain('-30 a 150 °C (Personalizado)');
  });

  // =========================================================================
  // T2C-COMMAND-1: Mutation não ocorre diretamente dentro do renderer
  // =========================================================================
  it('T2C-COMMAND-1: mutation é estritamente externa ao renderer e requer command executor', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;

    const mockUpdateOverride = vi.fn();
    const mockRestoreOverride = vi.fn();

    const context: LegacyBridgeCommandContext = {
      block,
      bridge: adaptRes.bridge,
      onUpdateOverride: mockUpdateOverride,
      onRestoreOverride: mockRestoreOverride
    };

    // Comando tipado legítimo
    const cmd: TableSetCellContentCommand = {
      type: 'TABLE_SET_CELL_CONTENT',
      tableId: adaptRes.bridge.tableId,
      rowId: adaptRes.table.rows[0].id,
      columnId: adaptRes.table.columns[0].id,
      content: { kind: 'text', text: 'Novo Código TA-25N-EX' },
      origin: 'inspector'
    };

    const res = executeTableCommandOnLegacyBlock(cmd, context);
    expect(res.success).toBe(true);
    expect(mockUpdateOverride).toHaveBeenCalledWith('row_1_ta25n', 'code', 'Novo Código TA-25N-EX');
    expect(mockRestoreOverride).not.toHaveBeenCalled();
  });

  // =========================================================================
  // T2C-LEGACY-REGRESSION-1: Capacidades legadas não migradas continuam acessíveis
  // =========================================================================
  it('T2C-LEGACY-REGRESSION-1: capacidades legadas (título, colunas, legenda) continuam acessíveis', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];

    // Seleciona a tabela inteira (sem célula selecionada)
    useCatalogStore.getState().selectEditorElement({
      blockId: block.id,
      childId: null
    });

    renderComponent(<PropertiesPanel />);

    // Verifica que a vista global da tabela foi montada
    const globalInspector = container.querySelector('[data-testid="specs-table-global-inspector"]');
    expect(globalInspector).not.toBeNull();

    // Título da tabela editável
    const titleInput = globalInspector!.querySelector('input[placeholder*="Tabela"]') as HTMLInputElement;
    expect(titleInput).not.toBeNull();
    expect(titleInput.value).toBe('Tabela de Calibradores');

    // Botão de Nova Coluna presente
    expect(globalInspector!.textContent).toContain('Personalizar Colunas');
    expect(globalInspector!.textContent).toContain('Nova Coluna');
  });
});
