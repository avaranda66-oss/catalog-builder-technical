import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { createDocumentSession, executeApplicationAction } from '@/vnext/application';
import { mmToU, plainRichText, type CatalogDocument, type EditorialObject } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { EditorInteractionController } from '@/vnext/app/editor-interaction';
import { authoredFrameDiagnostics } from '@/vnext/publication';
import { diagnosticMessage } from '@/vnext/app/authoring-diagnostics';
import { publicationDiagnosticMessage } from '@/vnext/app/publication-diagnostic-presentation';
import { compilePlans, DocumentRenderer } from '@/vnext/rendering';

function ids(prefix = 'id') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
const shape = (id: string, xMm: number, zIndex: number, extra: Partial<EditorialObject> = {}): EditorialObject =>
  ({ id, type: 'shape', shape: 'rectangle', style: { fill: '#003f78' }, frame: { xMm, yMm: 20, widthMm: 10, heightMm: 10 }, zIndex, ...extra } as EditorialObject);
const text = (id: string, xMm: number, zIndex: number, words: string): EditorialObject =>
  ({ id, type: 'text', frame: { xMm, yMm: 20, widthMm: 30, heightMm: 10 }, zIndex, text: plainRichText(id + ':r', words), style: {} });
function doc(objects: EditorialObject[]): CatalogDocument {
  const base = createW2CDemoDocument(ids('seed'));
  return { ...base, pages: [{ ...base.pages[0], objects }] };
}
const frameU = (object: EditorialObject) => ({ xU: mmToU(object.frame.xMm), yU: mmToU(object.frame.yMm), widthU: mmToU(object.frame.widthMm), heightU: mmToU(object.frame.heightMm) });

describe('Onda 3.5 · object.setHidden', () => {
  it('hides and shows an object as undoable steps, checking the expected state', () => {
    const source = doc([shape('a', 10, 0), shape('b', 40, 1)]);
    const session = createDocumentSession(source, { createId: ids() });
    expect(session.execute({ type: 'object.setHidden', objectId: 'a', expectedHidden: true, hidden: false })).toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });
    expect(session.execute({ type: 'object.setHidden', objectId: 'a', expectedHidden: false, hidden: true }).ok).toBe(true);
    expect(session.getSnapshot().document.pages[0].objects[0]).toMatchObject({ id: 'a', hidden: true });
    const again = session.execute({ type: 'object.setHidden', objectId: 'a', expectedHidden: true, hidden: true });
    expect(again.ok && again.metadata.changed).toBe(false);
    expect(session.execute({ type: 'object.setHidden', objectId: 'a', expectedHidden: true, hidden: false }).ok).toBe(true);
    expect('hidden' in session.getSnapshot().document.pages[0].objects[0]).toBe(false);
    session.undo();
    expect(session.getSnapshot().document.pages[0].objects[0]).toMatchObject({ hidden: true });
    session.undo();
    expect(session.getSnapshot().document).toEqual(source);
  });

  it('is not painted (screen and PDF use the same renderer) and the preflight warns, without blocking', () => {
    const source = doc([shape('a', 10, 0, { hidden: true }), text('t', 40, 1, 'Visível')]);
    const { container } = render(<DocumentRenderer document={source} plans={compilePlans(source).plans} assetUrls={new Map()} />);
    const hidden = container.querySelector<HTMLElement>('[data-object-id="a"]')!;
    expect(hidden.style.visibility).toBe('hidden');
    expect(hidden).toHaveAttribute('data-object-hidden', 'true');
    expect(container.querySelector<HTMLElement>('[data-object-id="t"]')!.style.visibility).toBe('');
    const warnings = authoredFrameDiagnostics(source).filter((issue) => issue.code === 'OBJECT_HIDDEN');
    expect(warnings).toEqual([expect.objectContaining({ objectId: 'a', severity: 'WARNING' })]);
    expect(diagnosticMessage(warnings[0])).toMatch(/escondido.*não sairá no PDF/);
    expect(publicationDiagnosticMessage('OBJECT_HIDDEN')).toMatch(/Camadas/);
  });
});

