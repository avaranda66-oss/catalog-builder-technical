/**
 * Prova local do Modo rascunho: o handler Edge REAL (supabase/functions/vnext-catalog-draft/index.ts, tarefa
 * interpret_sketch) com o Gemini REAL; Supabase (sessão, perfil, Storage e orçamento) é simulado. Não faz deploy,
 * não altera banco nem segredos.
 *
 * GEMINI_API_KEY no ambiente; nunca em argumento, arquivo ou log (a chave é removida de tudo o que é gravado).
 *   npx vite-node scripts/live-sketch-interpretation.ts -- --out D:/tmp-proofs/rascunho/rodada-1
 *   --replay relê as evidências gravadas, sem chave e sem rede (refaz a pontuação com o código atual).
 * Python + Pillow só reduzem cópias das imagens para lado maior <= 1600 px (o que a tela fará no navegador).
 * Pontuação como no spike (D:/spike-rascunho/RELATORIO.md §3): casamento guloso por tipo com IoU >= 0,4; na lista
 * de acessórios, a decomposição foto + subtítulo + parágrafo também vale como a linha.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { SKETCH_LIMITS, SKETCH_MODEL, normalizeSketchBox, type SketchPagePlan, type SketchRegion } from '../src/vnext/ai-catalog/sketch-plan';
import { snapSketchPlan, type SketchTemplateId } from '../src/vnext/ai-catalog/sketch-snap';

/** US$ 0,30 at the conservative 2027 price (the current promotional price is half). */
export const LIVE_BUDGET_MICROUSD = 300_000;
const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ORIGIN = 'http://localhost:5173';
const SAMPLES = ['capa.png', 'capa_foto.jpg', 'especificacoes.png', 'especificacoes_foto.jpg', 'acessorios.png', 'acessorios_foto.jpg',
  'capa_stress.jpg', 'acessorios_stress.jpg'];
/** The model each sketch must land on (the capa has pills, a callout and the family bar: the PCON cover). */
const EXPECTED: Readonly<Record<string, SketchTemplateId>> = { capa: 'C1', especificacoes: 'P4', acessorios: 'P7' };
type Obj = Record<string, unknown>;
const object = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value);

