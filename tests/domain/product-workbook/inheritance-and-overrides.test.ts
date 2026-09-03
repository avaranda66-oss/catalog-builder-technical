// tests/domain/product-workbook/inheritance-and-overrides.test.ts
// Test suite covering family inheritance, product overrides, suppression, and publishing policies.

import { describe, it, expect } from 'vitest';
import {
  createWorkbook,
  addModule,
  addDatum,
  createOverride,
  suppressInheritedDatum,
  removeOverride,
  resolveEffectiveProductKnowledge
} from '../../../src/domain/product-workbook';

describe('PIM.W1 — Knowledge Inheritance, Overrides & Suppression', () => {
  // Setup helper: Família de Calibradores de Temperatura
  function setupFamilyWorkbook() {
    let fam = createWorkbook({
      id: 'wbk-fam-temp-cal',
      owner: { kind: 'family', id: 'fam-temp-uuid' }
    });

    fam = addModule(fam, {
      id: 'mod-metrology',
      semanticKey: 'metrology.specs',
      label: 'Metrologia Geral',
      kind: 'key_value',
      order: 1
    });

    fam = addModule(fam, {
      id: 'mod-hardware',
      semanticKey: 'hardware.specs',
      label: 'Especificações Mecânicas',
      kind: 'key_value',
      order: 2
    });

    // Datum 1: Faixa Base da Família
    fam = addDatum(
      fam,
      {
        semanticKey: 'metrology.temperature.range',
        moduleId: 'mod-metrology',
        label: 'Faixa de Operação Padrão',
        value: { type: 'range', lower: 0, upper: 100, unit: '°C' },
        evidence: [],
        status: 'approved'
      },
      'fam-d-range'
    );

    // Datum 2: Exatidão da Família
    fam = addDatum(
      fam,
      {
        semanticKey: 'metrology.accuracy.limit',
        moduleId: 'mod-metrology',
        label: 'Exatidão da Família',
        value: { type: 'quantity', amount: 0.1, unit: '°C' },
        evidence: [],
        status: 'approved'
      },
      'fam-d-accuracy'
    );

    // Datum 3: Tensão de Alimentação da Família
    fam = addDatum(
      fam,
      {
        semanticKey: 'hardware.power.supply',
        moduleId: 'mod-hardware',
        label: 'Alimentação Elétrica',
        value: { type: 'text', value: '110 / 220 Vac' },
        evidence: [],
        status: 'approved'
      },
      'fam-d-power'
    );

    return fam;
  }

  // =========================================================================
  // FAMILY-INHERIT-1: Herança limpa direta da família
  // =========================================================================
  it('FAMILY-INHERIT-1: produto herda todos os dados da família quando não possui overrides', () => {
    const familyWb = setupFamilyWorkbook();
    const prodWb = createWorkbook({
      id: 'wbk-prod-ta25',
      owner: { kind: 'product', id: 'prod-ta25-uuid' }
    });

    const resolved = resolveEffectiveProductKnowledge({
      familyWorkbook: familyWb,
      productWorkbook: prodWb
    });

    expect(resolved.productId).toBe('prod-ta25-uuid');
    expect(resolved.familyId).toBe('fam-temp-uuid');
    expect(resolved.effectiveData.size).toBe(3);

    const rangeDatum = resolved.effectiveData.get('metrology.temperature.range');
    expect(rangeDatum).toBeDefined();
    expect(rangeDatum?.origin).toBe('family');
    expect(rangeDatum?.familyDatumId).toBe('fam-d-range');
    expect(rangeDatum?.datum.value).toEqual({ type: 'range', lower: 0, upper: 100, unit: '°C' });
    expect(rangeDatum?.isPendingOverride).toBe(false);

    // ZERO physical cloning
    expect(Object.keys(prodWb.data).length).toBe(0);
  });

  // =========================================================================
  // PRODUCT-OVERRIDE-1: Sobrescrita de valor herdado no produto
  // =========================================================================
  it('PRODUCT-OVERRIDE-1: produto aplica override sobre dado específico da família', () => {
    const familyWb = setupFamilyWorkbook();
    let prodWb = createWorkbook({
      id: 'wbk-prod-ta25',
      owner: { kind: 'product', id: 'prod-ta25-uuid' }
    });

    // Override na faixa: de [0 a 100 °C] para [-25 a 140 °C]
    prodWb = createOverride(prodWb, {
      targetSemanticKey: 'metrology.temperature.range',
      mode: 'override',
      overriddenValue: { type: 'range', lower: -25, upper: 140, unit: '°C' },
      overriddenStatus: 'approved'
    });

    const resolved = resolveEffectiveProductKnowledge({
      familyWorkbook: familyWb,
      productWorkbook: prodWb
    });

    const rangeDatum = resolved.effectiveData.get('metrology.temperature.range');
    expect(rangeDatum?.origin).toBe('product_override');
    expect(rangeDatum?.overrideMode).toBe('override');
    expect(rangeDatum?.datum.value).toEqual({ type: 'range', lower: -25, upper: 140, unit: '°C' });

    // Os outros dados permanecem herdados da família
    const powerDatum = resolved.effectiveData.get('hardware.power.supply');
    expect(powerDatum?.origin).toBe('family');
  });

  // =========================================================================
  // SUPPRESS-1: Supressão de dado herdado que não se aplica ao produto
  // =========================================================================
  it('SUPPRESS-1: produto suprime dado herdado da família e não o expõe no conhecimento efetivo', () => {
    const familyWb = setupFamilyWorkbook();
    let prodWb = createWorkbook({
      id: 'wbk-prod-battery-powered',
      owner: { kind: 'product', id: 'prod-batt-uuid' }
    });

    // Este modelo é a bateria, então suprime a alimentação AC da família
    prodWb = suppressInheritedDatum(
      prodWb,
      'hardware.power.supply',
      'Variante portátil alimentada por bateria recarregável Li-Ion'
    );

    const resolved = resolveEffectiveProductKnowledge({
      familyWorkbook: familyWb,
      productWorkbook: prodWb
    });

    expect(resolved.effectiveData.has('hardware.power.supply')).toBe(false);
    expect(resolved.suppressedKeys).toContain('hardware.power.supply');
    expect(resolved.effectiveData.size).toBe(2);

    // Ao remover a supressão, a herança é restaurada
    prodWb = removeOverride(prodWb, 'hardware.power.supply');
    const restored = resolveEffectiveProductKnowledge({
      familyWorkbook: familyWb,
      productWorkbook: prodWb
    });
    expect(restored.effectiveData.has('hardware.power.supply')).toBe(true);
  });

  // =========================================================================
  // LOCAL-DATUM-1: Dado exclusivo do produto
  // =========================================================================
  it('LOCAL-DATUM-1: produto adiciona dado local exclusivo preservando módulos herdados', () => {
    const familyWb = setupFamilyWorkbook();
    let prodWb = createWorkbook({
      id: 'wbk-prod-ta25',
      owner: { kind: 'product', id: 'prod-ta25-uuid' }
    });

    // Usa módulo herdado 'mod-hardware' para adicionar dado local
    prodWb = addDatum(
      prodWb,
      {
        semanticKey: 'hardware.dimensions.well_depth',
        moduleId: 'mod-hardware',
        label: 'Profundidade do Bloco de Inserção',
        value: { type: 'quantity', amount: 150, unit: 'mm' },
        evidence: [],
        status: 'approved'
      },
      'prod-d-welldepth',
      familyWb
    );

    const resolved = resolveEffectiveProductKnowledge({
      familyWorkbook: familyWb,
      productWorkbook: prodWb
    });

    expect(resolved.effectiveData.size).toBe(4);
    const localDatum = resolved.effectiveData.get('hardware.dimensions.well_depth');
    expect(localDatum?.origin).toBe('product_local');
    expect(localDatum?.productDatumId).toBe('prod-d-welldepth');
    expect(localDatum?.datum.value).toEqual({ type: 'quantity', amount: 150, unit: 'mm' });
  });

  // =========================================================================
  // PUBLISHING-POLICY: Proteção contra substituição da verdade aprovada por rascunho
  // =========================================================================
  it('PUBLISHING-POLICY-1: rascunho de override não sobrescreve fato aprovado da família em políticas de publicação ou IA', () => {
    const familyWb = setupFamilyWorkbook(); // accuracy é approved (0.1 °C)
    let prodWb = createWorkbook({
      id: 'wbk-prod-ta25',
      owner: { kind: 'product', id: 'prod-ta25-uuid' }
    });

    // Usuário cria override em RASCUNHO (status: 'draft')
    prodWb = createOverride(prodWb, {
      targetSemanticKey: 'metrology.accuracy.limit',
      mode: 'override',
      overriddenValue: { type: 'quantity', amount: 0.05, unit: '°C' },
      overriddenStatus: 'draft'
    });

    // 1. Em modo de edição: o editor vê a alteração em rascunho
    const editingResolution = resolveEffectiveProductKnowledge({
      familyWorkbook: familyWb,
      productWorkbook: prodWb,
      policy: 'effective_for_editing'
    });
    expect(editingResolution.effectiveData.get('metrology.accuracy.limit')?.datum.value).toEqual({
      type: 'quantity',
      amount: 0.05,
      unit: '°C'
    });
    expect(editingResolution.effectiveData.get('metrology.accuracy.limit')?.origin).toBe('product_override');

    // 2. Em modo de publicação ou IA: a verdade aprovada da família é protegida e o rascunho fica pendente!
    const publishingResolution = resolveEffectiveProductKnowledge({
      familyWorkbook: familyWb,
      productWorkbook: prodWb,
      policy: 'effective_for_publishing'
    });
    const protectedDatum = publishingResolution.effectiveData.get('metrology.accuracy.limit');
    expect(protectedDatum?.origin).toBe('family');
    expect(protectedDatum?.datum.value).toEqual({ type: 'quantity', amount: 0.1, unit: '°C' });
    expect(protectedDatum?.isPendingOverride).toBe(true);

    const aiResolution = resolveEffectiveProductKnowledge({
      familyWorkbook: familyWb,
      productWorkbook: prodWb,
      policy: 'effective_for_ai'
    });
    expect(aiResolution.effectiveData.get('metrology.accuracy.limit')?.datum.value).toEqual({
      type: 'quantity',
      amount: 0.1,
      unit: '°C'
    });
    expect(aiResolution.effectiveData.get('metrology.accuracy.limit')?.isPendingOverride).toBe(true);
  });
});
