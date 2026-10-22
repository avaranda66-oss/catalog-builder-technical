import { describe, expect, it } from 'vitest';
import { plainRichText, type CatalogDocument, type TextObject, type TextStyle } from '@/vnext/domain';
import {
  ApplicationActionSchema,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
} from '@/vnext/application';

function ids(prefix = 'generated') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

const STYLE: TextStyle = {
  fontFamily: 'Noto Sans',
  fontSizePt: 10,
  lineHeight: 1.2,
  fontWeight: 400,
  color: '#172033',
  textAlign: 'left',
};

function textDocument(options: { locked?: boolean; style?: TextStyle } = {}): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'FR-14');
  const text: TextObject = {
    id: 'text-object',
    type: 'text',
    frame: { xMm: 20, yMm: 30, widthMm: 80, heightMm: 20 },
    zIndex: 0,
    ...(options.locked ? { locked: true } : {}),
    text: plainRichText('text-object-rich', 'Faixa de medição'),
    style: options.style ?? STYLE,
  };
  return { ...base, pages: [{ ...base.pages[0], objects: [text] }] };
}

function textOf(document: CatalogDocument): TextObject {
  const object = document.pages[0].objects.find((entry) => entry.id === 'text-object');
  if (!object || object.type !== 'text') throw new Error('Missing text object');
  return object;
}

function run(document: CatalogDocument, action: unknown) {
  return executeApplicationAction(document, action, { createId: ids() });
}

