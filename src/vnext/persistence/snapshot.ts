import { z } from 'zod';
import { CatalogDocumentSchema, type CatalogDocument } from '../domain';
import { validateDocument } from '../table';
import {
  CURRENT_PERSISTED_DOCUMENT_SCHEMA_VERSION,
  type CatalogPersistenceEnvelope,
  type CatalogPersistenceHandle,
  type CatalogRootPersistenceCompatibility,
  type PersistenceErrorCode,
} from './contracts';

const clean = z.string().min(1);
const safeNonnegativeInteger = z.number().int().safe().nonnegative();
const safePositiveInteger = z.number().int().safe().positive();
const CANONICAL_PERSISTENCE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const canonicalPersistenceUuid = z.string().regex(CANONICAL_PERSISTENCE_UUID_PATTERN);

const OriginMetadataSchema = z.object({
  originKind: clean,
  originId: clean.optional(),
  originRevision: safeNonnegativeInteger.optional(),
}).strict();

const PersistenceEnvelopeWireSchema = z.object({
  catalogId: clean,
  remoteRevision: safeNonnegativeInteger,
  lastMutationId: canonicalPersistenceUuid,
  title: clean,
  locale: clean,
  createdAt: clean,
  updatedAt: clean,
  createdBy: clean.nullable(),
  updatedBy: clean.nullable(),
  archivedAt: clean.nullable(),
  origin: OriginMetadataSchema.optional(),
  documentSchemaVersion: safePositiveInteger,
  documentSnapshot: z.unknown(),
}).strict();

export class PersistenceContractError extends Error {
  constructor(
    public readonly code: PersistenceErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'PersistenceContractError';
  }
}

function invalidDocument(message: string): never {
  throw new PersistenceContractError('INVALID_DOCUMENT', message);
}

function decodePersistedPayload(payload: unknown): unknown {
  if (typeof payload !== 'string') return payload;
  try {
    return JSON.parse(payload) as unknown;
  } catch (error) {
    return invalidDocument(error instanceof Error ? error.message : String(error));
  }
}

function inspectSupportedSchemaVersion(input: unknown): void {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    invalidDocument('Persisted document payload must be an object');
  }
  const schemaVersion = (input as Record<string, unknown>).schemaVersion;
  if (typeof schemaVersion !== 'number' || !Number.isSafeInteger(schemaVersion)) {
    invalidDocument('Persisted document schemaVersion must be a safe integer');
  }
  if (schemaVersion !== CURRENT_PERSISTED_DOCUMENT_SCHEMA_VERSION) {
    throw new PersistenceContractError('UNSUPPORTED_VERSION', `Unsupported document schemaVersion: ${schemaVersion}`);
  }
}

function validateCanonicalDocument(input: unknown): CatalogDocument {
  const parsed = CatalogDocumentSchema.safeParse(input);
  if (!parsed.success) {
    invalidDocument(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }

  const errors = validateDocument(parsed.data).filter((diagnostic) => diagnostic.severity === 'ERROR');
  if (errors.length > 0) {
    invalidDocument(errors.map((diagnostic) => `${diagnostic.code}: ${diagnostic.details}`).join('; '));
  }
  return parsed.data;
}

function toJsonSafeNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function toJsonSafeValue(value: unknown): unknown {
  if (typeof value === 'number') return toJsonSafeNumber(value);
  if (Array.isArray(value)) return value.map((entry) => toJsonSafeValue(entry));
  if (value === null || typeof value !== 'object') return value;

  const snapshot: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    snapshot[key] = toJsonSafeValue(entry);
  }
  return snapshot;
}

function toJsonSafeCanonicalSnapshot(document: CatalogDocument): CatalogDocument {
  return toJsonSafeValue(document) as CatalogDocument;
}

/** Validates and serializes one complete authored snapshot in the explicit JSON-safe canonical representation. */
export function serializeCanonicalSnapshot(document: CatalogDocument): string {
  const canonical = parseCanonicalSnapshot(document);
  return JSON.stringify(canonical);
}

/**
 * Loads a current-schema canonical snapshot from JSON text or an already-decoded persistence payload,
 * representing optional authored values that are undefined by property absence.
 * Unsupported authored schema versions fail before canonical parsing so they cannot be mistaken for corrupt v1 data.
 */
export function parseCanonicalSnapshot(payload: unknown): CatalogDocument {
  const decoded = decodePersistedPayload(payload);
  inspectSupportedSchemaVersion(decoded);
  return toJsonSafeCanonicalSnapshot(validateCanonicalDocument(decoded));
}

/** Validates persistence metadata/projection consistency without mutating the authored snapshot. */
export function parsePersistenceEnvelope(input: unknown): CatalogPersistenceEnvelope {
  const parsed = PersistenceEnvelopeWireSchema.safeParse(input);
  if (!parsed.success) {
    throw new PersistenceContractError(
      'INVALID_DOCUMENT',
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    );
  }

  const documentSnapshot = parseCanonicalSnapshot(parsed.data.documentSnapshot);
  const mismatch = (message: string): never => {
    throw new PersistenceContractError('ENVELOPE_MISMATCH', message);
  };

  if (parsed.data.catalogId !== documentSnapshot.id) mismatch('catalogId does not match documentSnapshot.id');
  if (parsed.data.title !== documentSnapshot.title) mismatch('title projection does not match documentSnapshot.title');
  if (parsed.data.locale !== documentSnapshot.locale) mismatch('locale projection does not match documentSnapshot.locale');
  if (parsed.data.documentSchemaVersion !== documentSnapshot.schemaVersion) {
    mismatch('documentSchemaVersion does not match documentSnapshot.schemaVersion');
  }
  const origin = parsed.data.origin
    ? {
        originKind: parsed.data.origin.originKind,
        ...(parsed.data.origin.originId === undefined ? {} : { originId: parsed.data.origin.originId }),
        ...(parsed.data.origin.originRevision === undefined
          ? {}
          : { originRevision: toJsonSafeNumber(parsed.data.origin.originRevision) }),
      }
    : undefined;

  return {
    catalogId: parsed.data.catalogId,
    remoteRevision: toJsonSafeNumber(parsed.data.remoteRevision),
    lastMutationId: parsed.data.lastMutationId,
    title: parsed.data.title,
    locale: parsed.data.locale,
    createdAt: parsed.data.createdAt,
    updatedAt: parsed.data.updatedAt,
    createdBy: parsed.data.createdBy,
    updatedBy: parsed.data.updatedBy,
    archivedAt: parsed.data.archivedAt,
    ...(origin ? { origin } : {}),
    documentSchemaVersion: CURRENT_PERSISTED_DOCUMENT_SCHEMA_VERSION,
    documentSnapshot,
  };
}

export function persistenceHandleFromEnvelope(envelope: CatalogPersistenceEnvelope): CatalogPersistenceHandle {
  return {
    catalogId: envelope.catalogId,
    remoteRevision: toJsonSafeNumber(envelope.remoteRevision),
    lastMutationId: envelope.lastMutationId,
  };
}

/** Reports durable-root compatibility while preserving valid canonical non-UUID identities unchanged. */
export function checkCatalogRootPersistenceCompatibility(
  document: CatalogDocument
): CatalogRootPersistenceCompatibility {
  const canonical = parseCanonicalSnapshot(document);
  return CANONICAL_PERSISTENCE_UUID_PATTERN.test(canonical.id)
    ? { compatible: true, catalogId: canonical.id }
    : { compatible: false, catalogId: canonical.id, reason: 'ROOT_ID_NOT_UUID_COMPATIBLE' };
}
