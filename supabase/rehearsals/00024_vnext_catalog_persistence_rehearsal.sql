-- W3.B real PostgreSQL/Supabase rehearsal on a disposable database.

DO $$
DECLARE
  v_editor UUID := '90000000-0000-4000-8000-000000000001';
  v_viewer UUID := '90000000-0000-4000-8000-000000000002';
  v_admin UUID := '90000000-0000-4000-8000-000000000003';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES
    (v_editor, 'w3b-editor@presys.invalid', '{"full_name":"W3B Editor"}', '{"role":"authenticated"}'),
    (v_viewer, 'w3b-viewer@presys.invalid', '{"full_name":"W3B Viewer"}', '{"role":"authenticated"}'),
    (v_admin, 'w3b-admin@presys.invalid', '{"full_name":"W3B Admin"}', '{"role":"authenticated"}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, full_name, role, is_active)
  VALUES
    (v_editor, 'W3B Editor', 'editor', true),
    (v_viewer, 'W3B Viewer', 'viewer', true),
    (v_admin, 'W3B Admin', 'admin', true)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role, is_active = true;
END;
$$;

-- POINT 01: no authenticated actor => no metadata leak.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.list_vnext_catalogs_v1(false);
    RAISE EXCEPTION 'POINT-01 unauthenticated list unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%VNEXT_UNAUTHORIZED%' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

-- POINT 02: active viewer may read but cannot mutate.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$
BEGIN
  IF public.list_vnext_catalogs_v1(false) <> '[]'::jsonb THEN
    RAISE EXCEPTION 'POINT-02 initial viewer list should be empty';
  END IF;
  BEGIN
    PERFORM public.create_vnext_catalog_v1(
      'a0000000-0000-4000-8000-000000000002',
      '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000002","title":"Viewer denied","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb,
      NULL
    );
    RAISE EXCEPTION 'POINT-02 viewer create unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%AUTH_ROLE_FORBIDDEN%' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

-- POINTS 03-10: editor CREATE/SAVE, UUID round-trip, replay and strict CAS.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
DECLARE
  v_catalog CONSTANT TEXT := '10000000-0000-4000-8000-000000000010';
  v_create_mutation CONSTANT TEXT := 'a0000000-0000-4000-8000-000000000010';
  v_save_mutation CONSTANT TEXT := 'a0000000-0000-4000-8000-000000000030';
  v_create JSONB := '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000010","title":"W3.B Editor Catalog","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb;
  v_saved JSONB := '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000010","title":"W3.B Saved","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb;
  v_result JSONB;
  v_before BIGINT;
BEGIN
  v_result := public.create_vnext_catalog_v1(
    v_create_mutation,
    v_create,
    '{"originKind":"blank","originId":"w3b-rehearsal","originRevision":0}'::jsonb
  );
  IF v_result->>'catalogId' <> v_catalog OR (v_result->>'remoteRevision')::int <> 1 THEN
    RAISE EXCEPTION 'POINT-03 create envelope/UUID mismatch: %', v_result;
  END IF;
  IF (SELECT id::text FROM public.vnext_catalogs WHERE id = v_catalog::uuid) <> v_catalog THEN
    RAISE EXCEPTION 'POINT-03 PostgreSQL UUID textual round-trip changed id';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vnext_catalog_revisions
    WHERE catalog_id = v_catalog::uuid
      AND revision = 1
      AND mutation_id::text = v_create_mutation
      AND operation = 'create'
      AND document_snapshot = v_create
  ) THEN
    RAISE EXCEPTION 'POINT-03 exact revision 1 missing';
  END IF;

  v_result := public.create_vnext_catalog_v1(
    v_create_mutation,
    v_create,
    '{"originKind":"blank","originId":"w3b-rehearsal","originRevision":0}'::jsonb
  );
  IF (v_result->>'remoteRevision')::int <> 1 THEN
    RAISE EXCEPTION 'POINT-04 create replay advanced revision';
  END IF;

  BEGIN
    PERFORM public.create_vnext_catalog_v1(
      'a0000000-0000-4000-8000-000000000011',
      v_create,
      '{"originKind":"blank","originId":"w3b-rehearsal","originRevision":0}'::jsonb
    );
    RAISE EXCEPTION 'POINT-05 duplicate root succeeded';
  EXCEPTION WHEN serialization_failure THEN
    IF SQLERRM NOT LIKE '%VNEXT_DUPLICATE_CATALOG%' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO v_before FROM public.vnext_catalogs;
  BEGIN
    PERFORM public.create_vnext_catalog_v1(
      'a0000000-0000-4000-8000-000000000020',
      '{"schemaVersion":1,"id":"20000000-0000-4000-8000-000000000020","title":"garbage","locale":"pt-BR","style":{},"pages":[],"assets":[]}'::jsonb,
      NULL
    );
    RAISE EXCEPTION 'POINT-06 malformed snapshot succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%VNEXT_INVALID_DOCUMENT%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_vnext_catalog_v1(
      'a0000000-0000-4000-8000-000000000021',
      '{"schemaVersion":1,"id":"ABCDEFAB-0000-4000-8000-000000000021","title":"uppercase","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb,
      NULL
    );
    RAISE EXCEPTION 'POINT-06 uppercase root was normalized';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%canonical lowercase UUID%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.vnext_catalogs) <> v_before THEN
    RAISE EXCEPTION 'POINT-06 rejected RPC changed durable state';
  END IF;

  v_result := public.save_vnext_catalog_cas_v1(v_catalog, 1, v_save_mutation, v_saved);
  IF (v_result->>'remoteRevision')::int <> 2
    OR v_result->>'lastMutationId' <> v_save_mutation
    OR v_result->>'title' <> 'W3.B Saved'
  THEN
    RAISE EXCEPTION 'POINT-07 save mismatch: %', v_result;
  END IF;

  v_result := public.save_vnext_catalog_cas_v1(v_catalog, 1, v_save_mutation, v_saved);
  IF (v_result->>'remoteRevision')::int <> 2 THEN
    RAISE EXCEPTION 'POINT-08 exact save replay advanced revision';
  END IF;

  BEGIN
    PERFORM public.save_vnext_catalog_cas_v1(
      v_catalog,
      1,
      v_save_mutation,
      jsonb_set(v_saved, '{title}', '"Divergent"')
    );
    RAISE EXCEPTION 'POINT-09 divergent mutation reuse succeeded';
  EXCEPTION WHEN serialization_failure THEN
    IF SQLERRM NOT LIKE '%VNEXT_MUTATION_REUSE%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.save_vnext_catalog_cas_v1(
      v_catalog,
      1,
      'a0000000-0000-4000-8000-000000000031',
      v_saved
    );
    RAISE EXCEPTION 'POINT-10 stale save succeeded';
  EXCEPTION WHEN serialization_failure THEN
    IF SQLERRM NOT LIKE '%VNEXT_CONFLICT%' THEN RAISE; END IF;
  END;

  IF (SELECT remote_revision FROM public.vnext_catalogs WHERE id = v_catalog::uuid) <> 2
    OR (SELECT count(*) FROM public.vnext_catalog_revisions WHERE catalog_id = v_catalog::uuid) <> 2
  THEN
    RAISE EXCEPTION 'POINT-10 failed operation consumed revision/history';
  END IF;
