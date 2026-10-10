import type { CatalogAgentGateway, CatalogAgentRequest } from './gemini-plan';
import type { ProviderId } from './provider-vault';

/**
 * A user-managed credential is sent only with an explicit, authenticated
 * provider action. It is never added to document/session/transcript state.
 *
 * The approved Supabase Edge gateway must verify role, tenant, origin and
 * reserve a durable server-side cost quota BEFORE invoking the provider.
 * No direct browser-to-provider requests are made by this adapter.
 */
export interface AuthenticatedFunctions {
  readonly functions: {
    invoke(name: string, options: { body: CatalogAgentRequest & {
      credential: { provider: 'gemini'; apiKey: string };
    } }): Promise<{ data: unknown; error: unknown }>;
  };
}

export function byokCatalogGateway(
  client: AuthenticatedFunctions,
  provider: ProviderId,
  credential: string,
): CatalogAgentGateway {
  if (provider !== 'gemini') {
    // Other providers are encrypted in the vault, but intentionally disabled
    // until each authenticated server adapter passes real-provider acceptance.
    throw new Error('PROVIDER_ADAPTER_NOT_ENABLED');
  }
  if (typeof credential !== 'string' || credential.length < 12 ||
      credential.length > 2048 || credential.trim() !== credential) {
    throw new Error('PROVIDER_CREDENTIAL_INVALID');
  }
  return async (request) => {
    const { data, error } = await client.functions.invoke('vnext-catalog-agent', {
      body: { ...request, credential: { provider, apiKey: credential } },
    });
    if (error || !data || typeof data !== 'object' || !('reply' in data)) {
      // Do not expose provider errors/headers or request serialization.
      throw new Error('CATALOG_AGENT_GATEWAY_UNAVAILABLE');
    }
    return data.reply;
  };
}
