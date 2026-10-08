-- Father-ready finalization: live product-images INSERT/UPDATE were granted to
-- PUBLIC with only a bucket check. Keep existing public image URLs readable,
-- but require the same active editorial authority used by the workspace.
-- public.team_role() returns NULL for a missing or inactive profile (00004).
BEGIN;

DROP POLICY IF EXISTS "Upload imagens" ON storage.objects;
CREATE POLICY "Upload imagens" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND auth.uid() IS NOT NULL
    AND public.team_role() IN ('admin', 'editor')
  );

DROP POLICY IF EXISTS "Update imagens" ON storage.objects;
CREATE POLICY "Update imagens" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND auth.uid() IS NOT NULL
    AND public.team_role() IN ('admin', 'editor')
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND auth.uid() IS NOT NULL
    AND public.team_role() IN ('admin', 'editor')
  );

-- Do not change "Imagens publicas", buckets, objects, other policies or RPCs.
COMMIT;
