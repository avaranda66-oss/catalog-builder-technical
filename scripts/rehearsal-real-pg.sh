#!/usr/bin/env bash
set -eo pipefail

echo "=================================================="
echo "PIM REAL POSTGRESQL REHEARSAL: 00022 -> 00023"
echo "=================================================="
date -u +"TIMESTAMP: %Y-%m-%dT%H:%M:%SZ"

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-54322}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

run_psql() {
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 "$@"
}

echo ""
echo "--- 1. ENVIRONMENT & PLATFORM INFO ---"
echo "POSTGRESQL CLIENT:"
psql --version
echo "POSTGRESQL SERVER VERSION:"
run_psql -t -c "SELECT version();" | xargs
echo "SUPABASE HOST: ${PGHOST}:${PGPORT}"
echo "SUPABASE DATABASE: ${PGDATABASE}"

echo ""
echo "--- 2. MIGRATION CHECKSUMS ---"
SHA_00022=$(sha256sum supabase/migrations/00022_product_workbook_persistence.sql | awk '{print $1}')
SHA_00023=$(sha256sum supabase/migrations/00023_product_dataset_search_index.sql | awk '{print $1}')
echo "00022 SHA-256: ${SHA_00022}"
echo "00023 SHA-256: ${SHA_00023}"

echo ""
echo "--- 3. VERIFYING 00022 STATE ---"
run_psql -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'save_product_workbook_v1') THEN
    RAISE EXCEPTION 'STATE_00022_FAILED: save_product_workbook_v1 deve existir no estado 00022';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'save_product_workbook_v2') THEN
    RAISE EXCEPTION 'STATE_00022_FAILED: save_product_workbook_v2 NÃO deve existir antes da 00023';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_dataset_search_index') THEN
    RAISE EXCEPTION 'STATE_00022_FAILED: product_dataset_search_index NÃO deve existir antes da 00023';
  END IF;
  RAISE NOTICE '[STATE 00022 CONFIRMED] save_product_workbook_v1 presente; v2 e dataset index ausentes.';
END \$\$;
"

echo ""
echo "--- 4. EXECUTING MATRIZ OBRIGATÓRIA DE EXECUÇÃO REAL ---"

echo "Running POINT 01: FIRST APPLY 00023..."
run_psql -f supabase/migrations/00023_product_dataset_search_index.sql > /dev/null
echo "[REHEARSAL][POINT-01][OK] FIRST APPLY 00023: PASS"

echo "Running POINT 02: SECOND APPLY / IDEMPOTENCE 00023..."
run_psql -f supabase/migrations/00023_product_dataset_search_index.sql > /dev/null
echo "[REHEARSAL][POINT-02][OK] SECOND APPLY / IDEMPOTENCE: PASS"

echo "Running POINTS 03 TO 28: TRANSACTIONAL REHEARSAL SUITE..."
run_psql -f supabase/rehearsals/00023_migration_rehearsal_suite.sql

echo ""
echo "=================================================="
echo "ALL 28 REHEARSAL POINTS EXECUTED AND PASSED ON REAL POSTGRESQL!"
echo "=================================================="
