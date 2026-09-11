export {
  AddPageActionSchema,
  ApplicationActionSchema,
  DeleteObjectActionSchema,
  DeletePageActionSchema,
  DuplicateObjectActionSchema,
  DuplicatePageActionSchema,
  FrameUSchema,
  IconObjectInsertSpecSchema,
  ImageObjectInsertSpecSchema,
  InsertObjectActionSchema,
  InsertPageTemplateActionSchema,
  LineObjectInsertSpecSchema,
  MoveObjectActionSchema,
  ObjectInsertSpecSchema,
  RenameDocumentActionSchema,
  ReorderObjectActionSchema,
  ReorderPageActionSchema,
  ReplaceImageActionSchema,
  ResizeObjectActionSchema,
  ShapeObjectInsertSpecSchema,
  TableObjectInsertSpecSchema,
  TextObjectInsertSpecSchema,
} from './contracts';
export type {
  ActionMetadata,
  ApplicationAction,
  ApplicationActionFailure,
  ApplicationActionResult,
  ApplicationActionSuccess,
  ApplicationActionType,
  ApplicationError,
  ApplicationErrorCode,
  ApplicationExecutionContext,
  FrameU,
  IdGenerator,
  ObjectInsertSpec,
} from './contracts';
export {
  canonicalIdentityIds,
  canonicalObjectIdentityIds,
  createCatalogDocument,
  instantiatePageWithFreshIds,
} from './document';
export { executeApplicationAction } from './execute';
export type { ApplicationExecutionDependencies } from './execute';
export { createDocumentSession } from './session';
export type { DocumentSession, DocumentSessionSnapshot, HistoryResult } from './session';
export {
  createStaticPageTemplateRegistry,
  parsePageTemplateDefinition,
  PageTemplateDefinitionError,
} from './template-registry';
export type {
  PageTemplateDefinition,
  PageTemplateDefinitionIssue,
  PageTemplateRegistry,
} from './template-registry';
