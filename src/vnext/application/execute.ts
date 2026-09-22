import { AssetRefSchema, frameToCanonicalU, mmToU, visualPageObjects, type AssetRef, type CatalogDocument, type Cell, type CellContent, type EditorialObject, type Frame, type GroupObject, type LeafEditorialObject, type Page, type TableModel, type TableObject } from '../domain';
import { CellContentSchema, type CellContentPresentation, type CellStyle } from '../domain/editorial-model';
import { VNextError } from '../domain/diagnostics';
import { add } from '../domain/physical';
import { deleteAxis, insertAxis, orderedAnchors, validateTable } from '../table';
import {
  ApplicationActionSchema,
  InsertedTableColumnPropertiesSchema,
  InsertedTableRowPropertiesSchema,
  type ApplicationAction,
  type ApplicationActionFailure,
  type ApplicationActionResult,
  type ApplicationErrorCode,
  type FrameU,
  type IdGenerator,
  type ObjectInsertSpec,
  type CellPropertyPatch,
} from './contracts';
import {
  ApplicationDocumentError,
  allocateFreshCanonicalId,
  canonicalIdentityIds,
  canonicalObjectIdentityIds,
  createCanonicalIdAllocator,
  createBlankPage,
  duplicatePageWithFreshIds,
  findObjectLocation,
  instantiateObjectWithFreshIds,
  instantiatePageWithFreshIds,
  objectInstantiationSeedFromObject,
  parseCanonicalDocument,
  type ObjectInstantiationSeed,
} from './document';
import {
  projectEditableRichText,
  reconcileEditableRichText,
  richTextEquals,
} from './text-editing';
import {
  PageTemplateDefinitionError,
  parsePageTemplateDefinition,
  type PageTemplateRegistry,
} from './template-registry';

export interface ApplicationExecutionDependencies {
  createId: IdGenerator;
  templateRegistry?: PageTemplateRegistry;
}

function failure(code: ApplicationErrorCode, details: string): ApplicationActionFailure {
  return { ok: false, error: { code, details } };
}

function documentFailure(error: unknown): ApplicationActionFailure {
  if (error instanceof PageTemplateDefinitionError) {
    return {
      ok: false,
      error: { code: 'ACTION_INVALID', details: error.message, issues: error.issues },
    };
  }
  if (error instanceof ApplicationDocumentError) return failure(error.code, error.message);
  return failure('DOCUMENT_INVALID', error instanceof Error ? error.message : String(error));
}

function validateAction(input: unknown): ApplicationAction | ApplicationActionFailure {
  const parsed = ApplicationActionSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  return {
    ok: false,
    error: {
      code: 'ACTION_INVALID',
      details: 'Application action failed runtime validation',
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    },
  };
}

function isActionFailure(value: ApplicationAction | ApplicationActionFailure): value is ApplicationActionFailure {
  return 'ok' in value && value.ok === false;
}

