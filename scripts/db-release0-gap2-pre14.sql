-- ============================================================================
-- REHEARSAL ONLY
-- DO NOT DEPLOY
-- DERIVED FROM LIVE READ-ONLY INTROSPECTION
-- NOT PART OF PRODUCTION MIGRATION HISTORY
-- ============================================================================
-- HISTORICAL SCHEMA GAP #2 (PRE-00014 RECONCILIATION):
-- First failing migration: 00014_asset_reference_hardening.sql:211
-- Description:
--   Migration 00013 created update_asset_metadata_v1(uuid, text, text, text).
--   Migration 00014 creates update_asset_metadata_v1(uuid, text, text) without dropping
--   the 4-argument version, creating an overload. Line 211 then executes:
--     COMMENT ON FUNCTION public.update_asset_metadata_v1 IS ...
--   without argument types, causing PostgreSQL error 42725 (function name is not unique).
--   In live (bjxqvrpbigwgabwbhtqa), both functions exist and neither has a comment.
--   Dropping the 4-arg function before 00014 allows 00014 to apply cleanly.
-- ============================================================================

DROP FUNCTION IF EXISTS public.update_asset_metadata_v1(uuid, text, text, text);
