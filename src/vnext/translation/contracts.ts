import type { TextMark } from '../domain/editorial-model';

import { VNEXT_TRANSLATION_PROFILES, findRegisteredTranslationProfile, type RegisteredTranslationProfile, type VNextTranslationTargetLocale, type VNextTranslationProfileVersion } from './language-registry';

export const W5_TRANSLATION_CONTRACT_VERSION = 'w5a-v1' as const;
// W5 names remain Spanish defaults; obsolete profile v1 is never accepted silently.
export const W5_TRANSLATION_PROFILE_VERSION = VNEXT_TRANSLATION_PROFILES[0].profileVersion;
export const W5_TRANSLATION_TOKEN_POLICY_VERSION = VNEXT_TRANSLATION_PROFILES[0].tokenPolicyVersion;
export const W5_TRANSLATION_PROMPT_VERSION = VNEXT_TRANSLATION_PROFILES[0].promptVersion;
export const W5_TRANSLATION_PROVIDER_ID = 'gemini' as const;
export const W5_TRANSLATION_MODEL_ID = 'gemini-2.5-flash' as const;

export const W5_SUPPORTED_SOURCE_LOCALE = 'pt-BR' as const;
export const W5_SUPPORTED_TARGET_LOCALE = 'es-ES' as const;

export const W5_TRANSLATION_LIMITS = Object.freeze({
  maxUnits: 60,
  maxCharsPerRun: 4_000,
  maxTotalChars: 30_000,
});

export type TranslationLeafKind =
  | 'catalogTitle'
  | 'textObject'
  | 'tableCell'
  | 'tableTitle'
  | 'tableAnnotation'
  | 'tableLegend';

export type TranslationLocator =
  | { readonly kind: 'catalogTitle'; readonly catalogId: string }
  | { readonly kind: 'textObject'; readonly pageId: string; readonly objectId: string }
  | { readonly kind: 'tableCell'; readonly pageId: string; readonly objectId: string; readonly tableId: string; readonly cellId: string }
  | { readonly kind: 'tableTitle'; readonly pageId: string; readonly objectId: string; readonly tableId: string }
  | { readonly kind: 'tableAnnotation'; readonly pageId: string; readonly objectId: string; readonly tableId: string; readonly annotationId: string }
  | { readonly kind: 'tableLegend'; readonly pageId: string; readonly objectId: string; readonly tableId: string; readonly legendEntryId: string };

export interface SemanticTextRun {
  readonly paragraphId?: string;
  readonly runId: string;
  readonly text: string;
  readonly marks: readonly TextMark[];
}

export interface TranslationSemanticLeaf {
  readonly leafId: string;
  readonly kind: TranslationLeafKind;
  readonly locator: TranslationLocator;
  readonly sourceLocale: string;
  readonly sourceHash: string;
  readonly context: string;
  readonly runs: readonly SemanticTextRun[];
}

export type TranslationExclusionReason =
  | 'asset-alt'
  | 'group-container'
  | 'shape'
  | 'line'
  | 'image-object'
  | 'icon-object'
  | 'empty-cell'
  | 'technical-code'
  | 'measurement'
  | 'marker'
  | 'image-cell'
  | 'empty-rich-text';

export interface ExcludedTranslationSurface {
  readonly surfaceId: string;
  readonly reason: TranslationExclusionReason;
  readonly locator: Readonly<Record<string, string>>;
}

export interface TranslationCoverage {
  readonly sourceCatalogId: string;
  readonly sourceLocale: string;
  readonly eligible: readonly TranslationSemanticLeaf[];
  readonly excluded: readonly ExcludedTranslationSurface[];
  readonly complete: true;
}

export interface ProtectedTranslationRun {
  readonly runId: string;
  readonly protectedText: string;
}

export interface TranslationProviderUnit {
  readonly unitId: string;
  readonly sourceHash: string;
  readonly kind: TranslationLeafKind;
  readonly context: string;
  readonly runs: readonly ProtectedTranslationRun[];
}

