import type { NativeComposeGateway, NativeComposeRequest } from './native-compose';
import type { NativeTextEditGateway, NativeTextEditRequest } from './native-text-edit';

type ComposerBody = (NativeComposeRequest | NativeTextEditRequest) & {
  credential?: { provider: 'gemini'; apiKey: string };
};
export interface NativeComposeFunctionsClient {
  readonly functions: {
    invoke(name: string, options: { readonly body: ComposerBody }): Promise<{
      readonly data: unknown; readonly error: unknown;
    }>;
  };
}

/** Invoke only through authenticated, durable-quota Supabase function. */
export function nativeComposeGateway(
  client: NativeComposeFunctionsClient,
  credential?: string,
): NativeComposeGateway {
  if (credential !== undefined && (typeof credential !== 'string' ||
    credential.length < 12 || credential.length > 2048 ||
    credential.trim() !== credential)) {
    throw new Error('COMPOSER_CREDENTIAL_INVALID');
  }
  return async request => {
    const body: ComposerBody = {
      ...request,
      ...(credential ? { credential: { provider: 'gemini', apiKey: credential } } : {}),
    };
    const { data, error } = await client.functions.invoke('vnext-catalog-composer', { body });
    if (error || !data || typeof data !== 'object' || !('reply' in data)) {
      // Errors from providers/Edge can contain secrets. Never propagate them.
      throw new Error('NATIVE_COMPOSER_UNAVAILABLE');
    }
    return data.reply;
  };
}

/** Same bounded backend, different strict task contract. */
export function nativeTextEditGateway(
  client: NativeComposeFunctionsClient,
  credential: string,
): NativeTextEditGateway {
  if (credential.length < 12 || credential.length > 2048 ||
      credential.trim() !== credential) {
    throw new Error('TEXT_EDIT_CREDENTIAL_INVALID');
  }
  return async request => {
    const { data, error } = await client.functions.invoke('vnext-catalog-composer', {
      body: { ...request, credential: { provider: 'gemini', apiKey: credential } },
    });
    if (error || !data || typeof data !== 'object' || !('reply' in data)) {
      throw new Error('NATIVE_TEXT_EDIT_UNAVAILABLE');
    }
    return data.reply;
  };
}
