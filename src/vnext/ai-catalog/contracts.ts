import { z } from 'zod';
import { sha256 } from '../asset/integrity';
import { checkValueTextEvidence } from './pdf-literal-evidence';

const key = z.string().regex(/^[a-z0-9-]{1,40}$/);
const literal = z.string().max(160).refine(value => ![...value].some(character => {
  const code = character.charCodeAt(0);
  return (code < 32 && code !== 9 && code !== 10) || code === 127;
}), 'Unsupported control character');
const name = literal.refine(value => value.trim().length > 0 && !value.includes('\n'), 'Expected a label');
const fileSha256 = z.string().regex(/^[a-f0-9]{64}$/);
const boxCoordinate = z.number().int().min(0).max(1000);

/**
 * Per-candidate verification result. It is always recomputed locally from the
 * exact file bytes; a status written by a model or a file is never trusted.
 * - VERIFIED_TEXT: the literal value is in the native text of the cited page.
 * - VERIFIED_CELL: the value equals the spreadsheet cell at the cited address.
 * - VISUAL_ONLY: the cited page or region has no usable native text; a person
 *   must look at the page before the value can be used.
 * - UNVERIFIED: the cited source does not support the value.
 */
export const CANDIDATE_VERIFICATION_STATUSES = ['VERIFIED_TEXT', 'VERIFIED_CELL', 'VISUAL_ONLY', 'UNVERIFIED'] as const;
export const CandidateVerificationSchema = z.enum(CANDIDATE_VERIFICATION_STATUSES);
export type CandidateVerification = z.infer<typeof CandidateVerificationSchema>;
/** Status of one value position (model × row): its candidates, or a conflict between them. */
export type ValueVerificationStatus = CandidateVerification | 'CONFLICT';
export const isVerifiedStatus = (status: string): status is 'VERIFIED_TEXT' | 'VERIFIED_CELL' =>
  status === 'VERIFIED_TEXT' || status === 'VERIFIED_CELL';

/** Spreadsheet location: optional sheet name (absent for CSV) and an A1 address. */
export const SourceCellReferenceSchema = z.object({
  sheet: name.optional(),
  address: z.string().regex(/^\$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,6}$/),
}).strict();
export type SourceCellReference = z.infer<typeof SourceCellReferenceSchema>;
/** Gemini bounding box: [ymin, xmin, ymax, xmax] normalized to 0-1000. */
export const SourceBox2dSchema = z.tuple([boxCoordinate, boxCoordinate, boxCoordinate, boxCoordinate])
  .refine(([ymin, xmin, ymax, xmax]) => ymin < ymax && xmin < xmax, 'Invalid box');
/**
 * Where a value came from. `page` is the 1-based PDF page, or the 1-based sheet
 * number for spreadsheets (with `cell`). `sha256` is the hash of the original
 * file bytes, so a citation can never move to another file silently.
 */
export const SourceReferenceSchema = z.object({
  sourceId: key, page: z.number().int().min(1), quote: z.string().min(1).max(800),
  sha256: fileSha256.optional(), box_2d: SourceBox2dSchema.optional(), cell: SourceCellReferenceSchema.optional(),
}).strict();
const candidate = z.object({
  value: literal, source: SourceReferenceSchema, verification: CandidateVerificationSchema.optional(),
}).strict();
export const FactSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('known'), candidate }).strict(),
  z.object({ status: z.literal('missing'), reason: name }).strict(),
  z.object({ status: z.literal('conflict'), candidates: z.array(candidate).min(2).max(4) }).strict(),
]);
export type Fact = z.infer<typeof FactSchema>;
export type FactCandidate = z.infer<typeof candidate>;
const sectionsSchema = z.array(z.object({ id: key, title: name, rows: z.array(z.object({
  id: key, label: name, unit: literal, condition: literal,
  values: z.array(FactSchema).min(1).max(6),
}).strict()).min(1).max(16) }).strict()).min(1).max(16);
const modelsSchema = z.array(name).min(1).max(6);
type FactMatrix = { models: string[]; sections: z.infer<typeof sectionsSchema> };
function refineFactMatrix(input: FactMatrix, ctx: z.RefinementCtx) {
  const unique = (values: string[], path: string) => {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', path: [path], message: 'Duplicate identity' });
  };
  unique(input.models, 'models'); unique(input.sections.map(section => section.id), 'sections');
  if (input.sections.reduce((total, section) => total + section.rows.length, 0) > 192) ctx.addIssue({ code: 'custom', message: 'Maximum 192 facts' });
  for (const section of input.sections) {
    unique(section.rows.map(row => row.id), 'sections');
    for (const row of section.rows) if (row.values.length !== input.models.length) ctx.addIssue({ code: 'custom', message: 'Missing model position' });
  }
}
/**
 * The untrusted fact proposal (from a model or an extraction script): one value
 * position per model and row, each known, missing or in conflict. One model is
 * enough (single-product datasheet).
 */
