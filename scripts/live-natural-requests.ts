/**
 * Onda 4.5 — the father's requests that go to the AI, against the REAL Gemini, through the REAL vnext-catalog-composer
 * handler (Deno source transpiled into a VM, as scripts/live-catalog-plan.ts does) with Supabase simulated (auth,
 * editor profile, 00028 budget). The browser side is the app's own: the router without AI decides the route, the
 * request is built by prepareEditIntentRequest / prepareNativeComposeRequest with the arsenal index, and the answer
 * goes through EditIntentReplySchema + planEditIntents / verifyNativeComposeReply.
 *
 * Measured per request: right action, unnecessary question, use of a saved preset when one fits, refusal of technical
 * values nobody gave, numbers that came from nowhere, tokens and cost (the budget ledger's own settlement).
 *
 *   GEMINI_API_KEY=... npx vite-node scripts/live-natural-requests.ts -- --out <pasta> [--only id,id] [--ceiling 0.6] [--label r1]
 *     [--sem-roteador]
 *
 * --sem-roteador: a comparison only. The requests the router answers locally are sent to the AI lane they would take
 * without it (assistantRouteFor without the local context), to measure what the router saves and whether the AI would
 * also pick the saved preset, ask, or refuse.
 *
 * The key is read only from GEMINI_API_KEY, goes only into the simulated Edge environment and is never printed or
 * written. Tooling only: never imported by the app.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { buildAssistantArsenalAiIndex } from '../src/vnext/arsenal/assistant-arsenal';
import { assistantRouteFor, EditIntentReplySchema, planEditIntents, prepareEditIntentRequest } from '../src/vnext/ai-catalog/edit-intents';
import { prepareNativeComposeRequest, verifyNativeComposeReply } from '../src/vnext/ai-catalog/native-compose';
import { COMPOSER_MODEL } from '../src/vnext/ai-catalog/composer-contract';
import {
  corpusArsenal, corpusDocument, NATURAL_REQUESTS, type ExpectedAction, type NaturalRequest,
} from '../tests/vnext/arsenal/natural-requests.corpus';
import { decideNaturalRequest } from '../tests/vnext/arsenal/natural-requests.harness';

if (!globalThis.crypto) (globalThis as { crypto: unknown }).crypto = webcrypto;
const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ORIGIN = 'http://localhost:5173';

const args = process.argv.slice(2).filter(arg => arg !== '--');
const option = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const out = option('--out');
if (!out) throw new Error('Use: --out <pasta> [--only id,id] [--ceiling 0.6] [--label r1]');
const only = (option('--only') ?? '').split(',').map(item => item.trim()).filter(Boolean);
const ceilingUsd = Number(option('--ceiling') ?? '0.6');
const label = option('--label') ?? 'r1';
const withoutRouter = args.includes('--sem-roteador');
const key = process.env.GEMINI_API_KEY?.trim() ?? '';
if (key.length < 12) throw new Error('Defina GEMINI_API_KEY no ambiente (a chave nunca é impressa).');
const redact = (text: string) => text.split(key).join('[chave]');
await mkdir(out, { recursive: true });

// ---- Simulated Supabase: an active editor and the 00028 budget --------------------------------------------------
const ledger = { reserved: [] as number[], settled: [] as number[] };
const createClient = () => ({
  auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: USER, role: 'editor', is_active: true }, error: null }) }) }) }),
  rpc: async (name: string, params: Record<string, unknown> = {}) => {
    if (name === 'vnext_agent_reserve_budget_v2') {
      ledger.reserved.push(Number(params.p_worst_case_microusd));
      return { data: `00000000-0000-4000-8000-${String(ledger.reserved.length).padStart(12, '0')}`, error: null };
    }
    if (name === 'vnext_agent_settle_budget_v1') { ledger.settled.push(Number(params.p_actual_microusd)); return { data: true, error: null }; }
    if (name === 'vnext_agent_budget_status_v1') return { data: [{ remaining_user_day_microusd: 3_000_000, remaining_org_month_microusd: 60_000_000 }], error: null };
    return { data: null, error: { code: 'PGRST202' } };
  },
});

// ---- The Edge entry, as the unit tests load it -----------------------------------------------------------------
type Handler = (request: Request) => Promise<Response>;
let handler!: Handler;
const env: Record<string, string> = {
  VNEXT_CATALOG_ALLOWED_ORIGINS: ORIGIN, VNEXT_CATALOG_COMPOSER_ENABLED: 'true', VNEXT_CATALOG_AGENT_BUDGET_MODE: 'settled',
  SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-anon', VNEXT_COMPOSER_GEMINI_API_KEY: key,
};
let providerErrors: string[] = [];
/** Diagnostics only (file outside the repository): what the model wrote, when the contract refused it. */
let modelTexts: string[] = [];
const recordingFetch = async (url: string, init: RequestInit) => {
  const response = await fetch(url, init);
  if (response.ok && url.endsWith(':generateContent')) {
    const envelope = await response.clone().json().catch(() => null) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[] } | null;
    const candidate = envelope?.candidates?.[0];
    modelTexts.push(`[${candidate?.finishReason ?? '?'}] ` + (candidate?.content?.parts?.map(part => part.text ?? '').join('') ?? '').slice(0, 600));
  }
  if (!response.ok) {
    const body = await response.clone().json().catch(() => null) as { error?: { message?: string } } | null;
    const step = url.endsWith(':countTokens') ? 'countTokens' : url.endsWith(':generateContent') ? 'generate' : 'outro';
    providerErrors.push(`${step} ${response.status} ${redact(String(body?.error?.message ?? '')).slice(0, 300)}`);
  }
  return response;
};
const context = createContext({ Request, Response, Headers, Blob, URL, AbortSignal, AbortController, DOMException, crypto: globalThis.crypto,
  setTimeout, clearTimeout, TextEncoder, TextDecoder, console, Deno: { env: { get: (name: string) => env[name] } }, fetch: recordingFetch });
