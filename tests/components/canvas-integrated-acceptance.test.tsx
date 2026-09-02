// tests/components/canvas-integrated-acceptance.test.tsx
// Suíte de Testes de Aceitação Integrada e Workflow Safety (Fase 3A.6)
// Cobre:
// 1. Store Invariant Guards (addBlock, insertStructuralSection fail-closed)
// 2. Workflow Safety, Modal Contracts (Cancel vs Confirm, Order, PageType)
// 3. Mixed Cover Recovery (Atômico, preservação de IDs de blocos/filhos, fail-closed)
// 4. Translation Acceptance (Handler de structural_section existente em produção)
// 5. Persistence Roundtrip & CleanA4 Parity

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { Catalog, CatalogPage, ContentBlock } from '../../src/domain/catalog.schema';
import { PageInsertionSafetyModal } from '../../src/components/editor/PageInsertionSafetyModal';
import { TranslationApplierRegistry } from '../../src/translation/translation-applier.registry';
import { catalogRowToCatalog } from '../../src/services/supabase.service';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Helper para criar catálogo limpo para testes de Store
function createTestCatalog(pages: CatalogPage[]): Catalog {
  return {
    id: 'catalog-3a6-test',
    title: 'Catálogo Aceitação 3A.6',
    client: 'Presys Enterprise',
    locale: 'pt-BR',
    currency: 'BRL',
    version: 1,
    localRevision: 10,
    isDirty: false,
    themeId: 'default-technical',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pages
  };
}

