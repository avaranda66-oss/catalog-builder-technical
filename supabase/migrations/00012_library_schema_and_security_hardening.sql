-- ============================================================================
-- MIGRATION 00012: LIBRARY SCHEMA MATERIALIZATION & SECURITY HARDENING
-- Materialize legacy family fields, harden RLS (remove public write),
-- and secure SECURITY DEFINER RPCs with team_role() authorization.
-- ============================================================================

-- 1. MATERIALIZAÇÃO DE SCHEMAS LEGADOS EM PRODUCT_FAMILY_FIELDS
-- Válvulas de Controle & Posicionadores
INSERT INTO public.product_family_fields (family_id, field_key, label, field_type, sort_order, width, visible, is_system)
SELECT id, 'range', 'Faixa de Medição', 'text', 1, 130, true, false
FROM public.product_families WHERE slug = 'valvulas-de-controle-posicionadores' OR name = 'Válvulas de Controle & Posicionadores'
ON CONFLICT (family_id, field_key) DO NOTHING;

INSERT INTO public.product_family_fields (family_id, field_key, label, field_type, sort_order, width, visible, is_system)
SELECT id, 'unit', 'Unidade', 'text', 2, 80, true, false
FROM public.product_families WHERE slug = 'valvulas-de-controle-posicionadores' OR name = 'Válvulas de Controle & Posicionadores'
ON CONFLICT (family_id, field_key) DO NOTHING;

INSERT INTO public.product_family_fields (family_id, field_key, label, field_type, sort_order, width, visible, is_system)
SELECT id, 'accuracy', 'Exatidão', 'text', 3, 100, true, false
FROM public.product_families WHERE slug = 'valvulas-de-controle-posicionadores' OR name = 'Válvulas de Controle & Posicionadores'
ON CONFLICT (family_id, field_key) DO NOTHING;

INSERT INTO public.product_family_fields (family_id, field_key, label, field_type, sort_order, width, visible, is_system)
SELECT id, 'output', 'Sinal de Saída', 'text', 4, 120, true, false
FROM public.product_families WHERE slug = 'valvulas-de-controle-posicionadores' OR name = 'Válvulas de Controle & Posicionadores'
ON CONFLICT (family_id, field_key) DO NOTHING;

INSERT INTO public.product_family_fields (family_id, field_key, label, field_type, sort_order, width, visible, is_system)
SELECT id, 'processConnection', 'Conexão de Processo', 'text', 5, 150, true, false
FROM public.product_families WHERE slug = 'valvulas-de-controle-posicionadores' OR name = 'Válvulas de Controle & Posicionadores'
ON CONFLICT (family_id, field_key) DO NOTHING;

-- Transmissores de Temperatura
INSERT INTO public.product_family_fields (family_id, field_key, label, field_type, sort_order, width, visible, is_system)
SELECT id, 'range', 'Faixa de Temperatura', 'text', 1, 130, true, false
FROM public.product_families WHERE slug = 'transmissores-de-temperatura' OR name = 'Transmissores de Temperatura'
ON CONFLICT (family_id, field_key) DO NOTHING;

INSERT INTO public.product_family_fields (family_id, field_key, label, field_type, sort_order, width, visible, is_system)
SELECT id, 'unit', 'Unidade', 'text', 2, 80, true, false
FROM public.product_families WHERE slug = 'transmissores-de-temperatura' OR name = 'Transmissores de Temperatura'
ON CONFLICT (family_id, field_key) DO NOTHING;

INSERT INTO public.product_family_fields (family_id, field_key, label, field_type, sort_order, width, visible, is_system)
SELECT id, 'accuracy', 'Exatidão', 'text', 3, 100, true, false
FROM public.product_families WHERE slug = 'transmissores-de-temperatura' OR name = 'Transmissores de Temperatura'
ON CONFLICT (family_id, field_key) DO NOTHING;

INSERT INTO public.product_family_fields (family_id, field_key, label, field_type, sort_order, width, visible, is_system)
SELECT id, 'output', 'Sinal de Saída', 'text', 4, 120, true, false
FROM public.product_families WHERE slug = 'transmissores-de-temperatura' OR name = 'Transmissores de Temperatura'
ON CONFLICT (family_id, field_key) DO NOTHING;

