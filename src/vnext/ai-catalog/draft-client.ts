import { isDraftErrorCode, isDraftErrorReason, type DraftErrorCode, type DraftErrorReason } from './draft-codes';
import {
  DRAFT_LIMITS, SOURCE_FILES_BUCKET, SOURCE_MIME_TYPES, sourceStoragePath, type SourceMimeType,
} from './draft-contract';
import { reviewExtraction, type ExtractionReview } from './extraction-review';
import { PLAN_LIMITS, parsePlanDraftRequest, type PlanBrief } from './catalog-plan-contract';
import { CatalogDraftPlanSchema, type CatalogDraftPlan } from './contracts';
import type { ExtractedPdf } from './pdf-intake';

/**
 * Browser client of the vnext-catalog-draft Edge Function (FR-66).
 *
 * - Sends NO credential: extraction always uses the server key.
 * - Only PDFs and photos go to the private bucket; spreadsheets (XLSX, CSV)
 *   are refused here and are read only in the browser.
 * - Server and provider failures come back as allowlisted codes only, mapped
 *   to plain Portuguese by `draftErrorMessage`; provider text never shows.
 * - The answer is never trusted: `extractFactsFromFile` verifies it against
 *   the file's own text read in this browser (extraction-review.ts).
 */

export const DRAFT_FUNCTION_NAME = 'vnext-catalog-draft';

export interface DraftClient {
  readonly functions: {
    invoke(name: string, options: { readonly body: unknown }): Promise<{
      readonly data: unknown; readonly error: unknown; readonly response?: unknown;
    }>;
  };
  readonly storage: {
    from(bucket: string): {
      upload(path: string, body: ArrayBuffer | Uint8Array | Blob, options: {
        readonly contentType: string; readonly upsert: false; readonly cacheControl?: string;
      }): Promise<{ readonly data: unknown; readonly error: unknown }>;
    };
  };
}

/** Codes the browser can show: the server's allowlist plus local ones. */
export type DraftClientCode = DraftErrorCode
  | 'NETWORK' | 'DRAFT_UNAVAILABLE' | 'INVALID_REPLY' | 'SOURCE_KIND_NOT_ALLOWED' | 'SOURCE_UPLOAD_FAILED' | 'PAGE_RANGE_INVALID';
