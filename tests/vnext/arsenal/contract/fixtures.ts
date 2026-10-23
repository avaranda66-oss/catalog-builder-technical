import { plainRichText, type AssetRef, type Cell, type TableModel } from '../../../../src/vnext/domain/editorial-model';
import {
  ARSENAL_PAYLOAD_SCHEMA_VERSION,
  type ArsenalPreset,
  type ArsenalPresetDraft,
  type ArsenalTableValuePolicy,
} from '../../../../src/vnext/arsenal/contracts';

/**
 * Shared fixtures of the arsenal contract (Onda 4.5). The persistence, capture/insertion, gallery and AI slices use
 * the same presets, so a change of contract shows up in every slice at once.
 */

export const CONTRACT_ACTORS = Object.freeze({
  author: Object.freeze({ userId: '11111111-1111-4111-8111-111111111111', role: 'editor' as const, name: 'Ana Autora' }),
  otherEditor: Object.freeze({ userId: '22222222-2222-4222-8222-222222222222', role: 'editor' as const, name: 'Bruno Editor' }),
  admin: Object.freeze({ userId: '33333333-3333-4333-8333-333333333333', role: 'admin' as const, name: 'Carla Admin' }),
  viewer: Object.freeze({ userId: '44444444-4444-4444-8444-444444444444', role: 'viewer' as const, name: 'Davi Leitor' }),
});

export type ContractActor = (typeof CONTRACT_ACTORS)[keyof typeof CONTRACT_ACTORS];

export const CONTRACT_ASSET: AssetRef = Object.freeze({
  id: '7e8ad13e-8bd3-4709-8e89-98870ee157bf',
  version: '1',
  sha256: 'a'.repeat(64),
  mime: 'image/png' as const,
  widthPx: 400,
  heightPx: 200,
  name: 'logo-presys.png',
  alt: 'Logotipo da PRESYS',
});

/**
 * A 3 × 2 label/value table. `with-values` puts words in the body, a measurement, a note and a title — exactly
 * what a `structure-only` preset must not keep.
 */
export function contractTable(prefix = 'tbl', content: 'structure' | 'with-values' = 'structure'): TableModel {
  const columns = [
    { id: `${prefix}:c1`, width: { mode: 'flex' as const, weight: 2 }, minMm: 20 },
    { id: `${prefix}:c2`, width: { mode: 'flex' as const, weight: 1 }, minMm: 15 },
  ];
  const rows = [
    { id: `${prefix}:r1`, role: 'header' as const, heightPolicy: { mode: 'AUTO' as const } },
    { id: `${prefix}:r2`, role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } },
    { id: `${prefix}:r3`, role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } },
  ];
  const header = ['Característica', 'Valor'];
  const cells: Cell[] = rows.flatMap((row, rowIndex) => columns.map((column, columnIndex): Cell => {
    const id = `${prefix}:${row.id.split(':').pop()}:${column.id.split(':').pop()}`;
    if (rowIndex === 0) return { id, rowId: row.id, columnId: column.id, content: { type: 'richText', value: plainRichText(id, header[columnIndex]) } };
    if (content === 'structure') return { id, rowId: row.id, columnId: column.id, content: { type: 'empty' } };
    return columnIndex === 0
      ? { id, rowId: row.id, columnId: column.id, content: { type: 'richText', value: plainRichText(id, rowIndex === 1 ? 'Pressão máxima' : 'Exatidão') } }
      : { id, rowId: row.id, columnId: column.id, content: { type: 'measurement', valueText: '10', unit: 'bar' } };
  }));
  const table: TableModel = {
    id: `${prefix}:table`,
    columns,
    rows,
    cells,
    style: {
      base: { fontSizePt: 8 },
      rowRoles: { header: { fontWeight: 700, background: '#003366', color: '#ffffff' } },
      annotation: { fontSizePt: 7 },
      annotationGapMm: 1,
    },
    annotations: [],
    legend: [],
  };
  if (content === 'structure') return table;
  return {
    ...table,
    title: plainRichText(`${prefix}:title`, 'Especificações do PCON-1000'),
    annotations: [{ id: `${prefix}:note`, kind: 'note', text: plainRichText(`${prefix}:note`, 'Válido a 23 °C') }],
    annotationIds: [`${prefix}:note`],
  };
}

/** Blue header band with the catalog title: `block` in "Cabeçalhos". */
export function headerBlockDraft(): ArsenalPresetDraft {
  return {
    kind: 'block',
    origin: 'person',
    name: 'Cabeçalho azul',
    category: 'cabecalhos',
    tags: ['azul', 'faixa'],
    synonyms: ['topo', 'barra superior'],
    payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
    payload: {
      kind: 'block',
      frame: { xMm: 0, yMm: 0, widthMm: 210, heightMm: 24 },
      tableValues: 'structure-only',
      assets: [],
      objects: [
        { id: 'hdr-band', type: 'shape', shape: 'rectangle', zIndex: 0, frame: { xMm: 0, yMm: 0, widthMm: 210, heightMm: 24 }, style: { fill: '#003366' } },
        {
          id: 'hdr-title', type: 'text', zIndex: 1, frame: { xMm: 18, yMm: 8, widthMm: 120, heightMm: 8 },
          text: plainRichText('hdr-title', 'Título do catálogo'), style: { fontSizePt: 14, fontWeight: 700, color: '#ffffff' },
        },
      ],
    },
  };
}

