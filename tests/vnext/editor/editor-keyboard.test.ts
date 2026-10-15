import { afterEach, describe, expect, it } from 'vitest';
import {
  isKeyboardOwningTarget,
  planKeyboardDelete,
  planKeyboardNudge,
  resolveEditorShortcut,
  type EditorKeyContext,
} from '@/vnext/editor/editor-keyboard';
import { describePageObjects, pageHeadline, pageLabel } from '@/vnext/editor/page-summary';
import { mmToU, plainRichText, type EditorialObject, type Page } from '@/vnext/domain';

const selecting: EditorKeyContext = { typingInField: false, mode: 'select', hasSelection: true };

describe('resolveEditorShortcut (FR-19)', () => {
  it('maps Word/PowerPoint keys while an object is selected', () => {
    expect(resolveEditorShortcut({ key: 'Delete' }, selecting)).toEqual({ type: 'delete' });
    expect(resolveEditorShortcut({ key: 'Backspace' }, selecting)).toEqual({ type: 'delete' });
    expect(resolveEditorShortcut({ key: 'ArrowRight' }, selecting)).toEqual({ type: 'nudge', dxMm: 1, dyMm: 0 });
    expect(resolveEditorShortcut({ key: 'ArrowLeft' }, selecting)).toEqual({ type: 'nudge', dxMm: -1, dyMm: 0 });
    expect(resolveEditorShortcut({ key: 'ArrowUp' }, selecting)).toEqual({ type: 'nudge', dxMm: 0, dyMm: -1 });
    expect(resolveEditorShortcut({ key: 'ArrowDown', shiftKey: true }, selecting)).toEqual({ type: 'nudge', dxMm: 0, dyMm: 5 });
    expect(resolveEditorShortcut({ key: 'd', ctrlKey: true }, selecting)).toEqual({ type: 'duplicate' });
    expect(resolveEditorShortcut({ key: 'D', metaKey: true }, selecting)).toEqual({ type: 'duplicate' });
  });

  it('always maps Ctrl+S (and Cmd+S) to save, even while typing', () => {
    const typing: EditorKeyContext = { typingInField: true, mode: 'text-edit', hasSelection: false };
    expect(resolveEditorShortcut({ key: 's', ctrlKey: true }, typing)).toEqual({ type: 'save' });
    expect(resolveEditorShortcut({ key: 'S', ctrlKey: true, shiftKey: true }, typing)).toEqual({ type: 'save' });
    expect(resolveEditorShortcut({ key: 's', metaKey: true }, selecting)).toEqual({ type: 'save' });
    expect(resolveEditorShortcut({ key: 's', ctrlKey: true, altKey: true }, selecting)).toBeNull();
    expect(resolveEditorShortcut({ key: 's' }, selecting)).toBeNull();
  });

  it('never acts on objects while typing, editing text or a table, or with nothing selected', () => {
    for (const context of [
      { ...selecting, typingInField: true },
      { ...selecting, mode: 'text-edit' as const },
      { ...selecting, mode: 'table-grid' as const },
      { ...selecting, mode: 'cell-edit' as const },
      { ...selecting, hasSelection: false },
      { ...selecting, composing: true },
    ]) {
      expect(resolveEditorShortcut({ key: 'Delete' }, context)).toBeNull();
      expect(resolveEditorShortcut({ key: 'ArrowLeft' }, context)).toBeNull();
      expect(resolveEditorShortcut({ key: 'd', ctrlKey: true }, context)).toBeNull();
    }
    expect(resolveEditorShortcut({ key: 'Delete', isComposing: true }, selecting)).toBeNull();
    expect(resolveEditorShortcut({ key: 'ArrowLeft', altKey: true }, selecting)).toBeNull();
    expect(resolveEditorShortcut({ key: 'ArrowLeft', ctrlKey: true }, selecting)).toBeNull();
    expect(resolveEditorShortcut({ key: 'a' }, selecting)).toBeNull();
  });
});

