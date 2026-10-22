import { describe, expect, it, vi } from 'vitest';
import type { DraftClient } from '@/vnext/ai-catalog/draft-client';
import { readinessCode, serverSpecTableGateway } from '@/vnext/ai-catalog/spec-table/spec-table-gateway';

const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const client = (reply: unknown) => ({
  functions: { invoke: vi.fn(async () => reply) },
  storage: { from: () => ({ upload: vi.fn() }) },
}) as unknown as DraftClient;
const httpFailure = (status: number, body: unknown) => ({ data: null, error: Object.assign(new Error('non-2xx'),
  { name: 'FunctionsHttpError', context: { status, clone() { return this; }, json: async () => body } }) });

describe('J2-lite gateway: the server reading may not be deployed yet', () => {
  it('a function that does not exist (404 NOT_FOUND) is "not available yet"', async () => {
    const gateway = serverSpecTableGateway(client(httpFailure(404, { code: 'NOT_FOUND', message: 'Requested function was not found' })), USER);
    expect(await gateway.readiness()).toEqual({ kind: 'blocked', code: 'DRAFT_UNAVAILABLE' });
  });
  it('an online browser that cannot reach the function at all is told it is not available, not that the internet fell', async () => {
    const fetchError = { data: null, error: Object.assign(new Error('Failed to send a request'), { name: 'FunctionsFetchError' }) };
    expect(await serverSpecTableGateway(client(fetchError), USER).readiness()).toEqual({ kind: 'blocked', code: 'DRAFT_UNAVAILABLE' });
    expect(readinessCode('NETWORK', false)).toBe('NETWORK');
    expect(readinessCode('BUDGET_NOT_READY', true)).toBe('BUDGET_NOT_READY');
  });
  it('a deployed function with the server key is ready; no credential is sent', async () => {
    const draft = client({ data: { code: 'OK', status: { serverKey: true, budget: 'ok' } }, error: null });
    expect(await serverSpecTableGateway(draft, USER).readiness()).toMatchObject({ kind: 'ready' });
    expect(draft.functions.invoke).toHaveBeenCalledWith('vnext-catalog-draft', { body: { version: 1, task: 'status' } });
  });
});
