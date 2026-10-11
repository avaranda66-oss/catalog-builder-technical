// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { resolve } from 'node:path';
import ts from 'typescript';

// Provider, authentication, RPC, network and keys are FULLY simulated.
const FAKE_KEY = 'TEST_FAKE_GEMINI_KEY_NOT_A_CREDENTIAL';
const ENTRY = resolve(process.cwd(), 'supabase/functions/vnext-catalog-composer/index.ts');
type Handler = (request: Request) => Promise<Response>;
const plan = { status: 'proposal', summary: 'Estrutura de catálogo com seções editáveis.',
  pages: [{ type: 'comparison', heading: 'Comparativo de famílias',
    table: { columns: ['Característica', 'Modelo A', 'Modelo B'],
      rowLabels: ['Exatidão', 'Faixa de operação'], design: 'matrix' } }] };
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
};
function sandbox(options: Options = {}) {
  const env: Record<string, string> = {
    VNEXT_CATALOG_ALLOWED_ORIGINS: 'https://preview.example.invalid',
    VNEXT_CATALOG_COMPOSER_ENABLED: options.flag === false ? 'false' : 'true',
    VNEXT_CATALOG_AGENT_BUDGET_MODE: 'bounded-acceptance',
    VNEXT_CATALOG_AGENT_BYOK_ENABLED: options.byok === false ? 'false' : 'true',
    SUPABASE_URL: 'https://supabase.example.invalid',
    SUPABASE_ANON_KEY: 'FAKE_ANON_PUBLIC_TEST_KEY',
  };
  const events: string[] = [];
  const rpc = vi.fn(async () => {
    events.push('quota-reserved');
    return { data: options.reserve === false ? false : true, error: null };
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
  const fetch = vi.fn(async (url: string, request?: RequestInit) => {
    if (url.endsWith(':countTokens')) {
      events.push('countTokens');
      return new Response(JSON.stringify({ totalTokens: options.tokenCount ?? 250 }),
        { status: 200 });
    }
    events.push('generateContent');
    const requestBody = JSON.parse(String(request?.body));
    const task = JSON.parse(requestBody.contents[0].parts[0].text);
    const output = options.reply ?? (task.userRequest.includes('reescreva') ?
      { status: 'proposal', revisedText: 'Apresentação institucional do catálogo' } : plan);
    return new Response(JSON.stringify({
      candidates: [{ finishReason: options.finishReason ?? 'STOP',
        content: { parts: [{ text: JSON.stringify(output) }] } }],
      usageMetadata: { promptTokenCount: 250, totalTokenCount: 350 },
    }), { status: 200 });
  });
  let handler!: Handler;
  const code = readFileSync(ENTRY, 'utf8').replace(/^import .*;\r?\n/gm, '');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None },
  }).outputText;
  new Script(transpiled, { filename: 'composer-acceptance-sandbox.js' })
    .runInNewContext({
      serve: (fn: Handler) => { handler = fn; },
      createClient, Deno: { env: { get: (key: string) => env[key] } }, fetch,
      Request, Response, AbortSignal, JSON, Array, Set, Object, Number, String,
    });
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
  return { request, fetch, rpc, events, env, createClient, getUser };
}
const scaffoldRequest = () => ({
  version: 1, task: 'compose_scaffold',
  message: 'Faça uma capa editorial e uma tabela comparativa.',
  history: [{ role: 'user', message: 'Vamos criar o catálogo?' }],
  document: { title: 'Novo catálogo', pages: 1, currentPageHeadings: [] },
  credential: { provider: 'gemini', apiKey: FAKE_KEY },
});
const textEditRequest = () => ({
  version: 1, task: 'revise_selected_text',
  message: 'Por favor reescreva o título em tom institucional.',
  history: [{ role: 'assistant', message: 'Vamos revisar o título.' }],
  target: { objectId: 'f12e7325-1f87-4ae8-8baf-3dde17059b37', text: 'Texto selecionado' },
  credential: { provider: 'gemini', apiKey: FAKE_KEY },
});

describe('experimental Gemini composer Edge security, no internet/network/real keys', () => {
  it('is off by default; never contacts provider or reserves budget', async () => {
    const x = sandbox({ flag: false });
    const r = await x.request(scaffoldRequest());
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('COMPOSER_DISABLED');
    expect(x.fetch).not.toHaveBeenCalled();
    expect(x.rpc).not.toHaveBeenCalled();
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
      expect((await x.request(scaffoldRequest())).status).toBe(403);
      expect(x.rpc).not.toHaveBeenCalled();
    }
  });
  it('rejects missing/disabled BYOK before the budget reservation', async () => {
    const x = sandbox({ byok: false });
    expect((await x.request(scaffoldRequest())).status).toBe(503);
    expect(x.rpc).not.toHaveBeenCalled();
  });
  it('never calls Google when cumulative atomic budget rejects', async () => {
    const x = sandbox({ reserve: false });
    expect((await x.request(scaffoldRequest())).status).toBe(429);
    expect(x.events).toEqual(['quota-reserved']);
    expect(x.fetch).not.toHaveBeenCalled();
  });
  it('reserves worst-case quota BEFORE two external model calls and returns bounded scaffold', async () => {
    const x = sandbox();
    const r = await x.request(scaffoldRequest());
    expect(r.status).toBe(200);
    expect(r.body.reply).toEqual({ ...plan, version: 1 });
    expect(r.body.usage.estimatedUsd).toBeGreaterThan(0);
    expect(x.events).toEqual(['quota-reserved', 'countTokens', 'generateContent']);
    expect(x.rpc).toHaveBeenCalledWith('vnext_agent_reserve_budget',
      { p_worst_case_microusd: 9350 });
    expect(x.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
    const requestBody = JSON.parse(String(x.fetch.mock.calls[1][1]?.body));
    const prompt = JSON.parse(requestBody.contents[0].parts[0].text);
    expect(prompt.priorConversation).toEqual(scaffoldRequest().history);
    expect(JSON.stringify(prompt)).not.toContain(FAKE_KEY);
  });
  it('supports selected text only after an explicit opt-in edit request', async () => {
    const x = sandbox();
    const r = await x.request(textEditRequest());
    expect(r.status).toBe(200);
    expect(r.body.reply).toEqual({ status: 'proposal',
      revisedText: 'Apresentação institucional do catálogo' });
    const body = JSON.parse(String(x.fetch.mock.calls[1][1]?.body));
    expect(JSON.stringify(body)).toContain('Texto selecionado');
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });
  it('rejects numbers and extra command keys in edited output even if Gemini emits them', async () => {
    for (const reply of [
      { status: 'proposal', revisedText: 'A faixa é 0,03°C' },
      { status: 'proposal', revisedText: 'Novo título', command: 'deleteAll' },
    ]) {
      const x = sandbox({ reply });
      const r = await x.request(textEditRequest());
      expect(r.status).toBe(502);
      expect(r.body.code).toBe('INVALID_PROVIDER_RESPONSE');
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
    ]) expect((await invalid.request(payload)).status).toBe(400);
    expect(invalid.rpc).not.toHaveBeenCalled();
    const over = sandbox({ tokenCount: 20000 });
    expect((await over.request(scaffoldRequest())).status).toBe(413);
    expect(over.events).toEqual(['quota-reserved', 'countTokens']);
    const truncated = sandbox({ finishReason: 'MAX_TOKENS' });
    expect((await truncated.request(scaffoldRequest())).status).toBe(502);
  });
});
