import { create } from 'zustand';

export interface MediaAsset {
  id: string;
  name: string;
  url: string;
  category: 'product' | 'cover' | 'diagram' | 'banner';
  tags?: string[];
  createdAt: string;
  isCustom?: boolean;
}

export const INITIAL_MEDIA_ASSETS: MediaAsset[] = [
  {
    id: 'media-psv-portable',
    name: 'PRESYS PSV Portable — Estação de Teste de Válvulas de Segurança',
    url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1400&q=85',
    category: 'cover',
    tags: ['psv', 'valvulas', 'bancada', 'capa', 'industrial'],
    createdAt: '2026-08-31T12:00:00.000Z'
  },
  {
    id: 'media-pcon-y18-studio',
    name: 'PRESYS PCON-Y18-LP — Calibrador de Pressão em Bancada',
    url: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1200&q=80',
    category: 'product',
    tags: ['pcon', 'pressao', 'calibrador', 'touch'],
    createdAt: '2026-08-31T12:00:00.000Z'
  },
  {
    id: 'media-t650p-dryblock',
    name: 'PRESYS T-650P — Calibrador Térmico Bloco Seco',
    url: 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?auto=format&fit=crop&w=1200&q=80',
    category: 'product',
    tags: ['temperatura', 'bloco seco', 'metrologia'],
    createdAt: '2026-08-31T12:00:00.000Z'
  },
  {
    id: 'media-lab-metrology',
    name: 'Laboratório Metrológico Industrial — Calibração RBC',
    url: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=1200&q=80',
    category: 'cover',
    tags: ['laboratorio', 'rbc', 'qualidade', 'capa'],
    createdAt: '2026-08-31T12:00:00.000Z'
  }
];

interface MediaState {
  assets: MediaAsset[];
  selectedAssetId: string | null;
  isGalleryOpen: boolean;
  galleryTargetCallback: ((url: string) => void) | null;
  isUploading: boolean;

  // Actions
  openGallery: (onSelect: (url: string) => void) => void;
  closeGallery: () => void;
  selectAsset: (id: string | null) => void;
  addAsset: (file: File, category?: MediaAsset['category'], name?: string) => Promise<MediaAsset | null>;
  addUrlAsset: (url: string, name: string, category?: MediaAsset['category']) => void;
  updateAsset: (id: string, updates: Partial<MediaAsset>) => void;
  deleteAsset: (id: string) => void;
  loadAssets: () => Promise<void>;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  assets: INITIAL_MEDIA_ASSETS,
  selectedAssetId: null,
  isGalleryOpen: false,
  galleryTargetCallback: null,
  isUploading: false,

  openGallery: (onSelect) => {
    set({ isGalleryOpen: true, galleryTargetCallback: onSelect });
    void get().loadAssets();
  },
  closeGallery: () => set({ isGalleryOpen: false, galleryTargetCallback: null, selectedAssetId: null }),
  selectAsset: (selectedAssetId) => set({ selectedAssetId }),

  addAsset: async (file, category = 'cover', name) => {
    set({ isUploading: true });
    try {
      const localUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
      if (!localUrl) return null;
      const newAsset: MediaAsset = {
        id: `media-${Date.now()}`,
        name: name || file.name.replace(/\.[^/.]+$/, ''),
        url: localUrl,
        category,
        createdAt: new Date().toISOString(),
        isCustom: true
      };
      const updated = [newAsset, ...get().assets];
      set({ assets: updated });
      localStorage.setItem('cb_media_assets', JSON.stringify(updated));
      return newAsset;
    } finally {
      set({ isUploading: false });
    }
    return null;
  },

  addUrlAsset: (url, name, category = 'cover') => {
    const newAsset: MediaAsset = {
      id: `media-${Date.now()}`,
      name,
      url,
      category,
      createdAt: new Date().toISOString(),
      isCustom: true
    };
    const updated = [newAsset, ...get().assets];
    set({ assets: updated });
    localStorage.setItem('cb_media_assets', JSON.stringify(updated));
  },

  updateAsset: (id, updates) => {
    const updated = get().assets.map((a) => (a.id === id ? { ...a, ...updates } : a));
    set({ assets: updated });
    localStorage.setItem('cb_media_assets', JSON.stringify(updated));

  },

  deleteAsset: (id) => {
    const updated = get().assets.filter((a) => a.id !== id);
    set({ assets: updated });
    localStorage.setItem('cb_media_assets', JSON.stringify(updated));
  },

  loadAssets: async () => {
    // 1. Carrega local
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('cb_media_assets');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            set({ assets: parsed });
          }
        } catch (e) {
          console.error('Erro ao carregar galeria local:', e);
        }
      }
    }

  }
}));
