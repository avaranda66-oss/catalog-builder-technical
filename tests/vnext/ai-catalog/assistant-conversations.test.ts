import { webcrypto } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CATALOG_MESSAGE_LIMIT, CONVERSATIONS_KEPT, CONVERSATION_MESSAGE_LIMIT, activeConversation, assistantConversationStore,
  conversationTitle, conversationsForMenu, conversationsKey,
} from '../../../src/vnext/ai-catalog/assistant-conversations';
import { appendWorkbenchDialogue, dialogueKey, type WorkbenchEntry } from '../../../src/vnext/ai-catalog/workbench-dialogue';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => localStorage.clear());
afterAll(() => vi.unstubAllGlobals());

const DOC = '6f1d2b7e-4c1a-4d3e-9b2a-1a2b3c4d5e6f';
const OTHER_DOC = '0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
let minute = 0;
const clock = { now: () => new Date(Date.UTC(2026, 9, 22, 10, minute++)), createId: () => crypto.randomUUID() };
const entry = (role: WorkbenchEntry['role'], content: string, at = clock.now()): WorkbenchEntry => ({
  id: crypto.randomUUID(), role, content, timestamp: at.toISOString(), revision: 0,
});

describe('assistant conversations of one catalog (v2)', () => {
  it('starts with one empty conversation and writes nothing until the first message', () => {
    const store = assistantConversationStore(localStorage, DOC, 'user:01', clock);
    const state = store.load();
    expect(state.conversations).toHaveLength(1);
    expect(activeConversation(state).entries).toEqual([]);
    expect(localStorage.length).toBe(0);
    const next = store.append(state, state.activeId, entry('user', 'Crie uma capa'));
    expect(localStorage.getItem(conversationsKey(DOC, 'user:01'))).toContain('Crie uma capa');
    expect(store.load()).toEqual(next);
  });

  it('turns the v1 conversation of the catalog into its first conversation, once, and frees the v1 copy', () => {
    let v1: WorkbenchEntry[] = [];
    v1 = appendWorkbenchDialogue(localStorage, DOC, v1, entry('user', 'Pedido antigo'), 'user:01');
    v1 = appendWorkbenchDialogue(localStorage, DOC, v1, entry('assistant', 'Resposta antiga'), 'user:01');
    const store = assistantConversationStore(localStorage, DOC, 'user:01', clock);
    const state = store.load();
    expect(activeConversation(state).entries.map((item) => item.content)).toEqual(['Pedido antigo', 'Resposta antiga']);
    expect(activeConversation(state).startedAt).toBe(v1[0].timestamp);
    expect(localStorage.getItem(dialogueKey(DOC, 'user:01'))).toBeNull();
    // Read again: the same conversation (no second migration).
    expect(store.load()).toEqual(state);
  });

  it('keeps v1 untouched when the new record cannot be written', () => {
    appendWorkbenchDialogue(localStorage, DOC, [], entry('user', 'Pedido antigo'), 'user:01');
    const failing = { getItem: (key: string) => localStorage.getItem(key), removeItem: vi.fn(),
      setItem: () => { throw new Error('QUOTA'); } };
    const state = assistantConversationStore(failing, DOC, 'user:01', clock).load();
    expect(activeConversation(state).entries).toHaveLength(1);
    expect(failing.removeItem).not.toHaveBeenCalled();
  });

  it('"Nova conversa" opens an empty one (only once), the history lists the earlier one and opening it brings it back', () => {
    const store = assistantConversationStore(localStorage, DOC, 'user:01', clock);
    let state = store.load();
    const first = state.activeId;
    state = store.append(state, first, entry('user', 'Comparar os modelos TA-25N e TA-50N em uma tabela bem completa'));
    state = store.start(state);
    expect(state.activeId).not.toBe(first);
    expect(store.start(state)).toBe(state);
    const menu = conversationsForMenu(state);
    expect(menu.map((conversation) => conversation.id)).toEqual(expect.arrayContaining([first, state.activeId]));
    expect(conversationTitle(menu.find((conversation) => conversation.id === first)!))
      .toBe('Comparar os modelos TA-25N e TA-50N em uma tabela bem compl…');
    state = store.select(state, first);
    expect(state.activeId).toBe(first);
    // The empty conversation that was left is not kept.
    expect(state.conversations).toHaveLength(1);
    expect(store.load().activeId).toBe(first);
  });

  it('keeps each account and each catalog apart', () => {
    const mine = assistantConversationStore(localStorage, DOC, 'user:01', clock);
    const opened = mine.load();
    mine.append(opened, opened.activeId, entry('user', 'Só meu'));
    expect(activeConversation(assistantConversationStore(localStorage, DOC, 'user:02', clock).load()).entries).toEqual([]);
    expect(activeConversation(assistantConversationStore(localStorage, OTHER_DOC, 'user:01', clock).load()).entries).toEqual([]);
  });

  it('stops a full conversation and lets go of the oldest conversations instead of filling the browser', () => {
    const store = assistantConversationStore(localStorage, DOC, undefined, clock);
    let state = store.load();
    const full = { ...activeConversation(state), entries: Array.from({ length: CONVERSATION_MESSAGE_LIMIT }, (_, i) => entry('user', `m${i}`)) };
    state = { activeId: full.id, conversations: [full] };
    expect(() => store.append(state, full.id, entry('user', 'mais uma'))).toThrow('DIALOGUE_CAP_REACHED');
    for (let i = 0; i < CONVERSATIONS_KEPT + 2; i++) {
      state = store.start(state);
      state = store.append(state, state.activeId, entry('user', `conversa ${i}`));
    }
    expect(state.conversations.length).toBeLessThanOrEqual(CONVERSATIONS_KEPT);
    expect(state.conversations.reduce((sum, conversation) => sum + conversation.entries.length, 0)).toBeLessThanOrEqual(CATALOG_MESSAGE_LIMIT);
    // The full (oldest) conversation was the one let go; the open one is always kept.
    expect(state.conversations.some((conversation) => conversation.id === full.id)).toBe(false);
    expect(activeConversation(state).entries[0].content).toBe(`conversa ${CONVERSATIONS_KEPT + 1}`);
  });

  it('a damaged record or a catalog id that is not valid gives an empty conversation, never a crash', () => {
    localStorage.setItem(conversationsKey(DOC), '{not json');
    expect(activeConversation(assistantConversationStore(localStorage, DOC, undefined, clock).load()).entries).toEqual([]);
    const odd = assistantConversationStore(localStorage, 'not-a-uuid', undefined, clock);
    const state = odd.load();
    expect(activeConversation(state).entries).toEqual([]);
    expect(() => odd.append(state, state.activeId, entry('user', 'x'))).toThrow();
  });

  it('redacts what it stores, like v1', () => {
    const store = assistantConversationStore(localStorage, DOC, undefined, clock);
    const state = store.load();
    store.append(state, state.activeId, entry('user', 'Minha chave é AIzaSyA1234567890abcdefghijklmnopqrstuv'));
    expect(localStorage.getItem(conversationsKey(DOC))).not.toContain('AIzaSyA1234567890abcdefghijklmnopqrstuv');
  });
});
