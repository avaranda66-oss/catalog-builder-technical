import { describe, expect, it } from 'vitest';
import {
  analyzeLocalRequest, LOCAL_ROUTER_MAX_CHARS, normalizeRequestText, routeLocally, singularize,
  type LocalAction, type LocalRoute, type LocalRouteContext,
} from '../../../src/vnext/arsenal/local-router';
import { routerDocument, routerPresets } from './arsenal-ia-fixtures';

/**
 * Onda 4.5 — the router without AI. The father's own words, informal Portuguese: what is answered here (zero tokens)
 * and what must still go to the AI (technical values, writing, translating, two things at once, low confidence).
 */

const document = routerDocument();
const presets = routerPresets();
const activePageId = document.pages[0].id;
const route = (message: string, context: Partial<LocalRouteContext> = {}): LocalRoute =>
  routeLocally(message, { document, activePageId, ...context });
const withArsenal = (message: string, context: Partial<LocalRouteContext> = {}) => route(message, { presets, ...context });

function action(result: LocalRoute): LocalAction {
  if (result.kind !== 'local' || result.primary.kind !== 'action') throw new Error('expected an action, got ' + JSON.stringify(result));
  return result.primary.action;
}
function presetName(result: LocalRoute): string {
  if (result.kind !== 'local' || result.primary.kind !== 'preset') throw new Error('expected a preset, got ' + JSON.stringify(result));
  return result.primary.name;
}
const nameOf = (id: string) => presets.find(preset => preset.id === id)?.name;

describe('normalization: accents, plurals, slang and numbers in words', () => {
  it('lower case, no accents, "4x3" split, punctuation out, decimal comma kept', () => {
    expect(normalizeRequestText('Põe uma TABELA 4x3, já!')).toBe('poe uma tabela 4 x 3 ja');
    expect(normalizeRequestText('exatidão de 0,1% no rodapé')).toBe('exatidao de 0,1 no rodape');
  });
  it('plurals become singular', () => {
    expect(['especificacoes', 'imagens', 'linhas', 'acessorios', 'cabecalhos', 'rodapes', 'gerais', 'cores', 'simples'].map(singularize))
      .toEqual(['especificacao', 'imagem', 'linha', 'acessorio', 'cabecalho', 'rodape', 'geral', 'cor', 'simple']);
  });
  it('"bota", "põe", "coloca", "mete" all mean "put"; numbers in words become digits', () => {
    for (const verb of ['bota', 'põe', 'coloca', 'mete', 'insere', 'adiciona']) {
      expect(analyzeLocalRequest(`${verb} uma tabela`).insert).toBe(true);
    }
    const analysis = analyzeLocalRequest('mete uma tabela com cinco linhas e vinte e duas colunas');
    expect(analysis.numbers.map(token => token.number)).toEqual([5, 22]);
    // "uma" before a count noun is a number; before "tabela" it is an article.
    expect(analyzeLocalRequest('uma tabela com uma coluna').numbers.map(token => token.number)).toEqual([1]);
  });
});

