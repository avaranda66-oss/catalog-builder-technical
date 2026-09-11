import { describe, expect, it } from 'vitest';
import { createDocumentSession } from '@/vnext/application';
import { mmToU, plainRichText, uToQ, type CatalogDocument } from '@/vnext/domain';
import { createMinimalW2CTable, createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { compilePlans } from '@/vnext/rendering';
import { authoredFrameDiagnostics, layoutReport } from '@/vnext/publication';

function ids(prefix = 'diag') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function shapeDocument(): CatalogDocument {
  const base = createW2CDemoDocument(ids('shape'));
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 },
      objects: [{
        id: 'shape-target',
        type: 'shape',
        frame: { xMm: 20, yMm: 20, widthMm: 30, heightMm: 20 },
        zIndex: 0,
        shape: 'rectangle',
        style: {},
      }],
    }],
  };
}

function tableDocument(): CatalogDocument {
  const base = createW2CDemoDocument(ids('table'));
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [{
        id: 'table-object',
        type: 'table',
        frame: { xMm: 20, yMm: 20, widthMm: 80, heightMm: 20 },
        zIndex: 0,
        table: createMinimalW2CTable(),
      }],
    }],
  };
}

describe('W2.D canonical authoring diagnostics', () => {
  it('keeps safe-area crossing legal and reports SAFE_AREA_VIOLATION as WARNING without changing the authored frame', () => {
    const session = createDocumentSession(shapeDocument(), { createId: ids('session') });
    const moved = session.execute({ type: 'object.move', objectId: 'shape-target', xU: mmToU(5), yU: mmToU(20) });
    expect(moved.ok).toBe(true);
    const beforeDiagnostics = JSON.stringify(session.getSnapshot().document.pages[0].objects[0].frame);
    const diagnostics = authoredFrameDiagnostics(session.getSnapshot().document);
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'SAFE_AREA_VIOLATION',
      severity: 'WARNING',
      objectId: 'shape-target',
    }));
    expect(JSON.stringify(session.getSnapshot().document.pages[0].objects[0].frame)).toBe(beforeDiagnostics);
  });

  it('keeps outside-page geometry authored and reports OBJECT_OUTSIDE_PAGE as blocking ERROR', () => {
    const session = createDocumentSession(shapeDocument(), { createId: ids('outside') });
    const moved = session.execute({ type: 'object.move', objectId: 'shape-target', xU: mmToU(-1), yU: mmToU(20) });
    expect(moved.ok).toBe(true);
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(-1);
    expect(authoredFrameDiagnostics(session.getSnapshot().document)).toContainEqual(expect.objectContaining({
      code: 'OBJECT_OUTSIDE_PAGE',
      severity: 'ERROR',
      objectId: 'shape-target',
    }));
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(-1);
  });

  it('reports TEXT_OBJECT_OVERFLOW as ERROR without resizing the Text frame', () => {
    const base = createW2CDemoDocument(ids('text'));
    const document: CatalogDocument = {
      ...base,
      pages: [{
        ...base.pages[0],
        objects: [{
          id: 'text-object',
          type: 'text',
          frame: { xMm: 20, yMm: 20, widthMm: 40, heightMm: 1 },
          zIndex: 0,
          text: plainRichText('empty', ''),
          style: {},
        }],
      }],
    };
    const root = window.document.createElement('div');
    root.innerHTML = '<div data-object-id="text-object"><div data-flow-root></div></div>';
    const flow = root.querySelector<HTMLElement>('[data-flow-root]')!;
    flow.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, toJSON: () => ({}),
    });
    const before = JSON.stringify(document.pages[0].objects[0].frame);
    const diagnostics = layoutReport(document, new Map(), { facts: [], geometryDiagnostics: [] }, root);
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'TEXT_OBJECT_OVERFLOW',
      severity: 'ERROR',
      objectId: 'text-object',
    }));
    expect(JSON.stringify(document.pages[0].objects[0].frame)).toBe(before);
  });

  it('reports TABLE_CONTENT_OVERFLOW as ERROR without changing the authored Table frame', () => {
    const document = tableDocument();
    const { plans } = compilePlans(document);
    const tableObject = document.pages[0].objects[0];
    expect(tableObject.type).toBe('table');
    if (tableObject.type !== 'table') return;
    const plan = plans.get(tableObject.table.id)!;
    const before = JSON.stringify(tableObject.frame);
    const diagnostics = layoutReport(document, plans, {
      geometryDiagnostics: [],
      facts: [{
        kind: 'table',
        pageId: document.pages[0].id,
        objectId: tableObject.id,
        tableId: tableObject.table.id,
        frameWidthU: plan.frameU,
        columnWidthsU: [...plan.widthsU],
        frameQ: plan.frameQ,
        trackQ: [...plan.trackQ],
        renderedIntrinsicHeightQ: uToQ(mmToU(30)),
      }],
    }, window.document.createElement('div'));
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'TABLE_CONTENT_OVERFLOW',
      severity: 'ERROR',
      objectId: 'table-object',
    }));
    expect(JSON.stringify(tableObject.frame)).toBe(before);
  });

  it('commits a valid narrow Table resize and reports TABLE_WIDTH_INFEASIBLE as ERROR', () => {
    const session = createDocumentSession(tableDocument(), { createId: ids('narrow') });
    const beforeTable = session.getSnapshot().document.pages[0].objects[0];
    expect(beforeTable.type).toBe('table');
    if (beforeTable.type !== 'table') return;
    const tableBefore = JSON.stringify(beforeTable.table);
    const resized = session.execute({
      type: 'object.resize',
      objectId: 'table-object',
      xU: mmToU(20),
      yU: mmToU(20),
      widthU: 1,
      heightU: mmToU(20),
    });
    expect(resized.ok).toBe(true);
    const committed = session.getSnapshot().document.pages[0].objects[0];
    expect(committed.type).toBe('table');
    if (committed.type !== 'table') return;
    expect(mmToU(committed.frame.widthMm)).toBe(1);
    expect(JSON.stringify(committed.table)).toBe(tableBefore);
    expect(compilePlans(session.getSnapshot().document).diagnostics).toContainEqual(expect.objectContaining({
      code: 'TABLE_WIDTH_INFEASIBLE',
      severity: 'ERROR',
      objectId: 'table-object',
    }));
    expect(mmToU(committed.frame.widthMm)).toBe(1);
  });

  it('does not emit global OBJECT_OVERLAP noise for intentional layered composition', () => {
    const document = shapeDocument();
    const page = document.pages[0];
    document.pages = [{
      ...page,
      safeArea: undefined,
      objects: [
        { ...page.objects[0], id: 'background', frame: { xMm: 20, yMm: 20, widthMm: 60, heightMm: 30 } },
        { ...page.objects[0], id: 'foreground', frame: { xMm: 30, yMm: 25, widthMm: 20, heightMm: 10 }, zIndex: 1 },
      ],
    }];
    const diagnostics = authoredFrameDiagnostics(document);
    expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: 'OBJECT_OVERLAP' }));
    expect(diagnostics).toEqual([]);
  });

  it('reports Group envelope geometry once while keeping grouped Text content diagnostics on the real child ID', () => {
    const base = createW2CDemoDocument(ids('group-diag'));
    const document: CatalogDocument = {
      ...base,
      pages: [{
        ...base.pages[0],
        safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 },
        objects: [{
          id: 'group',
          type: 'group',
          frame: { xMm: -1, yMm: 20, widthMm: 40, heightMm: 20 },
          zIndex: 0,
          objects: [
            {
              id: 'group-text',
              type: 'text',
              frame: { xMm: 0, yMm: 0, widthMm: 30, heightMm: 10 },
              zIndex: 0,
              text: plainRichText('group-text', ''),
              style: {},
            },
            {
              id: 'group-shape',
              type: 'shape',
              frame: { xMm: 30, yMm: 10, widthMm: 10, heightMm: 10 },
              zIndex: 1,
              shape: 'rectangle',
              style: {},
            },
          ],
        }],
      }],
    };
    const authored = authoredFrameDiagnostics(document);
    expect(authored).toContainEqual(expect.objectContaining({ code: 'OBJECT_OUTSIDE_PAGE', objectId: 'group' }));
    expect(authored).not.toContainEqual(expect.objectContaining({ code: 'OBJECT_OUTSIDE_PAGE', objectId: 'group-text' }));
    expect(authored).not.toContainEqual(expect.objectContaining({ code: 'SAFE_AREA_VIOLATION', objectId: 'group-text' }));

    const root = window.document.createElement('div');
    root.innerHTML = '<div data-object-id="group-text"><div data-flow-root></div></div>';
    const flow = root.querySelector<HTMLElement>('[data-flow-root]')!;
    flow.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 500, bottom: 100, width: 500, height: 100, toJSON: () => ({}),
    });
    expect(layoutReport(document, new Map(), { facts: [], geometryDiagnostics: [] }, root))
      .toContainEqual(expect.objectContaining({ code: 'TEXT_OBJECT_OVERFLOW', objectId: 'group-text' }));
  });
});
