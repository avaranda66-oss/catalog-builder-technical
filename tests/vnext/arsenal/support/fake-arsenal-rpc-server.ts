import type {
  VNextPersistenceRpcClient,
  VNextPersistenceRpcResponse,
} from '../../../../src/vnext/persistence/supabase-repository';

/**
 * A stand-in for Postgres running migration 00031, for the tests of `SupabaseArsenalRepository`. It answers the six
 * RPCs with the same rules, keys and `RAISE EXCEPTION` texts as the SQL: `require_document_editor_v1` (active
 * admin/editor), author-or-admin for update/delete, CAS by revision, replay of the latest mutation only, logical
 * delete, usage outside the preset row, and only the *shell* check of the preset (the deep check is the client's).
 *
 * RLS is simulated by the actor bound to each client (`clientFor`), the way `auth.uid()` binds a session.
 * Not a reference of the rules (that is `createInMemoryArsenalStore`): a mirror of the SQL, kept close to it.
 */

export interface FakeProfile {
  readonly userId: string;
  readonly role: 'admin' | 'editor' | 'viewer';
  readonly fullName?: string | null;
  readonly active?: boolean;
}

export type FakeFault =
  /** The request never reaches the server (nothing applied), answered as a network error. */
  | { readonly fn?: string; readonly kind: 'lost-request' }
  /** The server applies the call but the answer is lost (the ambiguous case). */
  | { readonly fn?: string; readonly kind: 'lost-answer' }
  /** The client library throws (fetch rejected). */
  | { readonly fn?: string; readonly kind: 'throw' };

