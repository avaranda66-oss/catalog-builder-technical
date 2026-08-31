-- Additive corporate workspace migration. Apply only after a verified backup.
-- Legacy catalogs/brand payloads remain intact; no catalog or product is deleted.
begin;

-- Existing provisioned profiles retain access; new signups need administrator
-- activation even if the Auth project's public signup setting is enabled.
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles alter column is_active set default false;

create or replace function public.team_role()
returns public.user_role language sql stable security definer
set search_path = pg_catalog, public
as $$ select role from public.profiles where id = auth.uid() and is_active $$;
revoke all on function public.team_role() from public;
grant execute on function public.team_role() to authenticated;

alter table public.profiles alter column role set default 'viewer';
create or replace function public.provision_team_profile()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$ begin
  insert into public.profiles(id, full_name, role, is_active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'viewer', false)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.provision_team_profile() from public;
drop trigger if exists on_auth_user_created_catalog on auth.users;
create trigger on_auth_user_created_catalog after insert on auth.users
for each row execute function public.provision_team_profile();
insert into public.profiles(id,full_name,role,is_active)
select id,coalesce(raw_user_meta_data->>'full_name',email),'viewer',false from auth.users
on conflict (id) do nothing;

-- Source catalog remains provenance. Shared products survive document deletion.
alter table public.products drop constraint if exists products_catalog_id_fkey;
alter table public.products alter column catalog_id drop not null;
alter table public.products add constraint products_catalog_id_fkey
foreign key (catalog_id) references public.catalogs(id) on delete set null;
alter table public.products add column if not exists legacy_id text;
alter table public.catalogs add column if not exists content_updated_by uuid references public.profiles(id);
alter table public.catalogs add column if not exists approved_by uuid references public.profiles(id);
alter table public.catalogs add column if not exists approved_at timestamptz;

create table if not exists public.catalog_products (
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  sort_order integer not null default 0,
  primary key(catalog_id, product_id)
);
create index if not exists idx_catalog_products_product on public.catalog_products(product_id);
insert into public.catalog_products(catalog_id,product_id,sort_order)
select catalog_id,id,coalesce(sort_order,0) from public.products where catalog_id is not null
on conflict do nothing;

-- Non-UUID identifiers used by the previous local editor receive stable UUIDs.
create or replace function public.workspace_uuid(p_value text, p_catalog uuid, p_kind text)
returns uuid language sql immutable set search_path = pg_catalog
as $$ select case
  when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid
  else md5(p_catalog::text || ':' || p_kind || ':' || coalesce(p_value,''))::uuid end $$;

-- Preserve every legacy JSON entry. Conflicting SKUs remain in the original brand
-- backup and are imported under a migration-only code, never silently merged.
do $$ declare c record; p jsonb; product_uuid uuid; legacy_sku text; duplicate_code boolean; begin
  for c in select id,brand from public.catalogs where jsonb_typeof(brand->'products') = 'array' loop
    for p in select value from jsonb_array_elements(c.brand->'products') loop
      product_uuid := public.workspace_uuid(coalesce(p->>'id', p->>'sku', md5(p::text)), c.id, 'product');
      if exists(select 1 from public.products existing where existing.id=product_uuid and (
        existing.sku is distinct from p->>'sku' or existing.name is distinct from p->>'name'
        or existing.family is distinct from coalesce(p->>'family','')
        or existing.data is distinct from coalesce(p->'data','{}'::jsonb))) then
        -- The JSON bundle and relational row disagreed. Keep both for review.
        product_uuid := public.workspace_uuid(coalesce(p->>'id',p->>'sku',md5(p::text)) || ':legacy-conflict',c.id,'product');
      end if;
      legacy_sku := coalesce(nullif(p->>'sku',''), 'LEGACY-' || left(product_uuid::text,8));
      select exists(select 1 from public.products where catalog_id=c.id and sku=legacy_sku and id<>product_uuid) into duplicate_code;
      if duplicate_code then legacy_sku := legacy_sku || '-LEGACY-' || left(product_uuid::text,8); end if;
      insert into public.products(id,catalog_id,sku,name,family,status,sort_order,data,version,legacy_id)
      values(product_uuid,c.id,legacy_sku,coalesce(nullif(p->>'name',''),legacy_sku),coalesce(p->>'family',''),
        case when p->>'status' in ('draft','review','approved','published','archived') then (p->>'status')::public.product_status else 'draft' end,
        case when p->>'sort_order' ~ '^\d+$' then (p->>'sort_order')::int else 0 end,
        case when jsonb_typeof(p->'data')='object' then p->'data' else '{}'::jsonb end,
        case when p->>'version' ~ '^[1-9]\d*$' then (p->>'version')::int else 1 end,p->>'id')
      on conflict(id) do nothing;
      insert into public.catalog_products(catalog_id,product_id,sort_order)
      values(c.id,product_uuid,case when p->>'sort_order' ~ '^\d+$' then (p->>'sort_order')::int else 0 end)
      on conflict do nothing;
    end loop;
  end loop;
