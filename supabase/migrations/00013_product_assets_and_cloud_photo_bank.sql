-- ============================================================================
-- MIGRATION 00013: PRODUCT ASSETS & CLOUD PHOTO BANK
-- Evolves public.assets in-place, creates public.product_assets (M:N),
-- sets up private Storage bucket with active-team RLS, and implements
-- transactional RPCs for upload finalization, relation management and audit.
-- ============================================================================

-- 1. LIMPEZA IDEMPOTENTE DE POLICIES ANTIGAS / PERMISSIVAS EM public.assets
DROP POLICY IF EXISTS "assets_read_policy" ON public.assets;
DROP POLICY IF EXISTS "assets_write_policy" ON public.assets;
DROP POLICY IF EXISTS "Allow authenticated read assets" ON public.assets;
DROP POLICY IF EXISTS "Allow admin write assets" ON public.assets;
DROP POLICY IF EXISTS "assets_select_active_team" ON public.assets;
DROP POLICY IF EXISTS "assets_admin_write" ON public.assets;

-- 2. EVOLUÇÃO IN-PLACE DE public.assets
ALTER TABLE public.assets 
  ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT 'product-assets',
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS width_px integer,
  ADD COLUMN IF NOT EXISTS height_px integer,
  ADD COLUMN IF NOT EXISTS sha256 text,
  ADD COLUMN IF NOT EXISTS kind text DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS parent_asset_id uuid REFERENCES public.assets(id),
  ADD COLUMN IF NOT EXISTS generation_provider text,
  ADD COLUMN IF NOT EXISTS generation_model text,
  ADD COLUMN IF NOT EXISTS generation_metadata jsonb,
  ADD COLUMN IF NOT EXISTS generation_prompt_version text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Adicionar CHECK constraints para enums em assets
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_assets_kind') THEN
    ALTER TABLE public.assets ADD CONSTRAINT chk_assets_kind 
      CHECK (kind IS NULL OR kind IN ('image', 'diagram', 'document', 'logo', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_assets_source_type') THEN
    ALTER TABLE public.assets ADD CONSTRAINT chk_assets_source_type 
      CHECK (source_type IS NULL OR source_type IN ('uploaded', 'imported', 'generated', 'legacy'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_assets_approval_status') THEN
    ALTER TABLE public.assets ADD CONSTRAINT chk_assets_approval_status 
      CHECK (approval_status IS NULL OR approval_status IN ('draft', 'approved', 'rejected', 'archived'));
  END IF;
END $$;

-- Backfill seguro de registros legados pré-existentes
UPDATE public.assets 
SET 
  source_type = 'legacy',
  kind = CASE 
    WHEN role = 'certificate' THEN 'document'
    WHEN role = 'diagram' THEN 'diagram'
    ELSE 'image'
  END
WHERE source_type IS NULL OR source_type = 'uploaded';

CREATE INDEX IF NOT EXISTS idx_assets_sha256 ON public.assets (sha256);
CREATE INDEX IF NOT EXISTS idx_assets_approval_status ON public.assets (approval_status);

-- 3. CRIAÇÃO DE public.product_assets (RELAÇÃO M:N)
CREATE TABLE IF NOT EXISTS public.product_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'hero' CHECK (role IN (
    'hero', 'front', 'rear', 'left', 'right', 'top', 'detail',
    'display', 'terminals', 'well', 'application', 'accessory',
    'diagram', 'datasheet', 'other'
  )),
  angle text DEFAULT 'unknown' CHECK (angle IN (
    'front', 'rear', 'left', 'right', 'three_quarter_front',
    'three_quarter_rear', 'top', 'detail', 'unknown'
  )),
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  is_official boolean NOT NULL DEFAULT false,
  caption text,
  alt_text text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_asset_role UNIQUE (product_id, asset_id, role)
);

-- Índice Único Parcial: Garante no máximo 1 primary por role/produto
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_assets_primary_role
  ON public.product_assets (product_id, role)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_product_assets_product_id ON public.product_assets (product_id);
CREATE INDEX IF NOT EXISTS idx_product_assets_asset_id ON public.product_assets (asset_id);

-- 4. MIGRAÇÃO DETERMINÍSTICA DE VÍNCULOS LEGADOS (WINDOW FUNCTION)
WITH ranked_legacy AS (
  SELECT 
    id AS legacy_asset_id,
    product_id,
    CASE 
      WHEN role = 'hero' THEN 'hero'
      WHEN role = 'gallery' THEN 'other'
      WHEN role = 'diagram' THEN 'diagram'
      WHEN role = 'certificate' THEN 'datasheet'
      WHEN role = 'variation' THEN 'other'
      ELSE 'other'
    END AS mapped_role,
    alt_text,
    COALESCE(sort_order, 0) AS sort_order,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY product_id, CASE 
        WHEN role = 'hero' THEN 'hero'
        WHEN role = 'gallery' THEN 'other'
        WHEN role = 'diagram' THEN 'diagram'
        WHEN role = 'certificate' THEN 'datasheet'
        WHEN role = 'variation' THEN 'other'
        ELSE 'other'
      END
      ORDER BY sort_order ASC, created_at ASC, id ASC
    ) AS rn
  FROM public.assets
  WHERE product_id IS NOT NULL
)
INSERT INTO public.product_assets (
  product_id, asset_id, role, alt_text, sort_order, is_primary, is_official, created_at
)
SELECT 
  product_id,
  legacy_asset_id,
  mapped_role,
  alt_text,
  sort_order,
  (rn = 1) AS is_primary,
  false AS is_official,
  created_at
FROM ranked_legacy
ON CONFLICT (product_id, asset_id, role) DO NOTHING;

-- 5. TABELA public.asset_audit_logs (APPEND-ONLY)
CREATE TABLE IF NOT EXISTS public.asset_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'ASSET_UPLOAD', 'ASSET_LINK_PRODUCT', 'ASSET_UNLINK_PRODUCT',
    'ASSET_SET_PRIMARY', 'ASSET_METADATA_UPDATE', 'ASSET_ARCHIVE'
  )),
  actor_id uuid REFERENCES public.profiles(id),
  actor_email text,
  actor_name text,
  summary text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. RLS EM ASSETS, PRODUCT_ASSETS E ASSET_AUDIT_LOGS
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assets_select_active_team" ON public.assets;
CREATE POLICY "assets_select_active_team" ON public.assets
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND public.team_role() IS NOT NULL);