describe('isKeyboardOwningTarget', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('recognises fields, menus and dialogs that use Delete and the arrows themselves', () => {
    document.body.innerHTML = `
      <input id="text" type="text"><input id="number" type="number"><input id="range" type="range">
      <input id="check" type="checkbox"><button id="button">Ok</button><textarea id="area"></textarea>
      <select id="select"><option>a</option></select><div id="editable" contenteditable="true"></div>
      <div role="menu"><button id="menuitem" role="menuitem">Duplicar</button></div>
      <div role="alertdialog"><button id="dialog-button">Cancelar</button></div>
      <div id="plain" tabindex="-1"></div>`;
    const owns = (id: string) => isKeyboardOwningTarget(document.getElementById(id));
    expect(owns('text')).toBe(true);
    expect(owns('number')).toBe(true);
    expect(owns('range')).toBe(true);
    expect(owns('area')).toBe(true);
    expect(owns('select')).toBe(true);
    expect(owns('editable')).toBe(true);
    expect(owns('menuitem')).toBe(true);
    expect(owns('dialog-button')).toBe(true);
    expect(owns('check')).toBe(false);
    expect(owns('button')).toBe(false);
    expect(owns('plain')).toBe(false);
    expect(isKeyboardOwningTarget(null)).toBe(false);
    expect(isKeyboardOwningTarget(window)).toBe(false);
  });
});

function shape(id: string, xMm: number, locked = false): EditorialObject {
  return {
    id, type: 'shape', frame: { xMm, yMm: 20, widthMm: 10, heightMm: 10 }, zIndex: 0, shape: 'rectangle', style: {},
    ...(locked ? { locked: true } : {}),
  };
}

function text(id: string, content: string, yMm: number): EditorialObject {
  return {
    id, type: 'text', frame: { xMm: 10, yMm, widthMm: 50, heightMm: 10 }, zIndex: 0, text: plainRichText(id, content),
    style: { fontFamily: 'Noto Sans', fontSizePt: 10, lineHeight: 1.2, fontWeight: 400, color: '#172033', textAlign: 'left' },
  };
}

const page = (objects: EditorialObject[]): Page => ({ id: 'page-a', widthMm: 210, heightMm: 297, objects });

describe('keyboard action plans', () => {
  it('moves every selected object by whole millimetres, in canonical units', () => {
    const plan = planKeyboardNudge(page([shape('a', 12.5), shape('b', 40)]), ['a', 'b'], -5, 1);
    expect(plan).toEqual({
      ok: true,
      actions: [
        { type: 'object.move', objectId: 'a', xU: mmToU(7.5), yU: mmToU(21) },
        { type: 'object.move', objectId: 'b', xU: mmToU(35), yU: mmToU(21) },
      ],
    });
  });

  it('deletes every selected object and refuses locked or missing ones', () => {
    expect(planKeyboardDelete(page([shape('a', 1), shape('b', 2)]), ['b'])).toEqual({ ok: true, actions: [{ type: 'object.delete', objectId: 'b' }] });
    expect(planKeyboardDelete(page([shape('a', 1, true)]), ['a'])).toEqual({ ok: false, reason: 'LOCKED' });
    expect(planKeyboardNudge(page([shape('a', 1, true)]), ['a'], 1, 0)).toEqual({ ok: false, reason: 'LOCKED' });
    expect(planKeyboardDelete(page([shape('a', 1)]), ['zz'])).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(planKeyboardDelete(page([shape('a', 1)]), [])).toEqual({ ok: false, reason: 'EMPTY' });
  });
});

describe('page summary (FR-11 confirmation text)', () => {
  it('describes what is on a page in plain Portuguese', () => {
    expect(pageLabel(0)).toBe('Página 1');
    expect(describePageObjects(page([]))).toBe('Esta página está vazia.');
    expect(describePageObjects(page([shape('a', 1)]))).toBe('Ela tem 1 objeto: 1 forma.');
    expect(describePageObjects(page([text('t1', 'A', 10), text('t2', 'B', 20), shape('s', 1), text('t3', 'C', 30)])))
      .toBe('Ela tem 4 objetos: 3 textos e 1 forma.');
  });

  it('uses the top-most text to help recognise the page', () => {
    const p = page([text('low', 'Rodapé', 280), text('top', 'Especificações técnicas', 15)]);
    expect(pageHeadline(p)).toBe('Especificações técnicas');
    expect(pageHeadline(page([text('long', 'x'.repeat(60), 10)]), 20)).toBe(`${'x'.repeat(19)}…`);
    expect(pageHeadline(page([shape('a', 1)]))).toBe('');
  });
});
