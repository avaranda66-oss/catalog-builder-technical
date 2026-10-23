import type {
  ArsenalCategory,
  ArsenalPayload,
  ArsenalPreset,
  ArsenalPresetDraft,
  ArsenalPresetKind,
  ArsenalPresetMetadata,
  ArsenalPresetSummary,
} from './contracts';

/**
 * Onda 4.5 — storage contract of the arsenal (ADR-arsenal §6). The persistence slice implements it over the RPCs of
 * migration 00031 and must pass `tests/vnext/arsenal/contract/arsenal-repository.contract.ts`;
 * `createInMemoryArsenalStore` is the reference implementation of the same rules.
 *
 * Built-ins (scope `builtin`) are listed and loaded through the same repository, never written. Insertion is not a
 * repository concern: after a successful insertion the caller records the use with `recordUse`.
 */

export const ARSENAL_REPOSITORY_ERROR_CODES = [
  /** Missing, deleted, or not visible to this person. */
  'NOT_FOUND',
  /** Not signed in, inactive, or not an admin/editor. */
  'UNAUTHORIZED',
  /** An editor changing someone else's preset. */
  'FORBIDDEN',
  /** A built-in preset: never renamed, changed or deleted. */
  'READ_ONLY',
  /** Expected revision is not the current one (someone saved first), or the mutation is no longer the latest. */
  'CONFLICT',
  /** `create` with an id that already exists under another mutation. */
  'DUPLICATE',
  /** The same mutation id sent again with different content. */
  'MUTATION_REUSE',
  'INVALID_PRESET',
  'INVALID_REQUEST',
  'UNSUPPORTED_VERSION',
  'TOO_LARGE',
  'OFFLINE',
  'REMOTE_FAILURE',
  /** The request may or may not have been applied; retry with the same mutation id. */
  'AMBIGUOUS_COMMIT_OUTCOME',
] as const;

export type ArsenalRepositoryErrorCode = (typeof ARSENAL_REPOSITORY_ERROR_CODES)[number];

export interface ArsenalRepositoryError {
  readonly code: ArsenalRepositoryErrorCode;
  readonly message?: string;
}

export type ArsenalResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ArsenalRepositoryError };

export interface ArsenalListQuery {
  readonly kind?: ArsenalPresetKind;
  readonly category?: ArsenalCategory;
}

export interface CreateArsenalPresetRequest {
  /** Client-generated canonical lowercase UUID, so a retry after a lost answer is idempotent. */
  readonly presetId: string;
  readonly mutationId: string;
  readonly draft: ArsenalPresetDraft;
}

/**
 * Fields a person may change. `kind` and `origin` never change. `description: null` clears it. A new `payload`
 * must keep the kind (re-saving a header from a new selection).
 */
export type ArsenalPresetPatch = Partial<Pick<ArsenalPresetMetadata, 'name' | 'category' | 'tags' | 'synonyms'>> & {
  readonly description?: string | null;
  readonly payload?: ArsenalPayload;
};

export interface UpdateArsenalPresetCasRequest {
  readonly presetId: string;
  readonly expectedRevision: number;
  readonly mutationId: string;
  readonly patch: ArsenalPresetPatch;
}

export interface DeleteArsenalPresetCasRequest {
  readonly presetId: string;
  readonly expectedRevision: number;
  readonly mutationId: string;
}

export interface ArsenalPresetHandle {
  readonly presetId: string;
  readonly revision: number;
}

export interface ArsenalUsage {
  readonly presetId: string;
  readonly useCount: number;
  readonly lastUsedAt: string;
}

