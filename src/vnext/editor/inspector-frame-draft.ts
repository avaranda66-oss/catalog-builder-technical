import { decimalDraftMatches, formatDecimalPtBr, parseDecimalPtBr } from './decimal-ptbr';

/** Position/size fields of the object panel, always in millimetres. */
export type InspectorFrameField = 'x' | 'y' | 'width' | 'height';
export type InspectorFrameDraft = Record<InspectorFrameField, string>;
export type InspectorFrame = { readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number };

export const INSPECTOR_FRAME_FIELDS: readonly InspectorFrameField[] = ['x', 'y', 'width', 'height'];

/** Short text shown right next to the field. */
export const INSPECTOR_INVALID_NUMBER_MESSAGE = 'Use um número, como 12,5.';
export const INSPECTOR_NON_POSITIVE_SIZE_MESSAGE = 'Precisa ser maior que zero.';
/** Smallest size the domain accepts (1 U = 0,0001 mm). */
const MIN_SIZE_MM = 0.0001;

export function inspectorFrameValue(frame: InspectorFrame, field: InspectorFrameField): number {
  switch (field) {
    case 'x': return frame.xMm;
    case 'y': return frame.yMm;
    case 'width': return frame.widthMm;
    case 'height': return frame.heightMm;
  }
}

/** Canonical, pt-BR formatted text for every field ("88,5"). */
export function inspectorDraftFromFrame(frame: InspectorFrame): InspectorFrameDraft {
  return {
    x: formatDecimalPtBr(frame.xMm),
    y: formatDecimalPtBr(frame.yMm),
    width: formatDecimalPtBr(frame.widthMm),
    height: formatDecimalPtBr(frame.heightMm),
  };
}

/**
 * A field is pending only when its text does not mean the canonical number.
 * "88.0", "88,0" and "88" all mean 88 and are never pending.
 */
export function inspectorFieldIsPending(draft: InspectorFrameDraft, frame: InspectorFrame, field: InspectorFrameField): boolean {
  return !decimalDraftMatches(draft[field], inspectorFrameValue(frame, field));
}

export function inspectorDraftIsDirty(draft: InspectorFrameDraft, frame: InspectorFrame): boolean {
  return INSPECTOR_FRAME_FIELDS.some((field) => inspectorFieldIsPending(draft, frame, field));
}

/** Same position and size. Used to drop a field hint once Desfazer/Refazer puts another value in the field. */
export function sameInspectorFrame(a: InspectorFrame, b: InspectorFrame): boolean {
  return INSPECTOR_FRAME_FIELDS.every((field) => inspectorFrameValue(a, field) === inspectorFrameValue(b, field));
}

export type InspectorFieldResolution =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'changed'; readonly valueMm: number };

/** Decides what a typed field means against the live frame. Never throws. */
export function resolveInspectorField(
  draft: InspectorFrameDraft,
  frame: InspectorFrame,
  field: InspectorFrameField,
  options: { readonly sizeLocked?: boolean } = {}
): InspectorFieldResolution {
  if (!inspectorFieldIsPending(draft, frame, field)) return { kind: 'unchanged' };
  if (options.sizeLocked && (field === 'width' || field === 'height')) return { kind: 'unchanged' };
  const parsed = parseDecimalPtBr(draft[field]);
  if (!parsed.ok) return { kind: 'invalid', message: INSPECTOR_INVALID_NUMBER_MESSAGE };
  if ((field === 'width' || field === 'height') && parsed.value < MIN_SIZE_MM) {
    return { kind: 'invalid', message: INSPECTOR_NON_POSITIVE_SIZE_MESSAGE };
  }
  return { kind: 'changed', valueMm: parsed.value };
}

export type InspectorFieldError = { readonly field: InspectorFrameField; readonly message: string };

/** Full sentence for the status line: names the field and says nothing was changed. */
export function inspectorErrorStatus(error: InspectorFieldError): string {
  const detail = error.message === INSPECTOR_NON_POSITIVE_SIZE_MESSAGE
    ? 'a largura e a altura precisam ser maiores que zero'
    : 'digite um número em milímetros, como 12,5';
  return `${inspectorFieldLabel(error.field)}: ${detail}. O valor anterior foi mantido.`;
}

/** Said when the field leaves the screen (another page opens) right after its typed value was put back. */
export function inspectorDiscardedNotice(error: InspectorFieldError): string {
  return `O valor digitado em ${inspectorFieldLabel(error.field)} não era válido e não foi usado; o valor anterior foi mantido.`;
}

export type InspectorDraftPlan = {
  /** Fields whose new value is valid and differs from the live frame. */
  readonly changes: Partial<Record<InspectorFrameField, number>>;
  /** Fields whose text could not be used; they go back to the live value. */
  readonly errors: readonly InspectorFieldError[];
};

/** Resolves the requested fields at once so one click away applies one coherent change. */
export function planInspectorDraft(
  draft: InspectorFrameDraft,
  frame: InspectorFrame,
  fields: readonly InspectorFrameField[] = INSPECTOR_FRAME_FIELDS,
  options: { readonly sizeLocked?: boolean } = {}
): InspectorDraftPlan {
  const changes: Partial<Record<InspectorFrameField, number>> = {};
  const errors: InspectorFieldError[] = [];
  for (const field of fields) {
    const resolution = resolveInspectorField(draft, frame, field, options);
    if (resolution.kind === 'changed') changes[field] = resolution.valueMm;
    else if (resolution.kind === 'invalid') errors.push({ field, message: resolution.message });
  }
  return { changes, errors };
}

const FIELD_LABELS: Record<InspectorFrameField, string> = { x: 'X', y: 'Y', width: 'Largura', height: 'Altura' };

export function inspectorFieldLabel(field: InspectorFrameField): string {
  return FIELD_LABELS[field];
}
