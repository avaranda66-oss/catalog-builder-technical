import { describe, expect, it } from 'vitest';
import { plainRichText, type CatalogDocument, type EditorialObject } from '@/vnext/domain';
import { createCatalogDocument } from '@/vnext/application';
import { referencedAssetIds } from '@/vnext/asset/referenced-assets';
import {
  authoredFrameDiagnostics,
  imageResolutionDiagnostics,
  placeholderDiagnostics,
} from '@/vnext/publication/preflight';
import { extractSemanticTranslationCoverage } from '@/vnext/translation';

function ids(prefix = 'generated') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

const SMALL = { id: 'asset-small', version: '1', sha256: 'b'.repeat(64), mime: 'image/png' as const, widthPx: 400, heightPx: 566, name: 'pequena.png', alt: 'Pequena' };

function documentWith(objects: EditorialObject[], background?: CatalogDocument['pages'][number]['background']): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'Onda 3.5');
  return { ...base, assets: [SMALL], pages: [{ ...base.pages[0], ...(background ? { background } : {}), objects }] };
}

const label = (leader?: { anchorXMm: number; anchorYMm: number }): EditorialObject => ({
  id: 'callout', type: 'text', frame: { xMm: 14, yMm: 150, widthMm: 36, heightMm: 8 }, zIndex: 3,
  text: plainRichText('callout', 'Saída pneumática'), style: {},
  ...(leader ? { leader: { ...leader, head: 'dot' as const, elbow: true, color: '#092D4D', thicknessPt: 0.75 } } : {}),
});

describe('Onda 3.5 preflight of native elements', () => {
  it('a full-width diagonal band (polygon) touching the page edges is a decoration, not a safe-area problem', () => {
    const band: EditorialObject = { id: 'band', type: 'polygon', frame: { xMm: 0, yMm: 0, widthMm: 210, heightMm: 120 }, zIndex: -1,
      points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.55 }, { x: 0, y: 1 }], style: { fill: { kind: 'solid', color: '#092D4D' } } };
    expect(authoredFrameDiagnostics(documentWith([band]))).toEqual([]);
    const bleeding = { ...band, frame: { ...band.frame, xMm: -2, widthMm: 214 } } as EditorialObject;
    const diagnostics = authoredFrameDiagnostics(documentWith([bleeding]));
    expect(diagnostics.map((entry) => [entry.code, entry.severity])).toEqual([['OBJECT_OUTSIDE_PAGE', 'WARNING']]);
  });

  it('a callout pointer is checked where it is painted: an anchor off the page blocks, one on the page passes', () => {
    expect(authoredFrameDiagnostics(documentWith([label({ anchorXMm: 70, anchorYMm: -10 })]))).toEqual([]);
    const off = authoredFrameDiagnostics(documentWith([label({ anchorXMm: 200, anchorYMm: 0 })]));
    expect(off).toContainEqual(expect.objectContaining({ code: 'OBJECT_OUTSIDE_PAGE', severity: 'ERROR', objectId: 'callout' }));
    expect(off).toContainEqual(expect.objectContaining({ code: 'SAFE_AREA_VIOLATION', severity: 'WARNING', objectId: 'callout' }));
  });

  it('a page background picture is used by the catalog and checked for print resolution', () => {
    const document = documentWith([], { image: { assetId: 'asset-small', fit: 'cover' } });
    expect(referencedAssetIds(document).has('asset-small')).toBe(true);
    expect(imageResolutionDiagnostics(document)).toEqual([expect.objectContaining({ code: 'IMAGE_LOW_RESOLUTION', severity: 'WARNING', pageId: document.pages[0].id })]);
  });

  it('the words of a selo or a callout are printed text: provisional markers still block publication', () => {
    const pill: EditorialObject = { ...label(), text: plainRichText('pill', 'A completar'), box: { fill: '#092D4D', paddingMm: 2, fitText: true } } as EditorialObject;
    expect(placeholderDiagnostics(documentWith([pill]))).toEqual([expect.objectContaining({ code: 'UNRESOLVED_PLACEHOLDER', objectId: 'callout' })]);
  });

  it('translation reads the selo/callout words and accepts the new fields (polygon, styled line, page background)', async () => {
    const document = documentWith([
      { ...label({ anchorXMm: 70, anchorYMm: -10 }), box: { fill: '#092D4D', paddingMm: 2, fitText: true } } as EditorialObject,
      { id: 'band', type: 'polygon', frame: { xMm: 0, yMm: 0, widthMm: 210, heightMm: 120 }, zIndex: -1,
        points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], style: { fill: { kind: 'linear', from: '#092D4D', to: '#8A642B', angleDeg: 90 } } },
      { id: 'rule', type: 'line', axis: 'horizontal', color: '#8A642B', frame: { xMm: 14, yMm: 200, widthMm: 182, heightMm: 1 }, zIndex: 0, thicknessPt: 1, dash: 'dashed' },
    ], { color: '#F7F3EA' });
    const coverage = await extractSemanticTranslationCoverage(document);
    expect(coverage.eligible.some((leaf) => leaf.locator.kind === 'textObject' && 'objectId' in leaf.locator && leaf.locator.objectId === 'callout')).toBe(true);
    expect(coverage.excluded.some((entry) => entry.surfaceId === 'polygon:band')).toBe(true);
  });
});
