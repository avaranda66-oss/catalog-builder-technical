import { describe, expect, it } from 'vitest';
import {
  PROVIDER_IDS, encryptProviderCredential, decryptProviderCredential, type ProviderId,
} from '../../../src/vnext/ai-catalog/provider-vault';

describe('device-local encrypted BYOK credential record', () => {
  it.each(PROVIDER_IDS)('round-trips %s through AES-256-GCM bound to provider', async provider => {
    const secret = 'QA_FAKE_PROVIDER_KEY_EXCLUSIVELY_FOR_TESTS_123456789';
    const phrase = 'correct-test-passphrase-not-a-real-password';
    const encrypted = await encryptProviderCredential(provider, secret, phrase);
    expect(encrypted.provider).toBe(provider);
    expect(encrypted.version).toBe(1);
    expect(encrypted.iterations).toBeGreaterThanOrEqual(300000);
    expect(JSON.stringify(encrypted)).not.toContain(secret);
    expect(JSON.stringify(encrypted)).not.toContain(phrase);
    expect(await decryptProviderCredential(encrypted, phrase)).toBe(secret);
  });

  it('rejects wrong passphrase without revealing plaintext', async () => {
    const encrypted = await encryptProviderCredential('gemini', 'FAKE_ONLY_GOOGLE_KEY_1234567890', 'correct-test-passphrase');
    await expect(decryptProviderCredential(encrypted,'incorrect-passphrase')).rejects.toThrow('VAULT_UNLOCK_FAILED');
  });

  it('rejects ciphertext tampering or provider swap (GCM associated data)', async () => {
    const record = await encryptProviderCredential('gemini', 'FAKE_ONLY_GOOGLE_KEY_1234567890', 'correct-test-passphrase');
    await expect(decryptProviderCredential({ ...record, provider: 'openai' } as typeof record, 'correct-test-passphrase'))
      .rejects.toThrow('VAULT_UNLOCK_FAILED');
    await expect(decryptProviderCredential({
      ...record, ciphertext: record.ciphertext.slice(0,-3)+'XYZ',
    },'correct-test-passphrase')).rejects.toThrow('VAULT_UNLOCK_FAILED');
  });

  it('uses random salt and nonce to prevent identical encrypted records', async () => {
    const values = await Promise.all([1,2].map(async () => encryptProviderCredential(
      'anthropic', 'FAKE_ONLY_ANTHROPIC_KEY_1234567890', 'correct-test-passphrase',
    )));
    expect(values[0].salt).not.toBe(values[1].salt);
    expect(values[0].nonce).not.toBe(values[1].nonce);
    expect(values[0].ciphertext).not.toBe(values[1].ciphertext);
  });

  it('rejects invalid providers, weak passphrases and blank keys', async () => {
    await expect(encryptProviderCredential('invalid' as ProviderId, 'a-real-looking-fake-key', 'correct-test-passphrase')).rejects.toThrow();
    await expect(encryptProviderCredential('gemini','           ','correct-test-passphrase')).rejects.toThrow();
    await expect(encryptProviderCredential('gemini','fake-api-key-long-enough','short')).rejects.toThrow();
  });
});
