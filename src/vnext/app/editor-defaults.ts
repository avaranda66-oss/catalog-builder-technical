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

export function resolveKnownW2CDemoAssetUrls(document: CatalogDocument): ReadonlyMap<string, string> {
  const urls = new Map<string, string>();
  for (const asset of document.assets) {
    const known = W2C_DEMO_ASSETS.find((candidate) =>
      candidate.id === asset.id
      && candidate.version === asset.version
      && candidate.sha256 === asset.sha256
      && candidate.mime === asset.mime
      && candidate.widthPx === asset.widthPx
      && candidate.heightPx === asset.heightPx
    );
    const url = known ? W2C_DEMO_ASSET_URLS.get(known.id) : undefined;
    if (url) urls.set(asset.id, url);
  }
  return urls;
}

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

/**
 * Prefer a clear A4 slot instead of adding a new object on top of existing work.
 * This is an authoring convenience only: if the page is full, retain the
 * canonical default so publication preflight can surface the collision.
 */
function clearInsertFrame(page: Page, preferred: ReturnType<typeof frame>): ReturnType<typeof frame> {
  if (!page.objects.length) return preferred;

  const gapU = mmToU(2);
  const stepU = mmToU(2);
  const leftU = mmToU(Math.max(20, page.safeArea?.leftMm ?? 0));
  const topU = mmToU(Math.max(20, page.safeArea?.topMm ?? 0));
  const rightU = mmToU(page.widthMm - Math.max(20, page.safeArea?.rightMm ?? 0));
  const bottomU = mmToU(page.heightMm - Math.max(20, page.safeArea?.bottomMm ?? 0));
  const lastXU = rightU - preferred.widthU;
  const lastYU = bottomU - preferred.heightU;

  const occupied = page.objects.map((object) => frame(
    object.frame.xMm, object.frame.yMm, object.frame.widthMm, object.frame.heightMm
  ));
  const clear = (candidate: ReturnType<typeof frame>): boolean =>
    occupied.every((other) =>
      candidate.xU >= other.xU + other.widthU + gapU
      || candidate.xU + candidate.widthU + gapU <= other.xU
      || candidate.yU >= other.yU + other.heightU + gapU
      || candidate.yU + candidate.heightU + gapU <= other.yU
    );

  const withinSafeArea = (candidate: ReturnType<typeof frame>): boolean =>
    candidate.xU >= leftU && candidate.xU + candidate.widthU <= rightU
    && candidate.yU >= topU && candidate.yU + candidate.heightU <= bottomU;

  if (clear(preferred) && withinSafeArea(preferred)) return preferred;
  if (lastXU < leftU || lastYU < topU) return preferred;
  const startYU = Math.max(topU, preferred.yU);
  const columns = [preferred.xU, leftU, lastXU]
    .filter((xU) => xU >= leftU && xU <= lastXU);
  // Search remaining A4 columns on the same bounded 2 mm grid. A middle
  // column can be free even when the preferred and edge columns are blocked.
  for (let xU = leftU; xU <= lastXU; xU += stepU) {
    if (!columns.includes(xU)) columns.push(xU);
  }

  for (const xU of columns) {
    for (const [start, end] of [[startYU, lastYU], [topU, Math.min(lastYU, startYU - stepU)]]) {
      for (let yU = start; yU <= end; yU += stepU) {
        const candidate = { ...preferred, xU, yU };
        if (clear(candidate)) return candidate;
      }
    }
  }
  return preferred;
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
        frameU: clearInsertFrame(page, frame(20, 20, 82, 22)),
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
        frameU: clearInsertFrame(page, frame(20, 52, 58, 58)),
        zIndex,
        assetId: W2C_PRIMARY_ASSET_ID,
        fit: 'contain',
        focalPoint: { x: 0.5, y: 0.5 },
      };
    case 'table':
      return {
        type: 'table',
        frameU: clearInsertFrame(page, frame(20, 122, 118, 34)),
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
