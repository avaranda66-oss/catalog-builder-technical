-- Migration 00015: Create Translated Catalog Atomic Transaction
-- Atomically checks source catalog existence and expected version, then inserts target translated catalog.
-- Prevents TOCTOU source drift races and ensures strict transactional consistency.

create or replace function public.create_translated_catalog_v1(
  p_catalog jsonb,
  p_source_catalog_id uuid,
  p_expected_source_version integer,
  p_summary text default 'Criação de versão traduzida'
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
  source_row public.catalogs;
  saved public.catalogs;
begin
  if actor is null or current_role is null or current_role not in ('admin', 'editor') then
    raise exception 'Sem permissão de acesso para criar catálogo traduzido.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_catalog) is distinct from 'object' then
    raise exception 'Payload de catálogo inválido: objeto esperado.' using errcode = '22023';
  end if;

  if p_source_catalog_id is null then
    raise exception 'ID do catálogo fonte obrigatório.' using errcode = '22023';
  end if;

  if p_expected_source_version is null or p_expected_source_version <= 0 then
    raise exception 'Versão esperada do catálogo fonte inválida: %', p_expected_source_version using errcode = '22023';
  end if;

  -- 1. Lock and verify source catalog atomically
  select * into source_row from public.catalogs where id = p_source_catalog_id for update;

  if not found then
    raise exception 'SOURCE_CATALOG_NOT_FOUND: Catálogo fonte % não encontrado no servidor.', p_source_catalog_id
      using errcode = '40001';
  end if;

  if source_row.version is distinct from p_expected_source_version then
    raise exception 'SOURCE_CHANGED_DURING_TRANSLATION: O catálogo original foi alterado concorrentemente no servidor (Versão esperada: %, Versão atual: %). A tradução deve ser refeita.', p_expected_source_version, source_row.version
      using errcode = '40001';
  end if;

  -- 2. Validate Target Catalog ID
  raw_id := trim(p_catalog->>'id');
  if raw_id is null or raw_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'ID do catálogo alvo deve ser um UUID válido: %', raw_id using errcode = '22023';
  end if;
  target_id := raw_id::uuid;

  if target_id = p_source_catalog_id then
    raise exception 'ID do catálogo alvo não pode ser igual ao ID do catálogo fonte.' using errcode = '22023';
  end if;

  -- Ensure target does not already exist
  if exists (select 1 from public.catalogs where id = target_id) then
    raise exception 'ID do catálogo alvo % já existe no servidor.', target_id using errcode = '40001';
  end if;

  c_title := coalesce(nullif(trim(p_catalog->>'title'), ''), nullif(trim(p_catalog->>'name'), ''), 'Catálogo Técnico Traduzido');
  c_status := case
    when p_catalog->>'status' in ('draft', 'review', 'approved', 'published', 'archived')
    then (p_catalog->>'status')::public.catalog_status
    else 'draft'::public.catalog_status
  end;

  -- Preserve full translated JSON payload in brand, with normalized version = 1
  c_brand := p_catalog || jsonb_build_object('version', 1, 'title', c_title);

  -- 3. Atomic insert of new translated catalog row
  insert into public.catalogs(id, name, status, brand, version, updated_by, content_updated_by, created_at, updated_at)
  values (target_id, c_title, c_status, c_brand, 1, actor, actor, now(), now())
  returning * into saved;

  insert into public.catalog_versions(id, catalog_id, version, status, snapshot, summary, created_by, created_at)
  values (gen_random_uuid(), target_id, 1, c_status, c_brand, coalesce(p_summary, 'Criação de versão traduzida v1'), actor, now());

  return to_jsonb(saved);
end $$;

revoke all on function public.create_translated_catalog_v1(jsonb, uuid, integer, text) from public;
grant execute on function public.create_translated_catalog_v1(jsonb, uuid, integer, text) to authenticated;
