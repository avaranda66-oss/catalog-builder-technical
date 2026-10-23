/**
 * REAL Gemini probe of the conversation that edits (FR-72). Not part of the
 * unit suite (tests/setup.ts blocks every network call there, on purpose).
 *
 * It runs the SAME code as production: the outline of the open page, the
 * composer contract (prompt, bounded schema, normalization, server checks,
 * repair attempt) and the browser planner. Only Supabase is replaced by an
 * in-memory budget ledger. The key is read from the environment and never
 * printed. Results go to EDIT_INTENT_LIVE_OUT (outside the repository).
 *
 *   EDIT_INTENT_LIVE=1 GEMINI_API_KEY=... EDIT_INTENT_LIVE_OUT=D:/tmp-proofs/edit-intent-live.json \
 *     npx vitest run tests/vnext/ai-catalog/edit-intent-live.test.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDocumentSession } from '../src/vnext/application';
import type { CatalogDocument } from '../src/vnext/domain';
import {
  COMPOSER_MODEL, composerReservationMicrousd, parseComposerRequest, runComposerGeneration, type ComposerLedgerPort,
} from '../src/vnext/ai-catalog/composer-contract';
import { EditIntentReplySchema, planEditIntents, prepareEditIntentRequest } from '../src/vnext/ai-catalog/edit-intents';
import { normalizeEditIntentReply, verifyEditIntentShape } from '../src/vnext/ai-catalog/edit-intent-contract';

const CEILING_USD = 0.4;
const ONLY = (process.env.EDIT_INTENT_LIVE_ONLY ?? '').split(',').filter(Boolean);

type Case = { id: string; message: string; expect: string; pass: (r: Result) => boolean };
type Result = {
  status: string;
  intents: { kind: string; hint?: string; text?: string }[];
  blocked: { kind: string; hint?: string; code: string }[];
  items: { title: string; target: string; after?: string; confirm?: readonly string[]; dropped?: readonly string[] }[];
  planBlocked: string[];
  question?: string;
};
const kinds = (r: Result) => r.intents.map(intent => intent.kind);
const CASES: Case[] = [
  { id: 'titulo', message: 'Troque o título da capa para PCON-Y18', expect: 'set_text no título "PCON-Y18"; "18" destacado para conferir',
    pass: r => r.items.length === 1 && r.intents[0]?.hint === 'titulo' && r.items[0].after === 'PCON-Y18' && (r.items[0].confirm ?? []).includes('18') },
  { id: 'tabela-letra', message: 'Deixe a tabela de especificações com letra maior', expect: 'não há tabela na capa: pergunta ou recusa, nada aplicado',
    pass: r => r.status !== 'proposal' || r.items.length === 0 },
  { id: 'traduzir', message: 'Traduza esta página para o inglês', expect: 'translate_text nos textos da capa; números iguais aos originais',
    pass: r => r.items.length >= 8 && r.items.every(item => item.title.startsWith('Traduzir')) &&
      !r.planBlocked.some(reason => /número/.test(reason)) },
  { id: 'faixa-cor', message: 'Mude a cor da faixa para azul claro', expect: 'ambíguo (fundo azul, divisa, pílulas de faixa): pergunta; ou set_color num polígono do fundo',
    pass: r => r.status === 'clarification' || (r.items.length >= 1 && kinds(r).every(kind => kind === 'set_color')) },
  { id: 'apagar-p4', message: 'Apague a página 4', expect: 'delete_page p4',
    pass: r => r.items.length === 1 && r.items[0].title === 'Apagar a página' && r.items[0].target.startsWith('Página 4') },
  { id: 'foto', message: 'Aumente a foto do produto', expect: 'resize larger na foto',
    pass: r => r.items.length === 1 && r.intents[0]?.hint === 'foto' && r.items[0].title === 'Aumentar o tamanho' },
  { id: 'negrito', message: 'Deixe o subtítulo em negrito', expect: 'text_weight bold no subtítulo',
    pass: r => r.items.length === 1 && r.intents[0]?.hint === 'subtitulo' && r.items[0].title === 'Deixar em negrito' },
  { id: 'inventar', message: 'Coloque a exatidão do PCON-Y18 no rodapé', expect: 'recusa: exigiria inventar valor técnico',
    pass: r => r.status === 'refusal' || (r.status === 'clarification') || r.items.length === 0 },
  { id: 'letra-menor', message: 'Diminua a letra do texto de destaque', expect: 'text_size smaller no destaque',
    pass: r => r.items.length === 1 && r.intents[0]?.hint === 'destaque' && r.items[0].title === 'Diminuir a letra' },
  { id: 'faixa-valor', message: 'Mude a faixa de 0 a 360 psi para 0 a 400 psi', expect: 'set_text na pílula "0 a 360 psi" → "0 a 400 psi"; 400 destacado, 360 sai',
    pass: r => r.items.length === 1 && r.intents[0]?.hint === 'pilula-a2' && r.items[0].after === '0 a 400 psi' &&
      (r.items[0].confirm ?? []).includes('400') && (r.items[0].dropped ?? []).includes('360') },
];

/** Which part of a model answer broke the contract (keys and short texts only). */
function contractDiagnostic(output: unknown) {
  const normalized = normalizeEditIntentReply(output) as Record<string, unknown> | null;
  if (!normalized || typeof normalized !== 'object') return { notObject: true };
  const intents = Array.isArray(normalized.intents) ? normalized.intents : [];
  return {
    keys: Object.keys(normalized).sort(), status: normalized.status,
    summaryLength: typeof normalized.summary === 'string' ? normalized.summary.length : null,
    intents: intents.length,
    failing: intents.filter(intent => !verifyEditIntentShape({ status: 'proposal', summary: 'diagnóstico', intents: [intent] }))
      .slice(0, 5).map(intent => JSON.parse(JSON.stringify(intent, (key, value) => key === 'text' && typeof value === 'string' ? value.slice(0, 60) : value))),
  };
}

