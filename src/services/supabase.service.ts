import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Product, ProductSchema } from '../domain/product.schema';
import { Catalog, CatalogSchema } from '../domain/catalog.schema';
import { z } from 'zod';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseClient && supabaseUrl && supabaseAnonKey) {
    try {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });
    } catch (err) {
      console.warn('Falha ao inicializar cliente Supabase:', err);
      supabaseClient = null;
    }
  }
  return supabaseClient;
}

export class SupabaseService {
  /**
   * Testa a conexão ativa com o backend Supabase.
   */
  static async checkConnection(): Promise<{ connected: boolean; url: string; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) {
      return { connected: false, url: supabaseUrl, error: 'Credenciais Supabase não configuradas no ambiente.' };
    }

    try {
      const { error } = await supabase.from('products').select('id').limit(1);
      if (error && !error.message.includes('relation') && !error.message.includes('does not exist')) {
        return { connected: true, url: supabaseUrl };
      }
      return { connected: true, url: supabaseUrl };
    } catch (err: any) {
      return { connected: false, url: supabaseUrl, error: err.message || 'Falha de rede' };
    }
  }

  /**
   * Upload de foto real de produto para o Supabase Storage.
   * Se o upload remoto falhar, utiliza fallback Base64 local.
   */
  static async uploadProductImage(
    file: File,
    bucketName: string = 'product-images'
  ): Promise<{ success: boolean; url: string; isRemote: boolean; message?: string }> {
    const supabase = getSupabase();

    // 1. Tenta upload no Supabase Storage
    if (supabase) {
      try {
        const fileExt = file.name.split('.').pop() || 'jpg';
        const cleanName = file.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const filePath = `products/${Date.now()}_${cleanName}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true
          });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filePath);

          if (publicUrlData && publicUrlData.publicUrl) {
            return {
              success: true,
              url: publicUrlData.publicUrl,
              isRemote: true,
              message: 'Imagem enviada com sucesso para o Supabase Storage!'
            };
          }
        } else {
          console.warn('Aviso no Supabase Storage upload, usando fallback:', uploadError.message);
        }
      } catch (err: any) {
        console.warn('Erro ao conectar ao Supabase Storage:', err);
      }
    }

    // 2. Fallback de alta resiliência: Leitura local em DataURL (Base64)
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          success: true,
          url: reader.result as string,
          isRemote: false,
          message: 'Imagem carregada localmente (Modo Offline).'
        });
      };
      reader.onerror = () => {
        resolve({
          success: false,
          url: '',
          isRemote: false,
          message: 'Erro ao ler o arquivo de imagem.'
        });
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Upload de base64 image diretamente para Supabase Storage.
   */
  static async uploadBase64Image(
    base64: string,
    fileName: string = 'image',
    bucketName: string = 'product-images'
  ): Promise<{ success: boolean; url: string; isRemote: boolean }> {
    const supabase = getSupabase();
    if (!supabase || !base64.startsWith('data:')) {
      return { success: false, url: base64, isRemote: false };
    }

    try {
      const res = await fetch(base64);
      const blob = await res.blob();
      const ext = blob.type.split('/')[1] || 'png';
      const filePath = `products/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;

      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, blob, { cacheControl: '3600', upsert: true });

      if (!error) {
        const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
        if (data?.publicUrl) {
          return { success: true, url: data.publicUrl, isRemote: true };
        }
      }
      console.warn('Upload base64 fallback:', error?.message);
    } catch (err) {
      console.warn('Erro no upload base64:', err);
    }

    return { success: false, url: base64, isRemote: false };
  }

  /**
   * Sincroniza produtos oficiais com a nuvem (Supabase).
   * Schema: sku, name, family, data (jsonb), updated_at
   */
  static async pushProductsToCloud(
    products: Product[]
  ): Promise<{ success: boolean; count: number; message: string }> {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, count: 0, message: 'Supabase não conectado.' };
    }

    try {
      const payload = products.map((p) => {
        // Valida se o ID é UUID válido para o Postgres, senão omite para auto-geração
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id);
        const item: any = {
          sku: p.code,
          name: p.model,
          family: p.family || 'Geral',
          data: {
            specs: p.specs,
            description: p.description,
            imageUrl: p.imageUrl,
            version: p.version
          },
          updated_at: new Date().toISOString()
        };
        if (isUUID) {
          item.id = p.id;
        }
        return item;
      });

      const { error } = await supabase
        .from('products')
        .upsert(payload, { onConflict: 'sku' });

      if (error) {
        console.warn('Erro ao salvar produtos no Supabase:', error.message);
        return { success: false, count: 0, message: error.message };
      }

      return { success: true, count: products.length, message: `${products.length} produtos sincronizados na nuvem!` };
    } catch (err: any) {
      return { success: false, count: 0, message: err.message || 'Erro inesperado na sincronização.' };
    }
  }

  /**
   * Puxa produtos oficiais atualizados da nuvem (Supabase).
   */
  static async pullProductsFromCloud(): Promise<{ success: boolean; products: Product[]; message: string }> {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, products: [], message: 'Supabase não conectado.' };
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, products: [], message: error.message };
      }

      if (!data || data.length === 0) {
        return { success: true, products: [], message: 'Nenhum produto encontrado na nuvem.' };
      }

      const products: Product[] = data.map((row: any) => {
        const rowData = row.data || {};
        const specs = rowData.specs || {};
        return {
          id: row.id,
          code: row.sku || row.code || 'PRESYS-ITEM',
          model: row.name || row.model || 'Modelo',
          family: row.family || 'Geral',
          description: rowData.description || '',
          specs: {
            range: specs.range || '',
            unit: specs.unit || '',
            accuracy: specs.accuracy || '',
            output: specs.output || '',
            powerSupply: specs.powerSupply || '',
            processConnection: specs.processConnection || '',
            protectionDegree: specs.protectionDegree || 'IP67',
            customSpecs: specs.customSpecs || {}
          },
          imageUrl: rowData.imageUrl || '',
          createdAt: row.created_at || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString(),
          version: row.version || rowData.version || 1
        };
      });

      const validated = z.array(ProductSchema).parse(products);
      return { success: true, products: validated, message: `${validated.length} produtos baixados da nuvem!` };
    } catch (err: any) {
      return { success: false, products: [], message: err.message || 'Falha ao processar produtos remotos.' };
    }
  }

  /**
   * Sincroniza catálogos completos com o Supabase.
   */
  static async pushCatalogsToCloud(
    catalogs: Catalog[]
  ): Promise<{ success: boolean; count: number; message: string }> {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, count: 0, message: 'Supabase não conectado.' };
    }

    try {
      const payload = catalogs.map((c) => {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.id);
        const item: any = {
          name: c.title,
          locale: 'pt-BR',
          template_key: c.themeId || 'default-technical',
          brand: {
            subtitle: c.subtitle,
            pages: c.pages,
            version: c.version
          },
          updated_at: new Date().toISOString()
        };
        if (isUUID) {
          item.id = c.id;
        }
        return item;
      });

      const { error } = await supabase
        .from('catalogs')
        .upsert(payload, { onConflict: 'name' });

      if (error) {
        return { success: false, count: 0, message: error.message };
      }

      return { success: true, count: catalogs.length, message: `${catalogs.length} catálogo(s) sincronizado(s) na nuvem!` };
    } catch (err: any) {
      return { success: false, count: 0, message: err.message || 'Erro na sincronização de catálogos.' };
    }
  }

  /**
   * Puxa catálogos da nuvem (Supabase).
   */
  static async pullCatalogsFromCloud(): Promise<{ success: boolean; catalogs: Catalog[]; message: string }> {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, catalogs: [], message: 'Supabase não conectado.' };
    }

    try {
      const { data, error } = await supabase
        .from('catalogs')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        return { success: false, catalogs: [], message: error.message };
      }

      if (!data || data.length === 0) {
        return { success: true, catalogs: [], message: 'Nenhum catálogo encontrado na nuvem.' };
      }

      const catalogs: Catalog[] = data.map((row: any) => {
        const brand = row.brand || {};
        return {
          id: row.id,
          title: row.name || 'Catálogo',
          subtitle: brand.subtitle || '',
          themeId: row.template_key || 'default-technical',
          pages: brand.pages || [],
          createdAt: row.created_at || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString(),
          version: brand.version || row.version || 1
        };
      });

      const validated = z.array(CatalogSchema).parse(catalogs);
      return { success: true, catalogs: validated, message: `${validated.length} catálogo(s) baixado(s) da nuvem!` };
    } catch (err: any) {
      return { success: false, catalogs: [], message: err.message || 'Falha ao processar catálogos remotos.' };
    }
  }
}
