// tests/domain/product-workbook/query-and-views.test.ts
// Test suite covering AI-safe knowledge snapshots, multi-product comparison, and saved views.

import { describe, it, expect } from 'vitest';
import {
  createWorkbook,
  addModule,
  addDatum,
  createSavedView,
  resolveEffectiveProductKnowledge,
  getProductKnowledgeSnapshot,
  compareResolvedProducts,
  evaluateSavedView
} from '../../../src/domain/product-workbook';

describe('PIM.W1 — AI-Safe Query Engine, Multi-Product Comparison & Saved Views', () => {
  // Helper que monta conhecimento de um produto para teste
  function setupProductWithVariedStatus() {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-sensor-x' } });
    wb = addModule(wb, {
      id: 'mod-1',
      semanticKey: 'sensor.specs',
      label: 'Sensores',
      kind: 'key_value',
      order: 1
    });

    // Fato 1: Aprovado
    wb = addDatum(
      wb,
      {
        semanticKey: 'sensor.accuracy.class',
        moduleId: 'mod-1',
        label: 'Classe de Exatidão',
        value: { type: 'text', value: 'Classe A' },
        evidence: [],
        status: 'approved'
      },
      'd-acc'
    );

    // Fato 2: Rascunho
    wb = addDatum(
      wb,
      {
        semanticKey: 'sensor.response.time',
        moduleId: 'mod-1',
        label: 'Tempo de Resposta',
        value: { type: 'quantity', amount: 250, unit: 'ms' },
        evidence: [],
        status: 'draft'
      },
      'd-resp'
    );

    // Fato 3: Com conflito de evidências não resolvido
    wb = addDatum(
      wb,
      {
        semanticKey: 'sensor.max.temperature',
        moduleId: 'mod-1',
        label: 'Temperatura Máxima de Superfície',
        value: { type: 'quantity', amount: 150, unit: '°C' },
        evidence: [
          {
            id: 'ev-1',
            sourceDocumentId: 'doc-en',
            observedValue: { type: 'quantity', amount: 150, unit: '°C' }
          },
          {
            id: 'ev-2',
            sourceDocumentId: 'doc-pt',
            observedValue: { type: 'quantity', amount: 120, unit: '°C' }
          }
        ],
        status: 'draft'
      },
      'd-max-temp'
    );

    // Fato 4: Desconhecido explícito
    wb = addDatum(
      wb,
      {
        semanticKey: 'sensor.subsea.depth_rating',
        moduleId: 'mod-1',
        label: 'Profundidade Subaquática',
        value: { type: 'unknown', reason: 'Não aplicável para sensores terrestres' },
        evidence: [],
        status: 'approved'
      },
      'd-depth'
    );

    return resolveEffectiveProductKnowledge({ productWorkbook: wb });
  }

  // =========================================================================
  // AI-APPROVED-ONLY-1: Apenas fatos aprovados são retornados por padrão
  // =========================================================================
  it('AI-APPROVED-ONLY-1: snapshot padrão para IA retorna exclusivamente fatos aprovados', () => {
    const knowledge = setupProductWithVariedStatus();
    const snapshot = getProductKnowledgeSnapshot({ effectiveKnowledge: knowledge });

    // Apenas 'sensor.accuracy.class' é aprovado e sem conflito
    expect(snapshot.facts.size).toBe(1);
    expect(snapshot.facts.has('sensor.accuracy.class')).toBe(true);

    // Rascunho ('sensor.response.time') não pode vazar como verdade
    expect(snapshot.facts.has('sensor.response.time')).toBe(false);
  });

  // =========================================================================
  // AI-CONFLICT-1: Conflitos não são silenciados e são isolados
  // =========================================================================
  it('AI-CONFLICT-1: fatos com discrepâncias de evidência são segregados em conflictingFacts', () => {
    const knowledge = setupProductWithVariedStatus();
    const snapshot = getProductKnowledgeSnapshot({ effectiveKnowledge: knowledge });

    expect(snapshot.conflictingFacts.length).toBe(1);
    const conflicting = snapshot.conflictingFacts[0];
    expect(conflicting.semanticKey).toBe('sensor.max.temperature');
    expect(conflicting.hasConflict).toBe(true);
    expect(conflicting.candidateValues?.length).toBe(2);

    // Não consta na lista de fatos aprovados
    expect(snapshot.facts.has('sensor.max.temperature')).toBe(false);
  });

  // =========================================================================
  // AI-UNKNOWN-1: Desconhecido explícito sem alucinação
  // =========================================================================
  it('AI-UNKNOWN-1: fatos de valor desconhecido são isolados em unknownFacts sem inventar valores', () => {
    const knowledge = setupProductWithVariedStatus();
    const snapshot = getProductKnowledgeSnapshot({ effectiveKnowledge: knowledge });

    expect(snapshot.unknownFacts.length).toBe(1);
    const unknownFact = snapshot.unknownFacts[0];
    expect(unknownFact.semanticKey).toBe('sensor.subsea.depth_rating');
    expect(unknownFact.effectiveValue.type).toBe('unknown');

    // Não aparece como valor consolidado
    expect(snapshot.facts.has('sensor.subsea.depth_rating')).toBe(false);
  });

  // =========================================================================
  // PRODUCT-COMPARE-1: Comparação de múltiplos produtos sem vazamento de dados
  // =========================================================================
  it('PRODUCT-COMPARE-1: compareResolvedProducts alinha produtos por chave e reporta ausência explícita', () => {
    let wbA = createWorkbook({ owner: { kind: 'product', id: 'prod-A' } });
    wbA = addModule(wbA, { id: 'm1', semanticKey: 'gen.specs', label: 'Geral', kind: 'key_value', order: 1 });
    wbA = addDatum(wbA, {
      semanticKey: 'general.voltage',
      moduleId: 'm1',
      label: 'Tensão',
      value: { type: 'text', value: '220V' },
      evidence: [],
      status: 'approved'
    });
    wbA = addDatum(wbA, {
      semanticKey: 'general.ip_rating',
      moduleId: 'm1',
      label: 'Grau de Proteção',
      value: { type: 'text', value: 'IP67' },
      evidence: [],
      status: 'approved'
    });

    let wbB = createWorkbook({ owner: { kind: 'product', id: 'prod-B' } });
    wbB = addModule(wbB, { id: 'm1', semanticKey: 'gen.specs', label: 'Geral', kind: 'key_value', order: 1 });
    // Produto B só tem tensão, NÃO tem ip_rating
    wbB = addDatum(wbB, {
      semanticKey: 'general.voltage',
      moduleId: 'm1',
      label: 'Tensão',
      value: { type: 'text', value: '110V' },
      evidence: [],
      status: 'approved'
    });

    const knowA = resolveEffectiveProductKnowledge({ productWorkbook: wbA });
    const knowB = resolveEffectiveProductKnowledge({ productWorkbook: wbB });

    const matrix = compareResolvedProducts([
      { productId: 'prod-A', knowledge: knowA },
      { productId: 'prod-B', knowledge: knowB }
    ]);

    expect(matrix.productIds).toEqual(['prod-A', 'prod-B']);
    expect(matrix.rows.length).toBe(2);

    const voltageRow = matrix.rows.find((r) => r.semanticKey === 'general.voltage');
    expect(voltageRow?.valuesByProductId['prod-A']).toEqual({ type: 'text', value: '220V' });
    expect(voltageRow?.valuesByProductId['prod-B']).toEqual({ type: 'text', value: '110V' });

    const ipRow = matrix.rows.find((r) => r.semanticKey === 'general.ip_rating');
    expect(ipRow?.valuesByProductId['prod-A']).toEqual({ type: 'text', value: 'IP67' });
    expect(ipRow?.valuesByProductId['prod-B']).toBeNull(); // Ausente no produto B!
    expect(ipRow?.statusByProductId['prod-B']).toBe('missing');
  });

  // =========================================================================
  // SAVED-VIEW & VIEW-NO-DATA-MUTATION: Visões salvas não alteram fatos
  // =========================================================================
  it('SAVED-VIEW-1: avalia visão salva respeitando filtros e ordenação sem mutar dados', () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-1' } });
    wb = addModule(wb, { id: 'm1', semanticKey: 'spec.main', label: 'Specs', kind: 'key_value', order: 1 });

    wb = addDatum(wb, {
      semanticKey: 'spec.first',
      moduleId: 'm1',
      label: 'Primeiro Dado',
      value: { type: 'number', value: 10 },
      evidence: [],
      status: 'approved'
    }, 'd1');

    wb = addDatum(wb, {
      semanticKey: 'spec.second',
      moduleId: 'm1',
      label: 'Segundo Dado',
      value: { type: 'number', value: 20 },
      evidence: [],
      status: 'approved'
    }, 'd2');

    // Cria uma visão que inverte a ordem: second depois first
    wb = createSavedView(wb, {
      id: 'view-summary',
      name: 'Resumo Invertido',
      datumKeys: ['spec.first', 'spec.second'],
      ordering: ['spec.second', 'spec.first']
    });

    const knowledge = resolveEffectiveProductKnowledge({ productWorkbook: wb });
    const evaluated = evaluateSavedView(wb.savedViews![0], knowledge);

    expect(evaluated.rows.length).toBe(2);
    expect(evaluated.rows[0].semanticKey).toBe('spec.second');
    expect(evaluated.rows[1].semanticKey).toBe('spec.first');

    // Invariante de imutabilidade dos dados
    expect(wb.data['d1'].value).toEqual({ type: 'number', value: 10 });
    expect(wb.data['d2'].value).toEqual({ type: 'number', value: 20 });
  });
});
