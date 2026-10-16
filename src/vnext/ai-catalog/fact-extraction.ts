import { z } from 'zod';
import { FactProposalSchema, type Fact, type FactCandidate, type FactProposal, type ValueVerificationStatus } from './contracts';
import type { FactVerificationReport } from './fact-verifier';
import type { ExtractedPdf } from './pdf-intake';

/**
 * Fact extraction contract for a model that reads PDFs (FR-66a spike, reused
 * by the FR-66 server task): the prompt, the Gemini response schema
 * ("ProductFactSheet") and the deterministic normalization of the model's
 * answer into the untrusted FactProposal that fact-verifier.ts checks.
 * Nothing here trusts the model: every value still goes through
 * verifyFactProposal against the file's own text.
 *
 * Why this module exists (IDS: CREATE): no code sent a PDF to a model, and the
 * FactProposal contract (FR-67) is shaped for verification, not for a model
 * to fill (per-row unit, positional values, ids with a strict alphabet).
 */

export const FACT_EXTRACTION_PROMPT_VERSION = 'fr66a-2026-10-15.2';

/**
 * Symbol-font characters that PDF text layers (Word manuals) carry in the
 * Unicode private use area: the PRESYS TA manual prints "±" as U+F0B1 and "°"
 * as U+F0B0. Copied as they are, they reach the catalog as boxes ("□ 0,1 ºC").
 * Adobe Symbol encoding, only the signs that occur in specifications.
 */
const SYMBOL_FONT_CHARACTERS: Readonly<Record<string, string>> = {
  '': '±', '': '°', '': '×', '': '÷', '': '≤', '': '≥', '': '≠', '': '≈',
  '': 'µ', '': 'Ω', '': 'Δ', '': 'σ', '': '•', '': 'Ø',
};
/**
 * Diameter signs. The manual draws the diameter with the Symbol empty-set
 * glyph (U+F0C6, "∅"); the English folder prints "Ø". Both become "Ø", which
 * the catalog font (Noto Sans) has; it has no "∅" or "⌀".
 */
const DIAMETER_SIGNS: Readonly<Record<string, string>> = { '∅': 'Ø', '⌀': 'Ø' };
const SYMBOL_PATTERN = /[∅⌀]/gu;
/**
 * One character for one character (offsets never move): Symbol-font private
 * use characters become the signs they print, and every diameter sign becomes
 * "Ø". Applied alike to the file's text (evidence) and to the model's answer,
 * so verification still compares exact text.
 */
export function normalizeSymbolText(text: string): string {
  return text.replace(SYMBOL_PATTERN, character => SYMBOL_FONT_CHARACTERS[character] ?? DIAMETER_SIGNS[character] ?? character);
}
/** The PDF read by pdf-intake with its page text and text positions passed through `normalizeSymbolText`. */
export function withNormalizedSymbols(pdf: ExtractedPdf): ExtractedPdf {
  return {
    ...pdf,
    pages: pdf.pages.map(page => ({
      ...page, text: normalizeSymbolText(page.text),
      ...(page.runs ? { runs: page.runs.map(run => ({ ...run, text: normalizeSymbolText(run.text) })) } : {}),
    })),
  };
}
/**
 * A unit as printed, without the footnote asterisk glued to it ("°C*" -> "°C",
 * "% FS *" -> "% FS"); the footnote's text belongs in the condition.
 * Superscript digits stay: "m²" is a unit, not a footnote.
 */
export function cleanUnit(unit: string): string {
  return unit.replace(/\s*\*+$/u, '').trim();
}

/** One file sent to the model, with the page range it must read. */
export interface ExtractionSource {
  readonly sourceId: string;
  readonly fileName: string;
  readonly sha256: string;
  readonly pageCount: number;
  readonly firstPage: number;
  readonly lastPage: number;
}

/** Keys the model should reuse, so the same quantity lines up across files and languages. */
export const FACT_ROW_KEYS = [
  'operating-range', 'ambient-temperature', 'display-accuracy', 'accuracy', 'resolution', 'stability',
  'control-stability', 'axial-uniformity', 'radial-uniformity', 'heating-time', 'cooling-time', 'electric-power',
  'power-supply', 'well-dimensions', 'weight', 'dimensions', 'warranty', 'pressure-range', 'pressure-type',
  'pneumatic-connection', 'communication', 'operating-humidity',
] as const;

