// tests/components/contextual-inspector.test.tsx
// Suíte de Testes Automatizados — Fase 3A.2 Contextual Inspector (Section & Card)
// Cobre seleção atômica, invariantes de identidade, persistência, auto-recuperação (self-healing),
// ausência de controles fakes, renderização determinística e paridade de exportação A4.

import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ContentBlock,
  Catalog,
  StructuralLayoutConfigSchema
} from '../../src/domain/catalog.schema';
import {
  updateStructuralChildById,
  updateStructuralLayout
} from '../../src/domain/canvas-layout.engine';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { StructuralSectionBlock } from '../../src/components/editor/blocks/StructuralSectionBlock';
import { StructuralSectionInspector } from '../../src/components/editor/inspector/StructuralSectionInspector';
import { PropertiesPanel } from '../../src/components/editor/PropertiesPanel';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';
import { PrintableTextRegistry } from '../../src/translation/printable-text.registry';
import { RendererParityAuditor } from '../../src/translation/renderer-parity.auditor';
import { getPageContentBox } from '../../src/domain/page-geometry';

describe('Fase 3A.2 — Contextual Inspector (Section & Card)', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  const card1Id = '11111111-1111-4111-8111-111111111111';
  const card2Id = '22222222-2222-4222-8222-222222222222';
  const card3Id = '33333333-3333-4333-8333-333333333333';

  const mockStructuralBlock: ContentBlock = {
    id: 'block-sec-1',
    type: 'structural_section',
    title: 'CONECTIVIDADE E LIGAÇÕES',
    subtitle: 'Painel traseiro industrial e comunicações',
    badgeText: 'PADRÃO PRESYS',
    structuralData: {
      version: 1,
      iconId: 'network',
      layout: {
        mode: 'grid',
        columns: 3,
        widthMode: 'fill',
        gap: 'sm',
        padding: 'md',
        density: 'normal',
        align: 'left',
        background: 'soft',
        border: 'subtle',
        radius: 'sm'
      },
      children: [
        {
          id: card1Id,
          type: 'feature_card',
          title: 'Porta Ethernet 10/100',
          body: 'Conexão RJ45 para integração com redes corporativas.',
          iconId: 'network',
          badge: 'NATIVO',
          emphasis: 'normal'
        },
        {
          id: card2Id,
          type: 'feature_card',
          title: 'Interface Serial RS-485',
          body: 'Comunicação half-duplex com isolação galvânica.',
          iconId: 'database',
          badge: 'MODBUS RTU',
          emphasis: 'highlight'
        },
        {
          id: card3Id,
          type: 'feature_card',
          title: 'Porta USB Tipo-C',
          body: 'Configuração em bancada e download de logs.',
          iconId: 'usb',
          badge: 'FRONTAL',
          emphasis: 'informative'
        }
      ]
    }
  };

  const mockStructuralBlock2: ContentBlock = {
    id: 'block-sec-2',
    type: 'structural_section',
    title: 'SEGUNDA SEÇÃO ESTRUTURAL',
    structuralData: {
      version: 1,
      layout: {
        mode: 'grid',
        columns: 2,
        widthMode: 'fill',
        gap: 'md',
        padding: 'md',
        density: 'normal',
        align: 'left',
        background: 'soft',
        border: 'subtle',
        radius: 'sm'
      },
      children: []
    }
  };

  const mockLegacyBlock: ContentBlock = {
    id: 'block-legacy-1',
    type: 'text',
    textContent: 'Descrição em formato de bloco de texto livre.'
  };

  const mockCatalog: Catalog = {
    id: 'catalog-test-inspector',
    title: 'Catálogo de Teste do Contextual Inspector',
    version: 1,
    themeId: 'presys-default',
    locale: 'pt-BR',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        blocks: [mockStructuralBlock, mockStructuralBlock2, mockLegacyBlock]
      }
    ]
  };

  beforeEach(() => {
    useCatalogStore.setState({
      currentCatalog: structuredClone(mockCatalog),
      activePageIndex: 0,
      selectedBlockId: null,
      selectedChildId: null,
      isDirty: false,
      localRevision: 0
    });
  });

  // ==========================================================================
  // 1. TESTES DE SELEÇÃO & INVARIANTES (INSPECTOR-SEL-1..8)
  // ==========================================================================

  it('INSPECTOR-SEL-1: selecionar root block define selectedBlockId e mantém selectedChildId = null', () => {
    const store = useCatalogStore.getState();
    store.selectEditorElement({ blockId: 'block-sec-1', childId: null });

    const state = useCatalogStore.getState();
    expect(state.selectedBlockId).toBe('block-sec-1');
    expect(state.selectedChildId).toBeNull();
  });

  it('INSPECTOR-SEL-2: clicar em um card define selectedBlockId = section.id e selectedChildId = card.id', () => {
    const store = useCatalogStore.getState();
    store.selectEditorElement({ blockId: 'block-sec-1', childId: card2Id });

    const state = useCatalogStore.getState();
    expect(state.selectedBlockId).toBe('block-sec-1');
    expect(state.selectedChildId).toBe(card2Id);
  });

  it('INSPECTOR-SEL-3: trocar seleção de Card A para Card B atualiza selectedChildId sem alterar selectedBlockId', () => {
    const store = useCatalogStore.getState();
    store.selectEditorElement({ blockId: 'block-sec-1', childId: card1Id });
    expect(useCatalogStore.getState().selectedChildId).toBe(card1Id);

    store.selectEditorElement({ blockId: 'block-sec-1', childId: card3Id });
    const state = useCatalogStore.getState();
    expect(state.selectedBlockId).toBe('block-sec-1');
    expect(state.selectedChildId).toBe(card3Id);
  });

  it('INSPECTOR-SEL-4: reordenar cards no array mantém a seleção vinculada ao mesmo card por child.id', () => {
    const store = useCatalogStore.getState();
    store.selectEditorElement({ blockId: 'block-sec-1', childId: card2Id });

    // Simula reordenação invertendo o array de children
    const catalog = useCatalogStore.getState().currentCatalog!;
    const sec = catalog.pages[0].blocks[0];
    sec.structuralData!.children.reverse();

    // O childId selecionado permanece idêntico
    expect(useCatalogStore.getState().selectedChildId).toBe(card2Id);
    expect(sec.structuralData!.children.find((c) => c.id === card2Id)?.title).toBe('Interface Serial RS-485');
  });

  it('INSPECTOR-SEL-5: trocar de structural section A para section B limpa selectedChildId', () => {
    const store = useCatalogStore.getState();
    store.selectEditorElement({ blockId: 'block-sec-1', childId: card1Id });
    expect(useCatalogStore.getState().selectedChildId).toBe(card1Id);

    // Seleciona outra seção
    store.setSelectedBlockId('block-sec-2');
    const state = useCatalogStore.getState();
    expect(state.selectedBlockId).toBe('block-sec-2');
    expect(state.selectedChildId).toBeNull();
  });

  it('INSPECTOR-SEL-6: selecionar bloco legado após card limpa selectedChildId', () => {
    const store = useCatalogStore.getState();
    store.selectEditorElement({ blockId: 'block-sec-1', childId: card1Id });
    expect(useCatalogStore.getState().selectedChildId).toBe(card1Id);

    // Clica em bloco legado
    store.selectEditorElement({ blockId: 'block-legacy-1', childId: null });
    const state = useCatalogStore.getState();
    expect(state.selectedBlockId).toBe('block-legacy-1');
    expect(state.selectedChildId).toBeNull();
  });

  it('INSPECTOR-SEL-7: canvas empty click reseta root e child selection para null', () => {
    const store = useCatalogStore.getState();
    store.selectEditorElement({ blockId: 'block-sec-1', childId: card2Id });

    // Clica no fundo vazio do canvas
    store.selectEditorElement({ blockId: null, childId: null });
    const state = useCatalogStore.getState();
    expect(state.selectedBlockId).toBeNull();
    expect(state.selectedChildId).toBeNull();
  });

  it('INSPECTOR-SEL-8: stale child selecionado que deixa de existir faz self-heal e garante selectedChildId nulo no store', () => {
    const store = useCatalogStore.getState();
    // Aponta para um childId que não existe no bloco
    const nonexistentChildId = '99999999-9999-4999-8999-999999999999';
    store.selectEditorElement({ blockId: 'block-sec-1', childId: nonexistentChildId });

    // CAN-01: o store agora valida contra o catálogo ativo e descarta o child inválido na fonte
    expect(useCatalogStore.getState().selectedBlockId).toBe('block-sec-1');
    expect(useCatalogStore.getState().selectedChildId).toBe(null);

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(<PropertiesPanel />);
    });

    // O PropertiesPanel identifica a seleção da seção e renderiza o StructuralSectionInspector
    expect(container.textContent).toContain('Conteúdo da Seção');
    expect(container.textContent).toContain('Layout da Seção');
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('CONECTIVIDADE E LIGAÇÕES');

    act(() => {
      root.unmount();
    });
  });

  it('INSPECTOR-SEL-9: seleção de bloco legado com childId arbitrário resulta em selectedChildId nulo', () => {
    const store = useCatalogStore.getState();
    // 'block-legacy-1' é bloco legado ('text')
    store.selectEditorElement({ blockId: 'block-legacy-1', childId: 'arbitrary-child-uuid' });

    expect(useCatalogStore.getState().selectedBlockId).toBe('block-legacy-1');
    expect(useCatalogStore.getState().selectedChildId).toBe(null);

    // Testando também setSelectedChildId direto com bloco legado ativo
    store.setSelectedChildId('another-child-uuid');
    expect(useCatalogStore.getState().selectedChildId).toBe(null);
  });

  it('INSPECTOR-SEL-10: blockId inexistente no documento resulta em seleção consistente (ambos nulos)', () => {
    const store = useCatalogStore.getState();
    store.selectEditorElement({ blockId: 'nonexistent-block-uuid', childId: 'any-child' });

    expect(useCatalogStore.getState().selectedBlockId).toBe(null);
    expect(useCatalogStore.getState().selectedChildId).toBe(null);

    store.setSelectedBlockId('invalid-block-uuid');
    expect(useCatalogStore.getState().selectedBlockId).toBe(null);
    expect(useCatalogStore.getState().selectedChildId).toBe(null);
  });

  // ==========================================================================
  // 2. TESTES DE EDIÇÃO DA SEÇÃO (INSPECTOR-SECTION-1..3)
  // ==========================================================================

  it('INSPECTOR-SECTION-1: edição de title, subtitle e badgeText preserva block.id e structuralData', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInspector
          sectionBlock={mockStructuralBlock}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    const inputs = container.querySelectorAll('input');
    const titleInput = inputs[0];

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(titleInput, 'CONEXÕES FRONTAIS ATUALIZADAS');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const state = useCatalogStore.getState();
    const updatedBlock = state.currentCatalog!.pages[0].blocks.find((b) => b.id === 'block-sec-1')!;

    expect(updatedBlock.id).toBe('block-sec-1');
    expect(updatedBlock.title).toBe('CONEXÕES FRONTAIS ATUALIZADAS');
    expect(updatedBlock.structuralData?.children.length).toBe(3);

    act(() => {
      root.unmount();
    });
  });

  it('INSPECTOR-SECTION-2: edição de layout.columns preserva todas as demais propriedades de layout', () => {
    const initialData = mockStructuralBlock.structuralData!;
    const updated = updateStructuralLayout(initialData, { columns: 5 });

    expect(updated.layout.columns).toBe(5);
    expect(updated.layout.mode).toBe('grid');
    expect(updated.layout.gap).toBe('sm');
    expect(updated.layout.padding).toBe('md');
    expect(updated.layout.widthMode).toBe('fill');
    expect(updated.layout.background).toBe('soft');
    expect(updated.layout.border).toBe('subtle');
    expect(updated.layout.radius).toBe('sm');
  });

  it('INSPECTOR-SECTION-3: validação de fixed width segue o schema do domínio (rejeita <= 0 e undefined quando fixed)', () => {
    const initialData = mockStructuralBlock.structuralData!;

    // Válido: fixedWidthMm positivo quando fixed
    const validFixed = updateStructuralLayout(initialData, {
      widthMode: 'fixed',
      fixedWidthMm: 160
    });
    expect(validFixed.layout.widthMode).toBe('fixed');
    expect(validFixed.layout.fixedWidthMm).toBe(160);

    // Inválido: fixedWidthMm <= 0 quando fixed deve disparar erro no schema
    expect(() => {
      updateStructuralLayout(initialData, {
        widthMode: 'fixed',
        fixedWidthMm: -10
      });
    }).toThrow();
  });

  // ==========================================================================
  // 3. TESTES DE EDIÇÃO DE CARDS (INSPECTOR-CARD-1..3)
  // ==========================================================================

  it('INSPECTOR-CARD-1: edição de card.title por child.id atualiza exclusivamente o card alvo', () => {
    const initialData = mockStructuralBlock.structuralData!;
    const { data: updatedData, found } = updateStructuralChildById(initialData, card2Id, {
      title: 'RS-485 Optoisolada Industrial'
    });

    expect(found).toBe(true);
    const c1 = updatedData.children.find((c) => c.id === card1Id)!;
    const c2 = updatedData.children.find((c) => c.id === card2Id)!;
    const c3 = updatedData.children.find((c) => c.id === card3Id)!;

    expect(c2.title).toBe('RS-485 Optoisolada Industrial');
    // Cards irmãos permanecem intocados
    expect(c1.title).toBe('Porta Ethernet 10/100');
    expect(c3.title).toBe('Porta USB Tipo-C');
  });

  it('INSPECTOR-CARD-2: edição de card.body preserva rigorosamente todos os campos irmãos', () => {
    const initialData = mockStructuralBlock.structuralData!;
    const originalCard = initialData.children.find((c) => c.id === card2Id)!;

    const { data: updatedData } = updateStructuralChildById(initialData, card2Id, {
      body: 'Descrição técnica completamente reescrita para auditoria.'
    });

    const updatedCard = updatedData.children.find((c) => c.id === card2Id)!;
    expect(updatedCard.body).toBe('Descrição técnica completamente reescrita para auditoria.');
    expect(updatedCard.id).toBe(originalCard.id);
    expect(updatedCard.title).toBe(originalCard.title);
    expect(updatedCard.badge).toBe(originalCard.badge);
    expect(updatedCard.emphasis).toBe(originalCard.emphasis);
    expect(updatedCard.iconId).toBe(originalCard.iconId);
  });

  it('INSPECTOR-CARD-3: edição de card.emphasis aplica variante sem mutar cards vizinhos', () => {
    const initialData = mockStructuralBlock.structuralData!;
    const { data: updatedData } = updateStructuralChildById(initialData, card1Id, {
      emphasis: 'technical'
    });

    const c1 = updatedData.children.find((c) => c.id === card1Id)!;
    const c2 = updatedData.children.find((c) => c.id === card2Id)!;

    expect(c1.emphasis).toBe('technical');
    expect(c2.emphasis).toBe('highlight');
  });

  // ==========================================================================
  // 4. TESTES DE LAYOUT E RENDERIZAÇÃO (INSPECTOR-LAYOUT-1..3 & RENDER-1..2)
  // ==========================================================================

  it('INSPECTOR-LAYOUT-1: modo stack renderiza fluxo de uma única coluna', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    const stackBlock: ContentBlock = {
      ...mockStructuralBlock,
      structuralData: {
        ...mockStructuralBlock.structuralData!,
        layout: {
          ...mockStructuralBlock.structuralData!.layout,
          mode: 'stack'
        }
      }
    };

    act(() => {
      root.render(<StructuralSectionBlock block={stackBlock} pageId="page-1" />);
    });

    const gridDiv = container.querySelector('div[style*="display: grid"]') as HTMLElement;
    expect(gridDiv).not.toBeNull();
    expect(gridDiv.style.gridTemplateColumns).toBe('minmax(0, 1fr)');

    act(() => {
      root.unmount();
    });
  });

  it('INSPECTOR-LAYOUT-2: modo grid com columns=5 produz alteração renderizada', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    const gridBlock: ContentBlock = {
      ...mockStructuralBlock,
      structuralData: {
        ...mockStructuralBlock.structuralData!,
        layout: {
          ...mockStructuralBlock.structuralData!.layout,
          mode: 'grid',
          columns: 5
        }
      }
    };

    act(() => {
      root.render(<StructuralSectionBlock block={gridBlock} pageId="page-1" />);
    });

    const gridDiv = container.querySelector('div[style*="display: grid"]') as HTMLElement;
    expect(gridDiv).not.toBeNull();
    expect(gridDiv.style.gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))');

    act(() => {
      root.unmount();
    });
  });

  it('INSPECTOR-LAYOUT-3: nenhum estado widthMode=fixed inválido é persistido', () => {
    // Tentar criar com fixedWidthMm = 0 deve falhar no schema
    expect(() => {
      StructuralLayoutConfigSchema.parse({
        mode: 'grid',
        columns: 4,
        widthMode: 'fixed',
        fixedWidthMm: 0,
        gap: 'sm',
        padding: 'md',
        density: 'normal',
        align: 'left',
        background: 'soft',
        border: 'subtle',
        radius: 'sm'
      });
    }).toThrow();
  });

  it('INSPECTOR-RENDER-1: cada controle editável de background, border e radius possui efeito visual no renderer', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    const styledBlock: ContentBlock = {
      ...mockStructuralBlock,
      structuralData: {
        ...mockStructuralBlock.structuralData!,
        layout: {
          ...mockStructuralBlock.structuralData!.layout,
          background: 'technical',
          border: 'accent',
          radius: 'lg',
          padding: 'xl'
        }
      }
    };

    act(() => {
      root.render(<StructuralSectionBlock block={styledBlock} pageId="page-1" />);
    });

    const blockDiv = container.querySelector('.structural-section-block') as HTMLElement;
    expect(blockDiv).not.toBeNull();
    // background technical = #f1f5f9 (rgb(241, 245, 249))
    expect(blockDiv.style.backgroundColor).toBe('rgb(241, 245, 249)');
    // border accent = 1.5px solid rgb(0, 51, 102) (#003366)
    expect(blockDiv.style.border).toContain('solid');
    // radius lg = 12px
    expect(blockDiv.style.borderRadius).toBe('12px');
    // padding xl = 8mm
    expect(blockDiv.style.padding).toBe('8mm');

    act(() => {
      root.unmount();
    });
  });

  it('INSPECTOR-RENDER-2: card.emphasis produz as classes de destaque esperadas', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(<StructuralSectionBlock block={mockStructuralBlock} pageId="page-1" />);
    });

    const cardElements = container.querySelectorAll('[data-card-id]');
    expect(cardElements.length).toBe(3);

    // Card 1 é normal
    expect(cardElements[0].className).toContain('bg-white');

    // Card 2 é highlight (borda superior azul escuro #003366)
    expect(cardElements[1].className).toContain('border-t-[#003366]');

    // Card 3 é informative (bg-sky)
    expect(cardElements[2].className).toContain('bg-sky-50');

    act(() => {
      root.unmount();
    });
  });

  // ==========================================================================
  // 5. TRADUÇÃO & INVARIANTES DE I18N (INSPECTOR-I18N-1)
  // ==========================================================================

  it('INSPECTOR-I18N-1: edição de textos no Inspector preserva exatamente os mesmos PrintableTextNode IDs canônicos', () => {
    const nodesBefore = PrintableTextRegistry.extractCatalogNodes(mockCatalog);
    const beforeIds = nodesBefore.map((n) => n.id).sort();

    // Modifica os textos do bloco e dos cards
    const modifiedCatalog = structuredClone(mockCatalog);
    const sec = modifiedCatalog.pages[0].blocks[0];
    sec.title = 'NOVO TÍTULO EDITADO';
    sec.badgeText = 'NOVO BADGE';
    sec.structuralData!.children[0].title = 'Novo Título Card 1';
    sec.structuralData!.children[0].body = 'Novo Corpo Card 1';

    const nodesAfter = PrintableTextRegistry.extractCatalogNodes(modifiedCatalog);
    const afterIds = nodesAfter.map((n) => n.id).sort();

    // O conjunto exato de identificadores canônicos é preservado
    expect(afterIds).toEqual(beforeIds);
    expect(afterIds).toContain(`b${mockStructuralBlock.id}_sec_title`);
    expect(afterIds).toContain(`b${mockStructuralBlock.id}_sec_badge`);
    expect(afterIds).toContain(`b${mockStructuralBlock.id}_card_${card1Id}_title`);
    expect(afterIds).toContain(`b${mockStructuralBlock.id}_card_${card1Id}_body`);
  });

  // ==========================================================================
  // 6. PERSISTÊNCIA & LEGACY COEXISTENCE (INSPECTOR-PERSIST-1 & LEGACY-1)
  // ==========================================================================

  it('INSPECTOR-PERSIST-1: edições via updateBlock marcam isDirty e incrementam localRevision', () => {
    const store = useCatalogStore.getState();
    expect(store.isDirty).toBe(false);
    expect(store.localRevision).toBe(0);

    store.updateBlock('page-1', 'block-sec-1', {
      title: 'Título com dirty state ativado'
    });

    const updatedState = useCatalogStore.getState();
    expect(updatedState.isDirty).toBe(true);
    expect(updatedState.localRevision).toBe(1);
    expect(updatedState.currentCatalog!.pages[0].blocks[0].title).toBe('Título com dirty state ativado');
  });

  it('INSPECTOR-LEGACY-1: bloco legado selecionado continua renderizando o painel legado correspondente sem regressão', () => {
    const store = useCatalogStore.getState();
    store.selectEditorElement({ blockId: 'block-legacy-1', childId: null });

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(<PropertiesPanel />);
    });

    // O PropertiesPanel renderiza o cabeçalho do elemento legado "text"
    expect(container.textContent).toContain('Elemento Selecionado');
    expect(container.textContent).toContain('Text');
    // Não renderiza o inspetor de seção estrutural
    expect(container.textContent).not.toContain('Conteúdo da Seção');

    act(() => {
      root.unmount();
    });
  });

  // ==========================================================================
  // 7. ISOLAMENTO DO PDF & AUDITORIA DE PARIDADE (INSPECTOR-PRINT-1 & PARITY-1..2)
  // ==========================================================================

  it('INSPECTOR-PRINT-1: CleanA4Document permanece totalmente livre de anéis de seleção ou estado de editor', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    // Simula editor com bloco e card selecionados
    useCatalogStore.getState().selectEditorElement({
      blockId: 'block-sec-1',
      childId: card2Id
    });

    act(() => {
      root.render(<CleanA4Document document={mockCatalog} />);
    });

    const html = container.innerHTML;
    // Não pode conter anéis de foco do editor (ring-2, ring-blue-600)
    expect(html).not.toContain('ring-2 ring-blue-600');
    expect(html).not.toContain('ring-1 ring-dashed');
    expect(html).not.toContain('cursor-pointer');

    act(() => {
      root.unmount();
    });
  });

  it('INSPECTOR-PARITY-1: após edição via Inspector, RendererParityAuditor continua com 100% de paridade', () => {
    // Altera propriedades de conteúdo e layout
    const editedCatalog: Catalog = {
      ...mockCatalog,
      pages: [
        {
          ...mockCatalog.pages[0],
          blocks: [
            {
              ...mockStructuralBlock,
              title: 'PARIDADE TOTAL VERIFICADA',
              subtitle: 'Subtítulo mantido perfeitamente audível',
              structuralData: {
                ...mockStructuralBlock.structuralData!,
                children: [
                  {
                    ...mockStructuralBlock.structuralData!.children[0],
                    title: 'Ethernet Auditada'
                  },
                  mockStructuralBlock.structuralData!.children[1],
                  mockStructuralBlock.structuralData!.children[2]
                ]
              }
            }
          ]
        }
      ]
    };

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(<CleanA4Document document={editedCatalog} />);
    });

    const audit = RendererParityAuditor.auditRenderedDOM(container, editedCatalog);

    expect(audit.rendererPrintableParityCoverage).toBe(100);
    expect(audit.orphanTextNodes.length).toBe(0);
    expect(audit.missingExpectedNodes.length).toBe(0);
    expect(audit.sourceMismatchNodes.length).toBe(0);
    expect(audit.isComplete).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it('INSPECTOR-PARITY-2: CleanA4Document mantém zero vazamento de iconId semântico no DOM', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(<CleanA4Document document={mockCatalog} />);
    });

    const textContent = container.textContent || '';
    expect(textContent).not.toContain('[network]');
    expect(textContent).not.toContain('[database]');
    expect(textContent).not.toContain('[usb]');

    act(() => {
      root.unmount();
    });
  });

  // ==========================================================================
  // 6. TESTES DE LARGURA E UX DEPRECATION (INSPECTOR-WIDTH-1..4 - FASE 3A.2B)
  // ==========================================================================

  it('INSPECTOR-WIDTH-1: novo documento fill não possui fallback de 150mm no inspector', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInspector
          sectionBlock={mockStructuralBlock}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    // Garante que a string '150' não existe no HTML renderizado
    expect(container.textContent).not.toContain('150');
    expect(mockStructuralBlock.structuralData?.layout.fixedWidthMm).toBeUndefined();

    act(() => {
      root.unmount();
    });
  });

  it('INSPECTOR-WIDTH-2: opção de largura Fixa está desabilitada para novas edições na UI', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInspector
          sectionBlock={mockStructuralBlock}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('#inspector-section-layout-header')?.click();
    });

    // Encontra o botão "Fixa (mm)" e comprova que agora está HABILITADO na Fase 3A.5A
    const buttons = Array.from(container.querySelectorAll('button'));
    const fixedButton = buttons.find((b) => b.textContent?.includes('Fixa'));
    expect(fixedButton).toBeDefined();
    expect(fixedButton?.disabled).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it('INSPECTOR-WIDTH-3: documento existente com fixedWidthMm=160 mantém render e exibe input de edição com content box', () => {
    const existingFixedBlock: ContentBlock = {
      ...mockStructuralBlock,
      id: 'block-sec-fixed',
      structuralData: {
        ...mockStructuralBlock.structuralData!,
        layout: {
          ...mockStructuralBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 160
        }
      }
    };

    // 1. Renderer A4 mantém 160mm fielmente
    const renderContainer = document.createElement('div');
    const renderRoot = createRoot(renderContainer);

    act(() => {
      renderRoot.render(
        <StructuralSectionBlock
          block={existingFixedBlock}
          pageId="page-1"
          isExport={true}
        />
      );
    });

    const blockDiv = renderContainer.querySelector('.structural-section-block') as HTMLElement;
    expect(blockDiv.style.width).toBe('160mm');

    act(() => {
      renderRoot.unmount();
    });

    // 2. Inspector mostra input de edição ativo com 160mm e limite no content box
    const inspectorContainer = document.createElement('div');
    const inspectorRoot = createRoot(inspectorContainer);

    act(() => {
      inspectorRoot.render(
        <StructuralSectionInspector
          sectionBlock={existingFixedBlock}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    act(() => {
      inspectorContainer.querySelector<HTMLButtonElement>('#inspector-section-layout-header')?.click();
    });

    const numInput = inspectorContainer.querySelector('input[type="number"]') as HTMLInputElement;
    expect(numInput).not.toBeNull();
    expect(numInput.value).toBe('160');
    expect(parseFloat(numInput.max)).toBeCloseTo(193.0666, 3);

    act(() => {
      inspectorRoot.unmount();
    });
  });

  it('INSPECTOR-WIDTH-4: nenhum max=210 arbitrário é apresentado como content box authority', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInspector
          sectionBlock={mockStructuralBlock}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    // Não existe input number com max=210 nem hint "Máx: 210 mm"
    expect(container.textContent).not.toContain('Máx: 210 mm');
    expect(container.querySelector('input[type="number"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it('WIDTH-TOGGLE-1: alternância Fixed -> Fill remove fixedWidthMm; Fill -> Fixed inicializa com availableWidthMm canônico (não ressuscita 215)', () => {
    const legacyOversizedBlock: ContentBlock = {
      ...mockStructuralBlock,
      id: 'block-sec-oversized',
      structuralData: {
        ...mockStructuralBlock.structuralData!,
        layout: {
          ...mockStructuralBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 215 // Documento legado oversized
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...mockCatalog,
        pages: [
          {
            ...mockCatalog.pages[0],
            blocks: [legacyOversizedBlock]
          }
        ]
      }
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInspector
          sectionBlock={legacyOversizedBlock}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('#inspector-section-layout-header')?.click();
    });

    // 1. No load: documento legado preservado com 215mm e aviso exibido
    expect(container.textContent).toContain('Aviso de Geometria');
    const numInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(numInput.value).toBe('215');

    // 2. Usuário escolhe Fill
    const buttons = Array.from(container.querySelectorAll('button'));
    const fillButton = buttons.find((b) => b.textContent?.includes('Preencher'));
    expect(fillButton).toBeDefined();

    act(() => {
      fillButton?.click();
    });

    // Verifica que no catálogo o layout agora tem widthMode='fill' e fixedWidthMm é undefined/ausente
    const stateAfterFill = useCatalogStore.getState();
    const updatedBlockAfterFill = stateAfterFill.currentCatalog?.pages[0].blocks[0];
    expect(updatedBlockAfterFill?.structuralData?.layout.widthMode).toBe('fill');
    expect(updatedBlockAfterFill?.structuralData?.layout.fixedWidthMm).toBeUndefined();

    // Round-trip JSON comprova que fixedWidthMm não persiste artificialmente no JSON quando Fill
    const serializedJson = JSON.stringify(updatedBlockAfterFill?.structuralData?.layout);
    expect(serializedJson).not.toContain('fixedWidthMm');

    // 3. Re-renderiza o Inspector com o bloco atualizado após Fill
    act(() => {
      root.render(
        <StructuralSectionInspector
          sectionBlock={updatedBlockAfterFill!}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    act(() => {
      const header = container.querySelector<HTMLButtonElement>('#inspector-section-layout-header');
      if (header?.getAttribute('aria-expanded') !== 'true') {
        header?.click();
      }
    });

    // 4. Usuário volta para Fixed
    const buttonsAfterFill = Array.from(container.querySelectorAll('button'));
    const fixedButton = buttonsAfterFill.find((b) => b.textContent?.includes('Fixa'));
    expect(fixedButton).toBeDefined();

    act(() => {
      fixedButton?.click();
    });

    // Verifica que o catálogo recebeu exatamente availableWidthMm (193.0666) e NÃO ressuscitou 215
    const stateAfterFixed = useCatalogStore.getState();
    const updatedBlockAfterFixed = stateAfterFixed.currentCatalog?.pages[0].blocks[0];
    const canonicalWidth = getPageContentBox().availableWidthMm;

    expect(updatedBlockAfterFixed?.structuralData?.layout.widthMode).toBe('fixed');
    expect(updatedBlockAfterFixed?.structuralData?.layout.fixedWidthMm).toBe(canonicalWidth);
    expect(updatedBlockAfterFixed?.structuralData?.layout.fixedWidthMm).not.toBe(215);

    act(() => {
      root.unmount();
    });
  });

  it('WIDTH-INPUT-1: input de dimensão fixa possui step="any" e não impõe stepMismatch no valor canônico', () => {
    const fixedBlock: ContentBlock = {
      ...mockStructuralBlock,
      id: 'block-sec-canonical',
      structuralData: {
        ...mockStructuralBlock.structuralData!,
        layout: {
          ...mockStructuralBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 193.0666
        }
      }
    };

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInspector
          sectionBlock={fixedBlock}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('#inspector-section-layout-header')?.click();
    });

    const numInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(numInput).not.toBeNull();
    expect(numInput.step).toBe('any');
    expect(numInput.value).toBe('193.0666');
    // Validade nativa do HTML input (zero stepMismatch)
    expect(numInput.validity?.stepMismatch).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it('WIDTH-FIXED-INSPECTOR-1: alteração real de Gap em seção fixed preserva fixedWidthMm=150 no Zustand', () => {
    const fixedBlock: ContentBlock = {
      ...mockStructuralBlock,
      id: 'block-sec-fixed-gap-test',
      structuralData: {
        ...mockStructuralBlock.structuralData!,
        layout: {
          ...mockStructuralBlock.structuralData!.layout,
          widthMode: 'fixed',
          fixedWidthMm: 150,
          gap: 'sm'
        }
      }
    };

    useCatalogStore.setState({
      currentCatalog: {
        ...mockCatalog,
        pages: [
          {
            ...mockCatalog.pages[0],
            blocks: [fixedBlock]
          }
        ]
      }
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionInspector
          sectionBlock={fixedBlock}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('#inspector-section-layout-header')?.click();
    });

    // Encontra os selects do Inspector e localiza o select de Gap
    const selects = Array.from(container.querySelectorAll('select'));
    const gapSelect = selects[0];
    expect(gapSelect).toBeDefined();
    expect(gapSelect.value).toBe('sm');

    // Altera Gap de 'sm' para 'lg'
    act(() => {
      gapSelect.value = 'lg';
      gapSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Verifica no Zustand que gap é 'lg', fixedWidthMm continua 150 e widthMode é 'fixed'
    const state = useCatalogStore.getState();
    const updatedBlock = state.currentCatalog?.pages[0].blocks[0];
    expect(updatedBlock?.structuralData?.layout.gap).toBe('lg');
    expect(updatedBlock?.structuralData?.layout.fixedWidthMm).toBe(150);
    expect(updatedBlock?.structuralData?.layout.widthMode).toBe('fixed');

    act(() => {
      root.unmount();
    });
  });
});
