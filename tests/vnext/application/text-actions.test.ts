import { describe, expect, it } from 'vitest';
import {
  plainRichText,
  type CatalogDocument,
  type EditorialObject,
  type RichText,
} from '@/vnext';
import {
  ApplicationActionSchema,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
  projectEditableRichText,
  type IdGenerator,
} from '@/vnext/application';

function ids(prefix = 'generated'): IdGenerator {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function sequence(values: readonly string[]): IdGenerator {
  let index = 0;
  return () => {
    const value = values[index++];
    if (!value) throw new Error('ID sequence exhausted');
    return value;
  };
}

function rich(lines: readonly string[], prefix = 'rich'): RichText {
  return {
    paragraphs: lines.map((text, index) => ({
      id: `${prefix}-p${index + 1}`,
      inlines: text
        ? [{ kind: 'text' as const, id: `${prefix}-t${index + 1}`, text, marks: [] }]
        : [],
    })),
  };
}

function marked(text: string, prefix = 'marked'): RichText {
  return {
    paragraphs: [{
      id: `${prefix}-p`,
      inlines: [{ kind: 'text', id: `${prefix}-t`, text, marks: ['bold', 'italic'] }],
    }],
  };
}

function textDocument(text: RichText = plainRichText('local', 'Modelo')): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'W2.G');
  const object: EditorialObject = {
    id: 'text-object',
    type: 'text',
    frame: { xMm: 12.25, yMm: 22.5, widthMm: 68.75, heightMm: 16.5 },
    zIndex: 7,
    locked: false,
    text,
    style: {
      fontFamily: 'Noto Sans',
      fontSizePt: 10,
      lineHeight: 1.25,
      fontWeight: 700,
      color: '#172033',
      textAlign: 'left',
    },
  };
  return {
    ...base,
    pages: [{ ...base.pages[0], objects: [object] }],
  };
}

function textObject(document: CatalogDocument) {
  const object = document.pages[0].objects.find((entry) => entry.id === 'text-object');
  if (!object || object.type !== 'text') throw new Error('Missing text object');
  return object;
}

function setText(document: CatalogDocument, plainText: string, createId = ids()) {
  return executeApplicationAction(document, {
    type: 'text.setContent',
    objectId: 'text-object',
    expectedText: textObject(document).text,
    plainText,
  }, { createId });
}

function complexMultiInline(): RichText {
  return {
    paragraphs: [{
      id: 'complex-p',
      inlines: [
        { kind: 'text', id: 'complex-a', text: 'A', marks: [] },
        { kind: 'text', id: 'complex-b', text: 'B', marks: ['bold'] },
      ],
    }],
  };
}

