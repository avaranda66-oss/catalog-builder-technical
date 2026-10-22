import {
  SOURCE_LIMITS,
  type SourceBlock,
  type SourceErrorCode,
  type SourceFileResult,
  type SourceIntake,
  type SourceReadOptions,
} from '../source-intake';

/**
 * FR-64: what the assistant knows about each file the person dropped. Pure helpers (no React, no DOM), shared by
 * the hook that reads the files and by the screens that show them.
 */

export type IntakeFileKind = 'pdf' | 'spreadsheet' | 'photo' | 'other';
/**
 * reading: "Lendo…"; ready: "Pronto"; needs-help: "Precisa da sua ajuda"; error: "Não foi possível: motivo";
 * duplicate: the same content was already dropped; skipped: over the limit of files.
 */
export type IntakeFileState = 'reading' | 'ready' | 'needs-help' | 'error' | 'duplicate' | 'skipped';

export interface IntakeEntry {
  readonly id: string;
  readonly file: File;
  readonly fileName: string;
  readonly kind: IntakeFileKind;
  readonly state: IntakeFileState;
  /** How the file was (or is being) read: hidden data, ranges, PDF pages. */
  readonly options: SourceReadOptions;
  readonly sha256?: string;
  readonly intake?: SourceIntake;
  /** Plain-language reason for error, duplicate and skipped files. */
  readonly message?: string;
  readonly code?: SourceErrorCode | 'SOURCE_UNKNOWN';
  readonly duplicateOf?: string;
}

export type SourceTableBlock = Extract<SourceBlock, { kind: 'table' }>;
export type SourceImageBlock = Extract<SourceBlock, { kind: 'image' }>;
export type SourceTextBlock = Extract<SourceBlock, { kind: 'text' }>;

/** Files the drop zone accepts (the same list `readSources` reads; anything else gets a clear message). */
export const INTAKE_ACCEPT = '.pdf,.xlsx,.xlsm,.xls,.csv,.tsv,.txt,.png,.jpg,.jpeg,.jfif,.jpe,.webp,.heic,.heif';
export const INTAKE_MAX_FILES = SOURCE_LIMITS.files;

const SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'xlsm', 'xls', 'csv', 'tsv', 'txt']);
const PHOTO_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'jfif', 'jpe', 'webp', 'heic', 'heif']);

export function intakeFileKind(fileName: string): IntakeFileKind {
  const extension = fileName.toLowerCase().split('.').at(-1) ?? '';
  if (extension === 'pdf') return 'pdf';
  if (SPREADSHEET_EXTENSIONS.has(extension)) return 'spreadsheet';
  if (PHOTO_EXTENSIONS.has(extension)) return 'photo';
  return 'other';
}

/** Short text of the state chip. */
export function intakeStateLabel(entry: Pick<IntakeEntry, 'state' | 'message'>): string {
  switch (entry.state) {
    case 'reading': return 'Lendo…';
    case 'ready': return 'Pronto';
    case 'needs-help': return 'Precisa da sua ajuda';
    case 'duplicate': return 'Ignorado: arquivo repetido';
    case 'skipped': return 'Não foi lido';
    case 'error':
      // A reason that already says "Não foi possível…" is not prefixed again.
      return entry.message && /^não foi possível\b/i.test(entry.message)
        ? entry.message : `Não foi possível: ${entry.message ?? 'o arquivo não abriu.'}`;
  }
}

/** The entry after `readSources` answered for its file. */
export function entryFromResult(entry: IntakeEntry, result: SourceFileResult | undefined): IntakeEntry {
  if (!result) {
    return { ...entry, state: 'error', intake: undefined, code: 'SOURCE_UNKNOWN',
      message: 'o arquivo não abriu. Confira se ele abre normalmente e envie de novo.' };
  }
  const base = { ...entry, sha256: result.sha256 ?? entry.sha256, code: result.code, message: result.message };
  if (result.status === 'ready' || result.status === 'needs-help') return { ...base, state: result.status, intake: result.intake };
  if (result.status === 'duplicate') return { ...base, state: 'duplicate', duplicateOf: result.duplicateOf, intake: undefined };
  if (result.status === 'skipped') return { ...base, state: 'skipped', intake: undefined };
  return { ...base, state: 'error', intake: undefined };
}

export function duplicateEntry(entry: IntakeEntry, sha256: string, earlier: IntakeEntry): IntakeEntry {
  return { ...entry, state: 'duplicate', sha256, duplicateOf: earlier.fileName, intake: undefined,
    message: `Este arquivo é igual a “${earlier.fileName}” e não foi lido de novo.` };
}

export function skippedEntry(entry: IntakeEntry): IntakeEntry {
  return { ...entry, state: 'skipped', intake: undefined,
    message: `Cabem no máximo ${INTAKE_MAX_FILES} arquivos de cada vez. Tire um arquivo da lista e solte este de novo.` };
}

export const tableBlocks = (intake: SourceIntake | undefined): SourceTableBlock[] =>
  (intake?.blocks ?? []).filter((block): block is SourceTableBlock => block.kind === 'table');
export const imageBlocks = (intake: SourceIntake | undefined): SourceImageBlock[] =>
  (intake?.blocks ?? []).filter((block): block is SourceImageBlock => block.kind === 'image');
export const textBlocks = (intake: SourceIntake | undefined): SourceTextBlock[] =>
  (intake?.blocks ?? []).filter((block): block is SourceTextBlock => block.kind === 'text');

/** "arquivo · página 3" / "arquivo · aba DB_SENSORS": where a block came from, as the person finds it again. */
export function blockOrigin(block: SourceBlock): string {
  return `${block.source.fileName} · ${block.source.location}`;
}

/**
 * Pages of a PDF that could not be read here (scanned or drawn). This is the hand-off point for the server reading
 * of FR-66 (slices 2F/3B): those pages are the ones to send to Gemini. In this wave they are only shown as a warning.
 */
export function pdfPagesNeedingServerReading(entry: Pick<IntakeEntry, 'kind' | 'intake'>): readonly number[] {
  if (entry.kind !== 'pdf') return [];
  return entry.intake?.pdf?.pagesNeedingVisualReading ?? [];
}

/** "1 a 30", "1, 3 e 5": page numbers in plain Portuguese. */
export function pageListText(pages: readonly number[]): string {
  if (!pages.length) return '';
  const sorted = [...pages].sort((a, b) => a - b);
  const contiguous = sorted.every((page, index) => index === 0 || page === sorted[index - 1] + 1);
  if (contiguous && sorted.length > 2) return `${sorted[0]} a ${sorted.at(-1)}`;
  if (sorted.length === 1) return String(sorted[0]);
  return `${sorted.slice(0, -1).join(', ')} e ${sorted.at(-1)}`;
}

/** The next pages of a PDF to read, when some were not read yet (at most 30 at a time). */
export function nextPdfPages(entry: Pick<IntakeEntry, 'kind' | 'intake'>): { from: number; to: number } | undefined {
  const pdf = entry.kind === 'pdf' ? entry.intake?.pdf : undefined;
  if (!pdf || !pdf.pagesNotRead.length) return undefined;
  const lastRead = Math.max(0, ...pdf.pagesRead);
  const next = pdf.pagesNotRead.find((page) => page > lastRead) ?? pdf.pagesNotRead[0];
  return { from: next, to: Math.min(pdf.pageCount, next + SOURCE_LIMITS.pdfPages - 1) };
}
