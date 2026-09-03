-- ============================================================================
-- MIGRATION 00022: PRODUCT WORKBOOK PERSISTENCE HARDENING (PHASE PIM.W2B)
-- STATUS: READY FOR ARCHITECT REVIEW — DO NOT APPLY LIVE YET.
--
-- Core Invariants:
-- 1. CAS ESTRITO: p_expected_revision é obrigatório (sem default NULL). Mismatch gera SQLSTATE 40001 / WORKBOOK_CONFLICT.
-- 2. SEMÂNTICA DE REVISÃO: 0 representa baseline não persistida. Primeiro save avança 0 -> 1. Saves subsequentes N -> N+1.
-- 3. RACE PREVENTION & OWNER INTEGRITY: Bloqueio pessimista (FOR UPDATE) na entidade owner (public.products ou public.product_families)
--    antes da criação/atualização do workbook. Garante serialização atômica de first-saves concorrentes e integridade referencial.
-- 4. SINGLE WRITE AUTHORITY: DML direto (INSERT/UPDATE/DELETE) revogado de PUBLIC, anon e authenticated.
--    Toda mutação ocorre exclusivamente através de RPCs autorizadas com public.require_document_editor_v1().
-- 5. SOURCE DOCUMENT INTEGRITY: Tabela product_source_documents espelha estritamente o enum do domínio de 8 valores.
--    Validação fail-closed rejeita workbooks com evidências órfãs que referenciem documentos inexistentes.
-- 6. ÍNDICE ANALÍTICO LOSSLESS: Projeção transacional determinística cobrindo a união dos 10 tipos de TechnicalValue.
--    has_conflicts removido do índice analítico (resolução de conflito pertence exclusivamente à autoridade do domínio).
-- 7. AUDITORIA TRANSACIONAL: Registro em library_change_events na mesma transação atômica do commit.
-- ============================================================================

-- 1. TABELA PRINCIPAL DE WORKBOOKS TÉCNICOS
CREATE TABLE IF NOT EXISTS public.product_workbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_kind TEXT NOT NULL CHECK (owner_kind IN ('product', 'family')),
    owner_id UUID NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    full_payload JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT product_workbooks_owner_unique UNIQUE (owner_kind, owner_id)
);

-- 2. TABELA DE DOCUMENTOS FONTE (PROVENIÊNCIA E EVIDÊNCIA)
-- Espelha estritamente o enum canônico SourceDocumentType do domínio
CREATE TABLE IF NOT EXISTS public.product_source_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN (
        'manual',
        'datasheet',
        'certificate',
        'drawing',
        'standard',
        'engineering_note',
        'website',
        'other'
    )),
    revision TEXT,
    language TEXT,
    publication_date TEXT,
    file_reference TEXT,
    external_url TEXT,
    checksum TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. TABELA DE ÍNDICE E BUSCA DE DADOS TÉCNICOS (PROJEÇÃO ANALÍTICA DETERMINÍSTICA)
-- Projeção transacional cobrindo a união completa dos 10 tipos de TechnicalValue do domínio
CREATE TABLE IF NOT EXISTS public.product_technical_data_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workbook_id UUID NOT NULL REFERENCES public.product_workbooks(id) ON DELETE CASCADE,
    datum_id TEXT NOT NULL,
    semantic_key TEXT NOT NULL,
    module_id TEXT NOT NULL,
    label TEXT NOT NULL,
    value_type TEXT NOT NULL,
    raw_value JSONB NOT NULL,
    text_value TEXT,
    numeric_value NUMERIC,
    boolean_value BOOLEAN,
    lower_value NUMERIC,
    upper_value NUMERIC,
    unit TEXT,
    enum_code TEXT,
    technical_token TEXT,
    asset_id TEXT,
    target_product_id TEXT,
    unknown_reason TEXT,
    status TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT uq_workbook_datum_index UNIQUE (workbook_id, datum_id)
);

-- 4. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_product_workbooks_owner 
    ON public.product_workbooks(owner_kind, owner_id);