END;
$$;
RESET ROLE;


-- POINT 11: admin may mutate and mutation uniqueness is catalog-scoped.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$
DECLARE
  v_mutation CONSTANT TEXT := 'a0000000-0000-4000-8000-000000000040';
BEGIN
  PERFORM public.create_vnext_catalog_v1(
    v_mutation,
    '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000040","title":"Admin A","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb,
    NULL
  );
  PERFORM public.create_vnext_catalog_v1(
    v_mutation,
    '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000041","title":"Admin B","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb,
    NULL
  );
  IF (SELECT count(*) FROM public.vnext_catalog_revisions WHERE mutation_id = v_mutation::uuid) <> 2 THEN
    RAISE EXCEPTION 'POINT-11 cross-catalog mutation id collided';
  END IF;
END;
$$;
RESET ROLE;

-- POINT 12: authenticated application roles have no direct table DML.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.vnext_catalogs', 'INSERT')
    OR has_table_privilege('authenticated', 'public.vnext_catalogs', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.vnext_catalogs', 'DELETE')
    OR has_table_privilege('authenticated', 'public.vnext_catalog_revisions', 'INSERT')
    OR has_table_privilege('authenticated', 'public.vnext_catalog_revisions', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.vnext_catalog_revisions', 'DELETE')
  THEN
    RAISE EXCEPTION 'POINT-12 direct DML privilege exists';
  END IF;

  BEGIN
    INSERT INTO public.vnext_catalogs (
      id, remote_revision, last_mutation_id, title, locale,
      document_schema_version, document_snapshot
    ) VALUES (
      '10000000-0000-4000-8000-000000000099'::uuid,
      1,
      'a0000000-0000-4000-8000-000000000099'::uuid,
      'Illegal',
      'pt-BR',
      1,
      '{}'::jsonb
    );
    RAISE EXCEPTION 'POINT-12 direct INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.vnext_catalogs
    SET title = 'Illegal update'
    WHERE id = '10000000-0000-4000-8000-000000000010'::uuid;
    RAISE EXCEPTION 'POINT-12 direct UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.vnext_catalogs
    WHERE id = '10000000-0000-4000-8000-000000000010'::uuid;
    RAISE EXCEPTION 'POINT-12 direct DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

-- POINT 13: history is engine-immutable even to the database owner.
DO $$
BEGIN
  BEGIN
    UPDATE public.vnext_catalog_revisions
    SET title = 'illegal'
    WHERE catalog_id = '10000000-0000-4000-8000-000000000010'::uuid
      AND revision = 1;
    RAISE EXCEPTION 'POINT-13 privileged revision UPDATE succeeded';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM NOT LIKE '%VNEXT_REVISION_IMMUTABLE%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM public.vnext_catalog_revisions
    WHERE catalog_id = '10000000-0000-4000-8000-000000000010'::uuid
      AND revision = 1;
    RAISE EXCEPTION 'POINT-13 privileged revision DELETE succeeded';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM NOT LIKE '%VNEXT_REVISION_IMMUTABLE%' THEN RAISE; END IF;
  END;
END;
$$;

-- POINT 14: history-insert failure rolls back current-row work atomically.
CREATE FUNCTION public.w3b_rehearsal_fail_history_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.catalog_id = '10000000-0000-4000-8000-000000000050'::uuid THEN
    RAISE EXCEPTION 'W3B_REHEARSAL_HISTORY_FAILURE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER w3b_rehearsal_fail_history_insert
BEFORE INSERT ON public.vnext_catalog_revisions
FOR EACH ROW EXECUTE FUNCTION public.w3b_rehearsal_fail_history_insert();

SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.create_vnext_catalog_v1(
      'a0000000-0000-4000-8000-000000000050',
      '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000050","title":"Rollback proof","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb,
      NULL
    );
    RAISE EXCEPTION 'POINT-14 injected history failure did not fire';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%W3B_REHEARSAL_HISTORY_FAILURE%' THEN RAISE; END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.vnext_catalogs
    WHERE id = '10000000-0000-4000-8000-000000000050'::uuid
  ) THEN
    RAISE EXCEPTION 'POINT-14 current row survived history failure';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.vnext_catalog_revisions
    WHERE catalog_id = '10000000-0000-4000-8000-000000000050'::uuid
  ) THEN
    RAISE EXCEPTION 'POINT-14 orphan history survived failed create';
  END IF;