export interface TranslationProviderRequest {
  readonly contractVersion: typeof W5_TRANSLATION_CONTRACT_VERSION;
  readonly profileVersion: VNextTranslationProfileVersion;
  readonly requestId: string;
  readonly sourceCatalogId: string;
  readonly sourceLocale: typeof W5_SUPPORTED_SOURCE_LOCALE;
  readonly targetLocale: VNextTranslationTargetLocale;
  readonly units: readonly TranslationProviderUnit[];
}

export interface TranslationProviderRunResult {
  readonly runId: string;
  readonly translatedText: string;
}

export interface TranslationProviderUnitResult {
  readonly unitId: string;
  readonly runs: readonly TranslationProviderRunResult[];
}

export interface TranslationProviderMetadata {
  readonly providerId: string;
  readonly modelId: string;
}

export interface TranslationProviderResponse {
  readonly contractVersion: typeof W5_TRANSLATION_CONTRACT_VERSION;
  readonly profileVersion: VNextTranslationProfileVersion;
  readonly requestId: string;
  readonly targetLocale: VNextTranslationTargetLocale;
  readonly units: readonly TranslationProviderUnitResult[];
  readonly provider: TranslationProviderMetadata;
}

export interface TranslationProvider {
  translate(request: TranslationProviderRequest, signal?: AbortSignal): Promise<unknown>;
}

export interface TranslationProfile {
  readonly profileVersion: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly tokenPolicyVersion: string;
  readonly contractVersion: string;
}

export const W5_TRANSLATION_PROFILE = VNEXT_TRANSLATION_PROFILES[0];

export const TRANSLATION_ERROR_CODES = [
  'UNSUPPORTED_LANGUAGE',
  'INVALID_REQUEST',
  'CREDENTIAL_UNAVAILABLE',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_RATE_LIMIT',
  'INVALID_PROVIDER_RESPONSE',
  'TECHNICAL_TOKEN_MISMATCH',
  'STALE_RESULT',
  'ABORTED',
  'PAYLOAD_TOO_LARGE',
  'UNCLASSIFIED_TEXT_SURFACE',
] as const;

export type TranslationErrorCode = (typeof TRANSLATION_ERROR_CODES)[number];

export class TranslationFoundationError extends Error {
  constructor(
    public readonly code: TranslationErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'TranslationFoundationError';
  }
}

export interface ValidatedTranslationRun {
  readonly runId: string;
  readonly translatedText: string;
}

export interface ValidatedTranslationUnit {
  readonly unitId: string;
  readonly sourceHash: string;
  readonly kind: TranslationLeafKind;
  readonly locator: TranslationLocator;
  readonly runs: readonly ValidatedTranslationRun[];
}

export interface TranslationFoundationResult {
  readonly sourceCatalogId: string;
  readonly sourceLocale: typeof W5_SUPPORTED_SOURCE_LOCALE;
  readonly targetLocale: VNextTranslationTargetLocale;
  readonly profileVersion: VNextTranslationProfileVersion;
  readonly units: readonly ValidatedTranslationUnit[];
  readonly provider: TranslationProviderMetadata;
  readonly coverage: TranslationCoverage;
  readonly cacheHits: number;
  readonly providerRequests: number;
}

export function requireSupportedLanguagePair(sourceLocale: string, targetLocale: string): asserts sourceLocale is typeof W5_SUPPORTED_SOURCE_LOCALE {
  resolveTranslationProfile(sourceLocale, targetLocale);
}

export function resolveTranslationProfile(sourceLocale: string, targetLocale: string, profileVersion?: string): RegisteredTranslationProfile {
  const profile = findRegisteredTranslationProfile(sourceLocale, targetLocale);
  if (!profile) throw new TranslationFoundationError('UNSUPPORTED_LANGUAGE', `Unsupported translation pair: ${sourceLocale} -> ${targetLocale}`);
  if (profileVersion !== undefined && profile.profileVersion !== profileVersion) {
    throw new TranslationFoundationError('INVALID_REQUEST', 'Translation profile does not match the requested language pair');
  }
  return profile;
}
