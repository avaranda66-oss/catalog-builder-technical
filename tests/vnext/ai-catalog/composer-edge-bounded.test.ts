// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { buildDocumentOutline } from '../../../src/vnext/ai-catalog/document-outline';
import type { CatalogDocument } from '../../../src/vnext/domain';

// Provider, authentication, RPC, network and keys are FULLY simulated.
// The handler and its shared contract module are executed as real source.
const FAKE_KEY = 'TEST_FAKE_GEMINI_KEY_NOT_A_CREDENTIAL';
const SERVER_KEY = 'TEST_FAKE_SERVER_KEY_NOT_A_CREDENTIAL';
const ENTRY = resolve(process.cwd(), 'supabase/functions/vnext-catalog-composer/index.ts');
type Handler = (request: Request) => Promise<Response>;
const plan = { status: 'proposal', summary: 'Estrutura de catálogo com seções editáveis.',
  pages: [{ type: 'comparison', heading: 'Comparativo de famílias',
    table: { columns: ['Característica', 'Modelo A', 'Modelo B'],
      rowLabels: ['Exatidão', 'Faixa de operação'], design: 'matrix' } }] };
type Generated = { finishReason?: string; reply?: unknown; rawText?: string; status?: number; body?: unknown };
type Options = {
  flag?: boolean;
  byok?: boolean;
  reserve?: boolean;
  active?: boolean;
  role?: string;
  validUser?: boolean;
  tokenCount?: number;
  finishReason?: string;
  reply?: unknown;
  /** One entry per generateContent call (repair attempts included). */
  generations?: Generated[];
  budgetMode?: string;
  serverKey?: string | null;
  composerKey?: string;
  settled?: 'present' | 'missing';
  countStatus?: number;
};

/** Loads the Deno entry and its relative imports as CommonJS inside one VM context. */
function loadEdge(entry: string, globals: Record<string, unknown>, onServe: (handler: Handler) => void) {
  const cache = new Map<string, Record<string, unknown>>();
  const context = createContext({ ...globals });
  const load = (path: string): Record<string, unknown> => {
    const cached = cache.get(path);
    if (cached) return cached;
    const exports: Record<string, unknown> = {};
    cache.set(path, exports);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const requireModule = (id: string) => {
      if (id === 'https://deno.land/std@0.224.0/http/server.ts') return { serve: onServe };
      if (id === 'https://esm.sh/@supabase/supabase-js@2.112.4') return { createClient: globals.createClient };
      if (id.startsWith('.')) return load(resolve(dirname(path), id));
      throw new Error('Unexpected Edge dependency: ' + id);
    };
    const wrapper = runInContext(`(function (exports, require, module) {${code}\n})`, context, { filename: path });
    wrapper(exports, requireModule, { exports });
    return exports;
  };
  load(entry);
}

