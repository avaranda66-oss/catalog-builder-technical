// tests/domain/product-workbook/schema-and-values.test.ts
// Test suite covering schema validation, value types, serialization, and adversarial inputs.

import { describe, it, expect } from 'vitest';
import {
  parseProductWorkbook,
  parseSourceDocument,
  parseProductKnowledgeBundle,
  isValidSemanticKey,
  createWorkbook,
  ProductWorkbook,
  SourceDocument
} from '../../../src/domain/product-workbook';

describe('PIM.W1 — Product Workbook Schema, Value Types & Serialization', () => {
  // =========================================================================
  // WORKBOOK-SCHEMA-1: Criação e parsing de workbook válido
  // =========================================================================
  it('WORKBOOK-SCHEMA-1: valida workbook canônico e preserva schemaVersion: 1', () => {
    const wb = createWorkbook({
      id: 'wbk_prod_test_01',
      owner: { kind: 'product', id: 'prod-uuid-1' }
    });

    const parsed = parseProductWorkbook(wb);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.owner.kind).toBe('product');
    expect(parsed.owner.id).toBe('prod-uuid-1');
    expect(parsed.revision).toBe(0);
    expect(parsed.modules).toEqual([]);
    expect(parsed.data).toEqual({});
  });

  // =========================================================================
  // WORKBOOK-SCHEMA-2: Rejeição de schemaVersion desconhecida ou inválida
  // =========================================================================
  it('WORKBOOK-SCHEMA-2: rejeita explicitamente schemaVersion não suportada (ex: 99 ou 3)', () => {
    const invalid = {
      id: 'wbk_invalid_ver',
      schemaVersion: 99,
      owner: { kind: 'product', id: 'prod-1' },
      revision: 0,
      modules: [],
      data: {}
    };

    expect(() => parseProductWorkbook(invalid)).toThrowError();
  });

  // =========================================================================
  // DATUM-KEY-1: Validação gramatical estrita de semanticKey
  // =========================================================================
  it('DATUM-KEY-1: aceita chaves semânticas canônicas em minúsculas com múltiplos segmentos', () => {
    expect(isValidSemanticKey('metrology.temperature.range')).toBe(true);
    expect(isValidSemanticKey('communication.protocol.hart')).toBe(true);
    expect(isValidSemanticKey('electrical.input.current_range')).toBe(true);
    expect(isValidSemanticKey('custom.sensor.response_time')).toBe(true);
  });

  it('DATUM-KEY-2: rejeita chaves semânticas com maiúsculas, caracteres especiais ou segmento único', () => {
    expect(isValidSemanticKey('Metrology.Temperature')).toBe(false);
    expect(isValidSemanticKey('singlekey')).toBe(false);
    expect(isValidSemanticKey('range with spaces.val')).toBe(false);
    expect(isValidSemanticKey('range/val')).toBe(false);
    expect(isValidSemanticKey('')).toBe(false);
  });

  // =========================================================================
  // VALUE-TYPES: Validação estrita de cada tipo da união discriminada
  // =========================================================================
  it('VALUE-TYPES-1: aceita text, number e boolean', () => {
    const wb: ProductWorkbook = {
      id: 'wbk_vals',
      schemaVersion: 1,
      owner: { kind: 'product', id: 'p1' },
      revision: 1,
      modules: [
        {
          id: 'mod_1',
          semanticKey: 'general.info',
          label: 'Informações Gerais',
          kind: 'key_value',
          order: 0,
          datumIds: ['d1', 'd2', 'd3']
        }
      ],
      data: {
        d1: {
          id: 'd1',
          semanticKey: 'general.manufacturer',
          moduleId: 'mod_1',
          label: 'Fabricante',
          value: { type: 'text', value: 'Presys' },
          evidence: [],
          status: 'approved'
        },
        d2: {
          id: 'd2',
          semanticKey: 'general.weight_kg',
          moduleId: 'mod_1',
          label: 'Peso Nominal',
          value: { type: 'number', value: 12.5 },
          evidence: [],
          status: 'verified'
        },
        d3: {
          id: 'd3',
          semanticKey: 'general.has_display',
          moduleId: 'mod_1',
          label: 'Possui Display',
          value: { type: 'boolean', value: true },
          evidence: [],
          status: 'approved'
        }
      }
    };

    const parsed = parseProductWorkbook(wb);
    expect(parsed.data['d1'].value.type).toBe('text');
    expect(parsed.data['d2'].value.type).toBe('number');
    expect(parsed.data['d3'].value.type).toBe('boolean');
  });

  it('VALUE-TYPES-2: valida quantity com amount, unit e qualifier opcional', () => {
    const wb: ProductWorkbook = {
      id: 'wbk_qty',
      schemaVersion: 1,
      owner: { kind: 'product', id: 'p1' },
      revision: 1,
      modules: [
        {
          id: 'mod_1',
          semanticKey: 'metrology.accuracy',
          label: 'Exatidão',
          kind: 'key_value',
          order: 0,
          datumIds: ['d1']
        }
      ],
      data: {
        d1: {
          id: 'd1',
          semanticKey: 'metrology.accuracy.limit',
          moduleId: 'mod_1',
          label: 'Limite de Erro',
          value: { type: 'quantity', amount: 0.05, unit: '°C', qualifier: 'max' },
          evidence: [],
          status: 'approved'
        }
      }
    };

    const parsed = parseProductWorkbook(wb);
    const val = parsed.data['d1'].value;
    if (val.type === 'quantity') {
      expect(val.amount).toBe(0.05);
      expect(val.unit).toBe('°C');
      expect(val.qualifier).toBe('max');
    } else {
      throw new Error('Tipo incorreto');
    }
  });

  // =========================================================================
  // RANGE: Validação de limites inferior e superior e rejeição de faixas invertidas
  // =========================================================================
  it('RANGE-1: aceita faixas bilaterais e unilaterais (abertas)', () => {
    const wb: ProductWorkbook = {
      id: 'wbk_range',
      schemaVersion: 1,
      owner: { kind: 'product', id: 'p1' },
      revision: 1,
      modules: [
        {
          id: 'mod_1',
          semanticKey: 'metrology.range',
          label: 'Faixas',
          kind: 'key_value',
          order: 0,
          datumIds: ['d1', 'd2']
        }
      ],
      data: {
        d1: {
          id: 'd1',
          semanticKey: 'metrology.temperature.operating',
          moduleId: 'mod_1',
          label: 'Faixa de Operação',
          value: { type: 'range', lower: -25, upper: 140, unit: '°C' },
          evidence: [],
          status: 'approved'
        },
        d2: {
          id: 'd2',
          semanticKey: 'metrology.pressure.max_limit',
          moduleId: 'mod_1',
          label: 'Pressão Máxima Suportada',
          value: { type: 'range', upper: 100, unit: 'bar' }, // Unilateral aberto à esquerda
          evidence: [],
          status: 'approved'
        }
      }
    };

    const parsed = parseProductWorkbook(wb);
    expect(parsed.data['d1'].value.type).toBe('range');
    expect(parsed.data['d2'].value.type).toBe('range');
  });

  it('RANGE-2: rejeita faixa com limite inferior maior que superior', () => {
    const invalidWb = {
      id: 'wbk_inv_range',
      schemaVersion: 1,
      owner: { kind: 'product', id: 'p1' },
      revision: 1,
      modules: [
        {
          id: 'mod_1',
          semanticKey: 'test.range',
          label: 'Teste',
          kind: 'key_value',
          order: 0,
          datumIds: ['d1']
        }
      ],
      data: {
        d1: {
          id: 'd1',
          semanticKey: 'test.temperature.inverted',
          moduleId: 'mod_1',
          label: 'Faixa Invertida',
          value: { type: 'range', lower: 200, upper: 50, unit: '°C' }, // INVERTIDO!
          evidence: [],
          status: 'draft'
        }
      }
    };

    expect(() => parseProductWorkbook(invalidWb)).toThrowError(/Limite inferior da faixa/);
  });

  it('RANGE-3: rejeita faixa sem nenhum limite definido', () => {
    const invalidWb = {
      id: 'wbk_empty_range',
      schemaVersion: 1,
      owner: { kind: 'product', id: 'p1' },
      revision: 1,
      modules: [
        {
          id: 'mod_1',
          semanticKey: 'test.range',
          label: 'Teste',
          kind: 'key_value',
          order: 0,
          datumIds: ['d1']
        }
      ],
      data: {
        d1: {
          id: 'd1',
          semanticKey: 'test.temperature.empty',
          moduleId: 'mod_1',
          label: 'Faixa Vazia',
          value: { type: 'range', unit: '°C' }, // Sem lower e sem upper!
          evidence: [],
          status: 'draft'
        }
      }
    };

    expect(() => parseProductWorkbook(invalidWb)).toThrowError(/definir ao menos um limite/);
  });

  // =========================================================================
  // VALUE-TYPES: Tokens técnicos, referências e enum
  // =========================================================================
  it('VALUE-TYPES-3: valida technical_token, enum, asset_reference e unknown', () => {
    const wb: ProductWorkbook = {
      id: 'wbk_tokens',
      schemaVersion: 1,
      owner: { kind: 'product', id: 'p1' },
      revision: 1,
      modules: [
        {
          id: 'mod_1',
          semanticKey: 'hardware.specs',
          label: 'Hardware',
          kind: 'key_value',
          order: 0,
          datumIds: ['d1', 'd2', 'd3', 'd4']
        }
      ],
      data: {
        d1: {
          id: 'd1',
          semanticKey: 'hardware.bus.protocol',
          moduleId: 'mod_1',
          label: 'Protocolo de Comunicação',
          value: { type: 'technical_token', token: 'HART', category: 'fieldbus' },
          evidence: [],
          status: 'approved'
        },
        d2: {
          id: 'd2',
          semanticKey: 'hardware.housing.material',
          moduleId: 'mod_1',
          label: 'Material do Invólucro',
          value: { type: 'enum', code: 'al_die_cast', label: 'Alumínio Fundido' },
          evidence: [],
          status: 'verified'
        },
        d3: {
          id: 'd3',
          semanticKey: 'hardware.photo.main',
          moduleId: 'mod_1',
          label: 'Foto Principal',
          value: { type: 'asset_reference', assetId: 'ast-9988-uuid' },
          evidence: [],
          status: 'approved'
        },
        d4: {
          id: 'd4',
          semanticKey: 'hardware.optical.sensor',
          moduleId: 'mod_1',
          label: 'Sensor Óptico',
          value: { type: 'unknown', reason: 'Não equipado nesta variante' },
          evidence: [],
          status: 'approved'
        }
      }
    };

    const parsed = parseProductWorkbook(wb);
    expect(parsed.data['d1'].value.type).toBe('technical_token');
    expect(parsed.data['d2'].value.type).toBe('enum');
    expect(parsed.data['d3'].value.type).toBe('asset_reference');
    expect(parsed.data['d4'].value.type).toBe('unknown');
  });

  // =========================================================================
  // SERIALIZATION: Roundtrip JSON stringify / parse
  // =========================================================================
  it('SERIALIZATION-1: preserva 100% da semântica em roundtrip JSON', () => {
    const original = createWorkbook({
      id: 'wbk_roundtrip',
      owner: { kind: 'family', id: 'fam-uuid-55' },
      revision: 4
    });

    const json = JSON.stringify(original);
    const restored = parseProductWorkbook(JSON.parse(json));

    expect(restored).toEqual(original);
  });

  // =========================================================================
  // ADVERSARIAL: Fail closed em campos desconhecidos
  // =========================================================================
  it('ADVERSARIAL-1: rejeita payloads com campos espúrios desconhecidos (strict validation)', () => {
    const hostile = {
      id: 'wbk_hostile',
      schemaVersion: 1,
      owner: { kind: 'product', id: 'p1' },
      revision: 0,
      modules: [],
      data: {},
      hackerInjection: 'arbitrary_payload' // Campo não documentado!
    };

    expect(() => parseProductWorkbook(hostile)).toThrowError(/unrecognized_keys/);
  });

  // =========================================================================
  // SOURCE-DOCUMENT & BUNDLE
  // =========================================================================
  it('PROVENANCE-1: valida documento fonte e container de bundle compartilhado', () => {
    const doc: SourceDocument = {
      id: 'doc-manual-2026',
      title: 'Manual de Instruções TA-25N',
      documentType: 'manual',
      revision: 'Rev. 4.2',
      language: 'pt-BR',
      publicationDate: '2026-05-15'
    };

    const parsedDoc = parseSourceDocument(doc);
    expect(parsedDoc.id).toBe('doc-manual-2026');

    const bundle = parseProductKnowledgeBundle({
      sources: [doc],
      workbooks: []
    });

    expect(bundle.sources.length).toBe(1);
    expect(bundle.workbooks.length).toBe(0);
  });
});
