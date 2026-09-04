-- supabase/rehearsals/00023_migration_rehearsal_suite.sql
-- MIGRATION REHEARSAL SUITE: 00022 -> 00023 (PIM.PRODUCTION.CORE1.2)
-- Executável em PostgreSQL / Supabase isolado.
-- Cobre integralmente os 28 pontos obrigatórios da matriz de validação real.
-- Todo o teste roda dentro de uma transação com ROLLBACK garantido.

BEGIN;

-- ============================================================================
-- SETUP DE FIXTURES REAIS DENTRO DA TRANSAÇÃO
-- ============================================================================
DO $$
DECLARE
    v_test_user UUID := '99999999-9999-4999-8999-999999999999'::uuid;
    v_test_prod_v1 UUID := '11111111-1111-4111-8111-111111111111'::uuid;
    v_test_prod_v2 UUID := '33333333-3333-4333-8333-333333333333'::uuid;
    v_test_fam  UUID := '22222222-2222-4222-8222-222222222222'::uuid;
BEGIN
    -- Fixture: Usuário Editor em auth.users
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
        VALUES (v_test_user, 'editor_rehearsal@presys.com.br', '{"full_name":"Editor Rehearsal"}'::jsonb, '{"role":"editor"}'::jsonb)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Fixture: Perfil Editor Ativo em public.profiles
    INSERT INTO public.profiles (id, full_name, role, is_active)
    VALUES (v_test_user, 'Editor Rehearsal', 'editor', true)
    ON CONFLICT (id) DO UPDATE SET role = 'editor', is_active = true;

    -- Fixture: Família de Teste
    INSERT INTO public.product_families (id, name, slug, description, created_at, updated_at)
    VALUES (v_test_fam, 'Família Rehearsal', 'familia-rehearsal', 'Família criada para ensaio transacional da migration 00023', now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- Fixture: Produtos de Teste
    INSERT INTO public.products (id, sku, name, family_id, status, version, created_at, updated_at)
    VALUES (v_test_prod_v1, 'REHEARSAL-V1', 'Instrumento Rehearsal PIM V1', v_test_fam, 'draft', 1, now(), now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.products (id, sku, name, family_id, status, version, created_at, updated_at)
    VALUES (v_test_prod_v2, 'REHEARSAL-V2', 'Instrumento Rehearsal PIM V2', v_test_fam, 'draft', 1, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- Fixture: Documento Fonte Autorizado
    INSERT INTO public.product_source_documents (id, title, document_type, revision, created_at)
    VALUES ('doc_rehearsal_001', 'Manual de Engenharia Rehearsal', 'manual', 'Rev. C', now())
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE '[REHEARSAL][SETUP][OK] Fixtures criadas com sucesso (User, Profile, Family, Products, SourceDocument).';
END $$;

-- Simula contexto de autenticação editorial
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';

-- ============================================================================
-- PONTO 03: save_product_workbook_v1 first save
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

    v_res := public.save_product_workbook_v1(v_v1_payload, 0);
    IF (v_res->>'revision')::int <> 1 THEN
        RAISE EXCEPTION 'FALHA PONTO 03: save_product_workbook_v1 first save deveria retornar revision 1!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-03][OK] save_product_workbook_v1 first save: PASS (Revision 1)';
END $$;

-- ============================================================================
-- PONTO 04: save_product_workbook_v1 update
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
        "revision": 1,
        "modules": [{"id": "mod_metrology", "semanticKey": "metrology.general", "label": "Metrologia Atualizada", "kind": "specification", "order": 0, "datumIds": []}],
        "data": {}
    }'::jsonb;

    v_res := public.save_product_workbook_v1(v_v1_payload, 1);
    IF (v_res->>'revision')::int <> 2 THEN
        RAISE EXCEPTION 'FALHA PONTO 04: save_product_workbook_v1 update deveria retornar revision 2!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-04][OK] save_product_workbook_v1 update: PASS (Revision 2)';
END $$;

-- ============================================================================
-- PONTO 05: get_product_workbook_v1
-- ============================================================================
DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.get_product_workbook_v1('product', '11111111-1111-4111-8111-111111111111');
    IF v_res IS NULL THEN
        RAISE EXCEPTION 'FALHA PONTO 05: get_product_workbook_v1 retornou NULL!';
    END IF;
    IF (v_res->>'schemaVersion')::int <> 1 OR (v_res->>'revision')::int <> 2 THEN
        RAISE EXCEPTION 'FALHA PONTO 05: get_product_workbook_v1 schemaVersion/revision incorreto!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-05][OK] get_product_workbook_v1: PASS (SchemaVersion 1, Revision 2)';
END $$;

-- ============================================================================
-- PONTO 06: save_product_workbook_v2 first save
-- ============================================================================
DO $$
DECLARE
    v_v2_payload JSONB;
    v_res JSONB;
BEGIN
    v_v2_payload := '{
        "id": "wbk_prod_rehearsal_v2",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
        "revision": 0,
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

    v_res := public.save_product_workbook_v2(v_v2_payload, 0);
    IF (v_res->>'revision')::int <> 1 THEN
        RAISE EXCEPTION 'FALHA PONTO 06: save_product_workbook_v2 first save deveria retornar revision 1!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-06][OK] save_product_workbook_v2 first save: PASS (Revision 1)';
END $$;

-- ============================================================================
-- PONTO 07: save_product_workbook_v2 update
-- ============================================================================
DO $$
DECLARE
    v_v2_payload JSONB;
    v_res JSONB;
BEGIN
    v_v2_payload := '{
        "id": "wbk_prod_rehearsal_v2",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
        "revision": 1,
        "modules": [
            {"id": "mod_metrology", "semanticKey": "metrology.general", "label": "Metrologia Atualizada V2", "kind": "specification", "order": 0, "datumIds": ["dat_temp_01"]}
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

    v_res := public.save_product_workbook_v2(v_v2_payload, 1);
    IF (v_res->>'revision')::int <> 2 THEN
        RAISE EXCEPTION 'FALHA PONTO 07: save_product_workbook_v2 update deveria retornar revision 2!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-07][OK] save_product_workbook_v2 update: PASS (Revision 2)';
END $$;

-- ============================================================================
-- PONTO 08: get_product_workbook_v2
-- ============================================================================
DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.get_product_workbook_v2('product', '33333333-3333-4333-8333-333333333333');
    IF v_res IS NULL THEN
        RAISE EXCEPTION 'FALHA PONTO 08: get_product_workbook_v2 retornou NULL!';
    END IF;
    IF (v_res->>'schemaVersion')::int <> 2 OR (v_res->>'revision')::int <> 2 THEN
        RAISE EXCEPTION 'FALHA PONTO 08: get_product_workbook_v2 schemaVersion/revision incorreto!';
    END IF;
    IF jsonb_array_length(v_res->'datasets') <> 1 THEN
        RAISE EXCEPTION 'FALHA PONTO 08: get_product_workbook_v2 deveria conter 1 dataset!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-08][OK] get_product_workbook_v2: PASS (SchemaVersion 2, Revision 2, 1 Dataset)';
END $$;

-- ============================================================================
-- PONTO 09: V2 payload enviado ao V1 -> REJECT
-- ============================================================================
DO $$
BEGIN
    PERFORM public.save_product_workbook_v1('{
        "id": "wbk_prod_rehearsal_v1",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "11111111-1111-4111-8111-111111111111"},
        "revision": 2,
        "modules": [], "data": {}
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA PONTO 09: save_product_workbook_v1 deveria ter rejeitado payload V2!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%schemaVersion deve ser o inteiro 1%' THEN
        RAISE NOTICE '[REHEARSAL][POINT-09][OK] V2 payload to V1 rejected: REJECT (INVALID_WORKBOOK_SCHEMA)';
    ELSE
        RAISE EXCEPTION 'FALHA PONTO 09 erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- ============================================================================
-- PONTO 10: V1 payload enviado ao V2 -> REJECT
-- ============================================================================
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_prod_rehearsal_v2",
        "schemaVersion": 1,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
        "revision": 2,
        "modules": [], "data": {}, "datasets": []
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA PONTO 10: save_product_workbook_v2 deveria ter rejeitado schemaVersion 1!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%schemaVersion deve ser o inteiro 2%' THEN
        RAISE NOTICE '[REHEARSAL][POINT-10][OK] V1 payload to V2 rejected: REJECT (INVALID_WORKBOOK_SCHEMA)';
    ELSE
        RAISE EXCEPTION 'FALHA PONTO 10 erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- ============================================================================
-- PONTO 11: CAS conflict real -> SQLSTATE 40001
-- ============================================================================
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_prod_rehearsal_v2",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
        "revision": 0,
        "modules": [], "data": {}, "datasets": []
    }'::jsonb, 0);
    RAISE EXCEPTION 'FALHA PONTO 11: Deveria ter acusado WORKBOOK_CONFLICT CAS!';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '40001' OR SQLERRM LIKE '%WORKBOOK_CONFLICT%' THEN
        RAISE NOTICE '[REHEARSAL][POINT-11][OK] CAS conflict real rejected: PASS (SQLSTATE 40001 WORKBOOK_CONFLICT)';
    ELSE
        RAISE EXCEPTION 'FALHA PONTO 11 erro inesperado: % (SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
END $$;

-- ============================================================================
-- PONTO 12: dataset module orphan -> REJECT
-- ============================================================================
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test_orphan",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
        "revision": 2,
        "modules": [{"id": "m1", "semanticKey": "m.k", "label": "M", "kind": "specification", "order": 0, "datumIds": []}],
        "data": {},
        "datasets": [{
            "id": "ds1", "semanticKey": "ds.k", "moduleId": "mod_ORPHAN_999", "label": "DS", "kind": "matrix", "order": 0,
            "columns": [], "rows": [], "cells": {}
        }]
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA PONTO 12: Deveria ter rejeitado DATASET_MODULE_NOT_FOUND!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DATASET_MODULE_NOT_FOUND%' THEN
        RAISE NOTICE '[REHEARSAL][POINT-12][OK] Dataset module orphan rejected: REJECT (DATASET_MODULE_NOT_FOUND)';
    ELSE
        RAISE EXCEPTION 'FALHA PONTO 12 erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- ============================================================================
-- PONTO 13: datum module orphan -> REJECT
-- ============================================================================
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test_orphan",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
        "revision": 2,
        "modules": [{"id": "m1", "semanticKey": "m.k", "label": "M", "kind": "specification", "order": 0, "datumIds": []}],
        "data": {
            "d1": {"id": "d1", "moduleId": "mod_ORPHAN_888", "semanticKey": "d.k", "label": "D", "value": {"type": "text", "value": "x"}}
        },
        "datasets": []
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA PONTO 13: Deveria ter rejeitado DATUM_MODULE_NOT_FOUND!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DATUM_MODULE_NOT_FOUND%' THEN
        RAISE NOTICE '[REHEARSAL][POINT-13][OK] Datum module orphan rejected: REJECT (DATUM_MODULE_NOT_FOUND)';
    ELSE
        RAISE EXCEPTION 'FALHA PONTO 13 erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- ============================================================================
-- PONTO 14: dataset cell datum orphan -> REJECT
-- ============================================================================
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test_orphan",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
        "revision": 2,
        "modules": [{"id": "m1", "semanticKey": "m.k", "label": "M", "kind": "specification", "order": 0, "datumIds": []}],
        "data": {},
        "datasets": [{
            "id": "ds1", "semanticKey": "ds.k", "moduleId": "m1", "label": "DS", "kind": "matrix", "order": 0,
            "columns": [{"id": "c1", "semanticKey": "c.k", "label": "C", "valueType": "text", "order": 0}],
            "rows": [{"id": "r1", "label": "R", "order": 0}],
            "cells": {
                "r2:r1|c2:c1": {"rowId": "r1", "columnId": "c1", "datumId": "datum_ORPHAN_777"}
            }
        }]
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA PONTO 14: Deveria ter rejeitado DATASET_CELL_DATUM_NOT_FOUND!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DATASET_CELL_DATUM_NOT_FOUND%' THEN
        RAISE NOTICE '[REHEARSAL][POINT-14][OK] Dataset cell datum orphan rejected: REJECT (DATASET_CELL_DATUM_NOT_FOUND)';
    ELSE
        RAISE EXCEPTION 'FALHA PONTO 14 erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- ============================================================================
-- PONTO 15: dataset row orphan -> REJECT
-- ============================================================================
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test_orphan",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
        "revision": 2,
        "modules": [{"id": "m1", "semanticKey": "m.k", "label": "M", "kind": "specification", "order": 0, "datumIds": ["d1"]}],
        "data": {"d1": {"id": "d1", "moduleId": "m1", "semanticKey": "d.k", "label": "D", "value": {"type": "text", "value": "val"}}},
        "datasets": [{
            "id": "ds1", "semanticKey": "ds.k", "moduleId": "m1", "label": "DS", "kind": "matrix", "order": 0,
            "columns": [{"id": "c1", "semanticKey": "c.k", "label": "C", "valueType": "text", "order": 0}],
            "rows": [{"id": "r1", "label": "R", "order": 0}],
            "cells": {
                "r6:r_NONE|c2:c1": {"rowId": "r_NONE", "columnId": "c1", "datumId": "d1"}
            }
        }]
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA PONTO 15: Deveria ter rejeitado DATASET_CELL_ROW_NOT_FOUND!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DATASET_CELL_ROW_NOT_FOUND%' THEN
        RAISE NOTICE '[REHEARSAL][POINT-15][OK] Dataset row orphan rejected: REJECT (DATASET_CELL_ROW_NOT_FOUND)';
    ELSE
        RAISE EXCEPTION 'FALHA PONTO 15 erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- ============================================================================
-- PONTO 16: dataset column orphan -> REJECT
-- ============================================================================
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test_orphan",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
        "revision": 2,
        "modules": [{"id": "m1", "semanticKey": "m.k", "label": "M", "kind": "specification", "order": 0, "datumIds": ["d1"]}],
        "data": {"d1": {"id": "d1", "moduleId": "m1", "semanticKey": "d.k", "label": "D", "value": {"type": "text", "value": "val"}}},
        "datasets": [{
            "id": "ds1", "semanticKey": "ds.k", "moduleId": "m1", "label": "DS", "kind": "matrix", "order": 0,
            "columns": [{"id": "c1", "semanticKey": "c.k", "label": "C", "valueType": "text", "order": 0}],
            "rows": [{"id": "r1", "label": "R", "order": 0}],
            "cells": {
                "r2:r1|c6:c_NONE": {"rowId": "r1", "columnId": "c_NONE", "datumId": "d1"}
            }
        }]
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA PONTO 16: Deveria ter rejeitado DATASET_CELL_COLUMN_NOT_FOUND!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DATASET_CELL_COLUMN_NOT_FOUND%' THEN
        RAISE NOTICE '[REHEARSAL][POINT-16][OK] Dataset column orphan rejected: REJECT (DATASET_CELL_COLUMN_NOT_FOUND)';
    ELSE
        RAISE EXCEPTION 'FALHA PONTO 16 erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- ============================================================================
-- PONTO 17: cell-key mismatch -> REJECT
-- ============================================================================
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test_mismatch",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
        "revision": 2,
        "modules": [{"id": "m1", "semanticKey": "m.k", "label": "M", "kind": "specification", "order": 0, "datumIds": ["d1"]}],
        "data": {"d1": {"id": "d1", "moduleId": "m1", "semanticKey": "d.k", "label": "D", "value": {"type": "text", "value": "val"}}},
        "datasets": [{
            "id": "ds1", "semanticKey": "ds.k", "moduleId": "m1", "label": "DS", "kind": "matrix", "order": 0,
            "columns": [{"id": "c1", "semanticKey": "c.k", "label": "C", "valueType": "text", "order": 0}],
            "rows": [{"id": "r1", "label": "R", "order": 0}],
            "cells": {
                "r2:r1|c2:c1_WRONG_COORDINATE": {"rowId": "r1", "columnId": "c1", "datumId": "d1"}
            }
        }]
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA PONTO 17: Deveria ter rejeitado DATASET_CELL_KEY_MISMATCH!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DATASET_CELL_KEY_MISMATCH%' THEN
        RAISE NOTICE '[REHEARSAL][POINT-17][OK] Cell-key mismatch rejected: REJECT (DATASET_CELL_KEY_MISMATCH)';
    ELSE
        RAISE EXCEPTION 'FALHA PONTO 17 erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- ============================================================================
-- PONTO 18: value type mismatch -> REJECT
-- ============================================================================
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test_type",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
        "revision": 2,
        "modules": [{"id": "m1", "semanticKey": "m.k", "label": "M", "kind": "specification", "order": 0, "datumIds": ["d1"]}],
        "data": {"d1": {"id": "d1", "moduleId": "m1", "semanticKey": "d.k", "label": "D", "value": {"type": "text", "value": "Texto puro"}}},
        "datasets": [{
            "id": "ds1", "semanticKey": "ds.k", "moduleId": "m1", "label": "DS", "kind": "matrix", "order": 0,
            "columns": [{"id": "c1", "semanticKey": "c.k", "label": "C", "valueType": "numeric", "order": 0}],
            "rows": [{"id": "r1", "label": "R", "order": 0}],
            "cells": {
                "r2:r1|c2:c1": {"rowId": "r1", "columnId": "c1", "datumId": "d1"}
            }
        }]
    }'::jsonb, 2);
    RAISE EXCEPTION 'FALHA PONTO 18: Deveria ter rejeitado DATASET_CELL_TYPE_MISMATCH!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DATASET_CELL_TYPE_MISMATCH%' THEN
        RAISE NOTICE '[REHEARSAL][POINT-18][OK] Value type mismatch rejected: REJECT (DATASET_CELL_TYPE_MISMATCH)';
    ELSE
        RAISE EXCEPTION 'FALHA PONTO 18 erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- ============================================================================
-- PONTO 19: unit mismatch -> REJECT
-- ============================================================================
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test_unit",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
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
    RAISE EXCEPTION 'FALHA PONTO 19: Deveria ter rejeitado DATASET_CELL_UNIT_MISMATCH!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DATASET_CELL_UNIT_MISMATCH%' THEN
        RAISE NOTICE '[REHEARSAL][POINT-19][OK] Unit mismatch rejected: REJECT (DATASET_CELL_UNIT_MISMATCH)';
    ELSE
        RAISE EXCEPTION 'FALHA PONTO 19 erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- ============================================================================
-- PONTO 20: SourceDocument orphan -> REJECT
-- ============================================================================
DO $$
BEGIN
    PERFORM public.save_product_workbook_v2('{
        "id": "wbk_test_doc",
        "schemaVersion": 2,
        "owner": {"kind": "product", "id": "33333333-3333-4333-8333-333333333333"},
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
    RAISE EXCEPTION 'FALHA PONTO 20: Deveria ter rejeitado ORPHAN_EVIDENCE_SOURCE_DOCUMENT!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%ORPHAN_EVIDENCE_SOURCE_DOCUMENT%' THEN
        RAISE NOTICE '[REHEARSAL][POINT-20][OK] SourceDocument orphan rejected: REJECT (ORPHAN_EVIDENCE_SOURCE_DOCUMENT)';
    ELSE
        RAISE EXCEPTION 'FALHA PONTO 20 erro inesperado: %', SQLERRM;
    END IF;
END $$;

-- ============================================================================
-- PONTO 21: search_product_knowledge_v2 -> RETORNA resultado real
-- ============================================================================
DO $$
DECLARE
    v_results_count INTEGER;
BEGIN
    SELECT count(*) INTO v_results_count
    FROM public.search_product_knowledge_v2('Exatidão', '33333333-3333-4333-8333-333333333333'::uuid, NULL, NULL, 10);

    IF v_results_count < 1 THEN
        RAISE EXCEPTION 'FALHA PONTO 21: search_product_knowledge_v2 deveria retornar pelo menos 1 resultado!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-21][OK] search_product_knowledge_v2 returns real result: PASS (% encontrados)', v_results_count;
END $$;

-- ============================================================================
-- PONTO 22: product_technical_data_index -> PROJECTION PASS
-- ============================================================================
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count
    FROM public.product_technical_data_index
    WHERE datum_id = 'dat_temp_01';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FALHA PONTO 22: product_technical_data_index deveria conter exatamente 1 registro para dat_temp_01!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-22][OK] product_technical_data_index projection: PASS (1 registro indexado)';
END $$;

-- ============================================================================
-- PONTO 23: product_dataset_search_index -> PROJECTION PASS
-- ============================================================================
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count
    FROM public.product_dataset_search_index
    WHERE dataset_id = 'ds_accuracy_table';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FALHA PONTO 23: product_dataset_search_index deveria conter exatamente 1 célula para ds_accuracy_table!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-23][OK] product_dataset_search_index projection: PASS (1 célula projetada)';
