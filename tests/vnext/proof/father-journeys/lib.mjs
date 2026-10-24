// Utilitários das provas "father-journeys" (Playwright + vite dev server local).
// Sem rede, sem produção: tudo roda em http://127.0.0.1:5190 contra fixtures/father-harness.html.
import { realpathSync, statfsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../../../..');
export const HOST = '127.0.0.1';
export const PORT = 5190;
export const DEFAULT_BASE_URL = `http://${HOST}:${PORT}`;
export const HARNESS_PATH = '/tests/vnext/proof/father-journeys/fixtures/father-harness.html';
export const OUTPUT_ROOT = resolve(ROOT, 'scratch/father-journeys');
export const RUN_ID = process.env.FATHER_RUN_ID || `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}$/.test(RUN_ID)) throw new Error('FATHER_RUN_ID deve ser um nome simples, sem diretórios.');
export const EXECUTION_ID = process.env.FATHER_EXECUTION_ID || randomUUID();
export const OUT = resolve(OUTPUT_ROOT, 'runs', RUN_ID);
export const SHOTS = resolve(OUT, 'shots');
export const RESULTS = resolve(OUT, 'results');
const IDENTITY_PATH = '/__father-journeys/identity.json';
const SERVICE = 'father-journeys-v2';
const canonicalRoot = realpathSync(ROOT);
const startedAt = new Date().toISOString();
const gitRead = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const git = {
  head: gitRead('rev-parse', 'HEAD'),
  branch: gitRead('rev-parse', '--abbrev-ref', 'HEAD'),
  dirty: gitRead('status', '--porcelain', '--untracked-files=normal').length > 0,
};
let serverIdentity;
let browserVersion;

export function runMetadata() {
  return { id: RUN_ID, executionId: EXECUTION_ID, startedAt, root: canonicalRoot, git, nodeVersion: process.version, browserVersion, server: serverIdentity };
}

/** VP=1280 no ambiente troca a janela para 1280×720 (padrão 1366×768). */
export const VP = process.env.VP === '1280' ? { width: 1280, height: 720 } : { width: 1366, height: 768 };
export const VP_SUFFIX = process.env.VP === '1280' ? '@1280' : '';

/** Termos técnicos que nunca podem aparecer para o pai. */
export const JARGON = /\b(?:CAS|revision|IndexedDB|JSON|TSV|eixo|mutationId|openSessionId|repository|database|localStorage|undefined|null|NaN)\b/i;
/** Palavras em inglês que denunciam texto não traduzido (sensível a maiúsculas de propósito). */
export const ENGLISH = /\b(?:Save|Saved|Saving|Cancel|Delete|Loading|Untitled|Open|Close|Search|Settings|Error|Warning|Retry|Submit|Upload|Download|New catalog)\b/;

export const rel = (path) => relative(ROOT, path).split('\\').join('/');

let currentBaseUrl = (process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

function assertDiskAvailable() {
  const disk = statfsSync(ROOT);
  const freeBytes = disk.bavail * disk.bsize;
  if (freeBytes < 5 * 1024 ** 3) {
    throw new Error(`Menos de 5 GiB livres (${freeBytes} bytes): prova pesada interrompida antes de iniciar servidor/navegador.`);
  }
}

const sameRoot = (other) => typeof other === 'string' && (process.platform === 'win32'
  ? other.toLowerCase() === canonicalRoot.toLowerCase() : other === canonicalRoot);

async function verifyServer(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.pathname !== '/') {
    throw new Error('BASE_URL deve apontar à origem HTTP de um harness local.');
  }
  let identity;
  try {
    const response = await fetch(`${parsed.origin}${IDENTITY_PATH}`, { signal: AbortSignal.timeout(2500), cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    identity = await response.json();
  } catch (error) {
    throw new Error(`O servidor ${parsed.origin} não tem identidade verificável de father-journeys. Remova BASE_URL para iniciar um servidor próprio. ${error.message}`);
  }
  if (identity.service !== SERVICE || !sameRoot(identity.root) || identity.git?.head !== git.head
    || (process.env.FATHER_SERVER_ID && identity.serverId !== process.env.FATHER_SERVER_ID)) {
    throw new Error(`Servidor de outro worktree, commit ou execução em ${parsed.origin}; nenhum processo foi encerrado.`);
  }
  return identity;
}

/**
 * Inicia um Vite próprio; uma porta ocupada é preservada e o Vite escolhe a seguinte.
 * BASE_URL explícita só é aceita depois de verificar worktree, HEAD e identidade do servidor.
 * fs.allow inclui realpathSync(node_modules) porque node_modules é uma junção.
 */
export async function ensureServer() {
  assertDiskAvailable();
  const start = Date.now();
  if (process.env.BASE_URL) {
    serverIdentity = await verifyServer(currentBaseUrl);
    return { baseUrl: currentBaseUrl, reused: true, startedMs: 0, close: async () => {} };
  }
  const { createServer } = await import('vite');
  serverIdentity = { service: SERVICE, root: canonicalRoot, git, serverId: randomUUID(), startedAt: new Date().toISOString() };
  const server = await createServer({
    root: ROOT,
    plugins: [{
      name: 'father-journeys-identity',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== IDENTITY_PATH) { next(); return; }
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify(serverIdentity));
        });
      },
    }],
    server: {
      host: HOST,
      port: PORT,
      strictPort: false,
      fs: { allow: [ROOT, realpathSync(resolve(ROOT, 'node_modules'))] },
    },
    logLevel: 'error',
  });
  try { await server.listen(); }
  catch (error) { await server.close(); throw error; }
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') { await server.close(); throw new Error('Vite não abriu uma porta TCP local.'); }
  currentBaseUrl = `http://${HOST}:${address.port}`;
  return {
    baseUrl: currentBaseUrl,
    reused: false,
    startedMs: Date.now() - start,
    close: () => server.close(),
  };
}

