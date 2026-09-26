import { describe, expect, it } from 'vitest';
import {
  ApplicationActionSchema,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
  projectEditableRichText,
  type IdGenerator,
} from '@/vnext/application';
import {
  mmToU,
  plainRichText,
  type AssetRef,
  type CatalogDocument,
  type RichText,
  type TableModel,
  type TableObject,
} from '@/vnext/domain';
import { emptyTable } from '../proof/test-data';

function ids(prefix = 'id'): IdGenerator {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

const existingAsset: AssetRef = {
  id: 'asset-existing',
  version: 'v1',
  sha256: 'a'.repeat(64),
  mime: 'image/png',
  widthPx: 640,
  heightPx: 480,
  name: 'existing.png',
  alt: 'Imagem técnica existente',
};

const uploadedAsset: AssetRef = {
  id: 'asset-uploaded',
  version: 'v1',
  sha256: 'b'.repeat(64),
  mime: 'image/webp',
  widthPx: 800,
  heightPx: 600,
  name: 'uploaded.webp',
  alt: 'Imagem técnica enviada',
};

function documentWith(
  table: TableModel,
  options: { locked?: boolean; grouped?: boolean; assets?: readonly AssetRef[] } = {}
): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'W4.F.3');
  const object: TableObject = {
    id: 'table-object',
    type: 'table',
    frame: { xMm: 10, yMm: 10, widthMm: 120, heightMm: 80 },
    zIndex: 0,
    ...(options.locked ? { locked: true } : {}),
    table,
  };
  const objects = options.grouped
    ? [{
        id: 'group',
        type: 'group' as const,
        frame: { xMm: 10, yMm: 10, widthMm: 120, heightMm: 90 },
        zIndex: 0,
        objects: [
          { ...object, frame: { xMm: 0, yMm: 10, widthMm: 120, heightMm: 80 } },
          {
            id: 'shape',
            type: 'shape' as const,
            frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
            zIndex: 1,
            shape: 'rectangle' as const,
            style: {},
          },
        ],
      }]
    : [object];
  return {
    ...base,
    assets: [...(options.assets ?? [])],
    pages: [{ ...base.pages[0], objects }],
  } as CatalogDocument;
}

function topTable(document: CatalogDocument): TableModel {
  const object = document.pages[0].objects[0];
  if (!object || object.type !== 'table') throw new Error('Expected top-level Table');
  return object.table;
}

function identity() {
  return {
    pageId: 'base-2',
    objectId: 'table-object',
    tableId: 'table',
  };
}

function titleAction(table: TableModel, plainText: string | null) {
  return {
    type: 'table.title.set' as const,
    ...identity(),
    expectedTitle: table.title ?? null,
    plainText,
  };
}

function advancedRichText(prefix = 'advanced'): RichText {
  return {
    paragraphs: [{
      id: `${prefix}:p`,
      inlines: [
        { kind: 'text', id: `${prefix}:a`, text: 'Texto ', marks: [] },
        { kind: 'text', id: `${prefix}:b`, text: 'rico', marks: ['bold'] },
      ],
    }],
  };
}

