import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase.service';
import { useAuthStore } from '../stores/useAuthStore';
import { getClientInstanceId } from '../stores/useCatalogStore';

export interface DocumentPresenceTarget {
  kind: 'catalog' | 'template';
  id: string;
}

export type PresenceConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ParticipantSession {
  presenceKey: string;
  userId: string;
  clientInstanceId: string;
  displayLabel: string;
  avatarText: string;
  documentKind: 'catalog' | 'template';
  documentId: string;
  catalogId?: string;
  pageId?: string;
  pageNumber: number;
  blockId?: string | null;
  blockType?: string | null;
  activity: 'viewing' | 'editing';
  lastInteractionAt: string;
  lastSeenAt?: string;
  color: string;
}

const PARTICIPANT_COLORS = [
  '#0284c7', // Sky blue
  '#16a34a', // Emerald green
  '#d97706', // Amber
  '#9333ea', // Purple
  '#e11d48', // Rose
  '#0d9488', // Teal
  '#ea580c', // Orange
  '#4f46e5'  // Indigo
];

export function getParticipantColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PARTICIPANT_COLORS.length;
  return PARTICIPANT_COLORS[index];
}

export function formatInitials(label: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function buildDisplayLabel(email?: string, name?: string): string {
  if (name && name.trim()) return name.trim();
  if (email && email.includes('@')) {
    const local = email.split('@')[0];
    if (local.toLowerCase().includes('presys')) {
      return 'PRESYS ' + local.replace(/presys/i, '').replace(/[^a-zA-Z0-9]/g, ' ').trim();
    }
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return 'Colaborador';
}

const STALE_SESSION_THRESHOLD_MS = 75000; // 75 segundos
const HEARTBEAT_INTERVAL_MS = 25000; // 25 segundos
const RECONNECT_BACKOFF_DELAYS = [1000, 2000, 5000, 10000];

class PresenceServiceClass {
  private activeTarget: DocumentPresenceTarget | null = null;
  private activeChannel: RealtimeChannel | null = null;
  private currentTrackPayload: ParticipantSession | null = null;
  private onSyncCallback: ((participants: Record<string, ParticipantSession>) => void) | null = null;
  private onStatusChangeCallback: ((status: PresenceConnectionStatus) => void) | null = null;
  
  private heartbeatTimer: any = null;
  private reconnectTimer: any = null;
  private reconnectAttempt: number = 0;
  private isExplicitlyLeaving: boolean = false;
  private lastSubscribedStatus: PresenceConnectionStatus = 'disconnected';
  private sessionGeneration: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.leaveSync();
      });
      window.addEventListener('pagehide', () => {
        this.leaveSync();
      });
      window.addEventListener('online', () => {
        if (this.activeTarget && this.lastSubscribedStatus !== 'connected') {
          console.log('[PRESENCE] Conexão de rede restaurada (online event) -> reconectando...');
          this.reconnect(this.sessionGeneration);
        }
      });
      window.addEventListener('offline', () => {
        console.log('[PRESENCE] Conexão de rede perdida (offline event)');
        this.notifyStatus('error');
      });
    }
  }

  public getActiveDocumentTarget(): DocumentPresenceTarget | null {
    return this.activeTarget;
  }

  public getActiveDocumentId(): string | null {
    return this.activeTarget?.id || null;
  }

  public getActiveCatalogId(): string | null {
    return this.activeTarget?.kind === 'catalog' ? this.activeTarget.id : null;
  }

  public getCurrentSession(): ParticipantSession | null {
    return this.currentTrackPayload;
  }

  public setStatusCallback(cb: (status: PresenceConnectionStatus) => void): void {
    this.onStatusChangeCallback = cb;
  }

  private ownsSession(generation: number, channel?: RealtimeChannel): boolean {
    return (
      generation === this.sessionGeneration &&
      (!channel || channel === this.activeChannel)
    );
  }

  private notifyStatus(status: PresenceConnectionStatus, generation: number = this.sessionGeneration) {
    if (!this.ownsSession(generation)) return;
    this.lastSubscribedStatus = status;
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(status);
    }
  }

  public subscribeToDocument(
    target: DocumentPresenceTarget,
    initialPageNumber: number = 1,
    initialPageId?: string,
    onSync?: (participants: Record<string, ParticipantSession>) => void,
    onStatusChange?: (status: PresenceConnectionStatus) => void
  ): RealtimeChannel | null {
    const supabase = getSupabase();
    if (!supabase || typeof (supabase as any).channel !== 'function') {
      this.onSyncCallback = onSync ?? null;
      this.onStatusChangeCallback = onStatusChange ?? null;
      this.notifyStatus('error');
      return null;
    }

    const authState = useAuthStore.getState();
    const userId = authState.userId || 'anon_user';
    const clientInstanceId = getClientInstanceId();
    const presenceKey = `${userId}:${clientInstanceId}`;

    // Se já está no mesmo canal com sucesso ou conectando, apenas atualiza localização
    if (
      this.activeChannel &&
      this.activeTarget &&
      this.activeTarget.kind === target.kind &&
      this.activeTarget.id === target.id &&
      this.currentTrackPayload?.presenceKey === presenceKey &&
      (this.lastSubscribedStatus === 'connected' || this.lastSubscribedStatus === 'connecting')
    ) {
      if (onSync) this.onSyncCallback = onSync;
      if (onStatusChange) this.onStatusChangeCallback = onStatusChange;
      void this.updateLocation(initialPageNumber, initialPageId);
      onStatusChange?.(this.lastSubscribedStatus);
      return this.activeChannel;
    }

    // Se estava em outro documento, faz cleanup anterior
    if (this.activeChannel || this.activeTarget || this.currentTrackPayload) {
      void this.leave();
    }

    const generation = ++this.sessionGeneration;
    this.isExplicitlyLeaving = false;
    this.reconnectAttempt = 0;
    this.activeTarget = { ...target };
    this.onSyncCallback = onSync ?? null;
    this.onStatusChangeCallback = onStatusChange ?? null;
    this.notifyStatus('connecting', generation);

    const displayLabel = buildDisplayLabel(authState.email || undefined);
    const color = getParticipantColor(presenceKey);
    const avatarText = formatInitials(displayLabel);
    const nowIso = new Date().toISOString();

    const initialSession: ParticipantSession = {
      presenceKey,
      userId,
      clientInstanceId,
      displayLabel,
      avatarText,
      documentKind: target.kind,
      documentId: target.id,
      ...(target.kind === 'catalog' ? { catalogId: target.id } : {}),
      pageId: initialPageId,
      pageNumber: initialPageNumber,
      blockId: null,
      blockType: null,
      activity: 'viewing',
      lastInteractionAt: nowIso,
      lastSeenAt: nowIso,
      color
    };

    this.currentTrackPayload = initialSession;
    return this.setupChannel(target, presenceKey, generation);
  }

  private setupChannel(
    target: DocumentPresenceTarget,
    presenceKey: string,
    generation: number
  ): RealtimeChannel | null {
    const supabase = getSupabase();
    if (!supabase || !this.ownsSession(generation)) return null;

    const channelName = `presence:${target.kind}:${target.id}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: presenceKey
        }
      }
    });
    if (!channel) {
      this.notifyStatus('error', generation);
      return null;
    }

    channel
      .on('presence', { event: 'sync' }, () => {
        if (!this.ownsSession(generation, channel)) return;
        const presenceState = channel.presenceState<ParticipantSession>();
        const flattened: Record<string, ParticipantSession> = {};
        const now = Date.now();

        for (const [key, sessions] of Object.entries(presenceState)) {
          if (sessions && sessions.length > 0) {
            // Pega a sessão mais recente para a chave
            const latest = sessions[sessions.length - 1];
            // Filtro defensivo de sessões stale (inativas por mais de 75s)
            const sessionTime = new Date(latest.lastSeenAt || latest.lastInteractionAt).getTime();
            if (now - sessionTime < STALE_SESSION_THRESHOLD_MS) {
              flattened[key] = latest;
            }
          }
        }

        if (this.onSyncCallback) {
          this.onSyncCallback(flattened);
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[PRESENCE JOIN]', { key, newPresences });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('[PRESENCE LEAVE]', { key, leftPresences });
      })
      .subscribe(async (status) => {
        console.log(`[PRESENCE STATUS] Canal: ${channelName} -> ${status}`);
        if (!this.ownsSession(generation, channel)) return;
        
        if (status === 'SUBSCRIBED') {
          this.reconnectAttempt = 0;
          this.notifyStatus('connected', generation);
          this.startHeartbeat(generation, channel);

          // Retrack imediato do payload ativo
          const payload = this.currentTrackPayload;
          if (payload) {
            try {
              await channel.track(payload);
            } catch (err) {
              console.warn('[PRESENCE TRACK ERROR]', err);
            }
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!this.isExplicitlyLeaving) {
            this.notifyStatus('reconnecting', generation);
            this.scheduleReconnect(generation, channel);
          }
        }
      });

    if (!this.ownsSession(generation)) {
      void supabase.removeChannel(channel);
      return null;
    }
    this.activeChannel = channel;
    return channel;
  }

  private startHeartbeat(generation: number, channel: RealtimeChannel): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      if (
        this.ownsSession(generation, channel) &&
        this.currentTrackPayload &&
        this.lastSubscribedStatus === 'connected'
      ) {
        const nowIso = new Date().toISOString();
        const payload: ParticipantSession = {
          ...this.currentTrackPayload,
          lastSeenAt: nowIso
        };
        this.currentTrackPayload = payload;
        try {
          await channel.track(payload);
        } catch (err) {
          console.warn('[PRESENCE HEARTBEAT ERROR]', err);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(generation: number, channel: RealtimeChannel): void {
    if (
      !this.ownsSession(generation, channel) ||
      this.isExplicitlyLeaving ||
      !this.activeTarget
    ) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = RECONNECT_BACKOFF_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_DELAYS.length - 1)];
    this.reconnectAttempt++;
    console.log(`[PRESENCE] Agendando reconexão em ${delay}ms (tentativa ${this.reconnectAttempt})...`);

    this.reconnectTimer = setTimeout(() => {
      if (!this.ownsSession(generation)) return;
      this.reconnectTimer = null;
      this.reconnect(generation);
    }, delay);
  }

  private reconnect(generation: number): void {
    if (!this.ownsSession(generation) || this.isExplicitlyLeaving || !this.activeTarget) return;

    console.log('[PRESENCE] Tentando reconectar ao canal de presença...');
    const target = { ...this.activeTarget };
    const presenceKey = this.currentTrackPayload?.presenceKey;
    if (!presenceKey) return;

    // Remove canal antigo se existir
    const previousChannel = this.activeChannel;
    if (previousChannel) {
      try {
        const supabase = getSupabase();
        if (supabase) void supabase.removeChannel(previousChannel);
      } catch (e) {
        // ignore
      }
      if (this.ownsSession(generation, previousChannel)) {
        this.activeChannel = null;
      }
    }

    this.setupChannel(target, presenceKey, generation);
  }

  public subscribeToCatalog(
    catalogId: string,
    initialPageNumber: number = 1,
    initialPageId?: string,
    onSync?: (participants: Record<string, ParticipantSession>) => void
  ): RealtimeChannel | null {
    return this.subscribeToDocument(
      { kind: 'catalog', id: catalogId },
      initialPageNumber,
      initialPageId,
      onSync
    );
  }

  public async updateLocation(
    pageNumber: number,
    pageId?: string,
    blockId?: string | null,
    blockType?: string | null,
    activity: 'viewing' | 'editing' = 'viewing'
  ): Promise<void> {
    const generation = this.sessionGeneration;
    const channel = this.activeChannel;
    const currentPayload = this.currentTrackPayload;
    if (!currentPayload || !this.ownsSession(generation)) return;

    const nowIso = new Date().toISOString();
    const updatedPayload: ParticipantSession = {
      ...currentPayload,
      pageNumber,
      pageId,
      blockId: blockId ?? null,
      blockType: blockType ?? null,
      activity,
      lastInteractionAt: nowIso,
      lastSeenAt: nowIso
    };
    this.currentTrackPayload = updatedPayload;

    if (channel && this.ownsSession(generation, channel) && this.lastSubscribedStatus === 'connected') {
      try {
        await channel.track(updatedPayload);
      } catch (err) {
        console.warn('[PRESENCE TRACK ERROR]', err);
      }
    }
  }

  public async leave(): Promise<void> {
    const leavingChannel = this.activeChannel;
    const statusCallback = this.onStatusChangeCallback;
    const hadActiveSession = Boolean(
      leavingChannel || this.activeTarget || this.currentTrackPayload || this.lastSubscribedStatus !== 'disconnected'
    );
    if (!hadActiveSession) return;

    this.isExplicitlyLeaving = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    ++this.sessionGeneration;
    this.activeChannel = null;
    this.activeTarget = null;
    this.currentTrackPayload = null;
    this.onSyncCallback = null;
    this.onStatusChangeCallback = null;
    this.reconnectAttempt = 0;
    this.lastSubscribedStatus = 'disconnected';
    statusCallback?.('disconnected');

    if (leavingChannel) {
      try {
        // untrack explícito antes de fechar o canal para evitar ghost session
        await leavingChannel.untrack();
      } catch (err) {
        // ignore
      }

      try {
        const supabase = getSupabase();
        if (supabase) {
          await supabase.removeChannel(leavingChannel);
        }
      } catch (err) {
        console.warn('[PRESENCE LEAVE ERROR]', err);
      }
    }
  }

  private leaveSync(): void {
    const leavingChannel = this.activeChannel;
    const hadActiveSession = Boolean(
      leavingChannel || this.activeTarget || this.currentTrackPayload || this.lastSubscribedStatus !== 'disconnected'
    );
    if (!hadActiveSession) return;

    this.isExplicitlyLeaving = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    ++this.sessionGeneration;
    this.activeChannel = null;
    this.activeTarget = null;
    this.currentTrackPayload = null;
    this.onSyncCallback = null;
    this.onStatusChangeCallback = null;
    this.reconnectAttempt = 0;
    this.lastSubscribedStatus = 'disconnected';

    if (leavingChannel) {
      try {
        void leavingChannel.untrack();
        const supabase = getSupabase();
        if (supabase) void supabase.removeChannel(leavingChannel);
      } catch (e) {
        // ignore
      }
    }
  }
}

export const PresenceService = new PresenceServiceClass();
