import { CellContentSchema, type CellContent } from '../domain/editorial-model';
import type { TableCellContentInput } from '../application/contracts';
import { projectEditableRichText } from '../application/text-editing';

export type EditableCellType = 'empty' | 'richText' | 'technicalCode' | 'measurement';
export type ReadonlyCellType = 'marker' | 'image';

export interface TableCellDraftIdentity {
  pageId: string;
  objectId: string;
  tableId: string;
  cellId: string;
}

export interface TableCellDraft {
  identity: TableCellDraftIdentity;
  originalContent: CellContent;
  activeType: EditableCellType | ReadonlyCellType;
  richText: string;
  technicalCode: string;
  measurement: {
    valueText: string;
    unit: string;
    qualifier: '' | 'approx' | 'min' | 'max';
  };
  dirty: boolean;
  composing: boolean;
  requiresTypeChangeConfirmation: boolean;
}
export type TableCellDraftValidation =
  | { ok: true; input: TableCellContentInput; allowTypeChange: boolean }
  | { ok: false; message: string; unsupportedRichText?: boolean };

/**
 * Opens a draft for one cell. FR-30: an empty cell opens as "Texto", ready for typing, like a spreadsheet; it is
 * still saved as an empty cell while nothing is typed (see {@link validateTableCellDraft}).
 */
export function createTableCellDraft(identity: TableCellDraftIdentity, content: CellContent): TableCellDraft {
  const projected = content.type === 'richText' ? projectEditableRichText(content.value) : null;
  return {
    identity,
    originalContent: content,
    activeType: content.type === 'empty' ? 'richText' : content.type,
    richText: projected ?? '',
    technicalCode: content.type === 'technicalCode' ? content.value : '',
    measurement: content.type === 'measurement'
      ? { valueText: content.valueText, unit: content.unit, qualifier: content.qualifier ?? '' }
      : { valueText: '', unit: '', qualifier: '' },
    dirty: false,
    composing: false,
    requiresTypeChangeConfirmation: false,
  };
}

export function setTableCellDraftComposition(draft: TableCellDraft, composing: boolean): TableCellDraft {
  return { ...draft, composing };
}

/**
 * FR-22: a draft is "dirty" only while it would really change the cell. Opening a cell, or typing and then going
 * back to the original value, leaves the catalog without unsaved changes.
 */
export function tableCellDraftHasChanges(draft: TableCellDraft): boolean {
  const original = draft.originalContent;
  if (original.type === 'marker' || original.type === 'image') return false;
  switch (draft.activeType) {
    case 'empty':
      return original.type !== 'empty';
    case 'richText': {
      if (original.type === 'empty') return draft.richText !== '';
      if (original.type !== 'richText') return true;
      const projected = projectEditableRichText(original.value);
      return draft.richText !== (projected ?? '');
    }
    case 'technicalCode':
      return original.type !== 'technicalCode' || draft.technicalCode !== original.value;
    case 'measurement':
      return original.type !== 'measurement'
        || draft.measurement.valueText !== original.valueText
        || draft.measurement.unit !== original.unit
        || draft.measurement.qualifier !== (original.qualifier ?? '');
    default:
      return false;
  }
}

function withDirty(draft: TableCellDraft): TableCellDraft {
  return { ...draft, dirty: tableCellDraftHasChanges(draft) };
}

export function changeTableCellDraftType(draft: TableCellDraft, activeType: EditableCellType): TableCellDraft {
  if (draft.originalContent.type === 'marker' || draft.originalContent.type === 'image') return draft;
  if (activeType === draft.activeType) return draft;
  return withDirty({
    ...draft,
    activeType,
    requiresTypeChangeConfirmation:
      draft.originalContent.type !== 'empty' && draft.originalContent.type !== activeType,
  });
}

export function confirmTableCellDraftTypeChange(draft: TableCellDraft): TableCellDraft {
  return { ...draft, requiresTypeChangeConfirmation: false };
}

export function updateTableCellDraft(
  draft: TableCellDraft,
  update: Partial<Pick<TableCellDraft, 'richText' | 'technicalCode'>>
    & { measurement?: Partial<TableCellDraft['measurement']> }
): TableCellDraft {
  return withDirty({
    ...draft,
    ...update,
    measurement: update.measurement ? { ...draft.measurement, ...update.measurement } : draft.measurement,
  });
}

/**
 * FR-30: typing on a selected cell starts the edit and replaces what was there, as in Excel. The typed text goes to
 * the cell's own kind of content (a code stays a code, a measurement keeps its unit); marks, images and text with
 * advanced formatting are never replaced this way.
 */
