import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase.service';
import { useAuthStore } from '../stores/useAuthStore';
import { getClientInstanceId } from '../stores/useCatalogStore';

export interface DocumentPresenceTarget {
  kind: 'catalog' | 'template';
  id: string;
}

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

class PresenceServiceClass {
  private activeTarget: DocumentPresenceTarget | null = null;
  private activeChannel: RealtimeChannel | null = null;
  private currentTrackPayload: ParticipantSession | null = null;

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

  public subscribeToDocument(
    target: DocumentPresenceTarget,
    initialPageNumber: number = 1,
    initialPageId?: string,
    onSync?: (participants: Record<string, ParticipantSession>) => void
  ): RealtimeChannel | null {
    const supabase = getSupabase();
    if (!supabase || typeof (supabase as any).channel !== 'function') {
      return null;
    }

    // Se já está no mesmo canal, apenas atualiza
    if (
      this.activeChannel &&
      this.activeTarget &&
      this.activeTarget.kind === target.kind &&
      this.activeTarget.id === target.id
    ) {
      return this.activeChannel;
    }

    // Se estava em outro documento, faz cleanup primeiro
    if (this.activeChannel) {
      this.leave();
    }

    const authState = useAuthStore.getState();
    const userId = authState.userId || 'anon_user';
    const clientInstanceId = getClientInstanceId();
    const presenceKey = `${userId}:${clientInstanceId}`;
    const displayLabel = buildDisplayLabel(authState.email || undefined);
    const color = getParticipantColor(presenceKey);
    const avatarText = formatInitials(displayLabel);

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
      lastInteractionAt: new Date().toISOString(),
      color
    };

    this.currentTrackPayload = initialSession;
    this.activeTarget = target;

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

        for (const [key, sessions] of Object.entries(presenceState)) {
          if (sessions && sessions.length > 0) {
            // Pega a sessão mais recente para a key
            flattened[key] = sessions[sessions.length - 1];
          }
        }

        if (onSync) {
          onSync(flattened);
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[PRESENCE JOIN]', { key, newPresences });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('[PRESENCE LEAVE]', { key, leftPresences });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[PRESENCE SUBSCRIBED] Canal: ${channelName}, chave: ${presenceKey}`);
          if (this.currentTrackPayload) {
            try {
              await channel.track(this.currentTrackPayload);
            } catch (err) {
              console.warn('[PRESENCE TRACK ERROR]', err);
            }
          }
        }
      });

    this.activeChannel = channel;
    return channel;
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
    if (!this.activeChannel || !this.currentTrackPayload) return;

    this.currentTrackPayload = {
      ...this.currentTrackPayload,
      pageNumber,
      pageId,
      blockId: blockId ?? null,
      blockType: blockType ?? null,
      activity,
      lastInteractionAt: new Date().toISOString()
    };

    try {
      await this.activeChannel.track(this.currentTrackPayload);
    } catch (err) {
      console.warn('[PRESENCE UPDATE ERROR]', err);
    }
  }

  public leave(): void {
    if (this.activeChannel) {
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
    }
  }
}

export const PresenceService = new PresenceServiceClass();
