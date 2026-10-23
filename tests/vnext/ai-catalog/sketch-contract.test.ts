// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { DRAFT_LIMITS, parseDraftRequest, type DraftFetch, type DraftLedgerPort } from '@/vnext/ai-catalog/draft-contract';
import {
  SKETCH_SERVER_LIMITS, buildSketchGeneration, interpretSketchReply, runSketchInterpretation,
  sketchImageDimensions, sketchReservationMicrousd, type InterpretSketchRequest,
} from '@/vnext/ai-catalog/sketch-contract';
import { SKETCH_LIMITS, SKETCH_MODEL } from '@/vnext/ai-catalog/sketch-plan';
import { geminiCostMicrousd } from '@/vnext/ai-catalog/gemini-models';

const KEY = 'TEST_FAKE_SKETCH_SERVER_KEY';
const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const PLAN = { archetype: 'capa', regions: [
  { kind: 'title', bbox: [40, 60, 180, 900], text: 'TA-25N', instruction: '' },
  { kind: 'image', bbox: [220, 200, 900, 800], text: '', instruction: 'Foto do produto' },
], questions: [] };
const badBoxes = () => ({ ...PLAN, regions: PLAN.regions.map(region => ({ ...region, bbox: [900, 60, 180, 900] })) });
const reply = (plan: unknown = PLAN, finishReason = 'STOP') => ({
  candidates: [{ finishReason, content: { parts: [{ text: typeof plan === 'string' ? plan : JSON.stringify(plan) }] } }],
  usageMetadata: { promptTokenCount: 1_000, candidatesTokenCount: 200, thoughtsTokenCount: 100 }, modelVersion: SKETCH_MODEL,
});
function png(width = 1200, height = 1600): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}
function jpeg(width = 1200, height = 1600) {
  const bytes = new Uint8Array([255, 216, 255, 224, 0, 4, 0, 0, 255, 194, 0, 8, 8, 0, 0, 0, 0, 1]);
  const view = new DataView(bytes.buffer);
  view.setUint16(13, height); view.setUint16(15, width);
  return bytes;
}
function webp(kind: 'VP8X' | 'VP8 ' | 'VP8L', width = 1200, height = 1600) {
  const length = kind === 'VP8L' ? 5 : 10;
  const bytes = new Uint8Array(20 + length + length % 2);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode('WEBP' + kind), 8);
  view.setUint32(16, length, true);
  if (kind === 'VP8X') {
    view.setUint32(24, width - 1, true);
    bytes[27] = (height - 1) & 255; bytes[28] = ((height - 1) >> 8) & 255; bytes[29] = ((height - 1) >> 16) & 255;
  } else if (kind === 'VP8 ') {
    bytes.set([157, 1, 42], 23); view.setUint16(26, width, true); view.setUint16(28, height, true);
  } else {
    bytes[20] = 47; view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  }
  return bytes;
}
const sha256 = async (bytes: Uint8Array<ArrayBuffer>) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
async function requestFor(bytes = png(), mimeType: InterpretSketchRequest['source']['mimeType'] = 'image/png') {
  const sha = await sha256(bytes), ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
  return { version: 1, task: 'interpret_sketch', source: { path: `${USER}/${sha}.${ext}`, sha256: sha,
    mimeType, fileName: `rascunho.${ext}`, pageCount: 1, firstPage: 1, lastPage: 1 } };
}
type Options = {
  bytes?: Uint8Array<ArrayBuffer> | null; requestedBytes?: Uint8Array<ArrayBuffer>;
  replies?: unknown[]; failAt?: 'upload' | 'count1' | 'count2' | 'generate1' | 'generate2';
  thrownAt?: 'generate1' | 'generate2'; reserve?: 'missing' | null; count?: number;
  sourceThrows?: boolean; fileState?: string; clockJump?: number;
};
async function sandbox(options: Options = {}) {
  const bytes = options.bytes === undefined ? png() : options.bytes;
  const body = await requestFor(options.requestedBytes ?? bytes ?? png());
  const request = parseDraftRequest(body) as InterpretSketchRequest;
  let generated = 0, counted = 0, clock = 1000;
  const replies = [...(options.replies ?? [reply()])];
  const ledger: DraftLedgerPort = {
    reserve: vi.fn(async (microusd) => options.reserve === undefined ? { id: 'reservation-1', microusd } : options.reserve),
    settle: vi.fn(async () => {}),
  };
  const fetcher = vi.fn<DraftFetch>(async (url, init) => {
    if (url.endsWith('/upload/v1beta/files')) {
      if (options.failAt === 'upload') return Response.json({}, { status: 503 });
      return new Response('{}', { headers: { 'x-goog-upload-url': 'https://upload.example.invalid/session' } });
    }
    if (url.startsWith('https://upload.example.invalid')) return Response.json({ file: {
      name: 'files/sketch1', uri: 'https://generativelanguage.googleapis.com/v1beta/files/sketch1', state: options.fileState ?? 'ACTIVE',
    } });
    if (init.method === 'DELETE') return Response.json({});
    if (url.endsWith(':countTokens')) {
      counted++;
      if (options.clockJump) clock += options.clockJump;
      if (options.failAt === `count${counted}`) return Response.json({}, { status: 429 });
      return Response.json({ totalTokens: options.count ?? 1_000 });
    }
    if (url.endsWith(':generateContent')) {
      generated++;
      if (options.thrownAt === `generate${generated}`) throw new DOMException('timeout', 'TimeoutError');
      if (options.failAt === `generate${generated}`) return Response.json({}, { status: 429 });
      return Response.json(replies.shift() ?? reply());
    }
    return Response.json({ state: 'ACTIVE' });
  });
  const read = vi.fn(async () => { if (options.sourceThrows) throw new Error('storage failed'); return bytes; });
  return { ledger, fetcher, read, request, run: () => runSketchInterpretation({
    request, key: KEY, ledger, source: { read }, fetcher, now: () => clock += 10, sleep: async () => {},
  }) };
}

