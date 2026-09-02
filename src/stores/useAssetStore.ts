import { create } from 'zustand';
import {
  AssetRecord,
  ProductAssetRecord,
  ProductAssetRole,
  AssetAngle,
  AssetKind
} from '@/domain/asset.schema';
import { AssetService } from '@/services/asset.service';
import { getSupabase } from '@/services/supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';

interface UploadOptions {
  productId?: string | null;
  role?: ProductAssetRole;
  isPrimary?: boolean;
  caption?: string | null;
  angle?: AssetAngle;
  kind?: AssetKind;
}

interface AssetState {
  assets: AssetRecord[];
  productAssets: ProductAssetRecord[];
  resolvedUrls: Record<string, string>;
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;
  realtimeChannel: RealtimeChannel | null;

  // Lifecycle
  loadWorkspaceAssets: () => Promise<void>;
  initRealtimeSubscription: () => () => void;

  // Upload & Linking Protocol
  uploadAndLinkAsset: (
    file: File,
    options?: UploadOptions
  ) => Promise<{
    success: boolean;
    assetId?: string;
    productAssetId?: string;
    code?: string;
    message?: string;
    isDuplicate?: boolean;
    existingAssetId?: string;
  }>;

  linkExistingAsset: (
    productId: string,
    assetId: string,
    role?: ProductAssetRole,
    isPrimary?: boolean,
    caption?: string,
    angle?: AssetAngle
  ) => Promise<{ success: boolean; error?: string }>;

  unlinkProductAsset: (productAssetId: string) => Promise<{ success: boolean; error?: string }>;
  setPrimaryProductAsset: (productAssetId: string) => Promise<{ success: boolean; error?: string }>;
  updateProductAsset: (
    productAssetId: string,
    updates: {
      role?: ProductAssetRole;
      angle?: AssetAngle;
      caption?: string;
      altText?: string;
      sortOrder?: number;
      isOfficial?: boolean;
    }
  ) => Promise<{ success: boolean; code?: string; message?: string; error?: string }>;

  updateAssetMetadata: (
    assetId: string,
    updates: {
      originalFilename?: string;
      kind?: AssetKind;
      approvalStatus?: 'draft' | 'approved' | 'rejected' | 'archived';
    }
  ) => Promise<{ success: boolean; error?: string }>;

