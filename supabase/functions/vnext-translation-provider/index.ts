import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

// Bundle this pure local dependency with the Edge Function; VM tests resolve the same source.
import { VNEXT_TRANSLATION_PROFILES, findRegisteredTranslationProfile, getTranslationLanguage } from '../../../src/vnext/translation/language-registry.ts';

const CONTRACT_VERSION = VNEXT_TRANSLATION_PROFILES[0].contractVersion;

// Server-only bridge for the canonical P1 client while P2 rolls out. Never a client profile.
const CANONICAL_SPANISH_PROFILE = Object.freeze({
  contractVersion: 'w5a-v1',
  profileVersion: 'w5-ptbr-eses-v1',
  sourceLocale: 'pt-BR',
  targetLocale: 'es-ES',
  providerId: 'gemini',
  modelId: 'gemini-2.5-flash',
  promptVersion: 'w5-technical-es-v1',
  tokenPolicyVersion: 'w5-tech-tokens-v1',
} as const);

function resolveGatewayProfile(sourceLocale: string, targetLocale: string, profileVersion: unknown) {
  const current = findRegisteredTranslationProfile(sourceLocale, targetLocale);
  if (current && profileVersion === current.profileVersion) return current;
  if (sourceLocale === CANONICAL_SPANISH_PROFILE.sourceLocale &&
    targetLocale === CANONICAL_SPANISH_PROFILE.targetLocale &&
    profileVersion === CANONICAL_SPANISH_PROFILE.profileVersion) return CANONICAL_SPANISH_PROFILE;
  return undefined;
}

const LIMITS = {
  maxUnits: 60,
  maxCharsPerRun: 4_000,
  maxTotalChars: 30_000,
};

// Operational budgets belong to the server; the authoring request cannot override them.
const BOUNDED_ACCEPTANCE_MAX_INPUT_TOKENS = 4_000;
const BOUNDED_ACCEPTANCE_MAX_OUTPUT_TOKENS = 4_096;
const PRODUCTION_MAX_OUTPUT_TOKENS = 65_536;

const LEAF_KINDS = new Set([
  'catalogTitle',
  'textObject',
  'tableCell',
  'tableTitle',
  'tableAnnotation',
  'tableLegend',
]);

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://catalog-builder-technical.vercel.app',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key)) &&
    allowed.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isOriginAllowed(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https:\/\/catalog-builder-technical(?:-[a-z0-9_-]+)?\.vercel\.app$/.test(origin);
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': isOriginAllowed(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(
  cors: Record<string, string>,
  status: number,
  error: string,
  message: string
): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

interface GatewayRun {
  runId: string;
  protectedText: string;
}

interface GatewayUnit {
  unitId: string;
  sourceHash: string;
  kind: string;
  context: string;
  runs: GatewayRun[];
}

interface GatewayRequest {
  contractVersion: string;
  profileVersion: string;
  requestId: string;
  sourceCatalogId: string;
  sourceLocale: string;
  targetLocale: string;
  units: GatewayUnit[];
}

function parseRequest(value: unknown): GatewayRequest | null {
  if (!isRecord(value)) return null;
  if (!exactKeys(value, [
    'contractVersion',
    'profileVersion',
    'requestId',
    'sourceCatalogId',
    'sourceLocale',
    'targetLocale',
    'units',
  ])) return null;
  if (
    value.contractVersion !== CONTRACT_VERSION ||
    !nonempty(value.sourceLocale) ||
    !nonempty(value.targetLocale) ||
    !nonempty(value.requestId) ||
    !nonempty(value.sourceCatalogId) ||
    !Array.isArray(value.units) ||
    value.units.length === 0 ||
    value.units.length > LIMITS.maxUnits
  ) return null;
  const profile = resolveGatewayProfile(value.sourceLocale, value.targetLocale, value.profileVersion);
  if (!profile) return null;

  const units: GatewayUnit[] = [];
  const unitIds = new Set<string>();
  let totalChars = 0;
  for (const rawUnit of value.units) {
    if (!isRecord(rawUnit) || !exactKeys(rawUnit, ['unitId', 'sourceHash', 'kind', 'context', 'runs'])) return null;
    if (
      !nonempty(rawUnit.unitId) ||
      !nonempty(rawUnit.sourceHash) ||
      !/^[a-f0-9]{64}$/.test(rawUnit.sourceHash) ||
      !nonempty(rawUnit.kind) ||
      !LEAF_KINDS.has(rawUnit.kind) ||
      !nonempty(rawUnit.context) ||
      !Array.isArray(rawUnit.runs) ||
      rawUnit.runs.length === 0 ||
      unitIds.has(rawUnit.unitId)
    ) return null;
    unitIds.add(rawUnit.unitId);

    const runs: GatewayRun[] = [];
    const runIds = new Set<string>();
    for (const rawRun of rawUnit.runs) {
      if (!isRecord(rawRun) || !exactKeys(rawRun, ['runId', 'protectedText'])) return null;
      if (
        !nonempty(rawRun.runId) ||
        !nonempty(rawRun.protectedText) ||
        rawRun.protectedText.length > LIMITS.maxCharsPerRun ||
        runIds.has(rawRun.runId)
      ) return null;
      runIds.add(rawRun.runId);
      totalChars += rawRun.protectedText.length;
      if (totalChars > LIMITS.maxTotalChars) return null;
      runs.push({ runId: rawRun.runId, protectedText: rawRun.protectedText });
    }

    units.push({
      unitId: rawUnit.unitId,
      sourceHash: rawUnit.sourceHash,
      kind: rawUnit.kind,
      context: rawUnit.context,
      runs,
    });
  }

  return {
    contractVersion: value.contractVersion,
    profileVersion: profile.profileVersion,
    requestId: value.requestId,
    sourceCatalogId: value.sourceCatalogId,
    sourceLocale: value.sourceLocale,
    targetLocale: value.targetLocale,
    units,
  };
}

