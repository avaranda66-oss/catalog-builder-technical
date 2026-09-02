import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { getSupabase } from '@/services/supabase.service';
import { useCatalogStore } from '@/stores/useCatalogStore';

export type EffectiveRole = 'admin' | 'editor';
export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'forbidden' | 'profile-error';

interface ProfileRecord {
  id: string;
  role: string;
  is_active: boolean;
}

export interface AuthState {
  status: AuthStatus;
  userId: string | null;
  role: EffectiveRole | null;
  email: string | null;
  errorMessage: string | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  retryProfile: () => Promise<void>;
  resetForTests: () => void;
}

let generation = 0;
let unsubscribe: (() => void) | null = null;

const resetIdentity = () => ({
  userId: null,
  role: null,
  email: null
});

const deniedMessage = 'Seu acesso ainda não foi liberado. Fale com o administrador do sistema.';
const profileErrorMessage = 'Não foi possível validar seu acesso. Tente novamente mais tarde.';

const resolveSession = async (
  session: Session | null,
  set: (partial: Partial<AuthState>) => void,
  currentGeneration: number
) => {
  if (!session?.user) {
    if (currentGeneration === generation) {
      set({ status: 'unauthenticated', errorMessage: null, ...resetIdentity() });
    }
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    if (currentGeneration === generation) {
      set({ status: 'profile-error', errorMessage: profileErrorMessage, ...resetIdentity() });
    }
    return;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', session.user.id)
      .maybeSingle();

    if (currentGeneration !== generation) return;

    if (error) {
      set({ status: 'profile-error', errorMessage: profileErrorMessage, ...resetIdentity() });
      return;
    }

    const profile = data as ProfileRecord | null;
    if (!profile || !profile.is_active || (profile.role !== 'admin' && profile.role !== 'editor')) {
      set({ status: 'forbidden', errorMessage: deniedMessage, ...resetIdentity() });
      return;
    }

    set({
      status: 'authenticated',
      userId: session.user.id,
      role: profile.role,
      email: session.user.email ?? null,
      errorMessage: null
    });
  } catch {
    if (currentGeneration === generation) {
      set({ status: 'profile-error', errorMessage: profileErrorMessage, ...resetIdentity() });
    }
  }
};

const revalidateProfileInBackground = async (
  userId: string,
  set: (partial: Partial<AuthState>) => void
) => {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (error) return; // Falhas transitórias de rede não desautenticam
    const profile = data as ProfileRecord | null;
    if (!profile || !profile.is_active || (profile.role !== 'admin' && profile.role !== 'editor')) {
      set({ status: 'forbidden', errorMessage: deniedMessage, ...resetIdentity() });
      return;
    }

    set({ role: profile.role });
  } catch {
    // Ignora erro transitório em background
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  ...resetIdentity(),
  errorMessage: null,

  initialize: async () => {
    const currentGeneration = ++generation;
    set({ status: 'loading', errorMessage: null, ...resetIdentity() });
    const supabase = getSupabase();

    if (!supabase) {
      set({ status: 'profile-error', errorMessage: profileErrorMessage, ...resetIdentity() });
      return;
    }

    unsubscribe?.();
    const { data } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      const prevStatus = get().status;
      const prevUserId = get().userId;
      const currentUserId = session?.user?.id ?? null;

      const isDebug = typeof window !== 'undefined' && (
        new URLSearchParams(window.location.search).get('debugRealtime') === '1' ||
        import.meta.env.DEV
      );

      if (isDebug) {
        console.log('[AUTH EVENT]', {
          event,
          previousStatus: prevStatus,
          userId: currentUserId,
          timestamp: new Date().toISOString()
        });
      }

      // 1. SIGNED_OUT: Desautenticação explícita
      if (event === 'SIGNED_OUT') {
        ++generation;
        set({ status: 'unauthenticated', errorMessage: null, ...resetIdentity() });
        useCatalogStore.getState().resetWorkspaceForIdentityChange();
        return;
      }

      // 2. TOKEN_REFRESHED: Renovação silenciosa de token NÃO pode mudar status para loading nem desmontar editor!
      if (event === 'TOKEN_REFRESHED') {
        if (prevStatus === 'authenticated' && session?.user) {
          set({
            userId: session.user.id,
            email: session.user.email ?? get().email
          });
          void revalidateProfileInBackground(session.user.id, set);
          return;
        }
      }

      // 3. USER_UPDATED: Revalida perfil em background silenciosamente
      if (event === 'USER_UPDATED') {
        if (prevStatus === 'authenticated' && session?.user) {
          void revalidateProfileInBackground(session.user.id, set);
          return;
        }
      }

      // 4. SIGNED_IN: Se já autenticado para o mesmo usuário, não reseta nada
      if (event === 'SIGNED_IN') {
        if (prevStatus === 'authenticated' && prevUserId === currentUserId) {
          return;
        }

        // Se trocou de usuário, limpa o catálogo em memória do usuário anterior antes de carregar o novo
        if (prevUserId && currentUserId && prevUserId !== currentUserId) {
          console.log(`🧹 [IDENTITY CHANGE] Usuário alterado de ${prevUserId} para ${currentUserId}. Limpando workspace anterior.`);
          useCatalogStore.getState().resetWorkspaceForIdentityChange();
        }

        const eventGeneration = ++generation;
        set({ status: 'loading', errorMessage: null });
        await resolveSession(session, set, eventGeneration);
      }
    });
    unsubscribe = () => data.subscription.unsubscribe();

    try {
      const { data: sessionData, error } = await supabase.auth.getSession();
      if (error) {
        if (currentGeneration === generation) {
          set({ status: 'profile-error', errorMessage: profileErrorMessage, ...resetIdentity() });
        }
        return;
      }
      await resolveSession(sessionData.session, set, currentGeneration);
    } catch {
      if (currentGeneration === generation) {
        set({ status: 'profile-error', errorMessage: profileErrorMessage, ...resetIdentity() });
      }
    }
  },

  signIn: async (email, password) => {
    const supabase = getSupabase();
    if (!supabase) {
      set({ status: 'profile-error', errorMessage: profileErrorMessage, ...resetIdentity() });
      return false;
    }

    set({ status: 'loading', errorMessage: null, ...resetIdentity() });
    const currentGeneration = ++generation;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        if (currentGeneration === generation) {
          set({
            status: 'unauthenticated',
            errorMessage: 'Não foi possível entrar. Verifique seus dados e tente novamente.',
            ...resetIdentity()
          });
        }
        return false;
      }
      await resolveSession(data.session, set, currentGeneration);
      return get().status === 'authenticated';
    } catch {
      if (currentGeneration === generation) {
        set({ status: 'unauthenticated', errorMessage: 'Não foi possível entrar. Tente novamente.', ...resetIdentity() });
      }
      return false;
    }
  },

  signOut: async () => {
    ++generation;
    set({ status: 'unauthenticated', errorMessage: null, ...resetIdentity() });
    useCatalogStore.getState().resetWorkspaceForIdentityChange();
    try {
      const { PersonalCredentialVault } = await import('@/translation/credential-vault');
      PersonalCredentialVault.clearSessionMemory();
    } catch {
      // Ignora se não carregado
    }
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
  },

  retryProfile: async () => {
    await get().initialize();
  },

  resetForTests: () => {
    ++generation;
    unsubscribe?.();
    unsubscribe = null;
    set({ status: 'loading', errorMessage: null, ...resetIdentity() });
  }
}));
