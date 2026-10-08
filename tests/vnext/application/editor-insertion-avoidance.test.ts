import { describe, expect, it } from 'vitest';
import { mmToU } from '@/vnext/domain';
import { createDocumentSession, type ObjectInsertSpec } from '@/vnext/application';
import { createInsertSpec, createW2CDemoDocument, type InsertTool } from '@/vnext/app/editor-defaults';

function occupiedWithShapes(rects: [number, number, number, number][]) {
  let next = 0;
  const createId = () => 'qa-' + ++next;
  const document = createW2CDemoDocument(createId);
  const session = createDocumentSession(document, { createId });
  for (const [x, y, width, height] of rects) {
    const page = session.getSnapshot().document.pages[0];
    const object = {
      ...createInsertSpec('shape', page),
      frameU: { xU: mmToU(x), yU: mmToU(y), widthU: mmToU(width), heightU: mmToU(height) },
    };
    expect(session.execute({ type: 'object.insert', pageId: page.id, object }).ok).toBe(true);
  }
  return structuredClone(session.getSnapshot().document.pages[0]);
}

const overlaps = (a: ObjectInsertSpec['frameU'], b: ObjectInsertSpec['frameU']) =>
  a.xU < b.xU + b.widthU
  && a.xU + a.widthU > b.xU
  && a.yU < b.yU + b.heightU
  && a.yU + a.heightU > b.yU;

describe('father-friendly object insertion on occupied A4 pages', () => {
  it.each<InsertTool>(['text', 'image', 'table'])('%s retains the established empty-page default', (tool) => {
    let next = 0;
    const createId = () => 'qa-' + ++next;
    const doc = createW2CDemoDocument(createId);
    expect(doc.pages[0].objects).toHaveLength(0);
    const before = structuredClone(doc);
    const first = createInsertSpec(tool, doc.pages[0]);
    expect(first.frameU.xU).toBeGreaterThan(0);
    expect(first.frameU.yU).toBeGreaterThan(0);
    expect(doc).toEqual(before);
    const second = createInsertSpec(tool, doc.pages[0]);
    expect(second).toEqual(first);
  });

  it.each<InsertTool>(['text', 'image', 'table'])('%s avoids covering its existing object', (tool) => {
    let next = 0;
    const createId = () => 'qa-' + ++next;
    const original = createW2CDemoDocument(createId);
    const session = createDocumentSession(original, { createId });
    const first = createInsertSpec(tool, original.pages[0]);
    const inserted = session.execute({ type: 'object.insert', pageId: original.pages[0].id, object: first });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const occupiedPage = session.getSnapshot().document.pages[0];
    const before = structuredClone(occupiedPage);
    const nextInsert = createInsertSpec(tool, occupiedPage);
    expect(overlaps(nextInsert.frameU, first.frameU)).toBe(false);
    expect(nextInsert.frameU).not.toEqual(first.frameU);
    expect(nextInsert.frameU.yU + nextInsert.frameU.heightU).toBeLessThanOrEqual(mmToU(277));
    expect(occupiedPage).toEqual(before);
  });

  it('places a second text in the remaining clear space without moving existing content', () => {
    let next = 0;
    const createId = () => 'qa-' + ++next;
    const original = createW2CDemoDocument(createId);
    const session = createDocumentSession(original, { createId });
    const first = createInsertSpec('text', original.pages[0]);
    const inserted = session.execute({ type: 'object.insert', pageId: original.pages[0].id, object: first });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const second = createInsertSpec('text', session.getSnapshot().document.pages[0]);
    expect(second.frameU.xU).toBe(first.frameU.xU);
    expect(second.frameU.yU).toBeGreaterThan(first.frameU.yU);
    expect(overlaps(second.frameU, first.frameU)).toBe(false);
  });

  it('finds a genuinely clear center column when narrow side elements block the default and edge slots', () => {
    const page = occupiedWithShapes([[20, 20, 3, 257], [185, 20, 5, 257]]);
    const inserted = createInsertSpec('text', page).frameU;
    expect(inserted.xU).toBeGreaterThanOrEqual(mmToU(25));
    expect(inserted.xU + inserted.widthU).toBeLessThanOrEqual(mmToU(183));
    expect(inserted.yU).toBeGreaterThanOrEqual(mmToU(20));
    expect(inserted.yU + inserted.heightU).toBeLessThanOrEqual(mmToU(277));
    for (const existing of page.objects) {
      expect(overlaps(inserted, {
        xU: mmToU(existing.frame.xMm), yU: mmToU(existing.frame.yMm),
        widthU: mmToU(existing.frame.widthMm), heightU: mmToU(existing.frame.heightMm),
      })).toBe(false);
    }
  });

  it('never invents a slot beyond the page safe bottom, even when the preferred position is blocked', () => {
    const page = occupiedWithShapes([[20, 20, 170, 83], [20, 155, 118, 1]]);
    page.safeArea = { leftMm: 20, rightMm: 20, topMm: 20, bottomMm: 160 };
    const candidate = createInsertSpec('table', page).frameU;
    const fallback = candidate.xU === mmToU(20) && candidate.yU === mmToU(122);
    expect(fallback || candidate.yU + candidate.heightU <= mmToU(137)).toBe(true);
  });

  it('retains the established fallback on a fully occupied page for preflight to report', () => {
    const page = occupiedWithShapes([[20, 20, 170, 257]]);
    const candidate = createInsertSpec('text', page).frameU;
    expect(candidate.xU).toBe(mmToU(20));
    expect(candidate.yU).toBe(mmToU(20));
  });
});
