import { createHash, webcrypto } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import { mmToU, qToU, sum, uToQ } from '@/vnext/domain/physical';
import { DocumentRenderer, compilePlans } from '@/vnext/rendering';
import { buildPaint } from '@/vnext/rendering/border-paint';
import { captureSnapshot, compareSnapshots, findElement, tableConstraints } from '@/vnext/rendering/measurement';
import { documentStyle, emptyTable } from '../proof/test-data';

const hashHook = vi.hoisted(() => ({ once: undefined as (() => void) | undefined }));
vi.mock('@/vnext/rendering/resources', async importOriginal => {
  const actual = await importOriginal<typeof import('@/vnext/rendering/resources')>();
  return { ...actual, sha256: async (value: string | ArrayBuffer | Uint8Array) => {
    const hash = await actual.sha256(value);
    const callback = hashHook.once; hashHook.once = undefined; callback?.();
    return hash;
  } };
});

afterEach(() => {
  hashHook.once = undefined;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren();
});
function rect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) };
}
/** jsdom supplies identities/styles; deterministic geometry isolates snapshot invariants, not browser layout. */
function fixture() {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  const table = emptyTable(2, 2);
  table.cells[0].content = { type: 'richText', value: plainRichText('precise', '00017 ±0,01% μA') };
  table.cells[2].content = { type: 'richText', value: plainRichText('range', '−35…180 °C') };
  const object = { id: 'table-object', type: 'table' as const, table, zIndex: 0,
    frame: { xMm: 10, yMm: 20, widthMm: 80, heightMm: 20 } };
  const doc: CatalogDocument = { id: 'measurement-document', schemaVersion: 1, title: 'Precisão', locale: 'pt-BR',
    style: documentStyle, assets: [], pages: [{ id: 'page', widthMm: 210, heightMm: 297, objects: [object] }] };
  const plans = compilePlans(doc).plans, plan = plans.get(table.id)!;
  plan.rowQ = [1280, 1280]; plan.heightsU = plan.rowQ.map(qToU); plan.gridOffsetYQ = 0;
  plan.edges = buildPaint(table, plan.trackQ, plan.rowQ, plan.styles).edges;
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<DocumentRenderer document={doc} plans={plans} assetUrls={new Map()} />);
  document.body.append(root);
  const grid = findElement(root, 'data-table-id', table.id);
  const objectX = uToQ(mmToU(object.frame.xMm)) / 64, objectY = uToQ(mmToU(object.frame.yMm)) / 64;
  const cellBounds = (node: HTMLElement) => {
    const cell = table.cells.find(value => value.id === node.dataset.cellId)!;
    const row = table.rows.findIndex(value => value.id === cell.rowId), col = table.columns.findIndex(value => value.id === cell.columnId);
    return rect(objectX + sum(plan.trackQ.slice(0, col)) / 64 + Number(node.dataset.qaOffset ?? 0), objectY + row * 20, plan.trackQ[col] / 64, 20);
  };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.pageId) return rect(0, 0, uToQ(mmToU(210)) / 64, uToQ(mmToU(297)) / 64);
    if (this.dataset.objectId) return rect(objectX, objectY, plan.frameQ / 64, uToQ(mmToU(object.frame.heightMm)) / 64);
    if (this.dataset.tableId || this.dataset.tableIntrinsic) return rect(objectX, objectY, plan.frameQ / 64, 40);
    if (this.dataset.cellId) return cellBounds(this);
    if (this.dataset.paintEdge) {
      const edge = plan.edges.find(value => value.id === this.dataset.paintEdge)!;
      return rect(objectX + edge.xQ / 64, objectY + edge.yQ / 64, edge.widthQ / 64, edge.heightQ / 64);
    }
    const cell = this.closest<HTMLElement>('[data-cell-id]');
    if (cell) {
      const bounds = cellBounds(cell), padding = plan.styles.get(cell.dataset.cellId!)!.paddingQ;
      return rect(bounds.x + padding.left / 64, bounds.y + padding.top / 64,
        bounds.width - (padding.left + padding.right) / 64, Number(cell.dataset.qaFlowHeight ?? 12));
    }
    return rect(0, 0, 0, 0);
  });
  const nativeComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => new Proxy(nativeComputedStyle(element), {
    get(target, property) {
      if (['transform', 'scale', 'translate', 'rotate'].includes(String(property))) return 'none';
      if (property === 'zoom') return '1';
      const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value;
    },
  }));
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    let selected: Node;
    return { selectNodeContents: (node: Node) => { selected = node; }, getClientRects: () => {
      const flow = selected.parentElement!.closest<HTMLElement>('[data-flow-root]')!.getBoundingClientRect();
      return [rect(flow.x, flow.y, 20, 12)];
    } } as unknown as Range;
  });
  return { doc, root, grid, table, plan, plans };
}

