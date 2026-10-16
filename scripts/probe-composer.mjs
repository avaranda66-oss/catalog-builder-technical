#!/usr/bin/env node
/**
 * Real-Gemini probe for the vnext-catalog-composer contract.
 *
 * It imports the SAME module the Edge Function bundles
 * (src/vnext/ai-catalog/composer-contract.ts): request parser, prompt,
 * bounded response schema, normalization, strict validation, repair attempt
 * and settlement arithmetic. Only Supabase (auth, profile, budget RPCs) is
 * replaced by an in-memory ledger, so no catalog, database or deploy is touched.
 *
 * The key is read ONLY from the environment variable GEMINI_API_KEY and is
 * never printed, logged or written. Prompts and model text are not printed
 * either; only structure (page types, headings, table shapes) and costs.
 *
 * Usage (Node 22.18+/24, type stripping):
 *   GEMINI_API_KEY=... node scripts/probe-composer.mjs [--ledger legacy|settled]
 *     [--only id1,id2] [--message "pedido"] [--json saida.json]
 */
import { writeFileSync } from 'node:fs';
import {
  COMPOSER_MODEL, composerReservationMicrousd, parseComposerRequest, runComposerGeneration,
} from '../src/vnext/ai-catalog/composer-contract.ts';
import { frameShortComposerMessage, frameShortRewriteInstruction } from '../src/vnext/ai-catalog/composer-framing.ts';

const args = process.argv.slice(2);
const option = name => { const index = args.indexOf('--' + name); return index >= 0 ? args[index + 1] : undefined; };
const ledgerKind = option('ledger') === 'settled' ? 'settled' : 'legacy';
const key = process.env.GEMINI_API_KEY ?? '';
if (key.length < 12) {
  console.error('Defina a variável de ambiente GEMINI_API_KEY (a chave nunca é impressa).');
  process.exit(2);
}

const document = (title = 'Catálogo PRESYS em elaboração', pages = 1) => ({ title, pages, currentPageHeadings: [] });
const compose = (message, history = [], doc = document()) => ({
  version: 1, task: 'compose_scaffold', message: frameShortComposerMessage(message, history.length > 0), history, document: doc,
});
/** Each case states what a correct answer looks like. */
const PROBE_CASES = [
  { id: 'ficha', expect: 'proposal', body: compose('Monte a estrutura de uma ficha técnica do calibrador de temperatura TA-25N: capa, visão geral e uma tabela de especificações.') },
  { id: 'folder', expect: 'proposal', body: compose('Crie um folder de duas páginas para apresentar a linha de calibradores de pressão da PRESYS a clientes da indústria.') },
  { id: 'comparativo', expect: 'proposal', needsTable: true, body: compose('Faça uma página comparando os modelos TA-25N, TA-35N e TA-50N, com linhas para faixa, exatidão, alimentação e dimensões.') },
  { id: 'vago', expect: 'clarification', body: compose('Me ajude com isso.') },
  { id: 'resposta-curta-3', expect: 'proposal', body: compose('3', [
    { role: 'user', message: 'Quero começar um catálogo novo de calibradores com uma tabela comparativa.' },
    { role: 'assistant', message: 'Quantos modelos devem aparecer na tabela comparativa?' },
  ]) },
  { id: 'resposta-sim', expect: 'proposal', body: compose('Sim', [
    { role: 'user', message: 'Crie uma capa e uma página de apresentação para o catálogo de manômetros digitais.' },
    { role: 'assistant', message: 'Deseja incluir também uma página com tabela comparativa dos modelos?' },
  ]) },
  { id: 'matriz', expect: 'proposal', needsTable: true, body: compose('Monte uma matriz de seleção de sondas para os calibradores de bloco seco, com uma coluna por família de produto.') },
  { id: 'reescrita', expect: 'proposal', body: {
    version: 1, task: 'revise_selected_text', message: frameShortRewriteInstruction('Deixe mais profissional.'), history: [],
    target: { objectId: 'f12e7325-1f87-4ae8-8baf-3dde17059b37', text: 'Nossos instrumentos são bons e funcionam bem na fábrica' },
  } },
];

