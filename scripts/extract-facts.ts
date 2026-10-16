/**
 * FR-66a: local fact-extraction spike (go/no-go). Sends real PDFs to Gemini,
 * turns each answer into a FactProposal and runs the FR-67 verifier against
 * the PDF's own text (pdf-intake), then compares every value with the
 * hand-checked answer key. Spike tooling: run with vite-node, never imported
 * by the app, so it never reaches the bundle.
 *
 *   GEMINI_API_KEY=... npx vite-node scripts/extract-facts.ts -- \
 *     --plan docs/ai-catalog/spike-extracao/plan.json --pdf-root "<pasta dos PDFs>" --out <pasta>
 *
 * The key is read only from the GEMINI_API_KEY environment variable, sent only
 * in the x-goog-api-key header, and never printed or written (any echo of it in
 * an error is replaced). --replay recomputes everything from saved answers in
 * <out>/raw without calling the API; --dry-run only reads the PDFs and prints
 * the prompt size.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { extractPdfText, type ExtractedPdf } from '../src/vnext/ai-catalog/pdf-intake';
import { pdfEvidenceSource, verificationMessage, verifyFactProposal, type FactVerificationReport } from '../src/vnext/ai-catalog/fact-verifier';
import {
  FACT_EXTRACTION_PROMPT_VERSION, buildFactExtractionPrompt, divergenceMessage, factSheetResponseSchema,
  findSourceDivergences, fitQuotesToPages, sourceFactValues, toFactProposal, withNormalizedSymbols,
  type ExtractionSource, type SourceDivergence, type SourceFactValue,
} from '../src/vnext/ai-catalog/fact-extraction';
import {
  GEMINI_PRICES, GroundTruthSchema, SpikePlanSchema, estimateCostUsd, parseCliArgs, summarizeAgainstTruth,
  type GroundTruth, type SpikePlan, type TokenUsage, type TruthSummary,
} from './extract-facts-eval';

const API = 'https://generativelanguage.googleapis.com';
const INLINE_LIMIT = 18 * 1024 * 1024; // inline requests are capped at 20 MB in total
const CALL_TIMEOUT_MS = 240_000;

const options = parseCliArgs(process.argv.slice(2).filter(arg => arg !== '--'));
const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
const redact = (text: string) => (apiKey ? text.split(apiKey).join('[chave]') : text);
const plan: SpikePlan = SpikePlanSchema.parse(JSON.parse(await readFile(options.plan, 'utf8')));
const truth: GroundTruth | undefined = plan.truth
  ? GroundTruthSchema.parse(JSON.parse(await readFile(plan.truth, 'utf8'))) : undefined;
const llms = plan.llms.filter(llm => !options.only || options.only.includes(llm.id));
const rawDir = join(options.out, 'raw');
await mkdir(rawDir, { recursive: true });

interface LoadedSource { readonly info: ExtractionSource; readonly pdf: ExtractedPdf; readonly bytes: Buffer; readonly models: readonly string[] }
const sources: LoadedSource[] = [];
for (const item of plan.sources) {
  const path = isAbsolute(item.path) || !options.pdfRoot ? item.path : resolve(options.pdfRoot, item.path);
  const bytes = await readFile(path);
  const fileName = path.split(/[\\/]/u).pop() ?? item.id;
  // The answer's Symbol-font signs are normalized (toFactProposal), so the evidence text is too.
  const pdf = withNormalizedSymbols(
    await extractPdfText(fileName, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
  if (item.pages[1] > pdf.pageCount) throw new Error(`${item.id}: o arquivo tem ${pdf.pageCount} páginas`);
  if (truth) {
    const expected = truth.sources.find(source => source.sourceId === item.id)?.sha256;
    if (expected && expected !== pdf.sha256) throw new Error(`${item.id}: o arquivo não é o mesmo do gabarito (sha256)`);
  }
  sources.push({ bytes, pdf, models: item.models, info: {
    sourceId: item.id, fileName, sha256: pdf.sha256, pageCount: pdf.pageCount, firstPage: item.pages[0], lastPage: item.pages[1],
  } });
  const range = pdf.pages.slice(item.pages[0] - 1, item.pages[1]);
  console.log(`${item.id}: ${fileName}, ${pdf.pageCount} páginas, ${(bytes.byteLength / 1048576).toFixed(1)} MB, ` +
    `páginas ${item.pages[0]}-${item.pages[1]} com texto nativo: ${range.filter(page => !page.needsVisualExtraction).length}/${range.length}`);
}

interface CallRecord {
  readonly llm: string;
  readonly sourceId: string;
  readonly run: number;
  readonly promptVersion: string;
  readonly ok: boolean;
  readonly httpStatus?: number;
  readonly error?: string;
  readonly finishReason?: string;
  readonly modelVersion?: string;
  readonly usage?: TokenUsage & { readonly promptTokensDetails?: unknown };
  readonly ms?: number;
  readonly uploadMs?: number;
  readonly transport: 'inline' | 'files-api';
  readonly text?: string;
}
const rawName = (llm: string, sourceId: string, run: number) => join(rawDir, `${llm}__${sourceId}__r${run}.json`);

async function uploadToFilesApi(source: LoadedSource): Promise<{ uri: string; name: string; ms: number }> {
  const started = performance.now();
  const start = await fetch(`${API}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(source.bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': 'application/pdf', 'content-type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: source.info.sourceId } }),
  });
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!start.ok || !uploadUrl) throw new Error(`FILES_API_START_${start.status}`);
  const done = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize', 'content-type': 'application/pdf' },
    body: new Uint8Array(source.bytes),
  });
  const file = (await done.json() as { file?: { uri?: string; name?: string; state?: string } }).file;
  if (!done.ok || !file?.uri || !file.name) throw new Error(`FILES_API_UPLOAD_${done.status}`);
  for (let attempt = 0; file.state === 'PROCESSING' && attempt < 60; attempt++) {
    await new Promise(wait => setTimeout(wait, 2000));
    const status = await fetch(`${API}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': apiKey } });
    file.state = (await status.json() as { state?: string }).state;
  }
  if (file.state && file.state !== 'ACTIVE') throw new Error(`FILES_API_STATE_${file.state}`);
  return { uri: file.uri, name: file.name, ms: Math.round(performance.now() - started) };
}

const uploads = new Map<string, Promise<{ uri: string; name: string; ms: number }>>();
async function callGemini(llm: SpikePlan['llms'][number], source: LoadedSource, run: number): Promise<CallRecord> {
  const transport = source.bytes.byteLength > INLINE_LIMIT ? 'files-api' : 'inline';
  const base = { llm: llm.id, sourceId: source.info.sourceId, run, promptVersion: FACT_EXTRACTION_PROMPT_VERSION, transport } as const;
  try {
    let filePart: Record<string, unknown>, uploadMs: number | undefined;
    if (transport === 'files-api') {
      if (!uploads.has(source.info.sourceId)) uploads.set(source.info.sourceId, uploadToFilesApi(source));
      const uploaded = await uploads.get(source.info.sourceId)!;
      filePart = { fileData: { mimeType: 'application/pdf', fileUri: uploaded.uri } };
      uploadMs = uploaded.ms;
    } else {
      filePart = { inlineData: { mimeType: 'application/pdf', data: source.bytes.toString('base64') } };
    }
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [filePart, { text: buildFactExtractionPrompt({ sources: [source.info], models: source.models }) }] }],
      generationConfig: {
        temperature: plan.temperature, candidateCount: 1, responseMimeType: 'application/json',
        responseSchema: factSheetResponseSchema([source.info.sourceId]), maxOutputTokens: plan.maxOutputTokens,
        ...(llm.thinkingLevel ? { thinkingConfig: { thinkingLevel: llm.thinkingLevel } } : {}),
        ...(plan.mediaResolution ? { mediaResolution: plan.mediaResolution } : {}),
      },
    });
    for (let attempt = 1; ; attempt++) {
      const started = performance.now();
      const response = await fetch(`${API}/v1beta/models/${llm.id}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body,
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      const ms = Math.round(performance.now() - started);
      const json = await response.json() as {
        error?: { message?: string }; modelVersion?: string; usageMetadata?: CallRecord['usage'];
        candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      };
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await new Promise(wait => setTimeout(wait, 8000 * attempt));
        continue;
      }
      const candidate = json.candidates?.[0];
      const text = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? '').join('') ?? '';
      return {
        ...base, ok: response.ok && candidate?.finishReason === 'STOP' && text.length > 0, httpStatus: response.status,
        ...(json.error?.message ? { error: redact(json.error.message).slice(0, 300) } : {}),
        ...(candidate?.finishReason ? { finishReason: candidate.finishReason } : {}),
        ...(json.modelVersion ? { modelVersion: json.modelVersion } : {}),
        ...(json.usageMetadata ? { usage: json.usageMetadata } : {}), ms, ...(uploadMs !== undefined ? { uploadMs } : {}), text,
      };
    }
  } catch (error) {
    return { ...base, ok: false, error: redact(error instanceof Error ? error.message : String(error)).slice(0, 300) };
  }
}

async function pool<T>(tasks: readonly (() => Promise<T>)[], size: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  }));
  return results;
}

if (options.dryRun) {
  const prompt = buildFactExtractionPrompt({ sources: sources.map(item => item.info), models: sources[0].models });
  console.log(`\nPrompt ${FACT_EXTRACTION_PROMPT_VERSION}: ${prompt.length} caracteres; schema ${JSON.stringify(factSheetResponseSchema(['a'])).length} caracteres.`);
  process.exit(0);
}

let records: CallRecord[];
if (options.replay) {
  records = [];
  for (const name of (await readdir(rawDir)).filter(file => file.endsWith('.json')).sort()) {
    const record = JSON.parse(await readFile(join(rawDir, name), 'utf8')) as CallRecord;
    if (llms.some(llm => llm.id === record.llm) && sources.some(source => source.info.sourceId === record.sourceId)) records.push(record);
  }
  console.log(`\nReprocessando ${records.length} respostas salvas (sem chamar a API).`);
} else {
  if (!apiKey) throw new Error('Defina GEMINI_API_KEY no ambiente (a chave nunca é impressa).');
  const tasks = llms.flatMap(llm => Array.from({ length: plan.runs }, (_, run) => sources.map(source => async () => {
    const record = await callGemini(llm, source, run + 1);
    await writeFile(rawName(llm.id, source.info.sourceId, run + 1), JSON.stringify(record, null, 2));
    console.log(`${llm.id} ${source.info.sourceId} r${run + 1}: ${record.ok ? 'ok' : `FALHOU ${record.httpStatus ?? ''} ${record.finishReason ?? ''} ${record.error ?? ''}`}` +
      ` ${record.ms ?? '-'} ms, entrada ${record.usage?.promptTokenCount ?? '-'}, saída ${record.usage?.candidatesTokenCount ?? '-'}, raciocínio ${record.usage?.thoughtsTokenCount ?? 0}`);
    return record;
  })).flat());
  records = await pool(tasks, options.concurrency);
  for (const upload of uploads.values()) {
    const file = await upload.catch(() => undefined);
    if (file) await fetch(`${API}/v1beta/${file.name}`, { method: 'DELETE', headers: { 'x-goog-api-key': apiKey } }).catch(() => undefined);
  }
}

interface RunResult {
  readonly llm: string;
  readonly sourceId: string;
  readonly run: number;
  readonly ok: boolean;
  readonly failure?: string;
  readonly ms?: number;
  readonly uploadMs?: number;
  readonly transport: CallRecord['transport'];
  readonly modelVersion?: string;
  readonly usage?: TokenUsage;
  readonly costUsd?: number;
  readonly counts?: FactVerificationReport['counts'];
  readonly dropped?: Readonly<Record<string, number>>;
  /** Quotes that read label, note, values and were fitted to the page text (label, values). */
  readonly fittedQuotes?: number;
  readonly truth?: TruthSummary;
  readonly values?: readonly (SourceFactValue & { readonly message: string })[];
}
const bySource = new Map(sources.map(source => [source.info.sourceId, source]));
const evidence = new Map(sources.map(source => [source.info.sourceId, pdfEvidenceSource(source.info.sourceId, source.pdf)]));
const results: RunResult[] = records.map(record => {
  const common = { llm: record.llm, sourceId: record.sourceId, run: record.run, transport: record.transport,
    ...(record.ms !== undefined ? { ms: record.ms } : {}), ...(record.uploadMs !== undefined ? { uploadMs: record.uploadMs } : {}),
    ...(record.modelVersion ? { modelVersion: record.modelVersion } : {}),
    ...(record.usage ? { usage: record.usage, costUsd: estimateCostUsd(record.llm, record.usage) } : {}) };
  if (!record.ok || !record.text) {
    return { ...common, ok: false, failure: `${record.httpStatus ?? ''} ${record.finishReason ?? ''} ${record.error ?? ''}`.trim() };
  }
  const source = bySource.get(record.sourceId)!;
  try {
    const { extraction: normalized, fitted } = fitQuotesToPages(
      toFactProposal(JSON.parse(record.text), [source.info], { models: source.models }), [evidence.get(record.sourceId)!]);
    const report = verifyFactProposal(normalized.proposal, [evidence.get(record.sourceId)!]);
    const values = sourceFactValues(normalized, report);
    const messages = new Map(report.values.map(value => [`${value.model}\u0000${value.label}\u0000${value.candidates[value.selected ?? 0]?.value}`,
      verificationMessage(value, report.sourceNames)]));
    const dropped: Record<string, number> = {};
    for (const item of normalized.dropped) dropped[item.reason] = (dropped[item.reason] ?? 0) + 1;
    return {
      ...common, ok: true, counts: report.counts, dropped, fittedQuotes: fitted,
      ...(truth ? { truth: summarizeAgainstTruth(values, truth, [record.sourceId]) } : {}),
      values: values.map(value => ({ ...value, message: messages.get(`${value.model}\u0000${value.label}\u0000${value.value}`) ?? '' })),
    };
  } catch (error) {
    return { ...common, ok: false, failure: `resposta inválida: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}` };
  }
});

