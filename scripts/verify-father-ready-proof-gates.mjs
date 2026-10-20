#!/usr/bin/env node
// Local harness for docs/stories/2026-10-17-father-ready-continuacao.md.
// Never builds, installs browsers, deploys, or changes existing proof drivers.
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = '.github/workflows/quality-gates.yml';
const proofRoot = 'tests/vnext/proof/';
// Audited against process.env reads/writes in all 50 inventoried proof drivers.
// Keep system/runtime/cache variables, but do not let a developer's optional
// selectors silently replace the workflow's complete matrix or artifact paths.
const proofControlEnv = [
  'ADVANCED_TABLE_BROWSERS', 'ADVANCED_TABLE_DENSITY', 'ADVANCED_TABLE_DURABLE_OUTPUT',
  'ADVANCED_TABLE_LAYOUT_REPAIR_ONLY', 'ADVANCED_TABLE_OUTPUT', 'ADVANCED_TABLE_PORT', 'ADVANCED_TABLE_SIZES',
  'AGENT_FULL_PROOF_OUTPUT', 'AGENT_FULL_PROOF_PORT', 'AI_PROOF_BROWSER', 'AI_PROOF_OUTPUT',
  'AI_PROOF_PORT', 'AI_PROOF_PRODUCTION', 'ASSET_PROOF_HEADLESS', 'BYOK_PROOF_PORT', 'C1_PROOF_PORT',
  'FATHER_LARGE_OUTPUT', 'FATHER_TABLE_MATRIX_ONLY', 'FATHER_TRANSLATION_OUTPUT',
  'FR24_PROOF_PORT', 'FR24_ROUNDS', 'FR54_PROOF_PORT', 'FR80_PROOF_PORT', 'L1_PROOF_PORT',
  'HANGING_SPACE_PROOF_OUTPUT', 'HANGING_SPACE_PROOF_PORT',
  'LONG_PROOF_INSTITUTIONAL', 'LONG_PROOF_PORT', 'LONG_PROOF_PRODUCTION', 'LONG_PROOF_REFINE', 'LONG_PROOF_SECTIONS',
  'P1A_PROOF_HEADLESS', 'P1A_PROOF_PORT', 'P1B_PROOF_HEADLESS', 'P1B_PROOF_PORT',
  'P1C_PROOF_PHASE', 'P1C_PROOF_PORT', 'P1C_PROOF_SERVE', 'P2_PROOF_PHASE', 'P2_PROOF_PORT', 'P2_PROOF_SERVE',
  'PDF_FILL_PROOF_PORT', 'PDF_INTAKE_PROOF_PORT', 'PILOT_A_PROOF_PORT', 'PILOT_B_PROOF_PORT',
  'PROOF_DPR_MEASURE', 'PROOF_PORT', 'VITE_E2E_BUILD', 'BUILD_OUT_DIR',
  'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_VNEXT_CATALOG_AGENT_ENABLED',
  'W2C_PROOF_PORT', 'W2D_PROOF_PORT', 'W2E_PROOF_PORT', 'W2F_EXPORT_PROOF_PORT', 'W2F_PROOF_PORT', 'W2G_PROOF_PORT',
  'W3G_ASSET_PROOF_PORT', 'W3H_PROOF_PORT', 'W3I_PROOF_PORT', 'W4A_PROOF_PORT',
  'W4B_PROOF_HEADLESS', 'W4B_PROOF_PORT', 'W4C_PROOF_HEADLESS', 'W4C_PROOF_PORT',
  'W4D_PROOF_HEADLESS', 'W4D_PROOF_PORT', 'W4E_PROOF_HEADLESS', 'W4E_PROOF_PORT',
  'W4F1_PROOF_HEADLESS', 'W4F1_PROOF_PORT', 'W4F2_PROOF_HEADLESS', 'W4F2_PROOF_PORT',
  'W4F3_PROOF_HEADLESS', 'W4F3_PROOF_PORT', 'W4F4_PROOF_HEADLESS', 'W4F4_PROOF_PORT',
  'W4F5_PROOF_HEADLESS', 'W4F5_PROOF_PORT', 'W4G_PROOF_HEADLESS', 'W4G_PROOF_PORT',
  'W5A_PROOF_HEADLESS', 'W5A_PROOF_PORT', 'W5B_PROOF_PORT', 'W5C_PROOF_PORT',
];
const sanitizedInheritedNames = Object.keys(process.env)
  .filter(name => proofControlEnv.includes(name.toUpperCase())).sort();
