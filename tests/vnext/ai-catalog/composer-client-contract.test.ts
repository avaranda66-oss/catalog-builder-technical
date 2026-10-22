// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ComposerRequestError, composerFailure, nativeComposeGateway, nativeTextEditGateway, readComposerReadiness,
  type NativeComposeFunctionsClient,
} from '../../../src/vnext/ai-catalog/native-compose-client';
import { composerErrorMessage, composerReadinessText } from '../../../src/vnext/ai-catalog/composer-messages';
import {
  clearByokCredential, getByokCredential, setByokCredential, subscribeByokCredential,
} from '../../../src/vnext/ai-catalog/byok-session';
import { COMPOSER_ERROR_CODES } from '../../../src/vnext/ai-catalog/composer-codes';
import { frameShortComposerMessage, frameShortRewriteInstruction } from '../../../src/vnext/ai-catalog/composer-framing';
import {
  interpretProviderReply, normalizeComposeReply, parseComposerRequest, readProviderUsage, settlementMicrousd,
  truncateAtWord, usageMicrousd, verifyComposeReply, type ComposeScaffoldRequest,
} from '../../../src/vnext/ai-catalog/composer-contract';
import { geminiCostMicrousd } from '../../../src/vnext/ai-catalog/gemini-models';

afterEach(() => clearByokCredential());

const httpFailure = (status: number, body: unknown) => ({
  data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'),
    { name: 'FunctionsHttpError', context: { status, clone() { return this; }, json: async () => body } }),
});
const clientAnswering = (answer: unknown) => {
  const invoke = vi.fn(async () => answer);
  return { client: { functions: { invoke } } as unknown as NativeComposeFunctionsClient, invoke };
};

describe('allowlisted composer failures (FR-61)', () => {
  it('keeps only the allowlisted code, reason and HTTP status; drops server text', async () => {
    const failure = await composerFailure(httpFailure(502, { code: 'INVALID_PROVIDER_RESPONSE', reason: 'MAX_TOKENS', message: 'key=SECRET' }));
    expect(failure).toBeInstanceOf(ComposerRequestError);
    expect(failure).toMatchObject({ code: 'INVALID_PROVIDER_RESPONSE', reason: 'MAX_TOKENS', httpStatus: 502 });
    expect(JSON.stringify(failure)).not.toContain('SECRET');
    expect(failure.message).toBe('INVALID_PROVIDER_RESPONSE');
  });
  it('treats unknown codes and reasons as a generic failure, and a fetch failure as no connection', async () => {
    expect(await composerFailure(httpFailure(500, { code: 'DROP TABLE', reason: 'anything' })))
      .toMatchObject({ code: 'NATIVE_COMPOSER_UNAVAILABLE', reason: undefined });
    expect(await composerFailure({ error: Object.assign(new Error('x'), { name: 'FunctionsFetchError' }) }))
      .toMatchObject({ code: 'NETWORK' });
    expect(await composerFailure({ error: new Error('no body') })).toMatchObject({ code: 'NATIVE_COMPOSER_UNAVAILABLE' });
  });
  it('sends no credential by default and the personal key only when given', async () => {
    const plain = clientAnswering({ data: { reply: { ok: 1 } }, error: null });
    await nativeComposeGateway(plain.client)({ version: 1 } as never);
    expect(plain.invoke.mock.calls[0]).toEqual(['vnext-catalog-composer', { body: { version: 1 } }]);
    const own = clientAnswering({ data: { reply: { ok: 1 } }, error: null });
    await nativeTextEditGateway(own.client, 'personal-test-key-000')({ version: 1 } as never);
    expect(own.invoke.mock.calls[0]).toEqual(['vnext-catalog-composer',
      { body: { version: 1, credential: { provider: 'gemini', apiKey: 'personal-test-key-000' } } }]);
    expect(() => nativeComposeGateway(plain.client, ' short ')).toThrow('COMPOSER_CREDENTIAL_INVALID');
  });
  it('rejects a failed generation with the allowlisted error', async () => {
    const { client } = clientAnswering(httpFailure(429, { code: 'AGENT_DAILY_BUDGET_EXCEEDED' }));
    await expect(nativeComposeGateway(client)({ version: 1 } as never)).rejects.toMatchObject({ code: 'AGENT_DAILY_BUDGET_EXCEEDED' });
    const thrown = { client: { functions: { invoke: async () => { throw new Error('boom'); } } } as unknown as NativeComposeFunctionsClient };
    await expect(nativeComposeGateway(thrown.client)({ version: 1 } as never)).rejects.toMatchObject({ code: 'NATIVE_COMPOSER_UNAVAILABLE' });
  });
});

