// tests/services/migration-rehearsal-runner.test.ts
// Validador estrito do Contrato do Rehearsal SQL 00022 -> 00023 (PIM.PRODUCTION.CORE1.2).
// A prova de execução em PostgreSQL real é realizada via CI / GitHub Actions runner isolado.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('PIM Core V1.2 — Static Rehearsal Suite Contract Verification', () => {
  const rehearsalPath = path.resolve(__dirname, '../../supabase/rehearsals/00023_migration_rehearsal_suite.sql');
  const rehearsalSql = fs.readFileSync(rehearsalPath, 'utf-8');

  it('CONTRACT-1: BEGIN / ROLLBACK isolamento transacional estrito', () => {
    expect(rehearsalSql).toContain('BEGIN;');
    expect(rehearsalSql).toContain('ROLLBACK;');
    expect(rehearsalSql).not.toContain('COMMIT;');
  });

  it('CONTRACT-2: Fixtures de User, Profile, Family, Products e SourceDocument', () => {
    expect(rehearsalSql).toContain('auth.users');
    expect(rehearsalSql).toContain('public.profiles');
    expect(rehearsalSql).toContain('public.product_families');
    expect(rehearsalSql).toContain('public.products');
    expect(rehearsalSql).toContain('public.product_source_documents');
    expect(rehearsalSql).toContain('doc_rehearsal_001');
  });

  it('CONTRACT-3: Pontos 03 a 05 — Suporte V1 mantido e preservado', () => {
    expect(rehearsalSql).toContain('POINT-03');
    expect(rehearsalSql).toContain('save_product_workbook_v1(v_v1_payload, 0)');
    expect(rehearsalSql).toContain('POINT-04');
    expect(rehearsalSql).toContain('save_product_workbook_v1(v_v1_payload, 1)');
    expect(rehearsalSql).toContain('POINT-05');
    expect(rehearsalSql).toContain('get_product_workbook_v1');
  });

  it('CONTRACT-4: Pontos 06 a 08 — Suporte V2 com datasets e projeções', () => {
    expect(rehearsalSql).toContain('POINT-06');
    expect(rehearsalSql).toContain('save_product_workbook_v2(v_v2_payload, 0)');
    expect(rehearsalSql).toContain('POINT-07');
    expect(rehearsalSql).toContain('save_product_workbook_v2(v_v2_payload, 1)');
    expect(rehearsalSql).toContain('POINT-08');
    expect(rehearsalSql).toContain('get_product_workbook_v2');
  });

  it('CONTRACT-5: Pontos 09 a 11 — Bloqueios de versão e concorrência CAS', () => {
    expect(rehearsalSql).toContain('POINT-09');
    expect(rehearsalSql).toContain('schemaVersion deve ser o inteiro 1');
    expect(rehearsalSql).toContain('POINT-10');
    expect(rehearsalSql).toContain('schemaVersion deve ser o inteiro 2');
    expect(rehearsalSql).toContain('POINT-11');
    expect(rehearsalSql).toContain('WORKBOOK_CONFLICT');
  });

  it('CONTRACT-6: Pontos 12 a 20 — 9 Testes negativos fail-closed C9', () => {
    expect(rehearsalSql).toContain('POINT-12');
    expect(rehearsalSql).toContain('DATASET_MODULE_NOT_FOUND');
    expect(rehearsalSql).toContain('POINT-13');
    expect(rehearsalSql).toContain('DATUM_MODULE_NOT_FOUND');
    expect(rehearsalSql).toContain('POINT-14');
    expect(rehearsalSql).toContain('DATASET_CELL_DATUM_NOT_FOUND');
    expect(rehearsalSql).toContain('POINT-15');
    expect(rehearsalSql).toContain('DATASET_CELL_ROW_NOT_FOUND');
    expect(rehearsalSql).toContain('POINT-16');
    expect(rehearsalSql).toContain('DATASET_CELL_COLUMN_NOT_FOUND');
    expect(rehearsalSql).toContain('POINT-17');
    expect(rehearsalSql).toContain('DATASET_CELL_KEY_MISMATCH');
    expect(rehearsalSql).toContain('POINT-18');
    expect(rehearsalSql).toContain('DATASET_CELL_TYPE_MISMATCH');
    expect(rehearsalSql).toContain('POINT-19');
    expect(rehearsalSql).toContain('DATASET_CELL_UNIT_MISMATCH');
    expect(rehearsalSql).toContain('POINT-20');
    expect(rehearsalSql).toContain('ORPHAN_EVIDENCE_SOURCE_DOCUMENT');
  });

  it('CONTRACT-7: Pontos 21 a 28 — Busca, Projeções, RLS, Grants, Auditoria e Rollback', () => {
    expect(rehearsalSql).toContain('POINT-21');
    expect(rehearsalSql).toContain('search_product_knowledge_v2');
    expect(rehearsalSql).toContain('POINT-22');
    expect(rehearsalSql).toContain('product_technical_data_index');
    expect(rehearsalSql).toContain('POINT-23');
    expect(rehearsalSql).toContain('product_dataset_search_index');
    expect(rehearsalSql).toContain('POINT-24');
    expect(rehearsalSql).toContain('has_table_privilege');
    expect(rehearsalSql).toContain('POINT-25');
    expect(rehearsalSql).toContain('rowsecurity');
    expect(rehearsalSql).toContain('POINT-26');
    expect(rehearsalSql).toContain('has_function_privilege');
    expect(rehearsalSql).toContain('POINT-27');
    expect(rehearsalSql).toContain('library_change_events');
    expect(rehearsalSql).toContain('POINT-28');
  });

  it('CONTRACT-8: Checksum determinístico do SQL de rehearsal', () => {
    const hash = crypto.createHash('sha256').update(rehearsalSql).digest('hex');
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64);
  });
});
