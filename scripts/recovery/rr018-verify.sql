\set ON_ERROR_STOP on

SELECT set_config('rr018.fixture_sha', :'fixture_sha', false);

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'profiles','product_families','product_family_fields','products','catalogs',
    'catalog_products','catalog_versions','product_versions','product_workbooks',
    'product_source_documents','product_technical_data_index','product_dataset_search_index',
    'assets','product_assets','audit_log','library_change_events','asset_audit_logs'
  ];
BEGIN
  IF to_regclass('auth.users') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'RR018 critical Supabase schemas are absent';
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      RAISE EXCEPTION 'RR018 critical entity absent: public.%', v_table;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'profiles','product_families','product_family_fields','products','catalogs',
    'catalog_products','catalog_versions','product_versions','product_workbooks',
    'product_source_documents','product_technical_data_index','product_dataset_search_index',
    'assets','product_assets','audit_log','library_change_events','asset_audit_logs'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = 'public' AND r.relname = v_table AND c.contype = 'p'
    ) THEN
      RAISE EXCEPTION 'RR018 missing primary key: public.%', v_table;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'profiles','product_family_fields','products','catalog_products','catalog_versions','product_versions',
    'product_workbooks','product_source_documents','product_technical_data_index','product_dataset_search_index','assets','product_assets',
    'library_change_events','asset_audit_logs'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = 'public' AND r.relname = v_table AND c.contype = 'f'
    ) THEN
      RAISE EXCEPTION 'RR018 missing foreign key: public.%', v_table;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '98000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'RR018 synthetic auth reference missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '98000000-0000-4000-8000-000000000001' AND role = 'admin' AND is_active) THEN
    RAISE EXCEPTION 'RR018 profile/auth relation missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.product_families f ON f.id = p.family_id
    WHERE p.id = '98000000-0000-4000-8000-000000000030'
      AND f.id = '98000000-0000-4000-8000-000000000010'
  ) THEN
    RAISE EXCEPTION 'RR018 product-family relationship missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.product_family_fields
    WHERE id = '98000000-0000-4000-8000-000000000011'
      AND family_id = '98000000-0000-4000-8000-000000000010'
  ) THEN
    RAISE EXCEPTION 'RR018 family field missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_products
    WHERE catalog_id = '98000000-0000-4000-8000-000000000020'
      AND product_id = '98000000-0000-4000-8000-000000000030'
  ) THEN
    RAISE EXCEPTION 'RR018 catalog-product relationship missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_versions
    WHERE catalog_id = '98000000-0000-4000-8000-000000000020' AND version = 1
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_versions
    WHERE product_id = '98000000-0000-4000-8000-000000000030' AND version = 1
  ) THEN
    RAISE EXCEPTION 'RR018 version history missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.product_workbooks
    WHERE id = '98000000-0000-4000-8000-000000000050'
      AND owner_kind = 'product'
      AND owner_id = '98000000-0000-4000-8000-000000000030'
      AND revision = 1
      AND full_payload->>'schemaVersion' = '2'
      AND full_payload #>> '{data,rr018-datum,evidence,0,sourceDocumentId}' = 'rr018-source-001'
  ) THEN
    RAISE EXCEPTION 'RR018 workbook owner/payload/evidence missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.product_source_documents
    WHERE id = 'rr018-source-001'
      AND file_reference = 'storage://product-assets/rr018/recovery-fixture.png'
      AND checksum = current_setting('rr018.fixture_sha')
  ) THEN
    RAISE EXCEPTION 'RR018 source/evidence reference or checksum mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.product_technical_data_index
    WHERE workbook_id = '98000000-0000-4000-8000-000000000050'
      AND datum_id = 'rr018-datum' AND numeric_value = 0.05 AND unit = 'degC'
  ) THEN
    RAISE EXCEPTION 'RR018 technical projection missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.product_dataset_search_index
    WHERE workbook_id = '98000000-0000-4000-8000-000000000050'
      AND dataset_id = 'rr018-dataset' AND datum_id = 'rr018-datum'
      AND projected_numeric = 0.05 AND projected_unit = 'degC'
  ) THEN
    RAISE EXCEPTION 'RR018 dataset projection missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.library_change_events WHERE id = '98000000-0000-4000-8000-000000000060')
     OR NOT EXISTS (SELECT 1 FROM public.asset_audit_logs WHERE id = '98000000-0000-4000-8000-000000000042')
     OR NOT EXISTS (SELECT 1 FROM public.audit_log WHERE entity_id = '98000000-0000-4000-8000-000000000030') THEN
    RAISE EXCEPTION 'RR018 audit/change evidence missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.assets a
    JOIN public.product_assets pa ON pa.asset_id = a.id
    WHERE a.id = '98000000-0000-4000-8000-000000000040'
      AND a.storage_bucket = 'product-assets'
      AND a.storage_path = 'rr018/recovery-fixture.png'
      AND a.sha256 = current_setting('rr018.fixture_sha')
      AND pa.product_id = '98000000-0000-4000-8000-000000000030'
  ) THEN
    RAISE EXCEPTION 'RR018 DB asset/storage reference mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'product-assets' AND name = 'rr018/recovery-fixture.png'
  ) THEN
    RAISE EXCEPTION 'RR018 physical local Storage object metadata missing';
  END IF;
END $$;

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'profiles','product_families','product_family_fields','products','catalogs','catalog_products',
    'catalog_versions','product_versions','product_workbooks','product_source_documents',
    'product_technical_data_index','product_dataset_search_index','assets','product_assets',
    'audit_log','library_change_events','asset_audit_logs'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RR018 RLS disabled: public.%', v_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table
    ) THEN
      RAISE EXCEPTION 'RR018 policy missing: public.%', v_table;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.save_product_workbook_v2(jsonb,integer)') IS NULL
     OR to_regprocedure('public.get_product_workbook_v2(text,text)') IS NULL
     OR to_regprocedure('public.search_product_knowledge_v2(text,uuid,uuid,text,integer)') IS NULL
     OR to_regprocedure('public.save_catalog_v3(jsonb,integer,text)') IS NULL
     OR to_regprocedure('public.team_role()') IS NULL THEN
    RAISE EXCEPTION 'RR018 critical function missing';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.product_workbooks', 'SELECT')
     OR has_table_privilege('authenticated', 'public.product_workbooks', 'INSERT')
     OR NOT has_function_privilege('authenticated', 'public.save_product_workbook_v2(jsonb,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.save_product_workbook_v2(jsonb,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RR018 grant/function ACL invariant failed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_products_audit' AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_catalogs_audit' AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_field_definitions_audit' AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_product_delete_workbook' AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_family_delete_workbook' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'RR018 critical trigger missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'on_auth_user_created_catalog' AND n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'RR018 auth profile provisioning trigger missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_product_assets_read_active_team'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_product_assets_admin_write'
  ) THEN
    RAISE EXCEPTION 'RR018 Storage policies missing';
  END IF;
END $$;

SELECT '[RR018][VERIFY][OK] all critical recovery invariants passed' AS result;
