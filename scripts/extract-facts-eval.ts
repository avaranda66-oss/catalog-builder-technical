import { z } from 'zod';
import { numericSignature, type SourceFactValue } from '../src/vnext/ai-catalog/fact-extraction';

/**
 * Pure helpers of the FR-66a extraction spike (scripts/extract-facts.ts):
 * the run plan, the hand-checked answer key ("gabarito"), the comparison of
 * every extracted value with it, and the cost estimate. No network, no files.
 * Spike tooling only: nothing in src/ imports it, so it never reaches the bundle.
 */

/** Paid Standard prices in US$ per 1M tokens (ai.google.dev/gemini-api/docs/pricing, read 2026-10-15). PDF input bills at the image rate, same as text here. */
export const GEMINI_PRICES: Readonly<Record<string, { input: number; output: number; note: string }>> = {
  'gemini-3.5-flash-lite': { input: 0.30, output: 2.50, note: 'estável' },
  // Deprecated: Google routes gemini-3.5-flash to gemini-3.6-flash, billed as 3.6 Flash.
  'gemini-3.5-flash': { input: 0.75, output: 3.75, note: 'descontinuado; atendido pelo gemini-3.6-flash' },
  'gemini-3.6-flash': { input: 0.75, output: 3.75, note: 'até 2026-12-31; depois US$ 1,50 / 7,50' },
  'gemini-3.8-flash': { input: 0.75, output: 3.75, note: 'até 2026-12-31; depois US$ 1,50 / 7,50' },
};
export interface TokenUsage {
  readonly promptTokenCount?: number;
  readonly candidatesTokenCount?: number;
  readonly thoughtsTokenCount?: number;
  readonly totalTokenCount?: number;
}
/** Cost of one call: input tokens at the input price, answer plus thinking at the output price. Undefined for an unknown model. */
export function estimateCostUsd(model: string, usage: TokenUsage): number | undefined {
  const price = GEMINI_PRICES[model];
  if (!price) return undefined;
  const input = usage.promptTokenCount ?? 0, output = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  return (input * price.input + output * price.output) / 1_000_000;
}

const sourceId = z.string().regex(/^[a-z0-9-]{1,40}$/);
/** What to run: files (with page range and models), models to compare, repetitions. */
export const SpikePlanSchema = z.object({
  sources: z.array(z.object({
    id: sourceId,
    path: z.string().min(1),
    pages: z.tuple([z.number().int().min(1), z.number().int().min(1)]).refine(([from, to]) => from <= to, 'Invalid page range'),
    models: z.array(z.string().min(1)).min(1).max(6),
  }).strict()).min(1),
  llms: z.array(z.object({
    id: z.string().regex(/^[a-z0-9.-]{3,60}$/),
    thinkingLevel: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
  }).strict()).min(1),
  runs: z.number().int().min(1).max(5).default(1),
  temperature: z.number().min(0).max(2).default(0),
  mediaResolution: z.enum(['MEDIA_RESOLUTION_LOW', 'MEDIA_RESOLUTION_MEDIUM', 'MEDIA_RESOLUTION_HIGH']).optional(),
  maxOutputTokens: z.number().int().min(1024).max(65536).default(16384),
  truth: z.string().optional(),
  /** Divergences the owner already knows about; the report says whether each run found them. */
  knownDivergences: z.array(z.object({ model: z.string(), key: z.string(), note: z.string() }).strict()).default([]),
}).strict();
export type SpikePlan = z.infer<typeof SpikePlanSchema>;

export interface CliOptions {
  readonly plan: string;
  readonly out: string;
  readonly pdfRoot?: string;
  readonly replay: boolean;
  readonly dryRun: boolean;
  readonly concurrency: number;
  readonly only?: readonly string[];
}
/** `--plan <file> --out <dir> [--pdf-root <dir>] [--replay] [--dry-run] [--concurrency n] [--only llm,llm]`. */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  const values = new Map<string, string>(), flags = new Set<string>();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--replay' || arg === '--dry-run') { flags.add(arg); continue; }
    if (!['--plan', '--out', '--pdf-root', '--concurrency', '--only'].includes(arg)) throw new Error(`Opção desconhecida: ${arg}`);
    const value = argv[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`Falta o valor de ${arg}`);
    values.set(arg, value);
  }
  const plan = values.get('--plan'), out = values.get('--out');
  if (!plan || !out) throw new Error('Use: --plan <arquivo.json> --out <pasta>');
  const concurrency = Number(values.get('--concurrency') ?? '2');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6) throw new Error('--concurrency deve ser de 1 a 6');
  const only = values.get('--only')?.split(',').map(item => item.trim()).filter(Boolean);
  return { plan, out, ...(values.get('--pdf-root') ? { pdfRoot: values.get('--pdf-root') } : {}),
    replay: flags.has('--replay'), dryRun: flags.has('--dry-run'), concurrency, ...(only?.length ? { only } : {}) };
}

