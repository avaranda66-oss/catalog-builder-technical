// tests/domain/product-workbook/referential-integrity.test.ts
// Test suite covering Phase PIM.W1.1 / Part L: Internal Integrity, Language, Date, and Unknown Contracts.

import { describe, it, expect } from 'vitest';
import {
  ProductWorkbook,
  createWorkbook,
  addModule,
  addDatum,
  createSavedView,
  validateProductWorkbook,
  areValuesEqual,
  isValidBcp47LanguageTag,
  isValidIsoDate,
  UnitCodeSchema
} from '../../../src/domain/product-workbook';

describe('PIM.W1.1 — Part L: Referential Integrity, Contracts & Unknown Semantics', () => {
  // Helper básico de workbook válido
  function setupValidWorkbook(): ProductWorkbook {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'p1' } });
    wb = addModule(wb, { id: 'm1', semanticKey: 'gen.specs', label: 'Geral', kind: 'key_value', order: 1 });
    wb = addDatum(
      wb,
      {
        semanticKey: 'gen.model.name',
        moduleId: 'm1',
        label: 'Modelo',
        value: { type: 'text', value: 'Alpha-100' },
        evidence: [],
        status: 'approved'
      },
      'd-model'
    );
    return wb;
  }

  // =========================================================================
  // DATA-KEY-ID: Chave do mapa data deve ser estritamente igual a datum.id
  // =========================================================================
  it('DATA-KEY-ID: rejeita mismatch entre a chave do mapa data e datum.id', () => {
    const wb = setupValidWorkbook();
    // Injeta propositalmente mismatch
    const corruptWb: ProductWorkbook = {
      ...wb,
      data: {
        'd-model-mismatch-key': {
          ...wb.data['d-model'],
          id: 'd-model' // ID é diferente da chave do mapa!
        }
      }
    };

    const res = validateProductWorkbook(corruptWb);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'DATA_KEY_ID_MISMATCH')).toBe(true);
  });

  // =========================================================================
  // DATUM-MODULE: datum.moduleId deve existir nos módulos locais ou família
  // =========================================================================
  it('DATUM-MODULE: rejeita datum cujo moduleId aponta para módulo inexistente', () => {
    const wb = setupValidWorkbook();
    const corruptWb: ProductWorkbook = {
      ...wb,
      data: {
        'd-model': {
          ...wb.data['d-model'],
          moduleId: 'mod_ghost' // Módulo não existe no workbook!
        }
      }
    };

    const res = validateProductWorkbook(corruptWb);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'DATUM_MODULE_NOT_FOUND')).toBe(true);
  });

  // =========================================================================
  // MODULE-DATUM-IDS: integridade bidirecional entre module.datumIds e data
  // =========================================================================
  it('MODULE-DATUM-IDS: rejeita id órfão em module.datumIds que não existe em data', () => {
    const wb = setupValidWorkbook();
    const corruptWb: ProductWorkbook = {
      ...wb,
      modules: [
        {
          ...wb.modules[0],
          datumIds: ['d-model', 'd-phantom-id'] // d-phantom-id não existe em data!
        }
      ]
    };

    const res = validateProductWorkbook(corruptWb);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'MODULE_DATUM_NOT_FOUND')).toBe(true);
  });

  // =========================================================================
  // DUPLICATE-MODULE-ID: IDs de módulo devem ser únicos
  // =========================================================================
  it('DUPLICATE-MODULE-ID: rejeita módulos com IDs duplicados', () => {
    const wb = setupValidWorkbook();
    const corruptWb: ProductWorkbook = {
      ...wb,
      modules: [
        wb.modules[0],
        {
          id: 'm1', // DUPLICADO!
          semanticKey: 'second.mod',
          label: 'Segundo',
          kind: 'key_value',
          order: 2,
          datumIds: []
        }
      ]
    };

    const res = validateProductWorkbook(corruptWb);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'DUPLICATE_MODULE_ID')).toBe(true);
  });

  // =========================================================================
  // DUPLICATE-MODULE-SEMANTIC: semanticKey de módulo deve ser única
  // =========================================================================
  it('DUPLICATE-MODULE-SEMANTIC: rejeita módulos com semanticKey idêntica', () => {
    const wb = setupValidWorkbook();
    const corruptWb: ProductWorkbook = {
      ...wb,
      modules: [
        wb.modules[0],
        {
          id: 'm2',
          semanticKey: 'gen.specs', // DUPLICADO!
          label: 'Geral Duplicado',
          kind: 'key_value',
          order: 2,
          datumIds: []
        }
      ]
    };

    const res = validateProductWorkbook(corruptWb);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'DUPLICATE_MODULE_SEMANTIC')).toBe(true);
  });

  // =========================================================================
  // DUPLICATE-DATUM-SEMANTIC: semanticKey de dado deve ser única por workbook
  // =========================================================================
  it('DUPLICATE-DATUM-SEMANTIC: rejeita dados distintos compartilhando a mesma semanticKey', () => {
    const wb = setupValidWorkbook();
    const corruptWb: ProductWorkbook = {
      ...wb,
      modules: [
        {
          ...wb.modules[0],
          datumIds: ['d-model', 'd-model-2']
        }
      ],
      data: {
        ...wb.data,
        'd-model-2': {
          ...wb.data['d-model'],
          id: 'd-model-2',
          semanticKey: 'gen.model.name' // DUPLICADO!
        }
      }
    };

    const res = validateProductWorkbook(corruptWb);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'DUPLICATE_DATUM_SEMANTIC')).toBe(true);
  });

  // =========================================================================
  // OVERRIDE-KEY: chave do registro de override deve ser igual a targetSemanticKey
  // =========================================================================
  it('OVERRIDE-KEY: rejeita override onde a chave do mapa difere de targetSemanticKey', () => {
    const wb = setupValidWorkbook();
    const corruptWb: ProductWorkbook = {
      ...wb,
      overrides: {
        'hardware.mismatch_key': {
          targetSemanticKey: 'hardware.power.supply', // DIFERENTE!
          mode: 'override',
          overriddenValue: { type: 'text', value: '24 Vdc' }
        }
      }
    };

    const res = validateProductWorkbook(corruptWb);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'OVERRIDE_KEY_MISMATCH')).toBe(true);
  });

  // =========================================================================
  // VIEW-DANGLING: visões salvas referenciando chaves inexistentes falham fechado
  // =========================================================================
  it('VIEW-DANGLING: createSavedView falha fechado ao referenciar chaves semânticas inexistentes', () => {
    const wb = setupValidWorkbook();

    expect(() => {
      createSavedView(wb, {
        id: 'v1',
        name: 'Visão Quebrada',
        datumKeys: ['gen.model.name', 'ghost.semantic.key'] // ghost não existe!
      });
    }).toThrowError(/DANGLING_VIEW_KEY/);
  });

  it('VIEW-DANGLING-VALIDATOR: validador reporta erro em visão salva contendo chaves inexistentes', () => {
    const wb = setupValidWorkbook();
    const wbWithCorruptView: ProductWorkbook = {
      ...wb,
      savedViews: [
        {
          id: 'view-corrupt',
          name: 'Visão Órfã',
          datumKeys: ['nonexistent.key.val']
        }
      ]
    };

    const res = validateProductWorkbook(wbWithCorruptView);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'VIEW_DANGLING_DATUM_KEY')).toBe(true);
  });

  // =========================================================================
  // BCP47: Validação de tags de idioma suportadas pela arquitetura
  // =========================================================================
  it('BCP47: valida códigos de idioma canônicos e rejeita sequências malformadas', () => {
    // Válidos
    expect(isValidBcp47LanguageTag('en')).toBe(true);
    expect(isValidBcp47LanguageTag('pt-BR')).toBe(true);
    expect(isValidBcp47LanguageTag('zh-Hans')).toBe(true);
    expect(isValidBcp47LanguageTag('sr-Cyrl')).toBe(true);
    expect(isValidBcp47LanguageTag('es-419')).toBe(true);
    expect(isValidBcp47LanguageTag('de-DE')).toBe(true);

    // Inválidos
    expect(isValidBcp47LanguageTag('pt--BR')).toBe(false);
    expect(isValidBcp47LanguageTag('123')).toBe(false);
    expect(isValidBcp47LanguageTag('<script>')).toBe(false);
    expect(isValidBcp47LanguageTag(' ')).toBe(false);
    expect(isValidBcp47LanguageTag('')).toBe(false);
  });

  // =========================================================================
  // ISO-DATE: Validação estrita de datas e carimbos de tempo ISO-8601
  // =========================================================================
  it('ISO-DATE: valida datas ISO-8601 completas e rejeita strings arbitrárias', () => {
    // Válidos
    expect(isValidIsoDate('2026-05-15')).toBe(true);
    expect(isValidIsoDate('2026-08-10T14:30:00Z')).toBe(true);
    expect(isValidIsoDate('2026-08-10T14:30:00.123Z')).toBe(true);
    expect(isValidIsoDate('2026-08-10T14:30:00+02:00')).toBe(true);

    // Inválidos
    expect(isValidIsoDate('ontem')).toBe(false);
    expect(isValidIsoDate('15/05/2026')).toBe(false);
    expect(isValidIsoDate('2026-99-99')).toBe(false); // Data inválida no calendário
    expect(isValidIsoDate('')).toBe(false);
  });

  // =========================================================================
  // UNIT CONTRACT: Validação de unidades técnicas e segurança contra injeções
  // =========================================================================
  it('UNIT-CONTRACT: valida unidades industriais reais e rejeita injeções e espaços perigosos', () => {
    // Válidos
    expect(UnitCodeSchema.safeParse('°C').success).toBe(true);
    expect(UnitCodeSchema.safeParse('kg/m²').success).toBe(true);
    expect(UnitCodeSchema.safeParse('µS/cm').success).toBe(true);
    expect(UnitCodeSchema.safeParse('bar').success).toBe(true);
    expect(UnitCodeSchema.safeParse('psi').success).toBe(true);

    // Inválidos
    expect(UnitCodeSchema.safeParse('<script>').success).toBe(false);
    expect(UnitCodeSchema.safeParse(' °C').success).toBe(false); // Espaço inicial
    expect(UnitCodeSchema.safeParse('°C ').success).toBe(false); // Espaço final
    expect(UnitCodeSchema.safeParse('°  C').success).toBe(false); // Múltiplos espaços
    expect(UnitCodeSchema.safeParse('a'.repeat(31)).success).toBe(false); // Excede 30 caracteres
    expect(UnitCodeSchema.safeParse('').success).toBe(false);
  });

  // =========================================================================
  // UNKNOWN-EQUALITY: unknown com motivos distintos não são iguais (conservador)
  // =========================================================================
  it('UNKNOWN-EQUALITY: unknown com razões distintas são tratados como valores diferentes para conflito', () => {
    const unk1 = { type: 'unknown' as const, reason: 'Não equipado nesta variante' };
    const unk2 = { type: 'unknown' as const, reason: 'Dado confidencial sob NDA' };
    const unk3 = { type: 'unknown' as const, reason: 'Não equipado nesta variante' };

    // Mesma razão -> iguais
    expect(areValuesEqual(unk1, unk3)).toBe(true);

    // Razões diferentes -> NÃO são iguais (geram conflito documental conservador)
    expect(areValuesEqual(unk1, unk2)).toBe(false);
  });
});
