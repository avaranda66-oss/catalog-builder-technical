import { describe, expect, it } from 'vitest';
import { CatalogDocumentSchema, plainRichText, validateDocument, type CatalogDocument, type RichText } from '@/vnext';
import {
  ApplicationActionSchema,
  canonicalIdentityIds,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
  type IdGenerator,
} from '@/vnext/application';

function sequenceIds(prefix = 'id'): IdGenerator {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function complexDocument(): CatalogDocument {
  const document = createCatalogDocument(sequenceIds('base'), 'Documento complexo');
  return {
    ...document,
    pages: [{
      ...document.pages[0],
      objects: [
        {
          id: 'text-object',
          type: 'text',
          frame: { xMm: 12, yMm: 12, widthMm: 80, heightMm: 20 },
          zIndex: 0,
          text: plainRichText('text-rich', 'PRESYS'),
          style: {},
        },
        {
          id: 'table-object',
          type: 'table',
          frame: { xMm: 12, yMm: 40, widthMm: 120, heightMm: 60 },
          zIndex: 1,
          table: {
            id: 'table',
            columns: [
              { id: 'column-a', width: { mode: 'flex', weight: 1 }, minMm: 20 },
              { id: 'column-b', width: { mode: 'flex', weight: 1 }, minMm: 20 },
            ],
            rows: [{ id: 'row-a', role: 'body', heightPolicy: { mode: 'AUTO' } }],
            cells: [
              {
                id: 'cell-a',
                rowId: 'row-a',
                columnId: 'column-a',
                content: { type: 'richText', value: plainRichText('cell-rich', 'Valor') },
                annotationIds: ['annotation-note'],
              },
              {
                id: 'cell-b',
                rowId: 'row-a',
                columnId: 'column-b',
                content: { type: 'marker', legendEntryId: 'legend-a' },
              },
            ],
            style: { base: {}, rowRoles: {}, annotation: {}, annotationGapMm: 1 },
            annotationIds: ['annotation-caption'],
            annotations: [
              { id: 'annotation-caption', kind: 'caption', text: plainRichText('caption-rich', 'Tabela') },
              { id: 'annotation-note', kind: 'note', text: plainRichText('note-rich', 'Nota') },
            ],
            legend: [{ id: 'legend-a', markerCode: '●', text: plainRichText('legend-rich', 'Compatível') }],
          },
        },
      ],
    }],
  };
}

function sharedLocalRichText(text: string): RichText {
  return {
    paragraphs: [{
      id: 'p-shared',
      inlines: [{ kind: 'text', id: 't-shared', text, marks: [] }],
    }],
  };
}

function reusedRichTextIdentityDocument(): CatalogDocument {
  const document = createCatalogDocument(sequenceIds('shared-base'), 'IDs locais compartilhados');
  return {
    ...document,
    pages: [{
      ...document.pages[0],
      objects: [
        {
          id: 'shared-text-a',
          type: 'text',
          frame: { xMm: 12, yMm: 12, widthMm: 80, heightMm: 20 },
          zIndex: 0,
          text: sharedLocalRichText('Texto A'),
          style: {},
        },
        {
          id: 'shared-text-b',
          type: 'text',
          frame: { xMm: 12, yMm: 36, widthMm: 80, heightMm: 20 },
          zIndex: 1,
          text: sharedLocalRichText('Texto B'),
          style: {},
        },
      ],
    }],
  };
}

describe('VNext Application Actions', () => {
  it('uses one strict runtime-validatable action contract', () => {
    expect(ApplicationActionSchema.safeParse({ type: 'page.add' }).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({ type: 'page.add', surprise: true }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({ type: 'document.replace', document: {} }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({ type: 'page.reorder', pageId: 'p', targetIndex: -1 }).success).toBe(false);
  });

  it('fails closed without mutating input on invalid external action data', () => {
    const document = createCatalogDocument(sequenceIds('initial'));
    const before = JSON.stringify(document);
    const result = executeApplicationAction(
      document,
      { type: 'page.add', unknown: true },
      { createId: sequenceIds('new') }
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
    expect(JSON.stringify(document)).toBe(before);
  });

  it('adds, deletes and reorders pages while preserving a valid document', () => {
    const ids = sequenceIds('generated');
    const initial = createCatalogDocument(sequenceIds('initial'));
    const added = executeApplicationAction(initial, { type: 'page.add' }, { createId: ids });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.document.pages).toHaveLength(2);
    expect(added.metadata.createdIds).toHaveLength(1);

    const secondPageId = added.document.pages[1].id;
    const reordered = executeApplicationAction(
      added.document,
      { type: 'page.reorder', pageId: secondPageId, targetIndex: 0 },
      { createId: ids }
    );
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(reordered.document.pages[0].id).toBe(secondPageId);

    const deleted = executeApplicationAction(
      reordered.document,
      { type: 'page.delete', pageId: secondPageId },
      { createId: ids }
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.document.pages).toHaveLength(1);
  });

  it('protects the last-page invariant and validates reorder targets', () => {
    const document = createCatalogDocument(sequenceIds('initial'));
    const pageId = document.pages[0].id;

    expect(executeApplicationAction(
      document,
      { type: 'page.delete', pageId },
      { createId: sequenceIds('unused') }
    )).toMatchObject({ ok: false, error: { code: 'LAST_PAGE_REQUIRED' } });

    expect(executeApplicationAction(
      document,
      { type: 'page.reorder', pageId, targetIndex: 1 },
      { createId: sequenceIds('unused') }
    )).toMatchObject({ ok: false, error: { code: 'INVALID_REORDER_TARGET' } });

    expect(executeApplicationAction(
      document,
      { type: 'page.delete', pageId: 'missing' },
      { createId: sequenceIds('unused') }
    )).toMatchObject({ ok: false, error: { code: 'PAGE_NOT_FOUND' } });
  });

  it('deeply duplicates page identities and rewrites internal references', () => {
    const document = complexDocument();
    const sourcePage = document.pages[0];
    const result = executeApplicationAction(
      document,
      { type: 'page.duplicate', pageId: sourcePage.id },
      { createId: sequenceIds('fresh') }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.pages).toHaveLength(2);
    const duplicate = result.document.pages[1];
    expect(duplicate.id).not.toBe(sourcePage.id);
    expect(duplicate.objects.map((object) => object.id)).not.toEqual(sourcePage.objects.map((object) => object.id));

    const duplicateTableObject = duplicate.objects.find((object) => object.type === 'table');
    expect(duplicateTableObject?.type).toBe('table');
    if (!duplicateTableObject || duplicateTableObject.type !== 'table') return;
    const duplicateTable = duplicateTableObject.table;
    const marker = duplicateTable.cells.find((cell) => cell.content.type === 'marker');
    expect(marker?.content.type).toBe('marker');
    const markerContent = marker?.content;
    if (markerContent?.type === 'marker') {
      expect(duplicateTable.legend.some((entry) => entry.id === markerContent.legendEntryId)).toBe(true);
      expect(markerContent.legendEntryId).not.toBe('legend-a');
    }
    expect(duplicateTable.cells[0].annotationIds?.[0]).not.toBe('annotation-note');
    expect(duplicateTable.annotations.map((annotation) => annotation.id)).not.toContain('annotation-note');

    const allIds = canonicalIdentityIds(result.document);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(result.metadata.createdIds).toContain(duplicate.id);
  });

  it('preserves W0 RichText-local identity scope while duplicating with fresh local IDs', () => {
    const document = reusedRichTextIdentityDocument();
    const original = JSON.stringify(document);

    expect(CatalogDocumentSchema.safeParse(document).success).toBe(true);
    expect(validateDocument(document).filter((diagnostic) => diagnostic.severity === 'ERROR')).toEqual([]);

    const session = createDocumentSession(document, { createId: sequenceIds('fresh-shared') });
    expect(session.getSnapshot().document).toEqual(document);

    const renamed = session.execute({ type: 'document.rename', title: 'Renomeado' });
    expect(renamed.ok).toBe(true);
    const afterRename = JSON.stringify(session.getSnapshot().document);

    const duplicated = session.execute({ type: 'page.duplicate', pageId: document.pages[0].id });
    expect(duplicated.ok).toBe(true);
    if (!duplicated.ok) return;
    expect(duplicated.document.pages).toHaveLength(2);
    expect(validateDocument(duplicated.document).filter((diagnostic) => diagnostic.severity === 'ERROR')).toEqual([]);

    const duplicatedTextObjects = duplicated.document.pages[1].objects.filter((object) => object.type === 'text');
    expect(duplicatedTextObjects).toHaveLength(2);
    const duplicatedLocalIds = duplicatedTextObjects.map((object) => {
      if (object.type !== 'text') throw new Error('Expected text object');
      return [object.text.paragraphs[0].id, object.text.paragraphs[0].inlines[0].id];
    });
    expect(duplicatedLocalIds[0]).not.toEqual(['p-shared', 't-shared']);
    expect(duplicatedLocalIds[1]).not.toEqual(['p-shared', 't-shared']);
    expect(duplicatedLocalIds[0]).not.toEqual(duplicatedLocalIds[1]);
    expect(JSON.stringify(document)).toBe(original);

    expect(session.undo().ok).toBe(true);
    expect(JSON.stringify(session.getSnapshot().document)).toBe(afterRename);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.pages).toHaveLength(2);
  });

  it('fails page duplication on a generated ID collision without changing the document', () => {
    const document = complexDocument();
    const before = JSON.stringify(document);
    const result = executeApplicationAction(
      document,
      { type: 'page.duplicate', pageId: document.pages[0].id },
      { createId: () => document.id }
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'DUPLICATE_ID' } });
    expect(JSON.stringify(document)).toBe(before);
  });

  it('does not consume an ID or history entry when page.add targets a missing page', () => {
    const document = createCatalogDocument(sequenceIds('initial'));
    let generated = 0;
    const session = createDocumentSession(document, {
      createId: () => `counted-${++generated}`,
    });
    const before = JSON.stringify(session.getSnapshot().document);

    const result = session.execute({ type: 'page.add', afterPageId: 'missing-page' });

    expect(result).toMatchObject({ ok: false, error: { code: 'PAGE_NOT_FOUND' } });
    expect(generated).toBe(0);
    expect(JSON.stringify(session.getSnapshot().document)).toBe(before);
    expect(session.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false });
  });
});

