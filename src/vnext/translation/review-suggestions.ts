/**
 * FR-85/FR-87 · Sugestões de revisão por trecho (módulo puro, sem DOM).
 *
 * Junta, para um trecho da revisão de tradução, tudo o que a tela pode OFERECER à pessoa:
 * ajuste de números/abreviações, perguntas sobre números ambíguos, termos do glossário e
 * grafias erradas conhecidas. Cada item traz o texto resultante já pronto; a tela só mostra
 * o aviso e um botão. Nada aqui altera o texto sozinho.
 */

import type { VNextTranslationTargetLocale } from './language-registry';
import {
  applyGlossaryHint,
  applyKnownMisspelling,
  findGlossaryHints,
  findKnownMisspellings,
  type GlossaryHint,
  type KnownMisspelling,
} from './glossary';
import {
  applyNumberReading,
  formatTechnicalTextForLocale,
  type LocaleFormatConfirmation,
  type LocaleFormatConfirmationOption,
  type LocaleFormatResult,
} from './locale-number-format';

export interface NumberReadingQuestion {
  /** Número ambíguo como está no texto, ex.: "1.500". */
  readonly token: string;
  readonly options: readonly LocaleFormatConfirmationOption[];
  /** Texto resultante para cada leitura; igual ao original quando a leitura é "decimal". */
  readonly apply: (option: LocaleFormatConfirmationOption) => string;
}

export interface GlossarySuggestion {
  readonly hint: GlossaryHint;
  /** Texto com a troca feita, só quando ela é determinística (forma encontrada aparece uma vez). */
  readonly replacement?: string;
}

export interface SpellingSuggestion {
  readonly misspelling: KnownMisspelling;
  readonly replacement: string;
}

export interface ReviewSuggestions {
  readonly format: LocaleFormatResult;
  /** Resumo curto das mudanças de número/abreviação, ex.: "0,02 → 0.02 · % FE → % FS". */
  readonly numberSummary: string;
  readonly questions: readonly NumberReadingQuestion[];
  readonly glossary: readonly GlossarySuggestion[];
  readonly spelling: readonly SpellingSuggestion[];
  readonly total: number;
}

const SUMMARY_LIMIT = 3;

function summarize(result: LocaleFormatResult): string {
  const shown = result.changes.slice(0, SUMMARY_LIMIT).map(change => `${change.from} → ${change.to}`);
  const more = result.changes.length - shown.length;
  return more > 0 ? `${shown.join(' · ')} e mais ${more}` : shown.join(' · ');
}

function groupQuestions(text: string, confirmations: readonly LocaleFormatConfirmation[]): NumberReadingQuestion[] {
  const byToken = new Map<string, LocaleFormatConfirmation[]>();
  for (const confirmation of confirmations) {
    const group = byToken.get(confirmation.token) ?? [];
    group.push(confirmation);
    byToken.set(confirmation.token, group);
  }
  return [...byToken.entries()].map(([token, group]) => ({
    token,
    options: group[0].options,
    apply: option => applyNumberReading(text, group, option),
  }));
}

/**
 * Sugestões para um trecho. Devolve `undefined` quando a origem não é português (Brasil):
 * o módulo de números só conhece esse par. `keep` são os números que a pessoa já confirmou.
 */
export function reviewSuggestions(
  sourceText: string,
  translatedText: string,
  sourceLocale: string,
  targetLocale: VNextTranslationTargetLocale,
  keep: readonly string[] = []
): ReviewSuggestions | undefined {
  if (sourceLocale !== 'pt-BR') return undefined;
  const format = formatTechnicalTextForLocale(translatedText, { sourceLocale: 'pt-BR', targetLocale, keep });
  const questions = groupQuestions(translatedText, format.confirmations);
  const glossary = findGlossaryHints(sourceText, translatedText, targetLocale)
    .map(hint => ({ hint, replacement: applyGlossaryHint(translatedText, hint) }));
  const seen = new Set<string>();
  const spelling = targetLocale === 'en-US'
    ? findKnownMisspellings(translatedText)
      .filter(misspelling => {
        const key = misspelling.wrong.toLocaleLowerCase('en-US');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(misspelling => ({ misspelling, replacement: applyKnownMisspelling(translatedText, misspelling) }))
    : [];
  const total = (format.changes.length > 0 ? 1 : 0) + questions.length + glossary.length + spelling.length;
  return { format, numberSummary: summarize(format), questions, glossary, spelling, total };
}
