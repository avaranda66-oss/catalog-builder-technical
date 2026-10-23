import { createDocumentSession, type ApplicationAction, type DocumentSession } from '../application';
import type { CatalogDocument, Page, PolygonObject, TextBox, TextObject } from '../domain';
import { mmToU } from '../domain/physical';
import { textBoxAction } from './native-element-authoring';

/**
 * Onda 4 (P, item 3): "Destacar este modelo". In a family bar (a row of selos, one per model, the current model in
 * the accent colour with a small triangle over it) moving the highlight took 4 colour clicks plus dragging the
 * triangle. Here the selected selo takes the highlighted selo's look (background, outline and text colour), the
 * highlighted one takes the plain look, and the triangle moves over the new model: one Desfazer step, made only of
 * existing actions (text.setBox, text.setStyle, object.move), each prepared from the state on screen.
 *
 * The bar is recognised by its shape, not by object IDs (a cover inserted from "Usar modelo…" gets new IDs): at least
 * three selos of the same height on one line, side by side with small gaps, all with the same look except one.
 */

/** Same line and same height, within this tolerance. */
const ROW_TOLERANCE_MM = 0.5;
/** Neighbouring selos of one bar are this close (the PCON bar has 1.5 mm, the inserted "Barra da família" 1.5 mm). */
const MAX_GAP_MM = 4;
/** The triangle over the current model is small and touches the bar (above or below). */
const POINTER_MAX_SIZE_MM = 10;
const POINTER_REACH_MM = 4;

export interface FamilyBar {
  /** Selos of the bar, left to right. */
  members: readonly TextObject[];
  /** The selo shown as the current model. */
  highlighted: TextObject;
  /** The triangle over the current model, when there is one. */
  pointer?: PolygonObject;
}

export type FamilyBarHighlightPlan =
  | { ok: true; actions: ApplicationAction[]; pointerMoved: boolean; pointerLocked: boolean }
  | { ok: false; reason: 'not-in-bar' | 'already-highlighted' | 'locked' };

type Look = { fill?: string; stroke?: TextBox['stroke']; color?: string };

const lookOf = (text: TextObject, defaultColor: string | undefined): Look =>
  ({ fill: text.box?.fill, stroke: text.box?.stroke, color: text.style.color ?? defaultColor });
const lookKey = (look: Look) => JSON.stringify([look.fill ?? null, look.stroke ?? null, look.color ?? null]);
const centerXMm = (text: TextObject) => text.frame.xMm + text.frame.widthMm / 2;

function isSelo(object: Page['objects'][number]): object is TextObject & { box: TextBox } {
  return object.type === 'text' && Boolean(object.box) && !object.hidden;
}

/** The family bar the selo `objectId` belongs to, or undefined when it is not part of one. */
export function familyBarOf(page: Page, objectId: string, defaultColor?: string): FamilyBar | undefined {
  const target = page.objects.find((object) => object.id === objectId);
  if (!target || !isSelo(target)) return undefined;
  const row = page.objects.filter(isSelo)
    .filter((object) => Math.abs(object.frame.yMm - target.frame.yMm) <= ROW_TOLERANCE_MM
      && Math.abs(object.frame.heightMm - target.frame.heightMm) <= ROW_TOLERANCE_MM)
    .sort((a, b) => a.frame.xMm - b.frame.xMm);
  // Only the run of close neighbours around the target (two groups of pills on one line are two runs).
  const index = row.findIndex((object) => object.id === objectId);
  const close = (left: TextObject, right: TextObject) => {
    const gap = right.frame.xMm - (left.frame.xMm + left.frame.widthMm);
    return gap >= -0.01 && gap <= MAX_GAP_MM;
  };
  let start = index, end = index;
  while (start > 0 && close(row[start - 1], row[start])) start -= 1;
  while (end < row.length - 1 && close(row[end], row[end + 1])) end += 1;
  const members = row.slice(start, end + 1);
  if (members.length < 3) return undefined;
  const keys = members.map((member) => lookKey(lookOf(member, defaultColor)));
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  if (counts.size !== 2) return undefined;
  const unique = [...counts].find(([, count]) => count === 1)?.[0];
  if (unique === undefined) return undefined;
  const highlighted = members[keys.indexOf(unique)];
  const top = highlighted.frame.yMm, bottom = top + highlighted.frame.heightMm;
  const pointer = page.objects
    .filter((object): object is PolygonObject => object.type === 'polygon' && !object.hidden && object.points.length === 3
      && object.frame.widthMm <= POINTER_MAX_SIZE_MM && object.frame.heightMm <= POINTER_MAX_SIZE_MM)
    .filter((object) => {
      const center = object.frame.xMm + object.frame.widthMm / 2;
      const objectTop = object.frame.yMm, objectBottom = objectTop + object.frame.heightMm;
      return center >= highlighted.frame.xMm && center <= highlighted.frame.xMm + highlighted.frame.widthMm
        && objectBottom >= top - POINTER_REACH_MM && objectTop <= bottom + POINTER_REACH_MM;
    })
    .sort((a, b) => Math.abs(a.frame.xMm + a.frame.widthMm / 2 - centerXMm(highlighted)) - Math.abs(b.frame.xMm + b.frame.widthMm / 2 - centerXMm(highlighted)))[0];
  return { members, highlighted, ...(pointer ? { pointer } : {}) };
}

