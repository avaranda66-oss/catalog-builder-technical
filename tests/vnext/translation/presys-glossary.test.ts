import { describe, expect, it } from 'vitest';
import {
  PRESYS_GLOSSARY_TERMS,
  PRESYS_GLOSSARY_VERSION,
  PRESYS_KEEP_NAMES,
  PRESYS_KNOWN_MISSPELLINGS,
  findKeepTerms,
  glossaryEntriesForTexts,
  protectKeepTerms,
  restoreKeepTerms,
} from '@/vnext/translation/presys-glossary';
import { glossaryTerms, knownMisspellings } from '@/vnext/translation/glossary';
import { formatTechnicalTextForLocale, technicalTextEquivalentForLocale } from '@/vnext/translation/locale-number-format';
import { requireReviewText } from '@/vnext/translation/candidate';

const values = (text: string) => findKeepTerms(text).map(span => span.value);

describe('FR-87 glossário PRESYS versionado (fonte única)', () => {
  it('has a version and is the same data the review screen uses', () => {
    expect(PRESYS_GLOSSARY_VERSION).toMatch(/^presys-glossary-v\d+$/);
    expect(glossaryTerms()).toBe(PRESYS_GLOSSARY_TERMS);
    expect(knownMisspellings()).toBe(PRESYS_KNOWN_MISSPELLINGS);
  });

  it('has a non-empty English and Spanish term for every Portuguese term, without duplicates', () => {
    const sources = PRESYS_GLOSSARY_TERMS.map(term => term['pt-BR']);
    expect(new Set(sources).size).toBe(sources.length);
    for (const term of PRESYS_GLOSSARY_TERMS) {
      expect(term['en-US'].trim()).not.toBe('');
      expect(term['es-ES'].trim()).not.toBe('');
    }
    expect(PRESYS_GLOSSARY_TERMS.find(term => term['pt-BR'] === 'Exatidão')).toMatchObject({ 'en-US': 'Accuracy', 'es-ES': 'Exactitud' });
    expect(PRESYS_GLOSSARY_TERMS.find(term => term['pt-BR'] === 'Código de Encomenda')).toMatchObject({ 'en-US': 'Order Code', 'es-ES': 'Código de Pedido' });
  });

  it('lists the PRESYS brand and the real model names that never translate', () => {
    for (const name of ['PRESYS', 'PCON-Y17', 'PCON-Y18 LP', 'TA-25N', 'MCS-XV', 'ST-501', 'LC-505', 'T-500PIR', 'Kompressor']) {
      expect(PRESYS_KEEP_NAMES).toContain(name);
    }
  });
});