DROP POLICY IF EXISTS "assets_admin_write" ON public.assets;
CREATE POLICY "assets_admin_write" ON public.assets
  FOR ALL TO authenticated
  USING (public.team_role() = 'admin')
  WITH CHECK (public.team_role() = 'admin');

DROP POLICY IF EXISTS "product_assets_select_active_team" ON public.product_assets;
CREATE POLICY "product_assets_select_active_team" ON public.product_assets
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND public.team_role() IS NOT NULL);

DROP POLICY IF EXISTS "product_assets_admin_write" ON public.product_assets;
CREATE POLICY "product_assets_admin_write" ON public.product_assets
  FOR ALL TO authenticated
  USING (public.team_role() = 'admin')
  WITH CHECK (public.team_role() = 'admin');

DROP POLICY IF EXISTS "asset_audit_select_active_team" ON public.asset_audit_logs;
CREATE POLICY "asset_audit_select_active_team" ON public.asset_audit_logs
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND public.team_role() IS NOT NULL);

REVOKE INSERT, UPDATE, DELETE ON public.asset_audit_logs FROM PUBLIC, anon, authenticated;

-- 7. CONFIGURAÇÃO DO BUCKET NO STORAGE & POLICIES EM storage.objects
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-assets', 
  'product-assets', 
  false, 
  52428800, 
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

DROP POLICY IF EXISTS "storage_product_assets_read_active_team" ON storage.objects;
CREATE POLICY "storage_product_assets_read_active_team" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'product-assets' AND auth.uid() IS NOT NULL AND public.team_role() IS NOT NULL);

DROP POLICY IF EXISTS "storage_product_assets_admin_write" ON storage.objects;
CREATE POLICY "storage_product_assets_admin_write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'product-assets' AND public.team_role() = 'admin')
  WITH CHECK (bucket_id = 'product-assets' AND public.team_role() = 'admin');

-- 8. REALTIME REPLICA IDENTITY IDEMPOTENTE
ALTER TABLE public.assets REPLICA IDENTITY FULL;
ALTER TABLE public.product_assets REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'assets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'product_assets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_assets;
  END IF;
END $$;

-- ============================================================================
-- 9. RPCS TRANSACIONAIS
-- ============================================================================

