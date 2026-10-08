import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createMockQueryBuilder, mockSupabaseClient } from '../setup';
import { mockAdminSession, mockEditorSession, mockProfiles } from '../fixtures/mockAuth';
import { resetSupabaseClientForTests } from '@/services/supabase.service';
import { useAuthStore } from '@/stores/useAuthStore';

function profileResult(data: unknown) {
  const builder = createMockQueryBuilder([]);
  builder.maybeSingle.mockResolvedValue({ data, error: null });
  return builder;
}

describe('Father release: profile revalidation remains bound to its identity', () => {
  let callback: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>;
  beforeEach(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-anon-key');
    resetSupabaseClientForTests();
    vi.clearAllMocks();
    useAuthStore.getState().resetForTests();
    mockSupabaseClient.auth.onAuthStateChange.mockImplementation((listener) => {
      callback = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: mockAdminSession }, error: null });
    mockSupabaseClient.from.mockImplementation(() => profileResult(mockProfiles.admin));
    await useAuthStore.getState().initialize();
  });
  afterEach(() => {
    useAuthStore.getState().resetForTests();
    vi.unstubAllEnvs();
    resetSupabaseClientForTests();
  });

  it.each([null, mockProfiles.admin])('ignores an old user profile result after another user signs in (%j)', async (oldProfile) => {
    let finish!: (value: { data: unknown; error: null }) => void;
    const pending = new Promise<{ data: unknown; error: null }>((resolve) => { finish = resolve; });
    const builder = createMockQueryBuilder([]);
    builder.maybeSingle.mockReturnValue(pending);
    mockSupabaseClient.from.mockImplementationOnce(() => builder);
    await callback('USER_UPDATED', mockAdminSession as Session);
    mockSupabaseClient.from.mockImplementation(() => profileResult(mockProfiles.editor));
    await callback('SIGNED_IN', mockEditorSession as Session);
    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', userId: mockEditorSession.user.id, role: 'editor' });
    finish({ data: oldProfile, error: null });
    await pending;
    await Promise.resolve();
    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', userId: mockEditorSession.user.id, role: 'editor' });
  });

  it('does not carry an admin role into a refreshed session belonging to a viewer', async () => {
    mockSupabaseClient.from.mockImplementation(() => profileResult(mockProfiles.viewer));
    const states: Array<{ status: string; userId: string | null; role: string | null }> = [];
    const detach = useAuthStore.subscribe((state) => { states.push({ status: state.status, userId: state.userId, role: state.role }); });
    await callback('TOKEN_REFRESHED', mockEditorSession as Session);
    detach();
    expect(states).not.toContainEqual({ status: 'authenticated', userId: mockEditorSession.user.id, role: 'admin' });
    expect(useAuthStore.getState()).toMatchObject({ status: 'forbidden', userId: null, role: null });
  });

  it('ignores background profile success after logout', async () => {
    let finish!: (value: { data: unknown; error: null }) => void;
    const pending = new Promise<{ data: unknown; error: null }>((resolve) => { finish = resolve; });
    const builder = createMockQueryBuilder([]);
    builder.maybeSingle.mockReturnValue(pending);
    mockSupabaseClient.from.mockImplementationOnce(() => builder);
    await callback('TOKEN_REFRESHED', mockAdminSession as Session);
    await callback('SIGNED_OUT', null);
    finish({ data: mockProfiles.admin, error: null });
    await pending;
    await Promise.resolve();
    expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', userId: null, role: null });
  });
});
