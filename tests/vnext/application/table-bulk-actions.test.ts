import { describe, expect, it } from 'vitest';
import {
  ApplicationActionSchema,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
  projectEditableRichText,
  type IdGenerator,
  type TableBulkCellContentInput,
} from '@/vnext/application';
import { plainRichText, type CatalogDocument, type TableModel } from '@/vnext/domain';
import { emptyTable } from '../proof/test-data';

function ids(prefix = 'id'): IdGenerator {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function documentWith(table: TableModel, options: { locked?: boolean; grouped?: boolean } = {}): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'W4.D');
  const object = {
    id: 'table-object',
    type: 'table' as const,
    frame: { xMm: 10, yMm: 10, widthMm: 120, heightMm: 80 },
    zIndex: 0,
    ...(options.locked ? { locked: true } : {}),
    table,
  };
  const objects = options.grouped ? [{
    id: 'group',
    type: 'group' as const,
    frame: { xMm: 10, yMm: 10, widthMm: 120, heightMm: 90 },
    zIndex: 0,
    objects: [
      { ...object, frame: { xMm: 0, yMm: 10, widthMm: 120, heightMm: 80 } },
      {
        id: 'shape', type: 'shape' as const,
        frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
        zIndex: 1, shape: 'rectangle' as const, style: { fill: '#FFFFFF' },
      },
    ],
  }] : [object];
  return { ...base, pages: [{ ...base.pages[0], objects }] };
}
function tableOf(document: CatalogDocument): TableModel {
  const object = document.pages[0].objects[0];
  if (object.type !== 'table') throw new Error('top-level Table expected');
  return object.table;
}

function target(table: TableModel, cellId: string, content: TableBulkCellContentInput) {
  const cell = table.cells.find((entry) => entry.id === cellId)!;
  const rows = cell.span?.rows ?? 1;
  const columns = cell.span?.columns ?? 1;
  return {
    cellId,
    expectedTopology: rows > 1 || columns > 1
      ? { kind: 'mergedOwner' as const, rows, columns }
      : { kind: 'ordinary' as const },
    expectedContent: cell.content,
    content,
  };
}

function bulkAction(table: TableModel, overrides: Record<string, unknown> = {}) {
  return {
    type: 'table.cells.setContents' as const,
    pageId: 'base-2',
    objectId: 'table-object',
    tableId: table.id,
    geometry: { rowIds: ['r0'], columnIds: ['c0', 'c1'] },
    targets: [
      target(table, 'cell0-0', { type: 'technicalCode', value: 'A' }),
      target(table, 'cell0-1', { type: 'measurement', valueText: '0.010', unit: 'V', qualifier: 'min' }),
    ],
    ...overrides,
  };
}

function singleBulkAction(table: TableModel, cellId: string, content: TableBulkCellContentInput) {
  const cell = table.cells.find((entry) => entry.id === cellId)!;
  return {
    type: 'table.cells.setContents' as const,
    pageId: 'base-2',
    objectId: 'table-object',
    tableId: table.id,
    geometry: { rowIds: [cell.rowId], columnIds: [cell.columnId] },
    targets: [target(table, cellId, content)],
  };
}

