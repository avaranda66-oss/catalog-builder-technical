-- Migration 00016: Create Translated Template Atomic Transaction
-- Permite que qualquer Template corporativo na nuvem gere uma nova versão Template traduzida e independente.
-- Mantém atomicidade estrita, CAS de versão do template fonte e isolamento de permissões (admin / editor).

create or replace function public.create_translated_template_v1(
  p_template jsonb,
  p_source_template_id uuid,
  p_expected_source_version integer,
  p_summary text default 'Criação de template traduzido'
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
  t_name text;
  t_design_tokens jsonb;
  source_row public.templates;
  saved public.templates;
begin
  -- 1. Verificação Estrita de Permissão
  if actor is null or current_role is null or current_role not in ('admin', 'editor') then
    raise exception 'Sem permissão de acesso para criar template traduzido.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_template) is distinct from 'object' then
    raise exception 'Payload de template inválido: objeto JSON esperado.' using errcode = '22023';
  end if;

  if p_source_template_id is null then
    raise exception 'ID do template fonte obrigatório.' using errcode = '22023';
  end if;

  if p_expected_source_version is null or p_expected_source_version <= 0 then
    raise exception 'Versão esperada do template fonte inválida: %', p_expected_source_version using errcode = '22023';
  end if;

  -- 2. Lock e Validação Atômica do Template Fonte
  select * into source_row from public.templates where id = p_source_template_id for update;

  if not found then
    raise exception 'SOURCE_TEMPLATE_NOT_FOUND: Template fonte % não encontrado no servidor.', p_source_template_id
      using errcode = '40001';
  end if;

  if source_row.version is distinct from p_expected_source_version then
    raise exception 'SOURCE_CHANGED_DURING_TRANSLATION: O template original foi alterado concorrentemente no servidor (Versão esperada: %, Versão atual: %). A tradução deve ser refeita.', p_expected_source_version, source_row.version
      using errcode = '40001';
  end if;

  -- 3. Validação do UUID Alvo
  raw_id := trim(p_template->>'id');
  if raw_id is null or raw_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'ID do template alvo deve ser um UUID válido: %', raw_id using errcode = '22023';
  end if;
  target_id := raw_id::uuid;

  if target_id = p_source_template_id then
    raise exception 'ID do template alvo não pode ser igual ao ID do template fonte.' using errcode = '22023';
  end if;

  if exists (select 1 from public.templates where id = target_id) then
    raise exception 'ID do template alvo % já existe no servidor.', target_id using errcode = '40001';
  end if;

  t_name := coalesce(
    nullif(trim(p_template->>'title'), ''),
    nullif(trim(p_template->>'name'), ''),
    source_row.name || ' (Traduzido)'
  );

  t_design_tokens := jsonb_build_object(
    'category', 'layout_template',
    'description', coalesce(p_summary, 'Template Traduzido'),
    'isSystem', false,
    'sourceTemplateId', p_source_template_id,
    'sourceTemplateVersion', p_expected_source_version,
    'locale', coalesce(p_template->>'locale', 'pt-BR'),
    'sourceLocale', coalesce(p_template->>'sourceLocale', 'pt-BR')
  );

  -- 4. Inserção Atômica do Novo Template Traduzido
  insert into public.templates (
    id,
    name,
    template_key,
    design_tokens,
    layout_config,
    is_system,
    version,
    created_at,
    updated_at,
    updated_by
  ) values (
    target_id,
    t_name,
    'custom-' || target_id::text,
    t_design_tokens,
    p_template || jsonb_build_object('id', target_id, 'version', 1, 'title', t_name),
    false,
    1,
    now(),
    now(),
    actor
  )
  returning * into saved;

  return to_jsonb(saved);
end $$;

revoke all on function public.create_translated_template_v1(jsonb, uuid, integer, text) from anon, public;
grant execute on function public.create_translated_template_v1(jsonb, uuid, integer, text) to authenticated;
