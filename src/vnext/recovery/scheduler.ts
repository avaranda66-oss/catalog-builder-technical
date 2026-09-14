export interface RecoverySchedulerClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const SYSTEM_CLOCK: RecoverySchedulerClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface RecoverySchedulerOptions<T> {
  readonly write: (value: T) => Promise<void>;
  readonly clock?: RecoverySchedulerClock;
  readonly trailingMs?: number;
  readonly maxWaitMs?: number;
  readonly onError?: (error: unknown) => void;
}

export class RecoveryWriteScheduler<T> {
  private readonly clock: RecoverySchedulerClock;
  private readonly trailingMs: number;
  private readonly maxWaitMs: number;
  private trailingHandle: unknown;
  private maxHandle: unknown;
  private pending: T | undefined;
  private burstStartedAt: number | undefined;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly options: RecoverySchedulerOptions<T>) {
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.trailingMs = options.trailingMs ?? 750;
    this.maxWaitMs = options.maxWaitMs ?? 3000;
  }

  schedule(value: T): void {
    if (this.burstStartedAt === undefined) {
      this.burstStartedAt = this.clock.now();
      this.enqueue(value);
      this.armMaxWait();
    } else {
      this.pending = value;
    }
    this.armTrailing();
  }

  private enqueue(value: T): void {
    this.tail = this.tail.then(
      () => this.options.write(value),
      () => this.options.write(value)
    );
    this.tail.catch((error) => this.options.onError?.(error));
  }

  private armTrailing(): void {
    if (this.trailingHandle !== undefined) this.clock.clearTimeout(this.trailingHandle);
    this.trailingHandle = this.clock.setTimeout(() => {
      this.trailingHandle = undefined;
      this.flushPendingToQueue();
    }, this.trailingMs);
  }

  private armMaxWait(): void {
    if (this.maxHandle !== undefined) return;
    const elapsed = this.burstStartedAt === undefined ? 0 : this.clock.now() - this.burstStartedAt;
    this.maxHandle = this.clock.setTimeout(() => {
      this.maxHandle = undefined;
      this.flushPendingToQueue();
    }, Math.max(0, this.maxWaitMs - elapsed));
  }

  private clearTimers(): void {
    if (this.trailingHandle !== undefined) this.clock.clearTimeout(this.trailingHandle);
    if (this.maxHandle !== undefined) this.clock.clearTimeout(this.maxHandle);
    this.trailingHandle = undefined;
    this.maxHandle = undefined;
  }

  private flushPendingToQueue(): void {
    const pending = this.pending;
    this.pending = undefined;
    this.clearTimers();
    this.burstStartedAt = undefined;
    if (pending !== undefined) this.enqueue(pending);
  }

  async flush(): Promise<void> {
    this.flushPendingToQueue();
    await this.tail;
  }

  async close(): Promise<void> {
    await this.flush();
  }
}
