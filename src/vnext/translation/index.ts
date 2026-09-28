export {
  TRANSLATION_ERROR_CODES,
  TranslationFoundationError,
  W5_SUPPORTED_SOURCE_LOCALE,
  W5_SUPPORTED_TARGET_LOCALE,
  W5_TRANSLATION_CONTRACT_VERSION,
  W5_TRANSLATION_LIMITS,
  W5_TRANSLATION_MODEL_ID,
  W5_TRANSLATION_PROFILE,
  W5_TRANSLATION_PROFILE_VERSION,
  W5_TRANSLATION_PROMPT_VERSION,
  W5_TRANSLATION_PROVIDER_ID,
  W5_TRANSLATION_TOKEN_POLICY_VERSION,
  requireSupportedLanguagePair,
} from './contracts';
export type {
  ExcludedTranslationSurface,
  ProtectedTranslationRun,
  SemanticTextRun,
  TranslationCoverage,
  TranslationErrorCode,
  TranslationFoundationResult,
  TranslationLeafKind,
  TranslationLocator,
  TranslationProfile,
  TranslationProvider,
  TranslationProviderMetadata,
  TranslationProviderRequest,
  TranslationProviderResponse,
  TranslationProviderRunResult,
  TranslationProviderUnit,
  TranslationProviderUnitResult,
  TranslationSemanticLeaf,
  ValidatedTranslationRun,
  ValidatedTranslationUnit,
} from './contracts';
export {
  extractSemanticTranslationCoverage,
  sha256Hex,
  stableSerialize,
} from './semantic-leaves';
export {
  assertProtectedTokenIntegrity,
  protectTechnicalTokens,
  restoreTechnicalTokens,
  technicalProtectionNamespace,
  technicalTokenFingerprintMaterial,
} from './technical-token-protector';
export type { ProtectedTechnicalToken, ProtectedText } from './technical-token-protector';
export {
  MemoryTranslationRequestCache,
  buildTranslationRequestCacheKey,
} from './request-cache';
export type { TranslationRequestCache } from './request-cache';
export {
  translationRunKey,
  validateProviderResponse,
} from './response-validation';
export type { TranslationResponseValidationContext } from './response-validation';
export {
  ControlledTranslationProvider,
  VNextTranslationGatewayClient,
  vnextTranslationGatewayInvokeFromFunctionsClient,
} from './provider-client';
export type {
  ControlledTranslationHandler,
  GatewayInvocationResult,
  VNextTranslationFunctionsClient,
  VNextTranslationGatewayInvoke,
} from './provider-client';
export {
  TranslationFoundationService,
} from './service';
export type { TranslationFoundationServiceOptions } from './service';
