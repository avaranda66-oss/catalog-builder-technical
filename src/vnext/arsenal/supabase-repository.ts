import { z } from 'zod';
import type {
  VNextPersistenceRpcClient,
  VNextPersistenceRpcError,
} from '../persistence/supabase-repository';
import {
  ARSENAL_LIMITS,
  ARSENAL_PAYLOAD_SCHEMA_VERSION,
  ArsenalCategorySchema,
  ArsenalPayloadSchema,
  ArsenalPresetIdSchema,
  ArsenalPresetKindSchema,
  ArsenalPresetMetadataSchema,
  isBuiltinArsenalPresetId,
  isTeamArsenalPresetId,
  parseArsenalPreset,
  parseArsenalPresetDraft,
  parseArsenalPresetSummary,
  validateArsenalPayload,
  type ArsenalPreset,
  type ArsenalPresetSummary,
} from './contracts';
import {
  ARSENAL_RPC,
  arsenalErrorCodeFromServerMessage,
  type ArsenalBuiltinSource,
  type ArsenalListQuery,
  type ArsenalPresetHandle,
  type ArsenalPresetPatch,
  type ArsenalRepository,
  type ArsenalRepositoryErrorCode,
  type ArsenalResult,
  type ArsenalUsage,
  type CreateArsenalPresetRequest,
  type DeleteArsenalPresetCasRequest,
  type UpdateArsenalPresetCasRequest,
} from './repository';

/**
 * Onda 4.5 — `ArsenalRepository` over the RPCs of migration 00031 (ADR-arsenal §6), in the pattern of
 * `SupabaseCatalogRepository`: every request is checked before the network, the answer is parsed before it is
 * trusted, and a write whose answer was lost says AMBIGUOUS_COMMIT_OUTCOME (retry with the same mutation id).
 *
 * The PRESYS built-ins live in code (`ArsenalBuiltinSource`): they are merged into `list`/`getMany` here and never
 * written. The server only counts their use (`builtinUsage`).
 */

export interface SupabaseArsenalRepositoryOptions {
  /** Read-only PRESYS models listed next to the team presets. */
  readonly builtins?: ArsenalBuiltinSource;
  /** Known offline before dispatch: answer OFFLINE without calling the server. */
  readonly isOffline?: () => boolean;
}

type OperationKind = 'read' | 'mutation' | 'usage';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PATCH_KEYS = new Set(['name', 'category', 'description', 'tags', 'synonyms', 'payload']);

const UsageSchema = z.object({
  presetId: ArsenalPresetIdSchema,
  useCount: z.number().int().safe().nonnegative(),
  lastUsedAt: z.string().min(1),
}).strict();

const ListResponseSchema = z.object({
  presets: z.array(z.unknown()),
  builtinUsage: z.array(z.unknown()),
}).strict();

const HandleSchema = z.object({
  presetId: z.string().regex(UUID_PATTERN),
  revision: z.number().int().safe().min(1),
}).strict();

const PatchFieldSchemas = Object.freeze({
  name: ArsenalPresetMetadataSchema.shape.name,
  category: ArsenalCategorySchema,
  description: ArsenalPresetMetadataSchema.shape.description.unwrap().nullable(),
  tags: ArsenalPresetMetadataSchema.shape.tags,
  synonyms: ArsenalPresetMetadataSchema.shape.synonyms,
});

class ResponseShapeError extends Error {}

function ok<T>(value: T): ArsenalResult<T> {
  return { ok: true, value };
}

function fail<T>(code: ArsenalRepositoryErrorCode, message?: string): ArsenalResult<T> {
  return { ok: false, error: message === undefined ? { code } : { code, message } };
}

function rpcMessage(error: VNextPersistenceRpcError): string {
  return [error.message, error.details, error.hint].filter((part): part is string => Boolean(part)).join(' | ');
}

const TRANSPORT_ERROR_CODES = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EHOSTUNREACH', 'ENETUNREACH', 'ENETDOWN',
  'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'ABORT_ERR',
]);

