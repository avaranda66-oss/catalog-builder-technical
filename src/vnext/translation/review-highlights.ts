/**
 * FR-85/FR-87 · Destaques do texto original na revisão da tradução (módulo puro, sem DOM).
 *
 * Mostra para a pessoa, no próprio original, o que mantém o mesmo valor em qualquer idioma:
 * números, unidades, faixas, normas e códigos (os mesmos recortes do protetor de dados
 * técnicos) e as marcas/modelos do glossário PRESYS ("Kompressor", "MCS-XV").
 * Só divide o texto em pedaços: juntar os pedaços devolve o original byte a byte.
 */

import { technicalTokenSpans } from './technical-token-protector';
import { findKeepTerms } from './presys-glossary';

export interface SourceSegment {
  readonly text: string;
  /** `true` quando o pedaço mantém o valor na tradução (dado técnico, marca ou modelo). */
  readonly keep: boolean;
}

export function sourceHighlightSegments(text: string): readonly SourceSegment[] {
  const spans = [...technicalTokenSpans(text), ...findKeepTerms(text)]
    .sort((left, right) => left.start - right.start || right.end - left.end);
  const segments: SourceSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    // Um recorte dentro de outro (ex.: "25" dentro de "TA-25N") já está coberto.
    if (span.start < cursor) continue;
    if (span.start > cursor) segments.push({ text: text.slice(cursor, span.start), keep: false });
    segments.push({ text: text.slice(span.start, span.end), keep: true });
    cursor = span.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), keep: false });
  return segments;
}