describe('readiness check tolerates the old and the new composer (FR-60)', () => {
  it('reads the new status answer', async () => {
    const { client, invoke } = clientAnswering({ data: { code: 'OK', status: { enabled: true, mode: 'settled', serverKey: true,
      byok: false, remainingMicrousd: 2_000_000, callReserveMicrousd: 12_040 } }, error: null });
    expect(await readComposerReadiness(client)).toEqual({ kind: 'ready', serverKey: true, byok: false,
      remainingMicrousd: 2_000_000, callReserveMicrousd: 12_040 });
    expect(invoke.mock.calls[0]).toEqual(['vnext-catalog-composer', { body: { version: 1, task: 'status' } }]);
  });
  it('treats the old composer (no status task) and unreadable answers as available', async () => {
    expect(await readComposerReadiness(clientAnswering(httpFailure(400, { code: 'INVALID_REQUEST' })).client)).toEqual({ kind: 'available' });
    expect(await readComposerReadiness(clientAnswering({ data: { reply: null }, error: null }).client)).toEqual({ kind: 'available' });
    const thrown = { functions: { invoke: async () => { throw new Error('offline'); } } } as unknown as NativeComposeFunctionsClient;
    expect(await readComposerReadiness(thrown)).toEqual({ kind: 'available' });
  });
  it('reports blocking reasons the old composer also answers before parsing the task', async () => {
    for (const code of ['COMPOSER_DISABLED', 'FORBIDDEN', 'UNAUTHENTICATED', 'INVALID_ORIGIN'] as const) {
      expect(await readComposerReadiness(clientAnswering(httpFailure(503, { code })).client)).toEqual({ kind: 'blocked', code });
    }
  });
});

describe('plain Portuguese messages', () => {
  it('has a message with an action for every server code, with no codes or jargon', () => {
    for (const code of [...COMPOSER_ERROR_CODES, 'NETWORK', 'NATIVE_COMPOSER_UNAVAILABLE', 'INVALID_REPLY'] as const) {
      const message = composerErrorMessage(new ComposerRequestError(code));
      expect(message).toMatch(/O catálogo não foi alterado\.$/);
      expect(message).not.toMatch(/[A-Z]{2,}_[A-Z]|BYOK|Gemini API|token|JSON|Edge/);
    }
  });
  it('specializes the message by reason and by who owns the key', () => {
    expect(composerErrorMessage(new ComposerRequestError('INVALID_PROVIDER_RESPONSE', 'MAX_TOKENS'))).toContain('Peça menos páginas de cada vez');
    expect(composerErrorMessage(new ComposerRequestError('INVALID_PROVIDER_RESPONSE', 'SAFETY'))).toContain('Escreva com outras palavras');
    expect(composerErrorMessage(new ComposerRequestError('PROVIDER_REJECTED_KEY'), { usingOwnKey: true })).toContain('recusou a sua chave própria');
    expect(composerErrorMessage(new ComposerRequestError('PROVIDER_REJECTED_KEY'))).toContain('Fale com o administrador');
    expect(composerErrorMessage(new ComposerRequestError('PROVIDER_UNAVAILABLE', undefined, 429))).toContain('Espere um minuto');
    expect(composerErrorMessage(new Error('anything else'))).toContain('A IA respondeu de um jeito que não pôde ser usado');
  });
  it('describes readiness for the author', () => {
    expect(composerReadinessText(undefined, false)).toBe('Verificando a IA…');
    expect(composerReadinessText({ kind: 'available' }, false)).toBe('IA disponível.');
    expect(composerReadinessText({ kind: 'ready', serverKey: true, byok: false, remainingMicrousd: null, callReserveMicrousd: 7800 }, false)).toBe('IA pronta.');
    expect(composerReadinessText({ kind: 'ready', serverKey: false, byok: true, remainingMicrousd: null, callReserveMicrousd: 7800 }, false))
      .toContain('ainda não foi configurada');
    expect(composerReadinessText({ kind: 'ready', serverKey: true, byok: false, remainingMicrousd: 100, callReserveMicrousd: 12_040 }, false))
      .toContain('limite diário');
    expect(composerReadinessText({ kind: 'blocked', code: 'FORBIDDEN' }, false)).toContain('não tem permissão');
    expect(composerReadinessText(undefined, true)).toBe('IA pronta, usando a sua chave própria nesta aba.');
  });
});

