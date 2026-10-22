import { renderToStaticMarkup } from 'react-dom/server';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { plainRichText, type CatalogDocument, type EditorialObject } from '@/vnext/domain';
import { createCatalogDocument } from '@/vnext/application';
import { compilePlans, DocumentRenderer } from '@/vnext/rendering';
import { gradientVector, leaderGeometry, svgDashArray } from '@/vnext/rendering/native-paint';

function ids(prefix = 'generated') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

const ASSET = { id: 'asset-bg', version: '1', sha256: 'a'.repeat(64), mime: 'image/png' as const, widthPx: 2481, heightPx: 3509, name: 'fundo.png', alt: 'Fundo' };

function documentWith(objects: EditorialObject[], background?: CatalogDocument['pages'][number]['background']): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'Onda 3.5');
  return { ...base, assets: [ASSET], pages: [{ ...base.pages[0], ...(background ? { background } : {}), objects }] };
}

function html(document: CatalogDocument, assetUrls = new Map<string, string>()): string {
  return renderToStaticMarkup(<DocumentRenderer document={document} plans={compilePlans(document).plans} assetUrls={assetUrls} />);
}

const frame = { xMm: 10, yMm: 10, widthMm: 40, heightMm: 20 };

describe('Onda 3.5 native paint (screen and PDF share this DOM)', () => {
  it('renders a plain shape, line and text exactly as before (no new attributes)', () => {
    const document = documentWith([
      { id: 's', type: 'shape', shape: 'rectangle', frame, zIndex: 0, style: { fill: '#EDF5FF', stroke: { pattern: 'solid', thicknessPt: 1, color: '#003F78' } } },
      { id: 'l', type: 'line', axis: 'horizontal', color: '#003366', frame: { ...frame, heightMm: 0.8 }, zIndex: 1 },
      { id: 't', type: 'text', frame, zIndex: 2, text: plainRichText('t', 'Texto'), style: {} },
    ]);
    const markup = html(document);
    expect(markup).toContain('border:1pt solid #003F78');
    expect(markup).toContain('border-radius:0');
    expect(markup).not.toContain('<svg');
    expect(markup).not.toContain('data-page-background');
    expect(markup).not.toContain('data-text-box');
  });

  it('draws shape opacity, rounded corners and a dashed outline', () => {
    const markup = html(documentWith([{ id: 's', type: 'shape', shape: 'rectangle', frame, zIndex: 0,
      style: { fill: '#8A642B', stroke: { pattern: 'solid', thicknessPt: 1.5, color: '#092D4D' }, strokeDash: 'dashed', cornerRadiusMm: 2, opacity: 0.5 } }]));
    expect(markup).toContain('border:1.5pt dashed #092D4D');
    expect(markup).toContain('opacity:0.5');
    expect(markup).toMatch(/border-radius:\d/);
  });

  it('draws a styled line as a vector stroke through the middle of its box', () => {
    const markup = html(documentWith([{ id: 'l', type: 'line', axis: 'horizontal', color: '#8A642B', frame: { ...frame, heightMm: 4 }, zIndex: 0,
      thicknessPt: 2, dash: 'dashed', opacity: 0.7 }]));
    expect(markup).toContain('data-primitive-type="line"');
    expect(markup).toContain('<line');
    expect(markup).toContain('y1="2"');
    expect(markup).toContain('stroke-dasharray');
    expect(markup).toContain('opacity:0.7');
  });

  it('draws a polygon with solid, gradient and pattern fills in millimetre units', () => {
    const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.55 }, { x: 0, y: 1 }];
    const solid = html(documentWith([{ id: 'p', type: 'polygon', frame: { xMm: 0, yMm: 0, widthMm: 210, heightMm: 120 }, zIndex: 0, points,
      style: { fill: { kind: 'solid', color: '#092D4D' } } }]));
    expect(solid).toContain('viewBox="0 0 210 120"');
    expect(solid).toContain('points="0,0 210,0 210,66 0,120"');
    expect(solid).toContain('fill="#092D4D"');
    const gradient = html(documentWith([{ id: 'p', type: 'polygon', frame, zIndex: 0, points,
      style: { fill: { kind: 'linear', from: '#092D4D', to: '#8A642B', angleDeg: 90 } } }]));
    expect(gradient).toContain('<linearGradient');
    expect(gradient).toMatch(/fill="url\(#vnext-paint-[^"]+\)"/);
    const pattern = html(documentWith([{ id: 'p', type: 'polygon', frame, zIndex: 0, points,
      style: { fill: { kind: 'pattern', pattern: 'dots', color: '#FFFFFF', background: '#092D4D', spacingMm: 4 } } }]));
    expect(pattern).toContain('<pattern');
    expect(pattern).toContain('<circle');
    expect(pattern).toContain('fill="#092D4D"');
  });

  it('two renders of the same page (canvas and thumbnail) never share an SVG paint id', () => {
    const document = documentWith([{ id: 'p', type: 'polygon', frame, zIndex: 0, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
      style: { fill: { kind: 'pattern', pattern: 'waves', color: '#FFFFFF', spacingMm: 4 } } }]);
    const plans = compilePlans(document).plans;
    const view = render(<>
      <DocumentRenderer document={document} plans={plans} assetUrls={new Map()} />
      <DocumentRenderer document={document} plans={plans} assetUrls={new Map()} />
    </>);
    const patternIds = [...view.container.querySelectorAll('pattern')].map((element) => element.id);
    expect(patternIds).toHaveLength(2);
    expect(new Set(patternIds).size).toBe(2);
  });

  it('paints a selo (text with its own pill background) and a callout pointer from the same text object', () => {
    const markup = html(documentWith([{ id: 't', type: 'text', frame: { xMm: 14, yMm: 150, widthMm: 36, heightMm: 8 }, zIndex: 0,
      text: plainRichText('t', 'Saída pneumática'), style: { color: '#FFFFFF', letterSpacingEm: 0.05 },
      box: { fill: '#092D4D', paddingMm: 2, fitText: true },
      leader: { anchorXMm: 70, anchorYMm: -10, head: 'arrow', elbow: true, color: '#092D4D', thicknessPt: 0.75 } }]));
    expect(markup).toContain('data-text-box=""');
    expect(markup).toContain('background:#092D4D');
    expect(markup).toContain('letter-spacing:0.05em');
    expect(markup).toContain('data-callout-leader=""');
    expect(markup).toContain('<polyline');
    expect(markup).toContain('white-space:pre');
  });

  it('paints the page background colour and picture on the page itself, not as an object', () => {
    const markup = html(documentWith([], { color: '#F7F3EA', image: { assetId: 'asset-bg', fit: 'cover' } }), new Map([['asset-bg', 'blob:fundo']]));
    expect(markup).toContain('data-page-background=""');
    expect(markup).toContain('background-color:#F7F3EA');
    expect(markup).toContain('background-image:url(&quot;blob:fundo&quot;)');
    expect(markup).toContain('background-size:cover');
    expect(markup).not.toContain('data-object-id');
  });
});