INSERT INTO public.product_family_fields (family_id, field_key, label, field_type, sort_order, width, visible, is_system)
SELECT id, 'processConnection', 'Conexão / Poço', 'text', 5, 150, true, false
FROM public.product_families WHERE slug = 'transmissores-de-temperatura' OR name = 'Transmissores de Temperatura'
ON CONFLICT (family_id, field_key) DO NOTHING;

-- REPLICA IDENTITY FULL para Realtime em tabelas RLS
ALTER TABLE public.product_family_fields REPLICA IDENTITY FULL;
ALTER TABLE public.product_families REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.library_change_events REPLICA IDENTITY FULL;

-- 2. HARDENING DE POLÍTICAS RLS (FECHAR PUBLIC ALL TRUE)
DROP POLICY IF EXISTS "allow_read_product_families" ON public.product_families;
DROP POLICY IF EXISTS "allow_write_product_families" ON public.product_families;
DROP POLICY IF EXISTS "allow_read_product_family_fields" ON public.product_family_fields;
DROP POLICY IF EXISTS "allow_write_product_family_fields" ON public.product_family_fields;
DROP POLICY IF EXISTS "allow_read_library_change_events" ON public.library_change_events;
DROP POLICY IF EXISTS "allow_write_library_change_events" ON public.library_change_events;

-- product_families
CREATE POLICY "product_families_authenticated_select" ON public.product_families
    FOR SELECT TO authenticated USING (public.team_role() IS NOT NULL);

CREATE POLICY "product_families_admin_write" ON public.product_families
    FOR ALL TO authenticated USING (public.team_role() = 'admin') WITH CHECK (public.team_role() = 'admin');

-- product_family_fields
CREATE POLICY "product_family_fields_authenticated_select" ON public.product_family_fields
    FOR SELECT TO authenticated USING (public.team_role() IS NOT NULL);

CREATE POLICY "product_family_fields_admin_write" ON public.product_family_fields
    FOR ALL TO authenticated USING (public.team_role() = 'admin') WITH CHECK (public.team_role() = 'admin');

-- library_change_events (Audit é append-only via SECURITY DEFINER)
CREATE POLICY "library_change_events_authenticated_select" ON public.library_change_events
    FOR SELECT TO authenticated USING (public.team_role() IS NOT NULL);

CREATE POLICY "library_change_events_prevent_direct_mutation" ON public.library_change_events
    FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "library_change_events_prevent_update" ON public.library_change_events
    FOR UPDATE TO authenticated USING (false);

CREATE POLICY "library_change_events_prevent_delete" ON public.library_change_events
    FOR DELETE TO authenticated USING (false);

-- products table
DROP POLICY IF EXISTS "products_admin_write" ON public.products;
CREATE POLICY "products_admin_write" ON public.products
    FOR ALL TO authenticated USING (public.team_role() = 'admin') WITH CHECK (public.team_role() = 'admin');

-- 3. HARDENING DE TODAS AS RPCS (ZERO HARDCODED UUID / ROLE VALIDATION)

-- list_library_workspace_v1
CREATE OR REPLACE FUNCTION public.list_library_workspace_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_families jsonb;
  v_fields jsonb;
  v_products jsonb;
  v_events jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(f) order by f.sort_order, f.name), '[]'::jsonb)
  into v_families from public.product_families f;

  select coalesce(jsonb_agg(to_jsonb(fld) order by fld.sort_order, fld.label), '[]'::jsonb)
  into v_fields from public.product_family_fields fld;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order, p.created_at desc), '[]'::jsonb)
  into v_products from public.products p;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
  into v_events from (
    select * from public.library_change_events order by created_at desc limit 100
  ) e;

  return jsonb_build_object(
    'families', v_families,
    'fields', v_fields,
    'products', v_products,
    'events', v_events
  );
end $$;

