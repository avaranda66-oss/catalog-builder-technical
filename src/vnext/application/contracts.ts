import { z } from 'zod';
import type { CatalogDocument } from '../domain';
import {
  AssetRefSchema,
  BorderSchema,
  CellContentPresentationSchema,
  CellContentSchema,
  CellStyleSchema,
  DocumentStyleSchema,
  ImageFocalPointSchema,
  RichTextSchema,
  TableLegendEntrySchema,
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
const richTextEditablePlainText = z.string().refine(
  (value) => ![...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10) || code === 127;
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
  asset: AssetRefSchema.optional(),
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

export const TableFitHeightTypographySchema = DocumentStyleSchema.pick({
  fonts: true,
  defaultText: true,
});

export const TableFitHeightActionSchema = z.object({
  type: z.literal('table.fitHeight'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  expectedFrame: FrameUSchema,
  expectedTable: TableModelSchema,
  expectedTypography: TableFitHeightTypographySchema,
  measuredIntrinsicHeightQ: safeInteger.positive(),
  preparedHeightU: safeInteger.positive(),
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
  asset: AssetRefSchema.optional(),
}).strict();

export const RegisterAssetActionSchema = z.object({
  type: z.literal('asset.register'),
  asset: AssetRefSchema,
}).strict();

export const SetTextContentActionSchema = z.object({
  type: z.literal('text.setContent'),
  objectId: applicationId,
  expectedText: RichTextSchema,
  plainText: richTextEditablePlainText,
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

export const InsertedTableRowPropertiesSchema = z.object({
  role: z.enum(['header', 'body']),
  heightPolicy: z.object({ mode: z.literal('AUTO') }).strict(),
}).strict();

export const InsertedTableColumnPropertiesSchema = z.object({
  width: z.object({
    mode: z.literal('flex'),
    weight: safeInteger.positive(),
  }).strict(),
  minMm: z.number().finite().positive(),
}).strict();

export const TableAxisInsertActionSchema = z.object({
  type: z.literal('table.axis.insert'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  axis: z.enum(['row', 'column']),
  referenceAxisId: applicationId,
  position: z.enum(['before', 'after']),
  properties: z.union([
    InsertedTableRowPropertiesSchema,
    InsertedTableColumnPropertiesSchema,
  ]),
  expectedTable: TableModelSchema,
}).strict().superRefine((action, context) => {
  const valid = action.axis === 'row'
    ? InsertedTableRowPropertiesSchema.safeParse(action.properties).success
    : InsertedTableColumnPropertiesSchema.safeParse(action.properties).success;
  if (!valid) {
    context.addIssue({
      code: 'custom',
      path: ['properties'],
      message: `Properties do not match ${action.axis} insertion`,
    });
  }
});

export const TableAxisRemoveActionSchema = z.object({
  type: z.literal('table.axis.remove'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  axis: z.enum(['row', 'column']),
  axisId: applicationId,
  expectedTable: TableModelSchema,
}).strict();

export const TableCellsMergeActionSchema = z.object({
  type: z.literal('table.cells.merge'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  anchorCellId: applicationId,
  rows: safeInteger.positive(),
  columns: safeInteger.positive(),
  expectedTable: TableModelSchema,
}).strict();

export const TableCellUnmergeActionSchema = z.object({
  type: z.literal('table.cell.unmerge'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  anchorCellId: applicationId,
  expectedTable: TableModelSchema,
}).strict();

export const TableCellContentInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('empty') }).strict(),
  z.object({ type: z.literal('richText'), plainText: richTextEditablePlainText }).strict(),
  z.object({ type: z.literal('technicalCode'), value: z.string() }).strict(),
  z.object({
    type: z.literal('measurement'),
    valueText: z.string(),
    unit: z.string(),
    qualifier: z.enum(['approx', 'min', 'max']).optional(),
  }).strict(),
]);

export const TableCellSetContentActionSchema = z.object({
  type: z.literal('table.cell.setContent'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  cellId: applicationId,
  expectedContent: CellContentSchema,
  content: TableCellContentInputSchema,
  allowTypeChange: z.literal(true).optional(),
}).strict();

const cleanMarkerCode = z.string().min(1).refine(
  (value) => ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
  'Control character'
);

export const TableBulkMarkerReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), legendEntryId: applicationId }).strict(),
  z.object({ kind: z.literal('created'), clientKey: applicationId }).strict(),
]);

export const TableBulkExpectedTopologySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ordinary') }).strict(),
  z.object({
    kind: z.literal('mergedOwner'),
    rows: safeInteger.positive(),
    columns: safeInteger.positive(),
  }).strict(),
]);

