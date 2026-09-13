import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  RecoveryRecordError,
  parseRecoveryKey,
  parseRecoveryRecord,
  recoveryKeyOf,
  type RecoveryKey,
  type RecoveryRecord,
} from './contracts';
import { validateRecoveryRecordIntegrity } from './digest';
import {
  RecoveryStorageError,
  type RecoveryDeleteResult,
  type RecoveryInspection,
  type RecoveryRepository,
  type RecoveryWriteResult,
} from './repository';

export const VNEXT_RECOVERY_DATABASE_NAME = 'catalog_builder_vnext_recovery';
export const VNEXT_RECOVERY_DATABASE_VERSION = 1;
export const VNEXT_RECOVERY_STORE_NAME = 'recoveryRecords';
const AUTHORITY_SCOPE_INDEX = 'by-authority-scope';

type RecoveryTupleKey = [string, string, string];

interface RecoveryStoredValue {
  authorityScopeId: string;
  catalogId: string;
  openSessionId: string;
  recoveryGeneration: number;
  recordToken: string;
  rawRecord: unknown;
}

interface RecoveryDatabaseSchema extends DBSchema {
  recoveryRecords: {
    key: RecoveryTupleKey;
    value: RecoveryStoredValue;
    indexes: { 'by-authority-scope': string };
  };
}

export interface IndexedDbRecoveryRepositoryOptions {
  readonly databaseName?: string;
}

function tuple(key: RecoveryKey): RecoveryTupleKey {
  const parsed = parseRecoveryKey(key);
  return [parsed.authorityScopeId, parsed.catalogId, parsed.openSessionId];
}

function keyFromStored(value: RecoveryStoredValue): RecoveryKey {
  return parseRecoveryKey({
    authorityScopeId: value.authorityScopeId,
    catalogId: value.catalogId,
    openSessionId: value.openSessionId,
  });
}

function recordToken(record: RecoveryRecord): string {
  return JSON.stringify(record);
}

function storedValue(record: RecoveryRecord): RecoveryStoredValue {
  return {
    ...recoveryKeyOf(record),
    recoveryGeneration: record.recoveryGeneration,
    recordToken: recordToken(record),
    rawRecord: record,
  };
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}

export function mapIndexedDbFailure(error: unknown): RecoveryStorageError {
  if (error instanceof RecoveryStorageError) return error;
  if (isQuotaError(error)) {
    return new RecoveryStorageError('QUOTA_EXCEEDED', 'IndexedDB quota exceeded');
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new RecoveryStorageError('TRANSACTION_ABORTED', 'IndexedDB transaction aborted');
  }
  return new RecoveryStorageError(
    'STORAGE_UNAVAILABLE',
    error instanceof Error ? error.message : 'IndexedDB unavailable'
  );
}

export class IndexedDbRecoveryRepository implements RecoveryRepository {
  private databasePromise: Promise<IDBPDatabase<RecoveryDatabaseSchema>> | undefined;
  private readonly databaseName: string;

  constructor(options: IndexedDbRecoveryRepositoryOptions = {}) {
    this.databaseName = options.databaseName ?? VNEXT_RECOVERY_DATABASE_NAME;
  }

  private database(): Promise<IDBPDatabase<RecoveryDatabaseSchema>> {
    if (!globalThis.indexedDB) {
      throw new RecoveryStorageError('STORAGE_UNAVAILABLE', 'IndexedDB is unavailable');
    }
    this.databasePromise ??= openDB<RecoveryDatabaseSchema>(
      this.databaseName,
      VNEXT_RECOVERY_DATABASE_VERSION,
      {
        upgrade(database, oldVersion) {
          if (oldVersion < 1) {
            const store = database.createObjectStore(VNEXT_RECOVERY_STORE_NAME, {
              keyPath: ['authorityScopeId', 'catalogId', 'openSessionId'],
            });
            store.createIndex(AUTHORITY_SCOPE_INDEX, 'authorityScopeId');
          }
        },
      }
    ).catch((error: unknown) => {
      this.databasePromise = undefined;
      throw mapIndexedDbFailure(error);
    });
    return this.databasePromise;
  }

  private async inspect(value: RecoveryStoredValue): Promise<RecoveryInspection> {
    let key: RecoveryKey;
    try {
      key = keyFromStored(value);
    } catch (error) {
      throw mapIndexedDbFailure(error);
    }
    try {
      const record = await validateRecoveryRecordIntegrity(value.rawRecord, key);
      if (value.recoveryGeneration !== record.recoveryGeneration || value.recordToken !== recordToken(record)) {
        throw new RecoveryRecordError('INVALID_RECORD', 'Stored recovery metadata does not match record');
      }
      return { status: 'VALID', key, record };
    } catch (error) {
      const typed = error instanceof RecoveryRecordError
        ? error
        : new RecoveryRecordError('INVALID_RECORD', error instanceof Error ? error.message : String(error));
      return {
        status: 'INVALID',
        key,
        rawRecord: value.rawRecord,
        error: { code: typed.code, message: typed.message },
      };
    }
  }

