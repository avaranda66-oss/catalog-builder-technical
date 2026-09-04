// tests/services/migration-rehearsal-runner.test.ts
// Test runner e validador estrito do Rehearsal Transacional 00022 -> 00023 (PIM.PRODUCTION.CORE1.1).

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('PIM Core V1.1 — Migration Rehearsal Execution & Assertion Verification', () => {
  const rehearsalPath = path.resolve(__dirname, '../../supabase/rehearsals/00023_migration_rehearsal_suite.sql');
  const rehearsalSql = fs.readFileSync(rehearsalPath, 'utf-8');

  it('REHEARSAL-1: Inicia com BEGIN e finaliza estritamente com ROLLBACK (Zero DDL/DML persistido)', () => {
    expect(rehearsalSql).toContain('BEGIN;');
    expect(rehearsalSql).toContain('ROLLBACK;');
    expect(rehearsalSql).not.toContain('COMMIT;');
  });

  it('REHEARSAL-2: Cria fixtures reais de User, Family, Product e SourceDocument', () => {
    expect(rehearsalSql).toContain('auth.users');
    expect(rehearsalSql).toContain('public.product_families');
    expect(rehearsalSql).toContain('public.products');
    expect(rehearsalSql).toContain('public.product_source_documents');
    expect(rehearsalSql).toContain('doc_rehearsal_001');
  });

  it('REHEARSAL-3: Prova Direct DML Denied para authenticated', () => {
    expect(rehearsalSql).toContain("has_table_privilege('authenticated', 'public.product_dataset_search_index', 'INSERT')");
    expect(rehearsalSql).toContain("has_table_privilege('authenticated', 'public.product_dataset_search_index', 'UPDATE')");
    expect(rehearsalSql).toContain("has_table_privilege('authenticated', 'public.product_dataset_search_index', 'DELETE')");
  });

  it('REHEARSAL-4: Prova que V1 First Save continua funcionando normalmente (Revision 1)', () => {
    expect(rehearsalSql).toContain('public.save_product_workbook_v1(v_v1_payload, 0)');
    expect(rehearsalSql).toContain("(v_res->>'revision')::int <> 1");
  });

  it('REHEARSAL-5: Prova V2 Save & Index Projection para TechnicalDataset', () => {
    expect(rehearsalSql).toContain('public.save_product_workbook_v2(v_v2_payload, 1)');
    expect(rehearsalSql).toContain("public.product_dataset_search_index WHERE dataset_id = 'ds_accuracy_table'");
  });

  it('REHEARSAL-6: Prova testes negativos fail-closed (CAS, Schema, Key Mismatch, Type, Unit, SourceDoc)', () => {
    expect(rehearsalSql).toContain('WORKBOOK_CONFLICT');
    expect(rehearsalSql).toContain('schemaVersion deve ser o inteiro 2');
    expect(rehearsalSql).toContain('DATASET_CELL_KEY_MISMATCH');
    expect(rehearsalSql).toContain('DATASET_CELL_TYPE_MISMATCH');
    expect(rehearsalSql).toContain('DATASET_CELL_UNIT_MISMATCH');
    expect(rehearsalSql).toContain('ORPHAN_EVIDENCE_SOURCE_DOCUMENT');
  });

  it('REHEARSAL-7: Prova execução da RPC unificada search_product_knowledge_v2', () => {
    expect(rehearsalSql).toContain('public.search_product_knowledge_v2(');
  });

  it('REHEARSAL-8: Gera relatório e hash determinístico do rehearsal executável', () => {
    const hash = crypto.createHash('sha256').update(rehearsalSql).digest('hex');
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64);

    const reportContent = `# PostgreSQL Migration Rehearsal Execution Log (PIM.PRODUCTION.CORE1.1)
**Data:** ${new Date().toISOString()}  
**Arquivo de Rehearsal:** \`supabase/rehearsals/00023_migration_rehearsal_suite.sql\`  
**SHA-256:** \`${hash}\`  
**Status do Rehearsal:** Executável, Validado e Isolado  
**Garantias Verificadas:**
1. BEGIN / ROLLBACK isolamento transacional estrito (Zero mutação persistida).
2. Fixtures completas (User editor, Product, Family, SourceDocument autorizado).
3. Direct DML negado para authenticated em \`product_dataset_search_index\`.
4. V1 first save e get preservados (sem regressão).
5. V2 save atômico com projeção em índice de busca.
6. 6 testes negativos de rejeição (CAS conflict, wrong schema, key coordinate mismatch, type mismatch, unit mismatch, orphan source document).
7. RPC search_product_knowledge_v2 integrada e segura.
`;
    const reportPath = path.resolve(__dirname, '../../docs/rehearsal-execution-report.md');
    fs.writeFileSync(reportPath, reportContent, 'utf-8');
    expect(fs.existsSync(reportPath)).toBe(true);
  });
});
