import { z } from 'zod';
import {
  createDocumentSession, executeApplicationAction, type ApplicationAction, type DocumentSession,
} from '../application';
import { projectEditableRichText } from '../application/text-editing';
import { TABLE_TEXT_SIZES } from '../application/table-preset-registry';
import { mmToU, type CatalogDocument, type EditorialObject, type Page, type Paint } from '../domain';
import { planTableComposition, projectTableLook, tableLookSteps } from '../editor/table-look-authoring';
import { boldAvailable, effectiveTextStyle } from '../editor/text-style-authoring';
import { buildDocumentOutline, OUTLINE_TARGET_CHARS, type DocumentOutline, type DocumentOutlineOptions } from './document-outline';
import { ARSENAL_AI_REF, type ArsenalAiIndexEntry } from './arsenal-ai-contract';
import { routeLocally, type LocalRoute, type LocalRouteContext } from '../arsenal/local-router';
import {
  BLOCKED_CODES, checkEditIntents, EDIT_INTENT_KINDS, EDIT_INTENT_LANGUAGES, EDIT_INTENT_LIMITS, EDIT_INTENT_PALETTE,
  outlineObjects, type BlockedCode, type BlockedIntent, type EditIntent, type EditIntentKind, type EditIntentLanguage,
  type EditOutline, type NumberCheck,
} from './edit-intent-contract';

/**
 * FR-72: the conversation that edits. The AI answers with typed intents
 * (edit-intent-contract.ts); this module turns them into the editor's EXISTING
 * actions, builds the "vou fazer isto" preview, and applies everything as ONE
 * Desfazer, after checking the whole change on a copy of the document.
 *
 * No new action type is created. Values the AI could have invented are
 * refused here again, with the same rules the server applies.
 */

/* ------------------------------------------------------------------------------------------------ */
/* Request                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

const TurnSchema = z.object({ role: z.enum(['user', 'assistant']), message: z.string().trim().min(1).max(800) }).strict();
export type EditIntentTurn = z.infer<typeof TurnSchema>;
export interface EditIntentRequest {
  version: 1;
  task: 'edit_intent';
  message: string;
  history: EditIntentTurn[];
  outline: EditOutline;
  /** Onda 4.5: short index of the arsenal (refs a1…); sent only to a server that announces `arsenal_index`. */
  arsenal?: ArsenalAiIndexEntry[];
}
export type EditIntentGateway = (request: EditIntentRequest) => Promise<unknown>;
/** History kept short: the outline already takes most of the input budget. */
export const EDIT_INTENT_HISTORY_TURNS = 6;

/** The outline never gets smaller than this to make room for the arsenal index. */
const OUTLINE_MIN_CHARS_WITH_ARSENAL = 6_000;

export function prepareEditIntentRequest(document: CatalogDocument, message: string,
  history: readonly EditIntentTurn[] = [], options: DocumentOutlineOptions = {},
  arsenal: readonly ArsenalAiIndexEntry[] = []): { request: EditIntentRequest; outline: DocumentOutline } {
  const text = message.trim();
  if (!text || text.length > EDIT_INTENT_LIMITS.messageChars) throw new Error('EDIT_INTENT_MESSAGE_INVALID');
  // The index shares the 6 000-token input ceiling with the outline: the outline aims a bit lower when it goes along.
  const indexChars = arsenal.length ? JSON.stringify(arsenal).length : 0;
  const outline = buildDocumentOutline(document, indexChars && options.maxChars === undefined
    ? { ...options, maxChars: Math.max(OUTLINE_MIN_CHARS_WITH_ARSENAL, OUTLINE_TARGET_CHARS - indexChars) } : options);
  const turns = z.array(TurnSchema).parse(history.slice(-EDIT_INTENT_HISTORY_TURNS)
    .map(turn => ({ role: turn.role, message: turn.message.slice(0, 800) })));
  return { request: { version: 1, task: 'edit_intent', message: text, history: turns, outline: outline.outline,
    ...(arsenal.length ? { arsenal: [...arsenal] } : {}) }, outline };
}

/* ------------------------------------------------------------------------------------------------ */
/* Reply                                                                                            */
/* ------------------------------------------------------------------------------------------------ */

