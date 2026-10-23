import {
  ARSENAL_LIMITS,
  ARSENAL_PAYLOAD_SCHEMA_VERSION,
  ArsenalPresetIdSchema,
  isBuiltinArsenalPresetId,
  isTeamArsenalPresetId,
  parseArsenalPreset,
  parseArsenalPresetDraft,
  type ArsenalPreset,
  type ArsenalPresetDraft,
  type ArsenalPresetSummary,
  type ArsenalRole,
} from './contracts';
import type {
  ArsenalListQuery,
  ArsenalPresetPatch,
  ArsenalRepository,
  ArsenalRepositoryErrorCode,
  ArsenalResult,
  CreateArsenalPresetRequest,
  DeleteArsenalPresetCasRequest,
  UpdateArsenalPresetCasRequest,
} from './repository';

/**
 * Reference implementation of `ArsenalRepository` in memory: the same rules as migration 00031, used by the
 * contract suite, by the gallery slice's tests and as an offline stand-in. Not a cache of the real store.
 */

export interface ArsenalMemoryActor {
  readonly userId: string;
  readonly role: ArsenalRole;
  readonly name?: string;
}

export interface ArsenalMemoryStoreOptions {
  readonly builtins?: readonly ArsenalPreset[];
  readonly now?: () => string;
}

export interface ArsenalMemoryStore {
  /** A repository acting as this person over the shared store. */
  as(actor: ArsenalMemoryActor): ArsenalRepository;
}