const pageRange = (source: ExtractionSource) =>
  source.firstPage === source.lastPage ? `page ${source.firstPage}` : `pages ${source.firstPage} to ${source.lastPage}`;

/**
 * Instructions for the model. Values must be literal copies of the page so
 * that the local verifier can find them; a wrong value is worse than a gap.
 */
export function buildFactExtractionPrompt(input: {
  readonly sources: readonly ExtractionSource[];
  readonly models?: readonly string[];
}): string {
  const files = input.sources.map(source => `- file "${source.sourceId}": "${source.fileName}", ${source.pageCount} pages. ` +
    `Read ONLY ${pageRange(source)}.`);
  const models = input.models?.length
    ? `Products: extract values only for these models, written exactly like this: ${input.models.join(', ')}. ` +
      'Ignore every other model, even one with a similar name (a name with an extra letter or number is another model).'
    : 'Products: extract the models of the product described on those pages (at most 6), with their names exactly as printed.';
  return [
    'You extract technical specification values from the attached PDF file(s) for a product catalog.',
    'Accuracy matters more than coverage: a wrong value is far worse than a missing one.',
    '',
    'Files:', ...files,
    models,
    '',
    'Rules:',
    '1. Copy every value exactly as printed: same digits, decimal separator (comma or point), signs (-, +, ±), symbols (Ø, <, >) and words. Do not translate, convert units, round or fix typos.',
    '2. literal = a contiguous piece of the printed text holding the value. When the unit follows the number ("200 W"), literal is "200" and unit is "W". When the unit is printed inside a range ("-25 °C to +155 °C"), keep the whole range as the literal.',
    '3. unit = the unit printed with the value ("°C", "W", "mm", "kg", "% FS"), without a footnote mark such as "*"; empty when there is none.',
    '4. condition = a qualifier printed next to the value, under its label or as a footnote that applies to it ("Full range", "25 °C to 140 °C", "ambient temperature: 23 °C"), copied exactly; empty when there is none.',
    '5. Give one entry per model in "values". When one printed cell spans several model columns, repeat the value for each model it covers, with the same quote.',
    '6. When a model has no printed value in a row, leave that model out of the row. Never guess, never copy a value from another model, page or file.',
    '7. sourceRef.page = the physical page number inside the PDF file (the first page of the file is 1), NOT the page number printed on the page.',
    '8. sourceRef.quote = a short contiguous run of the page text (at most 200 characters), copied character for character, that contains the row label and the value. For a table row, copy the first line of the label cell followed by the value cells of that row, left to right. Leave out a second line printed under the label (a note or a condition such as "ambient temperature: 23 °C"); it goes in condition. Do not add, drop or reorder words or symbols inside the quote.',
    `9. key = a short lowercase English slug (a-z, 0-9, -) naming the quantity, the same in any language. Use one of these when it fits: ${FACT_ROW_KEYS.join(', ')}. Otherwise create a similar slug.`,
    '10. label = the row label as printed on the page, in the language of the page.',
    '11. box_2d = optional; give it only when the value is inside a picture or a scanned area of the page: [ymin, xmin, ymax, xmax] normalized to 0-1000.',
    '12. title = the product family name as printed; models = the models that have at least one value. Keep the document order of sections and rows.',
  ].join('\n');
}

type GeminiSchema = Readonly<Record<string, unknown>>;
const text = (maxLength: number, description?: string): GeminiSchema =>
  ({ type: 'STRING', maxLength, ...(description ? { description } : {}) });
/**
 * Gemini `responseSchema` (OpenAPI subset) for the ProductFactSheet answer.
 * Array limits only on models, rows and box_2d: Gemini answers 400 "invalid
 * argument" when every nested array has min/max items (checked 2026-10-15);
 * the other limits are enforced by `toFactProposal`.
 */