function isTransportLike(error: VNextPersistenceRpcError): boolean {
  const code = error.code?.toUpperCase();
  if (code && TRANSPORT_ERROR_CODES.has(code)) return true;
  return /failed to fetch|network|timeout|timed out|connection|econn|abort/.test(rpcMessage(error).toLowerCase());
}

/** A server error as a repository code; a lost answer to a write is ambiguous, never a plain failure. */
export function arsenalErrorCodeFromRpcError(
  error: VNextPersistenceRpcError,
  kind: OperationKind = 'read',
): ArsenalRepositoryErrorCode {
  const byPrefix = arsenalErrorCodeFromServerMessage(error.message);
  if (byPrefix !== 'REMOTE_FAILURE') return byPrefix;
  const code = error.code?.toUpperCase();
  // 42501 without our prefix: EXECUTE revoked (anon). PGRST301/303: expired or invalid session token.
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST303' || /\bjwt\b/i.test(rpcMessage(error))) {
    return 'UNAUTHORIZED';
  }
  if (isTransportLike(error)) return kind === 'mutation' ? 'AMBIGUOUS_COMMIT_OUTCOME' : 'REMOTE_FAILURE';
  return 'REMOTE_FAILURE';
}

function validMutation(mutationId: string, expectedRevision?: number): boolean {
  if (!UUID_PATTERN.test(mutationId)) return false;
  return expectedRevision === undefined
    || (Number.isSafeInteger(expectedRevision) && expectedRevision >= 1);
}

/** Checks each field of a patch on its own (the server merges it with the stored preset and checks the whole). */
function checkPatch(patch: ArsenalPresetPatch | undefined): ArsenalResult<Record<string, unknown>> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('INVALID_REQUEST', 'patch');
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0 || entries.some(([key]) => !PATCH_KEYS.has(key))) return fail('INVALID_REQUEST', 'patch');
  const wire: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (key === 'payload') {
      const parsed = ArsenalPayloadSchema.safeParse(value);
      if (!parsed.success) return fail('INVALID_PRESET', 'payload');
      const issues = validateArsenalPayload(parsed.data);
      if (issues.length > 0) {
        const tooLarge = issues.some((issue) => issue.code === 'ARSENAL_PAYLOAD_TOO_LARGE');
        return fail(tooLarge ? 'TOO_LARGE' : 'INVALID_PRESET', issues[0].code);
      }
      wire.payload = parsed.data;
      continue;
    }
    const schema = PatchFieldSchemas[key as keyof typeof PatchFieldSchemas];
    const parsed = schema.safeParse(value);
    if (!parsed.success) return fail('INVALID_PRESET', key);
    wire[key] = parsed.data;
  }
  return ok(wire);
}

export class SupabaseArsenalRepository implements ArsenalRepository {
  private readonly isOffline: () => boolean;
  private readonly builtinSource: ArsenalBuiltinSource;
  private builtinCache: ReadonlyMap<string, ArsenalPreset> | undefined;
  /** Use counts of the built-ins from the latest list or recordUse (the server keeps the real numbers). */
  private readonly builtinUsage = new Map<string, ArsenalUsage>();

  constructor(
    private readonly client: VNextPersistenceRpcClient,
    options: SupabaseArsenalRepositoryOptions = {},
  ) {
    this.isOffline = options.isOffline ?? (() => typeof navigator !== 'undefined' && navigator.onLine === false);
    this.builtinSource = options.builtins ?? { list: () => [] };
  }

  private builtins(): ReadonlyMap<string, ArsenalPreset> {
    if (!this.builtinCache) {
      const byId = new Map<string, ArsenalPreset>();
      for (const preset of this.builtinSource.list()) {
        if (preset.scope === 'builtin' && isBuiltinArsenalPresetId(preset.id) && !byId.has(preset.id)) {
          byId.set(preset.id, preset);
        }
      }
      this.builtinCache = byId;
    }
    return this.builtinCache;
  }

  private builtinWithUsage(preset: ArsenalPreset): ArsenalPreset {
    const usage = this.builtinUsage.get(preset.id);
    return { ...preset, useCount: usage?.useCount ?? 0, lastUsedAt: usage?.lastUsedAt ?? null };
  }

