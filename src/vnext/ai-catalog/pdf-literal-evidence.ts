type LiteralKind = 'model' | 'label' | 'value' | 'unit' | 'condition';

/** Literal token boundaries: no sign, decimal, unit prefix or model suffix repair. */
export function literalEvidencePositions(text: string, literal: string, kind: LiteralKind,
  attachedUnitAt?: (end: number) => boolean): number[] {
  if (!literal.trim()) return [];
  const positions: number[] = [];
  const word = /[\p{L}\p{N}_]/u;
  const numeric = /[\p{L}\p{N}_.,+\-−±]/u;
  for (let index = text.indexOf(literal); index !== -1; index = text.indexOf(literal, index + 1)) {
    const before = text[index - 1] ?? '', after = text[index + literal.length] ?? '';
    const boundary = kind === 'value' ? numeric : word;
    // PDF text runs may separate a minus/plus from its digits. Quoting only
    // the digits must not silently remove that sign, even across whitespace.
    const separatedSign = kind === 'value' && /[+\-−±.,]$/u.test(text.slice(0, index).trimEnd());
    // Symbol units can directly follow a number (0.01%, 23°C). A textual
    // unit still cannot drop its prefix or degree symbol (kPa→Pa, °C→C).
    const attachedSymbolUnit = kind === 'unit' && !word.test(literal[0]);
    const badBefore = attachedSymbolUnit ? /[\p{L}_]/u.test(before) : boundary.test(before);
    const badModelBoundary = kind === 'model' && /[-]/u.test(before + after);
    const lostDegree = kind === 'unit' && word.test(literal[0]) && /[°℃℉]/u.test(before);
    const partialCompoundUnit = kind === 'unit' && (
      /[/·⋅*^-]$/u.test(text.slice(0, index).trimEnd()) ||
      /^[/·⋅*^-]/u.test(text.slice(index + literal.length).trimStart())
    );
    // Brazilian manuals often type the degree as the ordinal indicator: "20ºC".
    const ordinalDegree = kind === 'value' && after === 'º' && /[CFK]/u.test(text[index + literal.length + 1] ?? '');
    // "14kg", "160mm": a unit printed without a space still ends the number.
    const attachedUnit = kind === 'value' && /\p{L}/u.test(after) && attachedUnitAt?.(index + literal.length) === true;
    if (!badBefore && (!boundary.test(after) || ordinalDegree || attachedUnit) && !badModelBoundary && !lostDegree &&
        !separatedSign && !partialCompoundUnit) positions.push(index);
  }
  return positions;
}

export const hasLiteralEvidence = (text: string, literal: string, kind: LiteralKind) =>
  literalEvidencePositions(text, literal, kind).length > 0;

/** Collapses PDF line breaks and runs of spaces; never changes any other character. */
export const normalizeEvidenceWhitespace = (text: string): string => text.replace(/\s+/gu, ' ').trim();

/**
 * Typographic spellings of the same unit only: degree vs ordinal indicator
 * (20ºC in Brazilian manuals), micro and ohm code points, and spacing. Never a
 * prefix, a conversion or a different quantity.
 */
const UNIT_CHARACTERS: Readonly<Record<string, string>> = {
  'º': '°', '˚': '°', // ordinal indicator, ring above -> degree sign
  'μ': 'µ', // Greek mu -> micro sign
  'Ω': 'Ω', // ohm sign -> Greek omega
};
const unitCharacter = (character: string): string => UNIT_CHARACTERS[character] ?? character;
const canonicalUnit = (unit: string): string => [...unit.replace(/\s+/gu, '')].map(unitCharacter).join('');

/** Common engineering units seen right after a value; the longest match wins (kPa over Pa, % FS over %). */
const KNOWN_UNITS = [
  '°C', '°F', 'K', '°C/min', '°C/h', 'K/min', '%', '% FS', '% FE', '% RDG', '% rdg', '% da leitura', '% of reading',
  '% span', '% Span', '% IS', '% leitura', 'ppm', 'mA', 'µA', 'A', 'µV', 'mV', 'V', 'kV', 'mV/V', 'mΩ', 'Ω', 'kΩ', 'MΩ',
  'ohm', 'ohms', 'Hz', 'kHz', 'MHz', 'Pa', 'kPa', 'MPa', 'hPa', 'Pa/s', 'kPa/s', 'bar', 'mbar', 'bar/s', 'psi', 'psig',
  'psia', 'psid', 'inH2O', 'inHg', 'mmHg', 'mmH2O', 'mH2O', 'cmH2O', 'kgf/cm²', 'kgf/cm2', 'atm', 'Torr', 'torr',
  'µm', 'mm', 'cm', 'm', 'kg', 'g', 'W', 'kW', 'VA', 'ms', 's', 'min', 'h', 'mL', 'L', 'dB', 'lux', 'rpm', 'N', 'Nm',
  'µS/cm', 'mS/cm',
] as const;