export const TableBulkCellContentInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('empty') }).strict(),
  z.object({ type: z.literal('richTextPlain'), plainText: richTextEditablePlainText }).strict(),
  z.object({ type: z.literal('richTextCopy'), value: RichTextSchema }).strict(),
  z.object({ type: z.literal('technicalCode'), value: z.string() }).strict(),
  z.object({
    type: z.literal('measurement'),
    valueText: z.string(),
    unit: z.string(),
    qualifier: z.enum(['approx', 'min', 'max']).optional(),
  }).strict(),
  z.object({ type: z.literal('marker'), legend: TableBulkMarkerReferenceSchema }).strict(),
]);

export const TableBulkContentTargetSchema = z.object({
  cellId: applicationId,
  expectedTopology: TableBulkExpectedTopologySchema,
  expectedContent: CellContentSchema,
  content: TableBulkCellContentInputSchema,
}).strict();

export const TableLegendCreateInputSchema = z.object({
  clientKey: applicationId,
  markerCode: cleanMarkerCode,
  text: RichTextSchema,
}).strict();

export const TableCellsSetContentsActionSchema = z.object({
  type: z.literal('table.cells.setContents'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  geometry: z.object({
    rowIds: z.array(applicationId).min(1),
    columnIds: z.array(applicationId).min(1),
  }).strict(),
  targets: z.array(TableBulkContentTargetSchema).min(1),
  legendCreates: z.array(TableLegendCreateInputSchema).optional(),
  expectedLegend: z.array(TableLegendEntrySchema).optional(),
}).strict().superRefine((action, context) => {
  const rowIds = action.geometry.rowIds;
  const columnIds = action.geometry.columnIds;
  if (new Set(rowIds).size !== rowIds.length || new Set(columnIds).size !== columnIds.length) {
    context.addIssue({ code: 'custom', path: ['geometry'], message: 'Geometry IDs must be unique' });
  }
  if (action.targets.length !== rowIds.length * columnIds.length) {
    context.addIssue({ code: 'custom', path: ['targets'], message: 'Targets must match geometry area' });
  }
  const targetIds = action.targets.map((target) => target.cellId);
  if (new Set(targetIds).size !== targetIds.length) {
    context.addIssue({ code: 'custom', path: ['targets'], message: 'Target cellIds must be unique' });
  }
  const creates = action.legendCreates ?? [];
  const createKeys = creates.map((entry) => entry.clientKey);
  if (new Set(createKeys).size !== createKeys.length) {
    context.addIssue({ code: 'custom', path: ['legendCreates'], message: 'Legend client keys must be unique' });
  }
  const createdRefs = action.targets.flatMap((target) =>
    target.content.type === 'marker' && target.content.legend.kind === 'created'
      ? [target.content.legend.clientKey]
      : []
  );
  for (const clientKey of createdRefs) {
    if (!createKeys.includes(clientKey)) {
      context.addIssue({ code: 'custom', path: ['targets'], message: `Missing Legend create for ${clientKey}` });
    }
  }
  if (creates.some((entry) => !createdRefs.includes(entry.clientKey))) {
    context.addIssue({ code: 'custom', path: ['legendCreates'], message: 'Every Legend create must be referenced' });
  }
  if (creates.length > 0 && action.expectedLegend === undefined) {
    context.addIssue({ code: 'custom', path: ['expectedLegend'], message: 'Legend CAS is required when creating Legends' });
  }
});

export const TableLegendCreateActionSchema = z.object({
  type: z.literal('table.legend.create'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  markerCode: cleanMarkerCode,
  plainText: richTextEditablePlainText,
  expectedLegend: z.array(TableLegendEntrySchema),
}).strict();

export const TableLegendUpdateActionSchema = z.object({
  type: z.literal('table.legend.update'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  legendEntryId: applicationId,
  expectedLegend: TableLegendEntrySchema,
  patch: z.object({
    markerCode: cleanMarkerCode.optional(),
    plainText: richTextEditablePlainText.optional(),
  }).strict(),
}).strict().superRefine((action, context) => {
  if (action.patch.markerCode === undefined && action.patch.plainText === undefined) {
    context.addIssue({ code: 'custom', path: ['patch'], message: 'Legend update patch must not be empty' });
  }
});

export const TableLegendRemoveActionSchema = z.object({
  type: z.literal('table.legend.remove'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  legendEntryId: applicationId,
  expectedLegend: TableLegendEntrySchema,
}).strict();

const nullableColor = color.nullable();
const nullablePaddingEdge = z.number().finite().nonnegative().nullable();
export const CellPropertyPatchSchema = z.object({
  textAlign: z.enum(['left', 'center', 'right']).nullable().optional(),
  fontWeight: z.union([z.literal(400), z.literal(700)]).nullable().optional(),
  color: nullableColor.optional(),
  background: nullableColor.optional(),
  paddingMm: z.union([
    z.null(),
    z.object({
      top: nullablePaddingEdge.optional(),
      right: nullablePaddingEdge.optional(),
      bottom: nullablePaddingEdge.optional(),
      left: nullablePaddingEdge.optional(),
    }).strict(),
  ]).optional(),
  wrapPolicy: z.enum(['wrap', 'nowrap']).nullable().optional(),
}).strict();

export const TableCellPropertyTargetSchema = z.object({
  cellId: applicationId,
  expectedStyle: CellStyleSchema.optional(),
  expectedContentPresentation: CellContentPresentationSchema.optional(),
}).strict();

export const TableCellSetPropertiesActionSchema = z.object({
  type: z.literal('table.cell.setProperties'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  targets: z.array(TableCellPropertyTargetSchema).min(1),
  patch: CellPropertyPatchSchema,
}).strict().superRefine((action, context) => {
  const ids = action.targets.map((target) => target.cellId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['targets'], message: 'Property target cellIds must be unique' });
  }
});

export const TableRowRoleSchema = z.enum(['header', 'body', 'section']);
export const TableRowHeightPolicyUSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('AUTO') }).strict(),
  z.object({ mode: z.literal('MIN_MM'), minU: safeInteger.positive() }).strict(),
  z.object({ mode: z.literal('FIXED_MM'), heightU: safeInteger.positive() }).strict(),
]);
export const TableRowPropertyTargetSchema = z.object({
  rowId: applicationId,
  expected: z.object({
    role: TableRowRoleSchema,
    heightPolicy: TableRowHeightPolicyUSchema,
  }).strict(),
  next: z.object({
    role: TableRowRoleSchema.optional(),
    heightPolicy: TableRowHeightPolicyUSchema.optional(),
  }).strict().refine((value) => value.role !== undefined || value.heightPolicy !== undefined, 'Row next state must change at least one property'),
}).strict();
export const TableRowsSetPropertiesActionSchema = z.object({
  type: z.literal('table.rows.setProperties'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  targets: z.array(TableRowPropertyTargetSchema).min(1),
}).strict().superRefine((action, context) => {
  const ids = action.targets.map((target) => target.rowId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['targets'], message: 'Row target IDs must be unique' });
  }
});

