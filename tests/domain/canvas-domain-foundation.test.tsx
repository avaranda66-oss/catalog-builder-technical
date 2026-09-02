import { describe, it, expect } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ContentBlock,
  Catalog,
  CatalogSchema,
  StructuralSectionDataSchema,
  StructuralLayoutConfigSchema,
  StructuralCardDataSchema,
  A4_PAGE_WIDTH_MM,
  A4_PAGE_HEIGHT_MM,
  mmToPx,
  pxToMm,
  generateStableId,
  duplicateStructuralElement,
  duplicateStructuralSectionBlock,
  A4LayoutEngine,
  LayoutConstraints
} from '../../src/domain/catalog.schema';
import { extractStructuralBlocks } from '../../src/translation/block-extractors/structural.extractor';
import { PrintableTextRegistry } from '../../src/translation/printable-text.registry';
import { TranslationApplierRegistry } from '../../src/translation/translation-applier.registry';
import { StructuralSectionBlock } from '../../src/components/editor/blocks/StructuralSectionBlock';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';
import { RendererParityAuditor } from '../../src/translation/renderer-parity.auditor';

describe('Fase 3A.1 — Canvas Domain Foundation', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  // Fixture oficial do Piloto: "CONECTIVIDADE E LIGAÇÕES FRONTAIS"
  // Atende estritamente às correções:
  // - ContentBlock possui title, subtitle, badgeText (Single Source of Truth)
  // - structuralData contém apenas version, iconId, layout e children
  // - UUIDs determinísticos válidos RFC 4122 v4
  const createPilotStructuralBlock = (): ContentBlock => ({
    id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    type: 'structural_section',
    title: 'CONECTIVIDADE E LIGAÇÕES FRONTAIS',
    subtitle: 'Painel digital com interfaces de campo e barramentos industriais isolados.',
    badgeText: 'Digital & Metrology 4.0',
    structuralData: {
      version: 1,
      iconId: 'network',
      layout: {
        mode: 'grid',
        columns: 4,
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
          id: '11111111-1111-4111-8111-111111111111',
          type: 'feature_card',
          iconId: 'monitor',
          title: 'Software',
          body: 'Integração direta com Presys Suite e calibração RBC automatizada.',
          badge: 'Software',
          emphasis: 'normal'
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          type: 'feature_card',
          iconId: 'network',
          title: 'Protocolos',
          body: 'Comunicação nativa HART® e Modbus RTU/TCP para leitura e ajustes.',
          badge: 'Protocolos',
          emphasis: 'normal'
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          type: 'feature_card',
          iconId: 'usb',
          title: 'Hardware',
          body: 'Portas USB e Ethernet frontais para exportação de relatórios.',
          badge: 'Hardware',
          emphasis: 'normal'
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          type: 'feature_card',
          iconId: 'database',
          title: 'Memória',
          body: 'Datalogger interno com capacidade superior a 100.000 registros.',
          badge: 'Memória',
          emphasis: 'normal'
        }
      ]
    }
  });

  const createCatalogWithBlock = (block: ContentBlock, pageNumber = 1): Catalog => ({
    id: 'cat-test-structural-3a1',
    title: 'Catálogo TA-35N com Seção Estrutural',
    themeId: 'presys-default',
    version: 1,
    locale: 'pt-BR',
    pages: [
      {
        id: `page-${pageNumber}`,
        pageNumber,
        blocks: [block]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // ==========================================================================
  // GRUPO 1: DOMAIN & IDENTITY (8 Testes)
  // ==========================================================================

  it('CANVAS-DOMAIN-1: Structural section schema valida a fixture oficial com sucesso', () => {
    const block = createPilotStructuralBlock();
    expect(block.structuralData).toBeDefined();
    const parsed = StructuralSectionDataSchema.parse(block.structuralData);
    expect(parsed.version).toBe(1);
    expect(parsed.children.length).toBe(4);
    expect(parsed.layout.columns).toBe(4);
    expect(parsed.layout.widthMode).toBe('fill');
  });

  it('CANVAS-DOMAIN-2: Os 4 cards da fixture possuem UUIDs estáveis únicos válidos', () => {
    const block = createPilotStructuralBlock();
    const children = block.structuralData!.children;
    const ids = children.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(4);

    // Valida que generateStableId gera UUID v4 RFC 4122 válido
    const runtimeId = generateStableId();
    expect(runtimeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('CANVAS-DOMAIN-3: Serializar (JSON.stringify) e desserializar (JSON.parse) preserva 100% dos IDs e da estrutura', () => {
    const block = createPilotStructuralBlock();
    const jsonStr = JSON.stringify(block);
    const restored: ContentBlock = JSON.parse(jsonStr);

    expect(restored.id).toBe(block.id);
    expect(restored.title).toBe(block.title);
    expect(restored.structuralData?.children.length).toBe(4);
    expect(restored.structuralData?.children[0].id).toBe('11111111-1111-4111-8111-111111111111');
    expect(restored.structuralData?.children[3].id).toBe('44444444-4444-4444-8444-444444444444');
  });

  it('CANVAS-DOMAIN-4: Reordenar os cards permuta a ordem sem alterar nenhum dos IDs originais', () => {
    const block = createPilotStructuralBlock();
    const originalChildren = [...block.structuralData!.children];

    // Reordena: [3, 0, 1, 2]
    const reordered = [
      originalChildren[3],
      originalChildren[0],
      originalChildren[1],
      originalChildren[2]
    ];

    expect(reordered[0].id).toBe('44444444-4444-4444-8444-444444444444');
    expect(reordered[0].title).toBe('Memória');
    expect(reordered[1].id).toBe('11111111-1111-4111-8111-111111111111');
    expect(reordered[1].title).toBe('Software');
  });

  it('CANVAS-DOMAIN-5: duplicateStructuralElement gera novo UUID para o card preservando propriedades', () => {
    const block = createPilotStructuralBlock();
    const originalCard = block.structuralData!.children[0];
    const clonedCard = duplicateStructuralElement(originalCard);

    expect(clonedCard.id).not.toBe(originalCard.id);
    expect(clonedCard.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(clonedCard.title).toBe(originalCard.title);
    expect(clonedCard.body).toBe(originalCard.body);
    expect(clonedCard.iconId).toBe(originalCard.iconId);
  });

  it('CANVAS-DOMAIN-6: Seção estrutural vazia (children: []) é schema-valid', () => {
    const emptySectionData = {
      version: 1,
      layout: {
        mode: 'grid' as const,
        columns: 4,
        widthMode: 'fill' as const,
        gap: 'sm' as const,
        padding: 'md' as const,
        density: 'normal' as const,
        align: 'left' as const,
        background: 'soft' as const,
        border: 'subtle' as const,
        radius: 'sm' as const
      },
      children: []
    };

    const parsed = StructuralSectionDataSchema.parse(emptySectionData);
    expect(parsed.children).toEqual([]);

    const validation = A4LayoutEngine.validateSection(parsed, { availableWidthMm: 182 });
    expect(validation.valid).toBe(true);
    expect(validation.issues.some((i) => i.code === 'EMPTY_SECTION')).toBe(true);
  });

  it('CANVAS-DOMAIN-7: Todos os IDs da fixture satisfazem z.string().uuid() estritamente', () => {
    const block = createPilotStructuralBlock();
    const uuidSchema = StructuralCardDataSchema.shape.id;

    for (const card of block.structuralData!.children) {
      expect(() => uuidSchema.parse(card.id)).not.toThrow();
    }
  });

  it('CANVAS-DOMAIN-8: duplicateStructuralSectionBlock gera novo ContentBlock.id e novos IDs para TODOS os descendants', () => {
    const block = createPilotStructuralBlock();
    const clonedBlock = duplicateStructuralSectionBlock(block);

    expect(clonedBlock.id).not.toBe(block.id);
    expect(clonedBlock.title).toBe(block.title);
    expect(clonedBlock.subtitle).toBe(block.subtitle);
    expect(clonedBlock.badgeText).toBe(block.badgeText);
    expect(clonedBlock.structuralData?.children.length).toBe(4);

    const originalIds = new Set(block.structuralData!.children.map((c) => c.id));
    for (const clonedChild of clonedBlock.structuralData!.children) {
      expect(originalIds.has(clonedChild.id)).toBe(false);
      expect(clonedChild.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  });

  // ==========================================================================
  // GRUPO 2: LAYOUT & MILÍMETROS (6 Testes)
  // ==========================================================================

  it('CANVAS-LAYOUT-1: Conversão canônica mmToPx e pxToMm retorna floats precisos sem arredondamento interno', () => {
    expect(A4_PAGE_WIDTH_MM).toBe(210);
    expect(A4_PAGE_HEIGHT_MM).toBe(297);

    const pxFor210mm = mmToPx(210, 96);
    expect(pxFor210mm).toBeCloseTo(793.7007, 3);
    expect(typeof pxFor210mm).toBe('number');

    const mmFor794px = pxToMm(794, 96);
    expect(mmFor794px).toBeCloseTo(210.079, 3);
  });

  it('CANVAS-LAYOUT-2: Colunas inválidas (0, 7, -1) falham na validação do Zod e do A4LayoutEngine', () => {
    expect(() =>
      StructuralLayoutConfigSchema.parse({
        columns: 0,
        widthMode: 'fill'
      })
    ).toThrow();

    expect(() =>
      StructuralLayoutConfigSchema.parse({
        columns: 7,
        widthMode: 'fill'
      })
    ).toThrow();

    const invalidSection = {
      version: 1 as const,
      layout: {
        mode: 'grid' as const,
        columns: 8,
        widthMode: 'fill' as const,
        gap: 'sm' as const,
        padding: 'md' as const,
        density: 'normal' as const,
        align: 'left' as const,
        background: 'soft' as const,
        border: 'subtle' as const,
        radius: 'sm' as const
      },
      children: []
    };

    const res = A4LayoutEngine.validateSection(invalidSection, { availableWidthMm: 182 });
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_COLUMNS')).toBe(true);
  });

  it('CANVAS-LAYOUT-3: Elemento com fixedWidthMm superior ao availableWidthMm fornecido nas constraints falha na validação', () => {
    const fixedBlock = createPilotStructuralBlock();
    fixedBlock.structuralData!.layout.widthMode = 'fixed';
    fixedBlock.structuralData!.layout.fixedWidthMm = 200; // 200mm > 180mm

    const constraints: LayoutConstraints = { availableWidthMm: 180 };
    const res = A4LayoutEngine.validateSection(fixedBlock.structuralData!, constraints);

    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'OUTSIDE_SAFE_WIDTH')).toBe(true);
  });

  it('CANVAS-LAYOUT-4: Catálogos legados sem structuralData continuam 100% válidos', () => {
    const legacyBlock: ContentBlock = {
      id: 'legacy-block-1',
      type: 'hero_banner',
      title: 'BANNER HERO LEGADO',
      subtitle: 'Sem structuralData'
    };

    const legacyCatalog: Catalog = {
      id: 'cat-legacy',
      title: 'Catálogo Legado',
      themeId: 'presys-default',
      version: 1,
      locale: 'pt-BR',
      pages: [
        {
          id: 'page-legacy-1',
          pageNumber: 1,
          blocks: [legacyBlock]
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    expect(() => CatalogSchema.parse(legacyCatalog)).not.toThrow();
  });

  it('CANVAS-LAYOUT-5: widthMode: "fill" é válido independente de largura estática pré-definida', () => {
    const block = createPilotStructuralBlock();
    expect(block.structuralData!.layout.widthMode).toBe('fill');

    // Valida com restrições de 150mm e 190mm sem falhar
    const res150 = A4LayoutEngine.validateSection(block.structuralData!, { availableWidthMm: 150 });
    expect(res150.valid).toBe(true);

    const res190 = A4LayoutEngine.validateSection(block.structuralData!, { availableWidthMm: 190 });
    expect(res190.valid).toBe(true);
  });

  it('CANVAS-LAYOUT-6: widthMode: "fixed" sem fixedWidthMm ou com valor <= 0 falha no schema Zod (superRefine)', () => {
    // 1. Sem fixedWidthMm
    expect(() =>
      StructuralLayoutConfigSchema.parse({
        mode: 'grid',
        columns: 4,
        widthMode: 'fixed'
      })
    ).toThrow(/fixedWidthMm é obrigatório/);

    // 2. Com fixedWidthMm <= 0
    expect(() =>
      StructuralLayoutConfigSchema.parse({
        mode: 'grid',
        columns: 4,
        widthMode: 'fixed',
        fixedWidthMm: -5
      })
    ).toThrow(/fixedWidthMm deve ser maior que 0/);

    // 3. Com fixedWidthMm > 0 válido
    const valid = StructuralLayoutConfigSchema.parse({
      mode: 'grid',
      columns: 4,
      widthMode: 'fixed',
      fixedWidthMm: 150
    });
    expect(valid.fixedWidthMm).toBe(150);
  });

  // ==========================================================================
  // GRUPO 3: TRADUÇÃO & DESACOPLAMENTO (6 Testes)
  // ==========================================================================

  it('CANVAS-I18N-1: Título, subtítulo e badge da seção são extraídos com b${block.id}_sec_title (sem pageNumber no ID)', () => {
    const block = createPilotStructuralBlock();
    const nodes = extractStructuralBlocks(block, 'page-1', 1);

    const titleNode = nodes.find((n) => n.id === `b${block.id}_sec_title`);
    const subNode = nodes.find((n) => n.id === `b${block.id}_sec_subtitle`);
    const badgeNode = nodes.find((n) => n.id === `b${block.id}_sec_badge`);

    expect(titleNode).toBeDefined();
    expect(titleNode?.sourceText).toBe('CONECTIVIDADE E LIGAÇÕES FRONTAIS');
    expect(titleNode?.policy).toBe('translate');

    expect(subNode).toBeDefined();
    expect(subNode?.sourceText).toBe('Painel digital com interfaces de campo e barramentos industriais isolados.');

    expect(badgeNode).toBeDefined();
    expect(badgeNode?.sourceText).toBe('Digital & Metrology 4.0');
  });

  it('CANVAS-I18N-2: Títulos, corpos e badges dos cards são extraídos com b${block.id}_card_${child.id}_... (sem pageNumber no ID)', () => {
    const block = createPilotStructuralBlock();
    const nodes = extractStructuralBlocks(block, 'page-1', 1);

    const card1Id = '11111111-1111-4111-8111-111111111111';
    const cardTitle = nodes.find((n) => n.id === `b${block.id}_card_${card1Id}_title`);
    const cardBody = nodes.find((n) => n.id === `b${block.id}_card_${card1Id}_body`);
    const cardBadge = nodes.find((n) => n.id === `b${block.id}_card_${card1Id}_badge`);

    expect(cardTitle).toBeDefined();
    expect(cardTitle?.sourceText).toBe('Software');
    expect(cardTitle?.path).toBe('structuralData.children[0].title');

    expect(cardBody).toBeDefined();
    expect(cardBody?.sourceText).toBe('Integração direta com Presys Suite e calibração RBC automatizada.');

    expect(cardBadge).toBeDefined();
    expect(cardBadge?.sourceText).toBe('Software');
  });

  it('CANVAS-I18N-3: Os Node IDs dos cards não se alteram após reordenação do array de cards', () => {
    const block = createPilotStructuralBlock();
    const nodesBefore = extractStructuralBlocks(block, 'page-1', 1);

    // Reordena cards
    block.structuralData!.children.reverse();
    const nodesAfter = extractStructuralBlocks(block, 'page-1', 1);

    // Os IDs devem ser os mesmos
    const idsBefore = nodesBefore.map((n) => n.id).sort();
    const idsAfter = nodesAfter.map((n) => n.id).sort();
    expect(idsBefore).toEqual(idsAfter);
  });

  it('CANVAS-I18N-4: Ciclo extract -> translate -> apply -> extract preserva correspondência 1:1', () => {
    const block = createPilotStructuralBlock();
    const catalog = createCatalogWithBlock(block, 1);

    const sourceNodes = PrintableTextRegistry.extractCatalogNodes(catalog);
    expect(sourceNodes.length).toBe(16); // 1 do doc title + 3 da seção + 4*3 dos cards = 16 nós

    // Simula traduções
    const translations = sourceNodes.map((n) => ({
      id: n.id,
      text: `[FR] ${n.sourceText}`
    }));

    const applierRes = TranslationApplierRegistry.apply(catalog, translations, 'fr-FR');
    expect(applierRes.unappliedCount).toBe(0);

    const targetCatalog = applierRes.translatedCatalog;
    const targetBlock = targetCatalog.pages[0].blocks[0];

    expect(targetBlock.title).toBe('[FR] CONECTIVIDADE E LIGAÇÕES FRONTAIS');
    expect(targetBlock.structuralData?.children[0].title).toBe('[FR] Software');
    expect(targetBlock.structuralData?.children[0].body).toBe('[FR] Integração direta com Presys Suite e calibração RBC automatizada.');

    // Extrai do target e verifica correspondência 1:1
    const targetNodes = PrintableTextRegistry.extractCatalogNodes(targetCatalog);
    expect(targetNodes.length).toBe(sourceNodes.length);
    for (let i = 0; i < sourceNodes.length; i++) {
      expect(targetNodes[i].id).toBe(sourceNodes[i].id);
      expect(targetNodes[i].sourceText).toBe(`[FR] ${sourceNodes[i].sourceText}`);
    }
  });

  it('CANVAS-I18N-5: iconId e configurações de layout NÃO são extraídos para tradução', () => {
    const block = createPilotStructuralBlock();
    const nodes = extractStructuralBlocks(block, 'page-1', 1);

    const hasIconNode = nodes.some((n) => n.sourceText === 'network' || n.sourceText === 'monitor');
    expect(hasIconNode).toBe(false);

    const hasLayoutNode = nodes.some((n) => n.path.includes('layout'));
    expect(hasLayoutNode).toBe(false);
  });

  it('CANVAS-I18N-6: Mover structural_section da Página 1 para a Página 2 mantém rigorosamente idênticos todos os Node IDs', () => {
    const block = createPilotStructuralBlock();

    // Extração na Página 1
    const nodesPage1 = extractStructuralBlocks(block, 'page-1', 1);

    // Simula mover o bloco para a Página 2
    const nodesPage2 = extractStructuralBlocks(block, 'page-2', 2);

    expect(nodesPage1.map((n) => n.id)).toEqual(nodesPage2.map((n) => n.id));
  });

  // ==========================================================================
  // GRUPO 4: PERSISTÊNCIA & VARIANTES (3 Testes)
  // ==========================================================================

  it('CANVAS-PERSIST-1: Serializar e desserializar catálogo com seção estrutural mantém integridade idêntica', () => {
    const block = createPilotStructuralBlock();
    const catalog = createCatalogWithBlock(block, 1);

    const json = JSON.stringify(catalog);
    const parsed: Catalog = JSON.parse(json);

    expect(parsed.pages[0].blocks[0].type).toBe('structural_section');
    expect(parsed.pages[0].blocks[0].structuralData?.children.length).toBe(4);
    expect(parsed.pages[0].blocks[0].structuralData?.children[1].id).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('CANVAS-PERSIST-2: CatalogSchema.parse(JSON.parse(JSON.stringify(...))) preserva o domínio estrutural completo', () => {
    const block = createPilotStructuralBlock();
    const catalog = createCatalogWithBlock(block, 1);

    const raw = JSON.parse(JSON.stringify(catalog));
    const validated = CatalogSchema.parse(raw);

    const validatedBlock = validated.pages[0].blocks[0];
    expect(validatedBlock.type).toBe('structural_section');
    expect(validatedBlock.title).toBe('CONECTIVIDADE E LIGAÇÕES FRONTAIS');
    expect(validatedBlock.subtitle).toBe('Painel digital com interfaces de campo e barramentos industriais isolados.');
    expect(validatedBlock.badgeText).toBe('Digital & Metrology 4.0');
    expect(validatedBlock.structuralData?.version).toBe(1);
    expect(validatedBlock.structuralData?.iconId).toBe('network');
    expect(validatedBlock.structuralData?.layout.columns).toBe(4);
    expect(validatedBlock.structuralData?.children[0].title).toBe('Software');
  });

  it('CANVAS-VARIANT-1: Localized variant preserva IDs de blocos e cards, clonando layout e iconId, alterando apenas textos', () => {
    const block = createPilotStructuralBlock();
    const catalog = createCatalogWithBlock(block, 1);

    const translations = [
      { id: `b${block.id}_sec_title`, text: 'CONNECTIVITÉ ET LIAISONS FRONTALES' },
      { id: `b${block.id}_card_11111111-1111-4111-8111-111111111111_title`, text: 'Logiciel' },
      { id: `b${block.id}_card_11111111-1111-4111-8111-111111111111_body`, text: 'Intégration directe avec Presys Suite.' }
    ];

    const result = TranslationApplierRegistry.apply(catalog, translations, 'fr-FR');
    const translatedBlock = result.translatedCatalog.pages[0].blocks[0];

    // IDs preservados
    expect(translatedBlock.id).toBe(block.id);
    expect(translatedBlock.structuralData?.children[0].id).toBe('11111111-1111-4111-8111-111111111111');
    expect(translatedBlock.structuralData?.children[1].id).toBe('22222222-2222-4222-8222-222222222222');

    // Layout e iconId preservados
    expect(translatedBlock.structuralData?.iconId).toBe('network');
    expect(translatedBlock.structuralData?.layout.columns).toBe(4);

    // Textos atualizados
    expect(translatedBlock.title).toBe('CONNECTIVITÉ ET LIAISONS FRONTALES');
    expect(translatedBlock.structuralData?.children[0].title).toBe('Logiciel');
    expect(translatedBlock.structuralData?.children[0].body).toBe('Intégration directe avec Presys Suite.');
  });

  // ==========================================================================
  // GRUPO 5: RENDER PARITY (2 Testes)
  // ==========================================================================

  it('CANVAS-RENDER-1: structural_section existente é renderizado com sucesso no editor (StructuralSectionBlock) sem ser ignorado', async () => {
    const block = createPilotStructuralBlock();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(StructuralSectionBlock, { block, pageId: 'page-1', isSelected: false }));
    });

    expect(container.querySelector('[data-block-type="structural_section"]')).not.toBeNull();
    expect(container.textContent).toContain('CONECTIVIDADE E LIGAÇÕES FRONTAIS');
    expect(container.textContent).toContain('Software');
    expect(container.textContent).toContain('Protocolos');
    expect(container.textContent).toContain('Hardware');
    expect(container.textContent).toContain('Memória');

    await act(async () => root.unmount());
  });

  it('CANVAS-RENDER-2: structural_section existente é renderizado com sucesso no CleanA4Document para PDF sem ser ignorado', async () => {
    const block = createPilotStructuralBlock();
    const catalog = createCatalogWithBlock(block, 1);

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: catalog }));
    });

    expect(container.querySelector('[data-block-type="structural_section"]')).not.toBeNull();
    expect(container.textContent).toContain('CONECTIVIDADE E LIGAÇÕES FRONTAIS');
    expect(container.textContent).toContain('Integração direta com Presys Suite e calibração RBC automatizada.');

    await act(async () => root.unmount());
  });

  it('CANVAS-RENDER-3: Não há vazamento textual de iconId no DOM ou no PDF', async () => {
    const block = createPilotStructuralBlock();
    const catalog = createCatalogWithBlock(block, 1);

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: catalog }));
    });

    const text = container.textContent || '';
    expect(text).not.toContain('[network]');
    expect(text).not.toContain('[monitor]');
    expect(text).not.toContain('[usb]');
    expect(text).not.toContain('[database]');
    expect(text).not.toContain('network');
    expect(text).not.toContain('monitor');
    expect(text).not.toContain('usb');
    expect(text).not.toContain('database');

    await act(async () => root.unmount());
  });

  // ==========================================================================
  // GRUPO 6: PARIDADE ESTRITA COM RENDERER PARITY AUDITOR (2 Testes)
  // ==========================================================================

  it('CANVAS-PARITY-1: RendererParityAuditor atinge 100% de cobertura com 0 órfãos e 0 ausências na seção estrutural', async () => {
    const block = createPilotStructuralBlock();
    const catalog = createCatalogWithBlock(block, 1);

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: catalog }));
    });

    const result = RendererParityAuditor.auditRenderedDOM(container, catalog);

    if (result.orphanTextNodes.length > 0) {
      console.error('ORPHAN TEXT NODES:', JSON.stringify(result.orphanTextNodes, null, 2));
    }
    if (result.missingExpectedNodes.length > 0) {
      console.error('MISSING EXPECTED NODES:', JSON.stringify(result.missingExpectedNodes, null, 2));
    }
    if (result.sourceMismatchNodes.length > 0) {
      console.error('SOURCE MISMATCH NODES:', JSON.stringify(result.sourceMismatchNodes, null, 2));
    }

    expect(result.orphanTextNodes.length).toBe(0);
    expect(result.missingExpectedNodes.length).toBe(0);
    expect(result.sourceMismatchNodes.length).toBe(0);
    expect(result.rendererPrintableParityCoverage).toBe(100);
    expect(result.isComplete).toBe(true);

    await act(async () => root.unmount());
  });

  it('CANVAS-PARITY-2: Target traduzido mantém paridade bidirecional no DOM com 0 órfãos e mesmos stable node IDs', async () => {
    const block = createPilotStructuralBlock();
    const catalog = createCatalogWithBlock(block, 1);

    const translations = [
      { id: `b${block.id}_sec_title`, text: 'CONNECTIVITÉ ET LIAISONS FRONTALES' },
      { id: `b${block.id}_sec_subtitle`, text: 'Panneau numérique avec interfaces de terrain isolées.' },
      { id: `b${block.id}_sec_badge`, text: 'Numérique & Métrologie 4.0' },
      { id: `b${block.id}_card_11111111-1111-4111-8111-111111111111_title`, text: 'Logiciel' },
      { id: `b${block.id}_card_11111111-1111-4111-8111-111111111111_body`, text: 'Intégration directe avec Presys Suite.' },
      { id: `b${block.id}_card_11111111-1111-4111-8111-111111111111_badge`, text: 'Logiciel' },
      { id: `b${block.id}_card_22222222-2222-4222-8222-222222222222_title`, text: 'Protocoles' },
      { id: `b${block.id}_card_22222222-2222-4222-8222-222222222222_body`, text: 'Communication native HART® et Modbus.' },
      { id: `b${block.id}_card_22222222-2222-4222-8222-222222222222_badge`, text: 'Protocoles' },
      { id: `b${block.id}_card_33333333-3333-4333-8333-333333333333_title`, text: 'Matériel' },
      { id: `b${block.id}_card_33333333-3333-4333-8333-333333333333_body`, text: 'Ports USB et Ethernet frontaux.' },
      { id: `b${block.id}_card_33333333-3333-4333-8333-333333333333_badge`, text: 'Matériel' },
      { id: `b${block.id}_card_44444444-4444-4444-8444-444444444444_title`, text: 'Mémoire' },
      { id: `b${block.id}_card_44444444-4444-4444-8444-444444444444_body`, text: 'Datalogger interne avec haute capacité.' },
      { id: `b${block.id}_card_44444444-4444-4444-8444-444444444444_badge`, text: 'Mémoire' }
    ];

    const { translatedCatalog, unappliedCount } = TranslationApplierRegistry.apply(catalog, translations, 'fr-FR');
    expect(unappliedCount).toBe(0);

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: translatedCatalog }));
    });

    const result = RendererParityAuditor.auditRenderedDOM(container, translatedCatalog);

    expect(result.orphanTextNodes.length).toBe(0);
    expect(result.missingExpectedNodes.length).toBe(0);
    expect(result.sourceMismatchNodes.length).toBe(0);
    expect(result.rendererPrintableParityCoverage).toBe(100);
    expect(result.isComplete).toBe(true);

    await act(async () => root.unmount());
  });
});
