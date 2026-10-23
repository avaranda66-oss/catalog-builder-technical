import { instantiatePageWithFreshIds } from '../application/document';
import type { PageTemplateDefinition, PageTemplateRegistry } from '../application/template-registry';
import type { CatalogDocument, EditorialObject, Page, TableModel } from '../domain/editorial-model';
import { walkPageObjects } from '../domain/object-tree';
import {
  PRESYS_ARCHETYPES,
  buildPresysArchetypePage,
  createPresysArchetypeTemplateRegistry,
  presysDocumentStyle,
  toFill,
  type PresysArchetypeFills,
  type PresysArchetypeId,
} from '../library/presys-archetypes';
import { createPresysCoverTemplateRegistry } from '../library/presys-cover-pcon';
import {
  ARSENAL_PAYLOAD_SCHEMA_VERSION,
  builtinArsenalPresetId,
  findArsenalTableValueViolations,
  parseArsenalPreset,
  type ArsenalCategory,
  type ArsenalPayload,
  type ArsenalPreset,
  type ArsenalPresetKind,
  type ArsenalStyle,
  type ArsenalTableValuePolicy,
} from './contracts';
import type { ArsenalBuiltinSource } from './repository';

/**
 * Onda 4.5 — the PRESYS models that ship with the app, seen as read-only arsenal presets (ADR-arsenal, scope
 * `builtin`). Nothing here edits the libraries it reads: the page presets come from the same template registries
 * as "Usar modelo…" (archetypes P1–P9 and the PCON cover), and the blocks, tables and styles are cut from archetype
 * pages built by `buildPresysArchetypePage`. Every built-in passes `parseArsenalPreset` before it is listed.
 *
 * Texts are the archetypes' own placeholders ("… (A COMPLETAR)"), which the content review blocks until replaced.
 * Tables keep their row labels and placeholders, so they are filed as `generic-values`; no technical value exists
 * in any of them (the archetypes are product-agnostic).
 */

/** How a template or a piece is filed in the arsenal. */
export interface ArsenalBuiltinMetadata {
  readonly category: ArsenalCategory;
  readonly name?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly synonyms?: readonly string[];
}

const SOURCE_DOCUMENT: CatalogDocument = Object.freeze({
  schemaVersion: 1,
  id: 'arsenal-builtin-source',
  title: 'Modelos PRESYS',
  locale: 'pt-BR',
  style: presysDocumentStyle(),
  pages: [],
  assets: [],
}) as unknown as CatalogDocument;

const round = (value: number) => Math.round(value * 10_000) / 10_000;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function tablesIn(objects: readonly EditorialObject[]): TableModel[] {
  const page: Page = { id: 'arsenal:tables', widthMm: 210, heightMm: 297, objects: [...objects] };
  return walkPageObjects(page)
    .map(({ object }) => object)
    .filter((object): object is Extract<EditorialObject, { type: 'table' }> => object.type === 'table')
    .map((object) => object.table);
}

/** `structure-only` when every table is already only structure; otherwise the placeholders are generic content. */
function tableValuePolicy(tables: readonly TableModel[]): ArsenalTableValuePolicy {
  return tables.some((table) => findArsenalTableValueViolations(table).length > 0) ? 'generic-values' : 'structure-only';
}

function builtinPreset(
  slug: string,
  kind: ArsenalPresetKind,
  metadata: ArsenalBuiltinMetadata & { readonly name: string },
  payload: ArsenalPayload,
): ArsenalPreset {
  const preset: ArsenalPreset = {
    id: builtinArsenalPresetId(slug),
    scope: 'builtin',
    origin: 'builtin',
    kind,
    name: metadata.name,
    category: metadata.category,
    ...(metadata.description === undefined ? {} : { description: metadata.description }),
    tags: [...(metadata.tags ?? [])],
    synonyms: [...(metadata.synonyms ?? [])],
    payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
    payload,
    revision: 1,
    createdBy: null,
    createdByName: null,
    createdAt: null,
    updatedAt: null,
    useCount: 0,
    lastUsedAt: null,
  };
  const parsed = parseArsenalPreset(preset);
  if (!parsed.ok) {
    throw new Error(`ARSENAL_BUILTIN_INVALID: ${preset.id} ${parsed.code} ${parsed.issues.map((issue) => `${issue.path} ${issue.code}`).join('; ')}`);
  }
  return parsed.value;
}

/**
 * A page template ("Usar modelo…") as a `page` preset `builtin:<templateId>`. The template seeds have no root ids,
 * so objects get stable ids derived from the template id (insertion always makes fresh ones anyway).
 */