end $$;

create table if not exists public.catalog_versions (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete restrict,
  version integer not null,
  status public.catalog_status not null,
  snapshot jsonb not null,
  summary text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(catalog_id,version)
);
create index if not exists idx_catalog_versions_catalog on public.catalog_versions(catalog_id,version desc);

-- Remove permissive legacy policies before introducing role checks.
do $$ declare p record; begin
  for p in select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('profiles','catalogs','products','field_definitions','assets','product_versions','audit_log','ai_runs','templates','catalog_products','catalog_versions')
  loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $$;

alter table public.catalog_products enable row level security;
alter table public.catalog_versions enable row level security;
create policy team_profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.team_role() is not null);
create policy team_profile_update_name on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
revoke all on public.profiles from anon, authenticated;
grant select, update(full_name) on public.profiles to authenticated;

do $$ declare table_name text; begin
  foreach table_name in array array['catalogs','products','field_definitions','assets','product_versions','audit_log','ai_runs','templates','catalog_products','catalog_versions'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from anon, authenticated',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
    execute format('create policy team_read on public.%I for select to authenticated using(public.team_role() is not null)',table_name);
  end loop;
end $$;

-- Direct catalog/product writes are intentionally disabled: every write must
-- pass through the revision-checked transaction below, including administrators.
grant insert,update,delete on public.assets to authenticated;
create policy team_asset_write on public.assets for all to authenticated
using(public.team_role() in ('admin','editor')) with check(public.team_role() in ('admin','editor'));
grant insert,update,delete on public.templates to authenticated;
create policy team_template_write on public.templates for all to authenticated
using(public.team_role()='admin') with check(public.team_role()='admin');

create or replace function public.set_team_member_role(p_user_id uuid,p_role public.user_role)
returns void language plpgsql security definer set search_path = pg_catalog,public
as $$ begin
  if public.team_role() is distinct from 'admin'::public.user_role or p_user_id=auth.uid() then
    raise exception 'Somente outro administrador pode alterar uma permissão.' using errcode='42501';
  end if;
  update public.profiles set role=p_role,is_active=true where id=p_user_id;
end $$;
revoke all on function public.set_team_member_role(uuid,public.user_role) from public;
grant execute on function public.set_team_member_role(uuid,public.user_role) to authenticated;

create or replace function public.get_catalog_workspace(p_catalog_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$ declare result jsonb; begin
  if public.team_role() is null then raise exception 'Sessão corporativa necessária' using errcode='42501'; end if;
  select jsonb_build_object(
    'catalog',to_jsonb(c),
    'products',coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('sort_order',cp.sort_order) order by cp.sort_order,p.id)
      from public.catalog_products cp join public.products p on p.id=cp.product_id where cp.catalog_id=c.id),'[]'::jsonb),
    'fieldDefinitions',coalesce((select jsonb_agg(to_jsonb(f) order by f.sort_order,f.id) from public.field_definitions f where f.catalog_id=c.id),'[]'::jsonb)
  ) into result from public.catalogs c where c.id=p_catalog_id;
  return result;
end $$;
revoke all on function public.get_catalog_workspace(uuid) from public;
grant execute on function public.get_catalog_workspace(uuid) to authenticated;

