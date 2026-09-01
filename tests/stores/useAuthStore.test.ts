import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockQueryBuilder, mockSupabaseClient } from '../setup';
import { mockAdminSession, mockEditorSession, mockProfiles } from '../fixtures/mockAuth';
import { useAuthStore } from '../../src/stores/useAuthStore';

const profileBuilder = (profile: unknown, error: unknown = null) => {
  const builder = createMockQueryBuilder([]) as any;
  builder.maybeSingle.mockResolvedValue({ data: profile, error });
  return builder;
};

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().resetForTests();
    mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: null });
    mockSupabaseClient.from.mockImplementation(() => profileBuilder(null));
    mockSupabaseClient.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it('bloqueia sem sessão antes de liberar módulos', async () => {
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', role: null });
  });

  it('aceita somente perfil admin ativo após login por senha', async () => {
    mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({ data: { session: mockAdminSession }, error: null });
    mockSupabaseClient.from.mockImplementation(() => profileBuilder(mockProfiles.admin));

    await expect(useAuthStore.getState().signIn('admin@example.test', 'test-password')).resolves.toBe(true);
    expect(mockSupabaseClient.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'admin@example.test', password: 'test-password' });
    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', role: 'admin' });
  });

  it('permanece desautenticado quando a senha é inválida', async () => {
    mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' }
    });

    await expect(useAuthStore.getState().signIn('admin@example.test', 'senha-errada')).resolves.toBe(false);
    expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', role: null });
  });

  it('mapeia editor ativo para Colaborador limitado sem privilégio admin', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: mockEditorSession }, error: null });
    mockSupabaseClient.from.mockImplementation(() => profileBuilder(mockProfiles.editor));

    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', role: 'editor' });
  });

  it.each([mockProfiles.viewer, mockProfiles.inactive, null])('falha fechado para perfil não autorizado', async (profile) => {
    mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: mockAdminSession }, error: null });
    mockSupabaseClient.from.mockImplementation(() => profileBuilder(profile));

    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ status: 'forbidden', role: null });
  });

  it('não libera acesso após erro de leitura de perfil', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: mockAdminSession }, error: null });
    mockSupabaseClient.from.mockImplementation(() => profileBuilder(null, { message: 'denied' }));

    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ status: 'profile-error', role: null });
  });

  it('limpa a identidade em SIGNED_OUT', async () => {
    let callback: ((event: string, session: any) => void) | undefined;
    mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: mockAdminSession }, error: null });
    mockSupabaseClient.from.mockImplementation(() => profileBuilder(mockProfiles.admin));
    mockSupabaseClient.auth.onAuthStateChange.mockImplementation((listener: typeof callback) => {
      callback = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    await useAuthStore.getState().initialize();
    callback?.('SIGNED_OUT', null);
    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
    expect(useAuthStore.getState().role).toBeNull();
  });

  it('ignora uma resposta tardia do perfil depois que a sessão termina', async () => {
    let resolveProfile: ((result: { data: unknown; error: null }) => void) | undefined;
    const delayedProfile = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveProfile = resolve;
    });
    const builder = createMockQueryBuilder([]) as any;
    builder.maybeSingle.mockReturnValue(delayedProfile);
    mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: mockAdminSession }, error: null });
    mockSupabaseClient.from.mockImplementation(() => builder);

    const initialization = useAuthStore.getState().initialize();
    await vi.waitFor(() => expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles'));
    await useAuthStore.getState().signOut();
    resolveProfile?.({ data: mockProfiles.admin, error: null });
    await initialization;

    expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', role: null, email: null });
  });

  it('não oferece signup, magic link ou recuperação de senha no adaptador de Auth', () => {
    expect(mockSupabaseClient.auth).not.toHaveProperty('signUp');
    expect(mockSupabaseClient.auth).not.toHaveProperty('signInWithOtp');
    expect(mockSupabaseClient.auth).not.toHaveProperty('resetPasswordForEmail');
  });
});
