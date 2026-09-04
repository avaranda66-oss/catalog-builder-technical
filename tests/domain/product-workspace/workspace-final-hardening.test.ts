// tests/domain/product-workspace/workspace-final-hardening.test.ts
// Exhaustive test suite for PIM.MEGA.WORKSPACE.FOUNDATION1C Final Domain Hardening.
// Covers:
// 1. All layout commands bump revision on mutation (Blocker 7).
// 2. NO-OP commands do NOT bump revision or modify updatedAt (Blocker 7).
// 3. Strict block ownership (one section per block) & zero orphan block validation (Blocker 8 & 9).
// 4. removeSection cleans owned blocks safely (Blocker 8).
// 5. validateWorkspaceAgainstKnowledge domain validator (Blocker 10).
// 6. AI truth policy: invalid canonicalDecision leaves datum as conflict (Blocker 11).
// 7. Workspace projection derives status on local datums (Blocker 12).
// 8. Canonical Semantic Registry ownership and AI envelope consumption (Blocker 13-16).
// 9. planCanonicalRename alias collision check (Blocker 17).
// 10. ExternalCatalogBindingReference detailed locators (Blocker 18).
// 11. WorkspaceEditDraft patch parity & strict schema (Blocker 19).
// 12. Persisted layout revision positive integer constraint (Blocker 20).

import { describe, it, expect } from 'vitest';
import {
  createWorkbook,
  ensureWorkbookV2,
  addModule,
  addDatum,
  SourceDocument,
  ProductWorkbookV2
} from '../../../src/domain/product-workbook';
import {
  WorkspaceLayoutV1,
  WorkspaceSectionDef,
  FactGridBlockDef,
  ProductSemanticRegistry,
  ExternalCatalogBindingReference,
  WorkspaceEditDraft
} from '../../../src/domain/product-workspace/types';
import {
  WorkspaceLayoutV1Schema,
  WorkspaceEditDraftSchema
} from '../../../src/domain/product-workspace/schema';
import {
  touchWorkspaceLayout,
  addSection,
  renameSection,
  removeSection,
  moveSection,
  reorderSections,
  resizeBlock,
  setBlockVisibility,
  addDatumToBlock,
  removeDatumFromBlock,
  updateDisplayOverride
} from '../../../src/domain/product-workspace/commands';
import {
  validateWorkspaceAgainstKnowledge
} from '../../../src/domain/product-workspace/validation';
import {
  buildAiProductKnowledgeEnvelope
} from '../../../src/domain/product-workspace/ai-envelope';
import {
  buildWorkspaceProjection
} from '../../../src/domain/product-workspace/projection';
import {
  createProductSemanticRegistry,
  createSemanticDescriptor,
  planCanonicalRename,
  buildSemanticReferenceGraph
} from '../../../src/domain/product-workspace/semantics';
import {
  autoOrganizeProductWorkspace
} from '../../../src/domain/product-workspace/auto-organizer';

