import type { CatalogAgentGateway, CatalogAgentRequest } from './gemini-plan';

export interface CatalogAgentFunctionsClient {
  readonly functions: {
    invoke(name: string, options: { readonly body: CatalogAgentRequest }): Promise<{
      readonly data: unknown;
      readonly error: { readonly message?: string | null } | null;
    }>;
  };
}

/** The hosting application injects authenticated infrastructure at its boundary. */
export function catalogGatewayFromFunctionsClient(client: CatalogAgentFunctionsClient): CatalogAgentGateway {
  return async (request) => {
    const { data, error } = await client.functions.invoke('vnext-catalog-agent', { body: request });
    if (error || !data || typeof data !== 'object' || !('reply' in data)) {
      // Never reflect provider or secret-bearing errors into the editor.
      throw new Error('CATALOG_AGENT_GATEWAY_UNAVAILABLE');
    }
    return data.reply;
  };
}
