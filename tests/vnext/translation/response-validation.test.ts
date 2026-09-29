import { describe, expect, it } from 'vitest';
import {
  TranslationFoundationError,
  W5_TRANSLATION_CONTRACT_VERSION,
  W5_TRANSLATION_MODEL_ID,
  W5_TRANSLATION_PROFILE_VERSION,
  W5_TRANSLATION_PROVIDER_ID,
  protectTechnicalTokens,
  technicalProtectionNamespace,
  translationRunKey,
  validateProviderResponse,
  type TranslationErrorCode,
  type TranslationProviderRequest,
  type TranslationProviderResponse,
} from '@/vnext/translation';

function fixture() {
  const protection = protectTechnicalTokens('Faixa TA-25N de 0 a 70 bar');
  const request: TranslationProviderRequest = {
    contractVersion: W5_TRANSLATION_CONTRACT_VERSION,
    profileVersion: W5_TRANSLATION_PROFILE_VERSION,
    requestId: 'req-1',
    sourceCatalogId: 'catalog-1',
    sourceLocale: 'pt-BR',
    targetLocale: 'es-ES',
    units: [{
      unitId: 'unit-1',
      sourceHash: 'hash-1',
      kind: 'textObject',
      context: 'Text object',
      runs: [{ runId: 'run-1', protectedText: protection.protectedText }],
    }],
  };
  const response: TranslationProviderResponse = {
    contractVersion: W5_TRANSLATION_CONTRACT_VERSION,
    profileVersion: W5_TRANSLATION_PROFILE_VERSION,
    requestId: request.requestId,
    targetLocale: request.targetLocale,
    units: [{
      unitId: 'unit-1',
      runs: [{ runId: 'run-1', translatedText: `ES: ${protection.protectedText}` }],
    }],
    provider: { providerId: W5_TRANSLATION_PROVIDER_ID, modelId: W5_TRANSLATION_MODEL_ID },
  };
  const context = {
    currentSourceHashes: new Map([['unit-1', 'hash-1']]),
    protectedRuns: new Map([[translationRunKey('unit-1', 'run-1'), protection]]),
  };
  return { request, response, context, protection };
}

function invalidCode(
  action: () => unknown,
  code: TranslationErrorCode = 'INVALID_PROVIDER_RESPONSE'
): void {
  expect(action).toThrow(expect.objectContaining<Partial<TranslationFoundationError>>({ code }));
}

