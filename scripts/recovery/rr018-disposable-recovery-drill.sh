#!/usr/bin/env bash
set -euo pipefail

if [[ "${RR018_DISPOSABLE:-}" != "1" ]]; then
  echo "RR018 refuses to run unless RR018_DISPOSABLE=1 is explicitly set." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUPABASE_BIN="${REPO_ROOT}/node_modules/.bin/supabase"

for tool in bash docker psql curl sha256sum base64; do
  command -v "$tool" >/dev/null 2>&1 || { echo "RR018 missing required local tool: $tool" >&2; exit 3; }
done
[[ -x "$SUPABASE_BIN" ]] || { echo "RR018 requires the repository-local Supabase CLI at node_modules/.bin/supabase" >&2; exit 3; }
PGHOST="127.0.0.1"
PGPORT="54322"
PGUSER="postgres"
PGDATABASE="postgres"
PGPASSWORD="postgres"
export PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD

if [[ "$PGHOST" != "127.0.0.1" && "$PGHOST" != "localhost" ]]; then
  echo "RR018 refuses non-loopback PostgreSQL hosts." >&2
  exit 4
fi

if [[ -n "${RUNNER_TEMP:-}" ]]; then
  WORK_ROOT="$(mktemp -d "${RUNNER_TEMP}/rr018-disposable-XXXXXX")"
else
  WORK_ROOT="$(mktemp -d)"
fi
ARTIFACT_DIR="${RR018_ARTIFACT_DIR:-${WORK_ROOT}/artifacts}"
mkdir -p "$ARTIFACT_DIR"

STACK_A="${WORK_ROOT}/stack-a"
STACK_B="${WORK_ROOT}/stack-b"
FIXTURE_FILE="${WORK_ROOT}/recovery-fixture.png"
BACKUP_STORAGE_FILE="${ARTIFACT_DIR}/storage-product-assets-rr018-recovery-fixture.png"
DRILL_START="$(date +%s)"

STACK_A_STARTED=0
STACK_B_STARTED=0

cleanup() {
  set +e
  if [[ "$STACK_A_STARTED" == "1" && -d "$STACK_A" ]]; then
    (cd "$STACK_A" && "$SUPABASE_BIN" stop --no-backup >/dev/null 2>&1) || true
  fi
  if [[ "$STACK_B_STARTED" == "1" && -d "$STACK_B" ]]; then
    (cd "$STACK_B" && "$SUPABASE_BIN" stop --no-backup >/dev/null 2>&1) || true
  fi
}
trap cleanup EXIT

run_psql() {
  psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" "$@"
}

init_stack() {
  local stack_dir="$1"
  mkdir -p "$stack_dir"
  (cd "$stack_dir" && "$SUPABASE_BIN" init >/dev/null)
  mkdir -p "$stack_dir/supabase/migrations"
}

copy_migration_range() {
  local stack_dir="$1"
  shift
  local pattern
  for pattern in "$@"; do
    cp "$REPO_ROOT"/supabase/migrations/$pattern "$stack_dir/supabase/migrations/"
  done
}

apply_remaining_migrations() {
  local stack_dir="$1"
  (cd "$stack_dir" && "$SUPABASE_BIN" migration up --local)
}

start_stack() {
  local stack_dir="$1"
  local start_log="${WORK_ROOT}/supabase-start-$(basename "$stack_dir").log"
  if ! (cd "$stack_dir" && "$SUPABASE_BIN" start >"$start_log" 2>&1); then
    echo "RR018 local Supabase startup failed; sanitized startup log follows:" >&2
    sed -E '/Publishable|Secret|Access Key|Secret Key|JWT|ANON_KEY|SERVICE_ROLE_KEY/d' "$start_log" >&2
    return 1
  fi
  echo "[RR018] local Supabase stack started: $(basename "$stack_dir")"
}

current_db_container() {
  local container_id
  container_id="$(docker ps --filter 'name=supabase_db_' --format '{{.ID}}' | head -n 1)"
  [[ -n "$container_id" ]] || { echo "RR018 disposable PostgreSQL container not found" >&2; return 1; }
  printf '%s' "$container_id"
}

container_pg_dump() {
  local container_id
  container_id="$(current_db_container)"
  docker exec "$container_id" pg_dump -U postgres -d postgres "$@"
}