interface Row {
  id: string;
  revision: number;
  last_mutation_id: string;
  kind: string;
  category: string;
  name: string;
  description: string | null;
  tags: string[];
  synonyms: string[];
  origin: string;
  payload_schema_version: number;
  payload: Record<string, unknown>;
  payload_bytes: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

interface UsageRow {
  preset_key: string;
  use_count: number;
  last_used_at: string;
}

class SqlError extends Error {
  constructor(message: string, readonly sqlState: string) {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BUILTIN_KEY = /^builtin:[a-z0-9][a-z0-9._-]{0,79}$/;
/** The SQL's `~ '[\x00-\x1F\x7F]'`, without a control-character regex. */
const CONTROL = {
  test: (text: string) => [...text].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
};
const KINDS = ['page', 'block', 'table', 'style'];
const CATEGORIES = ['capas', 'tabelas', 'cabecalhos', 'rodapes', 'paginas', 'estilos'];
const KIND_CATEGORIES: Record<string, string[]> = {
  page: ['capas', 'paginas'],
  block: ['capas', 'cabecalhos', 'rodapes', 'paginas'],
  table: ['tabelas'],
  style: ['estilos'],
};
const DRAFT_KEYS = ['kind', 'origin', 'name', 'category', 'description', 'tags', 'synonyms', 'payloadSchemaVersion', 'payload'];
const REQUIRED_DRAFT_KEYS = DRAFT_KEYS.filter((key) => key !== 'description');
const PATCH_KEYS = ['name', 'category', 'description', 'tags', 'synonyms', 'payload'];

/** `jsonb` equality: key order does not count. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const octets = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

function termsValid(terms: unknown, maxCount: number, maxChars: number): boolean {
  if (!Array.isArray(terms) || terms.length > maxCount) return false;
  const seen = new Set<string>();
  for (const term of terms) {
    if (typeof term !== 'string' || term.length < 1 || [...term].length > maxChars || term !== term.trim() || CONTROL.test(term)) return false;
    const key = term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new SqlError(`VNEXT_INVALID_REQUEST: ${label} must be an exact canonical lowercase UUID`, '22023');
  }
  return value;
}

/** `vnext_validate_preset_input_v1`: the shell of a draft or of a merged update. */
function validatePresetInput(input: unknown): void {
  if (!isObject(input)
    || Object.keys(input).some((key) => !DRAFT_KEYS.includes(key))
    || REQUIRED_DRAFT_KEYS.some((key) => !(key in input))) {
    throw new SqlError('VNEXT_INVALID_PRESET: preset must contain exactly the draft keys', '22023');
  }
  if (typeof input.payloadSchemaVersion !== 'number') {
    throw new SqlError('VNEXT_INVALID_PRESET: payloadSchemaVersion must be numeric', '22023');
  }
  const version = input.payloadSchemaVersion;
  if (version > 1 && Number.isInteger(version)) {
    throw new SqlError('VNEXT_UNSUPPORTED_VERSION: only preset payloadSchemaVersion 1 is supported', '22023');
  }
  if (version !== 1) throw new SqlError('VNEXT_INVALID_PRESET: payloadSchemaVersion must be 1', '22023');
  const { kind, category, origin, name } = input;
  if (typeof kind !== 'string' || typeof category !== 'string' || typeof origin !== 'string' || typeof name !== 'string') {
    throw new SqlError('VNEXT_INVALID_PRESET: kind, category, origin and name must be strings', '22023');
  }
  if (!KINDS.includes(kind) || !CATEGORIES.includes(category) || !KIND_CATEGORIES[kind].includes(category)) {
    throw new SqlError(`VNEXT_INVALID_PRESET: category ${category} is not allowed for kind ${kind}`, '22023');
  }
  if (origin !== 'person' && origin !== 'ai') throw new SqlError('VNEXT_INVALID_PRESET: origin must be person or ai', '22023');
  if ([...name].length < 1 || [...name].length > 80 || name !== name.trim() || CONTROL.test(name)) {
    throw new SqlError('VNEXT_INVALID_PRESET: name must be 1 to 80 trimmed characters', '22023');
  }
  if ('description' in input) {
    const description = input.description;
    if (typeof description !== 'string') {
      throw new SqlError('VNEXT_INVALID_PRESET: description must be a string when present', '22023');
    }
    if ([...description].length < 1 || [...description].length > 280 || description !== description.trim() || CONTROL.test(description)) {
      throw new SqlError('VNEXT_INVALID_PRESET: description must be 1 to 280 trimmed characters', '22023');
    }
  }
  if (!termsValid(input.tags, 12, 32) || !termsValid(input.synonyms, 24, 40)) {
    throw new SqlError('VNEXT_INVALID_PRESET: tags (12 x 32) and synonyms (24 x 40) must be unique trimmed strings', '22023');
  }
  if (!isObject(input.payload) || input.payload.kind !== kind) {
    throw new SqlError('VNEXT_INVALID_PRESET: payload must be an object of the same kind', '22023');
  }
  if (octets(input.payload) > 1_048_576) throw new SqlError('VNEXT_PRESET_TOO_LARGE: payload exceeds 1 MiB', '22023');
}

export interface FakeArsenalRpcServer {
  /** A client whose session is this person (`auth.uid()`), or nobody (`null`). */
  clientFor(userId: string | null): VNextPersistenceRpcClient;
  addProfile(profile: FakeProfile): void;
  /** Next calls (optionally of one RPC) fail this way, in order. */
  injectFault(fault: FakeFault): void;
  readonly calls: Array<{ readonly userId: string | null; readonly fn: string; readonly args: Record<string, unknown> }>;
  /** Raw rows, for assertions about what the database holds. */
  row(presetId: string): Readonly<Row> | undefined;
  usage(presetKey: string): Readonly<UsageRow> | undefined;
}

export function createFakeArsenalRpcServer(options: { readonly now?: () => string } = {}): FakeArsenalRpcServer {
  let tick = 0;
  // Postgres renders timestamptz in JSON with an offset; every call gets a later instant.
  const now = options.now ?? (() => new Date(Date.UTC(2026, 9, 23, 12, 0, 0) + (tick += 1) * 1000).toISOString().replace('Z', '+00:00'));
  const profiles = new Map<string, FakeProfile>();
  const rows = new Map<string, Row>();
  const usage = new Map<string, UsageRow>();
  const faults: FakeFault[] = [];
  const calls: FakeArsenalRpcServer['calls'] = [];

  const requireEditor = (userId: string | null): string => {
    if (userId === null) throw new SqlError('AUTH_ACTOR_NULL: Usuário não autenticado no servidor.', '42501');
    const profile = profiles.get(userId);
    if (!profile || profile.active === false) {
      throw new SqlError('AUTH_ROLE_NULL: Perfil do usuário não encontrado ou inativo.', '42501');
    }
    if (profile.role !== 'admin' && profile.role !== 'editor') {
      throw new SqlError(`AUTH_ROLE_FORBIDDEN: Perfil (${profile.role}) não autorizado para operações editoriais.`, '42501');
    }
    return userId;
  };
  const isAdmin = (userId: string) => profiles.get(userId)?.role === 'admin';

  const envelope = (row: Row, includePayload: boolean): Record<string, unknown> => {
    const used = usage.get(row.id);
    const fullName = profiles.get(row.created_by)?.fullName?.trim();
    return {
      id: row.id,
      scope: 'team',
      origin: row.origin,
      kind: row.kind,
      name: row.name,
      category: row.category,
      tags: [...row.tags],
      synonyms: [...row.synonyms],
      payloadSchemaVersion: row.payload_schema_version,
      payloadBytes: row.payload_bytes,
      revision: row.revision,
      createdBy: row.created_by,
      createdByName: fullName ? fullName : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      useCount: used?.use_count ?? 0,
      lastUsedAt: used?.last_used_at ?? null,
      ...(row.description === null ? {} : { description: row.description }),
      ...(includePayload ? { payload: JSON.parse(JSON.stringify(row.payload)) } : {}),
    };
  };

  const functions: Record<string, (userId: string | null, args: Record<string, unknown>) => unknown> = {
    list_vnext_presets_v1(userId, args) {
      requireEditor(userId);
      const kind = args.p_kind ?? null;
      const category = args.p_category ?? null;
      if (kind !== null && !KINDS.includes(String(kind))) throw new SqlError(`VNEXT_INVALID_REQUEST: unknown kind ${kind}`, '22023');
      if (category !== null && !CATEGORIES.includes(String(category))) {
        throw new SqlError(`VNEXT_INVALID_REQUEST: unknown category ${category}`, '22023');
      }
      const presets = [...rows.values()]
        .filter((row) => row.deleted_at === null)
        .filter((row) => kind === null || row.kind === kind)
        .filter((row) => category === null || row.category === category)
        .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : a.id < b.id ? -1 : 1))
        .map((row) => envelope(row, false));
      const builtinUsage = [...usage.values()]
        .filter((entry) => entry.preset_key.startsWith('builtin:'))
        .sort((a, b) => (a.preset_key < b.preset_key ? -1 : 1))
        .map((entry) => ({ presetId: entry.preset_key, useCount: entry.use_count, lastUsedAt: entry.last_used_at }));
      return { presets, builtinUsage };
    },

    get_vnext_presets_v1(userId, args) {
      requireEditor(userId);
      const ids = args.p_preset_ids;
      if (!Array.isArray(ids) || ids.length > 50) {
        throw new SqlError('VNEXT_INVALID_REQUEST: presetIds must be a list of at most 50 ids', '22023');
      }
      const wanted = ids.map((id) => requireUuid(id, 'presetId'));
      return [...rows.values()]
        .filter((row) => wanted.includes(row.id) && row.deleted_at === null)
        .sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id))
        .map((row) => envelope(row, true));
    },

