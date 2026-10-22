import React from 'react';
import type { DocumentSession } from '../../application';
import type { CatalogDocument } from '../../domain';
import { DraftRequestError, draftErrorMessage } from '../draft-client';
import {
  applyCompiledDraft, compileDraft, draftIntegrityProblems, factSetFromReviews,
  type AppliedDraft, type CompiledDraft, type DraftFactSet,
} from '../draft-compiler';
import type { ExtractionReview } from '../extraction-review';
import type { ExtractedPdf } from '../pdf-intake';
import type { IntakeEntry } from '../intake/intake-model';
import { guessSpecificationPages, pageRangeProblem, parseModelNames, type PageGuess, type SpecTableGateway } from './spec-table-gateway';

/**
 * J2-lite (slice 3B) state: "Montar tabela de especificações a partir deste
 * PDF" → free readiness check → which pages → the AI reads them (server key)
 * → every value checked against the PDF's own text → "Pendências" and the
 * table preview as cards in the conversation → "Aplicar" inserts the table
 * in ONE transaction (one Desfazer / Ctrl+Z removes it all).
 *
 * Nothing here invents a value: the table holds only verified facts or a
 * person's choice between verified readings; the rest stays blank and listed.
 */
export const SPEC_TABLE_ACTION_ONE = 'Montar tabela de especificações a partir deste PDF';
export const SPEC_TABLE_ACTION_MANY = 'Montar tabela de especificações a partir destes PDFs';
/** At most this many PDFs of one batch are read for one table. */
export const SPEC_TABLE_MAX_FILES = 3;
const UNCHANGED = ' Nada foi alterado no catálogo.';
export const NO_MODEL_TABLE = 'Não encontrei uma tabela de especificações com os modelos nestas páginas. '
  + 'Escolha outras páginas e tente de novo.' + UNCHANGED;

export interface SpecTableFile {
  readonly entryId: string;
  readonly sourceId: string;
  readonly file: File;
  readonly fileName: string;
  readonly pdf: ExtractedPdf;
  readonly firstPage: number;
  readonly lastPage: number;
  /** The pages suggested from the file's text (`found` false: only a starting point). */
  readonly guess: PageGuess;
  /** The person typed the pages: a new model list no longer moves them. */
  readonly edited?: boolean;
}
export interface SpecTableRead {
  readonly fileName: string;
  readonly review?: ExtractionReview;
  readonly error?: string;
}
export type SpecTableStage =
  | { readonly kind: 'checking' }
  | { readonly kind: 'blocked'; readonly message: string }
  | { readonly kind: 'pages'; readonly files: readonly SpecTableFile[]; readonly problem?: string }
  | { readonly kind: 'reading'; readonly files: readonly SpecTableFile[] }
  | { readonly kind: 'failed'; readonly files: readonly SpecTableFile[]; readonly message: string }
  | { readonly kind: 'review'; readonly files: readonly SpecTableFile[]; readonly reads: readonly SpecTableRead[];
      readonly set: DraftFactSet; readonly problem?: string }
  | { readonly kind: 'applied'; readonly reads: readonly SpecTableRead[]; readonly set: DraftFactSet; readonly applied: AppliedDraft };
export interface SpecTableFlow {
  readonly id: number;
  readonly batchId: string;
  readonly conversationId: string;
  readonly at: number;
  readonly entries: readonly IntakeEntry[];
  /** Models the person wants, as typed ("TA-25N, TA-35N"); empty lets the AI list the products it finds. */
  readonly models: string;
  readonly stage: SpecTableStage;
}

/** PDFs of a batch the action can use: read here (ready, or needing help for some pages). */
export function specTablePdfs(entries: readonly IntakeEntry[]): IntakeEntry[] {
  return entries.filter(entry => entry.kind === 'pdf' && (entry.state === 'ready' || entry.state === 'needs-help'))
    .slice(0, SPEC_TABLE_MAX_FILES);
}
export const specTableActionLabel = (pdfs: number) => pdfs > 1 ? SPEC_TABLE_ACTION_MANY : SPEC_TABLE_ACTION_ONE;

