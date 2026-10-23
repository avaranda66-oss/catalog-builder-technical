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
 *   "1,5 kg", "1,5kg"                     → "1.5 kg", "1.5kg"             (Beamex MC6)
 *   "0,5 % do fundo de escala"            → "0.5 % FS"
 *   "0,1 %/0,2 % FE", "0,5/1,0 bar"       → "0.1 %/0.2 % FS", "0.5/1.0 bar" (barra entre dois decimais)
 *   "M20x1,5", "M12x1,5"                  → "M20x1.5", "M12x1.5"          (rosca métrica / prensa-cabo)
 *   "1.500,5 Pa"                          → "1,500.5 Pa"                  (milhar + decimal: não é ambíguo)
 *   "1.000.000 Pa"                        → "1,000,000 Pa"                (dois pontos de milhar: não é ambíguo)
 *   "-25,5 a 140,5 °C", "−0,5 °C"         → "-25.5 a 140.5 °C", "−0.5 °C" (o sinal fica igual)
 *   "Ø25,4 mm × 124 mm"                   → "Ø25.4 mm × 124 mm"           (diâmetro: o símbolo não é código)
 *   "24 Vcc", "230 Vca"                   → "24 Vdc", "230 Vac"           (mesma unidade, sigla do inglês)
 *   "-25 a 140 °C", "4–20 mA", "ISO 9001" → iguais                        (inteiros não mudam)
 *   "TA-25N", "06.04.0121-00/IN1P"        → iguais                        (códigos nunca mudam)
 *   "15/10/2026", "10:30"                 → iguais                        (datas e horários nunca mudam)
 *   "itens 1,2 e 3", "páginas 3,4, 5 e 6" → iguais                        (vírgula de enumeração, não decimal)
 *   "1.500 mbar", "10.000 psi", "2.000"   → NÃO mudam; vão para `confirmations`
 *       porque em pt-BR "1.500" pode ser mil e quinhentos (→ "1,500") ou já estar em
 *       formato inglês (um vírgula cinco, → fica "1.500"). Só a pessoa sabe.
 *   "1.500-2.000 mbar", "0-10.000 psi"    → faixa com unidade: cada lado vira uma confirmação.
 *   "1.500-2.000" (sem unidade), "1.234-5" → iguais (podem ser código; ficam para a pessoa).
 *
 * pt-BR → es-ES
 *   Números ficam como estão (vírgula decimal e ponto de milhar são iguais nos dois idiomas).
 *   "% FE" fica. "% da leitura" → "% de la lectura". "% do fundo de escala" → "% FE".
 *
 * O que este módulo NÃO faz: não traduz prosa, não inventa unidades, não altera inteiros,
 * não toca em códigos/normas/datas e não decide sozinho os casos ambíguos.
 *
 * Reuso no servidor (Onda 4C): o módulo não depende de DOM nem de React; o gateway pode
 * importá-lo para pré-calcular `changes`/`confirmations` por trecho, desde que continue
 * devolvendo o texto original e deixe a aplicação para a revisão.
 */

