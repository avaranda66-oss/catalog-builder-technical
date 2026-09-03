// tests/domain/product-workbook/provenance-and-conflicts.test.ts
// Test suite covering provenance tracking, evidence conflict detection, canonical decisions, and lifecycle.

import { describe, it, expect } from 'vitest';
import {
  TechnicalDatum,
  createWorkbook,
  addModule,
  addDatum,
  attachEvidence,
  setCanonicalDecision,
  approveDatum,
  deprecateDatum,
  detectEvidenceConflicts,
  deriveDatumStatus
} from '../../../src/domain/product-workbook';

describe('PIM.W1 — Provenance, Evidence Conflict & Canonical Decisions', () => {
  // =========================================================================
  // EVIDENCE-1: Anexo de evidência singular convergente
  // =========================================================================
  it('EVIDENCE-1: evidência singular compatível não gera conflito', () => {
    const datum: TechnicalDatum = {
      id: 'd-range-1',
      semanticKey: 'metrology.temperature.range',
      moduleId: 'mod-1',
      label: 'Faixa de Temperatura',
      value: { type: 'range', lower: -25, upper: 140, unit: '°C' },
      evidence: [
        {
          id: 'ev-1',
          sourceDocumentId: 'doc-manual-pt',
          page: 12,
          observedValue: { type: 'range', lower: -25, upper: 140, unit: '°C' }
        }
      ],
      status: 'verified'
    };

    const conflict = detectEvidenceConflicts(datum);
    expect(conflict.hasConflict).toBe(false);
    expect(conflict.isResolvedByCanonicalDecision).toBe(false);
    expect(deriveDatumStatus(datum)).toBe('verified');
  });

  // =========================================================================
  // SOURCE-CONFLICT-1: Detecção de conflito entre fontes documentais distintas
  // =========================================================================
  it('SOURCE-CONFLICT-1: detecta discrepância factual entre fontes distintas (ex: Manual EN vs Datasheet PT)', () => {
    const datum: TechnicalDatum = {
      id: 'd-temp-max',
      semanticKey: 'metrology.temperature.max',
      moduleId: 'mod-1',
      label: 'Temperatura Máxima de Calibração',
      value: { type: 'quantity', amount: 140, unit: '°C' },
      evidence: [
        {
          id: 'ev-manual-en',
          sourceDocumentId: 'doc-manual-en-rev2',
          page: 5,
          observedValue: { type: 'quantity', amount: 155, unit: '°C' }, // 155 °C afirmado pelo manual EN
          notes: 'Tabela de limites operacionais'
        },
        {
          id: 'ev-datasheet-pt',
          sourceDocumentId: 'doc-datasheet-pt-2026',
          page: 2,
          observedValue: { type: 'quantity', amount: 140, unit: '°C' }, // 140 °C afirmado pelo datasheet PT
          notes: 'Especificação resumida'
        }
      ],
      status: 'draft'
    };

    const conflict = detectEvidenceConflicts(datum);
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.distinctObservedValues.length).toBe(2);
    expect(conflict.isResolvedByCanonicalDecision).toBe(false);
    expect(conflict.reason).toContain('Conflito de evidências');

    // Status derivado torna-se 'conflicting'
    expect(deriveDatumStatus(datum)).toBe('conflicting');
  });

  // =========================================================================
  // CANONICAL-DECISION-1: Resolução formal de conflito documental
  // =========================================================================
  it('CANONICAL-DECISION-1: decisão canônica fundamentada resolve o conflito de evidências', () => {
    const datumWithDecision: TechnicalDatum = {
      id: 'd-temp-max',
      semanticKey: 'metrology.temperature.max',
      moduleId: 'mod-1',
      label: 'Temperatura Máxima de Calibração',
      value: { type: 'quantity', amount: 140, unit: '°C' },
      evidence: [
        {
          id: 'ev-manual-en',
          sourceDocumentId: 'doc-manual-en-rev2',
          page: 5,
          observedValue: { type: 'quantity', amount: 155, unit: '°C' }
        },
        {
          id: 'ev-datasheet-pt',
          sourceDocumentId: 'doc-datasheet-pt-2026',
          page: 2,
          observedValue: { type: 'quantity', amount: 140, unit: '°C' }
        }
      ],
      canonicalDecision: {
        kind: 'selected_evidence',
        selectedEvidenceId: 'ev-datasheet-pt',
        rationale: 'O manual EN rev2 continha errata corrigida no datasheet PT 2026 pelo laboratório de metrologia.',
        decidedAt: '2026-08-10T14:30:00Z',
        decidedBy: 'usr-metrology-lead'
      },
      status: 'approved'
    };

    const conflict = detectEvidenceConflicts(datumWithDecision);
    expect(conflict.hasConflict).toBe(true); // Conflito histórico existente nas fontes
    expect(conflict.isResolvedByCanonicalDecision).toBe(true); // Mas devidamente arbitrado por decisão canônica
    expect(deriveDatumStatus(datumWithDecision)).toBe('approved'); // Status retorna 'approved', não 'conflicting'
  });

  // =========================================================================
  // APPROVAL-1: Falha fechada na aprovação de fatos conflitantes não resolvidos
  // =========================================================================
  it('APPROVAL-1: impede aprovação de dado com conflito documental sem decisão canônica', () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-10' } });
    wb = addModule(wb, {
      id: 'mod-1',
      semanticKey: 'metrology.specs',
      label: 'Metrologia',
      kind: 'key_value',
      order: 0
    });

    wb = addDatum(
      wb,
      {
        semanticKey: 'metrology.flow.rate',
        moduleId: 'mod-1',
        label: 'Vazão Nominal',
        value: { type: 'quantity', amount: 50, unit: 'm' },
        evidence: [],
        status: 'draft'
      },
      'datum-flow'
    );

    // Anexa duas evidências discrepantes
    wb = attachEvidence(wb, 'datum-flow', {
      id: 'ev-a',
      sourceDocumentId: 'src-1',
      observedValue: { type: 'quantity', amount: 50, unit: 'm' }
    });
    wb = attachEvidence(wb, 'datum-flow', {
      id: 'ev-b',
      sourceDocumentId: 'src-2',
      observedValue: { type: 'quantity', amount: 75, unit: 'm' }
    });

    // Tentar aprovar diretamente deve lançar erro
    expect(() => approveDatum(wb, 'datum-flow')).toThrowError(/CANNOT_APPROVE_CONFLICT/);

    // Agora arbitra a decisão canônica
    wb = setCanonicalDecision(wb, 'datum-flow', {
      kind: 'selected_evidence',
      selectedEvidenceId: 'ev-a',
      rationale: 'Calibração padrão em bancada 50 m.',
      decidedAt: '2026-08-10T14:30:00Z'
    });

    // Agora a aprovação deve ter sucesso!
    wb = approveDatum(wb, 'datum-flow', 'lead-engineer');
    expect(wb.data['datum-flow'].status).toBe('approved');
    expect(wb.data['datum-flow'].audit?.updatedBy).toBe('lead-engineer');
  });

  // =========================================================================
  // DEPRECATION-1: Depreciação mantém dado no histórico sem destruição
  // =========================================================================
  it('DEPRECATION-1: deprecateDatum preserva o dado e marca status deprecated', () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-10' } });
    wb = addModule(wb, {
      id: 'mod-1',
      semanticKey: 'legacy.specs',
      label: 'Legado',
      kind: 'key_value',
      order: 0
    });

    wb = addDatum(
      wb,
      {
        semanticKey: 'legacy.old_serial',
        moduleId: 'mod-1',
        label: 'Número de Série Antigo',
        value: { type: 'text', value: 'SN-001' },
        evidence: [],
        status: 'approved'
      },
      'datum-old'
    );

    wb = deprecateDatum(wb, 'datum-old', 'Substituído pelo protocolo v2');
    expect(wb.data['datum-old'].status).toBe('deprecated');
    expect(deriveDatumStatus(wb.data['datum-old'])).toBe('deprecated');
  });
});
