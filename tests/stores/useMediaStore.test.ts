import { describe, it, expect, beforeEach } from 'vitest';
import { useMediaStore, INITIAL_DEMO_MEDIA_ASSETS } from '../../src/stores/useMediaStore';

describe('useMediaStore (Photo Bank & Cloud Gallery Facade)', () => {
  beforeEach(() => {
    useMediaStore.setState({
      demoAssets: INITIAL_DEMO_MEDIA_ASSETS,
      isGalleryOpen: false,
      selectedAssetId: null,
      galleryTargetCallback: null,
      targetProductId: null
    });
  });

  it('inicia com acervo de demonstração isolado e classificado como demo', () => {
    const state = useMediaStore.getState();
    expect(state.demoAssets.length).toBeGreaterThanOrEqual(4);
    expect(state.demoAssets.every((a) => a.category === 'demo')).toBe(true);
    expect(state.demoAssets.every((a) => a.isDemo === true)).toBe(true);
  });

  it('permite abrir e fechar a galeria com callback de seleção MediaSelection', () => {
    let receivedAssetId = '';
    let receivedUrl = '';
    const store = useMediaStore.getState();

    store.openGallery((selection) => {
      if (typeof selection === 'string') {
        receivedUrl = selection;
      } else {
        receivedAssetId = selection.assetId || '';
        receivedUrl = selection.url;
      }
    });

    expect(useMediaStore.getState().isGalleryOpen).toBe(true);
    expect(useMediaStore.getState().galleryTargetCallback).toBeDefined();

    useMediaStore.getState().galleryTargetCallback?.({
      assetId: 'asset-uuid-123',
      url: 'https://exemplo.com/foto-psv.jpg',
      originalFilename: 'foto-psv.jpg',
      role: 'hero'
    });

    expect(receivedAssetId).toBe('asset-uuid-123');
    expect(receivedUrl).toBe('https://exemplo.com/foto-psv.jpg');

    store.closeGallery();
    expect(useMediaStore.getState().isGalleryOpen).toBe(false);
  });
});
