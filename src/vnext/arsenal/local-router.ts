import type { CatalogDocument, EditorialObject, Page } from '../domain/editorial-model';
import { effectiveTextStyle } from '../editor/text-style-authoring';
import { EDIT_INTENT_PALETTE, type EditIntentColor } from '../ai-catalog/edit-intent-contract';
import { PRESYS_ARCHETYPES, type PresysArchetypeId } from '../library/presys-archetypes';
import { DEFAULT_NEW_TABLE_SIZE, MAX_NEW_TABLE_COLUMNS, MAX_NEW_TABLE_ROWS } from '../app/editor-defaults';
import {
  ARSENAL_PAYLOAD_SCHEMA_VERSION, type ArsenalCategory, type ArsenalPresetKind, type ArsenalPresetSummary, type ArsenalScope,
} from './contracts';

/**
 * Onda 4.5 — the assistant's router WITHOUT AI. Before a typed request goes to the AI (edit_intent or composer), this
 * module tries to understand it here, for free: informal Portuguese ("bota uma tabela com 5 linhas", "põe aquela tabela
 * de especificações de 3 modelos", "insere o cabeçalho padrão", "nova página de acessórios", "aumenta o título").
 *
 * 1. Normalization: lower case, no accents, plurals to singular, slang verbs ("bota", "põe", "coloca", "mete"…) to one
 *    meaning, numbers written in words to digits ("cinco linhas" → 5 linhas).
 * 2. Matching against (a) the arsenal — names, tags, synonyms and category of the saved presets — and (b) a SMALL set of
 *    deterministic actions the editor already has: a new N×M table, a PRESYS model page P1–P9, and simple style changes
 *    (letter size, bold, colour, size) of the selection or of the one obvious object ("o título").
 * 3. A confidence: low confidence, a technical number, a text to write, a translation, files, two things at once — all go
 *    to the AI as before. The router never writes a technical value and never changes the catalog itself: it only says
 *    what could be done, and the assistant shows it as a card ("Achei no arsenal, sem usar IA" / "Vou fazer isto").
 *
 * Pure: no network, no React, no AI.
 */

// ---------------------------------------------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------------------------------------------

export type LocalStyleChange =
  | { readonly kind: 'text_size'; readonly size: 'larger' | 'smaller' }
  | { readonly kind: 'text_weight'; readonly weight: 'bold' | 'regular' }
  | { readonly kind: 'set_color'; readonly color: EditIntentColor }
  | { readonly kind: 'resize'; readonly size: 'larger' | 'smaller' };

export type LocalAction =
  /** A new empty table on the open page (the first row is the header when there are two or more rows). */
  | { readonly type: 'table.new'; readonly rows: number; readonly columns: number; readonly models?: number }
  /** A PRESYS model page (FR-80), right after the open page. */
  | { readonly type: 'page.template'; readonly archetypeId: PresysArchetypeId; readonly templateId: string; readonly label: string }
  /** A style change of one object, shown as the "Vou fazer isto" card of the conversation that edits. */
  | { readonly type: 'style'; readonly objectId: string; readonly change: LocalStyleChange };

export type LocalRoutablePreset = Pick<ArsenalPresetSummary,
  'id' | 'name' | 'category' | 'kind' | 'tags' | 'synonyms' | 'useCount' | 'payloadSchemaVersion'>
  & { readonly scope?: ArsenalScope };

export type LocalChoice =
  | {
    readonly kind: 'preset';
    readonly presetId: string;
    readonly name: string;
    readonly category: ArsenalCategory;
    readonly presetKind: ArsenalPresetKind;
    readonly scope?: ArsenalScope;
    readonly score: number;
  }
  | { readonly kind: 'action'; readonly action: LocalAction; readonly score: number };

export type LocalDeclineReason =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'QUESTION'
  /** Writing, translating, deleting, moving… — the conversation that edits does that. */
  | 'NOT_LOCAL'
  /** A number that is not a row/column/model count: possibly a technical value, never handled here. */
  | 'TECHNICAL_VALUES'
  /** A style change whose object is not clear (nothing selected and no single obvious object). */
  | 'STYLE_TARGET_UNCLEAR'
  | 'TABLE_SIZE_LIMIT'
  /** Two things at once, or words the router does not know. */
  | 'NOT_UNDERSTOOD'
  /** "aquela tabela…" and nothing like it in the arsenal: the AI (with the arsenal index) decides. */
  | 'NOT_IN_ARSENAL'
  | 'LOW_CONFIDENCE';

export type LocalRoute =
  | { readonly kind: 'none'; readonly reason: LocalDeclineReason }
  | {
    readonly kind: 'local';
    readonly primary: LocalChoice;
    /** "Ver outros": other presets or actions that also fit, best first. */
    readonly others: readonly LocalChoice[];
    readonly confidence: number;
  };

