import React from 'react';
import type { DocumentSession } from '../application';
import { ProviderCredentialsSettings } from './ProviderCredentialsSettings';
import {
  ComposerRequestError, nativeComposeGateway, nativeTextEditGateway, readComposerReadiness,
  type ComposerReadiness, type NativeComposeFunctionsClient,
} from './native-compose-client';
import { applyNativeTextEdit, plainSelectedEditorialText, proposeNativeTextEdit,
  type NativeTextEditReply, type SelectedEditorialText } from './native-text-edit';
import {
  applyNativeCompose, requestNativeCompose,
  type NativeComposePlan, type NativeComposeRequest,
} from './native-compose';
import type { WorkbenchEntry } from './workbench-dialogue';
import {
  CONVERSATION_MESSAGE_LIMIT, activeConversation, assistantConversationStore, conversationTitle, conversationsForMenu,
  type AssistantConversations,
} from './assistant-conversations';
import {
  quickToolAvailable, quickToolForRequest, quickToolLabel, runQuickTool, type QuickTool,
} from './assistant-quick-tools';
import { redactConversationMessage } from './conversation-evidence';
import { composerErrorMessage, composerReadinessText } from './composer-messages';
import { clearByokCredential, setByokCredential, useByokCredential } from './byok-session';
import { VerifiedPdfTableReview } from './VerifiedPdfTableReview';
import type { NativePdfCellFillTarget } from './native-pdf-cell-fill';
import type { FitHeightMeasurement } from '../editor/table-fit-height-authoring';
import { sourceIntakeSessionFor } from './intake/intake-store';
import { INTAKE_ACCEPT } from './intake/intake-model';
import { DROP_ZONE_TEXT, useFileDrop } from './intake/SourceDropZone';
import { useSourceIntake } from './intake/useSourceIntake';
import { useSourceTableInsertion } from './intake/useSourceTableInsertion';
import { batchEntries, dropBatchIntoIntake, intakeBatchSummary, intakeBatchesFor } from './intake/intake-batches';
import { IntakeBatchMessage } from './intake/IntakeBatchMessage';
import { ChatHeader } from './chat/ChatHeader';
import { ChatThread } from './chat/ChatThread';
import { ChatComposerBox } from './chat/ChatComposerBox';
import { ChatCard } from './chat/ChatCard';
import type { ChatMenuSection } from './chat/ChatMenu';
import type { SpecTableGateway } from './spec-table/spec-table-gateway';
import { specTableActionLabel, specTablePdfs, useSpecTableDraft } from './spec-table/useSpecTableDraft';
import { SpecTableMessages } from './spec-table/SpecTableMessages';
import { CATALOG_DRAFT_ACTION, useCatalogDraft } from './useCatalogDraft';
import { CatalogDraftMessages } from './DraftPreview';
import { SKETCH_ACCEPT, SKETCH_ACTION, useSketchDraft } from './useSketchDraft';
import { SketchDraftMessages } from './SketchDraft';
import { factSetSketchSource, spreadsheetSketchSources, type SketchTableSource } from './sketch-review';
import './chat/assistant-chat.css';

interface Props {
  session: DocumentSession;
  documentId: string;
  ownerScope?: string;
  client?: NativeComposeFunctionsClient;
  onBeforeMutation?: () => boolean;
  selected?: SelectedEditorialText;
  selectedTable?: NativePdfCellFillTarget;
  /** The editor's current measurement, so a long table from a file continues on the next pages (FR-35). */
  measurement?: FitHeightMeasurement | null;
  /** Page open in the editor (a table from a file goes there, or on a new page right after it). */
  activePageId?: string;
  /** Shows a table inserted from a file in the editor. */
  onShowTable?: (pageId: string, objectId: string) => void;
  /** FR-70: opens a page in the editor (the first page of a catalog built from files). */
  onShowPage?: (pageId: string) => void;
  /**
   * FR-03: the technical review with a hand-written JSON manifest is not on the father's screen. It stays for
   * development and the browser proofs only (the dev server), never in the published app.
   */
  technicalPdfReview?: boolean;
  /** Closes the assistant panel ("Fechar" in the header). */
  onClose?: () => void;
  /** The wider panel ("Ampliar"); without `onWideChange` the header has no "Ampliar". */
  wide?: boolean;
  onWideChange?: (wide: boolean) => void;
  /** Quick action "Abrir a revisão do PDF" (only where the editor can open it). */
  canPublish?: boolean;
  onPublication?: () => void;
  /** What is selected on the page, in plain words ("Selecionado na página: tabela"). */
  selectionLabel?: string;
  /**
   * J2-lite: reads a dropped PDF with the AI (server key) to build a verified specification table. Without it the
   * assistant never sends a file anywhere. Injectable so a proof harness can answer with a controlled provider.
   */
  factExtraction?: SpecTableGateway;
  /**
   * Modo rascunho from outside the conversation ("Página a partir de rascunho…" under "Adicionar página"): photos the
   * person chose there; each new `at` starts reading them here.
   */
  sketchRequest?: { readonly at: number; readonly files: readonly File[] };
}
interface Pending {
  plan: NativeComposePlan;
  revision: number;
  documentId: string;
  requestSequence: number;
  conversationId: string;
  at: number;
}
interface PendingRewrite {
  reply: NativeTextEditReply;
  target: SelectedEditorialText;
  revision: number;
  serial: number;
  conversationId: string;
  at: number;
}
interface InConversation { text: string; conversationId: string }
interface ThreadItem { key: string; at: number; order: number; tail?: string; node: React.ReactNode }