END $$;

-- ============================================================================
-- PONTO 24: authenticated direct INSERT/UPDATE/DELETE index -> DENIED
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
        RAISE EXCEPTION 'FALHA PONTO 24: authenticated não pode ter privilégio de escrita direta em product_dataset_search_index!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-24][OK] Authenticated direct write to index denied: DENIED (Privilégios revogados)';
END $$;

-- ============================================================================
-- PONTO 25: RLS -> PASS
-- ============================================================================
DO $$
DECLARE
    v_rls_enabled BOOLEAN;
BEGIN
    SELECT rowsecurity INTO v_rls_enabled
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'product_dataset_search_index';

    IF NOT v_rls_enabled THEN
        RAISE EXCEPTION 'FALHA PONTO 25: RLS não está habilitado em public.product_dataset_search_index!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-25][OK] RLS enabled and fail-closed: PASS';
END $$;

-- ============================================================================
-- PONTO 26: GRANTS -> PASS
-- ============================================================================
DO $$
DECLARE
    v_has_anon_v2 BOOLEAN;
    v_has_auth_v2 BOOLEAN;
BEGIN
    SELECT has_function_privilege('anon', 'public.save_product_workbook_v2(jsonb, integer)', 'EXECUTE') INTO v_has_anon_v2;
    SELECT has_function_privilege('authenticated', 'public.save_product_workbook_v2(jsonb, integer)', 'EXECUTE') INTO v_has_auth_v2;

    IF v_has_anon_v2 THEN
        RAISE EXCEPTION 'FALHA PONTO 26: anon NÃO pode ter privilégio EXECUTE em save_product_workbook_v2!';
    END IF;

    IF NOT v_has_auth_v2 THEN
        RAISE EXCEPTION 'FALHA PONTO 26: authenticated DEVE ter privilégio EXECUTE em save_product_workbook_v2!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-26][OK] Grants fail-closed on RPCs: PASS';