const ref = z.string().regex(/^o\d{1,3}$/);
const pageRef = z.string().regex(/^p\d{1,3}$/);
const intentText = z.string().min(1).max(EDIT_INTENT_LIMITS.intentTextChars);
const colorName = z.enum(Object.keys(EDIT_INTENT_PALETTE) as [keyof typeof EDIT_INTENT_PALETTE, ...(keyof typeof EDIT_INTENT_PALETTE)[]]);
export const EditIntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('set_text'), target: ref, text: intentText }).strict(),
  z.object({ kind: z.literal('translate_text'), target: ref, text: intentText, language: z.enum(EDIT_INTENT_LANGUAGES).optional() }).strict(),
  z.object({ kind: z.literal('text_size'), target: ref, size: z.enum(['larger', 'smaller']) }).strict(),
  z.object({ kind: z.literal('text_weight'), target: ref, weight: z.enum(['bold', 'regular']) }).strict(),
  z.object({ kind: z.literal('set_color'), target: ref, color: colorName }).strict(),
  z.object({ kind: z.literal('resize'), target: ref, size: z.enum(['larger', 'smaller']) }).strict(),
  z.object({ kind: z.literal('delete_object'), target: ref }).strict(),
  z.object({ kind: z.literal('delete_page'), page: pageRef }).strict(),
  z.object({ kind: z.literal('duplicate_page'), page: pageRef }).strict(),
]);
const BlockedSchema = z.object({ kind: z.enum(EDIT_INTENT_KINDS), target: ref.optional(), page: pageRef.optional(),
  code: z.enum(BLOCKED_CODES) }).strict();
export const EditIntentReplySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('proposal'), summary: z.string().trim().min(6).max(EDIT_INTENT_LIMITS.summaryChars + 40).optional(),
    intents: z.array(EditIntentSchema).max(EDIT_INTENT_LIMITS.intents),
    blocked: z.array(BlockedSchema).max(EDIT_INTENT_LIMITS.intents) }).strict(),
  z.object({ status: z.literal('clarification'), question: z.string().trim().min(8).max(EDIT_INTENT_LIMITS.questionChars) }).strict(),
  z.object({ status: z.literal('refusal'), reason: z.string().trim().min(8).max(EDIT_INTENT_LIMITS.questionChars) }).strict(),
  // Onda 4.5: "use the saved preset" (a ref of the arsenal index sent with the request).
  z.object({ status: z.literal('use_preset'), preset: z.string().regex(ARSENAL_AI_REF),
    summary: z.string().trim().min(6).max(EDIT_INTENT_LIMITS.summaryChars + 40).optional() }).strict(),
]);
export type EditIntentReplyParsed = z.infer<typeof EditIntentReplySchema>;

/* ------------------------------------------------------------------------------------------------ */
/* Preview                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

export interface EditPreviewItem {
  readonly kind: EditIntentKind;
  /** What will be done, in plain words: "Trocar o texto". */
  readonly title: string;
  /** Which object or page, with the name of "Camadas": 'Texto “PCON HÍBRIDO”'. */
  readonly target: string;
  readonly before?: string;
  readonly after?: string;
  /** Numbers that did not come from this text: typed in the conversation or copied from another text. Confirm them. */
  readonly confirm?: readonly string[];
  /** Numbers that leave the text. */
  readonly dropped?: readonly string[];
}
export interface BlockedPreviewItem { readonly kind: EditIntentKind; readonly target: string; readonly reason: string }
export interface EditPlan {
  readonly documentId: string;
  /** localSequence of the session the plan was made for. */
  readonly revision: number;
  readonly summary: string;
  readonly actions: readonly ApplicationAction[];
  readonly items: readonly EditPreviewItem[];
  readonly blocked: readonly BlockedPreviewItem[];
}
export type EditIntentOutcome =
  | { readonly status: 'plan'; readonly plan: EditPlan }
  | { readonly status: 'clarification'; readonly question: string }
  | { readonly status: 'refusal'; readonly reason: string }
  /** Onda 4.5: the AI points at a preset of the arsenal; `preset` is a ref of the index sent (a1…). */
  | { readonly status: 'use_preset'; readonly preset: string; readonly summary?: string };

