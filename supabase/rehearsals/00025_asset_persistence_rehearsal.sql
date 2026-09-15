-- ==============================================================================
-- 00025_asset_persistence_rehearsal.sql
-- Rehearsal Transacional de Segurança e Imutabilidade do W3.G
-- Executável em PostgreSQL / Supabase (BEGIN -> ROLLBACK)
-- Cobre os 13 pontos obrigatórios do contrato de segurança e persistência
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- SETUP: Usuários e Perfis de Teste (Admin, Editor, Viewer)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_admin UUID := '90000000-0000-4000-8000-0000000000a1';
  v_editor UUID := '90000000-0000-4000-8000-0000000000e1';
  v_viewer UUID := '90000000-0000-4000-8000-0000000000f1';
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    VALUES
      (v_admin, 'admin-asset@presys.invalid', '{"full_name":"Admin Asset"}', '{"role":"authenticated"}'),
      (v_editor, 'editor-asset@presys.invalid', '{"full_name":"Editor Asset"}', '{"role":"authenticated"}'),
      (v_viewer, 'viewer-asset@presys.invalid', '{"full_name":"Viewer Asset"}', '{"role":"authenticated"}')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, full_name, role, is_active)
  VALUES
    (v_admin, 'Admin Asset', 'admin', true),
    (v_editor, 'Editor Asset', 'editor', true),
    (v_viewer, 'Viewer Asset', 'viewer', true)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role, is_active = true;

  -- Setup de bucket e objetos simulados em storage.objects se a tabela existir
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('product-assets', 'product-assets', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    -- Objeto de teste para o editor
    INSERT INTO storage.objects (id, bucket_id, name, owner)
    VALUES (
      '00000000-0000-4000-8000-000000000001'::uuid,
      'product-assets',
      'vnext/a0000000-0000-4000-8000-000000000001/1.png',
      v_editor
    ) ON CONFLICT (bucket_id, name) DO NOTHING;

    -- Objeto de teste para o admin
    INSERT INTO storage.objects (id, bucket_id, name, owner)
    VALUES (
      '00000000-0000-4000-8000-000000000002'::uuid,
      'product-assets',
      'vnext/a0000000-0000-4000-8000-000000000002/1.png',
      v_admin
    ) ON CONFLICT (bucket_id, name) DO NOTHING;

    -- Objeto de teste legado fora de vnext/
    INSERT INTO storage.objects (id, bucket_id, name, owner)
    VALUES (
      '00000000-0000-4000-8000-000000000003'::uuid,
      'product-assets',
      'legacy/sensor_photo.png',
      v_admin
    ) ON CONFLICT (bucket_id, name) DO NOTHING;
  END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- POINT 01: Sessão anônima / sem autenticação é rejeitada (fail-closed)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{}';
DO $$
DECLARE
  v_failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM public.finalize_vnext_asset_v1(
      'a0000000-0000-4000-8000-000000000001',
      '1',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'image/png',
      800,
      600,
      'anon.png',
      'Anon alt',
      1024,
      'vnext/a0000000-0000-4000-8000-000000000001/1.png'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'POINT-01-FAIL: anonymous finalization must be rejected with insufficient_privilege';
  END IF;
END;
$$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- POINT 02: Visualizador (viewer) tem mutação rejeitada
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-0000000000f1","role":"authenticated"}';
DO $$
DECLARE
  v_failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM public.finalize_vnext_asset_v1(
      'a0000000-0000-4000-8000-000000000001',
      '1',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'image/png',
      800,
      600,
      'viewer.png',
      'Viewer alt',
      1024,
      'vnext/a0000000-0000-4000-8000-000000000001/1.png'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'POINT-02-FAIL: viewer finalization must be rejected with insufficient_privilege';
  END IF;
END;
$$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- POINT 03: Visualizador tem permissão de leitura conforme o contrato
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-0000000000f1","role":"authenticated"}';
DO $$
DECLARE
  v_res JSONB;
BEGIN
  -- Leitura de asset inexistente retorna NULL de forma autorizada
  v_res := public.get_vnext_asset_v1('a0000000-0000-4000-8000-000000000001', '1');
  IF v_res IS NOT NULL THEN
    RAISE EXCEPTION 'POINT-03-FAIL: unfinalized asset should return null';
  END IF;
END;
$$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- POINT 04: Editor autorizado pode finalizar asset durável
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-0000000000e1","role":"authenticated"}';
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.finalize_vnext_asset_v1(
    'a0000000-0000-4000-8000-000000000001',
    '1',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'image/png',
    800,
    600,
    'sensor.png',
    'Sensor alt',
    1024,
    'vnext/a0000000-0000-4000-8000-000000000001/1.png'
  );

  IF v_res->>'id' <> 'a0000000-0000-4000-8000-000000000001' OR v_res->>'version' <> '1' THEN
    RAISE EXCEPTION 'POINT-04-FAIL: editor finalization returned unexpected asset ref %', v_res;
  END IF;
END;
$$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- POINT 05: Admin autorizado pode finalizar asset durável
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.finalize_vnext_asset_v1(
    'a0000000-0000-4000-8000-000000000002',
    '1',
    'a3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'image/png',
    1024,
    768,
    'admin_sensor.png',
    'Admin sensor alt',
    2048,
    'vnext/a0000000-0000-4000-8000-000000000002/1.png'
  );

  IF v_res->>'id' <> 'a0000000-0000-4000-8000-000000000002' THEN
    RAISE EXCEPTION 'POINT-05-FAIL: admin finalization returned unexpected asset ref %', v_res;
  END IF;
END;
$$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- POINT 06: Finalização com caminho arbitrário é estritamente rejeitada
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-0000000000e1","role":"authenticated"}';
DO $$
DECLARE
  v_failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM public.finalize_vnext_asset_v1(
      'a0000000-0000-4000-8000-000000000001',
      '1',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'image/png',
      800,
      600,
      'sensor.png',
      'Sensor alt',
      1024,
      'vnext/arbitrary-path/escape.png'
    );
  EXCEPTION WHEN sqlstate '22023' THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'POINT-06-FAIL: arbitrary storage path must be rejected';
  END IF;

  -- Sub-check: .jpg is rejected for image/jpeg (only canonical .jpeg is allowed)
  v_failed := false;
  BEGIN
    PERFORM public.finalize_vnext_asset_v1(
      'a0000000-0000-4000-8000-000000000001',
      '1',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'image/jpeg',
      800,
      600,
      'sensor.jpeg',
      'Sensor alt',
      1024,
      'vnext/a0000000-0000-4000-8000-000000000001/1.jpg'
    );
  EXCEPTION WHEN sqlstate '22023' THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'POINT-06-FAIL: .jpg storage path must be rejected in favor of canonical .jpeg';
  END IF;

  -- Sub-check: control characters in name are rejected before insert
  v_failed := false;
  BEGIN
    PERFORM public.finalize_vnext_asset_v1(
      'a0000000-0000-4000-8000-000000000001',
      '1',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'image/png',
      800,
      600,
      'sensor' || chr(10) || '.png',
      'Sensor alt',
      1024,
      'vnext/a0000000-0000-4000-8000-000000000001/1.png'
    );
  EXCEPTION WHEN sqlstate '22023' THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'POINT-06-FAIL: control characters in name must be rejected';
  END IF;

  -- Sub-check: control characters in alt are rejected before insert
  v_failed := false;
  BEGIN
    PERFORM public.finalize_vnext_asset_v1(
      'a0000000-0000-4000-8000-000000000001',
      '1',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'image/png',
      800,
      600,
      'sensor.png',
      'Sensor' || chr(127) || 'alt',
      1024,
      'vnext/a0000000-0000-4000-8000-000000000001/1.png'
    );
  EXCEPTION WHEN sqlstate '22023' THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'POINT-06-FAIL: control characters in alt must be rejected';
  END IF;
END;
$$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- POINT 07: UPDATE direto em public.vnext_assets é rejeitado
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
DO $$
DECLARE
  v_failed BOOLEAN := false;
BEGIN
  BEGIN
    UPDATE public.vnext_assets
    SET name = 'hacked.png'
    WHERE id = 'a0000000-0000-4000-8000-000000000001'::uuid;
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'POINT-07-FAIL: direct UPDATE on vnext_assets must be rejected';
  END IF;
END;
$$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- POINT 08: DELETE direto em public.vnext_assets é rejeitado
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
DO $$
DECLARE
  v_failed BOOLEAN := false;
BEGIN
  BEGIN
    DELETE FROM public.vnext_assets
    WHERE id = 'a0000000-0000-4000-8000-000000000001'::uuid;
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'POINT-08-FAIL: direct DELETE on vnext_assets must be rejected';
  END IF;
END;
$$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- POINT 09: UPDATE em storage.objects sob vnext/% é rejeitado
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    UPDATE storage.objects
    SET metadata = '{"corrupted":true}'::jsonb
    WHERE bucket_id = 'product-assets'
      AND name LIKE 'vnext/%';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN
      RAISE EXCEPTION 'POINT-09-FAIL: UPDATE on storage.objects under vnext/ must affect 0 rows';
    END IF;
  END IF;
END;
$$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- POINT 10: DELETE em storage.objects sob vnext/% é rejeitado
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
DO $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'product-assets'
      AND name LIKE 'vnext/%';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted > 0 THEN
      RAISE EXCEPTION 'POINT-10-FAIL: DELETE on storage.objects under vnext/ must affect 0 rows';
    END IF;
  END IF;
END;
$$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- POINT 11: Comportamento de storage legado fora de vnext/% continua permitido
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    UPDATE storage.objects
    SET metadata = '{"admin_managed":true}'::jsonb
    WHERE bucket_id = 'product-assets'
      AND name = 'legacy/sensor_photo.png';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'POINT-11-FAIL: legacy non-vnext admin update should be permitted';
    END IF;
  END IF;
END;
$$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- POINT 12: Replay idempotente exato com metadados idênticos sucede
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-0000000000e1","role":"authenticated"}';
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.finalize_vnext_asset_v1(
    'a0000000-0000-4000-8000-000000000001',
    '1',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'image/png',
    800,
    600,
    'sensor.png',
    'Sensor alt',
    1024,
    'vnext/a0000000-0000-4000-8000-000000000001/1.png'
  );

  IF v_res->>'id' <> 'a0000000-0000-4000-8000-000000000001' OR v_res->>'version' <> '1' THEN
    RAISE EXCEPTION 'POINT-12-FAIL: exact replay should return identical AssetRef';
  END IF;
END;
$$;
RESET ROLE;

-- ------------------------------------------------------------------------------
-- POINT 13: Replay divergente falha com VNEXT_CONFLICT e preserva primeira linha
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-0000000000e1","role":"authenticated"}';
DO $$
DECLARE
  v_failed BOOLEAN := false;
  v_check public.vnext_assets%ROWTYPE;
BEGIN
  BEGIN
    PERFORM public.finalize_vnext_asset_v1(
      'a0000000-0000-4000-8000-000000000001',
      '1',
      '9999999998fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', -- SHA divergente
      'image/png',
      800,
      600,
      'sensor.png',
      'Sensor alt',
      1024,
      'vnext/a0000000-0000-4000-8000-000000000001/1.png'
    );
  EXCEPTION WHEN sqlstate '40001' THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'POINT-13-FAIL: divergent replay must fail with VNEXT_CONFLICT (40001)';
  END IF;

  -- Verifica que a linha original permaneceu intacta
  SELECT * INTO v_check
  FROM public.vnext_assets
  WHERE id = 'a0000000-0000-4000-8000-000000000001'::uuid AND version = '1';

  IF v_check.sha256 <> 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' THEN
    RAISE EXCEPTION 'POINT-13-FAIL: first row was modified by divergent replay attempt';
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;
