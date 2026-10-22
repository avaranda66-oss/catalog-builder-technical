// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

// The Deno entry and its shared contract run as real source inside one VM
// context. Supabase (auth, profile, RPCs, Storage) and Google are simulated.
const ENTRY = resolve(process.cwd(), 'supabase/functions/vnext-catalog-draft/index.ts');
const SERVER_KEY = 'TEST_FAKE_SERVER_KEY_NOT_A_CREDENTIAL';
const DRAFT_KEY = 'TEST_FAKE_DRAFT_KEY_NOT_A_CREDENTIAL';
const ORIGIN = 'https://preview.example.invalid';
const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const BYTES = new TextEncoder().encode('%PDF-1.7\n% fake file for the edge tests\n%%EOF\n');
const SHA = [...new Uint8Array(await crypto.subtle.digest('SHA-256', BYTES))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const SHEET = { title: 'TA', models: ['TA-25N'], sections: [], sharedTables: [], pages: [{ page: 6, content: 'no-specifications' }] };
type Handler = (request: Request) => Promise<Response>;

function loadEdge(globals: Record<string, unknown>, onServe: (handler: Handler) => void) {
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
    runInContext(`(function (exports, require, module) {${code}\n})`, context, { filename: path })(exports, requireModule, { exports });
    return exports;
  };
  load(ENTRY);
}

type Options = {
  flag?: boolean; role?: string; active?: boolean; validUser?: boolean; serverKey?: string | null; draftKey?: string;
  settled?: boolean; cacheReady?: boolean; file?: Uint8Array<ArrayBuffer> | null;
};
function sandbox(options: Options = {}) {
  const env: Record<string, string | undefined> = {
    VNEXT_CATALOG_ALLOWED_ORIGINS: ORIGIN,
    VNEXT_CATALOG_DRAFT_ENABLED: options.flag === false ? 'false' : 'true',
    SUPABASE_URL: 'https://supabase.example.invalid',
    SUPABASE_ANON_KEY: 'FAKE_ANON_PUBLIC_TEST_KEY',
    GEMINI_API_KEY: options.serverKey === null ? undefined : options.serverKey ?? SERVER_KEY,
    VNEXT_DRAFT_GEMINI_API_KEY: options.draftKey,
  };
  const rpcCalls: { name: string; args?: Record<string, unknown> }[] = [];
  const missing = { data: null, error: { code: 'PGRST202', message: 'not found' } };
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    if (name.startsWith('vnext_source_extraction_')) {
      if (options.cacheReady === false) return missing;
      return { data: name.endsWith('get_v1') ? null : true, error: null };
    }
    if (options.settled === false) return missing;
    if (name === 'vnext_agent_reserve_budget_v2') return { data: 'b1a7c0de-0000-4000-8000-000000000001', error: null };
    if (name === 'vnext_agent_settle_budget_v1') return { data: true, error: null };
    if (name === 'vnext_agent_budget_status_v1') {
      return { data: [{ remaining_user_day_microusd: 2_500_000, remaining_org_month_microusd: 59_000_000 }], error: null };
    }
    return missing;
  });
  const download = vi.fn(async (path: string) => {
    void path;
    const file = options.file === undefined ? BYTES : options.file;
    return file ? { data: new Blob([file]), error: null } : { data: null, error: { message: 'Object not found' } };
  });
  const getUser = vi.fn(async () => ({ data: { user: options.validUser === false ? null : { id: USER } }, error: null }));
  const createClient = vi.fn(() => ({
    auth: { getUser },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: { id: USER, role: options.role ?? 'editor', is_active: options.active !== false }, error: null }) }) }) })),
    rpc,
    storage: { from: vi.fn((bucket: string) => ({ download: (path: string) => download(`${bucket}:${path}`) })) },
  }));
  const google: { url: string; key?: string }[] = [];
  const fetch = vi.fn(async (url: string, init: { method: string; headers: Record<string, string> }) => {
    google.push({ url, key: init.headers['x-goog-api-key'] });
    if (url.endsWith('/upload/v1beta/files')) {
      return new Response('{}', { status: 200, headers: { 'x-goog-upload-url': 'https://upload.example.invalid/s/1' } });
    }
    if (url.startsWith('https://upload.example.invalid/')) {
      return Response.json({ file: { name: 'files/f1', uri: 'https://generativelanguage.googleapis.com/v1beta/files/f1', state: 'ACTIVE' } });
    }
    if (init.method === 'DELETE') return new Response('{}');
    if (url.endsWith(':countTokens')) return Response.json({ totalTokens: 9_000 });
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(SHEET) }] } }],
      usageMetadata: { promptTokenCount: 9_000, candidatesTokenCount: 600 }, modelVersion: 'gemini-3.8-flash' });
  });
  const log = vi.fn();
  let handler!: Handler;
  loadEdge({ createClient, Deno: { env: { get: (key: string) => env[key] } }, fetch, Request, Response, Headers, Blob,
    AbortSignal, DOMException, crypto, setTimeout, TextEncoder, console: { log, error: log, warn: log, info: log, debug: log } },
  fn => { handler = fn; });
  const call = async (body: unknown, init: { origin?: string; authorization?: string; method?: string; raw?: string } = {}) => {
    const response = await handler(new Request('https://edge.example.invalid/functions/v1/vnext-catalog-draft', {
      method: init.method ?? 'POST',
      headers: { 'content-type': 'application/json', origin: init.origin ?? ORIGIN,
        ...(init.authorization === '' ? {} : { authorization: init.authorization ?? 'Bearer FAKE_BUT_VALID_JWT' }) },
      ...(init.method === 'GET' || init.method === 'OPTIONS' ? {} : { body: init.raw ?? JSON.stringify(body) }),
    }));
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, json: text ? JSON.parse(text) as Record<string, unknown> : null };
  };
  return { call, rpc, rpcCalls, download, fetch, google, getUser, log };
}
const extract = (source: Record<string, unknown> = {}) => ({
  version: 1, task: 'extract_facts', models: ['TA-25N'],
  source: { path: `${USER}/${SHA}.pdf`, sha256: SHA, mimeType: 'application/pdf', fileName: 'manual.pdf',
    pageCount: 39, firstPage: 5, lastPage: 8, ...source },
});

