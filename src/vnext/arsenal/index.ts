export * from './contracts';
export * from './repository';
export * from './insertion';
export * from './capture';
export * from './preview';
export { createInMemoryArsenalStore } from './memory-repository';
export type { ArsenalMemoryActor, ArsenalMemoryStore, ArsenalMemoryStoreOptions } from './memory-repository';
// Onda 4.5 — fatia "arsenal-motor": captura, inserção e prévia (o cartão React fica em app/editor/ArsenalPresetThumbnail).
export { ARSENAL_CAPTURE_NOTE_MESSAGES, buildArsenalPresetDraft, captureArsenalContent, createArsenalCaptureService } from './arsenal-capture';
export type { ArsenalDraftMetadataInput } from './arsenal-capture';
export {
  arsenalBlockOrigin,
  arsenalStyleActions,
  arsenalTableFrame,
  createArsenalInsertionService,
  insertArsenalPreset,
  planArsenalAssets,
} from './arsenal-insertion';
export type { ArsenalAssetPlan, ArsenalStyleActionsResult } from './arsenal-insertion';
export { arsenalPreviewDocument, arsenalPreviewViewport, buildArsenalPreview, createArsenalPreviewBuilder } from './arsenal-preview';
export type { ArsenalPreviewOptions } from './arsenal-preview';
export { arsenalContentBoxMm, findFreePlacement } from './arsenal-geometry';
export { ARSENAL_PHOTO_PLACEHOLDER_TEXT } from './arsenal-placeholder';
