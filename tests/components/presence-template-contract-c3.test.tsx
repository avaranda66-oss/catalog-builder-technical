import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollaboratorPresenceBar } from '../../src/components/editor/CollaboratorPresenceBar';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { usePresenceStore } from '../../src/stores/usePresenceStore';

describe('C3 — template Presence UI contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    usePresenceStore.setState({
      presenceStatus: 'disconnected',
      activeCatalogId: null,
      documentKind: 'catalog',
      currentSession: null,
      participants: {},
      error: null,
      editingTimeoutId: null
    });
  });

  it('C3-T7/C3-T8: template editor initializes Presence with template kind and actual template id', async () => {
    const initializePresence = vi.fn();
    usePresenceStore.setState({ initializePresence });
    useCatalogStore.setState({
      currentCatalog: {
        id: 'template-a',
        title: 'Template A',
        themeId: 'default-technical',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pages: [{ id: 'template-page-1', pageNumber: 1, title: 'Page 1', blocks: [] }]
      },
      editorContext: { kind: 'template', templateId: 'template-a' },
      activePageIndex: 0,
      selectedBlockId: null
    });

    render(<CollaboratorPresenceBar />);

    await waitFor(() => {
      expect(initializePresence).toHaveBeenCalledWith(
        'template-a',
        1,
        'template-page-1',
        'template'
      );
    });
  });
});
