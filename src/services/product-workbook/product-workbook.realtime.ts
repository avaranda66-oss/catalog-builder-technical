import type { WorkbookOwner } from '@/domain/product-workbook';

export interface ProductWorkbookRealtimePayload {
  readonly eventType: string;
  readonly new?: Readonly<Record<string, unknown>> | null;
  readonly old?: Readonly<Record<string, unknown>> | null;
}

export interface ProductWorkbookRealtimeMetadata {
  readonly eventType: string;
  readonly owner: WorkbookOwner;
  readonly revision: number;
}

export type ProductWorkbookCatchUpReason = 'initial' | 'disconnect' | 'event';

export interface ProductWorkbookRealtimeSink {
  requireCatchUp(reason: ProductWorkbookCatchUpReason, metadata?: ProductWorkbookRealtimeMetadata): void;
  catchUp(metadata?: ProductWorkbookRealtimeMetadata): Promise<boolean | void>;
  isProductInActiveScope?(productId: string): boolean;
}

export interface ProductWorkbookRealtimeChannel {
  on(
    type: 'postgres_changes',
    filter: { event: '*'; schema: 'public'; table: 'product_workbooks' | 'products' },
    callback: (payload: ProductWorkbookRealtimePayload) => void
  ): ProductWorkbookRealtimeChannel;
  subscribe(callback: (status: string, error?: Error) => void): ProductWorkbookRealtimeChannel;
}

export interface ProductWorkbookRealtimeClient {
  channel(name: string): ProductWorkbookRealtimeChannel;
  removeChannel(channel: ProductWorkbookRealtimeChannel): Promise<unknown> | unknown;
}

function eventRow(payload: ProductWorkbookRealtimePayload): Readonly<Record<string, unknown>> | null {
  return payload.eventType === 'DELETE'
    ? payload.old ?? payload.new ?? null
    : payload.new ?? payload.old ?? null;
}

/**
 * Realtime is notification metadata only. The caller must reread the workbook
 * through ProductWorkbookRepository before treating the revision as authority.
 */
export function getProductWorkbookRealtimeMetadata(
  payload: ProductWorkbookRealtimePayload
): ProductWorkbookRealtimeMetadata | null {
  const row = eventRow(payload);
  if (!row) return null;

  const ownerKind = row.owner_kind;
  const ownerId = row.owner_id;
  const revision = row.revision;
  if (ownerKind !== 'product' && ownerKind !== 'family') return null;
  if (typeof ownerId !== 'string' || ownerId.trim() === '') return null;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) return null;

  return {
    eventType: payload.eventType,
    owner: { kind: ownerKind, id: ownerId },
    revision
  };
}

function ownerKey(metadata: ProductWorkbookRealtimeMetadata): string {
  return `${metadata.owner.kind}:${metadata.owner.id}`;
}

function registryProductId(payload: ProductWorkbookRealtimePayload): string | null {
  const candidates = [payload.new?.id, payload.old?.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  }
  return null;
}

const CATCH_UP_RETRY_BASE_DELAY_MS = 250;
const CATCH_UP_RETRY_MAX_DELAY_MS = 4_000;

/**
 * Coordinates WAL notifications and reconnects without ever accepting WAL rows
 * as factual truth. Every accepted notification causes an authoritative reread.
 */
export class ProductWorkbookRealtimeCoordinator {
  private channel: ProductWorkbookRealtimeChannel | null = null;
  private active = false;
  private lifecycleGeneration = 0;
  private subscribed = false;
  private globalCatchUpRequired = false;
  private globalCatchUpGeneration = 0;
  private globalFlight: Promise<void> | null = null;
  private globalRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private globalRetryAttempt = 0;
  private readonly ownerFlights = new Map<string, Promise<void>>();
  private readonly pendingOwners = new Map<string, ProductWorkbookRealtimeMetadata>();
  private readonly ownerRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly ownerRetryAttempts = new Map<string, number>();
  private readonly seenNotifications = new Set<string>();

  constructor(
    private readonly client: ProductWorkbookRealtimeClient,
    private readonly sink: ProductWorkbookRealtimeSink,
    private readonly channelName = 'realtime:product-workbooks'
  ) {}

