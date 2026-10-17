import { describe, expect, it } from 'vitest';
import {
  applyGlossaryHint,
  applyKnownMisspelling,
  findGlossaryHints,
  findKnownMisspellings,
  glossaryTerms,
  normalizeGlossaryText,
} from '@/vnext/translation/glossary';

const REQUIRED_TERMS: readonly (readonly [string, string, string])[] = [
  ['Faixa de Operação', 'Operating Range', 'Rango de Operación'],
  ['Código de Encomenda', 'Order Code', 'Código de Pedido'],
  ['Fornecimento Padrão', 'Standard Delivery', 'Suministro Estándar'],
  ['Exatidão', 'Accuracy', 'Exactitud'],
  ['Resolução', 'Resolution', 'Resolución'],
  ['Estabilidade', 'Stability', 'Estabilidad'],
  ['Faixa de Medição', 'Measuring Range', 'Rango de Medición'],
  ['Especificações Técnicas', 'Technical Specifications', 'Especificaciones Técnicas'],
  ['Acessórios', 'Accessories', 'Accesorios'],
  ['Opcionais', 'Options', 'Opcionales'],
  ['Alimentação', 'Power Supply', 'Alimentación'],
  ['Dimensões', 'Dimensions', 'Dimensiones'],
  ['Peso', 'Weight', 'Peso'],
  ['Temperatura Ambiente', 'Ambient Temperature', 'Temperatura Ambiente'],
  ['Garantia', 'Warranty', 'Garantía'],
  ['Insertos', 'Inserts', 'Insertos'],
  ['Comunicação', 'Communication', 'Comunicación'],
  ['Tempo de Estabilização', 'Stabilization Time', 'Tiempo de Estabilización'],
  ['Uniformidade', 'Uniformity', 'Uniformidad'],
  ['Entrada', 'Input', 'Entrada'],
  ['Saída', 'Output', 'Salida'],
  ['Poço Seco', 'Dry Block', 'Bloque Seco'],
];

describe('FR-87 glossary · fixed PT/EN/ES terms', () => {
  it('contains every required term with the three spellings', () => {
    const terms = glossaryTerms();
    for (const [pt, enUS, esES] of REQUIRED_TERMS) {
      expect(terms.find(term => term['pt-BR'] === pt), pt).toMatchObject({ 'en-US': enUS, 'es-ES': esES });
    }
    expect(Object.isFrozen(terms)).toBe(true);
  });

  it('compares without accents, case or double spaces', () => {
    expect(normalizeGlossaryText('  Código  de ENCOMENDA ')).toBe('codigo de encomenda');
  });

  it('flags a glossary term from the original that the translation does not use (accent and case insensitive)', () => {
    expect(findGlossaryHints('Código de encomenda: 06.04.0121-00', 'Ordering code: 06.04.0121-00', 'en-US'))
      .toEqual([{ sourceTerm: 'Código de Encomenda', expected: 'Order Code', found: 'Ordering code' }]);
    expect(findGlossaryHints('Código de encomenda', 'ORDER CODE', 'en-US')).toEqual([]);
    expect(findGlossaryHints('Codigo de Encomenda', 'Order code', 'en-US')).toEqual([]);
    expect(findGlossaryHints('Exatidão: ±0,02 % FE', 'Precisión: ±0,02 % FE', 'es-ES'))
      .toEqual([{ sourceTerm: 'Exatidão', expected: 'Exactitud', found: 'Precisión' }]);
    expect(findGlossaryHints('Exatidão: ±0,02 % FE', 'Exactitud: ±0,02 % FE', 'es-ES')).toEqual([]);
  });

  it('reports the expected term without a found form when the translation used something unknown', () => {
    expect(findGlossaryHints('Poço seco TA-25N', 'TA-25N temperature calibrator', 'en-US'))
      .toEqual([{ sourceTerm: 'Poço Seco', expected: 'Dry Block' }]);
    expect(findGlossaryHints('Poço seco TA-25N', 'TA-25N dry block calibrator', 'en-US')).toEqual([]);
    expect(findGlossaryHints('Poço seco TA-25N', 'Dry Well TA-25N', 'en-US'))
      .toEqual([{ sourceTerm: 'Poço Seco', expected: 'Dry Block', found: 'Dry Well' }]);
  });

  it('matches whole words only and tolerates a simple plural', () => {
    expect(findGlossaryHints('Pesos e medidas', 'Weights and measures', 'en-US')).toEqual([]);
    expect(findGlossaryHints('Entrada analógica', 'Analog input', 'en-US')).toEqual([]);
    expect(findGlossaryHints('Entradas analógicas', 'Analog inputs', 'en-US')).toEqual([]);
    expect(findGlossaryHints('Compensação da entrada', 'Input compensation', 'en-US')).toEqual([]);
    expect(findGlossaryHints('Saída 4–20 mA', 'Exit 4–20 mA', 'en-US')).toEqual([{ sourceTerm: 'Saída', expected: 'Output', found: 'Exit' }]);
    expect(findGlossaryHints('Opcionais', 'Optionals', 'en-US')).toEqual([{ sourceTerm: 'Opcionais', expected: 'Options', found: 'Optionals' }]);
  });

  it('applies a deterministic replacement only when the found form appears once, keeping the case', () => {
    const hint = { sourceTerm: 'Código de Encomenda', expected: 'Order Code', found: 'Ordering Code' };
    expect(applyGlossaryHint('Ordering Code: 06.04.0121-00', hint)).toBe('Order Code: 06.04.0121-00');
    expect(applyGlossaryHint('the ordering code is', hint)).toBe('the order code is');
    expect(applyGlossaryHint('ORDERING CODE', hint)).toBe('ORDER CODE');
    expect(applyGlossaryHint('Ordering Code and Ordering Code', hint)).toBeUndefined();
    expect(applyGlossaryHint('Order Code', hint)).toBeUndefined();
    expect(applyGlossaryHint('Order Code', { sourceTerm: 'Poço Seco', expected: 'Dry Block' })).toBeUndefined();
    expect(applyGlossaryHint('Precisión: ±0,02 % FE', { sourceTerm: 'Exatidão', expected: 'Exactitud', found: 'Precisión' })).toBe('Exactitud: ±0,02 % FE');
  });
});

describe('FR-87 glossary · known misspellings from the English folders', () => {
  it.each([
    ['secundary', 'secondary'], ['Acuracy', 'Accuracy'], ['Choosen', 'Chosen'], ['availables', 'available'],
    ['pression', 'pressure'], ['Ressolution', 'Resolution'], ['Temperture', 'Temperature'], ['SECUNDARY', 'SECONDARY'],
  ])('finds %j and proposes %j', (wrong, right) => {
    const text = `Text with ${wrong} inside`;
    expect(findKnownMisspellings(text)).toEqual([{ wrong, right, index: text.indexOf(wrong) }]);
  });

  it('ignores correct words and words that merely contain a misspelling', () => {
    expect(findKnownMisspellings('Accuracy, secondary pressure, compression and expression, available options')).toEqual([]);
    expect(findKnownMisspellings('Acuracy pression Acuracy').map(item => item.index)).toEqual([0, 8, 17]);
  });

  it('corrects every occurrence of the same misspelling, each in its own case', () => {
    const text = 'Acuracy and acuracy and ACURACY; pression drop';
    const [first] = findKnownMisspellings(text);
    expect(first).toEqual({ wrong: 'Acuracy', right: 'Accuracy', index: 0 });
    expect(applyKnownMisspelling(text, first)).toBe('Accuracy and accuracy and ACCURACY; pression drop');
  });
});
