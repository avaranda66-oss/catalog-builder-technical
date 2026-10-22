/**
 * Pure contract of the vnext-catalog-draft Edge Function, task `extract_facts`
 * (FR-66): Gemini reads ONE private PDF or photo and returns the v3 fact sheet.
 *
 * The SAME code runs in:
 * - supabase/functions/vnext-catalog-draft/index.ts (Deno, relative import);
 * - the unit tests and the local live check (Node), with simulated Supabase.
 *
 * Rules: imports only pure sibling modules by explicit `.ts` path; only
 * erasable TypeScript syntax; never log or return credentials, prompts, file
 * names or model text except the bounded answer itself. The answer is NOT
 * trusted here or anywhere: the browser verifies every value against the
 * file's own text (extraction-review.ts) before anything reaches a catalog.
 *
 * Flow of one call (one file, one generateContent):
 * cache -> budget reservation (00028) -> private file -> sha256 check ->
 * Gemini Files API upload (no base64: the Edge CPU limit is 2 s) ->
 * countTokens -> generateContent -> settlement by real usage -> cache.
 */
import {
  FACT_EXTRACTION_PROMPT_VERSION_V3, buildFactExtractionPromptV3, factSheetResponseSchemaV3, type ExtractionSource,
} from './fact-extraction-prompt.ts';
import { GEMINI_EXTRACTION_MODEL, geminiCostMicrousd } from './gemini-models.ts';
import { isObj, providerFailureCode, readProviderUsage, type ComposerUsage, type Obj } from './composer-contract.ts';
import type { DraftErrorCode, DraftErrorReason } from './draft-codes.ts';

export const EXTRACTION_MODEL = GEMINI_EXTRACTION_MODEL;
export const EXTRACTION_PROMPT_VERSION = FACT_EXTRACTION_PROMPT_VERSION_V3;
/** Private bucket of migration 00029. Spreadsheets never go there: they are read only in the browser. */
export const SOURCE_FILES_BUCKET = 'vnext-source-files';

export const DRAFT_LIMITS = Object.freeze({
  maxBodyChars: 4_000,
  /** Same ceiling as pdf-intake (MAX_PDF_BYTES) and the bucket. */
  maxSourceBytes: 50 * 1024 * 1024,
  maxPdfPages: 1_000,
  /** Specification pages of one call (TA-PT p. 5-8, Y17 p. 7-8); long ranges are slow and costly. */
  maxRangePages: 12,
  maxModels: 6,
  modelChars: 60,
  fileNameChars: 160,
  /** countTokens must stay at or below this; the reservation assumes it (an 80-page manual is about 45 000). */
  maxInputTokens: 64_000,
  maxOutputTokens: 16_384,
  maxAnswerChars: 300_000,
  /** Whole call, under the 150 s request limit of Supabase Edge Functions. */
  deadlineMs: 135_000,
  uploadMs: 45_000,
  fileActiveMs: 20_000,
  countMs: 15_000,
  /** The slowest spike call took 27 s (manual p. 5-8 without the shared tables). */
  generateMaxMs: 110_000,
  minGenerateMs: 20_000,
});

export const SOURCE_MIME_TYPES = Object.freeze(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const);
export type SourceMimeType = typeof SOURCE_MIME_TYPES[number];
export const SOURCE_EXTENSIONS: Readonly<Record<SourceMimeType, string>> = Object.freeze({
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
});
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SOURCE_PATH = new RegExp(`^(${UUID})/([0-9a-f]{64})\\.(pdf|jpg|png|webp)$`);
const SHA256 = /^[0-9a-f]{64}$/;
/** "<user id>/<sha256>.<ext>": the bucket accepts only this shape, in the uploader's own folder. */
export function sourceStoragePath(userId: string, sha256: string, mimeType: SourceMimeType): string {
  return `${userId}/${sha256}.${SOURCE_EXTENSIONS[mimeType]}`;
}