describe('FR-14 text.setStyle', () => {
  it('changes only the fields in the patch and keeps the text, frame and the other style fields', () => {
    const document = textDocument();
    const result = run(document, {
      type: 'text.setStyle', objectId: 'text-object', expectedStyle: STYLE,
      patch: { fontSizePt: 16, fontWeight: 700 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = textOf(result.document);
    expect(after.style).toEqual({ ...STYLE, fontSizePt: 16, fontWeight: 700 });
    expect(after.text).toEqual(textOf(document).text);
    expect(after.frame).toEqual(textOf(document).frame);
    expect(result.metadata).toEqual({ actionType: 'text.setStyle', affectedIds: ['text-object'], createdIds: [], changed: true });
  });

  it('sets colour from the document palette (any letter case) and alignment', () => {
    const result = run(textDocument(), {
      type: 'text.setStyle', objectId: 'text-object', expectedStyle: STYLE,
      patch: { color: '#0072ce', textAlign: 'center' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(textOf(result.document).style).toMatchObject({ color: '#0072ce', textAlign: 'center' });
  });

  it('Onda 3.5: accepts any #RRGGBB colour, also outside the document palette (the palette is only offered first)', () => {
    const result = run(textDocument(), {
      type: 'text.setStyle', objectId: 'text-object', expectedStyle: STYLE, patch: { color: '#F3DDB8' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(textOf(result.document).style.color).toBe('#F3DDB8');
  });

  it('refuses bold when the document does not declare the bold face of the font', () => {
    const document = textDocument();
    const regularOnly: CatalogDocument = {
      ...document,
      style: { ...document.style, fonts: document.style.fonts.filter((font) => font.weight === 400) },
    };
    const result = run(regularOnly, {
      type: 'text.setStyle', objectId: 'text-object', expectedStyle: STYLE, patch: { fontWeight: 700 },
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
  });

  it('applies nothing when the box changed after the command was prepared (expected style)', () => {
    const document = textDocument();
    const result = run(document, {
      type: 'text.setStyle', objectId: 'text-object',
      expectedStyle: { ...STYLE, fontSizePt: 12 },
      patch: { fontSizePt: 16 },
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });
  });

  it('compares the expected style field by field, not by key order', () => {
    const reordered = { textAlign: 'left', color: '#172033', fontWeight: 400, lineHeight: 1.2, fontSizePt: 10, fontFamily: 'Noto Sans' };
    const result = run(textDocument(), {
      type: 'text.setStyle', objectId: 'text-object', expectedStyle: reordered, patch: { fontSizePt: 8 },
    });
    expect(result.ok).toBe(true);
  });

  it('works on a box whose style only has some fields (the rest comes from the document)', () => {
    const document = textDocument({ style: {} });
    const result = run(document, {
      type: 'text.setStyle', objectId: 'text-object', expectedStyle: {}, patch: { fontWeight: 700 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(textOf(result.document).style).toEqual({ fontWeight: 700 });
  });

  it('reports no change for a patch equal to the current style', () => {
    const result = run(textDocument(), {
      type: 'text.setStyle', objectId: 'text-object', expectedStyle: STYLE, patch: { fontSizePt: 10 },
    });
    expect(result).toMatchObject({ ok: true, metadata: { changed: false, affectedIds: [] } });
  });

  it('refuses locked, missing and non-text targets, and grouped children', () => {
    expect(run(textDocument({ locked: true }), {
      type: 'text.setStyle', objectId: 'text-object', expectedStyle: STYLE, patch: { fontSizePt: 16 },
    })).toMatchObject({ ok: false, error: { code: 'OBJECT_LOCKED' } });
    expect(run(textDocument(), {
      type: 'text.setStyle', objectId: 'missing', expectedStyle: STYLE, patch: { fontSizePt: 16 },
    })).toMatchObject({ ok: false, error: { code: 'OBJECT_NOT_FOUND' } });

    const document = textDocument();
    const withShape: CatalogDocument = { ...document, pages: [{ ...document.pages[0], objects: [
      ...document.pages[0].objects,
      { id: 'shape', type: 'shape', frame: { xMm: 120, yMm: 30, widthMm: 20, heightMm: 20 }, zIndex: 1, shape: 'rectangle', style: { fill: '#003366' } },
    ] }] };
    expect(run(withShape, {
      type: 'text.setStyle', objectId: 'shape', expectedStyle: STYLE, patch: { fontSizePt: 16 },
    })).toMatchObject({ ok: false, error: { code: 'OBJECT_TYPE_MISMATCH' } });

    const grouped: CatalogDocument = { ...document, pages: [{ ...document.pages[0], objects: [{
      id: 'group', type: 'group', frame: { xMm: 20, yMm: 30, widthMm: 80, heightMm: 40 }, zIndex: 0, objects: [
        { ...textOf(document), frame: { xMm: 0, yMm: 0, widthMm: 80, heightMm: 20 } },
        { id: 'line', type: 'line', frame: { xMm: 0, yMm: 30, widthMm: 80, heightMm: 10 }, zIndex: 1, axis: 'horizontal', color: '#003366' },
      ],
    }] }] };
    expect(run(grouped, {
      type: 'text.setStyle', objectId: 'text-object', expectedStyle: STYLE, patch: { fontSizePt: 16 },
    })).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
  });

  it('accepts the simple fields plus line height and letter spacing (Avançado), and never an empty patch', () => {
    const base = { type: 'text.setStyle', objectId: 'text-object', expectedStyle: STYLE };
    expect(ApplicationActionSchema.safeParse({ ...base, patch: { fontSizePt: 12 } }).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({ ...base, patch: {} }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({ ...base, patch: { fontFamily: 'Noto Sans' } }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({ ...base, patch: { lineHeight: 2 } }).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({ ...base, patch: { letterSpacingEm: 0.1 } }).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({ ...base, patch: { letterSpacingEm: 2 } }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({ ...base, patch: { fontWeight: 500 } }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({ ...base, patch: { fontSizePt: 0 } }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({ ...base, patch: { color: 'blue' } }).success).toBe(false);
    expect(run(textDocument(), { ...base, patch: {} })).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
  });

  it('is one history step that Desfazer reverts and Refazer repeats', () => {
    const document = textDocument();
    const session = createDocumentSession(document, { createId: ids() });
    const result = session.execute({
      type: 'text.setStyle', objectId: 'text-object', expectedStyle: STYLE, patch: { fontSizePt: 16, fontWeight: 700, color: '#003366' },
    }, { transactionId: 'style-click-1' });
    expect(result.ok).toBe(true);
    expect(textOf(session.getSnapshot().document).style).toMatchObject({ fontSizePt: 16, fontWeight: 700, color: '#003366' });
    expect(session.undo().ok).toBe(true);
    expect(textOf(session.getSnapshot().document).style).toEqual(STYLE);
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(session.redo().ok).toBe(true);
    expect(textOf(session.getSnapshot().document).style).toMatchObject({ fontSizePt: 16 });
  });
});
