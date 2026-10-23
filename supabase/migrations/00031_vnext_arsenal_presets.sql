-- Onda 4.5 (Arsenal, docs/architecture/ADR-arsenal.md): modelos salvos da equipe — capas, tabelas, cabeçalhos,
-- rodapés, páginas e estilos. Apenas arquivo de migração (sem db push nesta fatia).
-- Aditiva: não altera vnext_catalogs, vnext_assets nem RPCs existentes.
-- Os modelos PRESYS embutidos vivem no código (somente leitura); aqui só se conta o uso deles.
-- O banco confere a casca do preset (chaves, tipos, categoria, versão, tamanho); a validação profunda do payload
-- é a do cliente (src/vnext/arsenal/contracts.ts), como em vnext_catalogs.
BEGIN;

-- 1. Auxiliares ---------------------------------------------------------------------------------------------------

CREATE FUNCTION public.vnext_preset_terms_valid_v1(
  p_terms TEXT[],
  p_max_count INTEGER,
  p_max_chars INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_term TEXT;
  v_seen TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_terms IS NULL
    OR COALESCE(array_ndims(p_terms), 1) <> 1
    OR cardinality(p_terms) > p_max_count
  THEN
    RETURN false;
  END IF;
  FOREACH v_term IN ARRAY p_terms LOOP
    IF v_term IS NULL
      OR length(v_term) < 1
      OR length(v_term) > p_max_chars
      OR v_term <> btrim(v_term)
      OR v_term ~ '[\x00-\x1F\x7F]'
      OR lower(v_term) = ANY (v_seen)
    THEN
      RETURN false;
    END IF;
    v_seen := v_seen || lower(v_term);
  END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION public.vnext_preset_require_uuid_v1(
  p_value TEXT,
  p_label TEXT
)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_value IS NULL
    OR p_value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_REQUEST: % must be an exact canonical lowercase UUID', p_label
      USING ERRCODE = '22023';
  END IF;
  RETURN p_value::UUID;
END;
$$;

-- 2. Tabelas ------------------------------------------------------------------------------------------------------

CREATE TABLE public.vnext_presets (
  id UUID PRIMARY KEY,
  revision BIGINT NOT NULL CHECK (revision >= 1),
  last_mutation_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('page', 'block', 'table', 'style')),
  category TEXT NOT NULL CHECK (category IN ('capas', 'tabelas', 'cabecalhos', 'rodapes', 'paginas', 'estilos')),
  name TEXT NOT NULL CHECK (
    length(name) BETWEEN 1 AND 80
    AND name = btrim(name)
    AND name !~ '[\x00-\x1F\x7F]'
  ),
  description TEXT CHECK (
    description IS NULL
    OR (
      length(description) BETWEEN 1 AND 280
      AND description = btrim(description)
      AND description !~ '[\x00-\x1F\x7F]'
    )
  ),
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
    CHECK (public.vnext_preset_terms_valid_v1(tags, 12, 32)),
  synonyms TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
    CHECK (public.vnext_preset_terms_valid_v1(synonyms, 24, 40)),
  origin TEXT NOT NULL CHECK (origin IN ('person', 'ai')),
  payload_schema_version INTEGER NOT NULL CHECK (payload_schema_version = 1),
  payload JSONB NOT NULL,
  payload_bytes INTEGER NOT NULL CHECK (payload_bytes BETWEEN 2 AND 1048576),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES public.profiles(id),
  CONSTRAINT vnext_presets_kind_category_check CHECK (
    (kind = 'page' AND category IN ('capas', 'paginas'))
    OR (kind = 'block' AND category IN ('capas', 'cabecalhos', 'rodapes', 'paginas'))
    OR (kind = 'table' AND category = 'tabelas')
    OR (kind = 'style' AND category = 'estilos')
  ),
  CONSTRAINT vnext_presets_payload_kind_check CHECK (
    jsonb_typeof(payload) = 'object' AND payload->>'kind' = kind
  ),
  CONSTRAINT vnext_presets_deleted_pair_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);