container_pg_restore() {
  local dump_file="$1"
  shift
  local container_id
  container_id="$(current_db_container)"
  docker exec -i "$container_id" pg_restore -U postgres -d postgres "$@" < "$dump_file"
}

container_pg_restore_list() {
  local dump_file="$1"
  local container_id
  container_id="$(current_db_container)"
  docker exec -i "$container_id" pg_restore -l < "$dump_file"
}

container_pg_restore_version() {
  local container_id
  container_id="$(current_db_container)"
  docker exec "$container_id" pg_restore --version
}

container_pg_restore_with_list() {
  local dump_file="$1"
  local restore_list="$2"
  shift 2
  local container_id container_restore_list
  container_id="$(current_db_container)"
  container_restore_list="/tmp/rr018-public-schema.restore.list"
  docker cp "$restore_list" "${container_id}:${container_restore_list}" >/dev/null
  docker exec -i "$container_id" pg_restore -U postgres -d postgres --use-list="$container_restore_list" "$@" < "$dump_file"
}

disable_application_audit_triggers() {
  run_psql <<'SQL'
ALTER TABLE public.products DISABLE TRIGGER trg_products_audit;
ALTER TABLE public.catalogs DISABLE TRIGGER trg_catalogs_audit;
ALTER TABLE public.field_definitions DISABLE TRIGGER trg_field_definitions_audit;
SQL
  echo "[RR018] data-restore application_audit_triggers=disabled count=3"
}

enable_application_audit_triggers() {
  run_psql <<'SQL'
ALTER TABLE public.products ENABLE TRIGGER trg_products_audit;
ALTER TABLE public.catalogs ENABLE TRIGGER trg_catalogs_audit;
ALTER TABLE public.field_definitions ENABLE TRIGGER trg_field_definitions_audit;
SQL
  echo "[RR018] data-restore application_audit_triggers=enabled count=3"
}

build_public_schema_restore_list() {
  local dump_file="$1"
  local toc_file="$2"
  local restore_list="$3"
  local excluded_default_acl_file="$4"
  local excluded_schema_file="$5"
  local excluded_default_acl_count excluded_schema_count unexpected_platform_default_acl_count raw_application_acl_count restored_application_acl_count kind kind_count

  echo "[RR018] schema-toc-tool=$(container_pg_restore_version)"
  container_pg_restore_list "$dump_file" > "$toc_file"
  : > "$excluded_default_acl_file"
  : > "$excluded_schema_file"

  awk -v excluded_default_acl_file="$excluded_default_acl_file" -v excluded_schema_file="$excluded_schema_file" '
    /^;/ { print; next }
    /^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public [^[:space:]]+$/ {
      print $0 >> excluded_schema_file
      print ";" $0
      next
    }
    / DEFAULT ACL public DEFAULT PRIVILEGES FOR (TABLES|FUNCTIONS|SEQUENCES) supabase_admin$/ {
      print $0 >> excluded_default_acl_file
      print ";" $0
      next
    }
    { print }
  ' "$toc_file" > "$restore_list"

  excluded_schema_count="$(wc -l < "$excluded_schema_file" | tr -d ' ')"
  if [[ "$excluded_schema_count" -ne 1 ]]; then
    echo "RR018 expected exactly 1 fresh Supabase public SCHEMA entry, found ${excluded_schema_count}" >&2
    return 1
  fi

  excluded_default_acl_count="$(wc -l < "$excluded_default_acl_file" | tr -d ' ')"
  if [[ "$excluded_default_acl_count" -ne 3 ]]; then
    echo "RR018 expected exactly 3 Supabase platform DEFAULT ACL entries, found ${excluded_default_acl_count}" >&2
    return 1
  fi

  unexpected_platform_default_acl_count="$(grep -E ' DEFAULT ACL .* supabase_admin$' "$toc_file" | grep -Evc ' DEFAULT ACL public DEFAULT PRIVILEGES FOR (TABLES|FUNCTIONS|SEQUENCES) supabase_admin$' || true)"
  if [[ "$unexpected_platform_default_acl_count" -ne 0 ]]; then
    echo "RR018 found an unexpected supabase_admin DEFAULT ACL TOC entry; refusing to broaden the restore filter" >&2
    return 1
  fi

  for kind in TABLES FUNCTIONS SEQUENCES; do
    kind_count="$(grep -Ec " DEFAULT ACL public DEFAULT PRIVILEGES FOR ${kind} supabase_admin$" "$excluded_default_acl_file" || true)"
    if [[ "$kind_count" -ne 1 ]]; then
      echo "RR018 expected exactly one Supabase platform DEFAULT ACL entry for ${kind}, found ${kind_count}" >&2
      return 1
    fi
  done

  if grep -Eq '^[^;].* SCHEMA - public [^[:space:]]+$' "$restore_list"; then
    echo "RR018 restore list left the fresh Supabase public SCHEMA creation enabled" >&2
    return 1
  fi

  if grep -Eq '^[^;].* DEFAULT ACL public DEFAULT PRIVILEGES FOR (TABLES|FUNCTIONS|SEQUENCES) supabase_admin$' "$restore_list"; then
    echo "RR018 restore list left a Supabase platform DEFAULT ACL entry enabled" >&2
    return 1
  fi

  raw_application_acl_count="$(grep -Ec '^[0-9]+; [0-9]+ [0-9]+ ACL public ' "$toc_file" || true)"
  restored_application_acl_count="$(grep -Ec '^[0-9]+; [0-9]+ [0-9]+ ACL public ' "$restore_list" || true)"
  if [[ "$raw_application_acl_count" -eq 0 || "$raw_application_acl_count" -ne "$restored_application_acl_count" ]]; then
    echo "RR018 application ACL TOC entries were not preserved by the narrow platform filter" >&2
    return 1
  fi

  echo "[RR018] schema-toc platform_public_schema_excluded=${excluded_schema_count} platform_default_acl_excluded=${excluded_default_acl_count} application_acl_preserved=${restored_application_acl_count}"
  sed 's/^/[RR018][TOC][EXCLUDED][PLATFORM-SCHEMA] /' "$excluded_schema_file"
  sed 's/^/[RR018][TOC][EXCLUDED][PLATFORM-DEFAULT-ACL] /' "$excluded_default_acl_file"
}