const PLACEHOLDER = /\[\[VNEXT_TECH(?:_[A-Z0-9]+)*_\d{3,}\]\]/g;

function placeholderMultiset(text: string): string[] {
  return (text.match(PLACEHOLDER) ?? []).sort();
}

function exactStringSet(expected: readonly string[], actual: readonly string[]): boolean {
  return expected.length === actual.length &&
    new Set(expected).size === expected.length &&
    new Set(actual).size === actual.length &&
    actual.every((value) => expected.includes(value));
}

interface ProviderRun {
  runId: string;
  translatedText: string;
}

interface ProviderUnit {
  unitId: string;
  runs: ProviderRun[];
}

function validateProviderPayload(value: unknown, request: GatewayRequest): ProviderUnit[] | null {
  if (!isRecord(value) || !exactKeys(value, ['units']) || !Array.isArray(value.units)) return null;
  const rawUnits = value.units;
  if (rawUnits.length !== request.units.length) return null;

  const requestById = new Map(request.units.map((unit) => [unit.unitId, unit]));
  const returnedIds: string[] = [];
  const units: ProviderUnit[] = [];

  for (const rawUnit of rawUnits) {
    if (!isRecord(rawUnit) || !exactKeys(rawUnit, ['unitId', 'runs'])) return null;
    if (!nonempty(rawUnit.unitId) || !Array.isArray(rawUnit.runs)) return null;
    returnedIds.push(rawUnit.unitId);
    const expectedUnit = requestById.get(rawUnit.unitId);
    if (!expectedUnit || rawUnit.runs.length !== expectedUnit.runs.length) return null;

    const expectedByRun = new Map(expectedUnit.runs.map((run) => [run.runId, run]));
    const returnedRunIds: string[] = [];
    const runs: ProviderRun[] = [];
    for (const rawRun of rawUnit.runs) {
      if (!isRecord(rawRun) || !exactKeys(rawRun, ['runId', 'translatedText'])) return null;
      if (!nonempty(rawRun.runId) || !nonempty(rawRun.translatedText) || !rawRun.translatedText.trim()
        || rawRun.translatedText.length > LIMITS.maxCharsPerRun
        || /<\/?[A-Za-z][^>]*>/.test(rawRun.translatedText)
        || Array.from(rawRun.translatedText).some(character => {
          const code = character.charCodeAt(0);
          return code < 32 && code !== 9 && code !== 10 && code !== 13;
        })) return null;
      const expectedRun = expectedByRun.get(rawRun.runId);
      if (!expectedRun) return null;
      returnedRunIds.push(rawRun.runId);
      if (
        JSON.stringify(placeholderMultiset(expectedRun.protectedText)) !==
        JSON.stringify(placeholderMultiset(rawRun.translatedText))
      ) return null;
      if (rawRun.translatedText.replace(PLACEHOLDER, '').includes('[[VNEXT_TECH_')) return null;
      runs.push({ runId: rawRun.runId, translatedText: rawRun.translatedText });
    }
    if (!exactStringSet(expectedUnit.runs.map((run) => run.runId), returnedRunIds)) return null;
    units.push({ unitId: rawUnit.unitId, runs });
  }

  if (!exactStringSet(request.units.map((unit) => unit.unitId), returnedIds)) return null;
  return units;
}

