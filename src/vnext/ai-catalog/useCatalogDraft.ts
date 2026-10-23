import React from 'react';
import type { DocumentSession } from '../application';
import type { CatalogDocument } from '../domain';
import { DraftRequestError, draftErrorMessage } from './draft-client';
import { factSetFromReviews, type DraftFactSet } from './draft-compiler';
import type { IntakeEntry } from './intake/intake-model';
import type { ExtractedPdf } from './pdf-intake';
import {
  buildPlanBrief, catalogPlanEntries, checkCatalogPlan, defaultSelection, reviewPlanPages,
  type CheckedCatalogPlan, type PlanPageReview, type PlanPhoto, type PlanSelection, type PlanSourceFile,
} from './catalog-plan';
import { applyPagePlan, compilePagePlan, undoPagePlan, type AppliedPagePlan, type CompiledPagePlan } from './page-plan-apply';
import {
  guessSpecificationPages, pageRangeProblem, parseModelNames, type SpecTableGateway,
} from './spec-table/spec-table-gateway';
import { specTablePdfs, type SpecTableFile, type SpecTableRead } from './spec-table/useSpecTableDraft';

/**
 * FR-70 state: "Montar catálogo a partir destes arquivos" on the files of one message → free readiness check →
 * the specification pages of each PDF → five visible steps (Lendo arquivos, Gemini lendo PDFs, Conferindo
 * números, Montando páginas, Medindo A4) → the preview of every page, with where each value came from and what
 * stays for the person → Aplicar (ONE transaction, "Desfazer" for 30 s), Ajustar (the answers and notes go back to
 * the AI, the PDFs are not read again) or Descartar.
 */
export const CATALOG_DRAFT_ACTION = 'Montar catálogo a partir destes arquivos';
export const CATALOG_DRAFT_STEPS = Object.freeze([
  { id: 'files', label: 'Lendo arquivos' },
  { id: 'reading', label: 'Gemini lendo PDFs' },
  { id: 'checking', label: 'Conferindo números' },
  { id: 'pages', label: 'Montando páginas' },
  { id: 'measuring', label: 'Medindo A4' },
] as const);
export type CatalogDraftStep = typeof CATALOG_DRAFT_STEPS[number]['id'];
/** "Desfazer" stays on the card this long after Aplicar (it stays in the conversation and in the editor after). */
export const UNDO_WINDOW_MS = 30_000;
const UNCHANGED = ' Nada foi alterado no catálogo.';
export const NOT_DEPLOYED = 'A montagem do catálogo inteiro pela IA ainda não chegou ao servidor. Por enquanto, use '
  + '“Montar tabela de especificações” ou monte as páginas à mão; o administrador pode atualizar o servidor.' + UNCHANGED;

export interface CatalogDraftPlanned {
  readonly files: readonly SpecTableFile[];
  readonly photos: readonly PlanPhoto[];
  readonly reads: readonly SpecTableRead[];
  readonly set?: DraftFactSet;
  /** Fact id of the brief → position id (to check the AI's fact literals). */
  readonly facts: ReadonlyMap<string, string>;
  readonly plan: CheckedCatalogPlan;
  readonly selection: PlanSelection;
  /** The person's answers to the AI's questions, by question index. */
  readonly answers: Readonly<Record<number, string>>;
  readonly notes: string;
  readonly estimatedUsd: number;
}
export type CatalogDraftStage =
  | { readonly kind: 'checking' }
  | { readonly kind: 'blocked'; readonly message: string }
  | { readonly kind: 'setup'; readonly files: readonly SpecTableFile[]; readonly photos: readonly PlanPhoto[]; readonly problem?: string }
  | { readonly kind: 'working'; readonly step: CatalogDraftStep; readonly files: readonly SpecTableFile[]; readonly photos: readonly PlanPhoto[] }
  | { readonly kind: 'failed'; readonly files: readonly SpecTableFile[]; readonly photos: readonly PlanPhoto[]; readonly message: string;
      readonly planned?: CatalogDraftPlanned }
  | ({ readonly kind: 'preview'; readonly problem?: string } & CatalogDraftPlanned)
  | { readonly kind: 'applied'; readonly applied: AppliedPagePlan; readonly at: number; readonly undone?: boolean; readonly planned: CatalogDraftPlanned };
