import {
  ARSENAL_LIMITS,
  canManageArsenalPreset,
  canUseArsenal,
  isArsenalPayloadVersionSupported,
  type ArsenalPreset,
  type ArsenalPresetDraft,
  type ArsenalPresetSummary,
  type ArsenalViewer,
} from './contracts';
import type {
  ArsenalPresetHandle,
  ArsenalPresetPatch,
  ArsenalRepository,
  ArsenalRepositoryErrorCode,
  ArsenalResult,
  ArsenalUsage,
} from './repository';
import { searchArsenalPresets, type ArsenalSearchFilters } from './search';

/**
 * Onda 4.5 — what the gallery and the assistant call to use the arsenal (ADR-arsenal). One list per opening of the
 * gallery, then search runs on that list in memory (typing never calls the server); save, rename, change, delete
 * and "count one use" go through the repository with fresh mutation ids and the revision the list showed.
 *
 * Using a preset never calls the AI: the service only stores and finds presets. Who may change what is answered
 * here first when the viewer is known (no network call for a "não pode"), and the database decides anyway.
 */

export interface ArsenalServiceOptions {
  readonly repository: ArsenalRepository;
  /** Canonical lowercase UUIDs for new presets and mutations (`crypto.randomUUID`). */
  readonly createId: () => string;
  /** The person using the arsenal; without it the repository alone decides permissions. */
  readonly viewer?: ArsenalViewer;
  /** Times a write whose answer was lost is sent again with the same ids (idempotent on the server). Default 1. */
  readonly ambiguousRetries?: number;
  /** Full presets (with payload) kept for thumbnails and insertion. Default 120. */
  readonly presetCacheSize?: number;
}

export type ArsenalServiceStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ArsenalServiceSnapshot {
  readonly status: ArsenalServiceStatus;
  /** Built-ins and team presets the latest list returned, plus what this session saved or changed since. */
  readonly presets: readonly ArsenalPresetSummary[];
  /** Why the latest list failed (the previous presets stay visible). */
  readonly error?: ArsenalRepositoryErrorCode;
}

/** Short Portuguese sentences for the person, one per repository code. */
export const ARSENAL_ERROR_MESSAGES: Readonly<Record<ArsenalRepositoryErrorCode, string>> = Object.freeze({
  NOT_FOUND: 'Este modelo não está mais no arsenal. Talvez alguém o tenha apagado.',
  UNAUTHORIZED: 'Sua conta não pode usar o arsenal. Entre de novo ou peça acesso de editor.',
  FORBIDDEN: 'Só quem guardou este modelo, ou um administrador, pode mudar ou apagar.',
  READ_ONLY: 'Os modelos PRESYS que vêm com o programa não mudam. Use o modelo e guarde a sua versão.',
  CONFLICT: 'Outra pessoa mudou este modelo agora há pouco. A lista foi atualizada; tente de novo.',
  DUPLICATE: 'Já existe um modelo com este código. Tente guardar de novo.',
  MUTATION_REUSE: 'O pedido se repetiu com conteúdo diferente. Tente de novo.',
  INVALID_PRESET: 'Este modelo tem algo que não pode ser guardado. Confira nome, categoria e conteúdo.',
  INVALID_REQUEST: 'Pedido inválido para o arsenal.',
  UNSUPPORTED_VERSION: 'Este modelo foi guardado por uma versão mais nova do programa. Atualize a página.',
  TOO_LARGE: 'Este modelo é grande demais para guardar. Guarde uma parte menor.',
  OFFLINE: 'Sem internet. O arsenal volta quando a conexão voltar.',
  REMOTE_FAILURE: 'O servidor não respondeu. Tente de novo em instantes.',
  AMBIGUOUS_COMMIT_OUTCOME: 'Não deu para confirmar se ficou guardado. Confira a lista antes de repetir.',
});

export function arsenalErrorMessage(code: ArsenalRepositoryErrorCode): string {
  return ARSENAL_ERROR_MESSAGES[code] ?? ARSENAL_ERROR_MESSAGES.REMOTE_FAILURE;
}

const fail = <T>(code: ArsenalRepositoryErrorCode, message?: string): ArsenalResult<T> =>
  ({ ok: false, error: message === undefined ? { code } : { code, message } });

