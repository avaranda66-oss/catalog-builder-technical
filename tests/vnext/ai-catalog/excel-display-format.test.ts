import { describe, expect, it } from 'vitest';
import {
  displayLocale, formatExcelBoolean, formatExcelDate, formatExcelNumber, formatGeneralNumber, isDateFormat,
} from '../../../src/vnext/ai-catalog/excel-display-format';

const pt = displayLocale('pt-BR');
const en = displayLocale('en-US');
const show = (value: number, format: string, locale = pt) => formatExcelNumber(value, format, locale).text;

describe('Excel display formatting (what the father sees in Excel)', () => {
  it('shows General numbers without float artifacts and with the Brazilian decimal comma', () => {
    expect(formatGeneralNumber(0.30000000000000004, pt)).toBe('0,3');
    expect(formatGeneralNumber(1234.5, pt)).toBe('1234,5');
    expect(formatGeneralNumber(1 / 3, pt)).toBe('0,3333333333');
    expect(formatGeneralNumber(-5, pt)).toBe('-5');
    expect(formatGeneralNumber(123456789012, pt)).toBe('1,23457E+11');
    expect(formatExcelNumber(0.1 + 0.2, 'General', en).text).toBe('0.3');
  });

  it('keeps decimal places, percent, thousands and quoted unit suffixes', () => {
    expect(show(0.01, '0.000')).toBe('0,010');
    expect(show(0.0005, '0.00%')).toBe('0,05%');
    expect(show(1234.5, '#,##0.00')).toBe('1.234,50');
    expect(show(1234.5, '#,##0.00', en)).toBe('1,234.50');
    expect(show(0.025, '0.000 "%FS"')).toBe('0,025 %FS');
    expect(show(5500, '"$"#,##0')).toBe('$5.500');
    expect(show(5000, '[$€]#,##0')).toBe('€5.000');
    expect(show(1.005, '0.00')).toBe('1,01');
    expect(show(42, '00000')).toBe('00042');
    expect(show(1234567, '#,##0,')).toBe('1.235');
    expect(show(12345, '0.00E+00')).toBe('1,23E+04');
  });

  it('drops optional decimals like Excel and uses the negative section', () => {
    expect(show(1.5, '0.0#')).toBe('1,5');
    expect(show(1, '0.0#')).toBe('1,0');
    expect(show(-1234, '#,##0;(#,##0)')).toBe('(1.234)');
    expect(show(-1234, '#,##0')).toBe('-1.234');
    expect(show(-0.4, '0')).toBe('0');
  });

  it('marks formats it cannot reproduce instead of guessing silently', () => {
    expect(formatExcelNumber(150, '[>100]0;0', pt)).toEqual({ text: '150', exact: false });
    expect(formatExcelNumber(0.5, '# ?/?', pt).exact).toBe(false);
  });

  it('shows dates as dd/mm/aaaa (time only when the format has it) and booleans as Sim/Não', () => {
    const date = new Date(Date.UTC(2026, 9, 14, 14, 20, 7));
    expect(formatExcelDate(date, 'mm-dd-yy', pt)).toBe('14/10/2026');
    expect(formatExcelDate(date, 'm/d/yyyy h:mm:ss', pt)).toBe('14/10/2026 14:20:07');
    expect(formatExcelDate(date, 'mm-dd-yy', en)).toBe('10/14/2026');
    expect(isDateFormat('dd/mm/yyyy')).toBe(true);
    expect(isDateFormat('0.000 "%FS"')).toBe(false);
    expect(formatExcelNumber(46309, 'dd/mm/yyyy', pt).text).toBe('14/10/2026');
    expect(formatExcelBoolean(true, pt)).toBe('Sim');
    expect(formatExcelBoolean(false, pt)).toBe('Não');
    expect(formatExcelBoolean(true, en)).toBe('Yes');
  });

  it('falls back to Brazilian Portuguese for an invalid language tag', () => {
    expect(displayLocale('not a locale!!')).toMatchObject({ decimal: ',', group: '.', yes: 'Sim', no: 'Não' });
  });
});
