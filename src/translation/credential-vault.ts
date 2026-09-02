// src/translation/credential-vault.ts
// Cofre BYOK seguro para chaves pessoais de API
// Modo 'session': estritamente em memória volátil (limpo no logout).
// Modo 'remember': cifrado via WebCrypto API com chave AES-GCM (256-bit) aleatória por dispositivo.
// Zero persistência global, zero chaves no localStorage.

import { TranslationCredential, TranslationProviderId, StoredCredentialMetadata } from './types';

const DB_NAME = 'presys_catalog_vault_v4';
const STORE_CREDENTIALS = 'personal_credentials';
const STORE_DEVICE_KEYS = 'device_keys';

// In-Memory Storage (Isolado e limpo a cada reset de sessão)
const sessionMemoryVault = new Map<string, TranslationCredential>(); // key: `${userId}:${provider}`

// Fallback de persistência de dispositivo para ambientes sem IndexedDB (ex: Node/SSR/Unit Tests)
const deviceDbFallback = {
  credentials: new Map<string, any>(),
  deviceKeys: new Map<string, any>()
};

export class PersonalCredentialVault {
  private static async openDB(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      return null;
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_CREDENTIALS)) {
          db.createObjectStore(STORE_CREDENTIALS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_DEVICE_KEYS)) {
          db.createObjectStore(STORE_DEVICE_KEYS, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  /**
   * Obtém ou gera uma chave criptográfica AES-GCM (256-bit) aleatória no dispositivo para o usuário.
   */
  private static async getOrCreateDeviceKey(db: IDBDatabase | null, keyId: string): Promise<CryptoKey | null> {
    // 1. Tenta recuperar do IndexedDB ou fallback
    let existingJwk: any = null;

    if (db) {
      const existingRecord: any = await new Promise((resolve) => {
        const tx = db.transaction(STORE_DEVICE_KEYS, 'readonly');
        const req = tx.objectStore(STORE_DEVICE_KEYS).get(keyId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      existingJwk = existingRecord?.jwk;
    } else {
      existingJwk = deviceDbFallback.deviceKeys.get(keyId)?.jwk;
    }

    if (existingJwk) {
      try {
        return await crypto.subtle.importKey(
          'jwk',
          existingJwk,
          'AES-GCM',
          true,
          ['encrypt', 'decrypt']
        );
      } catch (err) {
        console.warn('[PersonalCredentialVault] Falha ao importar chave do dispositivo:', err);
      }
    }

    // 2. Se não existir, gera uma nova chave aleatória no dispositivo
    try {
      const newKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      const jwk = await crypto.subtle.exportKey('jwk', newKey);

      if (db) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_DEVICE_KEYS, 'readwrite');
          tx.objectStore(STORE_DEVICE_KEYS).put({ id: keyId, jwk });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } else {
        deviceDbFallback.deviceKeys.set(keyId, { id: keyId, jwk });
      }

      return newKey;
    } catch (err) {
      console.warn('[PersonalCredentialVault] Falha ao gerar chave de dispositivo:', err);
      return null;
    }
  }

  /**
   * Cifra o texto plano utilizando a CryptoKey do dispositivo com IV aleatório de 96 bits.
   */
  private static async encryptWithDeviceKey(
    db: IDBDatabase | null,
    keyId: string,
    plainText: string
  ): Promise<{ cipherText: string; iv: string } | null> {
    const cryptoKey = await this.getOrCreateDeviceKey(db, keyId);
    if (!cryptoKey) return null;

    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV aleatório novo por criptografia
    const encoded = new TextEncoder().encode(plainText);

    const cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encoded
    );

    return {
      cipherText: Array.from(new Uint8Array(cipherBuffer)).map((b) => b.toString(16).padStart(2, '0')).join(''),
      iv: Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('')
    };
  }

  /**
   * Decifra o texto cifrado utilizando a CryptoKey do dispositivo e o IV armazenado.
   */
  private static async decryptWithDeviceKey(
    db: IDBDatabase | null,
    keyId: string,
    cipherTextHex: string,
    ivHex: string
  ): Promise<string | null> {
    const cryptoKey = await this.getOrCreateDeviceKey(db, keyId);
    if (!cryptoKey) return null;

    const ivMatches = ivHex.match(/.{1,2}/g);
    const cipherMatches = cipherTextHex.match(/.{1,2}/g);
    if (!ivMatches || !cipherMatches) return null;

    const iv = new Uint8Array(ivMatches.map((byte) => parseInt(byte, 16)));
    const cipherBuffer = new Uint8Array(cipherMatches.map((byte) => parseInt(byte, 16)));

    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        cipherBuffer
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (err) {
      console.warn('[PersonalCredentialVault] Falha na decifração:', err);
      return null;
    }
  }

  /**
   * Salva uma credencial para o usuário autenticado.
   * Se for 'session', grava apenas em memória volátil. Se for 'remember', grava cifrado no IndexedDB.
   */
  static async saveCredential(userId: string, credential: TranslationCredential): Promise<void> {
    if (!userId || !credential.apiKey) return;

    const key = `${userId}:${credential.provider}`;
    sessionMemoryVault.set(key, { ...credential });

    if (credential.storageMode === 'remember') {
      try {
        const db = await this.openDB();
        const encrypted = await this.encryptWithDeviceKey(db, key, credential.apiKey);
        if (encrypted) {
          const record = {
            id: key,
            userId,
            provider: credential.provider,
            model: credential.model || 'gemini-2.5-flash',
            storageMode: 'remember',
            cipherText: encrypted.cipherText,
            iv: encrypted.iv,
            validatedAt: credential.validatedAt || new Date().toISOString()
          };

          if (db) {
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction(STORE_CREDENTIALS, 'readwrite');
              tx.objectStore(STORE_CREDENTIALS).put(record);
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
            });
          } else {
            deviceDbFallback.credentials.set(key, record);
          }
        }
      } catch (err) {
        console.warn('[PersonalCredentialVault] Falha ao persistir credencial cifrada no dispositivo:', err);
      }
    } else {
      // Se era 'session', garante que remove qualquer registro anterior do IndexedDB
      await this.removeFromDeviceStorage(userId, credential.provider);
    }
  }

  /**
   * Recupera a credencial do usuário ativo.
   * Retorna null se não houver credencial configurada ou se outro usuário estiver ativo.
   */
  static async getCredential(
    userId: string,
    provider: TranslationProviderId = 'gemini'
  ): Promise<TranslationCredential | null> {
    if (!userId) return null;

    const key = `${userId}:${provider}`;

    // 1. Verifica memória da sessão atual
    const inMem = sessionMemoryVault.get(key);
    if (inMem) {
      return inMem;
    }

    // 2. Se não estiver em memória, tenta recuperar do IndexedDB cifrado
    try {
      const db = await this.openDB();
      let record: any = null;

      if (db) {
        record = await new Promise((resolve) => {
          const tx = db.transaction(STORE_CREDENTIALS, 'readonly');
          const req = tx.objectStore(STORE_CREDENTIALS).get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
      } else {
        record = deviceDbFallback.credentials.get(key) || null;
      }

      if (!record || record.userId !== userId) {
        return null;
      }

      const decryptedApiKey = await this.decryptWithDeviceKey(db, key, record.cipherText, record.iv);
      if (!decryptedApiKey) return null;

      const cred: TranslationCredential = {
        provider: record.provider,
        apiKey: decryptedApiKey,
        storageMode: 'remember',
        model: record.model,
        validatedAt: record.validatedAt
      };

      // Coloca na memória da sessão atual
      sessionMemoryVault.set(key, cred);
      return cred;
    } catch (err) {
      console.warn('[PersonalCredentialVault] Erro ao descriptografar credencial local:', err);
      return null;
    }
  }

  /**
   * Retorna metadados de status da credencial (sem expor o valor da chave).
   */
  static async getCredentialMetadata(
    userId: string,
    provider: TranslationProviderId = 'gemini'
  ): Promise<StoredCredentialMetadata | null> {
    const cred = await this.getCredential(userId, provider);
    if (!cred) return null;

    return {
      provider: cred.provider,
      storageMode: cred.storageMode,
      model: cred.model || 'gemini-2.5-flash',
      isValid: Boolean(cred.apiKey && cred.apiKey.length > 5),
      validatedAt: cred.validatedAt
    };
  }

  /**
   * Remove a credencial da memória e do armazenamento local.
   */
  static async removeCredential(userId: string, provider: TranslationProviderId = 'gemini'): Promise<void> {
    if (!userId) return;
    const key = `${userId}:${provider}`;
    sessionMemoryVault.delete(key);
    await this.removeFromDeviceStorage(userId, provider);
  }

  /**
   * Limpa estritamente a memória volátil (chamado no logout ou reset de sessão).
   */
  static clearSessionMemory(): void {
    sessionMemoryVault.clear();
  }

  private static async removeFromDeviceStorage(userId: string, provider: TranslationProviderId): Promise<void> {
    const key = `${userId}:${provider}`;
    deviceDbFallback.credentials.delete(key);
    deviceDbFallback.deviceKeys.delete(key);

    try {
      const db = await this.openDB();
      if (!db) return;

      await new Promise<void>((resolve) => {
        const tx = db.transaction([STORE_CREDENTIALS, STORE_DEVICE_KEYS], 'readwrite');
        tx.objectStore(STORE_CREDENTIALS).delete(key);
        tx.objectStore(STORE_DEVICE_KEYS).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignora erro em remoção local
    }
  }
}
