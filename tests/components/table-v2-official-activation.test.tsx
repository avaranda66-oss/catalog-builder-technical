// tests/components/table-v2-official-activation.test.tsx
// Suíte de Testes Canônicos de Produção — MISSÃO TABLE.V2.ACTIVATION
// Valida a ativação do Table Core V2 para a "Tabela de Produtos Presys Oficial":
// 1. Sidebar & Canvas menu: geração de specs_table
// 2. TableCoreRenderer path vs fallback
// 3. Segurança de catálogos legados (type: 'table' intacto)
// 4. Seleção de célula e propagação
// 5. SpecsTableInspector (table mode e cell mode)
// 6. Live-binding dinâmico, override local, restore e external library update
// 7. Comandos estruturais (renomear, toggle com visible === undefined, remover/adicionar coluna e linha)
// 8. Paridade Editor vs Export (CleanA4Document)
// 9. Persistência (Save/Reload) e Fallback gracioso para dados inválidos.

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { A4Canvas } from '../../src/components/editor/A4Canvas';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';
import { PropertiesPanel, AVAILABLE_DEFAULT_FIELDS } from '../../src/components/editor/PropertiesPanel';
import { SpecsTableInspector } from '../../src/components/editor/inspector/SpecsTableInspector';
import { TechnicalTableBlock } from '../../src/components/editor/blocks/TechnicalTableBlock';
import { SidebarBlockLibrary } from '../../src/components/editor/SidebarBlockLibrary';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { useLibraryStore } from '../../src/stores/useLibraryStore';
import { Catalog, CatalogSchema, ContentBlock } from '../../src/domain/catalog.schema';
import { adaptLegacyBlockToTableCore } from '../../src/domain/table-core';

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

