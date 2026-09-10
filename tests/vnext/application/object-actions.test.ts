import { describe, expect, it } from 'vitest';
import {
  mmToU,
  plainRichText,
  type AssetRef,
  type CatalogDocument,
  type EditorialObject,
  type TableModel,
} from '@/vnext';
import {
  ApplicationActionSchema,
  canonicalIdentityIds,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
  type IdGenerator,
} from '@/vnext/application';
import { compilePlans } from '@/vnext/rendering';

function sequenceIds(prefix = 'id'): IdGenerator {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function countedIds(prefix = 'counted'): { createId: IdGenerator; count: () => number } {
  let generated = 0;
  return {
    createId: () => `${prefix}-${++generated}`,
    count: () => generated,
  };
}

function asset(id: string): AssetRef {
  return {
    id,
    version: 'w2b',
    sha256: id === 'asset-a' ? 'a'.repeat(64) : 'b'.repeat(64),
    mime: 'image/png',
    widthPx: 320,
    heightPx: 200,
    name: id,
    alt: id,
  };
}

function tableSeed(prefix = 'seed'): TableModel {
  return {
    id: `${prefix}-table`,
    columns: [
      { id: `${prefix}-column-a`, width: { mode: 'flex', weight: 1 }, minMm: 20 },
      { id: `${prefix}-column-b`, width: { mode: 'flex', weight: 1 }, minMm: 20 },
    ],
    rows: [
      { id: `${prefix}-row-a`, role: 'body', heightPolicy: { mode: 'AUTO' } },
      { id: `${prefix}-row-b`, role: 'body', heightPolicy: { mode: 'AUTO' } },
    ],
    cells: [
      {
        id: `${prefix}-cell-aa`,
        rowId: `${prefix}-row-a`,
        columnId: `${prefix}-column-a`,
        content: { type: 'richText', value: plainRichText(`${prefix}-cell-rich`, 'Valor') },
        annotationIds: [`${prefix}-note`],
      },
      {
        id: `${prefix}-cell-ab`,
        rowId: `${prefix}-row-a`,
        columnId: `${prefix}-column-b`,
        content: { type: 'marker', legendEntryId: `${prefix}-legend` },
      },
      {
        id: `${prefix}-cell-ba`,
        rowId: `${prefix}-row-b`,
        columnId: `${prefix}-column-a`,
        content: { type: 'empty' },
        span: { rows: 1, columns: 2 },
      },
      {
        id: `${prefix}-cell-bb`,
        rowId: `${prefix}-row-b`,
        columnId: `${prefix}-column-b`,
        content: { type: 'empty' },
        coveredBy: `${prefix}-cell-ba`,
      },
    ],
    style: { base: {}, rowRoles: {}, annotation: {}, annotationGapMm: 1 },
    annotationIds: [`${prefix}-caption`],
    annotations: [
      { id: `${prefix}-caption`, kind: 'caption', text: plainRichText(`${prefix}-caption-rich`, 'Tabela') },
      { id: `${prefix}-note`, kind: 'note', text: plainRichText(`${prefix}-note-rich`, 'Nota') },
    ],
    legend: [
      { id: `${prefix}-legend`, markerCode: 'M', text: plainRichText(`${prefix}-legend-rich`, 'Compatível') },
    ],
  };
}

function baseDocument(): CatalogDocument {
  const document = createCatalogDocument(sequenceIds('base'), 'W2.B');
  return { ...document, assets: [asset('asset-a'), asset('asset-b')] };
}

function allPrimitiveDocument(): CatalogDocument {
  const document = baseDocument();
  const page = document.pages[0];
  const objects: EditorialObject[] = [
    {
      id: 'text-object',
      type: 'text',
      frame: { xMm: 12, yMm: 12, widthMm: 80, heightMm: 20 },
      zIndex: 0,
      text: plainRichText('text-local', 'PRESYS'),
      style: { fontSizePt: 10, color: '#172033' },
    },
    {
      id: 'image-object',
      type: 'image',
      frame: { xMm: 12, yMm: 36, widthMm: 40, heightMm: 24 },
      zIndex: 1,
      assetId: 'asset-a',
      fit: 'cover',
      focalPoint: { x: 0.2, y: 0.8 },
    },
    {
      id: 'table-object',
      type: 'table',
      frame: { xMm: 12, yMm: 64, widthMm: 120, heightMm: 60 },
      zIndex: 2,
      table: tableSeed('source'),
    },
    {
      id: 'shape-object',
      type: 'shape',
      frame: { xMm: 140, yMm: 64, widthMm: 30, heightMm: 20 },
      zIndex: 3,
      shape: 'ellipse',
      style: { fill: '#173F52', stroke: { pattern: 'solid', thicknessPt: 1, color: '#FFFFFF' } },
    },
    {
      id: 'line-object',
      type: 'line',
      frame: { xMm: 12, yMm: 130, widthMm: 100, heightMm: 1 },
      zIndex: 4,
      axis: 'horizontal',
      color: '#173F52',
    },
    {
      id: 'icon-object',
      type: 'icon',
      frame: { xMm: 140, yMm: 92, widthMm: 12, heightMm: 12 },
      zIndex: 5,
      assetId: 'asset-a',
    },
  ];
  return { ...document, pages: [{ ...page, objects }] };
}

function structuralTableIds(table: TableModel): string[] {
  return [
    table.id,
    ...table.columns.map((column) => column.id),
    ...table.rows.map((row) => row.id),
    ...table.cells.map((cell) => cell.id),
    ...table.annotations.map((annotation) => annotation.id),
    ...table.legend.map((entry) => entry.id),
  ];
}

function localRichTextIds(table: TableModel): string[] {
  const ids: string[] = [];
  for (const cell of table.cells) {
    if (cell.content.type === 'richText') {
      ids.push(...cell.content.value.paragraphs.flatMap((paragraph) => [
        paragraph.id,
        ...paragraph.inlines.map((inline) => inline.id),
      ]));
    }
  }
  for (const annotation of table.annotations) {
    ids.push(...annotation.text.paragraphs.flatMap((paragraph) => [
      paragraph.id,
      ...paragraph.inlines.map((inline) => inline.id),
    ]));
  }
  for (const entry of table.legend) {
    ids.push(...entry.text.paragraphs.flatMap((paragraph) => [
      paragraph.id,
      ...paragraph.inlines.map((inline) => inline.id),
    ]));
  }
  return ids;
}

function findObject(document: CatalogDocument, objectId: string): EditorialObject {
  const object = document.pages.flatMap((page) => page.objects).find((entry) => entry.id === objectId);
  if (!object) throw new Error(`Object not found: ${objectId}`);
  return object;
}

function visualOrder(document: CatalogDocument): string[] {
  return document.pages[0].objects
    .map((object, index) => ({ object, index }))
    .sort((left, right) => left.object.zIndex - right.object.zIndex || left.index - right.index)
    .map(({ object }) => object.id);
}

const frameU = { xU: 100_000, yU: 200_000, widthU: 300_000, heightU: 100_000 };

function insertSpecs(): Record<EditorialObject['type'], Record<string, unknown>> {
  return {
    text: {
      type: 'text',
      frameU,
      zIndex: 10,
      text: plainRichText('caller-text', 'Texto'),
      style: { fontSizePt: 11, color: '#172033' },
    },
    image: {
      type: 'image',
      frameU,
      zIndex: 11,
      assetId: 'asset-a',
      fit: 'cover',
      focalPoint: { x: 0.25, y: 0.75 },
    },
    table: {
      type: 'table',
      frameU: { ...frameU, widthU: 1_200_000, heightU: 600_000 },
      zIndex: 12,
      table: tableSeed('caller'),
    },
    shape: {
      type: 'shape',
      frameU,
      zIndex: 13,
      shape: 'rectangle',
      style: { fill: '#173F52', stroke: { pattern: 'solid', thicknessPt: 1, color: '#FFFFFF' } },
    },
    line: {
      type: 'line',
      frameU: { ...frameU, heightU: 10_000 },
      zIndex: 14,
      axis: 'vertical',
      color: '#173F52',
    },
    icon: {
      type: 'icon',
      frameU,
      zIndex: 15,
      assetId: 'asset-a',
    },
  };
}

describe('W2.B action contracts and geometry', () => {
  it('strictly validates every W2.B action and rejects unknown fields/caller object IDs', () => {
    const pageId = 'page';
    const validActions: unknown[] = [
      { type: 'object.insert', pageId, object: insertSpecs().text },
      { type: 'object.delete', objectId: 'object' },
      { type: 'object.duplicate', objectId: 'object', xU: -1, yU: 2 },
      { type: 'object.move', objectId: 'object', xU: -1, yU: -2 },
      { type: 'object.resize', objectId: 'object', xU: -1, yU: -2, widthU: 1, heightU: 1 },
      { type: 'object.reorder', objectId: 'object', targetIndex: 0 },
      { type: 'image.replace', objectId: 'object', assetId: 'asset-a' },
    ];

    for (const action of validActions) {
      expect(ApplicationActionSchema.safeParse(action).success).toBe(true);
      expect(ApplicationActionSchema.safeParse({ ...(action as object), surprise: true }).success).toBe(false);
    }
    expect(ApplicationActionSchema.safeParse({
      type: 'object.insert',
      pageId,
      object: { ...insertSpecs().text, id: 'caller-controlled' },
    }).success).toBe(false);

    for (const invalidGeometry of [
      { type: 'object.resize', objectId: 'object', xU: 0, yU: 0, widthU: 0, heightU: 1 },
      { type: 'object.resize', objectId: 'object', xU: 0, yU: 0, widthU: 1, heightU: 0 },
      { type: 'object.move', objectId: 'object', xU: 0.5, yU: 0 },
      { type: 'object.move', objectId: 'object', xU: Number.MAX_SAFE_INTEGER + 1, yU: 0 },
    ]) {
      expect(ApplicationActionSchema.safeParse(invalidGeometry).success).toBe(false);
    }
  });

  it('accepts negative coordinates and 1U dimensions with exact U→mm→U materialization', () => {
    const document = allPrimitiveDocument();
    const moved = executeApplicationAction(
      document,
      { type: 'object.move', objectId: 'text-object', xU: -123_456, yU: -1 },
      { createId: sequenceIds('unused') }
    );
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const movedText = findObject(moved.document, 'text-object');
    expect(mmToU(movedText.frame.xMm)).toBe(-123_456);
    expect(mmToU(movedText.frame.yMm)).toBe(-1);
    expect(movedText.frame.widthMm).toBe(80);
    expect(movedText.frame.heightMm).toBe(20);

    const resized = executeApplicationAction(
      moved.document,
      { type: 'object.resize', objectId: 'text-object', xU: -10, yU: -20, widthU: 1, heightU: 1 },
      { createId: sequenceIds('unused') }
    );
    expect(resized.ok).toBe(true);
    if (!resized.ok) return;
    const resizedText = findObject(resized.document, 'text-object');
    expect([
      mmToU(resizedText.frame.xMm),
      mmToU(resizedText.frame.yMm),
      mmToU(resizedText.frame.widthMm),
      mmToU(resizedText.frame.heightMm),
    ]).toEqual([-10, -20, 1, 1]);
  });

  it('uses U equality for move/resize semantic no-ops without rewriting frames', () => {
    const document = allPrimitiveDocument();
    const original = findObject(document, 'text-object');
    const move = executeApplicationAction(
      document,
      { type: 'object.move', objectId: 'text-object', xU: 120_000, yU: 120_000 },
      { createId: sequenceIds('unused') }
    );
    expect(move).toMatchObject({ ok: true, metadata: { changed: false } });
    if (!move.ok) return;
    expect(findObject(move.document, 'text-object').frame).toEqual(original.frame);

    const resize = executeApplicationAction(
      document,
      { type: 'object.resize', objectId: 'text-object', xU: 120_000, yU: 120_000, widthU: 800_000, heightU: 200_000 },
      { createId: sequenceIds('unused') }
    );
    expect(resize).toMatchObject({ ok: true, metadata: { changed: false } });
    if (!resize.ok) return;
    expect(findObject(resize.document, 'text-object').frame).toEqual(original.frame);
  });
});

describe('W2.B insert and fresh identity instantiation', () => {
  it('inserts all six W2.A primitives with fresh identities and preserved asset references', () => {
    let document = baseDocument();
    const originalAssets = JSON.stringify(document.assets);
    const ids = sequenceIds('inserted');
    const specs = insertSpecs();
    const inserted = new Map<string, EditorialObject>();

    for (const type of ['text', 'image', 'table', 'shape', 'line', 'icon'] as const) {
      const result = executeApplicationAction(
        document,
        { type: 'object.insert', pageId: document.pages[0].id, object: specs[type] },
        { createId: ids }
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.metadata.createdIds.length).toBe(type === 'table' ? 13 : 1);
      const object = findObject(result.document, result.metadata.createdIds[0]);
      expect(object.type).toBe(type);
      inserted.set(type, object);
      document = result.document;
    }

    const text = inserted.get('text');
    expect(text?.type).toBe('text');
    if (text?.type === 'text') {
      expect(text.text.paragraphs[0].id).not.toBe('caller-text:p');
      expect(text.text.paragraphs[0].inlines[0].id).not.toBe('caller-text:t');
    }

    const table = inserted.get('table');
    expect(table?.type).toBe('table');
    if (table?.type === 'table') {
      const seed = tableSeed('caller');
      expect(structuralTableIds(table.table).some((id) => structuralTableIds(seed).includes(id))).toBe(false);
      expect(localRichTextIds(table.table).some((id) => localRichTextIds(seed).includes(id))).toBe(false);
      const marker = table.table.cells.find((cell) => cell.content.type === 'marker');
      const covered = table.table.cells.find((cell) => cell.coveredBy);
      expect(marker?.content.type).toBe('marker');
      const markerContent = marker?.content;
      if (markerContent?.type === 'marker') {
        expect(table.table.legend.some((entry) => entry.id === markerContent.legendEntryId)).toBe(true);
      }
      expect(covered?.coveredBy).toBe(table.table.cells.find((cell) => cell.span)?.id);
      expect(table.table.cells[0].annotationIds?.[0]).toBe(table.table.annotations.find((annotation) => annotation.kind === 'note')?.id);
      expect(table.table.annotationIds?.[0]).toBe(table.table.annotations.find((annotation) => annotation.kind === 'caption')?.id);
    }

    const image = inserted.get('image');
    const icon = inserted.get('icon');
    expect(image?.type === 'image' ? image.assetId : undefined).toBe('asset-a');
    expect(icon?.type === 'icon' ? icon.assetId : undefined).toBe('asset-a');
    expect(JSON.stringify(document.assets)).toBe(originalAssets);
    const allIds = canonicalIdentityIds(document);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('fails known insert conditions before avoidable ID allocation', () => {
    const document = baseDocument();
    const badTable = tableSeed('bad-table');
    const cases: unknown[] = [
      { type: 'object.insert', pageId: 'missing-page', object: insertSpecs().text },
      { type: 'object.insert', pageId: document.pages[0].id, object: { ...insertSpecs().image, assetId: 'missing-asset' } },
      { type: 'object.insert', pageId: document.pages[0].id, object: { ...insertSpecs().icon, assetId: 'missing-asset' } },
      {
        type: 'object.insert',
        pageId: document.pages[0].id,
        object: {
          ...insertSpecs().table,
          table: {
            ...badTable,
            cells: badTable.cells.map((cell, index) => index === 1
              ? { ...cell, content: { type: 'marker', legendEntryId: 'missing-legend' } }
              : cell),
          },
        },
      },
      {
        type: 'object.insert',
        pageId: document.pages[0].id,
        object: { ...insertSpecs().shape, frameU: { ...frameU, widthU: 0 } },
      },
    ];

    for (const action of cases) {
      const ids = countedIds();
      const before = JSON.stringify(document);
      const result = executeApplicationAction(document, action, { createId: ids.createId });
      expect(result.ok).toBe(false);
      expect(ids.count()).toBe(0);
      expect(JSON.stringify(document)).toBe(before);
    }

    expect(executeApplicationAction(
      document,
      { type: 'object.insert', pageId: document.pages[0].id, object: { ...insertSpecs().image, assetId: 'missing-asset' } },
      { createId: sequenceIds('unused') }
    )).toMatchObject({ ok: false, error: { code: 'ASSET_NOT_FOUND' } });
  });
});

describe('W2.B duplicate, lock and target semantics', () => {
  it('deeply duplicates all six primitives without duplicating assets or mutating the source', () => {
    const document = allPrimitiveDocument();
    const before = JSON.stringify(document);

    for (const source of document.pages[0].objects) {
      const result = executeApplicationAction(
        document,
        { type: 'object.duplicate', objectId: source.id },
        { createId: sequenceIds(`duplicate-${source.type}`) }
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const duplicate = findObject(result.document, result.metadata.createdIds[0]);
      expect(duplicate.id).not.toBe(source.id);
      expect(duplicate.type).toBe(source.type);
      expect(duplicate.frame).toEqual(source.frame);
      expect(duplicate.zIndex).toBe(source.zIndex);
      const sourceIndex = result.document.pages[0].objects.findIndex((entry) => entry.id === source.id);
      expect(result.document.pages[0].objects[sourceIndex + 1].id).toBe(duplicate.id);
      expect(result.document.assets).toEqual(document.assets);

      if (source.type === 'text' && duplicate.type === 'text') {
        expect(duplicate.text.paragraphs[0].id).not.toBe(source.text.paragraphs[0].id);
        expect(duplicate.text.paragraphs[0].inlines[0].id).not.toBe(source.text.paragraphs[0].inlines[0].id);
      }
      if (source.type === 'table' && duplicate.type === 'table') {
        expect(structuralTableIds(duplicate.table).some((id) => structuralTableIds(source.table).includes(id))).toBe(false);
        expect(localRichTextIds(duplicate.table).some((id) => localRichTextIds(source.table).includes(id))).toBe(false);
        const marker = duplicate.table.cells.find((cell) => cell.content.type === 'marker');
        const covered = duplicate.table.cells.find((cell) => cell.coveredBy);
        expect(marker?.content.type).toBe('marker');
        const markerContent = marker?.content;
        if (markerContent?.type === 'marker') {
          expect(duplicate.table.legend.some((entry) => entry.id === markerContent.legendEntryId)).toBe(true);
        }
        expect(covered?.coveredBy).toBe(duplicate.table.cells.find((cell) => cell.span)?.id);
      }
    }

    expect(JSON.stringify(document)).toBe(before);
  });

  it('uses optional duplicate x/y as final U coordinates and preserves source size', () => {
    const document = allPrimitiveDocument();
    const result = executeApplicationAction(
      document,
      { type: 'object.duplicate', objectId: 'image-object', xU: -12_345, yU: 999_999 },
      { createId: sequenceIds('positioned') }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const duplicate = findObject(result.document, result.metadata.createdIds[0]);
    expect(mmToU(duplicate.frame.xMm)).toBe(-12_345);
    expect(mmToU(duplicate.frame.yMm)).toBe(999_999);
    expect(duplicate.frame.widthMm).toBe(40);
    expect(duplicate.frame.heightMm).toBe(24);
  });

  it('rejects missing and locked targets before allocation or mutation', () => {
    const document = allPrimitiveDocument();
    const missingIds = countedIds('missing');
    expect(executeApplicationAction(
      document,
      { type: 'object.duplicate', objectId: 'missing' },
      { createId: missingIds.createId }
    )).toMatchObject({ ok: false, error: { code: 'OBJECT_NOT_FOUND' } });
    expect(missingIds.count()).toBe(0);

    const lockedText: CatalogDocument = {
      ...document,
      pages: [{
        ...document.pages[0],
        objects: document.pages[0].objects.map((object) => object.id === 'text-object'
          ? { ...object, locked: true }
          : object),
      }],
    };
    const lockedImage: CatalogDocument = {
      ...document,
      pages: [{
        ...document.pages[0],
        objects: document.pages[0].objects.map((object) => object.id === 'image-object'
          ? { ...object, locked: true }
          : object),
      }],
    };
    const lockedIds = countedIds('locked');
    const lockedCases: Array<{ document: CatalogDocument; action: unknown }> = [
      { document: lockedText, action: { type: 'object.delete', objectId: 'text-object' } },
      { document: lockedText, action: { type: 'object.duplicate', objectId: 'text-object' } },
      { document: lockedText, action: { type: 'object.move', objectId: 'text-object', xU: 1, yU: 1 } },
      { document: lockedText, action: { type: 'object.resize', objectId: 'text-object', xU: 1, yU: 1, widthU: 1, heightU: 1 } },
      { document: lockedText, action: { type: 'object.reorder', objectId: 'text-object', targetIndex: 0 } },
      { document: lockedImage, action: { type: 'image.replace', objectId: 'image-object', assetId: 'asset-b' } },
    ];

    for (const entry of lockedCases) {
      expect(executeApplicationAction(
        entry.document,
        entry.action,
        { createId: lockedIds.createId }
      )).toMatchObject({ ok: false, error: { code: 'OBJECT_LOCKED' } });
    }
    expect(lockedIds.count()).toBe(0);
  });
});

describe('W2.B reorder and image replacement', () => {
  it('reorders against visual order and normalizes equal, negative, gapped zIndex deterministically', () => {
    const document = baseDocument();
    const page = document.pages[0];
    const objects: EditorialObject[] = [
      { id: 'a', type: 'shape', frame: { xMm: 1, yMm: 1, widthMm: 1, heightMm: 1 }, zIndex: 5, shape: 'rectangle', style: {} },
      { id: 'b', type: 'shape', frame: { xMm: 2, yMm: 2, widthMm: 1, heightMm: 1 }, zIndex: -10, shape: 'rectangle', style: {} },
      { id: 'c', type: 'shape', frame: { xMm: 3, yMm: 3, widthMm: 1, heightMm: 1 }, zIndex: 5, shape: 'rectangle', style: {} },
      { id: 'd', type: 'shape', frame: { xMm: 4, yMm: 4, widthMm: 1, heightMm: 1 }, zIndex: Number.MAX_SAFE_INTEGER, shape: 'rectangle', style: {} },
    ];
    const candidate = { ...document, pages: [{ ...page, objects }] };
    expect(visualOrder(candidate)).toEqual(['b', 'a', 'c', 'd']);

    const noOp = executeApplicationAction(
      candidate,
      { type: 'object.reorder', objectId: 'c', targetIndex: 2 },
      { createId: sequenceIds('unused') }
    );
    expect(noOp).toMatchObject({ ok: true, metadata: { changed: false } });
    if (!noOp.ok) return;
    expect(noOp.document.pages[0].objects.map((object) => object.zIndex))
      .toEqual([5, -10, 5, Number.MAX_SAFE_INTEGER]);

    const reordered = executeApplicationAction(
      candidate,
      { type: 'object.reorder', objectId: 'c', targetIndex: 0 },
      { createId: sequenceIds('unused') }
    );
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(reordered.document.pages[0].objects.map((object) => object.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(reordered.document.pages[0].objects.map((object) => object.zIndex)).toEqual([0, 1, 2, 3]);
    expect(visualOrder(reordered.document)).toEqual(['c', 'b', 'a', 'd']);
    expect(new Set(reordered.metadata.affectedIds)).toEqual(new Set(['a', 'b', 'c', 'd']));

    expect(executeApplicationAction(
      candidate,
      { type: 'object.reorder', objectId: 'a', targetIndex: 4 },
      { createId: sequenceIds('unused') }
    )).toMatchObject({ ok: false, error: { code: 'INVALID_Z_ORDER_TARGET' } });
  });

  it('replaces only Image assetId and rejects same asset, missing assets, and wrong target type correctly', () => {
    const document = allPrimitiveDocument();
    const source = findObject(document, 'image-object');
    expect(source.type).toBe('image');
    if (source.type !== 'image') return;

    const replaced = executeApplicationAction(
      document,
      { type: 'image.replace', objectId: 'image-object', assetId: 'asset-b' },
      { createId: sequenceIds('unused') }
    );
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(findObject(replaced.document, 'image-object')).toEqual({ ...source, assetId: 'asset-b' });

    expect(executeApplicationAction(
      document,
      { type: 'image.replace', objectId: 'image-object', assetId: 'asset-a' },
      { createId: sequenceIds('unused') }
    )).toMatchObject({ ok: true, metadata: { changed: false } });
    expect(executeApplicationAction(
      document,
      { type: 'image.replace', objectId: 'image-object', assetId: 'missing' },
      { createId: sequenceIds('unused') }
    )).toMatchObject({ ok: false, error: { code: 'ASSET_NOT_FOUND' } });
    expect(executeApplicationAction(
      document,
      { type: 'image.replace', objectId: 'shape-object', assetId: 'asset-b' },
      { createId: sequenceIds('unused') }
    )).toMatchObject({ ok: false, error: { code: 'OBJECT_TYPE_MISMATCH' } });
  });
});

describe('W2.B Table frame immutability and diagnostics', () => {
  it('moves/resizes Table frame without changing TableModel and commits width-infeasible geometry', () => {
    const document = allPrimitiveDocument();
    const source = findObject(document, 'table-object');
    expect(source.type).toBe('table');
    if (source.type !== 'table') return;
    const tableBefore = JSON.stringify(source.table);

    const moved = executeApplicationAction(
      document,
      { type: 'object.move', objectId: 'table-object', xU: -50_000, yU: 777_777 },
      { createId: sequenceIds('unused') }
    );
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const movedTable = findObject(moved.document, 'table-object');
    expect(movedTable.type).toBe('table');
    if (movedTable.type !== 'table') return;
    expect(JSON.stringify(movedTable.table)).toBe(tableBefore);

    const resized = executeApplicationAction(
      moved.document,
      {
        type: 'object.resize',
        objectId: 'table-object',
        xU: -60_000,
        yU: 700_000,
        widthU: 1,
        heightU: 600_000,
      },
      { createId: sequenceIds('unused') }
    );
    expect(resized.ok).toBe(true);
    if (!resized.ok) return;
    const resizedTable = findObject(resized.document, 'table-object');
    expect(resizedTable.type).toBe('table');
    if (resizedTable.type !== 'table') return;
    expect(mmToU(resizedTable.frame.widthMm)).toBe(1);
    expect(JSON.stringify(resizedTable.table)).toBe(tableBefore);

    const compiled = compilePlans(resized.document);
    expect(compiled.plans.has(resizedTable.table.id)).toBe(false);
    expect(compiled.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TABLE_WIDTH_INFEASIBLE',
        objectId: 'table-object',
        tableId: resizedTable.table.id,
      }),
    ]));
  });
});

describe('W2.B DocumentSession history', () => {
  it('Undo/Redo restores exact snapshots for all seven actions without reallocating insert/duplicate IDs', () => {
    const ids = countedIds('history');
    const initial = allPrimitiveDocument();
    const session = createDocumentSession(initial, { createId: ids.createId });
    const snapshots = [JSON.stringify(session.getSnapshot().document)];
    const actions = [
      { type: 'object.insert', pageId: initial.pages[0].id, object: insertSpecs().shape },
      { type: 'object.delete', objectId: 'line-object' },
      { type: 'object.duplicate', objectId: 'text-object', xU: 900_000, yU: 900_000 },
      { type: 'object.move', objectId: 'image-object', xU: -10_000, yU: 500_000 },
      { type: 'object.resize', objectId: 'shape-object', xU: 1_000_000, yU: 1_000_000, widthU: 250_000, heightU: 150_000 },
      { type: 'object.reorder', objectId: 'icon-object', targetIndex: 0 },
      { type: 'image.replace', objectId: 'image-object', assetId: 'asset-b' },
    ].map((action) => ApplicationActionSchema.parse(action));

    for (const action of actions) {
      const result = session.execute(action);
      expect(result.ok).toBe(true);
      snapshots.push(JSON.stringify(session.getSnapshot().document));
    }
    const allocationsAfterCommit = ids.count();

    for (let index = actions.length - 1; index >= 0; index -= 1) {
      expect(session.undo().ok).toBe(true);
      expect(JSON.stringify(session.getSnapshot().document)).toBe(snapshots[index]);
    }
    for (let index = 1; index < snapshots.length; index += 1) {
      expect(session.redo().ok).toBe(true);
      expect(JSON.stringify(session.getSnapshot().document)).toBe(snapshots[index]);
    }
    expect(ids.count()).toBe(allocationsAfterCommit);
  });

  it('preserves Redo across representative W2.B semantic no-ops', () => {
    const initial = allPrimitiveDocument();
    const session = createDocumentSession(initial, { createId: sequenceIds('redo') });
    expect(session.execute({ type: 'object.move', objectId: 'text-object', xU: 130_000, yU: 130_000 }).ok).toBe(true);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().canRedo).toBe(true);

    const current = session.getSnapshot().document;
    const image = findObject(current, 'image-object');
    const shape = findObject(current, 'shape-object');
    const shapeVisualIndex = visualOrder(current).indexOf('shape-object');
    const noOps = [
      { type: 'object.move', objectId: 'text-object', xU: 120_000, yU: 120_000 },
      {
        type: 'object.resize',
        objectId: 'shape-object',
        xU: mmToU(shape.frame.xMm),
        yU: mmToU(shape.frame.yMm),
        widthU: mmToU(shape.frame.widthMm),
        heightU: mmToU(shape.frame.heightMm),
      },
      { type: 'object.reorder', objectId: 'shape-object', targetIndex: shapeVisualIndex },
      { type: 'image.replace', objectId: 'image-object', assetId: image.type === 'image' ? image.assetId : 'asset-a' },
    ] as const;

    for (const action of noOps) {
      expect(session.execute(action)).toMatchObject({ ok: true, metadata: { changed: false } });
      expect(session.getSnapshot().canRedo).toBe(true);
    }
    expect(session.redo().ok).toBe(true);
    expect(mmToU(findObject(session.getSnapshot().document, 'text-object').frame.xMm)).toBe(130_000);
  });

  it('preserves history/Redo on failure and coalesces contiguous W2.B transactions', () => {
    const initial = allPrimitiveDocument();
    const session = createDocumentSession(initial, { createId: sequenceIds('session') });
    session.execute({ type: 'object.move', objectId: 'text-object', xU: 130_000, yU: 130_000 });
    session.undo();
    expect(session.getSnapshot().canRedo).toBe(true);
    expect(session.execute({ type: 'image.replace', objectId: 'image-object', assetId: 'missing' }))
      .toMatchObject({ ok: false, error: { code: 'ASSET_NOT_FOUND' } });
    expect(session.getSnapshot().canRedo).toBe(true);
    expect(session.redo().ok).toBe(true);

    const coalesced = createDocumentSession(initial, { createId: sequenceIds('coalesced') });
    coalesced.execute(
      { type: 'object.move', objectId: 'text-object', xU: 130_000, yU: 130_000 },
      { transactionId: 'move-1' }
    );
    coalesced.execute(
      { type: 'object.move', objectId: 'text-object', xU: 140_000, yU: 150_000 },
      { transactionId: 'move-1' }
    );
    expect(mmToU(findObject(coalesced.getSnapshot().document, 'text-object').frame.xMm)).toBe(140_000);
    expect(coalesced.undo().ok).toBe(true);
    expect(findObject(coalesced.getSnapshot().document, 'text-object').frame)
      .toEqual(findObject(initial, 'text-object').frame);
    expect(coalesced.getSnapshot().canUndo).toBe(false);
  });
});
