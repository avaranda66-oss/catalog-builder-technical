import React from 'react';
import { FileText, Plus, Redo2, Save as SaveIcon, Undo2 } from 'lucide-react';
import { projectEditableRichText, type ApplicationAction, type DocumentSession, type FrameU } from '../application';
import {
  mmToU,
  qCss,
  uToQ,
  type CatalogDocument,
  type Diagnostic,
  type EditorialObject,
  type Page,
  type RichText,
  type TextObject,
} from '../domain';
import { compilePlans, DocumentRenderer } from '../rendering';
import type {
  AuthoringBarrierResult,
  SaveProjection,
  VNextPersistenceRuntime,
} from '../persistence';
import {
  diagnosticMessage,
  EditorDiagnosticsProbe,
  immediateAuthoringDiagnostics,
  isCurrentDiagnosticSource,
  mergeDiagnostics,
  W2D_DIAGNOSTIC_CODES,
} from './authoring-diagnostics';
import { alternateDemoAssetId, createInsertSpec, W2C_DEMO_ASSET_URLS, type InsertTool } from './editor-defaults';
import { EditorInteractionController, frameToU, type FinishGestureResult, type GestureKind, type GesturePreview, type ResizeHandle } from './editor-interaction';
import { W2E_PAGE_TEMPLATE_ID } from './page-template-fixtures';

type EditorSelectionState = { activePageId: string; selectedObjectIds: readonly string[]; mode: 'select' | 'text-edit' };
type InspectorDraft = { x: string; y: string; width: string; height: string };
type TextEditSession = {
  objectId: string;
  pageId: string;
  expectedText: RichText;
  draft: string;
};
const resizeHandles: readonly ResizeHandle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const technicalSymbols = ['±', '°C', 'Ω', 'µ', '≤', '≥', '≈'] as const;
const SNAP_RADIUS_PX = 8;

function createGestureTransactionId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

