// "Olhos do pai": medições e varreduras que as provas do grupo A usam para julgar a tela como uma
// pessoa de 60 anos, não técnica, julgaria. Só leitura: nada aqui muda a página.
//
//   measure(locator)          → { text, fontPx, heightPx, widthPx, inViewport }
//   scanJargon(text)          → lista de termos técnicos/ingleses encontrados (vazio = limpo)
//   pendingStep(j, name, why) → passo PENDENTE (ok: null): nunca verde, nunca vermelho
//   findingStep(j, name, detail, {id, severity, knownFR}) → ACHADO de usabilidade como passo vermelho, com metadados
//   finishJourney(j, log, …)  → 'fail' se algum passo falhou; senão 'pending' se houver pendência; senão 'pass'
//   finishJourneyGraded(j, log, …) → igual, mas achados P2/P3 não derrubam a jornada (ficam vermelhos no JSON)
import { writeJourneyResult } from '../lib.mjs';

/** Termos que o pai não deveria ver (lista do roteiro de usabilidade + lib.JARGON). */
export const EXTENDED_JARGON = /\b(?:TSV|JSON|CAS|revision|IndexedDB|eixo|eixos|inspector|placeholder|overflow|assets?|upload|undo|redo|commit|dock|presets?|mutationId|openSessionId|repository|database|localStorage|undefined|null|NaN|debounce|snapshot|envelope|payload|bucket|token|lineage|scope|runtime|render|layout|hash|uuid)\b/gi;

/** Palavras inglesas soltas (sensível a maiúsculas: "Open" sim, "open" dentro de uma URL não). */
export const EXTENDED_ENGLISH = /\b(?:Save|Saved|Saving|Cancel|Delete|Loading|Untitled|Open|Close|Search|Settings|Error|Warning|Retry|Submit|Upload|Download|New catalog|Archive|Archived|Duplicate|Rename|Library|Catalog|Builder|Edit|Insert|Table|Image|Text|Page|Pages|Zoom|Fit|Undo|Redo|Publish|Preview|Export)\b/g;

/** Alvos de clique menores que isto são difíceis para o pai. */
export const MIN_TARGET_PX = 24;
/** Texto corrido menor que isto exige óculos de leitura. */
export const MIN_BODY_FONT_PX = 13;

/**
 * Tamanho da fonte, altura/largura do alvo e se está dentro da janela sem rolar.
 * Mede o primeiro elemento do locator.
 */
export async function measure(locator) {
  return locator.first().evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      text: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 80),
      fontPx: Math.round(parseFloat(style.fontSize) * 10) / 10,
      heightPx: Math.round(rect.height),
      widthPx: Math.round(rect.width),
      top: Math.round(rect.top),
      inViewport: rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw,
      fullyVisible: rect.top >= 0 && rect.left >= 0 && rect.bottom <= vh && rect.right <= vw,
    };
  });
}

/** Mede vários locators de uma vez: { rótulo: medida }. Locators ausentes viram null. */
export async function measureAll(entries) {
  const out = {};
  for (const [label, locator] of Object.entries(entries)) {
    out[label] = (await locator.count()) > 0 ? await measure(locator) : null;
  }
  return out;
}

/** Devolve os termos encontrados (sem repetir), cada um com um trecho de contexto. */
export function scanJargon(text, { allow = [] } = {}) {
  const found = new Map();
  for (const pattern of [EXTENDED_JARGON, EXTENDED_ENGLISH]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const term = match[0];
      if (allow.some((ok) => (ok instanceof RegExp ? ok.test(term) : ok === term))) continue;
      const key = term.toLowerCase();
      if (found.has(key)) continue;
      const start = Math.max(0, match.index - 30);
      const context = text.slice(start, match.index + term.length + 30).replace(/\s+/g, ' ').trim();
      found.set(key, { term, context });
    }
  }
  return [...found.values()];
}

/** "mm" só é problema quando aparece sem o que explica (A4, página, largura, altura, posição…). */
export function unexplainedMm(text) {
  // A screen that says once what "mm" means ("mm = milímetros") explains every field unit next to it.
  if (/\bmm\s*=\s*milímetros/i.test(text)) return [];
  const hits = [];
  const pattern = /[^\n]{0,40}\bmm\b[^\n]{0,20}/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const snippet = match[0];
    if (/A4|página|largura|altura|posição|tamanho|\b[XYLA]\b/.test(snippet)) continue;
    hits.push(snippet.trim());
  }
  return hits;
}