  private async call<T>(
    functionName: string,
    args: Record<string, unknown>,
    kind: OperationKind,
    parse: (data: unknown) => ArsenalResult<T>,
  ): Promise<ArsenalResult<T>> {
    if (this.isOffline()) return fail('OFFLINE', 'O servidor está fora de alcance (sem internet).');
    let response;
    try {
      response = await this.client.rpc(functionName, args);
    } catch (error) {
      return fail(kind === 'mutation' ? 'AMBIGUOUS_COMMIT_OUTCOME' : 'REMOTE_FAILURE',
        error instanceof Error ? error.message : String(error));
    }
    if (response.error) return fail(arsenalErrorCodeFromRpcError(response.error, kind), rpcMessage(response.error));
    if (response.data === null || response.data === undefined) {
      return fail('REMOTE_FAILURE', `${functionName} returned no payload`);
    }
    try {
      return parse(response.data);
    } catch (error) {
      return fail('REMOTE_FAILURE', error instanceof Error ? error.message : String(error));
    }
  }

  async list(query: ArsenalListQuery = {}): Promise<ArsenalResult<readonly ArsenalPresetSummary[]>> {
    if (query.kind !== undefined && !ArsenalPresetKindSchema.safeParse(query.kind).success) return fail('INVALID_REQUEST', 'kind');
    if (query.category !== undefined && !ArsenalCategorySchema.safeParse(query.category).success) {
      return fail('INVALID_REQUEST', 'category');
    }
    return this.call(ARSENAL_RPC.list, { p_kind: query.kind ?? null, p_category: query.category ?? null }, 'read', (data) => {
      const envelope = ListResponseSchema.parse(data);
      for (const entry of envelope.builtinUsage) {
        const usage = UsageSchema.safeParse(entry);
        if (usage.success && isBuiltinArsenalPresetId(usage.data.presetId)) this.builtinUsage.set(usage.data.presetId, usage.data);
      }
      const team: ArsenalPresetSummary[] = [];
      const seen = new Set<string>();
      // A malformed row is left out instead of hiding the whole arsenal.
      for (const entry of envelope.presets) {
        const parsed = parseArsenalPresetSummary(entry);
        if (!parsed.ok || parsed.value.scope !== 'team' || !isTeamArsenalPresetId(parsed.value.id)) continue;
        if (seen.has(parsed.value.id)) continue;
        seen.add(parsed.value.id);
        team.push(parsed.value);
      }
      const builtins = [...this.builtins().values()]
        .filter((preset) => query.kind === undefined || preset.kind === query.kind)
        .filter((preset) => query.category === undefined || preset.category === query.category)
        .map((preset) => {
          const { payload: _payload, ...summary } = this.builtinWithUsage(preset);
          return summary;
        });
      return ok([...builtins, ...team]);
    });
  }

  async getMany(presetIds: readonly string[]): Promise<ArsenalResult<readonly ArsenalPreset[]>> {
    if (!Array.isArray(presetIds) || presetIds.length > ARSENAL_LIMITS.getManyMax
      || presetIds.some((id) => !ArsenalPresetIdSchema.safeParse(id).success)) {
      return fail('INVALID_REQUEST', 'presetIds');
    }
    const wanted = [...new Set(presetIds)];
    const teamIds = wanted.filter(isTeamArsenalPresetId);
    const resolve = (team: ReadonlyMap<string, ArsenalPreset>): ArsenalResult<readonly ArsenalPreset[]> => {
      const found: ArsenalPreset[] = [];
      for (const id of wanted) {
        const builtin = this.builtins().get(id);
        if (builtin) found.push(this.builtinWithUsage(builtin));
        const preset = team.get(id);
        if (preset) found.push(preset);
      }
      return ok(found);
    };
    if (teamIds.length === 0) return resolve(new Map());
    return this.call(ARSENAL_RPC.getMany, { p_preset_ids: teamIds }, 'read', (data) => {
      if (!Array.isArray(data)) throw new ResponseShapeError(`${ARSENAL_RPC.getMany} must return a list`);
      const requested = new Set(teamIds);
      const team = new Map<string, ArsenalPreset>();
      // Newer payload versions and malformed rows cannot be inserted: they are left out, like unknown ids.
      for (const entry of data) {
        const parsed = parseArsenalPreset(entry);
        if (!parsed.ok || parsed.value.scope !== 'team' || !requested.has(parsed.value.id)) continue;
        team.set(parsed.value.id, parsed.value);
      }
      return resolve(team);
    });
  }