export function factSheetResponseSchema(sourceIds: readonly string[]): GeminiSchema {
  const multi = sourceIds.length > 1;
  const sourceRef = {
    type: 'OBJECT',
    properties: {
      ...(multi ? { file: { type: 'STRING', enum: [...sourceIds] } } : {}),
      page: { type: 'INTEGER', description: 'Physical page number in the PDF file, first page = 1' },
      quote: text(300, 'Verbatim text of the page holding the row label and the value'),
      box_2d: { type: 'ARRAY', minItems: 4, maxItems: 4, items: { type: 'INTEGER' } },
    },
    required: [...(multi ? ['file'] : []), 'page', 'quote'],
    propertyOrdering: [...(multi ? ['file'] : []), 'page', 'quote', 'box_2d'],
  };
  const value = {
    type: 'OBJECT',
    properties: { model: text(60), literal: text(120), unit: text(24), condition: text(120), sourceRef },
    required: ['model', 'literal', 'sourceRef'],
    propertyOrdering: ['model', 'literal', 'unit', 'condition', 'sourceRef'],
  };
  const row = {
    type: 'OBJECT',
    properties: { key: text(40), label: text(120), values: { type: 'ARRAY', items: value } },
    required: ['key', 'label', 'values'], propertyOrdering: ['key', 'label', 'values'],
  };
  const section = {
    type: 'OBJECT',
    properties: { title: text(80), rows: { type: 'ARRAY', minItems: 1, maxItems: 16, items: row } },
    required: ['title', 'rows'], propertyOrdering: ['title', 'rows'],
  };
  return {
    type: 'OBJECT',
    properties: {
      title: text(120), models: { type: 'ARRAY', minItems: 1, maxItems: 6, items: text(60) },
      sections: { type: 'ARRAY', items: section },
    },
    required: ['title', 'models', 'sections'], propertyOrdering: ['title', 'models', 'sections'],
  };
}

/** The model's answer, parsed leniently: limits are enforced by the normalization, not by a throw. */
export const ProductFactSheetSchema = z.object({
  title: z.string().default(''),
  models: z.array(z.string()).default([]),
  sections: z.array(z.object({
    title: z.string().default(''),
    rows: z.array(z.object({
      key: z.string().default(''),
      label: z.string().default(''),
      values: z.array(z.object({
        model: z.string(),
        literal: z.string(),
        unit: z.string().optional(),
        condition: z.string().optional(),
        sourceRef: z.object({
          file: z.string().optional(),
          page: z.number(),
          quote: z.string(),
          box_2d: z.array(z.number()).optional(),
        }),
      })).default([]),
    })).default([]),
  })).default([]),
});
export type ProductFactSheet = z.infer<typeof ProductFactSheetSchema>;

export type DropReason =
  | 'MODEL_NOT_REQUESTED' | 'UNKNOWN_FILE' | 'PAGE_NOT_IN_FILE' | 'EMPTY_LITERAL' | 'EMPTY_QUOTE'
  | 'INVALID_TEXT' | 'LIMIT_REACHED';
/** A value of the answer that never reaches the proposal, and why (counted, never silent). */
export interface DroppedValue {
  readonly section: string;
  readonly label: string;
  readonly model: string;
  readonly literal: string;
  readonly reason: DropReason;
}
export interface NormalizedExtraction {
  readonly proposal: FactProposal;
  readonly dropped: readonly DroppedValue[];
  /** `sectionId/rowId` -> the model's quantity key, to line the same quantity up across files. */
  readonly rowKeys: Readonly<Record<string, string>>;
}

export const MISSING_VALUE_REASON = 'Não encontrado nas páginas lidas.';
const MAX_SECTIONS = 16, MAX_ROWS = 16, MAX_FACTS = 192, MAX_MODELS = 6, MAX_CANDIDATES = 4;
const MAX_NAME = 160, MAX_QUOTE = 800;

const oneLine = (value: string | undefined) => normalizeSymbolText(value ?? '').replace(/\s+/gu, ' ').trim();
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/u;
const validText = (value: string, max: number) => value.length <= max && !CONTROL.test(value);
/** Lowercase a-z0-9 slug with hyphens, at most `max` characters ("Exatidão do Display" -> "exatidao-do-display"). */
export function factSlug(value: string, max = 36): string {
  return value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '').slice(0, max).replace(/-+$/u, '');
}
function uniqueId(base: string, used: Set<string>, fallback: string): string {
  const root = factSlug(base) || fallback;
  let id = root;
  for (let index = 2; used.has(id); index++) id = `${root}-${index}`;
  used.add(id);
  return id;
}
function validBox(box: readonly number[] | undefined): [number, number, number, number] | undefined {
  if (!box || box.length !== 4 || !box.every(item => Number.isInteger(item) && item >= 0 && item <= 1000)) return undefined;
  const [ymin, xmin, ymax, xmax] = box;
  return ymin < ymax && xmin < xmax ? [ymin, xmin, ymax, xmax] : undefined;
}

