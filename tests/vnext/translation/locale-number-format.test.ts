import { describe, expect, it } from 'vitest';
import {
  applyNumberReading,
  formatTechnicalTextForLocale,
  integerWordsPtBr,
  localeTokenRenderings,
  technicalTokensEquivalentForLocale,
} from '@/vnext/translation/locale-number-format';
import { protectTechnicalTokens } from '@/vnext/translation/technical-token-protector';
import { requireReviewText } from '@/vnext/translation/candidate';

const en = (text: string, keep?: readonly string[]) => formatTechnicalTextForLocale(text, { sourceLocale: 'pt-BR', targetLocale: 'en-US', keep });
const es = (text: string) => formatTechnicalTextForLocale(text, { sourceLocale: 'pt-BR', targetLocale: 'es-ES' });

describe('FR-85 locale-number-format · pt-BR → en-US', () => {
  it.each([
    ['Exatidão: ±0,02 % FE', 'Exatidão: ±0.02 % FS'],
    ['0,01 % da leitura + 0,005 % FE', '0.01 % RDG + 0.005 % FS'],
    ['0,01 % leitura', '0.01 % RDG'],
    ['0,01 % da leit.', '0.01 % RDG'],
    ['0.1 % of reading', '0.1 % RDG'],
    ['0.1 % of the reading', '0.1 % RDG'],
    ['±(0,1 °C + 0,1 % da leitura)', '±(0.1 °C + 0.1 % RDG)'],
    ['Estabilidade: ±0,02 °C', 'Estabilidade: ±0.02 °C'],
    ['±0,1 °C', '±0.1 °C'],
    ['1,5 kg', '1.5 kg'],
    ['Peso: 12,5 kg; 0,5-1,0 bar', 'Peso: 12.5 kg; 0.5-1.0 bar'],
    ['1.500,5 Pa', '1,500.5 Pa'],
    ['1.000.000 Pa', '1,000,000 Pa'],
    ['R$ 1.234.567,89', 'R$ 1,234,567.89'],
    ['0,02 % F.E.', '0.02 % F.S.'],
    ['0,02 %FE', '0.02 %FS'],
    ['0,5 % do fundo de escala', '0.5 % FS'],
    ['0.5 % of full scale', '0.5 % FS'],
  ])('converts %j → %j', (input, expected) => {
    const result = en(input);
    expect(result.text).toBe(expected);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.confirmations).toEqual([]);
  });

  it.each([
    '-25 a 140 °C',
    '4–20 mA',
    '−20–+80 °C',
    'ISO 9001',
    'ISO/IEC 17025 e IEC 61010-1',
    'TA-25N',
    'PCON-Y18',
    '06.04.0121-00/IN1P',
    '06.04.0121-00',
    'RS-485',
    '15/10/2026',
    '10:30',
    'Versão 2.1.3',
    '192.168.0.1',
    '0.05 % FS',
    '±0.05 % FS e RS-485.',
    '0.02 % FS',
    '0.1 % RDG',
    '0.500 mm',
    '70 bar',
    '1/2" NPT',
    '100 Ω',
    '(k = 2)',
  ])('keeps %j unchanged (codes, standards, integers, dates, already-English numbers)', input => {
    const result = en(input);
    expect(result.text).toBe(input);
    expect(result.changes).toEqual([]);
    expect(result.confirmations).toEqual([]);
  });

  it('labels each change with its kind and position in the input', () => {
    const result = en('Exatidão: ±0,02 % FE em 1.500,5 Pa');
    expect(result.changes).toEqual([
      { from: '0,02', to: '0.02', kind: 'decimal', index: 11 },
      { from: '% FE', to: '% FS', kind: 'abbreviation', index: 16 },
      { from: '1.500,5', to: '1,500.5', kind: 'thousands', index: 24 },
    ]);
  });

  it.each([
    ['1.500 mbar', '1.500', 'mil e quinhentos', '1,500', 'um vírgula cinco'],
    ['10.000 psi', '10.000', 'dez mil', '10,000', 'dez vírgula zero'],
    ['2.000', '2.000', 'dois mil', '2,000', 'dois vírgula zero'],
    ['Pressão até 12.345 Pa', '12.345', 'doze mil trezentos e quarenta e cinco', '12,345', 'doze vírgula três quatro cinco'],
  ])('never changes ambiguous %j and asks for both readings', (input, token, thousandsLabel, thousandsValue, decimalLabel) => {
    const result = en(input);
    expect(result.text).toBe(input);
    expect(result.changes).toEqual([]);
    expect(result.confirmations).toHaveLength(1);
    const [confirmation] = result.confirmations;
    expect(confirmation.token).toBe(token);
    expect(confirmation.index).toBe(input.indexOf(token));
    expect(confirmation.outputIndex).toBe(input.indexOf(token));
    expect(confirmation.reason).toBe('ambiguous-thousands');
    expect(confirmation.options).toEqual([
      { reading: 'thousands', label: thousandsLabel, value: thousandsValue },
      { reading: 'decimal', label: decimalLabel, value: token },
    ]);
  });

  it('positions the confirmation inside the adjusted text when earlier changes shift it', () => {
    const result = en('±0,02 % FE até 1.500 mbar');
    expect(result.text).toBe('±0.02 % FS até 1.500 mbar');
    const [confirmation] = result.confirmations;
    expect(result.text.slice(confirmation.outputIndex, confirmation.outputIndex + confirmation.token.length)).toBe('1.500');
    expect(confirmation.index).toBe('±0,02 % FE até '.length);
  });

  it('applies a chosen reading to every occurrence and then keeps the confirmed value quiet', () => {
    const input = 'De 1.500 a 2.000 mbar, depois 1.500 mbar';
    const result = en(input);
    expect(result.confirmations.map(item => item.token)).toEqual(['1.500', '2.000', '1.500']);
    const thousands = result.confirmations[0].options[0];
    const applied = applyNumberReading(input, result.confirmations, thousands);
    expect(applied).toBe('De 1,500 a 2.000 mbar, depois 1,500 mbar');
    const again = en(applied, [thousands.value]);
    expect(again.changes).toEqual([]);
    expect(again.confirmations.map(item => item.token)).toEqual(['2.000']);
    const decimal = again.confirmations[0].options[1];
    expect(applyNumberReading(applied, again.confirmations, decimal)).toBe(applied);
    expect(en(applied, [thousands.value, decimal.value]).confirmations).toEqual([]);
  });

  it('writes Portuguese integers in words for the confirmation labels', () => {
    expect(integerWordsPtBr(0)).toBe('zero');
    expect(integerWordsPtBr(100)).toBe('cem');
    expect(integerWordsPtBr(1_500)).toBe('mil e quinhentos');
    expect(integerWordsPtBr(2_010)).toBe('dois mil e dez');
    expect(integerWordsPtBr(100_000)).toBe('cem mil');
    expect(integerWordsPtBr(1_000_000)).toBe('um milhão');
    expect(integerWordsPtBr(1_000_500)).toBe('um milhão e quinhentos');
    expect(integerWordsPtBr(999_999_999)).toBe('novecentos e noventa e nove milhões novecentos e noventa e nove mil novecentos e noventa e nove');
    expect(integerWordsPtBr(1_000_000_000)).toBe('1000000000');
  });

  it('does nothing for a source that is not Portuguese (Brazil)', () => {
    const result = formatTechnicalTextForLocale('0,02 % FE', { sourceLocale: 'en-GB' as unknown as 'pt-BR', targetLocale: 'en-US' });
    expect(result).toEqual({ text: '0,02 % FE', changes: [], confirmations: [] });
  });
});