export function arsenalPagePresetFromTemplate(
  definition: PageTemplateDefinition,
  metadata: ArsenalBuiltinMetadata,
): ArsenalPreset {
  let next = 0;
  const page = instantiatePageWithFreshIds(SOURCE_DOCUMENT, definition, () => `${definition.id}~${next++}`);
  return builtinPreset(definition.id, 'page', {
    ...metadata,
    name: metadata.name ?? definition.label,
    ...(metadata.description === undefined && definition.description !== undefined
      ? { description: definition.description }
      : {}),
  }, {
    kind: 'page',
    ...(page.safeArea === undefined ? {} : { safeArea: page.safeArea }),
    objects: page.objects,
    tableValues: tableValuePolicy(tablesIn(page.objects)),
    assets: [],
  });
}

/** Objects of a built page, by the suffix of their id (`<pageId>-<suffix>`), in paint order. */
function pick(page: Page, suffixes: readonly string[]): EditorialObject[] {
  return suffixes.map((suffix) => {
    const found = page.objects.find((object) => object.id === `${page.id}-${suffix}`);
    if (!found) throw new Error(`ARSENAL_BUILTIN_SOURCE_MISSING: ${page.id}-${suffix}`);
    return found;
  });
}

/** A `block` payload: the frame around the objects, with object frames relative to it (ADR-arsenal §2). */
export function arsenalBlockPayloadFromObjects(objects: readonly EditorialObject[]): Extract<ArsenalPayload, { kind: 'block' }> {
  if (objects.length === 0) throw new Error('ARSENAL_BUILTIN_EMPTY_BLOCK');
  const left = Math.min(...objects.map((object) => object.frame.xMm));
  const top = Math.min(...objects.map((object) => object.frame.yMm));
  const right = Math.max(...objects.map((object) => object.frame.xMm + object.frame.widthMm));
  const bottom = Math.max(...objects.map((object) => object.frame.yMm + object.frame.heightMm));
  return {
    kind: 'block',
    frame: { xMm: round(left), yMm: round(top), widthMm: round(right - left), heightMm: round(bottom - top) },
    objects: objects.map((object, zIndex) => ({
      ...object,
      zIndex,
      frame: { ...object.frame, xMm: round(object.frame.xMm - left), yMm: round(object.frame.yMm - top) },
    })) as EditorialObject[],
    tableValues: tableValuePolicy(tablesIn(objects)),
    assets: [],
  };
}

function tableObject(page: Page, suffix: string): Extract<EditorialObject, { type: 'table' }> {
  const [object] = pick(page, [suffix]);
  if (object.type !== 'table') throw new Error(`ARSENAL_BUILTIN_NOT_A_TABLE: ${object.id}`);
  return object;
}

function textStyle(page: Page, suffix: string): ArsenalStyle {
  const [object] = pick(page, [suffix]);
  if (object.type !== 'text') throw new Error(`ARSENAL_BUILTIN_NOT_TEXT: ${object.id}`);
  return { target: 'text', text: { ...object.style } };
}

/** Where each PRESYS page template is filed, and the words the father may type to find it. */
const PRESYS_TEMPLATE_METADATA: Readonly<Record<string, ArsenalBuiltinMetadata>> = Object.freeze({
  'presys-p1-capa': {
    category: 'capas', tags: ['capa', 'foto principal'], synonyms: ['frente', 'primeira página', 'capa do catálogo'],
  },
  'presys-p2-visao-geral': {
    category: 'paginas', tags: ['apresentação', 'destaques'], synonyms: ['introdução', 'características', 'visão geral'],
  },
  'presys-p3-recursos': {
    category: 'paginas', tags: ['recursos', 'aplicações'], synonyms: ['funções', 'usos', 'fotos com legenda'],
  },
  'presys-p4-especificacoes': {
    category: 'paginas', tags: ['especificações', 'tabela', 'modelos'], synonyms: ['ficha técnica', 'dados técnicos', 'comparativo'],
  },
  'presys-p5-faixas': {
    category: 'paginas', tags: ['faixas', 'entradas', 'tabela'], synonyms: ['ranges', 'exatidão', 'especificações gerais'],
  },
  'presys-p6-codigo-pedido': {
    category: 'paginas', tags: ['código de pedido', 'tabela'], synonyms: ['como pedir', 'order code', 'opções'],
  },
  'presys-p7-fornecimento': {
    category: 'paginas', tags: ['fornecimento', 'acessórios'], synonyms: ['itens inclusos', 'kit', 'o que acompanha'],
  },
  'presys-p8-insertos': {
    category: 'paginas', tags: ['insertos', 'opções'], synonyms: ['furos', 'blocos', 'desenhos'],
  },
  'presys-p9-contracapa': {
    category: 'capas', tags: ['contracapa', 'distribuidor'], synonyms: ['verso', 'última página', 'capa de trás'],
  },
  'presys-capa-produto-pcon': {
    category: 'capas', tags: ['capa', 'PCON', 'diagonal'], synonyms: ['frente', 'primeira página', 'capa colorida'],
  },
});