interface PendingRow { key: string; label: string; unit: string; condition: string; byModel: Map<number, FactCandidate[]> }

/**
 * Turns the model's ProductFactSheet into a FactProposal (one value position
 * per model and row) without judging any value: sources, sha256 and page
 * bounds come from the files themselves; values with a different unit or
 * condition become rows of their own (the proposal has one unit per row);
 * several readings of one position become a conflict; absent positions are
 * "missing". Anything that cannot be represented is listed in `dropped`.
 * Texts go through `normalizeSymbolText` (so the evidence must too: verify
 * against `withNormalizedSymbols(pdf)`) and units lose footnote asterisks.
 */
export function toFactProposal(answer: unknown, sources: readonly ExtractionSource[],
  options: { readonly models?: readonly string[]; readonly title?: string } = {}): NormalizedExtraction {
  if (!sources.length) throw new Error('FACT_EXTRACTION_NO_SOURCE');
  const sheet = ProductFactSheetSchema.parse(answer);
  const dropped: DroppedValue[] = [];
  const drop = (section: string, label: string, model: string, literal: string, reason: DropReason) =>
    dropped.push({ section, label, model: oneLine(model), literal: oneLine(literal).slice(0, MAX_NAME), reason });

  // Models: the requested list (exact names) or the answer's own list.
  const requested = (options.models ?? []).map(oneLine).filter(Boolean);
  const models: string[] = [];
  const addModel = (name: string) => {
    const clean = oneLine(name);
    if (clean && validText(clean, MAX_NAME) && !models.includes(clean) && models.length < MAX_MODELS) models.push(clean);
  };
  (requested.length ? requested : sheet.models).forEach(addModel);
  const modelIndex = (name: string): number => {
    const clean = oneLine(name);
    const exact = models.indexOf(clean);
    if (exact >= 0) return exact;
    const folded = models.findIndex(model => model.toLowerCase() === clean.toLowerCase());
    if (folded >= 0 || requested.length) return folded;
    addModel(clean);
    return models.indexOf(clean);
  };
  const byId = new Map(sources.map(source => [source.sourceId, source]));

  const sections: { title: string; rows: PendingRow[] }[] = [];
  for (const section of sheet.sections) {
    const sectionTitle = oneLine(section.title) || 'Especificações';
    const rows: PendingRow[] = [];
    for (const row of section.rows) {
      const label = oneLine(row.label) || oneLine(row.key);
      const groups = new Map<string, PendingRow>();
      for (const value of row.values) {
        const literal = oneLine(value.literal), quote = normalizeSymbolText(value.sourceRef.quote).trim();
        const unit = cleanUnit(oneLine(value.unit)), condition = oneLine(value.condition);
        const index = modelIndex(value.model);
        if (index < 0) { drop(sectionTitle, label, value.model, literal, 'MODEL_NOT_REQUESTED'); continue; }
        const source = value.sourceRef.file !== undefined ? byId.get(oneLine(value.sourceRef.file))
          : sources.length === 1 ? sources[0] : undefined;
        if (!source) { drop(sectionTitle, label, value.model, literal, 'UNKNOWN_FILE'); continue; }
        const page = value.sourceRef.page;
        if (!Number.isInteger(page) || page < 1 || page > source.pageCount) {
          drop(sectionTitle, label, value.model, literal, 'PAGE_NOT_IN_FILE'); continue;
        }
        if (!literal) { drop(sectionTitle, label, value.model, literal, 'EMPTY_LITERAL'); continue; }
        if (!quote) { drop(sectionTitle, label, value.model, literal, 'EMPTY_QUOTE'); continue; }
        if (!label || !validText(label, MAX_NAME) || !validText(literal, MAX_NAME) || !validText(unit, MAX_NAME) ||
            !validText(condition, MAX_NAME) || !validText(quote, MAX_QUOTE)) {
          drop(sectionTitle, label, value.model, literal, 'INVALID_TEXT'); continue;
        }
        const groupKey = `${unit}\u0000${condition}`;
        let group = groups.get(groupKey);
        if (!group) {
          group = { key: oneLine(row.key), label, unit, condition, byModel: new Map() };
          groups.set(groupKey, group);
        }
        const box = validBox(value.sourceRef.box_2d);
        const candidate: FactCandidate = {
          value: literal,
          source: { sourceId: source.sourceId, page, quote, sha256: source.sha256, ...(box ? { box_2d: box } : {}) },
        };
        const list = group.byModel.get(index) ?? [];
        if (list.some(item => item.value === literal)) continue; // same reading twice: one candidate
        if (list.length >= MAX_CANDIDATES) { drop(sectionTitle, label, value.model, literal, 'LIMIT_REACHED'); continue; }
        list.push(candidate);
        group.byModel.set(index, list);
      }
      rows.push(...groups.values());
    }
    if (rows.length) sections.push({ title: sectionTitle, rows });
  }

  // Limits of the proposal: at most 16 rows per section, 16 sections, 192 facts.
  const sectionIds = new Set<string>();
  const rowKeys: Record<string, string> = {};
  const out: FactProposal['sections'] = [];
  let facts = 0;
  const factOf = (row: PendingRow, index: number): Fact => {
    const list = row.byModel.get(index) ?? [];
    if (!list.length) return { status: 'missing', reason: MISSING_VALUE_REASON };
    return list.length === 1 ? { status: 'known', candidate: list[0] } : { status: 'conflict', candidates: list };
  };
  for (const section of sections) {
    for (let start = 0; start < section.rows.length; start += MAX_ROWS) {
      const chunk = section.rows.slice(start, start + MAX_ROWS);
      const title = start ? `${section.title} (continuação)` : section.title;
      const room = out.length < MAX_SECTIONS ? MAX_FACTS - facts : 0;
      for (const row of chunk.slice(room)) for (const [index, list] of row.byModel) {
        for (const item of list) drop(section.title, row.label, models[index], item.value, 'LIMIT_REACHED');
      }
      const kept = chunk.slice(0, Math.max(0, room));
      if (!kept.length) continue;
      const sectionId = uniqueId(title, sectionIds, 'secao');
      const rowIds = new Set<string>();
      out.push({
        id: sectionId, title: title.slice(0, MAX_NAME),
        rows: kept.map(row => {
          const id = uniqueId(row.key || row.label, rowIds, 'linha');
          rowKeys[`${sectionId}/${id}`] = factSlug(row.key || row.label, 40) || id;
          return { id, label: row.label, unit: row.unit, condition: row.condition, values: models.map((_, index) => factOf(row, index)) };
        }),
      });
      facts += kept.length;
    }
  }
  if (!models.length) throw new Error('FACT_EXTRACTION_NO_MODEL');
  if (!out.length) throw new Error('FACT_EXTRACTION_EMPTY');
  const title = (oneLine(options.title) || oneLine(sheet.title) || models.join(' / ')).slice(0, MAX_NAME);
  const proposal = FactProposalSchema.parse({ version: 1, title, models, sections: out });
  return { proposal, dropped, rowKeys };
}