describe('W4.D action contracts', () => {
  it('accepts strict bulk/Legend actions and rejects malformed dimensions/client keys/unknown fields', () => {
    const table = emptyTable();
    expect(ApplicationActionSchema.safeParse(bulkAction(table)).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({ ...bulkAction(table), extra: true }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({
      ...bulkAction(table),
      geometry: { rowIds: ['r0'], columnIds: ['c0'] },
    }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({
      ...bulkAction(table),
      targets: [target(table, 'cell0-0', { type: 'marker', legend: { kind: 'created', clientKey: 'missing' } })],
      geometry: { rowIds: ['r0'], columnIds: ['c0'] },
    }).success).toBe(false);
  });
});
describe('W4.D table.cells.setContents', () => {
  it('updates a semantic matrix atomically, preserves destination style/properties and exact Measurement lexeme', () => {
    const table = emptyTable();
    table.cells[0].style = {
      textAlign: 'right',
      background: '#AABBCC',
      paddingMm: { left: 3 },
      borders: { top: { pattern: 'solid', thicknessPt: 1, color: '#112233' } },
    };
    table.cells[0].contentPresentation = { wrapPolicy: 'nowrap' };
    const source = documentWith(table);
    const result = executeApplicationAction(source, bulkAction(table), { createId: ids('fresh') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = tableOf(result.document);
    expect(next.cells[0].content).toEqual({ type: 'technicalCode', value: 'A' });
    expect(next.cells[1].content).toEqual({
      type: 'measurement', valueText: '0.010', unit: 'V', qualifier: 'min',
    });
    expect(next.cells[0].style).toEqual(table.cells[0].style);
    expect(next.cells[0].contentPresentation).toEqual({ wrapPolicy: 'nowrap' });
  });

  it('allocates fresh independent RichText identities for copied/broadcast semantic content', () => {
    const table = emptyTable();
    const copied = plainRichText('source', 'Mesmo texto');
    const action = {
      ...bulkAction(table),
      geometry: { rowIds: ['r0'], columnIds: ['c0', 'c1'] },
      targets: [
        target(table, 'cell0-0', { type: 'richTextCopy', value: copied }),
        target(table, 'cell0-1', { type: 'richTextCopy', value: copied }),
      ],
    };
    const result = executeApplicationAction(documentWith(table), action, { createId: ids('fresh') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [first, second] = tableOf(result.document).cells;
    expect(first.content.type).toBe('richText');
    expect(second.content.type).toBe('richText');
    if (first.content.type !== 'richText' || second.content.type !== 'richText') return;
    expect(projectEditableRichText(first.content.value)).toBe('Mesmo texto');
    expect(projectEditableRichText(second.content.value)).toBe('Mesmo texto');
    expect(first.content.value.paragraphs[0].id).not.toBe('source:p');
    expect(first.content.value.paragraphs[0].id).not.toBe(second.content.value.paragraphs[0].id);
    expect(new Set(result.metadata.createdIds).size).toBe(result.metadata.createdIds.length);
  });
  it('fails all-or-none when one destination content is stale while unrelated cells/styles do not stale the paste', () => {
    const expected = emptyTable();
    const live = structuredClone(expected);
    live.cells[1].content = { type: 'technicalCode', value: 'someone changed target' };
    const stale = executeApplicationAction(documentWith(live), bulkAction(expected), { createId: ids() });
    expect(stale).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'TARGET_STALE' }),
    }));
    expect(tableOf(documentWith(live))).toEqual(live);

    const unrelated = structuredClone(expected);
    unrelated.cells[8].content = { type: 'technicalCode', value: 'unrelated' };
    unrelated.cells[0].style = { background: '#FFFFFF' };
    const valid = executeApplicationAction(documentWith(unrelated), bulkAction(expected), { createId: ids() });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(tableOf(valid.document).cells[8].content).toEqual(unrelated.cells[8].content);
      expect(tableOf(valid.document).cells[0].style).toEqual(unrelated.cells[0].style);
    }
  });

  it('fails closed on geometry/topology changes and Image destinations', () => {
    const expected = emptyTable();
    const moved = structuredClone(expected);
    moved.columns = [moved.columns[1], moved.columns[0], moved.columns[2]];
    const geometry = executeApplicationAction(documentWith(moved), bulkAction(expected), { createId: ids() });
    expect(geometry).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'TABLE_PASTE_GEOMETRY_INVALID' }),
    }));

    const merged = emptyTable();
    merged.cells[0].span = { rows: 1, columns: 2 };
    merged.cells[1].coveredBy = merged.cells[0].id;
    const mergeAction = {
      ...bulkAction(merged),
      targets: [
        target(merged, 'cell0-0', { type: 'technicalCode', value: 'A' }),
        target(merged, 'cell0-1', { type: 'technicalCode', value: 'B' }),
      ],
    };
    expect(executeApplicationAction(documentWith(merged), mergeAction, { createId: ids() }))
      .toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'TABLE_PASTE_MERGE_INTERSECTION' }),
      }));

    const image = emptyTable();
    image.cells[0].content = { type: 'image', assetId: 'asset' };
    image.cells[0].contentPresentation = {
      image: { fit: 'contain', targetWidthMm: 2, targetHeightMm: 2 },
    };
    const imageDoc = {
      ...documentWith(image),
      assets: [{
        id: 'asset', version: '1', sha256: 'a'.repeat(64), mime: 'image/png' as const,
        widthPx: 10, heightPx: 10, name: 'a.png', alt: 'A',
      }],
    };
    const clearImage = {
      ...bulkAction(image),
      geometry: { rowIds: ['r0'], columnIds: ['c0'] },
      targets: [target(image, 'cell0-0', { type: 'empty' })],
    };
    expect(executeApplicationAction(imageDoc, clearImage, { createId: ids() }))
      .toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'TABLE_CELL_CONTENT_UNSUPPORTED' }),
      }));
  });
  it('allows one scalar write to a merged anchor without changing topology', () => {
    const table = emptyTable();
    table.cells[0].span = { rows: 1, columns: 2 };
    table.cells[1].coveredBy = table.cells[0].id;
    const action = {
      ...bulkAction(table),
      geometry: { rowIds: ['r0'], columnIds: ['c0'] },
      targets: [target(table, 'cell0-0', { type: 'technicalCode', value: 'MERGED-NEW' })],
    };
    const result = executeApplicationAction(documentWith(table), action, { createId: ids() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = tableOf(result.document);
    expect(next.cells[0]).toMatchObject({
      span: { rows: 1, columns: 2 },
      content: { type: 'technicalCode', value: 'MERGED-NEW' },
    });
    expect(next.cells[1].coveredBy).toBe('cell0-0');
  });

  it('rejects stale prepared topology while preserving stable ordinary/merged targets and unrelated mutations', () => {
    const ordinary = emptyTable();
    ordinary.cells[0].content = { type: 'technicalCode', value: 'BASE' };
    const ordinaryAction = singleBulkAction(ordinary, 'cell0-0', { type: 'technicalCode', value: 'NEW' });

    const mergedLive = structuredClone(ordinary);
    mergedLive.cells[0].span = { rows: 1, columns: 2 };
    mergedLive.cells[1].coveredBy = mergedLive.cells[0].id;
    const ordinaryToMerged = executeApplicationAction(documentWith(mergedLive), ordinaryAction, { createId: ids() });
    expect(ordinaryToMerged).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'TARGET_STALE' }),
    }));
    expect(tableOf(documentWith(mergedLive))).toEqual(mergedLive);

    const mergedPrepared = structuredClone(mergedLive);
    const mergedAction = singleBulkAction(mergedPrepared, 'cell0-0', { type: 'technicalCode', value: 'MERGED' });
    const unmergedLive = structuredClone(mergedPrepared);
    delete unmergedLive.cells[0].span;
    delete unmergedLive.cells[1].coveredBy;
    const mergedToOrdinary = executeApplicationAction(documentWith(unmergedLive), mergedAction, { createId: ids() });
    expect(mergedToOrdinary).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'TARGET_STALE' }),
    }));

    const spanChanged = structuredClone(mergedPrepared);
    delete spanChanged.cells[1].coveredBy;
    spanChanged.cells[0].span = { rows: 2, columns: 1 };
    spanChanged.cells[3].coveredBy = spanChanged.cells[0].id;
    const changedSpan = executeApplicationAction(documentWith(spanChanged), mergedAction, { createId: ids() });
    expect(changedSpan).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: 'TARGET_STALE' }),
    }));

    const stableMerged = executeApplicationAction(documentWith(mergedPrepared), mergedAction, { createId: ids() });
    expect(stableMerged.ok).toBe(true);
    if (stableMerged.ok) expect(tableOf(stableMerged.document).cells[0].span).toEqual({ rows: 1, columns: 2 });

    const unrelated = structuredClone(ordinary);
    unrelated.cells[4].content = { type: 'technicalCode', value: 'UNRELATED' };
    unrelated.cells[0].style = { background: '#FFFFFF' };
    const stableOrdinary = executeApplicationAction(documentWith(unrelated), ordinaryAction, { createId: ids() });
    expect(stableOrdinary.ok).toBe(true);
  });

  it('treats semantic RichText and primitive equality as true no-op with zero metadata/history', () => {
    const table = emptyTable();
    table.cells[0].content = { type: 'richText', value: plainRichText('existing-tab', 'A\tB') };
    table.cells[1].content = { type: 'technicalCode', value: 'TC-1' };
    table.cells[2].content = { type: 'measurement', valueText: '0.010', unit: 'V', qualifier: 'min' };
    table.legend = [{ id: 'legend-1', markerCode: '*', text: plainRichText('legend', 'Legend') }];
    table.cells[3].content = { type: 'marker', legendEntryId: 'legend-1' };

    const cases = [
      singleBulkAction(table, 'cell0-0', { type: 'richTextCopy', value: plainRichText('foreign', 'A\tB') }),
      singleBulkAction(table, 'cell0-0', { type: 'richTextPlain', plainText: 'A\tB' }),
      singleBulkAction(table, 'cell0-1', { type: 'technicalCode', value: 'TC-1' }),
      singleBulkAction(table, 'cell0-2', { type: 'measurement', valueText: '0.010', unit: 'V', qualifier: 'min' }),
      singleBulkAction(table, 'cell1-0', { type: 'marker', legend: { kind: 'existing', legendEntryId: 'legend-1' } }),
    ];
    for (const action of cases) {
      const initial = documentWith(table);
      const session = createDocumentSession(initial, { createId: ids('noop') });
      const result = session.execute(action);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.metadata).toMatchObject({ changed: false, createdIds: [], affectedIds: [] });
      expect(session.getSnapshot().localSequence).toBe(0);
      expect(session.getSnapshot().canUndo).toBe(false);
      expect(session.getSnapshot().document).toEqual(initial);
    }
  });

  it('allocates only changed RichText targets in a mixed broadcast and preserves unchanged canonical IDs', () => {
    const table = emptyTable();
    table.cells[0].content = { type: 'richText', value: plainRichText('keep', 'A\tB') };
    table.cells[1].content = { type: 'richText', value: plainRichText('change', 'Old') };
    const copiedSame = plainRichText('foreign-same', 'A\tB');
    const action = {
      ...bulkAction(table),
      geometry: { rowIds: ['r0'], columnIds: ['c0', 'c1'] },
      targets: [
        target(table, 'cell0-0', { type: 'richTextCopy', value: copiedSame }),
        target(table, 'cell0-1', { type: 'richTextPlain', plainText: 'New' }),
      ],
    };
    const initial = documentWith(table);
    const session = createDocumentSession(initial, { createId: ids('mix') });
    const result = session.execute(action);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = tableOf(result.document);
    expect(next.cells[0].content).toEqual(table.cells[0].content);
    expect(next.cells[1].content.type).toBe('richText');
    expect(result.metadata.changed).toBe(true);
    expect(result.metadata.affectedIds).toEqual(['table-object', table.id, 'cell0-1']);
    expect(result.metadata.createdIds).toEqual(['mix-1', 'mix-2']);
    expect(session.getSnapshot().localSequence).toBe(1);
    expect(session.getSnapshot().canUndo).toBe(true);
  });

  it('does not collapse formatted/list RichText into a plain semantic no-op', () => {
    const table = emptyTable();
    table.cells[0].content = {
      type: 'richText',
      value: { paragraphs: [{
        id: 'p',
        inlines: [{ kind: 'text', id: 't', text: 'A', marks: ['bold'] }],
      }] },
    };
    const result = executeApplicationAction(
      documentWith(table),
      singleBulkAction(table, 'cell0-0', { type: 'richTextPlain', plainText: 'A' }),
      { createId: ids('plain') }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metadata.changed).toBe(true);
      expect(result.metadata.createdIds).toEqual(['plain-1', 'plain-2']);
    }
  });

  it('creates a Legend and assigns many Markers atomically with fresh IDs and one history entry', () => {
    const table = emptyTable();
    const action = {
      type: 'table.cells.setContents' as const,
      pageId: 'base-2', objectId: 'table-object', tableId: table.id,
      geometry: { rowIds: ['r0'], columnIds: ['c0', 'c1'] },
      expectedLegend: table.legend,
      legendCreates: [{
        clientKey: 'new',
        markerCode: '†',
        text: plainRichText('transfer', 'Sob consulta'),
      }],
      targets: [
        target(table, 'cell0-0', { type: 'marker', legend: { kind: 'created', clientKey: 'new' } }),
        target(table, 'cell0-1', { type: 'marker', legend: { kind: 'created', clientKey: 'new' } }),
      ],
    };
    const initial = documentWith(table);
    const session = createDocumentSession(initial, { createId: ids('fresh') });
    const result = session.execute(action);
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().localSequence).toBe(1);
    if (!result.ok) return;
    const next = tableOf(result.document);
    expect(next.legend).toHaveLength(1);
    expect(next.legend[0].id).not.toBe('transfer');
    expect(next.legend[0].text.paragraphs[0].id).not.toBe('transfer:p');
    expect(next.cells[0].content).toEqual({ type: 'marker', legendEntryId: next.legend[0].id });
    expect(next.cells[1].content).toEqual({ type: 'marker', legendEntryId: next.legend[0].id });
    const after = session.getSnapshot().document;
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(after);
  });
  it('protects conditional Legend CAS and aborts conflict without creating Marker/Legend state', () => {
    const expected = emptyTable();
    const live = structuredClone(expected);
    live.legend = [{ id: 'existing', markerCode: 'X', text: plainRichText('x', 'Existing') }];
    const action = {
      type: 'table.cells.setContents' as const,
      pageId: 'base-2', objectId: 'table-object', tableId: expected.id,
      geometry: { rowIds: ['r0'], columnIds: ['c0'] },
      expectedLegend: expected.legend,
      legendCreates: [{
        clientKey: 'new',
        markerCode: '*',
        text: plainRichText('transfer', 'Meaning'),
      }],
      targets: [
        target(expected, 'cell0-0', { type: 'marker', legend: { kind: 'created', clientKey: 'new' } }),
      ],
    };
    const result = executeApplicationAction(documentWith(live), action, { createId: ids('fresh') });
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'TARGET_STALE' }),
    }));
    expect(tableOf(documentWith(live))).toEqual(live);
  });
});