export const baseUrl = () => currentBaseUrl;

/** Nome único de banco de recuperação para esta execução (evita herdar estado de outra prova). */
export function freshDb(prefix = 'father') {
  return `${prefix}_${process.pid}_${Date.now()}`;
}

export function harnessUrl({ db, user, ia, catalog } = {}, base = currentBaseUrl) {
  const query = new URLSearchParams();
  query.set('db', db ?? freshDb());
  if (user && user !== 'A') query.set('user', user);
  if (ia) query.set('ia', ia);
  if (catalog) query.set('catalog', catalog);
  return `${base}${HARNESS_PATH}?${query.toString()}`;
}

/** Liga a captura de console (error/warning), pageerror e diálogos de uma página ao log. */
export function observe(page, log) {
  page.on('console', (message) => {
    const type = message.type();
    if (type === 'error' || type === 'warning') log.console.push({ type, text: message.text().slice(0, 600) });
  });
  page.on('pageerror', (error) => log.pageErrors.push(String(error.message).slice(0, 600)));
  page.on('dialog', async (dialog) => {
    log.dialogs.push({ type: dialog.type(), message: dialog.message().slice(0, 300) });
    // O harness tem o mesmo aviso de "sair sem salvar" da produção; aceitar deixa a navegação seguir.
    if (dialog.type() === 'beforeunload') await dialog.accept().catch(() => {});
    else await dialog.dismiss().catch(() => {});
  });
}

