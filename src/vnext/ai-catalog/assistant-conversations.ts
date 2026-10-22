import { z } from 'zod';
import { redactConversationMessage } from './conversation-evidence';
import {
  WORKBENCH_MESSAGE_LIMIT, WORKBENCH_STORAGE_PREFIX, WorkbenchEntrySchema, dialogueKey, readWorkbenchDialogue,
  type WorkbenchEntry,
} from './workbench-dialogue';

/**
 * The assistant's conversations of one catalog, kept in this browser (separated by account and catalog, like the
 * single conversation of v1 in workbench-dialogue.ts). "Nova conversa" starts an empty one; the history menu lists
 * the earlier ones. The v1 record of a catalog becomes its first conversation the first time it is read here.
 *
 * Nothing here ever leaves the browser. Each message is redacted the same way as in v1 before it is stored.
 */

export const ASSISTANT_CONVERSATIONS_PREFIX = 'catalog-builder:ai-assistant-conversations:v2:';
/** Conversations kept per catalog; the oldest one is let go when a newer one needs the room. */
export const CONVERSATIONS_KEPT = 20;
/** Messages per conversation (the same cap as v1). */
export const CONVERSATION_MESSAGE_LIMIT = WORKBENCH_MESSAGE_LIMIT;
/** Messages across the conversations of one catalog, so a catalog never fills this browser's storage. */
export const CATALOG_MESSAGE_LIMIT = 800;
const RAW_LIMIT = 2_500_000;

const ConversationSchema = z.object({
  id: z.string().uuid(),
  startedAt: z.string().datetime(),
  entries: z.array(WorkbenchEntrySchema).max(CONVERSATION_MESSAGE_LIMIT),
}).strict();
const RecordSchema = z.object({
  version: z.literal(2),
  documentId: z.string().uuid(),
  activeId: z.string().uuid(),
  conversations: z.array(ConversationSchema).min(1).max(CONVERSATIONS_KEPT),
}).strict();

export type AssistantConversation = z.infer<typeof ConversationSchema>;
export interface AssistantConversations {
  readonly activeId: string;
  readonly conversations: readonly AssistantConversation[];
}

export interface ConversationClock {
  readonly now: () => Date;
  readonly createId: () => string;
}
const defaultClock: ConversationClock = { now: () => new Date(), createId: () => crypto.randomUUID() };

export function conversationsKey(documentId: string, ownerScope?: string): string {
  return ASSISTANT_CONVERSATIONS_PREFIX + dialogueKey(documentId, ownerScope).slice(WORKBENCH_STORAGE_PREFIX.length);
}

export function activeConversation(state: AssistantConversations): AssistantConversation {
  return state.conversations.find((conversation) => conversation.id === state.activeId) ?? state.conversations[0];
}

const lastActivity = (conversation: AssistantConversation) =>
  Date.parse(conversation.entries.at(-1)?.timestamp ?? conversation.startedAt) || 0;

/** Title of a conversation in the history menu: its first request, on one line. */
export function conversationTitle(conversation: AssistantConversation): string {
  // The first real request names it (a quick action like "Desfazer" only if there is nothing else).
  const first = conversation.entries.find((entry) => entry.role === 'user' && !entry.action)
    ?? conversation.entries.find((entry) => entry.role === 'user') ?? conversation.entries[0];
  if (!first) return 'Conversa nova, ainda vazia';
  const line = first.content.replace(/\s+/g, ' ').trim();
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line;
}

/** Conversations for the history menu, the most recent first. Empty ones appear only while open. */
export function conversationsForMenu(state: AssistantConversations): AssistantConversation[] {
  return state.conversations
    .filter((conversation) => conversation.entries.length > 0 || conversation.id === state.activeId)
    .sort((a, b) => lastActivity(b) - lastActivity(a));
}

function emptyConversation(clock: ConversationClock): AssistantConversation {
  return { id: clock.createId(), startedAt: clock.now().toISOString(), entries: [] };
}

