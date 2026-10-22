import type { CatalogDocument, DocumentStyle, TextObject, TextStyle } from '../domain';
import type { ApplicationAction, DocumentSession } from '../application';
import type { TextStylePatch } from '../application/contracts';
import { paletteOptions } from './table-style-authoring';

/**
 * FR-14: the "Básico" choices for a text box. Each choice becomes one `text.setStyle`, prepared from the
 * box's current style, so a change made meanwhile is refused and one Desfazer undoes one click.
 */
export type TextKindId = 'title' | 'subtitle' | 'body' | 'note';

export interface TextKind {
  id: TextKindId;
  label: string;
  fontSizePt: number;
  fontWeight: 400 | 700;
}

export const TEXT_KINDS: readonly TextKind[] = [
  { id: 'title', label: 'Título', fontSizePt: 16, fontWeight: 700 },
  { id: 'subtitle', label: 'Subtítulo', fontSizePt: 12, fontWeight: 700 },
  { id: 'body', label: 'Corpo', fontSizePt: 10, fontWeight: 400 },
  { id: 'note', label: 'Nota', fontSizePt: 8, fontWeight: 400 },
];

export type TextAlign = NonNullable<TextStyle['textAlign']>;

export const TEXT_ALIGNMENTS: readonly { value: TextAlign; label: string }[] = [
  { value: 'left', label: 'Esquerda' },
  { value: 'center', label: 'Centro' },
  { value: 'right', label: 'Direita' },
];

/** Plain names for the house colours; any other palette colour is "Cor N" (its position). */
const COLOR_NAMES: Readonly<Record<string, string>> = {
  '#003366': 'Azul-marinho',
  '#003F78': 'Azul-marinho',
  '#0072CE': 'Azul',
  '#172033': 'Preto',
  '#000000': 'Preto',
  '#FFFFFF': 'Branco',
};

export interface TextColorOption {
  value: string;
  label: string;
}

export function textColorOptions(style: DocumentStyle): readonly TextColorOption[] {
  const used = new Set<string>();
  return paletteOptions(style).map((value, index) => {
    const named = COLOR_NAMES[value];
    const label = named && !used.has(named) ? named : `Cor ${index + 1}`;
    used.add(label);
    return { value, label };
  });
}

/** What the box shows now, with the document defaults filled in (the same fallbacks as the renderer). */
export interface EffectiveTextStyle {
  fontSizePt: number | undefined;
  fontWeight: 400 | 700;
  color: string;
  textAlign: TextAlign;
  kind: TextKindId | undefined;
}

export function effectiveTextStyle(documentStyle: DocumentStyle, style: TextStyle): EffectiveTextStyle {
  const defaults = documentStyle.defaultText;
  const fontSizePt = style.fontSizePt ?? defaults.fontSizePt;
  return {
    fontSizePt,
    fontWeight: style.fontWeight ?? defaults.fontWeight ?? 400,
    color: (style.color ?? defaults.color ?? '#172B3A').toUpperCase(),
    textAlign: style.textAlign ?? defaults.textAlign ?? 'left',
    kind: TEXT_KINDS.find((kind) => kind.fontSizePt === fontSizePt)?.id,
  };
}

/** Bold needs the 700 face of the box's font in the document; otherwise the PDF could not be made. */
export function boldAvailable(documentStyle: DocumentStyle, style: TextStyle): boolean {
  const family = style.fontFamily ?? documentStyle.defaultText.fontFamily;
  return documentStyle.fonts.some((font) => font.family === family && font.weight === 700 && font.style === 'normal');
}

export function textKindPatch(documentStyle: DocumentStyle, style: TextStyle, id: TextKindId): TextStylePatch {
  const kind = TEXT_KINDS.find((entry) => entry.id === id)!;
  const fontWeight = kind.fontWeight === 700 && !boldAvailable(documentStyle, style) ? 400 : kind.fontWeight;
  return { fontSizePt: kind.fontSizePt, fontWeight };
}

function topLevelText(document: CatalogDocument, objectId: string): TextObject | undefined {
  for (const page of document.pages) {
    const object = page.objects.find((entry) => entry.id === objectId);
    if (object) return object.type === 'text' ? object : undefined;
  }
  return undefined;
}

export function textStyleAction(
  object: TextObject,
  patch: TextStylePatch,
  expectedStyle: TextStyle = object.style
): ApplicationAction {
  return { type: 'text.setStyle', objectId: object.id, expectedStyle, patch };
}

export interface TextStyleOutcome {
  ok: boolean;
  /** Plain message for the editor notices; empty when the change itself is the feedback. */
  message: string;
}

/**
 * Runs one style change. `expectedStyle` is the style the screen showed when the button was pressed (the
 * patch was chosen from it); without it, the box as it is now in the session is used.
 */
export function applyTextStyle(
  session: DocumentSession,
  objectId: string,
  patch: TextStylePatch,
  transactionId: string,
  expectedStyle?: TextStyle
): TextStyleOutcome {
  const object = topLevelText(session.getSnapshot().document, objectId);
  if (!object) return { ok: false, message: 'Selecione uma caixa de texto para mudar o estilo.' };
  if (object.locked) return { ok: false, message: 'A caixa de texto está bloqueada. Desbloqueie para mudar o estilo.' };
  const result = session.execute(textStyleAction(object, patch, expectedStyle), { transactionId });
  if (result.ok) return { ok: true, message: '' };
  return {
    ok: false,
    message: result.error.code === 'TARGET_STALE'
      ? 'O texto mudou enquanto você escolhia. Tente de novo.'
      : 'Não foi possível mudar o estilo do texto.',
  };
}