export function startTableCellDraftByTyping(draft: TableCellDraft, text: string): TableCellDraft {
  const original = draft.originalContent;
  if (original.type === 'marker' || original.type === 'image') return draft;
  if (draft.activeType === 'technicalCode') return updateTableCellDraft(draft, { technicalCode: text });
  if (draft.activeType === 'measurement') return updateTableCellDraft(draft, { measurement: { valueText: text } });
  if (original.type === 'richText' && projectEditableRichText(original.value) === null) return draft;
  return updateTableCellDraft({ ...draft, activeType: 'richText' }, { richText: text });
}

export function clearTableCellDraft(draft: TableCellDraft): TableCellDraft {
  if (draft.originalContent.type === 'marker' || draft.originalContent.type === 'image') return draft;
  return withDirty({
    ...draft,
    activeType: 'empty',
    requiresTypeChangeConfirmation: draft.originalContent.type !== 'empty',
  });
}
export function validateTableCellDraft(draft: TableCellDraft): TableCellDraftValidation {
  if (draft.originalContent.type === 'marker' || draft.originalContent.type === 'image') {
    return { ok: false, message: 'Este conteúdo é somente leitura neste modo.' };
  }
  if (draft.requiresTypeChangeConfirmation) {
    return { ok: false, message: 'Confirme a substituição do conteúdo atual antes de concluir.' };
  }
  if (draft.activeType === 'richText') {
    if (draft.originalContent.type === 'richText' && projectEditableRichText(draft.originalContent.value) === null) {
      return {
        ok: false,
        message: 'Este conteúdo possui formatação avançada e não pode ser editado neste modo.',
        unsupportedRichText: true,
      };
    }
    const plainText = draft.richText.replace(/\r\n?/g, '\n');
    // An empty cell opened as "Texto" and left blank stays an empty cell: nothing changes.
    if (plainText === '' && draft.originalContent.type === 'empty') {
      return { ok: true, input: { type: 'empty' }, allowTypeChange: false };
    }
    return {
      ok: true,
      input: { type: 'richText', plainText },
      allowTypeChange: draft.originalContent.type !== 'richText',
    };
  }
  if (draft.activeType === 'technicalCode') {
    const candidate = { type: 'technicalCode' as const, value: draft.technicalCode };
    if (!CellContentSchema.safeParse(candidate).success) {
      return { ok: false, message: 'O código precisa ser preenchido e não pode conter quebras de linha.' };
    }
    return { ok: true, input: candidate, allowTypeChange: draft.originalContent.type !== 'technicalCode' };
  }
  if (draft.activeType === 'measurement') {
    const candidate = {
      type: 'measurement' as const,
      valueText: draft.measurement.valueText,
      unit: draft.measurement.unit,
      ...(draft.measurement.qualifier ? { qualifier: draft.measurement.qualifier } : {}),
    };
    const parsed = CellContentSchema.safeParse(candidate);
    if (!parsed.success) {
      const valueValid = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(draft.measurement.valueText);
      return {
        ok: false,
        message: valueValid
          ? 'Informe uma unidade válida.'
          : 'Informe um valor válido, como 12.5, -3 ou 1.2e-4.',
      };
    }
    return { ok: true, input: candidate, allowTypeChange: draft.originalContent.type !== 'measurement' };
  }
  return {
    ok: true,
    input: { type: 'empty' },
    allowTypeChange: draft.originalContent.type !== 'empty',
  };
}

export function tableCellDraftRecoveryFields(draft: TableCellDraft) {
  return {
    activeType: draft.activeType,
    richText: draft.richText,
    technicalCode: draft.technicalCode,
    measurement: draft.measurement,
  };
}

/** FR-30: technical symbols offered above the cell editor, in the order the father uses them most. */
export const CELL_TECHNICAL_SYMBOLS = ['±', '°C', '%', '³', '²', 'Ø', '×', 'Δ', 'µ', 'Ω'] as const;

/** Puts `insert` where the caret (or the selected text) is and returns the new text and caret position. */
export function insertIntoCellText(
  text: string,
  selectionStart: number | null | undefined,
  selectionEnd: number | null | undefined,
  insert: string
): { text: string; caret: number } {
  const clamp = (value: number) => Math.min(Math.max(value, 0), text.length);
  const start = clamp(selectionStart ?? text.length);
  const end = Math.max(start, clamp(selectionEnd ?? start));
  return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length };
}
