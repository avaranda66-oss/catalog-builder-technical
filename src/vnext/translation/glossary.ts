/**
 * FR-87 · Glossário fixo PT/EN/ES da PRESYS e grafias erradas conhecidas dos folders em inglês.
 *
 * Grafias conferidas nos folders reais (TA-25N/35N/50N, PCON-Y17, PCON-Y18 LP, Kompressor Y18):
 * "Order Code", "Standard Delivery", "Operating Range", "Technical Specifications",
 * "Stabilization Time", "Uniformity", "Dry Block", "Power Supply", "Ambient Temperature".
 * Erros encontrados nesses mesmos folders: "Acuracy", "secundary", "availables", "pression".
 *
 * Tudo aqui é SUGESTÃO para a revisão: o módulo aponta o termo esperado e, quando a troca é
 * determinística (o termo usado aparece uma única vez), a tela oferece um botão. Nada é
 * aplicado sem a pessoa clicar.
 */

import type { LocaleFormatTargetLocale } from './locale-number-format';
import {
  PRESYS_GLOSSARY_TERMS, PRESYS_KNOWN_MISSPELLINGS, escapeGlossaryRegExp, glossaryTermPattern, normalizeGlossaryText,
  type PresysGlossaryTerm,
} from './presys-glossary';

export type GlossaryLocale = 'pt-BR' | LocaleFormatTargetLocale;

export type GlossaryTerm = PresysGlossaryTerm;

export interface GlossaryHint {
  readonly sourceTerm: string;
  readonly expected: string;
  /** Forma encontrada na tradução no lugar do termo esperado, quando reconhecida. */
  readonly found?: string;
}

export interface KnownMisspelling {
  /** Grafia errada exatamente como aparece no texto. */
  readonly wrong: string;
  /** Grafia certa, com a mesma caixa da palavra encontrada. */
  readonly right: string;
  readonly index: number;
}

// Fonte única dos termos, marcas e grafias: `presys-glossary.ts` (versionado e usado também pelo servidor).
const TERMS: readonly GlossaryTerm[] = PRESYS_GLOSSARY_TERMS;
const MISSPELLINGS: readonly (readonly [string, string])[] = PRESYS_KNOWN_MISSPELLINGS;

export function glossaryTerms(): readonly GlossaryTerm[] {
  return TERMS;
}

export function knownMisspellings(): readonly (readonly [string, string])[] {
  return MISSPELLINGS;
}

export { normalizeGlossaryText };
const escapeRegExp = escapeGlossaryRegExp;
const termPattern = glossaryTermPattern;

interface CompiledTerm {
  readonly term: GlossaryTerm;
  readonly source: RegExp;
  readonly expected: Readonly<Record<LocaleFormatTargetLocale, RegExp>>;
  readonly alternates: Readonly<Record<LocaleFormatTargetLocale, readonly { readonly form: string; readonly pattern: RegExp }[]>>;
}

/** Expressões compiladas uma vez por módulo: a revisão recalcula as dicas a cada tecla. */
const COMPILED_TERMS: readonly CompiledTerm[] = TERMS.map(term => ({
  term,
  source: termPattern(term['pt-BR']),
  expected: { 'en-US': termPattern(term['en-US']), 'es-ES': termPattern(term['es-ES']) },
  alternates: {
    'en-US': (term.alternates?.['en-US'] ?? []).map(form => ({ form, pattern: termPattern(form) })),
    'es-ES': (term.alternates?.['es-ES'] ?? []).map(form => ({ form, pattern: termPattern(form) })),
  },
}));

const wholeWord = (word: string, flags: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, flags);

const COMPILED_MISSPELLINGS: readonly { readonly wrong: string; readonly right: string; readonly pattern: RegExp }[] =
  MISSPELLINGS.map(([wrong, right]) => ({ wrong, right, pattern: wholeWord(wrong, 'giu') }));

/**
 * Para cada termo do glossário presente no original cuja forma esperada NÃO aparece na
 * tradução, devolve o termo de origem, o esperado e (quando reconhecida) a forma usada.
 */
