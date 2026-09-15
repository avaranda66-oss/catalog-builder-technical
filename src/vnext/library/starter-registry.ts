import { parseCanonicalDocument } from '../application/document';
import { plainRichText, type CatalogDocument } from '../domain';

export interface CatalogStarterDefinition {
  readonly starterId: string;
  readonly revision: number;
  readonly label: string;
  readonly description?: string;
  readonly category?: string;
  readonly sourceDocument: CatalogDocument;
}

export type CatalogStarterSummary = Omit<CatalogStarterDefinition, 'sourceDocument'>;

export interface CatalogStarterRegistry {
  list(): readonly CatalogStarterSummary[];
  get(starterId: string): CatalogStarterDefinition | undefined;
}

export class CatalogStarterRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogStarterRegistryError';
  }
}

function clean(value: string, field: string): string {
  if (!value || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new CatalogStarterRegistryError(`${field} must be a non-empty clean string`);
  }
  return value;
}

function parseDefinition(definition: CatalogStarterDefinition): CatalogStarterDefinition {
  if (!Number.isSafeInteger(definition.revision) || definition.revision < 0) {
    throw new CatalogStarterRegistryError('revision must be a nonnegative safe integer');
  }
  return {
    starterId: clean(definition.starterId, 'starterId'),
    revision: definition.revision,
    label: clean(definition.label, 'label'),
    ...(definition.description === undefined ? {} : { description: clean(definition.description, 'description') }),
    ...(definition.category === undefined ? {} : { category: clean(definition.category, 'category') }),
    sourceDocument: parseCanonicalDocument(definition.sourceDocument),
  };
}

export function createStaticCatalogStarterRegistry(
  definitions: readonly CatalogStarterDefinition[]
): CatalogStarterRegistry {
  const parsed = definitions.map(parseDefinition);
  const byId = new Map<string, CatalogStarterDefinition>();
  for (const definition of parsed) {
    if (byId.has(definition.starterId)) {
      throw new CatalogStarterRegistryError(`Duplicate starterId: ${definition.starterId}`);
    }
    byId.set(definition.starterId, definition);
  }
  const summaries = parsed.map(({ sourceDocument: _sourceDocument, ...summary }) => summary);
  return {
    list: () => summaries.map((summary) => ({ ...summary })),
    get: (starterId) => byId.get(starterId),
  };
}

const ESSENTIAL_TECHNICAL_SHEET: CatalogDocument = {
  schemaVersion: 1,
  id: 'starter-essential-technical-sheet-source',
  title: 'Ficha técnica essencial',
  locale: 'pt-BR',
  style: {
    fonts: [
      { family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' },
      { family: 'Noto Sans', revision: '5.3.0', weight: 700, style: 'normal' },
    ],
    defaultText: {
      fontFamily: 'Noto Sans',
      fontSizePt: 10,
      lineHeight: 1.25,
      fontWeight: 400,
      color: '#172033',
    },
    palette: ['#003366', '#0072CE', '#172033', '#FFFFFF'],
  },
  pages: [{
    id: 'starter-essential-page',
    widthMm: 210,
    heightMm: 297,
    safeArea: { topMm: 12, rightMm: 12, bottomMm: 12, leftMm: 12 },
    objects: [
      {
        id: 'starter-essential-title',
        type: 'text',
        frame: { xMm: 12, yMm: 12, widthMm: 186, heightMm: 18 },
        zIndex: 0,
        text: plainRichText('starter-essential-title-rich', 'Ficha técnica'),
        style: { fontSizePt: 20, fontWeight: 700, color: '#003366' },
      },
      {
        id: 'starter-essential-table-object',
        type: 'table',
        frame: { xMm: 12, yMm: 42, widthMm: 186, heightMm: 72 },
        zIndex: 1,
        table: {
          id: 'starter-essential-table',
          columns: [
            { id: 'starter-essential-column-label', width: { mode: 'fixed', mm: 68 }, minMm: 30 },
            { id: 'starter-essential-column-value', width: { mode: 'flex', weight: 1 }, minMm: 40 },
          ],
          rows: [
            { id: 'starter-essential-row-model', role: 'body', heightPolicy: { mode: 'AUTO' } },
            { id: 'starter-essential-row-range', role: 'body', heightPolicy: { mode: 'AUTO' } },
          ],
          cells: [
            { id: 'starter-essential-cell-model-label', rowId: 'starter-essential-row-model', columnId: 'starter-essential-column-label', content: { type: 'richText', value: plainRichText('starter-essential-model-label-rich', 'Modelo') } },
            { id: 'starter-essential-cell-model-value', rowId: 'starter-essential-row-model', columnId: 'starter-essential-column-value', content: { type: 'richText', value: plainRichText('starter-essential-model-value-rich', 'Preencha o modelo') } },
            { id: 'starter-essential-cell-range-label', rowId: 'starter-essential-row-range', columnId: 'starter-essential-column-label', content: { type: 'richText', value: plainRichText('starter-essential-range-label-rich', 'Faixa') } },
            { id: 'starter-essential-cell-range-value', rowId: 'starter-essential-row-range', columnId: 'starter-essential-column-value', content: { type: 'richText', value: plainRichText('starter-essential-range-value-rich', 'Preencha a faixa') } },
          ],
          style: {
            base: { paddingMm: { top: 2, right: 2, bottom: 2, left: 2 } },
            rowRoles: {},
            annotation: { fontSizePt: 8 },
            annotationGapMm: 1,
          },
          annotations: [],
          legend: [],
        },
      },
    ],
  }],
  assets: [],
};

export function createDefaultCatalogStarterRegistry(): CatalogStarterRegistry {
  return createStaticCatalogStarterRegistry([{
    starterId: 'essential-technical-sheet',
    revision: 1,
    label: 'Ficha técnica essencial',
    description: 'Título e tabela básica para começar uma ficha de produto.',
    category: 'Ficha técnica',
    sourceDocument: ESSENTIAL_TECHNICAL_SHEET,
  }]);
}
