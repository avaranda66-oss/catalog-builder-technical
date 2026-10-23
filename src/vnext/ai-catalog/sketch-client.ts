import { DRAFT_FUNCTION_NAME, DraftRequestError, draftErrorMessage, draftFailure, storeSourceFile, type DraftClient } from './draft-client';
import { SKETCH_SERVER_LIMITS, sketchImageDimensions, type InterpretSketchRequest, type SketchImageDimensions } from './sketch-contract';
import { SKETCH_LIMITS, validateSketchPlan, type SketchPagePlan } from './sketch-plan';
import { snapSketchPlan, type SketchSnapPlan } from './sketch-snap';

/**
 * Browser client of the task `interpret_sketch` (Modo rascunho, Onda 4), in the same pattern as
 * `requestFactExtraction` (draft-client.ts): no credential is sent, the image goes to the private bucket as
 * "<user id>/<sha256>.<ext>", failures come back as allowlisted codes only.
 *
 * The answer is never trusted: the plan is validated again here (sketch-plan.ts) and fitted to the PRESYS
 * models (sketch-snap.ts). The result is a PROPOSAL for the review screen; nothing reaches a catalog from here.
 * Every digit read from the sketch is in `plan.confirmations` with status "confirmar".
 */

export type SketchMimeType = InterpretSketchRequest['source']['mimeType'];
const SKETCH_TYPES: Readonly<Record<string, SketchMimeType>> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
/** Only photos and scans of one page; a PDF, spreadsheet or HEIC is not a sketch. */
export function sketchMimeType(fileName: string, declared = ''): SketchMimeType | null {
  const byName = SKETCH_TYPES[(/\.([a-z0-9]+)$/iu.exec(fileName.trim())?.[1] ?? '').toLowerCase()];
  const byType = Object.values(SKETCH_TYPES).find(type => type === declared);
  if (declared && !byType && !/^application\/octet-stream$/iu.test(declared)) return null;
  if (byName && byType && byName !== byType) return null;
  return byName ?? byType ?? null;
}

