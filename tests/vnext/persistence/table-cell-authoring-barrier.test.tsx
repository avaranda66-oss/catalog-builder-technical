import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { VNextApp } from '@/vnext/app/VNextApp';
import type { CatalogDocument } from '@/vnext/domain';
import type { VNextPersistenceRuntime } from '@/vnext/persistence';
import type { AuthoringRecoveryOverlay } from '@/vnext/recovery';
import {
  createW4BTableDocument,
  W4B_OBJECT_ID,
  W4B_PAGE_ID,
  W4B_TABLE_ID,
} from '../proof/fixtures/w4b-table-document';
import {
  ManualAutosaveClock,
  StrictCasCatalogRepository,
  runtimeFixture,
  settleAsyncWork,
} from './w3h-fixtures';

afterEach(cleanup);

beforeEach(() => {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  if (typeof globalThis.PointerEvent === 'undefined') {
    globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  }
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

function codeContent(document: CatalogDocument, cellId = 'w4b-code') {
  const object = document.pages[0]?.objects.find((entry) => entry.id === W4B_OBJECT_ID);
  if (!object || object.type !== 'table') throw new Error('Missing W4.B table');
  const cell = object.table.cells.find((entry) => entry.id === cellId);
  if (!cell) throw new Error('Missing W4.B cell');
  return cell.content;
}

type TableCellRecoveryOverlay = Extract<AuthoringRecoveryOverlay, { kind: 'TABLE_CELL_DRAFT_V1' }>;

function tableCellOverlay(
  expectedContent: TableCellRecoveryOverlay['expectedContent'] = {
    type: 'technicalCode',
    value: 'TC-001',
  },
): TableCellRecoveryOverlay {
  return {
    kind: 'TABLE_CELL_DRAFT_V1',
    pageId: W4B_PAGE_ID,
    objectId: W4B_OBJECT_ID,
    tableId: W4B_TABLE_ID,
    cellId: 'w4b-code',
    expectedContent,
    activeType: 'technicalCode',
    draft: {
      richText: '',
      technicalCode: 'RECOVERED-CODE',
      measurement: { valueText: '', unit: '', qualifier: '' },
    },
    compositionWasActive: true,
  };
}

function seedRecoveredOverlay(
  runtime: VNextPersistenceRuntime,
  overlay: AuthoringRecoveryOverlay,
): string {
  const openSessionId = runtime.workspace.getSnapshot().binding.openSessionId;
  const writable = runtime as unknown as {
    recoveredOverlay?: { openSessionId: string; overlay: AuthoringRecoveryOverlay };
  };
  writable.recoveredOverlay = { openSessionId, overlay };
  return openSessionId;
}

async function dispose(runtime: VNextPersistenceRuntime) {
  await act(async () => {
    await runtime.dispose();
  });
}

describe('W4.B cell draft AuthoringBarrier and Recovery integration', () => {
  it('restores an exact unchanged cell draft, consumes the overlay once, and cancel leaves canonical content untouched', async () => {
    const document = createW4BTableDocument();
    const repository = new StrictCasCatalogRepository(document);
    const active = runtimeFixture(repository, document, 12000, { autosave: false });
    const openSessionId = seedRecoveredOverlay(active.runtime, tableCellOverlay());
    const { container } = render(<VNextApp runtime={active.runtime} />);

    await waitFor(() => {
      expect(container.querySelector<HTMLInputElement>('[data-cell-technical-code]')?.value)
        .toBe('RECOVERED-CODE');
    });
    expect(active.runtime.getRecoveredOverlay(openSessionId)).toBeUndefined();
    expect(codeContent(active.session.getSnapshot().document)).toEqual({
      type: 'technicalCode',
      value: 'TC-001',
    });

    const barrier = active.runtime.workspace.getAuthoringBarrier();
    expect(barrier.hasPendingDraft()).toBe(true);
    expect(barrier.captureRecoveryOverlay?.()).toMatchObject({
      kind: 'TABLE_CELL_DRAFT_V1',
      pageId: W4B_PAGE_ID,
      objectId: W4B_OBJECT_ID,
      tableId: W4B_TABLE_ID,
      cellId: 'w4b-code',
      expectedContent: { type: 'technicalCode', value: 'TC-001' },
      draft: { technicalCode: 'RECOVERED-CODE' },
      compositionWasActive: false,
    });

    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="cancel-cell-content"]')!);
    await waitFor(() => expect(container.querySelector('[data-cell-edit-session]')).toBeNull());
    expect(barrier.hasPendingDraft()).toBe(false);
    expect(codeContent(active.session.getSnapshot().document)).toEqual({
      type: 'technicalCode',
      value: 'TC-001',
    });
    await dispose(active.runtime);
  });

  it('rejects stale or non-editable recovered targets and consumes each rejected overlay exactly once', async () => {
    const cases: Array<{ name: string; overlay: AuthoringRecoveryOverlay }> = [
      {
        name: 'stale content',
        overlay: tableCellOverlay({ type: 'technicalCode', value: 'OLD' }),
      },
      {
        name: 'missing page',
        overlay: { ...tableCellOverlay(), pageId: 'missing-page' },
      },
      {
        name: 'missing object/table',
        overlay: { ...tableCellOverlay(), objectId: 'missing-object' },
      },
      {
        name: 'wrong table id',
        overlay: { ...tableCellOverlay(), tableId: 'wrong-table' },
      },
      {
        name: 'missing cell',
        overlay: { ...tableCellOverlay(), cellId: 'missing-cell' },
      },
      {
        name: 'covered cell',
        overlay: {
          ...tableCellOverlay(),
          cellId: 'w4b-covered',
          expectedContent: { type: 'empty' },
          activeType: 'empty',
        },
      },
    ];

    for (const testCase of cases) {
      const document = createW4BTableDocument();
      const repository = new StrictCasCatalogRepository(document);
      const active = runtimeFixture(repository, document, 12100 + cases.indexOf(testCase), { autosave: false });
      const openSessionId = seedRecoveredOverlay(active.runtime, testCase.overlay);
      const view = render(<VNextApp runtime={active.runtime} />);

      await waitFor(() => {
        expect(view.container.textContent).toContain(
          'O rascunho local não pôde ser aplicado porque o objeto mudou.'
        );
      });
      expect(view.container.querySelector('[data-cell-edit-session]'), testCase.name).toBeNull();
      expect(active.runtime.getRecoveredOverlay(openSessionId), testCase.name).toBeUndefined();
      expect(codeContent(active.session.getSnapshot().document), testCase.name).toEqual({
        type: 'technicalCode',
        value: 'TC-001',
      });
      view.unmount();
      await dispose(active.runtime);
    }
  });

  it('keeps autosave off an active cell draft, then commits the valid draft through the Save barrier and persists it', async () => {
    const document = createW4BTableDocument();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const active = runtimeFixture(repository, document, 12200, {
      autosaveClock: clock,
      debounceMs: 25,
    });
    seedRecoveredOverlay(active.runtime, tableCellOverlay());

    act(() => {
      expect(active.session.execute({ type: 'document.rename', title: 'Dirty W4.B' }).ok).toBe(true);
    });
    expect(clock.pendingCount()).toBe(1);
    const { container } = render(<VNextApp runtime={active.runtime} />);

    await waitFor(() => {
      expect(container.querySelector<HTMLInputElement>('[data-cell-technical-code]')?.value)
        .toBe('RECOVERED-CODE');
      expect(active.runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(true);
    });
    expect(clock.pendingCount()).toBe(0);

    await act(async () => {
      clock.advanceBy(100);
      await settleAsyncWork(4);
    });
    expect(repository.saveCAS).not.toHaveBeenCalled();
    expect(codeContent(active.session.getSnapshot().document)).toEqual({
      type: 'technicalCode',
      value: 'TC-001',
    });

    let saveResult;
    await act(async () => {
      saveResult = await active.runtime.manualSave();
      await active.runtime.saveCoordinator.waitForActiveSave();
    });
    expect(saveResult).toEqual(expect.objectContaining({ ok: true }));
    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
    expect(codeContent(repository.current(document.id).documentSnapshot)).toEqual({
      type: 'technicalCode',
      value: 'RECOVERED-CODE',
    });
    expect(active.runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(false);
    await dispose(active.runtime);
  });

  it('blocks Save while IME composition is active and preserves the draft without dispatch', async () => {
    const document = createW4BTableDocument();
    const repository = new StrictCasCatalogRepository(document);
    const active = runtimeFixture(repository, document, 12300, { autosave: false });
    seedRecoveredOverlay(active.runtime, tableCellOverlay());
    const { container } = render(<VNextApp runtime={active.runtime} />);

    const input = await waitFor(() => {
      const found = container.querySelector<HTMLInputElement>('[data-cell-technical-code]');
      if (!found) throw new Error('Missing technical code input');
      return found;
    });
    fireEvent.compositionStart(input);
    expect(active.runtime.workspace.getAuthoringBarrier().prepareForSave()).toMatchObject({
      ok: false,
      reason: 'COMPOSITION_ACTIVE',
    });

    let result;
    await act(async () => {
      result = await active.runtime.manualSave();
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'AUTHORING_BLOCKED' } });
    expect(repository.saveCAS).not.toHaveBeenCalled();
    expect(input.value).toBe('RECOVERED-CODE');
    expect(codeContent(active.session.getSnapshot().document)).toEqual({
      type: 'technicalCode',
      value: 'TC-001',
    });
    fireEvent.compositionEnd(input);
    await dispose(active.runtime);
  });

  it('blocks invalid and stale cell drafts while preserving the visible draft', async () => {
    for (const mode of ['invalid', 'stale'] as const) {
      const document = createW4BTableDocument();
      const repository = new StrictCasCatalogRepository(document);
      const active = runtimeFixture(repository, document, mode === 'invalid' ? 12400 : 12500, { autosave: false });
      seedRecoveredOverlay(active.runtime, tableCellOverlay());
      const view = render(<VNextApp runtime={active.runtime} />);
      const input = await waitFor(() => {
        const found = view.container.querySelector<HTMLInputElement>('[data-cell-technical-code]');
        if (!found) throw new Error('Missing technical code input');
        return found;
      });

      if (mode === 'invalid') {
        fireEvent.change(input, { target: { value: '' } });
      } else {
        act(() => {
          const result = active.session.execute({
            type: 'table.cell.setContent',
            pageId: W4B_PAGE_ID,
            objectId: W4B_OBJECT_ID,
            tableId: W4B_TABLE_ID,
            cellId: 'w4b-code',
            expectedContent: { type: 'technicalCode', value: 'TC-001' },
            content: { type: 'technicalCode', value: 'EXTERNAL' },
          });
          expect(result.ok).toBe(true);
        });
      }

      const barrier = active.runtime.workspace.getAuthoringBarrier();
      let prepareResult;
      act(() => {
        prepareResult = barrier.prepareForSave();
      });
      expect(prepareResult).toMatchObject({
        ok: false,
        reason: mode === 'invalid' ? 'INVALID_DRAFT' : 'STALE_DRAFT',
      });
      expect(repository.saveCAS).not.toHaveBeenCalled();
      expect(view.container.querySelector<HTMLInputElement>('[data-cell-technical-code]')?.value)
        .toBe(mode === 'invalid' ? '' : 'RECOVERED-CODE');
      expect(codeContent(active.session.getSnapshot().document)).toEqual(
        mode === 'invalid'
          ? { type: 'technicalCode', value: 'TC-001' }
          : { type: 'technicalCode', value: 'EXTERNAL' }
      );
      view.unmount();
      await dispose(active.runtime);
    }
  });
});