const DEFAULT_TEMPLATE_METADATA: ArsenalBuiltinMetadata = Object.freeze({ category: 'paginas' });

/**
 * Built-ins from any page-template registry: one `page` preset per template, filed by `metadataFor` (pages by
 * default). Lazy and computed once: `list()` always returns the same frozen presets.
 */
export function createArsenalBuiltinSourceFromTemplates(
  registries: () => readonly PageTemplateRegistry[],
  metadataFor: (definition: PageTemplateDefinition) => ArsenalBuiltinMetadata = () => DEFAULT_TEMPLATE_METADATA,
): ArsenalBuiltinSource {
  let presets: readonly ArsenalPreset[] | undefined;
  return {
    list() {
      presets ??= deepFreeze(registries()
        .flatMap((registry) => registry.list())
        .map((definition) => arsenalPagePresetFromTemplate(definition, metadataFor(definition))));
      return presets;
    },
  };
}

function archetypePage(id: PresysArchetypeId, fills?: PresysArchetypeFills): Page {
  const templateId = PRESYS_ARCHETYPES.find((archetype) => archetype.id === id)?.templateId;
  if (!templateId) throw new Error(`ARSENAL_BUILTIN_SOURCE_MISSING: ${id}`);
  return buildPresysArchetypePage(id, { pageId: templateId, ...(fills ? { fills } : {}) });
}