export interface ArsenalRepository {
  /**
   * Built-ins and team presets that are not deleted, without payloads. No order is promised: the gallery sorts.
   * Items with a newer `payloadSchemaVersion` are listed (the gallery greys them out).
   */
  list(query?: ArsenalListQuery): Promise<ArsenalResult<readonly ArsenalPresetSummary[]>>;
  /**
   * Full presets for up to `ARSENAL_LIMITS.getManyMax` ids (thumbnails and insertion), in the order asked.
   * Unknown, deleted and newer-version ids are left out; a malformed id or too many ids is INVALID_REQUEST.
   */
  getMany(presetIds: readonly string[]): Promise<ArsenalResult<readonly ArsenalPreset[]>>;
  /** Validates the draft before any network call. Result: revision 1, author = the person, use count 0. */
  create(request: CreateArsenalPresetRequest): Promise<ArsenalResult<ArsenalPreset>>;
  /** Author or admin. Revision + 1; replaying the latest mutation returns the same preset. */
  updateCAS(request: UpdateArsenalPresetCasRequest): Promise<ArsenalResult<ArsenalPreset>>;
  /** Author or admin. Soft delete: the preset leaves the gallery; revision + 1. */
  deleteCAS(request: DeleteArsenalPresetCasRequest): Promise<ArsenalResult<ArsenalPresetHandle>>;
  /** Any admin/editor, built-ins included. Does not change the preset revision. */
  recordUse(presetId: string): Promise<ArsenalResult<ArsenalUsage>>;
}

/** Built-in presets (PRESYS models in code), read-only. The persistence slice merges them into `list`/`getMany`. */
export interface ArsenalBuiltinSource {
  list(): readonly ArsenalPreset[];
}

/**
 * RPC names of migration 00031 (a test checks that the migration defines each one). Wire shapes:
 * - list(p_kind?, p_category?) → `{ presets: ArsenalPresetSummary[] (team only), builtinUsage: ArsenalUsage[] }`
 * - getMany(p_preset_ids: UUID[] ≤ 50) → `ArsenalPreset[]` (team only; built-ins come from `ArsenalBuiltinSource`)
 * - create(p_preset_id, p_mutation_id, p_preset: ArsenalPresetDraft) → `ArsenalPreset`
 * - updateCAS(p_preset_id, p_expected_revision, p_mutation_id, p_patch: ArsenalPresetPatch) → `ArsenalPreset`
 * - deleteCAS(p_preset_id, p_expected_revision, p_mutation_id) → `ArsenalPresetHandle`
 * - recordUse(p_preset_key: UUID | `builtin:<slug>`) → `ArsenalUsage`
 * Team envelopes come in client keys and parse as they are with `parseArsenalPresetSummary` / `parseArsenalPreset`.
 */
export const ARSENAL_RPC = Object.freeze({
  list: 'list_vnext_presets_v1',
  getMany: 'get_vnext_presets_v1',
  create: 'create_vnext_preset_v1',
  updateCAS: 'update_vnext_preset_cas_v1',
  deleteCAS: 'delete_vnext_preset_cas_v1',
  recordUse: 'record_vnext_preset_use_v1',
});

/**
 * Message prefixes raised by migration 00031 (and by `require_document_editor_v1`) and the repository code each one
 * means. A test checks that every prefix the migration raises is mapped here.
 */
export const ARSENAL_SERVER_ERROR_PREFIXES: Readonly<Record<string, ArsenalRepositoryErrorCode>> = Object.freeze({
  VNEXT_NOT_FOUND: 'NOT_FOUND',
  VNEXT_FORBIDDEN: 'FORBIDDEN',
  VNEXT_CONFLICT: 'CONFLICT',
  VNEXT_MUTATION_REPLAY_STALE: 'CONFLICT',
  VNEXT_DUPLICATE_PRESET: 'DUPLICATE',
  VNEXT_MUTATION_REUSE: 'MUTATION_REUSE',
  VNEXT_INVALID_PRESET: 'INVALID_PRESET',
  VNEXT_INVALID_REQUEST: 'INVALID_REQUEST',
  VNEXT_UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
  VNEXT_PRESET_TOO_LARGE: 'TOO_LARGE',
  VNEXT_UNAUTHORIZED: 'UNAUTHORIZED',
  AUTH_ACTOR_NULL: 'UNAUTHORIZED',
  AUTH_ROLE_NULL: 'UNAUTHORIZED',
  AUTH_ROLE_FORBIDDEN: 'UNAUTHORIZED',
});

/** "VNEXT_CONFLICT: expected revision 2, current revision 3" → CONFLICT. Unknown messages are REMOTE_FAILURE. */
export function arsenalErrorCodeFromServerMessage(message: string | null | undefined): ArsenalRepositoryErrorCode {
  const prefix = /^([A-Z_]+):/.exec(message ?? '')?.[1];
  return (prefix !== undefined && ARSENAL_SERVER_ERROR_PREFIXES[prefix]) || 'REMOTE_FAILURE';
}
