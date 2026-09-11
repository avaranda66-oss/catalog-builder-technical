import { z } from 'zod';
import type { CatalogDocument } from '../domain';
import {
  BorderSchema,
  ImageFocalPointSchema,
  RichTextSchema,
  TableModelSchema,
  TextStyleSchema,
} from '../domain/editorial-model';

const applicationId = z.string().min(1);
const safeInteger = z.number().int().safe();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const cleanTitle = z.string().min(1).refine(
  (value) => ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
  'Control character'
);
const editablePlainText = z.string().refine(
  (value) => ![...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 10) || code === 127;
  }),
  'Unsupported ASCII control character'
);

export const RenameDocumentActionSchema = z.object({
  type: z.literal('document.rename'),
  title: cleanTitle,
}).strict();

export const AddPageActionSchema = z.object({
  type: z.literal('page.add'),
  afterPageId: applicationId.optional(),
}).strict();

export const InsertPageTemplateActionSchema = z.object({
  type: z.literal('page.template.insert'),
  templateId: applicationId,
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
  targetIndex: safeInteger.nonnegative(),
}).strict();

export const FrameUSchema = z.object({
  xU: safeInteger,
  yU: safeInteger,
  widthU: safeInteger.min(1),
  heightU: safeInteger.min(1),
}).strict();

const insertBase = {
  frameU: FrameUSchema,
  zIndex: safeInteger,
  locked: z.boolean().optional(),
};

export const TextObjectInsertSpecSchema = z.object({
  ...insertBase,
  type: z.literal('text'),
  text: RichTextSchema,
  style: TextStyleSchema,
}).strict();

export const ImageObjectInsertSpecSchema = z.object({
  ...insertBase,
  type: z.literal('image'),
  assetId: applicationId,
  fit: z.enum(['contain', 'cover']),
  focalPoint: ImageFocalPointSchema.optional(),
}).strict();

export const TableObjectInsertSpecSchema = z.object({
  ...insertBase,
  type: z.literal('table'),
  table: TableModelSchema,
}).strict();

export const ShapeObjectInsertSpecSchema = z.object({
  ...insertBase,
  type: z.literal('shape'),
  shape: z.enum(['rectangle', 'ellipse']),
  style: z.object({
    fill: color.optional(),
    stroke: BorderSchema.optional(),
  }).strict(),
}).strict();

export const LineObjectInsertSpecSchema = z.object({
  ...insertBase,
  type: z.literal('line'),
  axis: z.enum(['horizontal', 'vertical']),
  color,
}).strict();

export const IconObjectInsertSpecSchema = z.object({
  ...insertBase,
  type: z.literal('icon'),
  assetId: applicationId,
}).strict();

export const ObjectInsertSpecSchema = z.discriminatedUnion('type', [
  TextObjectInsertSpecSchema,
  ImageObjectInsertSpecSchema,
  TableObjectInsertSpecSchema,
  ShapeObjectInsertSpecSchema,
  LineObjectInsertSpecSchema,
  IconObjectInsertSpecSchema,
]);

export const InsertObjectActionSchema = z.object({
  type: z.literal('object.insert'),
  pageId: applicationId,
  object: ObjectInsertSpecSchema,
}).strict();

export const DeleteObjectActionSchema = z.object({
  type: z.literal('object.delete'),
  objectId: applicationId,
}).strict();

export const DuplicateObjectActionSchema = z.object({
  type: z.literal('object.duplicate'),
  objectId: applicationId,
  xU: safeInteger.optional(),
  yU: safeInteger.optional(),
}).strict();

export const MoveObjectActionSchema = z.object({
  type: z.literal('object.move'),
  objectId: applicationId,
  xU: safeInteger,
  yU: safeInteger,
}).strict();

export const ResizeObjectActionSchema = z.object({
  type: z.literal('object.resize'),
  objectId: applicationId,
  xU: safeInteger,
  yU: safeInteger,
  widthU: safeInteger.min(1),
  heightU: safeInteger.min(1),
}).strict();

export const ReorderObjectActionSchema = z.object({
  type: z.literal('object.reorder'),
  objectId: applicationId,
  targetIndex: safeInteger.nonnegative(),
}).strict();

export const ReplaceImageActionSchema = z.object({
  type: z.literal('image.replace'),
  objectId: applicationId,
  assetId: applicationId,
}).strict();

export const SetTextContentActionSchema = z.object({
  type: z.literal('text.setContent'),
  objectId: applicationId,
  expectedText: RichTextSchema,
  plainText: editablePlainText,
}).strict();

export const CreateGroupActionSchema = z.object({
  type: z.literal('group.create'),
  pageId: applicationId,
  objectIds: z.array(applicationId).min(2).refine((values)=>new Set(values).size===values.length,'Group objectIds must be unique'),
}).strict();

export const UngroupActionSchema = z.object({
  type: z.literal('group.ungroup'),
  groupId: applicationId,
}).strict();

export const ApplicationActionSchema = z.discriminatedUnion('type', [
  RenameDocumentActionSchema,
  AddPageActionSchema,
  InsertPageTemplateActionSchema,
  DuplicatePageActionSchema,
  DeletePageActionSchema,
  ReorderPageActionSchema,
  InsertObjectActionSchema,
  DeleteObjectActionSchema,
  DuplicateObjectActionSchema,
  MoveObjectActionSchema,
  ResizeObjectActionSchema,
  ReorderObjectActionSchema,
  ReplaceImageActionSchema,
  SetTextContentActionSchema,
  CreateGroupActionSchema,
  UngroupActionSchema,
]);

export type ApplicationAction = z.infer<typeof ApplicationActionSchema>;
export type ApplicationActionType = ApplicationAction['type'];
export type FrameU = z.infer<typeof FrameUSchema>;
export type ObjectInsertSpec = z.infer<typeof ObjectInsertSpecSchema>;

export type ApplicationErrorCode =
  | 'ACTION_INVALID'
  | 'PAGE_NOT_FOUND'
  | 'TEMPLATE_NOT_FOUND'
  | 'LAST_PAGE_REQUIRED'
  | 'INVALID_REORDER_TARGET'
  | 'OBJECT_NOT_FOUND'
  | 'OBJECT_LOCKED'
  | 'INVALID_GEOMETRY'
  | 'INVALID_Z_ORDER_TARGET'
  | 'OBJECT_TYPE_MISMATCH'
  | 'ASSET_NOT_FOUND'
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
  changed: boolean;
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