import { technicalTokenSpans, type TechnicalTokenSpan } from './technical-token-protector';

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
  /**
   * As leituras possíveis dos números ambíguos da ORIGEM ("1,500" e "1.500" para "1.500").
   * Nunca recebem mudança — a pessoa pode ter digitado "1,500" à mão, e isso não pode virar
   * "1,500 → 1.500" — mas, se continuarem ambíguas no texto, ainda recebem pergunta.
   */
  readonly sourceReadings?: readonly string[];
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
  /**
   * Valores produzidos pelas mudanças de número (não de abreviação), ex.: "1.500" vindo de
   * "1,500 mm". Já estão decididos: depois de aplicados, não devem virar pergunta
   * ("1.500" é um vírgula cinco, não mil e quinhentos). A tela os junta a `keep`.
   */
  readonly settled: readonly string[];
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
const GLUED_BEFORE = /[\p{L}\p{N}_.,/:]/u;
const CODE_AFTER = /[\p{L}\p{N}_/:‐-]/u;
const DASH = /[–—−-]/u;
const SIGN = /^[+−-]$/u;
/** Unidades que fecham uma faixa; a mesma lista do padrão de faixa do protetor de dados técnicos. */
const RANGE_UNITS = String.raw`°C|°F|bar|mbar|psi|kPa|MPa|Pa|mA|µA|uA|mV|Vdc|Vac|Vcc|Hz|kHz|MHz|%\s*FS|%\s*FE|ppm|Ω|kΩ|MΩ`;
/** Traço + número + unidade a partir de uma posição ("-2.000 mbar", "–10.000 psi"): lado direito de uma faixa. */
const RANGE_TAIL = new RegExp(String.raw`\s*[–—−-]\s*[+−-]?\d+(?:[.,]\d+)*\s*(?:${RANGE_UNITS})(?![\p{L}\p{N}_])`, 'iuy');
/** Rosca métrica e prensa-cabo: "M20x1,5", "M12x1,5". */
const METRIC_THREAD = /\bM(\d+)x(\d+),(\d+)(?![\p{L}\p{N}_])/gu;
const DECIMAL_BEFORE_SLASH = /(?:\d,\d+|%)\s*\/$/u;
const DECIMAL_AFTER_SLASH = /^\/\s*[+−-]?\d+,\d+(?!\d)/u;
const LABEL_COLON = /\p{L}:$/u;
/** Símbolos de diâmetro antes do número: "Ø25,4 mm", "ø6,35 mm", "⌀3,2 mm". */
const DIAMETER = /^[Øø⌀]$/u;
/** " e 3", " and 3", " y 3", ", 5": o que vem depois de "1,2" numa enumeração. */
const ENUMERATION_TAIL = /^(?:\s+(?:e|and|y)\s+|,\s+)\d+(?!\d|[.,]\d)/iu;
/** "itens ", "páginas ", "see items ": o que vem antes de "1,2" numa enumeração. */
const ENUMERATION_HEAD = /(?:^|[^\p{L}])(?:itens?|p[áa]ginas?|p[áa]g\.|figuras?|fig\.|tabelas?|se[çc][ãa]o|se[çc][õo]es|cap[íi]tulos?|passos?|etapas?|items?|pages?|figures?|tables?|sections?|chapters?|steps?)\s+$/iu;

function characterAt(text: string, index: number): string {
  return index < 0 || index >= text.length ? '' : text.charAt(index);
}

function thousandsShape(groups: readonly string[]): boolean {
  const [first, ...rest] = groups;
  if (!first || rest.length === 0) return false;
  if (first.length > 3 || first === '0' || (first.length > 1 && first.startsWith('0'))) return false;
  return rest.every(group => group.length === 3);
}

function rangeAt(text: string, index: number): boolean {
  RANGE_TAIL.lastIndex = index;
  return RANGE_TAIL.test(text);
}

/** "itens 1,2 e 3", "páginas 3,4, 5 e 6", "see items 1,2 and 3": vírgula de enumeração, não decimal. */
function isEnumeration(text: string, index: number, core: string): boolean {
  return ENUMERATION_TAIL.test(text.slice(index + core.length)) || ENUMERATION_HEAD.test(text.slice(0, index));
}

/** Núcleo numérico "preso" a um código, palavra, data ou horário: nunca é tratado como número. */
function gluedToCode(text: string, coreIndex: number, sign: string, core: string, hasComma: boolean): boolean {
  const beforeCore = characterAt(text, coreIndex - 1);
  const afterIndex = coreIndex + core.length;
  const afterCore = characterAt(text, afterIndex);
  if (sign) {
    // Traço depois de dígito (faixa ou código) já foi decidido em analyzeNumbers.
    if (/[\p{L}\p{N}_.,/:]/u.test(characterAt(text, coreIndex - sign.length - 1))) return true;
  } else if (GLUED_BEFORE.test(beforeCore) && !(DIAMETER.test(beforeCore) && !GLUED_BEFORE.test(characterAt(text, coreIndex - 2)))) {
    // "Ø25,4 mm" é diâmetro (o símbolo não faz do número um código); "AØ25,4" continua colado.
    const before = text.slice(0, coreIndex);
    // "0,1 %/0,2 %" e "0,5/1,0 bar": barra entre dois decimais é separador; "Exatidão:0,02" é rótulo sem espaço.
    const slashBetweenDecimals = hasComma && beforeCore === '/' && DECIMAL_BEFORE_SLASH.test(before);
    const labelColon = hasComma && beforeCore === ':' && LABEL_COLON.test(before);
    if (!slashBetweenDecimals && !labelColon) return true;
  }
  if (!hasComma && CODE_AFTER.test(afterCore)) {
    // "1.500-2.000 mbar", "0-10.000 psi": traço seguido de número e unidade é faixa, não código.
    if (!(DASH.test(afterCore) && rangeAt(text, afterIndex))) return true;
  }
  if (hasComma && /[\p{N}_/:]/u.test(afterCore)) {
    if (!(afterCore === '/' && DECIMAL_AFTER_SLASH.test(text.slice(afterIndex)))) return true;
  }
  return false;
}

