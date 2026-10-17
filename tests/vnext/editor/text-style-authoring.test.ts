import { describe, expect, it } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import { plainRichText, type CatalogDocument, type TextObject } from '@/vnext/domain';
import {
  TEXT_KINDS,
  applyTextStyle,
  boldAvailable,
  effectiveTextStyle,
  textColorOptions,
  textKindPatch,
  textStyleAction,
} from '@/vnext/editor/text-style-authoring';

function ids(prefix = 'generated') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function textDocument(style: TextObject['style'] = {}, locked = false): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'FR-14');
  const text: TextObject = {
    id: 'text', type: 'text', frame: { xMm: 20, yMm: 30, widthMm: 80, heightMm: 20 }, zIndex: 0,
    ...(locked ? { locked: true } : {}), text: plainRichText('text-rich', 'TA-25N'), style,
  };
  return { ...base, pages: [{ ...base.pages[0], objects: [text] }] };
}

function textOf(document: CatalogDocument): TextObject {
  const object = document.pages[0].objects[0];
  if (object.type !== 'text') throw new Error('Missing text');
  return object;
}

describe('FR-14 text kinds and choices', () => {
  it('offers Título 16, Subtítulo 12, Corpo 10 and Nota 8 pt, the two first in bold', () => {
    expect(TEXT_KINDS.map((kind) => [kind.label, kind.fontSizePt, kind.fontWeight])).toEqual([
      ['Título', 16, 700], ['Subtítulo', 12, 700], ['Corpo', 10, 400], ['Nota', 8, 400],
    ]);
  });

  it('shows the effective style, filling in the document defaults', () => {
    const document = textDocument();
    expect(effectiveTextStyle(document.style, {})).toEqual({
      fontSizePt: 10, fontWeight: 400, color: '#172033', textAlign: 'left', kind: 'body',
    });
    expect(effectiveTextStyle(document.style, { fontSizePt: 16, fontWeight: 700, color: '#0072ce', textAlign: 'right' }))
      .toEqual({ fontSizePt: 16, fontWeight: 700, color: '#0072CE', textAlign: 'right', kind: 'title' });
    expect(effectiveTextStyle(document.style, { fontSizePt: 14 }).kind).toBeUndefined();
  });

  it('names the palette colours in plain Portuguese', () => {
    const document = textDocument();
    expect(textColorOptions(document.style)).toEqual([
      { value: '#003366', label: 'Azul-marinho' },
      { value: '#0072CE', label: 'Azul' },
      { value: '#172033', label: 'Preto' },
      { value: '#FFFFFF', label: 'Branco' },
    ]);
    expect(textColorOptions({ ...document.style, palette: ['#003366', '#003f78', '#123456'] }).map((option) => option.label))
      .toEqual(['Azul-marinho', 'Cor 2', 'Cor 3']);
  });

  it('keeps titles regular when the document has no bold face', () => {
    const document = textDocument();
    const regularOnly = { ...document.style, fonts: document.style.fonts.filter((font) => font.weight === 400) };
    expect(boldAvailable(document.style, {})).toBe(true);
    expect(boldAvailable(regularOnly, {})).toBe(false);
    expect(textKindPatch(document.style, {}, 'title')).toEqual({ fontSizePt: 16, fontWeight: 700 });
    expect(textKindPatch(regularOnly, {}, 'title')).toEqual({ fontSizePt: 16, fontWeight: 400 });
    expect(textKindPatch(document.style, {}, 'note')).toEqual({ fontSizePt: 8, fontWeight: 400 });
  });
});

describe('FR-14 applyTextStyle', () => {
  it('prepares the action from the current style of the box', () => {
    const document = textDocument({ fontSizePt: 10 });
    expect(textStyleAction(textOf(document), { textAlign: 'center' })).toEqual({
      type: 'text.setStyle', objectId: 'text', expectedStyle: { fontSizePt: 10 }, patch: { textAlign: 'center' },
    });
  });

  it('turns a box into a title with one Desfazer step', () => {
    const document = textDocument();
    const session = createDocumentSession(document, { createId: ids() });
    expect(applyTextStyle(session, 'text', textKindPatch(document.style, {}, 'title'), 'click-1')).toEqual({ ok: true, message: '' });
    expect(textOf(session.getSnapshot().document).style).toEqual({ fontSizePt: 16, fontWeight: 700 });
    expect(applyTextStyle(session, 'text', { color: '#003366' }, 'click-2').ok).toBe(true);
    session.undo();
    expect(textOf(session.getSnapshot().document).style).toEqual({ fontSizePt: 16, fontWeight: 700 });
    session.undo();
    expect(textOf(session.getSnapshot().document).style).toEqual({});
  });

  it('refuses a choice made from a style that is no longer on the box', () => {
    const document = textDocument({ fontSizePt: 10, fontWeight: 700 });
    const session = createDocumentSession(document, { createId: ids() });
    const shown = textOf(document).style;
    // Someone else turned bold off after the screen showed it; "Negrito" (off) must not run on the new style.
    expect(applyTextStyle(session, 'text', { fontWeight: 400 }, 'other', shown).ok).toBe(true);
    expect(applyTextStyle(session, 'text', { fontWeight: 400 }, 'late', shown))
      .toEqual({ ok: false, message: 'O texto mudou enquanto você escolhia. Tente de novo.' });
    expect(textOf(session.getSnapshot().document).style).toEqual({ fontSizePt: 10, fontWeight: 400 });
    session.undo();
    expect(textOf(session.getSnapshot().document).style).toEqual({ fontSizePt: 10, fontWeight: 700 });
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('explains in plain words when the change cannot be made', () => {
    const locked = createDocumentSession(textDocument({}, true), { createId: ids() });
    expect(applyTextStyle(locked, 'text', { fontWeight: 700 }, 'x'))
      .toEqual({ ok: false, message: 'A caixa de texto está bloqueada. Desbloqueie para mudar o estilo.' });
    const session = createDocumentSession(textDocument(), { createId: ids() });
    expect(applyTextStyle(session, 'missing', { fontWeight: 700 }, 'x'))
      .toEqual({ ok: false, message: 'Selecione uma caixa de texto para mudar o estilo.' });
    expect(applyTextStyle(session, 'text', { color: '#FF0000' }, 'x'))
      .toEqual({ ok: false, message: 'Não foi possível mudar o estilo do texto.' });
  });
});
