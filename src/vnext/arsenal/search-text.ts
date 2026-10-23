/**
 * Onda 4.5 — word matching of the arsenal search (ADR-arsenal). A leaf module (no imports) so `contracts.ts` and the
 * service share one rule. Words arrive already normalized by `normalizeArsenalSearchText` (lower case, no accents).
 *
 * Portuguese plurals: "tabelas", "cabeçalhos", "opções", "imagens", "cores" find "tabela", "cabeçalho", "opção",
 * "imagem", "cor". The stem is a light singular form, not a dictionary: the same rule runs on the query and on the
 * preset words, and the comparison is by prefix, so a word typed halfway still matches.
 */

const MIN_STEM_LENGTH = 3;

/** Singular-ish form of one normalized word: "opcoes" → "opcao", "imagens" → "imagem", "capas" → "capa". */
export function arsenalSearchStem(word: string): string {
  if (word.length <= MIN_STEM_LENGTH) return word;
  const longEnough = word.length > MIN_STEM_LENGTH + 1;
  if (longEnough && (word.endsWith('oes') || word.endsWith('aes'))) return `${word.slice(0, -3)}ao`;
  if (longEnough && word.endsWith('ais')) return `${word.slice(0, -3)}al`;
  if (longEnough && word.endsWith('eis')) return `${word.slice(0, -3)}el`;
  if (longEnough && word.endsWith('uis')) return `${word.slice(0, -3)}ul`;
  if (longEnough && word.endsWith('ois')) return `${word.slice(0, -3)}ol`;
  if (word.endsWith('ns')) return `${word.slice(0, -2)}m`;
  if (longEnough && (word.endsWith('res') || word.endsWith('zes'))) return word.slice(0, -2);
  if (longEnough && word.endsWith('ses')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Small words that do not narrow a search ("pé de página", "tabela com notas"). */
export const ARSENAL_SEARCH_STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas',
  'ao', 'aos', 'com', 'para', 'pra', 'por', 'pelo', 'pela', 'que',
]);

/** The query words that must be found: all but the small words, unless the query has only small words. */
export function arsenalSignificantTerms(terms: readonly string[]): string[] {
  const significant = terms.filter((term) => !ARSENAL_SEARCH_STOPWORDS.has(term));
  return significant.length > 0 ? significant : [...terms];
}

/**
 * Whether a query term (normalized) matches a preset word (normalized): the word starts with the term, or the
 * singular of the word starts with the singular of the term.
 */
export function arsenalSearchTermMatchesWord(term: string, word: string): boolean {
  if (term.length === 0) return true;
  if (word.startsWith(term)) return true;
  return arsenalSearchStem(word).startsWith(arsenalSearchStem(term));
}