/** A draft failure carrying ONLY allowlisted data (code, reason, HTTP status). */
export class DraftRequestError extends Error {
  readonly code: DraftClientCode;
  readonly reason?: DraftErrorReason;
  readonly httpStatus?: number;
  constructor(code: DraftClientCode, reason?: DraftErrorReason, httpStatus?: number) {
    super(code);
    this.name = 'DraftRequestError';
    this.code = code;
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

const SPREADSHEET = /\.(xlsx|xlsm|xls|csv|tsv|ods)$/iu;
const EXTENSION_TYPES: Readonly<Record<string, SourceMimeType>> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};
/** The kind of file that may go to the server, or null (spreadsheets, HEIC, anything else). */
export function sourceMimeType(fileName: string, declared = ''): SourceMimeType | null {
  if (SPREADSHEET.test(fileName.trim())) return null;
  const byName = EXTENSION_TYPES[(/\.([a-z0-9]+)$/iu.exec(fileName.trim())?.[1] ?? '').toLowerCase()];
  const byType = (SOURCE_MIME_TYPES as readonly string[]).includes(declared) ? declared as SourceMimeType : undefined;
  if (declared && !byType && !/^application\/octet-stream$/iu.test(declared)) return null;
  if (byName && byType && byName !== byType) return null;
  return byName ?? byType ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const byteLength = (bytes: ArrayBuffer | Uint8Array) => bytes.byteLength;
const isAlreadyStored = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const value = error as { statusCode?: unknown; status?: unknown; message?: unknown; error?: unknown };
  return String(value.statusCode ?? value.status ?? '') === '409' ||
    /already exists|duplicate/iu.test(`${String(value.message ?? '')} ${String(value.error ?? '')}`);
};

/**
 * Stores a PDF or photo in the private bucket as "<user id>/<sha256>.<ext>",
 * never overwriting: the same name always holds the same bytes, so a file
 * already stored is simply reused.
 */
export async function storeSourceFile(client: DraftClient, input: {
  readonly userId: string; readonly fileName: string; readonly mimeType?: string;
  readonly bytes: ArrayBuffer | Uint8Array; readonly sha256: string;
}): Promise<{ readonly path: string; readonly mimeType: SourceMimeType }> {
  const mimeType = sourceMimeType(input.fileName, input.mimeType ?? '');
  if (!mimeType) throw new DraftRequestError('SOURCE_KIND_NOT_ALLOWED');
  if (!UUID.test(input.userId) || !SHA256.test(input.sha256)) throw new DraftRequestError('SOURCE_UPLOAD_FAILED');
  if (byteLength(input.bytes) > DRAFT_LIMITS.maxSourceBytes) throw new DraftRequestError('SOURCE_TOO_LARGE');
  const path = sourceStoragePath(input.userId, input.sha256, mimeType);
  let result: { readonly error: unknown };
  try {
    result = await client.storage.from(SOURCE_FILES_BUCKET).upload(path, input.bytes, { contentType: mimeType, upsert: false });
  } catch {
    throw new DraftRequestError('NETWORK');
  }
  if (result.error && !isAlreadyStored(result.error)) throw new DraftRequestError('SOURCE_UPLOAD_FAILED');
  return { path, mimeType };
}

async function readJsonBody(candidate: unknown): Promise<unknown> {
  if (!candidate || typeof candidate !== 'object') return null;
  const clone = (candidate as { clone?: () => unknown }).clone?.();
  const target = clone && typeof clone === 'object' ? clone : candidate;
  const read = (target as { json?: () => Promise<unknown> }).json;
  if (typeof read !== 'function') return null;
  try { return await read.call(target); } catch { return null; }
}
/** The allowlisted code of a supabase-js functions.invoke failure. */
export async function draftFailure(result: { readonly error: unknown; readonly response?: unknown }): Promise<DraftRequestError> {
  const error = result.error as { name?: unknown; context?: unknown } | null;
  if (error && typeof error === 'object' && error.name === 'FunctionsFetchError') return new DraftRequestError('NETWORK');
  const response = (error && typeof error === 'object' ? error.context : undefined) ?? result.response;
  const status = response && typeof response === 'object' && typeof (response as { status?: unknown }).status === 'number'
    ? (response as { status: number }).status : undefined;
  const body = await readJsonBody(response);
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
  const reason = body && typeof body === 'object' ? (body as { reason?: unknown }).reason : undefined;
  return new DraftRequestError(isDraftErrorCode(code) ? code : 'DRAFT_UNAVAILABLE',
    isDraftErrorReason(reason) ? reason : undefined, status);
}

export interface FactExtractionRequest {
  readonly path: string;
  readonly sha256: string;
  readonly mimeType: SourceMimeType;
  readonly fileName: string;
  readonly pageCount: number;
  readonly firstPage: number;
  readonly lastPage: number;
  /** Products to extract, exactly as printed; empty lets the model list them. */
  readonly models?: readonly string[];
}
export interface ServerExtraction {
  readonly promptVersion: string;
  readonly model: string;
  readonly modelVersion: string | null;
  readonly cached: boolean;
  /** The model's bounded answer: untrusted until `reviewExtraction` verifies it. */
  readonly sheet: Record<string, unknown>;
  readonly trimmed: number;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number; readonly estimatedUsd: number };
  readonly ms: number;
}

const finite = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function readExtraction(data: unknown): ServerExtraction | null {
  if (!isRecord(data) || data.code !== 'OK' || !isRecord(data.extraction)) return null;
  const value = data.extraction;
  if (!isRecord(value.sheet) || typeof value.promptVersion !== 'string' || typeof value.model !== 'string') return null;
  const usage = isRecord(value.usage) ? value.usage : {};
  return {
    promptVersion: value.promptVersion, model: value.model,
    modelVersion: typeof value.modelVersion === 'string' ? value.modelVersion : null,
    cached: value.cached === true, sheet: value.sheet, trimmed: Math.trunc(finite(value.trimmed)),
    usage: { inputTokens: finite(usage.inputTokens), outputTokens: finite(usage.outputTokens), estimatedUsd: finite(usage.estimatedUsd) },
    ms: finite(value.ms),
  };
}