function sandbox(options: Options = {}) {
  const env: Record<string, string | undefined> = {
    VNEXT_CATALOG_ALLOWED_ORIGINS: 'https://preview.example.invalid',
    VNEXT_CATALOG_COMPOSER_ENABLED: options.flag === false ? 'false' : 'true',
    VNEXT_CATALOG_AGENT_BUDGET_MODE: options.budgetMode ?? 'bounded-acceptance',
    VNEXT_CATALOG_AGENT_BYOK_ENABLED: options.byok === false ? 'false' : 'true',
    SUPABASE_URL: 'https://supabase.example.invalid',
    SUPABASE_ANON_KEY: 'FAKE_ANON_PUBLIC_TEST_KEY',
    GEMINI_API_KEY: options.serverKey === null ? undefined : options.serverKey ?? SERVER_KEY,
    VNEXT_COMPOSER_GEMINI_API_KEY: options.composerKey,
  };
  const events: string[] = [];
  const settlements: Array<{ id: string; actual: number }> = [];
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'vnext_agent_reserve_budget') {
      events.push('quota-reserved');
      return { data: options.reserve === false ? false : true, error: null };
    }
    if (options.settled !== 'present') return { data: null, error: { code: 'PGRST202', message: 'not found' } };
    if (name === 'vnext_agent_reserve_budget_v2') {
      events.push('quota-reserved-v2');
      return { data: options.reserve === false ? null : 'b1a7c0de-0000-4000-8000-00000000000' + events.length, error: null };
    }
    if (name === 'vnext_agent_settle_budget_v1') {
      events.push('settled');
      settlements.push({ id: String(args?.p_reservation_id), actual: Number(args?.p_actual_microusd) });
      return { data: true, error: null };
    }
    if (name === 'vnext_agent_budget_status_v1') {
      return { data: { remaining_user_day_microusd: 2_500_000, remaining_org_month_microusd: 59_000_000 }, error: null };
    }
    return { data: null, error: { code: 'PGRST202', message: 'not found' } };
  });
  const getUser = vi.fn(async () => ({
    data: { user: options.validUser === false ? null : { id: 'test-user' } },
    error: null,
  }));
  const createClient = vi.fn(() => ({
    auth: { getUser },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({
          data: { id: 'test-user', role: options.role ?? 'editor',
            is_active: options.active !== false },
          error: null,
        }) }),
      }),
    })),
    rpc,
  }));
  let generation = 0;
  const fetch = vi.fn(async (url: string, request?: RequestInit) => {
    if (url.endsWith(':countTokens')) {
      events.push('countTokens');
      if (options.countStatus) return new Response('{}', { status: options.countStatus });
      return new Response(JSON.stringify({ totalTokens: options.tokenCount ?? 250 }),
        { status: 200 });
    }
    events.push('generateContent');
    const step = options.generations?.[generation] ?? {};
    generation++;
    if (step.status) return new Response(JSON.stringify(step.body ?? {}), { status: step.status });
    const requestBody = JSON.parse(String(request?.body));
    const task = JSON.parse(requestBody.contents[0].parts[0].text);
    const output = step.reply ?? options.reply ?? (task.userRequest.includes('reescreva') ?
      { status: 'proposal', revisedText: 'Apresentação institucional do catálogo' } : plan);
    return new Response(JSON.stringify({
      candidates: [{ finishReason: step.finishReason ?? options.finishReason ?? 'STOP',
        content: { parts: [{ text: step.rawText ?? JSON.stringify(output) }] } }],
      usageMetadata: { promptTokenCount: 250, candidatesTokenCount: 90, thoughtsTokenCount: 10, totalTokenCount: 350 },
    }), { status: 200 });
  });
  let handler!: Handler;
  loadEdge(ENTRY, {
    createClient, Deno: { env: { get: (key: string) => env[key] } }, fetch,
    Request, Response, AbortSignal, Headers,
  }, fn => { handler = fn; });
  const request = async (body: object, origin = 'https://preview.example.invalid',
    authorization = 'Bearer FAKE_BUT_VALID_JWT') => {
    const req = new Request('https://supabase.example.invalid/functions/v1/vnext-catalog-composer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin,
        Authorization: authorization },
      body: JSON.stringify(body),
    });
    const response = await handler(req);
    return { status: response.status, body: await response.json() };
  };
  const generationBodies = () => fetch.mock.calls.filter(([url]) => String(url).endsWith(':generateContent'))
    .map(([, init]) => JSON.parse(String(init?.body)));
  return { request, fetch, rpc, events, env, createClient, getUser, settlements, generationBodies };
}
const scaffoldRequest = () => ({
  version: 1, task: 'compose_scaffold',
  message: 'Faça uma capa editorial e uma tabela comparativa.',
  history: [{ role: 'user', message: 'Vamos criar o catálogo?' }],
  document: { title: 'Novo catálogo', pages: 1, currentPageHeadings: [] },
  credential: { provider: 'gemini', apiKey: FAKE_KEY },
});
const serverKeyRequest = () => {
  const { credential: _credential, ...rest } = scaffoldRequest();
  return rest;
};
const textEditRequest = () => ({
  version: 1, task: 'revise_selected_text',
  message: 'Por favor reescreva o título em tom institucional.',
  history: [{ role: 'assistant', message: 'Vamos revisar o título.' }],
  target: { objectId: 'f12e7325-1f87-4ae8-8baf-3dde17059b37', text: 'Texto selecionado' },
  credential: { provider: 'gemini', apiKey: FAKE_KEY },
});