export async function launch({ width = VP.width, height = VP.height } = {}) {
  assertDiskAvailable();
  const browser = await chromium.launch({ headless: true });
  browserVersion = browser.version();
  const context = await browser.newContext({
    viewport: { width, height },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    deviceScaleFactor: 1,
    acceptDownloads: false,
  });
  const log = { console: [], pageErrors: [], dialogs: [] };
  // Investigação do autosave (opt-in): rastreio no harness, latência no repositório simulado e CPU lenta.
  if (AUTOSAVE_TRACE) await context.addInitScript(() => {
    window.__AUTOSAVE_TRACE_ENABLED__ = true;
    // React commit / passive-effect timing through the DevTools hook (react-refresh wraps it; nothing else changes).
    const events = (window.__AUTOSAVE_TRACE_EVENTS__ = []);
    const now = () => Math.round(performance.now() * 10) / 10;
    const pd = () => { try { return window.__AUTOSAVE_PD__ ? window.__AUTOSAVE_PD__() : null; } catch { return 'erro'; } };
    let commits = 0;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map(),
      supportsFiber: true,
      isDisabled: false,
      inject(renderer) { const id = this.renderers.size + 1; this.renderers.set(id, renderer); return id; },
      checkDCE() {},
      onScheduleFiberRoot() {},
      onCommitFiberUnmount() {},
      onCommitFiberRoot(_id, _root, priority) {
        commits += 1;
        const value = pd();
        window.__AUTOSAVE_LAST_COMMIT_PD__ = value;
        if (window.__AUTOSAVE_PD__ && events.length < 20000) events.push({ t: now(), ev: 'react-commit', n: commits, prio: priority ?? null, pd: value });
      },
      onPostCommitFiberRoot() {
        if (window.__AUTOSAVE_PD__ && events.length < 20000) events.push({ t: now(), ev: 'react-passive', n: commits, pd: pd() });
        try { window.__AUTOSAVE_ON_PASSIVE__?.(window.__AUTOSAVE_LAST_COMMIT_PD__); } catch { /* investigação */ }
      },
    };
  });
  if (SAVE_LATENCY_MS > 0) await context.addInitScript((ms) => { window.__SAVE_LATENCY_MS__ = ms; }, SAVE_LATENCY_MS);
  if (process.env.PD_POLL === '1') await context.addInitScript(() => { window.__PD_POLL__ = true; });
  if (process.env.FORCE_RACE) await context.addInitScript((mode) => { window.__FORCE_RACE__ = mode; }, process.env.FORCE_RACE);
  const page = await context.newPage();
  if (CPU_THROTTLE > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  }
  observe(page, log);
  // Abas abertas depois (segundo "funcionário") entram no mesmo log.
  context.on('page', (other) => observe(other, log));
  return { browser, context, page, log, viewport: { width, height } };
}

export const consoleErrors = (log) => log.console.filter((entry) => entry.type === 'error');
export const consoleWarnings = (log) => log.console.filter((entry) => entry.type === 'warning');

export async function shot(page, name, options = {}) {
  await mkdir(SHOTS, { recursive: true });
  const path = resolve(SHOTS, `${name}${VP_SUFFIX}.png`);
  await page.screenshot({ path, ...options });
  return rel(path);
}

export async function aria(page, locator) {
  return (locator ?? page.locator('body')).ariaSnapshot();
}

export const state = (page) => page.evaluate(() => window.__FATHER__.state());

const AUTOSAVE_TRACE = process.env.AUTOSAVE_TRACE === '1';
const SAVE_LATENCY_MS = Number(process.env.SAVE_LATENCY_MS || 0);
const CPU_THROTTLE = Number(process.env.CPU_THROTTLE || 1);
let traceDumps = 0;

/**
 * Investigação do autosave (AUTOSAVE_TRACE=1): grava os eventos do rastreio do harness e uma sonda do estado
 * (documento sujo de verdade? timer armado? rascunho pendente?). Com nudge, republica o workspace e sonda de novo.
 */
