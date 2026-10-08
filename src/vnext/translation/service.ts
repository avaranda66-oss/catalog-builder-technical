import type { CatalogDocument } from '../domain';
import {
  TranslationFoundationError,
  W5_SUPPORTED_TARGET_LOCALE,
  W5_TRANSLATION_CONTRACT_VERSION,
  W5_TRANSLATION_LIMITS,
  resolveTranslationProfile,
  type TranslationFoundationResult,
  type TranslationProvider,
  type TranslationProviderMetadata,
  type TranslationProviderRequest,
  type TranslationProviderResponse,
  type TranslationProviderUnit,
  type TranslationSemanticLeaf,
  type ValidatedTranslationUnit,
} from './contracts';
import { extractSemanticTranslationCoverage, stableSerialize } from './semantic-leaves';
import { restoreTechnicalTokens, type ProtectedText } from './technical-token-protector';
import { prepareTranslationLeaf, type PreparedTranslationUnit } from './request-preparation';
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

export interface TranslationBatchProgress {
  readonly totalBatches: number;
  readonly completedBatches: number;
  readonly cacheHits: number;
  readonly providerRequests: number;
  readonly eligibleUnits: number;
  readonly excludedSurfaces: number;
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

function unitChars(unit: TranslationProviderUnit): number {
  return unit.runs.reduce((sum, run) => sum + run.protectedText.length, 0);
}

function batchPreparedUnits(prepared: readonly PreparedTranslationUnit[]): PreparedTranslationUnit[][] {
  const batches: PreparedTranslationUnit[][] = [];
  let current: PreparedTranslationUnit[] = [];
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

function mergeProtections(items: readonly PreparedTranslationUnit[]): Map<string, ProtectedText> {
  const merged = new Map<string, ProtectedText>();
  items.forEach((item) => item.protections.forEach((value, key) => merged.set(key, value)));
  return merged;
}

function currentHashes(leaves: readonly TranslationSemanticLeaf[]): Map<string, string> {
  return new Map(leaves.map((leaf) => [leaf.leafId, leaf.sourceHash] as const));
}

function requireFullCoverageFresh(
  source: CatalogDocument,
  initialSource: string,
  initialManifest: ReadonlyMap<string, string>
): ReadonlyMap<string, string> {
  // Exact source identity also covers new/removed leaves, marks and excluded content. Rehashing
  // every leaf at each batch boundary needlessly repeats thousands of Web Crypto operations.
  if (stableSerialize(source) !== initialSource) {
    throw new TranslationFoundationError('STALE_RESULT', 'Translation source changed during the job');
  }
  return initialManifest;
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
    signal?: AbortSignal,
    onProgress?: (progress: TranslationBatchProgress) => void
  ): Promise<TranslationFoundationResult> {
    const profile = resolveTranslationProfile(source.locale, targetLocale);
    abortIfNeeded(signal);

    const initialSource = stableSerialize(source);
    const coverage = await extractSemanticTranslationCoverage(source);
    const initialManifest = currentHashes(coverage.eligible);
    const prepared = (await Promise.all(coverage.eligible.map(prepareTranslationLeaf))).flat();
    requireFullCoverageFresh(source, initialSource, initialManifest);
    const batches = batchPreparedUnits(prepared);
    const leavesById = new Map(coverage.eligible.map((leaf) => [leaf.leafId, leaf] as const));
    const translatedParts = new Map<string, { partIndex: number; text: string }[]>();
    let cacheHits = 0;
    let providerRequests = 0;
    let providerMetadata: TranslationProviderMetadata | undefined;
    let completedBatches = 0;
    const reportProgress = () => onProgress?.({ totalBatches: batches.length, completedBatches, cacheHits,
      providerRequests, eligibleUnits: coverage.eligible.length, excludedSurfaces: coverage.excluded.length });
    reportProgress();

    for (const batch of batches) {
      abortIfNeeded(signal);
      const request: TranslationProviderRequest = {
        contractVersion: W5_TRANSLATION_CONTRACT_VERSION,
        profileVersion: profile.profileVersion,
        requestId: this.requestId(),
        sourceCatalogId: source.id,
        sourceLocale: profile.sourceLocale,
        targetLocale: profile.targetLocale,
        units: batch.map((item) => item.unit),
      };
      const cacheKey = await buildTranslationRequestCacheKey(request, profile);
      const cached = await this.cache.get(cacheKey);
      let freshHashes = requireFullCoverageFresh(source, initialSource, initialManifest);
      let rawResponse: unknown;
      if (cached) {
        cacheHits += 1;
        rawResponse = rebaseCachedResponse(cached, request);
      } else {
        providerRequests += 1;
        rawResponse = await this.invokeWithRetry(request, signal);
        freshHashes = requireFullCoverageFresh(source, initialSource, initialManifest);
      }
      abortIfNeeded(signal);

      const protections = mergeProtections(batch);
      const validated = validateProviderResponse(request, rawResponse, {
        currentSourceHashes: new Map(batch.map(item => [item.unit.unitId, freshHashes.get(item.sourceLeafId)!])),
        protectedRuns: protections,
      });
      abortIfNeeded(signal);

      if (!cached) {
        await this.cache.set(cacheKey, validated);
        requireFullCoverageFresh(source, initialSource, initialManifest);
      }
      providerMetadata ??= validated.provider;
      if (
        providerMetadata.providerId !== validated.provider.providerId ||
        providerMetadata.modelId !== validated.provider.modelId
      ) {
        throw new TranslationFoundationError('INVALID_PROVIDER_RESPONSE', 'Provider metadata changed across one translation job');
      }

      const responseUnits = new Map(validated.units.map((unit) => [unit.unitId, unit] as const));
      for (const item of batch) {
        const requested = item.unit;
        const sourceLeaf = leavesById.get(item.sourceLeafId);
        const responseUnit = responseUnits.get(requested.unitId);
        if (!sourceLeaf || !responseUnit) {
          throw new TranslationFoundationError('INVALID_PROVIDER_RESPONSE', `Missing validated unit ${requested.unitId}`);
        }
        const responseRuns = new Map(responseUnit.runs.map(run => [run.runId, run]));
        for (const part of item.parts) {
          const run = responseRuns.get(part.runId)!;
          const protection = protections.get(translationRunKey(requested.unitId, run.runId));
          if (!protection) {
            throw new TranslationFoundationError('INVALID_PROVIDER_RESPONSE', `Missing protection context for ${run.runId}`);
          }
          const key = translationRunKey(sourceLeaf.leafId, part.sourceRunId);
          const parts = translatedParts.get(key) ?? [];
          const text = restoreTechnicalTokens(part.fragmented ? run.translatedText.trim() : run.translatedText, protection);
          parts.push({ partIndex: part.partIndex, text: part.prefixBefore + text + part.separatorAfter });
          translatedParts.set(key, parts);
        }
      }
      completedBatches += 1;
      reportProgress();
    }

    if (!providerMetadata) {
      throw new TranslationFoundationError('INVALID_REQUEST', 'No translatable semantic units were produced');
    }

    requireFullCoverageFresh(source, initialSource, initialManifest);
    abortIfNeeded(signal);

    const translatedUnits: ValidatedTranslationUnit[] = coverage.eligible.map(leaf => ({
      unitId: leaf.leafId, sourceHash: leaf.sourceHash, kind: leaf.kind, locator: leaf.locator,
      runs: leaf.runs.map(run => {
        const parts = translatedParts.get(translationRunKey(leaf.leafId, run.runId));
        if (!parts?.length) throw new TranslationFoundationError('INVALID_PROVIDER_RESPONSE', 'Missing assembled translation run');
        return { runId: run.runId, translatedText: parts.sort((left, right) => left.partIndex - right.partIndex).map(part => part.text).join('') };
      }),
    }));

    return {
      sourceCatalogId: source.id,
      sourceLocale: profile.sourceLocale,
      targetLocale: profile.targetLocale,
      profileVersion: profile.profileVersion,
      units: translatedUnits,
      provider: providerMetadata,
      coverage,
      cacheHits,
      providerRequests,
    };
  }
}

export function createTranslationCenterFoundation(
  provider: TranslationProvider,
  options: Omit<TranslationFoundationServiceOptions, 'maxAttempts'> = {}
): TranslationFoundationService {
  // A failed batch requires an explicit new user action, never a hidden billed retry.
  return new TranslationFoundationService(provider, { ...options, maxAttempts: 1 });
}
