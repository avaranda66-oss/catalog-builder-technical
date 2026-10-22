/**
 * Shows spreadsheet values the way Excel shows them to the person who typed
 * them (decimal places, thousands, quoted unit suffixes, percent), with the
 * catalog language's decimal separator. Pure: no DOM, no ExcelJS.
 *
 * Callers keep the raw value separately as provenance; this text is only the
 * display literal that goes into the catalog table.
 */

export interface DisplayLocale {
  readonly decimal: string;
  readonly group: string;
  readonly dateOrder: 'dmy' | 'mdy';
  readonly yes: string;
  readonly no: string;
}

export interface FormattedNumber {
  readonly text: string;
  /**
   * False when the format had parts this formatter does not reproduce (conditions, fractions,
   * engineering exponents, month names, partial dates): the cell is then marked for review.
   */
  readonly exact: boolean;
}

const BOOLEAN_WORDS: Record<string, readonly [string, string]> = {
  pt: ['Sim', 'Não'], es: ['Sí', 'No'], en: ['Yes', 'No'], fr: ['Oui', 'Non'], de: ['Ja', 'Nein'], it: ['Sì', 'No'],
};

export function displayLocale(locale = 'pt-BR'): DisplayLocale {
  let decimal = ',', group = '.', tag = 'pt-BR';
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    decimal = parts.find(part => part.type === 'decimal')?.value ?? ',';
    group = parts.find(part => part.type === 'group')?.value ?? (decimal === ',' ? '.' : ',');
    tag = locale;
  } catch { /* invalid tag: keep Brazilian Portuguese */ }
  const language = tag.toLowerCase().split('-')[0];
  const [yes, no] = BOOLEAN_WORDS[language] ?? BOOLEAN_WORDS.pt;
  return { decimal, group, dateOrder: /^en-us$/i.test(tag) ? 'mdy' : 'dmy', yes, no };
}

export function formatExcelBoolean(value: boolean, locale: DisplayLocale): string {
  return value ? locale.yes : locale.no;
}

/** Excel shows at most 15 significant digits; this also removes binary artifacts such as 0.30000000000000004. */
const excelPrecision = (value: number) => Number(value.toPrecision(15));

/** Rounds a non-negative number to `decimals` places as decimal text, without float drift (1.005 -> "1.01"). */
function fixed(value: number, decimals: number): string {
  const precise = excelPrecision(value);
  const [mantissa, exponent] = precise.toExponential().split('e');
  const digits = mantissa.replace('.', '');
  const shift = Number(exponent) + decimals - (digits.length - 1);
  let integer = BigInt(digits);
  if (shift >= 0) integer *= 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    const remainder = integer % divisor;
    integer /= divisor;
    if (remainder * 2n >= divisor) integer += 1n;
  }
  const text = integer.toString().padStart(decimals + 1, '0');
  return decimals ? `${text.slice(0, -decimals)}.${text.slice(-decimals)}` : text;
}

/**
 * Scientific notation. With `engineering`, the exponent is a multiple of `integerDigits`
 * ("##0.0E+0" shows 12345 as 12,3E+3), as Excel does when the mantissa has "#" placeholders.
 */
function scientific(value: number, decimals: number, minExponentDigits: number, showPlus: boolean, locale: DisplayLocale, integerDigits = 1, engineering = false) {
  if (value === 0) return `${fixed(0, decimals).replace('.', locale.decimal)}E${showPlus ? '+' : ''}${'0'.repeat(minExponentDigits)}`;
  const magnitude = Math.floor(Math.log10(value));
  const step = engineering ? integerDigits : 1;
  let exponent = engineering ? Math.floor(magnitude / step) * step : magnitude - (integerDigits - 1);
  let mantissa = fixed(value / 10 ** exponent, decimals);
  if (Number(mantissa) >= 10 ** integerDigits) { exponent += step; mantissa = fixed(value / 10 ** exponent, decimals); }
  const sign = exponent < 0 ? '-' : showPlus ? '+' : '';
  return `${mantissa.replace('.', locale.decimal)}E${sign}${String(Math.abs(exponent)).padStart(minExponentDigits, '0')}`;
}

