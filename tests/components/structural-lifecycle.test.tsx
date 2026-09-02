// tests/components/structural-lifecycle.test.tsx
// Suíte de Testes Automatizados — Fase 3A.4 Structural Sections & Cards Lifecycle
// Valida factories puras, presets canônicos, preservação de UUIDs, lifecycle fail-closed de cards,
// transições de seleção invariant-safe, paridade com RendererParityAuditor e isolamento de locale i18n.

import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Catalog,
  resolveDocumentLocale
} from '../../src/domain/catalog.schema';
import { catalogRowToCatalog } from '../../src/services/supabase.service';
import {
  StructuralSectionDataSchema
} from '../../src/domain/canvas-layout.schema';
import {
  createStructuralFeatureCard,
  createStructuralSectionBlock,
  insertStructuralChildAfter,
  duplicateStructuralChildById,
  moveStructuralChild
} from '../../src/domain/canvas-layout.engine';
import {
  STRUCTURAL_SECTION_PRESETS,
  getStructuralSectionPreset,
  createStructuralSectionFromPreset
} from '../../src/domain/structural-presets';
import { getCorporateIcon } from '../../src/components/icons';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';
import { RendererParityAuditor } from '../../src/translation/renderer-parity.auditor';
import { extractStructuralBlocks } from '../../src/translation/block-extractors/structural.extractor';

