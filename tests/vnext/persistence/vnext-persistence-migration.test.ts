import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('W3.B VNext persistence migration static contract', () => {
  const migrationPath = path.resolve(__dirname, '../../../supabase/migrations/00024_vnext_catalog_persistence.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  function functionText(name: string): string {
    const start = sql.indexOf(`CREATE FUNCTION public.${name}`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = sql.indexOf('$$;', start);
    expect(end).toBeGreaterThan(start);
    return sql.slice(start, end + 3);
  }

  function quotedKeys(value: string): string[] {
    return [...value.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  }

  it('creates an explicit VNext namespace without mutating Legacy catalog authority', () => {
    expect(sql).toContain('CREATE TABLE public.vnext_catalogs');
    expect(sql).toContain('CREATE TABLE public.vnext_catalog_revisions');
    expect(sql).not.toMatch(/ALTER TABLE public\.catalogs\b/);
    expect(sql).not.toMatch(/ALTER TABLE public\.catalog_versions\b/);
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.save_catalog_v3');
  });

  it('uses native UUID roots with catalog-scoped mutation uniqueness', () => {
    expect(sql).toMatch(/id UUID PRIMARY KEY/);
    expect(sql).toContain('UNIQUE (catalog_id, mutation_id)');
    expect(sql).toContain('exact canonical lowercase UUID');
    expect(sql).not.toContain('lower(p_');
    expect(sql).not.toContain('trim(p_');
  });

  it('locks current rows and performs strict expected-revision CAS', () => {
    const locks = sql.match(/FOR UPDATE;/g) ?? [];
    expect(locks.length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain('v_current.remote_revision <> p_expected_remote_revision');
    expect(sql).toContain("USING ERRCODE = '40001'");
  });

  it('serializes CREATE races with insert-only ON CONFLICT arbitration', () => {
    const createFunction = functionText('create_vnext_catalog_v1');
    expect(createFunction).toContain('ON CONFLICT (id) DO NOTHING');
    expect(createFunction).toContain('RETURNING * INTO v_current');
    expect(createFunction).toContain('WHERE catalog_id = v_catalog_id AND mutation_id = v_mutation_id');
    expect(createFunction).not.toContain('ON CONFLICT (id) DO UPDATE');
  });

  it('keeps archive outside the authored snapshot and records every successful operation', () => {
    expect(sql).toContain("operation IN ('create', 'save', 'archive')");
    expect(sql).toContain("v_mutation_id, 'archive', p_expected_remote_revision");
    const archiveFunction = sql.split('CREATE FUNCTION public.archive_vnext_catalog_cas_v1')[1] ?? '';
    expect(archiveFunction).toContain('archived_at = now()');
    expect(archiveFunction).not.toContain('document_snapshot =');
  });

  it('enforces narrow SQL snapshot safety rather than duplicating the authored schema', () => {
    const validator = functionText('vnext_validate_snapshot_v1');
    expect(sql).toContain('10485760');
    expect(validator).toContain("jsonb_typeof(p_snapshot->'pages')");
    expect(validator).toContain("jsonb_typeof(p_snapshot->'style')");
    expect(validator).toContain("jsonb_typeof(p_snapshot->'assets')");
    expect(validator).not.toContain('RichText');
    expect(validator).not.toContain('TableModel');
  });

  it('rejects every CatalogDocument top-level key outside the canonical W3.A root set', () => {
    const validator = functionText('vnext_validate_snapshot_v1');
    const rootKeySet = validator.match(/\bp_snapshot\s*-\s*ARRAY\[([\s\S]*?)\]::TEXT\[\]\)\s*<>\s*'\{\}'::JSONB/);
    expect(rootKeySet).not.toBeNull();
    expect(quotedKeys(rootKeySet![1])).toEqual([
      'schemaVersion',
      'id',
      'title',
      'locale',
      'style',
      'pages',
      'assets',
      'source',
    ]);
    expect(validator).toContain('document snapshot contains unknown top-level keys');
    expect(validator).toContain("USING ERRCODE = '22023'");
  });

  it('validates optional source as the exact strict W3.A root source object', () => {
    const validator = functionText('vnext_validate_snapshot_v1');
    const sourceKeySet = validator.match(/\(p_snapshot->'source'\)\s*-\s*ARRAY\[([^\]]+)\]::TEXT\[\]/);
    expect(sourceKeySet).not.toBeNull();
    expect(quotedKeys(sourceKeySet![1])).toEqual(['documentId', 'serverVersion']);
    expect(validator).toContain("NOT ((p_snapshot->'source') ?& ARRAY['documentId', 'serverVersion']::TEXT[])");
    expect(validator).toContain("jsonb_typeof(p_snapshot->'source'->'documentId') IS DISTINCT FROM 'string'");
    expect(validator).toContain("length(p_snapshot->'source'->>'documentId') = 0");
    expect(validator).toContain("jsonb_typeof(p_snapshot->'source'->'serverVersion') IS DISTINCT FROM 'number'");
    expect(validator).toContain('v_source_server_version < 0');
    expect(validator).toContain('v_source_server_version <> trunc(v_source_server_version)');
    expect(validator).toContain('v_source_server_version > 9007199254740991');
  });

  it('makes revision rows engine-immutable and denies application-role DML', () => {
    expect(sql).toContain('vnext_catalog_revisions_immutable');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.vnext_catalog_revisions');
    expect(sql).toContain('REVOKE ALL ON TABLE public.vnext_catalogs FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('REVOKE ALL ON TABLE public.vnext_catalog_revisions FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('GRANT SELECT ON TABLE public.vnext_catalogs TO authenticated');
  });

  it('uses fixed SECURITY DEFINER boundaries and authenticated-only RPC grants', () => {
    for (const rpc of [
      'list_vnext_catalogs_v1',
      'get_vnext_catalog_v1',
      'create_vnext_catalog_v1',
      'save_vnext_catalog_cas_v1',
      'archive_vnext_catalog_cas_v1',
    ]) {
      const start = sql.indexOf(`CREATE FUNCTION public.${rpc}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const functionText = sql.slice(start, sql.indexOf('$$;', start) + 3);
      expect(functionText).toContain('SECURITY DEFINER');
      expect(functionText).toContain('SET search_path = pg_catalog, public');
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${rpc}`);
    }
    expect(sql).toContain('FROM PUBLIC, anon');
  });

  it('preserves lightweight list authority', () => {
    expect(sql).toContain("public.vnext_catalog_metadata_v1(p_catalog) - 'lastMutationId'");
    expect(sql).toContain("public.vnext_catalog_envelope_v1(p_catalog) - 'documentSnapshot'");
  });
});
