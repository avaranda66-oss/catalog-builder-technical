import { TranslationFoundationError } from './contracts';

export interface ProtectedTechnicalToken {
  readonly placeholder: string;
  readonly value: string;
}

export interface ProtectedText {
  readonly protectedText: string;
  readonly namespace: string;
  readonly tokens: readonly ProtectedTechnicalToken[];
}

const PATTERNS: readonly RegExp[] = [
  /\b(?:ISO\/IEC\s*17025|ISO\s*9001|IP6[5-8]|NEMA\s*[A-Za-z0-9.-]+|HART\s*\d*|Modbus(?:\s+(?:RTU|TCP))?|Profibus|FOUNDATION\s+Fieldbus|Fieldbus|RS-?485|RS-?232)\b/gi,
  /\b(?:PRESYS|ISOPLAN|(?:TA|TT|PSV|PCON)-[A-Za-z0-9._-]+|PCON|PSV)\b/gi,
  /(?:±\s*)?[+-]?\d+(?:[.,]\d+)?\s*[–—-]\s*[+-]?\d+(?:[.,]\d+)?\s*(?:°C|°F|bar|mbar|psi|kPa|MPa|Pa|mA|µA|uA|mV|Vdc|Vac|Vcc|Hz|kHz|MHz|%\s*FS|%\s*FE|ppm|Ω|kΩ|MΩ)\b/gi,
  /±\s*\d+(?:[.,]\d+)?\s*(?:%\s*FS|%\s*FE|%|°C|°F|bar|mbar|psi|kPa|MPa|Pa|mA|µA|uA|mV|Vdc|Vac|Vcc|Hz|kHz|MHz|ppm|Ω|kΩ|MΩ)?\b/gi,
  /[+-]?\d+(?:[.,]\d+)?\s*(?:°C|°F|bar|mbar|psi|kPa|MPa|Pa|mA|µA|uA|mV|Vdc|Vac|Vcc|Hz|kHz|MHz|%\s*FS|%\s*FE|ppm|Ω|kΩ|MΩ)\b/gi,
  /[+-]?\d+(?:[.,]\d+)?\s*(?:A|V|W|K)\b/g,
  /\b\d+\/\d+["”]?\s*(?:NPT|BSP|BSPT|UNF)\b/gi,
  /\bM\d+x\d+(?:[.,]\d+)?\b/g,
  /(?:^|(?<=\s))[+-]?\d+(?:[.,]\d+)?(?=\s|$|[.,;:!])/g,
];

interface Match {
  readonly start: number;
  readonly end: number;
  readonly value: string;
}

function overlaps(left: Match, right: Match): boolean {
  return !(left.end <= right.start || left.start >= right.end);
}

function collectMatches(source: string): Match[] {
  const matches: Match[] = [];
  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      const value = match[0];
      const start = match.index;
      const candidate = { start, end: start + value.length, value };
      if (!matches.some((existing) => overlaps(existing, candidate))) matches.push(candidate);
      if (match[0].length === 0) regex.lastIndex += 1;
    }
  }
  return matches.sort((left, right) => left.start - right.start || right.end - left.end);
}

function collisionSafeNamespace(source: string): string {
  let suffix = 0;
  for (;;) {
    const namespace = suffix === 0 ? 'VNEXT_TECH' : `VNEXT_TECH_${suffix}`;
    if (!source.includes(`[[${namespace}_`)) return namespace;
    suffix += 1;
  }
}

export function protectTechnicalTokens(source: string): ProtectedText {
  const matches = collectMatches(source);
  if (matches.length === 0) return { protectedText: source, namespace: 'VNEXT_TECH', tokens: [] };

  const namespace = collisionSafeNamespace(source);
  const tokens = matches.map((match, index) => ({
    placeholder: `[[${namespace}_${String(index + 1).padStart(3, '0')}]]`,
    value: match.value,
  }));

  let protectedText = source;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    protectedText =
      protectedText.slice(0, match.start) +
      tokens[index].placeholder +
      protectedText.slice(match.end);
  }

  return { protectedText, namespace, tokens };
}

function occurrences(text: string, value: string): number {
  if (!value) return 0;
  let count = 0;
  let start = 0;
  for (;;) {
    const found = text.indexOf(value, start);
    if (found < 0) return count;
    count += 1;
    start = found + value.length;
  }
}

function placeholderPattern(namespace: string): RegExp {
  const escaped = namespace.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`\\[\\[${escaped}_[^\\]]+\\]\\]`, 'g');
}

export function assertProtectedTokenIntegrity(translatedText: string, protectedValue: ProtectedText): void {
  const expected = new Set(protectedValue.tokens.map((token) => token.placeholder));
  for (const placeholder of expected) {
    if (occurrences(translatedText, placeholder) !== 1) {
      throw new TranslationFoundationError(
        'TECHNICAL_TOKEN_MISMATCH',
        `Protected placeholder must appear exactly once: ${placeholder}`
      );
    }
  }

  const actual = translatedText.match(placeholderPattern(protectedValue.namespace)) ?? [];
  if (actual.length !== expected.size || actual.some((placeholder) => !expected.has(placeholder))) {
    throw new TranslationFoundationError(
      'TECHNICAL_TOKEN_MISMATCH',
      'Provider returned an unexpected or duplicated technical placeholder'
    );
  }
}

export function restoreTechnicalTokens(translatedText: string, protectedValue: ProtectedText): string {
  assertProtectedTokenIntegrity(translatedText, protectedValue);
  let restored = translatedText;
  for (const token of protectedValue.tokens) {
    restored = restored.replace(token.placeholder, token.value);
  }
  if (restored.includes(`[[${protectedValue.namespace}_`)) {
    throw new TranslationFoundationError('TECHNICAL_TOKEN_MISMATCH', 'Unrestored technical placeholder remains');
  }
  return restored;
}

export function technicalTokenFingerprintMaterial(protectedValue: ProtectedText): string {
  return JSON.stringify(protectedValue.tokens.map((token) => [token.placeholder, token.value]));
}

