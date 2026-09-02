import { TranslationCredential, TranslationProviderId, StoredCredentialMetadata } from './types';

const DB_NAME = 'presys_catalog_vault_v1';
const STORE_NAME = 'personal_credentials';

class WebCryptoHelper {
  private static readonly SALT = new Uint8Array([112, 114, 101, 115, 121, 115, 95, 99, 97, 116, 97, 108, 111, 103, 50, 54]);

  private static async getEncryptionKey(userId: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(`presys_vault_device_salt_${userId}`),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: this.SALT,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  static async encrypt(plainText: string, userId: string): Promise<{ cipherText: string; iv: string }> {
    const key = await this.getEncryptionKey(userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plainText);

    const cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    return {
      cipherText: Array.from(new Uint8Array(cipherBuffer)).map((b) => b.toString(16).padStart(2, '0')).join(''),
      iv: Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('')
    };
  }

  static async decrypt(cipherTextHex: string, ivHex: string, userId: string): Promise<string> {
    const key = await this.getEncryptionKey(userId);
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    const cipherBuffer = new Uint8Array(cipherTextHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherBuffer
    );

    return new TextDecoder().decode(decryptedBuffer);
  }
}

// In-Memory Storage (Isolado e limpo a cada reset de sessão)
const sessionMemoryVault = new Map<string, TranslationCredential>(); // key: `${userId}:${provider}`

export class PersonalCredentialVault {
  private static async openDB(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return null;

    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' }); // id: `${userId}:${provider}`
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  /**
   * Salva uma credencial para o usuário autenticado.
   * Se for 'session', grava apenas em memória. Se for 'remember', grava cifrado no IndexedDB.
   */
  static async saveCredential(userId: string, credential: TranslationCredential): Promise<void> {
    if (!userId || !credential.apiKey) return;

    const key = `${userId}:${credential.provider}`;
    sessionMemoryVault.set(key, { ...credential });

    if (credential.storageMode === 'remember') {
      try {
        const db = await this.openDB();
        if (db) {
          const encrypted = await WebCryptoHelper.encrypt(credential.apiKey, userId);
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

          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(record);
        }
      } catch (err) {
        console.warn('[CredentialVault] Falha ao persistir credencial cifrada no IndexedDB:', err);
      }
    } else {
      // Se era 'session', garante que remove qualquer registro anterior do IndexedDB
      await this.removeFromIndexedDB(userId, credential.provider);
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
      if (!db) return null;

      const record: any = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });

      if (!record || record.userId !== userId) {
        return null;
      }

      const decryptedApiKey = await WebCryptoHelper.decrypt(record.cipherText, record.iv, userId);
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
      console.warn('[CredentialVault] Erro ao descriptografar credencial local:', err);
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
    await this.removeFromIndexedDB(userId, provider);
  }

  /**
   * Limpa TODAS as credenciais descriptografadas da memória em caso de logout ou troca de usuário.
   */
  static clearSessionMemory(): void {
    sessionMemoryVault.clear();
  }

  private static async removeFromIndexedDB(userId: string, provider: TranslationProviderId): Promise<void> {
    try {
      const db = await this.openDB();
      if (!db) return;
      const key = `${userId}:${provider}`;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
    } catch {
      // Ignora erro de remoção no IndexedDB
    }
  }
}
