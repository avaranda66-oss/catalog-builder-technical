// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { VNEXT_TRANSLATION_PROFILES, type RegisteredTranslationProfile } from '@/vnext/translation/language-registry';
import type { TranslationProviderRequest } from '@/vnext/translation/contracts';

interface ProviderPayload { units: Array<{ unitId: string; runs: Array<{ runId: string; translatedText: string }> }> }
interface Prompt { sourceLocale: string; targetLocale: string; profileVersion: string; promptVersion: string; tokenPolicyVersion: string;
  rules: string[]; units: TranslationProviderRequest['units'] }
interface GenerationRequest { contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  generationConfig: { responseMimeType: string; temperature: number; candidateCount: number; maxOutputTokens: number;
    thinkingConfig?: { thinkingBudget: number } } }

/** Executes the actual Deno handler and actual local registry. All external modules, env and fetch are fixtures. */
function gateway() {
  const gatewayPath = resolve(process.cwd(), 'supabase/functions/vnext-translation-provider/index.ts');
  const registryPath = resolve(dirname(gatewayPath), '../../../src/vnext/translation/language-registry.ts');
  const transpile = (path: string) => ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const registryExports: Record<string, unknown> = {};
  runInContext(transpile(registryPath), createContext({ exports: registryExports }), { filename: registryPath });
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const state = { authenticated: true, active: true, role: 'editor', profileError: false, providerStatus: 200,
    providerThrows: false, malformedEnvelope: false, missingEnvironment: '',
    budgetMode: undefined as string | undefined, countStatus: 200, countThrows: false, malformedCount: false,
    countPayload: { totalTokens: 100 } as unknown, finishReason: 'STOP' as string | undefined, extraCandidates: false,
    transform: (payload: ProviderPayload): unknown => payload };
  const envReads: string[] = [];
  const profileQueries: string[] = [];
  const countProvider = vi.fn(async (_options: RequestInit) => {
    if (state.countThrows) throw new Error('fixture count transport failure');
    if (state.countStatus !== 200) return new Response('fixture count failure', { status: state.countStatus });
    return new Response(state.malformedCount ? '{' : JSON.stringify(state.countPayload), { status: 200 });
  });
  const generateProvider = vi.fn(async (options: RequestInit) => {
    if (state.providerThrows) throw new Error('fixture upstream transport failure');
    if (state.providerStatus !== 200) return new Response('fixture failure', { status: state.providerStatus });
    const envelope = JSON.parse(options.body as string) as GenerationRequest;
    const prompt = JSON.parse(envelope.contents[0].parts[0].text) as Prompt;
    const payload: ProviderPayload = { units: prompt.units.map(unit => ({ unitId: unit.unitId,
      runs: unit.runs.map(run => ({ runId: run.runId, translatedText: `Translated ${run.protectedText}` })) })) };
    const candidate = { finishReason: state.finishReason, content: { parts: [{ text: JSON.stringify(state.transform(payload)) }] } };
    return new Response(JSON.stringify(state.malformedEnvelope ? {} : {
      candidates: state.extraCandidates ? [candidate, candidate] : [candidate],
    }), { status: 200 });
  });
  const fakeProvider = vi.fn(async (url: string, options: RequestInit) => {
    expect(options.method).toBe('POST');
    expect((options.headers as Record<string, string>)['x-goog-api-key']).toBe('fixture-server-key');
    if (url === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:countTokens') {
      return countProvider(options);
    }
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    return generateProvider(options);
  });
  const createClient = vi.fn((_url: string, _key: string, options: { global: { headers: { Authorization: string } } }) => {
    expect(options.global.headers.Authorization).toBe('Bearer fixture-session');
    return {
      auth: { getUser: async () => ({ data: { user: state.authenticated ? { id: 'fixture-user' } : null }, error: null }) },
      from: (table: string) => { profileQueries.push(table); return {
        select: (fields: string) => { profileQueries.push(fields); return {
          eq: (field: string, value: string) => { profileQueries.push(`${field}:${value}`); return {
            maybeSingle: async () => ({ data: { id: 'fixture-user', role: state.role, is_active: state.active }, error: state.profileError ? 'fixture-profile-error' : null }),
          }; },
        }; },
      }; },
    };
  });
  const context = createContext({ exports: {}, Request, Response, Headers,
    require: (moduleId: string) => {
      if (moduleId === 'https://deno.land/std@0.177.0/http/server.ts') return { serve: (callback: typeof handler) => { handler = callback; } };
      if (moduleId === 'https://esm.sh/@supabase/supabase-js@2.112.4') return { createClient };
      if (resolve(dirname(gatewayPath), moduleId) === registryPath) return registryExports;
      throw new Error(`Unexpected gateway dependency: ${moduleId}`);
    },
    Deno: { env: { get: (key: string) => {
      envReads.push(key);
      if (state.missingEnvironment === key) return undefined;
      if (key === 'VNEXT_TRANSLATION_BUDGET_MODE') return state.budgetMode;
      return ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-anon', GEMINI_API_KEY: 'fixture-server-key' } as Record<string, string>)[key];
    } } },
    fetch: fakeProvider,
  });
  runInContext(transpile(gatewayPath), context, { filename: gatewayPath });
  if (!handler) throw new Error('Gateway did not register its handler');
  const invoke = async (body: unknown, options: { auth?: boolean; method?: string; rawBody?: string } = {}) => handler!(new Request('https://fixture.invalid/functions/v1/vnext-translation-provider', {
    method: options.method ?? 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json',
      ...(options.auth === false ? {} : { Authorization: 'Bearer fixture-session' }) },
    ...(['GET', 'OPTIONS'].includes(options.method ?? '') ? {} : { body: options.rawBody ?? JSON.stringify(body) }),
  }));
  return { invoke, state, envReads, fakeProvider, countProvider, generateProvider, profileQueries, createClient };
}