CREATE INDEX idx_vnext_presets_gallery
  ON public.vnext_presets (kind, category, updated_at DESC, id)
  WHERE deleted_at IS NULL;

-- Uso fora da linha do preset: contar não muda a revisão nem disputa trava com quem renomeia.
-- A chave é o UUID do preset da equipe ou "builtin:<slug>" de um modelo embutido.
CREATE TABLE public.vnext_preset_usage (
  preset_key TEXT PRIMARY KEY CHECK (
    preset_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR preset_key ~ '^builtin:[a-z0-9][a-z0-9._-]{0,79}$'
  ),
  use_count BIGINT NOT NULL CHECK (use_count >= 1),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Casca do preset e envelope -----------------------------------------------------------------------------------

-- p_input = rascunho completo (create) ou estado mesclado (update), nas chaves do cliente:
-- kind, origin, name, category, description?, tags, synonyms, payloadSchemaVersion, payload.
CREATE FUNCTION public.vnext_validate_preset_input_v1(p_input JSONB)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kind TEXT;
  v_category TEXT;
  v_name TEXT;
  v_description TEXT;
  v_version NUMERIC;
  v_bytes BIGINT;
BEGIN
  IF jsonb_typeof(p_input) IS DISTINCT FROM 'object'
    OR (p_input - ARRAY[
      'kind', 'origin', 'name', 'category', 'description', 'tags', 'synonyms', 'payloadSchemaVersion', 'payload'
    ]::TEXT[]) <> '{}'::JSONB
    OR NOT (p_input ?& ARRAY['kind', 'origin', 'name', 'category', 'tags', 'synonyms', 'payloadSchemaVersion', 'payload']::TEXT[])
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_PRESET: preset must contain exactly the draft keys'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_input->'payloadSchemaVersion') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'VNEXT_INVALID_PRESET: payloadSchemaVersion must be numeric'
      USING ERRCODE = '22023';
  END IF;
  v_version := (p_input->>'payloadSchemaVersion')::NUMERIC;
  IF v_version > 1 AND v_version = trunc(v_version) THEN
    RAISE EXCEPTION 'VNEXT_UNSUPPORTED_VERSION: only preset payloadSchemaVersion 1 is supported'
      USING ERRCODE = '22023';
  END IF;
  IF v_version <> 1 THEN
    RAISE EXCEPTION 'VNEXT_INVALID_PRESET: payloadSchemaVersion must be 1'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_input->'kind') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_input->'category') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_input->'origin') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_input->'name') IS DISTINCT FROM 'string'
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_PRESET: kind, category, origin and name must be strings'
      USING ERRCODE = '22023';
  END IF;
  v_kind := p_input->>'kind';
  v_category := p_input->>'category';
  v_name := p_input->>'name';

  IF v_kind NOT IN ('page', 'block', 'table', 'style')
    OR v_category NOT IN ('capas', 'tabelas', 'cabecalhos', 'rodapes', 'paginas', 'estilos')
    OR NOT (
      (v_kind = 'page' AND v_category IN ('capas', 'paginas'))
      OR (v_kind = 'block' AND v_category IN ('capas', 'cabecalhos', 'rodapes', 'paginas'))
      OR (v_kind = 'table' AND v_category = 'tabelas')
      OR (v_kind = 'style' AND v_category = 'estilos')
    )
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_PRESET: category % is not allowed for kind %', v_category, v_kind
      USING ERRCODE = '22023';
  END IF;

  IF (p_input->>'origin') NOT IN ('person', 'ai') THEN
    RAISE EXCEPTION 'VNEXT_INVALID_PRESET: origin must be person or ai'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_name) NOT BETWEEN 1 AND 80 OR v_name <> btrim(v_name) OR v_name ~ '[\x00-\x1F\x7F]' THEN
    RAISE EXCEPTION 'VNEXT_INVALID_PRESET: name must be 1 to 80 trimmed characters'
      USING ERRCODE = '22023';
  END IF;

  IF p_input ? 'description' THEN
    IF jsonb_typeof(p_input->'description') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'VNEXT_INVALID_PRESET: description must be a string when present'
        USING ERRCODE = '22023';
    END IF;
    v_description := p_input->>'description';
    IF length(v_description) NOT BETWEEN 1 AND 280
      OR v_description <> btrim(v_description)
      OR v_description ~ '[\x00-\x1F\x7F]'
    THEN
      RAISE EXCEPTION 'VNEXT_INVALID_PRESET: description must be 1 to 280 trimmed characters'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF jsonb_typeof(p_input->'tags') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_input->'synonyms') IS DISTINCT FROM 'array'
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_input->'tags') AS term(value)
      WHERE jsonb_typeof(term.value) IS DISTINCT FROM 'string'
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_input->'synonyms') AS term(value)
      WHERE jsonb_typeof(term.value) IS DISTINCT FROM 'string'
    )
    OR NOT public.vnext_preset_terms_valid_v1(ARRAY(SELECT jsonb_array_elements_text(p_input->'tags')), 12, 32)
    OR NOT public.vnext_preset_terms_valid_v1(ARRAY(SELECT jsonb_array_elements_text(p_input->'synonyms')), 24, 40)
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_PRESET: tags (12 x 32) and synonyms (24 x 40) must be unique trimmed strings'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_input->'payload') IS DISTINCT FROM 'object'
    OR (p_input->'payload'->>'kind') IS DISTINCT FROM v_kind
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_PRESET: payload must be an object of the same kind'
      USING ERRCODE = '22023';
  END IF;

  v_bytes := octet_length(convert_to((p_input->'payload')::TEXT, 'UTF8'));
  IF v_bytes > 1048576 THEN
    RAISE EXCEPTION 'VNEXT_PRESET_TOO_LARGE: payload exceeds 1 MiB'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Chaves do envelope = ArsenalPresetSummarySchema / ArsenalPresetSchema do cliente.
