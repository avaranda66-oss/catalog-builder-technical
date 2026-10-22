import { imageBlocks, tableBlocks, type IntakeEntry } from './intake-model';
import { createValueStore, dropIntoIntake, type SourceIntakeSession, type ValueStore } from './intake-store';

/**
 * The files dropped (or chosen with the paperclip) together form one batch, and each batch is ONE short message of
 * the assistant in the conversation ("Li 3 arquivos: …"), with the details one click away. Batches live next to the
 * catalog's files (intake-store.ts), only in the memory of this tab, so closing the assistant keeps them.
 */

export interface IntakeBatch {
  readonly id: string;
  /** When the files were dropped (ms since 1970), to place the message in the conversation. */
  readonly at: number;
  readonly entryIds: readonly string[];
  /** The conversation that was open when the files arrived; the message appears there. */
  readonly conversationId?: string;
}

const batches = new WeakMap<SourceIntakeSession, ValueStore<readonly IntakeBatch[]>>();
let batchSerial = 0;

/** The batches of the catalog's files (the same store every time the assistant opens in this tab). */
export function intakeBatchesFor(session: SourceIntakeSession): ValueStore<readonly IntakeBatch[]> {
  let store = batches.get(session);
  if (!store) {
    store = createValueStore<readonly IntakeBatch[]>([]);
    batches.set(session, store);
  }
  return store;
}

/**
 * Adds the files to the catalog's list (see `dropIntoIntake`) and records them as one batch. Returns the batch, or
 * null when the files were not taken (a table is being inserted right now).
 */
export function dropBatchIntoIntake(session: SourceIntakeSession, files: readonly File[],
  { conversationId, at = Date.now() }: { conversationId?: string; at?: number } = {}): IntakeBatch | null {
  const before = new Set(session.files.getEntries().map((entry) => entry.id));
  if (!dropIntoIntake(session, files)) return null;
  const entryIds = session.files.getEntries().filter((entry) => !before.has(entry.id)).map((entry) => entry.id);
  if (!entryIds.length) return null;
  const batch: IntakeBatch = { id: `batch-${at.toString(36)}-${++batchSerial}`, at, entryIds, conversationId };
  const store = intakeBatchesFor(session);
  store.set([...store.get(), batch]);
  return batch;
}

/** The files of a batch that are still in the list ("Tirar" takes a file out of every message). */
export function batchEntries(batch: IntakeBatch, entries: readonly IntakeEntry[]): IntakeEntry[] {
  return batch.entryIds.map((id) => entries.find((entry) => entry.id === id)).filter((entry): entry is IntakeEntry => Boolean(entry));
}

/** "a.pdf", "a.pdf e b.csv", "a.pdf, b.csv e c.jpg", "a.pdf, b.csv, c.jpg e mais 2". */
export function fileNamesText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
  return `${names.slice(0, 3).join(', ')} e mais ${names.length - 3}`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface IntakeBatchSummary {
  /** Some file of the batch is still being read. */
  readonly reading: boolean;
  /** One or two short sentences; the lists stay in "Ver detalhes". */
  readonly text: string;
  /** Something in the batch needs the person (a file that failed or that asks for a range). */
  readonly needsAttention: boolean;
  /** Tables that can go to the catalog from "Ver detalhes". */
  readonly tables: number;
}

/** The short message of a batch, in plain Portuguese. */
export function intakeBatchSummary(entries: readonly IntakeEntry[]): IntakeBatchSummary {
  const reading = entries.filter((entry) => entry.state === 'reading');
  if (reading.length) {
    return {
      reading: true, needsAttention: false, tables: 0,
      text: reading.length === 1 ? `Lendo ${reading[0].fileName}…` : `Lendo ${count(reading.length, 'arquivo', 'arquivos')}…`,
    };
  }
  const read = entries.filter((entry) => entry.state === 'ready' || entry.state === 'needs-help');
  const failed = entries.filter((entry) => entry.state === 'error');
  const repeated = entries.filter((entry) => entry.state === 'duplicate');
  const skipped = entries.filter((entry) => entry.state === 'skipped');
  const helping = entries.filter((entry) => entry.state === 'needs-help');
  const tables = read.reduce((sum, entry) => sum + tableBlocks(entry.intake).length, 0);
  const photos = read.reduce((sum, entry) => sum + imageBlocks(entry.intake).length, 0);
  const parts: string[] = [];
  if (read.length) parts.push(`Li ${count(read.length, 'arquivo', 'arquivos')}: ${fileNamesText(read.map((entry) => entry.fileName))}.`);
  const found = [tables ? count(tables, 'tabela', 'tabelas') : '', photos ? count(photos, 'foto', 'fotos') : ''].filter(Boolean);
  if (found.length) parts.push(`Encontrei ${found.join(' e ')}.`);
  if (failed.length) parts.push(failed.length === 1 ? `Não consegui ler ${failed[0].fileName}.` : `Não consegui ler ${count(failed.length, 'arquivo', 'arquivos')}.`);
  if (repeated.length) parts.push(repeated.length === 1 ? `${repeated[0].fileName} é repetido e não foi lido de novo.` : `${count(repeated.length, 'arquivo repetido foi ignorado', 'arquivos repetidos foram ignorados')}.`);
  if (skipped.length) parts.push(`${count(skipped.length, 'arquivo ficou', 'arquivos ficaram')} de fora pelo limite de arquivos.`);
  if (helping.length) parts.push(helping.length === 1 ? 'Um deles precisa da sua ajuda.' : `${helping.length} deles precisam da sua ajuda.`);
  return {
    reading: false,
    text: parts.join(' ') || 'Nenhum arquivo deste envio continua na lista.',
    needsAttention: failed.length + helping.length + skipped.length > 0,
    tables,
  };
}
