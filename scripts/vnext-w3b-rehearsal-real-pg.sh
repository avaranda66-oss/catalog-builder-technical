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

echo "--- CASE C1: concurrent identical CREATE converges idempotently ---"
cat > "$tmp_dir/create-identical-a.sql" <<'SQL'
SET application_name = 'w3b-c1-create-a';
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT public.create_vnext_catalog_v1(
  'a0000000-0000-4000-8000-0000000000c1',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-0000000000c1","title":"Concurrent identical CREATE","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb,
  '{"originKind":"blank","originId":"concurrent-create","originRevision":0}'::jsonb
);
SELECT pg_sleep(8);
COMMIT;
SQL

cat > "$tmp_dir/create-identical-b.sql" <<'SQL'
SET application_name = 'w3b-c1-create-b';
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT public.create_vnext_catalog_v1(
  'a0000000-0000-4000-8000-0000000000c1',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-0000000000c1","title":"Concurrent identical CREATE","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb,
  '{"originKind":"blank","originId":"concurrent-create","originRevision":0}'::jsonb
);
SQL

run_psql -At -f "$tmp_dir/create-identical-a.sql" > "$tmp_dir/create-identical-a.log" 2>&1 &
create_identical_a_pid=$!

# C1 must prove the winning CREATE has returned before the contender is even
# launched. Observing A executing the following pg_sleep inside an open
# transaction is a positive post-CREATE barrier; a blind shell delay cannot
# certify this state if the A process was descheduled before the RPC.
create_identical_a_observation=""
for _ in $(seq 1 100); do
  create_identical_a_observation="$(run_psql -Atc "
SELECT pid::text || '|' || state || '|' || COALESCE(wait_event_type, '') || '|' || COALESCE(wait_event, '')
FROM pg_stat_activity
WHERE application_name = 'w3b-c1-create-a'
  AND state = 'active'
  AND xact_start IS NOT NULL
  AND position('pg_sleep' in query) > 0
LIMIT 1;
")"
  if [[ -n "$create_identical_a_observation" ]]; then
    break
  fi
  sleep 0.05
done

if [[ -z "$create_identical_a_observation" ]]; then
  echo "C1 session A never reached the observable post-CREATE transaction hold"
  cat "$tmp_dir/create-identical-a.log"
  wait "$create_identical_a_pid" || true
  exit 1
fi
echo "[PROOF] C1 session A reached post-CREATE transaction hold"
echo "[EVIDENCE] C1 session A pg_stat_activity: $create_identical_a_observation"

run_psql -At -f "$tmp_dir/create-identical-b.sql" > "$tmp_dir/create-identical-b.log" 2>&1 &
create_identical_b_pid=$!

create_identical_block_observation=""
for _ in $(seq 1 100); do
  create_identical_block_observation="$(run_psql -Atc "
SELECT b.pid::text || '|' || a.pid::text || '|' || b.state || '|' || COALESCE(b.wait_event_type, '') || '|' || COALESCE(b.wait_event, '')
FROM pg_stat_activity AS b
JOIN pg_stat_activity AS a
  ON a.application_name = 'w3b-c1-create-a'
WHERE b.application_name = 'w3b-c1-create-b'
  AND a.pid = ANY(pg_blocking_pids(b.pid))
LIMIT 1;
")"
  if [[ -n "$create_identical_block_observation" ]]; then
    break
  fi
  sleep 0.05
done

if [[ -z "$create_identical_block_observation" ]]; then
  echo "C1 session B never became observably blocked by session A"
  cat "$tmp_dir/create-identical-a.log"
  cat "$tmp_dir/create-identical-b.log"
  wait "$create_identical_a_pid" || true
  wait "$create_identical_b_pid" || true
  exit 1
fi
echo "[PROOF] C1 session B is blocked by session A"
echo "[EVIDENCE] C1 pg_blocking_pids(B) contains A: $create_identical_block_observation"

set +e
wait "$create_identical_a_pid"
create_identical_a_status=$?
wait "$create_identical_b_pid"
create_identical_b_status=$?
set -e

if [[ "$create_identical_a_status" -ne 0 || "$create_identical_b_status" -ne 0 ]]; then
  echo "Concurrent identical CREATE did not succeed for both callers"
  cat "$tmp_dir/create-identical-a.log"
  cat "$tmp_dir/create-identical-b.log"
  exit 1
fi

create_identical_a_result="$(grep -m1 '"catalogId"' "$tmp_dir/create-identical-a.log" || true)"
create_identical_b_result="$(grep -m1 '"catalogId"' "$tmp_dir/create-identical-b.log" || true)"
if [[ -z "$create_identical_a_result" || "$create_identical_a_result" != "$create_identical_b_result" ]]; then
  echo "Concurrent identical CREATE callers did not receive the same authoritative result"
  cat "$tmp_dir/create-identical-a.log"
  cat "$tmp_dir/create-identical-b.log"
  exit 1