export const FactProposalSchema = z.object({
  version: z.literal(1), title: name, models: modelsSchema, sections: sectionsSchema,
}).strict().superRefine(refineFactMatrix);
export type FactProposal = z.infer<typeof FactProposalSchema>;

const sourcePages = z.array(z.object({
  number: z.number().int().min(1), text: z.string().max(50000),
}).strict()).min(1).max(10);
const indexedSource = {
  id: key, name, revision: name, pages: sourcePages,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
};
const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ ...indexedSource, kind: z.literal('synthetic') }).strict(),
  z.object({ ...indexedSource, kind: z.literal('pdf'),
    pdfSha256: z.string().regex(/^[a-f0-9]{64}$/),
    pdfPageCount: z.number().int().min(1).max(1000),
  }).strict(),
]);
export const TechnicalInputSchema = z.object({
  version: z.literal(1), kind: z.enum(['original-synthetic-specifications', 'grounded-pdf-specifications']),
  title: name, models: modelsSchema,
  sources: z.array(sourceSchema).min(1).max(6),
  sections: sectionsSchema,
}).strict().superRefine((input, ctx) => {
  refineFactMatrix(input, ctx);
  const unique = (values: string[], path: string) => {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', path: [path], message: 'Duplicate identity' });
  };
  unique(input.sources.map(source => source.id), 'sources');
  if (input.sources.some(source => (input.kind === 'grounded-pdf-specifications' ? source.kind !== 'pdf' : source.kind !== 'synthetic'))) {
    ctx.addIssue({ code: 'custom', path: ['sources'], message: 'Mismatched technical source type' });
  }
  for (const source of input.sources) unique(source.pages.map(page => String(page.number)), 'sources');
});
export type TechnicalInput = z.infer<typeof TechnicalInputSchema>;
export type SourceReference = z.infer<typeof SourceReferenceSchema>;
export type Decisions = Record<string, number | 'missing'>;
export const decisionKey = (section: string, row: string, modelIndex: number) => `${section}/${row}/${modelIndex}`;
export const sourcePayload = (pages: TechnicalInput['sources'][number]['pages']) => JSON.stringify(pages);
export const factQuote = (model: string, row: TechnicalInput['sections'][number]['rows'][number], value: string) =>
  `${model} | ${row.label} | ${value} | ${row.unit} | ${row.condition}`;

/**
 * Checks a sidecar's integrity; only the byte-grounded bridge attests PDF byte hashes.
 * A grounded-PDF sidecar may only hold values that re-verify by value on the
 * stored page text (`VERIFIED_TEXT`), plus `VISUAL_ONLY` alternatives inside a
 * conflict that a person must decide. Spreadsheet cells and unverified values
 * travel in the fact verification report, never in this page-indexed sidecar.
 */