  archiveAsset: (assetId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;

  // URL Resolution & Selectors
  resolveAssetUrl: (assetId?: string, fallbackUrl?: string) => Promise<string>;
  getAssetsForProduct: (productId: string) => Array<ProductAssetRecord & { asset?: AssetRecord }>;
  getPrimaryAssetForProduct: (
    productId: string,
    role?: ProductAssetRole
  ) => (ProductAssetRecord & { asset?: AssetRecord }) | null;
}

export const useAssetStore = create<AssetState>((set, get) => ({
  assets: [],
  productAssets: [],
  resolvedUrls: {},
  isLoading: false,
  isUploading: false,
  error: null,
  realtimeChannel: null,

  loadWorkspaceAssets: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await AssetService.listWorkspaceAssets();
      set({
        assets: data.assets,
        productAssets: data.product_assets,
        isLoading: false
      });

      // Pré-resolução em lote das URLs assinadas para itens ativos
      const urlMap: Record<string, string> = { ...get().resolvedUrls };
      for (const asset of data.assets) {
        if (asset.storage_path && !urlMap[asset.id]) {
          void AssetService.resolveSignedUrl(asset.storage_path, asset.storage_bucket).then((url) => {
            if (url) {
              set((state) => ({
                resolvedUrls: { ...state.resolvedUrls, [asset.id]: url }
              }));
            }
          });
        }
      }
    } catch (err: any) {
      set({ isLoading: false, error: err?.message || 'Falha ao carregar assets' });
    }
  },

  initRealtimeSubscription: () => {
    const existingChannel = get().realtimeChannel;
    if (existingChannel) {
      existingChannel.unsubscribe();
    }

    const supabase = getSupabase();
    if (!supabase || typeof supabase.channel !== 'function') return () => {};

    const channel = supabase
      .channel('realtime:corporate_assets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assets' },
        (payload) => {
          const { eventType, new: newRec, old: oldRec } = payload;
          set((state) => {
            let updated = [...state.assets];
            if (eventType === 'INSERT') {
              if (!updated.some((a) => a.id === (newRec as AssetRecord).id)) {
                updated = [newRec as AssetRecord, ...updated];
              }
            } else if (eventType === 'UPDATE') {
              updated = updated.map((a) => (a.id === (newRec as AssetRecord).id ? (newRec as AssetRecord) : a));
            } else if (eventType === 'DELETE') {
              updated = updated.filter((a) => a.id !== (oldRec as AssetRecord).id);
            }
            return { assets: updated };
          });

          // Resolve URL assinada se for novo asset
          if (newRec && (newRec as AssetRecord).storage_path) {
            const asset = newRec as AssetRecord;
            void AssetService.resolveSignedUrl(asset.storage_path, asset.storage_bucket).then((url) => {
              if (url) {
                set((state) => ({
                  resolvedUrls: { ...state.resolvedUrls, [asset.id]: url }
                }));
              }
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_assets' },
        (payload) => {
          const { eventType, new: newRec, old: oldRec } = payload;
          set((state) => {
            let updated = [...state.productAssets];
            if (eventType === 'INSERT') {
              if (!updated.some((pa) => pa.id === (newRec as ProductAssetRecord).id)) {
                updated = [...updated, newRec as ProductAssetRecord];
              }
            } else if (eventType === 'UPDATE') {
              updated = updated.map((pa) =>
                pa.id === (newRec as ProductAssetRecord).id ? (newRec as ProductAssetRecord) : pa
              );
            } else if (eventType === 'DELETE') {
              updated = updated.filter((pa) => pa.id !== (oldRec as ProductAssetRecord).id);
            }
            return { productAssets: updated };
          });
        }
      )
      .subscribe();

    set({ realtimeChannel: channel });

    return () => {
      channel.unsubscribe();
      set({ realtimeChannel: null });
    };
  },

  uploadAndLinkAsset: async (file, options = {}) => {
    set({ isUploading: true, error: null });

    const assetId = crypto.randomUUID();
    let storagePath = '';

    try {
      // 1. Calcula hash SHA-256 e lê dimensões no cliente
      const [sha256, dimensions] = await Promise.all([
        AssetService.computeSHA256(file),
        AssetService.readImageDimensions(file)
      ]);

      // 2. Upload do binário para o Supabase Storage
      const uploadResult = await AssetService.uploadOriginalBytes(file, assetId);
      if (uploadResult.error || !uploadResult.storagePath) {
        set({ isUploading: false, error: uploadResult.error || 'Erro no upload para o Storage' });
        return { success: false, message: uploadResult.error || 'Falha no upload' };
      }

      storagePath = uploadResult.storagePath;

      // 3. Finalização atômica no PostgreSQL via RPC
      const finalizeResult = await AssetService.finalizeUpload({
        assetId,
        storagePath,
        originalFilename: file.name,
        mimeType: file.type || 'image/jpeg',
        fileSize: file.size,
        width: dimensions.width || null,
        height: dimensions.height || null,
        sha256,
        kind: options.kind || (file.type === 'application/pdf' ? 'document' : 'image'),
        productId: options.productId || null,
        role: options.role || 'hero',
        isPrimary: options.isPrimary ?? false,
        caption: options.caption || null,
        angle: options.angle || 'unknown'
      });

      // 4. Tratamento de duplicata ou erro no PostgreSQL
      if (!finalizeResult.success) {
        // Limpeza best-effort do objeto recém-enviado
        await AssetService.cleanupOrphanStorageObject(storagePath);
        set({ isUploading: false });

        if (finalizeResult.code === 'DUPLICATE_ASSET') {
          return {
            success: false,
            isDuplicate: true,
            existingAssetId: finalizeResult.existing_asset_id,
            code: finalizeResult.code,
            message: finalizeResult.message || 'Arquivo já cadastrado.'
          };
        }

        return {
          success: false,
          code: finalizeResult.code,
          message: finalizeResult.message || 'Erro ao finalizar registro no banco'
        };
      }

      // 5. Atualização otimista do estado local
      if (finalizeResult.asset) {
        const newAsset = finalizeResult.asset;
        set((state) => ({
          assets: [newAsset, ...state.assets.filter((a) => a.id !== newAsset.id)],
          productAssets: finalizeResult.product_asset
            ? [...state.productAssets, finalizeResult.product_asset]
            : state.productAssets,
          isUploading: false
        }));

        // Resolve e armazena URL assinada
        void AssetService.resolveSignedUrl(newAsset.storage_path, newAsset.storage_bucket).then((url) => {
          if (url) {
            set((state) => ({
              resolvedUrls: { ...state.resolvedUrls, [newAsset.id]: url }
            }));
          }
        });
      }

      return {
        success: true,
        assetId,
        productAssetId: finalizeResult.product_asset?.id
      };
    } catch (err: any) {
      if (storagePath) {
        await AssetService.cleanupOrphanStorageObject(storagePath);
      }
      set({ isUploading: false, error: err?.message || 'Exceção durante upload' });
      return { success: false, message: err?.message || 'Falha geral no upload' };
    }
  },

  linkExistingAsset: async (productId, assetId, role = 'hero', isPrimary = false, caption, angle) => {
    try {
      const res = await AssetService.linkProductAsset(productId, assetId, role, isPrimary, caption, angle);
      if (res.success && res.product_asset) {
        set((state) => {
          const filtered = state.productAssets.filter((pa) => pa.id !== res.product_asset!.id);
          return { productAssets: [...filtered, res.product_asset!] };
        });
      }
      return res;
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  },

  unlinkProductAsset: async (productAssetId) => {
    try {
      const res = await AssetService.unlinkProductAsset(productAssetId);
      if (res.success) {
        set((state) => ({
          productAssets: state.productAssets.filter((pa) => pa.id !== productAssetId)
        }));
      }
      return res;
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  },

  setPrimaryProductAsset: async (productAssetId) => {
    try {
      const res = await AssetService.setPrimaryProductAsset(productAssetId);
      if (res.success) {
        const target = get().productAssets.find((pa) => pa.id === productAssetId);
        if (target) {
          set((state) => ({
            productAssets: state.productAssets.map((pa) => {
              if (pa.product_id === target.product_id && pa.role === target.role) {
                return { ...pa, is_primary: pa.id === productAssetId };
              }
              return pa;
            })
          }));
        }
      }
      return res;
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  },

  updateProductAsset: async (productAssetId, updates) => {
    try {
      const res = await AssetService.updateProductAsset(productAssetId, updates);
      if (res.success) {
        set((state) => ({
          productAssets: state.productAssets.map((pa) =>
            pa.id === productAssetId ? { ...pa, ...updates } : pa
          )
        }));
      }
      return res;
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  },

  updateAssetMetadata: async (assetId, updates) => {
    try {
      const res = await AssetService.updateAssetMetadata(assetId, updates);
      if (res.success) {
        set((state) => ({
          assets: state.assets.map((a) =>
            a.id === assetId
              ? {
                  ...a,
                  original_filename: updates.originalFilename ?? a.original_filename,
                  kind: updates.kind ?? a.kind,
                  approval_status: updates.approvalStatus ?? a.approval_status
                }
              : a
          )
        }));
      }
      return res;
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  },

  archiveAsset: async (assetId, reason) => {
    try {
      const res = await AssetService.archiveAsset(assetId, reason);
      if (res.success) {
        set((state) => ({
          assets: state.assets.map((a) =>
            a.id === assetId ? { ...a, approval_status: 'archived' } : a
          ),
          productAssets: state.productAssets.map((pa) =>
            pa.asset_id === assetId ? { ...pa, is_primary: false } : pa
          )
        }));
      }
      return res;
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  },

  resolveAssetUrl: async (assetId?: string, fallbackUrl?: string) => {
    if (!assetId) return fallbackUrl || '';

    // Verifica cache na store
    const cached = get().resolvedUrls[assetId];
    if (cached) return cached;

    // Busca o asset nos dados carregados
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset || !asset.storage_path) {
      return fallbackUrl || '';
    }

    const url = await AssetService.resolveSignedUrl(asset.storage_path, asset.storage_bucket);
    if (url) {
      set((state) => ({
        resolvedUrls: { ...state.resolvedUrls, [assetId]: url }
      }));
      return url;
    }

    return fallbackUrl || '';
  },

  getAssetsForProduct: (productId: string) => {
    const { assets, productAssets } = get();
    return productAssets
      .filter((pa) => pa.product_id === productId)
      .map((pa) => ({
        ...pa,
        asset: assets.find((a) => a.id === pa.asset_id)
      }))
      .filter((pa) => pa.asset && pa.asset.approval_status !== 'archived');
  },

  getPrimaryAssetForProduct: (productId: string, role: ProductAssetRole = 'hero') => {
    const list = get().getAssetsForProduct(productId);
    const primary = list.find((pa) => pa.role === role && pa.is_primary);
    if (primary) return primary;
    // Fallback para qualquer foto hero ou primeira foto
    return list.find((pa) => pa.role === role) || list[0] || null;
  }
}));
