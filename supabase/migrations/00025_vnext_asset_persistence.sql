-- ============================================================================
-- Migration 00025: VNext Asset Persistence Bridge (W3.G)
-- Creates public.vnext_assets, establishes immutable storage policies for
-- the vnext/ prefix in bucket 'product-assets', and provides transactional
-- idempotent RPCs for asset finalization and retrieval.
-- ============================================================================
BEGIN;

-- 1. Tabela public.vnext_assets (Metadados Imutáveis de Ativos VNext)
CREATE TABLE public.vnext_assets (
  id UUID NOT NULL,
  version TEXT NOT NULL CHECK (version = '1'),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  width_px INTEGER NOT NULL CHECK (width_px > 0),
  height_px INTEGER NOT NULL CHECK (height_px > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND name !~ '[\x00-\x1F\x7F]'),
  alt TEXT NOT NULL CHECK (length(trim(alt)) > 0 AND alt !~ '[\x00-\x1F\x7F]'),
  storage_bucket TEXT NOT NULL DEFAULT 'product-assets' CHECK (storage_bucket = 'product-assets'),
  storage_path TEXT NOT NULL CHECK (storage_path ~ '^vnext/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/1\.(png|jpeg|webp)$'),
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE INDEX idx_vnext_assets_id ON public.vnext_assets (id);
CREATE INDEX idx_vnext_assets_sha256 ON public.vnext_assets (sha256);

-- 2. RLS em public.vnext_assets
ALTER TABLE public.vnext_assets ENABLE ROW LEVEL SECURITY;

-- Leitura: permitida a qualquer membro autenticado com role corporativa ativa
CREATE POLICY "vnext_assets_select_active_team" ON public.vnext_assets
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND public.team_role() IS NOT NULL);

-- Inserção: permitida apenas para editor ou admin
CREATE POLICY "vnext_assets_insert_editor" ON public.vnext_assets
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.team_role() IN ('editor', 'admin')
  );

-- Revoga explicitamente UPDATE e DELETE para garantir imutabilidade estrita
REVOKE UPDATE, DELETE ON public.vnext_assets FROM PUBLIC, anon, authenticated;

-- 3. Políticas de Armazenamento no Bucket 'product-assets' (storage.objects)
-- Redefine a política legacy para excluir o prefixo reservado vnext/ de alterações/exclusões
DROP POLICY IF EXISTS "storage_product_assets_admin_write" ON storage.objects;
CREATE POLICY "storage_product_assets_admin_write" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'product-assets'
    AND (name NOT LIKE 'vnext/%')
    AND public.team_role() = 'admin'
  )
  WITH CHECK (
    bucket_id = 'product-assets'
    AND (name NOT LIKE 'vnext/%')
    AND public.team_role() = 'admin'
  );

-- Inserção de ativos VNext: permitida para editor e admin sob o prefixo vnext/
DROP POLICY IF EXISTS "storage_vnext_assets_editor_insert" ON storage.objects;
CREATE POLICY "storage_vnext_assets_editor_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-assets'
    AND name LIKE 'vnext/%'
    AND auth.uid() IS NOT NULL
    AND public.team_role() IN ('editor', 'admin')
  );