/** Asks the server to read one stored file. Never sends a credential. */
export async function requestFactExtraction(client: DraftClient, input: FactExtractionRequest): Promise<ServerExtraction> {
  const { firstPage, lastPage, pageCount } = input;
  if (![firstPage, lastPage, pageCount].every(Number.isInteger) || firstPage < 1 || firstPage > lastPage || lastPage > pageCount ||
    lastPage - firstPage + 1 > DRAFT_LIMITS.maxRangePages) throw new DraftRequestError('PAGE_RANGE_INVALID');
  const body = {
    version: 1, task: 'extract_facts', models: [...(input.models ?? [])],
    source: { path: input.path, sha256: input.sha256, mimeType: input.mimeType, fileName: input.fileName,
      pageCount, firstPage, lastPage },
  };
  let result: Awaited<ReturnType<DraftClient['functions']['invoke']>>;
  try { result = await client.functions.invoke(DRAFT_FUNCTION_NAME, { body }); }
  catch { throw new DraftRequestError('DRAFT_UNAVAILABLE'); }
  if (result.error) throw await draftFailure(result);
  const extraction = readExtraction(result.data);
  if (!extraction) throw new DraftRequestError('INVALID_REPLY');
  return extraction;
}

/** A photo as evidence: one page without text, so every value goes to a person (VISUAL_ONLY). */
export function photoEvidence(fileName: string, sha256: string): ExtractedPdf {
  return { fileName, sha256, pageCount: 1, truncated: false,
    pages: [{ number: 1, text: '', textLength: 0, needsVisualExtraction: true, visualReasons: ['no-text'] }] };
}

/**
 * The whole path for one file: store it privately, ask the server to read the
 * chosen pages, then verify the answer here against `pdf` (pdf-intake of the
 * same bytes, or `photoEvidence` for a photo).
 */
export async function extractFactsFromFile(client: DraftClient, input: {
  readonly userId: string;
  readonly file: { readonly name: string; readonly type?: string; readonly bytes: ArrayBuffer | Uint8Array };
  readonly pdf: ExtractedPdf;
  readonly firstPage: number;
  readonly lastPage: number;
  readonly models?: readonly string[];
  readonly sourceId?: string;
}): Promise<{ readonly review: ExtractionReview; readonly extraction: ServerExtraction }> {
  const stored = await storeSourceFile(client, { userId: input.userId, fileName: input.file.name,
    ...(input.file.type ? { mimeType: input.file.type } : {}), bytes: input.file.bytes, sha256: input.pdf.sha256 });
  const extraction = await requestFactExtraction(client, {
    path: stored.path, sha256: input.pdf.sha256, mimeType: stored.mimeType, fileName: input.file.name,
    pageCount: input.pdf.pageCount, firstPage: input.firstPage, lastPage: input.lastPage, ...(input.models ? { models: input.models } : {}),
  });
  const review = reviewExtraction(extraction.sheet, {
    sourceId: input.sourceId ?? 'arquivo', fileName: input.file.name, sha256: input.pdf.sha256,
    pageCount: input.pdf.pageCount, firstPage: input.firstPage, lastPage: input.lastPage,
  }, input.pdf, { ...(input.models ? { models: input.models } : {}), trimmedByServer: extraction.trimmed });
  return { review, extraction };
}

/** The catalog plan as the server returned it, parsed again here; still UNTRUSTED (catalog-plan.ts checks it). */
export interface ServerCatalogPlan {
  readonly plan: CatalogDraftPlan;
  readonly trimmed: number;
  readonly model: string;
  readonly modelVersion: string | null;
  readonly promptVersion: string;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number; readonly estimatedUsd: number };
  readonly ms: number;
}
function readCatalogPlan(data: unknown): ServerCatalogPlan | null {
  if (!isRecord(data) || data.code !== 'OK' || !isRecord(data.plan)) return null;
  const value = data.plan;
  const parsed = CatalogDraftPlanSchema.safeParse(value.plan);
  if (!parsed.success || typeof value.promptVersion !== 'string' || typeof value.model !== 'string') return null;
  const usage = isRecord(value.usage) ? value.usage : {};
  return {
    plan: parsed.data, trimmed: Math.trunc(finite(value.trimmed)), model: value.model, promptVersion: value.promptVersion,
    modelVersion: typeof value.modelVersion === 'string' ? value.modelVersion : null,
    usage: { inputTokens: finite(usage.inputTokens), outputTokens: finite(usage.outputTokens), estimatedUsd: finite(usage.estimatedUsd) },
    ms: finite(value.ms),
  };
}

