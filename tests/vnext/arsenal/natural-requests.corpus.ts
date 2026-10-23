import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CatalogDocument } from '../../../src/vnext/domain';
import type { ArsenalCategory, ArsenalPresetSummary } from '../../../src/vnext/arsenal/contracts';
import { createPresysArsenalBuiltinSource } from '../../../src/vnext/arsenal/builtin-source';
import type { LocalStyleChange } from '../../../src/vnext/arsenal/local-router';
import type { EditIntentKind } from '../../../src/vnext/ai-catalog/edit-intent-contract';
import { buildPresysArchetypePage, type PresysArchetypeId } from '../../../src/vnext/library/presys-archetypes';
import { presetSummary } from './arsenal-ia-fixtures';

/**
 * Onda 4.5 — 60 requests as the father types them (informal Portuguese, light typos, "bota/põe/aumenta isso aí",
 * "igual à do PCON", "faz uma tabelinha"), with what each one should do:
 *
 * - `local`: the router without AI answers it (arsenal preset or one of its deterministic actions), zero tokens;
 * - `edit_intent`: the conversation that edits (AI) changes the open catalog;
 * - `composer`: the AI composes new pages;
 * - `recusa`: a technical value that exists nowhere: the conversation that edits must REFUSE (only edit_intent can
 *   refuse; the composer would build an empty page instead, which is not what he asked).
 *
 * Used by natural-requests.test.ts (router only, no AI) and by scripts/live-natural-requests.ts (real Gemini through
 * the local Edge handler, for the requests that go to the AI).
 */

export type CorpusTopic = 'capa' | 'tabela' | 'cabecalho' | 'rodape' | 'pagina' | 'estilo' | 'traducao' | 'complexo' | 'tecnico';
/** simples: 44 everyday requests; complexo: 10 that must go to the AI; tecnico: 6 that ask for values nobody gave. */
export type CorpusKind = 'simples' | 'complexo' | 'tecnico';
export type CorpusRoute = 'local' | 'edit_intent' | 'composer' | 'recusa';
/** never: a question would be unnecessary; allowed: either a question or a sensible default is fine. */
export type CorpusAsks = 'never' | 'allowed';

export type ExpectedAction =
  /** A preset of the arsenal, by name (any of). */
  | { readonly type: 'preset'; readonly names: readonly string[] }
  /** Any preset of this category (the card lists the others under "Ver outros"). */
  | { readonly type: 'preset-category'; readonly category: ArsenalCategory }
  | { readonly type: 'table.new'; readonly rows: number; readonly columns: number }
  /** A PRESYS model page, as the deterministic action or as the built-in page preset with the same content. */
  | { readonly type: 'page.template'; readonly archetypeId: PresysArchetypeId; readonly presetNames: readonly string[] }
  | { readonly type: 'page.blank' }
  | { readonly type: 'style'; readonly objectId: string; readonly change: LocalStyleChange }
  /** Intents of the conversation that edits: every kind listed must be proposed (others are errors). */
  | { readonly type: 'edit'; readonly kinds: readonly EditIntentKind[]; readonly hints?: readonly string[] }
  | { readonly type: 'compose'; readonly minPages: number; readonly maxPages: number; readonly table?: boolean }
  /** The AI should point at a saved preset (use_preset) instead of building it. */
  | { readonly type: 'use_preset'; readonly names: readonly string[] }
  | { readonly type: 'refusal' };

