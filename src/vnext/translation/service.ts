import type { CatalogDocument } from '../domain';
import {
  TranslationFoundationError,
  W5_SUPPORTED_TARGET_LOCALE,
  W5_TRANSLATION_CONTRACT_VERSION,
  W5_TRANSLATION_LIMITS,
  W5_TRANSLATION_PROFILE,
  W5_TRANSLATION_PROFILE_VERSION,
  requireSupportedLanguagePair,
  type TranslationFoundationResult,
  type TranslationProvider,
  type TranslationProviderMetadata,
  type TranslationProviderRequest,
  type TranslationProviderResponse,
  type TranslationProviderUnit,
  type TranslationSemanticLeaf,
  type ValidatedTranslationUnit,
} from './contracts';
import { extractSemanticTranslationCoverage } from './semantic-leaves';
import {
  protectTechnicalTokens,
  restoreTechnicalTokens,
  type ProtectedText,
} from './technical-token-protector';
import {
  buildTranslationRequestCacheKey,
  MemoryTranslationRequestCache,
  type TranslationRequestCache,
} from './request-cache';
import { translationRunKey, validateProviderResponse } from './response-validation';

export interface TranslationFoundationServiceOptions {
  readonly cache?: TranslationRequestCache;
  readonly requestId?: () => string;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly maxAttempts?: number;
}

interface PreparedUnit {
  readonly unit: TranslationProviderUnit;
  readonly protections: ReadonlyMap<string, ProtectedText>;
}

function defaultRequestId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new TranslationFoundationError('INVALID_REQUEST', 'Secure request identity is unavailable');
  }
  return globalThis.crypto.randomUUID();
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new TranslationFoundationError('ABORTED', 'Translation request was cancelled');
}

function prepareLeaf(leaf: TranslationSemanticLeaf): PreparedUnit {
  const protections = new Map<string, ProtectedText>();
  const runs = leaf.runs.map((run) => {
    const protectedValue = protectTechnicalTokens(run.text);
    if (protectedValue.protectedText.length > W5_TRANSLATION_LIMITS.maxCharsPerRun) {
      throw new TranslationFoundationError('PAYLOAD_TOO_LARGE', `Run ${run.runId} exceeds the W5.A per-run limit`);
    }
    protections.set(translationRunKey(leaf.leafId, run.runId), protectedValue);
    return { runId: run.runId, protectedText: protectedValue.protectedText };
  });
  return {
    unit: {
      unitId: leaf.leafId,
      sourceHash: leaf.sourceHash,
      kind: leaf.kind,
      context: leaf.context,
      runs,
    },
    protections,
  };
}

function unitChars(unit: TranslationProviderUnit): number {
  return unit.runs.reduce((sum, run) => sum + run.protectedText.length, 0);
}