    create_vnext_preset_v1(userId, args) {
      const actor = requireEditor(userId);
      const presetId = requireUuid(args.p_preset_id, 'presetId');
      const mutationId = requireUuid(args.p_mutation_id, 'mutationId');
      validatePresetInput(args.p_preset);
      const input = args.p_preset as Record<string, unknown>;
      const description = typeof input.description === 'string' ? input.description : null;
      const existing = rows.get(presetId);
      if (!existing) {
        const at = now();
        const row: Row = {
          id: presetId, revision: 1, last_mutation_id: mutationId, kind: String(input.kind), category: String(input.category),
          name: String(input.name), description, tags: [...input.tags as string[]], synonyms: [...input.synonyms as string[]],
          origin: String(input.origin), payload_schema_version: 1, payload: input.payload as Record<string, unknown>,
          payload_bytes: octets(input.payload), created_at: at, updated_at: at, created_by: actor, updated_by: actor,
          deleted_at: null, deleted_by: null,
        };
        rows.set(presetId, row);
        return envelope(row, true);
      }
      if (existing.last_mutation_id !== mutationId) throw new SqlError(`VNEXT_DUPLICATE_PRESET: preset ${presetId} already exists`, '23505');
      if (existing.revision !== 1) throw new SqlError('VNEXT_MUTATION_REPLAY_STALE: mutation is no longer latest', '40001');
      if (existing.created_by !== actor || existing.kind !== input.kind || existing.origin !== input.origin
        || existing.name !== input.name || existing.category !== input.category || existing.description !== description
        || canonical(existing.tags) !== canonical(input.tags) || canonical(existing.synonyms) !== canonical(input.synonyms)
        || canonical(existing.payload) !== canonical(input.payload)) {
        throw new SqlError('VNEXT_MUTATION_REUSE: mutation id reused with divergent create payload', '40001');
      }
      return envelope(existing, true);
    },

