import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useAssetStore } from '../../src/stores/useAssetStore';
import { AssetService } from '../../src/services/asset.service';
import { useResolvedAssetUrl } from '../../src/hooks/useResolvedAssetUrl';

const TestViewer: React.FC<{ assetId?: string; onRender?: (url?: string) => void }> = ({ assetId, onRender }) => {
  const url = useResolvedAssetUrl(assetId);
  onRender?.(url);
  return <div data-testid="viewer">{url || 'no-url'}</div>;
};

describe('FASE 2B.2C — FINAL ASSET RUNTIME MICRO-HARDENING', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useAssetStore.setState({
      assets: [],
      productAssets: [],
      resolvedUrls: {},
      isLoading: false,
      isUploading: false,
      error: null
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ASSET-LIFE-3: Mounted component automatically triggers refresh via real scheduled timer when approaching expiration', async () => {
    vi.useFakeTimers();
    const assetId = 'asset-long-session-1';
    const initialTime = 1700000000000;
    vi.setSystemTime(initialTime);

    // URL válida por 120s (expira em initialTime + 120_000).
    // O timer deve disparar em msUntilRefresh = 120_000 - 60_000 = 60_000ms (60s).
    useAssetStore.setState({
      assets: [
        {
          id: assetId,
          storage_bucket: 'product-assets',
          storage_path: 'originals/long/foto.jpg',
          original_filename: 'foto.jpg',
          mime_type: 'image/jpeg',
          file_size: 1024,
          kind: 'image',
          source_type: 'uploaded',
          approval_status: 'approved',
          created_at: new Date(initialTime).toISOString()
        }
      ],
      resolvedUrls: {
        [assetId]: {
          url: 'https://cdn.signed.com/initial-valid.jpg',
          expiresAt: initialTime + 120_000
        }
      }
    });

    const resolveWithMetaSpy = vi.spyOn(AssetService, 'resolveSignedUrlWithMeta').mockResolvedValue({
      url: 'https://cdn.signed.com/fresh-renewed.jpg',
      expiresAt: initialTime + 120_000 + 50 * 60 * 1000
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    let lastRenderedUrl: string | undefined;
    await act(async () => {
      root.render(<TestViewer assetId={assetId} onRender={(u) => { lastRenderedUrl = u; }} />);
    });

    // No instante 0: exibe a URL inicial e não chamou a API remota
    expect(lastRenderedUrl).toBe('https://cdn.signed.com/initial-valid.jpg');
    expect(resolveWithMetaSpy).not.toHaveBeenCalled();

    // Avança 30 segundos: ainda não atingiu a janela de 60s
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(resolveWithMetaSpy).not.toHaveBeenCalled();

    // Avança mais 31 segundos (total 61s): timer proativo dispara automaticamente
    await act(async () => {
      vi.advanceTimersByTime(31_000);
      await Promise.resolve(); // flush microtasks
    });

    // O serviço de resolução na nuvem DEVE ter sido invocado automaticamente pelo timer agendado
    expect(resolveWithMetaSpy).toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('ASSET-LIFE-4: 3 simultaneous components or callers for same asset join single-flight request', async () => {
    const assetId = 'asset-concurrency-1';
    const now = Date.now();

    useAssetStore.setState({
      assets: [
        {
          id: assetId,
          storage_bucket: 'product-assets',
          storage_path: 'originals/shared/gauge.jpg',
          original_filename: 'gauge.jpg',
          mime_type: 'image/jpeg',
          file_size: 2048,
          kind: 'image',
          source_type: 'uploaded',
          approval_status: 'approved',
          created_at: new Date().toISOString()
        }
      ],
      resolvedUrls: {} // Não cacheado
    });

    let callCount = 0;
    vi.spyOn(AssetService, 'resolveSignedUrlWithMeta').mockImplementation(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return {
        url: 'https://cdn.signed.com/single-flight-gauge.jpg',
        expiresAt: now + 50 * 60 * 1000
      };
    });

    // 3 chamadas concorrentes simultâneas (simulando 3 blocos ou componentes renderizando o mesmo asset)
    const [res1, res2, res3] = await Promise.all([
      useAssetStore.getState().resolveAssetUrl(assetId),
      useAssetStore.getState().resolveAssetUrl(assetId),
      useAssetStore.getState().resolveAssetUrl(assetId)
    ]);

    expect(res1).toBe('https://cdn.signed.com/single-flight-gauge.jpg');
    expect(res2).toBe('https://cdn.signed.com/single-flight-gauge.jpg');
    expect(res3).toBe('https://cdn.signed.com/single-flight-gauge.jpg');
    // Deve disparar apenas 1 chamada remota real graças ao Single-Flight
    expect(callCount).toBe(1);
  });

  it('ASSET-SELECT-1 & ASSET-SELECT-2: rejected and archived assets are NOT returned in getAssetsForProduct', () => {
    const productId = 'prod-123';

    useAssetStore.setState({
      assets: [
        {
          id: 'asset-approved',
          storage_bucket: 'product-assets',
          storage_path: 'originals/app/hero.jpg',
          original_filename: 'hero.jpg',
          mime_type: 'image/jpeg',
          file_size: 1024,
          kind: 'image',
          source_type: 'uploaded',
          approval_status: 'approved',
          created_at: new Date().toISOString()
        },
        {
          id: 'asset-rejected',
          storage_bucket: 'product-assets',
          storage_path: 'originals/rej/rejected.jpg',
          original_filename: 'rejected.jpg',
          mime_type: 'image/jpeg',
          file_size: 1024,
          kind: 'image',
          source_type: 'uploaded',
          approval_status: 'rejected',
          created_at: new Date().toISOString()
        },
        {
          id: 'asset-archived',
          storage_bucket: 'product-assets',
          storage_path: 'originals/arc/archived.jpg',
          original_filename: 'archived.jpg',
          mime_type: 'image/jpeg',
          file_size: 1024,
          kind: 'image',
          source_type: 'uploaded',
          approval_status: 'archived',
          created_at: new Date().toISOString()
        }
      ],
      productAssets: [
        {
          id: 'pa-1',
          product_id: productId,
          asset_id: 'asset-approved',
          role: 'hero',
          angle: 'front',
          sort_order: 0,
          is_primary: true,
          is_official: true,
          caption: 'Foto Oficial',
          created_at: new Date().toISOString()
        },
        {
          id: 'pa-2',
          product_id: productId,
          asset_id: 'asset-rejected',
          role: 'hero',
          angle: 'front',
          sort_order: 1,
          is_primary: false,
          is_official: false,
          caption: 'Foto Rejeitada',
          created_at: new Date().toISOString()
        },
        {
          id: 'pa-3',
          product_id: productId,
          asset_id: 'asset-archived',
          role: 'hero',
          angle: 'front',
          sort_order: 2,
          is_primary: false,
          is_official: false,
          caption: 'Foto Arquivada',
          created_at: new Date().toISOString()
        }
      ]
    });

    const activeProductAssets = useAssetStore.getState().getAssetsForProduct(productId);

    expect(activeProductAssets).toHaveLength(1);
    expect(activeProductAssets[0].asset_id).toBe('asset-approved');
    expect(activeProductAssets.some((pa) => pa.asset_id === 'asset-rejected')).toBe(false);
    expect(activeProductAssets.some((pa) => pa.asset_id === 'asset-archived')).toBe(false);
  });

  it('ASSET-SELECT-3: Historical catalog document with rejected or archived assetId continues to resolve signed URL', async () => {
    const archivedAssetId = 'hist-archived-asset-99';
    const rejectedAssetId = 'hist-rejected-asset-99';

    useAssetStore.setState({
      assets: [
        {
          id: archivedAssetId,
          storage_bucket: 'product-assets',
          storage_path: 'originals/hist/old_cover.jpg',
          original_filename: 'old_cover.jpg',
          mime_type: 'image/jpeg',
          file_size: 1024,
          kind: 'image',
          source_type: 'uploaded',
          approval_status: 'archived',
          created_at: '2025-01-01T00:00:00Z'
        },
        {
          id: rejectedAssetId,
          storage_bucket: 'product-assets',
          storage_path: 'originals/hist/draft_diagram.jpg',
          original_filename: 'draft_diagram.jpg',
          mime_type: 'image/jpeg',
          file_size: 1024,
          kind: 'image',
          source_type: 'uploaded',
          approval_status: 'rejected',
          created_at: '2025-01-01T00:00:00Z'
        }
      ]
    });

    vi.spyOn(AssetService, 'resolveSignedUrlWithMeta')
      .mockResolvedValueOnce({
        url: 'https://cdn.signed.com/historical-archived.jpg',
        expiresAt: Date.now() + 50 * 60 * 1000
      })
      .mockResolvedValueOnce({
        url: 'https://cdn.signed.com/historical-rejected.jpg',
        expiresAt: Date.now() + 50 * 60 * 1000
      });

    // Resolução de documento histórico que contém o assetId arquivado
    const urlArchived = await useAssetStore.getState().resolveAssetUrl(archivedAssetId);
    expect(urlArchived).toBe('https://cdn.signed.com/historical-archived.jpg');

    // Resolução de documento histórico que contém o assetId rejeitado
    const urlRejected = await useAssetStore.getState().resolveAssetUrl(rejectedAssetId);
    expect(urlRejected).toBe('https://cdn.signed.com/historical-rejected.jpg');
  });

  it('ASSET-PREVIEW-1: Private storage path (originals/...) is never used as fallback for img src in hook', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    let renderedUrl: string | undefined = 'initial';
    await act(async () => {
      root.render(<TestViewer assetId="unresolved-asset-id" onRender={(u) => { renderedUrl = u; }} />);
    });

    // O hook deve retornar undefined (permitindo que o componente exiba loader/placeholder), NUNCA "originals/..."
    expect(renderedUrl).toBeUndefined();
    expect(container.querySelector('[data-testid="viewer"]')?.textContent).toBe('no-url');

    await act(async () => root.unmount());
  });
});
