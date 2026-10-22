import { describe, expect, it } from 'vitest';
import { plainRichText, type TextObject } from '@/vnext/domain';
import { ObjectInsertSpecSchema, createCatalogDocument } from '@/vnext/application';
import {
  brandPalette,
  calloutInsertSpec,
  familyBarInsertSpecs,
  leaderAnchorOnPage,
  leaderWithAnchorOnPage,
  pillInsertSpec,
  pointFromMm,
  pointToMm,
  polygonFillOfKind,
  polygonHitClipPath,
  polygonInsertSpec,
} from '@/vnext/editor/native-element-authoring';

function ids(prefix = 'generated') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

const document = createCatalogDocument(ids('base'), 'Onda 3.5');
const style = { ...document.style, palette: ['#092D4D', '#8A642B', '#FFFFFF'] };
const page = { ...document.pages[0], objects: [{ id: 'o', type: 'shape' as const, shape: 'rectangle' as const, frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 }, zIndex: 4, style: {} }] };

describe('Onda 3.5 native element presets', () => {
  it('builds valid insert specs; the diagonal band goes behind everything, the others on top', () => {
    const band = polygonInsertSpec(page, style, 'diagonal');
    const triangle = polygonInsertSpec(page, style, 'triangle');
    expect(band.zIndex).toBe(3);
    expect(triangle.zIndex).toBe(5);
    expect(band.type === 'polygon' && band.style.fill).toEqual({ kind: 'solid', color: '#092D4D' });
    for (const spec of [band, triangle, polygonInsertSpec(page, style, 'trapezoid'), pillInsertSpec(page, style), calloutInsertSpec(page, style), ...familyBarInsertSpecs(page, style)]) {
      expect(ObjectInsertSpecSchema.safeParse(spec).success).toBe(true);
    }
  });

  it('the family bar is a row of selos with the last model highlighted in the accent colour', () => {
    const specs = familyBarInsertSpecs(page, style, ['A', 'B', 'C']);
    expect(specs.map((spec) => spec.type === 'text' && spec.box?.fill)).toEqual(['#EDF3F7', '#EDF3F7', '#8A642B']);
    expect(specs.map((spec) => spec.type === 'text' && spec.style.color)).toEqual(['#092D4D', '#092D4D', '#FFFFFF']);
  });

  it('uses the navy/white house colours when the catalog has no palette of its own', () => {
    expect(brandPalette({ ...style, palette: [] as unknown as typeof style.palette })).toEqual(['#003366', '#FFFFFF']);
  });

  it('switches fill kinds keeping the main colour', () => {
    const solid = { fill: { kind: 'solid' as const, color: '#092D4D' } };
    expect(polygonFillOfKind(solid, 'linear', ['#092D4D', '#8A642B']).fill).toEqual({ kind: 'linear', from: '#092D4D', to: '#8A642B', angleDeg: 90 });
    expect(polygonFillOfKind(solid, 'pattern', ['#092D4D']).fill).toMatchObject({ kind: 'pattern', color: '#092D4D', pattern: 'dots' });
  });

  it('converts vertices and callout tips between box fractions and page millimetres', () => {
    const frame = { widthMm: 210, heightMm: 120 };
    expect(pointToMm({ x: 0.5, y: 0.55 }, frame)).toEqual({ xMm: 105, yMm: 66 });
    expect(pointFromMm(250, -3, frame)).toEqual({ x: 1, y: 0 });
    const text: TextObject = { id: 't', type: 'text', frame: { xMm: 14, yMm: 158, widthMm: 36, heightMm: 7.5 }, zIndex: 0, text: plainRichText('t', 'Saída'), style: {} };
    const leader = { anchorXMm: 64, anchorYMm: -14, head: 'dot' as const, elbow: true, color: '#FFFFFF', thicknessPt: 0.75 };
    expect(leaderAnchorOnPage(text, leader)).toEqual({ xMm: 78, yMm: 144 });
    expect(leaderWithAnchorOnPage(text, leader, 95, 130)).toMatchObject({ anchorXMm: 81, anchorYMm: -28 });
  });

  it('the click area of a polygon is its own shape (CSS clip-path in % of the box)', () => {
    expect(polygonHitClipPath([{ x: 0, y: 0 }, { x: 0.6, y: 0 }, { x: 0.4, y: 1 }])).toBe('polygon(0% 0%, 60% 0%, 40% 100%)');
  });
});
