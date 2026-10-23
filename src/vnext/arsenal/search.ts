import {
  ARSENAL_CATEGORIES,
  ARSENAL_CATEGORY_LABELS,
  ARSENAL_KIND_LABELS,
  isArsenalPayloadVersionSupported,
  normalizeArsenalSearchText,
  type ArsenalCategory,
  type ArsenalPresetKind,
  type ArsenalPresetSummary,
  type ArsenalScope,
} from './contracts';
import { arsenalSearchTermMatchesWord, arsenalSignificantTerms } from './search-text';

/**
 * Onda 4.5 — local search of the arsenal (ADR-arsenal). Runs on the list already in memory: typing never calls the
 * server. Accents, case and Portuguese plurals do not count, and the same matching rule as
 * `arsenalPresetMatchesQuery` decides what is found; this module only adds filters and the order.
 */

export interface ArsenalSearchFilters {
  readonly category?: ArsenalCategory;
  readonly kind?: ArsenalPresetKind;
  readonly scope?: ArsenalScope;
  /** Leave out presets saved by a newer app (payload version this app cannot insert). */
  readonly insertableOnly?: boolean;
}

/** Points per field where a query word was found: the name counts most, then tags, then everything else. */
const FIELD_WEIGHTS = Object.freeze({ name: 4, tags: 3, synonyms: 2, other: 1 });
/** Extra points when the whole query, as typed, is part of the name, a tag or a synonym ("pé de página"). */
const PHRASE_BONUS = Object.freeze({ name: 12, tags: 9, synonyms: 6 });

type SearchableSummary = Pick<
  ArsenalPresetSummary,
  'id' | 'name' | 'category' | 'kind' | 'tags' | 'synonyms' | 'useCount' | 'scope' | 'payloadSchemaVersion'
> & { readonly description?: string };

function wordsOf(...texts: readonly string[]): string[] {
  return texts
    .map(normalizeArsenalSearchText)
    .flatMap((text) => text.split(/[^a-z0-9]+/))
    .filter(Boolean);
}

/** Query words that must be found, normalized (small words like "de" only when nothing else was typed). */
export function arsenalQueryTerms(query: string): string[] {
  return arsenalSignificantTerms(wordsOf(query));
}

const phraseOf = (text: string) => wordsOf(text).join(' ');

/**
 * Relevance of one preset for the query: 0 when some significant word is not found anywhere (left out),
 * otherwise the sum of the best field of each word, plus a bonus when the whole query is part of the name, a tag
 * or a synonym.
 */
export function arsenalSearchScore(preset: SearchableSummary, query: string): number {
  const terms = arsenalQueryTerms(query);
  if (terms.length === 0) return 1;
  const fields: ReadonlyArray<readonly [number, readonly string[]]> = [
    [FIELD_WEIGHTS.name, wordsOf(preset.name)],
    [FIELD_WEIGHTS.tags, wordsOf(...preset.tags)],
    [FIELD_WEIGHTS.synonyms, wordsOf(...preset.synonyms)],
    [FIELD_WEIGHTS.other, wordsOf(
      preset.description ?? '',
      ARSENAL_CATEGORY_LABELS[preset.category],
      ARSENAL_KIND_LABELS[preset.kind],
    )],
  ];
  let score = 0;
  for (const term of terms) {
    let best = 0;
    for (const [weight, words] of fields) {
      if (weight > best && words.some((word) => arsenalSearchTermMatchesWord(term, word))) best = weight;
    }
    if (best === 0) return 0;
    score += best;
  }
  const phrase = phraseOf(query);
  if (phrase.includes(' ')) {
    const contains = (texts: readonly string[]) => texts.some((text) => ` ${phraseOf(text)} `.includes(` ${phrase} `));
    if (contains([preset.name])) score += PHRASE_BONUS.name;
    else if (contains(preset.tags)) score += PHRASE_BONUS.tags;
    else if (contains(preset.synonyms)) score += PHRASE_BONUS.synonyms;
  }
  return score;
}

function passesFilters(preset: SearchableSummary, filters: ArsenalSearchFilters): boolean {
  if (filters.category !== undefined && preset.category !== filters.category) return false;
  if (filters.kind !== undefined && preset.kind !== filters.kind) return false;
  if (filters.scope !== undefined && preset.scope !== filters.scope) return false;
  if (filters.insertableOnly && !isArsenalPayloadVersionSupported(preset)) return false;
  return true;
}

const categoryOrder = new Map(ARSENAL_CATEGORIES.map((category, index) => [category, index]));

/**
 * Presets that match every query word, best first: relevance, then most used, then the team's own before the
 * built-in models, then name (pt-BR) and id, so the same list always gives the same order. A blank query keeps
 * everything that passes the filters, ordered by category, use and name.
 */
export function searchArsenalPresets<T extends SearchableSummary>(
  presets: readonly T[],
  query: string,
  filters: ArsenalSearchFilters = {},
): T[] {
  const terms = arsenalQueryTerms(query);
  const scored = presets
    .filter((preset) => passesFilters(preset, filters))
    .map((preset) => ({ preset, score: arsenalSearchScore(preset, query) }))
    .filter((entry) => entry.score > 0);
  return scored
    .sort((a, b) =>
      (terms.length === 0
        ? (categoryOrder.get(a.preset.category) ?? 0) - (categoryOrder.get(b.preset.category) ?? 0)
        : b.score - a.score)
      || b.preset.useCount - a.preset.useCount
      || (a.preset.scope === b.preset.scope ? 0 : a.preset.scope === 'team' ? -1 : 1)
      || a.preset.name.localeCompare(b.preset.name, 'pt-BR')
      || (a.preset.id < b.preset.id ? -1 : a.preset.id > b.preset.id ? 1 : 0))
    .map((entry) => entry.preset);
}
