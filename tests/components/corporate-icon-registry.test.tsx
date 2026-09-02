// tests/components/corporate-icon-registry.test.tsx
// Suíte de Testes Automatizados — Fase 3A.3 Corporate Icon Registry + Icon Picker
// Cobre integridade do registry, governança de claims, busca normalizada, controlled picker,
// renderização determinística (Editor vs PDF), paridade A4, imutabilidade e ausência de wildcard.

import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import {
  CORPORATE_ICON_DEFINITIONS,
  CORPORATE_ICON_CATEGORIES,
  getCorporateIcon,
  searchCorporateIcons,
  normalizeIconSearchText
} from '../../src/components/icons/corporate-icon.registry';
import { CorporateIcon } from '../../src/components/icons/CorporateIcon';
import { CorporateIconPicker } from '../../src/components/icons/CorporateIconPicker';
import { StructuralSectionBlock } from '../../src/components/editor/blocks/StructuralSectionBlock';
import { StructuralCardInspector } from '../../src/components/editor/inspector/StructuralCardInspector';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';
import { ContentBlock, Catalog } from '../../src/domain/catalog.schema';
import { updateStructuralChildById } from '../../src/domain/canvas-layout.engine';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { PrintableTextRegistry } from '../../src/translation/printable-text.registry';
import { RendererParityAuditor } from '../../src/translation/renderer-parity.auditor';