export interface LocalRouteContext {
  readonly document: CatalogDocument;
  readonly activePageId?: string;
  readonly selectedObjectIds?: readonly string[];
  /** The arsenal the person can see (team + built-in), without payloads. Absent: only the deterministic actions. */
  readonly presets?: readonly LocalRoutablePreset[];
  /** The last answer came from the conversation that edits (a question or a card): only a sure match stays here. */
  readonly followUp?: boolean;
}

/** Longer requests are compositions ("crie uma página comparando…"): the AI is better at those. */
export const LOCAL_ROUTER_MAX_CHARS = 120;
export const LOCAL_ROUTER_THRESHOLDS = Object.freeze({
  /** Lowest confidence answered here. */
  minimum: 0.6,
  /** After a question of the conversation that edits, only a sure match is answered here. */
  followUp: 0.85,
  /** A preset this good wins over a deterministic action. */
  strongPreset: 0.7,
  /** "aquela tabela…": a weaker preset match still counts. */
  savedHintPreset: 0.55,
  /** Shown under "Ver outros". */
  alternative: 0.4,
  maxOthers: 4,
});

const none = (reason: LocalDeclineReason): LocalRoute => ({ kind: 'none', reason });

// ---------------------------------------------------------------------------------------------------------------
// Lexicon (normalized: lower case, no accents)
// ---------------------------------------------------------------------------------------------------------------

const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean));

/** "bota", "põe", "coloca", "mete"… all mean "put this in". */
const INSERT_VERBS = words(`bota botar bote boto poe por ponha ponho coloca colocar coloque coloco mete meter meta insere
  inserir insira adiciona adicionar adicione acrescenta acrescentar acrescente inclui incluir inclua cria criar crie faz fazer
  faca gera gerar gere quero queria preciso precisava precisamos manda mandar mande joga jogar jogue traz trazer traga usa usar
  use aplica aplicar aplique monta montar monte puxa puxar puxe pega pegar pegue`);
const NEW_WORDS = words('nova novo outra outro');
const MAKE_VERBS = words('deixa deixar deixe deixo fica ficar fique torna tornar torne');
const LARGER_WORDS = words('aumenta aumentar aumente aumentem amplia ampliar amplie cresce crescer cresca maior');
const SMALLER_WORDS = words('diminui diminuir diminua reduz reduzir reduza encolhe encolher encolha menor');
const BOLD_WORDS = words('negrito negrita negritar negrite');
const UNBOLD_WORDS = words('tira tire tirar remove remova sem desliga');
const COLOR_VERBS = words('cor pinta pintar pinte colore colorir');
/** Changes the conversation that edits (or a person) does: never answered here. */
const EDIT_VERBS = words(`troca trocar troque troco muda mudar mude altera alterar altere substitui substituir substitua
  escreve escrever escreva digita digitar digite renomeia renomear renomeie traduz traduzir traduza corrige corrigir corrija
  apaga apagar apague remove remover remova exclui excluir exclua deleta deletar delete tira tirar tire move mover mova
  arrasta arrastar alinha alinhar alinhe centraliza centralizar centralize duplica duplicar duplique copia copiar copie
  preenche preencher preencha completa completar complete separa separar separe divide dividir divida junta juntar junte
  mescla mesclar troque`);
/** Words about files, translation or the whole catalog: other flows. */
const OTHER_FLOW_WORDS = words(`pdf arquivo anexo planilha excel rascunho esboco desenho ingles espanhol frances italiano
  alemao polones traducao catalogo folder`);
const QUESTION_STARTS = words('qual quais quanto quantos quantas onde quando porque como');
const SAVED_HINTS = words('aquela aquele aquelas aqueles salvo salva salvos salvas guardado guardada guardados arsenal sempre habitual costume nosso nossa');
const STOPWORDS = words(`a o as os um uma uns umas de do da dos das d com para pra pro pros pras no na nos nas num numa em e ou
  que por favor pf pfv aqui ai ali la isso isto esse essa esses essas este esta estes estas eu me mim voce vc voces tu te meu
  minha meus minhas seu sua so tambem mais bem pouco pouquinho ja agora logo entao oi ola obrigado obrigada valeu pode poderia
  consegue conseguiria da possivel tipo beleza vamos vai ir ele ela dele dela nele nela sobre la tudo bom bem ver favor
  dentro atual aberta aberto selecionado selecionada selecionados marcado marcada assim jeito embaixo abaixo acima cima baixo`);
/** Words that only point at the selection ("este texto", "o selecionado"). */
const NUMBER_WORDS: Readonly<Record<string, number>> = Object.freeze({
  dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20,
  trinta: 30, quarenta: 40, cinquenta: 50,
});
/** "um"/"uma" are numbers only before a count noun ("uma coluna"); otherwise they are articles ("uma página"). */
const COUNT_NOUNS = words('linha coluna');

