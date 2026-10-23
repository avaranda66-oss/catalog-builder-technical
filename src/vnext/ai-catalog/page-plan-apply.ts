import { createDocumentSession, type DocumentSession } from '../application';
import type { ObjectInsertSpec } from '../application/contracts';
import { composePageTemplateRegistries, type PageTemplateRegistry } from '../application/template-registry';
import { findObjectInTree, mmToU, type CatalogDocument, type EditorialObject, type Frame, type Page } from '../domain';
import {
  PRESYS_ARCHETYPES, buildPresysArchetypePage, createPresysArchetypeTemplateRegistry, presysArchetype,
  type PresysArchetypeFills, type PresysArchetypeId,
} from '../library/presys-archetypes';
import {
  PRESYS_PCON_COVER, PRESYS_PCON_COVER_TEMPLATE_ID, buildPresysPconCoverPage, createPresysCoverTemplateRegistry, pconCoverSlotObjectId,
} from '../library/presys-cover-pcon';
import {
  DRAFT_PAGE_REF_PREFIX, compileDraft, draftIntegrityProblems, openPendingCount,
  type CompiledDraft, type DraftFactSet, type DraftLayout, type DraftStep,
} from './draft-compiler';

/**
 * "Aplicar plano de páginas" (Onda 4, FR-70): the one reusable door that turns a list of PRESYS pages — each a
 * page model (P1–P9 or the PCON cover C1) with its fields filled, or the specification table compiled from
 * checked facts — into typed application actions under ONE transactionId, so one Desfazer removes it all.
 * Used by the catalog plan of the assistant (catalog-plan.ts, DraftPreview.tsx) and, later, by the Modo
 * rascunho screen (sketch-snap.ts gives the page model and the slot of each drawn region).
 *
 * - A model page is inserted with `page.template.insert` (the same templates as "Usar modelo…", so the page
 *   keeps the model's safe area and look); then each filled text field is written with `text.setContent`, and
 *   a filled table or image replaces the model's placeholder (`object.delete` + `object.insert`). Fields left
 *   unfilled keep the model's "A COMPLETAR", which the publication review (FR-51) blocks until replaced.
 * - The specification table goes through `compileDraft` (FR-69): only checked values, the rest blank and
 *   listed as pending, long tables continued on new pages.
 * - Rehearsed first on a private copy, so a refused step never leaves half a catalog behind; the catalog must
 *   still have the page the plan was prepared after.
 */
export type PagePlanTemplateId = PresysArchetypeId | 'C1';
export type PagePlanEntry =
  | { readonly kind: 'template'; readonly key: string; readonly template: PagePlanTemplateId; readonly fills: PresysArchetypeFills }
  | { readonly kind: 'spec-table'; readonly key: string; readonly set: DraftFactSet; readonly layout?: DraftLayout | 'auto' };

interface TemplateStep {
  readonly kind: 'template';
  readonly entry: number;
  readonly pageRef: string;
  readonly afterRef: string;
  readonly templateId: string;
  /** Objects the inserted model page must have (same order as `built`). */
  readonly objectCount: number;
  readonly texts: readonly { readonly index: number; readonly plainText: string }[];
  readonly replacements: readonly { readonly remove: readonly number[]; readonly insert: readonly ObjectInsertSpec[] }[];
}
export type PagePlanStep =
  | TemplateStep
  | { readonly kind: 'draft'; readonly entry: number; readonly step: DraftStep }
  | { readonly kind: 'delete-page'; readonly pageId: string };

export interface CompiledPagePlan {
  readonly transactionId: string;
  /** The plan's pages go right after this page (and after its table's continuation pages). */
  readonly anchorPageId: string;
  /** The anchor was an empty page: it is removed at the end, so a blank new catalog starts at the cover. */
  readonly replacesEmptyPage: boolean;
  readonly steps: readonly PagePlanStep[];
  /** Page refs created by each entry, in order (a long table has several). */
  readonly pageRefs: readonly { readonly key: string; readonly refs: readonly string[] }[];
  /** The compiled specification tables, by entry key (for the pending list and "Mostrar na tabela"). */
  readonly drafts: Readonly<Record<string, CompiledDraft>>;
  /** Each model page as it will look (fills applied), by page ref: the thumbnails and the A4 estimate read these. */
  readonly previews: Readonly<Record<string, Page>>;
}