function request(profile: RegisteredTranslationProfile): TranslationProviderRequest {
  return { contractVersion: profile.contractVersion, profileVersion: profile.profileVersion, requestId: 'fixture-request', sourceCatalogId: 'fixture-catalog',
    sourceLocale: profile.sourceLocale, targetLocale: profile.targetLocale,
    units: [0, 1].map(index => ({ unitId: `unit-${index}`, sourceHash: 'a'.repeat(64), kind: 'textObject', context: 'Page text',
      runs: [{ runId: 'run', protectedText: `Texto [[VNEXT_TECH_${index}_001]]` }] })),
  };
}

describe.each(VNEXT_TRANSLATION_PROFILES)('P2 executed server gateway $targetLocale', profile => {
  it('accepts intact technical placeholders beyond the 999th value and still rejects changed or duplicated values', async () => {
    for (const variant of ['intact', 'changed', 'duplicate'] as const) {
      const g = gateway();
      const original = request(profile);
      const body = { ...original, units: [{ ...original.units[0], runs: [{ runId: 'long-run-part',
        protectedText: 'Condição [[VNEXT_TECH_0123456789ABCDEF_1000]] e [[VNEXT_TECH_0123456789ABCDEF_1020]]' }] }] };
      if (variant !== 'intact') g.state.transform = payload => {
        const run = payload.units[0].runs[0];
        run.translatedText = variant === 'changed'
          ? run.translatedText.replace('_1000]]', '_1001]]')
          : run.translatedText + ' [[VNEXT_TECH_0123456789ABCDEF_1000]]';
        return payload;
      };
      const response = await g.invoke(body);
      expect(response.status).toBe(variant === 'intact' ? 200 : 502);
      expect(g.generateProvider).toHaveBeenCalledTimes(1);
      expect(g.countProvider).not.toHaveBeenCalled();
    }
  });

  it('uses the actual shared target/profile/prompt, server key and authenticated role checks', async () => {
    const g = gateway(); const body = request(profile); const response = await g.invoke(body); const output = await response.json();
    expect(response.status).toBe(200);
    expect(output).toMatchObject({ contractVersion: profile.contractVersion, profileVersion: profile.profileVersion,
      requestId: body.requestId, targetLocale: profile.targetLocale, provider: { providerId: profile.providerId, modelId: profile.modelId } });
    expect(g.fakeProvider).toHaveBeenCalledTimes(1);
    expect(g.profileQueries).toEqual(['profiles', 'id, role, is_active', 'id:fixture-user']);
    const input = JSON.parse(g.fakeProvider.mock.calls[0][1].body as string) as { contents: Array<{ parts: Array<{ text: string }> }> };
    const prompt = JSON.parse(input.contents[0].parts[0].text) as Prompt;
    expect(prompt).toMatchObject({ sourceLocale: 'pt-BR', targetLocale: profile.targetLocale, profileVersion: profile.profileVersion,
      promptVersion: profile.promptVersion, tokenPolicyVersion: profile.tokenPolicyVersion });
    expect(prompt.rules.join(' ')).toContain('Never improve, correct, complete, infer or invent');
    expect(prompt.rules.join(' ')).toContain(profile.targetLocale === 'es-ES' ? 'Spanish (Spain)' : 'English (United States)');
    expect(JSON.stringify(output)).not.toContain('fixture-server-key'); expect(JSON.stringify(prompt)).not.toContain('fixture-server-key');
  });

  it.each(['missing-auth', 'invalid-auth', 'inactive', 'viewer', 'profile-error', 'missing-infrastructure', 'missing-secret'])('rejects %s without upstream dispatch', async scenario => {
    const g = gateway();
    if (scenario === 'invalid-auth') g.state.authenticated = false;
    if (scenario === 'inactive') g.state.active = false;
    if (scenario === 'viewer') g.state.role = 'viewer';
    if (scenario === 'profile-error') g.state.profileError = true;
    if (scenario === 'missing-infrastructure') g.state.missingEnvironment = 'SUPABASE_URL';
    if (scenario === 'missing-secret') g.state.missingEnvironment = 'GEMINI_API_KEY';
    const response = await g.invoke(request(profile), { auth: scenario !== 'missing-auth' });
    expect(response.status).toBe(scenario === 'missing-secret' || scenario === 'missing-infrastructure' ? 503
      : scenario === 'missing-auth' || scenario === 'invalid-auth' ? 401 : 403);
    expect(g.fakeProvider).not.toHaveBeenCalled();
    if (scenario !== 'missing-secret') expect(g.envReads).not.toContain('GEMINI_API_KEY');
  });

  it.each(['future-target', 'copy-source', 'cross-profile', 'unknown-profile', 'contract', 'browser-key', 'extra-field', 'duplicate-unit', 'duplicate-run', 'wrong-hash', 'wrong-kind', 'empty-units', 'empty-runs', 'max-units', 'max-run', 'max-total'])('rejects %s independently of the client', async scenario => {
    const g = gateway(); const body = structuredClone(request(profile)) as unknown as Record<string, unknown>;
    const units = body.units as Array<{ unitId: string; sourceHash: string; kind: string; context: string; runs: Array<{ runId: string; protectedText: string }> }>;
    if (scenario === 'future-target') body.targetLocale = 'en-GB';
    if (scenario === 'copy-source') body.sourceLocale = 'es-ES';
    if (scenario === 'cross-profile') body.profileVersion = VNEXT_TRANSLATION_PROFILES.find(item => item.targetLocale !== profile.targetLocale)!.profileVersion;
    if (scenario === 'unknown-profile') body.profileVersion = 'w5-ptbr-eses-v0';
    if (scenario === 'contract') body.contractVersion = 'unknown';
    if (scenario === 'browser-key') body.apiKey = 'fixture-client-key';
    if (scenario === 'extra-field') body.documentSnapshot = {};
    if (scenario === 'duplicate-unit') units.push(units[0]);
    if (scenario === 'duplicate-run') units[0].runs.push(units[0].runs[0]);
    if (scenario === 'wrong-hash') units[0].sourceHash = 'not-a-source-hash';
    if (scenario === 'wrong-kind') units[0].kind = 'image';
    if (scenario === 'empty-units') body.units = [];
    if (scenario === 'empty-runs') units[0].runs = [];
    if (scenario === 'max-units') body.units = Array.from({ length: 61 }, (_, index) => ({ ...units[0], unitId: `u-${index}` }));
    if (scenario === 'max-run') units[0].runs[0].protectedText = 'x'.repeat(4001);
    if (scenario === 'max-total') body.units = Array.from({ length: 8 }, (_, index) => ({ ...units[0], unitId: `u-${index}`, runs: [{ runId: 'r', protectedText: 'x'.repeat(4000) }] }));
    const response = await g.invoke(body);
    expect(response.status).toBe(scenario === 'max-units' ? 413 : 400);
    expect(g.fakeProvider).not.toHaveBeenCalled(); expect(g.envReads).not.toContain('GEMINI_API_KEY');
  });

  it.each(['missing-unit', 'extra-unit', 'duplicate-unit', 'unknown-unit', 'missing-run', 'duplicate-run', 'unknown-run', 'empty', 'markup', 'control', 'long', 'missing-token', 'duplicate-token', 'cross-run-token', 'foreign-token', 'partial-token', 'extra-field'])('rejects provider %s output after exactly one controlled dispatch', async scenario => {
    const g = gateway(); g.state.transform = payload => {
      const run = payload.units[0].runs[0];
      if (scenario === 'missing-unit') payload.units.pop();
      if (scenario === 'extra-unit') payload.units.push({ unitId: 'extra', runs: [] });
      if (scenario === 'duplicate-unit') payload.units[1] = payload.units[0];
      if (scenario === 'unknown-unit') payload.units[0].unitId = 'unknown';
      if (scenario === 'missing-run') payload.units[0].runs = [];
      if (scenario === 'duplicate-run') payload.units[0].runs.push(run);
      if (scenario === 'unknown-run') run.runId = 'unknown';
      if (scenario === 'empty') run.translatedText = '  ';
      if (scenario === 'markup') run.translatedText += '<b>text</b>';
      if (scenario === 'control') run.translatedText += String.fromCharCode(0);
      if (scenario === 'long') run.translatedText += 'x'.repeat(4001);
      if (scenario === 'missing-token') run.translatedText = 'Missing';
      if (scenario === 'duplicate-token') run.translatedText += '[[VNEXT_TECH_0_001]]';
      if (scenario === 'cross-run-token') run.translatedText = payload.units[1].runs[0].translatedText;
      if (scenario === 'foreign-token') run.translatedText += '[[VNEXT_TECH_FOREIGN_999]]';
      if (scenario === 'partial-token') run.translatedText += '[[VNEXT_TECH_BROKEN';
      return scenario === 'extra-field' ? { ...payload, providerSecret: 'fixture-untrusted-value' } : payload;
    };
    const response = await g.invoke(request(profile)); const output = await response.json();
    expect(response.status).toBe(502); expect(output.error).toBe('INVALID_PROVIDER_RESPONSE');
    expect(g.fakeProvider).toHaveBeenCalledTimes(1); expect(JSON.stringify(output)).not.toContain('fixture-untrusted-value');
  });

  it.each([429, 401, 403, 400, 500])('sanitizes upstream HTTP %s without automatic server retry', async status => {
    const g = gateway(); g.state.providerStatus = status; const response = await g.invoke(request(profile)); const output = await response.json();
    expect(output.error).toBe(status === 429 ? 'PROVIDER_RATE_LIMIT' : [400, 401, 403].includes(status) ? 'CREDENTIAL_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE');
    expect(g.fakeProvider).toHaveBeenCalledTimes(1); expect(JSON.stringify(output)).not.toContain('fixture-server-key');
  });
  it('sanitizes network failure and malformed Gemini envelope', async () => {
    const g = gateway(); g.state.providerThrows = true;
    expect((await (await g.invoke(request(profile))).json()).error).toBe('PROVIDER_UNAVAILABLE');
    g.state.providerThrows = false; g.state.malformedEnvelope = true;
    expect((await (await g.invoke(request(profile))).json()).error).toBe('INVALID_PROVIDER_RESPONSE');
    expect(g.fakeProvider).toHaveBeenCalledTimes(2);
  });
});

