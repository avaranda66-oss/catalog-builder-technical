import { z } from 'zod';
import {
  FrameSchema,
  type CatalogDocument,
  type CellContent,
  type Frame,
  type RichText,
} from '@/vnext/domain';
import { CellContentSchema, RichTextSchema } from '@/vnext/domain/editorial-model';
import { parseCanonicalSnapshot } from '@/vnext/persistence/snapshot';

export const CURRENT_RECOVERY_RECORD_FORMAT_VERSION = 1 as const;
export const RECOVERY_DIGEST_ALGORITHM = 'SHA-256' as const;

const clean = z.string().min(1).refine(
  (value) => ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
  'Control character'
);
const canonicalUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const safeNonnegativeInteger = z.number().int().safe().nonnegative();
const safePositiveInteger = z.number().int().safe().positive();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });

export const RecoveryKeySchema = z.object({
  authorityScopeId: clean,
  catalogId: canonicalUuid,
  openSessionId: canonicalUuid,
}).strict();

export type RecoveryKey = z.infer<typeof RecoveryKeySchema>;

const TextRecoveryOverlaySchema = z.object({
  kind: z.literal('TEXT_DRAFT_V1'),
  pageId: clean,
  objectId: clean,
  expectedText: RichTextSchema,
  draft: z.string(),
  compositionWasActive: z.boolean(),
}).strict();

const InspectorRecoveryOverlaySchema = z.object({
  kind: z.literal('INSPECTOR_FRAME_DRAFT_V1'),
  pageId: clean,
  objectId: clean,
  expectedFrame: FrameSchema,
  draft: z.object({
    x: z.string(),
    y: z.string(),
    width: z.string(),
    height: z.string(),
  }).strict(),
}).strict();

const TableCellRecoveryOverlaySchema = z.object({
  kind: z.literal('TABLE_CELL_DRAFT_V1'),
  pageId: clean,
  objectId: clean,
  tableId: clean,
  cellId: clean,
  expectedContent: CellContentSchema,
  activeType: z.enum(['empty', 'richText', 'technicalCode', 'measurement']),
  draft: z.object({
    richText: z.string(),
    technicalCode: z.string(),
    measurement: z.object({
      valueText: z.string(),
      unit: z.string(),
      qualifier: z.enum(['', 'approx', 'min', 'max']),
    }).strict(),
  }).strict(),
  compositionWasActive: z.boolean(),
}).strict();

export const AuthoringRecoveryOverlaySchema = z.discriminatedUnion('kind', [
  TextRecoveryOverlaySchema,
  InspectorRecoveryOverlaySchema,
  TableCellRecoveryOverlaySchema,
]);

export type TextRecoveryOverlay = {
  readonly kind: 'TEXT_DRAFT_V1';
  readonly pageId: string;
  readonly objectId: string;
  readonly expectedText: RichText;
  readonly draft: string;
  readonly compositionWasActive: boolean;
};

export type InspectorRecoveryOverlay = {
  readonly kind: 'INSPECTOR_FRAME_DRAFT_V1';
  readonly pageId: string;
  readonly objectId: string;
  readonly expectedFrame: Frame;
  readonly draft: Readonly<{ x: string; y: string; width: string; height: string }>;
};

export type TableCellRecoveryOverlay = {
  readonly kind: 'TABLE_CELL_DRAFT_V1';
  readonly pageId: string;
  readonly objectId: string;
  readonly tableId: string;
  readonly cellId: string;
  readonly expectedContent: CellContent;
  readonly activeType: 'empty' | 'richText' | 'technicalCode' | 'measurement';
  readonly draft: Readonly<{
    richText: string;
    technicalCode: string;
    measurement: Readonly<{
      valueText: string;
      unit: string;
      qualifier: '' | 'approx' | 'min' | 'max';
    }>;
  }>;
  readonly compositionWasActive: boolean;
};

export type AuthoringRecoveryOverlay = TextRecoveryOverlay | InspectorRecoveryOverlay | TableCellRecoveryOverlay;

