import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { getSupabase } from '@/services/supabase.service';

export type EffectiveRole = 'admin' | 'editor';
export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'forbidden' | 'profile-error';

interface ProfileRecord {
  id: string;
  role: string;
  is_active: boolean;
}

interface AuthState {
  status: AuthStatus;
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
    const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'SIGNED_IN') {
        const eventGeneration = ++generation;
        set({ status: 'loading', errorMessage: null, ...resetIdentity() });
        void resolveSession(session, set, eventGeneration);
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