export function findGlossaryHints(sourceText: string, translatedText: string, targetLocale: LocaleFormatTargetLocale): GlossaryHint[] {
  const source = normalizeGlossaryText(sourceText);
  const translated = normalizeGlossaryText(translatedText);
  const hints: GlossaryHint[] = [];
  for (const compiled of COMPILED_TERMS) {
    if (!compiled.source.test(source)) continue;
    const expected = compiled.term[targetLocale];
    if (compiled.expected[targetLocale].test(translated)) continue;
    const found = compiled.alternates[targetLocale].find(alternate => alternate.pattern.test(translated))?.form;
    hints.push(found ? { sourceTerm: compiled.term['pt-BR'], expected, found: findOriginalSpelling(translatedText, found) ?? found }
      : { sourceTerm: compiled.term['pt-BR'], expected });
  }
  return hints;
}

/** Devolve como a forma aparece no texto traduzido (caixa e acentos originais). */
function findOriginalSpelling(text: string, normalizedTerm: string): string | undefined {
  const words = normalizeGlossaryText(normalizedTerm).split(' ');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${words.map(word => {
    const letters = [...word].map(letter => `${escapeRegExp(letter)}[\\u0300-\\u036f]*`).join('');
    return `${letters}s?`;
  }).join('\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
  const match = pattern.exec(text.normalize('NFD'));
  return match ? match[0].normalize('NFC') : undefined;
}

/**
 * Troca determinística de uma dica do glossário: só quando a forma encontrada aparece uma
 * única vez. Preserva a caixa da ocorrência (minúsculas, Inicial Maiúscula ou MAIÚSCULAS).
 */
export function applyGlossaryHint(text: string, hint: GlossaryHint): string | undefined {
  if (!hint.found) return undefined;
  const matches = [...text.matchAll(wholeWord(hint.found, 'giu'))];
  if (matches.length !== 1) return undefined;
  const [match] = matches;
  const index = match.index ?? 0;
  return text.slice(0, index) + matchCase(match[0], hint.expected) + text.slice(index + match[0].length);
}

/** Termo do glossário (Inicial Maiúscula) na caixa da ocorrência: minúsculas, MAIÚSCULAS ou como está no glossário. */
export function matchCase(sample: string, replacement: string): string {
  const letters = sample.replace(/[^\p{L}]/gu, '');
  if (letters && letters === letters.toLocaleUpperCase('en-US')) return replacement.toLocaleUpperCase('en-US');
  if (letters && letters === letters.toLocaleLowerCase('en-US')) return replacement.toLocaleLowerCase('en-US');
  return replacement;
}

/** Palavra em minúsculas na caixa da ocorrência: minúsculas, Inicial Maiúscula ou MAIÚSCULAS. */
function capitalizeLike(sample: string, lower: string): string {
  const letters = sample.replace(/[^\p{L}]/gu, '');
  if (letters && letters === letters.toLocaleUpperCase('en-US')) return lower.toLocaleUpperCase('en-US');
  if (letters && letters.charAt(0) === letters.charAt(0).toLocaleUpperCase('en-US')) return lower.charAt(0).toLocaleUpperCase('en-US') + lower.slice(1);
  return lower;
}

/** Erros de grafia conhecidos (inglês) presentes no texto, com a correção na mesma caixa. */
export function findKnownMisspellings(text: string): KnownMisspelling[] {
  const results: KnownMisspelling[] = [];
  for (const { pattern, right } of COMPILED_MISSPELLINGS) {
    for (const match of text.matchAll(pattern)) {
      results.push({ wrong: match[0], right: capitalizeLike(match[0], right), index: match.index ?? 0 });
    }
  }
  return results.sort((left, right) => left.index - right.index);
}

/** Corrige todas as ocorrências da mesma grafia errada, cada uma na sua caixa. */
export function applyKnownMisspelling(text: string, misspelling: KnownMisspelling): string {
  const right = misspelling.right.toLocaleLowerCase('en-US');
  return text.replace(wholeWord(misspelling.wrong, 'giu'), found => capitalizeLike(found, right));
}
