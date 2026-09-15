import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('W3.G — Asset Security Rehearsal Static Contract Verification', () => {
  const rehearsalPath = path.resolve(__dirname, '../../../supabase/rehearsals/00025_asset_persistence_rehearsal.sql');
  const rehearsalSql = fs.readFileSync(rehearsalPath, 'utf8');

  it('REHEARSAL-01: strictly transactional BEGIN and ROLLBACK (no COMMIT)', () => {
    expect(rehearsalSql).toMatch(/^BEGIN;/m);
    expect(rehearsalSql).toMatch(/ROLLBACK;\s*$/m);
    expect(rehearsalSql).not.toMatch(/\bCOMMIT;/i);
  });

  it('REHEARSAL-02: creates explicit auth users/profiles fixtures (admin, editor, viewer)', () => {
    expect(rehearsalSql).toContain('admin-asset@presys.invalid');
    expect(rehearsalSql).toContain('editor-asset@presys.invalid');
    expect(rehearsalSql).toContain('viewer-asset@presys.invalid');
    expect(rehearsalSql).toContain("'admin'");
    expect(rehearsalSql).toContain("'editor'");
    expect(rehearsalSql).toContain("'viewer'");
  });

  it('REHEARSAL-03: POINT 01 — anonymous mutation rejected fail-closed', () => {
    expect(rehearsalSql).toContain('POINT 01');
    expect(rehearsalSql).toContain('SET LOCAL ROLE anon;');
    expect(rehearsalSql).toContain('WHEN insufficient_privilege');
    expect(rehearsalSql).toContain('POINT-01-FAIL');
  });

  it('REHEARSAL-04: POINT 02 — viewer mutation rejected fail-closed', () => {
    expect(rehearsalSql).toContain('POINT 02');
    expect(rehearsalSql).toContain('90000000-0000-4000-8000-0000000000v1');
    expect(rehearsalSql).toContain('WHEN insufficient_privilege');
    expect(rehearsalSql).toContain('POINT-02-FAIL');
  });

  it('REHEARSAL-05: POINT 03 — viewer read permitted where contract permits', () => {
    expect(rehearsalSql).toContain('POINT 03');
    expect(rehearsalSql).toContain('public.get_vnext_asset_v1');
  });

  it('REHEARSAL-06: POINT 04 & 05 — editor and admin authorized finalization succeeds', () => {
    expect(rehearsalSql).toContain('POINT 04');
    expect(rehearsalSql).toContain('POINT 05');
    expect(rehearsalSql).toContain('90000000-0000-4000-8000-0000000000e1');
    expect(rehearsalSql).toContain('90000000-0000-4000-8000-0000000000a1');
  });

  it('REHEARSAL-07: POINT 06 — arbitrary storage path finalization rejected', () => {
    expect(rehearsalSql).toContain('POINT 06');
    expect(rehearsalSql).toContain('vnext/arbitrary-path/escape.png');
    expect(rehearsalSql).toContain("WHEN sqlstate '22023'");
    expect(rehearsalSql).toContain('POINT-06-FAIL');
  });

  it('REHEARSAL-08: POINT 07 & 08 — direct authenticated UPDATE and DELETE on vnext_assets rejected', () => {
    expect(rehearsalSql).toContain('POINT 07');
    expect(rehearsalSql).toContain('UPDATE public.vnext_assets');
    expect(rehearsalSql).toContain('POINT 08');
    expect(rehearsalSql).toContain('DELETE FROM public.vnext_assets');
  });

  it('REHEARSAL-09: POINT 09 & 10 — UPDATE and DELETE on storage.objects under vnext/% rejected', () => {
    expect(rehearsalSql).toContain('POINT 09');
    expect(rehearsalSql).toContain("name LIKE 'vnext/%'");
    expect(rehearsalSql).toContain('POINT 10');
    expect(rehearsalSql).toContain('ROW_COUNT');
  });

  it('REHEARSAL-10: POINT 11 — legacy non-vnext admin storage behavior remains permitted', () => {
    expect(rehearsalSql).toContain('POINT 11');
    expect(rehearsalSql).toContain('legacy/sensor_photo.png');
  });

  it('REHEARSAL-11: POINT 12 & 13 — exact idempotent replay succeeds; divergent replay fails closed with 40001', () => {
    expect(rehearsalSql).toContain('POINT 12');
    expect(rehearsalSql).toContain('POINT 13');
    expect(rehearsalSql).toContain("WHEN sqlstate '40001'");
    expect(rehearsalSql).toContain('POINT-13-FAIL');
  });
});
