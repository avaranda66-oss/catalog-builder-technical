import { describe, expect, it, vi } from 'vitest';
import { byokCatalogGateway } from '../../../src/vnext/ai-catalog/byok-catalog-gateway';
import { createSyntheticSpecifications } from '../../../src/vnext/ai-catalog/fixture';
import { prepareCatalogAgentRequest, verifyCatalogAgentReply } from '../../../src/vnext/ai-catalog/gemini-plan';

const FAKE_KEY = 'TEST-FAKE-KEY-NO-PROVIDER-ACCESS-123456789';
function client(reply: unknown = null) {
  const invoke = vi.fn(async (_name: string, _options: { body: { credential: { provider: string; apiKey: string } } }) => ({ data: { reply }, error: null }));
  return { functions: { invoke } };
}
describe('User-owned encrypted-vault credential transport', () => {
  it('does not send any credential until a legitimate user agent action', async () => {
    const c = client({ status: 'clarification', question: 'Qual seção precisa aparecer primeiro?' });
    const gateway = byokCatalogGateway(c, 'gemini', FAKE_KEY);
    expect(c.functions.invoke).not.toHaveBeenCalled();
    const input = await createSyntheticSpecifications();
    const request = prepareCatalogAgentRequest(input, 'Comece pelas características elétricas.');
    const response = await gateway(request);
    expect(verifyCatalogAgentReply(request, response).status).toBe('clarification');
    expect(c.functions.invoke).toHaveBeenCalledTimes(1);
    const [functionName, invocation] = c.functions.invoke.mock.calls[0];
    expect(functionName).toBe('vnext-catalog-agent');
    expect(invocation.body.credential).toEqual({ provider: 'gemini', apiKey: FAKE_KEY });
    expect(request).not.toHaveProperty('credential');
    expect(JSON.stringify(request)).not.toContain(FAKE_KEY);
  });
  it('disables unaccepted providers before any API request', () => {
    const c = client();
    expect(() => byokCatalogGateway(c, 'openai', FAKE_KEY)).toThrow('PROVIDER_ADAPTER_NOT_ENABLED');
    expect(() => byokCatalogGateway(c, 'anthropic', FAKE_KEY)).toThrow('PROVIDER_ADAPTER_NOT_ENABLED');
    expect(c.functions.invoke).not.toHaveBeenCalled();
  });
  it('rejects malformed keys without dispatch', () => {
    const c = client();
    expect(() => byokCatalogGateway(c, 'gemini', 'bad')).toThrow('PROVIDER_CREDENTIAL_INVALID');
    expect(() => byokCatalogGateway(c, 'gemini', FAKE_KEY + ' ')).toThrow('PROVIDER_CREDENTIAL_INVALID');
    expect(c.functions.invoke).not.toHaveBeenCalled();
  });
  it('fails closed on a transport error without reflecting provider content', async () => {
    const c = { functions: { invoke: vi.fn(async () => ({ data: null, error: { message: FAKE_KEY } })) } };
    const gateway = byokCatalogGateway(c, 'gemini', FAKE_KEY);
    const input = await createSyntheticSpecifications();
    await expect(gateway(prepareCatalogAgentRequest(input, 'Prepare uma proposta.')))
      .rejects.toThrow('CATALOG_AGENT_GATEWAY_UNAVAILABLE');
    expect(c.functions.invoke).toHaveBeenCalledTimes(1);
  });
});
