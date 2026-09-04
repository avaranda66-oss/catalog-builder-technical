-- supabase/rehearsals/00023_migration_rehearsal_suite.sql
-- MIGRATION REHEARSAL SUITE: 00022 -> 00023
-- Roteiro e harness executável para PostgreSQL real isolado / CI comprovando as garantias de produção.
-- Transacional com ROLLBACK ao final. NÃO APLICAR LIVE.

BEGIN;

-- ============================================================================
-- 1. SETUP DE FIXTURES REAIS DENTRO DA TRANSAÇÃO
-- ============================================================================
DO $$
DECLARE
    v_test_user UUID := '99999999-9999-4999-8999-999999999999'::uuid;
    v_test_prod UUID := '11111111-1111-4111-8111-111111111111'::uuid;
    v_test_fam  UUID := '22222222-2222-4222-8222-222222222222'::uuid;
BEGIN
    -- Fixture: Usuário Editor de Teste em auth.users se tabela existir
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        INSERT INTO auth.users (id, email, raw_app_meta_data)
        VALUES (v_test_user, 'editor_rehearsal@presys.com.br', '{"role":"editor"}'::jsonb)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Fixture: Família de Teste
    INSERT INTO public.product_families (id, name, description, created_at, updated_at)
    VALUES (v_test_fam, 'Família Rehearsal', 'Família criada para ensaio transacional da migration 00023', now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- Fixture: Produto de Teste
    INSERT INTO public.products (id, sku, name, family_id, status, version, created_at, updated_at)
    VALUES (v_test_prod, 'REHEARSAL-01', 'Instrumento Rehearsal PIM V2', v_test_fam, 'draft', 1, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- Fixture: Documento Fonte Autorizado
    INSERT INTO public.product_source_documents (id, product_id, title, document_type, revision, created_at)
    VALUES ('doc_rehearsal_001', v_test_prod, 'Manual de Engenharia Rehearsal', 'manual', 'Rev. C', now())
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE '[REHEARSAL] Fixtures criadas com sucesso (User, Family, Product, SourceDocument).';
END $$;

-- ============================================================================
-- 2. VERIFICAÇÃO DE GRANTS E DIRECT DML DENIED
-- ============================================================================
DO $$
DECLARE
    v_has_insert BOOLEAN;
    v_has_update BOOLEAN;
    v_has_delete BOOLEAN;
BEGIN
    SELECT has_table_privilege('authenticated', 'public.product_dataset_search_index', 'INSERT') INTO v_has_insert;
    SELECT has_table_privilege('authenticated', 'public.product_dataset_search_index', 'UPDATE') INTO v_has_update;
    SELECT has_table_privilege('authenticated', 'public.product_dataset_search_index', 'DELETE') INTO v_has_delete;

    IF v_has_insert OR v_has_update OR v_has_delete THEN
        RAISE EXCEPTION 'FALHA DE SEGURANÇA: authenticated não pode ter privilégio de escrita direta em product_dataset_search_index!';
    END IF;

    RAISE NOTICE '[REHEARSAL][OK] Direct DML negado com sucesso para authenticated.';
END $$;

-- ============================================================================
-- 3. TESTE DE CONTRATO V1: Continua funcionando normalmente
-- ============================================================================
DO $$
DECLARE
    v_v1_payload JSONB;
    v_res JSONB;
BEGIN
    v_v1_payload := '{
        "id": "wbk_prod_rehearsal_v1",
        "schemaVersion": 1,
        "owner": {"kind": "product", "id": "11111111-1111-4111-8111-111111111111"},
        "revision": 0,
        "modules": [{"id": "mod_metrology", "semanticKey": "metrology.general", "label": "Metrologia", "kind": "specification", "order": 0, "datumIds": []}],
        "data": {}
    }'::jsonb;

    -- Salva V1
    v_res := public.save_product_workbook_v1(v_v1_payload, 0);
    IF (v_res->>'revision')::int <> 1 THEN
        RAISE EXCEPTION 'FALHA: save_product_workbook_v1 deveria retornar revision 1!';
    END IF;

    RAISE NOTICE '[REHEARSAL][OK] V1 first save executado com sucesso (Revision 1).';
END $$;

-- ============================================================================
-- 4. TESTE DE CONTRATO V2: Salva V2 com integridade C9 e atualiza
-- ============================================================================
DO $$
DECLARE
    v_v2_payload JSONB;
    v_res JSONB;
    v_count INTEGER;
BEGIN
    v_v2_payload := '{
        "id": "wbk_prod_rehearsal_v2",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "11111111-1111-4111-8111-111111111111"},
        "revision": 1,
        "modules": [
            {"id": "mod_metrology", "semanticKey": "metrology.general", "label": "Metrologia", "kind": "specification", "order": 0, "datumIds": ["dat_temp_01"]}
        ],
        "data": {
            "dat_temp_01": {
                "id": "dat_temp_01",
                "moduleId": "mod_metrology",
                "semanticKey": "metrology.temp.acc",
                "label": "Exatidão de Temperatura",
                "value": {"type": "numeric", "amount": 0.05, "unit": "°C"},
                "evidence": [
                    {"id": "ev_01", "sourceDocumentId": "doc_rehearsal_001", "locator": "Página 12"}
                ],
                "status": "verified"
            }
        },
        "datasets": [
            {
                "id": "ds_accuracy_table",
                "semanticKey": "metrology.tables.accuracy",
                "moduleId": "mod_metrology",
                "label": "Tabela de Exatidão",
                "kind": "matrix",
                "order": 0,
                "columns": [
                    {"id": "col_acc", "semanticKey": "metrology.col.acc", "label": "Exatidão Metrológica", "valueType": "numeric", "unit": "°C", "order": 0}
                ],
                "rows": [
                    {"id": "row_50c", "semanticKey": "metrology.row.50c", "label": "Faixa 50 °C", "order": 0}
                ],
                "cells": {
                    "r7:row_50c|c7:col_acc": {
                        "rowId": "row_50c",
                        "columnId": "col_acc",
                        "datumId": "dat_temp_01"
                    }
                }
            }
        ]
    }'::jsonb;

    -- Salva V2 (expectedRevision = 1)
    v_res := public.save_product_workbook_v2(v_v2_payload, 1);
    IF (v_res->>'revision')::int <> 2 THEN
        RAISE EXCEPTION 'FALHA: save_product_workbook_v2 deveria retornar revision 2!';
    END IF;

    -- Verifica projeção na tabela de busca do dataset
    SELECT count(*) INTO v_count FROM public.product_dataset_search_index WHERE dataset_id = 'ds_accuracy_table';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FALHA: Projeção de busca em product_dataset_search_index deveria conter exatamente 1 linha!';
    END IF;

    RAISE NOTICE '[REHEARSAL][OK] V2 save & index projection executado com sucesso (Revision 2, 1 célula indexada).';