    update_vnext_preset_cas_v1(userId, args) {
      const actor = requireEditor(userId);
      const presetId = requireUuid(args.p_preset_id, 'presetId');
      const mutationId = requireUuid(args.p_mutation_id, 'mutationId');
      const expected = args.p_expected_revision;
      if (typeof expected !== 'number' || expected < 1) {
        throw new SqlError('VNEXT_INVALID_REQUEST: expectedRevision must be positive', '22023');
      }
      const patch = args.p_patch;
      if (!isObject(patch) || Object.keys(patch).length === 0 || Object.keys(patch).some((key) => !PATCH_KEYS.includes(key))) {
        throw new SqlError('VNEXT_INVALID_REQUEST: patch must change name, category, description, tags, synonyms or payload', '22023');
      }
      const current = rows.get(presetId);
      if (!current || current.deleted_at !== null) throw new SqlError(`VNEXT_NOT_FOUND: preset ${presetId} does not exist`, 'P0002');
      if (current.created_by !== actor && !isAdmin(actor)) {
        throw new SqlError(`VNEXT_FORBIDDEN: only the author or an admin can change preset ${presetId}`, '42501');
      }
      const base: Record<string, unknown> = {
        kind: current.kind, origin: current.origin, name: current.name, category: current.category,
        tags: current.tags, synonyms: current.synonyms, payloadSchemaVersion: current.payload_schema_version,
        payload: current.payload, ...(current.description === null ? {} : { description: current.description }),
      };
      const { description: patchDescription, ...patchRest } = patch;
      const merged: Record<string, unknown> = { ...base, ...patchRest };
      if ('description' in patch) {
        if (patchDescription === null) delete merged.description;
        else merged.description = patchDescription;
      }
      if (current.last_mutation_id === mutationId) {
        if (current.revision !== expected + 1 || canonical(merged) !== canonical(base)) {
          throw new SqlError('VNEXT_MUTATION_REUSE: mutation id reused with divergent update payload', '40001');
        }
        return envelope(current, true);
      }
      if (current.revision !== expected) {
        throw new SqlError(`VNEXT_CONFLICT: expected revision ${expected}, current revision ${current.revision}`, '40001');
      }
      if ('payload' in patch && (isObject(patch.payload) ? patch.payload.kind : undefined) !== current.kind) {
        throw new SqlError('VNEXT_INVALID_PRESET: payload kind cannot change', '22023');
      }
      validatePresetInput(merged);
      Object.assign(current, {
        revision: current.revision + 1, last_mutation_id: mutationId, name: merged.name, category: merged.category,
        description: typeof merged.description === 'string' ? merged.description : null,
        tags: [...merged.tags as string[]], synonyms: [...merged.synonyms as string[]], payload: merged.payload,
        payload_bytes: octets(merged.payload), updated_at: now(), updated_by: actor,
      });
      return envelope(current, true);
    },

