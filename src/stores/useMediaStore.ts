import { create } from 'zustand';
import { SupabaseService } from '../services/supabase.service';

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
    get().loadAssets(); // Recarrega da nuvem ao abrir
  },
  closeGallery: () => set({ isGalleryOpen: false, galleryTargetCallback: null, selectedAssetId: null }),
  selectAsset: (selectedAssetId) => set({ selectedAssetId }),

  addAsset: async (file, category = 'cover', name) => {
    set({ isUploading: true });
    try {
      // 1. Upload para o Supabase Storage no bucket correto 'product-images'
      const res = await SupabaseService.uploadProductImage(file, 'product-images');
      if (res.success && res.url) {
        const newAsset: MediaAsset = {
          id: `media-${Date.now()}`,
          name: name || file.name.replace(/\.[^/.]+$/, ''),
          url: res.url,
          category,
          createdAt: new Date().toISOString(),
          isCustom: true
        };

        const updated = [newAsset, ...get().assets];
        set({ assets: updated });
        localStorage.setItem('cb_media_assets', JSON.stringify(updated));

        // 2. Registra na tabela media_library no Supabase
        SupabaseService.pushMediaAssetToCloud(newAsset).catch((err) => {
          console.warn('Erro ao salvar mídia na tabela do Supabase:', err);
        });

        return newAsset;
      }
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
    SupabaseService.pushMediaAssetToCloud(newAsset).catch(() => {});
  },

  deleteAsset: (id) => {
    const updated = get().assets.filter((a) => a.id !== id);
    set({ assets: updated });
    localStorage.setItem('cb_media_assets', JSON.stringify(updated));
    SupabaseService.deleteMediaAssetFromCloud(id).catch(() => {});
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

    // 2. Puxa do Supabase (Banco de Fotos compartilhado entre todos os computadores)
    try {
      const cloudAssets = await SupabaseService.pullMediaAssetsFromCloud();
      if (cloudAssets.length > 0) {
        const local = get().assets;
        const cloudUrls = new Set(cloudAssets.map((c) => c.url));
        const merged = [...cloudAssets, ...local.filter((l) => !cloudUrls.has(l.url))];
        set({ assets: merged });
        localStorage.setItem('cb_media_assets', JSON.stringify(merged));
      }
    } catch {
      // Offline fallback
    }
  }
}));
