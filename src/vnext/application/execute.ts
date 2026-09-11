import { frameToCanonicalU, mmToU, visualPageObjects, type CatalogDocument, type EditorialObject, type Frame, type GroupObject, type LeafEditorialObject, type Page } from '../domain';
import { add } from '../domain/physical';
import { validateTable } from '../table';
import {
  ApplicationActionSchema,
  type ApplicationAction,
  type ApplicationActionFailure,
  type ApplicationActionResult,
  type ApplicationErrorCode,
  type FrameU,
  type IdGenerator,
  type ObjectInsertSpec,
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

        const frame = materializeFrameU(action.object.frameU);
        if (action.object.type === 'image') {
          const assetId = action.object.assetId;
          if (!document.assets.some((asset) => asset.id === assetId)) {
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
          document,
          insertSpecSeed(action.object, frame),
          dependencies.createId
        );
        candidate = pageWithObjects(document, pageIndex, [...document.pages[pageIndex].objects, object]);
        affectedIds = [action.pageId];
        createdIds = canonicalObjectIdentityIds(object);
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
      case 'image.replace': {
        const location = findObjectLocation(document, action.objectId);
        if (!location) return failure('OBJECT_NOT_FOUND', action.objectId);
        const childFailure = groupedChildMutation(location, action.objectId);
        if (childFailure) return childFailure;
        if (objectLocked(location.object)) return failure('OBJECT_LOCKED', action.objectId);
        if (location.object.type !== 'image') return failure('OBJECT_TYPE_MISMATCH', action.objectId);
        if (!document.assets.some((asset) => asset.id === action.assetId)) return failure('ASSET_NOT_FOUND', action.assetId);
        changed = location.object.assetId !== action.assetId;
        affectedIds = [action.objectId];
        if (!changed) break;

        const next = { ...location.object, assetId: action.assetId };
        candidate = pageWithObjects(
          document,
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
