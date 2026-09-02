import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Catalog, CatalogPreset } from '@/domain/catalog.schema';
import { Product } from '@/domain/product.schema';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseClient: SupabaseClient | null = null;

export interface TranslationAuthDiagnostic {
  timestamp: string;
  sessionExists: boolean;
  serverUserConfirmed: boolean;
  authStoreMatches: boolean;
  teamRole: string | null;
  probeAuthenticated: boolean;
  probeRole: string | null;
  projectRef: string;
}

export interface LastTranslationRpc {
  name: string;
  timestamp: string;
  success: boolean;
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

let latestTranslationAuthDiagnostic: TranslationAuthDiagnostic | null = null;
let latestTranslationRpc: LastTranslationRpc | null = null;

type TranslationDiagnosticsListener = (data: {
  authDiagnostic: TranslationAuthDiagnostic | null;
  lastTranslationRpc: LastTranslationRpc | null;
}) => void;

const translationDiagnosticsListeners = new Set<TranslationDiagnosticsListener>();

export function subscribeTranslationDiagnostics(listener: TranslationDiagnosticsListener): () => void {
  translationDiagnosticsListeners.add(listener);
  listener({
    authDiagnostic: latestTranslationAuthDiagnostic,
    lastTranslationRpc: latestTranslationRpc
  });
  return () => {
    translationDiagnosticsListeners.delete(listener);
  };
}

function notifyTranslationDiagnostics() {
  for (const listener of translationDiagnosticsListeners) {
    try {
      listener({
        authDiagnostic: latestTranslationAuthDiagnostic,
        lastTranslationRpc: latestTranslationRpc
      });
    } catch {
      // Ignora erro em listener do HUD
    }
  }
}

export function recordTranslationRpcResult(rpc: LastTranslationRpc) {
  latestTranslationRpc = rpc;
  notifyTranslationDiagnostics();
}

export function getLatestTranslationAuthDiagnostic(): TranslationAuthDiagnostic | null {
  return latestTranslationAuthDiagnostic;
}

export function getLatestTranslationRpc(): LastTranslationRpc | null {
  return latestTranslationRpc;
}

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

