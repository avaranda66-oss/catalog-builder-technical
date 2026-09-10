import { z } from 'zod';
import type { CatalogDocument } from '../domain';

const applicationId = z.string().min(1);
const cleanTitle = z.string().min(1).refine(
  (value) => ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
  'Control character'
);

export const RenameDocumentActionSchema = z.object({
  type: z.literal('document.rename'),
  title: cleanTitle,
}).strict();

export const AddPageActionSchema = z.object({
  type: z.literal('page.add'),
  afterPageId: applicationId.optional(),
}).strict();

export const DuplicatePageActionSchema = z.object({
  type: z.literal('page.duplicate'),
  pageId: applicationId,
}).strict();

export const DeletePageActionSchema = z.object({
  type: z.literal('page.delete'),
  pageId: applicationId,
}).strict();

export const ReorderPageActionSchema = z.object({
  type: z.literal('page.reorder'),
  pageId: applicationId,
  targetIndex: z.number().int().safe().nonnegative(),
}).strict();

export const ApplicationActionSchema = z.discriminatedUnion('type', [
  RenameDocumentActionSchema,
  AddPageActionSchema,
  DuplicatePageActionSchema,
  DeletePageActionSchema,
  ReorderPageActionSchema,
]);

export type ApplicationAction = z.infer<typeof ApplicationActionSchema>;
export type ApplicationActionType = ApplicationAction['type'];

export type ApplicationErrorCode =
  | 'ACTION_INVALID'
  | 'PAGE_NOT_FOUND'
  | 'LAST_PAGE_REQUIRED'
  | 'INVALID_REORDER_TARGET'
  | 'DUPLICATE_ID'
  | 'ID_GENERATION_FAILED'
  | 'DOCUMENT_INVALID';

export interface ApplicationError {
  code: ApplicationErrorCode;
  details: string;
  issues?: readonly {
    path: string;
    message: string;
  }[];
}

export interface ActionMetadata {
  actionType: ApplicationActionType;
  affectedIds: readonly string[];
  createdIds: readonly string[];
}

export interface ApplicationActionSuccess {
  ok: true;
  document: CatalogDocument;
  metadata: ActionMetadata;
}

export interface ApplicationActionFailure {
  ok: false;
  error: ApplicationError;
}

export type ApplicationActionResult = ApplicationActionSuccess | ApplicationActionFailure;

export type IdGenerator = () => string;

/**
 * Execution context intentionally starts small. W2 can coalesce gesture actions by
 * transactionId; later waves can extend this boundary for actor/version/CAS data
 * without creating another mutation API.
 */
export interface ApplicationExecutionContext {
  transactionId?: string;
}