/** Control characters other than tab, line feed and carriage return. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const sortedKeys = (value: Obj) => Object.keys(value).sort().join('|');
const boundedText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max && !CONTROL.test(value) && !/[\r\n]/u.test(value);
const pageNumber = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;

export interface ExtractionSourceRequest {
  readonly path: string;
  readonly sha256: string;
  readonly mimeType: SourceMimeType;
  readonly fileName: string;
  readonly pageCount: number;
  readonly firstPage: number;
  readonly lastPage: number;
}
export interface ExtractFactsRequest {
  readonly task: 'extract_facts';
  readonly source: ExtractionSourceRequest;
  /** Products to extract, exactly as printed (empty: the model lists them, at most 6). */
  readonly models: readonly string[];
}
export type DraftRequest = ExtractFactsRequest | { readonly task: 'status' };

/**
 * Strict request parser: exact key sets, no credential (extraction always
 * uses the server key), only PDFs and photos, a path in the uploader's
 * folder whose name is the file's sha256, a short page range.
 */
export function parseDraftRequest(value: unknown): DraftRequest | null {
  if (!isObj(value) || value.version !== 1) return null;
  if (value.task === 'status') return sortedKeys(value) === 'task|version' ? { task: 'status' } : null;
  if (value.task !== 'extract_facts' || sortedKeys(value) !== 'models|source|task|version') return null;
  const source = value.source;
  if (!isObj(source) || sortedKeys(source) !== 'fileName|firstPage|lastPage|mimeType|pageCount|path|sha256') return null;
  const mimeType = source.mimeType;
  if (typeof mimeType !== 'string' || !(SOURCE_MIME_TYPES as readonly string[]).includes(mimeType)) return null;
  if (typeof source.sha256 !== 'string' || !SHA256.test(source.sha256) || typeof source.path !== 'string') return null;
  const path = SOURCE_PATH.exec(source.path);
  if (!path || path[2] !== source.sha256 || path[3] !== SOURCE_EXTENSIONS[mimeType as SourceMimeType]) return null;
  if (!boundedText(source.fileName, DRAFT_LIMITS.fileNameChars)) return null;
  const { pageCount, firstPage, lastPage } = source;
  if (!pageNumber(pageCount, DRAFT_LIMITS.maxPdfPages) || !pageNumber(firstPage, pageCount) ||
    !pageNumber(lastPage, pageCount) || firstPage > lastPage || lastPage - firstPage + 1 > DRAFT_LIMITS.maxRangePages) return null;
  if (mimeType !== 'application/pdf' && pageCount !== 1) return null;
  const models = value.models;
  if (!Array.isArray(models) || models.length > DRAFT_LIMITS.maxModels ||
    models.some(model => !boundedText(model, DRAFT_LIMITS.modelChars)) || new Set(models).size !== models.length) return null;
  return {
    task: 'extract_facts', models: models as string[],
    source: { path: source.path, sha256: source.sha256, mimeType: mimeType as SourceMimeType, fileName: source.fileName,
      pageCount, firstPage, lastPage },
  };
}

/** Cache identity: same bytes, pages, products, model and prompt -> same answer, so a new try is free. */
export interface ExtractionCacheKey {
  readonly sha256: string;
  readonly firstPage: number;
  readonly lastPage: number;
  readonly llmModel: string;
  readonly promptVersion: string;
  /** The requested products, one per line, in the order asked ('' for none). */
  readonly modelsKey: string;
}
export function extractionCacheKey(request: ExtractFactsRequest): ExtractionCacheKey {
  return { sha256: request.source.sha256, firstPage: request.source.firstPage, lastPage: request.source.lastPage,
    llmModel: EXTRACTION_MODEL, promptVersion: EXTRACTION_PROMPT_VERSION, modelsKey: request.models.join('\n') };
}