describe('Onda 3.5 paint geometry', () => {
  it('gradient angles: 0° left to right, 90° top to bottom', () => {
    expect(gradientVector(0)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
    expect(gradientVector(90)).toEqual({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
  });

  it('dash arrays grow with the stroke and a solid stroke has none', () => {
    expect(svgDashArray('solid', 1)).toBeUndefined();
    expect(svgDashArray(undefined, 1)).toBeUndefined();
    expect(svgDashArray('dashed', 1)).toBe('3 2');
    expect(svgDashArray('dotted', 0.1)).toBe('0 0.6');
  });

  it('the pointer leaves the side of the label facing the anchor, and its painted extent includes the head', () => {
    const right = leaderGeometry({ widthMm: 36, heightMm: 8 }, { anchorXMm: 70, anchorYMm: -10, head: 'dot', elbow: true, color: '#000000', thicknessPt: 0.75 });
    expect(right.points).toEqual([[36, 4], [53, 4], [70, -10]]);
    expect(right.bounds.maxX).toBeGreaterThan(70);
    expect(right.bounds.minY).toBeLessThan(-10);
    const below = leaderGeometry({ widthMm: 36, heightMm: 8 }, { anchorXMm: 10, anchorYMm: 30, head: 'none', elbow: false, color: '#000000', thicknessPt: 1 });
    expect(below.points).toEqual([[18, 8], [10, 30]]);
    const inside = leaderGeometry({ widthMm: 36, heightMm: 8 }, { anchorXMm: 10, anchorYMm: 4, head: 'arrow', elbow: false, color: '#000000', thicknessPt: 1 });
    expect(inside.points).toEqual([]);
    expect(inside.bounds).toEqual({ minX: 0, minY: 0, maxX: 36, maxY: 8 });
  });
});