-- save_product_family_v1
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

  raw_id := trim(p_family->>'id');
  if raw_id is not null and raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_id := raw_id::uuid;
  else
    target_id := gen_random_uuid();
  end if;

  select * into existing from public.product_families where id = target_id or slug = v_slug;

  if existing.id is not null then
    target_id := existing.id;
    v_action := 'RENAME_FAMILY';
    update public.product_families
    set name = v_name,
        description = v_desc,
        sort_order = v_sort,
        updated_by = v_actor,
        updated_at = now()
    where id = target_id
    returning * into saved;
  else
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

-- delete_product_family_v1
CREATE OR REPLACE FUNCTION public.delete_product_family_v1(p_family_id uuid)
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

  -- Impede exclusão de família com produtos associados
  if exists (select 1 from public.products where family_id = p_family_id) then
    raise exception 'FAMILY_NOT_EMPTY: Não é possível excluir família contendo produtos associados' using errcode = '23503';
  end if;

  delete from public.product_families where id = p_family_id;

  insert into public.library_change_events(
    entity_type, entity_id, family_id, action, summary, old_value, actor_id, actor_email, actor_name, created_at
  ) values (
    'family', p_family_id::text, p_family_id, 'DELETE_FAMILY',
    format('Família "%s" excluída', existing.name), existing.name, v_actor, v_actor_email, v_actor_name, now()
  );

  return true;
end $$;

-- save_family_field_v1
CREATE OR REPLACE FUNCTION public.save_family_field_v1(p_field jsonb)
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
  v_family_id uuid;
  v_key text;
  v_label text;
  v_type text;
  v_unit text;
  v_sort integer;
  v_width integer;
  v_visible boolean;
  v_system boolean;
  existing public.product_family_fields;
  saved public.product_family_fields;
  v_action text := 'ADD_COLUMN';
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required to modify family fields' using errcode = '42501';
  end if;

  select email, raw_user_meta_data->>'full_name' into v_actor_email, v_actor_name from auth.users where id = v_actor;
  if v_actor_name is null or v_actor_name = '' then
    v_actor_name := split_part(v_actor_email, '@', 1);
  end if;

  raw_id := trim(p_field->>'id');
  if raw_id is not null and raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_id := raw_id::uuid;
  end if;

  if p_field->>'family_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_family_id := (p_field->>'family_id')::uuid;
  end if;

  v_label := trim(p_field->>'label');
  if v_label is null or v_label = '' then
    raise exception 'Rótulo da coluna é obrigatório.' using errcode = '22023';
  end if;

  v_type := coalesce(p_field->>'field_type', 'text');
  v_unit := p_field->>'unit';
  v_sort := coalesce((p_field->>'sort_order')::integer, 0);
  v_width := coalesce((p_field->>'width')::integer, 130);
  v_visible := coalesce((p_field->>'visible')::boolean, true);
  v_system := coalesce((p_field->>'is_system')::boolean, false);

  if target_id is not null then
    select * into existing from public.product_family_fields where id = target_id;
  end if;

  if existing.id is null and v_family_id is not null and p_field->>'field_key' is not null then
    select * into existing from public.product_family_fields where family_id = v_family_id and field_key = trim(p_field->>'field_key');
  end if;

  if existing.id is not null then
    target_id := existing.id;
    v_key := existing.field_key; -- field_key permanece imutável em updates
    v_family_id := existing.family_id;
    v_action := 'RENAME_COLUMN';

    update public.product_family_fields
    set label = v_label,
        field_type = v_type,
        unit = coalesce(v_unit, unit),
        sort_order = case when p_field ? 'sort_order' then v_sort else sort_order end,
        width = case when p_field ? 'width' then v_width else width end,
        visible = case when p_field ? 'visible' then v_visible else visible end,
        updated_by = v_actor,
        updated_at = now()
    where id = target_id
    returning * into saved;
  else
    if target_id is null then
      target_id := gen_random_uuid();
    end if;

    v_key := trim(p_field->>'field_key');
    if v_key is null or v_key = '' then
      raise exception 'Chave da coluna é obrigatória na criação.' using errcode = '22023';
    end if;

    if v_family_id is null then
      raise exception 'ID da família é obrigatório.' using errcode = '22023';
    end if;

    insert into public.product_family_fields(id, family_id, field_key, label, field_type, unit, sort_order, width, visible, is_system, created_by, updated_by, created_at, updated_at)
    values (target_id, v_family_id, v_key, v_label, v_type, v_unit, v_sort, v_width, v_visible, v_system, v_actor, v_actor, now(), now())
    returning * into saved;
  end if;

  insert into public.library_change_events(
    entity_type, entity_id, family_id, field_key, action, summary, old_value, new_value, actor_id, actor_email, actor_name, created_at
  ) values (
    'column', target_id::text, v_family_id, v_key, v_action,
    case when v_action = 'RENAME_COLUMN' then format('Coluna "%s" renomeada para "%s"', v_key, v_label) else format('Nova coluna "%s" adicionada', v_label) end,
    existing.label, v_label, v_actor, v_actor_email, v_actor_name, now()
  );

  return to_jsonb(saved);