CREATE FUNCTION public.vnext_preset_envelope_v1(
  p_preset public.vnext_presets,
  p_include_payload BOOLEAN
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
      'id', p_preset.id::TEXT,
      'scope', 'team',
      'origin', p_preset.origin,
      'kind', p_preset.kind,
      'name', p_preset.name,
      'category', p_preset.category,
      'tags', to_jsonb(p_preset.tags),
      'synonyms', to_jsonb(p_preset.synonyms),
      'payloadSchemaVersion', p_preset.payload_schema_version,
      'payloadBytes', p_preset.payload_bytes,
      'revision', p_preset.revision,
      'createdBy', p_preset.created_by::TEXT,
      'createdByName', NULLIF(btrim(pr.full_name), ''),
      'createdAt', p_preset.created_at,
      'updatedAt', p_preset.updated_at,
      'useCount', COALESCE(pu.use_count, 0),
      'lastUsedAt', pu.last_used_at
    )
    || CASE
      WHEN p_preset.description IS NULL THEN '{}'::JSONB
      ELSE jsonb_build_object('description', p_preset.description)
    END
    || CASE
      WHEN p_include_payload THEN jsonb_build_object('payload', p_preset.payload)
      ELSE '{}'::JSONB
    END
  FROM (SELECT 1) AS one
  LEFT JOIN public.profiles pr ON pr.id = p_preset.created_by
  LEFT JOIN public.vnext_preset_usage pu ON pu.preset_key = p_preset.id::TEXT;
$$;

-- 4. Leitura (admin/editor ativos) --------------------------------------------------------------------------------

