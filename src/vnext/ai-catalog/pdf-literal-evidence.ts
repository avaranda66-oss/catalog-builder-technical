type LiteralKind = 'model' | 'label' | 'value' | 'unit' | 'condition';

/**
 * Text right after a unit that continues it into a compound unit ("kPa/s",
 * "Pa - s", "N*m"). A minus before a number ("140 °C -35 to 155 °C", the next
 * cell of a table row) starts another value, and a loose asterisk ("155 °C*")
 * marks a footnote.
 */
const continuesCompoundUnit = (rest: string) =>
  /^(?:[/·⋅-](?!\s*\p{N})|[*^](?=[\p{L}\p{N}]))/u.test(rest.trimStart());

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
      continuesCompoundUnit(text.slice(index + literal.length))
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
  if (continuesCompoundUnit(text.slice(index))) return -1;
  return index;
}

type FollowingUnit = { kind: 'CLAIMED' | 'OTHER' | 'NONE'; end: number };
/** Which unit, if any, the source prints right after the value occurrence ending at `end`. */
function followingUnit(text: string, end: number, unit: string): FollowingUnit {
  let start = end;
  while (start < text.length && /\s/u.test(text[start])) start++;
  // "0...700 (kPa)": a unit in brackets right after the value is still its unit.
  if (/[([]/u.test(text[start] ?? '')) {
    const inside = text.slice(start + 1).match(/^\s*/u)![0].length + start + 1;
    if ([unit, ...KNOWN_UNITS].some(candidate => matchUnitAt(text, inside, candidate) >= 0)) start = inside;
  }
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

/** Equivalent spellings of one unit (degree vs ordinal indicator, spacing). */
function unitSpellings(unit: string): string[] {
  const spellings = new Set([unit, unit.replace(/[º˚]/gu, '°'), unit.replace(/°/gu, 'º'), unit.replace(/\s+/gu, '')]);
  for (const spelling of [...spellings]) if (/^%\S/u.test(spelling)) spellings.add('% ' + spelling.slice(1));
  return [...spellings].filter(spelling => spelling.trim());
}
/** Equivalent unit spellings for a presence check anywhere in a text. */
function unitPresent(text: string, unit: string): boolean {
  return unitSpellings(unit).some(spelling => hasLiteralEvidence(text, spelling, 'unit'));
}

/** Accent- and case-folded words of 3+ letters ("Exatidão" -> "exatidao"); shorter words carry no label. */
export function significantWords(text: string): string[] {
  const folded = text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
  return (folded.match(/\p{L}+/gu) ?? []).filter(word => word.length >= 3);
}
const UNIT_WORDS: ReadonlySet<string> = new Set(KNOWN_UNITS.flatMap(unit => significantWords(unit)));

/**
 * A unit printed as a header before the value ("Faixa (°C) -25 a 140"): the
 * nearest unit before it that does not close another number ("140 °C") and is
 * not separated from the value by words. Units of the condition do not count.
 */
function headerUnitBefore(text: string, start: number, unit: string, condition: string,
  ignored: ReadonlySet<string>): 'CLAIMED' | 'OTHER' | 'NONE' {
  const before = text.slice(0, start);
  const conditions = condition ? literalEvidencePositions(before, condition, 'condition').map(at => [at, at + condition.length]) : [];
  const claimed = canonicalUnit(unit);
  let best: { end: number; length: number; claimed: boolean } | undefined;
  for (const candidate of [unit, ...KNOWN_UNITS]) for (const spelling of unitSpellings(candidate)) {
    for (const at of literalEvidencePositions(before, spelling, 'unit')) {
      const end = at + spelling.length;
      if (/\p{N}$/u.test(before.slice(0, at).trimEnd())) continue;
      if (conditions.some(([from, to]) => at >= from && end <= to)) continue;
      const same = canonicalUnit(candidate) === claimed;
      if (!best || end > best.end || (end === best.end && (spelling.length > best.length || (spelling.length === best.length && same)))) {
        best = { end, length: spelling.length, claimed: same };
      }
    }
  }
  if (!best || significantWords(before.slice(best.end)).some(word => !ignored.has(word))) return 'NONE';
  return best.claimed ? 'CLAIMED' : 'OTHER';
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
/**
 * What the text alone ties to a value found in its quote. A value the text
 * does not tie to its row label or unit, or to its model while another model
 * is on the page, may still be right, but only the page layout or a person can
 * tell: it must never count as verified by text alone.
 */
export interface ValueTextTies {
  /** The quote names the value's model right before it, not inside a list of models. */
  readonly modelTied: boolean;
  /** Another declared model, or the same model name with another number ("TA-35N" for "TA-25N"), is on the page. */
  readonly otherModelOnPage: boolean;
  /** The words right before the value, in the quote or around it on its page line, are its row label. */
  readonly labelTied: boolean;
  /** The claimed unit is printed right after the value, inside it or as its header; or no unit is claimed. */
  readonly unitTied: boolean;
}
export type ValueTextCheck =
  | ({ readonly verified: true } & ValueTextTies)
  | { readonly verified: false; readonly problem: TextEvidenceProblem };

interface Mark { start: number; end: number; target: boolean }
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
/**
 * The same model name with any other number: "TA-35N" or "TA-50N" for
 * "TA-25N". It catches models nobody declared (a single-product sheet cut from
 * a family table). Names without digits or with fewer than two letters have none.
 */
function siblingModels(text: string, model: string): Mark[] {
  const parts = model.split(/(\p{N}+)/u);
  const letters = parts.filter((_, index) => index % 2 === 0).join('').match(/\p{L}/gu) ?? [];
  if (parts.length < 2 || letters.length < 2) return [];
  const body = parts.map((part, index) => (index % 2 ? '\\p{N}+' : escapeRegExp(part))).join('');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_-])${body}(?![\\p{L}\\p{N}_-])`, 'gu');
  return [...text.matchAll(pattern)].filter(match => match[0] !== model)
    .map(match => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, target: false }));
}
function marks(text: string, target: string, others: readonly string[], kind: 'model' | 'label'): Mark[] {
  const found: Mark[] = [
    ...literalEvidencePositions(text, target, kind).map(start => ({ start, end: start + target.length, target: true })),
    ...[...new Set(others)].filter(other => other !== target && other.trim())
      .flatMap(other => literalEvidencePositions(text, other, kind).map(start => ({ start, end: start + other.length, target: false }))),
  ];
  if (kind === 'model') {
    for (const sibling of siblingModels(text, target)) if (!found.some(item => item.start === sibling.start)) found.push(sibling);
  }
  return found.sort((a, b) => a.start - b.start);
}
const nearestBefore = (items: readonly Mark[], position: number) =>
  items.filter(item => item.end <= position).at(-1);

/** Another declared model, or a sibling of the model ("TA-35N" for "TA-25N"), printed in `text`. */
export function namesOtherModel(text: string, model: string, models: readonly string[]): boolean {
  return marks(normalizeEvidenceWhitespace(text), model, models, 'model').some(item => !item.target);
}

/** Folded words of the row label, words of the other declared rows, and words that never name a row. */
interface LabelWords {
  readonly label: string;
  readonly target: ReadonlySet<string>;
  readonly others: ReadonlySet<string>;
  readonly ignored: ReadonlySet<string>;
  /** Tokens with digits printed in the row label itself ("Lower 40mm (Axial)"). */
  readonly labelNumbers: ReadonlySet<string>;
  /** Tokens with digits that are not a figure of a row: the label's, the condition's and the models'. */
  readonly ownNumbers: ReadonlySet<string>;
}
/** A whitespace token without the brackets and separators around it ("(40mm)," -> "40mm"). */
const bareToken = (token: string) => token.replace(/^[([{"'“]+|[)\]}"'”,;:]+$/gu, '');
const numberTokens = (text: string) => text.split(/\s+/u).map(bareToken).filter(token => /\p{N}/u.test(token));
function labelWords(evidence: ValueTextEvidence): LabelWords {
  const ignored = new Set([...UNIT_WORDS,
    ...[evidence.unit, evidence.value, evidence.condition, ...evidence.models].flatMap(significantWords)]);
  const keep = (text: string) => significantWords(text).filter(word => !ignored.has(word));
  const target = new Set(keep(evidence.label));
  const others = new Set(evidence.labels.filter(other => other !== evidence.label).flatMap(keep).filter(word => !target.has(word)));
  const labelNumbers = new Set(numberTokens(evidence.label));
  const ownNumbers = new Set([...labelNumbers, ...[evidence.condition, ...evidence.models].flatMap(numberTokens)]);
  return { label: evidence.label, target, others, ignored, labelNumbers, ownNumbers };
}
const meaningful = (text: string, words: LabelWords) => significantWords(text).filter(word => !words.ignored.has(word));
/**
 * A line that prints figures of its own is a row with values ("Faixa de
 * medição 0...900 kPa"), never the rest of the label of the line next to it.
 */
const printsValues = (line: string, words: LabelWords) => numberTokens(line).some(token => !words.ownNumbers.has(token));

type LabelTie = 'TIED' | 'PARTIAL' | 'FOREIGN' | 'NONE';
/** TIED: every label word and no other row's word; PARTIAL: only part of the label; FOREIGN: other words. */
function classifyLabel(group: ReadonlySet<string>, words: LabelWords): LabelTie {
  if (!group.size) return 'NONE';
  if (!words.target.size || [...group].some(word => words.others.has(word))) return 'FOREIGN';
  if ([...words.target].every(word => group.has(word))) return 'TIED';
  return [...group].every(word => words.target.has(word)) ? 'PARTIAL' : 'FOREIGN';
}
/**
 * Words of the nearest group of words before `end`; tokens with digits
 * (values, models) end a group, except the label's own ("Lower 40mm (Axial)").
 */
function wordsBefore(text: string, end: number, words: LabelWords): Set<string> {
  const group = new Set<string>();
  const tokens = text.slice(0, end).split(/\s+/u).filter(Boolean);
  for (let index = tokens.length - 1; index >= 0; index--) {
    if (/\p{N}/u.test(tokens[index]) && !words.labelNumbers.has(bareToken(tokens[index]))) {
      if (group.size) break;
      continue;
    }
    for (const word of meaningful(tokens[index], words)) group.add(word);
  }
  return group;
}
/** Does the text right before `end` name the row label? */
function labelBefore(text: string, end: number, words: LabelWords): LabelTie {
  if (!words.target.size) {
    // A label without words ("IP", "Ø") must be the last text before the value.
    const at = literalEvidencePositions(text.slice(0, end), words.label, 'label').at(-1);
    if (at !== undefined && !meaningful(text.slice(at + words.label.length, end), words).length) return 'TIED';
  }
  return classifyLabel(wordsBefore(text, end, words), words);
}
/**
 * The row label from the value's own line on the page, when the quote does
 * not show it: the words before the value on that line or, when there are
 * none, a label printed on the lines right above and below it (Isotech prints
 * a long row label in two lines around its values). Those neighbour lines may
 * hold only words of this label; no place where the quote occurs may tie the
 * value to another row, and at least one must tie it to this one.
 */
function labelAroundValue(pageText: string, quote: string, offset: number, words: LabelWords): boolean {
  const lines = pageText.split(/\r\n|\r|\n/u).map(normalizeEvidenceWhitespace).filter(Boolean);
  const starts: number[] = [];
  let total = 0;
  for (const line of lines) {
    starts.push(total);
    total += line.length + 1;
  }
  const joined = lines.join(' ');
  let tied = false;
  for (let found = joined.indexOf(quote); found !== -1; found = joined.indexOf(quote, found + 1)) {
    const position = found + offset;
    let index = starts.length - 1;
    while (index > 0 && starts[index] > position) index--;
    const local = position - starts[index];
    const own = labelBefore(lines[index], local, words);
    if (own === 'FOREIGN') return false;
    if (own === 'TIED') {
      tied = true;
      continue;
    }
    if (!words.target.size) continue;
    // With part of the label before the value ("Block Mode (Radial) <0.008"),
    // the rest may come from a neighbour line and the other neighbour may be
    // the next row; with no label at all on the line, both neighbours must be
    // label lines, or "0,1" between "Resolução" and "Exatidão" would pass. A
    // neighbour with figures of its own is another row: it never lends its
    // words ("Faixa 0...700" next to "Faixa de medição 0...900"), and next to
    // it a line without a label cannot tell which row it is (another place
    // of the same quote, such as the line rebuilt from text positions, still can).
    const label = wordsBefore(lines[index], local, words), partial = own === 'PARTIAL';
    let undetermined = false;
    for (const near of [lines[index - 1], lines[index + 1]]) {
      if (near === undefined) continue;
      const nearWords = meaningful(near, words), otherRow = printsValues(near, words);
      if (!otherRow && nearWords.every(word => words.target.has(word))) {
        for (const word of nearWords) label.add(word);
        continue;
      }
      if (partial) continue;
      if (!otherRow) return false;
      undetermined = true;
    }
    if (!undetermined && classifyLabel(label, words) === 'TIED') tied = true;
  }
  return tied;
}

/**
 * Verification BY VALUE on the native text of one cited page. The literal
 * value (sign, decimals and unit kept exactly) must be inside the cited quote,
 * and the quote must be on the page. Model and label do not need to share the
 * line with the value (2D tables), but the quote must not tie the value to
 * another declared model, another declared field or another condition. The
 * result says what the text itself ties to the value (`ValueTextTies`); the
 * caller decides what still needs the page layout or a person.
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
  const words = labelWords({ ...evidence, value, unit, condition });
  // Several models listed before every value: a header list, so the text alone
  // cannot tell columns apart (only the page layout can).
  const headerList = targetModels.length === 1 && otherModels.length > 0 &&
    Math.max(...modelMarks.map(item => item.end)) <= Math.min(...occurrences);
  const modelTied = modelMarks.length > 0 && !headerList;
  const otherModelOnPage = namesOtherModel(page, model, models);
  let firstProblem: TextEvidenceProblem | undefined, best: ValueTextTies | undefined, bestScore = -1;
  for (const start of occurrences) {
    const result = ((): TextEvidenceProblem | ValueTextTies => {
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
      let clauseEnd = start + value.length, unitTied = true;
      if (unit) {
        const following = followingUnit(quote, clauseEnd, unit);
        if (following.kind === 'OTHER') return 'UNIT_MISMATCH';
        if (following.kind === 'CLAIMED') clauseEnd = following.end;
        else if (!unitPresent(value, unit)) {
          // "Faixa (psi) 0...100" never supports kPa, and a unit printed only
          // elsewhere on the page is not tied to this value.
          const header = headerUnitBefore(quote, start, unit, condition, words.ignored);
          if (header === 'OTHER') return 'UNIT_MISMATCH';
          if (header === 'NONE') {
            if (!unitPresent(quote, unit) && !unitPresent(page, unit)) return 'UNIT_NOT_ON_PAGE';
            unitTied = false;
          }
        }
      }
      // "0,003 kPa at 99 C" for a row declared "at 23 C": same clause, other condition.
      if (skeleton) {
        const rest = quote.slice(clauseEnd).replace(/^[\s,;:(]+/u, '');
        skeleton.lastIndex = 0;
        const match = skeleton.exec(rest);
        if (match && match.index === 0 && match[0] !== condition) return 'CONDITION_MISMATCH';
      }
      const inQuote = labelBefore(quote, start, words);
      const labelTied = inQuote === 'TIED' ||
        (inQuote !== 'FOREIGN' && labelAroundValue(evidence.pageText, quote, start, words));
      return { modelTied, otherModelOnPage, labelTied, unitTied };
    })();
    if (typeof result === 'string') {
      firstProblem ??= result;
      continue;
    }
    const score = Number(result.labelTied) + Number(result.unitTied);
    if (score > bestScore) {
      best = result;
      bestScore = score;
    }
  }
  return best ? { verified: true, ...best } : fail(firstProblem ?? 'VALUE_NOT_IN_QUOTE');
}