// Divergences between files, per model and run (the same quantity read in two files).
interface DivergenceResult {
  readonly llm: string;
  readonly run: number;
  readonly divergences: readonly SourceDivergence[];
  readonly conflictMessages: readonly string[];
  readonly known: readonly { readonly model: string; readonly key: string; readonly note: string; readonly found: boolean }[];
}
const divergenceResults: DivergenceResult[] = [];
for (const llm of llms) for (let run = 1; run <= plan.runs; run++) {
  const runResults = results.filter(item => item.llm === llm.id && item.run === run && item.ok);
  if (runResults.length < 2) continue;
  const divergences = findSourceDivergences(runResults.flatMap(item => item.values ?? []));
  // One message per model and quantity: a value divergence already shows each file's condition.
  const names = new Map(sources.map(item => [item.info.sourceId, item.info.fileName]));
  const byQuantity = new Map<string, SourceDivergence>();
  for (const item of divergences) {
    const id = `${item.model}/${item.key}`;
    if (!byQuantity.has(id) || item.field === 'value') byQuantity.set(id, item);
  }
  const conflictMessages = [...byQuantity.values()]
    .map(item => `${item.model} · ${item.readings[0].label.replace(/:$/u, '')}: ${divergenceMessage(item, names)}`);
  divergenceResults.push({ llm: llm.id, run, divergences, conflictMessages,
    known: plan.knownDivergences.map(item => ({ ...item, found: divergences.some(found => found.model === item.model && found.key === item.key) })) });
}

