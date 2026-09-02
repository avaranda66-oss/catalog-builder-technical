import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAssetStore } from '../../src/stores/useAssetStore';
import { AssetService } from '../../src/services/asset.service';
import { AssetRecord, ProductAssetRecord } from '../../src/domain/asset.schema';

describe('FASE 2B.2 — Product Asset Library & Cloud Photo Bank Test Suite', () => {
  const mockAsset1: AssetRecord = {
    id: 'asset-uuid-1',
    storage_bucket: 'product-assets',
    storage_path: 'originals/asset-uuid-1/psv_portable.jpg',
    original_filename: 'psv_portable.jpg',
    mime_type: 'image/jpeg',
    file_size: 204800,
    width_px: 1920,
    height_px: 1080,
    sha256: 'abc123hash',
    kind: 'image',
    source_type: 'uploaded',
    approval_status: 'approved',
    created_at: '2026-09-01T12:00:00Z'
  };

  const mockProductAsset1: ProductAssetRecord = {
    id: 'pa-uuid-1',
    product_id: 'prod-uuid-1',
    asset_id: 'asset-uuid-1',
    role: 'hero',
    angle: 'front',
    sort_order: 0,
    is_primary: true,
    is_official: true,
    caption: 'Foto Principal do Instrumento',
    created_at: '2026-09-01T12:00:00Z'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useAssetStore.setState({
      assets: [mockAsset1],
      productAssets: [mockProductAsset1],
      resolvedUrls: { 'asset-uuid-1': 'https://signed.url/psv_portable.jpg' },
      isLoading: false,
      isUploading: false,
      error: null
    });
  });

  it('ASSET-1: Admin upload asset -> Computa hash, envia original para Storage e finaliza via RPC', async () => {
    const fakeFile = new File(['fake-image-bytes'], 'novo_calibrador.jpg', { type: 'image/jpeg' });

    vi.spyOn(AssetService, 'computeSHA256').mockResolvedValue('hash-sha256-novo');
    vi.spyOn(AssetService, 'readImageDimensions').mockResolvedValue({ width: 1200, height: 800 });
    vi.spyOn(AssetService, 'uploadOriginalBytes').mockResolvedValue({
      storagePath: 'originals/new-id/novo_calibrador.jpg',
      bucket: 'product-assets'
    });
    vi.spyOn(AssetService, 'finalizeUpload').mockResolvedValue({
      success: true,
      asset: {
        id: 'new-id',
        storage_bucket: 'product-assets',
        storage_path: 'originals/new-id/novo_calibrador.jpg',
        original_filename: 'novo_calibrador.jpg',
        mime_type: 'image/jpeg',
        file_size: fakeFile.size,
        width_px: 1200,
        height_px: 800,
        sha256: 'hash-sha256-novo',
        kind: 'image',
        source_type: 'uploaded',
        approval_status: 'approved',
        created_at: new Date().toISOString()
      },
      product_asset: {
        id: 'new-pa-id',
        product_id: 'prod-uuid-1',
        asset_id: 'new-id',
        role: 'front',
        angle: 'front',
        sort_order: 1,
        is_primary: false,
        is_official: false,
        created_at: new Date().toISOString()
      }
    });

    const res = await useAssetStore.getState().uploadAndLinkAsset(fakeFile, {
      productId: 'prod-uuid-1',
      role: 'front',
      isPrimary: false
    });

    expect(res.success).toBe(true);
    expect(res.assetId).toBeDefined();

    const state = useAssetStore.getState();
    expect(state.assets.some((a) => a.original_filename === 'novo_calibrador.jpg')).toBe(true);
    expect(state.productAssets.some((pa) => pa.id === 'new-pa-id')).toBe(true);
  });

  it('ASSET-2 & ASSET-10: Detecta arquivo duplicado por SHA-256 e executa cleanup do Storage sem criar asset duplicado', async () => {
    const duplicateFile = new File(['duplicate-bytes'], 'psv_duplicada.jpg', { type: 'image/jpeg' });

    vi.spyOn(AssetService, 'computeSHA256').mockResolvedValue('abc123hash');
    vi.spyOn(AssetService, 'readImageDimensions').mockResolvedValue({ width: 1920, height: 1080 });
    vi.spyOn(AssetService, 'uploadOriginalBytes').mockResolvedValue({
      storagePath: 'originals/dup-id/psv_duplicada.jpg',
      bucket: 'product-assets'
    });
    const cleanupSpy = vi.spyOn(AssetService, 'cleanupOrphanStorageObject').mockResolvedValue();
    vi.spyOn(AssetService, 'finalizeUpload').mockResolvedValue({
      success: false,
      code: 'DUPLICATE_ASSET',
      message: 'Este arquivo já está cadastrado no banco corporativo.',
      existing_asset_id: 'asset-uuid-1'
    });

    const res = await useAssetStore.getState().uploadAndLinkAsset(duplicateFile, {
      productId: 'prod-uuid-1'
    });

    expect(res.success).toBe(false);
    expect(res.isDuplicate).toBe(true);
    expect(res.existingAssetId).toBe('asset-uuid-1');
    expect(cleanupSpy).toHaveBeenCalledWith('originals/dup-id/psv_duplicada.jpg');
  });

  it('ASSET-3: Vincula o mesmo asset corporativo a múltiplos produtos sem duplicar arquivo no Storage', async () => {
    vi.spyOn(AssetService, 'linkProductAsset').mockResolvedValue({
      success: true,
      product_asset: {
        id: 'pa-uuid-second-prod',
        product_id: 'prod-uuid-2',
        asset_id: 'asset-uuid-1',
        role: 'application',
        sort_order: 0,
        is_primary: false,
        is_official: true,
        created_at: new Date().toISOString()
      }
    });

    const res = await useAssetStore.getState().linkExistingAsset('prod-uuid-2', 'asset-uuid-1', 'application');
    expect(res.success).toBe(true);

    const state = useAssetStore.getState();
    // Continua tendo apenas 1 asset físico em assets
    expect(state.assets.filter((a) => a.id === 'asset-uuid-1').length).toBe(1);
    // Mas possui 2 vínculos em productAssets
    expect(state.productAssets.filter((pa) => pa.asset_id === 'asset-uuid-1').length).toBe(2);
  });

  it('ASSET-4 & ASSET-H13: Alterna Foto Principal (Hero) garantindo apenas 1 primary por role/produto', async () => {
    // Adiciona uma segunda foto front no mesmo produto
    useAssetStore.setState({
      productAssets: [
        mockProductAsset1,
        {
          id: 'pa-uuid-front-2',
          product_id: 'prod-uuid-1',
          asset_id: 'asset-uuid-2',
          role: 'hero',
          sort_order: 1,
          is_primary: false,
          is_official: false,
          created_at: '2026-09-01T12:05:00Z'
        }
      ]
    });

    vi.spyOn(AssetService, 'setPrimaryProductAsset').mockResolvedValue({ success: true });

    const res = await useAssetStore.getState().setPrimaryProductAsset('pa-uuid-front-2');
    expect(res.success).toBe(true);

    const prods = useAssetStore.getState().productAssets;
    const hero1 = prods.find((pa) => pa.id === 'pa-uuid-1');
    const hero2 = prods.find((pa) => pa.id === 'pa-uuid-front-2');

    expect(hero1?.is_primary).toBe(false);
    expect(hero2?.is_primary).toBe(true);
  });

  it('ASSET-6: Unlink desvincula o produto sem excluir o arquivo original de public.assets', async () => {
    vi.spyOn(AssetService, 'unlinkProductAsset').mockResolvedValue({ success: true });

    const res = await useAssetStore.getState().unlinkProductAsset('pa-uuid-1');
    expect(res.success).toBe(true);

    const state = useAssetStore.getState();
    // Relação removida
    expect(state.productAssets.some((pa) => pa.id === 'pa-uuid-1')).toBe(false);
    // Mas o arquivo continua no acervo geral de assets
    expect(state.assets.some((a) => a.id === 'asset-uuid-1')).toBe(true);
  });

  it('ASSET-7 & ASSET-H10: Archive marca status como archived e continua resolvendo URL para documentos existentes', async () => {
    vi.spyOn(AssetService, 'archiveAsset').mockResolvedValue({ success: true });

    const res = await useAssetStore.getState().archiveAsset('asset-uuid-1', 'Teste de arquivamento');
    expect(res.success).toBe(true);

    const state = useAssetStore.getState();
    const archived = state.assets.find((a) => a.id === 'asset-uuid-1');
    expect(archived?.approval_status).toBe('archived');

    // getAssetsForProduct oculta o arquivado da galeria do produto
    const visibleInProduct = state.getAssetsForProduct('prod-uuid-1');
    expect(visibleInProduct.some((pa) => pa.asset_id === 'asset-uuid-1')).toBe(false);

    // Mas a resolução direta por assetId no documento do catálogo continua funcionando
    const resolved = await state.resolveAssetUrl('asset-uuid-1');
    expect(resolved).toBe('https://signed.url/psv_portable.jpg');
  });

  it('ASSET-H7 & ASSET-H9: Resolução de assetId tem precedência sobre legacyUrl e faz fallback seguro', async () => {
    const store = useAssetStore.getState();

    // 1. Asset válido cadastrado
    const url1 = await store.resolveAssetUrl('asset-uuid-1', 'https://fallback.url/old.jpg');
    expect(url1).toBe('https://signed.url/psv_portable.jpg');

    // 2. Documento legado sem assetId
    const url2 = await store.resolveAssetUrl(undefined, 'https://legacy-domain.com/photo.jpg');
    expect(url2).toBe('https://legacy-domain.com/photo.jpg');
  });
});
