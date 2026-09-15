import { describe, expect, it } from 'vitest';
import {
  CatalogCloneService,
  ApplicationDocumentError,
  authoredStructuralIdentityIds,
} from '@/vnext/application';
import {
  CatalogDocumentSchema,
  validateDocument,
  type CatalogDocument,
  type EditorialObject,
  type RichText,
  type TableModel,
} from '@/vnext';

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}

function uuidSequence(start = 1000): () => string {
  let next = start;
  return () => uuid(next++);
}

function rich(prefix: string, first: string, second: string): RichText {
  return {
    paragraphs: [
      {
        id: `${prefix}:p1`,
        inlines: [
          { kind: 'text', id: `${prefix}:t1`, text: first, marks: ['bold'] },
          { kind: 'lineBreak', id: `${prefix}:br` },
          { kind: 'text', id: `${prefix}:t2`, text: second, marks: ['italic'] },
        ],
      },
      {
        id: `${prefix}:p2`,
        list: { kind: 'unordered', level: 1 },
        inlines: [{ kind: 'text', id: `${prefix}:t3`, text: 'Detalhe', marks: ['subscript'] }],
      },
    ],
  };
}

function table(): TableModel {
  return {
    id: 'source-table-model',
    columns: [
      { id: 'source-column-a', width: { mode: 'fixed', mm: 35 }, minMm: 20 },
      { id: 'source-column-b', width: { mode: 'flex', weight: 1 }, minMm: 20 },
      { id: 'source-column-c', width: { mode: 'flex', weight: 2 }, minMm: 20 },
    ],
    rows: [
      { id: 'source-row-header', role: 'header', heightPolicy: { mode: 'MIN_MM', minMm: 8 } },
      { id: 'source-row-body', role: 'body', heightPolicy: { mode: 'AUTO' } },
    ],
    cells: [
      {
        id: 'source-cell-ha',
        rowId: 'source-row-header',
        columnId: 'source-column-a',
        content: { type: 'richText', value: rich('cell-rich', 'Código', 'Faixa') },
        span: { rows: 1, columns: 2 },
        annotationIds: ['source-note'],
      },
      {
        id: 'source-cell-hb',
        rowId: 'source-row-header',
        columnId: 'source-column-b',
        content: { type: 'empty' },
        coveredBy: 'source-cell-ha',
      },
      {
        id: 'source-cell-hc',
        rowId: 'source-row-header',
        columnId: 'source-column-c',
        content: { type: 'marker', legendEntryId: 'source-legend' },
      },
      {
        id: 'source-cell-ba',
        rowId: 'source-row-body',
        columnId: 'source-column-a',
        content: { type: 'image', assetId: 'shared-image' },
        contentPresentation: { image: { fit: 'contain', targetWidthMm: 18, targetHeightMm: 12 } },
      },
      {
        id: 'source-cell-bb',
        rowId: 'source-row-body',
        columnId: 'source-column-b',
        content: { type: 'technicalCode', value: 'TT-101' },
      },
      {
        id: 'source-cell-bc',
        rowId: 'source-row-body',
        columnId: 'source-column-c',
        content: { type: 'measurement', valueText: '0.25', unit: '%', qualifier: 'max' },
      },
    ],
    style: {
      base: { paddingMm: { top: 1, right: 1, bottom: 1, left: 1 } },
      rowRoles: { header: { fontWeight: 700 } },
      annotation: { fontSizePt: 8 },
      annotationGapMm: 2,
    },
    annotationIds: ['source-caption'],
    annotations: [
      { id: 'source-caption', kind: 'caption', text: rich('caption-rich', 'Dados', 'técnicos') },
      { id: 'source-note', kind: 'note', text: rich('note-rich', 'Aplicação', 'industrial') },
    ],
    legend: [{ id: 'source-legend', markerCode: '●', text: rich('legend-rich', 'Disponível', 'sob consulta') }],
  };
}