-- Retorna { presets: [...sem payload], builtinUsage: [{ presetId, useCount, lastUsedAt }] }.
CREATE FUNCTION public.list_vnext_presets_v1(
  p_kind TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_presets JSONB;
  v_builtin_usage JSONB;
BEGIN
  PERFORM public.require_document_editor_v1();
  IF p_kind IS NOT NULL AND p_kind NOT IN ('page', 'block', 'table', 'style') THEN
    RAISE EXCEPTION 'VNEXT_INVALID_REQUEST: unknown kind %', p_kind
      USING ERRCODE = '22023';
  END IF;
  IF p_category IS NOT NULL
    AND p_category NOT IN ('capas', 'tabelas', 'cabecalhos', 'rodapes', 'paginas', 'estilos')
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_REQUEST: unknown category %', p_category
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    jsonb_agg(public.vnext_preset_envelope_v1(p, false) ORDER BY p.updated_at DESC, p.id ASC),
    '[]'::JSONB
  )
  INTO v_presets
  FROM public.vnext_presets p
  WHERE p.deleted_at IS NULL
    AND (p_kind IS NULL OR p.kind = p_kind)
    AND (p_category IS NULL OR p.category = p_category);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('presetId', u.preset_key, 'useCount', u.use_count, 'lastUsedAt', u.last_used_at)
      ORDER BY u.preset_key
    ),
    '[]'::JSONB
  )
  INTO v_builtin_usage
  FROM public.vnext_preset_usage u
  WHERE u.preset_key LIKE 'builtin:%';

  RETURN jsonb_build_object('presets', v_presets, 'builtinUsage', v_builtin_usage);
END;
$$;

