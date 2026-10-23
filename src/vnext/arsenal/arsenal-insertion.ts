import type {
  ApplicationAction,
  ApplicationActionFailure,
  ApplicationActionSuccess,
  CellStylePatch,
  ObjectInsertSpec,
  TextStylePatch,
} from '../application/contracts';
import {
  findObjectInTree,
  frameToCanonicalU,
  type AssetRef,
  type CatalogDocument,
  type EditorialObject,
  type Frame,
  type LeafEditorialObject,
  type Page,
  type PageBackground,
  type TableModel,
} from '../domain';
import type { CellStyle } from '../domain/editorial-model';
import { lineStyleState } from '../editor/native-element-authoring';
import {
  ARSENAL_BUILTIN_ID_PREFIX,
  collectArsenalPayloadAssetIds,
  parseArsenalPreset,
  type ArsenalBlockPayload,
  type ArsenalCategory,
  type ArsenalIssue,
  type ArsenalPagePayload,
  type ArsenalPayload,
  type ArsenalPreset,
  type ArsenalStyle,
  type ArsenalTablePayload,
} from './contracts';
import {
  ARSENAL_STYLE_OBJECT_TYPES,
  isArsenalInsertTargetAllowed,
  type ArsenalInsertErrorCode,
  type ArsenalInsertFailure,
  type ArsenalInsertionPort,
  type ArsenalInsertionService,
  type ArsenalInsertRequest,
  type ArsenalInsertResult,
  type ArsenalInsertTarget,
} from './insertion';
import {
  arsenalContentBoxMm,
  arsenalVisibleObjects,
  clampIntoBox,
  findFreePlacement,
  frameInside,
  normalizeStacking,
  placementObstacles,
  roundMm,
  topZIndex,
  translateFrame,
} from './arsenal-geometry';
import {
  objectWithDeclaredFonts,
  tableStyleWithDeclaredFonts,
  tableWithDeclaredFonts,
  textStyleWithDeclaredFonts,
} from './arsenal-content';
import { tableWithPhotoPlaceholders, withPhotoPlaceholders } from './arsenal-placeholder';

/**
 * Onda 4.5 — using a preset (rules in `insertion.ts`, ADR-arsenal §4 and §8). Zero AI: the preset becomes typed
 * editor actions, all under one `transactionId`, so one Desfazer takes it all back.
 *
 * Reused actions: `page.template.insert` (built-in PRESYS page models), `page.add`, `page.setBackground`, `asset.register`, `object.insert`, `group.create`,
 * `object.setLocked`, `text.setStyle`, `text.setBox`, `shape.setStyle`, `polygon.setStyle`, `line.setStyle`,
 * `table.style.setBase`, `table.style.setRowRole`. New: `page.setSafeArea` (a saved page keeps the safe area it
 * was designed with; the editor had no way to set it).
 *
 * Placement (block and table presets):
 * - `original`: the block goes back exactly where it was captured (headers and footers, full-bleed bands);
 * - a point: the top-left corner goes there, moved inside the safe area when the block fits in it;
 * - none: headers and footers go back to their place; anything else goes to the middle of the largest free area
 *   of the page (tables: to the top of it), always inside the safe area and above the Onda 4 control footer. When
 *   nothing is free, a block that fits keeps its place if that is inside the safe area, else the safe area's
 *   centre; a table starts at the top of the safe area.
 */

type StyleTargetType = (typeof ARSENAL_STYLE_OBJECT_TYPES)[keyof typeof ARSENAL_STYLE_OBJECT_TYPES];

const refuse = (code: ArsenalInsertErrorCode, details: string): ArsenalInsertFailure =>
  ({ ok: false, error: { code, details }, rolledBack: false });

function describeIssues(issues: readonly ArsenalIssue[]): string {
  return issues.slice(0, 3).map((entry) => `${entry.code}${entry.path ? ` ${entry.path}` : ''}`).join('; ');
}