/** The file as the prompt names it. The id is fixed (one file per call), so the answer never depends on it. */
export function promptSource(request: ExtractFactsRequest): ExtractionSource {
  const { source } = request;
  return { sourceId: 'arquivo', fileName: source.fileName.replace(/["\\]/gu, "'"), sha256: source.sha256,
    pageCount: source.pageCount, firstPage: source.firstPage, lastPage: source.lastPage };
}
export function buildExtractionGeneration(request: ExtractFactsRequest, file: { readonly uri: string; readonly mimeType: string }) {
  const source = promptSource(request);
  return {
    contents: [{ role: 'user', parts: [
      { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
      { text: buildFactExtractionPromptV3({ sources: [source], ...(request.models.length ? { models: request.models } : {}) }) },
    ] }],
    generationConfig: {
      temperature: 0,
      candidateCount: 1,
      responseMimeType: 'application/json',
      responseSchema: factSheetResponseSchemaV3([source.sourceId]),
      maxOutputTokens: DRAFT_LIMITS.maxOutputTokens,
      // Low thinking gave 0 thinking tokens in the spike; they would count against maxOutputTokens.
      thinkingConfig: { thinkingLevel: 'low' },
      mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
    },
  };
}

/**
 * Limits the server enforces on the answer, beyond the response schema
 * (Gemini refuses a schema with many bounded arrays: 400 "invalid argument",
 * checked again on 2026-10-17). Exceeding items are left out and COUNTED.
 */
export const ANSWER_ARRAY_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  models: 6, sections: 16, rows: 40, values: 12, sharedTables: 4, columns: 8, pages: 40, box_2d: 4,
});
const MAX_INTEGER = 100_000;
/**
 * Keeps only what the v3 schema declares: known keys, strings within their
 * maxLength and free of control characters, integers, enum members. A string
 * is never cut (a cut literal would be a wrong value): an invalid item is left
 * out, and counted in `trimmed`. An object missing a required key is left out
 * whole. Returns undefined when the root itself is unusable.
 */
function boundNode(value: unknown, schema: Obj, key: string, trimmed: { count: number }): unknown {
  if (schema.type === 'STRING') {
    if (typeof value !== 'string' || CONTROL.test(value)) return undefined;
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) return undefined;
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return undefined;
    return value;
  }
  if (schema.type === 'INTEGER') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_INTEGER ? value : undefined;
  }
  if (schema.type === 'ARRAY') {
    if (!Array.isArray(value) || !isObj(schema.items)) return undefined;
    const max = Math.min(typeof schema.maxItems === 'number' ? schema.maxItems : Infinity, ANSWER_ARRAY_LIMITS[key] ?? Infinity);
    const items: unknown[] = [];
    for (const item of value) {
      const bounded = items.length < max ? boundNode(item, schema.items, key, trimmed) : undefined;
      if (bounded === undefined) { trimmed.count++; continue; }
      items.push(bounded);
    }
    return typeof schema.minItems === 'number' && items.length < schema.minItems ? undefined : items;
  }
  if (schema.type === 'OBJECT') {
    if (!isObj(value) || !isObj(schema.properties)) return undefined;
    const required = Array.isArray(schema.required) ? schema.required as string[] : [];
    const out: Obj = {};
    for (const [name, child] of Object.entries(schema.properties)) {
      if (!(name in value) || value[name] === null || !isObj(child)) continue;
      const bounded = boundNode(value[name], child, name, trimmed);
      if (bounded === undefined) {
        if (required.includes(name)) return undefined;
        trimmed.count++;
        continue;
      }
      out[name] = bounded;
    }
    return required.every(name => name in out) ? out : undefined;
  }
  return undefined;
}
export function boundFactSheetAnswer(raw: unknown): { readonly sheet: Obj; readonly trimmed: number } | null {
  const trimmed = { count: 0 };
  const sheet = boundNode(raw, factSheetResponseSchemaV3(['arquivo']) as Obj, '', trimmed);
  return isObj(sheet) ? { sheet, trimmed: trimmed.count } : null;
}

