import { describe, expect, it } from 'vitest';
import {
  applyLocaleAbbreviations,
  applyNumberReading,
  formatTechnicalTextForLocale,
  integerWordsPtBr,
  localeTokenRenderings,
  localeTokenRenderingsInContext,
  technicalTextEquivalentForLocale,
  technicalTokensEquivalentForLocale,
} from '@/vnext/translation/locale-number-format';
import { protectTechnicalTokens, technicalTokenSpans } from '@/vnext/translation/technical-token-protector';
import { requireReviewText } from '@/vnext/translation/candidate';

const en = (text: string, keep?: readonly string[]) => formatTechnicalTextForLocale(text, { sourceLocale: 'pt-BR', targetLocale: 'en-US', keep });
const es = (text: string) => formatTechnicalTextForLocale(text, { sourceLocale: 'pt-BR', targetLocale: 'es-ES' });
const mismatch = expect.objectContaining({ code: 'TECHNICAL_TOKEN_MISMATCH' });

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
    ['1,5kg', '1.5kg'],
    ['Peso: 12,5 kg; 0,5-1,0 bar', 'Peso: 12.5 kg; 0.5-1.0 bar'],
    ['10-15,5 °C', '10-15.5 °C'],
    ['1.500,5 Pa', '1,500.5 Pa'],
    ['1.000.000 Pa', '1,000,000 Pa'],
    ['R$ 1.234.567,89', 'R$ 1,234,567.89'],
    ['0,02 % F.E.', '0.02 % F.S.'],
    ['0,02 %FE', '0.02 %FS'],
    ['0,5 % do fundo de escala', '0.5 % FS'],
    ['0.5 % of full scale', '0.5 % FS'],
    // Revisão adversarial: rosca métrica, barra entre decimais, rótulo sem espaço, decimal com três casas, listas de decimais.
    ['Prensa-cabo M20x1,5', 'Prensa-cabo M20x1.5'],
    ['M12x1,5', 'M12x1.5'],
    ['0,1 %/0,2 % FE', '0.1 %/0.2 % FS'],
    ['0,5/1,0 bar', '0.5/1.0 bar'],
    ['Exatidão:0,02 % FE', 'Exatidão:0.02 % FS'],
    ['Faixa: 0 a 1,500 mm', 'Faixa: 0 a 1.500 mm'],
    ['Faixas de 0,5 e 1,0 bar', 'Faixas de 0.5 e 1.0 bar'],
    ['pesa 1,5, mas cabe', 'pesa 1.5, mas cabe'],
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
    // Revisão adversarial: idempotência do RDG, enumerações, códigos com traço, faixas sem unidade.
    'Accuracy 0.1 % RDG.',
    '0.1 % rdg',
    'Ver itens 1,2 e 3',
    'páginas 3,4, 5 e 6',
    'See items 1,2 and 3',
    'Código 1.234-5',
    '1.500-2.000',
    'Código 1.234-5.678',
    'M20x1.5',
    'Rev. 1.2-3',
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
    expect(result.settled).toEqual(['0.02', '1,500.5']);
    expect(en('Prensa-cabo M20x1,5').changes).toEqual([{ from: 'M20x1,5', to: 'M20x1.5', kind: 'decimal', index: 12 }]);
  });

  it.each([
    ['1.500 mbar', '1.500', 'mil e quinhentos', '1,500', 'um vírgula cinco'],
    ['10.000 psi', '10.000', 'dez mil', '10,000', 'dez vírgula zero'],
    ['2.000', '2.000', 'dois mil', '2,000', 'dois vírgula zero'],
    ['Pressão até 12.345 Pa', '12.345', 'doze mil trezentos e quarenta e cinco', '12,345', 'doze vírgula três quatro cinco'],
    ['Faixa: 0-10.000 psi', '10.000', 'dez mil', '10,000', 'dez vírgula zero'],
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

  it('asks about both sides of a range with a unit, with a hyphen or an en dash', () => {
    for (const input of ['1.500-2.000 mbar', 'De 1.500–2.000 mbar']) {
      const result = en(input);
      expect(result.text).toBe(input);
      expect(result.changes).toEqual([]);
      expect(result.confirmations.map(item => item.token)).toEqual(['1.500', '2.000']);
      expect(result.confirmations.map(item => item.options[0].value)).toEqual(['1,500', '2,000']);
      const both = applyNumberReading(applyNumberReading(input, result.confirmations, result.confirmations[0].options[0]), result.confirmations, result.confirmations[1].options[0]);
      expect(both).toBe(input.replace('1.500', '1,500').replace('2.000', '2,000'));
    }
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

  it('reports decided decimals in `settled`, so "1.500" from "1,500 mm" is never asked about', () => {
    const result = en('Faixa: 0 a 1,500 mm');
    expect(result.text).toBe('Faixa: 0 a 1.500 mm');
    expect(result.settled).toEqual(['1.500']);
    expect(en('Faixa: 0 a 1.500 mm').confirmations.map(item => item.token)).toEqual(['1.500']);
    expect(en('Faixa: 0 a 1.500 mm', result.settled).confirmations).toEqual([]);
  });

  it('never changes a reading of an ambiguous source number (typed by hand), but still asks when it stays ambiguous', () => {
    const sourceReadings = en('Pressão máxima 1.500 mbar').confirmations.flatMap(item => item.options.map(option => option.value));
    expect(sourceReadings).toEqual(['1,500', '1.500']);
    expect(en('Maximum pressure 1,500 mbar').changes).toEqual([{ from: '1,500', to: '1.500', kind: 'decimal', index: 17 }]);
    const guarded = formatTechnicalTextForLocale('Maximum pressure 1,500 mbar', { sourceLocale: 'pt-BR', targetLocale: 'en-US', sourceReadings });
    expect(guarded).toEqual({ text: 'Maximum pressure 1,500 mbar', changes: [], confirmations: [], settled: [] });
    const asked = formatTechnicalTextForLocale('Maximum pressure 1.500 mbar', { sourceLocale: 'pt-BR', targetLocale: 'en-US', sourceReadings });
    expect(asked.confirmations.map(item => item.token)).toEqual(['1.500']);
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
    expect(result).toEqual({ text: '0,02 % FE', changes: [], confirmations: [], settled: [] });
  });

  it('recognizes every range unit the protector knows (the lists must stay in sync)', () => {
    for (const unit of ['°C', '°F', 'bar', 'mbar', 'psi', 'kPa', 'MPa', 'Pa', 'mA', 'µA', 'mV', 'Vdc', 'Hz', 'kHz', 'MHz', '% FS', '% FE', 'ppm', 'Ω', 'kΩ', 'MΩ']) {
      const text = `1.500-2.000 ${unit}`;
      expect(protectTechnicalTokens(text).tokens.map(token => token.value), unit).toEqual([text]);
      expect(en(text).confirmations.map(item => item.token), unit).toEqual(['1.500', '2.000']);
    }
  });
});

describe('FR-85 locale-number-format · pt-BR → es-ES', () => {
  it.each(['Exatidão: ±0,02 % FE', '1,5 kg', '1.500 mbar', '10.000 psi', '1.500,5 Pa', '-25 a 140 °C', 'TA-25N', 'M20x1,5'])(
    'keeps numbers and "% FE" in %j, without confirmations', input => {
      expect(es(input)).toEqual({ text: input, changes: [], confirmations: [], settled: [] });
    });

  it('only adapts the spelled-out reading and full-scale abbreviations', () => {
    expect(es('0,01 % da leitura + 0,005 % FE').text).toBe('0,01 % de la lectura + 0,005 % FE');
    expect(es('0,5 % do fundo de escala').text).toBe('0,5 % FE');
    expect(es('0,01 % da leitura').changes).toEqual([{ from: '% da leitura', to: '% de la lectura', kind: 'abbreviation', index: 5 }]);
    expect(applyLocaleAbbreviations('Exatidão: ±0,5 % do fundo de escala', 'es-ES')).toBe('Exatidão: ±0,5 % FE');
    expect(applyLocaleAbbreviations('Exatidão: ±0,5 % do fundo de escala', 'en-US')).toBe('Exatidão: ±0,5 % FS');
  });
});

describe('FR-85 technical-token equivalence used by the review', () => {
  it('lists the original, each partial adjustment and each ambiguous reading as acceptable renderings', () => {
    expect(new Set(localeTokenRenderings('±0,02 % FE', 'en-US'))).toEqual(new Set(['±0,02 % FE', '±0.02 % FE', '±0,02 % FS', '±0.02 % FS']));
    expect(new Set(localeTokenRenderings('1.500 mbar', 'en-US'))).toEqual(new Set(['1.500 mbar', '1,500 mbar']));
    expect(localeTokenRenderings('1.500 mbar', 'es-ES')).toEqual(['1.500 mbar']);
    expect(localeTokenRenderings('TA-25N', 'en-US')).toEqual(['TA-25N']);
    expect(new Set(localeTokenRenderings('M20x1,5', 'en-US'))).toEqual(new Set(['M20x1,5', 'M20x1.5']));
    expect(new Set(localeTokenRenderings('0-10.000 psi', 'en-US'))).toEqual(new Set(['0-10.000 psi', '0-10,000 psi']));
    expect(new Set(localeTokenRenderings('1.500-2.000 mbar', 'en-US')))
      .toEqual(new Set(['1.500-2.000 mbar', '1,500-2.000 mbar', '1.500-2,000 mbar', '1,500-2,000 mbar']));
  });

  it('computes renderings from the sentence context, not from the token alone', () => {
    const inContext = (text: string) => localeTokenRenderingsInContext(text, technicalTokenSpans(text), 'en-US').map(list => new Set(list));
    // "1.234" alone could be read as a thousand, but in the sentence it is glued to a code.
    expect(new Set(localeTokenRenderings('1.234', 'en-US'))).toEqual(new Set(['1.234', '1,234']));
    expect(inContext('Código 1.234-5')).toEqual([new Set(['1.234']), new Set(['5'])]);
    expect(inContext('Exatidão: ±0,02 % FE até 1.500 mbar')).toEqual([
      new Set(['±0,02 % FE', '±0.02 % FE', '±0,02 % FS', '±0.02 % FS']), new Set(['1.500 mbar', '1,500 mbar'])]);
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

  it('never lets two different source numbers collapse into the same English form', () => {
    expect(technicalTokensEquivalentForLocale(['1.500 mbar', '1,500 mbar'], ['1.500 mbar', '1.500 mbar'], 'en-US')).toBe(false);
    expect(technicalTokensEquivalentForLocale(['1.500 mbar', '1,500 mbar'], ['1,500 mbar', '1,500 mbar'], 'en-US')).toBe(false);
    expect(technicalTokensEquivalentForLocale(['1.500 mbar', '1.500 mbar'], ['1,500 mbar', '1,500 mbar'], 'en-US')).toBe(true);
    // Same values in another order still pass (the gateway may reorder a sentence), by position or by assignment.
    expect(technicalTokensEquivalentForLocale(['1.500 mbar', '2.000 mbar'], ['2,000 mbar', '1,500 mbar'], 'en-US')).toBe(true);
    expect(technicalTokensEquivalentForLocale(['1.500 mbar', '2.000 mbar'], ['1,500 mbar', '1,500 mbar'], 'en-US')).toBe(false);
  });

  it('lets requireReviewText accept the adjusted English text and still reject changed values', () => {
    const source = 'Exatidão: ±0,02 % FE; 0,01 % da leitura + 0,005 % FE; faixa -25 a 140 °C; 1.500 mbar; TA-25N';
    const adjusted = 'Accuracy: ±0.02 % FS; 0.01 % RDG + 0.005 % FS; range -25 to 140 °C; 1,500 mbar; TA-25N';
    expect(protectTechnicalTokens(source).tokens.length).toBe(protectTechnicalTokens(adjusted).tokens.length);
    expect(() => requireReviewText(source, adjusted, 'en-US')).not.toThrow();
    expect(() => requireReviewText(source, adjusted)).toThrow(mismatch);
    expect(() => requireReviewText(source, adjusted, 'es-ES')).toThrow(mismatch);
    expect(() => requireReviewText(source, adjusted.replace('0.02', '0.2'), 'en-US')).toThrow(mismatch);
    expect(() => requireReviewText(source, adjusted.replace('TA-25N', 'TA-35N'), 'en-US')).toThrow(mismatch);
    expect(() => requireReviewText(source, adjusted.replace('1,500 mbar', '1,500 bar'), 'en-US')).toThrow(mismatch);
  });

  it('accepts "% FS"/"% FE" for "% do fundo de escala" even though the abbreviation merges two protected tokens', () => {
    expect(protectTechnicalTokens('0,5 % do fundo de escala').tokens.map(token => token.value)).toEqual(['0,5', '%']);
    expect(protectTechnicalTokens('0.5 % FS').tokens.map(token => token.value)).toEqual(['0.5 % FS']);
    expect(() => requireReviewText('Exatidão: 0,5 % do fundo de escala', 'Accuracy: 0.5 % FS', 'en-US')).not.toThrow();
    expect(() => requireReviewText('Exatidão: ±0,5 % do fundo de escala', 'Accuracy: ±0.5 % FS', 'en-US')).not.toThrow();
    expect(() => requireReviewText('Exatidão: ±0,5 % do fundo de escala', 'Exatidão: ±0.5 % FS', 'en-US')).not.toThrow();
    expect(() => requireReviewText('Exatidão: 0,5 % do fundo de escala', 'Accuracy: 0.5 % of full scale', 'en-US')).not.toThrow();
    expect(() => requireReviewText('Exatidão: ±0,5 % do fundo de escala', 'Exactitud: ±0,5 % FE', 'es-ES')).not.toThrow();
    expect(() => requireReviewText('Exatidão: 0,5 % do fundo de escala', 'Accuracy: 0.6 % FS', 'en-US')).toThrow(mismatch);
    expect(() => requireReviewText('Exatidão: ±0,5 % do fundo de escala', 'Exactitud: ±0.5 % FS', 'es-ES')).toThrow(mismatch);
    // Known limit (pre-existing): the protector only protects "%", so a spelled-out "% do fundo de escala" cannot be told
    // apart from "% RDG" by the guardian; "% FE" and "% FS" are protected with the number and are told apart.
    expect(() => requireReviewText('Exatidão: ±0,5 % FE', 'Accuracy: ±0.5 % RDG', 'en-US')).toThrow(mismatch);
  });

  it('accepts the English metric thread and the English form of hyphenated ranges', () => {
    expect(() => requireReviewText('Prensa-cabo M20x1,5', 'Cable gland M20x1.5', 'en-US')).not.toThrow();
    expect(() => requireReviewText('Prensa-cabo M12x1,5', 'Cable gland M12x1.5', 'en-US')).not.toThrow();
    expect(() => requireReviewText('Prensa-cabo M20x1,5', 'Cable gland M20x1.6', 'en-US')).toThrow(mismatch);
    expect(() => requireReviewText('Prensa-cabo M20x1,5', 'Cable gland M20x1.5', 'es-ES')).toThrow(mismatch);
    expect(() => requireReviewText('Faixa: 0-10.000 psi', 'Range: 0-10,000 psi', 'en-US')).not.toThrow();
    expect(() => requireReviewText('Faixa: 0-10.000 psi', 'Range: 0-10.000 psi', 'en-US')).not.toThrow();
    expect(() => requireReviewText('Faixa: 1.500-2.000 mbar', 'Range: 1,500-2,000 mbar', 'en-US')).not.toThrow();
    expect(() => requireReviewText('Faixa: 1.500–2.000 mbar', 'Range: 1,500–2,000 mbar', 'en-US')).not.toThrow();
    expect(() => requireReviewText('Faixa: 0-10.000 psi', 'Range: 0-10,001 psi', 'en-US')).toThrow(mismatch);
    expect(() => requireReviewText('Faixa: 0-10.000 psi', 'Range: 0-10,000 bar', 'en-US')).toThrow(mismatch);
  });

  it('refuses locale renderings that the sentence context never offers', () => {
    expect(() => requireReviewText('Código 1.234-5', 'Code 1,234-5', 'en-US')).toThrow(mismatch);
    expect(() => requireReviewText('Código 1.234-5', 'Code 1.234-5', 'en-US')).not.toThrow();
    expect(() => requireReviewText('Faixa: 1.500-2.000', 'Range: 1,500-2,000', 'en-US')).toThrow(mismatch);
    expect(technicalTextEquivalentForLocale('ab1,5 bar', 'ab1.5 bar', 'en-US')).toBe(false);
    expect(technicalTextEquivalentForLocale('De 1.500 mbar a 1,500 mbar', 'From 1.500 mbar to 1.500 mbar', 'en-US')).toBe(false);
  });
});