const inheritedEnv = { ...process.env };
for (const name of sanitizedInheritedNames) delete inheritedEnv[name];
const publicEnvironment = env => Object.fromEntries(Object.entries(env).map(([name, value]) =>
  [name, /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(name) ? '[redacted]' : value]));
const options = { filters: [], timeoutMs: 900_000, list: false, skipEdge: false, skipE2e: false };
for (let index = 2; index < process.argv.length; index++) {
  const arg = process.argv[index];
  if (arg === '--list') options.list = true;
  else if (arg === '--skip-edge') options.skipEdge = true;
  else if (arg === '--skip-e2e') options.skipE2e = true;
  else if (arg === '--only') {
    const value = process.argv[++index];
    if (!value || value.startsWith('--')) throw new Error('--only requires a name or prefix');
    options.filters.push(...value.split(',').filter(Boolean));
  } else if (arg === '--timeout-ms') {
    options.timeoutMs = Number(process.argv[++index]);
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1_000) {
      throw new Error('--timeout-ms must be an integer >= 1000');
    }
  } else if (arg === '--help') {
    console.log('node scripts/verify-father-ready-proof-gates.mjs [--list] [--only name,prefix] [--timeout-ms 900000] [--skip-edge] [--skip-e2e]');
    process.exit(0);
  } else throw new Error(`Unknown argument: ${arg}`);
}

// A deliberately bounded parser for this workflow's literal env and node calls.
// Unsupported shell/YAML expressions fail instead of silently losing CI semantics.
function assignments(text) {
  const result = {};
  const pattern = /([A-Z][A-Z0-9_]*)=(?:'([^']*)'|"([^"]*)"|([^\s]+))/g;
  for (const match of text.matchAll(pattern)) result[match[1]] = match[2] ?? match[3] ?? match[4];
  if (text.replace(pattern, '').trim()) throw new Error(`Unsupported command prefix: ${text}`);
  return result;
}

const discovered = new Map();
function add(path, env, origin) {
  const stableEnv = Object.fromEntries(Object.entries(env).sort(([a], [b]) => a.localeCompare(b)));
  const key = JSON.stringify([path, stableEnv]);
  if (!discovered.has(key)) discovered.set(key, { path, env: stableEnv, origins: [] });
  discovered.get(key).origins.push(origin);
}

