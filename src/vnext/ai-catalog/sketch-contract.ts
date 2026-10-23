/**
 * Task `interpret_sketch` of vnext-catalog-draft (Onda 4, Modo rascunho): Gemini reads ONE photo or scan of a
 * hand-drawn page (at most 1600 px on its longest side) and proposes its STRUCTURE — page type, regions with
 * native boxes [ymin,xmin,ymax,xmax] 0–1000, the labels as written and layout questions. Shared by the Edge
 * Function (Deno), the unit tests and the local live check (Node), like draft-contract.ts.
 *
 * Never a source of technical data: every digit read from the sketch comes back marked "confirmar"
 * (sketch-plan.ts), and the browser re-validates the answer and fits it to the PRESYS models (sketch-snap.ts).
 *
 * Flow: budget reservation for two readings (00028, feature 'extraction') -> private file -> sha256 and real
 * dimensions read from the bytes -> Files API upload -> countTokens -> generateContent with the bounded schema ->
 * box validation; ONE new reading only when the boxes are invalid -> settlement by real usage -> file deleted.
 */
import {
  DRAFT_LIMITS, type DraftFetch, type DraftLedgerPort, type DraftSourcePort, type DraftStepReport,
  type ExtractionSourceRequest,
} from './draft-contract.ts';
import { isObj, providerFailureCode, readProviderUsage } from './composer-contract.ts';
import type { DraftErrorCode, DraftErrorReason } from './draft-codes.ts';
import { geminiCostMicrousd } from './gemini-models.ts';
import {
  SKETCH_LIMITS, SKETCH_MODEL, SKETCH_PROMPT_VERSION, buildSketchPrompt, sketchPlanResponseSchema,
  validateSketchPlan, type SketchPagePlan,
} from './sketch-plan.ts';

export const SKETCH_SERVER_LIMITS = Object.freeze({
  /** Spike: about 1 560 input tokens for a 1240 x 1754 page; countTokens must stay at or below this. */
  maxInputTokens: 16_000,
  /** The first answer plus ONE new reading when its boxes are invalid. */
  maxAttempts: 2,
  maxAnswerChars: 80_000,
  /** A page of at most 1600 px is far below this; a bigger file is not a sketch photo. */
  maxImageBytes: 10 * 1024 * 1024,
  /** Spike: 12–15 s per page, 19 s at worst. */
  generateMaxMs: 55_000,
  minGenerateMs: 10_000,
});
export interface InterpretSketchRequest {
  readonly task: 'interpret_sketch';
  readonly source: Omit<ExtractionSourceRequest, 'mimeType' | 'pageCount' | 'firstPage' | 'lastPage'> & {
    readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
    readonly pageCount: 1;
    readonly firstPage: 1;
    readonly lastPage: 1;
  };
}
export interface SketchImageDimensions { readonly width: number; readonly height: number }

/** Lê as dimensões do conteúdo binário, sem confiar no MIME ou em valores do cliente. */
export function sketchImageDimensions(bytes: Uint8Array, mimeType: InterpretSketchRequest['source']['mimeType']): SketchImageDimensions | null {
  const be16 = (at: number) => (bytes[at] << 8) | bytes[at + 1];
  const le16 = (at: number) => bytes[at] | (bytes[at + 1] << 8);
  const be32 = (at: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, false);
  const le32 = (at: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, true);
  const tag = (at: number, text: string) => [...text].every((char, index) => bytes[at + index] === char.charCodeAt(0));
  const dimensions = (width: number, height: number) => width > 0 && height > 0 ? { width, height } : null;
  if (mimeType === 'image/png') {
    if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
      || be32(8) !== 13 || !tag(12, 'IHDR')) return null;
    return dimensions(be32(16), be32(20));
  }
  if (mimeType === 'image/jpeg') {
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) return null;
    let at = 2;
    while (at + 3 < bytes.length) {
      if (bytes[at++] !== 255) return null;
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 217 || marker === 218) return null;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (at + 2 > bytes.length) return null;
      const length = be16(at);
      if (length < 2 || at + length > bytes.length) return null;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        return length >= 8 ? dimensions(be16(at + 5), be16(at + 3)) : null;
      }
      at += length;
    }
    return null;
  }
  if (bytes.length < 20 || !tag(0, 'RIFF') || !tag(8, 'WEBP') || le32(4) + 8 > bytes.length) return null;
  let result = null as SketchImageDimensions | null;
  for (let at = 12; at + 8 <= bytes.length;) {
    const length = le32(at + 4), data = at + 8;
    if (data + length > bytes.length) return null;
    let found: SketchImageDimensions | null = null;
    if (tag(at, 'VP8X') && length >= 10) {
      if (bytes[data] & 2) return null; // Uma página, sem animação.
      found = dimensions(1 + (le32(data + 4) & 0xffffff), 1 + (le32(data + 6) >>> 8));
    } else if (tag(at, 'VP8 ') && length >= 10 && tag(data + 3, '\u009d\u0001*')) {
      found = dimensions(le16(data + 6) & 0x3fff, le16(data + 8) & 0x3fff);
    } else if (tag(at, 'VP8L') && length >= 5 && bytes[data] === 47) {
      const bits = le32(data + 1);
      found = dimensions(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff));
    }
    if (found) result = { width: Math.max(result?.width ?? 0, found.width), height: Math.max(result?.height ?? 0, found.height) };
    at = data + length + (length % 2);
  }
  return result;
}

