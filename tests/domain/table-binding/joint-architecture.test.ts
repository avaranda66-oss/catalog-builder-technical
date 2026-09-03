// tests/domain/table-binding/joint-architecture.test.ts
// Testes de Integração Conjunta (JOINT.INT0)
// Verifica invariantes arquiteturais cross-layer entre Product Workbook e Table Core

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createProductWorkbookDatumResolver,
  createLegacyProductFieldResolver,
  composeTableDatumResolvers,
  mapTechnicalValueToTableLiteral
} from '../../../src/domain/table-binding';
import {
  ResolvedProductKnowledge,
  EffectiveDatum
} from '../../../src/domain/product-workbook/types';
import { TableCellBoundContent } from '../../../src/domain/table-core/table.types';

describe('JOINT.INT0 — Cross-Layer Architecture & Preflight Integration', () => {
  // =========================================================================
  // JOINT-ARCH-1: table-binding não importa persistence services
  // =========================================================================
  it('JOINT-ARCH-1: table-binding não importa persistence services nem Supabase', () => {
    const bindingDir = path.resolve(__dirname, '../../../src/domain/table-binding');
    const files = fs.readdirSync(bindingDir).filter((f) => f.endsWith('.ts'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(bindingDir, file), 'utf-8');
      expect(content).not.toMatch(/from\s+['"].*\/services/);
      expect(content).not.toMatch(/from\s+['"].*supabase/);
      expect(content).not.toMatch(/from\s+['"].*repository/);
      expect(content).not.toMatch(/from\s+['"]zustand/);
      expect(content).not.toMatch(/from\s+['"]react/);
    }
  });

  // =========================================================================
  // JOINT-ARCH-2: persistence services não importam table-core
  // =========================================================================
  it('JOINT-ARCH-2: persistence services do Product Workbook não importam table-core nem UI', () => {
    const servicesDir = path.resolve(__dirname, '../../../src/services/product-workbook');
    const files = fs.readdirSync(servicesDir).filter((f) => f.endsWith('.ts'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(servicesDir, file), 'utf-8');
      expect(content).not.toMatch(/from\s+['"].*table-core/);
      expect(content).not.toMatch(/from\s+['"].*table-binding/);
      expect(content).not.toMatch(/from\s+['"].*components/);
    }
  });

  // =========================================================================
  // JOINT-ARCH-3: ProductWorkbook revision permanece unchanged durante resolução/binding
  // =========================================================================
  it('JOINT-ARCH-3: ProductWorkbook revision permanece estritamente inalterada durante resolução de binding', () => {
    const initialKnowledge: ResolvedProductKnowledge = {
      productId: 'prod_joint_audit',
      productRevision: 42,
      familyId: 'fam_joint_audit',
      familyRevision: 17,
      modules: [],
      suppressedKeys: [],
      conflictsCount: 0,
      effectiveData: new Map<string, EffectiveDatum>([
        [
          'metrology.test_key',
          {
            origin: 'product_local',
            effectiveStatus: 'approved',
            datum: {
              id: 'datum_t1',
              moduleId: 'mod_1',
              semanticKey: 'metrology.test_key',
              label: 'Chave de Teste',
              value: { type: 'text', value: 'Valor Imutável' },
              evidence: [],
              status: 'approved'
            }
          }
        ]
      ])
    };

    const resolver = createProductWorkbookDatumResolver(
      new Map([['prod_joint_audit', initialKnowledge]])
    );

    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_joint_audit',
      datumKey: 'metrology.test_key',
      bindingMode: 'live'
    };

    const res = resolver(ref);

    // O resolver projeta o valor corretamente
    expect(res?.value).toEqual({ kind: 'text', text: 'Valor Imutável' });
    // E propaga a revisão sem modificá-la
    expect(res?.diagnostic?.productRevision).toBe(42);
    expect(res?.diagnostic?.familyRevision).toBe(17);

    // O knowledge subjacente mantém a revisão idêntica
    expect(initialKnowledge.productRevision).toBe(42);
    expect(initialKnowledge.familyRevision).toBe(17);
  });

  // =========================================================================
  // JOINT-ARCH-4: ProductWorkbook datum resolver continua puro após união das branches
  // =========================================================================
  it('JOINT-ARCH-4: ProductWorkbook datum resolver é determinístico e livre de efeitos colaterais', () => {
    const knowledge: ResolvedProductKnowledge = {
      productId: 'prod_pure_test',
      productRevision: 1,
      familyId: 'fam_pure_test',
      familyRevision: 1,
      modules: [],
      suppressedKeys: [],
      conflictsCount: 0,
      effectiveData: new Map<string, EffectiveDatum>([
        [
          'metrology.nominal_power',
          {
            origin: 'product_local',
            effectiveStatus: 'approved',
            datum: {
              id: 'datum_p1',
              moduleId: 'mod_1',
              semanticKey: 'metrology.nominal_power',
              label: 'Potência Nominal',
              value: { type: 'quantity', amount: 1500, unit: 'W', qualifier: 'nominal' },
              evidence: [],
              status: 'approved'
            }
          }
        ]
      ])
    };

    const resolver = createProductWorkbookDatumResolver(
      new Map([['prod_pure_test', knowledge]])
    );

    const ref: TableCellBoundContent = {
      kind: 'datum_reference',
      productId: 'prod_pure_test',
      datumKey: 'metrology.nominal_power',
      bindingMode: 'live'
    };

    // Múltiplas invocações retornam resultados idênticos
    const res1 = resolver(ref);
    const res2 = resolver(ref);

    expect(res1).toEqual(res2);
    expect(res1?.value).toEqual({
      kind: 'value_unit',
      amount: 1500,
      unit: 'W',
      qualifier: 'nominal'
    });
  });

  // =========================================================================
  // JOINT-ARCH-5: legacy datum resolver e ProductWorkbook resolver continuam componíveis
  // =========================================================================
  it('JOINT-ARCH-5: legacy datum resolver e ProductWorkbook resolver continuam perfeitamente componíveis via chain', () => {
    const legacyProduct = {
      id: 'prod_legacy_1',
      code: 'LEG-100',
      specs: {
        accuracy: '± 0.05 %'
      }
    };

    const pimKnowledge: ResolvedProductKnowledge = {
      productId: 'prod_pim_1',
      productRevision: 2,
      familyId: 'fam_1',
      familyRevision: 1,
      modules: [],
      suppressedKeys: [],
      conflictsCount: 0,
      effectiveData: new Map<string, EffectiveDatum>([
        [
          'specs.accuracy',
          {
            origin: 'product_local',
            effectiveStatus: 'approved',
            datum: {
              id: 'datum_pim_acc',
              moduleId: 'mod_specs',
              semanticKey: 'specs.accuracy',
              label: 'Exatidão',
              value: { type: 'text', value: '± 0.02 % (PIM Calibrado)' },
              evidence: [],
              status: 'approved'
            }
          }
        ]
      ])
    };

    const legacyResolver = createLegacyProductFieldResolver((id) =>
      id === 'prod_legacy_1' ? legacyProduct : undefined
    );
    const pimResolver = createProductWorkbookDatumResolver(
      new Map([['prod_pim_1', pimKnowledge]])
    );

    const composedResolver = composeTableDatumResolvers(legacyResolver, pimResolver);

    // 1. Resolve referência sob namespace legacy.*
    const legRes = composedResolver({
      kind: 'datum_reference',
      productId: 'prod_legacy_1',
      datumKey: 'legacy.product_field.accuracy',
      bindingMode: 'live'
    });
    expect(legRes?.value).toEqual({ kind: 'text', text: '± 0.05 %' });

    // 2. Resolve referência semântica do PIM
    const pimRes = composedResolver({
      kind: 'datum_reference',
      productId: 'prod_pim_1',
      datumKey: 'specs.accuracy',
      bindingMode: 'live'
    });
    expect(pimRes?.value).toEqual({ kind: 'text', text: '± 0.02 % (PIM Calibrado)' });
  });

  // =========================================================================
  // JOINT-ARCH-6: unsupported PIM datum não vira ghost data
  // =========================================================================
  it('JOINT-ARCH-6: unsupported PIM datum não vira ghost data nem inventa representação textual', () => {
    const knowledgeWithUnsupported: ResolvedProductKnowledge = {
      productId: 'prod_unsupported_test',
      productRevision: 1,
      familyId: 'fam_1',
      familyRevision: 1,
      modules: [],
      suppressedKeys: [],
      conflictsCount: 0,
      effectiveData: new Map<string, EffectiveDatum>([
        [
          'dim.range',
          {
            origin: 'product_local',
            effectiveStatus: 'approved',
            datum: {
              id: 'datum_rng',
              moduleId: 'mod_dim',
              semanticKey: 'dim.range',
              label: 'Faixa',
              value: { type: 'range', lower: -50, upper: 200, unit: '°C' },
              evidence: [],
              status: 'approved'
            }
          }
        ],
        [
          'state.active',
          {
            origin: 'product_local',
            effectiveStatus: 'approved',
            datum: {
              id: 'datum_act',
              moduleId: 'mod_state',
              semanticKey: 'state.active',
              label: 'Ativo',
              value: { type: 'boolean', value: false },
              evidence: [],
              status: 'approved'
            }
          }
        ]
      ])
    };

    const resolver = createProductWorkbookDatumResolver(
      new Map([['prod_unsupported_test', knowledgeWithUnsupported]])
    );

    // Range: não é achatado em string inventada
    const resRange = resolver({
      kind: 'datum_reference',
      productId: 'prod_unsupported_test',
      datumKey: 'dim.range',
      bindingMode: 'live'
    });
    expect(resRange?.value).toEqual({ kind: 'empty' });
    expect(resRange?.diagnostic?.unsupportedType).toBe('range');

    // Boolean: não vira "Sim"/"Não" nem badge arbitrário
    const resBool = resolver({
      kind: 'datum_reference',
      productId: 'prod_unsupported_test',
      datumKey: 'state.active',
      bindingMode: 'live'
    });
    expect(resBool?.value).toEqual({ kind: 'empty' });
    expect(resBool?.diagnostic?.unsupportedType).toBe('boolean');

    // Verificação estrita da função de mapeamento puro
    expect(mapTechnicalValueToTableLiteral({ type: 'range', lower: 0, upper: 10, unit: 'bar' }).supported).toBe(false);
    expect(mapTechnicalValueToTableLiteral({ type: 'boolean', value: true }).supported).toBe(false);
  });
});
