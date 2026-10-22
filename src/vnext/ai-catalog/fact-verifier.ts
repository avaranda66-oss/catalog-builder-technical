import {
  FactProposalSchema, decisionKey, isVerifiedStatus,
  type CandidateVerification, type FactCandidate, type FactProposal, type SourceReference, type ValueVerificationStatus,
} from './contracts';
import type { ExtractedPdf, ExtractedPdfPage } from './pdf-intake';
import {
  MAX_EVIDENCE_PAGE_TEXT, checkPdfValueOnPage, evidenceRuns, verificationPageText, type PdfValueReason,
} from './pdf-layout-evidence';
import { normalizeEvidenceWhitespace } from './pdf-literal-evidence';

/**
 * Per-value fact verification (FR-67). It only orchestrates checks that run
 * locally on the exact file bytes the user provided; it never calls a model.
 * One bad value never discards the others: every value position gets its own
 * status, and only VERIFIED_TEXT / VERIFIED_CELL may be used without a person.
 *
 * Why this module exists (IDS: CREATE): no spreadsheet-cell verifier existed,
 * and pdf-evidence.ts / pdf-grounded-input.ts were all-or-nothing throws.
 */

export type VerificationReason =
  | PdfValueReason
  | 'SOURCE_NOT_PROVIDED' | 'SOURCE_HASH_MISMATCH' | 'SOURCE_KIND_MISMATCH'
  | 'PAGE_NOT_FOUND' | 'PAGE_TEXT_INCOMPLETE' | 'PAGE_NEEDS_VISUAL_CHECK' | 'VISUAL_REGION_ONLY'
  | 'CELL_REFERENCE_REQUIRED' | 'CELL_NOT_FOUND' | 'CELL_VALUE_MISMATCH';

/** A PDF read locally (pdf-intake), with its native text and text positions. */
export interface PdfEvidenceSource {
  readonly kind: 'pdf';
  readonly sourceId: string;
  /** How messages name the file for a person (file name, revision). */
  readonly name?: string;
  readonly sha256: string;
  readonly pageCount: number;
  readonly pages: readonly ExtractedPdfPage[];
}
/** A spreadsheet read locally; cell text exactly as the intake produced it. */
export interface SheetEvidenceSource {
  readonly kind: 'sheet';
  readonly sourceId: string;
  readonly name?: string;
  readonly sha256: string;
  readonly sheets: readonly {
    readonly number: number;
    readonly name?: string;
    /** A1 address (upper case, no $) -> cell text. */
    readonly cells: Readonly<Record<string, string>>;
  }[];
}
export type EvidenceSource = PdfEvidenceSource | SheetEvidenceSource;

/**
 * A PDF as evidence. Text positions are kept rounded (or dropped when too many
 * or too long), exactly as a stored sidecar keeps them, so both verify alike.
 */
export function pdfEvidenceSource(sourceId: string, pdf: ExtractedPdf, name: string = pdf.fileName): PdfEvidenceSource {
  const pages = pdf.pages.map((page): ExtractedPdfPage => {
    const runs = evidenceRuns(page.runs);
    return { number: page.number, text: page.text, textLength: page.textLength, needsVisualExtraction: page.needsVisualExtraction,
      ...(runs ? { runs } : {}) };
  });
  return { kind: 'pdf', sourceId, ...(name.trim() ? { name } : {}), sha256: pdf.sha256, pageCount: pdf.pageCount, pages };
}

const cellAddress = (address: string) => address.replace(/\$/gu, '').toUpperCase();
const columnLetters = (index: number) => {
  let result = '';
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result;
  return result;
};
/**
 * Builds sheet evidence from table rows. `addresses` may be the intake's own
 * ("Aba!B7" for XLSX, "B7" for CSV); without them, A1 addresses are derived.
 */