describe('personal key lives outside the closable panel, bound to one account', () => {
  it('survives readers, is scoped to the account and notifies listeners', () => {
    const listener = vi.fn();
    const stop = subscribeByokCredential(listener);
    setByokCredential('personal-test-key-000', 'user:a');
    expect(getByokCredential('user:a')).toBe('personal-test-key-000');
    expect(getByokCredential('user:b')).toBeUndefined();
    clearByokCredential();
    expect(getByokCredential('user:a')).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    expect(() => setByokCredential(' padded key value ')).toThrow('BYOK_CREDENTIAL_INVALID');
    expect(() => setByokCredential('short')).toThrow('BYOK_CREDENTIAL_INVALID');
  });
});

describe('short answers and lenient-before-strict normalization (FR-61)', () => {
  it('frames short answers so the old composer (8-character minimum) accepts them', () => {
    expect(frameShortComposerMessage('Sim', true)).toBe('Resposta do usuário à pergunta anterior: Sim');
    expect(frameShortComposerMessage(' 3 ', true)).toBe('Resposta do usuário à pergunta anterior: 3');
    expect(frameShortComposerMessage('capa', false)).toBe('Pedido do usuário: capa');
    expect(frameShortComposerMessage('Crie uma capa nova', true)).toBe('Crie uma capa nova');
    expect(frameShortRewriteInstruction('Curto')).toBe('Instrução do usuário: Curto');
    // The new composer also accepts a one-character message directly.
    const request = parseComposerRequest({ version: 1, task: 'compose_scaffold', message: '3', history: [],
      document: { title: 'Catálogo', pages: 1, currentPageHeadings: [] } });
    expect(request).toMatchObject({ message: '3' });
    expect(request).not.toHaveProperty('key');
  });
  it('drops an empty subtitle, empty labels and keys of the other branch before the strict check', () => {
    const raw = { status: 'proposal', question: '', summary: '  Estrutura   com capa  ', pages: [
      { type: 'cover', heading: 'Capa', subtitle: '  ' },
      { type: 'comparison', heading: 'Comparativo', table: { design: '', columns: ['Característica', 'A', ' '], rowLabels: ['Faixa', ''] } },
      { type: 'comparison', heading: 'Sem tabela' },
    ] };
    const verified = verifyComposeReply(normalizeComposeReply(raw));
    expect(verified).toEqual({ version: 1, status: 'proposal', summary: 'Estrutura com capa', pages: [
      { type: 'cover', heading: 'Capa' },
      { type: 'comparison', heading: 'Comparativo', table: { columns: ['Característica', 'A'], rowLabels: ['Faixa'] } },
      { type: 'section', heading: 'Sem tabela' },
    ] });
    // Normalization never smuggles in unknown non-empty keys.
    expect(verifyComposeReply(normalizeComposeReply({ ...raw, command: 'deleteAll' }))).toBeNull();
    expect(truncateAtWord('uma frase longa demais para caber', 16)).toBe('uma frase longa…');
  });
  it('marks a cut answer (MAX_TOKENS) and invalid JSON as repairable, a contract break as final', () => {
    const request = { task: 'compose_scaffold' } as ComposeScaffoldRequest;
    const envelope = (finishReason: string, text: string) => ({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });
    expect(interpretProviderReply(request, envelope('MAX_TOKENS', '{"status":"pro'))).toEqual({ ok: false, reason: 'MAX_TOKENS', retryable: true });
    expect(interpretProviderReply(request, envelope('STOP', 'not json'))).toEqual({ ok: false, reason: 'INVALID_JSON', retryable: true });
    expect(interpretProviderReply(request, envelope('STOP', '{"status":"proposal","shell":"x"}'))).toEqual({ ok: false, reason: 'CONTRACT', retryable: false });
    expect(interpretProviderReply(request, envelope('SAFETY', ''))).toEqual({ ok: false, reason: 'SAFETY', retryable: false });
  });
});

