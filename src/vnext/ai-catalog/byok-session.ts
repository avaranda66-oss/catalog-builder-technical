import React from 'react';

/**
 * Personal Gemini key ("Usar minha própria chave" in the assistant menu) unlocked for this tab.
 *
 * It lives in module memory, outside the assistant panel, so closing and
 * reopening the panel does not lock it again. It is never written to storage,
 * the catalog or the conversation, disappears when the page closes, and is
 * bound to the account scope that unlocked it so another account on the same
 * tab cannot use it.
 */
interface UnlockedKey { readonly apiKey: string; readonly ownerScope: string }
let current: UnlockedKey | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export function setByokCredential(apiKey: string, ownerScope = ''): void {
  if (typeof apiKey !== 'string' || apiKey.length < 12 || apiKey.length > 2048 || apiKey.trim() !== apiKey) {
    throw new Error('BYOK_CREDENTIAL_INVALID');
  }
  current = { apiKey, ownerScope };
  emit();
}
export function clearByokCredential(): void {
  if (!current) return;
  current = null;
  emit();
}
export function getByokCredential(ownerScope = ''): string | undefined {
  return current && current.ownerScope === ownerScope ? current.apiKey : undefined;
}
export function subscribeByokCredential(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** React binding: re-renders when the key is unlocked or cleared anywhere. */
export function useByokCredential(ownerScope = ''): string | undefined {
  return React.useSyncExternalStore(subscribeByokCredential,
    () => getByokCredential(ownerScope), () => undefined);
}
