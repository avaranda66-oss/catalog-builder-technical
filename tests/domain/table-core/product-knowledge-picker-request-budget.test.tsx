import { StrictMode } from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { fireEvent } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductKnowledgePickerModal } from '../../../src/components/editor/picker/ProductKnowledgePickerModal';
import type { Catalog } from '../../../src/domain/catalog.schema';
import { createWorkbook, ensureWorkbookV2, type ProductWorkbook, type WorkbookOwner } from '../../../src/domain/product-workbook';
import { ProductKnowledgeRuntime, type ProductRegistryReader } from '../../../src/domain/table-binding';
import {
  ProductKnowledgeProvider,
  ProductKnowledgeSearchResult,
  TestProductKnowledgeProvider
} from '../../../src/domain/table-binding/product-knowledge-provider.types';
import { useUIStore } from '../../../src/stores/useUIStore';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const makeResult = (id: string, kind: ProductKnowledgeSearchResult['kind'] = 'datum'): ProductKnowledgeSearchResult => ({
  bindable: true,
  id,
  kind,
  productId: 'product-1',
  semanticKey: `spec.${id}`,
  label: id,
  status: 'approved',
  origin: 'PIM',
  sourceCount: 1,
  preview: id
});

describe('RR015: ProductKnowledgePickerModal request budget', () => {
  let container: HTMLDivElement;
  let root: Root | null;

  const renderPicker = async (provider: ProductKnowledgeProvider, strict = false) => {
    await act(async () => {
      root?.render(
        strict ? (
          <StrictMode><ProductKnowledgePickerModal provider={provider} /></StrictMode>
        ) : (
          <ProductKnowledgePickerModal provider={provider} />
        )
      );
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({
      isProductKnowledgePickerModalOpen: false,
      knowledgePickerTarget: undefined
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root?.unmount());
    root = null;
    container.remove();
    useUIStore.setState({
      isProductKnowledgePickerModalOpen: false,
      knowledgePickerTarget: undefined
    });
  });

  it('does not read PIM while the picker is mounted but closed', async () => {
    const provider = new TestProductKnowledgeProvider([makeResult('closed')]);
    const search = vi.spyOn(provider, 'search');

    await renderPicker(provider);

    expect(search).not.toHaveBeenCalled();
  });

  it('reads once on open, then closing cancels a queued query', async () => {
    vi.useFakeTimers();
    const provider = new TestProductKnowledgeProvider([makeResult('open')]);
    const search = vi.spyOn(provider, 'search');
    useUIStore.setState({ isProductKnowledgePickerModalOpen: true, knowledgePickerTarget: { kind: 'table', blockId: 'table-1' } });

    await renderPicker(provider);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenLastCalledWith(undefined, '');

    fireEvent.change(container.querySelector('input')!, { target: { value: 'later' } });
    await act(async () => {
      useUIStore.getState().closeProductKnowledgePickerModal();
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(search).toHaveBeenCalledTimes(1);
  });

  it('keeps selection and local kind filtering out of the network request path', async () => {
    const provider = new TestProductKnowledgeProvider([
      makeResult('datum-result'),
      makeResult('dataset-result', 'dataset')
    ]);
    const search = vi.spyOn(provider, 'search');
    useUIStore.setState({ isProductKnowledgePickerModalOpen: true, knowledgePickerTarget: { kind: 'table', blockId: 'table-1' } });

    await renderPicker(provider);
    expect(search).toHaveBeenCalledTimes(1);

    await act(async () => {
      (container.querySelectorAll('[class*="cursor-pointer"]')[1] as HTMLElement).click();
    });
    await act(async () => {
      fireEvent.click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DATASET')!);
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('dataset-result');
    expect(container.textContent).not.toContain('datum-result');
  });

  it('debounces rapid typing and never commits a stale response over the newest query', async () => {
    vi.useFakeTimers();
    const requests = new Map<string, ReturnType<typeof deferred<ProductKnowledgeSearchResult[]>>>();
    const provider = new TestProductKnowledgeProvider();
    const search = vi.spyOn(provider, 'search').mockImplementation((_productId, query) => {
      const request = deferred<ProductKnowledgeSearchResult[]>();
      requests.set(query, request);
      return request.promise;
    });
    useUIStore.setState({ isProductKnowledgePickerModalOpen: true, knowledgePickerTarget: { kind: 'table', blockId: 'table-1' } });

    await renderPicker(provider);
    requests.get('')?.resolve([]);
    await act(async () => {});

    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'A' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    fireEvent.change(input, { target: { value: 'AB' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    fireEvent.change(input, { target: { value: 'ABC' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });

    expect(search.mock.calls.map(([, query]) => query)).toEqual(['', 'A', 'AB', 'ABC']);

    requests.get('ABC')?.resolve([makeResult('newest')]);
    await act(async () => {});
    requests.get('A')?.resolve([makeResult('stale-a')]);
    requests.get('AB')?.resolve([makeResult('stale-ab')]);
    await act(async () => {});

    expect(container.textContent).toContain('newest');
    expect(container.textContent).not.toContain('stale-a');
    expect(container.textContent).not.toContain('stale-ab');
  });

  it('shares an in-flight initial request across StrictMode replay within the same component lifetime', async () => {
    const request = deferred<ProductKnowledgeSearchResult[]>();
    const provider = new TestProductKnowledgeProvider();
    const search = vi.spyOn(provider, 'search').mockReturnValue(request.promise);
    useUIStore.setState({ isProductKnowledgePickerModalOpen: true, knowledgePickerTarget: { kind: 'table', blockId: 'table-1' } });

    await renderPicker(provider, true);
    expect(search).toHaveBeenCalledTimes(1);

    request.resolve([makeResult('settled')]);
    await act(async () => {});
    expect(container.textContent).toContain('settled');
  });

  it('isolates in-flight searches across real picker lifetimes', async () => {
    const requestA = deferred<ProductKnowledgeSearchResult[]>();
    const requestB = deferred<ProductKnowledgeSearchResult[]>();
    const provider = new TestProductKnowledgeProvider();
    const search = vi.spyOn(provider, 'search')
      .mockReturnValueOnce(requestA.promise)
      .mockReturnValueOnce(requestB.promise);
    useUIStore.setState({ isProductKnowledgePickerModalOpen: true, knowledgePickerTarget: { kind: 'table', blockId: 'table-1' } });

    await renderPicker(provider);
    expect(search).toHaveBeenCalledTimes(1);

    act(() => root?.unmount());
    root = createRoot(container);
    await renderPicker(provider);
    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls).toEqual([
      [undefined, ''],
      [undefined, '']
    ]);

    requestA.resolve([makeResult('A_PRIVATE')]);
    await act(async () => {});
    expect(container.textContent).not.toContain('A_PRIVATE');

    requestB.resolve([makeResult('B_CURRENT')]);
    await act(async () => {});
    expect(container.textContent).toContain('B_CURRENT');
    expect(container.textContent).not.toContain('A_PRIVATE');
  });

  it('makes late responses inert after unmount', async () => {
    const request = deferred<ProductKnowledgeSearchResult[]>();
    const provider = new TestProductKnowledgeProvider();
    vi.spyOn(provider, 'search').mockReturnValue(request.promise);
    useUIStore.setState({ isProductKnowledgePickerModalOpen: true, knowledgePickerTarget: { kind: 'table', blockId: 'table-1' } });

    await renderPicker(provider);
    act(() => root?.unmount());
    root = null;
    request.resolve([makeResult('late')]);
    await act(async () => {});

    expect(container.textContent).not.toContain('late');
  });

  it('R4.1c T9: registry authority change plus picker lifecycle disposal rejects the stale in-flight result', async () => {
    const productId = 'product-1';
    const family1 = 'family-r4-f1';
    const family2 = 'family-r4-f2';
    let familyId = family1;
    const registryReader: ProductRegistryReader = {
      getProductIdentity: vi.fn(async () => ({ id: productId, code: 'R4-PICKER', familyId })),
      getProductsByIds: vi.fn(async () => [{ id: productId, code: 'R4-PICKER', familyId }]),
      getProductsByFamilyIds: vi.fn(async () => [])
    };
    const workbookFetcher = {
      getWorkbook: vi.fn(async (owner: WorkbookOwner): Promise<ProductWorkbook | null> => {
        if (owner.kind === 'product') return null;
        return ensureWorkbookV2(createWorkbook({
          owner,
          revision: owner.id === family1 ? 1 : 2
        }));
      })
    };
    const runtime = new ProductKnowledgeRuntime({ registryReader, workbookFetcher });
    const catalog = {
      id: 'r4-picker-catalog',
      pages: [{
        id: 'r4-picker-page',
        blocks: [{ id: 'r4-picker-block', tableRows: [{ id: 'r4-picker-row', productRefId: productId }] }]
      }]
    } as unknown as Catalog;
    await runtime.preloadCatalogProductKnowledge(catalog);
    expect(runtime.getResolvedKnowledge(productId, 'effective_for_publishing')?.familyId).toBe(family1);

    const staleRequest = deferred<ProductKnowledgeSearchResult[]>();
    const provider = new TestProductKnowledgeProvider();
    const search = vi.spyOn(provider, 'search').mockImplementation(async (scopedProductId) => {
      const authority = runtime.getResolvedKnowledge(scopedProductId ?? productId, 'effective_for_publishing');
      if (authority?.familyId === family1) return staleRequest.promise;
      if (authority?.familyId === family2) return [makeResult('F2_CURRENT')];
      return [];
    });
    useUIStore.setState({
      isProductKnowledgePickerModalOpen: true,
      knowledgePickerTarget: { kind: 'table', blockId: 'table-r4-a', productId }
    });

    await renderPicker(provider);
    expect(search).toHaveBeenCalledTimes(1);

    familyId = family2;
    runtime.requireRealtimeCatchUp();
    expect(runtime.getResolvedKnowledge(productId, 'effective_for_publishing')).toBeUndefined();
    act(() => root?.unmount());
    root = createRoot(container);
    await runtime.catchUpActiveKnowledge();
    expect(runtime.getResolvedKnowledge(productId, 'effective_for_publishing')?.familyId).toBe(family2);

    useUIStore.setState({
      isProductKnowledgePickerModalOpen: true,
      knowledgePickerTarget: { kind: 'table', blockId: 'table-r4-b', productId }
    });
    await renderPicker(provider);
    await act(async () => {});
    expect(search).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('F2_CURRENT');

    staleRequest.resolve([makeResult('F1_STALE')]);
    await act(async () => {});
    expect(container.textContent).toContain('F2_CURRENT');
    expect(container.textContent).not.toContain('F1_STALE');
    expect(runtime.getResolvedKnowledge(productId, 'effective_for_publishing')?.familyId).toBe(family2);
  });
});
