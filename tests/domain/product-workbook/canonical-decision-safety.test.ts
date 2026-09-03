// tests/domain/product-workbook/canonical-decision-safety.test.ts
// Test suite covering Phase PIM.W1.1 / Part K: Canonical Decision Safety and Provenance Validation.

import { describe, it, expect } from 'vitest';
import {
  TechnicalDatum,
  createWorkbook,
  addModule,
  addDatum,
  setCanonicalDecision,
  detectEvidenceConflicts,
  deriveDatumStatus,
  validateProductKnowledgeBundle
} from '../../../src/domain/product-workbook';

describe('PIM.W1.1 — Part K: Canonical Decision Safety & Provenance Integrity', () => {
  // Helper que cria um datum com duas evidências conflitantes
  function createConflictingDatum(): TechnicalDatum {
    return {
      id: 'datum-pressure',
      semanticKey: 'metrology.pressure.range',
      moduleId: 'mod-1',
      label: 'Faixa de Pressão',
      value: { type: 'quantity', amount: 10, unit: 'bar' },
      evidence: [
        {
          id: 'ev-manual-us',
          sourceDocumentId: 'doc-manual-us',
          page: 15,
          observedValue: { type: 'quantity', amount: 10, unit: 'bar' }
        },
        {
          id: 'ev-datasheet-eu',
          sourceDocumentId: 'doc-datasheet-eu',
          page: 3,
          observedValue: { type: 'quantity', amount: 16, unit: 'bar' }
        }
      ],
      status: 'draft'
    };
  }

  // =========================================================================
  // PIM-CONFLICT-DECISION-1: Selected evidence without evidenceId rejected
  // =========================================================================
  it('PIM-CONFLICT-DECISION-1: rejeita decisão selected_evidence sem selectedEvidenceId', () => {
    const datum = createConflictingDatum();
    const invalidDatum: TechnicalDatum = {
      ...datum,
      canonicalDecision: {
        kind: 'selected_evidence',
        selectedEvidenceId: '', // VAZIO!
        rationale: 'Justificativa de teste',
        decidedAt: '2026-08-10T14:30:00Z'
      }
    };

    const conflict = detectEvidenceConflicts(invalidDatum);
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.isResolvedByCanonicalDecision).toBe(false);
    expect(conflict.reason).toContain('não informou selectedEvidenceId');
    expect(deriveDatumStatus(invalidDatum)).toBe('conflicting');
  });

  // =========================================================================
  // PIM-CONFLICT-DECISION-2: Selected unknown evidence rejected
  // =========================================================================
  it('PIM-CONFLICT-DECISION-2: rejeita decisão referenciando evidência órfã não anexada ao dado', () => {
    const datum = createConflictingDatum();
    const orphanRefDatum: TechnicalDatum = {
      ...datum,
      canonicalDecision: {
        kind: 'selected_evidence',
        selectedEvidenceId: 'ev-ghost-nonexistent', // Evidência não existe em datum.evidence!
        rationale: 'Arbitragem baseada em documento não anexado',
        decidedAt: '2026-08-10T14:30:00Z'
      }
    };

    const conflict = detectEvidenceConflicts(orphanRefDatum);
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.isResolvedByCanonicalDecision).toBe(false);
    expect(conflict.reason).toContain('não está anexada ao dado');
    expect(deriveDatumStatus(orphanRefDatum)).toBe('conflicting');
  });

  // =========================================================================
  // PIM-CONFLICT-DECISION-3: Decision without rationale rejected
  // =========================================================================
  it('PIM-CONFLICT-DECISION-3: rejeita decisão sem justificativa (rationale obrigatório e não-vazio)', () => {
    const datum = createConflictingDatum();
    const emptyRationaleDatum: TechnicalDatum = {
      ...datum,
      canonicalDecision: {
        kind: 'selected_evidence',
        selectedEvidenceId: 'ev-manual-us',
        rationale: '   ', // VAZIO / whitespace!
        decidedAt: '2026-08-10T14:30:00Z'
      }
    };

    const conflict = detectEvidenceConflicts(emptyRationaleDatum);
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.isResolvedByCanonicalDecision).toBe(false);
    expect(conflict.reason).toContain('rationale é obrigatório');
    expect(deriveDatumStatus(emptyRationaleDatum)).toBe('conflicting');
  });

  // =========================================================================
  // PIM-CONFLICT-DECISION-4: Valid selected evidence resolves conflict
  // =========================================================================
  it('PIM-CONFLICT-DECISION-4: decisão válida do tipo selected_evidence resolve o conflito com sucesso', () => {
    const datum = createConflictingDatum();
    const validResolvedDatum: TechnicalDatum = {
      ...datum,
      canonicalDecision: {
        kind: 'selected_evidence',
        selectedEvidenceId: 'ev-datasheet-eu',
        rationale: 'O datasheet EU reflete a revisão mais recente das válvulas de alívio.',
        decidedAt: '2026-08-10T14:30:00Z',
        decidedBy: 'usr-lead-engineer'
      },
      status: 'approved'
    };

    const conflict = detectEvidenceConflicts(validResolvedDatum);
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.isResolvedByCanonicalDecision).toBe(true);
    expect(deriveDatumStatus(validResolvedDatum)).toBe('approved');
  });

  // =========================================================================
  // PIM-CONFLICT-SYNTHETIC-1: Synthetic/engineering decision without basis rejected
  // =========================================================================
  it('PIM-CONFLICT-SYNTHETIC-1: rejeita decisão de engenharia sem evidências de base ou com lista vazia', () => {
    const datum = createConflictingDatum();
    const noBasisDatum: TechnicalDatum = {
      ...datum,
      canonicalDecision: {
        kind: 'engineering_decision',
        basisEvidenceIds: [], // VAZIO!
        rationale: 'Conclusão de engenharia sem base documental',
        decidedAt: '2026-08-10T14:30:00Z'
      }
    };

    const conflict = detectEvidenceConflicts(noBasisDatum);
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.isResolvedByCanonicalDecision).toBe(false);
    expect(conflict.reason).toContain('exige ao menos uma evidência de base');
    expect(deriveDatumStatus(noBasisDatum)).toBe('conflicting');
  });

  // =========================================================================
  // PIM-CONFLICT-SYNTHETIC-2: Valid multi-evidence engineering decision resolves
  // =========================================================================
  it('PIM-CONFLICT-SYNTHETIC-2: decisão de engenharia fundamentada em múltiplas evidências válidas resolve o conflito', () => {
    const datum = createConflictingDatum();
    const validSyntheticDatum: TechnicalDatum = {
      ...datum,
      canonicalDecision: {
        kind: 'engineering_decision',
        basisEvidenceIds: ['ev-manual-us', 'ev-datasheet-eu'],
        rationale: 'A pressão de 10 bar é a contínua recomendada (US) e 16 bar é o teste de pico hidrostático (EU). Adotamos 10 bar para especificação nominal.',
        decidedAt: '2026-08-10T15:00:00Z',
        decidedBy: 'usr-chief-metrologist'
      },
      status: 'approved'
    };

    const conflict = detectEvidenceConflicts(validSyntheticDatum);
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.isResolvedByCanonicalDecision).toBe(true);
    expect(deriveDatumStatus(validSyntheticDatum)).toBe('approved');
  });

  // =========================================================================
  // PIM-SOURCE-REF-1: Unknown sourceDocumentId rejected by bundle validator
  // =========================================================================
  it('PIM-SOURCE-REF-1: validador de bundle rejeita evidência referenciando sourceDocumentId inexistente', () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-bundle-test' } });
    wb = addModule(wb, { id: 'm1', semanticKey: 'gen.specs', label: 'Geral', kind: 'key_value', order: 1 });
    wb = addDatum(wb, {
      semanticKey: 'gen.model.name',
      moduleId: 'm1',
      label: 'Modelo',
      value: { type: 'text', value: 'Alpha-1' },
      evidence: [
        {
          id: 'ev-orphan-source',
          sourceDocumentId: 'doc-does-not-exist-in-bundle', // Não consta no bundle!
          observedValue: { type: 'text', value: 'Alpha-1' }
        }
      ],
      status: 'draft'
    });

    const bundleValidation = validateProductKnowledgeBundle({
      sources: [
        {
          id: 'doc-real-1',
          title: 'Manual Oficial',
          documentType: 'manual',
          language: 'pt-BR',
          publicationDate: '2026-01-10'
        }
      ],
      workbooks: [wb]
    });

    expect(bundleValidation.valid).toBe(false);
    expect(bundleValidation.errors.some((e) => e.code === 'ORPHAN_SOURCE_DOCUMENT_REF')).toBe(true);
    expect(bundleValidation.errors.find((e) => e.code === 'ORPHAN_SOURCE_DOCUMENT_REF')?.message).toContain(
      'referencia sourceDocumentId inexistente no bundle'
    );
  });

  // =========================================================================
  // PIM-SOURCE-REF-2: Valid sourceDocumentId accepted by bundle validator
  // =========================================================================
  it('PIM-SOURCE-REF-2: aceita bundle onde todas as evidências referenciam documentos fonte presentes', () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-bundle-ok' } });
    wb = addModule(wb, { id: 'm1', semanticKey: 'gen.specs', label: 'Geral', kind: 'key_value', order: 1 });
    wb = addDatum(wb, {
      semanticKey: 'gen.model.name',
      moduleId: 'm1',
      label: 'Modelo',
      value: { type: 'text', value: 'Alpha-1' },
      evidence: [
        {
          id: 'ev-valid-source',
          sourceDocumentId: 'doc-real-1', // Presente no bundle!
          observedValue: { type: 'text', value: 'Alpha-1' }
        }
      ],
      status: 'draft'
    });

    const bundleValidation = validateProductKnowledgeBundle({
      sources: [
        {
          id: 'doc-real-1',
          title: 'Manual Oficial',
          documentType: 'manual',
          language: 'pt-BR',
          publicationDate: '2026-01-10'
        }
      ],
      workbooks: [wb]
    });

    expect(bundleValidation.valid).toBe(true);
    expect(bundleValidation.errors.length).toBe(0);
  });

  // =========================================================================
  // APPROVAL SAFETY: approveDatum falha se houver conflito e decisão inválida
  // =========================================================================
  it('APPROVAL-SAFETY-1: approveDatum falha se o dado contiver conflito com decisão canônica referencialmente inválida', () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'p1' } });
    wb = addModule(wb, { id: 'm1', semanticKey: 'spec.mod', label: 'Mod', kind: 'key_value', order: 1 });
    wb = addDatum(
      wb,
      {
        semanticKey: 'spec.temp.limit',
        moduleId: 'm1',
        label: 'Limite',
        value: { type: 'quantity', amount: 100, unit: '°C' },
        evidence: [
          { id: 'ev-1', sourceDocumentId: 's1', observedValue: { type: 'quantity', amount: 100, unit: '°C' } },
          { id: 'ev-2', sourceDocumentId: 's2', observedValue: { type: 'quantity', amount: 120, unit: '°C' } }
        ],
        status: 'draft'
      },
      'datum-test'
    );

    // Tenta aplicar decisão referenciando evidência inexistente
    expect(() => {
      setCanonicalDecision(wb, 'datum-test', {
        kind: 'selected_evidence',
        selectedEvidenceId: 'ev-ghost',
        rationale: 'Tentativa de forçar decisão',
        decidedAt: '2026-08-10T14:30:00Z'
      });
    }).toThrowError(/INVALID_CANONICAL_DECISION/);
  });
});
