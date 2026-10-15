import {
  checkValueTextEvidence, literalEvidencePositions, namesOtherModel, normalizeEvidenceWhitespace, valueEvidencePositions,
  type TextEvidenceProblem,
} from './pdf-literal-evidence';

/**
 * Checks that need the layout of a PDF page (native text positions), shared by
 * the per-value verifier (fact-verifier.ts) and by the re-verification of a
 * stored grounded sidecar (contracts.ts), so both reach the same status from
 * the same page text and text positions.
 *
 * Why this module exists (IDS: CREATE): the column check used to live inside
 * fact-verifier.ts, which imports contracts.ts; contracts.ts must run the same
 * check on a stored page, so it moved to a module without that cycle.
 */

/** One native text item of a page (pdf.js), left edge and baseline in points. */
export interface TextRun { readonly text: string; readonly x: number; readonly y: number; readonly width: number }
/** What a check needs from a page: its verification text and, when kept, its text positions. */
export interface PdfPageEvidence { readonly text: string; readonly runs?: readonly TextRun[] }

/** Longest page text a stored source may hold (TechnicalInput page text). */
export const MAX_EVIDENCE_PAGE_TEXT = 50_000;
/** Pages with more text items, or longer ones, keep no layout evidence. */
export const MAX_EVIDENCE_RUNS = 4_000;
export const MAX_EVIDENCE_RUN_TEXT = 400;

const hundredths = (value: number) => Math.round(value * 100) / 100;
/**
 * Text positions kept as layout evidence, rounded to 1/100 pt so a stored copy
 * re-verifies exactly. Too many, too long or invalid runs: no layout evidence
 * (values that need it then go to a person, never to "verified").
 */
export function evidenceRuns(runs: readonly TextRun[] | undefined): TextRun[] | undefined {
  if (!runs?.length || runs.length > MAX_EVIDENCE_RUNS) return undefined;
  if (runs.some(run => !run.text.trim() || run.text.length > MAX_EVIDENCE_RUN_TEXT ||
      ![run.x, run.y, run.width].every(Number.isFinite))) return undefined;
  return runs.map(run => ({ text: run.text, x: hundredths(run.x), y: hundredths(run.y), width: hundredths(run.width) }));
}

interface Segment { start: number; end: number; x0: number; x1: number; cell: number }
interface Line { y: number; text: string; segments: Segment[] }
/** x0/x1: the literal itself; cellX0/cellX1: the whole cell it sits in (a merged cell may span columns). */
interface Span { line: number; y: number; x0: number; x1: number; cellX0: number; cellX1: number; cell: number; cellText: string }

/**
 * Rebuilds visual lines from native text positions, left to right. Pieces that
 * physically touch are joined without a space: some PDFs split "155" into
 * "1" + "55" or "TA-25N" into "TA" + "-" + "25N", and PDF.js then inserts
 * spaces the printed page does not have. A wide gap starts a new table cell.
 */