const total = (list: readonly RunResult[], pick: (item: RunResult) => number | undefined) =>
  list.reduce((sum, item) => sum + (pick(item) ?? 0), 0);
const perLlm = llms.map(llm => {
  const list = results.filter(item => item.llm === llm.id);
  const ok = list.filter(item => item.ok);
  const counts: Record<string, number> = {};
  for (const item of ok) for (const [status, count] of Object.entries(item.counts ?? {})) counts[status] = (counts[status] ?? 0) + count;
  return {
    llm: llm.id, thinkingLevel: llm.thinkingLevel ?? 'padrão', price: GEMINI_PRICES[llm.id], calls: list.length, ok: ok.length,
    failures: list.filter(item => !item.ok).map(item => `${item.sourceId} r${item.run}: ${item.failure}`),
    msMean: ok.length ? Math.round(total(ok, item => item.ms) / ok.length) : undefined,
    msMax: ok.length ? Math.max(...ok.map(item => item.ms ?? 0)) : undefined,
    inputTokens: total(list, item => item.usage?.promptTokenCount), outputTokens: total(list, item => item.usage?.candidatesTokenCount),
    thoughtTokens: total(list, item => item.usage?.thoughtsTokenCount), costUsd: Number(total(list, item => item.costUsd).toFixed(5)),
    counts, fittedQuotes: total(ok, item => item.fittedQuotes),
    wrongVerified: total(ok, item => item.truth?.wrongVerified.length),
    unmatchedVerified: total(ok, item => item.truth?.unmatchedVerified.length),
    wrongCaught: total(ok, item => item.truth?.wrongCaught.length),
    coverage: {
      positions: total(ok, item => item.truth?.coverage.positions), verified: total(ok, item => item.truth?.coverage.verified),
      anyStatus: total(ok, item => item.truth?.coverage.anyStatus),
    },
  };
});

