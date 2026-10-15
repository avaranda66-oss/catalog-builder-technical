import { z } from 'zod';
import { sha256 } from '../asset/integrity';
import {
  FactProposalSchema, decisionKey, sourcePayload, validateTechnicalInput,
  type Fact, type FactCandidate, type TechnicalInput,
} from './contracts';
import {
  pdfEvidenceSource, verificationMessage, verifyFactProposal,
  type FactVerificationReport, type PdfEvidenceSource, type VerifiedValue,
} from './fact-verifier';
import { extractPdfText, MAX_PDF_PAGES } from './pdf-intake';
import { verificationPageText } from './pdf-layout-evidence';

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

const REASON_LIMIT = 160;
/** One line of plain text that fits a stored reason (no control characters, at most 160 characters). */
function plainReason(text: string): string {
  const line = [...text.replace(/\s+/gu, ' ')].filter(character => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('').trim();
  return line.length <= REASON_LIMIT ? line : `${line.slice(0, REASON_LIMIT - 1).trimEnd()}…`;
}
/**
 * Only text-verified values become `known`. Differing evidence becomes a
 * `conflict` for a person to decide. Anything else stays out of the catalog as
 * `missing`, with the verifier's plain-Portuguese reason (naming the file when
 * it fits; the report keeps the value).
 */
function technicalFact(value: VerifiedValue, names: ReadonlyMap<string, string>): Fact {
  const stamped = (index: number): FactCandidate => ({
    value: value.candidates[index].value, source: value.candidates[index].source, verification: value.candidates[index].status,
  });
  const missing = (): Fact => {
    const named = plainReason(verificationMessage(value, names));
    const reason = named.endsWith('…') ? plainReason(verificationMessage(value)) : named;
    return { status: 'missing', reason: reason || 'Não informado nas fontes.' };
  };
  if (value.status === 'MISSING') return missing();
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
  return missing();
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
  const references = new Map<string, { material: LocalPdfMaterial; evidence: PdfEvidenceSource }>();
  for (const material of materials) {
    if (!key.safeParse(material.sourceId).success || references.has(material.sourceId) ||
        !material.revision.trim()) throw new Error('PDF_MATERIAL_ID_INVALID');
    const pdf = await extractPdfText(material.fileName, material.bytes);
    // Over-long single pages are handled per value (PAGE_TEXT_INCOMPLETE);
    // a document beyond the page index limit is not indexed at all.
    if (pdf.pageCount > MAX_PDF_PAGES) throw new Error('PDF_TEXT_INDEX_TRUNCATED');
    references.set(material.sourceId, {
      material, evidence: pdfEvidenceSource(material.sourceId, pdf, `${material.fileName} (revisão ${material.revision.trim()})`),
    });
  }
  const verification = verifyFactProposal(proposal, [...references.values()].map(entry => entry.evidence));
  const facts = new Map(verification.values.map(value => [value.id, technicalFact(value, verification.sourceNames)]));
  const sections: TechnicalInput['sections'] = proposal.sections.map(section => ({
    ...section,
    rows: section.rows.map(row => ({ ...row, values: row.values.map((_, modelIndex) =>
      facts.get(decisionKey(section.id, row.id, modelIndex))!) })),
  }));
  const pageKey = (sourceId: string, page: number) => `${sourceId}#${page}`;
  // Pages whose kept values rely on text positions (the model's column) store
  // those positions, so the sidecar re-verifies them exactly.
  const layoutPages = new Set(verification.values.flatMap(value => {
    const fact = facts.get(value.id);
    if (!fact || fact.status === 'missing') return [];
    return value.candidates.filter(item => item.usedLayout && item.status === 'VERIFIED_TEXT')
      .map(item => pageKey(item.source.sourceId, item.source.page));
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
    // Same text (and, when used, text positions) the verifier used.
    const pages = pageNumbers.map(number => {
      const page = entry.evidence.pages.find(item => item.number === number)!;
      const text = verificationPageText(page);
      return page.runs && layoutPages.has(pageKey(id, number)) ? { number, text, runs: page.runs } : { number, text };
    });
    sources.push({
      id, kind: 'pdf', name: entry.material.fileName,
      revision: entry.material.revision, pdfSha256: entry.evidence.sha256,
      pdfPageCount: entry.evidence.pageCount, pages, sha256: await sha256(sourcePayload(pages)),
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