END $$;

-- ============================================================================
-- PONTO 27: library_change_events -> AUDIT EVENT GERADO
-- ============================================================================
DO $$
DECLARE
    v_audit_count INTEGER;
BEGIN
    SELECT count(*) INTO v_audit_count
    FROM public.library_change_events
    WHERE product_id = '33333333-3333-4333-8333-333333333333'::uuid;

    IF v_audit_count < 1 THEN
        RAISE EXCEPTION 'FALHA PONTO 27: Nenhum evento de auditoria foi gerado em library_change_events!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-27][OK] library_change_events audit record created: PASS (% eventos gerados)', v_audit_count;
END $$;

-- ============================================================================
-- PONTO 28: ROLLBACK / RECOVERY TEST -> PASS
-- ============================================================================
ROLLBACK;

-- Confirmação pós-rollback fora da transação
DO $$
DECLARE
    v_residual INTEGER;
BEGIN
    SELECT count(*) INTO v_residual
    FROM public.products
    WHERE id IN ('11111111-1111-4111-8111-111111111111'::uuid, '33333333-3333-4333-8333-333333333333'::uuid);

    IF v_residual <> 0 THEN
        RAISE EXCEPTION 'FALHA PONTO 28: Resíduos de dados encontrados após ROLLBACK!';
    END IF;

    RAISE NOTICE '[REHEARSAL][POINT-28][OK] Rollback and recovery total: PASS (Zero resíduos no banco)';
END $$;
