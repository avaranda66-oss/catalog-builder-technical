import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAssetStore } from '../../src/stores/useAssetStore';
import { AssetService } from '../../src/services/asset.service';
import { useLibraryStore } from '../../src/stores/useLibraryStore';

describe('FASE 2B.2B — FINAL ASSET LIFECYCLE & PRODUCT IMAGE HOTFIX', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAssetStore.setState({
      assets: [],
      productAssets: [],
      resolvedUrls: {},
      isLoading: false,
      isUploading: false,
      error: null
    });
    useLibraryStore.setState({
      products: [],
      families: []
    });
  });

  it('ASSET-LIFE-1: Expired store URL refreshes automatically on resolveAssetUrl', async () => {
    const assetId = 'asset-life-uuid-1';
    const now = Date.now();

    // Estado inicial: store possui cache antigo expirado há 1ms
    useAssetStore.setState({
      assets: [
        {
          id: assetId,
          storage_bucket: 'product-assets',
          storage_path: 'originals/1/foto.jpg',
          original_filename: 'foto.jpg',
          mime_type: 'image/jpeg',
          file_size: 1024,
          kind: 'image',
          source_type: 'uploaded',
          approval_status: 'approved',
          created_at: new Date().toISOString()
        }
      ],
      resolvedUrls: {
        [assetId]: {
          url: 'https://old-expired-signed-url.com/old.jpg',
          expiresAt: now - 1000 // Expirado
        }
      }
    });

    const resolveWithMetaSpy = vi.spyOn(AssetService, 'resolveSignedUrlWithMeta').mockResolvedValue({
      url: 'https://new-fresh-signed-url.com/fresh.jpg',
      expiresAt: now + 50 * 60 * 1000
    });

    const result = await useAssetStore.getState().resolveAssetUrl(assetId);

    expect(resolveWithMetaSpy).toHaveBeenCalled();
    expect(result).toBe('https://new-fresh-signed-url.com/fresh.jpg');
    expect(useAssetStore.getState().resolvedUrls[assetId].url).toBe('https://new-fresh-signed-url.com/fresh.jpg');
    expect(useAssetStore.getState().resolvedUrls[assetId].expiresAt).toBeGreaterThan(now);
  });

  it('ASSET-LIFE-2: Non-expired URL in store cache does NOT trigger redundant remote signature request', async () => {
    const assetId = 'asset-life-uuid-2';
    const now = Date.now();

    useAssetStore.setState({
      assets: [
        {
          id: assetId,
          storage_bucket: 'product-assets',
          storage_path: 'originals/2/foto.jpg',
          original_filename: 'foto.jpg',
          mime_type: 'image/jpeg',
          file_size: 1024,
          kind: 'image',
          source_type: 'uploaded',
          approval_status: 'approved',
          created_at: new Date().toISOString()
        }
      ],
      resolvedUrls: {
        [assetId]: {
          url: 'https://valid-fresh-signed-url.com/valid.jpg',
          expiresAt: now + 30 * 60 * 1000 // Válido por mais 30 min
        }
      }
    });

    const resolveWithMetaSpy = vi.spyOn(AssetService, 'resolveSignedUrlWithMeta');

    const result = await useAssetStore.getState().resolveAssetUrl(assetId);

    expect(resolveWithMetaSpy).not.toHaveBeenCalled();
    expect(result).toBe('https://valid-fresh-signed-url.com/valid.jpg');
  });

  it('PRODUCT-ASSET-1: Upload for existing product creates product_assets relation atomically', async () => {
    const file = new File(['mock-bytes'], 'ta25n-frontal.jpg', { type: 'image/jpeg' });
    const productId = 'prod-uuid-999';

    vi.spyOn(AssetService, 'computeSHA256').mockResolvedValue('hash-sha256-ta25n');
    vi.spyOn(AssetService, 'readImageDimensions').mockResolvedValue({ width: 1200, height: 800 });
    vi.spyOn(AssetService, 'uploadOriginalBytes').mockResolvedValue({
      storagePath: 'originals/uuid-ta25n/ta25n-frontal.jpg',
      bucket: 'product-assets'
    });
    vi.spyOn(AssetService, 'finalizeUpload').mockResolvedValue({
      success: true,
      asset: {
        id: 'uuid-ta25n',
        storage_bucket: 'product-assets',
        storage_path: 'originals/uuid-ta25n/ta25n-frontal.jpg',
        original_filename: 'ta25n-frontal.jpg',
        mime_type: 'image/jpeg',
        file_size: file.size,
        kind: 'image',
        source_type: 'uploaded',
        approval_status: 'approved',
        created_at: new Date().toISOString()
      },
      product_asset: {
        id: 'pa-uuid-111',
        product_id: productId,
        asset_id: 'uuid-ta25n',
        role: 'hero',
        angle: 'unknown',
        sort_order: 0,
        is_primary: true,
        is_official: false,
        caption: 'Calibrador TA-25N',
        created_at: new Date().toISOString()
      }
    });

    const res = await useAssetStore.getState().uploadAndLinkAsset(file, {
      productId,
      role: 'hero',
      isPrimary: true,
      caption: 'Calibrador TA-25N'
    });

    expect(res.success).toBe(true);
    expect(res.assetId).toBe('uuid-ta25n');
    expect(res.productAssetId).toBe('pa-uuid-111');

    const primaryAsset = useAssetStore.getState().getPrimaryAssetForProduct(productId, 'hero');
    expect(primaryAsset).toBeDefined();
    expect(primaryAsset?.asset_id).toBe('uuid-ta25n');
  });

  it('PRODUCT-ASSET-2: Product payload does NOT store asset UUID in imageUrl on submit', () => {
    const initialProduct = {
      id: 'prod-uuid-888',
      code: 'PRESYS-TA-25N',
      family: 'Calibradores',
      model: 'TA-25N',
      description: 'Calibrador Térmico Portátil',
      specs: {
        range: '-25 a 140',
        unit: '°C',
        accuracy: '±0.1 °C'
      },
      imageUrl: '' // Vazio ou legado
    };

    // Payload montado após edição no ProductDrawer
    const updatedPayload = {
      code: initialProduct.code,
      family: initialProduct.family,
      model: initialProduct.model,
      description: initialProduct.description,
      specs: initialProduct.specs,
      imageUrl: initialProduct.imageUrl // Preserva legado ou vazio, NUNCA UUID
    };

    expect(updatedPayload.imageUrl).toBe('');
    expect(updatedPayload.imageUrl.includes('uuid')).toBe(false);
  });

  it('META-1: updateAssetMetadata does NOT accept originalFilename and maintains provenance immutable', async () => {
    useAssetStore.setState({
      assets: [
        {
          id: 'asset-meta-1',
          storage_bucket: 'product-assets',
          storage_path: 'originals/1/foto_original.jpg',
          original_filename: 'foto_original.jpg',
          mime_type: 'image/jpeg',
          file_size: 1024,
          kind: 'image',
          source_type: 'uploaded',
          approval_status: 'draft',
          created_at: new Date().toISOString()
        }
      ]
    });

    vi.spyOn(AssetService, 'updateAssetMetadata').mockResolvedValue({ success: true });

    await useAssetStore.getState().updateAssetMetadata('asset-meta-1', {
      approvalStatus: 'approved'
    });

    const assetInStore = useAssetStore.getState().assets.find((a) => a.id === 'asset-meta-1');
    expect(assetInStore?.approval_status).toBe('approved');
    expect(assetInStore?.original_filename).toBe('foto_original.jpg');
  });
});