describe('positive: answered here, without the AI', () => {
  it.each([
    ['bota uma tabela com 5 linhas', 5, 3],
    ['põe uma tabela 4x3', 4, 3],
    ['coloca uma tabela de 3 colunas e 8 linhas', 8, 3],
    ['mete uma tabela com cinco linhas e duas colunas', 5, 2],
    ['insere uma tabela', 6, 3],
    ['tabela nova com dez linhas', 10, 3],
    ['Bota aí uma tabela 4 por 2, por favor', 4, 2],
    ['adiciona uma tabela com vinte e cinco linhas', 25, 3],
    ['faz uma tabela com uma coluna', 6, 1],
  ])('"%s" → new table %i × %i', (message, rows, columns) => {
    expect(action(route(message))).toEqual({ type: 'table.new', rows, columns });
  });

  it('"quero uma tabela de especificações de 3 modelos" → 3 model columns plus the names column', () => {
    expect(action(route('quero uma tabela de especificações de 3 modelos'))).toEqual({ type: 'table.new', rows: 6, columns: 4, models: 3 });
  });

  it.each([
    ['nova página de acessórios', 'P7'],
    ['insere uma capa', 'P1'],
    ['põe a contracapa', 'P9'],
    ['página de especificações', 'P4'],
    ['cria uma página de comparação de modelos', 'P4'],
    ['põe uma página de código de pedido', 'P6'],
    ['nova página de insertos', 'P8'],
    ['adiciona a página P5', 'P5'],
    ['insere o modelo P2', 'P2'],
    ['coloca uma página nova de recursos e aplicações aí', 'P3'],
    ['página de faixas e dados gerais', 'P5'],
  ])('"%s" → PRESYS model page %s', (message, archetypeId) => {
    const found = action(route(message));
    expect(found.type).toBe('page.template');
    expect(found.type === 'page.template' && found.archetypeId).toBe(archetypeId);
  });

  it.each([
    ['aumenta o título', [], 'title', { kind: 'text_size', size: 'larger' }],
    ['aumenta o título', ['subtitle'], 'subtitle', { kind: 'text_size', size: 'larger' }],
    ['diminui a letra', ['body'], 'body', { kind: 'text_size', size: 'smaller' }],
    ['deixa em negrito', ['body'], 'body', { kind: 'text_weight', weight: 'bold' }],
    ['tira o negrito', ['title'], 'title', { kind: 'text_weight', weight: 'regular' }],
    ['pinta de vermelho', ['band'], 'band', { kind: 'set_color', color: 'vermelho' }],
    ['muda a cor para azul claro', ['body'], 'body', { kind: 'set_color', color: 'azul_claro' }],
    ['deixa o título na cor da marca', ['title'], 'title', { kind: 'set_color', color: 'azul_marinho' }],
    ['aumenta a foto', [], 'photo', { kind: 'resize', size: 'larger' }],
    ['diminui um pouco a foto', [], 'photo', { kind: 'resize', size: 'smaller' }],
    ['deixa a tabela com letra maior', [], 'specs', { kind: 'text_size', size: 'larger' }],
  ])('"%s" (selected: %j) → style of %s', (message, selected, objectId, change) => {
    expect(action(route(message, { selectedObjectIds: selected as string[] }))).toEqual({ type: 'style', objectId, change });
  });

  it.each([
    ['insere o cabeçalho padrão', 'Cabeçalho padrão'],
    ['põe aquela tabela de especificações de 3 modelos', 'Especificações 3 modelos'],
    ['coloca o rodapé padrão', 'Rodapé padrão PRESYS'],
    ['usa a capa azul', 'Capa azul simples'],
    ['aplica o estilo título grande branco', 'Título grande branco'],
    ['bota o topo azul', 'Cabeçalho azul'],
    ['põe a ficha técnica de 3 modelos', 'Especificações 3 modelos'],
  ])('"%s" → arsenal: %s', (message, name) => {
    expect(presetName(withArsenal(message))).toBe(name);
  });

  it('a saved preset wins over the PRESYS model, which stays under "Ver outros"', () => {
    const result = route('nova página de acessórios', { presets: [...presets,
      { ...presets[0], id: '99999999-9999-4999-8999-999999999999', name: 'Página de acessórios PCON', category: 'paginas', kind: 'page', tags: ['acessórios'], synonyms: [] }] });
    expect(presetName(result)).toBe('Página de acessórios PCON');
    expect(result.kind === 'local' && result.others.some(choice => choice.kind === 'action' && choice.action.type === 'page.template'
      && choice.action.archetypeId === 'P7')).toBe(true);
  });

  it('"aquela tabela de especificações de 3 modelos" also offers the plain new table under "Ver outros"', () => {
    const result = withArsenal('põe aquela tabela de especificações de 3 modelos');
    expect(result.kind === 'local' && result.others.some(choice => choice.kind === 'action')).toBe(true);
    // The preset without "3" is not offered: a number the preset does not have could be a technical value.
    expect(result.kind === 'local' && result.others.some(choice => choice.kind === 'preset' && choice.name === 'Tabela de especificações')).toBe(false);
  });
});