/**
 * The hand-checked answer key. For each covered page and model it lists every
 * printed value, so anything else read on those pages is checked by hand.
 */
export const GroundTruthSchema = z.object({
  version: z.literal(1),
  checkedOn: z.string(),
  method: z.string(),
  sources: z.array(z.object({
    sourceId,
    file: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    coveredPages: z.array(z.number().int().min(1)).min(1),
    models: z.array(z.string()).min(1),
  }).strict()).min(1),
  rows: z.array(z.object({
    sourceId,
    page: z.number().int().min(1),
    row: z.string().regex(/^[a-z0-9-]{1,40}$/),
    labels: z.array(z.string().min(1)).min(1),
    unit: z.string().default(''),
    condition: z.string().default(''),
    /** Words that tell variants of the same row apart ("DT", "RM", "(9)"). */
    variant: z.array(z.string().min(1)).optional(),
    values: z.record(z.string(), z.string()),
    /** Other complete readings of the same printed value ("25.4 x 124" for "Ø 25.4 mm (1”) x 124 mm"). */
    alsoAccept: z.array(z.string()).default([]),
  }).strict()).min(1),
}).strict();
export type GroundTruth = z.infer<typeof GroundTruthSchema>;

export type TruthVerdict = 'CORRECT' | 'WRONG' | 'UNMATCHED';
export interface TruthJudgment {
  readonly value: SourceFactValue;
  readonly verdict: TruthVerdict;
  readonly row?: string;
  readonly expected?: readonly string[];
  readonly note: string;
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
const words = (text: string) => new Set(fold(text).match(/[a-z]{2,}/gu) ?? []);
function similarity(a: string, b: string): number {
  const left = words(a), right = words(b);
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter(word => right.has(word)).length;
  return shared / new Set([...left, ...right]).size;
}
const canonicalUnit = (unit: string) => fold(unit).replace(/\s+/gu, '').replace(/[º˚]/gu, '°');
const hasToken = (text: string, token: string) => {
  const escaped = fold(token).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'u').test(fold(text));
};
const signature = (text: string) => numericSignature(text).join(' ');

/**
 * Compares one extracted value with the answer key. CORRECT and WRONG are
 * decided only on covered pages and models; anything the key cannot place
 * (another page, an unlisted row, a variant not named) is UNMATCHED and must
 * be checked by a person.
 */
