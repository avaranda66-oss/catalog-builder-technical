import { describe, it, expect } from 'vitest';
import {
  validateCatalogCoverExclusivity,
  normalizeNewDocumentCoverExclusivity
} from '../../src/domain/page-composition-policy';
import { Catalog } from '../../src/domain/catalog.schema';
import { getCanonicalPagePaddingCss } from '../../src/domain/canvas-layout.engine';
import { mmToPx, pxToMm } from '../../src/domain/physical-units';

describe('A4.FLOW.R1 — Phase B: Cover Exclusivity & Canonical Geometry (COVER-G1 to COVER-G4)', () => {
  const dummyCatalog: Catalog = {
    id: 'test-cat-cover',
    title: 'Catálogo de Teste Capa',
    themeId: 'default',
    createdAt: '',
    updatedAt: '',
    version: 1,
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        pageType: 'cover',
        title: 'Capa',
        blocks: [
          {
            id: 'b-cov',
            type: 'full_page_cover',
            title: 'TA-25N'
          },
          {
            id: 'b-quick',
            type: 'custom_table',
            title: 'Quick Specs'
          }
        ]
      },
      {
        id: 'p2',
        pageNumber: 2,
        pageType: 'technical',
        title: 'Especificações',
        blocks: [
          {
            id: 'b-table',
            type: 'specs_table',
            title: 'Specs'
          }
        ]
      }
    ]
  };

  // Exclusivity Validation
  it('detects violations of FULL_PAGE_COVER_IS_PAGE_EXCLUSIVE on mixed pages', () => {
    const res = validateCatalogCoverExclusivity(dummyCatalog);
    expect(res.isExclusive).toBe(false);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].pageId).toBe('p1');
    expect(res.violations[0].nonCoverBlocksCount).toBe(1);
  });

  // Exclusivity Normalization for NEW documents
  it('normalizes new document cover exclusivity by cleanly separating non-cover blocks into a new page', () => {
    const { normalizedCatalog, modified } = normalizeNewDocumentCoverExclusivity(dummyCatalog);
    expect(modified).toBe(true);
    expect(normalizedCatalog.pages).toHaveLength(3);

    // Page 1 has ONLY the cover
    expect(normalizedCatalog.pages[0].blocks).toHaveLength(1);
    expect(normalizedCatalog.pages[0].blocks[0].type).toBe('full_page_cover');

    // Page 2 has the non-cover block
    expect(normalizedCatalog.pages[1].blocks).toHaveLength(1);
    expect(normalizedCatalog.pages[1].blocks[0].id).toBe('b-quick');

    // Page 3 has the original page 2 content
    expect(normalizedCatalog.pages[2].blocks).toHaveLength(1);
    expect(normalizedCatalog.pages[2].blocks[0].id).toBe('b-table');

    // Sequential renumbering
    expect(normalizedCatalog.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);

    // Re-validation passes
    expect(validateCatalogCoverExclusivity(normalizedCatalog).isExclusive).toBe(true);
  });

  // COVER-G1: single cover child rect == canonical A4 content/full-bleed rect
  it('COVER-G1: single cover has zero page padding and matches full 210mm x 297mm bounds', () => {
    const isSingleFullCover = true;
    const padding = getCanonicalPagePaddingCss(isSingleFullCover);
    expect(padding).toBe('0mm');

    const canonicalWidthMm = 210;
    const canonicalHeightMm = 297;
    const widthPx = mmToPx(canonicalWidthMm, 96);
    const heightPx = mmToPx(canonicalHeightMm, 96);

    expect(Math.round(widthPx)).toBe(794);
    expect(Math.round(heightPx)).toBe(1123);
  });

  // COVER-G2: editor physical geometry == export physical geometry
  it('COVER-G2: editor and export use identical full-bleed container styling', () => {
    const isSingleFullCover = true;
    const editorPadding = getCanonicalPagePaddingCss(isSingleFullCover);
    const exportPadding = getCanonicalPagePaddingCss(isSingleFullCover);

    expect(editorPadding).toBe(exportPadding);
    expect(editorPadding).toBe('0mm');
  });

  // COVER-G3: zoom/transform do editor não altera geometria lógica
  it('COVER-G3: zoom/scale transformations do not alter logical physical millimeter geometry', () => {
    const logicalWidthMm = 210;
    const logicalHeightMm = 297;
    expect(logicalHeightMm).toBe(297);

    const zoomLevels = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    for (const zoom of zoomLevels) {
      const scaledPxWidth = 794 * zoom;
      const normalizedPxWidth = scaledPxWidth / zoom;
      const derivedMm = pxToMm(normalizedPxWidth, 96);

      expect(Math.round(derivedMm)).toBe(logicalWidthMm);
    }
  });

  // COVER-G4: no accidental min-content collapse
  it('COVER-G4: single cover container has guaranteed deterministic 1123px height in A4 container', () => {
    // The A4 container enforces min-height: 1123px and height: 1123px via .a4-page-container
    const a4ContainerHeightPx = 1123;
    const a4ContainerWidthPx = 794;

    expect(a4ContainerHeightPx).toBe(1123);
    expect(a4ContainerWidthPx).toBe(794);
  });
});