CREATE INDEX IF NOT EXISTS idx_product_technical_data_wb 
    ON public.product_technical_data_index(workbook_id);

CREATE INDEX IF NOT EXISTS idx_product_technical_data_semantic 
    ON public.product_technical_data_index(semantic_key);

CREATE INDEX IF NOT EXISTS idx_product_technical_data_numeric 
    ON public.product_technical_data_index(numeric_value) 
    WHERE numeric_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_technical_data_status 
    ON public.product_technical_data_index(status);

CREATE INDEX IF NOT EXISTS idx_product_source_documents_type 
    ON public.product_source_documents(document_type);

-- 5. ROW LEVEL SECURITY (RLS) E AUTORIDADE ÚNICA DE ESCRITA
ALTER TABLE public.product_workbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_technical_data_index ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura (Authenticated Users)
DROP POLICY IF EXISTS "allow_read_product_workbooks" ON public.product_workbooks;
CREATE POLICY "allow_read_product_workbooks" ON public.product_workbooks
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "allow_read_source_documents" ON public.product_source_documents;
CREATE POLICY "allow_read_source_documents" ON public.product_source_documents
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "allow_read_technical_data_index" ON public.product_technical_data_index;
CREATE POLICY "allow_read_technical_data_index" ON public.product_technical_data_index
    FOR SELECT TO authenticated USING (true);

-- AUTORIDADE ÚNICA DE ESCRITA: Revogação explícita de DML direto
-- Mutações ocorrem unicamente via RPCs autorizadas (save_product_workbook_v1, upsert_source_document_v1)
REVOKE INSERT, UPDATE, DELETE ON public.product_workbooks FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.product_source_documents FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.product_technical_data_index FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.product_workbooks TO authenticated;
GRANT SELECT ON public.product_source_documents TO authenticated;
GRANT SELECT ON public.product_technical_data_index TO authenticated;

