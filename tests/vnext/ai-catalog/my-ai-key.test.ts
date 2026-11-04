// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  edgeSecretAccess, isGeminiKeyFormat, resolveCallerAiKey, runUserKeyTest, testGeminiKey, userKeyStatusLine, USER_AI_KEY_MISSING_MESSAGE, USER_AI_KEY_QUOTA_HINT,
} from '../../../src/vnext/ai-catalog/user-ai-key';
import {
  getMyAiKeyState, loadMyAiKeyStatus, removeMyAiKey, saveMyAiKey, setMyAiKeyState, testMyAiKey, type MyAiKeyClient,
} from '../../../src/vnext/ai-catalog/my-ai-key';
import { nativeComposeGateway, ComposerRequestError } from '../../../src/vnext/ai-catalog/native-compose-client';
import { composerErrorMessage } from '../../../src/vnext/ai-catalog/composer-messages';
import { requestCatalogPlan, draftErrorMessage } from '../../../src/vnext/ai-catalog/draft-client';
import { VNextTranslationGatewayClient } from '../../../src/vnext/translation/provider-client';
import { W5_TRANSLATION_PROFILE } from '../../../src/vnext/translation/contracts';
import {
  TRANSLATION_USER_AI_KEY_MISSING_MESSAGE, TRANSLATION_USER_AI_KEY_QUOTA_HINT,
} from '../../../src/vnext/translation/review-coordinator';

const KEY_A = 'TEST_FAKE_KEY_OF_USER_A_000000001234';
const KEY_B = 'TEST_FAKE_KEY_OF_USER_B_000000005678';
const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/00032_vnext_user_ai_key.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');

afterEach(() => setMyAiKeyState('unknown'));

describe('migration 00032 (one key per person, Vault, RLS)', () => {
  it('is additive and keeps the key out of the table', () => {
    expect(code).not.toMatch(/\bdrop\s|\btruncate\b|\balter\s+table\s+public\.(?!vnext_user_ai_keys)/i);
    expect(code).not.toMatch(/api_key\s+text\s+not null|decrypted_secret\s+text/i);
    expect(code).toMatch(/secret_id UUID NOT NULL/);
    expect(code).toMatch(/vault\.create_secret\(p_api_key/);
  });
  it('forces RLS, shows only the own row and never grants secret_id to the browser', () => {
    expect(code).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(code).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(code).toMatch(/FOR SELECT TO authenticated USING \(user_id = auth\.uid\(\)\)/);
    const grant = /GRANT SELECT \(([^)]*)\)\s+ON public\.vnext_user_ai_keys TO authenticated/.exec(code);
    expect(grant?.[1]).not.toMatch(/secret_id/);
    expect(code).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/i);
  });
  it('binds save/remove/status to auth.uid() and lets only service_role read the secret', () => {
    expect(code).toMatch(/vnext_ai_key_save_v1\(p_provider TEXT, p_api_key TEXT\)/);
    expect(code).toMatch(/vnext_ai_key_remove_v1\(\)/);
    expect(code).toMatch(/vnext_ai_key_status_v1\(\)/);
    for (const fn of ['save', 'remove', 'status']) {
      const body = code.slice(code.indexOf(`vnext_ai_key_${fn}_v1(`), code.indexOf('$$;', code.indexOf(`vnext_ai_key_${fn}_v1(`)));
      expect(body).toMatch(/auth\.uid\(\)/);
      expect(body).toMatch(/SECURITY DEFINER/);
      expect(body).toMatch(/SET search_path = ''/);
    }
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.vnext_ai_key_secret_for_v1\(UUID\) FROM PUBLIC, anon, authenticated;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.vnext_ai_key_secret_for_v1\(UUID\) TO service_role;/);
    expect(code).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.vnext_ai_key_secret_for_v1\(UUID\) TO authenticated/);
  });

  it('simulated RLS: each person (admin too) sees only their own row, never the key', () => {
    // Simulation of the policy + column grant above, applied to rows of two people.
    const rows = [
      { user_id: 'a', provider: 'gemini', secret_id: 's-a', key_last4: '1234', check_status: 'ok' },
      { user_id: 'b', provider: 'gemini', secret_id: 's-b', key_last4: '5678', check_status: 'untested' },
    ];
    const granted = /GRANT SELECT \(([^)]*)\)/.exec(code)![1].split(',').map(item => item.trim());
    const select = (uid: string) => rows.filter(row => row.user_id === uid)
      .map(row => Object.fromEntries(Object.entries(row).filter(([column]) => granted.includes(column))));
    expect(select('a')).toEqual([{ user_id: 'a', provider: 'gemini', key_last4: '1234', check_status: 'ok' }]);
    expect(select('admin')).toEqual([]);
    expect(JSON.stringify([select('a'), select('b')])).not.toMatch(/s-a|s-b/);
  });
});