/**
 * FR-70: asks the server for a catalog plan from the page texts read here and the checked facts. Never sends a
 * credential or a file: only the bounded brief, checked with the server's own parser before it leaves.
 */
export async function requestCatalogPlan(client: DraftClient, brief: PlanBrief): Promise<ServerCatalogPlan> {
  const body = { version: 1, task: 'plan_draft', brief };
  if (!parsePlanDraftRequest(body) || JSON.stringify(body).length > PLAN_LIMITS.maxBodyChars) {
    throw new DraftRequestError('PAYLOAD_TOO_LARGE');
  }
  let result: Awaited<ReturnType<DraftClient['functions']['invoke']>>;
  try { result = await client.functions.invoke(DRAFT_FUNCTION_NAME, { body }); }
  catch { throw new DraftRequestError('DRAFT_UNAVAILABLE'); }
  if (result.error) throw await draftFailure(result);
  const plan = readCatalogPlan(result.data);
  if (!plan) throw new DraftRequestError('INVALID_REPLY');
  return plan;
}

export type DraftReadiness =
  | { readonly kind: 'ready'; readonly remainingMicrousd: number | null; readonly callReserveMicrousd: number | null;
      /** FR-70: the deployed function knows `plan_draft` (absent: an older deploy that does not). */
      readonly planning?: boolean;
      /** Modo rascunho: the deployed function knows `interpret_sketch` (absent: an older deploy that does not). */
      readonly sketching?: boolean }
  | { readonly kind: 'blocked'; readonly code: DraftClientCode };
/** Free check (no provider call, no budget): can reading files start now? */
export async function readDraftReadiness(client: DraftClient): Promise<DraftReadiness> {
  let result: Awaited<ReturnType<DraftClient['functions']['invoke']>>;
  try { result = await client.functions.invoke(DRAFT_FUNCTION_NAME, { body: { version: 1, task: 'status' } }); }
  catch { return { kind: 'blocked', code: 'DRAFT_UNAVAILABLE' }; }
  if (result.error) return { kind: 'blocked', code: (await draftFailure(result)).code };
  const status = isRecord(result.data) && isRecord(result.data.status) ? result.data.status : null;
  if (!status) return { kind: 'blocked', code: 'DRAFT_UNAVAILABLE' };
  if (status.serverKey !== true) return { kind: 'blocked', code: 'PROVIDER_NOT_CONFIGURED' };
  if (status.budget === 'missing') return { kind: 'blocked', code: 'BUDGET_NOT_READY' };
  const remaining = typeof status.remainingMicrousd === 'number' ? status.remainingMicrousd : null;
  const reserve = typeof status.callReserveMicrousd === 'number' ? status.callReserveMicrousd : null;
  if (remaining !== null && reserve !== null && remaining < reserve) return { kind: 'blocked', code: 'AGENT_DAILY_BUDGET_EXCEEDED' };
  return { kind: 'ready', remainingMicrousd: remaining, callReserveMicrousd: reserve,
    ...(Array.isArray(status.tasks)
      ? { planning: status.tasks.includes('plan_draft'), sketching: status.tasks.includes('interpret_sketch') } : {}) };
}