end $$;

-- delete_family_field_v1
CREATE OR REPLACE FUNCTION public.delete_family_field_v1(p_field_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
  existing public.product_family_fields;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required to delete family fields' using errcode = '42501';
  end if;

  select email, raw_user_meta_data->>'full_name' into v_actor_email, v_actor_name from auth.users where id = v_actor;
  if v_actor_name is null or v_actor_name = '' then
    v_actor_name := split_part(v_actor_email, '@', 1);
  end if;

  select * into existing from public.product_family_fields where id = p_field_id;
  if existing.id is null then
    return false;
  end if;

  delete from public.product_family_fields where id = p_field_id;

  insert into public.library_change_events(
    entity_type, entity_id, family_id, field_key, action, summary, old_value, actor_id, actor_email, actor_name, created_at
  ) values (
    'column', p_field_id::text, existing.family_id, existing.field_key, 'DELETE_COLUMN',
    format('Coluna "%s" excluída', existing.label), existing.label, v_actor, v_actor_email, v_actor_name, now()
  );

  return true;
end $$;

-- save_product_v4
CREATE OR REPLACE FUNCTION public.save_product_v4(
  p_product jsonb,
  p_expected_version integer,
  p_changes jsonb DEFAULT NULL::jsonb,
  p_summary text DEFAULT 'Atualização de produto'::text
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
  target_id uuid;
  raw_id text;
  v_sku text;
  v_name text;
  v_family text;
  v_family_id uuid;
  v_status text;
  v_sort integer;
  v_data jsonb;
  existing public.products;
  saved public.products;
  new_version integer := 1;
  v_diff_count integer := 0;
  k text;
  ck text;
  v_old_val text;
  v_new_val text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required to save products' using errcode = '42501';
  end if;

  select email, raw_user_meta_data->>'full_name' into v_actor_email, v_actor_name from auth.users where id = v_actor;
  if v_actor_name is null or v_actor_name = '' then
    v_actor_name := split_part(v_actor_email, '@', 1);
  end if;

  if jsonb_typeof(p_product) is distinct from 'object' then
    raise exception 'Payload de produto inválido: objeto esperado.' using errcode = '22023';
  end if;

  raw_id := trim(p_product->>'id');
  if raw_id is not null and raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_id := raw_id::uuid;
  else
    target_id := gen_random_uuid();
  end if;

  v_sku := coalesce(nullif(trim(p_product->>'code'), ''), nullif(trim(p_product->>'sku'), ''), 'SKU-TEMP');
  v_name := coalesce(nullif(trim(p_product->>'model'), ''), nullif(trim(p_product->>'name'), ''), 'Produto Sem Nome');
  v_family := coalesce(trim(p_product->>'family'), 'Geral');
  
  if p_product->>'family_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_family_id := (p_product->>'family_id')::uuid;
  else
    select id into v_family_id from public.product_families where name = v_family or slug = lower(regexp_replace(v_family, '[^a-zA-Z0-9]+', '-', 'g')) limit 1;
  end if;

  v_status := coalesce(p_product->>'status', 'draft');
  v_sort := coalesce((p_product->>'sort_order')::integer, 0);
  v_data := coalesce(p_product->'specs', p_product->'data', '{}'::jsonb);

  select * into existing from public.products where id = target_id for update;

  if found then
    -- CAS Check
    if p_expected_version is not null and p_expected_version > 0 and existing.version is distinct from p_expected_version then
      raise exception 'Conflito de Concorrência no Produto: modificado em outro dispositivo (Esperado: %, Servidor: %).', p_expected_version, existing.version
        using errcode = '40001';
    end if;

    new_version := coalesce(existing.version, 1) + 1;

    update public.products
    set sku = v_sku,
        name = v_name,
        family = v_family,
        family_id = v_family_id,
        sort_order = v_sort,
        data = v_data,
        version = new_version,
        updated_by = v_actor,
        updated_at = now()
    where id = target_id
    returning * into saved;

    insert into public.product_versions(id, product_id, version, snapshot, summary, created_by, created_at)
    values (gen_random_uuid(), target_id, new_version, jsonb_build_object('sku', v_sku, 'name', v_name, 'family', v_family, 'data', v_data), coalesce(p_summary, 'Atualização de produto'), v_actor, now());

    -- Diff de colunas raiz
    if existing.sku is distinct from v_sku then
      v_diff_count := v_diff_count + 1;
      insert into public.library_change_events(entity_type, entity_id, family_id, product_id, field_key, action, summary, old_value, new_value, actor_id, actor_email, actor_name, created_at)
      values ('product', target_id::text, v_family_id, target_id, 'code', 'UPDATE_CELL', format('Código alterado de "%s" para "%s"', existing.sku, v_sku), existing.sku, v_sku, v_actor, v_actor_email, v_actor_name, now());
    end if;

    if existing.name is distinct from v_name then
      v_diff_count := v_diff_count + 1;
      insert into public.library_change_events(entity_type, entity_id, family_id, product_id, field_key, action, summary, old_value, new_value, actor_id, actor_email, actor_name, created_at)
      values ('product', target_id::text, v_family_id, target_id, 'model', 'UPDATE_CELL', format('Modelo alterado de "%s" para "%s"', existing.name, v_name), existing.name, v_name, v_actor, v_actor_email, v_actor_name, now());
    end if;

    if existing.family is distinct from v_family then
      v_diff_count := v_diff_count + 1;
      insert into public.library_change_events(entity_type, entity_id, family_id, product_id, field_key, action, summary, old_value, new_value, actor_id, actor_email, actor_name, created_at)
      values ('product', target_id::text, v_family_id, target_id, 'family', 'UPDATE_CELL', format('Família alterada de "%s" para "%s"', existing.family, v_family), existing.family, v_family, v_actor, v_actor_email, v_actor_name, now());
    end if;

    -- Diff de campos JSONB specs/data
    for k in
      select distinct key from (
        select jsonb_object_keys(existing.data) as key
        union
        select jsonb_object_keys(v_data) as key
      ) keys_union where key <> 'customSpecs'
    loop
      v_old_val := existing.data->>k;
      v_new_val := v_data->>k;
      if v_old_val is distinct from v_new_val then
        v_diff_count := v_diff_count + 1;
        insert into public.library_change_events(entity_type, entity_id, family_id, product_id, field_key, action, summary, old_value, new_value, actor_id, actor_email, actor_name, created_at)
        values ('product', target_id::text, v_family_id, target_id, k, 'UPDATE_CELL', format('Campo "%s" alterado de "%s" para "%s" em %s', k, coalesce(v_old_val, ''), coalesce(v_new_val, ''), v_name), v_old_val, v_new_val, v_actor, v_actor_email, v_actor_name, now());
      end if;
    end loop;

    -- Diff de customSpecs
    for ck in
      select distinct ckey from (
        select jsonb_object_keys(coalesce(existing.data->'customSpecs', '{}'::jsonb)) as ckey
        union
        select jsonb_object_keys(coalesce(v_data->'customSpecs', '{}'::jsonb)) as ckey
      ) ckeys_union
    loop
      v_old_val := existing.data->'customSpecs'->>ck;
      v_new_val := v_data->'customSpecs'->>ck;
      if v_old_val is distinct from v_new_val then
        v_diff_count := v_diff_count + 1;
        insert into public.library_change_events(entity_type, entity_id, family_id, product_id, field_key, action, summary, old_value, new_value, actor_id, actor_email, actor_name, created_at)
        values ('product', target_id::text, v_family_id, target_id, ck, 'UPDATE_CELL', format('Especificação customizada "%s" alterada de "%s" para "%s" em %s', ck, coalesce(v_old_val, ''), coalesce(v_new_val, ''), v_name), v_old_val, v_new_val, v_actor, v_actor_email, v_actor_name, now());
      end if;
    end loop;

    if v_diff_count = 0 then
      insert into public.library_change_events(entity_type, entity_id, family_id, product_id, action, summary, actor_id, actor_email, actor_name, created_at)
      values ('product', target_id::text, v_family_id, target_id, 'UPDATE_PRODUCT', coalesce(p_summary, format('Produto "%s" atualizado', v_name)), v_actor, v_actor_email, v_actor_name, now());
    end if;

  else
    new_version := 1;

    insert into public.products(id, sku, name, family, family_id, sort_order, data, version, updated_by, created_at, updated_at)
    values (target_id, v_sku, v_name, v_family, v_family_id, v_sort, v_data, new_version, v_actor, now(), now())
    returning * into saved;

    insert into public.product_versions(id, product_id, version, snapshot, summary, created_by, created_at)
    values (gen_random_uuid(), target_id, new_version, jsonb_build_object('sku', v_sku, 'name', v_name, 'family', v_family, 'data', v_data), coalesce(p_summary, 'Criação de produto'), v_actor, now());

    insert into public.library_change_events(entity_type, entity_id, family_id, product_id, action, summary, new_value, actor_id, actor_email, actor_name, created_at)
    values ('product', target_id::text, v_family_id, target_id, 'CREATE_PRODUCT', format('Produto "%s" (%s) criado', v_name, v_sku), v_name, v_actor, v_actor_email, v_actor_name, now());
  end if;

  return to_jsonb(saved);
end $$;

-- save_product_v3 (Proxy seguro para v4)
CREATE OR REPLACE FUNCTION public.save_product_v3(
  p_product jsonb,
  p_expected_version integer,
  p_field_key text DEFAULT NULL::text,
  p_summary text DEFAULT 'Atualização de produto'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
begin
  return public.save_product_v4(p_product, p_expected_version, null, p_summary);
end $$;

-- delete_product_v3
CREATE OR REPLACE FUNCTION public.delete_product_v3(p_product_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
  existing public.products;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required to delete products' using errcode = '42501';
  end if;

  select email, raw_user_meta_data->>'full_name' into v_actor_email, v_actor_name from auth.users where id = v_actor;
  if v_actor_name is null or v_actor_name = '' then
    v_actor_name := split_part(v_actor_email, '@', 1);
  end if;

  select * into existing from public.products where id = p_product_id;
  if existing.id is null then
    return false;
  end if;

  insert into public.library_change_events(
    entity_type, entity_id, family_id, product_id, action, summary, old_value, actor_id, actor_email, actor_name, created_at
  ) values (
    'product', p_product_id::text, existing.family_id, NULL, 'DELETE_PRODUCT',
    format('Produto "%s" (%s) excluído', existing.name, existing.sku), existing.name, v_actor, v_actor_email, v_actor_name, now()
  );

  delete from public.products where id = p_product_id;

  return true;
end $$;

-- 4. REVOKE DE PUBLIC/ANON E GRANTS EXCLUSIVOS PARA AUTHENTICATED
REVOKE ALL ON FUNCTION public.list_library_workspace_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_library_workspace_v1() TO authenticated;

REVOKE ALL ON FUNCTION public.save_product_family_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_product_family_v1(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_product_family_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_product_family_v1(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.save_family_field_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_family_field_v1(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_family_field_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_family_field_v1(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.save_product_v4(jsonb, integer, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_product_v4(jsonb, integer, jsonb, text) TO authenticated;

REVOKE ALL ON FUNCTION public.save_product_v3(jsonb, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_product_v3(jsonb, integer, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_product_v3(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_product_v3(uuid) TO authenticated;