function rawFor(output: unknown, hints: (string | undefined)[], hint: (ref?: string) => string | undefined) {
  const out = output as { intents?: { kind?: string; ref?: string; text?: string }[] } | null;
  return (out?.intents ?? []).filter(item => hints.includes(hint(item.ref) ?? item.ref))
    .map(item => ({ kind: item.kind, hint: hint(item.ref) ?? item.ref, text: item.text?.slice(0, 100) }));
}

function inMemoryLedger(): ComposerLedgerPort & { spentMicrousd: () => number } {
  let settled = 0, serial = 0;
  return {
    async reserve(attempt) {
      const microusd = composerReservationMicrousd('settled', attempt);
      return { id: 'probe-' + ++serial, microusd, ledger: 'settled' };
    },
    async settle(_id, actual) { settled += actual; },
    spentMicrousd: () => settled,
  };
}

async function main() {
  {
    if ((process.env.GEMINI_API_KEY ?? '').length < 12) {
      console.error('Defina a variável de ambiente GEMINI_API_KEY (a chave nunca é impressa).');
      process.exit(2);
    }
    const pcon = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/examples/presys-capa-pcon-hibrido.catalog.json'), 'utf8')) as CatalogDocument;
    const ledger = inMemoryLedger();
    const report: unknown[] = [];
    let hits = 0;
    for (const probe of CASES.filter(entry => !ONLY.length || ONLY.includes(entry.id))) {
      // Same document for every request: the PCON cover plus three blank pages (so "página 4" exists).
      const session = createDocumentSession(structuredClone(pcon), { createId: () => crypto.randomUUID() });
      for (let i = 0; i < 3; i++) session.execute({ type: 'page.add' });
      const snapshot = session.getSnapshot();
      const { request, outline } = prepareEditIntentRequest(snapshot.document, probe.message, [],
        { activePageId: snapshot.document.pages[0].id });
      const parsed = parseComposerRequest(JSON.parse(JSON.stringify(request)));
      if (parsed?.task !== 'edit_intent') throw new Error('PROBE_REQUEST_REJECTED');
      const started = Date.now();
      const attempts: unknown[] = [];
      const providerErrors: string[] = [];
      let modelOutput: unknown = null;
      const run = await runComposerGeneration({ request: parsed as never, key: process.env.GEMINI_API_KEY!, ledger,
        fetcher: async (url, init) => {
          const response = await fetch(url, init);
          // Diagnostics only: Google's error message (never the key, never the prompt).
          if (response.ok && url.endsWith(':generateContent')) {
            const envelope = await response.clone().json().catch(() => null) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
            try { modelOutput = JSON.parse(envelope?.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('') ?? 'null'); } catch { modelOutput = null; }
          }
          if (!response.ok) {
            const body = await response.clone().json().catch(() => null) as { error?: { message?: string } } | null;
            providerErrors.push(response.status + ' ' + String(body?.error?.message ?? '').slice(0, 300));
          }
          return response;
        }, onAttempt: attempt => attempts.push({ attempt: attempt.attempt,
          outcome: attempt.outcome, finish: attempt.finishReason, usage: attempt.usage, settled: attempt.settledMicrousd }) });
      const hint = (ref?: string) => ref ? outline.outline.pages.flatMap(page => page.detail ?? []).find(o => o.ref === ref)?.hint : undefined;
      let result: Result;
      if (!run.ok) {
        result = { status: 'error:' + run.code + (run.reason ? ':' + run.reason : ''), intents: [], blocked: [], items: [], planBlocked: [],
          ...(run.reason === 'CONTRACT' ? { contractDiagnostic: contractDiagnostic(modelOutput) } : {}) } as Result;
      } else {
        const reply = EditIntentReplySchema.parse(run.reply);
        const outcome = planEditIntents(snapshot.document, snapshot.localSequence, outline, reply, [request.message]);
        result = {
          status: reply.status,
          intents: reply.status === 'proposal' ? reply.intents.map(intent => ({ kind: intent.kind,
            ...('target' in intent ? { hint: hint(intent.target) } : { hint: intent.page }),
            ...('text' in intent ? { text: intent.text.slice(0, 80) } : {}) })) : [],
          blocked: reply.status === 'proposal' ? reply.blocked.map(entry => ({ kind: entry.kind, hint: hint(entry.target) ?? entry.page, code: entry.code })) : [],
          items: outcome.status === 'plan' ? outcome.plan.items.map(item => ({ title: item.title, target: item.target,
            ...(item.after ? { after: item.after.slice(0, 80) } : {}), ...(item.confirm ? { confirm: item.confirm } : {}),
            ...(item.dropped ? { dropped: item.dropped } : {}) })) : [],
          planBlocked: outcome.status === 'plan' ? outcome.plan.blocked.map(entry => entry.target + ': ' + entry.reason) : [],
          ...(reply.status === 'clarification' ? { question: reply.question } : reply.status === 'refusal' ? { question: reply.reason } : {}),
        };
      }
      const pass = probe.pass(result);
      if (pass) hits += 1;
      report.push({ id: probe.id, message: probe.message, expect: probe.expect, pass, ms: Date.now() - started,
        usage: run.ok ? run.usage : null, attempts, ...(providerErrors.length ? { providerErrors } : {}), ...result,
        // Diagnostics only (file outside the repository): what the model wrote for the intents that were refused.
        ...(result.blocked.length ? { rawBlocked: rawFor(modelOutput, result.blocked.map(entry => entry.hint), hint) } : {}) });
      console.log(probe.id.padEnd(14), pass ? 'ACERTO' : 'ERRO  ', result.status, kinds(result).join(','));
      if (ledger.spentMicrousd() / 1e6 > CEILING_USD) break;
    }
    const out = { model: COMPOSER_MODEL, at: new Date().toISOString(), hits, total: CASES.length,
      spentUsd: Number((ledger.spentMicrousd() / 1e6).toFixed(6)), cases: report };
    if (process.env.EDIT_INTENT_LIVE_OUT) writeFileSync(process.env.EDIT_INTENT_LIVE_OUT, JSON.stringify(out, null, 2));
    console.log(`acertos ${hits}/${report.length} · US$ ${out.spentUsd} · ${COMPOSER_MODEL}`);
  }
}
void main();
