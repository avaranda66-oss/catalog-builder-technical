-- ============================================================================
-- REHEARSAL ONLY — DO NOT DEPLOY LIVE
-- HISTORICAL SCHEMA GAP #1: public.media_library
-- First failing migration: 00005_secure_shared_persistence.sql:29
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
