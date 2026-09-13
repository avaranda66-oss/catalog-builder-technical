import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type {
  VNextPersistenceRpcClient,
  VNextPersistenceRpcResponse,
} from './supabase-repository';

let client: SupabaseClient | null = null;

export function getVNextSupabaseClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) return null;
  if (!client) {
    try {
      client = createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    } catch {
      client = null;
    }
  }
  return client;
}

export function vnextRpcClientFromSupabase(
  supabase: SupabaseClient
): VNextPersistenceRpcClient {
  return {
    rpc: async (
      functionName: string,
      args?: Record<string, unknown>
    ): Promise<VNextPersistenceRpcResponse> => {
      const response = await supabase.rpc(functionName, args);
      return {
        data: response.data,
        error: response.error
          ? {
              code: response.error.code,
              message: response.error.message,
              details: response.error.details,
              hint: response.error.hint,
            }
          : null,
      };
    },
  };
}
