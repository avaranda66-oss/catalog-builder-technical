import React from 'react';
import { FileText, Plus, Redo2, Undo2 } from 'lucide-react';
import type { ApplicationAction, DocumentSession, FrameU } from '../application';
import { mmToU, qCss, uToQ, type CatalogDocument, type Diagnostic, type EditorialObject, type Page } from '../domain';
import { compilePlans, DocumentRenderer } from '../rendering';
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
const resizeHandles: readonly ResizeHandle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
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

export function EditorWorkspace({ session }: { session: DocumentSession }) {
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
  const selectedObjectId = editorState.selectedObjectIds[0];
  const selectedObject = selectedObjectId ? selectedPage.objects.find((object) => object.id === selectedObjectId) : undefined;
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
    const currentSelectedId = editorState.selectedObjectIds[0];
    if (currentSelectedId && !activePage.objects.some((object) => object.id === currentSelectedId)) {
      setEditorState((current) => ({ ...current, selectedObjectIds: [] }));
    }
  }, [controller, document, editorState.activePageId, editorState.selectedObjectIds]);

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
    setEditorState({ activePageId: pageId, selectedObjectIds: [], mode: 'select' });
    setStatusMessage(null);
  };

  const selectObject = (objectId: string) => {
    setEditorState((current) => ({ ...current, selectedObjectIds: [objectId], mode: 'select' }));
  };

  const addPage = () => {
    controller.cancel('superseded');
    const result = session.execute({ type: 'page.add', afterPageId: selectedPage.id });
    if (!result.ok) { setStatusMessage('Não foi possível adicionar a página.'); return; }
    const createdPageId = result.metadata.createdIds[0];
    if (createdPageId) setActivePage(createdPageId);
    setStatusMessage('Página adicionada.');
  };

  const insertPageTemplate = () => {
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
    controller.cancel('history');
    const result = session.undo();
    setStatusMessage(result.ok ? 'Alteração desfeita.' : 'Não há alterações para desfazer.');
  };

  const redo = () => {
    controller.cancel('history');
    const result = session.redo();
    setStatusMessage(result.ok ? 'Alteração refeita.' : 'Não há alterações para refazer.');
  };

  const insertObject = (tool: InsertTool) => {
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
    controller.cancel('superseded');
    const result = session.execute({ type: 'object.delete', objectId: selectedObject.id });
    if (!result.ok) { setStatusMessage('Não foi possível excluir o objeto.'); return; }
    setEditorState((current) => ({ ...current, selectedObjectIds: [] }));
    setStatusMessage('Objeto excluído.');
  };

  const duplicateSelected = () => {
    if (!selectedObject) return;
    controller.cancel('superseded');
    const result = session.execute({ type: 'object.duplicate', objectId: selectedObject.id });
    if (!result.ok) { setStatusMessage('Não foi possível duplicar o objeto.'); return; }
    const objectId = result.metadata.createdIds[0];
    if (objectId) selectObject(objectId);
    setStatusMessage('Objeto duplicado.');
  };

  const reorderSelected = (target: 'back' | 'backward' | 'forward' | 'front') => {
    if (!selectedObject) return;
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
    controller.cancel('superseded');
    const result = session.execute({ type: 'image.replace', objectId: selectedObject.id, assetId: alternateDemoAssetId(selectedObject.assetId) });
    setStatusMessage(result.ok ? 'Imagem substituída.' : 'Não foi possível substituir a imagem.');
  };

  const toggleSnapping = () => {
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
    if (result.status === 'committed') setStatusMessage(result.action.type === 'object.move' ? 'Objeto movido.' : 'Objeto redimensionado.');
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

  return (
    <div className="vnext-shell" data-vnext-shell="" data-active-page-id={selectedPage.id} onKeyDownCapture={cancelOnRootKey} onBlurCapture={cancelOnRootBlur}>
      <header className="vnext-topbar">
        <div className="vnext-brand">
          <div className="vnext-brand-mark" aria-hidden="true">P</div>
          <div>
            <div className="vnext-product-line">PRESYS · Catalog Builder</div>
            <div className="vnext-title-row"><h1>{document.title}</h1><span className="vnext-badge">VNext</span></div>
          </div>
        </div>
        <div className="vnext-actions" aria-label="Histórico do documento">
          <button type="button" data-editor-action="undo" onClick={undo} disabled={!canUndo} aria-label="Desfazer última alteração"><Undo2 size={17} aria-hidden="true" /><span>Desfazer</span></button>
          <button type="button" data-editor-action="redo" onClick={redo} disabled={!canRedo} aria-label="Refazer última alteração"><Redo2 size={17} aria-hidden="true" /><span>Refazer</span></button>
        </div>
      </header>

      <div className="vnext-workspace">
        <aside className="vnext-pages" aria-label="Páginas do catálogo">
          <div className="vnext-panel-heading"><span>Páginas</span><span>{document.pages.length}</span></div>
          <nav className="vnext-page-list" aria-label="Navegação de páginas">
            {document.pages.map((page, index) => (
              <button key={page.id} type="button" className={page.id === selectedPage.id ? 'is-current' : undefined} aria-current={page.id === selectedPage.id ? 'page' : undefined} onClick={() => setActivePage(page.id)}>
                <span className="vnext-page-icon" aria-hidden="true"><FileText size={16} /></span><span>Página {index + 1}</span>
              </button>
            ))}
          </nav>
          <button type="button" className="vnext-add-page" onClick={addPage} aria-label="Adicionar nova página após a página atual"><Plus size={17} aria-hidden="true" />Adicionar página</button>
          <button type="button" className="vnext-add-page" data-editor-action="insert-template" onClick={insertPageTemplate} aria-label="Inserir modelo após a página atual"><Plus size={17} aria-hidden="true" />Inserir modelo</button>
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
              <span className="vnext-memory-status">Rascunho nesta aba</span>
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
              <button type="button" data-editor-action="duplicate" disabled={!selectedObject} onClick={duplicateSelected}>Duplicar</button>
              <button type="button" data-editor-action="delete" disabled={!selectedObject} onClick={deleteSelected}>Excluir</button>
              <button type="button" data-editor-action="send-back" disabled={!selectedObject} onClick={() => reorderSelected('back')}>Fundo</button>
              <button type="button" data-editor-action="send-backward" disabled={!selectedObject} onClick={() => reorderSelected('backward')}>Recuar</button>
              <button type="button" data-editor-action="bring-forward" disabled={!selectedObject} onClick={() => reorderSelected('forward')}>Avançar</button>
              <button type="button" data-editor-action="bring-front" disabled={!selectedObject} onClick={() => reorderSelected('front')}>Frente</button>
              <button type="button" data-editor-action="replace-image" disabled={selectedObject?.type !== 'image'} onClick={replaceSelectedImage}>Substituir imagem</button>
            </div>
          </div>

          <div className="vnext-document-preview" aria-label={'Editor da página ' + (selectedPageIndex + 1)}>
            <div className="vnext-page-stage" data-vnext-page-stage="" style={{ width: qCss(uToQ(pageWidthU)), height: qCss(uToQ(pageHeightU)) }}>
              <DocumentRenderer document={previewDocument} plans={plans} assetUrls={W2C_DEMO_ASSET_URLS} />
              <div className="vnext-editor-overlay" data-editor-overlay="" aria-label="Camada de interação do editor" onPointerDown={(event) => {
                if (event.target === event.currentTarget) { controller.cancel('superseded'); setEditorState((current) => ({ ...current, selectedObjectIds: [] })); }
              }}>
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
                  const selected = object.id === selectedObjectId;
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
                          {resizeHandles.map((handle) => (
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
          <p>Este W2.C continua somente em memória nesta aba.</p>
          {statusMessage && <p className="vnext-live-status" role="status">{statusMessage}</p>}
        </aside>
      </div>
      <EditorDiagnosticsProbe document={document} assetUrls={W2C_DEMO_ASSET_URLS} onDiagnostics={receiveMeasuredDiagnostics} />
    </div>
  );
}
