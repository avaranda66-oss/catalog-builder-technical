import type { CatalogDocument } from '../domain';
import {
  ApplicationActionSchema,
  type ApplicationAction,
  type ApplicationActionFailure,
  type ApplicationActionResult,
  type ApplicationErrorCode,
  type IdGenerator,
} from './contracts';
import {
  ApplicationDocumentError,
  canonicalIdentityIds,
  createBlankPage,
  duplicatePageWithFreshIds,
  parseCanonicalDocument,
} from './document';

function failure(code: ApplicationErrorCode, details: string): ApplicationActionFailure {
  return { ok: false, error: { code, details } };
}

function documentFailure(error: unknown): ApplicationActionFailure {
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

export function executeApplicationAction(
  inputDocument: CatalogDocument,
  inputAction: unknown,
  dependencies: { createId: IdGenerator }
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