/** Blocks, tables and styles cut from the archetype pages (same objects the "Usar modelo…" pages carry). */
function presysPieces(): ArsenalPreset[] {
  const p1 = archetypePage('P1');
  const p2 = archetypePage('P2', { 'P2.title': { kind: 'text', text: toFill('Título da página') } });
  const p3 = archetypePage('P3');
  const p4 = archetypePage('P4');
  const p5 = archetypePage('P5');
  const p6 = archetypePage('P6');
  const p7 = archetypePage('P7');
  const p8 = archetypePage('P8');

  const block = (slug: string, metadata: ArsenalBuiltinMetadata & { name: string }, page: Page, suffixes: readonly string[]) =>
    builtinPreset(slug, 'block', metadata, arsenalBlockPayloadFromObjects(pick(page, suffixes)));

  const table = (slug: string, metadata: Omit<ArsenalBuiltinMetadata, 'category'> & { name: string }, page: Page, suffix: string) => {
    const object = tableObject(page, suffix);
    return builtinPreset(slug, 'table', { ...metadata, category: 'tabelas' }, {
      kind: 'table',
      sizeMm: { widthMm: object.frame.widthMm, heightMm: object.frame.heightMm },
      table: object.table,
      tableValues: tableValuePolicy([object.table]),
      assets: [],
    });
  };

  const style = (slug: string, metadata: Omit<ArsenalBuiltinMetadata, 'category'> & { name: string }, value: ArsenalStyle) =>
    builtinPreset(slug, 'style', { ...metadata, category: 'estilos' }, { kind: 'style', style: value });

  const [titleRule] = pick(p2, ['title-rule']);
  const [band] = pick(p1, ['band']);
  if (titleRule.type !== 'line' || band.type !== 'shape') throw new Error('ARSENAL_BUILTIN_SOURCE_CHANGED');

  return [
    block('presys-cabecalho-titulo', {
      name: 'Título com linha vermelha', category: 'cabecalhos',
      description: 'Título azul da página com a linha vermelha embaixo, como nas páginas internas PRESYS.',
      tags: ['título', 'linha'], synonyms: ['topo', 'cabeçalho da página', 'barra superior'],
    }, p2, ['title', 'title-rule']),
    block('presys-rodape-site', {
      name: 'Rodapé com site', category: 'rodapes',
      description: 'Linha fina e o endereço do site no pé da página.',
      tags: ['site', 'linha'], synonyms: ['pé de página', 'rodapé da página', 'endereço'],
    }, p2, ['footer-rule', 'footer']),
    block('presys-faixa-modelo', {
      name: 'Faixa vermelha do modelo', category: 'capas',
      description: 'A faixa vermelha da capa com o nome do modelo em branco.',
      tags: ['faixa', 'modelo', 'vermelho'], synonyms: ['tarja', 'barra do modelo'],
    }, p1, ['band', 'model']),
    block('presys-quadro-destaque', {
      name: 'Quadro de destaque', category: 'paginas',
      description: 'Caixa azul-clara com uma frase de destaque em negrito.',
      tags: ['chamada', 'destaque'], synonyms: ['caixa de destaque', 'frase de destaque', 'box'],
    }, p3, ['callout-box', 'callout']),
    block('presys-espaco-foto', {
      name: 'Espaço para foto', category: 'paginas',
      description: 'Moldura cinza com o aviso "A COMPLETAR", para trocar pela foto certa.',
      tags: ['foto', 'imagem'], synonyms: ['moldura', 'quadro de foto', 'figura'],
    }, p2, ['photo-box', 'photo-marker']),

    table('presys-tabela-comparacao', {
      name: 'Comparação de modelos', description: 'Características nas linhas e um modelo por coluna, com nota abaixo.',
      tags: ['especificações', 'modelos', 'comparação'], synonyms: ['ficha técnica', 'dados técnicos', 'comparativo'],
    }, p4, 'specs-object'),
    table('presys-tabela-faixas', {
      name: 'Faixas e entradas', description: 'Entrada ou função, faixa, resolução, exatidão e observações.',
      tags: ['faixas', 'entradas', 'exatidão'], synonyms: ['ranges', 'resolução'],
    }, p5, 'ranges-object'),
    table('presys-tabela-dados-gerais', {
      name: 'Especificações gerais', description: 'Duas colunas: o item e o valor (alimentação, operação, interfaces…).',
      tags: ['especificações', 'gerais'], synonyms: ['alimentação', 'condições de operação', 'dados gerais'],
    }, p5, 'general-object'),
    table('presys-tabela-codigo-pedido', {
      name: 'Código de pedido', description: 'Código e significado, separados por campo do código.',
      tags: ['código de pedido', 'opções'], synonyms: ['como pedir', 'order code'],
    }, p6, 'options-object'),
    table('presys-tabela-acessorios', {
      name: 'Acessórios com código', description: 'Descrição do acessório e o código de pedido.',
      tags: ['acessórios', 'código'], synonyms: ['opcionais', 'itens'],
    }, p7, 'accessories-object'),
    table('presys-tabela-insertos', {
      name: 'Insertos e furos', description: 'Código do inserto, furos e código de pedido.',
      tags: ['insertos', 'furos'], synonyms: ['blocos'],
    }, p8, 'inserts-object'),

    style('presys-estilo-titulo', {
      name: 'Título de página', tags: ['título', 'azul'], synonyms: ['título grande', 'h1'],
    }, textStyle(p2, 'title')),
    style('presys-estilo-subtitulo', {
      name: 'Subtítulo', tags: ['subtítulo', 'azul'], synonyms: ['título de seção', 'h2'],
    }, textStyle(p5, 'general-title')),
    style('presys-estilo-texto', {
      name: 'Texto corrido', tags: ['texto', 'parágrafo'], synonyms: ['corpo do texto', 'texto normal'],
    }, textStyle(p2, 'intro')),
    style('presys-estilo-legenda', {
      name: 'Legenda e nota', tags: ['legenda', 'nota'], synonyms: ['texto pequeno', 'observação'],
    }, textStyle(p3, 'feature-caption-1')),
    style('presys-estilo-linha-vermelha', {
      name: 'Linha vermelha', tags: ['linha', 'vermelho'], synonyms: ['régua', 'traço', 'fio'],
    }, {
      target: 'line',
      line: {
        color: titleRule.color,
        ...(titleRule.thicknessPt === undefined ? {} : { thicknessPt: titleRule.thicknessPt }),
        ...(titleRule.dash === undefined ? {} : { dash: titleRule.dash }),
      },
    }),
    style('presys-estilo-faixa-vermelha', {
      name: 'Faixa vermelha', tags: ['faixa', 'vermelho'], synonyms: ['retângulo', 'fundo vermelho'],
    }, { target: 'shape', shape: { ...band.style } }),
    style('presys-estilo-tabela', {
      name: 'Tabela PRESYS', tags: ['tabela', 'azul'], synonyms: ['estilo de tabela', 'cabeçalho azul'],
    }, { target: 'table', table: tableObject(p4, 'specs-object').table.style }),
  ];
}

/**
 * The PRESYS built-ins: the archetype pages P1–P9 and the PCON cover (from their template registries), then the
 * blocks, tables and styles cut from them. Computed once, on the first `list()`.
 */
export function createPresysArsenalBuiltinSource(): ArsenalBuiltinSource {
  const pages = createArsenalBuiltinSourceFromTemplates(
    () => [createPresysArchetypeTemplateRegistry(), createPresysCoverTemplateRegistry()],
    (definition) => PRESYS_TEMPLATE_METADATA[definition.id] ?? DEFAULT_TEMPLATE_METADATA,
  );
  let presets: readonly ArsenalPreset[] | undefined;
  return {
    list() {
      presets ??= deepFreeze([...pages.list(), ...presysPieces()]);
      return presets;
    },
  };
}