/** A block with the PRESYS logo: exercises asset reuse and the "Foto a escolher" frame. */
export function logoBlockDraft(): ArsenalPresetDraft {
  return {
    kind: 'block',
    origin: 'person',
    name: 'Logotipo no canto',
    category: 'cabecalhos',
    tags: ['logotipo'],
    synonyms: [],
    payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
    payload: {
      kind: 'block',
      frame: { xMm: 150, yMm: 10, widthMm: 40, heightMm: 20 },
      tableValues: 'structure-only',
      assets: [CONTRACT_ASSET],
      objects: [
        { id: 'logo-image', type: 'image', zIndex: 0, frame: { xMm: 0, yMm: 0, widthMm: 40, heightMm: 20 }, assetId: CONTRACT_ASSET.id, fit: 'contain' },
      ],
    },
  };
}

/** A whole page with a coloured background and a title: `page` in "Capas". */
export function coverPageDraft(): ArsenalPresetDraft {
  return {
    kind: 'page',
    origin: 'ai',
    name: 'Capa azul simples',
    category: 'capas',
    description: 'Fundo azul, título grande e espaço para a foto.',
    tags: ['capa', 'azul'],
    synonyms: ['frente', 'primeira página'],
    payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
    payload: {
      kind: 'page',
      background: { color: '#0b2a4a' },
      safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 },
      tableValues: 'structure-only',
      assets: [],
      objects: [
        {
          id: 'cover-title', type: 'text', zIndex: 0, frame: { xMm: 18, yMm: 40, widthMm: 174, heightMm: 20 },
          text: plainRichText('cover-title', 'Nome do produto (A COMPLETAR)'), style: { fontSizePt: 28, fontWeight: 700, color: '#ffffff' },
        },
        { id: 'cover-photo-box', type: 'shape', shape: 'rectangle', zIndex: 1, frame: { xMm: 40, yMm: 90, widthMm: 130, heightMm: 100 }, style: { fill: '#f2f4f7' } },
      ],
    },
  };
}

/** The 3 × 2 table as a `table` preset; `generic-values` keeps the body. */
export function specTableDraft(tableValues: ArsenalTableValuePolicy = 'structure-only'): ArsenalPresetDraft {
  return {
    kind: 'table',
    origin: 'person',
    name: 'Tabela de especificações',
    category: 'tabelas',
    tags: ['especificações'],
    synonyms: ['ficha técnica'],
    payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
    payload: {
      kind: 'table',
      sizeMm: { widthMm: 174, heightMm: 30 },
      table: contractTable('spec', tableValues === 'structure-only' ? 'structure' : 'with-values'),
      tableValues,
      assets: [],
    },
  };
}

/** Big bold white title: `style` (text) in "Estilos". */
export function titleStyleDraft(): ArsenalPresetDraft {
  return {
    kind: 'style',
    origin: 'person',
    name: 'Título grande branco',
    category: 'estilos',
    tags: ['título'],
    synonyms: [],
    payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
    payload: { kind: 'style', style: { target: 'text', text: { fontSizePt: 20, fontWeight: 700, color: '#ffffff' } } },
  };
}

/** A team preset as the repository returns it, built from a draft (for insertion and gallery tests). */
export function teamPresetFromDraft(
  draft: ArsenalPresetDraft,
  overrides: Partial<Pick<ArsenalPreset, 'id' | 'createdBy' | 'createdByName' | 'useCount' | 'revision'>> = {},
): ArsenalPreset {
  const { payloadSchemaVersion: _version, ...rest } = draft;
  return {
    ...rest,
    id: overrides.id ?? '55555555-5555-4555-8555-555555555555',
    scope: 'team',
    payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
    revision: overrides.revision ?? 1,
    createdBy: overrides.createdBy ?? CONTRACT_ACTORS.author.userId,
    createdByName: overrides.createdByName ?? CONTRACT_ACTORS.author.name,
    createdAt: '2026-10-23T12:00:00.000Z',
    updatedAt: '2026-10-23T12:00:00.000Z',
    useCount: overrides.useCount ?? 0,
    lastUsedAt: null,
  };
}

/** A read-only PRESYS model as the built-in source exposes it. */
export function builtinCoverPreset(): ArsenalPreset {
  const { payloadSchemaVersion: _version, origin: _origin, ...rest } = coverPageDraft();
  return {
    ...rest,
    id: 'builtin:contrato-capa',
    scope: 'builtin',
    origin: 'builtin',
    name: 'Capa PRESYS (embutida)',
    payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
    revision: 1,
    createdBy: null,
    createdByName: null,
    createdAt: null,
    updatedAt: null,
    useCount: 0,
    lastUsedAt: null,
  };
}
