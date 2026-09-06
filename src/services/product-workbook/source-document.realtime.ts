import { MAX_SAFE_PERSISTENCE_VERSION } from './persistence.types';

export interface SourceDocumentRealtimePayload {
  readonly eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  readonly new?: Readonly<Record<string, unknown>> | null;
  readonly old?: Readonly<Record<string, unknown>> | null;
}

/**
 * Metadata observed from Realtime. This is an observation only; it is never a persistence ACK.
 */
export interface SourceDocumentRealtimeMetadata {
  readonly sourceDocumentId: string;
  readonly resultingVersion: number;
}

export interface SourceDocumentWriteInFlight {
  readonly sourceDocumentId: string;
  readonly targetVersion: number;
}

export type SourceDocumentRealtimeRelation = 'OWN_ECHO' | 'THIRD_PARTY_HIGHER' | 'STALE_OR_DUPLICATE';

/**
 * Extracts the minimum SourceDocument concurrency contract from a WAL payload.
 * Malformed ids/versions are ignored rather than being treated as acknowledgements.
 */
export function getSourceDocumentRealtimeMetadata(
  payload: SourceDocumentRealtimePayload
): SourceDocumentRealtimeMetadata | null {
  const row = payload.new ?? payload.old;
  if (!row) {
    return null;
  }

  const id = row.id;
  const version = row.version;

  if (typeof id !== 'string' || id.trim() === '') {
    return null;
  }

  if (
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    version > MAX_SAFE_PERSISTENCE_VERSION
  ) {
    return null;
  }

  return {
    sourceDocumentId: id,
    resultingVersion: version
  };
}

/**
 * Classifies an observation without mutating ACK state. The RPC response remains the write ACK.
 */
export function classifySourceDocumentRealtimeMetadata(
  metadata: SourceDocumentRealtimeMetadata,
  currentVersion: number,
  inFlight?: SourceDocumentWriteInFlight | null
): SourceDocumentRealtimeRelation {
  if (
    inFlight &&
    inFlight.sourceDocumentId === metadata.sourceDocumentId &&
    inFlight.targetVersion === metadata.resultingVersion
  ) {
    return 'OWN_ECHO';
  }

  if (metadata.resultingVersion > currentVersion) {
    return 'THIRD_PARTY_HIGHER';
  }

  return 'STALE_OR_DUPLICATE';
}