export class PagePlanError extends Error {
  constructor(readonly code: 'PLAN_EMPTY' | 'PLAN_NO_PAGE' | 'PLAN_DRAFT_INTEGRITY' | 'PLAN_FILL_UNSUPPORTED', message: string = code) {
    super(message);
    this.name = 'PagePlanError';
  }
}

const PLAN_PAGE_REF = 'plano-pagina-';
export const templateIdOf = (template: PagePlanTemplateId) =>
  template === 'C1' ? PRESYS_PCON_COVER_TEMPLATE_ID : presysArchetype(template).templateId;
/** The model page as built from code: the same objects, in the same order, as its page template. */
export function buildPlanTemplatePage(template: PagePlanTemplateId, pageId: string, fills: PresysArchetypeFills = {}): Page {
  return template === 'C1'
    ? buildPresysPconCoverPage({ pageId, fills })
    : buildPresysArchetypePage(template, { pageId, fills });
}
function slotObjectId(template: PagePlanTemplateId, pageId: string, slotId: string, suffix = ''): string {
  if (template === 'C1') return `${pconCoverSlotObjectId(pageId, slotId)}${suffix}`;
  return `${pageId}-${slotId.slice(slotId.indexOf('.') + 1)}${suffix}`;
}
const frameU = (frame: Frame) => ({ xU: mmToU(frame.xMm), yU: mmToU(frame.yMm), widthU: Math.max(1, mmToU(frame.widthMm)),
  heightU: Math.max(1, mmToU(frame.heightMm)) });
function insertSpecOf(object: EditorialObject): ObjectInsertSpec {
  if (object.type === 'table') return { type: 'table', frameU: frameU(object.frame), zIndex: object.zIndex, table: object.table };
  if (object.type === 'image') return { type: 'image', frameU: frameU(object.frame), zIndex: object.zIndex, assetId: object.assetId, fit: object.fit };
  throw new PagePlanError('PLAN_FILL_UNSUPPORTED');
}
const plainOf = (object: EditorialObject | undefined) => object?.type === 'text'
  ? object.text.paragraphs.map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : '\n').join('')).join('\n')
  : '';

function templateStep(entry: number, template: PagePlanTemplateId, fills: PresysArchetypeFills, pageRef: string, afterRef: string,
  document: CatalogDocument): { step: TemplateStep; preview: Page } {
  const templateId = templateIdOf(template);
  const blank = buildPlanTemplatePage(template, templateId);
  const filled = buildPlanTemplatePage(template, pageRef, fills);
  const indexOf = (id: string) => blank.objects.findIndex(object => object.id === id);
  const filledOf = (id: string) => filled.objects.find(object => object.id === id);
  const texts: { index: number; plainText: string }[] = [];
  const replacements: { remove: number[]; insert: ObjectInsertSpec[] }[] = [];
  for (const [slotId, fill] of Object.entries(fills)) {
    if (fill.kind === 'text') {
      const index = indexOf(slotObjectId(template, templateId, slotId));
      const object = filledOf(slotObjectId(template, pageRef, slotId));
      if (index < 0 || object?.type !== 'text') throw new PagePlanError('PLAN_FILL_UNSUPPORTED', slotId);
      if (plainOf(blank.objects[index]) !== plainOf(object)) texts.push({ index, plainText: plainOf(object) });
      continue;
    }
    if (fill.kind === 'table') {
      const index = indexOf(slotObjectId(template, templateId, slotId, '-object'));
      const object = filledOf(slotObjectId(template, pageRef, slotId, '-object'));
      if (index < 0 || object?.type !== 'table') throw new PagePlanError('PLAN_FILL_UNSUPPORTED', slotId);
      replacements.push({ remove: [index], insert: [insertSpecOf(object)] });
      continue;
    }
    // An image needs its asset in the catalog already (the photo is registered before the plan is applied).
    if (!document.assets.some(asset => asset.id === fill.assetId)) throw new PagePlanError('PLAN_FILL_UNSUPPORTED', slotId);
    const remove = template === 'C1'
      ? [indexOf(slotObjectId(template, templateId, slotId))]
      : [indexOf(slotObjectId(template, templateId, slotId, '-box')), indexOf(slotObjectId(template, templateId, slotId, '-marker'))];
    const object = filledOf(slotObjectId(template, pageRef, slotId));
    if (remove.some(index => index < 0) || object?.type !== 'image') throw new PagePlanError('PLAN_FILL_UNSUPPORTED', slotId);
    replacements.push({ remove, insert: [insertSpecOf(object)] });
  }
  return { step: { kind: 'template', entry, pageRef, afterRef, templateId, objectCount: blank.objects.length, texts, replacements },
    preview: filled };
}