  async putIfNewer(record: RecoveryRecord): Promise<RecoveryWriteResult> {
    let candidate: RecoveryRecord;
    try {
      candidate = await validateRecoveryRecordIntegrity(record, recoveryKeyOf(record));
    } catch (error) {
      throw new RecoveryStorageError('INVALID_RECORD', error instanceof Error ? error.message : String(error));
    }

    try {
      const database = await this.database();
      const transaction = database.transaction(VNEXT_RECOVERY_STORE_NAME, 'readwrite', { durability: 'strict' });
      const store = transaction.objectStore(VNEXT_RECOVERY_STORE_NAME);
      const existing = await store.get(tuple(recoveryKeyOf(candidate)));
      if (existing) {
        const existingKey = keyFromStored(existing);
        let parsedExisting: RecoveryRecord;
        try {
          parsedExisting = parseRecoveryRecord(existing.rawRecord, existingKey);
        } catch {
          transaction.abort();
          await transaction.done.catch(() => undefined);
          throw new RecoveryStorageError('INVALID_RECORD', 'Invalid stored record is preserved');
        }
        if (
          existing.recoveryGeneration !== parsedExisting.recoveryGeneration
          || existing.recordToken !== recordToken(parsedExisting)
        ) {
          transaction.abort();
          await transaction.done.catch(() => undefined);
          throw new RecoveryStorageError('INVALID_RECORD', 'Invalid stored metadata is preserved');
        }
        if (parsedExisting.recoveryGeneration > candidate.recoveryGeneration) {
          await transaction.done;
          return { status: 'STALE', storedGeneration: parsedExisting.recoveryGeneration };
        }
        if (parsedExisting.recoveryGeneration === candidate.recoveryGeneration) {
          await transaction.done;
          if (existing.recordToken !== recordToken(candidate)) {
            throw new RecoveryStorageError('GENERATION_COLLISION', 'Equal generation has different content');
          }
          return { status: 'IDEMPOTENT', generation: candidate.recoveryGeneration };
        }
      }
      await store.put(storedValue(candidate));
      await transaction.done;
      return { status: 'STORED', generation: candidate.recoveryGeneration };
    } catch (error) {
      throw mapIndexedDbFailure(error);
    }
  }

  async get(key: RecoveryKey): Promise<RecoveryInspection | undefined> {
    try {
      const value = await (await this.database()).get(VNEXT_RECOVERY_STORE_NAME, tuple(key));
      return value ? this.inspect(value) : undefined;
    } catch (error) {
      throw mapIndexedDbFailure(error);
    }
  }

  async listByScope(authorityScopeId: string): Promise<readonly RecoveryInspection[]> {
    try {
      const values = await (await this.database()).getAllFromIndex(
        VNEXT_RECOVERY_STORE_NAME,
        AUTHORITY_SCOPE_INDEX,
        authorityScopeId
      );
      return Promise.all(values.map((value) => this.inspect(value)));
    } catch (error) {
      throw mapIndexedDbFailure(error);
    }
  }

  async deleteIfGeneration(key: RecoveryKey, expectedGeneration: number): Promise<RecoveryDeleteResult> {
    try {
      const database = await this.database();
      const transaction = database.transaction(VNEXT_RECOVERY_STORE_NAME, 'readwrite', { durability: 'strict' });
      const store = transaction.objectStore(VNEXT_RECOVERY_STORE_NAME);
      const existing = await store.get(tuple(key));
      if (!existing) {
        await transaction.done;
        return { status: 'NOT_FOUND' };
      }
      let parsed: RecoveryRecord;
      try {
        parsed = parseRecoveryRecord(existing.rawRecord, key);
      } catch {
        await transaction.done;
        return { status: 'INVALID_PRESERVED' };
      }
      if (
        existing.recoveryGeneration !== parsed.recoveryGeneration
        || existing.recordToken !== recordToken(parsed)
      ) {
        await transaction.done;
        return { status: 'INVALID_PRESERVED' };
      }
      if (parsed.recoveryGeneration !== expectedGeneration) {
        await transaction.done;
        return { status: 'STALE', storedGeneration: parsed.recoveryGeneration };
      }
      await store.delete(tuple(key));
      await transaction.done;
      return { status: 'DELETED' };
    } catch (error) {
      throw mapIndexedDbFailure(error);
    }
  }

  async close(): Promise<void> {
    const database = await this.databasePromise;
    database?.close();
    this.databasePromise = undefined;
  }
}
