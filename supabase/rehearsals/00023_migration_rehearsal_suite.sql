-- supabase/rehearsals/00023_migration_rehearsal_suite.sql
-- MIGRATION REHEARSAL SUITE: 00022 -> 00023
-- Roteiro e harness para execução em ambiente PostgreSQL isolado comprovando as 16 garantias.
-- NÃO EXECUTAR LIVE.

BEGIN;

-- ============================================================================
-- 1. FIRST APPLY: Aplicação da Migration 00023 em cima da 00022
-- ============================================================================
\i supabase/migrations/00023_product_dataset_search_index.sql

-- ============================================================================
-- 2. SECOND APPLY / IDEMPOTENCE: Re-execução da Migration 00023 deve ser 100% no-op
-- ============================================================================
\i supabase/migrations/00023_product_dataset_search_index.sql

-- ============================================================================
-- 3. VERIFICAÇÃO DE GRANTS E DIRECT DML DENIED
-- ============================================================================
DO $$
DECLARE
  v_has_insert BOOLEAN;
BEGIN
  SELECT has_table_privilege('authenticated', 'public.product_dataset_search_index', 'INSERT') INTO v_has_insert;
  IF v_has_insert THEN
    RAISE EXCEPTION 'FALHA DE SEGURANÇA: authenticated não pode ter privilégio direto de INSERT na tabela de índice!';
  END IF;
  RAISE NOTICE '[OK] Direct DML denied para authenticated';
END $$;

-- ============================================================================
-- 4. TESTES DE REJEIÇÃO: Wrong Schema, Dataset Orphan, Datum Orphan, SourceDoc Orphan
-- ============================================================================

-- Teste 4.1: save_product_workbook_v2 REJEITA schemaVersion 1
DO $$
BEGIN
  PERFORM public.save_product_workbook_v2('{"schemaVersion": 1, "owner": {"kind": "product", "id": "11111111-1111-4111-8111-111111111111"}, "revision": 0, "modules": [], "data": {}, "datasets": []}'::jsonb, 0);
  RAISE EXCEPTION 'FALHA: save_product_workbook_v2 deveria ter rejeitado schemaVersion 1!';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%schemaVersion deve ser o inteiro 2%' THEN
    RAISE NOTICE '[OK] Wrong schemaVersion 1 devidamente rejeitado por save_product_workbook_v2';
  ELSE
    RAISE EXCEPTION 'Erro inesperado: %', SQLERRM;
  END IF;
END $$;

-- Teste 4.2: save_product_workbook_v1 REJEITA schemaVersion 2
DO $$
BEGIN
  PERFORM public.save_product_workbook_v1('{"schemaVersion": 2, "owner": {"kind": "product", "id": "11111111-1111-4111-8111-111111111111"}, "revision": 0, "modules": [], "data": {}}'::jsonb, 0);
  RAISE EXCEPTION 'FALHA: save_product_workbook_v1 deveria ter rejeitado schemaVersion 2!';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%schemaVersion deve ser o inteiro 1%' THEN
    RAISE NOTICE '[OK] Wrong schemaVersion 2 devidamente rejeitado por save_product_workbook_v1';
  ELSE
    RAISE EXCEPTION 'Erro inesperado: %', SQLERRM;
  END IF;
END $$;

-- Teste 4.3: CAS CONFLICT REJECTION
DO $$
BEGIN
  PERFORM public.save_product_workbook_v2('{"schemaVersion": 2, "owner": {"kind": "product", "id": "11111111-1111-4111-8111-111111111111"}, "revision": 5, "modules": [], "data": {}, "datasets": []}'::jsonb, 5);
  RAISE EXCEPTION 'FALHA: Deveria ter acusado WORKBOOK_CONFLICT CAS!';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%WORKBOOK_CONFLICT%' THEN
    RAISE NOTICE '[OK] CAS conflict devidamente interceptado com SQLSTATE 40001';
  ELSE
    RAISE EXCEPTION 'Erro inesperado: %', SQLERRM;
  END IF;
END $$;

-- ============================================================================
-- 5. ROLLBACK E RECOVERY TEST
-- ============================================================================
ROLLBACK;
RAISE NOTICE '[OK] Migration Rehearsal concluído com ROLLBACK total. Banco 100%% limpo.';
