/**
 * Device-scoped encrypted BYOK vault. Encryption happens before any IndexedDB
 * write. A user-chosen passphrase is never persisted, nor is plaintext API key.
 * Unlocking leaves a secret in process memory until it is explicitly forgotten
 * or the page closes. This does NOT defend against XSS or malware while open.
 */
export const PROVIDER_IDS = ['gemini', 'openai', 'anthropic'] as const;
export type ProviderId = typeof PROVIDER_IDS[number];
export const PROVIDER_CONFIG: Record<ProviderId, {
  label: string;
  keyHelp: string;
  configuredDefaultModel: string;
}> = {
  gemini: { label: 'Google Gemini', keyHelp: 'Google AI Studio', configuredDefaultModel: 'gemini-2.5-flash-lite' },
  openai: { label: 'OpenAI', keyHelp: 'OpenAI Platform', configuredDefaultModel: 'gpt-5-mini' },
  anthropic: { label: 'Anthropic Claude', keyHelp: 'Anthropic Console', configuredDefaultModel: 'claude-haiku-4-5' },
};

export interface EncryptedProviderKey {
  readonly version: 1;
  readonly provider: ProviderId;
  readonly salt: string;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly iterations: number;
  readonly createdAt: number;
}
const ITERATIONS = 310_000;
const MIN_PASSPHRASE_LENGTH = 12;
const DB_NAME = 'vnext-device-provider-vault-v1';
const STORE = 'provider-credentials';

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function fromBase64(value: string): Uint8Array {
  const raw = atob(value);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
function providerAllowed(p: string): p is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(p);
}
async function derive(passphrase: string, salt: Uint8Array, iterations: number) {
  const bits = new TextEncoder().encode(passphrase);
  const master = await crypto.subtle.importKey('raw', bits, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    master, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptProviderCredential(
  provider: ProviderId, apiKey: string, passphrase: string,
): Promise<EncryptedProviderKey> {
  if (!providerAllowed(provider) || typeof apiKey !== 'string' ||
    !apiKey.trim() || apiKey.length < 12 || apiKey.length > 2048 ||
    apiKey !== apiKey.trim()) throw new Error('VAULT_KEY_INVALID');
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error('VAULT_PASSPHRASE_TOO_SHORT');
  if (!globalThis.crypto?.subtle) throw new Error('VAULT_CRYPTO_UNAVAILABLE');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const k = await derive(passphrase, salt, ITERATIONS);
  const plaintext = new TextEncoder().encode(apiKey);
  const additionalData = new TextEncoder().encode('catalog-builder:BYOK:v1:' + provider);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource, additionalData },
    k, plaintext as BufferSource,
  );
  return Object.freeze({
    version: 1, provider, salt: toBase64(salt), nonce: toBase64(nonce),
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iterations: ITERATIONS, createdAt: Date.now(),
  });
}

export async function decryptProviderCredential(
  stored: EncryptedProviderKey, passphrase: string,
): Promise<string> {
  if (!stored || stored.version !== 1 || !providerAllowed(stored.provider) ||
    stored.iterations !== ITERATIONS || !crypto?.subtle) throw new Error('VAULT_RECORD_INVALID');
  try {
    const salt = fromBase64(stored.salt), nonce = fromBase64(stored.nonce);
    if (salt.length !== 16 || nonce.length !== 12 ||
      stored.ciphertext.length > 4000 || stored.ciphertext.length < 16) throw new Error('INVALID_LENGTH');
    const k = await derive(passphrase, salt, stored.iterations);
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: nonce as BufferSource,
      additionalData: new TextEncoder().encode('catalog-builder:BYOK:v1:' + stored.provider),
    }, k, fromBase64(stored.ciphertext) as BufferSource);
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch {
    throw new Error('VAULT_UNLOCK_FAILED');
  }
}

export function openProviderVault(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('VAULT_STORAGE_UNAVAILABLE'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'provider' });
    };
    request.onerror = () => reject(new Error('VAULT_STORAGE_ERROR'));
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error('VAULT_STORAGE_BLOCKED'));
  });
}
async function withStore<T>(mode: IDBTransactionMode,
  work: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason: Error) => void) => void,
): Promise<T> {
  const db = await openProviderVault();
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const finish = (fn: () => void) => { if (finished) return; finished = true; fn(); db.close(); };
    const transaction = db.transaction(STORE, mode);
    transaction.onerror = () => finish(() => reject(new Error('VAULT_STORAGE_ERROR')));
    transaction.onabort = () => finish(() => reject(new Error('VAULT_STORAGE_ABORT')));
    work(transaction.objectStore(STORE), v => finish(() => resolve(v)),
      e => finish(() => reject(e)));
  });
}
export function saveEncryptedProviderCredential(record: EncryptedProviderKey): Promise<void> {
  return withStore('readwrite', (store, resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('VAULT_STORAGE_ERROR'));
  });
}
export function loadEncryptedProviderCredential(provider: ProviderId): Promise<EncryptedProviderKey | undefined> {
  return withStore('readonly', (store, resolve, reject) => {
    const request = store.get(provider);
    request.onsuccess = () => resolve(request.result as EncryptedProviderKey | undefined);
    request.onerror = () => reject(new Error('VAULT_STORAGE_ERROR'));
  });
}
export function listEncryptedProviderCredentials(): Promise<EncryptedProviderKey[]> {
  return withStore('readonly', (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as EncryptedProviderKey[]);
    request.onerror = () => reject(new Error('VAULT_STORAGE_ERROR'));
  });
}
export function deleteEncryptedProviderCredential(provider: ProviderId): Promise<void> {
  return withStore('readwrite', (store, resolve, reject) => {
    const request = store.delete(provider);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('VAULT_STORAGE_ERROR'));
  });
}