const PendingRemoteMutationWireSchema = z.object({
  mutationId: canonicalUuid,
  catalogId: canonicalUuid,
  expectedRemoteRevision: safeNonnegativeInteger,
  previousLastMutationId: canonicalUuid,
  capturedLocalEditSequence: safeNonnegativeInteger,
  attemptedDocumentSnapshot: z.unknown(),
  attemptDigestAlgorithm: z.literal(RECOVERY_DIGEST_ALGORITHM),
  attemptDigest: digest,
}).strict();

export interface PendingRemoteMutation {
  readonly mutationId: string;
  readonly catalogId: string;
  readonly expectedRemoteRevision: number;
  readonly previousLastMutationId: string;
  readonly capturedLocalEditSequence: number;
  readonly attemptedDocumentSnapshot: CatalogDocument;
  readonly attemptDigestAlgorithm: typeof RECOVERY_DIGEST_ALGORITHM;
  readonly attemptDigest: string;
}

const RecoveryRecordWireSchema = z.object({
  recordFormatVersion: safePositiveInteger,
  authorityScopeId: clean,
  catalogId: canonicalUuid,
  openSessionId: canonicalUuid,
  recoveryGeneration: safePositiveInteger,
  localEditSequence: safeNonnegativeInteger,
  baseRemoteRevision: safeNonnegativeInteger,
  baseRemoteSnapshotDigest: digest,
  documentSchemaVersion: safePositiveInteger,
  documentSnapshot: z.unknown(),
  snapshotDigestAlgorithm: z.literal(RECOVERY_DIGEST_ALGORITHM),
  snapshotDigest: digest,
  createdAt: timestamp,
  updatedAt: timestamp,
  pendingRemoteMutation: PendingRemoteMutationWireSchema.optional(),
  authoringRecoveryOverlay: AuthoringRecoveryOverlaySchema.optional(),
}).strict();

export interface RecoveryRecord extends RecoveryKey {
  readonly recordFormatVersion: typeof CURRENT_RECOVERY_RECORD_FORMAT_VERSION;
  readonly recoveryGeneration: number;
  readonly localEditSequence: number;
  readonly baseRemoteRevision: number;
  readonly baseRemoteSnapshotDigest: string;
  readonly documentSchemaVersion: 1;
  readonly documentSnapshot: CatalogDocument;
  readonly snapshotDigestAlgorithm: typeof RECOVERY_DIGEST_ALGORITHM;
  readonly snapshotDigest: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly pendingRemoteMutation?: PendingRemoteMutation;
  readonly authoringRecoveryOverlay?: AuthoringRecoveryOverlay;
}

export type RecoveryRecordErrorCode =
  | 'INVALID_RECORD'
  | 'UNSUPPORTED_RECORD_VERSION'
  | 'UNSUPPORTED_DOCUMENT_VERSION'
  | 'IDENTITY_MISMATCH'
  | 'DIGEST_MISMATCH';

export class RecoveryRecordError extends Error {
  constructor(public readonly code: RecoveryRecordErrorCode, message: string) {
    super(message);
    this.name = 'RecoveryRecordError';
  }
}

export function parseRecoveryKey(input: unknown): RecoveryKey {
  const parsed = RecoveryKeySchema.safeParse(input);
  if (!parsed.success) throw new RecoveryRecordError('INVALID_RECORD', parsed.error.message);
  return parsed.data;
}

export function recoveryKeyOf(record: RecoveryKey): RecoveryKey {
  return {
    authorityScopeId: record.authorityScopeId,
    catalogId: record.catalogId,
    openSessionId: record.openSessionId,
  };
}

/** JSON tuple encoding is collision-free and is not the persisted IndexedDB key authority. */
export function recoveryKeyToken(key: RecoveryKey): string {
  const parsed = parseRecoveryKey(key);
  return JSON.stringify([parsed.authorityScopeId, parsed.catalogId, parsed.openSessionId]);
}