export async function validateTechnicalInput(raw: unknown): Promise<TechnicalInput> {
  const input = TechnicalInputSchema.parse(raw);
  for (const source of input.sources) if (await sha256(sourcePayload(source.pages)) !== source.sha256) throw new Error('SOURCE_HASH_MISMATCH');
  const sources = new Map(input.sources.map(source => [source.id, source]));
  const labels = input.sections.flatMap(section => section.rows.map(row => row.label));
  for (const section of input.sections) for (const row of section.rows) row.values.forEach((fact, model) => {
    if (fact.status === 'missing') return;
    for (const item of fact.status === 'known' ? [fact.candidate] : fact.candidates) {
      const source = sources.get(item.source.sourceId);
      const page = source?.pages.find(page => page.number === item.source.page);
      if (!source || !page) throw new Error('SOURCE_QUOTE_MISMATCH');
      if (item.source.cell || item.verification === 'VERIFIED_CELL' || item.verification === 'UNVERIFIED') {
        throw new Error('SOURCE_VERIFICATION_UNSUPPORTED');
      }
      if (item.source.sha256 && item.source.sha256 !== (source.kind === 'pdf' ? source.pdfSha256 : source.sha256)) {
        throw new Error('SOURCE_HASH_MISMATCH');
      }
      if (input.kind === 'original-synthetic-specifications') {
        if (item.verification && item.verification !== 'VERIFIED_TEXT') throw new Error('SOURCE_VERIFICATION_UNSUPPORTED');
        if (!page.text.includes(item.source.quote)) throw new Error('SOURCE_QUOTE_MISMATCH');
        if (item.source.quote !== factQuote(input.models[model], row, item.value)) throw new Error('SOURCE_QUOTE_MISMATCH');
        continue;
      }
      if (item.verification === 'VISUAL_ONLY') {
        // Only a person can confirm it; it may stand as one side of a conflict.
        if (fact.status !== 'conflict') throw new Error('SOURCE_VALUE_UNVERIFIED');
        continue;
      }
      const check = checkValueTextEvidence({
        pageText: page.text, quote: item.source.quote, value: item.value,
        model: input.models[model], models: input.models, label: row.label, labels,
        unit: row.unit, condition: row.condition,
      });
      if (!check.verified) {
        throw new Error(check.problem === 'QUOTE_NOT_ON_PAGE' ? 'SOURCE_QUOTE_MISMATCH' : 'PDF_QUOTE_VALUE_UNGROUNDED');
      }
    }
  });
  return input;
}

/** The demo JSON upload cannot self-declare a PDF hash without uploading bytes. */
export async function validateSyntheticFileInput(raw: unknown): Promise<TechnicalInput> {
  const input = TechnicalInputSchema.parse(raw);
  if (input.kind !== 'original-synthetic-specifications') throw new Error('PDF_BYTES_REQUIRED');
  return validateTechnicalInput(input);
}

export function reviewIssues(input: TechnicalInput, decisions: Decisions) {
  return input.sections.flatMap(section => section.rows.flatMap(row => row.values.flatMap((fact, model) => {
    if (fact.status === 'known') return [];
    const id = decisionKey(section.id, row.id, model), choice = decisions[id];
    const resolved = fact.status === 'missing' ? choice === 'missing' : typeof choice === 'number' && Number.isInteger(choice) && choice >= 0 && choice < fact.candidates.length;
    return [{ id, section: section.title, label: row.label, model: input.models[model], fact, resolved }];
  })));
}

export function selectedValue(input: TechnicalInput, sectionIndex: number, rowIndex: number, model: number, decisions: Decisions) {
  const section = input.sections[sectionIndex], row = section.rows[rowIndex], fact = row.values[model];
  if (fact.status === 'known') return { value: fact.candidate.value, source: fact.candidate.source, status: 'known' as const };
  if (fact.status === 'missing') return { value: 'Não informado', status: 'missing' as const };
  const choice = decisions[decisionKey(section.id, row.id, model)];
  if (typeof choice !== 'number' || !Number.isInteger(choice) || !fact.candidates[choice]) return { value: 'Revisar conflito', status: 'conflict' as const };
  return { value: fact.candidates[choice].value, source: fact.candidates[choice].source, status: 'resolved' as const };
}
