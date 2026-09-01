import { describe, it, expect, beforeEach } from 'vitest';
import { useMediaStore, INITIAL_MEDIA_ASSETS } from '../../src/stores/useMediaStore';

describe('useMediaStore (Central Image & Media Gallery)', () => {
  beforeEach(() => {
    localStorage.clear();
    useMediaStore.setState({
      assets: INITIAL_MEDIA_ASSETS,
      isGalleryOpen: false,
      selectedAssetId: null,
      galleryTargetCallback: null
    });
  });

  it('inicia com acervo de imagens oficiais da PRESYS', () => {
    const state = useMediaStore.getState();
    expect(state.assets.length).toBeGreaterThanOrEqual(4);
    expect(state.assets.some((a) => a.id === 'media-psv-portable')).toBe(true);
  });

  it('permite abrir e fechar a galeria com callback de seleção', () => {
    let selectedImage = '';
    const store = useMediaStore.getState();

    store.openGallery((url) => {
      selectedImage = url;
    });

    expect(useMediaStore.getState().isGalleryOpen).toBe(true);
    expect(useMediaStore.getState().galleryTargetCallback).toBeDefined();

    useMediaStore.getState().galleryTargetCallback?.('https://exemplo.com/foto-psv.jpg');
    expect(selectedImage).toBe('https://exemplo.com/foto-psv.jpg');

    store.closeGallery();
    expect(useMediaStore.getState().isGalleryOpen).toBe(false);
  });

  it('permite adicionar imagem por URL e salvar na galeria', () => {
    const store = useMediaStore.getState();
    const initialCount = store.assets.length;

    store.addUrlAsset('https://exemplo.com/nova-capa.jpg', 'Nova Capa de Teste', 'cover');

    const updated = useMediaStore.getState();
    expect(updated.assets.length).toBe(initialCount + 1);
    expect(updated.assets[0].name).toBe('Nova Capa de Teste');
  });

  it('permite excluir imagem customizada da galeria', () => {
    const store = useMediaStore.getState();
    store.addUrlAsset('https://exemplo.com/foto-temp.jpg', 'Foto Temporária', 'product');

    const added = useMediaStore.getState().assets[0];
    store.deleteAsset(added.id);

    const finalAssets = useMediaStore.getState().assets;
    expect(finalAssets.some((a) => a.id === added.id)).toBe(false);
  });
});
