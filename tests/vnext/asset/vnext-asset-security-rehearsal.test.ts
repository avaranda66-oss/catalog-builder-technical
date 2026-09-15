import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('W3.G — Asset Security Rehearsal Verification', () => {
  const rehearsalPath = path.resolve(__dirname, '../../../supabase/rehearsals/00025_asset_persistence_rehearsal.sql');
  const rehearsalSql = fs.readFileSync(rehearsalPath, 'utf8');

  it('REHEARSAL-01: strictly transactional BEGIN and ROLLBACK (no COMMIT)', () => {
    expect(rehearsalSql).toMatch(/^BEGIN;/m);
    expect(rehearsalSql).toMatch(/ROLLBACK;\s*$/m);
    expect(rehearsalSql).not.toMatch(/COMMIT;/i);
  });

  it('REHEARSAL-02: tests anonymous rejection (fail-closed)', () => {
    expect(rehearsalSql).toContain('POINT-01');
    expect(rehearsalSql).toContain('Anonymous finalization must be rejected');
  });

  it('REHEARSAL-03: tests viewer / unauthorized role rejection', () => {
    expect(rehearsalSql).toContain('POINT-02');
  });

  it('REHEARSAL-04: tests arbitrary storage path rejection', () => {
    expect(rehearsalSql).toContain('POINT-03');
    expect(rehearsalSql).toContain('Arbitrary storage path must be rejected');
  });

  it('REHEARSAL-05: verifies immutability & exclusion of legacy admin mutation on vnext/%', () => {
    expect(rehearsalSql).toContain('POINT-06');
    expect(rehearsalSql).toContain('POINT-07');
    expect(rehearsalSql).toContain('POINT-08');
  });
});