describe('vnext-catalog-draft guards (same as the composer)', () => {
  it('answers CORS only for the allowed origin and refuses other methods and origins', async () => {
    const box = sandbox();
    const options = await box.call(null, { method: 'OPTIONS' });
    expect(options.status).toBe(204);
    expect(options.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect((await box.call(null, { method: 'GET' })).json).toEqual({ code: 'METHOD_NOT_ALLOWED' });
    expect(await box.call(extract(), { origin: 'https://evil.example.invalid' })).toMatchObject({ status: 403, json: { code: 'INVALID_ORIGIN' } });
    expect(box.getUser).not.toHaveBeenCalled();
  });

  it('stays off until the owner enables it', async () => {
    const box = sandbox({ flag: false });
    expect(await box.call(extract())).toMatchObject({ status: 503, json: { code: 'DRAFT_DISABLED' } });
    expect(box.getUser).not.toHaveBeenCalled();
  });

  it.each([
    ['no token', { authorization: '' }, {}, 401, 'UNAUTHENTICATED'],
    ['an unknown user', {}, { validUser: false }, 401, 'UNAUTHENTICATED'],
    ['a viewer', {}, { role: 'viewer' }, 403, 'FORBIDDEN'],
    ['an inactive editor', {}, { active: false }, 403, 'FORBIDDEN'],
  ] as const)('refuses %s', async (_label, init, options, status, code) => {
    const box = sandbox(options);
    expect(await box.call(extract(), init)).toMatchObject({ status, json: { code } });
    expect(box.fetch).not.toHaveBeenCalled();
    expect(box.rpc).not.toHaveBeenCalled();
  });

  it('refuses oversized, malformed and credential-carrying requests before any budget or provider call', async () => {
    const box = sandbox();
    expect(await box.call(null, { raw: '{"version":1,"task":"status","pad":"' + 'x'.repeat(5_000) + '"}' }))
      .toMatchObject({ status: 413, json: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(await box.call(null, { raw: '{not json' })).toMatchObject({ status: 400, json: { code: 'INVALID_REQUEST' } });
    expect(await box.call({ ...extract(), credential: { provider: 'gemini', apiKey: 'AIza-not-a-real-key-123' } }))
      .toMatchObject({ status: 400, json: { code: 'INVALID_REQUEST' } });
    expect(await box.call(extract({ mimeType: 'text/csv', path: `${USER}/${SHA}.csv` })))
      .toMatchObject({ status: 400, json: { code: 'INVALID_REQUEST' } });
    expect(box.rpc).not.toHaveBeenCalled();
    expect(box.fetch).not.toHaveBeenCalled();
  });
});

describe('vnext-catalog-draft tasks', () => {
  it('status is free and says whether reading files can start', async () => {
    const box = sandbox();
    const result = await box.call({ version: 1, task: 'status' });
    expect(result).toMatchObject({ status: 200, json: { code: 'OK', status: { enabled: true, serverKey: true,
      model: 'gemini-3.8-flash', budget: 'settled', remainingMicrousd: 2_500_000, callReserveMicrousd: 218_880 } } });
    expect(box.fetch).not.toHaveBeenCalled();
    expect(box.rpcCalls.map(item => item.name)).toEqual(['vnext_agent_budget_status_v1']);
    const old = sandbox({ settled: false, serverKey: null });
    expect((await old.call({ version: 1, task: 'status' })).json).toMatchObject({ status: { serverKey: false, budget: 'missing' } });
  });

  it('extracts with the server key, the 00028 budget and the 00029 cache, and returns only the bounded answer', async () => {
    const box = sandbox({ draftKey: DRAFT_KEY });
    const result = await box.call(extract());
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ code: 'OK', extraction: { cached: false, model: 'gemini-3.8-flash', sheet: SHEET } });
    expect(box.download).toHaveBeenCalledWith(`vnext-source-files:${USER}/${SHA}.pdf`);
    expect(box.rpcCalls.map(item => item.name)).toEqual(['vnext_source_extraction_get_v1', 'vnext_agent_reserve_budget_v2',
      'vnext_agent_settle_budget_v1', 'vnext_source_extraction_put_v1']);
    const cacheKey = { p_sha256: SHA, p_first_page: 5, p_last_page: 8, p_llm_model: 'gemini-3.8-flash',
      p_prompt_version: 'fr66-2026-10-17.3', p_models_key: 'TA-25N' };
    expect(box.rpcCalls[0].args).toEqual(cacheKey);
    expect(box.rpcCalls[1].args).toEqual({ p_worst_case_microusd: 218_880, p_feature: 'extraction' });
    expect(box.rpcCalls[3].args).toEqual({ ...cacheKey, p_answer: SHEET, p_trimmed: 0, p_model_version: 'gemini-3.8-flash',
      p_input_tokens: 9_000, p_output_tokens: 600 });
    // The draft-specific secret wins over the shared one, and no secret leaves the server.
    expect(box.google.filter(item => !item.url.startsWith('https://upload.example.invalid/')).every(item => item.key === DRAFT_KEY)).toBe(true);
    expect(result.text).not.toMatch(/TEST_FAKE/);
    expect(box.log).not.toHaveBeenCalled();
  });

  it('fails closed without 00028, and works without 00029 (every call is a cache miss)', async () => {
    const noBudget = sandbox({ settled: false });
    expect(await noBudget.call(extract())).toMatchObject({ status: 503, json: { code: 'BUDGET_NOT_READY' } });
    expect(noBudget.fetch).not.toHaveBeenCalled();
    const noCache = sandbox({ cacheReady: false });
    expect((await noCache.call(extract())).status).toBe(200);
  });

  it('needs a server key and the stored file', async () => {
    expect(await sandbox({ serverKey: null }).call(extract())).toMatchObject({ status: 503, json: { code: 'PROVIDER_NOT_CONFIGURED' } });
    const missing = sandbox({ file: null });
    expect(await missing.call(extract())).toMatchObject({ status: 404, json: { code: 'SOURCE_NOT_FOUND' } });
    expect(missing.fetch).not.toHaveBeenCalled();
  });
});
