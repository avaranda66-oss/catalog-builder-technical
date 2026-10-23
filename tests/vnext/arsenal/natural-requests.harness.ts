import { createDocumentSession, type DocumentSession } from '../../../src/vnext/application';
import type { CatalogDocument } from '../../../src/vnext/domain';
import type { ArsenalPresetSummary } from '../../../src/vnext/arsenal/contracts';
import { analyzeLocalRequest, describeLocalAction, routeLocally, type LocalChoice, type LocalRoute } from '../../../src/vnext/arsenal/local-router';
import { assistantDecisionFor, assistantRouteFor, type AssistantRoute } from '../../../src/vnext/ai-catalog/edit-intents';
import { applyLocalAction, planLocalStyle } from '../../../src/vnext/ai-catalog/local-assistant-actions';
import { quickToolForRequest } from '../../../src/vnext/ai-catalog/assistant-quick-tools';
import { createPresysArchetypeTemplateRegistry } from '../../../src/vnext/library/presys-archetypes';
import { DEFAULT_NEW_TABLE_SIZE } from '../../../src/vnext/app/editor-defaults';
import { acceptedRoutes, type CorpusRoute, type ExpectedAction, type NaturalRequest } from './natural-requests.corpus';

/**
 * Runs one request of the corpus through the assistant's decision WITHOUT the AI, exactly in the app's order
 * (CatalogNativeComposer): quick tools → router without AI (arsenal, table, model page, style) → the AI lanes
 * (edit_intent / composer). A local answer is then done for real on a copy of the catalog, so "right action"
 * means "the card would work", not only "the router said so".
 */

export type DecidedRoute = CorpusRoute | 'quick';

export interface LocalCaseResult {
  readonly id: string;
  readonly kind: NaturalRequest['kind'];
  readonly topic: NaturalRequest['topic'];
  readonly message: string;
  readonly expected: readonly CorpusRoute[];
  readonly route: DecidedRoute;
  readonly routeOk: boolean;
  /** Only for local answers: the action or preset is the expected one and it works on the catalog. */
  readonly actionOk?: boolean;
  /** What the router found or why it declined (for the report). */
  readonly got: string;
  readonly reason?: string;
  /** A request without technical values that the router treated as one (the father would see a refusal). */
  readonly undueRefusal: boolean;
  /** A local answer that writes a number nobody typed (or a technical request answered locally). */
  readonly inventedValue: boolean;
}

const laneRoute = (route: AssistantRoute): CorpusRoute => route === 'edit' ? 'edit_intent' : route === 'local' ? 'local' : 'composer';

function choiceMatches(choice: LocalChoice, expected: ExpectedAction, presets: readonly ArsenalPresetSummary[]): boolean {
  if (choice.kind === 'preset') {
    switch (expected.type) {
      case 'preset': return expected.names.includes(choice.name);
      case 'preset-category': return choice.category === expected.category;
      case 'page.template': return expected.presetNames.includes(choice.name) && presets.some(entry => entry.id === choice.presetId);
      default: return false;
    }
  }
  const action = choice.action;
  switch (expected.type) {
    case 'table.new': return action.type === 'table.new' && action.rows === expected.rows && action.columns === expected.columns;
    case 'page.template': return action.type === 'page.template' && action.archetypeId === expected.archetypeId;
    case 'page.blank': return action.type === 'page.blank';
    case 'style': return action.type === 'style' && action.objectId === expected.objectId
      && JSON.stringify(action.change) === JSON.stringify(expected.change);
    default: return false;
  }
}

const describeChoice = (choice: LocalChoice) => choice.kind === 'preset' ? `arsenal: ${choice.name}` : describeLocalAction(choice.action);