describe('FR-85 locale-number-format · pt-BR → es-ES', () => {
  it.each(['Exatidão: ±0,02 % FE', '1,5 kg', '1.500 mbar', '10.000 psi', '1.500,5 Pa', '-25 a 140 °C', 'TA-25N'])(
    'keeps numbers and "% FE" in %j, without confirmations', input => {
      expect(es(input)).toEqual({ text: input, changes: [], confirmations: [] });
    });

  it('only adapts the spelled-out reading and full-scale abbreviations', () => {
    expect(es('0,01 % da leitura + 0,005 % FE').text).toBe('0,01 % de la lectura + 0,005 % FE');
    expect(es('0,5 % do fundo de escala').text).toBe('0,5 % FE');
    expect(es('0,01 % da leitura').changes).toEqual([{ from: '% da leitura', to: '% de la lectura', kind: 'abbreviation', index: 5 }]);
  });
});

describe('FR-85 technical-token equivalence used by the review', () => {
  it('lists the original, each partial adjustment and each ambiguous reading as acceptable renderings', () => {
    expect(new Set(localeTokenRenderings('±0,02 % FE', 'en-US'))).toEqual(new Set(['±0,02 % FE', '±0.02 % FE', '±0,02 % FS', '±0.02 % FS']));
    expect(new Set(localeTokenRenderings('1.500 mbar', 'en-US'))).toEqual(new Set(['1.500 mbar', '1,500 mbar']));
    expect(localeTokenRenderings('1.500 mbar', 'es-ES')).toEqual(['1.500 mbar']);
    expect(localeTokenRenderings('TA-25N', 'en-US')).toEqual(['TA-25N']);
  });

  it('accepts same values in the target format and refuses any other difference', () => {
    expect(technicalTokensEquivalentForLocale(['±0,02 % FE', '%'], ['%', '±0.02 % FS'], 'en-US')).toBe(true);
    expect(technicalTokensEquivalentForLocale(['1.500 mbar'], ['1,500 mbar'], 'en-US')).toBe(true);
    expect(technicalTokensEquivalentForLocale(['1.500 mbar'], ['1.500 mbar'], 'en-US')).toBe(true);
    expect(technicalTokensEquivalentForLocale(['1.500 mbar', '1,500 mbar'], ['1.500 mbar', '1,500 mbar'], 'en-US')).toBe(true);
    expect(technicalTokensEquivalentForLocale(['±0,02 % FE'], ['±0.2 % FS'], 'en-US')).toBe(false);
    expect(technicalTokensEquivalentForLocale(['±0,02 % FE'], ['±0.02 % RDG'], 'en-US')).toBe(false);
    expect(technicalTokensEquivalentForLocale(['±0,02 % FE'], ['±0.02 % FS', 'TA-25N'], 'en-US')).toBe(false);
    expect(technicalTokensEquivalentForLocale(['±0,02 % FE', 'TA-25N'], ['±0.02 % FS'], 'en-US')).toBe(false);
    expect(technicalTokensEquivalentForLocale(['1.500 mbar'], ['1,500 mbar'], 'es-ES')).toBe(false);
    expect(technicalTokensEquivalentForLocale(['±0,02 % FE'], ['±0.02 % FS'])).toBe(false);
    expect(technicalTokensEquivalentForLocale(['±0,02 % FE'], ['±0,02 % FE'])).toBe(true);
  });

  it('lets requireReviewText accept the adjusted English text and still reject changed values', () => {
    const source = 'Exatidão: ±0,02 % FE; 0,01 % da leitura + 0,005 % FE; faixa -25 a 140 °C; 1.500 mbar; TA-25N';
    const adjusted = 'Accuracy: ±0.02 % FS; 0.01 % RDG + 0.005 % FS; range -25 to 140 °C; 1,500 mbar; TA-25N';
    expect(protectTechnicalTokens(source).tokens.length).toBe(protectTechnicalTokens(adjusted).tokens.length);
    expect(() => requireReviewText(source, adjusted, 'en-US')).not.toThrow();
    expect(() => requireReviewText(source, adjusted)).toThrow(expect.objectContaining({ code: 'TECHNICAL_TOKEN_MISMATCH' }));
    expect(() => requireReviewText(source, adjusted, 'es-ES')).toThrow(expect.objectContaining({ code: 'TECHNICAL_TOKEN_MISMATCH' }));
    expect(() => requireReviewText(source, adjusted.replace('0.02', '0.2'), 'en-US')).toThrow(expect.objectContaining({ code: 'TECHNICAL_TOKEN_MISMATCH' }));
    expect(() => requireReviewText(source, adjusted.replace('TA-25N', 'TA-35N'), 'en-US')).toThrow(expect.objectContaining({ code: 'TECHNICAL_TOKEN_MISMATCH' }));
    expect(() => requireReviewText(source, adjusted.replace('1,500 mbar', '1,500 bar'), 'en-US')).toThrow(expect.objectContaining({ code: 'TECHNICAL_TOKEN_MISMATCH' }));
  });
});
