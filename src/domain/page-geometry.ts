// src/domain/page-geometry.ts
// Geometria Física Padronizada da Folha A4 e Content Box (Fase 3A.5A)
// Define o contrato físico canônico baseado na compatibilidade do CleanA4 existente.
// Milímetros são a autoridade persistente/física; pixels são representações de preview.

import { mmToPx } from './physical-units';

export interface PageMarginsMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface A4PageGeometry {
  pageWidthMm: number;    // 210 mm (ISO 216)
  pageHeightMm: number;   // 297 mm (ISO 216)
  marginsMm: PageMarginsMm;
}

export interface PageContentBox {
  availableWidthMm: number;
  availableHeightMm: number;
  previewWidthPx: number;
  previewHeightPx: number;
}

/**
 * Contrato físico canônico do Catalog Studio baseado na compatibilidade do CleanA4 existente.
 * Adota margens equivalentes aos 32 CSS px do CleanA4 (32 * 25.4 / 96 ≈ 8.4667 mm).
 */
export const CANONICAL_A4_GEOMETRY: A4PageGeometry = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginsMm: {
    top: 8.4667,
    right: 8.4667,
    bottom: 8.4667,
    left: 8.4667
  }
};

/**
 * Derivação rigorosa do Content Box da página A4.
 * availableWidthMm = pageWidthMm - leftMarginMm - rightMarginMm
 * availableHeightMm = pageHeightMm - topMarginMm - bottomMarginMm
 */
export function getPageContentBox(geometry: A4PageGeometry = CANONICAL_A4_GEOMETRY): PageContentBox {
  const availableWidthMm = geometry.pageWidthMm - geometry.marginsMm.left - geometry.marginsMm.right;
  const availableHeightMm = geometry.pageHeightMm - geometry.marginsMm.top - geometry.marginsMm.bottom;

  return {
    availableWidthMm: Number(availableWidthMm.toFixed(4)),
    availableHeightMm: Number(availableHeightMm.toFixed(4)),
    previewWidthPx: Math.round(mmToPx(availableWidthMm, 96)),
    previewHeightPx: Math.round(mmToPx(availableHeightMm, 96))
  };
}

/**
 * Retorna a declaração CSS de padding milimétrico canônico para a folha A4.
 * Se isSingleFullCover for true, retorna '0mm' (sangria total).
 */
export function getCanonicalPagePaddingCss(
  isSingleFullCover: boolean = false,
  geometry: A4PageGeometry = CANONICAL_A4_GEOMETRY
): string {
  if (isSingleFullCover) {
    return '0mm';
  }
  return `${geometry.marginsMm.top}mm ${geometry.marginsMm.right}mm ${geometry.marginsMm.bottom}mm ${geometry.marginsMm.left}mm`;
}
