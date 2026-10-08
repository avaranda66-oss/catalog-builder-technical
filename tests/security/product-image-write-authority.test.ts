import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const readSql = (file: string) => readFileSync(resolve(root, file), 'utf8').replace(/--[^\n]*/g, '');
const migration = readSql('supabase/migrations/00026_product_image_write_authority.sql');
const rollback = readSql('supabase/rollbacks/00026_product_image_write_authority.sql');
const rehearsal = readSql('supabase/rehearsals/00026_product_image_write_authority_rehearsal.sql');
const policies = migration.match(/CREATE POLICY[\s\S]*?;/gi) ?? [];

describe('product-images live anonymous-write regression', () => {
  it('replaces both observed permissive mutation policies transactionally and idempotently', () => {
    expect(migration.trim()).toMatch(/^BEGIN;/i);
    expect(migration.trim()).toMatch(/COMMIT;$/i);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Upload imagens" ON storage\.objects;/i);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Update imagens" ON storage\.objects;/i);
    expect(policies).toHaveLength(2);
  });

  it('admits only authenticated active editors/admins in every mutation predicate', () => {
    for (const policy of policies) {
      expect(policy).toMatch(/FOR (INSERT|UPDATE) TO authenticated/i);
      expect(policy).not.toMatch(/TO\s+(PUBLIC|anon)\b/i);
      const predicates = policy.match(/(?:USING|WITH CHECK)\s*\([\s\S]*?\n\s*\)/gi) ?? [];
      expect(predicates).toHaveLength(policy.includes('FOR UPDATE') ? 2 : 1);
      for (const predicate of predicates) {
        expect(predicate).toContain("bucket_id = 'product-images'");
        expect(predicate).toContain('auth.uid() IS NOT NULL');
        expect(predicate).toContain("public.team_role() IN ('admin', 'editor')");
        expect(predicate).not.toMatch(/\bOR\b/i);
      }
    }
    const helper = readSql('supabase/migrations/00004_team_workspace.sql');
    expect(helper).toMatch(/as \$\$ select role from public\.profiles where id = auth\.uid\(\) and is_active \$\$/i);
  });

  it('preserves public reads, existing objects, bucket metadata and unrelated authority', () => {
    expect(migration).not.toMatch(/(?:DROP|ALTER|CREATE) POLICY "Imagens publicas"/i);
    expect(migration).not.toMatch(/^\s*(?:DELETE FROM|INSERT INTO|UPDATE\s+[a-z_]|ALTER TABLE|DROP TABLE|CREATE (?:OR REPLACE )?FUNCTION|GRANT|REVOKE)\b/im);
    expect(migration).not.toContain('product-assets');
    expect(migration).not.toContain('catalog-images');
  });

  it('provides a fail-closed operational rollback without restoring public mutation', () => {
    expect(rollback.trim()).toMatch(/^BEGIN;/i);
    expect(rollback.trim()).toMatch(/COMMIT;$/i);
    expect(rollback).toMatch(/DROP POLICY IF EXISTS "Upload imagens"/i);
    expect(rollback).toMatch(/DROP POLICY IF EXISTS "Update imagens"/i);
    expect(rollback).not.toMatch(/CREATE POLICY|GRANT|DELETE FROM|UPDATE storage/i);
  });

  it('rehearses negative and positive identities with real role/JWT context and rollback', () => {
    expect(rehearsal.trim()).toMatch(/^BEGIN;/i);
    expect(rehearsal.trim()).toMatch(/ROLLBACK;$/i);
    expect(rehearsal).not.toMatch(/\bCOMMIT;/i);
    expect(rehearsal).toContain('SET LOCAL ROLE anon;');
    expect(rehearsal).toContain('SET LOCAL ROLE authenticated;');
    for (const denied of ['anonymous', 'expired-no-subject', 'viewer', 'inactive-editor', 'missing-profile']) {
      expect(rehearsal).toContain(`assert_product_image_writes('${denied}', false)`);
    }
    for (const allowed of ['active-editor', 'active-admin']) {
      expect(rehearsal).toContain(`assert_product_image_writes('${allowed}', true)`);
    }
    expect(rehearsal).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT');
    expect(rehearsal).toContain('GET DIAGNOSTICS v_deleted = ROW_COUNT');
    expect(rehearsal).toContain('DELETE authority expanded');
    expect(rehearsal).toContain('fixture collision');
    expect(rehearsal).toContain('existing public image read was broken');
  });
});
