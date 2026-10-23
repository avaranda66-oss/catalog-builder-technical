import {
  extractFactsFromFile, readDraftReadiness, requestCatalogPlan,
  type DraftClient, type DraftClientCode, type DraftReadiness, type ServerCatalogPlan,
} from '../draft-client';
import type { PlanBrief } from '../catalog-plan-contract';
import { DRAFT_LIMITS } from '../draft-contract';
import type { ExtractionReview } from '../extraction-review';
import { extractPdfText, type ExtractedPdf } from '../pdf-intake';

/**
 * J2-lite (slice 3B): the one door between "Montar tabela de especificações a
 * partir deste PDF" and the file reading. Injectable, so a proof harness can
 * answer with a controlled provider while everything after it (the check of
 * every value against the PDF's own text, the pending panel, the compiler)
 * stays the real code.
 *
 * The production door (`serverSpecTableGateway`) sends NO credential: the
 * extraction always uses the server key (vnext-catalog-draft, FR-66).
 */
export interface SpecTableExtractInput {
  readonly file: File;
  /** The same file read here (pdf-intake): the evidence the answer is checked against. */
  readonly pdf: ExtractedPdf;
  readonly firstPage: number;
  readonly lastPage: number;
  /** Short id of the file in the pending list ("arquivo-1"). */
  readonly sourceId: string;
  readonly models?: readonly string[];
}
export interface SpecTableGateway {
  /** Free check (no provider call, no budget): can reading start now? */
  readiness(): Promise<DraftReadiness>;
  /** Reads the PDF text on this computer. */
  readPdf(file: File): Promise<ExtractedPdf>;
  /** Reads the chosen pages with the AI and checks every value against `pdf`. */
  extract(input: SpecTableExtractInput): Promise<ExtractionReview>;
  /**
   * FR-70: the AI proposes the plan of the whole catalog from the page texts and the checked facts (task
   * `plan_draft`). Untrusted: catalog-plan.ts checks every literal. Without it the assistant offers no catalog plan.
   */
  plan?(brief: PlanBrief): Promise<ServerCatalogPlan>;
}

/** The file's bytes (older browsers have no Blob.arrayBuffer; source-intake reads files the same way). */
export async function fileBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('SOURCE_READ_FAILED'));
    reader.readAsArrayBuffer(file);
  });
}
async function readPdfHere(file: File): Promise<ExtractedPdf> {
  return extractPdfText(file.name, await fileBytes(file));
}

/**
 * The function vnext-catalog-draft may not be deployed yet. A browser that is
 * online but cannot reach it at all (an unknown function answers without the
 * CORS headers, so the browser reports a network failure) is told the reading
 * is not available, not that the internet is down.
 */
export function readinessCode(code: DraftClientCode, online = typeof navigator === 'undefined' || navigator.onLine !== false): DraftClientCode {
  return code === 'NETWORK' && online ? 'DRAFT_UNAVAILABLE' : code;
}

export function serverSpecTableGateway(client: DraftClient, userId: string,
  options: { readonly readPdf?: (file: File) => Promise<ExtractedPdf> } = {}): SpecTableGateway {
  return {
    async readiness() {
      const readiness = await readDraftReadiness(client);
      return readiness.kind === 'blocked' ? { kind: 'blocked', code: readinessCode(readiness.code) } : readiness;
    },
    readPdf: options.readPdf ?? readPdfHere,
    async extract(input) {
      const { review } = await extractFactsFromFile(client, {
        userId, sourceId: input.sourceId, pdf: input.pdf, firstPage: input.firstPage, lastPage: input.lastPage,
        file: { name: input.file.name, ...(input.file.type ? { type: input.file.type } : {}), bytes: await fileBytes(input.file) },
        ...(input.models?.length ? { models: input.models } : {}),
      });
      return review;
    },
    plan: brief => requestCatalogPlan(client, brief),
  };
}

