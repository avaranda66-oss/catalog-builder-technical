-- ============================================================================
-- REHEARSAL ONLY
-- DO NOT DEPLOY
-- DERIVED FROM LIVE READ-ONLY INTROSPECTION
-- NOT PART OF PRODUCTION MIGRATION HISTORY
-- ============================================================================
-- HISTORICAL SCHEMA GAP #1: public.media_library
-- First failing migration: 00005_secure_shared_persistence.sql:29
-- Live definition evidence:
--   Columns: id (text, PK), name (text), url (text), category (text, default 'product'),
--            tags (text[], default ARRAY[]::text[]), size_bytes (bigint), created_at (timestamptz, default now())
-- Reason it is safe for rehearsal:
--   public.media_library exists in the live database (bjxqvrpbigwgabwbhtqa) with
--   this exact schema, but its creation is unversioned in the repository migration chain.
--   Migration 00005 alters it and creates policies on it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.media_library (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT DEFAULT 'product'::text,
    tags TEXT[] DEFAULT ARRAY[]::text[],
    size_bytes BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
