-- FR-04/FR-05: restauração com CAS e nome de quem editou na biblioteca.
-- Apenas arquivo de migração. A aplicação fica a cargo da Equipe A.
BEGIN;

ALTER TABLE public.vnext_catalog_revisions
  DROP CONSTRAINT vnext_catalog_revisions_operation_check;
ALTER TABLE public.vnext_catalog_revisions
  ADD CONSTRAINT vnext_catalog_revisions_operation_check
  CHECK (operation IN ('create', 'save', 'archive', 'unarchive'));

CREATE FUNCTION public.unarchive_vnext_catalog_cas_v1(
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
    IF v_replay.operation <> 'unarchive'
      OR v_replay.expected_remote_revision IS DISTINCT FROM p_expected_remote_revision
    THEN
      RAISE EXCEPTION 'VNEXT_MUTATION_REUSE: mutation id reused with divergent unarchive payload'
        USING ERRCODE = '40001';
    END IF;
    RETURN public.vnext_catalog_metadata_v1(v_current);
  END IF;

  IF v_current.archived_at IS NULL THEN
    RAISE EXCEPTION 'VNEXT_CONFLICT: catalog % is already active', p_catalog_id
      USING ERRCODE = '40001';
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
      archived_at = NULL
  WHERE id = v_catalog_id
  RETURNING * INTO v_current;

  INSERT INTO public.vnext_catalog_revisions (
    catalog_id, revision, mutation_id, operation, expected_remote_revision,
    title, locale, archived_at, origin_kind, origin_id, origin_revision,
    document_schema_version, document_snapshot, actor_id
  )
  VALUES (
    v_catalog_id, v_new_revision, v_mutation_id, 'unarchive', p_expected_remote_revision,
    v_current.title, v_current.locale, v_current.archived_at,
    v_current.origin_kind, v_current.origin_id, v_current.origin_revision,
    v_current.document_schema_version, v_current.document_snapshot, v_actor
  );

  RETURN public.vnext_catalog_metadata_v1(v_current);
END;
$$;

-- Mantém o formato e a autorização da listagem; acrescenta apenas um nome opcional.
CREATE OR REPLACE FUNCTION public.list_vnext_catalogs_v1(p_include_archived BOOLEAN DEFAULT false)
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
        || jsonb_build_object('updatedByName', NULLIF(btrim(p.full_name), ''))
      ORDER BY (c.archived_at IS NOT NULL) ASC, c.updated_at DESC, c.id ASC
    ),
    '[]'::JSONB
  )
  INTO v_result
  FROM public.vnext_catalogs c
  LEFT JOIN public.profiles p ON p.id = c.updated_by
  WHERE p_include_archived OR c.archived_at IS NULL;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.unarchive_vnext_catalog_cas_v1(TEXT, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_vnext_catalog_cas_v1(TEXT, BIGINT, TEXT)
  TO authenticated;
REVOKE ALL ON FUNCTION public.list_vnext_catalogs_v1(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_vnext_catalogs_v1(BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.unarchive_vnext_catalog_cas_v1(TEXT, BIGINT, TEXT)
  IS 'Restaura o mesmo catálogo com revisão CAS, histórico imutável e autorização de editor.';

COMMIT;