export interface CatalogDraftFlow {
  readonly id: number;
  readonly batchId: string;
  readonly conversationId: string;
  readonly at: number;
  readonly entries: readonly IntakeEntry[];
  readonly models: string;
  readonly stage: CatalogDraftStage;
}

/** The plan as it would be applied to the catalog as it is now (preview and Aplicar use the same). */
export type CatalogDraftCompiled =
  | { readonly ok: true; readonly compiled: CompiledPagePlan; readonly reviews: readonly PlanPageReview[] }
  | { readonly ok: false; readonly message: string };
export function compileCatalogDraft(planned: Pick<CatalogDraftPlanned, 'plan' | 'selection' | 'set'>, document: CatalogDocument,
  activePageId?: string): CatalogDraftCompiled {
  const entries = catalogPlanEntries(planned.plan, planned.selection, planned.set);
  if (!entries.length) return { ok: false, message: 'Nenhuma página ficou no plano. Inclua ao menos uma página.' };
  try {
    const compiled = compilePagePlan(document, entries, activePageId ? { afterPageId: activePageId } : {});
    return { ok: true, compiled, reviews: reviewPlanPages(planned.plan, compiled) };
  } catch {
    return { ok: false, message: `Não foi possível montar as páginas com segurança.${UNCHANGED}` };
  }
}

/** Instructions for "Ajustar": the questions with the person's answers, then the notes. */
export function adjustInstructions(plan: CheckedCatalogPlan, answers: Readonly<Record<number, string>>, notes: string): string {
  const answered = plan.questions.flatMap((question, index) => answers[index]?.trim() ? [`${question} Resposta: ${answers[index].trim()}`] : []);
  return [...answered, notes.trim()].filter(Boolean).join('\n');
}

interface Options {
  readonly gateway?: SpecTableGateway;
  readonly session: DocumentSession;
  readonly activePageId?: string;
  readonly onBeforeMutation?: () => boolean;
  /** Opens a page in the editor (the first page of the applied catalog). */
  readonly onShowPage?: (pageId: string) => void;
  readonly say: (conversationId: string, role: 'user' | 'assistant', text: string, undoable?: boolean) => void;
  readonly now?: () => number;
}

