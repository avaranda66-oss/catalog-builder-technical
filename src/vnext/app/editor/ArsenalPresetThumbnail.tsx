import React from 'react';
import type { DocumentStyle } from '../../domain';
import type { ArsenalPreset } from '../../arsenal/contracts';
import { arsenalPreviewDocument, arsenalPreviewViewport, buildArsenalPreview } from '../../arsenal/arsenal-preview';
import { PageThumbnail, pageThumbnailSignature } from './PageThumbnail';
import './ArsenalPresetThumbnail.css';

/**
 * Onda 4.5 — the picture on an arsenal card (ADR-arsenal §5). The preset's own content is drawn live by
 * `PageThumbnail`, the same renderer that prints the PDF (screen = PDF): no stored image, no bucket.
 *
 * - Pages show the whole sheet; blocks, tables and styles show the part of the sheet around them, widened to the
 *   card's proportions.
 * - Memoized twice: the card only renders again when the preset (id + revision), the images, the style or the size
 *   change, and `PageThumbnail` only draws again when the page content changes (it caches by content signature
 *   and draws only when on screen).
 * - Pictures the viewer cannot load are drawn as the "Foto a escolher" frame, exactly as the insertion would.
 */

export interface ArsenalPresetThumbnailProps {
  readonly preset: ArsenalPreset;
  /** Images the viewer can draw (asset id → URL). */
  readonly assetUrls?: ReadonlyMap<string, string>;
  /** Fonts of the open catalog; the PRESYS style when absent. */
  readonly documentStyle?: DocumentStyle;
  /** Card proportions (width / height). Pages default to A4 portrait, the rest to 4:3. */
  readonly aspectRatio?: number;
  readonly className?: string;
}

const NO_IMAGES: ReadonlyMap<string, string> = new Map();

export function arsenalThumbnailAspectRatio(preset: Pick<ArsenalPreset, 'kind'>, aspectRatio?: number): number {
  if (aspectRatio !== undefined && aspectRatio > 0 && Number.isFinite(aspectRatio)) return aspectRatio;
  return preset.kind === 'page' ? 210 / 297 : 4 / 3;
}

const percent = (value: number): string => `${Math.round(value * 10_000) / 10_000}%`;

function ArsenalPresetThumbnailView({ preset, assetUrls = NO_IMAGES, documentStyle, aspectRatio, className }: ArsenalPresetThumbnailProps) {
  const drawing = React.useMemo(() => {
    const options = { assetUrls, documentStyle };
    const preview = buildArsenalPreview(preset, options);
    const document = arsenalPreviewDocument(preset, options);
    return { preview, document, signature: pageThumbnailSignature(preview.page, document) };
  }, [assetUrls, documentStyle, preset]);
  const ratio = arsenalThumbnailAspectRatio(preset, aspectRatio);
  const view = arsenalPreviewViewport(drawing.preview.focusMm, ratio);
  const sheetStyle: React.CSSProperties = {
    width: percent((210 / view.widthMm) * 100),
    left: percent((-view.xMm / view.widthMm) * 100),
    top: percent((-view.yMm / view.heightMm) * 100),
  };
  return (
    <span className={['vnext-arsenal-thumbnail', className].filter(Boolean).join(' ')} style={{ aspectRatio: String(ratio) }}
      aria-hidden="true" data-arsenal-thumbnail={preset.kind} data-arsenal-preset-id={preset.id}>
      <span className="vnext-arsenal-thumbnail-sheet" style={sheetStyle}>
        <PageThumbnail page={drawing.preview.page} document={drawing.document} assetUrls={assetUrls} signature={drawing.signature} />
      </span>
    </span>
  );
}

function samePreset(left: ArsenalPreset, right: ArsenalPreset): boolean {
  return left === right || (left.id === right.id && left.revision === right.revision && left.updatedAt === right.updatedAt
    && left.payloadSchemaVersion === right.payloadSchemaVersion);
}

export const ArsenalPresetThumbnail = React.memo(ArsenalPresetThumbnailView, (previous, next) =>
  samePreset(previous.preset, next.preset)
  && previous.assetUrls === next.assetUrls
  && previous.documentStyle === next.documentStyle
  && previous.aspectRatio === next.aspectRatio
  && previous.className === next.className);
