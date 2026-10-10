import { describe, expect, it } from 'vitest';
import {
  WORKBENCH_MESSAGE_LIMIT, appendWorkbenchDialogue, dialogueKey,
  interpretWorkbenchRequest, readWorkbenchDialogue,
} from '../../../src/vnext/ai-catalog/workbench-dialogue';

const documentId = '64aa2218-7b8e-41a4-a8bc-94e9ab2c39fc';
const makeEntry = (n: number, role: 'user' | 'assistant' = 'user') => ({
  id: '3b433e4c-d7a5-4d42-8ccc-' + n.toString().padStart(12, '0'),
  role, content: 'Ajuste ' + n,
  timestamp: '2026-10-10T04:00:00.000Z', revision: n,
});
describe('persistent per-catalog medium and long conversations', () => {
  it('executes only explicit reversible commands; never interprets arbitrary edits as operations', () => {
    expect(interpretWorkbenchRequest('Deixe as tabelas mais compactas')).toBe('compact');
    expect(interpretWorkbenchRequest('desfaça')).toBe('undo');
    expect(interpretWorkbenchRequest('refaça')).toBe('redo');
    expect(interpretWorkbenchRequest('Abra o editor')).toBe('editor');
    expect(interpretWorkbenchRequest('Revisar publicação PDF')).toBe('publication');
    expect(interpretWorkbenchRequest('Troque 0,01 por 0,001 em todas as células')).toBe('help');
    expect(interpretWorkbenchRequest('Gere uma imagem com IA e remova o fundo')).toBe('help');
  });
  it('stores 200 turns and reopens them in order, isolated from another document', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); } };
    let state = [] as ReturnType<typeof readWorkbenchDialogue>;
    for (let i = 0; i < 200; i++) state = appendWorkbenchDialogue(storage, documentId, state, makeEntry(i));
    expect(readWorkbenchDialogue(storage, documentId)).toEqual(state);
    expect(readWorkbenchDialogue(storage, 'b1f9727b-9735-4f10-98cc-a6f92d00da67')).toEqual([]);
    expect(dialogueKey(documentId)).toContain(documentId);
    expect(state).toHaveLength(200);
  });
  it('never silently truncates old messages when reaching the hard limit', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); } };
    let state = [] as ReturnType<typeof readWorkbenchDialogue>;
    for (let i = 0; i < WORKBENCH_MESSAGE_LIMIT; i++) state = appendWorkbenchDialogue(storage, documentId, state, makeEntry(i));
    expect(() => appendWorkbenchDialogue(storage, documentId, state, makeEntry(501))).toThrow('DIALOGUE_CAP_REACHED_EXPORT_FIRST');
    expect(readWorkbenchDialogue(storage, documentId)).toHaveLength(WORKBENCH_MESSAGE_LIMIT);
  });
  it('isolates the same document dialogue by authenticated owner scope on shared devices', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); } };
    const a = 'auth:user-A', b = 'auth:user-B';
    appendWorkbenchDialogue(storage, documentId, [],
      { ...makeEntry(12), content: 'Informações comerciais internas do usuário A' }, a);
    expect(readWorkbenchDialogue(storage, documentId, a)).toHaveLength(1);
    expect(readWorkbenchDialogue(storage, documentId, b)).toEqual([]);
    expect(dialogueKey(documentId, a)).not.toBe(dialogueKey(documentId, b));
  });
  it('redacts pasted API tokens and ignores corrupt local transcripts', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); } };
    const state = appendWorkbenchDialogue(storage, documentId, [], {
      ...makeEntry(1), content: 'api_key=FAKE-SECRET-NO-EXTERNAL-ACCESS-0987654321',
    });
    expect(JSON.stringify(state)).not.toContain('FAKE-SECRET');
    store.set(dialogueKey(documentId), '{"version":1,"entries":[{}]}');
    expect(readWorkbenchDialogue(storage, documentId)).toEqual([]);
  });
});
