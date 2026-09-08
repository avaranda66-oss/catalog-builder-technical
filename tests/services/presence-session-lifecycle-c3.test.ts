import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/supabase.service', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/supabase.service')>(
    '../../src/services/supabase.service'
  );
  return {
    ...actual,
    getSupabase: vi.fn()
  };
});

import { PresenceService, type ParticipantSession } from '../../src/services/presence.service';
import { getSupabase } from '../../src/services/supabase.service';
import { useAuthStore } from '../../src/stores/useAuthStore';

type ChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

class MockRealtimeChannel {
  readonly handlers = new Map<string, (...args: any[]) => void>();
  readonly track = vi.fn().mockResolvedValue('ok');
  readonly untrack = vi.fn().mockResolvedValue('ok');
  readonly presenceState = vi.fn().mockReturnValue({});
  private statusCallback: ((status: ChannelStatus) => Promise<void> | void) | null = null;

  constructor(readonly name: string) {}

  on(type: string, filter: { event: string }, callback: (...args: any[]) => void) {
    this.handlers.set(`${type}:${filter.event}`, callback);
    return this;
  }

  subscribe(callback: (status: ChannelStatus) => Promise<void> | void) {
    this.statusCallback = callback;
    return this;
  }

  async emitStatus(status: ChannelStatus): Promise<void> {
    await this.statusCallback?.(status);
  }

  emitSync(): void {
    this.handlers.get('presence:sync')?.();
  }
}

function createSupabaseMock() {
  const channels: MockRealtimeChannel[] = [];
  return {
    channels,
    channel: vi.fn((name: string) => {
      const channel = new MockRealtimeChannel(name);
      channels.push(channel);
      return channel;
    }),
    removeChannel: vi.fn().mockResolvedValue('ok')
  };
}

function resetPresenceService(): void {
  const service = PresenceService as any;
  if (service.heartbeatTimer) clearInterval(service.heartbeatTimer);
  if (service.reconnectTimer) clearTimeout(service.reconnectTimer);
  Object.assign(service, {
    activeTarget: null,
    activeChannel: null,
    currentTrackPayload: null,
    onSyncCallback: null,
    onStatusChangeCallback: null,
    heartbeatTimer: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    isExplicitlyLeaving: false,
    lastSubscribedStatus: 'disconnected',
    sessionGeneration: 0
  });
}

function setIdentity(userId: string, clientInstanceId: string): void {
  sessionStorage.setItem('cb_client_instance_id', clientInstanceId);
  useAuthStore.setState({
    status: 'authenticated',
    userId,
    email: `${userId}@example.com`,
    role: 'editor',
    errorMessage: null
  });
}