describe('PIM Mega Workspace Final Hardening (FOUNDATION1C)', () => {
  // Helper de setup para layout base válido
  function createBaseLayout(): WorkspaceLayoutV1 {
    const sec1: WorkspaceSectionDef = {
      id: 'sec_1',
      title: 'Seção Inicial',
      blockIds: ['block_1'],
      order: 0
    };
    const block1: FactGridBlockDef = {
      id: 'block_1',
      kind: 'fact_grid',
      title: 'Grid de Fatos',
      datumIds: ['d_1'],
      size: 'medium',
      visibility: 'visible'
    };

    return {
      schemaVersion: 1,
      id: 'layout_ta25',
      productId: 'TA-25N',
      revision: 1,
      createdAt: '2026-09-04T10:00:00.000Z',
      updatedAt: '2026-09-04T10:00:00.000Z',
      title: 'Layout TA-25N',
      sections: [sec1],
      blocks: {
        block_1: block1
      }
    };
  }

  // ==========================================================================
  // 1. ALL LAYOUT COMMANDS BUMP REVISION & NO-OP BEHAVIOR (BLOCKER 7)
  // ==========================================================================
  describe('Blocker 7 — Revision Bumping & NO-OP Idempotency', () => {
    it('touchWorkspaceLayout incrementa revision em 1 e atualiza updatedAt', () => {
      const l = createBaseLayout();
      const touched = touchWorkspaceLayout(l);
      expect(touched.revision).toBe(2);
      expect(touched.updatedAt).not.toBe(l.updatedAt);
    });

    it('addSection muta e incrementa revision', () => {
      const l = createBaseLayout();
      const next = addSection(l, { title: 'Nova Seção' });
      expect(next.revision).toBe(2);
      expect(next.sections.length).toBe(2);
    });

    it('renameSection: incrementa revision se alterado, NO-OP se idêntico', () => {
      const l = createBaseLayout();
      // NO-OP
      const noop = renameSection(l, 'sec_1', 'Seção Inicial');
      expect(noop.revision).toBe(1);
      expect(noop).toBe(l);

      // Mutação real
      const mutated = renameSection(l, 'sec_1', 'Seção Renomeada');
      expect(mutated.revision).toBe(2);
      expect(mutated.sections[0].title).toBe('Seção Renomeada');
    });

    it('removeSection: incrementa revision se achou, NO-OP se inexistente', () => {
      const l = createBaseLayout();
      // NO-OP
      const noop = removeSection(l, 'sec_inexistente');
      expect(noop.revision).toBe(1);
      expect(noop).toBe(l);

      // Mutação real
      const mutated = removeSection(l, 'sec_1');
      expect(mutated.revision).toBe(2);
      expect(mutated.sections.length).toBe(0);
      expect(mutated.blocks.block_1).toBeUndefined(); // Bloco owned removido!
    });

    it('moveSection: incrementa se moveu, NO-OP se no limite', () => {
      const l = addSection(createBaseLayout(), { title: 'Segunda Seção' });
      const sec2Id = l.sections[1].id;

      // NO-OP: já está no topo
      const noop = moveSection(l, 'sec_1', 'up');
      expect(noop.revision).toBe(l.revision);

      // Mutação real
      const mutated = moveSection(l, sec2Id, 'up');
      expect(mutated.revision).toBe(l.revision + 1);
      expect(mutated.sections[0].id).toBe(sec2Id);
    });

    it('reorderSections: incrementa se mudou a ordem, NO-OP se mesma ordem', () => {
      const l = addSection(createBaseLayout(), { title: 'Segunda Seção' });
      const currentIds = l.sections.map((s) => s.id);

      // NO-OP
      const noop = reorderSections(l, currentIds);
      expect(noop.revision).toBe(l.revision);

      // Mutação real
      const mutated = reorderSections(l, [currentIds[1], currentIds[0]]);
      expect(mutated.revision).toBe(l.revision + 1);
      expect(mutated.sections[0].id).toBe(currentIds[1]);
    });

    it('resizeBlock: incrementa se mudou tamanho, NO-OP se tamanho idêntico', () => {
      const l = createBaseLayout();
      // NO-OP: block_1 já é 'medium'
      const noop = resizeBlock(l, 'block_1', 'medium');
      expect(noop.revision).toBe(1);
      expect(noop).toBe(l);

      // Mutação real
      const mutated = resizeBlock(l, 'block_1', 'full');
      expect(mutated.revision).toBe(2);
      expect(mutated.blocks.block_1.size).toBe('full');
    });

    it('setBlockVisibility: incrementa se mudou visibilidade, NO-OP se idêntica', () => {
      const l = createBaseLayout();
      // NO-OP: block_1 já é 'visible'
      const noop = setBlockVisibility(l, 'block_1', 'visible');
      expect(noop.revision).toBe(1);
      expect(noop).toBe(l);

      // Mutação real
      const mutated = setBlockVisibility(l, 'block_1', 'hidden');
      expect(mutated.revision).toBe(2);
      expect(mutated.blocks.block_1.visibility).toBe('hidden');
    });

    it('addDatumToBlock & removeDatumFromBlock: NO-OP quando aplicável', () => {
      const l = createBaseLayout();
      // NO-OP: d_1 já está no bloco
      const noopAdd = addDatumToBlock(l, 'block_1', 'd_1');
      expect(noopAdd.revision).toBe(1);

      // Mutação: adicionar novo datum
      const added = addDatumToBlock(l, 'block_1', 'd_2');
      expect(added.revision).toBe(2);

      // NO-OP: remover datum que não existe no bloco
      const noopRemove = removeDatumFromBlock(added, 'block_1', 'd_999');
      expect(noopRemove.revision).toBe(2);

      // Mutação: remover datum existente
      const removed = removeDatumFromBlock(added, 'block_1', 'd_1');
      expect(removed.revision).toBe(3);
    });

    it('updateDisplayOverride: incrementa revision e é NO-OP quando idêntico', () => {
      const l = createBaseLayout();
      const updated = updateDisplayOverride(l, 'metrology.temp', {
        customLabel: 'Temperatura de Teste'
      });
      expect(updated.revision).toBe(2);
      expect(updated.displayOverrides?.['metrology.temp']?.customLabel).toBe('Temperatura de Teste');

      // NO-OP se enviar o mesmo override
      const noop = updateDisplayOverride(updated, 'metrology.temp', {
        customLabel: 'Temperatura de Teste'
      });
      expect(noop.revision).toBe(2);
      expect(noop).toBe(updated);
    });
  });

  // ==========================================================================
  // 2. BLOCK OWNERSHIP & ORPHAN BLOCK VALIDATION (BLOCKERS 8 & 9)
  // ==========================================================================
  describe('Blockers 8 & 9 — Strict Block Ownership & Zero Orphan Blocks', () => {
    it('falha no schema se o mesmo blockId for referenciado em duas seções', () => {
      const l = createBaseLayout();
      const duplicated = {
        ...l,
        sections: [
          l.sections[0],
          {
            id: 'sec_2',
            title: 'Segunda Seção',
            blockIds: ['block_1'], // Duplicado!
            order: 1
          }
        ]
      };

      const result = WorkspaceLayoutV1Schema.safeParse(duplicated);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('invariante de propriedade'))).toBe(true);
      }
    });

    it('falha no schema se houver bloco órfão em blocks não referenciado em nenhuma seção', () => {
      const l = createBaseLayout();
      const withOrphan = {
        ...l,
        blocks: {
          ...l.blocks,
          block_orphan: {
            id: 'block_orphan',
            kind: 'fact_grid' as const,
            title: 'Bloco Lixo',
            datumIds: []
          }
        }
      };

      const result = WorkspaceLayoutV1Schema.safeParse(withOrphan);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('Bloco órfão'))).toBe(true);
      }
    });

    it('removeSection limpa os blocos pertencentes sem deixar órfãos', () => {
      const l = createBaseLayout();
      const cleaned = removeSection(l, 'sec_1');
      expect(cleaned.sections.length).toBe(0);
      expect(Object.keys(cleaned.blocks).length).toBe(0); // Zero blocos órfãos restantes

      const parsed = WorkspaceLayoutV1Schema.safeParse(cleaned);
      expect(parsed.success).toBe(true);
    });
  });

  // ==========================================================================
  // 3. WORKBOOK REFERENCE VALIDATION (BLOCKER 10)
  // ==========================================================================
  describe('Blocker 10 — validateWorkspaceAgainstKnowledge', () => {
    function setupTestWorkbook(): ProductWorkbookV2 {
      let wb = ensureWorkbookV2(createWorkbook({ id: 'wb-val', owner: { kind: 'product', id: 'TA-25N' } }));
      wb = ensureWorkbookV2(addModule(wb, { id: 'mod-1', semanticKey: 'module.temperature', label: 'Temperatura', kind: 'key_value', order: 0 }));
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.temperature.range',
            moduleId: 'mod-1',
            label: 'Faixa de Temperatura',
            value: { type: 'range', lower: -25, upper: 155, unit: '°C' },
            evidence: [],
            status: 'verified'
          },
          'd-temp-range'
        )
      );
      return wb;
    }

    it('aprova layout quando todas as referências a datums existem no workbook', () => {
      const wb = setupTestWorkbook();
      const l: WorkspaceLayoutV1 = {
        schemaVersion: 1,
        id: 'layout_valid',
        productId: 'TA-25N',
        revision: 1,
        title: 'Layout Válido',
        sections: [
          {
            id: 'sec_1',
            title: 'Geral',
            blockIds: ['b_1'],
            order: 0
          }
        ],
        blocks: {
          b_1: {
            id: 'b_1',
            kind: 'fact_grid',
            title: 'Fatos',
            datumIds: ['d-temp-range']
          }
        }
      };

      const report = validateWorkspaceAgainstKnowledge({ layout: l, workbook: wb });
      expect(report.isValid).toBe(true);
      expect(report.errors.length).toBe(0);
    });

    it('rejeita com DATUM_NOT_FOUND quando bloco referencia datum inexistente', () => {
      const wb = setupTestWorkbook();
      const l: WorkspaceLayoutV1 = {
        schemaVersion: 1,
        id: 'layout_invalid_datum',
        productId: 'TA-25N',
        revision: 1,
        title: 'Layout Inválido',
        sections: [
          {
            id: 'sec_1',
            title: 'Geral',
            blockIds: ['b_1'],
            order: 0
          }
        ],
        blocks: {
          b_1: {
            id: 'b_1',
            kind: 'fact_grid',
            title: 'Fatos',
            datumIds: ['datum_fantasma_xyz']
          }
        }
      };

      const report = validateWorkspaceAgainstKnowledge({ layout: l, workbook: wb });
      expect(report.isValid).toBe(false);
      expect(report.errors.length).toBe(1);
      expect(report.errors[0].code).toBe('DATUM_NOT_FOUND');
      expect(report.errors[0].entityId).toBe('datum_fantasma_xyz');
    });

    it('rejeita com DATASET_NOT_FOUND quando dataset_view referencia dataset inexistente', () => {
      const wb = setupTestWorkbook();
      const l: WorkspaceLayoutV1 = {
        schemaVersion: 1,
        id: 'layout_invalid_ds',
        productId: 'TA-25N',
        revision: 1,
        title: 'Layout Inválido',
        sections: [
          {
            id: 'sec_1',
            title: 'Tabelas',
            blockIds: ['b_ds'],
            order: 0
          }
        ],
        blocks: {
          b_ds: {
            id: 'b_ds',
            kind: 'dataset_view',
            datasetId: 'dataset_fantasma'
          }
        }
      };

      const report = validateWorkspaceAgainstKnowledge({ layout: l, workbook: wb });
      expect(report.isValid).toBe(false);
      expect(report.errors.some((e) => e.code === 'DATASET_NOT_FOUND')).toBe(true);
    });
  });

  // ==========================================================================
  // 4. AI TRUTH POLICY: INVALID CANONICAL DECISION (BLOCKER 11)
  // ==========================================================================
  describe('Blocker 11 — Invalid Canonical Decision vs Conflict in AI Envelope', () => {
    it('exclui de facts[] e inclui em conflicts[] se canonicalDecision for inválida', () => {
      const docPt: SourceDocument = {
        id: 'doc-pt',
        title: 'Manual PT',
        documentType: 'manual',
        revision: '2026-01'
      };
      const docEn: SourceDocument = {
        id: 'doc-en',
        title: 'Manual EN',
        documentType: 'manual',
        revision: '2026-01'
      };

      let wb = ensureWorkbookV2(createWorkbook({ id: 'wb-ai-conf', owner: { kind: 'product', id: 'TA-25N' } }));
      wb = ensureWorkbookV2(addModule(wb, { id: 'mod-1', semanticKey: 'module.calibration', label: 'Calibração', kind: 'key_value', order: 0 }));

      // Dado com 2 evidências divergentes (140°C vs 155°C) e canonicalDecision INVÁLIDA (sem rationale)
      wb = ensureWorkbookV2(
        addDatum(
          wb,
        {
          semanticKey: 'metrology.temp.max',
          moduleId: 'mod-1',
          label: 'Temperatura Máxima',
          value: { type: 'quantity', amount: 140, unit: '°C' },
          evidence: [
            {
              id: 'ev-1',
              sourceDocumentId: 'doc-pt',
              page: 10,
              observedValue: { type: 'quantity', amount: 140, unit: '°C' }
            },
            {
              id: 'ev-2',
              sourceDocumentId: 'doc-en',
              page: 15,
              observedValue: { type: 'quantity', amount: 155, unit: '°C' }
            }
          ],
          canonicalDecision: {
            kind: 'selected_evidence',
            selectedEvidenceId: 'ev-1',
            rationale: '', // INVÁLIDA: rationale vazio!
            decidedAt: '2026-09-04T10:00:00Z',
            decidedBy: 'user-eng'
          },
          status: 'draft'
        },
        'd-conflict-invalid-decision'
      ));

      const envelope = buildAiProductKnowledgeEnvelope({
        workbook: wb,
        sources: [docPt, docEn],
        purpose: 'factual_answer'
      });

      // NÃO pode entrar em facts[]
      const inFacts = envelope.facts.find((f) => f.datumId === 'd-conflict-invalid-decision');
      expect(inFacts).toBeUndefined();

      // DEVE constar em conflicts[]
      const inConflicts = envelope.conflicts.find((c) => c.datumId === 'd-conflict-invalid-decision');
      expect(inConflicts).toBeDefined();
      expect(inConflicts?.status).toBe('conflicting');
      expect(inConflicts?.candidates.length).toBe(2);
    });
  });

  // ==========================================================================
  // 5. PROJECTION MUST DERIVE STATUS (BLOCKER 12)
  // ==========================================================================
  describe('Blocker 12 — Projection Must Derive Status', () => {
    it('projeta status como conflicting no fallback local para dado com divergências', () => {
      let wb = ensureWorkbookV2(createWorkbook({ id: 'wb-proj-status', owner: { kind: 'product', id: 'TA-25N' } }));
      wb = ensureWorkbookV2(addModule(wb, { id: 'mod-1', semanticKey: 'module.calibration', label: 'Calibração', kind: 'key_value', order: 0 }));

      // Dado armazenado como 'draft', mas com evidências divergentes
      wb = ensureWorkbookV2(
        addDatum(
          wb,
        {
          semanticKey: 'metrology.temp.max',
          moduleId: 'mod-1',
          label: 'Temperatura Máxima',
          value: { type: 'quantity', amount: 140, unit: '°C' },
          evidence: [
            {
              id: 'ev-1',
              sourceDocumentId: 'doc-1',
              page: 1,
              observedValue: { type: 'number', value: 140 }
            },
            {
              id: 'ev-2',
              sourceDocumentId: 'doc-2',
              page: 2,
              observedValue: { type: 'number', value: 150 }
            }
          ],
          status: 'draft'
        },
        'd-conflict-local'
      ));

      const proj = buildWorkspaceProjection({ workbook: wb });
      const allItems = proj.sections
        .flatMap((s) => s.blocks)
        .flatMap((b) => (b.kind === 'fact_grid' || b.kind === 'datum_list' ? b.items : []));
      const fact = allItems.find((f) => f.datumId === 'd-conflict-local');
      expect(fact).toBeDefined();
      expect(fact?.status).toBe('conflicting');
      expect(fact?.hasConflict).toBe(true);
      expect(proj.stats.conflicts).toBe(1);
    });
  });

  // ==========================================================================
  // 6. CANONICAL SEMANTIC REGISTRY (BLOCKERS 13-16)
  // ==========================================================================
  describe('Blockers 13-16 — ProductSemanticRegistry & Decoupled Aliases', () => {
    it('autoOrganizeProductWorkspace NÃO grava semanticDescriptors no layout', () => {
      let wb = ensureWorkbookV2(createWorkbook({ id: 'wb-auto', owner: { kind: 'product', id: 'TA-25N' } }));
      wb = ensureWorkbookV2(addModule(wb, { id: 'mod-1', semanticKey: 'module.specs', label: 'Módulo 1', kind: 'key_value', order: 0 }));
      wb = ensureWorkbookV2(
        addDatum(
          wb,
        {
          semanticKey: 'metrology.resolution',
          moduleId: 'mod-1',
          label: 'Resolução',
          value: { type: 'quantity', amount: 0.01, unit: '°C' },
          evidence: [],
          status: 'verified'
        },
        'd-res'
      ));

      const layout = autoOrganizeProductWorkspace({ workbook: wb });
      expect(layout.semanticDescriptors).toBeUndefined();
    });

    it('buildAiProductKnowledgeEnvelope consome aliases do ProductSemanticRegistry como soberano', () => {
      let wb = ensureWorkbookV2(createWorkbook({ id: 'wb-reg-ai', owner: { kind: 'product', id: 'TA-25N' } }));
      wb = ensureWorkbookV2(addModule(wb, { id: 'mod-1', semanticKey: 'module.specs', label: 'Módulo 1', kind: 'key_value', order: 0 }));
      wb = ensureWorkbookV2(
        addDatum(
          wb,
        {
          semanticKey: 'metrology.accuracy',
          moduleId: 'mod-1',
          label: 'Exatidão',
          value: { type: 'quantity', amount: 0.1, unit: '°C' },
          evidence: [],
          status: 'approved'
        },
        'd-acc'
      ));

      const registry: ProductSemanticRegistry = createProductSemanticRegistry({
        productId: 'TA-25N',
        descriptors: {
          'metrology.accuracy': createSemanticDescriptor({
            canonicalKey: 'metrology.accuracy',
            displayLabel: 'Exatidão Metrológica Canônica',
            aliases: ['accuracy', 'precisão', 'tolerance']
          })
        }
      });

      const envelope = buildAiProductKnowledgeEnvelope({
        workbook: wb,
        semanticRegistry: registry
      });

      const item = envelope.facts.find((f) => f.canonicalSemanticKey === 'metrology.accuracy');
      expect(item).toBeDefined();
      expect(item?.displayLabel).toBe('Exatidão Metrológica Canônica');
      expect(item?.aliases).toEqual(['accuracy', 'precisão', 'tolerance']);
    });

    it('buildWorkspaceProjection aplica displayOverrides do layout sobre o label canônico do registry', () => {
      let wb = ensureWorkbookV2(createWorkbook({ id: 'wb-proj-over', owner: { kind: 'product', id: 'TA-25N' } }));
      wb = ensureWorkbookV2(addModule(wb, { id: 'mod-1', semanticKey: 'module.specs', label: 'Módulo 1', kind: 'key_value', order: 0 }));
      wb = ensureWorkbookV2(
        addDatum(
          wb,
        {
          semanticKey: 'metrology.stability',
          moduleId: 'mod-1',
          label: 'Estabilidade',
          value: { type: 'quantity', amount: 0.05, unit: '°C' },
          evidence: [],
          status: 'verified'
        },
        'd-stab'
      ));

      const registry: ProductSemanticRegistry = createProductSemanticRegistry({
        productId: 'TA-25N',
        descriptors: {
          'metrology.stability': createSemanticDescriptor({
            canonicalKey: 'metrology.stability',
            displayLabel: 'Estabilidade de Temperatura Canônica'
          })
        }
      });

      const layout: WorkspaceLayoutV1 = {
        ...createBaseLayout(),
        blocks: {
          block_1: {
            id: 'block_1',
            kind: 'fact_grid',
            title: 'Grid de Fatos',
            datumIds: ['d-stab'],
            size: 'medium',
            visibility: 'visible'
          }
        },
        displayOverrides: {
          'metrology.stability': {
            customLabel: 'Rótulo Cosmético da Minha Tela'
          }
        }
      };

      const proj = buildWorkspaceProjection({
        workbook: wb,
        semanticRegistry: registry,
        layout
      });

      const allItems = proj.sections
        .flatMap((s) => s.blocks)
        .flatMap((b) => (b.kind === 'fact_grid' || b.kind === 'datum_list' ? b.items : []));
      const fact = allItems.find((f) => f.canonicalSemanticKey === 'metrology.stability');
      expect(fact?.displayLabel).toBe('Rótulo Cosmético da Minha Tela');
    });
  });

  // ==========================================================================
  // 7. RENAME ALIAS COLLISION (BLOCKER 17)
  // ==========================================================================
  describe('Blocker 17 — planCanonicalRename Alias Collision', () => {
    it('detecta colisão quando nova chave coincide com alias já reservado por outro datum', () => {
      let wb = ensureWorkbookV2(createWorkbook({ id: 'wb-rename-col', owner: { kind: 'product', id: 'TA-25N' } }));
      wb = ensureWorkbookV2(addModule(wb, { id: 'mod-1', semanticKey: 'module.specs', label: 'Módulo 1', kind: 'key_value', order: 0 }));
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.sensor.rtd',
            moduleId: 'mod-1',
            label: 'Sensor RTD',
            value: { type: 'text', value: 'Pt100' },
            evidence: [],
            status: 'verified'
          },
          'd-rtd'
        )
      );
      wb = ensureWorkbookV2(
        addDatum(
          wb,
        {
          semanticKey: 'metrology.probe.type',
          moduleId: 'mod-1',
          label: 'Tipo de Sonda',
          value: { type: 'text', value: 'Probe A' },
          evidence: [],
          status: 'verified'
        },
        'd-probe'
      ));

      // O registry define que 'metrology.probe.type' tem alias reservado 'metrology.probe.sensor'
      const registry: ProductSemanticRegistry = createProductSemanticRegistry({
        productId: 'TA-25N',
        descriptors: {
          'metrology.probe.type': createSemanticDescriptor({
            canonicalKey: 'metrology.probe.type',
            displayLabel: 'Tipo de Sonda',
            aliases: ['metrology.probe.sensor']
          })
        }
      });

      // Tenta renomear 'metrology.sensor.rtd' para 'metrology.probe.sensor' (colide com o alias de d-probe!)
      const plan = planCanonicalRename({
        workbook: wb,
        semanticRegistry: registry,
        oldCanonicalKey: 'metrology.sensor.rtd',
        newCanonicalKey: 'metrology.probe.sensor',
        rationale: 'Teste de colisão contra alias reservado'
      });

      expect(plan.collisionCheck.hasCollision).toBe(true);
      expect(plan.isExecutable).toBe(false);
      expect(plan.validationErrors.some((e) => e.includes('Colisão detectada'))).toBe(true);
    });
  });

  // ==========================================================================
  // 8. EXTERNAL BINDING LOCATOR (BLOCKER 18)
  // ==========================================================================
  describe('Blocker 18 — External Binding Locator Contextualization', () => {
    it('mapeia referências externas com catalogId, pageId e blockId detalhados', () => {
      let wb = ensureWorkbookV2(createWorkbook({ id: 'wb-ext-loc', owner: { kind: 'product', id: 'TA-25N' } }));
      wb = ensureWorkbookV2(addModule(wb, { id: 'mod-1', semanticKey: 'module.specs', label: 'Módulo 1', kind: 'key_value', order: 0 }));
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.temp.spec',
            moduleId: 'mod-1',
            label: 'Temp Spec',
            value: { type: 'number', value: 100 },
            evidence: [],
            status: 'verified'
          },
          'd-spec'
        )
      );

      const contextualBinding: ExternalCatalogBindingReference = {
        catalogId: 'cat_presys_2026',
        pageId: 'page_4',
        blockId: 'block_table_specs',
        rowId: 'row_1',
        cellKey: 'cell_r1_c2',
        binding: {
          productId: 'TA-25N',
          semanticKey: 'metrology.temp.spec',
          sourceKind: 'pim_datum',
          bindingMode: 'live'
        }
      };

      const graph = buildSemanticReferenceGraph({
        canonicalKey: 'metrology.temp.spec',
        workbook: wb,
        externalCatalogBindings: [contextualBinding],
        isExternalIndexComplete: true
      });

      expect(graph.externalReferences.items.length).toBe(1);
      const extRef = graph.externalReferences.items[0];
      expect(extRef.containerId).toBe('cat_presys_2026:page_4:block_table_specs');
      expect(extRef.path).toContain('catalogs[cat_presys_2026].pages[page_4].blocks[block_table_specs]');
      expect(extRef.containerLabel).toContain('Página page_4, Bloco block_table_specs');
    });
  });

  // ==========================================================================
  // 9. TS / ZOD PATCH PARITY & STRICT SCHEMA (BLOCKER 19)
  // ==========================================================================
  describe('Blocker 19 — TS / Zod Patch Parity', () => {
    it('WorkspaceEditDraftSchema valida patch estrito de layout e rejeita unknown properties', () => {
      const draft: WorkspaceEditDraft = {
        productId: 'TA-25N',
        stagedDatumChanges: {},
        stagedLayoutChanges: {
          title: 'Novo Título do Layout'
        }
      };

      const parsed = WorkspaceEditDraftSchema.safeParse(draft);
      expect(parsed.success).toBe(true);

      const invalidDraft = {
        productId: 'TA-25N',
        stagedDatumChanges: {},
        stagedLayoutChanges: {
          title: 'Novo Título',
          propriedade_lixo_desconhecida: 123
        }
      };

      const invalidParsed = WorkspaceEditDraftSchema.safeParse(invalidDraft);
      expect(invalidParsed.success).toBe(false);
    });
  });

  // ==========================================================================
  // 10. REVISION DOMAIN: POSITIVE INTEGER >= 1 (BLOCKER 20)
  // ==========================================================================
  describe('Blocker 20 — Persisted Layout Revision Starts at 1', () => {
    it('rejeita layout com revision 0 e aceita revision >= 1', () => {
      const base = createBaseLayout();

      const rev0 = { ...base, revision: 0 };
      const res0 = WorkspaceLayoutV1Schema.safeParse(rev0);
      expect(res0.success).toBe(false);

      const rev1 = { ...base, revision: 1 };
      const res1 = WorkspaceLayoutV1Schema.safeParse(rev1);
      expect(res1.success).toBe(true);

      const rev42 = { ...base, revision: 42 };
      const res42 = WorkspaceLayoutV1Schema.safeParse(rev42);
      expect(res42.success).toBe(true);
    });
  });
});