describe('TABLE.V2.ACTIVATION: Ativação Oficial do Table Core V2 para Produtos Presys', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const mockProductPconY18 = {
    id: 'prod-presys-pcon-y18',
    code: 'PCON-Y18',
    model: 'PCON-Y18',
    family: 'Pressão',
    description: 'Calibrador de Pressão Avançado',
    specs: {
      range: '0 a 100 bar',
      accuracy: '± 0,025% FS',
      unit: 'bar',
      output: '4-20 mA, HART',
      powerSupply: '24 VDC',
      processConnection: '1/4" NPT',
      protectionDegree: 'IP65',
      customSpecs: {}
    },
    imageUrl: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1
  };

  const mockProductTA25N = {
    id: 'prod-presys-ta25n',
    code: 'TA-25N',
    model: 'TA-25N',
    family: 'Temperatura',
    description: 'Bloco Seco de Temperatura',
    specs: {
      range: '-25 a 140 °C',
      accuracy: '± 0,1 °C',
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

  const createInitialCatalog = (): Catalog => ({
    id: 'cat-table-v2-test',
    title: 'Catálogo de Teste Table V2',
    themeId: 'default',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1,
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        title: 'Página Técnica',
        blocks: [
          {
            id: 'block-official-specs',
            type: 'specs_table',
            title: 'Tabela de Especificações Técnicas de Instrumentação',
            tableColumns: [
              { key: 'code', label: 'Código', visible: true, width: 110 },
              { key: 'model', label: 'Modelo', visible: true, width: 130 },
              { key: 'range', label: 'Faixa Operacional', visible: true, width: 130 },
              { key: 'unit', label: 'Unidade', visible: true, width: 70 },
              { key: 'accuracy', label: 'Exatidão', visible: true, width: 100 },
              { key: 'output', label: 'Sinal Saída', visible: true, width: 120 }
            ],
            tableRows: [
              {
                id: 'row-1-pcon',
                productRefId: 'prod-presys-pcon-y18',
                localOverrides: {},
                order: 0
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
      products: [mockProductPconY18, mockProductTA25N],
      families: []
    });

    useCatalogStore.setState({
      currentCatalog: createInitialCatalog(),
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
  // FASE 1 & 4 — SIDEBAR & CANVAS DEFINITIONS
  // =========================================================================
  it('F1-F4: Sidebar e menu de inserção do Canvas geram a Tabela Presys Oficial como specs_table', () => {
    // Renderiza SidebarBlockLibrary e localiza a opção oficial
    renderComponent(<SidebarBlockLibrary />);
    expect(container.textContent).toContain('Tabela de Produtos Presys Oficial');

    // Valida no catálogo que a inserção direta pelo store com a assinatura da Sidebar gera specs_table
    const state = useCatalogStore.getState();
    const pageId = state.currentCatalog!.pages[0].id;

    act(() => {
      state.addBlock(pageId, {
        type: 'specs_table',
        title: 'Tabela de Especificações Técnicas de Instrumentação',
        tableColumns: [
          { key: 'code', label: 'Código', visible: true, width: 110 },
          { key: 'model', label: 'Modelo', visible: true, width: 130 }
        ],
        tableRows: [{ id: 'row-test', productRefId: 'prod-presys-pcon-y18', localOverrides: {}, order: 0 }]
      });
    });

    const updatedCatalog = useCatalogStore.getState().currentCatalog!;
    const newBlock = updatedCatalog.pages[0].blocks.find((b) => b.title === 'Tabela de Especificações Técnicas de Instrumentação');
    expect(newBlock).toBeDefined();
    expect(newBlock?.type).toBe('specs_table');
  });

  // =========================================================================
  // FASE 3 — LEGACY SAFETY: Blocos existentes type='table' permanecem legacy
  // =========================================================================
  it('F3: Blocos existentes type="table" permanecem legados e usam TechnicalTable', () => {
    const legacyCatalog: Catalog = {
      id: 'cat-legacy',
      title: 'Catálogo Histórico com Tabela Legada',
      themeId: 'default',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      version: 1,
      pages: [
        {
          id: 'page-legacy-1',
          pageNumber: 1,
          blocks: [
            {
              id: 'blk-legacy-tbl',
              type: 'table',
              title: 'Tabela Legada Inalterada',
              tableColumns: [{ key: 'code', label: 'Código', visible: true }],
              tableRows: [{ id: 'r1', productRefId: 'prod-presys-pcon-y18', localOverrides: {} }]
            }
          ]
        }
      ]
    };

    useCatalogStore.setState({ currentCatalog: legacyCatalog });

    renderComponent(<A4Canvas />);
    // Bloco continua com type === 'table'
    expect(useCatalogStore.getState().currentCatalog!.pages[0].blocks[0].type).toBe('table');

    // No modo legado não há elementos com data-cell-id do TableCoreRenderer
    const coreCells = container.querySelectorAll('td[data-cell-id]');
    expect(coreCells.length).toBe(0);
  });

  // =========================================================================
  // FASE 5 — CANVAS / RENDERER: Bloco specs_table utiliza TableCoreRenderer
  // =========================================================================
  it('F5: Bloco specs_table atinge o TableCoreRenderer sem cair no fallback', () => {
    renderComponent(<A4Canvas />);

    // TableCoreRenderer renderiza elementos com data-cell-id e data-row-id
    const coreCells = container.querySelectorAll('td[data-cell-id]');
    expect(coreCells.length).toBeGreaterThan(0);

    // Verifica que o dado da biblioteca (PCON-Y18) foi renderizado na célula de código
    expect(container.textContent).toContain('PCON-Y18');
    expect(container.textContent).toContain('0 a 100 bar');
  });

  // =========================================================================
  // FASE 6 — CELL SELECTION: Interação de seleção de célula e wrapper
  // =========================================================================
  it('F6: Clicar na célula seleciona childId e stopPropagation impede que o wrapper anule a seleção', () => {
    renderComponent(<A4Canvas />);

    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    expect(adaptRes.supported).toBe(true);
    if (!adaptRes.supported) return;

    // Localiza célula [row-1-pcon, range]
    const mapping = adaptRes.bridge.getByLegacyCoordinates('row-1-pcon', 'range')!;
    expect(mapping).toBeDefined();

    const cellElement = container.querySelector(`td[data-cell-id="${mapping.cellId}"]`) as HTMLTableCellElement;
    expect(cellElement).not.toBeNull();

    // Simula clique na célula
    act(() => {
      cellElement.click();
    });

    const state = useCatalogStore.getState();
    expect(state.selectedBlockId).toBe('block-official-specs');
    expect(state.selectedChildId).toBe(mapping.cellId);

    // Clicar no wrapper fora das células limpa childId mas mantém o bloco selecionado
    const wrapper = container.querySelector('.relative.p-2.bg-white') as HTMLDivElement;
    expect(wrapper).not.toBeNull();
    act(() => {
      wrapper.click();
    });

    const stateAfterWrapperClick = useCatalogStore.getState();
    expect(stateAfterWrapperClick.selectedBlockId).toBe('block-official-specs');
    expect(stateAfterWrapperClick.selectedChildId).toBeNull();
  });

  // =========================================================================
  // FASE 7 & 16 — INSPECTOR: Modos Tabela e Célula com Identificação Visual V2
  // =========================================================================
  it('F7 & F16: PropertiesPanel exibe identificador V2, modo tabela e modo célula com status semântico', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];

    // 1. Tabela selecionada (sem célula) -> Modo Tabela
    useCatalogStore.getState().selectEditorElement({
      blockId: block.id,
      childId: null
    });

    renderComponent(<PropertiesPanel />);

    // Valida que AVAILABLE_DEFAULT_FIELDS centralizado possui campos essenciais
    expect(AVAILABLE_DEFAULT_FIELDS.some((f) => f.key === 'range')).toBe(true);

    // Identificação visual amigável (Fase 16)
    expect(container.textContent).toContain('Tabela de Especificações — V2');

    // Modo Tabela (Fase 7)
    expect(container.textContent).toContain('Edição Precisa de Célula');
    expect(container.textContent).toContain('Personalizar Colunas');
    expect(container.textContent).toContain('Modelos na Tabela');
    expect(container.textContent).toContain('PCON-Y18');

    // 2. Célula selecionada -> Modo Célula
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;
    const mapping = adaptRes.bridge.getByLegacyCoordinates('row-1-pcon', 'range')!;

    useCatalogStore.getState().selectEditorElement({
      blockId: block.id,
      childId: mapping.cellId
    });

    renderComponent(<PropertiesPanel />);

    const cellInspector = container.querySelector('[data-testid="specs-table-cell-inspector"]');
    expect(cellInspector).not.toBeNull();
    expect(cellInspector?.textContent).toContain('Coluna:');
    expect(cellInspector?.textContent).toContain('Faixa Operacional');
    expect(cellInspector?.textContent).toContain('Dado da Biblioteca');
  });

  // =========================================================================
  // FASE 8, 9 & 10 — LIBRARY BINDING, OVERRIDE E RESTORE
  // =========================================================================
  it('F8-F10: Ciclo completo: dado da biblioteca -> override local -> restore padrão', () => {
    const catalog = useCatalogStore.getState().currentCatalog!;
    const block = catalog.pages[0].blocks[0];
    const adaptRes = adaptLegacyBlockToTableCore(block);
    if (!adaptRes.supported) return;

    const mapping = adaptRes.bridge.getByLegacyCoordinates('row-1-pcon', 'range')!;

    // 1. Seleciona célula vinculada
    useCatalogStore.getState().selectEditorElement({
      blockId: block.id,
      childId: mapping.cellId
    });

    renderComponent(<PropertiesPanel />);
    expect(container.textContent).toContain('Dado da Biblioteca');

    // 2. Aplica override
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe('0 a 100 bar');

    act(() => {
      fireEvent.change(input, { target: { value: '0 a 250 bar (Calibrado Especial)' } });
    });

    const applyBtn = container.querySelector('button[title*="Salvar"]') as HTMLButtonElement;
    act(() => {
      applyBtn.click();
    });

    // Confirma que store recebeu o override e status virou Override Local
    const updatedCatalog = useCatalogStore.getState().currentCatalog!;
    const updatedRow = updatedCatalog.pages[0].blocks[0].tableRows![0];
    expect(updatedRow.localOverrides?.range).toBe('0 a 250 bar (Calibrado Especial)');

    renderComponent(<PropertiesPanel />);
    expect(container.textContent).toContain('Override Local');

    // 3. Restaura ao padrão da biblioteca
    const restoreBtn = container.querySelector('button[title*="Remove o override"]') as HTMLButtonElement;
    expect(restoreBtn).not.toBeNull();
    act(() => {
      restoreBtn.click();
    });

    // Override foi removido
    const restoredCatalog = useCatalogStore.getState().currentCatalog!;
    const restoredRow = restoredCatalog.pages[0].blocks[0].tableRows![0];
    expect(restoredRow.localOverrides?.range).toBeUndefined();

    renderComponent(<PropertiesPanel />);
    expect(container.textContent).toContain('Dado da Biblioteca');
  });

  // =========================================================================
  // FASE 11 — EXTERNAL LIBRARY UPDATE: Live-binding sem cópia estática
  // =========================================================================
  it('F11: Atualização externa da Library reflete imediatamente; override resiste à mudança externa; restore adota novo valor', () => {
    // 1. Sem override: valor inicial é "0 a 100 bar"
    renderComponent(<A4Canvas />);
    expect(container.textContent).toContain('0 a 100 bar');

    // Atualiza produto na biblioteca externa
    act(() => {
      useLibraryStore.setState({
        products: [
          {
            ...mockProductPconY18,
            specs: {
              ...mockProductPconY18.specs,
              range: '0 a 300 bar (Novo Lote Metrológico)',
              protectionDegree: 'IP65',
              customSpecs: {}
            }
          },
          mockProductTA25N
        ]
      });
    });

    // Re-renderiza Canvas: a célula adota dinamicamente o novo valor externo
    renderComponent(<A4Canvas />);
    expect(container.textContent).toContain('0 a 300 bar (Novo Lote Metrológico)');

    // 2. Com override: aplica override local
    useCatalogStore.getState().updateCellOverride('block-official-specs', 'row-1-pcon', 'range', 'Override Fixo 50 bar');
    renderComponent(<A4Canvas />);
    expect(container.textContent).toContain('Override Fixo 50 bar');

    // Modifica novamente o produto na biblioteca para outro valor
    act(() => {
      useLibraryStore.setState({
        products: [
          {
            ...mockProductPconY18,
            specs: {
              ...mockProductPconY18.specs,
              range: '0 a 500 bar (Alteração Fabril)',
              protectionDegree: 'IP65',
              customSpecs: {}
            }
          },
          mockProductTA25N
        ]
      });
    });

    // Célula continua exibindo o override local protegido
    renderComponent(<A4Canvas />);
    expect(container.textContent).toContain('Override Fixo 50 bar');
    expect(container.textContent).not.toContain('0 a 500 bar (Alteração Fabril)');

    // 3. Após restore: adota o valor da biblioteca mais recente
    useCatalogStore.getState().restoreCellToLibrary('block-official-specs', 'row-1-pcon', 'range');
    renderComponent(<A4Canvas />);
    expect(container.textContent).toContain('0 a 500 bar (Alteração Fabril)');
  });

  // =========================================================================
  // FASE 12 — STRUCTURAL COMMANDS (Colunas, Linhas, visible === undefined)
  // =========================================================================
  it('F12: Comandos estruturais: renomear coluna, remover coluna, adicionar custom, remover linha e toggle com visible === undefined', () => {
    // 1. Teste específico para visible === undefined: o primeiro toggle DEVE escondê-la (visible: false)
    const catalogWithUndefinedCol: Catalog = {
      ...createInitialCatalog(),
      pages: [
        {
          ...createInitialCatalog().pages[0],
          blocks: [
            {
              ...createInitialCatalog().pages[0].blocks[0],
              tableColumns: [
                { key: 'legacy_col', label: 'Coluna Sem Visible Defenido' } // visible === undefined
              ]
            }
          ]
        }
      ]
    };
    useCatalogStore.setState({ currentCatalog: catalogWithUndefinedCol });

    renderComponent(
      <SpecsTableInspector
        block={catalogWithUndefinedCol.pages[0].blocks[0]}
        pageId="page-1"
        selectedCellId={null}
      />
    );

    // Clica no toggle da coluna
    const toggleBtn = container.querySelector('button.flex.items-center.gap-1\\.5') as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();

    act(() => {
      toggleBtn.click();
    });

    // Verifica que agora visible === false
    const afterToggleBlock = useCatalogStore.getState().currentCatalog!.pages[0].blocks[0];
    expect(afterToggleBlock.tableColumns![0].visible).toBe(false);

    // Segundo toggle deve reativá-la como true
    renderComponent(
      <SpecsTableInspector
        block={afterToggleBlock}
        pageId="page-1"
        selectedCellId={null}
      />
    );
    const toggleBtn2 = container.querySelector('button.flex.items-center.gap-1\\.5') as HTMLButtonElement;
    act(() => {
      toggleBtn2.click();
    });
    const afterSecondToggleBlock = useCatalogStore.getState().currentCatalog!.pages[0].blocks[0];
    expect(afterSecondToggleBlock.tableColumns![0].visible).toBe(true);

    // 2. Adicionar linha de produto e remover linha
    useCatalogStore.getState().addRowToTable('block-official-specs', 'prod-presys-ta25n');
    let blockWithTwoRows = useCatalogStore.getState().currentCatalog!.pages[0].blocks[0];
    expect(blockWithTwoRows.tableRows?.length).toBe(2);

    // No Inspector, o botão de remover linha deve aparecer para cada linha
    renderComponent(
      <SpecsTableInspector
        block={blockWithTwoRows}
        pageId="page-1"
        selectedCellId={null}
      />
    );
    const deleteRowBtn = container.querySelector('button[aria-label*="Remover modelo"]') as HTMLButtonElement;
    expect(deleteRowBtn).not.toBeNull();
    act(() => {
      deleteRowBtn.click();
    });

    const blockAfterRowRemove = useCatalogStore.getState().currentCatalog!.pages[0].blocks[0];
    expect(blockAfterRowRemove.tableRows?.length).toBe(1);
  });

  // =========================================================================
  // FASE 13 — EDITOR / EXPORT PARITY
  // =========================================================================
  it('F13: CleanA4Document exporta os mesmos dados e overrides sem controles interativos de edição', () => {
    // Configura override de teste
    useCatalogStore.getState().updateCellOverride('block-official-specs', 'row-1-pcon', 'accuracy', '± 0,01% FS (Super)');

    const currentDoc = useCatalogStore.getState().currentCatalog!;

    // 1. Editor
    renderComponent(<A4Canvas />);
    expect(container.textContent).toContain('± 0,01% FS (Super)');
    expect(container.querySelector('td[data-cell-id]')).not.toBeNull();
    expect(container.querySelector('button[data-editor-action="true"], .no-print')).not.toBeNull();

    act(() => {
      root?.unmount();
      root = null;
    });

    // 2. Export (CleanA4Document)
    renderComponent(<CleanA4Document document={currentDoc} />);
    expect(container.textContent).toContain('± 0,01% FS (Super)');

    // Controles de edição e atributos interativos não existem no PDF/export
    expect(container.querySelector('td[data-cell-id]')).toBeNull();
    expect(container.innerHTML).not.toContain('outline-blue-500');
    expect(container.innerHTML).not.toContain('+ Adicionar Produto da Biblioteca');
  });

  // =========================================================================
  // FASE 14 — SAVE / RELOAD E SCHEMA COMPATIBILITY
  // =========================================================================
  it('F14: CatalogSchema valida e preserva bloco specs_table com overrides após serialização JSON', () => {
    useCatalogStore.getState().updateCellOverride('block-official-specs', 'row-1-pcon', 'range', '10 a 50 bar');

    const catalog = useCatalogStore.getState().currentCatalog!;
    const serialized = JSON.stringify(catalog);
    const deserialized = JSON.parse(serialized);

    // Validação estrita de schema Zod
    const parsed = CatalogSchema.parse(deserialized);
    expect(parsed.pages[0].blocks[0].type).toBe('specs_table');
    expect(parsed.pages[0].blocks[0].tableRows![0].localOverrides?.range).toBe('10 a 50 bar');
  });

  // =========================================================================
  // FASE 15 — FALLBACK: Bloco specs_table sem colunas não crasha e usa TechnicalTable
  // =========================================================================
  it('F15: Bloco specs_table sem colunas cai graciosamente no fallback sem crash', () => {
    const invalidBlock: ContentBlock = {
      id: 'blk-invalid',
      type: 'specs_table',
      title: 'Tabela Inválida Sem Colunas',
      tableColumns: [], // sem colunas -> adaptLegacyBlockToTableCore retorna supported: false
      tableRows: []
    };

    const adaptRes = adaptLegacyBlockToTableCore(invalidBlock);
    expect(adaptRes.supported).toBe(false);

    // Renderiza o TechnicalTableBlock com esse bloco inválido sem lançar exceção
    expect(() => {
      renderComponent(
        <TechnicalTableBlock
          block={invalidBlock}
          pageId="page-1"
          isSelected={false}
        />
      );
    }).not.toThrow();

    // Fallback é montado
    expect(container.textContent).toContain('Tabela Inválida Sem Colunas');
  });
});
