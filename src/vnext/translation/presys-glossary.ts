/**
 * FR-87 · Glossário técnico PRESYS versionado no repositório (fonte única).
 *
 * Usado nos dois lados:
 * - no navegador, por `glossary.ts` (avisos e trocas na revisão da tradução);
 * - no servidor, pelo gateway `vnext-translation-provider`, que (1) manda ao Gemini só os
 *   termos deste glossário que aparecem no lote, e (2) troca marcas e modelos por marcadores
 *   antes de chamar o modelo e os devolve byte a byte depois — o modelo nunca os vê, então
 *   não tem como traduzi-los.
 *
 * Arquivo PURO e SEM imports: o Deno empacota este arquivo como está (caminho `.ts`
 * explícito no gateway), igual a `language-registry.ts`.
 *
 * Mudou algum termo, marca ou modelo? Suba `PRESYS_GLOSSARY_VERSION`: a versão vai no
 * pedido ao Gemini e fica registrada em cada tradução gerada.
 */

export const PRESYS_GLOSSARY_VERSION = 'presys-glossary-v1' as const;

export type PresysGlossaryTargetLocale = 'en-US' | 'es-ES';

export interface PresysGlossaryTerm {
  readonly 'pt-BR': string;
  readonly 'en-US': string;
  readonly 'es-ES': string;
  /** Formas que a tradução costuma usar no lugar do termo esperado (para oferecer a troca). */
  readonly alternates?: Partial<Record<PresysGlossaryTargetLocale, readonly string[]>>;
}

/**
 * Termos fixos PT/EN/ES. Grafias em inglês conferidas nos folders reais
 * (TA-25N/35N/50N, PCON-Y17, PCON-Y18 LP, Kompressor Y18).
 */
