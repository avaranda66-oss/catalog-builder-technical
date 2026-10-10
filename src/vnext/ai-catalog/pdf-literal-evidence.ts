type LiteralKind = 'model' | 'label' | 'value' | 'unit' | 'condition';

/** Literal token boundaries: no sign, decimal, unit prefix or model suffix repair. */
export function literalEvidencePositions(text: string, literal: string, kind: LiteralKind): number[] {
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
      /[/·⋅*^]$/u.test(text.slice(0, index).trimEnd()) ||
      /^[/·⋅*^]/u.test(text.slice(index + literal.length).trimStart())
    );
    if (!badBefore && !boundary.test(after) && !badModelBoundary && !lostDegree &&
        !separatedSign && !partialCompoundUnit) positions.push(index);
  }
  return positions;
}

export const hasLiteralEvidence = (text: string, literal: string, kind: LiteralKind) =>
  literalEvidencePositions(text, literal, kind).length > 0;

export interface AtomicPdfEvidence {
  quote: string;
  model: string;
  models: readonly string[];
  label: string;
  labels: readonly string[];
  value: string;
  unit: string;
  condition: string;
}

/**
 * Bounded text evidence, not general PDF-table understanding. A single model
 * and one contiguous label/value/unit/condition clause are required. Dense
 * 2D or mixed-field quotations must go through a reviewed visual path.
 */
export function hasAtomicPdfEvidence(evidence: AtomicPdfEvidence): boolean {
  const { quote, model, models, label, labels, value, unit, condition } = evidence;
  if (!value.trim() || quote.includes('\n') || quote.includes('\r') ||
      !hasLiteralEvidence(quote, model, 'model') ||
      models.some(other => other !== model && hasLiteralEvidence(quote, other, 'model')) ||
      labels.some(other => other !== label && hasLiteralEvidence(quote, other, 'label'))) return false;
  const separator = /^[\s|,:;=()[\]]*$/u;
  const parts: { literal: string; kind: LiteralKind }[] = [
    { literal: model, kind: 'model' }, { literal: label, kind: 'label' }, { literal: value, kind: 'value' },
    ...(unit ? [{ literal: unit, kind: 'unit' as const }] : []),
    ...(condition ? [{ literal: condition, kind: 'condition' as const }] : []),
  ];
  const follows = (part: number, end: number): boolean => {
    if (part === parts.length) return true;
    const next = parts[part];
    return literalEvidencePositions(quote, next.literal, next.kind).some(position =>
      position >= end && separator.test(quote.slice(end, position)) &&
      follows(part + 1, position + next.literal.length));
  };
  return literalEvidencePositions(quote, model, 'model').some(position => follows(1, position + model.length));
}