function batchPreparedUnits(prepared: readonly PreparedUnit[]): PreparedUnit[][] {
  const batches: PreparedUnit[][] = [];
  let current: PreparedUnit[] = [];
  let chars = 0;
  for (const item of prepared) {
    const nextChars = unitChars(item.unit);
    if (nextChars > W5_TRANSLATION_LIMITS.maxTotalChars) {
      throw new TranslationFoundationError('PAYLOAD_TOO_LARGE', `Unit ${item.unit.unitId} exceeds the W5.A request limit`);
    }
    if (
      current.length > 0 &&
      (current.length >= W5_TRANSLATION_LIMITS.maxUnits || chars + nextChars > W5_TRANSLATION_LIMITS.maxTotalChars)
    ) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += nextChars;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function mergeProtections(items: readonly PreparedUnit[]): Map<string, ProtectedText> {
  const merged = new Map<string, ProtectedText>();
  items.forEach((item) => item.protections.forEach((value, key) => merged.set(key, value)));
  return merged;
}

function currentHashes(leaves: readonly TranslationSemanticLeaf[]): Map<string, string> {
  return new Map(leaves.map((leaf) => [leaf.leafId, leaf.sourceHash] as const));
}

function rebaseCachedResponse(
  response: TranslationProviderResponse,
  request: TranslationProviderRequest
): TranslationProviderResponse {
  return { ...response, requestId: request.requestId };
}

function isRetryable(error: unknown): boolean {
  return error instanceof TranslationFoundationError &&
    (error.code === 'PROVIDER_UNAVAILABLE' || error.code === 'PROVIDER_RATE_LIMIT');
}

export class TranslationFoundationService {
  private readonly cache: TranslationRequestCache;
  private readonly requestId: () => string;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly maxAttempts: number;

  constructor(
    private readonly provider: TranslationProvider,
    options: TranslationFoundationServiceOptions = {}
  ) {
    this.cache = options.cache ?? new MemoryTranslationRequestCache();
    this.requestId = options.requestId ?? defaultRequestId;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  private async invokeWithRetry(
    request: TranslationProviderRequest,
    signal?: AbortSignal
  ): Promise<unknown> {
    let attempt = 0;
    for (;;) {
      abortIfNeeded(signal);
      attempt += 1;
      try {
        return await this.provider.translate(request, signal);
      } catch (error) {
        abortIfNeeded(signal);
        if (!isRetryable(error) || attempt >= this.maxAttempts) throw error;
        await this.sleep(250 * 2 ** (attempt - 1));
      }
    }
  }

  async translateCatalog(
    source: CatalogDocument,
    targetLocale: string = W5_SUPPORTED_TARGET_LOCALE,
    signal?: AbortSignal
  ): Promise<TranslationFoundationResult> {
    requireSupportedLanguagePair(source.locale, targetLocale);
    abortIfNeeded(signal);

    const coverage = await extractSemanticTranslationCoverage(source);
    const prepared = coverage.eligible.map(prepareLeaf);
    const batches = batchPreparedUnits(prepared);
    const leavesById = new Map(coverage.eligible.map((leaf) => [leaf.leafId, leaf] as const));
    const translatedUnits: ValidatedTranslationUnit[] = [];
    let cacheHits = 0;
    let providerRequests = 0;
    let providerMetadata: TranslationProviderMetadata | undefined;

    for (const batch of batches) {
      abortIfNeeded(signal);
      const request: TranslationProviderRequest = {
        contractVersion: W5_TRANSLATION_CONTRACT_VERSION,
        profileVersion: W5_TRANSLATION_PROFILE_VERSION,
        requestId: this.requestId(),
        sourceCatalogId: source.id,
        sourceLocale: source.locale,
        targetLocale: W5_SUPPORTED_TARGET_LOCALE,
        units: batch.map((item) => item.unit),
      };
      const cacheKey = await buildTranslationRequestCacheKey(request, W5_TRANSLATION_PROFILE);
      const cached = await this.cache.get(cacheKey);
      let rawResponse: unknown;
      if (cached) {
        cacheHits += 1;
        rawResponse = rebaseCachedResponse(cached, request);
      } else {
        providerRequests += 1;
        rawResponse = await this.invokeWithRetry(request, signal);
      }
      abortIfNeeded(signal);

      const freshCoverage = await extractSemanticTranslationCoverage(source);
      const freshHashes = currentHashes(freshCoverage.eligible);
      const protections = mergeProtections(batch);
      const validated = validateProviderResponse(request, rawResponse, {
        currentSourceHashes: freshHashes,
        protectedRuns: protections,
      });
      abortIfNeeded(signal);

      if (!cached) await this.cache.set(cacheKey, validated);
      providerMetadata ??= validated.provider;
      if (
        providerMetadata.providerId !== validated.provider.providerId ||
        providerMetadata.modelId !== validated.provider.modelId
      ) {
        throw new TranslationFoundationError('INVALID_PROVIDER_RESPONSE', 'Provider metadata changed across one translation job');
      }

      const responseUnits = new Map(validated.units.map((unit) => [unit.unitId, unit] as const));
      for (const requested of request.units) {
        const sourceLeaf = leavesById.get(requested.unitId);
        const responseUnit = responseUnits.get(requested.unitId);
        if (!sourceLeaf || !responseUnit) {
          throw new TranslationFoundationError('INVALID_PROVIDER_RESPONSE', `Missing validated unit ${requested.unitId}`);
        }
        translatedUnits.push({
          unitId: requested.unitId,
          sourceHash: sourceLeaf.sourceHash,
          kind: sourceLeaf.kind,
          locator: sourceLeaf.locator,
          runs: responseUnit.runs.map((run) => {
            const protection = protections.get(translationRunKey(requested.unitId, run.runId));
            if (!protection) {
              throw new TranslationFoundationError('INVALID_PROVIDER_RESPONSE', `Missing protection context for ${run.runId}`);
            }
            return {
              runId: run.runId,
              translatedText: restoreTechnicalTokens(run.translatedText, protection),
            };
          }),
        });
      }
    }

    if (!providerMetadata) {
      throw new TranslationFoundationError('INVALID_REQUEST', 'No translatable semantic units were produced');
    }

    return {
      sourceCatalogId: source.id,
      sourceLocale: source.locale,
      targetLocale: W5_SUPPORTED_TARGET_LOCALE,
      profileVersion: W5_TRANSLATION_PROFILE_VERSION,
      units: translatedUnits,
      provider: providerMetadata,
      coverage,
      cacheHits,
      providerRequests,
    };
  }
}