/**
 * Compiles the plan into steps, without changing `document`. Deterministic: the same entries, document and
 * options give the same steps.
 */
export function compilePagePlan(document: CatalogDocument, entries: readonly PagePlanEntry[], options: {
  /** Default: the last page. */
  readonly afterPageId?: string;
  /** Remove the anchor page at the end when it is empty (a blank new catalog). Default true. */
  readonly replaceEmptyAnchor?: boolean;
  readonly transactionId?: string;
} = {}): CompiledPagePlan {
  if (!entries.length) throw new PagePlanError('PLAN_EMPTY');
  const last = document.pages[document.pages.length - 1];
  if (!last) throw new PagePlanError('PLAN_NO_PAGE');
  const anchor = document.pages.find(page => page.id === options.afterPageId) ?? last;
  const replacesEmptyPage = options.replaceEmptyAnchor !== false && anchor.objects.length === 0;
  const transactionId = options.transactionId ?? `plano-${globalThis.crypto.randomUUID()}`;
  // A working copy that grows with the plan's pages, so each table is compiled for the pages before it.
  let virtual: CatalogDocument = document;
  const addVirtual = (page: Page, afterId: string) => {
    const at = virtual.pages.findIndex(item => item.id === afterId) + 1;
    virtual = { ...virtual, pages: [...virtual.pages.slice(0, at), page, ...virtual.pages.slice(at)] };
  };
  const steps: PagePlanStep[] = [];
  const pageRefs: { key: string; refs: string[] }[] = [];
  const drafts: Record<string, CompiledDraft> = {};
  const previews: Record<string, Page> = {};
  let previous = anchor.id;
  entries.forEach((entry, index) => {
    if (entry.kind === 'template') {
      const pageRef = `${PLAN_PAGE_REF}${index + 1}`;
      const { step, preview } = templateStep(index, entry.template, entry.fills, pageRef, previous, document);
      steps.push(step);
      previews[pageRef] = preview;
      addVirtual(preview, previous);
      pageRefs.push({ key: entry.key, refs: [pageRef] });
      previous = pageRef;
      return;
    }
    const draft = compileDraft(entry.set, virtual, { afterPageId: previous, layout: entry.layout ?? 'auto',
      transactionId: `${transactionId}:tabela-${index + 1}` });
    if (draftIntegrityProblems(entry.set, draft).length) throw new PagePlanError('PLAN_DRAFT_INTEGRITY');
    const rename = (ref: string) => ref.startsWith(DRAFT_PAGE_REF_PREFIX) ? `${PLAN_PAGE_REF}${index + 1}-${ref.slice(DRAFT_PAGE_REF_PREFIX.length)}` : ref;
    const refs: string[] = [];
    for (const step of draft.steps) {
      if (step.kind === 'page') {
        const pageRef = rename(step.pageRef);
        steps.push({ kind: 'draft', entry: index, step: { ...step, pageRef,
          action: { ...step.action, ...(step.action.afterPageId ? { afterPageId: rename(step.action.afterPageId) } : {}) } } });
        addVirtual({ id: pageRef, widthMm: 210, heightMm: 297, safeArea: { topMm: 12, rightMm: 12, bottomMm: 12, leftMm: 12 }, objects: [] },
          step.action.afterPageId ? rename(step.action.afterPageId) : previous);
        refs.push(pageRef);
        previous = pageRef;
      } else {
        steps.push({ kind: 'draft', entry: index, step: { ...step, pageRef: rename(step.pageRef),
          action: { ...step.action, pageId: rename(step.action.pageId) } } });
      }
    }
    drafts[entry.key] = draft;
    pageRefs.push({ key: entry.key, refs });
  });
  if (replacesEmptyPage) steps.push({ kind: 'delete-page', pageId: anchor.id });
  return { transactionId, anchorPageId: anchor.id, replacesEmptyPage, steps, pageRefs, drafts, previews };
}

