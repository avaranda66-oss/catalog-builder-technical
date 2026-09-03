-- ============================================================================
-- MIGRATION 00022: PRODUCT WORKBOOK PERSISTENCE DRAFT (PHASE PIM.W2A)
-- STATUS: DRAFT ONLY — ISOLATED IN BRANCH design/product-workbook-persistence
-- DO NOT APPLY TO LIVE SUPABASE. DO NOT MERGE TO MAIN.
-- Tables: product_workbooks, product_source_documents, product_technical_data_index
-- RPCs: save_product_workbook_v1, get_product_workbook_v1
-- Audit: integrated into public.library_change_events
-- Concurrency: CAS via domain revision token (SQLSTATE 40001)
-- ============================================================================

-- 1. TABELA PRINCIPAL DE WORKBOOKS TÉCNICOS
CREATE TABLE IF NOT EXISTS public.product_workbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_kind TEXT NOT NULL CHECK (owner_kind IN ('product', 'family')),
    owner_id TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    full_payload JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT product_workbooks_owner_unique UNIQUE (owner_kind, owner_id)
);

-- 2. TABELA DE DOCUMENTOS FONTE (PROVENIÊNCIA E EVIDÊNCIA)
CREATE TABLE IF NOT EXISTS public.product_source_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('datasheet', 'manual', 'drawing', 'certificate', 'test_report', 'marketing', 'other')),
    file_url TEXT,
    file_name TEXT,
    mime_type TEXT,
    sha256 TEXT,
    version TEXT,
    language TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. TABELA DE ÍNDICE E BUSCA DE DADOS TÉCNICOS (PROJEÇÃO ANALÍTICA)
CREATE TABLE IF NOT EXISTS public.product_technical_data_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workbook_id UUID NOT NULL REFERENCES public.product_workbooks(id) ON DELETE CASCADE,
    datum_id TEXT NOT NULL,
    semantic_key TEXT NOT NULL,
    module_id TEXT NOT NULL,
    label TEXT NOT NULL,
    value_type TEXT NOT NULL,
    text_value TEXT,
    numeric_value NUMERIC,
    unit TEXT,
    status TEXT NOT NULL,
    has_conflicts BOOLEAN DEFAULT false,
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

-- 5. ROW LEVEL SECURITY (RLS)
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

-- Políticas de Escrita (Editor / Admin via team_role)
DROP POLICY IF EXISTS "allow_write_product_workbooks" ON public.product_workbooks;
CREATE POLICY "allow_write_product_workbooks" ON public.product_workbooks
    FOR ALL TO authenticated
    USING (coalesce(public.team_role(), 'editor') IN ('admin', 'editor'))
    WITH CHECK (coalesce(public.team_role(), 'editor') IN ('admin', 'editor'));

DROP POLICY IF EXISTS "allow_write_source_documents" ON public.product_source_documents;
CREATE POLICY "allow_write_source_documents" ON public.product_source_documents
    FOR ALL TO authenticated
    USING (coalesce(public.team_role(), 'editor') IN ('admin', 'editor'))
    WITH CHECK (coalesce(public.team_role(), 'editor') IN ('admin', 'editor'));

DROP POLICY IF EXISTS "allow_write_technical_data_index" ON public.product_technical_data_index;
CREATE POLICY "allow_write_technical_data_index" ON public.product_technical_data_index
    FOR ALL TO authenticated
    USING (coalesce(public.team_role(), 'editor') IN ('admin', 'editor'))
    WITH CHECK (coalesce(public.team_role(), 'editor') IN ('admin', 'editor'));