-- Até 50 UUIDs, com payload, na ordem pedida. Ausentes e apagados ficam de fora. Embutidos não passam por aqui.
CREATE FUNCTION public.get_vnext_presets_v1(p_preset_ids TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_text TEXT;
  v_ids UUID[] := ARRAY[]::UUID[];
  v_result JSONB;
BEGIN
  PERFORM public.require_document_editor_v1();
  IF p_preset_ids IS NULL
    OR COALESCE(array_ndims(p_preset_ids), 1) <> 1
    OR cardinality(p_preset_ids) > 50
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_REQUEST: presetIds must be a list of at most 50 ids'
      USING ERRCODE = '22023';
  END IF;
  FOREACH v_text IN ARRAY p_preset_ids LOOP
    v_ids := v_ids || public.vnext_preset_require_uuid_v1(v_text, 'presetId');
  END LOOP;

  SELECT COALESCE(
    jsonb_agg(public.vnext_preset_envelope_v1(p, true) ORDER BY array_position(v_ids, p.id)),
    '[]'::JSONB
  )
  INTO v_result
  FROM public.vnext_presets p
  WHERE p.id = ANY (v_ids) AND p.deleted_at IS NULL;
  RETURN v_result;
END;
$$;

-- 5. Escrita (CAS, mutação idempotente) ---------------------------------------------------------------------------

CREATE FUNCTION public.create_vnext_preset_v1(
  p_preset_id TEXT,
  p_mutation_id TEXT,
  p_preset JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := public.require_document_editor_v1();
  v_preset_id UUID;
  v_mutation_id UUID;
  v_description TEXT;
  v_tags TEXT[];
  v_synonyms TEXT[];
  v_row public.vnext_presets;
BEGIN
  v_preset_id := public.vnext_preset_require_uuid_v1(p_preset_id, 'presetId');
  v_mutation_id := public.vnext_preset_require_uuid_v1(p_mutation_id, 'mutationId');
  PERFORM public.vnext_validate_preset_input_v1(p_preset);
  v_description := p_preset->>'description';
  v_tags := ARRAY(SELECT jsonb_array_elements_text(p_preset->'tags'));
  v_synonyms := ARRAY(SELECT jsonb_array_elements_text(p_preset->'synonyms'));

  INSERT INTO public.vnext_presets (
    id, revision, last_mutation_id, kind, category, name, description, tags, synonyms, origin,
    payload_schema_version, payload, payload_bytes, created_by, updated_by
  )
  VALUES (
    v_preset_id, 1, v_mutation_id, p_preset->>'kind', p_preset->>'category', p_preset->>'name', v_description,
    v_tags, v_synonyms, p_preset->>'origin',
    1, p_preset->'payload', octet_length(convert_to((p_preset->'payload')::TEXT, 'UTF8')), v_actor, v_actor
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN public.vnext_preset_envelope_v1(v_row, true);
  END IF;

  -- O id já existe: só o replay idêntico da mesma mutação, ainda a mais recente, devolve o preset.
  SELECT * INTO v_row
  FROM public.vnext_presets
  WHERE id = v_preset_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VNEXT_CONFLICT: preset % disappeared during create arbitration', p_preset_id
      USING ERRCODE = '40001';
  END IF;
  IF v_row.last_mutation_id <> v_mutation_id THEN
    RAISE EXCEPTION 'VNEXT_DUPLICATE_PRESET: preset % already exists', p_preset_id
      USING ERRCODE = '23505';
  END IF;
  IF v_row.revision <> 1 THEN
    RAISE EXCEPTION 'VNEXT_MUTATION_REPLAY_STALE: mutation is no longer latest'
      USING ERRCODE = '40001';
  END IF;
  IF v_row.created_by IS DISTINCT FROM v_actor
    OR v_row.kind IS DISTINCT FROM p_preset->>'kind'
    OR v_row.origin IS DISTINCT FROM p_preset->>'origin'
    OR v_row.name IS DISTINCT FROM p_preset->>'name'
    OR v_row.category IS DISTINCT FROM p_preset->>'category'
    OR v_row.description IS DISTINCT FROM v_description
    OR v_row.tags IS DISTINCT FROM v_tags
    OR v_row.synonyms IS DISTINCT FROM v_synonyms
    OR v_row.payload IS DISTINCT FROM p_preset->'payload'
  THEN
    RAISE EXCEPTION 'VNEXT_MUTATION_REUSE: mutation id reused with divergent create payload'
      USING ERRCODE = '40001';
  END IF;
  RETURN public.vnext_preset_envelope_v1(v_row, true);
END;
$$;

-- p_patch: qualquer subconjunto de name, category, description (null apaga), tags, synonyms, payload.
CREATE FUNCTION public.update_vnext_preset_cas_v1(
  p_preset_id TEXT,
  p_expected_revision BIGINT,
  p_mutation_id TEXT,
  p_patch JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := public.require_document_editor_v1();
  v_preset_id UUID;
  v_mutation_id UUID;
  v_current public.vnext_presets;
  v_base JSONB;
  v_merged JSONB;
BEGIN
  v_preset_id := public.vnext_preset_require_uuid_v1(p_preset_id, 'presetId');
  v_mutation_id := public.vnext_preset_require_uuid_v1(p_mutation_id, 'mutationId');
  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'VNEXT_INVALID_REQUEST: expectedRevision must be positive'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
    OR p_patch = '{}'::JSONB
    OR (p_patch - ARRAY['name', 'category', 'description', 'tags', 'synonyms', 'payload']::TEXT[]) <> '{}'::JSONB
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_REQUEST: patch must change name, category, description, tags, synonyms or payload'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current
  FROM public.vnext_presets
  WHERE id = v_preset_id
  FOR UPDATE;
  IF NOT FOUND OR v_current.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'VNEXT_NOT_FOUND: preset % does not exist', p_preset_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_current.created_by IS DISTINCT FROM v_actor
    AND public.team_role() IS DISTINCT FROM 'admin'::public.user_role
  THEN
    RAISE EXCEPTION 'VNEXT_FORBIDDEN: only the author or an admin can change preset %', p_preset_id
      USING ERRCODE = '42501';
  END IF;

  v_base := jsonb_build_object(
      'kind', v_current.kind,
      'origin', v_current.origin,
      'name', v_current.name,
      'category', v_current.category,
      'tags', to_jsonb(v_current.tags),
      'synonyms', to_jsonb(v_current.synonyms),
      'payloadSchemaVersion', v_current.payload_schema_version,
      'payload', v_current.payload
    )
    || CASE
      WHEN v_current.description IS NULL THEN '{}'::JSONB
      ELSE jsonb_build_object('description', v_current.description)
    END;
  v_merged := v_base || (p_patch - 'description');
  IF p_patch ? 'description' THEN
    IF p_patch->'description' = 'null'::JSONB THEN
      v_merged := v_merged - 'description';
    ELSE
      v_merged := v_merged || jsonb_build_object('description', p_patch->'description');
    END IF;
  END IF;

  IF v_current.last_mutation_id = v_mutation_id THEN
    IF v_current.revision <> p_expected_revision + 1 OR v_merged IS DISTINCT FROM v_base THEN
      RAISE EXCEPTION 'VNEXT_MUTATION_REUSE: mutation id reused with divergent update payload'
        USING ERRCODE = '40001';
    END IF;
    RETURN public.vnext_preset_envelope_v1(v_current, true);
  END IF;

  IF v_current.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'VNEXT_CONFLICT: expected revision %, current revision %',
      p_expected_revision, v_current.revision
      USING ERRCODE = '40001';
  END IF;

  IF p_patch ? 'payload' AND (p_patch->'payload'->>'kind') IS DISTINCT FROM v_current.kind THEN
    RAISE EXCEPTION 'VNEXT_INVALID_PRESET: payload kind cannot change'
      USING ERRCODE = '22023';
  END IF;
  PERFORM public.vnext_validate_preset_input_v1(v_merged);

  UPDATE public.vnext_presets
  SET revision = v_current.revision + 1,
      last_mutation_id = v_mutation_id,
      name = v_merged->>'name',
      category = v_merged->>'category',
      description = v_merged->>'description',
      tags = ARRAY(SELECT jsonb_array_elements_text(v_merged->'tags')),
      synonyms = ARRAY(SELECT jsonb_array_elements_text(v_merged->'synonyms')),
      payload = v_merged->'payload',
      payload_bytes = octet_length(convert_to((v_merged->'payload')::TEXT, 'UTF8')),
      updated_at = now(),
      updated_by = v_actor
  WHERE id = v_preset_id
  RETURNING * INTO v_current;

  RETURN public.vnext_preset_envelope_v1(v_current, true);
END;
$$;

-- Apagar é lógico: o preset some da galeria; um admin recupera pelo banco se foi engano.
CREATE FUNCTION public.delete_vnext_preset_cas_v1(
  p_preset_id TEXT,
  p_expected_revision BIGINT,
  p_mutation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := public.require_document_editor_v1();
  v_preset_id UUID;
  v_mutation_id UUID;
  v_current public.vnext_presets;
BEGIN
  v_preset_id := public.vnext_preset_require_uuid_v1(p_preset_id, 'presetId');
  v_mutation_id := public.vnext_preset_require_uuid_v1(p_mutation_id, 'mutationId');
  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'VNEXT_INVALID_REQUEST: expectedRevision must be positive'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current
  FROM public.vnext_presets
  WHERE id = v_preset_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VNEXT_NOT_FOUND: preset % does not exist', p_preset_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_current.deleted_at IS NOT NULL THEN
    IF v_current.last_mutation_id = v_mutation_id
      AND v_current.revision = p_expected_revision + 1
      AND v_current.deleted_by = v_actor
    THEN
      RETURN jsonb_build_object('presetId', v_current.id::TEXT, 'revision', v_current.revision);
    END IF;
    RAISE EXCEPTION 'VNEXT_NOT_FOUND: preset % does not exist', p_preset_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_current.created_by IS DISTINCT FROM v_actor
    AND public.team_role() IS DISTINCT FROM 'admin'::public.user_role
  THEN
    RAISE EXCEPTION 'VNEXT_FORBIDDEN: only the author or an admin can delete preset %', p_preset_id
      USING ERRCODE = '42501';
  END IF;
  IF v_current.last_mutation_id = v_mutation_id THEN
    RAISE EXCEPTION 'VNEXT_MUTATION_REUSE: mutation id reused with divergent delete payload'
      USING ERRCODE = '40001';
  END IF;
  IF v_current.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'VNEXT_CONFLICT: expected revision %, current revision %',
      p_expected_revision, v_current.revision
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.vnext_presets
  SET revision = v_current.revision + 1,
      last_mutation_id = v_mutation_id,
      deleted_at = now(),
      deleted_by = v_actor,
      updated_at = now(),
      updated_by = v_actor
  WHERE id = v_preset_id
  RETURNING * INTO v_current;

  RETURN jsonb_build_object('presetId', v_current.id::TEXT, 'revision', v_current.revision);
END;
$$;

-- Qualquer admin/editor, embutidos incluídos. Não mexe na revisão do preset.
CREATE FUNCTION public.record_vnext_preset_use_v1(p_preset_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_usage public.vnext_preset_usage;
BEGIN
  PERFORM public.require_document_editor_v1();
  IF p_preset_key IS NULL
    OR NOT (
      p_preset_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR p_preset_key ~ '^builtin:[a-z0-9][a-z0-9._-]{0,79}$'
    )
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_REQUEST: presetId must be a UUID or builtin:<slug>'
      USING ERRCODE = '22023';
  END IF;
  IF p_preset_key NOT LIKE 'builtin:%' THEN
    PERFORM 1
    FROM public.vnext_presets
    WHERE id = p_preset_key::UUID AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'VNEXT_NOT_FOUND: preset % does not exist', p_preset_key
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.vnext_preset_usage AS usage_row (preset_key, use_count, last_used_at)
  VALUES (p_preset_key, 1, now())
  ON CONFLICT (preset_key) DO UPDATE
  SET use_count = usage_row.use_count + 1,
      last_used_at = now()
  RETURNING * INTO v_usage;

  RETURN jsonb_build_object(
    'presetId', v_usage.preset_key,
    'useCount', v_usage.use_count,
    'lastUsedAt', v_usage.last_used_at
  );
END;
$$;

-- 6. RLS e permissões ---------------------------------------------------------------------------------------------
-- Ler: admin/editor ativos. Criar: admin/editor (autor = quem cria). Alterar/apagar: autor ou admin.
-- A tabela só tem SELECT para authenticated: as escritas passam pelas RPCs acima. As políticas de escrita ficam
-- como defesa em profundidade, caso um GRANT seja aberto no futuro.

ALTER TABLE public.vnext_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vnext_preset_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY vnext_presets_editor_read
ON public.vnext_presets
FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.team_role() IN ('admin', 'editor')
  AND deleted_at IS NULL
);

CREATE POLICY vnext_presets_editor_insert
ON public.vnext_presets
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.team_role() IN ('admin', 'editor')
  AND created_by = auth.uid()
);

CREATE POLICY vnext_presets_author_or_admin_update
ON public.vnext_presets
FOR UPDATE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.team_role() = 'admin'
    OR (public.team_role() = 'editor' AND created_by = auth.uid())
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.team_role() = 'admin'
    OR (public.team_role() = 'editor' AND created_by = auth.uid())
  )
);

CREATE POLICY vnext_presets_author_or_admin_delete
ON public.vnext_presets
FOR DELETE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.team_role() = 'admin'
    OR (public.team_role() = 'editor' AND created_by = auth.uid())
  )
);