describe('P2 server-first compatibility with the canonical Spanish client', () => {
  const canonicalRequest = () => ({ ...request(VNEXT_TRANSLATION_PROFILES[0]), profileVersion: 'w5-ptbr-eses-v1' });

  it('accepts the exact old identity and preserves its original prompt and response contract', async () => {
    const g = gateway(); const body = canonicalRequest(); const response = await g.invoke(body);
    const output = await response.json();
    expect(response.status).toBe(200);
    expect(Object.keys(output).sort()).toEqual(['contractVersion', 'profileVersion', 'requestId', 'targetLocale', 'units', 'provider'].sort());
    expect(output).toMatchObject({ contractVersion: 'w5a-v1', profileVersion: 'w5-ptbr-eses-v1', requestId: body.requestId,
      targetLocale: 'es-ES', provider: { providerId: 'gemini', modelId: 'gemini-2.5-flash' } });
    expect(output.units.map((unit: { unitId: string }) => unit.unitId)).toEqual(body.units.map(unit => unit.unitId));
    const input = JSON.parse(g.fakeProvider.mock.calls[0][1].body as string) as { contents: Array<{ parts: Array<{ text: string }> }> };
    const prompt = JSON.parse(input.contents[0].parts[0].text) as Prompt;
    expect((input as GenerationRequest).generationConfig).toEqual({ responseMimeType: 'application/json', temperature: 0.1,
      candidateCount: 1, maxOutputTokens: 65_536 });
    expect(Object.keys(prompt).sort()).toEqual(['contractVersion', 'profileVersion', 'sourceLocale', 'targetLocale', 'rules', 'units', 'responseShape'].sort());
    expect(prompt.rules).toEqual([
      'Translate only protectedText values from Portuguese (Brazil) to Spanish (Spain).',
      'Preserve every [[VNEXT_TECH...]] placeholder exactly once and byte-for-byte.',
      'Return the same unitId and runId identities. Do not add or remove units or runs.',
      'Return plain text only; do not emit HTML or Markdown formatting.',
    ]);
    expect(g.fakeProvider).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(output)).not.toContain('fixture-server-key');
  });

  it.each(['en-US', 'es-MX', 'fr-FR'])('does not reuse the old Spanish identity for %s', async targetLocale => {
    const g = gateway(); const response = await g.invoke({ ...canonicalRequest(), targetLocale });
    expect(response.status).toBe(400); expect(g.fakeProvider).not.toHaveBeenCalled();
    expect(g.envReads).not.toContain('GEMINI_API_KEY');
  });

  it.each(['es-ES', 'en-US'])('does not accept translated-copy source %s with the old identity', async sourceLocale => {
    const g = gateway(); expect((await g.invoke({ ...canonicalRequest(), sourceLocale })).status).toBe(400);
    expect(g.fakeProvider).not.toHaveBeenCalled();
  });

  it.each(['missing-auth', 'inactive', 'missing-secret'])('keeps %s fail-closed for the old client', async scenario => {
    const g = gateway();
    if (scenario === 'inactive') g.state.active = false;
    if (scenario === 'missing-secret') g.state.missingEnvironment = 'GEMINI_API_KEY';
    const response = await g.invoke(canonicalRequest(), { auth: scenario !== 'missing-auth' });
    expect(response.status).toBe(scenario === 'missing-auth' ? 401 : scenario === 'inactive' ? 403 : 503);
    expect(g.fakeProvider).not.toHaveBeenCalled();
  });

  it('keeps technical placeholder validation and avoids automatic upstream retry', async () => {
    const g = gateway(); g.state.transform = payload => { payload.units[0].runs[0].translatedText = 'Missing token'; return payload; };
    const response = await g.invoke(canonicalRequest());
    expect(response.status).toBe(502); expect((await response.json()).error).toBe('INVALID_PROVIDER_RESPONSE');
    expect(g.fakeProvider).toHaveBeenCalledTimes(1);
  });
});