/** Conservative 2027 price; the current promotional price is exactly half. Includes thinking. */
export function sketchCostMicrousd(input: number, output: number): number {
  if (![input, output].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Contagem de tokens inválida.');
  return Math.ceil(input * 1.5 + output * 7.5);
}

/** Enforces the same cap across all cases, including unknown billed outcomes. */
export class LiveSketchBudget {
  readonly events: { event: 'reserve' | 'settle' | 'deny'; id?: string; microusd: number }[] = [];
  private readonly holds = new Map<string, number>();
  private spent = 0;
  constructor(readonly ceiling = LIVE_BUDGET_MICROUSD) {}
  get outstanding(): number { return [...this.holds.values()].reduce((sum, value) => sum + value, 0); }
  get used(): number { return this.spent + this.outstanding; }
  reserve(microusd: number): string | null {
    if (!Number.isSafeInteger(microusd) || microusd < 0 || this.used + microusd > this.ceiling) {
      this.events.push({ event: 'deny', microusd });
      return null;
    }
    const id = `00000000-0000-4000-8000-${String(this.events.length + 1).padStart(12, '0')}`;
    this.holds.set(id, microusd);
    this.events.push({ event: 'reserve', id, microusd });
    return id;
  }
  settle(id: string, microusd: number): void {
    const held = this.holds.get(id);
    if (held === undefined || !Number.isSafeInteger(microusd) || microusd < 0 || microusd > held) {
      throw new Error('Liquidação inválida; reserva preservada.');
    }
    this.holds.delete(id);
    this.spent += microusd;
    this.events.push({ event: 'settle', id, microusd });
  }
}

/** Refuses unbounded arrays/strings before a paid generateContent call. */
export function boundedSchemaIssues(schema: unknown, path = '$'): string[] {
  if (!object(schema)) return [path];
  const issues: string[] = [];
  if (schema.type === 'STRING' && !(typeof schema.maxLength === 'number' && schema.maxLength > 0)) issues.push(path);
  if (schema.type === 'ARRAY') {
    if (!(typeof schema.maxItems === 'number' && schema.maxItems > 0)) issues.push(path);
    issues.push(...boundedSchemaIssues(schema.items, `${path}[]`));
  }
  if (schema.type === 'OBJECT' && object(schema.properties)) {
    for (const [name, child] of Object.entries(schema.properties)) issues.push(...boundedSchemaIssues(child, `${path}.${name}`));
  }
  return issues;
}

/** Checks every Unicode numeric run and its exact source offsets, without changing text. */
export function confirmationAudit(plan: SketchPagePlan) {
  const fields = plan.regions.flatMap(region => (['text', 'instruction'] as const).map(source => ({ source, regionId: region.id, text: region[source] })));
  const values: { source: 'text' | 'instruction' | 'question'; regionId?: string; questionIndex?: number; text: string }[] = [
    ...fields, ...plan.questions.map((text, questionIndex) => ({ source: 'question' as const, questionIndex, text })),
  ];
  let digitRuns = 0;
  const missing: string[] = [];
  for (const value of values) {
    const digits = [...value.text.matchAll(/\p{N}+/gu)];
    digitRuns += digits.length;
    const confirmation = plan.confirmations.find(item => item.source === value.source && item.regionId === value.regionId
      && item.questionIndex === value.questionIndex && item.text === value.text && item.status === 'confirmar');
    for (const digit of digits) {
      if (!confirmation?.matches.some(match => match.value === digit[0] && match.start === digit.index && match.end === digit.index! + digit[0].length)) {
        missing.push(`${value.regionId ?? `question-${value.questionIndex}`}:${value.source}:${digit.index}`);
      }
    }
  }
  return { digitRuns, confirmedDigitRuns: digitRuns - missing.length, missing, allConfirmed: missing.length === 0 };
}

interface TruthRegion { readonly kind: string; readonly bbox: readonly number[]; readonly text?: string }
type Box = readonly [number, number, number, number];
const iou = (a: Box, b: Box) => {
  const h = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), w = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = h * w, union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
};
/** Spike §3: greedy match by kind and IoU >= 0.4; an accessory `list` row also matches its decomposed texts. */
export function regionRecall(truth: readonly TruthRegion[], predicted: readonly SketchRegion[]) {
  const boxes = truth.map(item => [item.bbox[1], item.bbox[0], item.bbox[3], item.bbox[2]] as Box); // gabarito [x0,y0,x1,y1] 0–1
  const free = new Set(predicted.map(item => item.id));
  let strict = 0, tolerant = 0;
  const misses: string[] = [];
  truth.forEach((item, index) => {
    const best = predicted.filter(region => free.has(region.id) && region.kind === item.kind)
      .map(region => ({ region, score: iou(boxes[index], region.normalizedBox) })).sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= 0.4) { free.delete(best.region.id); strict++; tolerant++; return; }
    if (item.kind === 'list') {
      const box = boxes[index];
      const inside = predicted.filter(region => free.has(region.id) && ['subtitle', 'paragraph', 'list', 'note'].includes(region.kind) && (() => {
        const cy = (region.normalizedBox[0] + region.normalizedBox[2]) / 2, cx = (region.normalizedBox[1] + region.normalizedBox[3]) / 2;
        return cy >= box[0] && cy <= box[2] && cx >= box[1] && cx <= box[3];
      })());
      if (inside.length) {
        const union: Box = [Math.min(...inside.map(r => r.normalizedBox[0])), Math.min(...inside.map(r => r.normalizedBox[1])),
          Math.max(...inside.map(r => r.normalizedBox[2])), Math.max(...inside.map(r => r.normalizedBox[3]))];
        if (iou(box, union) >= 0.4) { inside.forEach(region => free.delete(region.id)); tolerant++; return; }
      }
    }
    misses.push(`${item.kind}:${item.text ?? ''}`);
  });
  return { total: truth.length, strict, tolerant, misses, extraRegions: [...free].length };
}

interface ImageInfo { fileName: string; width: number; height: number; originalWidth: number; originalHeight: number }
interface ProviderCall { step: string; status: number; ms: number; tokens?: { input: number; output: number }; finishReason?: string; envelope?: unknown; error?: string }
interface SketchReply { code: string; reason?: string; sketch?: { plan: SketchPagePlan; attempts: number; dimensions: { width: number; height: number };
  model: string; modelVersion: string | null; promptVersion: string; usage: { inputTokens: number; outputTokens: number; estimatedUsd: number }; ms: number } }
type Handler = (request: Request) => Promise<Response>;

