/**
 * Shared Brazilian-Portuguese decimal parsing for every numeric editor field.
 *
 * The father types "12,5" (pt-BR) as often as "12.5"; both mean twelve and a
 * half. A single separator is always the decimal mark. Thousands grouping is
 * accepted only when it is unambiguous ("1.234,5" or "1,234.5"). Anything else
 * is reported as invalid so the caller can keep the previous value and show a
 * plain message next to the field — it never becomes a pending, blocking draft.
 */

export type DecimalParseResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: 'EMPTY' | 'INVALID' };

const SIMPLE = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
const GROUPED_PT_BR = /^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d*)?$/;
const GROUPED_EN = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?$/;
const MINUS_SIGNS = /[−‒–]/g;

/** Parses "12,5", "12.5", " -3 ", ",5", "1.234,5" and an optional trailing "mm". */
export function parseDecimalPtBr(raw: string): DecimalParseResult {
  const text = raw
    .replace(MINUS_SIGNS, '-')
    .replace(/\s+/g, '')
    .replace(/mm$/i, '');
  if (text.length === 0) return { ok: false, reason: 'EMPTY' };
  let normalized: string;
  if (SIMPLE.test(text)) {
    normalized = text.replace(',', '.');
  } else if (GROUPED_PT_BR.test(text) && (text.includes(',') || (text.match(/\./g)?.length ?? 0) > 1)) {
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (GROUPED_EN.test(text) && (text.includes('.') || (text.match(/,/g)?.length ?? 0) > 1)) {
    normalized = text.replace(/,/g, '');
  } else {
    return { ok: false, reason: 'INVALID' };
  }
  if (normalized.endsWith('.')) normalized = normalized.slice(0, -1);
  if (normalized === '' || normalized === '+' || normalized === '-') return { ok: false, reason: 'INVALID' };
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, reason: 'INVALID' };
  return { ok: true, value: Object.is(value, -0) ? 0 : value };
}

/** Formats with a comma decimal mark and no trailing zeros: 88.5 → "88,5", 88 → "88". */
export function formatDecimalPtBr(value: number, maxFractionDigits = 4): string {
  if (!Number.isFinite(value)) return '';
  const fixed = value.toFixed(Math.max(0, Math.min(10, Math.trunc(maxFractionDigits))));
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  return (trimmed === '-0' ? '0' : trimmed).replace('.', ',');
}

/** Numeric (not textual) equality at a fixed number of fraction digits. */
export function sameDecimal(a: number, b: number, fractionDigits = 4): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = 10 ** Math.max(0, Math.min(10, Math.trunc(fractionDigits)));
  return Math.round(a * scale) === Math.round(b * scale);
}

/** True when a typed draft means exactly the canonical value ("88.0" and "88,0" match 88). */
export function decimalDraftMatches(raw: string, canonical: number, fractionDigits = 4): boolean {
  const parsed = parseDecimalPtBr(raw);
  return parsed.ok && sameDecimal(parsed.value, canonical, fractionDigits);
}