export type SpecTableCompiled = { readonly ok: true; readonly draft: CompiledDraft } | { readonly ok: false; readonly message: string };
/** The table for the catalog as it is now: on the open page when it is empty, otherwise on a new page right after it. */
export function compileSpecTable(set: DraftFactSet, document: CatalogDocument, activePageId?: string): SpecTableCompiled {
  try {
    const draft = compileDraft(set, document, activePageId ? { afterPageId: activePageId, onPageId: activePageId } : {});
    if (draftIntegrityProblems(set, draft).length) return { ok: false, message: 'Não foi possível montar a tabela com segurança.' + UNCHANGED };
    return { ok: true, draft };
  } catch (failure) {
    const code = failure instanceof Error ? failure.message : '';
    if (code === 'DRAFT_TOO_MANY_MODELS') {
      return { ok: false, message: 'Estas páginas têm mais de 6 modelos, o máximo de uma tabela. Escolha páginas com menos modelos.' + UNCHANGED };
    }
    return { ok: false, message: 'Não foi possível montar a tabela a partir destas páginas.' + UNCHANGED };
  }
}

interface Options {
  readonly gateway?: SpecTableGateway;
  readonly session: DocumentSession;
  readonly activePageId?: string;
  readonly onBeforeMutation?: () => boolean;
  readonly onShowTable?: (pageId: string, objectId: string) => void;
  /** Keeps a message in the conversation; `undoable` offers "Desfazer" on it while the change can still be undone. */
  readonly say: (conversationId: string, role: 'user' | 'assistant', text: string, undoable?: boolean) => void;
}