capture_supabase_platform_public_schema() {
  local destination="$1"
  run_psql -At -F '|' -c "
    SELECT n.nspname,
           pg_get_userbyid(n.nspowner),
           COALESCE(n.nspacl::text, '')
    FROM pg_namespace n
    WHERE n.nspname = 'public';" > "$destination"

  if [[ "$(wc -l < "$destination" | tr -d ' ')" -ne 1 ]]; then
    echo "RR018 fresh Supabase public schema baseline is missing or ambiguous" >&2
    return 1
  fi
}

capture_supabase_platform_default_acl() {
  local destination="$1"
  run_psql -At -F '|' -c "
    SELECT d.defaclobjtype,
           pg_get_userbyid(d.defaclrole),
           n.nspname,
           d.defaclacl::text
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE pg_get_userbyid(d.defaclrole) = 'supabase_admin'
      AND n.nspname = 'public'
      AND d.defaclobjtype IN ('r', 'f', 'S')
    ORDER BY d.defaclobjtype;" > "$destination"

  if [[ "$(wc -l < "$destination" | tr -d ' ')" -ne 3 ]]; then
    echo "RR018 fresh Supabase platform DEFAULT ACL baseline is incomplete" >&2
    return 1
  fi
}

local_status_value() {
  local stack_dir="$1"
  local key="$2"
  local status_output
  status_output="$(cd "$stack_dir" && "$SUPABASE_BIN" status -o env 2>/dev/null)"
  printf '%s\n' "$status_output" | awk -F= -v wanted="$key" '$1 == wanted {gsub(/^"|"$/, "", $2); print $2; exit}'
}

upload_storage_object() {
  local stack_dir="$1"
  local file="$2"
  local api_url service_key
  api_url="$(local_status_value "$stack_dir" API_URL)"
  service_key="$(local_status_value "$stack_dir" SERVICE_ROLE_KEY)"
  [[ -n "$api_url" && -n "$service_key" ]] || { echo "RR018 could not resolve local Supabase Storage credentials" >&2; exit 5; }
  curl --fail --silent --show-error \
    -X POST "${api_url}/storage/v1/object/product-assets/rr018/recovery-fixture.png" \
    -H "Authorization: Bearer ${service_key}" \
    -H "apikey: ${service_key}" \
    -H "Content-Type: image/png" \
    -H "x-upsert: true" \
    --data-binary "@${file}" >/dev/null
}