describe('W5.A strict provider response validation', () => {
  it('accepts only the exact requested identity, unit set, run set, profile, and protected placeholders', () => {
    const { request, response, context } = fixture();
    expect(validateProviderResponse(request, response, context)).toEqual(response);
  });

  it('rejects wrong request/profile/contract/target/provider identity', () => {
    const { request, response, context } = fixture();
    invalidCode(() => validateProviderResponse(request, { ...response, requestId: 'other' }, context));
    invalidCode(() => validateProviderResponse(request, { ...response, profileVersion: 'other' }, context));
    invalidCode(() => validateProviderResponse(request, { ...response, contractVersion: 'other' }, context));
    invalidCode(() => validateProviderResponse(request, { ...response, targetLocale: 'en-US' }, context));
    invalidCode(() => validateProviderResponse(request, {
      ...response,
      provider: { providerId: 'other', modelId: response.provider.modelId },
    }, context));
  });

  it('rejects missing, extra, duplicate, and unknown units', () => {
    const { request, response, context } = fixture();
    invalidCode(() => validateProviderResponse(request, { ...response, units: [] }, context));
    invalidCode(() => validateProviderResponse(request, {
      ...response,
      units: [...response.units, { unitId: 'unit-2', runs: [] }],
    }, context));
    invalidCode(() => validateProviderResponse(request, {
      ...response,
      units: [...response.units, response.units[0]],
    }, context));
    invalidCode(() => validateProviderResponse(request, {
      ...response,
      units: [{ ...response.units[0], unitId: 'unknown-unit' }],
    }, context));
  });

  it('rejects missing, extra, duplicate, and unknown runs', () => {
    const { request, response, context } = fixture();
    const unit = response.units[0];
    invalidCode(() => validateProviderResponse(request, { ...response, units: [{ ...unit, runs: [] }] }, context));
    invalidCode(() => validateProviderResponse(request, {
      ...response,
      units: [{ ...unit, runs: [...unit.runs, { runId: 'run-2', translatedText: 'extra' }] }],
    }, context));
    invalidCode(() => validateProviderResponse(request, {
      ...response,
      units: [{ ...unit, runs: [...unit.runs, unit.runs[0]] }],
    }, context));
    invalidCode(() => validateProviderResponse(request, {
      ...response,
      units: [{ ...unit, runs: [{ ...unit.runs[0], runId: 'unknown-run' }] }],
    }, context));
  });

  it('rejects empty output, arbitrary schema objects, markup, and placeholder corruption', () => {
    const { request, response, context, protection } = fixture();
    const unit = response.units[0];
    invalidCode(() => validateProviderResponse(request, {
      ...response,
      units: [{ ...unit, runs: [{ runId: 'run-1', translatedText: '   ' }] }],
    }, context));
    invalidCode(() => validateProviderResponse(request, {
      ...response,
      units: [{ ...unit, runs: [{ runId: 'run-1', translatedText: { text: 'schema injection' } }] }],
    }, context));
    invalidCode(() => validateProviderResponse(request, {
      ...response,
      units: [{ ...unit, runs: [{ runId: 'run-1', translatedText: '<b>texto</b>' }] }],
    }, context));
    const corrupted = protection.protectedText.replace(protection.tokens[0].placeholder, 'TA-ALTERADO');
    invalidCode(
      () => validateProviderResponse(request, {
        ...response,
        units: [{ ...unit, runs: [{ runId: 'run-1', translatedText: corrupted }] }],
      }, context),
      'TECHNICAL_TOKEN_MISMATCH'
    );
  });

  it('rejects a result whose current sourceHash is stale', () => {
    const { request, response, context } = fixture();
    invalidCode(
      () => validateProviderResponse(request, response, {
        ...context,
        currentSourceHashes: new Map([['unit-1', 'changed']]),
      }),
      'STALE_RESULT'
    );
  });

  it('rejects extra provider/schema fields because the wire contract is strict', () => {
    const { request, response, context } = fixture();
    invalidCode(() => validateProviderResponse(request, { ...response, arbitrary: true }, context));
    invalidCode(() => validateProviderResponse(request, {
      ...response,
      units: [{ ...response.units[0], arbitrary: true }],
    }, context));
  });

  it('rejects technical placeholder transplants across runs and units', async () => {
    const unitA = 'unit-a';
    const unitB = 'unit-b';
    const runA1 = protectTechnicalTokens(
      'Equipamento TA-25N',
      await technicalProtectionNamespace(unitA, 'run-a1')
    );
    const runA2 = protectTechnicalTokens(
      'Pressão 70 bar',
      await technicalProtectionNamespace(unitA, 'run-a2')
    );
    const runB1 = protectTechnicalTokens(
      'Sinal PSV-10',
      await technicalProtectionNamespace(unitB, 'run-b1')
    );

    const request: TranslationProviderRequest = {
      contractVersion: W5_TRANSLATION_CONTRACT_VERSION,
      profileVersion: W5_TRANSLATION_PROFILE_VERSION,
      requestId: 'context-bound-request',
      sourceCatalogId: 'catalog-1',
      sourceLocale: 'pt-BR',
      targetLocale: 'es-ES',
      units: [
        {
          unitId: unitA,
          sourceHash: 'a'.repeat(64),
          kind: 'textObject',
          context: 'Text object',
          runs: [
            { runId: 'run-a1', protectedText: runA1.protectedText },
            { runId: 'run-a2', protectedText: runA2.protectedText },
          ],
        },
        {
          unitId: unitB,
          sourceHash: 'b'.repeat(64),
          kind: 'tableCell',
          context: 'Table cell',
          runs: [{ runId: 'run-b1', protectedText: runB1.protectedText }],
        },
      ],
    };
    const baseResponse: TranslationProviderResponse = {
      contractVersion: W5_TRANSLATION_CONTRACT_VERSION,
      profileVersion: W5_TRANSLATION_PROFILE_VERSION,
      requestId: request.requestId,
      targetLocale: request.targetLocale,
      units: [
        {
          unitId: unitA,
          runs: [
            { runId: 'run-a1', translatedText: `ES: ${runA1.protectedText}` },
            { runId: 'run-a2', translatedText: `ES: ${runA2.protectedText}` },
          ],
        },
        {
          unitId: unitB,
          runs: [{ runId: 'run-b1', translatedText: `ES: ${runB1.protectedText}` }],
        },
      ],
      provider: { providerId: W5_TRANSLATION_PROVIDER_ID, modelId: W5_TRANSLATION_MODEL_ID },
    };
    const context = {
      currentSourceHashes: new Map([[unitA, 'a'.repeat(64)], [unitB, 'b'.repeat(64)]]),
      protectedRuns: new Map([
        [translationRunKey(unitA, 'run-a1'), runA1],
        [translationRunKey(unitA, 'run-a2'), runA2],
        [translationRunKey(unitB, 'run-b1'), runB1],
      ]),
    };

    expect(validateProviderResponse(request, baseResponse, context)).toEqual(baseResponse);

    const crossRun: TranslationProviderResponse = {
      ...baseResponse,
      units: baseResponse.units.map((unit) => unit.unitId === unitA ? {
        ...unit,
        runs: unit.runs.map((run) => {
          if (run.runId === 'run-a1') return { ...run, translatedText: `ES: ${runA2.protectedText}` };
          if (run.runId === 'run-a2') return { ...run, translatedText: `ES: ${runA1.protectedText}` };
          return run;
        }),
      } : unit),
    };
    invalidCode(
      () => validateProviderResponse(request, crossRun, context),
      'TECHNICAL_TOKEN_MISMATCH'
    );

    const crossUnit: TranslationProviderResponse = {
      ...baseResponse,
      units: baseResponse.units.map((unit) => ({
        ...unit,
        runs: unit.runs.map((run) => {
          if (unit.unitId === unitA && run.runId === 'run-a1') {
            return { ...run, translatedText: `ES: ${runB1.protectedText}` };
          }
          if (unit.unitId === unitB && run.runId === 'run-b1') {
            return { ...run, translatedText: `ES: ${runA1.protectedText}` };
          }
          return run;
        }),
      })),
    };
    invalidCode(
      () => validateProviderResponse(request, crossUnit, context),
      'TECHNICAL_TOKEN_MISMATCH'
    );
  });
});
