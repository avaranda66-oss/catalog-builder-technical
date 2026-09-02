import { create } from 'zustand';
import { useAssetStore } from './useAssetStore';
import { MediaSelection, ProductAssetRole } from '@/domain/asset.schema';

export interface MediaAsset {
  id: string;
  name: string;
  url: string;
  category: 'product' | 'cover' | 'diagram' | 'banner' | 'demo';
  tags?: string[];
  createdAt: string;
  isCustom?: boolean;
  isDemo?: boolean;
  assetId?: string;
  role?: ProductAssetRole;
}

export const INITIAL_DEMO_MEDIA_ASSETS: MediaAsset[] = [
  {
    id: 'demo-psv-portable',
    name: '[DEMO] Estação de Teste de Válvulas',
    url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1400&q=85',
    category: 'demo',
    tags: ['demo', 'psv', 'valvulas', 'bancada'],
    createdAt: '2026-08-31T12:00:00.000Z',
    isDemo: true
  },
  {
    id: 'demo-pcon-y18-studio',
    name: '[DEMO] Calibrador de Pressão em Bancada',
    url: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1200&q=80',
    category: 'demo',
    tags: ['demo', 'pcon', 'pressao'],
    createdAt: '2026-08-31T12:00:00.000Z',
    isDemo: true
  },
  {
    id: 'demo-t650p-dryblock',
    name: '[DEMO] Calibrador Térmico Bloco Seco',
    url: 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?auto=format&fit=crop&w=1200&q=80',
    category: 'demo',
    tags: ['demo', 'temperatura', 'bloco seco'],
    createdAt: '2026-08-31T12:00:00.000Z',
    isDemo: true
  },
  {
    id: 'demo-lab-metrology',
    name: '[DEMO] Laboratório Metrológico Industrial',
    url: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=1200&q=80',
    category: 'demo',
    tags: ['demo', 'laboratorio', 'rbc'],
    createdAt: '2026-08-31T12:00:00.000Z',
    isDemo: true
  }
];

export type GalleryCallback = (selection: MediaSelection | string) => void;

interface MediaState {
  demoAssets: MediaAsset[];
  selectedAssetId: string | null;
  isGalleryOpen: boolean;
  galleryTargetCallback: GalleryCallback | null;
  targetProductId: string | null;

  // Actions
  openGallery: (onSelect: GalleryCallback, targetProductId?: string | null) => void;
  closeGallery: () => void;
  selectAsset: (id: string | null) => void;
  loadAssets: () => Promise<void>;
}

export const useMediaStore = create<MediaState>((set) => ({
  demoAssets: INITIAL_DEMO_MEDIA_ASSETS,
  selectedAssetId: null,
  isGalleryOpen: false,
  galleryTargetCallback: null,
  targetProductId: null,

  openGallery: (onSelect, targetProductId = null) => {
    set({ isGalleryOpen: true, galleryTargetCallback: onSelect, targetProductId });
    void useAssetStore.getState().loadWorkspaceAssets();
  },

  closeGallery: () => set({ isGalleryOpen: false, galleryTargetCallback: null, selectedAssetId: null, targetProductId: null }),
  selectAsset: (selectedAssetId) => set({ selectedAssetId }),

  loadAssets: async () => {
    await useAssetStore.getState().loadWorkspaceAssets();
  }
}));
