/**
 * FR-85 · Números e abreviações por idioma (módulo puro, sem DOM).
 *
 * O provedor de tradução devolve os dados técnicos exatamente como no original em
 * português ("0,02 % FE"). Um catálogo em inglês precisa de "0.02 % FS". Este módulo
 * calcula essas adaptações sobre o texto traduzido e devolve SUGESTÕES: quem aplica é
 * a pessoa que revisa (TranslationReview), nunca o módulo sozinho.
 *
 * pt-BR → en-US
 *   "Exatidão: ±0,02 % FE"                → "Accuracy: ±0.02 % FS"        (PRESYS TA-25N)
 *   "0,01 % da leitura + 0,005 % FE"      → "0.01 % RDG + 0.005 % FS"     (PRESYS PCON-Y17)
 *   "±(0,1 °C + 0,1 % da leitura)"        → "±(0.1 °C + 0.1 % RDG)"       (Isotech / folder TA)
 *   "Estabilidade: ±0,02 °C"              → "Stability: ±0.02 °C"         (Additel 875)
 *   "1,5 kg"                              → "1.5 kg"                      (Beamex MC6)
 *   "1.500,5 Pa"                          → "1,500.5 Pa"                  (milhar + decimal: não é ambíguo)
 *   "1.000.000 Pa"                        → "1,000,000 Pa"                (dois pontos de milhar: não é ambíguo)
 *   "-25 a 140 °C", "4–20 mA", "ISO 9001" → iguais                        (inteiros não mudam)
 *   "TA-25N", "06.04.0121-00/IN1P"        → iguais                        (códigos nunca mudam)
 *   "15/10/2026", "10:30"                 → iguais                        (datas e horários nunca mudam)
 *   "1.500 mbar", "10.000 psi", "2.000"   → NÃO mudam; vão para `confirmations`
 *       porque em pt-BR "1.500" pode ser mil e quinhentos (→ "1,500") ou já estar em
 *       formato inglês (um vírgula cinco, → fica "1.500"). Só a pessoa sabe.
 *
 * pt-BR → es-ES
 *   Números ficam como estão (vírgula decimal e ponto de milhar são iguais nos dois idiomas).
 *   "% FE" fica. "% da leitura" → "% de la lectura".
 *
 * O que este módulo NÃO faz: não traduz prosa, não inventa unidades, não altera inteiros,
 * não toca em códigos/normas/datas e não decide sozinho os casos ambíguos.
 *
 * Reuso no servidor (Onda 4C): o módulo não depende de DOM nem de React; o gateway pode
 * importá-lo para pré-calcular `changes`/`confirmations` por trecho, desde que continue
 * devolvendo o texto original e deixe a aplicação para a revisão.
 */

export type LocaleFormatSourceLocale = 'pt-BR';
export type LocaleFormatTargetLocale = 'en-US' | 'es-ES';

export interface LocaleFormatOptions {
  readonly sourceLocale: LocaleFormatSourceLocale;
  readonly targetLocale: LocaleFormatTargetLocale;
  /**
   * Números exatos (como aparecem no texto) que a pessoa já confirmou e que não devem
   * receber nova sugestão nem nova pergunta. Ex.: depois de confirmar "1.500" como
   * mil e quinhentos, o texto passa a ter "1,500" e esse valor entra aqui.
   */
  readonly keep?: readonly string[];
}

export type LocaleFormatChangeKind = 'decimal' | 'abbreviation' | 'thousands';

export interface LocaleFormatChange {
  readonly from: string;
  readonly to: string;
  readonly kind: LocaleFormatChangeKind;
  /** Posição de `from` no texto de entrada. */
  readonly index: number;
}

export type LocaleNumberReading = 'thousands' | 'decimal';

export interface LocaleFormatConfirmationOption {
  readonly reading: LocaleNumberReading;
  /** Leitura por extenso em português: "mil e quinhentos" / "um vírgula cinco". */
  readonly label: string;
  /** Texto que substitui o número se esta leitura for escolhida. */
  readonly value: string;
}

export interface LocaleFormatConfirmation {
  readonly token: string;
  /** Posição de `token` no texto de entrada. */
  readonly index: number;
  /** Posição de `token` em `text` (texto com as mudanças aplicadas). */
  readonly outputIndex: number;
  readonly reason: 'ambiguous-thousands';
  readonly options: readonly LocaleFormatConfirmationOption[];
}

export interface LocaleFormatResult {
  /** Texto com todas as `changes` aplicadas; os números ambíguos ficam como na entrada. */
  readonly text: string;
  readonly changes: readonly LocaleFormatChange[];
  readonly confirmations: readonly LocaleFormatConfirmation[];
}

interface Replacement {
  readonly index: number;
  readonly from: string;
  readonly to: string;
  readonly kind: LocaleFormatChangeKind;
}

