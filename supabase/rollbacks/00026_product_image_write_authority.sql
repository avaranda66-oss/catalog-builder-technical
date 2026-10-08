-- Secure operational rollback for 00026. Preserve existing public image reads,
-- fail closed on uploads/updates while investigating a policy compatibility issue.
-- Do not restore the preflight PUBLIC write policies: that reopens the incident.
-- Reapply 00026 once repaired/reviewed. No object or bucket is deleted.
BEGIN;
DROP POLICY IF EXISTS "Upload imagens" ON storage.objects;
DROP POLICY IF EXISTS "Update imagens" ON storage.objects;
COMMIT;
