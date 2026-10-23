/**
 * Onda 4C · prova real curta (FR-85/FR-87): o gateway `vnext-translation-provider` de verdade
 * (o mesmo código Deno, executado numa VM do Node como nos testes) chamando o Gemini real para
 * traduzir UMA página de especificações do TA-25N para en-US e es-ES.
 *
 * - Supabase é simulado (usuário editor ativo); o Gemini é real.
 * - A chave vem SÓ de VNEXT_LIVE_GEMINI_KEY; nunca é impressa nem gravada.
 * - Textos de origem: fatos reais do modelo inicial TA-25N (`presys-ta25n-starter.ts`) e a nota
 *   do folder EF1038-01 da capa PCON (`presys-cover-pcon.ts`). Nada inventado.
 *
 * Uso (PowerShell/bash):  VNEXT_LIVE_GEMINI_KEY=... npx vite-node scripts/qa/live-translation-glossary-proof.ts [saida.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import * as ts from 'typescript';
import { protectTechnicalTokens, restoreTechnicalTokens, technicalProtectionNamespace } from '../../src/vnext/translation/technical-token-protector';
import { VNEXT_TRANSLATION_PROFILES } from '../../src/vnext/translation/language-registry';
import { formatTechnicalTextForLocale } from '../../src/vnext/translation/locale-number-format';
import { findGlossaryHints, findKnownMisspellings } from '../../src/vnext/translation/glossary';
import { findKeepTerms, PRESYS_GLOSSARY_VERSION } from '../../src/vnext/translation/presys-glossary';
import { geminiCostMicrousd } from '../../src/vnext/ai-catalog/gemini-models';

const KEY = process.env.VNEXT_LIVE_GEMINI_KEY ?? '';
if (!KEY) { console.error('Defina VNEXT_LIVE_GEMINI_KEY.'); process.exit(2); }
const OUTPUT = process.argv[2];

/** Uma página de especificações (rótulo + valor reais), mais a nota do folder PCON e o nome do Kompressor. */
const PAGE: readonly { readonly kind: 'tableCell' | 'tableTitle' | 'textObject'; readonly text: string }[] = [
  { kind: 'tableTitle', text: 'Especificações Técnicas — PRESYS TA-25N' },
  { kind: 'textObject', text: 'Calibrador de bloco seco com referência interna e leitura de sinais de sensores' },
  { kind: 'tableCell', text: 'Exatidão da referência interna: ±0,1 °C' },
  { kind: 'tableCell', text: 'Resolução: 0,01 °C' },
  { kind: 'tableCell', text: 'Estabilidade: ±0,02 °C' },
  { kind: 'tableCell', text: 'Uniformidade axial: ±0,05 °C em 40 mm' },
  { kind: 'tableCell', text: 'Poço: Ø25,4 mm × 124 mm' },
  { kind: 'tableCell', text: 'Peso: 10,5 kg' },
  { kind: 'tableCell', text: 'Entrada de corrente: −1 a 24,5 mA' },
  { kind: 'tableCell', text: 'Fonte auxiliar: 24 Vcc regulada para transmissores' },
  { kind: 'tableCell', text: 'Funções / entradas: TCs, RTDs, mA, mV, ohms e termostatos' },
  { kind: 'tableCell', text: 'Normas declaradas pelo fabricante: EN 61010-1:2010+A1:2019; EN IEC 61326-1:2021' },
  { kind: 'textObject', text: 'Exatidão publicada ±0,025% FS (±0,05% FS na faixa 100–10000 psi). Valores do folder EF1038-01.' },
  { kind: 'tableTitle', text: 'Código de Encomenda e Fornecimento Padrão — PCON KOMPRESSOR-Y18' },
];

interface Usage { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }

function loadGateway(realFetch: typeof fetch) {
  const root = process.cwd();
  const gatewayPath = resolve(root, 'supabase/functions/vnext-translation-provider/index.ts');
  const registryPath = resolve(root, 'src/vnext/translation/language-registry.ts');
  const modelsPath = resolve(root, 'src/vnext/ai-catalog/gemini-models.ts');
  const glossaryPath = resolve(root, 'src/vnext/translation/presys-glossary.ts');
  const transpile = (path: string) => ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const load = (path: string, deps: Record<string, unknown> = {}) => {
    const exports: Record<string, unknown> = {};
    runInContext(transpile(path), createContext({ exports, require: (id: string) => {
      const target = resolve(dirname(path), id);
      if (target in deps) return deps[target];
      throw new Error(`Dependência inesperada: ${id}`);
    } }), { filename: path });
    return exports;
  };
  const models = load(modelsPath);
  const registry = load(registryPath, { [modelsPath]: models });
  const glossary = load(glossaryPath);
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const fakeSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'live-proof-editor' } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'live-proof-editor', role: 'editor', is_active: true }, error: null }) }) }) }),
  };
  const context = createContext({ exports: {}, Request, Response, Headers, fetch: realFetch,
    require: (id: string) => {
      if (id === 'https://deno.land/std@0.177.0/http/server.ts') return { serve: (callback: typeof handler) => { handler = callback; } };
      if (id === 'https://esm.sh/@supabase/supabase-js@2.112.4') return { createClient: () => fakeSupabase };
      const target = resolve(dirname(gatewayPath), id);
      if (target === registryPath) return registry;
      if (target === glossaryPath) return glossary;
      throw new Error(`Dependência inesperada do gateway: ${id}`);
    },
    Deno: { env: { get: (name: string) => ({ SUPABASE_URL: 'https://live-proof.invalid', SUPABASE_ANON_KEY: 'live-proof-anon',
      VNEXT_TRANSLATION_GEMINI_API_KEY: KEY, VNEXT_TRANSLATION_BUDGET_MODE: 'bounded-acceptance' } as Record<string, string>)[name] } },
  });
  runInContext(transpile(gatewayPath), context, { filename: gatewayPath });
  if (!handler) throw new Error('O gateway não registrou o handler.');
  return handler;
}