/** Words and printed units that mark a page of technical specifications (PT, EN, ES). */
const SPEC_WORDS = /(?:especifica[cç]|specification|technical data|dados t[eé]cnicos|caracter[ií]sticas t[eé]cnicas|faixa|range|rango|exatid[aã]o|accuracy|exactitud|precis[aã]o|resolu[cç]|resolution|estabilidade|stability|alimenta[cç]|power supply|pot[eê]ncia|power|peso|weight|dimens|temperatura ambiente|ambient temperature)/giu;
const PRINTED_UNIT = /\d\s?(?:°\s?[CF]|º\s?[CF]|mA|mV|V(?![a-z])|W(?![a-z])|Hz|bar|psi|kPa|MPa|mm|kg|%)/gu;
export const specificationPageScore = (text: string) => (text.match(SPEC_WORDS)?.length ?? 0) + (text.match(PRINTED_UNIT)?.length ?? 0);

export interface PageGuess {
  readonly firstPage: number;
  readonly lastPage: number;
  /** False when no page looked like specifications: the range is only a starting point. */
  readonly found: boolean;
}

/** Model names typed by the person ("TA-25N, TA-35N"), as printed: at most 6, each up to 60 characters. */
export function parseModelNames(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split(/[,;\n]/u)) {
    const name = raw.replace(/\s+/gu, ' ').trim().slice(0, 60);
    if (name && !names.some(other => other.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names.slice(0, 6);
}
const mentions = (text: string, models: readonly string[]) => {
  const flat = text.replace(/\s+/gu, ' ').toLowerCase();
  return models.some(model => flat.includes(model.toLowerCase()));
};

/**
 * The pages most likely to hold the specification table, read from the text
 * on this computer: the best page plus the neighbouring page, before or after
 * it, that still looks like specifications (at most `maxPages`). With the
 * models the person typed, only pages that name one of them count: the TA
 * folder has several product families on pages 9 to 16, and "TA-25N" leads
 * to pages 9 and 10. Only a suggestion: the person can change it before
 * anything is sent.
 */
export function guessSpecificationPages(pdf: Pick<ExtractedPdf, 'pageCount' | 'pages'>,
  options: { readonly maxPages?: number; readonly models?: readonly string[] } = {}): PageGuess {
  const limit = Math.max(1, Math.min(options.maxPages ?? 2, DRAFT_LIMITS.maxRangePages));
  const models = options.models ?? [];
  const scores = new Map(pdf.pages.filter(page => !models.length || mentions(page.text, models))
    .map(page => [page.number, specificationPageScore(page.text)]));
  let best = 0, bestScore = 0;
  for (const [page, score] of scores) if (score > bestScore) { best = page; bestScore = score; }
  if (!best || bestScore < 3) return { firstPage: 1, lastPage: Math.min(pdf.pageCount, limit), found: false };
  const looksLikeSpecs = (page: number) => page >= 1 && page <= pdf.pageCount && (scores.get(page) ?? 0) * 2 >= bestScore;
  let first = best, last = best;
  while (last - first + 1 < limit) {
    const before = looksLikeSpecs(first - 1) ? scores.get(first - 1) ?? 0 : -1;
    const after = looksLikeSpecs(last + 1) ? scores.get(last + 1) ?? 0 : -1;
    if (before < 0 && after < 0) break;
    if (before >= after) first--; else last++;
  }
  return { firstPage: first, lastPage: last, found: true };
}

/** Plain-Portuguese check of a page range typed by the person; undefined when it can be read. */
export function pageRangeProblem(firstPage: number, lastPage: number, pageCount: number): string | undefined {
  if (![firstPage, lastPage].every(page => Number.isInteger(page) && page >= 1 && page <= pageCount)) {
    return `Escolha páginas entre 1 e ${pageCount}.`;
  }
  if (firstPage > lastPage) return 'A primeira página precisa vir antes da última.';
  if (lastPage - firstPage + 1 > DRAFT_LIMITS.maxRangePages) {
    return `Escolha no máximo ${DRAFT_LIMITS.maxRangePages} páginas de cada vez (só as de especificações).`;
  }
  return undefined;
}