describe('FR-87 marcas e modelos que não se traduzem', () => {
  it('finds brands, listed models and uppercase model codes with a digit', () => {
    expect(values('Calibrador PRESYS TA-25N com bloco do PCON-Y18 LP e PCON-Y17.')).toEqual(['PRESYS', 'TA-25N', 'PCON-Y18 LP', 'PCON-Y17']);
    expect(values('Linha Kompressor, MCS-XV, ST-501, LC-505 e T-500PIR.')).toEqual(['Kompressor', 'MCS-XV', 'ST-501', 'LC-505', 'T-500PIR']);
    expect(values('Novo modelo XYZ-12/A e ABC-7.')).toEqual(['XYZ-12/A', 'ABC-7']);
    expect(values('PCON KOMPRESSOR-Y18')).toEqual(['PCON', 'KOMPRESSOR-Y18']);
    // Brand names in any case stay as written ("Presys").
    expect(values('A Presys fabrica calibradores.')).toEqual(['Presys']);
  });

  it('leaves alone abbreviations without digits, lower-case words and existing placeholders', () => {
    expect(values('Alimentação CA-CC, semi-automático, pré-2020 e Wi-Fi.')).toEqual([]);
    expect(values('Exatidão [[VNEXT_TECH_0123ABCD_001]] e [[VNEXT_KEEP_001]].')).toEqual([]);
    expect(values('Composto PRESYSTEMA e TA-25NX9')).toEqual(['TA-25NX9']);
  });

  it('round-trips byte for byte: protect, translate around placeholders, restore', () => {
    const source = 'O Kompressor e o MCS-XV da Presys usam ST-501 [[VNEXT_TECH_AB_001]].';
    const protection = protectKeepTerms(source);
    expect(protection.text).toBe('O [[VNEXT_KEEP_001]] e o [[VNEXT_KEEP_002]] da [[VNEXT_KEEP_003]] usam [[VNEXT_KEEP_004]] [[VNEXT_TECH_AB_001]].');
    expect(protection.terms.map(term => term.value)).toEqual(['Kompressor', 'MCS-XV', 'Presys', 'ST-501']);
    // The model may reorder the placeholders; each one returns to its exact original value.
    const translated = 'The [[VNEXT_KEEP_002]] and the [[VNEXT_KEEP_001]] by [[VNEXT_KEEP_003]] use [[VNEXT_KEEP_004]] [[VNEXT_TECH_AB_001]].';
    expect(restoreKeepTerms(translated, protection)).toBe('The MCS-XV and the Kompressor by Presys use ST-501 [[VNEXT_TECH_AB_001]].');
  });

  it('refuses a translation that lost, repeated, renumbered or invented a placeholder', () => {
    const protection = protectKeepTerms('Linha Kompressor e MCS-XV');
    expect(restoreKeepTerms('Kompressor line and [[VNEXT_KEEP_002]]', protection)).toBeUndefined();
    expect(restoreKeepTerms('[[VNEXT_KEEP_001]] and [[VNEXT_KEEP_001]]', protection)).toBeUndefined();
    expect(restoreKeepTerms('[[VNEXT_KEEP_001]] and [[VNEXT_KEEP_2]]', protection)).toBeUndefined();
    expect(restoreKeepTerms('[[VNEXT_KEEP_001]] and [[VNEXT_KEEP_003]]', protection)).toBeUndefined();
    expect(restoreKeepTerms('[[VNEXT_KEEP_001]] line and [[VNEXT_KEEP_002]]', protection)).toBe('Kompressor line and MCS-XV');
  });

  it('never touches a text that already contains the server marker (no collision possible)', () => {
    const text = 'Escrito à mão: [[VNEXT_KEEP_001]] e Kompressor';
    expect(protectKeepTerms(text)).toEqual({ text, terms: [] });
    expect(restoreKeepTerms('Typed by hand: [[VNEXT_KEEP_001]] and Kompressor', protectKeepTerms(text))).toBeUndefined();
    expect(restoreKeepTerms('No brand here', protectKeepTerms('Sem marca aqui'))).toBe('No brand here');
  });
});

describe('FR-87 glossário enviado ao provedor', () => {
  it('sends only the terms present in the batch, ignoring accents, case and singular/plural', () => {
    expect(glossaryEntriesForTexts(['EXATIDAO: [[VNEXT_TECH_A_001]]', 'Acessório incluso; faixa de operação'], 'en-US')).toEqual([
      { source: 'Faixa de Operação', target: 'Operating Range' },
      { source: 'Exatidão', target: 'Accuracy' },
      { source: 'Acessórios', target: 'Accessories' },
    ]);
    expect(glossaryEntriesForTexts(['Código de encomenda', 'Poço seco'], 'es-ES')).toEqual([
      { source: 'Código de Encomenda', target: 'Código de Pedido' },
      { source: 'Poço Seco', target: 'Bloque Seco' },
    ]);
    expect(glossaryEntriesForTexts(['Texto sem termo técnico'], 'en-US')).toEqual([]);
    // Whole words only: "Pesos" matches "Peso", "Pesquisa" does not.
    expect(glossaryEntriesForTexts(['Pesquisa'], 'en-US')).toEqual([]);
  });
});

