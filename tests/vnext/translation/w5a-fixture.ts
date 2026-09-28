import {
  CatalogDocumentSchema,
  plainRichText,
  type CatalogDocument,
  type RichText,
} from '@/vnext';

export const W5A_CATALOG_ID = '55555555-5555-4555-8555-555555555555';
export const W5A_ASSET_ID = 'w5a-asset-product';

export function w5aRichText(prefix: string): RichText {
  return {
    paragraphs: [
      {
        id: `${prefix}:p1`,
        inlines: [
          { kind: 'text', id: `${prefix}:t1`, text: 'Calibrador PRESYS ', marks: ['bold'] },
          { kind: 'text', id: `${prefix}:t2`, text: 'TA-25N para 0 a 70 bar', marks: ['italic'] },
          { kind: 'lineBreak', id: `${prefix}:br1` },
          { kind: 'text', id: `${prefix}:t3`, text: 'Sinal 4–20 mA conforme ISO/IEC 17025.', marks: [] },
        ],
      },
      {
        id: `${prefix}:p2`,
        list: { kind: 'unordered', level: 1 },
        inlines: [
          { kind: 'text', id: `${prefix}:t4`, text: 'Exatidão ±0.05 % FS e RS-485.', marks: ['subscript'] },
        ],
      },
    ],
  };
}

