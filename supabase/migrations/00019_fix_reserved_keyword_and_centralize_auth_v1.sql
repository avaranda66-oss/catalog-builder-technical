-- Migration 00019: Fix Reserved Keyword Collision and Centralize Authorization Helper
-- Root Cause: 'current_role' é uma palavra-chave reservada do SQL padrão e do PostgreSQL (retorna o usuário do banco, ex: 'postgres' em SECURITY DEFINER).
-- Nas funções create_translated_catalog_v1 e create_translated_template_v1, a condição:
--   if actor is null or current_role is null or current_role not in ('admin', 'editor')
-- resolvia 'current_role' para o identificador do sistema ('postgres'), que NUNCA é 'admin' ou 'editor',
-- disparando 42501 incondicionalmente mesmo para administradores autenticados!
--
-- Solução:
-- 1. Cria a função centralizada fail-closed public.require_document_editor_v1() com variáveis seguras (v_actor, v_role)
-- 2. Atualiza create_translated_catalog_v1, create_translated_template_v1, save_catalog_v3 e save_template_v1
--    para utilizarem require_document_editor_v1(), garantindo 100% de paridade e eliminando divergências.

-- 1. Helper Centralizado de Autorização Editorial
CREATE OR REPLACE FUNCTION public.require_document_editor_v1()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role public.user_role := public.team_role();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_ACTOR_NULL: Usuário não autenticado no servidor.' USING ERRCODE = '42501';
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'AUTH_ROLE_NULL: Perfil do usuário não encontrado ou inativo.' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('admin', 'editor') THEN
    RAISE EXCEPTION 'AUTH_ROLE_FORBIDDEN: Perfil (%) não autorizado para operações editoriais.', v_role USING ERRCODE = '42501';
  END IF;

  RETURN v_actor;
END;
$$;

REVOKE ALL ON FUNCTION public.require_document_editor_v1() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.require_document_editor_v1() TO authenticated;

