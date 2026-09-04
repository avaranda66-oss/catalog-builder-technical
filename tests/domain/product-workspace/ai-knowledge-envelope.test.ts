// tests/domain/product-workspace/ai-knowledge-envelope.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildAiProductKnowledgeEnvelope
} from '../../../src/domain/product-workspace/ai-envelope';
import {
  createWorkbook,
  ensureWorkbookV2,
  addModule,
  addDatum,
  SourceDocument
} from '../../../src/domain/product-workbook';

describe('AI Product Knowledge Envelope & Zero-Loss Provenance', () => {
  it('constrói envelope tipado com rastreamento completo de documento, página e valor observado', () => {
    let wb = ensureWorkbookV2(
      createWorkbook({
        id: 'wb-ai-test',
        owner: { kind: 'product', id: 'TA-25N' },
        revision: 3
      })
    );

    wb = ensureWorkbookV2(
      addModule(wb, {
        id: 'mod-metrology',
        semanticKey: 'metrology.specs',
        label: 'Especificações Metrológicas',
        kind: 'key_value',
        order: 0
      })
    );

    const doc: SourceDocument = {
      id: 'doc-manual-pt',
      title: 'Manual Técnico TA-25N',
      documentType: 'manual',
      revision: 'EM0291-04',
      language: 'pt-BR'
    };

    wb = ensureWorkbookV2(
      addDatum(
        wb,
        {
          semanticKey: 'metrology.temperature.range',
          moduleId: 'mod-metrology',
          label: 'Faixa de Temperatura',
          value: { type: 'range', lower: -25, upper: 140, unit: '°C' },
          evidence: [
            {
              id: 'ev-1',
              sourceDocumentId: 'doc-manual-pt',
              page: 5,
              section: '1. Especificações Técnicas',
              locator: 'Tabela 1.1',
              observedValue: { type: 'range', lower: -25, upper: 140, unit: '°C' },
              excerpt: 'Faixa de controle: -25 a 140 °C em temperatura ambiente de 23 °C.'
            }
          ],
          status: 'approved'
        },
        'datum-range'
      )
    );

    const envelope = buildAiProductKnowledgeEnvelope({
      workbook: wb,
      sources: [doc]
    });

    expect(envelope.productId).toBe('TA-25N');
    expect(envelope.productRevision).toBe(3);
    expect(envelope.summary.totalFacts).toBe(1);
    expect(envelope.summary.factsWithProvenance).toBe(1);

    const fact = envelope.items[0];
    expect(fact.canonicalSemanticKey).toBe('metrology.temperature.range');
    expect(fact.status).toBe('approved');
    expect(fact.hasProvenance).toBe(true);

    // Proveniência exata
    expect(fact.evidenceReferences.length).toBe(1);
    const ev = fact.evidenceReferences[0];
    expect(ev.sourceTitle).toBe('Manual Técnico TA-25N');
    expect(ev.page).toBe(5);
    expect(ev.section).toBe('1. Especificações Técnicas');
    expect(ev.locator).toBe('Tabela 1.1');
    expect(ev.excerpt).toContain('-25 a 140 °C');
  });

  it('sinaliza ausência de proveniência explicitamente sem inventar dados (fail-safe anti-alucinação)', () => {
    let wb = ensureWorkbookV2(
      createWorkbook({
        id: 'wb-no-source',
        owner: { kind: 'product', id: 'TA-35N' },
        revision: 1
      })
    );

    wb = ensureWorkbookV2(
      addModule(wb, {
        id: 'mod-m',
        semanticKey: 'general.notes',
        label: 'Módulo',
        kind: 'key_value',
        order: 0
      })
    );

    wb = ensureWorkbookV2(
      addDatum(
        wb,
        {
          semanticKey: 'general.notes.internal',
          moduleId: 'mod-m',
          label: 'Anotação Interna',
          value: { type: 'text', value: 'Uso experimental em bancada' },
          evidence: [], // NENHUMA FONTE
          status: 'verified'
        },
        'datum-unverified'
      )
    );

    const envelope = buildAiProductKnowledgeEnvelope({
      workbook: wb,
      sources: []
    });

    expect(envelope.summary.factsWithProvenance).toBe(0);
    expect(envelope.summary.factsWithoutProvenance).toBe(1);

    const fact = envelope.items[0];
    expect(fact.hasProvenance).toBe(false);
    expect(fact.evidenceReferences.length).toBe(0);
    expect(fact.sourceDocuments.length).toBe(0);
  });
});