function analyzeNumbers(text: string, options: LocaleFormatOptions): Analysis {
  const replacements: Replacement[] = [];
  const ambiguities: Ambiguity[] = [];
  if (options.targetLocale !== 'en-US') return { replacements, ambiguities };
  const keep = new Set(options.keep ?? []);
  const sourceReadings = new Set(options.sourceReadings ?? []);
  // Rosca métrica: o decimal está colado ao "x", mas "M20x1,5" é "M20x1.5" em inglês.
  const thread = new RegExp(METRIC_THREAD.source, METRIC_THREAD.flags);
  let threadMatch: RegExpExecArray | null;
  while ((threadMatch = thread.exec(text)) !== null) {
    const from = threadMatch[0];
    if (keep.has(from)) continue;
    replacements.push({ index: threadMatch.index, from, to: `M${threadMatch[1]}x${threadMatch[2]}.${threadMatch[3]}`, kind: 'decimal' });
  }
  const pattern = new RegExp(NUMBER_PATTERN.source, NUMBER_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    let token = match[0];
    let index = match.index;
    let sign = SIGN.test(token.charAt(0)) ? token.charAt(0) : '';
    const core = token.slice(sign.length);
    if (!/[.,]/.test(core)) continue;
    const commas = core.split(',').length - 1;
    if (commas > 1) continue;
    const hasComma = commas === 1;
    if (sign && /\d/.test(characterAt(text, index - 1))) {
      // Traço entre dois números: faixa ("0-10.000 psi", "0,5-1,0 bar") ou código ("06.04.0121-00", "1.234-5").
      if (!hasComma && !rangeAt(text, index)) continue;
      index += 1; token = core; sign = '';
    }
    if (keep.has(core) || keep.has(token)) continue;
    // Posição do núcleo, depois do sinal: "-25,5 °C" e "−0,5 °C" também são decimais (o sinal fica igual).
    const coreIndex = index + sign.length;
    if (gluedToCode(text, coreIndex, sign, core, hasComma)) continue;
    const protectedReading = sourceReadings.has(core) || sourceReadings.has(token);
    if (hasComma) {
      const [integerPart, fractionPart] = core.split(',');
      if (fractionPart.includes('.')) continue;
      if (fractionPart.length === 1 && isEnumeration(text, coreIndex, core)) continue;
      if (protectedReading) continue;
      if (integerPart.includes('.')) {
        if (!thousandsShape(integerPart.split('.'))) continue;
        replacements.push({ index, from: token, kind: 'thousands', to: `${sign}${integerPart.replace(/\./g, ',')}.${fractionPart}` });
      } else {
        replacements.push({ index, from: token, kind: 'decimal', to: `${sign}${integerPart}.${fractionPart}` });
      }
      continue;
    }
    const groups = core.split('.');
    if (!thousandsShape(groups)) continue;
    if (groups.length > 2) {
      if (!protectedReading) replacements.push({ index, from: token, kind: 'thousands', to: `${sign}${core.replace(/\./g, ',')}` });
      continue;
    }
    ambiguities.push({ index, token, sign, core });
  }
  return { replacements, ambiguities };
}

interface AbbreviationRule {
  readonly pattern: RegExp;
  readonly replace: (match: RegExpExecArray) => string | undefined;
}

const PERCENT_READING = String.raw`(%\s*)(?:(?:da|de|of)\s+(?:the\s+)?)?(?:leitura|leit\.|reading|rdg)(?![\p{L}\p{N}])`;
const PERCENT_FULL_SCALE = String.raw`(%\s*)(?:(?:do|of)\s+(?:the\s+)?)?(?:fundo\s+de\s+escala|full[\s-]scale)(?![\p{L}\p{N}])`;