/** Excel "General": up to 11 digits, no thousands separator, scientific for very large or tiny values. */
export function formatGeneralNumber(value: number, locale: DisplayLocale): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const sign = value < 0 ? '-' : '';
  const absolute = excelPrecision(Math.abs(value));
  if (absolute >= 1e11 || absolute < 1e-9) return sign + scientific(absolute, 5, 2, true, locale).replace(new RegExp(`\\${locale.decimal}?0+E`), 'E');
  const integerDigits = absolute < 1 ? 1 : Math.floor(Math.log10(absolute)) + 1;
  let text = fixed(absolute, Math.max(0, 11 - integerDigits));
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return text === '0' ? '0' : sign + text.replace('.', locale.decimal);
}

type Token =
  | { kind: 'literal'; value: string }
  | { kind: 'digit'; value: '0' | '#' | '?' }
  | { kind: 'point' } | { kind: 'comma' } | { kind: 'percent' }
  | { kind: 'exponent'; plus: boolean }
  | { kind: 'date' } | { kind: 'text' } | { kind: 'general' } | { kind: 'unsupported' };

function splitSections(format: string): string[] {
  const sections: string[] = []; let current = '', quoted = false, bracket = false;
  for (let index = 0; index < format.length; index++) {
    const char = format[index];
    if (char === '\\' && !quoted) { current += char + (format[index + 1] ?? ''); index++; continue; }
    if (char === '"' && !bracket) quoted = !quoted;
    else if (char === '[' && !quoted) bracket = true;
    else if (char === ']' && !quoted) bracket = false;
    if (char === ';' && !quoted && !bracket) { sections.push(current); current = ''; continue; }
    current += char;
  }
  sections.push(current);
  return sections;
}

function tokenize(section: string): Token[] {
  const tokens: Token[] = [];
  for (let index = 0; index < section.length; index++) {
    const char = section[index];
    const rest = section.slice(index);
    if (char === '"') {
      const end = section.indexOf('"', index + 1);
      tokens.push({ kind: 'literal', value: section.slice(index + 1, end < 0 ? undefined : end) });
      index = end < 0 ? section.length : end;
    } else if (char === '\\') { tokens.push({ kind: 'literal', value: section[index + 1] ?? '' }); index++; }
    // "_)" only reserves room to align columns in Excel: no character in the catalog text.
    else if (char === '_') index++;
    else if (char === '*') index++;
    else if (char === '[') {
      const end = section.indexOf(']', index);
      const content = section.slice(index + 1, end < 0 ? undefined : end);
      index = end < 0 ? section.length : end;
      if (content.startsWith('$')) tokens.push({ kind: 'literal', value: content.slice(1).split('-')[0] });
      else if (/^[<>=]/.test(content)) tokens.push({ kind: 'unsupported' });
      else if (/^(h+|m+|s+)$/i.test(content)) tokens.push({ kind: 'date' });
      // colours such as [Red] or [Color10] do not change the text
    } else if (char === '0' || char === '#' || char === '?') tokens.push({ kind: 'digit', value: char });
    else if (char === '.') tokens.push({ kind: 'point' });
    else if (char === ',') tokens.push({ kind: 'comma' });
    else if (char === '%') tokens.push({ kind: 'percent' });
    else if ((char === 'E' || char === 'e') && (section[index + 1] === '+' || section[index + 1] === '-')) {
      tokens.push({ kind: 'exponent', plus: section[index + 1] === '+' }); index++;
    } else if (/^general/i.test(rest)) { tokens.push({ kind: 'general' }); index += 6; }
    else if (/^(am\/pm|a\/p)/i.test(rest)) { tokens.push({ kind: 'date' }); index += rest[1] === '/' ? 2 : 4; }
    else if (/[ymdhs]/i.test(char)) tokens.push({ kind: 'date' });
    else if (char === '@') tokens.push({ kind: 'text' });
    else if (char === '/') tokens.push({ kind: 'unsupported' });
    else tokens.push({ kind: 'literal', value: char });
  }
  return tokens;
}

export function isDateFormat(format: string | undefined): boolean {
  if (!format) return false;
  return splitSections(format).some(section => tokenize(section).some(token => token.kind === 'date'));
}

