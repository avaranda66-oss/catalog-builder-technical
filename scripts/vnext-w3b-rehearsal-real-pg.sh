#!/usr/bin/env bash
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-54322}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

run_psql() {
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 "$@"
}

echo "=================================================="
echo "VNEXT W3.B REAL POSTGRESQL REHEARSAL"
echo "=================================================="
date -u +"TIMESTAMP: %Y-%m-%dT%H:%M:%SZ"
psql --version
run_psql -Atc "SELECT version();"

echo "--- Applying W3.B migration 00024 ---"
run_psql -f supabase/migrations/00024_vnext_catalog_persistence.sql

echo "--- Running sequential/security/failure-injection rehearsal ---"
run_psql -f supabase/rehearsals/00024_vnext_catalog_persistence_rehearsal.sql

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "--- CASE A: true SAVE / SAVE contention ---"
cat > "$tmp_dir/save-a.sql" <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT id
FROM public.vnext_catalogs
WHERE id = '10000000-0000-4000-8000-000000000070'::uuid
FOR UPDATE;
SELECT pg_sleep(2);
SELECT public.save_vnext_catalog_cas_v1(
  '10000000-0000-4000-8000-000000000070',
  1,
  'a0000000-0000-4000-8000-000000000071',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000070","title":"SAVE winner A","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb
);
COMMIT;
SQL

cat > "$tmp_dir/save-b.sql" <<'SQL'
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT public.save_vnext_catalog_cas_v1(
  '10000000-0000-4000-8000-000000000070',
  1,
  'a0000000-0000-4000-8000-000000000072',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000070","title":"SAVE contender B","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb
);
SQL

run_psql -f "$tmp_dir/save-a.sql" > "$tmp_dir/save-a.log" 2>&1 &
save_a_pid=$!
sleep 0.5
set +e
run_psql -f "$tmp_dir/save-b.sql" > "$tmp_dir/save-b.log" 2>&1
save_b_status=$?
set -e
wait "$save_a_pid"

if [[ "$save_b_status" -eq 0 ]]; then
  echo "SAVE/SAVE contender B unexpectedly succeeded"
  cat "$tmp_dir/save-b.log"
  exit 1
fi
grep -q "VNEXT_CONFLICT" "$tmp_dir/save-b.log"

save_state="$(run_psql -Atc "
SELECT remote_revision || '|' || title || '|' ||
       (SELECT count(*) FROM public.vnext_catalog_revisions r WHERE r.catalog_id=c.id) || '|' ||
       (SELECT count(*) FROM public.vnext_catalog_revisions r WHERE r.catalog_id=c.id AND r.revision=2) || '|' ||
       (SELECT count(*) FROM public.vnext_catalog_revisions r WHERE r.catalog_id=c.id AND r.revision>2)
FROM public.vnext_catalogs c
WHERE id='10000000-0000-4000-8000-000000000070'::uuid;
")"
if [[ "$save_state" != "2|SAVE winner A|2|1|0" ]]; then
  echo "SAVE/SAVE final state invalid: $save_state"
  exit 1
fi
echo "[PASS] SAVE/SAVE: one N+1 winner, one CONFLICT, no N+2 or history gap"

echo "--- CASE B: true SAVE / ARCHIVE contention ---"
cat > "$tmp_dir/race-save.sql" <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT id
FROM public.vnext_catalogs
WHERE id = '10000000-0000-4000-8000-000000000080'::uuid
FOR UPDATE;
SELECT pg_sleep(2);
SELECT public.save_vnext_catalog_cas_v1(
  '10000000-0000-4000-8000-000000000080',
  1,
  'a0000000-0000-4000-8000-000000000081',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000080","title":"SAVE race winner","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb
);
COMMIT;
SQL

cat > "$tmp_dir/race-archive.sql" <<'SQL'
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT public.archive_vnext_catalog_cas_v1(
  '10000000-0000-4000-8000-000000000080',
  1,
  'a0000000-0000-4000-8000-000000000082'
);
SQL

run_psql -f "$tmp_dir/race-save.sql" > "$tmp_dir/race-save.log" 2>&1 &
race_save_pid=$!
sleep 0.5
set +e
run_psql -f "$tmp_dir/race-archive.sql" > "$tmp_dir/race-archive.log" 2>&1
race_archive_status=$?
set -e
wait "$race_save_pid"

if [[ "$race_archive_status" -eq 0 ]]; then
  echo "SAVE/ARCHIVE contender unexpectedly succeeded"
  cat "$tmp_dir/race-archive.log"
  exit 1
fi
grep -q "VNEXT_CONFLICT" "$tmp_dir/race-archive.log"

race_state="$(run_psql -Atc "
SELECT remote_revision || '|' || title || '|' || (archived_at IS NULL)::text || '|' ||
       (SELECT count(*) FROM public.vnext_catalog_revisions r WHERE r.catalog_id=c.id) || '|' ||
       (SELECT operation FROM public.vnext_catalog_revisions r WHERE r.catalog_id=c.id AND r.revision=2)
FROM public.vnext_catalogs c
WHERE id='10000000-0000-4000-8000-000000000080'::uuid;
")"
if [[ "$race_state" != "2|SAVE race winner|true|2|save" ]]; then
  echo "SAVE/ARCHIVE final state invalid: $race_state"
  exit 1
fi
echo "[PASS] SAVE/ARCHIVE: SAVE won N+1, stale ARCHIVE conflicted, catalog stayed active"

echo "--- Service-role behavior evidence ---"
run_psql -c "
SELECT rolname, rolbypassrls
FROM pg_roles
WHERE rolname IN ('anon','authenticated','service_role')
ORDER BY rolname;
"
run_psql -c "
SELECT
  has_table_privilege('service_role','public.vnext_catalogs','SELECT') AS service_select,
  has_table_privilege('service_role','public.vnext_catalogs','INSERT') AS service_insert,
  has_table_privilege('service_role','public.vnext_catalogs','UPDATE') AS service_update,
  has_table_privilege('service_role','public.vnext_catalogs','DELETE') AS service_delete;
"

echo "=================================================="
echo "W3.B REAL DATABASE REHEARSAL PASSED"
echo "=================================================="
