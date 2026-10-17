/**
 * Prompt and Gemini `responseSchema` of the fact extraction (FR-66a spike and
 * FR-66 server task), in one pure module that the browser, the scripts and the
 * vnext-catalog-draft Edge Function (Deno, relative `.ts` import) all read.
 *
 * Rules: no imports and only erasable TypeScript syntax, because Deno and Node
 * (type stripping) import this file by path. Nothing here trusts the model:
 * every value still goes through the local verifier (fact-verifier.ts).
 *
 * Why this module exists (IDS: ADAPT): the prompt and schema lived in
 * fact-extraction.ts, which imports zod and extensionless paths that Deno
 * cannot load. They moved here unchanged (v2, the version validated by the
 * spike) and fact-extraction.ts re-exports them; v3 is v2 plus the rules for
 * tables that apply to every model and the per-page report (spike §8,
 * conditions 5 and 6).
 */

/** Prompt version validated by the FR-66a spike (fr66a-2026-10-15.2). */
export const FACT_EXTRACTION_PROMPT_VERSION = 'fr66a-2026-10-15.2';
/** v2 plus shared tables and the per-page report (FR-66, condition 5 of the spike). */
export const FACT_EXTRACTION_PROMPT_VERSION_V3 = 'fr66-2026-10-17.3';

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

/** Column name the model uses for a shared list without column headers (never printed on a page). */
export const ALL_MODELS_COLUMN = 'Todos os modelos';

/** What a page read holds, as the model reports it (v3). The verifier never trusts it; it only explains an empty page. */
export const PAGE_CONTENT_KINDS = ['specifications', 'shared-table', 'other-models', 'no-specifications', 'image-only'] as const;
export type PageContentKind = typeof PAGE_CONTENT_KINDS[number];

const pageRange = (source: ExtractionSource) =>
  source.firstPage === source.lastPage ? `page ${source.firstPage}` : `pages ${source.firstPage} to ${source.lastPage}`;

/**
 * Instructions for the model (v2, unchanged). Values must be literal copies
 * of the page so that the local verifier can find them; a wrong value is worse
 * than a gap.
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

/**
 * v3 = the v2 prompt, word for word, plus four rules: tables that apply to
 * every model ("sharedTables": the TA manual p. 6 inputs table, accessories
 * with order codes) and a report of every page read, so that no page read can
 * vanish without a word.
 */
export function buildFactExtractionPromptV3(input: {
  readonly sources: readonly ExtractionSource[];
  readonly models?: readonly string[];
}): string {
  return [
    buildFactExtractionPrompt(input),
    '13. A table that applies to ALL the products at once, with no column per model (for example input types with Resolution and Accuracy columns, or accessories with order codes), goes in "sharedTables", never in "sections". Do not skip it: copy every row, in the printed order.',
    '14. In "sharedTables": title = the table title as printed; columns = the header cells of the value columns, left to right, without the row label column, each copied exactly as printed and never renamed or translated; when a header is printed in two lines, copy only its first line. When the first column holds a name and a value (for example "Pt-100" next to its range), the name is the row label and the value goes under that first column\'s own printed header (for example "Entradas"), not under a name you choose. When a row has no name of its own because it continues the row above, repeat the name above. When the table has no column headers (a list of characteristics), use one column named "' + ALL_MODELS_COLUMN + '".',
    '15. In "sharedTables", each row has ONE sourceRef (page and quote of that whole row, as in rule 8) and its values name their column in "column". literal = the whole text of the cell, with its units and signs ("0,001 mV", "± 0,1 °C / ± 0,2 °F"); leave unit empty. Leave out an empty cell.',
    '16. pages = one entry for EVERY page you were asked to read, saying what it holds: "specifications" (values copied in sections), "shared-table" (values copied in sharedTables), "other-models" (specifications only of models that were not requested), "no-specifications" (no specification values), "image-only" (specification values only inside pictures that you could not read).',
  ].join('\n');
}

type GeminiSchema = Readonly<Record<string, unknown>>;
const text = (maxLength: number, description?: string): GeminiSchema =>
  ({ type: 'STRING', maxLength, ...(description ? { description } : {}) });
const sourceRefSchema = (sourceIds: readonly string[]): GeminiSchema => {
  const multi = sourceIds.length > 1;
  return {
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
};
/**
 * Gemini `responseSchema` (OpenAPI subset) for the ProductFactSheet answer (v2).
 * Array limits only on models, rows and box_2d: Gemini answers 400 "invalid
 * argument" when every nested array has min/max items (checked 2026-10-15);
 * the other limits are enforced by `toFactProposal`.
 */
export function factSheetResponseSchema(sourceIds: readonly string[]): GeminiSchema {
  const value = {
    type: 'OBJECT',
    properties: { model: text(60), literal: text(120), unit: text(24), condition: text(120), sourceRef: sourceRefSchema(sourceIds) },
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

/**
 * v3 schema: v2 plus `sharedTables` (one quote per row, values by column) and
 * `pages` (what each page read holds). Every STRING keeps a maxLength (the
 * lesson of the 1B composer: an unbounded string can run until the output
 * limit). The new arrays carry no maxItems: with any of them Gemini answers
 * 400 "invalid argument" (checked on 2026-10-17 with gemini-3.8-flash, like
 * the spike on 2026-10-15), so the server bounds them after the answer
 * (draft-contract.ts, ANSWER_ARRAY_LIMITS) and counts what it leaves out.
 */
export function factSheetResponseSchemaV3(sourceIds: readonly string[]): GeminiSchema {
  const v2 = factSheetResponseSchema(sourceIds) as { properties: Record<string, unknown>; required: string[]; propertyOrdering: string[] };
  const cell = {
    type: 'OBJECT',
    properties: { column: text(60), literal: text(120), unit: text(24), condition: text(120) },
    required: ['column', 'literal'], propertyOrdering: ['column', 'literal', 'unit', 'condition'],
  };
  const sharedRow = {
    type: 'OBJECT',
    properties: { label: text(120), sourceRef: sourceRefSchema(sourceIds), values: { type: 'ARRAY', items: cell } },
    required: ['label', 'sourceRef', 'values'], propertyOrdering: ['label', 'sourceRef', 'values'],
  };
  const sharedTable = {
    type: 'OBJECT',
    properties: {
      title: text(120),
      columns: { type: 'ARRAY', items: text(60) },
      rows: { type: 'ARRAY', items: sharedRow },
    },
    required: ['title', 'columns', 'rows'], propertyOrdering: ['title', 'columns', 'rows'],
  };
  const page = {
    type: 'OBJECT',
    properties: { page: { type: 'INTEGER' }, content: { type: 'STRING', enum: [...PAGE_CONTENT_KINDS] } },
    required: ['page', 'content'], propertyOrdering: ['page', 'content'],
  };
  return {
    type: 'OBJECT',
    properties: {
      ...v2.properties,
      sharedTables: { type: 'ARRAY', items: sharedTable },
      pages: { type: 'ARRAY', items: page },
    },
    required: [...v2.required, 'sharedTables', 'pages'],
    propertyOrdering: [...v2.propertyOrdering, 'sharedTables', 'pages'],
  };
}
