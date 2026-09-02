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
          this.reconnect();
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

  private notifyStatus(status: PresenceConnectionStatus) {
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
    if (onSync) this.onSyncCallback = onSync;
    if (onStatusChange) this.onStatusChangeCallback = onStatusChange;

    const supabase = getSupabase();
    if (!supabase || typeof (supabase as any).channel !== 'function') {
      this.notifyStatus('error');
      return null;
    }

    // Se já está no mesmo canal com sucesso ou conectando, apenas atualiza localização
    if (
      this.activeChannel &&
      this.activeTarget &&
      this.activeTarget.kind === target.kind &&
      this.activeTarget.id === target.id &&
      (this.lastSubscribedStatus === 'connected' || this.lastSubscribedStatus === 'connecting')
    ) {
      void this.updateLocation(initialPageNumber, initialPageId);
      return this.activeChannel;
    }

    // Se estava em outro documento, faz cleanup anterior
    if (this.activeChannel) {
      this.leave();
    }

    this.isExplicitlyLeaving = false;
    this.reconnectAttempt = 0;
    this.activeTarget = target;
    this.notifyStatus('connecting');

    const authState = useAuthStore.getState();
    const userId = authState.userId || 'anon_user';
    const clientInstanceId = getClientInstanceId();
    const presenceKey = `${userId}:${clientInstanceId}`;
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
      catalogId: target.kind === 'catalog' ? target.id : undefined,
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
    return this.setupChannel(target, presenceKey);
  }

  private setupChannel(target: DocumentPresenceTarget, presenceKey: string): RealtimeChannel | null {
    const supabase = getSupabase();
    if (!supabase) return null;

    const channelName = `presence:${target.kind}:${target.id}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: presenceKey
        }
      }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
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
        
        if (status === 'SUBSCRIBED') {
          this.reconnectAttempt = 0;
          this.notifyStatus('connected');
          this.startHeartbeat();

          // Retrack imediato do payload ativo
          if (this.currentTrackPayload) {
            try {
              await channel.track(this.currentTrackPayload);
            } catch (err) {
              console.warn('[PRESENCE TRACK ERROR]', err);
            }
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!this.isExplicitlyLeaving) {
            this.notifyStatus('reconnecting');
            this.scheduleReconnect();
          }
        }
      });

    this.activeChannel = channel;
    return channel;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      if (this.activeChannel && this.currentTrackPayload && this.lastSubscribedStatus === 'connected') {
        const nowIso = new Date().toISOString();
        this.currentTrackPayload = {
          ...this.currentTrackPayload,
          lastSeenAt: nowIso
        };
        try {
          await this.activeChannel.track(this.currentTrackPayload);
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

  private scheduleReconnect(): void {
    if (this.isExplicitlyLeaving || !this.activeTarget) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = RECONNECT_BACKOFF_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_DELAYS.length - 1)];
    this.reconnectAttempt++;
    console.log(`[PRESENCE] Agendando reconexão em ${delay}ms (tentativa ${this.reconnectAttempt})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  private reconnect(): void {
    if (this.isExplicitlyLeaving || !this.activeTarget) return;

    console.log('[PRESENCE] Tentando reconectar ao canal de presença...');
    const target = this.activeTarget;

    // Remove canal antigo se existir
    if (this.activeChannel) {
      try {
        const supabase = getSupabase();
        if (supabase) supabase.removeChannel(this.activeChannel);
      } catch (e) {
        // ignore
      }
      this.activeChannel = null;
    }

    const authState = useAuthStore.getState();
    const userId = authState.userId || 'anon_user';
    const clientInstanceId = getClientInstanceId();
    const presenceKey = `${userId}:${clientInstanceId}`;

    this.setupChannel(target, presenceKey);
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
    if (!this.currentTrackPayload) return;

    const nowIso = new Date().toISOString();
    this.currentTrackPayload = {
      ...this.currentTrackPayload,
      pageNumber,
      pageId,
      blockId: blockId ?? null,
      blockType: blockType ?? null,
      activity,
      lastInteractionAt: nowIso,
      lastSeenAt: nowIso
    };

    if (this.activeChannel && this.lastSubscribedStatus === 'connected') {
      try {
        await this.activeChannel.track(this.currentTrackPayload);
      } catch (err) {
        console.warn('[PRESENCE TRACK ERROR]', err);
      }
    }
  }

  public async leave(): Promise<void> {
    this.isExplicitlyLeaving = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.activeChannel) {
      try {
        // untrack explícito antes de fechar o canal para evitar ghost session
        await this.activeChannel.untrack();
      } catch (err) {
        // ignore
      }

      try {
        const supabase = getSupabase();
        if (supabase) {
          supabase.removeChannel(this.activeChannel);
        }
      } catch (err) {
        console.warn('[PRESENCE LEAVE ERROR]', err);
      }
      this.activeChannel = null;
      this.activeTarget = null;
      this.currentTrackPayload = null;
      this.notifyStatus('disconnected');
    }
  }

  private leaveSync(): void {
    this.isExplicitlyLeaving = true;
    this.stopHeartbeat();
    if (this.activeChannel) {
      try {
        void this.activeChannel.untrack();
        const supabase = getSupabase();
        if (supabase) supabase.removeChannel(this.activeChannel);
      } catch (e) {
        // ignore
      }
    }
  }
}

export const PresenceService = new PresenceServiceClass();