function useDocumentSession(session: DocumentSession) {
  return React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

function visualObjects(page: Page): EditorialObject[] {
  return page.objects
    .map((object, index) => ({ object, index }))
    .sort((left, right) => left.object.zIndex === right.object.zIndex
      ? left.index - right.index
      : left.object.zIndex - right.object.zIndex)
    .map(({ object }) => object);
}

function frameStyle(frameU: FrameU): React.CSSProperties {
  return {
    left: qCss(uToQ(frameU.xU)),
    top: qCss(uToQ(frameU.yU)),
    width: qCss(uToQ(frameU.widthU)),
    height: qCss(uToQ(frameU.heightU)),
  };
}

function safeAreaFrameU(page: Page): FrameU | undefined {
  if (!page.safeArea) return undefined;
  const pageWidthU = mmToU(page.widthMm);
  const pageHeightU = mmToU(page.heightMm);
  const leftU = mmToU(page.safeArea.leftMm);
  const rightU = mmToU(page.safeArea.rightMm);
  const topU = mmToU(page.safeArea.topMm);
  const bottomU = mmToU(page.safeArea.bottomMm);
  return {
    xU: leftU,
    yU: topU,
    widthU: pageWidthU - leftU - rightU,
    heightU: pageHeightU - topU - bottomU,
  };
}

function frameContainedBy(frame: FrameU, bounds: FrameU): boolean {
  return frame.xU >= bounds.xU
    && frame.yU >= bounds.yU
    && frame.xU + frame.widthU <= bounds.xU + bounds.widthU
    && frame.yU + frame.heightU <= bounds.yU + bounds.heightU;
}

function guideStyle(axis: 'x' | 'y', positionU: number): React.CSSProperties {
  return axis === 'x'
    ? { left: qCss(uToQ(positionU)) }
    : { top: qCss(uToQ(positionU)) };
}

function textEditTypography(document: CatalogDocument, object: TextObject): React.CSSProperties {
  const base = document.style.defaultText;
  return {
    fontFamily: object.style.fontFamily ?? base.fontFamily ?? 'Noto Sans',
    fontSize: `${object.style.fontSizePt ?? base.fontSizePt ?? 10}pt`,
    lineHeight: object.style.lineHeight ?? base.lineHeight ?? 1.2,
    fontWeight: object.style.fontWeight ?? base.fontWeight ?? 400,
    color: object.style.color ?? base.color ?? '#172033',
    textAlign: object.style.textAlign ?? base.textAlign ?? 'left',
  };
}

export interface EditorWorkspacePersistenceProps {
  readonly runtime: VNextPersistenceRuntime;
  readonly openSessionId: string;
  readonly save: SaveProjection;
  readonly assetUrls: ReadonlyMap<string, string>;
}

export function EditorWorkspace({
  session,
  persistence,
}: {
  session: DocumentSession;
  persistence?: EditorWorkspacePersistenceProps;
}) {
  const snapshot = useDocumentSession(session);
  const { document, canUndo, canRedo } = snapshot;
  const [editorState, setEditorState] = React.useState<EditorSelectionState>({
    activePageId: document.pages[0].id,
    selectedObjectIds: [],
    mode: 'select',
  });
  const activePageIdRef = React.useRef(editorState.activePageId);
  activePageIdRef.current = editorState.activePageId;
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [textEdit, setTextEdit] = React.useState<TextEditSession | null>(null);
  const textEditRef = React.useRef<TextEditSession | null>(null);
  const textAreaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const compositionRef = React.useRef(false);
  const lastTextPointerDownRef = React.useRef<{
    objectId: string;
    timeStamp: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [preview, setPreview] = React.useState<GesturePreview | null>(null);
  const [snappingEnabled, setSnappingEnabled] = React.useState(true);
  const snappingEnabledRef = React.useRef(snappingEnabled);
  snappingEnabledRef.current = snappingEnabled;
  const [measuredDiagnostics, setMeasuredDiagnostics] = React.useState<{
    source: CatalogDocument;
    diagnostics: readonly Diagnostic[];
  } | null>(null);
  const controllerRef = React.useRef<EditorInteractionController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new EditorInteractionController({
      getDocument: () => session.getSnapshot().document,
      getActivePageId: () => activePageIdRef.current,
      createTransactionId: createGestureTransactionId,
      isSnappingEnabled: () => snappingEnabledRef.current,
      execute: (action, context) => session.execute(action, context),
      onPreviewChange: setPreview,
    });
  }
  const controller = controllerRef.current;
  const selectedPage = document.pages.find((page) => page.id === editorState.activePageId) ?? document.pages[0];
  const selectedPageIndex = document.pages.findIndex((page) => page.id === selectedPage.id);
  const selectedObjectId = editorState.selectedObjectIds.length === 1 ? editorState.selectedObjectIds[0] : undefined;
  const selectedObject = selectedObjectId ? selectedPage.objects.find((object) => object.id === selectedObjectId) : undefined;
  const editingObject = textEdit
    ? selectedPage.objects.find((object): object is TextObject => object.id === textEdit.objectId && object.type === 'text')
    : undefined;
  const previewDocument = React.useMemo(() => ({ ...document, pages: [selectedPage] }), [document, selectedPage]);
  const { plans } = React.useMemo(() => compilePlans(previewDocument), [previewDocument]);
  const pageWidthU = mmToU(selectedPage.widthMm);
  const pageHeightU = mmToU(selectedPage.heightMm);
  const safeAreaU = React.useMemo(() => safeAreaFrameU(selectedPage), [selectedPage]);
  const immediateDiagnostics = React.useMemo(() => immediateAuthoringDiagnostics(document), [document]);
  const canonicalDiagnostics = React.useMemo(
    () => mergeDiagnostics(
      immediateDiagnostics,
      measuredDiagnostics?.source === document ? measuredDiagnostics.diagnostics : []
    ).filter((diagnostic) => W2D_DIAGNOSTIC_CODES.has(diagnostic.code)),
    [document, immediateDiagnostics, measuredDiagnostics]
  );
  const selectedDiagnostics = React.useMemo(
    () => canonicalDiagnostics.filter((diagnostic) => diagnostic.pageId === selectedPage.id && diagnostic.objectId === selectedObjectId),
    [canonicalDiagnostics, selectedObjectId, selectedPage.id]
  );
  const pageDiagnostics = React.useMemo(
    () => canonicalDiagnostics.filter((diagnostic) => diagnostic.pageId === selectedPage.id),
    [canonicalDiagnostics, selectedPage.id]
  );
  const previewCrossesSafeArea = Boolean(preview && safeAreaU && !frameContainedBy(preview.frameU, safeAreaU));
  const receiveMeasuredDiagnostics = React.useCallback((source: CatalogDocument, diagnostics: readonly Diagnostic[]) => {
    if (!isCurrentDiagnosticSource(session.getSnapshot().document, source)) return;
    setMeasuredDiagnostics({ source, diagnostics });
  }, [session]);
  const [inspectorDraft, setInspectorDraft] = React.useState<InspectorDraft>({ x: '', y: '', width: '', height: '' });

  React.useEffect(() => {
    const activePage = document.pages.find((page) => page.id === editorState.activePageId);
    if (!activePage) {
      controller.cancel('active-page-change');
      setEditorState({ activePageId: document.pages[0].id, selectedObjectIds: [], mode: 'select' });
      return;
    }
    const validIds = editorState.selectedObjectIds.filter((objectId) => activePage.objects.some((object) => object.id === objectId));
    if (validIds.length !== editorState.selectedObjectIds.length) {
      setEditorState((current) => ({ ...current, selectedObjectIds: validIds }));
    }
  }, [controller, document, editorState.activePageId, editorState.selectedObjectIds]);

  React.useEffect(() => {
    if (!textEdit) return;
    const page = document.pages.find((entry) => entry.id === textEdit.pageId);
    const object = page?.objects.find((entry) => entry.id === textEdit.objectId);
    if (page && object?.type === 'text') return;
    textEditRef.current = null;
    compositionRef.current = false;
    setTextEdit(null);
    setEditorState((current) => ({ ...current, mode: 'select' }));
    setStatusMessage('A edição foi encerrada porque o texto não está mais disponível.');
    persistence?.runtime.workspace.notifyDraftStateChanged();
  }, [document, persistence, textEdit]);

  const textEditObjectId = textEdit?.objectId;
  React.useLayoutEffect(() => {
    if (!textEditObjectId) return;
    const textarea = textAreaRef.current;
    if (!textarea) return;
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [textEditObjectId]);

  React.useEffect(() => {
    if (!selectedObject) {
      setInspectorDraft({ x: '', y: '', width: '', height: '' });
      return;
    }
    setInspectorDraft({ x: String(selectedObject.frame.xMm), y: String(selectedObject.frame.yMm), width: String(selectedObject.frame.widthMm), height: String(selectedObject.frame.heightMm) });
  }, [selectedObject]);

  React.useEffect(() => {
    const cancelOnWindowBlur = () => {
      if (controller.cancel('focus-loss')) setStatusMessage('Gesto cancelado.');
    };
    window.addEventListener('blur', cancelOnWindowBlur);
    return () => window.removeEventListener('blur', cancelOnWindowBlur);
  }, [controller]);

  const setActivePage = (pageId: string) => {
    controller.cancel('active-page-change');
    if (textEditRef.current) {
      textEditRef.current = null;
      compositionRef.current = false;
      setTextEdit(null);
      persistence?.runtime.workspace.notifyDraftStateChanged();
    }
    setEditorState({ activePageId: pageId, selectedObjectIds: [], mode: 'select' });
    setStatusMessage(null);
  };

  const selectObject = (objectId: string) => {
    setEditorState((current) => ({ ...current, selectedObjectIds: [objectId], mode: 'select' }));
  };

  const cancelTextEdit = (message = 'Edição de texto cancelada.') => {
    if (!textEditRef.current) return false;
    textEditRef.current = null;
    compositionRef.current = false;
    setTextEdit(null);
    setEditorState((current) => ({ ...current, mode: 'select' }));
    if (message) setStatusMessage(message);
    persistence?.runtime.workspace.notifyDraftStateChanged();
    return true;
  };

  const applyTextDraft = (edit: TextEditSession) => session.execute({
    type: 'text.setContent',
    objectId: edit.objectId,
    expectedText: edit.expectedText,
    plainText: edit.draft,
  });

  const commitTextEdit = (preserveOnFailure = false): boolean => {
    const edit = textEditRef.current;
    if (!edit) return true;
    const result = applyTextDraft(edit);
    if (!result.ok) {
      setStatusMessage(result.error.code === 'OBJECT_LOCKED'
        ? 'O texto foi bloqueado antes da conclusão; o rascunho não foi aplicado.'
        : 'O texto mudou ou não pode mais ser editado por este modo; o rascunho não foi aplicado.');
      if (!preserveOnFailure) {
        textEditRef.current = null;
        compositionRef.current = false;
        setTextEdit(null);
        setEditorState((current) => ({ ...current, mode: 'select' }));
      }
      persistence?.runtime.workspace.notifyDraftStateChanged();
      return false;
    }
    textEditRef.current = null;
    compositionRef.current = false;
    setTextEdit(null);
    setEditorState((current) => ({ ...current, mode: 'select' }));
    setStatusMessage(result.metadata.changed ? 'Texto atualizado.' : 'Texto sem alterações.');
    persistence?.runtime.workspace.notifyDraftStateChanged();
    return true;
  };

  const prepareTextDraftForSave = (): AuthoringBarrierResult => {
    const edit = textEditRef.current;
    if (!edit) return { ok: true };
    if (compositionRef.current) {
      return {
        ok: false,
        reason: 'COMPOSITION_ACTIVE',
        message: 'Conclua a composição de texto antes de salvar.',
      };
    }
    const result = applyTextDraft(edit);
    if (!result.ok) {
      const stale = result.error.code === 'ACTION_INVALID'
        && result.error.details.startsWith('Stale text edit');
      setStatusMessage(stale
        ? 'O texto mudou enquanto este rascunho estava aberto. Revise-o antes de salvar.'
        : 'O rascunho visível não pode ser salvo ainda.');
      persistence?.runtime.workspace.notifyDraftStateChanged();
      return {
        ok: false,
        reason: stale
          ? 'STALE_DRAFT'
          : result.error.code === 'ACTION_INVALID'
            ? 'INVALID_DRAFT'
            : 'COMMIT_FAILED',
        message: stale
          ? 'O rascunho de texto ficou desatualizado e foi preservado.'
          : 'O rascunho de texto foi preservado porque não pôde ser aplicado com segurança.',
      };
    }
    textEditRef.current = null;
    compositionRef.current = false;
    setTextEdit(null);
    setEditorState((current) => ({ ...current, mode: 'select' }));
    setStatusMessage(result.metadata.changed ? 'Texto atualizado para salvar.' : 'Texto pronto para salvar.');
    persistence?.runtime.workspace.notifyDraftStateChanged();
    return { ok: true };
  };

  const prepareTextDraftForSaveRef = React.useRef(prepareTextDraftForSave);
  prepareTextDraftForSaveRef.current = prepareTextDraftForSave;
  const persistenceRuntime = persistence?.runtime;
  const persistenceOpenSessionId = persistence?.openSessionId;
  React.useEffect(() => {
    if (!persistenceRuntime || !persistenceOpenSessionId) return undefined;
    return persistenceRuntime.registerAuthoringBarrier(persistenceOpenSessionId, {
      prepareForSave: () => prepareTextDraftForSaveRef.current(),
      hasPendingDraft: () => Boolean(textEditRef.current),
    });
  }, [persistenceOpenSessionId, persistenceRuntime]);

  const startTextEdit = (object: EditorialObject): boolean => {
    if (object.type !== 'text') return false;
    if (object.locked) {
      setStatusMessage('Texto bloqueado não pode ser editado.');
      return false;
    }
    const plainText = projectEditableRichText(object.text);
    if (plainText === null) {
      setStatusMessage('Este texto possui formatação estrutural complexa e não pode ser editado pelo modo simples.');
      return false;
    }
    controller.cancel('superseded');
    const edit: TextEditSession = {
      objectId: object.id,
      pageId: selectedPage.id,
      expectedText: object.text,
      draft: plainText,
    };
    textEditRef.current = edit;
    setTextEdit(edit);
    setEditorState({ activePageId: selectedPage.id, selectedObjectIds: [object.id], mode: 'text-edit' });
    setStatusMessage(null);
    persistence?.runtime.workspace.notifyDraftStateChanged();
    return true;
  };

  const finishTextEditBeforeCommand = (): boolean => !textEditRef.current || commitTextEdit();

  const toggleObjectSelection = (objectId: string) => {
    setEditorState((current) => {
      const selected = new Set(current.selectedObjectIds);
      if (selected.has(objectId)) selected.delete(objectId); else selected.add(objectId);
      return { ...current, selectedObjectIds: [...selected], mode: 'select' };
    });
  };

  const addPage = () => {
    cancelTextEdit('');
    controller.cancel('superseded');
    const result = session.execute({ type: 'page.add', afterPageId: selectedPage.id });
    if (!result.ok) { setStatusMessage('Não foi possível adicionar a página.'); return; }
    const createdPageId = result.metadata.createdIds[0];
    if (createdPageId) setActivePage(createdPageId);
    setStatusMessage('Página adicionada.');
  };

  const insertPageTemplate = () => {
    cancelTextEdit('');
    controller.cancel('superseded');
    const result = session.execute({
      type: 'page.template.insert',
      templateId: W2E_PAGE_TEMPLATE_ID,
      afterPageId: selectedPage.id,
    });
    if (!result.ok) { setStatusMessage('Não foi possível inserir o modelo.'); return; }
    const createdPageId = result.metadata.createdIds[0];
    if (createdPageId) setActivePage(createdPageId);
    setStatusMessage('Modelo inserido como página independente.');
  };

  const undo = () => {
    cancelTextEdit('');
    controller.cancel('history');
    const result = session.undo();
    setStatusMessage(result.ok ? 'Alteração desfeita.' : 'Não há alterações para desfazer.');
  };

  const redo = () => {
    cancelTextEdit('');
    controller.cancel('history');
    const result = session.redo();
    setStatusMessage(result.ok ? 'Alteração refeita.' : 'Não há alterações para refazer.');
  };

  const insertObject = (tool: InsertTool) => {
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const currentPage = session.getSnapshot().document.pages.find((page) => page.id === editorState.activePageId);
    if (!currentPage) return;
    const result = session.execute({ type: 'object.insert', pageId: currentPage.id, object: createInsertSpec(tool, currentPage) });
    if (!result.ok) { setStatusMessage('Não foi possível inserir o objeto.'); return; }
    const objectId = result.metadata.createdIds[0];
    if (objectId) selectObject(objectId);
    const names: Record<InsertTool, string> = { text: 'Texto', image: 'Imagem', table: 'Tabela', shape: 'Forma', line: 'Linha' };
    setStatusMessage(names[tool] + ' adicionada.');
  };

  const deleteSelected = () => {
    if (!selectedObject) return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const result = session.execute({ type: 'object.delete', objectId: selectedObject.id });
    if (!result.ok) { setStatusMessage('Não foi possível excluir o objeto.'); return; }
    setEditorState((current) => ({ ...current, selectedObjectIds: [] }));
    setStatusMessage('Objeto excluído.');
  };

  const duplicateSelected = () => {
    if (!selectedObject) return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const result = session.execute({ type: 'object.duplicate', objectId: selectedObject.id });
    if (!result.ok) { setStatusMessage('Não foi possível duplicar o objeto.'); return; }
    const objectId = result.metadata.createdIds[0];
    if (objectId) selectObject(objectId);
    setStatusMessage('Objeto duplicado.');
  };

  const groupSelected = () => {
    if (editorState.selectedObjectIds.length < 2) return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const result = session.execute({ type: 'group.create', pageId: selectedPage.id, objectIds: [...editorState.selectedObjectIds] });
    if (!result.ok) { setStatusMessage('Não foi possível agrupar os objetos.'); return; }
    const groupId = result.metadata.createdIds[0];
    setEditorState((current) => ({ ...current, selectedObjectIds: groupId ? [groupId] : [] }));
    setStatusMessage('Objetos agrupados.');
  };

  const ungroupSelected = () => {
    if (!selectedObject || selectedObject.type !== 'group') return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const childIds = selectedObject.objects.map((child) => child.id);
    const result = session.execute({ type: 'group.ungroup', groupId: selectedObject.id });
    if (!result.ok) { setStatusMessage('Não foi possível desagrupar.'); return; }
    setEditorState((current) => ({ ...current, selectedObjectIds: childIds }));
    setStatusMessage('Grupo desfeito.');
  };

  const reorderSelected = (target: 'back' | 'backward' | 'forward' | 'front') => {
    if (!selectedObject) return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const currentPage = session.getSnapshot().document.pages.find((page) => page.id === editorState.activePageId);
    if (!currentPage) return;
    const ordered = visualObjects(currentPage);
    const currentIndex = ordered.findIndex((object) => object.id === selectedObject.id);
    if (currentIndex < 0) return;
    const targetIndex = target === 'back' ? 0 : target === 'front' ? ordered.length - 1 : target === 'backward' ? Math.max(0, currentIndex - 1) : Math.min(ordered.length - 1, currentIndex + 1);
    const result = session.execute({ type: 'object.reorder', objectId: selectedObject.id, targetIndex });
    setStatusMessage(result.ok ? 'Ordem do objeto atualizada.' : 'Não foi possível alterar a ordem.');
  };

  const replaceSelectedImage = () => {
    if (!selectedObject || selectedObject.type !== 'image') return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const result = session.execute({ type: 'image.replace', objectId: selectedObject.id, assetId: alternateDemoAssetId(selectedObject.assetId) });
    setStatusMessage(result.ok ? 'Imagem substituída.' : 'Não foi possível substituir a imagem.');
  };

  const toggleSnapping = () => {
    if (!finishTextEditBeforeCommand()) return;
    const next = !snappingEnabledRef.current;
    snappingEnabledRef.current = next;
    setSnappingEnabled(next);
    if (controller.isActive()) controller.refreshPreview();
    setStatusMessage(next ? 'Encaixe ativado.' : 'Encaixe desativado.');
  };

  const beginGesture = (event: React.PointerEvent<HTMLElement>, object: EditorialObject, kind: GestureKind) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (textEditRef.current) return;
    if (kind.type === 'move' && object.type === 'text') {
      const selected = editorState.selectedObjectIds.length === 1 && editorState.selectedObjectIds[0] === object.id;
      const previous = lastTextPointerDownRef.current;
      const isSecondActivation = selected && (
        event.detail >= 2
        || Boolean(
          previous
          && previous.objectId === object.id
          && event.timeStamp - previous.timeStamp >= 0
          && event.timeStamp - previous.timeStamp <= 500
          && Math.hypot(event.clientX - previous.clientX, event.clientY - previous.clientY) <= 8
        )
      );
      lastTextPointerDownRef.current = {
        objectId: object.id,
        timeStamp: event.timeStamp,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (isSecondActivation) {
        controller.cancel('superseded');
        startTextEdit(object);
        return;
      }
    }
    if (kind.type === 'move' && (event.ctrlKey || event.metaKey)) {
      controller.cancel('superseded');
      toggleObjectSelection(object.id);
      event.currentTarget.focus();
      return;
    }
    if (kind.type === 'resize' && object.type === 'group') return;
    selectObject(object.id);
    event.currentTarget.focus();
    const stage = event.currentTarget.closest('[data-vnext-page-stage]') as HTMLElement | null;
    const canonicalPage = stage?.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
    const rect = canonicalPage?.getBoundingClientRect();
    if (!rect) return;
    try {
      const started = controller.begin({
        pointerId: event.pointerId, objectId: object.id, pageId: selectedPage.id, kind,
        clientX: event.clientX, clientY: event.clientY, pageClientWidthPx: rect.width, pageClientHeightPx: rect.height,
        snapThresholdPx: SNAP_RADIUS_PX,
      });
      if (!started) { setStatusMessage('Este objeto não pode ser movido agora.'); return; }
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setStatusMessage(null);
    } catch {
      controller.cancel('capture-loss');
      setStatusMessage('Gesto cancelado.');
    }
  };

  const moveGesture = (event: React.PointerEvent<HTMLElement>) => {
    if (!controller.isActive()) return;
    try { controller.move(event.pointerId, event.clientX, event.clientY); }
    catch { controller.cancel('capture-loss'); setStatusMessage('Gesto cancelado.'); }
  };

  const describeFinish = (result: FinishGestureResult) => {
    if (result.status === 'committed') {
      lastTextPointerDownRef.current = null;
      setStatusMessage(result.action.type === 'object.move' ? 'Objeto movido.' : 'Objeto redimensionado.');
    }
    else if (result.status === 'cancelled') setStatusMessage('Gesto cancelado porque o documento mudou.');
    else if (result.status === 'failed') setStatusMessage('A alteração final não pôde ser aplicada.');
  };

  const finishGesture = (event: React.PointerEvent<HTMLElement>) => {
    if (!controller.isActive()) return;
    try { describeFinish(controller.finish(event.pointerId, event.clientX, event.clientY)); }
    catch { controller.cancel('capture-loss'); setStatusMessage('Gesto cancelado.'); }
  };

  const cancelPointerGesture = () => { if (controller.cancel('pointercancel')) setStatusMessage('Gesto cancelado.'); };
  const cancelCaptureLoss = () => { if (controller.cancel('capture-loss')) setStatusMessage('Gesto cancelado.'); };

  const commitInspector = (field: keyof InspectorDraft) => {
    if (!selectedObject) return;
    if (!finishTextEditBeforeCommand()) return;
    if (selectedObject.type === 'group' && (field === 'width' || field === 'height')) return;
    controller.cancel('superseded');
    const raw = inspectorDraft[field].trim();
    const numeric = Number(raw);
    if (raw.length === 0 || !Number.isFinite(numeric)) { setStatusMessage('Informe um valor numérico válido em milímetros.'); return; }
    let valueU: number;
    try { valueU = mmToU(numeric); }
    catch { setStatusMessage('Informe um valor numérico válido em milímetros.'); return; }
    const current = frameToU(selectedObject.frame);
    let action: ApplicationAction;
    if (field === 'x' || field === 'y') {
      action = { type: 'object.move', objectId: selectedObject.id, xU: field === 'x' ? valueU : current.xU, yU: field === 'y' ? valueU : current.yU };
    } else {
      if (valueU < 1) { setStatusMessage('Largura e altura devem ser maiores que zero.'); return; }
      action = { type: 'object.resize', objectId: selectedObject.id, xU: current.xU, yU: current.yU, widthU: field === 'width' ? valueU : current.widthU, heightU: field === 'height' ? valueU : current.heightU };
    }
    const result = session.execute(action);
    setStatusMessage(result.ok ? 'Geometria atualizada.' : 'Não foi possível atualizar a geometria.');
  };

  const objectPreviewFrame = (object: EditorialObject): FrameU => {
    if (preview?.objectId === object.id && preview.pageId === selectedPage.id) return preview.frameU;
    return frameToU(object.frame);
  };

  const cancelOnRootKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (textEditRef.current) {
      if (compositionRef.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelTextEdit();
        return;
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        commitTextEdit();
        return;
      }
      return;
    }
    if (event.key === 'Enter' && selectedObject?.type === 'text') {
      const target = event.target as HTMLElement;
      if (!['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(target.tagName)) {
        event.preventDefault();
        startTextEdit(selectedObject);
        return;
      }
    }
    if (event.key === 'Escape' && controller.cancel('escape')) {
      event.preventDefault();
      setStatusMessage('Gesto cancelado.');
    }
  };

  const cancelOnRootBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (controller.isActive() && (!next || !event.currentTarget.contains(next))) {
      controller.cancel('focus-loss');
      setStatusMessage('Gesto cancelado.');
    }
  };

  const handleTextEditPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!textEditRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-text-edit-session]')) return;
    if (target.closest('[data-persistence-save-action]')) return;
    if (target.closest('[data-text-edit-cancel-on-activate]')) {
      cancelTextEdit('');
      return;
    }
    if (!commitTextEdit()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const updateTextDraft = (value: string) => {
    const current = textEditRef.current;
    if (!current) return;
    const next = { ...current, draft: value.replace(/\r\n?/g, '\n') };
    textEditRef.current = next;
    setTextEdit(next);
    persistence?.runtime.workspace.notifyDraftStateChanged();
  };

  const insertTechnicalSymbol = (symbol: string) => {
    const edit = textEditRef.current;
    const textarea = textAreaRef.current;
    if (!edit || !textarea) return;
    const start = textarea.selectionStart ?? edit.draft.length;
    const end = textarea.selectionEnd ?? start;
    const nextDraft = edit.draft.slice(0, start) + symbol + edit.draft.slice(end);
    const nextEdit = { ...edit, draft: nextDraft };
    const caret = start + symbol.length;
    textEditRef.current = nextEdit;
    setTextEdit(nextEdit);
    queueMicrotask(() => {
      const current = textAreaRef.current;
      if (!current) return;
      current.focus();
      current.setSelectionRange(caret, caret);
    });
  };

  return (
    <div
      className="vnext-shell"
      data-vnext-shell=""
      data-active-page-id={selectedPage.id}
      data-editor-mode={editorState.mode}
      onPointerDownCapture={handleTextEditPointerDownCapture}
      onKeyDownCapture={cancelOnRootKey}
      onBlurCapture={cancelOnRootBlur}
    >
      <header className="vnext-topbar">
        <div className="vnext-brand">
          <div className="vnext-brand-mark" aria-hidden="true">P</div>
          <div>
            <div className="vnext-product-line">PRESYS · Catalog Builder</div>
            <div className="vnext-title-row"><h1>{document.title}</h1><span className="vnext-badge">VNext</span></div>
          </div>
        </div>
        <div className="vnext-actions" aria-label="Ações do documento">
          {persistence && (
            <button
              type="button"
              data-editor-action="save"
              data-persistence-save-action=""
              onClick={() => { void persistence.runtime.saveCoordinator.save(); }}
              disabled={!persistence.save.canSave || persistence.save.phase === 'saving'}
              aria-label={persistence.save.label}
            >
              <SaveIcon size={17} aria-hidden="true" />
              <span>{persistence.save.label}</span>
            </button>
          )}
          <button type="button" data-editor-action="undo" data-text-edit-cancel-on-activate="" onClick={undo} disabled={!canUndo} aria-label="Desfazer última alteração"><Undo2 size={17} aria-hidden="true" /><span>Desfazer</span></button>
          <button type="button" data-editor-action="redo" data-text-edit-cancel-on-activate="" onClick={redo} disabled={!canRedo} aria-label="Refazer última alteração"><Redo2 size={17} aria-hidden="true" /><span>Refazer</span></button>
        </div>
      </header>

      <div className="vnext-workspace">
        <aside className="vnext-pages" aria-label="Páginas do catálogo">
          <div className="vnext-panel-heading"><span>Páginas</span><span>{document.pages.length}</span></div>
          <nav className="vnext-page-list" aria-label="Navegação de páginas">
            {document.pages.map((page, index) => (
              <button key={page.id} type="button" data-text-edit-cancel-on-activate="" className={page.id === selectedPage.id ? 'is-current' : undefined} aria-current={page.id === selectedPage.id ? 'page' : undefined} onClick={() => setActivePage(page.id)}>
                <span className="vnext-page-icon" aria-hidden="true"><FileText size={16} /></span><span>Página {index + 1}</span>
              </button>
            ))}
          </nav>
          <button type="button" className="vnext-add-page" data-text-edit-cancel-on-activate="" onClick={addPage} aria-label="Adicionar nova página após a página atual"><Plus size={17} aria-hidden="true" />Adicionar página</button>
          <button type="button" className="vnext-add-page" data-editor-action="insert-template" data-text-edit-cancel-on-activate="" onClick={insertPageTemplate} aria-label="Inserir modelo após a página atual"><Plus size={17} aria-hidden="true" />Inserir modelo</button>
        </aside>

        <main className="vnext-canvas-area">
          <div className="vnext-canvas-meta">
            <div><strong>Página {selectedPageIndex + 1} de {document.pages.length}</strong><span>A4 · 210 × 297 mm</span></div>
            <div className="vnext-canvas-statuses">
              {pageDiagnostics.length > 0 && (
                <span
                  className={'vnext-diagnostic-summary ' + (pageDiagnostics.some((diagnostic) => diagnostic.severity === 'ERROR') ? 'is-error' : 'is-warning')}
                  data-page-diagnostic-summary=""
                >
                  {pageDiagnostics.filter((diagnostic) => diagnostic.severity === 'ERROR').length} erro(s) · {pageDiagnostics.filter((diagnostic) => diagnostic.severity === 'WARNING').length} aviso(s)
                </span>
              )}
              <span className="vnext-memory-status" data-save-state="">{persistence ? persistence.save.label : 'Rascunho nesta aba'}</span>
            </div>
          </div>
          <div className="vnext-authoring-toolbar" aria-label="Adicionar e organizar objetos">
            <div className="vnext-tool-group" aria-label="Adicionar objeto">
              <button type="button" data-editor-action="add-text" onClick={() => insertObject('text')}>Adicionar texto</button>
              <button type="button" data-editor-action="add-image" onClick={() => insertObject('image')}>Adicionar imagem</button>
              <button type="button" data-editor-action="add-table" onClick={() => insertObject('table')}>Adicionar tabela</button>
              <button type="button" data-editor-action="add-shape" onClick={() => insertObject('shape')}>Adicionar forma</button>
              <button type="button" data-editor-action="add-line" onClick={() => insertObject('line')}>Adicionar linha</button>
            </div>
            <div className="vnext-tool-group" aria-label="Assistência de posicionamento">
              <button
                type="button"
                data-editor-action="toggle-snapping"
                aria-pressed={snappingEnabled}
                className={snappingEnabled ? 'is-active' : undefined}
                onClick={toggleSnapping}
              >
                {snappingEnabled ? 'Encaixe: ligado' : 'Encaixe: desligado'}
              </button>
            </div>
            <div className="vnext-tool-group" aria-label="Ações do objeto selecionado">
              <button type="button" data-editor-action="group" disabled={editorState.selectedObjectIds.length < 2} onClick={groupSelected}>Agrupar</button>
              <button type="button" data-editor-action="ungroup" disabled={selectedObject?.type !== 'group'} onClick={ungroupSelected}>Desagrupar</button>
              <button type="button" data-editor-action="duplicate" disabled={!selectedObject} onClick={duplicateSelected}>Duplicar</button>
              <button type="button" data-editor-action="delete" disabled={!selectedObject} onClick={deleteSelected}>Excluir</button>
              <button type="button" data-editor-action="send-back" disabled={!selectedObject} onClick={() => reorderSelected('back')}>Fundo</button>
              <button type="button" data-editor-action="send-backward" disabled={!selectedObject} onClick={() => reorderSelected('backward')}>Recuar</button>
              <button type="button" data-editor-action="bring-forward" disabled={!selectedObject} onClick={() => reorderSelected('forward')}>Avançar</button>
              <button type="button" data-editor-action="bring-front" disabled={!selectedObject} onClick={() => reorderSelected('front')}>Frente</button>
              <button type="button" data-editor-action="replace-image" disabled={selectedObject?.type !== 'image'} onClick={replaceSelectedImage}>Substituir imagem</button>
              <button
                type="button"
                data-editor-action="edit-text"
                disabled={selectedObject?.type !== 'text' || selectedObject.locked || projectEditableRichText(selectedObject.text) === null}
                onClick={() => selectedObject && startTextEdit(selectedObject)}
              >
                Editar texto
              </button>
            </div>
          </div>

          <div className="vnext-document-preview" aria-label={'Editor da página ' + (selectedPageIndex + 1)}>
            <div className="vnext-page-stage" data-vnext-page-stage="" style={{ width: qCss(uToQ(pageWidthU)), height: qCss(uToQ(pageHeightU)) }}>
              <DocumentRenderer document={previewDocument} plans={plans} assetUrls={persistence?.assetUrls ?? W2C_DEMO_ASSET_URLS} />
              <div className="vnext-editor-overlay" data-editor-overlay="" aria-label="Camada de interação do editor" onPointerDown={(event) => {
                if (event.target === event.currentTarget) { controller.cancel('superseded'); setEditorState((current) => ({ ...current, selectedObjectIds: [] })); }
              }}>
                {textEdit && editingObject && (
                  <div
                    className="vnext-text-edit-session"
                    data-text-edit-session=""
                    data-text-edit-object-id={editingObject.id}
                    style={frameStyle(frameToU(editingObject.frame))}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <textarea
                      ref={textAreaRef}
                      data-text-edit-textarea=""
                      aria-label="Editar conteúdo do texto"
                      value={textEdit.draft}
                      spellCheck={false}
                      style={textEditTypography(document, editingObject)}
                      onChange={(event) => updateTextDraft(event.target.value)}
                      onCompositionStart={() => {
                        compositionRef.current = true;
                        persistence?.runtime.workspace.notifyDraftStateChanged();
                      }}
                      onCompositionEnd={() => {
                        compositionRef.current = false;
                        persistence?.runtime.workspace.notifyDraftStateChanged();
                      }}
                    />
                    <div className="vnext-text-edit-toolbar" aria-label="Ferramentas da edição de texto">
                      <div className="vnext-text-symbols">
                        {technicalSymbols.map((symbol, index) => (
                          <button key={symbol} type="button" data-editor-symbol-index={index} onClick={() => insertTechnicalSymbol(symbol)}>
                            {symbol}
                          </button>
                        ))}
                      </div>
                      <button type="button" data-editor-action="cancel-text" onClick={() => cancelTextEdit()}>Cancelar</button>
                      <button type="button" data-editor-action="commit-text" onClick={() => commitTextEdit()}>Concluir</button>
                    </div>
                  </div>
                )}
                {safeAreaU && (
                  <div
                    className={'vnext-safe-area' + (preview ? ' is-manipulating' : '') + (previewCrossesSafeArea ? ' is-violated' : '')}
                    data-editor-safe-area=""
                    data-safe-area-preview-violation={previewCrossesSafeArea ? 'true' : undefined}
                    style={frameStyle(safeAreaU)}
                    aria-hidden="true"
                  />
                )}
                {preview?.guides.map((guide) => (
                  <div
                    key={[guide.axis, guide.positionU, guide.kind, guide.sourceObjectId ?? ''].join(':')}
                    className={'vnext-snap-guide is-' + guide.axis}
                    data-snap-guide={guide.axis}
                    data-snap-guide-kind={guide.kind}
                    data-snap-guide-position-u={guide.positionU}
                    data-snap-guide-source-object-id={guide.sourceObjectId}
                    style={guideStyle(guide.axis, guide.positionU)}
                    aria-hidden="true"
                  />
                ))}
                {selectedPage.objects.map((object) => {
                  const selected = editorState.selectedObjectIds.includes(object.id);
                  const displayedFrame = objectPreviewFrame(object);
                  const objectDiagnostics = pageDiagnostics.filter((diagnostic) => diagnostic.objectId === object.id);
                  const issueSeverity = objectDiagnostics.some((diagnostic) => diagnostic.severity === 'ERROR')
                    ? 'ERROR'
                    : objectDiagnostics.some((diagnostic) => diagnostic.severity === 'WARNING') ? 'WARNING' : undefined;
                  return (
                    <div
                      key={object.id}
                      tabIndex={-1}
                      className={'vnext-object-hit-target' + (selected ? ' is-selected' : '') + (preview?.objectId === object.id ? ' is-previewing' : '')}
                      data-editor-object-id={object.id}
                      data-selected={selected ? 'true' : 'false'}
                      data-editor-preview={preview?.objectId === object.id ? 'true' : undefined}
                      style={{ ...frameStyle(displayedFrame), zIndex: selected ? Number.MAX_SAFE_INTEGER : object.zIndex }}
                      onPointerDown={(event) => beginGesture(event, object, { type: 'move' })}
                      onDoubleClick={() => {
                        if (object.type === 'text') startTextEdit(object);
                      }}
                      onPointerMove={moveGesture}
                      onPointerUp={finishGesture}
                      onPointerCancel={cancelPointerGesture}
                      onLostPointerCapture={cancelCaptureLoss}
                    >
                      {issueSeverity && (
                        <span
                          className={'vnext-object-diagnostic-badge is-' + issueSeverity.toLowerCase()}
                          data-editor-diagnostic-badge={issueSeverity}
                          aria-label={issueSeverity === 'ERROR' ? 'Objeto com erro de publicação' : 'Objeto com aviso de publicação'}
                        >
                          {issueSeverity === 'ERROR' ? '!' : '⚠'}
                        </span>
                      )}
                      {selected && (
                        <>
                          <div className="vnext-selection-outline" aria-hidden="true" />
                          {preview?.objectId === object.id && <div className="vnext-preview-fill" aria-hidden="true" />}
                          {object.type !== 'group' && editorState.mode !== 'text-edit' && editorState.selectedObjectIds.length === 1 && resizeHandles.map((handle) => (
                            <button
                              key={handle}
                              type="button"
                              className={'vnext-resize-handle handle-' + handle}
                              data-resize-handle={handle}
                              aria-label={'Redimensionar ' + handle}
                              onPointerDown={(event) => beginGesture(event, object, { type: 'resize', handle })}
                              onPointerMove={moveGesture}
                              onPointerUp={finishGesture}
                              onPointerCancel={cancelPointerGesture}
                              onLostPointerCapture={cancelCaptureLoss}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>

        <aside className="vnext-info" aria-label="Inspector do objeto">
          <span className="vnext-info-kicker">Inspector</span>
          <h2>{selectedObject ? 'Geometria do objeto' : 'Selecione um objeto'}</h2>
          {selectedObject ? (
            <>
              <p>Posição e tamanho em milímetros.</p>
              <div className="vnext-inspector-grid">
                {([['x', 'X'], ['y', 'Y'], ['width', 'Largura'], ['height', 'Altura']] as const).map(([field, label]) => (
                  <label key={field}>
                    <span>{label}</span>
                    <div>
                      <input type="text" inputMode="decimal" data-inspector-field={field} value={inspectorDraft[field]}
                        readOnly={selectedObject.type === 'group' && (field === 'width' || field === 'height')}
                        onChange={(event) => setInspectorDraft((current) => ({ ...current, [field]: event.target.value }))}
                        onBlur={() => commitInspector(field)}
                        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                      />
                      <span>mm</span>
                    </div>
                  </label>
                ))}
              </div>
              {selectedObject.type === 'image' && <button type="button" className="vnext-inspector-action" onClick={replaceSelectedImage}>Substituir imagem</button>}
              <div className="vnext-divider" />
              <div className="vnext-diagnostics-section" data-editor-diagnostics="">
                <h3>Diagnósticos</h3>
                {selectedDiagnostics.length === 0 ? (
                  <p>Nenhum aviso ou erro para este objeto.</p>
                ) : (
                  <ul>
                    {selectedDiagnostics.map((diagnostic) => (
                      <li
                        key={[diagnostic.code, diagnostic.severity, diagnostic.details].join(':')}
                        className={'is-' + diagnostic.severity.toLowerCase()}
                        data-diagnostic-code={diagnostic.code}
                        data-diagnostic-severity={diagnostic.severity}
                      >
                        <div><strong>{diagnostic.severity === 'ERROR' ? 'Erro' : 'Aviso'}</strong><code>{diagnostic.code}</code></div>
                        <p>{diagnosticMessage(diagnostic)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : <p>Clique em um objeto da página para mover, redimensionar ou ajustar sua geometria.</p>}
          <div className="vnext-divider" />
          <h3>Salvamento</h3>
          <p>
            {persistence
              ? persistence.save.message ?? persistence.save.label
              : 'Este documento continua somente em memória nesta aba.'}
          </p>
          {statusMessage && <p className="vnext-live-status" role="status">{statusMessage}</p>}
        </aside>
      </div>
      <EditorDiagnosticsProbe document={document} assetUrls={persistence?.assetUrls ?? W2C_DEMO_ASSET_URLS} onDiagnostics={receiveMeasuredDiagnostics} />
    </div>
  );
}