export const TableColumnWidthUSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed'), widthU: safeInteger.positive() }).strict(),
  z.object({ mode: z.literal('flex'), weight: safeInteger.positive() }).strict(),
]);
export const TableColumnPropertyTargetSchema = z.object({
  columnId: applicationId,
  expected: z.object({
    width: TableColumnWidthUSchema,
    minU: safeInteger.positive(),
    maxU: safeInteger.positive().optional(),
  }).strict(),
  next: z.object({
    width: TableColumnWidthUSchema.optional(),
    minU: safeInteger.positive().optional(),
    maxU: safeInteger.positive().nullable().optional(),
  }).strict().refine(
    (value) => value.width !== undefined || value.minU !== undefined || value.maxU !== undefined,
    'Column next state must change at least one property'
  ),
}).strict();
export const TableColumnsSetPropertiesActionSchema = z.object({
  type: z.literal('table.columns.setProperties'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  expectedFrameWidthU: safeInteger.positive(),
  expectedColumnOrder: z.array(applicationId).min(1),
  targets: z.array(TableColumnPropertyTargetSchema).min(1),
}).strict().superRefine((action, context) => {
  const targetIds = action.targets.map((target) => target.columnId);
  if (new Set(targetIds).size !== targetIds.length) {
    context.addIssue({ code: 'custom', path: ['targets'], message: 'Column target IDs must be unique' });
  }
  if (new Set(action.expectedColumnOrder).size !== action.expectedColumnOrder.length) {
    context.addIssue({ code: 'custom', path: ['expectedColumnOrder'], message: 'Expected column order must contain unique IDs' });
  }
});

export const TableAxisReorderActionSchema = z.object({
  type: z.literal('table.axis.reorder'),
  pageId: applicationId,
  objectId: applicationId,
  tableId: applicationId,
  axis: z.enum(['row', 'column']),
  expectedOrder: z.array(applicationId).min(1),
  nextOrder: z.array(applicationId).min(1),
  expectedTable: TableModelSchema,
}).strict().superRefine((action, context) => {
  const expected = action.expectedOrder;
  const next = action.nextOrder;
  if (new Set(expected).size !== expected.length) {
    context.addIssue({ code: 'custom', path: ['expectedOrder'], message: 'Expected axis order must contain unique IDs' });
  }
  if (new Set(next).size !== next.length) {
    context.addIssue({ code: 'custom', path: ['nextOrder'], message: 'Next axis order must contain unique IDs' });
  }
  if (expected.length !== next.length || expected.some((id) => !next.includes(id))) {
    context.addIssue({ code: 'custom', path: ['nextOrder'], message: 'Next axis order must contain the same IDs as expected order' });
  }
});

export const ApplicationActionSchema = z.union([
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
  TableFitHeightActionSchema,
  ReorderObjectActionSchema,
  ReplaceImageActionSchema,
  RegisterAssetActionSchema,
  SetTextContentActionSchema,
  CreateGroupActionSchema,
  UngroupActionSchema,
  TableAxisInsertActionSchema,
  TableAxisRemoveActionSchema,
  TableCellsMergeActionSchema,
  TableCellUnmergeActionSchema,
  TableCellSetContentActionSchema,
  TableCellsSetContentsActionSchema,
  TableLegendCreateActionSchema,
  TableLegendUpdateActionSchema,
  TableLegendRemoveActionSchema,
  TableCellSetPropertiesActionSchema,
  TableRowsSetPropertiesActionSchema,
  TableColumnsSetPropertiesActionSchema,
  TableAxisReorderActionSchema,
]);

export type ApplicationAction = z.infer<typeof ApplicationActionSchema>;
export type ApplicationActionType = ApplicationAction['type'];
export type FrameU = z.infer<typeof FrameUSchema>;
export type ObjectInsertSpec = z.infer<typeof ObjectInsertSpecSchema>;
export type TableCellContentInput = z.infer<typeof TableCellContentInputSchema>;
export type TableBulkCellContentInput = z.infer<typeof TableBulkCellContentInputSchema>;
export type TableBulkExpectedTopology = z.infer<typeof TableBulkExpectedTopologySchema>;
export type TableBulkContentTarget = z.infer<typeof TableBulkContentTargetSchema>;
export type TableLegendCreateInput = z.infer<typeof TableLegendCreateInputSchema>;
export type TableFitHeightTypography = z.infer<typeof TableFitHeightTypographySchema>;
export type CellPropertyPatch = z.infer<typeof CellPropertyPatchSchema>;
export type TableCellPropertyTarget = z.infer<typeof TableCellPropertyTargetSchema>;
export type TableRowHeightPolicyU = z.infer<typeof TableRowHeightPolicyUSchema>;
export type TableRowPropertyTarget = z.infer<typeof TableRowPropertyTargetSchema>;
export type TableColumnWidthU = z.infer<typeof TableColumnWidthUSchema>;
export type TableColumnPropertyTarget = z.infer<typeof TableColumnPropertyTargetSchema>;

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
  | 'TABLE_IDENTITY_MISMATCH'
  | 'TABLE_AXIS_NOT_FOUND'
  | 'TABLE_LAST_AXIS'
  | 'TABLE_WIDTH_INFEASIBLE'
  | 'COLUMN_LIMIT_INVALID'
  | 'COLUMN_WEIGHT_INVALID'
  | 'AXIS_ORDER_INVALID'
  | 'MERGE_INTERSECTION'
  | 'MERGE_HEADER_BOUNDARY'
  | 'MERGE_OVERLAP'
  | 'MERGE_WOULD_DISCARD_CONTENT'
  | 'TABLE_PASTE_GEOMETRY_INVALID'
  | 'TABLE_PASTE_MERGE_INTERSECTION'
  | 'TABLE_CELL_CONTENT_UNSUPPORTED'
  | 'LEGEND_NOT_FOUND'
  | 'LEGEND_IN_USE'
  | 'LEGEND_MARKER_CODE_CONFLICT'
  | 'TARGET_STALE'
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
