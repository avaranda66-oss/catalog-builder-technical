/**
 * FR-87 · Glossário fixo PT/EN/ES da PRESYS e grafias erradas conhecidas dos folders em inglês.
 *
 * Grafias conferidas nos folders reais (TA-25N/35N/50N, PCON-Y17, PCON-Y18 LP, Kompressor Y18):
 * "Order Code", "Standard Delivery", "Operating Range", "Technical Specifications",
 * "Stabilization Time", "Uniformity", "Dry Block", "Power Supply", "Ambient Temperature".
 * Erros encontrados nesses mesmos folders: "Acuracy", "secundary", "availables", "pression".
 *
 * Tudo aqui é SUGESTÃO para a revisão: o módulo aponta o termo esperado e, quando a troca é
 * determinística (o termo usado aparece uma única vez), a tela oferece um botão. Nada é
 * aplicado sem a pessoa clicar.
 */

import type { LocaleFormatTargetLocale } from './locale-number-format';

export type GlossaryLocale = 'pt-BR' | LocaleFormatTargetLocale;

export interface GlossaryTerm {
  readonly 'pt-BR': string;
  readonly 'en-US': string;
  readonly 'es-ES': string;
  /** Formas que a tradução costuma usar no lugar do termo esperado (para oferecer a troca). */
  readonly alternates?: Partial<Record<LocaleFormatTargetLocale, readonly string[]>>;
}

export interface GlossaryHint {
  readonly sourceTerm: string;
  readonly expected: string;
  /** Forma encontrada na tradução no lugar do termo esperado, quando reconhecida. */
  readonly found?: string;
}

export interface KnownMisspelling {
  /** Grafia errada exatamente como aparece no texto. */
  readonly wrong: string;
  /** Grafia certa, com a mesma caixa da palavra encontrada. */
  readonly right: string;
  readonly index: number;
}