export function parseRecoveryRecord(input: unknown, expectedKey?: RecoveryKey): RecoveryRecord {
  const wire = RecoveryRecordWireSchema.safeParse(input);
  if (!wire.success) throw new RecoveryRecordError('INVALID_RECORD', wire.error.message);
  if (wire.data.recordFormatVersion !== CURRENT_RECOVERY_RECORD_FORMAT_VERSION) {
    throw new RecoveryRecordError(
      'UNSUPPORTED_RECORD_VERSION',
      `Unsupported recovery record version: ${wire.data.recordFormatVersion}`
    );
  }

  let documentSnapshot: CatalogDocument;
  let attemptedDocumentSnapshot: CatalogDocument | undefined;
  try {
    documentSnapshot = parseCanonicalSnapshot(wire.data.documentSnapshot);
    attemptedDocumentSnapshot = wire.data.pendingRemoteMutation
      ? parseCanonicalSnapshot(wire.data.pendingRemoteMutation.attemptedDocumentSnapshot)
      : undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.includes('Unsupported document schemaVersion')
      ? 'UNSUPPORTED_DOCUMENT_VERSION'
      : 'INVALID_RECORD';
    throw new RecoveryRecordError(code, message);
  }

  const key = recoveryKeyOf(wire.data);
  if (expectedKey && recoveryKeyToken(key) !== recoveryKeyToken(expectedKey)) {
    throw new RecoveryRecordError('IDENTITY_MISMATCH', 'Stored key does not match embedded recovery identity');
  }
  if (documentSnapshot.id !== wire.data.catalogId) {
    throw new RecoveryRecordError('IDENTITY_MISMATCH', 'documentSnapshot.id does not match catalogId');
  }
  if (wire.data.documentSchemaVersion !== documentSnapshot.schemaVersion) {
    throw new RecoveryRecordError('UNSUPPORTED_DOCUMENT_VERSION', 'documentSchemaVersion does not match snapshot');
  }
  if (
    wire.data.pendingRemoteMutation
    && (
      wire.data.pendingRemoteMutation.catalogId !== wire.data.catalogId
      || attemptedDocumentSnapshot?.id !== wire.data.catalogId
    )
  ) {
    throw new RecoveryRecordError('IDENTITY_MISMATCH', 'Pending mutation catalog identity mismatch');
  }

  const pendingRemoteMutation: PendingRemoteMutation | undefined = wire.data.pendingRemoteMutation && attemptedDocumentSnapshot
    ? {
        mutationId: wire.data.pendingRemoteMutation.mutationId,
        catalogId: wire.data.pendingRemoteMutation.catalogId,
        expectedRemoteRevision: wire.data.pendingRemoteMutation.expectedRemoteRevision,
        previousLastMutationId: wire.data.pendingRemoteMutation.previousLastMutationId,
        capturedLocalEditSequence: wire.data.pendingRemoteMutation.capturedLocalEditSequence,
        attemptedDocumentSnapshot,
        attemptDigestAlgorithm: wire.data.pendingRemoteMutation.attemptDigestAlgorithm,
        attemptDigest: wire.data.pendingRemoteMutation.attemptDigest,
      }
    : undefined;
  return {
    recordFormatVersion: CURRENT_RECOVERY_RECORD_FORMAT_VERSION,
    authorityScopeId: wire.data.authorityScopeId,
    catalogId: wire.data.catalogId,
    openSessionId: wire.data.openSessionId,
    recoveryGeneration: wire.data.recoveryGeneration,
    localEditSequence: wire.data.localEditSequence,
    baseRemoteRevision: wire.data.baseRemoteRevision,
    baseRemoteSnapshotDigest: wire.data.baseRemoteSnapshotDigest,
    documentSchemaVersion: documentSnapshot.schemaVersion,
    documentSnapshot,
    snapshotDigestAlgorithm: wire.data.snapshotDigestAlgorithm,
    snapshotDigest: wire.data.snapshotDigest,
    createdAt: wire.data.createdAt,
    updatedAt: wire.data.updatedAt,
    ...(pendingRemoteMutation ? { pendingRemoteMutation } : {}),
    ...(wire.data.authoringRecoveryOverlay
      ? { authoringRecoveryOverlay: wire.data.authoringRecoveryOverlay as AuthoringRecoveryOverlay }
      : {}),
  };
}