download_storage_object() {
  local stack_dir="$1"
  local destination="$2"
  local api_url service_key
  api_url="$(local_status_value "$stack_dir" API_URL)"
  service_key="$(local_status_value "$stack_dir" SERVICE_ROLE_KEY)"
  curl --fail --silent --show-error \
    "${api_url}/storage/v1/object/authenticated/product-assets/rr018/recovery-fixture.png" \
    -H "Authorization: Bearer ${service_key}" \
    -H "apikey: ${service_key}" \
    -o "$destination"
}

capture_counts() {
  local destination="$1"
  run_psql -At -F '|' -c "
    SELECT 'profiles', count(*) FROM public.profiles
    UNION ALL SELECT 'product_families', count(*) FROM public.product_families
    UNION ALL SELECT 'product_family_fields', count(*) FROM public.product_family_fields
    UNION ALL SELECT 'products', count(*) FROM public.products
    UNION ALL SELECT 'catalogs', count(*) FROM public.catalogs
    UNION ALL SELECT 'catalog_products', count(*) FROM public.catalog_products
    UNION ALL SELECT 'catalog_versions', count(*) FROM public.catalog_versions
    UNION ALL SELECT 'product_versions', count(*) FROM public.product_versions
    UNION ALL SELECT 'product_workbooks', count(*) FROM public.product_workbooks
    UNION ALL SELECT 'product_source_documents', count(*) FROM public.product_source_documents
    UNION ALL SELECT 'product_technical_data_index', count(*) FROM public.product_technical_data_index
    UNION ALL SELECT 'product_dataset_search_index', count(*) FROM public.product_dataset_search_index
    UNION ALL SELECT 'assets', count(*) FROM public.assets
    UNION ALL SELECT 'product_assets', count(*) FROM public.product_assets
    UNION ALL SELECT 'audit_log', count(*) FROM public.audit_log
    UNION ALL SELECT 'library_change_events', count(*) FROM public.library_change_events
    UNION ALL SELECT 'asset_audit_logs', count(*) FROM public.asset_audit_logs
    UNION ALL SELECT 'auth_fixture', count(*) FROM auth.users WHERE id = '98000000-0000-4000-8000-000000000001'
    UNION ALL SELECT 'storage_object', count(*) FROM storage.objects WHERE bucket_id = 'product-assets' AND name = 'rr018/recovery-fixture.png'
    ORDER BY 1;" > "$destination"
}

capture_nonpublic_controls() {
  local destination="$1"
  run_psql -At > "$destination" <<'SQL'
SELECT format(
  'DROP TRIGGER IF EXISTS %I ON auth.users;%s%s;',
  t.tgname,
  E'\n',
  pg_get_triggerdef(t.oid)
)
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_auth_user_created_catalog' AND NOT t.tgisinternal;

SELECT format(
  'DROP POLICY IF EXISTS %I ON storage.objects;%sCREATE POLICY %I ON storage.objects AS %s FOR %s TO %s%s%s;',
  policyname,
  E'\n',
  policyname,
  permissive,
  cmd,
  (SELECT string_agg(quote_ident(role_name), ', ') FROM unnest(roles) AS role_name),
  CASE WHEN qual IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
  CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END
)
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname IN (
    'catalog_media_read','catalog_media_insert','catalog_media_delete','catalog_media_block_anon',
    'catalog_media_bound_read','catalog_media_bound_insert','catalog_media_bound_update','catalog_media_bound_delete',
    'storage_product_assets_read_active_team','storage_product_assets_admin_write'
  )
ORDER BY policyname;
SQL
}

echo "[RR018] phase=clean-environment stack=A"
init_stack "$STACK_A"
copy_migration_range "$STACK_A" '0000[1-4]_*.sql'
start_stack "$STACK_A"
STACK_A_STARTED=1

echo "[RR018] baseline-bridge=1 path=scripts/db-release0-live-baseline.sql reason=00005_requires_media_library"
run_psql -f "$REPO_ROOT/scripts/db-release0-live-baseline.sql"

copy_migration_range "$STACK_A" '0000[5-9]_*.sql' '0001[0-3]_*.sql'
apply_remaining_migrations "$STACK_A"

echo "[RR018] baseline-bridge=2 path=scripts/db-release0-gap2-pre14.sql reason=historical_asset_shape_before_00014"
run_psql -f "$REPO_ROOT/scripts/db-release0-gap2-pre14.sql"

copy_migration_range "$STACK_A" '0001[4-9]_*.sql' '0002[0-1]_*.sql'
apply_remaining_migrations "$STACK_A"