/** Canonical nouns (after singular): synonyms → one word. */
const NOUN_SYNONYMS: Readonly<Record<string, string>> = Object.freeze({
  folha: 'pagina', pag: 'pagina', pagina: 'pagina',
  frente: 'capa',
  topo: 'cabecalho', header: 'cabecalho',
  footer: 'rodape',
  title: 'titulo', manchete: 'titulo',
  fonte: 'letra',
  imagem: 'foto', figura: 'foto', fotografia: 'foto',
  grade: 'tabela',
  produto: 'modelo',
});

const TARGET_NOUNS = words('titulo subtitulo texto letra foto logo logotipo tabela forma caixa retangulo faixa');
const SIZE_NOUNS = words('letra tamanho');

/** Category words of the arsenal (a mention counts as a category hit). */
const CATEGORY_NOUNS: Readonly<Record<ArsenalCategory, readonly string[]>> = Object.freeze({
  capas: ['capa'],
  tabelas: ['tabela'],
  cabecalhos: ['cabecalho'],
  rodapes: ['rodape'],
  paginas: ['pagina'],
  estilos: ['estilo'],
});

/** Keywords of the PRESYS model pages (FR-80), singular and without accents. */
const ARCHETYPE_KEYWORDS: Readonly<Record<PresysArchetypeId, readonly string[]>> = Object.freeze({
  P1: ['capa', 'primeira'],
  P2: ['visao', 'apresentacao', 'destaque', 'introducao'],
  P3: ['recurso', 'aplicacao', 'funcionalidade', 'vantagem', 'beneficio'],
  P4: ['especificacao', 'comparacao', 'comparativo', 'comparativa', 'ficha', 'tecnica'],
  P5: ['faixa', 'exatidao', 'precisao', 'entrada', 'dado'],
  P6: ['codigo', 'pedido', 'encomenda', 'pedir'],
  P7: ['fornecimento', 'acessorio', 'kit', 'acompanha', 'incluso'],
  P8: ['inserto', 'furo'],
  P9: ['contracapa', 'verso', 'institucional', 'distribuidor', 'ultima'],
});
/** Words that may sit next to a model page without changing it. */
const PAGE_NEUTRAL = words('pagina nova novo modelo presys padrao vazia vazio simples geral');
/** Words of the size of a new table. */
const TABLE_STRUCTURE = words('tabela linha coluna modelo nova novo simples vazia vazio pequena x');
/**
 * Words that describe what the table is for. With a size ("de especificações de 3 modelos") the empty table is still
 * the answer; without one ("crie uma tabela comparativa") the AI designs columns and rows better, so it goes there.
 */
const TABLE_DESCRIPTIVE = words('especificacao tecnica ficha comparativa comparativo comparacao grande padrao');

// ---------------------------------------------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------------------------------------------

/** Lower case, no accents, "4x3" → "4 x 3", punctuation to spaces (decimal separators between digits stay). */
export function normalizeRequestText(text: string): string {
  return text
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1 x ')
    .replace(/[^\p{L}\p{N}\s.,]/gu, ' ')
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plural to singular for the words of this lexicon ("especificacoes" → "especificacao", "imagens" → "imagem"). */
export function singularize(word: string): string {
  if (word.length <= 3 || /\d/.test(word)) return word;
  if (word.endsWith('oes') || word.endsWith('aes')) return word.slice(0, -3) + 'ao';
  if (word.endsWith('eis')) return word.slice(0, -3) + 'el';
  if (word.endsWith('ais')) return word.slice(0, -3) + 'al';
  if (word.endsWith('ns')) return word.slice(0, -2) + 'm';
  if (word.endsWith('res') && word.length >= 5) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) return word.slice(0, -1);
  return word;
}

const NUMBER_TOKEN = /^\d+(?:[.,]\d+)*$/;

interface Token {
  /** Normalized, singular and canonical word, or the digits of a number. */
  readonly word: string;
  readonly number?: number;
  /** A word of a colour ("azul", "claro" in "azul claro"). */
  readonly color?: true;
  /** Position in `LocalRequestAnalysis.words`. */
  readonly index: number;
}

export interface LocalRequestAnalysis {
  readonly normalized: string;
  /** Every word after normalization, singular and synonyms (numbers as digits). */
  readonly words: readonly string[];
  /** Words that carry meaning: no stopwords, no verbs, no hints. */
  readonly content: readonly Token[];
  readonly numbers: readonly Token[];
  readonly insert: boolean;
  readonly isNew: boolean;
  readonly larger: boolean;
  readonly smaller: boolean;
  readonly bold: boolean;
  readonly unbold: boolean;
  readonly color?: EditIntentColor;
  readonly colorVerb: boolean;
  readonly make: boolean;
  readonly editVerb: boolean;
  readonly otherFlow: boolean;
  readonly question: boolean;
  readonly savedHint: boolean;
  /** "P4", "modelo P7". */
  readonly archetypeCode?: PresysArchetypeId;
}

