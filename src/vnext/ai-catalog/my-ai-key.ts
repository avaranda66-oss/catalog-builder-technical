import React from 'react';
import { isGeminiKeyFormat, USER_AI_KEY_MISSING_MESSAGE } from './user-ai-key';

/**
 * Browser side of "Minha chave de IA" (migration 00032).
 *
 * The browser only ever SENDS the key once (save/replace RPC) and never reads
 * it back: status is provider + last 4 characters + test result. A small
 * module store remembers whether the signed-in person has a key, so the AI
 * buttons can warn without calling anything when it is known to be missing.
 * Only the SERVER may say "missing" (USER_AI_KEY_MISSING / readiness): the
 * table alone cannot know whether VNEXT_AI_SERVER_KEY_FALLBACK is on.
 */
export type MyAiKeyState = 'unknown' | 'missing' | 'present';
export interface MyAiKeyStatus { provider: 'gemini'; key_last4: string; check_status: 'untested' | 'ok' | 'error' }
export interface MyAiKeyClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  functions: { invoke(name: string, options: { body: unknown }): Promise<{ data: unknown; error: unknown }> };
}

let state: MyAiKeyState = 'unknown';
const listeners = new Set<() => void>();
export function getMyAiKeyState(): MyAiKeyState { return state; }
export function setMyAiKeyState(next: MyAiKeyState): void {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}
export function useMyAiKeyState(): MyAiKeyState {
  return React.useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getMyAiKeyState, () => 'unknown' as const);
}

/** Thrown by AI clients when the person is known to have no key: nothing was sent anywhere. */
export class MyAiKeyMissingError extends Error {
  readonly code = 'USER_AI_KEY_MISSING' as const;
  constructor() { super(USER_AI_KEY_MISSING_MESSAGE); this.name = 'MyAiKeyMissingError'; }
}
export function assertMyAiKeyNotMissing(): void {
  if (state === 'missing') throw new MyAiKeyMissingError();
}

function parseStatus(data: unknown): MyAiKeyStatus | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const value = row as Record<string, unknown>;
  if (value.provider !== 'gemini' || typeof value.key_last4 !== 'string' || !/^[A-Za-z0-9_-]{4}$/.test(value.key_last4)) return null;
  const check = value.check_status === 'ok' || value.check_status === 'error' ? value.check_status : 'untested';
  return { provider: 'gemini', key_last4: value.key_last4, check_status: check };
}

export async function loadMyAiKeyStatus(client: MyAiKeyClient): Promise<MyAiKeyStatus | null> {
  const { data, error } = await client.rpc('vnext_ai_key_status_v1');
  if (error) throw new Error('MY_AI_KEY_STATUS_FAILED');
  const status = parseStatus(data);
  // No row is NOT "missing": the server fallback may still answer. Never lock the AI from here.
  setMyAiKeyState(status ? 'present' : 'unknown');
  return status;
}

export async function saveMyAiKey(client: MyAiKeyClient, apiKey: string): Promise<MyAiKeyStatus> {
  const key = apiKey.trim();
  if (!isGeminiKeyFormat(key)) throw new Error('MY_AI_KEY_INVALID_FORMAT');
  const { data, error } = await client.rpc('vnext_ai_key_save_v1', { p_provider: 'gemini', p_api_key: key });
  const status = error ? null : parseStatus(data);
  if (!status) throw new Error('MY_AI_KEY_SAVE_FAILED');
  setMyAiKeyState('present');
  return status;
}

export async function removeMyAiKey(client: MyAiKeyClient): Promise<void> {
  const { error } = await client.rpc('vnext_ai_key_remove_v1');
  if (error) throw new Error('MY_AI_KEY_REMOVE_FAILED');
  setMyAiKeyState('unknown');
}

/** "Testar": the composer function makes one free call to Google with the caller's own key. */
export async function testMyAiKey(client: MyAiKeyClient): Promise<'ok' | 'error' | 'unavailable' | 'missing'> {
  let result: { data: unknown; error: unknown };
  try { result = await client.functions.invoke('vnext-catalog-composer', { body: { version: 1, task: 'test_user_key' } }); }
  catch { return 'unavailable'; }
  const test = result.data && typeof result.data === 'object' ? (result.data as { test?: { status?: unknown } }).test : undefined;
  if (!result.error && test && (test.status === 'ok' || test.status === 'error' || test.status === 'unavailable')) return test.status;
  const context = (result.error as { context?: { status?: unknown } } | null)?.context;
  // "Testar" never uses the server fallback, so its 409 does not mean the AI is locked: keep the state.
  if (context && context.status === 409) return 'missing';
  return 'unavailable';
}