describe('budget settlement arithmetic (FR-62)', () => {
  it('bills thinking tokens as output and settles by real usage, never above the reservation', () => {
    const usage = readProviderUsage({ usageMetadata: { promptTokenCount: 250, candidatesTokenCount: 90, thoughtsTokenCount: 10 } }, 240, 2400);
    expect(usage).toEqual({ inputTokens: 250, outputTokens: 100, known: true });
    expect(usageMicrousd(usage)).toBe(325);
    expect(settlementMicrousd(7800, { kind: 'usage', usage })).toBe(325);
    expect(settlementMicrousd(100, { kind: 'usage', usage })).toBe(100);
  });
  it('refunds provider errors and calls never made, keeps the worst case when the cost is unknown', () => {
    expect(settlementMicrousd(7800, { kind: 'provider_error' })).toBe(0);
    expect(settlementMicrousd(7800, { kind: 'not_called' })).toBe(0);
    expect(settlementMicrousd(7800, { kind: 'unknown' })).toBe(7800);
    const unknownUsage = readProviderUsage({}, 240, 2400);
    expect(unknownUsage).toEqual({ inputTokens: 240, outputTokens: 2400, known: false });
    expect(settlementMicrousd(7800, { kind: 'usage', usage: unknownUsage })).toBe(7800);
  });
  it('prices an unknown model at the most expensive known rate (fail closed)', () => {
    expect(geminiCostMicrousd('gemini-3.5-flash-lite', 6000, 2400)).toBe(7800);
    // The most expensive known rate is gemini-3.8-flash (extraction, FR-66): 6000 x 1.50 + 2400 x 7.50.
    expect(geminiCostMicrousd('unknown-model', 6000, 2400)).toBe(27_000);
    expect(geminiCostMicrousd('gemini-3.5-flash-lite', -5, Number.NaN)).toBe(0);
  });
});

describe('the CLI probe runs exactly the contract the Edge Function bundles', () => {
  it('imports the same composer-contract module (no copy that could drift)', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const contractImport = (file: string) => {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      const match = /from '([^']*composer-contract\.ts)'/.exec(source);
      return match ? resolve(dirname(resolve(process.cwd(), file)), match[1]) : null;
    };
    const edge = contractImport('supabase/functions/vnext-catalog-composer/index.ts');
    const probe = contractImport('scripts/probe-composer.mjs');
    expect(edge).toBe(resolve(process.cwd(), 'src/vnext/ai-catalog/composer-contract.ts'));
    expect(probe).toBe(edge);
    // The probe reads the key only from the environment and never prints it.
    const probeSource = readFileSync(resolve(process.cwd(), 'scripts/probe-composer.mjs'), 'utf8');
    expect(probeSource).toContain('process.env.GEMINI_API_KEY');
    expect(probeSource).not.toMatch(/console\.(log|error)\([^)]*\bkey\b/);
    expect(probeSource).not.toMatch(/readFileSync\([^)]*key/i);
  });
});