interface Ambiguity {
  readonly index: number;
  readonly token: string;
  readonly sign: string;
  readonly core: string;
}

interface Analysis {
  readonly replacements: readonly Replacement[];
  readonly ambiguities: readonly Ambiguity[];
}

const NUMBER_PATTERN = /[+−-]?\d+(?:[.,]\d+)*/gu;
const WORD_CHARACTER = /[\p{L}\p{N}_]/u;
const GLUED_BEFORE = /[\p{L}\p{N}_.,/:]/u;
const CODE_AFTER = /[\p{L}\p{N}_/:‐-]/u;
const SIGN = /^[+−-]$/u;

function characterAt(text: string, index: number): string {
  return index < 0 || index >= text.length ? '' : text.charAt(index);
}

function thousandsShape(groups: readonly string[]): boolean {
  const [first, ...rest] = groups;
  if (!first || rest.length === 0) return false;
  if (first.length > 3 || first === '0' || (first.length > 1 && first.startsWith('0'))) return false;
  return rest.every(group => group.length === 3);
}

/** Núcleo numérico "preso" a um código, palavra, data ou horário: nunca é tratado como número. */
function gluedToCode(text: string, matchIndex: number, sign: string, core: string, hasComma: boolean): boolean {
  const coreIndex = matchIndex + sign.length;
  const beforeCore = characterAt(text, coreIndex - 1);
  const afterCore = characterAt(text, coreIndex + core.length);
  if (sign) {
    const beforeSign = characterAt(text, matchIndex - 1);
    if (WORD_CHARACTER.test(beforeSign) && (!hasComma || /[\p{L}_]/u.test(beforeSign))) return true;
    if (/[.,/:]/u.test(beforeSign)) return true;
  } else if (GLUED_BEFORE.test(beforeCore)) {
    return true;
  }
  if (!hasComma && CODE_AFTER.test(afterCore)) return true;
  if (hasComma && /[\p{N}_/:]/u.test(afterCore)) return true;
  return false;
}

function analyzeNumbers(text: string, options: LocaleFormatOptions): Analysis {
  const replacements: Replacement[] = [];
  const ambiguities: Ambiguity[] = [];
  if (options.targetLocale !== 'en-US') return { replacements, ambiguities };
  const keep = new Set(options.keep ?? []);
  const pattern = new RegExp(NUMBER_PATTERN.source, NUMBER_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const token = match[0];
    const sign = SIGN.test(token.charAt(0)) ? token.charAt(0) : '';
    const core = token.slice(sign.length);
    if (!/[.,]/.test(core)) continue;
    if (keep.has(core) || keep.has(token)) continue;
    const commas = core.split(',').length - 1;
    if (commas > 1) continue;
    if (gluedToCode(text, match.index, sign, core, commas === 1)) continue;
    if (commas === 1) {
      const [integerPart, fractionPart] = core.split(',');
      if (fractionPart.includes('.')) continue;
      if (integerPart.includes('.')) {
        if (!thousandsShape(integerPart.split('.'))) continue;
        replacements.push({ index: match.index, from: token, kind: 'thousands',
          to: `${sign}${integerPart.replace(/\./g, ',')}.${fractionPart}` });
      } else {
        replacements.push({ index: match.index, from: token, kind: 'decimal', to: `${sign}${integerPart}.${fractionPart}` });
      }
      continue;
    }
    const groups = core.split('.');
    if (!thousandsShape(groups)) continue;
    if (groups.length > 2) {
      replacements.push({ index: match.index, from: token, kind: 'thousands', to: `${sign}${core.replace(/\./g, ',')}` });
      continue;
    }
    ambiguities.push({ index: match.index, token, sign, core });
  }
  return { replacements, ambiguities };
}

interface AbbreviationRule {
  readonly pattern: RegExp;
  readonly replace: (match: RegExpExecArray) => string | undefined;
}

const PERCENT_READING = String.raw`(%\s*)(?:(?:da|de|of)\s+(?:the\s+)?)?(?:leitura|leit\.|reading|rdg\.?)(?![\p{L}\p{N}])`;
const PERCENT_FULL_SCALE = String.raw`(%\s*)(?:(?:do|of)\s+(?:the\s+)?)?(?:fundo\s+de\s+escala|full[\s-]scale)(?![\p{L}\p{N}])`;

const EN_RULES: readonly AbbreviationRule[] = [
  { pattern: /(%\s*)([Ff])(\.?)[Ee](\.?)(?![\p{L}\p{N}])/gu,
    replace: match => `${match[1]}F${match[3]}S${match[4]}` },
  { pattern: new RegExp(PERCENT_READING, 'giu'),
    replace: match => (match[0].slice(match[1].length) === 'RDG' ? undefined : `${match[1]}RDG`) },
  { pattern: new RegExp(PERCENT_FULL_SCALE, 'giu'), replace: match => `${match[1]}FS` },
];