describe('C3 — Presence session identity and async lifecycle', () => {
  let supabase: ReturnType<typeof createSupabaseMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sessionStorage.clear();
    resetPresenceService();
    supabase = createSupabaseMock();
    vi.mocked(getSupabase).mockReturnValue(supabase as any);
    setIdentity('user-a', 'client-a');
  });

  afterEach(() => {
    resetPresenceService();
    vi.useRealTimers();
  });

  it('C3-T1: A leave resolving after B activates cannot clear or remove B', async () => {
    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-a' });
    const channelA = supabase.channels[0];
    const oldUntrack = deferred<string>();
    channelA.untrack.mockReturnValue(oldUntrack.promise);

    const leaveA = PresenceService.leave();
    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-b' });
    const channelB = supabase.channels[1];

    oldUntrack.resolve('ok');
    await leaveA;
    await Promise.resolve();

    expect(PresenceService.getActiveDocumentTarget()).toEqual({ kind: 'catalog', id: 'catalog-b' });
    expect(PresenceService.getCurrentSession()?.documentId).toBe('catalog-b');
    expect((PresenceService as any).activeChannel).toBe(channelB);
    expect(supabase.removeChannel).not.toHaveBeenCalledWith(channelB);
  });

  it('C3-T2: late SUBSCRIBED from obsolete A is inert after B activates', async () => {
    const statusesB = vi.fn();
    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-a' });
    const channelA = supabase.channels[0];
    channelA.untrack.mockReturnValue(new Promise(() => undefined));

    PresenceService.subscribeToDocument(
      { kind: 'catalog', id: 'catalog-b' },
      1,
      undefined,
      undefined,
      statusesB
    );
    const channelB = supabase.channels[1];
    const bTrackCount = channelB.track.mock.calls.length;
    statusesB.mockClear();

    await channelA.emitStatus('SUBSCRIBED');

    expect(statusesB).not.toHaveBeenCalled();
    expect(channelA.track).not.toHaveBeenCalled();
    expect(channelB.track).toHaveBeenCalledTimes(bTrackCount);
    expect((PresenceService as any).heartbeatTimer).toBeNull();
  });

  it.each(['CHANNEL_ERROR', 'TIMED_OUT'] as const)(
    'C3-T3: late %s from obsolete A is inert after B activates',
    async (lateStatus) => {
      const statusesB = vi.fn();
      PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-a' });
      const channelA = supabase.channels[0];
      channelA.untrack.mockReturnValue(new Promise(() => undefined));
      PresenceService.subscribeToDocument(
        { kind: 'catalog', id: 'catalog-b' },
        1,
        undefined,
        undefined,
        statusesB
      );
      statusesB.mockClear();

      await channelA.emitStatus(lateStatus);

      expect(statusesB).not.toHaveBeenCalled();
      expect((PresenceService as any).reconnectTimer).toBeNull();
      expect(supabase.channel).toHaveBeenCalledTimes(2);
    }
  );

  it('C3-T4: reconnect callback owned by A cannot replace active B', async () => {
    let reconnectA: (() => void) | null = null;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler) => {
      reconnectA = handler as () => void;
      return 41 as any;
    }) as typeof setTimeout);

    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-a' });
    const channelA = supabase.channels[0];
    channelA.untrack.mockReturnValue(new Promise(() => undefined));
    await channelA.emitStatus('CHANNEL_ERROR');
    expect(reconnectA).not.toBeNull();

    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-b' });
    const channelB = supabase.channels[1];
    const channelsBeforeLateTimer = supabase.channels.length;
    (reconnectA as unknown as () => void)();

    expect(supabase.channels).toHaveLength(channelsBeforeLateTimer);
    expect(supabase.removeChannel).not.toHaveBeenCalledWith(channelB);
    expect((PresenceService as any).activeChannel).toBe(channelB);
  });

  it('C3-T5: obsolete A heartbeat cannot track B payload', async () => {
    const heartbeatCallbacks: Array<() => Promise<void>> = [];
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      heartbeatCallbacks.push(handler as () => Promise<void>);
      return (41 + heartbeatCallbacks.length) as any;
    }) as typeof setInterval);

    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-a' });
    const channelA = supabase.channels[0];
    channelA.untrack.mockReturnValue(new Promise(() => undefined));
    await channelA.emitStatus('SUBSCRIBED');
    const heartbeatA = heartbeatCallbacks[0];
    expect(heartbeatA).toBeTypeOf('function');

    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-b' });
    const channelB = supabase.channels[1];
    await channelB.emitStatus('SUBSCRIBED');
    const bTrackCount = channelB.track.mock.calls.length;
    await heartbeatA();

    expect(channelB.track).toHaveBeenCalledTimes(bTrackCount);
    expect(channelA.track).not.toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'catalog-b' })
    );
  });

  it('C3-T6: catalog target and payload retain catalog identity', () => {
    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-a' });

    expect(supabase.channels[0].name).toBe('presence:catalog:catalog-a');
    expect(PresenceService.getActiveDocumentTarget()).toEqual({ kind: 'catalog', id: 'catalog-a' });
    expect(PresenceService.getCurrentSession()).toMatchObject({
      documentKind: 'catalog',
      documentId: 'catalog-a',
      catalogId: 'catalog-a'
    });
  });

  it('C3-T7/C3-T8: template target uses its real id and never populates catalogId', () => {
    PresenceService.subscribeToDocument({ kind: 'template', id: 'template-a' });
    const session = PresenceService.getCurrentSession();

    expect(supabase.channels[0].name).toBe('presence:template:template-a');
    expect(PresenceService.getActiveDocumentTarget()).toEqual({ kind: 'template', id: 'template-a' });
    expect(session).toMatchObject({ documentKind: 'template', documentId: 'template-a' });
    expect(session).not.toHaveProperty('catalogId');
    expect(PresenceService.getActiveCatalogId()).toBeNull();
  });

  it('C3-T7: template identity survives location updates and reconnect', async () => {
    PresenceService.subscribeToDocument({ kind: 'template', id: 'template-a' });
    const firstChannel = supabase.channels[0];
    await firstChannel.emitStatus('SUBSCRIBED');
    firstChannel.track.mockClear();

    await PresenceService.updateLocation(2, 'template-page-2', 'block-a', 'text', 'editing');

    expect(firstChannel.track).toHaveBeenCalledWith(
      expect.objectContaining({
        documentKind: 'template',
        documentId: 'template-a',
        pageNumber: 2,
        pageId: 'template-page-2'
      })
    );
    expect(firstChannel.track.mock.calls[0][0]).not.toHaveProperty('catalogId');

    await firstChannel.emitStatus('CHANNEL_ERROR');
    vi.advanceTimersByTime(1000);

    expect(supabase.channels[1].name).toBe('presence:template:template-a');
    expect(PresenceService.getActiveDocumentTarget()).toEqual({ kind: 'template', id: 'template-a' });
    expect(PresenceService.getCurrentSession()).toMatchObject({
      documentKind: 'template',
      documentId: 'template-a',
      pageNumber: 2
    });
  });

  it('C3-T9: explicit leave cleans the current session exactly once', async () => {
    const statuses = vi.fn();
    PresenceService.subscribeToDocument(
      { kind: 'catalog', id: 'catalog-a' },
      1,
      undefined,
      undefined,
      statuses
    );
    const channelA = supabase.channels[0];
    await channelA.emitStatus('SUBSCRIBED');
    statuses.mockClear();

    await PresenceService.leave();
    await PresenceService.leave();

    expect(channelA.untrack).toHaveBeenCalledTimes(1);
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(supabase.removeChannel).toHaveBeenCalledWith(channelA);
    expect(PresenceService.getActiveDocumentTarget()).toBeNull();
    expect(PresenceService.getCurrentSession()).toBeNull();
    expect(statuses).toHaveBeenCalledTimes(1);
    expect(statuses).toHaveBeenCalledWith('disconnected');
  });

  it('C3-T10: same-target subscription with the same identity does not duplicate channels', () => {
    const first = PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-a' }, 1);
    const second = PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-a' }, 2);

    expect(second).toBe(first);
    expect(supabase.channel).toHaveBeenCalledTimes(1);
    expect(PresenceService.getCurrentSession()?.pageNumber).toBe(2);
  });

  it('C3-T11: same-target auth identity replacement creates a new owned session', async () => {
    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-a' });
    const channelA = supabase.channels[0];
    channelA.untrack.mockReturnValue(new Promise(() => undefined));

    setIdentity('user-b', 'client-b');
    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-a' });

    expect(supabase.channel).toHaveBeenCalledTimes(2);
    expect(PresenceService.getCurrentSession()).toMatchObject({
      presenceKey: 'user-b:client-b',
      userId: 'user-b',
      clientInstanceId: 'client-b'
    });

    await channelA.emitStatus('SUBSCRIBED');
    expect(channelA.track).not.toHaveBeenCalledWith(
      expect.objectContaining({ presenceKey: 'user-b:client-b' })
    );
  });

  it('C3-T12: synchronous unload cleanup detaches A before any later subscription', async () => {
    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-a' });
    const channelA = supabase.channels[0];
    const oldUntrack = deferred<string>();
    channelA.untrack.mockReturnValue(oldUntrack.promise);

    (PresenceService as any).leaveSync();
    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-b' });
    const channelB = supabase.channels[1];
    oldUntrack.resolve('ok');
    await Promise.resolve();
    await Promise.resolve();

    expect(channelA.untrack).toHaveBeenCalledTimes(1);
    expect(supabase.removeChannel).toHaveBeenCalledWith(channelA);
    expect(supabase.removeChannel).not.toHaveBeenCalledWith(channelB);
    expect((PresenceService as any).activeChannel).toBe(channelB);
    expect(PresenceService.getActiveDocumentId()).toBe('catalog-b');
  });

  it('C3-T13: obsolete A sync callback cannot publish participants into B callback', () => {
    const syncA = vi.fn();
    const syncB = vi.fn();
    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-a' }, 1, undefined, syncA);
    const channelA = supabase.channels[0];
    channelA.untrack.mockReturnValue(new Promise(() => undefined));
    PresenceService.subscribeToDocument({ kind: 'catalog', id: 'catalog-b' }, 1, undefined, syncB);

    const oldParticipant: ParticipantSession = {
      presenceKey: 'old:client',
      userId: 'old',
      clientInstanceId: 'client',
      displayLabel: 'Old',
      avatarText: 'OL',
      documentKind: 'catalog',
      documentId: 'catalog-a',
      catalogId: 'catalog-a',
      pageNumber: 1,
      activity: 'viewing',
      lastInteractionAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      color: '#0284c7'
    };
    channelA.presenceState.mockReturnValue({ old: [oldParticipant] });
    channelA.emitSync();

    expect(syncA).not.toHaveBeenCalled();
    expect(syncB).not.toHaveBeenCalled();
  });
});
