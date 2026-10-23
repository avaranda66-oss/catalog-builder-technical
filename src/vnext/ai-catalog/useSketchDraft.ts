import React from 'react';
import type { DocumentSession } from '../application';
import { DraftRequestError, draftErrorMessage } from './draft-client';
import { applyPagePlan, undoPagePlan, type AppliedPagePlan } from './page-plan-apply';
import { sketchErrorMessage, type SketchInterpretation } from './sketch-client';
import { prepareSketchImage, type SketchImageOutcome } from './sketch-image';
import {
  compileSketchPages, defaultSketchChoices, sketchAppliedMessage, sketchFields, sketchPageOutcome,
  type SketchField, type SketchPageChoices, type SketchPageOutcome, type SketchTableSource,
} from './sketch-review';
import { snapSketchPlan, type SketchSnapPlan, type SketchTemplateId } from './sketch-snap';
import type { SpecTableGateway } from './spec-table/spec-table-gateway';

/**
 * Modo rascunho, the second door of the AI into a catalog: photos of pages drawn on paper (one photo per page) →
 * free readiness check → the person agrees to send them → each photo is made upright and ≤ 1600 px here, read by the
 * AI (interpret_sketch) and fitted to the PRESYS page models → the review screen (the photo with the areas the AI
 * understood, the page type with two alternatives, the source of each table, every digit of the drawing to confirm)
 * → Aplicar through the same door as the whole-catalog plan: ONE transaction, ONE Desfazer.
 */
export const SKETCH_ACTION = 'Criar páginas a partir do rascunho';
/** What the photo picker of the sketch offers: what the chat accepts as photos (a HEIC photo gets a plain message). */
export const SKETCH_ACCEPT = '.png,.jpg,.jpeg,.jfif,.jpe,.webp,.heic,.heif';
/** Photos read per request (each one is one page and one call of about US$ 0.01). */
export const SKETCH_MAX_PHOTOS = 6;
export const SKETCH_STEPS = Object.freeze([
  { id: 'photo', label: 'Preparando a foto' },
  { id: 'reading', label: 'IA lendo o desenho' },
  { id: 'fitting', label: 'Encaixando no modelo PRESYS' },
] as const);
export type SketchStep = typeof SKETCH_STEPS[number]['id'];
/** "Desfazer" stays on the card this long after Aplicar (it stays in the conversation and in the editor after). */
export const SKETCH_UNDO_WINDOW_MS = 30_000;
const UNCHANGED = ' Nada foi alterado no catálogo.';
export const SKETCH_NOT_DEPLOYED = 'A leitura de rascunhos pela IA ainda não chegou ao servidor. Por enquanto, monte as páginas '
  + 'com “Usar modelo…”; o administrador pode atualizar o servidor.' + UNCHANGED;

export interface SketchPhoto { readonly key: string; readonly file: File }
export interface SketchPageImage { readonly url: string; readonly width: number; readonly height: number }
export interface SketchPage {
  readonly key: string;
  readonly file: File;
  readonly fileName: string;
  readonly state: 'waiting' | 'reading' | 'ready' | 'failed';
  readonly step?: SketchStep;
  readonly message?: string;
  readonly image?: SketchPageImage;
  readonly interpretation?: SketchInterpretation;
  /** The fields of the chosen page model. */
  readonly snap?: SketchSnapPlan;
  readonly fields?: readonly SketchField[];
  readonly choices?: SketchPageChoices;
  /** "Não criar esta página" takes it out of Aplicar. */
  readonly included: boolean;
}
export type ReadySketchPage = SketchPage & Required<Pick<SketchPage, 'interpretation' | 'snap' | 'fields' | 'choices' | 'image'>>;
export const isReadySketchPage = (page: SketchPage): page is ReadySketchPage =>
  page.state === 'ready' && Boolean(page.interpretation && page.snap && page.fields && page.choices && page.image);