function summaryOf(preset: ArsenalPreset): ArsenalPresetSummary {
  const { payload: _payload, ...summary } = preset;
  return summary;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** "  Capa   azul " → "Capa azul". */
function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

type LocalChange = (presets: Map<string, ArsenalPresetSummary>) => void;

export class ArsenalService {
  private readonly repository: ArsenalRepository;
  private readonly createId: () => string;
  private readonly viewer: ArsenalViewer | undefined;
  private readonly ambiguousRetries: number;
  private readonly presetCacheSize: number;
  private summaries = new Map<string, ArsenalPresetSummary>();
  private readonly presets = new Map<string, ArsenalPreset>();
  private readonly listeners = new Set<() => void>();
  private snapshot: ArsenalServiceSnapshot = Object.freeze({ status: 'idle', presets: Object.freeze([]) });
  private refreshing: Promise<ArsenalResult<readonly ArsenalPresetSummary[]>> | undefined;
  /** Changes made while a list is on the way, re-applied over its answer so they are not lost. */
  private changesDuringRefresh: LocalChange[] | undefined;

  constructor(options: ArsenalServiceOptions) {
    this.repository = options.repository;
    this.createId = options.createId;
    this.viewer = options.viewer;
    this.ambiguousRetries = Math.max(0, options.ambiguousRetries ?? 1);
    this.presetCacheSize = Math.max(1, options.presetCacheSize ?? 120);
  }

  // ------------------------------------------------------------------------------------------------------------
  // State for the gallery (useSyncExternalStore)
  // ------------------------------------------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ArsenalServiceSnapshot => this.snapshot;

  private publish(status: ArsenalServiceStatus, error?: ArsenalRepositoryErrorCode): void {
    this.snapshot = Object.freeze({
      status,
      presets: Object.freeze([...this.summaries.values()]),
      ...(error === undefined ? {} : { error }),
    });
    for (const listener of [...this.listeners]) listener();
  }

  private change(apply: LocalChange): void {
    apply(this.summaries);
    this.changesDuringRefresh?.push(apply);
    this.publish(this.snapshot.status, this.snapshot.error);
  }

  private remember(preset: ArsenalPreset): ArsenalPreset {
    const frozen = deepFreeze(preset);
    this.presets.delete(frozen.id);
    this.presets.set(frozen.id, frozen);
    while (this.presets.size > this.presetCacheSize) {
      const oldest = this.presets.keys().next().value;
      if (oldest === undefined) break;
      this.presets.delete(oldest);
    }
    return frozen;
  }

  private forget(presetId: string): void {
    this.presets.delete(presetId);
    this.change((presets) => presets.delete(presetId));
  }

  private async guarded<T>(call: () => Promise<ArsenalResult<T>>): Promise<ArsenalResult<T>> {
    try {
      return await call();
    } catch (error) {
      return fail('REMOTE_FAILURE', error instanceof Error ? error.message : String(error));
    }
  }

  /** Sends a write again with the same ids while its outcome is unknown (the server replays the same answer). */
  private async withRetry<T>(call: () => Promise<ArsenalResult<T>>): Promise<ArsenalResult<T>> {
    let result = await this.guarded(call);
    for (let attempt = 0; attempt < this.ambiguousRetries; attempt += 1) {
      if (result.ok || result.error.code !== 'AMBIGUOUS_COMMIT_OUTCOME') break;
      result = await this.guarded(call);
    }
    return result;
  }

  private denied(): ArsenalRepositoryErrorCode | undefined {
    return this.viewer !== undefined && !canUseArsenal(this.viewer) ? 'UNAUTHORIZED' : undefined;
  }

  // ------------------------------------------------------------------------------------------------------------
  // Reading
  // ------------------------------------------------------------------------------------------------------------

  /** One list from the repository (concurrent calls share it). Search afterwards is local. */
  refresh(): Promise<ArsenalResult<readonly ArsenalPresetSummary[]>> {
    if (this.refreshing) return this.refreshing;
    const denied = this.denied();
    if (denied) {
      this.publish('error', denied);
      return Promise.resolve(fail(denied));
    }
    this.changesDuringRefresh = [];
    this.publish('loading', this.snapshot.error);
    this.refreshing = (async () => {
      const result = await this.guarded(() => this.repository.list());
      const changes = this.changesDuringRefresh ?? [];
      this.changesDuringRefresh = undefined;
      this.refreshing = undefined;
      if (!result.ok) {
        this.publish('error', result.error.code);
        return result;
      }
      const next = new Map<string, ArsenalPresetSummary>();
      for (const summary of result.value) next.set(summary.id, summary);
      for (const apply of changes) apply(next);
      this.summaries = next;
      for (const [id, preset] of this.presets) {
        const listed = next.get(id);
        if (!listed || listed.revision !== preset.revision) this.presets.delete(id);
      }
      this.publish('ready');
      return { ok: true, value: this.snapshot.presets };
    })();
    return this.refreshing;
  }

  /** The list, loading it the first time (or after a failure). */
  async ensureLoaded(): Promise<ArsenalResult<readonly ArsenalPresetSummary[]>> {
    if (this.snapshot.status === 'ready') return { ok: true, value: this.snapshot.presets };
    return this.refresh();
  }

  /**
   * Presets that match the words typed, best first (name, then tags, then synonyms and the rest). Accents, case and
   * plurals do not count. Runs on the list in memory: no network.
   */
  search(query: string, filters: ArsenalSearchFilters = {}): ArsenalPresetSummary[] {
    return searchArsenalPresets(this.snapshot.presets, query, filters);
  }

  summary(presetId: string): ArsenalPresetSummary | undefined {
    return this.summaries.get(presetId);
  }

  /** Whether the viewer may rename, change or delete this preset (built-ins: never). */
  canManage(preset: Pick<ArsenalPresetSummary, 'scope' | 'createdBy'>): boolean {
    return this.viewer === undefined ? preset.scope === 'team' : canManageArsenalPreset(preset, this.viewer);
  }

  /**
   * Full presets (thumbnails, insertion) in the order asked; ids the arsenal no longer has are left out. Presets
   * already loaded at the listed revision are not fetched again; the rest go in requests of at most 50.
   */
  async load(presetIds: readonly string[]): Promise<ArsenalResult<readonly ArsenalPreset[]>> {
    const denied = this.denied();
    if (denied) return fail(denied);
    const wanted = [...new Set(presetIds)];
    const fresh = (id: string): ArsenalPreset | undefined => {
      const cached = this.presets.get(id);
      const listed = this.summaries.get(id);
      return cached && listed && cached.revision === listed.revision ? cached : undefined;
    };
    // What this call brought, kept apart from the cache: a long list may evict its own first presets.
    const fetched = new Map<string, ArsenalPreset>();
    const missing = wanted.filter((id) => !fresh(id));
    for (let start = 0; start < missing.length; start += ARSENAL_LIMITS.getManyMax) {
      const chunk = missing.slice(start, start + ARSENAL_LIMITS.getManyMax);
      const result = await this.guarded(() => this.repository.getMany(chunk));
      if (!result.ok) return result;
      const kept = result.value.map((preset) => this.remember(preset));
      for (const preset of kept) fetched.set(preset.id, preset);
      // Gone from the arsenal: out of the list too (a newer-version preset stays listed, greyed out).
      const gone = chunk.filter((id) => {
        const listed = this.summaries.get(id);
        return !fetched.has(id) && listed !== undefined && isArsenalPayloadVersionSupported(listed);
      });
      for (const id of gone) this.presets.delete(id);
      this.change((presets) => {
        for (const preset of kept) presets.set(preset.id, summaryOf(preset));
        for (const id of gone) presets.delete(id);
      });
    }
    const loaded: ArsenalPreset[] = [];
    for (const id of wanted) {
      const preset = fetched.get(id) ?? fresh(id);
      const listed = this.summaries.get(id);
      if (!preset || !listed) continue;
      // The use count may have moved since the payload was loaded; the list knows the latest.
      loaded.push(listed.useCount === preset.useCount && listed.lastUsedAt === preset.lastUsedAt
        ? preset
        : { ...preset, useCount: listed.useCount, lastUsedAt: listed.lastUsedAt });
    }
    return { ok: true, value: loaded };
  }

  /** The preset as stored now, refreshed from the repository (after a conflict, or when not in the list). */
  private async reload(presetId: string): Promise<ArsenalPresetSummary | undefined> {
    const result = await this.guarded(() => this.repository.getMany([presetId]));
    if (!result.ok) return this.summaries.get(presetId);
    const preset = result.value.find((candidate) => candidate.id === presetId);
    if (!preset) {
      const listed = this.summaries.get(presetId);
      if (listed && !isArsenalPayloadVersionSupported(listed)) return listed;
      this.forget(presetId);
      return undefined;
    }
    const kept = this.remember(preset);
    const summary = summaryOf(kept);
    this.change((presets) => presets.set(summary.id, summary));
    return summary;
  }

  // ------------------------------------------------------------------------------------------------------------
  // Writing
  // ------------------------------------------------------------------------------------------------------------

  /**
   * Saves a new team preset (the person's, or an AI proposal the person confirmed: `draft.origin`). The draft is
   * checked by the repository before any network call. Pass the same `ids` to repeat a save whose outcome is unknown.
   */
  async save(
    draft: ArsenalPresetDraft,
    ids: { readonly presetId?: string; readonly mutationId?: string } = {},
  ): Promise<ArsenalResult<ArsenalPreset>> {
    const denied = this.denied();
    if (denied) return fail(denied);
    const presetId = ids.presetId ?? this.createId();
    const mutationId = ids.mutationId ?? this.createId();
    const result = await this.withRetry(() => this.repository.create({ presetId, mutationId, draft }));
    if (result.ok) {
      const kept = this.remember(result.value);
      this.change((presets) => presets.set(kept.id, summaryOf(kept)));
      return { ok: true, value: kept };
    }
    return result;
  }

  /** Checks done before a change or delete leaves this device: exists, not built-in, viewer may manage it. */
  private async manageable(presetId: string): Promise<ArsenalResult<ArsenalPresetSummary>> {
    const denied = this.denied();
    if (denied) return fail(denied);
    const summary = this.summaries.get(presetId) ?? await this.reload(presetId);
    if (!summary) return fail('NOT_FOUND', presetId);
    if (summary.scope === 'builtin') return fail('READ_ONLY', presetId);
    if (this.viewer !== undefined && !canManageArsenalPreset(summary, this.viewer)) return fail('FORBIDDEN', presetId);
    return { ok: true, value: summary };
  }

  /** Changes name, category, description, tags, synonyms or the content, at the revision the list showed. */
  async update(presetId: string, patch: ArsenalPresetPatch): Promise<ArsenalResult<ArsenalPreset>> {
    const target = await this.manageable(presetId);
    if (!target.ok) return target;
    const mutationId = this.createId();
    const result = await this.withRetry(() => this.repository.updateCAS({
      presetId, expectedRevision: target.value.revision, mutationId, patch,
    }));
    if (result.ok) {
      const kept = this.remember(result.value);
      this.change((presets) => presets.set(kept.id, summaryOf(kept)));
      return { ok: true, value: kept };
    }
    if (result.error.code === 'CONFLICT' || result.error.code === 'NOT_FOUND') await this.reload(presetId);
    return result;
  }

  /** New name; extra spaces are removed. */
  rename(presetId: string, name: string): Promise<ArsenalResult<ArsenalPreset>> {
    return this.update(presetId, { name: cleanName(name) });
  }

  /** Takes the preset out of the gallery (logical delete on the server; an admin can bring it back). */
  async remove(presetId: string): Promise<ArsenalResult<ArsenalPresetHandle>> {
    const target = await this.manageable(presetId);
    if (!target.ok) return target;
    const mutationId = this.createId();
    const result = await this.withRetry(() => this.repository.deleteCAS({
      presetId, expectedRevision: target.value.revision, mutationId,
    }));
    if (result.ok || result.error.code === 'NOT_FOUND') this.forget(presetId);
    else if (result.error.code === 'CONFLICT') await this.reload(presetId);
    return result;
  }

  /**
   * Counts one use after a successful insertion (built-ins too). Never throws; a failure only means the count did
   * not move, so callers may ignore it.
   */
  async recordUse(presetId: string): Promise<ArsenalResult<ArsenalUsage>> {
    const denied = this.denied();
    if (denied) return fail(denied);
    const result = await this.guarded(() => this.repository.recordUse(presetId));
    if (!result.ok) {
      if (result.error.code === 'NOT_FOUND') this.forget(presetId);
      return result;
    }
    const { useCount, lastUsedAt } = result.value;
    const cached = this.presets.get(presetId);
    if (cached) this.remember({ ...cached, useCount, lastUsedAt });
    this.change((presets) => {
      const listed = presets.get(presetId);
      if (listed) presets.set(presetId, { ...listed, useCount, lastUsedAt });
    });
    return result;
  }
}
