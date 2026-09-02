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
  const entry = useAssetStore((state) => (assetId ? state.resolvedUrls[assetId] : undefined));
  const resolveAssetUrl = useAssetStore((state) => state.resolveAssetUrl);

  useEffect(() => {
    if (!assetId) return;

    const now = Date.now();
    const isStaleOrMissing = !entry || entry.expiresAt <= now + 60_000;

    if (isStaleOrMissing) {
      // Refresh imediato se ausente ou prestes a expirar
      void resolveAssetUrl(assetId, fallbackUrl);
      return;
    }

    // Agendamento proativo com timer real: dispara 60s antes de expirar
    const msUntilRefresh = Math.max(0, entry.expiresAt - 60_000 - now);
    const timerId = setTimeout(() => {
      void resolveAssetUrl(assetId, fallbackUrl);
    }, msUntilRefresh);

    return () => {
      clearTimeout(timerId);
    };
  }, [assetId, entry?.expiresAt, resolveAssetUrl, fallbackUrl]);

  return entry?.url || fallbackUrl || undefined;
}