describe('Onda 3.5 · objects.move (drag of several selected objects)', () => {
  it('moves every target by the same offset in one undo step', () => {
    const source = doc([shape('a', 10, 0), shape('b', 40, 1), shape('c', 70, 2)]);
    const session = createDocumentSession(source, { createId: ids() });
    const [a, b] = source.pages[0].objects;
    const result = session.execute({
      type: 'objects.move', pageId: source.pages[0].id,
      targets: [{ objectId: 'a', expectedFrame: frameU(a) }, { objectId: 'b', expectedFrame: frameU(b) }],
      dxU: mmToU(5), dyU: mmToU(-3),
    });
    expect(result.ok).toBe(true);
    const moved = session.getSnapshot().document.pages[0].objects;
    expect(moved.map((object) => [object.frame.xMm, object.frame.yMm])).toEqual([[15, 17], [45, 17], [70, 20]]);
    session.undo();
    expect(session.getSnapshot().document).toEqual(source);
  });

  it('refuses locked or changed targets without touching the document', () => {
    const source = doc([shape('a', 10, 0), shape('b', 40, 1, { locked: true })]);
    const [a, b] = source.pages[0].objects;
    const targets = [{ objectId: 'a', expectedFrame: frameU(a) }, { objectId: 'b', expectedFrame: frameU(b) }];
    expect(executeApplicationAction(source, { type: 'objects.move', pageId: source.pages[0].id, targets, dxU: 1, dyU: 0 }, { createId: ids() }))
      .toMatchObject({ ok: false, error: { code: 'OBJECT_LOCKED' } });
    const stale = [{ objectId: 'a', expectedFrame: { ...frameU(a), xU: 0 } }];
    expect(executeApplicationAction(source, { type: 'objects.move', pageId: source.pages[0].id, targets: stale, dxU: 1, dyU: 0 }, { createId: ids() }))
      .toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });
  });

  it('the drag controller moves the companions with the grabbed object and commits objects.move once', () => {
    const source = doc([shape('a', 10, 0), shape('b', 40, 1), shape('c', 100, 2)]);
    const session = createDocumentSession(source, { createId: ids() });
    const previews: unknown[] = [];
    let tx = 0;
    const controller = new EditorInteractionController({
      getDocument: () => session.getSnapshot().document, getActivePageId: () => source.pages[0].id,
      createTransactionId: () => 'tx-' + (++tx), isSnappingEnabled: () => false,
      execute: (action, context) => session.execute(action, context), onPreviewChange: (preview) => previews.push(preview),
    });
    expect(controller.begin({
      pointerId: 1, objectId: 'a', pageId: source.pages[0].id, kind: { type: 'move' }, clientX: 0, clientY: 0,
      pageClientWidthPx: 210, pageClientHeightPx: 297, companionObjectIds: ['b', 'a'],
    })).toBe(true);
    const preview = controller.move(1, 20, 10)!;
    expect(preview.companions?.map((entry) => entry.objectId)).toEqual(['b']);
    const companion = preview.companions![0];
    expect(companion.frameU.xU - companion.startFrameU.xU).toBe(preview.frameU.xU - preview.startFrameU.xU);
    const finished = controller.finish(1, 20, 10);
    expect(finished).toMatchObject({ status: 'committed', action: { type: 'objects.move' } });
    const objects = session.getSnapshot().document.pages[0].objects;
    expect(objects[0].frame.xMm - 10).toBeCloseTo(objects[1].frame.xMm - 40, 6);
    expect(objects[2].frame.xMm).toBe(100);
    session.undo();
    expect(session.getSnapshot().document).toEqual(source);
    // A locked companion stops the drag before it starts.
    const locked = createDocumentSession(doc([shape('a', 10, 0), shape('b', 40, 1, { locked: true })]), { createId: ids() });
    const refused = new EditorInteractionController({
      getDocument: () => locked.getSnapshot().document, getActivePageId: () => locked.getSnapshot().document.pages[0].id,
      createTransactionId: () => 'x', execute: (action, context) => locked.execute(action, context), onPreviewChange: () => undefined,
    });
    expect(refused.begin({ pointerId: 2, objectId: 'a', pageId: locked.getSnapshot().document.pages[0].id, kind: { type: 'move' }, clientX: 0, clientY: 0,
      pageClientWidthPx: 210, pageClientHeightPx: 297, companionObjectIds: ['b'] })).toBe(false);
  });
});

describe('Onda 3.5 · text inside a group is edited in place', () => {
  it('changes the grouped text, keeps the group frame, refuses when the group is locked', () => {
    const source = doc([text('t1', 10, 0, 'HIDRÁULICA'), text('t2', 50, 1, 'legenda')]);
    const session = createDocumentSession(source, { createId: ids('g') });
    const grouped = session.execute({ type: 'group.create', pageId: source.pages[0].id, objectIds: ['t1', 't2'] });
    expect(grouped.ok).toBe(true);
    const group = session.getSnapshot().document.pages[0].objects[0];
    if (group.type !== 'group') throw new Error('expected group');
    const child = group.objects.find((object) => object.id === 't1');
    if (child?.type !== 'text') throw new Error('expected text');
    const edited = session.execute({ type: 'text.setContent', objectId: 't1', expectedText: child.text, plainText: 'PNEUMÁTICA' });
    expect(edited.ok).toBe(true);
    const after = session.getSnapshot().document.pages[0].objects[0];
    expect(after.frame).toEqual(group.frame);
    expect(after.type === 'group' && after.objects[0].type === 'text' && after.objects[0].text.paragraphs[0].inlines[0]).toMatchObject({ text: 'PNEUMÁTICA' });
    session.undo();
    expect(session.getSnapshot().document.pages[0].objects[0]).toEqual(group);
    session.execute({ type: 'object.setLocked', objectId: group.id, expectedLocked: false, locked: true });
    expect(session.execute({ type: 'text.setContent', objectId: 't1', expectedText: child.text, plainText: 'X' }))
      .toMatchObject({ ok: false, error: { code: 'OBJECT_LOCKED' } });
  });
});
