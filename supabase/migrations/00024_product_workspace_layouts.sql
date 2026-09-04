-- ============================================================================
-- MIGRATION DRAFT: 00024_product_workspace_layouts.sql
-- SPECIFICATION ONLY — DO NOT APPLY LIVE AT THIS STAGE — NO DDL EXECUTION
--
-- MISSION: PIM.MEGA.WORKSPACE.FOUNDATION1B (Hardening)
-- PURPOSE: Define the canonical persistence schema for customizable Mega Product
--          Workspace Layouts in an independent relational entity, strictly
--          decoupling human presentation revision from technical data truth revision.
--
-- INVARIANTS:
-- 1. ProductWorkbook.revision != ProductWorkspaceLayout.revision
-- 2. CAS is independent (optimistic concurrency per layout).
-- 3. layout_json contains references only (datumId, datasetId), zero technical values.
-- ============================================================================

-- Table draft: product_workspace_layouts
CREATE TABLE IF NOT EXISTS public.product_workspace_layouts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    owner_product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
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

-- Index draft for fast lookup by product
CREATE INDEX IF NOT EXISTS idx_product_workspace_layouts_owner
    ON public.product_workspace_layouts(owner_product_id, workspace_key);

-- Independent CAS RPC Draft: save_product_workspace_layout
-- NOTE: Draft only. Will be authorized and tested in PIM.MEGA.WORKSPACE.INTEGRATION1.
CREATE OR REPLACE FUNCTION public.save_product_workspace_layout(
    p_owner_product_id TEXT,
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
    v_existing_id TEXT;
    v_current_rev INTEGER;
    v_new_rev INTEGER;
    v_result JSONB;
BEGIN
    -- 1. Lock existing row for optimistic concurrency control
    SELECT id, revision INTO v_existing_id, v_current_rev
    FROM public.product_workspace_layouts
    WHERE owner_product_id = p_owner_product_id AND workspace_key = p_workspace_key
    FOR UPDATE;

    -- 2. If row exists, verify expected_revision
    IF FOUND THEN
        IF p_expected_revision IS NOT NULL AND v_current_rev != p_expected_revision THEN
            RAISE EXCEPTION 'CAS_CONFLICT: Layout revision mismatch. Current: %, Expected: %', v_current_rev, p_expected_revision
                USING ERRCODE = 'P0001';
        END IF;

        v_new_rev := v_current_rev + 1;

        UPDATE public.product_workspace_layouts
        SET revision = v_new_rev,
            layout_json = p_layout_json,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_existing_id;

    ELSE
        -- 3. Insert new default layout
        v_new_rev := 1;
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
            p_layout_json,
            timezone('utc'::text, now()),
            timezone('utc'::text, now())
        )
        RETURNING id INTO v_existing_id;
    END IF;

    SELECT jsonb_build_object(
        'success', true,
        'id', v_existing_id,
        'owner_product_id', p_owner_product_id,
        'workspace_key', p_workspace_key,
        'revision', v_new_rev,
        'updated_at', timezone('utc'::text, now())
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- RLS Draft Policies (To be applied in production release cycle)
-- ALTER TABLE public.product_workspace_layouts ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can read workspace layouts for active products"
--     ON public.product_workspace_layouts FOR SELECT
--     USING (true);
-- CREATE POLICY "Authorized editors can modify workspace layouts"
--     ON public.product_workspace_layouts FOR ALL
--     USING (auth.role() = 'authenticated');
