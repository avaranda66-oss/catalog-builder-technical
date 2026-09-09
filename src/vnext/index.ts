export {
  CatalogDocumentSchema,
  TableModelSchema,
  plainRichText,
} from './domain/editorial-model';
export type {
  AssetRef,
  CatalogDocument,
  Cell,
  CellContent,
  Column,
  DocumentStyle,
  EditorialObject,
  Page,
  RichText,
  Row,
  TableModel,
  TableStyle,
} from './domain/editorial-model';
export { VNextError, asDiagnostic, diagnostic } from './domain/diagnostics';
export type { Diagnostic, Severity } from './domain/diagnostics';

export {
  authoredFrames,
  deleteAxis,
  insertAxis,
  mergeCells,
  reorderAxis,
  unmergeCell,
  validateDocument,
  validateTable,
} from './table/table-model';

export { DocumentRenderer } from './rendering/DocumentRenderer';
export { compilePlans } from './rendering/render-plan';
export type { TablePlan } from './rendering/render-plan';
export {
  captureSnapshot,
  compareSnapshots,
  measureTables,
  tableConstraints,
} from './rendering/measurement';
export type { LayoutSnapshot, PhysicalLayoutFact } from './rendering/measurement';
export {
  decodeImages,
  loadFonts,
  resolveAssets,
  sha256,
  verifyFontManifest,
} from './rendering/resources';
export type { AssetUrlResolver, ResourceManifest } from './rendering/resources';

export { layoutReport } from './publication/preflight';
