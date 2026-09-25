import React from 'react';
import { FolderOpen, FileText, Plus, Redo2, Save as SaveIcon, Undo2 } from 'lucide-react';
import { projectEditableRichText, type ApplicationAction, type CellPropertyPatch, type DocumentSession, type FrameU } from '../application';
import {
  mmToU,
  qCss,
  qToU,
  uToQ,
  type CatalogDocument,
  type Cell,
  type Diagnostic,
  type EditorialObject,
  type Page,
  type RichText,
  type TableModel,
  type TableObject,
  type TextObject,
} from '../domain';
import { compilePlans, DocumentRenderer, type LayoutSnapshot, type TablePlan } from '../rendering';
import {
  explicitTableAxisIds,
  navigateTableSelection,
  reconcileTableSelection,
  selectedTableAnchorIds,
  selectionAfterAxisInsert,
  selectionAfterAxisRemove,
  tableCellSelection,
  tableSelectionIdentity,
  type TableSelection,
} from '../editor/table-selection';
import {
  mergeEligibility,
  selectionAfterMerge,
  selectionAfterUnmerge,
  unmergeEligibility,
} from '../editor/table-merge-authoring';
import {
  prepareBulkClear,
  prepareExistingMarkerAssignment,
  prepareExternalTsvPaste,
  prepareNewMarkerAssignment,
  prepareTypedTablePaste,
  TableBulkAuthoringError,
  type PreparedTableBulkMutation,
} from '../editor/table-bulk-authoring';
import {
  parseTypedTableClipboard,
  prepareTableClipboard,
  TABLE_CLIPBOARD_MIME,
  TableClipboardError,
} from '../editor/table-clipboard';
import { legendUsageCount } from '../editor/table-marker-authoring';
import { prepareTableFitHeight } from '../editor/table-fit-height-authoring';
import {
  prepareAxisReorder,
  prepareColumnBoundaryDrag,
  prepareColumnsSetProperties,
  prepareEqualizeColumns,
  prepareRowBoundaryDrag,
  prepareRowsSetProperties,
  projectColumnDimensions,
  projectRowDimensions,
  TableDimensionAuthoringError,
} from '../editor/table-dimension-authoring';
import { parseTsv, TableTsvError } from '../editor/table-tsv';
import {
  changeTableCellDraftType,
  clearTableCellDraft,
  confirmTableCellDraftTypeChange,
  createTableCellDraft,
  setTableCellDraftComposition,
  tableCellDraftRecoveryFields,
  updateTableCellDraft,
  validateTableCellDraft,
  type EditableCellType,
  type TableCellDraft,
} from '../editor/table-cell-draft';
import type { TableLegendEntry } from '../domain/editorial-model';
import type { AuthoringRecoveryOverlay } from '../recovery';
import type { AssetPersistenceBridge, AssetRuntimeState } from '../asset';
import {
  type AuthoringBarrierResult,
  type SaveProjection,
  VNextPersistenceRuntime,
} from '../persistence';
import {
  EditorDiagnosticsProbe,
  immediateAuthoringDiagnostics,
  isCurrentDiagnosticSource,
  mergeDiagnostics,
  runtimeAssetDiagnostics,
  W2D_DIAGNOSTIC_CODES,
} from './authoring-diagnostics';
import { imageUploadLineage, uploadWorkspaceImage, type ImageUploadIntent } from './image-upload';
import { alternateDemoAssetId, createInsertSpec, W2C_DEMO_ASSET_URLS, type InsertTool } from './editor-defaults';
import { EditorInteractionController, frameToU, type FinishGestureResult, type GestureKind, type GesturePreview, type ResizeHandle } from './editor-interaction';
import { W2E_PAGE_TEMPLATE_ID } from './page-template-fixtures';
import { fatherSaveLabel } from './save-presentation';
import { projectLayoutDiagnostics, type ProjectedLayoutDiagnostic } from './layout-diagnostics-projection';
import { TableGridOverlay } from './table-grid-overlay';

type EditorSelectionState = { activePageId: string; selectedObjectIds: readonly string[]; mode: 'select' | 'text-edit' | 'table-grid' | 'cell-edit' };
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
  readonly assetRuntimeStates?: ReadonlyMap<string, AssetRuntimeState>;
  readonly recoveredOverlay?: AuthoringRecoveryOverlay;
  readonly localProtection: 'available' | 'unavailable';
  readonly localProtectionMessage?: string;
  readonly assetBridge?: AssetPersistenceBridge;
}

function LegendEditorRow({
  entry,
  usageCount,
  onUpdate,
  onRemove,
}: {
  entry: TableLegendEntry;
  usageCount: number;
  onUpdate(markerCode: string, plainText?: string): void;
  onRemove(): void;
}) {
  const editableText = projectEditableRichText(entry.text);
  const [markerCode, setMarkerCode] = React.useState(entry.markerCode);
  const [plainText, setPlainText] = React.useState(editableText ?? '');
  React.useEffect(() => {
    setMarkerCode(entry.markerCode);
    setPlainText(projectEditableRichText(entry.text) ?? '');
  }, [entry]);
  return (
    <div className="vnext-legend-entry-editor" data-legend-entry-id={entry.id}>
      <div className="vnext-legend-entry-heading">
        <strong>{entry.markerCode}</strong>
        <span>{usageCount} uso(s)</span>
      </div>
      <label>
        <span>Código do marcador</span>
        <input data-legend-marker-code={entry.id} value={markerCode} onChange={(event) => setMarkerCode(event.target.value)} />
      </label>
      <label>
        <span>Descrição</span>
        <textarea
          data-legend-text={entry.id}
          value={plainText}
          disabled={editableText === null}
          onChange={(event) => setPlainText(event.target.value.replace(/\r\n?/g, '\n'))}
        />
      </label>
      {editableText === null && <p>Texto avançado preservado; edição simples bloqueada.</p>}
      <div className="vnext-cell-edit-actions">
        <button type="button" data-editor-action="update-legend" onClick={() => onUpdate(markerCode, editableText === null ? undefined : plainText)}>
          Atualizar legenda
        </button>
        <button type="button" data-editor-action="remove-legend" disabled={usageCount > 0} title={usageCount > 0 ? `Usado por ${usageCount} célula(s).` : undefined} onClick={onRemove}>
          Excluir legenda
        </button>
      </div>
    </div>
  );
}

const subscribeToNothing = (_listener: () => void): (() => void) => () => undefined;
const idleConflictResolutionState = () => 'idle' as const;

