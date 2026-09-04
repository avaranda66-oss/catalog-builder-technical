// tests/domain/product-workspace/workspace-hardening-policies.test.ts
import { describe, it, expect } from 'vitest';
import {
  createWorkbook,
  ensureWorkbookV2,
  addModule,
  addDatum,
  SourceDocument,
  ProductDataView,
  ResolvedProductKnowledge
} from '../../../src/domain/product-workbook';
import {
  buildAiProductKnowledgeEnvelope
} from '../../../src/domain/product-workspace/ai-envelope';
import {
  resizeBlock,
  setBlockVisibility
} from '../../../src/domain/product-workspace/commands';
import {
  createSemanticDescriptor,
  addAlias,
  planCanonicalRename,
  buildSemanticReferenceGraph
} from '../../../src/domain/product-workspace/semantics';
import {
  WorkspaceLayoutV1
} from '../../../src/domain/product-workspace/types';
import { CatalogCellBinding } from '../../../src/domain/catalog.schema';

describe('PIM Mega Workspace Hardening & Real Policies (Blocker 10)', () => {
  // ==========================================================================
  // 1. AI TRUTH POLICIES (DRAFT, CONFLICTING, VERIFIED, APPROVED, DEPRECATED)
  // ==========================================================================
  describe('AI Truth Policy & Purpose Modes', () => {
    function setupAiTestWorkbook() {
      let wb = ensureWorkbookV2(
        createWorkbook({
          id: 'wb-ai-policy',
          owner: { kind: 'product', id: 'TA-25N' },
          revision: 4
        })
      );

      wb = ensureWorkbookV2(
        addModule(wb, {
          id: 'mod-specs',
          semanticKey: 'metrology.specs',
          label: 'Especificações',
          kind: 'key_value',
          order: 0
        })
      );

      // 1. Approved datum
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.temperature.range',
            moduleId: 'mod-specs',
            label: 'Faixa',
            value: { type: 'range', lower: -25, upper: 140, unit: '°C' },
            evidence: [],
            status: 'approved'
          },
          'd-approved'
        )
      );

      // 2. Verified datum
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.temperature.accuracy',
            moduleId: 'mod-specs',
            label: 'Exatidão',
            value: { type: 'quantity', amount: 0.1, unit: '°C' },
            evidence: [],
            status: 'verified'
          },
          'd-verified'
        )
      );

      // 3. Draft datum
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.internal.draft_spec',
            moduleId: 'mod-specs',
            label: 'Rascunho Experimental',
            value: { type: 'text', value: 'Em homologação' },
            evidence: [],
            status: 'draft'
          },
          'd-draft'
        )
      );

      // 4. Deprecated datum
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.legacy.firmware_v1',
            moduleId: 'mod-specs',
            label: 'Firmware Legado',
            value: { type: 'text', value: 'v1.0' },
            evidence: [],
            status: 'deprecated'
          },
          'd-deprecated'
        )
      );

      // 5. Conflicting datum SEM decisão canônica
      const docPt: SourceDocument = {
        id: 'doc-pt',
        title: 'Manual PT',
        documentType: 'manual',
        revision: 'REV-01'
      };
      const docEn: SourceDocument = {
        id: 'doc-en',
        title: 'Manual EN',
        documentType: 'manual',
        revision: 'REV-02'
      };

      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.temp.resolution',
            moduleId: 'mod-specs',
            label: 'Resolução Divergente',
            value: { type: 'quantity', amount: 0.01, unit: '°C' },
            evidence: [
              {
                id: 'ev-1',
                sourceDocumentId: 'doc-pt',
                page: 10,
                observedValue: { type: 'quantity', amount: 0.01, unit: '°C' }
              },
              {
                id: 'ev-2',
                sourceDocumentId: 'doc-en',
                page: 10,
                observedValue: { type: 'quantity', amount: 0.1, unit: '°C' }
              }
            ],
            status: 'draft' // status calculado vira conflicting devido às 2 evidências divergentes
          },
          'd-conflict'
        )
      );

      return { wb, docs: [docPt, docEn] };
    }

    it('exclui draft por padrão no modo factual_answer (draft excluded by default)', () => {
      const { wb, docs } = setupAiTestWorkbook();
      const envelope = buildAiProductKnowledgeEnvelope({
        workbook: wb,
        sources: docs,
        purpose: 'factual_answer'
      });

      const draftFact = envelope.facts.find((f) => f.datumId === 'd-draft');
      expect(draftFact).toBeUndefined();
      expect(envelope.excludedSummary.draftsCount).toBeGreaterThanOrEqual(1);
    });

    it('exclui conflicting não-resolvido de facts e preserva candidatos (conflicting excluded / candidates preserved)', () => {
      const { wb, docs } = setupAiTestWorkbook();
      const envelope = buildAiProductKnowledgeEnvelope({
        workbook: wb,
        sources: docs,
        purpose: 'factual_answer'
      });

      // Não pode entrar em facts[]
      const conflictFact = envelope.facts.find((f) => f.datumId === 'd-conflict');
      expect(conflictFact).toBeUndefined();

      // Deve estar em conflicts[] com seus candidatos preservados
      expect(envelope.conflicts.length).toBe(1);
      const conf = envelope.conflicts[0];
      expect(conf.datumId).toBe('d-conflict');
      expect(conf.status).toBe('conflicting');
      expect(conf.candidates.length).toBe(2);
      expect(conf.candidates[0].sourceTitle).toBe('Manual PT');
      expect(conf.candidates[1].sourceTitle).toBe('Manual EN');
    });

    it('inclui verified e approved como fatos seguros de consumo', () => {
      const { wb, docs } = setupAiTestWorkbook();
      const envelope = buildAiProductKnowledgeEnvelope({
        workbook: wb,
        sources: docs,
        purpose: 'factual_answer'
      });

      const approvedFact = envelope.facts.find((f) => f.datumId === 'd-approved');
      const verifiedFact = envelope.facts.find((f) => f.datumId === 'd-verified');

      expect(approvedFact).toBeDefined();
      expect(approvedFact?.status).toBe('approved');
      expect(verifiedFact).toBeDefined();
      expect(verifiedFact?.status).toBe('verified');
    });

    it('exclui deprecated de fatos de resposta (deprecated excluded)', () => {
      const { wb, docs } = setupAiTestWorkbook();
      const envelope = buildAiProductKnowledgeEnvelope({
        workbook: wb,
        sources: docs,
        purpose: 'factual_answer'
      });

      const deprecatedFact = envelope.facts.find((f) => f.datumId === 'd-deprecated');
      expect(deprecatedFact).toBeUndefined();
      expect(envelope.excludedSummary.deprecatedCount).toBe(1);
    });

    it('no modo review, expõe drafts separadamente em reviewCandidates sem poluir facts', () => {
      const { wb, docs } = setupAiTestWorkbook();
      const envelope = buildAiProductKnowledgeEnvelope({
        workbook: wb,
        sources: docs,
        purpose: 'review'
      });

      // Em facts, continuam apenas verified e approved
      expect(envelope.facts.some((f) => f.datumId === 'd-draft')).toBe(false);

      // Em reviewCandidates, o draft aparece isolado para revisão humana
      expect(envelope.reviewCandidates).toBeDefined();
      const reviewItem = envelope.reviewCandidates?.find((r) => r.datumId === 'd-draft');
      expect(reviewItem).toBeDefined();
      expect(reviewItem?.status).toBe('draft');
    });

    it('no modo engineering, expõe status brutos sem consenso forçado', () => {
      const { wb, docs } = setupAiTestWorkbook();
      const envelope = buildAiProductKnowledgeEnvelope({
        workbook: wb,
        sources: docs,
        purpose: 'engineering'
      });

      // No modo engenharia, o draft entra em facts com seu status real
      const draftFact = envelope.facts.find((f) => f.datumId === 'd-draft');
      expect(draftFact).toBeDefined();
      expect(draftFact?.status).toBe('draft');

      // Mas o conflito continua isolado em conflicts[], nunca como consenso falso
      expect(envelope.facts.some((f) => f.datumId === 'd-conflict')).toBe(false);
      expect(envelope.conflicts.length).toBe(1);
    });
  });

  // ==========================================================================
  // 2. LAYOUT REVISION INDEPENDENCE & PRESENTATION COMMANDS
  // ==========================================================================
  describe('Layout Revision Independence & Presentation Commands', () => {
    const initialLayout: WorkspaceLayoutV1 = {
      schemaVersion: 1,
      id: 'layout-test-rev',
      productId: 'PCON-Y18',
      revision: 1,
      title: 'Layout Inicial',
      sections: [
        {
          id: 'sec-main',
          title: 'Principal',
          blockIds: ['block-card-1'],
          order: 0
        }
      ],
      blocks: {
        'block-card-1': {
          id: 'block-card-1',
          kind: 'fact_grid',
          size: 'full',
          visibility: 'visible',
          title: 'Card 1',
          datumIds: ['d1']
        }
      }
    };

    it('resizeBlock incrementa layout.revision e altera apenas layout sem tocar no PIM', () => {
      const resized = resizeBlock(initialLayout, 'block-card-1', 'medium');

      // Layout revision incrementa
      expect(resized.revision).toBe(2);
      expect(resized.blocks['block-card-1'].size).toBe('medium');
      expect(resized.updatedAt).toBeDefined();

      // Objeto inicial intacto (imutabilidade)
      expect(initialLayout.revision).toBe(1);
      expect(initialLayout.blocks['block-card-1'].size).toBe('full');
    });

    it('setBlockVisibility oculta bloco e incrementa layout.revision de forma pura', () => {
      const hidden = setBlockVisibility(initialLayout, 'block-card-1', 'hidden');

      expect(hidden.revision).toBe(2);
      expect(hidden.blocks['block-card-1'].visibility).toBe('hidden');
      expect(initialLayout.blocks['block-card-1'].visibility).toBe('visible');
    });
  });

  // ==========================================================================
  // 3. SEMANTIC COLLISION & REFERENCE GRAPH BLAST RADIUS
  // ==========================================================================
  describe('Semantic Collision & Reference Graph Blast Radius', () => {
    it('rejeita colisão de alias com chave canônica (semantic alias collision)', () => {
      const desc = createSemanticDescriptor({
        canonicalKey: 'metrology.pressure.range',
        displayLabel: 'Faixa de Pressão'
      });

      // Tentativa de adicionar alias idêntico à própria chave canônica
      expect(() => addAlias(desc, 'metrology.pressure.range')).toThrow(
        /Colisão semântica/
      );

      // Tentativa de adicionar alias idêntico a outra chave canônica conhecida
      expect(() =>
        addAlias(desc, 'metrology.temperature.range', ['metrology.temperature.range'])
      ).toThrow(/colide com chave canônica/);
    });

    it('mapeia referências em saved view ordering e datumKeys', () => {
      let wb = ensureWorkbookV2(
        createWorkbook({
          id: 'wb-savedviews',
          owner: { kind: 'product', id: 'TA-25N' }
        })
      );
      wb = ensureWorkbookV2(
        addModule(wb, {
          id: 'mod-1',
          semanticKey: 'metrology.general',
          label: 'Geral',
          kind: 'key_value',
          order: 0
        })
      );
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.target.spec',
            moduleId: 'mod-1',
            label: 'Alvo',
            value: { type: 'number', value: 100 },
            evidence: [],
            status: 'verified'
          },
          'd-target'
        )
      );

      const savedView: ProductDataView = {
        id: 'view-lab',
        name: 'Visão Laboratório',
        viewKind: 'custom',
        datumKeys: ['metrology.target.spec'],
        ordering: ['metrology.target.spec']
      };

      wb = {
        ...wb,
        savedViews: [savedView]
      };

      const graph = buildSemanticReferenceGraph({
        canonicalKey: 'metrology.target.spec',
        workbook: wb,
        isExternalIndexComplete: true
      });

      const datumKeyRef = graph.internalReferences.find(
        (r) => r.locationType === 'saved_view_datum_keys'
      );
      const orderingRef = graph.internalReferences.find(
        (r) => r.locationType === 'saved_view_ordering'
      );

      expect(datumKeyRef).toBeDefined();
      expect(datumKeyRef?.containerId).toBe('view-lab');
      expect(orderingRef).toBeDefined();
      expect(orderingRef?.containerId).toBe('view-lab');
    });

    it('mapeia overrides de produto e overrides de dataset em resolvedKnowledge', () => {
      let wb = ensureWorkbookV2(
        createWorkbook({
          id: 'wb-overrides',
          owner: { kind: 'product', id: 'TA-25N' }
        })
      );
      wb = ensureWorkbookV2(
        addModule(wb, {
          id: 'mod-1',
          semanticKey: 'metrology.general',
          label: 'Geral',
          kind: 'key_value',
          order: 0
        })
      );
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.temp.custom_range',
            moduleId: 'mod-1',
            label: 'Faixa Local',
            value: { type: 'range', lower: 0, upper: 100, unit: '°C' },
            evidence: [],
            status: 'approved'
          },
          'd-override-local'
        )
      );

      wb = {
        ...wb,
        overrides: {
          'metrology.temp.custom_range': {
            targetSemanticKey: 'metrology.temp.custom_range',
            mode: 'override',
            overriddenValue: { type: 'number', value: 200 }
          }
        },
        datasetOverrides: {
          'metrology.temp.custom_range': {
            targetSemanticKey: 'metrology.temp.custom_range',
            mode: 'override',
            overriddenLabel: 'Custom Dataset'
          }
        }
      };

      const resolved: ResolvedProductKnowledge = {
        productId: 'TA-25N',
        familyId: 'TA-FAMILY',
        modules: wb.modules,
        effectiveData: new Map(),
        suppressedKeys: [],
        conflictsCount: 0
      };

      const graph = buildSemanticReferenceGraph({
        canonicalKey: 'metrology.temp.custom_range',
        workbook: wb,
        resolvedKnowledge: resolved,
        isExternalIndexComplete: true
      });

      const overrideRef = graph.internalReferences.find(
        (r) => r.locationType === 'product_override_target'
      );
      const datasetOverrideRef = graph.internalReferences.find(
        (r) => r.locationType === 'dataset_override_target'
      );

      expect(overrideRef).toBeDefined();
      expect(overrideRef?.containerId).toBe('metrology.temp.custom_range');
      expect(datasetOverrideRef).toBeDefined();
      expect(datasetOverrideRef?.containerId).toBe('metrology.temp.custom_range');
    });

    it('bloqueia execução do plano se houver incerteza sobre bindings externos (external binding uncertainty blocks executable rename)', () => {
      let wb = ensureWorkbookV2(
        createWorkbook({
          id: 'wb-rename-test',
          owner: { kind: 'product', id: 'TA-25N' }
        })
      );
      wb = ensureWorkbookV2(
        addModule(wb, {
          id: 'mod-1',
          semanticKey: 'metrology.stability',
          label: 'Estabilidade',
          kind: 'key_value',
          order: 0
        })
      );
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.thermal.stability',
            moduleId: 'mod-1',
            label: 'Estabilidade Térmica',
            value: { type: 'quantity', amount: 0.05, unit: '°C' },
            evidence: [],
            status: 'verified'
          },
          'd-stab'
        )
      );

      // Caso 1: Sem confirmação de índice externo completo
      const planIncomplete = planCanonicalRename({
        workbook: wb,
        oldCanonicalKey: 'metrology.thermal.stability',
        newCanonicalKey: 'metrology.temperature.stability_v2',
        rationale: 'Adequação metrológica internacional',
        isExternalIndexComplete: false // Incerteza sobre catálogos externos!
      });

      expect(planIncomplete.isValid).toBe(true);
      // FAIL CLOSED: Não é executável enquanto o blast radius externo for incerto!
      expect(planIncomplete.isExecutable).toBe(false);
      expect(planIncomplete.referenceGraph.externalReferences.status).toBe('REQUIRES_INDEX');
      expect(planIncomplete.referenceGraph.externalReferences.warning).toContain('não foram indexados');

      // Caso 2: Com índice externo completo comprovado e bindings conhecidos
      const externalBinding: CatalogCellBinding = {
        sourceKind: 'pim_datum',
        productId: 'TA-25N',
        semanticKey: 'metrology.thermal.stability',
        bindingMode: 'live'
      };

      const planComplete = planCanonicalRename({
        workbook: wb,
        oldCanonicalKey: 'metrology.thermal.stability',
        newCanonicalKey: 'metrology.temperature.stability_v2',
        rationale: 'Adequação metrológica internacional',
        externalCatalogBindings: [externalBinding],
        isExternalIndexComplete: true
      });

      expect(planComplete.isValid).toBe(true);
      expect(planComplete.isExecutable).toBe(true);
      expect(planComplete.referenceGraph.externalReferences.status).toBe('KNOWN');
      expect(planComplete.referenceGraph.externalReferences.items.length).toBe(1);
      expect(planComplete.affectedTableBindingIds).toContain('TA-25N');
    });
  });
});
