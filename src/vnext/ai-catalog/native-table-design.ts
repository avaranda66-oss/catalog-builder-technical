/**
 * FR-33: the native table designs the assistant picks now live in the single table preset registry
 * (`application/table-preset-registry.ts`), next to the presets of the table panel. This module keeps the
 * assistant's import path stable.
 */
export {
  NATIVE_TABLE_PROFILES,
  NativeTableDesignSchema,
  applyNativeTableDesign,
} from '../application/table-preset-registry';
export type { NativeTableDesign, NativeTableProfile } from '../application/table-preset-registry';