export type SketchStage =
  | { readonly kind: 'checking'; readonly photos: readonly SketchPhoto[] }
  | { readonly kind: 'blocked'; readonly message: string; readonly photos: readonly SketchPhoto[] }
  | { readonly kind: 'setup'; readonly photos: readonly SketchPhoto[]; readonly notice?: string }
  | { readonly kind: 'working'; readonly pages: readonly SketchPage[] }
  | { readonly kind: 'review'; readonly pages: readonly SketchPage[]; readonly problem?: string }
  | { readonly kind: 'applied'; readonly pages: readonly SketchPage[]; readonly applied: AppliedPagePlan; readonly at: number;
      readonly message: string; readonly undone?: boolean };
export interface SketchFlow {
  readonly id: number;
  readonly conversationId: string;
  readonly at: number;
  readonly stage: SketchStage;
}

/** The pages "Aplicar" sends, with what each one becomes. */
export function sketchOutcomes(pages: readonly SketchPage[], sources: readonly SketchTableSource[]): SketchPageOutcome[] {
  return pages.filter(isReadySketchPage).filter(page => page.included)
    .map(page => sketchPageOutcome({ key: page.key, snap: page.snap, fields: page.fields, choices: page.choices }, sources));
}

interface Options {
  readonly gateway?: SpecTableGateway;
  readonly session: DocumentSession;
  readonly activePageId?: string;
  readonly onBeforeMutation?: () => boolean;
  readonly onShowPage?: (pageId: string) => void;
  readonly say: (conversationId: string, role: 'user' | 'assistant', text: string, undoable?: boolean) => void;
  readonly now?: () => number;
  /** Test seam: how a photo is made ready (default: upright, ≤ 1600 px, with the browser's decoder). */
  readonly prepare?: (file: File) => Promise<SketchImageOutcome>;
}

const createUrl = (bytes: Uint8Array, type: string) => typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
  ? URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type })) : '';

