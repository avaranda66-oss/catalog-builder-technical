import type { ExtractedPdf } from './pdf-intake';

export interface PdfFactCandidate {
  readonly factId: string;
  readonly value: string;
  readonly unit: string;
  readonly page: number;
  readonly quote: string;
  readonly pdfSha256: string;
}
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/gu, ' ').trim();
}

/**
 * Fail closed if an AI-suggested value is not explicitly visible in the cited
 * passage on the cited page of the EXACT uploaded document bytes.
 * This is evidence-location validation, NOT verification of engineering truth.
 */
export function verifyPdfFactEvidence(pdf: ExtractedPdf, candidate: PdfFactCandidate): void {
  if (!/^[a-z0-9][a-z0-9:_-]{0,79}$/.test(candidate.factId) ||
      !candidate.value || candidate.value.length > 160 || candidate.unit.length > 70 ||
      !Number.isInteger(candidate.page) || candidate.page < 1 ||
      candidate.pdfSha256 !== pdf.sha256 || !/^[a-f0-9]{64}$/.test(candidate.pdfSha256)) {
    throw new Error('PDF_FACT_SOURCE_INVALID');
  }
  const page = pdf.pages.find(p => p.number === candidate.page);
  if (!page || page.needsVisualExtraction || page.textLength > page.text.length) {
    throw new Error('PDF_FACT_PAGE_UNVERIFIED');
  }
  const quote = normalizeWhitespace(candidate.quote);
  const pageText = normalizeWhitespace(page.text);
  if (!quote || quote.length > 800 || !pageText.includes(quote)) {
    throw new Error('PDF_FACT_QUOTE_MISSING');
  }
  // Strict literal preservation. No implicit decimal conversion, sign repair,
  // rounded tolerances, unit inference, or model-generated math.
  // Do not treat '10.0' as a valid citation of '10.00'.
  const numericBoundaryMatch = (haystack: string, needle: string): boolean => {
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      const before = haystack[index - 1] ?? '';
      const after = haystack[index + needle.length] ?? '';
      if (!/[0-9.,]/.test(before) && !/[0-9.,]/.test(after)) return true;
      index = haystack.indexOf(needle, index + 1);
    }
    return false;
  };
  if (!numericBoundaryMatch(quote, candidate.value) ||
      (candidate.unit && !quote.includes(candidate.unit))) {
    throw new Error('PDF_FACT_VALUE_UNGROUNDED');
  }
}
export function verifyPdfFactBatch(
  pdf: ExtractedPdf, candidates: readonly PdfFactCandidate[]
): readonly PdfFactCandidate[] {
  if (candidates.length < 1 || candidates.length > 300) throw new Error('PDF_FACT_BATCH_INVALID');
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.factId)) throw new Error('PDF_FACT_DUPLICATE_ID');
    seen.add(candidate.factId);
    verifyPdfFactEvidence(pdf, candidate);
  }
  return candidates;
}