const LANGUAGE_NAMES: Readonly<Record<EditIntentLanguage, string>> = {
  'pt-BR': 'português', en: 'inglês', es: 'espanhol', fr: 'francês', it: 'italiano', de: 'alemão', pl: 'polonês',
};
/** Why something was not done, in short sentences for the person. */
export const BLOCKED_REASONS: Readonly<Record<BlockedCode, string>> = {
  UNKNOWN_TARGET: 'A IA citou algo que não está na página aberta. Abra a página certa e peça de novo.',
  UNKNOWN_PAGE: 'Essa página não existe neste catálogo.',
  WRONG_KIND: 'Esse pedido não vale para este objeto.',
  LOCKED: 'Este objeto está travado. Destrave em Camadas e peça de novo.',
  INVENTED_NUMBER: 'Recusado: a IA escreveu um número que não está no catálogo nem no seu pedido. Valores técnicos só entram conferidos.',
  NUMBER_DROPPED: 'Recusado: a tradução perdia ou mudava um número do texto original.',
  CODE_CHANGED: 'Recusado: a tradução mudava um código de modelo. Códigos ficam como estão.',
  TEXT_CUT: 'Este texto é longo demais para a IA mexer com segurança. Edite à mão.',
  NOT_EDITABLE: 'Este texto tem formatação que só dá para mudar à mão.',
  DUPLICATE: 'Pedido repetido para o mesmo objeto.',
  NO_CHANGE: 'Já está assim.',
  LAST_PAGE: 'O catálogo precisa ficar com pelo menos uma página.',
  NOT_POSSIBLE: 'Não deu para fazer isso sem estragar o catálogo.',
};
const blockedFromApplication = (code: string): BlockedCode =>
  code === 'OBJECT_LOCKED' ? 'LOCKED' : code === 'LAST_PAGE_REQUIRED' ? 'LAST_PAGE' : code === 'OBJECT_TYPE_MISMATCH' ? 'WRONG_KIND'
    : code === 'OBJECT_NOT_FOUND' ? 'UNKNOWN_TARGET' : code === 'PAGE_NOT_FOUND' ? 'UNKNOWN_PAGE' : 'NOT_POSSIBLE';

const ptLabel = (value: number) => (Math.round(value * 10) / 10).toString().replace('.', ',') + ' pt';

/* ------------------------------------------------------------------------------------------------ */
/* Intent -> existing editor actions                                                                */
/* ------------------------------------------------------------------------------------------------ */

const SIZE_STEP = 1.2;
const FONT_MIN = 5, FONT_MAX = 96;
const roundHalf = (value: number) => Math.round(value * 2) / 2;

