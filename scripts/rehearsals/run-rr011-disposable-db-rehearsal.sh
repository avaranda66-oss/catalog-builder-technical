#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_SHA='5443b249f8d3c0d6b678105de709e3465a298f1a'
readonly SOURCE_SQL='supabase/rehearsals/source_document_cas_v2_draft.sql'
readonly SOURCE_SQL_SHA256='711c4bffc6d2b244e9eb5185234cd6153b117edf0cb14dd40ff855b59bdf02e0'
readonly BASELINE_SQL='supabase/rehearsals/rr011_disposable_db_baseline.sql'
readonly PRE_SQL='supabase/rehearsals/rr011_disposable_db_pre_concurrency.sql'
readonly POST_SQL='supabase/rehearsals/rr011_disposable_db_post_concurrency.sql'
readonly WRITER_A_SQL='supabase/rehearsals/rr011_writer_a.sql'
readonly WRITER_B_SQL='supabase/rehearsals/rr011_writer_b.sql'

: "${DATABASE_URL:?DATABASE_URL must point to the disposable PostgreSQL service}"

case "$DATABASE_URL" in
    postgresql://*@localhost:*/*|postgresql://*@127.0.0.1:*/*)
        ;;
    *)
        echo '[RR011][SAFETY][FAIL] DATABASE_URL must target localhost or 127.0.0.1' >&2
        exit 64
        ;;
esac

if [[ "$DATABASE_URL" == *'bjxqvrpbigwgabwbhtqa'* ]]; then
    echo '[RR011][SAFETY][FAIL] Production project reference detected' >&2
    exit 65
fi

git diff --exit-code "$SOURCE_SHA" -- "$SOURCE_SQL"

actual_sql_sha256="$(sha256sum "$SOURCE_SQL" | awk '{print $1}')"
if [[ "$actual_sql_sha256" != "$SOURCE_SQL_SHA256" ]]; then
    echo "[RR011][SOURCE-INTEGRITY][FAIL] expected $SOURCE_SQL_SHA256 got $actual_sql_sha256" >&2
    exit 66
fi

echo "[RR011][SOURCE-INTEGRITY][PASS] source_sha=$SOURCE_SHA sql_sha256=$actual_sql_sha256"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c 'SELECT version() AS disposable_database_version;'
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$BASELINE_SQL"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$SOURCE_SQL"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$PRE_SQL"

work_dir="$(mktemp -d)"
writer_a_log="$work_dir/writer-a.log"
writer_b_log="$work_dir/writer-b.log"
cleanup() {
    rm -rf -- "$work_dir"
}
trap cleanup EXIT

PGAPPNAME='rr011-writer-a' psql "$DATABASE_URL" -X -f "$WRITER_A_SQL" >"$writer_a_log" 2>&1 &
writer_a_pid=$!

writer_a_ready=false
for _ in $(seq 1 50); do
    active_sleep="$(psql "$DATABASE_URL" -X -Atqc "SELECT count(*) FROM pg_stat_activity WHERE application_name = 'rr011-writer-a' AND state = 'active' AND query LIKE 'SELECT pg_sleep%';")"
    if [[ "$active_sleep" == '1' ]]; then
        writer_a_ready=true
        break
    fi
    sleep 0.1
done

if [[ "$writer_a_ready" != 'true' ]]; then
    wait "$writer_a_pid" || true
    sed -n '1,200p' "$writer_a_log" >&2
    echo '[RR011][TWO-WRITERS][FAIL] Writer A did not reach the open-transaction barrier' >&2
    exit 67
fi

set +e
PGAPPNAME='rr011-writer-b' psql "$DATABASE_URL" -X -f "$WRITER_B_SQL" >"$writer_b_log" 2>&1
writer_b_status=$?
set -e

wait "$writer_a_pid"

sed -n '1,200p' "$writer_a_log"
sed -n '1,200p' "$writer_b_log"

if [[ "$writer_b_status" -eq 0 ]]; then
    echo '[RR011][TWO-WRITERS][FAIL] Writer B unexpectedly succeeded' >&2
    exit 68
fi

if ! grep -Eq 'ERROR:[[:space:]]+40001: SOURCE_DOCUMENT_CONFLICT' "$writer_b_log"; then
    echo '[RR011][TWO-WRITERS][FAIL] Writer B did not return SQLSTATE 40001 SOURCE_DOCUMENT_CONFLICT' >&2
    exit 69
fi

if ! grep -Eq '"actualVersion":[[:space:]]*3' "$writer_b_log"; then
    echo '[RR011][TWO-WRITERS][FAIL] Writer B detail did not report actualVersion 3' >&2
    exit 70
fi

echo '[RR011][TWO-WRITERS][PASS] separate sessions overlapped; Writer B SQLSTATE=40001 actualVersion=3'
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$POST_SQL"
echo '[RR011][REHEARSAL][PASS] all mandatory empirical cases passed'