  public start(): () => void {
    if (this.active) return () => this.stop();

    this.active = true;
    const lifecycle = ++this.lifecycleGeneration;
    this.requireGlobalCatchUp('initial');

    this.channel = this.client
      .channel(this.channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_workbooks' },
        (payload) => this.handleNotification(payload, lifecycle)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => this.handleRegistryNotification(payload, lifecycle)
      )
      .subscribe((status) => this.handleStatus(status, lifecycle));

    return () => this.stop();
  }

  private handleStatus(status: string, lifecycle: number): void {
    if (!this.isCurrent(lifecycle)) return;

    if (status === 'SUBSCRIBED') {
      const reconnected = !this.subscribed;
      this.subscribed = true;
      if (reconnected) this.cancelGlobalRetry(true);
      if (this.globalCatchUpRequired) this.scheduleGlobalCatchUp(lifecycle);
      return;
    }

    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      this.subscribed = false;
      this.cancelGlobalRetry();
      this.requireGlobalCatchUp('disconnect');
    }
  }

  private handleRegistryNotification(payload: ProductWorkbookRealtimePayload, lifecycle: number): void {
    if (!this.isCurrent(lifecycle)) return;

    const productId = registryProductId(payload);
    if (productId && this.sink.isProductInActiveScope && !this.sink.isProductInActiveScope(productId)) {
      return;
    }

    this.requireGlobalCatchUp('event');
    if (this.subscribed) this.scheduleGlobalCatchUp(lifecycle);
  }

  private handleNotification(payload: ProductWorkbookRealtimePayload, lifecycle: number): void {
    if (!this.isCurrent(lifecycle)) return;
    const metadata = getProductWorkbookRealtimeMetadata(payload);
    if (!metadata) return;

    const fingerprint = `${metadata.eventType}:${ownerKey(metadata)}:${metadata.revision}`;
    if (this.seenNotifications.has(fingerprint)) return;
    this.seenNotifications.add(fingerprint);
    if (this.seenNotifications.size > 256) {
      const oldest = this.seenNotifications.values().next().value as string | undefined;
      if (oldest) this.seenNotifications.delete(oldest);
    }

    this.sink.requireCatchUp('event', metadata);
    const key = ownerKey(metadata);
    const pending = this.pendingOwners.get(key);
    if (!pending || metadata.revision >= pending.revision) {
      this.pendingOwners.set(key, metadata);
    }
    this.scheduleOwnerCatchUp(key, lifecycle);
  }

  private requireGlobalCatchUp(reason: ProductWorkbookCatchUpReason): void {
    this.globalCatchUpRequired = true;
    this.globalCatchUpGeneration += 1;
    this.sink.requireCatchUp(reason);
  }

  private scheduleGlobalCatchUp(lifecycle: number): void {
    if (
      this.globalFlight
      || this.globalRetryTimer
      || !this.subscribed
      || !this.globalCatchUpRequired
      || !this.isCurrent(lifecycle)
    ) return;

    let failed = false;
    const request = (async () => {
      while (this.isCurrent(lifecycle) && this.subscribed && this.globalCatchUpRequired) {
        const generation = this.globalCatchUpGeneration;
        try {
          const succeeded = await this.sink.catchUp();
          if (succeeded === false) {
            failed = true;
            return;
          }
        } catch {
          failed = true;
          return;
        }
        if (!this.isCurrent(lifecycle)) return;
        if (generation === this.globalCatchUpGeneration) {
          this.globalCatchUpRequired = false;
          this.globalRetryAttempt = 0;
        }
      }
    })();

    const tracked = request.finally(() => {
      if (this.globalFlight === tracked) {
        this.globalFlight = null;
        if (failed && this.isCurrent(lifecycle) && this.subscribed && this.globalCatchUpRequired) {
          this.scheduleGlobalRetry(lifecycle);
        } else if (this.isCurrent(lifecycle) && this.subscribed && this.globalCatchUpRequired) {
          this.scheduleGlobalCatchUp(lifecycle);
        }
      }
    });
    this.globalFlight = tracked;
  }

  private scheduleGlobalRetry(lifecycle: number): void {
    if (
      this.globalRetryTimer
      || !this.subscribed
      || !this.globalCatchUpRequired
      || !this.isCurrent(lifecycle)
    ) return;

    const delay = Math.min(
      CATCH_UP_RETRY_BASE_DELAY_MS * (2 ** Math.min(this.globalRetryAttempt, 4)),
      CATCH_UP_RETRY_MAX_DELAY_MS
    );
    this.globalRetryAttempt += 1;
    this.globalRetryTimer = setTimeout(() => {
      this.globalRetryTimer = null;
      if (this.isCurrent(lifecycle) && this.subscribed && this.globalCatchUpRequired) {
        this.scheduleGlobalCatchUp(lifecycle);
      }
    }, delay);
  }

  private cancelGlobalRetry(resetAttempt = false): void {
    if (this.globalRetryTimer) {
      clearTimeout(this.globalRetryTimer);
      this.globalRetryTimer = null;
    }
    if (resetAttempt) this.globalRetryAttempt = 0;
  }

  private scheduleOwnerCatchUp(key: string, lifecycle: number): void {
    if (
      this.ownerFlights.has(key)
      || this.ownerRetryTimers.has(key)
      || !this.isCurrent(lifecycle)
    ) return;

    let failed = false;
    const request = (async () => {
      while (this.isCurrent(lifecycle)) {
        const metadata = this.pendingOwners.get(key);
        if (!metadata) return;
        try {
          const succeeded = await this.sink.catchUp(metadata);
          if (succeeded === false) {
            failed = true;
            return;
          }
        } catch {
          failed = true;
          return;
        }
        if (!this.isCurrent(lifecycle)) return;
        if (this.pendingOwners.get(key) === metadata) {
          this.pendingOwners.delete(key);
          this.cancelOwnerRetry(key, true);
        }
      }
    })();

    const tracked = request.finally(() => {
      if (this.ownerFlights.get(key) === tracked) {
        this.ownerFlights.delete(key);
      }
      if (failed && this.pendingOwners.has(key) && this.isCurrent(lifecycle)) {
        this.scheduleOwnerRetry(key, lifecycle);
      } else if (this.pendingOwners.has(key) && this.isCurrent(lifecycle)) {
        this.scheduleOwnerCatchUp(key, lifecycle);
      }
    });
    this.ownerFlights.set(key, tracked);
  }

  private scheduleOwnerRetry(key: string, lifecycle: number): void {
    if (
      this.ownerRetryTimers.has(key)
      || !this.pendingOwners.has(key)
      || !this.isCurrent(lifecycle)
    ) return;

    const attempt = this.ownerRetryAttempts.get(key) ?? 0;
    const delay = Math.min(
      CATCH_UP_RETRY_BASE_DELAY_MS * (2 ** Math.min(attempt, 4)),
      CATCH_UP_RETRY_MAX_DELAY_MS
    );
    this.ownerRetryAttempts.set(key, attempt + 1);
    const timer = setTimeout(() => {
      if (this.ownerRetryTimers.get(key) !== timer) return;
      this.ownerRetryTimers.delete(key);
      if (this.pendingOwners.has(key) && this.isCurrent(lifecycle)) {
        this.scheduleOwnerCatchUp(key, lifecycle);
      }
    }, delay);
    this.ownerRetryTimers.set(key, timer);
  }

  private cancelOwnerRetry(key: string, resetAttempt = false): void {
    const timer = this.ownerRetryTimers.get(key);
    if (timer) clearTimeout(timer);
    this.ownerRetryTimers.delete(key);
    if (resetAttempt) this.ownerRetryAttempts.delete(key);
  }

  private cancelOwnerRetries(): void {
    for (const timer of this.ownerRetryTimers.values()) clearTimeout(timer);
    this.ownerRetryTimers.clear();
    this.ownerRetryAttempts.clear();
  }

  private isCurrent(lifecycle: number): boolean {
    return this.active && lifecycle === this.lifecycleGeneration;
  }

  private stop(): void {
    if (!this.active) return;
    this.active = false;
    this.subscribed = false;
    this.lifecycleGeneration += 1;
    this.cancelGlobalRetry(true);
    this.cancelOwnerRetries();
    this.pendingOwners.clear();
    this.seenNotifications.clear();
    const channel = this.channel;
    this.channel = null;
    if (channel) void this.client.removeChannel(channel);
  }
}