describe('W4.F.3 strict semantic action contracts', () => {
  it('accepts the semantic action family and rejects unknown fields / invalid permutations / invalid image U', () => {
    const table = emptyTable();
    const cell = table.cells[0];
    expect(ApplicationActionSchema.safeParse(titleAction(table, 'Título técnico')).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({
      type: 'table.annotation.create',
      ...identity(),
      kind: 'note',
      plainText: 'Nota',
      expectedAnnotationOrder: [],
      target: { kind: 'TABLE', expectedAnnotationIds: [] },
    }).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({
      ...titleAction(table, 'Título'),
      surprise: true,
    }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({
      type: 'table.annotation.reorder',
      ...identity(),
      expectedOrder: ['a', 'b'],
      nextOrder: ['a', 'a'],
    }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({
      type: 'table.legend.reorder',
      ...identity(),
      expectedOrder: ['a', 'b'],
      nextOrder: ['a'],
    }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({
      type: 'table.cell.setImage',
      ...identity(),
      cellId: cell.id,
      expectedContent: cell.content,
      expectedContentPresentation: cell.contentPresentation,
      assetId: existingAsset.id,
      fit: 'contain',
      targetWidthU: 0,
      targetHeightU: mmToU(10),
    }).success).toBe(false);
  });
});

describe('W4.F.3 Table title semantics', () => {
  it('creates, updates with stable RichText IDs, no-ops, clears, and participates in one-step history', () => {
    const session = createDocumentSession(documentWith(emptyTable()), { createId: ids('fresh') });
    const before = session.getSnapshot();
    const create = session.execute(titleAction(topTable(before.document), 'Título inicial'));
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    const createdTitle = topTable(create.document).title!;
    expect(projectEditableRichText(createdTitle)).toBe('Título inicial');
    expect(create.metadata.createdIds).toHaveLength(2);
    expect(session.getSnapshot().localSequence).toBe(1);
    expect(session.getSnapshot().canUndo).toBe(true);

    const originalParagraphId = createdTitle.paragraphs[0].id;
    const originalInlineId = createdTitle.paragraphs[0].inlines[0]?.id;
    const update = session.execute(titleAction(topTable(session.getSnapshot().document), 'Título revisado'));
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    const updatedTitle = topTable(update.document).title!;
    expect(projectEditableRichText(updatedTitle)).toBe('Título revisado');
    expect(updatedTitle.paragraphs[0].id).toBe(originalParagraphId);
    expect(updatedTitle.paragraphs[0].inlines[0]?.id).toBe(originalInlineId);
    expect(update.metadata.createdIds).toEqual([]);

    const noOpBefore = session.getSnapshot();
    const noOp = session.execute(titleAction(topTable(noOpBefore.document), 'Título revisado'));
    expect(noOp.ok && noOp.metadata.changed).toBe(false);
    expect(session.getSnapshot()).toBe(noOpBefore);

    const clear = session.execute(titleAction(topTable(session.getSnapshot().document), null));
    expect(clear.ok).toBe(true);
    if (!clear.ok) return;
    expect(topTable(clear.document).title).toBeUndefined();
    expect(session.undo().ok).toBe(true);
    expect(projectEditableRichText(topTable(session.getSnapshot().document).title!)).toBe('Título revisado');
    expect(session.redo().ok).toBe(true);
    expect(topTable(session.getSnapshot().document).title).toBeUndefined();
  });

  it('uses title-only CAS, fails closed on advanced RichText, lock and closed Group', () => {
    const expected = emptyTable();
    const source = documentWith(expected);
    const live = structuredClone(source);
    topTable(live).cells[0].content = { type: 'technicalCode', value: 'unrelated' };
    expect(executeApplicationAction(live, titleAction(topTable(source), 'Título'), { createId: ids('fresh') }).ok).toBe(true);

    const stale = structuredClone(source);
    topTable(stale).title = plainRichText('someone-else', 'Mudou');
    const staleResult = executeApplicationAction(stale, titleAction(topTable(source), 'Título'), { createId: ids('fresh') });
    expect(staleResult.ok).toBe(false);
    if (!staleResult.ok) expect(staleResult.error.code).toBe('TARGET_STALE');

    const advanced = emptyTable();
    advanced.title = advancedRichText();
    const advancedDoc = documentWith(advanced);
    const advancedResult = executeApplicationAction(advancedDoc, titleAction(advanced, 'Não achatar'), { createId: ids('fresh') });
    expect(advancedResult.ok).toBe(false);
    if (!advancedResult.ok) expect(advancedResult.error.code).toBe('ACTION_INVALID');
    expect(topTable(advancedDoc).title).toEqual(advancedRichText());

    const lockedResult = executeApplicationAction(
      documentWith(emptyTable(), { locked: true }),
      titleAction(emptyTable(), 'Bloqueado'),
      { createId: ids('fresh') }
    );
    expect(lockedResult.ok).toBe(false);
    if (!lockedResult.ok) expect(lockedResult.error.code).toBe('OBJECT_LOCKED');

    const grouped = documentWith(emptyTable(), { grouped: true });
    const groupedResult = executeApplicationAction(grouped, titleAction(emptyTable(), 'Fechado'), { createId: ids('fresh') });
    expect(groupedResult.ok).toBe(false);
    if (!groupedResult.ok) expect(groupedResult.error.code).toBe('ACTION_INVALID');
  });
});

describe('W4.F.3 annotation semantics', () => {
  it('creates + initially attaches atomically and enforces caption/Table scope', () => {
    const table = emptyTable();
    const session = createDocumentSession(documentWith(table), { createId: ids('ann') });
    const before = session.getSnapshot();
    const create = session.execute({
      type: 'table.annotation.create',
      ...identity(),
      kind: 'note',
      plainText: 'Nota de processo',
      expectedAnnotationOrder: [],
      target: { kind: 'CELL', cellId: 'cell0-0', expectedAnnotationIds: [] },
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    const next = topTable(create.document);
    expect(next.annotations).toHaveLength(1);
    expect(projectEditableRichText(next.annotations[0].text)).toBe('Nota de processo');
    expect(next.cells[0].annotationIds).toEqual([next.annotations[0].id]);
    expect(create.metadata.createdIds).toHaveLength(3);
    expect(session.getSnapshot().localSequence).toBe(before.localSequence + 1);

    const captionToCell = session.execute({
      type: 'table.annotation.create',
      ...identity(),
      kind: 'caption',
      plainText: 'Legenda',
      expectedAnnotationOrder: next.annotations.map((entry) => entry.id),
      target: { kind: 'CELL', cellId: 'cell0-0', expectedAnnotationIds: next.cells[0].annotationIds ?? [] },
    });
    expect(captionToCell.ok).toBe(false);
    if (!captionToCell.ok) expect(captionToCell.error.code).toBe('ANNOTATION_SCOPE_INVALID');
  });

  it('attaches/detaches narrowly, prevents referenced removal, then removes without dangling refs', () => {
    const session = createDocumentSession(documentWith(emptyTable()), { createId: ids('ann') });
    const created = session.execute({
      type: 'table.annotation.create',
      ...identity(),
      kind: 'footnote',
      plainText: 'Rodapé',
      expectedAnnotationOrder: [],
      target: { kind: 'TABLE', expectedAnnotationIds: [] },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    let table = topTable(session.getSnapshot().document);
    const annotation = table.annotations[0];

    const inUse = session.execute({
      type: 'table.annotation.remove',
      ...identity(),
      annotationId: annotation.id,
      expectedAnnotation: annotation,
    });
    expect(inUse.ok).toBe(false);
    if (!inUse.ok) expect(inUse.error.code).toBe('ANNOTATION_IN_USE');

    const detach = session.execute({
      type: 'table.annotation.detach',
      ...identity(),
      annotationId: annotation.id,
      target: { kind: 'TABLE', expectedAnnotationIds: table.annotationIds ?? [] },
    });
    expect(detach.ok).toBe(true);
    table = topTable(session.getSnapshot().document);
    expect(table.annotationIds).toBeUndefined();

    const detachNoOpBefore = session.getSnapshot();
    const detachNoOp = session.execute({
      type: 'table.annotation.detach',
      ...identity(),
      annotationId: annotation.id,
      target: { kind: 'TABLE', expectedAnnotationIds: [] },
    });
    expect(detachNoOp.ok && detachNoOp.metadata.changed).toBe(false);
    expect(session.getSnapshot()).toBe(detachNoOpBefore);

    const remove = session.execute({
      type: 'table.annotation.remove',
      ...identity(),
      annotationId: annotation.id,
      expectedAnnotation: table.annotations[0],
    });
    expect(remove.ok).toBe(true);
    if (!remove.ok) return;
    expect(topTable(remove.document).annotations).toEqual([]);
    expect(topTable(remove.document).cells.every((cell) => !(cell.annotationIds ?? []).includes(annotation.id))).toBe(true);
  });

  it('reorders by membership/order CAS while preserving a concurrent text edit and derived numbering authority', () => {
    const table = emptyTable();
    table.annotations = [
      { id: 'note-a', kind: 'note', text: plainRichText('note-a-text', 'Primeira') },
      { id: 'note-b', kind: 'footnote', text: plainRichText('note-b-text', 'Segunda') },
    ];
    table.annotationIds = ['note-a', 'note-b'];
    const expected = documentWith(table);
    const live = structuredClone(expected);
    topTable(live).annotations[0].text = plainRichText('note-a-edited', 'Editada concorrentemente');

    const result = executeApplicationAction(live, {
      type: 'table.annotation.reorder',
      ...identity(),
      expectedOrder: ['note-a', 'note-b'],
      nextOrder: ['note-b', 'note-a'],
    }, { createId: ids('fresh') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(topTable(result.document).annotations.map((entry) => entry.id)).toEqual(['note-b', 'note-a']);
    expect(projectEditableRichText(topTable(result.document).annotations[1].text)).toBe('Editada concorrentemente');

    const stale = structuredClone(expected);
    topTable(stale).annotations.push({ id: 'note-c', kind: 'note', text: plainRichText('c', 'C') });
    const rejected = executeApplicationAction(stale, {
      type: 'table.annotation.reorder',
      ...identity(),
      expectedOrder: ['note-a', 'note-b'],
      nextOrder: ['note-b', 'note-a'],
    }, { createId: ids('fresh') });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe('TARGET_STALE');
  });

  it('updates simple text with ID preservation and refuses advanced RichText flattening', () => {
    const table = emptyTable();
    table.annotations = [{ id: 'note', kind: 'note', text: plainRichText('note-text', 'Antes') }];
    const document = documentWith(table);
    const current = topTable(document).annotations[0];
    const updated = executeApplicationAction(document, {
      type: 'table.annotation.update',
      ...identity(),
      annotationId: current.id,
      expectedAnnotation: current,
      plainText: 'Depois',
    }, { createId: ids('fresh') });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    const nextText = topTable(updated.document).annotations[0].text;
    expect(nextText.paragraphs[0].id).toBe(current.text.paragraphs[0].id);
    expect(nextText.paragraphs[0].inlines[0]?.id).toBe(current.text.paragraphs[0].inlines[0]?.id);

    const advancedTable = emptyTable();
    advancedTable.annotations = [{ id: 'advanced-note', kind: 'note', text: advancedRichText('advanced-note') }];
    const advancedDoc = documentWith(advancedTable);
    const advancedAnnotation = topTable(advancedDoc).annotations[0];
    const rejected = executeApplicationAction(advancedDoc, {
      type: 'table.annotation.update',
      ...identity(),
      annotationId: advancedAnnotation.id,
      expectedAnnotation: advancedAnnotation,
      plainText: 'Flatten?',
    }, { createId: ids('fresh') });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe('ACTION_INVALID');
    expect(topTable(advancedDoc).annotations[0]).toEqual(advancedAnnotation);
  });
});

describe('W4.F.3 Legend reorder semantics', () => {
  it('reorders live entries by ID, preserves concurrent text/marker references, and no-ops without history', () => {
    const table = emptyTable();
    table.legend = [
      { id: 'legend-a', markerCode: 'A', text: plainRichText('legend-a-text', 'Alpha') },
      { id: 'legend-b', markerCode: 'B', text: plainRichText('legend-b-text', 'Beta') },
    ];
    table.cells[0].content = { type: 'marker', legendEntryId: 'legend-a' };
    const live = documentWith(table);
    topTable(live).legend[0].text = plainRichText('legend-a-edited', 'Alpha editado');

    const result = executeApplicationAction(live, {
      type: 'table.legend.reorder',
      ...identity(),
      expectedOrder: ['legend-a', 'legend-b'],
      nextOrder: ['legend-b', 'legend-a'],
    }, { createId: ids('fresh') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = topTable(result.document);
    expect(next.legend.map((entry) => entry.id)).toEqual(['legend-b', 'legend-a']);
    expect(projectEditableRichText(next.legend[1].text)).toBe('Alpha editado');
    expect(next.cells[0].content).toEqual({ type: 'marker', legendEntryId: 'legend-a' });

    const session = createDocumentSession(result.document, { createId: ids('session') });
    const before = session.getSnapshot();
    const noOp = session.execute({
      type: 'table.legend.reorder',
      ...identity(),
      expectedOrder: ['legend-b', 'legend-a'],
      nextOrder: ['legend-b', 'legend-a'],
    });
    expect(noOp.ok && noOp.metadata.changed).toBe(false);
    expect(session.getSnapshot()).toBe(before);
  });
});

describe('W4.F.3 Image Cell semantics', () => {
  it('sets existing asset with integer-U materialization, preserving Cell style/annotations/span identity', () => {
    const table = emptyTable();
    table.annotations = [{ id: 'note', kind: 'note', text: plainRichText('note', 'Nota') }];
    table.cells[0].annotationIds = ['note'];
    table.cells[0].style = { background: '#FFFFFF' };
    table.cells[0].contentPresentation = { wrapPolicy: 'nowrap' };
    const source = documentWith(table, { assets: [existingAsset] });
    const cell = topTable(source).cells[0];
    const result = executeApplicationAction(source, {
      type: 'table.cell.setImage',
      ...identity(),
      cellId: cell.id,
      expectedContent: cell.content,
      expectedContentPresentation: cell.contentPresentation,
      assetId: existingAsset.id,
      fit: 'cover',
      targetWidthU: mmToU(21.25),
      targetHeightU: mmToU(12.5),
    }, { createId: ids('fresh') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = topTable(result.document).cells[0];
    expect(next.id).toBe(cell.id);
    expect(next.content).toEqual({ type: 'image', assetId: existingAsset.id });
    expect(next.contentPresentation).toEqual({
      wrapPolicy: 'nowrap',
      image: { fit: 'cover', targetWidthMm: 21.25, targetHeightMm: 12.5 },
    });
    expect(next.style).toEqual(cell.style);
    expect(next.annotationIds).toEqual(['note']);
  });

  it('uses narrow content/presentation CAS, accepts a new AssetRef, rejects missing/divergent asset, and clears without GC', () => {
    const base = emptyTable();
    const source = documentWith(base, { assets: [existingAsset] });
    const prepared = topTable(source).cells[0];

    const unrelated = structuredClone(source);
    topTable(unrelated).cells[0].style = { color: '#003366' };
    const okay = executeApplicationAction(unrelated, {
      type: 'table.cell.setImage',
      ...identity(),
      cellId: prepared.id,
      expectedContent: prepared.content,
      expectedContentPresentation: prepared.contentPresentation,
      assetId: existingAsset.id,
      fit: 'contain',
      targetWidthU: mmToU(20),
      targetHeightU: mmToU(12),
    }, { createId: ids('fresh') });
    expect(okay.ok).toBe(true);

    const stale = structuredClone(source);
    topTable(stale).cells[0].content = { type: 'technicalCode', value: 'changed' };
    const staleResult = executeApplicationAction(stale, {
      type: 'table.cell.setImage',
      ...identity(),
      cellId: prepared.id,
      expectedContent: prepared.content,
      expectedContentPresentation: prepared.contentPresentation,
      assetId: existingAsset.id,
      fit: 'contain',
      targetWidthU: mmToU(20),
      targetHeightU: mmToU(12),
    }, { createId: ids('fresh') });
    expect(staleResult.ok).toBe(false);
    if (!staleResult.ok) expect(staleResult.error.code).toBe('TARGET_STALE');

    const withNew = executeApplicationAction(source, {
      type: 'table.cell.setImage',
      ...identity(),
      cellId: prepared.id,
      expectedContent: prepared.content,
      expectedContentPresentation: prepared.contentPresentation,
      assetId: uploadedAsset.id,
      asset: uploadedAsset,
      fit: 'contain',
      targetWidthU: mmToU(20),
      targetHeightU: mmToU(12),
    }, { createId: ids('fresh') });
    expect(withNew.ok).toBe(true);
    if (!withNew.ok) return;
    expect(withNew.document.assets.some((asset) => asset.id === uploadedAsset.id)).toBe(true);
    expect(withNew.metadata.createdIds).toEqual([uploadedAsset.id]);

    const missing = executeApplicationAction(source, {
      type: 'table.cell.setImage',
      ...identity(),
      cellId: prepared.id,
      expectedContent: prepared.content,
      expectedContentPresentation: prepared.contentPresentation,
      assetId: 'missing-asset',
      fit: 'contain',
      targetWidthU: mmToU(20),
      targetHeightU: mmToU(12),
    }, { createId: ids('fresh') });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('ASSET_NOT_FOUND');

    const divergent = executeApplicationAction(source, {
      type: 'table.cell.setImage',
      ...identity(),
      cellId: prepared.id,
      expectedContent: prepared.content,
      expectedContentPresentation: prepared.contentPresentation,
      assetId: existingAsset.id,
      asset: { ...existingAsset, alt: 'Metadado divergente' },
      fit: 'contain',
      targetWidthU: mmToU(20),
      targetHeightU: mmToU(12),
    }, { createId: ids('fresh') });
    expect(divergent.ok).toBe(false);
    if (!divergent.ok) expect(divergent.error.code).toBe('ACTION_INVALID');

    const imageTable = topTable(withNew.document);
    const imageCell = imageTable.cells[0];
    const cleared = executeApplicationAction(withNew.document, {
      type: 'table.cell.clearImage',
      ...identity(),
      cellId: imageCell.id,
      expectedContent: imageCell.content,
      expectedContentPresentation: imageCell.contentPresentation,
    }, { createId: ids('fresh') });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(topTable(cleared.document).cells[0].content).toEqual({ type: 'empty' });
    expect(topTable(cleared.document).cells[0].contentPresentation).toBeUndefined();
    expect(cleared.document.assets.some((asset) => asset.id === uploadedAsset.id)).toBe(true);
  });

  it('rejects covered Cell and clearing non-image Cell; identical image set is a semantic no-op', () => {
    const covered = emptyTable();
    covered.cells[0].span = { rows: 1, columns: 2 };
    covered.cells[1].coveredBy = covered.cells[0].id;
    const coveredDoc = documentWith(covered, { assets: [existingAsset] });
    const coveredCell = topTable(coveredDoc).cells[1];
    const coveredResult = executeApplicationAction(coveredDoc, {
      type: 'table.cell.setImage',
      ...identity(),
      cellId: coveredCell.id,
      expectedContent: coveredCell.content,
      expectedContentPresentation: coveredCell.contentPresentation,
      assetId: existingAsset.id,
      fit: 'contain',
      targetWidthU: mmToU(20),
      targetHeightU: mmToU(12),
    }, { createId: ids('fresh') });
    expect(coveredResult.ok).toBe(false);
    if (!coveredResult.ok) expect(coveredResult.error.code).toBe('ACTION_INVALID');

    const emptyDoc = documentWith(emptyTable(), { assets: [existingAsset] });
    const emptyCell = topTable(emptyDoc).cells[0];
    const clearInvalid = executeApplicationAction(emptyDoc, {
      type: 'table.cell.clearImage',
      ...identity(),
      cellId: emptyCell.id,
      expectedContent: emptyCell.content,
      expectedContentPresentation: emptyCell.contentPresentation,
    }, { createId: ids('fresh') });
    expect(clearInvalid.ok).toBe(false);
    if (!clearInvalid.ok) expect(clearInvalid.error.code).toBe('ACTION_INVALID');

    const image = emptyTable();
    image.cells[0].content = { type: 'image', assetId: existingAsset.id };
    image.cells[0].contentPresentation = { image: { fit: 'contain', targetWidthMm: 20, targetHeightMm: 12 } };
    const session = createDocumentSession(
      documentWith(image, { assets: [existingAsset] }),
      { createId: ids('session') }
    );
    const before = session.getSnapshot();
    const cell = topTable(before.document).cells[0];
    const noOp = session.execute({
      type: 'table.cell.setImage',
      ...identity(),
      cellId: cell.id,
      expectedContent: cell.content,
      expectedContentPresentation: cell.contentPresentation,
      assetId: existingAsset.id,
      fit: 'contain',
      targetWidthU: mmToU(20),
      targetHeightU: mmToU(12),
    });
    expect(noOp.ok && noOp.metadata.changed).toBe(false);
    expect(session.getSnapshot()).toBe(before);
  });
});
