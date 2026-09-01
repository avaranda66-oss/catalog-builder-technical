-- =========================================================================
-- MIGRATION 00005: PERSISTÊNCIA COMPARTILHADA SEGURA V2 (RLS, CAS, RPCs)
-- =========================================================================

-- 1. EXPURGO DE POLÍTICAS PÚBLICAS/ANÔNIMAS PERMISSIVAS
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname in ('public', 'storage')
      and (
        policyname ilike '%publico%' or
        policyname ilike '%all_access%' or
        policyname in ('Acesso publico total catalogs', 'catalogs_all_access',
                       'Acesso publico total products', 'products_all_access',
                       'Acesso publico total media', 'media_all_access')
      )
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- 2. GARANTIA DE RLS EM TODAS AS TABELAS DE DOMÍNIO
alter table public.products enable row level security;
alter table public.catalogs enable row level security;
alter table public.media_library enable row level security;
alter table public.field_definitions enable row level security;
alter table public.templates enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_versions enable row level security;
alter table public.product_versions enable row level security;
alter table public.audit_log enable row level security;

-- Revoga DML direto (INSERT, UPDATE, DELETE) em tabelas centrais
revoke all on public.products from anon, authenticated;
revoke all on public.catalogs from anon, authenticated;
revoke all on public.media_library from anon, authenticated;
revoke all on public.catalog_products from anon, authenticated;
revoke all on public.catalog_versions from anon, authenticated;
revoke all on public.product_versions from anon, authenticated;

-- Concede apenas SELECT para authenticated (filtrado pela policy team_read)
grant select on public.products to authenticated;
grant select on public.catalogs to authenticated;
grant select on public.media_library to authenticated;
grant select on public.field_definitions to authenticated;
grant select on public.templates to authenticated;
grant select on public.catalog_products to authenticated;
grant select on public.catalog_versions to authenticated;
grant select on public.product_versions to authenticated;
grant select on public.audit_log to authenticated;

-- Recria policy de leitura segura em cada tabela se não existir
do $$
declare
  t text;
begin
  foreach t in array array[
    'products', 'catalogs', 'media_library', 'field_definitions',
    'templates', 'catalog_products', 'catalog_versions',
    'product_versions', 'audit_log'
  ] loop
    execute format('drop policy if exists team_read on public.%I', t);
    execute format('create policy team_read on public.%I for select to authenticated using (public.team_role() is not null)', t);
  end loop;
end $$;

-- 3. RPC: LISTAGEM DE WORKSPACE COMPARTILHADO (V2)
create or replace function public.list_workspace_v2()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
  current_role public.user_role := public.team_role();
begin
  if current_role is null then
    raise exception 'Acesso não autorizado: sessão corporativa ativa necessária.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'catalogs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'status', c.status,
          'version', coalesce(c.version, 1),
          'brand', c.brand,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'updated_by', c.updated_by
        ) order by c.updated_at desc
      ) from public.catalogs c
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'sku', p.sku,
          'name', p.name,
          'family', p.family,
          'status', p.status,
          'sort_order', p.sort_order,
          'version', coalesce(p.version, 1),
          'data', p.data,
          'created_at', p.created_at,
          'updated_at', p.updated_at
        ) order by p.family, p.sort_order, p.name
      ) from public.products p
    ), '[]'::jsonb),
    'templates', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.name)
      from public.templates t
    ), '[]'::jsonb),
    'userRole', current_role
  ) into result;

  return result;
end $$;

revoke all on function public.list_workspace_v2() from public;
grant execute on function public.list_workspace_v2() to authenticated;