describe('VNext in-memory document session', () => {
  it('records successful actions, excludes failures, and restores exact snapshots with Undo/Redo', () => {
    const initial = createCatalogDocument(sequenceIds('initial'));
    const session = createDocumentSession(initial, { createId: sequenceIds('session') });
    const original = JSON.stringify(session.getSnapshot().document);

    expect(session.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false });
    expect(session.undo()).toMatchObject({ ok: false, error: { code: 'NOTHING_TO_UNDO' } });

    const failed = session.execute({ type: 'page.delete', pageId: initial.pages[0].id });
    expect(failed).toMatchObject({ ok: false, error: { code: 'LAST_PAGE_REQUIRED' } });
    expect(session.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false });
    expect(JSON.stringify(session.getSnapshot().document)).toBe(original);

    const added = session.execute({ type: 'page.add' });
    expect(added.ok).toBe(true);
    const afterAdd = JSON.stringify(session.getSnapshot().document);
    expect(session.getSnapshot()).toMatchObject({ canUndo: true, canRedo: false });

    expect(session.undo().ok).toBe(true);
    expect(JSON.stringify(session.getSnapshot().document)).toBe(original);
    expect(session.getSnapshot()).toMatchObject({ canUndo: false, canRedo: true });

    expect(session.redo().ok).toBe(true);
    expect(JSON.stringify(session.getSnapshot().document)).toBe(afterAdd);
    expect(session.getSnapshot()).toMatchObject({ canUndo: true, canRedo: false });
    expect(session.redo()).toMatchObject({ ok: false, error: { code: 'NOTHING_TO_REDO' } });
  });

  it('clears redo after a divergent successful action', () => {
    const session = createDocumentSession(
      createCatalogDocument(sequenceIds('initial')),
      { createId: sequenceIds('session') }
    );
    session.execute({ type: 'page.add' });
    session.undo();
    expect(session.getSnapshot().canRedo).toBe(true);

    session.execute({ type: 'document.rename', title: 'Novo caminho' });
    expect(session.getSnapshot().canRedo).toBe(false);
    expect(session.redo()).toMatchObject({ ok: false, error: { code: 'NOTHING_TO_REDO' } });
  });

  it('coalesces contiguous actions with the same transactionId into one Undo step', () => {
    const initial = createCatalogDocument(sequenceIds('initial'), 'Original');
    const session = createDocumentSession(initial, { createId: sequenceIds('session') });

    session.execute({ type: 'document.rename', title: 'Intermediário' }, { transactionId: 'gesture-1' });
    session.execute({ type: 'document.rename', title: 'Final' }, { transactionId: 'gesture-1' });
    expect(session.getSnapshot().document.title).toBe('Final');

    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.title).toBe('Original');
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('treats semantic no-ops as success without creating history or clearing redo', () => {
    const initial = createCatalogDocument(sequenceIds('initial'), 'Original');
    const session = createDocumentSession(initial, { createId: sequenceIds('session') });

    const renameNoOp = session.execute({ type: 'document.rename', title: 'Original' });
    expect(renameNoOp).toMatchObject({ ok: true, metadata: { changed: false } });
    expect(session.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false });

    session.execute({ type: 'page.add' });
    const firstPageId = session.getSnapshot().document.pages[0].id;
    const reorderNoOp = session.execute({ type: 'page.reorder', pageId: firstPageId, targetIndex: 0 });
    expect(reorderNoOp).toMatchObject({ ok: true, metadata: { changed: false } });

    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot()).toMatchObject({ canUndo: false, canRedo: true });

    const redoPreservingNoOp = session.execute({ type: 'document.rename', title: 'Original' });
    expect(redoPreservingNoOp).toMatchObject({ ok: true, metadata: { changed: false } });
    expect(session.getSnapshot()).toMatchObject({ canUndo: false, canRedo: true });
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.pages).toHaveLength(2);
  });

  it('exposes frozen canonical snapshots so consumers cannot mutate session state directly', () => {
    const session = createDocumentSession(
      createCatalogDocument(sequenceIds('initial')),
      { createId: sequenceIds('session') }
    );
    const snapshot = session.getSnapshot();
    expect(Object.isFrozen(snapshot.document)).toBe(true);
    expect(Object.isFrozen(snapshot.document.pages)).toBe(true);
    expect(Object.isFrozen(snapshot.document.pages[0])).toBe(true);
    expect(() => snapshot.document.pages.push(snapshot.document.pages[0])).toThrow();
    expect(session.getSnapshot().document.pages).toHaveLength(1);
  });
});
