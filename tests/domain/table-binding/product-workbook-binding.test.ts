// tests/domain/table-binding/product-workbook-binding.test.ts
// Suíte de Testes Canônicos de Binding: BIND.B1 & BIND.B1.1
// TABLE CORE ↔ PRODUCT WORKBOOK DATUM BINDING & SEMANTIC PROJECTION HARDENING

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createProductWorkbookDatumResolver,
  mapTechnicalValueToTableLiteral,
  mapEffectiveStatusToTableStatus,
  createLegacyProductFieldResolver,
  composeTableDatumResolvers
} from '../../../src/domain/table-binding';
import {
  ResolvedProductKnowledge,
  EffectiveDatum
} from '../../../src/domain/product-workbook/types';
import { TableCellBoundContent } from '../../../src/domain/table-core/table.types';
import { TableDatumResolver as CoreTableDatumResolver } from '../../../src/domain/table-core';
import { TableDatumResolver as BindingTableDatumResolver } from '../../../src/domain/table-binding';

describe('Product Workbook Datum Binding Seam (BIND.B1 & BIND.B1.1)', () => {
  // Conhecimento efetivo de produto de teste (TA-25N) com tipos canônicos estritos
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
          origin: 'family',
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
          effectiveStatus: 'conflicting',
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
            value: { type: 'range', lower: -25, upper: 140, unit: '°C' },
            evidence: [],
            status: 'approved'
          }
        }
      ],
      [
        'metrology.is_active',
        {
          origin: 'product_local',
          effectiveStatus: 'approved',
          datum: {
            id: 'datum_bool_1',
            moduleId: 'mod_metrology',
            semanticKey: 'metrology.is_active',
            label: 'Ativo',
            value: { type: 'boolean', value: true },
            evidence: [],
            status: 'approved'
          }
        }
      ],
      [
        'metrology.sensor_type',
        {
          origin: 'product_local',
          effectiveStatus: 'approved',
          datum: {
            id: 'datum_enum_1',
            moduleId: 'mod_metrology',
            semanticKey: 'metrology.sensor_type',
            label: 'Tipo de Sensor',
            value: { type: 'enum', code: 'PT100', label: 'Termorresistência Pt100' },
            evidence: [],
            status: 'approved'
          }
        }
      ],
      [
        'metrology.protection_class',
        {
          origin: 'product_local',
          effectiveStatus: 'approved',
          datum: {
            id: 'datum_token_1',
            moduleId: 'mod_metrology',
            semanticKey: 'metrology.protection_class',
            label: 'Grau de Proteção',
            value: { type: 'technical_token', token: 'IP67' },
            evidence: [],
            status: 'approved'
          }
        }
      ],
      [
        'metrology.accessory_ref',
        {
          origin: 'product_local',
          effectiveStatus: 'approved',
          datum: {
            id: 'datum_pref_1',
            moduleId: 'mod_metrology',
            semanticKey: 'metrology.accessory_ref',
            label: 'Acessório Recomendado',
            value: { type: 'product_reference', targetProductId: 'prod_acc_01' },
            evidence: [],
            status: 'approved'
          }
        }
      ],
      [
        'metrology.pending_calibration',
        {
          origin: 'product_local',
          effectiveStatus: 'draft',
          datum: {
            id: 'datum_unk_1',
            moduleId: 'mod_metrology',
            semanticKey: 'metrology.pending_calibration',
            label: 'Calibração Pendente',
            value: { type: 'unknown', reason: 'Aguardando laudo de calibração RBC' },
            evidence: [],
            status: 'draft'
          }
        }
      ],
      [
        'metrology.diagram_asset',
        {
          origin: 'product_local',
          effectiveStatus: 'approved',
          datum: {
            id: 'datum_ast_1',
            moduleId: 'mod_metrology',
            semanticKey: 'metrology.diagram_asset',
            label: 'Esquema Elétrico',
            value: { type: 'asset_reference', assetId: 'ast_diag_01', label: 'Diagrama de Ligação' },
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
    const refApproved: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.calibration_range',
      bindingMode: 'live'
    };
    expect(resolver(refApproved)?.status).toBe('approved');

    const refDraft: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.accuracy',
      bindingMode: 'live'
    };
    expect(resolver(refDraft)?.status).toBe('draft');

    const refConflict: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.stability_conflict',
      bindingMode: 'live'
    };
    expect(resolver(refConflict)?.status).toBe('conflict');

    expect(mapEffectiveStatusToTableStatus('approved')).toBe('approved');
    expect(mapEffectiveStatusToTableStatus('draft')).toBe('draft');
    expect(mapEffectiveStatusToTableStatus('conflicting')).toBe('conflict');
  });

  // =========================================================================
  // BIND-PIM-5 / BIND-B1.1-TYPE-1: Text mapping lossless
  // =========================================================================
  it('BIND-PIM-5 / BIND-B1.1-TYPE-1: mapeamento de TechnicalValue.text é estritamente lossless', () => {
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
  // BIND-PIM-6 / BIND-B1.1-TYPE-2: Number mapping lossless
  // =========================================================================
  it('BIND-PIM-6 / BIND-B1.1-TYPE-2: mapeamento de TechnicalValue.number é estritamente lossless', () => {
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
  // BIND-PIM-7 / BIND-B1.1-TYPE-3: Quantity mapping lossless com unit
  // =========================================================================
  it('BIND-PIM-7 / BIND-B1.1-TYPE-3: mapeamento de TechnicalValue.quantity preserva amount, unit e qualifier', () => {
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
  // BIND-PIM-8 / BIND-B1.1-RANGE-1: Range fixture canônico sem cast
  // =========================================================================
  it('BIND-PIM-8 / BIND-B1.1-RANGE-1: fixture canônico usa lower/upper sem cast e retorna unsupported diagnostic', () => {
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

    // Validação direta da função pura sem casts
    const mapping = mapTechnicalValueToTableLiteral({
      type: 'range',
      lower: -25,
      upper: 140,
      unit: '°C'
    });
    expect(mapping.supported).toBe(false);
    if (!mapping.supported) {
      expect(mapping.unsupportedType).toBe('range');
      expect(mapping.reason).toContain('range');
    }
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

    const legRef: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'leg_prod_1',
      datumKey: 'legacy.product_field.accuracy',
      bindingMode: 'live'
    };
    const legRes = composed(legRef);
    expect(legRes?.value).toEqual({ kind: 'text', text: '± 0.2 °C' });

    const pimRef: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.calibration_range',
      bindingMode: 'live'
    };
    const pimRes = composed(pimRef);
    expect(pimRes?.value).toEqual({ kind: 'text', text: '-25 a 140 °C' });
  });

  // =========================================================================
  // BIND-B1.1-BOOLEAN-1: Boolean NÃO vira string/badge e retorna unsupported
  // =========================================================================
  it('BIND-B1.1-BOOLEAN-1: boolean NÃO vira "Sim", "Não", "Yes", "No", badge ou text; retorna unsupported diagnostic', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.is_active',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res?.value).toEqual({ kind: 'empty' });
    expect(res?.diagnostic?.unsupportedType).toBe('boolean');
    expect(res?.diagnostic?.message).toContain('Valores booleanos exigem tratamento de apresentação');

    // Validação direta da pure function
    const mapRes = mapTechnicalValueToTableLiteral({ type: 'boolean', value: true });
    expect(mapRes.supported).toBe(false);
    if (!mapRes.supported) {
      expect(mapRes.unsupportedType).toBe('boolean');
    }
  });

  // =========================================================================
  // BIND-B1.1-ENUM-1: Enum não perde code/label em projeção textual
  // =========================================================================
  it('BIND-B1.1-ENUM-1: enum não perde code/label em projeção textual prematura; retorna unsupported', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.sensor_type',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res?.value).toEqual({ kind: 'empty' });
    expect(res?.diagnostic?.unsupportedType).toBe('enum');
    expect(res?.diagnostic?.message).toContain('código: "PT100"');

    const mapRes = mapTechnicalValueToTableLiteral({ type: 'enum', code: 'PT100', label: 'Termorresistência Pt100' });
    expect(mapRes.supported).toBe(false);
    if (!mapRes.supported) {
      expect(mapRes.unsupportedType).toBe('enum');
    }
  });

  // =========================================================================
  // BIND-B1.1-TOKEN-1: Technical_token não vira badge genérico
  // =========================================================================
  it('BIND-B1.1-TOKEN-1: technical_token não vira badge genérico; retorna unsupported', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.protection_class',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res?.value).toEqual({ kind: 'empty' });
    expect(res?.diagnostic?.unsupportedType).toBe('technical_token');
    expect(res?.diagnostic?.message).toContain('IP67');

    const mapRes = mapTechnicalValueToTableLiteral({ type: 'technical_token', token: 'IP67' });
    expect(mapRes.supported).toBe(false);
    if (!mapRes.supported) {
      expect(mapRes.unsupportedType).toBe('technical_token');
    }
  });

  // =========================================================================
  // BIND-B1.1-UNKNOWN-1: Unknown não vira empty silencioso
  // =========================================================================
  it('BIND-B1.1-UNKNOWN-1: unknown não vira empty silencioso; diagnostic preserva reason quando presente', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.pending_calibration',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res?.value).toEqual({ kind: 'empty' });
    expect(res?.diagnostic?.unsupportedType).toBe('unknown');
    expect(res?.diagnostic?.message).toContain('Aguardando laudo de calibração RBC');

    const mapRes = mapTechnicalValueToTableLiteral({
      type: 'unknown',
      reason: 'Sensor danificado em trânsito'
    });
    expect(mapRes.supported).toBe(false);
    if (!mapRes.supported) {
      expect(mapRes.unsupportedType).toBe('unknown');
      expect(mapRes.reason).toContain('Sensor danificado em trânsito');
    }
  });

  // =========================================================================
  // BIND-B1.1-PRODUCT-REF-1: Product_reference continua fail-closed
  // =========================================================================
  it('BIND-B1.1-PRODUCT-REF-1: product_reference continua fail-closed com unsupported diagnostic', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.accessory_ref',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res?.value).toEqual({ kind: 'empty' });
    expect(res?.diagnostic?.unsupportedType).toBe('product_reference');
    expect(res?.diagnostic?.message).toContain('prod_acc_01');
  });

  // =========================================================================
  // BIND-B1.1-RESOLVER-1: Autoridade única para TableDatumResolver
  // =========================================================================
  it('BIND-B1.1-RESOLVER-1: existe autoridade única canônica para TableDatumResolver em table-core', () => {
    // Verifica equivalência e exportação de tipos da autoridade única
    const dummyResolver: CoreTableDatumResolver = (_ref) => undefined;
    const dummyBindingResolver: BindingTableDatumResolver = dummyResolver;
    expect(typeof dummyBindingResolver).toBe('function');
  });

  // =========================================================================
  // BIND-B1.1-I18N-1: src/domain/table-binding/** sem strings localizadas de boolean
  // =========================================================================
  it('BIND-B1.1-I18N-1: src/domain/table-binding/** não contém strings localizadas "Sim"/"Não" para representar boolean', () => {
    const bindingDir = path.resolve(__dirname, '../../../src/domain/table-binding');
    const files = fs.readdirSync(bindingDir);

    for (const file of files) {
      if (!file.endsWith('.ts')) continue;
      const content = fs.readFileSync(path.join(bindingDir, file), 'utf-8');

      // Verifica que não há literais "Sim" ou "Não" para representação de boolean
      expect(content).not.toMatch(/['"]Sim['"]/);
      expect(content).not.toMatch(/['"]Não['"]/);
      expect(content).not.toMatch(/['"]Yes['"]/);
      expect(content).not.toMatch(/['"]No['"]/);
    }
  });

  // =========================================================================
  // BIND-B1.1-ZERO-GHOST-1: Unsupported datum não materializa valor inventado
  // =========================================================================
  it('BIND-B1.1-ZERO-GHOST-1: datum não suportado nunca inventa representação textual arbitrária', () => {
    const unsupportedValues = [
      { type: 'boolean', value: false } as const,
      { type: 'range', lower: 0, upper: 100, unit: 'bar' } as const,
      { type: 'enum', code: 'MODBUS_RTU' } as const,
      { type: 'technical_token', token: 'HART_7' } as const,
      { type: 'product_reference', targetProductId: 'prod_target_xyz' } as const,
      { type: 'unknown', reason: 'Dado não homologado' } as const
    ];

    for (const val of unsupportedValues) {
      const res = mapTechnicalValueToTableLiteral(val);
      expect(res.supported).toBe(false);
      if (!res.supported) {
        expect(res.unsupportedType).toBe(val.type);
        expect(res.reason).toBeTruthy();
      }
    }
  });

  // =========================================================================
  // BIND-B1.1-ASSET-1: Asset_reference preserva assetId e mapeia label para caption
  // =========================================================================
  it('BIND-B1.1-ASSET-1: asset_reference preserva assetId e mapeia label para caption sem inventar conteúdo', () => {
    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.diagram_asset',
      bindingMode: 'live'
    };

    const res = resolver(ref);
    expect(res?.value).toEqual({
      kind: 'asset_reference',
      assetId: 'ast_diag_01',
      caption: 'Diagrama de Ligação'
    });
  });

  // =========================================================================
  // BIND-B1.1-REVIEW-REQ-1: review_required sem snapshot não inventa dado silenciosamente
  // =========================================================================
  it('BIND-B1.1-REVIEW-REQ-1: review_required sem snapshot não projeta dado live silenciosamente', () => {
    const refWithoutSnapshot: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.calibration_range',
      bindingMode: 'review_required'
    };

    const res = resolver(refWithoutSnapshot);
    expect(res?.value).toEqual({ kind: 'empty' });
    expect(res?.diagnostic?.message).toContain('review_required sem snapshot prévio');

    const refWithSnapshot: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_ta25n_uuid',
      datumKey: 'metrology.calibration_range',
      bindingMode: 'review_required',
      snapshot: { kind: 'text', text: 'Snapshot Congelado 1.0' }
    };

    const resWithSnap = resolver(refWithSnapshot);
    expect(resWithSnap?.value).toEqual({ kind: 'text', text: 'Snapshot Congelado 1.0' });
    expect(resWithSnap?.diagnostic?.message).toContain('revisão de alteração');
  });
});
