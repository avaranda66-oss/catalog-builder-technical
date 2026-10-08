-- Execute only on a disposable database with 00026 applied, as its owner.
-- A migration dry run can concatenate 00026 without BEGIN/COMMIT into this
-- transaction. Every fixture and storage metadata mutation is rolled back.
-- This verifies PostgreSQL RLS; it does not create files through Storage API.
BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'f0260000-0000-4000-8000-%')
    OR EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE 'father-ready-00026/%') THEN
    RAISE EXCEPTION '00026 fixture collision: use a clean disposable database';
  END IF;
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
('f0260000-0000-4000-8000-000000000001', 'admin-00026@presys.invalid', '{}'),
('f0260000-0000-4000-8000-000000000002', 'editor-00026@presys.invalid', '{}'),
('f0260000-0000-4000-8000-000000000003', 'viewer-00026@presys.invalid', '{}'),
('f0260000-0000-4000-8000-000000000004', 'inactive-00026@presys.invalid', '{}');

INSERT INTO public.profiles (id, full_name, role, is_active) VALUES
('f0260000-0000-4000-8000-000000000001', 'Fixture admin', 'admin', true),
('f0260000-0000-4000-8000-000000000002', 'Fixture editor', 'editor', true),
('f0260000-0000-4000-8000-000000000003', 'Fixture viewer', 'viewer', true),
('f0260000-0000-4000-8000-000000000004', 'Fixture inactive', 'editor', false)
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active;

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects (id, bucket_id, name, metadata)
VALUES ('f0260000-0000-4000-8000-000000000010', 'product-images',
        'father-ready-00026/baseline.png', '{"proof":"baseline"}');

CREATE FUNCTION pg_temp.assert_product_image_writes(p_case text, p_allowed boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_inserted boolean := false; v_updated integer; v_deleted integer;
BEGIN
  BEGIN
    INSERT INTO storage.objects (id, bucket_id, name, metadata)
    VALUES (gen_random_uuid(), 'product-images', 'father-ready-00026/' || p_case || '.png', '{}');
    v_inserted := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF v_inserted IS DISTINCT FROM p_allowed THEN
    RAISE EXCEPTION '00026 % INSERT authority mismatch', p_case;
  END IF;
  UPDATE storage.objects SET metadata = jsonb_build_object('proof', p_case)
  WHERE bucket_id = 'product-images' AND name = 'father-ready-00026/baseline.png';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF (p_allowed AND v_updated <> 1) OR (NOT p_allowed AND v_updated <> 0) THEN
    RAISE EXCEPTION '00026 % UPDATE authority mismatch: % rows', p_case, v_updated;
  END IF;
  -- Product-images had no permissive DELETE policy in the live snapshot.
  -- Closing anonymous writes must not accidentally expand delete authority.
  DELETE FROM storage.objects
  WHERE bucket_id = 'product-images' AND name = 'father-ready-00026/baseline.png';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 0 THEN
    RAISE EXCEPTION '00026 % DELETE authority expanded: % rows', p_case, v_deleted;
  END IF;
END $$;

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{}';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name = 'father-ready-00026/baseline.png') THEN
    RAISE EXCEPTION '00026 existing public image read was broken';
  END IF;
END $$;
SELECT pg_temp.assert_product_image_writes('anonymous', false);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated"}';
SELECT pg_temp.assert_product_image_writes('expired-no-subject', false);
SET LOCAL request.jwt.claims = '{"sub":"f0260000-0000-4000-8000-000000000003","role":"authenticated"}';
SELECT pg_temp.assert_product_image_writes('viewer', false);
SET LOCAL request.jwt.claims = '{"sub":"f0260000-0000-4000-8000-000000000004","role":"authenticated"}';
SELECT pg_temp.assert_product_image_writes('inactive-editor', false);
SET LOCAL request.jwt.claims = '{"sub":"f0260000-0000-4000-8000-000000000005","role":"authenticated"}';
SELECT pg_temp.assert_product_image_writes('missing-profile', false);
SET LOCAL request.jwt.claims = '{"sub":"f0260000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT pg_temp.assert_product_image_writes('active-editor', true);
SET LOCAL request.jwt.claims = '{"sub":"f0260000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT pg_temp.assert_product_image_writes('active-admin', true);
RESET ROLE;

DO $$ BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE name LIKE 'father-ready-00026/%') <> 3 THEN
    RAISE EXCEPTION '00026 unauthorized insert changed storage metadata';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name = 'father-ready-00026/baseline.png'
                 AND metadata->>'proof' = 'active-admin') THEN
    RAISE EXCEPTION '00026 authorized update was not retained';
  END IF;
END $$;
SELECT '00026 product-images read and write authority: 7 identities passed' AS result;
ROLLBACK;