describe('FR-85 números com sinal e valores preservados', () => {
  const en = (text: string) => formatTechnicalTextForLocale(text, { sourceLocale: 'pt-BR', targetLocale: 'en-US' });
  const es = (text: string) => formatTechnicalTextForLocale(text, { sourceLocale: 'pt-BR', targetLocale: 'es-ES' });

  it.each([
    ['± 0,1 °C', '± 0.1 °C'],
    ['Faixa: -25,5 a 140,5 °C', 'Faixa: -25.5 a 140.5 °C'],
    ['−0,5 °C', '−0.5 °C'],
    ['(-0,05 % FE)', '(-0.05 % FS)'],
    ['-40,5…85,5 °C', '-40.5…85.5 °C'],
    ['+0,5 bar', '+0.5 bar'],
    ['3,5 kg (7,7 lb)', '3.5 kg (7.7 lb)'],
    ['10.000,0 psi', '10,000.0 psi'],
    ['Poço: Ø25,4 mm × 124 mm', 'Poço: Ø25.4 mm × 124 mm'],
    ['ø6,35 mm', 'ø6.35 mm'],
    ['Fonte auxiliar: 24 Vcc regulada', 'Fonte auxiliar: 24 Vdc regulada'],
    ['230 Vca ± 10 %', '230 Vac ± 10 %'],
  ])('en-US: %s → %s (units never change)', (source, expected) => {
    expect(en(source).text).toBe(expected);
  });

  it.each(['± 0,1 °C', 'Faixa: -25,5 a 140,5 °C', '−0,5 °C', '-40,5…85,5 °C', '3,5 kg (7,7 lb)', '1.500 mbar', 'Ø25,4 mm', '24 Vcc', '230 Vca'])('es-ES keeps %s exactly', source => {
    expect(es(source).text).toBe(source);
  });

  it('still leaves signed codes and words glued to a minus sign alone', () => {
    for (const text of ['Código 1.234-5', 'ref-0,5', 'item A-1,5', '06.04.0121-00/IN1P', 'AØ25,4', 'Vccx 5']) expect(en(text).text).toBe(text);
  });

  it('keeps every digit, sign and unit byte for byte: only the decimal and thousands separators move', () => {
    const sources = ['Exatidão: ±0,02 % FE', 'Faixa: -25,5 a 140,5 °C', '0,01 % da leitura + 0,005 % FE', '−0,5 °C', '1.500,5 Pa',
      'M20x1,5', '± 0,1 °C', '1,5 kg', '-40,5…85,5 °C', '1.000.000 Pa'];
    const skeleton = (text: string) => text.replace(/% (?:da leitura|RDG)/g, '%R').replace(/% F[ES]/g, '%F').replace(/[.,]/g, '');
    for (const source of sources) expect(skeleton(en(source).text)).toBe(skeleton(source));
  });

  it('lets the review accept the English form of a negative decimal and still refuse a changed value', () => {
    const source = 'Faixa: -25,5 a 140,5 °C';
    expect(technicalTextEquivalentForLocale(source, 'Range: -25.5 to 140.5 °C', 'en-US')).toBe(true);
    expect(() => requireReviewText(source, 'Range: -25.5 to 140.5 °C', 'en-US')).not.toThrow();
    expect(() => requireReviewText(source, 'Range: -25.6 to 140.5 °C', 'en-US')).toThrow(expect.objectContaining({ code: 'TECHNICAL_TOKEN_MISMATCH' }));
    expect(() => requireReviewText(source, 'Range: 25.5 to 140.5 °C', 'en-US')).toThrow(expect.objectContaining({ code: 'TECHNICAL_TOKEN_MISMATCH' }));
    // "24 Vcc" é dado protegido: a revisão aceita a sigla inglesa da MESMA unidade e recusa outra unidade.
    expect(() => requireReviewText('Fonte auxiliar: 24 Vcc', 'Auxiliary supply: 24 Vdc', 'en-US')).not.toThrow();
    expect(() => requireReviewText('Fonte auxiliar: 24 Vcc', 'Auxiliary supply: 24 Vac', 'en-US')).toThrow(expect.objectContaining({ code: 'TECHNICAL_TOKEN_MISMATCH' }));
  });
});