serve(async (request: Request) => {
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json(cors, 405, 'INVALID_REQUEST', 'Método não permitido.');

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return json(cors, 401, 'INVALID_REQUEST', 'Sessão autenticada obrigatória.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey) {
      return json(cors, 503, 'PROVIDER_UNAVAILABLE', 'Infraestrutura de tradução indisponível.');
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json(cors, 401, 'INVALID_REQUEST', 'Sessão inválida ou expirada.');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', user.id)
      .maybeSingle();
    if (
      profileError ||
      !profile ||
      !profile.is_active ||
      (profile.role !== 'admin' && profile.role !== 'editor')
    ) {
      return json(cors, 403, 'FORBIDDEN', 'Usuário sem autorização ativa para tradução.');
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return json(cors, 400, 'INVALID_REQUEST', 'Payload JSON inválido.');
    }

    if (isRecord(rawBody) && ['apiKey', 'providerSecret', 'geminiKey', 'credential'].some((key) => key in rawBody)) {
      return json(cors, 400, 'INVALID_REQUEST', 'Credenciais de provedor não são aceitas no payload.');
    }

    const body = parseRequest(rawBody);
    if (!body) {
      if (
        isRecord(rawBody) &&
        Array.isArray(rawBody.units) &&
        rawBody.units.length > LIMITS.maxUnits
      ) {
        return json(cors, 413, 'PAYLOAD_TOO_LARGE', 'Payload excede os limites de tradução W5.A.');
      }
      return json(cors, 400, 'INVALID_REQUEST', 'Contrato de tradução inválido ou não suportado.');
    }

    const budgetMode = Deno.env.get('VNEXT_TRANSLATION_BUDGET_MODE');
    if (budgetMode !== undefined && budgetMode !== 'production' && budgetMode !== 'bounded-acceptance') {
      return json(cors, 503, 'PROVIDER_UNAVAILABLE', 'Configuração de orçamento de tradução indisponível.');
    }
    const boundedAcceptance = budgetMode === 'bounded-acceptance';

    const providerSecret = Deno.env.get('GEMINI_API_KEY') ?? '';
    if (!providerSecret) {
      return json(cors, 503, 'CREDENTIAL_UNAVAILABLE', 'Credencial do provedor não configurada no servidor.');
    }

    const translationProfile = resolveGatewayProfile(body.sourceLocale, body.targetLocale, body.profileVersion)!;
    const canonicalSpanish = translationProfile.profileVersion === CANONICAL_SPANISH_PROFILE.profileVersion;
    const promptContract = {
      contractVersion: CONTRACT_VERSION,
      profileVersion: translationProfile.profileVersion,
      ...(canonicalSpanish ? {} : {
        promptVersion: translationProfile.promptVersion,
        tokenPolicyVersion: translationProfile.tokenPolicyVersion,
      }),
      sourceLocale: translationProfile.sourceLocale,
      targetLocale: translationProfile.targetLocale,
      rules: [
        `Translate only protectedText values from Portuguese (Brazil) to ${getTranslationLanguage(translationProfile.targetLocale)!.englishName}.`,
        ...(canonicalSpanish ? [] : [
          'Use professional PRESYS engineering, instrumentation and metrology language. Context locates the text; it supplies no new product facts.',
          'Never improve, correct, complete, infer or invent specifications, commercial values or missing information. Keep pending fields pending.',
          'Preserve all numbers, decimal separators, signs, ranges, uncertainty, units, product/model codes, standards, protocols and symbols exactly; preserve the meaning of technical qualifiers.',
        ]),
        'Preserve every [[VNEXT_TECH...]] placeholder exactly once and byte-for-byte.',
        'Return the same unitId and runId identities. Do not add or remove units or runs.',
        'Return plain text only; do not emit HTML or Markdown formatting.',
      ],
      units: body.units.map((unit) => ({
        unitId: unit.unitId,
        kind: unit.kind,
        context: unit.context,
        runs: unit.runs,
      })),
      responseShape: {
        units: [{ unitId: 'same unitId', runs: [{ runId: 'same runId', translatedText: 'plain translated text' }] }],
      },
    };

    // Construct once so the counted prompt/config is exactly the one generated afterwards.
    const generationRequest = {
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(promptContract) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        candidateCount: 1,
        maxOutputTokens: boundedAcceptance ? BOUNDED_ACCEPTANCE_MAX_OUTPUT_TOKENS : PRODUCTION_MAX_OUTPUT_TOKENS,
        ...(boundedAcceptance ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    };
    const generationBody = JSON.stringify(generationRequest);
    const providerHeaders = { 'Content-Type': 'application/json', 'x-goog-api-key': providerSecret };
    const modelResource = `models/${translationProfile.modelId}`;
    const providerEndpoint = `https://generativelanguage.googleapis.com/v1beta/${modelResource}`;

    if (boundedAcceptance) {
      let countResponse: Response;
      try {
        countResponse = await fetch(`${providerEndpoint}:countTokens`, {
          method: 'POST', headers: providerHeaders,
          body: JSON.stringify({ generateContentRequest: { model: modelResource, ...generationRequest } }),
        });
      } catch {
        return json(cors, 502, 'PROVIDER_UNAVAILABLE', 'Não foi possível verificar o limite de entrada. Nenhuma tradução foi gerada.');
      }
      if (!countResponse.ok) {
        if (countResponse.status === 429) {
          return json(cors, 429, 'PROVIDER_RATE_LIMIT', 'Limite temporário na verificação de entrada. Nenhuma tradução foi gerada.');
        }
        if ([400, 401, 403].includes(countResponse.status)) {
          return json(cors, 503, 'CREDENTIAL_UNAVAILABLE', 'Verificação de entrada indisponível para o provedor. Nenhuma tradução foi gerada.');
        }
        return json(cors, 502, 'PROVIDER_UNAVAILABLE', 'Verificação de entrada temporariamente indisponível. Nenhuma tradução foi gerada.');
      }
      let counted: unknown;
      try { counted = await countResponse.json(); } catch { counted = null; }
      if (!isRecord(counted) || typeof counted.totalTokens !== 'number' ||
        !Number.isSafeInteger(counted.totalTokens) || counted.totalTokens < 0) {
        return json(cors, 502, 'INVALID_PROVIDER_RESPONSE', 'Não foi possível validar a contagem de entrada. Nenhuma tradução foi gerada.');
      }
      if (counted.totalTokens > BOUNDED_ACCEPTANCE_MAX_INPUT_TOKENS) {
        return json(cors, 413, 'PAYLOAD_TOO_LARGE', 'O texto completo excede o limite desta validação. Reduza o conteúdo e tente novamente.');
      }
    }

    let providerResponse: Response;
    try {
      providerResponse = await fetch(
        `${providerEndpoint}:generateContent`,
        {
          method: 'POST',
          headers: providerHeaders,
          body: generationBody,
        }
      );
    } catch {
      return json(cors, 502, 'PROVIDER_UNAVAILABLE', 'Provedor de tradução temporariamente indisponível.');
    }

    if (!providerResponse.ok) {
      if (providerResponse.status === 429) {
        return json(cors, 429, 'PROVIDER_RATE_LIMIT', 'Limite temporário do provedor de tradução.');
      }
      if ([400, 401, 403].includes(providerResponse.status)) {
        return json(cors, 503, 'CREDENTIAL_UNAVAILABLE', 'Credencial server-side indisponível para o provedor.');
      }
      return json(cors, 502, 'PROVIDER_UNAVAILABLE', 'Provedor de tradução temporariamente indisponível.');
    }

    let providerJson: unknown;
    try {
      const envelope = await providerResponse.json();
      const candidate = isRecord(envelope) && Array.isArray(envelope.candidates) && envelope.candidates.length === 1
        ? envelope.candidates[0] : null;
      const text = isRecord(candidate) && candidate.finishReason === 'STOP' && isRecord(candidate.content) &&
        Array.isArray(candidate.content.parts) && isRecord(candidate.content.parts[0])
        ? candidate.content.parts[0].text : null;
      providerJson = typeof text === 'string' ? JSON.parse(text) : null;
    } catch {
      providerJson = null;
    }

    const units = validateProviderPayload(providerJson, body);
    if (!units) {
      return json(cors, 502, 'INVALID_PROVIDER_RESPONSE', 'Resposta do provedor não satisfaz o contrato W5.A.');
    }

    return new Response(JSON.stringify({
      contractVersion: CONTRACT_VERSION,
      profileVersion: translationProfile.profileVersion,
      requestId: body.requestId,
      targetLocale: translationProfile.targetLocale,
      units,
      provider: {
        providerId: translationProfile.providerId,
        modelId: translationProfile.modelId,
      },
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch {
    return json(cors, 500, 'PROVIDER_UNAVAILABLE', 'Falha interna sanitizada no gateway de tradução.');
  }
});