/** One free readiness check per client per minute; reopening the panel reuses it. */
const readinessCache = new WeakMap<NativeComposeFunctionsClient, { at: number; value: Promise<ComposerReadiness> }>();
function cachedReadiness(client: NativeComposeFunctionsClient): Promise<ComposerReadiness> {
  const hit = readinessCache.get(client);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const value = readComposerReadiness(client).catch((): ComposerReadiness => ({ kind: 'available' }));
  readinessCache.set(client, { at: Date.now(), value });
  return value;
}
/** PROVIDER_NOT_CONFIGURED where no personal key can be used: no mention of an option that is not there. */
const SERVER_AI_NOT_CONFIGURED = 'A IA do servidor ainda não foi configurada. Fale com o administrador. Enquanto isso, continue editando à mão.';
const NOT_CHANGED = ' O catálogo não foi alterado.';
/** C-05: shown next to the switched-off send button once the daily limit is known. */
export const DAILY_LIMIT_SEND_EXPLANATION = 'O envio está desligado até amanhã, porque o limite diário de uso da IA foi atingido. '
  + 'O que você escreveu continua guardado nesta caixa.';
export const CONVERSATION_FULL_EXPLANATION = 'Esta conversa chegou ao limite de mensagens. Use “Nova conversa” para continuar.';
const NOT_KEPT = 'Não foi possível guardar a conversa neste navegador. Use “Exportar esta conversa” no menu de opções e tente de novo.';
const FOOTNOTE = 'Os arquivos são lidos aqui no computador e não vão para a IA. A IA não inventa valores técnicos.';
/** With J2-lite a PDF goes to the AI only after “Ler estas páginas”. */
const FOOTNOTE_WITH_PDF_READING = 'Os arquivos são lidos aqui no computador. Só vai para a IA o PDF que você mandar ler para '
  + 'montar uma tabela. A IA não inventa valores técnicos.';
/** Modo rascunho: a photo of a sketch goes to the AI only after “Ler o rascunho”. */
const FOOTNOTE_WITH_SKETCH = 'Os arquivos são lidos aqui no computador. Só vai para a IA o PDF que você mandar ler para '
  + 'montar uma tabela, ou a foto de rascunho que você mandar ler. A IA não inventa valores técnicos.';