function placeInteger(digits: string, placeholders: readonly ('0' | '#' | '?' | string)[]): string {
  // Fill from the right; extra leading digits stay in front of the first placeholder (Excel behaviour).
  const count = placeholders.filter(value => value === '0' || value === '#' || value === '?').length;
  let remaining = digits === '0' ? '' : digits;
  const output: string[] = [];
  let seen = 0;
  for (let index = placeholders.length - 1; index >= 0; index--) {
    const placeholder = placeholders[index];
    if (placeholder !== '0' && placeholder !== '#' && placeholder !== '?') { output.unshift(placeholder); continue; }
    seen++;
    if (seen === count && remaining.length > 1) { output.unshift(remaining); remaining = ''; continue; }
    const digit = remaining.slice(-1); remaining = remaining.slice(0, -1);
    // "?" pads with a space only to align columns in Excel: nothing in the catalog text.
    output.unshift(digit || (placeholder === '0' ? '0' : ''));
  }
  return output.join('');
}

function groupThousands(integer: string, separator: string) {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

function formatNumberSection(value: number, tokens: Token[], locale: DisplayLocale, negativeSign: boolean): FormattedNumber {
  let exact = !tokens.some(token => token.kind === 'unsupported');
  const first = tokens.findIndex(token => token.kind === 'digit');
  if (first < 0) {
    // Only literals (or "@"): Excel shows the literal text, or General when "@" asks for the value.
    const text = tokens.map(token => token.kind === 'literal' ? token.value : token.kind === 'percent' ? '%'
      : token.kind === 'text' || token.kind === 'general' ? formatGeneralNumber(value, locale) : '').join('');
    return { text: ((negativeSign && value !== 0 ? '-' : '') + text).trim(), exact };
  }
  let last = first;
  tokens.forEach((token, index) => { if (token.kind === 'digit') last = index; });
  // A point, exponent or thousands comma between placeholders belongs to the number.
  const region = tokens.slice(first, last + 1);
  const prefix = tokens.slice(0, first);
  let suffix = tokens.slice(last + 1);
  let scale = 0;
  while (suffix[0]?.kind === 'comma') { scale++; suffix = suffix.slice(1); }
  const percents = tokens.filter(token => token.kind === 'percent').length;
  let scaled = Math.abs(value) * 100 ** percents / 1000 ** scale;
  const exponentIndex = region.findIndex(token => token.kind === 'exponent');
  const mantissaTokens = exponentIndex < 0 ? region : region.slice(0, exponentIndex);
  const pointIndex = mantissaTokens.findIndex(token => token.kind === 'point');
  const integerTokens = pointIndex < 0 ? mantissaTokens : mantissaTokens.slice(0, pointIndex);
  const fractionTokens = pointIndex < 0 ? [] : mantissaTokens.slice(pointIndex + 1);
  const grouping = integerTokens.some(token => token.kind === 'comma');
  const integerPlaces = integerTokens.flatMap(token => token.kind === 'digit' ? [token.value] : token.kind === 'literal' ? [token.value] : []);
  const fractionPlaces = fractionTokens.flatMap(token => token.kind === 'digit' ? [token.value] : []);
  if (fractionTokens.some(token => token.kind === 'literal' || token.kind === 'point')) exact = false;
  let number: string;
  if (exponentIndex >= 0) {
    const exponentToken = region[exponentIndex] as { kind: 'exponent'; plus: boolean };
    const exponentDigits = region.slice(exponentIndex + 1).filter(token => token.kind === 'digit').length;
    const mantissaDigits = integerPlaces.filter(place => place === '0' || place === '#' || place === '?');
    // "##0.0E+0" (engineering): reproduced by Excel's rule, but not checked against Excel itself.
    const engineering = mantissaDigits.length > 1 && mantissaDigits.some(place => place !== '0');
    if (engineering) exact = false;
    number = scientific(scaled, fractionPlaces.length, Math.max(1, exponentDigits), exponentToken.plus, locale,
      Math.max(1, mantissaDigits.length), engineering);
    if (fractionPlaces.length === 0 && pointIndex >= 0) number = number.replace('E', `${locale.decimal}E`);
  } else {
    scaled = excelPrecision(scaled);
    const text = fixed(scaled, fractionPlaces.length);
    const [integerDigits, fractionDigits = ''] = text.split('.');
    const fraction = fractionDigits.split('');
    for (let index = fraction.length - 1; index >= 0; index--) {
      if (fraction[index] !== '0' || fractionPlaces[index] === '0') break;
      fraction[index] = ''; // "#" drops the digit; "?" only aligns columns in Excel
    }
    let integer: string;
    if (grouping && !integerPlaces.some(place => place !== '0' && place !== '#' && place !== '?')) {
      const minimum = integerPlaces.length - integerPlaces.indexOf('0');
      const padded = integerPlaces.includes('0') ? integerDigits.padStart(minimum, '0') : integerDigits === '0' ? '' : integerDigits;
      integer = groupThousands(padded, locale.group);
    } else integer = placeInteger(integerDigits, integerPlaces);
    number = integer + (pointIndex >= 0 ? locale.decimal + fraction.join('') : '');
  }
  const render = (part: Token[]) => part.map(token => token.kind === 'literal' ? token.value : token.kind === 'percent' ? '%' : '').join('');
  const isZero = !/[1-9]/.test(number.split('E')[0]);
  const sign = negativeSign && value < 0 && !isZero ? '-' : '';
  // Leading or trailing spaces only align columns in Excel; the catalog text is the literal alone.
  return { text: (sign + render(prefix) + number + render(suffix)).trim(), exact };
}

/**
 * Formats a number with an Excel number format code. Date formats are not handled here
 * (ExcelJS already returns Date objects for them); use {@link formatExcelDate}.
 */
export function formatExcelNumber(value: number, format: string | undefined, locale: DisplayLocale): FormattedNumber {
  if (!Number.isFinite(value)) return { text: String(value), exact: false };
  if (!format || /^general$/i.test(format.trim())) return { text: formatGeneralNumber(value, locale), exact: true };
  if (isDateFormat(format)) return formatExcelDateValue(excelSerialToDate(value), format, locale);
  const sections = splitSections(format).map(tokenize);
  if (sections.some(tokens => tokens.some(token => token.kind === 'unsupported'))) {
    return { text: formatGeneralNumber(value, locale), exact: false };
  }
  if (sections.length === 1 || (value > 0) || (value === 0 && sections.length < 3)) {
    const result = formatNumberSection(value, sections[0], locale, sections.length === 1 || value >= 0);
    return result;
  }
  if (value < 0) return formatNumberSection(value, sections[1], locale, false);
  return formatNumberSection(value, sections[2], locale, false);
}

const serialBase = (date1904: boolean) => date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);