const TERMS: readonly GlossaryTerm[] = Object.freeze([
  { 'pt-BR': 'Faixa de Operação', 'en-US': 'Operating Range', 'es-ES': 'Rango de Operación',
    alternates: { 'en-US': ['Operation Range', 'Operational Range', 'Working Range'], 'es-ES': ['Rango Operativo', 'Rango de Funcionamiento', 'Rango de Trabajo', 'Gama de Operación'] } },
  { 'pt-BR': 'Código de Encomenda', 'en-US': 'Order Code', 'es-ES': 'Código de Pedido',
    alternates: { 'en-US': ['Ordering Code', 'Order Number', 'Ordering Number', 'Part Number'], 'es-ES': ['Código de Orden', 'Código de Encargo', 'Código de Encomienda', 'Número de Pedido'] } },
  { 'pt-BR': 'Fornecimento Padrão', 'en-US': 'Standard Delivery', 'es-ES': 'Suministro Estándar',
    alternates: { 'en-US': ['Standard Supply', 'Standard Scope of Supply', 'Scope of Delivery', 'Standard Shipment'], 'es-ES': ['Entrega Estándar', 'Suministro Standard', 'Alcance del Suministro'] } },
  { 'pt-BR': 'Exatidão', 'en-US': 'Accuracy', 'es-ES': 'Exactitud',
    alternates: { 'en-US': ['Precision', 'Exactness', 'Exactitude'], 'es-ES': ['Precisión'] } },
  { 'pt-BR': 'Resolução', 'en-US': 'Resolution', 'es-ES': 'Resolución' },
  { 'pt-BR': 'Estabilidade', 'en-US': 'Stability', 'es-ES': 'Estabilidad', alternates: { 'en-US': ['Steadiness'] } },
  { 'pt-BR': 'Faixa de Medição', 'en-US': 'Measuring Range', 'es-ES': 'Rango de Medición',
    alternates: { 'en-US': ['Measurement Range', 'Measure Range'], 'es-ES': ['Rango de Medida', 'Gama de Medición'] } },
  { 'pt-BR': 'Especificações Técnicas', 'en-US': 'Technical Specifications', 'es-ES': 'Especificaciones Técnicas',
    alternates: { 'en-US': ['Technical Data', 'Technical Specs', 'Specifications'], 'es-ES': ['Datos Técnicos', 'Especificaciones'] } },
  { 'pt-BR': 'Acessórios', 'en-US': 'Accessories', 'es-ES': 'Accesorios' },
  { 'pt-BR': 'Opcionais', 'en-US': 'Options', 'es-ES': 'Opcionales', alternates: { 'en-US': ['Optionals'], 'es-ES': ['Opciones'] } },
  { 'pt-BR': 'Alimentação', 'en-US': 'Power Supply', 'es-ES': 'Alimentación',
    alternates: { 'en-US': ['Power Source', 'Electrical Supply', 'Supply Voltage', 'Feeding'], 'es-ES': ['Fuente de Poder', 'Suministro Eléctrico'] } },
  { 'pt-BR': 'Dimensões', 'en-US': 'Dimensions', 'es-ES': 'Dimensiones', alternates: { 'en-US': ['Size'], 'es-ES': ['Tamaño', 'Medidas'] } },
  { 'pt-BR': 'Peso', 'en-US': 'Weight', 'es-ES': 'Peso', alternates: { 'en-US': ['Mass'] } },
  { 'pt-BR': 'Temperatura Ambiente', 'en-US': 'Ambient Temperature', 'es-ES': 'Temperatura Ambiente',
    alternates: { 'en-US': ['Environment Temperature', 'Environmental Temperature', 'Room Temperature'], 'es-ES': ['Temperatura Ambiental', 'Temperatura del Ambiente'] } },
  { 'pt-BR': 'Garantia', 'en-US': 'Warranty', 'es-ES': 'Garantía', alternates: { 'en-US': ['Guarantee', 'Guaranty'] } },
  { 'pt-BR': 'Insertos', 'en-US': 'Inserts', 'es-ES': 'Insertos', alternates: { 'en-US': ['Insertions'], 'es-ES': ['Inserciones', 'Insertores'] } },
  { 'pt-BR': 'Comunicação', 'en-US': 'Communication', 'es-ES': 'Comunicación' },
  { 'pt-BR': 'Tempo de Estabilização', 'en-US': 'Stabilization Time', 'es-ES': 'Tiempo de Estabilización',
    alternates: { 'en-US': ['Stabilisation Time', 'Settling Time', 'Stabilizing Time'], 'es-ES': ['Tiempo de Asentamiento', 'Tiempo de Estabilizado'] } },
  { 'pt-BR': 'Uniformidade', 'en-US': 'Uniformity', 'es-ES': 'Uniformidad', alternates: { 'en-US': ['Homogeneity'], 'es-ES': ['Homogeneidad'] } },
  { 'pt-BR': 'Entrada', 'en-US': 'Input', 'es-ES': 'Entrada', alternates: { 'en-US': ['Entry'] } },
  { 'pt-BR': 'Saída', 'en-US': 'Output', 'es-ES': 'Salida', alternates: { 'en-US': ['Exit'] } },
  { 'pt-BR': 'Poço Seco', 'en-US': 'Dry Block', 'es-ES': 'Bloque Seco',
    alternates: { 'en-US': ['Dry-Block', 'Dry Well', 'Dry-Well', 'Dry Bath'], 'es-ES': ['Pozo Seco', 'Bloque-Seco', 'Baño Seco'] } },
  { 'pt-BR': 'Incerteza', 'en-US': 'Uncertainty', 'es-ES': 'Incertidumbre' },
  { 'pt-BR': 'Repetibilidade', 'en-US': 'Repeatability', 'es-ES': 'Repetibilidad', alternates: { 'en-US': ['Repetibility'] } },
].map(term => Object.freeze(term)));

