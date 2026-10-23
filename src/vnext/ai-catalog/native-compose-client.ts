import type { NativeComposeGateway, NativeComposeRequest } from './native-compose';
import type { NativeTextEditGateway, NativeTextEditRequest } from './native-text-edit';
import type { EditIntentGateway, EditIntentRequest } from './edit-intents';
import {
  isComposerErrorCode, isComposerErrorReason, type ComposerErrorCode, type ComposerErrorReason,
} from './composer-codes';

type ComposerBody = (NativeComposeRequest | NativeTextEditRequest | EditIntentRequest | { version: 1; task: 'status' }) & {
  credential?: { provider: 'gemini'; apiKey: string };
};
export interface NativeComposeFunctionsClient {
  readonly functions: {
    invoke(name: string, options: { readonly body: ComposerBody }): Promise<{
      readonly data: unknown; readonly error: unknown; readonly response?: unknown;
    }>;
  };
}

/** Codes the browser can show. Server codes are allowlisted; the rest are local. */
export type ComposerClientCode = ComposerErrorCode | 'NETWORK' | 'NATIVE_COMPOSER_UNAVAILABLE' | 'INVALID_REPLY';
/**
 * A composer failure carrying ONLY allowlisted data (code, reason, HTTP
 * status). Provider and Edge error text can contain secrets and is dropped.
 */
export class ComposerRequestError extends Error {
  readonly code: ComposerClientCode;
  readonly reason?: ComposerErrorReason;
  readonly httpStatus?: number;
  constructor(code: ComposerClientCode, reason?: ComposerErrorReason, httpStatus?: number) {
    super(code);
    this.name = 'ComposerRequestError';
    this.code = code;
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

async function readJsonBody(candidate: unknown): Promise<unknown> {
  if (!candidate || typeof candidate !== 'object') return null;
  const clone = (candidate as { clone?: () => unknown }).clone?.();
  const target = clone && typeof clone === 'object' ? clone : candidate;
  const read = (target as { json?: () => Promise<unknown> }).json;
  if (typeof read !== 'function') return null;
  try { return await read.call(target); } catch { return null; }
}
/** Extracts the allowlisted code from a supabase-js functions.invoke failure. */
export async function composerFailure(result: { readonly error: unknown; readonly response?: unknown }): Promise<ComposerRequestError> {
  const error = result.error as { name?: unknown; context?: unknown } | null;
  if (error && typeof error === 'object' && error.name === 'FunctionsFetchError') return new ComposerRequestError('NETWORK');
  const response = (error && typeof error === 'object' ? error.context : undefined) ?? result.response;
  const status = response && typeof response === 'object' && typeof (response as { status?: unknown }).status === 'number'
    ? (response as { status: number }).status : undefined;
  const body = await readJsonBody(response);
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
  const reason = body && typeof body === 'object' ? (body as { reason?: unknown }).reason : undefined;
  return new ComposerRequestError(isComposerErrorCode(code) ? code : 'NATIVE_COMPOSER_UNAVAILABLE',
    isComposerErrorReason(reason) ? reason : undefined, status);
}

function checkedCredential(credential: string | undefined): string | undefined {
  if (credential === undefined) return undefined;
  if (typeof credential !== 'string' || credential.length < 12 || credential.length > 2048 ||
    credential.trim() !== credential) throw new Error('COMPOSER_CREDENTIAL_INVALID');
  return credential;
}
async function invokeComposer(client: NativeComposeFunctionsClient, body: ComposerBody): Promise<unknown> {
  let result: Awaited<ReturnType<NativeComposeFunctionsClient['functions']['invoke']>>;
  try { result = await client.functions.invoke('vnext-catalog-composer', { body }); }
  catch { throw new ComposerRequestError('NATIVE_COMPOSER_UNAVAILABLE'); }
  const { data, error } = result;
  if (error || !data || typeof data !== 'object' || !('reply' in data)) throw await composerFailure(result);
  return (data as { reply: unknown }).reply;
}

/**
 * Invoke only through the authenticated, budgeted Supabase function. Without
 * a credential the server key is used (default); a personal key is sent only
 * when the author unlocked one with "Usar minha própria chave".
 */
export function nativeComposeGateway(client: NativeComposeFunctionsClient, credential?: string): NativeComposeGateway {
  const apiKey = checkedCredential(credential);
  return request => invokeComposer(client, {
    ...request, ...(apiKey ? { credential: { provider: 'gemini', apiKey } } : {}),
  });
}

/** Same bounded backend, different strict task contract. */
export function nativeTextEditGateway(client: NativeComposeFunctionsClient, credential?: string): NativeTextEditGateway {
  const apiKey = checkedCredential(credential);
  return request => invokeComposer(client, {
    ...request, ...(apiKey ? { credential: { provider: 'gemini', apiKey } } : {}),
  });
}

/** FR-72: the conversation that edits the open document (typed intents, never mutations). */
export function editIntentGateway(client: NativeComposeFunctionsClient, credential?: string): EditIntentGateway {
  const apiKey = checkedCredential(credential);
  return request => invokeComposer(client, {
    ...request, ...(apiKey ? { credential: { provider: 'gemini', apiKey } } : {}),
  });
}

export type ComposerReadiness =
  /** New composer: ready, with what the server reported. */
  | { kind: 'ready'; serverKey: boolean; byok: boolean; remainingMicrousd: number | null; callReserveMicrousd: number | null;
      /** FR-72: the deployed function knows `edit_intent` (absent: an older deploy without the task list). */
      editing?: boolean }
  /** Composer deployed before the status task, or status could not be read: assume available. */
  | { kind: 'available' }
  /** A known reason the AI cannot answer now. */
  | { kind: 'blocked'; code: ComposerClientCode };

const BLOCKING: readonly ComposerClientCode[] = ['COMPOSER_DISABLED', 'SERVER_NOT_CONFIGURED', 'UNAUTHENTICATED',
  'FORBIDDEN', 'INVALID_ORIGIN', 'AGENT_DAILY_BUDGET_EXCEEDED'];
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
/** Free readiness check (no provider call, no budget). Tolerates the older deployed composer. */
export async function readComposerReadiness(client: NativeComposeFunctionsClient): Promise<ComposerReadiness> {
  let result: Awaited<ReturnType<NativeComposeFunctionsClient['functions']['invoke']>>;
  try { result = await client.functions.invoke('vnext-catalog-composer', { body: { version: 1, task: 'status' } }); }
  catch { return { kind: 'available' }; }
  const status = result.data && typeof result.data === 'object' ? (result.data as { status?: unknown }).status : undefined;
  if (!result.error && status && typeof status === 'object') {
    const value = status as Record<string, unknown>;
    return { kind: 'ready', serverKey: value.serverKey === true, byok: value.byok === true,
      remainingMicrousd: finite(value.remainingMicrousd), callReserveMicrousd: finite(value.callReserveMicrousd),
      ...(Array.isArray(value.tasks) ? { editing: value.tasks.includes('edit_intent') } : {}) };
  }
  if (!result.error) return { kind: 'available' };
  const failure = await composerFailure(result);
  return BLOCKING.includes(failure.code) ? { kind: 'blocked', code: failure.code } : { kind: 'available' };
}
