import { getSupabase } from './supabase.service';
import {
  AssetRecord,
  ProductAssetRecord,
  ProductAssetRole,
  AssetAngle,
  AssetKind
} from '@/domain/asset.schema';

interface SignedUrlCacheEntry {
  url: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, SignedUrlCacheEntry>();
const inFlightResolutions = new Map<string, Promise<{ url: string; expiresAt: number } | null>>();

export interface FinalizeUploadParams {
  assetId: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  sha256?: string | null;
  kind?: AssetKind;
  productId?: string | null;
  role?: ProductAssetRole;
  isPrimary?: boolean;
  caption?: string | null;
  angle?: AssetAngle;
}

export class AssetService {
  /**
   * Calcula hash criptográfico SHA-256 no navegador para detecção de duplicatas.
   */
  static async computeSHA256(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Lê dimensões nativas (largura/altura) de arquivo de imagem.
   */
  static async readImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        return resolve({ width: 0, height: 0 });
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const dimensions = { width: img.naturalWidth, height: img.naturalHeight };
        URL.revokeObjectURL(url);
        resolve(dimensions);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 0, height: 0 });
      };
      img.src = url;
    });
  }

  /**
   * Sanitiza nome de arquivo para armazenamento em storage corporativo.
   */
  static sanitizeFilename(filename: string): string {
    return filename
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-zA-Z0-9._-]/g, '_') // caracteres especiais viram _
      .replace(/_+/g, '_');
  }

  /**
   * Envia os bytes originais do arquivo para o Supabase Storage.
   */
  static async uploadOriginalBytes(
    file: File,
    assetId: string
  ): Promise<{ storagePath: string; bucket: string; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) {
      return { storagePath: '', bucket: 'product-assets', error: 'Supabase não inicializado' };
    }

    const sanitizedName = this.sanitizeFilename(file.name);
    const storagePath = `originals/${assetId}/${sanitizedName}`;

    const { data, error } = await supabase.storage
      .from('product-assets')
      .upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });

    if (error || !data) {
      return { storagePath: '', bucket: 'product-assets', error: error?.message || 'Falha no upload' };
    }

    return { storagePath: data.path, bucket: 'product-assets' };
  }

  /**
   * Limpeza best-effort de objeto no Storage caso a finalização no PostgreSQL falhe.
   */
  static async cleanupOrphanStorageObject(storagePath: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase || !storagePath) return;
    try {
      await supabase.storage.from('product-assets').remove([storagePath]);
    } catch (err) {
      console.warn('[AssetService] Erro ao limpar objeto órfão no Storage:', err);
    }
  }

  /**
   * Finaliza o upload atomicamente no PostgreSQL via RPC transacional.
   */
  static async finalizeUpload(params: FinalizeUploadParams): Promise<{
    success: boolean;
    asset?: AssetRecord;
    product_asset?: ProductAssetRecord;
    code?: string;
    message?: string;
    existing_asset_id?: string;
  }> {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, message: 'Supabase client não configurado' };
    }

    const { data, error } = await supabase.rpc('finalize_asset_upload_v1', {
      p_asset_id: params.assetId,
      p_storage_path: params.storagePath,
      p_original_filename: params.originalFilename,
      p_mime_type: params.mimeType,
      p_file_size: params.fileSize,
      p_width: params.width || null,
      p_height: params.height || null,
      p_sha256: params.sha256 || null,
      p_kind: params.kind || 'image',
      p_product_id: params.productId || null,
      p_role: params.role || 'hero',
      p_is_primary: params.isPrimary || false,
      p_caption: params.caption || null,
      p_angle: params.angle || 'unknown'
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as any;
  }

  /**
   * Busca um único Asset pelo UUID.
   */
  static async getAssetById(assetId: string): Promise<AssetRecord | null> {
    const supabase = getSupabase();
    if (!supabase || !assetId) return null;
    try {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('id', assetId)
        .single();
      if (error || !data) return null;
      return data as AssetRecord;
    } catch {
      return null;
    }
  }

  /**
   * Resolve URL assinada temporária retornando os metadados de expiração (TTL 50min) com single-flight.
   */
  static async resolveSignedUrlWithMeta(
    storagePath: string,
    bucket = 'product-assets'
  ): Promise<{ url: string; expiresAt: number } | null> {
    if (!storagePath) return null;
    const now = Date.now();
    // Se for URL http/https legada (ex: CDN externa ou Data URL), retorna direto com expiração longa
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://') || storagePath.startsWith('data:')) {
      return { url: storagePath, expiresAt: now + 365 * 24 * 3600 * 1000 };
    }

    const cacheKey = `${bucket}:${storagePath}`;
    const cached = signedUrlCache.get(cacheKey);

    if (cached && cached.expiresAt > now + 60_000) {
      return cached;
    }

    // Single-Flight: se já houver uma requisição em andamento para este storagePath, aguarda a mesma Promise
    const inFlight = inFlightResolutions.get(cacheKey);
    if (inFlight) {
      return await inFlight;
    }

    const supabase = getSupabase();
    if (!supabase) return null;

    const resolutionPromise = (async () => {
      try {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(storagePath, 3600); // 1 hora de validade

        if (error || !data?.signedUrl) {
          console.warn(`[AssetService] Falha ao assinar URL para ${storagePath}:`, error?.message);
          return null;
        }

        const entry = {
          url: data.signedUrl,
          expiresAt: Date.now() + 50 * 60 * 1000 // Cache local de 50 minutos
        };
        signedUrlCache.set(cacheKey, entry);

        return entry;
      } catch (err) {
        console.error('[AssetService] Erro ao resolver URL assinada:', err);
        return null;
      } finally {
        inFlightResolutions.delete(cacheKey);
      }
    })();

    inFlightResolutions.set(cacheKey, resolutionPromise);
    return await resolutionPromise;
  }

  /**
   * Resolve URL assinada temporária com cache em memória (TTL 50min) para renderizar o asset.
   */
  static async resolveSignedUrl(storagePath: string, bucket = 'product-assets'): Promise<string> {
    const res = await AssetService.resolveSignedUrlWithMeta(storagePath, bucket);
    return res?.url || '';
  }

  /**
   * Vincula um asset existente a um produto.
   */
  static async linkProductAsset(
    productId: string,
    assetId: string,
    role: ProductAssetRole = 'hero',
    isPrimary = false,
    caption?: string,
    angle?: AssetAngle
  ): Promise<{ success: boolean; product_asset?: ProductAssetRecord; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase indisponível' };

    const { data, error } = await supabase.rpc('link_product_asset_v1', {
      p_product_id: productId,
      p_asset_id: assetId,
      p_role: role,
      p_is_primary: isPrimary,
      p_caption: caption || null,
      p_angle: angle || 'unknown'
    });

    if (error) return { success: false, error: error.message };
    return data as any;
  }

  /**
   * Desvincula uma relação produto-asset pelo UUID da relação.
   */
  static async unlinkProductAsset(productAssetId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase indisponível' };

    const { data, error } = await supabase.rpc('unlink_product_asset_v1', {
      p_product_asset_id: productAssetId
    });

    if (error) return { success: false, error: error.message };
    return data as any;
  }

  /**
   * Define o asset como Foto Principal (Hero) para aquele papel/produto.
   */
  static async setPrimaryProductAsset(productAssetId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase indisponível' };

    const { data, error } = await supabase.rpc('set_primary_product_asset_v1', {
      p_product_asset_id: productAssetId
    });

    if (error) return { success: false, error: error.message };
    return data as any;
  }

  /**
   * Atualiza metadados da relação produto-asset.
   */
  static async updateProductAsset(
    productAssetId: string,
    updates: {
      role?: ProductAssetRole;
      angle?: AssetAngle;
      caption?: string;
      altText?: string;
      sortOrder?: number;
      isOfficial?: boolean;
    }
  ): Promise<{ success: boolean; code?: string; message?: string; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase indisponível' };

    const { data, error } = await supabase.rpc('update_product_asset_v1', {
      p_product_asset_id: productAssetId,
      p_role: updates.role || null,
      p_angle: updates.angle || null,
      p_caption: updates.caption || null,
      p_alt_text: updates.altText || null,
      p_sort_order: updates.sortOrder !== undefined ? updates.sortOrder : null,
      p_is_official: updates.isOfficial !== undefined ? updates.isOfficial : null
    });

    if (error) return { success: false, error: error.message };
    return data as any;
  }

  /**
   * Atualiza metadados do Asset original sem alterar bytes ou hash.
   */
  static async updateAssetMetadata(
    assetId: string,
    updates: {
      kind?: AssetKind;
      approvalStatus?: 'draft' | 'approved' | 'rejected' | 'archived';
    }
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase indisponível' };

    const { data, error } = await supabase.rpc('update_asset_metadata_v1', {
      p_asset_id: assetId,
      p_kind: updates.kind || null,
      p_approval_status: updates.approvalStatus || null
    });

    if (error) return { success: false, error: error.message };
    return data as any;
  }

  /**
   * Arquiva um Asset no banco corporativo.
   */
  static async archiveAsset(assetId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase indisponível' };

    const { data, error } = await supabase.rpc('archive_asset_v1', {
      p_asset_id: assetId,
      p_reason: reason || 'Arquivado pelo operador'
    });

    if (error) return { success: false, error: error.message };
    return data as any;
  }

  /**
   * Carrega todos os assets e vínculos do workspace.
   */
  static async listWorkspaceAssets(): Promise<{
    assets: AssetRecord[];
    product_assets: ProductAssetRecord[];
  }> {
    const supabase = getSupabase();
    if (!supabase) return { assets: [], product_assets: [] };

    try {
      const { data, error } = await supabase.rpc('list_assets_workspace_v1');
      if (error || !data) {
        console.warn('[AssetService] list_assets_workspace_v1 falhou:', error?.message);
        return { assets: [], product_assets: [] };
      }
      return {
        assets: data.assets || [],
        product_assets: data.product_assets || []
      };
    } catch (err) {
      console.error('[AssetService] Erro ao listar workspace assets:', err);
      return { assets: [], product_assets: [] };
    }
  }
}