/** Pares [errado, certo] vistos nos folders EN da PRESYS e outros erros óbvios do mesmo tipo. */
const MISSPELLINGS: readonly (readonly [string, string])[] = Object.freeze([
  ['secundary', 'secondary'], ['acuracy', 'accuracy'], ['acurate', 'accurate'], ['choosen', 'chosen'], ['availables', 'available'],
  ['pression', 'pressure'], ['presure', 'pressure'], ['ressolution', 'resolution'], ['temperture', 'temperature'],
  ['mantainance', 'maintenance'], ['maintainance', 'maintenance'], ['maintenence', 'maintenance'], ['conection', 'connection'],
  ['conector', 'connector'], ['comunication', 'communication'], ['standart', 'standard'], ['aplication', 'application'],
  ['equipament', 'equipment'], ['lenght', 'length'], ['enviroment', 'environment'], ['termocouple', 'thermocouple'],
  ['tranducer', 'transducer'], ['transmiter', 'transmitter'], ['acessories', 'accessories'], ['accesories', 'accessories'],
  ['acessory', 'accessory'], ['dimentions', 'dimensions'], ['stabilty', 'stability'], ['programable', 'programmable'],
  ['rechargable', 'rechargeable'], ['batery', 'battery'], ['suply', 'supply'], ['adress', 'address'], ['aquisition', 'acquisition'],
  ['wich', 'which'], ['recieve', 'receive'], ['garanty', 'warranty'], ['ambiental', 'ambient'], ['usefull', 'useful'],
  ['sucessfully', 'successfully'], ['occurence', 'occurrence'], ['independant', 'independent'], ['resistence', 'resistance'],
]);

export function glossaryTerms(): readonly GlossaryTerm[] {
  return TERMS;
}

export function knownMisspellings(): readonly (readonly [string, string])[] {
  return MISSPELLINGS;
}

/** Sem acento, sem caixa e com espaços simples, para comparar termos. */
export function normalizeGlossaryText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
}