function loadRealHandler(createClient: () => unknown, fetcher: typeof fetch, key: string): Handler {
  let handler: Handler | undefined;
  const env: Record<string, string> = { VNEXT_CATALOG_ALLOWED_ORIGINS: ORIGIN, VNEXT_CATALOG_DRAFT_ENABLED: 'true',
    SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-anon', VNEXT_DRAFT_GEMINI_API_KEY: key };
  const quiet = () => undefined;
  const context = createContext({ Request, Response, Headers, Blob, URL, AbortSignal, DOMException, crypto, setTimeout, TextEncoder,
    console: { log: quiet, info: quiet, warn: quiet, error: quiet, debug: quiet }, Deno: { env: { get: (name: string) => env[name] } }, fetch: fetcher });
  const loaded = new Map<string, Obj>();
  function load(path: string): Obj {
    const existing = loaded.get(path);
    if (existing) return existing;
    const exports: Obj = {};
    loaded.set(path, exports);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const requireModule = (id: string): unknown => {
      if (id.startsWith('https://deno.land/')) return { serve: (entry: Handler) => { handler = entry; } };
      if (id.startsWith('https://esm.sh/@supabase/')) return { createClient };
      if (id.startsWith('.')) return load(resolve(dirname(path), id));
      throw new Error(`Dependência Edge inesperada: ${id}`);
    };
    runInContext(`(function(exports, require, module) {${code}\n})`, context, { filename: path })(exports, requireModule, { exports });
    return exports;
  }
  load(resolve('supabase/functions/vnext-catalog-draft/index.ts'));
  if (!handler) throw new Error('Handler Edge não foi carregado.');
  return handler;
}

async function prepareImages(root: string, out: string): Promise<ImageInfo[]> {
  await mkdir(join(out, 'images'), { recursive: true });
  const python = `import json, os, sys\nfrom PIL import Image, ImageOps\nroot, target = sys.argv[1:3]\nrows=[]\nfor name in sys.argv[3:]:\n with Image.open(os.path.join(root,name)) as original:\n  image=ImageOps.exif_transpose(original).convert('RGB')\n  w,h=image.size\n  image.thumbnail((1600,1600), Image.Resampling.LANCZOS)\n  image.save(os.path.join(target,name), **({'quality':80} if name.endswith('.jpg') else {}))\n  rows.append(dict(fileName=name,width=image.width,height=image.height,originalWidth=w,originalHeight=h))\nprint(json.dumps(rows))`;
  const result = spawnSync(process.env.PYTHON ?? 'python', ['-c', python, root, join(out, 'images'), ...SAMPLES], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('A redução com Python/Pillow falhou; verifique o runtime local.');
  return JSON.parse(result.stdout) as ImageInfo[];
}

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--');
  const option = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const out = option('--out');
  if (!out) throw new Error('Informe --out com uma pasta de evidências fora do repositório.');
  const root = resolve(option('--sketch-root') ?? 'D:/spike-rascunho/sketches');
  const replay = args.includes('--replay');
  const key = process.env.GEMINI_API_KEY?.trim() ?? '';
  if (!replay && key.length < 12) throw new Error('Defina GEMINI_API_KEY no ambiente; ela nunca é impressa.');
  const redact = (text: string) => key ? text.split(key).join('[chave]') : text;
  const save = (path: string, data: unknown) => writeFile(path, redact(JSON.stringify(data, null, 2)), 'utf8');
  await mkdir(join(out, 'raw'), { recursive: true });
  if (!replay) {
    try { await readFile(join(out, 'summary.json')); throw new Error('Esta pasta já contém uma rodada. Use outra pasta ou --replay.'); }
    catch (error) { if (!(object(error) && error.code === 'ENOENT')) throw error; }
  }
  const images = replay ? JSON.parse(await readFile(join(out, 'images.json'), 'utf8')) as ImageInfo[] : await prepareImages(root, out);
  if (!replay) await save(join(out, 'images.json'), images);
  const budget = new LiveSketchBudget();
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const storageReads: string[] = [];
  const createClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: USER, role: 'editor', is_active: true }, error: null }) }) }) }),
    rpc: async (name: string, params: Obj = {}) => {
      if (name === 'vnext_agent_reserve_budget_v2') return { data: budget.reserve(Number(params.p_worst_case_microusd)), error: null };
      if (name === 'vnext_agent_settle_budget_v1') {
        budget.settle(String(params.p_reservation_id), Number(params.p_actual_microusd));
        return { data: true, error: null };
      }
      return { data: null, error: { code: 'PGRST202' } };
    },
    storage: { from: () => ({ download: async (path: string) => {
      storageReads.push(path);
      const bytes = files.get(path);
      return bytes ? { data: new Blob([bytes]), error: null } : { data: null, error: { message: 'not found' } };
    } }) },
  });
  let calls: ProviderCall[] = [];
  let countedTokens = 0, generated = 0;
  const timedFetch: typeof fetch = async (input, init) => {
    const url = String(input), method = init?.method ?? 'GET';
    const step = url.endsWith(':generateContent') ? 'generate' : url.endsWith(':countTokens') ? 'count'
      : method === 'DELETE' ? 'delete' : url.includes('/upload/v1beta/files') ? 'upload-start' : url.includes('upload_id=') ? 'upload-bytes' : 'file-status';
    if (step !== 'delete' && !budget.outstanding) throw new Error('Chamada Google sem reserva de orçamento.');
    if (step === 'generate') {
      const body = JSON.parse(String(init?.body)) as { generationConfig?: { responseSchema?: unknown; maxOutputTokens?: number } };
      const maxOutput = body.generationConfig?.maxOutputTokens ?? 0;
      if (!url.includes(`/models/${SKETCH_MODEL}:`) || ++generated > 2 || countedTokens <= 0
        || maxOutput <= 0 || maxOutput > SKETCH_LIMITS.maxOutputTokens || boundedSchemaIssues(body.generationConfig?.responseSchema).length
        || sketchCostMicrousd(countedTokens, maxOutput) > budget.outstanding) throw new Error('Modelo, schema, tentativas ou orçamento fora dos limites.');
    }
    const started = performance.now();
    let response: Response;
    try { response = await fetch(input, init); }
    catch { calls.push({ step, status: 0, ms: Math.round(performance.now() - started), error: 'Falha de rede; reserva mantida.' }); throw new Error('Falha de rede no provedor.'); }
    const record: ProviderCall = { step, status: response.status, ms: Math.round(performance.now() - started) };
    if (step === 'generate' || step === 'count' || !response.ok) {
      const body: unknown = await response.clone().json().catch(() => null);
      if (step === 'count' && object(body) && Number.isSafeInteger(body.totalTokens)) countedTokens = Number(body.totalTokens);
      if (step === 'generate') {
        record.envelope = body;
        if (object(body) && object(body.usageMetadata)) {
          const usage = body.usageMetadata;
          record.tokens = { input: Number(usage.promptTokenCount ?? 0), output: Number(usage.candidatesTokenCount ?? 0) + Number(usage.thoughtsTokenCount ?? 0) };
        }
        if (object(body) && Array.isArray(body.candidates) && object(body.candidates[0])) record.finishReason = String(body.candidates[0].finishReason ?? '');
      }
      if (!response.ok) record.error = redact(JSON.stringify(body)).slice(0, 300);
    }
    calls.push(record);
    return response;
  };
  const handler = replay ? undefined : loadRealHandler(createClient, timedFetch, key);
  const runs: Obj[] = [];
  console.log('Teto desta execução: US$ 0,30 a preço conservador de 2027. Supabase simulado; Gemini real.');
  for (const image of images) {
    const rawPath = join(out, 'raw', `${image.fileName}.json`);
    let response: { status: number; json: SketchReply; ms: number };
    calls = []; countedTokens = 0; generated = 0;
    if (replay) {
      const saved = JSON.parse(await readFile(rawPath, 'utf8')) as { response: typeof response; calls: ProviderCall[] };
      response = saved.response; calls = saved.calls;
    } else {
      const bytes = new Uint8Array(await readFile(join(out, 'images', image.fileName)));
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const extension = image.fileName.endsWith('.jpg') ? 'jpg' : 'png';
      const path = `${USER}/${sha256}.${extension}`;
      files.set(path, bytes);
      const body = { version: 1, task: 'interpret_sketch', source: { path, sha256, mimeType: extension === 'jpg' ? 'image/jpeg' : 'image/png',
        fileName: image.fileName, pageCount: 1, firstPage: 1, lastPage: 1 } };
      const started = performance.now();
      const result = await handler!(new Request('https://fixture.invalid/functions/v1/vnext-catalog-draft', { method: 'POST',
        headers: { Origin: ORIGIN, Authorization: 'Bearer fixture-authenticated-user', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      response = { status: result.status, json: JSON.parse(redact(await result.text())) as SketchReply, ms: Math.round(performance.now() - started) };
      await save(rawPath, { image, source: body.source, response, calls });
    }
    const sketch = response.json.sketch;
    const base = image.fileName.replace(/\.(png|jpg)$/u, '');
    const truth = JSON.parse(await readFile(join(root, `${base}.json`), 'utf8')) as { regions: TruthRegion[]; annotations?: string[] };
    const expected = EXPECTED[base.split('_')[0]];
    const snap = sketch ? snapSketchPlan(sketch.plan) : undefined;
    const audit = sketch ? confirmationAudit(sketch.plan) : undefined;
    const recall = sketch ? regionRecall(truth.regions, sketch.plan.regions) : undefined;
    const boxesValid = sketch?.plan.regions.every(region => {
      const box = normalizeSketchBox(region.bbox);
      return box && box.normalizedBox.every((coordinate, index) => coordinate === region.normalizedBox[index]);
    }) ?? false;
    const digits = (text: string) => [...text.matchAll(/\p{N}+/gu)].map(match => match[0]);
    const sourceDigits = new Set(digits([...truth.regions.map(region => region.text ?? ''), ...(truth.annotations ?? [])].join(' ')));
    const extraDigits = sketch ? [...new Set(digits([...sketch.plan.regions.flatMap(region => [region.text, region.instruction]), ...sketch.plan.questions].join(' ')))]
      .filter(value => !sourceDigits.has(value)) : [];
    const tokens = calls.reduce((sum, call) => ({ input: sum.input + (call.tokens?.input ?? 0), output: sum.output + (call.tokens?.output ?? 0) }), { input: 0, output: 0 });
    const conservativeCost = sketchCostMicrousd(tokens.input, tokens.output);
    const generateMs = calls.filter(call => call.step === 'generate').reduce((sum, call) => sum + call.ms, 0);
    const run = { sample: image.fileName, image, httpStatus: response.status, code: response.json.code, reason: response.json.reason,
      attempts: sketch?.attempts, ms: response.ms, generateMs, model: sketch?.model, modelVersion: sketch?.modelVersion,
      regions: sketch?.plan.regions.length, recall, rawQuestions: sketch?.plan.questions, questions: snap?.questions.map(item => `${item.kind}: ${item.text}`),
      boxesValid, audit, expectedArchetypeId: expected, snappedArchetypeId: snap?.archetypeId, proposedArchetypeId: snap?.proposedArchetypeId,
      archetypeMatches: snap?.archetypeId === expected, unassigned: snap?.unassignedRegionIds.length, warnings: snap?.warnings,
      extraDigitValues: extraDigits, tokens, costUsdConservative: conservativeCost / 1e6, costUsdCurrent: conservativeCost / 2e6,
      providerCalls: calls.map(call => ({ step: call.step, status: call.status, ms: call.ms, tokens: call.tokens, finishReason: call.finishReason, error: call.error })) };
    runs.push(run);
    console.log(`${image.fileName}: HTTP ${response.status} ${response.json.code}, ${response.ms} ms, ${sketch?.attempts ?? 0} tentativa(s), `
      + `áreas ${recall?.tolerant ?? 0}/${recall?.total ?? 0} (estrito ${recall?.strict ?? 0}), modelo ${snap?.archetypeId ?? 'ausente'} (esperado ${expected}), `
      + `dígitos ${audit?.confirmedDigitRuns ?? 0}/${audit?.digitRuns ?? 0} marcados, dígitos fora do rascunho ${extraDigits.length}, US$ ${(conservativeCost / 2e6).toFixed(5)}.`);
  }
  const summary = { generatedAt: new Date().toISOString(), mode: replay ? 'replay' : 'live-gemini-simulated-supabase', ceilingUsd: budget.ceiling / 1e6,
    budgetUsedConservativeUsd: budget.used / 1e6, budgetEvents: budget.events, storageReads: storageReads.length, runs };
  await save(join(out, replay ? `summary-replay-${Date.now()}.json` : 'summary.json'), summary);
  if (runs.some(run => run.code !== 'OK' || !run.boxesValid || !(run.audit as ReturnType<typeof confirmationAudit> | undefined)?.allConfirmed || !run.archetypeMatches)) {
    process.exitCode = 1;
  }
  console.log(`Evidências: ${out}`);
}

// A script only (vite-node removes the script path from argv, so there is no "is main" check to make).
main().catch(error => {
  const key = process.env.GEMINI_API_KEY?.trim() ?? '';
  const message = error instanceof Error ? error.message : 'A prova falhou.';
  console.error(key ? message.split(key).join('[chave]') : message);
  process.exitCode = 1;
});