describe('W2.G text.setContent', () => {
  it('runtime-validates the strict action, Unicode/LF, empty text, and rejects controls/CR/unknown fields', () => {
    const expectedText = plainRichText('x', 'A');
    expect(ApplicationActionSchema.safeParse({
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText,
      plainText: '',
    }).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText,
      plainText: '± 0.05 °C\n100 Ω\n≤ 50 µV\n≈',
    }).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText,
      plainText: 'A\tB',
    }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText,
      plainText: 'A\r\nB',
    }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText,
      plainText: 'A',
      extra: true,
    }).success).toBe(false);
  });

  it('projects only the explicit lossless textarea subset', () => {
    expect(projectEditableRichText(rich(['A', '', 'C']))).toBe('A\n\nC');
    expect(projectEditableRichText(complexMultiInline())).toBeNull();
    expect(projectEditableRichText({
      paragraphs: [{ id: 'p', inlines: [{ kind: 'lineBreak', id: 'br' }] }],
    })).toBeNull();
    expect(projectEditableRichText({
      paragraphs: [{
        id: 'p',
        inlines: [{ kind: 'text', id: 't', text: 'A', marks: [] }],
        list: { kind: 'unordered', level: 0 },
      }],
    })).toBeNull();
  });

  it('changes only Text content and preserves object/frame/zIndex/locked/style exactly', () => {
    const before = textDocument();
    const source = textObject(before);
    const result = setText(before, 'TA-25N');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = textObject(result.document);
    expect(after.id).toBe(source.id);
    expect(after.frame).toEqual(source.frame);
    expect(after.zIndex).toBe(source.zIndex);
    expect(after.locked).toBe(source.locked);
    expect(after.style).toEqual(source.style);
    expect(projectEditableRichText(after.text)).toBe('TA-25N');
    expect(result.metadata).toMatchObject({
      actionType: 'text.setContent',
      affectedIds: ['text-object'],
      changed: true,
    });
  });

  it('returns OBJECT_NOT_FOUND, OBJECT_TYPE_MISMATCH, OBJECT_LOCKED, and grouped-child ACTION_INVALID in the frozen order', () => {
    const document = textDocument();
    const expectedText = textObject(document).text;
    const missing = executeApplicationAction(document, {
      type: 'text.setContent', objectId: 'missing', expectedText, plainText: 'X',
    }, { createId: ids() });
    expect(missing.ok ? null : missing.error.code).toBe('OBJECT_NOT_FOUND');

    const shapeDocument: CatalogDocument = {
      ...document,
      pages: [{
        ...document.pages[0],
        objects: [{
          id: 'text-object',
          type: 'shape',
          frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
          zIndex: 0,
          shape: 'rectangle',
          style: {},
        }],
      }],
    };
    const mismatch = executeApplicationAction(shapeDocument, {
      type: 'text.setContent', objectId: 'text-object', expectedText, plainText: 'X',
    }, { createId: ids() });
    expect(mismatch.ok ? null : mismatch.error.code).toBe('OBJECT_TYPE_MISMATCH');

    const lockedDocument: CatalogDocument = {
      ...document,
      pages: [{
        ...document.pages[0],
        objects: [{ ...textObject(document), locked: true }],
      }],
    };
    const locked = executeApplicationAction(lockedDocument, {
      type: 'text.setContent', objectId: 'text-object', expectedText, plainText: 'X',
    }, { createId: ids() });
    expect(locked.ok ? null : locked.error.code).toBe('OBJECT_LOCKED');

    const groupedDocument: CatalogDocument = {
      ...document,
      pages: [{
        ...document.pages[0],
        objects: [{
          id: 'group',
          type: 'group',
          frame: { xMm: 10, yMm: 10, widthMm: 40, heightMm: 20 },
          zIndex: 0,
          objects: [
            {
              ...textObject(document),
              frame: { xMm: 0, yMm: 0, widthMm: 20, heightMm: 10 },
              zIndex: 0,
            },
            {
              id: 'shape-child',
              type: 'shape',
              frame: { xMm: 20, yMm: 0, widthMm: 20, heightMm: 20 },
              zIndex: 1,
              shape: 'rectangle',
              style: {},
            },
          ],
        }],
      }],
    };
    const grouped = executeApplicationAction(groupedDocument, {
      type: 'text.setContent', objectId: 'text-object', expectedText, plainText: 'X',
    }, { createId: ids() });
    expect(grouped.ok ? null : grouped.error.code).toBe('ACTION_INVALID');
  });

  it('rejects stale expectedText while allowing unrelated document changes', () => {
    const original = textDocument();
    const expectedText = textObject(original).text;
    const staleDocument: CatalogDocument = {
      ...original,
      pages: [{
        ...original.pages[0],
        objects: [{ ...textObject(original), text: plainRichText('changed', 'Changed elsewhere') }],
      }],
    };
    const stale = executeApplicationAction(staleDocument, {
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText,
      plainText: 'Draft',
    }, { createId: ids() });
    expect(stale.ok ? null : stale.error.code).toBe('ACTION_INVALID');
    expect(stale.ok ? '' : stale.error.details).toContain('Stale text edit');

    const unrelated: CatalogDocument = {
      ...original,
      title: 'Unrelated change',
    };
    const allowed = executeApplicationAction(unrelated, {
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText,
      plainText: 'Draft',
    }, { createId: ids() });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(projectEditableRichText(textObject(allowed.document).text)).toBe('Draft');
  });

  it('treats identical plain text as a true no-op without consuming IDs', () => {
    const document = textDocument();
    let calls = 0;
    const result = setText(document, 'Modelo', () => {
      calls += 1;
      return `unused-${calls}`;
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.changed).toBe(false);
    expect(result.metadata.createdIds).toEqual([]);
    expect(result.document).toEqual(document);
    expect(calls).toBe(0);
  });

  it('preserves Redo after a no-op and after a failed action', () => {
    const session = createDocumentSession(textDocument(), { createId: ids('session') });
    const originalText = textObject(session.getSnapshot().document).text;
    const changed = session.execute({
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText: originalText,
      plainText: 'Changed',
    });
    expect(changed.ok).toBe(true);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().canRedo).toBe(true);

    const current = textObject(session.getSnapshot().document).text;
    const noop = session.execute({
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText: current,
      plainText: 'Modelo',
    });
    expect(noop.ok && noop.metadata.changed).toBe(false);
    expect(session.getSnapshot().canRedo).toBe(true);

    const failed = session.execute({
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText: plainRichText('stale', 'Stale'),
      plainText: 'Failure',
    });
    expect(failed.ok).toBe(false);
    expect(session.getSnapshot().canRedo).toBe(true);
  });

  it('passes technical Unicode symbols unchanged', () => {
    const value = '± 0.05 °C\n100 Ω\n≤ 50 µV\n≥ 0\n≈';
    const result = setText(textDocument(), value);
    expect(result.ok).toBe(true);
    if (result.ok) expect(projectEditableRichText(textObject(result.document).text)).toBe(value);
  });

  it.each([
    ['', ['']],
    ['One paragraph', ['One paragraph']],
    ['A\nB', ['A', 'B']],
    ['A\n\nC', ['A', '', 'C']],
    ['A\n', ['A', '']],
  ] as const)('represents plain draft %j without illegal empty text inlines', (plainText, expectedLines) => {
    const result = setText(textDocument(), plainText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = textObject(result.document).text;
    expect(projectEditableRichText(output)).toBe(plainText);
    expect(output.paragraphs).toHaveLength(expectedLines.length);
    expectedLines.forEach((line, index) => {
      expect(output.paragraphs[index].inlines).toHaveLength(line ? 1 : 0);
    });
  });

  it('preserves unchanged later paragraph IDs when inserting at the beginning', () => {
    const document = textDocument(rich(['Modelo', 'Especificações'], 'before'));
    const result = setText(document, 'TA-25N\nModelo\nEspecificações', sequence(['new-p', 'new-t']));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paragraphs = textObject(result.document).text.paragraphs;
    expect(paragraphs.map((paragraph) => paragraph.id)).toEqual(['new-p', 'before-p1', 'before-p2']);
    expect(paragraphs.map((paragraph) => paragraph.inlines[0]?.id)).toEqual(['new-t', 'before-t1', 'before-t2']);
  });

  it('preserves surrounding IDs for middle insertion and surviving IDs for deletion', () => {
    const source = rich(['A', 'C'], 'middle');
    const inserted = setText(textDocument(source), 'A\nB\nC', sequence(['insert-p', 'insert-t']));
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const insertedParagraphs = textObject(inserted.document).text.paragraphs;
    expect(insertedParagraphs.map((paragraph) => paragraph.id)).toEqual(['middle-p1', 'insert-p', 'middle-p2']);

    const deleted = executeApplicationAction(inserted.document, {
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText: textObject(inserted.document).text,
      plainText: 'A\nC',
    }, { createId: ids('delete') });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) {
      expect(textObject(deleted.document).text.paragraphs.map((paragraph) => paragraph.id))
        .toEqual(['middle-p1', 'middle-p2']);
    }
  });

  it('uses positional substitution for ordinary replacement, preserving paragraph/inline IDs and marks', () => {
    const source = marked('Old');
    const result = setText(textDocument(source), 'New');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paragraph = textObject(result.document).text.paragraphs[0];
    expect(paragraph.id).toBe('marked-p');
    expect(paragraph.inlines).toEqual([{
      kind: 'text',
      id: 'marked-t',
      text: 'New',
      marks: ['bold', 'italic'],
    }]);
  });

  it('allocates only genuinely new paragraph/inline identities and reports them in metadata', () => {
    const source = rich(['A'], 'source');
    const result = setText(textDocument(source), 'A\nB\n', sequence(['fresh-p2', 'fresh-t2', 'fresh-p3']));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.createdIds).toEqual(['fresh-p2', 'fresh-t2', 'fresh-p3']);
    const paragraphs = textObject(result.document).text.paragraphs;
    expect(paragraphs.map((paragraph) => paragraph.id)).toEqual(['source-p1', 'fresh-p2', 'fresh-p3']);
    expect(new Set(result.metadata.createdIds).size).toBe(result.metadata.createdIds.length);
    expect(paragraphs[2].inlines).toEqual([]);
  });

  it('uses the canonical reservation closure and fails closed on an adversarial generated ID collision', () => {
    const document = textDocument(rich(['A'], 'collision'));
    const result = setText(document, 'A\nB', () => 'collision-p1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('DUPLICATE_ID');
  });

  it.each([
    ['multiple text inlines', complexMultiInline()],
    ['explicit lineBreak', { paragraphs: [{ id: 'p', inlines: [{ kind: 'lineBreak' as const, id: 'br' }] }] }],
    ['list structure', {
      paragraphs: [{
        id: 'p',
        inlines: [{ kind: 'text' as const, id: 't', text: 'A', marks: [] }],
        list: { kind: 'ordered' as const, level: 0 as const },
      }],
    }],
  ])('rejects unsupported complex RichText: %s', (_label, value) => {
    const document = textDocument(value as RichText);
    const before = JSON.stringify(document);
    const result = setText(document, 'Replacement');
    expect(result.ok).toBe(false);
    expect(JSON.stringify(document)).toBe(before);
    if (!result.ok) expect(result.error.code).toBe('ACTION_INVALID');
  });

  it('does not corrupt existing complex RichText when the plain editor action is attempted', () => {
    const document = textDocument(complexMultiInline());
    const session = createDocumentSession(document, { createId: ids('complex') });
    const before = session.getSnapshot();
    const result = session.execute({
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText: textObject(before.document).text,
      plainText: 'AB',
    });
    expect(result.ok).toBe(false);
    expect(session.getSnapshot().document).toBe(before.document);
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(session.getSnapshot().canRedo).toBe(false);
  });

  it('records one successful commit as one Undo and Redo restores the exact edited RichText IDs/snapshot', () => {
    const session = createDocumentSession(textDocument(rich(['Original'], 'history')), {
      createId: sequence(['new-p', 'new-t']),
    });
    const original = textObject(session.getSnapshot().document).text;
    const result = session.execute({
      type: 'text.setContent',
      objectId: 'text-object',
      expectedText: original,
      plainText: 'Original\nAdded',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const edited = textObject(session.getSnapshot().document).text;
    expect(session.getSnapshot().canUndo).toBe(true);
    expect(session.undo().ok).toBe(true);
    expect(textObject(session.getSnapshot().document).text).toEqual(original);
    expect(session.redo().ok).toBe(true);
    expect(textObject(session.getSnapshot().document).text).toEqual(edited);
  });
});
