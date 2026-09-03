// tests/domain/product-workbook/table-compatibility.test.ts
// Test suite covering Table Core compatibility, literal cell mapping, and datum_reference binding resolution.

import { describe, it, expect } from 'vitest';
import {
  mapTechnicalValueToTableLiteral,
  resolveDatumReferenceForTable,
  createWorkbook,
  addModule,
  addDatum,
  resolveEffectiveProductKnowledge
} from '../../../src/domain/product-workbook';

describe('PIM.W1 — Table Core Compatibility & Datum Reference Resolution', () => {
  // =========================================================================
  // MAPPING-1: Conversões diretas para literais tabulares suportados
  // =========================================================================
  it('MAPPING-1: mapeia primitivos técnicos para células tabulares equivalentes', () => {
    // 1. Text
    const textRes = mapTechnicalValueToTableLiteral({ type: 'text', value: 'Alumínio' });
    expect(textRes.supported).toBe(true);
    if (textRes.supported) {
      expect(textRes.content).toEqual({ kind: 'text', text: 'Alumínio' });
    }

    // 2. Number
    const numRes = mapTechnicalValueToTableLiteral({ type: 'number', value: 42.5 });
    expect(numRes.supported).toBe(true);
    if (numRes.supported) {
      expect(numRes.content).toEqual({ kind: 'number', value: 42.5 });
    }

    // 3. Quantity
    const qtyRes = mapTechnicalValueToTableLiteral({
      type: 'quantity',
      amount: 0.05,
      unit: '°C',
      qualifier: 'max'
    });
    expect(qtyRes.supported).toBe(true);
    if (qtyRes.supported) {
      expect(qtyRes.content).toEqual({
        kind: 'value_unit',
        amount: 0.05,
        unit: '°C',
        qualifier: 'max'
      });
    }

    // 4. Boolean
    const boolRes = mapTechnicalValueToTableLiteral({ type: 'boolean', value: true });
    expect(boolRes.supported).toBe(true);
    if (boolRes.supported) {
      expect(boolRes.content).toEqual({ kind: 'badge', text: 'Sim', variant: 'success' });
    }

    // 5. Technical Token
    const tokRes = mapTechnicalValueToTableLiteral({ type: 'technical_token', token: 'HART' });
    expect(tokRes.supported).toBe(true);
    if (tokRes.supported) {
      expect(tokRes.content).toEqual({ kind: 'badge', text: 'HART', variant: 'neutral' });
    }

    // 6. Asset Reference
    const astRes = mapTechnicalValueToTableLiteral({ type: 'asset_reference', assetId: 'ast-123' });
    expect(astRes.supported).toBe(true);
    if (astRes.supported) {
      expect(astRes.content).toEqual({ kind: 'asset_reference', assetId: 'ast-123' });
    }

    // 7. Unknown
    const unkRes = mapTechnicalValueToTableLiteral({ type: 'unknown' });
    expect(unkRes.supported).toBe(true);
    if (unkRes.supported) {
      expect(unkRes.content).toEqual({ kind: 'empty' });
    }
  });

  // =========================================================================
  // MAPPING-RANGE-FAIL-CLOSED: Range não vira string silenciosa
  // =========================================================================
  it('MAPPING-RANGE-FAIL-CLOSED: valores range falham fechado e não convertem para string arbitrariamente', () => {
    const rangeRes = mapTechnicalValueToTableLiteral({
      type: 'range',
      lower: -25,
      upper: 140,
      unit: '°C'
    });

    expect(rangeRes.supported).toBe(false);
    if (!rangeRes.supported) {
      expect(rangeRes.reason).toContain('célula dimensional/composta estendida');
    }
  });

  // =========================================================================
  // DATUM-REFERENCE-RESOLVE: Resolução de vínculo live
  // =========================================================================
  it('DATUM-REFERENCE-RESOLVE-1: resolve datum_reference live com conhecimento aprovado', () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-ta25' } });
    wb = addModule(wb, { id: 'm1', semanticKey: 'metrology.specs', label: 'Metrologia', kind: 'key_value', order: 1 });
    wb = addDatum(wb, {
      semanticKey: 'metrology.accuracy.limit',
      moduleId: 'm1',
      label: 'Exatidão',
      value: { type: 'quantity', amount: 0.05, unit: '°C' },
      evidence: [],
      status: 'approved'
    });

    const knowledge = resolveEffectiveProductKnowledge({ productWorkbook: wb });

    const resolution = resolveDatumReferenceForTable({
      datumKey: 'metrology.accuracy.limit',
      bindingMode: 'live',
      effectiveKnowledge: knowledge
    });

    expect(resolution.resolved).toBe(true);
    if (resolution.resolved) {
      expect(resolution.isSnapshotApproved).toBe(true);
      expect(resolution.literalContent).toEqual({
        kind: 'value_unit',
        amount: 0.05,
        unit: '°C',
        qualifier: undefined
      });
    }
  });

  // =========================================================================
  // DATUM-REFERENCE-SNAPSHOT-UNAPPROVED: Falha fechada em snapshot de rascunho
  // =========================================================================
  it('DATUM-REFERENCE-SNAPSHOT-UNAPPROVED: modo snapshot rejeita congelamento de fatos em rascunho', () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-ta25' } });
    wb = addModule(wb, { id: 'm1', semanticKey: 'metrology.specs', label: 'Metrologia', kind: 'key_value', order: 1 });
    wb = addDatum(wb, {
      semanticKey: 'metrology.accuracy.draft_limit',
      moduleId: 'm1',
      label: 'Exatidão Preliminar',
      value: { type: 'quantity', amount: 0.02, unit: '°C' },
      evidence: [],
      status: 'draft' // RASCUNHO!
    });

    const knowledge = resolveEffectiveProductKnowledge({ productWorkbook: wb });

    const resolution = resolveDatumReferenceForTable({
      datumKey: 'metrology.accuracy.draft_limit',
      bindingMode: 'snapshot', // SNAPSHOT!
      effectiveKnowledge: knowledge
    });

    expect(resolution.resolved).toBe(false);
    if (!resolution.resolved) {
      expect(resolution.reason).toBe('unapproved_snapshot');
      expect(resolution.message).toContain('exige dado aprovado');
    }
  });
});