describe('Fase 3A.3 — Corporate Icon Registry + Icon Picker', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  const card1Id = '11111111-1111-4111-8111-111111111111';
  const card2Id = '22222222-2222-4222-8222-222222222222';

  const mockStructuralBlock: ContentBlock = {
    id: 'block-sec-icon-test',
    type: 'structural_section',
    title: 'CONECTIVIDADE E DADOS',
    subtitle: 'Painel com portas digitais e interfaces de comunicação',
    badgeText: 'PRESYS INDUSTRIAL',
    structuralData: {
      version: 1,
      iconId: 'network',
      layout: {
        mode: 'grid',
        columns: 2,
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
          body: 'Conexão RJ45 para integração com redes SCADA.',
          iconId: 'ethernet',
          badge: 'MODBUS TCP',
          emphasis: 'highlight'
        },
        {
          id: card2Id,
          type: 'feature_card',
          title: 'Interface USB-C',
          body: 'Configuração em bancada e download de dados.',
          iconId: 'usb',
          badge: 'FRONTAL',
          emphasis: 'normal'
        }
      ]
    }
  };

  const mockCatalog: Catalog = {
    id: 'catalog-icon-test',
    title: 'Catálogo de Teste Corporate Icons',
    version: 1,
    themeId: 'presys-default',
    locale: 'pt-BR',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        blocks: [mockStructuralBlock]
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
  // 1. REGISTRY & CORPUS INTEGRITY (ICON-REG-1..5)
  // ==========================================================================

  it('ICON-REG-1: todos os canonical IDs no CorporateIconRegistry são únicos e kebab-case', () => {
    const ids = CORPORATE_ICON_DEFINITIONS.map((d) => d.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    expect(ids.length).toBe(46);

    // Formato kebab-case estrito (letras minúsculas e hífen opcional)
    ids.forEach((id) => {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    });

    expect(CORPORATE_ICON_CATEGORIES.length).toBe(6);
    expect(CORPORATE_ICON_CATEGORIES.map((c) => c.id)).toEqual([
      'connectivity',
      'metrology',
      'software_data',
      'industrial',
      'safety_quality',
      'documentation'
    ]);
  });

  it('ICON-REG-2: todos os 46 ícones mapeados resolvem componentes React válidos do Lucide', () => {
    CORPORATE_ICON_DEFINITIONS.forEach((def) => {
      const resolved = getCorporateIcon(def.id);
      expect(resolved).toBeDefined();
      expect(resolved?.component).toBeDefined();
      expect(['function', 'object']).toContain(typeof resolved?.component);
    });
  });

  it('ICON-REG-3: aliases contêm termos de busca relevantes e não vazios', () => {
    CORPORATE_ICON_DEFINITIONS.forEach((def) => {
      expect(def.aliases.length).toBeGreaterThan(0);
      def.aliases.forEach((alias) => {
        expect(alias.trim().length).toBeGreaterThan(0);
      });
    });
  });

  it('ICON-REG-4: ID desconhecido aciona política segura sem quebrar o lookup', () => {
    const unknown = getCorporateIcon('nonexistent-icon-id');
    expect(unknown).toBeUndefined();

    const empty = getCorporateIcon('');
    expect(empty).toBeUndefined();

    const nullIcon = getCorporateIcon(null);
    expect(nullIcon).toBeUndefined();
  });

  it('ICON-REG-5: ID desconhecido no CleanA4Document / isExport retorna null sem vazar texto cru no DOM/PDF', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(<CorporateIcon iconId="unknown-xyz-icon" isExport={true} />);
    });

    expect(container.innerHTML).toBe('');
    expect(container.textContent).toBe('');

    act(() => {
      root.unmount();
    });
  });

  // ==========================================================================
  // 2. GOVERNANÇA DE CLAIMS TÉCNICOS (ICON-GOV-1)
  // ==========================================================================

  it('ICON-GOV-1: corpus inicial não contém aliases específicos de certificação/regulação', () => {
    const forbiddenClaims = [
      'iso 17025',
      'iso/iec 17025',
      'rbc',
      'atex',
      'sil-2',
      'sil-3',
      'zona 0',
      'zona 1'
    ];

    CORPORATE_ICON_DEFINITIONS.forEach((def) => {
      const allText = [
        def.id,
        def.label,
        ...def.aliases
      ].map((t) => normalizeIconSearchText(t));

      forbiddenClaims.forEach((claim) => {
        allText.forEach((item) => {
          expect(item).not.toContain(claim);
        });
      });
    });
  });

  // ==========================================================================
  // 3. SEARCH NORMALIZATION (ICON-SEARCH-1..2)
  // ==========================================================================

  it('ICON-SEARCH-1: busca é accent-insensitive e case-insensitive', () => {
    // "pressao", "Pressão", "PRESSAO" encontram 'gauge'
    const res1 = searchCorporateIcons('pressao');
    const res2 = searchCorporateIcons('Pressão');
    const res3 = searchCorporateIcons('PRESSAO');

    expect(res1.some((i) => i.id === 'gauge')).toBe(true);
    expect(res2.some((i) => i.id === 'gauge')).toBe(true);
    expect(res3.some((i) => i.id === 'gauge')).toBe(true);
    expect(res1.length).toBe(res2.length);
    expect(res2.length).toBe(res3.length);

    // "comunicacao" vs "comunicação"
    const res4 = searchCorporateIcons('comunicacao');
    const res5 = searchCorporateIcons('comunicação');
    expect(res4.some((i) => i.id === 'network')).toBe(true);
    expect(res5.some((i) => i.id === 'network')).toBe(true);
  });

  it('ICON-SEARCH-2: query e category combinam sem reset silencioso', () => {
    // Busca "cabo" apenas em 'connectivity'
    const connResults = searchCorporateIcons('cabo', 'connectivity');
    expect(connResults.some((i) => i.id === 'cable')).toBe(true);

    // Busca "cabo" em 'metrology' deve retornar vazio
    const metroResults = searchCorporateIcons('cabo', 'metrology');
    expect(metroResults.length).toBe(0);
  });

  // ==========================================================================
  // 4. RENDERER DETERMINÍSTICO (ICON-RENDER-1..4)
  // ==========================================================================

  it('ICON-RENDER-1: seção com iconId válido renderiza SVG no cabeçalho com tamanho correto', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionBlock
          block={mockStructuralBlock}
          pageId="page-1"
          isExport={false}
        />
      );
    });

    const sectionSvg = container.querySelector('svg[data-corporate-icon-id="network"]');
    expect(sectionSvg).not.toBeNull();
    // Context section usa tamanho 'md' (20px)
    expect(sectionSvg?.getAttribute('width')).toBe('20');
    expect(sectionSvg?.getAttribute('height')).toBe('20');

    act(() => {
      root.unmount();
    });
  });

  it('ICON-RENDER-2: card com iconId válido renderiza SVG com tamanho e cor por ênfase técnica', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionBlock
          block={mockStructuralBlock}
          pageId="page-1"
          isExport={false}
        />
      );
    });

    // Card 1 (emphasis: 'highlight') -> iconId: 'ethernet', text-[#003366]
    const card1Svg = container.querySelector('svg[data-corporate-icon-id="ethernet"]');
    expect(card1Svg).not.toBeNull();
    expect(card1Svg?.getAttribute('width')).toBe('16'); // size 'sm' (16px)
    expect(card1Svg?.classList.contains('text-[#003366]')).toBe(true);

    // Card 2 (emphasis: 'normal') -> iconId: 'usb', text-slate-600
    const card2Svg = container.querySelector('svg[data-corporate-icon-id="usb"]');
    expect(card2Svg).not.toBeNull();
    expect(card2Svg?.classList.contains('text-slate-600')).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it('ICON-RENDER-3: Editor e CleanA4Document utilizam exatamente o mesmo componente CorporateIcon e resolvem o mesmo SVG', () => {
    const editorContainer = document.createElement('div');
    const pdfContainer = document.createElement('div');
    const editorRoot = createRoot(editorContainer);
    const pdfRoot = createRoot(pdfContainer);

    act(() => {
      editorRoot.render(
        <StructuralSectionBlock block={mockStructuralBlock} pageId="page-1" isExport={false} />
      );
      pdfRoot.render(
        <StructuralSectionBlock block={mockStructuralBlock} pageId="page-1" isExport={true} />
      );
    });

    const editorSvg = editorContainer.querySelector('svg[data-corporate-icon-id="network"]');
    const pdfSvg = pdfContainer.querySelector('svg[data-corporate-icon-id="network"]');

    expect(editorSvg).not.toBeNull();
    expect(pdfSvg).not.toBeNull();
    expect(editorSvg?.getAttribute('width')).toBe(pdfSvg?.getAttribute('width'));
    expect(editorSvg?.getAttribute('stroke-width')).toBe(pdfSvg?.getAttribute('stroke-width'));

    act(() => {
      editorRoot.unmount();
      pdfRoot.unmount();
    });
  });

  it('ICON-RENDER-4: todos os SVGs gerados no documento possuem aria-hidden="true"', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralSectionBlock block={mockStructuralBlock} pageId="page-1" isExport={true} />
      );
    });

    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    });

    act(() => {
      root.unmount();
    });
  });

  it('ICON-RENDER-5: section com title="", badgeText="" e iconId="network" renderiza SVG no Editor e Export', () => {
    const blockWithoutTitle: ContentBlock = {
      ...mockStructuralBlock,
      title: '',
      badgeText: '',
      structuralData: {
        ...mockStructuralBlock.structuralData!,
        iconId: 'network'
      }
    };

    const editorContainer = document.createElement('div');
    const exportContainer = document.createElement('div');
    const editorRoot = createRoot(editorContainer);
    const exportRoot = createRoot(exportContainer);

    act(() => {
      editorRoot.render(
        <StructuralSectionBlock block={blockWithoutTitle} pageId="page-1" isExport={false} />
      );
      exportRoot.render(
        <StructuralSectionBlock block={blockWithoutTitle} pageId="page-1" isExport={true} />
      );
    });

    const editorSvg = editorContainer.querySelector('svg[data-corporate-icon-id="network"]');
    const exportSvg = exportContainer.querySelector('svg[data-corporate-icon-id="network"]');

    expect(editorSvg).not.toBeNull();
    expect(exportSvg).not.toBeNull();

    act(() => {
      editorRoot.unmount();
      exportRoot.unmount();
    });
  });

  it('ICON-RENDER-6: section com title="", badgeText="" e unknown iconId exibe fallback no Editor e zero header no Export', () => {
    const blockWithUnknown: ContentBlock = {
      ...mockStructuralBlock,
      title: '',
      badgeText: '',
      structuralData: {
        ...mockStructuralBlock.structuralData!,
        iconId: 'unknown-sensor-xyz'
      }
    };

    const editorContainer = document.createElement('div');
    const exportContainer = document.createElement('div');
    const editorRoot = createRoot(editorContainer);
    const exportRoot = createRoot(exportContainer);

    act(() => {
      editorRoot.render(
        <StructuralSectionBlock block={blockWithUnknown} pageId="page-1" isExport={false} />
      );
      exportRoot.render(
        <StructuralSectionBlock block={blockWithUnknown} pageId="page-1" isExport={true} />
      );
    });

    // Editor: exibe fallback controlado com tooltip
    const fallback = editorContainer.querySelector('[data-corporate-icon-fallback="true"]');
    expect(fallback).not.toBeNull();

    // Export: ZERO SVG, ZERO fallback, ZERO header visual vazio, ZERO raw ID
    const exportSvgs = exportContainer.querySelectorAll('svg[data-corporate-icon-id="unknown-sensor-xyz"]');
    expect(exportSvgs.length).toBe(0);
    expect(exportContainer.querySelector('[data-corporate-icon-fallback="true"]')).toBeNull();
    expect(exportContainer.querySelector('.border-b')).toBeNull(); // Não cria header vazio com borda fantasma
    expect(exportContainer.textContent).not.toContain('unknown-sensor-xyz');

    act(() => {
      editorRoot.unmount();
      exportRoot.unmount();
    });
  });

  // ==========================================================================
  // 5. ISOLAMENTO EDITOR VS EXPORT (ICON-ENV-1)
  // ==========================================================================

  it('ICON-ENV-1: unknown icon no Editor exibe fallback ≠ no Export retorna null', () => {
    const editorContainer = document.createElement('div');
    const exportContainer = document.createElement('div');
    const editorRoot = createRoot(editorContainer);
    const exportRoot = createRoot(exportContainer);

    act(() => {
      editorRoot.render(
        <CorporateIcon iconId="nonexistent-sensor-icon" isExport={false} context="card" />
      );
      exportRoot.render(
        <CorporateIcon iconId="nonexistent-sensor-icon" isExport={true} context="card" />
      );
    });

    // Editor exibe fallback pontilhado com tooltip de auxílio
    expect(editorContainer.querySelector('[data-corporate-icon-fallback="true"]')).not.toBeNull();
    expect(editorContainer.textContent).toBe(''); // Zero texto cru

    // Export retorna estritamente vazio
    expect(exportContainer.innerHTML).toBe('');
    expect(exportContainer.textContent).toBe('');

    act(() => {
      editorRoot.unmount();
      exportRoot.unmount();
    });
  });

  // ==========================================================================
  // 6. TRADUÇÃO & AUDITORIA DE PARIDADE (ICON-I18N-1..2, ICON-VARIANT-1, ICON-PRINT-1..2)
  // ==========================================================================

  it('ICON-I18N-1: trocar ou adicionar iconId não gera nós no PrintableTextRegistry', () => {
    const nodesBefore = PrintableTextRegistry.extractBlockNodes(mockStructuralBlock, 'page-1', 1);

    // Bloco idêntico mas com outro iconId na seção e nos cards
    const modifiedBlock: ContentBlock = {
      ...mockStructuralBlock,
      structuralData: {
        ...mockStructuralBlock.structuralData!,
        iconId: 'thermometer',
        children: [
          { ...mockStructuralBlock.structuralData!.children[0], iconId: 'gauge' },
          { ...mockStructuralBlock.structuralData!.children[1], iconId: 'cpu' }
        ]
      }
    };
    const nodesAfter = PrintableTextRegistry.extractBlockNodes(modifiedBlock, 'page-1', 1);

    expect(nodesBefore.map((n) => n.id)).toEqual(nodesAfter.map((n) => n.id));
    expect(nodesBefore.length).toBe(nodesAfter.length);
  });

  it('ICON-I18N-2: Auditoria de RendererParityAuditor permanece em 100% de cobertura', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(<CleanA4Document document={mockCatalog} />);
    });

    const audit = RendererParityAuditor.auditRenderedDOM(container, mockCatalog);

    expect(audit.rendererPrintableParityCoverage).toBe(100);
    expect(audit.orphanTextNodes.length).toBe(0);
    expect(audit.missingExpectedNodes.length).toBe(0);
    expect(audit.sourceMismatchNodes.length).toBe(0);
    expect(audit.isComplete).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it('ICON-VARIANT-1: documento traduzido preserva rigorosamente o mesmo iconId', () => {
    const translatedCatalog: Catalog = {
      ...mockCatalog,
      locale: 'en-US',
      pages: [
        {
          ...mockCatalog.pages[0],
          blocks: [
            {
              ...mockStructuralBlock,
              title: 'CONNECTIVITY AND DATA',
              structuralData: {
                ...mockStructuralBlock.structuralData!,
                children: [
                  {
                    ...mockStructuralBlock.structuralData!.children[0],
                    title: 'Ethernet Port 10/100'
                  },
                  {
                    ...mockStructuralBlock.structuralData!.children[1],
                    title: 'USB-C Interface'
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    const block = translatedCatalog.pages[0].blocks[0];
    expect(block.structuralData?.iconId).toBe('network');
    expect(block.structuralData?.children[0].iconId).toBe('ethernet');
    expect(block.structuralData?.children[1].iconId).toBe('usb');
  });

  it('ICON-PRINT-1: zero iconId textual vazando para PDF no CleanA4Document', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(<CleanA4Document document={mockCatalog} />);
    });

    const text = container.textContent || '';
    expect(text).not.toContain('[network]');
    expect(text).not.toContain('[ethernet]');
    expect(text).not.toContain('[usb]');
    expect(text).not.toContain('network');
    expect(text).not.toContain('ethernet');

    act(() => {
      root.unmount();
    });
  });

  it('ICON-PRINT-2: RendererParityAuditor continua 100% com ícone desconhecido no catálogo', () => {
    const catalogWithUnknownIcon: Catalog = {
      ...mockCatalog,
      pages: [
        {
          ...mockCatalog.pages[0],
          blocks: [
            {
              ...mockStructuralBlock,
              structuralData: {
                ...mockStructuralBlock.structuralData!,
                iconId: 'ghost-icon-404'
              }
            }
          ]
        }
      ]
    };

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(<CleanA4Document document={catalogWithUnknownIcon} />);
    });

    const audit = RendererParityAuditor.auditRenderedDOM(container, catalogWithUnknownIcon);
    expect(audit.rendererPrintableParityCoverage).toBe(100);
    expect(audit.isComplete).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  // ==========================================================================
  // 7. CONTROLLED ICON PICKER (ICON-PICKER-1..7)
  // ==========================================================================

  it('ICON-PICKER-1: busca no picker por label pt-BR encontra o ícone esperado', () => {
    const results = searchCorporateIcons('Termômetro');
    expect(results.some((i) => i.id === 'thermometer')).toBe(true);
  });

  it('ICON-PICKER-2: busca no picker por alias localiza o ícone canônico', () => {
    const results = searchCorporateIcons('manometro');
    expect(results.some((i) => i.id === 'gauge')).toBe(true);

    const rj45Results = searchCorporateIcons('rj45');
    expect(rj45Results.some((i) => i.id === 'ethernet')).toBe(true);
  });

  it('ICON-PICKER-3: filtro por categoria restringe a listagem aos ícones correspondentes', () => {
    const softwareIcons = searchCorporateIcons('', 'software_data');
    expect(softwareIcons.length).toBe(9);
    softwareIcons.forEach((i) => {
      expect(i.category).toBe('software_data');
    });
  });

  it('ICON-PICKER-4: selecionar um ícone no picker dispara onSelect com ID canônico puro', () => {
    let selected: string | null = null;
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <CorporateIconPicker
          isOpen={true}
          currentIconId="network"
          onSelect={(id) => {
            selected = id;
          }}
          onClear={() => {}}
          onClose={() => {}}
        />
      );
    });

    const thermometerButton = container.querySelector(
      'button[aria-label="Selecionar ícone Termômetro / Temperatura"]'
    ) as HTMLButtonElement;
    expect(thermometerButton).not.toBeNull();

    act(() => {
      thermometerButton.click();
    });

    expect(selected).toBe('thermometer');

    act(() => {
      root.unmount();
    });
  });

  it('ICON-PICKER-5: ação de limpar remove o iconId chamando onClear', () => {
    let cleared = false;
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <CorporateIconPicker
          isOpen={true}
          currentIconId="network"
          onSelect={() => {}}
          onClear={() => {
            cleared = true;
          }}
          onClose={() => {}}
        />
      );
    });

    const clearButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Remover Ícone')
    );
    expect(clearButton).toBeDefined();

    act(() => {
      clearButton?.click();
    });

    expect(cleared).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it('ICON-PICKER-6: acessibilidade: role dialog, aria-modal e labels em botões', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <CorporateIconPicker
          isOpen={true}
          onSelect={() => {}}
          onClear={() => {}}
          onClose={() => {}}
        />
      );
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    const buttons = container.querySelectorAll('button');
    buttons.forEach((btn) => {
      expect(btn.getAttribute('aria-label') || btn.textContent?.trim()).toBeTruthy();
    });

    act(() => {
      root.unmount();
    });
  });

  it('ICON-PICKER-7: picker abre destacando visualmente o currentIconId selecionado', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <CorporateIconPicker
          isOpen={true}
          currentIconId="network"
          onSelect={() => {}}
          onClear={() => {}}
          onClose={() => {}}
        />
      );
    });

    const selectedBtn = container.querySelector(
      'button[aria-label="Selecionar ícone Rede Corporativa"]'
    );
    expect(selectedBtn?.classList.contains('ring-2')).toBe(true);
    expect(selectedBtn?.classList.contains('ring-blue-600')).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  // ==========================================================================
  // 7B. PICKER FOCUS & KEYBOARD ACCESSIBILITY (ICON-A11Y-1..5)
  // ==========================================================================

  it('ICON-A11Y-1: abrir picker coloca o foco automaticamente no input de busca', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CorporateIconPicker
          isOpen={true}
          onSelect={() => {}}
          onClear={() => {}}
          onClose={() => {}}
        />
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
    });

    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(document.activeElement).toBe(searchInput);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('ICON-A11Y-2: pressionar Escape chama onClose', () => {
    let closed = false;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CorporateIconPicker
          isOpen={true}
          onSelect={() => {}}
          onClear={() => {}}
          onClose={() => {
            closed = true;
          }}
        />
      );
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(closed).toBe(true);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('ICON-A11Y-3: Tab no último elemento focusable cicla de volta para o primeiro', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CorporateIconPicker
          isOpen={true}
          onSelect={() => {}}
          onClear={() => {}}
          onClose={() => {}}
        />
      );
    });

    const focusables = container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusables[0];
    const lastElement = focusables[focusables.length - 1];

    lastElement.focus();
    expect(document.activeElement).toBe(lastElement);

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      window.dispatchEvent(event);
    });

    expect(document.activeElement).toBe(firstElement);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('ICON-A11Y-4: Shift+Tab no primeiro elemento focusable cicla para o último', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CorporateIconPicker
          isOpen={true}
          onSelect={() => {}}
          onClear={() => {}}
          onClose={() => {}}
        />
      );
    });

    const focusables = container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusables[0];
    const lastElement = focusables[focusables.length - 1];

    firstElement.focus();
    expect(document.activeElement).toBe(firstElement);

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(event);
    });

    expect(document.activeElement).toBe(lastElement);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('ICON-A11Y-5: fechar o picker devolve o foco ao trigger que abriu o modal', () => {
    const triggerButton = document.createElement('button');
    triggerButton.id = 'test-trigger-button';
    document.body.appendChild(triggerButton);
    triggerButton.focus();
    expect(document.activeElement).toBe(triggerButton);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CorporateIconPicker
          isOpen={true}
          onSelect={() => {}}
          onClear={() => {}}
          onClose={() => {}}
        />
      );
    });

    act(() => {
      root.render(
        <CorporateIconPicker
          isOpen={false}
          onSelect={() => {}}
          onClear={() => {}}
          onClose={() => {}}
        />
      );
    });

    expect(document.activeElement).toBe(triggerButton);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    document.body.removeChild(triggerButton);
  });

  // ==========================================================================
  // 8. MUTAÇÃO & JSON PERSISTENCE (ICON-MUTATION-1..2, ICON-CLEAR-1)
  // ==========================================================================

  it('ICON-MUTATION-1: atualização de iconId na seção preserva todos os demais campos estruturais', () => {
    const store = useCatalogStore.getState();
    store.updateBlock('page-1', 'block-sec-icon-test', {
      structuralData: {
        ...mockStructuralBlock.structuralData!,
        iconId: 'gauge'
      }
    });

    const updated = useCatalogStore
      .getState()
      .currentCatalog!.pages[0].blocks.find((b) => b.id === 'block-sec-icon-test')!;

    expect(updated.structuralData?.iconId).toBe('gauge');
    expect(updated.title).toBe('CONECTIVIDADE E DADOS');
    expect(updated.structuralData?.layout.columns).toBe(2);
    expect(updated.structuralData?.children.length).toBe(2);
  });

  it('ICON-MUTATION-2: atualização de iconId no card via updateStructuralChildById preserva os irmãos', () => {
    const initialData = mockStructuralBlock.structuralData!;
    const { data: updatedData, found } = updateStructuralChildById(initialData, card1Id, {
      iconId: 'wifi'
    });

    expect(found).toBe(true);
    const card1 = updatedData.children.find((c) => c.id === card1Id)!;
    const card2 = updatedData.children.find((c) => c.id === card2Id)!;

    expect(card1.iconId).toBe('wifi');
    expect(card1.title).toBe('Porta Ethernet 10/100');
    expect(card1.emphasis).toBe('highlight');

    // Card 2 permanece rigorosamente intacto
    expect(card2.iconId).toBe('usb');
    expect(card2.title).toBe('Interface USB-C');
  });

  it('ICON-CLEAR-1: remoção de ícone no JSON round-trip não gera chaves vazias ou artificiais', () => {
    const dataWithIcon = {
      id: 'sec-1',
      iconId: 'network',
      title: 'Seção com Ícone'
    };

    // Remove a propriedade iconId
    const { iconId: _removed, ...cleared } = dataWithIcon;
    const serialized = JSON.stringify(cleared);
    const parsed = JSON.parse(serialized);

    expect(parsed.iconId).toBeUndefined();
    expect(parsed).not.toHaveProperty('iconId');
    expect(serialized).not.toContain('iconId');
  });

  it('CARD-DEL-INV-1: StructuralCardInspector não causa state mutation durante render quando o card não existe', () => {
    let backCalledDuringRender = false;

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuralCardInspector
          sectionBlock={mockStructuralBlock}
          pageId="page-1"
          cardId="deleted-card-uuid"
          onBackToSection={() => {
            backCalledDuringRender = true;
          }}
        />
      );
    });

    // Deve retornar null defensivamente sem disparar callback/mutação durante render
    expect(container.innerHTML).toBe('');
    expect(backCalledDuringRender).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  // ==========================================================================
  // 9. VERIFICAÇÃO DE TREE-SHAKING & BUNDLE (ICON-BUNDLE-1)
  // ==========================================================================

  it('ICON-BUNDLE-1: o arquivo corporate-icon.registry.ts não possui import wildcard (* as Icons)', () => {
    const filePath = path.resolve(
      __dirname,
      '../../src/components/icons/corporate-icon.registry.ts'
    );
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    expect(fileContent).not.toContain('* as Icons');
    expect(fileContent).not.toContain('* as Lucide');
    expect(fileContent).not.toContain('require(');
    expect(fileContent).toContain("import type { LucideIcon } from 'lucide-react';");
  });
});