/** The size the screen should scale a photo to before sending it (longest side at most 1600 px). */
export function sketchFitSize(width: number, height: number, maxSide: number = SKETCH_LIMITS.maxImageSidePx): SketchImageDimensions {
  if (!(width > 0 && height > 0)) throw new RangeError('SKETCH_SIZE_INVALID');
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

export interface SketchInterpretationRequest {
  readonly path: string;
  readonly sha256: string;
  readonly mimeType: SketchMimeType;
  readonly fileName: string;
}
export interface ServerSketch {
  readonly plan: SketchPagePlan;
  readonly dimensions: SketchImageDimensions;
  readonly attempts: number;
  readonly model: string;
  readonly modelVersion: string | null;
  readonly promptVersion: string;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number; readonly estimatedUsd: number };
  readonly ms: number;
}
export interface SketchInterpretation extends ServerSketch {
  readonly snap: SketchSnapPlan;
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
/** The plan is rebuilt from the server's raw fields and validated again; anything off is INVALID_REPLY. */
function readSketch(data: unknown): ServerSketch | null {
  if (!isRecord(data) || data.code !== 'OK' || !isRecord(data.sketch)) return null;
  const value = data.sketch, plan = isRecord(value.plan) ? value.plan : null;
  if (!plan || typeof value.model !== 'string' || typeof value.promptVersion !== 'string') return null;
  const regions = Array.isArray(plan.regions) ? plan.regions : null;
  const validated = validateSketchPlan({
    archetype: plan.archetype, questions: plan.questions,
    regions: regions?.map(region => isRecord(region)
      ? { kind: region.kind, bbox: region.bbox, text: region.text, instruction: region.instruction } : region),
  });
  const dimensions = isRecord(value.dimensions) ? value.dimensions : {};
  const width = finite(dimensions.width), height = finite(dimensions.height);
  if (!validated.ok || !width || !height || Math.max(width, height) > SKETCH_LIMITS.maxImageSidePx) return null;
  const usage = isRecord(value.usage) ? value.usage : {};
  const attempts = Math.trunc(finite(value.attempts));
  if (attempts < 1 || attempts > SKETCH_SERVER_LIMITS.maxAttempts) return null;
  return {
    plan: validated.plan, dimensions: { width, height }, attempts, model: value.model,
    modelVersion: typeof value.modelVersion === 'string' ? value.modelVersion : null, promptVersion: value.promptVersion,
    usage: { inputTokens: finite(usage.inputTokens), outputTokens: finite(usage.outputTokens), estimatedUsd: finite(usage.estimatedUsd) },
    ms: finite(value.ms),
  };
}

/** Asks the server to read one stored sketch image. Never sends a credential. */
export async function requestSketchInterpretation(client: DraftClient, input: SketchInterpretationRequest): Promise<SketchInterpretation> {
  const body = { version: 1, task: 'interpret_sketch', source: {
    path: input.path, sha256: input.sha256, mimeType: input.mimeType, fileName: input.fileName, pageCount: 1, firstPage: 1, lastPage: 1,
  } };
  let result: Awaited<ReturnType<DraftClient['functions']['invoke']>>;
  try { result = await client.functions.invoke(DRAFT_FUNCTION_NAME, { body }); }
  catch { throw new DraftRequestError('DRAFT_UNAVAILABLE'); }
  if (result.error) throw await draftFailure(result);
  const sketch = readSketch(result.data);
  if (!sketch) throw new DraftRequestError('INVALID_REPLY');
  return { ...sketch, snap: snapSketchPlan(sketch.plan) };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The whole path for one sketch page: checks it here (kind, bytes, real pixel size), stores it privately,
 * asks the server and returns the validated, fitted proposal. The screen scales photos to `sketchFitSize` first.
 */
export async function interpretSketchFromFile(client: DraftClient, input: {
  readonly userId: string;
  readonly file: { readonly name: string; readonly type?: string; readonly bytes: ArrayBuffer | Uint8Array };
}): Promise<SketchInterpretation> {
  const mimeType = sketchMimeType(input.file.name, input.file.type ?? '');
  if (!mimeType) throw new DraftRequestError('SOURCE_KIND_NOT_ALLOWED');
  const bytes = input.file.bytes instanceof Uint8Array ? input.file.bytes : new Uint8Array(input.file.bytes);
  if (bytes.byteLength > SKETCH_SERVER_LIMITS.maxImageBytes) throw new DraftRequestError('SOURCE_TOO_LARGE');
  const dimensions = sketchImageDimensions(bytes, mimeType);
  if (!dimensions) throw new DraftRequestError('INVALID_REQUEST');
  if (Math.max(dimensions.width, dimensions.height) > SKETCH_LIMITS.maxImageSidePx) throw new DraftRequestError('SOURCE_TOO_LARGE');
  const sha256 = await sha256Hex(bytes);
  const stored = await storeSourceFile(client, { userId: input.userId, fileName: input.file.name, mimeType, bytes, sha256 });
  return requestSketchInterpretation(client, { path: stored.path, sha256, mimeType, fileName: input.file.name });
}

/** Plain Portuguese for a sketch failure: the extraction messages, with the ones that speak of PDFs or pages adapted. */
export function sketchErrorMessage(error: unknown): string {
  const code = error instanceof DraftRequestError ? error.code : undefined;
  const unchanged = ' Nada foi alterado no catálogo.';
  switch (code) {
    case 'SOURCE_KIND_NOT_ALLOWED': return `O rascunho precisa ser uma foto ou imagem (JPG, PNG ou WebP) de uma página só.${unchanged}`;
    case 'SOURCE_TOO_LARGE': return `A imagem do rascunho é grande demais. Use uma foto de até ${SKETCH_LIMITS.maxImageSidePx} pixels no lado maior.${unchanged}`;
    case 'INVALID_REQUEST': return `Não foi possível ler esta imagem. Tire outra foto do rascunho e tente de novo.${unchanged}`;
    case 'TOKEN_BUDGET_EXCEEDED':
    case 'EXTRACTION_TIMEOUT': return `A IA demorou demais para ler o rascunho. Tente de novo em instantes.${unchanged}`;
    case 'PROVIDER_FILE_FAILED': return `O Google não conseguiu abrir esta imagem. Tire outra foto do rascunho e tente de novo.${unchanged}`;
    case 'INVALID_PROVIDER_RESPONSE': return `A IA não conseguiu entender o desenho desta vez. Tente de novo; se repetir, tire uma foto mais nítida, de frente para a folha.${unchanged}`;
    default: return draftErrorMessage(error);
  }
}