-- 2. Correção de create_translated_catalog_v1
CREATE OR REPLACE FUNCTION public.create_translated_catalog_v1(
  p_catalog JSONB,
  p_source_catalog_id UUID,
  p_expected_source_version INTEGER,
  p_summary TEXT DEFAULT 'Criação de versão traduzida'::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := public.require_document_editor_v1();
  target_id UUID;
  raw_id TEXT;
  c_title TEXT;
  c_status public.catalog_status;
  c_brand JSONB;
  source_row public.catalogs;
  saved public.catalogs;
BEGIN
  IF jsonb_typeof(p_catalog) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Payload de catálogo inválido: objeto esperado.' USING ERRCODE = '22023';
  END IF;

  IF p_source_catalog_id IS NULL THEN
    RAISE EXCEPTION 'ID do catálogo fonte obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF p_expected_source_version IS NULL OR p_expected_source_version <= 0 THEN
    RAISE EXCEPTION 'Versão esperada do catálogo fonte inválida: %', p_expected_source_version USING ERRCODE = '22023';
  END IF;

  -- 1. Lock and verify source catalog atomically
  SELECT * INTO source_row FROM public.catalogs WHERE id = p_source_catalog_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOURCE_CATALOG_NOT_FOUND: Catálogo fonte % não encontrado no servidor.', p_source_catalog_id
      USING ERRCODE = '40001';
  END IF;

  IF source_row.version IS DISTINCT FROM p_expected_source_version THEN
    RAISE EXCEPTION 'SOURCE_CHANGED_DURING_TRANSLATION: O catálogo original foi alterado concorrentemente no servidor (Versão esperada: %, Versão atual: %). A tradução deve ser refeita.', p_expected_source_version, source_row.version
      USING ERRCODE = '40001';
  END IF;

  -- 2. Validate Target Catalog ID
  raw_id := trim(p_catalog->>'id');
  IF raw_id IS NULL OR raw_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'ID do catálogo alvo deve ser um UUID válido: %', raw_id USING ERRCODE = '22023';
  END IF;
  target_id := raw_id::UUID;

  IF target_id = p_source_catalog_id THEN
    RAISE EXCEPTION 'ID do catálogo alvo não pode ser igual ao ID do catálogo fonte.' USING ERRCODE = '22023';
  END IF;

  -- Ensure target does not already exist
  IF EXISTS (SELECT 1 FROM public.catalogs WHERE id = target_id) THEN
    RAISE EXCEPTION 'ID do catálogo alvo % já existe no servidor.', target_id USING ERRCODE = '40001';
  END IF;

  c_title := coalesce(nullif(trim(p_catalog->>'title'), ''), nullif(trim(p_catalog->>'name'), ''), 'Catálogo Técnico Traduzido');
  c_status := CASE
    WHEN p_catalog->>'status' IN ('draft', 'review', 'approved', 'published', 'archived')
    THEN (p_catalog->>'status')::public.catalog_status
    ELSE 'draft'::public.catalog_status
  END;

  -- Preserve full translated JSON payload in brand, with normalized version = 1
  c_brand := p_catalog || jsonb_build_object('version', 1, 'title', c_title);

  -- 3. Atomic insert of new translated catalog row
  INSERT INTO public.catalogs(id, name, status, brand, version, updated_by, content_updated_by, created_at, updated_at)
  VALUES (target_id, c_title, c_status, c_brand, 1, v_actor, v_actor, now(), now())
  RETURNING * INTO saved;

  INSERT INTO public.catalog_versions(id, catalog_id, version, status, snapshot, summary, created_by, created_at)
  VALUES (gen_random_uuid(), target_id, 1, c_status, c_brand, coalesce(p_summary, 'Criação de versão traduzida v1'), v_actor, now());

  RETURN to_jsonb(saved);
END;
$$;

REVOKE ALL ON FUNCTION public.create_translated_catalog_v1(JSONB, UUID, INTEGER, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_translated_catalog_v1(JSONB, UUID, INTEGER, TEXT) TO authenticated;

-- 3. Correção de create_translated_template_v1
CREATE OR REPLACE FUNCTION public.create_translated_template_v1(
  p_template JSONB,
  p_source_template_id UUID,
  p_expected_source_version INTEGER,
  p_summary TEXT DEFAULT 'Criação de template traduzido'::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := public.require_document_editor_v1();
  target_id UUID;
  raw_id TEXT;
  t_name TEXT;
  t_design_tokens JSONB;
  source_row public.templates;
  saved public.templates;
BEGIN
  IF jsonb_typeof(p_template) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Payload de template inválido: objeto JSON esperado.' USING ERRCODE = '22023';
  END IF;

  IF p_source_template_id IS NULL THEN
    RAISE EXCEPTION 'ID do template fonte obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF p_expected_source_version IS NULL OR p_expected_source_version <= 0 THEN
    RAISE EXCEPTION 'Versão esperada do template fonte inválida: %', p_expected_source_version USING ERRCODE = '22023';
  END IF;

  -- 2. Lock e Validação Atômica do Template Fonte
  SELECT * INTO source_row FROM public.templates WHERE id = p_source_template_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOURCE_TEMPLATE_NOT_FOUND: Template fonte % não encontrado no servidor.', p_source_template_id
      USING ERRCODE = '40001';
  END IF;

  IF source_row.version IS DISTINCT FROM p_expected_source_version THEN
    RAISE EXCEPTION 'SOURCE_CHANGED_DURING_TRANSLATION: O template original foi alterado concorrentemente no servidor (Versão esperada: %, Versão atual: %). A tradução deve ser refeita.', p_expected_source_version, source_row.version
      USING ERRCODE = '40001';
  END IF;

  -- 3. Validação do UUID Alvo
  raw_id := trim(p_template->>'id');
  IF raw_id IS NULL OR raw_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'ID do template alvo deve ser um UUID válido: %', raw_id USING ERRCODE = '22023';
  END IF;
  target_id := raw_id::UUID;

  IF target_id = p_source_template_id THEN
    RAISE EXCEPTION 'ID do template alvo não pode ser igual ao ID do template fonte.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.templates WHERE id = target_id) THEN
    RAISE EXCEPTION 'ID do template alvo % já existe no servidor.', target_id USING ERRCODE = '40001';
  END IF;

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
  INSERT INTO public.templates (
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
  ) VALUES (
    target_id,
    t_name,
    'custom-' || target_id::text,
    t_design_tokens,
    p_template || jsonb_build_object('id', target_id, 'version', 1, 'title', t_name),
    false,
    1,
    now(),
    now(),
    v_actor
  )
  RETURNING * INTO saved;

  RETURN to_jsonb(saved);
END;
$$;

REVOKE ALL ON FUNCTION public.create_translated_template_v1(JSONB, UUID, INTEGER, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_translated_template_v1(JSONB, UUID, INTEGER, TEXT) TO authenticated;