END;
$$;
RESET ROLE;

DROP TRIGGER w3b_rehearsal_fail_history_insert ON public.vnext_catalog_revisions;
DROP FUNCTION public.w3b_rehearsal_fail_history_insert();

-- POINTS 15-18: archive lifecycle semantics.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
DECLARE
  v_catalog CONSTANT TEXT := '10000000-0000-4000-8000-000000000010';
  v_mutation CONSTANT TEXT := 'a0000000-0000-4000-8000-000000000060';
  v_before JSONB;
  v_result JSONB;
BEGIN
  SELECT document_snapshot INTO v_before
  FROM public.vnext_catalogs
  WHERE id = v_catalog::uuid;

  v_result := public.archive_vnext_catalog_cas_v1(v_catalog, 2, v_mutation);
  IF (v_result->>'remoteRevision')::int <> 3
    OR v_result->>'lastMutationId' <> v_mutation
    OR v_result->>'archivedAt' IS NULL
  THEN
    RAISE EXCEPTION 'POINT-15 archive mismatch: %', v_result;
  END IF;

  IF (SELECT document_snapshot FROM public.vnext_catalogs WHERE id = v_catalog::uuid)
    IS DISTINCT FROM v_before
  THEN
    RAISE EXCEPTION 'POINT-15 archive mutated authored snapshot';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vnext_catalog_revisions
    WHERE catalog_id = v_catalog::uuid
      AND revision = 3
      AND operation = 'archive'
      AND document_snapshot = v_before
  ) THEN
    RAISE EXCEPTION 'POINT-15 archive history missing';
  END IF;

  v_result := public.archive_vnext_catalog_cas_v1(v_catalog, 2, v_mutation);
  IF (v_result->>'remoteRevision')::int <> 3 THEN
    RAISE EXCEPTION 'POINT-16 archive replay advanced revision';
  END IF;

  BEGIN
    PERFORM public.archive_vnext_catalog_cas_v1(
      v_catalog,
      2,
      'a0000000-0000-4000-8000-000000000061'
    );
    RAISE EXCEPTION 'POINT-17 already archived succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%VNEXT_ARCHIVED%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.save_vnext_catalog_cas_v1(
      v_catalog,
      3,
      'a0000000-0000-4000-8000-000000000062',
      v_before
    );
    RAISE EXCEPTION 'POINT-18 save after archive succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%VNEXT_ARCHIVED%' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