export const PRESYS_GLOSSARY_TERMS: readonly PresysGlossaryTerm[] = Object.freeze([
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
export const PRESYS_KNOWN_MISSPELLINGS: readonly (readonly [string, string])[] = Object.freeze([
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

/**
 * Marcas, linhas e modelos que nunca se traduzem (ficam byte a byte, na caixa em que vieram).
 * Os nomes com versão ("PCON-Y18 LP") vêm antes dos curtos ("PCON-Y18") na busca.
 */
export const PRESYS_KEEP_NAMES: readonly string[] = Object.freeze([
  'PRESYS', 'ISOPLAN', 'Kompressor',
  'PCON-Y18 LP', 'PCON-Y17', 'PCON-Y18', 'PCON-HIBRIDO', 'PCON-HART', 'PCON',
  'TA-25N', 'TA-35N', 'TA-50N',
  'MCS-XV', 'ST-501', 'LC-505', 'T-500PIR',
  'PSV Inspector', 'PSV',
]);

/**
 * Código de modelo genérico, em MAIÚSCULAS, com hífen e pelo menos um dígito:
 * "TA-25N", "PCON-Y17", "ST-501", "T-500PIR", "KOMPRESSOR-Y18", "XYZ-12/A". Sem dígito ("CA-CC") não entra:
 * pode ser abreviação que se traduz.
 */
const MODEL_CODE = String.raw`[A-Z][A-Z0-9]{0,11}(?:-[A-Z0-9]+)+(?:[./][A-Z0-9]+)*`;
const HAS_DIGIT = /\d/u;

/** Escape válido com a flag `u` (hífen não precisa, e `\-` fora de classe é erro). */
export function escapeGlossaryRegExp(text: string): string {
  return text.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
}

const KEEP_NAMES_SORTED = [...PRESYS_KEEP_NAMES].sort((left, right) => right.length - left.length);
const KEEP_PATTERN = new RegExp(
  String.raw`(?<![\p{L}\p{N}_-])(?:(${KEEP_NAMES_SORTED.map(escapeGlossaryRegExp).join('|')})|(${MODEL_CODE}))(?![\p{L}\p{N}_-])`,
  'giu',
);
/** Marcadores de dado técnico do navegador ([[VNEXT_TECH_…]]) e do servidor ([[VNEXT_KEEP_…]]). */
const ANY_PLACEHOLDER = /\[\[VNEXT_[A-Z0-9_]+\]\]/g;

export interface KeepTermSpan {
  readonly start: number;
  readonly end: number;
  readonly value: string;
}

/**
 * Marcas e modelos presentes no texto, na ordem, sem olhar dentro de marcadores.
 * Nome da lista: qualquer caixa ("Presys"). Código genérico: só MAIÚSCULAS e com dígito.
 */
export function findKeepTerms(text: string): readonly KeepTermSpan[] {
  const blocked: Array<readonly [number, number]> = [];
  for (const match of text.matchAll(ANY_PLACEHOLDER)) blocked.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
  const spans: KeepTermSpan[] = [];
  for (const match of text.matchAll(KEEP_PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (blocked.some(([from, to]) => start < to && end > from)) continue;
    // O código genérico é sensível à caixa (a flag `i` vale para a lista de nomes).
    if (match[1] === undefined && (!HAS_DIGIT.test(match[0]) || match[0] !== match[0].toLocaleUpperCase('en-US'))) continue;
    spans.push({ start, end, value: match[0] });
  }
  return spans;
}

export interface KeepTermProtection {
  /** Texto com cada marca/modelo trocado por `[[VNEXT_KEEP_001]]`, `[[VNEXT_KEEP_002]]`… */
  readonly text: string;
  readonly terms: readonly { readonly placeholder: string; readonly value: string }[];
}

export const KEEP_PLACEHOLDER_PREFIX = '[[VNEXT_KEEP_';
export const KEEP_PLACEHOLDER = /\[\[VNEXT_KEEP_\d{3,}\]\]/g;

/**
 * Troca marcas e modelos por marcadores antes de chamar o modelo. Um texto que já traga
 * "[[VNEXT_KEEP_" escrito pela pessoa não é tocado (sem colisão possível).
 */
export function protectKeepTerms(text: string): KeepTermProtection {
  if (text.includes(KEEP_PLACEHOLDER_PREFIX)) return { text, terms: [] };
  const spans = findKeepTerms(text);
  if (spans.length === 0) return { text, terms: [] };
  const terms: { placeholder: string; value: string }[] = [];
  let output = '';
  let cursor = 0;
  spans.forEach((span, index) => {
    const placeholder = `${KEEP_PLACEHOLDER_PREFIX}${String(index + 1).padStart(3, '0')}]]`;
    terms.push({ placeholder, value: span.value });
    output += text.slice(cursor, span.start) + placeholder;
    cursor = span.end;
  });
  return { text: output + text.slice(cursor), terms };
}

/**
 * Devolve as marcas e modelos no texto traduzido. `undefined` quando o modelo perdeu,
 * repetiu ou inventou um marcador: a resposta inteira é recusada, nada é adivinhado.
 */
export function restoreKeepTerms(translated: string, protection: KeepTermProtection): string | undefined {
  const found = translated.match(KEEP_PLACEHOLDER) ?? [];
  if (found.length !== protection.terms.length) return undefined;
  const expected = new Set(protection.terms.map(term => term.placeholder));
  if (new Set(found).size !== found.length || found.some(placeholder => !expected.has(placeholder))) return undefined;
  const byPlaceholder = new Map(protection.terms.map(term => [term.placeholder, term.value]));
  const restored = translated.replace(KEEP_PLACEHOLDER, placeholder => byPlaceholder.get(placeholder)!);
  return restored.includes(KEEP_PLACEHOLDER_PREFIX) ? undefined : restored;
}

/** Sem acento, sem caixa e com espaços simples, para comparar termos. */
export function normalizeGlossaryText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
}

/**
 * Singular e plural de uma palavra normalizada: o "s" simples e os irregulares dos termos
 * (accessory/accessories, dimensão/dimensões, opcional/opcionais, dimensión/dimensiones).
 */
function wordForms(word: string): string {
  if (word.endsWith('ies')) return `${escapeGlossaryRegExp(word.slice(0, -3))}(?:y|ies)`;
  if (word.endsWith('oes')) return `${escapeGlossaryRegExp(word.slice(0, -3))}(?:ao|oes)`;
  if (word.endsWith('ones')) return `${escapeGlossaryRegExp(word.slice(0, -4))}(?:on|ones)`;
  if (word.endsWith('ais')) return `${escapeGlossaryRegExp(word.slice(0, -3))}(?:al|ais)`;
  return `${escapeGlossaryRegExp(word.endsWith('s') ? word.slice(0, -1) : word)}s?`;
}

/** Expressão para o termo normalizado como palavras inteiras; a última palavra aceita singular/plural. */
export function glossaryTermPattern(term: string): RegExp {
  const words = normalizeGlossaryText(term).split(' ');
  const last = words.length - 1;
  const parts = words.map((word, index) => (index === last ? wordForms(word) : escapeGlossaryRegExp(word)));
  return new RegExp(`(?<![\\p{L}\\p{N}])${parts.join('\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
}

const SOURCE_PATTERNS: readonly { readonly term: PresysGlossaryTerm; readonly pattern: RegExp }[] =
  PRESYS_GLOSSARY_TERMS.map(term => ({ term, pattern: glossaryTermPattern(term['pt-BR']) }));

export interface PresysGlossaryPromptEntry {
  readonly source: string;
  readonly target: string;
}

/**
 * Só os termos do glossário que aparecem nos textos (sem acento/caixa, singular ou plural),
 * na ordem do glossário: o pedido ao Gemini não leva o glossário inteiro a cada lote.
 */
export function glossaryEntriesForTexts(texts: readonly string[], targetLocale: PresysGlossaryTargetLocale): readonly PresysGlossaryPromptEntry[] {
  const normalized = texts.map(normalizeGlossaryText);
  return SOURCE_PATTERNS
    .filter(({ pattern }) => normalized.some(text => pattern.test(text)))
    .map(({ term }) => ({ source: term['pt-BR'], target: term[targetLocale] }));
}
