-- ============================================================================
-- MIGRATION 00021: FAMILY RENAME + SAFE DELETE HARDENING
-- Phase LIB.F1: Concurrency Token (updated_at), FK Order Repair, Product Guard
-- ============================================================================

-- 1. DELETE FUNCTION V2 (com verificação CAS por expected_updated_at e FK repair)
CREATE OR REPLACE FUNCTION public.delete_product_family_v2(
  p_family_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
  existing public.product_families;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required to delete product families' using errcode = '42501';
  end if;

  select email, raw_user_meta_data->>'full_name' into v_actor_email, v_actor_name from auth.users where id = v_actor;
  if v_actor_name is null or v_actor_name = '' then
    v_actor_name := split_part(v_actor_email, '@', 1);
  end if;

  select * into existing from public.product_families where id = p_family_id;
  if existing.id is null then
    return false;
  end if;

  -- Concurrency Token Check (CAS via updated_at)
  if p_expected_updated_at is not null and existing.updated_at is distinct from p_expected_updated_at then
    raise exception 'FAMILY_CONFLICT: Conflito de Concorrência: a família foi modificada em outro dispositivo (Esperado: %, Atual: %). Recarregue a página.',
      p_expected_updated_at, existing.updated_at using errcode = '40001';
  end if;

  -- Delete Guard: Bloqueia se existir produto canônico (family_id) ou legacy inequívoco (family string)
  if exists (
    select 1 from public.products
    where family_id = p_family_id
       or (family_id is null and lower(trim(family)) = lower(trim(existing.name)))
  ) then
    raise exception 'FAMILY_NOT_EMPTY: Não é possível excluir família contendo produtos associados' using errcode = '23503';
  end if;

  -- FK ORDER REPAIR: Inserir evento de auditoria ANTES de apagar a família.
  -- O FK ON DELETE SET NULL transformará family_id em NULL após o delete,
  -- enquanto entity_id, old_value e summary preservam a identidade histórica.
  insert into public.library_change_events(
    entity_type, entity_id, family_id, action, summary, old_value, actor_id, actor_email, actor_name, created_at
  ) values (
    'family', p_family_id::text, p_family_id, 'DELETE_FAMILY',
    format('Família "%s" excluída', existing.name), existing.name, v_actor, v_actor_email, v_actor_name, now()
  );

  delete from public.product_families where id = p_family_id;

  return true;
end $$;

-- 2. REPARO DE BACKWARD-COMPATIBILITY: delete_product_family_v1 delega para v2
CREATE OR REPLACE FUNCTION public.delete_product_family_v1(p_family_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
begin
  return public.delete_product_family_v2(p_family_id, null);
end $$;

-- 3. SAVE / RENAME FUNCTION V1 (com CAS, duplicate guard e propagação para products)
CREATE OR REPLACE FUNCTION public.save_product_family_v1(p_family jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
  target_id uuid;
  raw_id text;
  v_name text;
  v_slug text;
  v_desc text;
  v_sort integer;
  v_expected_updated_at timestamptz;
  existing public.product_families;
  saved public.product_families;
  v_action text := 'CREATE_FAMILY';
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required to modify product families' using errcode = '42501';
  end if;

  select email, raw_user_meta_data->>'full_name' into v_actor_email, v_actor_name from auth.users where id = v_actor;
  if v_actor_name is null or v_actor_name = '' then
    v_actor_name := split_part(v_actor_email, '@', 1);
  end if;

  v_name := trim(p_family->>'name');
  if v_name is null or v_name = '' then
    raise exception 'Nome da família não pode ser vazio.' using errcode = '22023';
  end if;

  v_slug := coalesce(nullif(trim(p_family->>'slug'), ''), lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')));
  v_desc := p_family->>'description';
  v_sort := coalesce((p_family->>'sort_order')::integer, 0);

  if p_family->>'expected_updated_at' is not null and trim(p_family->>'expected_updated_at') <> '' then
    v_expected_updated_at := (p_family->>'expected_updated_at')::timestamptz;
  else
    v_expected_updated_at := null;
  end if;

  raw_id := trim(p_family->>'id');
  if raw_id is not null and raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_id := raw_id::uuid;
    -- ID é a autoridade canônica primária
    select * into existing from public.product_families where id = target_id;
  else
    target_id := gen_random_uuid();
    -- Se não passou ID, busca por slug apenas para ver se colide
    select * into existing from public.product_families where slug = v_slug;
  end if;

  if existing.id is not null then
    target_id := existing.id;
    v_action := 'RENAME_FAMILY';

    -- Concurrency Token Check (CAS via updated_at)
    if v_expected_updated_at is not null and existing.updated_at is distinct from v_expected_updated_at then
      raise exception 'FAMILY_CONFLICT: Conflito de Concorrência: a família foi modificada em outro dispositivo (Esperado: %, Atual: %). Recarregue a página.',
        v_expected_updated_at, existing.updated_at using errcode = '40001';
    end if;

    -- Prevenção de duplicatas com outro ID
    if exists (
      select 1 from public.product_families
      where (slug = v_slug or lower(name) = lower(v_name))
        and id <> target_id
    ) then
      raise exception 'DUPLICATE_FAMILY_NAME: Já existe uma família com o nome "%"', v_name using errcode = '23505';
    end if;

    -- No-op se o nome e descrição não mudaram
    if existing.name = v_name and coalesce(existing.description, '') = coalesce(v_desc, '') and existing.sort_order = v_sort then
      return to_jsonb(existing);
    end if;

    -- Atualiza product_families com name, slug e updated_at
    update public.product_families
    set name = v_name,
        slug = v_slug,
        description = coalesce(v_desc, description),
        sort_order = coalesce(v_sort, sort_order),
        updated_by = v_actor,
        updated_at = now()
    where id = target_id
    returning * into saved;

    -- Propagação para produtos canônicos vinculados
    update public.products
    set family = v_name
    where family_id = target_id;

    -- Migração inequívoca de produtos legados sem family_id com o nome antigo
    update public.products
    set family_id = target_id,
        family = v_name
    where family_id is null
      and lower(trim(family)) = lower(trim(existing.name));

  else
    -- Criação de nova família
    if exists (
      select 1 from public.product_families
      where slug = v_slug or lower(name) = lower(v_name)
    ) then
      raise exception 'DUPLICATE_FAMILY_NAME: Já existe uma família com o nome "%"', v_name using errcode = '23505';
    end if;

    insert into public.product_families(id, name, slug, description, sort_order, created_by, updated_by, created_at, updated_at)
    values (target_id, v_name, v_slug, v_desc, v_sort, v_actor, v_actor, now(), now())
    returning * into saved;
  end if;

  insert into public.library_change_events(
    entity_type, entity_id, family_id, action, summary, old_value, new_value, actor_id, actor_email, actor_name, created_at
  ) values (
    'family', target_id::text, target_id, v_action,
    case when v_action = 'RENAME_FAMILY' then format('Família renomeada para "%s"', v_name) else format('Nova família "%s" criada', v_name) end,
    existing.name, v_name, v_actor, v_actor_email, v_actor_name, now()
  );

  return to_jsonb(saved);
end $$;

-- 4. PERMISSÕES E ROLES
REVOKE ALL ON FUNCTION public.delete_product_family_v2(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_product_family_v2(uuid, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_product_family_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_product_family_v1(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.save_product_family_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_product_family_v1(jsonb) TO authenticated;
