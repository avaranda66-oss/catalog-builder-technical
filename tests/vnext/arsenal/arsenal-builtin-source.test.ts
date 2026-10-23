import { describe, expect, it } from 'vitest';
import { walkPageObjects } from '../../../src/vnext/domain/object-tree';
import type { EditorialObject, TableModel } from '../../../src/vnext/domain/editorial-model';
import { createStaticPageTemplateRegistry } from '../../../src/vnext/application/template-registry';
import { createPresysArchetypeTemplateRegistry, PRESYS_ARCHETYPES } from '../../../src/vnext/library/presys-archetypes';
import { createPresysCoverTemplateRegistry, PRESYS_PCON_COVER_TEMPLATE_ID } from '../../../src/vnext/library/presys-cover-pcon';
import {
  ARSENAL_CATEGORIES,
  arsenalPresetMatchesQuery,
  buildArsenalCompactIndex,
  canManageArsenalPreset,
  collectArsenalPayloadAssetIds,
  isArsenalCategoryAllowed,
  parseArsenalPreset,
  type ArsenalPreset,
} from '../../../src/vnext/arsenal/contracts';
import {
  arsenalBlockPayloadFromObjects,
  arsenalPagePresetFromTemplate,
  createArsenalBuiltinSourceFromTemplates,
  createPresysArsenalBuiltinSource,
} from '../../../src/vnext/arsenal/builtin-source';
import { createInMemoryArsenalStore } from '../../../src/vnext/arsenal/memory-repository';
import { searchArsenalPresets } from '../../../src/vnext/arsenal/search';
import { CONTRACT_ACTORS } from './contract/fixtures';

const source = createPresysArsenalBuiltinSource();
const builtins = source.list();
const byId = (id: string): ArsenalPreset => {
  const preset = builtins.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`missing ${id}`);
  return preset;
};

function tablesOf(preset: ArsenalPreset): TableModel[] {
  const { payload } = preset;
  if (payload.kind === 'table') return [payload.table];
  if (payload.kind === 'style') return [];
  return walkPageObjects({ id: 'p', widthMm: 210, heightMm: 297, objects: payload.objects })
    .map(({ object }) => object)
    .filter((object): object is Extract<EditorialObject, { type: 'table' }> => object.type === 'table')
    .map((object) => object.table);
}

function textsOf(preset: ArsenalPreset): string[] {
  const { payload } = preset;
  if (payload.kind !== 'page' && payload.kind !== 'block') return [];
  return walkPageObjects({ id: 'p', widthMm: 210, heightMm: 297, objects: payload.objects })
    .map(({ object }) => object)
    .flatMap((object) => (object.type === 'text'
      ? object.text.paragraphs.flatMap((paragraph) => paragraph.inlines.map((inline) => ('text' in inline ? inline.text : '')))
      : []));
}