const workflowText = await readFile(resolve(root, workflow), 'utf8');
let step = '', stepEnv = {}, inEnv = false;
for (const [index, line] of workflowText.split(/\r?\n/).entries()) {
  const stepMatch = line.match(/^\s{6}- name:\s*(.*)$/);
  if (stepMatch) { step = stepMatch[1]; stepEnv = {}; inEnv = false; }
  if (/^\s{8}env:\s*$/.test(line)) { inEnv = true; continue; }
  if (inEnv) {
    const match = line.match(/^\s{10}([A-Z][A-Z0-9_]*):\s*(.*?)\s*$/);
    if (match) {
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      if (value.includes('${{')) throw new Error(`Unsupported dynamic env at ${workflow}:${index + 1}`);
      stepEnv[match[1]] = value;
      continue;
    }
    if (line.trim()) inEnv = false;
  }
  const match = line.match(/^(?:\s{8}run:\s*|\s{10})(.*?)\bnode\s+(tests\/vnext\/proof\/[\w./-]+\.mjs)\s*$/);
  if (match) add(match[2], { ...stepEnv, ...assignments(match[1]) }, `${workflow}:${index + 1} (${step})`);
  else if (/\bnode\s+['"]?tests\/vnext\/proof\//.test(line)) {
    throw new Error(`Unsupported proof command at ${workflow}:${index + 1}`);
  }
}
if (!discovered.size) throw new Error(`No proof calls discovered in ${workflow}`);
const supplemental = ['fr24-thumbnails-measure.mjs', 'fr54-bleed-print-proof.mjs', 'fr80-archetypes-layout-proof.mjs',
  'hanging-space-browser-proof.mjs'];
const recent = (await readdir(resolve(root, proofRoot))).filter(name =>
  /^(?:editor-scale|inline-assistant|agent-native|native-pdf-cell-fill).*\.mjs$/.test(name));
for (const name of new Set([...supplemental, ...recent])) {
  const path = `${proofRoot}${name}`;
  if (existsSync(resolve(root, path)) && ![...discovered.values()].some(proof => proof.path === path)) {
    add(path, {}, 'supplemental integration proof');
  }
}

const proofs = [];
for (const proof of discovered.values()) {
  const source = await readFile(resolve(root, proof.path), 'utf8').catch(() => '');
  const variant = proof.env.AI_PROOF_BROWSER || (proof.path.endsWith('ai-catalog-prototype-proof.mjs') ? 'chromium' : '');
  const name = basename(proof.path, '.mjs');
  const id = variant ? `${name}--${variant}` : name;
  const outputVar = source.match(/process\.env\.([A-Z][A-Z0-9_]*OUTPUT)\s*\?\?/)?.[1];
  const artifactBase = source.match(/['"](scratch\/[^'"]+)['"]/)?.[1];
  proofs.push({ ...proof, id, name, sourceHash: createHash('sha256').update(source).digest('hex'), missing: !source,
    selected: !options.filters.length || options.filters.some(filter => id.startsWith(filter) || proof.path.startsWith(filter)),
    needsChromium: variant !== 'msedge' && /from\s*['"]playwright['"]/.test(source),
    needsEdge: variant === 'msedge' || /channel\s*:\s*['"]msedge['"]/.test(source),
    needsE2e: proof.env.AI_PROOF_PRODUCTION === '1' || proof.env.LONG_PROOF_PRODUCTION === '1',
    outputVar, artifactBase });
}
if (options.filters.length && !proofs.some(proof => proof.selected)) throw new Error('No proof matches --only');
if (options.list) {
  for (const proof of proofs.filter(item => item.selected)) {
    console.log(`${proof.id}\t${proof.needsE2e ? 'E2E build' : 'local dev harness'}${proof.needsEdge ? ' + Edge' : ''}\t${proof.path}`);
  }
  process.exit(0);
}

const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const runDir = resolve(root, 'scratch/continuacao/proof-gates', runId);
await mkdir(runDir, { recursive: true });
let interrupted = false, activeChild, cleanupUncertain = false;

// Kill only the process tree created by this runner, never a port or a process name.
function stopOwned(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn(resolve(process.env.SystemRoot || 'C:/Windows', 'System32/taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => { cleanupUncertain = true; child.kill(); });
    killer.on('exit', code => { if (code !== 0 && child.exitCode === null) { cleanupUncertain = true; child.kill(); } });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
    }, 2_000);
    timer.unref();
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; stopOwned(activeChild); });

let chromiumPath = '', playwrightError = '';
try { chromiumPath = (await import('playwright')).chromium.executablePath(); }
catch (error) { playwrightError = error.message; }
const edgeCandidates = process.platform === 'win32'
  ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
    .filter(Boolean).map(base => resolve(base, 'Microsoft/Edge/Application/msedge.exe'))
  : process.platform === 'darwin' ? ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
    : ['/opt/microsoft/msedge/msedge', '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'];
const gitRead = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const summary = { schemaVersion: 1, runId, startedAt: new Date().toISOString(), root,
  git: { head: gitRead('rev-parse', 'HEAD'), branch: gitRead('branch', '--show-current'), dirty: Boolean(gitRead('status', '--porcelain')) },
  story: 'docs/stories/2026-10-17-father-ready-continuacao.md', workflow,
  workflowSha256: createHash('sha256').update(workflowText).digest('hex'), node: process.version,
  boundary: 'Local harness regression only; no production, real Gemini/Supabase or human acceptance claim.',
  environmentPolicy: { sanitizedInheritedNames,
    rule: 'Known proof controls removed from inherited environment; literal workflow env and isolated output reapplied. CI=1. System/runtime/cache variables preserved.' },
  options, prerequisites: { chromiumPath, chromiumExists: !!chromiumPath && existsSync(chromiumPath),
    playwrightError, edgePath: edgeCandidates.find(path => existsSync(path)) || null,
    e2eEntry: resolve(root, 'dist/e2e/ai-catalog-prototype.html'), browserCheck: 'File presence only; launch is verified by each proof.' },
  results: [] };
const saveSummary = () => writeFile(resolve(runDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
await saveSummary();
console.log(`Local proof gates: ${runDir}`);

// Preserve only recognizable small JSON receipts, never PDFs/images or large directories.
async function receipts(directory, depth = 0) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    if (found.length >= 50) break;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory() && depth < 2 && !entry.name.startsWith('.')) found.push(...await receipts(path, depth + 1));
    else if (entry.isFile() && /(?:result|summary|receipt|evidence|report|manifest|proof).*\.json$/i.test(entry.name)) {
      const info = await stat(path);
      if (info.size > 0 && info.size <= 1_048_576) {
        const text = await readFile(path, 'utf8');
        try {
          const value = JSON.parse(text);
          if (value && typeof value === 'object' && Object.keys(value).length) {
            found.push({ path, sha256: createHash('sha256').update(text).digest('hex'), mtimeMs: info.mtimeMs, value });
          }
        }
        catch { /* Invalid JSON is not a receipt. */ }
      }
    }
  }
  return found.slice(0, 50);
}

async function execute(proof, directory, env) {
  const stdoutLog = resolve(directory, 'stdout.log'), stderrLog = resolve(directory, 'stderr.log');
  // Serialized appends preserve output order; only bounded tails enter summary.json.
  let writes = Promise.resolve(), logError = null, stdoutBytes = 0, stderrBytes = 0, stdoutTail = '', stderrTail = '', positive = false, fatalStderr = false;
  await Promise.all([writeFile(stdoutLog, ''), writeFile(stderrLog, '')]);
  return new Promise(resolveResult => {
    let child, spawnError = null, timedOut = false, finished = false, cleanupTimer;
    const finish = async (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearTimeout(cleanupTimer); activeChild = undefined;
      await writes;
      resolveResult({ exitCode: code, signal, timedOut, spawnError, logError, stdoutBytes, stderrBytes, positive, fatalStderr, stderrTail,
        stdoutLog: relative(root, stdoutLog), stderrLog: relative(root, stderrLog) });
    };
    child = spawn(process.execPath, [proof.path], { cwd: root, env, shell: false,
      detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    activeChild = child;
    const timer = setTimeout(() => {
      timedOut = true; stopOwned(child);
      cleanupTimer = setTimeout(() => {
        cleanupUncertain = true;
        child.stdout.destroy(); child.stderr.destroy(); child.unref();
        finish(child.exitCode, child.signalCode);
      }, 5_000);
    }, options.timeoutMs);
    child.on('error', error => { spawnError = error.message; });
    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      stdoutTail = (stdoutTail + chunk.toString()).slice(-16_384);
      positive ||= /\bPASS\b|_PASS\b/.test(stdoutTail);
      writes = writes.then(() => appendFile(stdoutLog, chunk)).catch(error => { logError ||= error.message; });
    });
    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;
      stderrTail = (stderrTail + chunk.toString()).slice(-8_192);
      fatalStderr ||= /AssertionError|(?:^|\n)(?:Error|TypeError|ReferenceError|SyntaxError):|UnhandledPromiseRejection/.test(stderrTail);
      writes = writes.then(() => appendFile(stderrLog, chunk)).catch(error => { logError ||= error.message; });
    });
    child.on('close', finish);
  });
}