  /**
   * Obtém o role verificado diretamente do servidor PostgreSQL (RPC team_role).
   * Garante paridade de autorização entre React e Supabase.
   */
  static async getServerTeamRole(): Promise<{
    success: boolean;
    role: 'admin' | 'editor' | 'viewer' | null;
    error?: string;
  }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, role: null, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase.rpc('team_role');
      if (error) {
        return { success: false, role: null, error: error.message };
      }
      return { success: true, role: (data as any) || null };
    } catch (err: any) {
      return { success: false, role: null, error: err?.message || 'Erro de conexão' };
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
  ): Promise<{ success: boolean; data?: any; conflict?: boolean; errorCode?: string; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, errorCode: 'CLIENT_OFFLINE', error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase.rpc('save_catalog_v3', {
        p_catalog: catalog,
        p_expected_version: expectedVersion ?? 0,
        p_summary: summary || 'Atualização de catálogo'
      });

      if (error) {
        const isConflict = error.code === '40001' || error.message?.includes('Conflito');
        return { success: false, conflict: isConflict, errorCode: error.code, error: error.message };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, errorCode: 'NETWORK_ERROR', error: err.message || 'Erro ao salvar catálogo' };
    }
  }

  /**
   * Valida e garante sessão autenticada corporativa estrita (fail-closed)
   * antes de qualquer mutação de documento ou criação de versão traduzida.
   * 1. getSession() -> session existe
   * 2. refreshSession() se expiração próxima (<60s)
   * 3. auth.getUser() -> validação definitiva do JWT com o servidor Supabase Auth
   * 4. rpc('team_role') -> confirmação estrita de role corporativa (admin / editor)
   */
  static async ensureAuthenticatedCorporateSession(): Promise<{
    success: boolean;
    userId?: string;
    role?: 'admin' | 'editor';
    errorCode?: string;
    error?: string;
  }> {
    const supabase = getSupabase();
    if (!supabase) {
      return {
        success: false,
        errorCode: 'CLIENT_OFFLINE',
        error: 'Supabase não inicializado no cliente.'
      };
    }

    try {
      // 1. Valida existência de sessão local
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session) {
        return {
          success: false,
          errorCode: 'AUTH_SESSION_INVALID',
          error: 'Sessão de autenticação ausente ou inválida. Por favor, faça login novamente.'
        };
      }

      let session = sessionData.session;

      // 2. Se token expira em menos de 60s, renova preventivamente (fail-closed)
      if (session.expires_at) {
        const isExpiringSoon = session.expires_at - Date.now() / 1000 < 60;
        if (isExpiringSoon) {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !refreshData?.session) {
            return {
              success: false,
              errorCode: 'AUTH_SESSION_INVALID',
              error: 'Sessão expirada e não foi possível renovar automaticamente.'
            };
          }
          session = refreshData.session;
        }
      }

      // 3. Validação server-side definitiva do JWT via getUser()
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        return {
          success: false,
          errorCode: 'AUTH_SESSION_INVALID',
          error: 'Usuário não confirmado pelo servidor Supabase Auth.'
        };
      }

      // 4. Confirmação do role corporativo diretamente no PostgreSQL (team_role)
      const { data: roleData, error: roleError } = await supabase.rpc('team_role');
      if (roleError || !roleData || (roleData !== 'admin' && roleData !== 'editor')) {
        return {
          success: false,
          errorCode: 'AUTHORIZATION_DENIED',
          error: `Acesso negado: Perfil do servidor (${roleData || 'desconhecido'}) não autorizado para operações críticas.`
        };
      }

      return {
        success: true,
        userId: userData.user.id,
        role: roleData as 'admin' | 'editor'
      };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'AUTH_SESSION_INVALID',
        error: err?.message || 'Falha ao validar sessão corporativa.'
      };
    }
  }

  static async createTranslatedCatalog(
    catalog: Partial<Catalog>,
    sourceCatalogId: string,
    expectedSourceVersion: number,
    summary?: string
  ): Promise<{ success: boolean; data?: any; conflict?: boolean; errorCode?: string; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) {
      recordTranslationRpcResult({
        name: 'create_translated_catalog_v1',
        timestamp: new Date().toISOString(),
        success: false,
        code: 'CLIENT_OFFLINE',
        message: 'Supabase não inicializado'
      });
      return { success: false, errorCode: 'CLIENT_OFFLINE', error: 'Supabase não inicializado' };
    }

    // Validação estrita e atômica da sessão corporativa no servidor
    const authValidation = await this.ensureAuthenticatedCorporateSession();
    if (!authValidation.success) {
      recordTranslationRpcResult({
        name: 'create_translated_catalog_v1',
        timestamp: new Date().toISOString(),
        success: false,
        code: authValidation.errorCode || 'AUTH_SESSION_INVALID',
        message: authValidation.error || 'Sem permissão de acesso.'
      });
      return {
        success: false,
        errorCode: authValidation.errorCode || 'AUTH_SESSION_INVALID',
        error: authValidation.error || 'Sem permissão de acesso.'
      };
    }

    try {
      const { data, error } = await supabase.rpc('create_translated_catalog_v1', {
        p_catalog: catalog,
        p_source_catalog_id: sourceCatalogId,
        p_expected_source_version: expectedSourceVersion,
        p_summary: summary || 'Criação de versão traduzida'
      });

      if (error) {
        recordTranslationRpcResult({
          name: 'create_translated_catalog_v1',
          timestamp: new Date().toISOString(),
          success: false,
          code: error.code || 'RPC_ERROR',
          message: error.message || 'Erro ao criar versão traduzida',
          details: error.details,
          hint: error.hint
        });

        const isConflict =
          error.code === '40001' ||
          error.message?.includes('SOURCE_CHANGED_DURING_TRANSLATION') ||
          error.message?.includes('Conflito');
        return { success: false, conflict: isConflict, errorCode: error.code || 'RPC_ERROR', error: error.message };
      }

      recordTranslationRpcResult({
        name: 'create_translated_catalog_v1',
        timestamp: new Date().toISOString(),
        success: true,
        code: '200_OK',
        message: 'Catálogo traduzido criado com sucesso no servidor'
      });

      return { success: true, data };
    } catch (err: any) {
      recordTranslationRpcResult({
        name: 'create_translated_catalog_v1',
        timestamp: new Date().toISOString(),
        success: false,
        code: 'NETWORK_ERROR',
        message: err.message || 'Erro ao criar versão traduzida'
      });
      return { success: false, errorCode: 'NETWORK_ERROR', error: err.message || 'Erro ao criar versão traduzida' };
    }
  }

  static async createTranslatedTemplate(
    template: Partial<Catalog>,
    sourceTemplateId: string,
    expectedSourceVersion: number,
    summary?: string
  ): Promise<{ success: boolean; data?: any; conflict?: boolean; errorCode?: string; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) {
      recordTranslationRpcResult({
        name: 'create_translated_template_v1',
        timestamp: new Date().toISOString(),
        success: false,
        code: 'CLIENT_OFFLINE',
        message: 'Supabase não inicializado'
      });
      return { success: false, errorCode: 'CLIENT_OFFLINE', error: 'Supabase não inicializado' };
    }

    // Validação estrita e atômica da sessão corporativa no servidor
    const authValidation = await this.ensureAuthenticatedCorporateSession();
    if (!authValidation.success) {
      recordTranslationRpcResult({
        name: 'create_translated_template_v1',
        timestamp: new Date().toISOString(),
        success: false,
        code: authValidation.errorCode || 'AUTH_SESSION_INVALID',
        message: authValidation.error || 'Sem permissão de acesso.'
      });
      return {
        success: false,
        errorCode: authValidation.errorCode || 'AUTH_SESSION_INVALID',
        error: authValidation.error || 'Sem permissão de acesso.'
      };
    }

    try {
      const { data, error } = await supabase.rpc('create_translated_template_v1', {
        p_template: template,
        p_source_template_id: sourceTemplateId,
        p_expected_source_version: expectedSourceVersion,
        p_summary: summary || 'Criação de template traduzido'
      });

      if (error) {
        recordTranslationRpcResult({
          name: 'create_translated_template_v1',
          timestamp: new Date().toISOString(),
          success: false,
          code: error.code || 'RPC_ERROR',
          message: error.message || 'Erro ao criar template traduzido',
          details: error.details,
          hint: error.hint
        });

        const isConflict =
          error.code === '40001' ||
          error.message?.includes('SOURCE_CHANGED_DURING_TRANSLATION') ||
          error.message?.includes('Conflito');
        return { success: false, conflict: isConflict, errorCode: error.code || 'RPC_ERROR', error: error.message };
      }

      recordTranslationRpcResult({
        name: 'create_translated_template_v1',
        timestamp: new Date().toISOString(),
        success: true,
        code: '200_OK',
        message: 'Template traduzido criado com sucesso no servidor'
      });

      return { success: true, data };
    } catch (err: any) {
      recordTranslationRpcResult({
        name: 'create_translated_template_v1',
        timestamp: new Date().toISOString(),
        success: false,
        code: 'NETWORK_ERROR',
        message: err.message || 'Erro ao criar template traduzido'
      });
      return { success: false, errorCode: 'NETWORK_ERROR', error: err.message || 'Erro ao criar template traduzido' };
    }
  }

  static async diagnoseCurrentTranslationAuth(): Promise<TranslationAuthDiagnostic> {
    let resolvedProjectRef = 'unknown';
    try {
      if (supabaseUrl) {
        resolvedProjectRef = new URL(supabaseUrl).hostname.split('.')[0] || 'unknown';
      }
    } catch {
      resolvedProjectRef = 'invalid-url';
    }

    const supabase = getSupabase();
    if (!supabase) {
      const diag: TranslationAuthDiagnostic = {
        timestamp: new Date().toISOString(),
        sessionExists: false,
        serverUserConfirmed: false,
        authStoreMatches: false,
        teamRole: null,
        probeAuthenticated: false,
        probeRole: null,
        projectRef: resolvedProjectRef
      };
      latestTranslationAuthDiagnostic = diag;
      notifyTranslationDiagnostics();
      return diag;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;

    const { data: userData } = await supabase.auth.getUser();
    const serverUserConfirmed = !!userData?.user;

    const { useAuthStore } = await import('@/stores/useAuthStore');
    const authStoreUserId = useAuthStore.getState().userId;

    const { data: roleData } = await supabase.rpc('team_role');
    const { data: probeData } = await supabase.rpc('translation_auth_probe_v1');

    const diag: TranslationAuthDiagnostic = {
      timestamp: new Date().toISOString(),
      sessionExists: !!session,
      serverUserConfirmed,
      authStoreMatches: !!session?.user?.id && session.user.id === authStoreUserId,
      teamRole: (roleData as any) || null,
      probeAuthenticated: !!probeData?.authenticated,
      probeRole: probeData?.role || null,
      projectRef: resolvedProjectRef
    };

    latestTranslationAuthDiagnostic = diag;
    notifyTranslationDiagnostics();
    return diag;
  }

  static async runTranslationAuthForensicCheck(): Promise<TranslationAuthDiagnostic> {
    return this.diagnoseCurrentTranslationAuth();
  }

  static async getCatalog(id: string): Promise<{ success: boolean; data?: Catalog; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase
        .from('catalogs')
        .select('*')
        .eq('id', id)
        .single();

      if (error) return { success: false, error: error.message };
      if (!data) return { success: false, error: 'Catálogo não encontrado' };

      const catalog = catalogRowToCatalog(data);
      return { success: true, data: catalog };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao carregar catálogo do servidor' };
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

  static async listTemplates(): Promise<{ success: boolean; data?: CatalogPreset[]; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('name', { ascending: true });

      if (error) return { success: false, error: error.message };
      const presets = (data || []).map((row) => templateRowToCatalogPreset(row));
      return { success: true, data: presets };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao carregar templates do servidor' };
    }
  }

  static async createTemplate(preset: CatalogPreset): Promise<{ success: boolean; data?: CatalogPreset; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const validId = preset.id && !preset.id.startsWith('preset-custom-')
        ? preset.id
        : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0'));

      const payload = {
        id: validId,
        name: preset.name,
        template_key: `custom-${validId}`,
        design_tokens: {
          category: preset.category || 'layout_template',
          description: preset.description || '',
          isSystem: false
        },
        layout_config: preset.catalog,
        is_system: false
      };

      const { data, error } = await supabase
        .from('templates')
        .insert(payload)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: templateRowToCatalogPreset(data) };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao salvar template no servidor' };
    }
  }

  static async getTemplate(id: string): Promise<{ success: boolean; data?: CatalogPreset; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('id', id)
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: templateRowToCatalogPreset(data) };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao carregar template' };
    }
  }

  static async updateTemplate(
    templateId: string,
    catalog: Catalog,
    expectedVersion: number = 0,
    name?: string,
    description?: string
  ): Promise<{ success: boolean; data?: CatalogPreset; conflict?: boolean; serverVersion?: number; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      // 1. Executa RPC save_template_v1 (com CAS estrito, row lock e validação de role)
      const { data: rpcData, error: rpcError } = await supabase.rpc('save_template_v1', {
        p_template_id: templateId,
        p_expected_version: expectedVersion,
        p_layout_config: catalog,
        p_name: name || catalog.title,
        p_description: description
      });

      if (rpcError) {
        if (rpcError.code === '42501' || rpcError.message?.includes('permissão') || rpcError.message?.includes('permission')) {
          return {
            success: false,
            error: 'Permissão negada: somente administradores ou editores autorizados podem salvar templates corporativos.'
          };
        }
        if (rpcError.code === '42883' || rpcError.message?.includes('does not exist')) {
          return {
            success: false,
            error: 'TEMPLATE_SCHEMA_NOT_READY: Atualização do banco necessária para editar templates.'
          };
        }
        return { success: false, error: rpcError.message };
      }

      if (rpcData) {
        if (rpcData.conflict || rpcData.errorCode === '40001') {
          return {
            success: false,
            conflict: true,
            serverVersion: rpcData.serverVersion,
            error: rpcData.error || 'Conflito de versão no template.'
          };
        }
        if (rpcData.success && rpcData.data) {
          return { success: true, data: templateRowToCatalogPreset(rpcData.data) };
        }
        if (!rpcData.success) {
          return { success: false, error: rpcData.error || 'Erro desconhecido na gravação do template.' };
        }
      }

      return {
        success: false,
        error: 'TEMPLATE_SCHEMA_NOT_READY: Resposta inesperada da função de versionamento de template.'
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao atualizar template no servidor' };
    }
  }

  static async deleteTemplate(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao excluir template no servidor' };
    }
  }

  static async listLibraryWorkspace(): Promise<{
    success: boolean;
    data?: {
      families: any[];
      fields: any[];
      products: any[];
      events: any[];
    };
    error?: string;
  }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase.rpc('list_library_workspace_v1');
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao carregar dados da biblioteca' };
    }
  }

  static async saveProductFamily(family: Partial<any>): Promise<{ success: boolean; data?: any; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase.rpc('save_product_family_v1', { p_family: family });
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao salvar família de produtos' };
    }
  }

  static async deleteProductFamily(familyId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase.rpc('delete_product_family_v1', { p_family_id: familyId });
      if (error) return { success: false, error: error.message };
      return { success: Boolean(data) };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao excluir família de produtos' };
    }
  }

  static async saveFamilyField(field: Partial<any>): Promise<{ success: boolean; data?: any; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase.rpc('save_family_field_v1', { p_field: field });
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao salvar coluna da família' };
    }
  }

  static async deleteFamilyField(fieldId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase.rpc('delete_family_field_v1', { p_field_id: fieldId });
      if (error) return { success: false, error: error.message };
      return { success: Boolean(data) };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao excluir coluna da família' };
    }
  }

  static async saveProduct(
    product: any,
    expectedVersion: number = 0,
    fieldKey?: string,
    summary?: string
  ): Promise<{ success: boolean; data?: any; conflict?: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase.rpc('save_product_v4', {
        p_product: product,
        p_expected_version: expectedVersion,
        p_changes: fieldKey ? { field_key: fieldKey } : null,
        p_summary: summary || 'Atualização de produto'
      });

      if (error) {
        if (error.code === '40001' || error.message.includes('Conflito')) {
          return { success: false, conflict: true, error: error.message };
        }
        if (error.code === '42501' || error.message.includes('permission') || error.message.includes('Admin')) {
          return { success: false, error: 'Permissão negada: apenas administradores podem alterar a biblioteca de produtos.' };
        }
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao salvar produto' };
    }
  }

  static async deleteProduct(productId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
      const { data, error } = await supabase.rpc('delete_product_v3', { p_product_id: productId });
      if (error) return { success: false, error: error.message };
      return { success: Boolean(data) };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao excluir produto' };
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

/**
 * Converte canonicamente uma linha de catálogo (do Supabase RPC list_workspace_v2 ou tabela catalogs)
 * para a interface completa Catalog.
 * 
 * Regra Crítica (Fase 3A.4A):
 * - Spread do payload persistido PRIMEIRO (preservando locale, sourceLocale, translationMeta,
 *   localizedSystemStrings, lastMutation e custom metadata futuros).
 * - Campos autoritativos da row do banco DEPOIS (id, title/name, version, timestamps, themeId fallback, pages).
 * - Zero allowlist curta restritiva.
 */
export function catalogRowToCatalog(row: any): Catalog {
  if (!row) return row;
  const brand = typeof row.brand === 'object' && row.brand !== null ? row.brand : {};
  const payload = (brand.pages && Array.isArray(brand.pages))
    ? brand
    : (brand.catalog && Array.isArray(brand.catalog.pages))
      ? brand.catalog
      : brand;

  const versionNum = row.version !== undefined && row.version !== null && !isNaN(Number(row.version))
    ? Number(row.version)
    : (payload.version ?? 1);

  return {
    ...payload,
    id: row.id || payload.id,
    title: row.name || row.title || payload.title || 'Catálogo Sem Título',
    version: versionNum,
    createdAt: row.created_at || row.createdAt || payload.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || payload.updatedAt || new Date().toISOString(),
    themeId: payload.themeId || 'default-technical',
    pages: Array.isArray(payload.pages) ? payload.pages : []
  };
}

export function templateRowToCatalogPreset(row: any): CatalogPreset {
  const designTokens = typeof row.design_tokens === 'object' && row.design_tokens !== null ? row.design_tokens : {};
  const layoutConfig = typeof row.layout_config === 'object' && row.layout_config !== null ? row.layout_config : {};
  const version = typeof row.version === 'number' ? row.version : (layoutConfig.version || 1);
  const resolvedName = row.name || layoutConfig.title || 'Template Sem Nome';

  return {
    id: row.id,
    name: resolvedName,
    description: designTokens.description || row.description || 'Modelo de layout customizado.',
    category: designTokens.category || 'layout_template',
    isSystem: row.is_system ?? false,
    version,
    catalog: layoutConfig.pages ? { ...layoutConfig, title: resolvedName, version } : {
      id: row.id,
      title: resolvedName,
      subtitle: '',
      themeId: 'default-technical',
      pages: [],
      version,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString()
    },
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString()
  };
}
