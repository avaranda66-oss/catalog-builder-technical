import { Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectEditableRichText } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import { mmToU, uToQ, type CatalogDocument, type Cell, type TableModel, type TableObject } from '@/vnext/domain';
import type { LayoutSnapshot, PhysicalLayoutFact } from '@/vnext/rendering';
import type { SaveCatalogCasRequest } from '@/vnext/persistence';
import {
  ManualAutosaveClock,
  StrictCasCatalogRepository,
  deferred,
  documentFixture,
  runtimeFixture,
} from './w3h-fixtures';

/**
 * j04 at 1280 px (about 1 run in 20): after "Criar tabela" from an Excel block, the catalog stayed on "Alterações
 * não salvas" for good. The save of the previous change was still waiting for its confirmation when the new table
 * fitted its height. The fit re-synced the position/size fields in a passive effect (a default-priority update);
 * the confirmation then re-rendered the editor at sync priority, before that update, and the render copied the old
 * fields back into the ref the authoring barrier reads. Autosave asked "draft pending?" right then, heard yes, and
 * disarmed; the next render put the fields right without telling the workspace, so nothing armed it again.
 *
 * The order is the one Chromium showed, made deterministic: the save is held until React commits the fitted
 * height, and released right after that commit (its passive effects already ran, the default render not yet).
 * jsdom has no layout, so only the browser measurement is replaced (3 mm of padding plus 4,8 mm per line).
 */

const ROW_PADDING_MM = 3;
const LINE_MM = 4.8;
const EMPTY_ROW_MM = 6.5;
const DEBOUNCE_MS = 1200;

function cellLines(cell: Cell): number {
  const content = cell.content;
  if (content.type === 'empty') return 0;
  if (content.type !== 'richText') return 1;
  const text = projectEditableRichText(content.value) ?? '';
  return text === '' ? 0 : text.split('\n').length;
}

function rowMm(table: TableModel, rowId: string): number {
  const lines = Math.max(0, ...table.cells.filter((cell) => cell.rowId === rowId).map(cellLines));
  return lines === 0 ? EMPTY_ROW_MM : ROW_PADDING_MM + LINE_MM * lines;
}

function measuredSnapshot(document: CatalogDocument): LayoutSnapshot {
  const facts: PhysicalLayoutFact[] = [];
  for (const page of document.pages) for (const object of page.objects) {
    if (object.type !== 'table') continue;
    const table = object.table;
    const boundaries = [0];
    for (const row of table.rows) boundaries.push(boundaries[boundaries.length - 1] + rowMm(table, row.id));
    const boundariesQ = boundaries.map((mm) => uToQ(mmToU(mm)));
    facts.push({
      kind: 'table', pageId: page.id, objectId: object.id, tableId: table.id, frameWidthU: mmToU(object.frame.widthMm), columnWidthsU: [],
      frameQ: uToQ(mmToU(object.frame.widthMm)), trackQ: [], gridOffsetYQ: 0, renderedIntrinsicHeightQ: boundariesQ[boundariesQ.length - 1],
    });
    table.rows.forEach((row, index) => facts.push({
      kind: 'row', pageId: page.id, tableId: table.id, rowId: row.id, resolvedHeightU: mmToU(rowMm(table, row.id)),
      yQ: boundariesQ[index], heightQ: boundariesQ[index + 1] - boundariesQ[index],
    }));
  }
  return { facts, geometryDiagnostics: [] };
}

vi.mock('@/vnext/rendering/measurement', async (original) => {
  const actual = await original<typeof import('@/vnext/rendering/measurement')>();
  return {
    ...actual,
    // jsdom has no layout: the rows of the pasted table (AUTO height) cannot be measured, so only that is skipped.
    measureTables: vi.fn(),
    captureSnapshot: vi.fn(async (document: CatalogDocument) => measuredSnapshot(document)),
  };
});

let restoreMeasurement: (() => void) | undefined;