describe('server: the key of the right person, or nothing', () => {
  const vault: Record<string, string> = { a: KEY_A, b: KEY_B };
  const readSecret = vi.fn(async (userId: string) => vault[userId] ?? null);

  it('returns only the caller key and ignores the server key unless the flag is on', async () => {
    expect(await resolveCallerAiKey({ userId: 'a', readSecret, serverFallback: false, serverKey: 'SERVER' }))
      .toEqual({ ok: true, key: KEY_A, source: 'user' });
    expect(await resolveCallerAiKey({ userId: 'b', readSecret, serverFallback: true, serverKey: 'SERVER' }))
      .toEqual({ ok: true, key: KEY_B, source: 'user' });
    expect(await resolveCallerAiKey({ userId: 'c', readSecret, serverFallback: false, serverKey: 'SERVER' }))
      .toEqual({ ok: false, code: 'USER_AI_KEY_MISSING' });
    expect(await resolveCallerAiKey({ userId: 'c', readSecret, serverFallback: true, serverKey: 'SERVER' }))
      .toEqual({ ok: true, key: 'SERVER', source: 'server' });
    const broken = vi.fn(async () => { throw new Error('db said ' + KEY_A); });
    const failed = await resolveCallerAiKey({ userId: 'a', readSecret: broken, serverFallback: false, serverKey: '' });
    expect(JSON.stringify(failed)).not.toContain(KEY_A);
    // A failed read is temporary, never "no key", and never silently switches to the server key.
    expect(failed).toEqual({ ok: false, code: 'PROVIDER_UNAVAILABLE' });
    expect(await resolveCallerAiKey({ userId: 'a', readSecret: broken, serverFallback: true, serverKey: 'SERVER' }))
      .toEqual({ ok: false, code: 'PROVIDER_UNAVAILABLE' });
    expect(await runUserKeyTest({ userId: 'a', readSecret: broken, markChecked: null, fetcher: vi.fn() }))
      .toEqual({ ok: true, status: 'unavailable' });
  });
  it('reads the secret only through the service-role client and only for the given user', async () => {
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({ data: vault[String(args.p_user_id)] ?? null, error: null }));
    const access = edgeSecretAccess(name => ({ SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'sr' } as Record<string, string>)[name],
      (_url, key) => { expect(key).toBe('sr'); return { rpc }; });
    expect(access.serverFallback).toBe(false);
    expect(await access.readSecret!('b')).toBe(KEY_B);
    expect(rpc).toHaveBeenCalledWith('vnext_ai_key_secret_for_v1', { p_user_id: 'b' });
    expect(edgeSecretAccess(() => undefined, () => ({ rpc })).readSecret).toBeNull();
  });
  it('"Testar" lists one model with the caller key only and records the result', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    const markChecked = vi.fn(async () => undefined);
    expect(await runUserKeyTest({ userId: 'a', readSecret, markChecked, fetcher })).toEqual({ ok: true, status: 'ok' });
    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/models\?pageSize=1$/), { method: 'GET', headers: { 'x-goog-api-key': KEY_A } });
    expect(markChecked).toHaveBeenCalledWith('a', 'ok');
    expect(await testGeminiKey(KEY_A, async () => new Response('', { status: 403 }))).toBe('rejected');
    expect(await testGeminiKey(KEY_A, async () => { throw new Error('offline'); })).toBe('unavailable');
    expect(await runUserKeyTest({ userId: 'c', readSecret, markChecked, fetcher: vi.fn() })).toEqual({ ok: false, code: 'USER_AI_KEY_MISSING' });
  });
  it('shows only provider, last 4 characters and the result', () => {
    expect(userKeyStatusLine({ key_last4: '1234', check_status: 'ok' })).toBe('Chave de IA (Gemini) cadastrada, termina em 1234. Funcionando.');
    expect(userKeyStatusLine({ key_last4: '1234', check_status: 'error' }))
      .toBe('Chave de IA (Gemini) cadastrada, termina em 1234. O Google recusou esta chave. Troque a chave.');
    expect(userKeyStatusLine({ key_last4: '1234', check_status: 'untested' })).toMatch(/Ainda não testada\. Clique em “Testar”\.$/);
    expect(userKeyStatusLine(null)).toBe('Nenhuma chave de IA (Gemini) cadastrada.');
    expect(isGeminiKeyFormat('short')).toBe(false);
    expect(isGeminiKeyFormat(KEY_A)).toBe(true);
  });
});