/** Ids of every page each entry created (by ref), or undefined when a step was refused. */
function runPlan(target: DocumentSession, plan: CompiledPagePlan, transactionId: string): Map<string, string> | undefined {
  const pages = new Map<string, string>();
  const resolve = (ref: string) => pages.get(ref) ?? ref;
  const run = (action: Parameters<DocumentSession['execute']>[0]) => target.execute(action, { transactionId });
  for (const step of plan.steps) {
    if (step.kind === 'delete-page') {
      if (!run({ type: 'page.delete', pageId: step.pageId }).ok) return undefined;
      continue;
    }
    if (step.kind === 'draft') {
      if (step.step.kind === 'page') {
        const { afterPageId } = step.step.action;
        const result = run({ ...step.step.action, ...(afterPageId ? { afterPageId: resolve(afterPageId) } : {}) });
        const created = result.ok ? result.metadata.createdIds[0] : undefined;
        if (!created) return undefined;
        pages.set(step.step.pageRef, created);
        continue;
      }
      const pageId = resolve(step.step.pageRef);
      const result = run({ ...step.step.action, pageId });
      const objectId = result.ok ? result.metadata.createdIds[0] : undefined;
      if (!objectId || findObjectInTree(target.getSnapshot().document, objectId)?.object.type !== 'table') return undefined;
      continue;
    }
    const inserted = run({ type: 'page.template.insert', templateId: step.templateId, afterPageId: resolve(step.afterRef) });
    const pageId = inserted.ok ? inserted.metadata.createdIds[0] : undefined;
    const page = pageId ? target.getSnapshot().document.pages.find(item => item.id === pageId) : undefined;
    if (!pageId || !page || page.objects.length !== step.objectCount) return undefined;
    const ids = page.objects.map(object => object.id);
    for (const text of step.texts) {
      const object = target.getSnapshot().document.pages.find(item => item.id === pageId)?.objects.find(item => item.id === ids[text.index]);
      if (object?.type !== 'text') return undefined;
      if (!run({ type: 'text.setContent', objectId: object.id, expectedText: object.text, plainText: text.plainText }).ok) return undefined;
    }
    for (const replacement of step.replacements) {
      for (const index of replacement.remove) if (!run({ type: 'object.delete', objectId: ids[index] }).ok) return undefined;
      for (const object of replacement.insert) if (!run({ type: 'object.insert', pageId, object }).ok) return undefined;
    }
    pages.set(step.pageRef, pageId);
  }
  return pages;
}

export interface AppliedPagePlan {
  readonly transactionId: string;
  /** Every created page, in catalog order. */
  readonly pageIds: readonly string[];
  /** The pages of each entry, by entry key. */
  readonly pagesByKey: Readonly<Record<string, readonly string[]>>;
  /** History position right after the plan: "Desfazer" is offered only while nothing else changed. */
  readonly localSequence: number;
  readonly message: string;
}
export type ApplyPagePlanOutcome = { readonly ok: true; readonly applied: AppliedPagePlan } | { readonly ok: false; readonly message: string };

