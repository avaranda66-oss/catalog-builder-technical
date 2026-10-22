import type { ManualSaveResult, SaveCoordinator } from './save-coordinator';
import type { PersistenceWorkspace, SaveRetryProjection } from './workspace';

export interface AutosaveClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AutosaveCoordinatorOptions {
  readonly workspace: PersistenceWorkspace;
  readonly saveCoordinator: SaveCoordinator;
  readonly debounceMs?: number;
  readonly clock?: AutosaveClock;
  /** FR-44: wait before each automatic retry; the last value repeats. Default 5 s, 15 s, 60 s. */
  readonly retryDelaysMs?: readonly number[];
  /** FR-44: automatic retries after the server could not be reached. Default 5. */
  readonly maxRetries?: number;
  readonly now?: () => number;
}

const DEFAULT_DEBOUNCE_MS = 1200;
export const AUTOSAVE_RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 60_000];
export const AUTOSAVE_MAX_RETRIES = 5;

type SaveFailureCode = Extract<ManualSaveResult, { readonly ok: false }>['error']['code'];

/** Failures that may pass by themselves: no connection, a server hiccup, an unconfirmed save. */
const RETRYABLE_FAILURES: ReadonlySet<SaveFailureCode> = new Set<SaveFailureCode>([
  'OFFLINE',
  'REMOTE_FAILURE',
  'AMBIGUOUS_COMMIT_OUTCOME',
]);

const browserClock: AutosaveClock = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function isRetryableManualResult(result: ManualSaveResult): boolean {
  return !result.ok && result.error.code === 'SAVE_IN_FLIGHT_NEWER_WORK';
}

export class AutosaveCoordinator {
  private readonly clock: AutosaveClock;
  private readonly debounceMs: number;
  private readonly retryDelaysMs: readonly number[];
  private readonly maxRetries: number;
  private readonly now: () => number;
  private readonly unsubscribe: () => void;
  private timer: unknown | undefined;
  private timerToken: string | undefined;
  private running: Promise<ManualSaveResult> | undefined;
  private suspendedSessionToken: string | undefined;
  /** Session whose last save failed in a way worth trying again by itself. */
  private retrySessionToken: string | undefined;
  private retryAttempts = 0;
  private retryTimer: unknown | undefined;
  private retryAt: number | undefined;
  private disposed = false;

  constructor(private readonly options: AutosaveCoordinatorOptions) {
    this.clock = options.clock ?? browserClock;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.retryDelaysMs = options.retryDelaysMs?.length ? options.retryDelaysMs : AUTOSAVE_RETRY_DELAYS_MS;
    this.maxRetries = Math.max(0, options.maxRetries ?? AUTOSAVE_MAX_RETRIES);
    this.now = options.now ?? Date.now;
    this.unsubscribe = options.workspace.subscribe(() => this.scheduleCurrent());
    this.scheduleCurrent();
  }

  private sourceToken(): string {
    const snapshot = this.options.workspace.getSnapshot();
    return JSON.stringify([
      snapshot.binding.openSessionId,
      snapshot.binding.authLineage,
      snapshot.activeAuthorityScopeId,
      snapshot.session.getSnapshot().localSequence,
      snapshot.dirty,
      this.options.workspace.getAuthoringBarrier().hasPendingDraft(),
    ]);
  }

  private sessionToken(): string {
    const snapshot = this.options.workspace.getSnapshot();
    return JSON.stringify([
      snapshot.binding.openSessionId,
      snapshot.binding.authLineage,
      snapshot.activeAuthorityScopeId,
      snapshot.binding.kind === 'PERSISTED' ? snapshot.binding.catalogId : null,
    ]);
  }

  private reconcileSuspension(): void {
    if (this.suspendedSessionToken && this.suspendedSessionToken !== this.sessionToken()) {
      this.suspendedSessionToken = undefined;
    }
    if (this.retrySessionToken && this.retrySessionToken !== this.sessionToken()) {
      this.resetRetries();
    }
  }

  private resetRetries(): void {
    this.retrySessionToken = undefined;
    this.retryAttempts = 0;
    this.clearRetryTimer();
  }

  private recordResult(result: ManualSaveResult): void {
    if (result.ok) {
      // FR-44: a confirmed save starts the retry count again.
      if (result.acknowledged) this.resetRetries();
      return;
    }
    if (RETRYABLE_FAILURES.has(result.error.code)) {
      this.retrySessionToken = this.sessionToken();
      return;
    }
    if ([
      'CONFLICT',
      'UNAUTHORIZED',
      'ARCHIVED',
      'NOT_FOUND',
      'INVALID_DOCUMENT',
      'UNSUPPORTED_VERSION',
      'REMOTE_DIVERGENCE',
      'ENVELOPE_MISMATCH',
    ].includes(result.error.code)) {
      this.suspendedSessionToken = this.sessionToken();
      this.resetRetries();
    }
  }

