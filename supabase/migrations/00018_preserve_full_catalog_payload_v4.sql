-- Migration 00018: Preserve Full Catalog Payload and Translation Metadata V4
-- 1. Elimina a perda de metadados em save_catalog_v3 (locale, translationMeta, localizedSystemStrings, documentLineage, etc.)
-- 2. Preserva integralmente o JSON do catálogo (p_catalog || version + title), garantindo round-trip fiel de catálogos traduzidos.
-- 3. Mantém todas as proteções fail-closed: actor auth.uid(), team_role admin/editor, CAS com FOR UPDATE e ACL authenticated-only.

CREATE OR REPLACE FUNCTION public.save_catalog_v3(
  p_catalog JSONB,
  p_expected_version INTEGER,
  p_summary TEXT DEFAULT 'Salvamento de catálogo'::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_role public.user_role := public.team_role();
  actor UUID := auth.uid();
  target_id UUID;
  raw_id TEXT;
  c_title TEXT;
  c_status public.catalog_status;
  c_brand JSONB;
  existing public.catalogs;
  saved public.catalogs;
  new_version INTEGER := 1;
BEGIN
  -- 1. Verificação Estrita de Autenticação e Permissão (Fail-Closed)
  IF actor IS NULL OR current_role IS NULL OR current_role NOT IN ('admin', 'editor') THEN
    RAISE EXCEPTION 'Sem permissão de acesso para salvar catálogos.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_catalog) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Payload de catálogo inválido: objeto esperado.' USING ERRCODE = '22023';
  END IF;

  raw_id := trim(p_catalog->>'id');
  IF raw_id IS NULL OR raw_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'ID do catálogo deve ser um UUID válido: %', raw_id USING ERRCODE = '22023';
  END IF;
  target_id := raw_id::UUID;

  c_title := coalesce(nullif(trim(p_catalog->>'title'), ''), nullif(trim(p_catalog->>'name'), ''), 'Catálogo Técnico');
  c_status := CASE
    WHEN p_catalog->>'status' IN ('draft', 'review', 'approved', 'published', 'archived')
    THEN (p_catalog->>'status')::public.catalog_status
    ELSE 'draft'::public.catalog_status
  END;

  SELECT * INTO existing FROM public.catalogs WHERE id = target_id FOR UPDATE;

  IF FOUND THEN
    -- UPDATE: target_id já existe. expected_version deve bater exatamente com existing.version.
    IF p_expected_version IS NULL OR p_expected_version <= 0 OR existing.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'Conflito de Concorrência: o catálogo foi modificado em outro dispositivo (Versão esperada: %, Versão no servidor: %). Recarregue antes de salvar.', p_expected_version, existing.version
        USING ERRCODE = '40001';
    END IF;

    new_version := coalesce(existing.version, 1) + 1;

    -- Preserva integralmente todos os metadados do documento (locale, translationMeta, localizedSystemStrings, documentLineage, etc.)
    c_brand := p_catalog || jsonb_build_object(
      'title', c_title,
      'version', new_version
    );

    UPDATE public.catalogs
    SET name = c_title,
        status = c_status,
        brand = c_brand,
        version = new_version,
        updated_by = actor,
        content_updated_by = actor,
        updated_at = now()
    WHERE id = target_id
    RETURNING * INTO saved;

    INSERT INTO public.catalog_versions(id, catalog_id, version, status, snapshot, summary, created_by, created_at)
    VALUES (gen_random_uuid(), target_id, new_version, c_status, c_brand, coalesce(p_summary, 'Atualização de catálogo v3'), actor, now());
  ELSE
    -- INSERT: target_id não existe. expected_version deve ser 0 ou null.
    IF p_expected_version IS NOT NULL AND p_expected_version > 0 THEN
      RAISE EXCEPTION 'Conflito de Criação: versão esperada % informada para catálogo inexistente no servidor.', p_expected_version
        USING ERRCODE = '40001';
    END IF;

    new_version := 1;

    -- Preserva integralmente todos os metadados do documento
    c_brand := p_catalog || jsonb_build_object(
      'title', c_title,
      'version', new_version
    );

    INSERT INTO public.catalogs(id, name, status, brand, version, updated_by, content_updated_by, created_at, updated_at)
    VALUES (target_id, c_title, c_status, c_brand, new_version, actor, actor, now(), now())
    RETURNING * INTO saved;

    INSERT INTO public.catalog_versions(id, catalog_id, version, status, snapshot, summary, created_by, created_at)
    VALUES (gen_random_uuid(), target_id, new_version, c_status, c_brand, coalesce(p_summary, 'Criação inicial do catálogo v3'), actor, now());
  END IF;

  RETURN to_jsonb(saved);
END;
$$;

REVOKE ALL ON FUNCTION public.save_catalog_v3(JSONB, INTEGER, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.save_catalog_v3(JSONB, INTEGER, TEXT) TO authenticated;
