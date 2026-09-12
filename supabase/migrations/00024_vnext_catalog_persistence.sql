-- W3.B: VNext durable snapshot persistence, strict CAS and immutable revision history.
-- Additive only. Legacy catalogs/catalog_versions/save_catalog_v3 remain untouched.
BEGIN;

CREATE TABLE public.vnext_catalogs (
  id UUID PRIMARY KEY,
  remote_revision BIGINT NOT NULL CHECK (remote_revision >= 1),
  last_mutation_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (length(title) > 0),
  locale TEXT NOT NULL CHECK (length(locale) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  archived_at TIMESTAMPTZ,
  origin_kind TEXT,
  origin_id TEXT,
  origin_revision BIGINT CHECK (origin_revision IS NULL OR origin_revision >= 0),
  document_schema_version INTEGER NOT NULL CHECK (document_schema_version = 1),
  document_snapshot JSONB NOT NULL
);

CREATE TABLE public.vnext_catalog_revisions (
  catalog_id UUID NOT NULL REFERENCES public.vnext_catalogs(id) ON DELETE RESTRICT,
  revision BIGINT NOT NULL CHECK (revision >= 1),
  mutation_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'save', 'archive')),
  expected_remote_revision BIGINT CHECK (
    expected_remote_revision IS NULL OR expected_remote_revision >= 1
  ),
  title TEXT NOT NULL CHECK (length(title) > 0),
  locale TEXT NOT NULL CHECK (length(locale) > 0),
  archived_at TIMESTAMPTZ,
  origin_kind TEXT,
  origin_id TEXT,
  origin_revision BIGINT CHECK (origin_revision IS NULL OR origin_revision >= 0),
  document_schema_version INTEGER NOT NULL CHECK (document_schema_version = 1),
  document_snapshot JSONB NOT NULL,
  actor_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_id, revision),
  UNIQUE (catalog_id, mutation_id)
);

CREATE INDEX idx_vnext_catalogs_library
  ON public.vnext_catalogs ((archived_at IS NOT NULL), updated_at DESC, id);
CREATE INDEX idx_vnext_catalog_revisions_catalog
  ON public.vnext_catalog_revisions (catalog_id, revision DESC);