export async function dumpAutosaveTrace(page, label, { nudge = false } = {}) {
  if (!AUTOSAVE_TRACE) return null;
  const journeyName = (process.argv[1] ?? 'journey').split(/[\\/]/).pop().replace(/\.mjs$/, '');
  const data = await page.evaluate(() => {
    const trace = window.__AUTOSAVE_TRACE__;
    return trace ? { probe: trace.probe(), events: trace.events.slice() } : null;
  }).catch((error) => ({ error: String(error) }));
  let afterNudge = null;
  if (nudge && data && !data.error) {
    await page.evaluate(() => window.__AUTOSAVE_TRACE__?.nudge()).catch(() => {});
    await page.waitForTimeout(3000);
    afterNudge = await page.evaluate(() => ({
      probe: window.__AUTOSAVE_TRACE__?.probe(),
      tail: window.__AUTOSAVE_TRACE__?.events.slice(-40),
    })).catch((error) => ({ error: String(error) }));
  }
  const dir = resolve(OUT, 'autosave-trace');
  await mkdir(dir, { recursive: true });
  traceDumps += 1;
  const path = resolve(dir, `${journeyName}${VP_SUFFIX}-${String(traceDumps).padStart(2, '0')}-${label}.json`);
  await writeFile(path, JSON.stringify({ label, journey: journeyName, cpuThrottle: CPU_THROTTLE, saveLatencyMs: SAVE_LATENCY_MS, ...data, afterNudge }, null, 1));
  return path;
}

