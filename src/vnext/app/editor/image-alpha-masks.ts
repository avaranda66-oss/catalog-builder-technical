import type { AlphaMask } from '../../editor/object-layers';

/**
 * Onda 3.5 (S1): alpha masks of the page images, so a click on a transparent area of a full-page PNG reaches the
 * object below. Loaded once per URL in the background; until a mask is ready (or when the image cannot be read,
 * e.g. a server without CORS) the image counts as opaque, which is the old behaviour.
 */
const MAX_MASK_SIDE = 1024;
type Entry = { status: 'loading' } | { status: 'ready'; mask: AlphaMask } | { status: 'opaque' };
const masks = new Map<string, Entry>();

export function alphaMaskFor(url: string | undefined): AlphaMask | undefined {
  if (!url) return undefined;
  const entry = masks.get(url);
  return entry?.status === 'ready' ? entry.mask : undefined;
}

export function preloadAlphaMask(url: string | undefined): void {
  if (!url || masks.has(url) || typeof Image === 'undefined' || typeof document === 'undefined') return;
  masks.set(url, { status: 'loading' });
  const image = new Image();
  if (!url.startsWith('blob:') && !url.startsWith('data:')) image.crossOrigin = 'anonymous';
  image.onload = () => {
    try {
      const ratio = Math.min(1, MAX_MASK_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * ratio));
      const height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) { masks.set(url, { status: 'opaque' }); return; }
      context.drawImage(image, 0, 0, width, height);
      const rgba = context.getImageData(0, 0, width, height).data;
      const alpha = new Uint8Array(width * height);
      let transparent = 0;
      for (let index = 0; index < alpha.length; index += 1) {
        alpha[index] = rgba[index * 4 + 3];
        if (alpha[index] < 24) transparent += 1;
      }
      // A photo without transparency never lets clicks through: keep no mask for it.
      masks.set(url, transparent === 0 ? { status: 'opaque' } : { status: 'ready', mask: { width, height, alpha } });
    } catch {
      masks.set(url, { status: 'opaque' });
    }
  };
  image.onerror = () => masks.set(url, { status: 'opaque' });
  image.src = url;
}
