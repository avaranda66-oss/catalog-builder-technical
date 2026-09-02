-- ============================================================================
-- Migration: 00014_asset_reference_hardening.sql
-- Description: Hardening server-side invariants for Product Assets:
-- 1. Rejeita vinculação ou set_primary de assets com approval_status IN ('archived', 'rejected').
-- 2. Torna original_filename imutável no update_asset_metadata_v1 para preservar a proveniência do upload.
-- ============================================================================

-- RPC: link_product_asset_v1 (Hardened)
CREATE OR REPLACE FUNCTION public.link_product_asset_v1(
  p_product_id uuid,
  p_asset_id uuid,
  p_role text DEFAULT 'hero',
  p_is_primary boolean DEFAULT false,
  p_caption text DEFAULT NULL,
  p_angle text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
  v_asset_status text;
  v_product_asset public.product_assets%ROWTYPE;
  v_has_primary boolean := false;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required to link assets' using errcode = '42501';
  end if;

  -- Validação de Disponibilidade do Asset no Banco
  select approval_status into v_asset_status from public.assets where id = p_asset_id;
  if not found then
    return jsonb_build_object('success', false, 'code', 'ASSET_NOT_FOUND', 'error', 'Asset não encontrado');
  end if;

  if v_asset_status in ('archived', 'rejected') then
    return jsonb_build_object(
      'success', false,
      'code', 'ASSET_NOT_AVAILABLE',
      'error', 'Este asset está arquivado ou rejeitado e não pode ser vinculado a novos produtos.'
    );
  end if;

  select email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  into v_actor_email, v_actor_name
  from auth.users where id = v_actor;

  if p_is_primary then
    update public.product_assets 
    set is_primary = false 
    where product_id = p_product_id and role = p_role;
  else
    select exists(
      select 1 from public.product_assets 
      where product_id = p_product_id and role = p_role and is_primary = true
    ) into v_has_primary;
  end if;

  insert into public.product_assets (
    product_id, asset_id, role, angle, sort_order,
    is_primary, is_official, caption, created_by
  ) values (
    p_product_id, p_asset_id, p_role, coalesce(p_angle, 'unknown'),
    (select coalesce(max(sort_order), -1) + 1 from public.product_assets where product_id = p_product_id),
    case when p_is_primary then true when not v_has_primary then true else false end,
    false, p_caption, v_actor
  )
  on conflict (product_id, asset_id, role) do update set
    angle = coalesce(p_angle, public.product_assets.angle),
    caption = coalesce(p_caption, public.product_assets.caption),
    is_primary = case when p_is_primary then true else public.product_assets.is_primary end
  returning * into v_product_asset;

  insert into public.asset_audit_logs (
    asset_id, product_id, action, actor_id, actor_email, actor_name, summary, details
  ) values (
    p_asset_id, p_product_id, 'ASSET_LINK_PRODUCT', v_actor, v_actor_email, v_actor_name,
    'Vínculo de asset ao produto com role: ' || p_role,
    jsonb_build_object('role', p_role, 'is_primary', p_is_primary)
  );

  return jsonb_build_object('success', true, 'product_asset', to_jsonb(v_product_asset));
end $$;

-- RPC: set_primary_product_asset_v1 (Hardened)
CREATE OR REPLACE FUNCTION public.set_primary_product_asset_v1(
  p_product_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
  v_target public.product_assets%ROWTYPE;
  v_asset_status text;
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

  select * into v_target from public.product_assets where id = p_product_asset_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Vínculo não encontrado');
  end if;

  -- Checar status do asset subjacente
  select approval_status into v_asset_status from public.assets where id = v_target.asset_id;
  if v_asset_status in ('archived', 'rejected') then
    return jsonb_build_object(
      'success', false,
      'code', 'ASSET_NOT_AVAILABLE',
      'error', 'Assets arquivados ou rejeitados não podem ser definidos como Foto Principal.'
    );
  end if;

  -- Desmarcar anteriores do mesmo produto e role
  update public.product_assets
  set is_primary = false
  where product_id = v_target.product_id and role = v_target.role and id <> p_product_asset_id;

  -- Marcar o alvo como primary
  update public.product_assets
  set is_primary = true
  where id = p_product_asset_id;

  insert into public.asset_audit_logs (
    asset_id, product_id, action, actor_id, actor_email, actor_name, summary, details
  ) values (
    v_target.asset_id, v_target.product_id, 'ASSET_SET_PRIMARY', v_actor, v_actor_email, v_actor_name,
    'Asset definido como Foto Principal para o role ' || v_target.role,
    jsonb_build_object('role', v_target.role)
  );

  return jsonb_build_object('success', true);
end $$;

-- RPC: update_asset_metadata_v1 (Hardened: original_filename é imutável)
CREATE OR REPLACE FUNCTION public.update_asset_metadata_v1(
  p_asset_id uuid,
  p_kind text DEFAULT NULL,
  p_approval_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
  v_asset public.assets%ROWTYPE;
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
    kind = coalesce(p_kind, kind),
    approval_status = coalesce(p_approval_status, approval_status),
    updated_at = now(),
    updated_by = v_actor
  where id = p_asset_id
  returning * into v_asset;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Asset não encontrado');
  end if;

  insert into public.asset_audit_logs (
    asset_id, action, actor_id, actor_email, actor_name, summary, details
  ) values (
    p_asset_id, 'ASSET_METADATA_UPDATE', v_actor, v_actor_email, v_actor_name,
    'Atualização de metadados gerais do asset corporativo',
    jsonb_build_object('kind', p_kind, 'approval_status', p_approval_status)
  );

  return jsonb_build_object('success', true, 'asset', to_jsonb(v_asset));
end $$;

COMMENT ON FUNCTION public.link_product_asset_v1 IS 'Vincula asset corporativo a produto com validação de status disponível (rejeita archived/rejected)';
COMMENT ON FUNCTION public.set_primary_product_asset_v1 IS 'Define foto principal com validação de status disponível';
COMMENT ON FUNCTION public.update_asset_metadata_v1 IS 'Atualiza metadados gerais preservando o original_filename imutável';