describe('Fase 3A.4 — Structural Sections & Cards Lifecycle', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const initialCatalog: Catalog = {
    id: 'catalog-test-3a4',
    title: 'Catálogo de Teste 3A.4',
    version: 1,
    themeId: 'presys-default',
    locale: 'pt-BR',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        blocks: []
      }
    ]
  };

  beforeEach(() => {
    useCatalogStore.setState({
      currentCatalog: JSON.parse(JSON.stringify(initialCatalog)),
      activePageIndex: 0,
      selectedBlockId: null,
      selectedChildId: null,
      localRevision: 0,
      isDirty: false
    });
  });

  // ==========================================================================
  // 1. FACTORIES CANÔNICAS (STRUCT-FACTORY)
  // ==========================================================================
  describe('1. Factories Canônicas & Identidade Estrita', () => {
    it('STRUCT-FACTORY-1: createStructuralFeatureCard gera card com UUID RFC 4122 v4 e defaults vazios', () => {
      const card = createStructuralFeatureCard();
      expect(card.id).toMatch(UUID_REGEX);
      expect(card.type).toBe('feature_card');
      expect(card.title).toBe('');
      expect(card.body).toBe('');
      expect(card.emphasis).toBe('normal');
      expect(card.badge).toBeUndefined();
      expect(card.iconId).toBeUndefined();
    });

    it('STRUCT-FACTORY-2: createStructuralSectionBlock gera ContentBlock com UUID RFC 4122 v4 e defaults vazios', () => {
      const section = createStructuralSectionBlock();
      expect(section.id).toMatch(UUID_REGEX);
      expect(section.type).toBe('structural_section');
      expect(section.title).toBe('');
      expect(section.subtitle).toBe('');
      expect(section.badgeText).toBe('');
      expect(section.structuralData).toBeDefined();
      expect(section.structuralData?.version).toBe(1);
      expect(section.structuralData?.children).toEqual([]);
      expect(section.structuralData?.layout.columns).toBe(4);
    });

    it('STRUCT-FACTORY-3: createStructuralSectionBlock com cards gera cards com UUIDs distintos e válidos', () => {
      const section = createStructuralSectionBlock({
        cards: [
          { title: 'Card 1', iconId: 'target' },
          { title: 'Card 2', iconId: 'monitor' },
          { title: 'Card 3', iconId: 'cpu' }
        ]
      });

      const children = section.structuralData!.children;
      expect(children.length).toBe(3);

      const ids = children.map((c) => c.id);
      expect(new Set(ids).size).toBe(3);
      ids.forEach((id) => expect(id).toMatch(UUID_REGEX));
    });

    it('STRUCT-FACTORY-ID-2: tentativas de injeção de ID externo em runtime são completamente ignoradas', () => {
      const forgedCardId = 'injected-fake-card-id';
      const forgedSectionId = 'injected-fake-section-id';

      const card = createStructuralFeatureCard({ id: forgedCardId } as any);
      expect(card.id).not.toBe(forgedCardId);
      expect(card.id).toMatch(UUID_REGEX);

      const section = createStructuralSectionBlock({ id: forgedSectionId } as any);
      expect(section.id).not.toBe(forgedSectionId);
      expect(section.id).toMatch(UUID_REGEX);
    });
  });

  // ==========================================================================
  // 2. REGISTRY DE PRESETS (STRUCT-PRESET)
  // ==========================================================================
  describe('2. Registry Canônico de Presets', () => {
    it('STRUCT-PRESET-1: registry possui exatamente 6 presets neutros configurados', () => {
      expect(STRUCTURAL_SECTION_PRESETS.length).toBe(6);
      const presetIds = STRUCTURAL_SECTION_PRESETS.map((p) => p.id);
      expect(presetIds).toEqual([
        'structural-feature-grid',
        'structural-connectivity',
        'structural-highlights',
        'structural-applications',
        'structural-software-data',
        'structural-empty'
      ]);
    });

    it('STRUCT-PRESET-2: getStructuralSectionPreset resolve presets existentes e retorna undefined para inválidos', () => {
      expect(getStructuralSectionPreset('structural-connectivity')).toBeDefined();
      expect(getStructuralSectionPreset('structural-connectivity')?.label).toBe('Conectividade e Interfaces');
      expect(getStructuralSectionPreset('unknown-preset-id')).toBeUndefined();
    });

    it('STRUCT-PRESET-3: createStructuralSectionFromPreset gera instâncias com identidades totalmente desacopladas', () => {
      const inst1 = createStructuralSectionFromPreset('structural-connectivity');
      const inst2 = createStructuralSectionFromPreset('structural-connectivity');

      expect(inst1.id).not.toBe(inst2.id);
      expect(inst1.id).toMatch(UUID_REGEX);
      expect(inst2.id).toMatch(UUID_REGEX);

      const ids1 = new Set(inst1.structuralData!.children.map((c) => c.id));
      const ids2 = new Set(inst2.structuralData!.children.map((c) => c.id));

      for (const id of ids1) {
        expect(ids2.has(id)).toBe(false);
      }
    });

    it('STRUCT-PRESET-ICON-1: 100% dos iconIds persistidos em todos os presets resolvem no getCorporateIcon()', () => {
      for (const preset of STRUCTURAL_SECTION_PRESETS) {
        if (preset.section.iconId) {
          const iconDef = getCorporateIcon(preset.section.iconId);
          expect(
            iconDef,
            `Ícone de seção '${preset.section.iconId}' no preset '${preset.id}' não existe no CorporateIconRegistry`
          ).toBeDefined();
        }

        for (const card of preset.cards) {
          if (card.iconId) {
            const iconDef = getCorporateIcon(card.iconId);
            expect(
              iconDef,
              `Ícone de card '${card.iconId}' no preset '${preset.id}' não existe no CorporateIconRegistry`
            ).toBeDefined();
          }
        }
      }
    });

    it('STRUCT-PRESET-ID-1: definições de preset não contêm UUIDs de instância', () => {
      for (const preset of STRUCTURAL_SECTION_PRESETS) {
        expect((preset.section as any).id).toBeUndefined();
        for (const card of preset.cards) {
          expect((card as any).id).toBeUndefined();
        }
      }
    });
  });

  // ==========================================================================
  // 3. INSERÇÃO E PRESERVAÇÃO DE UUIDS (STRUCT-INSERT)
  // ==========================================================================
  describe('3. Inserção Dedicada & Preservação de UUID', () => {
    it('STRUCT-INSERT-1: insertStructuralSection preserva rigorosamente o UUID RFC 4122 v4 gerado pela factory', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-connectivity');

      const updated = useCatalogStore.getState();
      const page = updated.currentCatalog?.pages.find((p) => p.id === 'page-1');
      expect(page?.blocks?.length).toBe(1);

      const block = page!.blocks![0];
      expect(block.type).toBe('structural_section');
      expect(block.id).toMatch(UUID_REGEX);

      // Garante que o addBlock legado (block-timestamp-random) NÃO sobrescreveu o UUID
      expect(block.id.startsWith('block-')).toBe(false);
      expect(updated.selectedBlockId).toBe(block.id);
      expect(updated.selectedChildId).toBeNull();
    });

    it('STRUCT-INSERT-FAIL-1: preset desconhecido opera em fail-closed (zero mutação)', () => {
      const beforeState = useCatalogStore.getState();
      const initialRev = beforeState.localRevision;

      beforeState.insertStructuralSection('page-1', 'invalid-preset-id');

      const afterState = useCatalogStore.getState();
      const page = afterState.currentCatalog?.pages.find((p) => p.id === 'page-1');
      expect(page?.blocks?.length).toBe(0);
      expect(afterState.localRevision).toBe(initialRev);
      expect(afterState.isDirty).toBe(false);
    });
  });

  // ==========================================================================
  // 4. DUPLICAÇÃO DE SEÇÃO (STRUCT-DUP-SECTION)
  // ==========================================================================
  describe('4. Duplicação de Seção Estrutural', () => {
    it('STRUCT-DUP-SECTION: duplicateStructuralSection gera novos UUIDs para raiz e todos os cards sem colisão de nodes', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-highlights');

      const originalBlock = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      store.duplicateStructuralSection('page-1', originalBlock.id);

      const page = useCatalogStore.getState().currentCatalog!.pages[0];
      expect(page.blocks?.length).toBe(2);

      const cloneBlock = page.blocks![1];
      expect(cloneBlock.id).not.toBe(originalBlock.id);
      expect(cloneBlock.id).toMatch(UUID_REGEX);
      expect(cloneBlock.title).toBe(originalBlock.title);

      const originalCardIds = new Set(originalBlock.structuralData!.children.map((c) => c.id));
      const cloneCardIds = new Set(cloneBlock.structuralData!.children.map((c) => c.id));

      expect(originalCardIds.size).toBe(cloneCardIds.size);
      for (const id of originalCardIds) {
        expect(cloneCardIds.has(id)).toBe(false);
      }

      // PrintableTextNode IDs sets must have empty intersection
      const originalNodes = extractStructuralBlocks(originalBlock, 'page-1', 1);
      const cloneNodes = extractStructuralBlocks(cloneBlock, 'page-1', 1);

      const origNodeIds = new Set(originalNodes.map((n) => n.id));
      for (const cNode of cloneNodes) {
        expect(origNodeIds.has(cNode.id)).toBe(false);
      }
    });

    it('STRUCT-DUP-LEGACY-1: duplicateStructuralSection em bloco legado é no-op fail-closed', () => {
      const store = useCatalogStore.getState();
      store.addBlock('page-1', {
        type: 'text',
        title: 'Texto Legado',
        content: 'Conteúdo'
      } as any);

      const legacyBlock = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      const revBefore = useCatalogStore.getState().localRevision;

      store.duplicateStructuralSection('page-1', legacyBlock.id);

      const page = useCatalogStore.getState().currentCatalog!.pages[0];
      expect(page.blocks?.length).toBe(1);
      expect(useCatalogStore.getState().localRevision).toBe(revBefore);
    });
  });

  // ==========================================================================
  // 5. HELPERS DE CARD FAIL-CLOSED (STRUCT-HELPER-FAIL)
  // ==========================================================================
  describe('5. Helpers de Card Fail-Closed', () => {
    it('STRUCT-HELPER-FAIL-1: duplicateStructuralChildById com childId inexistente retorna found: false e zero mutação', () => {
      const section = createStructuralSectionBlock({
        cards: [{ title: 'Card Existente' }]
      });

      const result = duplicateStructuralChildById(section.structuralData!, 'nonexistent-id');
      expect(result.found).toBe(false);
      expect(result.createdChild).toBeUndefined();
      expect(result.data.children.length).toBe(1);
    });

    it('STRUCT-HELPER-FAIL-2: insertStructuralChildAfter com targetId inexistente retorna found: false e zero append', () => {
      const section = createStructuralSectionBlock({
        cards: [{ title: 'Card Existente' }]
      });

      const result = insertStructuralChildAfter(section.structuralData!, 'nonexistent-id', {
        title: 'Novo Card'
      });
      expect(result.found).toBe(false);
      expect(result.createdChild).toBeUndefined();
      expect(result.data.children.length).toBe(1);
    });
  });

  // ==========================================================================
  // 6. ADIÇÃO, REMOÇÃO E DUPLICAÇÃO DE CARDS NO STORE (STRUCT-CARD)
  // ==========================================================================
  describe('6. Ciclo de Vida de Cards no Store', () => {
    it('STRUCT-ADD-1: addStructuralChild adiciona card ao final e seleciona o novo card', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-empty');
      const sectionId = useCatalogStore.getState().selectedBlockId!;

      store.addStructuralChild('page-1', sectionId, { title: 'Card Criado Manualmente' });

      const state = useCatalogStore.getState();
      const section = state.currentCatalog!.pages[0].blocks![0];
      expect(section.structuralData?.children.length).toBe(1);

      const newCard = section.structuralData!.children[0];
      expect(newCard.title).toBe('Card Criado Manualmente');
      expect(state.selectedBlockId).toBe(sectionId);
      expect(state.selectedChildId).toBe(newCard.id);
    });

    it('STRUCT-DUP-1: duplicateStructuralChild clona card e o insere imediatamente após o original', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-connectivity');
      const section = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      const targetCard = section.structuralData!.children[0]; // primeiro card (rede)

      store.duplicateStructuralChild('page-1', section.id, targetCard.id);

      const updatedSection = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      const children = updatedSection.structuralData!.children;
      expect(children.length).toBe(5);

      const clone = children[1]; // posição imediatamente posterior
      expect(clone.id).not.toBe(targetCard.id);
      expect(clone.id).toMatch(UUID_REGEX);
      expect(clone.title).toBe(targetCard.title);
      expect(clone.iconId).toBe(targetCard.iconId);

      // Auto-seleciona o clone
      expect(useCatalogStore.getState().selectedChildId).toBe(clone.id);
    });

    it('STRUCT-DELETE-1: removeStructuralChild remove o card especificado por ID', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-highlights');
      const section = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      const cardToDelete = section.structuralData!.children[1];

      store.removeStructuralChild('page-1', section.id, cardToDelete.id);

      const updatedSection = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      expect(updatedSection.structuralData?.children.length).toBe(2);
      expect(updatedSection.structuralData?.children.some((c) => c.id === cardToDelete.id)).toBe(false);
    });
  });

  // ==========================================================================
  // 7. REORDENAÇÃO DE CARDS (STRUCT-REORDER)
  // ==========================================================================
  describe('7. Reordenação Lógica Up/Down', () => {
    it('STRUCT-REORDER-1: moveStructuralChild up/down permuta posições preservando 100% dos IDs', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-highlights');
      const section = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];

      const c0 = section.structuralData!.children[0].id;
      const c1 = section.structuralData!.children[1].id;
      const c2 = section.structuralData!.children[2].id;

      // Mover card 1 para baixo -> nova ordem esperada: [c0, c2, c1]
      store.moveStructuralChild('page-1', section.id, c1, 'down');

      let updated = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      let ids = updated.structuralData!.children.map((c) => c.id);
      expect(ids).toEqual([c0, c2, c1]);

      // Mover card 1 de volta para cima -> nova ordem: [c0, c1, c2]
      store.moveStructuralChild('page-1', section.id, c1, 'up');

      updated = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      ids = updated.structuralData!.children.map((c) => c.id);
      expect(ids).toEqual([c0, c1, c2]);
    });

    it('STRUCT-REORDER-3: moveStructuralChild em limites retorna moved: false', () => {
      const section = createStructuralSectionBlock({
        cards: [{ title: 'Card 0' }, { title: 'Card 1' }]
      });

      const c0 = section.structuralData!.children[0].id;
      const c1 = section.structuralData!.children[1].id;

      const resUp = moveStructuralChild(section.structuralData!, c0, 'up');
      expect(resUp.moved).toBe(false);

      const resDown = moveStructuralChild(section.structuralData!, c1, 'down');
      expect(resDown.moved).toBe(false);
    });
  });

  // ==========================================================================
  // 8. UNICIDADE DE CHILD IDs & SCHEMA ZOD (STRUCT-UNIQUE)
  // ==========================================================================
  describe('8. Unicidade Estrita de Child IDs', () => {
    it('STRUCT-UNIQUE-1: StructuralSectionDataSchema rejeita seções com duplicate child IDs', () => {
      const duplicateId = '44444444-4444-4444-8444-444444444444';
      const malformedData = {
        version: 1,
        layout: { mode: 'grid', columns: 2 },
        children: [
          { id: duplicateId, type: 'feature_card', title: 'Card 1', emphasis: 'normal' },
          { id: duplicateId, type: 'feature_card', title: 'Card 2', emphasis: 'normal' }
        ]
      };

      const parseResult = StructuralSectionDataSchema.safeParse(malformedData);
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        expect(parseResult.error.issues.some((i) => i.message.includes('ID de card duplicado detectado'))).toBe(true);
      }
    });

    it('STRUCT-UNIQUE-2: schema não regenera IDs duplicados silenciosamente (fail-closed)', () => {
      const malformedData = {
        version: 1,
        children: [
          { id: 'dup-id', type: 'feature_card', title: 'A' },
          { id: 'dup-id', type: 'feature_card', title: 'B' }
        ]
      };
      expect(() => StructuralSectionDataSchema.parse(malformedData)).toThrow();
    });
  });

  // ==========================================================================
  // 9. INVARIANT-SAFE SELECTION TRANSITION (STRUCT-SELECTION-ATOMIC)
  // ==========================================================================
  describe('9. Transição de Seleção Invariant-Safe', () => {
    it('STRUCT-SELECTION-ATOMIC-1: durante delete do card selecionado, NENHUM estado emitido aponta para card inexistente', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-connectivity');
      const section = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      const targetCard = section.structuralData!.children[1];

      // Seleciona o card
      useCatalogStore.setState({
        selectedBlockId: section.id,
        selectedChildId: targetCard.id
      });

      const emittedStates: Array<{ selectedBlockId: string | null; selectedChildId: string | null; cardExists: boolean }> = [];

      // Assina o Zustand para capturar TODOS os estados intermediários emitidos
      const unsubscribe = useCatalogStore.subscribe((state) => {
        const sec = state.currentCatalog?.pages[0].blocks?.find((b) => b.id === section.id);
        const cardExists = sec?.structuralData?.children?.some((c) => c.id === state.selectedChildId) ?? false;
        emittedStates.push({
          selectedBlockId: state.selectedBlockId,
          selectedChildId: state.selectedChildId,
          cardExists
        });
      });

      // Executa a remoção do card ativo
      useCatalogStore.getState().removeStructuralChild('page-1', section.id, targetCard.id);

      unsubscribe();

      // Invariante: Em nenhum estado emitido selectedChildId pode ser não-nulo e apontar para card que não existe
      for (const s of emittedStates) {
        if (s.selectedChildId !== null) {
          expect(s.cardExists, 'Violação de invariante: selectedChildId apontando para card inexistente').toBe(true);
        }
      }

      // Estado final deve ter seleção na seção pai
      const finalState = useCatalogStore.getState();
      expect(finalState.selectedBlockId).toBe(section.id);
      expect(finalState.selectedChildId).toBeNull();
    });

    it('STRUCT-SELECTION-ATOMIC-2: durante delete da seção selecionada, NENHUM estado emitido aponta para bloco inexistente', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-connectivity');
      const section = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];

      useCatalogStore.setState({ selectedBlockId: section.id, selectedChildId: null });

      const emittedStates: Array<{ selectedBlockId: string | null; blockExists: boolean }> = [];

      const unsubscribe = useCatalogStore.subscribe((state) => {
        const blockExists = state.currentCatalog?.pages[0].blocks?.some((b) => b.id === state.selectedBlockId) ?? false;
        emittedStates.push({
          selectedBlockId: state.selectedBlockId,
          blockExists
        });
      });

      useCatalogStore.getState().removeBlock('page-1', section.id);

      unsubscribe();

      for (const s of emittedStates) {
        if (s.selectedBlockId !== null) {
          expect(s.blockExists, 'Violação de invariante: selectedBlockId apontando para bloco inexistente').toBe(true);
        }
      }

      expect(useCatalogStore.getState().selectedBlockId).toBeNull();
    });

    it('STRUCT-SELECTION-3: remover bloco não selecionado preserva a seleção válida existente', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-connectivity');
      store.insertStructuralSection('page-1', 'structural-highlights');

      const page = useCatalogStore.getState().currentCatalog!.pages[0];
      const sec1 = page.blocks![0];
      const sec2 = page.blocks![1];

      // Seleciona a seção 2
      useCatalogStore.setState({ selectedBlockId: sec2.id, selectedChildId: null });

      // Remove a seção 1 (que não está selecionada)
      useCatalogStore.getState().removeBlock('page-1', sec1.id);

      // A seleção deve permanecer intacta na seção 2
      expect(useCatalogStore.getState().selectedBlockId).toBe(sec2.id);
    });
  });

  // ==========================================================================
  // 10. GOVERNANÇA DE LOCALE & VARIANTES (STRUCT-I18N)
  // ==========================================================================
  describe('10. Governança de Locale & Tradução', () => {
    it('STRUCT-I18N-PRESET-1: inserção em catálogo não-pt-BR preserva estrutura mas não injeta copy pt-BR', () => {
      useCatalogStore.setState({
        currentCatalog: {
          ...initialCatalog,
          locale: 'fr-FR'
        }
      });

      useCatalogStore.getState().insertStructuralSection('page-1', 'structural-connectivity');

      const block = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      expect(block.structuralData?.children.length).toBe(4);
      expect(block.structuralData?.iconId).toBe('network');

      // Campos textuais printable devem nascer vazios para evitar vazamento de português
      expect(block.title).toBe('');
      expect(block.subtitle).toBe('');
      expect(block.badgeText).toBe('');

      for (const card of block.structuralData!.children) {
        expect(card.title).toBe('');
        expect(card.body).toBe('');
        expect(card.badge).toBeUndefined();
        expect(card.iconId).toBeDefined(); // ícone técnico preservado
      }
    });

    it('STRUCT-I18N-PRESET-2: inserção em catálogo pt-BR preserva copy editorial do preset', () => {
      useCatalogStore.getState().insertStructuralSection('page-1', 'structural-connectivity');

      const block = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      expect(block.title).toBe('Conectividade e Interfaces');
      expect(block.structuralData?.children[0].title).toBe('Comunicação de Rede');
    });

    it('STRUCT-I18N-1: reordenação de cards preserva 100% dos PrintableTextNode IDs', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-highlights');
      const section = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];

      const nodesBefore = extractStructuralBlocks(section, 'page-1', 1);
      const nodeIdsBefore = new Set(nodesBefore.map((n) => n.id));

      // Reordena card
      const c1Id = section.structuralData!.children[1].id;
      store.moveStructuralChild('page-1', section.id, c1Id, 'down');

      const updatedSection = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      const nodesAfter = extractStructuralBlocks(updatedSection, 'page-1', 1);
      const nodeIdsAfter = new Set(nodesAfter.map((n) => n.id));

      expect(nodeIdsBefore).toEqual(nodeIdsAfter);
    });

    it('STRUCT-I18N-VARIANT-1: mutação na variante localizada não afeta catálogo de origem', () => {
      const sourceCatalog: Catalog = {
        ...initialCatalog,
        locale: 'pt-BR',
        pages: [
          {
            id: 'page-1',
            pageNumber: 1,
            blocks: [createStructuralSectionFromPreset('structural-highlights', 'pt-BR')]
          }
        ]
      };

      const variantCatalog: Catalog = {
        ...sourceCatalog,
        id: 'catalog-variant-fr',
        locale: 'fr-FR',
        pages: JSON.parse(JSON.stringify(sourceCatalog.pages))
      };

      useCatalogStore.setState({ currentCatalog: variantCatalog });

      const variantSection = variantCatalog.pages[0].blocks![0];
      useCatalogStore.getState().addStructuralChild('page-1', variantSection.id, { title: 'Nouveau Card' });

      // Catálogo variante possui o card
      expect(useCatalogStore.getState().currentCatalog!.pages[0].blocks![0].structuralData?.children.length).toBe(4);

      // Catálogo original intocado
      expect(sourceCatalog.pages[0].blocks![0].structuralData?.children.length).toBe(3);
    });
  });

  // ==========================================================================
  // 11. PARIDADE DE RENDERIZAÇÃO REAL (STRUCT-PARITY)
  // ==========================================================================
  describe('11. Paridade de Renderização DOM & PDF', () => {
    it('STRUCT-PARITY-1: RendererParityAuditor atinge 100% de cobertura após inserção de preset', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-feature-grid');

      const catalog = useCatalogStore.getState().currentCatalog!;

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(<CleanA4Document document={catalog} />);
      });

      const audit = RendererParityAuditor.auditRenderedDOM(container, catalog);

      expect(audit.rendererPrintableParityCoverage).toBe(100);
      expect(audit.orphanTextNodes.length).toBe(0);
      expect(audit.missingExpectedNodes.length).toBe(0);
      expect(audit.sourceMismatchNodes.length).toBe(0);
      expect(audit.isComplete).toBe(true);

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('STRUCT-PARITY-2: 100% de paridade mantida após duplicação e exclusão de cards', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-highlights');
      const section = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];

      // Duplica primeiro card
      store.duplicateStructuralChild('page-1', section.id, section.structuralData!.children[0].id);

      // Deleta último card original
      const lastCardId = section.structuralData!.children[2].id;
      store.removeStructuralChild('page-1', section.id, lastCardId);

      const catalog = useCatalogStore.getState().currentCatalog!;

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(<CleanA4Document document={catalog} />);
      });

      const audit = RendererParityAuditor.auditRenderedDOM(container, catalog);

      expect(audit.rendererPrintableParityCoverage).toBe(100);
      expect(audit.orphanTextNodes.length).toBe(0);
      expect(audit.missingExpectedNodes.length).toBe(0);
      expect(audit.sourceMismatchNodes.length).toBe(0);
      expect(audit.isComplete).toBe(true);

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('STRUCT-EMPTY-1: preset vazio é perfeitamente válido e atinge 100% de paridade', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-empty');

      const catalog = useCatalogStore.getState().currentCatalog!;
      const block = catalog.pages[0].blocks![0];
      expect(block.structuralData?.children.length).toBe(0);

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(<CleanA4Document document={catalog} />);
      });

      const audit = RendererParityAuditor.auditRenderedDOM(container, catalog);

      expect(audit.rendererPrintableParityCoverage).toBe(100);
      expect(audit.orphanTextNodes.length).toBe(0);
      expect(audit.missingExpectedNodes.length).toBe(0);
      expect(audit.isComplete).toBe(true);

      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });

  // ==========================================================================
  // 12. PERSISTÊNCIA & DIRTY STATE (STRUCT-PERSIST)
  // ==========================================================================
  describe('12. Persistência & Dirty State', () => {
    it('STRUCT-PERSIST-1: todas as ações de ciclo de vida incrementam localRevision e marcam isDirty', () => {
      const store = useCatalogStore.getState();

      store.insertStructuralSection('page-1', 'structural-connectivity');
      expect(useCatalogStore.getState().localRevision).toBe(1);
      expect(useCatalogStore.getState().isDirty).toBe(true);

      const sectionId = useCatalogStore.getState().selectedBlockId!;
      store.addStructuralChild('page-1', sectionId, { title: 'Card 5' });
      expect(useCatalogStore.getState().localRevision).toBe(2);

      const cardId = useCatalogStore.getState().selectedChildId!;
      store.duplicateStructuralChild('page-1', sectionId, cardId);
      expect(useCatalogStore.getState().localRevision).toBe(3);

      store.moveStructuralChild('page-1', sectionId, cardId, 'up');
      expect(useCatalogStore.getState().localRevision).toBe(4);

      store.removeStructuralChild('page-1', sectionId, cardId);
      expect(useCatalogStore.getState().localRevision).toBe(5);

      store.duplicateStructuralSection('page-1', sectionId);
      expect(useCatalogStore.getState().localRevision).toBe(6);
    });

    it('STRUCT-LEGACY-1: blocos legados continuam operando normalmente via addBlock', () => {
      const store = useCatalogStore.getState();
      store.addBlock('page-1', {
        type: 'hero_banner',
        title: 'Banner Presys',
        subtitle: 'Subtítulo'
      } as any);

      const page = useCatalogStore.getState().currentCatalog!.pages[0];
      expect(page.blocks?.length).toBe(1);
      expect(page.blocks![0].type).toBe('hero_banner');
      expect(page.blocks![0].id.startsWith('block-')).toBe(true);
    });
  });

  // ==========================================================================
  // 13. PRESERVAÇÃO DE METADADOS EM ROUND-TRIP (CATALOG-ROUNDTRIP)
  // ==========================================================================
  describe('13. Preservação de Metadados em Round-Trip (Fase 3A.4A)', () => {
    it('CATALOG-ROUNDTRIP-1: metadados completos preservados no mapper (locale, sourceLocale, translationMeta, localizedSystemStrings, pages, themeId, version)', () => {
      const persistedPayload: Partial<Catalog> = {
        title: 'Catálogo de Automação',
        subtitle: 'Subtítulo Técnico',
        themeId: 'presys-corporate',
        locale: 'fr-FR',
        sourceLocale: 'pt-BR',
        translationMeta: {
          sourceCatalogId: 'cat-src-001',
          sourceCatalogVersion: 2,
          targetLocale: 'fr-FR',
          provider: 'google-translate',
          coverage: 98,
          layoutQaStatus: 'passed'
        },
        localizedSystemStrings: {
          specificationsTitle: 'Spécifications Techniques',
          featuresTitle: 'Caractéristiques Principales'
        },
        pages: [
          {
            id: 'page-fr-1',
            pageNumber: 1,
            pageType: 'technical',
            title: 'Page 1',
            blocks: []
          }
        ],
        lastMutation: {
          kind: 'MANUAL_EDIT',
          clientInstanceId: 'client-test-123',
          timestamp: '2026-09-02T10:00:00.000Z',
          summary: 'Traduzido para fr-FR'
        }
      };

      const rowFromDb = {
        id: 'cat-fr-999',
        name: 'Catálogo Francês Autorizado',
        version: 3,
        created_at: '2026-09-02T10:00:00.000Z',
        updated_at: '2026-09-02T12:00:00.000Z',
        brand: persistedPayload
      };

      const hydrated = catalogRowToCatalog(rowFromDb);

      expect(hydrated.id).toBe('cat-fr-999');
      expect(hydrated.title).toBe('Catálogo Francês Autorizado');
      expect(hydrated.version).toBe(3);
      expect(hydrated.createdAt).toBe('2026-09-02T10:00:00.000Z');
      expect(hydrated.updatedAt).toBe('2026-09-02T12:00:00.000Z');
      expect(hydrated.themeId).toBe('presys-corporate');
      expect(hydrated.locale).toBe('fr-FR');
      expect(hydrated.sourceLocale).toBe('pt-BR');
      expect(hydrated.translationMeta).toEqual(persistedPayload.translationMeta);
      expect(hydrated.localizedSystemStrings).toEqual(persistedPayload.localizedSystemStrings);
      expect(hydrated.lastMutation).toEqual(persistedPayload.lastMutation);
      expect(hydrated.pages.length).toBe(1);
      expect(hydrated.pages[0].id).toBe('page-fr-1');
    });

    it('CATALOG-ROUNDTRIP-2: metadados futuros desconhecidos preservados (customFutureMetadata)', () => {
      const customFutureData = {
        complianceHash: 'sha256-abcdef1234567890',
        experimentalFlags: { autoFlowEnabled: true, meshLevel: 2 },
        customTenantId: 'tenant-omega-77'
      };

      const rowWithCustomData = {
        id: 'cat-future-001',
        name: 'Catálogo com Extensões Futuras',
        version: 1,
        created_at: '2026-09-02T10:00:00.000Z',
        updated_at: '2026-09-02T10:00:00.000Z',
        brand: {
          themeId: 'default-technical',
          pages: [],
          customFutureMetadata: customFutureData
        }
      };

      const hydrated = catalogRowToCatalog(rowWithCustomData);

      expect((hydrated as any).customFutureMetadata).toBeDefined();
      expect((hydrated as any).customFutureMetadata).toEqual(customFutureData);
    });

    it('CATALOG-ROUNDTRIP-3: campos de autoridade da row sobrescrevem payload', () => {
      const rowWithMismatchedAuthority = {
        id: 'authoritative-row-id',
        name: 'Título Autoritativo da Row',
        version: 5,
        created_at: '2026-09-02T15:00:00.000Z',
        updated_at: '2026-09-02T16:00:00.000Z',
        brand: {
          id: 'obsolete-brand-id',
          title: 'Título Desatualizado do Payload',
          version: 1,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
          themeId: 'presys-default',
          pages: []
        }
      };

      const hydrated = catalogRowToCatalog(rowWithMismatchedAuthority);

      // Campos autoritativos da linha PostgreSQL devem prevalecer incondicionalmente
      expect(hydrated.id).toBe('authoritative-row-id');
      expect(hydrated.title).toBe('Título Autoritativo da Row');
      expect(hydrated.version).toBe(5);
      expect(hydrated.createdAt).toBe('2026-09-02T15:00:00.000Z');
      expect(hydrated.updatedAt).toBe('2026-09-02T16:00:00.000Z');
    });
  });

  // ==========================================================================
  // 14. GOVERNANÇA DE LOCALE & RESOLUÇÃO DEFENSIVA (ROUNDTRIP-I18N)
  // ==========================================================================
  describe('14. Resolução Defensiva de Locale & Inserção Estrutural (Fase 3A.4A)', () => {
    it('ROUNDTRIP-I18N-1: catálogo FR carregado -> inserção de preset estrutural -> zero copy em português', () => {
      const frCatalogRow = {
        id: 'cat-fr-roundtrip',
        name: 'Catalogue International FR',
        version: 2,
        created_at: '2026-09-02T10:00:00.000Z',
        updated_at: '2026-09-02T10:00:00.000Z',
        brand: {
          locale: 'fr-FR',
          sourceLocale: 'pt-BR',
          pages: [
            {
              id: 'page-1',
              pageNumber: 1,
              blocks: []
            }
          ]
        }
      };

      // Hidrata via mapper canônico
      const loadedCatalog = catalogRowToCatalog(frCatalogRow);
      expect(loadedCatalog.locale).toBe('fr-FR');

      // Aplica no store
      useCatalogStore.setState({
        currentCatalog: loadedCatalog,
        activePageIndex: 0,
        selectedBlockId: null,
        selectedChildId: null,
        isDirty: false,
        localRevision: 0
      });

      // Insere seção estrutural
      useCatalogStore.getState().insertStructuralSection('page-1', 'structural-connectivity');

      const updatedCatalog = useCatalogStore.getState().currentCatalog!;
      const insertedBlock = updatedCatalog.pages[0].blocks![0];

      expect(insertedBlock.type).toBe('structural_section');
      // Invariante i18n estrita: zero vazamento de copy em português em documento francês
      expect(insertedBlock.title).toBe('');
      expect(insertedBlock.subtitle).toBe('');
      expect(insertedBlock.badgeText).toBe('');

      for (const card of insertedBlock.structuralData!.children) {
        expect(card.title).toBe('');
        expect(card.body).toBe('');
        expect(card.badge).toBeUndefined();
        // Ícone canônico corporativo mantido
        expect(card.iconId).toBeDefined();
      }
    });

    it('ROUNDTRIP-I18N-2: catálogo legado sem metadados de locale -> fallback documentado "pt-BR"', () => {
      const legacyCatalog: Partial<Catalog> = {
        id: 'cat-legacy-pt',
        title: 'Catálogo Legado Sem Metadados',
        pages: [{ id: 'page-1', pageNumber: 1, blocks: [] }]
      };

      const resolved = resolveDocumentLocale(legacyCatalog);
      expect(resolved).toBe('pt-BR');

      useCatalogStore.setState({
        currentCatalog: {
          ...initialCatalog,
          locale: undefined,
          sourceLocale: undefined,
          translationMeta: undefined
        },
        activePageIndex: 0,
        selectedBlockId: null,
        selectedChildId: null
      });

      useCatalogStore.getState().insertStructuralSection('page-1', 'structural-connectivity');

      const updated = useCatalogStore.getState().currentCatalog!;
      const block = updated.pages[0].blocks![0];

      // Fallback pt-BR deve renderizar a copy oficial editorial do preset
      expect(block.title).toBe('Conectividade e Interfaces');
      expect(block.structuralData?.children[0].title).toBe('Comunicação de Rede');
    });

    it('ROUNDTRIP-I18N-3: catálogo com translationMeta.targetLocale = "fr-FR" e locale = undefined -> efetivo "fr-FR"', () => {
      const translatedWithoutExplicitLocale: Partial<Catalog> = {
        id: 'cat-trans-no-locale',
        title: 'Document Translaté',
        locale: undefined,
        translationMeta: {
          targetLocale: 'fr-FR',
          provider: 'google-translate'
        } as any,
        pages: [{ id: 'page-1', pageNumber: 1, blocks: [] }]
      };

      const resolved = resolveDocumentLocale(translatedWithoutExplicitLocale);
      expect(resolved).toBe('fr-FR');

      useCatalogStore.setState({
        currentCatalog: {
          ...initialCatalog,
          locale: undefined,
          translationMeta: { targetLocale: 'fr-FR' } as any
        },
        activePageIndex: 0,
        selectedBlockId: null,
        selectedChildId: null
      });

      useCatalogStore.getState().insertStructuralSection('page-1', 'structural-connectivity');

      const block = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      // Como o locale efetivo foi resolvido para fr-FR, campos textuais devem ser neutros/vazios
      expect(block.title).toBe('');
      expect(block.structuralData?.children[0].title).toBe('');
    });
  });

  // ==========================================================================
  // 15. FAIL-CLOSED & ROBUSTEZ DE AÇÕES (Fase 3A.4A)
  // ==========================================================================
  describe('15. Fail-Closed & Robustez de Ações (Fase 3A.4A)', () => {
    it('STRUCT-INSERT-FAIL-2: inserção com pageId inválido é um no-op estrito (zero blocos, zero revision bump, zero dirty, zero alteração de seleção)', () => {
      useCatalogStore.setState({
        currentCatalog: JSON.parse(JSON.stringify(initialCatalog)),
        activePageIndex: 0,
        selectedBlockId: 'pre-existing-block-id',
        selectedChildId: null,
        localRevision: 0,
        isDirty: false
      });

      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-inexistente-999', 'structural-connectivity');

      const stateAfter = useCatalogStore.getState();

      // Zero mutação, zero alteração
      expect(stateAfter.currentCatalog!.pages[0].blocks?.length).toBe(0);
      expect(stateAfter.localRevision).toBe(0);
      expect(stateAfter.isDirty).toBe(false);
      expect(stateAfter.selectedBlockId).toBe('pre-existing-block-id');
      expect(stateAfter.selectedChildId).toBeNull();
    });

    it('STRUCT-DELETE-FAIL-1: remoção de childId inexistente mantém a seleção intacta no card selecionado, zero revision bump, zero dirty', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-connectivity');

      const section = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];
      const validCard = section.structuralData!.children[0];

      // Seleciona o card existente
      useCatalogStore.setState({
        selectedBlockId: section.id,
        selectedChildId: validCard.id,
        localRevision: 10,
        isDirty: false
      });

      // Tenta remover child inexistente
      store.removeStructuralChild('page-1', section.id, 'uuid-fantasma-inexistente');

      const stateAfter = useCatalogStore.getState();

      // Seleção DEVE ser mantida no card válido
      expect(stateAfter.selectedBlockId).toBe(section.id);
      expect(stateAfter.selectedChildId).toBe(validCard.id);
      expect(stateAfter.localRevision).toBe(10);
      expect(stateAfter.isDirty).toBe(false);
      // Número de cards não muda
      expect(stateAfter.currentCatalog!.pages[0].blocks![0].structuralData?.children.length).toBe(4);
    });

    it('STRUCT-REMOVE-BLOCK-FAIL-1: remoção de blockId ou pageId inexistente é um no-op completo', () => {
      const store = useCatalogStore.getState();
      store.insertStructuralSection('page-1', 'structural-connectivity');

      const section = useCatalogStore.getState().currentCatalog!.pages[0].blocks![0];

      useCatalogStore.setState({
        selectedBlockId: section.id,
        selectedChildId: null,
        localRevision: 20,
        isDirty: false
      });

      // 1. Tenta remover bloco inexistente em página existente
      store.removeBlock('page-1', 'block-inexistente-xyz');

      let stateAfter = useCatalogStore.getState();
      expect(stateAfter.selectedBlockId).toBe(section.id);
      expect(stateAfter.localRevision).toBe(20);
      expect(stateAfter.isDirty).toBe(false);
      expect(stateAfter.currentCatalog!.pages[0].blocks?.length).toBe(1);

      // 2. Tenta remover bloco existente em página inexistente
      store.removeBlock('page-fantasma-999', section.id);

      stateAfter = useCatalogStore.getState();
      expect(stateAfter.selectedBlockId).toBe(section.id);
      expect(stateAfter.localRevision).toBe(20);
      expect(stateAfter.isDirty).toBe(false);
      expect(stateAfter.currentCatalog!.pages[0].blocks?.length).toBe(1);
    });
  });
});