export async function waitSaved(page, timeout = 15000) {
  try {
    await page.waitForFunction(() => {
      const runtime = window.__FATHER__?.state().runtime;
      return Boolean(runtime) && runtime.dirty === false && runtime.savePhase === 'idle';
    }, null, { timeout });
  } catch (error) {
    const shotPath = AUTOSAVE_TRACE ? await shot(page, `autosave-parado-${traceDumps + 1}`).catch(() => null) : null;
    const diagnostic = await page.evaluate(() => {
      const snapshot = window.__FATHER__?.state();
      return {
        dirty: snapshot?.runtime?.dirty, savePhase: snapshot?.runtime?.savePhase, saveLabel: snapshot?.runtime?.saveLabel,
        saveDispatchCount: snapshot?.saveDispatchCount,
        textEditorOpen: Boolean(document.querySelector('[data-text-edit-session]')),
        cellEditorOpen: Boolean(document.querySelector('[data-cell-inline-editor]')),
        focusedInspectorField: document.activeElement?.getAttribute('data-inspector-field'),
      };
    }).catch(() => ({ pageUnavailable: true }));
    // Depois do diagnóstico original: o nudge do rastreio muda o estado (só para a investigação).
    await dumpAutosaveTrace(page, 'waitSaved-falhou', { nudge: true }).catch(() => {});
    if (shotPath) diagnostic.shot = shotPath;
    throw new Error(`Salvamento não confirmado em ${timeout} ms: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
}

export async function waitLibrary(page, timeout = 60000) {
  await page.locator('[data-catalog-library]').waitFor({ timeout });
  await page.getByRole('heading', { name: 'Meus catálogos', exact: true }).waitFor({ timeout });
}

export async function waitEditor(page, timeout = 60000) {
  await page.locator('[data-vnext-shell]').waitFor({ timeout });
  await page.waitForFunction(() => window.__FATHER__?.state().runtime !== null, null, { timeout });
}

/**
 * Na biblioteca: "Novo catálogo" -> nome -> opção de modelo -> editor aberto e salvo.
 * Devolve o id do catálogo criado.
 */
export async function createCatalog(page, { name = 'Catálogo de teste', starter = 'Ficha técnica essencial' } = {}) {
  await waitLibrary(page);
  await page.getByRole('button', { name: 'Novo catálogo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo catálogo' });
  await dialog.waitFor();
  if (name) await dialog.getByRole('textbox', { name: 'Nome do catálogo' }).fill(name);
  await dialog.getByRole('button', { name: starter, exact: true }).click();
  await waitEditor(page);
  await waitSaved(page);
  return (await state(page)).runtime.catalogId;
}

/** Texto visível de um trecho (ou do body), para checar português/jargão. */
export async function visibleText(page, selector) {
  return (selector ? page.locator(selector) : page.locator('body')).innerText();
}

/** Normalizes the historical result formats without counting the same finding step twice. */
export function collectFindings(result) {
  const candidates = [
    ...(result.findingSteps ?? []),
    ...(result.softFindings ?? []),
    ...(result.steps ?? []).filter((step) => step.finding).map((step) => ({
      ...(typeof step.finding === 'object' ? step.finding : { severity: step.finding }),
      name: step.name, detail: step.detail,
    })),
    ...(result.findings ?? []),
  ];
  const found = new Map();
  for (const finding of candidates) {
    const name = finding.name ?? finding.title ?? finding.text ?? '';
    const key = finding.id || name;
    if (!key) continue;
    const severity = ({ critical: 'P0', high: 'P1', medium: 'P2', low: 'P3' })[finding.severity] ?? finding.severity ?? 'P3';
    if (!found.has(key)) found.set(key, { ...finding, name, severity });
  }
  return [...found.values()];
}

/** A declared dependency cannot override an observed failure or a P0/P1 finding. */
export function assessJourneyStatus(result) {
  const functionalFailures = (result.steps ?? []).filter((step) => step.ok === false && !step.finding && !step.pending);
  if (!['pass', 'pending', 'fail'].includes(result.status) || result.status === 'fail' || functionalFailures.length
    || collectFindings(result).some((finding) => /^P[01]$/.test(finding.severity))) return 'fail';
  return result.status === 'pending' || result.pendingReason || (result.steps ?? []).some((step) => step.pending) ? 'pending' : 'pass';
}

export async function writeJourneyResult(journey, { status, title, steps = [], evidence = [], findings = [], log, extra = {} }) {
  await mkdir(RESULTS, { recursive: true });
  const path = resolve(RESULTS, `${journey}${VP_SUFFIX}.json`);
  const payload = {
    journey,
    title,
    viewport: VP,
    at: new Date().toISOString(),
    steps,
    evidence,
    findings,
    ...extra,
    status: assessJourneyStatus({ ...extra, status, steps, findings }),
    findingSummary: collectFindings({ ...extra, steps, findings }),
    run: runMetadata(),
    log: log ? {
      consoleErrors: consoleErrors(log),
      consoleWarnings: consoleWarnings(log),
      pageErrors: log.pageErrors,
      dialogs: log.dialogs,
    } : undefined,
  };
  await writeFile(path, JSON.stringify(payload, null, 2));
  return rel(path);
}

/**
 * Pequeno acumulador de passos de uma jornada.
 *   const j = journey('j00-smoke', 'Abrir a biblioteca e criar um catálogo');
 *   j.step('nome do passo', condicao, 'detalhe');
 *   j.addEvidence(await shot(page, 'j00-01'));
 *   j.finding('o que o pai veria de errado', { severity: 'medium', where: 'biblioteca' });
 *   await j.finish(log);           // grava results/<jornada>.json e devolve 'pass' | 'fail'
 *   await j.finish(log, { pending: 'depende de FR-xx' });  // marca 'pending' (não falha)
 */
export function journey(name, title) {
  const startedAt = Date.now();
  const steps = [];
  const evidence = [];
  const findings = [];
  return {
    name,
    title,
    steps,
    evidence,
    findings,
    step(stepName, ok, detail) {
      const passed = Boolean(ok);
      steps.push({ name: stepName, ok: passed, detail: detail ?? null, atMs: Date.now() - startedAt });
      console.log(`  ${passed ? '[ok]    ' : '[FALHOU]'} ${stepName}${detail && !passed ? ` — ${detail}` : ''}`);
      return passed;
    },
    addEvidence(path) {
      evidence.push(path);
      return path;
    },
    finding(text, { severity = 'medium', where = '' } = {}) {
      findings.push({ text, severity, where });
    },
    async finish(log, { pending = false, extra = {} } = {}) {
      const status = assessJourneyStatus({ ...extra, status: pending ? 'pending' : 'pass', pendingReason: pending, steps, findings });
      const path = await writeJourneyResult(name, {
        status,
        title,
        steps,
        evidence,
        findings,
        log,
        extra: { durationMs: Date.now() - startedAt, pendingReason: pending || undefined, ...extra },
      });
      console.log(`${name}: ${status.toUpperCase()} em ${Date.now() - startedAt} ms → ${path}`);
      return status;
    },
  };
}
