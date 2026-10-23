import type { Frame, Page } from '../domain/editorial-model';
import type { ArsenalPreset } from './contracts';

/**
 * Onda 4.5 — thumbnail of a preset (ADR-arsenal §5): drawn live by the existing `PageThumbnail`, never stored.
 * The gallery slice implements the builder:
 * - `page`: the page itself;
 * - `block`: a blank A4 page with the block at its source frame; `focusMm` = that frame;
 * - `table`: the table at the top of the safe area; `focusMm` = its frame;
 * - `style`: a sample object ("Aa", a box, a line or a small table) wearing the style; `focusMm` = the sample.
 * Images missing from the viewer's asset map draw as the "Foto a escolher" frame, like the insertion would.
 */
export interface ArsenalPreview {
  readonly page: Page;
  /** Area worth showing when the card crops the page (mm, page coordinates). Whole page when absent. */
  readonly focusMm?: Frame;
}

export type ArsenalPreviewBuilder = (preset: ArsenalPreset) => ArsenalPreview;