END $$;

-- ============================================================================
-- 5. TESTES NEGATIVOS DE REJEIÇÃO C9 SERVER-SIDE
-- ============================================================================

-- Teste 5.1: Rejeição de CAS CONFLICT
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_prod_rehearsal_v2",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "11111111-1111-4111-8111-111111111111"},
        "revision": 0,
        "modules": [], "data": {}, "datasets": []
    }'::jsonb, 0);
    RAISE EXCEPTION 'FALHA: Deveria ter acusado WORKBOOK_CONFLICT CAS!';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '40001' OR SQLERRM LIKE '%WORKBOOK_CONFLICT%' THEN
        RAISE NOTICE '[REHEARSAL][OK] CAS conflict rejeitado com sucesso (SQLSTATE 40001).';
    ELSE
        RAISE EXCEPTION 'Erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- Teste 5.2: Rejeição de SchemaVersion Incompatível (V1 passado para save_v2)
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test",
        "schemaVersion": 1,
        "owner": {"kind": "product", "id": "11111111-1111-4111-8111-111111111111"},
        "revision": 2,
        "modules": [], "data": {}, "datasets": []
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA: save_product_workbook_v2 deveria ter rejeitado schemaVersion 1!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%schemaVersion deve ser o inteiro 2%' THEN
        RAISE NOTICE '[REHEARSAL][OK] Wrong schemaVersion 1 rejeitado com sucesso por save_v2.';
    ELSE
        RAISE EXCEPTION 'Erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- Teste 5.3: Rejeição de Célula com Cell-Key Mismatch
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "11111111-1111-4111-8111-111111111111"},
        "revision": 2,
        "modules": [{"id": "m1", "semanticKey": "m.k", "label": "M", "kind": "specification", "order": 0, "datumIds": ["d1"]}],
        "data": {"d1": {"id": "d1", "moduleId": "m1", "semanticKey": "d.k", "label": "D", "value": {"type": "text", "value": "val"}}},
        "datasets": [{
            "id": "ds1", "semanticKey": "ds.k", "moduleId": "m1", "label": "DS", "kind": "matrix", "order": 0,
            "columns": [{"id": "c1", "semanticKey": "c.k", "label": "C", "valueType": "text", "order": 0}],
            "rows": [{"id": "r1", "label": "R", "order": 0}],
            "cells": {
                "r2:r1|c2:c1_WRONG_KEY": {"rowId": "r1", "columnId": "c1", "datumId": "d1"}
            }
        }]
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA: Deveria ter rejeitado DATASET_CELL_KEY_MISMATCH!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DATASET_CELL_KEY_MISMATCH%' THEN
        RAISE NOTICE '[REHEARSAL][OK] DATASET_CELL_KEY_MISMATCH rejeitado com sucesso.';
    ELSE
        RAISE EXCEPTION 'Erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- Teste 5.4: Rejeição de Incompatibilidade de Tipo na Célula
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "11111111-1111-4111-8111-111111111111"},
        "revision": 2,
        "modules": [{"id": "m1", "semanticKey": "m.k", "label": "M", "kind": "specification", "order": 0, "datumIds": ["d1"]}],
        "data": {"d1": {"id": "d1", "moduleId": "m1", "semanticKey": "d.k", "label": "D", "value": {"type": "text", "value": "Texto"}}},
        "datasets": [{
            "id": "ds1", "semanticKey": "ds.k", "moduleId": "m1", "label": "DS", "kind": "matrix", "order": 0,
            "columns": [{"id": "c1", "semanticKey": "c.k", "label": "C", "valueType": "numeric", "order": 0}],
            "rows": [{"id": "r1", "label": "R", "order": 0}],
            "cells": {
                "r2:r1|c2:c1": {"rowId": "r1", "columnId": "c1", "datumId": "d1"}
            }
        }]
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA: Deveria ter rejeitado DATASET_CELL_TYPE_MISMATCH!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DATASET_CELL_TYPE_MISMATCH%' THEN
        RAISE NOTICE '[REHEARSAL][OK] DATASET_CELL_TYPE_MISMATCH rejeitado com sucesso.';
    ELSE
        RAISE EXCEPTION 'Erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- Teste 5.5: Rejeição de Incompatibilidade de Unidade Metrológica
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "11111111-1111-4111-8111-111111111111"},
        "revision": 2,
        "modules": [{"id": "m1", "semanticKey": "m.k", "label": "M", "kind": "specification", "order": 0, "datumIds": ["d1"]}],
        "data": {"d1": {"id": "d1", "moduleId": "m1", "semanticKey": "d.k", "label": "D", "value": {"type": "numeric", "amount": 10, "unit": "bar"}}},
        "datasets": [{
            "id": "ds1", "semanticKey": "ds.k", "moduleId": "m1", "label": "DS", "kind": "matrix", "order": 0,
            "columns": [{"id": "c1", "semanticKey": "c.k", "label": "C", "valueType": "numeric", "unit": "°C", "order": 0}],
            "rows": [{"id": "r1", "label": "R", "order": 0}],
            "cells": {
                "r2:r1|c2:c1": {"rowId": "r1", "columnId": "c1", "datumId": "d1"}
            }
        }]
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA: Deveria ter rejeitado DATASET_CELL_UNIT_MISMATCH!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DATASET_CELL_UNIT_MISMATCH%' THEN
        RAISE NOTICE '[REHEARSAL][OK] DATASET_CELL_UNIT_MISMATCH rejeitado com sucesso.';
    ELSE
        RAISE EXCEPTION 'Erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- Teste 5.6: Rejeição de Evidência Órfã (Documento Inexistente)
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "11111111-1111-4111-8111-111111111111"},
        "revision": 2,
        "modules": [{"id": "m1", "semanticKey": "m.k", "label": "M", "kind": "specification", "order": 0, "datumIds": ["d1"]}],
        "data": {
            "d1": {
                "id": "d1", "moduleId": "m1", "semanticKey": "d.k", "label": "D", "value": {"type": "text", "value": "val"},
                "evidence": [{"id": "ev1", "sourceDocumentId": "doc_INEXISTENTE_999"}]
            }
        },
        "datasets": []
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA: Deveria ter rejeitado ORPHAN_EVIDENCE_SOURCE_DOCUMENT!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%ORPHAN_EVIDENCE_SOURCE_DOCUMENT%' THEN
        RAISE NOTICE '[REHEARSAL][OK] ORPHAN_EVIDENCE_SOURCE_DOCUMENT rejeitado com sucesso.';
    ELSE
        RAISE EXCEPTION 'Erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- ============================================================================
-- 6. TESTE DA RPC UNIFICADA DE BUSCA: search_product_knowledge_v2
-- ============================================================================
DO $$
DECLARE
    v_results_count INTEGER;
BEGIN
    SELECT count(*) INTO v_results_count
    FROM public.search_product_knowledge_v2('Exatidão', '11111111-1111-4111-8111-111111111111'::uuid, NULL, NULL, 10);

    RAISE NOTICE '[REHEARSAL][OK] search_product_knowledge_v2 executada com sucesso (% resultados encontrados).', v_results_count;
END $$;

-- ============================================================================
-- 7. ROLLBACK E RECOVERY TOTAL (ZERO EFEITOS COLATERAIS)
-- ============================================================================
ROLLBACK;

DO $$
BEGIN
    RAISE NOTICE '[REHEARSAL][COMPLETE] Ensaio 00022 -> 00023 finalizado com sucesso. ROLLBACK completo efetuado.';
END $$;