function sessionFor(document: CatalogDocument): DocumentSession {
  let serial = 0;
  return createDocumentSession(structuredClone(document), {
    createId: () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`,
    templateRegistry: createPresysArchetypeTemplateRegistry(),
  });
}

/** Digits of every cell of a table object (an empty new table has none). */
function tableDigits(session: DocumentSession, objectId: string): boolean {
  for (const page of session.getSnapshot().document.pages) {
    const object = page.objects.find(entry => entry.id === objectId);
    if (object?.type === 'table') return /\d/.test(JSON.stringify(object.table.cells.map(cell => cell.content)));
  }
  return false;
}

/**
 * Does the local answer work on the catalog? Table/page: applied on a copy (ok, cells empty). Style: the same plan as
 * the card ("Vou fazer isto") with one item. Preset: it exists in the arsenal the person sees.
 */
function localWorks(choice: LocalChoice, document: CatalogDocument, entry: NaturalRequest, activePageId: string,
  presets: readonly ArsenalPresetSummary[]): { ok: boolean; digits: boolean } {
  if (choice.kind === 'preset') return { ok: presets.some(preset => preset.id === choice.presetId), digits: false };
  const session = sessionFor(document);
  if (choice.action.type === 'style') {
    const plan = planLocalStyle(session, choice.action, entry.message, entry.selection ?? []);
    return { ok: Boolean(plan && plan.items.length === 1 && plan.blocked.length === 0), digits: false };
  }
  const result = applyLocalAction(session, choice.action, { activePageId });
  if (!result.ok) return { ok: false, digits: false };
  return { ok: true, digits: result.objectId ? tableDigits(session, result.objectId) : false };
}

/** Numbers of a new table that came from nowhere (not typed, not the editor's default size). */
function tableInventsNumbers(choice: LocalChoice, message: string): boolean {
  if (choice.kind !== 'action' || choice.action.type !== 'table.new') return false;
  const typed = new Set(analyzeLocalRequest(message).numbers.map(token => token.number));
  const { rows, columns, models } = choice.action;
  const rowsOk = typed.has(rows) || rows === DEFAULT_NEW_TABLE_SIZE.rows;
  const columnsOk = typed.has(columns) || columns === DEFAULT_NEW_TABLE_SIZE.columns || (models !== undefined && columns === models + 1);
  return !rowsOk || !columnsOk;
}

export function decideNaturalRequest(entry: NaturalRequest, document: CatalogDocument,
  presets: readonly ArsenalPresetSummary[]): { result: LocalCaseResult; local: LocalRoute; lane: AssistantRoute } {
  const activePageId = document.pages[entry.page - 1].id;
  const selectedObjectIds = entry.selection ?? [];
  const expected = acceptedRoutes(entry);
  const base = { id: entry.id, kind: entry.kind, topic: entry.topic, message: entry.message, expected };
  const local = routeLocally(entry.message, { document, activePageId, selectedObjectIds, presets });

  if (quickToolForRequest(entry.message, {})) {
    return { result: { ...base, route: 'quick', routeOk: false, got: 'atalho rápido', undueRefusal: false, inventedValue: false }, local, lane: 'local' };
  }
  const decision = assistantDecisionFor(entry.message, document, { local: { activePageId, selectedObjectIds, presets } });
  let lane = decision.route;
  let actionOk: boolean | undefined;
  let digits = false;
  let got = local.kind === 'local' ? describeChoice(local.primary) : `IA (${local.reason})`;
  if (lane === 'local' && decision.local) {
    const works = localWorks(decision.local.primary, document, entry, activePageId, presets);
    if (!works.ok && decision.local.primary.kind === 'action' && decision.local.primary.action.type === 'style') {
      // As the app: a style change the editor cannot plan goes to the AI.
      lane = assistantRouteFor(entry.message, document, {});
      got += ' → não deu para planejar, foi à IA';
    } else {
      actionOk = works.ok && choiceMatches(decision.local.primary, entry.expected.action, presets);
      digits = works.digits || tableInventsNumbers(decision.local.primary, entry.message);
    }
  }
  const route = laneRoute(lane);
  const routeOk = expected.includes('recusa') ? route === 'edit_intent' : expected.includes(route);
  const technicalDecline = local.kind === 'none' && local.reason === 'TECHNICAL_VALUES';
  const undueRefusal = entry.kind !== 'tecnico' && expected.includes('local') && technicalDecline;
  const inventedValue = digits || (entry.kind === 'tecnico' && route === 'local');
  return {
    result: { ...base, route, routeOk, ...(actionOk === undefined ? {} : { actionOk }), got,
      ...(local.kind === 'none' ? { reason: local.reason } : {}), undueRefusal, inventedValue },
    local, lane,
  };
}
