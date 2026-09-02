-- Migration 00006: Catalog Consistency V3
-- Strict UUID validation, CAS enforcement, zero md5 title hashing, explicit insert vs update semantics.

create or replace function public.save_catalog_v3(
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
  raw_id text;
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

  raw_id := trim(p_catalog->>'id');
  if raw_id is null or raw_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'ID do catálogo deve ser um UUID válido: %', raw_id using errcode = '22023';
  end if;
  target_id := raw_id::uuid;

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

  select * into existing from public.catalogs where id = target_id for update;

  if found then
    -- UPDATE: target_id já existe. expected_version deve bater exatamente com existing.version.
    if p_expected_version is null or p_expected_version <= 0 or existing.version is distinct from p_expected_version then
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
    values (gen_random_uuid(), target_id, new_version, c_status, c_brand, coalesce(p_summary, 'Atualização de catálogo v3'), actor, now());
  else
    -- INSERT: target_id não existe. expected_version deve ser 0 ou null.
    if p_expected_version is not null and p_expected_version > 0 then
      raise exception 'Conflito de Criação: versão esperada % informada para catálogo inexistente no servidor.', p_expected_version
        using errcode = '40001';
    end if;

    new_version := 1;

    insert into public.catalogs(id, name, status, brand, version, updated_by, content_updated_by, created_at, updated_at)
    values (target_id, c_title, c_status, c_brand, new_version, actor, actor, now(), now())
    returning * into saved;

    insert into public.catalog_versions(id, catalog_id, version, status, snapshot, summary, created_by, created_at)
    values (gen_random_uuid(), target_id, new_version, c_status, c_brand, coalesce(p_summary, 'Criação inicial do catálogo v3'), actor, now());
  end if;

  return to_jsonb(saved);
end $$;

revoke all on function public.save_catalog_v3(jsonb, integer, text) from public;
grant execute on function public.save_catalog_v3(jsonb, integer, text) to authenticated;
