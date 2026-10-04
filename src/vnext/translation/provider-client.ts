import {
  TranslationFoundationError,
  resolveTranslationProfile,
  type TranslationProvider,
  type TranslationProviderRequest,
  type TranslationProviderResponse,
} from './contracts';

export interface GatewayInvocationResult {
  readonly data: unknown;
  readonly error: { readonly message?: string | null } | null;
}

interface FunctionsClientErrorLike {
  readonly message?: string | null;
  readonly context?: unknown;
}

interface FunctionsClientInvokeResult {
  readonly data: unknown;
  readonly error: FunctionsClientErrorLike | null;
  readonly response?: unknown;
}

export type VNextTranslationGatewayInvoke = (
  request: TranslationProviderRequest
) => Promise<GatewayInvocationResult>;

function externalErrorCode(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const value = (data as Record<string, unknown>).error;
  return typeof value === 'string' ? value : undefined;
}

async function sanitizedGatewayErrorData(...candidates: readonly unknown[]): Promise<unknown> {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const json = (candidate as { clone?: () => unknown; json?: () => Promise<unknown> }).clone?.();
    const responseLike = json && typeof json === 'object' ? json : candidate;
    const readJson = (responseLike as { json?: () => Promise<unknown> }).json;
    if (typeof readJson !== 'function') continue;
    try {
      const parsed = await readJson.call(responseLike);
      const code = externalErrorCode(parsed);
      if (code) return { error: code };
    } catch {
      // FunctionsHttpError bodies are optional; fall through to sanitized generic mapping.
    }
  }
  return null;
}

function mapGatewayFailure(data: unknown, message = ''): TranslationFoundationError {
  const code = externalErrorCode(data);
  if (code === 'CREDENTIAL_UNAVAILABLE') {
    return new TranslationFoundationError('CREDENTIAL_UNAVAILABLE', 'Translation provider credential is unavailable on the server');
  }
  if (code === 'PROVIDER_RATE_LIMIT') {
    return new TranslationFoundationError('PROVIDER_RATE_LIMIT', 'Translation provider rate limit reached');
  }
  if (code === 'PAYLOAD_TOO_LARGE') {
    return new TranslationFoundationError('PAYLOAD_TOO_LARGE', 'Translation request exceeded server limits');
  }
  if (code === 'INVALID_REQUEST' || code === 'UNSUPPORTED_LANGUAGE') {
    return new TranslationFoundationError(code, 'Translation gateway rejected the request');
  }
  if (code === 'INVALID_PROVIDER_RESPONSE') {
    return new TranslationFoundationError('INVALID_PROVIDER_RESPONSE', 'Translation provider returned an invalid response');
  }
  if (code === 'FORBIDDEN' || /unauthor|forbidden|permission/i.test(message)) {
    return new TranslationFoundationError('INVALID_REQUEST', 'Translation gateway authorization failed');
  }
  return new TranslationFoundationError('PROVIDER_UNAVAILABLE', 'Translation gateway is unavailable');
}

export interface VNextTranslationFunctionsClient {
  readonly functions: {
    invoke(
      functionName: string,
      options: { readonly body: TranslationProviderRequest }
    ): Promise<FunctionsClientInvokeResult>;
  };
}

export function vnextTranslationGatewayInvokeFromFunctionsClient(
  client: VNextTranslationFunctionsClient
): VNextTranslationGatewayInvoke {
  return async (request) => {
    const response = await client.functions.invoke('vnext-translation-provider', { body: request });
    const sanitizedError = response.error
      ? await sanitizedGatewayErrorData(response.error.context, response.response)
      : null;
    return {
      data: sanitizedError ?? response.data,
      error: response.error ? { message: response.error.message } : null,
    };
  };
}

export class VNextTranslationGatewayClient implements TranslationProvider {
  constructor(private readonly invoke: VNextTranslationGatewayInvoke) {}

  async translate(request: TranslationProviderRequest, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new TranslationFoundationError('ABORTED', 'Translation request was cancelled');
    const profile = resolveTranslationProfile(request.sourceLocale, request.targetLocale, request.profileVersion);
    if (request.contractVersion !== profile.contractVersion) throw new TranslationFoundationError('INVALID_REQUEST', 'Unsupported translation contract');
    let response: GatewayInvocationResult;
    try {
      response = await this.invoke(request);
    } catch {
      throw new TranslationFoundationError('PROVIDER_UNAVAILABLE', 'Translation gateway transport failed');
    }
    if (signal?.aborted) throw new TranslationFoundationError('ABORTED', 'Translation request was cancelled');
    if (response.error) throw mapGatewayFailure(response.data, response.error.message ?? '');
    return response.data;
  }
}

export type ControlledTranslationHandler = (
  request: TranslationProviderRequest,
  invocation: number
) => unknown | Promise<unknown>;

function defaultControlledResponse(request: TranslationProviderRequest): TranslationProviderResponse {
  const profile = resolveTranslationProfile(request.sourceLocale, request.targetLocale, request.profileVersion);
  return {
    contractVersion: profile.contractVersion,
    profileVersion: profile.profileVersion,
    requestId: request.requestId,
    targetLocale: request.targetLocale,
    units: request.units.map((unit) => ({
      unitId: unit.unitId,
      runs: unit.runs.map((run) => ({
        runId: run.runId,
        translatedText: `${profile.targetLocale === 'es-ES' ? 'ES' : 'EN'}: ${run.protectedText}`,
      })),
    })),
    provider: {
      providerId: profile.providerId,
      modelId: profile.modelId,
    },
  };
}

export class ControlledTranslationProvider implements TranslationProvider {
  readonly requests: TranslationProviderRequest[] = [];
  private invocations = 0;

  constructor(private readonly handler: ControlledTranslationHandler = defaultControlledResponse) {}

  async translate(request: TranslationProviderRequest, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new TranslationFoundationError('ABORTED', 'Translation request was cancelled');
    this.invocations += 1;
    this.requests.push(JSON.parse(JSON.stringify(request)) as TranslationProviderRequest);
    const result = await this.handler(request, this.invocations);
    if (signal?.aborted) throw new TranslationFoundationError('ABORTED', 'Translation request was cancelled');
    return result;
  }
}