export function buildSketchGeneration(file: { uri: string; mimeType: string }, retryInvalidBoxes = false) {
  return {
    contents: [{ role: 'user', parts: [
      { fileData: { fileUri: file.uri, mimeType: file.mimeType } },
      { text: buildSketchPrompt({ retryInvalidBoxes }) },
    ] }],
    generationConfig: { temperature: 0, candidateCount: 1, responseMimeType: 'application/json',
      responseSchema: sketchPlanResponseSchema(), maxOutputTokens: SKETCH_LIMITS.maxOutputTokens },
  };
}
type SketchReplyOutcome = { ok: true; plan: SketchPagePlan }
  | { ok: false; reason: DraftErrorReason | 'INVALID_BOXES' };
export function interpretSketchReply(envelope: unknown): SketchReplyOutcome {
  if (!isObj(envelope)) return { ok: false, reason: 'INVALID_JSON' };
  const candidates = Array.isArray(envelope.candidates) ? envelope.candidates : [];
  if (!candidates.length) return { ok: false,
    reason: isObj(envelope.promptFeedback) && typeof envelope.promptFeedback.blockReason === 'string' ? 'BLOCKED' : 'EMPTY' };
  if (candidates.length !== 1 || !isObj(candidates[0])) return { ok: false, reason: 'CONTRACT' };
  const candidate = candidates[0];
  if (candidate.finishReason === 'MAX_TOKENS') return { ok: false, reason: 'MAX_TOKENS' };
  if (candidate.finishReason !== 'STOP') return { ok: false,
    reason: ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'].includes(String(candidate.finishReason))
      ? 'SAFETY' : 'CONTRACT' };
  const parts = isObj(candidate.content) && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
  const text = parts.filter(part => isObj(part) && part.thought !== true && typeof part.text === 'string')
    .map(part => (part as Record<string, unknown>).text as string).join('');
  if (!text.trim()) return { ok: false, reason: 'EMPTY' };
  if (text.length > SKETCH_SERVER_LIMITS.maxAnswerChars) return { ok: false, reason: 'CONTRACT' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: 'INVALID_JSON' }; }
  const validated = validateSketchPlan(raw);
  return validated.ok ? { ok: true, plan: validated.plan }
    : { ok: false, reason: validated.reason === 'INVALID_BOXES' ? 'INVALID_BOXES' : 'CONTRACT' };
}

export function sketchReservationMicrousd(): number {
  return SKETCH_SERVER_LIMITS.maxAttempts * geminiCostMicrousd(SKETCH_MODEL,
    SKETCH_SERVER_LIMITS.maxInputTokens, SKETCH_LIMITS.maxOutputTokens);
}
export interface SketchReply {
  readonly plan: SketchPagePlan;
  readonly dimensions: SketchImageDimensions;
  readonly attempts: number;
  readonly model: string;
  readonly modelVersion: string | null;
  readonly promptVersion: string;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number; readonly estimatedUsd: number };
  readonly ms: number;
}
export type SketchRunResult = { ok: true; sketch: SketchReply }
  | { ok: false; status: number; code: DraftErrorCode; reason?: DraftErrorReason };
const API = 'https://generativelanguage.googleapis.com';
const safely = <T>(work: () => Promise<T>, fallback: T): Promise<T> => Promise.resolve().then(work).catch(() => fallback);
const readJson = (response: Response): Promise<unknown> => response.json().catch(() => null);

