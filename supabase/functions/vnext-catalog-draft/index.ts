import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
// Bundled with the Edge Function; the unit tests and the local live check run the same source.
import {
  DRAFT_LIMITS, EXTRACTION_MODEL, EXTRACTION_PROMPT_VERSION, SOURCE_FILES_BUCKET, extractionReservationMicrousd,
  parseDraftRequest, runFactExtraction,
  type CachedExtraction, type DraftCachePort, type DraftLedgerPort, type DraftSourcePort, type ExtractionCacheKey,
} from '../../../src/vnext/ai-catalog/draft-contract.ts';
import { isObj } from '../../../src/vnext/ai-catalog/composer-contract.ts';
import type { DraftErrorCode, DraftErrorReason } from '../../../src/vnext/ai-catalog/draft-codes.ts';
import { runSketchInterpretation } from '../../../src/vnext/ai-catalog/sketch-contract.ts';
import { PLAN_LIMITS, parsePlanDraftRequest, runCatalogPlan } from '../../../src/vnext/ai-catalog/catalog-plan-contract.ts';

// FR-66: Gemini reads one private PDF or photo and proposes specification
// values. Never authoritative: the browser verifies every value against the
// file's own text. Same guards as the composer: origin, JWT, active
// admin/editor profile, payload size and a budget reservation (00028) before
// any billed provider call. Server key only (no personal key here).
// FR-70 (plan_draft): the same guards for the catalog plan; only that task
// may carry the page texts (PLAN_LIMITS.maxBodyChars), every other task keeps
// the small DRAFT_LIMITS.maxBodyChars.
// Credentials, prompts, file names and model text are never logged.
type Obj = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const ok = (Deno.env.get('VNEXT_CATALOG_ALLOWED_ORIGINS') ?? '').split(',').map(x => x.trim());
  return { ...(origin && ok.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization,apikey,x-client-info,content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS' };
}
function json(headers: Record<string, string>, status: number, code: DraftErrorCode | 'OK', rest: Obj = {}) {
  return new Response(JSON.stringify({ code, ...rest }), { status, headers: {
    ...headers, 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
const fail = (headers: Record<string, string>, status: number, code: DraftErrorCode, reason?: DraftErrorReason) =>
  json(headers, status, code, reason ? { reason } : {});

/** PostgREST "function not found": a migration (00028 or 00029) is not applied yet. */
const missingRpc = (error: unknown) => isObj(error) && (error.code === 'PGRST202' || error.code === '42883');

/** Budget on the settled ledger only (00028, feature 'extraction'): an extraction never fits the 00027 cap. */
function budgetLedger(db: Db): DraftLedgerPort & { remaining(): Promise<{ ledger: 'settled' | 'missing'; remainingMicrousd: number | null }> } {
  return {
    async reserve(microusd: number) {
      const { data, error } = await db.rpc('vnext_agent_reserve_budget_v2', { p_worst_case_microusd: microusd, p_feature: 'extraction' });
      if (error) return missingRpc(error) ? 'missing' : null;
      return typeof data === 'string' && data ? { id: data, microusd } : null;
    },
    async settle(id: string, actualMicrousd: number) {
      // Best effort: an unsettled reservation stays at its worst case (fail closed).
      try { await db.rpc('vnext_agent_settle_budget_v1', { p_reservation_id: id, p_actual_microusd: actualMicrousd }); }
      catch { /* keep the worst-case reservation */ }
    },
    async remaining() {
      const { data, error } = await db.rpc('vnext_agent_budget_status_v1');
      if (error) return { ledger: missingRpc(error) ? 'missing' : 'settled', remainingMicrousd: null };
      const value = Array.isArray(data) ? data[0] : data;
      if (!isObj(value)) return { ledger: 'settled', remainingMicrousd: null };
      const remaining = [Number(value.remaining_user_day_microusd), Number(value.remaining_org_month_microusd)].filter(Number.isFinite);
      return { ledger: 'settled', remainingMicrousd: remaining.length ? Math.max(0, Math.min(...remaining)) : null };
    },
  };
}

/** Extraction cache of 00029, through its two hardened RPCs; while 00029 is missing, every call is a miss. */
function extractionCache(db: Db): DraftCachePort {
  const args = (key: ExtractionCacheKey) => ({ p_sha256: key.sha256, p_first_page: key.firstPage, p_last_page: key.lastPage,
    p_llm_model: key.llmModel, p_prompt_version: key.promptVersion, p_models_key: key.modelsKey });
  return {
    async get(key) {
      const { data, error } = await db.rpc('vnext_source_extraction_get_v1', args(key));
      if (error || !isObj(data) || !isObj(data.answer)) return null;
      const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
      return { sheet: data.answer, trimmed: count(data.trimmed),
        modelVersion: typeof data.model_version === 'string' ? data.model_version : null,
        inputTokens: count(data.input_tokens), outputTokens: count(data.output_tokens) };
    },
    async put(key, entry: CachedExtraction) {
      await db.rpc('vnext_source_extraction_put_v1', { ...args(key), p_answer: entry.sheet, p_trimmed: entry.trimmed,
        p_model_version: entry.modelVersion, p_input_tokens: entry.inputTokens, p_output_tokens: entry.outputTokens });
    },
  };
}

/** The private file, read with the caller's own token (Storage RLS decides). */
function privateSource(db: Db): DraftSourcePort {
  return {
    async read(path: string) {
      const { data, error } = await db.storage.from(SOURCE_FILES_BUCKET).download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

serve(async req => {
  const c = cors(req), origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c });
  if (req.method !== 'POST') return fail(c, 405, 'METHOD_NOT_ALLOWED');
  if (origin && !c['Access-Control-Allow-Origin']) return fail(c, 403, 'INVALID_ORIGIN');
  if (Deno.env.get('VNEXT_CATALOG_DRAFT_ENABLED') !== 'true') return fail(c, 503, 'DRAFT_DISABLED');
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
  if (Number(req.headers.get('content-length') ?? 0) > PLAN_LIMITS.maxBodyChars) return fail(c, 413, 'PAYLOAD_TOO_LARGE');
  let body: unknown, size: number;
  try {
    const raw = await req.text();
    size = raw.length;
    if (size > PLAN_LIMITS.maxBodyChars) return fail(c, 413, 'PAYLOAD_TOO_LARGE');
    body = JSON.parse(raw);
  } catch { return fail(c, 400, 'INVALID_REQUEST'); }
  const planning = isObj(body) && body.task === 'plan_draft';
  if (!planning && size > DRAFT_LIMITS.maxBodyChars) return fail(c, 413, 'PAYLOAD_TOO_LARGE');
  const plan = planning ? parsePlanDraftRequest(body) : null;
  const request = planning ? null : parseDraftRequest(body);
  if (!plan && !request) return fail(c, 400, 'INVALID_REQUEST');
  // Draft-specific secret first, so the shared keys never have to be overwritten.
  const key = Deno.env.get('VNEXT_DRAFT_GEMINI_API_KEY') || Deno.env.get('VNEXT_COMPOSER_GEMINI_API_KEY') ||
    Deno.env.get('GEMINI_API_KEY') || '';
  const ledger = budgetLedger(db);
  if (plan) {
    if (!key) return fail(c, 503, 'PROVIDER_NOT_CONFIGURED');
    const result = await runCatalogPlan({ request: plan, key, ledger, fetcher: (input, init) => fetch(input, init) });
    return result.ok
      ? json(c, 200, 'OK', { plan: result.plan })
      : fail(c, result.status, result.code, result.reason);
  }
  if (!request) return fail(c, 400, 'INVALID_REQUEST');
  if (request.task === 'status') {
    // No provider call and no reservation: only tells the screen whether reading files can start.
    const budget = await ledger.remaining();
    // `tasks` lets a newer screen know what this deployed version can do before it spends anything.
    return json(c, 200, 'OK', { status: { enabled: true, serverKey: !!key, model: EXTRACTION_MODEL,
      tasks: ['extract_facts', 'interpret_sketch', 'plan_draft'],
      promptVersion: EXTRACTION_PROMPT_VERSION, budget: budget.ledger, remainingMicrousd: budget.remainingMicrousd,
      callReserveMicrousd: extractionReservationMicrousd() } });
  }
  if (!key) return fail(c, 503, 'PROVIDER_NOT_CONFIGURED');
  if (request.task === 'interpret_sketch') {
    const result = await runSketchInterpretation({ request, key, ledger, source: privateSource(db),
      fetcher: (input, init) => fetch(input, init) });
    return result.ok
      ? json(c, 200, 'OK', { sketch: result.sketch })
      : fail(c, result.status, result.code, result.reason);
  }
  const result = await runFactExtraction({ request, key, ledger, cache: extractionCache(db), source: privateSource(db),
    fetcher: (input, init) => fetch(input, init) });
  return result.ok
    ? json(c, 200, 'OK', { extraction: result.extraction })
    : fail(c, result.status, result.code, result.reason);
});
