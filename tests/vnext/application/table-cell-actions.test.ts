import { describe, expect, it } from 'vitest';
import {
  ApplicationActionSchema,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
  projectEditableRichText,
  type CellPropertyPatch,
  type IdGenerator,
  type TableCellContentInput,
} from '@/vnext/application';
import { plainRichText, type CatalogDocument, type TableModel } from '@/vnext/domain';
import { emptyTable } from '../proof/test-data';

function ids(prefix = 'id'): IdGenerator {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function documentWith(table: TableModel, options: { locked?: boolean; grouped?: boolean } = {}): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'W4.B');
  const object = {
    id: 'table-object', type: 'table' as const,
    frame: { xMm: 10, yMm: 10, widthMm: 120, heightMm: 80 }, zIndex: 0,
    ...(options.locked ? { locked: true } : {}), table,
  };
  const objects = options.grouped ? [{
    id: 'group', type: 'group' as const,
    frame: { xMm: 10, yMm: 10, widthMm: 120, heightMm: 90 }, zIndex: 0,
    objects: [
      { ...object, frame: { xMm: 0, yMm: 10, widthMm: 120, heightMm: 80 } },
      { id: 'shape', type: 'shape' as const, frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
        zIndex: 1, shape: 'rectangle' as const, style: { fill: '#FFFFFF' } },
    ],
  }] : [object];
  return { ...base, pages: [{ ...base.pages[0], objects }] };
}

function tableOf(document: CatalogDocument): TableModel {
  const object = document.pages[0].objects[0];
  if (object.type !== 'table') throw new Error('top-level table expected');
  return object.table;
}
function setContent(table: TableModel, cellId = 'cell0-0', content: TableCellContentInput = { type: 'technicalCode', value: 'A-1' }, extra = {}) {
  const cell = table.cells.find((entry) => entry.id === cellId)!;
  return {
    type: 'table.cell.setContent' as const,
    pageId: 'base-2', objectId: 'table-object', tableId: table.id, cellId,
    expectedContent: cell.content, content, ...extra,
  };
}

function setProperties(table: TableModel, cellIds: string[], patch: CellPropertyPatch, overrides: Record<string, unknown> = {}) {
  return {
    type: 'table.cell.setProperties' as const,
    pageId: 'base-2', objectId: 'table-object', tableId: table.id,
    targets: cellIds.map((cellId) => {
      const cell = table.cells.find((entry) => entry.id === cellId)!;
      return {
        cellId,
        ...(cell.style ? { expectedStyle: cell.style } : {}),
        ...(cell.contentPresentation ? { expectedContentPresentation: cell.contentPresentation } : {}),
      };
    }),
    patch,
    ...overrides,
  };
}