/** Reserva duas tentativas antes do provedor; só caixas inválidas permitem a segunda. */
export async function runSketchInterpretation(input: {
  request: InterpretSketchRequest; key: string; ledger: DraftLedgerPort; source: DraftSourcePort; fetcher: DraftFetch;
  now?: () => number; sleep?: (ms: number) => Promise<void>; onStep?: (report: DraftStepReport) => void;
}): Promise<SketchRunResult> {
  const { request, key, ledger, source, fetcher, onStep } = input;
  const now = input.now ?? Date.now;
  const started = now(), deadline = started + DRAFT_LIMITS.deadlineMs;
  const left = () => Math.max(1, deadline - now());
  const timeout = (max: number) => AbortSignal.timeout(Math.min(max, left()));
  const sleep = input.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const fail = (status: number, code: DraftErrorCode, reason?: DraftErrorReason): SketchRunResult =>
    ({ ok: false, status, code, ...(reason ? { reason } : {}) });
  const reservation = await safely(() => ledger.reserve(sketchReservationMicrousd()), null);
  onStep?.({ step: 'reserve', ms: 0, detail: reservation === 'missing' ? 'missing' : reservation ? 'ok' : 'refused' });
  if (reservation === 'missing') return fail(503, 'BUDGET_NOT_READY');
  if (!reservation) return fail(429, 'AGENT_DAILY_BUDGET_EXCEEDED');
  const auth = { 'x-goog-api-key': key };
  let uploaded: { name: string; uri: string } | null = null;
  let accrued = 0, inputTokens = 0, outputTokens = 0;
  const oneAttempt = sketchReservationMicrousd() / SKETCH_SERVER_LIMITS.maxAttempts;
  const httpFailure = async (response: Response) => {
    const code = providerFailureCode(response.status, await readJson(response));
    return fail(code === 'PROVIDER_RATE_LIMIT' ? 429 : code === 'PROVIDER_REJECTED_KEY' ? 503 : 502, code);
  };
  try {
    const bytes = await safely(() => source.read(request.source.path), null);
    if (!bytes) return fail(404, 'SOURCE_NOT_FOUND');
    if (bytes.byteLength > SKETCH_SERVER_LIMITS.maxImageBytes) return fail(413, 'SOURCE_TOO_LARGE');
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (sha !== request.source.sha256) return fail(409, 'SOURCE_HASH_MISMATCH');
    const dimensions = sketchImageDimensions(bytes, request.source.mimeType);
    if (!dimensions) return fail(422, 'INVALID_REQUEST');
    if (Math.max(dimensions.width, dimensions.height) > SKETCH_LIMITS.maxImageSidePx) return fail(413, 'SOURCE_TOO_LARGE');
    onStep?.({ step: 'read', ms: 0, detail: bytes.byteLength });

    const start = await fetcher(`${API}/upload/v1beta/files`, { method: 'POST', headers: {
      ...auth, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': request.source.mimeType, 'content-type': 'application/json',
    }, body: JSON.stringify({ file: { display_name: `vnext-sketch-${request.source.sha256.slice(0, 12)}` } }),
    signal: timeout(DRAFT_LIMITS.countMs) });
    if (!start.ok) return await httpFailure(start);
    const uploadUrl = start.headers.get('x-goog-upload-url');
    if (!uploadUrl) return fail(502, 'PROVIDER_UNAVAILABLE');
    const done = await fetcher(uploadUrl, { method: 'POST', headers: {
      'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize', 'content-type': request.source.mimeType,
    }, body: bytes, signal: timeout(DRAFT_LIMITS.uploadMs) });
    if (!done.ok) return await httpFailure(done);
    const fileBody = await readJson(done);
    const file = isObj(fileBody) && isObj(fileBody.file) ? fileBody.file : null;
    if (!file || typeof file.name !== 'string' || !/^files\/[\w-]+$/u.test(file.name) || typeof file.uri !== 'string') {
      return fail(502, 'PROVIDER_UNAVAILABLE');
    }
    uploaded = { name: file.name, uri: file.uri };
    onStep?.({ step: 'upload', ms: 0, detail: bytes.byteLength });
    const activeAt = now();
    let state = typeof file.state === 'string' ? file.state : 'PROCESSING';
    while (state === 'PROCESSING') {
      if (now() - activeAt > DRAFT_LIMITS.fileActiveMs || left() < SKETCH_SERVER_LIMITS.minGenerateMs) {
        return fail(504, 'EXTRACTION_TIMEOUT');
      }
      await sleep(1_000);
      const status = await fetcher(`${API}/v1beta/${uploaded.name}`, { method: 'GET', headers: auth, signal: timeout(10_000) });
      if (!status.ok) return await httpFailure(status);
      const body = await readJson(status);
      if (!isObj(body) || typeof body.state !== 'string') return fail(502, 'PROVIDER_UNAVAILABLE');
      state = body.state;
    }
    if (state !== 'ACTIVE') return fail(422, 'PROVIDER_FILE_FAILED');
    const endpoint = `${API}/v1beta/models/${SKETCH_MODEL}`;
    for (let attempt = 1; attempt <= SKETCH_SERVER_LIMITS.maxAttempts; attempt++) {
      const generation = buildSketchGeneration({ uri: uploaded.uri, mimeType: request.source.mimeType }, attempt > 1);
      const counted = await fetcher(`${endpoint}:countTokens`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ generateContentRequest: { model: `models/${SKETCH_MODEL}`, ...generation } }), signal: timeout(DRAFT_LIMITS.countMs) });
      if (!counted.ok) return await httpFailure(counted);
      const count = await readJson(counted);
      const tokens = isObj(count) ? count.totalTokens : null;
      onStep?.({ step: 'count', ms: 0, httpStatus: counted.status, detail: typeof tokens === 'number' ? tokens : -1 });
      if (typeof tokens !== 'number' || !Number.isSafeInteger(tokens) || tokens < 0 || tokens > SKETCH_SERVER_LIMITS.maxInputTokens) {
        return fail(413, 'TOKEN_BUDGET_EXCEEDED');
      }
      if (left() < SKETCH_SERVER_LIMITS.minGenerateMs) return fail(504, 'EXTRACTION_TIMEOUT');
      const before = accrued;
      accrued += oneAttempt; // Uma falha de rede pode ter sido cobrada; mantém o pior caso desta tentativa.
      const at = now();
      const response = await fetcher(`${endpoint}:generateContent`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify(generation), signal: timeout(SKETCH_SERVER_LIMITS.generateMaxMs) });
      if (!response.ok) { accrued = before; return await httpFailure(response); }
      const envelope = await readJson(response);
      const usage = readProviderUsage(envelope, tokens, SKETCH_LIMITS.maxOutputTokens);
      accrued = before + (usage.known ? geminiCostMicrousd(SKETCH_MODEL, usage.inputTokens, usage.outputTokens) : oneAttempt);
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
      const outcome = interpretSketchReply(envelope);
      onStep?.({ step: 'generate', ms: now() - at, httpStatus: response.status, detail: outcome.ok ? 'OK' : outcome.reason });
      if (outcome.ok) {
        const modelVersion = isObj(envelope) && typeof envelope.modelVersion === 'string' && envelope.modelVersion.length <= 80
          ? envelope.modelVersion : null;
        return { ok: true, sketch: { plan: outcome.plan, dimensions, attempts: attempt, model: SKETCH_MODEL,
          modelVersion, promptVersion: SKETCH_PROMPT_VERSION, usage: { inputTokens, outputTokens,
            estimatedUsd: Math.min(reservation.microusd, accrued) / 1e6 }, ms: now() - started } };
      }
      if (outcome.reason !== 'INVALID_BOXES' || attempt === SKETCH_SERVER_LIMITS.maxAttempts) {
        return fail(502, 'INVALID_PROVIDER_RESPONSE', outcome.reason === 'INVALID_BOXES' ? 'CONTRACT' : outcome.reason);
      }
    }
    return fail(502, 'INVALID_PROVIDER_RESPONSE', 'CONTRACT');
  } catch (error) {
    const timedOut = isObj(error) && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return fail(timedOut ? 504 : 502, timedOut ? 'EXTRACTION_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
  } finally {
    const amount = Math.min(reservation.microusd, accrued);
    await safely(() => ledger.settle(reservation.id, amount), undefined);
    onStep?.({ step: 'settle', ms: 0, detail: amount });
    if (uploaded) {
      const name = uploaded.name;
      await safely(() => fetcher(`${API}/v1beta/${name}`, { method: 'DELETE', headers: auth, signal: AbortSignal.timeout(5_000) }), null);
      onStep?.({ step: 'delete', ms: 0 });
    }
  }
}