describe('interpret_sketch: requisição e dimensões pelos bytes', () => {
  it('aceita uma única página de imagem privada sem metadados de dimensões', async () => {
    const body = await requestFor();
    expect(parseDraftRequest(body)).toEqual({ task: 'interpret_sketch', source: body.source });
    for (const changed of [
      { ...body, models: [] }, { ...body, credential: { apiKey: 'fake' } },
      { ...body, source: { ...body.source, width: 1 } },
      { ...body, source: { ...body.source, pageCount: 2 } },
      { ...body, source: { ...body.source, mimeType: 'application/pdf', path: body.source.path.replace('.png', '.pdf') } },
    ]) expect(parseDraftRequest(changed)).toBeNull();
  });
  it.each([
    ['image/png', png()], ['image/jpeg', jpeg()],
    ['image/webp', webp('VP8X')], ['image/webp', webp('VP8 ')], ['image/webp', webp('VP8L')],
  ] as const)('lê %s sem biblioteca de imagem ou valores do cliente', (mime, bytes) => {
    expect(sketchImageDimensions(bytes, mime)).toEqual({ width: 1200, height: 1600 });
  });
  it('recusa MIME falso, dimensões nulas, cabeçalhos truncados e WebP animado', () => {
    expect(sketchImageDimensions(png(), 'image/jpeg')).toBeNull();
    expect(sketchImageDimensions(png(0), 'image/png')).toBeNull();
    expect(sketchImageDimensions(png().slice(0, 24), 'image/png')).toBeNull();
    expect(sketchImageDimensions(jpeg().slice(0, 15), 'image/jpeg')).toBeNull();
    const animated = webp('VP8X'); animated[20] = 2;
    expect(sketchImageDimensions(animated, 'image/webp')).toBeNull();
    expect(sketchImageDimensions(webp('VP8L').slice(0, 21), 'image/webp')).toBeNull();
  });
});