const ES_RULES: readonly AbbreviationRule[] = [
  { pattern: /(%\s*)(?:da\s+)?(?:leitura|leit\.)(?![\p{L}\p{N}])/giu, replace: match => `${match[1]}de la lectura` },
  { pattern: /(%\s*)(?:do\s+)?fundo\s+de\s+escala(?![\p{L}\p{N}])/giu, replace: match => `${match[1]}FE` },
];

function analyzeAbbreviations(text: string, options: LocaleFormatOptions): Replacement[] {
  const rules = options.targetLocale === 'en-US' ? EN_RULES : ES_RULES;
  const replacements: Replacement[] = [];
  for (const rule of rules) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[0].length === 0) { pattern.lastIndex += 1; continue; }
      const to = rule.replace(match);
      if (to === undefined || to === match[0]) continue;
      replacements.push({ index: match.index, from: match[0], to, kind: 'abbreviation' });
    }
  }
  return replacements;
}

function overlapping(left: Replacement, right: Replacement): boolean {
  return !(left.index + left.from.length <= right.index || right.index + right.from.length <= left.index);
}

function analyze(text: string, options: LocaleFormatOptions): Analysis {
  if (options.sourceLocale !== 'pt-BR') return { replacements: [], ambiguities: [] };
  const numbers = analyzeNumbers(text, options);
  const abbreviations = analyzeAbbreviations(text, options)
    .filter(candidate => !numbers.replacements.some(existing => overlapping(existing, candidate)));
  const replacements = [...numbers.replacements, ...abbreviations].sort((left, right) => left.index - right.index);
  return { replacements, ambiguities: numbers.ambiguities };
}

function applyReplacements(text: string, replacements: readonly Replacement[]): string {
  let output = text;
  for (const replacement of [...replacements].sort((left, right) => right.index - left.index)) {
    output = output.slice(0, replacement.index) + replacement.to + output.slice(replacement.index + replacement.from.length);
  }
  return output;
}

function outputIndex(index: number, replacements: readonly Replacement[]): number {
  let shift = 0;
  for (const replacement of replacements) if (replacement.index < index) shift += replacement.to.length - replacement.from.length;
  return index + shift;
}

const UNITS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function belowThousand(value: number): string {
  if (value === 100) return 'cem';
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest) {
    if (rest < 20) parts.push(UNITS[rest]);
    else parts.push(rest % 10 ? `${TENS[Math.floor(rest / 10)]} e ${UNITS[rest % 10]}` : TENS[Math.floor(rest / 10)]);
  }
  return parts.join(' e ');
}