describe('W4.D Legend lifecycle actions', () => {
  it('creates reusable Legend with narrow Legend-array CAS and permits unrelated cell edits', () => {
    const table = emptyTable();
    const live = structuredClone(table);
    live.cells[8].content = { type: 'technicalCode', value: 'unrelated' };
    const result = executeApplicationAction(documentWith(live), {
      type: 'table.legend.create',
      pageId: 'base-2', objectId: 'table-object', tableId: table.id,
      markerCode: '*', plainText: 'Opcional', expectedLegend: table.legend,
    }, { createId: ids('legend') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = tableOf(result.document);
    expect(next.legend).toHaveLength(1);
    expect(projectEditableRichText(next.legend[0].text)).toBe('Opcional');
    expect(next.cells[8].content).toEqual(live.cells[8].content);
  });

  it('creates and updates TAB-containing Legend text while preserving shared Marker references', () => {
    const table = emptyTable();
    const created = executeApplicationAction(documentWith(table), {
      type: 'table.legend.create',
      pageId: 'base-2', objectId: 'table-object', tableId: table.id,
      markerCode: 'T', plainText: 'A\tB', expectedLegend: [],
    }, { createId: ids('tab-legend') });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const createdTable = tableOf(created.document);
    expect(projectEditableRichText(createdTable.legend[0].text)).toBe('A\tB');

    const assigned = structuredClone(createdTable);
    assigned.cells[0].content = { type: 'marker', legendEntryId: assigned.legend[0].id };
    assigned.cells[1].content = { type: 'marker', legendEntryId: assigned.legend[0].id };
    const updated = executeApplicationAction(documentWith(assigned), {
      type: 'table.legend.update',
      pageId: 'base-2', objectId: 'table-object', tableId: assigned.id,
      legendEntryId: assigned.legend[0].id,
      expectedLegend: assigned.legend[0],
      patch: { plainText: 'A\tB!' },
    }, { createId: ids('tab-update') });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    const next = tableOf(updated.document);
    expect(projectEditableRichText(next.legend[0].text)).toBe('A\tB!');
    expect(next.cells[0].content).toEqual({ type: 'marker', legendEntryId: next.legend[0].id });
    expect(next.cells[1].content).toEqual({ type: 'marker', legendEntryId: next.legend[0].id });

    const viaBulk = emptyTable();
    const bulkCreated = executeApplicationAction(documentWith(viaBulk), {
      type: 'table.cells.setContents',
      pageId: 'base-2', objectId: 'table-object', tableId: viaBulk.id,
      geometry: { rowIds: ['r0'], columnIds: ['c0'] },
      expectedLegend: [],
      legendCreates: [{
        clientKey: 'tab-create',
        markerCode: '‡',
        text: plainRichText('transfer-tab', 'X\tY'),
      }],
      targets: [target(viaBulk, 'cell0-0', {
        type: 'marker', legend: { kind: 'created', clientKey: 'tab-create' },
      })],
    }, { createId: ids('bulk-tab') });
    expect(bulkCreated.ok).toBe(true);
    if (!bulkCreated.ok) return;
    const bulkTable = tableOf(bulkCreated.document);
    const bulkLegend = bulkTable.legend[0];
    const bulkUpdated = executeApplicationAction(bulkCreated.document, {
      type: 'table.legend.update',
      pageId: 'base-2', objectId: 'table-object', tableId: bulkTable.id,
      legendEntryId: bulkLegend.id,
      expectedLegend: bulkLegend,
      patch: { plainText: 'X\tY!' },
    }, { createId: ids('bulk-tab-update') });
    expect(bulkUpdated.ok).toBe(true);
    if (bulkUpdated.ok) {
      const finalTable = tableOf(bulkUpdated.document);
      expect(projectEditableRichText(finalTable.legend[0].text)).toBe('X\tY!');
      expect(finalTable.cells[0].content).toEqual({ type: 'marker', legendEntryId: finalTable.legend[0].id });
    }
  });

  it('updates shared code/text safely, rejects advanced RichText flattening and duplicate markerCode', () => {
    const table = emptyTable();
    table.legend = [
      { id: 'l1', markerCode: '*', text: plainRichText('l1', 'Antes') },
      { id: 'l2', markerCode: '†', text: plainRichText('l2', 'Outro') },
    ];
    table.cells[0].content = { type: 'marker', legendEntryId: 'l1' };
    table.cells[1].content = { type: 'marker', legendEntryId: 'l1' };
    const result = executeApplicationAction(documentWith(table), {
      type: 'table.legend.update',
      pageId: 'base-2', objectId: 'table-object', tableId: table.id,
      legendEntryId: 'l1', expectedLegend: table.legend[0],
      patch: { markerCode: 'A', plainText: 'Depois' },
    }, { createId: ids('fresh') });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const next = tableOf(result.document);
      expect(next.legend[0].markerCode).toBe('A');
      expect(projectEditableRichText(next.legend[0].text)).toBe('Depois');
      expect(next.cells[0].content).toEqual({ type: 'marker', legendEntryId: 'l1' });
      expect(next.cells[1].content).toEqual({ type: 'marker', legendEntryId: 'l1' });
    }

    const duplicate = executeApplicationAction(documentWith(table), {
      type: 'table.legend.update',
      pageId: 'base-2', objectId: 'table-object', tableId: table.id,
      legendEntryId: 'l1', expectedLegend: table.legend[0],
      patch: { markerCode: '†' },
    }, { createId: ids() });
    expect(duplicate).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'LEGEND_MARKER_CODE_CONFLICT' }),
    }));

    const advanced = structuredClone(table);
    advanced.legend[0].text = {
      paragraphs: [{ id: 'p', inlines: [
        { kind: 'text', id: 'a', text: 'A', marks: [] },
        { kind: 'text', id: 'b', text: 'B', marks: ['bold'] },
      ] }],
    };
    const blocked = executeApplicationAction(documentWith(advanced), {
      type: 'table.legend.update',
      pageId: 'base-2', objectId: 'table-object', tableId: advanced.id,
      legendEntryId: 'l1', expectedLegend: advanced.legend[0],
      patch: { plainText: 'flatten' },
    }, { createId: ids() });
    expect(blocked).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'ACTION_INVALID' }),
    }));
  });
  it('blocks removal while referenced, keeps unused Legend after Marker clear, then removes it', () => {
    const table = emptyTable();
    table.legend = [{ id: 'l1', markerCode: '*', text: plainRichText('l1', 'Opcional') }];
    table.cells[0].content = { type: 'marker', legendEntryId: 'l1' };
    const inUse = executeApplicationAction(documentWith(table), {
      type: 'table.legend.remove',
      pageId: 'base-2', objectId: 'table-object', tableId: table.id,
      legendEntryId: 'l1', expectedLegend: table.legend[0],
    }, { createId: ids() });
    expect(inUse).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'LEGEND_IN_USE' }),
    }));

    const clear = executeApplicationAction(documentWith(table), {
      type: 'table.cells.setContents',
      pageId: 'base-2', objectId: 'table-object', tableId: table.id,
      geometry: { rowIds: ['r0'], columnIds: ['c0'] },
      targets: [target(table, 'cell0-0', { type: 'empty' })],
    }, { createId: ids() });
    expect(clear.ok).toBe(true);
    if (!clear.ok) return;
    const cleared = tableOf(clear.document);
    expect(cleared.legend).toHaveLength(1);
    expect(cleared.cells[0].content).toEqual({ type: 'empty' });

    const removed = executeApplicationAction(clear.document, {
      type: 'table.legend.remove',
      pageId: 'base-2', objectId: 'table-object', tableId: cleared.id,
      legendEntryId: 'l1', expectedLegend: cleared.legend[0],
    }, { createId: ids() });
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(tableOf(removed.document).legend).toEqual([]);
  });

  it('protects missing/stale Legend, lock/group and creates one history step per Legend action', () => {
    const table = emptyTable();
    table.legend = [{ id: 'l1', markerCode: '*', text: plainRichText('l1', 'Legend') }];
    const missing = executeApplicationAction(documentWith(table), {
      type: 'table.legend.remove',
      pageId: 'base-2', objectId: 'table-object', tableId: table.id,
      legendEntryId: 'missing', expectedLegend: table.legend[0],
    }, { createId: ids() });
    expect(missing).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'LEGEND_NOT_FOUND' }),
    }));

    const staleExpected = { ...table.legend[0], markerCode: 'old' };
    const stale = executeApplicationAction(documentWith(table), {
      type: 'table.legend.update',
      pageId: 'base-2', objectId: 'table-object', tableId: table.id,
      legendEntryId: 'l1', expectedLegend: staleExpected,
      patch: { markerCode: 'A' },
    }, { createId: ids() });
    expect(stale).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'TARGET_STALE' }),
    }));

    for (const [doc, code] of [
      [documentWith(table, { locked: true }), 'OBJECT_LOCKED'],
      [documentWith(table, { grouped: true }), 'ACTION_INVALID'],
    ] as const) {
      const result = executeApplicationAction(doc, {
        type: 'table.legend.remove',
        pageId: 'base-2', objectId: 'table-object', tableId: table.id,
        legendEntryId: 'l1', expectedLegend: table.legend[0],
      }, { createId: ids() });
      expect(result).toEqual(expect.objectContaining({
        ok: false, error: expect.objectContaining({ code }),
      }));
    }

    const empty = emptyTable();
    const initial = documentWith(empty);
    const session = createDocumentSession(initial, { createId: ids('history') });
    const created = session.execute({
      type: 'table.legend.create',
      pageId: 'base-2', objectId: 'table-object', tableId: empty.id,
      markerCode: '*', plainText: 'Legend', expectedLegend: [],
    });
    expect(created.ok).toBe(true);
    expect(session.getSnapshot().localSequence).toBe(1);
    const after = session.getSnapshot().document;
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(after);
  });
});