echo "[RR018] baseline-bridge=3 path=scripts/db-release0-gap2-post14.sql reason=historical_asset_shape_after_00014_00021"
run_psql -f "$REPO_ROOT/scripts/db-release0-gap2-post14.sql"

copy_migration_range "$STACK_A" '0002[2-3]_*.sql'
apply_remaining_migrations "$STACK_A"

printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl4q+4AAAAASUVORK5CYII=' | base64 --decode > "$FIXTURE_FILE"
ASSET_SHA="$(sha256sum "$FIXTURE_FILE" | awk '{print $1}')"
ASSET_SIZE="$(wc -c < "$FIXTURE_FILE" | tr -d ' ')"

echo "[RR018] phase=representative-fixture"
run_psql -v asset_sha="$ASSET_SHA" -v asset_size="$ASSET_SIZE" -f "$REPO_ROOT/scripts/recovery/rr018-fixture.sql"
upload_storage_object "$STACK_A" "$FIXTURE_FILE"
run_psql -v fixture_sha="$ASSET_SHA" -f "$REPO_ROOT/scripts/recovery/rr018-verify.sql"
capture_counts "$ARTIFACT_DIR/counts-before.tsv"

echo "[RR018] phase=backup"
container_pg_dump --format=custom --schema=public --schema-only > "$ARTIFACT_DIR/public-schema.dump"
container_pg_dump --format=custom --schema=public --data-only > "$ARTIFACT_DIR/public-data.dump"
container_pg_dump --data-only --inserts --table=auth.users > "$ARTIFACT_DIR/auth-users.sql"
container_pg_dump --data-only --inserts --table=storage.buckets > "$ARTIFACT_DIR/storage-buckets.sql"
capture_nonpublic_controls "$ARTIFACT_DIR/nonpublic-controls.sql"
download_storage_object "$STACK_A" "$BACKUP_STORAGE_FILE"
cp "$REPO_ROOT/scripts/recovery/rr018-critical-entities.json" "$ARTIFACT_DIR/critical-entities.json"
capture_supabase_platform_public_schema "$ARTIFACT_DIR/supabase-platform-public-schema-before.tsv"
capture_supabase_platform_default_acl "$ARTIFACT_DIR/supabase-platform-default-acl-before.tsv"
build_public_schema_restore_list \
  "$ARTIFACT_DIR/public-schema.dump" \
  "$ARTIFACT_DIR/public-schema.toc.list" \
  "$ARTIFACT_DIR/public-schema.restore.list" \
  "$ARTIFACT_DIR/public-schema.excluded-platform-default-acl.list" \
  "$ARTIFACT_DIR/public-schema.excluded-platform-schema.list"

(cd "$ARTIFACT_DIR" && sha256sum public-schema.dump public-data.dump auth-users.sql storage-buckets.sql nonpublic-controls.sql storage-product-assets-rr018-recovery-fixture.png critical-entities.json public-schema.toc.list public-schema.restore.list public-schema.excluded-platform-default-acl.list public-schema.excluded-platform-schema.list supabase-platform-public-schema-before.tsv supabase-platform-default-acl-before.tsv > manifest.sha256)
(cd "$ARTIFACT_DIR" && sha256sum -c manifest.sha256)

echo "[RR018] phase=destroy stack=A"
(cd "$STACK_A" && "$SUPABASE_BIN" stop --no-backup)
STACK_A_STARTED=0

echo "[RR018] phase=fresh-restore stack=B source=backup-artifacts-only"
RESTORE_START="$(date +%s)"
init_stack "$STACK_B"
start_stack "$STACK_B"
STACK_B_STARTED=1

