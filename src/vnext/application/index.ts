export {
  AddPageActionSchema,
  ApplicationActionSchema,
  CreateGroupActionSchema,
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
  SetTextContentActionSchema,
  ShapeObjectInsertSpecSchema,
  TableObjectInsertSpecSchema,
  TextObjectInsertSpecSchema,
  UngroupActionSchema,
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
  allocateFreshCanonicalId,
  createCatalogDocument,
  findObjectLocation,
  instantiatePageWithFreshIds,
} from './document';
export type { ObjectLocation, ObjectInstantiationSeed, LeafObjectInstantiationSeed, GroupObjectInstantiationSeed } from './document';
export {
  projectEditableRichText,
  reconcileEditableRichText,
  richTextEquals,
} from './text-editing';
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