-- 6. RPC: GET PRODUCT WORKBOOK V1
CREATE OR REPLACE FUNCTION public.get_product_workbook_v1(
    p_owner_kind TEXT,
    p_owner_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_record public.product_workbooks;
    v_owner_uuid UUID;
    v_payload_revision INTEGER;
BEGIN
    -- Validação de UUID
    IF p_owner_id IS NULL OR NOT (p_owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_OWNER_ID: owner.id "%" não é um UUID válido.', p_owner_id
            USING ERRCODE = '22023';
    END IF;
    v_owner_uuid := p_owner_id::uuid;

    SELECT * INTO v_record
    FROM public.product_workbooks
    WHERE owner_kind = p_owner_kind
      AND owner_id = v_owner_uuid;

    IF v_record.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Validação de integridade entre a coluna de controle e o payload gravado
    v_payload_revision := (v_record.full_payload->>'revision')::integer;
    IF v_payload_revision IS DISTINCT FROM v_record.revision THEN
        RAISE EXCEPTION 'WORKBOOK_CORRUPTED: Inconsistência de revisão entre a linha da tabela (%) e o payload (%).',
            v_record.revision, v_payload_revision
            USING ERRCODE = 'XX000';
    END IF;

    RETURN v_record.full_payload;
END;
$$;

-- 7. RPC: SAVE PRODUCT WORKBOOK V1 (CAS Estrito + Lock de Owner + Zero Órfãos)
CREATE OR REPLACE FUNCTION public.save_product_workbook_v1(
    p_workbook JSONB,
    p_expected_revision INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
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
BEGIN
    -- 1. Validação estrita do parâmetro CAS (sem default NULL)
    IF p_expected_revision IS NULL THEN
        RAISE EXCEPTION 'CAS_REVISION_REQUIRED: p_expected_revision é obrigatório e não pode ser nulo.'
            USING ERRCODE = '22023';
    END IF;

    -- 2. Extração e validação estrita dos identificadores de ownership
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

    -- 3. Validação estrutural do payload de persistência
    IF (p_workbook->>'schemaVersion')::integer <> 1 THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_SCHEMA: schemaVersion deve ser 1.'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_workbook->'modules') <> 'array' THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_MODULES: modules deve ser um array JSON.'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_workbook->'data') <> 'object' THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_DATA: data deve ser um objeto JSON.'
            USING ERRCODE = '22023';
    END IF;

    IF (p_workbook->>'revision')::integer IS DISTINCT FROM p_expected_revision THEN
        RAISE EXCEPTION 'WORKBOOK_PAYLOAD_REVISION_MISMATCH: revision no payload (%) difere de p_expected_revision (%).',
            (p_workbook->>'revision')::integer, p_expected_revision
            USING ERRCODE = '22023';
    END IF;

    -- 4. Validação de Evidências Órfãs (Fail-Closed)
    -- Verifica que todo sourceDocumentId referenciado em data[].evidence existe no banco
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
            RAISE EXCEPTION 'ORPHAN_SOURCE_DOCUMENT: Evidência referencia sourceDocumentId "%" inexistente no banco de dados.',
                v_evidence_item.doc_id
                USING ERRCODE = '23503';
        END IF;
    END LOOP;

    -- 5. Bloqueio pessimista na entidade Owner (Prevenção de Race de Criação e Integridade Referencial)
    IF v_owner_kind = 'product' THEN
        PERFORM 1 FROM public.products WHERE id = v_owner_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'OWNER_NOT_FOUND: Produto com ID "%" não encontrado.', v_owner_id
                USING ERRCODE = '23503';
        END IF;
    ELSIF v_owner_kind = 'family' THEN
        PERFORM 1 FROM public.product_families WHERE id = v_owner_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'OWNER_NOT_FOUND: Família com ID "%" não encontrada.', v_owner_id
                USING ERRCODE = '23503';
        END IF;
    END IF;

    -- 6. Carrega usuário ator
    SELECT email, raw_user_meta_data->>'full_name'
    INTO v_actor_email, v_actor_name
    FROM auth.users
    WHERE id = v_actor;

    IF v_actor_name IS NULL OR v_actor_name = '' THEN
        v_actor_name := split_part(v_actor_email, '@', 1);
    END IF;

    -- 7. Lock transacional no workbook existente e validação estrita de CAS
    SELECT * INTO v_existing
    FROM public.product_workbooks
    WHERE owner_kind = v_owner_kind
      AND owner_id = v_owner_id
    FOR UPDATE;

    IF v_existing.id IS NOT NULL THEN
        -- Registro existente: stored_revision MUST EQUAL p_expected_revision
        IF v_existing.revision IS DISTINCT FROM p_expected_revision THEN
            RAISE EXCEPTION 'WORKBOOK_CONFLICT: Conflito de concorrência no workbook (Esperado: %, Atual: %). Recarregue antes de salvar.',
                p_expected_revision, v_existing.revision
                USING ERRCODE = '40001';
        END IF;

        v_new_revision := v_existing.revision + 1;
        v_saved_id := v_existing.id;

        -- Injeta nova revisão no full_payload gravado
        p_workbook := jsonb_set(p_workbook, '{revision}', to_jsonb(v_new_revision));

        UPDATE public.product_workbooks
        SET revision = v_new_revision,
            full_payload = p_workbook,
            updated_by = v_actor,
            updated_at = now()
        WHERE id = v_saved_id;
    ELSE
        -- Novo registro: exige p_expected_revision = 0 (baseline não persistida)
        IF p_expected_revision <> 0 THEN
            RAISE EXCEPTION 'WORKBOOK_CONFLICT: Workbook não existe no banco mas expected_revision informado foi % (esperado 0 para novo registro).',
                p_expected_revision
                USING ERRCODE = '40001';
        END IF;

        -- Primeiro commit avança formalmente 0 -> 1
        v_new_revision := 1;
        p_workbook := jsonb_set(p_workbook, '{revision}', to_jsonb(v_new_revision));

        INSERT INTO public.product_workbooks (
            owner_kind,
            owner_id,
            revision,
            full_payload,
            created_by,
            updated_by,
            created_at,
            updated_at
        ) VALUES (
            v_owner_kind,
            v_owner_id,
            v_new_revision,
            p_workbook,
            v_actor,
            v_actor,
            now(),
            now()
        )
        RETURNING id INTO v_saved_id;
    END IF;

    -- 8. Gravação na Trilha de Auditoria (library_change_events) na mesma transação
    INSERT INTO public.library_change_events (
        entity_type,
        entity_id,
        family_id,
        product_id,
        action,
        summary,
        actor_id,
        actor_email,
        actor_name,
        created_at
    ) VALUES (
        'product_workbook',
        v_saved_id::text,
        CASE WHEN v_owner_kind = 'family' THEN v_owner_id ELSE NULL END,
        CASE WHEN v_owner_kind = 'product' THEN v_owner_id ELSE NULL END,
        'SAVE_WORKBOOK',
        format('Workbook gravado para %s "%s" (Revisão %s)', v_owner_kind, v_owner_id, v_new_revision),
        v_actor,
        v_actor_email,
        v_actor_name,
        now()
    );

    -- 9. Atualização transacional atômica do índice analítico (projeção rápida)
    DELETE FROM public.product_technical_data_index
    WHERE workbook_id = v_saved_id;

    FOR v_item IN
        SELECT 
            value->>'id' AS datum_id,
            value->>'semanticKey' AS semantic_key,
            value->>'moduleId' AS module_id,
            value->>'label' AS label,
            value->'value' AS raw_val,
            value->'value'->>'type' AS val_type,
            -- Projeções tipadas sem ghost data (ausência permanece NULL)
            CASE 
                WHEN value->'value'->>'type' = 'text' THEN value->'value'->>'value'
                WHEN value->'value'->>'type' = 'enum' THEN value->'value'->>'label'
                ELSE NULL 
            END AS txt_val,
            CASE 
                WHEN value->'value'->>'type' = 'number' THEN (value->'value'->>'value')::numeric
                WHEN value->'value'->>'type' = 'quantity' THEN (value->'value'->>'amount')::numeric
                ELSE NULL 
            END AS num_val,
            CASE 
                WHEN value->'value'->>'type' = 'boolean' THEN (value->'value'->>'value')::boolean
                ELSE NULL 
            END AS bool_val,
            CASE 
                WHEN value->'value'->>'type' = 'range' THEN (value->'value'->>'min')::numeric
                ELSE NULL 
            END AS low_val,
            CASE 
                WHEN value->'value'->>'type' = 'range' THEN (value->'value'->>'max')::numeric
                ELSE NULL 
            END AS up_val,
            CASE 
                WHEN value->'value'->>'type' IN ('quantity', 'range') THEN value->'value'->>'unit'
                ELSE NULL 
            END AS unit_val,
            CASE 
                WHEN value->'value'->>'type' = 'enum' THEN value->'value'->>'code'
                ELSE NULL 
            END AS enum_val,
            CASE 
                WHEN value->'value'->>'type' = 'technical_token' THEN value->'value'->>'token'
                ELSE NULL 
            END AS token_val,
            CASE 
                WHEN value->'value'->>'type' = 'asset_reference' THEN value->'value'->>'assetId'
                ELSE NULL 
            END AS asset_val,
            CASE 
                WHEN value->'value'->>'type' = 'product_reference' THEN value->'value'->>'targetProductId'
                ELSE NULL 
            END AS prod_ref_val,
            CASE 
                WHEN value->'value'->>'type' = 'unknown' THEN value->'value'->>'reason'
                ELSE NULL 
            END AS unk_reason,
            value->>'status' AS datum_status
        FROM jsonb_each(p_workbook->'data')
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
            v_item.datum_id,
            v_item.semantic_key,
            v_item.module_id,
            v_item.label,
            v_item.val_type,
            v_item.raw_val,
            v_item.txt_val,
            v_item.num_val,
            v_item.bool_val,
            v_item.low_val,
            v_item.up_val,
            v_item.unit_val,
            v_item.enum_val,
            v_item.token_val,
            v_item.asset_val,
            v_item.prod_ref_val,
            v_item.unk_reason,
            v_item.datum_status,
            now()
        );
    END LOOP;

    RETURN p_workbook;
END;
$$;

-- 8. RPCS PARA SOURCE DOCUMENTS (Lifecycle de Persistência Completo)

-- 8.1 UPSERT SOURCE DOCUMENT V1
CREATE OR REPLACE FUNCTION public.upsert_source_document_v1(
    p_document JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_actor UUID := public.require_document_editor_v1();
    v_id TEXT;
    v_title TEXT;
    v_doc_type TEXT;
    v_saved public.product_source_documents;
BEGIN
    v_id := p_document->>'id';
    v_title := p_document->>'title';
    v_doc_type := p_document->>'documentType';

    IF v_id IS NULL OR trim(v_id) = '' THEN
        RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_ID: id é obrigatório.' USING ERRCODE = '22023';
    END IF;

    IF v_title IS NULL OR trim(v_title) = '' THEN
        RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_TITLE: title é obrigatório.' USING ERRCODE = '22023';
    END IF;

    IF v_doc_type NOT IN (
        'manual', 'datasheet', 'certificate', 'drawing',
        'standard', 'engineering_note', 'website', 'other'
    ) THEN
        RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_TYPE: documentType "%" inválido.', v_doc_type USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.product_source_documents (
        id,
        title,
        document_type,
        revision,
        language,
        publication_date,
        file_reference,
        external_url,
        checksum,
        metadata,
        created_by,
        updated_by,
        created_at,
        updated_at
    ) VALUES (
        v_id,
        v_title,
        v_doc_type,
        p_document->>'revision',
        p_document->>'language',
        p_document->>'publicationDate',
        p_document->>'fileReference',
        p_document->>'externalUrl',
        p_document->>'checksum',
        COALESCE(p_document->'metadata', '{}'::jsonb),
        v_actor,
        v_actor,
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET title = EXCLUDED.title,
        document_type = EXCLUDED.document_type,
        revision = EXCLUDED.revision,
        language = EXCLUDED.language,
        publication_date = EXCLUDED.publication_date,
        file_reference = EXCLUDED.file_reference,
        external_url = EXCLUDED.external_url,
        checksum = EXCLUDED.checksum,
        metadata = EXCLUDED.metadata,
        updated_by = v_actor,
        updated_at = now()
    RETURNING * INTO v_saved;

    RETURN to_jsonb(v_saved);
END;
$$;

-- 8.2 GET SOURCE DOCUMENT V1
CREATE OR REPLACE FUNCTION public.get_source_document_v1(
    p_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_record public.product_source_documents;
BEGIN
    SELECT * INTO v_record
    FROM public.product_source_documents
    WHERE id = p_id;

    IF v_record.id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN to_jsonb(v_record);
END;
$$;

-- 8.3 LIST SOURCE DOCUMENTS V1
CREATE OR REPLACE FUNCTION public.list_source_documents_v1(
    p_ids TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF p_ids IS NULL OR array_length(p_ids, 1) = 0 THEN
        SELECT jsonb_agg(to_jsonb(d)) INTO v_result
        FROM public.product_source_documents d;
    ELSE
        SELECT jsonb_agg(to_jsonb(d)) INTO v_result
        FROM public.product_source_documents d
        WHERE d.id = ANY(p_ids);
    END IF;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 9. PERMISSÕES EXPLÍCITAS NAS RPCS (REVOKE PUBLIC / GRANT AUTHENTICATED)
REVOKE EXECUTE ON FUNCTION public.get_product_workbook_v1(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_workbook_v1(TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_product_workbook_v1(JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_product_workbook_v1(JSONB, INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_source_document_v1(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_source_document_v1(JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_source_document_v1(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_source_document_v1(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_source_documents_v1(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_source_documents_v1(TEXT[]) TO authenticated;

-- 10. PUBLICAÇÃO REALTIME COMPATÍVEL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'product_workbooks'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.product_workbooks;
    END IF;
END $$;

ALTER TABLE public.product_workbooks REPLICA IDENTITY FULL;