export type ExtractionOutcome =
  | { ok: true; sheet: Obj; trimmed: number }
  | { ok: false; reason: DraftErrorReason };
const SAFETY_FINISH = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']);
/** Reads one generateContent envelope: the bounded sheet, or why it cannot be used. */
export function interpretExtractionReply(envelope: unknown): ExtractionOutcome {
  if (!isObj(envelope)) return { ok: false, reason: 'INVALID_JSON' };
  const candidates = Array.isArray(envelope.candidates) ? envelope.candidates : [];
  if (!candidates.length) {
    return { ok: false, reason: isObj(envelope.promptFeedback) && typeof envelope.promptFeedback.blockReason === 'string' ? 'BLOCKED' : 'EMPTY' };
  }
  const candidate = candidates[0];
  if (candidates.length !== 1 || !isObj(candidate)) return { ok: false, reason: 'CONTRACT' };
  const finish = String(candidate.finishReason ?? '');
  if (finish === 'MAX_TOKENS') return { ok: false, reason: 'MAX_TOKENS' };
  if (finish !== 'STOP') return { ok: false, reason: SAFETY_FINISH.has(finish) ? 'SAFETY' : 'CONTRACT' };
  const parts = isObj(candidate.content) && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
  const text = parts.filter(part => isObj(part) && part.thought !== true && typeof part.text === 'string')
    .map(part => (part as Obj).text as string).join('');
  if (!text.trim()) return { ok: false, reason: 'EMPTY' };
  if (text.length > DRAFT_LIMITS.maxAnswerChars) return { ok: false, reason: 'CONTRACT' };
  let output: unknown;
  try { output = JSON.parse(text); } catch { return { ok: false, reason: 'INVALID_JSON' }; }
  const bounded = boundFactSheetAnswer(output);
  return bounded ? { ok: true, ...bounded } : { ok: false, reason: 'CONTRACT' };
}

/** Worst case of one call, reserved before any provider call (fail closed). */
export function extractionReservationMicrousd(): number {
  return geminiCostMicrousd(EXTRACTION_MODEL, DRAFT_LIMITS.maxInputTokens, DRAFT_LIMITS.maxOutputTokens);
}
export function extractionCostMicrousd(usage: { readonly inputTokens: number; readonly outputTokens: number }): number {
  return geminiCostMicrousd(EXTRACTION_MODEL, usage.inputTokens, usage.outputTokens);
}
/**
 * Settlement of the reservation: provider HTTP errors and calls never made
 * are not billed (0); a timeout or network failure during generation may
 * still be billed, so the reservation stays whole; otherwise the real usage,
 * never above the reservation.
 */
export function extractionSettlementMicrousd(reserved: number, outcome:
  | { kind: 'usage'; usage: ComposerUsage } | { kind: 'not_billed' } | { kind: 'unknown' }): number {
  if (outcome.kind === 'not_billed') return 0;
  if (outcome.kind === 'unknown' || !outcome.usage.known) return reserved;
  return Math.min(reserved, extractionCostMicrousd(outcome.usage));
}

/** Budget port, backed by 00028 (reserve_v2 / settle_v1, feature 'extraction'). */
export interface DraftLedgerPort {
  /** A reservation, 'missing' when 00028 is not applied, or null when a ceiling would be crossed. */
  reserve(microusd: number): Promise<{ readonly id: string; readonly microusd: number } | 'missing' | null>;
  settle(id: string, actualMicrousd: number): Promise<void>;
}
export interface CachedExtraction {
  readonly sheet: Obj;
  readonly trimmed: number;
  readonly modelVersion: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
}
/** Extraction cache of 00029 (get_v1 / put_v1). Failures never block an extraction. */
export interface DraftCachePort {
  get(key: ExtractionCacheKey): Promise<CachedExtraction | null>;
  put(key: ExtractionCacheKey, entry: CachedExtraction): Promise<void>;
}
/** Reads the private file; null when it does not exist (or the caller cannot read it). */
export interface DraftSourcePort {
  read(path: string): Promise<Uint8Array | null>;
}
export type DraftFetch = (url: string, init: {
  method: 'GET' | 'POST' | 'DELETE'; headers: Record<string, string>; body?: string | Uint8Array; signal?: AbortSignal;
}) => Promise<Response>;