function adversarialDocument(rootId = uuid(1)): CatalogDocument {
  return CatalogDocumentSchema.parse({
    schemaVersion: 1,
    id: rootId,
    title: 'Catálogo industrial completo',
    locale: 'pt-BR',
    style: {
      fonts: [
        { family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' },
        { family: 'Noto Sans', revision: '5.3.0', weight: 700, style: 'italic' },
      ],
      defaultText: { fontFamily: 'Noto Sans', fontSizePt: 9.5, lineHeight: 1.3, color: '#172033' },
      palette: ['#172033', '#0072CE', '#FFFFFF'],
    },
    assets: [{
      id: 'shared-image',
      version: 'immutable-v7',
      sha256: 'a'.repeat(64),
      mime: 'image/png',
      widthPx: 640,
      heightPx: 480,
      name: 'Produto principal',
      alt: 'Produto industrial azul',
    }],
    source: { documentId: 'authored-provenance-document', serverVersion: 17 },
    pages: [
      {
        id: 'source-page-a',
        widthMm: 210,
        heightMm: 297,
        safeArea: { topMm: 9, rightMm: 11, bottomMm: 13, leftMm: 15 },
        objects: [
          {
            id: 'source-text',
            type: 'text',
            frame: { xMm: 15, yMm: 10, widthMm: 90, heightMm: 24 },
            zIndex: 0,
            locked: true,
            text: rich('text-rich', 'Instrumentação', 'de precisão'),
            style: { fontSizePt: 18, fontWeight: 700, color: '#0072CE' },
          },
          {
            id: 'source-table-object',
            type: 'table',
            frame: { xMm: 15, yMm: 42, widthMm: 170, heightMm: 90 },
            zIndex: 1,
            table: table(),
          },
          {
            id: 'source-image-object',
            type: 'image',
            frame: { xMm: 15, yMm: 145, widthMm: 60, heightMm: 45 },
            zIndex: 2,
            assetId: 'shared-image',
            fit: 'cover',
            focalPoint: { x: 0.2, y: 0.75 },
          },
          {
            id: 'source-shape',
            type: 'shape',
            frame: { xMm: 82, yMm: 145, widthMm: 28, heightMm: 20 },
            zIndex: 3,
            shape: 'ellipse',
            style: { fill: '#0072CE', stroke: { pattern: 'solid', thicknessPt: 0.5, color: '#172033' } },
          },
          {
            id: 'source-line',
            type: 'line',
            frame: { xMm: 15, yMm: 200, widthMm: 170, heightMm: 1 },
            zIndex: 4,
            axis: 'horizontal',
            color: '#172033',
          },
          {
            id: 'source-icon-object',
            type: 'icon',
            frame: { xMm: 118, yMm: 145, widthMm: 14, heightMm: 14 },
            zIndex: 5,
            assetId: 'shared-image',
          },
        ],
      },
      {
        id: 'source-page-b',
        widthMm: 210,
        heightMm: 297,
        objects: [
          {
            id: 'source-group',
            type: 'group',
            frame: { xMm: 20, yMm: 20, widthMm: 40, heightMm: 20 },
            zIndex: 9,
            objects: [
              {
                id: 'source-group-text',
                type: 'text',
                frame: { xMm: 0, yMm: 0, widthMm: 30, heightMm: 20 },
                zIndex: 0,
                text: rich('group-rich', 'Grupo', 'independente'),
                style: {},
              },
              {
                id: 'source-group-icon',
                type: 'icon',
                frame: { xMm: 30, yMm: 0, widthMm: 10, heightMm: 20 },
                zIndex: 1,
                assetId: 'shared-image',
              },
            ],
          },
        ],
      },
    ],
  });
}

function tables(document: CatalogDocument): TableModel[] {
  const found: TableModel[] = [];
  const visit = (object: EditorialObject) => {
    if (object.type === 'table') found.push(object.table);
    if (object.type === 'group') object.objects.forEach(visit);
  };
  document.pages.forEach((page) => page.objects.forEach(visit));
  return found;
}

function assertInternalTableReferencesResolve(document: CatalogDocument): void {
  for (const current of tables(document)) {
    const rows = new Set(current.rows.map((row) => row.id));
    const columns = new Set(current.columns.map((column) => column.id));
    const cells = new Set(current.cells.map((cell) => cell.id));
    const annotations = new Set(current.annotations.map((annotation) => annotation.id));
    const legend = new Set(current.legend.map((entry) => entry.id));
    current.cells.forEach((cell) => {
      expect(rows.has(cell.rowId)).toBe(true);
      expect(columns.has(cell.columnId)).toBe(true);
      if (cell.coveredBy) expect(cells.has(cell.coveredBy)).toBe(true);
      cell.annotationIds?.forEach((id) => expect(annotations.has(id)).toBe(true));
      if (cell.content.type === 'marker') expect(legend.has(cell.content.legendEntryId)).toBe(true);
    });
    current.annotationIds?.forEach((id) => expect(annotations.has(id)).toBe(true));
  }
}

function expectApplicationError(action: () => unknown, code: ApplicationDocumentError['code']): void {
  try {
    action();
    throw new Error(`Expected ApplicationDocumentError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationDocumentError);
    expect(error).toMatchObject({ code });
  }
}

describe('W3.F canonical CatalogDocument clone authority', () => {
  it('closes every authored identity, remaps references, shares AssetRefs, and preserves the source', () => {
    const source = adversarialDocument();
    const before = JSON.stringify(source);
    const clone = new CatalogCloneService(uuidSequence()).clone(source, { title: `Cópia de ${source.title}` });
    const sourceIds = new Set(authoredStructuralIdentityIds(source));
    const cloneIds = authoredStructuralIdentityIds(clone);

    expect(clone.id).not.toBe(source.id); // CLONE-01
    expect(clone.pages.map((page) => page.id)).not.toEqual(source.pages.map((page) => page.id)); // CLONE-02
    expect(cloneIds.some((id) => sourceIds.has(id))).toBe(false); // CLONE-03..06
    expect(new Set(cloneIds).size).toBe(cloneIds.length);
    assertInternalTableReferencesResolve(clone); // CLONE-07..08
    expect(clone.assets).toEqual(source.assets); // CLONE-09
    expect(clone.assets[0].id).toBe(source.assets[0].id);
    expect(clone.pages[0].objects.find((object) => object.type === 'image')).toMatchObject({ assetId: 'shared-image' });
    expect(JSON.stringify(source)).toBe(before); // CLONE-10
    expect(validateDocument(clone).filter((diagnostic) => diagnostic.severity === 'ERROR')).toEqual([]); // CLONE-11
    expect(CatalogDocumentSchema.safeParse(clone).success).toBe(true);
    expect(clone.locale).toBe(source.locale);
    expect(clone.style).toEqual(source.style);
    expect(clone.source).toEqual(source.source); // ORIGIN-03 authored source preservation
    expect(clone.pages.map(({ widthMm, heightMm, safeArea }) => ({ widthMm, heightMm, safeArea })))
      .toEqual(source.pages.map(({ widthMm, heightMm, safeArea }) => ({ widthMm, heightMm, safeArea })));
    expect(clone.title).toBe(`Cópia de ${source.title}`);
  });

  it('produces disjoint closures for repeated clones of one source', () => {
    const source = adversarialDocument();
    const service = new CatalogCloneService(uuidSequence(2000));
    const first = service.clone(source);
    const second = service.clone(source);
    const firstIds = new Set(authoredStructuralIdentityIds(first));
    expect(authoredStructuralIdentityIds(second).some((id) => firstIds.has(id))).toBe(false); // CLONE-12
  });

  it('fails closed when generation collides with the source or the clone', () => {
    const source = adversarialDocument();
    expectApplicationError(() => new CatalogCloneService(() => source.id).clone(source), 'DUPLICATE_ID');

    const repeated = uuid(3000);
    expectApplicationError(() => new CatalogCloneService(() => repeated).clone(source), 'DUPLICATE_ID'); // CLONE-13
  });

  it('converts an older valid in-memory root at the clone boundary without mutating it', () => {
    const source = adversarialDocument('legacy-valid-root');
    const before = JSON.stringify(source);
    const clone = new CatalogCloneService(uuidSequence(4000)).clone(source);
    expect(clone.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(clone.id).not.toBe(source.id);
    expect(JSON.stringify(source)).toBe(before); // CLONE-14
  });

  it('rejects a non-persistence-compatible generated clone root', () => {
    const source = adversarialDocument();
    expectApplicationError(() => new CatalogCloneService(() => 'UPPERCASE-OR-NON-UUID').clone(source), 'DOCUMENT_INVALID');
  });
});
