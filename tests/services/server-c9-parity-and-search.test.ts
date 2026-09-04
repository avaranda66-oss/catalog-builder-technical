// tests/services/server-c9-parity-and-search.test.ts
// Testes contratuais para C9 Server-Side Parity e RPC search_product_knowledge_v2 (PIM.PRODUCTION.CORE1.1).

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('PIM Core V1.1 — Server C9 Parity & Search Contract Verification', () => {
  const migration23Path = path.resolve(__dirname, '../../supabase/migrations/00023_product_dataset_search_index.sql');
  const migrationSql = fs.readFileSync(migration23Path, 'utf-8');

  it('SERVER-C9-1: migration 00023 valida duplicidade de dataset IDs e semanticKeys', () => {
    expect(migrationSql).toContain('DUPLICATE_DATASET_ID');
    expect(migrationSql).toContain('DUPLICATE_DATASET_SEMANTIC_KEY');
  });

  it('SERVER-C9-2: migration 00023 valida duplicidade de column IDs e semanticKeys', () => {
    expect(migrationSql).toContain('DUPLICATE_COLUMN_ID');
    expect(migrationSql).toContain('DUPLICATE_COLUMN_SEMANTIC_KEY');
  });

  it('SERVER-C9-3: migration 00023 valida duplicidade de row IDs', () => {
    expect(migrationSql).toContain('DUPLICATE_ROW_ID');
  });

  it('SERVER-C9-4: migration 00023 valida correspondência exata entre cell-key e coordenadas declaradas', () => {
    expect(migrationSql).toContain('DATASET_CELL_KEY_MISMATCH');
    expect(migrationSql).toContain("format('r%s:%s|c%s:%s'");
  });

  it('SERVER-C9-5: migration 00023 valida existência de rowId e columnId na grade', () => {
    expect(migrationSql).toContain('DATASET_CELL_ROW_NOT_FOUND');
    expect(migrationSql).toContain('DATASET_CELL_COLUMN_NOT_FOUND');
  });

  it('SERVER-C9-6: migration 00023 valida existência de datumId e de moduleId para todos os dados', () => {
    expect(migrationSql).toContain('DATASET_CELL_DATUM_NOT_FOUND');
    expect(migrationSql).toContain('DATUM_MODULE_NOT_FOUND');
    expect(migrationSql).toContain('DATASET_MODULE_NOT_FOUND');
  });

  it('SERVER-C9-7: migration 00023 valida paridade de tipo e unidade metrológica entre coluna e datum', () => {
    expect(migrationSql).toContain('DATASET_CELL_TYPE_MISMATCH');
    expect(migrationSql).toContain('DATASET_CELL_UNIT_MISMATCH');
  });

  it('SEARCH-CONTRACT-1: define RPC search_product_knowledge_v2 com fail-closed auth e unificação de índices', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.search_product_knowledge_v2');
    expect(migrationSql).toContain('AUTH_REQUIRED');
    expect(migrationSql).toContain('product_technical_data_index');
    expect(migrationSql).toContain('product_dataset_search_index');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.search_product_knowledge_v2(TEXT, UUID, UUID, TEXT, INTEGER) TO authenticated');
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.search_product_knowledge_v2(TEXT, UUID, UUID, TEXT, INTEGER) FROM anon, PUBLIC');
  });
});