const NOTHING_CHANGED = 'Nada foi alterado.';
/** The PRESYS page models (archetypes and the PCON cover), for the private rehearsal. */
export function presysPlanTemplateRegistry(): PageTemplateRegistry {
  const archetypes = createPresysArchetypeTemplateRegistry(), covers = createPresysCoverTemplateRegistry();
  return composePageTemplateRegistries(() => [archetypes, covers]);
}
let defaultRegistry: PageTemplateRegistry | undefined;

function pagesText(document: CatalogDocument, pageIds: readonly string[]): string {
  const numbers = pageIds.map(id => document.pages.findIndex(page => page.id === id) + 1).filter(n => n > 0).sort((a, b) => a - b);
  if (!numbers.length) return '';
  const contiguous = numbers.every((n, index) => index === 0 || n === numbers[index - 1] + 1);
  if (numbers.length === 1) return `na página ${numbers[0]}`;
  return contiguous ? `nas páginas ${numbers[0]} a ${numbers.at(-1)}` : `nas páginas ${numbers.slice(0, -1).join(', ')} e ${numbers.at(-1)}`;
}

/**
 * Applies the plan under its transactionId (one Desfazer removes it all), after a rehearsal on a private copy.
 * `templateRegistry` is the registry of the editor's session (default: the PRESYS page models).
 */
export function applyPagePlan(session: DocumentSession, plan: CompiledPagePlan,
  options: { readonly templateRegistry?: PageTemplateRegistry } = {}): ApplyPagePlanOutcome {
  const before = session.getSnapshot().document;
  const anchor = before.pages.find(page => page.id === plan.anchorPageId);
  if (!anchor || (plan.replacesEmptyPage && anchor.objects.length > 0)) {
    return { ok: false, message: `O catálogo mudou desde que as páginas foram preparadas. ${NOTHING_CHANGED} Prepare de novo.` };
  }
  let serial = 0;
  const templateRegistry = options.templateRegistry ?? (defaultRegistry ??= presysPlanTemplateRegistry());
  const rehearsal = createDocumentSession(before, { createId: () => `plano-ensaio-${++serial}`, templateRegistry });
  if (!runPlan(rehearsal, plan, `${plan.transactionId}:ensaio`)) {
    return { ok: false, message: `Não foi possível montar as páginas. ${NOTHING_CHANGED}` };
  }
  const pages = runPlan(session, plan, plan.transactionId);
  if (!pages) {
    if (session.getSnapshot().document !== before) session.undo();
    return { ok: false, message: `Não foi possível inserir as páginas. ${NOTHING_CHANGED} Tente de novo.` };
  }
  const snapshot = session.getSnapshot();
  const pagesByKey = Object.fromEntries(plan.pageRefs.map(entry => [entry.key, entry.refs.map(ref => pages.get(ref)!).filter(Boolean)]));
  const pageIds = snapshot.document.pages.map(page => page.id).filter(id => [...pages.values()].includes(id));
  const open = Object.values(plan.drafts).reduce((total, draft) => total + openPendingCount(draft.pending), 0);
  const pending = open === 0 ? '' : open === 1 ? ' 1 valor da tabela ficou para conferir.' : ` ${open} valores da tabela ficaram para conferir.`;
  const count = pageIds.length === 1 ? '1 página' : `${pageIds.length} páginas`;
  return { ok: true, applied: {
    transactionId: plan.transactionId, pageIds, pagesByKey, localSequence: snapshot.localSequence,
    message: `Catálogo montado: ${count} ${pagesText(snapshot.document, pageIds)}.${pending} Os campos com “A COMPLETAR” ficam para você. Use Desfazer se precisar.`,
  } };
}

/** Desfazer of the whole plan, only while it is still the last change of the catalog. */
export function undoPagePlan(session: DocumentSession, applied: AppliedPagePlan): boolean {
  const snapshot = session.getSnapshot();
  if (snapshot.localSequence !== applied.localSequence || !snapshot.canUndo) return false;
  return session.undo().ok;
}

/** Labels of the PRESYS models, for screens. */
export function planTemplateLabel(template: PagePlanTemplateId): string {
  return template === 'C1' ? PRESYS_PCON_COVER.label : (PRESYS_ARCHETYPES.find(item => item.id === template)?.label ?? template);
}