-- 6. RPC: GET PRODUCT WORKBOOK V1
CREATE OR REPLACE FUNCTION public.get_product_workbook_v1(
    p_owner_kind TEXT,
    p_owner_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_record public.product_workbooks;
BEGIN
    SELECT * INTO v_record
    FROM public.product_workbooks
    WHERE owner_kind = p_owner_kind
      AND owner_id = p_owner_id;

    IF v_record.id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN v_record.full_payload;
END;
$$;

-- 7. RPC: SAVE PRODUCT WORKBOOK V1 (CAS com Revision + Auditoria)
CREATE OR REPLACE FUNCTION public.save_product_workbook_v1(
    p_workbook JSONB,
    p_expected_revision INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor UUID := public.require_document_editor_v1();
    v_actor_email TEXT := '';
    v_actor_name TEXT := '';
    v_owner_kind TEXT;
    v_owner_id TEXT;
    v_existing public.product_workbooks;
    v_new_revision INTEGER;
    v_saved_id UUID;
    v_item RECORD;
BEGIN
    -- 1. Extração dos identificadores de ownership
    v_owner_kind := p_workbook->'owner'->>'kind';
    v_owner_id   := p_workbook->'owner'->>'id';

    IF v_owner_kind IS NULL OR v_owner_kind NOT IN ('product', 'family') THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_OWNER_KIND: O campo owner.kind deve ser "product" ou "family".'
            USING ERRCODE = '22023';
    END IF;

    IF v_owner_id IS NULL OR trim(v_owner_id) = '' THEN
        RAISE EXCEPTION 'INVALID_WORKBOOK_OWNER_ID: O campo owner.id é obrigatório.'
            USING ERRCODE = '22023';
    END IF;

    -- 2. Carrega usuário ator
    SELECT email, raw_user_meta_data->>'full_name'
    INTO v_actor_email, v_actor_name
    FROM auth.users
    WHERE id = v_actor;

    IF v_actor_name IS NULL OR v_actor_name = '' THEN
        v_actor_name := split_part(v_actor_email, '@', 1);
    END IF;

    -- 3. Lock e verificação de concorrência (CAS)
    SELECT * INTO v_existing
    FROM public.product_workbooks
    WHERE owner_kind = v_owner_kind
      AND owner_id = v_owner_id
    FOR UPDATE;

    IF v_existing.id IS NOT NULL THEN
        -- Registro existente: validação estrita de CAS
        IF p_expected_revision IS NOT NULL AND v_existing.revision IS DISTINCT FROM p_expected_revision THEN
            RAISE EXCEPTION 'WORKBOOK_CONFLICT: Conflito de concorrência no workbook (Esperado: %, Atual: %). Recarregue a página antes de salvar.',
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
        -- Novo registro
        v_new_revision := 0;
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

    -- 4. Gravação na Trilha de Auditoria (library_change_events)
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
        CASE WHEN v_owner_kind = 'family' THEN v_owner_id::uuid ELSE NULL END,
        CASE WHEN v_owner_kind = 'product' THEN v_owner_id::uuid ELSE NULL END,
        'SAVE_WORKBOOK',
        format('Workbook gravado para %s "%s" (Revisão %s)', v_owner_kind, v_owner_id, v_new_revision),
        v_actor,
        v_actor_email,
        v_actor_name,
        now()
    );

    -- 5. Atualização transacional do índice analítico (projeção rápida)
    DELETE FROM public.product_technical_data_index
    WHERE workbook_id = v_saved_id;

    FOR v_item IN
        SELECT 
            value->>'id' AS datum_id,
            value->>'semanticKey' AS semantic_key,
            value->>'moduleId' AS module_id,
            value->>'label' AS label,
            value->'value'->>'type' AS val_type,
            CASE 
                WHEN value->'value'->>'type' = 'text' THEN value->'value'->>'value'
                WHEN value->'value'->>'type' = 'enum' THEN value->'value'->>'code'
                ELSE NULL 
            END AS txt_val,
            CASE 
                WHEN value->'value'->>'type' = 'number' THEN (value->'value'->>'value')::numeric
                WHEN value->'value'->>'type' = 'quantity' THEN (value->'value'->>'amount')::numeric
                ELSE NULL 
            END AS num_val,
            value->'value'->>'unit' AS unit_val,
            value->>'status' AS datum_status,
            (jsonb_array_length(COALESCE(value->'evidence', '[]'::jsonb)) > 1) AS has_conflicts
        FROM jsonb_each(p_workbook->'data')
    LOOP
        INSERT INTO public.product_technical_data_index (
            workbook_id,
            datum_id,
            semantic_key,
            module_id,
            label,
            value_type,
            text_value,
            numeric_value,
            unit,
            status,
            has_conflicts,
            updated_at
        ) VALUES (
            v_saved_id,
            v_item.datum_id,
            v_item.semantic_key,
            v_item.module_id,
            v_item.label,
            v_item.val_type,
            v_item.txt_val,
            v_item.num_val,
            v_item.unit_val,
            v_item.datum_status,
            v_item.has_conflicts,
            now()
        );
    END LOOP;

    RETURN p_workbook;
END;
$$;

-- 8. PUBLICAÇÃO REALTIME
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