export function sheetEvidenceSource(sourceId: string, sha256: string, sheets: readonly {
  number: number; name?: string; rows: readonly (readonly string[])[]; addresses?: readonly (readonly string[])[];
}[]): SheetEvidenceSource {
  return {
    kind: 'sheet', sourceId, sha256,
    sheets: sheets.map(sheet => {
      const cells: Record<string, string> = {};
      sheet.rows.forEach((row, rowIndex) => row.forEach((text, columnIndex) => {
        const raw = sheet.addresses?.[rowIndex]?.[columnIndex] ?? `${columnLetters(columnIndex)}${rowIndex + 1}`;
        const address = cellAddress(raw.includes('!') ? raw.slice(raw.lastIndexOf('!') + 1) : raw);
        if (/^[A-Z]{1,3}[1-9][0-9]{0,6}$/u.test(address)) cells[address] = text;
      }));
      return { number: sheet.number, ...(sheet.name ? { name: sheet.name } : {}), cells };
    }),
  };
}

export interface CandidateContext {
  readonly model: string;
  readonly models: readonly string[];
  readonly modelIndex: number;
  readonly label: string;
  readonly labels: readonly string[];
  readonly unit: string;
  readonly condition: string;
}
export interface CandidateCheck {
  readonly status: CandidateVerification;
  readonly reason?: VerificationReason;
  /** Only the page's text positions tie the value to its model's column. */
  readonly usedLayout?: true;
}

function verifyPdfCandidate(source: PdfEvidenceSource, candidate: FactCandidate, context: CandidateContext): CandidateCheck {
  const page = source.pages.find(item => item.number === candidate.source.page);
  if (!page || candidate.source.page > source.pageCount) return { status: 'UNVERIFIED', reason: 'PAGE_NOT_FOUND' };
  if (page.needsVisualExtraction) return { status: 'VISUAL_ONLY', reason: 'PAGE_NEEDS_VISUAL_CHECK' };
  const text = verificationPageText(page);
  // A page cut short (or too long to store) cannot be checked as a whole: an
  // other model or a conflicting line may sit in the part that is missing.
  if (page.textLength > page.text.length || text.length > MAX_EVIDENCE_PAGE_TEXT) {
    return { status: 'UNVERIFIED', reason: 'PAGE_TEXT_INCOMPLETE' };
  }
  const check = checkPdfValueOnPage({ text, ...(page.runs ? { runs: page.runs } : {}) },
    { value: candidate.value, quote: candidate.source.quote }, context);
  // A page with some text can still carry the table as an image: a value the
  // model located by region (box_2d) but absent from the text layer is
  // something a person must look at, never a verified value.
  if (check.status === 'UNVERIFIED' && candidate.source.box_2d &&
      (check.reason === 'QUOTE_NOT_ON_PAGE' || check.reason === 'VALUE_NOT_IN_QUOTE')) {
    return { status: 'VISUAL_ONLY', reason: 'VISUAL_REGION_ONLY' };
  }
  return { status: check.status, ...(check.reason ? { reason: check.reason } : {}), ...(check.usedLayout ? { usedLayout: true as const } : {}) };
}

const sameCellText = (cell: string, value: string, unit: string) => {
  const text = normalizeEvidenceWhitespace(cell), wanted = normalizeEvidenceWhitespace(value), suffix = normalizeEvidenceWhitespace(unit);
  return text === wanted || (suffix !== '' && (text === `${wanted} ${suffix}` || text === `${wanted}${suffix}`));
};
function verifySheetCandidate(source: SheetEvidenceSource, candidate: FactCandidate, context: CandidateContext): CandidateCheck {
  const reference = candidate.source.cell;
  if (!reference) return { status: 'UNVERIFIED', reason: 'CELL_REFERENCE_REQUIRED' };
  if (!normalizeEvidenceWhitespace(candidate.value)) return { status: 'UNVERIFIED', reason: 'EMPTY_VALUE' };
  const sheet = reference.sheet !== undefined
    ? source.sheets.find(item => item.name === reference.sheet)
    : source.sheets.find(item => item.number === candidate.source.page);
  const text = sheet?.cells[cellAddress(reference.address)];
  if (text === undefined) return { status: 'UNVERIFIED', reason: 'CELL_NOT_FOUND' };
  return sameCellText(text, candidate.value, context.unit)
    ? { status: 'VERIFIED_CELL' }
    : { status: 'UNVERIFIED', reason: 'CELL_VALUE_MISMATCH' };
}