/** C-05: the server already said today's AI budget is used up (when the panel opened, or on the last request). */
function dailyLimitKnown(readiness: ComposerReadiness | undefined): boolean {
  if (readiness?.kind === 'blocked') return readiness.code === 'AGENT_DAILY_BUDGET_EXCEEDED';
  return readiness?.kind === 'ready' && readiness.remainingMicrousd !== null && readiness.callReserveMicrousd !== null
    && readiness.remainingMicrousd < readiness.callReserveMicrousd;
}
const clock = (at: string | number) => {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const dayAndTime = (at: string) => {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '' : `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${clock(at)}`;
};
const TABLE_DESIGN = { comparison: 'Comparativo', datasheet: 'Ficha técnica', matrix: 'Matriz compacta' } as const;
const SUGGESTIONS = {
  compare: 'Crie uma página comparando três modelos, com uma tabela comparativa para eu preencher com os dados.',
  cover: 'Crie uma capa e uma apresentação profissional para este catálogo.',
  translate: 'Traduza este texto para o inglês, sem mudar nomes de modelos, siglas nem números.',
} as const;
const bump = (value: number) => value + 1;

/**
 * The assistant of the open catalog, laid out like the AI chat apps: one conversation that fills the panel, the text
 * box fixed at the bottom (files go in with the paperclip or by dropping them anywhere on the panel), and what the AI
 * prepares shown as cards in the conversation, which change the catalog only with "Aplicar".
 */
export function CatalogNativeComposer({ session, documentId, ownerScope, client, onBeforeMutation, selected, selectedTable,
  measurement, activePageId, onShowTable, technicalPdfReview = import.meta.env.DEV, onClose, wide, onWideChange,
  canPublish, onPublication, selectionLabel, factExtraction, onShowPage, sketchRequest }: Props) {
  const store = React.useMemo(() => assistantConversationStore(localStorage, documentId, ownerScope), [documentId, ownerScope]);
  const [conversations, setConversations] = React.useState<AssistantConversations>(() => store.load());
  const conversationsRef = React.useRef(conversations);
  const active = activeConversation(conversations);
  const activeIdRef = React.useRef(active.id);
  activeIdRef.current = active.id;
  const turns = active.entries;
  const [message, setMessage] = React.useState('');
  // The server key is the default. A personal key lives outside this panel (byok-session), so closing it keeps the key.
  const ownKey = useByokCredential(ownerScope);
  const requestSerial = React.useRef(0);
  const inFlightText = React.useRef('');
  const [busy, setBusy] = React.useState<false | { kind: 'compose' | 'rewrite'; conversationId: string }>(false);
  const [pending, setPending] = React.useState<Pending>();
  const [rewriteMode, setRewriteMode] = React.useState(false);
  const [pendingRewrite, setPendingRewrite] = React.useState<PendingRewrite>();
  const editableSelectedText = selected ? plainSelectedEditorialText(selected) : null;
  const [error, setErrorState] = React.useState<InConversation>();
  const [unsent, setUnsent] = React.useState<InConversation>();
  const [keyPanelOpen, setKeyPanelOpen] = React.useState(false);
  const [readiness, setReadiness] = React.useState<ComposerReadiness>();
  const [limitAnswered, setLimitAnswered] = React.useState(false);
  const [follow, setFollow] = React.useState(0);
  /** Messages "Apliquei…" that can still be undone from the conversation, with the catalog version right after. */
  const [undoable, setUndoable] = React.useState<ReadonlyMap<string, number>>(() => new Map());
  const snapshot = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  // A personal key does not use the server's daily budget.
  const dailyLimitReached = !ownKey && (limitAnswered || dailyLimitKnown(readiness));
  // Wait for readiness before offering a new key. Keep an unlocked key and the legacy available state usable.
  const ownKeyOffered = Boolean(client) && (Boolean(ownKey) || readiness?.kind === 'available' ||
    (readiness?.kind === 'ready' && readiness.byok));
  const ownKeyOfferedRef = React.useRef(ownKeyOffered);
  ownKeyOfferedRef.current = ownKeyOffered;
  const readinessText = !client ? 'A IA não está disponível nesta tela.'
    : !ownKey && !ownKeyOffered && readiness?.kind === 'ready' && !readiness.serverKey ? SERVER_AI_NOT_CONFIGURED
      : composerReadinessText(readiness, !!ownKey);
  const proposalRef = React.useRef<HTMLDivElement>(null);
  const noticeRef = React.useRef<HTMLDivElement>(null);
  const focusNotice = React.useRef(false);
  const input = React.useRef<HTMLTextAreaElement>(null);
  const filePicker = React.useRef<HTMLInputElement>(null);
  const sketchPicker = React.useRef<HTMLInputElement>(null);
  const conversationFull = turns.length > CONVERSATION_MESSAGE_LIMIT - 2;
  const setError = (text: string, conversationId = activeIdRef.current) =>
    setErrorState(text ? { text, conversationId } : undefined);

  // FR-64: the files of this catalog outlive the panel (closing it or Esc keep them).
  const intake = React.useMemo(() => sourceIntakeSessionFor(documentId), [documentId]);
  const files = useSourceIntake({ locale: snapshot.document.locale, store: intake.files });
  const insertion = useSourceTableInsertion({ session, measurement, activePageId, onBeforeMutation, onShowTable, store: intake.insertion });
  const batchStore = intakeBatchesFor(intake);
  const batches = React.useSyncExternalStore(batchStore.subscribe, batchStore.get, batchStore.get);
  const working = insertion.phase !== 'idle';
  const addFiles = (list: File[]) => {
    insertion.dismissNotice();
    if (dropBatchIntoIntake(intake, list, { conversationId: activeIdRef.current })) setFollow(bump);
  };
  // Files let go anywhere on the assistant join the catalog's files; the browser never opens them in place of the editor.
  const drop = useFileDrop(addFiles, working);
  const [noticeAt, setNoticeAt] = React.useState(0);
  React.useEffect(() => {
    if (insertion.notice) setNoticeAt(Date.now());
  }, [insertion.notice]);
  React.useEffect(() => {
    if (insertion.notice && noticeAt && focusNotice.current) { focusNotice.current = false; noticeRef.current?.focus(); }
  }, [insertion.notice, noticeAt]);

  React.useEffect(() => { input.current?.focus(); }, []);
  // Selecting something else on the page only leaves rewrite mode. A paid
  // proposal or a request in flight is kept (it carries its own target).
  React.useEffect(() => { setRewriteMode(false); }, [selected?.objectId]);
  // Late answers after the panel closes are ignored and never stored.
  React.useEffect(() => () => { requestSerial.current++; }, []);
  React.useEffect(() => {
    if (!client) return;
    let alive = true;
    void cachedReadiness(client).then(value => { if (alive) setReadiness(value); });
    return () => { alive = false; };
  }, [client]);

  const saveTurn = (conversationId: string, role: WorkbenchEntry['role'], content: string, action?: WorkbenchEntry['action']) => {
    try {
      const record: WorkbenchEntry = {
        id: crypto.randomUUID(), role, content: redactConversationMessage(content),
        timestamp: new Date().toISOString(),
        revision: session.getSnapshot().localSequence,
        ...(action ? { action } : {}),
      };
      const next = store.append(conversationsRef.current, conversationId, record);
      conversationsRef.current = next;
      setConversations(next);
      return record;
    } catch (failure) {
      setError(failure instanceof Error && failure.message === 'DIALOGUE_CAP_REACHED' ? CONVERSATION_FULL_EXPLANATION : NOT_KEPT, conversationId);
      return null;
    }
  };
  /** A failed or cancelled message is never stored as sent: it returns to the text box. */
  const restoreUnsent = (text: string, conversationId: string) => {
    setUnsent({ text, conversationId });
    setMessage(current => current || text);
  };
  const changeConversations = (next: AssistantConversations) => {
    conversationsRef.current = next;
    setConversations(next);
    setErrorState(undefined);
    setUnsent(undefined);
    setFollow(bump);
    input.current?.focus();
  };
  /** A quick action from the menu (or a short typed request for one, kept in the person's own words). */
  const runTool = (tool: QuickTool, request = quickToolLabel(tool)) => {
    const conversationId = activeIdRef.current;
    const response = runQuickTool(tool, { session, onBeforeMutation, canPublish, onPublication, onEditor: onClose });
    setError('');
    if (saveTurn(conversationId, 'user', request, tool)) saveTurn(conversationId, 'assistant', response, tool);
    setFollow(bump);
  };
  const send = async () => {
    const text = message.trim();
    if (!text || text.length > 1200 || busy || dailyLimitReached || conversationFull) return;
    const conversationId = activeIdRef.current;
    // A short request for a quick action ("Desfaça") runs here, without the AI.
    const tool = rewriteMode ? null : quickToolForRequest(text, { onPublication, onEditor: onClose });
    if (tool) {
      setMessage(''); setUnsent(undefined);
      runTool(tool, text);
      return;
    }
    if (!client) {
      setError('A IA não está disponível nesta tela. Continue editando manualmente.');
      return;
    }
    // Never ask a provider to mutate. Only request a typed proposal; approval
    // will execute canonical document commands after a CAS revision check.
    const isRewriting = rewriteMode && !!selected;
    const target = selected;
    const before = session.getSnapshot();
    const earlier = conversationsRef.current.conversations.find((conversation) => conversation.id === conversationId)?.entries ?? [];
    // Quick actions are local records: the AI only sees the real conversation.
    const history: NativeComposeRequest['history'] = earlier.filter(turn => !turn.action).slice(-8).map(turn => ({
      role: turn.role, message: redactConversationMessage(turn.content).slice(0, 800),
    }));
    const sequence = ++requestSerial.current;
    inFlightText.current = text;
    // A proposal already received stays until the new answer arrives (or is rejected, or the catalog changes):
    // a failed or cancelled request never throws away what was already paid for.
    setBusy({ kind: isRewriting ? 'rewrite' : 'compose', conversationId }); setError(''); setUnsent(undefined);
    setMessage('');
    setFollow(bump);
    try {
      const reply = isRewriting && target
        ? await proposeNativeTextEdit(target, text, nativeTextEditGateway(client, ownKey), history)
        : await requestNativeCompose(before.document, text, nativeComposeGateway(client, ownKey), history);
      if (sequence !== requestSerial.current) return;
      if (session.getSnapshot().localSequence !== before.localSequence ||
          session.getSnapshot().document.id !== before.document.id) {
        restoreUnsent(text, conversationId);
        setError('O catálogo mudou enquanto a IA respondia. Envie o pedido de novo para a versão atual.', conversationId);
        return;
      }
      if (!saveTurn(conversationId, 'user', text)) return;
      if (reply.status === 'clarification') {
        saveTurn(conversationId, 'assistant', reply.question);
      } else if ('revisedText' in reply) {
        if (!isRewriting || !target) throw new Error('TEXT_EDIT_CONTEXT_LOST');
        const said = saveTurn(conversationId, 'assistant', 'Preparei uma reescrita do texto selecionado. Confira o antes e depois antes de aplicar.');
        // One proposal on screen at a time: a rewrite replaces a page proposal, and the reverse.
        setPending(undefined);
        setPendingRewrite({ reply, target, revision: before.localSequence, serial: sequence, conversationId,
          at: said ? Date.parse(said.timestamp) : Date.now() });
      } else {
        const said = saveTurn(conversationId, 'assistant', reply.summary +
          ' Revise a proposta de ' + reply.pages.length + ' página(s) antes de aplicar. Nenhum valor técnico será inventado.');
        setPendingRewrite(undefined);
        setPending({ plan: reply, revision: before.localSequence, documentId: before.document.id, requestSequence: sequence,
          conversationId, at: said ? Date.parse(said.timestamp) : Date.now() });
      }
    } catch (failure) {
      if (sequence === requestSerial.current) {
        restoreUnsent(text, conversationId);
        if (failure instanceof ComposerRequestError && failure.code === 'AGENT_DAILY_BUDGET_EXCEEDED' && !ownKey) setLimitAnswered(true);
        setError(failure instanceof ComposerRequestError && failure.code === 'PROVIDER_NOT_CONFIGURED' && !ownKey &&
          !ownKeyOfferedRef.current ? SERVER_AI_NOT_CONFIGURED + NOT_CHANGED : composerErrorMessage(failure, { usingOwnKey: !!ownKey }),
        conversationId);
      }
    } finally {
      if (sequence === requestSerial.current) setBusy(false);
    }
  };
  const cancel = () => {
    if (!busy) return;
    requestSerial.current++;
    restoreUnsent(inFlightText.current, busy.conversationId);
    setBusy(false);
    setError('');
  };
  const rememberUndo = (entry: WorkbenchEntry | null) => {
    const revision = session.getSnapshot().localSequence;
    if (entry) setUndoable((current) => new Map(current).set(entry.id, revision));
  };
  const approve = () => {
    if (!pending || busy) return;
    if (session.getSnapshot().document.id !== pending.documentId ||
        session.getSnapshot().localSequence !== pending.revision) {
      setPending(undefined);
      setError('A proposta ficou desatualizada porque o catálogo mudou. Peça de novo à IA.');
      return;
    }
    if (onBeforeMutation && !onBeforeMutation()) {
      setError('Conclua ou cancele a edição aberta antes de aplicar páginas.');
      return;
    }
    try {
      const result = applyNativeCompose(session, pending.plan, pending.revision);
      rememberUndo(saveTurn(pending.conversationId, 'assistant', 'Apliquei ' + result.pagesAdded + ' página(s) e ' +
        result.tablesAdded + ' tabela(s) editáveis no catálogo. Os campos técnicos ficam vazios; revise e depois salve.'));
      setPending(undefined);
      setError('');
    } catch {
      setPending(undefined);
      setError('A aplicação foi bloqueada por conflito ou documento inválido. Confira o editor antes de tentar novamente.');
    }
  };
  const approveRewrite = () => {
    const proposal = pendingRewrite;
    if (!proposal || proposal.reply.status !== 'proposal' || busy) return;
    if (onBeforeMutation && !onBeforeMutation()) {
      setError('Conclua ou cancele a edição de texto em andamento antes de aprovar a reescrita.');
      return;
    }
    try {
      applyNativeTextEdit(session, proposal.target, proposal.reply, proposal.revision);
      rememberUndo(saveTurn(proposal.conversationId, 'assistant', 'Reescrevi o texto editorial selecionado no documento. ' +
        'Você pode desfazer esta alteração e deve salvar depois de revisar.'));
      setPendingRewrite(undefined);
      setError('');
      setRewriteMode(false);
    } catch {
      setPendingRewrite(undefined);
      setError('O texto mudou ou não era seguro alterar. Nenhuma reescrita foi aprovada.');
    }
  };
  // J2-lite: a verified specification table from a dropped PDF, as cards in this conversation.
  const specTable = useSpecTableDraft({
    gateway: factExtraction, session, activePageId, onBeforeMutation, onShowTable,
    say: (conversationId, role, text, canUndo) => {
      const entry = saveTurn(conversationId, role, text, 'spec-table');
      if (canUndo) rememberUndo(entry);
      setFollow(bump);
    },
  });
  // FR-70: the whole catalog from the files of one message, as cards in this conversation.
  const catalogDraft = useCatalogDraft({
    gateway: factExtraction, session, activePageId, onBeforeMutation, onShowPage,
    say: (conversationId, role, text, canUndo) => {
      const entry = saveTurn(conversationId, role, text, 'catalog-draft');
      if (canUndo) rememberUndo(entry);
      setFollow(bump);
    },
  });
  // Modo rascunho: photos of pages drawn on paper → the areas the AI understood → the same Aplicar as above.
  const sketch = useSketchDraft({
    gateway: factExtraction, session, activePageId, onBeforeMutation, onShowPage,
    say: (conversationId, role, text, canUndo) => {
      const entry = saveTurn(conversationId, role, text, 'catalog-draft');
      if (canUndo) rememberUndo(entry);
      setFollow(bump);
    },
  });
  const sketchRequestAt = React.useRef(sketchRequest?.at);
  React.useEffect(() => {
    if (!sketchRequest || sketchRequest.at === sketchRequestAt.current) return;
    sketchRequestAt.current = sketchRequest.at;
    sketch.start(sketchRequest.files, activeIdRef.current);
    setFollow(bump);
    // Only a new request starts reading; the controller itself changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sketchRequest?.at]);
  // Files already checked in this conversation that can fill a drawn table (spreadsheets; the PDF table read and checked).
  const sketchSources = React.useMemo<SketchTableSource[]>(() => {
    const sets: SketchTableSource[] = [];
    const spec = specTable.flow?.stage;
    if (spec && (spec.kind === 'review' || spec.kind === 'applied')) sets.push(factSetSketchSource(`pdf:tabela:${specTable.flow!.at}`, spec.set));
    const draft = catalogDraft.flow?.stage;
    const draftSet = draft?.kind === 'preview' ? draft.set : draft?.kind === 'applied' ? draft.planned.set : undefined;
    if (draftSet) sets.push(factSetSketchSource(`pdf:catalogo:${catalogDraft.flow!.at}`, draftSet));
    return [...spreadsheetSketchSources(files.entries), ...sets];
  }, [files.entries, specTable.flow, catalogDraft.flow]);
  const sketchBusy = sketch.flow?.stage.kind === 'working' || sketch.flow?.stage.kind === 'checking';
  const undoFromConversation = (entryId: string) => {
    if (undoable.get(entryId) !== session.getSnapshot().localSequence || !session.getSnapshot().canUndo) return;
    if (onBeforeMutation && !onBeforeMutation()) {
      setError('Conclua ou cancele a edição aberta antes de desfazer.');
      return;
    }
    session.undo();
    setUndoable((current) => { const next = new Map(current); next.delete(entryId); return next; });
    saveTurn(activeIdRef.current, 'assistant', 'Desfiz a alteração. O catálogo voltou ao que era antes; use Refazer se mudar de ideia.', 'undo');
    setFollow(bump);
  };
  const adjust = (prefix: string) => {
    setMessage((current) => current || prefix);
    input.current?.focus();
  };
  const fill = (text: string) => { setMessage(text); input.current?.focus(); };
  const exportConversation = () => {
    const json = JSON.stringify({
      version: 2, scope: 'CATALOG_ASSISTANT_CONVERSATION', documentId, conversationId: active.id,
      count: turns.length, entries: turns,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const anchor = globalThis.document.createElement('a');
    anchor.href = url; anchor.download = 'conversa-do-assistente.json';
    globalThis.document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };

  // ------------------------------------------------------------------ the conversation, in order
  const inActive = (item: { conversationId?: string } | undefined): boolean =>
    Boolean(item) && (!item?.conversationId || item.conversationId === active.id);
  const items: ThreadItem[] = turns.map((turn) => ({
    key: turn.id, at: Date.parse(turn.timestamp) || 0, order: 0,
    node: <article key={turn.id} className={'ai-chat-msg ai-chat-turn ai-chat-' + turn.role} data-chat-action={turn.action}>
      <div className="ai-chat-bubble" title={`Enviada às ${clock(turn.timestamp)}`}>
        <span className="ai-chat-sr">{turn.role === 'user' ? 'Você: ' : 'Assistente: '}</span>
        <p>{turn.content}</p>
        {undoable.get(turn.id) === snapshot.localSequence && snapshot.canUndo && (
          <button type="button" className="ai-chat-link" onClick={() => undoFromConversation(turn.id)}>Desfazer</button>
        )}
      </div>
    </article>,
  }));
  for (const batch of batches) {
    if (!inActive(batch)) continue;
    const entries = batchEntries(batch, files.entries);
    if (!entries.length) continue;
    const pdfs = specTable.available ? specTablePdfs(entries) : [];
    const catalogPdfs = catalogDraft.available ? specTablePdfs(entries) : [];
    const specBusy = specTable.flow?.stage.kind === 'reading' || specTable.flow?.stage.kind === 'checking'
      || catalogDraft.flow?.stage.kind === 'working' || catalogDraft.flow?.stage.kind === 'checking' || sketchBusy;
    const sketchPhotos = sketch.available
      ? entries.filter(entry => entry.kind === 'photo' && entry.state !== 'duplicate' && entry.state !== 'skipped') : [];
    items.push({
      key: batch.id, at: batch.at, order: 1,
      tail: batch.id + intakeBatchSummary(entries).text + pdfs.length + catalogPdfs.length + sketchPhotos.length,
      node: <IntakeBatchMessage key={batch.id} batch={batch} entries={entries} working={working}
        onInsert={insertion.insert} onReread={files.reread} onBeforeChange={insertion.dismissNotice}
        onInserted={() => { focusNotice.current = true; }}
        actions={pdfs.length > 0 || catalogPdfs.length > 0 || sketchPhotos.length > 0 ? <div className="ai-chat-suggestions ai-spec-start">
          {catalogPdfs.length > 0 && <button type="button" data-catalog-draft-start="" disabled={working || specBusy}
            onClick={() => catalogDraft.start(batch.id, entries, active.id)}>{CATALOG_DRAFT_ACTION}</button>}
          {pdfs.length > 0 && <button type="button" data-spec-table-start="" disabled={working || specBusy}
            onClick={() => specTable.start(batch.id, entries, active.id)}>{specTableActionLabel(pdfs.length)}</button>}
          {sketchPhotos.length > 0 && <button type="button" data-sketch-start="" disabled={working || specBusy}
            onClick={() => sketch.start(sketchPhotos.map(entry => entry.file), active.id)}>
            {sketchPhotos.length === 1 ? 'Esta foto é um rascunho: criar a página' : 'Estas fotos são rascunhos: criar as páginas'}</button>}
        </div> : undefined} />,
    });
  }
  const shownCatalogDraft = inActive(catalogDraft.flow) ? catalogDraft.flow : undefined;
  if (shownCatalogDraft) {
    items.push({
      key: `catalog-draft:${shownCatalogDraft.at}`, at: shownCatalogDraft.at, order: 2,
      tail: `catalog-draft:${shownCatalogDraft.id}:${shownCatalogDraft.stage.kind}`
        + (shownCatalogDraft.stage.kind === 'working' ? `:${shownCatalogDraft.stage.step}` : ''),
      node: <CatalogDraftMessages key={`catalog-draft:${shownCatalogDraft.at}`} controller={catalogDraft} document={snapshot.document}
        activePageId={activePageId} />,
    });
  }
  const shownSketch = inActive(sketch.flow) ? sketch.flow : undefined;
  if (shownSketch) {
    const sketchStage = shownSketch.stage;
    items.push({
      key: `sketch:${shownSketch.at}`, at: shownSketch.at, order: 2,
      tail: `sketch:${shownSketch.id}:${sketchStage.kind}` + (sketchStage.kind === 'working'
        ? `:${sketchStage.pages.map(page => `${page.state}${page.step ?? ''}`).join(',')}` : ''),
      node: <SketchDraftMessages key={`sketch:${shownSketch.at}`} controller={sketch} document={snapshot.document}
        activePageId={activePageId} sources={sketchSources} />,
    });
  }
  const shownSpecTable = inActive(specTable.flow) ? specTable.flow : undefined;
  if (shownSpecTable) {
    items.push({
      key: `spec-table:${shownSpecTable.at}`, at: shownSpecTable.at, order: 2,
      tail: `spec-table:${shownSpecTable.id}:${shownSpecTable.stage.kind}`,
      node: <SpecTableMessages key={`spec-table:${shownSpecTable.at}`} controller={specTable} document={snapshot.document}
        activePageId={activePageId} onShowTable={onShowTable} />,
    });
  }
  if (insertion.notice && noticeAt) {
    const notice = insertion.notice;
    items.push({
      key: 'notice', at: noticeAt, order: 3, tail: 'notice' + notice.text,
      node: <div key="notice" className="ai-chat-msg ai-chat-assistant">
        <div ref={noticeRef} tabIndex={-1} className="ai-chat-bubble ai-chat-notice" data-tone={notice.tone}
          role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}</div>
      </div>,
    });
  }
  const shownRewrite = inActive(pendingRewrite) ? pendingRewrite : undefined;
  if (shownRewrite && shownRewrite.reply.status === 'proposal') {
    items.push({
      key: `rewrite:${shownRewrite.serial}`, at: shownRewrite.at, order: 2,
      node: <ChatCard key={`rewrite:${shownRewrite.serial}`} label="Revisão de texto selecionado" title="Antes de alterar, confira"
        cardRef={proposalRef}
        actions={<>
          <button type="button" className="vnext-btn-primary" disabled={!!busy} onClick={approveRewrite}>Aplicar</button>
          <button type="button" onClick={() => { setRewriteMode(true); adjust(''); }}>Ajustar</button>
          <button type="button" onClick={() => setPendingRewrite(undefined)}>Descartar</button>
        </>}>
        <p><strong>Texto atual:</strong> {plainSelectedEditorialText(shownRewrite.target)}</p>
        <p><strong>Nova proposta:</strong> {shownRewrite.reply.revisedText}</p>
      </ChatCard>,
    });
  }
  const shownPending = inActive(pending) ? pending : undefined;
  if (shownPending) {
    items.push({
      key: `pages:${shownPending.requestSequence}`, at: shownPending.at, order: 2,
      node: <ChatCard key={`pages:${shownPending.requestSequence}`} label="Proposta de páginas" title="Proposta para revisar"
        cardRef={proposalRef}
        actions={<>
          <button type="button" className="vnext-btn-primary" disabled={!!busy} onClick={approve}>Aplicar</button>
          <button type="button" onClick={() => adjust('Ajuste a proposta: ')}>Ajustar</button>
          <button type="button" onClick={() => setPending(undefined)}>Descartar</button>
        </>}>
        <p>{shownPending.plan.summary}</p>
        <ol className="ai-chat-pages">{shownPending.plan.pages.map((page, i) => <li key={i}>
          <span className="ai-chat-page-thumb" data-page-kind={page.type} aria-hidden="true"><i /><i /><i /></span>
          <span><strong>Página {i + 1}: {page.heading}</strong>
            <span>{page.type === 'comparison'
              ? ' · ' + TABLE_DESIGN[page.table?.design ?? 'comparison'] + ': ' + page.table?.columns.length + ' colunas × ' + (page.table!.rowLabels.length + 1) + ' linhas, dados ainda vazios'
              : page.type === 'cover' ? ' · Capa' : ' · Conteúdo editorial'}</span></span>
        </li>)}</ol>
      </ChatCard>,
    });
  }
  items.sort((a, b) => a.at - b.at || a.order - b.order);
  if (unsent && inActive(unsent)) {
    items.push({
      key: 'unsent', at: Infinity, order: 0, tail: 'unsent' + unsent.text,
      node: <article key="unsent" className="ai-chat-msg ai-chat-user ai-chat-unsent" aria-label="Mensagem não enviada">
        <div className="ai-chat-bubble">
          <strong>Você · não enviado</strong>
          <p>{unsent.text}</p>
          <small>A mensagem voltou para a caixa de texto. Ajuste se quiser e envie de novo.</small>
        </div>
      </article>,
    });
  }
  if (busy && busy.conversationId === active.id) {
    items.push({
      key: 'busy', at: Infinity, order: 1,
      node: <div key="busy" className="ai-chat-msg ai-chat-assistant">
        <p className="ai-chat-bubble ai-chat-typing" role="status"><span className="ai-chat-dots" aria-hidden="true"><i /><i /><i /></span>
          {busy.kind === 'rewrite' ? 'Gemini está preparando uma reescrita do texto…' : 'Gemini está preparando uma proposta de páginas…'}</p>
      </div>,
    });
  }
  const canRetry = inActive(unsent) && Boolean(message.trim()) && !busy && !dailyLimitReached && Boolean(client);
  if (error && inActive(error)) {
    items.push({
      key: 'error', at: Infinity, order: 2, tail: 'error' + error.text,
      node: <div key="error" className="ai-chat-msg ai-chat-system" role="alert">
        <p>{error.text}</p>
        {canRetry && <button type="button" className="ai-chat-link" onClick={() => { void send(); }}>
          Tentar de novo</button>}
      </div>,
    });
  }
  const empty = items.length === 0;
  // The spec-table preview is not revealed from its top: the conversation follows to its end, where "Aplicar" is.
  const revealKey = shownPending ? `pages:${shownPending.requestSequence}`
    : shownRewrite?.reply.status === 'proposal' ? `rewrite:${shownRewrite.serial}` : '';

  // ------------------------------------------------------------------ header menus
  const history: ChatMenuSection[] = [{
    items: conversationsForMenu(conversations).map((conversation) => ({
      id: conversation.id,
      label: conversationTitle(conversation),
      detail: `${dayAndTime(conversation.entries.at(-1)?.timestamp ?? conversation.startedAt)} · ${conversation.entries.length} ${conversation.entries.length === 1 ? 'mensagem' : 'mensagens'}`,
      current: conversation.id === active.id,
      onSelect: () => {
        try { changeConversations(store.select(conversationsRef.current, conversation.id)); } catch { setError(NOT_KEPT); }
      },
    })),
  }];
  const toolContext = { onPublication, onEditor: onClose };
  const tools = (['compact', 'undo', 'redo', 'publication'] as const).filter((tool) => quickToolAvailable(tool, toolContext));
  const settings: ChatMenuSection[] = [
    {
      label: 'Chave do Gemini',
      items: ownKey
        ? [{ id: 'server-key', label: 'Voltar a usar a IA do servidor', onSelect: () => { clearByokCredential(); setError(''); } }]
        : ownKeyOffered ? [{ id: 'own-key', label: 'Usar minha própria chave', onSelect: () => setKeyPanelOpen(true) }] : [],
    },
    {
      label: 'Ações rápidas (sem IA)',
      items: [
        ...tools.map((tool) => ({
          id: tool, label: quickToolLabel(tool), onSelect: () => { runTool(tool); },
          disabled: (tool === 'undo' && !snapshot.canUndo) || (tool === 'redo' && !snapshot.canRedo),
        })),
        { id: 'export', label: 'Exportar esta conversa', onSelect: exportConversation, disabled: turns.length === 0 },
      ],
    },
  ];

  const sendBlocked = dailyLimitReached ? { id: 'gemini-send-blocked', text: DAILY_LIMIT_SEND_EXPLANATION }
    : conversationFull ? { id: 'gemini-send-blocked', text: CONVERSATION_FULL_EXPLANATION } : undefined;
  const selectionContext = (editableSelectedText || selectionLabel) ? (
    <div className="ai-chat-context" data-assistant-selection="">
      {selectionLabel && <span className="ai-chat-context-label">{selectionLabel}</span>}
      {editableSelectedText && <>
        <q title={editableSelectedText}>{editableSelectedText}</q>
        <button type="button" aria-pressed={rewriteMode} disabled={!!busy}
          onClick={() => { setRewriteMode(value => !value); setError(''); input.current?.focus(); }}>
          {rewriteMode ? 'Voltar a criar páginas' : 'Reescrever este texto com Gemini'}
        </button>
        {rewriteMode && <small>Ao enviar, este trecho vai para a IA propor uma revisão. Você confere antes de alterar o catálogo.</small>}
      </>}
    </div>
  ) : undefined;

  return <section className="ai-chat" aria-label="Assistente de criação do catálogo" data-source-intake=""
    data-has-error={Boolean(error)} data-dragging={drop.dragging ? 'true' : undefined} {...drop.handlers}>
    <ChatHeader readiness={readinessText} readinessKind={ownKey ? 'own-key' : readiness?.kind ?? (client ? 'checking' : 'none')}
      onNewConversation={() => { try { changeConversations(store.start(conversationsRef.current)); } catch { setError(NOT_KEPT); } }}
      newConversationDisabled={turns.length === 0} history={history} settings={settings}
      wide={wide} onWideChange={onWideChange} onClose={onClose} />
    {keyPanelOpen && ownKeyOffered && !ownKey && (
      <div id="catalog-gemini-settings" className="ai-compose-settings" role="region" aria-label="Usar minha própria chave">
        <div className="ai-compose-settings-head">
          <strong>Usar minha própria chave</strong>
          <button type="button" onClick={() => { setKeyPanelOpen(false); input.current?.focus(); }}>Fechar</button>
        </div>
        <ProviderCredentialsSettings onlyProvider="gemini" initiallyUnlocked={[]}
          onUnlock={(provider, key) => {
            if (provider !== 'gemini') {
              setError('Somente uma chave do Gemini funciona nesta tela.');
              return;
            }
            try {
              setByokCredential(key, ownerScope);
              setKeyPanelOpen(false);
              setError('');
            } catch {
              setError('Essa chave não parece válida. Confira e tente de novo.');
            }
          }}
          onLock={() => clearByokCredential()}
        />
      </div>
    )}
    <ChatThread label="Conversa com o assistente" tailKey={items.map((item) => item.tail ?? item.key).join('|')} followKey={follow}
      empty={empty} revealKey={revealKey} revealRef={proposalRef}>
      {empty && <div className="ai-chat-welcome">
        <p className="ai-chat-welcome-title">O que vamos fazer neste catálogo?</p>
        <div className="ai-chat-suggestions">
          {catalogDraft.available && <button type="button" disabled={working} onClick={() => filePicker.current?.click()}>Montar um catálogo inteiro a partir de PDFs</button>}
          <button type="button" disabled={working} onClick={() => filePicker.current?.click()}>Montar uma ficha técnica a partir de um PDF</button>
          {sketch.available && <button type="button" data-sketch-welcome="" disabled={working || sketchBusy}
            onClick={() => sketchPicker.current?.click()}>{`${SKETCH_ACTION} em papel (fotos)`}</button>}
          <button type="button" onClick={() => fill(SUGGESTIONS.compare)}>Comparar modelos</button>
          <button type="button" onClick={() => fill(SUGGESTIONS.cover)}>Criar uma capa e uma apresentação</button>
          {editableSelectedText && <button type="button" disabled={!!busy}
            onClick={() => { setRewriteMode(true); fill(SUGGESTIONS.translate); }}>Traduzir o texto selecionado para inglês</button>}
        </div>
        {files.entries.length === 0 && <button type="button" className="ai-chat-dropzone" disabled={working}
          onClick={() => filePicker.current?.click()}>{DROP_ZONE_TEXT}</button>}
        <small>A IA cria até 4 páginas por pedido. As tabelas chegam vazias: os números técnicos você preenche a partir das fontes.</small>
      </div>}
      {items.map((item) => item.node)}
      {technicalPdfReview && selectedTable && <VerifiedPdfTableReview key={selectedTable.objectId}
        session={session} target={selectedTable} onBeforeMutation={onBeforeMutation}/>}
    </ChatThread>
    <ChatComposerBox inputId="gemini-catalog-command" inputRef={input} value={message} maxLength={1200}
      label={rewriteMode ? 'Como deseja reescrever o texto selecionado?' : 'Seu pedido ao Gemini'}
      placeholder={rewriteMode ? 'Como reescrever? (Enter envia)' : 'Escreva seu pedido… (Enter envia)'}
      onChange={setMessage} onSend={() => { void send(); }}
      send={{
        label: rewriteMode ? 'Pedir reescrita ao Gemini' : 'Enviar ao Gemini',
        disabled: !message.trim() || !!busy || dailyLimitReached || conversationFull,
        blockedReason: sendBlocked,
        hint: !message.trim() ? 'Escreva um pedido para enviar' : undefined,
      }}
      busy={Boolean(busy)} onCancel={cancel}
      onAttach={() => filePicker.current?.click()} attachDisabled={working}
      files={files.entries} onRemoveFile={files.remove}
      context={selectionContext} footnote={sketch.available ? FOOTNOTE_WITH_SKETCH : factExtraction ? FOOTNOTE_WITH_PDF_READING : FOOTNOTE} />
    <input ref={filePicker} type="file" multiple accept={INTAKE_ACCEPT} hidden aria-label="Escolher arquivos" tabIndex={-1}
      disabled={working}
      onChange={(event) => {
        const list = Array.from(event.target.files ?? []);
        // The same file can be chosen again after it was taken out of the list.
        event.target.value = '';
        if (list.length) addFiles(list);
      }} />
    <input ref={sketchPicker} type="file" multiple accept={SKETCH_ACCEPT} hidden aria-label="Escolher fotos do rascunho" tabIndex={-1}
      disabled={working || sketchBusy}
      onChange={(event) => {
        const list = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (list.length) { sketch.start(list, active.id); setFollow(bump); }
      }} />
    {drop.dragging && <div className="ai-chat-drop-overlay" aria-hidden="true">Solte aqui para ler os arquivos</div>}
  </section>;
}
