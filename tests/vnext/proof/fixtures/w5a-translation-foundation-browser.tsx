import ReactDOM from 'react-dom/client';
import {
  ControlledTranslationProvider,
  MemoryTranslationRequestCache,
  TranslationFoundationError,
  TranslationFoundationService,
  W5_TRANSLATION_CONTRACT_VERSION,
  W5_TRANSLATION_MODEL_ID,
  W5_TRANSLATION_PROFILE_VERSION,
  W5_TRANSLATION_PROVIDER_ID,
  buildTranslationRequestCacheKey,
  extractSemanticTranslationCoverage,
  type TranslationProviderRequest,
  type TranslationProviderResponse,
} from '@/vnext/translation';
import { CatalogDocumentSchema } from '@/vnext';
import { createW5ATranslationDocument } from '../../translation/w5a-fixture';

function responseFor(request: TranslationProviderRequest): TranslationProviderResponse {
  return {
    contractVersion: W5_TRANSLATION_CONTRACT_VERSION,
    profileVersion: W5_TRANSLATION_PROFILE_VERSION,
    requestId: request.requestId,
    targetLocale: request.targetLocale,
    units: request.units.map((unit) => ({
      unitId: unit.unitId,
      runs: unit.runs.map((run) => ({
        runId: run.runId,
        translatedText: `ES: ${run.protectedText}`,
      })),
    })),
    provider: { providerId: W5_TRANSLATION_PROVIDER_ID, modelId: W5_TRANSLATION_MODEL_ID },
  };
}

function addEligibleTextForProof(
  source: ReturnType<typeof createW5ATranslationDocument>,
  id: string
): void {
  source.pages[0].objects.push({
    id,
    type: 'text',
    frame: { xMm: 5, yMm: 245, widthMm: 35, heightMm: 10 },
    zIndex: 100 + source.pages[0].objects.length,
    text: {
      paragraphs: [{
        id: `${id}:p`,
        inlines: [{ kind: 'text', id: `${id}:t`, text: 'Novo texto durante tradução', marks: [] }],
      }],
    },
    style: {},
  });
}

async function errorCode(work: () => Promise<unknown>): Promise<string | null> {
  try {
    await work();
    return null;
  } catch (error) {
    return error instanceof TranslationFoundationError ? error.code : String(error);
  }
}

