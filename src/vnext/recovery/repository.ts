import {
  RecoveryRecordError,
  parseRecoveryKey,
  recoveryKeyOf,
  recoveryKeyToken,
  type RecoveryKey,
  type RecoveryRecord,
  type RecoveryRecordErrorCode,
} from './contracts';
import { validateRecoveryRecordIntegrity, type DigestBytes } from './digest';

export type RecoveryInspection =
  | { readonly status: 'VALID'; readonly key: RecoveryKey; readonly record: RecoveryRecord }
  | {
      readonly status: 'INVALID';
      readonly key: RecoveryKey;
      readonly rawRecord: unknown;
      readonly error: { readonly code: RecoveryRecordErrorCode; readonly message: string };
    };

export type RecoveryWriteResult =
  | { readonly status: 'STORED'; readonly generation: number }
  | { readonly status: 'IDEMPOTENT'; readonly generation: number }
  | { readonly status: 'STALE'; readonly storedGeneration: number };

export type RecoveryDeleteResult =
  | { readonly status: 'DELETED' }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'STALE'; readonly storedGeneration?: number }
  | { readonly status: 'INVALID_PRESERVED' };

export type RecoveryStorageErrorCode =
  | 'INVALID_RECORD'
  | 'GENERATION_COLLISION'
  | 'STORAGE_UNAVAILABLE'
  | 'QUOTA_EXCEEDED'
  | 'TRANSACTION_ABORTED';

export class RecoveryStorageError extends Error {
  constructor(public readonly code: RecoveryStorageErrorCode, message: string) {
    super(message);
    this.name = 'RecoveryStorageError';
  }
}

export interface RecoveryRepository {
  putIfNewer(record: RecoveryRecord): Promise<RecoveryWriteResult>;
  get(key: RecoveryKey): Promise<RecoveryInspection | undefined>;
  listByScope(authorityScopeId: string): Promise<readonly RecoveryInspection[]>;
  deleteIfGeneration(key: RecoveryKey, expectedGeneration: number): Promise<RecoveryDeleteResult>;
}

interface MemoryEntry {
  readonly key: RecoveryKey;
  rawRecord: unknown;
}

function exactRecordToken(record: RecoveryRecord): string {
  return JSON.stringify(record);
}

export class InMemoryRecoveryRepository implements RecoveryRepository {
  private readonly entries = new Map<string, MemoryEntry>();

  constructor(private readonly digestBytes?: DigestBytes) {}

  seedRaw(key: RecoveryKey, rawRecord: unknown): void {
    const parsedKey = parseRecoveryKey(key);
    this.entries.set(recoveryKeyToken(parsedKey), { key: parsedKey, rawRecord });
  }

  private async inspect(entry: MemoryEntry): Promise<RecoveryInspection> {
    try {
      const record = await validateRecoveryRecordIntegrity(entry.rawRecord, entry.key, this.digestBytes);
      return { status: 'VALID', key: entry.key, record };
    } catch (error) {
      const typed = error instanceof RecoveryRecordError
        ? error
        : new RecoveryRecordError('INVALID_RECORD', error instanceof Error ? error.message : String(error));
      return {
        status: 'INVALID',
        key: entry.key,
        rawRecord: entry.rawRecord,
        error: { code: typed.code, message: typed.message },
      };
    }
  }

  async putIfNewer(record: RecoveryRecord): Promise<RecoveryWriteResult> {
    let candidate: RecoveryRecord;
    try {
      candidate = await validateRecoveryRecordIntegrity(record, recoveryKeyOf(record), this.digestBytes);
    } catch (error) {
      throw new RecoveryStorageError('INVALID_RECORD', error instanceof Error ? error.message : String(error));
    }
    const token = recoveryKeyToken(recoveryKeyOf(candidate));
    const existing = this.entries.get(token);
    if (existing) {
      const inspection = await this.inspect(existing);
      if (inspection.status === 'INVALID') {
        throw new RecoveryStorageError('INVALID_RECORD', 'Invalid stored record is preserved and cannot be overwritten');
      }
      if (inspection.record.recoveryGeneration > candidate.recoveryGeneration) {
        return { status: 'STALE', storedGeneration: inspection.record.recoveryGeneration };
      }
      if (inspection.record.recoveryGeneration === candidate.recoveryGeneration) {
        if (exactRecordToken(inspection.record) !== exactRecordToken(candidate)) {
          throw new RecoveryStorageError('GENERATION_COLLISION', 'Equal generation has different content');
        }
        return { status: 'IDEMPOTENT', generation: candidate.recoveryGeneration };
      }
    }
    this.entries.set(token, { key: recoveryKeyOf(candidate), rawRecord: candidate });
    return { status: 'STORED', generation: candidate.recoveryGeneration };
  }

  async get(key: RecoveryKey): Promise<RecoveryInspection | undefined> {
    const parsed = parseRecoveryKey(key);
    const entry = this.entries.get(recoveryKeyToken(parsed));
    return entry ? this.inspect(entry) : undefined;
  }

  async listByScope(authorityScopeId: string): Promise<readonly RecoveryInspection[]> {
    const inspections: RecoveryInspection[] = [];
    for (const entry of this.entries.values()) {
      if (entry.key.authorityScopeId === authorityScopeId) inspections.push(await this.inspect(entry));
    }
    return inspections;
  }

  async deleteIfGeneration(key: RecoveryKey, expectedGeneration: number): Promise<RecoveryDeleteResult> {
    const parsed = parseRecoveryKey(key);
    const token = recoveryKeyToken(parsed);
    const entry = this.entries.get(token);
    if (!entry) return { status: 'NOT_FOUND' };
    const inspection = await this.inspect(entry);
    if (inspection.status === 'INVALID') return { status: 'INVALID_PRESERVED' };
    if (inspection.record.recoveryGeneration !== expectedGeneration) {
      return { status: 'STALE', storedGeneration: inspection.record.recoveryGeneration };
    }
    this.entries.delete(token);
    return { status: 'DELETED' };
  }
}
