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
    expect(verify).toContain('RR018 critical entity absent');
    expect(verify).toContain('RR018 RLS disabled');
    expect(verify).toContain('RR018 physical local Storage object metadata missing');
  });

  it('keeps CI isolated to manual dispatch or the RR018 remediation branch and requests no secrets', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('remediation/w3d-rr018-disposable-recovery-drill');
    expect(workflow).not.toContain('secrets.');
    expect(workflow).toContain('RR018_DISPOSABLE: "1"');
  });
});