async function runFoundationProof() {
  const source = createW5ATranslationDocument();
  const sourceBefore = JSON.stringify(source);
  const parsed = CatalogDocumentSchema.safeParse(source).success;
  const coverage = await extractSemanticTranslationCoverage(source);
  const cache = new MemoryTranslationRequestCache();
  let requestCounter = 0;
  const provider = new ControlledTranslationProvider();
  const service = new TranslationFoundationService(provider, {
    cache,
    requestId: () => `browser-request-${++requestCounter}`,
    sleep: async () => undefined,
  });

  const first = await service.translateCatalog(source);
  const afterFirst = JSON.stringify(source);
  const second = await service.translateCatalog(source);
  const afterSecond = JSON.stringify(source);
  const request = provider.requests[0];
  const requestJson = JSON.stringify(request);
  const restoredText = first.units.flatMap((unit) => unit.runs.map((run) => run.translatedText)).join('\n');

  const cacheKey = await buildTranslationRequestCacheKey(request);
  const changedContextKey = await buildTranslationRequestCacheKey({
    ...request,
    requestId: 'cache-variant-request',
    units: request.units.map((unit, index) => index === 0 ? { ...unit, context: `${unit.context} changed` } : unit),
  });

  const staleSource = createW5ATranslationDocument();
  const staleProvider = new ControlledTranslationProvider((currentRequest) => {
    staleSource.title = 'Fonte alterada durante request';
    return responseFor(currentRequest);
  });
  const staleService = new TranslationFoundationService(staleProvider, {
    requestId: () => 'browser-stale',
    sleep: async () => undefined,
  });
  const staleCode = await errorCode(() => staleService.translateCatalog(staleSource));

  const staleCoverageSource = createW5ATranslationDocument();
  const staleCoverageProvider = new ControlledTranslationProvider((currentRequest) => {
    addEligibleTextForProof(staleCoverageSource, 'browser-late-added-text');
    return responseFor(currentRequest);
  });
  const staleCoverageService = new TranslationFoundationService(staleCoverageProvider, {
    requestId: () => 'browser-stale-coverage',
    sleep: async () => undefined,
  });
  const staleCoverageSetCode = await errorCode(
    () => staleCoverageService.translateCatalog(staleCoverageSource)
  );

  const crossRunProvider = new ControlledTranslationProvider((currentRequest) => {
    const requestUnit = currentRequest.units.find(
      (unit) => unit.runs.filter((run) => run.protectedText.includes('[[VNEXT_TECH_')).length >= 2
    );
    if (!requestUnit) throw new Error('Missing multi-token W5.A proof unit');
    const tokenRuns = requestUnit.runs.filter((run) => run.protectedText.includes('[[VNEXT_TECH_'));
    const response = responseFor(currentRequest);
    return {
      ...response,
      units: response.units.map((unit) => unit.unitId === requestUnit.unitId ? {
        ...unit,
        runs: unit.runs.map((run) => {
          if (run.runId === tokenRuns[0].runId) {
            return { ...run, translatedText: `ES: ${tokenRuns[1].protectedText}` };
          }
          if (run.runId === tokenRuns[1].runId) {
            return { ...run, translatedText: `ES: ${tokenRuns[0].protectedText}` };
          }
          return run;
        }),
      } : unit),
    };
  });
  const crossRunService = new TranslationFoundationService(crossRunProvider, {
    requestId: () => 'browser-cross-run',
    sleep: async () => undefined,
  });
  const crossRunTokenCode = await errorCode(
    () => crossRunService.translateCatalog(createW5ATranslationDocument())
  );

  const crossUnitProvider = new ControlledTranslationProvider((currentRequest) => {
    const tokenUnits = currentRequest.units
      .map((unit) => ({
        unit,
        run: unit.runs.find((run) => run.protectedText.includes('[[VNEXT_TECH_')),
      }))
      .filter((entry): entry is { unit: TranslationProviderRequest['units'][number]; run: TranslationProviderRequest['units'][number]['runs'][number] } =>
        Boolean(entry.run)
      );
    if (tokenUnits.length < 2) throw new Error('Missing cross-unit W5.A proof tokens');
    const response = responseFor(currentRequest);
    return {
      ...response,
      units: response.units.map((unit) => ({
        ...unit,
        runs: unit.runs.map((run) => {
          if (unit.unitId === tokenUnits[0].unit.unitId && run.runId === tokenUnits[0].run.runId) {
            return { ...run, translatedText: `ES: ${tokenUnits[1].run.protectedText}` };
          }
          if (unit.unitId === tokenUnits[1].unit.unitId && run.runId === tokenUnits[1].run.runId) {
            return { ...run, translatedText: `ES: ${tokenUnits[0].run.protectedText}` };
          }
          return run;
        }),
      })),
    };
  });
  const crossUnitService = new TranslationFoundationService(crossUnitProvider, {
    requestId: () => 'browser-cross-unit',
    sleep: async () => undefined,
  });
  const crossUnitTokenCode = await errorCode(
    () => crossUnitService.translateCatalog(createW5ATranslationDocument())
  );

  const invalidProvider = new ControlledTranslationProvider((currentRequest) => ({
    ...responseFor(currentRequest),
    requestId: 'wrong-request-id',
  }));
  const invalidService = new TranslationFoundationService(invalidProvider, {
    requestId: () => 'browser-invalid',
    sleep: async () => undefined,
  });
  const invalidCode = await errorCode(() => invalidService.translateCatalog(createW5ATranslationDocument()));

  const unsupportedProvider = new ControlledTranslationProvider();
  const unsupportedService = new TranslationFoundationService(unsupportedProvider, {
    requestId: () => 'browser-unsupported',
  });
  const unsupportedCode = await errorCode(
    () => unsupportedService.translateCatalog(createW5ATranslationDocument(), 'en-US')
  );

  const mainText = source.pages[0].objects.find((object) => object.id === 'w5a-text-main');
  if (mainText?.type !== 'text') throw new Error('Missing browser W5.A text fixture');

  return {
    parsed,
    eligibleCount: coverage.eligible.length,
    eligibleKinds: coverage.eligible.map((leaf) => leaf.kind),
    excludedReasons: coverage.excluded.map((surface) => surface.reason),
    groupDescendantFound: coverage.eligible.some(
      (leaf) => leaf.locator.kind === 'textObject' && leaf.locator.objectId === 'w5a-group-text'
    ),
    technicalPayloadExcluded: !requestJson.includes('PCON-Y18'),
    assetAltPayloadExcluded: !requestJson.includes('ALT IMUTÁVEL NÃO TRADUZIR'),
    maskedPayload: requestJson.includes('[[VNEXT_TECH_'),
    noBrowserProviderSecret:
      !requestJson.includes('apiKey') &&
      !requestJson.includes('providerSecret') &&
      !requestJson.includes('GEMINI_API_KEY'),
    restoredTechnicalTokens:
      restoredText.includes('TA-25N') &&
      restoredText.includes('0 a 70 bar') &&
      restoredText.includes('4–20 mA') &&
      restoredText.includes('ISO/IEC 17025'),
    richTextIdentity: mainText.text.paragraphs.map((paragraph) => ({
      id: paragraph.id,
      list: paragraph.list ?? null,
      inlines: paragraph.inlines.map((inline) => inline.kind === 'text'
        ? { kind: inline.kind, id: inline.id, marks: inline.marks }
        : { kind: inline.kind, id: inline.id }),
    })),
    resultRunIds: first.units.flatMap((unit) => unit.runs.map((run) => run.runId)),
    sourceHashes: coverage.eligible.map((leaf) => [leaf.leafId, leaf.sourceHash]),
    staleCode,
    staleCoverageSetCode,
    crossRunTokenCode,
    crossUnitTokenCode,
    invalidCode,
    unsupportedCode,
    firstProviderRequests: first.providerRequests,
    secondProviderRequests: second.providerRequests,
    secondCacheHits: second.cacheHits,
    cacheSize: cache.size,
    cacheKeySeparated: cacheKey !== changedContextKey,
    sourceUnchanged: sourceBefore === afterFirst && sourceBefore === afterSecond,
    providerRequestCount: provider.requests.length,
    sourceBefore,
    sourceAfter: afterSecond,
  };
}

const proofPromise = runFoundationProof();

declare global {
  interface Window {
    __W5A_PROOF__: {
      run: () => Promise<Awaited<ReturnType<typeof runFoundationProof>>>;
    };
  }
}

window.__W5A_PROOF__ = { run: () => proofPromise };

function App() {
  return (
    <main data-w5a-proof="">
      <h1>W5.A Semantic Translation Foundation</h1>
      <p>Controlled deterministic provider — no translated catalog materialization.</p>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