/** Drops the oldest conversations (never the open one) until the catalog fits the limits. */
function prune(state: AssistantConversations): AssistantConversations {
  let conversations = [...state.conversations];
  const total = () => conversations.reduce((sum, conversation) => sum + conversation.entries.length, 0);
  while (conversations.length > CONVERSATIONS_KEPT || total() > CATALOG_MESSAGE_LIMIT) {
    const others = conversations.filter((conversation) => conversation.id !== state.activeId);
    if (!others.length) break;
    const oldest = others.reduce((a, b) => (lastActivity(a) <= lastActivity(b) ? a : b));
    conversations = conversations.filter((conversation) => conversation !== oldest);
  }
  return { activeId: state.activeId, conversations };
}

export interface AssistantConversationStore {
  /** The conversations of the catalog (the v1 conversation becomes the first one the first time). */
  readonly load: () => AssistantConversations;
  /** Stores one more message in a conversation; throws when that conversation is full. */
  readonly append: (state: AssistantConversations, conversationId: string, entry: WorkbenchEntry) => AssistantConversations;
  /** "Nova conversa": an empty conversation becomes the open one (nothing changes when the open one is empty). */
  readonly start: (state: AssistantConversations) => AssistantConversations;
  /** Opens an earlier conversation from the history menu. */
  readonly select: (state: AssistantConversations, conversationId: string) => AssistantConversations;
}

/**
 * The store of one catalog for one account. Every write is synchronous (before a navigation can lose it) and
 * returns the new state; a failed write throws, so the panel can say that the conversation was not kept.
 */
export function assistantConversationStore(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  documentId: string,
  ownerScope?: string,
  clock: ConversationClock = defaultClock,
): AssistantConversationStore {
  // Computed on use: a catalog id that is not valid only means nothing is kept (the panel says so), never a crash.
  const key = () => conversationsKey(documentId, ownerScope);
  const write = (state: AssistantConversations): AssistantConversations => {
    const record = RecordSchema.parse({ version: 2, documentId, activeId: state.activeId, conversations: state.conversations });
    storage.setItem(key(), JSON.stringify(record));
    return state;
  };
  const readStored = (): AssistantConversations | null => {
    try {
      const raw = storage.getItem(key());
      if (!raw || raw.length > RAW_LIMIT) return null;
      const record = RecordSchema.parse(JSON.parse(raw));
      if (record.documentId !== documentId) return null;
      return { activeId: record.activeId, conversations: record.conversations };
    } catch { return null; }
  };
  return {
    load: () => {
      const stored = readStored();
      if (stored) return stored;
      const legacy = readWorkbenchDialogue(storage, documentId, ownerScope);
      if (!legacy.length) {
        const fresh = emptyConversation(clock);
        return { activeId: fresh.id, conversations: [fresh] };
      }
      const migrated: AssistantConversation = { id: clock.createId(), startedAt: legacy[0].timestamp, entries: legacy };
      const state = { activeId: migrated.id, conversations: [migrated] };
      try {
        write(state);
        // Only once the conversation is safely in v2: the v1 copy would only take room in this browser.
        storage.removeItem(dialogueKey(documentId, ownerScope));
      } catch { /* Kept in memory; v1 stays as it was and is read again next time. */ }
      return state;
    },
    append: (state, conversationId, entry) => {
      const target = state.conversations.find((conversation) => conversation.id === conversationId);
      if (!target) throw new Error('CONVERSATION_NOT_FOUND');
      if (target.entries.length >= CONVERSATION_MESSAGE_LIMIT) throw new Error('DIALOGUE_CAP_REACHED');
      const safe = WorkbenchEntrySchema.parse({ ...entry, content: redactConversationMessage(entry.content) });
      const conversations = state.conversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, entries: [...conversation.entries, safe] } : conversation);
      return write(prune({ activeId: state.activeId, conversations }));
    },
    start: (state) => {
      if (activeConversation(state).entries.length === 0) return state;
      const fresh = emptyConversation(clock);
      const kept = state.conversations.filter((conversation) => conversation.entries.length > 0);
      return write(prune({ activeId: fresh.id, conversations: [...kept, fresh] }));
    },
    select: (state, conversationId) => {
      if (conversationId === state.activeId || !state.conversations.some((conversation) => conversation.id === conversationId)) return state;
      const conversations = state.conversations.filter((conversation) => conversation.entries.length > 0 || conversation.id === conversationId);
      return write({ activeId: conversationId, conversations });
    },
  };
}
