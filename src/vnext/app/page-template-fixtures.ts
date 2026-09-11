import { plainRichText, type TableModel } from '../domain';
import type { ObjectInstantiationSeed } from '../application/document';
import type { PageTemplateDefinition } from '../application/template-registry';
import { W2C_PRIMARY_ASSET_ID } from './editor-defaults';

export const W2E_PAGE_TEMPLATE_ID = 'w2e-product-sheet';

function representativeTable(): TableModel {
  return {
    id: 'w2e-table',
    columns: [
      { id: 'w2e-column-a', width: { mode: 'flex', weight: 1 }, minMm: 20 },
      { id: 'w2e-column-b', width: { mode: 'flex', weight: 1 }, minMm: 20 },
      { id: 'w2e-column-c', width: { mode: 'flex', weight: 1 }, minMm: 20 },
    ],
    rows: [
      { id: 'w2e-row-a', role: 'body', heightPolicy: { mode: 'AUTO' } },
      { id: 'w2e-row-b', role: 'body', heightPolicy: { mode: 'AUTO' } },
    ],
    cells: [
      {
        id: 'w2e-cell-aa', rowId: 'w2e-row-a', columnId: 'w2e-column-a',
        content: { type: 'richText', value: plainRichText('w2e-cell-rich', 'Faixa') },
        annotationIds: ['w2e-note'],
      },
      {
        id: 'w2e-cell-ab', rowId: 'w2e-row-a', columnId: 'w2e-column-b',
        content: { type: 'marker', legendEntryId: 'w2e-legend' },
      },
      {
        id: 'w2e-cell-ac', rowId: 'w2e-row-a', columnId: 'w2e-column-c',
        content: { type: 'image', assetId: W2C_PRIMARY_ASSET_ID },
        contentPresentation: { image: { fit: 'contain', targetWidthMm: 16, targetHeightMm: 12 } },
      },
      {
        id: 'w2e-cell-ba', rowId: 'w2e-row-b', columnId: 'w2e-column-a',
        content: { type: 'empty' }, span: { rows: 1, columns: 2 },
      },
      {
        id: 'w2e-cell-bb', rowId: 'w2e-row-b', columnId: 'w2e-column-b',
        content: { type: 'empty' }, coveredBy: 'w2e-cell-ba',
      },
      {
        id: 'w2e-cell-bc', rowId: 'w2e-row-b', columnId: 'w2e-column-c',
        content: { type: 'technicalCode', value: 'TA-25N' },
      },
    ],
    style: { base: { paddingMm: { top: 1, right: 1, bottom: 1, left: 1 } }, rowRoles: {}, annotation: {}, annotationGapMm: 1 },
    annotationIds: ['w2e-caption'],
    annotations: [
      { id: 'w2e-caption', kind: 'caption', text: plainRichText('w2e-caption-rich', 'Dados técnicos') },
      { id: 'w2e-note', kind: 'note', text: plainRichText('w2e-note-rich', 'Conforme configuração') },
    ],
    legend: [
      { id: 'w2e-legend', markerCode: 'M', text: plainRichText('w2e-legend-rich', 'Modelo disponível') },
    ],
  };
}

const objects: readonly ObjectInstantiationSeed[] = [
  {
    type: 'text',
    frame: { xMm: 18, yMm: 20, widthMm: 108, heightMm: 20 },
    zIndex: 0,
    text: plainRichText('w2e-title-rich', 'PRESYS · Folha de produto'),
    style: { fontFamily: 'Noto Sans', fontSizePt: 16, lineHeight: 1.2, fontWeight: 700, color: '#172033' },
  },
  {
    type: 'shape',
    frame: { xMm: 132, yMm: 20, widthMm: 60, heightMm: 20 },
    zIndex: 1,
    shape: 'rectangle',
    style: { fill: '#EDF5FF', stroke: { pattern: 'solid', thicknessPt: 1, color: '#003366' } },
  },
  {
    type: 'image',
    frame: { xMm: 18, yMm: 50, widthMm: 54, heightMm: 72 },
    zIndex: 2,
    assetId: W2C_PRIMARY_ASSET_ID,
    fit: 'contain',
    focalPoint: { x: 0.5, y: 0.5 },
  },
  {
    type: 'table',
    frame: { xMm: 78, yMm: 50, widthMm: 114, heightMm: 72 },
    zIndex: 3,
    table: representativeTable(),
  },
];

export const W2E_PAGE_TEMPLATE: PageTemplateDefinition = {
  id: W2E_PAGE_TEMPLATE_ID,
  label: 'Folha de produto',
  description: 'Fixture W2.E para inserção canônica de página',
  safeArea: { topMm: 12, rightMm: 12, bottomMm: 12, leftMm: 12 },
  objects,
};