describe('modelos PRESYS embutidos no arsenal', () => {
  it('todos passam no contrato: escopo builtin, sem autor, versão atual, categoria permitida', () => {
    expect(builtins.length).toBeGreaterThanOrEqual(20);
    for (const preset of builtins) {
      expect(parseArsenalPreset(preset).ok, preset.id).toBe(true);
      expect(preset).toMatchObject({ scope: 'builtin', origin: 'builtin', createdBy: null, revision: 1, payloadSchemaVersion: 1 });
      expect(preset.id).toMatch(/^builtin:presys-/);
      expect(isArsenalCategoryAllowed(preset.kind, preset.category)).toBe(true);
    }
    expect(new Set(builtins.map((preset) => preset.id)).size).toBe(builtins.length);
  });

  it('as páginas são as mesmas do "Usar modelo…": P1–P9 e a capa PCON, com builtin:<id do modelo>', () => {
    const templates = [...createPresysArchetypeTemplateRegistry().list(), ...createPresysCoverTemplateRegistry().list()];
    const pages = builtins.filter((preset) => preset.kind === 'page');
    expect(pages.map((preset) => preset.id)).toEqual(templates.map((template) => `builtin:${template.id}`));
    for (const template of templates) {
      const preset = byId(`builtin:${template.id}`);
      expect(preset.name).toBe(template.label);
      expect(preset.description).toBe(template.description);
      expect(preset.payload.kind === 'page' && preset.payload.objects.length).toBe(template.objects.length);
      expect(preset.payload.kind === 'page' && preset.payload.safeArea).toEqual(template.safeArea);
    }
    expect(byId('builtin:presys-p1-capa').category).toBe('capas');
    expect(byId(`builtin:${PRESYS_PCON_COVER_TEMPLATE_ID}`).category).toBe('capas');
    expect(byId('builtin:presys-p4-especificacoes').category).toBe('paginas');
    expect(PRESYS_ARCHETYPES).toHaveLength(9);
  });

  it('cobre as seis categorias, com cabeçalho, rodapé, tabelas e estilos', () => {
    const categories = new Set(builtins.map((preset) => preset.category));
    expect([...categories].sort()).toEqual([...ARSENAL_CATEGORIES].sort());
    expect(byId('builtin:presys-cabecalho-titulo')).toMatchObject({ kind: 'block', category: 'cabecalhos' });
    expect(byId('builtin:presys-rodape-site')).toMatchObject({ kind: 'block', category: 'rodapes' });
    expect(byId('builtin:presys-quadro-destaque').tags).toContain('chamada');
    expect(builtins.filter((preset) => preset.kind === 'table').length).toBeGreaterThanOrEqual(6);
    expect(builtins.filter((preset) => preset.kind === 'style').map((preset) => preset.payload.kind === 'style' && preset.payload.style.target))
      .toEqual(expect.arrayContaining(['text', 'line', 'shape', 'table']));
  });

  it('não tem fotos nem valores técnicos: só textos "A COMPLETAR" e rótulos genéricos', () => {
    for (const preset of builtins) {
      expect(collectArsenalPayloadAssetIds(preset.payload), preset.id).toEqual([]);
      for (const table of tablesOf(preset)) {
        for (const cell of table.cells) expect(['empty', 'richText'], `${preset.id} ${cell.id}`).toContain(cell.content.type);
      }
    }
    // Tabelas com rótulos e "A COMPLETAR" ficam como conteúdo genérico, nunca como "só estrutura" com valores.
    const comparison = byId('builtin:presys-tabela-comparacao');
    expect(comparison.payload.kind === 'table' && comparison.payload.tableValues).toBe('generic-values');
    const headerTexts = textsOf(byId('builtin:presys-cabecalho-titulo'));
    expect(headerTexts.join(' ')).toContain('A COMPLETAR');
  });

  it('bloco guarda o quadro de origem e objetos relativos a ele (volta ao mesmo lugar)', () => {
    const header = byId('builtin:presys-cabecalho-titulo');
    if (header.payload.kind !== 'block') throw new Error('block expected');
    expect(header.payload.frame).toMatchObject({ xMm: 18, yMm: 13.5, widthMm: 176 });
    expect(Math.min(...header.payload.objects.map((object) => object.frame.xMm))).toBe(0);
    expect(Math.min(...header.payload.objects.map((object) => object.frame.yMm))).toBe(0);
    const footer = byId('builtin:presys-rodape-site');
    expect(footer.payload.kind === 'block' && footer.payload.frame.yMm).toBeGreaterThan(270);
    expect(() => arsenalBlockPayloadFromObjects([])).toThrow('ARSENAL_BUILTIN_EMPTY_BLOCK');
  });

  it('é calculado uma vez, congelado e não muda os modelos de origem', () => {
    expect(source.list()).toBe(builtins);
    expect(Object.isFrozen(builtins)).toBe(true);
    expect(Object.isFrozen(builtins[0].payload)).toBe(true);
    const before = JSON.stringify(createPresysArchetypeTemplateRegistry().list());
    createPresysArsenalBuiltinSource().list();
    expect(JSON.stringify(createPresysArchetypeTemplateRegistry().list())).toBe(before);
  });

  it('ninguém renomeia nem apaga um embutido; servem ao armazenamento em memória e ao índice da IA', async () => {
    for (const actor of [CONTRACT_ACTORS.author, CONTRACT_ACTORS.admin]) {
      expect(canManageArsenalPreset(builtins[0], actor)).toBe(false);
    }
    const store = createInMemoryArsenalStore({ builtins });
    const listed = await store.as(CONTRACT_ACTORS.author).list();
    expect(listed.ok && listed.value.length).toBe(builtins.length);
    const index = buildArsenalCompactIndex(builtins);
    expect(index).toHaveLength(builtins.length);
    expect(JSON.stringify(index)).not.toContain('payload');
  });

  it('a busca acha os embutidos pelo que o pai digita (acentos, plurais, sinônimos)', () => {
    const ids = (query: string) => searchArsenalPresets(builtins, query).map((preset) => preset.id);
    expect(ids('cabecalhos')).toContain('builtin:presys-cabecalho-titulo');
    expect(ids('rodapé')).toContain('builtin:presys-rodape-site');
    expect(ids('pé de página')[0]).toBe('builtin:presys-rodape-site');
    expect(ids('código de pedido').slice(0, 2)).toEqual(expect.arrayContaining(['builtin:presys-tabela-codigo-pedido', 'builtin:presys-p6-codigo-pedido']));
    expect(ids('acessorios')).toContain('builtin:presys-tabela-acessorios');
    expect(ids('capa de tras')).toContain('builtin:presys-p9-contracapa');
    expect(arsenalPresetMatchesQuery(byId('builtin:presys-estilo-linha-vermelha'), 'linhas vermelhas')).toBe(true);
  });

  it('o adaptador serve a qualquer registro de modelos de página', () => {
    const registry = createStaticPageTemplateRegistry([{
      id: 'meu-modelo', label: 'Meu modelo',
      objects: [{ type: 'shape', shape: 'rectangle', zIndex: 0, frame: { xMm: 10, yMm: 10, widthMm: 50, heightMm: 20 }, style: { fill: '#003366' } }],
    } as never]);
    const generic = createArsenalBuiltinSourceFromTemplates(() => [registry]).list();
    expect(generic).toHaveLength(1);
    expect(generic[0]).toMatchObject({ id: 'builtin:meu-modelo', kind: 'page', category: 'paginas', name: 'Meu modelo' });
    const filed = arsenalPagePresetFromTemplate(registry.list()[0], { category: 'capas', name: 'Outro nome', tags: ['x'] });
    expect(filed).toMatchObject({ category: 'capas', name: 'Outro nome', tags: ['x'] });
    expect(filed.payload.kind === 'page' && filed.payload.objects[0].id).toBe('meu-modelo~1');
  });
});