fi

create_identical_state="$(run_psql -Atc "
SELECT
  (SELECT count(*) FROM public.vnext_catalogs WHERE id='10000000-0000-4000-8000-0000000000c1'::uuid) || '|' ||
  (SELECT remote_revision FROM public.vnext_catalogs WHERE id='10000000-0000-4000-8000-0000000000c1'::uuid) || '|' ||
  (SELECT last_mutation_id::text FROM public.vnext_catalogs WHERE id='10000000-0000-4000-8000-0000000000c1'::uuid) || '|' ||
  (SELECT count(*) FROM public.vnext_catalog_revisions WHERE catalog_id='10000000-0000-4000-8000-0000000000c1'::uuid) || '|' ||
  (SELECT count(*) FROM public.vnext_catalog_revisions WHERE catalog_id='10000000-0000-4000-8000-0000000000c1'::uuid AND mutation_id='a0000000-0000-4000-8000-0000000000c1'::uuid) || '|' ||
  (SELECT count(*) FROM public.vnext_catalog_revisions WHERE catalog_id='10000000-0000-4000-8000-0000000000c1'::uuid AND revision>1);
")"
if [[ "$create_identical_state" != "1|1|a0000000-0000-4000-8000-0000000000c1|1|1|0" ]]; then
  echo "Concurrent identical CREATE durable state invalid: $create_identical_state"
  exit 1
fi
echo "[PASS] concurrent identical CREATE: both callers received revision 1; one row/history mutation; no revision 2"

echo "--- CASE C2: concurrent divergent CREATE fails closed ---"
cat > "$tmp_dir/create-divergent-a.sql" <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT public.create_vnext_catalog_v1(
  'a0000000-0000-4000-8000-0000000000c2',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-0000000000c2","title":"Concurrent divergent winner","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb,
  NULL
);
SELECT pg_sleep(2);
COMMIT;
SQL

cat > "$tmp_dir/create-divergent-b.sql" <<'SQL'
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT public.create_vnext_catalog_v1(
  'a0000000-0000-4000-8000-0000000000c3',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-0000000000c2","title":"Concurrent divergent contender","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb,
  NULL
);
SQL

run_psql -At -f "$tmp_dir/create-divergent-a.sql" > "$tmp_dir/create-divergent-a.log" 2>&1 &
create_divergent_a_pid=$!
sleep 0.5
set +e
run_psql -At -f "$tmp_dir/create-divergent-b.sql" > "$tmp_dir/create-divergent-b.log" 2>&1
create_divergent_b_status=$?
wait "$create_divergent_a_pid"
create_divergent_a_status=$?
set -e

if [[ "$create_divergent_a_status" -ne 0 || "$create_divergent_b_status" -eq 0 ]]; then
  echo "Concurrent divergent CREATE outcome invalid"
  cat "$tmp_dir/create-divergent-a.log"
  cat "$tmp_dir/create-divergent-b.log"
  exit 1
fi
grep -q "VNEXT_DUPLICATE_CATALOG" "$tmp_dir/create-divergent-b.log"

create_divergent_state="$(run_psql -Atc "
SELECT remote_revision || '|' || title || '|' || last_mutation_id::text || '|' ||
       (SELECT count(*) FROM public.vnext_catalog_revisions r WHERE r.catalog_id=c.id) || '|' ||
       (SELECT count(*) FROM public.vnext_catalog_revisions r WHERE r.catalog_id=c.id AND r.revision>1)
FROM public.vnext_catalogs c
WHERE id='10000000-0000-4000-8000-0000000000c2'::uuid;
")"
if [[ "$create_divergent_state" != "1|Concurrent divergent winner|a0000000-0000-4000-8000-0000000000c2|1|0" ]]; then
  echo "Concurrent divergent CREATE durable state invalid: $create_divergent_state"
  exit 1
fi
echo "[PASS] CONCURRENT DIVERGENT CREATE: one revision-1 winner; contender conflicted; no overwrite or revision 2"

echo "--- CASE A: true SAVE / SAVE contention ---"
cat > "$tmp_dir/save-a.sql" <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT public.save_vnext_catalog_cas_v1(
  '10000000-0000-4000-8000-000000000070',
  1,
  'a0000000-0000-4000-8000-000000000071',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000070","title":"SAVE winner A","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb
);
SELECT pg_sleep(2);
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
SELECT public.save_vnext_catalog_cas_v1(
  '10000000-0000-4000-8000-000000000080',
  1,
  'a0000000-0000-4000-8000-000000000081',
  '{"schemaVersion":1,"id":"10000000-0000-4000-8000-000000000080","title":"SAVE race winner","locale":"pt-BR","style":{},"pages":[{}],"assets":[]}'::jsonb
);
SELECT pg_sleep(2);
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
