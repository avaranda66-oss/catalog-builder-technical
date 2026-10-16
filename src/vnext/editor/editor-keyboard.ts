import type { ApplicationAction } from '../application';
import { mmToU, type EditorialObject, type Page } from '../domain';

/**
 * Word/PowerPoint-style keyboard shortcuts for the page editor.
 *
 * Pure decision module: it only says which command a key press means and
 * which existing typed actions carry it out, so every shortcut is one
 * undoable step. Object shortcuts never fire while the person is typing in a
 * field, a menu or a dialog.
 */

export const NUDGE_STEP_MM = 1;
export const NUDGE_LARGE_STEP_MM = 5;

export type EditorShortcut =
  | { readonly type: 'save' }
  | { readonly type: 'delete' }
  | { readonly type: 'duplicate' }
  | { readonly type: 'nudge'; readonly dxMm: number; readonly dyMm: number };

export type EditorKeyInput = {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly isComposing?: boolean;
};

export type EditorKeyContext = {
  /** Focus is in a text field, select, slider, menu or dialog. */
  readonly typingInField: boolean;
  /** Only the plain object-selection mode accepts object shortcuts. */
  readonly mode: 'select' | 'text-edit' | 'table-grid' | 'cell-edit';
  readonly hasSelection: boolean;
  /** An IME composition is active somewhere in the editor. */
  readonly composing?: boolean;
};

export function resolveEditorShortcut(input: EditorKeyInput, context: EditorKeyContext): EditorShortcut | null {
  if (input.isComposing || context.composing) return null;
  const primary = Boolean(input.ctrlKey || input.metaKey);
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  // Ctrl+S always means "save the catalog", never the browser's "Save page as".
  if (primary && !input.altKey && key === 's') return { type: 'save' };
  if (context.typingInField || context.mode !== 'select' || !context.hasSelection) return null;
  if (primary && !input.altKey && !input.shiftKey && key === 'd') return { type: 'duplicate' };
  if (primary || input.altKey) return null;
  if (key === 'Delete' || key === 'Backspace') return { type: 'delete' };
  const step = input.shiftKey ? NUDGE_LARGE_STEP_MM : NUDGE_STEP_MM;
  switch (key) {
    case 'ArrowLeft': return { type: 'nudge', dxMm: -step, dyMm: 0 };
    case 'ArrowRight': return { type: 'nudge', dxMm: step, dyMm: 0 };
    case 'ArrowUp': return { type: 'nudge', dxMm: 0, dyMm: -step };
    case 'ArrowDown': return { type: 'nudge', dxMm: 0, dyMm: step };
    default: return null;
  }
}

const NON_TYPING_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'color']);
const KEYBOARD_OWNING_ROLES = [
  'menu', 'menubar', 'menuitem', 'listbox', 'option', 'dialog', 'alertdialog', 'slider', 'spinbutton',
  'grid', 'tablist', 'radiogroup', 'combobox', 'textbox', 'tree',
];
const KEYBOARD_OWNER_SELECTOR = KEYBOARD_OWNING_ROLES.map((role) => `[role="${role}"]`)
  .concat('[data-keyboard-isolated]')
  .join(', ');

/**
 * True when the focused element consumes Delete/arrows itself: text inputs,
 * text areas, selects, editable content, sliders, menus and dialogs.
 */
export function isKeyboardOwningTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const element = target as HTMLElement;
  const tag = element.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TYPING_INPUT_TYPES.has(((element as HTMLInputElement).type || 'text').toLowerCase());
  if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') return true;
  return element.closest(KEYBOARD_OWNER_SELECTOR) !== null;
}

const CANVAS_SELECTOR = '[data-vnext-page-stage], [data-editor-object-id]';

/**
 * True only when focus is on the page being edited (an object on it, which
 * clicking focuses). Delete, the arrows and Ctrl+D act on the selection only
 * there: never from a button, the page list, a side panel or the bare page
 * body, so a stray Backspace after typing a value never deletes an object.
 */
export function isCanvasKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const element = target as HTMLElement;
  if (isKeyboardOwningTarget(element) || element.closest('button, a[href], summary') !== null) return false;
  return element.closest(CANVAS_SELECTOR) !== null;
}

export type KeyboardObjectPlan =
  | { readonly ok: true; readonly actions: readonly ApplicationAction[] }
  | { readonly ok: false; readonly reason: 'EMPTY' | 'NOT_FOUND' | 'LOCKED' };