-- RPC: finalize_asset_upload_v1
CREATE OR REPLACE FUNCTION public.finalize_asset_upload_v1(
  p_asset_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_width integer DEFAULT NULL,
  p_height integer DEFAULT NULL,
  p_sha256 text DEFAULT NULL,
  p_kind text DEFAULT 'image',
  p_product_id uuid DEFAULT NULL,
  p_role text DEFAULT 'hero',
  p_is_primary boolean DEFAULT false,
  p_caption text DEFAULT NULL,
  p_angle text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
  v_existing public.assets%ROWTYPE;
  v_new_asset public.assets%ROWTYPE;
  v_new_product_asset public.product_assets%ROWTYPE;
  v_has_primary boolean := false;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required to upload assets' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  into v_actor_email, v_actor_name
  from auth.users where id = v_actor;

  -- Advisory lock de 64 bits para prevenir corrida no mesmo hash
  if p_sha256 is not null and p_sha256 <> '' then
    perform pg_advisory_xact_lock(hashtextextended(p_sha256, 0));

    select * into v_existing 
    from public.assets 
    where sha256 = p_sha256 and approval_status <> 'archived'
    limit 1;

    if found then
      return jsonb_build_object(
        'success', false,
        'code', 'DUPLICATE_ASSET',
        'message', 'Este arquivo já está cadastrado no banco corporativo.',
        'existing_asset_id', v_existing.id,
        'existing_filename', v_existing.original_filename
      );
    end if;
  end if;

  -- Inserir Asset Original
  insert into public.assets (
    id, storage_bucket, storage_path, original_filename, mime_type,
    file_size, width_px, height_px, sha256, kind, source_type,
    approval_status, created_by, updated_by
  ) values (
    p_asset_id, 'product-assets', p_storage_path, p_original_filename, p_mime_type,
    p_file_size, p_width, p_height, p_sha256, coalesce(p_kind, 'image'), 'uploaded',
    'approved', v_actor, v_actor
  ) returning * into v_new_asset;

  -- Se produto fornecido, vincular em product_assets
  if p_product_id is not null then
    if p_is_primary then
      -- Desmarcar primary anterior para o mesmo role/produto
      update public.product_assets 
      set is_primary = false 
      where product_id = p_product_id and role = p_role;
    else
      -- Se for o primeiro asset do produto para este role, pode ser primary por padrão
      select exists(
        select 1 from public.product_assets 
        where product_id = p_product_id and role = p_role and is_primary = true
      ) into v_has_primary;
    end if;

    insert into public.product_assets (
      product_id, asset_id, role, angle, sort_order,
      is_primary, is_official, caption, created_by
    ) values (
      p_product_id, p_asset_id, p_role, coalesce(p_angle, 'unknown'),
      (select coalesce(max(sort_order), -1) + 1 from public.product_assets where product_id = p_product_id),
      case when p_is_primary then true when not v_has_primary then true else false end,
      false, p_caption, v_actor
    ) returning * into v_new_product_asset;
  end if;

  -- Registrar Auditoria Append-Only
  insert into public.asset_audit_logs (
    asset_id, product_id, action, actor_id, actor_email, actor_name, summary, details
  ) values (
    p_asset_id, p_product_id, 'ASSET_UPLOAD', v_actor, v_actor_email, v_actor_name,
    'Upload de novo asset corporativo: ' || p_original_filename,
    jsonb_build_object(
      'filename', p_original_filename,
      'mime_type', p_mime_type,
      'file_size', p_file_size,
      'role', p_role,
      'is_primary', p_is_primary
    )
  );

  return jsonb_build_object(
    'success', true,
    'asset', to_jsonb(v_new_asset),
    'product_asset', case when p_product_id is not null then to_jsonb(v_new_product_asset) else null end
  );
end $$;

-- RPC: link_product_asset_v1
CREATE OR REPLACE FUNCTION public.link_product_asset_v1(
  p_product_id uuid,
  p_asset_id uuid,
  p_role text DEFAULT 'hero',
  p_is_primary boolean DEFAULT false,
  p_caption text DEFAULT NULL,
  p_angle text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
  v_product_asset public.product_assets%ROWTYPE;
  v_has_primary boolean := false;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required to link assets' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  into v_actor_email, v_actor_name
  from auth.users where id = v_actor;

  if p_is_primary then
    update public.product_assets 
    set is_primary = false 
    where product_id = p_product_id and role = p_role;
  else
    select exists(
      select 1 from public.product_assets 
      where product_id = p_product_id and role = p_role and is_primary = true
    ) into v_has_primary;
  end if;

  insert into public.product_assets (
    product_id, asset_id, role, angle, sort_order,
    is_primary, is_official, caption, created_by
  ) values (
    p_product_id, p_asset_id, p_role, coalesce(p_angle, 'unknown'),
    (select coalesce(max(sort_order), -1) + 1 from public.product_assets where product_id = p_product_id),
    case when p_is_primary then true when not v_has_primary then true else false end,
    false, p_caption, v_actor
  )
  on conflict (product_id, asset_id, role) do update set
    angle = coalesce(p_angle, public.product_assets.angle),
    caption = coalesce(p_caption, public.product_assets.caption),
    is_primary = case when p_is_primary then true else public.product_assets.is_primary end
  returning * into v_product_asset;

  insert into public.asset_audit_logs (
    asset_id, product_id, action, actor_id, actor_email, actor_name, summary, details
  ) values (
    p_asset_id, p_product_id, 'ASSET_LINK_PRODUCT', v_actor, v_actor_email, v_actor_name,
    'Vínculo de asset ao produto com role: ' || p_role,
    jsonb_build_object('role', p_role, 'is_primary', p_is_primary)
  );

  return jsonb_build_object('success', true, 'product_asset', to_jsonb(v_product_asset));
end $$;

-- RPC: unlink_product_asset_v1
CREATE OR REPLACE FUNCTION public.unlink_product_asset_v1(
  p_product_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
  v_record public.product_assets%ROWTYPE;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required to unlink assets' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  into v_actor_email, v_actor_name
  from auth.users where id = v_actor;

  select * into v_record from public.product_assets where id = p_product_asset_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Vínculo não encontrado');
  end if;

  delete from public.product_assets where id = p_product_asset_id;

  -- Se era primary, elege o próximo daquele role como primary
  if v_record.is_primary then
    update public.product_assets
    set is_primary = true
    where id = (
      select id from public.product_assets 
      where product_id = v_record.product_id and role = v_record.role 
      order by sort_order asc, created_at asc limit 1
    );
  end if;

  insert into public.asset_audit_logs (
    asset_id, product_id, action, actor_id, actor_email, actor_name, summary, details
  ) values (
    v_record.asset_id, v_record.product_id, 'ASSET_UNLINK_PRODUCT', v_actor, v_actor_email, v_actor_name,
    'Asset desvinculado do produto',
    jsonb_build_object('role', v_record.role, 'was_primary', v_record.is_primary)
  );

  return jsonb_build_object('success', true);
end $$;

-- RPC: set_primary_product_asset_v1
CREATE OR REPLACE FUNCTION public.set_primary_product_asset_v1(
  p_product_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
  v_target public.product_assets%ROWTYPE;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  into v_actor_email, v_actor_name
  from auth.users where id = v_actor;

  select * into v_target from public.product_assets where id = p_product_asset_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Vínculo não encontrado');
  end if;

  -- Desmarcar anteriores do mesmo produto e role
  update public.product_assets
  set is_primary = false
  where product_id = v_target.product_id and role = v_target.role and id <> p_product_asset_id;

  -- Marcar o alvo como primary
  update public.product_assets
  set is_primary = true
  where id = p_product_asset_id;

  insert into public.asset_audit_logs (
    asset_id, product_id, action, actor_id, actor_email, actor_name, summary, details
  ) values (
    v_target.asset_id, v_target.product_id, 'ASSET_SET_PRIMARY', v_actor, v_actor_email, v_actor_name,
    'Asset definido como Foto Principal para o role ' || v_target.role,
    jsonb_build_object('role', v_target.role)
  );

  return jsonb_build_object('success', true);
end $$;

-- RPC: update_product_asset_v1
CREATE OR REPLACE FUNCTION public.update_product_asset_v1(
  p_product_asset_id uuid,
  p_role text DEFAULT NULL,
  p_angle text DEFAULT NULL,
  p_caption text DEFAULT NULL,
  p_alt_text text DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_is_official boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
  v_target public.product_assets%ROWTYPE;
  v_new_role text;
  v_conflict boolean := false;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  into v_actor_email, v_actor_name
  from auth.users where id = v_actor;

  select * into v_target from public.product_assets where id = p_product_asset_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Vínculo não encontrado');
  end if;

  v_new_role := coalesce(p_role, v_target.role);

  -- Se alterando o role e esta relação é primary, checar se o novo role já possui primary
  if v_new_role <> v_target.role and v_target.is_primary then
    select exists(
      select 1 from public.product_assets 
      where product_id = v_target.product_id and role = v_new_role and is_primary = true and id <> p_product_asset_id
    ) into v_conflict;

    if v_conflict then
      return jsonb_build_object(
        'success', false,
        'code', 'PRIMARY_ROLE_CONFLICT',
        'message', 'O role de destino já possui uma foto principal. Remova a foto principal atual ou altere o status.'
      );
    end if;
  end if;

  update public.product_assets set
    role = v_new_role,
    angle = coalesce(p_angle, angle),
    caption = coalesce(p_caption, caption),
    alt_text = coalesce(p_alt_text, alt_text),
    sort_order = coalesce(p_sort_order, sort_order),
    is_official = coalesce(p_is_official, is_official)
  where id = p_product_asset_id;

  insert into public.asset_audit_logs (
    asset_id, product_id, action, actor_id, actor_email, actor_name, summary, details
  ) values (
    v_target.asset_id, v_target.product_id, 'ASSET_METADATA_UPDATE', v_actor, v_actor_email, v_actor_name,
    'Atualização de metadados do vínculo do produto',
    jsonb_build_object('new_role', v_new_role, 'caption', p_caption, 'angle', p_angle)
  );

  return jsonb_build_object('success', true);
end $$;

-- RPC: update_asset_metadata_v1
CREATE OR REPLACE FUNCTION public.update_asset_metadata_v1(
  p_asset_id uuid,
  p_original_filename text DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_approval_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  into v_actor_email, v_actor_name
  from auth.users where id = v_actor;

  update public.assets set
    original_filename = coalesce(p_original_filename, original_filename),
    kind = coalesce(p_kind, kind),
    approval_status = coalesce(p_approval_status, approval_status),
    updated_by = v_actor,
    updated_at = now()
  where id = p_asset_id;

  insert into public.asset_audit_logs (
    asset_id, action, actor_id, actor_email, actor_name, summary, details
  ) values (
    p_asset_id, 'ASSET_METADATA_UPDATE', v_actor, v_actor_email, v_actor_name,
    'Metadados do asset corporativo atualizados',
    jsonb_build_object('filename', p_original_filename, 'kind', p_kind, 'approval_status', p_approval_status)
  );

  return jsonb_build_object('success', true);
end $$;

-- RPC: archive_asset_v1
CREATE OR REPLACE FUNCTION public.archive_asset_v1(
  p_asset_id uuid,
  p_reason text DEFAULT 'Arquivado pelo operador'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := '';
  v_actor_name text := '';
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(public.team_role(), 'editor') <> 'admin' then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  into v_actor_email, v_actor_name
  from auth.users where id = v_actor;

  update public.assets set
    approval_status = 'archived',
    updated_by = v_actor,
    updated_at = now()
  where id = p_asset_id;

  -- Desmarca primary de qualquer relação deste asset arquivado
  update public.product_assets
  set is_primary = false
  where asset_id = p_asset_id;

  insert into public.asset_audit_logs (
    asset_id, action, actor_id, actor_email, actor_name, summary, details
  ) values (
    p_asset_id, 'ASSET_ARCHIVE', v_actor, v_actor_email, v_actor_name,
    'Asset arquivado: ' || p_reason,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('success', true);
end $$;

-- RPC: list_assets_workspace_v1
CREATE OR REPLACE FUNCTION public.list_assets_workspace_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_assets jsonb;
  v_product_assets jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if public.team_role() is null then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into v_assets
  from public.assets a;

  select coalesce(jsonb_agg(to_jsonb(pa) order by pa.sort_order asc, pa.created_at asc), '[]'::jsonb)
  into v_product_assets
  from public.product_assets pa;

  return jsonb_build_object(
    'assets', v_assets,
    'product_assets', v_product_assets
  );
end $$;

-- REVOGAR ACESSO PUBLIC / ANON DAS RPCS E CONCEDER A AUTHENTICATED
REVOKE ALL ON FUNCTION public.finalize_asset_upload_v1 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_product_asset_v1 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlink_product_asset_v1 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_primary_product_asset_v1 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_product_asset_v1 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_asset_metadata_v1 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_asset_v1 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_assets_workspace_v1 FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.finalize_asset_upload_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_product_asset_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_product_asset_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_product_asset_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_asset_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_asset_metadata_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_asset_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_assets_workspace_v1 TO authenticated;
