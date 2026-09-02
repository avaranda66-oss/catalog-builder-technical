import { useEffect } from 'react';
import { useAssetStore } from '../stores/useAssetStore';

export interface UseResolvedAssetUrlOptions {
  assetId?: string;
  fallbackUrl?: string;
}

/**
 * Hook universal para resolução de assets na nuvem com fallback retrocompatível.
 *
 * Prioridade:
 * 1. URL assinada corporativa em cache (useAssetStore.resolvedUrls[assetId])
 * 2. URL legada / fallbackUrl existente enquanto a resolução do assetId ocorre em background.
 *
 * Invariante:
 * Se assetId existe e não está em cache, o trigger resolveAssetUrl(assetId) é SEMPRE disparado,
 * mesmo que fallbackUrl seja truthy.
 */
export function useResolvedAssetUrl(assetId?: string, fallbackUrl?: string): string | undefined {
  const cloudResolvedUrl = useAssetStore((state) => (assetId ? state.resolvedUrls[assetId] : undefined));
  const resolveAssetUrl = useAssetStore((state) => state.resolveAssetUrl);

  useEffect(() => {
    if (assetId && !cloudResolvedUrl) {
      void resolveAssetUrl(assetId, fallbackUrl);
    }
  }, [assetId, cloudResolvedUrl, resolveAssetUrl, fallbackUrl]);

  return cloudResolvedUrl || fallbackUrl || undefined;
}