export function useSketchDraft({ gateway, session, activePageId, onBeforeMutation, onShowPage, say, now = Date.now,
  prepare = prepareSketchImage }: Options) {
  const [flow, setFlow] = React.useState<SketchFlow>();
  const serial = React.useRef(0);
  const flowRef = React.useRef(flow);
  flowRef.current = flow;
  const urls = React.useRef(new Set<string>());
  const releaseUrls = () => {
    for (const url of urls.current) { try { URL.revokeObjectURL(url); } catch { /* already released */ } }
    urls.current.clear();
  };
  React.useEffect(() => () => { serial.current++; releaseUrls(); }, []);
  const available = Boolean(gateway?.sketch);
  const update = (id: number, change: (stage: SketchStage) => SketchStage) => {
    if (id !== serial.current) return;
    setFlow(current => current && current.id === id ? { ...current, stage: change(current.stage) } : current);
  };
  const setPages = (id: number, change: (pages: readonly SketchPage[]) => readonly SketchPage[]) =>
    update(id, stage => stage.kind === 'working' || stage.kind === 'review' ? { ...stage, pages: change(stage.pages) } : stage);
  const patchPage = (id: number, key: string, patch: Partial<SketchPage>) =>
    setPages(id, pages => pages.map(page => page.key === key ? { ...page, ...patch } : page));

  const check = async (id: number, photos: readonly SketchPhoto[]) => {
    if (!gateway?.sketch) return;
    const readiness = await gateway.readiness().catch(() => ({ kind: 'blocked', code: 'DRAFT_UNAVAILABLE' } as const));
    if (id !== serial.current) return;
    if (readiness.kind === 'blocked') {
      update(id, () => ({ kind: 'blocked', photos, message: draftErrorMessage(new DraftRequestError(readiness.code)) }));
      return;
    }
    // An older deployed function reads PDFs but not sketches: say so before anything is sent or paid.
    if (readiness.sketching !== true) { update(id, () => ({ kind: 'blocked', photos, message: SKETCH_NOT_DEPLOYED })); return; }
    update(id, () => ({ kind: 'setup', photos }));
  };

  /** Starts the flow with the photos of the sketch (one per page). */
  const start = (files: readonly File[], conversationId: string) => {
    const current = flowRef.current;
    if (!gateway?.sketch || current?.stage.kind === 'working' || !files.length) return;
    const id = ++serial.current;
    releaseUrls();
    const photos = files.slice(0, SKETCH_MAX_PHOTOS).map((file, index) => ({ key: `rascunho-${index + 1}`, file }));
    const names = photos.map(photo => photo.file.name).join(', ');
    say(conversationId, 'user', `${SKETCH_ACTION} (${photos.length === 1 ? '1 foto' : `${photos.length} fotos`}: ${names})`);
    setFlow({ id, conversationId, at: now(), stage: { kind: 'checking', photos } });
    if (files.length > SKETCH_MAX_PHOTOS) {
      void check(id, photos).then(() => update(id, stage => stage.kind === 'setup'
        ? { ...stage, notice: `Recebi ${files.length} fotos; leio as ${SKETCH_MAX_PHOTOS} primeiras de cada vez.` } : stage));
      return;
    }
    void check(id, photos);
  };
  const retry = () => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'blocked') return;
    const id = ++serial.current;
    const { photos } = current.stage;
    setFlow({ ...current, id, stage: { kind: 'checking', photos } });
    void check(id, photos);
  };

  /** Reads one page: prepares the photo here, asks the AI, fits the answer to the PRESYS models. */
  const readPage = async (id: number, page: SketchPage) => {
    if (!gateway?.sketch) return;
    patchPage(id, page.key, { state: 'reading', step: 'photo', message: undefined });
    let image = page.image;
    const prepared = await prepare(page.file);
    if (id !== serial.current) return;
    if (!prepared.ok) { patchPage(id, page.key, { state: 'failed', step: undefined, message: prepared.message }); return; }
    const upload = prepared;
    if (!image) {
      const url = createUrl(prepared.bytes, prepared.type);
      if (url) urls.current.add(url);
      image = { url, width: prepared.width, height: prepared.height };
    }
    patchPage(id, page.key, { step: 'reading', image });
    let interpretation: SketchInterpretation;
    try {
      interpretation = await gateway.sketch({ name: upload.name, type: upload.type, bytes: upload.bytes });
    } catch (failure) {
      if (id !== serial.current) return;
      patchPage(id, page.key, { state: 'failed', step: undefined, message: sketchErrorMessage(failure) });
      return;
    }
    if (id !== serial.current) return;
    patchPage(id, page.key, { step: 'fitting' });
    const snap = interpretation.snap;
    const fields = sketchFields(interpretation.plan, snap);
    patchPage(id, page.key, { state: 'ready', step: undefined, interpretation, snap, fields,
      choices: defaultSketchChoices(fields, snap.archetypeId) });
  };

  const run = async () => {
    const current = flowRef.current;
    if (!gateway?.sketch || current?.stage.kind !== 'setup') return;
    const id = ++serial.current;
    const pages: SketchPage[] = current.stage.photos.map(photo => ({
      key: photo.key, file: photo.file, fileName: photo.file.name, state: 'waiting', included: true,
    }));
    setFlow({ ...current, id, stage: { kind: 'working', pages } });
    for (const page of pages) {
      await readPage(id, page);
      if (id !== serial.current) return;
    }
    update(id, stage => stage.kind === 'working' ? { kind: 'review', pages: stage.pages } : stage);
  };
  /** "Tentar de novo" for one photo that could not be read. */
  const retryPage = async (key: string) => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'review') return;
    const page = current.stage.pages.find(item => item.key === key);
    if (!page || page.state !== 'failed') return;
    const id = ++serial.current;
    setFlow({ ...current, id, stage: { kind: 'working', pages: current.stage.pages } });
    await readPage(id, page);
    update(id, stage => stage.kind === 'working' ? { kind: 'review', pages: stage.pages } : stage);
  };

  const edit = (key: string, change: (page: ReadySketchPage) => SketchPage) => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'review') return;
    setFlow({ ...current, stage: { kind: 'review', pages: current.stage.pages.map(page =>
      page.key === key && isReadySketchPage(page) ? change(page) : page) } });
  };
  /** Another page type: the fields are fitted again to it (the choices of the previous type do not carry over). */
  const chooseTemplate = (key: string, template: SketchTemplateId) => edit(key, page => {
    if (page.choices.template === template) return page;
    const snap = snapSketchPlan(page.interpretation.plan, { template });
    const fields = sketchFields(page.interpretation.plan, snap);
    return { ...page, snap, fields, choices: defaultSketchChoices(fields, template) };
  });
  const setText = (key: string, field: string, text: string) => edit(key, page => ({ ...page, choices: { ...page.choices,
    texts: { ...page.choices.texts, [field]: { ...page.choices.texts[field], text: text.slice(0, 200) } } } }));
  /** "Os números estão certos" (or, clicked again, back to "to confirm"). */
  const confirmDigits = (key: string, field: string) => edit(key, page => {
    const choice = page.choices.texts[field];
    if (!choice) return page;
    const confirmed = choice.confirmedText === choice.text;
    return { ...page, choices: { ...page.choices, texts: { ...page.choices.texts,
      [field]: confirmed ? { text: choice.text } : { text: choice.text, confirmedText: choice.text } } } };
  });
  const setSource = (key: string, field: string, source: string) => edit(key, page => ({ ...page,
    choices: { ...page.choices, tables: { ...page.choices.tables, [field]: source } } }));
  const include = (key: string, included: boolean) => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'review') return;
    setFlow({ ...current, stage: { kind: 'review', pages: current.stage.pages.map(page => page.key === key ? { ...page, included } : page) } });
  };

  const apply = (sources: readonly SketchTableSource[]) => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'review') return;
    const stage = current.stage;
    const fail = (problem: string) => setFlow({ ...current, stage: { ...stage, problem } });
    if (onBeforeMutation && !onBeforeMutation()) { fail('Conclua ou cancele a edição aberta antes de criar as páginas.'); return; }
    const outcomes = sketchOutcomes(stage.pages, sources);
    // Compiled again for the catalog as it is now.
    const measured = compileSketchPages(session.getSnapshot().document, outcomes, activePageId);
    if (!measured.ok) { fail(measured.message); return; }
    const outcome = applyPagePlan(session, measured.compiled);
    if (!outcome.ok) { fail(outcome.message); return; }
    const toConfirm = outcomes.reduce((total, item) => total + item.toConfirm.length, 0);
    const message = sketchAppliedMessage(session.getSnapshot().document, outcome.applied.pageIds, toConfirm);
    say(current.conversationId, 'assistant', message, true);
    setFlow({ ...current, stage: { kind: 'applied', pages: stage.pages, applied: outcome.applied, at: now(), message } });
    const first = outcome.applied.pageIds[0];
    if (first) onShowPage?.(first);
  };
  /** "Desfazer" on the card: only while the catalog is still as the pages left it. */
  const undo = () => {
    const current = flowRef.current;
    if (current?.stage.kind !== 'applied' || current.stage.undone) return false;
    if (onBeforeMutation && !onBeforeMutation()) return false;
    if (!undoPagePlan(session, current.stage.applied)) return false;
    say(current.conversationId, 'assistant', 'Desfiz as páginas do rascunho. O catálogo voltou ao que era antes; use Refazer se mudar de ideia.');
    setFlow({ ...current, stage: { ...current.stage, undone: true } });
    return true;
  };
  const cancel = () => {
    const current = flowRef.current;
    if (!current) return;
    serial.current++;
    if (current.stage.kind === 'working') {
      setFlow({ ...current, stage: { kind: 'setup', photos: current.stage.pages.map(page => ({ key: page.key, file: page.file })) } });
    } else { releaseUrls(); setFlow(undefined); }
  };
  const discard = () => { serial.current++; releaseUrls(); setFlow(undefined); };

  return { flow, available, start, retry, run, retryPage, chooseTemplate, setText, confirmDigits, setSource, include, apply, undo, cancel, discard };
}
export type SketchDraftController = ReturnType<typeof useSketchDraft>;