-- 4. RPC: finalize_vnext_asset_v1
CREATE OR REPLACE FUNCTION public.finalize_vnext_asset_v1(
  p_asset_id TEXT,
  p_version TEXT,
  p_sha256 TEXT,
  p_mime TEXT,
  p_width_px INTEGER,
  p_height_px INTEGER,
  p_name TEXT,
  p_alt TEXT,
  p_file_size BIGINT,
  p_storage_path TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID;
  v_asset_uuid UUID;
  v_existing public.vnext_assets%ROWTYPE;
  v_expected_path TEXT;
BEGIN
  -- 1. Autorização: requer role editor ou admin
  v_actor := public.require_document_editor_v1();

  -- 2. Validação da identidade do ativo (UUID canônico minúsculo)
  v_asset_uuid := public.vnext_require_canonical_uuid_text_v1(p_asset_id, 'assetId');

  -- 3. Validação de versão (W3.G aceita estritamente versão '1')
  IF p_version IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'VNEXT_INVALID_ASSET: version must be exactly "1"' USING ERRCODE = '22023';
  END IF;

  -- 4. Validação de hash SHA-256 (64 hexadecimais minúsculos)
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'VNEXT_INVALID_ASSET: sha256 must be exactly 64 lowercase hexadecimal characters' USING ERRCODE = '22023';
  END IF;

  -- 5. Validação de MIME type (apenas subset de imagens canônicas)
  IF p_mime IS NULL OR p_mime NOT IN ('image/png', 'image/jpeg', 'image/webp') THEN
    RAISE EXCEPTION 'VNEXT_INVALID_ASSET: unsupported mime type %', p_mime USING ERRCODE = '22023';
  END IF;

  -- 6. Validação de dimensões
  IF p_width_px IS NULL OR p_width_px <= 0 THEN
    RAISE EXCEPTION 'VNEXT_INVALID_ASSET: width_px must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_height_px IS NULL OR p_height_px <= 0 THEN
    RAISE EXCEPTION 'VNEXT_INVALID_ASSET: height_px must be positive' USING ERRCODE = '22023';
  END IF;

  -- 7. Validação de nome, alt e tamanho (alinhado a AssetRefSchema clean: sem caracteres de controle < 32 ou 127)
  IF p_name IS NULL OR length(trim(p_name)) = 0 OR p_name ~ '[\x00-\x1F\x7F]' THEN
    RAISE EXCEPTION 'VNEXT_INVALID_ASSET: name must be non-empty and free of control characters' USING ERRCODE = '22023';
  END IF;
  IF p_alt IS NULL OR length(trim(p_alt)) = 0 OR p_alt ~ '[\x00-\x1F\x7F]' THEN
    RAISE EXCEPTION 'VNEXT_INVALID_ASSET: alt must be non-empty and free of control characters' USING ERRCODE = '22023';
  END IF;
  IF p_file_size IS NULL OR p_file_size <= 0 THEN
    RAISE EXCEPTION 'VNEXT_INVALID_ASSET: file_size must be positive' USING ERRCODE = '22023';
  END IF;

  -- 8. Validação estrita do caminho de armazenamento (congelado: image/jpeg -> jpeg)
  v_expected_path := 'vnext/' || p_asset_id || '/1.' || CASE
    WHEN p_mime = 'image/png' THEN 'png'
    WHEN p_mime = 'image/webp' THEN 'webp'
    WHEN p_mime = 'image/jpeg' THEN 'jpeg'
    ELSE ''
  END;

  IF p_storage_path IS DISTINCT FROM v_expected_path THEN
    RAISE EXCEPTION 'VNEXT_INVALID_STORAGE_PATH: storage_path must match exact canonical asset path %', v_expected_path
      USING ERRCODE = '22023';
  END IF;

  -- 9. Confirmação da existência do objeto durável no Storage
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'product-assets'
        AND name = p_storage_path
    ) THEN
      RAISE EXCEPTION 'VNEXT_STORAGE_OBJECT_NOT_FOUND: storage object does not exist at %', p_storage_path
        USING ERRCODE = '40400';
    END IF;
  END IF;

  -- 10. Lock transacional para evitar corrida na mesma tupla (id, version)
  PERFORM pg_advisory_xact_lock(hashtextextended(p_asset_id || ':1', 0));

  -- 11. Verificação de idempotência / conflito
  SELECT * INTO v_existing
  FROM public.vnext_assets
  WHERE id = v_asset_uuid AND version = '1';

  IF FOUND THEN
    IF v_existing.sha256 <> p_sha256
       OR v_existing.mime <> p_mime
       OR v_existing.width_px <> p_width_px
       OR v_existing.height_px <> p_height_px
       OR v_existing.storage_path <> p_storage_path
       OR v_existing.name <> trim(p_name)
       OR v_existing.alt <> trim(p_alt)
       OR v_existing.file_size <> p_file_size
    THEN
      RAISE EXCEPTION 'VNEXT_CONFLICT: asset version already exists with divergent metadata'
        USING ERRCODE = '40001';
    END IF;

    RETURN jsonb_build_object(
      'id', p_asset_id,
      'version', v_existing.version,
      'sha256', v_existing.sha256,
      'mime', v_existing.mime,
      'widthPx', v_existing.width_px,
      'heightPx', v_existing.height_px,
      'name', v_existing.name,
      'alt', v_existing.alt
    );
  END IF;

  -- 12. Inserção do novo ativo imutável
  INSERT INTO public.vnext_assets (
    id, version, sha256, mime, width_px, height_px,
    name, alt, storage_bucket, storage_path, file_size,
    created_by
  ) VALUES (
    v_asset_uuid, '1', p_sha256, p_mime, p_width_px, p_height_px,
    trim(p_name), trim(p_alt), 'product-assets', p_storage_path, p_file_size,
    v_actor
  );

  -- 13. Retorno do AssetRef canônico validado
  RETURN jsonb_build_object(
    'id', p_asset_id,
    'version', '1',
    'sha256', p_sha256,
    'mime', p_mime,
    'widthPx', p_width_px,
    'heightPx', p_height_px,
    'name', trim(p_name),
    'alt', trim(p_alt)
  );
END;
$$;

-- 5. RPC: get_vnext_asset_v1
CREATE OR REPLACE FUNCTION public.get_vnext_asset_v1(
  p_asset_id TEXT,
  p_version TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID;
  v_asset_uuid UUID;
  v_asset public.vnext_assets%ROWTYPE;
BEGIN
  -- Leitura autorizada para qualquer membro corporativo ativo
  v_actor := public.vnext_require_reader_v1();
  v_asset_uuid := public.vnext_require_canonical_uuid_text_v1(p_asset_id, 'assetId');

  IF p_version IS NOT NULL AND length(trim(p_version)) > 0 THEN
    SELECT * INTO v_asset
    FROM public.vnext_assets
    WHERE id = v_asset_uuid AND version = p_version;
  ELSE
    SELECT * INTO v_asset
    FROM public.vnext_assets
    WHERE id = v_asset_uuid
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', p_asset_id,
    'version', v_asset.version,
    'sha256', v_asset.sha256,
    'mime', v_asset.mime,
    'widthPx', v_asset.width_px,
    'heightPx', v_asset.height_px,
    'name', v_asset.name,
    'alt', coalesce(v_asset.alt, ''),
    'storageBucket', v_asset.storage_bucket,
    'storagePath', v_asset.storage_path,
    'fileSize', v_asset.file_size,
    'createdAt', v_asset.created_at
  );
END;
$$;

COMMIT;