const PALETTE_KEYS = Object.keys(EDIT_INTENT_PALETTE) as EditIntentColor[];
const BRAND_COLOR: EditIntentColor = 'azul_marinho';

/** "azul claro", "azul bem claro", "cor da marca" → a key of the conversation's palette. */
function colorAt(raw: readonly string[], index: number): { color: EditIntentColor; length: number } | undefined {
  for (const length of [3, 2, 1]) {
    const key = raw.slice(index, index + length).join('_');
    if ((PALETTE_KEYS as string[]).includes(key)) return { color: key as EditIntentColor, length };
  }
  if (raw[index] === 'marca' || (raw[index] === 'cor' && raw[index + 1] === 'da' && raw[index + 2] === 'marca')) {
    return { color: BRAND_COLOR, length: raw[index] === 'marca' ? 1 : 3 };
  }
  return undefined;
}

/** Reads a request once: words, numbers, verbs and hints. */
export function analyzeLocalRequest(message: string): LocalRequestAnalysis {
  const normalized = normalizeRequestText(message);
  const raw = normalized ? normalized.split(' ') : [];
  const all: string[] = [];
  const content: Token[] = [];
  const numbers: Token[] = [];
  let insert = false, isNew = false, larger = false, smaller = false, bold = false, unbold = false, colorVerb = false;
  let make = false, editVerb = false, otherFlow = false, savedHint = false;
  let color: EditIntentColor | undefined;
  let archetypeCode: PresysArchetypeId | undefined;
  const question = QUESTION_STARTS.has(raw[0] ?? '') || /^o que\b/.test(normalized);

  for (let index = 0; index < raw.length; index += 1) {
    const word = raw[index];
    // Colours first: "azul claro" is one value; "cor da marca" is the brand colour. Their words still count for the
    // arsenal ("Capa azul simples").
    const found = colorAt(raw, index);
    if (found) {
      color = found.color;
      if (word === 'cor') colorVerb = true;
      for (const part of raw.slice(index, index + found.length)) {
        if (STOPWORDS.has(part) || part === 'cor') { all.push(part); continue; }
        content.push({ word: part, color: true, index: all.length });
        all.push(part);
      }
      index += found.length - 1;
      continue;
    }
    if (NUMBER_TOKEN.test(word)) {
      const token = { word, number: Number(word.replace(',', '.')), index: all.length };
      numbers.push(token); content.push(token); all.push(word);
      continue;
    }
    // Numbers in words: "vinte e cinco", "cinco", "uma coluna".
    if (NUMBER_WORDS[word] !== undefined || ((word === 'um' || word === 'uma') && COUNT_NOUNS.has(singularize(raw[index + 1] ?? '')))) {
      let value = NUMBER_WORDS[word] ?? 1;
      const unit = NUMBER_WORDS[raw[index + 2] ?? ''];
      if (value >= 20 && raw[index + 1] === 'e' && unit !== undefined && unit < 10) {
        value += unit;
        index += 2;
      }
      const token = { word: String(value), number: value, index: all.length };
      numbers.push(token); content.push(token); all.push(token.word);
      continue;
    }
    const code = /^p([1-9])$/.exec(word);
    if (code) { archetypeCode = `P${code[1]}` as PresysArchetypeId; all.push(word); continue; }
    const single = singularize(word);
    const canonical = NOUN_SYNONYMS[single] ?? single;
    const position = all.length;
    all.push(canonical);
    if (EDIT_VERBS.has(word)) editVerb = true;
    if (UNBOLD_WORDS.has(word)) unbold = true;
    if (INSERT_VERBS.has(word)) { insert = true; continue; }
    if (NEW_WORDS.has(word)) { isNew = true; continue; }
    if (MAKE_VERBS.has(word)) { make = true; continue; }
    if (LARGER_WORDS.has(word)) { larger = true; continue; }
    if (SMALLER_WORDS.has(word)) { smaller = true; continue; }
    if (BOLD_WORDS.has(word)) { bold = true; continue; }
    if (COLOR_VERBS.has(word) || COLOR_VERBS.has(single)) { colorVerb = true; continue; }
    if (SAVED_HINTS.has(word)) { savedHint = true; continue; }
    if (OTHER_FLOW_WORDS.has(canonical)) otherFlow = true;
    if (EDIT_VERBS.has(word) || UNBOLD_WORDS.has(word) || STOPWORDS.has(word)) continue;
    content.push({ word: canonical, index: position });
  }
  return {
    normalized, words: all, content, numbers, insert, isNew, larger, smaller, bold, unbold, color, colorVerb, make,
    editVerb, otherFlow, question, savedHint, archetypeCode,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Deterministic actions
// ---------------------------------------------------------------------------------------------------------------

interface Matched { readonly choice: LocalChoice & { kind: 'action' }; readonly consumed: ReadonlySet<number> }
type Attempt = Matched | { readonly decline: LocalDeclineReason } | undefined;

const contentWords = (analysis: LocalRequestAnalysis) => analysis.content.filter(token => token.number === undefined);
const has = (analysis: LocalRequestAnalysis, word: string) => analysis.content.some(token => token.word === word);

/** "tabela com 5 linhas", "tabela 4 x 3", "tabela de 3 colunas e 8 linhas", "tabela de especificações de 3 modelos". */
function matchNewTable(analysis: LocalRequestAnalysis): Attempt {
  if (!has(analysis, 'tabela') || has(analysis, 'pagina')) return undefined;
  if (analysis.archetypeCode) return { decline: 'NOT_UNDERSTOOD' };
  const consumed = new Set<number>();
  /** The first meaningful word after a number ("5 linhas", "3 colunas", "3 modelos"). */
  const nounAfter = (token: Token) => analysis.content.find(entry => entry.index > token.index && entry.number === undefined)?.word;
  let rows: number | undefined, columns: number | undefined, models: number | undefined;
  analysis.numbers.forEach((token, position) => {
    if (consumed.has(token.index) || token.number === undefined || !Number.isInteger(token.number)) return;
    // "4 x 3" / "4 por 3": rows × columns.
    const following = analysis.numbers[position + 1];
    const between = analysis.words[token.index + 1];
    if (following && following.index === token.index + 2 && (between === 'x' || between === 'por') && rows === undefined && columns === undefined) {
      rows = token.number; columns = following.number;
      consumed.add(token.index); consumed.add(following.index);
      return;
    }
    const noun = nounAfter(token);
    if (noun === 'linha' && rows === undefined) { rows = token.number; consumed.add(token.index); }
    else if (noun === 'coluna' && columns === undefined) { columns = token.number; consumed.add(token.index); }
    else if (noun === 'modelo' && models === undefined) { models = token.number; consumed.add(token.index); }
  });
  if (models !== undefined && columns === undefined) columns = models + 1;
  rows ??= DEFAULT_NEW_TABLE_SIZE.rows;
  columns ??= DEFAULT_NEW_TABLE_SIZE.columns;
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || rows > MAX_NEW_TABLE_ROWS
    || columns < 1 || columns > MAX_NEW_TABLE_COLUMNS) return { decline: 'TABLE_SIZE_LIMIT' };
  // Any other word ("tabela de ensaios", "do TA-25N") is content the empty table cannot express: the AI does it.
  const unknown = contentWords(analysis).filter(token => !TABLE_STRUCTURE.has(token.word) && !TABLE_DESCRIPTIVE.has(token.word));
  if (unknown.length > 0) return { decline: 'NOT_UNDERSTOOD' };
  const verb = analysis.insert || analysis.isNew;
  const sized = consumed.size > 0;
  const described = contentWords(analysis).some(token => TABLE_DESCRIPTIVE.has(token.word));
  // A clear verb and a size: sure. Only "tabela": the editor's default table (6 × 3), still a sensible answer.
  // A description without a size: below the minimum, the AI designs it (or a saved table of the arsenal wins).
  const score = verb ? (sized ? 0.92 : described ? 0.55 : 0.8) : (sized ? 0.75 : 0.5);
  return {
    choice: { kind: 'action', score, action: { type: 'table.new', rows, columns, ...(models !== undefined ? { models } : {}) } },
    consumed,
  };
}

/** "nova página de acessórios", "insere uma capa", "põe a contracapa", "página P4". */
function matchModelPage(analysis: LocalRequestAnalysis): Attempt {
  const page = has(analysis, 'pagina');
  const code = analysis.archetypeCode;
  const coverWord = has(analysis, 'capa') || has(analysis, 'contracapa');
  if (!page && !code && !coverWord) return undefined;
  if (has(analysis, 'tabela')) return { decline: 'NOT_UNDERSTOOD' };
  const hits = new Map<PresysArchetypeId, number>();
  for (const token of contentWords(analysis)) {
    for (const [id, keywords] of Object.entries(ARCHETYPE_KEYWORDS) as [PresysArchetypeId, readonly string[]][]) {
      if (keywords.includes(token.word)) hits.set(id, (hits.get(id) ?? 0) + 1);
    }
  }
  let archetype: PresysArchetypeId | undefined = code;
  if (!archetype) {
    const ranked = [...hits].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0) return page ? { decline: 'NOT_UNDERSTOOD' } : undefined;
    // Two different model pages asked at once ("uma capa e uma apresentação"): the AI composes that.
    if (ranked.length > 1) return { decline: 'NOT_UNDERSTOOD' };
    archetype = ranked[0][0];
  } else if (hits.size > 0 && !hits.has(code!)) return { decline: 'NOT_UNDERSTOOD' };
  // Any other word ("capa para o TA-25N", "página de contato") is content the model page cannot write: the AI does it.
  const keywords = ARCHETYPE_KEYWORDS[archetype];
  const unknown = contentWords(analysis).filter(token => !keywords.includes(token.word) && !PAGE_NEUTRAL.has(token.word));
  if (unknown.length > 0) return { decline: 'NOT_UNDERSTOOD' };
  const definition = PRESYS_ARCHETYPES.find(entry => entry.id === archetype)!;
  const verb = analysis.insert || analysis.isNew;
  const score = (verb ? 0.85 : 0.7) + (code ? 0.08 : 0);
  return {
    choice: { kind: 'action', score, action: { type: 'page.template', archetypeId: archetype, templateId: definition.templateId, label: definition.label } },
    consumed: new Set(),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Style of the selection (or of the one obvious object)
// ---------------------------------------------------------------------------------------------------------------

interface Located { readonly object: EditorialObject; readonly page: Page }

function locate(document: CatalogDocument, objectId: string): Located | undefined {
  for (const page of document.pages) {
    for (const object of page.objects) {
      if (object.id === objectId) return { object, page };
      if (object.type === 'group') {
        const child = object.objects.find(entry => entry.id === objectId);
        if (child) return { object: child, page };
      }
    }
  }
  return undefined;
}

const NOUN_TYPES: Readonly<Record<string, readonly EditorialObject['type'][]>> = Object.freeze({
  titulo: ['text'], subtitulo: ['text'], texto: ['text'], letra: ['text', 'table'],
  foto: ['image', 'icon'], logo: ['image', 'icon'], logotipo: ['image', 'icon'],
  tabela: ['table'], forma: ['shape', 'polygon'], caixa: ['shape', 'polygon', 'text'], retangulo: ['shape'], faixa: ['shape', 'polygon'],
});

/** The one obvious object of the open page for a noun, when nothing is selected. */
function obviousObject(document: CatalogDocument, page: Page, noun: string): EditorialObject | undefined {
  const visible = page.objects.filter(object => !object.hidden);
  if (noun === 'titulo') {
    const texts = visible.filter((object): object is Extract<EditorialObject, { type: 'text' }> => object.type === 'text')
      .map(object => ({ object, size: effectiveTextStyle(document.style, object.style).fontSizePt ?? 0 }))
      .sort((a, b) => b.size - a.size);
    if (texts.length === 0 || (texts.length > 1 && texts[1].size === texts[0].size)) return undefined;
    return texts[0].object;
  }
  const types = noun === 'foto' ? ['image'] : noun === 'tabela' ? ['table'] : undefined;
  if (!types) return undefined;
  const candidates = visible.filter(object => types.includes(object.type));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function matchStyle(analysis: LocalRequestAnalysis, context: LocalRouteContext): Attempt {
  const sizeChange = analysis.larger !== analysis.smaller ? (analysis.larger ? 'larger' : 'smaller') : undefined;
  const wantsBold = analysis.bold;
  const wantsColor = analysis.color !== undefined && (analysis.colorVerb || analysis.make);
  if (!sizeChange && !wantsBold && !wantsColor) return undefined;
  if ([sizeChange, wantsBold, wantsColor].filter(Boolean).length > 1) return { decline: 'NOT_UNDERSTOOD' };
  // "aumenta o título para 24 pt", "a foto da página 2": a number is never decided here.
  if (analysis.numbers.length > 0) return { decline: 'TECHNICAL_VALUES' };
  const nouns = contentWords(analysis).filter(token => TARGET_NOUNS.has(token.word) || SIZE_NOUNS.has(token.word));
  const unknown = contentWords(analysis).filter(token => !token.color && !TARGET_NOUNS.has(token.word) && !SIZE_NOUNS.has(token.word)
    && token.word !== 'pagina');
  if (unknown.length > 0) return { decline: 'NOT_UNDERSTOOD' };
  const targetNoun = nouns.find(token => TARGET_NOUNS.has(token.word) && token.word !== 'letra')?.word;
  const letters = nouns.some(token => token.word === 'letra' || token.word === 'tamanho');

  const { document } = context;
  const selected = (context.selectedObjectIds ?? []).map(id => locate(document, id)).filter((entry): entry is Located => Boolean(entry));
  let target: EditorialObject | undefined;
  if (selected.length === 1) {
    target = selected[0].object;
    if (targetNoun && !(NOUN_TYPES[targetNoun] ?? []).includes(target.type)) return { decline: 'STYLE_TARGET_UNCLEAR' };
  } else if (selected.length === 0 && targetNoun) {
    const page = document.pages.find(entry => entry.id === context.activePageId) ?? document.pages[0];
    target = page ? obviousObject(document, page, targetNoun) : undefined;
  }
  if (!target || target.locked) return { decline: 'STYLE_TARGET_UNCLEAR' };

  let change: LocalStyleChange | undefined;
  if (wantsColor) {
    if (!['text', 'shape', 'polygon', 'line'].includes(target.type)) return { decline: 'STYLE_TARGET_UNCLEAR' };
    change = { kind: 'set_color', color: analysis.color! };
  } else if (wantsBold) {
    if (target.type !== 'text') return { decline: 'STYLE_TARGET_UNCLEAR' };
    change = { kind: 'text_weight', weight: analysis.unbold ? 'regular' : 'bold' };
  } else if (sizeChange) {
    if (target.type === 'text' || (letters && target.type === 'table')) change = { kind: 'text_size', size: sizeChange };
    else if (target.type === 'group') return { decline: 'STYLE_TARGET_UNCLEAR' };
    else change = { kind: 'resize', size: sizeChange };
  }
  if (!change) return { decline: 'STYLE_TARGET_UNCLEAR' };
  // Selected: sure. The one obvious object ("o título" = the biggest letters): a sensible default, a bit less sure.
  const score = selected.length === 1 ? 0.92 : 0.82;
  return { choice: { kind: 'action', score, action: { type: 'style', objectId: target.id, change } }, consumed: new Set() };
}

// ---------------------------------------------------------------------------------------------------------------
// Arsenal
// ---------------------------------------------------------------------------------------------------------------

/** Words of a text as the router compares them (normalized, singular, canonical, no stopwords). */
export function routerTerms(text: string): string[] {
  return normalizeRequestText(text).split(' ').filter(Boolean)
    .map(word => NUMBER_TOKEN.test(word) ? word : (NOUN_SYNONYMS[singularize(word)] ?? singularize(word)))
    .filter(word => word && !STOPWORDS.has(word));
}

const termsMatch = (a: string, b: string) => a === b
  || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)));

