/**
 * FR-66: local live check of the REAL vnext-catalog-draft handler (Deno
 * source transpiled into a VM, like the unit tests) against the real Gemini
 * API, with Supabase simulated (auth, profile, 00028 budget, 00029 cache and
 * the private bucket). Then the browser review verifies every value against
 * the PDF's own text and the result is compared with the hand-checked keys:
 * the spike's (docs/ai-catalog/spike-extracao/gabarito.json) and the shared
 * tables' (docs/ai-catalog/extracao-servidor/gabarito-tabelas-comuns.json).
 * Tooling only: never imported by the app, so it never reaches the bundle.
 *
 *   GEMINI_API_KEY=... npx vite-node scripts/live-draft-extraction.ts -- \
 *     --pdf-root "<pasta CONFIGURATOR PCON>" --out <pasta> [--only ta-manual-pt,y17-folder]
 *
 * --replay reviews the answers saved in <out>/raw again (no API call, no key).
 *
 * The key is read only from GEMINI_API_KEY, goes only into the simulated
 * Edge environment, and is never printed or written (any echo is replaced).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { extractPdfText, type ExtractedPdf } from '../src/vnext/ai-catalog/pdf-intake';
import { canonicalDegreeSign, reviewExtraction, reviewSourceValues, type ExtractionReview } from '../src/vnext/ai-catalog/extraction-review';
import { divergenceMessage, findSourceDivergences, normalizeSymbolText } from '../src/vnext/ai-catalog/fact-extraction';
import { isVerifiedStatus } from '../src/vnext/ai-catalog/contracts';
import { GroundTruthSchema, summarizeAgainstTruth } from './extract-facts-eval';

const TA = ['TA-25N', 'TA-35N', 'TA-50N'];
const SOURCES = [
  { id: 'ta-folder', path: 'catalogospdf/presys-ta-folder (4).pdf', pages: [9, 13] as const, models: TA },
  { id: 'ta-manual-pt', path: 'banhos-termicos-tipo-bloco-seco-ta-25n-ta-35n-ta-50n-industrial-avancada-manual (1).pdf',
    pages: [5, 8] as const, models: TA },
  { id: 'y17-folder', path: 'presyspdfs/pressure-controller-pcon-y17-folder.pdf', pages: [11, 11] as const, models: ['PCON-Y17'] },
];
/** gemini-3.8-flash until 2026-12-31 (spike FR-66a); the app reserves at the 2027 price (fail closed). */
const PRICE_NOW = { input: 0.75, output: 3.75 };
const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ORIGIN = 'http://localhost:5173';

const args = process.argv.slice(2).filter(arg => arg !== '--');
const option = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const pdfRoot = option('--pdf-root'), out = option('--out');
const only = option('--only')?.split(',');
if (!pdfRoot || !out) throw new Error('Use: --pdf-root <pasta> --out <pasta> [--only id,id]');
const replay = args.includes('--replay');
const key = process.env.GEMINI_API_KEY?.trim() ?? '';
if (!replay && key.length < 12) throw new Error('Defina GEMINI_API_KEY no ambiente (a chave nunca é impressa).');
const redact = (text: string) => (key ? text.split(key).join('[chave]') : text);
await mkdir(join(out, 'raw'), { recursive: true });

// ---- Simulated Supabase -----------------------------------------------------
const files = new Map<string, Uint8Array>();
const cache = new Map<string, unknown>();
const ledger: { reserved: number[]; settled: number[] } = { reserved: [], settled: [] };
const createClient = () => ({
  auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: USER, role: 'editor', is_active: true }, error: null }) }) }) }),
  rpc: async (name: string, params: Record<string, unknown> = {}) => {
    const cacheKey = JSON.stringify(['p_sha256', 'p_first_page', 'p_last_page', 'p_llm_model', 'p_prompt_version', 'p_models_key']
      .map(field => params[field]));
    if (name === 'vnext_source_extraction_get_v1') return { data: cache.get(cacheKey) ?? null, error: null };
    if (name === 'vnext_source_extraction_put_v1') {
      if (!cache.has(cacheKey)) cache.set(cacheKey, { answer: params.p_answer, trimmed: params.p_trimmed, model_version: params.p_model_version,
        input_tokens: params.p_input_tokens, output_tokens: params.p_output_tokens });
      return { data: true, error: null };
    }
    if (name === 'vnext_agent_reserve_budget_v2') {
      ledger.reserved.push(Number(params.p_worst_case_microusd));
      return { data: `00000000-0000-4000-8000-${String(ledger.reserved.length).padStart(12, '0')}`, error: null };
    }
    if (name === 'vnext_agent_settle_budget_v1') { ledger.settled.push(Number(params.p_actual_microusd)); return { data: true, error: null }; }
    if (name === 'vnext_agent_budget_status_v1') return { data: [{ remaining_user_day_microusd: 3_000_000, remaining_org_month_microusd: 60_000_000 }], error: null };
    return { data: null, error: { code: 'PGRST202' } };
  },
  storage: { from: () => ({ download: async (path: string) => {
    const bytes = files.get(path);
    return bytes ? { data: new Blob([bytes]), error: null } : { data: null, error: { message: 'not found' } };
  } }) },
});