export function useSpecTableDraft({ gateway, session, activePageId, onBeforeMutation, onShowTable, say }: Options) {
  const [flow, setFlow] = React.useState<SpecTableFlow>();
  const serial = React.useRef(0);
  const flowRef = React.useRef(flow);
  flowRef.current = flow;
  // Late answers after the panel closes are ignored.
  React.useEffect(() => () => { serial.current++; }, []);
  const update = (id: number, stage: SpecTableStage) => {
    if (id === serial.current) setFlow(current => current && current.id === id ? { ...current, stage } : current);
  };

  const prepare = async (id: number, entries: readonly IntakeEntry[]) => {
    if (!gateway) return;
    const readiness = await gateway.readiness().catch(() => ({ kind: 'blocked', code: 'DRAFT_UNAVAILABLE' } as const));
    if (id !== serial.current) return;
    if (readiness.kind === 'blocked') {
      update(id, { kind: 'blocked', message: draftErrorMessage(new DraftRequestError(readiness.code)) });
      return;
    }
    const files: SpecTableFile[] = [];
    for (const [index, entry] of specTablePdfs(entries).entries()) {
      let pdf: ExtractedPdf;
      try { pdf = await gateway.readPdf(entry.file); } catch {
        update(id, { kind: 'blocked', message: `Não consegui abrir ${entry.fileName} aqui no computador. Confira se o PDF abre normalmente e envie de novo.${UNCHANGED}` });
        return;
      }
      if (id !== serial.current) return;
      const guess = guessSpecificationPages(pdf, { models: parseModelNames(flowRef.current?.models ?? '') });
      files.push({ entryId: entry.id, sourceId: `arquivo-${index + 1}`, file: entry.file, fileName: entry.fileName, pdf,
        firstPage: guess.firstPage, lastPage: guess.lastPage, guess });
    }
    update(id, files.length ? { kind: 'pages', files }
      : { kind: 'blocked', message: `Não há PDF lido neste envio para montar a tabela.${UNCHANGED}` });
  };

  /** "Montar tabela de especificações a partir deste PDF" on a batch of files. */
  const start = (batchId: string, entries: readonly IntakeEntry[], conversationId: string) => {
    if (!gateway || flowRef.current?.stage.kind === 'reading') return;
    const id = ++serial.current;
    const pdfs = specTablePdfs(entries);
    say(conversationId, 'user', specTableActionLabel(pdfs.length));
    setFlow({ id, batchId, conversationId, at: Date.now(), entries, models: '', stage: { kind: 'checking' } });
    void prepare(id, entries);
  };
  const retry = () => {
    const current = flowRef.current;
    if (!current) return;
    const id = ++serial.current;
    setFlow({ ...current, id, stage: { kind: 'checking' } });
    void prepare(id, current.entries);
  };

  const setPages = (entryId: string, firstPage: number, lastPage: number) => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'pages' && current?.stage.kind !== 'failed') return;
    const files = current.stage.files.map(file => file.entryId === entryId ? { ...file, firstPage, lastPage, edited: true } : file);
    setFlow({ ...current, stage: { kind: 'pages', files } });
  };
  /** The models typed by the person; the pages they did not type follow the pages that name those models. */
  const setModels = (models: string) => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'pages' && current?.stage.kind !== 'failed') return;
    const names = parseModelNames(models);
    const files = current.stage.files.map(file => {
      if (file.edited) return file;
      const guess = guessSpecificationPages(file.pdf, { models: names });
      return { ...file, guess, firstPage: guess.firstPage, lastPage: guess.lastPage };
    });
    setFlow({ ...current, models, stage: { kind: 'pages', files } });
  };
  const choosePages = () => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'failed' && current?.stage.kind !== 'review') return;
    setFlow({ ...current, stage: { kind: 'pages', files: current.stage.files } });
  };

  const read = async () => {
    const current = flowRef.current;
    if (!gateway || (current?.stage.kind !== 'pages' && current?.stage.kind !== 'failed')) return;
    const files = current.stage.files;
    for (const file of files) {
      const problem = pageRangeProblem(file.firstPage, file.lastPage, file.pdf.pageCount);
      if (problem) { setFlow({ ...current, stage: { kind: 'pages', files, problem: `${file.fileName}: ${problem}` } }); return; }
    }
    const id = ++serial.current;
    setFlow({ ...current, id, stage: { kind: 'reading', files } });
    const models = parseModelNames(current.models);
    const reads: SpecTableRead[] = [];
    for (const file of files) {
      try {
        const review = await gateway.extract({ file: file.file, pdf: file.pdf, firstPage: file.firstPage, lastPage: file.lastPage,
          sourceId: file.sourceId, ...(models.length ? { models } : {}) });
        reads.push({ fileName: file.fileName, review });
      } catch (failure) {
        reads.push({ fileName: file.fileName, error: draftErrorMessage(failure) });
      }
      if (id !== serial.current) return;
    }
    const reviews = reads.flatMap(item => item.review ? [item.review] : []);
    if (!reviews.length) {
      update(id, { kind: 'failed', files, message: reads[0]?.error ?? draftErrorMessage(new DraftRequestError('INVALID_REPLY')) });
      return;
    }
    let set: DraftFactSet;
    try { set = factSetFromReviews(reviews); } catch {
      update(id, { kind: 'failed', files, message: NO_MODEL_TABLE });
      return;
    }
    update(id, { kind: 'review', files, reads, set });
  };
  const cancel = () => {
    const current = flowRef.current;
    if (!current) return;
    serial.current++;
    if (current.stage.kind === 'reading') setFlow({ ...current, stage: { kind: 'pages', files: current.stage.files } });
    else setFlow(undefined);
  };
  const choose = (set: DraftFactSet) => {
    const current = flowRef.current;
    if (current?.stage.kind === 'review') setFlow({ ...current, stage: { ...current.stage, set, problem: undefined } });
  };

  const apply = () => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'review') return;
    const stage = current.stage;
    if (onBeforeMutation && !onBeforeMutation()) {
      setFlow({ ...current, stage: { ...stage, problem: 'Conclua ou cancele a edição aberta antes de inserir a tabela.' } });
      return;
    }
    // Compiled again for the catalog as it is now, so the table always fits the pages that exist.
    const compiled = compileSpecTable(stage.set, session.getSnapshot().document, activePageId);
    if (!compiled.ok) { setFlow({ ...current, stage: { ...stage, problem: compiled.message } }); return; }
    const outcome = applyCompiledDraft(session, compiled.draft);
    if (!outcome.ok) { setFlow({ ...current, stage: { ...stage, problem: outcome.message } }); return; }
    say(current.conversationId, 'assistant', outcome.applied.message, true);
    setFlow({ ...current, stage: { kind: 'applied', reads: stage.reads, set: stage.set, applied: outcome.applied } });
    const first = outcome.applied.tables[0];
    if (first) onShowTable?.(first.pageId, first.objectId);
  };
  const discard = () => { serial.current++; setFlow(undefined); };

  return { flow, start, retry, setPages, setModels, choosePages, read, cancel, choose, apply, discard, available: Boolean(gateway) };
}
export type SpecTableController = ReturnType<typeof useSpecTableDraft>;