describe('W4.B cell action contracts', () => {
  it('accepts strict semantic content/property payloads and rejects duplicates/unknown keys', () => {
    const table = emptyTable();
    expect(ApplicationActionSchema.safeParse(setContent(table)).success).toBe(true);
    expect(ApplicationActionSchema.safeParse(setProperties(table, ['cell0-0'], { textAlign: 'center' })).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({ ...setContent(table), extra: true }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse(setProperties(table, ['cell0-0', 'cell0-0'], { color: null })).success).toBe(false);
  });
});

describe('W4.B table.cell.setContent', () => {
  it('authors empty, technical code and exact-string measurement without sanitization', () => {
    const table = emptyTable();
    for (const content of [
      { type: 'empty' as const },
      { type: 'technicalCode' as const, value: ' A/B ' },
      { type: 'measurement' as const, valueText: '0.010', unit: 'V', qualifier: 'min' as const },
    ]) {
      const source = documentWith(table);
      const result = executeApplicationAction(source, setContent(table, 'cell0-0', content, { allowTypeChange: true }), { createId: ids() });
      expect(result.ok).toBe(true);
      if (result.ok) expect(tableOf(result.document).cells[0].content).toEqual(content);
    }
  });
  it('reconciles simple RichText with stable IDs and reports only genuinely created IDs', () => {
    const table = emptyTable();
    table.cells[0].content = { type: 'richText', value: plainRichText('rt', 'Antes') };
    const result = executeApplicationAction(documentWith(table), setContent(table, 'cell0-0', {
      type: 'richText', plainText: 'Depois\nNovo',
    }), { createId: ids('fresh') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const content = tableOf(result.document).cells[0].content;
    expect(content.type).toBe('richText');
    if (content.type !== 'richText') return;
    expect(projectEditableRichText(content.value)).toBe('Depois\nNovo');
    expect(content.value.paragraphs[0].id).toBe('rt:p');
    expect(content.value.paragraphs[0].inlines[0]?.id).toBe('rt:t');
    expect(result.metadata.createdIds).toEqual(['fresh-1', 'fresh-2']);
  });

  it('round-trips canonical TAB through W4.B RichText editing and exact Undo/Redo', () => {
    const table = emptyTable();
    table.cells[0].content = { type: 'richText', value: plainRichText('tab-cell', 'A\tB') };
    const initial = documentWith(table);
    const session = createDocumentSession(initial, { createId: ids('tab-cell') });
    const result = session.execute(setContent(table, 'cell0-0', {
      type: 'richText',
      plainText: 'A\tB!',
    }));
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().localSequence).toBe(1);
    const content = tableOf(session.getSnapshot().document).cells[0].content;
    expect(content.type).toBe('richText');
    if (content.type !== 'richText') return;
    expect(projectEditableRichText(content.value)).toBe('A\tB!');
    const after = session.getSnapshot().document;
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(after);
  });

  it('fails closed for unsupported same-type RichText and leaves marker/image content read-only', () => {
    const rich = emptyTable();
    rich.cells[0].content = {
      type: 'richText',
      value: { paragraphs: [{ id: 'p', inlines: [
        { kind: 'text', id: 'a', text: 'A', marks: [] },
        { kind: 'text', id: 'b', text: 'B', marks: ['bold'] },
      ] }] },
    };
    const unsupported = executeApplicationAction(documentWith(rich), setContent(rich, 'cell0-0', {
      type: 'richText', plainText: 'flatten',
    }), { createId: ids() });
    expect(unsupported).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'ACTION_INVALID' }) }));

    for (const content of [
      { type: 'marker' as const, legendEntryId: 'legend' },
      { type: 'image' as const, assetId: 'asset' },
    ]) {
      const table = emptyTable();
      table.cells[0].content = content;
      if (content.type === 'marker') table.legend = [{ id: 'legend', markerCode: '*', text: plainRichText('legend', 'Legend') }];
      if (content.type === 'image') {
        table.cells[0].contentPresentation = { image: { fit: 'contain', targetWidthMm: 2, targetHeightMm: 2 } };
      }
      const doc = documentWith(table);
      const withAsset = content.type === 'image' ? { ...doc, assets: [{
        id: 'asset', version: '1', sha256: 'a'.repeat(64), mime: 'image/png' as const,
        widthPx: 10, heightPx: 10, name: 'a.png', alt: 'A',
      }] } : doc;
      const result = executeApplicationAction(withAsset, setContent(table, 'cell0-0', { type: 'empty' }, { allowTypeChange: true }), { createId: ids() });
      expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'ACTION_INVALID' }) }));
    }
  });
  it('requires explicit destructive type change, validates canonical code/measurement, and detects narrow stale target', () => {
    const table = emptyTable();
    table.cells[0].content = { type: 'technicalCode', value: 'X' };
    const noIntent = executeApplicationAction(documentWith(table), setContent(table, 'cell0-0', {
      type: 'measurement', valueText: '1', unit: 'V',
    }), { createId: ids() });
    expect(noIntent).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'ACTION_INVALID' }) }));

    const badCode = executeApplicationAction(documentWith(emptyTable()), setContent(emptyTable(), 'cell0-0', {
      type: 'technicalCode', value: 'A\nB',
    }, { allowTypeChange: true }), { createId: ids() });
    expect(badCode.ok).toBe(false);

    const badMeasurement = executeApplicationAction(documentWith(emptyTable()), setContent(emptyTable(), 'cell0-0', {
      type: 'measurement', valueText: '1,2', unit: 'V',
    }, { allowTypeChange: true }), { createId: ids() });
    expect(badMeasurement.ok).toBe(false);

    const changed = structuredClone(table);
    changed.cells[0].content = { type: 'technicalCode', value: 'Y' };
    const stale = executeApplicationAction(documentWith(changed), setContent(table, 'cell0-0', {
      type: 'technicalCode', value: 'Z',
    }), { createId: ids() });
    expect(stale).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'TARGET_STALE' }) }));
  });

  it('does not stale a valid target when an unrelated cell changed', () => {
    const expected = emptyTable();
    expected.cells[0].content = { type: 'technicalCode', value: 'A' };
    const live = structuredClone(expected);
    live.cells[1].content = { type: 'technicalCode', value: 'unrelated' };
    const result = executeApplicationAction(documentWith(live), setContent(expected, 'cell0-0', {
      type: 'technicalCode', value: 'B',
    }), { createId: ids() });
    expect(result.ok).toBe(true);
    if (result.ok) expect(tableOf(result.document).cells[1].content).toEqual(live.cells[1].content);
  });
  it('protects missing/covered/locked/grouped/wrong identities and gives exact Undo/Redo', () => {
    const table = emptyTable();
    table.cells[0].content = { type: 'technicalCode', value: 'A' };
    const missing = executeApplicationAction(documentWith(table), { ...setContent(table), cellId: 'missing' }, { createId: ids() });
    expect(missing.ok).toBe(false);

    const covered = structuredClone(table);
    covered.cells[1].coveredBy = covered.cells[0].id;
    covered.cells[0].span = { rows: 1, columns: 2 };
    const coveredResult = executeApplicationAction(documentWith(covered), setContent(covered, covered.cells[1].id), { createId: ids() });
    expect(coveredResult.ok).toBe(false);

    for (const [doc, action, code] of [
      [documentWith(table, { locked: true }), setContent(table), 'OBJECT_LOCKED'],
      [documentWith(table, { grouped: true }), setContent(table), 'ACTION_INVALID'],
      [documentWith(table), { ...setContent(table), pageId: 'wrong' }, 'PAGE_NOT_FOUND'],
      [documentWith(table), { ...setContent(table), tableId: 'wrong' }, 'TABLE_IDENTITY_MISMATCH'],
    ] as const) {
      const result = executeApplicationAction(doc, action, { createId: ids() });
      expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code }) }));
    }

    const initial = documentWith(table);
    const session = createDocumentSession(initial, { createId: ids('history') });
    const committed = session.execute(setContent(table, 'cell0-0', { type: 'technicalCode', value: 'B' }));
    expect(committed.ok).toBe(true);
    const after = session.getSnapshot().document;
    expect(session.getSnapshot().localSequence).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(after);
  });
});
describe('W4.B table.cell.setProperties', () => {
  it('sets/resets only authorized local overrides and prunes empty containers', () => {
    const table = emptyTable();
    table.cells[0].style = {
      fontFamily: 'Noto Sans', fontSizePt: 9, lineHeight: 1.3,
      borders: { top: { pattern: 'solid', thicknessPt: 1, color: '#173F52' } },
    };
    let doc = documentWith(table);
    let live = tableOf(doc);
    const patches = [
      { textAlign: 'center' as const },
      { fontWeight: 700 as const },
      { color: '#112233' },
      { background: '#AABBCC' },
      { paddingMm: { top: 2, right: 3 } },
      { wrapPolicy: 'nowrap' as const },
    ];
    for (const patch of patches) {
      const result = executeApplicationAction(doc, setProperties(live, ['cell0-0'], patch), { createId: ids() });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      doc = result.document;
      live = tableOf(doc);
    }
    expect(live.cells[0].style).toMatchObject({
      fontFamily: 'Noto Sans', fontSizePt: 9, lineHeight: 1.3,
      textAlign: 'center', fontWeight: 700, color: '#112233', background: '#AABBCC',
      paddingMm: { top: 2, right: 3 },
    });
    expect(live.cells[0].style?.borders).toEqual(table.cells[0].style?.borders);
    expect(live.cells[0].contentPresentation?.wrapPolicy).toBe('nowrap');

    const reset = executeApplicationAction(doc, setProperties(live, ['cell0-0'], {
      textAlign: null, fontWeight: null, color: null, background: null,
      paddingMm: null, wrapPolicy: null,
    }), { createId: ids() });
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    const cell = tableOf(reset.document).cells[0];
    expect(cell.style).toEqual({
      fontFamily: 'Noto Sans', fontSizePt: 9, lineHeight: 1.3,
      borders: table.cells[0].style?.borders,
    });
    expect(cell.contentPresentation).toBeUndefined();
  });
  it('resets one padding edge, preserves image presentation, and applies multiple anchors atomically', () => {
    const table = emptyTable();
    table.cells[0].style = { paddingMm: { top: 1, right: 2, bottom: 3, left: 4 } };
    const edge = executeApplicationAction(documentWith(table), setProperties(table, ['cell0-0'], {
      paddingMm: { right: null },
    }), { createId: ids() });
    expect(edge.ok).toBe(true);
    if (edge.ok) expect(tableOf(edge.document).cells[0].style?.paddingMm).toEqual({ top: 1, bottom: 3, left: 4 });

    const image = emptyTable();
    image.cells[0].content = { type: 'image', assetId: 'asset' };
    image.cells[0].contentPresentation = {
      image: { fit: 'cover', targetWidthMm: 5, targetHeightMm: 6 },
      wrapPolicy: 'nowrap',
    };
    const imageDoc = { ...documentWith(image), assets: [{
      id: 'asset', version: '1', sha256: 'b'.repeat(64), mime: 'image/png' as const,
      widthPx: 20, heightPx: 20, name: 'asset.png', alt: 'Asset',
    }] };
    const resetWrap = executeApplicationAction(imageDoc, setProperties(image, ['cell0-0'], { wrapPolicy: null }), { createId: ids() });
    expect(resetWrap.ok).toBe(true);
    if (resetWrap.ok) expect(tableOf(resetWrap.document).cells[0].contentPresentation).toEqual({
      image: { fit: 'cover', targetWidthMm: 5, targetHeightMm: 6 },
    });

    const multi = emptyTable();
    const multiResult = executeApplicationAction(documentWith(multi), setProperties(multi, ['cell0-0', 'cell0-1', 'cell1-0'], {
      textAlign: 'right',
    }), { createId: ids() });
    expect(multiResult.ok).toBe(true);
    if (multiResult.ok) {
      expect(tableOf(multiResult.document).cells.filter((c) => ['cell0-0','cell0-1','cell1-0'].includes(c.id))
        .every((c) => c.style?.textAlign === 'right')).toBe(true);
    }
  });
  it('fails all-or-none on stale targets and protects covered/locked/grouped cells', () => {
    const expected = emptyTable();
    const live = structuredClone(expected);
    live.cells[1].style = { color: '#112233' };
    const action = setProperties(expected, ['cell0-0', 'cell0-1'], { background: '#FFFFFF' });
    const stale = executeApplicationAction(documentWith(live), action, { createId: ids() });
    expect(stale).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'TARGET_STALE' }) }));
    if (!stale.ok) expect(tableOf(documentWith(live))).toEqual(live);

    const covered = emptyTable();
    covered.cells[0].span = { rows: 1, columns: 2 };
    covered.cells[1].coveredBy = covered.cells[0].id;
    expect(executeApplicationAction(documentWith(covered), setProperties(covered, ['cell0-1'], { color: '#112233' }), { createId: ids() }).ok).toBe(false);
    expect(executeApplicationAction(documentWith(expected, { locked: true }), setProperties(expected, ['cell0-0'], { color: '#112233' }), { createId: ids() }).ok).toBe(false);
    expect(executeApplicationAction(documentWith(expected, { grouped: true }), setProperties(expected, ['cell0-0'], { color: '#112233' }), { createId: ids() }).ok).toBe(false);
  });

  it('creates one history entry for one multi-cell property command with exact Undo/Redo and no-op safety', () => {
    const table = emptyTable();
    const initial = documentWith(table);
    const session = createDocumentSession(initial, { createId: ids() });
    const result = session.execute(setProperties(table, ['cell0-0', 'cell0-1'], { fontWeight: 700 }));
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().localSequence).toBe(1);
    const after = session.getSnapshot().document;
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(after);
    const live = tableOf(after);
    const noop = session.execute(setProperties(live, ['cell0-0', 'cell0-1'], { fontWeight: 700 }));
    expect(noop.ok && noop.metadata.changed).toBe(false);
  });
});