const summary = {
  promptVersion: FACT_EXTRACTION_PROMPT_VERSION, generatedAt: new Date().toISOString(), replay: options.replay,
  settings: { temperature: plan.temperature, mediaResolution: plan.mediaResolution ?? 'padrão', maxOutputTokens: plan.maxOutputTokens, runs: plan.runs },
  sources: sources.map(item => ({ ...item.info, models: item.models, megabytes: Number((item.bytes.byteLength / 1048576).toFixed(2)) })),
  perLlm, divergences: divergenceResults,
  runs: results.map(item => ({ ...item, values: undefined, truth: item.truth && {
    judged: item.truth.judged, byStatus: item.truth.byStatus, coverage: item.truth.coverage,
    wrongVerified: item.truth.wrongVerified.map(judgment => ({ ...judgment.value, expected: judgment.expected, note: judgment.note })),
    unmatchedVerified: item.truth.unmatchedVerified.map(judgment => ({ ...judgment.value, note: judgment.note })),
    wrongCaught: item.truth.wrongCaught.map(judgment => ({ ...judgment.value, expected: judgment.expected, note: judgment.note })),
  } })),
};
await writeFile(join(options.out, 'summary.json'), JSON.stringify(summary, null, 2));
await writeFile(join(options.out, 'values.json'), JSON.stringify(results.map(item => ({
  llm: item.llm, sourceId: item.sourceId, run: item.run, values: item.values ?? [] })), null, 2));

console.log('\nModelo | chamadas ok | tempo médio | tokens entrada/saída/raciocínio | custo US$ | VERIFIED errados | VERIFIED a conferir | errados barrados | cobertura verificada');
for (const item of perLlm) {
  console.log(`${item.llm} | ${item.ok}/${item.calls} | ${item.msMean ?? '-'} ms | ${item.inputTokens}/${item.outputTokens}/${item.thoughtTokens} | ` +
    `${item.costUsd} | ${item.wrongVerified} | ${item.unmatchedVerified} | ${item.wrongCaught} | ${item.coverage.verified}/${item.coverage.positions}`);
  for (const failure of item.failures) console.log(`  falha: ${failure}`);
}
for (const item of divergenceResults) {
  console.log(`\nDivergências ${item.llm} r${item.run}: ${item.divergences.length}; conhecidas encontradas: ` +
    item.known.map(known => `${known.model}/${known.key}=${known.found ? 'sim' : 'NÃO'}`).join(', '));
}
console.log(`\nResumo em ${join(options.out, 'summary.json')}`);
