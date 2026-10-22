import { mmToU, plainRichText, type CatalogDocument, type DocumentStyle, type LineObject, type Page, type PageBackground,
  type Paint, type PolygonObject, type PolygonPoint, type PolygonStyle, type ShapeObject, type ShapeStyle, type TextBox,
  type TextLeader, type TextObject, type TextStyle } from '../domain';
import type { ApplicationAction, DocumentSession, FrameU, LineStyleState, ObjectInsertSpec } from '../application';

/**
 * Onda 3.5 (P1/P2): pure helpers behind the "Forma", "Linha", "Polígono", "Selo", "Chamada", "Barra da família" and
 * "Fundo da página" controls. Each control prepares one typed action from what the screen shows (the expected state),
 * so a change made meanwhile is refused and one Desfazer undoes one choice.
 */

export const DASH_OPTIONS = [
  { value: 'solid', label: 'Contínuo' },
  { value: 'dashed', label: 'Tracejado' },
  { value: 'dotted', label: 'Pontilhado' },
] as const;

export const PATTERN_OPTIONS = [
  { value: 'dots', label: 'Pontos' },
  { value: 'lines', label: 'Listras' },
  { value: 'waves', label: 'Ondas' },
] as const;

export const LEADER_HEAD_OPTIONS = [
  { value: 'dot', label: 'Ponto' },
  { value: 'arrow', label: 'Seta' },
  { value: 'none', label: 'Sem ponta' },
] as const;

export type PolygonPresetId = 'diagonal' | 'triangle' | 'trapezoid';