export interface ExtractionReply {
  readonly promptVersion: string;
  readonly model: string;
  readonly modelVersion: string | null;
  readonly cached: boolean;
  readonly sheet: Obj;
  readonly trimmed: number;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number; readonly estimatedUsd: number };
  readonly ms: number;
}
export type DraftRunResult =
  | { ok: true; extraction: ExtractionReply }
  | { ok: false; status: number; code: DraftErrorCode; reason?: DraftErrorReason };
/** Diagnostics for the local live check only. The Edge Function never logs. */
export interface DraftStepReport {
  readonly step: 'cache' | 'reserve' | 'read' | 'upload' | 'active' | 'count' | 'generate' | 'settle' | 'delete';
  readonly ms: number;
  readonly httpStatus?: number;
  readonly detail?: string | number;
}

const API = 'https://generativelanguage.googleapis.com';
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer));
}
const failureStatus = (code: DraftErrorCode) =>
  code === 'PROVIDER_RATE_LIMIT' ? 429 : code === 'PROVIDER_REJECTED_KEY' ? 503 : 502;
async function readJson(response: Response): Promise<unknown> {
  try { return JSON.parse(await response.text()); } catch { return null; }
}
const isTimeout = (error: unknown) => isObj(error) && (error.name === 'TimeoutError' || error.name === 'AbortError');
/** A port call that never throws (a port may fail synchronously or asynchronously). */
const safely = <T>(work: () => Promise<T>, fallback: T): Promise<T> => Promise.resolve().then(work).catch(() => fallback);

/**
 * The whole provider exchange for one file. One generateContent per file and
 * no automatic repeat: a repeat after a success is free (cache); after a
 * failure the person decides (fewer pages, later).
 */