// ---- Real Google, timed, never printing the key -------------------------------
interface ProviderCall { step: string; status: number; ms: number; usage?: unknown; finishReason?: string; error?: string }
let calls: ProviderCall[] = [];
const label = (url: string, method: string) => url.includes('/upload/v1beta/files') ? 'upload-start'
  : !url.includes('generativelanguage') ? 'upload-bytes' : method === 'DELETE' ? 'delete'
    : url.endsWith(':countTokens') ? 'count' : url.endsWith(':generateContent') ? 'generate' : 'file-status';
const timedFetch = async (url: string, init: RequestInit & { method: string }) => {
  const started = performance.now();
  const response = await fetch(url, init);
  const step = label(url, init.method);
  const record: ProviderCall = { step, status: response.status, ms: Math.round(performance.now() - started) };
  if (step === 'generate' || !response.ok) {
    const body = await response.clone().json().catch(() => null) as Record<string, any> | null;
    if (body?.usageMetadata) record.usage = body.usageMetadata;
    if (body?.candidates?.[0]?.finishReason) record.finishReason = body.candidates[0].finishReason;
    if (!response.ok) record.error = redact(String(body?.error?.message ?? '')).slice(0, 200);
  }
  calls.push(record);
  return response;
};

// ---- The Edge entry, as the unit tests load it ---------------------------------
type Handler = (request: Request) => Promise<Response>;
let handler!: Handler;
const env: Record<string, string> = { VNEXT_CATALOG_ALLOWED_ORIGINS: ORIGIN, VNEXT_CATALOG_DRAFT_ENABLED: 'true',
  SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-anon', VNEXT_DRAFT_GEMINI_API_KEY: key };
const context = createContext({ Request, Response, Headers, Blob, URL, AbortSignal, DOMException, crypto, setTimeout, TextEncoder,
  console, Deno: { env: { get: (name: string) => env[name] } }, fetch: timedFetch });
const loaded = new Map<string, Record<string, unknown>>();
function load(path: string): Record<string, unknown> {
  const cached = loaded.get(path);
  if (cached) return cached;
  const exports: Record<string, unknown> = {};
  loaded.set(path, exports);
  const code = ts.transpileModule(await_read(path), { fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireModule = (id: string) => {
    if (id.startsWith('https://deno.land/')) return { serve: (fn: Handler) => { handler = fn; } };
    if (id.startsWith('https://esm.sh/@supabase/')) return { createClient };
    if (id.startsWith('.')) return load(resolve(dirname(path), id));
    throw new Error('dependency ' + id);
  };
  runInContext(`(function (exports, require, module) {${code}\n})`, context, { filename: path })(exports, requireModule, { exports });
  return exports;
}
const sourceTexts = new Map<string, string>();
function await_read(path: string): string {
  const text = sourceTexts.get(path);
  if (text === undefined) throw new Error('not preloaded ' + path);
  return text;
}
async function preload(path: string): Promise<void> {
  if (sourceTexts.has(path)) return;
  const text = await readFile(path, 'utf8');
  sourceTexts.set(path, text);
  for (const match of text.matchAll(/from '(\.[^']+)'/gu)) await preload(resolve(dirname(path), match[1]));
}
const entry = resolve('supabase/functions/vnext-catalog-draft/index.ts');
await preload(entry);
load(entry);

// ---- Hand-checked keys --------------------------------------------------------
const truth = GroundTruthSchema.parse(JSON.parse(await readFile('docs/ai-catalog/spike-extracao/gabarito.json', 'utf8')));
interface SharedTruth { tables: { page: number; title: string; columns: string[]; rowKey: string;
  rows: { label: string; values: Record<string, string>; alsoAccept?: Record<string, string[]> }[] }[] }
const sharedTruth = JSON.parse(await readFile('docs/ai-catalog/extracao-servidor/gabarito-tabelas-comuns.json', 'utf8')) as SharedTruth;
const fold = (text: string) => canonicalDegreeSign(normalizeSymbolText(text)).normalize('NFC').replace(/\s+/gu, ' ').trim();
const foldName = (text: string) => fold(text).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
const PUA = /[-]/u;

function judgeShared(review: ExtractionReview) {
  const results: { table: string; page: number; cells: number; verifiedCorrect: number; wrongVerified: string[]; unmatchedVerified: string[];
    toCheck: number; unverified: number; pua: number }[] = [];
  for (const table of review.tables.filter(item => item.kind === 'shared')) {
    const page = table.report.values.flatMap(value => value.candidates.map(item => item.source.page))[0] ?? 0;
    const key = sharedTruth.tables.find(item => item.page === page);
    const columnOf = (column: string) => key?.columns.find(name => foldName(column).startsWith(foldName(name)));
    const rows = new Map<string, typeof table.report.values[number][]>();
    for (const value of table.report.values) rows.set(`${value.sectionId}/${value.rowId}`, [...(rows.get(`${value.sectionId}/${value.rowId}`) ?? []), value]);
    const outcome = { table: table.title, page, cells: key ? key.rows.length * key.columns.length : 0, verifiedCorrect: 0,
      wrongVerified: [] as string[], unmatchedVerified: [] as string[], toCheck: 0, unverified: 0, pua: 0 };
    const correctCells = new Set<string>();
    for (const values of rows.values()) {
      const label = values[0].label;
      let candidates = key?.rows.filter(row => foldName(row.label) === foldName(label)) ?? [];
      if (candidates.length > 1 && key) {
        const keyValue = values.find(value => columnOf(value.model) === key.rowKey)?.candidates[0]?.value;
        if (keyValue) candidates = candidates.filter(row => fold(row.values[key.rowKey]) === fold(keyValue));
      }
      for (const value of values) {
        if (value.status === 'VISUAL_ONLY' || value.status === 'CONFLICT') outcome.toCheck++;
        if (value.status === 'UNVERIFIED') outcome.unverified++;
        if (!isVerifiedStatus(value.status)) continue;
        const literal = value.candidates[value.selected ?? 0].value;
        if (PUA.test(literal)) outcome.pua++;
        const column = columnOf(value.model);
        const text = `${label} · ${value.model} = ${literal}`;
        if (candidates.length !== 1 || !column) { outcome.unmatchedVerified.push(text); continue; }
        const expected = [candidates[0].values[column], ...(candidates[0].alsoAccept?.[column] ?? [])];
        if (expected.some(item => fold(item) === fold(literal))) {
          outcome.verifiedCorrect++;
          correctCells.add(`${key!.rows.indexOf(candidates[0])}/${column}`);
        } else outcome.wrongVerified.push(`${text} (esperado: ${expected.join(' | ')})`);
      }
    }
    results.push({ ...outcome, verifiedCorrect: correctCells.size });
  }
  return results;
}

// ---- Run ------------------------------------------------------------------------
const call = async (body: unknown) => {
  const started = performance.now();
  const response = await handler(new Request('https://fixture.invalid/functions/v1/vnext-catalog-draft', {
    method: 'POST', headers: { Origin: ORIGIN, Authorization: 'Bearer live', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const text = await response.text();
  if (key && text.includes(key)) throw new Error('A resposta da função trouxe a chave: abortado.');
  return { status: response.status, json: JSON.parse(text) as Record<string, any>, ms: Math.round(performance.now() - started) };
};
if (!replay) {
  const status = await call({ version: 1, task: 'status' });
  console.log(`status: HTTP ${status.status}, ${JSON.stringify(status.json.status)}`);
}

const runs: Record<string, unknown>[] = [];
const reviews = new Map<string, { review: ExtractionReview; pdf: ExtractedPdf; fileName: string }>();
for (const source of SOURCES.filter(item => !only || only.includes(item.id))) {
  const bytes = new Uint8Array(await readFile(resolve(pdfRoot, source.path)));
  const fileName = source.path.split('/').pop()!;
  const pdf = await extractPdfText(fileName, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const path = `${USER}/${pdf.sha256}.pdf`;
  files.set(path, bytes);
  const body = { version: 1, task: 'extract_facts', models: source.models, source: { path, sha256: pdf.sha256,
    mimeType: 'application/pdf', fileName, pageCount: pdf.pageCount, firstPage: source.pages[0], lastPage: source.pages[1] } };
  for (const attempt of replay ? ['first'] as const : ['first', 'cache'] as const) {
    calls = [];
    const rawPath = join(out, 'raw', `${source.id}.json`);
    const reply = replay ? { status: 200, ms: 0, json: { code: 'OK', extraction: JSON.parse(await readFile(rawPath, 'utf8')) } as Record<string, any> }
      : await call(body);
    if (!replay && attempt === 'first' && reply.json.code === 'OK') await writeFile(rawPath, redact(JSON.stringify(reply.json.extraction, null, 1)));
    const record: Record<string, unknown> = { source: source.id, attempt, httpStatus: reply.status, code: reply.json.code,
      reason: reply.json.reason, msTotal: reply.ms, megabytes: Number((bytes.byteLength / 1048576).toFixed(2)), providerCalls: calls };
    if (reply.json.code === 'OK') {
      const extraction = reply.json.extraction;
      const usage = extraction.usage as { inputTokens: number; outputTokens: number; estimatedUsd: number };
      record.cached = extraction.cached;
      record.modelVersion = extraction.modelVersion;
      record.trimmed = extraction.trimmed;
      record.tokens = { input: usage.inputTokens, output: usage.outputTokens };
      record.costUsdNow = Number(((usage.inputTokens * PRICE_NOW.input + usage.outputTokens * PRICE_NOW.output) / 1e6).toFixed(5));
      record.costUsdReserved2027 = usage.estimatedUsd;
      if (attempt === 'first') {
        const review = reviewExtraction(extraction.sheet, { sourceId: source.id, fileName, sha256: pdf.sha256, pageCount: pdf.pageCount,
          firstPage: source.pages[0], lastPage: source.pages[1] }, pdf, { models: source.models, trimmedByServer: extraction.trimmed });
        reviews.set(source.id, { review, pdf, fileName });
        const modelTruth = summarizeAgainstTruth(reviewSourceValues(review), truth, [source.id]);
        const puaVerified = review.tables.flatMap(table => table.report.values).filter(value => isVerifiedStatus(value.status) &&
          PUA.test(value.candidates[value.selected ?? 0].value)).length;
        Object.assign(record, {
          counts: review.counts, summary: review.summary, pages: review.pages.map(item => item.message), dropped: review.dropped.length,
          tables: review.tables.map(table => ({ kind: table.kind, title: table.title, columns: table.columns, counts: table.report.counts })),
          modelTable: { wrongVerified: modelTruth.wrongVerified.map(item => `${item.value.model} · ${item.value.label} = ${item.value.value} (${item.note})`),
            unmatchedVerified: modelTruth.unmatchedVerified.map(item => `${item.value.model} · ${item.value.label} = ${item.value.value} (${item.note})`),
            wrongCaught: modelTruth.wrongCaught.length, coverage: modelTruth.coverage },
          sharedTables: judgeShared(review), verifiedWithPrivateUseCharacter: puaVerified,
        });
      }
    }
    runs.push(record);
    console.log(`${source.id} ${attempt}: HTTP ${reply.status} ${reply.json.code}${reply.json.reason ? ' ' + reply.json.reason : ''}, ` +
      `${reply.ms} ms, chamadas Google: ${calls.map(item => `${item.step}=${item.status}/${item.ms}ms`).join(' ') || 'nenhuma'}` +
      (record.tokens ? `, tokens ${JSON.stringify(record.tokens)}, US$ ${record.costUsdNow} (reserva 2027: ${record.costUsdReserved2027})` : ''));
  }
}

const folder = reviews.get('ta-folder'), manual = reviews.get('ta-manual-pt');
const divergences = folder && manual ? findSourceDivergences([...reviewSourceValues(folder.review), ...reviewSourceValues(manual.review)]) : [];
const names = new Map([...reviews].map(([id, item]) => [id, item.fileName]));
const summary = { generatedAt: new Date().toISOString(), ledger, runs,
  divergences: divergences.map(item => ({ model: item.model, key: item.key, field: item.field, message: divergenceMessage(item, names) })) };
await writeFile(join(out, 'summary.json'), redact(JSON.stringify(summary, null, 2)));
for (const run of runs.filter(item => item.attempt === 'first' && item.code === 'OK')) {
  console.log(`\n${run.source}: ${run.summary}`);
  for (const line of run.pages as string[]) console.log(`  ${line}`);
  console.log(`  tabela de modelos x gabarito do spike: ${JSON.stringify(run.modelTable)}`);
  for (const shared of run.sharedTables as unknown[]) console.log(`  tabela comum x gabarito: ${JSON.stringify(shared)}`);
  console.log(`  VERIFIED com caractere privado: ${run.verifiedWithPrivateUseCharacter}`);
}
console.log(`\nDivergências folder x manual: ${divergences.length}`);
for (const item of summary.divergences) console.log(`  ${item.model} · ${item.key} (${item.field})`);
console.log(`Orçamento: reservado ${ledger.reserved.join(', ')} µUSD; liquidado ${ledger.settled.join(', ')} µUSD`);
console.log(`Resumo em ${join(out, 'summary.json')}`);
