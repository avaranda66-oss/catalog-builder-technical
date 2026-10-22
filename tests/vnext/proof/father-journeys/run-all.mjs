// Roda em série todas as jornadas j*-*.mjs desta pasta (um Chromium por vez), agrega
// scratch/father-journeys/summary.json e imprime uma tabela.
// Exit code 1 só se alguma jornada estiver 'fail' ('pending' não falha).
//   node tests/vnext/proof/father-journeys/run-all.mjs            # todas
//   node tests/vnext/proof/father-journeys/run-all.mjs j00 j03    # só as que começam por esses prefixos
//   VP=1280 node tests/vnext/proof/father-journeys/run-all.mjs    # janela 1280×720
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUT, OUTPUT_ROOT, RESULTS, ROOT, RUN_ID, VP, VP_SUFFIX, assessJourneyStatus, collectFindings, ensureServer, rel, runMetadata } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const prefixes = process.argv.slice(2);
const files = (await readdir(HERE))
  .filter((file) => /^j(?:\d+|ia\d+)[^/\\]*\.mjs$/.test(file))
  .filter((file) => prefixes.length === 0 || prefixes.some((prefix) => file.startsWith(prefix)))
  .sort();

if (files.length === 0) {
  console.error('Nenhuma jornada j*-*.mjs encontrada em', HERE);
  process.exit(1);
}

const runStartedAt = Date.now();
const server = await ensureServer();
console.log(`Servidor: ${server.baseUrl} (${server.reused ? 'reutilizado' : `iniciado em ${server.startedMs} ms`}) · janela ${VP.width}×${VP.height}`);

function runJourney(file, executionId) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [resolve(HERE, file)], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, BASE_URL: server.baseUrl, FATHER_RUN_ID: RUN_ID, FATHER_EXECUTION_ID: executionId, FATHER_SERVER_ID: runMetadata().server.serverId },
    });
    child.on('exit', (code) => resolveRun(code ?? 1));
    child.on('error', () => resolveRun(1));
  });
}

const rows = [];
try {
  for (const file of files) {
    const journey = file.replace(/\.mjs$/, '');
    console.log(`\n=== ${journey} ===`);
    const startedAt = Date.now();
    const executionId = randomUUID();
    const exitCode = await runJourney(file, executionId);
    const durationMs = Date.now() - startedAt;
    const resultPath = resolve(RESULTS, `${journey}${VP_SUFFIX}.json`);
    let result = null;
    try {
      const parsed = JSON.parse(await readFile(resultPath, 'utf8'));
      // Timestamp alone cannot distinguish a stale file from this child process.
      if (parsed.journey === journey && parsed.run?.id === RUN_ID && parsed.run.executionId === executionId
        && parsed.run.root === runMetadata().root && parsed.run.git?.head === runMetadata().git.head
        && parsed.run.server?.serverId === runMetadata().server.serverId) result = parsed;
    } catch {
      result = null;
    }
    const status = exitCode !== 0 || !result ? 'fail' : assessJourneyStatus(result);
    const findingDetails = result ? collectFindings(result) : [];
    rows.push({
      journey,
      title: result?.title ?? null,
      status,
      exitCode,
      executionId,
      durationMs,
      failureReason: !result ? 'Nenhum JSON válido desta execução foi gravado.' : exitCode !== 0 ? `Processo terminou com código ${exitCode}.` : null,
      result: result ? rel(resultPath) : null,
      evidence: result?.evidence ?? [],
      findings: findingDetails.length,
      findingDetails,
      failedSteps: (result?.steps ?? []).filter((step) => step.ok === false && !step.finding && !step.pending).map((step) => step.name),
      pendingSteps: (result?.steps ?? []).filter((step) => step.pending).map((step) => ({ name: step.name, reason: step.detail })),
    });
  }
} finally {
  await server.close();
}

await mkdir(OUT, { recursive: true });
const summaryPath = resolve(OUT, `summary${VP_SUFFIX}.json`);
const summary = JSON.stringify({
  at: new Date().toISOString(),
  run: runMetadata(),
  viewport: VP,
  baseUrl: server.baseUrl,
  durationMs: Date.now() - runStartedAt,
  journeys: rows,
}, null, 2);
await writeFile(summaryPath, summary);
await writeFile(resolve(OUTPUT_ROOT, `summary${VP_SUFFIX}.json`), summary);

const pad = (value, width) => String(value ?? '').padEnd(width);
console.log('\nJornada            Estado   ms      Evidência');
for (const row of rows) {
  const evidence = row.result ?? '(sem resultado gravado)';
  console.log(`${pad(row.journey, 18)} ${pad(row.status, 8)} ${pad(row.durationMs, 7)} ${evidence}`);
  if (row.failedSteps.length) console.log(`${pad('', 18)} passos com falha: ${row.failedSteps.join('; ')}`);
  if (row.failureReason) console.log(`${pad('', 18)} ${row.failureReason}`);
  if (row.findings) console.log(`${pad('', 18)} ${row.findings} achado(s), ${row.pendingSteps.length} pendência(s)`);
}
console.log(`\nResumo: ${rel(summaryPath)}`);
const failed = rows.filter((row) => row.status === 'fail').length;
const pending = rows.filter((row) => row.status === 'pending').length;
console.log(`${rows.length} jornada(s): ${rows.length - failed - pending} pass · ${pending} pending · ${failed} fail`);
process.exit(failed > 0 ? 1 : 0);