/**
 * The figures of a value, for comparing readings of the same quantity: signs
 * kept ("-25", "±0.02"), a leading "+" dropped, decimal comma read as a point,
 * a hyphen between two figures read as a range ("0-15" -> 0, 15).
 * "-25 °C to +155 °C" and "-25 a 155" have the same figures.
 */
export function numericSignature(text: string): string[] {
  const normalized = text.replace(/[−–—]/gu, '-');
  const figures: string[] = [];
  const pattern = /(?:(^|[\s([:;/=])([±+-])\s?)?(\d+(?:[.,]\d+)*)/gu;
  for (const match of normalized.matchAll(pattern)) {
    const sign = match[2] === '+' ? '' : match[2] ?? '';
    figures.push(sign + match[3].replace(/,/gu, '.'));
  }
  return figures;
}

/** One value of one file, with the quantity key it was filed under. */
export interface SourceFactValue {
  readonly sourceId: string;
  readonly model: string;
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly condition: string;
  readonly page: number;
  readonly quote: string;
  readonly status: ValueVerificationStatus | 'MISSING';
}
/** Flattens a verified extraction into one entry per value position that has a reading. */
export function sourceFactValues(normalized: NormalizedExtraction, report: FactVerificationReport): SourceFactValue[] {
  return report.values.flatMap(value => {
    if (value.status === 'MISSING' || !value.candidates.length) return [];
    const chosen = value.candidates[value.selected ?? 0];
    return [{
      sourceId: chosen.source.sourceId, model: value.model,
      key: normalized.rowKeys[`${value.sectionId}/${value.rowId}`] ?? value.rowId,
      label: value.label, value: chosen.value, unit: value.unit, condition: value.condition,
      page: chosen.source.page, quote: chosen.source.quote, status: value.status,
    }];
  });
}

/** Same model and quantity, read with different figures in different files. */
export interface SourceDivergence {
  readonly model: string;
  readonly key: string;
  /** "value": the figures differ; "condition": same figures, but the printed condition differs ("23 °C" vs "20 °C"). */
  readonly field: 'value' | 'condition';
  readonly readings: readonly SourceFactValue[];
}
const HAS_EVIDENCE: ReadonlySet<string> = new Set(['VERIFIED_TEXT', 'VERIFIED_CELL', 'VISUAL_ONLY']);
/**
 * Finds the places where the files disagree, so nothing is chosen in silence.
 * Only readings with evidence in their own file count (verified or to be
 * checked on the page); unsupported readings are noise, not a divergence.
 */
export function findSourceDivergences(values: readonly SourceFactValue[]): SourceDivergence[] {
  const groups = new Map<string, SourceFactValue[]>();
  for (const value of values) {
    if (!HAS_EVIDENCE.has(value.status)) continue;
    const id = `${value.model}\u0000${value.key}`;
    groups.set(id, [...(groups.get(id) ?? []), value]);
  }
  const found: SourceDivergence[] = [];
  for (const readings of groups.values()) {
    if (new Set(readings.map(item => item.sourceId)).size < 2) continue;
    const signature = (item: SourceFactValue) => numericSignature(item.value).join(' ');
    const conditionSignature = (item: SourceFactValue) => numericSignature(item.condition).join(' ');
    const { model, key } = readings[0];
    if (new Set(readings.map(signature)).size > 1) found.push({ model, key, field: 'value', readings });
    // Checked even when the figures differ too: "até 155 °C a 23 °C" x "até 140 °C a 20 °C" are two differences.
    const withCondition = readings.filter(item => conditionSignature(item));
    if (new Set(withCondition.map(item => item.sourceId)).size > 1 && new Set(withCondition.map(conditionSignature)).size > 1) {
      found.push({ model, key, field: 'condition', readings: withCondition });
    }
  }
  return found;
}

/**
 * A proposal in which every value divergence is a conflict between the files,
 * for the verifier to report as "As fontes divergem: ...". Readings are taken
 * as they are; the verifier decides again what each file supports.
 */
export function divergenceProposal(divergences: readonly SourceDivergence[], sources: readonly ExtractionSource[],
  title: string): FactProposal | undefined {
  const byId = new Map(sources.map(source => [source.sourceId, source]));
  const rows = divergences.filter(item => item.field === 'value').flatMap(item => {
    const candidates: FactCandidate[] = [];
    for (const reading of item.readings) {
      if (candidates.some(candidate => candidate.value === reading.value) || candidates.length >= MAX_CANDIDATES) continue;
      const sha256 = byId.get(reading.sourceId)?.sha256;
      candidates.push({ value: reading.value, source: {
        sourceId: reading.sourceId, page: reading.page, quote: reading.quote, ...(sha256 ? { sha256 } : {}),
      } });
    }
    if (candidates.length < 2) return [];
    const first = item.readings[0];
    return [{ model: item.model, row: { label: first.label, unit: first.unit, condition: first.condition, key: item.key }, candidates }];
  });
  if (!rows.length) return undefined;
  const models = [...new Set(rows.map(item => item.model))].slice(0, MAX_MODELS);
  const ids = new Set<string>();
  const proposalRows = rows.filter(item => models.includes(item.model)).slice(0, MAX_ROWS).map(item => ({
    id: uniqueId(`${item.row.key}-${item.model}`, ids, 'linha'), label: item.row.label, unit: item.row.unit,
    condition: item.row.condition,
    values: models.map((model): Fact => model === item.model
      ? { status: 'conflict', candidates: item.candidates }
      : { status: 'missing', reason: 'Sem divergência para este modelo.' }),
  }));
  return FactProposalSchema.parse({
    version: 1, title: oneLine(title).slice(0, MAX_NAME) || 'Divergências', models,
    sections: [{ id: 'divergencias', title: 'Divergências entre arquivos', rows: proposalRows }],
  });
}
