import type { ManualSaveResult, SaveCoordinator } from './save-coordinator';
import type { PersistenceWorkspace } from './workspace';

export interface AutosaveClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AutosaveCoordinatorOptions {
  readonly workspace: PersistenceWorkspace;
  readonly saveCoordinator: SaveCoordinator;
  readonly debounceMs?: number;
  readonly clock?: AutosaveClock;
}

const DEFAULT_DEBOUNCE_MS = 1200;

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
  private readonly unsubscribe: () => void;
  private timer: unknown | undefined;
  private timerToken: string | undefined;
  private running: Promise<ManualSaveResult> | undefined;
  private suspendedSessionToken: string | undefined;
  private disposed = false;

  constructor(private readonly options: AutosaveCoordinatorOptions) {
    this.clock = options.clock ?? browserClock;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
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
  }

  private recordResult(result: ManualSaveResult): void {
    if (result.ok) return;
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
    }
  }

  private clearTimer(): void {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
    this.timerToken = undefined;
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

  private scheduleCurrent(): void {
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

  private async runOne(): Promise<ManualSaveResult> {
    const result = await this.options.saveCoordinator.save();
    if (!isRetryableManualResult(result)) return result;
    await this.options.saveCoordinator.waitForActiveSave();
    return this.options.saveCoordinator.save();
  }

  private async runScheduled(): Promise<ManualSaveResult> {
    if (this.disposed || !this.isEligibleForAutomaticSave()) {
      return { ok: true, acknowledged: false };
    }
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
    if (this.disposed) {
      return { ok: false, error: { code: 'STALE_RESULT', message: 'Autosave coordinator is disposed' } };
    }
    this.suspendedSessionToken = undefined;
    if (this.running) await this.running;

    let result = await this.runOne();
    while (result.ok) {
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
    this.unsubscribe();
  }
}
