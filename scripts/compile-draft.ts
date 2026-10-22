/**
 * FR-69: compiles verified facts into a catalog draft and writes the catalog
 * JSON, validated by CatalogDocumentSchema, with where each fact landed and
 * what is pending. Nothing is trusted from the input file: every value is
 * verified again here against the PDFs' own text (pdf-intake); statuses
 * written in the file are ignored. No network, no key. Tooling only: never
 * imported by the app.
 *
 *   npx vite-node scripts/compile-draft.ts -- <fatos.json> [--out <rascunho.json>]
 *
 * <fatos.json> (paths are relative to the file):
 *   { "version": 1, "title"?: "...", "layout"?: "auto"|"T1"|"T3", "pendingCellText"?: "",
 *     "choices"?: { "<id da pendência>": <índice do candidato> | "missing" },
 *     // A) a fact proposal (FR-67 contract) checked against local PDFs
 *     "proposal"?: {...}, "files"?: [{ "sourceId": "ta-folder", "path": "folder.pdf", "name"?: "..." }],
 *     // B) answers of the server extraction (FR-66), one per file, reviewed as in the app
 *     "extractions"?: [{ "sourceId": "ta-manual-pt", "path": "manual.pdf", "firstPage": 5, "lastPage": 8,
 *                        "models"?: ["TA-25N"], "answer": {...} }] }
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { FactProposalSchema } from '../src/vnext/ai-catalog/contracts';
import {
  compileDraftDocument, factSetFromReport, factSetFromReviews, openPendingCount, recordChoice, type DraftFactSet,
} from '../src/vnext/ai-catalog/draft-compiler';
import { reviewExtraction } from '../src/vnext/ai-catalog/extraction-review';
import { withNormalizedSymbols } from '../src/vnext/ai-catalog/fact-extraction';
import { pdfEvidenceSource, verifyFactProposal } from '../src/vnext/ai-catalog/fact-verifier';
import { extractPdfText } from '../src/vnext/ai-catalog/pdf-intake';

const sourceId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const InputSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1).max(160).optional(),
  layout: z.enum(['auto', 'T1', 'T3']).optional(),
  pendingCellText: z.string().max(40).optional(),
  choices: z.record(z.union([z.number().int().min(0), z.literal('missing')])).optional(),
  proposal: z.unknown().optional(),
  files: z.array(z.object({ sourceId, path: z.string().min(1), name: z.string().min(1).optional() }).strict()).max(6).optional(),
  extractions: z.array(z.object({
    sourceId, path: z.string().min(1), firstPage: z.number().int().min(1), lastPage: z.number().int().min(1),
    models: z.array(z.string().min(1)).max(6).optional(), answer: z.unknown(),
  }).strict()).min(1).max(6).optional(),
}).strict().refine(input => Boolean(input.proposal) !== Boolean(input.extractions), 'Use "proposal" + "files" OU "extractions".');

const args = process.argv.slice(2).filter(arg => arg !== '--');
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
const inputPath = args.find((arg, index) => !arg.startsWith('--') && index !== outIndex + 1);
if (!inputPath || (outIndex >= 0 && !out)) {
  console.error('Uso: npx vite-node scripts/compile-draft.ts -- <fatos.json> [--out <rascunho.json>]');
  process.exit(2);
}
const base = dirname(resolve(inputPath));
const input = InputSchema.parse(JSON.parse(await readFile(inputPath, 'utf8')));

async function readPdf(path: string) {
  const fileName = path.split(/[\\/]/u).at(-1) ?? path;
  const bytes = await readFile(resolve(base, path));
  return extractPdfText(fileName, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

let set: DraftFactSet;
if (input.extractions) {
  const reviews = [];
  for (const item of input.extractions) {
    const pdf = await readPdf(item.path);
    if (item.lastPage < item.firstPage || item.lastPage > pdf.pageCount) throw new Error(`Páginas inválidas para ${item.path}`);
    const answer = item.answer && typeof item.answer === 'object' && 'sheet' in item.answer ? (item.answer as { sheet: unknown }).sheet : item.answer;
    reviews.push(reviewExtraction(answer, {
      sourceId: item.sourceId, fileName: pdf.fileName, sha256: pdf.sha256, pageCount: pdf.pageCount,
      firstPage: item.firstPage, lastPage: item.lastPage,
    }, pdf, item.models ? { models: item.models } : {}));
  }
  set = factSetFromReviews(reviews, input.title ? { title: input.title } : {});
} else {
  const evidence = [];
  for (const file of input.files ?? []) {
    const pdf = await readPdf(file.path);
    evidence.push(pdfEvidenceSource(file.sourceId, withNormalizedSymbols(pdf), file.name ?? pdf.fileName));
  }
  const report = verifyFactProposal(FactProposalSchema.parse(input.proposal), evidence);
  set = factSetFromReport(report, input.title ? { title: input.title } : {});
}
for (const [id, choice] of Object.entries(input.choices ?? {})) set = recordChoice(set, id, choice);

const { document, draft, applied } = compileDraftDocument(set, {
  ...(input.layout ? { layout: input.layout } : {}),
  ...(input.pendingCellText !== undefined ? { pendingCellText: input.pendingCellText } : {}),
});
const result = {
  version: 1, transactionId: draft.transactionId, layout: draft.layout, presetId: draft.presetId, parts: draft.parts,
  document,
  cells: [...applied.cells.values()],
  pending: draft.pending.map(item => ({
    id: item.id, label: item.label, model: item.model, status: item.status, resolved: item.resolved, message: item.message,
    candidates: item.candidates.map(candidate => ({ value: candidate.value, status: candidate.status, where: candidate.where,
      quote: candidate.source.quote, choosable: candidate.choosable })),
  })),
};
if (out) await writeFile(resolve(out), JSON.stringify(result, null, 1));
const filled = draft.cells.filter(cell => cell.kind === 'value' && (cell.state === 'verified' || cell.state === 'chosen')).length;
const values = draft.cells.filter(cell => cell.kind === 'value').length;
console.log(`${draft.layout} (${draft.presetId}): ${values} valores, ${filled} preenchidos com fatos conferidos, `
  + `${openPendingCount(draft.pending)} pendências; ${draft.parts} página(s); transação ${draft.transactionId}.`);
console.log(applied.message);
if (out) console.log(`Catálogo gravado em ${resolve(out)} (validado pelo CatalogDocumentSchema).`);