CREATE POLICY vnext_preset_usage_editor_read
ON public.vnext_preset_usage
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL AND public.team_role() IN ('admin', 'editor'));

REVOKE ALL ON TABLE public.vnext_presets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.vnext_preset_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vnext_presets TO authenticated;
GRANT SELECT ON TABLE public.vnext_preset_usage TO authenticated;

REVOKE ALL ON FUNCTION public.vnext_preset_terms_valid_v1(TEXT[], INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vnext_preset_require_uuid_v1(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vnext_validate_preset_input_v1(JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vnext_preset_envelope_v1(public.vnext_presets, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.list_vnext_presets_v1(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_vnext_presets_v1(TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_vnext_preset_v1(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_vnext_preset_cas_v1(TEXT, BIGINT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_vnext_preset_cas_v1(TEXT, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_vnext_preset_use_v1(TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_vnext_presets_v1(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vnext_presets_v1(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vnext_preset_v1(TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_vnext_preset_cas_v1(TEXT, BIGINT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_vnext_preset_cas_v1(TEXT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_vnext_preset_use_v1(TEXT) TO authenticated;

COMMENT ON TABLE public.vnext_presets
  IS 'Arsenal da equipe (ADR-arsenal): presets page/block/table/style; escrita só pelas RPCs com CAS.';
COMMENT ON TABLE public.vnext_preset_usage
  IS 'Contagem de uso dos presets da equipe e dos modelos embutidos (builtin:<slug>).';

COMMIT;