interface StoredPreset {
  preset: ArsenalPreset;
  lastMutationId: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

interface StoredUsage {
  useCount: number;
  lastUsedAt: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PATCH_KEYS = new Set(['name', 'category', 'description', 'tags', 'synonyms', 'payload']);

const ok = <T>(value: T): ArsenalResult<T> => ({ ok: true, value });
const fail = <T>(code: ArsenalRepositoryErrorCode, message?: string): ArsenalResult<T> =>
  ({ ok: false, error: { code, ...(message === undefined ? {} : { message }) } });

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** JSON with sorted keys, so two equal payloads compare equal whatever the key order (like `jsonb` equality). */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

type ContentFields = Pick<ArsenalPresetDraft, 'kind' | 'name' | 'category' | 'description' | 'tags' | 'synonyms' | 'payload'>
  & { readonly origin: string };

/** What a replay must repeat exactly (the database compares the same columns). */
function contentKey(content: ContentFields): string {
  const { kind, origin, name, category, description, tags, synonyms, payload } = content;
  return canonicalJson({ kind, origin, name, category, description, tags, synonyms, payload });
}

function summaryOf(preset: ArsenalPreset): ArsenalPresetSummary {
  const { payload: _payload, ...summary } = preset;
  return clone(summary);
}

function validMutation(request: { mutationId: string; expectedRevision?: number }): boolean {
  if (!UUID_PATTERN.test(request.mutationId)) return false;
  return request.expectedRevision === undefined
    || (Number.isSafeInteger(request.expectedRevision) && request.expectedRevision >= 1);
}

export function createInMemoryArsenalStore(options: ArsenalMemoryStoreOptions = {}): ArsenalMemoryStore {
  const now = options.now ?? (() => new Date().toISOString());
  const builtins = new Map<string, ArsenalPreset>();
  for (const builtin of options.builtins ?? []) {
    const parsed = parseArsenalPreset(builtin);
    if (!parsed.ok || parsed.value.scope !== 'builtin') {
      throw new Error(`ARSENAL_BUILTIN_INVALID: ${builtin.id}`);
    }
    if (builtins.has(builtin.id)) throw new Error(`ARSENAL_BUILTIN_DUPLICATE: ${builtin.id}`);
    builtins.set(builtin.id, clone(parsed.value));
  }
  const rows = new Map<string, StoredPreset>();
  const usage = new Map<string, StoredUsage>();

  const withUsage = (preset: ArsenalPreset): ArsenalPreset => {
    const used = usage.get(preset.id);
    return clone({ ...preset, useCount: used?.useCount ?? 0, lastUsedAt: used?.lastUsedAt ?? null });
  };

  const visible = (id: string): ArsenalPreset | undefined => {
    const builtin = builtins.get(id);
    if (builtin) return withUsage(builtin);
    const row = rows.get(id);
    return row && row.deletedAt === null ? withUsage(row.preset) : undefined;
  };

  const as = (actor: ArsenalMemoryActor): ArsenalRepository => {
    const authorized = actor.userId.length > 0 && (actor.role === 'admin' || actor.role === 'editor');
    const mayManage = (preset: ArsenalPreset) => actor.role === 'admin' || preset.createdBy === actor.userId;

    /** Shared checks of update/delete: auth, ids, built-in and existence (authorship is checked by each call). */
    const locate = (
      request: { presetId: string; mutationId: string; expectedRevision: number },
    ): { ok: true; row: StoredPreset } | { ok: false; result: ArsenalResult<never> } => {
      if (!authorized) return { ok: false, result: fail('UNAUTHORIZED') };
      if (isBuiltinArsenalPresetId(request.presetId)) return { ok: false, result: fail('READ_ONLY', request.presetId) };
      if (!isTeamArsenalPresetId(request.presetId) || !validMutation(request)) {
        return { ok: false, result: fail('INVALID_REQUEST') };
      }
      const row = rows.get(request.presetId);
      if (!row) return { ok: false, result: fail('NOT_FOUND', request.presetId) };
      return { ok: true, row };
    };

    return {
      async list(query: ArsenalListQuery = {}) {
        if (!authorized) return fail('UNAUTHORIZED');
        const all = [
          ...[...builtins.values()].map(withUsage),
          ...[...rows.values()].filter((row) => row.deletedAt === null).map((row) => withUsage(row.preset)),
        ];
        return ok(all
          .filter((preset) => query.kind === undefined || preset.kind === query.kind)
          .filter((preset) => query.category === undefined || preset.category === query.category)
          .map(summaryOf));
      },

      async getMany(presetIds: readonly string[]) {
        if (!authorized) return fail('UNAUTHORIZED');
        if (presetIds.length > ARSENAL_LIMITS.getManyMax
          || presetIds.some((id) => !ArsenalPresetIdSchema.safeParse(id).success)) {
          return fail('INVALID_REQUEST');
        }
        const found: ArsenalPreset[] = [];
        for (const id of new Set(presetIds)) {
          const preset = visible(id);
          if (preset && preset.payloadSchemaVersion === ARSENAL_PAYLOAD_SCHEMA_VERSION) found.push(preset);
        }
        return ok(found);
      },

      async create(request: CreateArsenalPresetRequest) {
        if (!authorized) return fail('UNAUTHORIZED');
        if (!isTeamArsenalPresetId(request.presetId) || !validMutation(request)) return fail('INVALID_REQUEST');
        const parsed = parseArsenalPresetDraft(request.draft);
        if (!parsed.ok) return fail(parsed.code, parsed.issues[0]?.code);
        const draft = parsed.value;
        const existing = rows.get(request.presetId);
        if (existing) {
          if (existing.lastMutationId !== request.mutationId) return fail('DUPLICATE', request.presetId);
          if (existing.preset.revision !== 1) return fail('CONFLICT', 'mutation is no longer latest');
          const same = existing.preset.createdBy === actor.userId && contentKey(existing.preset) === contentKey(draft);
          return same ? ok(withUsage(existing.preset)) : fail('MUTATION_REUSE');
        }
        const at = now();
        const preset: ArsenalPreset = {
          id: request.presetId,
          scope: 'team',
          origin: draft.origin,
          kind: draft.kind,
          name: draft.name,
          category: draft.category,
          ...(draft.description === undefined ? {} : { description: draft.description }),
          tags: draft.tags,
          synonyms: draft.synonyms,
          payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
          payload: draft.payload,
          payloadBytes: new TextEncoder().encode(JSON.stringify(draft.payload)).length,
          revision: 1,
          createdBy: actor.userId,
          createdByName: actor.name ?? null,
          createdAt: at,
          updatedAt: at,
          useCount: 0,
          lastUsedAt: null,
        };
        rows.set(preset.id, { preset: clone(preset), lastMutationId: request.mutationId, deletedAt: null, deletedBy: null });
        return ok(withUsage(preset));
      },

      async updateCAS(request: UpdateArsenalPresetCasRequest) {
        const located = locate(request);
        if (!located.ok) return located.result;
        const { row } = located;
        const patch: ArsenalPresetPatch = request.patch ?? {};
        const keys = Object.keys(patch).filter((key) => (patch as Record<string, unknown>)[key] !== undefined);
        if (keys.length === 0 || keys.some((key) => !PATCH_KEYS.has(key))) return fail('INVALID_REQUEST', 'patch');
        if (row.deletedAt !== null) return fail('NOT_FOUND', request.presetId);
        if (!mayManage(row.preset)) return fail('FORBIDDEN', request.presetId);

        const { description: patchDescription, ...patchRest } = patch;
        const current = row.preset;
        const merged = {
          kind: current.kind,
          origin: current.origin,
          name: current.name,
          category: current.category,
          tags: current.tags,
          synonyms: current.synonyms,
          payload: current.payload,
          ...(current.description === undefined ? {} : { description: current.description }),
          ...patchRest,
          payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
        } as Record<string, unknown>;
        if (patchDescription === null) delete merged.description;
        else if (patchDescription !== undefined) merged.description = patchDescription;

        if (row.lastMutationId === request.mutationId) {
          const replay = row.preset.revision === request.expectedRevision + 1
            && contentKey(merged as unknown as ContentFields) === contentKey(current);
          return replay ? ok(withUsage(row.preset)) : fail('MUTATION_REUSE');
        }
        if (row.preset.revision !== request.expectedRevision) {
          return fail('CONFLICT', `expected revision ${request.expectedRevision}, current revision ${row.preset.revision}`);
        }
        if (patch.payload !== undefined && patch.payload.kind !== row.preset.kind) {
          return fail('INVALID_PRESET', 'ARSENAL_PAYLOAD_KIND_MISMATCH');
        }
        const parsed = parseArsenalPresetDraft(merged);
        if (!parsed.ok) return fail(parsed.code, parsed.issues[0]?.code);
        const draft = parsed.value;
        const { description: _oldDescription, ...base } = row.preset;
        const next: ArsenalPreset = {
          ...base,
          name: draft.name,
          category: draft.category,
          ...(draft.description === undefined ? {} : { description: draft.description }),
          tags: draft.tags,
          synonyms: draft.synonyms,
          payload: draft.payload,
          payloadBytes: new TextEncoder().encode(JSON.stringify(draft.payload)).length,
          revision: row.preset.revision + 1,
          updatedAt: now(),
        };
        row.preset = clone(next);
        row.lastMutationId = request.mutationId;
        return ok(withUsage(next));
      },

      async deleteCAS(request: DeleteArsenalPresetCasRequest) {
        const located = locate(request);
        if (!located.ok) return located.result;
        const { row } = located;
        if (row.deletedAt !== null) {
          return row.lastMutationId === request.mutationId && row.preset.revision === request.expectedRevision + 1
            && row.deletedBy === actor.userId
            ? ok({ presetId: row.preset.id, revision: row.preset.revision })
            : fail('NOT_FOUND', request.presetId);
        }
        if (!mayManage(row.preset)) return fail('FORBIDDEN', request.presetId);
        if (row.lastMutationId === request.mutationId) return fail('MUTATION_REUSE');
        if (row.preset.revision !== request.expectedRevision) {
          return fail('CONFLICT', `expected revision ${request.expectedRevision}, current revision ${row.preset.revision}`);
        }
        const at = now();
        row.preset = { ...row.preset, revision: row.preset.revision + 1, updatedAt: at };
        row.lastMutationId = request.mutationId;
        row.deletedAt = at;
        row.deletedBy = actor.userId;
        return ok({ presetId: row.preset.id, revision: row.preset.revision });
      },

      async recordUse(presetId: string) {
        if (!authorized) return fail('UNAUTHORIZED');
        if (!ArsenalPresetIdSchema.safeParse(presetId).success) return fail('INVALID_REQUEST');
        if (!visible(presetId)) return fail('NOT_FOUND', presetId);
        const at = now();
        const next = { useCount: (usage.get(presetId)?.useCount ?? 0) + 1, lastUsedAt: at };
        usage.set(presetId, next);
        return ok({ presetId, ...next });
      },
    };
  };

  return { as };
}
