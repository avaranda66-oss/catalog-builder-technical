-- Migration 00020: Repair save_catalog_v3 Authorization Helper
-- 1. Substitui a variável local 'current_role' (que colidia com a palavra-chave reservada do PostgreSQL/SQL)
--    pelo helper editorial centralizado e seguro public.require_document_editor_v1().
-- 2. Elimina a falha incondicional 42501 em save_catalog_v3 reportada na auditoria forense RPC-01.
-- 3. Preserva 100% das garantias de integridade da migration 00018:
--    - Assinatura da RPC inalterada;
--    - Validação de formato JSONB e UUID;
--    - Normalização de status;
--    - Row lock atômico (FOR UPDATE);
--    - CAS estrito com ERRCODE 40001;
--    - Incremento sequencial de versão server-side;
--    - Preservação integral do payload do catálogo (brand, locale, translationMeta, localizedSystemStrings, documentLineage, pages, themeId, etc.);
--    - Registro imutável de histórico na tabela catalog_versions;
--    - ACL restrita (REVOKE anon/public, GRANT authenticated).

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
  v_actor UUID := public.require_document_editor_v1();
  target_id UUID;
  raw_id TEXT;
  c_title TEXT;
  c_status public.catalog_status;
  c_brand JSONB;
  existing public.catalogs;
  saved public.catalogs;
  new_version INTEGER := 1;
BEGIN
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
        updated_by = v_actor,
        content_updated_by = v_actor,
        updated_at = now()
    WHERE id = target_id
    RETURNING * INTO saved;

    INSERT INTO public.catalog_versions(id, catalog_id, version, status, snapshot, summary, created_by, created_at)
    VALUES (gen_random_uuid(), target_id, new_version, c_status, c_brand, coalesce(p_summary, 'Atualização de catálogo v3'), v_actor, now());
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
    VALUES (target_id, c_title, c_status, c_brand, new_version, v_actor, v_actor, now(), now())
    RETURNING * INTO saved;

    INSERT INTO public.catalog_versions(id, catalog_id, version, status, snapshot, summary, created_by, created_at)
    VALUES (gen_random_uuid(), target_id, new_version, c_status, c_brand, coalesce(p_summary, 'Criação inicial do catálogo v3'), v_actor, now());
  END IF;

  RETURN to_jsonb(saved);
END;
$$;

-- ACL Estrita: REVOGAR DE PUBLIC E ANON, CONCEDER APENAS PARA AUTHENTICATED
REVOKE ALL ON FUNCTION public.save_catalog_v3(JSONB, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_catalog_v3(JSONB, INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_catalog_v3(JSONB, INTEGER, TEXT) TO authenticated;
