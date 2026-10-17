import { afterEach, describe, expect, it } from 'vitest';
import {
  isCanvasKeyboardTarget,
  isKeyboardOwningTarget,
  planKeyboardDelete,
  planKeyboardNudge,
  resolveCellEditorKey,
  resolveEditorShortcut,
  resolveGridTypingKey,
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

describe('isCanvasKeyboardTarget', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('accepts only an object on the page, never buttons, fields, panels or the page body', () => {
    document.body.innerHTML = `
      <div data-vnext-page-stage="">
        <div id="object" tabindex="-1" data-editor-object-id="shape-a"><span id="inside"></span></div>
        <div data-text-edit-session=""><textarea id="textarea"></textarea><button id="stage-button">Concluir</button></div>
      </div>
      <nav><button id="page-button">Página 2</button></nav>
      <aside><input id="field" type="text"><div id="panel" tabindex="-1"></div></aside>`;
    const canvas = (id: string) => isCanvasKeyboardTarget(document.getElementById(id));
    expect(canvas('object')).toBe(true);
    expect(canvas('inside')).toBe(true);
    expect(canvas('textarea')).toBe(false);
    expect(canvas('stage-button')).toBe(false);
    expect(canvas('page-button')).toBe(false);
    expect(canvas('field')).toBe(false);
    expect(canvas('panel')).toBe(false);
    expect(isCanvasKeyboardTarget(document.body)).toBe(false);
    expect(isCanvasKeyboardTarget(window)).toBe(false);
    expect(isCanvasKeyboardTarget(null)).toBe(false);
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

describe('resolveGridTypingKey (FR-30: typing on a selected cell)', () => {
  it('starts the edit with the typed character, accents and symbols included', () => {
    for (const key of ['a', 'Z', '7', 'é', 'ç', '±', ' ', ',']) {
      expect(resolveGridTypingKey({ key })).toEqual({ kind: 'character', text: key });
    }
    expect(resolveGridTypingKey({ key: 'A', shiftKey: true })).toEqual({ kind: 'character', text: 'A' });
  });

  it('accepts AltGr symbols (Ctrl+Alt on Windows) but not Ctrl, Alt or Cmd shortcuts', () => {
    expect(resolveGridTypingKey({ key: '°', ctrlKey: true, altKey: true })).toEqual({ kind: 'character', text: '°' });
    expect(resolveGridTypingKey({ key: '/', ctrlKey: true, altKey: true })).toEqual({ kind: 'character', text: '/' });
    expect(resolveGridTypingKey({ key: 'z', ctrlKey: true, altKey: true })).toBeNull();
    expect(resolveGridTypingKey({ key: 'c', ctrlKey: true })).toBeNull();
    expect(resolveGridTypingKey({ key: 'v', metaKey: true })).toBeNull();
    expect(resolveGridTypingKey({ key: 'f', altKey: true })).toBeNull();
  });

  it('leaves a dead key (accent) to the browser and ignores named keys and composition', () => {
    expect(resolveGridTypingKey({ key: 'Dead' })).toEqual({ kind: 'dead' });
    for (const key of ['Enter', 'Tab', 'F2', 'Escape', 'ArrowDown', 'Delete', 'Backspace', 'Shift', 'Process']) {
      expect(resolveGridTypingKey({ key })).toBeNull();
    }
    expect(resolveGridTypingKey({ key: 'a', isComposing: true })).toBeNull();
  });
});

describe('resolveCellEditorKey (FR-30: keys inside the cell editor)', () => {
  it('Enter saves and goes down, Shift+Enter up, Tab right, Shift+Tab left', () => {
    expect(resolveCellEditorKey({ key: 'Enter' })).toEqual({ type: 'commit', move: 'down' });
    expect(resolveCellEditorKey({ key: 'Enter', shiftKey: true })).toEqual({ type: 'commit', move: 'up' });
    expect(resolveCellEditorKey({ key: 'Tab' })).toEqual({ type: 'commit', move: 'right' });
    expect(resolveCellEditorKey({ key: 'Tab', shiftKey: true })).toEqual({ type: 'commit', move: 'left' });
  });

  it('Alt+Enter breaks the line and Esc cancels', () => {
    expect(resolveCellEditorKey({ key: 'Enter', altKey: true })).toEqual({ type: 'newline' });
    expect(resolveCellEditorKey({ key: 'Escape' })).toEqual({ type: 'cancel' });
  });

  it('keeps Ctrl+Enter for the editor (save in place), ordinary keys for the text and waits for the IME', () => {
    expect(resolveCellEditorKey({ key: 'Enter', ctrlKey: true })).toBeNull();
    expect(resolveCellEditorKey({ key: 'Enter', metaKey: true })).toBeNull();
    expect(resolveCellEditorKey({ key: 'a' })).toBeNull();
    expect(resolveCellEditorKey({ key: 'ArrowLeft' })).toBeNull();
    expect(resolveCellEditorKey({ key: 'Backspace' })).toBeNull();
    expect(resolveCellEditorKey({ key: 'Enter', isComposing: true })).toBeNull();
    expect(resolveCellEditorKey({ key: 'Enter' }, { composing: true })).toBeNull();
    expect(resolveCellEditorKey({ key: 'Escape' }, { composing: true })).toBeNull();
  });
});
