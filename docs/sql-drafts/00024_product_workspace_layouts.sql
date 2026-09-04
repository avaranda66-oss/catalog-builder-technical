-- ============================================================================
-- OFFLINE SPECIFICATION DRAFT: 00024_product_workspace_layouts.sql
-- LOCATION: docs/sql-drafts/ (OUTSIDE supabase/migrations/ LEDGER)
--
-- MISSION: PIM.MEGA.WORKSPACE.FOUNDATION1C (Final Domain Hardening)
-- PURPOSE: Complete offline specification for customizable Mega Product Workspace
--          Layouts as an independent relational entity, strictly decoupling human
--          presentation revision from technical data truth revision.
--
-- INVARIANTS:
-- 1. ProductWorkbook.revision != ProductWorkspaceLayout.revision (Strictly Decoupled)
-- 2. CAS is independent (optimistic concurrency per layout row).
-- 3. Database column revision is the sole authority for CAS.
-- 4. Parity guaranteed: row.revision == layout_json.revision ALWAYS.
-- 5. Strict UUID types: owner_product_id UUID REFERENCES public.products(id).
-- 6. Zero DDL/DML executed live.
-- ============================================================================

-- 1. Tabela: product_workspace_layouts
CREATE TABLE IF NOT EXISTS public.product_workspace_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    workspace_key TEXT NOT NULL DEFAULT 'default',
    schema_version INTEGER NOT NULL DEFAULT 1,
    revision INTEGER NOT NULL DEFAULT 1,
    layout_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_product_workspace_layout_owner_key UNIQUE (owner_product_id, workspace_key),
    CONSTRAINT chk_product_workspace_layout_schema_v1 CHECK (schema_version = 1),
    CONSTRAINT chk_product_workspace_layout_revision_pos CHECK (revision >= 1)
);

-- 2. Índices de alta performance
CREATE INDEX IF NOT EXISTS idx_product_workspace_layouts_owner
    ON public.product_workspace_layouts(owner_product_id, workspace_key);

-- 3. Row Level Security (RLS) Fail-Closed
ALTER TABLE public.product_workspace_layouts ENABLE ROW LEVEL SECURITY;

-- Política de Leitura: Usuários autenticados podem visualizar layouts de produtos ativos
DROP POLICY IF EXISTS "allow_read_product_workspace_layouts" ON public.product_workspace_layouts;
CREATE POLICY "allow_read_product_workspace_layouts" ON public.product_workspace_layouts
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id = product_workspace_layouts.owner_product_id
              AND p.deleted_at IS NULL
        )
    );

