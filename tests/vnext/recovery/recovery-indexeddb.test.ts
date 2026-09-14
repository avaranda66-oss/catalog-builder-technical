import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  IndexedDbRecoveryRepository,
  RecoveryStorageError,
  VNEXT_RECOVERY_DATABASE_NAME,
  VNEXT_RECOVERY_DATABASE_VERSION,
  mapIndexedDbFailure,
} from '@/vnext/recovery';

describe('W3.D IndexedDB adapter boundary', () => {
  it('uses one dedicated versioned VNext database', () => {
    expect(VNEXT_RECOVERY_DATABASE_NAME).toBe('catalog_builder_vnext_recovery');
    expect(VNEXT_RECOVERY_DATABASE_VERSION).toBe(1);
  });

  it('fails explicitly when IndexedDB is unavailable and has no fallback', async () => {
    const repository = new IndexedDbRecoveryRepository({ databaseName: 'unavailable-test' });
    await expect(repository.listByScope('scope')).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    const source = readFileSync('src/vnext/recovery/indexeddb-repository.ts', 'utf8');
    expect(source).not.toMatch(/localStorage|sessionStorage|OPFS/i);
  });

  it('maps quota and transaction abort failures to typed Father-safe infrastructure errors', () => {
    expect(mapIndexedDbFailure(new DOMException('full', 'QuotaExceededError'))).toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(mapIndexedDbFailure(new DOMException('aborted', 'AbortError'))).toMatchObject({ code: 'TRANSACTION_ABORTED' });
    expect(mapIndexedDbFailure(new Error('closed'))).toBeInstanceOf(RecoveryStorageError);
  });
});
