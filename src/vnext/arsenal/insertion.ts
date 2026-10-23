import type {
  ApplicationAction,
  ApplicationActionResult,
  ApplicationExecutionContext,
} from '../application/contracts';
import type { HistoryResult } from '../application/session';
import type { AssetRef, CatalogDocument, EditorialObject } from '../domain/editorial-model';
import type { ArsenalPreset, ArsenalPresetKind, ArsenalStyleTarget } from './contracts';

/**
 * Onda 4.5 — using a preset (ADR-arsenal §4 and §8). The capture/insertion slice implements
 * `ArsenalInsertionService` and must pass `tests/vnext/arsenal/contract/arsenal-insertion.contract.ts`.
 *
 * Rules every implementation keeps:
 * 1. Zero AI: only typed editor actions through the port (no model call, no network besides `isAssetAvailable`).
 * 2. One Desfazer: every `execute` of one insertion uses the same `transactionId`, returned in the result.
 * 3. All or nothing: if an action fails after others succeeded, the service calls `port.undo()` once, so the
 *    document is exactly as before, and answers `rolledBack: true`.
 * 4. Nothing runs when the preset or the target is wrong (newer payload version, kind/target mismatch, missing page
 *    or object): `ok: false`, `rolledBack: false`, zero `execute` calls.
 * 5. Fresh ids: inserted objects, tables and texts never reuse the ids stored in the preset.
 * 6. Images: an asset the port says is available is registered in the target catalog (`asset.register`, or the
 *    `asset` field of `object.insert`) and reused — bytes are never copied, `vnext_assets` is global and immutable.
 *    Any other becomes the "Foto a escolher (A COMPLETAR)" frame and is reported in `placeholders`. No dangling
 *    asset reference remains.
 * 7. A `structure-only` preset never brings values into the catalog (cells stay empty).
 * The caller records the use (`ArsenalRepository.recordUse`) after `ok: true`.
 */

/** Where the preset goes. */
export type ArsenalInsertTarget =
  /** Page presets: a new page after `afterPageId` (or at the end). */
  | { readonly kind: 'new-page'; readonly afterPageId?: string }
  /**
   * Block and table presets: on an existing page. `original` puts a block back where it was captured (headers and
   * footers); a point puts the top-left corner there (mm). Tables default to the top of the free area.
   */
  | { readonly kind: 'page'; readonly pageId: string; readonly placement?: 'original' | { readonly xMm: number; readonly yMm: number } }
  /** Style presets: applied to one selected object of the matching type. */
  | { readonly kind: 'object'; readonly objectId: string };

export type ArsenalInsertTargetKind = ArsenalInsertTarget['kind'];

/** Which target each kind accepts. */
export const ARSENAL_INSERT_TARGETS: Readonly<Record<ArsenalPresetKind, readonly ArsenalInsertTargetKind[]>> = Object.freeze({
  page: Object.freeze(['new-page'] as const),
  block: Object.freeze(['page'] as const),
  table: Object.freeze(['page'] as const),
  style: Object.freeze(['object'] as const),
});

/** Which object type a style preset can be applied to. */
export const ARSENAL_STYLE_OBJECT_TYPES: Readonly<Record<ArsenalStyleTarget, EditorialObject['type']>> = Object.freeze({
  text: 'text',
  shape: 'shape',
  polygon: 'polygon',
  line: 'line',
  table: 'table',
});

export function isArsenalInsertTargetAllowed(kind: ArsenalPresetKind, target: ArsenalInsertTarget): boolean {
  return ARSENAL_INSERT_TARGETS[kind].includes(target.kind);
}

/** What the service needs from the editor. The session already gives all of it; tests wrap it to record calls. */
export interface ArsenalInsertionPort {
  getDocument(): CatalogDocument;
  execute(action: ApplicationAction, context: ApplicationExecutionContext): ApplicationActionResult;
  undo(): HistoryResult;
  /** False when the image cannot be loaded any more (deleted, offline, integrity failure). */
  isAssetAvailable(asset: AssetRef): Promise<boolean>;
  createTransactionId(): string;
}

export interface ArsenalInsertRequest {
  readonly preset: ArsenalPreset;
  readonly target: ArsenalInsertTarget;
}

export interface ArsenalImagePlaceholder {
  readonly assetId: string;
  readonly reason: 'UNAVAILABLE';
}

export type ArsenalInsertErrorCode =
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_PRESET'
  | 'TARGET_INVALID'
  | 'TARGET_NOT_FOUND'
  | 'ACTION_FAILED';

export interface ArsenalInsertSuccess {
  readonly ok: true;
  readonly transactionId: string;
  /** The new page (page presets) or the page that received the objects. */
  readonly pageId: string;
  /** Top-level objects created, or the styled object. */
  readonly objectIds: readonly string[];
  readonly placeholders: readonly ArsenalImagePlaceholder[];
}

export interface ArsenalInsertFailure {
  readonly ok: false;
  readonly error: { readonly code: ArsenalInsertErrorCode; readonly details: string };
  readonly rolledBack: boolean;
}

export type ArsenalInsertResult = ArsenalInsertSuccess | ArsenalInsertFailure;

export interface ArsenalInsertionService {
  insert(request: ArsenalInsertRequest, port: ArsenalInsertionPort): Promise<ArsenalInsertResult>;
}