const EN_RULES: readonly AbbreviationRule[] = [
  { pattern: /(%\s*)([Ff])(\.?)[Ee](\.?)(?![\p{L}\p{N}])/gu,
    replace: match => `${match[1]}F${match[3]}S${match[4]}` },
  // "% RDG" e "% rdg" já estão certos (o ponto final da frase fica onde está).
  { pattern: new RegExp(PERCENT_READING, 'giu'),
    replace: match => (/^rdg$/iu.test(match[0].slice(match[1].length)) ? undefined : `${match[1]}RDG`) },
  { pattern: new RegExp(PERCENT_FULL_SCALE, 'giu'), replace: match => `${match[1]}FS` },
  // Mesma unidade, sigla do inglês: "24 Vcc" → "24 Vdc", "230 Vca" → "230 Vac" (nada é convertido).
  { pattern: /(?<![\p{L}\p{N}])V(cc|ca)(?![\p{L}\p{N}])/gu, replace: match => (match[1] === 'cc' ? 'Vdc' : 'Vac') },
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
    settled: [...new Set(analysis.replacements.filter(replacement => replacement.kind !== 'abbreviation').map(replacement => replacement.to))],
  };
}

/** Só as mudanças de abreviação ("% FE" → "% FS", "% do fundo de escala" → "% FS"/"% FE"), sem tocar em número algum. */
export function applyLocaleAbbreviations(text: string, targetLocale: LocaleFormatTargetLocale): string {
  return applyReplacements(text, analyzeAbbreviations(text, { sourceLocale: 'pt-BR', targetLocale }));
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

/** O original, cada subconjunto das mudanças e, para números ambíguos, cada leitura (índices relativos ao token). */
function renderingsFor(token: string, replacements: readonly Replacement[], ambiguities: readonly Ambiguity[]): string[] {
  const renderings = new Set<string>([token]);
  const subsets: Replacement[][] = [];
  if (replacements.length <= MAX_PARTIAL_CHANGES) {
    const total = 1 << replacements.length;
    for (let mask = 0; mask < total; mask += 1) subsets.push(replacements.filter((_, bit) => mask & (1 << bit)));
  } else {
    subsets.push([], [...replacements]);
  }
  const limited = ambiguities.slice(0, MAX_CONFIRMATIONS);
  for (const subset of subsets) {
    const base = applyReplacements(token, subset);
    const confirmations = limited.map(ambiguity => confirmationFor(ambiguity, subset));
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

/**
 * Todas as formas que um dado técnico de origem pode assumir no idioma de destino sem
 * mudar de valor: o original, cada subconjunto das mudanças (a pessoa pode ter aplicado
 * só parte) e, para números ambíguos, cada leitura possível. Analisa o token isolado; o
 * guardião da revisão usa `localeTokenRenderingsInContext`, que vê a frase inteira.
 */
export function localeTokenRenderings(token: string, targetLocale: LocaleFormatTargetLocale): readonly string[] {
  const analysis = analyze(token, { sourceLocale: 'pt-BR', targetLocale });
  return renderingsFor(token, analysis.replacements, analysis.ambiguities);
}

/**
 * Formas permitidas de cada dado técnico de `text`, calculadas a partir do CONTEXTO da frase:
 * só valem as mudanças e leituras que o formatador encontraria na frase inteira e que caem
 * dentro do dado. "Código 1.234-5" não ganha a leitura "1,234", porque na frase o número
 * está colado a um código.
 */
export function localeTokenRenderingsInContext(
  text: string,
  spans: readonly TechnicalTokenSpan[],
  targetLocale: LocaleFormatTargetLocale
): readonly (readonly string[])[] {
  const analysis = analyze(text, { sourceLocale: 'pt-BR', targetLocale });
  return spans.map(span => {
    const inside = (index: number, length: number) => index >= span.start && index + length <= span.end;
    return renderingsFor(
      span.value,
      analysis.replacements.filter(item => inside(item.index, item.from.length)).map(item => ({ ...item, index: item.index - span.start })),
      analysis.ambiguities.filter(item => inside(item.index, item.token.length)).map(item => ({ ...item, index: item.index - span.start }))
    );
  });
}

const MAX_MATCH_STEPS = 20_000;

function sameMultiset(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((token, index) => token === sortedRight[index]);
}

/**
 * Cada dado da tradução precisa ser uma forma permitida do dado da origem na MESMA posição
 * (ordem no texto). Se a tradução mudou a ordem dos dados, cada um ainda precisa casar com
 * uma forma de algum dado da origem. Em qualquer caso, duas formas iguais na tradução só
 * podem vir de dados iguais na origem: "1.500 mbar" e "1,500 mbar" nunca viram dois
 * "1.500 mbar", porque isso trocaria a leitura de um pelo outro.
 */
function equivalentByRenderings(
  sourceTokens: readonly string[],
  renderings: readonly ReadonlySet<string>[],
  translatedTokens: readonly string[]
): boolean {
  if (sourceTokens.length !== translatedTokens.length) return false;
  const consistent = (sourceOf: readonly number[]) => translatedTokens.every((token, index) =>
    translatedTokens.every((other, otherIndex) => otherIndex <= index || other !== token || sourceOf[otherIndex] < 0
      || sourceTokens[sourceOf[otherIndex]] === sourceTokens[sourceOf[index]]));
  const byPosition = translatedTokens.map((_, index) => index);
  if (translatedTokens.every((token, index) => renderings[index].has(token)) && consistent(byPosition)) return true;
  const sourceOf = new Array<number>(translatedTokens.length).fill(-1);
  let steps = 0;
  const match = (position: number): boolean => {
    if (position === sourceTokens.length) return true;
    for (let candidate = 0; candidate < translatedTokens.length; candidate += 1) {
      if (sourceOf[candidate] >= 0 || !renderings[position].has(translatedTokens[candidate])) continue;
      const clash = sourceOf.some((assigned, other) => assigned >= 0 && translatedTokens[other] === translatedTokens[candidate]
        && sourceTokens[assigned] !== sourceTokens[position]);
      if (clash) continue;
      if (++steps > MAX_MATCH_STEPS) return false;
      sourceOf[candidate] = position;
      if (match(position + 1)) return true;
      sourceOf[candidate] = -1;
    }
    return false;
  };
  return match(0);
}

/**
 * Compara os dados técnicos da origem com os da tradução. Sem `targetLocale`, só a igualdade
 * exata vale (em qualquer ordem). Com ele, cada dado da origem também pode aparecer em
 * qualquer forma de `localeTokenRenderings` (token isolado); qualquer outra diferença
 * (valor, unidade, código a mais ou a menos) continua sendo recusada.
 */
export function technicalTokensEquivalentForLocale(
  sourceTokens: readonly string[],
  translatedTokens: readonly string[],
  targetLocale?: LocaleFormatTargetLocale
): boolean {
  if (sameMultiset(sourceTokens, translatedTokens)) return true;
  if (!targetLocale) return false;
  const renderings = sourceTokens.map(token => new Set(localeTokenRenderings(token, targetLocale)));
  return equivalentByRenderings(sourceTokens, renderings, translatedTokens);
}

function equivalentInContext(
  text: string,
  spans: readonly TechnicalTokenSpan[],
  translatedTokens: readonly string[],
  targetLocale: LocaleFormatTargetLocale
): boolean {
  if (spans.length !== translatedTokens.length) return false;
  const renderings = localeTokenRenderingsInContext(text, spans, targetLocale).map(list => new Set(list));
  return equivalentByRenderings(spans.map(span => span.value), renderings, translatedTokens);
}

/**
 * Guardião dos dados técnicos entre o texto de origem e o texto revisado. Sem `targetLocale`,
 * só a igualdade exata vale. Com ele, as formas permitidas de cada dado vêm do contexto da
 * frase de origem (`localeTokenRenderingsInContext`), comparadas por posição. Quando uma
 * abreviação junta dois dados num só ("0,5 % do fundo de escala" → "0.5 % FS"), a origem é
 * comparada de novo depois de aplicar só as abreviações.
 */
export function technicalTextEquivalentForLocale(source: string, translated: string, targetLocale?: LocaleFormatTargetLocale): boolean {
  const translatedTokens = technicalTokenSpans(translated).map(span => span.value);
  const sourceSpans = technicalTokenSpans(source);
  if (sameMultiset(sourceSpans.map(span => span.value), translatedTokens)) return true;
  if (!targetLocale) return false;
  if (equivalentInContext(source, sourceSpans, translatedTokens, targetLocale)) return true;
  const abbreviated = applyLocaleAbbreviations(source, targetLocale);
  if (abbreviated === source) return false;
  const abbreviatedSpans = technicalTokenSpans(abbreviated);
  return sameMultiset(abbreviatedSpans.map(span => span.value), translatedTokens)
    || equivalentInContext(abbreviated, abbreviatedSpans, translatedTokens, targetLocale);
}
