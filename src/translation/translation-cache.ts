// src/translation/translation-cache.ts
// Cache de Memória de Tradução Local e Determinístico via IndexedDB
// Namespaced por auth.uid(). Zero cloud table, zero chaves de API, zero exportKey().
// Invalidação determinística via SHA-256 hash de conteúdo + metadata de modelo/glossário.

import { PrintableTextNode, TranslationCacheEntry } from './types';
import { Catalog } from '@/domain/catalog.schema';
import { PrintableTextRegistry } from './printable-text.registry';

const DB_NAME = 'presys_translation_cache_v1';
const STORE_NAME = 'translation_entries';

export const TRANSLATION_ENGINE_VERSION = '2.2.0';
export const DEFAULT_GLOSSARY_VERSION = 'v1.0';

// In-Memory Fallback para SSR, CLI e testes Node.js
const memoryCacheFallback = new Map<string, TranslationCacheEntry>();

function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/**
 * Normaliza o texto para cálculo consistente de hash independente de quebras de linha ou espaços redundantes.
 */
export function normalizeSourceText(text: string): string {
  return (text || '').trim().replace(/\s+/g, ' ');
}

/**
 * Calcula o hash SHA-256 determinístico de um nó de texto e parâmetros de tradução.
 * NUNCA inclui credenciais ou chaves de API.
 */
export async function computeNodeHash(params: {
  sourceText: string;
  sourceLocale: string;
  targetLocale: string;
  policy?: string;
  provider: string;
  model: string;
  glossaryVersion?: string;
  engineVersion?: string;
}): Promise<string> {
  const normalized = normalizeSourceText(params.sourceText);
  const payload = [
    normalized,
    params.sourceLocale.toLowerCase(),
    params.targetLocale.toLowerCase(),
    params.policy || 'translate',
    params.provider.toLowerCase(),
    params.model.toLowerCase(),
    params.glossaryVersion || DEFAULT_GLOSSARY_VERSION,
    params.engineVersion || TRANSLATION_ENGINE_VERSION
  ].join(':::');

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback simples caso crypto.subtle não esteja disponível (testes mínimos)
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `sha256_mock_${Math.abs(hash).toString(16)}`;
}

/**
 * Calcula o hash SHA-256 consolidado de todo o conteúdo imprimível de um catálogo.
 * Usado para detectar Source Drift durante a execução da tradução.
 */
export async function computeCatalogContentHash(input: PrintableTextNode[] | Catalog): Promise<string> {
  const nodes = Array.isArray(input) ? input : PrintableTextRegistry.extractCatalogNodes(input);
  const sortedPayload = nodes
    .filter((n) => n.policy === 'translate' || n.policy === 'system')
    .map((n) => `${n.id}:${normalizeSourceText(n.sourceText)}`)
    .sort()
    .join('|||');

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(sortedPayload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  let hash = 0;
  for (let i = 0; i < sortedPayload.length; i++) {
    const char = sortedPayload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `cat_sha256_${Math.abs(hash).toString(16)}`;
}

export class TranslationMemoryCache {
  private static async openDB(): Promise<IDBDatabase | null> {
    if (!isBrowserEnvironment()) {
      return null;
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by_user', 'userId', { unique: false });
          store.createIndex('by_hash', 'hash', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  /**
   * Obtém uma entrada do cache pelo hash determinístico do nó.
   */
  static async get(userId: string, hash: string): Promise<TranslationCacheEntry | null> {
    const cacheKey = `${userId}:${hash}`;

    if (!isBrowserEnvironment()) {
      return memoryCacheFallback.get(cacheKey) || null;
    }

    const db = await this.openDB();
    if (!db) {
      return memoryCacheFallback.get(cacheKey) || null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(cacheKey);
        req.onsuccess = () => {
          if (req.result) {
            const { entry } = req.result;
            resolve(entry);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Busca múltiplos hashes em lote para otimizar tempo de consulta.
   */
  static async getMany(userId: string, hashes: string[]): Promise<Map<string, TranslationCacheEntry>> {
    const resultMap = new Map<string, TranslationCacheEntry>();
    if (!hashes.length) return resultMap;

    for (const hash of hashes) {
      const entry = await this.get(userId, hash);
      if (entry) {
        resultMap.set(hash, entry);
      }
    }

    return resultMap;
  }

  /**
   * Armazena uma tradução no cache local do usuário.
   */
  static async set(userId: string, entry: TranslationCacheEntry): Promise<void> {
    const cacheKey = `${userId}:${entry.hash}`;
    memoryCacheFallback.set(cacheKey, entry);

    if (!isBrowserEnvironment()) return;

    const db = await this.openDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({
          id: cacheKey,
          userId,
          hash: entry.hash,
          entry
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Armazena múltiplos itens de tradução em lote no cache.
   */
  static async setMany(userId: string, entries: TranslationCacheEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.set(userId, entry);
    }
  }

  /**
   * Limpa todo o cache local em memória (útil para testes unitários ou logout).
   */
  static clearMemoryFallback(): void {
    memoryCacheFallback.clear();
  }

  /**
   * Expurga as entradas de cache de um determinado usuário.
   */
  static async clearUserCache(userId: string): Promise<void> {
    for (const [key] of memoryCacheFallback.entries()) {
      if (key.startsWith(`${userId}:`)) {
        memoryCacheFallback.delete(key);
      }
    }

    if (!isBrowserEnvironment()) return;

    const db = await this.openDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('by_user');
        const req = index.openKeyCursor(IDBKeyRange.only(userId));

        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