-- Prepare an active revision-2 catalog for replay-operation and stale-archive proofs.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT public.create_vnext_catalog_v1(
  'a0000000-0000-4000-8000-000000000090',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000090","title":"Stale Archive","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb,
  NULL
);
SELECT public.save_vnext_catalog_cas_v1(
  '10000000-0000-4000-8000-000000000090',
  1,
  'a0000000-0000-4000-8000-000000000091',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000090","title":"Stale Archive r2","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb
);
RESET ROLE;

-- POINT 19: same mutation id reused with changed operation fails closed.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.archive_vnext_catalog_cas_v1(
      '10000000-0000-4000-8000-000000000090',
      2,
      'a0000000-0000-4000-8000-000000000091'
    );
    RAISE EXCEPTION 'POINT-19 changed operation mutation reuse succeeded';
  EXCEPTION WHEN serialization_failure THEN
    IF SQLERRM NOT LIKE '%VNEXT_MUTATION_REUSE%' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;


-- POINT 20: stale archive conflicts and consumes no revision.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.archive_vnext_catalog_cas_v1(
      '10000000-0000-4000-8000-000000000090',
      1,
      'a0000000-0000-4000-8000-000000000092'
    );
    RAISE EXCEPTION 'POINT-20 stale archive succeeded';
  EXCEPTION WHEN serialization_failure THEN
    IF SQLERRM NOT LIKE '%VNEXT_CONFLICT%' THEN RAISE; END IF;
  END;

  IF (SELECT remote_revision FROM public.vnext_catalogs
      WHERE id = '10000000-0000-4000-8000-000000000090'::uuid) <> 2
    OR (SELECT count(*) FROM public.vnext_catalog_revisions
        WHERE catalog_id = '10000000-0000-4000-8000-000000000090'::uuid) <> 2
  THEN
    RAISE EXCEPTION 'POINT-20 stale archive consumed revision/history';
  END IF;
END;
$$;
RESET ROLE;

-- POINT 21: RLS, function grants, owner and lightweight list shape.
DO $$
DECLARE
  v_owner TEXT;
BEGIN
  IF has_function_privilege('anon', 'public.list_vnext_catalogs_v1(boolean)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.get_vnext_catalog_v1(text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.create_vnext_catalog_v1(text,jsonb,jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.save_vnext_catalog_cas_v1(text,bigint,text,jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.archive_vnext_catalog_cas_v1(text,bigint,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'POINT-21 anon can execute a VNext RPC';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.list_vnext_catalogs_v1(boolean)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.get_vnext_catalog_v1(text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.create_vnext_catalog_v1(text,jsonb,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.save_vnext_catalog_cas_v1(text,bigint,text,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.archive_vnext_catalog_cas_v1(text,bigint,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'POINT-21 authenticated RPC grant missing';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vnext_catalogs'::regclass)
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vnext_catalog_revisions'::regclass)
  THEN
    RAISE EXCEPTION 'POINT-21 RLS is not enabled';
  END IF;

  SELECT pg_get_userbyid(proowner) INTO v_owner
  FROM pg_proc
  WHERE oid = 'public.save_vnext_catalog_cas_v1(text,bigint,text,jsonb)'::regprocedure;
  IF v_owner IS DISTINCT FROM current_user THEN
    RAISE EXCEPTION 'POINT-21 unexpected SECURITY DEFINER owner: %', v_owner;
  END IF;
END;
$$;

SET ROLE anon;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.vnext_catalogs', 'SELECT')
    OR has_table_privilege('anon', 'public.vnext_catalog_revisions', 'SELECT')
  THEN
    RAISE EXCEPTION 'POINT-21 anon has direct metadata/history SELECT';
  END IF;
END;
$$;
RESET ROLE;

SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$
DECLARE
  v_list JSONB := public.list_vnext_catalogs_v1(false);
  v_item JSONB;
BEGIN
  SELECT value INTO v_item FROM jsonb_array_elements(v_list) LIMIT 1;
  IF v_item ? 'documentSnapshot' OR v_item ? 'lastMutationId' THEN
    RAISE EXCEPTION 'POINT-21 list leaked heavy/exact mutation state';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_list) item
    WHERE item->>'archivedAt' IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'POINT-21 default list includes archived catalog';
  END IF;
END;
$$;
RESET ROLE;

-- Concurrency fixtures, each at revision 1.
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT public.create_vnext_catalog_v1(
  'a0000000-0000-4000-8000-000000000070',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000070","title":"Concurrent Save","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb,
  NULL
);
SELECT public.create_vnext_catalog_v1(
  'a0000000-0000-4000-8000-000000000080',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000080","title":"Save Archive Race","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb,
  NULL
);
RESET ROLE;

DO $$
BEGIN
  RAISE NOTICE '[W3.B REHEARSAL] sequential/security/failure-injection points passed';
END;
$$;
