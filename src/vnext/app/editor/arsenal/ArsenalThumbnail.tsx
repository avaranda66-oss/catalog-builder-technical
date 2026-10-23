import React from 'react';
import type { ArsenalPreset, ArsenalPreview, ArsenalPreviewBuilder } from '../../../arsenal';
import { buildArsenalPreview as buildInsertionPreview } from '../../../arsenal/arsenal-preview';
import { PageThumbnail, pageThumbnailSignature, type PageThumbnailDocument } from '../PageThumbnail';
import {
  arsenalPayloadAssets,
  arsenalPreviewDocument,
  arsenalPreviewViewport,
  buildArsenalPreview,
  withArsenalImagePlaceholders,
} from './arsenal-preview';

export interface ArsenalPresetThumbnailProps {
  readonly preset: ArsenalPreset;
  /** The open catalog (its style and language make the preset look as it will look here). */
  readonly document: PageThumbnailDocument;
  readonly assetUrls: ReadonlyMap<string, string>;
  readonly builder?: ArsenalPreviewBuilder;
  readonly className?: string;
}

/**
 * The picture the card draws. Without a builder from the runtime it is the insertion's own preview (same position,
 * fonts and "Foto a escolher" frames as "Usar" would leave, with the open catalog's style and images); this
 * screen's simpler builder stays as a reserve when that one cannot draw the preset.
 */
export function arsenalCardPreview(
  preset: ArsenalPreset,
  document: Pick<PageThumbnailDocument, 'style'>,
  assetUrls: ReadonlyMap<string, string>,
  builder?: ArsenalPreviewBuilder,
): ArsenalPreview | null {
  if (builder) {
    try { return builder(preset); } catch { return null; }
  }
  try {
    return buildInsertionPreview(preset, { assetUrls, documentStyle: document.style });
  } catch {
    try { return buildArsenalPreview(preset); } catch { return null; }
  }
}

/** Ratio (height / width) from which the picture is drawn by its height instead of its width. */
const TALL_RATIO = 0.75;

/**
 * The picture of a preset: the live drawing of its content (same renderer as the PDF) cut to the part worth
 * showing (a header shows the band, not an empty A4). Hidden from screen readers: the card's name says it all.
 */
export const ArsenalPresetThumbnail = React.memo(function ArsenalPresetThumbnail({
  preset, document, assetUrls, builder, className,
}: ArsenalPresetThumbnailProps) {
  const style = document.style;
  const preview = React.useMemo(
    () => arsenalCardPreview(preset, { style }, assetUrls, builder),
    [assetUrls, builder, preset, style],
  );
  const page = React.useMemo(
    () => preview && withArsenalImagePlaceholders(preview.page, (assetId) => assetUrls.has(assetId)),
    [assetUrls, preview],
  );
  const previewDocument = React.useMemo(() => arsenalPreviewDocument(document, arsenalPayloadAssets(preset)), [document, preset]);
  if (!preview || !page) {
    return <span className={['vnext-arsenal-thumb', 'is-empty', className].filter(Boolean).join(' ')} aria-hidden="true" data-arsenal-thumb="error" />;
  }
  const view = arsenalPreviewViewport(preview.focusMm);
  const ratio = view.heightMm / view.widthMm;
  return (
    <span className={['vnext-arsenal-thumb', className].filter(Boolean).join(' ')} aria-hidden="true" data-arsenal-thumb="ready">
      <span
        className={ratio >= TALL_RATIO ? 'vnext-arsenal-thumb-crop is-tall' : 'vnext-arsenal-thumb-crop'}
        style={{ aspectRatio: `${view.widthMm} / ${view.heightMm}` }}
      >
        <span
          className="vnext-arsenal-thumb-page"
          style={{
            width: `${(210 / view.widthMm) * 100}%`,
            left: `${(-view.xMm / view.widthMm) * 100}%`,
            top: `${(-view.yMm / view.heightMm) * 100}%`,
          }}
        >
          <PageThumbnail page={page} document={previewDocument} assetUrls={assetUrls}
            signature={pageThumbnailSignature(page, previewDocument)} />
        </span>
      </span>
    </span>
  );
});