export interface NaturalRequest {
  readonly id: string;
  readonly message: string;
  readonly topic: CorpusTopic;
  readonly kind: CorpusKind;
  /** Page open in the editor: 1 PCON cover, 2 "Visão geral", 3 "Especificações técnicas", 4 blank. */
  readonly page: 1 | 2 | 3 | 4;
  readonly selection?: readonly string[];
  readonly expected: {
    /** Accepted routes (one, or two when either AI lane gives the same answer). */
    readonly route: CorpusRoute | readonly CorpusRoute[];
    readonly action: ExpectedAction;
    readonly asks: CorpusAsks;
    readonly note?: string;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The open catalog: the real PCON cover, two PRESYS model pages and a blank page
// ---------------------------------------------------------------------------------------------------------------

export const CORPUS_PAGES = Object.freeze({ cover: 'capa-pcon-hibrido', overview: 'visao-geral', specs: 'especificacoes', blank: 'em-branco' });
const COVER = CORPUS_PAGES.cover;
const OVERVIEW = CORPUS_PAGES.overview;
const SPECS = CORPUS_PAGES.specs;

/** A fresh copy each call (sessions change their document). */
export function corpusDocument(): CatalogDocument {
  const pcon = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/examples/presys-capa-pcon-hibrido.catalog.json'), 'utf8')) as CatalogDocument;
  return {
    ...pcon,
    title: 'Catálogo PCON',
    pages: [
      ...pcon.pages,
      buildPresysArchetypePage('P2', { pageId: OVERVIEW }),
      buildPresysArchetypePage('P4', { pageId: SPECS }),
      { id: CORPUS_PAGES.blank, widthMm: 210, heightMm: 297, objects: [] },
    ],
  };
}

const TEAM_IDS = {
  header: '0a000000-0000-4000-8000-000000000001',
  headerBlue: '0a000000-0000-4000-8000-000000000002',
  footer: '0a000000-0000-4000-8000-000000000003',
  coverBlue: '0a000000-0000-4000-8000-000000000004',
  specs3: '0a000000-0000-4000-8000-000000000005',
  pressures: '0a000000-0000-4000-8000-000000000006',
} as const;

/** What the team saved, plus every PRESYS built-in (read only), as the assistant lists them. */
export function corpusArsenal(): ArsenalPresetSummary[] {
  const team = [
    presetSummary({ id: TEAM_IDS.header, name: 'Cabeçalho padrão', category: 'cabecalhos', kind: 'block', tags: ['padrão', 'PCON'], synonyms: ['topo padrão'], useCount: 6 }),
    presetSummary({ id: TEAM_IDS.headerBlue, name: 'Cabeçalho azul', category: 'cabecalhos', kind: 'block', tags: ['azul', 'faixa'], synonyms: ['barra superior azul'], useCount: 2 }),
    presetSummary({ id: TEAM_IDS.footer, name: 'Rodapé padrão', category: 'rodapes', kind: 'block', tags: ['padrão'], synonyms: ['pé de página'], useCount: 5 }),
    presetSummary({ id: TEAM_IDS.coverBlue, name: 'Capa azul simples', category: 'capas', kind: 'page', tags: ['azul', 'simples'], synonyms: [], useCount: 1 }),
    presetSummary({ id: TEAM_IDS.specs3, name: 'Especificações 3 modelos', category: 'tabelas', kind: 'table', tags: ['especificações', 'modelos'], synonyms: ['ficha técnica'], useCount: 3 }),
    presetSummary({ id: TEAM_IDS.pressures, name: 'Tabela de pressões', category: 'tabelas', kind: 'table', tags: ['pressão', 'faixas'], synonyms: [], useCount: 1 }),
  ];
  const builtins = createPresysArsenalBuiltinSource().list().map(({ payload: _payload, ...summary }) => summary as ArsenalPresetSummary);
  return [...team, ...builtins];
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers to write the corpus
// ---------------------------------------------------------------------------------------------------------------

const preset = (...names: string[]): ExpectedAction => ({ type: 'preset', names });
const template = (archetypeId: PresysArchetypeId, ...presetNames: string[]): ExpectedAction => ({ type: 'page.template', archetypeId, presetNames });
const table = (rows: number, columns: number): ExpectedAction => ({ type: 'table.new', rows, columns });
const style = (objectId: string, change: LocalStyleChange): ExpectedAction => ({ type: 'style', objectId, change });
const edit = (kinds: EditIntentKind[], hints?: string[]): ExpectedAction => ({ type: 'edit', kinds, ...(hints ? { hints } : {}) });
const local = (action: ExpectedAction, note?: string) => ({ route: 'local' as const, action, asks: 'never' as const, ...(note ? { note } : {}) });
const viaEdit = (action: ExpectedAction, asks: CorpusAsks = 'never', note?: string) =>
  ({ route: 'edit_intent' as const, action, asks, ...(note ? { note } : {}) });
const viaComposer = (action: ExpectedAction, note?: string) => ({ route: 'composer' as const, action, asks: 'never' as const, ...(note ? { note } : {}) });
const refusal = (note: string) => ({ route: 'recusa' as const, action: { type: 'refusal' } as const, asks: 'never' as const, note });

// ---------------------------------------------------------------------------------------------------------------
// The 60 requests
// ---------------------------------------------------------------------------------------------------------------

export const NATURAL_REQUESTS: readonly NaturalRequest[] = Object.freeze([
  // ---- Capas (6) ----
  { id: 'capa-01', topic: 'capa', kind: 'simples', page: 4, message: 'bota uma capa nova', expected: local(template('P1', 'Capa')) },
  { id: 'capa-02', topic: 'capa', kind: 'simples', page: 4, message: 'quero uma capa igual a do PCON', expected: local(preset('Capa de produto — PCON')) },
  { id: 'capa-03', topic: 'capa', kind: 'simples', page: 4, message: 'poe a contra capa no final', expected: local(template('P9', 'Contracapa'), 'a página aberta já é a última') },
  { id: 'capa-04', topic: 'capa', kind: 'simples', page: 4, message: 'faz uma capa pro TA-25N',
    expected: viaComposer({ type: 'compose', minPages: 1, maxPages: 1 }, 'tem o nome do modelo: a IA escreve a capa') },
  { id: 'capa-05', topic: 'capa', kind: 'simples', page: 4, message: 'usa a capa azul', expected: local(preset('Capa azul simples')) },
  { id: 'capa-06', topic: 'capa', kind: 'simples', page: 4, message: 'coloca a capa padrão da presys', expected: local(template('P1', 'Capa')) },

  // ---- Tabelas (8) ----
  { id: 'tabela-01', topic: 'tabela', kind: 'simples', page: 4, message: 'faz uma tabelinha com 4 linhas', expected: local(table(4, 3)) },
  { id: 'tabela-02', topic: 'tabela', kind: 'simples', page: 4, message: 'bota uma tabela de 3 colunas por 5 linhas', expected: local(table(5, 3)) },
  { id: 'tabela-03', topic: 'tabela', kind: 'simples', page: 4, message: 'poe aquela tabela de especificaçoes dos 3 modelos', expected: local(preset('Especificações 3 modelos')) },
  { id: 'tabela-04', topic: 'tabela', kind: 'simples', page: 4, message: 'tabela 5x4', expected: local(table(5, 4)) },
  { id: 'tabela-05', topic: 'tabela', kind: 'simples', page: 4, message: 'põe a tabela de código de pedido', expected: local(preset('Código de pedido')) },
  { id: 'tabela-06', topic: 'tabela', kind: 'simples', page: 4, message: 'mete uma tabela de acessorios', expected: local(preset('Acessórios com código')) },
  { id: 'tabela-07', topic: 'tabela', kind: 'simples', page: 4, message: 'preciso de uma tabela pra comparar os modelos',
    expected: local(preset('Comparação de modelos', 'Especificações 3 modelos')) },
  { id: 'tabela-08', topic: 'tabela', kind: 'simples', page: 4, message: 'bota uma tabla com 6 linhas e 2 colunas', expected: local(table(6, 2), '"tabla": erro de digitação') },

  // ---- Cabeçalhos (4) ----
  { id: 'cabecalho-01', topic: 'cabecalho', kind: 'simples', page: 2, message: 'poe o cabeçalho padrao', expected: local(preset('Cabeçalho padrão')) },
  { id: 'cabecalho-02', topic: 'cabecalho', kind: 'simples', page: 4, message: 'coloca aquele cabeçario com a linha vermelha',
    expected: local(preset('Título com linha vermelha'), '"cabeçario": erro comum') },
  { id: 'cabecalho-03', topic: 'cabecalho', kind: 'simples', page: 4, message: 'insere o topo da pagina', expected: local({ type: 'preset-category', category: 'cabecalhos' }) },
  { id: 'cabecalho-04', topic: 'cabecalho', kind: 'simples', page: 4, message: 'quero um cabeçalho azul', expected: local(preset('Cabeçalho azul')) },

  // ---- Rodapés (4) ----
  { id: 'rodape-01', topic: 'rodape', kind: 'simples', page: 4, message: 'poe o rodape com o site', expected: local(preset('Rodapé com site')) },
  { id: 'rodape-02', topic: 'rodape', kind: 'simples', page: 4, message: 'bota o pé de pagina padrao', expected: local(preset('Rodapé padrão')) },
  { id: 'rodape-03', topic: 'rodape', kind: 'simples', page: 4, message: 'coloca um rodapé', expected: local({ type: 'preset-category', category: 'rodapes' }) },
  { id: 'rodape-04', topic: 'rodape', kind: 'simples', page: 2, message: 'tira o rodapé dessa pagina', expected: viaEdit(edit(['delete_object'], ['footer', 'footer-rule'])) },

  // ---- Páginas (7) ----
  { id: 'pagina-01', topic: 'pagina', kind: 'simples', page: 2, message: 'faz uma pagina nova de acessorios', expected: local(template('P7', 'Fornecimento padrão e acessórios')) },
  { id: 'pagina-02', topic: 'pagina', kind: 'simples', page: 2, message: 'poe uma pagina em branco', expected: local({ type: 'page.blank' }) },
  { id: 'pagina-03', topic: 'pagina', kind: 'simples', page: 3, message: 'duplica essa pagina', expected: viaEdit(edit(['duplicate_page'])) },
  { id: 'pagina-04', topic: 'pagina', kind: 'simples', page: 2, message: 'apaga a pagina 4', expected: viaEdit(edit(['delete_page']), 'never', '"4" é o número da página, não um valor técnico') },
  { id: 'pagina-05', topic: 'pagina', kind: 'simples', page: 2, message: 'bota uma pagina de especificaçoes tecnicas',
    expected: local(template('P4', 'Especificações: comparação de modelos')) },
  { id: 'pagina-06', topic: 'pagina', kind: 'simples', page: 2, message: 'poe uma pagina pra como pedir', expected: local(template('P6', 'Código de pedido')) },
  { id: 'pagina-07', topic: 'pagina', kind: 'simples', page: 2, message: 'insere a pagina de faixas de mediçao', expected: local(template('P5', 'Faixas, entradas e dados gerais')) },

  // ---- Estilo (11) ----
  { id: 'estilo-01', topic: 'estilo', kind: 'simples', page: 1, message: 'aumenta o titulo', expected: local(style(`${COVER}-titulo`, { kind: 'text_size', size: 'larger' })) },
  { id: 'estilo-02', topic: 'estilo', kind: 'simples', page: 1, selection: [`${COVER}-subtitulo`], message: 'deixa isso em negrito',
    expected: local(style(`${COVER}-subtitulo`, { kind: 'text_weight', weight: 'bold' })) },
  { id: 'estilo-03', topic: 'estilo', kind: 'simples', page: 2, selection: [`${OVERVIEW}-intro`], message: 'aumenta a letra disso aí',
    expected: local(style(`${OVERVIEW}-intro`, { kind: 'text_size', size: 'larger' })) },
  { id: 'estilo-04', topic: 'estilo', kind: 'simples', page: 1, selection: [`${COVER}-divisa`], message: 'pinta essa faixa de vermelho',
    expected: local(style(`${COVER}-divisa`, { kind: 'set_color', color: 'vermelho' })) },
  { id: 'estilo-05', topic: 'estilo', kind: 'simples', page: 1, message: 'muda a cor do titulo pra azul claro',
    expected: local(style(`${COVER}-titulo`, { kind: 'set_color', color: 'azul_claro' })) },
  { id: 'estilo-06', topic: 'estilo', kind: 'simples', page: 1, message: 'diminui um pouquinho a foto', expected: local(style(`${COVER}-foto`, { kind: 'resize', size: 'smaller' })) },
  { id: 'estilo-07', topic: 'estilo', kind: 'simples', page: 2, message: 'deixa o titulo mais grande', expected: local(style(`${OVERVIEW}-title`, { kind: 'text_size', size: 'larger' })) },
  { id: 'estilo-08', topic: 'estilo', kind: 'simples', page: 2, message: 'coloca o texto em negrito',
    expected: viaEdit(edit(['text_weight']), 'allowed', 'vários textos na página: escolher um padrão ou perguntar') },
  { id: 'estilo-09', topic: 'estilo', kind: 'simples', page: 2, selection: [`${OVERVIEW}-highlights-title`], message: 'aplica o estilo de titulo nesse texto',
    expected: local(preset('Título de página')) },
  { id: 'estilo-10', topic: 'estilo', kind: 'simples', page: 3, message: 'deixa a tabela com letra menor',
    expected: local(style(`${SPECS}-specs-object`, { kind: 'text_size', size: 'smaller' })) },
  { id: 'estilo-11', topic: 'estilo', kind: 'simples', page: 1, message: 'deixa o subtitulo azul', expected: viaEdit(edit(['set_color'], ['subtitulo'])) },

  // ---- Tradução (4) ----
  { id: 'traducao-01', topic: 'traducao', kind: 'simples', page: 2, message: 'traduz essa pagina pro ingles', expected: viaEdit(edit(['translate_text'])) },
  { id: 'traducao-02', topic: 'traducao', kind: 'simples', page: 1, message: 'passa o subtitulo pro espanhol', expected: viaEdit(edit(['translate_text'], ['subtitulo'])) },
  { id: 'traducao-03', topic: 'traducao', kind: 'simples', page: 1, message: 'coloca em ingles o texto de destaque', expected: viaEdit(edit(['translate_text'], ['destaque'])) },
  { id: 'traducao-04', topic: 'traducao', kind: 'simples', page: 3, message: 'traduz tudo pra frances', expected: viaEdit(edit(['translate_text'])) },

  // ---- Complexos: devem ir à IA (10) ----
  { id: 'complexo-01', topic: 'complexo', kind: 'complexo', page: 1, message: 'monta um catalogo de 4 paginas pro PCON com capa, apresentação, especificações e acessorios',
    expected: viaComposer({ type: 'compose', minPages: 4, maxPages: 4, table: true }) },
  { id: 'complexo-02', topic: 'complexo', kind: 'complexo', page: 1, message: 'cria uma pagina comparando o PCON e o TA com uma tabela pra eu preencher',
    expected: viaComposer({ type: 'compose', minPages: 1, maxPages: 2, table: true }) },
  { id: 'complexo-03', topic: 'complexo', kind: 'complexo', page: 3, message: 'faz uma pagina de garantia e assistencia tecnica',
    expected: viaComposer({ type: 'compose', minPages: 1, maxPages: 1 }) },
  { id: 'complexo-04', topic: 'complexo', kind: 'complexo', page: 1, message: 'troca o titulo por PCON Y18 e aumenta a foto',
    expected: viaEdit(edit(['set_text', 'resize'], ['titulo', 'foto']), 'never', '"18" foi digitado por ele: entra, destacado para conferir') },
  { id: 'complexo-05', topic: 'complexo', kind: 'complexo', page: 4, message: 'sabe aquela tabela que a gente usa pra mostrar como pedir o equipamento? bota ela aqui',
    expected: { route: ['edit_intent', 'composer'], action: { type: 'use_preset', names: ['Código de pedido'] }, asks: 'never',
      note: 'frase longa demais para o roteador; a IA acha no arsenal' } },
  { id: 'complexo-06', topic: 'complexo', kind: 'complexo', page: 1, message: 'traduz a capa pro ingles mas deixa os codigos dos modelos como estão',
    expected: viaEdit(edit(['translate_text'])) },
  { id: 'complexo-07', topic: 'complexo', kind: 'complexo', page: 3, message: 'cria 3 paginas: uma de recursos, uma de faixas e uma de codigo de pedido',
    expected: viaComposer({ type: 'compose', minPages: 3, maxPages: 3 }) },
  { id: 'complexo-08', topic: 'complexo', kind: 'complexo', page: 1, message: 'apaga a pagina em branco e duplica a de especificações',
    expected: viaEdit(edit(['delete_page', 'duplicate_page'])) },
  { id: 'complexo-09', topic: 'complexo', kind: 'complexo', page: 1, message: 'deixa a foto da capa maior e o titulo menor',
    expected: viaEdit(edit(['resize', 'text_size'], ['foto', 'titulo'])) },
  { id: 'complexo-10', topic: 'complexo', kind: 'complexo', page: 3,
    message: 'na pagina de especificaçoes poe uma tabela comparando 3 modelos com pressao, exatidao e alimentaçao nas linhas',
    expected: viaComposer({ type: 'compose', minPages: 1, maxPages: 1, table: true }, 'linhas com os nomes; células vazias') },

  // ---- Valores técnicos que ninguém deu: recusar (6) ----
  { id: 'tecnico-01', topic: 'tecnico', kind: 'tecnico', page: 2, message: 'coloca a exatidao do TA-25N no rodape', expected: refusal('exatidão do TA-25N não está no catálogo nem no pedido') },
  { id: 'tecnico-02', topic: 'tecnico', kind: 'tecnico', page: 3, message: 'poe a faixa de pressao do TA-25N na tabela', expected: refusal('faixa de pressão não informada') },
  { id: 'tecnico-03', topic: 'tecnico', kind: 'tecnico', page: 3, message: 'preenche a tabela com os valores do PCON', expected: refusal('valores só do PDF ou da planilha conferidos') },
  { id: 'tecnico-04', topic: 'tecnico', kind: 'tecnico', page: 3, message: 'bota a pressão maxima de cada modelo embaixo do titulo', expected: refusal('pressão máxima não informada') },
  { id: 'tecnico-05', topic: 'tecnico', kind: 'tecnico', page: 1, message: 'poe o preço de cada modelo embaixo da foto', expected: refusal('preço não informado') },
  { id: 'tecnico-06', topic: 'tecnico', kind: 'tecnico', page: 2, message: 'escreve a certificaçao ISO e a classe de proteção IP no rodape', expected: refusal('certificação e IP não informados') },
]);

/** The routes a request may take (one or two). */
export const acceptedRoutes = (entry: NaturalRequest): readonly CorpusRoute[] =>
  typeof entry.expected.route === 'string' ? [entry.expected.route] : entry.expected.route;