/** Escape válido com a flag `u` (hífen não precisa, e `\-` fora de classe é erro). */
function escapeRegExp(text: string): string {
  return text.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Singular e plural de uma palavra normalizada: o "s" simples e os irregulares dos termos
 * (accessory/accessories, dimensão/dimensões, opcional/opcionais, dimensión/dimensiones).
 */
function wordForms(word: string): string {
  if (word.endsWith('ies')) return `${escapeRegExp(word.slice(0, -3))}(?:y|ies)`;
  if (word.endsWith('oes')) return `${escapeRegExp(word.slice(0, -3))}(?:ao|oes)`;
  if (word.endsWith('ones')) return `${escapeRegExp(word.slice(0, -4))}(?:on|ones)`;
  if (word.endsWith('ais')) return `${escapeRegExp(word.slice(0, -3))}(?:al|ais)`;
  return `${escapeRegExp(word.endsWith('s') ? word.slice(0, -1) : word)}s?`;
}

/** Expressão para o termo normalizado como palavras inteiras; a última palavra aceita singular/plural. */
function termPattern(term: string): RegExp {
  const words = normalizeGlossaryText(term).split(' ');
  const last = words.length - 1;
  const parts = words.map((word, index) => (index === last ? wordForms(word) : escapeRegExp(word)));
  return new RegExp(`(?<![\\p{L}\\p{N}])${parts.join('\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
}

interface CompiledTerm {
  readonly term: GlossaryTerm;
  readonly source: RegExp;
  readonly expected: Readonly<Record<LocaleFormatTargetLocale, RegExp>>;
  readonly alternates: Readonly<Record<LocaleFormatTargetLocale, readonly { readonly form: string; readonly pattern: RegExp }[]>>;
}

/** Expressões compiladas uma vez por módulo: a revisão recalcula as dicas a cada tecla. */
const COMPILED_TERMS: readonly CompiledTerm[] = TERMS.map(term => ({
  term,
  source: termPattern(term['pt-BR']),
  expected: { 'en-US': termPattern(term['en-US']), 'es-ES': termPattern(term['es-ES']) },
  alternates: {
    'en-US': (term.alternates?.['en-US'] ?? []).map(form => ({ form, pattern: termPattern(form) })),
    'es-ES': (term.alternates?.['es-ES'] ?? []).map(form => ({ form, pattern: termPattern(form) })),
  },
}));

const wholeWord = (word: string, flags: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, flags);

const COMPILED_MISSPELLINGS: readonly { readonly wrong: string; readonly right: string; readonly pattern: RegExp }[] =
  MISSPELLINGS.map(([wrong, right]) => ({ wrong, right, pattern: wholeWord(wrong, 'giu') }));

/**
 * Para cada termo do glossário presente no original cuja forma esperada NÃO aparece na
 * tradução, devolve o termo de origem, o esperado e (quando reconhecida) a forma usada.
 */
export function findGlossaryHints(sourceText: string, translatedText: string, targetLocale: LocaleFormatTargetLocale): GlossaryHint[] {
  const source = normalizeGlossaryText(sourceText);
  const translated = normalizeGlossaryText(translatedText);
  const hints: GlossaryHint[] = [];
  for (const compiled of COMPILED_TERMS) {
    if (!compiled.source.test(source)) continue;
    const expected = compiled.term[targetLocale];
    if (compiled.expected[targetLocale].test(translated)) continue;
    const found = compiled.alternates[targetLocale].find(alternate => alternate.pattern.test(translated))?.form;
    hints.push(found ? { sourceTerm: compiled.term['pt-BR'], expected, found: findOriginalSpelling(translatedText, found) ?? found }
      : { sourceTerm: compiled.term['pt-BR'], expected });
  }
  return hints;
}

/** Devolve como a forma aparece no texto traduzido (caixa e acentos originais). */
function findOriginalSpelling(text: string, normalizedTerm: string): string | undefined {
  const words = normalizeGlossaryText(normalizedTerm).split(' ');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${words.map(word => {
    const letters = [...word].map(letter => `${escapeRegExp(letter)}[\\u0300-\\u036f]*`).join('');
    return `${letters}s?`;
  }).join('\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
  const match = pattern.exec(text.normalize('NFD'));
  return match ? match[0].normalize('NFC') : undefined;
}

/**
 * Troca determinística de uma dica do glossário: só quando a forma encontrada aparece uma
 * única vez. Preserva a caixa da ocorrência (minúsculas, Inicial Maiúscula ou MAIÚSCULAS).
 */
export function applyGlossaryHint(text: string, hint: GlossaryHint): string | undefined {
  if (!hint.found) return undefined;
  const matches = [...text.matchAll(wholeWord(hint.found, 'giu'))];
  if (matches.length !== 1) return undefined;
  const [match] = matches;
  const index = match.index ?? 0;
  return text.slice(0, index) + matchCase(match[0], hint.expected) + text.slice(index + match[0].length);
}

/** Termo do glossário (Inicial Maiúscula) na caixa da ocorrência: minúsculas, MAIÚSCULAS ou como está no glossário. */
export function matchCase(sample: string, replacement: string): string {
  const letters = sample.replace(/[^\p{L}]/gu, '');
  if (letters && letters === letters.toLocaleUpperCase('en-US')) return replacement.toLocaleUpperCase('en-US');
  if (letters && letters === letters.toLocaleLowerCase('en-US')) return replacement.toLocaleLowerCase('en-US');
  return replacement;
}

/** Palavra em minúsculas na caixa da ocorrência: minúsculas, Inicial Maiúscula ou MAIÚSCULAS. */
function capitalizeLike(sample: string, lower: string): string {
  const letters = sample.replace(/[^\p{L}]/gu, '');
  if (letters && letters === letters.toLocaleUpperCase('en-US')) return lower.toLocaleUpperCase('en-US');
  if (letters && letters.charAt(0) === letters.charAt(0).toLocaleUpperCase('en-US')) return lower.charAt(0).toLocaleUpperCase('en-US') + lower.slice(1);
  return lower;
}

/** Erros de grafia conhecidos (inglês) presentes no texto, com a correção na mesma caixa. */
export function findKnownMisspellings(text: string): KnownMisspelling[] {
  const results: KnownMisspelling[] = [];
  for (const { pattern, right } of COMPILED_MISSPELLINGS) {
    for (const match of text.matchAll(pattern)) {
      results.push({ wrong: match[0], right: capitalizeLike(match[0], right), index: match.index ?? 0 });
    }
  }
  return results.sort((left, right) => left.index - right.index);
}

/** Corrige todas as ocorrências da mesma grafia errada, cada uma na sua caixa. */
export function applyKnownMisspelling(text: string, misspelling: KnownMisspelling): string {
  const right = misspelling.right.toLocaleLowerCase('en-US');
  return text.replace(wholeWord(misspelling.wrong, 'giu'), found => capitalizeLike(found, right));
}