/** Passo pendente: depende de algo que ainda não existe nesta base (Onda 2/4). Nunca conta como verde. */
export function pendingStep(j, name, why) {
  j.steps.push({ name, ok: null, pending: true, detail: why, atMs: null });
  console.log(`  [PEND]   ${name} — ${why}`);
}

/** Termina a jornada: fail > pending > pass. */
export async function finishJourney(j, log, { extra = {} } = {}) {
  const failed = j.steps.some((step) => step.ok === false);
  const pendings = j.steps.filter((step) => step.pending).map((step) => step.detail);
  const pending = !failed && pendings.length > 0 ? pendings.join(' | ') : false;
  return j.finish(log, { pending, extra: { pendingSteps: pendings, ...extra } });
}

/** Quantos cliques a prova deu até aqui (contador simples que as provas incrementam). */
export function clickCounter() {
  const counts = {};
  return {
    counts,
    async click(task, locator, options) {
      counts[task] = (counts[task] ?? 0) + 1;
      await locator.click(options);
    },
  };
}

/** Espera até `predicate()` ser verdadeiro, devolvendo quanto tempo levou (ms) ou -1 se estourou. */
export async function waitMs(predicate, { timeout = 10000, every = 50 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await predicate()) return Date.now() - startedAt;
    await new Promise((resolve) => setTimeout(resolve, every));
  }
  return -1;
}

/**
 * Achado de usabilidade reproduzível, registrado como passo VERMELHO (ok: false) com metadados para o
 * checkpoint: id ('A-01'), severidade ('P0'..'P3') e FR conhecida (ou null). Nunca fica verde.
 */
export function findingStep(j, name, detail, { id, severity = 'P3', knownFR = null } = {}) {
  j.steps.push({ name, ok: false, finding: { id, severity, knownFR }, detail, atMs: null });
  console.log(`  [ACHADO ${severity}] ${name} — ${detail}${knownFR ? ` (conhecido: ${knownFR})` : ''}`);
}

export const STATUS_RULE = 'fail = passo funcional vermelho ou achado P0/P1; pending = só passos pendentes (Onda 2/4); '
  + 'pass = critério de pronto cumprido. Achados P2/P3 ficam vermelhos em steps/findingSteps sem mudar o estado.';

/**
 * Termina a jornada com nota: 'fail' se um passo funcional falhou ou um achado P0/P1 foi visto; senão
 * 'pending' se houver passo pendente; senão 'pass'. Achados P2/P3 continuam vermelhos no JSON
 * (steps + findingSteps) — a regra está gravada em `statusRule` para quem ler o resultado.
 */
export async function finishJourneyGraded(j, log, { extra = {} } = {}) {
  const functionalFailed = j.steps.some((step) => step.ok === false && !step.finding);
  const severeFinding = j.steps.some((step) => step.finding && /^P[01]$/.test(step.finding.severity));
  const pendings = j.steps.filter((step) => step.pending).map((step) => step.detail);
  const status = functionalFailed || severeFinding ? 'fail' : pendings.length > 0 ? 'pending' : 'pass';
  const findingSteps = j.steps.filter((step) => step.finding).map((step) => ({ ...step.finding, name: step.name, detail: step.detail }));
  const path = await writeJourneyResult(j.name, {
    status,
    title: j.title,
    steps: j.steps,
    evidence: j.evidence,
    findings: j.findings,
    log,
    extra: { pendingReason: pendings.join(' | ') || undefined, pendingSteps: pendings, findingSteps, statusRule: STATUS_RULE, ...extra },
  });
  console.log(`${j.name}: ${status.toUpperCase()} (${findingSteps.length} achado(s), ${pendings.length} pendência(s)) → ${path}`);
  return status;
}

/** Mensagens do servidor de desenvolvimento (vite/HMR) quando outro agente edita src/ durante a prova: não são do aplicativo. */
export const DEV_SERVER_NOISE = /^\[hmr\]|^\[vite\]|Failed to load resource: the server responded with a status of 500|Failed to fetch dynamically imported module|ERR_ABORTED|createRoot\(\) on a container that has already been passed to createRoot/;

/** Separa erros de console do aplicativo (`appErrors`) do ruído do servidor de desenvolvimento (`devServerNoise`). */
export function classifyConsole(log) {
  const errors = log.console.filter((entry) => entry.type === 'error');
  return {
    appErrors: errors.filter((entry) => !DEV_SERVER_NOISE.test(entry.text)),
    devServerNoise: errors.filter((entry) => DEV_SERVER_NOISE.test(entry.text)),
  };
}