function selectedTopLevelObjects(page: Page, objectIds: readonly string[]): EditorialObject[] | null {
  const objects: EditorialObject[] = [];
  for (const objectId of objectIds) {
    const object = page.objects.find((entry) => entry.id === objectId);
    if (!object) return null;
    objects.push(object);
  }
  return objects;
}

function isLocked(object: EditorialObject): boolean {
  return object.locked === true || (object.type === 'group' && object.objects.some((child) => child.locked === true));
}

function plan(
  page: Page,
  objectIds: readonly string[],
  toAction: (object: EditorialObject) => ApplicationAction
): KeyboardObjectPlan {
  if (objectIds.length === 0) return { ok: false, reason: 'EMPTY' };
  const objects = selectedTopLevelObjects(page, objectIds);
  if (!objects) return { ok: false, reason: 'NOT_FOUND' };
  if (objects.some(isLocked)) return { ok: false, reason: 'LOCKED' };
  return { ok: true, actions: objects.map(toAction) };
}

/** One object.move per selected object; the caller runs them under one transaction. */
export function planKeyboardNudge(page: Page, objectIds: readonly string[], dxMm: number, dyMm: number): KeyboardObjectPlan {
  const dxU = mmToU(dxMm);
  const dyU = mmToU(dyMm);
  return plan(page, objectIds, (object) => ({
    type: 'object.move',
    objectId: object.id,
    xU: mmToU(object.frame.xMm) + dxU,
    yU: mmToU(object.frame.yMm) + dyU,
  }));
}

/** One object.delete per selected object; the caller runs them under one transaction. */
export function planKeyboardDelete(page: Page, objectIds: readonly string[]): KeyboardObjectPlan {
  return plan(page, objectIds, (object) => ({ type: 'object.delete', objectId: object.id }));
}

/**
 * FR-30 — spreadsheet keys of the table grid and of the cell editor.
 *
 * On a selected cell (grid focused, nothing being edited) a printable key starts the edit and replaces the cell
 * content with that character, like Excel. Ctrl/Cmd shortcuts never type; AltGr (reported as Ctrl+Alt on Windows,
 * e.g. "°" or "/" on the Brazilian ABNT2 keyboard) does. A dead key (the accent of "é" or "ã" on that keyboard)
 * opens an empty editor and lets the browser finish the accented letter there.
 */
export type GridTypingKey =
  | { readonly kind: 'character'; readonly text: string }
  | { readonly kind: 'dead' };

export function resolveGridTypingKey(input: EditorKeyInput): GridTypingKey | null {
  if (input.isComposing) return null;
  const altGr = Boolean(input.ctrlKey && input.altKey && !input.metaKey);
  if (!altGr && (input.ctrlKey || input.metaKey || input.altKey)) return null;
  if (input.key === 'Dead') return { kind: 'dead' };
  // One visible character (a letter with accent, a digit, a symbol or a space); never "Enter", "Tab", "F2"…
  if ([...input.key].length !== 1) return null;
  if (/\p{Cc}/u.test(input.key)) return null;
  // Ctrl+Alt+letter or digit is a shortcut, not an AltGr symbol.
  if (altGr && /^[a-z0-9]$/i.test(input.key)) return null;
  return { kind: 'character', text: input.key };
}

/** Where the selection goes after the cell editor saves. */
export type CellEditorMove = 'down' | 'up' | 'right' | 'left';

export type CellEditorKeyCommand =
  /** Save the cell and move: Enter (down), Shift+Enter (up), Tab (right), Shift+Tab (left). */
  | { readonly type: 'commit'; readonly move: CellEditorMove }
  /** Alt+Enter: a line break inside the cell. */
  | { readonly type: 'newline' }
  /** Esc: forget only what was typed in this edit. */
  | { readonly type: 'cancel' };

export function resolveCellEditorKey(input: EditorKeyInput, context: { readonly composing?: boolean } = {}): CellEditorKeyCommand | null {
  if (input.isComposing || context.composing) return null;
  const primary = Boolean(input.ctrlKey || input.metaKey);
  if (input.key === 'Escape' && !primary && !input.altKey) return { type: 'cancel' };
  if (input.key === 'Enter') {
    if (input.altKey && !primary) return { type: 'newline' };
    // Ctrl+Enter keeps its old meaning (save without moving), handled by the editor.
    if (primary || input.altKey) return null;
    return { type: 'commit', move: input.shiftKey ? 'up' : 'down' };
  }
  if (input.key === 'Tab' && !primary && !input.altKey) return { type: 'commit', move: input.shiftKey ? 'left' : 'right' };
  return null;
}