-- Política de Escrita: Restrita ao RPC SECURITY DEFINER ou service_role
DROP POLICY IF EXISTS "allow_service_role_workspace_layouts" ON public.product_workspace_layouts;
CREATE POLICY "allow_service_role_workspace_layouts" ON public.product_workspace_layouts
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- 4. RPC Transacional com CAS Estrito e Paridade de Revisão
CREATE OR REPLACE FUNCTION public.save_product_workspace_layout_v1(
    p_owner_product_id UUID,
    p_workspace_key TEXT,
    p_expected_revision INTEGER,
    p_layout_json JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID;
    v_existing_id UUID;
    v_current_rev INTEGER;
    v_new_rev INTEGER;
    v_updated_layout_json JSONB;
    v_result JSONB;
BEGIN
    -- 1. Verificação de Autenticação / Autorização Fail-Closed
    v_actor := auth.uid();
    IF v_actor IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Acesso não autenticado.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validação de Parâmetros
    IF p_owner_product_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: owner_product_id é obrigatório.'
            USING ERRCODE = '22023';
    END IF;

    IF p_workspace_key IS NULL OR trim(p_workspace_key) = '' THEN
        p_workspace_key := 'default';
    END IF;

    IF p_expected_revision IS NULL THEN
        RAISE EXCEPTION 'CAS_ERROR: expectedRevision não pode ser nulo (use 0 para criação ou a revisão atual para atualização).'
            USING ERRCODE = '40001';
    END IF;

    IF p_layout_json IS NULL OR jsonb_typeof(p_layout_json) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: layout_json deve ser um objeto JSON válido.'
            USING ERRCODE = '22023';
    END IF;

    -- 3. Lock transacional na linha existente (FOR UPDATE)
    SELECT id, revision INTO v_existing_id, v_current_rev
    FROM public.product_workspace_layouts
    WHERE owner_product_id = p_owner_product_id AND workspace_key = p_workspace_key
    FOR UPDATE;

    -- 4. Avaliação de CAS
    IF FOUND THEN
        -- UPDATE: Não permite expectedRevision = 0 quando o registro já existe
        IF p_expected_revision = 0 THEN
            RAISE EXCEPTION 'CAS_CONFLICT: Layout já existe para o produto % e chave %, mas expectedRevision informado foi 0.',
                p_owner_product_id, p_workspace_key
                USING ERRCODE = '40001',
                      DETAIL = format('{"expectedRevision":0,"actualRevision":%s,"productId":"%s"}', v_current_rev, p_owner_product_id);
        END IF;

        -- UPDATE: Divergência de versão
        IF v_current_rev <> p_expected_revision THEN
            RAISE EXCEPTION 'CAS_CONFLICT: Revisão divergente. Atual no banco: %, Esperada: %',
                v_current_rev, p_expected_revision
                USING ERRCODE = '40001',
                      DETAIL = format('{"expectedRevision":%s,"actualRevision":%s,"productId":"%s"}', p_expected_revision, v_current_rev, p_owner_product_id);
        END IF;

        v_new_rev := v_current_rev + 1;

        -- Sincroniza a revisão dentro do JSON para evitar split-brain
        v_updated_layout_json := jsonb_set(p_layout_json, '{revision}', to_jsonb(v_new_rev));

        UPDATE public.product_workspace_layouts
        SET revision = v_new_rev,
            layout_json = v_updated_layout_json,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_existing_id;

    ELSE
        -- CREATE: Exige expectedRevision = 0 para novo registro
        IF p_expected_revision <> 0 THEN
            RAISE EXCEPTION 'CAS_CONFLICT: Layout não existe no banco, mas expectedRevision informado foi % (esperado 0 para novo registro).',
                p_expected_revision
                USING ERRCODE = '40001',
                      DETAIL = format('{"expectedRevision":%s,"actualRevision":null,"productId":"%s"}', p_expected_revision, p_owner_product_id);
        END IF;

        v_new_rev := 1;
        -- Sincroniza a revisão dentro do JSON para nova linha
        v_updated_layout_json := jsonb_set(p_layout_json, '{revision}', to_jsonb(v_new_rev));

        INSERT INTO public.product_workspace_layouts (
            owner_product_id,
            workspace_key,
            schema_version,
            revision,
            layout_json,
            created_at,
            updated_at
        ) VALUES (
            p_owner_product_id,
            p_workspace_key,
            1,
            v_new_rev,
            v_updated_layout_json,
            timezone('utc'::text, now()),
            timezone('utc'::text, now())
        )
        RETURNING id INTO v_existing_id;
    END IF;

    -- 5. Retorno estruturado com paridade de revisão comprovada
    SELECT jsonb_build_object(
        'success', true,
        'id', v_existing_id,
        'owner_product_id', p_owner_product_id,
        'workspace_key', p_workspace_key,
        'revision', v_new_rev,
        'layout', v_updated_layout_json,
        'updated_at', timezone('utc'::text, now())
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 5. Segurança do RPC: Revogação de acesso público e concessão controlada
REVOKE EXECUTE ON FUNCTION public.save_product_workspace_layout_v1(UUID, TEXT, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_product_workspace_layout_v1(UUID, TEXT, INTEGER, JSONB) TO authenticated, service_role;