function findObject(document: CatalogDocument, objectId: string): { page: Page; object: EditorialObject; group?: EditorialObject } | undefined {
  for (const page of document.pages) {
    for (const object of page.objects) {
      if (object.id === objectId) return { page, object };
      if (object.type === 'group') {
        const child = object.objects.find(entry => entry.id === objectId);
        if (child) return { page, object: child, group: object };
      }
    }
  }
  return undefined;
}
function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return '#' + [16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function recolor(paint: Paint | undefined, hex: string): Paint {
  if (!paint || paint.kind === 'solid') return { kind: 'solid', color: hex };
  if (paint.kind === 'linear') return { ...paint, from: hex, to: shade(hex, 0.72) };
  return { ...paint, color: hex };
}
/** The object grows or shrinks around its centre and stays on the page; an image keeps its proportions. */
function scaledFrame(object: EditorialObject, page: Page, factor: number) {
  const f = { xU: mmToU(object.frame.xMm), yU: mmToU(object.frame.yMm), widthU: mmToU(object.frame.widthMm), heightU: mmToU(object.frame.heightMm) };
  const pageW = mmToU(page.widthMm), pageH = mmToU(page.heightMm);
  const horizontalLine = object.type === 'line' && object.axis === 'horizontal';
  const verticalLine = object.type === 'line' && object.axis === 'vertical';
  let scale = factor;
  if (!verticalLine) scale = Math.min(scale, pageW / f.widthU);
  if (!horizontalLine) scale = Math.min(scale, pageH / f.heightU);
  const widthU = verticalLine ? f.widthU : Math.max(1, Math.round(f.widthU * scale));
  const heightU = horizontalLine ? f.heightU : Math.max(1, Math.round(f.heightU * scale));
  const clamp = (value: number, size: number, limit: number) => Math.max(0, Math.min(value, limit - size));
  const xU = clamp(Math.round(f.xU + (f.widthU - widthU) / 2), widthU, pageW);
  const yU = clamp(Math.round(f.yU + (f.heightU - heightU) / 2), heightU, pageH);
  return { xU, yU, widthU, heightU };
}

type Built = { actions: ApplicationAction[]; item: Omit<EditPreviewItem, 'kind' | 'target'> } | { blocked: BlockedCode };

function buildIntent(document: CatalogDocument, outline: DocumentOutline, intent: EditIntent,
  checked: { numbers?: NumberCheck; finalText?: string }): Built {
  if (intent.kind === 'delete_page' || intent.kind === 'duplicate_page') {
    const pageId = outline.pages.get(intent.page);
    if (!pageId || !document.pages.some(page => page.id === pageId)) return { blocked: 'UNKNOWN_PAGE' };
    return intent.kind === 'delete_page'
      ? { actions: [{ type: 'page.delete', pageId }], item: { title: 'Apagar a página' } }
      : { actions: [{ type: 'page.duplicate', pageId }], item: { title: 'Duplicar a página' } };
  }
  const location = outline.objects.get(intent.target);
  const found = location ? findObject(document, location.objectId) : undefined;
  if (!location || !found) return { blocked: 'UNKNOWN_TARGET' };
  const { object, page } = found;
  if (object.locked || found.group?.locked) return { blocked: 'LOCKED' };
  switch (intent.kind) {
    case 'set_text':
    case 'translate_text': {
      if (object.type !== 'text') return { blocked: 'WRONG_KIND' };
      const before = projectEditableRichText(object.text);
      if (before === null || checked.finalText === undefined) return { blocked: 'NOT_EDITABLE' };
      const numbers = checked.numbers;
      return {
        actions: [{ type: 'text.setContent', objectId: object.id, expectedText: object.text, plainText: checked.finalText }],
        item: {
          title: intent.kind === 'translate_text'
            ? 'Traduzir' + (intent.language ? ' para o ' + LANGUAGE_NAMES[intent.language] : '')
            : 'Trocar o texto',
          before, after: checked.finalText,
          ...(numbers && numbers.fromConversation.length + numbers.fromDocument.length > 0
            ? { confirm: [...numbers.fromConversation, ...numbers.fromDocument] } : {}),
          ...(numbers && numbers.dropped.length > 0 ? { dropped: numbers.dropped } : {}),
        },
      };
    }
    case 'text_size': {
      if (object.type === 'table') {
        const look = projectTableLook(object.table, document.style);
        const current = object.table.style.base.fontSizePt ?? document.style.defaultText.fontSizePt ?? 10;
        const sizes = [...TABLE_TEXT_SIZES].sort((a, b) => a.fontSizePt - b.fontSizePt);
        const next = intent.size === 'larger' ? sizes.find(size => size.fontSizePt > current)
          : [...sizes].reverse().find(size => size.fontSizePt < current);
        if (!next) return { blocked: 'NO_CHANGE' };
        const planned = planTableComposition(document, page.id, object.id,
          tableLookSteps({ kind: 'size', size: next.id }, look, document.style));
        if (!planned.ok) return { blocked: blockedFromApplication(planned.code) };
        if (planned.actions.length === 0) return { blocked: 'NO_CHANGE' };
        return { actions: [...planned.actions], item: { title: intent.size === 'larger' ? 'Aumentar a letra da tabela' : 'Diminuir a letra da tabela',
          before: ptLabel(current), after: `${ptLabel(next.fontSizePt)} (${next.name.toLowerCase()})` } };
      }
      if (object.type !== 'text') return { blocked: 'WRONG_KIND' };
      const current = effectiveTextStyle(document.style, object.style).fontSizePt ?? 10;
      const target = Math.min(FONT_MAX, Math.max(FONT_MIN,
        roundHalf(intent.size === 'larger' ? current * SIZE_STEP : current / SIZE_STEP)));
      if (target === current) return { blocked: 'NO_CHANGE' };
      const actions: ApplicationAction[] = [{ type: 'text.setStyle', objectId: object.id, expectedStyle: object.style,
        patch: { fontSizePt: target } }];
      // Larger letters need a taller box, or the last line would be cut: the box grows down by the same ratio.
      if (target > current && !found.group) {
        const f = { xU: mmToU(object.frame.xMm), yU: mmToU(object.frame.yMm), widthU: mmToU(object.frame.widthMm), heightU: mmToU(object.frame.heightMm) };
        const heightU = Math.min(Math.round(f.heightU * target / current), mmToU(page.heightMm) - f.yU);
        if (heightU > f.heightU) actions.push({ type: 'object.resize', objectId: object.id, ...f, heightU });
      }
      return { actions, item: { title: intent.size === 'larger' ? 'Aumentar a letra' : 'Diminuir a letra',
        before: ptLabel(current), after: ptLabel(target) } };
    }
    case 'text_weight': {
      if (object.type !== 'text') return { blocked: 'WRONG_KIND' };
      const weight = intent.weight === 'bold' ? 700 : 400;
      if (weight === 700 && !boldAvailable(document.style, object.style)) return { blocked: 'NOT_POSSIBLE' };
      if (effectiveTextStyle(document.style, object.style).fontWeight === weight) return { blocked: 'NO_CHANGE' };
      return { actions: [{ type: 'text.setStyle', objectId: object.id, expectedStyle: object.style, patch: { fontWeight: weight } }],
        item: { title: weight === 700 ? 'Deixar em negrito' : 'Tirar o negrito' } };
    }
    case 'set_color': {
      const color = EDIT_INTENT_PALETTE[intent.color];
      const item = { title: 'Mudar a cor para ' + color.label };
      switch (object.type) {
        case 'text':
          if (effectiveTextStyle(document.style, object.style).color === color.hex) return { blocked: 'NO_CHANGE' };
          return { actions: [{ type: 'text.setStyle', objectId: object.id, expectedStyle: object.style, patch: { color: color.hex } }], item };
        case 'shape':
          if (object.style.fill?.toUpperCase() === color.hex) return { blocked: 'NO_CHANGE' };
          return { actions: [{ type: 'shape.setStyle', objectId: object.id, expectedStyle: object.style,
            style: { ...object.style, fill: color.hex } }], item };
        case 'polygon': {
          const fill = recolor(object.style.fill, color.hex);
          if (JSON.stringify(fill) === JSON.stringify(object.style.fill)) return { blocked: 'NO_CHANGE' };
          return { actions: [{ type: 'polygon.setStyle', objectId: object.id, expectedStyle: object.style,
            style: { ...object.style, fill } }], item };
        }
        case 'line': {
          const state = { color: object.color, ...(object.thicknessPt === undefined ? {} : { thicknessPt: object.thicknessPt }),
            ...(object.dash === undefined ? {} : { dash: object.dash }), ...(object.opacity === undefined ? {} : { opacity: object.opacity }) };
          if (object.color.toUpperCase() === color.hex) return { blocked: 'NO_CHANGE' };
          return { actions: [{ type: 'line.setStyle', objectId: object.id, expectedStyle: state, style: { ...state, color: color.hex } }], item };
        }
        default:
          return { blocked: 'WRONG_KIND' };
      }
    }
    case 'resize': {
      if (found.group || object.type === 'group') return { blocked: 'WRONG_KIND' };
      const frame = scaledFrame(object, page, intent.size === 'larger' ? SIZE_STEP : 1 / SIZE_STEP);
      const percent = intent.size === 'larger' ? 'Aumentar' : 'Diminuir';
      return { actions: [{ type: 'object.resize', objectId: object.id, ...frame }],
        item: { title: percent + ' o tamanho', before: `${Math.round(object.frame.widthMm)} × ${Math.round(object.frame.heightMm)} mm`,
          after: `${Math.round(frame.widthU / 10_000)} × ${Math.round(frame.heightU / 10_000)} mm` } };
    }
    case 'delete_object':
      if (found.group) return { blocked: 'WRONG_KIND' };
      return { actions: [{ type: 'object.delete', objectId: object.id }], item: { title: 'Apagar' } };
  }
}

function targetLabel(outline: DocumentOutline, intent: { kind: EditIntentKind; target?: string; page?: string }): string {
  if (intent.page) {
    const page = outline.outline.pages.find(entry => entry.ref === intent.page);
    return page ? `Página ${page.number}${page.heading ? ` (“${page.heading}”)` : ''}` : 'Página';
  }
  const object = intent.target ? outlineObjects(outline.outline).get(intent.target) : undefined;
  return object ? object.name : 'Objeto';
}

/**
 * Builds the preview and the list of actions on a COPY of the document. Each
 * intent is simulated in order (deletions last); one that cannot be applied is
 * listed as refused, with its reason, and the others go on.
 */
export function planEditIntents(document: CatalogDocument, revision: number, outline: DocumentOutline,
  reply: EditIntentReplyParsed, messages: readonly string[]): EditIntentOutcome {
  if (reply.status === 'clarification') return { status: 'clarification', question: reply.question };
  if (reply.status === 'refusal') return { status: 'refusal', reason: reply.reason };
  if (reply.status === 'use_preset') return { status: 'use_preset', preset: reply.preset, ...(reply.summary ? { summary: reply.summary } : {}) };
  if (document.id !== outline.documentId) throw new Error('EDIT_INTENT_OTHER_DOCUMENT');
  // The browser repeats the server checks with its own outline (an older server, or a changed reply, cannot slip through).
  const local = checkEditIntents(outline.outline, messages, reply.intents);
  const blocked: BlockedPreviewItem[] = [];
  const seenBlocked = new Set<string>();
  const addBlocked = (entry: BlockedIntent | { kind: EditIntentKind; target?: string; page?: string; code: BlockedCode }) => {
    const key = entry.kind + ':' + (entry.target ?? entry.page) + ':' + entry.code;
    if (seenBlocked.has(key)) return;
    seenBlocked.add(key);
    blocked.push({ kind: entry.kind, target: targetLabel(outline, entry), reason: BLOCKED_REASONS[entry.code] });
  };
  for (const entry of [...reply.blocked, ...local.blocked]) addBlocked(entry);
  const ordered = [...local.accepted].sort((a, b) =>
    Number(a.intent.kind === 'delete_object' || a.intent.kind === 'delete_page') -
    Number(b.intent.kind === 'delete_object' || b.intent.kind === 'delete_page'));
  let simulated = document;
  let ids = 0;
  const dependencies = { createId: () => `edit-intent-simulation-${++ids}` };
  const actions: ApplicationAction[] = [];
  const items: EditPreviewItem[] = [];
  for (const checked of ordered) {
    const intent = checked.intent;
    const ref = { kind: intent.kind, ...('target' in intent ? { target: intent.target } : {}), ...('page' in intent ? { page: intent.page } : {}) };
    const built = buildIntent(simulated, outline, intent, checked);
    if ('blocked' in built) { addBlocked({ ...ref, code: built.blocked }); continue; }
    let next = simulated;
    let failure: BlockedCode | undefined;
    for (const action of built.actions) {
      const result = executeApplicationAction(next, action, dependencies);
      if (!result.ok) { failure = blockedFromApplication(result.error.code); break; }
      next = result.document;
    }
    if (failure) { addBlocked({ ...ref, code: failure }); continue; }
    simulated = next;
    actions.push(...built.actions);
    items.push({ kind: intent.kind, target: targetLabel(outline, ref), ...built.item });
  }
  const summary = reply.summary ?? (items.length === 1 ? 'Preparei 1 mudança.' : `Preparei ${items.length} mudanças.`);
  return { status: 'plan', plan: { documentId: document.id, revision, summary, actions, items, blocked } };
}

/** Asks the AI and returns the plan to preview. Nothing is changed in the document. */
export async function requestEditIntents(session: DocumentSession, message: string, gateway: EditIntentGateway,
  history: readonly EditIntentTurn[] = [], options: DocumentOutlineOptions = {},
  arsenal: readonly ArsenalAiIndexEntry[] = []): Promise<EditIntentOutcome> {
  const snapshot = session.getSnapshot();
  const { request, outline } = prepareEditIntentRequest(snapshot.document, message, history, options, arsenal);
  const reply = EditIntentReplySchema.parse(await gateway(request));
  // The browser checks the ref again: only one of the index it sent (an older or changed reply cannot slip through).
  if (reply.status === 'use_preset' && !request.arsenal?.some(entry => entry.ref === reply.preset)) {
    throw new Error('EDIT_INTENT_PRESET_UNKNOWN');
  }
  const messages = [request.message, ...request.history.filter(turn => turn.role === 'user').map(turn => turn.message)];
  return planEditIntents(snapshot.document, snapshot.localSequence, outline, reply, messages);
}

/**
 * Applies a previewed plan as ONE Desfazer: same document, same revision,
 * whole list checked on a scratch copy first; any failure changes nothing.
 */
export function applyEditPlan(session: DocumentSession, plan: EditPlan): { applied: number; revision: number } {
  const before = session.getSnapshot();
  if (before.document.id !== plan.documentId) throw new Error('EDIT_PLAN_OTHER_DOCUMENT');
  if (before.localSequence !== plan.revision) throw new Error('EDIT_PLAN_STALE');
  if (plan.actions.length === 0) throw new Error('EDIT_PLAN_EMPTY');
  const scratch = createDocumentSession(before.document, { createId: () => crypto.randomUUID() });
  for (const action of plan.actions) {
    if (!scratch.execute(action, { transactionId: 'edit-intent-preflight' }).ok) throw new Error('EDIT_PLAN_PREFLIGHT_FAILED');
  }
  const transactionId = crypto.randomUUID();
  let applied = 0;
  for (const action of plan.actions) {
    const result = session.execute(action, { transactionId });
    if (!result.ok) {
      // Cannot happen after the preflight; if it does, one Undo removes the partial step.
      if (applied > 0 && session.getSnapshot().localSequence !== before.localSequence) session.undo();
      throw new Error('EDIT_PLAN_APPLY_FAILED');
    }
    if (result.metadata.changed) applied += 1;
  }
  return { applied, revision: session.getSnapshot().localSequence };
}

/* ------------------------------------------------------------------------------------------------ */
/* Routing helper (for the single assistant, FR-73)                                                 */
/* ------------------------------------------------------------------------------------------------ */

const EDIT_VERBS = /(?:^|[^\p{L}])(troqu|troca|troque|mud[ae]|alter[ae]|substitu|apag|remov|tir[ea]|exclu|delet|aument|diminu|reduz|amplie|deix[ae]|coloqu|ponha|traduz|negrito|dupli[cq]|corrij|corrig|escrev|preench|atualiz|pint[ae])/iu;
const NEW_PAGES = /(?:^|[^\p{L}])(cri[ea]r?|mont[ea]r?|comece|gere|nova[s]? p[áa]gina|um cat[áa]logo novo|novo cat[áa]logo)(?:$|[^\p{L}])/iu;
/** "passa o subtítulo pro espanhol", "coloca em inglês": a translation of the open page. */
const LANGUAGE_WORDS = /(?:^|[^\p{L}])(ingl[êe]s|espanhol|franc[êe]s|italiano|alem[ãa]o|polon[êe]s)(?:$|[^\p{L}])/iu;
/** "bota/põe/coloca X no rodapé": something written INTO the open catalog (a value, a text). */
const PUT_VERBS = /(?:^|[^\p{L}])(bot[ae]r?|coloc[ao]r?|p[õo]e|met[ae]r?|inser[ei]r?|insir[ao]|acrescent[ae]r?|inclu[ia]r?)(?:$|[^\p{L}])/iu;
/**
 * "uma tabela", "a página de faixas", "o cabeçalho padrão", "3 páginas": a page, table, header or footer as the OBJECT
 * of the verb is something new, which the composer (or the arsenal) builds. After a preposition ("na tabela", "no
 * rodapé") it is a place in the open catalog instead.
 */
const NEW_THING = /(?:^|[^\p{L}])(uma?|as?|os?|nova|novo|outra|outro|duas|dois|tr[êe]s|\d+)\s+(?:\p{L}+\s+)?(tabe?l|p[áa]gin|capa|contracapa|se[çc][ãa]o|cat[áa]logo|folder|cabe[çc]al|cabe[çc]ari|rodap)/iu;
/** "aplica o estilo de título nesse texto": a style goes on what is already on the page. */
const STYLE_WORDS = /(?:^|[^\p{L}])(estilos?|formata[çc][ãa]o)(?:$|[^\p{L}])/iu;
/**
 * Which lane of the single assistant answers a typed request: "edit" (this
 * module, on the open document) or "compose" (new pages). Edits need a
 * document with something on it. `followUp`: the last answer of this
 * conversation came from the edit lane (a question or a card on screen), so a
 * short reply ("os selos", "só o título") stays there.
 */
export function assistantLaneFor(message: string, document: CatalogDocument,
  options: { readonly followUp?: boolean } = {}): 'edit' | 'compose' {
  const hasContent = document.pages.some(page => page.objects.length > 0);
  if (!hasContent || NEW_PAGES.test(message)) return 'compose';
  if (options.followUp || EDIT_VERBS.test(message) || LANGUAGE_WORDS.test(message) || STYLE_WORDS.test(message)) return 'edit';
  // "coloca a exatidão no rodapé" changes the open catalog (and is refused there when the value was never given);
  // "bota uma tabela comparando…" builds something new.
  return PUT_VERBS.test(message) && !NEW_THING.test(message) ? 'edit' : 'compose';
}

const BUILD_VERB = /(?:^|[^\p{L}])(cri[ea]r?|mont[ea]r?|fa[çc]a|fazer|gere|gerar|prepar[ea]r?|transform[ea]r?|comece)(?:$|[^\p{L}])/iu;
const FROM_FILES = /(?:^|[^\p{L}])(arquivos?|pdfs?|anexos?|folhetos?|manua(?:l|is))(?:$|[^\p{L}])/iu;
const WHOLE_CATALOG = /(?:^|[^\p{L}])(cat[áa]logo|p[áa]ginas)(?:$|[^\p{L}])/iu;
const SKETCH_WORDS = /(?:^|[^\p{L}])(rascunhos?|esbo[çc]os?|desenhos?|desenhei|desenhad[ao]s?)(?:$|[^\p{L}])/iu;

export type AssistantRoute = 'edit' | 'compose' | 'catalog-draft' | 'sketch' | 'local';
export interface AssistantRouteContext {
  /** The last answer of this conversation came from the edit lane. */
  readonly editFollowUp?: boolean;
  /** This conversation has PDFs that "Montar catálogo a partir destes arquivos" can read now. */
  readonly catalogFiles?: boolean;
  /** This conversation has photos that the Modo rascunho can read now. */
  readonly sketchPhotos?: boolean;
  /**
   * Onda 4.5: the router without AI (src/vnext/arsenal/local-router.ts) runs BEFORE edit_intent and the composer when
   * this is given: the open page, the selection and the arsenal. Absent: the old routes only.
   */
  readonly local?: Omit<LocalRouteContext, 'document' | 'followUp'>;
}
export interface AssistantDecision {
  readonly route: AssistantRoute;
  /** What the router without AI found (route `local`), shown as a card; nothing was sent to the AI. */
  readonly local?: Extract<LocalRoute, { kind: 'local' }>;
}
/**
 * FR-73, one assistant: where a typed request goes. "Monte o catálogo com
 * estes PDFs" (with PDFs sent here) → the catalog plan (FR-70); "crie a
 * página deste rascunho" (with photos sent here) → Modo rascunho; a change
 * on the open catalog → edit_intent; anything else → new pages (composer).
 */
export function assistantRouteFor(message: string, document: CatalogDocument, context: AssistantRouteContext = {}): AssistantRoute {
  return assistantDecisionFor(message, document, context).route;
}

/**
 * The same decision with what the router without AI found. Order: files (catalog plan, Modo rascunho) → the router
 * without AI (arsenal and simple actions, zero tokens) → edit_intent → composer.
 */
export function assistantDecisionFor(message: string, document: CatalogDocument, context: AssistantRouteContext = {}): AssistantDecision {
  if (context.sketchPhotos && SKETCH_WORDS.test(message) && BUILD_VERB.test(message)) return { route: 'sketch' };
  if (context.catalogFiles && FROM_FILES.test(message) && WHOLE_CATALOG.test(message) && BUILD_VERB.test(message)) return { route: 'catalog-draft' };
  if (context.local) {
    const local = routeLocally(message, { ...context.local, document, followUp: context.editFollowUp });
    if (local.kind === 'local') return { route: 'local', local };
  }
  return { route: assistantLaneFor(message, document, { followUp: context.editFollowUp }) };
}