create or replace function public.create_catalog_workspace(p_name text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$ declare c public.catalogs; begin
  if public.team_role() is null or public.team_role() not in ('admin','editor') then
    raise exception 'Sem permissão de edição' using errcode='42501'; end if;
  if length(trim(p_name))=0 or length(p_name)>200 then raise exception 'Nome inválido' using errcode='22023'; end if;
  insert into public.catalogs(name,status,updated_by,content_updated_by,brand)
  values(trim(p_name),'draft',auth.uid(),auth.uid(),'{"pages":[],"presets":[]}'::jsonb) returning * into c;
  return to_jsonb(c);
end $$;
revoke all on function public.create_catalog_workspace(text) from public;
grant execute on function public.create_catalog_workspace(text) to authenticated;

create or replace function public.save_catalog_workspace(
  p_catalog_id uuid, p_expected_version integer, p_catalog jsonb,
  p_products jsonb, p_fields jsonb, p_description text default 'Salvamento do catálogo'
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$
declare
  c public.catalogs; existing_product public.products; item jsonb; f jsonb;
  product_uuid uuid; field_uuid uuid; product_ids uuid[] := '{}'; field_ids uuid[] := '{}';
  desired_status public.catalog_status; product_state public.product_status;
  changed boolean := false; product_changed boolean; new_brand jsonb; snapshot jsonb;
  current_role public.user_role := public.team_role(); actor uuid := auth.uid();
begin
  if actor is null or current_role is null or current_role not in ('admin','editor') then
    raise exception 'Sem permissão de edição' using errcode='42501'; end if;
  if jsonb_typeof(p_products) is distinct from 'array' or jsonb_typeof(p_fields) is distinct from 'array'
    or jsonb_typeof(p_catalog) is distinct from 'object' then raise exception 'Contrato de dados inválido' using errcode='22023'; end if;
  select * into c from public.catalogs where id=p_catalog_id for update;
  if not found then raise exception 'Catálogo não encontrado' using errcode='22023'; end if;
  if c.version is distinct from p_expected_version then raise exception 'Revisão do catálogo desatualizada' using errcode='40001'; end if;
  if coalesce(trim(p_catalog->>'name'),'')='' then raise exception 'Nome obrigatório' using errcode='22023'; end if;
  desired_status := coalesce(p_catalog->>'status','draft')::public.catalog_status;
  new_brand := coalesce(p_catalog->'brand','{}'::jsonb) - 'products' - 'audit_trail' - 'last_updated_by';
  if jsonb_typeof(new_brand) is distinct from 'object' then raise exception 'Layout inválido' using errcode='22023'; end if;
  changed := c.name is distinct from p_catalog->>'name' or c.locale is distinct from coalesce(p_catalog->>'locale','pt-BR')
    or c.template_key is distinct from coalesce(p_catalog->>'template_key','presys-premium')
    or (c.brand - 'products' - 'audit_trail' - 'last_updated_by' - 'workflow') is distinct from (new_brand - 'workflow');

  -- Sort row locks by ID to avoid deadlocks when two catalogs share products.
  for item in select value from jsonb_array_elements(p_products) order by value->>'id' loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(trim(item->>'sku'),'')=''
      or coalesce(trim(item->>'name'),'')='' or jsonb_typeof(item->'data') is distinct from 'object' then
      raise exception 'Produto sem código, nome ou dados estruturados' using errcode='22023'; end if;
    product_uuid := public.workspace_uuid(item->>'id',p_catalog_id,'product');
    if product_uuid=any(product_ids) then raise exception 'Produto repetido no documento' using errcode='22023'; end if;
    product_ids := array_append(product_ids,product_uuid);
    select * into existing_product from public.products where id=product_uuid for update;
    product_state := coalesce(item->>'status','draft')::public.product_status;
    if found then
      product_changed := existing_product.name is distinct from item->>'name' or existing_product.sku is distinct from item->>'sku'
        or existing_product.family is distinct from coalesce(item->>'family','') or existing_product.data is distinct from item->'data'
        or existing_product.status is distinct from product_state;
      if product_changed and existing_product.version is distinct from (item->>'version')::int then
        raise exception 'Produto compartilhado foi atualizado por outra pessoa' using errcode='40001'; end if;
      if product_state in ('approved','published') and existing_product.status is distinct from product_state then
        raise exception 'A aprovação ocorre na revisão do documento, não no cadastro do produto' using errcode='42501'; end if;
      if product_changed then
        insert into public.product_versions(product_id,version,snapshot,created_by,summary)
        values(product_uuid,existing_product.version,to_jsonb(existing_product),actor,left(p_description,500));
        update public.products set sku=item->>'sku',name=item->>'name',family=coalesce(item->>'family',''),
          data=item->'data',status=case when product_state in ('approved','published') then 'draft'::public.product_status else product_state end,
          version=existing_product.version+1,updated_at=now(),updated_by=actor where id=product_uuid;
        changed := true;
      end if;
    else
      if product_state in ('approved','published') then product_state := 'draft'; end if;
      insert into public.products(id,catalog_id,sku,name,family,status,data,version,updated_by,legacy_id)
      values(product_uuid,p_catalog_id,item->>'sku',item->>'name',coalesce(item->>'family',''),product_state,item->'data',1,actor,item->>'id');
      changed := true;
    end if;
    if not exists(select 1 from public.catalog_products where catalog_id=p_catalog_id and product_id=product_uuid
      and sort_order=coalesce((item->>'sort_order')::int,0)) then changed := true; end if;
    insert into public.catalog_products(catalog_id,product_id,sort_order)
    values(p_catalog_id,product_uuid,coalesce((item->>'sort_order')::int,0))
    on conflict(catalog_id,product_id) do update set sort_order=excluded.sort_order;
  end loop;
  if exists(select 1 from public.catalog_products where catalog_id=p_catalog_id and not(product_id=any(product_ids))) then changed := true; end if;
  delete from public.catalog_products where catalog_id=p_catalog_id and not(product_id=any(product_ids));

  for f in select value from jsonb_array_elements(p_fields) loop
    if coalesce(f->>'section','')='' or coalesce(f->>'key','')='' or coalesce(f->>'label','')='' then
      raise exception 'Definição de campo inválida' using errcode='22023'; end if;
    field_uuid := public.workspace_uuid(f->>'id',p_catalog_id,'field');
    if exists(select 1 from public.field_definitions where id=field_uuid and catalog_id<>p_catalog_id) then
      raise exception 'Campo pertence a outro catálogo' using errcode='42501'; end if;
    field_ids := array_append(field_ids,field_uuid);
    if not exists(select 1 from public.field_definitions d where d.id=field_uuid
      and d.section=f->>'section' and d.key=f->>'key' and d.label=f->>'label'
      and d.field_type=f->>'field_type' and d.unit is not distinct from f->>'unit'
      and coalesce(d.options,'null'::jsonb)=coalesce(f->'options','null'::jsonb)
      and coalesce(d.validation,'{}'::jsonb)=coalesce(f->'validation','{}'::jsonb)
      and d.sort_order=coalesce((f->>'sort_order')::int,0)
      and d.visible_in_catalog=coalesce((f->>'visible_in_catalog')::boolean,true)) then changed := true; end if;
    insert into public.field_definitions(id,catalog_id,section,key,label,field_type,unit,options,validation,sort_order,visible_in_catalog)
    values(field_uuid,p_catalog_id,f->>'section',f->>'key',f->>'label',f->>'field_type',f->>'unit',f->'options',coalesce(f->'validation','{}'),coalesce((f->>'sort_order')::int,0),coalesce((f->>'visible_in_catalog')::boolean,true))
    on conflict(id) do update set section=excluded.section,key=excluded.key,label=excluded.label,field_type=excluded.field_type,
      unit=excluded.unit,options=excluded.options,validation=excluded.validation,sort_order=excluded.sort_order,visible_in_catalog=excluded.visible_in_catalog;
  end loop;
  if exists(select 1 from public.field_definitions where catalog_id=p_catalog_id and not(id=any(field_ids))) then changed := true; end if;
  delete from public.field_definitions where catalog_id=p_catalog_id and not(id=any(field_ids));

  -- Approval must be a separate action on unchanged content, by another person.
  if desired_status='approved' and c.status is distinct from 'approved'::public.catalog_status then
    if current_role<>'admin' or c.status<>'review' or changed or c.content_updated_by is null or c.content_updated_by=actor
      or exists(select 1 from public.products where id=any(product_ids) and updated_by=actor) then
      raise exception 'Aprovação exige administrador diferente do autor e revisão sem alterações' using errcode='42501'; end if;
  elsif desired_status='published' and c.status is distinct from 'published'::public.catalog_status then
    if current_role<>'admin' or c.status<>'approved' or changed or c.approved_by is null
      or exists(select 1 from public.products p where p.id=any(product_ids) and not exists(
        select 1 from public.catalog_versions v,jsonb_array_elements(v.snapshot->'products') s
        where v.catalog_id=p_catalog_id and v.version=c.version and (s->>'id')::uuid=p.id and (s->>'version')::int=p.version)) then
      raise exception 'Publicação exige revisão aprovada e conteúdo sem alterações' using errcode='42501'; end if;
  end if;
  if changed and desired_status in ('approved','published') then desired_status := 'draft'; end if;
  update public.catalogs set name=p_catalog->>'name',locale=coalesce(p_catalog->>'locale','pt-BR'),
    template_key=coalesce(p_catalog->>'template_key','presys-premium'),brand=new_brand,status=desired_status,
    version=c.version+1,updated_at=now(),updated_by=actor,
    content_updated_by=case when changed then actor else content_updated_by end,
    approved_by=case when changed or desired_status in ('draft','review') then null when desired_status='approved' and c.status<>'approved' then actor else approved_by end,
    approved_at=case when changed or desired_status in ('draft','review') then null when desired_status='approved' and c.status<>'approved' then now() else approved_at end
  where id=p_catalog_id;
  snapshot := public.get_catalog_workspace(p_catalog_id);
  insert into public.catalog_versions(catalog_id,version,status,snapshot,summary,created_by)
  values(p_catalog_id,c.version+1,desired_status,snapshot,left(coalesce(p_description,'Salvamento do catálogo'),500),actor);
  return snapshot;
end $$;
revoke all on function public.save_catalog_workspace(uuid,integer,jsonb,jsonb,jsonb,text) from public;
grant execute on function public.save_catalog_workspace(uuid,integer,jsonb,jsonb,jsonb,text) to authenticated;

-- Private media; URLs are signed for an hour and renewed by the client on load.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('catalog-images','catalog-images',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy catalog_media_read on storage.objects for select to authenticated
using(bucket_id='catalog-images' and public.team_role() is not null);
create policy catalog_media_insert on storage.objects for insert to authenticated
with check(bucket_id='catalog-images' and public.team_role() in ('admin','editor') and (storage.foldername(name))[1]=auth.uid()::text);
create policy catalog_media_delete on storage.objects for delete to authenticated
using(bucket_id='catalog-images' and (public.team_role()='admin' or (public.team_role()='editor' and (storage.foldername(name))[1]=auth.uid()::text)));

-- Restrictive policies also guard against pre-existing permissive Storage rules.
-- They leave other buckets untouched instead of dropping unrelated policies.
create policy catalog_media_block_anon on storage.objects as restrictive for all to anon
using(bucket_id<>'catalog-images') with check(bucket_id<>'catalog-images');
create policy catalog_media_bound_read on storage.objects as restrictive for select to authenticated
using(bucket_id<>'catalog-images' or public.team_role() is not null);
create policy catalog_media_bound_insert on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'catalog-images' or (public.team_role() in ('admin','editor') and (storage.foldername(name))[1]=auth.uid()::text));
create policy catalog_media_bound_update on storage.objects as restrictive for update to authenticated
using(bucket_id<>'catalog-images') with check(bucket_id<>'catalog-images');
create policy catalog_media_bound_delete on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'catalog-images' or public.team_role()='admin' or (public.team_role()='editor' and (storage.foldername(name))[1]=auth.uid()::text));

-- Audit functions execute with a fixed search path; snapshots remain server-only.
alter function public.log_audit_change() set search_path=pg_catalog,public;
revoke all on function public.log_audit_change() from public;
commit;
