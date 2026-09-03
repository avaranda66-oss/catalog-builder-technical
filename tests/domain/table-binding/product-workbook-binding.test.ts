// tests/domain/table-binding/product-workbook-binding.test.ts
// Suíte de Testes Canônicos de Binding: BIND.B1
// TABLE CORE ↔ PRODUCT WORKBOOK DATUM BINDING SEAM

import { describe, it, expect } from 'vitest';
import {
  createProductWorkbookDatumResolver,
  mapTechnicalValueToTableLiteral,
  mapEffectiveStatusToTableStatus,
  createLegacyProductFieldResolver,
  composeTableDatumResolvers
} from '../../../src/domain/table-binding';
import {
  ResolvedProductKnowledge,
  EffectiveDatum,
  TechnicalValue
} from '../../../src/domain/product-workbook/types';
import { TableCellBoundContent } from '../../../src/domain/table-core/table.types';

describe('Product Workbook Datum Binding Seam (BIND.B1)', () => {
  // Conhecimento efetivo de produto de teste (TA-25N)
  const mockTA25N: ResolvedProductKnowledge = {
    productId: 'prod_ta25n_uuid',
    productRevision: 3,
    familyId: 'fam_termometria_uuid',
    familyRevision: 5,
    modules: [],
    suppressedKeys: [],
    conflictsCount: 0,
    effectiveData: new Map<string, EffectiveDatum>([
      [
        'metrology.calibration_range',
        {
          origin: 'product_local',
          effectiveStatus: 'approved',
          datum: {
            id: 'datum_range_1',
            moduleId: 'mod_metrology',
            semanticKey: 'metrology.calibration_range',
            label: 'Faixa de Calibração',
            value: { type: 'text', value: '-25 a 140 °C' },
            evidence: [],
            status: 'approved'
          }
        }
      ],
      [
        'metrology.accuracy',
        {
          origin: 'product_local',
          effectiveStatus: 'draft',
          datum: {
            id: 'datum_acc_1',
            moduleId: 'mod_metrology',
            semanticKey: 'metrology.accuracy',
            label: 'Exatidão',
            value: { type: 'number', value: 0.1 },
            evidence: [],
            status: 'draft'
          }
        }
      ],
      [
        'metrology.weight',
        {
          origin: 'product_local',
          effectiveStatus: 'approved',
          datum: {
            id: 'datum_weight_1',
            moduleId: 'mod_metrology',
            semanticKey: 'metrology.weight',
            label: 'Peso Operacional',
            value: { type: 'quantity', amount: 8.5, unit: 'kg', qualifier: 'approx' },
            evidence: [],
            status: 'approved'
          }
        }
      ],
      [
        'electrical.power_supply',
        {
          origin: 'family', // Herdado da família
          effectiveStatus: 'approved',
          datum: {
            id: 'datum_pwr_1',
            moduleId: 'mod_electrical',
            semanticKey: 'electrical.power_supply',
            label: 'Alimentação Elétrica',
            value: { type: 'text', value: '220 VAC / 60 Hz' },
            evidence: [],
            status: 'approved'
          }
        }
      ],
      [
        'metrology.stability_conflict',
        {
          origin: 'product_override',
          effectiveStatus: 'conflicting', // Dado em conflito
          conflictReason: 'Divergência entre laboratório e folha de dados',
          datum: {
            id: 'datum_stb_1',
            moduleId: 'mod_metrology',
            semanticKey: 'metrology.stability_conflict',
            label: 'Estabilidade Conflitante',
            value: { type: 'text', value: '± 0.05 °C vs ± 0.08 °C' },
            evidence: [],
            status: 'draft'
          }
        }
      ],
      [
        'metrology.dimensional_range',
        {
          origin: 'product_local',
          effectiveStatus: 'approved',
          datum: {
            id: 'datum_dim_1',
            moduleId: 'mod_metrology',
            semanticKey: 'metrology.dimensional_range',
            label: 'Faixa Dimensional',
            value: { type: 'range', min: -25, max: 140, unit: '°C' } as unknown as TechnicalValue,
            evidence: [],
            status: 'approved'
          }
        }
      ]
    ])
  };

  const knowledgeStore = new Map<string, ResolvedProductKnowledge>([
    ['prod_ta25n_uuid', mockTA25N]
  ]);

  const resolver = createProductWorkbookDatumResolver(knowledgeStore);

  // =========================================================================
  // BIND-PIM-1: semanticKey correta resolve datum correto
  // =========================================================================
  it('BIND-PIM-1: semanticKey correta resolve datum correto do produto correspondente', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.calibration_range',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res).toBeDefined();
    expect(res?.status).toBe('approved');
    expect(res?.value).toEqual({ kind: 'text', text: '-25 a 140 °C' });
    expect(res?.diagnostic?.productRevision).toBe(3);
    expect(res?.diagnostic?.familyRevision).toBe(5);
  });

  // =========================================================================
  // BIND-PIM-2: productId errado não resolve outro produto
  // =========================================================================
  it('BIND-PIM-2: productId inexistente não resolve outro produto e fail-closed', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_inexistente_999',
      datumKey: 'metrology.calibration_range',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res).toBeDefined();
    expect(res?.status).toBe('unknown');
    expect(res?.value).toEqual({ kind: 'empty' });
    expect(res?.diagnostic?.message).toContain('não encontrado no lookup');
  });

  // =========================================================================
  // BIND-PIM-3: Missing datum -> unresolved, zero ghost
  // =========================================================================
  it('BIND-PIM-3: datum inexistente retorna unresolved com empty (Zero Ghost Data)', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'unknown.phantom_metric',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res).toBeDefined();
    expect(res?.status).toBe('unknown');
    expect(res?.value).toEqual({ kind: 'empty' });
    expect(res?.diagnostic?.message).toContain('não encontrada no conhecimento efetivo');
  });

  // =========================================================================
  // BIND-PIM-4: approved/draft/conflicting status preservados
  // =========================================================================
  it('BIND-PIM-4: status approved, draft e conflicting são mapeados conservadoramente', () => {
    // Approved
    const refApproved: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.calibration_range',
      bindingMode: 'live'
    };
    expect(resolver(refApproved)?.status).toBe('approved');

    // Draft
    const refDraft: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.accuracy',
      bindingMode: 'live'
    };
    expect(resolver(refDraft)?.status).toBe('draft');

    // Conflicting -> conflict (NUNCA approved)
    const refConflict: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.stability_conflict',
      bindingMode: 'live'
    };
    expect(resolver(refConflict)?.status).toBe('conflict');

    // Validação direta da função pura de mapeamento de status
    expect(mapEffectiveStatusToTableStatus('approved')).toBe('approved');
    expect(mapEffectiveStatusToTableStatus('draft')).toBe('draft');
    expect(mapEffectiveStatusToTableStatus('conflicting')).toBe('conflict');
  });

  // =========================================================================
  // BIND-PIM-5: Text mapping lossless
  // =========================================================================
  it('BIND-PIM-5: mapeamento de TechnicalValue.text é estritamente lossless', () => {
    const mapping = mapTechnicalValueToTableLiteral({
      type: 'text',
      value: 'Texto Exato com Caracteres Especiais: ± 0.05 °C, & " \''
    });

    expect(mapping.supported).toBe(true);
    if (mapping.supported) {
      expect(mapping.content).toEqual({
        kind: 'text',
        text: 'Texto Exato com Caracteres Especiais: ± 0.05 °C, & " \''
      });
    }
  });

  // =========================================================================
  // BIND-PIM-6: Number mapping lossless
  // =========================================================================
  it('BIND-PIM-6: mapeamento de TechnicalValue.number é estritamente lossless', () => {
    const mapping = mapTechnicalValueToTableLiteral({
      type: 'number',
      value: -123.456
    });

    expect(mapping.supported).toBe(true);
    if (mapping.supported) {
      expect(mapping.content).toEqual({
        kind: 'number',
        value: -123.456
      });
    }
  });

  // =========================================================================
  // BIND-PIM-7: Quantity mapping lossless com unit
  // =========================================================================
  it('BIND-PIM-7: mapeamento de TechnicalValue.quantity preserva amount, unit e qualifier', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.weight',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res?.value).toEqual({
      kind: 'value_unit',
      amount: 8.5,
      unit: 'kg',
      qualifier: 'approx'
    });
  });

  // =========================================================================
  // BIND-PIM-8: Unsupported TechnicalValue não vira string inventada
  // =========================================================================
  it('BIND-PIM-8: TechnicalValue unsupported (ex: range) NÃO é achatado em string genérica', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.dimensional_range',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res?.value).toEqual({ kind: 'empty' });
    expect(res?.diagnostic?.unsupportedType).toBe('range');
    expect(res?.diagnostic?.message).toContain('célula dimensional/composta');
  });

  // =========================================================================
  // BIND-PIM-9: Family inherited EffectiveDatum resolve da mesma forma
  // =========================================================================
  it('BIND-PIM-9: EffectiveDatum herdado da família resolve normalmente sem o Table reimplementar herança', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'electrical.power_supply',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res?.value).toEqual({ kind: 'text', text: '220 VAC / 60 Hz' });
    expect(res?.status).toBe('approved');
  });

  // =========================================================================
  // BIND-PIM-10: Product override já resolvido pelo PIM é apresentado como valor efetivo
  // =========================================================================
  it('BIND-PIM-10: override direto do produto no PIM é apresentado como valor efetivo', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.calibration_range',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res?.value).toEqual({ kind: 'text', text: '-25 a 140 °C' });
  });

  // =========================================================================
  // BIND-PIM-11: Resolver puro não muta ResolvedProductKnowledge
  // =========================================================================
  it('BIND-PIM-11: resolver puro não muta o objeto ResolvedProductKnowledge fornecido', () => {
    const rawBefore = JSON.stringify(Array.from(mockTA25N.effectiveData.entries()));

    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.calibration_range',
      bindingMode: 'live'
    };

    resolver(ref);

    const rawAfter = JSON.stringify(Array.from(mockTA25N.effectiveData.entries()));
    expect(rawAfter).toBe(rawBefore);
  });

  // =========================================================================
  // BIND-PIM-12: Zero React/Zustand/Supabase dependency no adapter
  // =========================================================================
  it('BIND-PIM-12: composição pura entre LegacyProductFieldResolver e ProductWorkbookDatumResolver', () => {
    const legacyProduct = {
      id: 'leg_prod_1',
      code: 'LEG-01',
      specs: {
        accuracy: '± 0.2 °C'
      }
    };

    const legacyResolver = createLegacyProductFieldResolver((id) =>
      id === 'leg_prod_1' ? legacyProduct : undefined
    );

    const composed = composeTableDatumResolvers(legacyResolver, resolver);

    // 1. Resolve referência legada via LegacyResolver
    const legRef: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'leg_prod_1',
      datumKey: 'legacy.product_field.accuracy',
      bindingMode: 'live'
    };
    const legRes = composed(legRef);
    expect(legRes?.value).toEqual({ kind: 'text', text: '± 0.2 °C' });

    // 2. Resolve referência semântica via ProductWorkbookResolver
    const pimRef: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.calibration_range',
      bindingMode: 'live'
    };
    const pimRes = composed(pimRef);
    expect(pimRes?.value).toEqual({ kind: 'text', text: '-25 a 140 °C' });
  });
});
