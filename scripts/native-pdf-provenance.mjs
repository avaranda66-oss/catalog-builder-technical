import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Local, read-only PDF diagnostic. No provider, catalog, or network entry point.
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = {};
for (let index = 0; index < args.length; index += 2) {
  if (!['--pdf', '--pages', '--out', '--regions'].includes(args[index]) ||
      !args[index + 1] || flags[args[index]] !== undefined) throw new Error('CLI_ARGUMENT_INVALID');
  flags[args[index]] = args[index + 1];
}
if (!flags['--pdf'] || !flags['--pages'] || !flags['--out'] || !/^\d+(?:,\d+)*$/.test(flags['--pages'])) {
  throw new Error('Usage: node scripts/native-pdf-provenance.mjs --pdf <file.pdf> --pages 6,7 --out <directory> [--regions <diagnostic-regions.json>]');
}
const sourceFiles = ['src/vnext/ai-catalog/pdf-native-provenance.ts', 'src/vnext/ai-catalog/pdf-intake.ts'];
const hash = data => createHash('sha256').update(data).digest('hex');
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, hash(await readFile(resolve(workspace, path)))])));
const before = await sourceHashes();
globalThis.crypto ??= webcrypto;
const sourcePath = resolve(workspace, sourceFiles[0]).replaceAll('\\', '/');
const bundle = await build({
  stdin: { contents: `export { readNativePdfSnapshot, reconstructNativeCellRegion } from '${sourcePath}';`, resolveDir: workspace, sourcefile: 'native-pdf-provenance-cli-entry.ts' },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
  plugins: [{ name: 'native-pdf-cli', setup(builder) {
    builder.onResolve({ filter: /^pdfjs-dist\/legacy\/build\/pdf\.mjs$/ }, () => ({ path: pathToFileURL(resolve(workspace, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href, external: true }));
    builder.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'browser-url' }));
    builder.onLoad({ filter: /.*/, namespace: 'browser-url' }, () => ({ contents: 'export default "";', loader: 'js' }));
  }}],
});
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const sourcePdf = resolve(flags['--pdf']);
const bytes = await readFile(sourcePdf);
const inputHash = hash(bytes);
const snapshot = await api.readNativePdfSnapshot(basename(sourcePdf), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
  pages: flags['--pages'].split(',').map(Number), expectedSha256: inputHash,
});
let regionInputs = [];
if (flags['--regions']) {
  regionInputs = JSON.parse(await readFile(resolve(flags['--regions']), 'utf8'));
  if (!Array.isArray(regionInputs) || regionInputs.length > 128 || regionInputs.some(region =>
    !region || typeof region.id !== 'string' || !Number.isInteger(region.page) || !region.box ||
    (region.expectedRunIds !== undefined && (!Array.isArray(region.expectedRunIds) || region.expectedRunIds.some(id => typeof id !== 'string'))))) {
    throw new Error('CLI_REGIONS_INVALID');
  }
}
const diagnostics = regionInputs.map(region => ({ id: region.id, ...api.reconstructNativeCellRegion(snapshot, region) }));
const after = await sourceHashes();
const output = resolve(flags['--out']);
await mkdir(output, { recursive: true });
const serialized = JSON.stringify(snapshot, null, 2);
await writeFile(resolve(output, 'snapshot.json'), serialized);
const result = {
  purpose: 'native-pdf-diagnostic-only', createdAt: new Date().toISOString(), workspace,
  driverSha256: hash(await readFile(fileURLToPath(import.meta.url))), sourceBefore: before, sourceAfter: after,
  sourceStable: JSON.stringify(before) === JSON.stringify(after), input: { file: sourcePdf, sha256: inputHash, byteLength: bytes.byteLength },
  parser: snapshot.parser, snapshotJsonSha256: hash(serialized),
  pageCount: snapshot.pageCount, selectedPages: snapshot.selectedPages, blockedReasons: snapshot.blockedReasons,
  pages: snapshot.pages.map(page => ({ number: page.number, view: page.view, rotation: page.rotation, userUnit: page.userUnit,
    nativeRunCount: page.nativeRunCount, includedRunCount: page.runs.length, nativeTextLength: page.nativeTextLength,
    runStringsSha256: page.runStringsSha256, truncated: page.truncated, blockedReasons: page.blockedReasons,
    markedContent: page.markedContent, artifactRunIds: page.runs.filter(run => run.evidenceRole === 'artifact').map(run => run.id) })),
  regionInputSha256: flags['--regions'] ? hash(await readFile(resolve(flags['--regions']))) : null,
  diagnostics,
  boundary: 'LITERAL is intact single-baseline parser-run concatenation only. No fact, model/field association, proposal, approval, extraction autonomy, or canonical mutation is established. Regions are curated diagnostic inputs. No provider calls.',
};
await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ sourceStable: result.sourceStable, sha256: snapshot.sha256, pageCount: snapshot.pageCount,
  pages: result.pages, diagnostics: diagnostics.map(({ id, status, rawLiteral, reasons, runs, joins }) => ({ id, status, rawLiteral, reasons,
    runIds: runs.map(run => run.id), joins })), boundary: result.boundary }, null, 2));