export function judgeValue(value: SourceFactValue, truth: GroundTruth): TruthJudgment {
  const source = truth.sources.find(item => item.sourceId === value.sourceId);
  if (!source) return { value, verdict: 'UNMATCHED', note: 'arquivo sem gabarito' };
  if (!source.models.includes(value.model)) return { value, verdict: 'UNMATCHED', note: 'modelo fora do gabarito' };
  if (!source.coveredPages.includes(value.page)) return { value, verdict: 'UNMATCHED', note: `página ${value.page} fora do gabarito` };
  const rows = truth.rows.filter(row => row.sourceId === value.sourceId && row.values[value.model] !== undefined);
  const scored = [...new Set(rows.map(row => row.row))].map(id => {
    const labels = rows.filter(row => row.row === id).flatMap(row => row.labels);
    const score = Math.max(...labels.map(label => similarity(value.label, label))) + (value.key === id ? 0.25 : 0);
    return { id, score };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.5) return { value, verdict: 'UNMATCHED', note: 'linha não encontrada no gabarito' };
  if (scored[1] && scored[1].score === best.score) return { value, verdict: 'UNMATCHED', note: 'linha ambígua no gabarito' };
  let entries = rows.filter(row => row.row === best.id);
  const expectedOf = (list: typeof entries) => list.flatMap(row => [row.values[value.model], ...row.alsoAccept]);
  if (entries.every(row => row.page !== value.page)) {
    return { value, verdict: 'WRONG', row: best.id, expected: expectedOf(entries), note: `esta linha está na página ${entries[0].page}` };
  }
  entries = entries.filter(row => row.page === value.page);
  const context = `${value.label} ${value.condition} ${value.value}`;
  const named = entries.filter(row => row.variant?.some(token => hasToken(context, token)));
  const variants = entries.some(row => row.variant?.length);
  const pool = named.length ? named : entries;
  const wanted = signature(value.value);
  // A reading may keep the printed condition inside the value: "10 min (25 °C to 140 °C)".
  const readings = (row: (typeof pool)[number]) => [row.values[value.model], ...row.alsoAccept,
    ...(row.condition ? [`${row.values[value.model]} ${row.condition}`] : [])];
  const match = pool.find(row => readings(row).some(item => signature(item) === wanted));
  if (!match) return { value, verdict: 'WRONG', row: best.id, expected: expectedOf(pool), note: 'números diferentes do gabarito' };
  if (variants && !named.length) {
    return { value, verdict: 'UNMATCHED', row: best.id, expected: expectedOf(pool), note: 'valor certo, mas não diz de qual versão é' };
  }
  if (value.unit && match.unit && canonicalUnit(value.unit) !== canonicalUnit(match.unit)) {
    return { value, verdict: 'WRONG', row: best.id, expected: [`${match.values[value.model]} ${match.unit}`], note: 'unidade diferente do gabarito' };
  }
  const condition = signature(value.condition), expectedCondition = signature(match.condition);
  if (condition && expectedCondition && condition !== expectedCondition) {
    return { value, verdict: 'WRONG', row: best.id, expected: [match.condition], note: 'condição diferente do gabarito' };
  }
  return { value, verdict: 'CORRECT', row: best.id, note: 'confere com o gabarito' };
}

const VERIFIED: ReadonlySet<string> = new Set(['VERIFIED_TEXT', 'VERIFIED_CELL']);
export interface TruthSummary {
  readonly judged: number;
  readonly byStatus: Readonly<Record<string, Record<TruthVerdict, number>>>;
  /** The go/no-go number: values marked verified that the answer key says are wrong. Must be 0. */
  readonly wrongVerified: readonly TruthJudgment[];
  /** Verified values the key cannot place: each one is checked by hand in the report. */
  readonly unmatchedVerified: readonly TruthJudgment[];
  /** Wrong readings the verifier did stop (not verified). */
  readonly wrongCaught: readonly TruthJudgment[];
  /** Key positions (row x model x variant) with a correct verified value / with any correct value. */
  readonly coverage: { readonly positions: number; readonly verified: number; readonly anyStatus: number };
}
export function summarizeAgainstTruth(values: readonly SourceFactValue[], truth: GroundTruth,
  sourceIds: readonly string[]): TruthSummary {
  const judgments = values.map(value => judgeValue(value, truth));
  const byStatus: Record<string, Record<TruthVerdict, number>> = {};
  for (const item of judgments) {
    const bucket = byStatus[item.value.status] ??= { CORRECT: 0, WRONG: 0, UNMATCHED: 0 };
    bucket[item.verdict]++;
  }
  const positions = truth.rows.filter(row => sourceIds.includes(row.sourceId)).flatMap(row =>
    Object.keys(row.values).map(model => ({ row, model })));
  const covered = (verifiedOnly: boolean) => positions.filter(({ row, model }) => judgments.some(item =>
    item.verdict === 'CORRECT' && item.row === row.row && item.value.model === model && item.value.sourceId === row.sourceId &&
    item.value.page === row.page && (!row.variant?.length || row.variant.some(token =>
      hasToken(`${item.value.label} ${item.value.condition} ${item.value.value}`, token))) &&
    (!verifiedOnly || VERIFIED.has(item.value.status)))).length;
  return {
    judged: judgments.length, byStatus,
    wrongVerified: judgments.filter(item => item.verdict === 'WRONG' && VERIFIED.has(item.value.status)),
    unmatchedVerified: judgments.filter(item => item.verdict === 'UNMATCHED' && VERIFIED.has(item.value.status)),
    wrongCaught: judgments.filter(item => item.verdict === 'WRONG' && !VERIFIED.has(item.value.status)),
    coverage: { positions: positions.length, verified: covered(true), anyStatus: covered(false) },
  };
}