export function EditorWorkspace({
  session,
  persistence,
  onRequestLibrary,
  demoAssets = false,
}: {
  session: DocumentSession;
  demoAssets?: boolean;
  persistence?: EditorWorkspacePersistenceProps;
  onRequestLibrary?: () => void;
}) {
  const snapshot = useDocumentSession(session);
  const conflictResolutionCoordinator = persistence?.runtime.conflictResolutionCoordinator;
  const conflictResolutionState = React.useSyncExternalStore(
    conflictResolutionCoordinator?.subscribe ?? subscribeToNothing,
    conflictResolutionCoordinator?.getState ?? idleConflictResolutionState,
    conflictResolutionCoordinator?.getState ?? idleConflictResolutionState
  );
  const conflictResolutionBusy = conflictResolutionState !== 'idle';
  const { document, canUndo, canRedo } = snapshot;
  const [editorState, setEditorState] = React.useState<EditorSelectionState>({
    activePageId: document.pages[0].id,
    selectedObjectIds: [],
    mode: 'select',
  });
  const activePageIdRef = React.useRef(editorState.activePageId);
  activePageIdRef.current = editorState.activePageId;
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = React.useState(true);
  const [tablePasteFallbackOpen, setTablePasteFallbackOpen] = React.useState(false);
  const [tablePasteFallbackText, setTablePasteFallbackText] = React.useState('');
  const [markerPanelOpen, setMarkerPanelOpen] = React.useState(false);
  const [columnDimensionsAdvancedOpen, setColumnDimensionsAdvancedOpen] = React.useState(false);
  const [pendingRowHeightMode, setPendingRowHeightMode] = React.useState<{ selectionKey: string; mode: 'MIN_MM' | 'FIXED_MM' } | null>(null);
  const [markerLegendChoice, setMarkerLegendChoice] = React.useState('');
  const [newMarkerCode, setNewMarkerCode] = React.useState('');
  const [newMarkerText, setNewMarkerText] = React.useState('');
  const [textEdit, setTextEdit] = React.useState<TextEditSession | null>(null);
  const [tableSelection, setTableSelection] = React.useState<TableSelection | null>(null);
  const [tableRangeExtensionArmed, setTableRangeExtensionArmed] = React.useState(false);
  const tableSelectionRef = React.useRef<TableSelection | null>(null);
  const [cellDraft, setCellDraft] = React.useState<TableCellDraft | null>(null);
  const cellDraftRef = React.useRef<TableCellDraft | null>(null);
  cellDraftRef.current = cellDraft;
  const cellEditorFieldRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);
  const tableHistoryContextRef = React.useRef<{ table: TableModel; selection: TableSelection } | null>(null);
  tableSelectionRef.current = tableSelection;
  const sessionRef = React.useRef(session);
  const textEditRef = React.useRef<TextEditSession | null>(null);
  const textAreaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const pendingAssetIntentRef = React.useRef<ImageUploadIntent | null>(null);
  const uploadBusyRef = React.useRef(false);
  const liveUploadContextRef = React.useRef({ session, persistence, mounted: true });
  liveUploadContextRef.current = { session, persistence, mounted: true };
  React.useEffect(() => {
    liveUploadContextRef.current.mounted = true;
    return () => { liveUploadContextRef.current.mounted = false; };
  }, []);
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
  const lastTablePointerDownRef = React.useRef<{
    objectId: string;
    timeStamp: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [measuredLayout, setMeasuredLayout] = React.useState<{
    source: CatalogDocument;
    plans: ReadonlyMap<string, TablePlan>;
    snapshot?: LayoutSnapshot;
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
  const selectedTableObject = selectedObject?.type === 'table' ? selectedObject : undefined;
  React.useEffect(() => {
    setTableRangeExtensionArmed(false);
  }, [document.id, editorState.activePageId, editorState.mode, selectedTableObject?.id, selectedTableObject?.table.id]);
  const editingObject = textEdit
    ? selectedPage.objects.find((object): object is TextObject => object.id === textEdit.objectId && object.type === 'text')
    : undefined;
  const previewDocument = React.useMemo(() => ({ ...document, pages: [selectedPage] }), [document, selectedPage]);
  const compiledPreview = React.useMemo(() => compilePlans(previewDocument), [previewDocument]);
  const plans = measuredLayout?.source === document ? measuredLayout.plans : compiledPreview.plans;
  const pageWidthU = mmToU(selectedPage.widthMm);
  const pageHeightU = mmToU(selectedPage.heightMm);
  const safeAreaU = React.useMemo(() => safeAreaFrameU(selectedPage), [selectedPage]);
  const immediateDiagnostics = React.useMemo(() => immediateAuthoringDiagnostics(document), [document]);
  const canonicalDiagnostics = React.useMemo(
    () => mergeDiagnostics(
      immediateDiagnostics,
      runtimeAssetDiagnostics(document, persistence?.assetRuntimeStates),
      measuredDiagnostics?.source === document ? measuredDiagnostics.diagnostics : []
    ).filter((diagnostic) => W2D_DIAGNOSTIC_CODES.has(diagnostic.code)),
    [document, immediateDiagnostics, measuredDiagnostics, persistence?.assetRuntimeStates]
  );
  const projectedSelectedDiagnostics = React.useMemo(
    () => selectedObjectId
      ? projectLayoutDiagnostics(document, canonicalDiagnostics, selectedPage.id, selectedObjectId)
      : [],
    [canonicalDiagnostics, document, selectedObjectId, selectedPage.id]
  );
  const fitHeightPreparation = React.useMemo(() => {
    if (!selectedTableObject) return null;
    if (cellDraft) {
      return {
        ok: false as const,
        reason: 'CELL_EDIT',
        message: 'Conclua ou cancele a edição da célula para ajustar a altura.',
      };
    }
    return prepareTableFitHeight(
      document,
      selectedPage.id,
      selectedTableObject.id,
      measuredLayout?.source === document ? measuredLayout : null
    );
  }, [cellDraft, document, measuredLayout, selectedPage.id, selectedTableObject]);
  const pageDiagnostics = React.useMemo(
    () => canonicalDiagnostics.filter((diagnostic) => diagnostic.pageId === selectedPage.id),
    [canonicalDiagnostics, selectedPage.id]
  );
  const previewCrossesSafeArea = Boolean(preview && safeAreaU && !frameContainedBy(preview.frameU, safeAreaU));
  const receiveMeasuredDiagnostics = React.useCallback((source: CatalogDocument, diagnostics: readonly Diagnostic[]) => {
    if (!isCurrentDiagnosticSource(session.getSnapshot().document, source)) return;
    setMeasuredDiagnostics({ source, diagnostics });
  }, [session]);
  const receiveMeasuredLayout = React.useCallback((
    source: CatalogDocument,
    nextPlans: ReadonlyMap<string, TablePlan>,
    layoutSnapshot: LayoutSnapshot | undefined,
    diagnostics: readonly Diagnostic[]
  ) => {
    if (session.getSnapshot().document !== source) return;
    setMeasuredLayout({ source, plans: nextPlans, snapshot: layoutSnapshot, diagnostics });
  }, [session]);
  const [inspectorDraft, setInspectorDraft] = React.useState<InspectorDraft>({ x: '', y: '', width: '', height: '' });
  const inspectorDraftRef = React.useRef(inspectorDraft);
  inspectorDraftRef.current = inspectorDraft;
  const inspectorTargetRef = React.useRef<{
    pageId: string;
    objectId: string;
    expectedFrame: EditorialObject['frame'];
  } | null>(null);
  inspectorTargetRef.current = selectedObject
    ? { pageId: selectedPage.id, objectId: selectedObject.id, expectedFrame: selectedObject.frame }
    : null;

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
    if (sessionRef.current === session) return;
    sessionRef.current = session;
    tableSelectionRef.current = null;
    tableHistoryContextRef.current = null;
    cellDraftRef.current = null;
    setCellDraft(null);
    setTableRangeExtensionArmed(false);
    setTableSelection(null);
    setEditorState((current) => ({ ...current, selectedObjectIds: [], mode: 'select' }));
  }, [session]);

  React.useEffect(() => {
    if (editorState.mode !== 'table-grid') return;
    const reconciled = reconcileTableSelection(document, tableSelectionRef.current);
    if (reconciled) {
      if (reconciled !== tableSelectionRef.current) setTableSelection(reconciled);
      const page = document.pages.find((entry) => entry.id === reconciled.identity.pageId);
      const object = page?.objects.find((entry) => entry.id === reconciled.identity.objectId);
      if (object?.type === 'table') tableHistoryContextRef.current = { table: object.table, selection: reconciled };
      return;
    }
    setTableRangeExtensionArmed(false);
    const previous = tableHistoryContextRef.current;
    const stale = tableSelectionRef.current;
    const page = stale ? document.pages.find((entry) => entry.id === stale.identity.pageId) : undefined;
    const object = stale ? page?.objects.find((entry) => entry.id === stale.identity.objectId) : undefined;
    if (stale && previous && object?.type === 'table' && object.table.id === stale.identity.tableId) {
      let next: TableSelection | undefined;
      if (stale.kind === 'rows') {
        const index = Math.max(0, previous.table.rows.findIndex((row) => row.id === stale.focusRowId));
        next = selectionAfterAxisRemove(stale.identity, 'row', index, object.table);
      } else if (stale.kind === 'columns') {
        const index = Math.max(0, previous.table.columns.findIndex((column) => column.id === stale.focusColumnId));
        next = selectionAfterAxisRemove(stale.identity, 'column', index, object.table);
      } else if (stale.kind === 'cell' || stale.kind === 'range') {
        const rowIndex = Math.max(0, previous.table.rows.findIndex((row) => row.id === stale.focus.rowId));
        const columnIndex = Math.max(0, previous.table.columns.findIndex((column) => column.id === stale.focus.columnId));
        next = tableCellSelection(stale.identity, {
          rowId: object.table.rows[Math.min(rowIndex, object.table.rows.length - 1)].id,
          columnId: object.table.columns[Math.min(columnIndex, object.table.columns.length - 1)].id,
        });
      }
      if (next) {
        tableSelectionRef.current = next;
        tableHistoryContextRef.current = { table: object.table, selection: next };
        setTableSelection(next);
        return;
      }
    }
    tableSelectionRef.current = null;
    tableHistoryContextRef.current = null;
    setTableSelection(null);
    setEditorState((current) => ({ ...current, mode: 'select' }));
    setStatusMessage('A edição da tabela foi encerrada porque o alvo não está mais disponível.');
  }, [document, editorState.mode]);

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
      const empty = { x: '', y: '', width: '', height: '' };
      inspectorDraftRef.current = empty;
      setInspectorDraft(empty);
      return;
    }
    const next = { x: String(selectedObject.frame.xMm), y: String(selectedObject.frame.yMm), width: String(selectedObject.frame.widthMm), height: String(selectedObject.frame.heightMm) };
    inspectorDraftRef.current = next;
    setInspectorDraft(next);
  }, [selectedObject]);

  React.useEffect(() => {
    const cancelOnWindowBlur = () => {
      if (controller.cancel('focus-loss')) setStatusMessage('Gesto cancelado.');
    };
    window.addEventListener('blur', cancelOnWindowBlur);
    return () => window.removeEventListener('blur', cancelOnWindowBlur);
  }, [controller]);

  const finishCellDraftForContextChange = (): boolean => {
    const draft = cellDraftRef.current;
    if (!draft) return true;
    if (!draft.dirty) {
      cellDraftRef.current = null;
      setCellDraft(null);
      persistence?.runtime.workspace.notifyDraftStateChanged();
      return true;
    }
    if (draft.composing) {
      setStatusMessage('Conclua a composição da célula antes de mudar de contexto.');
      return false;
    }
    const validation = validateTableCellDraft(draft);
    if (!validation.ok) {
      setStatusMessage(validation.message);
      return false;
    }
    const result = session.execute({
      type: 'table.cell.setContent',
      ...draft.identity,
      expectedContent: draft.originalContent,
      content: validation.input,
      ...(validation.allowTypeChange ? { allowTypeChange: true as const } : {}),
    });
    if (!result.ok) {
      setStatusMessage(result.error.code === 'TARGET_STALE'
        ? 'A célula mudou. O rascunho foi preservado para revisão.'
        : 'Não foi possível concluir o rascunho da célula.');
      return false;
    }
    cellDraftRef.current = null;
    setCellDraft(null);
    persistence?.runtime.workspace.notifyDraftStateChanged();
    return true;
  };

  const setActivePage = (pageId: string) => {
    if (!finishCellDraftForContextChange()) return;
    activePageIdRef.current = pageId;
    controller.cancel('active-page-change');
    if (textEditRef.current) {
      textEditRef.current = null;
      compositionRef.current = false;
      setTextEdit(null);
      persistence?.runtime.workspace.notifyDraftStateChanged();
    }
    tableSelectionRef.current = null;
    tableHistoryContextRef.current = null;
    setTableSelection(null);
    setEditorState({ activePageId: pageId, selectedObjectIds: [], mode: 'select' });
    setStatusMessage(null);
  };

  const selectObject = (objectId: string) => {
    if (!finishCellDraftForContextChange()) return;
    tableSelectionRef.current = null;
    tableHistoryContextRef.current = null;
    setTableSelection(null);
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
  const captureRecoveryOverlay = (): AuthoringRecoveryOverlay | undefined => {
    const cell = cellDraftRef.current;
    if (cell?.dirty) {
      const recoveryDraft = tableCellDraftRecoveryFields(cell);
      return {
        kind: 'TABLE_CELL_DRAFT_V1',
        ...cell.identity,
        expectedContent: cell.originalContent,
        activeType: cell.activeType as EditableCellType,
        draft: {
          richText: recoveryDraft.richText,
          technicalCode: recoveryDraft.technicalCode,
          measurement: recoveryDraft.measurement,
        },
        compositionWasActive: cell.composing,
      };
    }
    const edit = textEditRef.current;
    if (edit) {
      return {
        kind: 'TEXT_DRAFT_V1',
        pageId: edit.pageId,
        objectId: edit.objectId,
        expectedText: edit.expectedText,
        draft: edit.draft,
        compositionWasActive: compositionRef.current,
      };
    }
    const target = inspectorTargetRef.current;
    if (!target) return undefined;
    const draft = inspectorDraftRef.current;
    const canonical = {
      x: String(target.expectedFrame.xMm),
      y: String(target.expectedFrame.yMm),
      width: String(target.expectedFrame.widthMm),
      height: String(target.expectedFrame.heightMm),
    };
    if (
      draft.x === canonical.x
      && draft.y === canonical.y
      && draft.width === canonical.width
      && draft.height === canonical.height
    ) return undefined;
    return {
      kind: 'INSPECTOR_FRAME_DRAFT_V1',
      pageId: target.pageId,
      objectId: target.objectId,
      expectedFrame: target.expectedFrame,
      draft,
    };
  };
  const captureRecoveryOverlayRef = React.useRef(captureRecoveryOverlay);
  captureRecoveryOverlayRef.current = captureRecoveryOverlay;
  const prepareAuthoringForSave = (): AuthoringBarrierResult => {
    const cell = cellDraftRef.current;
    if (cell?.dirty) {
      if (cell.composing) {
        return { ok: false, reason: 'COMPOSITION_ACTIVE', message: 'Conclua a composição da célula antes de salvar.' };
      }
      const validation = validateTableCellDraft(cell);
      if (!validation.ok) {
        setStatusMessage(validation.message);
        return { ok: false, reason: 'INVALID_DRAFT', message: 'O rascunho da célula foi preservado porque ainda é inválido.' };
      }
      const result = session.execute({
        type: 'table.cell.setContent',
        ...cell.identity,
        expectedContent: cell.originalContent,
        content: validation.input,
        ...(validation.allowTypeChange ? { allowTypeChange: true as const } : {}),
      });
      if (!result.ok) {
        const stale = result.error.code === 'TARGET_STALE';
        setStatusMessage(stale
          ? 'A célula mudou enquanto o rascunho estava aberto. Revise antes de salvar.'
          : 'O rascunho da célula não pôde ser aplicado com segurança.');
        return {
          ok: false,
          reason: stale ? 'STALE_DRAFT' : result.error.code === 'ACTION_INVALID' ? 'INVALID_DRAFT' : 'COMMIT_FAILED',
          message: stale ? 'O rascunho da célula ficou desatualizado e foi preservado.' : 'O rascunho da célula foi preservado.',
        };
      }
      cellDraftRef.current = null;
      setCellDraft(null);
      setEditorState((current) => ({ ...current, mode: 'table-grid' }));
      persistence?.runtime.workspace.notifyDraftStateChanged();
    }
    const textResult = prepareTextDraftForSaveRef.current();
    if (!textResult.ok) return textResult;
    if (captureRecoveryOverlayRef.current()?.kind === 'INSPECTOR_FRAME_DRAFT_V1') {
      setStatusMessage('Conclua ou reverta a edição do Inspector antes de salvar.');
      return {
        ok: false,
        reason: 'INVALID_DRAFT',
        message: 'O rascunho do Inspector foi preservado e precisa ser concluído antes de salvar.',
      };
    }
    return { ok: true };
  };
  const prepareAuthoringForSaveRef = React.useRef(prepareAuthoringForSave);
  prepareAuthoringForSaveRef.current = prepareAuthoringForSave;
  const persistenceRuntime = persistence?.runtime;
  const persistenceOpenSessionId = persistence?.openSessionId;
  React.useEffect(() => {
    if (!persistenceRuntime || !persistenceOpenSessionId) return undefined;
    return persistenceRuntime.registerAuthoringBarrier(persistenceOpenSessionId, {
      prepareForSave: () => prepareAuthoringForSaveRef.current(),
      hasPendingDraft: () => Boolean(cellDraftRef.current) || Boolean(captureRecoveryOverlayRef.current()),
      captureRecoveryOverlay: () => captureRecoveryOverlayRef.current(),
    });
  }, [persistenceOpenSessionId, persistenceRuntime]);

  const recoveredOverlay = persistence?.recoveredOverlay;
  const restoredOverlayRef = React.useRef<AuthoringRecoveryOverlay | undefined>(undefined);
  React.useEffect(() => {
    if (!recoveredOverlay || restoredOverlayRef.current === recoveredOverlay) return;
    restoredOverlayRef.current = recoveredOverlay;
    const page = session.getSnapshot().document.pages.find(
      (entry) => entry.id === recoveredOverlay.pageId
    );
    const object = page?.objects.find((entry) => entry.id === recoveredOverlay.objectId);
    let restored = false;
    if (recoveredOverlay.kind === 'TABLE_CELL_DRAFT_V1' && object?.type === 'table'
      && object.table.id === recoveredOverlay.tableId) {
      const targetCell = object.table.cells.find((cell) => cell.id === recoveredOverlay.cellId && !cell.coveredBy);
      if (targetCell && JSON.stringify(targetCell.content) === JSON.stringify(recoveredOverlay.expectedContent)) {
        const selection = tableCellSelection(
          tableSelectionIdentity(recoveredOverlay.pageId, recoveredOverlay.objectId, recoveredOverlay.tableId),
          { rowId: targetCell.rowId, columnId: targetCell.columnId }
        );
        const baseDraft = createTableCellDraft({
          pageId: recoveredOverlay.pageId,
          objectId: recoveredOverlay.objectId,
          tableId: recoveredOverlay.tableId,
          cellId: recoveredOverlay.cellId,
        }, recoveredOverlay.expectedContent);
        const nextDraft: TableCellDraft = {
          ...baseDraft,
          activeType: recoveredOverlay.activeType,
          richText: recoveredOverlay.draft.richText,
          technicalCode: recoveredOverlay.draft.technicalCode,
          measurement: recoveredOverlay.draft.measurement,
          dirty: true,
          composing: false,
          requiresTypeChangeConfirmation: false,
        };
        cellDraftRef.current = nextDraft;
        setCellDraft(nextDraft);
        tableSelectionRef.current = selection;
        tableHistoryContextRef.current = { table: object.table, selection };
        setTableSelection(selection);
        setEditorState({ activePageId: recoveredOverlay.pageId, selectedObjectIds: [recoveredOverlay.objectId], mode: 'cell-edit' });
        restored = true;
      }
    } else if (
      recoveredOverlay.kind === 'TEXT_DRAFT_V1'
      && object?.type === 'text'
      && JSON.stringify(object.text) === JSON.stringify(recoveredOverlay.expectedText)
    ) {
      const edit: TextEditSession = {
        pageId: recoveredOverlay.pageId,
        objectId: recoveredOverlay.objectId,
        expectedText: recoveredOverlay.expectedText,
        draft: recoveredOverlay.draft,
      };
      textEditRef.current = edit;
      compositionRef.current = false;
      setTextEdit(edit);
      setEditorState({
        activePageId: recoveredOverlay.pageId,
        selectedObjectIds: [recoveredOverlay.objectId],
        mode: 'text-edit',
      });
      restored = true;
    } else if (
      recoveredOverlay.kind === 'INSPECTOR_FRAME_DRAFT_V1'
      && object
      && JSON.stringify(object.frame) === JSON.stringify(recoveredOverlay.expectedFrame)
    ) {
      inspectorDraftRef.current = recoveredOverlay.draft;
      setInspectorDraft(recoveredOverlay.draft);
      setEditorState({
        activePageId: recoveredOverlay.pageId,
        selectedObjectIds: [recoveredOverlay.objectId],
        mode: 'select',
      });
      restored = true;
    }
    persistenceRuntime?.consumeRecoveredOverlay(persistenceOpenSessionId!);
    setStatusMessage(restored
      ? 'Rascunho local recuperado. Confirme ou cancele antes de salvar.'
      : 'O rascunho local não pôde ser aplicado porque o objeto mudou.');
    persistenceRuntime?.workspace.notifyDraftStateChanged();
  }, [persistenceOpenSessionId, persistenceRuntime, recoveredOverlay, session]);

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

  const startTableGrid = (object: EditorialObject): boolean => {
    if (object.type !== 'table') return false;
    if (object.locked) {
      setStatusMessage('Tabela bloqueada não pode ser editada.');
      return false;
    }
    const plan = plans.get(object.table.id);
    if (!plan?.rowQ || plan.gridOffsetYQ === undefined) {
      setStatusMessage('Aguarde a medição da tabela para editar a grade.');
      return false;
    }
    controller.cancel('superseded');
    cancelTextEdit('');
    const identity = tableSelectionIdentity(selectedPage.id, object.id, object.table.id);
    const first = { rowId: object.table.rows[0].id, columnId: object.table.columns[0].id };
    const next = tableCellSelection(identity, first);
    setTableRangeExtensionArmed(false);
    tableSelectionRef.current = next;
    tableHistoryContextRef.current = { table: object.table, selection: next };
    setTableSelection(next);
    setEditorState({ activePageId: selectedPage.id, selectedObjectIds: [object.id], mode: 'table-grid' });
    setStatusMessage('Modo de grade da tabela.');
    return true;
  };

  const notifyCellDraftChanged = (next: TableCellDraft | null) => {
    cellDraftRef.current = next;
    setCellDraft(next);
    persistence?.runtime.workspace.notifyDraftStateChanged();
  };

  const selectedCellFrom = (object: TableObject, selection: TableSelection): Cell | undefined => {
    const ids = selectedTableAnchorIds(object.table, selection);
    return ids.length === 1 ? object.table.cells.find((cell) => cell.id === ids[0]) : undefined;
  };

  const startCellEdit = (point?: { rowId: string; columnId: string }): boolean => {
    const object = selectedTableObject;
    if (!object || object.locked) {
      setStatusMessage('Tabela bloqueada não pode ser editada.');
      return false;
    }
    const identity = tableSelectionIdentity(selectedPage.id, object.id, object.table.id);
    const selection = point ? tableCellSelection(identity, point) : tableSelectionRef.current;
    if (!selection) return false;
    const cell = selectedCellFrom(object, selection);
    if (!cell) {
      setStatusMessage('Selecione uma única célula para editar o conteúdo.');
      return false;
    }
    tableSelectionRef.current = selection;
    tableHistoryContextRef.current = { table: object.table, selection };
    setTableSelection(selection);
    const draft = createTableCellDraft({
      pageId: selectedPage.id,
      objectId: object.id,
      tableId: object.table.id,
      cellId: cell.id,
    }, cell.content);
    notifyCellDraftChanged(draft);
    setEditorState({ activePageId: selectedPage.id, selectedObjectIds: [object.id], mode: 'cell-edit' });
    setStatusMessage(cell.content.type === 'marker' || cell.content.type === 'image'
      ? 'Este conteúdo é somente leitura neste modo.'
      : null);
    queueMicrotask(() => cellEditorFieldRef.current?.focus());
    return true;
  };

  const cancelCellEdit = (message = 'Edição da célula cancelada.'): boolean => {
    if (!cellDraftRef.current) return false;
    notifyCellDraftChanged(null);
    setEditorState((current) => ({ ...current, mode: 'table-grid' }));
    if (message) setStatusMessage(message);
    queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());
    return true;
  };

  const applyCellDraft = (draft: TableCellDraft) => {
    const validation = validateTableCellDraft(draft);
    if (!validation.ok) return { ok: false as const, validation };
    const result = session.execute({
      type: 'table.cell.setContent',
      ...draft.identity,
      expectedContent: draft.originalContent,
      content: validation.input,
      ...(validation.allowTypeChange ? { allowTypeChange: true as const } : {}),
    });
    return result.ok ? { ok: true as const, result } : { ok: false as const, result };
  };

  const commitCellEdit = (): boolean => {
    const draft = cellDraftRef.current;
    if (!draft) return true;
    if (draft.composing) {
      setStatusMessage('Conclua a composição de texto antes de confirmar.');
      return false;
    }
    const applied = applyCellDraft(draft);
    if (!applied.ok) {
      if ('validation' in applied && applied.validation) setStatusMessage(applied.validation.message);
      else setStatusMessage(applied.result.error.code === 'TARGET_STALE'
        ? 'A célula mudou enquanto este rascunho estava aberto. Revise antes de concluir.'
        : 'O rascunho não pôde ser aplicado com segurança.');
      return false;
    }
    notifyCellDraftChanged(null);
    setEditorState((current) => ({ ...current, mode: 'table-grid' }));
    setStatusMessage(applied.result.metadata.changed ? 'Conteúdo da célula atualizado.' : 'Conteúdo da célula sem alterações.');
    queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());
    return true;
  };

  const runCellPropertyPatch = (patch: CellPropertyPatch) => {
    const object = selectedTableObject;
    const selection = tableSelectionRef.current;
    if (!object || !selection) return;
    const targetIds = selectedTableAnchorIds(object.table, selection);
    const targets = targetIds.map((cellId) => {
      const cell = object.table.cells.find((entry) => entry.id === cellId)!;
      return {
        cellId,
        ...(cell.style === undefined ? {} : { expectedStyle: cell.style }),
        ...(cell.contentPresentation === undefined ? {} : { expectedContentPresentation: cell.contentPresentation }),
      };
    });
    const result = session.execute({
      type: 'table.cell.setProperties',
      pageId: selectedPage.id,
      objectId: object.id,
      tableId: object.table.id,
      targets,
      patch,
    });
    setStatusMessage(result.ok
      ? (result.metadata.changed ? 'Propriedades da célula atualizadas.' : 'Propriedades sem alterações.')
      : result.error.code === 'TARGET_STALE'
        ? 'As propriedades mudaram; a aplicação foi cancelada sem alterações parciais.'
        : 'Não foi possível aplicar as propriedades da célula.');
  };

  const leaveTableGrid = (message = 'Manipulação do objeto restaurada.') => {
    setTableRangeExtensionArmed(false);
    tableSelectionRef.current = null;
    tableHistoryContextRef.current = null;
    setTableSelection(null);
    setEditorState((current) => ({ ...current, mode: 'select' }));
    if (message) setStatusMessage(message);
  };

  const tableActionMessage = (code: string): string => {
    if (code === 'TABLE_LAST_AXIS') return 'A última linha ou coluna não pode ser removida.';
    if (code === 'MERGE_INTERSECTION') return 'A remoção cruza uma célula mesclada. Desfaça a mesclagem antes de remover o eixo.';
    if (code === 'MERGE_HEADER_BOUNDARY') return 'Não é possível mesclar cabeçalho e corpo.';
    if (code === 'MERGE_OVERLAP') return 'Desmescle as células existentes antes de criar uma nova mesclagem.';
    if (code === 'MERGE_WOULD_DISCARD_CONTENT') return 'Não é possível mesclar porque outra célula contém conteúdo ou anotação.';
    if (code === 'TARGET_STALE') return 'A tabela mudou. A ação foi descartada sem alterar o documento.';
    if (code === 'OBJECT_LOCKED') return 'Tabela bloqueada não pode ser alterada.';
    return 'Não foi possível alterar a estrutura da tabela.';
  };

  const runTableAxisInsert = (axis: 'row' | 'column', position: 'before' | 'after') => {
    const object = selectedTableObject;
    const selection = tableSelectionRef.current;
    if (!object || !selection || editorState.mode !== 'table-grid') return;
    const axisIds = explicitTableAxisIds(object.table, selection, axis);
    if (axisIds.length !== 1) {
      setStatusMessage(`Selecione uma única ${axis === 'row' ? 'linha' : 'coluna'} pelo seletor para usar esta ação.`);
      return;
    }
    const referenceAxisId = axisIds[0];
    const referenceRow = axis === 'row' ? object.table.rows.find((row) => row.id === referenceAxisId) : undefined;
    const result = session.execute(axis === 'row' ? {
      type: 'table.axis.insert',
      pageId: selectedPage.id,
      objectId: object.id,
      tableId: object.table.id,
      axis,
      referenceAxisId,
      position,
      properties: { role: referenceRow?.role === 'header' ? 'header' : 'body', heightPolicy: { mode: 'AUTO' } },
      expectedTable: object.table,
    } : {
      type: 'table.axis.insert',
      pageId: selectedPage.id,
      objectId: object.id,
      tableId: object.table.id,
      axis,
      referenceAxisId,
      position,
      properties: { width: { mode: 'flex', weight: 1 }, minMm: 1 },
      expectedTable: object.table,
    });
    if (!result.ok) {
      setStatusMessage(tableActionMessage(result.error.code));
      return;
    }
    const nextObject = result.document.pages.find((page) => page.id === selectedPage.id)?.objects
      .find((candidate): candidate is TableObject => candidate.id === object.id && candidate.type === 'table');
    const axes = axis === 'row' ? nextObject?.table.rows : nextObject?.table.columns;
    const insertedId = axes?.find((candidate) => result.metadata.createdIds.includes(candidate.id))?.id;
    if (insertedId) {
      const nextSelection = selectionAfterAxisInsert(selection.identity, axis, insertedId);
      tableSelectionRef.current = nextSelection;
      tableHistoryContextRef.current = { table: nextObject!.table, selection: nextSelection };
      setTableSelection(nextSelection);
    }
    setStatusMessage(axis === 'row' ? 'Linha inserida.' : 'Coluna inserida.');
  };

  const runTableAxisRemove = (axis: 'row' | 'column') => {
    const object = selectedTableObject;
    const selection = tableSelectionRef.current;
    if (!object || !selection || editorState.mode !== 'table-grid') return;
    const axisIds = explicitTableAxisIds(object.table, selection, axis);
    if (axisIds.length !== 1) {
      setStatusMessage(`Selecione uma única ${axis === 'row' ? 'linha' : 'coluna'} pelo seletor para remover.`);
      return;
    }
    const axisId = axisIds[0];
    const removedIndex = (axis === 'row' ? object.table.rows : object.table.columns).findIndex((entry) => entry.id === axisId);
    const result = session.execute({
      type: 'table.axis.remove',
      pageId: selectedPage.id,
      objectId: object.id,
      tableId: object.table.id,
      axis,
      axisId,
      expectedTable: object.table,
    });
    if (!result.ok) {
      setStatusMessage(tableActionMessage(result.error.code));
      return;
    }
    const nextObject = result.document.pages.find((page) => page.id === selectedPage.id)?.objects
      .find((candidate): candidate is TableObject => candidate.id === object.id && candidate.type === 'table');
    if (nextObject) {
      const nextSelection = selectionAfterAxisRemove(selection.identity, axis, removedIndex, nextObject.table);
      tableSelectionRef.current = nextSelection;
      tableHistoryContextRef.current = { table: nextObject.table, selection: nextSelection };
      setTableSelection(nextSelection);
    }
    setStatusMessage(axis === 'row' ? 'Linha removida.' : 'Coluna removida.');
  };

  const currentSelectedTableForStructure = (): { object: TableObject; selection: TableSelection } | undefined => {
    const selection = tableSelectionRef.current;
    if (!selection) return undefined;
    const live = session.getSnapshot().document;
    const page = live.pages.find((entry) => entry.id === selection.identity.pageId);
    const object = page?.objects.find((entry): entry is TableObject =>
      entry.id === selection.identity.objectId && entry.type === 'table' && entry.table.id === selection.identity.tableId
    );
    return object ? { object, selection } : undefined;
  };

  const toggleTableRangeExtension = () => {
    const selection = tableSelectionRef.current;
    if (editorState.mode !== 'table-grid' || !selection || selection.kind === 'table') {
      setStatusMessage('Selecione uma célula, linha ou coluna para iniciar a extensão da seleção.');
      return;
    }
    setTableRangeExtensionArmed((armed) => {
      const next = !armed;
      setStatusMessage(next
        ? 'Estender seleção ativado. Toque na célula, linha ou coluna final.'
        : 'Extensão de seleção cancelada.');
      return next;
    });
  };

  const tableBulkActionMessage = (code: string): string => {
    if (code === 'TABLE_PASTE_GEOMETRY_INVALID') return 'A área de destino mudou ou não corresponde ao conteúdo copiado.';
    if (code === 'TABLE_PASTE_MERGE_INTERSECTION') return 'Não foi possível aplicar: a seleção cruza células mescladas.';
    if (code === 'TABLE_CELL_CONTENT_UNSUPPORTED') return 'A seleção contém imagem, que não participa da edição em lote desta etapa.';
    if (code === 'LEGEND_NOT_FOUND') return 'A legenda escolhida não existe mais.';
    if (code === 'LEGEND_IN_USE') return 'Não é possível excluir esta legenda enquanto houver células usando o marcador.';
    if (code === 'LEGEND_MARKER_CODE_CONFLICT') return 'Já existe um marcador com este código e outro significado.';
    if (code === 'TARGET_STALE') return 'A tabela mudou. A operação foi cancelada sem alterações parciais.';
    if (code === 'OBJECT_LOCKED') return 'Tabela bloqueada não pode ser alterada.';
    return 'Não foi possível concluir a operação em lote.';
  };

  const executePreparedTableBulk = (
    prepared: PreparedTableBulkMutation,
    successMessage: string
  ): boolean => {
    const live = currentSelectedTableForStructure();
    if (!live || editorState.mode !== 'table-grid') return false;
    const result = session.execute({
      type: 'table.cells.setContents',
      pageId: live.selection.identity.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      geometry: prepared.geometry,
      targets: prepared.targets,
      ...(prepared.legendCreates ? { legendCreates: prepared.legendCreates } : {}),
      ...(prepared.expectedLegend ? { expectedLegend: prepared.expectedLegend } : {}),
    });
    if (!result.ok) {
      setStatusMessage(tableBulkActionMessage(result.error.code));
      return false;
    }
    const nextObject = result.document.pages
      .find((page) => page.id === live.selection.identity.pageId)?.objects
      .find((candidate): candidate is TableObject =>
        candidate.id === live.object.id && candidate.type === 'table'
      );
    if (nextObject) {
      tableSelectionRef.current = prepared.selectionAfter;
      tableHistoryContextRef.current = { table: nextObject.table, selection: prepared.selectionAfter };
      setTableSelection(prepared.selectionAfter);
    }
    setStatusMessage(result.metadata.changed ? successMessage : 'Conteúdo sem alterações.');
    queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());
    return true;
  };

  const prepareCurrentClipboard = () => {
    const live = currentSelectedTableForStructure();
    if (!live) throw new TableClipboardError('COPY_SELECTION_INVALID', 'A seleção da tabela não está disponível');
    return prepareTableClipboard(
      live.object.table,
      live.selection,
      session.getSnapshot().document.assets
    );
  };

  const handleTableCopyClipboard = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (editorState.mode !== 'table-grid') return;
    try {
      const clipboard = prepareCurrentClipboard();
      event.clipboardData.setData('text/plain', clipboard.tsv);
      event.clipboardData.setData(TABLE_CLIPBOARD_MIME, clipboard.typedText);
      event.preventDefault();
      setStatusMessage('Conteúdo da tabela copiado.');
    } catch (error) {
      event.preventDefault();
      setStatusMessage(error instanceof TableClipboardError && error.code === 'COPY_MERGE_INTERSECTION'
        ? 'Não foi possível copiar: a seleção cruza células mescladas.'
        : 'Não foi possível copiar a seleção da tabela.');
    }
  };

  const runPreparedPaste = (typedText: string, plainText: string): boolean => {
    const live = currentSelectedTableForStructure();
    if (!live || editorState.mode !== 'table-grid') return false;
    try {
      const prepared = typedText
        ? prepareTypedTablePaste(live.object.table, live.selection, parseTypedTableClipboard(typedText))
        : prepareExternalTsvPaste(live.object.table, live.selection, parseTsv(plainText));
      const count = prepared.targets.length;
      return executePreparedTableBulk(prepared, `${count} célula(s) colada(s).`);
    } catch (error) {
      if (error instanceof TableBulkAuthoringError) setStatusMessage(tableBulkActionMessage(error.code));
      else if (error instanceof TableTsvError) setStatusMessage('O texto colado não forma uma tabela TSV válida.');
      else if (error instanceof TableClipboardError) setStatusMessage('O conteúdo interno copiado não é válido para esta tabela.');
      else setStatusMessage('Não foi possível interpretar o conteúdo colado.');
      return false;
    }
  };

  const handleTablePasteClipboard = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (editorState.mode !== 'table-grid') return;
    event.preventDefault();
    const types = Array.from(event.clipboardData.types);
    const typedText = types.includes(TABLE_CLIPBOARD_MIME)
      ? event.clipboardData.getData(TABLE_CLIPBOARD_MIME)
      : '';
    const plainText = event.clipboardData.getData('text/plain');
    runPreparedPaste(typedText, plainText);
  };

  const runVisibleTableCopy = async () => {
    if (editorState.mode !== 'table-grid') return;
    try {
      const clipboard = prepareCurrentClipboard();
      if (!globalThis.navigator?.clipboard?.writeText) {
        setStatusMessage('A cópia pelo botão não está disponível neste navegador. Use Ctrl/Cmd+C na grade.');
        return;
      }
      await globalThis.navigator.clipboard.writeText(clipboard.tsv);
      setStatusMessage('Conteúdo TSV copiado. Ctrl/Cmd+C na grade também preserva os tipos internos.');
    } catch (error) {
      setStatusMessage(error instanceof TableClipboardError && error.code === 'COPY_MERGE_INTERSECTION'
        ? 'Não foi possível copiar: a seleção cruza células mescladas.'
        : 'O navegador não permitiu copiar a seleção.');
    }
  };

  const runTableBulkClear = () => {
    const live = currentSelectedTableForStructure();
    if (!live || editorState.mode !== 'table-grid') return;
    try {
      const prepared = prepareBulkClear(live.object.table, live.selection);
      executePreparedTableBulk(prepared, `Conteúdo limpo em ${prepared.targets.length} célula(s).`);
    } catch (error) {
      setStatusMessage(error instanceof TableBulkAuthoringError
        ? tableBulkActionMessage(error.code)
        : 'Não foi possível limpar a seleção.');
    }
  };

  const runExistingMarkerAssignment = () => {
    const live = currentSelectedTableForStructure();
    if (!live || editorState.mode !== 'table-grid' || !markerLegendChoice) return;
    try {
      const prepared = prepareExistingMarkerAssignment(
        live.object.table,
        live.selection,
        markerLegendChoice
      );
      executePreparedTableBulk(prepared, `Marcador aplicado a ${prepared.targets.length} célula(s).`);
    } catch (error) {
      setStatusMessage(error instanceof TableBulkAuthoringError
        ? tableBulkActionMessage(error.code)
        : 'Não foi possível aplicar o marcador.');
    }
  };

  const runNewMarkerAssignment = () => {
    const live = currentSelectedTableForStructure();
    if (!live || editorState.mode !== 'table-grid') return;
    if (!newMarkerCode || !newMarkerText) {
      setStatusMessage('Informe o código e a descrição do novo marcador.');
      return;
    }
    try {
      const prepared = prepareNewMarkerAssignment(
        live.object.table,
        live.selection,
        newMarkerCode,
        newMarkerText
      );
      const applied = executePreparedTableBulk(
        prepared,
        `Novo marcador criado e aplicado a ${prepared.targets.length} célula(s).`
      );
      if (applied) {
        setNewMarkerCode('');
        setNewMarkerText('');
      }
    } catch (error) {
      setStatusMessage(error instanceof TableBulkAuthoringError
        ? tableBulkActionMessage(error.code)
        : 'Não foi possível criar e aplicar o marcador.');
    }
  };

  const runLegendCreateOnly = () => {
    const live = currentSelectedTableForStructure();
    if (!live || editorState.mode !== 'table-grid') return;
    if (!newMarkerCode || !newMarkerText) {
      setStatusMessage('Informe o código e a descrição da legenda.');
      return;
    }
    const result = session.execute({
      type: 'table.legend.create',
      pageId: live.selection.identity.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      markerCode: newMarkerCode,
      plainText: newMarkerText,
      expectedLegend: live.object.table.legend,
    });
    if (!result.ok) {
      setStatusMessage(tableBulkActionMessage(result.error.code));
      return;
    }
    const createdLegend = result.metadata.createdIds
      .map((id) => result.document.pages
        .find((page) => page.id === live.selection.identity.pageId)?.objects
        .find((candidate): candidate is TableObject => candidate.id === live.object.id && candidate.type === 'table')
        ?.table.legend.find((entry) => entry.id === id))
      .find(Boolean);
    if (createdLegend) setMarkerLegendChoice(createdLegend.id);
    setNewMarkerCode('');
    setNewMarkerText('');
    setStatusMessage('Legenda criada.');
  };

  const runLegendUpdate = (entry: TableLegendEntry, markerCode: string, plainText?: string) => {
    const live = currentSelectedTableForStructure();
    if (!live || editorState.mode !== 'table-grid') return;
    const result = session.execute({
      type: 'table.legend.update',
      pageId: live.selection.identity.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      legendEntryId: entry.id,
      expectedLegend: entry,
      patch: {
        markerCode,
        ...(plainText === undefined ? {} : { plainText }),
      },
    });
    setStatusMessage(result.ok
      ? (result.metadata.changed ? 'Legenda atualizada.' : 'Legenda sem alterações.')
      : tableBulkActionMessage(result.error.code));
  };

  const runLegendRemove = (entry: TableLegendEntry) => {
    const live = currentSelectedTableForStructure();
    if (!live || editorState.mode !== 'table-grid') return;
    const result = session.execute({
      type: 'table.legend.remove',
      pageId: live.selection.identity.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      legendEntryId: entry.id,
      expectedLegend: entry,
    });
    if (!result.ok) {
      setStatusMessage(tableBulkActionMessage(result.error.code));
      return;
    }
    if (markerLegendChoice === entry.id) setMarkerLegendChoice('');
    setStatusMessage('Legenda excluída.');
  };

  const runMarkerDetach = () => {
    const live = currentSelectedTableForStructure();
    if (!live || editorState.mode !== 'table-grid') return;
    const targetIds = selectedTableAnchorIds(live.object.table, live.selection);
    const selected = targetIds.map((id) => live.object.table.cells.find((cell) => cell.id === id)!);
    if (selected.length === 0 || selected.some((cell) => cell.content.type !== 'marker')) {
      setStatusMessage('Selecione somente células com marcador para remover o marcador.');
      return;
    }
    runTableBulkClear();
  };

  const applyNativePasteFallback = () => {
    if (!tablePasteFallbackText) {
      setStatusMessage('Cole o conteúdo no campo antes de aplicar.');
      return;
    }
    if (runPreparedPaste('', tablePasteFallbackText)) {
      setTablePasteFallbackText('');
      setTablePasteFallbackOpen(false);
    }
  };

  const runTableMerge = () => {
    if (!finishCellDraftForContextChange()) return;
    const live = currentSelectedTableForStructure();
    if (!live) return;
    const eligibility = mergeEligibility(live.object.table, live.selection);
    if (!eligibility.enabled || !eligibility.prepared) {
      setStatusMessage(eligibility.reason ?? 'Não foi possível mesclar a seleção.');
      return;
    }
    const result = session.execute({
      type: 'table.cells.merge',
      pageId: live.selection.identity.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      ...eligibility.prepared,
      expectedTable: live.object.table,
    });
    if (!result.ok) {
      setStatusMessage(tableActionMessage(result.error.code));
      return;
    }
    const nextObject = result.document.pages.find((page) => page.id === live.selection.identity.pageId)?.objects
      .find((candidate): candidate is TableObject => candidate.id === live.object.id && candidate.type === 'table');
    if (nextObject) {
      const nextSelection = selectionAfterMerge(live.selection.identity, nextObject.table, eligibility.prepared.anchorCellId);
      tableSelectionRef.current = nextSelection;
      tableHistoryContextRef.current = { table: nextObject.table, selection: nextSelection };
      setTableSelection(nextSelection);
    }
    setEditorState((current) => ({ ...current, mode: 'table-grid' }));
    setStatusMessage(result.metadata.changed ? 'Células mescladas.' : 'A seleção já representa uma única célula.');
    queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());
  };

  const runTableUnmerge = () => {
    if (!finishCellDraftForContextChange()) return;
    const live = currentSelectedTableForStructure();
    if (!live) return;
    const eligibility = unmergeEligibility(live.object.table, live.selection);
    if (!eligibility.enabled || !eligibility.anchorCellId) {
      setStatusMessage(eligibility.reason ?? 'Selecione uma célula mesclada.');
      return;
    }
    const anchor = live.object.table.cells.find((cell) => cell.id === eligibility.anchorCellId)!;
    const rowIndex = live.object.table.rows.findIndex((row) => row.id === anchor.rowId);
    const columnIndex = live.object.table.columns.findIndex((column) => column.id === anchor.columnId);
    const rows = anchor.span?.rows ?? 1;
    const columns = anchor.span?.columns ?? 1;
    const result = session.execute({
      type: 'table.cell.unmerge',
      pageId: live.selection.identity.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      anchorCellId: eligibility.anchorCellId,
      expectedTable: live.object.table,
    });
    if (!result.ok) {
      setStatusMessage(tableActionMessage(result.error.code));
      return;
    }
    const nextObject = result.document.pages.find((page) => page.id === live.selection.identity.pageId)?.objects
      .find((candidate): candidate is TableObject => candidate.id === live.object.id && candidate.type === 'table');
    if (nextObject) {
      let nextSelection: TableSelection;
      try {
        nextSelection = selectionAfterUnmerge(
          live.selection.identity,
          nextObject.table,
          rowIndex,
          columnIndex,
          rows,
          columns,
          eligibility.anchorCellId
        );
      } catch {
        const nextAnchor = nextObject.table.cells.find((cell) => cell.id === eligibility.anchorCellId)!;
        nextSelection = tableCellSelection(live.selection.identity, { rowId: nextAnchor.rowId, columnId: nextAnchor.columnId });
      }
      tableSelectionRef.current = nextSelection;
      tableHistoryContextRef.current = { table: nextObject.table, selection: nextSelection };
      setTableSelection(nextSelection);
    }
    setEditorState((current) => ({ ...current, mode: 'table-grid' }));
    setStatusMessage(result.metadata.changed ? 'Células desmescladas.' : 'A célula já estava desmesclada.');
    queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());
  };

  const finishTextEditBeforeCommand = (): boolean => finishCellDraftForContextChange() && (!textEditRef.current || commitTextEdit());

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
    if (cellDraftRef.current) {
      cancelCellEdit('');
      controller.cancel('history');
      setStatusMessage('Edição da célula cancelada antes de desfazer o documento.');
      return;
    }
    cancelTextEdit('');
    controller.cancel('history');
    const result = session.undo();
    setStatusMessage(result.ok ? 'Alteração desfeita.' : 'Não há alterações para desfazer.');
  };

  const redo = () => {
    if (cellDraftRef.current) {
      cancelCellEdit('');
      controller.cancel('history');
      setStatusMessage('Edição da célula cancelada antes de refazer o documento.');
      return;
    }
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
    if (tool === 'image' && (persistence || !demoAssets)) {
      requestImageUpload({ type: 'insert', pageId: currentPage.id });
      return;
    }
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

  const requestImageUpload = (target: { type: 'insert'; pageId: string } | { type: 'replace'; objectId: string }) => {
    if (uploadBusyRef.current) return;
    if (!persistence?.assetBridge) {
      setStatusMessage('Envio de imagens indisponível neste ambiente.');
      return;
    }
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    pendingAssetIntentRef.current = { ...target, session, lineage: imageUploadLineage(persistence.runtime) };
    fileInputRef.current?.click();
  };

  const replaceSelectedImage = () => {
    if (!selectedObject || selectedObject.type !== 'image') return;
    if (persistence || !demoAssets) {
      requestImageUpload({ type: 'replace', objectId: selectedObject.id });
      return;
    }
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const result = session.execute({ type: 'image.replace', objectId: selectedObject.id, assetId: alternateDemoAssetId(selectedObject.assetId) });
    setStatusMessage(result.ok ? 'Imagem substituída.' : 'Não foi possível substituir a imagem.');
  };

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const intent = pendingAssetIntentRef.current;
    pendingAssetIntentRef.current = null;
    if (!file || !intent || uploadBusyRef.current || !persistence?.assetBridge) return;
    uploadBusyRef.current = true;
    setStatusMessage('Enviando imagem…');
    const isCurrent = () => liveUploadContextRef.current.mounted
      && liveUploadContextRef.current.session === intent.session
      && liveUploadContextRef.current.persistence?.runtime === persistence.runtime;
    try {
      const result = await uploadWorkspaceImage({
        intent, file, runtime: persistence.runtime, bridge: persistence.assetBridge,
        getActivePageId: () => activePageIdRef.current,
        isCurrent,
      });
      if (!isCurrent()) return;
      if (result.objectId && intent.type === 'insert') selectObject(result.objectId);
      setStatusMessage(result.message);
    } finally {
      uploadBusyRef.current = false;
    }
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
    if (editorState.mode === 'table-grid') {
      if (selectedTableObject?.id === object.id) return;
      leaveTableGrid('');
    }
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
    if (kind.type === 'move' && object.type === 'table') {
      const selected = editorState.selectedObjectIds.length === 1 && editorState.selectedObjectIds[0] === object.id;
      const previous = lastTablePointerDownRef.current;
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
      lastTablePointerDownRef.current = {
        objectId: object.id,
        timeStamp: event.timeStamp,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (isSecondActivation) {
        controller.cancel('superseded');
        startTableGrid(object);
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
    const target = event.target as HTMLElement;
    const isNativeInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      || target.getAttribute(['content', 'editable'].join('')) === 'true';
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && cellDraftRef.current) {
      event.preventDefault();
      event.stopPropagation();
      cancelCellEdit('');
      setStatusMessage('Edição da célula cancelada antes de desfazer o documento.');
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && cellDraftRef.current) {
      event.preventDefault();
      event.stopPropagation();
      cancelCellEdit('');
      setStatusMessage('Edição da célula cancelada antes de refazer o documento.');
      return;
    }
    if (!isNativeInput && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if (!isNativeInput && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (cellDraftRef.current) {
      const draft = cellDraftRef.current;
      if (draft.composing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelCellEdit();
        return;
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        commitCellEdit();
        return;
      }
      return;
    }
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
    if (
      editorState.mode === 'table-grid'
      && selectedTableObject
      && tableSelectionRef.current
      && target.closest('[data-table-grid-overlay]')
    ) {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        runTableBulkClear();
        return;
      }
      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        event.stopPropagation();
        startCellEdit();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        leaveTableGrid();
        return;
      }
      if (event.key === 'Tab' || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const navigation = navigateTableSelection(
          selectedTableObject.table,
          tableSelectionRef.current,
          event.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Tab',
          { extend: event.shiftKey && event.key !== 'Tab', backwards: event.shiftKey && event.key === 'Tab' }
        );
        if (navigation.exited) {
          leaveTableGrid('Fim da grade; manipulação do objeto restaurada.');
        } else {
          tableSelectionRef.current = navigation.selection;
          tableHistoryContextRef.current = { table: selectedTableObject.table, selection: navigation.selection };
          setTableSelection(navigation.selection);
        }
        return;
      }
    }
    if (event.key === 'Enter' && selectedObject?.type === 'text') {
      if (!['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(target.tagName)) {
        event.preventDefault();
        startTextEdit(selectedObject);
        return;
      }
    }
    if (event.key === 'Enter' && selectedObject?.type === 'table' && !isNativeInput) {
      event.preventDefault();
      startTableGrid(selectedObject);
      return;
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
    const target = event.target as HTMLElement;
    if (cellDraftRef.current) {
      if (target.closest('[data-cell-edit-session]') || target.closest('[data-table-grid-overlay]') || target.closest('[data-table-cell-inspector]')) return;
      if (target.closest('[data-persistence-save-action]')) return;
      if (target.closest('[data-editor-action="undo"], [data-editor-action="redo"]')) return;
      if (!finishCellDraftForContextChange()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (!textEditRef.current) return;
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
    persistence?.runtime.workspace.notifyDraftStateChanged();
    queueMicrotask(() => {
      const current = textAreaRef.current;
      if (!current) return;
      current.focus();
      current.setSelectionRange(caret, caret);
    });
  };

  const updateInspectorDraft = (field: keyof InspectorDraft, value: string) => {
    const next = { ...inspectorDraftRef.current, [field]: value };
    inspectorDraftRef.current = next;
    setInspectorDraft(next);
    persistence?.runtime.workspace.notifyDraftStateChanged();
  };

  const selectedAnchorCells = selectedTableObject && tableSelection
    ? selectedTableAnchorIds(selectedTableObject.table, tableSelection)
      .map((cellId) => selectedTableObject.table.cells.find((cell) => cell.id === cellId))
      .filter((cell): cell is Cell => Boolean(cell))
    : [];
  function commonCellStyleValue<K extends keyof NonNullable<Cell['style']>>(
    key: K
  ): NonNullable<Cell['style']>[K] | undefined {
    if (selectedAnchorCells.length === 0) return undefined;
    const first = selectedAnchorCells[0].style?.[key];
    return selectedAnchorCells.every((cell) => JSON.stringify(cell.style?.[key]) === JSON.stringify(first))
      ? first
      : undefined;
  }
  const commonWrapPolicy = selectedAnchorCells.length > 0
    && selectedAnchorCells.every((cell) => cell.contentPresentation?.wrapPolicy === selectedAnchorCells[0].contentPresentation?.wrapPolicy)
    ? selectedAnchorCells[0].contentPresentation?.wrapPolicy
    : undefined;
  const propertySelectionKey = selectedAnchorCells
    .map((cell) => [cell.id, JSON.stringify(cell.style), JSON.stringify(cell.contentPresentation)].join(':'))
    .join('|');

  const commitCellColor = (key: 'color' | 'background', raw: string) => {
    if (raw === '') {
      runCellPropertyPatch({ [key]: null } as CellPropertyPatch);
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(raw)) {
      setStatusMessage('Informe uma cor hexadecimal válida, como #1A2B3C.');
      return;
    }
    runCellPropertyPatch({ [key]: raw } as CellPropertyPatch);
  };

  const commitCellPadding = (edge: 'top' | 'right' | 'bottom' | 'left', raw: string) => {
    if (raw.trim() === '') {
      runCellPropertyPatch({ paddingMm: { [edge]: null } } as CellPropertyPatch);
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      setStatusMessage('Informe um padding válido em milímetros, igual ou maior que zero.');
      return;
    }
    runCellPropertyPatch({ paddingMm: { [edge]: value } } as CellPropertyPatch);
  };

  const selectedRowAxisIds = selectedTableObject && tableSelection
    ? explicitTableAxisIds(selectedTableObject.table, tableSelection, 'row')
    : [];
  const selectedColumnAxisIds = selectedTableObject && tableSelection
    ? explicitTableAxisIds(selectedTableObject.table, tableSelection, 'column')
    : [];
  const selectedRowDimensionKey = selectedRowAxisIds.join('\u0000');
  const rowAxisReason = selectedRowAxisIds.length === 1
    ? undefined
    : 'Selecione uma única linha pelo seletor lateral.';
  const columnAxisReason = selectedColumnAxisIds.length === 1
    ? undefined
    : 'Selecione uma única coluna pelo seletor superior.';
  const rowDimensionProjection = (() => {
    if (!selectedTableObject || !tableSelection || tableSelection.kind !== 'rows') return undefined;
    try { return projectRowDimensions(selectedTableObject.table, tableSelection); } catch { return undefined; }
  })();
  const columnDimensionProjection = (() => {
    if (!selectedTableObject || !tableSelection || tableSelection.kind !== 'columns') return undefined;
    try { return projectColumnDimensions(selectedTableObject.table, tableSelection); } catch { return undefined; }
  })();
  const effectiveRowHeightMode = pendingRowHeightMode?.selectionKey === selectedRowDimensionKey
    ? pendingRowHeightMode.mode
    : rowDimensionProjection?.heightMode;
  const tableDimensionMessage = (code: string): string => {
    if (code === 'TARGET_STALE') return 'A dimensão mudou enquanto a ação era preparada. Nada foi alterado.';
    if (code === 'TABLE_WIDTH_INFEASIBLE' || code === 'COLUMN_LIMIT_INVALID') return 'As larguras e limites atuais não cabem na largura da tabela.';
    if (code === 'COLUMN_WEIGHT_INVALID') return 'O peso flexível deve ser um inteiro positivo.';
    if (code === 'MERGE_INTERSECTION') return 'Esta movimentação cruza uma célula mesclada. Desmescle explicitamente antes de reordenar.';
    if (code === 'MERGE_HEADER_BOUNDARY') return 'Esta alteração faria uma célula mesclada cruzar cabeçalho e corpo.';
    if (code === 'OBJECT_LOCKED') return 'Tabela bloqueada não pode ser alterada.';
    if (code === 'AXIS_ORDER_INVALID') return 'A nova ordem de linhas ou colunas é inválida.';
    return 'Não foi possível aplicar a dimensão da tabela com segurança.';
  };
  const executeTableDimensionAction = (action: ApplicationAction, successMessage: string): boolean => {
    if (cellDraftRef.current || editorState.mode !== 'table-grid') {
      setStatusMessage('Conclua ou cancele a edição da célula para alterar a estrutura da tabela.');
      return false;
    }
    const live = currentSelectedTableForStructure();
    if (!live) return false;
    const result = session.execute(action);
    if (!result.ok) {
      setStatusMessage(tableDimensionMessage(result.error.code));
      return false;
    }
    const reconciled = reconcileTableSelection(result.document, live.selection);
    if (reconciled) {
      tableSelectionRef.current = reconciled;
      const page = result.document.pages.find((entry) => entry.id === reconciled.identity.pageId);
      const object = page?.objects.find((entry): entry is TableObject =>
        entry.id === reconciled.identity.objectId && entry.type === 'table'
      );
      if (object) tableHistoryContextRef.current = { table: object.table, selection: reconciled };
      setTableSelection(reconciled);
    }
    setStatusMessage(result.metadata.changed ? successMessage : 'Sem alterações.');
    queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());
    return result.metadata.changed;
  };
  const dimensionIdentity = () => {
    const live = currentSelectedTableForStructure();
    return live ? {
      pageId: live.selection.identity.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
    } : undefined;
  };
  const runRowProperties = (next: Parameters<typeof prepareRowsSetProperties>[3], message: string) => {
    const live = currentSelectedTableForStructure();
    const identity = dimensionIdentity();
    if (!live || !identity) return;
    try {
      executeTableDimensionAction(prepareRowsSetProperties(identity, live.object.table, live.selection, next), message);
    } catch (error) {
      setStatusMessage(error instanceof TableDimensionAuthoringError ? error.message : 'Não foi possível preparar a alteração da linha.');
    }
  };
  const measuredRowHeightU = (rowId: string): number | undefined => {
    if (!selectedTableObject) return undefined;
    const plan = plans.get(selectedTableObject.table.id);
    const index = selectedTableObject.table.rows.findIndex((row) => row.id === rowId);
    return index >= 0 ? plan?.heightsU?.[index] : undefined;
  };
  const runRowHeightMode = (mode: 'AUTO' | 'MIN_MM' | 'FIXED_MM') => {
    if (mode === 'AUTO') {
      setPendingRowHeightMode(null);
      runRowProperties({ heightPolicy: { mode: 'AUTO' } }, 'Altura automática aplicada.');
      return;
    }
    const firstRowId = selectedRowAxisIds[0];
    const projected = typeof rowDimensionProjection?.valueU === 'number' ? rowDimensionProjection.valueU : undefined;
    const valueU = projected ?? (firstRowId ? measuredRowHeightU(firstRowId) : undefined);
    if (!valueU) {
      setPendingRowHeightMode({ selectionKey: selectedRowDimensionKey, mode });
      setStatusMessage('Informe a altura numericamente para aplicar este modo.');
      return;
    }
    setPendingRowHeightMode(null);
    runRowProperties(
      { heightPolicy: mode === 'MIN_MM' ? { mode, minU: valueU } : { mode, heightU: valueU } },
      mode === 'MIN_MM' ? 'Altura mínima aplicada.' : 'Altura exata aplicada.'
    );
  };
  const runRowHeightValue = (raw: string) => {
    const value = Number(raw.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0 || !rowDimensionProjection || effectiveRowHeightMode === 'mixed') {
      setStatusMessage('Informe uma altura positiva em milímetros.');
      return;
    }
    const valueU = mmToU(value);
    if (effectiveRowHeightMode === 'MIN_MM') {
      setPendingRowHeightMode(null);
      runRowProperties({ heightPolicy: { mode: 'MIN_MM', minU: valueU } }, 'Altura mínima atualizada.');
    }
    if (effectiveRowHeightMode === 'FIXED_MM') {
      setPendingRowHeightMode(null);
      runRowProperties({ heightPolicy: { mode: 'FIXED_MM', heightU: valueU } }, 'Altura exata atualizada.');
    }
  };
  const runColumnProperties = (next: Parameters<typeof prepareColumnsSetProperties>[4], message: string) => {
    const live = currentSelectedTableForStructure();
    const identity = dimensionIdentity();
    if (!live || !identity) return;
    try {
      executeTableDimensionAction(
        prepareColumnsSetProperties(identity, live.object.table, frameToU(live.object.frame).widthU, live.selection, next),
        message
      );
    } catch (error) {
      setStatusMessage(error instanceof TableDimensionAuthoringError ? error.message : 'Não foi possível preparar a alteração da coluna.');
    }
  };
  const runColumnMode = (mode: 'fixed' | 'flex') => {
    const live = currentSelectedTableForStructure();
    if (!live || live.selection.kind !== 'columns') return;
    if (mode === 'flex') {
      const weight = typeof columnDimensionProjection?.flexWeight === 'number' ? columnDimensionProjection.flexWeight : 1;
      runColumnProperties({ width: { mode: 'flex', weight } }, 'Largura flexível aplicada.');
      return;
    }
    const first = selectedColumnAxisIds[0];
    const index = live.object.table.columns.findIndex((column) => column.id === first);
    const widthU = typeof columnDimensionProjection?.fixedWidthU === 'number'
      ? columnDimensionProjection.fixedWidthU
      : plans.get(live.object.table.id)?.widthsU[index];
    if (!widthU) {
      setStatusMessage('Aguarde a medição da tabela para converter a coluna em largura fixa.');
      return;
    }
    runColumnProperties({ width: { mode: 'fixed', widthU } }, 'Largura fixa aplicada.');
  };
  const runColumnNumber = (field: 'fixed' | 'weight' | 'min' | 'max', raw: string) => {
    const normalized = raw.trim().replace(',', '.');
    if (field === 'max' && normalized === '') {
      runColumnProperties({ maxU: null }, 'Limite máximo removido.');
      return;
    }
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) {
      setStatusMessage('Informe um valor positivo.');
      return;
    }
    if (field === 'weight') {
      if (!Number.isSafeInteger(value)) { setStatusMessage('O peso flexível deve ser um inteiro positivo.'); return; }
      runColumnProperties({ width: { mode: 'flex', weight: value } }, 'Peso flexível atualizado.');
      return;
    }
    const valueU = mmToU(value);
    if (field === 'fixed') runColumnProperties({ width: { mode: 'fixed', widthU: valueU } }, 'Largura fixa atualizada.');
    if (field === 'min') runColumnProperties({ minU: valueU }, 'Largura mínima atualizada.');
    if (field === 'max') runColumnProperties({ maxU: valueU }, 'Largura máxima atualizada.');
  };
  const runEqualizeColumns = () => {
    const live = currentSelectedTableForStructure();
    const identity = dimensionIdentity();
    if (!live || !identity) return;
    try {
      const action = prepareEqualizeColumns(
        identity, live.object.table, frameToU(live.object.frame).widthU, live.object.frame.widthMm, live.selection
      );
      executeTableDimensionAction(action, 'Larguras das colunas igualadas.');
    } catch (error) {
      setStatusMessage(error instanceof TableDimensionAuthoringError ? error.message : 'Não foi possível igualar as colunas.');
    }
  };
  const runAxisReorder = (axis: 'row' | 'column', direction: -1 | 1) => {
    const live = currentSelectedTableForStructure();
    const identity = dimensionIdentity();
    if (!live || !identity) return;
    try {
      executeTableDimensionAction(
        prepareAxisReorder(identity, live.object.table, live.selection, axis, direction),
        axis === 'row' ? 'Linha movida.' : 'Coluna movida.'
      );
    } catch (error) {
      setStatusMessage(error instanceof TableDimensionAuthoringError ? error.message : 'Não foi possível reordenar o eixo.');
    }
  };
  const runColumnBoundaryDrag = (leftColumnIndex: number, deltaQ: number) => {
    const live = currentSelectedTableForStructure();
    const identity = dimensionIdentity();
    if (!live || !identity) return;
    try {
      executeTableDimensionAction(
        prepareColumnBoundaryDrag(
          identity, live.object.table, frameToU(live.object.frame).widthU, live.object.frame.widthMm,
          leftColumnIndex, qToU(deltaQ)
        ),
        'Larguras adjacentes atualizadas.'
      );
    } catch (error) {
      setStatusMessage(error instanceof TableDimensionAuthoringError ? error.message : 'Não foi possível ajustar o limite da coluna.');
    }
  };
  const runRowBoundaryDrag = (rowIndex: number, deltaQ: number) => {
    const live = currentSelectedTableForStructure();
    const identity = dimensionIdentity();
    if (!live || !identity) return;
    const row = live.object.table.rows[rowIndex];
    const resolvedHeightU = plans.get(live.object.table.id)?.heightsU?.[rowIndex];
    if (!row || !resolvedHeightU) {
      setStatusMessage('A altura medida da linha ainda não está disponível.');
      return;
    }
    try {
      executeTableDimensionAction(
        prepareRowBoundaryDrag(identity, live.object.table, row.id, resolvedHeightU, qToU(deltaQ)),
        'Altura exata da linha atualizada.'
      );
    } catch (error) {
      setStatusMessage(error instanceof TableDimensionAuthoringError ? error.message : 'Não foi possível ajustar a altura da linha.');
    }
  };
  const currentMergeEligibility = selectedTableObject && tableSelection
    ? mergeEligibility(selectedTableObject.table, tableSelection)
    : { enabled: false, reason: 'Selecione duas ou mais células adjacentes.' };
  const currentUnmergeEligibility = selectedTableObject && tableSelection
    ? unmergeEligibility(selectedTableObject.table, tableSelection)
    : { enabled: false, reason: 'Selecione uma célula mesclada.' };

  const runFitHeight = () => {
    if (!fitHeightPreparation) return;
    if (!fitHeightPreparation.ok) {
      setStatusMessage(fitHeightPreparation.message);
      return;
    }
    const prepared = fitHeightPreparation.prepared;
    const result = session.execute({
      type: 'table.fitHeight',
      pageId: prepared.pageId,
      objectId: prepared.objectId,
      tableId: prepared.tableId,
      expectedFrame: prepared.expectedFrame,
      expectedTable: prepared.expectedTable,
      expectedTypography: prepared.expectedTypography,
      measuredIntrinsicHeightQ: prepared.measuredIntrinsicHeightQ,
      preparedHeightU: prepared.preparedHeightU,
    });
    if (!result.ok) {
      setStatusMessage(result.error.code === 'TARGET_STALE'
        ? 'A tabela mudou depois da medição. Aguarde a nova medição e tente novamente.'
        : result.error.code === 'OBJECT_LOCKED'
          ? 'Tabela bloqueada não pode ter a altura ajustada.'
          : 'Não foi possível ajustar a altura da tabela com segurança.');
      return;
    }
    if (!result.metadata.changed) {
      setStatusMessage('A tabela já está ajustada à altura do conteúdo.');
      return;
    }
    setStatusMessage(prepared.tallerThanPage
      ? 'Altura ajustada. A tabela é mais alta que uma página A4 e ainda exige revisão da composição.'
      : prepared.wouldExceedPage
        ? 'Altura ajustada. Parte da tabela ficou fora da página; revise a composição.'
        : prepared.wouldViolateSafeArea
          ? 'Altura ajustada. A tabela cruza a área segura; revise a composição.'
          : 'Altura da tabela ajustada ao conteúdo.');
  };

  const locateLayoutDiagnostic = (entry: ProjectedLayoutDiagnostic) => {
    if (cellDraftRef.current) {
      setStatusMessage('Conclua ou cancele a edição da célula antes de navegar pelos diagnósticos.');
      return;
    }
    const page = document.pages.find((candidate) => candidate.id === entry.pageId);
    if (!page) return;
    activePageIdRef.current = page.id;

    if (entry.containerGroupId) {
      const group = page.objects.find((candidate) => candidate.id === entry.topLevelObjectId);
      if (!group || group.type !== 'group' || group.id !== entry.containerGroupId) return;
      tableSelectionRef.current = null;
      tableHistoryContextRef.current = null;
      setTableSelection(null);
      setEditorState({ activePageId: page.id, selectedObjectIds: [group.id], mode: 'select' });
      setStatusMessage(entry.guidance ?? 'Desagrupe para editar esta tabela.');
      queueMicrotask(() => globalThis.document.querySelector<HTMLElement>(
        `[data-editor-object-id="${CSS.escape(group.id)}"]`
      )?.focus());
      return;
    }

    const object = page.objects.find((candidate) => candidate.id === entry.objectId);
    if (!object) return;
    if (object.type === 'table' && (entry.cellId || entry.rowId)) {
      let targetCell = entry.cellId
        ? object.table.cells.find((cell) => cell.id === entry.cellId)
        : object.table.cells.find((cell) => cell.rowId === entry.rowId && !cell.coveredBy);
      if (targetCell?.coveredBy) {
        targetCell = object.table.cells.find((cell) => cell.id === targetCell?.coveredBy);
      }
      if (targetCell) {
        const identity = tableSelectionIdentity(page.id, object.id, object.table.id);
        const next = tableCellSelection(identity, {
          rowId: targetCell.rowId,
          columnId: targetCell.columnId,
        });
        tableSelectionRef.current = next;
        tableHistoryContextRef.current = { table: object.table, selection: next };
        setTableSelection(next);
        setEditorState({ activePageId: page.id, selectedObjectIds: [object.id], mode: 'table-grid' });
        queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());
        return;
      }
    }
    setEditorState({ activePageId: page.id, selectedObjectIds: [object.id], mode: 'select' });
    queueMicrotask(() => globalThis.document.querySelector<HTMLElement>(
      `[data-editor-object-id="${CSS.escape(object.id)}"]`
    )?.focus());
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
          {persistence && onRequestLibrary && (
            <button
              type="button"
              data-editor-action="library"
              data-text-edit-cancel-on-activate=""
              onClick={onRequestLibrary}
              aria-label="Voltar aos catálogos"
            >
              <FolderOpen size={17} aria-hidden="true" />
              <span>Catálogos</span>
            </button>
          )}
          {persistence && (
            <button
              type="button"
              data-editor-action="save"
              data-persistence-save-action=""
              onClick={() => { void persistence.runtime.manualSave(); }}
              disabled={!persistence.save.canSave || persistence.save.phase === 'saving'}
              aria-label={fatherSaveLabel(persistence.save.label)}
            >
              <SaveIcon size={17} aria-hidden="true" />
              <span>{fatherSaveLabel(persistence.save.label)}</span>
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
              <span className="vnext-memory-status" data-save-state="">{persistence ? fatherSaveLabel(persistence.save.label) : 'Rascunho nesta aba'}</span>
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
              <button type="button" data-editor-action="upload-image" disabled={selectedObject?.type !== 'image'} onClick={() => selectedObject && requestImageUpload({ type: 'replace', objectId: selectedObject.id })}>Upload imagem</button>
              <input
                type="file"
                ref={fileInputRef}
                data-editor-action="upload-image-input"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={handleImageFileChange}
                aria-hidden="true"
              />
              <button
                type="button"
                data-editor-action="edit-text"
                disabled={selectedObject?.type !== 'text' || selectedObject.locked || projectEditableRichText(selectedObject.text) === null}
                onClick={() => selectedObject && startTextEdit(selectedObject)}
              >
                Editar texto
              </button>
              <button
                type="button"
                data-editor-action="edit-table"
                disabled={selectedObject?.type !== 'table' || selectedObject.locked}
                onClick={() => selectedObject && startTableGrid(selectedObject)}
              >
                Editar tabela
              </button>
            </div>
          </div>

          {(editorState.mode === 'table-grid' || editorState.mode === 'cell-edit') && selectedTableObject && (
            <div className="vnext-table-axis-toolbar" data-table-axis-toolbar="" aria-label="Estrutura da tabela">
              <strong>Grade da tabela</strong>
              <div className="vnext-tool-group" aria-label="Ações de linha">
                <button type="button" data-editor-action="insert-row-before" disabled={editorState.mode !== 'table-grid' || Boolean(rowAxisReason)} title={editorState.mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : rowAxisReason} onClick={() => runTableAxisInsert('row', 'before')}>Linha antes</button>
                <button type="button" data-editor-action="insert-row-after" disabled={editorState.mode !== 'table-grid' || Boolean(rowAxisReason)} title={editorState.mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : rowAxisReason} onClick={() => runTableAxisInsert('row', 'after')}>Linha depois</button>
                <button type="button" data-editor-action="remove-row" disabled={editorState.mode !== 'table-grid' || Boolean(rowAxisReason)} title={editorState.mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : rowAxisReason} onClick={() => runTableAxisRemove('row')}>Remover linha</button>
              </div>
              <div className="vnext-tool-group" aria-label="Ações de coluna">
                <button type="button" data-editor-action="insert-column-before" disabled={editorState.mode !== 'table-grid' || Boolean(columnAxisReason)} title={editorState.mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : columnAxisReason} onClick={() => runTableAxisInsert('column', 'before')}>Coluna antes</button>
                <button type="button" data-editor-action="insert-column-after" disabled={editorState.mode !== 'table-grid' || Boolean(columnAxisReason)} title={editorState.mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : columnAxisReason} onClick={() => runTableAxisInsert('column', 'after')}>Coluna depois</button>
                <button type="button" data-editor-action="remove-column" disabled={editorState.mode !== 'table-grid' || Boolean(columnAxisReason)} title={editorState.mode === 'cell-edit' ? 'Conclua a edição da célula antes de alterar eixos.' : columnAxisReason} onClick={() => runTableAxisRemove('column')}>Remover coluna</button>
              </div>
              <div className="vnext-tool-group" aria-label="Mesclagem de células">
                <button
                  type="button"
                  data-editor-action="merge-cells"
                  disabled={!currentMergeEligibility.enabled}
                  title={currentMergeEligibility.reason}
                  onClick={runTableMerge}
                >Mesclar células</button>
                <button
                  type="button"
                  data-editor-action="unmerge-cell"
                  disabled={!currentUnmergeEligibility.enabled}
                  title={currentUnmergeEligibility.reason}
                  onClick={runTableUnmerge}
                >Desmesclar células</button>
              </div>
              <div className="vnext-tool-group" aria-label="Conteúdo em lote">
                <button
                  type="button"
                  data-editor-action="extend-table-selection"
                  aria-pressed={tableRangeExtensionArmed}
                  className={tableRangeExtensionArmed ? 'is-active' : undefined}
                  disabled={editorState.mode !== 'table-grid' || !tableSelection || tableSelection.kind === 'table'}
                  onClick={toggleTableRangeExtension}
                >Estender seleção</button>
                <button type="button" data-editor-action="copy-table-cells" disabled={editorState.mode !== 'table-grid'} onClick={() => { void runVisibleTableCopy(); }}>Copiar</button>
                <button type="button" data-editor-action="paste-table-cells" disabled={editorState.mode !== 'table-grid'} onClick={() => setTablePasteFallbackOpen((open) => !open)}>Colar</button>
                <button type="button" data-editor-action="clear-table-cells" disabled={editorState.mode !== 'table-grid'} onClick={runTableBulkClear}>Limpar conteúdo</button>
                <button type="button" data-editor-action="marker-panel" disabled={editorState.mode !== 'table-grid'} onClick={() => setMarkerPanelOpen(true)}>Marcador</button>
                <button type="button" data-editor-action="legend-panel" disabled={editorState.mode !== 'table-grid'} onClick={() => setMarkerPanelOpen(true)}>Legenda</button>
              </div>
              <button type="button" className="vnext-leave-table-grid" data-editor-action="leave-table-grid" onClick={() => leaveTableGrid()}>Voltar ao objeto</button>
            </div>
          )}

          {tablePasteFallbackOpen && editorState.mode === 'table-grid' && selectedTableObject && (
            <div className="vnext-table-paste-fallback" data-table-paste-fallback="" role="region" aria-label="Colar dados na tabela">
              <label>
                <span>Cole aqui dados do Excel, Google Sheets ou TSV</span>
                <textarea
                  data-table-paste-textarea=""
                  value={tablePasteFallbackText}
                  onChange={(event) => setTablePasteFallbackText(event.target.value)}
                  placeholder={'Ex.: Produto\\tFaixa\\nTA-25N\\t-25 °C a 140 °C'}
                />
              </label>
              <div className="vnext-cell-edit-actions">
                <button type="button" data-editor-action="apply-native-table-paste" onClick={applyNativePasteFallback}>Aplicar conteúdo colado</button>
                <button type="button" data-editor-action="cancel-native-table-paste" onClick={() => { setTablePasteFallbackOpen(false); setTablePasteFallbackText(''); }}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="vnext-document-preview" aria-label={'Editor da página ' + (selectedPageIndex + 1)}>
            <div className="vnext-page-stage" data-vnext-page-stage="" style={{ width: qCss(uToQ(pageWidthU)), height: qCss(uToQ(pageHeightU)) }}>
              <DocumentRenderer document={previewDocument} plans={plans} assetUrls={persistence?.assetUrls ?? W2C_DEMO_ASSET_URLS} />
              <div className="vnext-editor-overlay" data-editor-overlay="" aria-label="Camada de interação do editor" onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                  controller.cancel('superseded');
                  if (editorState.mode === 'table-grid') leaveTableGrid('');
                  setEditorState((current) => ({ ...current, selectedObjectIds: [], mode: 'select' }));
                }
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
                      className={'vnext-object-hit-target' + (selected ? ' is-selected' : '') + (preview?.objectId === object.id ? ' is-previewing' : '') + (selected && (editorState.mode === 'table-grid' || editorState.mode === 'cell-edit') && object.type === 'table' ? ' is-table-grid' : '')}
                      data-editor-object-id={object.id}
                      data-selected={selected ? 'true' : 'false'}
                      data-editor-preview={preview?.objectId === object.id ? 'true' : undefined}
                      style={{ ...frameStyle(displayedFrame), zIndex: selected ? Number.MAX_SAFE_INTEGER : object.zIndex }}
                      onPointerDown={(event) => beginGesture(event, object, { type: 'move' })}
                      onDoubleClick={() => {
                        if (object.type === 'text') startTextEdit(object);
                        if (object.type === 'table' && editorState.mode === 'select') startTableGrid(object);
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
                      {object.type === 'image' && (() => {
                        const assetState = persistence?.assetRuntimeStates?.get(object.assetId);
                        if (!assetState || assetState.status === 'resolved') return null;
                        const isIntegrity = assetState.status === 'integrity-failed';
                        return (
                          <div
                            className="vnext-image-repair-indicator"
                            data-editor-image-repair={object.id}
                            data-asset-status={assetState.status}
                          >
                            <span className="repair-icon">⚠️</span>
                            <span className="repair-title">
                              {isIntegrity ? 'Falha de integridade' : 'Imagem indisponível'}
                            </span>
                            <span className="repair-hint">
                              Substitua ou envie nova imagem
                            </span>
                          </div>
                        );
                      })()}
                      {selected && (
                        <>
                          <div className="vnext-selection-outline" aria-hidden="true" />
                          {preview?.objectId === object.id && <div className="vnext-preview-fill" aria-hidden="true" />}
                          {object.type === 'table'
                            && (editorState.mode === 'table-grid' || editorState.mode === 'cell-edit')
                            && tableSelection
                            && plans.get(object.table.id)?.rowQ
                            && plans.get(object.table.id)?.gridOffsetYQ !== undefined
                            && (
                              <TableGridOverlay
                                table={object.table}
                                plan={plans.get(object.table.id)!}
                                identity={tableSelection.identity}
                                selection={tableSelection}
                                localSequence={snapshot.localSequence}
                                onSelectionChange={(next) => {
                                  if (editorState.mode === 'cell-edit') return;
                                  if (session.getSnapshot().localSequence !== snapshot.localSequence) return;
                                  tableSelectionRef.current = next;
                                  tableHistoryContextRef.current = { table: object.table, selection: next };
                                  setTableSelection(next);
                                }}
                                onActivateCell={(point) => {
                                  if (editorState.mode === 'table-grid') startCellEdit(point);
                                }}
                                onCopyClipboard={handleTableCopyClipboard}
                                onPasteClipboard={handleTablePasteClipboard}
                                rangeExtensionArmed={tableRangeExtensionArmed}
                                onRangeExtensionComplete={() => {
                                  setTableRangeExtensionArmed(false);
                                  setStatusMessage('Seleção estendida.');
                                  queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());
                                }}
                                editingCellId={cellDraft?.identity.cellId}
                                dimensionEditingEnabled={editorState.mode === 'table-grid'}
                                onRowBoundaryCommit={runRowBoundaryDrag}
                                onColumnBoundaryCommit={runColumnBoundaryDrag}
                                onStaleGesture={() => {
                                  setTableRangeExtensionArmed(false);
                                  setStatusMessage('Gesto descartado porque o documento mudou.');
                                }}
                              />
                            )}
                          {object.type !== 'group' && editorState.mode === 'select' && editorState.selectedObjectIds.length === 1 && resizeHandles.map((handle) => (
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
                        onChange={(event) => updateInspectorDraft(field, event.target.value)}
                        onBlur={() => commitInspector(field)}
                        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                      />
                      <span>mm</span>
                    </div>
                  </label>
                ))}
              </div>
              {selectedObject.type === 'image' && <button type="button" className="vnext-inspector-action" onClick={replaceSelectedImage}>Substituir imagem</button>}
              {selectedObject.type === 'table' && (
                <>
                  <div className="vnext-divider" />
                  <section
                    className="vnext-fit-height-section"
                    data-table-fit-height=""
                    data-fit-height-measured-q={fitHeightPreparation?.ok ? fitHeightPreparation.prepared.measuredIntrinsicHeightQ : undefined}
                    data-fit-height-prepared-u={fitHeightPreparation?.ok ? fitHeightPreparation.prepared.preparedHeightU : undefined}
                  >
                    <h3>Altura da tabela</h3>
                    {fitHeightPreparation?.ok && (
                      <p data-fit-height-measurement="">
                        Altura necessária: {(fitHeightPreparation.prepared.preparedHeightU / 10_000).toFixed(2)} mm
                      </p>
                    )}
                    <button
                      type="button"
                      className="vnext-inspector-action"
                      data-editor-action="fit-table-height"
                      disabled={!fitHeightPreparation?.ok}
                      aria-describedby={!fitHeightPreparation?.ok ? `fit-height-reason-${selectedObject.id}` : undefined}
                      onClick={runFitHeight}
                    >
                      Ajustar altura
                    </button>
                    {!fitHeightPreparation?.ok && (
                      <p id={`fit-height-reason-${selectedObject.id}`} data-fit-height-disabled-reason="">
                        {fitHeightPreparation?.message ?? 'Medindo tabela…'}
                      </p>
                    )}
                    {fitHeightPreparation?.ok && fitHeightPreparation.prepared.tallerThanPage && (
                      <p className="vnext-fit-height-advisory" data-fit-height-page-advisory="">
                        A tabela é mais alta que uma página A4. Ajustar altura iguala o quadro ao conteúdo, mas não resolve a publicação em uma única página.
                      </p>
                    )}
                  </section>
                </>
              )}
              {selectedObject.type === 'table' && tableSelection && rowDimensionProjection && (
                <>
                  <div className="vnext-divider" />
                  <section className="vnext-table-dimension-inspector" data-table-row-dimensions="">
                    <h3>{rowDimensionProjection.rowIds.length === 1 ? 'Linha' : `${rowDimensionProjection.rowIds.length} linhas`}</h3>
                    {editorState.mode === 'cell-edit' && (
                      <p id={`table-row-dimension-disabled-${selectedObject.id}`}>
                        Conclua ou cancele a edição da célula para alterar a estrutura da tabela.
                      </p>
                    )}
                    <label>
                      <span>Tipo da linha</span>
                      <select
                        data-row-property="role"
                        value={rowDimensionProjection.role}
                        disabled={editorState.mode !== 'table-grid'}
                        aria-describedby={editorState.mode !== 'table-grid' ? `table-row-dimension-disabled-${selectedObject.id}` : undefined}
                        onChange={(event) => runRowProperties(
                          { role: event.target.value as 'header' | 'body' | 'section' },
                          'Tipo da linha atualizado.'
                        )}
                      >
                        {rowDimensionProjection.role === 'mixed' && <option value="mixed" disabled>Misto</option>}
                        <option value="header">Cabeçalho</option>
                        <option value="body">Corpo</option>
                        <option value="section">Seção</option>
                      </select>
                    </label>
                    <label>
                      <span>Altura</span>
                      <select
                        data-row-property="height-mode"
                        value={effectiveRowHeightMode ?? rowDimensionProjection.heightMode}
                        disabled={editorState.mode !== 'table-grid'}
                        onChange={(event) => runRowHeightMode(event.target.value as 'AUTO' | 'MIN_MM' | 'FIXED_MM')}
                      >
                        {rowDimensionProjection.heightMode === 'mixed' && <option value="mixed" disabled>Misto</option>}
                        <option value="AUTO">Automática</option>
                        <option value="MIN_MM">Mínima</option>
                        <option value="FIXED_MM">Exata</option>
                      </select>
                    </label>
                    {(effectiveRowHeightMode === 'MIN_MM' || effectiveRowHeightMode === 'FIXED_MM') && (
                      <label>
                        <span>Valor</span>
                        <div className="vnext-dimension-value">
                          <input
                            key={rowDimensionProjection.rowIds.join(':') + ':' + String(rowDimensionProjection.valueU)}
                            data-row-property="height-mm"
                            type="text"
                            inputMode="decimal"
                            defaultValue={typeof rowDimensionProjection.valueU === 'number' ? String(rowDimensionProjection.valueU / 10_000) : ''}
                            placeholder={rowDimensionProjection.valueU === 'mixed' ? 'Misto' : undefined}
                            disabled={editorState.mode !== 'table-grid'}
                            onBlur={(event) => runRowHeightValue(event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                          />
                          <span>mm</span>
                        </div>
                      </label>
                    )}
                    <div className="vnext-dimension-actions">
                      <button type="button" data-editor-action="row-height-auto"
                        disabled={editorState.mode !== 'table-grid'} onClick={() => runRowHeightMode('AUTO')}>
                        Voltar para automática
                      </button>
                      <button type="button" data-editor-action="move-row-up"
                        disabled={editorState.mode !== 'table-grid' || selectedRowAxisIds.length !== 1 || selectedTableObject?.table.rows[0]?.id === selectedRowAxisIds[0]}
                        onClick={() => runAxisReorder('row', -1)}>Mover para cima</button>
                      <button type="button" data-editor-action="move-row-down"
                        disabled={editorState.mode !== 'table-grid' || selectedRowAxisIds.length !== 1 || selectedTableObject?.table.rows.at(-1)?.id === selectedRowAxisIds[0]}
                        onClick={() => runAxisReorder('row', 1)}>Mover para baixo</button>
                    </div>
                  </section>
                </>
              )}
              {selectedObject.type === 'table' && tableSelection && columnDimensionProjection && (
                <>
                  <div className="vnext-divider" />
                  <section className="vnext-table-dimension-inspector" data-table-column-dimensions="">
                    <h3>{columnDimensionProjection.columnIds.length === 1 ? 'Coluna' : `${columnDimensionProjection.columnIds.length} colunas`}</h3>
                    {editorState.mode === 'cell-edit' && (
                      <p id={`table-column-dimension-disabled-${selectedObject.id}`}>
                        Conclua ou cancele a edição da célula para alterar a estrutura da tabela.
                      </p>
                    )}
                    <label>
                      <span>Largura</span>
                      <select
                        data-column-property="width-mode"
                        value={columnDimensionProjection.widthMode}
                        disabled={editorState.mode !== 'table-grid'}
                        onChange={(event) => runColumnMode(event.target.value as 'fixed' | 'flex')}
                      >
                        {columnDimensionProjection.widthMode === 'mixed' && <option value="mixed" disabled>Misto</option>}
                        <option value="flex">Flexível</option>
                        <option value="fixed">Fixa</option>
                      </select>
                    </label>
                    {columnDimensionProjection.widthMode === 'fixed' && (
                      <label>
                        <span>Largura fixa</span>
                        <div className="vnext-dimension-value">
                          <input
                            key={columnDimensionProjection.columnIds.join(':') + ':' + String(columnDimensionProjection.fixedWidthU)}
                            data-column-property="fixed-mm"
                            type="text"
                            inputMode="decimal"
                            defaultValue={typeof columnDimensionProjection.fixedWidthU === 'number' ? String(columnDimensionProjection.fixedWidthU / 10_000) : ''}
                            placeholder={columnDimensionProjection.fixedWidthU === 'mixed' ? 'Misto' : undefined}
                            disabled={editorState.mode !== 'table-grid'}
                            onBlur={(event) => runColumnNumber('fixed', event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                          />
                          <span>mm</span>
                        </div>
                      </label>
                    )}
                    <button
                      type="button"
                      className="vnext-inspector-action"
                      data-editor-action="toggle-column-dimension-advanced"
                      aria-expanded={columnDimensionsAdvancedOpen}
                      onClick={() => setColumnDimensionsAdvancedOpen((open) => !open)}
                    >
                      {columnDimensionsAdvancedOpen ? 'Ocultar avançado' : 'Avançado'}
                    </button>
                    {columnDimensionsAdvancedOpen && (
                      <div className="vnext-dimension-advanced" data-column-dimension-advanced="">
                        {columnDimensionProjection.widthMode === 'flex' && (
                          <label>
                            <span>Peso flexível</span>
                            <input
                              key={columnDimensionProjection.columnIds.join(':') + ':weight:' + String(columnDimensionProjection.flexWeight)}
                              data-column-property="weight"
                              type="number"
                              min="1"
                              step="1"
                              defaultValue={typeof columnDimensionProjection.flexWeight === 'number' ? columnDimensionProjection.flexWeight : ''}
                              placeholder={columnDimensionProjection.flexWeight === 'mixed' ? 'Misto' : undefined}
                              disabled={editorState.mode !== 'table-grid'}
                              onBlur={(event) => runColumnNumber('weight', event.target.value)}
                            />
                          </label>
                        )}
                        <label>
                          <span>Mínimo (mm)</span>
                          <input
                            key={columnDimensionProjection.columnIds.join(':') + ':min:' + String(columnDimensionProjection.minU)}
                            data-column-property="min-mm"
                            type="text"
                            inputMode="decimal"
                            defaultValue={typeof columnDimensionProjection.minU === 'number' ? String(columnDimensionProjection.minU / 10_000) : ''}
                            placeholder={columnDimensionProjection.minU === 'mixed' ? 'Misto' : undefined}
                            disabled={editorState.mode !== 'table-grid'}
                            onBlur={(event) => runColumnNumber('min', event.target.value)}
                          />
                        </label>
                        <label>
                          <span>Máximo (mm)</span>
                          <input
                            key={columnDimensionProjection.columnIds.join(':') + ':max:' + String(columnDimensionProjection.maxU)}
                            data-column-property="max-mm"
                            type="text"
                            inputMode="decimal"
                            defaultValue={typeof columnDimensionProjection.maxU === 'number' ? String(columnDimensionProjection.maxU / 10_000) : ''}
                            placeholder={columnDimensionProjection.maxU === 'mixed' ? 'Misto' : 'Sem limite'}
                            disabled={editorState.mode !== 'table-grid'}
                            onBlur={(event) => runColumnNumber('max', event.target.value)}
                          />
                        </label>
                      </div>
                    )}
                    <div className="vnext-dimension-actions">
                      <button type="button" data-editor-action="equalize-columns"
                        disabled={editorState.mode !== 'table-grid' || selectedColumnAxisIds.length < 2}
                        onClick={runEqualizeColumns}>Igualar larguras</button>
                      <button type="button" data-editor-action="move-column-left"
                        disabled={editorState.mode !== 'table-grid' || selectedColumnAxisIds.length !== 1 || selectedTableObject?.table.columns[0]?.id === selectedColumnAxisIds[0]}
                        onClick={() => runAxisReorder('column', -1)}>Mover para esquerda</button>
                      <button type="button" data-editor-action="move-column-right"
                        disabled={editorState.mode !== 'table-grid' || selectedColumnAxisIds.length !== 1 || selectedTableObject?.table.columns.at(-1)?.id === selectedColumnAxisIds[0]}
                        onClick={() => runAxisReorder('column', 1)}>Mover para direita</button>
                    </div>
                  </section>
                </>
              )}
              {selectedObject.type === 'table' && tableSelection && (
                <>
                  <div className="vnext-divider" />
                  <section className="vnext-cell-inspector" data-table-cell-inspector="">
                    <h3>Células da tabela</h3>
                    <p>{selectedAnchorCells.length} célula(s) selecionada(s).</p>
                    {!cellDraft && (
                      <button type="button" className="vnext-inspector-action" data-editor-action="edit-cell-content"
                        disabled={selectedAnchorCells.length !== 1} onClick={() => startCellEdit()}>
                        Editar conteúdo
                      </button>
                    )}
                    {cellDraft && (
                      <div data-cell-edit-session="">
                        <label>
                          <span>Tipo de conteúdo</span>
                          <select
                            data-cell-content-type=""
                            value={cellDraft.activeType}
                            disabled={cellDraft.originalContent.type === 'marker' || cellDraft.originalContent.type === 'image'}
                            onChange={(event) => {
                              const next = changeTableCellDraftType(cellDraft, event.target.value as EditableCellType);
                              notifyCellDraftChanged(next);
                            }}
                          >
                            <option value="empty">Vazio</option>
                            <option value="richText">Texto</option>
                            <option value="technicalCode">Código técnico</option>
                            <option value="measurement">Medição</option>
                            {cellDraft.originalContent.type === 'marker' && <option value="marker">Marcador</option>}
                            {cellDraft.originalContent.type === 'image' && <option value="image">Imagem</option>}
                          </select>
                        </label>
                        {cellDraft.requiresTypeChangeConfirmation && (
                          <div role="alert" data-cell-type-confirmation="">
                            <p>Trocar o tipo substituirá o conteúdo atual desta célula.</p>
                            <button type="button" onClick={() => notifyCellDraftChanged(confirmTableCellDraftTypeChange(cellDraft))}>
                              Confirmar substituição
                            </button>
                            <button type="button" onClick={() => notifyCellDraftChanged(createTableCellDraft(cellDraft.identity, cellDraft.originalContent))}>
                              Manter conteúdo atual
                            </button>
                          </div>
                        )}
                        {cellDraft.activeType === 'richText' && (
                          <label>
                            <span>Texto</span>
                            <textarea
                              ref={(node) => { cellEditorFieldRef.current = node; }}
                              data-cell-rich-text=""
                              value={cellDraft.richText}
                              disabled={projectEditableRichText(cellDraft.originalContent.type === 'richText'
                                ? cellDraft.originalContent.value
                                : { paragraphs: [] }) === null}
                              onChange={(event) => notifyCellDraftChanged(updateTableCellDraft(cellDraft, {
                                richText: event.target.value.replace(/\r\n?/g, '\n'),
                              }))}
                              onCompositionStart={() => notifyCellDraftChanged(setTableCellDraftComposition(cellDraft, true))}
                              onCompositionEnd={() => notifyCellDraftChanged(setTableCellDraftComposition(cellDraftRef.current ?? cellDraft, false))}
                            />
                          </label>
                        )}
                        {cellDraft.activeType === 'technicalCode' && (
                          <label>
                            <span>Código</span>
                            <input
                              ref={(node) => { cellEditorFieldRef.current = node; }}
                              data-cell-technical-code=""
                              type="text"
                              value={cellDraft.technicalCode}
                              style={{ fontFamily: 'monospace' }}
                              onChange={(event) => notifyCellDraftChanged(updateTableCellDraft(cellDraft, { technicalCode: event.target.value }))}
                              onCompositionStart={() => notifyCellDraftChanged(setTableCellDraftComposition(cellDraft, true))}
                              onCompositionEnd={() => notifyCellDraftChanged(setTableCellDraftComposition(cellDraftRef.current ?? cellDraft, false))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && !cellDraftRef.current?.composing) {
                                  event.preventDefault();
                                  commitCellEdit();
                                }
                              }}
                            />
                          </label>
                        )}
                        {cellDraft.activeType === 'measurement' && (
                          <div className="vnext-cell-measurement" data-cell-measurement="">
                            <label>
                              <span>Valor</span>
                              <input
                                ref={(node) => { cellEditorFieldRef.current = node; }}
                                data-cell-measurement-value=""
                                type="text"
                                value={cellDraft.measurement.valueText}
                                onChange={(event) => notifyCellDraftChanged(updateTableCellDraft(cellDraft, {
                                  measurement: { valueText: event.target.value },
                                }))}
                                onCompositionStart={() => notifyCellDraftChanged(setTableCellDraftComposition(cellDraft, true))}
                                onCompositionEnd={() => notifyCellDraftChanged(setTableCellDraftComposition(cellDraftRef.current ?? cellDraft, false))}
                              />
                            </label>
                            <label>
                              <span>Unidade</span>
                              <input
                                data-cell-measurement-unit=""
                                type="text"
                                value={cellDraft.measurement.unit}
                                onChange={(event) => notifyCellDraftChanged(updateTableCellDraft(cellDraft, {
                                  measurement: { unit: event.target.value },
                                }))}
                              />
                            </label>
                            <label>
                              <span>Qualificador</span>
                              <select
                                data-cell-measurement-qualifier=""
                                value={cellDraft.measurement.qualifier}
                                onChange={(event) => notifyCellDraftChanged(updateTableCellDraft(cellDraft, {
                                  measurement: { qualifier: event.target.value as TableCellDraft['measurement']['qualifier'] },
                                }))}
                              >
                                <option value="">Nenhum</option>
                                <option value="approx">Aproximadamente</option>
                                <option value="min">Mínimo</option>
                                <option value="max">Máximo</option>
                              </select>
                            </label>
                          </div>
                        )}
                        {cellDraft.activeType === 'empty' && <p data-cell-empty-content="">A célula ficará vazia.</p>}
                        {cellDraft.activeType === 'marker' && <p data-cell-readonly-content="">Marcador existente. A edição de marcadores será disponibilizada em uma etapa posterior.</p>}
                        {cellDraft.activeType === 'image' && <p data-cell-readonly-content="">Imagem existente. A edição de imagem da célula não faz parte desta etapa.</p>}
                        {cellDraft.originalContent.type !== 'marker' && cellDraft.originalContent.type !== 'image' && (
                          <button type="button" data-editor-action="clear-cell-content"
                            onClick={() => notifyCellDraftChanged(clearTableCellDraft(cellDraft))}>
                            Limpar conteúdo
                          </button>
                        )}
                        <div className="vnext-cell-edit-actions">
                          <button type="button" data-editor-action="cancel-cell-content" onClick={() => cancelCellEdit()}>Cancelar</button>
                          <button type="button" data-editor-action="commit-cell-content"
                            disabled={cellDraft.originalContent.type === 'marker' || cellDraft.originalContent.type === 'image'}
                            onClick={() => commitCellEdit()}>
                            Concluir
                          </button>
                        </div>
                      </div>
                    )}

                    {markerPanelOpen && selectedTableObject && (
                      <>
                        <div className="vnext-divider" />
                        <section className="vnext-marker-legend-panel" data-marker-legend-panel="">
                          <div className="vnext-legend-entry-heading">
                            <h3>Marcadores e legenda</h3>
                            <button type="button" data-editor-action="close-marker-panel" onClick={() => setMarkerPanelOpen(false)}>Fechar</button>
                          </div>
                          <p>O marcador referencia uma entrada da legenda desta tabela.</p>
                          <label>
                            <span>Marcador existente</span>
                            <select data-marker-picker="" value={markerLegendChoice} onChange={(event) => setMarkerLegendChoice(event.target.value)}>
                              <option value="">Selecione um marcador</option>
                              {selectedTableObject.table.legend.map((entry) => {
                                const text = projectEditableRichText(entry.text) ?? 'Descrição avançada';
                                const usage = legendUsageCount(selectedTableObject.table, entry.id);
                                return <option key={entry.id} value={entry.id}>{entry.markerCode} — {text} ({usage} uso(s))</option>;
                              })}
                            </select>
                          </label>
                          <div className="vnext-cell-edit-actions">
                            <button type="button" data-editor-action="apply-existing-marker" disabled={!markerLegendChoice || editorState.mode !== 'table-grid'} onClick={runExistingMarkerAssignment}>Aplicar marcador</button>
                            <button type="button" data-editor-action="detach-marker" disabled={editorState.mode !== 'table-grid' || selectedAnchorCells.length === 0 || selectedAnchorCells.some((cell) => cell.content.type !== 'marker')} onClick={runMarkerDetach}>Remover marcador da célula</button>
                          </div>
                          <fieldset className="vnext-marker-create">
                            <legend>Novo marcador</legend>
                            <label>
                              <span>Código</span>
                              <input data-new-marker-code="" value={newMarkerCode} onChange={(event) => setNewMarkerCode(event.target.value)} placeholder="Ex.: *, †, A, 1" />
                            </label>
                            <label>
                              <span>Descrição</span>
                              <textarea data-new-marker-text="" value={newMarkerText} onChange={(event) => setNewMarkerText(event.target.value.replace(/\r\n?/g, '\n'))} placeholder="Descrição técnica da legenda" />
                            </label>
                            <div className="vnext-cell-edit-actions">
                              <button type="button" data-editor-action="create-and-assign-marker" disabled={editorState.mode !== 'table-grid'} onClick={runNewMarkerAssignment}>Criar e aplicar</button>
                              <button type="button" data-editor-action="create-legend" disabled={editorState.mode !== 'table-grid'} onClick={runLegendCreateOnly}>Criar legenda</button>
                            </div>
                          </fieldset>
                          <div className="vnext-legend-list" data-legend-list="">
                            {selectedTableObject.table.legend.length === 0 ? (
                              <p>Nenhuma legenda criada.</p>
                            ) : selectedTableObject.table.legend.map((entry) => (
                              <LegendEditorRow
                                key={entry.id}
                                entry={entry}
                                usageCount={legendUsageCount(selectedTableObject.table, entry.id)}
                                onUpdate={(markerCode, plainText) => runLegendUpdate(entry, markerCode, plainText)}
                                onRemove={() => runLegendRemove(entry)}
                              />
                            ))}
                          </div>
                        </section>
                      </>
                    )}

                    <div className="vnext-divider" />
                    <h3>Propriedades da seleção</h3>
                    <label>
                      <span>Alinhamento</span>
                      <select data-cell-property="textAlign" value={String(commonCellStyleValue('textAlign') ?? '')}
                        onChange={(event) => runCellPropertyPatch({
                          textAlign: event.target.value === '' ? null : event.target.value as 'left' | 'center' | 'right',
                        })}>
                        <option value="">Herdado</option><option value="left">Esquerda</option>
                        <option value="center">Centro</option><option value="right">Direita</option>
                      </select>
                    </label>
                    <label>
                      <span>Peso</span>
                      <select data-cell-property="fontWeight" value={String(commonCellStyleValue('fontWeight') ?? '')}
                        onChange={(event) => runCellPropertyPatch({
                          fontWeight: event.target.value === '' ? null : Number(event.target.value) as 400 | 700,
                        })}>
                        <option value="">Herdado</option><option value="400">Normal</option><option value="700">Negrito</option>
                      </select>
                    </label>
                    <label>
                      <span>Quebra</span>
                      <select data-cell-property="wrapPolicy" value={commonWrapPolicy ?? ''}
                        onChange={(event) => runCellPropertyPatch({
                          wrapPolicy: event.target.value === '' ? null : event.target.value as 'wrap' | 'nowrap',
                        })}>
                        <option value="">Automático · Herdado</option><option value="wrap">Quebrar</option>
                        <option value="nowrap">Não quebrar</option>
                      </select>
                    </label>
                    <label>
                      <span>Cor do texto</span>
                      <input key={propertySelectionKey + ':color'} data-cell-property="color" type="text"
                        defaultValue={String(commonCellStyleValue('color') ?? '')} placeholder="Herdado"
                        onBlur={(event) => commitCellColor('color', event.target.value)} />
                    </label>
                    <label>
                      <span>Fundo</span>
                      <input key={propertySelectionKey + ':background'} data-cell-property="background" type="text"
                        defaultValue={String(commonCellStyleValue('background') ?? '')} placeholder="Herdado"
                        onBlur={(event) => commitCellColor('background', event.target.value)} />
                    </label>
                    <fieldset>
                      <legend>Padding (mm)</legend>
                      {(['top', 'right', 'bottom', 'left'] as const).map((edge) => (
                        <label key={edge}>
                          <span>{{ top: 'Superior', right: 'Direita', bottom: 'Inferior', left: 'Esquerda' }[edge]}</span>
                          <input
                            key={propertySelectionKey + ':padding:' + edge}
                            data-cell-padding={edge}
                            type="text"
                            inputMode="decimal"
                            defaultValue={String(commonCellStyleValue('paddingMm')?.[edge] ?? '')}
                            placeholder="Herdado"
                            onBlur={(event) => commitCellPadding(edge, event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                          />
                        </label>
                      ))}
                      <button type="button" data-editor-action="reset-cell-padding"
                        onClick={() => runCellPropertyPatch({ paddingMm: null })}>
                        Redefinir todo padding
                      </button>
                    </fieldset>
                  </section>
                </>
              )}
              <div className="vnext-divider" />
              <div className="vnext-diagnostics-section" data-editor-diagnostics="">
                <div className="vnext-diagnostics-heading">
                  <h3>{selectedObject.type === 'table' ? 'Problemas da tabela' : 'Diagnósticos'}</h3>
                  <button
                    type="button"
                    data-editor-action="toggle-diagnostics"
                    aria-expanded={diagnosticsOpen}
                    onClick={() => setDiagnosticsOpen((open) => !open)}
                  >
                    {diagnosticsOpen ? 'Fechar' : 'Mostrar'}
                  </button>
                </div>
                {diagnosticsOpen && (projectedSelectedDiagnostics.length === 0 ? (
                  <p>Nenhum aviso ou erro para este objeto.</p>
                ) : (
                  <ul>
                    {projectedSelectedDiagnostics.map((diagnostic) => (
                      <li
                        key={diagnostic.key}
                        className={'is-' + diagnostic.severity.toLowerCase()}
                        data-diagnostic-code={diagnostic.sourceCodes[0]}
                        data-diagnostic-codes={diagnostic.sourceCodes.join(',')}
                        data-diagnostic-severity={diagnostic.severity}
                        data-diagnostic-object-id={diagnostic.objectId}
                        data-diagnostic-table-id={diagnostic.tableId}
                        data-diagnostic-row-id={diagnostic.rowId}
                        data-diagnostic-cell-id={diagnostic.cellId}
                        data-diagnostic-annotation-id={diagnostic.annotationId}
                        data-diagnostic-parent-group-id={diagnostic.containerGroupId}
                        data-diagnostic-top-level-object-id={diagnostic.topLevelObjectId}
                        data-diagnostic-grouped-child={diagnostic.groupedChild ? 'true' : undefined}
                      >
                        <div>
                          <strong>{diagnostic.severity === 'ERROR' ? 'Erro' : 'Aviso'}</strong>
                          <span>{diagnostic.publicationBlocked ? 'Bloqueia publicação' : 'Revisão recomendada'}</span>
                        </div>
                        <p>{diagnostic.message}</p>
                        {diagnostic.guidance && (
                          <p className="vnext-diagnostic-guidance" data-diagnostic-guidance="">
                            {diagnostic.guidance}
                          </p>
                        )}
                        {(diagnostic.rowId || diagnostic.cellId) && (
                          <small>
                            {diagnostic.rowId ? `Linha ${diagnostic.rowId}` : ''}
                            {diagnostic.rowId && diagnostic.cellId ? ' · ' : ''}
                            {diagnostic.cellId ? `Célula ${diagnostic.cellId}` : ''}
                          </small>
                        )}
                        <div className="vnext-diagnostic-actions">
                          {diagnostic.action === 'FIT_HEIGHT' && fitHeightPreparation?.ok && (
                            <button type="button" data-diagnostic-action="fit-height" onClick={runFitHeight}>
                              Ajustar altura
                            </button>
                          )}
                          {diagnostic.action === 'LOCATE' && (
                            <button type="button" data-diagnostic-action="locate" onClick={() => locateLayoutDiagnostic(diagnostic)}>
                              Localizar
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            </>
          ) : <p>Clique em um objeto da página para mover, redimensionar ou ajustar sua geometria.</p>}
          <div className="vnext-divider" />
          <h3>Salvamento</h3>
          <p>
            {persistence
              ? persistence.save.message ?? fatherSaveLabel(persistence.save.label)
              : 'Este documento continua somente em memória nesta aba.'}
          </p>
          {persistence?.save.phase === 'conflict' && (
            <div data-persistence-conflict-actions="">
              <p>Este catálogo mudou em outro lugar. Seu trabalho continua preservado nesta sessão.</p>
              <button
                type="button"
                className="vnext-inspector-action"
                disabled={conflictResolutionBusy}
                onClick={() => {
                  void persistence.runtime.conflictResolutionCoordinator.openLatest().then((result) => {
                    if (!result.ok) {
                      setStatusMessage(result.error.message ?? 'Não foi possível abrir a versão mais recente.');
                    }
                  });
                }}
              >
                {conflictResolutionState === 'resolving-open-latest'
                  ? 'Abrindo versão mais recente…'
                  : 'Abrir versão mais recente'}
              </button>
              <button
                type="button"
                className="vnext-inspector-action"
                disabled={conflictResolutionBusy}
                onClick={() => {
                  void persistence.runtime.conflictResolutionCoordinator.saveAsCopy().then((result) => {
                    if (!result.ok) {
                      setStatusMessage(result.error.message ?? 'Não foi possível salvar seu trabalho como cópia.');
                    }
                  });
                }}
              >
                {conflictResolutionState === 'resolving-save-as-copy'
                  ? 'Salvando cópia…'
                  : 'Salvar meu trabalho como cópia'}
              </button>
            </div>
          )}
          {persistence?.localProtection === 'unavailable' && (
            <p className="vnext-live-status" role="alert">
              {persistence.localProtectionMessage ?? 'Proteção local indisponível.'}
            </p>
          )}
          {statusMessage && <p className="vnext-live-status" role="status">{statusMessage}</p>}
        </aside>
      </div>
      <EditorDiagnosticsProbe
        document={document}
        assetUrls={persistence?.assetUrls ?? W2C_DEMO_ASSET_URLS}
        onDiagnostics={receiveMeasuredDiagnostics}
        onMeasuredLayout={receiveMeasuredLayout}
      />
    </div>
  );
}
