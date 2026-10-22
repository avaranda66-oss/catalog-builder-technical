/** Pure VNext metadata shared by the browser and server gateway. No Legacy authority. */
// Explicit .ts path: the Deno gateway bundles this file and its imports as they are.
import { GEMINI_RETIRED_TRANSLATION_MODELS, GEMINI_TRANSLATION_MODEL } from '../ai-catalog/gemini-models.ts';

/** Model of every translation profile, from the single Gemini model registry (no 2.5 family). */
export const VNEXT_TRANSLATION_MODEL_ID = GEMINI_TRANSLATION_MODEL;
export type VNextTranslationLocale = 'pt-BR' | 'es-ES' | 'en-US';
export type VNextTranslationTargetLocale = 'es-ES' | 'en-US';
export type VNextTranslationProfileVersion = 'w5-ptbr-eses-v2' | 'p2-ptbr-enus-v1';

export interface VNextTranslationLanguage {
  readonly locale: VNextTranslationLocale;
  readonly nativeName: string;
  readonly displayName: string;
  readonly englishName: string;
  readonly region: string;
  readonly script: 'Latn';
  readonly direction: 'ltr';
  readonly fontFamily: 'Noto Sans';
  readonly fontProfile: 'noto-sans-latin-v1';
  readonly role: 'source' | 'target';
  readonly availability: 'AVAILABLE';
}

const latin = { script: 'Latn', direction: 'ltr', fontFamily: 'Noto Sans', fontProfile: 'noto-sans-latin-v1', availability: 'AVAILABLE' } as const;
export const VNEXT_TRANSLATION_LANGUAGES: readonly VNextTranslationLanguage[] = Object.freeze([
  Object.freeze({ ...latin, locale: 'pt-BR', nativeName: 'Português', displayName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)', region: 'BR', role: 'source' }),
  Object.freeze({ ...latin, locale: 'es-ES', nativeName: 'Español', displayName: 'Espanhol (Espanha)', englishName: 'Spanish (Spain)', region: 'ES', role: 'target' }),
  Object.freeze({ ...latin, locale: 'en-US', nativeName: 'English', displayName: 'Inglês (Estados Unidos)', englishName: 'English (United States)', region: 'US', role: 'target' }),
]);

/** Planning metadata only: these locales have no active profile or selectable target. */
export const VNEXT_TRANSLATION_FUTURE_LANGUAGES = Object.freeze([
  { locale: 'en-GB', englishName: 'English (United Kingdom)', region: 'GB' },
  { locale: 'es-MX', englishName: 'Spanish (Mexico)', region: 'MX' },
  { locale: 'fr-FR', englishName: 'French (France)', region: 'FR' },
  { locale: 'de-DE', englishName: 'German (Germany)', region: 'DE' },
  { locale: 'it-IT', englishName: 'Italian (Italy)', region: 'IT' },
  { locale: 'pt-PT', englishName: 'Portuguese (Portugal)', region: 'PT' },
].map(language => Object.freeze({ ...language, script: 'Latn' as const, direction: 'ltr' as const,
  fontFamily: 'Noto Sans' as const, fontProfile: 'noto-sans-latin-v1' as const, availability: 'NOT_AVAILABLE' as const })));

export interface RegisteredTranslationProfile {
  readonly profileVersion: VNextTranslationProfileVersion;
  readonly sourceLocale: 'pt-BR';
  readonly targetLocale: VNextTranslationTargetLocale;
  readonly providerId: 'gemini';
  readonly modelId: typeof VNEXT_TRANSLATION_MODEL_ID;
  readonly promptVersion: 'w5-technical-es-v2' | 'p2-technical-en-v1';
  readonly tokenPolicyVersion: 'p2-tech-tokens-v2';
  readonly contractVersion: 'w5a-v1';
}

const sharedProfile = { sourceLocale: 'pt-BR', providerId: 'gemini', modelId: VNEXT_TRANSLATION_MODEL_ID,
  tokenPolicyVersion: 'p2-tech-tokens-v2', contractVersion: 'w5a-v1' } as const;
export const VNEXT_TRANSLATION_PROFILES = Object.freeze([
  Object.freeze({ ...sharedProfile, targetLocale: 'es-ES', profileVersion: 'w5-ptbr-eses-v2', promptVersion: 'w5-technical-es-v2' } as const),
  Object.freeze({ ...sharedProfile, targetLocale: 'en-US', profileVersion: 'p2-ptbr-enus-v1', promptVersion: 'p2-technical-en-v1' } as const),
] as const satisfies readonly RegisteredTranslationProfile[]);

export function getTranslationLanguage(locale: string): VNextTranslationLanguage | undefined {
  return VNEXT_TRANSLATION_LANGUAGES.find(language => language.locale === locale);
}

export function findRegisteredTranslationProfile(sourceLocale: string, targetLocale: string): RegisteredTranslationProfile | undefined {
  return VNEXT_TRANSLATION_PROFILES.find(profile => profile.sourceLocale === sourceLocale && profile.targetLocale === targetLocale);
}

/**
 * A gateway answer names the model that really translated. The current model
 * is always accepted; a retired one only so this client keeps working with the
 * gateway still deployed (and with results produced by it) until the gateway is
 * redeployed from the merged SHA. Profile versions are unchanged, so old and new
 * clients and gateways keep talking to each other.
 */
export function isAcceptedTranslationModelId(profile: Pick<RegisteredTranslationProfile, 'modelId'>, modelId: string): boolean {
  return modelId === profile.modelId || GEMINI_RETIRED_TRANSLATION_MODELS.includes(modelId);
}
