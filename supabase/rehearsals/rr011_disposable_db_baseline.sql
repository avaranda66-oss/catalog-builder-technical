\set ON_ERROR_STOP on

-- Disposable PostgreSQL baseline for COMPANY.READINESS.RR011.DISPOSABLE-DB.REHEARSAL1.
-- Evidence sources:
--   supabase/migrations/00001_initial_schema.sql
--   supabase/migrations/00004_team_workspace.sql
--   supabase/migrations/00019_fix_reserved_keyword_and_centralize_auth_v1.sql
--   supabase/migrations/00022_product_workbook_persistence.sql
-- This fixture is deliberately minimal and must never be used as a production migration.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
    id UUID PRIMARY KEY,
    email TEXT,
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
    raw_app_meta_data JSONB DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
    SELECT COALESCE(
        NULLIF(current_setting('request.jwt.claim.sub', true), ''),
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )::uuid
$$;

GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TYPE public.user_role AS ENUM ('admin', 'editor', 'viewer');

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role public.user_role DEFAULT 'viewer',
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.team_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active
$$;

REVOKE ALL ON FUNCTION public.team_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.require_document_editor_v1()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_role public.user_role := public.team_role();
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'AUTH_ACTOR_NULL: Usuário não autenticado no servidor.'
            USING ERRCODE = '42501';
    END IF;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'AUTH_ROLE_NULL: Perfil do usuário não encontrado ou inativo.'
            USING ERRCODE = '42501';
    END IF;

    IF v_role NOT IN ('admin', 'editor') THEN
        RAISE EXCEPTION 'AUTH_ROLE_FORBIDDEN: Perfil (%) não autorizado para operações editoriais.', v_role
            USING ERRCODE = '42501';
    END IF;

    RETURN v_actor;
END;
$$;

REVOKE ALL ON FUNCTION public.require_document_editor_v1() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_document_editor_v1() TO authenticated;

CREATE TABLE public.product_source_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN (
        'manual', 'datasheet', 'certificate', 'drawing',
        'standard', 'engineering_note', 'website', 'other'
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
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.product_source_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_read_source_documents
    ON public.product_source_documents
    FOR SELECT TO authenticated
    USING (public.team_role() IS NOT NULL);

REVOKE INSERT, UPDATE, DELETE ON public.product_source_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_source_documents TO authenticated;

-- The legacy function only needs to exist with its real signature and write semantics.
-- The rehearsal verifies that the draft removes all application-role EXECUTE access.
CREATE OR REPLACE FUNCTION public.upsert_source_document_v1(p_document JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_actor UUID := public.require_document_editor_v1();
    v_saved public.product_source_documents;
BEGIN
    INSERT INTO public.product_source_documents (
        id, title, document_type, revision, language, publication_date,
        file_reference, external_url, checksum, metadata,
        created_by, updated_by, created_at, updated_at
    ) VALUES (
        p_document->>'id', p_document->>'title', p_document->>'documentType',
        p_document->>'revision', p_document->>'language', p_document->>'publicationDate',
        p_document->>'fileReference', p_document->>'externalUrl', p_document->>'checksum',
        COALESCE(p_document->'metadata', '{}'::jsonb),
        v_actor, v_actor, now(), now()
    )
    ON CONFLICT (id) DO UPDATE
    SET title = EXCLUDED.title,
        document_type = EXCLUDED.document_type,
        updated_by = v_actor,
        updated_at = now()
    RETURNING * INTO v_saved;

    RETURN to_jsonb(v_saved);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_source_document_v1(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_source_document_v1(JSONB) TO authenticated;

CREATE PUBLICATION supabase_realtime;

INSERT INTO auth.users (id, email) VALUES
    ('11111111-1111-4111-8111-111111111111', 'editor@rr011.invalid'),
    ('22222222-2222-4222-8222-222222222222', 'viewer@rr011.invalid'),
    ('33333333-3333-4333-8333-333333333333', 'inactive-editor@rr011.invalid');

INSERT INTO public.profiles (id, full_name, role, is_active) VALUES
    ('11111111-1111-4111-8111-111111111111', 'RR011 Editor', 'editor', true),
    ('22222222-2222-4222-8222-222222222222', 'RR011 Viewer', 'viewer', true),
    ('33333333-3333-4333-8333-333333333333', 'RR011 Inactive Editor', 'editor', false);

-- Existing pre-CAS row: the draft under test must backfill this row to version 1.
INSERT INTO public.product_source_documents (
    id, title, document_type, revision, metadata, created_at, updated_at
) VALUES (
    'legacy-backfill', 'Legacy row without CAS version', 'manual', 'A', '{}'::jsonb, now(), now()
);

\echo [RR011][BASELINE][PASS] Minimal migration-derived contract created