(cd "$ARTIFACT_DIR" && sha256sum -c manifest.sha256)
capture_supabase_platform_public_schema "$ARTIFACT_DIR/supabase-platform-public-schema-fresh-stack-b.tsv"
diff -u "$ARTIFACT_DIR/supabase-platform-public-schema-before.tsv" "$ARTIFACT_DIR/supabase-platform-public-schema-fresh-stack-b.tsv"
capture_supabase_platform_default_acl "$ARTIFACT_DIR/supabase-platform-default-acl-fresh-stack-b.tsv"
diff -u "$ARTIFACT_DIR/supabase-platform-default-acl-before.tsv" "$ARTIFACT_DIR/supabase-platform-default-acl-fresh-stack-b.tsv"
container_pg_restore_with_list "$ARTIFACT_DIR/public-schema.dump" "$ARTIFACT_DIR/public-schema.restore.list" --no-owner --exit-on-error
echo "[RR018] restore=schema status=ok"
run_psql -f "$ARTIFACT_DIR/auth-users.sql"
echo "[RR018] restore=auth status=ok"
disable_application_audit_triggers
container_pg_restore "$ARTIFACT_DIR/public-data.dump" --data-only --no-owner --single-transaction --exit-on-error
enable_application_audit_triggers
echo "[RR018] restore=data status=ok"
run_psql -f "$ARTIFACT_DIR/storage-buckets.sql"
run_psql -f "$ARTIFACT_DIR/nonpublic-controls.sql"
echo "[RR018] restore=nonpublic-controls status=ok"
upload_storage_object "$STACK_B" "$BACKUP_STORAGE_FILE"
echo "[RR018] restore=storage status=ok"

echo "[RR018] phase=verify-restored"
run_psql -v fixture_sha="$ASSET_SHA" -f "$REPO_ROOT/scripts/recovery/rr018-verify.sql"
capture_supabase_platform_public_schema "$ARTIFACT_DIR/supabase-platform-public-schema-after.tsv"
diff -u "$ARTIFACT_DIR/supabase-platform-public-schema-before.tsv" "$ARTIFACT_DIR/supabase-platform-public-schema-after.tsv"
capture_supabase_platform_default_acl "$ARTIFACT_DIR/supabase-platform-default-acl-after.tsv"
diff -u "$ARTIFACT_DIR/supabase-platform-default-acl-before.tsv" "$ARTIFACT_DIR/supabase-platform-default-acl-after.tsv"
capture_counts "$ARTIFACT_DIR/counts-after.tsv"
diff -u "$ARTIFACT_DIR/counts-before.tsv" "$ARTIFACT_DIR/counts-after.tsv"

RESTORED_STORAGE_FILE="${WORK_ROOT}/restored-storage-object.png"
download_storage_object "$STACK_B" "$RESTORED_STORAGE_FILE"
RESTORED_STORAGE_SHA="$(sha256sum "$RESTORED_STORAGE_FILE" | awk '{print $1}')"
if [[ "$RESTORED_STORAGE_SHA" != "$ASSET_SHA" ]]; then
  echo "RR018 restored Storage checksum mismatch" >&2
  exit 6
fi

RESTORE_END="$(date +%s)"
DRILL_END="$RESTORE_END"
RESTORE_DURATION="$((RESTORE_END - RESTORE_START))"
TOTAL_DURATION="$((DRILL_END - DRILL_START))"

cat > "$ARTIFACT_DIR/result.env" <<EOF
RR018_VERDICT=GO_FOR_PRINCIPAL_AUDIT
RR018_REHEARSAL_RESTORE_DURATION_SECONDS=${RESTORE_DURATION}
RR018_TOTAL_DRILL_DURATION_SECONDS=${TOTAL_DURATION}
RR018_STORAGE_SHA256=${ASSET_SHA}
RR018_BASELINE_BRIDGES=3
RR018_PLATFORM_PUBLIC_SCHEMA_EXCLUDED=1
RR018_PLATFORM_DEFAULT_ACL_EXCLUDED=3
RR018_PRODUCTION_RPO=NOT_VERIFIED
RR018_PRODUCTION_PITR=NOT_VERIFIED
RR018_PRODUCTION_RTO=NOT_VERIFIED
EOF

if [[ ! -s "$ARTIFACT_DIR/counts-after.tsv" || ! -s "$ARTIFACT_DIR/result.env" ]]; then
  echo "RR018 required closure evidence is missing" >&2
  exit 7
fi

echo "[RR018][OK] verdict=GO_FOR_PRINCIPAL_AUDIT"
echo "[RR018] evidence=counts-after.tsv,result.env status=present"
echo "[RR018][METRIC] rehearsal_restore_duration_seconds=${RESTORE_DURATION}"
echo "[RR018][METRIC] total_drill_duration_seconds=${TOTAL_DURATION}"
echo "[RR018][LIMITATION] production_rpo_pitr_rto_storage_backup_and_secrets_escrow=NOT_VERIFIED"

echo "[RR018] phase=destroy stack=B"
(cd "$STACK_B" && "$SUPABASE_BIN" stop --no-backup)
STACK_B_STARTED=0