-- 4. RPC: SALVAR PRODUTO OFICIAL COM CAS (V2)
create or replace function public.save_official_product_v2(
  p_product jsonb,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_role public.user_role := public.team_role();
  actor uuid := auth.uid();
  target_id uuid;
  p_sku text;
  p_name text;
  p_family text;
  p_status public.product_status;
  p_sort_order integer;
  p_data jsonb;
  existing public.products;
  saved public.products;
  new_version integer := 1;
begin
  if actor is null or current_role is distinct from 'admin'::public.user_role then
    raise exception 'Apenas o Administrador pode cadastrar ou alterar produtos oficiais.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_product) is distinct from 'object' then
    raise exception 'Payload de produto inválido: objeto esperado.' using errcode = '22023';
  end if;

  p_sku := coalesce(trim(p_product->>'sku'), trim(p_product->>'code'), '');
  p_name := coalesce(trim(p_product->>'name'), trim(p_product->>'model'), p_sku);
  p_family := coalesce(trim(p_product->>'family'), 'Geral');
  p_status := case
    when p_product->>'status' in ('draft', 'review', 'approved', 'published', 'archived')
    then (p_product->>'status')::public.product_status
    else 'published'::public.product_status
  end;
  p_sort_order := case
    when (p_product->>'sort_order') ~ '^\d+$' then (p_product->>'sort_order')::integer
    else 0
  end;
  p_data := coalesce(p_product->'data', p_product->'specs', '{}'::jsonb);

  if p_sku = '' then
    raise exception 'Código/SKU do produto é obrigatório.' using errcode = '22023';
  end if;

  if (p_product->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_id := (p_product->>'id')::uuid;
  else
    target_id := md5('presys-product:' || p_sku)::uuid;
  end if;

  select * into existing from public.products where id = target_id for update;

  if found then
    if p_expected_version is not null and p_expected_version > 0 and existing.version is distinct from p_expected_version then
      raise exception 'Conflito de Concorrência: o produto foi modificado em outro dispositivo (Versão esperada: %, Versão no servidor: %). Recarregue antes de salvar.', p_expected_version, existing.version
        using errcode = '40001';
    end if;

    new_version := coalesce(existing.version, 1) + 1;

    update public.products
    set sku = p_sku,
        name = p_name,
        family = p_family,
        status = p_status,
        sort_order = p_sort_order,
        data = p_data,
        version = new_version,
        updated_by = actor,
        updated_at = now()
    where id = target_id
    returning * into saved;

    insert into public.product_versions(id, product_id, version, snapshot, source, summary, created_by, created_at)
    values (gen_random_uuid(), target_id, new_version, to_jsonb(saved), 'admin', 'Atualização de produto oficial', actor, now());
  else
    insert into public.products(id, sku, name, family, status, sort_order, data, version, updated_by, created_at, updated_at)
    values (target_id, p_sku, p_name, p_family, p_status, p_sort_order, p_data, 1, actor, now(), now())
    returning * into saved;

    insert into public.product_versions(id, product_id, version, snapshot, source, summary, created_by, created_at)
    values (gen_random_uuid(), target_id, 1, to_jsonb(saved), 'admin', 'Criação inicial de produto oficial', actor, now());
  end if;

  return to_jsonb(saved);
end $$;

revoke all on function public.save_official_product_v2(jsonb, integer) from public;
grant execute on function public.save_official_product_v2(jsonb, integer) to authenticated;

-- 5. RPC: SALVAR CATÁLOGO COMPARTILHADO COM CAS (V2)
create or replace function public.save_catalog_v2(
  p_catalog jsonb,
  p_expected_version integer,
  p_summary text default 'Salvamento de catálogo'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_role public.user_role := public.team_role();
  actor uuid := auth.uid();
  target_id uuid;
  c_title text;
  c_status public.catalog_status;
  c_brand jsonb;
  existing public.catalogs;
  saved public.catalogs;
  new_version integer := 1;
begin
  if actor is null or current_role is null or current_role not in ('admin', 'editor') then
    raise exception 'Sem permissão de acesso para salvar catálogos.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_catalog) is distinct from 'object' then
    raise exception 'Payload de catálogo inválido: objeto esperado.' using errcode = '22023';
  end if;

  c_title := coalesce(nullif(trim(p_catalog->>'title'), ''), nullif(trim(p_catalog->>'name'), ''), 'Catálogo Técnico');
  c_status := case
    when p_catalog->>'status' in ('draft', 'review', 'approved', 'published', 'archived')
    then (p_catalog->>'status')::public.catalog_status
    else 'draft'::public.catalog_status
  end;

  c_brand := jsonb_build_object(
    'title', c_title,
    'subtitle', coalesce(p_catalog->>'subtitle', ''),
    'themeId', coalesce(p_catalog->>'themeId', 'default-technical'),
    'pages', coalesce(p_catalog->'pages', '[]'::jsonb),
    'version', coalesce(p_catalog->>'version', '1')
  );

  if (p_catalog->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_id := (p_catalog->>'id')::uuid;
  else
    target_id := md5('presys-catalog:' || c_title)::uuid;
  end if;

  select * into existing from public.catalogs where id = target_id for update;

  if found then
    if p_expected_version is not null and p_expected_version > 0 and existing.version is distinct from p_expected_version then
      raise exception 'Conflito de Concorrência: o catálogo foi modificado em outro dispositivo (Versão esperada: %, Versão no servidor: %). Recarregue antes de salvar.', p_expected_version, existing.version
        using errcode = '40001';
    end if;

    new_version := coalesce(existing.version, 1) + 1;

    update public.catalogs
    set name = c_title,
        status = c_status,
        brand = c_brand,
        version = new_version,
        updated_by = actor,
        content_updated_by = actor,
        updated_at = now()
    where id = target_id
    returning * into saved;

    insert into public.catalog_versions(id, catalog_id, version, status, snapshot, summary, created_by, created_at)
    values (gen_random_uuid(), target_id, new_version, c_status, c_brand, coalesce(p_summary, 'Atualização de catálogo'), actor, now());
  else
    insert into public.catalogs(id, name, status, brand, version, updated_by, content_updated_by, created_at, updated_at)
    values (target_id, c_title, c_status, c_brand, 1, actor, actor, now(), now())
    returning * into saved;

    insert into public.catalog_versions(id, catalog_id, version, status, snapshot, summary, created_by, created_at)
    values (gen_random_uuid(), target_id, 1, c_status, c_brand, coalesce(p_summary, 'Criação inicial do catálogo'), actor, now());
  end if;

  return to_jsonb(saved);
end $$;

revoke all on function public.save_catalog_v2(jsonb, integer, text) from public;
grant execute on function public.save_catalog_v2(jsonb, integer, text) to authenticated;

-- 6. RPC: EXCLUIR CATÁLOGO COMPARTILHADO (V2)
create or replace function public.delete_catalog_v2(
  p_catalog_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_role public.user_role := public.team_role();
  actor uuid := auth.uid();
begin
  if actor is null or current_role is distinct from 'admin'::public.user_role then
    raise exception 'Somente o Administrador pode excluir catálogos compartilhados.' using errcode = '42501';
  end if;

  delete from public.catalog_products where catalog_id = p_catalog_id;
  delete from public.catalog_versions where catalog_id = p_catalog_id;
  delete from public.catalogs where id = p_catalog_id;

  return true;
end $$;

revoke all on function public.delete_catalog_v2(uuid) from public;
grant execute on function public.delete_catalog_v2(uuid) to authenticated;