/** Verifies one candidate against the provided local sources. Claimed statuses are ignored. */
export function verifyCandidate(candidate: FactCandidate, context: CandidateContext,
  sources: ReadonlyMap<string, EvidenceSource>): CandidateCheck {
  const source = sources.get(candidate.source.sourceId);
  if (!source) return { status: 'UNVERIFIED', reason: 'SOURCE_NOT_PROVIDED' };
  if (candidate.source.sha256 && candidate.source.sha256 !== source.sha256) return { status: 'UNVERIFIED', reason: 'SOURCE_HASH_MISMATCH' };
  if (source.kind === 'pdf') {
    return candidate.source.cell ? { status: 'UNVERIFIED', reason: 'SOURCE_KIND_MISMATCH' } : verifyPdfCandidate(source, candidate, context);
  }
  return verifySheetCandidate(source, candidate, context);
}

export interface VerifiedCandidate {
  readonly value: string;
  readonly source: SourceReference;
  readonly status: CandidateVerification;
  readonly reason?: VerificationReason;
  /** Only the page's text positions tie the value to its model's column (a stored copy must keep them). */
  readonly usedLayout?: true;
}
export interface VerifiedValue {
  /** Same id as `decisionKey(section, row, modelIndex)`. */
  readonly id: string;
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly rowId: string;
  readonly label: string;
  readonly unit: string;
  readonly condition: string;
  readonly modelIndex: number;
  readonly model: string;
  readonly status: ValueVerificationStatus | 'MISSING';
  readonly candidates: readonly VerifiedCandidate[];
  /** Index of the candidate to use when the status is VERIFIED_TEXT or VERIFIED_CELL. */
  readonly selected?: number;
  /** Reason given by the proposal for a missing value. */
  readonly missingReason?: string;
}
export interface FactVerificationReport {
  /** The proposal with each candidate's `verification` recomputed locally. */
  readonly proposal: FactProposal;
  readonly values: readonly VerifiedValue[];
  readonly counts: Readonly<Record<ValueVerificationStatus | 'MISSING', number>>;
  /** Sources that support at least one verified, visual-only or conflicting value. */
  readonly usedSourceIds: readonly string[];
  /** How messages name each source for a person (file name and revision), by source id. */
  readonly sourceNames: ReadonlyMap<string, string>;
}

const EVIDENCE: ReadonlySet<CandidateVerification> = new Set(['VERIFIED_TEXT', 'VERIFIED_CELL', 'VISUAL_ONLY']);
/** Aggregates candidate statuses into one value status; differing evidence is a CONFLICT. */
export function valueStatus(candidates: readonly Pick<VerifiedCandidate, 'value' | 'status'>[]):
  { status: ValueVerificationStatus; selected?: number } {
  const evidence = candidates.filter(item => EVIDENCE.has(item.status));
  if (new Set(evidence.map(item => normalizeEvidenceWhitespace(item.value))).size > 1) return { status: 'CONFLICT' };
  const selected = candidates.findIndex(item => isVerifiedStatus(item.status));
  if (selected >= 0) return { status: candidates[selected].status, selected };
  return { status: evidence.length ? 'VISUAL_ONLY' : 'UNVERIFIED' };
}

/**
 * Verifies every value of an untrusted proposal against local sources.
 * Throws only when the proposal itself is malformed (schema), never because
 * of a single value: unsupported values come back as UNVERIFIED.
 */