export async function runFactExtraction(input: {
  request: ExtractFactsRequest;
  key: string;
  ledger: DraftLedgerPort;
  cache: DraftCachePort;
  source: DraftSourcePort;
  fetcher: DraftFetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onStep?: (report: DraftStepReport) => void;
}): Promise<DraftRunResult> {
  const { request, key, ledger, cache, source, fetcher, onStep } = input;
  const now = input.now ?? (() => Date.now());
  const sleep = input.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const started = now(), deadline = started + DRAFT_LIMITS.deadlineMs;
  const left = () => deadline - now();
  const step = async <T>(name: DraftStepReport['step'], work: () => Promise<T>, detail?: (value: T) => DraftStepReport['detail']) => {
    const at = now();
    const value = await work();
    onStep?.({ step: name, ms: now() - at, ...(detail ? { detail: detail(value) } : {}) });
    return value;
  };
  const fail = (status: number, code: DraftErrorCode, reason?: DraftErrorReason): DraftRunResult =>
    ({ ok: false, status, code, ...(reason ? { reason } : {}) });
  const cacheKey = extractionCacheKey(request);

  const hit = await step('cache', () => safely(() => cache.get(cacheKey), null), value => (value ? 'hit' : 'miss'));
  if (hit) {
    return { ok: true, extraction: { promptVersion: EXTRACTION_PROMPT_VERSION, model: EXTRACTION_MODEL,
      modelVersion: hit.modelVersion, cached: true, sheet: hit.sheet, trimmed: hit.trimmed,
      usage: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 }, ms: now() - started } };
  }

  const worstCase = extractionReservationMicrousd();
  const reservation = await step('reserve', () => safely(() => ledger.reserve(worstCase), null), value =>
    (value === 'missing' ? 'missing' : value ? 'ok' : 'refused'));
  if (reservation === 'missing') return fail(503, 'BUDGET_NOT_READY');
  if (!reservation) return fail(429, 'AGENT_DAILY_BUDGET_EXCEEDED');
  const settle = async (amount: number) => {
    await step('settle', () => safely(() => ledger.settle(reservation.id, amount), undefined), () => amount);
  };

  const bytes = await step('read', () => safely(() => source.read(request.source.path), null), value => value?.byteLength ?? 0);
  if (!bytes) { await settle(0); return fail(404, 'SOURCE_NOT_FOUND'); }
  if (bytes.byteLength > DRAFT_LIMITS.maxSourceBytes) { await settle(0); return fail(413, 'SOURCE_TOO_LARGE'); }
  if (await sha256Hex(bytes) !== request.source.sha256) { await settle(0); return fail(409, 'SOURCE_HASH_MISMATCH'); }

  const auth = { 'x-goog-api-key': key };
  let uploaded: { name: string; uri: string } | null = null;
  const providerFailure = async (response: Response, httpStep: DraftStepReport['step']) => {
    const code = providerFailureCode(response.status, await readJson(response));
    onStep?.({ step: httpStep, ms: 0, httpStatus: response.status });
    await settle(0);
    return fail(failureStatus(code), code);
  };
  try {
    // 1. Files API, resumable upload of the raw bytes (no base64).
    let file: Obj;
    try {
      const at = now();
      const start = await fetcher(`${API}/upload/v1beta/files`, { method: 'POST', headers: {
        ...auth, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
        'X-Goog-Upload-Header-Content-Type': request.source.mimeType, 'content-type': 'application/json',
      }, body: JSON.stringify({ file: { display_name: `vnext-${request.source.sha256.slice(0, 12)}` } }),
      signal: AbortSignal.timeout(Math.min(DRAFT_LIMITS.countMs, Math.max(1, left()))) });
      const uploadUrl = start.headers.get('x-goog-upload-url');
      if (!start.ok || !uploadUrl) return await providerFailure(start, 'upload');
      const done = await fetcher(uploadUrl, { method: 'POST', headers: {
        'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize', 'content-type': request.source.mimeType,
      }, body: bytes, signal: AbortSignal.timeout(Math.min(DRAFT_LIMITS.uploadMs, Math.max(1, left()))) });
      if (!done.ok) return await providerFailure(done, 'upload');
      const body = await readJson(done);
      const value = isObj(body) && isObj(body.file) ? body.file : null;
      if (!value || typeof value.name !== 'string' || typeof value.uri !== 'string' || !/^files\/[\w-]+$/u.test(value.name)) {
        await settle(0);
        return fail(502, 'PROVIDER_UNAVAILABLE');
      }
      file = value;
      uploaded = { name: value.name, uri: value.uri };
      onStep?.({ step: 'upload', ms: now() - at, httpStatus: done.status, detail: bytes.byteLength });
    } catch (error) {
      await settle(0);
      return fail(isTimeout(error) ? 504 : 502, isTimeout(error) ? 'EXTRACTION_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
    }

    // 2. Wait until Google has processed the file.
    const activeAt = now();
    let state = typeof file.state === 'string' ? file.state : 'PROCESSING';
    while (state === 'PROCESSING') {
      if (now() - activeAt > DRAFT_LIMITS.fileActiveMs || left() < DRAFT_LIMITS.minGenerateMs) {
        await settle(0);
        return fail(504, 'EXTRACTION_TIMEOUT');
      }
      await sleep(1_000);
      try {
        const status = await fetcher(`${API}/v1beta/${uploaded.name}`, { method: 'GET', headers: auth, signal: AbortSignal.timeout(10_000) });
        const body = await readJson(status);
        state = isObj(body) && typeof body.state === 'string' ? body.state : status.ok ? 'ACTIVE' : 'PROCESSING';
      } catch { /* keep waiting until the limit */ }
    }
    onStep?.({ step: 'active', ms: now() - activeAt, detail: state });
    if (state !== 'ACTIVE') { await settle(0); return fail(422, 'PROVIDER_FILE_FAILED'); }

    // 3. Exact input size before the billed call.
    const generation = buildExtractionGeneration(request, { uri: uploaded.uri, mimeType: request.source.mimeType });
    const endpoint = `${API}/v1beta/models/${EXTRACTION_MODEL}`;
    let tokens: number;
    try {
      const at = now();
      const counted = await fetcher(`${endpoint}:countTokens`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ generateContentRequest: { model: `models/${EXTRACTION_MODEL}`, ...generation } }),
        signal: AbortSignal.timeout(Math.min(DRAFT_LIMITS.countMs, Math.max(1, left()))) });
      if (!counted.ok) return await providerFailure(counted, 'count');
      const body = await readJson(counted);
      const total = isObj(body) ? body.totalTokens : null;
      onStep?.({ step: 'count', ms: now() - at, httpStatus: counted.status, detail: typeof total === 'number' ? total : -1 });
      if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 || total > DRAFT_LIMITS.maxInputTokens) {
        await settle(0);
        return fail(413, 'TOKEN_BUDGET_EXCEEDED');
      }
      tokens = total;
    } catch (error) {
      await settle(0);
      return fail(isTimeout(error) ? 504 : 502, isTimeout(error) ? 'EXTRACTION_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
    }

    // 4. The one billed call.
    const budget = Math.min(DRAFT_LIMITS.generateMaxMs, left());
    if (budget < DRAFT_LIMITS.minGenerateMs) { await settle(0); return fail(504, 'EXTRACTION_TIMEOUT'); }
    const generateAt = now();
    let response: Response;
    try {
      response = await fetcher(`${endpoint}:generateContent`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify(generation), signal: AbortSignal.timeout(budget) });
    } catch (error) {
      // A call cut short may still be billed by Google: the reservation stays whole.
      onStep?.({ step: 'generate', ms: now() - generateAt, detail: isTimeout(error) ? 'timeout' : 'network' });
      await settle(extractionSettlementMicrousd(reservation.microusd, { kind: 'unknown' }));
      return fail(isTimeout(error) ? 504 : 502, isTimeout(error) ? 'EXTRACTION_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
    }
    if (!response.ok) return await providerFailure(response, 'generate');
    const envelope = await readJson(response);
    const usage = readProviderUsage(envelope, tokens, DRAFT_LIMITS.maxOutputTokens);
    const outcome = interpretExtractionReply(envelope);
    onStep?.({ step: 'generate', ms: now() - generateAt, httpStatus: response.status,
      detail: outcome.ok ? 'OK' : outcome.reason });
    await settle(extractionSettlementMicrousd(reservation.microusd, { kind: 'usage', usage }));
    if (!outcome.ok) return fail(502, 'INVALID_PROVIDER_RESPONSE', outcome.reason);
    const modelVersion = isObj(envelope) && typeof envelope.modelVersion === 'string' && envelope.modelVersion.length <= 80
      ? envelope.modelVersion : null;
    const entry: CachedExtraction = { sheet: outcome.sheet, trimmed: outcome.trimmed, modelVersion,
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
    await step('cache', () => safely(() => cache.put(cacheKey, entry), undefined), () => 'stored');
    return { ok: true, extraction: { promptVersion: EXTRACTION_PROMPT_VERSION, model: EXTRACTION_MODEL, modelVersion,
      cached: false, sheet: outcome.sheet, trimmed: outcome.trimmed,
      usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        estimatedUsd: Number((extractionCostMicrousd(usage) / 1e6).toFixed(6)) },
      ms: now() - started } };
  } finally {
    // The file is not kept at Google (it would expire in 48 h anyway); the answer is in the cache.
    if (uploaded) {
      const name = uploaded.name;
      await step('delete', () => fetcher(`${API}/v1beta/${name}`, { method: 'DELETE', headers: auth, signal: AbortSignal.timeout(5_000) })
        .then(response => response.status).catch(() => -1), value => value);
    }
  }
}
