import { createCatalogDocument } from '../../../src/vnext/application';
import { plainRichText, type CatalogDocument, type EditorialObject } from '../../../src/vnext/domain';
import {
  ARSENAL_PAYLOAD_SCHEMA_VERSION, type ArsenalCategory, type ArsenalPresetKind, type ArsenalPresetSummary,
} from '../../../src/vnext/arsenal/contracts';
import { CONTRACT_ACTORS, CONTRACT_ASSET, contractTable } from './contract/fixtures';

/**
 * Fixtures of the "arsenal-ia" slice (Onda 4.5): an open page with one obvious title, photo and table, and an arsenal
 * with the presets the father asks for in his own words.
 */

let counter = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

const frame = (xMm: number, yMm: number, widthMm: number, heightMm: number) => ({ xMm, yMm, widthMm, heightMm });
const text = (id: string, value: string, fontSizePt: number, zIndex: number, y: number): EditorialObject => ({
  id, type: 'text', zIndex, frame: frame(20, y, 170, fontSizePt), text: plainRichText(id, value),
  style: { fontSizePt, ...(fontSizePt >= 20 ? { fontWeight: 700 as const } : {}) },
});

export interface RouterDocumentOptions {
  /** Two texts with the same biggest letters ("o título" is not obvious). */
  readonly twoTitles?: boolean;
  /** Two photos ("a foto" is not obvious). */
  readonly twoPhotos?: boolean;
}

/** A canonical catalog whose first page has: title (28 pt), subtitle (14 pt), body (10 pt), a band, a photo and a table. */
export function routerDocument(options: RouterDocumentOptions = {}): CatalogDocument {
  const base = createCatalogDocument(nextId, 'Catálogo de teste');
  const objects: EditorialObject[] = [
    text('title', 'PCON HÍBRIDO', 28, 0, 20),
    text('subtitle', 'Calibrador de pressão', 14, 1, 50),
    text('body', 'Texto de apresentação do produto.', 10, 2, 70),
    { id: 'band', type: 'shape', shape: 'rectangle', zIndex: 3, frame: frame(0, 0, 210, 12), style: { fill: '#003366' } },
    { id: 'photo', type: 'image', zIndex: 4, frame: frame(20, 90, 80, 60), assetId: CONTRACT_ASSET.id, fit: 'contain' },
    { id: 'specs', type: 'table', zIndex: 5, frame: frame(20, 170, 170, 30), table: contractTable('specs') },
    ...(options.twoTitles ? [text('title-2', 'OUTRO TÍTULO', 28, 6, 220)] : []),
    ...(options.twoPhotos ? [{ id: 'photo-2', type: 'image' as const, zIndex: 7, frame: frame(110, 90, 80, 60), assetId: CONTRACT_ASSET.id, fit: 'contain' as const }] : []),
  ];
  return {
    ...base,
    assets: [CONTRACT_ASSET],
    pages: [{ ...base.pages[0], objects }, { id: 'page-2', widthMm: 210, heightMm: 297, objects: [] }],
  };
}

/** A list item of the arsenal, as the repository returns it. */
export function presetSummary(input: {
  readonly id?: string;
  readonly name: string;
  readonly category: ArsenalCategory;
  readonly kind: ArsenalPresetKind;
  readonly tags?: readonly string[];
  readonly synonyms?: readonly string[];
  readonly builtin?: boolean;
  readonly useCount?: number;
}): ArsenalPresetSummary {
  const builtin = input.builtin === true;
  const slug = input.name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: input.id ?? (builtin ? `builtin:${slug}` : nextId()),
    scope: builtin ? 'builtin' : 'team',
    origin: builtin ? 'builtin' : 'person',
    kind: input.kind,
    name: input.name,
    category: input.category,
    tags: [...(input.tags ?? [])],
    synonyms: [...(input.synonyms ?? [])],
    payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
    revision: 1,
    createdBy: builtin ? null : CONTRACT_ACTORS.author.userId,
    createdByName: builtin ? null : CONTRACT_ACTORS.author.name,
    createdAt: builtin ? null : '2026-10-23T12:00:00.000Z',
    updatedAt: builtin ? null : '2026-10-23T12:00:00.000Z',
    useCount: input.useCount ?? 0,
    lastUsedAt: null,
  };
}

/** The arsenal of the router tests: two headers, a footer, two tables, two covers (one built-in) and a style. */
export function routerPresets(): ArsenalPresetSummary[] {
  return [
    presetSummary({ name: 'Cabeçalho padrão', category: 'cabecalhos', kind: 'block', tags: ['padrão'], synonyms: ['topo padrão'], useCount: 4 }),
    presetSummary({ name: 'Cabeçalho azul', category: 'cabecalhos', kind: 'block', tags: ['azul', 'faixa'], synonyms: ['barra superior'] }),
    presetSummary({ name: 'Rodapé padrão PRESYS', category: 'rodapes', kind: 'block', tags: ['padrão'], synonyms: ['pé de página'] }),
    presetSummary({ name: 'Especificações 3 modelos', category: 'tabelas', kind: 'table', tags: ['comparação', 'modelos'], synonyms: ['ficha técnica'] }),
    presetSummary({ name: 'Tabela de especificações', category: 'tabelas', kind: 'table', tags: ['especificações'], synonyms: [] }),
    presetSummary({ name: 'Capa azul simples', category: 'capas', kind: 'page', tags: ['capa', 'azul'], synonyms: ['frente'] }),
    presetSummary({ name: 'Capa PRESYS', category: 'capas', kind: 'page', tags: ['capa'], builtin: true }),
    presetSummary({ name: 'Título grande branco', category: 'estilos', kind: 'style', tags: ['título'] }),
  ];
}
