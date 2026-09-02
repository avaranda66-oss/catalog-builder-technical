-- Migration 00017: Security Repair & ACL Normalization for save_catalog_v3 and team_role
-- 1. Restaura o contrato estritamente fail-closed de save_catalog_v3 (elimina fallback de UUID/admin).
-- 2. Normaliza ACLs revogando acesso de anon/PUBLIC e concedendo apenas a authenticated.
-- 3. Versiona a RPC de diagnóstico seguro translation_auth_probe_v1 (authenticated only).

-- 1. save_catalog_v3 com segurança fail-closed estrita
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
  -- 1. Verificação Estrita de Autenticação e Permissão (Sem fallbacks inseguros)
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

  c_brand := jsonb_build_object(
    'title', c_title,
    'subtitle', coalesce(p_catalog->>'subtitle', ''),
    'themeId', coalesce(p_catalog->>'themeId', 'default-technical'),
    'pages', coalesce(p_catalog->'pages', '[]'::jsonb),
    'version', coalesce(p_catalog->>'version', '1')
  );

  SELECT * INTO existing FROM public.catalogs WHERE id = target_id FOR UPDATE;

  IF FOUND THEN
    -- UPDATE: target_id já existe. expected_version deve bater exatamente com existing.version.
    IF p_expected_version IS NULL OR p_expected_version <= 0 OR existing.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'Conflito de Concorrência: o catálogo foi modificado em outro dispositivo (Versão esperada: %, Versão no servidor: %). Recarregue antes de salvar.', p_expected_version, existing.version
        USING ERRCODE = '40001';
    END IF;

    new_version := coalesce(existing.version, 1) + 1;

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

    INSERT INTO public.catalogs(id, name, status, brand, version, updated_by, content_updated_by, created_at, updated_at)
    VALUES (target_id, c_title, c_status, c_brand, new_version, actor, actor, now(), now())
    RETURNING * INTO saved;

    INSERT INTO public.catalog_versions(id, catalog_id, version, status, snapshot, summary, created_by, created_at)
    VALUES (gen_random_uuid(), target_id, new_version, c_status, c_brand, coalesce(p_summary, 'Criação inicial do catálogo v3'), actor, now());
  END IF;

  RETURN to_jsonb(saved);
END;
$$;

-- 2. Revogação de acesso anônimo/público e restrição estrita a authenticated
REVOKE ALL ON FUNCTION public.save_catalog_v3(JSONB, INTEGER, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.save_catalog_v3(JSONB, INTEGER, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.team_role() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.team_role() TO authenticated;

-- 3. Versionamento da RPC de diagnóstico seguro (authenticated only)
CREATE OR REPLACE FUNCTION public.translation_auth_probe_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role public.user_role := public.team_role();
BEGIN
  RETURN jsonb_build_object(
    'authenticated', v_actor IS NOT NULL,
    'role', v_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.translation_auth_probe_v1() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.translation_auth_probe_v1() TO authenticated;