export function verifyFactProposal(untrusted: unknown, sources: readonly EvidenceSource[]): FactVerificationReport {
  const proposal = FactProposalSchema.parse(untrusted);
  const byId = new Map<string, EvidenceSource>();
  for (const source of sources) {
    if (byId.has(source.sourceId)) throw new Error('FACT_SOURCE_DUPLICATE');
    byId.set(source.sourceId, source);
  }
  const labels = proposal.sections.flatMap(section => section.rows.map(row => row.label));
  const values: VerifiedValue[] = [];
  const used = new Set<string>();
  const counts: Record<ValueVerificationStatus | 'MISSING', number> =
    { VERIFIED_TEXT: 0, VERIFIED_CELL: 0, VISUAL_ONLY: 0, UNVERIFIED: 0, CONFLICT: 0, MISSING: 0 };
  const stamped: FactProposal = {
    ...proposal,
    sections: proposal.sections.map(section => ({ ...section, rows: section.rows.map(row => ({
      ...row,
      values: row.values.map((fact, modelIndex) => {
        const base = {
          id: decisionKey(section.id, row.id, modelIndex), sectionId: section.id, sectionTitle: section.title,
          rowId: row.id, label: row.label, unit: row.unit, condition: row.condition,
          modelIndex, model: proposal.models[modelIndex],
        };
        if (fact.status === 'missing') {
          values.push({ ...base, status: 'MISSING', candidates: [], missingReason: fact.reason });
          counts.MISSING++;
          return fact;
        }
        const context: CandidateContext = {
          model: base.model, models: proposal.models, modelIndex, label: row.label, labels, unit: row.unit, condition: row.condition,
        };
        const checked = (fact.status === 'known' ? [fact.candidate] : fact.candidates).map(item => {
          const result = verifyCandidate(item, context, byId);
          return { value: item.value, source: item.source, status: result.status,
            ...(result.reason ? { reason: result.reason } : {}), ...(result.usedLayout ? { usedLayout: true as const } : {}) };
        });
        const outcome = valueStatus(checked);
        for (const item of checked) if (EVIDENCE.has(item.status)) used.add(item.source.sourceId);
        values.push({ ...base, status: outcome.status, candidates: checked,
          ...(outcome.selected === undefined ? {} : { selected: outcome.selected }) });
        counts[outcome.status]++;
        const withStatus = (item: FactCandidate, index: number): FactCandidate => ({ ...item, verification: checked[index].status });
        return fact.status === 'known'
          ? { status: 'known' as const, candidate: withStatus(fact.candidate, 0) }
          : { status: 'conflict' as const, candidates: fact.candidates.map(withStatus) };
      }),
    })) })),
  };
  const sourceNames = new Map(sources.flatMap(source => source.name?.trim() ? [[source.sourceId, source.name.trim()] as const] : []));
  return { proposal: stamped, values, counts, usedSourceIds: [...used].sort(), sourceNames };
}