/**
 * End index when `unit` starts exactly at `start` (inner spacing may differ),
 * followed by a token boundary and not by a compound-unit operator; else -1.
 */
function matchUnitAt(text: string, start: number, unit: string): number {
  const target = canonicalUnit(unit);
  if (!target || start >= text.length || /\s/u.test(text[start])) return -1;
  let index = start;
  for (const expected of target) {
    while (index < text.length && /\s/u.test(text[index]) && index > start) index++;
    if (index >= text.length || unitCharacter(text[index]) !== expected) return -1;
    index++;
  }
  if (/[\p{L}\p{N}_]/u.test(text[index] ?? '')) return -1;
  if (/^[/·⋅*^-]/u.test(text.slice(index).trimStart())) return -1;
  return index;
}

type FollowingUnit = { kind: 'CLAIMED' | 'OTHER' | 'NONE'; end: number };
/** Which unit, if any, the source prints right after the value occurrence ending at `end`. */
function followingUnit(text: string, end: number, unit: string): FollowingUnit {
  let start = end;
  while (start < text.length && /\s/u.test(text[start])) start++;
  const claimed = canonicalUnit(unit);
  let best = -1, isClaimed = false;
  for (const candidate of [unit, ...KNOWN_UNITS]) {
    const matched = matchUnitAt(text, start, candidate);
    const same = canonicalUnit(candidate) === claimed;
    if (matched > best) { best = matched; isClaimed = same; } else if (matched === best && matched >= 0 && same) isClaimed = true;
  }
  return best < 0 ? { kind: 'NONE', end } : { kind: isClaimed ? 'CLAIMED' : 'OTHER', end: best };
}

/** Literal positions of a value; a known (or the claimed) unit may be glued to it ("14kg"). */
export function valueEvidencePositions(text: string, value: string, unit = ''): number[] {
  const units = unit.trim() ? [unit, ...KNOWN_UNITS] : KNOWN_UNITS;
  return literalEvidencePositions(text, value, 'value', end => units.some(candidate => matchUnitAt(text, end, candidate) >= 0));
}

/** Equivalent unit spellings for a presence check anywhere in a text. */
function unitPresent(text: string, unit: string): boolean {
  const spellings = new Set([unit, unit.replace(/[º˚]/gu, '°'), unit.replace(/°/gu, 'º'), unit.replace(/\s+/gu, '')]);
  for (const spelling of [...spellings]) if (/^%\S/u.test(spelling)) spellings.add('% ' + spelling.slice(1));
  return [...spellings].some(spelling => hasLiteralEvidence(text, spelling, 'unit'));
}

const NUMBER = /[+\-−±]?\d+(?:[.,]\d+)*/gu;
/** "at 23 C" -> pattern matching "at <number> C", to spot the same condition with other numbers. */
function conditionSkeleton(condition: string): RegExp | null {
  const parts = condition.split(NUMBER);
  if (parts.length < 2) return null;
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '\\s+');
  const body = parts.map(escape).join('[+\\-−±]?\\d+(?:[.,]\\d+)*');
  const lead = /^[\p{L}\p{N}]/u.test(condition) ? '(?<![\\p{L}\\p{N}])' : '';
  const tail = /[\p{L}\p{N}]$/u.test(condition) ? '(?![\\p{L}\\p{N}])' : '';
  return new RegExp(lead + body + tail, 'gu');
}

export type TextEvidenceProblem =
  | 'EMPTY_VALUE' | 'QUOTE_NOT_ON_PAGE' | 'VALUE_NOT_IN_QUOTE' | 'AMBIGUOUS_QUOTE'
  | 'MODEL_VARIANT' | 'MODEL_NOT_ON_PAGE' | 'MODEL_ATTRIBUTION' | 'LABEL_ATTRIBUTION'
  | 'UNIT_MISMATCH' | 'UNIT_NOT_ON_PAGE' | 'CONDITION_MISMATCH' | 'CONDITION_NOT_ON_PAGE';

export interface ValueTextEvidence {
  pageText: string;
  quote: string;
  value: string;
  unit: string;
  condition: string;
  model: string;
  models: readonly string[];
  label: string;
  labels: readonly string[];
}
export type ValueTextCheck = { verified: true } | { verified: false; problem: TextEvidenceProblem };

interface Mark { start: number; end: number; target: boolean }
const marks = (text: string, target: string, others: readonly string[], kind: 'model' | 'label'): Mark[] => [
  ...literalEvidencePositions(text, target, kind).map(start => ({ start, end: start + target.length, target: true })),
  ...[...new Set(others)].filter(other => other !== target && other.trim())
    .flatMap(other => literalEvidencePositions(text, other, kind).map(start => ({ start, end: start + other.length, target: false }))),
].sort((a, b) => a.start - b.start);
const nearestBefore = (items: readonly Mark[], position: number) =>
  items.filter(item => item.end <= position).at(-1);