interface ScoredPreset { readonly choice: LocalChoice & { kind: 'preset' }; readonly specific: boolean }

function scorePreset(preset: LocalRoutablePreset, analysis: LocalRequestAnalysis): ScoredPreset | undefined {
  const message = analysis.content;
  if (message.length === 0) return undefined;
  const nameTerms = [...new Set(routerTerms(preset.name))];
  const terms = [...new Set([...nameTerms, ...preset.tags.flatMap(routerTerms), ...preset.synonyms.flatMap(routerTerms)])];
  const categoryTerms = CATEGORY_NOUNS[preset.category];
  let categoryHit = false;
  let specific = 0;
  const matched = new Set<number>();
  for (const token of message) {
    if (categoryTerms.includes(token.word)) { categoryHit = true; matched.add(token.index); continue; }
    if (terms.some(term => termsMatch(term, token.word))) { matched.add(token.index); specific += 1; }
  }
  if (matched.size === 0) return undefined;
  // A number in the request must be part of the preset ("3 modelos"); otherwise it may be a technical value.
  if (analysis.numbers.some(token => !matched.has(token.index))) return undefined;
  const nameHits = nameTerms.filter(term => message.some(token => termsMatch(term, token.word))).length;
  const nameCoverage = nameTerms.length ? nameHits / nameTerms.length : 0;
  const messageCoverage = matched.size / message.length;
  let score = 0.45 * messageCoverage + 0.35 * nameCoverage + (categoryHit ? 0.2 : 0) + (analysis.savedHint ? 0.05 : 0);
  // A word of the name, a tag or a synonym that is not the category: without one, this preset is only "one of them".
  if (!categoryHit && nameCoverage < 0.5) score = Math.min(score, 0.5);
  return {
    choice: {
      kind: 'preset', presetId: preset.id, name: preset.name, category: preset.category, presetKind: preset.kind,
      ...(preset.scope ? { scope: preset.scope } : {}), score: Math.min(1, Math.round(score * 1000) / 1000),
    },
    specific: specific > 0,
  };
}