CREATE FUNCTION public.vnext_require_canonical_uuid_text_v1(
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
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: % must be an exact canonical lowercase UUID', p_label
      USING ERRCODE = '22023';
  END IF;
  RETURN p_value::UUID;
END;
$$;

CREATE FUNCTION public.vnext_require_reader_v1()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role public.user_role := public.team_role();
BEGIN
  IF v_actor IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'VNEXT_UNAUTHORIZED: active corporate session required'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END;
$$;

CREATE FUNCTION public.vnext_validate_origin_v1(p_origin JSONB)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_revision NUMERIC;
BEGIN
  IF p_origin IS NULL OR p_origin = 'null'::JSONB THEN
    RETURN;
  END IF;

  IF jsonb_typeof(p_origin) IS DISTINCT FROM 'object'
    OR (p_origin - ARRAY['originKind', 'originId', 'originRevision']::TEXT[]) <> '{}'::JSONB
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: invalid origin object'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_origin->'originKind') IS DISTINCT FROM 'string'
    OR length(p_origin->>'originKind') = 0
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: originKind must be a non-empty string'
      USING ERRCODE = '22023';
  END IF;

  IF p_origin ? 'originId'
    AND (
      jsonb_typeof(p_origin->'originId') IS DISTINCT FROM 'string'
      OR length(p_origin->>'originId') = 0
    )
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: originId must be a non-empty string when present'
      USING ERRCODE = '22023';
  END IF;

  IF p_origin ? 'originRevision' THEN
    IF jsonb_typeof(p_origin->'originRevision') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: originRevision must be a safe non-negative integer'
        USING ERRCODE = '22023';
    END IF;
    v_revision := (p_origin->>'originRevision')::NUMERIC;
    IF v_revision < 0 OR v_revision <> trunc(v_revision) OR v_revision > 9007199254740991 THEN
      RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: originRevision must be a safe non-negative integer'
        USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$$;

CREATE FUNCTION public.vnext_validate_snapshot_v1(
  p_expected_catalog_id UUID,
  p_snapshot JSONB
)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_schema NUMERIC;
  v_size_bytes BIGINT;
  v_source_server_version NUMERIC;
BEGIN
  IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: document snapshot must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  IF (p_snapshot - ARRAY[
    'schemaVersion',
    'id',
    'title',
    'locale',
    'style',
    'pages',
    'assets',
    'source'
  ]::TEXT[]) <> '{}'::JSONB THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: document snapshot contains unknown top-level keys'
      USING ERRCODE = '22023';
  END IF;

  v_size_bytes := octet_length(convert_to(p_snapshot::TEXT, 'UTF8'));
  IF v_size_bytes > 10485760 THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: document snapshot exceeds 10 MiB persistence safety limit'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_snapshot->'schemaVersion') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: schemaVersion must be numeric'
      USING ERRCODE = '22023';
  END IF;
  v_schema := (p_snapshot->>'schemaVersion')::NUMERIC;
  IF v_schema <> 1 OR v_schema <> trunc(v_schema) THEN
    RAISE EXCEPTION 'VNEXT_UNSUPPORTED_VERSION: only CatalogDocument schemaVersion 1 is supported'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_snapshot->'id') IS DISTINCT FROM 'string'
    OR (p_snapshot->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: document id must be an exact canonical lowercase UUID'
      USING ERRCODE = '22023';
  END IF;
  IF p_snapshot->>'id' IS DISTINCT FROM p_expected_catalog_id::TEXT THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: document id does not match durable catalog id'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_snapshot->'title') IS DISTINCT FROM 'string'
    OR length(p_snapshot->>'title') = 0
    OR jsonb_typeof(p_snapshot->'locale') IS DISTINCT FROM 'string'
    OR length(p_snapshot->>'locale') = 0
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: title and locale must be non-empty strings'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_snapshot->'style') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_snapshot->'pages') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_snapshot->'pages') < 1
    OR jsonb_typeof(p_snapshot->'assets') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: style object, non-empty pages array and assets array are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_snapshot ? 'source' THEN
    IF jsonb_typeof(p_snapshot->'source') IS DISTINCT FROM 'object'
      OR ((p_snapshot->'source') - ARRAY['documentId', 'serverVersion']::TEXT[]) <> '{}'::JSONB
      OR NOT ((p_snapshot->'source') ?& ARRAY['documentId', 'serverVersion']::TEXT[])
    THEN
      RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: source must contain exactly documentId and serverVersion'
        USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_snapshot->'source'->'documentId') IS DISTINCT FROM 'string'
      OR length(p_snapshot->'source'->>'documentId') = 0
    THEN
      RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: source.documentId must be a non-empty string'
        USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_snapshot->'source'->'serverVersion') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: source.serverVersion must be a safe non-negative integer'
        USING ERRCODE = '22023';
    END IF;
    v_source_server_version := (p_snapshot->'source'->>'serverVersion')::NUMERIC;
    IF v_source_server_version < 0
      OR v_source_server_version <> trunc(v_source_server_version)
      OR v_source_server_version > 9007199254740991
    THEN
      RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: source.serverVersion must be a safe non-negative integer'
        USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$$;

CREATE FUNCTION public.vnext_catalog_envelope_v1(p_catalog public.vnext_catalogs)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'catalogId', p_catalog.id::TEXT,
    'remoteRevision', p_catalog.remote_revision,
    'lastMutationId', p_catalog.last_mutation_id::TEXT,
    'title', p_catalog.title,
    'locale', p_catalog.locale,
    'createdAt', p_catalog.created_at,
    'updatedAt', p_catalog.updated_at,
    'createdBy', p_catalog.created_by,
    'updatedBy', p_catalog.updated_by,
    'archivedAt', p_catalog.archived_at,
    'documentSchemaVersion', p_catalog.document_schema_version,
    'documentSnapshot', p_catalog.document_snapshot
  ) || CASE
    WHEN p_catalog.origin_kind IS NULL THEN '{}'::JSONB
    ELSE jsonb_build_object(
      'origin',
      jsonb_strip_nulls(jsonb_build_object(
        'originKind', p_catalog.origin_kind,
        'originId', p_catalog.origin_id,
        'originRevision', p_catalog.origin_revision
      ))
    )
  END;
$$;

CREATE FUNCTION public.vnext_catalog_metadata_v1(p_catalog public.vnext_catalogs)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$ SELECT public.vnext_catalog_envelope_v1(p_catalog) - 'documentSnapshot'; $$;

CREATE FUNCTION public.vnext_catalog_list_item_v1(p_catalog public.vnext_catalogs)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$ SELECT public.vnext_catalog_metadata_v1(p_catalog) - 'lastMutationId'; $$;

CREATE FUNCTION public.vnext_reject_revision_mutation_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'VNEXT_REVISION_IMMUTABLE: revision history cannot be updated or deleted'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER vnext_catalog_revisions_immutable
BEFORE UPDATE OR DELETE ON public.vnext_catalog_revisions
FOR EACH ROW EXECUTE FUNCTION public.vnext_reject_revision_mutation_v1();