describe('interpret_sketch: provedor, orçamento e nova tentativa limitada', () => {
  const cost = geminiCostMicrousd(SKETCH_MODEL, 1_000, 300);
  it('envia schema bounded e reserva previamente o pior caso de duas gerações', () => {
    const generation = buildSketchGeneration({ uri: 'private-uri', mimeType: 'image/png' });
    expect(generation.generationConfig.maxOutputTokens).toBe(SKETCH_LIMITS.maxOutputTokens);
    const visit = (node: Record<string, unknown>) => {
      if (node.type === 'STRING') expect(node.maxLength).toEqual(expect.any(Number));
      if (node.type === 'ARRAY') { expect(node.maxItems).toEqual(expect.any(Number)); visit(node.items as Record<string, unknown>); }
      if (node.properties) Object.values(node.properties).forEach(value => visit(value as Record<string, unknown>));
    };
    visit(generation.generationConfig.responseSchema);
    expect(sketchReservationMicrousd()).toBe(2 * geminiCostMicrousd(SKETCH_MODEL, SKETCH_SERVER_LIMITS.maxInputTokens, SKETCH_LIMITS.maxOutputTokens));
    expect(sketchReservationMicrousd()).toBeLessThanOrEqual(500_000);
  });
  it('interpreta e marca dígitos para confirmar, sem alterar arquivos e com descarte no Google', async () => {
    const box = await sandbox();
    const result = await box.run();
    expect(result).toMatchObject({ ok: true, sketch: { attempts: 1, dimensions: { width: 1200, height: 1600 },
      usage: { inputTokens: 1000, outputTokens: 300, estimatedUsd: cost / 1e6 },
      plan: { confirmations: expect.arrayContaining([expect.objectContaining({ status: 'confirmar' })]) },
    } });
    expect(box.ledger.reserve).toHaveBeenCalledWith(sketchReservationMicrousd());
    expect(box.ledger.settle).toHaveBeenCalledWith('reservation-1', cost);
    expect(box.fetcher.mock.calls.at(-1)?.[1].method).toBe('DELETE');
  });
  it('repete uma única vez por caixas inválidas e acumula tokens e custo das duas respostas', async () => {
    const box = await sandbox({ replies: [reply(badBoxes()), reply()] });
    expect(await box.run()).toMatchObject({ ok: true, sketch: { attempts: 2,
      usage: { inputTokens: 2000, outputTokens: 600, estimatedUsd: 2 * cost / 1e6 } } });
    expect(box.ledger.reserve).toHaveBeenCalledTimes(1);
    expect(box.ledger.settle).toHaveBeenCalledWith('reservation-1', 2 * cost);
    const calls = box.fetcher.mock.calls.filter(([url]) => url.endsWith(':generateContent'));
    expect(calls).toHaveLength(2);
    expect(calls[1][1].body).not.toBe(calls[0][1].body);
  });
  it('não faz uma terceira chamada se as caixas continuam inválidas', async () => {
    const box = await sandbox({ replies: [reply(badBoxes()), reply(badBoxes()), reply()] });
    expect(await box.run()).toEqual({ ok: false, status: 502, code: 'INVALID_PROVIDER_RESPONSE', reason: 'CONTRACT' });
    expect(box.fetcher.mock.calls.filter(([url]) => url.endsWith(':generateContent'))).toHaveLength(2);
    expect(box.ledger.settle).toHaveBeenCalledWith('reservation-1', 2 * cost);
  });
  it.each([
    [reply('{bad'), 'INVALID_JSON'], [reply({}, 'SAFETY'), 'SAFETY'], [reply({}, 'MAX_TOKENS'), 'MAX_TOKENS'],
    [reply({ ...PLAN, unwanted: 'ignore' }), 'CONTRACT'],
  ])('não repete erro de resposta que não seja de caixas', async (envelope, reason) => {
    const box = await sandbox({ replies: [envelope, reply()] });
    expect(await box.run()).toMatchObject({ ok: false, code: 'INVALID_PROVIDER_RESPONSE', reason });
    expect(box.fetcher.mock.calls.filter(([url]) => url.endsWith(':generateContent'))).toHaveLength(1);
    expect(box.ledger.settle).toHaveBeenCalledWith('reservation-1', cost);
  });
  it.each(['count2', 'generate2'] as const)('não reembolsa a primeira geração quando a segunda falha em %s', async (failAt) => {
    const box = await sandbox({ replies: [reply(badBoxes())], failAt });
    expect(await box.run()).toMatchObject({ ok: false, code: 'PROVIDER_RATE_LIMIT' });
    expect(box.ledger.settle).toHaveBeenCalledWith('reservation-1', cost);
  });
  it.each(['generate1', 'generate2'] as const)('mantém o pior caso da chamada que pode ter sido cobrada em %s', async (thrownAt) => {
    const box = await sandbox({ replies: [reply(badBoxes())], thrownAt });
    expect(await box.run()).toMatchObject({ ok: false, code: 'EXTRACTION_TIMEOUT' });
    expect(box.ledger.settle).toHaveBeenCalledWith('reservation-1', sketchReservationMicrousd() / 2 + (thrownAt === 'generate2' ? cost : 0));
  });
  it('mantém pior caso de uma resposta sem uso conhecido e soma a segunda resposta', async () => {
    const unknown = { ...reply(badBoxes()), usageMetadata: {} };
    const box = await sandbox({ replies: [unknown, reply()] });
    expect(await box.run()).toMatchObject({ ok: true, sketch: { attempts: 2 } });
    expect(box.ledger.settle).toHaveBeenCalledWith('reservation-1', sketchReservationMicrousd() / 2 + cost);
  });
  it.each(['missing', null] as const)('não lê arquivo nem chama Google sem orçamento: %s', async (reserve) => {
    const box = await sandbox({ reserve });
    expect(await box.run()).toMatchObject({ ok: false, code: reserve === 'missing' ? 'BUDGET_NOT_READY' : 'AGENT_DAILY_BUDGET_EXCEEDED' });
    expect(box.read).not.toHaveBeenCalled(); expect(box.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [{ bytes: null }, 'SOURCE_NOT_FOUND'],
    [{ sourceThrows: true }, 'SOURCE_NOT_FOUND'],
    [{ bytes: png(1200, 1601) }, 'SOURCE_TOO_LARGE'],
    [{ bytes: new Uint8Array([1, 2, 3]) }, 'INVALID_REQUEST'],
    [{ bytes: png(1100), requestedBytes: png() }, 'SOURCE_HASH_MISMATCH'],
  ] as const)('recusa arquivo inválido antes do upload: %s', async (options, code) => {
    const box = await sandbox(options);
    expect(await box.run()).toMatchObject({ ok: false, code });
    expect(box.fetcher).not.toHaveBeenCalled(); expect(box.ledger.settle).toHaveBeenCalledWith('reservation-1', 0);
  });
  it('recusa um arquivo maior que o de uma foto de página, mesmo com cabeçalho válido', async () => {
    const big = new Uint8Array(SKETCH_SERVER_LIMITS.maxImageBytes + 1);
    big.set(png());
    const box = await sandbox({ bytes: big });
    expect(await box.run()).toMatchObject({ ok: false, status: 413, code: 'SOURCE_TOO_LARGE' });
    expect(box.fetcher).not.toHaveBeenCalled(); expect(box.ledger.settle).toHaveBeenCalledWith('reservation-1', 0);
    expect(SKETCH_SERVER_LIMITS.maxImageBytes).toBeLessThan(DRAFT_LIMITS.maxSourceBytes);
  });
  it('recusa entrada grande demais e prazo insuficiente antes da geração cobrada', async () => {
    for (const options of [{ count: SKETCH_SERVER_LIMITS.maxInputTokens + 1 }, { clockJump: DRAFT_LIMITS.deadlineMs }]) {
      const box = await sandbox(options);
      expect(await box.run()).toMatchObject({ ok: false, code: options.count ? 'TOKEN_BUDGET_EXCEEDED' : 'EXTRACTION_TIMEOUT' });
      expect(box.fetcher.mock.calls.filter(([url]) => url.endsWith(':generateContent'))).toHaveLength(0);
      expect(box.ledger.settle).toHaveBeenCalledWith('reservation-1', 0);
    }
  });
  it('reconhece bloqueio e resposta vazia sem expor mensagem do provedor', () => {
    expect(interpretSketchReply({ promptFeedback: { blockReason: 'private' } })).toEqual({ ok: false, reason: 'BLOCKED' });
    expect(interpretSketchReply(reply(''))).toEqual({ ok: false, reason: 'EMPTY' });
  });
});
