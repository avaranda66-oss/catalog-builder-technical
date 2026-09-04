-- ============================================================================
-- MIGRATION 00023: PRODUCT DATASET SEARCH INDEX & V2 PERSISTENCE RPC (PIM CORE V1)
-- STATUS: READY FOR ARCHITECT REVIEW — DO NOT APPLY LIVE YET (PRE-FLIGHT ONLY)
--
-- Core Invariants:
-- 1. SCHEMAVERSION 2 ESTRITO: save_product_workbook_v2 exige estritamente schemaVersion = 2.
--    save_product_workbook_v1 permanece intacto para clientes legados (schemaVersion = 1).
-- 2. SINGLE SOURCE OF TRUTH (EMENDA 2): Células de datasets armazenam exclusivamente { rowId, columnId, datumId }.
--    Todo valor, unidade, evidência e status reside em TechnicalDatum.
--    save_product_workbook_v2 valida que todo datumId referenciado em datasets existe no mapa "data".
-- 3. CHAVES DETERMINÍSTICAS (EMENDA 3): Células são indexadas e validadas contra getDatasetCellKey.
-- 4. ÍNDICE DE BUSCA DE DATASETS (EMENDA 6 & 8): Tabela public.product_dataset_search_index
--    projeta dimensionalidade e texto das células de tabelas para consultas rápidas e busca analítica.
-- 5. CONTROLE DE CONCORRÊNCIA ESTRITO (CAS): p_expected_revision é obrigatório.
--    Mismatch de revisão gera exceção SQLSTATE 40001 / WORKBOOK_CONFLICT.
-- 6. SERIALIZAÇÃO CONCORRENTE: Bloqueio FOR UPDATE na entidade owner (produto ou família).
-- 7. AUDITORIA TRANSACIONAL: Toda gravação gera registro em library_change_events.
-- ============================================================================

-- 1. TABELA DE ÍNDICE DE BUSCA E PROJEÇÃO DE DATASETS
CREATE TABLE IF NOT EXISTS public.product_dataset_search_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workbook_id UUID NOT NULL REFERENCES public.product_workbooks(id) ON DELETE CASCADE,
    dataset_id TEXT NOT NULL,
    dataset_semantic_key TEXT NOT NULL,
    module_id TEXT NOT NULL,
    dataset_label TEXT NOT NULL,
    dataset_kind TEXT NOT NULL,
    row_id TEXT NOT NULL,
    row_semantic_key TEXT,
    row_label TEXT,
    column_id TEXT NOT NULL,
    column_semantic_key TEXT NOT NULL,
    column_label TEXT NOT NULL,
    column_value_type TEXT NOT NULL,
    datum_id TEXT NOT NULL,
    datum_status TEXT NOT NULL,
    projected_text TEXT,
    projected_numeric NUMERIC,
    projected_unit TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT uq_dataset_cell_index UNIQUE (workbook_id, dataset_id, row_id, column_id)
);

-- 2. ÍNDICES DE PERFORMANCE PARA BUSCA DE DATASETS
CREATE INDEX IF NOT EXISTS idx_dataset_search_wb 
    ON public.product_dataset_search_index(workbook_id);

CREATE INDEX IF NOT EXISTS idx_dataset_search_ds 
    ON public.product_dataset_search_index(dataset_id);

CREATE INDEX IF NOT EXISTS idx_dataset_search_datum 
    ON public.product_dataset_search_index(datum_id);

CREATE INDEX IF NOT EXISTS idx_dataset_search_text 
    ON public.product_dataset_search_index USING gin(to_tsvector('simple', COALESCE(dataset_label, '') || ' ' || COALESCE(column_label, '') || ' ' || COALESCE(row_label, '') || ' ' || COALESCE(projected_text, '')));

-- 3. RLS EM public.product_dataset_search_index (FAIL-CLOSED)
ALTER TABLE public.product_dataset_search_index ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_dataset_search_select_policy ON public.product_dataset_search_index;
CREATE POLICY product_dataset_search_select_policy ON public.product_dataset_search_index
    FOR SELECT
    TO authenticated
    USING (public.team_role() IS NOT NULL);

REVOKE INSERT, UPDATE, DELETE ON public.product_dataset_search_index FROM PUBLIC, anon, authenticated;

