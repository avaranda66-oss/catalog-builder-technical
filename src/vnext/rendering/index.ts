export { DocumentRenderer, DocumentSliceRenderer } from './DocumentRenderer';
export type { DocumentRendererProps, PageSliceNumbering } from './DocumentRenderer';
export { PrimitiveRenderer, imageObjectPosition } from './PrimitiveRenderer';
export { compilePlans } from './render-plan';
export type { TablePlan } from './render-plan';
export {
  captureSnapshot,
  compareSnapshots,
  measureTables,
  tableConstraints,
} from './measurement';
export type { LayoutSnapshot, PhysicalLayoutFact } from './measurement';
export {
  BUNDLED_FONT_FACES,
  decodeImages,
  fontSampleText,
  isBundledFontFace,
  loadFonts,
  resolveAssets,
  sha256,
  verifyFontManifest,
} from './resources';
export type { AssetUrlResolver, ResourceManifest } from './resources';
