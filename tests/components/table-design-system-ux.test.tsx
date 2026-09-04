import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { SpecsTableInspector } from '../../src/components/editor/inspector/SpecsTableInspector';
import { TechnicalTableBlock } from '../../src/components/editor/blocks/TechnicalTableBlock';
import { HumanFriendlyErrorBanner } from '../../src/components/common/HumanFriendlyErrorBanner';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { ContentBlock } from '../../src/domain/catalog.schema';

describe('Table Core V2: Design System UX, Inspector & Empty Row Behaviors (Emendas 1-3, 12-14, 21)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();

    // Mock store baseline
    useCatalogStore.setState({
      currentCatalog: {
        id: 'cat_test_ux',
        title: 'Catálogo de Teste UX',
        pages: [
          {
            id: 'page_1',
            pageNumber: 1,
            blocks: []
          }
        ]
      } as any,
      activePageIndex: 0,
      selectedBlockId: 'blk_test_table'
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

  const renderComponent = (element: React.ReactElement) => {
    root = createRoot(container);
    act(() => {
      root?.render(element);
    });
  };

  // ==========================================================================
  // Emenda 1 & 2: Trava de exclusão da última linha removida & Badge de vazia
  // ==========================================================================
  it('UX-1: Permite deletar a última linha (rows.length === 1) e exibe badge "Ainda sem conteúdo"', () => {
    const singleEmptyRowBlock: ContentBlock = {
      id: 'blk_test_table',
      type: 'specs_table',
      title: 'Tabela de Teste',
      tableColumns: [
        { key: 'col1', label: 'Parâmetro', visible: true }
      ],
      tableRows: [
        { id: 'row_single', localOverrides: { model: '', faixa: '', exatidao: '' } }
      ]
    };

    let removedRowId: string | null = null;
    const mockRemoveRow = vi.fn((_blockId, rowId) => {
      removedRowId = rowId;
    });
    useCatalogStore.setState({ removeRowFromTable: mockRemoveRow });

    renderComponent(
      <SpecsTableInspector
        block={singleEmptyRowBlock}
        pageId="page_1"
      />
    );

    // Deve exibir o badge "Ainda sem conteúdo" no Inspector (Emenda 2)
    expect(container.textContent).toContain('Ainda sem conteúdo');

    // O botão de exclusão DEVE estar presente e habilitado mesmo com 1 linha
    const deleteBtn = container.querySelector('button[title="Remover linha da tabela"]');
    expect(deleteBtn).not.toBeNull();

    act(() => {
      deleteBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockRemoveRow).toHaveBeenCalledWith('blk_test_table', 'row_single');
    expect(removedRowId).toBe('row_single');
  });

  // ==========================================================================
  // Emenda 2 & 3: Canvas exibe placeholder editorial e NÃO fake <tr> quando zero visible rows
  // ==========================================================================
  it('UX-2: No Canvas em modo editor, tabela com zero linhas visíveis exibe placeholder editorial e zero <tr> no tbody', () => {
    const emptyTableBlock: ContentBlock = {
      id: 'blk_test_table',
      type: 'specs_table',
      title: 'Tabela Sem Dados',
      tableColumns: [
        { key: 'c1', label: 'Parâmetro', visible: true },
        { key: 'c2', label: 'Valor', visible: true }
      ],
      tableRows: [
        { id: 'empty_row_1', localOverrides: { param: '', value: '   ' } } // 100% vazia
      ]
    };

    renderComponent(
      <TechnicalTableBlock block={emptyTableBlock} pageId="page_1" isExport={false} />
    );

    // Não deve renderizar nenhuma <tr> no tbody
    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(0);

    // Deve renderizar o placeholder editorial (Emenda 3)
    const placeholder = container.querySelector('[data-testid="zero-visible-rows-placeholder"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toContain('Nenhuma linha preenchida');
    expect(placeholder?.textContent).toContain('Adicione uma linha no painel lateral.');
  });

  // ==========================================================================
  // Emenda 3: Export / PDF omite tabela 100% vazia sem exportar faixa de 2px
  // ==========================================================================
  it('UX-3: No EXPORT/PDF, bloco com zero linhas visíveis é completamente omitido do DOM', () => {
    const emptyTableBlock: ContentBlock = {
      id: 'blk_test_table',
      type: 'specs_table',
      title: 'Tabela Sem Dados',
      tableColumns: [
        { key: 'c1', label: 'Parâmetro', visible: true }
      ],
      tableRows: []
    };

    renderComponent(
      <TechnicalTableBlock block={emptyTableBlock} pageId="page_1" isExport={true} />
    );

    // Elemento deve ser completamente omitido (null)
    expect(container.innerHTML).toBe('');
  });

  // ==========================================================================
  // Emenda 21: HumanFriendlyErrorBanner com detalhes colapsados e retry real
  // ==========================================================================
  it('UX-4: HumanFriendlyErrorBanner colapsa detalhes técnicos por padrão e executa retry real', async () => {
    const mockRetry = vi.fn().mockResolvedValue(undefined);

    renderComponent(
      <HumanFriendlyErrorBanner
        title="Erro no Carregamento"
        message="Falha de conexão com o banco de dados."
        details="Stacktrace: TimeoutError at SupabaseClient.query (line 42)"
        onRetry={mockRetry}
      />
    );

    expect(container.textContent).toContain('Erro no Carregamento');
    expect(container.textContent).toContain('Falha de conexão com o banco de dados.');

    // Detalhes técnicos devem estar ocultos inicialmente
    expect(container.textContent).not.toContain('Stacktrace: TimeoutError');

    // Clica para expandir detalhes
    const expandBtn = container.querySelector('button');
    expect(expandBtn?.textContent).toContain('Ver detalhes técnicos');

    act(() => {
      expandBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Agora deve exibir os detalhes
    expect(container.textContent).toContain('Stacktrace: TimeoutError');

    // Botão de retry deve disparar a função real
    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Tentar novamente')
    );
    expect(retryBtn).toBeDefined();

    await act(async () => {
      retryBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
});