CREATE FUNCTION public.list_vnext_catalogs_v1(p_include_archived BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM public.vnext_require_reader_v1();
  SELECT COALESCE(
    jsonb_agg(
      public.vnext_catalog_list_item_v1(c)
      ORDER BY (c.archived_at IS NOT NULL) ASC, c.updated_at DESC, c.id ASC
    ),
    '[]'::JSONB
  )
  INTO v_result
  FROM public.vnext_catalogs c
  WHERE p_include_archived OR c.archived_at IS NULL;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.get_vnext_catalog_v1(p_catalog_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_catalog_id UUID;
  v_current public.vnext_catalogs;
BEGIN
  PERFORM public.vnext_require_reader_v1();
  v_catalog_id := public.vnext_require_canonical_uuid_text_v1(p_catalog_id, 'catalogId');

  SELECT * INTO v_current
  FROM public.vnext_catalogs
  WHERE id = v_catalog_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VNEXT_NOT_FOUND: catalog % does not exist', p_catalog_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN public.vnext_catalog_envelope_v1(v_current);
END;
$$;

CREATE FUNCTION public.create_vnext_catalog_v1(
  p_mutation_id TEXT,
  p_document_snapshot JSONB,
  p_origin JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := public.require_document_editor_v1();
  v_catalog_id UUID;
  v_mutation_id UUID;
  v_current public.vnext_catalogs;
  v_replay public.vnext_catalog_revisions;
  v_origin_kind TEXT;
  v_origin_id TEXT;
  v_origin_revision BIGINT;
BEGIN
  v_mutation_id := public.vnext_require_canonical_uuid_text_v1(p_mutation_id, 'mutationId');
  IF jsonb_typeof(p_document_snapshot->'id') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: document id must be a string'
      USING ERRCODE = '22023';
  END IF;
  v_catalog_id := public.vnext_require_canonical_uuid_text_v1(
    p_document_snapshot->>'id',
    'catalogId'
  );
  PERFORM public.vnext_validate_snapshot_v1(v_catalog_id, p_document_snapshot);
  PERFORM public.vnext_validate_origin_v1(p_origin);

  IF p_origin IS NOT NULL AND p_origin <> 'null'::JSONB THEN
    v_origin_kind := p_origin->>'originKind';
    v_origin_id := p_origin->>'originId';
    IF p_origin ? 'originRevision' THEN
      v_origin_revision := (p_origin->>'originRevision')::BIGINT;
    END IF;
  END IF;

  INSERT INTO public.vnext_catalogs (
    id,
    remote_revision,
    last_mutation_id,
    title,
    locale,
    created_by,
    updated_by,
    archived_at,
    origin_kind,
    origin_id,
    origin_revision,
    document_schema_version,
    document_snapshot
  )
  VALUES (
    v_catalog_id,
    1,
    v_mutation_id,
    p_document_snapshot->>'title',
    p_document_snapshot->>'locale',
    v_actor,
    v_actor,
    NULL,
    v_origin_kind,
    v_origin_id,
    v_origin_revision,
    1,
    p_document_snapshot
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_current;

  IF NOT FOUND THEN
    SELECT * INTO v_current
    FROM public.vnext_catalogs
    WHERE id = v_catalog_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'VNEXT_CONFLICT: catalog % disappeared during create arbitration', v_catalog_id
        USING ERRCODE = '40001';
    END IF;

    SELECT * INTO v_replay
    FROM public.vnext_catalog_revisions
    WHERE catalog_id = v_catalog_id AND mutation_id = v_mutation_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'VNEXT_DUPLICATE_CATALOG: catalog % already exists', v_catalog_id
        USING ERRCODE = '40001';
    END IF;
    IF v_replay.revision <> v_current.remote_revision THEN
      RAISE EXCEPTION 'VNEXT_MUTATION_REPLAY_STALE: mutation is no longer latest'
        USING ERRCODE = '40001';
    END IF;
    IF v_replay.operation <> 'create'
      OR v_replay.expected_remote_revision IS NOT NULL
      OR v_replay.document_snapshot IS DISTINCT FROM p_document_snapshot
      OR v_replay.origin_kind IS DISTINCT FROM v_origin_kind
      OR v_replay.origin_id IS DISTINCT FROM v_origin_id
      OR v_replay.origin_revision IS DISTINCT FROM v_origin_revision
    THEN
      RAISE EXCEPTION 'VNEXT_MUTATION_REUSE: mutation id reused with divergent create payload'
        USING ERRCODE = '40001';
    END IF;
    RETURN public.vnext_catalog_envelope_v1(v_current);
  END IF;

  INSERT INTO public.vnext_catalog_revisions (
    catalog_id,
    revision,
    mutation_id,
    operation,
    expected_remote_revision,
    title,
    locale,
    archived_at,
    origin_kind,
    origin_id,
    origin_revision,
    document_schema_version,
    document_snapshot,
    actor_id
  )
  VALUES (
    v_catalog_id,
    1,
    v_mutation_id,
    'create',
    NULL,
    v_current.title,
    v_current.locale,
    NULL,
    v_origin_kind,
    v_origin_id,
    v_origin_revision,
    1,
    p_document_snapshot,
    v_actor
  );

  RETURN public.vnext_catalog_envelope_v1(v_current);
END;
$$;

CREATE FUNCTION public.save_vnext_catalog_cas_v1(
  p_catalog_id TEXT,
  p_expected_remote_revision BIGINT,
  p_mutation_id TEXT,
  p_document_snapshot JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := public.require_document_editor_v1();
  v_catalog_id UUID;
  v_mutation_id UUID;
  v_current public.vnext_catalogs;
  v_replay public.vnext_catalog_revisions;
  v_new_revision BIGINT;
BEGIN
  v_catalog_id := public.vnext_require_canonical_uuid_text_v1(p_catalog_id, 'catalogId');
  v_mutation_id := public.vnext_require_canonical_uuid_text_v1(p_mutation_id, 'mutationId');
  IF p_expected_remote_revision IS NULL OR p_expected_remote_revision < 1 THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: expectedRemoteRevision must be positive'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current
  FROM public.vnext_catalogs
  WHERE id = v_catalog_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VNEXT_NOT_FOUND: catalog % does not exist', p_catalog_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_current.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'VNEXT_ARCHIVED: catalog % is archived', p_catalog_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_replay
  FROM public.vnext_catalog_revisions
  WHERE catalog_id = v_catalog_id AND mutation_id = v_mutation_id;

  IF FOUND THEN
    IF v_replay.revision <> v_current.remote_revision THEN
      RAISE EXCEPTION 'VNEXT_MUTATION_REPLAY_STALE: mutation is no longer latest'
        USING ERRCODE = '40001';
    END IF;
    IF v_replay.operation <> 'save'
      OR v_replay.expected_remote_revision IS DISTINCT FROM p_expected_remote_revision
      OR v_replay.document_snapshot IS DISTINCT FROM p_document_snapshot
    THEN
      RAISE EXCEPTION 'VNEXT_MUTATION_REUSE: mutation id reused with divergent save payload'
        USING ERRCODE = '40001';
    END IF;
    RETURN public.vnext_catalog_envelope_v1(v_current);
  END IF;

  IF v_current.remote_revision <> p_expected_remote_revision THEN
    RAISE EXCEPTION 'VNEXT_CONFLICT: expected revision %, current revision %',
      p_expected_remote_revision,
      v_current.remote_revision
      USING ERRCODE = '40001';
  END IF;

  PERFORM public.vnext_validate_snapshot_v1(v_catalog_id, p_document_snapshot);

  v_new_revision := v_current.remote_revision + 1;
  UPDATE public.vnext_catalogs
  SET remote_revision = v_new_revision,
      last_mutation_id = v_mutation_id,
      title = p_document_snapshot->>'title',
      locale = p_document_snapshot->>'locale',
      updated_at = now(),
      updated_by = v_actor,
      document_schema_version = 1,
      document_snapshot = p_document_snapshot
  WHERE id = v_catalog_id
  RETURNING * INTO v_current;

  INSERT INTO public.vnext_catalog_revisions (
    catalog_id,
    revision,
    mutation_id,
    operation,
    expected_remote_revision,
    title,
    locale,
    archived_at,
    origin_kind,
    origin_id,
    origin_revision,
    document_schema_version,
    document_snapshot,
    actor_id
  )
  VALUES (
    v_catalog_id,
    v_new_revision,
    v_mutation_id,
    'save',
    p_expected_remote_revision,
    v_current.title,
    v_current.locale,
    v_current.archived_at,
    v_current.origin_kind,
    v_current.origin_id,
    v_current.origin_revision,
    1,
    p_document_snapshot,
    v_actor
  );

  RETURN public.vnext_catalog_envelope_v1(v_current);
END;
$$;

CREATE FUNCTION public.archive_vnext_catalog_cas_v1(
  p_catalog_id TEXT,
  p_expected_remote_revision BIGINT,
  p_mutation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := public.require_document_editor_v1();
  v_catalog_id UUID;
  v_mutation_id UUID;
  v_current public.vnext_catalogs;
  v_replay public.vnext_catalog_revisions;
  v_new_revision BIGINT;
BEGIN
  v_catalog_id := public.vnext_require_canonical_uuid_text_v1(p_catalog_id, 'catalogId');
  v_mutation_id := public.vnext_require_canonical_uuid_text_v1(p_mutation_id, 'mutationId');
  IF p_expected_remote_revision IS NULL OR p_expected_remote_revision < 1 THEN
    RAISE EXCEPTION 'VNEXT_INVALID_DOCUMENT: expectedRemoteRevision must be positive'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current
  FROM public.vnext_catalogs
  WHERE id = v_catalog_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VNEXT_NOT_FOUND: catalog % does not exist', p_catalog_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_replay
  FROM public.vnext_catalog_revisions
  WHERE catalog_id = v_catalog_id AND mutation_id = v_mutation_id;
  IF FOUND THEN
    IF v_replay.revision <> v_current.remote_revision THEN
      RAISE EXCEPTION 'VNEXT_MUTATION_REPLAY_STALE: mutation is no longer latest'
        USING ERRCODE = '40001';
    END IF;
    IF v_replay.operation <> 'archive'
      OR v_replay.expected_remote_revision IS DISTINCT FROM p_expected_remote_revision
    THEN
      RAISE EXCEPTION 'VNEXT_MUTATION_REUSE: mutation id reused with divergent archive payload'
        USING ERRCODE = '40001';
    END IF;
    RETURN public.vnext_catalog_metadata_v1(v_current);
  END IF;

  IF v_current.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'VNEXT_ARCHIVED: catalog % is already archived', p_catalog_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_current.remote_revision <> p_expected_remote_revision THEN
    RAISE EXCEPTION 'VNEXT_CONFLICT: expected revision %, current revision %',
      p_expected_remote_revision, v_current.remote_revision
      USING ERRCODE = '40001';
  END IF;

  v_new_revision := v_current.remote_revision + 1;
  UPDATE public.vnext_catalogs
  SET remote_revision = v_new_revision,
      last_mutation_id = v_mutation_id,
      updated_at = now(),
      updated_by = v_actor,
      archived_at = now()
  WHERE id = v_catalog_id
  RETURNING * INTO v_current;

  INSERT INTO public.vnext_catalog_revisions (
    catalog_id, revision, mutation_id, operation, expected_remote_revision,
    title, locale, archived_at, origin_kind, origin_id, origin_revision,
    document_schema_version, document_snapshot, actor_id
  )
  VALUES (
    v_catalog_id, v_new_revision, v_mutation_id, 'archive', p_expected_remote_revision,
    v_current.title, v_current.locale, v_current.archived_at,
    v_current.origin_kind, v_current.origin_id, v_current.origin_revision,
    v_current.document_schema_version, v_current.document_snapshot, v_actor
  );

  RETURN public.vnext_catalog_metadata_v1(v_current);
END;
$$;

ALTER TABLE public.vnext_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vnext_catalog_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY vnext_catalogs_team_read
ON public.vnext_catalogs
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL AND public.team_role() IS NOT NULL);

CREATE POLICY vnext_catalog_revisions_team_read
ON public.vnext_catalog_revisions
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL AND public.team_role() IS NOT NULL);

REVOKE ALL ON TABLE public.vnext_catalogs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.vnext_catalog_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vnext_catalogs TO authenticated;
GRANT SELECT ON TABLE public.vnext_catalog_revisions TO authenticated;

REVOKE ALL ON FUNCTION public.vnext_require_canonical_uuid_text_v1(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vnext_require_reader_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vnext_validate_origin_v1(JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vnext_validate_snapshot_v1(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vnext_catalog_envelope_v1(public.vnext_catalogs)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vnext_catalog_metadata_v1(public.vnext_catalogs)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vnext_catalog_list_item_v1(public.vnext_catalogs)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vnext_reject_revision_mutation_v1()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.list_vnext_catalogs_v1(BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_vnext_catalog_v1(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_vnext_catalog_v1(TEXT, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_vnext_catalog_cas_v1(TEXT, BIGINT, TEXT, JSONB)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_vnext_catalog_cas_v1(TEXT, BIGINT, TEXT)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_vnext_catalogs_v1(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vnext_catalog_v1(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vnext_catalog_v1(TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_vnext_catalog_cas_v1(TEXT, BIGINT, TEXT, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_vnext_catalog_cas_v1(TEXT, BIGINT, TEXT)
  TO authenticated;

COMMIT;