export function createW5ATranslationDocument(): CatalogDocument {
  return CatalogDocumentSchema.parse({
    schemaVersion: 1,
    id: W5A_CATALOG_ID,
    title: 'Catálogo Técnico PRESYS TA-25N',
    locale: 'pt-BR',
    style: {
      fonts: [
        { family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' },
        { family: 'Noto Sans', revision: '5.3.0', weight: 700, style: 'normal' },
      ],
      defaultText: {
        fontFamily: 'Noto Sans',
        fontSizePt: 10,
        lineHeight: 1.2,
        fontWeight: 400,
        color: '#172033',
        textAlign: 'left',
      },
      palette: ['#172033', '#003366', '#FFFFFF'],
    },
    assets: [{
      id: W5A_ASSET_ID,
      version: 'immutable-v1',
      sha256: 'b'.repeat(64),
      mime: 'image/png',
      widthPx: 800,
      heightPx: 600,
      name: 'Produto TA-25N',
      alt: 'ALT IMUTÁVEL NÃO TRADUZIR',
    }],
    pages: [
      {
        id: 'w5a-page-1',
        widthMm: 210,
        heightMm: 297,
        objects: [
          {
            id: 'w5a-text-main',
            type: 'text',
            frame: { xMm: 15, yMm: 15, widthMm: 120, heightMm: 28 },
            zIndex: 0,
            text: w5aRichText('w5a-text-rich'),
            style: { fontFamily: 'Noto Sans', fontSizePt: 10, lineHeight: 1.2, color: '#172033' },
          },
          {
            id: 'w5a-table-object',
            type: 'table',
            frame: { xMm: 15, yMm: 55, widthMm: 180, heightMm: 120 },
            zIndex: 1,
            table: {
              id: 'w5a-table',
              title: plainRichText('w5a-table-title', 'Especificações técnicas TA-50N'),
              columns: [{ id: 'w5a-column', width: { mode: 'fixed', mm: 180 }, minMm: 30 }],
              rows: [
                { id: 'w5a-row-rich', role: 'header', heightPolicy: { mode: 'AUTO' } },
                { id: 'w5a-row-code', role: 'body', heightPolicy: { mode: 'AUTO' } },
                { id: 'w5a-row-measure', role: 'body', heightPolicy: { mode: 'AUTO' } },
                { id: 'w5a-row-marker', role: 'body', heightPolicy: { mode: 'AUTO' } },
                { id: 'w5a-row-image', role: 'body', heightPolicy: { mode: 'AUTO' } },
                { id: 'w5a-row-empty', role: 'body', heightPolicy: { mode: 'AUTO' } },
              ],
              cells: [
                {
                  id: 'w5a-cell-rich',
                  rowId: 'w5a-row-rich',
                  columnId: 'w5a-column',
                  content: { type: 'richText', value: plainRichText('w5a-cell-rich-text', 'Faixa operacional 0 a 70 bar') },
                },
                {
                  id: 'w5a-cell-code',
                  rowId: 'w5a-row-code',
                  columnId: 'w5a-column',
                  content: { type: 'technicalCode', value: 'PCON-Y18' },
                },
                {
                  id: 'w5a-cell-measure',
                  rowId: 'w5a-row-measure',
                  columnId: 'w5a-column',
                  content: { type: 'measurement', valueText: '0.05', unit: '% FS', qualifier: 'max' },
                },
                {
                  id: 'w5a-cell-marker',
                  rowId: 'w5a-row-marker',
                  columnId: 'w5a-column',
                  content: { type: 'marker', legendEntryId: 'w5a-legend' },
                },
                {
                  id: 'w5a-cell-image',
                  rowId: 'w5a-row-image',
                  columnId: 'w5a-column',
                  content: { type: 'image', assetId: W5A_ASSET_ID },
                  contentPresentation: { image: { fit: 'contain', targetWidthMm: 25, targetHeightMm: 18 } },
                },
                {
                  id: 'w5a-cell-empty',
                  rowId: 'w5a-row-empty',
                  columnId: 'w5a-column',
                  content: { type: 'empty' },
                },
              ],
              style: {
                base: { fontFamily: 'Noto Sans', fontSizePt: 9, lineHeight: 1.2 },
                rowRoles: { header: { fontWeight: 700 } },
                annotation: { fontFamily: 'Noto Sans', fontSizePt: 8, lineHeight: 1.2 },
                annotationGapMm: 1,
              },
              annotationIds: ['w5a-caption'],
              annotations: [
                { id: 'w5a-caption', kind: 'caption', text: plainRichText('w5a-caption-rich', 'Tabela de desempenho') },
                { id: 'w5a-note', kind: 'note', text: plainRichText('w5a-note-rich', 'Uso industrial PRESYS') },
                { id: 'w5a-footnote', kind: 'footnote', text: plainRichText('w5a-footnote-rich', 'Valores a 23 °C') },
              ],
              legend: [{
                id: 'w5a-legend',
                markerCode: '●',
                text: plainRichText('w5a-legend-rich', 'Disponível sob consulta'),
              }],
            },
          },
          {
            id: 'w5a-image',
            type: 'image',
            frame: { xMm: 15, yMm: 190, widthMm: 45, heightMm: 34 },
            zIndex: 2,
            assetId: W5A_ASSET_ID,
            fit: 'contain',
          },
          {
            id: 'w5a-shape',
            type: 'shape',
            frame: { xMm: 70, yMm: 190, widthMm: 25, heightMm: 20 },
            zIndex: 3,
            shape: 'rectangle',
            style: { fill: '#003366' },
          },
          {
            id: 'w5a-line',
            type: 'line',
            frame: { xMm: 15, yMm: 235, widthMm: 160, heightMm: 1 },
            zIndex: 4,
            axis: 'horizontal',
            color: '#172033',
          },
        ],
      },
      {
        id: 'w5a-page-2',
        widthMm: 210,
        heightMm: 297,
        objects: [
          {
            id: 'w5a-group',
            type: 'group',
            frame: { xMm: 20, yMm: 20, widthMm: 50, heightMm: 20 },
            zIndex: 0,
            objects: [
              {
                id: 'w5a-group-text',
                type: 'text',
                frame: { xMm: 0, yMm: 0, widthMm: 40, heightMm: 20 },
                zIndex: 0,
                text: plainRichText('w5a-group-text-rich', 'Grupo com texto técnico PSV-10'),
                style: {},
              },
              {
                id: 'w5a-group-icon',
                type: 'icon',
                frame: { xMm: 40, yMm: 0, widthMm: 10, heightMm: 20 },
                zIndex: 1,
                assetId: W5A_ASSET_ID,
              },
            ],
          },
        ],
      },
    ],
  });
}