/** Inteiro por extenso em português (até 999.999.999); fora disso devolve os dígitos. */
export function integerWordsPtBr(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= 1_000_000_000) return String(value);
  if (value === 0) return 'zero';
  const millions = Math.floor(value / 1_000_000);
  const thousands = Math.floor(value / 1_000) % 1_000;
  const rest = value % 1_000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? 'um milhão' : `${belowThousand(millions)} milhões`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${belowThousand(thousands)} mil`);
  if (rest) parts.push(belowThousand(rest));
  if (parts.length > 1 && rest && (rest < 100 || rest % 100 === 0)) {
    const last = parts.pop();
    return `${parts.join(' ')} e ${last}`;
  }
  return parts.join(' ');
}

function decimalWordsPtBr(integerPart: string, fractionDigits: string): string {
  const trimmed = fractionDigits.replace(/0+$/, '');
  const digits = trimmed ? [...trimmed].map(digit => UNITS[Number(digit)]).join(' ') : 'zero';
  return `${integerWordsPtBr(Number(integerPart))} vírgula ${digits}`;
}

function confirmationFor(ambiguity: Ambiguity, replacements: readonly Replacement[]): LocaleFormatConfirmation {
  const [integerPart, fractionPart] = ambiguity.core.split('.');
  const thousandsValue = `${ambiguity.sign}${ambiguity.core.replace(/\./g, ',')}`;
  return {
    token: ambiguity.token,
    index: ambiguity.index,
    outputIndex: outputIndex(ambiguity.index, replacements),
    reason: 'ambiguous-thousands',
    options: [
      { reading: 'thousands', label: integerWordsPtBr(Number(ambiguity.core.replace(/\./g, ''))), value: thousandsValue },
      { reading: 'decimal', label: decimalWordsPtBr(integerPart, fractionPart), value: ambiguity.token },
    ],
  };
}

/**
 * Calcula as adaptações de número e abreviação do texto traduzido para o idioma de destino.
 * Devolve o texto ajustado e a lista de mudanças; números ambíguos não mudam e vão para
 * `confirmations`, com as duas leituras possíveis. Nunca altera a entrada.
 */
export function formatTechnicalTextForLocale(text: string, options: LocaleFormatOptions): LocaleFormatResult {
  const analysis = analyze(text, options);
  return {
    text: applyReplacements(text, analysis.replacements),
    changes: analysis.replacements.map(({ from, to, kind, index }) => ({ from, to, kind, index })),
    confirmations: analysis.ambiguities.map(ambiguity => confirmationFor(ambiguity, analysis.replacements)),
  };
}

/** Aplica uma leitura escolhida pela pessoa a TODAS as ocorrências do mesmo número ambíguo no texto de entrada. */
export function applyNumberReading(
  text: string,
  confirmations: readonly LocaleFormatConfirmation[],
  option: LocaleFormatConfirmationOption
): string {
  let output = text;
  const targets = confirmations
    .filter(confirmation => confirmation.options.some(item => item.reading === option.reading && item.value === option.value))
    .sort((left, right) => right.index - left.index);
  for (const confirmation of targets) {
    if (output.slice(confirmation.index, confirmation.index + confirmation.token.length) !== confirmation.token) continue;
    output = output.slice(0, confirmation.index) + option.value + output.slice(confirmation.index + confirmation.token.length);
  }
  return output;
}

const MAX_PARTIAL_CHANGES = 6;
const MAX_CONFIRMATIONS = 4;

/**
 * Todas as formas que um dado técnico de origem pode assumir no idioma de destino sem
 * mudar de valor: o original, cada subconjunto das mudanças (a pessoa pode ter aplicado
 * só parte) e, para números ambíguos, cada leitura possível. Usado pela revisão para
 * aceitar "0.02 % FS" no lugar de "0,02 % FE" e recusar qualquer outro valor.
 */
export function localeTokenRenderings(token: string, targetLocale: LocaleFormatTargetLocale): readonly string[] {
  const analysis = analyze(token, { sourceLocale: 'pt-BR', targetLocale });
  const renderings = new Set<string>([token]);
  const subsets: Replacement[][] = [];
  if (analysis.replacements.length <= MAX_PARTIAL_CHANGES) {
    const total = 1 << analysis.replacements.length;
    for (let mask = 0; mask < total; mask += 1) subsets.push(analysis.replacements.filter((_, bit) => mask & (1 << bit)));
  } else {
    subsets.push([], [...analysis.replacements]);
  }
  const ambiguities = analysis.ambiguities.slice(0, MAX_CONFIRMATIONS);
  for (const subset of subsets) {
    const base = applyReplacements(token, subset);
    const confirmations = ambiguities.map(ambiguity => confirmationFor(ambiguity, subset));
    const expand = (position: number, text: string): void => {
      if (position < 0) { renderings.add(text); return; }
      const confirmation = confirmations[position];
      for (const option of confirmation.options) {
        const start = confirmation.outputIndex;
        expand(position - 1, text.slice(0, start) + option.value + text.slice(start + confirmation.token.length));
      }
    };
    expand(confirmations.length - 1, base);
  }
  return [...renderings];
}

const MAX_MATCH_STEPS = 20_000;

/**
 * Compara os dados técnicos da origem com os da tradução como multiconjuntos. Sem
 * `targetLocale`, só a igualdade exata vale. Com ele, cada dado da origem também pode
 * aparecer em qualquer forma de `localeTokenRenderings`; qualquer outra diferença
 * (valor, unidade, código a mais ou a menos) continua sendo recusada.
 */
export function technicalTokensEquivalentForLocale(
  sourceTokens: readonly string[],
  translatedTokens: readonly string[],
  targetLocale?: LocaleFormatTargetLocale
): boolean {
  if (sourceTokens.length !== translatedTokens.length) return false;
  const remainingTranslated = [...translatedTokens];
  const remainingSource: string[] = [];
  for (const token of sourceTokens) {
    const found = remainingTranslated.indexOf(token);
    if (found >= 0) remainingTranslated.splice(found, 1);
    else remainingSource.push(token);
  }
  if (remainingSource.length === 0) return true;
  if (!targetLocale) return false;
  const renderings = remainingSource.map(token => new Set(localeTokenRenderings(token, targetLocale)));
  if (renderings.some(set => set.size === 1)) return false;
  const used = new Array<boolean>(remainingTranslated.length).fill(false);
  let steps = 0;
  const match = (position: number): boolean => {
    if (position === renderings.length) return true;
    for (let candidate = 0; candidate < remainingTranslated.length; candidate += 1) {
      if (used[candidate] || !renderings[position].has(remainingTranslated[candidate])) continue;
      if (++steps > MAX_MATCH_STEPS) return false;
      used[candidate] = true;
      if (match(position + 1)) return true;
      used[candidate] = false;
    }
    return false;
  };
  return match(0);
}
