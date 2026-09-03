-- ============================================================================
-- REHEARSAL ONLY
-- DO NOT DEPLOY
-- DERIVED FROM LIVE READ-ONLY INTROSPECTION
-- NOT PART OF PRODUCTION MIGRATION HISTORY
-- ============================================================================
-- HISTORICAL SCHEMA GAP #2 (POST-00014 RESTORATION):
-- Description:
--   Restores the 4-argument overload of update_asset_metadata_v1 captured verbatim
--   from live read-only introspection on project bjxqvrpbigwgabwbhtqa.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_asset_metadata_v1(
  p_asset_id uuid,
  p_original_filename text DEFAULT NULL::text,
  p_kind text DEFAULT NULL::text,
  p_approval_status text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  into v_actor_email, v_actor_name
  from auth.users where id = v_actor;

  update public.assets set
    original_filename = coalesce(p_original_filename, original_filename),
    kind = coalesce(p_kind, kind),
    approval_status = coalesce(p_approval_status, approval_status),
    updated_by = v_actor,
    updated_at = now()
  where id = p_asset_id;

  insert into public.asset_audit_logs (
    asset_id, action, actor_id, actor_email, actor_name, summary, details
  ) values (
    p_asset_id, 'ASSET_METADATA_UPDATE', v_actor, v_actor_email, v_actor_name,
    'Metadados do asset corporativo atualizados',
    jsonb_build_object('filename', p_original_filename, 'kind', p_kind, 'approval_status', p_approval_status)
  );

  return jsonb_build_object('success', true);
end $function$;

REVOKE ALL ON FUNCTION public.update_asset_metadata_v1(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_asset_metadata_v1(uuid, text, text, text) TO authenticated;
