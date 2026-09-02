import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Catalog } from '@/domain/catalog.schema';
import { Product } from '@/domain/product.schema';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseClient && supabaseUrl && supabaseAnonKey) {
    try {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    } catch {
      supabaseClient = null;
    }
  }
  return supabaseClient;
}

export interface WorkspaceData {
  catalogs: Array<{
    id: string;
    name: string;
    status: string;
    version: number;
    brand: any;
    created_at: string;
    updated_at: string;
    updated_by?: string;
  }>;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    family: string;
    status: string;
    sort_order: number;
    version: number;
    data: any;
    created_at: string;
    updated_at: string;
  }>;
  templates: any[];
  userRole: 'admin' | 'editor';
}

/**
 * SupabaseService v2: Persistência Compartilhada Segura via RPCs com CAS e RLS.
 */
export class SupabaseService {
  static async checkConnection(): Promise<{ connected: boolean; url: string; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { connected: false, url: supabaseUrl, error: 'Supabase não configurado' };
    try {
      const { error } = await supabase.rpc('list_workspace_v2');
      if (error) return { connected: false, url: supabaseUrl, error: error.message };
      return { connected: true, url: supabaseUrl };
    } catch (err: any) {
      return { connected: false, url: supabaseUrl, error: err.message || 'Erro de conexão' };
    }
  }

  static async listWorkspace(): Promise<{ success: boolean; data?: WorkspaceData; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase.rpc('list_workspace_v2');
      if (error) return { success: false, error: error.message };
      return { success: true, data: data as WorkspaceData };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao sincronizar workspace' };
    }
  }

  static async saveOfficialProduct(
    product: Partial<Product>,
    expectedVersion?: number
  ): Promise<{ success: boolean; data?: any; conflict?: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase.rpc('save_official_product_v2', {
        p_product: product,
        p_expected_version: expectedVersion ?? 0
      });

      if (error) {
        const isConflict = error.code === '40001' || error.message?.includes('Conflito de Concorrência');
        return { success: false, conflict: isConflict, error: error.message };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao salvar produto oficial' };
    }
  }

  static async saveCatalog(
    catalog: Partial<Catalog>,
    expectedVersion?: number,
    summary?: string
  ): Promise<{ success: boolean; data?: any; conflict?: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase.rpc('save_catalog_v3', {
        p_catalog: catalog,
        p_expected_version: expectedVersion ?? 0,
        p_summary: summary || 'Atualização de catálogo'
      });

      if (error) {
        const isConflict = error.code === '40001' || error.message?.includes('Conflito');
        return { success: false, conflict: isConflict, error: error.message };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao salvar catálogo' };
    }
  }

  static async deleteCatalog(catalogId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { error } = await supabase.rpc('delete_catalog_v2', {
        p_catalog_id: catalogId
      });

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao excluir catálogo' };
    }
  }

  static async uploadProductImage(
    file: File,
    bucketName: string = 'product-images'
  ): Promise<{ success: boolean; url: string; isRemote: boolean; message?: string }> {
    void bucketName;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        success: true,
        url: reader.result as string,
        isRemote: false,
        message: 'Imagem convertida localmente com sucesso.'
      });
      reader.onerror = () => resolve({
        success: false,
        url: '',
        isRemote: false,
        message: 'Erro ao ler o arquivo de imagem.'
      });
      reader.readAsDataURL(file);
    });
  }

  static async uploadBase64Image(
    base64: string,
    fileName: string = 'image',
    bucketName: string = 'product-images'
  ): Promise<{ success: boolean; url: string; isRemote: boolean }> {
    void fileName;
    void bucketName;
    return { success: base64.startsWith('data:'), url: base64, isRemote: false };
  }
}