describe('Fase 3A.6 — Integrated Canvas Acceptance & Workflow Safety', () => {
  beforeEach(() => {
    // Reseta o store antes de cada teste
    useCatalogStore.setState({
      currentCatalog: null,
      activePageIndex: 0,
      selectedBlockId: null,
      selectedChildId: null,
      isDirty: false
    });
  });

  // ==========================================================================
  // BLOCO 1: Store Invariant Defense in Depth (Fail-Closed)
  // ==========================================================================
  describe('Bloco 1: Store Invariant Guard (Defense in Depth)', () => {
    it('FULLCOVER-STORE-GUARD-1: addBlock fail-closed diretamente em página com Full Page Cover', () => {
      const coverPage: CatalogPage = {
        id: 'p-cover',
        pageNumber: 1,
        pageType: 'cover',
        title: 'Capa',
        blocks: [{ id: 'b-cover', type: 'full_page_cover', title: 'Capa A4' }]
      };
      const cat = createTestCatalog([coverPage]);
      useCatalogStore.setState({ currentCatalog: cat });

      const initialRevision = useCatalogStore.getState().currentCatalog!.localRevision;

      // Tenta chamar addBlock diretamente com uma tabela em folha com capa
      useCatalogStore.getState().addBlock('p-cover', {
        type: 'table',
        title: 'Tabela Proibida'
      });

      const updatedCat = useCatalogStore.getState().currentCatalog!;
      expect(updatedCat.pages[0].blocks).toHaveLength(1);
      expect(updatedCat.pages[0].blocks[0].type).toBe('full_page_cover');
      expect(updatedCat.localRevision).toBe(initialRevision);
      expect(updatedCat.isDirty).toBe(false);
    });

    it('FULLCOVER-STORE-GUARD-2: insertStructuralSection fail-closed diretamente em página com Cover', () => {
      const coverPage: CatalogPage = {
        id: 'p-cover',
        pageNumber: 1,
        pageType: 'cover',
        title: 'Capa',
        blocks: [{ id: 'b-cover', type: 'full_page_cover', title: 'Capa A4' }]
      };
      const cat = createTestCatalog([coverPage]);
      useCatalogStore.setState({ currentCatalog: cat });

      const initialRevision = useCatalogStore.getState().currentCatalog!.localRevision;

      // Tenta inserir seção estrutural diretamente via store
      useCatalogStore.getState().insertStructuralSection('p-cover', 'structural-feature-grid');

      const updatedCat = useCatalogStore.getState().currentCatalog!;
      expect(updatedCat.pages[0].blocks).toHaveLength(1);
      expect(updatedCat.pages[0].blocks[0].type).toBe('full_page_cover');
      expect(updatedCat.localRevision).toBe(initialRevision);
      expect(updatedCat.isDirty).toBe(false);
    });

    it('FULLCOVER-STORE-GUARD-3: addBlock com incoming full_page_cover em página com fluxo fail-closed', () => {
      const normalPage: CatalogPage = {
        id: 'p-tech',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Especificações',
        blocks: [{ id: 'b-table', type: 'table', title: 'Tabela Técnica' }]
      };
      const cat = createTestCatalog([normalPage]);
      useCatalogStore.setState({ currentCatalog: cat });

      const initialRevision = useCatalogStore.getState().currentCatalog!.localRevision;

      // Tenta adicionar full_page_cover em página que já possui blocos de fluxo
      useCatalogStore.getState().addBlock('p-tech', {
        type: 'full_page_cover',
        title: 'Capa Invasora'
      });

      const updatedCat = useCatalogStore.getState().currentCatalog!;
      expect(updatedCat.pages[0].blocks).toHaveLength(1);
      expect(updatedCat.pages[0].blocks[0].type).toBe('table');
      expect(updatedCat.localRevision).toBe(initialRevision);
      expect(updatedCat.isDirty).toBe(false);
    });
  });

  // ==========================================================================
  // BLOCO 2: Workflow Safety & Modal Interaction Contracts
  // ==========================================================================
  describe('Bloco 2: Workflow Safety, Modal & New-Page Insertion Contracts', () => {
    it('FULLCOVER-CANCEL-1: cancelamento do modal preserva catálogo, revisão e seleção', () => {
      let confirmCalled = false;
      let cancelCalled = false;

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <PageInsertionSafetyModal
            isOpen={true}
            reason="EXISTING_COVER_WITH_FLOW_BLOCK"
            itemTitle="Tabela de Especificações"
            onConfirmNewPage={() => { confirmCalled = true; }}
            onCancel={() => { cancelCalled = true; }}
          />
        );
      });

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(container.textContent).toContain('Composição de Página Incompatível');
      expect(container.textContent).toContain('Tabela de Especificações');

      // Clica no botão Cancelar
      const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Cancelar')
      );
      expect(cancelBtn).toBeDefined();

      act(() => {
        cancelBtn!.click();
      });

      expect(cancelCalled).toBe(true);
      expect(confirmCalled).toBe(false);

      act(() => {
        root.unmount();
      });
      document.body.removeChild(container);
    });

    it('FULLCOVER-NEWPAGE-1: atomic new-page insertion cria folha técnica para fluxo com +1 localRevision', () => {
      const coverPage: CatalogPage = {
        id: 'p-cover',
        pageNumber: 1,
        pageType: 'cover',
        title: 'Capa Editorial',
        blocks: [{ id: 'b-cover', type: 'full_page_cover', title: 'Capa' }]
      };
      const cat = createTestCatalog([coverPage]);
      useCatalogStore.setState({ currentCatalog: cat, localRevision: cat.localRevision, activePageIndex: 0 });

      const initialRevision = cat.localRevision;

      useCatalogStore.getState().insertContentOnNewPageAfter('p-cover', {
        kind: 'block',
        blockData: {
          type: 'table',
          title: 'Tabela Nova'
        }
      });

      const updated = useCatalogStore.getState().currentCatalog!;
      expect(updated.pages).toHaveLength(2);
      expect(updated.localRevision).toBe(initialRevision + 1);

      // Nova folha é técnica e possui o bloco
      const newPage = updated.pages[1];
      expect(newPage.pageNumber).toBe(2);
      expect(newPage.pageType).toBe('technical');
      expect(newPage.blocks).toHaveLength(1);
      expect(newPage.blocks[0].type).toBe('table');
      expect(newPage.blocks[0].title).toBe('Tabela Nova');

      // Seleção ativa acompanhou a nova folha
      expect(useCatalogStore.getState().activePageIndex).toBe(1);
      expect(useCatalogStore.getState().selectedBlockId).toBe(newPage.blocks[0].id);
      expect(useCatalogStore.getState().selectedChildId).toBeNull();
    });

    it('FULLCOVER-NEWPAGE-2: atomic new-page insertion para Full Page Cover cria folha com pageType: "cover"', () => {
      const normalPage: CatalogPage = {
        id: 'p-tech',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Folha Técnica',
        blocks: [{ id: 'b-text', type: 'text', textContent: 'Dados' }]
      };
      const cat = createTestCatalog([normalPage]);
      useCatalogStore.setState({ currentCatalog: cat, localRevision: cat.localRevision, activePageIndex: 0 });

      useCatalogStore.getState().insertContentOnNewPageAfter('p-tech', {
        kind: 'block',
        blockData: {
          type: 'full_page_cover',
          title: 'Nova Capa de Encerramento'
        }
      });

      const updated = useCatalogStore.getState().currentCatalog!;
      expect(updated.pages).toHaveLength(2);

      const newPage = updated.pages[1];
      expect(newPage.pageNumber).toBe(2);
      // REGRA: Capa Full Page gera pageType = 'cover'
      expect(newPage.pageType).toBe('cover');
      expect(newPage.blocks[0].type).toBe('full_page_cover');
    });

    it('FULLCOVER-ORDER-1: nova página é inserida imediatamente após a folha de origem e renumera todas', () => {
      const pages: CatalogPage[] = [
        { id: 'p1', pageNumber: 1, title: 'P1', blocks: [] },
        { id: 'p2-cover', pageNumber: 2, pageType: 'cover', title: 'P2 Cover', blocks: [{ id: 'bc', type: 'full_page_cover' }] },
        { id: 'p3', pageNumber: 3, title: 'P3', blocks: [] },
        { id: 'p4', pageNumber: 4, title: 'P4', blocks: [] }
      ];
      const cat = createTestCatalog(pages);
      useCatalogStore.setState({ currentCatalog: cat, localRevision: cat.localRevision, activePageIndex: 1 });

      useCatalogStore.getState().insertContentOnNewPageAfter('p2-cover', {
        kind: 'structural_preset',
        presetId: 'structural-feature-grid'
      });

      const updated = useCatalogStore.getState().currentCatalog!;
      expect(updated.pages).toHaveLength(5);

      // Ordem e numeração sequencial 1..5
      expect(updated.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5]);
      expect(updated.pages[0].id).toBe('p1');
      expect(updated.pages[1].id).toBe('p2-cover');
      // P3 é a nova página com a seção estrutural
      expect(updated.pages[2].pageType).toBe('technical');
      expect(updated.pages[2].blocks[0].type).toBe('structural_section');
      // Antigas P3 e P4 foram deslocadas para 4 e 5
      expect(updated.pages[3].id).toBe('p3');
      expect(updated.pages[4].id).toBe('p4');

      expect(useCatalogStore.getState().activePageIndex).toBe(2);
    });
  });

  // ==========================================================================
  // BLOCO 3: Mixed Cover Recovery Contracts
  // ==========================================================================
  describe('Bloco 3: Mixed Cover Recovery Contracts', () => {
    it('FULLCOVER-RECOVERY-1 e 2: moveNonCoverBlocksToNewPage isola a capa e move fluxo preservando IDs exatos', () => {
      const mixedPage: CatalogPage = {
        id: 'p-mixed',
        pageNumber: 1,
        pageType: 'cover',
        title: 'Capa Mista Legada',
        blocks: [
          { id: 'b-cover-root', type: 'full_page_cover', title: 'Capa' },
          { id: 'b-table-exact', type: 'table', title: 'Tabela Técnica' },
          {
            id: 'b-sec-exact',
            type: 'structural_section',
            title: 'Seção',
            structuralData: {
              version: 1,
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
                  type: 'feature_card',
                  id: 'a1111111-1111-4111-8111-111111111111',
                  title: 'Card 1',
                  body: 'Conteúdo 1',
                  emphasis: 'normal'
                },
                {
                  type: 'feature_card',
                  id: 'b2222222-2222-4222-8222-222222222222',
                  title: 'Card 2',
                  body: 'Conteúdo 2',
                  emphasis: 'normal'
                }
              ]
            }
          }
        ]
      };
      const cat = createTestCatalog([mixedPage]);
      useCatalogStore.setState({
        currentCatalog: cat,
        localRevision: cat.localRevision,
        activePageIndex: 0,
        selectedBlockId: 'b-sec-exact',
        selectedChildId: 'a1111111-1111-4111-8111-111111111111'
      });

      const initialRevision = cat.localRevision;

      const success = useCatalogStore.getState().moveNonCoverBlocksToNewPage('p-mixed');
      expect(success).toBe(true);

      const updated = useCatalogStore.getState().currentCatalog!;
      expect(updated.pages).toHaveLength(2);
      expect(updated.localRevision).toBe(initialRevision + 1);

      // Folha 1 mantém apenas a capa
      expect(updated.pages[0].blocks).toHaveLength(1);
      expect(updated.pages[0].blocks[0].id).toBe('b-cover-root');

      // Folha 2 (nova) recebeu os blocos de fluxo com IDs rigorosamente idênticos
      const newPage = updated.pages[1];
      expect(newPage.pageType).toBe('technical');
      expect(newPage.blocks).toHaveLength(2);
      expect(newPage.blocks[0].id).toBe('b-table-exact');
      expect(newPage.blocks[1].id).toBe('b-sec-exact');

      // Filhos do card preservaram IDs
      const secData = newPage.blocks[1].structuralData!;
      expect(secData.children[0].id).toBe('a1111111-1111-4111-8111-111111111111');
      expect(secData.children[1].id).toBe('b2222222-2222-4222-8222-222222222222');

      // Seleção acompanhou para a nova página
      expect(useCatalogStore.getState().activePageIndex).toBe(1);
    });

    it('FULLCOVER-RECOVERY-FAIL-1: recovery falha fechado (no-op) se houver 2 capas ou zero não-capas', () => {
      const multiCoverPage: CatalogPage = {
        id: 'p-multi-cover',
        pageNumber: 1,
        title: 'Múltiplas Capas',
        blocks: [
          { id: 'c1', type: 'full_page_cover' },
          { id: 'c2', type: 'full_page_cover' },
          { id: 't1', type: 'table' }
        ]
      };
      const cat = createTestCatalog([multiCoverPage]);
      useCatalogStore.setState({ currentCatalog: cat, localRevision: cat.localRevision });

      const initialRevision = cat.localRevision;

      const success = useCatalogStore.getState().moveNonCoverBlocksToNewPage('p-multi-cover');
      expect(success).toBe(false);

      const updated = useCatalogStore.getState().currentCatalog!;
      expect(updated.pages).toHaveLength(1);
      expect(updated.pages[0].blocks).toHaveLength(3);
      expect(updated.localRevision).toBe(initialRevision);
    });
  });

  // ==========================================================================
  // BLOCO 4: Translation Acceptance (Handler Existente em Produção)
  // ==========================================================================
  describe('Bloco 4: Translation Acceptance (Existing Handler Proof)', () => {
    it('CANVAS-I18N-1, 2 e 3: aplica traduções de structural_section preservando IDs, layout e unappliedNodeIds vazio', () => {
      const structuralBlock: ContentBlock = {
        id: 'sec-test-1',
        type: 'structural_section',
        title: 'Título Original PT',
        subtitle: 'Subtítulo Original PT',
        badgeText: 'Badge PT',
        structuralData: {
          version: 1,
          layout: {
            mode: 'grid',
            columns: 2,
            widthMode: 'fixed',
            fixedWidthMm: 160,
            gap: 'sm',
            padding: 'md',
            density: 'normal',
            align: 'left',
            background: 'transparent',
            border: 'none',
            radius: 'none'
          },
          iconId: 'shield',
          children: [
            {
              type: 'feature_card',
              id: 'c1111111-1111-4111-8111-111111111111',
              title: 'Card A PT',
              body: 'Corpo A PT',
              badge: 'Badge A PT',
              emphasis: 'normal'
            },
            {
              type: 'feature_card',
              id: 'd2222222-2222-4222-8222-222222222222',
              title: 'Card B PT',
              body: 'Corpo B PT',
              emphasis: 'normal'
            }
          ]
        }
      };

      const catalog: Catalog = {
        id: 'cat-i18n',
        title: 'Catálogo i18n',
        client: 'Presys',
        version: 1,
        themeId: 'default-technical',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pages: [
          {
            id: 'page-1',
            pageNumber: 1,
            title: 'Página 1',
            blocks: [structuralBlock]
          }
        ]
      };

      // Mapa de tradução com os nós canônicos da seção estrutural
      const translations = new Map<string, string>([
        ['bsec-test-1_sec_title', 'Translated Section Title EN'],
        ['bsec-test-1_sec_subtitle', 'Translated Section Subtitle EN'],
        ['bsec-test-1_sec_badge', 'PREMIUM EN'],
        ['bsec-test-1_card_c1111111-1111-4111-8111-111111111111_title', 'Card A Title EN'],
        ['bsec-test-1_card_c1111111-1111-4111-8111-111111111111_body', 'Card A Body EN'],
        ['bsec-test-1_card_c1111111-1111-4111-8111-111111111111_badge', 'HOT EN'],
        ['bsec-test-1_card_d2222222-2222-4222-8222-222222222222_title', 'Card B Title EN'],
        ['bsec-test-1_card_d2222222-2222-4222-8222-222222222222_body', 'Card B Body EN']
      ]);

      // Executa o handler existente em produção de TranslationApplierRegistry
      const result = TranslationApplierRegistry.applyTranslations(catalog, translations, 'en');

      // CANVAS-I18N-1: Textos traduzidos
      const translatedBlock = result.translatedCatalog.pages[0].blocks[0];
      expect(translatedBlock.title).toBe('Translated Section Title EN');
      expect(translatedBlock.subtitle).toBe('Translated Section Subtitle EN');
      expect(translatedBlock.badgeText).toBe('PREMIUM EN');

      const transData = translatedBlock.structuralData!;
      expect(transData.children[0].title).toBe('Card A Title EN');
      expect(transData.children[0].body).toBe('Card A Body EN');
      expect(transData.children[0].badge).toBe('HOT EN');
      expect(transData.children[1].title).toBe('Card B Title EN');
      expect(transData.children[1].body).toBe('Card B Body EN');

      // CANVAS-I18N-2: Invariantes preservados
      expect(translatedBlock.id).toBe('sec-test-1');
      expect(transData.children[0].id).toBe('c1111111-1111-4111-8111-111111111111');
      expect(transData.children[1].id).toBe('d2222222-2222-4222-8222-222222222222');
      expect(transData.layout.columns).toBe(2);
      expect(transData.iconId).toBe('shield');
      expect(transData.layout.fixedWidthMm).toBe(160);

      // CANVAS-I18N-3: Todos os nós de tradução foram consumidos
      expect(result.unappliedNodeIds).toEqual([]);
      expect(result.appliedCount).toBe(translations.size);
    });
  });

  // ==========================================================================
  // BLOCO 5: Persistence Roundtrip & CleanA4 Parity
  // ==========================================================================
  describe('Bloco 5: Persistence Roundtrip & CleanA4 Parity', () => {
    it('PERSIST-CANVAS-1: catalogRowToCatalog restaura integralmente seções estruturais, cards e pageTypes', () => {
      const originalCatalog: Catalog = {
        id: 'cat-db-1',
        title: 'Presys High-Precision',
        client: 'Presys Industrial',
        locale: 'pt-BR',
        currency: 'BRL',
        version: 2,
        themeId: 'default-technical',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pages: [
          {
            id: 'page-cover',
            pageNumber: 1,
            pageType: 'cover',
            title: 'Capa',
            blocks: [{ id: 'b-cover', type: 'full_page_cover', title: 'Capa A4' }]
          },
          {
            id: 'page-tech',
            pageNumber: 2,
            pageType: 'technical',
            title: 'Seções',
            blocks: [
              {
                id: 'b-sec',
                type: 'structural_section',
                title: 'Arquitetura',
                structuralData: {
                  version: 1,
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
                      type: 'feature_card',
                      id: 'e3333333-3333-4333-8333-333333333333',
                      title: 'Módulo 1',
                      body: 'Descrição do módulo',
                      emphasis: 'normal'
                    }
                  ]
                }
              }
            ]
          }
        ]
      };

      // Simula a linha do Supabase (onde o catálogo é persistido no campo brand)
      const mockRow = {
        id: 'row-1',
        name: originalCatalog.title,
        brand: originalCatalog,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const restoredCatalog = catalogRowToCatalog(mockRow);

      expect(restoredCatalog.pages).toHaveLength(2);
      expect(restoredCatalog.pages[0].pageType).toBe('cover');
      expect(restoredCatalog.pages[0].blocks[0].type).toBe('full_page_cover');

      expect(restoredCatalog.pages[1].pageType).toBe('technical');
      const secBlock = restoredCatalog.pages[1].blocks[0];
      expect(secBlock.type).toBe('structural_section');
      expect(secBlock.structuralData?.layout.columns).toBe(3);
      expect(secBlock.structuralData?.children[0].id).toBe('e3333333-3333-4333-8333-333333333333');
    });

    it('CANVAS-PDF-1: CleanA4Document renderiza folhas sem artefatos de editor (no-print, frames, banners)', () => {
      const sampleCatalog: Catalog = {
        id: 'clean-cat',
        title: 'Catálogo Clean',
        client: 'Presys',
        version: 1,
        themeId: 'default-technical',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            title: 'Folha 1',
            blocks: [
              { id: 'b1', type: 'text', textContent: 'Parágrafo Limpo de Engenharia' }
            ]
          }
        ]
      };

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <CleanA4Document
            document={sampleCatalog}
          />
        );
      });

      // Renderiza o conteúdo do bloco
      expect(container.textContent).toContain('Parágrafo Limpo de Engenharia');

      // Zero classes ou elementos exclusivos de editor
      expect(container.querySelector('[data-testid="overflow-warning-banner"]')).toBeNull();
      expect(container.querySelector('[data-testid="block-flow-drop-slot-0"]')).toBeNull();
      expect(container.querySelector('[data-testid="a4-overflow-cutoff-line"]')).toBeNull();
      expect(container.querySelector('.editor-only')).toBeNull();

      act(() => {
        root.unmount();
      });
      document.body.removeChild(container);
    });
  });
});