function withLook(box: TextBox, look: Look): TextBox {
  const { fill: _fill, stroke: _stroke, ...rest } = box;
  return { ...rest, ...(look.fill !== undefined ? { fill: look.fill } : {}), ...(look.stroke !== undefined ? { stroke: look.stroke } : {}) };
}

/** The actions that move the highlight of the bar to the selo `objectId` (prepared from `page` as it is now). */
export function planFamilyBarHighlight(page: Page, objectId: string, defaultColor?: string): FamilyBarHighlightPlan {
  const bar = familyBarOf(page, objectId, defaultColor);
  if (!bar) return { ok: false, reason: 'not-in-bar' };
  const target = bar.members.find((member) => member.id === objectId)!;
  const current = bar.highlighted;
  if (current.id === target.id) return { ok: false, reason: 'already-highlighted' };
  if (target.locked || current.locked) return { ok: false, reason: 'locked' };
  const plain = lookOf(target, defaultColor), accent = lookOf(current, defaultColor);
  const actions: ApplicationAction[] = [
    textBoxAction(target, withLook(target.box!, accent)),
    textBoxAction(current, withLook(current.box!, plain)),
  ];
  if (accent.color && accent.color !== plain.color) {
    actions.push({ type: 'text.setStyle', objectId: target.id, expectedStyle: target.style, patch: { color: accent.color } });
  }
  if (plain.color && accent.color !== plain.color) {
    actions.push({ type: 'text.setStyle', objectId: current.id, expectedStyle: current.style, patch: { color: plain.color } });
  }
  const pointer = bar.pointer;
  const pointerLocked = Boolean(pointer?.locked);
  if (pointer && !pointerLocked) {
    const deltaU = Math.round(mmToU(centerXMm(target)) - mmToU(centerXMm(current)));
    actions.push({ type: 'object.move', objectId: pointer.id, xU: mmToU(pointer.frame.xMm) + deltaU, yU: mmToU(pointer.frame.yMm) });
  }
  return { ok: true, actions, pointerMoved: Boolean(pointer && !pointerLocked), pointerLocked };
}

export interface FamilyBarHighlightOutcome { ok: boolean; message: string }

/**
 * Runs the plan as ONE Desfazer step. It is first rehearsed on a private copy, so the catalog only changes when every
 * step is valid; an unexpected late failure is rolled back with one Desfazer (the steps share one transaction).
 */
export function highlightFamilyModel(session: DocumentSession, pageId: string, objectId: string, transactionId: string): FamilyBarHighlightOutcome {
  const document: CatalogDocument = session.getSnapshot().document;
  const page = document.pages.find((entry) => entry.id === pageId);
  if (!page) return { ok: false, message: 'Não foi possível destacar este modelo.' };
  const plan = planFamilyBarHighlight(page, objectId, document.style.defaultText.color);
  if (!plan.ok) {
    return {
      ok: false,
      message: plan.reason === 'already-highlighted' ? 'Este já é o modelo destacado.'
        : plan.reason === 'locked' ? 'Um dos selos da barra está travado. Destrave-o em Camadas e tente de novo.'
          : 'Este selo não faz parte de uma barra de modelos.',
    };
  }
  let copy = 0;
  const rehearsal = createDocumentSession(document, { createId: () => `rehearsal-${++copy}` });
  if (!plan.actions.every((action) => rehearsal.execute(action, { transactionId }).ok)) {
    return { ok: false, message: 'Não foi possível destacar este modelo. Nada foi alterado.' };
  }
  let changed = false;
  for (const action of plan.actions) {
    const result = session.execute(action, { transactionId });
    if (!result.ok) {
      if (changed) session.undo();
      return { ok: false, message: 'Não foi possível destacar este modelo. Nada foi alterado.' };
    }
    changed = changed || result.metadata.changed;
  }
  return {
    ok: true,
    message: plan.pointerLocked
      ? 'Modelo destacado. A seta está travada e ficou onde estava. Use Desfazer se precisar.'
      : 'Modelo destacado. Use Desfazer se precisar.',
  };
}
