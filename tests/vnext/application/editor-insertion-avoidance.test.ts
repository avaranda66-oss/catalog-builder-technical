import { describe, expect, it } from 'vitest';
import { mmToU } from '@/vnext/domain';
import { createDocumentSession, type ObjectInsertSpec } from '@/vnext/application';
import { createInsertSpec, createW2CDemoDocument, type InsertTool } from '@/vnext/app/editor-defaults';

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
});
