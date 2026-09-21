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

export function createTableCellDraft(identity: TableCellDraftIdentity, content: CellContent): TableCellDraft {
  const projected = content.type === 'richText' ? projectEditableRichText(content.value) : null;
  return {
    identity,
    originalContent: content,
    activeType: content.type,
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

export function changeTableCellDraftType(draft: TableCellDraft, activeType: EditableCellType): TableCellDraft {
  if (draft.originalContent.type === 'marker' || draft.originalContent.type === 'image') return draft;
  if (activeType === draft.activeType) return draft;
  return {
    ...draft,
    activeType,
    dirty: true,
    requiresTypeChangeConfirmation:
      draft.originalContent.type !== 'empty' && draft.originalContent.type !== activeType,
  };
}

export function confirmTableCellDraftTypeChange(draft: TableCellDraft): TableCellDraft {
  return { ...draft, requiresTypeChangeConfirmation: false };
}

export function updateTableCellDraft(
  draft: TableCellDraft,
  update: Partial<Pick<TableCellDraft, 'richText' | 'technicalCode'>>
    & { measurement?: Partial<TableCellDraft['measurement']> }
): TableCellDraft {
  return {
    ...draft,
    ...update,
    measurement: update.measurement ? { ...draft.measurement, ...update.measurement } : draft.measurement,
    dirty: true,
  };
}

export function clearTableCellDraft(draft: TableCellDraft): TableCellDraft {
  if (draft.originalContent.type === 'marker' || draft.originalContent.type === 'image') return draft;
  return {
    ...draft,
    activeType: 'empty',
    dirty: draft.originalContent.type !== 'empty',
    requiresTypeChangeConfirmation: draft.originalContent.type !== 'empty',
  };
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
    return {
      ok: true,
      input: { type: 'richText', plainText: draft.richText.replace(/\r\n?/g, '\n') },
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
