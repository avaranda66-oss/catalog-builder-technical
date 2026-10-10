import { z } from 'zod';
import { sha256 } from '../asset/integrity';
import {
  sourcePayload, validateTechnicalInput,
  type TechnicalInput,
} from './contracts';
import { extractPdfText, type ExtractedPdf } from './pdf-intake';
import { hasAtomicPdfEvidence } from './pdf-literal-evidence';

const literal = z.string().max(160);
const key = z.string().regex(/^[a-z0-9-]{1,40}$/);
const candidateSchema = z.object({
  value: literal,
  source: z.object({
    sourceId: key, page: z.number().int().min(1),
    quote: z.string().min(1).max(800),
  }).strict(),
}).strict();
const reportedFactSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('known'), candidate: candidateSchema }).strict(),
  z.object({ status: z.literal('missing'), reason: z.string().min(1).max(160) }).strict(),
  z.object({ status: z.literal('conflict'), candidates: z.array(candidateSchema).min(2).max(4) }).strict(),
]);
export const RealPdfExtractionProposalSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1).max(160),
  models: z.array(z.string().min(1).max(160)).min(2).max(4),
  sections: z.array(z.object({
    id: key, title: z.string().min(1).max(160),
    rows: z.array(z.object({
      id: key,
      label: z.string().min(1).max(160),
      unit: literal, condition: literal,
      values: z.array(reportedFactSchema).min(2).max(4),
    }).strict()).min(1).max(16),
  }).strict()).min(1).max(16),
}).strict();
export type RealPdfExtractionProposal = z.infer<typeof RealPdfExtractionProposalSchema>;

export interface LocalPdfMaterial {
  readonly sourceId: string;
  readonly fileName: string;
  readonly revision: string;
  readonly bytes: ArrayBuffer;
}
export interface GroundedPdfPreparation {
  readonly input: TechnicalInput;
  /** PDF byte hashes are native source evidence; they are not synthetic index hashes. */
  readonly pdfBytes: readonly { sourceId: string; sha256: string; pageCount: number; readPages: number[] }[];
}

/**
 * STRICT bridge. Model responses are untrusted: they may suggest the cells but
 * cannot invent measurements. Read actual PDF bytes locally, verify each
 * source/page/quote/value/model, and preserve real-document type before any
 * canonical DocumentSession is created. No external provider calls.
 *
 * This bridge is intentionally limited to text-searchable, contiguous
 * quotations. Images/scanned 2D tables must be sent to a separately reviewed
 * visual extraction path rather than guessed.
 */
export async function prepareGroundedPdfInput(
  materials: readonly LocalPdfMaterial[],
  untrustedProposal: unknown,
): Promise<GroundedPdfPreparation> {
  const proposal = RealPdfExtractionProposalSchema.parse(untrustedProposal);
  if (proposal.sections.reduce((count, section) => count + section.rows.length, 0) > 192) {
    throw new Error('PDF_EXTRACTION_ROW_LIMIT');
  }
  if (materials.length < 1 || materials.length > 5) throw new Error('PDF_MATERIAL_COUNT_INVALID');
  const references = new Map<string, { material: LocalPdfMaterial; pdf: ExtractedPdf }>();
  for (const material of materials) {
    if (!key.safeParse(material.sourceId).success || references.has(material.sourceId) ||
        !material.revision.trim()) throw new Error('PDF_MATERIAL_ID_INVALID');
    const pdf = await extractPdfText(material.fileName, material.bytes);
    if (pdf.truncated || pdf.pageCount > 1000) throw new Error('PDF_TEXT_INDEX_TRUNCATED');
    references.set(material.sourceId, { material, pdf });
  }
  const selectedPages = new Map<string, Set<number>>(
    [...references.keys()].map(id => [id, new Set<number>()]),
  );
  const labels = proposal.sections.flatMap(section => section.rows.map(row => row.label));
  for (const section of proposal.sections) for (const row of section.rows) {
    if (row.values.length !== proposal.models.length) throw new Error('PDF_MODEL_COVERAGE_INVALID');
    for (const [modelIndex, fact] of row.values.entries()) {
      if (fact.status === 'missing') continue;
      for (const candidate of fact.status === 'known' ? [fact.candidate] : fact.candidates) {
        const source = references.get(candidate.source.sourceId);
        const page = source?.pdf.pages.find(page => page.number === candidate.source.page);
        if (!source || !page || page.needsVisualExtraction || page.textLength !== page.text.length) {
          throw new Error('PDF_EVIDENCE_PAGE_UNREADABLE');
        }
        if (!page.text.includes(candidate.source.quote) || !hasAtomicPdfEvidence({
          quote: candidate.source.quote, model: proposal.models[modelIndex], models: proposal.models,
          label: row.label, labels, value: candidate.value, unit: row.unit, condition: row.condition,
        })) {
          throw new Error('PDF_EVIDENCE_VALUE_UNGROUNDED');
        }
        selectedPages.get(candidate.source.sourceId)!.add(candidate.source.page);
      }
    }
  }
  const sources: TechnicalInput['sources'] = [];
  for (const [id, entry] of references) {
    const pageNumbers = [...selectedPages.get(id)!].sort((a, b) => a - b);
    if (!pageNumbers.length || pageNumbers.length > 10) throw new Error('PDF_EVIDENCE_PAGE_BUDGET');
    const pages = pageNumbers.map(number => ({
      number, text: entry.pdf.pages[number - 1].text,
    }));
    sources.push({
      id, kind: 'pdf', name: entry.material.fileName,
      revision: entry.material.revision, pdfSha256: entry.pdf.sha256,
      pdfPageCount: entry.pdf.pageCount, pages, sha256: await sha256(sourcePayload(pages)),
    });
  }
  const input = await validateTechnicalInput({
    version: 1,
    kind: 'grounded-pdf-specifications',
    title: proposal.title, models: proposal.models,
    sections: proposal.sections, sources,
  });
  return {
    input,
    pdfBytes: sources.map(source => ({
      sourceId: source.id,
      sha256: source.kind === 'pdf' ? source.pdfSha256 : '',
      pageCount: source.kind === 'pdf' ? source.pdfPageCount : 0,
      readPages: source.pages.map(page => page.number),
    })),
  };
}