  async create(request: CreateArsenalPresetRequest): Promise<ArsenalResult<ArsenalPreset>> {
    if (!isTeamArsenalPresetId(request.presetId) || !validMutation(request.mutationId)) return fail('INVALID_REQUEST');
    const parsed = parseArsenalPresetDraft(request.draft);
    if (!parsed.ok) return fail(parsed.code, parsed.issues[0]?.code);
    return this.call(ARSENAL_RPC.create, {
      p_preset_id: request.presetId,
      p_mutation_id: request.mutationId,
      p_preset: parsed.value,
    }, 'mutation', (data) => this.parseTeamPreset(data, request.presetId));
  }

  async updateCAS(request: UpdateArsenalPresetCasRequest): Promise<ArsenalResult<ArsenalPreset>> {
    if (isBuiltinArsenalPresetId(request.presetId)) return fail('READ_ONLY', request.presetId);
    if (!isTeamArsenalPresetId(request.presetId) || !validMutation(request.mutationId, request.expectedRevision)) {
      return fail('INVALID_REQUEST');
    }
    const patch = checkPatch(request.patch);
    if (!patch.ok) return patch;
    return this.call(ARSENAL_RPC.updateCAS, {
      p_preset_id: request.presetId,
      p_expected_revision: request.expectedRevision,
      p_mutation_id: request.mutationId,
      p_patch: patch.value,
    }, 'mutation', (data) => this.parseTeamPreset(data, request.presetId));
  }

  async deleteCAS(request: DeleteArsenalPresetCasRequest): Promise<ArsenalResult<ArsenalPresetHandle>> {
    if (isBuiltinArsenalPresetId(request.presetId)) return fail('READ_ONLY', request.presetId);
    if (!isTeamArsenalPresetId(request.presetId) || !validMutation(request.mutationId, request.expectedRevision)) {
      return fail('INVALID_REQUEST');
    }
    return this.call(ARSENAL_RPC.deleteCAS, {
      p_preset_id: request.presetId,
      p_expected_revision: request.expectedRevision,
      p_mutation_id: request.mutationId,
    }, 'mutation', (data) => {
      const handle = HandleSchema.parse(data);
      if (handle.presetId !== request.presetId) throw new ResponseShapeError('delete answered for another preset');
      return ok(handle);
    });
  }

  async recordUse(presetId: string): Promise<ArsenalResult<ArsenalUsage>> {
    if (!ArsenalPresetIdSchema.safeParse(presetId).success) return fail('INVALID_REQUEST');
    // A built-in this app does not ship is not counted (the server would accept any builtin:<slug>).
    if (isBuiltinArsenalPresetId(presetId) && !this.builtins().has(presetId)) return fail('NOT_FOUND', presetId);
    // No mutation id: a lost answer is retried by nobody (counting twice would be worse than once less).
    return this.call(ARSENAL_RPC.recordUse, { p_preset_key: presetId }, 'usage', (data) => {
      const usage = UsageSchema.parse(data);
      if (usage.presetId !== presetId) throw new ResponseShapeError('usage answered for another preset');
      if (isBuiltinArsenalPresetId(presetId)) this.builtinUsage.set(presetId, usage);
      return ok(usage);
    });
  }

  private parseTeamPreset(data: unknown, presetId: string): ArsenalResult<ArsenalPreset> {
    const parsed = parseArsenalPreset(data);
    if (!parsed.ok) {
      throw new ResponseShapeError(`server preset did not parse: ${parsed.code} ${parsed.issues[0]?.code ?? ''}`.trim());
    }
    if (parsed.value.id !== presetId || parsed.value.scope !== 'team'
      || parsed.value.payloadSchemaVersion !== ARSENAL_PAYLOAD_SCHEMA_VERSION) {
      throw new ResponseShapeError('server answered for another preset');
    }
    return ok(parsed.value);
  }
}