    delete_vnext_preset_cas_v1(userId, args) {
      const actor = requireEditor(userId);
      const presetId = requireUuid(args.p_preset_id, 'presetId');
      const mutationId = requireUuid(args.p_mutation_id, 'mutationId');
      const expected = args.p_expected_revision;
      if (typeof expected !== 'number' || expected < 1) {
        throw new SqlError('VNEXT_INVALID_REQUEST: expectedRevision must be positive', '22023');
      }
      const current = rows.get(presetId);
      if (!current) throw new SqlError(`VNEXT_NOT_FOUND: preset ${presetId} does not exist`, 'P0002');
      if (current.deleted_at !== null) {
        if (current.last_mutation_id === mutationId && current.revision === expected + 1 && current.deleted_by === actor) {
          return { presetId: current.id, revision: current.revision };
        }
        throw new SqlError(`VNEXT_NOT_FOUND: preset ${presetId} does not exist`, 'P0002');
      }
      if (current.created_by !== actor && !isAdmin(actor)) {
        throw new SqlError(`VNEXT_FORBIDDEN: only the author or an admin can delete preset ${presetId}`, '42501');
      }
      if (current.last_mutation_id === mutationId) {
        throw new SqlError('VNEXT_MUTATION_REUSE: mutation id reused with divergent delete payload', '40001');
      }
      if (current.revision !== expected) {
        throw new SqlError(`VNEXT_CONFLICT: expected revision ${expected}, current revision ${current.revision}`, '40001');
      }
      const at = now();
      Object.assign(current, {
        revision: current.revision + 1, last_mutation_id: mutationId, deleted_at: at, deleted_by: actor,
        updated_at: at, updated_by: actor,
      });
      return { presetId: current.id, revision: current.revision };
    },

    record_vnext_preset_use_v1(userId, args) {
      requireEditor(userId);
      const key = args.p_preset_key;
      if (typeof key !== 'string' || !(UUID.test(key) || BUILTIN_KEY.test(key))) {
        throw new SqlError('VNEXT_INVALID_REQUEST: presetId must be a UUID or builtin:<slug>', '22023');
      }
      if (!key.startsWith('builtin:')) {
        const row = rows.get(key);
        if (!row || row.deleted_at !== null) throw new SqlError(`VNEXT_NOT_FOUND: preset ${key} does not exist`, 'P0002');
      }
      const at = now();
      const next = { preset_key: key, use_count: (usage.get(key)?.use_count ?? 0) + 1, last_used_at: at };
      usage.set(key, next);
      return { presetId: next.preset_key, useCount: next.use_count, lastUsedAt: next.last_used_at };
    },
  };

  const takeFault = (fn: string): FakeFault | undefined => {
    const index = faults.findIndex((fault) => fault.fn === undefined || fault.fn === fn);
    return index < 0 ? undefined : faults.splice(index, 1)[0];
  };

  return {
    calls,
    addProfile(profile) {
      profiles.set(profile.userId, profile);
    },
    injectFault(fault) {
      faults.push(fault);
    },
    row: (presetId) => rows.get(presetId),
    usage: (presetKey) => usage.get(presetKey),
    clientFor(userId) {
      return {
        async rpc(fn: string, rawArgs: Record<string, unknown> = {}): Promise<VNextPersistenceRpcResponse> {
          // The wire: what the server sees is JSON, never the caller's objects.
          const args = JSON.parse(JSON.stringify(rawArgs)) as Record<string, unknown>;
          calls.push({ userId, fn, args });
          const fault = takeFault(fn);
          if (fault?.kind === 'throw') throw new TypeError('Failed to fetch');
          if (fault?.kind === 'lost-request') return { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } };
          const implementation = functions[fn];
          if (!implementation) {
            return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } };
          }
          let data: unknown;
          try {
            // A copy, like a row serialized to JSON: the caller never holds the stored objects.
            data = JSON.parse(JSON.stringify(implementation(userId, args)));
          } catch (error) {
            if (error instanceof SqlError) return { data: null, error: { code: error.sqlState, message: error.message } };
            throw error;
          }
          if (fault?.kind === 'lost-answer') return { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } };
          return { data, error: null };
        },
      };
    },
  };
}