beforeEach(() => {
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  const computedStyle = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = nativeGetComputedStyle(element, pseudo);
    return new Proxy(style, {
      get(target, property) {
        if (property === 'transform' || property === 'scale' || property === 'translate' || property === 'rotate') return 'none';
        if (property === 'zoom') return '1';
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as CSSStyleDeclaration;
  });
  const originalDecode = HTMLImageElement.prototype.decode;
  const originalRects = Range.prototype.getClientRects;
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
  restoreMeasurement = () => {
    computedStyle.mockRestore();
    HTMLImageElement.prototype.decode = originalDecode;
    Range.prototype.getClientRects = originalRects;
  };
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  if (typeof globalThis.PointerEvent === 'undefined') globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  restoreMeasurement?.();
  restoreMeasurement = undefined;
});

/** 12 × 4 block exactly as Excel puts it on the clipboard (CRLF and a final line break). */
const excel12x4 = [
  'Modelo\tFaixa\tExatidão\tSaída',
  ...Array.from({ length: 11 }, (_, index) => `TA-${index + 1}N\t-25 °C a ${140 + index} °C\t±0,1 °C\t4 a 20 mA`),
].join('\r\n') + '\r\n';

function onlyTable(document: CatalogDocument): TableObject | undefined {
  return document.pages[0].objects.find((object): object is TableObject => object.type === 'table');
}

describe('autosave after "Criar tabela" while the previous save waits for its confirmation (j04 @1280)', { timeout: 20_000 }, () => {
  it('arms again and ends "Salvo" when the confirmation re-renders the editor before the fitted fields settle', async () => {
    const initial = documentFixture();
    const repository = new StrictCasCatalogRepository(initial);
    const clock = new ManualAutosaveClock();
    const active = runtimeFixture(repository, initial, 16100, { autosaveClock: clock, debounceMs: DEBOUNCE_MS });
    const workspace = active.runtime.workspace;

    // The confirmation of the first save is held; it is released right after React commits the fitted height.
    const confirmation = deferred<void>();
    repository.saveOverride = async (request: SaveCatalogCasRequest) => {
      await confirmation.promise;
      return repository.commitSave(request);
    };
    let createdHeightMm: number | undefined;
    let fitExecuted = false;
    let released = false;
    const unsubscribe = active.session.subscribe(() => {
      const table = onlyTable(active.session.getSnapshot().document);
      if (table && createdHeightMm !== undefined && table.frame.heightMm !== createdHeightMm) fitExecuted = true;
    });
    const onCommit = () => {
      if (!fitExecuted || released) return;
      released = true;
      confirmation.resolve();
    };

    render(<Profiler id="editor" onRender={onCommit}><VNextApp runtime={active.runtime} simpleByDefault /></Profiler>);

    // "Adicionar página" in j04: one change, its save starts after the debounce and stays in flight.
    act(() => {
      expect(active.session.execute({ type: 'document.rename', title: 'Ficha técnica' }).ok).toBe(true);
    });
    expect(clock.pendingCount()).toBe(1);
    await act(async () => { clock.advanceBy(DEBOUNCE_MS); });
    await waitFor(() => expect(repository.saveCAS).toHaveBeenCalledTimes(1));
    expect(workspace.getSnapshot().save.phase).toBe('saving');

    // B2 of j04: "Colar tabela do Excel" → paste → "Criar tabela", while that save is still in flight.
    fireEvent.click(screen.getByRole('button', { name: 'Colar tabela do Excel' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Cole aqui (Ctrl+V)' }), { target: { value: excel12x4 } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar tabela' }));
    const created = onlyTable(active.session.getSnapshot().document);
    expect(created?.table.rows).toHaveLength(12);
    createdHeightMm = created!.frame.heightMm;

    // The measured fit lands, React commits it, and the held confirmation is released right after.
    await waitFor(() => expect(released).toBe(true), { timeout: 5_000 });
    await waitFor(() => {
      expect(workspace.getSnapshot().save.phase).toBe('idle');
      expect(workspace.getAuthoringBarrier().hasPendingDraft()).toBe(false);
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    unsubscribe();

    const fittedHeightMm = onlyTable(active.session.getSnapshot().document)!.frame.heightMm;
    expect(fittedHeightMm).not.toBe(createdHeightMm);
    const afterConfirmation = workspace.getSnapshot();
    expect(afterConfirmation.dirty).toBe(true);
    expect(afterConfirmation.binding.kind === 'PERSISTED' && afterConfirmation.binding.remoteRevision).toBe(2);

    // The new table is not saved yet: autosave must be armed again, never stopped in silence.
    expect(clock.pendingCount(), 'autosave timer armed after the confirmation').toBe(1);
    await act(async () => { clock.advanceBy(DEBOUNCE_MS); });
    await waitFor(() => expect(repository.saveCAS).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const snapshot = workspace.getSnapshot();
      expect(snapshot.dirty).toBe(false);
      expect(snapshot.save.label).toBe('Saved');
    });
    // What is stored is what the father sees: the table with its fitted height (the stale fields were not applied).
    const stored = repository.current(initial.id).documentSnapshot;
    expect(stored).toEqual(active.session.getSnapshot().document);
    expect(onlyTable(stored)!.frame.heightMm).toBe(fittedHeightMm);
    await act(async () => { await active.runtime.dispose(); });
  });
});