export const POLYGON_PRESETS: readonly { id: PolygonPresetId; label: string; points: readonly PolygonPoint[] }[] = [
  { id: 'diagonal', label: 'Faixa diagonal', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.55 }, { x: 0, y: 1 }] },
  { id: 'triangle', label: 'Triângulo', points: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
  { id: 'trapezoid', label: 'Trapézio', points: [{ x: 0.2, y: 0 }, { x: 0.8, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
];

const NAVY = '#003366';
const WHITE = '#FFFFFF';

/** The catalog's own colours, upper case and without repeats; the navy/white house colours when it has none. */
export function brandPalette(style: DocumentStyle): string[] {
  const colors = [...new Set(style.palette.map((color) => color.toUpperCase()))];
  return colors.length ? colors : [NAVY, WHITE];
}

function darkest(style: DocumentStyle): string {
  const luminance = (hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255);
  };
  return [...brandPalette(style)].sort((a, b) => luminance(a) - luminance(b))[0] ?? NAVY;
}

/** Second brand colour (the accent): the first palette colour that is neither the darkest nor white. */
function accent(style: DocumentStyle): string {
  const dark = darkest(style);
  return brandPalette(style).find((color) => color !== dark && color !== WHITE) ?? '#0072CE';
}

const frameU = (xMm: number, yMm: number, widthMm: number, heightMm: number): FrameU =>
  ({ xU: mmToU(xMm), yU: mmToU(yMm), widthU: mmToU(widthMm), heightU: mmToU(heightMm) });

function zRange(page: Page): { min: number; max: number } {
  const values = page.objects.map((object) => object.zIndex);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: -1 };
}

function boldWeight(style: DocumentStyle): 400 | 700 {
  const family = style.defaultText.fontFamily;
  return style.fonts.some((font) => font.family === family && font.weight === 700 && font.style === 'normal') ? 700 : 400;
}

/** A diagonal band is a background: it goes behind everything already on the page; the others go on top. */
export function polygonInsertSpec(page: Page, style: DocumentStyle, preset: PolygonPresetId): ObjectInsertSpec {
  const shape = POLYGON_PRESETS.find((entry) => entry.id === preset) ?? POLYGON_PRESETS[0];
  const { min, max } = zRange(page);
  const background = preset === 'diagonal';
  return {
    type: 'polygon',
    frameU: background ? frameU(0, 0, 210, 120) : preset === 'triangle' ? frameU(20, 20, 40, 34) : frameU(20, 20, 60, 30),
    zIndex: background ? min - 1 : max + 1,
    points: shape.points.map((point) => ({ ...point })),
    style: { fill: { kind: 'solid', color: background ? darkest(style) : accent(style) } },
  };
}

/** "Selo": white bold words on a brand-colour pill that shrink to fit. */
export function pillInsertSpec(page: Page, style: DocumentStyle, label = 'Novo selo', at = { xMm: 20, yMm: 60 }): ObjectInsertSpec {
  return {
    type: 'text',
    frameU: frameU(at.xMm, at.yMm, 36, 8),
    zIndex: zRange(page).max + 1,
    text: plainRichText('onda35-pill', label),
    style: { fontSizePt: 8, fontWeight: boldWeight(style), color: WHITE, textAlign: 'center', lineHeight: 1.2 },
    box: { fill: darkest(style), paddingMm: 2, fitText: true },
  };
}

/** "Chamada": a label with a pointer that ends in a dot on the photo, to the right of the label. */
export function calloutInsertSpec(page: Page, style: DocumentStyle): ObjectInsertSpec {
  return {
    type: 'text',
    frameU: frameU(20, 120, 40, 10),
    zIndex: zRange(page).max + 1,
    text: plainRichText('onda35-callout', 'Nova chamada'),
    style: { fontSizePt: 8, fontWeight: boldWeight(style), color: darkest(style), textAlign: 'right', lineHeight: 1.2 },
    leader: { anchorXMm: 70, anchorYMm: 20, head: 'dot', elbow: true, color: darkest(style), thicknessPt: 0.75 },
  };
}

/**
 * "Barra da família": a row of selos (one per model) with the current model highlighted in the accent colour. It
 * is inserted as separate selos and grouped in the same Desfazer step, so the bar moves as one piece.
 */
export function familyBarInsertSpecs(page: Page, style: DocumentStyle, names: readonly string[] = ['Modelo 1', 'Modelo 2', 'Modelo 3', 'Modelo 4', 'Modelo 5', 'Modelo 6'], highlighted = names.length - 1): ObjectInsertSpec[] {
  const count = Math.max(2, names.length), gapMm = 1.5, widthMm = (182 - gapMm * (count - 1)) / count;
  const top = zRange(page).max + 1;
  return names.map((name, index) => ({
    type: 'text',
    frameU: frameU(14 + index * (widthMm + gapMm), 266, Math.round(widthMm * 1000) / 1000, 6),
    zIndex: top + index,
    text: plainRichText(`onda35-family-${index}`, name),
    style: { fontSizePt: 7, fontWeight: boldWeight(style), color: index === highlighted ? WHITE : darkest(style), textAlign: 'center', lineHeight: 1.2 },
    box: { fill: index === highlighted ? accent(style) : '#EDF3F7', paddingMm: 1.5, fitText: true },
  }));
}

/** Runs the inserts and the grouping as one Desfazer step; returns the new group (or object) id. */
export function insertFamilyBar(session: DocumentSession, pageId: string, specs: readonly ObjectInsertSpec[], transactionId: string): { ok: boolean; objectId?: string } {
  const created: string[] = [];
  for (const object of specs) {
    const result = session.execute({ type: 'object.insert', pageId, object }, { transactionId });
    if (!result.ok) return { ok: created.length > 0, objectId: created[0] };
    created.push(result.metadata.createdIds[0]);
  }
  const grouped = session.execute({ type: 'group.create', pageId, objectIds: created }, { transactionId });
  return { ok: true, objectId: grouped.ok ? grouped.metadata.createdIds[0] ?? created[0] : created[0] };
}

export const shapeStyleAction = (object: ShapeObject, style: ShapeStyle): ApplicationAction =>
  ({ type: 'shape.setStyle', objectId: object.id, expectedStyle: object.style, style });

export function lineStyleState(line: LineObject): LineStyleState {
  return {
    color: line.color,
    ...(line.thicknessPt !== undefined ? { thicknessPt: line.thicknessPt } : {}),
    ...(line.dash !== undefined ? { dash: line.dash } : {}),
    ...(line.opacity !== undefined ? { opacity: line.opacity } : {}),
  };
}

export const lineStyleAction = (line: LineObject, style: LineStyleState): ApplicationAction =>
  ({ type: 'line.setStyle', objectId: line.id, expectedStyle: lineStyleState(line), style });

export const polygonStyleAction = (polygon: PolygonObject, style: PolygonStyle): ApplicationAction =>
  ({ type: 'polygon.setStyle', objectId: polygon.id, expectedStyle: polygon.style, style });

export const polygonPointsAction = (polygon: PolygonObject, points: readonly PolygonPoint[]): ApplicationAction =>
  ({ type: 'polygon.setPoints', objectId: polygon.id, expectedPoints: polygon.points, points: points.map((point) => ({ ...point })) });

export const textBoxAction = (text: TextObject, box: TextBox | null): ApplicationAction =>
  ({ type: 'text.setBox', objectId: text.id, expectedBox: text.box ?? null, box });

export const textLeaderAction = (text: TextObject, leader: TextLeader | null): ApplicationAction =>
  ({ type: 'text.setLeader', objectId: text.id, expectedLeader: text.leader ?? null, leader });

export const pageBackgroundAction = (page: Page, background: PageBackground | null): ApplicationAction =>
  ({ type: 'page.setBackground', pageId: page.id, expectedBackground: page.background ?? null, background });

/** A box's default "Selo" look, used by "Adicionar fundo (selo)" on a plain text box. */
export function defaultTextBox(style: DocumentStyle): TextBox {
  return { fill: darkest(style), paddingMm: 2, fitText: true };
}

/** A pointer leaving the box to the right, used by "Adicionar seta (chamada)". */
export function defaultTextLeader(text: TextObject, style: DocumentStyle): TextLeader {
  return { anchorXMm: Math.round((text.frame.widthMm + 20) * 100) / 100, anchorYMm: Math.round((text.frame.heightMm / 2) * 100) / 100,
    head: 'dot', elbow: false, color: text.style.color ?? darkest(style), thicknessPt: 0.75 };
}

/** Switches a polygon's fill kind, keeping its main colour; returns the full new style. */
export function polygonFillOfKind(style: PolygonStyle, kind: Paint['kind'], palette: readonly string[]): PolygonStyle {
  const main = !style.fill ? palette[0] ?? NAVY : style.fill.kind === 'solid' ? style.fill.color : style.fill.kind === 'linear' ? style.fill.from : style.fill.color;
  const other = palette.find((color) => color !== main && color !== WHITE) ?? WHITE;
  const fill: Paint = kind === 'solid' ? { kind, color: main }
    : kind === 'linear' ? { kind, from: main, to: other, angleDeg: 90 }
      : { kind, pattern: 'dots', color: main, background: WHITE, spacingMm: 4 };
  return { ...style, fill };
}

/** Polygon vertices shown in mm from the box's top-left corner (what the person types), and back. */
export const pointToMm = (point: PolygonPoint, frame: { widthMm: number; heightMm: number }) =>
  ({ xMm: Math.round(point.x * frame.widthMm * 100) / 100, yMm: Math.round(point.y * frame.heightMm * 100) / 100 });

export function pointFromMm(xMm: number, yMm: number, frame: { widthMm: number; heightMm: number }): PolygonPoint {
  const clamp = (value: number) => Math.min(1, Math.max(0, Math.round(value * 10000) / 10000));
  return { x: clamp(xMm / frame.widthMm), y: clamp(yMm / frame.heightMm) };
}

/** Where a callout points, in page millimetres (what the person sees), and back to the box-relative anchor. */
export const leaderAnchorOnPage = (text: TextObject, leader: TextLeader) =>
  ({ xMm: Math.round((text.frame.xMm + leader.anchorXMm) * 100) / 100, yMm: Math.round((text.frame.yMm + leader.anchorYMm) * 100) / 100 });

export function leaderWithAnchorOnPage(text: TextObject, leader: TextLeader, xMm: number, yMm: number): TextLeader {
  const clamp = (value: number) => Math.min(300, Math.max(-300, Math.round(value * 100) / 100));
  return { ...leader, anchorXMm: clamp(xMm - text.frame.xMm), anchorYMm: clamp(yMm - text.frame.yMm) };
}

export interface NativeStyleOutcome {
  ok: boolean;
  message: string;
}

/** Runs one prepared style action; the message is plain Portuguese for the editor notices. */
export function applyNativeAction(session: DocumentSession, action: ApplicationAction, transactionId: string): NativeStyleOutcome {
  const result = session.execute(action, { transactionId });
  if (result.ok) return { ok: true, message: '' };
  const code = result.error.code;
  return {
    ok: false,
    message: code === 'TARGET_STALE' ? 'O objeto mudou enquanto você escolhia. Tente de novo.'
      : code === 'OBJECT_LOCKED' ? 'O objeto está bloqueado. Desbloqueie para mudar.'
        : 'Não foi possível aplicar a mudança.',
  };
}

/** The top-level or grouped object as it is now in the catalog (read right before a change). */
export function currentObject<T extends 'shape' | 'line' | 'polygon' | 'text'>(document: CatalogDocument, objectId: string, type: T):
  Extract<ShapeObject | LineObject | PolygonObject | TextObject, { type: T }> | undefined {
  for (const page of document.pages) {
    for (const object of page.objects) {
      const candidates = object.type === 'group' ? [object, ...object.objects] : [object];
      const found = candidates.find((entry) => entry.id === objectId);
      if (found) return found.type === type ? found as Extract<ShapeObject | LineObject | PolygonObject | TextObject, { type: T }> : undefined;
    }
  }
  return undefined;
}

export type { TextStyle };