  private clearTimer(): void {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
    this.timerToken = undefined;
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== undefined) this.clock.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.retryAt = undefined;
  }

  private isEligibleForAutomaticSave(): boolean {
    this.reconcileSuspension();
    const snapshot = this.options.workspace.getSnapshot();
    return snapshot.binding.kind === 'PERSISTED'
      && snapshot.dirty
      && snapshot.save.phase === 'idle'
      && !this.options.workspace.getAuthoringBarrier().hasPendingDraft()
      && this.suspendedSessionToken !== this.sessionToken()
      && !this.disposed;
  }

  /** The save of this session failed for a passing reason and the editor still shows that failure. */
  private waitingForRetry(): boolean {
    this.reconcileSuspension();
    const snapshot = this.options.workspace.getSnapshot();
    return snapshot.binding.kind === 'PERSISTED'
      && (snapshot.save.phase === 'unavailable' || snapshot.save.phase === 'ambiguous')
      && this.retrySessionToken !== undefined
      && this.retrySessionToken === this.sessionToken()
      && this.suspendedSessionToken !== this.sessionToken()
      && !this.disposed;
  }

  /**
   * FR-44: after "Sem conexão" or an unconfirmed save, try again by itself after 5 s, 15 s and then
   * every 60 s, at most `maxRetries` times. Only this coordinator's own failures count, so a pause
   * set elsewhere (the recovery screen checking an older save) is never overridden.
   */
  private isEligibleForRetry(): boolean {
    if (!this.waitingForRetry() || this.retryAttempts >= this.maxRetries) return false;
    const snapshot = this.options.workspace.getSnapshot();
    return (snapshot.dirty || this.options.saveCoordinator.hasUnresolvedActiveMutation())
      && !this.options.workspace.getAuthoringBarrier().hasPendingDraft();
  }

  private retryProjection(): SaveRetryProjection | undefined {
    if (!this.waitingForRetry()) return undefined;
    return {
      attempt: this.retryAttempts,
      maxAttempts: this.maxRetries,
      ...(this.retryAt === undefined ? {} : { nextAttemptAt: this.retryAt }),
      exhausted: this.retryAttempts >= this.maxRetries,
    };
  }

  private scheduleCurrent(): void {
    if (this.disposed) return;
    this.scheduleDebounce();
    if (this.timer !== undefined) this.clearRetryTimer();
    else this.scheduleRetry();
    // Publishing calls scheduleCurrent again; the timers are already settled, so it stops there.
    this.options.workspace.setAutomaticRetry(this.retryProjection());
  }

  private scheduleDebounce(): void {
    if (!this.isEligibleForAutomaticSave() || this.running) {
      this.clearTimer();
      return;
    }
    const token = this.sourceToken();
    if (this.timer !== undefined && this.timerToken === token) return;
    this.clearTimer();
    this.timerToken = token;
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      this.timerToken = undefined;
      void this.runScheduled();
    }, this.debounceMs);
  }

  private scheduleRetry(): void {
    if (!this.isEligibleForRetry() || this.running) {
      this.clearRetryTimer();
      return;
    }
    if (this.retryTimer !== undefined) return;
    const delay = this.retryDelaysMs[Math.min(this.retryAttempts, this.retryDelaysMs.length - 1)] ?? 0;
    this.retryAt = this.now() + delay;
    this.retryTimer = this.clock.setTimeout(() => {
      this.retryTimer = undefined;
      this.retryAt = undefined;
      void this.runRetry();
    }, delay);
  }

  private async runOne(): Promise<ManualSaveResult> {
    const result = await this.options.saveCoordinator.save();
    if (!isRetryableManualResult(result)) return result;
    await this.options.saveCoordinator.waitForActiveSave();
    if (this.disposed) {
      return { ok: false, error: { code: 'STALE_RESULT', message: 'Autosave coordinator is disposed' } };
    }
    return this.options.saveCoordinator.save();
  }

  private async runScheduled(): Promise<ManualSaveResult> {
    if (this.disposed || !this.isEligibleForAutomaticSave()) {
      return { ok: true, acknowledged: false };
    }
    return this.runGuarded();
  }

  private async runRetry(): Promise<ManualSaveResult> {
    if (this.disposed || this.running || !this.isEligibleForRetry()) {
      this.scheduleCurrent();
      return { ok: true, acknowledged: false };
    }
    this.retryAttempts += 1;
    return this.runGuarded();
  }

  private async runGuarded(): Promise<ManualSaveResult> {
    if (this.running) return this.running;
    const execution = this.runOne();
    this.running = execution;
    try {
      const result = await execution;
      this.recordResult(result);
      return result;
    } finally {
      if (this.running === execution) this.running = undefined;
      this.scheduleCurrent();
    }
  }

  /** Manual Save: cancel debounce, join/wait active work, then persist the newest safe authored state. */
  async flush(): Promise<ManualSaveResult> {
    this.clearTimer();
    this.clearRetryTimer();
    if (this.disposed) {
      return { ok: false, error: { code: 'STALE_RESULT', message: 'Autosave coordinator is disposed' } };
    }
    this.suspendedSessionToken = undefined;
    // A person's Salvar (or the connection coming back) starts a fresh set of automatic retries.
    this.retryAttempts = 0;
    if (this.running) await this.running;
    if (this.disposed) {
      return { ok: false, error: { code: 'STALE_RESULT', message: 'Autosave coordinator is disposed' } };
    }

    let result = await this.runOne();
    while (result.ok && !this.disposed) {
      const snapshot = this.options.workspace.getSnapshot();
      if (!snapshot.dirty || snapshot.binding.kind !== 'PERSISTED' || snapshot.save.phase !== 'idle') break;
      result = await this.runOne();
    }
    this.recordResult(result);
    this.scheduleCurrent();
    return result;
  }

  /** Explicit meaningful retry trigger, e.g. browser `online` or a user retry action. */
  async retryNow(): Promise<ManualSaveResult> {
    this.clearTimer();
    return this.flush();
  }

  resumeAfterAuthorityChange(): void {
    this.suspendedSessionToken = undefined;
    this.scheduleCurrent();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    this.clearRetryTimer();
    this.unsubscribe();
  }
}
