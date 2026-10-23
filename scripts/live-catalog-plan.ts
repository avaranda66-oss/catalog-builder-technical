/**
 * FR-70: local live check of "Montar catálogo a partir destes arquivos" with the REAL vnext-catalog-draft handler
 * (Deno source transpiled into a VM, like the unit tests) against the real Gemini API, with Supabase simulated
 * (auth, profile, 00028 budget, private bucket). The chain is the app's own:
 *   PDF read here -> extract_facts (spec pages) -> review against the PDF text -> fact set ->
 *   plan_draft (page texts + checked facts) -> every literal checked here -> pages compiled -> applied on a
 *   blank catalog in ONE transaction -> one Desfazer.
 * Then an audit: every run with a digit on the applied pages must be printed in the PDF (or be the model's own
 * fixed text). Tooling only: never imported by the app.
 *
 *   GEMINI_API_KEY=... npx vite-node scripts/live-catalog-plan.ts -- --pdf "<presys-ta-folder (4).pdf>" --out <pasta> \
 *     [--pages 9-9] [--models TA-25N,TA-35N,TA-50N] [--reuse-extraction] [--replay]
 *
 * --replay checks the answers saved in <out> again (no API call, no key). The key is read only from
 * GEMINI_API_KEY, goes only into the simulated Edge environment, and is never printed or written.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { createCatalogDocument, createDocumentSession } from '../src/vnext/application';
import { CatalogDocumentSchema, type Page } from '../src/vnext/domain';
import { buildPresysArchetypePage, PRESYS_ARCHETYPES } from '../src/vnext/library/presys-archetypes';
import { createPresysPageTemplateRegistry } from '../src/vnext/library/presys-ta25n-starter';
import { extractPdfText } from '../src/vnext/ai-catalog/pdf-intake';
import { reviewExtraction } from '../src/vnext/ai-catalog/extraction-review';
import { factSetFromReviews, openPendingCount, pendingFacts } from '../src/vnext/ai-catalog/draft-compiler';
import { CatalogDraftPlanSchema } from '../src/vnext/ai-catalog/contracts';
import {
  buildPlanBrief, catalogPlanEntries, checkCatalogPlan, defaultSelection, matchableText, reviewPlanPages, type PlanSourceFile,
} from '../src/vnext/ai-catalog/catalog-plan';
import { applyPagePlan, compilePagePlan, undoPagePlan } from '../src/vnext/ai-catalog/page-plan-apply';

if (!globalThis.crypto) (globalThis as { crypto: unknown }).crypto = webcrypto;
const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ORIGIN = 'http://localhost:5173';
/** gemini-3.8-flash until 2026-12-31; the app reserves at the 2027 price (fail closed). */
const PRICE_NOW = { input: 0.75, output: 3.75 };

const args = process.argv.slice(2).filter(arg => arg !== '--');
const option = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const pdfPath = option('--pdf'), out = option('--out');
if (!pdfPath || !out) throw new Error('Use: --pdf <arquivo.pdf> --out <pasta> [--pages 9-9] [--models a,b]');
const [firstPage, lastPage] = (option('--pages') ?? '9-9').split('-').map(Number);
const models = (option('--models') ?? 'TA-25N,TA-35N,TA-50N').split(',').map(item => item.trim()).filter(Boolean);
const replay = args.includes('--replay');
/** Reuses the saved extract_facts answer (only plan_draft is called again). */
const reuseExtraction = replay || args.includes('--reuse-extraction');
const key = process.env.GEMINI_API_KEY?.trim() ?? '';
if (!replay && key.length < 12) throw new Error('Defina GEMINI_API_KEY no ambiente (a chave nunca é impressa).');
const redact = (text: string) => (key ? text.split(key).join('[chave]') : text);
await mkdir(out, { recursive: true });

