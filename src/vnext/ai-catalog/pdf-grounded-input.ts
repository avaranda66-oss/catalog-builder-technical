import { z } from 'zod';
import { sha256 } from '../asset/integrity';
import {
  FactProposalSchema, decisionKey, sourcePayload, validateTechnicalInput,
  type Fact, type FactCandidate, type TechnicalInput,
} from './contracts';
import {
  pdfEvidenceSource, verificationPageText, verifyFactProposal,
  type FactVerificationReport, type VerifiedValue,
} from './fact-verifier';
import { extractPdfText, MAX_PDF_PAGES, type ExtractedPdf } from './pdf-intake';

const key = z.string().regex(/^[a-z0-9-]{1,40}$/);
/** Same fact contract as `contracts.ts` (no parallel schema); kept under its historical name. */
export const RealPdfExtractionProposalSchema = FactProposalSchema;
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
  /** Status of every value position, including the ones that could not be used. */
  readonly verification: FactVerificationReport;
}

const plainReason = (text: string) => text.replace(/\s+/gu, ' ').trim().slice(0, 160);
/**
 * Only text-verified values become `known`. Differing evidence becomes a
 * `conflict` for a person to decide. Anything else stays out of the catalog as
 * `missing`, with the reason in plain Portuguese (the report keeps the value).
 */
function technicalFact(value: VerifiedValue): Fact {
  const stamped = (index: number): FactCandidate => ({
    value: value.candidates[index].value, source: value.candidates[index].source, verification: value.candidates[index].status,
  });
  if (value.status === 'MISSING') return { status: 'missing', reason: plainReason(value.missingReason ?? '') || 'Não informado nas fontes.' };
  if (value.status === 'VERIFIED_TEXT' && value.selected !== undefined) return { status: 'known', candidate: stamped(value.selected) };
  if (value.status === 'CONFLICT') {
    const seen = new Set<string>(), options: FactCandidate[] = [];
    value.candidates.forEach((item, index) => {
      if (item.status !== 'VERIFIED_TEXT' && item.status !== 'VISUAL_ONLY') return;
      const literal = item.value.replace(/\s+/gu, ' ').trim();
      if (!seen.has(literal)) { seen.add(literal); options.push(stamped(index)); }
    });
    if (options.length >= 2 && options.length <= 4) return { status: 'conflict', candidates: options };
    return { status: 'missing', reason: 'As fontes trazem valores diferentes demais; confira e preencha à mão.' };
  }
  const page = value.candidates[0]?.source.page;
  return { status: 'missing', reason: value.status === 'VISUAL_ONLY'
    ? `Confira olhando a página ${page} do PDF antes de usar este valor.`
    : `Valor não confirmado no texto da página ${page} do PDF; confira antes de usar.` };
}

/**
 * Bridge from real PDF bytes to a page-indexed TechnicalInput. Model responses
 * are untrusted: they may suggest values but cannot invent measurements. Each
 * value is verified BY VALUE on the native text of its cited page (sign,
 * decimals, unit and condition kept literally; model and label may sit on
 * another line, as in 2D tables). One bad value never discards the others; it
 * is reported and left out. Scanned pages are VISUAL_ONLY, never verified.
 * No external provider calls.
 */
export async function prepareGroundedPdfInput(
  materials: readonly LocalPdfMaterial[],
  untrustedProposal: unknown,
): Promise<GroundedPdfPreparation> {
  const proposal = RealPdfExtractionProposalSchema.parse(untrustedProposal);
  if (materials.length < 1 || materials.length > 5) throw new Error('PDF_MATERIAL_COUNT_INVALID');
  const references = new Map<string, { material: LocalPdfMaterial; pdf: ExtractedPdf }>();
  for (const material of materials) {
    if (!key.safeParse(material.sourceId).success || references.has(material.sourceId) ||
        !material.revision.trim()) throw new Error('PDF_MATERIAL_ID_INVALID');
    const pdf = await extractPdfText(material.fileName, material.bytes);
    // Over-long single pages are handled per value (PAGE_TEXT_INCOMPLETE);
    // a document beyond the page index limit is not indexed at all.
    if (pdf.pageCount > MAX_PDF_PAGES) throw new Error('PDF_TEXT_INDEX_TRUNCATED');
    references.set(material.sourceId, { material, pdf });
  }
  const verification = verifyFactProposal(proposal,
    [...references].map(([sourceId, entry]) => pdfEvidenceSource(sourceId, entry.pdf)));
  const facts = new Map(verification.values.map(value => [value.id, technicalFact(value)]));
  const sections: TechnicalInput['sections'] = proposal.sections.map(section => ({
    ...section,
    rows: section.rows.map(row => ({ ...row, values: row.values.map((_, modelIndex) =>
      facts.get(decisionKey(section.id, row.id, modelIndex))!) })),
  }));
  const selectedPages = new Map<string, Set<number>>([...references.keys()].map(id => [id, new Set<number>()]));
  for (const fact of facts.values()) {
    if (fact.status === 'missing') continue;
    for (const candidate of fact.status === 'known' ? [fact.candidate] : fact.candidates) {
      selectedPages.get(candidate.source.sourceId)?.add(candidate.source.page);
    }
  }
  const sources: TechnicalInput['sources'] = [];
  for (const [id, entry] of references) {
    const pageNumbers = [...selectedPages.get(id)!].sort((a, b) => a - b);
    // A PDF that supports nothing is not declared as a reviewed source.
    if (!pageNumbers.length) continue;
    if (pageNumbers.length > 10) throw new Error('PDF_EVIDENCE_PAGE_BUDGET');
    // Same text the verifier used (native text plus lines rebuilt from positions).
    const pages = pageNumbers.map(number => ({ number, text: verificationPageText(entry.pdf.pages[number - 1]) }));
    sources.push({
      id, kind: 'pdf', name: entry.material.fileName,
      revision: entry.material.revision, pdfSha256: entry.pdf.sha256,
      pdfPageCount: entry.pdf.pageCount, pages, sha256: await sha256(sourcePayload(pages)),
    });
  }
  if (!sources.length) throw new Error('PDF_EVIDENCE_NONE_VERIFIED');
  const input = await validateTechnicalInput({
    version: 1,
    kind: 'grounded-pdf-specifications',
    title: proposal.title, models: proposal.models,
    sections, sources,
  });
  return {
    input,
    pdfBytes: sources.map(source => ({
      sourceId: source.id,
      sha256: source.kind === 'pdf' ? source.pdfSha256 : '',
      pageCount: source.kind === 'pdf' ? source.pdfPageCount : 0,
      readPages: source.pages.map(page => page.number),
    })),
    verification,
  };
}
