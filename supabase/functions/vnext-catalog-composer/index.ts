import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
// Bundled with the Edge Function; scripts/probe-composer.mjs and the VM tests run the same source.
import {
  COMPOSER_LIMITS, composerReservationMicrousd, isObj, parseComposerBudgetMode, parseComposerRequest,
  runComposerGeneration,
  type ComposerAttempt, type ComposerBudgetMode, type ComposerLedger, type ComposerLedgerPort,
} from '../../../src/vnext/ai-catalog/composer-contract.ts';
import type { ComposerErrorCode, ComposerErrorReason } from '../../../src/vnext/ai-catalog/composer-codes.ts';

// Gemini editorial scaffold. Never authoritative for engineering facts.
// Authentication, active editor role and a durable budget reservation are
// mandatory before any provider call. Server key by default; a personal key
// (BYOK) only when VNEXT_CATALOG_AGENT_BYOK_ENABLED=true.
type Obj = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const ok = (Deno.env.get('VNEXT_CATALOG_ALLOWED_ORIGINS') ?? '').split(',').map(x => x.trim());
  return { ...(origin && ok.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization,apikey,x-client-info,content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS' };
}
function json(headers: Record<string, string>, status: number, code: ComposerErrorCode | 'OK', rest: Obj = {}) {
  return new Response(JSON.stringify({ code, ...rest }), { status, headers: {
    ...headers, 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
const fail = (headers: Record<string, string>, status: number, code: ComposerErrorCode, reason?: ComposerErrorReason) =>
  json(headers, status, code, reason ? { reason } : {});

/** PostgREST "function not found": migration 00028 is not applied yet. */
const missingRpc = (error: unknown) => isObj(error) && (error.code === 'PGRST202' || error.code === '42883');

/**
 * Budget adapter. 'bounded-acceptance' keeps the 00027 behaviour exactly.
 * 'settled' uses 00028 (reserve -> settle by real usage, refund on provider
 * error) and falls back to 00027 while 00028 is not applied, so the composer
 * works with and without the migration.
 */
function budgetLedger(db: Db, mode: ComposerBudgetMode): ComposerLedgerPort & {
  remaining(): Promise<{ remainingMicrousd: number | null; callReserveMicrousd: number }>;
} {
  let ledger: ComposerLedger | null = mode === 'settled' ? null : 'legacy';
  return {
    async reserve(attempt: ComposerAttempt) {
      if (ledger !== 'legacy') {
        const microusd = composerReservationMicrousd('settled', attempt);
        const { data, error } = await db.rpc('vnext_agent_reserve_budget_v2',
          { p_worst_case_microusd: microusd, p_feature: 'composer' });
        if (!error) {
          ledger = 'settled';
          return typeof data === 'string' && data ? { id: data, microusd, ledger: 'settled' as const } : null;
        }
        if (!missingRpc(error)) return null;
        ledger = 'legacy';
      }
      const microusd = composerReservationMicrousd('legacy', attempt);
      const { data, error } = await db.rpc('vnext_agent_reserve_budget', { p_worst_case_microusd: microusd });
      return !error && data === true ? { id: null, microusd, ledger: 'legacy' as const } : null;
    },
    async settle(id: string | null, actualMicrousd: number) {
      if (!id) return;
      // Best effort: an unsettled reservation stays at its worst case (fail closed).
      try { await db.rpc('vnext_agent_settle_budget_v1', { p_reservation_id: id, p_actual_microusd: actualMicrousd }); }
      catch { /* keep the worst-case reservation */ }
    },
    async remaining() {
      const legacy = { remainingMicrousd: null, callReserveMicrousd: composerReservationMicrousd('legacy', 'first') };
      if (mode !== 'settled') return legacy;
      const { data, error } = await db.rpc('vnext_agent_budget_status_v1');
      const value = Array.isArray(data) ? data[0] : data;
      if (error || !isObj(value)) return legacy;
      const remaining = [Number(value.remaining_user_day_microusd), Number(value.remaining_org_month_microusd)]
        .filter(Number.isFinite);
      return { remainingMicrousd: remaining.length ? Math.max(0, Math.min(...remaining)) : null,
        callReserveMicrousd: composerReservationMicrousd('settled', 'first') };
    },
  };
}

serve(async req => {
  const c = cors(req), origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c });
  if (req.method !== 'POST') return fail(c, 405, 'METHOD_NOT_ALLOWED');
  if (origin && !c['Access-Control-Allow-Origin']) return fail(c, 403, 'INVALID_ORIGIN');
  const mode = parseComposerBudgetMode(Deno.env.get('VNEXT_CATALOG_AGENT_BUDGET_MODE'));
  if (Deno.env.get('VNEXT_CATALOG_COMPOSER_ENABLED') !== 'true' || !mode) return fail(c, 503, 'COMPOSER_DISABLED');
  const url = Deno.env.get('SUPABASE_URL') ?? '', anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!url || !anon) return fail(c, 503, 'SERVER_NOT_CONFIGURED');
  if (!auth.startsWith('Bearer ')) return fail(c, 401, 'UNAUTHENTICATED');
  const db = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return fail(c, 401, 'UNAUTHENTICATED');
  const { data: profile, error: roleError } = await db.from('profiles').select('id,role,is_active')
    .eq('id', user.id).maybeSingle();
  if (roleError || !profile?.is_active || !['admin', 'editor'].includes(profile.role)) return fail(c, 403, 'FORBIDDEN');
  if (Number(req.headers.get('content-length') ?? 0) > COMPOSER_LIMITS.maxBodyChars) return fail(c, 413, 'PAYLOAD_TOO_LARGE');
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > COMPOSER_LIMITS.maxBodyChars) return fail(c, 413, 'PAYLOAD_TOO_LARGE');
    body = JSON.parse(raw);
  } catch { return fail(c, 400, 'INVALID_REQUEST'); }
  const request = parseComposerRequest(body);
  if (!request) return fail(c, 400, 'INVALID_REQUEST');
  const byok = Deno.env.get('VNEXT_CATALOG_AGENT_BYOK_ENABLED') === 'true';
  // Composer-specific secret first, so the shared GEMINI_API_KEY (translation,
  // classic app, agent) never has to be overwritten.
  const serverKey = Deno.env.get('VNEXT_COMPOSER_GEMINI_API_KEY') || Deno.env.get('GEMINI_API_KEY') || '';
  const ledger = budgetLedger(db, mode);
  if (request.task === 'status') {
    // No provider call and no reservation: only tells the screen whether the AI is ready.
    return json(c, 200, 'OK', { status: { enabled: true, mode, serverKey: !!serverKey, byok, ...await ledger.remaining() } });
  }
  if (request.key && !byok) return fail(c, 503, 'BYOK_DISABLED');
  const key = request.key ?? serverKey;
  if (!key) return fail(c, 503, 'PROVIDER_NOT_CONFIGURED');
  // Credentials, prompts, document titles and model text must never be logged.
  const result = await runComposerGeneration({ request, key, ledger, fetcher: (input, init) => fetch(input, init) });
  return result.ok
    ? json(c, 200, 'OK', { reply: result.reply, usage: result.usage, attempts: result.attempts })
    : fail(c, result.status, result.code, result.reason);
});