function materializeU(value: number, label: string, positive = false): number {
  if (!Number.isSafeInteger(value) || (positive && value < 1)) {
    throw new ApplicationDocumentError('INVALID_GEOMETRY', `${label} must be ${positive ? 'a positive ' : ''}safe integer U`);
  }
  const mm = value / 10_000;
  try {
    if (!Number.isFinite(mm) || mmToU(mm) !== value) {
      throw new Error('U/mm roundtrip mismatch');
    }
  } catch (error) {
    throw new ApplicationDocumentError(
      'INVALID_GEOMETRY',
      `${label} cannot be represented canonically: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return mm;
}

function materializeFrameU(frameU: FrameU): Frame {
  return {
    xMm: materializeU(frameU.xU, 'xU'),
    yMm: materializeU(frameU.yU, 'yU'),
    widthMm: materializeU(frameU.widthU, 'widthU', true),
    heightMm: materializeU(frameU.heightU, 'heightU', true),
  };
}

function projectFrameU(frame: Frame): FrameU {
  try {
    return {
      xU: mmToU(frame.xMm),
      yU: mmToU(frame.yMm),
      widthU: mmToU(frame.widthMm),
      heightU: mmToU(frame.heightMm),
    };
  } catch (error) {
    throw new ApplicationDocumentError(
      'DOCUMENT_INVALID',
      `Canonical frame cannot be projected to U: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function pageWithObjects(document: CatalogDocument, pageIndex: number, objects: Page['objects']): CatalogDocument {
  return {
    ...document,
    pages: document.pages.map((page, index) => index === pageIndex ? { ...page, objects } : page),
  };
}

function insertSpecSeed(spec: ObjectInsertSpec, frame: Frame): ObjectInstantiationSeed {
  const base = {
    frame,
    zIndex: spec.zIndex,
    ...(spec.locked === undefined ? {} : { locked: spec.locked }),
  };
  switch (spec.type) {
    case 'text':
      return { ...base, type: 'text', text: spec.text, style: spec.style };
    case 'image':
      return {
        ...base,
        type: 'image',
        assetId: spec.assetId,
        fit: spec.fit,
        ...(spec.focalPoint ? { focalPoint: spec.focalPoint } : {}),
      };
    case 'table':
      return { ...base, type: 'table', table: spec.table };
    case 'shape':
      return { ...base, type: 'shape', shape: spec.shape, style: spec.style };
    case 'line':
      return { ...base, type: 'line', axis: spec.axis, color: spec.color };
    case 'icon':
      return { ...base, type: 'icon', assetId: spec.assetId };
  }
}

function objectLocked(object: { locked?: boolean }): boolean {
  return object.locked === true;
}

function closureLockedId(object: EditorialObject): string | undefined {
  if (object.locked) return object.id;
  if (object.type === 'group') return object.objects.find((child) => child.locked)?.id;
  return undefined;
}

function groupedChildMutation(location: { parentGroup?: GroupObject }, objectId: string): ApplicationActionFailure | undefined {
  return location.parentGroup
    ? failure('ACTION_INVALID', `Direct mutation of grouped child ${objectId} is not supported in W2.F`)
    : undefined;
}

function leafFrameAtPageU(group: GroupObject, child: LeafEditorialObject): FrameU {
  const groupFrame = frameToCanonicalU(group.frame);
  const childFrame = frameToCanonicalU(child.frame);
  return {
    xU: add(groupFrame.xU, childFrame.xU),
    yU: add(groupFrame.yU, childFrame.yU),
    widthU: childFrame.widthU,
    heightU: childFrame.heightU,
  };
}

function validateTemplateObjectBeforeAllocation(
  object: ObjectInstantiationSeed,
  document: CatalogDocument
): ApplicationActionFailure | undefined {
  if (object.type === 'group') {
    for (const child of object.objects) {
      const invalid = validateTemplateObjectBeforeAllocation(child, document);
      if (invalid) return invalid;
    }
    return undefined;
  }
  if ((object.type === 'image' || object.type === 'icon')
      && !document.assets.some((asset) => asset.id === object.assetId)) {
    return failure('ASSET_NOT_FOUND', object.assetId);
  }
  if (object.type === 'table') {
    const diagnostics = validateTable(object.table, document.assets)
      .filter((diagnostic) => diagnostic.severity === 'ERROR');
    if (diagnostics.length > 0) {
      return failure('ACTION_INVALID', diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.details}`).join('; '));
    }
  }
  return undefined;
}

function assetRefEquals(left: AssetRef, right: AssetRef): boolean {
  return (
    left.id === right.id &&
    left.version === right.version &&
    left.sha256 === right.sha256 &&
    left.mime === right.mime &&
    left.widthPx === right.widthPx &&
    left.heightPx === right.heightPx &&
    left.name === right.name &&
    left.alt === right.alt
  );
}

function tableEquals(left: TableModel, right: TableModel): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function tableTarget(
  document: CatalogDocument,
  action: { pageId: string; objectId: string; tableId: string; expectedTable: TableModel }
): { ok: true; object: TableObject; pageIndex: number; objectIndex: number } | ApplicationActionFailure {
  if (!document.pages.some((page) => page.id === action.pageId)) return failure('PAGE_NOT_FOUND', action.pageId);
  const location = findObjectLocation(document, action.objectId);
  if (!location || location.page.id !== action.pageId) {
    return failure('OBJECT_NOT_FOUND', `Table object ${action.objectId} was not found on page ${action.pageId}`);
  }
  if (location.parentGroup) {
    return failure('ACTION_INVALID', `Table ${action.objectId} is inside closed Group ${location.parentGroup.id}; ungroup before editing`);
  }
  if (objectLocked(location.object)) return failure('OBJECT_LOCKED', action.objectId);
  if (location.object.type !== 'table') return failure('OBJECT_TYPE_MISMATCH', `${action.objectId} is not a Table object`);
  if (location.object.table.id !== action.tableId) {
    return failure('TABLE_IDENTITY_MISMATCH', `Expected table ${action.tableId}, found ${location.object.table.id}`);
  }
  if (!tableEquals(location.object.table, action.expectedTable)) {
    return failure('TARGET_STALE', `Table ${action.tableId} changed after the command was prepared`);
  }
  return {
    ok: true,
    object: location.object,
    pageIndex: location.pageIndex,
    objectIndex: location.objectIndex,
  };
}

function tableCellTarget(
  document: CatalogDocument,
  action: { pageId: string; objectId: string; tableId: string }
): { ok: true; object: TableObject; pageIndex: number; objectIndex: number } | ApplicationActionFailure {
  if (!document.pages.some((page) => page.id === action.pageId)) return failure('PAGE_NOT_FOUND', action.pageId);
  const location = findObjectLocation(document, action.objectId);
  if (!location || location.page.id !== action.pageId) {
    return failure('OBJECT_NOT_FOUND', `Table object ${action.objectId} was not found on page ${action.pageId}`);
  }
  if (location.parentGroup) {
    return failure('ACTION_INVALID', `Table ${action.objectId} is inside closed Group ${location.parentGroup.id}; ungroup before editing`);
  }
  if (objectLocked(location.object)) return failure('OBJECT_LOCKED', action.objectId);
  if (location.object.type !== 'table') return failure('OBJECT_TYPE_MISMATCH', `${action.objectId} is not a Table object`);
  if (location.object.table.id !== action.tableId) {
    return failure('TABLE_IDENTITY_MISMATCH', `Expected table ${action.tableId}, found ${location.object.table.id}`);
  }
  return { ok: true, object: location.object, pageIndex: location.pageIndex, objectIndex: location.objectIndex };
}

function exactEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function own(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function applyCellPropertyPatch(
  cell: Cell,
  patch: CellPropertyPatch
): Cell {
  const style: CellStyle = { ...(cell.style ?? {}) };
  for (const key of ['textAlign', 'fontWeight', 'color', 'background'] as const) {
    if (!own(patch, key)) continue;
    const value = patch[key];
    if (value === null) delete style[key];
    else if (value !== undefined) (style as Record<string, unknown>)[key] = value;
  }
  if (own(patch, 'paddingMm')) {
    if (patch.paddingMm === null) {
      delete style.paddingMm;
    } else if (patch.paddingMm !== undefined) {
      const padding = { ...(style.paddingMm ?? {}) };
      for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
        if (!own(patch.paddingMm, edge)) continue;
        const value = patch.paddingMm[edge];
        if (value === null) delete padding[edge];
        else if (value !== undefined) padding[edge] = value;
      }
      if (Object.keys(padding).length === 0) delete style.paddingMm;
      else style.paddingMm = padding;
    }
  }

  const presentation: CellContentPresentation = { ...(cell.contentPresentation ?? {}) };
  if (own(patch, 'wrapPolicy')) {
    if (patch.wrapPolicy === null) delete presentation.wrapPolicy;
    else if (patch.wrapPolicy !== undefined) presentation.wrapPolicy = patch.wrapPolicy;
  }

  const next: Cell = { ...cell };
  if (Object.keys(style).length === 0) delete next.style;
  else next.style = style;
  if (Object.keys(presentation).length === 0) delete next.contentPresentation;
  else next.contentPresentation = presentation;
  return next;
}

function replaceTableObject(
  document: CatalogDocument,
  target: { object: TableObject; pageIndex: number; objectIndex: number },
  table: TableModel
): CatalogDocument {
  const page = document.pages[target.pageIndex];
  return pageWithObjects(
    document,
    target.pageIndex,
    page.objects.map((object, index) => index === target.objectIndex ? { ...target.object, table } : object)
  );
}

function tableOperationFailure(error: unknown, axisId: string): ApplicationActionFailure {
  if (!(error instanceof VNextError)) return documentFailure(error);
  switch (error.code) {
    case 'AXIS_NOT_FOUND':
      return failure('TABLE_AXIS_NOT_FOUND', `Axis ${axisId} no longer exists`);
    case 'TABLE_LAST_AXIS':
      return failure('TABLE_LAST_AXIS', 'A table must keep at least one row and one column');
    case 'MERGE_INTERSECTION':
      return failure('MERGE_INTERSECTION', `Axis ${axisId} intersects a merged span; unmerge explicitly before removing it`);
    case 'MERGE_HEADER_BOUNDARY':
      return failure('MERGE_HEADER_BOUNDARY', 'The inserted row would make a span cross the header/body boundary');
    default:
      return documentFailure(error);
  }
}

function rowInsertionCrossesHeaderBoundary(table: TableModel, at: number, role: 'header' | 'body'): boolean {
  for (const anchor of orderedAnchors(table)) {
    const span = anchor.span?.rows ?? 1;
    if (span === 1) continue;
    const start = table.rows.findIndex((row) => row.id === anchor.rowId);
    if (at > start && at < start + span) {
      const anchorIsHeader = table.rows[start].role === 'header';
      if ((role === 'header') !== anchorIsHeader) return true;
    }
  }
  return false;
}

export function executeApplicationAction(
  inputDocument: CatalogDocument,
  inputAction: unknown,
  dependencies: ApplicationExecutionDependencies
): ApplicationActionResult {
  let document: CatalogDocument;
  try {
    document = parseCanonicalDocument(inputDocument);
  } catch (error) {
    return documentFailure(error);
  }

  const action = validateAction(inputAction);
  if (isActionFailure(action)) return action;

  let candidate: CatalogDocument = document;
  let affectedIds: string[] = [];
  let createdIds: string[] = [];
  let changed = true;

  try {
    switch (action.type) {
      case 'document.rename':
        changed = action.title !== document.title;
        candidate = changed ? { ...document, title: action.title } : document;
        affectedIds = [document.id];
        break;
      case 'page.add': {
        const insertAt = action.afterPageId === undefined
          ? document.pages.length
          : document.pages.findIndex((entry) => entry.id === action.afterPageId) + 1;
        if (action.afterPageId !== undefined && insertAt === 0) return failure('PAGE_NOT_FOUND', action.afterPageId);
        const page = createBlankPage(document, dependencies.createId);
        candidate = {
          ...document,
          pages: [...document.pages.slice(0, insertAt), page, ...document.pages.slice(insertAt)],
        };
        affectedIds = [document.id];
        createdIds = [page.id];
        break;
      }
      case 'page.template.insert': {
        const rawTemplate = dependencies.templateRegistry?.get(action.templateId);
        if (!rawTemplate) return failure('TEMPLATE_NOT_FOUND', action.templateId);
        const template = parsePageTemplateDefinition(rawTemplate);
        if (template.id !== action.templateId) {
          return {
            ok: false,
            error: {
              code: 'ACTION_INVALID',
              details: `Template registry returned "${template.id}" for "${action.templateId}"`,
              issues: [{ path: 'templateId', message: 'Registry lookup identity mismatch' }],
            },
          };
        }
        const insertAt = action.afterPageId === undefined
          ? document.pages.length
          : document.pages.findIndex((entry) => entry.id === action.afterPageId) + 1;
        if (action.afterPageId !== undefined && insertAt === 0) return failure('PAGE_NOT_FOUND', action.afterPageId);
        for (const object of template.objects) {
          const invalid = validateTemplateObjectBeforeAllocation(object, document);
          if (invalid) return invalid;
        }
        const page = instantiatePageWithFreshIds(document, template, dependencies.createId);
        candidate = {
          ...document,
          pages: [...document.pages.slice(0, insertAt), page, ...document.pages.slice(insertAt)],
        };
        affectedIds = [document.id];
        createdIds = [page.id, ...page.objects.flatMap((object) => canonicalObjectIdentityIds(object))];
        break;
      }
      case 'page.duplicate': {
        const sourceIndex = document.pages.findIndex((page) => page.id === action.pageId);
        if (sourceIndex < 0) return failure('PAGE_NOT_FOUND', action.pageId);
        const page = duplicatePageWithFreshIds(document, document.pages[sourceIndex], dependencies.createId);
        candidate = {
          ...document,
          pages: [
            ...document.pages.slice(0, sourceIndex + 1),
            page,
            ...document.pages.slice(sourceIndex + 1),
          ],
        };
        affectedIds = [action.pageId];
        const before = new Set(canonicalIdentityIds(document));
        createdIds = canonicalIdentityIds({ ...document, pages: [page] }).filter((id) => !before.has(id));
        break;
      }
      case 'page.delete': {
        const pageIndex = document.pages.findIndex((page) => page.id === action.pageId);
        if (pageIndex < 0) return failure('PAGE_NOT_FOUND', action.pageId);
        if (document.pages.length === 1) return failure('LAST_PAGE_REQUIRED', action.pageId);
        candidate = { ...document, pages: document.pages.filter((page) => page.id !== action.pageId) };
        affectedIds = [action.pageId];
        break;
      }
      case 'page.reorder': {
        const currentIndex = document.pages.findIndex((page) => page.id === action.pageId);
        if (currentIndex < 0) return failure('PAGE_NOT_FOUND', action.pageId);
        if (action.targetIndex >= document.pages.length) {
          return failure('INVALID_REORDER_TARGET', String(action.targetIndex));
        }
        changed = currentIndex !== action.targetIndex;
        if (changed) {
          const pages = [...document.pages];
          const [page] = pages.splice(currentIndex, 1);
          pages.splice(action.targetIndex, 0, page);
          candidate = { ...document, pages };
        }
        affectedIds = [action.pageId];
        break;
      }
      case 'group.create': {
        const pageIndex = document.pages.findIndex((page) => page.id === action.pageId);
        if (pageIndex < 0) return failure('PAGE_NOT_FOUND', action.pageId);
        const page = document.pages[pageIndex];
        const locations = action.objectIds.map((objectId) => ({ objectId, location: findObjectLocation(document, objectId) }));
        const missing = locations.find(({ location }) => !location);
        if (missing) return failure('OBJECT_NOT_FOUND', missing.objectId);
        const wrongPage = locations.find(({ location }) => location!.page.id !== action.pageId);
        if (wrongPage) return failure('ACTION_INVALID', `Selected object ${wrongPage.objectId} does not belong to page ${action.pageId}`);
        const nested = locations.find(({ location }) => location!.parentGroup);
        if (nested) return failure('ACTION_INVALID', `Selected object ${nested.objectId} is already inside a Group`);
        const selectedGroup = locations.find(({ location }) => location!.object.type === 'group');
        if (selectedGroup) return failure('ACTION_INVALID', 'Group cannot contain another Group');
        const locked = locations.find(({ location }) => location!.object.locked);
        if (locked) return failure('OBJECT_LOCKED', locked.objectId);

        const selectedIds = new Set(action.objectIds);
        const visual = visualPageObjects(page);
        const selectedVisual = visual.filter(({ object }) => selectedIds.has(object.id));
        if (selectedVisual.length !== action.objectIds.length) return failure('ACTION_INVALID', 'Selected objects must be top-level page objects');
        const firstVisualIndex = selectedVisual[0].visualIndex;
        const lastVisualIndex = selectedVisual[selectedVisual.length - 1].visualIndex;
        if (lastVisualIndex - firstVisualIndex + 1 !== selectedVisual.length
            || visual.slice(firstVisualIndex, lastVisualIndex + 1).some(({ object }) => !selectedIds.has(object.id))) {
          return failure('ACTION_INVALID', 'Selected objects must form one contiguous visual block');
        }

        const ordered = visual.slice(firstVisualIndex, lastVisualIndex + 1);
        const framesU = ordered.map(({ object }) => frameToCanonicalU(object.frame));
        const minXU = Math.min(...framesU.map((frame) => frame.xU));
        const minYU = Math.min(...framesU.map((frame) => frame.yU));
        const maxRightU = Math.max(...framesU.map((frame) => add(frame.xU, frame.widthU)));
        const maxBottomU = Math.max(...framesU.map((frame) => add(frame.yU, frame.heightU)));
        const groupFrameU: FrameU = {
          xU: minXU,
          yU: minYU,
          widthU: add(maxRightU, -minXU),
          heightU: add(maxBottomU, -minYU),
        };
        const childObjects: LeafEditorialObject[] = ordered.map(({ object }, index) => {
          if (object.type === 'group') throw new ApplicationDocumentError('ACTION_INVALID', 'Nested Group is forbidden');
          const frameU = frameToCanonicalU(object.frame);
          return {
            ...object,
            zIndex: index,
            frame: materializeFrameU({
              xU: add(frameU.xU, -minXU),
              yU: add(frameU.yU, -minYU),
              widthU: frameU.widthU,
              heightU: frameU.heightU,
            }),
          };
        });

        const first = ordered[0];
        const group: GroupObject = {
          id: allocateFreshCanonicalId(document, dependencies.createId),
          type: 'group',
          frame: materializeFrameU(groupFrameU),
          zIndex: first.object.zIndex,
          objects: childObjects,
        };
        const selectedArrayIndexes = new Set(ordered.map(({ arrayIndex }) => arrayIndex));
        const groupedObjects = page.objects.filter((_, index) => !selectedArrayIndexes.has(index));
        const insertionIndex = page.objects.slice(0, first.arrayIndex).filter((_, index) => !selectedArrayIndexes.has(index)).length;
        groupedObjects.splice(insertionIndex, 0, group);
        candidate = pageWithObjects(document, pageIndex, groupedObjects);
        affectedIds = action.objectIds;
        createdIds = [group.id];
        break;
      }
      case 'group.ungroup': {
        const location = findObjectLocation(document, action.groupId);
        if (!location) return failure('OBJECT_NOT_FOUND', action.groupId);
        if (location.parentGroup || location.object.type !== 'group') return failure('OBJECT_TYPE_MISMATCH', action.groupId);
        const lockedId = closureLockedId(location.object);
        if (lockedId) return failure('OBJECT_LOCKED', lockedId);
        const group = location.object;
        const children = group.objects
          .map((object, arrayIndex) => ({ object, arrayIndex }))
          .sort((left, right) => left.object.zIndex - right.object.zIndex || left.arrayIndex - right.arrayIndex)
          .map(({ object }) => ({
            ...object,
            zIndex: group.zIndex,
            frame: materializeFrameU(leafFrameAtPageU(group, object)),
          }));
        const objects = [...location.page.objects];
        objects.splice(location.objectIndex, 1, ...children);
        candidate = pageWithObjects(document, location.pageIndex, objects);
        affectedIds = [group.id, ...children.map((child) => child.id)];
        createdIds = [];
        break;
      }
      case 'object.insert': {
        const pageIndex = document.pages.findIndex((page) => page.id === action.pageId);
        if (pageIndex < 0) return failure('PAGE_NOT_FOUND', action.pageId);

        let addedAssetId: string | undefined;
        const frame = materializeFrameU(action.object.frameU);
        if (action.object.type === 'image') {
          const assetId = action.object.assetId;
          const suppliedAsset = action.object.asset;
          if (suppliedAsset) {
            if (suppliedAsset.id !== assetId) return failure('ACTION_INVALID', 'Image asset identity mismatch');
            const existing = candidate.assets.find((asset) => asset.id === assetId);
            if (existing && !assetRefEquals(existing, suppliedAsset)) {
              return failure('ACTION_INVALID', `Asset ID ${assetId} already exists with divergent metadata`);
            }
            if (!existing) {
              candidate = { ...candidate, assets: [...candidate.assets, suppliedAsset] };
              addedAssetId = assetId;
            }
          }
          if (!candidate.assets.some((asset) => asset.id === assetId)) {
            return failure('ASSET_NOT_FOUND', assetId);
          }
        }
        if (action.object.type === 'icon') {
          const assetId = action.object.assetId;
          if (!document.assets.some((asset) => asset.id === assetId)) {
            return failure('ASSET_NOT_FOUND', assetId);
          }
        }
        if (action.object.type === 'table') {
          const diagnostics = validateTable(action.object.table, document.assets)
            .filter((diagnostic) => diagnostic.severity === 'ERROR');
          if (diagnostics.length > 0) {
            return failure('ACTION_INVALID', diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.details}`).join('; '));
          }
        }

        const object = instantiateObjectWithFreshIds(
          candidate,
          insertSpecSeed(action.object, frame),
          dependencies.createId
        );
        candidate = pageWithObjects(candidate, pageIndex, [...candidate.pages[pageIndex].objects, object]);
        affectedIds = [action.pageId];
        createdIds = canonicalObjectIdentityIds(object);
        if (addedAssetId) createdIds.push(addedAssetId);
        break;
      }
      case 'object.delete': {
        const location = findObjectLocation(document, action.objectId);
        if (!location) return failure('OBJECT_NOT_FOUND', action.objectId);
        const childFailure = groupedChildMutation(location, action.objectId);
        if (childFailure) return childFailure;
        const lockedId = closureLockedId(location.object);
        if (lockedId) return failure('OBJECT_LOCKED', lockedId);
        candidate = pageWithObjects(
          document,
          location.pageIndex,
          location.page.objects.filter((_, index) => index !== location.objectIndex)
        );
        affectedIds = [action.objectId];
        break;
      }
      case 'object.duplicate': {
        const location = findObjectLocation(document, action.objectId);
        if (!location) return failure('OBJECT_NOT_FOUND', action.objectId);
        const childFailure = groupedChildMutation(location, action.objectId);
        if (childFailure) return childFailure;
        const lockedId = closureLockedId(location.object);
        if (lockedId) return failure('OBJECT_LOCKED', lockedId);

        const frame: Frame = { ...location.object.frame };
        if (action.xU !== undefined) frame.xMm = materializeU(action.xU, 'xU');
        if (action.yU !== undefined) frame.yMm = materializeU(action.yU, 'yU');

        const sourceSeed = objectInstantiationSeedFromObject(location.object);
        const duplicate = instantiateObjectWithFreshIds(
          document,
          { ...sourceSeed, frame } as ObjectInstantiationSeed,
          dependencies.createId
        );
        const objects = [...location.page.objects];
        objects.splice(location.objectIndex + 1, 0, duplicate);
        candidate = pageWithObjects(document, location.pageIndex, objects);
        affectedIds = [action.objectId];
        createdIds = canonicalObjectIdentityIds(duplicate);
        break;
      }
      case 'object.move': {
        const location = findObjectLocation(document, action.objectId);
        if (!location) return failure('OBJECT_NOT_FOUND', action.objectId);
        const childFailure = groupedChildMutation(location, action.objectId);
        if (childFailure) return childFailure;
        const lockedId = closureLockedId(location.object);
        if (lockedId) return failure('OBJECT_LOCKED', lockedId);
        const current = projectFrameU(location.object.frame);
        changed = current.xU !== action.xU || current.yU !== action.yU;
        affectedIds = [action.objectId];
        if (!changed) break;

        const next = {
          ...location.object,
          frame: {
            ...location.object.frame,
            xMm: materializeU(action.xU, 'xU'),
            yMm: materializeU(action.yU, 'yU'),
          },
        };
        candidate = pageWithObjects(
          document,
          location.pageIndex,
          location.page.objects.map((object, index) => index === location.objectIndex ? next : object)
        );
        break;
      }
      case 'object.resize': {
        const location = findObjectLocation(document, action.objectId);
        if (!location) return failure('OBJECT_NOT_FOUND', action.objectId);
        const childFailure = groupedChildMutation(location, action.objectId);
        if (childFailure) return childFailure;
        if (location.object.type === 'group') return failure('ACTION_INVALID', 'Group resize is not supported in W2.F');
        if (objectLocked(location.object)) return failure('OBJECT_LOCKED', action.objectId);
        const current = projectFrameU(location.object.frame);
        changed = current.xU !== action.xU || current.yU !== action.yU ||
          current.widthU !== action.widthU || current.heightU !== action.heightU;
        affectedIds = [action.objectId];
        if (!changed) break;

        const next = { ...location.object, frame: materializeFrameU(action) };
        candidate = pageWithObjects(
          document,
          location.pageIndex,
          location.page.objects.map((object, index) => index === location.objectIndex ? next : object)
        );
        break;
      }
      case 'object.reorder': {
        const location = findObjectLocation(document, action.objectId);
        if (!location) return failure('OBJECT_NOT_FOUND', action.objectId);
        const childFailure = groupedChildMutation(location, action.objectId);
        if (childFailure) return childFailure;
        const lockedId = closureLockedId(location.object);
        if (lockedId) return failure('OBJECT_LOCKED', lockedId);
        const page = location.page;
        if (action.targetIndex >= page.objects.length) {
          return failure('INVALID_Z_ORDER_TARGET', String(action.targetIndex));
        }

        const visual = page.objects
          .map((object, arrayIndex) => ({ object, arrayIndex }))
          .sort((left, right) => left.object.zIndex === right.object.zIndex
            ? left.arrayIndex - right.arrayIndex
            : left.object.zIndex < right.object.zIndex ? -1 : 1);
        const currentVisualIndex = visual.findIndex((entry) => entry.object.id === action.objectId);
        changed = currentVisualIndex !== action.targetIndex;
        affectedIds = [action.objectId];
        if (!changed) break;

        const ordered = visual.map((entry) => entry.object);
        const [moved] = ordered.splice(currentVisualIndex, 1);
        ordered.splice(action.targetIndex, 0, moved);

        const before = new Map(page.objects.map((object, arrayIndex) => [
          object.id,
          { arrayIndex, zIndex: object.zIndex },
        ]));
        const normalized = ordered.map((object, arrayIndex) => object.zIndex === arrayIndex
          ? object
          : { ...object, zIndex: arrayIndex });
        const lockedMutation = normalized.find((object, arrayIndex) => {
          if (!objectLocked(object)) return false;
          const prior = before.get(object.id)!;
          return prior.arrayIndex !== arrayIndex || prior.zIndex !== object.zIndex;
        });
        if (lockedMutation) return failure('OBJECT_LOCKED', lockedMutation.id);
        affectedIds = normalized
          .filter((object, arrayIndex) => {
            const prior = before.get(object.id)!;
            return prior.arrayIndex !== arrayIndex || prior.zIndex !== object.zIndex;
          })
          .map((object) => object.id);
        candidate = pageWithObjects(document, location.pageIndex, normalized);
        break;
      }
      case 'asset.register': {
        const parsedAsset = AssetRefSchema.safeParse(action.asset);
        if (!parsedAsset.success) {
          return failure('ACTION_INVALID', parsedAsset.error.message);
        }
        const existing = candidate.assets.find((asset) => asset.id === action.asset.id);
        if (existing) {
          if (assetRefEquals(existing, action.asset)) {
            changed = false;
            affectedIds = [action.asset.id];
            break;
          }
          return failure('ACTION_INVALID', `Asset ID ${action.asset.id} already exists with divergent metadata`);
        }
        candidate = {
          ...candidate,
          assets: [...candidate.assets, action.asset],
        };
        changed = true;
        affectedIds = [action.asset.id];
        createdIds = [action.asset.id];
        break;
      }
      case 'image.replace': {
        const replacementAsset = action.asset;
        let assetAdded = false;
        if (replacementAsset !== undefined) {
          if (replacementAsset.id !== action.assetId) {
            return failure('ACTION_INVALID', `Action assetId ${action.assetId} does not match asset payload id ${replacementAsset.id}`);
          }
          const parsedAsset = AssetRefSchema.safeParse(replacementAsset);
          if (!parsedAsset.success) {
            return failure('ACTION_INVALID', parsedAsset.error.message);
          }
          const existing = candidate.assets.find((asset) => asset.id === replacementAsset.id);
          if (existing) {
            if (!assetRefEquals(existing, replacementAsset)) {
              return failure('ACTION_INVALID', `Asset ID ${replacementAsset.id} already exists with divergent metadata`);
            }
          } else {
            candidate = {
              ...candidate,
              assets: [...candidate.assets, replacementAsset],
            };
            assetAdded = true;
            createdIds = [replacementAsset.id];
          }
        }

        const location = findObjectLocation(candidate, action.objectId);
        if (!location) return failure('OBJECT_NOT_FOUND', action.objectId);
        const childFailure = groupedChildMutation(location, action.objectId);
        if (childFailure) return childFailure;
        if (objectLocked(location.object)) return failure('OBJECT_LOCKED', action.objectId);
        if (location.object.type !== 'image') return failure('OBJECT_TYPE_MISMATCH', action.objectId);
        if (!candidate.assets.some((asset) => asset.id === action.assetId)) return failure('ASSET_NOT_FOUND', action.assetId);

        const imageChanged = location.object.assetId !== action.assetId;
        changed = assetAdded || imageChanged;
        affectedIds = action.asset !== undefined ? [action.objectId, action.asset.id] : [action.objectId];
        if (!imageChanged) break;

        const next = { ...location.object, assetId: action.assetId };
        candidate = pageWithObjects(
          candidate,
          location.pageIndex,
          location.page.objects.map((object, index) => index === location.objectIndex ? next : object)
        );
        break;
      }
      case 'text.setContent': {
        const location = findObjectLocation(document, action.objectId);
        if (!location) return failure('OBJECT_NOT_FOUND', action.objectId);
        const childFailure = groupedChildMutation(location, action.objectId);
        if (childFailure) return childFailure;
        if (objectLocked(location.object)) return failure('OBJECT_LOCKED', action.objectId);
        if (location.object.type !== 'text') return failure('OBJECT_TYPE_MISMATCH', action.objectId);
        if (!richTextEquals(location.object.text, action.expectedText)) {
          return failure('ACTION_INVALID', `Stale text edit for ${action.objectId}`);
        }
        if (projectEditableRichText(location.object.text) === null) {
          return failure('ACTION_INVALID', `Text ${action.objectId} is outside the W2.G direct-editable RichText subset`);
        }

        const reconciled = reconcileEditableRichText(
          location.object.text,
          action.plainText,
          createCanonicalIdAllocator(document, dependencies.createId)
        );
        if (!reconciled) {
          return failure('ACTION_INVALID', `Text ${action.objectId} is outside the W2.G direct-editable RichText subset`);
        }
        affectedIds = [action.objectId];
        createdIds = [...reconciled.createdIds];
        changed = !richTextEquals(location.object.text, reconciled.richText);
        if (!changed) break;

        const next = { ...location.object, text: reconciled.richText };
        candidate = pageWithObjects(
          document,
          location.pageIndex,
          location.page.objects.map((object, index) => index === location.objectIndex ? next : object)
        );
        break;
      }
      case 'table.cell.setContent': {
        const target = tableCellTarget(document, action);
        if (!target.ok) return target;
        const table = target.object.table;
        const cell = table.cells.find((entry) => entry.id === action.cellId);
        if (!cell) return failure('ACTION_INVALID', `Cell ${action.cellId} no longer exists`);
        if (cell.coveredBy) return failure('ACTION_INVALID', `Cell ${action.cellId} is covered by anchor ${cell.coveredBy}`);
        if (!exactEquals(cell.content, action.expectedContent)) {
          return failure('TARGET_STALE', `Cell ${action.cellId} content changed after the command was prepared`);
        }
        if (cell.content.type === 'marker' || cell.content.type === 'image') {
          return failure('ACTION_INVALID', `Cell ${action.cellId} content type ${cell.content.type} is read-only in W4.B`);
        }
        if (cell.content.type !== action.content.type && action.allowTypeChange !== true) {
          return failure('ACTION_INVALID', `Changing cell content type requires explicit destructive intent`);
        }

        const allocator = createCanonicalIdAllocator(document, dependencies.createId);
        let nextContent: CellContent;
        if (action.content.type === 'richText') {
          if (cell.content.type === 'richText' && projectEditableRichText(cell.content.value) === null) {
            return failure('ACTION_INVALID', `Cell ${action.cellId} RichText is outside the W2.G direct-editable subset`);
          }
          const current = cell.content.type === 'richText' ? cell.content.value : { paragraphs: [] };
          const reconciled = reconcileEditableRichText(current, action.content.plainText, allocator);
          if (!reconciled) {
            return failure('ACTION_INVALID', `Cell ${action.cellId} RichText is outside the W2.G direct-editable subset`);
          }
          nextContent = { type: 'richText', value: reconciled.richText };
          createdIds = [...reconciled.createdIds];
        } else if (action.content.type === 'empty') {
          nextContent = { type: 'empty' };
        } else if (action.content.type === 'technicalCode') {
          nextContent = { type: 'technicalCode', value: action.content.value };
        } else {
          nextContent = {
            type: 'measurement',
            valueText: action.content.valueText,
            unit: action.content.unit,
            ...(action.content.qualifier === undefined ? {} : { qualifier: action.content.qualifier }),
          };
        }

        const parsedContent = CellContentSchema.safeParse(nextContent);
        if (!parsedContent.success) {
          return {
            ok: false,
            error: {
              code: 'ACTION_INVALID',
              details: `Invalid cell content for ${action.cellId}`,
              issues: parsedContent.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
            },
          };
        }
        changed = !exactEquals(cell.content, parsedContent.data);
        affectedIds = [action.objectId, action.tableId, action.cellId];
        if (!changed) {
          createdIds = [];
          break;
        }
        const nextTable: TableModel = {
          ...table,
          cells: table.cells.map((entry) => entry.id === cell.id ? { ...entry, content: parsedContent.data } : entry),
        };
        candidate = replaceTableObject(document, target, nextTable);
        break;
      }
      case 'table.cell.setProperties': {
        const target = tableCellTarget(document, action);
        if (!target.ok) return target;
        const table = target.object.table;
        const selected = action.targets.map((snapshot) => ({
          snapshot,
          cell: table.cells.find((entry) => entry.id === snapshot.cellId),
        }));
        const missing = selected.find((entry) => !entry.cell);
        if (missing) return failure('ACTION_INVALID', `Cell ${missing.snapshot.cellId} no longer exists`);
        const covered = selected.find((entry) => entry.cell!.coveredBy);
        if (covered) return failure('ACTION_INVALID', `Cell ${covered.snapshot.cellId} is covered and cannot be styled directly`);
        const stale = selected.find(({ snapshot, cell }) =>
          !exactEquals(cell!.style, snapshot.expectedStyle)
          || !exactEquals(cell!.contentPresentation, snapshot.expectedContentPresentation)
        );
        if (stale) {
          return failure('TARGET_STALE', `Cell ${stale.snapshot.cellId} properties changed after the command was prepared`);
        }

        const byId = new Map(selected.map(({ snapshot, cell }) => [snapshot.cellId, applyCellPropertyPatch(cell!, action.patch)]));
        const nextCells = table.cells.map((cell) => byId.get(cell.id) ?? cell);
        changed = selected.some(({ cell }) => !exactEquals(cell, byId.get(cell!.id)));
        affectedIds = [action.objectId, action.tableId, ...action.targets.map((entry) => entry.cellId)];
        if (!changed) break;
        candidate = replaceTableObject(document, target, { ...table, cells: nextCells });
        break;
      }
      case 'table.axis.insert': {
        const target = tableTarget(document, action);
        if (!target.ok) return target;
        const table = target.object.table;
        const items = action.axis === 'row' ? table.rows : table.columns;
        const referenceIndex = items.findIndex((item) => item.id === action.referenceAxisId);
        if (referenceIndex < 0) return failure('TABLE_AXIS_NOT_FOUND', `Reference axis ${action.referenceAxisId} no longer exists`);
        const at = referenceIndex + (action.position === 'after' ? 1 : 0);
        if (action.axis === 'row') {
          const properties = InsertedTableRowPropertiesSchema.parse(action.properties);
          if (rowInsertionCrossesHeaderBoundary(table, at, properties.role)) {
            return failure('MERGE_HEADER_BOUNDARY', 'The inserted row would make a span cross the header/body boundary');
          }
        } else {
          InsertedTableColumnPropertiesSchema.parse(action.properties);
        }

        const allocator = createCanonicalIdAllocator(document, dependencies.createId);
        const axisId = allocator.next();
        const cells: Cell[] = (action.axis === 'row' ? table.columns : table.rows).map((item) => ({
          id: allocator.next(),
          rowId: action.axis === 'row' ? axisId : item.id,
          columnId: action.axis === 'column' ? axisId : item.id,
          content: { type: 'empty' },
        }));
        let nextTable: TableModel;
        try {
          const axisItem = action.axis === 'row'
            ? { id: axisId, ...InsertedTableRowPropertiesSchema.parse(action.properties) }
            : { id: axisId, ...InsertedTableColumnPropertiesSchema.parse(action.properties) };
          nextTable = insertAxis(table, action.axis, at, axisItem, cells);
        } catch (error) {
          return tableOperationFailure(error, action.referenceAxisId);
        }
        const changedAnchorIds = nextTable.cells
          .filter((cell) => table.cells.find((before) => before.id === cell.id && before.span !== cell.span))
          .map((cell) => cell.id);
        candidate = replaceTableObject(document, target, nextTable);
        affectedIds = [action.objectId, action.tableId, action.referenceAxisId, ...changedAnchorIds];
        createdIds = [axisId, ...cells.map((cell) => cell.id)];
        break;
      }
      case 'table.axis.remove': {
        const target = tableTarget(document, action);
        if (!target.ok) return target;
        const table = target.object.table;
        const items = action.axis === 'row' ? table.rows : table.columns;
        if (!items.some((item) => item.id === action.axisId)) {
          return failure('TABLE_AXIS_NOT_FOUND', `Axis ${action.axisId} no longer exists`);
        }
        const removedCellIds = table.cells
          .filter((cell) => (action.axis === 'row' ? cell.rowId : cell.columnId) === action.axisId)
          .map((cell) => cell.id);
        let nextTable: TableModel;
        try {
          nextTable = deleteAxis(table, action.axis, action.axisId);
        } catch (error) {
          return tableOperationFailure(error, action.axisId);
        }
        candidate = replaceTableObject(document, target, nextTable);
        affectedIds = [action.objectId, action.tableId, action.axisId, ...removedCellIds];
        break;
      }
    }

    const validated = parseCanonicalDocument(candidate);
    return {
      ok: true,
      document: validated,
      metadata: {
        actionType: action.type,
        affectedIds,
        createdIds,
        changed,
      },
    };
  } catch (error) {
    return documentFailure(error);
  }
}