-- 4. RPC CANÔNICA DE GRAVAÇÃO V2: save_product_workbook_v2
CREATE OR REPLACE FUNCTION public.save_product_workbook_v2(
    p_workbook JSONB,
    p_expected_revision INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := public.require_document_editor_v1();
    v_actor_email TEXT := '';
    v_actor_name TEXT := '';
    v_owner_kind TEXT;
    v_owner_id_text TEXT;
    v_owner_id UUID;
    v_existing public.product_workbooks;
    v_new_revision INTEGER;
    v_saved_id UUID;
    v_item RECORD;
    v_evidence_item RECORD;
    v_source_exists BOOLEAN;
    v_ds RECORD;
    v_cell RECORD;
    v_datum_exists BOOLEAN;
    v_mod_exists BOOLEAN;
    v_datum_val JSONB;
    v_col_def RECORD;
    v_row_def RECORD;
    v_proj_text TEXT;
    v_proj_num NUMERIC;
    v_proj_unit TEXT;
BEGIN
    -- 1. Validação estrita do parâmetro CAS (sem default NULL)
    IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
        RAISE EXCEPTION 'CAS_REVISION_REQUIRED: p_expected_revision é obrigatório e deve ser um inteiro >= 0.'
            USING ERRCODE = '22023';
    END IF;

    -- 2. Validação estrutural básica do payload JSON
    IF p_workbook IS NULL OR jsonb_typeof(p_workbook) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_PAYLOAD: p_workbook deve ser um objeto JSON.'
            USING ERRCODE = '22023';
    END IF;

    -- 3. Validação do ID do workbook
    IF NOT (p_workbook ? 'id') OR jsonb_typeof(p_workbook->'id') IS DISTINCT FROM 'string' OR trim(p_workbook->>'id') = '' THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_ID: id é obrigatório e deve ser string não vazia.'
            USING ERRCODE = '22023';
    END IF;

    -- 4. Validação estrita de schemaVersion (apenas inteiro JSON 2) — EMENDA 1
    IF NOT (p_workbook ? 'schemaVersion') OR jsonb_typeof(p_workbook->'schemaVersion') IS DISTINCT FROM 'number' OR (p_workbook->>'schemaVersion') IS DISTINCT FROM '2' THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_SCHEMA: schemaVersion deve ser o inteiro 2 para a API v2.'
            USING ERRCODE = '22023';
    END IF;

    -- 5. Validação estrutural de owner
    IF NOT (p_workbook ? 'owner') OR jsonb_typeof(p_workbook->'owner') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_OWNER: owner deve ser um objeto JSON.'
            USING ERRCODE = '22023';
    END IF;

    v_owner_kind    := p_workbook->'owner'->>'kind';
    v_owner_id_text := p_workbook->'owner'->>'id';

    IF v_owner_kind IS NULL OR v_owner_kind NOT IN ('product', 'family') THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_OWNER_KIND: O campo owner.kind deve ser "product" ou "family".'
            USING ERRCODE = '22023';
    END IF;

    IF v_owner_id_text IS NULL OR NOT (v_owner_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_OWNER_ID: O campo owner.id "%" não é um UUID válido.', v_owner_id_text
            USING ERRCODE = '22023';
    END IF;
    v_owner_id := v_owner_id_text::uuid;

    -- 6. Validação estrita de revision no payload
    IF NOT (p_workbook ? 'revision') OR jsonb_typeof(p_workbook->'revision') IS DISTINCT FROM 'number' OR NOT ((p_workbook->>'revision') ~ '^[0-9]+$') THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_REVISION: revision deve ser um inteiro >= 0.'
            USING ERRCODE = '22023';
    END IF;

    IF (p_workbook->>'revision')::integer IS DISTINCT FROM p_expected_revision THEN
        RAISE EXCEPTION 'WORKBOOK_PAYLOAD_REVISION_MISMATCH: revision no payload (%) difere de p_expected_revision (%).',
            (p_workbook->>'revision')::integer, p_expected_revision
            USING ERRCODE = '22023';
    END IF;

    -- 7. Validação estrita de modules, data e datasets
    IF NOT (p_workbook ? 'modules') OR jsonb_typeof(p_workbook->'modules') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_MODULES: modules deve ser um array JSON.'
            USING ERRCODE = '22023';
    END IF;

    IF NOT (p_workbook ? 'data') OR jsonb_typeof(p_workbook->'data') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_DATA: data deve ser um objeto JSON.'
            USING ERRCODE = '22023';
    END IF;

    IF NOT (p_workbook ? 'datasets') OR jsonb_typeof(p_workbook->'datasets') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_DATASETS: datasets deve ser um array JSON na v2.'
            USING ERRCODE = '22023';
    END IF;

    -- 8. Validação de Evidências Órfãs (Fail-Closed)
    FOR v_evidence_item IN
        SELECT DISTINCT ev->>'sourceDocumentId' AS doc_id
        FROM jsonb_each(p_workbook->'data') d,
             jsonb_array_elements(COALESCE(d.value->'evidence', '[]'::jsonb)) ev
        WHERE ev->>'sourceDocumentId' IS NOT NULL
        UNION
        SELECT DISTINCT ev->>'sourceDocumentId' AS doc_id
        FROM jsonb_each(COALESCE(p_workbook->'overrides', '{}'::jsonb)) ov,
             jsonb_array_elements(COALESCE(ov.value->'evidence', '[]'::jsonb)) ev
        WHERE ev->>'sourceDocumentId' IS NOT NULL
    LOOP
        SELECT EXISTS(
            SELECT 1 FROM public.product_source_documents WHERE id = v_evidence_item.doc_id
        ) INTO v_source_exists;

        IF NOT v_source_exists THEN
            RAISE EXCEPTION 'ORPHAN_EVIDENCE_SOURCE_DOCUMENT: Evidência referencia sourceDocumentId inexistente "%".', v_evidence_item.doc_id
                USING ERRCODE = '23503';
        END IF;
    END LOOP;

    -- 9. Validação C9 de TechnicalDatasets & Integridade Server-Side (PIM.PRODUCTION.CORE1.1)
    -- 9.1. Valida que todo datum em workbook.data referencia moduleId existente
    FOR v_item IN
        SELECT d.key AS d_id, d.value AS d_val
        FROM jsonb_each(p_workbook->'data') d
    LOOP
        SELECT EXISTS(
            SELECT 1 FROM jsonb_array_elements(p_workbook->'modules') m
            WHERE m->>'id' = v_item.d_val->>'moduleId'
        ) INTO v_mod_exists;

        IF NOT v_mod_exists THEN
            RAISE EXCEPTION 'DATUM_MODULE_NOT_FOUND: Dado "%" vinculado a moduleId inexistente "%".',
                v_item.d_id, v_item.d_val->>'moduleId'
                USING ERRCODE = '23503';
        END IF;
    END LOOP;

    -- 9.2. Valida duplicidade de dataset IDs e semanticKeys
    IF (SELECT count(DISTINCT ds->>'id') FROM jsonb_array_elements(p_workbook->'datasets') ds)
       < (SELECT count(*) FROM jsonb_array_elements(p_workbook->'datasets')) THEN
        RAISE EXCEPTION 'DUPLICATE_DATASET_ID: Existem datasets com IDs duplicados no payload.'
            USING ERRCODE = '23505';
    END IF;

    IF (SELECT count(DISTINCT ds->>'semanticKey') FROM jsonb_array_elements(p_workbook->'datasets') ds)
       < (SELECT count(*) FROM jsonb_array_elements(p_workbook->'datasets')) THEN
        RAISE EXCEPTION 'DUPLICATE_DATASET_SEMANTIC_KEY: Existem datasets com semanticKeys duplicadas no payload.'
            USING ERRCODE = '23505';
    END IF;

    -- 9.3. Itera sobre cada dataset e valida integridade interna profunda
    FOR v_ds IN
        SELECT ds.value AS val
        FROM jsonb_array_elements(p_workbook->'datasets') ds
    LOOP
        -- Valida vínculo com módulo existente
        SELECT EXISTS(
            SELECT 1 FROM jsonb_array_elements(p_workbook->'modules') m
            WHERE m->>'id' = v_ds.val->>'moduleId'
        ) INTO v_mod_exists;

        IF NOT v_mod_exists THEN
            RAISE EXCEPTION 'DATASET_MODULE_NOT_FOUND: Dataset "%" vinculado a moduleId inexistente "%".',
                v_ds.val->>'label', v_ds.val->>'moduleId'
                USING ERRCODE = '23503';
        END IF;

        -- Valida duplicidade de column IDs
        IF (SELECT count(DISTINCT c->>'id') FROM jsonb_array_elements(COALESCE(v_ds.val->'columns', '[]'::jsonb)) c)
           < (SELECT count(*) FROM jsonb_array_elements(COALESCE(v_ds.val->'columns', '[]'::jsonb))) THEN
            RAISE EXCEPTION 'DUPLICATE_COLUMN_ID: Dataset "%" contém colunas com IDs duplicados.', v_ds.val->>'label'
                USING ERRCODE = '23505';
        END IF;

        -- Valida duplicidade de column semanticKeys
        IF (SELECT count(DISTINCT c->>'semanticKey') FROM jsonb_array_elements(COALESCE(v_ds.val->'columns', '[]'::jsonb)) c)
           < (SELECT count(*) FROM jsonb_array_elements(COALESCE(v_ds.val->'columns', '[]'::jsonb))) THEN
            RAISE EXCEPTION 'DUPLICATE_COLUMN_SEMANTIC_KEY: Dataset "%" contém colunas com semanticKeys duplicadas.', v_ds.val->>'label'
                USING ERRCODE = '23505';
        END IF;

        -- Valida duplicidade de row IDs
        IF (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(COALESCE(v_ds.val->'rows', '[]'::jsonb)) r)
           < (SELECT count(*) FROM jsonb_array_elements(COALESCE(v_ds.val->'rows', '[]'::jsonb))) THEN
            RAISE EXCEPTION 'DUPLICATE_ROW_ID: Dataset "%" contém linhas com IDs duplicados.', v_ds.val->>'label'
                USING ERRCODE = '23505';
        END IF;

        -- Valida cada célula da grade
        FOR v_cell IN
            SELECT c.key AS cell_key, c.value AS cell_val
            FROM jsonb_each(COALESCE(v_ds.val->'cells', '{}'::jsonb)) c
        LOOP
            -- Valida coordenadas da chave da célula: formato determinístico r{len}:{rowId}|c{len}:{columnId}
            IF v_cell.cell_key IS DISTINCT FROM format('r%s:%s|c%s:%s',
                length(v_cell.cell_val->>'rowId'), v_cell.cell_val->>'rowId',
                length(v_cell.cell_val->>'columnId'), v_cell.cell_val->>'columnId') THEN
                RAISE EXCEPTION 'DATASET_CELL_KEY_MISMATCH: Chave de célula "%" não corresponde às coordenadas declaradas (rowId="%", columnId="%").',
                    v_cell.cell_key, v_cell.cell_val->>'rowId', v_cell.cell_val->>'columnId'
                    USING ERRCODE = '22023';
            END IF;

            -- Valida existência de rowId nas linhas do dataset
            IF NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(v_ds.val->'rows', '[]'::jsonb)) r
                WHERE r->>'id' = v_cell.cell_val->>'rowId'
            ) THEN
                RAISE EXCEPTION 'DATASET_CELL_ROW_NOT_FOUND: Célula "%" referencia rowId inexistente "%" no dataset.',
                    v_cell.cell_key, v_cell.cell_val->>'rowId'
                    USING ERRCODE = '23503';
            END IF;

            -- Valida existência de columnId nas colunas do dataset
            SELECT * INTO v_col_def
            FROM (
                SELECT 
                    c->>'id' AS c_id,
                    c->>'valueType' AS c_vtype,
                    c->>'unit' AS c_unit
                FROM jsonb_array_elements(COALESCE(v_ds.val->'columns', '[]'::jsonb)) c
                WHERE c->>'id' = v_cell.cell_val->>'columnId'
            ) sub;

            IF v_col_def.c_id IS NULL THEN
                RAISE EXCEPTION 'DATASET_CELL_COLUMN_NOT_FOUND: Célula "%" referencia columnId inexistente "%" no dataset.',
                    v_cell.cell_key, v_cell.cell_val->>'columnId'
                    USING ERRCODE = '23503';
            END IF;

            -- Valida existência de datumId em data
            IF NOT (p_workbook->'data' ? (v_cell.cell_val->>'datumId')) THEN
                RAISE EXCEPTION 'DATASET_CELL_DATUM_NOT_FOUND: Célula "%" referencia datumId inexistente "%" no mapa de dados.',
                    v_cell.cell_key, v_cell.cell_val->>'datumId'
                    USING ERRCODE = '23503';
            END IF;

            v_datum_val := p_workbook->'data'->(v_cell.cell_val->>'datumId');

            -- Valida paridade de tipo (datum.value.type == column.valueType)
            IF (v_datum_val->'value'->>'type') IS DISTINCT FROM v_col_def.c_vtype THEN
                RAISE EXCEPTION 'DATASET_CELL_TYPE_MISMATCH: Tipo do valor técnico "%" difere do tipo da coluna "%" na célula "%".',
                    v_datum_val->'value'->>'type', v_col_def.c_vtype, v_cell.cell_key
                    USING ERRCODE = '22023';
            END IF;

            -- Valida compatibilidade de unidade metrológica quando column.unit estiver definida
            IF v_col_def.c_unit IS NOT NULL AND v_col_def.c_unit <> '' THEN
                IF (v_datum_val->'value'->>'unit') IS DISTINCT FROM v_col_def.c_unit THEN
                    RAISE EXCEPTION 'DATASET_CELL_UNIT_MISMATCH: Unidade do valor técnico "%" incompatível com a unidade da coluna "%" na célula "%".',
                        COALESCE(v_datum_val->'value'->>'unit', 'sem unidade'), v_col_def.c_unit, v_cell.cell_key
                        USING ERRCODE = '22023';
                END IF;
            END IF;
        END LOOP;
    END LOOP;

    -- 10. Bloqueio Pessimista na Entidade Owner (Prevenção de Concorrência)
    IF v_owner_kind = 'product' THEN
        PERFORM 1 FROM public.products WHERE id = v_owner_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Produto com ID "%" não encontrado.', v_owner_id_text
                USING ERRCODE = '23503';
        END IF;
    ELSIF v_owner_kind = 'family' THEN
        PERFORM 1 FROM public.product_families WHERE id = v_owner_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'FAMILY_NOT_FOUND: Família com ID "%" não encontrada.', v_owner_id_text
                USING ERRCODE = '23503';
        END IF;
    END IF;

    -- 11. Validação CAS e Concorrência Otimista
    SELECT * INTO v_existing
    FROM public.product_workbooks
    WHERE owner_kind = v_owner_kind
      AND owner_id = v_owner_id
    FOR UPDATE;

    IF v_existing.id IS NOT NULL THEN
        IF v_existing.revision IS DISTINCT FROM p_expected_revision THEN
            RAISE EXCEPTION 'WORKBOOK_CONFLICT: Revisão esperada (%) diverge da revisão atual do servidor (%).'
                , p_expected_revision, v_existing.revision
                USING ERRCODE = '40001',
                      DETAIL = format('{"expectedRevision":%s,"actualRevision":%s,"ownerIdentity":"%s:%s"}', p_expected_revision, v_existing.revision, v_owner_kind, v_owner_id);
        END IF;

        v_new_revision := v_existing.revision + 1;
        v_saved_id := v_existing.id;

        UPDATE public.product_workbooks
        SET revision = v_new_revision,
            full_payload = jsonb_set(
                jsonb_set(p_workbook, '{revision}', to_jsonb(v_new_revision), false),
                '{schemaVersion}', to_jsonb(2), false
            ),
            updated_by = v_actor,
            updated_at = now()
        WHERE id = v_saved_id;
    ELSE
        IF p_expected_revision IS DISTINCT FROM 0 THEN
            RAISE EXCEPTION 'WORKBOOK_CONFLICT: Workbook não existe; p_expected_revision deve ser 0 (recebido: %).'
                , p_expected_revision
                USING ERRCODE = '40001',
                      DETAIL = format('{"expectedRevision":%s,"actualRevision":null,"ownerIdentity":"%s:%s"}', p_expected_revision, v_owner_kind, v_owner_id);
        END IF;

        v_new_revision := 1;

        INSERT INTO public.product_workbooks (
            id,
            owner_kind,
            owner_id,
            revision,
            full_payload,
            created_by,
            updated_by,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_owner_kind,
            v_owner_id,
            v_new_revision,
            jsonb_set(
                jsonb_set(p_workbook, '{revision}', to_jsonb(v_new_revision), false),
                '{schemaVersion}', to_jsonb(2), false
            ),
            v_actor,
            v_actor,
            now(),
            now()
        )
        RETURNING id INTO v_saved_id;
    END IF;

    -- 12. Atualização Atômica do Índice de Dados Técnicos (public.product_technical_data_index)
    DELETE FROM public.product_technical_data_index WHERE workbook_id = v_saved_id;

    FOR v_item IN
        SELECT
            d.key AS d_id,
            d.value->>'semanticKey' AS sem_key,
            d.value->>'moduleId' AS mod_id,
            d.value->>'label' AS lbl,
            d.value->'value'->>'type' AS v_type,
            d.value->'value' AS r_val,
            d.value->>'status' AS st
        FROM jsonb_each(p_workbook->'data') d
    LOOP
        INSERT INTO public.product_technical_data_index (
            workbook_id,
            datum_id,
            semantic_key,
            module_id,
            label,
            value_type,
            raw_value,
            text_value,
            numeric_value,
            boolean_value,
            lower_value,
            upper_value,
            unit,
            enum_code,
            technical_token,
            asset_id,
            target_product_id,
            unknown_reason,
            status,
            updated_at
        ) VALUES (
            v_saved_id,
            v_item.d_id,
            v_item.sem_key,
            v_item.mod_id,
            v_item.lbl,
            v_item.v_type,
            v_item.r_val,
            CASE WHEN v_item.v_type = 'text' THEN v_item.r_val->>'value' ELSE NULL END,
            CASE WHEN v_item.v_type = 'number' THEN (v_item.r_val->>'value')::numeric
                 WHEN v_item.v_type = 'quantity' THEN (v_item.r_val->>'amount')::numeric
                 ELSE NULL END,
            CASE WHEN v_item.v_type = 'boolean' THEN (v_item.r_val->>'value')::boolean ELSE NULL END,
            CASE WHEN v_item.v_type = 'range' THEN (v_item.r_val->>'lower')::numeric ELSE NULL END,
            CASE WHEN v_item.v_type = 'range' THEN (v_item.r_val->>'upper')::numeric ELSE NULL END,
            CASE WHEN v_item.v_type IN ('quantity', 'range') THEN v_item.r_val->>'unit' ELSE NULL END,
            CASE WHEN v_item.v_type = 'enum' THEN v_item.r_val->>'code' ELSE NULL END,
            CASE WHEN v_item.v_type = 'technical_token' THEN v_item.r_val->>'token' ELSE NULL END,
            CASE WHEN v_item.v_type = 'asset_reference' THEN v_item.r_val->>'assetId' ELSE NULL END,
            CASE WHEN v_item.v_type = 'product_reference' THEN v_item.r_val->>'targetProductId' ELSE NULL END,
            CASE WHEN v_item.v_type = 'unknown' THEN v_item.r_val->>'reason' ELSE NULL END,
            v_item.st,
            now()
        );
    END LOOP;

    -- 13. Atualização Atômica do Índice de Datasets (public.product_dataset_search_index) — EMENDA 6 & 8
    DELETE FROM public.product_dataset_search_index WHERE workbook_id = v_saved_id;

    FOR v_ds IN
        SELECT ds.value AS val
        FROM jsonb_array_elements(p_workbook->'datasets') ds
    LOOP
        FOR v_cell IN
            SELECT c.key AS cell_key, c.value AS cell_val
            FROM jsonb_each(COALESCE(v_ds.val->'cells', '{}'::jsonb)) c
        LOOP
            -- Recupera datum do mapa data
            v_datum_val := p_workbook->'data'->(v_cell.cell_val->>'datumId');
            
            -- Recupera definição da coluna
            SELECT col.value->>'semanticKey' AS sem_key,
                   col.value->>'label' AS lbl,
                   col.value->>'valueType' AS v_type
            INTO v_col_def
            FROM jsonb_array_elements(v_ds.val->'columns') col
            WHERE col.value->>'id' = v_cell.cell_val->>'columnId';

            -- Recupera definição da linha
            SELECT row.value->>'semanticKey' AS sem_key,
                   row.value->>'label' AS lbl
            INTO v_row_def
            FROM jsonb_array_elements(v_ds.val->'rows') row
            WHERE row.value->>'id' = v_cell.cell_val->>'rowId';

            -- Projeção de texto e valor numérico/unidade
            v_proj_text := CASE
                WHEN v_datum_val->'value'->>'type' = 'text' THEN v_datum_val->'value'->>'value'
                WHEN v_datum_val->'value'->>'type' = 'number' THEN v_datum_val->'value'->>'value'
                WHEN v_datum_val->'value'->>'type' = 'quantity' THEN (v_datum_val->'value'->>'amount') || ' ' || COALESCE(v_datum_val->'value'->>'unit', '')
                WHEN v_datum_val->'value'->>'type' = 'range' THEN COALESCE(v_datum_val->'value'->>'lower', '') || ' a ' || COALESCE(v_datum_val->'value'->>'upper', '') || ' ' || COALESCE(v_datum_val->'value'->>'unit', '')
                WHEN v_datum_val->'value'->>'type' = 'technical_token' THEN v_datum_val->'value'->>'token'
                ELSE NULL
            END;

            v_proj_num := CASE
                WHEN v_datum_val->'value'->>'type' = 'number' THEN (v_datum_val->'value'->>'value')::numeric
                WHEN v_datum_val->'value'->>'type' = 'quantity' THEN (v_datum_val->'value'->>'amount')::numeric
                ELSE NULL
            END;

            v_proj_unit := CASE
                WHEN v_datum_val->'value'->>'type' IN ('quantity', 'range') THEN v_datum_val->'value'->>'unit'
                ELSE NULL
            END;

            INSERT INTO public.product_dataset_search_index (
                workbook_id,
                dataset_id,
                dataset_semantic_key,
                module_id,
                dataset_label,
                dataset_kind,
                row_id,
                row_semantic_key,
                row_label,
                column_id,
                column_semantic_key,
                column_label,
                column_value_type,
                datum_id,
                datum_status,
                projected_text,
                projected_numeric,
                projected_unit,
                created_at
            ) VALUES (
                v_saved_id,
                v_ds.val->>'id',
                v_ds.val->>'semanticKey',
                v_ds.val->>'moduleId',
                v_ds.val->>'label',
                v_ds.val->>'kind',
                v_cell.cell_val->>'rowId',
                v_row_def.sem_key,
                v_row_def.lbl,
                v_cell.cell_val->>'columnId',
                v_col_def.sem_key,
                v_col_def.lbl,
                v_col_def.v_type,
                v_cell.cell_val->>'datumId',
                v_datum_val->>'status',
                v_proj_text,
                v_proj_num,
                v_proj_unit,
                now()
            );
        END LOOP;
    END LOOP;

    -- 14. Auditoria Transacional na library_change_events
    SELECT email INTO v_actor_email FROM auth.users WHERE id = v_actor;
    v_actor_name := COALESCE(v_actor_email, 'Editor');

    INSERT INTO public.library_change_events (
        entity_type,
        entity_id,
        action,
        family_id,
        product_id,
        user_id,
        user_name,
        details
    ) VALUES (
        'workbook',
        v_saved_id,
        CASE WHEN v_existing.id IS NULL THEN 'create' ELSE 'update' END,
        CASE WHEN v_owner_kind = 'family' THEN v_owner_id ELSE NULL END,
        CASE WHEN v_owner_kind = 'product' THEN v_owner_id ELSE NULL END,
        v_actor,
        v_actor_name,
        format('Workbook V2 gravado para %s "%s" (Revisão %s)', v_owner_kind, v_owner_id, v_new_revision)
    );

    -- 15. Retorno do payload persistido com a nova revisão atualizada
    RETURN jsonb_set(
        jsonb_set(p_workbook, '{revision}', to_jsonb(v_new_revision), false),
        '{schemaVersion}', to_jsonb(2), false
    );