describe('browser: the key goes once to the account and never comes back', () => {
  const client = (rows: { data: unknown; error: unknown }) => {
    const rpc = vi.fn(async () => rows);
    const invoke = vi.fn(async () => ({ data: { test: { status: 'ok' } }, error: null }));
    return { rpc, functions: { invoke }, value: { rpc, functions: { invoke } } as unknown as MyAiKeyClient };
  };
  it('saves through the RPC, keeps only the status and knows when the key is missing', async () => {
    const saved = client({ data: [{ provider: 'gemini', key_last4: '1234', check_status: 'untested' }], error: null });
    const status = await saveMyAiKey(saved.value, `  ${KEY_A} `);
    expect(saved.rpc).toHaveBeenCalledWith('vnext_ai_key_save_v1', { p_provider: 'gemini', p_api_key: KEY_A });
    expect(status).toEqual({ provider: 'gemini', key_last4: '1234', check_status: 'untested' });
    expect(JSON.stringify(status)).not.toContain(KEY_A);
    expect(getMyAiKeyState()).toBe('present');
    await removeMyAiKey(client({ data: true, error: null }).value);
    // Only the server knows whether VNEXT_AI_SERVER_KEY_FALLBACK answers people without a key.
    expect(getMyAiKeyState()).toBe('unknown');
    setMyAiKeyState('present');
    expect(await loadMyAiKeyStatus(client({ data: [], error: null }).value)).toBeNull();
    expect(getMyAiKeyState()).toBe('unknown');
    expect(await testMyAiKey(saved.value)).toBe('ok');
    expect(saved.functions.invoke).toHaveBeenCalledWith('vnext-catalog-composer', { body: { version: 1, task: 'test_user_key' } });
    await expect(saveMyAiKey(saved.value, 'curta')).rejects.toThrow('MY_AI_KEY_INVALID_FORMAT');
  });

  it('without a key the AI buttons warn in plain Portuguese and call nothing', async () => {
    setMyAiKeyState('missing');
    const invoke = vi.fn();
    const functions = { functions: { invoke } };
    const composer = nativeComposeGateway(functions as never);
    const composeError = await composer({} as never).catch(error => error);
    expect(composeError).toBeInstanceOf(ComposerRequestError);
    expect(composerErrorMessage(composeError)).toBe(`${USER_AI_KEY_MISSING_MESSAGE} O catálogo não foi alterado.`);
    expect(TRANSLATION_USER_AI_KEY_MISSING_MESSAGE).toBe(USER_AI_KEY_MISSING_MESSAGE);
    expect(TRANSLATION_USER_AI_KEY_QUOTA_HINT).toBe(USER_AI_KEY_QUOTA_HINT);
    expect(USER_AI_KEY_MISSING_MESSAGE).toMatch(/“Meus catálogos”.*“Minha conta”.*“Minha chave de IA”.*⚙/);
    const planError = await requestCatalogPlan(functions as never, { request: 'Catálogo', files: [] } as never).catch(error => error);
    expect(draftErrorMessage(planError).startsWith(`${USER_AI_KEY_MISSING_MESSAGE} Nada foi alterado`)).toBe(true);
    const translate = vi.fn();
    await expect(new VNextTranslationGatewayClient(translate).translate({} as never)).rejects.toMatchObject({ code: 'USER_AI_KEY_MISSING' });
    expect(invoke).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
  });
});

describe('browser: with the server fallback on, a person without a key still reaches the server', () => {
  it('a status with no row does not lock translation; only the server answer does', async () => {
    await loadMyAiKeyStatus({ rpc: vi.fn(async () => ({ data: [], error: null })), functions: { invoke: vi.fn() } } as never);
    const translate = vi.fn(async () => ({ data: { error: 'USER_AI_KEY_MISSING' }, error: null }));
    const profile = W5_TRANSLATION_PROFILE;
    const request = { sourceLocale: profile.sourceLocale, targetLocale: profile.targetLocale,
      profileVersion: profile.profileVersion, contractVersion: profile.contractVersion };
    await new VNextTranslationGatewayClient(translate).translate(request as never).catch(() => undefined);
    expect(translate).toHaveBeenCalledTimes(1);
  });
  it('"Testar" answering 409 (never uses the fallback) does not lock the AI buttons', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: { context: { status: 409 } } }));
    expect(await testMyAiKey({ rpc: vi.fn(), functions: { invoke } } as never)).toBe('missing');
    expect(getMyAiKeyState()).toBe('unknown');
  });
});