/** Plain Portuguese for every outcome, each with what to do next. No codes, no provider text. */
const UNCHANGED = ' Nada foi alterado no catálogo.';
const MESSAGES: Record<DraftClientCode, string> = {
  DRAFT_DISABLED: 'A leitura de arquivos pela IA está desligada no servidor. Continue montando o catálogo à mão; o administrador pode ligá-la.',
  SERVER_NOT_CONFIGURED: 'O servidor da IA não está completo. Fale com o administrador e continue montando o catálogo à mão.',
  UNAUTHENTICATED: 'Sua sessão expirou. Entre de novo no aplicativo e tente outra vez.',
  FORBIDDEN: 'Sua conta não tem permissão para usar a IA. Fale com o administrador.',
  INVALID_ORIGIN: 'Este endereço do aplicativo não está liberado para a IA. Use o endereço oficial ou fale com o administrador.',
  METHOD_NOT_ALLOWED: 'Não foi possível falar com a IA agora. Tente de novo em instantes.',
  PAYLOAD_TOO_LARGE: 'O pedido ficou grande demais. Escolha menos páginas e tente de novo.',
  INVALID_REQUEST: 'A IA não aceitou este pedido. Confira as páginas escolhidas e tente de novo.',
  PROVIDER_NOT_CONFIGURED: 'A IA do servidor ainda não foi configurada. Fale com o administrador.',
  BUDGET_NOT_READY: 'O controle de gastos da IA ainda não foi atualizado no servidor, por isso a leitura de arquivos não pode começar. Fale com o administrador.',
  AGENT_DAILY_BUDGET_EXCEEDED: 'O limite de uso da IA foi atingido. Continue montando o catálogo à mão hoje; amanhã o limite renova.',
  SOURCE_NOT_FOUND: 'O arquivo não chegou ao servidor. Escolha o arquivo de novo e tente outra vez.',
  SOURCE_HASH_MISMATCH: 'O arquivo guardado no servidor é diferente do que você escolheu. Escolha o arquivo de novo e tente outra vez.',
  SOURCE_TOO_LARGE: 'Este arquivo passa de 50 MB, o máximo aceito. Use uma versão menor do PDF.',
  TOKEN_BUDGET_EXCEEDED: 'Este arquivo é grande demais para a IA ler de uma vez. Escolha menos páginas (só as de especificações) e tente de novo.',
  PROVIDER_FILE_FAILED: 'O Google não conseguiu abrir este arquivo. Confira se ele abre normalmente no computador e tente de novo.',
  EXTRACTION_TIMEOUT: 'A IA demorou demais para ler o arquivo. Escolha menos páginas e tente de novo.',
  PROVIDER_RATE_LIMIT: 'O serviço do Google está ocupado. Espere um minuto e tente de novo.',
  PROVIDER_REJECTED_KEY: 'O Google recusou a chave da IA do servidor. Fale com o administrador.',
  PROVIDER_UNAVAILABLE: 'O serviço de IA não respondeu agora. Verifique a internet e tente de novo em instantes.',
  INVALID_PROVIDER_RESPONSE: 'A IA respondeu de um jeito que não pôde ser usado. Tente de novo; se repetir, escolha menos páginas.',
  INVALID_REPLY: 'A IA respondeu de um jeito que não pôde ser usado. Tente de novo em instantes.',
  NETWORK: 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
  DRAFT_UNAVAILABLE: 'A leitura de arquivos pela IA ainda não está disponível. Continue montando o catálogo à mão.',
  SOURCE_KIND_NOT_ALLOWED: 'A IA só lê PDFs e fotos (JPG, PNG ou WebP). Planilhas do Excel ou CSV não são enviadas: elas são lidas aqui mesmo, no seu computador.',
  SOURCE_UPLOAD_FAILED: 'Não foi possível guardar o arquivo no servidor. Tente de novo em instantes.',
  PAGE_RANGE_INVALID: `Escolha de 1 a ${DRAFT_LIMITS.maxRangePages} páginas que existam no arquivo, da primeira para a última.`,
};

export function draftErrorMessage(error: unknown): string {
  const failure = error instanceof DraftRequestError ? error : new DraftRequestError('INVALID_REPLY');
  let message = MESSAGES[failure.code];
  if (failure.code === 'PROVIDER_UNAVAILABLE' && failure.httpStatus === 429) message = MESSAGES.PROVIDER_RATE_LIMIT;
  if (failure.code === 'INVALID_PROVIDER_RESPONSE' && failure.reason === 'MAX_TOKENS') {
    message = 'Essas páginas têm valores demais para uma leitura só. Escolha menos páginas e tente de novo.';
  }
  if (failure.code === 'INVALID_PROVIDER_RESPONSE' && (failure.reason === 'SAFETY' || failure.reason === 'BLOCKED')) {
    message = 'A IA não quis ler este arquivo. Confira se é o arquivo certo e tente de novo.';
  }
  return message + UNCHANGED;
}

export function draftReadinessText(readiness: DraftReadiness | undefined): string {
  if (!readiness) return 'Verificando a leitura de arquivos…';
  return readiness.kind === 'ready' ? 'Leitura de arquivos pronta.' : MESSAGES[readiness.code];
}
