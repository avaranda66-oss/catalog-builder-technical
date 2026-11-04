/**
 * "Minha chave de IA": each person's own Gemini key (migration 00032).
 *
 * Pure module shared by the three Edge functions (Deno), Node tests and the
 * browser. The key itself is only ever handled on the server: it is read with
 * the service role from Supabase Vault for the authenticated caller, used for
 * that one request and never returned, logged or echoed in an error.
 */

/** Server flag that lets the old shared server key answer people again (off by default). */
export const SERVER_KEY_FALLBACK_FLAG = 'VNEXT_AI_SERVER_KEY_FALLBACK';
export const USER_AI_KEY_MISSING = 'USER_AI_KEY_MISSING' as const;
export const USER_AI_KEY_MISSING_MESSAGE = 'Cadastre sua chave de IA em Minha conta.';

export interface ServiceRoleRpc {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export type SecretReader = (userId: string) => Promise<string | null>;
export type CheckMarker = (userId: string, status: 'ok' | 'error') => Promise<void>;
export type KeyFetcher = (input: string, init: RequestInit) => Promise<Response>;

export type CallerKey =
  | { ok: true; key: string; source: 'user' | 'server' }
  | { ok: false; code: typeof USER_AI_KEY_MISSING };

export function isGeminiKeyFormat(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 20 && value.length <= 256 && /^[A-Za-z0-9_-]+$/.test(value);
}

/** Reads ONLY the given user's secret through the service-role RPC. Errors carry no detail. */
export function serviceRoleSecretReader(admin: ServiceRoleRpc): SecretReader {
  return async userId => {
    const { data, error } = await admin.rpc('vnext_ai_key_secret_for_v1', { p_user_id: userId });
    if (error) throw new Error('USER_AI_KEY_READ_FAILED');
    return isGeminiKeyFormat(data) ? data : null;
  };
}
export function serviceRoleCheckMarker(admin: ServiceRoleRpc): CheckMarker {
  return async (userId, status) => {
    try { await admin.rpc('vnext_ai_key_mark_checked_v1', { p_user_id: userId, p_status: status }); }
    catch { /* best effort: the status line just stays as it was */ }
  };
}

/**
 * The key to use for this caller: always the caller's own key. The server key
 * is used only when the fallback flag is on AND the caller has no key.
 */
export async function resolveCallerAiKey(input: {
  userId: string; readSecret: SecretReader | null; serverFallback: boolean; serverKey: string;
}): Promise<CallerKey> {
  let own: string | null = null;
  if (input.readSecret && input.userId) {
    try { own = await input.readSecret(input.userId); } catch { own = null; }
  }
  if (own) return { ok: true, key: own, source: 'user' };
  if (input.serverFallback && input.serverKey) return { ok: true, key: input.serverKey, source: 'server' };
  return { ok: false, code: USER_AI_KEY_MISSING };
}

/** Builds the reader from the Edge environment (null when the service role is not configured). */
export function edgeSecretAccess(
  env: (name: string) => string | undefined,
  createAdmin: (url: string, serviceKey: string) => ServiceRoleRpc,
): { readSecret: SecretReader | null; markChecked: CheckMarker | null; serverFallback: boolean } {
  const url = env('SUPABASE_URL') ?? '', serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = url && serviceKey ? createAdmin(url, serviceKey) : null;
  return {
    readSecret: admin ? serviceRoleSecretReader(admin) : null,
    markChecked: admin ? serviceRoleCheckMarker(admin) : null,
    serverFallback: env(SERVER_KEY_FALLBACK_FLAG) === 'true',
  };
}

/**
 * Minimal, free call to Google: lists one model. Proves the key is accepted
 * without generating any text. The key goes only in the request header.
 */
export async function testGeminiKey(key: string, fetcher: KeyFetcher): Promise<'ok' | 'rejected' | 'unavailable'> {
  let response: Response;
  try {
    response = await fetcher('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
      { method: 'GET', headers: { 'x-goog-api-key': key } });
  } catch { return 'unavailable'; }
  if (response.ok) return 'ok';
  return [400, 401, 403].includes(response.status) ? 'rejected' : 'unavailable';
}

export type UserKeyTestResult = { ok: true; status: 'ok' | 'error' | 'unavailable' } | { ok: false; code: typeof USER_AI_KEY_MISSING };

/** "Testar" button: tests ONLY the caller's own key (never the server key) and records ok/error. */
export async function runUserKeyTest(input: {
  userId: string; readSecret: SecretReader | null; markChecked: CheckMarker | null; fetcher: KeyFetcher;
}): Promise<UserKeyTestResult> {
  const caller = await resolveCallerAiKey({ userId: input.userId, readSecret: input.readSecret, serverFallback: false, serverKey: '' });
  if (!caller.ok) return caller;
  const outcome = await testGeminiKey(caller.key, input.fetcher);
  if (outcome === 'unavailable') return { ok: true, status: 'unavailable' };
  const status = outcome === 'ok' ? 'ok' : 'error';
  await input.markChecked?.(input.userId, status);
  return { ok: true, status };
}

/** "Gemini · termina em …1234 · funcionando" — the only thing the screen ever shows about a key. */
export function userKeyStatusLine(status: { key_last4: string; check_status: string } | null): string {
  if (!status) return 'Nenhuma chave cadastrada.';
  const state = status.check_status === 'ok' ? 'funcionando' : status.check_status === 'error' ? 'erro' : 'ainda não testada';
  return `Gemini · termina em …${status.key_last4} · ${state}`;
}