describe('experimental Gemini composer Edge security, no internet/network/real keys', () => {
  it('is off by default; never contacts provider or reserves budget', async () => {
    for (const x of [sandbox({ flag: false }), sandbox({ budgetMode: 'unbounded' })]) {
      const r = await x.request(scaffoldRequest());
      expect(r.status).toBe(503);
      expect(r.body.code).toBe('COMPOSER_DISABLED');
      expect(x.fetch).not.toHaveBeenCalled();
      expect(x.rpc).not.toHaveBeenCalled();
    }
  });
  it('rejects untrusted Origin and invalid JWT before any consumption', async () => {
    const x = sandbox();
    expect((await x.request(scaffoldRequest(), 'https://evil.example.invalid')).status).toBe(403);
    expect((await x.request(scaffoldRequest(), 'https://preview.example.invalid', '')).status).toBe(401);
    // Authentication cannot be proven by a header alone: getUser must reject the JWT.
    const unauthorized = sandbox({ validUser: false });
    const r = await unauthorized.request(scaffoldRequest());
    expect(r.status).toBe(401);
    expect(unauthorized.rpc).not.toHaveBeenCalled();
    expect(unauthorized.fetch).not.toHaveBeenCalled();
  });
  it('checks active admin/editor profile independently of JWT', async () => {
    for (const opts of [{ active: false }, { role: 'viewer' }]) {
      const x = sandbox(opts);
      const r = await x.request(scaffoldRequest());
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('FORBIDDEN');
      expect(x.rpc).not.toHaveBeenCalled();
    }
  });
  it('rejects a personal key while BYOK is disabled, before the budget reservation', async () => {
    const x = sandbox({ byok: false });
    const r = await x.request(scaffoldRequest());
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('BYOK_DISABLED');
    expect(x.rpc).not.toHaveBeenCalled();
  });
  it('never calls Google when cumulative atomic budget rejects', async () => {
    const x = sandbox({ reserve: false });
    const r = await x.request(scaffoldRequest());
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('AGENT_DAILY_BUDGET_EXCEEDED');
    expect(x.events).toEqual(['quota-reserved']);
    expect(x.fetch).not.toHaveBeenCalled();
  });
  it('reserves worst-case quota BEFORE two external model calls and returns bounded scaffold', async () => {
    const x = sandbox();
    const r = await x.request(scaffoldRequest());
    expect(r.status).toBe(200);
    expect(r.body.reply).toEqual({ ...plan, version: 1 });
    expect(r.body.usage.estimatedUsd).toBeGreaterThan(0);
    expect(r.body.attempts).toBe(1);
    expect(x.events).toEqual(['quota-reserved', 'countTokens', 'generateContent']);
    // 6 000 input + 2 400 output tokens at 0.30/2.50 USD per 1M fits the 00027 per-call cap.
    expect(x.rpc).toHaveBeenCalledWith('vnext_agent_reserve_budget',
      { p_worst_case_microusd: 7800 });
    expect(x.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
    const [generated] = x.generationBodies();
    const prompt = JSON.parse(generated.contents[0].parts[0].text);
    expect(prompt.priorConversation).toEqual(scaffoldRequest().history);
    expect(JSON.stringify(prompt)).not.toContain(FAKE_KEY);
    expect(generated.generationConfig).toMatchObject({ maxOutputTokens: 2400, temperature: 0.2,
      candidateCount: 1, thinkingConfig: { thinkingLevel: 'minimal' } });
    expect(generated.generationConfig.responseSchema.properties.summary).toEqual({ type: 'STRING', maxLength: 240 });
    expect(x.fetch.mock.calls[1][1]?.headers).toMatchObject({ 'x-goog-api-key': FAKE_KEY });
  });
  it('supports selected text only after an explicit opt-in edit request', async () => {
    const x = sandbox();
    const r = await x.request(textEditRequest());
    expect(r.status).toBe(200);
    expect(r.body.reply).toEqual({ status: 'proposal',
      revisedText: 'Apresentação institucional do catálogo' });
    const [body] = x.generationBodies();
    expect(JSON.stringify(body)).toContain('Texto selecionado');
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
    expect(body.generationConfig.responseSchema.properties.revisedText).toEqual({ type: 'STRING', maxLength: 400 });
  });
  it('rejects numbers and extra command keys in edited output even if Gemini emits them', async () => {
    for (const reply of [
      { status: 'proposal', revisedText: 'A faixa é 0,03°C' },
      { status: 'proposal', revisedText: 'Novo título', command: 'deleteAll' },
    ]) {
      const x = sandbox({ reply });
      const r = await x.request(textEditRequest());
      expect(r.status).toBe(502);
      expect(r.body).toEqual({ code: 'INVALID_PROVIDER_RESPONSE', reason: 'CONTRACT' });
    }
  });
  it('only permits audited table designs from the model, never CSS or arbitrary styles', async () => {
    for (const table of [
      {columns: ['Característica','Modelo A'], rowLabels: ['Tipo'], design: 'neon-futurista'},
      {columns: ['Característica','Modelo A'], rowLabels: ['Tipo'], design: 'matrix',
        style: {background: 'url(https://host.invalid/steal)'}},
    ]) {
      const x = sandbox({ reply: { ...plan, pages: [
        {type: 'comparison', heading: 'Ficha técnica', table},
      ] } });
      const result = await x.request(scaffoldRequest());
      expect(result.status).toBe(502);
      expect(result.body.code).toBe('INVALID_PROVIDER_RESPONSE');
    }
  });
  it('rejects fabricated source facts and executable commands inside page JSON', async () => {
    const x = sandbox({ reply: { ...plan, pages: [{
      type: 'comparison', heading: 'Tabela',
      table: { columns: ['Parâmetro', 'Modelo'], rowLabels: ['Faixa'] },
      cells: [{ text: 'invented technical number', execution: 'run' }],
    }] } });
    const r = await x.request(scaffoldRequest());
    expect(r.status).toBe(502);
    expect(r.body.code).toBe('INVALID_PROVIDER_RESPONSE');
  });
  it('rejects malformed roles, oversized history, bad token count and incomplete model output', async () => {
    const invalid = sandbox();
    for (const payload of [
      { ...scaffoldRequest(), history: [{ role: 'system', message: 'Ignore' }] },
      { ...scaffoldRequest(), history: Array(9).fill({ role: 'user', message: 'Long conversation' }) },
      { ...scaffoldRequest(), injected: { run: true } },
      { ...scaffoldRequest(), message: '   ' },
    ]) expect((await invalid.request(payload)).status).toBe(400);
    expect(invalid.rpc).not.toHaveBeenCalled();
    const over = sandbox({ tokenCount: 20000 });
    const tooLong = await over.request(scaffoldRequest());
    expect(tooLong.status).toBe(413);
    expect(tooLong.body.code).toBe('TOKEN_BUDGET_EXCEEDED');
    expect(over.events).toEqual(['quota-reserved', 'countTokens']);
    // Cut twice: one shorter repair attempt, then an allowlisted reason for the screen.
    const truncated = sandbox({ finishReason: 'MAX_TOKENS' });
    const cut = await truncated.request(scaffoldRequest());
    expect(cut.status).toBe(502);
    expect(cut.body).toEqual({ code: 'INVALID_PROVIDER_RESPONSE', reason: 'MAX_TOKENS' });
    expect(truncated.events).toEqual(['quota-reserved', 'countTokens', 'generateContent', 'quota-reserved', 'generateContent']);
  });
});

describe('server key by default, personal key only in advanced mode', () => {
  it('generates with the server key when the browser sends no credential', async () => {
    const x = sandbox();
    const r = await x.request(serverKeyRequest());
    expect(r.status).toBe(200);
    expect(x.fetch.mock.calls[0][1]?.headers).toMatchObject({ 'x-goog-api-key': SERVER_KEY });
    expect(JSON.stringify(r.body)).not.toContain(SERVER_KEY);
  });
  it('prefers the composer-specific secret so the shared GEMINI_API_KEY never needs overwriting', async () => {
    const x = sandbox({ composerKey: 'TEST_FAKE_COMPOSER_ONLY_KEY' });
    expect((await x.request(serverKeyRequest())).status).toBe(200);
    expect(x.fetch.mock.calls[0][1]?.headers).toMatchObject({ 'x-goog-api-key': 'TEST_FAKE_COMPOSER_ONLY_KEY' });
  });
  it('answers PROVIDER_NOT_CONFIGURED without reserving budget when no key exists anywhere', async () => {
    const x = sandbox({ serverKey: null });
    const r = await x.request(serverKeyRequest());
    expect(r).toEqual({ status: 503, body: { code: 'PROVIDER_NOT_CONFIGURED' } });
    expect(x.rpc).not.toHaveBeenCalled();
    expect(x.fetch).not.toHaveBeenCalled();
  });
  it('reports readiness through the status task without calling Google or reserving budget', async () => {
    const x = sandbox();
    const r = await x.request({ version: 1, task: 'status' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ code: 'OK', status: { enabled: true, mode: 'bounded-acceptance', serverKey: true,
      byok: true, tasks: ['compose_scaffold', 'revise_selected_text', 'edit_intent'], remainingMicrousd: null, callReserveMicrousd: 7800 } });
    expect(x.fetch).not.toHaveBeenCalled();
    expect(x.rpc).not.toHaveBeenCalled();
    const missing = sandbox({ serverKey: null, byok: false });
    expect((await missing.request({ version: 1, task: 'status' })).body.status).toMatchObject({ serverKey: false, byok: false });
    expect((await x.request({ version: 1, task: 'status', extra: true })).status).toBe(400);
  });
  it('accepts a one-word answer to a clarification', async () => {
    const x = sandbox();
    const r = await x.request({ ...serverKeyRequest(), message: 'Sim',
      history: [{ role: 'assistant', message: 'Deseja incluir uma tabela comparativa?' }] });
    expect(r.status).toBe(200);
  });
  it('maps Google failures to allowlisted codes and never forwards provider text', async () => {
    const rejected = sandbox({ generations: [{ status: 403, body: { error: { message: 'API key leaked secret-xyz' } } }] });
    expect(await rejected.request(serverKeyRequest())).toEqual({ status: 503, body: { code: 'PROVIDER_REJECTED_KEY' } });
    const limited = sandbox({ countStatus: 429 });
    expect(await limited.request(serverKeyRequest())).toEqual({ status: 429, body: { code: 'PROVIDER_RATE_LIMIT' } });
    const down = sandbox({ generations: [{ status: 500 }] });
    expect(await down.request(serverKeyRequest())).toEqual({ status: 502, body: { code: 'PROVIDER_UNAVAILABLE' } });
  });
});

describe('lenient normalization before strict validation, and one short repair attempt', () => {
  it('drops empty optional keys and keys of the other reply branch', async () => {
    const x = sandbox({ reply: { status: 'proposal', question: '', version: 1,
      summary: '  Estrutura com capa\n e tabela.  ',
      pages: [{ type: 'cover', heading: 'Capa do catálogo', subtitle: '' },
        { type: 'section', heading: 'Comparativo', table: { columns: ['Item', 'Modelo A'], rowLabels: ['Faixa', ''], design: '' } },
        { type: 'comparison', heading: 'Sem tabela' }] } });
    const r = await x.request(serverKeyRequest());
    expect(r.status).toBe(200);
    expect(r.body.reply).toEqual({ version: 1, status: 'proposal', summary: 'Estrutura com capa e tabela.',
      pages: [{ type: 'cover', heading: 'Capa do catálogo' },
        { type: 'comparison', heading: 'Comparativo', table: { columns: ['Item', 'Modelo A'], rowLabels: ['Faixa'] } },
        { type: 'section', heading: 'Sem tabela' }] });
  });
  it('repairs a cut answer with a shorter second attempt covered by its own reservation', async () => {
    const x = sandbox({ generations: [{ finishReason: 'MAX_TOKENS', rawText: '{"status":"proposal","summary":"Estrutura em' }, {}] });
    const r = await x.request(serverKeyRequest());
    expect(r.status).toBe(200);
    expect(r.body.attempts).toBe(2);
    expect(x.rpc.mock.calls.map(call => call[1])).toEqual([{ p_worst_case_microusd: 7800 }, { p_worst_case_microusd: 4800 }]);
    const [, repair] = x.generationBodies();
    expect(repair.generationConfig.maxOutputTokens).toBe(1200);
    expect(JSON.parse(repair.contents[0].parts[0].text).repairNotice).toMatch(/SHORTER/);
  });
  it('repairs invalid JSON once, but never retries a contract violation', async () => {
    const json = sandbox({ generations: [{ rawText: 'not json' }, {}] });
    expect((await json.request(serverKeyRequest())).status).toBe(200);
    const injected = sandbox({ reply: { ...plan, command: 'deleteAll' } });
    expect((await injected.request(serverKeyRequest())).body).toEqual({ code: 'INVALID_PROVIDER_RESPONSE', reason: 'CONTRACT' });
    expect(injected.generationBodies()).toHaveLength(1);
  });
});

describe('settled budget mode (migration 00028) with fallback to 00027', () => {
  it('reserves with an id and settles by real usage', async () => {
    const x = sandbox({ budgetMode: 'settled', settled: 'present' });
    const r = await x.request(serverKeyRequest());
    expect(r.status).toBe(200);
    expect(x.rpc).toHaveBeenCalledWith('vnext_agent_reserve_budget_v2', { p_worst_case_microusd: 12040, p_feature: 'composer' });
    // 250 input * 0.30 + (90 output + 10 thinking) * 2.50 = 325 micro-USD.
    expect(x.settlements).toEqual([{ id: expect.any(String), actual: 325 }]);
    expect(x.generationBodies()[0].generationConfig.maxOutputTokens).toBe(4096);
  });
  it('refunds the reservation when the provider answers with an error', async () => {
    const x = sandbox({ budgetMode: 'settled', settled: 'present', generations: [{ status: 500 }] });
    expect((await x.request(serverKeyRequest())).status).toBe(502);
    expect(x.settlements).toEqual([{ id: expect.any(String), actual: 0 }]);
  });
  it('falls back to the 00027 reservation while 00028 is not applied', async () => {
    const x = sandbox({ budgetMode: 'settled', settled: 'missing' });
    const r = await x.request(serverKeyRequest());
    expect(r.status).toBe(200);
    expect(x.rpc).toHaveBeenCalledWith('vnext_agent_reserve_budget', { p_worst_case_microusd: 7800 });
    expect(x.generationBodies()[0].generationConfig.maxOutputTokens).toBe(2400);
  });
  it('reports the remaining settled budget in the status task', async () => {
    const x = sandbox({ budgetMode: 'settled', settled: 'present' });
    const r = await x.request({ version: 1, task: 'status' });
    expect(r.body.status).toMatchObject({ mode: 'settled', remainingMicrousd: 2_500_000, callReserveMicrousd: 12040 });
  });
});

describe('edit_intent (FR-72): the conversation that edits, same guards and bounded reply', () => {
  const pcon = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/examples/presys-capa-pcon-hibrido.catalog.json'), 'utf8')) as CatalogDocument;
  const built = buildDocumentOutline(pcon);
  const refOf = (suffix: string) => [...built.objects].find(([, value]) => value.objectId === 'capa-pcon-hibrido-' + suffix)![0];
  const titleRef = refOf('titulo'), subtitleRef = refOf('subtitulo');
  const editRequest = (message = 'Troque o título da capa para PCON-Y18.') => ({
    version: 1, task: 'edit_intent', message, history: [], outline: built.outline,
  });
  it('checks origin, login and active editor role before any budget or provider call', async () => {
    for (const [options, status] of [[{ role: 'viewer' }, 403], [{ active: false }, 403], [{ validUser: false }, 401]] as const) {
      const x = sandbox(options);
      const r = await x.request(editRequest());
      expect(r.status).toBe(status);
      expect(x.events).toEqual([]);
    }
    const foreign = sandbox();
    expect((await foreign.request(editRequest(), 'https://evil.example.invalid')).status).toBe(403);
    expect(foreign.events).toEqual([]);
  });
  it('sends the outline with the bounded intent schema and blocks invented numbers on the server', async () => {
    const x = sandbox({ reply: { status: 'proposal', summary: 'Vou trocar o título da capa.', intents: [
      { kind: 'set_text', target: titleRef, text: 'PCON-Y18' },
      { kind: 'set_text', target: subtitleRef, text: 'Exatidão 0,01% FS' },
      { kind: 'delete_page', page: 'p1', target: '' },
    ] } });
    const r = await x.request(editRequest());
    expect(r.status).toBe(200);
    expect(x.events).toEqual(['quota-reserved', 'countTokens', 'generateContent']);
    expect(r.body.reply.intents).toEqual([{ kind: 'set_text', target: titleRef, text: 'PCON-Y18' }]);
    expect(r.body.reply.blocked).toEqual([{ kind: 'set_text', target: subtitleRef, code: 'INVENTED_NUMBER' },
      { kind: 'delete_page', page: 'p1', code: 'LAST_PAGE' }]);
    const [body] = x.generationBodies();
    const schema = body.generationConfig.responseSchema;
    expect(schema.properties.intents.maxItems).toBe(40);
    expect(Object.keys(schema.properties.intents.items.properties)).toEqual(['kind', 'ref', 'text', 'value']);
    expect(schema.properties.intents.items.properties.text).toEqual({ type: 'STRING', maxLength: 400 });
    const prompt = JSON.parse(body.contents[0].parts[0].text);
    expect(prompt.documentOutline.pages[0].detail.length).toBeGreaterThan(30);
    expect(prompt.system).toMatch(/NEVER invent technical values/);
  });
  it('passes clarification and refusal through; rejects unknown intent kinds and extra keys', async () => {
    const question = { status: 'clarification', question: 'Qual faixa: o fundo azul ou as pílulas de faixa?' };
    expect((await sandbox({ reply: question }).request(editRequest('mude a cor da faixa'))).body.reply).toEqual(question);
    const refusal = { status: 'refusal', reason: 'Não posso inventar a exatidão: digite o valor ou use o PDF.' };
    expect((await sandbox({ reply: refusal }).request(editRequest('coloque a exatidão do Y18'))).body.reply).toEqual(refusal);
    for (const reply of [
      { status: 'proposal', summary: 'Vou apagar tudo.', intents: [{ kind: 'run_script', target: 'o1' }] },
      { status: 'proposal', summary: 'Vou trocar o título.', intents: [{ kind: 'set_text', target: titleRef, text: 'X', css: 'red' }] },
      { status: 'proposal', summary: 'Vou trocar o título.', intents: [] },
      { status: 'proposal', summary: 'Oi', intents: [{ kind: 'delete_page', page: 'p1' }] },
    ]) {
      const r = await sandbox({ reply }).request(editRequest());
      expect(r.status).toBe(502);
      expect(r.body).toEqual({ code: 'INVALID_PROVIDER_RESPONSE', reason: 'CONTRACT' });
    }
  });
  it('reads the flat wire intents {kind, ref, text, value}; a translation may come without summary (seen live)', async () => {
    const detail = built.outline.pages[0].detail!;
    const range = detail.find(object => object.hint === 'pilula-a1')!.ref;
    const band = detail.find(object => object.hint === 'fundo-azul')!.ref;
    const colour = await sandbox({ reply: { status: 'proposal', summary: 'Vou mudar a cor do fundo.', intents: [
      { kind: 'set_color', ref: band, value: 'Azul claro' }, { kind: 'delete_page', ref: 'p1' }, { kind: 'resize', ref: titleRef, value: 'larger' }] } })
      .request(editRequest('Mude a cor do fundo azul para azul claro'));
    expect(colour.body.reply.intents).toEqual([{ kind: 'set_color', target: band, color: 'azul_claro' },
      { kind: 'resize', target: titleRef, size: 'larger' }]);
    expect(colour.body.reply.blocked).toEqual([{ kind: 'delete_page', page: 'p1', code: 'LAST_PAGE' }]);
    const r = await sandbox({ reply: { status: 'proposal', language: 'en', intents: [
      { kind: 'translate_text', ref: titleRef, text: 'PCON HYBRID' }, { kind: 'translate_text', ref: range, text: '{{A}} to {{B}} psi' }, {},
      { kind: '', ref: '', text: '' }] } })
      .request(editRequest('Traduza esta página para o inglês'));
    expect(r.status).toBe(200);
    expect(r.body.reply).toEqual({ status: 'proposal', blocked: [], intents: [
      { kind: 'translate_text', target: titleRef, text: 'PCON HYBRID', language: 'en' },
      { kind: 'translate_text', target: range, text: '{{A}} to {{B}} psi', language: 'en' }] });
  });
  it('rejects malformed or oversized outlines before reserving budget', async () => {
    const tampered = structuredClone(built.outline);
    tampered.pages[0].detail![0].text = 'Faixa 0 a 250 psi';
    const bigger = { ...built.outline, title: 'x'.repeat(151) };
    for (const body of [{ ...editRequest(), outline: tampered }, { ...editRequest(), outline: bigger },
      { ...editRequest(), extra: true }, { ...editRequest(), message: 'x'.repeat(1201) }]) {
      const x = sandbox();
      const r = await x.request(body);
      expect(r.status).toBe(400);
      expect(x.events).toEqual([]);
    }
  });
});
