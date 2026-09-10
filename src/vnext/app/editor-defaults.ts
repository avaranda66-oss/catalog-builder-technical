import {
  createCatalogDocument,
  type IdGenerator,
  type ObjectInsertSpec,
} from '../application';
import {
  mmToU,
  plainRichText,
  type AssetRef,
  type CatalogDocument,
  type Page,
  type TableModel,
} from '../domain';

export const W2C_PRIMARY_ASSET_ID = 'w2c-demo-ta25n';
export const W2C_REPLACEMENT_ASSET_ID = 'w2c-demo-replacement';

export const W2C_DEMO_ASSETS: readonly AssetRef[] = [
  {
    id: W2C_PRIMARY_ASSET_ID,
    version: 'w2c-demo-1',
    sha256: '9a3b009caa49f76df16f59b8733dda1c1c5d8459479006c1bcc4b37e7071c067',
    mime: 'image/jpeg',
    widthPx: 545,
    heightPx: 767,
    name: 'PRESYS TA-25N — demonstração W2.C',
    alt: 'Produto PRESYS TA-25N',
  },
  {
    id: W2C_REPLACEMENT_ASSET_ID,
    version: 'w2c-demo-1',
    sha256: '181b540c50524ed4fa6e201b9ec8a3995f1d5351bc58f8112dcc48e992cdfc67',
    mime: 'image/png',
    widthPx: 32,
    heightPx: 32,
    name: 'Recurso alternativo — demonstração W2.C',
    alt: 'Recurso alternativo azul para demonstrar substituição de imagem',
  },
];

export const W2C_DEMO_ASSET_URLS = new Map<string, string>([
  [W2C_PRIMARY_ASSET_ID, '/assets/presys/ta-25n-official.jpg'],
  [W2C_REPLACEMENT_ASSET_ID, '/assets/vnext/w2c-replacement.png'],
]);

export type InsertTool = 'text' | 'image' | 'table' | 'shape' | 'line';

function frame(xMm: number, yMm: number, widthMm: number, heightMm: number) {
  return {
    xU: mmToU(xMm),
    yU: mmToU(yMm),
    widthU: mmToU(widthMm),
    heightU: mmToU(heightMm),
  };
}

function nextZIndex(page: Page): number {
  const current = page.objects.reduce((maximum, object) => Math.max(maximum, object.zIndex), -1);
  return current < Number.MAX_SAFE_INTEGER ? current + 1 : current;
}

export function createMinimalW2CTable(): TableModel {
  return {
    id: 'w2c-table-seed',
    columns: [
      {
        id: 'w2c-table-column',
        width: { mode: 'flex', weight: 1 },
        minMm: 1,
      },
    ],
    rows: [
      {
        id: 'w2c-table-row',
        role: 'body',
        heightPolicy: { mode: 'AUTO' },
      },
    ],
    cells: [
      {
        id: 'w2c-table-cell',
        rowId: 'w2c-table-row',
        columnId: 'w2c-table-column',
        content: { type: 'empty' },
      },
    ],
    style: {
      base: {
        paddingMm: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
        borders: {
          top: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
          right: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
          bottom: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
          left: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
        },
      },
      rowRoles: {},
      annotation: {},
      annotationGapMm: 1,
    },
    annotations: [],
    legend: [],
  };
}

export function createInsertSpec(tool: InsertTool, page: Page): ObjectInsertSpec {
  const zIndex = nextZIndex(page);
  switch (tool) {
    case 'text':
      return {
        type: 'text',
        frameU: frame(20, 20, 82, 22),
        zIndex,
        text: plainRichText('w2c-text-seed', 'Novo texto'),
        style: {
          fontFamily: 'Noto Sans',
          fontSizePt: 16,
          lineHeight: 1.2,
          fontWeight: 700,
          color: '#172033',
          textAlign: 'left',
        },
      };
    case 'image':
      return {
        type: 'image',
        frameU: frame(20, 52, 58, 58),
        zIndex,
        assetId: W2C_PRIMARY_ASSET_ID,
        fit: 'contain',
        focalPoint: { x: 0.5, y: 0.5 },
      };
    case 'table':
      return {
        type: 'table',
        frameU: frame(20, 122, 118, 34),
        zIndex,
        table: createMinimalW2CTable(),
      };
    case 'shape':
      return {
        type: 'shape',
        frameU: frame(112, 20, 58, 28),
        zIndex,
        shape: 'rectangle',
        style: {
          fill: '#edf5ff',
          stroke: { pattern: 'solid', thicknessPt: 1, color: '#003f78' },
        },
      };
    case 'line':
      return {
        type: 'line',
        frameU: frame(20, 170, 118, 0.8),
        zIndex,
        axis: 'horizontal',
        color: '#003366',
      };
  }
}

export function createW2CDemoDocument(createId: IdGenerator): CatalogDocument {
  const base = createCatalogDocument(createId, 'Catálogo PRESYS');
  return {
    ...base,
    assets: W2C_DEMO_ASSETS.map((asset) => ({ ...asset })),
  };
}

export function alternateDemoAssetId(assetId: string): string {
  return assetId === W2C_PRIMARY_ASSET_ID ? W2C_REPLACEMENT_ASSET_ID : W2C_PRIMARY_ASSET_ID;
}