describe('Measurement pass identity and geometry contracts', () => {
  it('keeps every physical fact, precise text hash and repeat-snapshot stability', async () => {
    const { doc, root, table, plan, plans } = fixture();
    const authored = structuredClone(doc), first = await captureSnapshot(doc, plans, root);
    expect(first.geometryDiagnostics).toEqual([]);
    expect(first.facts.filter(fact => fact.kind === 'cell')).toHaveLength(4);
    expect(first.facts.filter(fact => fact.kind === 'paintEdge')).toHaveLength(plan.edges.length);
    const precise = first.facts.find(fact => fact.kind === 'cell' && fact.cellId === table.cells[0].id);
    const hash = createHash('sha256').update(JSON.stringify([['P', 'precise:p'], ['T', 'precise:p', 'precise:t', 0, 0, 0, 1280, 768]])).digest('hex');
    expect(precise).toMatchObject({ xQ: 0, yQ: 0, widthQ: plan.trackQ[0], heightQ: 1280, intrinsicContentWidthQ: 1280,
      intrinsicContentHeightQ: 768, textFlowSignature: hash });
    const second = await captureSnapshot(doc, plans, root);
    expect(second).toEqual(first); expect(compareSnapshots(first, second)).toEqual([]); expect(doc).toEqual(authored);
  });

  it.each(['data-cell-id', 'data-paint-edge'])('retains duplicate and missing %s rejection before capture', async attribute => {
    const { doc, root, grid, plans } = fixture();
    const original = grid.querySelector<HTMLElement>(`[${attribute}]`)!;
    const duplicate = original.cloneNode(true) as HTMLElement; grid.append(duplicate);
    await expect(captureSnapshot(doc, plans, root)).rejects.toMatchObject({ code: 'LAYOUT_UNSTABLE', message: `LAYOUT_UNSTABLE: Unexpected/missing/duplicate DOM identity: ${attribute}` });
    duplicate.remove(); original.remove();
    await expect(captureSnapshot(doc, plans, root)).rejects.toMatchObject({ code: 'LAYOUT_UNSTABLE', message: `LAYOUT_UNSTABLE: Unexpected/missing/duplicate DOM identity: ${attribute}` });
  });

  it('keeps first-match lookup outside capture and missing-cell error detail in constraints', () => {
    const { root, grid, table, plan } = fixture();
    const original = grid.querySelector<HTMLElement>('[data-cell-id]')!;
    const first = original.cloneNode(true) as HTMLElement; first.dataset.qaFlowHeight = '25'; grid.prepend(first);
    expect(findElement(grid, 'data-cell-id', original.dataset.cellId!)).toBe(first);
    expect(tableConstraints(table, root, plan).constraints[0].requiredQ).toBe(1600 + plan.styles.get(table.cells[0].id)!.paddingQ.top + plan.styles.get(table.cells[0].id)!.paddingQ.bottom);
    first.remove(); original.remove();
    expect(() => tableConstraints(table, root, plan)).toThrow('RENDER_ELEMENT_MISSING: data-cell-id=cell0-0');
  });

  it.each(['duplicate', 'remove'])('rejects %s of an already measured cell during asynchronous text hashing', async mutation => {
    const { doc, root, grid, plans } = fixture();
    hashHook.once = () => {
      const cell = grid.querySelector('[data-cell-id]')!;
      if (mutation === 'duplicate') grid.prepend(cell.cloneNode(true)); else cell.remove();
    };
    await expect(captureSnapshot(doc, plans, root)).rejects.toMatchObject({ code: 'LAYOUT_UNSTABLE', message: 'LAYOUT_UNSTABLE: Unexpected/missing/duplicate DOM identity: data-cell-id' });
  });

  it('refreshes an unmeasured replaced node during hashing and never reuses a prior-pass node', async () => {
    const { doc, root, grid, plans } = fixture();
    hashHook.once = () => {
      const cell = grid.querySelector<HTMLElement>('[data-cell-id="cell1-0"]')!, replacement = cell.cloneNode(true) as HTMLElement;
      replacement.dataset.qaOffset = '2'; cell.replaceWith(replacement);
    };
    const first = await captureSnapshot(doc, plans, root);
    expect(first.facts.find(fact => fact.kind === 'cell' && fact.cellId === 'cell1-0')).toMatchObject({ xQ: 128 });
    expect(first.geometryDiagnostics).toContainEqual(expect.objectContaining({ code: 'RENDER_GEOMETRY_MISMATCH', cellId: 'cell1-0' }));
    expect(await captureSnapshot(doc, plans, root)).toEqual(first);
  });

  it('retains the precise missing-edge error if an edge disappears during hashing', async () => {
    const { doc, root, grid, plan, plans } = fixture();
    hashHook.once = () => grid.querySelector('[data-paint-edge]')!.remove();
    await expect(captureSnapshot(doc, plans, root)).rejects.toMatchObject({ code: 'RENDER_ELEMENT_MISSING', message: `RENDER_ELEMENT_MISSING: data-paint-edge=${plan.edges[0].id}` });
  });
});