async function main() {
  const usages: { model: string; usage: Usage; status: number; schemaSent: boolean }[] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const response = await fetch(input, init);
    if (url.endsWith(':generateContent')) {
      const clone = response.clone();
      const body = await clone.json().catch(() => ({})) as { usageMetadata?: Usage };
      const sent = JSON.parse(String(init?.body ?? '{}')) as { generationConfig?: { responseSchema?: unknown } };
      usages.push({ model: url.split('/models/')[1].split(':')[0], usage: body.usageMetadata ?? {}, status: response.status,
        schemaSent: Boolean(sent.generationConfig?.responseSchema) });
    }
    return response;
  };
  const handler = loadGateway(recordingFetch);
  const report: Record<string, unknown> = { glossaryVersion: PRESYS_GLOSSARY_VERSION, date: new Date().toISOString(), locales: {} };

  for (const profile of VNEXT_TRANSLATION_PROFILES) {
    const prepared = await Promise.all(PAGE.map(async (item, index) => {
      const unitId = `ta25n-spec-${index + 1}`;
      const namespace = await technicalProtectionNamespace(unitId, 'run-1');
      return { unitId, item, protectedValue: protectTechnicalTokens(item.text, namespace) };
    }));
    const body = {
      contractVersion: profile.contractVersion, profileVersion: profile.profileVersion, requestId: `live-4c-${profile.targetLocale}`,
      sourceCatalogId: 'live-proof-ta25n', sourceLocale: profile.sourceLocale, targetLocale: profile.targetLocale,
      units: prepared.map(({ unitId, item, protectedValue }) => ({ unitId, sourceHash: 'a'.repeat(64), kind: item.kind,
        context: 'Página de especificações técnicas do catálogo PRESYS', runs: [{ runId: 'run-1', protectedText: protectedValue.protectedText }] })),
    };
    const started = Date.now();
    const response = await handler(new Request('https://live-proof.invalid/functions/v1/vnext-translation-provider', {
      method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', Authorization: 'Bearer live-proof' },
      body: JSON.stringify(body) }));
    const output = await response.json() as { error?: string; message?: string;
      units?: { unitId: string; runs: { runId: string; translatedText: string }[] }[] };
    const runs = (output.units ?? []).map(unit => {
      const source = prepared.find(item => item.unitId === unit.unitId)!;
      const translated = restoreTechnicalTokens(unit.runs[0].translatedText, source.protectedValue);
      const keepSource = findKeepTerms(source.item.text).map(span => span.value);
      const target = profile.targetLocale;
      const format = formatTechnicalTextForLocale(translated, { sourceLocale: 'pt-BR', targetLocale: target });
      return {
        source: source.item.text,
        translated,
        technicalValuesVerbatim: source.protectedValue.tokens.every(token => translated.includes(token.value)),
        brandsAndModelsVerbatim: keepSource.every(value => translated.includes(value)),
        brandsAndModels: keepSource,
        numberFormatSuggestion: format.changes.length > 0 ? format.text : null,
        numberConfirmations: format.confirmations.map(item => item.token),
        glossaryHints: findGlossaryHints(source.item.text, translated, target).map(hint => hint.expected),
        misspellings: target === 'en-US' ? findKnownMisspellings(translated).map(item => item.wrong) : [],
      };
    });
    (report.locales as Record<string, unknown>)[profile.targetLocale] = { status: response.status, error: output.error, message: output.message,
      milliseconds: Date.now() - started, runs };
  }
  const costMicrousd = usages.reduce((sum, item) => sum + geminiCostMicrousd(item.model,
    item.usage.promptTokenCount ?? 0, (item.usage.candidatesTokenCount ?? 0) + (item.usage.thoughtsTokenCount ?? 0)), 0);
  report.calls = usages.map(item => ({ model: item.model, status: item.status, schemaSent: item.schemaSent, usage: item.usage }));
  report.costUsd = costMicrousd / 1e6;
  const text = JSON.stringify(report, null, 2);
  if (text.includes(KEY)) throw new Error('A chave apareceria no relatório; nada foi gravado.');
  if (OUTPUT) writeFileSync(OUTPUT, text);
  console.log(text);
}

main().catch(error => { console.error(error instanceof Error ? error.message.replaceAll(KEY, '***') : 'falha'); process.exit(1); });