const budgetProfiles = [
  ...VNEXT_TRANSLATION_PROFILES.map(profile => ({ label: profile.profileVersion, profile, profileVersion: profile.profileVersion })),
  { label: 'canonical-Spanish-v1', profile: VNEXT_TRANSLATION_PROFILES[0], profileVersion: 'w5-ptbr-eses-v1' },
];

describe.each(budgetProfiles)('P2 server-owned token budget $label', item => {
  const body = () => ({ ...request(item.profile), profileVersion: item.profileVersion });

  it.each([undefined, 'production'])('preserves production capacity with mode %s and no counting call or thinking override', async mode => {
    const g = gateway(); g.state.budgetMode = mode;
    const input = body();
    input.units = Array.from({ length: 10 }, (_, index) => ({ unitId: `unit-${index}`, sourceHash: 'a'.repeat(64),
      kind: 'textObject' as const, context: `Technical paragraph ${index}`, runs: [{ runId: 'r', protectedText: 'x'.repeat(3000) }] }));
    // Complete controlled output at the historical 30,000-character input boundary.
    g.state.transform = payload => { payload.units.forEach(unit => unit.runs.forEach(run => { run.translatedText = run.translatedText.replace(/^Translated /, ''); })); return payload; };
    const response = await g.invoke(input); const output = await response.json();
    expect(response.status).toBe(200); expect(output.profileVersion).toBe(item.profileVersion);
    expect(output.units).toHaveLength(10);
    expect(g.countProvider).not.toHaveBeenCalled(); expect(g.generateProvider).toHaveBeenCalledTimes(1);
    const generated = JSON.parse(g.generateProvider.mock.calls[0][0].body as string) as GenerationRequest;
    expect(generated.generationConfig).toEqual({ responseMimeType: 'application/json', temperature: 0.1, candidateCount: 1, maxOutputTokens: 65_536 });
    expect(generated.generationConfig).not.toHaveProperty('thinkingConfig');
  });

  it.each([0, 4000])('counts the entire exact request, then generates once for %s input tokens with output/thinking caps', async totalTokens => {
    const g = gateway(); g.state.budgetMode = 'bounded-acceptance'; g.state.countPayload = { totalTokens };
    const original = body(); const input = { ...original, units: original.units.map((unit, index) => index === 0
      ? { ...unit, context: 'Context also occupies input tokens [[VNEXT_TECH_0_001]]' } : unit) };
    const response = await g.invoke(input); const output = await response.json();
    expect(response.status).toBe(200); expect(output.profileVersion).toBe(item.profileVersion);
    expect(g.countProvider).toHaveBeenCalledTimes(1); expect(g.generateProvider).toHaveBeenCalledTimes(1);
    expect(g.fakeProvider.mock.calls.map(([url]) => url.split(':').at(-1))).toEqual(['countTokens', 'generateContent']);
    const counted = JSON.parse(g.countProvider.mock.calls[0][0].body as string) as { generateContentRequest: GenerationRequest & { model: string } };
    const generated = JSON.parse(g.generateProvider.mock.calls[0][0].body as string) as GenerationRequest;
    expect(Object.keys(counted)).toEqual(['generateContentRequest']);
    expect(counted.generateContentRequest).toEqual({ model: 'models/gemini-2.5-flash', ...generated });
    expect(counted.generateContentRequest.contents).toEqual(generated.contents);
    const prompt = JSON.parse(generated.contents[0].parts[0].text) as Prompt;
    expect(prompt.units[0].context).toBe(input.units[0].context);
    expect(prompt.units[0].unitId).toBe(input.units[0].unitId);
    expect(prompt.units[0].runs).toEqual(input.units[0].runs);
    expect(prompt.rules).toContain('Preserve every [[VNEXT_TECH...]] placeholder exactly once and byte-for-byte.');
    expect(generated.generationConfig).toEqual({ responseMimeType: 'application/json', temperature: 0.1,
      candidateCount: 1, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } });
    expect(JSON.stringify(output)).not.toContain('fixture-server-key');
  });

  it('blocks 4001 input tokens before any generation', async () => {
    const g = gateway(); g.state.budgetMode = 'bounded-acceptance'; g.state.countPayload = { totalTokens: 4001 };
    const response = await g.invoke(body()); const output = await response.json();
    expect(response.status).toBe(413); expect(output.error).toBe('PAYLOAD_TOO_LARGE');
    expect(g.countProvider).toHaveBeenCalledTimes(1); expect(g.generateProvider).not.toHaveBeenCalled();
    expect(g.fakeProvider).toHaveBeenCalledTimes(1);
  });

  it.each([{}, null, [], { totalTokens: -1 }, { totalTokens: 0.5 }, { totalTokens: '100' }, { totalTokens: Number.MAX_SAFE_INTEGER + 1 }, { totalTokens: null }])('fails closed on invalid token counting %j', async counted => {
    const g = gateway(); g.state.budgetMode = 'bounded-acceptance'; g.state.countPayload = counted;
    const response = await g.invoke(body()); const output = await response.json();
    expect(response.status).toBe(502); expect(output.error).toBe('INVALID_PROVIDER_RESPONSE');
    expect(g.countProvider).toHaveBeenCalledTimes(1); expect(g.generateProvider).not.toHaveBeenCalled();
    expect(g.fakeProvider).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(output)).not.toContain('fixture-server-key');
  });

  it.each([429, 400, 401, 403, 500])('fails closed after one countTokens HTTP %s, without generation or retry', async status => {
    const g = gateway(); g.state.budgetMode = 'bounded-acceptance'; g.state.countStatus = status;
    const response = await g.invoke(body()); const output = await response.json();
    expect(output.error).toBe(status === 429 ? 'PROVIDER_RATE_LIMIT' : [400, 401, 403].includes(status) ? 'CREDENTIAL_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE');
    expect(g.countProvider).toHaveBeenCalledTimes(1); expect(g.generateProvider).not.toHaveBeenCalled();
    expect(g.fakeProvider).toHaveBeenCalledTimes(1);
  });

  it.each(['transport', 'malformed-json'])('does not generate after countTokens %s failure', async scenario => {
    const g = gateway(); g.state.budgetMode = 'bounded-acceptance';
    g.state.countThrows = scenario === 'transport'; g.state.malformedCount = scenario === 'malformed-json';
    const response = await g.invoke(body()); const output = await response.json();
    expect(output.error).toBe(scenario === 'transport' ? 'PROVIDER_UNAVAILABLE' : 'INVALID_PROVIDER_RESPONSE');
    expect(g.countProvider).toHaveBeenCalledTimes(1); expect(g.generateProvider).not.toHaveBeenCalled();
    expect(g.fakeProvider).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'bounded', 'PRODUCTION', ' bounded-acceptance', '4000'])('rejects unrecognized server mode %s before provider credential access or upstream dispatch', async mode => {
    const g = gateway(); g.state.budgetMode = mode;
    const response = await g.invoke(body()); const output = await response.json();
    expect(response.status).toBe(503); expect(output.error).toBe('PROVIDER_UNAVAILABLE');
    expect(g.envReads).not.toContain('GEMINI_API_KEY'); expect(g.fakeProvider).not.toHaveBeenCalled();
    expect(JSON.stringify(output)).not.toContain(mode === '' ? 'fixture-untrusted-value' : mode);
  });

  it.each(['budgetMode', 'maxInputTokens', 'maxOutputTokens', 'thinkingBudget', 'candidateCount', 'modelId', 'generationConfig'])('rejects browser %s overrides in bounded mode before counting or generation', async field => {
    const g = gateway(); g.state.budgetMode = 'bounded-acceptance';
    const response = await g.invoke({ ...body(), [field]: field === 'budgetMode' ? 'production' : 100_000 });
    expect(response.status).toBe(400); expect((await response.json()).error).toBe('INVALID_REQUEST');
    expect(g.fakeProvider).not.toHaveBeenCalled(); expect(g.envReads).not.toContain('GEMINI_API_KEY');
  });

  it.each(['missing-auth', 'invalid-auth', 'inactive', 'viewer', 'profile-error', 'missing-infrastructure', 'missing-secret'])('keeps bounded %s authorization/configuration failures before both upstream operations', async scenario => {
    const g = gateway(); g.state.budgetMode = 'bounded-acceptance';
    if (scenario === 'invalid-auth') g.state.authenticated = false;
    if (scenario === 'inactive') g.state.active = false;
    if (scenario === 'viewer') g.state.role = 'viewer';
    if (scenario === 'profile-error') g.state.profileError = true;
    if (scenario === 'missing-infrastructure') g.state.missingEnvironment = 'SUPABASE_URL';
    if (scenario === 'missing-secret') g.state.missingEnvironment = 'GEMINI_API_KEY';
    const response = await g.invoke(body(), { auth: scenario !== 'missing-auth' });
    expect(response.status).toBe(scenario === 'missing-secret' || scenario === 'missing-infrastructure' ? 503
      : scenario === 'missing-auth' || scenario === 'invalid-auth' ? 401 : 403);
    expect(g.fakeProvider).not.toHaveBeenCalled();
  });

  it.each([429, 503, 'transport'])('counts once and generates once after upstream generation %s failure', async failure => {
    const g = gateway(); g.state.budgetMode = 'bounded-acceptance';
    g.state.providerThrows = failure === 'transport';
    if (typeof failure === 'number') g.state.providerStatus = failure;
    const response = await g.invoke(body()); const output = await response.json();
    expect(output.error).toBe(failure === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_UNAVAILABLE');
    expect(g.countProvider).toHaveBeenCalledTimes(1); expect(g.generateProvider).toHaveBeenCalledTimes(1);
    expect(g.fakeProvider).toHaveBeenCalledTimes(2);
  });

  describe.each([undefined, 'bounded-acceptance'])('completed-response validation in mode %s', mode => {
    it.each(['MAX_TOKENS', 'SAFETY', 'OTHER', 'FINISH_REASON_UNSPECIFIED', undefined, ''])('rejects finishReason %s even with structurally valid JSON and all protected tokens', async finishReason => {
      const g = gateway(); g.state.budgetMode = mode; g.state.finishReason = finishReason;
      const response = await g.invoke(body()); const output = await response.json();
      expect(response.status).toBe(502); expect(output.error).toBe('INVALID_PROVIDER_RESPONSE');
      expect(g.generateProvider).toHaveBeenCalledTimes(1);
      expect(g.countProvider).toHaveBeenCalledTimes(mode === 'bounded-acceptance' ? 1 : 0);
      expect(output).not.toHaveProperty('units');
    });
    it('rejects multiple candidates rather than choosing an unreviewed extra result', async () => {
      const g = gateway(); g.state.budgetMode = mode; g.state.extraCandidates = true;
      const response = await g.invoke(body());
      expect(response.status).toBe(502); expect((await response.json()).error).toBe('INVALID_PROVIDER_RESPONSE');
      expect(g.generateProvider).toHaveBeenCalledTimes(1);
    });
    it('still rejects changed protected technical values in a completed response', async () => {
      const g = gateway(); g.state.budgetMode = mode;
      g.state.transform = payload => { payload.units[0].runs[0].translatedText = 'Changed technical value'; return payload; };
      const response = await g.invoke(body());
      expect(response.status).toBe(502); expect((await response.json()).error).toBe('INVALID_PROVIDER_RESPONSE');
      expect(g.generateProvider).toHaveBeenCalledTimes(1);
    });
  });
});

it('preserves preflight/method/CORS handling without reading provider credentials or invoking upstream', async () => {
  const g = gateway();
  expect((await g.invoke({}, { method: 'OPTIONS' })).status).toBe(200);
  const get = await g.invoke({}, { method: 'GET' }); expect(get.status).toBe(405);
  expect(get.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  const malformed = await g.invoke({}, { rawBody: '{' }); expect(malformed.status).toBe(400);
  expect(g.envReads).not.toContain('GEMINI_API_KEY'); expect(g.fakeProvider).not.toHaveBeenCalled();
});
