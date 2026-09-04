// tests/domain/product-workspace/workspace-source-trace.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolveSourceTrace
} from '../../../src/domain/product-workspace/source-trace';
import {
  createWorkbook,
  ensureWorkbookV2,
  addModule,
  addDatum,
  SourceDocument
} from '../../../src/domain/product-workbook';

describe('Workspace Source Traceability (Human Citations)', () => {
  it('converte evidência técnica em citação humana sem expor UUIDs por padrão', () => {
    let wb = ensureWorkbookV2(
      createWorkbook({
        id: 'wb-trace-test',
        owner: { kind: 'product', id: 'TA-25N' },
        revision: 1
      })
    );

    wb = ensureWorkbookV2(
      addModule(wb, {
        id: 'mod-1',
        semanticKey: 'metrology.accuracy',
        label: 'Exatidão',
        kind: 'key_value',
        order: 0
      })
    );

    const doc: SourceDocument = {
      id: 'doc-ta-manual-pt',
      title: 'Manual de Instruções Calibrador TA',
      documentType: 'manual',
      revision: 'EM0291-04'
    };

    wb = ensureWorkbookV2(
      addDatum(
        wb,
        {
          semanticKey: 'metrology.temperature.accuracy',
          moduleId: 'mod-1',
          label: 'Exatidão',
          value: { type: 'quantity', amount: 0.1, unit: '°C' },
          evidence: [
            {
              id: 'ev-acc-pt',
              sourceDocumentId: 'doc-ta-manual-pt',
              page: 6,
              section: 'Especificações',
              observedValue: { type: 'quantity', amount: 0.1, unit: '°C' },
              excerpt: 'Exatidão com sensor interno: ± 0,1 °C'
            }
          ],
          status: 'verified'
        },
        'datum-acc-1'
      )
    );

    const trace = resolveSourceTrace({
      datumId: 'datum-acc-1',
      workbook: wb,
      sources: [doc]
    });

    expect(trace.displayLabel).toBe('Exatidão');
    expect(trace.currentValueFormatted).toBe('0.1 °C');
    expect(trace.hasEvidence).toBe(true);
    expect(trace.items.length).toBe(1);

    const item = trace.items[0];
    expect(item.sourceTitle).toBe('Manual de Instruções Calibrador TA');
    expect(item.revision).toBe('EM0291-04');
    expect(item.page).toBe(6);
    expect(item.observedValueText).toBe('0.1 °C');
    expect(item.isConsensus).toBe(true);
  });

  it('exibe decisão canônica de engenharia quando há conflito de fontes', () => {
    let wb = ensureWorkbookV2(
      createWorkbook({
        id: 'wb-conflict-trace',
        owner: { kind: 'product', id: 'TA-25N' },
        revision: 1
      })
    );

    wb = ensureWorkbookV2(
      addModule(wb, {
        id: 'mod-c',
        semanticKey: 'conflict.specs',
        label: 'Conflito',
        kind: 'key_value',
        order: 0
      })
    );

    wb = ensureWorkbookV2(
      addDatum(
        wb,
        {
          semanticKey: 'metrology.temp.resolution',
          moduleId: 'mod-c',
          label: 'Resolução',
          value: { type: 'quantity', amount: 0.01, unit: '°C' },
          evidence: [
            {
              id: 'ev-pt',
              sourceDocumentId: 'doc-pt',
              page: 6,
              observedValue: { type: 'quantity', amount: 0.01, unit: '°C' }
            },
            {
              id: 'ev-en',
              sourceDocumentId: 'doc-en',
              page: 6,
              observedValue: { type: 'quantity', amount: 0.1, unit: '°C' }
            }
          ],
          canonicalDecision: {
            kind: 'selected_evidence',
            selectedEvidenceId: 'ev-pt',
            rationale: 'Manual em português reflete firmware mais recente v3.2.',
            decidedAt: '2026-09-04T05:00:00Z',
            decidedBy: 'Engenharia de Produto'
          },
          status: 'verified'
        },
        'datum-conflict'
      )
    );

    const trace = resolveSourceTrace({
      datumId: 'datum-conflict',
      workbook: wb,
      sources: []
    });

    expect(trace.canonicalDecisionRationale).toBe(
      'Manual em português reflete firmware mais recente v3.2.'
    );
  });
});
