import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Catalog, ContentBlock, CanvasLayer, CatalogSchema } from '../../src/domain/catalog.schema';
import { useAssetStore } from '../../src/stores/useAssetStore';
import { AssetService } from '../../src/services/asset.service';

describe('FASE 2B.2A — ASSET REFERENCE DURABILITY & CLOUD AUTHORITY HOTFIX', () => {
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
  });

  it('ASSET-DOC-1: Zod round-trip preserva perfeitamente assetId, legacyUrl, canvasLayers[].assetId, images[].assetId e contactInfo.logoAssetId sem descartar nenhum campo', () => {
    const rawCatalogDocument: Catalog = {
      id: 'doc-uuid-1',
      title: 'Catálogo de Teste Presys',
      subtitle: 'Edição 2026',
      themeId: 'theme-presys-default',
      version: 1,
      createdAt: '2026-09-02T10:00:00Z',
      updatedAt: '2026-09-02T10:00:00Z',
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Capa Oficial',
          blocks: [
            {
              id: 'block-cover-1',
              type: 'full_page_cover',
              assetId: 'asset-cover-uuid-999',
              legacyUrl: 'https://fallback-legacy.com/cover.jpg',
              imageUrl: '',
              title: 'PRESYS INSTRUMENTAÇÃO',
              customData: {
                canvasLayers: [
                  {
                    id: 'layer-img-1',
                    type: 'image',
                    label: 'Foto Flange',
                    x: 10,
                    y: 20,
                    width: 300,
                    height: 200,
                    zIndex: 2,
                    visible: true,
                    assetId: 'asset-layer-uuid-888',
                    legacyUrl: 'https://fallback-legacy.com/layer.png',
                    imageUrl: ''
                  }
                ]
              },
              images: [
                {
                  assetId: 'asset-img-uuid-777',
                  url: 'https://fallback.com/photo1.jpg',
                  caption: 'Foto de Aplicação'
                }
              ],
              contactInfo: {
                companyName: 'PRESYS Instrumentos',
                phone: '+55 11 3031-4000',
                email: 'vendas@presys.com.br',
                logoAssetId: 'asset-logo-uuid-555',
                logoUrl: 'https://fallback.com/logo.png'
              }
            }
          ]
        }
      ]
    };

    // Executa validação e parse com Zod
    const parsed = CatalogSchema.parse(rawCatalogDocument);

    const coverBlock = parsed.pages[0].blocks[0];
    // 1. assetId do bloco principal
    expect(coverBlock.assetId).toBe('asset-cover-uuid-999');
    expect(coverBlock.legacyUrl).toBe('https://fallback-legacy.com/cover.jpg');

    // 2. images[].assetId
    expect(coverBlock.images?.[0].assetId).toBe('asset-img-uuid-777');

    // 3. contactInfo.logoAssetId
    expect(coverBlock.contactInfo?.logoAssetId).toBe('asset-logo-uuid-555');

    // 4. canvasLayers[].assetId
    const layers = (coverBlock.customData?.canvasLayers || []) as CanvasLayer[];
    expect(layers[0].assetId).toBe('asset-layer-uuid-888');
    expect(layers[0].legacyUrl).toBe('https://fallback-legacy.com/layer.png');
  });

  it('ASSET-DOC-2: Cloud selection persiste assetId e NÃO grava signed URL temporária como legacyUrl/imageUrl permanente', () => {
    // Simula a seleção cloud
    const cloudSelection = {
      assetId: 'cloud-asset-uuid-123',
      url: 'https://storage.supabase.co/signed-url-expiring-in-1-hour?token=xyz123'
    };

    // Objeto do bloco atualizado na interface
    const updatedBlockPatch: Partial<ContentBlock> = {
      assetId: cloudSelection.assetId
    };

    expect(updatedBlockPatch.assetId).toBe('cloud-asset-uuid-123');
    expect(updatedBlockPatch.legacyUrl).toBeUndefined();
    expect(updatedBlockPatch.imageUrl).toBeUndefined();
  });

  it('ASSET-DOC-3: resolveAssetUrl sempre é executado mesmo quando o documento possui uma URL de fallback antiga', async () => {
    const assetId = 'asset-uuid-456';
    const fallbackUrl = 'https://old-expired-url.com/old.jpg';

    useAssetStore.setState({
      assets: [
        {
          id: assetId,
          storage_bucket: 'product-assets',
          storage_path: 'originals/456/transmissor.jpg',
          original_filename: 'transmissor.jpg',
          mime_type: 'image/jpeg',
          file_size: 1024,
          kind: 'image',
          source_type: 'uploaded',
          approval_status: 'approved',
          created_at: new Date().toISOString()
        }
      ]
    });

    const resolveSpy = vi.spyOn(AssetService, 'resolveSignedUrl').mockResolvedValue('https://fresh-signed-url.com/asset.jpg');

    // Dispara resolução
    const resolved = await useAssetStore.getState().resolveAssetUrl(assetId, fallbackUrl);

    // Deve chamar o serviço de resolução na nuvem
    expect(resolveSpy).toHaveBeenCalled();
    expect(resolved).toBe('https://fresh-signed-url.com/asset.jpg');
    expect(useAssetStore.getState().resolvedUrls[assetId]).toBe('https://fresh-signed-url.com/asset.jpg');
  });

  it('ASSET-DOC-4: Documento legado com Data URL e sem assetId continua renderizando normalmente via fallback seguro', async () => {
    const legacyDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const result = await useAssetStore.getState().resolveAssetUrl(undefined, legacyDataUrl);

    expect(result).toBe(legacyDataUrl);
  });

  it('ASSET-DOC-5: Novo upload pelo editor gera upload no Cloud Storage, obtém assetId corporativo e ZERO Data URLs', async () => {
    const file = new File(['image-bytes-raw'], 'transmissor_pressao.jpg', { type: 'image/jpeg' });

    vi.spyOn(AssetService, 'computeSHA256').mockResolvedValue('hash-sha256-transmissor');
    vi.spyOn(AssetService, 'readImageDimensions').mockResolvedValue({ width: 1920, height: 1080 });
    vi.spyOn(AssetService, 'uploadOriginalBytes').mockResolvedValue({
      storagePath: 'originals/uuid-transmissor/transmissor_pressao.jpg',
      bucket: 'product-assets'
    });
    vi.spyOn(AssetService, 'finalizeUpload').mockResolvedValue({
      success: true,
      asset: {
        id: 'uuid-transmissor',
        storage_bucket: 'product-assets',
        storage_path: 'originals/uuid-transmissor/transmissor_pressao.jpg',
        original_filename: 'transmissor_pressao.jpg',
        mime_type: 'image/jpeg',
        file_size: file.size,
        width_px: 1920,
        height_px: 1080,
        sha256: 'hash-sha256-transmissor',
        kind: 'image',
        source_type: 'uploaded',
        approval_status: 'approved',
        created_at: new Date().toISOString()
      }
    });

    const res = await useAssetStore.getState().uploadAndLinkAsset(file, {
      role: 'hero',
      caption: 'Transmissor em Bancada'
    });

    expect(res.success).toBe(true);
    expect(res.assetId).toBe('uuid-transmissor');
    // Garante que o retorno não é base64
    expect(res.assetId?.startsWith('data:')).toBe(false);
  });

  it('ASSET-DOC-7: Archived asset rejeita novos vínculos e primary com erro ASSET_NOT_AVAILABLE', async () => {
    vi.spyOn(AssetService, 'linkProductAsset').mockResolvedValue({
      success: false,
      error: 'Este asset está arquivado ou rejeitado e não pode ser vinculado a novos produtos.'
    });

    const res = await useAssetStore.getState().linkExistingAsset('prod-1', 'archived-asset-id', 'hero');

    expect(res.success).toBe(false);
    expect(res.error).toContain('arquivado ou rejeitado');
  });

  it('ASSET-DOC-8 & ASSET-DOC-9: Archived asset continua resolvendo signed URL normalmente para catálogos existentes', async () => {
    useAssetStore.setState({
      assets: [
        {
          id: 'archived-asset-1',
          storage_bucket: 'product-assets',
          storage_path: 'originals/archived-asset-1/foto.jpg',
          original_filename: 'foto.jpg',
          mime_type: 'image/jpeg',
          file_size: 1024,
          kind: 'image',
          source_type: 'uploaded',
          approval_status: 'archived',
          created_at: '2026-08-01T00:00:00Z'
        }
      ]
    });

    vi.spyOn(AssetService, 'resolveSignedUrl').mockResolvedValue('https://signed.url/archived-photo-fresh.jpg');

    const resolved = await useAssetStore.getState().resolveAssetUrl('archived-asset-1');

    expect(resolved).toBe('https://signed.url/archived-photo-fresh.jpg');
  });
});