type SourceNames = ReadonlyMap<string, string>;
/** "página 2", or "página 2 de manual.pdf (revisão 3)" when the source has a name. */
function where(source: SourceReference, names: SourceNames = new Map()): string {
  const place = !source.cell ? `página ${source.page}`
    : source.cell.sheet ? `aba ${source.cell.sheet}, célula ${cellAddress(source.cell.address)}`
      : `célula ${cellAddress(source.cell.address)}`;
  const name = names.get(source.sourceId);
  return name ? `${place} de ${name}` : place;
}
const REASON_TEXT: Readonly<Record<VerificationReason, (place: string, value: VerifiedValue) => string>> = {
  EMPTY_VALUE: () => 'O valor veio vazio.',
  QUOTE_NOT_ON_PAGE: place => `O trecho citado não foi encontrado na ${place}.`,
  VALUE_NOT_IN_QUOTE: place => `O valor não aparece no trecho citado da ${place}.`,
  AMBIGUOUS_QUOTE: place => `O trecho da ${place} traz mais de um valor para o mesmo item.`,
  MODEL_VARIANT: (place, value) => `A ${place} fala de outra versão, não exatamente do ${value.model}.`,
  MODEL_NOT_ON_PAGE: (place, value) => `O modelo ${value.model} não aparece na ${place}.`,
  MODEL_ATTRIBUTION: (place, value) => `Na ${place}, este valor parece ser de outro modelo, não do ${value.model}.`,
  LABEL_ATTRIBUTION: place => `Na ${place}, este valor parece ser de outra linha da tabela.`,
  LABEL_UNCLEAR: (place, value) =>
    `Na ${place}, não dá para saber pelo texto se este valor é de "${value.label}"; confira olhando a página.`,
  UNIT_MISMATCH: place => `A unidade não confere com a ${place}.`,
  UNIT_NOT_ON_PAGE: place => `A unidade informada não aparece na ${place}.`,
  UNIT_UNCLEAR: (place, value) =>
    `Na ${place}, a unidade ${value.unit} não aparece junto deste valor; confira olhando a página.`,
  CONDITION_MISMATCH: place => `A condição informada não confere com a ${place}.`,
  CONDITION_NOT_ON_PAGE: place => `A condição informada não aparece na ${place}.`,
  SOURCE_NOT_PROVIDED: () => 'O arquivo citado não foi enviado.',
  SOURCE_HASH_MISMATCH: () => 'O arquivo citado é diferente do arquivo enviado.',
  SOURCE_KIND_MISMATCH: () => 'A citação não combina com o tipo de arquivo.',
  PAGE_NOT_FOUND: place => `A ${place} não existe no arquivo.`,
  PAGE_TEXT_INCOMPLETE: place => `A ${place} tem texto demais para conferir por inteiro.`,
  PAGE_NEEDS_VISUAL_CHECK: place => `A ${place} é uma imagem; confira olhando a página.`,
  VISUAL_REGION_ONLY: place => `O valor está numa imagem da ${place}; confira olhando a página.`,
  COLUMN_MISMATCH: (place, value) => `Na ${place}, este valor está na coluna de outro modelo, não do ${value.model}.`,
  COLUMN_UNCLEAR: (place, value) =>
    `Na ${place}, não dá para saber pelo texto se este valor vale para o ${value.model}; confira olhando a página.`,
  CELL_REFERENCE_REQUIRED: () => 'Falta dizer de qual célula da planilha veio o valor.',
  CELL_NOT_FOUND: place => `A ${place} não existe na planilha.`,
  CELL_VALUE_MISMATCH: place => `O valor não é igual ao da planilha (${place}).`,
};

/**
 * Short plain-Portuguese explanation of a value's status, for review screens.
 * `names` (the report's `sourceNames`) names the file, which matters when two
 * files are cited.
 */
export function verificationMessage(value: VerifiedValue, names?: SourceNames): string {
  if (value.status === 'MISSING') return value.missingReason?.trim() || 'Não informado nas fontes.';
  if (value.status === 'CONFLICT') {
    const options = value.candidates.filter(item => EVIDENCE.has(item.status)).map(item => `${item.value} na ${where(item.source, names)}`);
    return `As fontes divergem: ${options.join('; ')}. Escolha o valor certo.`;
  }
  if (value.status === 'VERIFIED_TEXT' || value.status === 'VERIFIED_CELL') {
    const chosen = value.candidates[value.selected ?? 0];
    return value.status === 'VERIFIED_CELL'
      ? `Conferido na planilha: ${where(chosen.source, names)}.` : `Conferido no texto da ${where(chosen.source, names)}.`;
  }
  const first = value.status === 'VISUAL_ONLY' ? value.candidates.find(item => item.status === 'VISUAL_ONLY') : value.candidates[0];
  if (!first) return 'Não foi possível conferir este valor.';
  const place = where(first.source, names);
  return first.reason ? REASON_TEXT[first.reason](place, value) : `Confira olhando a ${place}.`;
}