function rankPresets(presets: readonly LocalRoutablePreset[], analysis: LocalRequestAnalysis): ScoredPreset[] {
  const scored = presets
    .filter(preset => preset.payloadSchemaVersion === ARSENAL_PAYLOAD_SCHEMA_VERSION)
    .map(preset => ({ preset, scored: scorePreset(preset, analysis) }))
    .filter((entry): entry is { preset: LocalRoutablePreset; scored: ScoredPreset } => Boolean(entry.scored));
  scored.sort((a, b) => b.scored.choice.score - a.scored.choice.score
    || b.preset.useCount - a.preset.useCount
    || a.preset.name.localeCompare(b.preset.name, 'pt-BR')
    || (a.preset.id < b.preset.id ? -1 : 1));
  return scored.map(entry => entry.scored);
}

// ---------------------------------------------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------------------------------------------

/**
 * What the assistant can do with a typed request WITHOUT the AI, or `none` (with the reason) when it must go to the AI.
 * The caller shows a `local` answer as a card; nothing here changes the catalog.
 */
export function routeLocally(message: string, context: LocalRouteContext): LocalRoute {
  const text = message.trim();
  if (!text) return none('EMPTY');
  if (text.length > LOCAL_ROUTER_MAX_CHARS) return none('TOO_LONG');
  const analysis = analyzeLocalRequest(text);
  if (analysis.question) return none('QUESTION');
  if (analysis.otherFlow) return none('NOT_LOCAL');
  const minimum = context.followUp ? LOCAL_ROUTER_THRESHOLDS.followUp : LOCAL_ROUTER_THRESHOLDS.minimum;

  // Style: "aumenta o título", "deixa em negrito", "pinta de vermelho". Only this object, nothing else.
  const style = matchStyle(analysis, context);
  if (style) {
    if ('decline' in style) return none(style.decline);
    return style.choice.score >= minimum ? { kind: 'local', primary: style.choice, others: [], confidence: style.choice.score } : none('LOW_CONFIDENCE');
  }
  // Writing, translating, deleting… belong to the conversation that edits ("tira o negrito" was handled above).
  if (analysis.editVerb) return none('NOT_LOCAL');

  if (analysis.content.length === 0 && !analysis.archetypeCode) return none('NOT_UNDERSTOOD');
  const table = matchNewTable(analysis);
  const page = table ? undefined : matchModelPage(analysis);
  const attempt = table ?? page;
  const action = attempt && 'choice' in attempt ? attempt : undefined;
  const ranked = rankPresets(context.presets ?? [], analysis);
  const best = ranked[0];
  const others = (primary: LocalChoice): LocalChoice[] => [
    ...ranked.map(entry => entry.choice).filter(choice => choice !== primary && choice.score >= LOCAL_ROUTER_THRESHOLDS.alternative),
    ...(action && action.choice !== primary ? [action.choice] : []),
  ].slice(0, LOCAL_ROUTER_THRESHOLDS.maxOthers);

  // A preset wins when the request names it (a word of its name, tags or synonyms besides the category) and it fits
  // at least as well as the deterministic action. With no deterministic route for the category ("insere o
  // cabeçalho"), the category alone is enough: the card lists the headers of the arsenal.
  const presetFloor = Math.max(analysis.savedHint ? LOCAL_ROUTER_THRESHOLDS.savedHintPreset : LOCAL_ROUTER_THRESHOLDS.minimum,
    context.followUp ? minimum : 0);
  const presetWins = best !== undefined && best.choice.score >= presetFloor && (
    attempt === undefined
    || (best.specific && action === undefined)
    || (best.specific && action !== undefined && (analysis.savedHint || best.choice.score >= LOCAL_ROUTER_THRESHOLDS.strongPreset)
      && (analysis.savedHint || best.choice.score >= action.choice.score - 0.05)));
  if (presetWins) return { kind: 'local', primary: best.choice, others: others(best.choice), confidence: best.choice.score };

  // Not understood and a number in it: say why it really goes to the AI (a number is never decided here).
  if (attempt && 'decline' in attempt) {
    return none(attempt.decline === 'NOT_UNDERSTOOD' && analysis.numbers.length > 0 ? 'TECHNICAL_VALUES' : attempt.decline);
  }
  // "aquela tabela de ensaios": something saved, not found here. The AI (with the arsenal index) or the person decides.
  if (analysis.savedHint) return none('NOT_IN_ARSENAL');
  if (action) {
    if (analysis.numbers.some(token => !action.consumed.has(token.index))) return none('TECHNICAL_VALUES');
    if (action.choice.score < minimum) return none('LOW_CONFIDENCE');
    return { kind: 'local', primary: action.choice, others: others(action.choice), confidence: action.choice.score };
  }
  if (analysis.numbers.length > 0) return none('TECHNICAL_VALUES');
  return none(best ? 'LOW_CONFIDENCE' : 'NOT_UNDERSTOOD');
}

