import { z } from 'zod';
import { sha256 } from '../asset/integrity';

const key = z.string().regex(/^[a-z0-9-]{1,40}$/);
const literal = z.string().max(160).refine(value => ![...value].some(character => {
  const code = character.charCodeAt(0);
  return (code < 32 && code !== 9 && code !== 10) || code === 127;
}), 'Unsupported control character');
const name = literal.refine(value => value.trim().length > 0 && !value.includes('\n'), 'Expected a label');
export const SourceReferenceSchema = z.object({ sourceId: key, page: z.number().int().min(1), quote: z.string().min(1).max(800) }).strict();
const candidate = z.object({ value: literal, source: SourceReferenceSchema }).strict();
const fact = z.discriminatedUnion('status', [
  z.object({ status: z.literal('known'), candidate }).strict(),
  z.object({ status: z.literal('missing'), reason: name }).strict(),
  z.object({ status: z.literal('conflict'), candidates: z.array(candidate).min(2).max(4) }).strict(),
]);
export const TechnicalInputSchema = z.object({
  version: z.literal(1), kind: z.literal('original-synthetic-specifications'),
  title: name, models: z.array(name).min(2).max(4),
  sources: z.array(z.object({ id: key, name, revision: name, kind: z.literal('synthetic'),
    pages: z.array(z.object({ number: z.number().int().min(1), text: z.string().max(50000) }).strict()).min(1).max(10),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).min(1).max(5),
  sections: z.array(z.object({ id: key, title: name, rows: z.array(z.object({
    id: key, label: name, unit: literal, condition: literal,
    values: z.array(fact).min(2).max(4),
  }).strict()).min(1).max(16) }).strict()).min(1).max(6),
}).strict().superRefine((input, ctx) => {
  const unique = (values: string[], path: string) => {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', path: [path], message: 'Duplicate identity' });
  };
  unique(input.models, 'models'); unique(input.sources.map(source => source.id), 'sources'); unique(input.sections.map(section => section.id), 'sections');
  if (input.sections.reduce((total, section) => total + section.rows.length, 0) > 48) ctx.addIssue({ code: 'custom', message: 'Maximum 48 facts' });
  for (const source of input.sources) unique(source.pages.map(page => String(page.number)), 'sources');
  for (const section of input.sections) {
    unique(section.rows.map(row => row.id), 'sections');
    for (const row of section.rows) if (row.values.length !== input.models.length) ctx.addIssue({ code: 'custom', message: 'Missing model position' });
  }
});
export type TechnicalInput = z.infer<typeof TechnicalInputSchema>;
export type SourceReference = z.infer<typeof SourceReferenceSchema>;
export type Decisions = Record<string, number | 'missing'>;
export const decisionKey = (section: string, row: string, modelIndex: number) => `${section}/${row}/${modelIndex}`;
export const sourcePayload = (pages: TechnicalInput['sources'][number]['pages']) => JSON.stringify(pages);
export const factQuote = (model: string, row: TechnicalInput['sections'][number]['rows'][number], value: string) =>
  `${model} | ${row.label} | ${value} | ${row.unit} | ${row.condition}`;

/** Fixture integrity only. This does not attest authenticity or extract real PDFs. */
export async function validateTechnicalInput(raw: unknown): Promise<TechnicalInput> {
  const input = TechnicalInputSchema.parse(raw);
  for (const source of input.sources) if (await sha256(sourcePayload(source.pages)) !== source.sha256) throw new Error('SOURCE_HASH_MISMATCH');
  const sources = new Map(input.sources.map(source => [source.id, source]));
  for (const section of input.sections) for (const row of section.rows) row.values.forEach((fact, model) => {
    if (fact.status === 'missing') return;
    for (const item of fact.status === 'known' ? [fact.candidate] : fact.candidates) {
      const page = sources.get(item.source.sourceId)?.pages.find(page => page.number === item.source.page);
      if (!page || item.source.quote !== factQuote(input.models[model], row, item.value) || !page.text.includes(item.source.quote)) throw new Error('SOURCE_QUOTE_MISMATCH');
    }
  });
  return input;
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
