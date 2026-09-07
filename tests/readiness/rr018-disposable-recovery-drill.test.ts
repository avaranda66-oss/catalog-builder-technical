import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const inventoryPath = resolve(process.cwd(), 'scripts/recovery/rr018-critical-entities.json');
const runnerPath = resolve(process.cwd(), 'scripts/recovery/rr018-disposable-recovery-drill.sh');
const verifyPath = resolve(process.cwd(), 'scripts/recovery/rr018-verify.sql');
const workflowPath = resolve(process.cwd(), '.github/workflows/rr018-disposable-recovery-drill.yml');

describe('RR018 disposable recovery drill contract', () => {
  it('declares every critical persistence entity requested by the recovery drill', () => {
    const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')) as {
      criticalEntities: Array<{ schema: string; name: string }>;
      historicalBaselineBridges: Array<{ path: string }>;
    };
    const entities = new Set(inventory.criticalEntities.map(({ schema, name }) => `${schema}.${name}`));

    for (const entity of [
      'auth.users',
      'public.profiles',
      'public.product_families',
      'public.product_family_fields',
      'public.products',
      'public.catalogs',
      'public.catalog_products',
      'public.catalog_versions',
      'public.product_workbooks',
      'public.product_source_documents',
      'public.product_technical_data_index',
      'public.product_dataset_search_index',
      'public.assets',
      'public.product_assets',
      'public.audit_log',
      'public.library_change_events',
      'storage.objects',
    ]) {
      expect(entities.has(entity), `missing RR018 inventory entity: ${entity}`).toBe(true);
    }

    expect(inventory.historicalBaselineBridges.map(({ path }) => path)).toEqual([
      'scripts/db-release0-live-baseline.sql',
      'scripts/db-release0-gap2-pre14.sql',
      'scripts/db-release0-gap2-post14.sql',
    ]);
  });

  it('restores the second stack from backup artifacts and verifies destructive scope', () => {
    const runner = readFileSync(runnerPath, 'utf8');
    const verify = readFileSync(verifyPath, 'utf8');

    expect(runner).toContain('RR018_DISPOSABLE');
    expect(runner).toContain('PGHOST="127.0.0.1"');
    expect(runner).toContain('stop --no-backup');
    expect(runner).toContain('public-schema.dump');
    expect(runner).toContain('public-data.dump');
    expect(runner).toContain('auth-users.sql');
    expect(runner).toContain('source=backup-artifacts-only');
    expect(runner).toContain('sha256sum -c manifest.sha256');
    expect(runner).toContain('docker exec "$container_id" pg_dump');
    expect(runner).toContain('docker exec -i "$container_id" pg_restore');
    expect(runner).toContain('sanitized startup log follows');
    expect(runner).toContain('[RR018] restore=schema status=ok');
    expect(runner).toContain('[RR018] restore=auth status=ok');
    expect(runner).toContain('[RR018] restore=data status=ok');
    expect(runner).not.toContain('--disable-triggers');
    expect(runner).toContain('--single-transaction --exit-on-error');
    expect(runner).toContain('ALTER TABLE public.products DISABLE TRIGGER trg_products_audit;');
    expect(runner).toContain('ALTER TABLE public.catalogs DISABLE TRIGGER trg_catalogs_audit;');
    expect(runner).toContain('ALTER TABLE public.field_definitions DISABLE TRIGGER trg_field_definitions_audit;');
    expect(runner).toContain('ALTER TABLE public.products ENABLE TRIGGER trg_products_audit;');
    expect(runner).toContain('ALTER TABLE public.catalogs ENABLE TRIGGER trg_catalogs_audit;');
    expect(runner).toContain('ALTER TABLE public.field_definitions ENABLE TRIGGER trg_field_definitions_audit;');
    expect(runner).toContain('[RR018] restore=nonpublic-controls status=ok');
    expect(runner).toContain('[RR018] restore=storage status=ok');
    expect(runner).toContain('evidence=counts-after.tsv,result.env status=present');
    expect(runner).toContain('RR018_PRODUCTION_RTO=NOT_VERIFIED');
    expect(verify).toContain('RR018 critical entity absent');
    expect(verify).toContain('RR018 RLS disabled');
    expect(verify).toContain('RR018 physical local Storage object metadata missing');
  });

  it('T1 restores a fresh public schema without destructive pg_restore clean flags', () => {
    const runner = readFileSync(runnerPath, 'utf8');

    expect(runner).not.toContain('--clean');
    expect(runner).not.toContain('--if-exists');
    expect(runner).toContain('public-schema.restore.list');
    expect(runner).toContain('--use-list=');
  });

  it('T2 filters only the audited Supabase platform DEFAULT ACL entries from the schema TOC', () => {
    const runner = readFileSync(runnerPath, 'utf8');

    expect(runner).toContain('pg_restore -l');
    expect(runner).toContain('public-schema.toc.list');
    expect(runner).toContain('public-schema.excluded-platform-default-acl.list');
    expect(runner).toContain('public-schema.excluded-platform-schema.list');
    expect(runner).toContain('expected exactly 1 fresh Supabase public SCHEMA entry');
    expect(runner).toContain('restore list left the fresh Supabase public SCHEMA creation enabled');
    expect(runner).toContain('supabase-platform-public-schema-before.tsv');
    expect(runner).toContain('supabase-platform-public-schema-fresh-stack-b.tsv');
    expect(runner).toContain('supabase-platform-public-schema-after.tsv');
    expect(runner).toContain('DEFAULT ACL');
    expect(runner).toContain('supabase_admin');
    expect(runner).toContain('TABLES|FUNCTIONS|SEQUENCES');
    expect(runner).toContain('RR018 expected exactly 3 Supabase platform DEFAULT ACL entries');
    expect(runner).toContain('RR018 expected exactly 6 platform DEFAULT ACL TOC entries');
    expect(runner).toContain('RR018 expected exactly 3 PostgreSQL/Supabase postgres DEFAULT ACL entries');
    expect(runner).toContain('expected exactly one platform DEFAULT ACL entry for ${role}/${kind}');
    expect(runner).toContain('restore list must preserve exactly one postgres DEFAULT ACL entry');
    expect(runner).toContain('refusing to broaden the restore filter');
    expect(runner).toContain('application ACL TOC entries were not preserved');
    expect(runner).toContain('supabase-platform-default-acl-before.tsv');
    expect(runner).toContain('supabase-platform-default-acl-fresh-stack-b.tsv');
    expect(runner).toContain('supabase-platform-default-acl-after-schema.tsv');
    expect(runner).toContain('supabase-platform-default-acl-after.tsv');
    expect(runner).toContain('for role in postgres supabase_admin; do');
    expect(runner).toContain('for objtype in r f S; do');
    expect(runner).toContain('RR018 expected exactly 6 public DEFAULT ACL baseline entries');
    expect(runner).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;');
    expect(runner).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;');
    expect(runner).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;');
    expect(runner).toContain('schema-restore postgres_platform_default_acl=suspended_nonowner_grants');
    expect(runner).toContain('RR018_PLATFORM_PUBLIC_SCHEMA_EXCLUDED=1');
    expect(runner).toContain('RR018_PLATFORM_POSTGRES_DEFAULT_ACL_PRESERVED=3');
    expect(runner).toContain('RR018_PLATFORM_DEFAULT_ACL_BASELINE=EQUAL');
    expect(runner).toContain('RR018_VERIFY_AFTER=PASS');
    expect(runner).toContain('RR018_APPLICATION_GRANTS=PASS');
    expect(runner).not.toContain('--no-acl');
    expect(runner).not.toContain('|| true');
  });

  it('T3 keeps explicit application table grants under post-restore verification', () => {
    const verify = readFileSync(verifyPath, 'utf8');

    expect(verify).toContain("has_table_privilege('authenticated', 'public.product_workbooks', 'SELECT')");
    expect(verify).toContain("has_table_privilege('authenticated', 'public.product_workbooks', 'INSERT')");
    expect(verify).toContain('RR018 grant/function ACL invariant failed');
  });

  it('T4 keeps public policies under post-restore verification', () => {
    const verify = readFileSync(verifyPath, 'utf8');

    expect(verify).toContain("SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table");
    expect(verify).toContain('RR018 policy missing: public.%');
  });

  it('T5 keeps critical functions and EXECUTE grants under post-restore verification', () => {
    const verify = readFileSync(verifyPath, 'utf8');

    expect(verify).toContain("to_regprocedure('public.save_product_workbook_v2(jsonb,integer)')");
    expect(verify).toContain(
      "has_function_privilege('authenticated', 'public.save_product_workbook_v2(jsonb,integer)', 'EXECUTE')",
    );
    expect(verify).toContain(
      "has_function_privilege('anon', 'public.save_product_workbook_v2(jsonb,integer)', 'EXECUTE')",
    );
  });

  it('T6 keeps critical triggers under post-restore verification', () => {
    const verify = readFileSync(verifyPath, 'utf8');

    for (const trigger of [
      'trg_products_audit',
      'trg_catalogs_audit',
      'trg_field_definitions_audit',
      'trg_guard_product_delete_workbook',
      'trg_guard_family_delete_workbook',
      'on_auth_user_created_catalog',
    ]) {
      expect(verify).toContain(trigger);
    }
    expect(verify).toContain("tgenabled = 'O'");
    expect(verify).toContain('RR018 critical trigger missing or disabled');
    expect(verify).toContain('RR018 auth profile provisioning trigger missing or disabled');
  });

  it('T7 keeps RLS enabled on every critical public table after restore', () => {
    const verify = readFileSync(verifyPath, 'utf8');

    expect(verify).toContain('c.relrowsecurity');
    expect(verify).toContain('RR018 RLS disabled: public.%');
  });

  it('keeps CI isolated to manual dispatch or the RR018 remediation branch and requests no secrets', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('remediation/w3d-rr018-disposable-recovery-drill');
    expect(workflow).not.toContain('secrets.');
    expect(workflow).toContain('RR018_DISPOSABLE: "1"');
    expect(workflow).toContain('github.workspace }}/rr018-artifacts');
  });
});
