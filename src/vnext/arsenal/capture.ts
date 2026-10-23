import type { CatalogDocument } from '../domain/editorial-model';
import type {
  ArsenalCategory,
  ArsenalPayload,
  ArsenalPresetKind,
  ArsenalTableValuePolicy,
  ArsenalTeamOrigin,
} from './contracts';

/**
 * Onda 4.5 — turning what is on the page into a preset draft (ADR-arsenal §2–§4). Pure: no network, no AI.
 * The AI path is the same call: the assistant proposes "Guardar no arsenal?", the person confirms name and category,
 * and the client captures with `origin: 'ai'`.
 *
 * Rules every implementation keeps:
 * - Hidden objects are skipped (note `HIDDEN_OBJECTS_SKIPPED`); locked ones are kept.
 * - `tableValues` defaults to `structure-only`, applied with `stripArsenalTableValues` (note `TABLE_VALUES_REMOVED`).
 * - Assets listed in `placeholderAssetIds` become "Foto a escolher (A COMPLETAR)" frames (note `IMAGE_PLACEHOLDER`).
 * - Block payloads keep the source frame and make object frames relative to it.
 * - The draft passes `parseArsenalPresetDraft` once `name` and `category` are filled in.
 */

export type ArsenalCaptureSource =
  /** Whole page → `page` preset. */
  | { readonly kind: 'page'; readonly pageId: string }
  /** One or more objects of one page (a group counts as one) → `block` preset. */
  | { readonly kind: 'objects'; readonly pageId: string; readonly objectIds: readonly string[] }
  /** One table object → `table` preset. */
  | { readonly kind: 'table'; readonly objectId: string }
  /** The look of one text, shape, polygon, line or table → `style` preset. */
  | { readonly kind: 'style'; readonly objectId: string };

export interface ArsenalCaptureRequest {
  readonly document: CatalogDocument;
  readonly source: ArsenalCaptureSource;
  readonly origin: ArsenalTeamOrigin;
  /** Default `structure-only`. `generic-values` only after the person chose it explicitly. */
  readonly tableValues?: ArsenalTableValuePolicy;
  readonly placeholderAssetIds?: readonly string[];
}

export type ArsenalCaptureNoteCode =
  | 'HIDDEN_OBJECTS_SKIPPED'
  | 'TABLE_VALUES_REMOVED'
  | 'IMAGE_PLACEHOLDER';

export interface ArsenalCaptureNote {
  readonly code: ArsenalCaptureNoteCode;
  readonly objectIds: readonly string[];
}

/** Everything of a draft except what the person types (name, description, tags, synonyms). */
export interface ArsenalCapturedContent {
  readonly kind: ArsenalPresetKind;
  readonly origin: ArsenalTeamOrigin;
  readonly payload: ArsenalPayload;
  readonly suggestedName: string;
  readonly suggestedCategory: ArsenalCategory;
}

export type ArsenalCaptureErrorCode =
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_EMPTY'
  | 'SOURCE_UNSUPPORTED'
  | 'TOO_LARGE'
  | 'INVALID_PAYLOAD';

export type ArsenalCaptureResult =
  | { readonly ok: true; readonly content: ArsenalCapturedContent; readonly notes: readonly ArsenalCaptureNote[] }
  | { readonly ok: false; readonly error: { readonly code: ArsenalCaptureErrorCode; readonly details: string } };

export interface ArsenalCaptureService {
  capture(request: ArsenalCaptureRequest): ArsenalCaptureResult;
}