export function excelSerialToDate(serial: number, date1904 = false): Date {
  return new Date(serialBase(date1904) + Math.round(serial * 86_400_000));
}

/** The Excel serial number (days) behind a Date that ExcelJS made from a date-formatted cell. */
export function excelSerialFromDate(value: Date, date1904 = false): number {
  return (value.getTime() - serialBase(date1904)) / 86_400_000;
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');
/** A date format without its quoted text, escaped characters and "_x"/"*x" padding. */
const visibleDatePart = (section: string) => section.replace(/"[^"]*"|\\.|_.|\*./g, '');

/**
 * Durations such as "[h]:mm" (1,5 day shows 36:00), "[mm]:ss" and "[ss]": the bracketed unit counts
 * the whole duration instead of the time of day.
 */
function formatElapsed(serial: number, section: string): FormattedNumber {
  let exact = serial >= 0;
  // Excel rounds to the second, then cuts the units it does not show.
  const total = Math.round(Math.abs(serial) * 86_400);
  const divisor = { h: 3600, m: 60, s: 1 } as const;
  let text = '', largest: keyof typeof divisor | undefined;
  for (let index = 0; index < section.length; index++) {
    const char = section[index], lower = char.toLowerCase();
    if (char === '"') {
      const end = section.indexOf('"', index + 1);
      text += section.slice(index + 1, end < 0 ? undefined : end);
      index = end < 0 ? section.length : end;
    } else if (char === '\\') { text += section[index + 1] ?? ''; index++; }
    else if (char === '_' || char === '*') index++;
    else if (char === '[') {
      const end = section.indexOf(']', index);
      const content = section.slice(index + 1, end < 0 ? undefined : end).toLowerCase();
      index = end < 0 ? section.length : end;
      if (/^(h+|m+|s+)$/.test(content)) {
        largest = content[0] as keyof typeof divisor;
        text += pad(Math.floor(total / divisor[largest]), content.length);
      } // colours and language codes add no text
    } else if (lower === 'h' || lower === 'm' || lower === 's') {
      let end = index;
      while (section[end + 1]?.toLowerCase() === lower) end++;
      const width = end - index + 1;
      index = end;
      if (lower === 'm' && largest === 'h') text += pad(Math.floor(total / 60) % 60, width);
      else if (lower === 's' && (largest === 'h' || largest === 'm')) text += pad(total % 60, width);
      else exact = false;
    } else if (/^(am\/pm|a\/p)/i.test(section.slice(index))) { exact = false; index += /^am/i.test(section.slice(index)) ? 4 : 2; }
    else if (/[dy0#?.]/i.test(char)) exact = false; // days, years or tenths of a second in a duration
    else text += char;
  }
  return { text: (serial < 0 ? '-' : '') + text.trim(), exact };
}

/**
 * Dates as dd/mm/aaaa (mm/dd/yyyy for en-US), plus the time when the format shows it.
 * `exact` is false when Excel shows something else: a duration it cannot reproduce, month
 * names without a day ("mmm-yy" shows 10/2026 here, "out-26" in Excel), or 12-hour AM/PM.
 */
export function formatExcelDateValue(value: Date, format: string | undefined, locale: DisplayLocale, date1904 = false): FormattedNumber {
  if (Number.isNaN(value.getTime())) return { text: '', exact: false };
  const section = format ? splitSections(format)[0] : '';
  if (/\[(h+|m+|s+)\]/i.test(section)) return formatElapsed(excelSerialFromDate(value, date1904), section);
  const runs = visibleDatePart(section).replace(/\[[^\]]*\]/g, '').match(/am\/pm|a\/p|y+|m+|d+|h+|s+/gi) ?? [];
  let day = false, weekday = false, month = false, year = false, fullYear = false, hours = 0, minutes = false, seconds = false, twelveHour = false;
  runs.forEach((run, index) => {
    const unit = run[0].toLowerCase();
    if (unit === 'a') twelveHour = true;
    else if (unit === 'y') { year = true; fullYear ||= run.length > 2; }
    else if (unit === 'd') { if (run.length <= 2) day = true; else weekday = true; } // "ddd"/"dddd": weekday names
    else if (unit === 'h') hours = Math.max(hours, run.length);
    else if (unit === 's') seconds = true;
    else {
      // "m" next to hours or seconds is minutes; otherwise it is the month.
      const before = runs[index - 1]?.[0].toLowerCase(), after = runs[index + 1]?.[0].toLowerCase();
      if (run.length <= 2 && (before === 'h' || after === 's')) minutes = true; else month = true;
    }
  });
  const dd = pad(value.getUTCDate()), mm = pad(value.getUTCMonth() + 1), yyyy = String(value.getUTCFullYear());
  const fullDate = locale.dateOrder === 'mdy' ? `${mm}/${dd}/${yyyy}` : `${dd}/${mm}/${yyyy}`;
  const time = [hours && pad(value.getUTCHours(), hours), minutes && pad(value.getUTCMinutes()), seconds && pad(value.getUTCSeconds())]
    .filter(Boolean).join(':');
  let date: string | undefined = fullDate, exact = !twelveHour;
  if (!day && !month && !year) {
    date = time ? undefined : fullDate;
    if (weekday) exact = false; // "dddd" alone shows the weekday name in Excel
  } else if (!(day && month && year)) {
    // Only some parts are shown in Excel (out/2026, 14/10, 2026): keep the same parts, as numbers.
    const parts = locale.dateOrder === 'mdy' ? [month && mm, day && dd, year && yyyy] : [day && dd, month && mm, year && yyyy];
    date = parts.filter(Boolean).join('/');
    exact &&= year && !day && !month && fullYear;
  }
  const text = date && time ? `${date} ${time}` : date ?? time;
  return { text, exact };
}

/** dd/mm/aaaa (or mm/dd/yyyy for en-US), plus hh:mm when the Excel format shows time. */
export function formatExcelDate(value: Date, format: string | undefined, locale: DisplayLocale): string {
  return formatExcelDateValue(value, format, locale).text;
}

/** Number formats that show money: "R$", "US$", "$", "€", "£", "¥" or a currency code such as [$€-2]. */
export function isCurrencyFormat(format: string | undefined): boolean {
  if (!format) return false;
  const section = splitSections(format)[0];
  if (/\[\$[^\]-]+/.test(section)) return true; // [$-416] is only a language code
  return /[$€£¥]/.test(section.replace(/\[[^\]]*\]/g, ''));
}