describe('negative: goes to the AI (or nowhere) as before', () => {
  it.each([
    ['troque o título da capa para PCON-Y18', 'NOT_LOCAL'],
    ['traduza esta página para o inglês', 'NOT_LOCAL'],
    ['apague a página 4', 'NOT_LOCAL'],
    ['duplique a página 3', 'NOT_LOCAL'],
    ['mude a cor da faixa para azul claro', 'STYLE_TARGET_UNCLEAR'],
    ['Crie uma capa e uma apresentação profissional para este catálogo.', 'NOT_LOCAL'],
    ['Crie uma página comparando três modelos, com uma tabela comparativa para eu preencher com os dados.', 'NOT_LOCAL'],
    ['Monte o catálogo a partir destes arquivos', 'NOT_LOCAL'],
    ['coloca a exatidão de 0,1% no rodapé', 'TECHNICAL_VALUES'],
    ['põe uma tabela com a faixa de 0 a 250 psi', 'TECHNICAL_VALUES'],
    ['aumente a foto da página 2', 'TECHNICAL_VALUES'],
    ['Crie uma página de contato', 'NOT_UNDERSTOOD'],
    ['oi, tudo bem?', 'NOT_UNDERSTOOD'],
    ['o que você acha da capa?', 'QUESTION'],
    ['como faço uma tabela?', 'QUESTION'],
    ['bota uma tabela com 200 linhas', 'TABLE_SIZE_LIMIT'],
    ['aumenta', 'STYLE_TARGET_UNCLEAR'],
    ['deixa o texto em negrito', 'STYLE_TARGET_UNCLEAR'],
    ['uma página de especificações ou de faixas', 'NOT_UNDERSTOOD'],
    ['monte um folder de duas páginas', 'NOT_LOCAL'],
  ])('"%s" → none (%s)', (message, reason) => {
    expect(route(message)).toEqual({ kind: 'none', reason });
  });

  it('a technical number is never handled here, even with a selection or an arsenal', () => {
    expect(route('aumenta o título para 24 pt', { selectedObjectIds: ['title'] })).toEqual({ kind: 'none', reason: 'TECHNICAL_VALUES' });
    expect(withArsenal('coloca o rodapé padrão com a exatidão de 0,05%')).toEqual({ kind: 'none', reason: 'TECHNICAL_VALUES' });
    expect(withArsenal('insere o cabeçalho padrão na página 3')).toEqual({ kind: 'none', reason: 'TECHNICAL_VALUES' });
  });

  it('"aquela tabela de ensaios" with nothing like it in the arsenal goes to the AI', () => {
    expect(withArsenal('põe aquela tabela de ensaios de pressão').kind).toBe('none');
    expect(route('põe aquela tabela de especificações de 3 modelos')).toEqual({ kind: 'none', reason: 'NOT_IN_ARSENAL' });
  });

  it('a style change of the wrong kind of object is not forced', () => {
    expect(route('aumenta o título', { selectedObjectIds: ['photo'] })).toEqual({ kind: 'none', reason: 'STYLE_TARGET_UNCLEAR' });
    expect(route('deixa em negrito', { selectedObjectIds: ['photo'] })).toEqual({ kind: 'none', reason: 'STYLE_TARGET_UNCLEAR' });
    expect(route('pinta de verde', { selectedObjectIds: ['photo'] })).toEqual({ kind: 'none', reason: 'STYLE_TARGET_UNCLEAR' });
  });

  it('a long request is a composition: the AI does it', () => {
    expect(route('bota uma tabela ' + 'bem bonita '.repeat(12))).toEqual({ kind: 'none', reason: 'TOO_LONG' });
    expect(LOCAL_ROUTER_MAX_CHARS).toBeLessThan(200);
  });
});

describe('ambiguous: a card with the options, or the AI', () => {
  it('"põe o cabeçalho" lists both headers of the arsenal (most used first)', () => {
    const result = withArsenal('põe o cabeçalho');
    expect(presetName(result)).toBe('Cabeçalho padrão');
    expect(result.kind === 'local' && result.others.map(choice => choice.kind === 'preset' ? nameOf(choice.presetId) : choice.kind)).toEqual(['Cabeçalho azul']);
  });

  it('"insere uma capa": the PRESYS cover page, with the covers of the arsenal under "Ver outros"', () => {
    const result = withArsenal('insere uma capa');
    expect(action(result)).toMatchObject({ type: 'page.template', archetypeId: 'P1' });
    expect(result.kind === 'local' && result.others.map(choice => choice.kind === 'preset' && choice.name).sort())
      .toEqual(['Capa PRESYS', 'Capa azul simples']);
  });

  it('"põe uma tabela": a plain new table, the saved tables are only alternatives', () => {
    const result = withArsenal('põe uma tabela');
    expect(action(result)).toEqual({ type: 'table.new', rows: 6, columns: 3 });
    expect(result.kind === 'local' && result.others.filter(choice => choice.kind === 'preset').length).toBeGreaterThan(0);
  });

  it('two titles of the same size or two photos: "o título" / "a foto" is not obvious', () => {
    const twoTitles = routerDocument({ twoTitles: true });
    expect(routeLocally('aumenta o título', { document: twoTitles, activePageId: twoTitles.pages[0].id }))
      .toEqual({ kind: 'none', reason: 'STYLE_TARGET_UNCLEAR' });
    const twoPhotos = routerDocument({ twoPhotos: true });
    expect(routeLocally('aumenta a foto', { document: twoPhotos, activePageId: twoPhotos.pages[0].id }))
      .toEqual({ kind: 'none', reason: 'STYLE_TARGET_UNCLEAR' });
    // With the photo selected it is clear again.
    expect(action(routeLocally('aumenta a foto', { document: twoPhotos, activePageId: twoPhotos.pages[0].id, selectedObjectIds: ['photo-2'] })))
      .toEqual({ type: 'style', objectId: 'photo-2', change: { kind: 'resize', size: 'larger' } });
  });

  it('after a question of the conversation that edits, only a sure match is answered here', () => {
    expect(route('os selos', { followUp: true }).kind).toBe('none');
    // "o título" without a selection is a sensible default, not a sure match: it stays with the conversation.
    expect(route('aumenta o título', { followUp: true })).toEqual({ kind: 'none', reason: 'LOW_CONFIDENCE' });
    expect(action(route('bota uma tabela com 5 linhas', { followUp: true }))).toEqual({ type: 'table.new', rows: 5, columns: 3 });
  });

  it('presets of a newer app version are never offered', () => {
    const newer = presets.map(preset => preset.name === 'Cabeçalho padrão' ? { ...preset, payloadSchemaVersion: 2 } : preset);
    expect(presetName(route('insere o cabeçalho padrão', { presets: newer }))).toBe('Cabeçalho azul');
  });
});
