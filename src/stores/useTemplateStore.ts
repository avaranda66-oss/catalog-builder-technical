import { create } from 'zustand';
import { CatalogPreset, Catalog } from '../domain/catalog.schema';
import { SYSTEM_PRESETS } from '../data/presets';
import { SupabaseService, templateRowToCatalogPreset } from '../services/supabase.service';

export interface TemplateState {
  customTemplates: CatalogPreset[];
  systemTemplates: CatalogPreset[];
  isLoading: boolean;
  syncStatus: 'synced' | 'saving' | 'error' | 'offline';
  syncError: string | null;

  loadTemplates: () => Promise<void>;
  createCustomTemplate: (
    name: string,
    description: string,
    catalog: Catalog
  ) => Promise<{ success: boolean; data?: CatalogPreset; error?: string }>;
  deleteCustomTemplate: (id: string) => Promise<{ success: boolean; error?: string }>;
  migrateLegacyLocalStoragePresets: () => Promise<void>;
  handleRealtimeTemplateEvent: (payload: { eventType: string; new?: any; old?: any }) => void;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  customTemplates: [],
  systemTemplates: SYSTEM_PRESETS,
  isLoading: false,
  syncStatus: 'synced',
  syncError: null,

  loadTemplates: async () => {
    set({ isLoading: true, syncError: null });
    try {
      // 1. Tenta carregar do Supabase (Cloud Authority)
      const res = await SupabaseService.listTemplates();
      if (res.success && res.data) {
        const cloudCustom = res.data.filter((t) => !t.isSystem);
        const cloudSystem = res.data.filter((t) => t.isSystem);

        set({
          customTemplates: cloudCustom,
          systemTemplates: cloudSystem.length > 0 ? cloudSystem : SYSTEM_PRESETS,
          syncStatus: 'synced',
          isLoading: false
        });

        // 2. Executa migração única de dados legados do localStorage se necessário
        void get().migrateLegacyLocalStoragePresets();
        return;
      }

      // Fallback offline caso Supabase não esteja disponível
      console.warn('Supabase templates offline fallback:', res.error);
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('cb_custom_presets');
        if (raw) {
          try {
            const cached = JSON.parse(raw);
            set({
              customTemplates: Array.isArray(cached) ? cached : [],
              syncStatus: 'offline',
              syncError: 'Operando em modo offline com cache local de templates.',
              isLoading: false
            });
            return;
          } catch (e) {
            console.error('Erro ao ler cache local de presets:', e);
          }
        }
      }

      set({
        syncStatus: 'offline',
        syncError: res.error || 'Falha ao carregar templates da nuvem.',
        isLoading: false
      });
    } catch (err: any) {
      set({
        isLoading: false,
        syncStatus: 'error',
        syncError: err?.message || 'Erro ao carregar templates.'
      });
    }
  },

  createCustomTemplate: async (name: string, description: string, catalog: Catalog) => {
    set({ syncStatus: 'saving', syncError: null });
    const cleanId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;

    const newPreset: CatalogPreset = {
      id: cleanId,
      name: name.trim(),
      description: description.trim() || 'Modelo personalizado criado pelo usuário.',
      category: 'layout_template',
      isSystem: false,
      catalog: structuredClone(catalog),
      createdAt: new Date().toISOString()
    };

    const res = await SupabaseService.createTemplate(newPreset);
    if (res.success && res.data) {
      const savedPreset = res.data;
      const existing = get().customTemplates.filter((t) => t.id !== savedPreset.id);
      const updated = [savedPreset, ...existing];

      set({
        customTemplates: updated,
        syncStatus: 'synced',
        syncError: null
      });

      // Atualiza backup offline no localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('cb_custom_presets', JSON.stringify(updated));
      }

      return { success: true, data: savedPreset };
    }

    set({
      syncStatus: 'error',
      syncError: res.error || 'Falha ao salvar template no Supabase.'
    });
    return { success: false, error: res.error };
  },

  deleteCustomTemplate: async (id: string) => {
    set({ syncStatus: 'saving', syncError: null });
    const res = await SupabaseService.deleteTemplate(id);

    if (res.success) {
      const updated = get().customTemplates.filter((t) => t.id !== id);
      set({
        customTemplates: updated,
        syncStatus: 'synced',
        syncError: null
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem('cb_custom_presets', JSON.stringify(updated));
      }
      return { success: true };
    }

    set({
      syncStatus: 'error',
      syncError: res.error || 'Falha ao excluir template no Supabase.'
    });
    return { success: false, error: res.error };
  },

  migrateLegacyLocalStoragePresets: async () => {
    if (typeof window === 'undefined') return;
    const isMigrated = localStorage.getItem('cb_custom_presets_migrated_v1');
    if (isMigrated === 'true') return;

    const raw = localStorage.getItem('cb_custom_presets');
    if (!raw) {
      localStorage.setItem('cb_custom_presets_migrated_v1', 'true');
      return;
    }

    try {
      const legacyList = JSON.parse(raw);
      if (Array.isArray(legacyList) && legacyList.length > 0) {
        console.log(`[MIGRATION] Migrando ${legacyList.length} templates do localStorage para o Supabase...`);
        for (const item of legacyList) {
          if (!item.name || !item.catalog) continue;
          await get().createCustomTemplate(item.name, item.description || '', item.catalog);
        }
        console.log('[MIGRATION] Migração de templates concluída com sucesso.');
      }
      localStorage.setItem('cb_custom_presets_migrated_v1', 'true');
    } catch (e) {
      console.warn('Erro ao processar migração de templates legados:', e);
    }
  },

  handleRealtimeTemplateEvent: (payload) => {
    const { eventType } = payload;
    console.log('[REALTIME TEMPLATE EVENT]', eventType, payload.new?.id || payload.old?.id);

    if (eventType === 'INSERT' && payload.new) {
      const newTemplate = templateRowToCatalogPreset(payload.new);
      if (!newTemplate.isSystem) {
        const existing = get().customTemplates.filter((t) => t.id !== newTemplate.id);
        set({ customTemplates: [newTemplate, ...existing] });
      }
    } else if (eventType === 'UPDATE' && payload.new) {
      const updated = templateRowToCatalogPreset(payload.new);
      if (!updated.isSystem) {
        const nextList = get().customTemplates.map((t) => (t.id === updated.id ? updated : t));
        set({ customTemplates: nextList });
      }
    } else if (eventType === 'DELETE' && payload.old?.id) {
      const nextList = get().customTemplates.filter((t) => t.id !== payload.old.id);
      set({ customTemplates: nextList });
    }
  }
}));