function inMemoryLedger() {
  const entries = [];
  return {
    entries,
    async reserve(attempt) {
      const microusd = composerReservationMicrousd(ledgerKind, attempt);
      entries.push({ attempt, reservedMicrousd: microusd, settledMicrousd: null });
      return { id: 'probe-' + entries.length, microusd, ledger: ledgerKind };
    },
    async settle(id, amount) { entries[Number(id.slice(6)) - 1].settledMicrousd = amount; },
  };
}
function describeReply(reply) {
  if (reply.status === 'clarification') return { status: 'clarification', questionChars: reply.question.length };
  if ('revisedText' in reply) return { status: 'proposal', revisedChars: reply.revisedText.length, hasDigits: /\p{Number}/u.test(reply.revisedText) };
  return { status: 'proposal', summaryChars: reply.summary.length, pages: reply.pages.map(page => page.type + ': ' + page.heading +
    (page.table ? ` [${page.table.design ?? 'comparison'} ${page.table.columns.length}x${page.table.rowLabels.length + 1}]` : '')) };
}

const only = option('only')?.split(',');
const custom = option('message');
const cases = custom ? [{ id: 'custom', expect: 'any', body: compose(custom) }]
  : PROBE_CASES.filter(item => !only || only.includes(item.id));
const results = [];
for (const item of cases) {
  const request = parseComposerRequest(item.body);
  if (!request || request.task === 'status') { results.push({ id: item.id, pass: false, error: 'INVALID_REQUEST (parser)' }); continue; }
  const ledger = inMemoryLedger();
  const attempts = [];
  const started = Date.now();
  const result = await runComposerGeneration({ request, key, ledger, fetcher: (url, init) => fetch(url, init),
    onAttempt: report => attempts.push({ attempt: report.attempt, http: report.httpStatus, finish: report.finishReason,
      outcome: report.outcome, maxOut: report.maxOutputTokens, inTokens: report.usage?.inputTokens ?? report.countedInputTokens,
      outTokens: report.usage?.outputTokens ?? null, reservedMicrousd: report.reservedMicrousd,
      settledMicrousd: report.settledMicrousd, ms: report.ms }) });
  const described = result.ok ? describeReply(result.reply) : null;
  const pass = result.ok && (item.expect === 'any' || described.status === item.expect) &&
    (!item.needsTable || (described.pages ?? []).some(page => page.includes('['))) && !described.hasDigits;
  results.push({ id: item.id, expect: item.expect, pass, ms: Date.now() - started,
    ...(result.ok ? { reply: described, attempts: result.attempts, estimatedUsd: result.usage.estimatedUsd }
      : { error: result.code + (result.reason ? ':' + result.reason : ''), httpStatus: result.status }),
    calls: attempts });
}

console.log(`Modelo ${COMPOSER_MODEL} · orçamento ${ledgerKind} · reserva por chamada ${composerReservationMicrousd(ledgerKind, 'first')} µUSD`);
for (const result of results) {
  console.log(`${result.pass ? 'OK  ' : 'FALHA'} ${result.id.padEnd(17)} ${String(result.ms).padStart(6)} ms  ` +
    (result.reply ? JSON.stringify(result.reply) : result.error));
  for (const call of result.calls ?? []) console.log('       ' + JSON.stringify(call));
}
const passed = results.filter(result => result.pass).length;
console.log(`${passed}/${results.length} casos conforme o esperado.`);
const out = option('json');
if (out) writeFileSync(out, JSON.stringify({ model: COMPOSER_MODEL, ledger: ledgerKind, at: new Date().toISOString(), results }, null, 2));
process.exit(passed === results.length ? 0 : 1);
