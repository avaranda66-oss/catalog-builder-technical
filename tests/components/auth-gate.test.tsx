import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useLibraryStore } from '../../src/stores/useLibraryStore';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { useMediaStore } from '../../src/stores/useMediaStore';
import { LibraryView } from '../../src/components/library/LibraryView';

describe('Auth gate and limited collaborator interface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useAuthStore.setState({ status: 'unauthenticated', role: null, email: null, errorMessage: null });
  });

  it('does not initialize data stores before authentication resolves', async () => {
    const products = vi.spyOn(useLibraryStore.getState(), 'loadProducts');
    const catalog = vi.spyOn(useCatalogStore.getState(), 'loadLatestCatalog');
    const media = vi.spyOn(useMediaStore.getState(), 'loadAssets');

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });

    expect(container.querySelector('h1')?.textContent).toBe('PRESYS Catalog Studio');
    expect(products).not.toHaveBeenCalled();
    expect(catalog).not.toHaveBeenCalled();
    expect(media).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('renders the Library in read-only mode for an editor', async () => {
    vi.spyOn(useLibraryStore.getState(), 'loadWorkspace').mockImplementation(async () => {});
    vi.spyOn(useLibraryStore.getState(), 'initRealtimeSubscription').mockReturnValue(() => {});

    useAuthStore.setState({ status: 'authenticated', role: 'editor', email: 'editor@example.test', errorMessage: null });
    const targetFamily = useLibraryStore.getState().products[0].family;
    useLibraryStore.setState({ selectedFamily: targetFamily });
    
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<LibraryView />);
    });

    expect(container.textContent).toContain('Biblioteca oficial está em modo somente-leitura');
    expect(container.textContent).not.toContain('+ Add Product');
    expect(container.querySelectorAll('input[readonly]').length).toBeGreaterThan(0);
    await act(async () => root.unmount());
  });
});
