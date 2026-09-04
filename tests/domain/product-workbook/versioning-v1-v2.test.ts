// tests/domain/product-workbook/versioning-v1-v2.test.ts
// Tests for explicit SchemaVersion 1 vs SchemaVersion 2 isolation, migration, and backward compatibility.

import { describe, it, expect } from 'vitest';
import {
  ensureWorkbookV2,
  migrateWorkbookV1ToV2,
  parseProductWorkbook,
  parseProductWorkbookV1,
  parseProductWorkbookV2
} from '../../../src/domain/product-workbook';

describe('SchemaVersion 1 vs SchemaVersion 2 Evolution & Isolation (EMENDA 1)', () => {
  const sampleV1Payload = {
    id: 'wbk_sample_v1',
    schemaVersion: 1,
    owner: { kind: 'product', id: 'prod_1' },
    revision: 5,
    modules: [
      {
        id: 'mod_1',
        semanticKey: 'sample.module',
        label: 'Módulo 1',
        kind: 'key_value',
        order: 0,
        datumIds: ['dtm_1']
      }
    ],
    data: {
      dtm_1: {
        id: 'dtm_1',
        semanticKey: 'sample.module.val',
        moduleId: 'mod_1',
        label: 'Valor 1',
        value: { type: 'text', value: 'Olá Mundo' },
        evidence: [],
        status: 'draft',
        audit: { createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
      }
    }
  };

  const sampleV2Payload = {
    ...sampleV1Payload,
    id: 'wbk_sample_v2',
    schemaVersion: 2,
    datasets: [
      {
        id: 'ds_1',
        semanticKey: 'sample.module.table',
        moduleId: 'mod_1',
        label: 'Tabela V2',
        kind: 'matrix',
        columns: [],
        rows: [],
        cells: {},
        order: 0
      }
    ]
  };

  it('parseProductWorkbookV1 aceita estritamente schemaVersion 1 e rejeita schemaVersion 2', () => {
    const v1 = parseProductWorkbookV1(sampleV1Payload);
    expect(v1.schemaVersion).toBe(1);
    expect(v1.id).toBe('wbk_sample_v1');

    expect(() => parseProductWorkbookV1(sampleV2Payload)).toThrowError();
  });

  it('parseProductWorkbookV2 aceita estritamente schemaVersion 2 e rejeita schemaVersion 1', () => {
    const v2 = parseProductWorkbookV2(sampleV2Payload);
    expect(v2.schemaVersion).toBe(2);
    expect(v2.datasets).toHaveLength(1);

    expect(() => parseProductWorkbookV2(sampleV1Payload)).toThrowError();
  });

  it('parseProductWorkbook aceita polimorficamente tanto V1 quanto V2', () => {
    const parsedV1 = parseProductWorkbook(sampleV1Payload);
    expect(parsedV1.schemaVersion).toBe(1);

    const parsedV2 = parseProductWorkbook(sampleV2Payload);
    expect(parsedV2.schemaVersion).toBe(2);
  });

  it('migrateWorkbookV1ToV2 migra deterministicamente de V1 para V2 preservando todas as propriedades', () => {
    const v1 = parseProductWorkbookV1(sampleV1Payload);
    const v2 = migrateWorkbookV1ToV2(v1);

    expect(v2.schemaVersion).toBe(2);
    expect(v2.id).toBe(v1.id);
    expect(v2.revision).toBe(v1.revision);
    expect(v2.owner).toEqual(v1.owner);
    expect(v2.modules).toEqual(v1.modules);
    expect(v2.data).toEqual(v1.data);
    expect(v2.datasets).toEqual([]);
  });

  it('ensureWorkbookV2 é idempotente para V2 e converte V1', () => {
    const v1 = parseProductWorkbookV1(sampleV1Payload);
    const v2FromV1 = ensureWorkbookV2(v1);
    expect(v2FromV1.schemaVersion).toBe(2);

    const v2Original = parseProductWorkbookV2(sampleV2Payload);
    const v2Idempotent = ensureWorkbookV2(v2Original);
    expect(v2Idempotent).toBe(v2Original);
  });
});
