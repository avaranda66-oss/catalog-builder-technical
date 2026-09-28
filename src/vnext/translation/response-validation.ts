import { z } from 'zod';
import {
  TranslationFoundationError,
  W5_SUPPORTED_TARGET_LOCALE,
  W5_TRANSLATION_CONTRACT_VERSION,
  W5_TRANSLATION_MODEL_ID,
  W5_TRANSLATION_PROFILE_VERSION,
  W5_TRANSLATION_PROVIDER_ID,
  type TranslationProviderRequest,
  type TranslationProviderResponse,
} from './contracts';
import {
  assertProtectedTokenIntegrity,
  type ProtectedText,
} from './technical-token-protector';

const ProviderRunSchema = z.object({
  runId: z.string().min(1),
  translatedText: z.string().min(1),
}).strict();

const ProviderUnitSchema = z.object({
  unitId: z.string().min(1),
  runs: z.array(ProviderRunSchema),
}).strict();

const ProviderResponseSchema = z.object({
  contractVersion: z.literal(W5_TRANSLATION_CONTRACT_VERSION),
  profileVersion: z.literal(W5_TRANSLATION_PROFILE_VERSION),
  requestId: z.string().min(1),
  targetLocale: z.literal(W5_SUPPORTED_TARGET_LOCALE),
  units: z.array(ProviderUnitSchema),
  provider: z.object({
    providerId: z.string().min(1),
    modelId: z.string().min(1),
  }).strict(),
}).strict();

function invalid(message: string): never {
  throw new TranslationFoundationError('INVALID_PROVIDER_RESPONSE', message);
}

function assertExactSet(label: string, expected: readonly string[], actual: readonly string[]): void {
  if (new Set(actual).size !== actual.length) invalid(`Duplicate ${label}`);
  if (expected.length !== actual.length) invalid(`${label} count mismatch`);
  const expectedSet = new Set(expected);
  if (actual.some((value) => !expectedSet.has(value))) invalid(`Unknown ${label}`);
}

function runKey(unitId: string, runId: string): string {
  return `${unitId}::${runId}`;
}

export interface TranslationResponseValidationContext {
  readonly currentSourceHashes: ReadonlyMap<string, string>;
  readonly protectedRuns: ReadonlyMap<string, ProtectedText>;
}

export function validateProviderResponse(
  request: TranslationProviderRequest,
  rawResponse: unknown,
  context: TranslationResponseValidationContext
): TranslationProviderResponse {
  const parsed = ProviderResponseSchema.safeParse(rawResponse);
  if (!parsed.success) {
    invalid(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }

  const response = parsed.data;
  if (response.requestId !== request.requestId) invalid('requestId mismatch');
  if (response.targetLocale !== request.targetLocale) invalid('targetLocale mismatch');
  if (response.contractVersion !== request.contractVersion) invalid('contractVersion mismatch');
  if (response.profileVersion !== request.profileVersion) invalid('profileVersion mismatch');
  if (
    response.provider.providerId !== W5_TRANSLATION_PROVIDER_ID ||
    response.provider.modelId !== W5_TRANSLATION_MODEL_ID
  ) {
    invalid('provider profile metadata mismatch');
  }

  assertExactSet('unit IDs', request.units.map((unit) => unit.unitId), response.units.map((unit) => unit.unitId));

  const responseUnits = new Map(response.units.map((unit) => [unit.unitId, unit] as const));
  for (const requestedUnit of request.units) {
    const currentHash = context.currentSourceHashes.get(requestedUnit.unitId);
    if (currentHash !== requestedUnit.sourceHash) {
      throw new TranslationFoundationError('STALE_RESULT', `Source changed for ${requestedUnit.unitId}`);
    }

    const returnedUnit = responseUnits.get(requestedUnit.unitId);
    if (!returnedUnit) invalid(`Missing unit ${requestedUnit.unitId}`);
    assertExactSet(
      `run IDs for ${requestedUnit.unitId}`,
      requestedUnit.runs.map((run) => run.runId),
      returnedUnit.runs.map((run) => run.runId)
    );

    const returnedRuns = new Map(returnedUnit.runs.map((run) => [run.runId, run] as const));
    for (const requestedRun of requestedUnit.runs) {
      const returnedRun = returnedRuns.get(requestedRun.runId);
      if (!returnedRun) invalid(`Missing run ${requestedRun.runId}`);
      if (returnedRun.translatedText.trim().length === 0) invalid(`Empty translation for ${requestedRun.runId}`);
      if (/<\/?[A-Za-z][^>]*>/.test(returnedRun.translatedText)) {
        invalid(`Markup is not allowed in translated run ${requestedRun.runId}`);
      }
      const protection = context.protectedRuns.get(runKey(requestedUnit.unitId, requestedRun.runId));
      if (!protection) invalid(`Missing protection context for ${requestedRun.runId}`);
      assertProtectedTokenIntegrity(returnedRun.translatedText, protection);
    }
  }

  return response;
}

export function translationRunKey(unitId: string, runId: string): string {
  return runKey(unitId, runId);
}

