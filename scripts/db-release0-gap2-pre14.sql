-- ============================================================================
-- REHEARSAL ONLY — DO NOT DEPLOY LIVE
-- HISTORICAL SCHEMA GAP #2 (PRE-00014 RECONCILIATION):
-- First failing migration: 00014_asset_reference_hardening.sql:211
-- ============================================================================
DROP FUNCTION IF EXISTS public.update_asset_metadata_v1(uuid, text, text, text);