export function useCatalogDraft({ gateway, session, activePageId, onBeforeMutation, onShowPage, say, now = Date.now }: Options) {
  const [flow, setFlow] = React.useState<CatalogDraftFlow>();
  const serial = React.useRef(0);
  const flowRef = React.useRef(flow);
  flowRef.current = flow;
  React.useEffect(() => () => { serial.current++; }, []);
  const update = (id: number, stage: CatalogDraftStage) => {
    if (id === serial.current) setFlow(current => current && current.id === id ? { ...current, stage } : current);
  };
  const available = Boolean(gateway?.plan);

  const prepare = async (id: number, entries: readonly IntakeEntry[]) => {
    if (!gateway?.plan) return;
    const readiness = await gateway.readiness().catch(() => ({ kind: 'blocked', code: 'DRAFT_UNAVAILABLE' } as const));
    if (id !== serial.current) return;
    if (readiness.kind === 'blocked') {
      update(id, { kind: 'blocked', message: draftErrorMessage(new DraftRequestError(readiness.code)) });
      return;
    }
    // An older deployed function reads PDFs but cannot plan: say so before anything is sent or paid.
    if (readiness.planning !== true) { update(id, { kind: 'blocked', message: NOT_DEPLOYED }); return; }
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
    const photos = entries.filter(entry => entry.kind === 'photo' && entry.state !== 'error' && entry.state !== 'duplicate')
      .map(entry => ({ id: entry.id, fileName: entry.fileName }));
    update(id, files.length ? { kind: 'setup', files, photos }
      : { kind: 'blocked', message: `Para montar o catálogo, envie ao menos um PDF do produto nesta mensagem.${UNCHANGED}` });
  };

  const start = (batchId: string, entries: readonly IntakeEntry[], conversationId: string) => {
    if (!gateway?.plan || flowRef.current?.stage.kind === 'working') return;
    const id = ++serial.current;
    say(conversationId, 'user', CATALOG_DRAFT_ACTION);
    setFlow({ id, batchId, conversationId, at: now(), entries, models: '', stage: { kind: 'checking' } });
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
    if (current?.stage.kind !== 'setup') return;
    const files = current.stage.files.map(file => file.entryId === entryId ? { ...file, firstPage, lastPage, edited: true } : file);
    setFlow({ ...current, stage: { ...current.stage, files, problem: undefined } });
  };
  const setModels = (models: string) => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'setup') return;
    const names = parseModelNames(models);
    const files = current.stage.files.map(file => {
      if (file.edited) return file;
      const guess = guessSpecificationPages(file.pdf, { models: names });
      return { ...file, guess, firstPage: guess.firstPage, lastPage: guess.lastPage };
    });
    setFlow({ ...current, models, stage: { ...current.stage, files } });
  };

  /** Asks the AI for the plan (step 4) and measures it (step 5); `reads` and `set` come from step 2–3. */
  const plan = async (id: number, base: { files: readonly SpecTableFile[]; photos: readonly PlanPhoto[]; reads: readonly SpecTableRead[];
    set?: DraftFactSet }, instructions: string, keep?: Pick<CatalogDraftPlanned, 'answers' | 'notes'>) => {
    if (!gateway?.plan) return;
    update(id, { kind: 'working', step: 'pages', files: base.files, photos: base.photos });
    const sources: PlanSourceFile[] = base.files.map(file => ({ id: file.sourceId, fileName: file.fileName, pdf: file.pdf }));
    const built = buildPlanBrief({ files: sources, set: base.set, photos: base.photos, instructions });
    let checked: CheckedCatalogPlan, estimatedUsd: number;
    try {
      const reply = await gateway.plan(built.brief);
      if (id !== serial.current) return;
      checked = checkCatalogPlan(reply.plan, { files: sources, set: base.set, facts: built.facts });
      estimatedUsd = reply.usage.estimatedUsd;
    } catch (failure) {
      update(id, { kind: 'failed', files: base.files, photos: base.photos, message: draftErrorMessage(failure) });
      return;
    }
    update(id, { kind: 'working', step: 'measuring', files: base.files, photos: base.photos });
    const planned: CatalogDraftPlanned = { ...base, facts: built.facts, plan: checked, selection: defaultSelection(checked),
      answers: keep?.answers ?? {}, notes: keep?.notes ?? '', estimatedUsd };
    // The A4 estimate runs on the same compilation as Aplicar; a plan that cannot be compiled is not shown.
    const measured = compileCatalogDraft(planned, session.getSnapshot().document, activePageId);
    if (id !== serial.current) return;
    update(id, measured.ok ? { kind: 'preview', ...planned } : { kind: 'failed', files: base.files, photos: base.photos, message: measured.message });
  };

  const run = async () => {
    const current = flowRef.current;
    if (!gateway?.plan || current?.stage.kind !== 'setup' && current?.stage.kind !== 'failed') return;
    const { files, photos } = current.stage;
    for (const file of files) {
      const problem = pageRangeProblem(file.firstPage, file.lastPage, file.pdf.pageCount);
      if (problem) { setFlow({ ...current, stage: { kind: 'setup', files, photos, problem: `${file.fileName}: ${problem}` } }); return; }
    }
    const id = ++serial.current;
    setFlow({ ...current, id, stage: { kind: 'working', step: 'files', files, photos } });
    // Step 1 was done when the files were read here; step 2 reads the specification pages.
    update(id, { kind: 'working', step: 'reading', files, photos });
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
    update(id, { kind: 'working', step: 'checking', files, photos });
    const reviews = reads.flatMap(item => item.review ? [item.review] : []);
    let set: DraftFactSet | undefined;
    // Without a readable table the catalog is still planned; the specification page stays for the person.
    try { set = reviews.length ? factSetFromReviews(reviews) : undefined; } catch { set = undefined; }
    await plan(id, { files, photos, reads, set }, '');
  };

  /** "Ajustar": the answers and notes go back to the AI; the PDFs are not read again. */
  const adjust = async () => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'preview') return;
    const stage = current.stage;
    const instructions = adjustInstructions(stage.plan, stage.answers, stage.notes);
    if (!instructions) {
      setFlow({ ...current, stage: { ...stage, problem: 'Escreva o que mudar ou responda a uma pergunta antes de ajustar.' } });
      return;
    }
    const id = ++serial.current;
    setFlow({ ...current, id });
    await plan(id, { files: stage.files, photos: stage.photos, reads: stage.reads, set: stage.set }, instructions,
      { answers: stage.answers, notes: stage.notes });
  };

  const edit = (change: (stage: Extract<CatalogDraftStage, { kind: 'preview' }>) => Extract<CatalogDraftStage, { kind: 'preview' }>) => {
    const current = flowRef.current;
    if (current?.stage.kind === 'preview') setFlow({ ...current, stage: { ...change(current.stage), problem: undefined } });
  };
  const choose = (set: DraftFactSet) => edit(stage => ({ ...stage, set }));
  /** Leaves a page out, or puts it back in its place. */
  const toggle = (key: string) => edit(stage => {
    if (stage.selection.includes(key)) return { ...stage, selection: stage.selection.filter(item => item !== key) };
    const order = stage.plan.pages.map(page => page.key);
    const kept = new Set([...stage.selection, key]);
    // Back where it was, relative to the pages kept around it.
    const selection = [...stage.selection];
    const position = order.indexOf(key);
    const after = selection.findIndex(item => order.indexOf(item) > position);
    selection.splice(after < 0 ? selection.length : after, 0, key);
    return { ...stage, selection: selection.filter(item => kept.has(item)) };
  });
  const move = (key: string, delta: -1 | 1) => edit(stage => {
    const index = stage.selection.indexOf(key), target = index + delta;
    if (index < 0 || target < 0 || target >= stage.selection.length) return stage;
    const selection = [...stage.selection];
    [selection[index], selection[target]] = [selection[target], selection[index]];
    return { ...stage, selection };
  });
  const setAnswer = (index: number, text: string) => edit(stage => ({ ...stage, answers: { ...stage.answers, [index]: text.slice(0, 300) } }));
  const setNotes = (notes: string) => edit(stage => ({ ...stage, notes: notes.slice(0, 500) }));

  const apply = () => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'preview') return;
    const { kind: _kind, problem: _problem, ...planned } = current.stage;
    const fail = (problem: string) => setFlow({ ...current, stage: { ...current.stage as Extract<CatalogDraftStage, { kind: 'preview' }>, problem } });
    if (onBeforeMutation && !onBeforeMutation()) { fail('Conclua ou cancele a edição aberta antes de montar o catálogo.'); return; }
    // Compiled again for the catalog as it is now.
    const measured = compileCatalogDraft(planned, session.getSnapshot().document, activePageId);
    if (!measured.ok) { fail(measured.message); return; }
    const outcome = applyPagePlan(session, measured.compiled);
    if (!outcome.ok) { fail(outcome.message); return; }
    say(current.conversationId, 'assistant', outcome.applied.message, true);
    setFlow({ ...current, stage: { kind: 'applied', applied: outcome.applied, at: now(), planned } });
    const first = outcome.applied.pageIds[0];
    if (first) onShowPage?.(first);
  };
  /** "Desfazer" on the card: only while the catalog is still as the plan left it. */
  const undo = () => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'applied' || current.stage.undone) return false;
    if (onBeforeMutation && !onBeforeMutation()) return false;
    if (!undoPagePlan(session, current.stage.applied)) return false;
    say(current.conversationId, 'assistant', 'Desfiz o catálogo montado. O catálogo voltou ao que era antes; use Refazer se mudar de ideia.');
    setFlow({ ...current, stage: { ...current.stage, undone: true } });
    return true;
  };
  const cancel = () => {
    const current = flowRef.current;
    if (!current) return;
    serial.current++;
    if (current.stage.kind === 'working') setFlow({ ...current, stage: { kind: 'setup', files: current.stage.files, photos: current.stage.photos } });
    else setFlow(undefined);
  };
  const discard = () => { serial.current++; setFlow(undefined); };

  return { flow, available, start, retry, setPages, setModels, run, adjust, choose, toggle, move, setAnswer, setNotes, apply, undo, cancel, discard };
}
export type CatalogDraftController = ReturnType<typeof useCatalogDraft>;
