import '@testing-library/jest-dom';
import { vi } from 'vitest';

// =========================================================================
// BARREIRA DE SEGURANÇA GLOBAL: MOCKING TOTAL DO SUPABASE EM TESTES UNITÁRIOS
// =========================================================================

export const mockSupabaseStorage = {
  from: vi.fn().mockReturnValue({
    upload: vi.fn().mockResolvedValue({ data: { path: 'uploads/mock-test-file.jpg' }, error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://mock.storage.local/uploads/mock-test-file.jpg' } })
  })
};

export const createMockQueryBuilder = (initialData: any = []) => {
  const builder: any = {
    _data: initialData,
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: initialData, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: initialData, error: null }),
    update: vi.fn().mockResolvedValue({ data: initialData, error: null }),
    delete: vi.fn().mockResolvedValue({ data: initialData, error: null }),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: initialData[0] || null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: initialData[0] || null, error: null }),
    then: (resolve: any) => Promise.resolve({ data: initialData, error: null }).then(resolve)
  };
  return builder;
};

export const mockSupabaseClient = {
  from: vi.fn((_table: string) => createMockQueryBuilder([])),
  rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
  storage: mockSupabaseStorage,
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr-mock-admin', email: 'admin@presys.com.br' } }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  }
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient)
}));

// =========================================================================
// BARREIRA DE REDE: BLOQUEIA QUALQUER FETCH EXTERNO DURANTE TESTES UNITÁRIOS
// =========================================================================

global.fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const urlString = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
  throw new Error(`[SECURITY GATE G6] Network call prohibited in unit test suite: ${urlString}`);
});