const sources = new Map<string, string>();
async function preload(path: string): Promise<void> {
  if (sources.has(path)) return;
  sources.set(path, await readFile(path, 'utf8'));
  for (const match of sources.get(path)!.matchAll(/from '(\.[^']+)'/gu)) await preload(resolve(dirname(path), match[1]));
}
const loaded = new Map<string, Record<string, unknown>>();
function load(path: string): Record<string, unknown> {
  const cached = loaded.get(path);
  if (cached) return cached;
  const exports: Record<string, unknown> = {};
  loaded.set(path, exports);
  const code = ts.transpileModule(sources.get(path)!, { fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireModule = (id: string) => {
    if (id.startsWith('https://deno.land/')) return { serve: (fn: Handler) => { handler = fn; } };
    if (id.startsWith('https://esm.sh/@supabase/')) return { createClient };
    if (id.startsWith('.')) return load(resolve(dirname(path), id));
    throw new Error('dependency ' + id);
  };
  runInContext(`(function (exports, require, module) {${code}\n})`, context, { filename: path })(exports, requireModule, { exports });
  return exports;
}
const entry = resolve('supabase/functions/vnext-catalog-composer/index.ts');
await preload(entry);
load(entry);

async function call(body: unknown) {
  providerErrors = [];
  modelTexts = [];
  const settledBefore = ledger.settled.reduce((sum, value) => sum + value, 0);
  const started = performance.now();
  const response = await handler(new Request('https://fixture.invalid/functions/v1/vnext-catalog-composer', {
    method: 'POST', headers: { Origin: ORIGIN, Authorization: 'Bearer live', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const text = await response.text();
  if (text.includes(key)) throw new Error('A resposta da função trouxe a chave: abortado.');
  const settled = ledger.settled.reduce((sum, value) => sum + value, 0) - settledBefore;
  return { status: response.status, json: JSON.parse(text) as Record<string, unknown>, ms: Math.round(performance.now() - started),
    costMicrousd: settled, providerErrors: [...providerErrors], modelTexts: [...modelTexts] };
}

// ---- The corpus ----------------------------------------------------------------------------------------------------
const presets = corpusArsenal();
const withoutIndex = process.env.NATURAL_NO_ARSENAL === '1';
const index = withoutIndex ? { entries: [], presetIdOf: () => undefined } : buildAssistantArsenalAiIndex(presets);
const nameOfRef = (ref: string) => index.entries.find(item => item.ref === ref)?.name;
const typedNumbers = (message: string) => new Set(message.match(/\d+(?:[.,]\d+)?/g) ?? []);
const documentNumbers = new Set(JSON.stringify(corpusDocument()).match(/\d+(?:[.,]\d+)?/g) ?? []);

interface LiveResult {
  readonly id: string;
  readonly kind: NaturalRequest['kind'];
  readonly message: string;
  readonly route: string;
  readonly status: string;
  readonly actionOk: boolean;
  readonly unnecessaryQuestion: boolean;
  readonly refused?: boolean;
  /** Expected a saved preset: did the AI point at it? */
  readonly presetUsed?: boolean;
  /** Numbers in the AI's proposal that nobody typed and that are not in the catalog. */
  readonly strayNumbers: readonly string[];
  /** Invented numbers the checks blocked (the lock worked). */
  readonly blockedInvented: number;
  readonly detail: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly attempts: number;
  readonly costUsd: number;
  readonly ms: number;
  readonly error?: string;
  readonly raw?: string;
}

/**
 * What the AI should do with a request the router answers locally (comparison mode): point at the same saved preset,
 * do the same style change, or build the page/table. A local deterministic action has no preset to point at.
 */
function aiExpectation(entry: NaturalRequest): ExpectedAction {
  const action = entry.expected.action;
  switch (action.type) {
    case 'preset': return { type: 'use_preset', names: action.names };
    case 'preset-category': return { type: 'use_preset', names: presets.filter(preset => preset.category === action.category).map(preset => preset.name) };
    case 'page.template': return { type: 'use_preset', names: action.presetNames };
    case 'style': {
      const kind = action.change.kind;
      return { type: 'edit', kinds: [kind] };
    }
    case 'table.new': return { type: 'compose', minPages: 1, maxPages: 1, table: true };
    case 'page.blank': return { type: 'compose', minPages: 1, maxPages: 1 };
    default: return action;
  }
}

function evaluate(entry: NaturalRequest, route: 'edit_intent' | 'composer', reply: unknown, outlineHint: (ref: string) => string | undefined,
  plan: ReturnType<typeof planEditIntents> | undefined) {
  const expected = withoutRouter && entry.expected.route === 'local' ? aiExpectation(entry) : entry.expected.action;
  const r = reply as { status: string; preset?: string; question?: string; reason?: string; summary?: string;
    intents?: { kind: string; target?: string; page?: string; text?: string }[]; pages?: { type: string; heading: string; subtitle?: string;
      table?: { columns: string[]; rowLabels: string[] } }[] };
  const status = r.status;
  const asked = status === 'clarification';
  const stray = new Set<string>();
  let blockedInvented = 0;
  let detail = '';
  let actionOk = false;
  const allowedNumbers = typedNumbers(entry.message);
  if (route === 'edit_intent' && plan?.status === 'plan') {
    const items = plan.plan.items;
    const kinds = items.map(item => item.kind);
    const hints = (r.intents ?? []).map(intent => intent.target ? outlineHint(intent.target) : intent.page).filter(Boolean) as string[];
    blockedInvented = plan.plan.blocked.filter(item => /inventar|número que não está/i.test(item.reason)).length;
    // Sizes in points or millimetres of text_size/resize are computed by the app, not written by the AI.
    for (const item of items.filter(entry => entry.kind === 'set_text' || entry.kind === 'translate_text')) for (const digits of (item.after ?? '').match(/\d+(?:[.,]\d+)?/g) ?? []) {
      if (!allowedNumbers.has(digits) && !(item.before ?? '').includes(digits)) stray.add(digits);
    }
    detail = items.map(item => `${item.title} → ${item.target}${item.after ? ` = “${item.after.slice(0, 50)}”` : ''}`).join(' | ')
      + (plan.plan.blocked.length ? ` · recusado: ${plan.plan.blocked.map(item => item.reason.slice(0, 60)).join(' / ')}` : '');
    if (expected.type === 'edit') {
      actionOk = items.length > 0 && expected.kinds.every(kind => kinds.includes(kind)) && kinds.every(kind => expected.kinds.includes(kind))
        && (!expected.hints || hints.some(hint => expected.hints!.includes(hint)));
    }
  } else if (status === 'proposal' && route === 'composer') {
    const pages = r.pages ?? [];
    detail = pages.map(page => `${page.type}: ${page.heading}${page.table ? ` [${page.table.columns.join(', ')} × ${page.table.rowLabels.join(', ')}]` : ''}`).join(' | ');
    for (const page of pages) {
      const texts = [page.heading, page.subtitle ?? '', ...(page.table?.columns ?? []), ...(page.table?.rowLabels ?? [])];
      for (const text of texts) for (const digits of text.match(/\d+(?:[.,]\d+)?/g) ?? []) if (!allowedNumbers.has(digits)) stray.add(digits);
    }
    // A model code the father typed ("capa pro TA-25N") must reach a heading or subtitle.
    const codes = entry.message.match(/\b[A-Za-z]+-?\d+[A-Za-z]*\b/g) ?? [];
    const named = codes.every(code => pages.some(page => `${page.heading} ${page.subtitle ?? ''}`.toUpperCase().includes(code.toUpperCase())));
    if (expected.type === 'compose') {
      actionOk = named && pages.length >= expected.minPages && pages.length <= expected.maxPages && (!expected.table || pages.some(page => page.table));
    }
  } else if (status === 'use_preset') {
    const name = nameOfRef(r.preset ?? '');
    detail = `arsenal: ${name ?? r.preset}${r.summary ? ` — “${r.summary}”` : ''}`;
    actionOk = expected.type === 'use_preset' && !!name && expected.names.includes(name);
  } else if (status === 'refusal') {
    detail = `recusa: “${r.reason ?? ''}”`;
    actionOk = expected.type === 'refusal';
  } else if (asked) {
    detail = `pergunta: “${r.question ?? ''}”`;
    // A question is the right action only when the corpus allows it (and it is never a refusal).
    actionOk = entry.expected.asks === 'allowed' && expected.type !== 'refusal';
  }
  for (const digits of [...stray]) if (documentNumbers.has(digits) && route === 'edit_intent') stray.delete(digits);
  return {
    status, actionOk, detail, blockedInvented, strayNumbers: [...stray],
    unnecessaryQuestion: asked && entry.expected.asks === 'never',
    ...(expected.type === 'refusal' ? { refused: status === 'refusal' } : {}),
    ...(expected.type === 'use_preset' ? { presetUsed: status === 'use_preset' && actionOk } : {}),
  };
}

const document = corpusDocument();
const results: LiveResult[] = [];
let spentMicrousd = 0;
for (const item of NATURAL_REQUESTS.filter(entry => !only.length || only.includes(entry.id))) {
  const { result: decided } = decideNaturalRequest(item, document, presets);
  // Comparison mode: only what the router answers locally, sent to the lane it would take without the router.
  const result = withoutRouter
    ? (decided.route === 'local' ? { ...decided, route: assistantRouteFor(item.message, document, {}) === 'edit' ? 'edit_intent' as const : 'composer' as const } : undefined)
    : decided;
  if (!result || (result.route !== 'edit_intent' && result.route !== 'composer')) continue;
  if (spentMicrousd / 1e6 >= ceilingUsd) { console.log('teto atingido: parando'); break; }
  const activePageId = document.pages[item.page - 1].id;
  const base = { id: item.id, kind: item.kind, message: item.message, route: result.route };
  try {
    if (result.route === 'edit_intent') {
      const { request, outline } = prepareEditIntentRequest(document, item.message, [], { activePageId, selectedObjectIds: item.selection ?? [] }, index.entries);
      const reply = await call(request);
      spentMicrousd += reply.costMicrousd;
      const usage = reply.json.usage as { inputTokens: number; outputTokens: number } | undefined;
      const common = { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0,
        attempts: Array.isArray(reply.json.attempts) ? reply.json.attempts.length : (reply.json.attempts as number | undefined) ?? 0,
        costUsd: reply.costMicrousd / 1e6, ms: reply.ms };
      if (reply.json.code !== 'OK') {
        results.push({ ...base, ...common, status: 'erro', actionOk: false, unnecessaryQuestion: false, strayNumbers: [], blockedInvented: 0,
          detail: reply.modelTexts.map(redact).join(' || '), error: `${reply.json.code} ${reply.json.reason ?? ''} ${reply.providerErrors.join(' ')}`.trim() });
      } else {
        const parsed = EditIntentReplySchema.parse(reply.json.reply);
        if (parsed.status === 'use_preset' && !index.entries.some(entry => entry.ref === parsed.preset)) throw new Error('EDIT_INTENT_PRESET_UNKNOWN');
        const plan = planEditIntents(document, 0, outline, parsed, [request.message]);
        const hint = (ref: string) => outline.outline.pages.flatMap(page => page.detail ?? []).find(object => object.ref === ref)?.hint;
        const judged = evaluate(item, 'edit_intent', parsed, hint, plan);
        // Diagnostics only (file outside the repository): what the model wrote when the answer was not right.
        results.push({ ...base, ...common, ...judged, ...(judged.actionOk ? {} : { raw: reply.modelTexts.map(redact).join(' || ') }) });
      }
    } else {
      const request = prepareNativeComposeRequest(document, item.message, [], index.entries);
      const reply = await call(request);
      spentMicrousd += reply.costMicrousd;
      const usage = reply.json.usage as { inputTokens: number; outputTokens: number } | undefined;
      const common = { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0,
        attempts: Array.isArray(reply.json.attempts) ? reply.json.attempts.length : (reply.json.attempts as number | undefined) ?? 0,
        costUsd: reply.costMicrousd / 1e6, ms: reply.ms };
      if (reply.json.code !== 'OK') {
        results.push({ ...base, ...common, status: 'erro', actionOk: false, unnecessaryQuestion: false, strayNumbers: [], blockedInvented: 0,
          detail: reply.modelTexts.map(redact).join(' || '), error: `${reply.json.code} ${reply.json.reason ?? ''} ${reply.providerErrors.join(' ')}`.trim() });
      } else {
        const parsed = verifyNativeComposeReply(reply.json.reply, index.entries);
        results.push({ ...base, ...common, ...evaluate(item, 'composer', parsed, () => undefined, undefined) });
      }
    }
  } catch (failure) {
    results.push({ ...base, status: 'erro', actionOk: false, unnecessaryQuestion: false, strayNumbers: [], blockedInvented: 0, detail: '',
      inputTokens: 0, outputTokens: 0, attempts: 0, costUsd: 0, ms: 0, error: redact(String((failure as Error).message ?? failure)).slice(0, 200) });
  }
  const last = results.at(-1)!;
  console.log(`${last.id.padEnd(13)} ${last.actionOk ? 'ACERTO' : 'ERRO  '} ${last.route.padEnd(11)} ${last.status.padEnd(13)} `
    + `${String(last.inputTokens).padStart(5)}+${String(last.outputTokens).padStart(4)} tok US$ ${last.costUsd.toFixed(5)} ${last.error ?? ''}`);
}

const sum = (pick: (result: LiveResult) => number) => results.reduce((total, result) => total + pick(result), 0);
const summary = {
  model: COMPOSER_MODEL, label, mode: withoutRouter ? 'sem-roteador (comparação)' : 'rotas do app', at: new Date().toISOString(),
  requests: results.length,
  actionOk: results.filter(result => result.actionOk).length,
  unnecessaryQuestions: results.filter(result => result.unnecessaryQuestion).length,
  refusals: { expected: results.filter(result => result.refused !== undefined).length, done: results.filter(result => result.refused).length },
  undueRefusals: results.filter(result => result.status === 'refusal' && result.kind !== 'tecnico').length,
  presets: { expected: results.filter(result => result.presetUsed !== undefined).length, used: results.filter(result => result.presetUsed).length },
  strayNumbers: results.filter(result => result.strayNumbers.length).map(result => ({ id: result.id, numbers: result.strayNumbers })),
  blockedInvented: sum(result => result.blockedInvented),
  inputTokens: sum(result => result.inputTokens), outputTokens: sum(result => result.outputTokens),
  costUsd: Number((spentMicrousd / 1e6).toFixed(6)),
  avgCostUsd: results.length ? Number((spentMicrousd / 1e6 / results.length).toFixed(6)) : 0,
  arsenalIndex: { entries: index.entries.length, chars: JSON.stringify(index.entries).length },
};
await writeFile(join(out, `linguagem-natural-${label}.json`), redact(JSON.stringify({ summary, results }, null, 1)));
console.log(JSON.stringify(summary, null, 1));