for (const [index, proof] of proofs.entries()) {
  const directory = resolve(runDir, `${String(index + 1).padStart(2, '0')}-${proof.id}`);
  const record = { id: proof.id, path: proof.path, origins: proof.origins, sourceHash: proof.sourceHash,
    requirements: { chromium: proof.needsChromium, edge: proof.needsEdge, e2eBuild: proof.needsE2e }, status: 'skipped' };
  summary.results.push(record);
  const skip = !proof.selected ? 'Excluded by --only filter.' : interrupted ? 'Runner interrupted.'
    : cleanupUncertain ? 'Previous owned process cleanup uncertain; further execution stopped.'
      : proof.missing ? null
        : proof.needsE2e && options.skipE2e ? 'Excluded by --skip-e2e.'
          : proof.needsEdge && options.skipEdge ? 'Excluded by --skip-edge.'
            : proof.needsChromium && !summary.prerequisites.chromiumExists ? `Playwright Chromium unavailable. ${playwrightError}`
              : proof.needsEdge && !summary.prerequisites.edgePath ? 'Microsoft Edge channel not found at known platform paths.'
                : proof.needsE2e && !existsSync(summary.prerequisites.e2eEntry) ? 'Required dist/e2e/ai-catalog-prototype.html is missing; build E2E separately.' : null;
  if (skip) { record.reason = skip; await saveSummary(); continue; }
  try {
    await mkdir(directory, { recursive: true });
    if (proof.missing) { record.status = 'fail'; record.reason = 'Discovered proof file is missing or empty.'; await saveSummary(); continue; }
    const env = { ...inheritedEnv, ...proof.env, CI: '1' };
    // CI declares some OUTPUT paths; replace those with this run's path when supported.
    if (proof.outputVar) env[proof.outputVar] = resolve(directory, 'artifacts');
    // Avoid an ambient optional durable-copy target creating writes outside this run.
    if (proof.path.endsWith('advanced-table-matrix-proof.mjs')) delete env.ADVANCED_TABLE_DURABLE_OUTPUT;
    const artifacts = proof.outputVar ? env[proof.outputVar] : proof.artifactBase ? resolve(root, proof.artifactBase) : null;
    record.artifactDirectory = artifacts;
    record.artifactDirectoryExisted = !!artifacts && existsSync(artifacts);
    record.outputVariable = proof.outputVar || null;
    record.environment = publicEnvironment({ ...proof.env, CI: '1', ...(proof.outputVar ? { [proof.outputVar]: env[proof.outputVar] } : {}) });
    const before = artifacts ? await receipts(artifacts) : [];
    record.preexistingReceipts = before.map(({ path, sha256 }) => ({ path: relative(root, path), sha256 }));
    record.startedAt = new Date().toISOString();
    record.status = 'running'; await saveSummary();
    console.log(`[${index + 1}/${proofs.length}] ${proof.id}`);
    Object.assign(record, await execute(proof, directory, env));
    record.finishedAt = new Date().toISOString();
    const after = artifacts ? await receipts(artifacts) : [];
    const fresh = after.filter(item => !before.some(old => old.path === item.path && old.sha256 === item.sha256 && old.mtimeMs === item.mtimeMs));
    record.receipts = [];
    for (const receipt of fresh) {
      const target = resolve(directory, 'receipts', relative(artifacts, receipt.path));
      await mkdir(dirname(target), { recursive: true }); await copyFile(receipt.path, target);
      record.receipts.push({ original: relative(root, receipt.path), copy: relative(root, target), sha256: receipt.sha256 });
    }
    const failedReceipt = fresh.some(({ value }) => [value?.status, value?.verdict, value?.result]
      .some(value => typeof value === 'string' && /^(?:FAIL|FAILED|ERROR|RUNNING)$/i.test(value)));
    record.status = record.exitCode === 0 && !record.timedOut && !record.spawnError && !record.logError &&
      !record.fatalStderr && !failedReceipt && (record.positive || fresh.length > 0) ? 'pass' : 'fail';
    record.reason = record.status === 'pass' ? 'Exit 0 and explicit PASS output or fresh recognizable JSON receipt.'
      : record.timedOut ? `Process exceeded ${options.timeoutMs} ms.` : record.spawnError ? `Spawn failed: ${record.spawnError}`
        : record.logError ? `Log write failed: ${record.logError}` : record.exitCode !== 0 ? `Process exited ${record.exitCode}, signal ${record.signal}.`
          : record.fatalStderr ? 'Fatal error text on stderr.' : failedReceipt ? 'Fresh receipt reports failure or incomplete RUNNING status.'
            : 'Exit 0 without explicit PASS output or fresh recognizable JSON receipt (zero result).';
    if (record.stderrBytes) record.stderrNote = 'Inspect stderr.log; warnings alone do not override the proof verdict.';
    await saveSummary();
    console.log(`${record.status.toUpperCase()}: ${proof.id} — ${record.reason}`);
  } catch (error) {
    record.status = 'fail'; record.reason = `Runner infrastructure error: ${error.message}`;
    record.finishedAt = new Date().toISOString();
    await saveSummary();
    console.error(`FAIL: ${proof.id} — ${record.reason}`);
  }
}
summary.finishedAt = new Date().toISOString();
summary.counts = Object.fromEntries(['pass', 'fail', 'skipped'].map(status => [status, summary.results.filter(item => item.status === status).length]));
summary.complete = summary.counts.fail === 0 && summary.counts.skipped === 0;
summary.interrupted = interrupted;
summary.cleanupUncertain = cleanupUncertain;
await saveSummary();
console.log(JSON.stringify({ ...summary.counts, complete: summary.complete, summary: resolve(runDir, 'summary.json') }));
process.exitCode = interrupted ? 130 : summary.counts.fail > 0 || cleanupUncertain ? 1 : 0;