/** The words of a choice for the card ("Tabela de 5 linhas × 3 colunas", "Página-modelo P7: Fornecimento…"). */
export function describeLocalAction(action: LocalAction): string {
  switch (action.type) {
    case 'table.new': {
      const rows = `${action.rows} ${action.rows === 1 ? 'linha' : 'linhas'}`;
      const columns = `${action.columns} ${action.columns === 1 ? 'coluna' : 'colunas'}`;
      return `Tabela nova de ${rows} × ${columns}` + (action.models ? ` (${action.models} modelos e a coluna dos nomes)` : '')
        + (action.rows > 1 ? ', com a primeira linha como cabeçalho' : '');
    }
    case 'page.template':
      return `Página-modelo ${action.archetypeId}: ${action.label}`;
    case 'style': {
      const change = action.change;
      switch (change.kind) {
        case 'text_size': return change.size === 'larger' ? 'Aumentar a letra' : 'Diminuir a letra';
        case 'text_weight': return change.weight === 'bold' ? 'Deixar em negrito' : 'Tirar o negrito';
        case 'set_color': return `Mudar a cor para ${EDIT_INTENT_PALETTE[change.color].label}`;
        case 'resize': return change.size === 'larger' ? 'Aumentar o tamanho' : 'Diminuir o tamanho';
      }
    }
  }
}