END;
$$;

-- 5. RPC CANÔNICA DE LEITURA V2: get_product_workbook_v2
CREATE OR REPLACE FUNCTION public.get_product_workbook_v2(
    p_owner_kind TEXT,
    p_owner_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner_id UUID;
    v_payload JSONB;
BEGIN
    -- Validação de Autorização Fail-Closed
    IF auth.uid() IS NULL OR public.team_role() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Autenticação requerida para leitura de workbooks.'
            USING ERRCODE = '42501';
    END IF;

    -- Validação de owner_kind
    IF p_owner_kind IS NULL OR p_owner_kind NOT IN ('product', 'family') THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_OWNER_KIND: owner.kind deve ser "product" ou "family".'
            USING ERRCODE = '22023';
    END IF;

    -- Validação de owner_id
    IF p_owner_id IS NULL OR NOT (p_owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_OWNER_ID: owner.id deve ser um UUID válido.'
            USING ERRCODE = '22023';
    END IF;
    v_owner_id := p_owner_id::uuid;

    SELECT full_payload INTO v_payload
    FROM public.product_workbooks
    WHERE owner_kind = p_owner_kind
      AND owner_id = v_owner_id;

    -- Se não encontrar, retorna NULL
    IF v_payload IS NULL THEN
        RETURN NULL;
    END IF;

    -- Se o workbook persistido for V1, migra deterministicamente para V2 na leitura (EMENDA 1)
    IF (v_payload->>'schemaVersion') = '1' THEN
        v_payload := jsonb_set(
            jsonb_set(v_payload, '{schemaVersion}', to_jsonb(2), false),
            '{datasets}', '[]'::jsonb, false
        );
    END IF;

    RETURN v_payload;
END;
$$;

-- 6. PERMISSÕES EXPLÍCITAS DAS NOVAS RPCS
GRANT EXECUTE ON FUNCTION public.save_product_workbook_v2(JSONB, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_workbook_v2(TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_product_workbook_v2(JSONB, INTEGER) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_product_workbook_v2(TEXT, TEXT) FROM anon, PUBLIC;

-- 7. RPC CANÔNICA DE BUSCA INTEGRADA: search_product_knowledge_v2 (PIM.PRODUCTION.CORE1.1)
CREATE OR REPLACE FUNCTION public.search_product_knowledge_v2(
    p_query TEXT,
    p_product_id UUID DEFAULT NULL,
    p_family_id UUID DEFAULT NULL,
    p_kind TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    source_index TEXT,
    owner_kind TEXT,
    owner_id UUID,
    dataset_id TEXT,
    module_id TEXT,
    semantic_key TEXT,
    label TEXT,
    value_formatted TEXT,
    unit TEXT,
    status TEXT,
    relevance REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
BEGIN
    -- Validação de Autorização Fail-Closed
    IF auth.uid() IS NULL OR public.team_role() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Autenticação requerida para busca de conhecimento.'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH combined AS (
        -- 1. Fatos técnicos em product_technical_data_index
        SELECT
            'technical_data'::TEXT AS source_index,
            t.owner_kind,
            t.owner_id,
            NULL::TEXT AS dataset_id,
            t.module_id,
            t.semantic_key,
            t.label,
            t.value_text AS value_formatted,
            t.unit,
            t.status,
            CASE 
                WHEN p_query IS NULL OR trim(p_query) = '' THEN 1.0::REAL
                ELSE ts_rank_cd(
                    to_tsvector('simple', COALESCE(t.label, '') || ' ' || COALESCE(t.semantic_key, '') || ' ' || COALESCE(t.value_text, '')),
                    plainto_tsquery('simple', p_query)
                )::REAL
            END AS relevance
        FROM public.product_technical_data_index t
        WHERE (p_product_id IS NULL OR (t.owner_kind = 'product' AND t.owner_id = p_product_id))
          AND (p_family_id IS NULL OR (t.owner_kind = 'family' AND t.owner_id = p_family_id))
          AND (p_query IS NULL OR trim(p_query) = '' OR to_tsvector('simple', COALESCE(t.label, '') || ' ' || COALESCE(t.semantic_key, '') || ' ' || COALESCE(t.value_text, '')) @@ plainto_tsquery('simple', p_query))

        UNION ALL

        -- 2. Células e tabelas em product_dataset_search_index
        SELECT
            'technical_dataset'::TEXT AS source_index,
            d.owner_kind,
            d.owner_id,
            d.dataset_id,
            d.module_id,
            d.column_semantic_key AS semantic_key,
            (COALESCE(d.dataset_label, '') || ' · ' || COALESCE(d.column_label, '') || ' [' || COALESCE(d.row_label, '') || ']') AS label,
            d.projected_text AS value_formatted,
            d.projected_unit AS unit,
            d.status,
            CASE 
                WHEN p_query IS NULL OR trim(p_query) = '' THEN 1.0::REAL
                ELSE ts_rank_cd(
                    to_tsvector('simple', COALESCE(d.dataset_label, '') || ' ' || COALESCE(d.column_label, '') || ' ' || COALESCE(d.row_label, '') || ' ' || COALESCE(d.projected_text, '')),
                    plainto_tsquery('simple', p_query)
                )::REAL
            END AS relevance
        FROM public.product_dataset_search_index d
        WHERE (p_product_id IS NULL OR (d.owner_kind = 'product' AND d.owner_id = p_product_id))
          AND (p_family_id IS NULL OR (d.owner_kind = 'family' AND d.owner_id = p_family_id))
          AND (p_kind IS NULL OR d.dataset_kind = p_kind)
          AND (p_query IS NULL OR trim(p_query) = '' OR to_tsvector('simple', COALESCE(d.dataset_label, '') || ' ' || COALESCE(d.column_label, '') || ' ' || COALESCE(d.row_label, '') || ' ' || COALESCE(d.projected_text, '')) @@ plainto_tsquery('simple', p_query))
    )
    SELECT * FROM combined
    ORDER BY relevance DESC, label ASC
    LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_product_knowledge_v2(TEXT, UUID, UUID, TEXT, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.search_product_knowledge_v2(TEXT, UUID, UUID, TEXT, INTEGER) FROM anon, PUBLIC;

