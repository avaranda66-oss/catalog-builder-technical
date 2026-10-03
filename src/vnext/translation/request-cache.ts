import {
  resolveTranslationProfile,
  type TranslationProfile,
  type TranslationProviderRequest,
  type TranslationProviderResponse,
} from './contracts';
import { sha256Hex, stableSerialize } from './semantic-leaves';

export interface TranslationRequestCache {
  get(key: string): Promise<TranslationProviderResponse | undefined>;
  set(key: string, response: TranslationProviderResponse): Promise<void>;
}

function cloneResponse(response: TranslationProviderResponse): TranslationProviderResponse {
  return JSON.parse(JSON.stringify(response)) as TranslationProviderResponse;
}

export class MemoryTranslationRequestCache implements TranslationRequestCache {
  private readonly values = new Map<string, TranslationProviderResponse>();

  async get(key: string): Promise<TranslationProviderResponse | undefined> {
    const value = this.values.get(key);
    return value ? cloneResponse(value) : undefined;
  }

  async set(key: string, response: TranslationProviderResponse): Promise<void> {
    this.values.set(key, cloneResponse(response));
  }

  get size(): number {
    return this.values.size;
  }
}

export async function buildTranslationRequestCacheKey(
  request: TranslationProviderRequest,
  profile: TranslationProfile = resolveTranslationProfile(request.sourceLocale, request.targetLocale, request.profileVersion)
): Promise<string> {
  return sha256Hex(stableSerialize({
    contractVersion: request.contractVersion,
    profileVersion: request.profileVersion,
    sourceCatalogId: request.sourceCatalogId,
    sourceLocale: request.sourceLocale,
    targetLocale: request.targetLocale,
    units: request.units,
    providerProfile: {
      sourceLocale: profile.sourceLocale,
      targetLocale: profile.targetLocale,
      providerId: profile.providerId,
      modelId: profile.modelId,
      promptVersion: profile.promptVersion,
      tokenPolicyVersion: profile.tokenPolicyVersion,
      contractVersion: profile.contractVersion,
      profileVersion: profile.profileVersion,
    },
  }));
}