const linesByRuns = new WeakMap<readonly TextRun[], Line[]>();
function visualLines(runs: readonly TextRun[]): Line[] {
  const cached = linesByRuns.get(runs);
  if (cached) return cached;
  const lines = buildVisualLines(runs);
  linesByRuns.set(runs, lines);
  return lines;
}
function buildVisualLines(runs: readonly TextRun[]): Line[] {
  const groups: TextRun[][] = [];
  for (const run of [...runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const group = groups.find(items => Math.abs(items[0].y - run.y) < 2);
    if (group) group.push(run); else groups.push([run]);
  }
  return groups.map(group => {
    const line: Line = { y: group[0].y, text: '', segments: [] };
    let previous: TextRun | undefined, cell = 0;
    for (const run of group.sort((a, b) => a.x - b.x)) {
      const text = normalizeEvidenceWhitespace(run.text);
      if (!text) continue;
      if (previous) {
        const gap = run.x - (previous.x + Math.max(0, previous.width));
        const charWidth = Math.max(0.5, Math.max(0, previous.width) / Math.max(1, previous.text.length));
        const touching = gap > -charWidth && gap < Math.min(0.5, charWidth * 0.12);
        if (!touching) line.text += ' ';
        if (gap > Math.max(8, charWidth * 2)) cell++;
      }
      line.segments.push({ start: line.text.length, end: line.text.length + text.length, x0: run.x, x1: run.x + Math.max(0, run.width), cell });
      line.text += text;
      previous = run;
    }
    return line;
  });
}

/**
 * Text used to verify a page: the native text, plus the lines rebuilt from
 * text positions when they read differently (joined pieces). Deterministic, so
 * a sidecar that stores it re-verifies to the same result.
 */
export function verificationPageText(page: PdfPageEvidence): string {
  if (!page.runs?.length) return page.text;
  const rebuilt = visualLines(page.runs).map(line => line.text).filter(Boolean).join('\n');
  if (!rebuilt || normalizeEvidenceWhitespace(rebuilt) === normalizeEvidenceWhitespace(page.text)) return page.text;
  const combined = `${page.text}\n\n${rebuilt}`;
  return combined.length <= MAX_EVIDENCE_PAGE_TEXT ? combined : page.text;
}

function spanX(line: Line, start: number, end: number): Omit<Span, 'line' | 'y'> | null {
  const touched = line.segments.filter(segment => segment.end > start && segment.start < end);
  if (!touched.length) return null;
  const at = (segment: Segment, index: number) => {
    const length = segment.end - segment.start;
    const ratio = length ? Math.min(1, Math.max(0, (index - segment.start) / length)) : 0;
    return segment.x0 + ratio * (segment.x1 - segment.x0);
  };
  const cell = touched[0].cell, members = line.segments.filter(segment => segment.cell === cell);
  return { x0: at(touched[0], start), x1: at(touched[touched.length - 1], end), cell,
    cellX0: members[0].x0, cellX1: members[members.length - 1].x1,
    cellText: line.text.slice(members[0].start, members[members.length - 1].end) };
}
function literalSpans(lines: readonly Line[], literal: string, kind: 'model' | 'value', unit = ''): Span[] {
  const needle = normalizeEvidenceWhitespace(literal);
  return lines.flatMap((line, index) => (kind === 'value' ? valueEvidencePositions(line.text, needle, unit)
    : literalEvidencePositions(line.text, needle, kind)).flatMap(start => {
    const box = spanX(line, start, start + needle.length);
    return box ? [{ line: index, y: line.y, ...box }] : [];
  }));
}

export type ColumnAttribution = 'MATCH' | 'MISMATCH' | 'UNCLEAR' | 'UNKNOWN';
/**
 * Column check using native text positions. The header row of a value is the
 * nearest line above it that names the value's model exactly once, in a cell
 * that names no other model, and has several cells (other models, even ones
 * not declared, are just other cells). Each header cell defines a column band;
 * the value must sit in its model's.
 * - MATCH: the value is in its model's column.
 * - MISMATCH: it is only in other columns, in a row with several cells.
 * - UNCLEAR: it is the only cell of its row and outside the model's column, so
 *   it may be merged across models or belong to one model only; a person must
 *   look at the page.
 * - UNKNOWN: no such header row, a cell reaching the model's column (merged
 *   cell, whole line as one run) or anything else.
 * Works for a single-product sheet cut from a multi-model table, too. Only
 * occurrences whose cell is inside the cited quote count (the same figure may
 * appear in another row and column of the page).
 */
export function columnAttribution(runs: readonly TextRun[], model: string, models: readonly string[], value: string,
  unit = '', quote = ''): ColumnAttribution {
  if (!runs.length) return 'UNKNOWN';
  const lines = visualLines(runs);
  const headers = lines.flatMap((line, index) => {
    const found = literalSpans([line], model, 'model');
    const cells = [...new Set(line.segments.map(segment => segment.cell))].map(cell => {
      const members = line.segments.filter(segment => segment.cell === cell);
      return { cell, x0: members[0].x0, x1: members[members.length - 1].x1 };
    });
    // "TA-25N TA-35N" in one cell is a list, not the model's own column.
    if (found.length !== 1 || cells.length < 2 || namesOtherModel(found[0].cellText, model, models)) return [];
    return [{ index, y: line.y, cells, target: found[0].cell }];
  });
  if (!headers.length) return 'UNKNOWN';
  const everywhere = literalSpans(lines, value, 'value', unit), cited = normalizeEvidenceWhitespace(quote);
  const quoted = cited ? everywhere.filter(span => cited.includes(normalizeEvidenceWhitespace(span.cellText))) : [];
  const spans = quoted.length ? quoted : everywhere;
  const overlaps = (x0: number, x1: number, band: { left: number; right: number }) => x1 > band.left && x0 < band.right;
  let reaches = false, matched = false;
  const elsewhere: boolean[] = [];
  for (const span of spans) {
    const header = headers.filter(item => item.y - span.y > 1).sort((a, b) => a.y - b.y)[0];
    if (!header) continue;
    const centers = header.cells.map(cell => ({ cell: cell.cell, center: (cell.x0 + cell.x1) / 2 }));
    const bands = centers.map((item, position) => {
      const previous = centers[position - 1]?.center, next = centers[position + 1]?.center;
      const left = previous === undefined ? item.center - ((next ?? item.center) - item.center) / 2 : (previous + item.center) / 2;
      const right = next === undefined ? item.center + (item.center - (previous ?? item.center)) / 2 : (item.center + next) / 2;
      return { cell: item.cell, left, right };
    });
    const target = bands.find(band => band.cell === header.target)!;
    if (overlaps(span.x0, span.x1, target)) matched = true;
    else if (overlaps(span.cellX0, span.cellX1, target)) reaches = true;
    else if (bands.some(band => band !== target && overlaps(span.x0, span.x1, band))) {
      const rowCells = new Set(lines[span.line].segments
        .filter(segment => bands.some(band => overlaps(segment.x0, segment.x1, band))).map(segment => segment.cell));
      elsewhere.push(rowCells.size === 1);
    }
  }
  if (matched) return 'MATCH';
  if (reaches || !elsewhere.length) return 'UNKNOWN';
  return elsewhere.every(Boolean) ? 'UNCLEAR' : 'MISMATCH';
}

export type PdfValueReason = TextEvidenceProblem | 'COLUMN_MISMATCH' | 'COLUMN_UNCLEAR' | 'LABEL_UNCLEAR' | 'UNIT_UNCLEAR';
export interface PdfValueContext {
  readonly model: string;
  readonly models: readonly string[];
  readonly label: string;
  readonly labels: readonly string[];
  readonly unit: string;
  readonly condition: string;
}
export interface PdfValueCheck {
  readonly status: 'VERIFIED_TEXT' | 'VISUAL_ONLY' | 'UNVERIFIED';
  readonly reason?: PdfValueReason;
  /** True when only the text positions tie the value to its model's column (a stored copy must keep them). */
  readonly usedLayout: boolean;
}

/**
 * Status of one PDF value on one page, from its text and, when present, its
 * text positions. VERIFIED_TEXT needs the literal value in the quote and the
 * text to tie it to its row label and unit; when another model is printed on
 * the page and the quote does not name the value's model right before it, the
 * value must also sit in its model's column. What the text cannot tie goes to
 * a person (VISUAL_ONLY); what it contradicts is UNVERIFIED.
 */
export function checkPdfValueOnPage(page: PdfPageEvidence, candidate: { readonly value: string; readonly quote: string },
  context: PdfValueContext): PdfValueCheck {
  const text = checkValueTextEvidence({ pageText: page.text, quote: candidate.quote, value: candidate.value, ...context });
  if (!text.verified) return { status: 'UNVERIFIED', reason: text.problem, usedLayout: false };
  const column = page.runs?.length
    ? columnAttribution(page.runs, context.model, context.models, candidate.value, context.unit, candidate.quote) : 'UNKNOWN';
  const visual = (reason: PdfValueReason): PdfValueCheck => ({ status: 'VISUAL_ONLY', reason, usedLayout: false });
  if (column === 'MISMATCH') return { status: 'UNVERIFIED', reason: 'COLUMN_MISMATCH', usedLayout: false };
  if (!text.labelTied) return visual('LABEL_UNCLEAR');
  if (!text.unitTied) return visual('UNIT_UNCLEAR');
  if (column === 'UNCLEAR') return visual('COLUMN_UNCLEAR');
  const needsColumn = !text.modelTied && text.otherModelOnPage;
  if (needsColumn && column !== 'MATCH') return visual('COLUMN_UNCLEAR');
  return { status: 'VERIFIED_TEXT', usedLayout: needsColumn };
}