// ---------------------------------------------------------------------------------------------------------------
// Target checks (nothing runs when they fail)
// ---------------------------------------------------------------------------------------------------------------

type TargetCheck = { ok: true } | { ok: false; failure: ArsenalInsertFailure };

function checkTarget(document: CatalogDocument, preset: ArsenalPreset, target: ArsenalInsertTarget): TargetCheck {
  const no = (code: ArsenalInsertErrorCode, details: string): TargetCheck => ({ ok: false, failure: refuse(code, details) });
  switch (target.kind) {
    case 'new-page':
      if (target.afterPageId !== undefined && !document.pages.some((page) => page.id === target.afterPageId)) {
        return no('TARGET_NOT_FOUND', target.afterPageId);
      }
      return { ok: true };
    case 'page':
      return document.pages.some((page) => page.id === target.pageId) ? { ok: true } : no('TARGET_NOT_FOUND', target.pageId);
    case 'object': {
      if (preset.payload.kind !== 'style') return no('TARGET_INVALID', target.kind);
      const actions = arsenalStyleActions(document, target.objectId, preset.payload.style);
      return actions.ok ? { ok: true } : no(actions.code, actions.details);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------------------------------------------

export interface ArsenalAssetPlan {
  /** Assets the destination does not have yet and that still load: registered, never copied. */
  readonly register: AssetRef[];
  /** Assets that no longer load: their images become the "Foto a escolher" frame. */
  readonly unavailable: Set<string>;
}

/** Asks the port, once per asset, whether it still loads. Assets already in the catalog are reused as they are. */
export async function planArsenalAssets(payload: ArsenalPayload, document: CatalogDocument, port: Pick<ArsenalInsertionPort, 'isAssetAvailable'>): Promise<ArsenalAssetPlan> {
  if (payload.kind === 'style') return { register: [], unavailable: new Set() };
  const used = new Set(collectArsenalPayloadAssetIds(payload));
  const register: AssetRef[] = [];
  const unavailable = new Set<string>();
  for (const asset of payload.assets) {
    if (!used.has(asset.id) || document.assets.some((existing) => existing.id === asset.id)) continue;
    let available: boolean;
    try {
      available = await port.isAssetAvailable(asset);
    } catch {
      available = false;
    }
    if (available) register.push(asset);
    else unavailable.add(asset.id);
  }
  return { register, unavailable };
}

// ---------------------------------------------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------------------------------------------

function pageContext(document: CatalogDocument, pageId: string): { page: Page; box: Frame } {
  const index = document.pages.findIndex((page) => page.id === pageId);
  const page = document.pages[index];
  return { page, box: arsenalContentBoxMm(page, document.style.pageFooter, index + 1) };
}

const fits = (box: Frame, size: Pick<Frame, 'widthMm' | 'heightMm'>): boolean =>
  size.widthMm <= box.widthMm + 0.0001 && size.heightMm <= box.heightMm + 0.0001;

/** Top-left corner of a block on `pageId` (rules in the module comment). */
export function arsenalBlockOrigin(
  document: CatalogDocument,
  pageId: string,
  payload: Pick<ArsenalBlockPayload, 'frame'>,
  category: ArsenalCategory,
  placement: Extract<ArsenalInsertTarget, { kind: 'page' }>['placement'],
): { xMm: number; yMm: number } {
  const original = { xMm: payload.frame.xMm, yMm: payload.frame.yMm };
  if (placement === 'original') return original;
  const { page, box } = pageContext(document, pageId);
  if (placement !== undefined) return fits(box, payload.frame) ? clampIntoBox(box, placement, payload.frame) : placement;
  if (category === 'cabecalhos' || category === 'rodapes') return original;
  if (!fits(box, payload.frame)) return original;
  const free = findFreePlacement(box, placementObstacles(page, box), payload.frame, { mode: 'center' });
  if (free) return free;
  if (frameInside(payload.frame, box)) return original;
  return { xMm: roundMm(box.xMm + (box.widthMm - payload.frame.widthMm) / 2), yMm: roundMm(box.yMm + (box.heightMm - payload.frame.heightMm) / 2) };
}

/** Frame of a table preset on `pageId`: its size (never wider or taller than the safe area) at the top of the free area. */
export function arsenalTableFrame(
  document: CatalogDocument,
  pageId: string,
  payload: Pick<ArsenalTablePayload, 'sizeMm'>,
  placement: Extract<ArsenalInsertTarget, { kind: 'page' }>['placement'],
): Frame {
  const { page, box } = pageContext(document, pageId);
  const size = {
    widthMm: Math.min(payload.sizeMm.widthMm, box.widthMm),
    heightMm: Math.min(payload.sizeMm.heightMm, box.heightMm),
  };
  const at = placement !== undefined && placement !== 'original'
    ? clampIntoBox(box, placement, size)
    : findFreePlacement(box, placementObstacles(page, box), size, { mode: 'top' }) ?? { xMm: box.xMm, yMm: box.yMm };
  return { ...size, ...at };
}

// ---------------------------------------------------------------------------------------------------------------
// Style presets
// ---------------------------------------------------------------------------------------------------------------

const CELL_STYLE_SCALARS = ['fontFamily', 'fontSizePt', 'lineHeight', 'fontWeight', 'color', 'background', 'textAlign', 'verticalAlign'] as const;
const EDGES = ['top', 'right', 'bottom', 'left'] as const;

/** The patch that turns `current` into exactly `next` (fields `next` lacks are removed). */
export function cellStyleReplacementPatch(current: CellStyle | undefined, next: CellStyle | undefined): CellStylePatch {
  const from = current ?? {}, to = next ?? {};
  const patch: Record<string, unknown> = {};
  for (const key of CELL_STYLE_SCALARS) {
    if (to[key] !== undefined) patch[key] = to[key];
    else if (from[key] !== undefined) patch[key] = null;
  }
  if (to.paddingMm) patch.paddingMm = Object.fromEntries(EDGES.map((edge) => [edge, to.paddingMm?.[edge] ?? null]));
  else if (from.paddingMm) patch.paddingMm = null;
  if (to.borders) patch.borders = Object.fromEntries(EDGES.map((edge) => [edge, to.borders?.[edge] ?? null]));
  else if (from.borders) patch.borders = null;
  return patch as CellStylePatch;
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => sameJson(a[key], b[key]));
}

export type ArsenalStyleActionsResult =
  | { readonly ok: true; readonly actions: ApplicationAction[] }
  | { readonly ok: false; readonly code: Extract<ArsenalInsertErrorCode, 'TARGET_NOT_FOUND' | 'TARGET_INVALID'>; readonly details: string };

/**
 * The editor actions that dress object `objectId` with a style preset. Text: size, weight, colour, alignment, line
 * height and letter spacing (the family stays with the document, as in the text inspector), plus the "Selo" box
 * when the preset has one. Shape, polygon and line: the whole style. Table: base, row-role styles and the gap of
 * the notes. Styles only touch objects the person can change: not locked, and texts and tables outside groups.
 */
export function arsenalStyleActions(document: CatalogDocument, objectId: string, style: ArsenalStyle): ArsenalStyleActionsResult {
  const entry = findObjectInTree(document, objectId);
  if (!entry) return { ok: false, code: 'TARGET_NOT_FOUND', details: objectId };
  const object = entry.object;
  const wanted: StyleTargetType = ARSENAL_STYLE_OBJECT_TYPES[style.target];
  if (object.type !== wanted) return { ok: false, code: 'TARGET_INVALID', details: `${objectId} é ${object.type}, o estilo é de ${wanted}` };
  if (object.locked || entry.parentGroup?.locked) return { ok: false, code: 'TARGET_INVALID', details: `${objectId} está travado` };
  if (entry.parentGroup && (object.type === 'text' || object.type === 'table')) {
    return { ok: false, code: 'TARGET_INVALID', details: `${objectId} está dentro de um grupo` };
  }
  const actions: ApplicationAction[] = [];
  if (style.target === 'text' && object.type === 'text') {
    const adapted = textStyleWithDeclaredFonts(style.text, document.style);
    const family = object.style.fontFamily ?? document.style.defaultText.fontFamily;
    const weightDeclared = adapted.fontWeight === undefined || document.style.fonts.some((font) =>
      font.family === family && font.weight === adapted.fontWeight && font.style === 'normal');
    const patch: TextStylePatch = {
      ...(adapted.fontSizePt !== undefined ? { fontSizePt: adapted.fontSizePt } : {}),
      ...(adapted.fontWeight !== undefined && weightDeclared ? { fontWeight: adapted.fontWeight } : {}),
      ...(adapted.color !== undefined ? { color: adapted.color } : {}),
      ...(adapted.textAlign !== undefined ? { textAlign: adapted.textAlign } : {}),
      ...(adapted.lineHeight !== undefined ? { lineHeight: adapted.lineHeight } : {}),
      ...(adapted.letterSpacingEm !== undefined ? { letterSpacingEm: adapted.letterSpacingEm } : {}),
    };
    if (Object.keys(patch).length > 0) actions.push({ type: 'text.setStyle', objectId, expectedStyle: object.style, patch });
    if (style.box) actions.push({ type: 'text.setBox', objectId, expectedBox: object.box ?? null, box: { ...style.box } });
  } else if (style.target === 'shape' && object.type === 'shape') {
    actions.push({ type: 'shape.setStyle', objectId, expectedStyle: object.style, style: { ...style.shape } });
  } else if (style.target === 'polygon' && object.type === 'polygon') {
    actions.push({ type: 'polygon.setStyle', objectId, expectedStyle: object.style, style: { ...style.polygon } });
  } else if (style.target === 'line' && object.type === 'line') {
    actions.push({ type: 'line.setStyle', objectId, expectedStyle: lineStyleState(object), style: { ...style.line } });
  } else if (style.target === 'table' && object.type === 'table') {
    const table = object.table;
    const next = tableStyleWithDeclaredFonts(style.table, document.style);
    const ids = { pageId: entry.page.id, objectId, tableId: table.id };
    actions.push({
      type: 'table.style.setBase', ...ids,
      expectedBase: table.style.base, expectedAnnotationGapMm: table.style.annotationGapMm,
      patch: cellStyleReplacementPatch(table.style.base, next.base), annotationGapMm: next.annotationGapMm,
    });
    for (const role of ['header', 'body', 'section'] as const) {
      const current = table.style.rowRoles[role];
      if (sameJson(current ?? null, next.rowRoles[role] ?? null)) continue;
      actions.push({
        type: 'table.style.setRowRole', ...ids, role,
        ...(current === undefined ? {} : { expectedStyle: current }),
        patch: cellStyleReplacementPatch(current, next.rowRoles[role]),
      });
    }
  }
  return { ok: true, actions };
}

// ---------------------------------------------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------------------------------------------

/** `object.insert` spec of a leaf at `frame` (page coordinates). */
export function arsenalInsertSpec(object: LeafEditorialObject, frame: Frame, zIndex: number, locked: boolean): ObjectInsertSpec {
  const { id: _id, frame: _frame, hidden: _hidden, zIndex: _zIndex, locked: _locked, ...rest } = object;
  return { ...rest, frameU: frameToCanonicalU(frame), zIndex, ...(locked ? { locked: true } : {}) } as ObjectInsertSpec;
}

/**
 * Objects ready for the destination, in painting order with stacking values 0, 1, 2… and the payload's frames:
 * visible ones only, missing pictures framed, fonts the catalog declares.
 */
export function materializeArsenalObjects(
  objects: readonly EditorialObject[],
  document: Pick<CatalogDocument, 'style'>,
  unavailable: ReadonlySet<string>,
): EditorialObject[] {
  const visible = arsenalVisibleObjects(objects).objects;
  const framed = withPhotoPlaceholders(normalizeStacking(visible), unavailable);
  return normalizeStacking(framed.objects).map((object) => objectWithDeclaredFonts(object, document.style));
}

class StepFailure extends Error {
  constructor(readonly code: string, readonly details: string) {
    super(`${code}: ${details}`);
  }
}

interface Runner {
  /** Runs one action of the transaction; a refusal stops the insertion. */
  run(action: ApplicationAction): ApplicationActionSuccess;
  /** Runs one action that may be refused (nothing changes then): undefined instead of stopping. */
  attempt(action: ApplicationAction): ApplicationActionSuccess | undefined;
  readonly changed: () => boolean;
}

function createRunner(port: ArsenalInsertionPort, transactionId: string): Runner {
  let changed = false;
  const execute = (action: ApplicationAction): ApplicationActionSuccess | ApplicationActionFailure => {
    const result = port.execute(action, { transactionId });
    if (result.ok && result.metadata.changed) changed = true;
    return result;
  };
  return {
    run(action) {
      const result = execute(action);
      if (!result.ok) throw new StepFailure(result.error.code, result.error.details);
      return result;
    },
    attempt(action) {
      const result = execute(action);
      return result.ok ? result : undefined;
    },
    changed: () => changed,
  };
}

function firstCreated(result: ApplicationActionSuccess): string {
  const id = result.metadata.createdIds[0];
  if (!id) throw new StepFailure('ACTION_INVALID', `${result.metadata.actionType} created nothing`);
  return id;
}

/** Inserts objects (painting order) at `origin`, stacked from `baseZ`; groups are rebuilt with `group.create`. */
function insertObjects(runner: Runner, pageId: string, objects: readonly EditorialObject[], origin: { xMm: number; yMm: number }, baseZ: number): string[] {
  const created: string[] = [];
  objects.forEach((object, index) => {
    const zIndex = baseZ + index;
    const frame = translateFrame(object.frame, origin.xMm, origin.yMm);
    if (object.type !== 'group') {
      created.push(firstCreated(runner.run({ type: 'object.insert', pageId, object: arsenalInsertSpec(object, frame, zIndex, Boolean(object.locked)) })));
      return;
    }
    // `group.create` refuses locked members: children go in unlocked and the group takes the lock afterwards.
    const children = object.objects
      .map((child, arrayIndex) => ({ child, arrayIndex }))
      .sort((a, b) => a.child.zIndex - b.child.zIndex || a.arrayIndex - b.arrayIndex)
      .map(({ child }) => firstCreated(runner.run({
        type: 'object.insert', pageId,
        object: arsenalInsertSpec(child, translateFrame(child.frame, frame.xMm, frame.yMm), zIndex, false),
      })));
    const groupId = firstCreated(runner.run({ type: 'group.create', pageId, objectIds: children }));
    if (object.locked) runner.run({ type: 'object.setLocked', objectId: groupId, expectedLocked: false, locked: true });
    created.push(groupId);
  });
  return created;
}

function registerAssets(runner: Runner, assets: readonly AssetRef[]): void {
  for (const asset of assets) runner.run({ type: 'asset.register', asset: { ...asset } });
}

function backgroundFor(payload: ArsenalPagePayload, unavailable: ReadonlySet<string>): PageBackground | undefined {
  const background = payload.background;
  if (!background?.image || !unavailable.has(background.image.assetId)) return background;
  const { image: _image, ...rest } = background;
  return rest.color === undefined ? undefined : rest;
}

interface Inserted {
  readonly pageId: string;
  readonly objectIds: string[];
}

/**
 * A built-in PRESYS page model goes in through `page.template.insert`, exactly like "Usar modelo…", when the open
 * editor knows that model (`builtin:<templateId>`) and its images are ready. Otherwise (no registry, image still to
 * prepare) the template action is refused without changing anything and the page is built from the payload.
 */
function insertBuiltinTemplatePage(runner: Runner, preset: ArsenalPreset, payload: ArsenalPagePayload, target: Extract<ArsenalInsertTarget, { kind: 'new-page' }>, assets: ArsenalAssetPlan): Inserted | undefined {
  if (preset.scope !== 'builtin' || assets.unavailable.size > 0) return undefined;
  const templateId = preset.id.slice(ARSENAL_BUILTIN_ID_PREFIX.length);
  const inserted = runner.attempt({ type: 'page.template.insert', templateId, ...(target.afterPageId === undefined ? {} : { afterPageId: target.afterPageId }) });
  if (!inserted) return undefined;
  const pageId = firstCreated(inserted);
  const page = inserted.document.pages.find((entry) => entry.id === pageId)!;
  if (!sameJson(page.safeArea ?? null, payload.safeArea ?? null)) {
    runner.run({ type: 'page.setSafeArea', pageId, expectedSafeArea: page.safeArea ?? null, safeArea: payload.safeArea ?? null });
  }
  if (payload.background) {
    registerAssets(runner, assets.register);
    runner.run({ type: 'page.setBackground', pageId, expectedBackground: page.background ?? null, background: { ...payload.background } });
  }
  return { pageId, objectIds: page.objects.map((object) => object.id) };
}

function insertPage(runner: Runner, document: CatalogDocument, preset: ArsenalPreset, payload: ArsenalPagePayload, target: Extract<ArsenalInsertTarget, { kind: 'new-page' }>, assets: ArsenalAssetPlan): Inserted {
  const fromTemplate = insertBuiltinTemplatePage(runner, preset, payload, target, assets);
  if (fromTemplate) return fromTemplate;
  const added = runner.run({ type: 'page.add', ...(target.afterPageId === undefined ? {} : { afterPageId: target.afterPageId }) });
  const pageId = firstCreated(added);
  const page = added.document.pages.find((entry) => entry.id === pageId);
  if (!sameJson(page?.safeArea ?? null, payload.safeArea ?? null)) {
    runner.run({ type: 'page.setSafeArea', pageId, expectedSafeArea: page?.safeArea ?? null, safeArea: payload.safeArea ?? null });
  }
  registerAssets(runner, assets.register);
  const background = backgroundFor(payload, assets.unavailable);
  if (background) runner.run({ type: 'page.setBackground', pageId, expectedBackground: null, background: { ...background } });
  const objects = materializeArsenalObjects(payload.objects, document, assets.unavailable);
  return { pageId, objectIds: insertObjects(runner, pageId, objects, { xMm: 0, yMm: 0 }, 0) };
}

function insertBlock(runner: Runner, document: CatalogDocument, preset: ArsenalPreset, payload: ArsenalBlockPayload, target: Extract<ArsenalInsertTarget, { kind: 'page' }>, assets: ArsenalAssetPlan): Inserted {
  const origin = arsenalBlockOrigin(document, target.pageId, payload, preset.category, target.placement);
  const page = document.pages.find((entry) => entry.id === target.pageId)!;
  registerAssets(runner, assets.register);
  const objects = materializeArsenalObjects(payload.objects, document, assets.unavailable);
  return { pageId: target.pageId, objectIds: insertObjects(runner, target.pageId, objects, origin, topZIndex(page) + 1) };
}

/** The table of a preset ready for the destination: missing pictures framed, fonts the catalog declares. */
export function materializeArsenalTable(table: TableModel, document: CatalogDocument, unavailable: ReadonlySet<string>): TableModel {
  return tableWithDeclaredFonts(tableWithPhotoPlaceholders(table, unavailable).table, document.style);
}

function insertTable(runner: Runner, document: CatalogDocument, payload: ArsenalTablePayload, target: Extract<ArsenalInsertTarget, { kind: 'page' }>, assets: ArsenalAssetPlan): Inserted {
  const frame = arsenalTableFrame(document, target.pageId, payload, target.placement);
  const page = document.pages.find((entry) => entry.id === target.pageId)!;
  registerAssets(runner, assets.register);
  const table = materializeArsenalTable(payload.table, document, assets.unavailable);
  const result = runner.run({
    type: 'object.insert', pageId: target.pageId,
    object: { type: 'table', frameU: frameToCanonicalU(frame), zIndex: topZIndex(page) + 1, table },
  });
  return { pageId: target.pageId, objectIds: [firstCreated(result)] };
}

function insertStyle(runner: Runner, document: CatalogDocument, style: ArsenalStyle, target: Extract<ArsenalInsertTarget, { kind: 'object' }>): Inserted {
  const prepared = arsenalStyleActions(document, target.objectId, style);
  if (!prepared.ok) throw new StepFailure(prepared.code, prepared.details);
  for (const action of prepared.actions) runner.run(action);
  return { pageId: findObjectInTree(document, target.objectId)!.page.id, objectIds: [target.objectId] };
}

// ---------------------------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------------------------

/** Puts a preset into the open catalog as one Desfazer step (rules in `insertion.ts`). */
export async function insertArsenalPreset(request: ArsenalInsertRequest, port: ArsenalInsertionPort): Promise<ArsenalInsertResult> {
  const parsed = parseArsenalPreset(request.preset);
  if (!parsed.ok) return refuse(parsed.code === 'UNSUPPORTED_VERSION' ? 'UNSUPPORTED_VERSION' : 'INVALID_PRESET', describeIssues(parsed.issues));
  const preset = parsed.value;
  const { target } = request;
  if (!isArsenalInsertTargetAllowed(preset.kind, target)) return refuse('TARGET_INVALID', `${preset.kind} → ${target.kind}`);
  const first = checkTarget(port.getDocument(), preset, target);
  if (!first.ok) return first.failure;

  const assets = await planArsenalAssets(preset.payload, port.getDocument(), port);

  // The person may have changed the catalog while the images were checked: read it again before any action.
  const document = port.getDocument();
  const again = checkTarget(document, preset, target);
  if (!again.ok) return again.failure;

  const transactionId = port.createTransactionId();
  const runner = createRunner(port, transactionId);
  let inserted: Inserted;
  try {
    const { payload } = preset;
    if (payload.kind === 'page' && target.kind === 'new-page') inserted = insertPage(runner, document, preset, payload, target, assets);
    else if (payload.kind === 'block' && target.kind === 'page') inserted = insertBlock(runner, document, preset, payload, target, assets);
    else if (payload.kind === 'table' && target.kind === 'page') inserted = insertTable(runner, document, payload, target, assets);
    else if (payload.kind === 'style' && target.kind === 'object') inserted = insertStyle(runner, document, payload.style, target);
    else return refuse('TARGET_INVALID', `${payload.kind} → ${target.kind}`);
  } catch (error) {
    const rolledBack = runner.changed() ? port.undo().ok : false;
    const details = error instanceof StepFailure ? `${error.code}: ${error.details}` : error instanceof Error ? error.message : String(error);
    return { ok: false, error: { code: 'ACTION_FAILED', details }, rolledBack };
  }
  return {
    ok: true,
    transactionId,
    pageId: inserted.pageId,
    objectIds: inserted.objectIds,
    placeholders: [...assets.unavailable].map((assetId) => ({ assetId, reason: 'UNAVAILABLE' as const })),
  };
}

export function createArsenalInsertionService(): ArsenalInsertionService {
  return { insert: insertArsenalPreset };
}