// ---- Simulated Supabase -----------------------------------------------------
const files = new Map<string, Uint8Array>();
const ledger: { reserved: number[]; settled: number[] } = { reserved: [], settled: [] };
const createClient = () => ({
  auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: USER, role: 'editor', is_active: true }, error: null }) }) }) }),
  rpc: async (name: string, params: Record<string, unknown> = {}) => {
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
    return bytes ? { data: new Blob([bytes as Uint8Array<ArrayBuffer>]), error: null } : { data: null, error: { message: 'not found' } };
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
    const body = await response.clone().json().catch(() => null) as {
      usageMetadata?: unknown; candidates?: { finishReason?: string }[]; error?: { message?: string };
    } | null;
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
const context = createContext({ Request, Response, Headers, Blob, URL, AbortSignal, DOMException, crypto: globalThis.crypto, setTimeout,
  TextEncoder, console, Deno: { env: { get: (name: string) => env[name] } }, fetch: timedFetch });
const sources = new Map<string, string>();
async function preload(path: string): Promise<void> {
  if (sources.has(path)) return;
  const text = await readFile(path, 'utf8');
  sources.set(path, text);
  for (const match of text.matchAll(/from '(\.[^']+)'/gu)) await preload(resolve(dirname(path), match[1]));
}
const loaded = new Map<string, Record<string, unknown>>();
function load(path: string): Record<string, unknown> {
  const cached = loaded.get(path);
  if (cached) return cached;
  const exports: Record<string, unknown> = {};
  loaded.set(path, exports);
  const code = ts.transpileModule(sources.get(path)!, { fileName: path,
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
const entry = resolve('supabase/functions/vnext-catalog-draft/index.ts');
await preload(entry);
load(entry);
const call = async (body: unknown) => {
  const started = performance.now();
  calls = [];
  const response = await handler(new Request('https://fixture.invalid/functions/v1/vnext-catalog-draft', {
    method: 'POST', headers: { Origin: ORIGIN, Authorization: 'Bearer live', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const text = await response.text();
  if (key && text.includes(key)) throw new Error('A resposta da função trouxe a chave: abortado.');
  return { status: response.status, json: JSON.parse(text) as Record<string, unknown>, ms: Math.round(performance.now() - started), calls };
};
const costNow = (usage: { inputTokens: number; outputTokens: number }) =>
  Number(((usage.inputTokens * PRICE_NOW.input + usage.outputTokens * PRICE_NOW.output) / 1e6).toFixed(5));

// ---- 1. The PDF, read here -----------------------------------------------------
const bytes = new Uint8Array(await readFile(pdfPath));
const fileName = basename(pdfPath);
const pdf = await extractPdfText(fileName, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
const path = `${USER}/${pdf.sha256}.pdf`;
files.set(path, bytes);
const steps: Record<string, unknown>[] = [];

// ---- 2. extract_facts on the specification pages ------------------------------
const source = { path, sha256: pdf.sha256, mimeType: 'application/pdf', fileName, pageCount: pdf.pageCount, firstPage, lastPage };
const extractionFile = join(out, 'extracao-bruta.json');
const extraction = reuseExtraction ? JSON.parse(await readFile(extractionFile, 'utf8'))
  : await (async () => {
    const reply = await call({ version: 1, task: 'extract_facts', models, source });
    steps.push({ step: 'extract_facts', httpStatus: reply.status, code: reply.json.code, ms: reply.ms, providerCalls: reply.calls });
    if (reply.json.code !== 'OK') throw new Error(`extract_facts: ${reply.json.code} ${reply.json.reason ?? ''}`);
    await writeFile(extractionFile, redact(JSON.stringify(reply.json.extraction, null, 1)));
    return reply.json.extraction;
  })();
const review = reviewExtraction(extraction.sheet, { sourceId: 'arquivo-1', fileName, sha256: pdf.sha256, pageCount: pdf.pageCount,
  firstPage, lastPage }, pdf, { models, trimmedByServer: extraction.trimmed });
const set = factSetFromReviews([review]);
console.log(`extract_facts: ${review.summary}`);

// ---- 3. plan_draft ---------------------------------------------------------------
const planFiles: PlanSourceFile[] = [{ id: 'arquivo-1', fileName, pdf }];
const built = buildPlanBrief({ files: planFiles, set });
const planFile = join(out, 'plano-bruto.json');
const started = performance.now();
const server = replay ? JSON.parse(await readFile(planFile, 'utf8'))
  : await (async () => {
    const reply = await call({ version: 1, task: 'plan_draft', brief: built.brief });
    steps.push({ step: 'plan_draft', httpStatus: reply.status, code: reply.json.code, reason: reply.json.reason, ms: reply.ms,
      providerCalls: reply.calls, requestChars: JSON.stringify(built.brief).length });
    if (reply.json.code !== 'OK') {
      console.log(redact(JSON.stringify(reply.calls)));
      throw new Error(`plan_draft: ${reply.json.code} ${reply.json.reason ?? ''}`);
    }
    await writeFile(planFile, redact(JSON.stringify(reply.json.plan, null, 1)));
    return reply.json.plan;
  })();
const plan = CatalogDraftPlanSchema.parse(server.plan);
const checked = checkCatalogPlan(plan, { files: planFiles, set, facts: built.facts });

// ---- 4. Compile, apply in ONE transaction, Desfazer ------------------------------
let serial = 0;
const createId = () => `doc-${(++serial).toString(36).padStart(5, '0')}`;
const session = createDocumentSession(createCatalogDocument(createId, 'Série TA'), { createId, templateRegistry: createPresysPageTemplateRegistry() });
const before = session.getSnapshot().document;
const compileAt = performance.now();
const compiled = compilePagePlan(before, catalogPlanEntries(checked, defaultSelection(checked), set));
const outcome = applyPagePlan(session, compiled);
const applyMs = Math.round(performance.now() - compileAt);
if (!outcome.ok) throw new Error(outcome.message);
const after = session.getSnapshot().document;
const valid = CatalogDocumentSchema.safeParse(after).success;
const pageReviews = reviewPlanPages(checked, compiled);

// ---- 5. Audit: no digit on the pages that is not printed in the PDF --------------------
const plainOf = (pageItem: Page) => pageItem.objects.flatMap(object => {
  if (object.type === 'text') return [object.text.paragraphs.map(p => p.inlines.map(i => i.kind === 'text' ? i.text : '').join('')).join('\n')];
  if (object.type === 'table') {
    return [...object.table.cells.flatMap(cell => cell.content.type === 'richText'
      ? [cell.content.value.paragraphs.map(p => p.inlines.map(i => i.kind === 'text' ? i.text : '').join('')).join(' ')] : []),
    ...object.table.annotations.map(note => note.text.paragraphs.map(p => p.inlines.map(i => i.kind === 'text' ? i.text : '').join('')).join(' ')),
    ...(object.table.title ? [object.table.title.paragraphs.map(p => p.inlines.map(i => i.kind === 'text' ? i.text : '').join('')).join(' ')] : [])];
  }
  return [];
});
const pdfText = matchableText(pdf.pages.map(item => item.text).join('\n'));
const pdfCompact = pdfText.replace(/\s+/gu, '');
const fixed = new Set(PRESYS_ARCHETYPES.flatMap(archetype => plainOf(buildPresysArchetypePage(archetype.id, { pageId: `fixo-${archetype.id}` }))));
const fixedText = [...fixed].join('\n');
const digitRuns: { page: number; run: string; inPdf: boolean; fixed: boolean }[] = [];
after.pages.forEach((pageItem, index) => {
  for (const text of plainOf(pageItem)) {
    if (fixed.has(text)) continue;
    for (const match of text.matchAll(/[^\s]*\p{Nd}[^\s]*/gu)) {
      const run = matchableText(match[0]).replace(/^[([“"']+|[)\]”"',.;:]+$/gu, '');
      const inPdf = pdfText.includes(run) || pdfCompact.includes(run.replace(/\s+/gu, ''));
      digitRuns.push({ page: index + 1, run, inPdf, fixed: !inPdf && fixedText.includes(run) });
    }
  }
});
const invented = digitRuns.filter(item => !item.inPdf && !item.fixed);
const undone = undoPagePlan(session, outcome.applied) && JSON.stringify(session.getSnapshot().document) === JSON.stringify(before);

// ---- Report ----------------------------------------------------------------------------
const pages = checked.pages.map((pageItem, index) => ({
  n: index + 1, kind: pageItem.kind, model: pageItem.archetype, addedByApp: pageItem.addedByApp, purpose: pageItem.purpose,
  sources: pageItem.sources, specTable: pageItem.specTable,
  fields: pageItem.fields.map(field => ({ slot: field.slot, status: field.status, text: field.text, table: field.table, message: field.message,
    literals: field.uses.map(use => ({ text: use.ok ? use.text : use.copied, ok: use.ok, where: use.where })) })),
  ...pageReviews.find(item => item.key === pageItem.key),
}));
const usage = server.usage as { inputTokens: number; outputTokens: number; estimatedUsd: number };
const extractionUsage = extraction.usage as { inputTokens: number; outputTokens: number; estimatedUsd: number };
const pending = pendingFacts(set);
const report = {
  generatedAt: new Date().toISOString(), file: fileName, pageCount: pdf.pageCount, specPages: [firstPage, lastPage], models,
  extraction: { summary: review.summary, counts: review.counts, tokens: { input: extractionUsage.inputTokens, output: extractionUsage.outputTokens },
    costUsdNow: costNow(extractionUsage), pendingFacts: openPendingCount(pending) },
  plan: { model: server.model, modelVersion: server.modelVersion, promptVersion: server.promptVersion, trimmed: server.trimmed,
    briefChars: JSON.stringify(built.brief).length, briefFacts: built.brief.facts.length, shortenedPages: built.shortenedPages,
    tokens: { input: usage.inputTokens, output: usage.outputTokens }, costUsdNow: costNow(usage), costUsdReserved2027: usage.estimatedUsd,
    ms: Math.round(server.ms ?? performance.now() - started), questions: checked.questions, counts: checked.counts },
  application: { pagesCreated: outcome.applied.pageIds.length, documentValid: valid, ms: applyMs, message: outcome.applied.message,
    oneUndoRestoresBlankCatalog: undone },
  audit: { digitRuns: digitRuns.length, inPdf: digitRuns.filter(item => item.inPdf).length, fixedText: digitRuns.filter(item => item.fixed).length,
    notInPdf: invented },
  totalCostUsdNow: Number((costNow(usage) + costNow(extractionUsage)).toFixed(5)),
  ledger, steps, pages,
};
await writeFile(join(out, 'relatorio.json'), redact(JSON.stringify(report, null, 2)));
console.log(`plan_draft: ${checked.pages.length} páginas, literais conferidos ${checked.counts.checked}, não achados ${checked.counts.notFound}, `
  + `campos rejeitados ${checked.counts.rejected}; tokens ${usage.inputTokens}/${usage.outputTokens}, US$ ${costNow(usage)} (reserva 2027 ${usage.estimatedUsd})`);
for (const item of pages) {
  console.log(`  ${item.n}. ${item.kind}${item.addedByApp ? ' (do app)' : ''}: ${item.fields.map(field => `${field.slot}=${field.status}`).join(', ') || (item.specTable ? 'tabela dos fatos' : '—')}`);
}
console.log(`Aplicado: ${outcome.applied.message} (${applyMs} ms, documento válido: ${valid}); um Desfazer volta ao catálogo vazio: ${undone}`);
console.log(`Auditoria: ${digitRuns.length} trechos com algarismo nas páginas; no PDF ${report.audit.inPdf}; texto fixo do modelo ${report.audit.fixedText}; fora do PDF ${invented.length}`);
for (const item of invented) console.log(`  FORA DO PDF: p. ${item.page} “${item.run}”`);
console.log(`Total US$ ${report.totalCostUsdNow}. Relatório em ${join(out, 'relatorio.json')}`);