/**
 * Verification BY VALUE on the native text of one cited page. The literal
 * value (sign, decimals and unit kept exactly) must be inside the cited quote,
 * and the quote must be on the page. Model and label do not need to share the
 * line with the value (2D tables), but the quote must not tie the value to
 * another declared model, another declared field or another condition.
 * This locates evidence; it does not prove engineering truth.
 */
export function checkValueTextEvidence(evidence: ValueTextEvidence): ValueTextCheck {
  const fail = (problem: TextEvidenceProblem): ValueTextCheck => ({ verified: false, problem });
  const page = normalizeEvidenceWhitespace(evidence.pageText);
  const quote = normalizeEvidenceWhitespace(evidence.quote);
  const value = normalizeEvidenceWhitespace(evidence.value);
  const unit = normalizeEvidenceWhitespace(evidence.unit);
  const condition = normalizeEvidenceWhitespace(evidence.condition);
  const { model, models, label, labels } = evidence;
  if (!value) return fail('EMPTY_VALUE');
  if (!quote || !page.includes(quote)) return fail('QUOTE_NOT_ON_PAGE');
  const occurrences = valueEvidencePositions(quote, value, unit);
  if (!occurrences.length) return fail('VALUE_NOT_IN_QUOTE');

  const modelMarks = marks(quote, model, models, 'model');
  const labelMarks = marks(quote, label, labels, 'label');
  const targetModels = modelMarks.filter(item => item.target), otherModels = modelMarks.filter(item => !item.target);
  const targetLabels = labelMarks.filter(item => item.target), otherLabels = labelMarks.filter(item => !item.target);
  // The same model or field twice in one quote means competing clauses.
  if (targetModels.length > 1 || targetLabels.length > 1) return fail('AMBIGUOUS_QUOTE');
  // "AX-041" only inside "AX-041N": the quote is about another variant.
  if (!targetModels.length && quote.includes(model)) return fail('MODEL_VARIANT');
  if (!targetModels.length && !otherModels.length) {
    const onPage = literalEvidencePositions(page, model, 'model').length > 0;
    if (models.length > 1 && !onPage) return fail('MODEL_NOT_ON_PAGE');
    if (models.length === 1 && !onPage && page.includes(model)) return fail('MODEL_VARIANT');
  }
  if (condition && !hasLiteralEvidence(quote, condition, 'condition') && !hasLiteralEvidence(page, condition, 'condition')) {
    return fail('CONDITION_NOT_ON_PAGE');
  }
  const skeleton = condition ? conditionSkeleton(condition) : null;
  // Several models listed before every value: a header list, so the text alone
  // cannot tell columns apart (the geometric check in fact-verifier can).
  const headerList = targetModels.length === 1 && otherModels.length > 0 &&
    Math.max(...modelMarks.map(item => item.end)) <= Math.min(...occurrences);
  let firstProblem: TextEvidenceProblem | undefined;
  for (const start of occurrences) {
    const problem = ((): TextEvidenceProblem | undefined => {
      if (modelMarks.length && !headerList) {
        const prior = nearestBefore(modelMarks, start);
        if (!prior || !prior.target) return 'MODEL_ATTRIBUTION';
        // "AX-041 RANGE 700 kPa RESOLUTION 0,001 kPa": in a model clause the
        // value must be the first number after its model and field.
        const anchor = Math.max(...[...modelMarks, ...labelMarks].filter(item => item.target && item.end <= start).map(item => item.end));
        if (/\p{N}/u.test(quote.slice(anchor, start))) return 'LABEL_ATTRIBUTION';
      }
      if (otherLabels.length) {
        const prior = nearestBefore(labelMarks, start);
        if (prior ? !prior.target : targetLabels.length > 0) return 'LABEL_ATTRIBUTION';
      }
      let clauseEnd = start + value.length;
      if (unit) {
        const following = followingUnit(quote, clauseEnd, unit);
        if (following.kind === 'OTHER') return 'UNIT_MISMATCH';
        if (following.kind === 'NONE' && !unitPresent(quote, unit) && !unitPresent(page, unit)) return 'UNIT_NOT_ON_PAGE';
        clauseEnd = following.end;
      }
      // "0,003 kPa at 99 C" for a row declared "at 23 C": same clause, other condition.
      if (skeleton) {
        const rest = quote.slice(clauseEnd).replace(/^[\s,;:(]+/u, '');
        skeleton.lastIndex = 0;
        const match = skeleton.exec(rest);
        if (match && match.index === 0 && match[0] !== condition) return 'CONDITION_MISMATCH';
      }
      return undefined;
    })();
    if (!problem) return { verified: true };
    firstProblem ??= problem;
  }
  return fail(firstProblem ?? 'VALUE_NOT_IN_QUOTE');
}
