import React from 'react';
import { CatalogNativeComposer } from '../ai-catalog/CatalogNativeComposer';
import { assistantRequested, forgetAssistantRequest } from '../ai-catalog/intake/assistant-link';
import { CatalogTitleButton } from './editor/CatalogTitleButton';
import { LibraryNavigationNotice } from './editor/LibraryNavigationNotice';
import type { NativeComposeFunctionsClient } from '../ai-catalog/native-compose-client';
import type { SpecTableGateway } from '../ai-catalog/spec-table/spec-table-gateway';
import { FolderOpen, Layers, Plus, Redo2, Save as SaveIcon, Undo2 } from 'lucide-react';
import { projectEditableRichText, projectImageExpectedState, type ApplicationAction, type CellPropertyPatch, type CellStylePatch, type DocumentSession, type FrameU, type ImageExpectedState } from '../application';
import {
  mmToU,
  qCss,
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
  selectionAfterAxisRemove,
  selectionAfterTableAxisInsert,
  selectionAfterTableAxisRemove,
  tableCellSelection,
  tableSelectionAxisIds,
  tableSelectionFocusPoint,
  tableSelectionIdentity,
  type TableSelection,
} from '../editor/table-selection';
import { insertedRowRole, planTableAxisRemoval, tableAxisRefusalMessage, tableStructureAvailability } from '../editor/table-axis-authoring';
import { projectTableLook, tableLookSteps, type TableLookRequest } from '../editor/table-look-authoring';
import { quickNoteCreateStep, quickNoteRemoveSteps } from '../editor/table-quick-notes';
import { cellCountText, describeTableLocation } from '../editor/table-location';
import { completeNewTableLook, insertTableAxes, removeTableAxes, runTableSteps } from './editor/table-structure-actions';
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
  TablePasteGeometryError,
  type PreparedTableBulkMutation,
} from '../editor/table-bulk-authoring';
import {
  parseTypedTableClipboard,
  prepareTableClipboard,
  TABLE_CLIPBOARD_MIME,
  TableClipboardError,
} from '../editor/table-clipboard';
import {
  annotationTargetForCell,
  annotationTargetForTable,
  DEFAULT_IMAGE_CELL_HEIGHT_U,
  DEFAULT_IMAGE_CELL_WIDTH_U,
  moveId,
  nextLegendUsageCellId,
} from '../editor/table-semantic-authoring';
import { prepareTableFitHeight } from '../editor/table-fit-height-authoring';
import { INSPECTOR_FRAME_FIELDS, INSPECTOR_INVALID_NUMBER_MESSAGE, inspectorDraftFromFrame, inspectorDiscardedNotice, inspectorDraftIsDirty, inspectorErrorStatus, inspectorFieldLabel, planInspectorDraft, sameInspectorFrame, type InspectorFieldError, type InspectorFrameField } from '../editor/inspector-frame-draft';
import { isCanvasKeyboardTarget, planKeyboardDelete, planKeyboardNudge, resolveEditorShortcut, type CellEditorMove, type EditorShortcut } from '../editor/editor-keyboard';
import { InspectorNumberField } from './editor/InspectorNumberField';
import { PagePanel } from './editor/PagePanel';
import { PageTemplateGallery } from './editor/PageTemplateGallery';
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
  defaultStyleScopeFromSelection,
  prepareAnnotationGapAction,
  prepareCellBorderPresetAction,
  prepareStyleAction,
  simpleBorderQuickPatch,
  type BorderQuickPreset,
  type TableStyleScope,
} from '../editor/table-style-authoring';
import {
  createTableCellDraft,
  startTableCellDraftByTyping,
  tableCellDraftRecoveryFields,
  validateTableCellDraft,
  type EditableCellType,
  type TableCellDraft,
} from '../editor/table-cell-draft';
import type { TableAnnotation, TableLegendEntry } from '../domain/editorial-model';
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
import { alternateDemoAssetId, createInsertSpec, DEFAULT_NEW_TABLE_SIZE, isValidNewTableSize, MAX_NEW_TABLE_COLUMNS, MAX_NEW_TABLE_ROWS, NEW_TABLE_PRESET_ID, W2C_DEMO_ASSET_URLS, type InsertTool } from './editor-defaults';
import { PasteGrowOffer, PasteTableArea } from './editor/PasteTableArea';
import { createTableFromPastedText, decidePendingTableFit, describeRowsByColumns, growTableAndPaste, isPageLevelPasteTarget, newTableTransactionId, tablePasteGrowthOffer, type PendingTableFit, type TablePasteGrowthOffer, type TablePasteSource } from './editor/table-paste-actions';
import { isTabularClipboardText } from '../editor/table-paste-import';
import { successNotice, type EditorNoticeInput } from '../editor/editor-notices';
import { EditorInteractionController, frameToU, type FinishGestureResult, type GestureKind, type GesturePreview } from './editor-interaction';
import { LayersPanel, type LayerSelectMode } from './editor/LayersPanel';
import { SelectionLayer, type SelectionBox } from './editor/SelectionLayer';
import { alphaMaskFor, preloadAlphaMask } from './editor/image-alpha-masks';
import {
  coveringObjectsAbove, groupRefusal, imageTransparentAt, layerName, layerPosition, nextObjectBelow, normalizeRect,
  objectsAtPoint, objectsInsideRect, resolvePlainClickTarget, sendToBackTarget, type PointU, type RectU, type TransparencyProbe,
} from '../editor/object-layers';
import { W2E_PAGE_TEMPLATE_ID } from './page-template-fixtures';
import { hasPresysPageReuse, insertPresysPage } from '../library/starter-dependencies';
import { isPresysTa25nPageTemplate } from '../library/presys-ta25n-starter';
import { PRESYS_DEFAULT_PAGE_MODEL_ID } from '../library/presys-page-models';
import { fatherSaveExplanation, fatherSaveLabel } from './save-presentation';
import { projectLayoutDiagnostics, type ProjectedLayoutDiagnostic } from './layout-diagnostics-projection';
import { TableGridOverlay } from './table-grid-overlay';
import { EditorNotices } from './editor/EditorNotices';
import { SaveSummary } from './editor/SaveSummary';
import { PhotoLoadingAnnouncer, PhotoStatusMark } from './editor/ImageRepairIndicator';
import { SaveConflictDialog } from './editor/ConflictDialog';
import { PublishAction } from './editor/PublishAction';
import { useIssueNavigation, type EditorLocateRequest } from './editor/use-issue-navigation';
import { CanvasHeader } from './editor/CanvasHeader';
import { TableCellEditorSection } from './editor/TableCellEditorSection';
import { CellInlineEditor } from './editor/CellInlineEditor';
import { useStableGridPlan } from './editor/use-stable-grid-plan';
import { runTableGridAxisCommand, type TableGridOutcome } from './editor/table-grid-actions';
import type { TableGridCommand } from '../editor/table-grid-commands';
import { TableGridPasteFallback, TableGridToolbar } from './editor/TableGridToolbar';
import { TableInspectorPanel } from './editor/TableInspectorPanel';
import { TextInspectorSection } from './editor/TextInspectorSection';
import { TextEditToolbar } from './editor/TextEditToolbar';
import { SIDE_PROPERTIES_PANEL_ID, SidePanelColumn } from './editor/SidePanelTabs';
import { AssistantDock, assistantSelectionLabel, useAssistantWide } from './editor/AssistantDock';
import { LIBRARY_BUTTON_LABEL } from './catalog-navigation';

type EditorSelectionState = { activePageId: string; selectedObjectIds: readonly string[]; mode: 'select' | 'text-edit' | 'table-grid' | 'cell-edit' };
type InspectorDraft = { x: string; y: string; width: string; height: string };
type TextEditSession = {
  objectId: string;
  pageId: string;
  expectedText: RichText;
  draft: string;
};
type TableTitleDraftSession = {
  pageId: string;
  objectId: string;
  tableId: string;
  expectedTitle: RichText | null;
  draft: string;
  composing: boolean;
};
type ImageFocalDraft = { x: number; y: number };
type ImageFocalGesture = {
  objectId: string;
  expectedImage: ImageExpectedState;
  pointerId?: number;
};
const technicalSymbols = ['±', '°C', 'Ω', 'µ', '≤', '≥', '≈'] as const;
const SNAP_RADIUS_PX = 8;

export function tableStyleDisabledGuidance(hasCellDraft: boolean, isLocked: boolean): string | undefined {
  if (hasCellDraft && isLocked) {
    return 'Conclua ou cancele a edição da célula e desbloqueie a tabela para alterar a apresentação.';
  }
  if (hasCellDraft) return 'Conclua ou cancele a edição da célula para alterar a apresentação da tabela.';
  if (isLocked) return 'Tabela bloqueada. Desbloqueie a tabela para alterar a apresentação.';
  return undefined;
}

export function tableSemanticDisabledGuidance(hasCellDraft: boolean, isLocked: boolean): string | undefined {
  if (hasCellDraft && isLocked) {
    return 'Conclua ou cancele a edição da célula e desbloqueie a tabela para alterar título, notas, legenda ou imagem.';
  }
  if (hasCellDraft) return 'Conclua ou cancele a edição da célula antes de alterar título, notas, legenda ou imagem.';
  if (isLocked) return 'Tabela bloqueada. Desbloqueie a tabela para alterar título, notas, legenda ou imagem.';
  return undefined;
}

function createGestureTransactionId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

function canonicalImageFocal(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
}

function useDocumentSession(session: DocumentSession) {
  return React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

/** A text of the page, also one inside a group (edited where it is), with its frame on the page. */
function findPageText(page: Page, objectId: string): { object: TextObject; frameU: FrameU; groupId?: string } | undefined {
  for (const object of page.objects) {
    if (object.id === objectId) return object.type === 'text' ? { object, frameU: frameToU(object.frame) } : undefined;
    if (object.type !== 'group') continue;
    const child = object.objects.find((entry) => entry.id === objectId);
    if (!child) continue;
    if (child.type !== 'text') return undefined;
    const group = frameToU(object.frame), own = frameToU(child.frame);
    return { object: child, frameU: { xU: group.xU + own.xU, yU: group.yU + own.yU, widthU: own.widthU, heightU: own.heightU }, groupId: object.id };
  }
  return undefined;
}

function visualObjects(page: Page): EditorialObject[] {
  return page.objects
    .map((object, index) => ({ object, index }))
    .sort((left, right) => left.object.zIndex === right.object.zIndex
      ? left.index - right.index
      : left.object.zIndex - right.object.zIndex)
    .map(({ object }) => object);
}

function objectClosureLockedId(object: EditorialObject): string | undefined {
  if (object.locked === true) return object.id;
  if (object.type === 'group') return object.objects.find((child) => child.locked === true)?.id;
  return undefined;
}

function groupHasLockedDescendant(object: EditorialObject): boolean {
  return object.type === 'group' && object.locked !== true && object.objects.some((child) => child.locked === true);
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

const subscribeToNothing = (_listener: () => void): (() => void) => () => undefined;
const idleConflictResolutionState = () => 'idle' as const;

export function EditorWorkspace({
  session,
  persistence,
  composerClient,
  factExtraction,
  onRequestLibrary,
  onRequestTranslation,
  onRequestPublication,
  locateRequest,
  demoAssets = false,
  simpleByDefault = false,
}: {
  session: DocumentSession;
  composerClient?: NativeComposeFunctionsClient;
  /** J2-lite: reading a PDF with the AI to build a verified specification table (server key). */
  factExtraction?: SpecTableGateway;
  demoAssets?: boolean;
  simpleByDefault?: boolean;
  persistence?: EditorWorkspacePersistenceProps;
  onRequestLibrary?: () => void;
  onRequestTranslation?: () => void;
  onRequestPublication?: () => void;
  /** "Corrigir este item" from the publication review: go to the page and select the object or cell. */
  locateRequest?: EditorLocateRequest;
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
  const [multiSelectArmed, setMultiSelectArmed] = React.useState(false);
  const activePageIdRef = React.useRef(editorState.activePageId);
  activePageIdRef.current = editorState.activePageId;
  const [statusMessage, setStatusMessage] = React.useState<EditorNoticeInput | null>(null);
  // FR-64: "Criar com IA a partir de arquivos" opens the catalog with `assistente=1`, so the files can be dropped at once.
  const [assistantOpen, setAssistantOpen] = React.useState(() => Boolean(simpleByDefault) && assistantRequested());
  React.useEffect(() => { forgetAssistantRequest(); }, []);
  const [assistantWide, setAssistantWide] = useAssistantWide();
  const [pageTemplateChoice, setPageTemplateChoice] = React.useState(PRESYS_DEFAULT_PAGE_MODEL_ID);
  const [pageTemplateBusy, setPageTemplateBusy] = React.useState(false);
  const pageTemplateBusyRef = React.useRef(false);
  const officialPageReuse = hasPresysPageReuse(session);
  const [advancedToolsOpen, setAdvancedToolsOpen] = React.useState(!simpleByDefault);
  const [tableOptionsOpen, setTableOptionsOpen] = React.useState(!simpleByDefault);
  const [tableRowsToInsert, setTableRowsToInsert] = React.useState('10');
  const [newTableSizeOpen, setNewTableSizeOpen] = React.useState(false);
  const [newTableRows, setNewTableRows] = React.useState(String(DEFAULT_NEW_TABLE_SIZE.rows));
  const [newTableColumns, setNewTableColumns] = React.useState(String(DEFAULT_NEW_TABLE_SIZE.columns));
  const [pasteTableAreaOpen, setPasteTableAreaOpen] = React.useState(false);
  const [pasteGrowOffer, setPasteGrowOffer] = React.useState<(TablePasteGrowthOffer & { objectId: string; sourceRows: number; sourceColumns: number; source: TablePasteSource }) | null>(null);
  const [pendingTableFit, setPendingTableFit] = React.useState<PendingTableFit | null>(null);
  /** Same value as `pendingTableFit`, readable right after a draft is committed (before React renders). */
  const pendingTableFitRef = React.useRef<PendingTableFit | null>(null);
  pendingTableFitRef.current = pendingTableFit;
  /**
   * B-01 and "Salvar": Salvar commits an open draft (cell, title) and saves at once, but the growth of the table
   * frame that belongs to that change lands only once the table is measured, after the save started. That growth
   * is saved right after, so pressing Salvar never ends in "Alterações não salvas".
   */
  const saveAfterPendingFitRef = React.useRef<string | null>(null);
  const [followUpSaveRequested, setFollowUpSaveRequested] = React.useState(false);
  /**
   * B-01: a row with text is taller than an empty one (6,5 → 7,8 mm in the house style), so typing, pasting or
   * writing a note can make the table taller than its frame. The change runs under its own transaction and the
   * measured "Ajustar altura" (grow only) joins it: one Desfazer takes back both.
   */
  const executeGrowingTable = (action: ApplicationAction, objectId: string) => {
    const transactionId = newTableTransactionId();
    const result = session.execute(action, { transactionId });
    if (result.ok && result.metadata.changed) {
      const pending = { objectId, transactionId, document: result.document, growOnly: true };
      pendingTableFitRef.current = pending;
      setPendingTableFit(pending);
    }
    return result;
  };
  const [inspectorDetailsOpen, setInspectorDetailsOpen] = React.useState(!simpleByDefault);
  const [tableInspectorAdvancedOpen, setTableInspectorAdvancedOpen] = React.useState(!simpleByDefault);
  const [pageReuseOpen, setPageReuseOpen] = React.useState(!simpleByDefault);
  const [diagnosticsOpen, setDiagnosticsOpen] = React.useState(!simpleByDefault);
  const [tablePasteFallbackOpen, setTablePasteFallbackOpen] = React.useState(false);
  const [tablePasteFallbackText, setTablePasteFallbackText] = React.useState('');
  const [markerPanelOpen, setMarkerPanelOpen] = React.useState(false);
  const [columnDimensionsAdvancedOpen, setColumnDimensionsAdvancedOpen] = React.useState(false);
  const [tableStyleAdvancedOpen, setTableStyleAdvancedOpen] = React.useState(false);
  const [tableStyleRoleScope, setTableStyleRoleScope] = React.useState<'header' | 'body' | 'section' | null>(null);
  const [tableStylePaddingLinked, setTableStylePaddingLinked] = React.useState(true);
  const [pendingRowHeightMode, setPendingRowHeightMode] = React.useState<{ selectionKey: string; mode: 'MIN_MM' | 'FIXED_MM' } | null>(null);
  const [markerLegendChoice, setMarkerLegendChoice] = React.useState('');
  const [newMarkerCode, setNewMarkerCode] = React.useState('');
  const [newMarkerText, setNewMarkerText] = React.useState('');
  const [tableTitleDraft, setTableTitleDraft] = React.useState<TableTitleDraftSession | null>(null);
  const tableTitleDraftRef = React.useRef<TableTitleDraftSession | null>(null);
  tableTitleDraftRef.current = tableTitleDraft;
  const [newAnnotationKind, setNewAnnotationKind] = React.useState<'caption' | 'note' | 'footnote'>('note');
  const [newAnnotationText, setNewAnnotationText] = React.useState('');
  const [newAnnotationTarget, setNewAnnotationTarget] = React.useState<'TABLE' | 'CELL'>('TABLE');
  const [imageAssetChoice, setImageAssetChoice] = React.useState('');
  const [imageFitDraft, setImageFitDraft] = React.useState<'contain' | 'cover'>('contain');
  const [imageFocalDraft, setImageFocalDraft] = React.useState<ImageFocalDraft>({ x: 0.5, y: 0.5 });
  const imageFocalDraftRef = React.useRef<ImageFocalDraft>(imageFocalDraft);
  imageFocalDraftRef.current = imageFocalDraft;
  const imageFocalGestureRef = React.useRef<ImageFocalGesture | null>(null);
  const [imageCellAssetChoice, setImageCellAssetChoice] = React.useState('');
  const [imageCellFit, setImageCellFit] = React.useState<'contain' | 'cover'>('contain');
  const [imageCellWidthMm, setImageCellWidthMm] = React.useState(String(DEFAULT_IMAGE_CELL_WIDTH_U / 10_000));
  const [imageCellHeightMm, setImageCellHeightMm] = React.useState(String(DEFAULT_IMAGE_CELL_HEIGHT_U / 10_000));
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
  const selectedObjects = editorState.selectedObjectIds
    .map((objectId) => selectedPage.objects.find((object) => object.id === objectId))
    .filter((object): object is EditorialObject => Boolean(object));
  const selectedImageObject = selectedObject?.type === 'image' ? selectedObject : undefined;
  const selectedTableObject = selectedObject?.type === 'table' ? selectedObject : undefined;
  const lockedSelectedTableId = selectedTableObject?.locked === true ? selectedTableObject.id : undefined;
  const selectedOwnLocked = selectedObject?.locked === true;
  const selectedClosureLockedId = selectedObject ? objectClosureLockedId(selectedObject) : undefined;
  const selectedMutationLocked = Boolean(selectedClosureLockedId);
  const selectedHasLockedClosure = selectedObjects.some((object) => Boolean(objectClosureLockedId(object)));
  const selectedHasInternalLockedGroup = selectedObjects.some(groupHasLockedDescendant);
  const selectedVisualOrder = visualObjects(selectedPage);
  const selectedVisualIndex = selectedObject
    ? selectedVisualOrder.findIndex((object) => object.id === selectedObject.id)
    : -1;
  React.useEffect(() => {
    setTableRangeExtensionArmed(false);
  }, [document.id, editorState.activePageId, editorState.mode, selectedTableObject?.id, selectedTableObject?.table.id]);
  React.useEffect(() => {
    setTableStyleRoleScope(null);
    setTableStyleAdvancedOpen(false);
    setTableStylePaddingLinked(true);
  }, [document.id, editorState.activePageId, selectedTableObject?.id]);
  React.useEffect(() => {
    if (!simpleByDefault) return;
    setInspectorDetailsOpen(false);
    setTableInspectorAdvancedOpen(false);
  }, [simpleByDefault, document.id, editorState.activePageId, selectedObject?.id]);
  React.useEffect(() => {
    if (!lockedSelectedTableId) return;
    const wasCellEdit = editorState.mode === 'cell-edit';
    const hadTableMode = editorState.mode === 'table-grid' || wasCellEdit;
    const hadCellDraft = Boolean(cellDraftRef.current);
    const hadTransientAuthoring = hadTableMode
      || hadCellDraft
      || Boolean(tableSelectionRef.current)
      || tableRangeExtensionArmed
      || tablePasteFallbackOpen
      || markerPanelOpen;
    if (!hadTransientAuthoring) return;
    controller.cancel('superseded');
    if (hadCellDraft) {
      cellDraftRef.current = null;
      setCellDraft(null);
      persistence?.runtime.workspace.notifyDraftStateChanged();
    }
    tableSelectionRef.current = null;
    tableHistoryContextRef.current = null;
    setTableSelection(null);
    setTableRangeExtensionArmed(false);
    setTablePasteFallbackOpen(false);
    setTablePasteFallbackText('');
    setMarkerPanelOpen(false);
    setEditorState((current) => ({ ...current, selectedObjectIds: [lockedSelectedTableId], mode: 'select' }));
    if (wasCellEdit || hadCellDraft) {
      setStatusMessage('A tabela foi bloqueada. A edição da célula foi encerrada.');
    } else if (hadTableMode) {
      setStatusMessage('A tabela foi bloqueada. A edição da grade foi encerrada.');
    }
  }, [
    controller,
    editorState.mode,
    lockedSelectedTableId,
    markerPanelOpen,
    persistence?.runtime.workspace,
    tablePasteFallbackOpen,
    tableRangeExtensionArmed,
  ]);
  React.useEffect(() => {
    if (!selectedImageObject) {
      imageFocalGestureRef.current = null;
      setImageAssetChoice('');
      setImageFitDraft('contain');
      setImageFocalDraft({ x: 0.5, y: 0.5 });
      return;
    }
    if (imageFocalGestureRef.current?.objectId === selectedImageObject.id) return;
    const expected = projectImageExpectedState(selectedImageObject);
    setImageAssetChoice(selectedImageObject.assetId);
    setImageFitDraft(selectedImageObject.fit);
    setImageFocalDraft({ ...expected.focalPoint });
  }, [document.id, editorState.activePageId, selectedImageObject]);
  const editingEntry = textEdit ? findPageText(selectedPage, textEdit.objectId) : undefined;
  const editingObject = editingEntry?.object;
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
  /** Numbers, not text: "88.0" and "88,0" are not a pending edit when X is 88. */
  const inspectorDraftIsPending = (): boolean => {
    const target = inspectorTargetRef.current;
    return Boolean(target && inspectorDraftIsDirty(inspectorDraftRef.current, target.expectedFrame));
  };
  /** `frame` is the object's frame when the error was shown: once Desfazer/Refazer changes it, the hint is stale. */
  const [inspectorFieldError, setInspectorFieldError] = React.useState<(InspectorFieldError & { objectId: string; frame?: EditorialObject['frame'] }) | null>(null);
  /** Plain notice about a typed value that was put back, kept until its field leaves the screen. */
  const settleNoticeRef = React.useRef<string | null>(null);
  const withSettleNotice = (message: string | null) => (
    settleNoticeRef.current ? (message ? `${message} ${settleNoticeRef.current}` : settleNoticeRef.current) : message
  );
  React.useEffect(() => {
    settleNoticeRef.current = null;
    setInspectorFieldError((current) => (current && current.objectId !== selectedObjectId ? null : current));
  }, [selectedObjectId]);
  const selectedFrame = selectedObject?.frame;
  React.useEffect(() => {
    if (!inspectorFieldError?.frame || !selectedFrame || sameInspectorFrame(inspectorFieldError.frame, selectedFrame)) return;
    settleNoticeRef.current = null;
    setInspectorFieldError(null);
  }, [inspectorFieldError, selectedFrame]);

  const tableTitleBaselineText = (title: RichText | null): string | null => (
    title === null ? '' : projectEditableRichText(title)
  );
  const sameTableTitleTarget = (
    draft: TableTitleDraftSession,
    pageId: string,
    objectId: string,
    tableId: string
  ) => draft.pageId === pageId && draft.objectId === objectId && draft.tableId === tableId;
  const tableTitleDraftIsDirty = (draft: TableTitleDraftSession): boolean => {
    const baseline = tableTitleBaselineText(draft.expectedTitle);
    return baseline === null || draft.draft !== baseline;
  };
  const publishTableTitleDraft = (next: TableTitleDraftSession | null) => {
    tableTitleDraftRef.current = next;
    setTableTitleDraft(next);
    persistence?.runtime.workspace.notifyDraftStateChanged();
  };

  const selectedTableTitleProjected = selectedTableObject?.table.title ? projectEditableRichText(selectedTableObject.table.title) : '';
  const selectedTableTitleValue = tableTitleDraft && selectedTableObject
    && sameTableTitleTarget(tableTitleDraft, selectedPage.id, selectedTableObject.id, selectedTableObject.table.id)
    ? tableTitleDraft.draft
    : selectedTableTitleProjected ?? '';
  const updateTableTitleDraft = (value: string) => {
    if (!selectedTableObject) return;
    if (inspectorDraftIsPending()) settleInspectorDraft();
    const normalized = value.replace(/\r\n?/g, '\n');
    const current = tableTitleDraftRef.current;
    const sameTarget = Boolean(current && sameTableTitleTarget(current, selectedPage.id, selectedTableObject.id, selectedTableObject.table.id));
    const expectedTitle = sameTarget ? current!.expectedTitle : selectedTableObject.table.title ?? null;
    const baseline = tableTitleBaselineText(expectedTitle);
    if (baseline === null) return;
    if (!sameTarget && normalized === baseline) return;
    const next: TableTitleDraftSession = {
      pageId: selectedPage.id, objectId: selectedTableObject.id, tableId: selectedTableObject.table.id,
      expectedTitle, draft: normalized, composing: sameTarget ? current!.composing : false,
    };
    if (!next.composing && normalized === baseline) publishTableTitleDraft(null);
    else publishTableTitleDraft(next);
  };
  const setTableTitleComposition = (composing: boolean, value: string) => {
    if (!selectedTableObject) return;
    if (inspectorDraftIsPending()) settleInspectorDraft();
    const normalized = value.replace(/\r\n?/g, '\n');
    const current = tableTitleDraftRef.current;
    const sameTarget = Boolean(current && sameTableTitleTarget(current, selectedPage.id, selectedTableObject.id, selectedTableObject.table.id));
    const expectedTitle = sameTarget ? current!.expectedTitle : selectedTableObject.table.title ?? null;
    const baseline = tableTitleBaselineText(expectedTitle);
    if (baseline === null) return;
    if (!composing && normalized === baseline) {
      publishTableTitleDraft(null);
      return;
    }
    publishTableTitleDraft({
      pageId: selectedPage.id, objectId: selectedTableObject.id, tableId: selectedTableObject.table.id,
      expectedTitle, draft: normalized, composing,
    });
  };
  const cancelTableTitleDraft = () => {
    if (!tableTitleDraftRef.current) return;
    publishTableTitleDraft(null);
    setStatusMessage('Alterações do título canceladas.');
  };

  React.useEffect(() => {
    const activePage = document.pages.find((page) => page.id === editorState.activePageId);
    if (!activePage) {
      controller.cancel('active-page-change');
      setMultiSelectArmed(false);
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
    tableTitleDraftRef.current = null;
    setTableTitleDraft(null);
    setTableRangeExtensionArmed(false);
    setTableSelection(null);
    setMultiSelectArmed(false);
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
    if (page && findPageText(page, textEdit.objectId)) return;
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
    const next = inspectorDraftFromFrame(selectedObject.frame);
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

  // FR-30: closing the cell editor always gives the grid back; 'cell-edit' never stays on without an editor.
  const releaseCellEditMode = () => setEditorState((current) => (current.mode === 'cell-edit' ? { ...current, mode: 'table-grid' } : current));
  const finishCellDraftForContextChange = (): boolean => {
    const draft = cellDraftRef.current;
    if (!draft) return true;
    if (!draft.dirty) {
      cellDraftRef.current = null;
      setCellDraft(null);
      releaseCellEditMode();
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
    const result = executeGrowingTable({
      type: 'table.cell.setContent',
      ...draft.identity,
      expectedContent: draft.originalContent,
      content: validation.input,
      ...(validation.allowTypeChange ? { allowTypeChange: true as const } : {}),
    }, draft.identity.objectId);
    if (!result.ok) {
      setStatusMessage(result.error.code === 'TARGET_STALE'
        ? 'A célula mudou. O rascunho foi preservado para revisão.'
        : 'Não foi possível concluir o rascunho da célula.');
      return false;
    }
    cellDraftRef.current = null;
    setCellDraft(null);
    releaseCellEditMode();
    persistence?.runtime.workspace.notifyDraftStateChanged();
    return true;
  };

  const prepareAuthoringForContextChangeRef = React.useRef<() => boolean>(() => true);

  const setActivePage = (pageId: string) => {
    if (!prepareAuthoringForContextChangeRef.current()) return;
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
    setMultiSelectArmed(false);
    setEditorState({ activePageId: pageId, selectedObjectIds: [], mode: 'select' });
    setStatusMessage(withSettleNotice(null));
  };

  const selectObject = (objectId: string) => {
    if (!prepareAuthoringForContextChangeRef.current()) return;
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

  const commitTextEdit = (): boolean => {
    const edit = textEditRef.current;
    if (!edit) return true;
    if (compositionRef.current) {
      setStatusMessage('Conclua a composição de texto antes de mudar de contexto.');
      return false;
    }
    const result = applyTextDraft(edit);
    if (!result.ok) {
      setStatusMessage(result.error.code === 'OBJECT_LOCKED'
        ? 'O texto foi bloqueado antes da conclusão; o rascunho não foi aplicado.'
        : 'O texto mudou ou não pode mais ser editado por este modo; o rascunho não foi aplicado.');
      // Failed completion preserves the visible draft and active edit session.
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

  // FR-22: an open text box is an unsaved change only once its text differs (or an accent is being composed).
  const textEditIsDirty = (edit: TextEditSession) => compositionRef.current
    || edit.draft !== (projectEditableRichText(edit.expectedText) ?? '');
  const prepareTextDraftForSave = (): AuthoringBarrierResult => {
    const edit = textEditRef.current;
    if (!edit || !textEditIsDirty(edit)) return { ok: true };
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
  const applyTableTitleDraft = (): AuthoringBarrierResult => {
    const draft = tableTitleDraftRef.current;
    if (!draft) return { ok: true };
    if (!tableTitleDraftIsDirty(draft) && !draft.composing) {
      publishTableTitleDraft(null);
      return { ok: true };
    }
    if (draft.composing) {
      setStatusMessage('Conclua a composição do título antes de continuar.');
      return { ok: false, reason: 'COMPOSITION_ACTIVE', message: 'Conclua a composição do título antes de continuar.' };
    }
    const livePage = session.getSnapshot().document.pages.find((entry) => entry.id === draft.pageId);
    const liveObject = livePage?.objects.find((entry) => entry.id === draft.objectId);
    if (liveObject?.type !== 'table' || liveObject.table.id !== draft.tableId) {
      setStatusMessage('A tabela do título não está mais disponível. O rascunho foi preservado.');
      return { ok: false, reason: 'STALE_DRAFT', message: 'O alvo do título mudou e o rascunho foi preservado.' };
    }
    const result = executeGrowingTable({
      type: 'table.title.set',
      pageId: draft.pageId,
      objectId: draft.objectId,
      tableId: draft.tableId,
      expectedTitle: draft.expectedTitle,
      plainText: draft.draft,
    }, draft.objectId);
    if (!result.ok) {
      const stale = result.error.code === 'TARGET_STALE';
      setStatusMessage(stale
        ? 'O título mudou enquanto este rascunho estava aberto. Revise antes de continuar.'
        : 'O rascunho do título não pôde ser aplicado com segurança.');
      return {
        ok: false,
        reason: stale ? 'STALE_DRAFT' : result.error.code === 'ACTION_INVALID' ? 'INVALID_DRAFT' : 'COMMIT_FAILED',
        message: stale ? 'O rascunho do título ficou desatualizado e foi preservado.' : 'O rascunho do título foi preservado.',
      };
    }
    publishTableTitleDraft(null);
    setStatusMessage(result.metadata.changed ? 'Título da tabela atualizado.' : 'Título da tabela sem alterações.');
    return { ok: true };
  };
  const captureInspectorRecoveryOverlay = (): AuthoringRecoveryOverlay | undefined => {
    const target = inspectorTargetRef.current;
    if (!target || !inspectorDraftIsPending()) return undefined;
    return {
      kind: 'INSPECTOR_FRAME_DRAFT_V1',
      pageId: target.pageId,
      objectId: target.objectId,
      expectedFrame: target.expectedFrame,
      draft: inspectorDraftRef.current,
    };
  };
  const prepareAuthoringForContextChange = (): boolean => {
    if (!finishCellDraftForContextChange()) return false;
    if (textEditRef.current && !commitTextEdit()) return false;
    const titleResult = applyTableTitleDraft();
    if (!titleResult.ok) return false;
    // Position/size fields never block: valid values are applied, invalid ones go back with a message.
    if (inspectorDraftIsPending()) settleInspectorDraft();
    return true;
  };
  prepareAuthoringForContextChangeRef.current = prepareAuthoringForContextChange;

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
    if (edit && textEditIsDirty(edit)) {
      return {
        kind: 'TEXT_DRAFT_V1',
        pageId: edit.pageId,
        objectId: edit.objectId,
        expectedText: edit.expectedText,
        draft: edit.draft,
        compositionWasActive: compositionRef.current,
      };
    }
    const title = tableTitleDraftRef.current;
    if (title && tableTitleDraftIsDirty(title)) {
      return {
        kind: 'TABLE_TITLE_DRAFT_V1',
        pageId: title.pageId,
        objectId: title.objectId,
        tableId: title.tableId,
        expectedTitle: title.expectedTitle,
        draft: title.draft,
        compositionWasActive: title.composing,
      };
    }
    return captureInspectorRecoveryOverlay();
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
      const result = executeGrowingTable({
        type: 'table.cell.setContent',
        ...cell.identity,
        expectedContent: cell.originalContent,
        content: validation.input,
        ...(validation.allowTypeChange ? { allowTypeChange: true as const } : {}),
      }, cell.identity.objectId);
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
      // FR-30: Ctrl+S while typing in a cell keeps the keys going to the grid.
      if (cell.identity.objectId === selectedTableObject?.id) {
        queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());
      }
    }
    const textResult = prepareTextDraftForSaveRef.current();
    if (!textResult.ok) return textResult;
    const titleResult = applyTableTitleDraft();
    if (!titleResult.ok) return titleResult;
    // A typed position/size is applied (or put back if invalid) before saving; it never blocks Save.
    if (inspectorDraftIsPending()) settleInspectorDraft();
    saveAfterPendingFitRef.current = pendingTableFitRef.current?.transactionId ?? null;
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
      // FR-22: opening a cell or a text box without changing it is not an unsaved change (dirty only when it differs).
      hasPendingDraft: () => Boolean(cellDraftRef.current?.dirty) || Boolean(tableTitleDraftRef.current) || Boolean(captureRecoveryOverlayRef.current()),
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
      recoveredOverlay.kind === 'TABLE_TITLE_DRAFT_V1'
      && object?.type === 'table'
      && object.table.id === recoveredOverlay.tableId
      && JSON.stringify(object.table.title ?? null) === JSON.stringify(recoveredOverlay.expectedTitle)
    ) {
      const recoveredTitleDraft: TableTitleDraftSession = {
        pageId: recoveredOverlay.pageId,
        objectId: recoveredOverlay.objectId,
        tableId: recoveredOverlay.tableId,
        expectedTitle: recoveredOverlay.expectedTitle,
        draft: recoveredOverlay.draft,
        composing: false,
      };
      tableTitleDraftRef.current = recoveredTitleDraft;
      setTableTitleDraft(recoveredTitleDraft);
      setEditorState({ activePageId: recoveredOverlay.pageId, selectedObjectIds: [recoveredOverlay.objectId], mode: 'select' });
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

  const startTextEdit = (object: EditorialObject, groupId?: string): boolean => {
    if (object.type !== 'text') return false;
    const group = groupId ? selectedPage.objects.find((entry) => entry.id === groupId) : undefined;
    if (object.locked || group?.locked) {
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
    setMultiSelectArmed(false);
    setEditorState({ activePageId: selectedPage.id, selectedObjectIds: [group?.id ?? object.id], mode: 'text-edit' });
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
    if (!prepareAuthoringForContextChangeRef.current()) return false;
    controller.cancel('superseded');
    setMultiSelectArmed(false);
    setEditorState({ activePageId: selectedPage.id, selectedObjectIds: [object.id], mode: 'select' });
    const plan = plans.get(object.table.id);
    if (!plan?.rowQ || plan.gridOffsetYQ === undefined) {
      setStatusMessage('Aguarde a medição da tabela para editar a grade.');
      return false;
    }
    const identity = tableSelectionIdentity(selectedPage.id, object.id, object.table.id);
    const first = { rowId: object.table.rows[0].id, columnId: object.table.columns[0].id };
    const next = tableCellSelection(identity, first);
    setTableRangeExtensionArmed(false);
    tableSelectionRef.current = next;
    tableHistoryContextRef.current = { table: object.table, selection: next };
    setTableSelection(next);
    setMultiSelectArmed(false);
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

  /** `typed` (FR-30): the key that started the edit replaces the content, as in Excel. */
  const startCellEdit = (point?: { rowId: string; columnId: string }, typed?: string): boolean => {
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
    const opened = createTableCellDraft({
      pageId: selectedPage.id,
      objectId: object.id,
      tableId: object.table.id,
      cellId: cell.id,
    }, cell.content);
    notifyCellDraftChanged(typed === undefined ? opened : startTableCellDraftByTyping(opened, typed));
    setMultiSelectArmed(false);
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
    const result = executeGrowingTable({
      type: 'table.cell.setContent',
      ...draft.identity,
      expectedContent: draft.originalContent,
      content: validation.input,
      ...(validation.allowTypeChange ? { allowTypeChange: true as const } : {}),
    }, draft.identity.objectId);
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

  // FR-30: the grid (and its focus) stays on screen while a saved cell is being measured again.
  const gridPlan = useStableGridPlan(selectedTableObject?.table, selectedTableObject && plans.get(selectedTableObject.table.id));

  const applyGridSelection = (table: TableModel, selection: TableSelection) => {
    tableSelectionRef.current = selection;
    tableHistoryContextRef.current = { table, selection };
    setTableSelection(selection);
  };

  /** FR-34: "+" and the grid menu compose the existing axis actions; rows inserted grow the frame in the same step. */
  const applyGridOutcome = (outcome: TableGridOutcome, objectId: string, transactionId: string) => {
    if (!outcome.ok) {
      setStatusMessage(outcome.message);
      return;
    }
    applyGridSelection(outcome.table, outcome.selection);
    if (outcome.fitHeight) setPendingTableFit({ objectId, transactionId, document: session.getSnapshot().document, growOnly: true });
    setStatusMessage(successNotice(outcome.message));
    queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());
  };

  const runGridCommand = (command: TableGridCommand) => {
    if (command.type === 'merge') return runTableMerge();
    if (command.type === 'unmerge') return runTableUnmerge();
    const live = cellDraftRef.current ? undefined : currentSelectedTableForStructure();
    if (!live || live.object.locked) return;
    const transactionId = newTableTransactionId();
    applyGridOutcome(runTableGridAxisCommand(session, { pageId: live.selection.identity.pageId, object: live.object, selection: live.selection }, command, transactionId), live.object.id, transactionId);
  };

  /** FR-30: Enter saves and goes down, Tab goes right (a new row after the last cell); a click elsewhere selects it. */
  const commitCellEditAndMove = (move?: CellEditorMove, point?: { rowId: string; columnId: string }) => {
    if (!commitCellEdit()) return;
    const live = currentSelectedTableForStructure();
    if (!live) return;
    if (point) return applyGridSelection(live.object.table, tableCellSelection(live.selection.identity, point));
    if (!move) return;
    const navigation = navigateTableSelection(live.object.table, live.selection,
      move === 'down' ? 'ArrowDown' : move === 'up' ? 'ArrowUp' : 'Tab', { backwards: move === 'left' });
    if (!navigation.exited) return applyGridSelection(live.object.table, navigation.selection);
    if (move === 'right') {
      runGridCommand({ type: 'insert', axis: 'row', position: 'after', referenceAxisId: live.object.table.rows[live.object.table.rows.length - 1].id, selectFirstCell: true });
    }
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

  const leaveTableGrid = (message = 'Você saiu da edição da tabela.') => {
    setTableRangeExtensionArmed(false);
    tableSelectionRef.current = null;
    tableHistoryContextRef.current = null;
    setTableSelection(null);
    setEditorState((current) => ({ ...current, mode: 'select' }));
    if (message) setStatusMessage(message);
  };

  const tableActionMessage = (code: string): string => {
    if (code === 'TABLE_LAST_AXIS') return 'A última linha ou coluna não pode ser removida.';
    if (code === 'MERGE_INTERSECTION') return 'A remoção cruza uma célula mesclada. Desfaça a mesclagem antes de remover a linha ou coluna.';
    if (code === 'MERGE_HEADER_BOUNDARY') return 'Não é possível mesclar cabeçalho e corpo.';
    if (code === 'MERGE_OVERLAP') return 'Desmescle as células existentes antes de criar uma nova mesclagem.';
    if (code === 'MERGE_WOULD_DISCARD_CONTENT') return 'Não é possível mesclar porque outra célula contém conteúdo ou anotação.';
    if (code === 'TARGET_STALE') return 'A tabela mudou. A ação foi descartada sem alterar o documento.';
    if (code === 'OBJECT_LOCKED') return 'Tabela bloqueada não pode ser alterada.';
    return 'Não foi possível alterar a estrutura da tabela.';
  };

  /**
   * FR-34: rows and columns come from the selected cell or range ("Linha abaixo" goes under the last selected row).
   * New rows make the frame grow by itself, in the same undo step, while the table still fits the page.
   */
  const runTableAxisInsert = (axis: 'row' | 'column', position: 'before' | 'after', count = 1) => {
    const live = currentSelectedTableForStructure();
    if (!live || editorState.mode !== 'table-grid') return;
    if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
      setStatusMessage('Informe uma quantidade entre 1 e 100 linhas.');
      return;
    }
    const { object, selection } = live;
    const axisIds = tableSelectionAxisIds(object.table, selection, axis);
    if (axisIds.length === 0) {
      setStatusMessage(tableAxisRefusalMessage('NO_AXIS', axis));
      return;
    }
    const referenceAxisId = position === 'before' ? axisIds[0] : axisIds[axisIds.length - 1];
    const transactionId = newTableTransactionId();
    const outcome = insertTableAxes(session, { pageId: selection.identity.pageId, object }, {
      axis,
      referenceAxisId,
      position,
      ...(axis === 'row' ? { count } : {}),
      properties: axis === 'row'
        ? { role: insertedRowRole(object.table, referenceAxisId, position), heightPolicy: { mode: 'AUTO' } }
        : { width: { mode: 'flex', weight: 1 }, minMm: 1 },
    }, transactionId);
    if (!outcome.ok) {
      setStatusMessage(tableAxisRefusalMessage(outcome.code, axis));
      return;
    }
    const insertedId = outcome.insertedAxisIds[0];
    if (insertedId) {
      const nextSelection = selectionAfterTableAxisInsert(outcome.table, selection, axis, insertedId);
      tableSelectionRef.current = nextSelection;
      tableHistoryContextRef.current = { table: outcome.table, selection: nextSelection };
      setTableSelection(nextSelection);
    }
    if (axis === 'row') setPendingTableFit({ objectId: object.id, transactionId, document: session.getSnapshot().document, growOnly: true });
    setStatusMessage(successNotice(axis === 'row' ? count === 1 ? 'Linha inserida.' : `${count} linhas inseridas. Use Desfazer para remover o lote.` : 'Coluna inserida.'));
  };

  /** FR-34: every selected row (or column) is removed at once, as one undo step; nothing changes when one cannot go. */
  const runTableAxisRemove = (axis: 'row' | 'column') => {
    const live = currentSelectedTableForStructure();
    if (!live || editorState.mode !== 'table-grid') return;
    const { object, selection } = live;
    const plan = planTableAxisRemoval(object.table, axis, tableSelectionAxisIds(object.table, selection, axis));
    if (!plan.ok) {
      setStatusMessage(tableAxisRefusalMessage(plan.code, axis));
      return;
    }
    const firstRemovedIndex = (axis === 'row' ? object.table.rows : object.table.columns).findIndex((entry) => entry.id === plan.axisIds[0]);
    const focusBefore = tableSelectionFocusPoint(object.table, selection);
    const outcome = removeTableAxes(session, { pageId: selection.identity.pageId, object }, axis, plan.axisIds, newTableTransactionId());
    if (!outcome.ok) {
      setStatusMessage(tableAxisRefusalMessage(outcome.code, axis));
      return;
    }
    const nextSelection = selectionAfterTableAxisRemove(outcome.table, selection, axis, firstRemovedIndex, focusBefore);
    tableSelectionRef.current = nextSelection;
    tableHistoryContextRef.current = { table: outcome.table, selection: nextSelection };
    setTableSelection(nextSelection);
    const count = plan.axisIds.length;
    setStatusMessage(successNotice(count === 1
      ? (axis === 'row' ? 'Linha excluída.' : 'Coluna excluída.')
      : `${count} ${axis === 'row' ? 'linhas excluídas' : 'colunas excluídas'}. Para voltar, use Desfazer.`));
  };

  /** FR-33 "Notas": a note under the table in one click, starting as "A COMPLETAR" (one undo step). */
  const addQuickNote = (): boolean => {
    const live = semanticMutationTable();
    if (!live) return false;
    const transactionId = newTableTransactionId();
    const outcome = runTableSteps(session, { pageId: live.pageId, objectId: live.object.id }, [quickNoteCreateStep()], transactionId);
    // B-01: the note prints under the grid; the frame grows to hold it, in the same Desfazer.
    if (outcome.ok && outcome.changed) {
      setPendingTableFit({ objectId: live.object.id, transactionId, document: session.getSnapshot().document, growOnly: true });
    }
    setStatusMessage(outcome.ok && outcome.changed
      ? successNotice('Nota adicionada abaixo da tabela. Escreva o texto no lugar de "A COMPLETAR".')
      : 'A nota não pôde ser adicionada. Nada foi alterado.');
    return outcome.ok && outcome.changed;
  };
  const removeQuickNote = (annotation: TableAnnotation) => {
    const live = semanticMutationTable();
    if (!live) return;
    const outcome = runTableSteps(session, { pageId: live.pageId, objectId: live.object.id }, quickNoteRemoveSteps(annotation.id), newTableTransactionId());
    setStatusMessage(outcome.ok && outcome.changed
      ? successNotice('Nota excluída. Para voltar, use Desfazer.')
      : 'A nota não pôde ser excluída. Nada foi alterado.');
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
    const result = executeGrowingTable({
      type: 'table.cells.setContents',
      pageId: live.selection.identity.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      geometry: prepared.geometry,
      targets: prepared.targets,
      ...(prepared.legendCreates ? { legendCreates: prepared.legendCreates } : {}),
      ...(prepared.expectedLegend ? { expectedLegend: prepared.expectedLegend } : {}),
    }, live.object.id);
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

  const describePasteError = (error: unknown): string => {
    if (error instanceof TableBulkAuthoringError) return tableBulkActionMessage(error.code);
    if (error instanceof TableTsvError) return error.code === 'TSV_ROW_WIDTH_MISMATCH'
      ? 'As linhas coladas têm quantidades diferentes de colunas. Copie uma área retangular da planilha, incluindo as células vazias. Nada foi alterado.'
      : 'O conteúdo colado tem aspas incompletas ou fora de posição. Copie novamente as células da planilha. Nada foi alterado.';
    if (error instanceof TableClipboardError) return 'O conteúdo interno copiado não é válido para esta tabela.';
    return 'Não foi possível interpretar o conteúdo colado.';
  };

  const runPreparedPaste = (typedText: string, plainText: string): boolean => {
    const live = currentSelectedTableForStructure();
    if (!live || editorState.mode !== 'table-grid') return false;
    setPasteGrowOffer(null);
    try {
      const prepared = typedText
        ? prepareTypedTablePaste(live.object.table, live.selection, parseTypedTableClipboard(typedText))
        : prepareExternalTsvPaste(live.object.table, live.selection, parseTsv(plainText));
      const count = prepared.targets.length;
      return executePreparedTableBulk(prepared, count === 1 ? '1 célula colada.' : `${count} células coladas.`);
    } catch (error) {
      if (error instanceof TablePasteGeometryError) {
        const source = describeRowsByColumns(error.sourceRows, error.sourceColumns);
        const destination = describeRowsByColumns(error.destinationRows, error.destinationColumns);
        // FR-31: a paste larger than the room left offers to grow the table in the same step.
        const offer = error.destinationKind === 'capacity'
          ? tablePasteGrowthOffer(live.object.table, live.selection, error.sourceRows, error.sourceColumns)
          : undefined;
        if (offer) setPasteGrowOffer({ ...offer, objectId: live.object.id, sourceRows: error.sourceRows, sourceColumns: error.sourceColumns, source: { typedText, plainText } });
        setStatusMessage(error.destinationKind === 'capacity'
          ? `Os dados têm ${source}, mas a partir desta célula só cabem ${destination}. ${offer ? `Clique em "${offer.label}" ou escolha outra célula inicial.` : 'Adicione linhas ou colunas, ou escolha outra célula inicial.'} Nada foi alterado.`
          : `Os dados têm ${source}, e a seleção tem ${destination}. Selecione uma única célula inicial ou uma área do mesmo tamanho dos dados. Nada foi alterado.`);
      } else setStatusMessage(describePasteError(error));
      return false;
    }
  };

  const runGrowAndPaste = () => {
    const offer = pasteGrowOffer;
    const live = currentSelectedTableForStructure();
    setPasteGrowOffer(null);
    if (!offer || !live || editorState.mode !== 'table-grid' || live.object.id !== offer.objectId) return;
    const current = tablePasteGrowthOffer(live.object.table, live.selection, offer.sourceRows, offer.sourceColumns);
    if (!current) {
      if (runPreparedPaste(offer.source.typedText, offer.source.plainText)) setTablePasteFallbackOpen(false);
      return;
    }
    const transactionId = newTableTransactionId();
    const outcome = growTableAndPaste(session, { pageId: live.selection.identity.pageId, object: live.object, selection: live.selection }, offer.source, current.plan, transactionId);
    if (!outcome.ok) {
      setStatusMessage(outcome.message ?? describePasteError(outcome.error));
      return;
    }
    tableSelectionRef.current = outcome.prepared.selectionAfter;
    tableHistoryContextRef.current = { table: outcome.table, selection: outcome.prepared.selectionAfter };
    setTableSelection(outcome.prepared.selectionAfter);
    setTablePasteFallbackOpen(false);
    setTablePasteFallbackText('');
    setStatusMessage(successNotice(outcome.message));
    // The new rows need room: fit the frame to the measured table inside the same undo step, as for a new table.
    setPendingTableFit({ objectId: live.object.id, transactionId, document: session.getSnapshot().document, growOnly: true });
    queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());
  };
  React.useEffect(() => setPasteGrowOffer(null), [tableSelection]);

  /** FR-31: pasted spreadsheet text becomes a styled table on the open page, in one undoable step. */
  const createTableFromText = (text: string, header?: boolean): boolean => {
    if (!prepareAuthoringForContextChangeRef.current()) return false;
    controller.cancel('superseded');
    const transactionId = newTableTransactionId();
    const outcome = createTableFromPastedText(session, editorState.activePageId, text, { header, transactionId });
    setStatusMessage(outcome.ok ? successNotice(outcome.message) : outcome.message);
    if (!outcome.ok) return false;
    selectObject(outcome.objectId);
    setPasteTableAreaOpen(false);
    setPendingTableFit({ objectId: outcome.objectId, transactionId, document: outcome.document });
    return true;
  };

  // Ctrl+V of an Excel block on the page (nothing editable focused, no table selected) creates the table.
  const pagePasteRef = React.useRef<(event: ClipboardEvent) => void>(() => undefined);
  pagePasteRef.current = (event) => {
    if (event.defaultPrevented || editorState.mode !== 'select' || !isPageLevelPasteTarget(event.target, globalThis.document.body)) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!isTabularClipboardText(text)) return;
    event.preventDefault();
    if (selectedTableObject) {
      setStatusMessage('Para colar dentro desta tabela, clique em Editar tabela e escolha a primeira célula. Para criar uma tabela nova, clique numa parte vazia da página e cole de novo.');
      return;
    }
    createTableFromText(text);
  };
  React.useEffect(() => {
    const listener = (event: ClipboardEvent) => pagePasteRef.current(event);
    globalThis.addEventListener('paste', listener);
    return () => globalThis.removeEventListener('paste', listener);
  }, []);

  // The table waiting for its automatic fit, measured on its own: the open cell editor (typing the next cell) or a
  // click elsewhere does not stop the frame from growing to what was already saved (B-01).
  const pendingFitPreparation = React.useMemo(() => {
    if (!pendingTableFit) return null;
    const page = document.pages.find((entry) => entry.objects.some((object) => object.id === pendingTableFit.objectId));
    return prepareTableFitHeight(document, page?.id ?? '', pendingTableFit.objectId, measuredLayout?.source === document ? measuredLayout : null);
  }, [document, measuredLayout, pendingTableFit]);
  // New tables start with an estimated height; once measured, fit it exactly inside the same undo step.
  React.useEffect(() => {
    if (!pendingTableFit) return;
    const decision = decidePendingTableFit(pendingTableFit, session.getSnapshot().document, selectedTableObject?.id, pendingFitPreparation, inspectorDraftIsPending());
    if (decision.kind === 'wait') return;
    pendingTableFitRef.current = null;
    setPendingTableFit(null);
    const savedBeforeFit = saveAfterPendingFitRef.current === pendingTableFit.transactionId;
    if (savedBeforeFit) saveAfterPendingFitRef.current = null;
    if (decision.kind !== 'fit') return;
    const fitted = session.execute(decision.action, { transactionId: pendingTableFit.transactionId });
    if (savedBeforeFit && fitted.ok && fitted.metadata.changed) setFollowUpSaveRequested(true);
  }, [pendingFitPreparation, pendingTableFit, selectedTableObject?.id, session]);
  // The follow-up save waits for the save in flight; after a failed save the father already sees why, and his next
  // Salvar includes the growth, so nothing is retried behind his back.
  const savePhase = persistence?.save.phase;
  const saveDirty = persistence?.save.dirty;
  React.useEffect(() => {
    if (!followUpSaveRequested || !persistenceRuntime) return;
    if (savePhase === 'saving') return;
    setFollowUpSaveRequested(false);
    if (savePhase === 'idle' && saveDirty) void persistenceRuntime.manualSave();
  }, [followUpSaveRequested, persistenceRuntime, saveDirty, savePhase]);

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
      setStatusMessage(successNotice('Conteúdo copiado. Ele pode ser colado no Excel, no Google Planilhas ou em outra tabela do catálogo.'));
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
      executePreparedTableBulk(prepared, `Conteúdo limpo em ${cellCountText(prepared.targets.length)}.`);
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
      executePreparedTableBulk(prepared, `Marcador aplicado a ${cellCountText(prepared.targets.length)}.`);
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
        `Novo marcador criado e aplicado a ${cellCountText(prepared.targets.length)}.`
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

  const semanticMutationTable = (): { pageId: string; object: TableObject } | undefined => {
    if (cellDraftRef.current) {
      setStatusMessage('Conclua ou cancele a edição da célula antes de alterar título, notas, legenda ou imagem.');
      return undefined;
    }
    const page = session.getSnapshot().document.pages.find((entry) => entry.id === activePageIdRef.current);
    const object = page?.objects.find(
      (entry): entry is TableObject => entry.id === selectedTableObject?.id && entry.type === 'table'
    );
    if (!page || !object) return undefined;
    if (object.locked) {
      setStatusMessage('Tabela bloqueada. Desbloqueie a tabela para alterar título, notas, legenda ou imagem.');
      return undefined;
    }
    return { pageId: page.id, object };
  };

  const semanticAnchorCell = (table: TableModel): Cell | undefined => {
    const selection = tableSelectionRef.current;
    if (!selection) return undefined;
    const ids = selectedTableAnchorIds(table, selection);
    return ids.length === 1 ? table.cells.find((cell) => cell.id === ids[0] && !cell.coveredBy) : undefined;
  };

  const runTableTitleSet = (plainText: string | null) => {
    const live = semanticMutationTable();
    if (!live) return;
    const current = live.object.table.title;
    const pending = tableTitleDraftRef.current;
    const samePendingTarget = Boolean(pending
      && sameTableTitleTarget(pending, live.pageId, live.object.id, live.object.table.id));
    const result = executeGrowingTable({
      type: 'table.title.set',
      pageId: live.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      expectedTitle: samePendingTarget ? pending!.expectedTitle : current ?? null,
      plainText,
    }, live.object.id);
    if (result.ok && samePendingTarget) publishTableTitleDraft(null);
    setStatusMessage(result.ok
      ? (result.metadata.changed ? (plainText === null ? 'Título da tabela removido.' : 'Título da tabela atualizado.') : 'Título da tabela sem alterações.')
      : result.error.code === 'TARGET_STALE'
        ? 'O título mudou. Revise o valor atual antes de tentar novamente.'
        : 'Não foi possível atualizar o título da tabela.');
  };

  const annotationTargetForCurrentSelection = (
    table: TableModel,
    scope: 'TABLE' | 'CELL'
  ) => {
    if (scope === 'TABLE') return annotationTargetForTable(table);
    const cell = semanticAnchorCell(table);
    return cell ? annotationTargetForCell(table, cell.id) : undefined;
  };

  const runAnnotationCreate = () => {
    const live = semanticMutationTable();
    if (!live) return;
    const text = newAnnotationText.replace(/\r\n?/g, '\n');
    if (!text.trim()) {
      setStatusMessage('Informe o texto da anotação.');
      return;
    }
    const scope = newAnnotationKind === 'caption' ? 'TABLE' : newAnnotationTarget;
    const target = annotationTargetForCurrentSelection(live.object.table, scope);
    if (!target) {
      setStatusMessage('Selecione uma única célula para aplicar esta nota à célula.');
      return;
    }
    const result = session.execute({
      type: 'table.annotation.create',
      pageId: live.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      kind: newAnnotationKind,
      plainText: text,
      expectedAnnotationOrder: live.object.table.annotations.map((entry) => entry.id),
      target: { ...target, expectedAnnotationIds: [...target.expectedAnnotationIds] },
    });
    if (!result.ok) {
      setStatusMessage(result.error.code === 'TARGET_STALE'
        ? 'Notas/referências mudaram. Revise antes de criar.'
        : 'Não foi possível criar a anotação.');
      return;
    }
    setNewAnnotationText('');
    setStatusMessage('Anotação criada e aplicada em uma única ação.');
  };

  const runAnnotationUpdate = (annotation: TableAnnotation, plainText: string) => {
    const live = semanticMutationTable();
    if (!live) return;
    const current = live.object.table.annotations.find((entry) => entry.id === annotation.id);
    if (!current) {
      setStatusMessage('A anotação não existe mais.');
      return;
    }
    const result = executeGrowingTable({
      type: 'table.annotation.update',
      pageId: live.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      annotationId: current.id,
      expectedAnnotation: current,
      plainText: plainText.replace(/\r\n?/g, '\n'),
    }, live.object.id);
    setStatusMessage(result.ok
      ? (result.metadata.changed ? 'Anotação atualizada.' : 'Anotação sem alterações.')
      : result.error.code === 'TARGET_STALE'
        ? 'A anotação mudou. Revise antes de editar.'
        : 'Não foi possível editar esta anotação.');
  };

  const runAnnotationReference = (
    annotation: TableAnnotation,
    scope: 'TABLE' | 'CELL',
    mode: 'attach' | 'detach'
  ) => {
    const live = semanticMutationTable();
    if (!live) return;
    const current = live.object.table.annotations.find((entry) => entry.id === annotation.id);
    if (!current) {
      setStatusMessage('A anotação não existe mais.');
      return;
    }
    const target = annotationTargetForCurrentSelection(live.object.table, scope);
    if (!target) {
      setStatusMessage('Selecione uma única célula âncora para alterar a referência.');
      return;
    }
    const result = session.execute({
      type: mode === 'attach' ? 'table.annotation.attach' : 'table.annotation.detach',
      pageId: live.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      annotationId: current.id,
      target: { ...target, expectedAnnotationIds: [...target.expectedAnnotationIds] },
    });
    setStatusMessage(result.ok
      ? (result.metadata.changed
          ? (mode === 'attach' ? 'Referência aplicada.' : 'Referência removida.')
          : 'Referência sem alterações.')
      : result.error.code === 'ANNOTATION_SCOPE_INVALID'
        ? 'Legenda/caption só pode ser aplicada à tabela.'
        : result.error.code === 'TARGET_STALE'
          ? 'As referências mudaram. Revise antes de tentar novamente.'
          : 'Não foi possível alterar a referência.');
  };

  const runAnnotationRemove = (annotation: TableAnnotation) => {
    const live = semanticMutationTable();
    if (!live) return;
    const current = live.object.table.annotations.find((entry) => entry.id === annotation.id);
    if (!current) return;
    const result = session.execute({
      type: 'table.annotation.remove',
      pageId: live.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      annotationId: current.id,
      expectedAnnotation: current,
    });
    setStatusMessage(result.ok
      ? 'Anotação excluída.'
      : result.error.code === 'ANNOTATION_IN_USE'
        ? 'Remova todas as referências desta anotação antes de excluí-la.'
        : result.error.code === 'TARGET_STALE'
          ? 'A anotação mudou. Revise antes de excluir.'
          : 'Não foi possível excluir a anotação.');
  };

  const runAnnotationReorder = (annotationId: string, direction: 'up' | 'down') => {
    const live = semanticMutationTable();
    if (!live) return;
    const expectedOrder = live.object.table.annotations.map((entry) => entry.id);
    const nextOrder = moveId(expectedOrder, annotationId, direction);
    const result = session.execute({
      type: 'table.annotation.reorder',
      pageId: live.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      expectedOrder,
      nextOrder: [...nextOrder],
    });
    setStatusMessage(result.ok
      ? (result.metadata.changed ? 'Ordem das anotações atualizada.' : 'A anotação já está no limite da lista.')
      : result.error.code === 'TARGET_STALE'
        ? 'A ordem das anotações mudou. Revise antes de mover.'
        : 'Não foi possível reordenar as anotações.');
  };

  const runLegendReorder = (legendEntryId: string, direction: 'up' | 'down') => {
    const live = semanticMutationTable();
    if (!live) return;
    const expectedOrder = live.object.table.legend.map((entry) => entry.id);
    const nextOrder = moveId(expectedOrder, legendEntryId, direction);
    const result = session.execute({
      type: 'table.legend.reorder',
      pageId: live.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      expectedOrder,
      nextOrder: [...nextOrder],
    });
    setStatusMessage(result.ok
      ? (result.metadata.changed ? 'Ordem da legenda atualizada.' : 'A entrada já está no limite da lista.')
      : result.error.code === 'TARGET_STALE'
        ? 'A ordem da legenda mudou. Revise antes de mover.'
        : 'Não foi possível reordenar a legenda.');
  };

  const locateLegendUsage = (legendEntryId: string) => {
    const page = session.getSnapshot().document.pages.find((entry) => entry.id === activePageIdRef.current);
    const object = page?.objects.find(
      (entry): entry is TableObject => entry.id === selectedTableObject?.id && entry.type === 'table'
    );
    if (!page || !object) return;
    const currentCell = semanticAnchorCell(object.table);
    const cellId = nextLegendUsageCellId(object.table, legendEntryId, currentCell?.id);
    if (!cellId) {
      setStatusMessage('Esta entrada da legenda ainda não possui usos.');
      return;
    }
    const cell = object.table.cells.find((entry) => entry.id === cellId);
    if (!cell) return;
    const identity = tableSelectionIdentity(page.id, object.id, object.table.id);
    const selection = tableCellSelection(identity, { rowId: cell.rowId, columnId: cell.columnId });
    tableSelectionRef.current = selection;
    tableHistoryContextRef.current = { table: object.table, selection };
    setTableSelection(selection);
    setEditorState({ activePageId: page.id, selectedObjectIds: [object.id], mode: 'table-grid' });
    setStatusMessage('Uso da legenda localizado.');
    queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());
  };

  const imageDimensionsU = (): { widthU: number; heightU: number } | undefined => {
    const width = Number(imageCellWidthMm);
    const height = Number(imageCellHeightMm);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      setStatusMessage('Informe largura e altura positivas em milímetros.');
      return undefined;
    }
    try {
      const widthU = mmToU(width);
      const heightU = mmToU(height);
      if (widthU < 1 || heightU < 1) throw new Error('non-positive');
      return { widthU, heightU };
    } catch {
      setStatusMessage('As dimensões da imagem não podem ser representadas no contrato físico.');
      return undefined;
    }
  };

  const runImageCellSet = () => {
    const live = semanticMutationTable();
    if (!live) return;
    const cell = semanticAnchorCell(live.object.table);
    if (!cell) {
      setStatusMessage('Selecione uma única célula âncora para inserir a imagem.');
      return;
    }
    const dimensions = imageDimensionsU();
    if (!dimensions) return;
    const assetId = imageCellAssetChoice || (cell.content.type === 'image' ? cell.content.assetId : '');
    if (!assetId) {
      setStatusMessage('Escolha uma imagem do catálogo.');
      return;
    }
    const result = session.execute({
      type: 'table.cell.setImage',
      pageId: live.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      cellId: cell.id,
      expectedContent: cell.content,
      expectedContentPresentation: cell.contentPresentation,
      assetId,
      fit: imageCellFit,
      targetWidthU: dimensions.widthU,
      targetHeightU: dimensions.heightU,
    });
    setStatusMessage(result.ok
      ? (result.metadata.changed ? 'Imagem da célula atualizada.' : 'Imagem da célula sem alterações.')
      : result.error.code === 'TARGET_STALE'
        ? 'A célula mudou. Revise antes de alterar a imagem.'
        : 'Não foi possível atualizar a imagem da célula.');
  };

  const runImageCellClear = () => {
    const live = semanticMutationTable();
    if (!live) return;
    const cell = semanticAnchorCell(live.object.table);
    if (!cell || cell.content.type !== 'image') {
      setStatusMessage('Selecione uma única célula que contenha imagem.');
      return;
    }
    const result = session.execute({
      type: 'table.cell.clearImage',
      pageId: live.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      cellId: cell.id,
      expectedContent: cell.content,
      expectedContentPresentation: cell.contentPresentation,
    });
    setStatusMessage(result.ok
      ? 'Imagem removida da célula. O asset permanece no catálogo.'
      : result.error.code === 'TARGET_STALE'
        ? 'A célula mudou. Revise antes de remover a imagem.'
        : 'Não foi possível remover a imagem da célula.');
  };

  const runImageCellUpload = () => {
    const live = semanticMutationTable();
    if (!live) return;
    const cell = semanticAnchorCell(live.object.table);
    if (!cell) {
      setStatusMessage('Selecione uma única célula âncora para fazer upload.');
      return;
    }
    const dimensions = imageDimensionsU();
    if (!dimensions) return;
    requestImageUpload({
      type: 'table-cell',
      pageId: live.pageId,
      objectId: live.object.id,
      tableId: live.object.table.id,
      cellId: cell.id,
      expectedContent: cell.content,
      expectedContentPresentation: cell.contentPresentation,
      fit: imageCellFit,
      targetWidthU: dimensions.widthU,
      targetHeightU: dimensions.heightU,
    });
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

  const finishTextEditBeforeCommand = (): boolean => prepareAuthoringForContextChangeRef.current();

  const toggleObjectSelection = (objectId: string) => {
    setEditorState((current) => {
      const selected = new Set(current.selectedObjectIds);
      if (selected.has(objectId)) selected.delete(objectId); else selected.add(objectId);
      return { ...current, selectedObjectIds: [...selected], mode: 'select' };
    });
  };

  const addPage = () => {
    if (!prepareAuthoringForContextChangeRef.current()) return;
    controller.cancel('superseded');
    const result = session.execute({ type: 'page.add', afterPageId: selectedPage.id });
    if (!result.ok) { setStatusMessage('Não foi possível adicionar a página.'); return; }
    const createdPageId = result.metadata.createdIds[0];
    if (createdPageId) setActivePage(createdPageId);
    setStatusMessage('Página adicionada.');
  };

  const insertPageTemplate = async () => {
    if (pageTemplateBusyRef.current) return;
    if (!prepareAuthoringForContextChangeRef.current()) return;
    controller.cancel('superseded');
    if (officialPageReuse && isPresysTa25nPageTemplate(pageTemplateChoice)) {
      const targetPageId = selectedPage.id;
      pageTemplateBusyRef.current = true;
      setPageTemplateBusy(true);
      try {
        const result = await insertPresysPage(session, pageTemplateChoice, targetPageId, () =>
          liveUploadContextRef.current.mounted && sessionRef.current === session && activePageIdRef.current === targetPageId);
        if (!liveUploadContextRef.current.mounted) return;
        if (!result.ok) {
          setStatusMessage(result.code === 'STALE_RESULT' ? 'A sessão ou página mudou. Selecione o modelo novamente.' : 'Não foi possível preparar e inserir o modelo. Nenhuma página foi adicionada. Tente novamente.');
          return;
        }
        setActivePage(result.pageId);
        if (simpleByDefault) setPageReuseOpen(false);
        setStatusMessage(activePageIdRef.current === result.pageId
          ? 'Modelo PRESYS inserido como página independente.'
          : 'Modelo PRESYS inserido. Conclua ou cancele a edição pendente para abrir a nova página.');
      } finally {
        pageTemplateBusyRef.current = false;
        if (liveUploadContextRef.current.mounted) setPageTemplateBusy(false);
      }
      return;
    }
    // FR-80: the PRESYS archetypes are ordinary page templates of the production registry.
    const result = session.execute({
      type: 'page.template.insert',
      templateId: officialPageReuse ? pageTemplateChoice : W2E_PAGE_TEMPLATE_ID,
      afterPageId: selectedPage.id,
    });
    if (!result.ok) { setStatusMessage('Não foi possível inserir o modelo.'); return; }
    const createdPageId = result.metadata.createdIds[0];
    if (createdPageId) setActivePage(createdPageId);
    if (simpleByDefault) setPageReuseOpen(false);
    setStatusMessage(officialPageReuse ? 'Modelo inserido como página nova, depois da página atual. Para voltar, use Desfazer.' : 'Modelo inserido como página independente.');
  };

  /** FR-30: after Desfazer/Refazer from the cell editor (key or button) the grid keeps the keys. */
  const focusGridAfterCellEdit = () => queueMicrotask(() => globalThis.document.querySelector<HTMLElement>('[data-table-grid-overlay]')?.focus());

  /**
   * FR-30: Desfazer (Ctrl+Z or the button) while typing in a cell takes the cell back to what it was, and Refazer
   * brings the typing back (the typing is saved first, then undone: nothing is lost). With nothing typed it closes
   * the editor and undoes the last change. Typing that cannot be saved (e.g. an empty code) is thrown away, as Esc.
   */
  const undo = () => {
    const typing = cellDraftRef.current;
    if (typing?.dirty && !typing.composing && !validateTableCellDraft(typing).ok) {
      cancelCellEdit('Digitação desfeita.');
      return;
    }
    if (!prepareAuthoringForContextChangeRef.current()) return;
    controller.cancel('history');
    const result = session.undo();
    setStatusMessage(!result.ok ? 'Não há alterações para desfazer.'
      : typing?.dirty ? 'Digitação desfeita. Para trazer de volta, use Refazer.' : 'Alteração desfeita.');
    if (typing) focusGridAfterCellEdit();
  };

  const redo = () => {
    const typing = cellDraftRef.current;
    if (typing?.dirty) {
      // Saving the typing would replace what Refazer could bring back.
      setStatusMessage('Para refazer, primeiro cancele a digitação com Esc.');
      return;
    }
    if (typing) focusGridAfterCellEdit();
    if (!prepareAuthoringForContextChangeRef.current()) return;
    controller.cancel('history');
    const result = session.redo();
    setStatusMessage(result.ok ? 'Alteração refeita.' : 'Não há alterações para refazer.');
  };

  const insertObject = (tool: InsertTool) => {
    const tableSize = newTableSizeOpen
      ? { rows: Number(newTableRows), columns: Number(newTableColumns) }
      : DEFAULT_NEW_TABLE_SIZE;
    if (tool === 'table' && !isValidNewTableSize(tableSize)) {
      setStatusMessage(`Informe quantidades inteiras: de 1 a ${MAX_NEW_TABLE_ROWS} linhas e de 1 a ${MAX_NEW_TABLE_COLUMNS} colunas. Nenhuma tabela foi criada.`);
      return;
    }
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const currentPage = session.getSnapshot().document.pages.find((page) => page.id === editorState.activePageId);
    if (!currentPage) return;
    if (tool === 'image' && (persistence || !demoAssets)) {
      requestImageUpload({ type: 'insert', pageId: currentPage.id });
      return;
    }
    const insert = { type: 'object.insert' as const, pageId: currentPage.id, object: createInsertSpec(tool, currentPage, tableSize, session.getSnapshot().document.style) };
    // A new table and its measured "Ajustar altura" share one transaction, so one Desfazer removes both.
    const transactionId = tool === 'table' ? newTableTransactionId() : undefined;
    const result = transactionId ? session.execute(insert, { transactionId }) : session.execute(insert);
    if (!result.ok) { setStatusMessage('Não foi possível inserir o objeto.'); return; }
    const objectId = result.metadata.createdIds[0];
    if (objectId) selectObject(objectId);
    const names: Record<InsertTool, string> = { text: 'Texto', image: 'Imagem', table: 'Tabela', shape: 'Forma', line: 'Linha' };
    if (tool === 'table') setNewTableSizeOpen(false);
    if (tool === 'table' && objectId && transactionId) {
      // FR-33: the new table gets the whole "Especificações" look (names in bold, 68 mm) in the same undo step.
      completeNewTableLook(session, { pageId: currentPage.id, objectId }, NEW_TABLE_PRESET_ID, transactionId);
      setPendingTableFit({ objectId, transactionId, document: session.getSnapshot().document });
    }
    // "clique em Editar tabela" is a tip, not a problem: the new table is a finished change (FR-12).
    setStatusMessage(tool === 'table'
      ? successNotice(`Tabela de ${tableSize.rows} ${tableSize.rows === 1 ? 'linha' : 'linhas'} × ${tableSize.columns} ${tableSize.columns === 1 ? 'coluna' : 'colunas'} adicionada${tableSize.rows > 1 ? ', com a primeira linha como cabeçalho' : ''}. Para escrever nela, clique em Editar tabela.`)
      : names[tool] + (tool === 'text' ? ' adicionado.' : ' adicionada.'));
  };

  const deleteSelected = () => {
    if (selectedObjects.length > 1) { runObjectShortcut({ type: 'delete' }); return; }
    if (!selectedObject) return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const result = session.execute({ type: 'object.delete', objectId: selectedObject.id });
    if (!result.ok) { setStatusMessage('Não foi possível excluir o objeto.'); return; }
    setEditorState((current) => ({ ...current, selectedObjectIds: [] }));
    setStatusMessage('Objeto excluído.');
  };

  /** Duplicates every selected object as one undo step; the copies (5 mm to the right and down) become the selection. */
  const duplicateSeveral = () => {
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const ids = selectedVisualOrder.filter((object) => editorState.selectedObjectIds.includes(object.id)).map((object) => object.id);
    if (ids.some((id) => {
      const object = selectedPage.objects.find((entry) => entry.id === id);
      return !object || Boolean(objectClosureLockedId(object));
    })) { setStatusMessage('Um dos objetos está travado. Destrave-o em Camadas para duplicar.'); return; }
    const transactionId = 'duplicar-varios:' + Date.now() + ':' + Math.random().toString(36).slice(2);
    const offsetU = mmToU(5);
    const created: string[] = [];
    for (const id of ids) {
      const object = session.getSnapshot().document.pages.find((page) => page.id === selectedPage.id)?.objects.find((entry) => entry.id === id);
      if (!object) continue;
      const frame = frameToU(object.frame);
      const result = session.execute({ type: 'object.duplicate', objectId: id, xU: frame.xU + offsetU, yU: frame.yU + offsetU }, { transactionId });
      if (!result.ok) { setStatusMessage('Não foi possível duplicar todos os objetos. Use Desfazer para voltar.'); break; }
      if (result.metadata.createdIds[0]) created.push(result.metadata.createdIds[0]);
    }
    if (created.length === 0) return;
    setEditorState((current) => ({ ...current, selectedObjectIds: created, mode: 'select' }));
    setStatusMessage(created.length + ' objetos duplicados. As cópias estão selecionadas: arraste para posicionar.');
  };

  const duplicateSelected = () => {
    if (selectedObjects.length > 1) { duplicateSeveral(); return; }
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
    const refusal = groupRefusal(selectedPage, editorState.selectedObjectIds);
    if (refusal) { setStatusMessage(refusal); return; }
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const result = session.execute({ type: 'group.create', pageId: selectedPage.id, objectIds: [...editorState.selectedObjectIds] });
    if (!result.ok) {
      setStatusMessage(result.error.code === 'OBJECT_LOCKED'
        ? 'Um dos objetos está travado. Destrave-o (cadeado em Camadas) e tente de novo.'
        : 'Não foi possível agrupar: a página mudou. Selecione os objetos de novo e tente outra vez.');
      return;
    }
    const groupId = result.metadata.createdIds[0];
    setEditorState((current) => ({ ...current, selectedObjectIds: groupId ? [groupId] : [] }));
    setStatusMessage('Objetos agrupados. Agora se movem juntos; dois cliques num texto do grupo editam o texto.');
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
    const back = target === 'back' ? sendToBackTarget(currentPage, selectedObject.id) : undefined;
    const targetIndex = back ? back.targetIndex : target === 'front' ? ordered.length - 1 : target === 'backward' ? Math.max(0, currentIndex - 1) : Math.min(ordered.length - 1, currentIndex + 1);
    runReorder(selectedObject.id, targetIndex, back?.keptAbove);
  };

  /** One undoable reorder; says where the object is now and warns when something above may cover it. */
  const runReorder = (objectId: string, targetIndex: number, keptAbove?: EditorialObject) => {
    const result = session.execute({ type: 'object.reorder', objectId, targetIndex });
    if (!result.ok) {
      setStatusMessage(result.error.code === 'OBJECT_LOCKED'
        ? 'Um objeto travado está no caminho. Destrave-o em Camadas para mudar a ordem.'
        : 'Não foi possível alterar a ordem.');
      return;
    }
    const page = result.document.pages.find((entry) => entry.id === selectedPage.id);
    const object = page?.objects.find((entry) => entry.id === objectId);
    if (!page || !object) return;
    const where = layerPosition(page, objectId);
    const position = where ? ' Agora está na camada ' + where.position + ' de ' + where.count + ' (1 = mais ao fundo).' : '';
    const covering = coveringObjectsAbove(page, objectId)[0];
    setStatusMessage(keptAbove
      ? 'Enviado para trás, mas continua na frente do fundo da página (' + layerName(keptAbove, document, page) + ') para não sumir.' + position + ' Para ir atrás do fundo, arraste em Camadas.'
      : covering
        ? 'Atenção: agora este objeto está atrás de ' + layerName(covering, document, page) + ' e pode ficar escondido.' + position + ' Use Desfazer ou Camadas para trazer de volta.'
        : 'Ordem do objeto atualizada.' + position);
  };

  const liveArrangementSelection = () => {
    const live = session.getSnapshot().document;
    const page = live.pages.find((entry) => entry.id === editorState.activePageId);
    if (!page) return undefined;
    const objects = editorState.selectedObjectIds
      .map((objectId) => page.objects.find((object) => object.id === objectId))
      .filter((object): object is EditorialObject => Boolean(object));
    if (objects.length !== editorState.selectedObjectIds.length) return undefined;
    return {
      pageId: page.id,
      targets: objects.map((object) => ({ objectId: object.id, expectedFrame: frameToU(object.frame) })),
    };
  };

  const arrangementFailureMessage = (code: string) => {
    if (code === 'TARGET_STALE') return 'A posição de um dos objetos mudou. Revise a seleção e tente novamente.';
    if (code === 'OBJECT_LOCKED') return 'Um dos objetos selecionados está bloqueado.';
    return 'Não foi possível organizar os objetos selecionados.';
  };

  const runAlignSelected = (alignment: 'left' | 'horizontal-center' | 'right' | 'top' | 'vertical-center' | 'bottom') => {
    if (editorState.selectedObjectIds.length < 2) return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const live = liveArrangementSelection();
    if (!live || live.targets.length < 2) {
      setStatusMessage('A seleção mudou. Revise os objetos selecionados e tente novamente.');
      return;
    }
    const result = session.execute({ type: 'objects.align', ...live, alignment });
    if (!result.ok) {
      setStatusMessage(arrangementFailureMessage(result.error.code));
      return;
    }
    const labels = {
      left: 'Objetos alinhados à esquerda.',
      'horizontal-center': 'Objetos centralizados horizontalmente.',
      right: 'Objetos alinhados à direita.',
      top: 'Objetos alinhados ao topo.',
      'vertical-center': 'Objetos centralizados verticalmente.',
      bottom: 'Objetos alinhados à base.',
    } as const;
    setStatusMessage(result.metadata.changed ? labels[alignment] : 'Os objetos já estão organizados dessa forma.');
  };

  const runDistributeSelected = (axis: 'horizontal' | 'vertical') => {
    if (editorState.selectedObjectIds.length < 3) return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const live = liveArrangementSelection();
    if (!live || live.targets.length < 3) {
      setStatusMessage('A seleção mudou. Revise os objetos selecionados e tente novamente.');
      return;
    }
    const result = session.execute({ type: 'objects.distribute', ...live, axis });
    if (!result.ok) {
      setStatusMessage(arrangementFailureMessage(result.error.code));
      return;
    }
    const success = axis === 'horizontal'
      ? 'Objetos distribuídos horizontalmente.'
      : 'Objetos distribuídos verticalmente.';
    setStatusMessage(result.metadata.changed ? success : 'Os objetos já estão organizados dessa forma.');
  };

  const setSelectedObjectLock = (locked: boolean) => {
    if (!selectedObjectId) return;
    const page = session.getSnapshot().document.pages.find((entry) => entry.id === editorState.activePageId);
    const object = page?.objects.find((entry) => entry.id === selectedObjectId);
    if (!object) {
      setStatusMessage('O objeto selecionado não está mais disponível.');
      return;
    }
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const result = session.execute({
      type: 'object.setLocked',
      objectId: object.id,
      expectedLocked: object.locked === true,
      locked,
    });
    if (!result.ok) {
      setStatusMessage(result.error.code === 'TARGET_STALE'
        ? 'O estado de bloqueio do objeto mudou. Revise e tente novamente.'
        : 'Não foi possível alterar o bloqueio do objeto.');
      return;
    }
    setStatusMessage(result.metadata.changed
      ? locked ? 'Objeto bloqueado.' : 'Objeto desbloqueado.'
      : locked ? 'O objeto já está bloqueado.' : 'O objeto já está desbloqueado.');
  };

  // ---- "Camadas" (Onda 3.5, S1) ----
  const liveLayerObject = (objectId: string) => session.getSnapshot().document.pages
    .find((entry) => entry.id === editorState.activePageId)?.objects.find((entry) => entry.id === objectId);
  const selectFromLayers = (objectId: string, mode: LayerSelectMode) => {
    if (!prepareAuthoringForContextChangeRef.current()) return;
    controller.cancel('superseded');
    if (editorState.mode === 'table-grid') leaveTableGrid('');
    if (mode === 'toggle') { toggleObjectSelection(objectId); return; }
    selectObject(objectId);
    const object = liveLayerObject(objectId);
    if (object) setStatusMessage(describeLayer(object, object.hidden ? ' Está escondido: clique no olho para mostrar.' : ''));
  };
  const toggleLayerHidden = (target: EditorialObject) => {
    const object = liveLayerObject(target.id);
    if (!object) return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const hidden = !object.hidden;
    const result = session.execute({ type: 'object.setHidden', objectId: object.id, expectedHidden: object.hidden === true, hidden });
    if (!result.ok) { setStatusMessage('Não foi possível esconder ou mostrar o objeto.'); return; }
    if (hidden) setEditorState((current) => ({ ...current, selectedObjectIds: current.selectedObjectIds.filter((id) => id !== object.id) }));
    setStatusMessage(hidden
      ? layerName(object, document) + ' escondido: não aparece na página nem sai no PDF. Para mostrar, clique no olho em Camadas.'
      : layerName(object, document) + ' voltou a aparecer.');
  };
  const toggleLayerLocked = (target: EditorialObject) => {
    const object = liveLayerObject(target.id);
    if (!object) return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const locked = !object.locked;
    const result = session.execute({ type: 'object.setLocked', objectId: object.id, expectedLocked: object.locked === true, locked });
    if (!result.ok) { setStatusMessage('Não foi possível travar ou destravar o objeto.'); return; }
    setStatusMessage(locked
      ? layerName(object, document) + ' travado: não sai do lugar e os cliques passam para o que está embaixo.'
      : layerName(object, document) + ' destravado.');
  };
  const reorderFromLayers = (objectId: string, targetIndex: number) => {
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    runReorder(objectId, targetIndex);
  };
  const showLayers = () => {
    setAssistantOpen(false);
    setLayersOpen(true);
    queueMicrotask(() => {
      const panel = globalThis.document.querySelector<HTMLElement>('[data-layers-panel]');
      panel?.scrollIntoView?.({ block: 'nearest' });
      panel?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')?.focus();
    });
  };

  const liveSelectedImage = () => {
    const page = session.getSnapshot().document.pages.find((entry) => entry.id === editorState.activePageId);
    const object = selectedObjectId ? page?.objects.find((entry) => entry.id === selectedObjectId) : undefined;
    return object?.type === 'image' ? object : undefined;
  };

  const imagePresentationFeedback = (result: ReturnType<DocumentSession['execute']>, success: string) => {
    if (result.ok) {
      setStatusMessage(result.metadata.changed ? success : 'A imagem já está com essa apresentação.');
      return;
    }
    setStatusMessage(result.error.code === 'TARGET_STALE'
      ? 'A imagem mudou enquanto você editava. Revise e tente novamente.'
      : 'Não foi possível atualizar a apresentação da imagem.');
  };

  const runImageFitChange = (fit: 'contain' | 'cover') => {
    const image = liveSelectedImage();
    if (!image || image.locked) return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const expectedImage = projectImageExpectedState(image);
    const result = session.execute({
      type: 'image.setPresentation',
      objectId: image.id,
      expectedImage,
      fit,
      focalPoint: expectedImage.focalPoint,
    });
    imagePresentationFeedback(result, 'Ajuste da imagem atualizado.');
  };

  const runImageCenter = () => {
    const image = liveSelectedImage();
    if (!image || image.locked) return;
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const result = session.execute({
      type: 'image.setPresentation',
      objectId: image.id,
      expectedImage: projectImageExpectedState(image),
      fit: image.fit,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    imagePresentationFeedback(result, 'Imagem centralizada.');
  };

  const beginImageFocalGesture = (pointerId?: number): boolean => {
    if (imageFocalGestureRef.current) return true;
    const image = liveSelectedImage();
    if (!image || image.locked || image.fit !== 'cover') return false;
    if (!finishTextEditBeforeCommand()) return false;
    controller.cancel('superseded');
    imageFocalGestureRef.current = {
      objectId: image.id,
      expectedImage: projectImageExpectedState(image),
      ...(pointerId === undefined ? {} : { pointerId }),
    };
    return true;
  };

  const commitImageFocalGesture = () => {
    const gesture = imageFocalGestureRef.current;
    if (!gesture) return;
    imageFocalGestureRef.current = null;
    const result = session.execute({
      type: 'image.setPresentation',
      objectId: gesture.objectId,
      expectedImage: gesture.expectedImage,
      fit: gesture.expectedImage.fit,
      focalPoint: { ...imageFocalDraftRef.current },
    });
    imagePresentationFeedback(result, 'Posição da imagem atualizada.');
  };

  const cancelImageFocalGesture = () => {
    const gesture = imageFocalGestureRef.current;
    imageFocalGestureRef.current = null;
    const live = gesture
      ? session.getSnapshot().document.pages.flatMap((page) => page.objects)
        .find((object) => object.id === gesture.objectId && object.type === 'image')
      : undefined;
    if (live?.type === 'image') {
      const focalPoint = { ...projectImageExpectedState(live).focalPoint };
      imageFocalDraftRef.current = focalPoint;
      setImageFocalDraft(focalPoint);
    }
  };

  const setCanonicalImageFocalDraft = (next: ImageFocalDraft) => {
    const canonical = { x: canonicalImageFocal(next.x), y: canonicalImageFocal(next.y) };
    imageFocalDraftRef.current = canonical;
    setImageFocalDraft(canonical);
  };

  const updateImageFocalFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    setCanonicalImageFocalDraft({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  };

  const replaceSelectedImageWithAsset = () => {
    const image = liveSelectedImage();
    if (!image || image.locked) return;
    if (!imageAssetChoice) {
      setStatusMessage('Escolha uma imagem do catálogo.');
      return;
    }
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const result = session.execute({
      type: 'image.replace',
      objectId: image.id,
      expectedImage: projectImageExpectedState(image),
      assetId: imageAssetChoice,
    });
    setStatusMessage(result.ok
      ? (result.metadata.changed ? 'Imagem substituída.' : 'A imagem selecionada já está em uso.')
      : result.error.code === 'TARGET_STALE'
        ? 'A imagem mudou enquanto você editava. Revise e tente novamente.'
        : 'Não foi possível substituir a imagem.');
  };

  const requestImageUpload = (target:
    | { type: 'insert'; pageId: string }
    | { type: 'replace'; objectId: string; expectedImage: ImageExpectedState }
    | {
        type: 'table-cell';
        pageId: string;
        objectId: string;
        tableId: string;
        cellId: string;
        expectedContent: Cell['content'];
        expectedContentPresentation?: Cell['contentPresentation'];
        fit: 'contain' | 'cover';
        targetWidthU: number;
        targetHeightU: number;
      }
  ) => {
    if (uploadBusyRef.current) return;
    if (!persistence?.assetBridge) {
      setStatusMessage('Envio de imagens indisponível neste ambiente.');
      return;
    }
    if (target.type === 'table-cell' && cellDraftRef.current) {
      setStatusMessage('Conclua ou cancele a edição da célula antes de alterar sua imagem.');
      return;
    }
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    pendingAssetIntentRef.current = { ...target, session, lineage: imageUploadLineage(persistence.runtime) };
    fileInputRef.current?.click();
  };

  const replaceSelectedImage = () => {
    const image = liveSelectedImage();
    if (!image || image.locked) return;
    const expectedImage = projectImageExpectedState(image);
    if (persistence || !demoAssets) {
      requestImageUpload({ type: 'replace', objectId: image.id, expectedImage });
      return;
    }
    if (!finishTextEditBeforeCommand()) return;
    controller.cancel('superseded');
    const result = session.execute({
      type: 'image.replace',
      objectId: image.id,
      expectedImage,
      assetId: alternateDemoAssetId(image.assetId),
    });
    setStatusMessage(result.ok
      ? (result.metadata.changed ? 'Imagem substituída.' : 'A imagem selecionada já está em uso.')
      : result.error.code === 'TARGET_STALE'
        ? 'A imagem mudou enquanto você editava. Revise e tente novamente.'
        : 'Não foi possível substituir a imagem.');
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

  // ---- Onda 3.5 (S1): reach any object, selection box, multiple selection ----
  const pageStageRef = React.useRef<HTMLDivElement>(null);
  const editorOverlayRef = React.useRef<HTMLDivElement>(null);
  const lastPointerTargetRef = React.useRef<{ pageId: string; objectId: string } | null>(null);
  const collapseOnClickRef = React.useRef<string | null>(null);
  const pendingTextEditRef = React.useRef<{ objectId: string; clientX: number; clientY: number } | null>(null);
  /** The quick second press on a selected text: edit it now (used when no drag can start). */
  const startPendingTextEdit = (): boolean => {
    const pending = pendingTextEditRef.current;
    pendingTextEditRef.current = null;
    const text = pending ? selectedPage.objects.find((entry) => entry.id === pending.objectId) : undefined;
    if (!text) return false;
    controller.cancel('superseded');
    return startTextEdit(text);
  };
  const marqueeRef = React.useRef<{
    pointerId: number; startClientX: number; startClientY: number; startU: PointU; additive: boolean;
    base: readonly string[]; active: boolean; onClick: () => void;
  } | null>(null);
  const [marquee, setMarquee] = React.useState<RectU | null>(null);
  const [layersOpen, setLayersOpen] = React.useState(false);
  const pageAssetUrls = persistence?.assetUrls ?? W2C_DEMO_ASSET_URLS;
  React.useEffect(() => {
    for (const object of selectedPage.objects) {
      if (object.type !== 'image' || object.hidden) continue;
      const asset = document.assets.find((entry) => entry.id === object.assetId);
      if (asset && asset.mime !== 'image/jpeg') preloadAlphaMask(pageAssetUrls.get(object.assetId));
    }
  }, [document.assets, pageAssetUrls, selectedPage]);
  const transparencyProbe: TransparencyProbe = (object, point) => {
    if (object.type !== 'image') return false;
    const mask = alphaMaskFor(pageAssetUrls.get(object.assetId));
    return mask ? imageTransparentAt(object, mask, point) : false;
  };
  /** Pointer position on the page in canonical units; undefined when the page has no size on screen (tests). */
  const pagePointU = (clientX: number, clientY: number): PointU | undefined => {
    const rect = pageStageRef.current?.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]')?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return undefined;
    return { xU: Math.round(((clientX - rect.left) / rect.width) * pageWidthU), yU: Math.round(((clientY - rect.top) / rect.height) * pageHeightU) };
  };
  const describeLayer = (object: EditorialObject, extra = ''): string => {
    const where = layerPosition(selectedPage, object.id);
    return 'Selecionado: ' + layerName(object, document, selectedPage)
      + (where ? ' (camada ' + where.position + ' de ' + where.count + ', contando do fundo)' : '') + '.' + extra;
  };
  const clearSelection = () => {
    controller.cancel('superseded');
    if (editorState.mode === 'table-grid') leaveTableGrid('');
    setEditorState((current) => ({ ...current, selectedObjectIds: [], mode: 'select' }));
  };
  /** Empty page area or grey margin: a click deselects, a drag draws a selection box. */
  const beginEmptyAreaPointer = (event: React.PointerEvent<HTMLElement>, onClick: () => void = clearSelection) => {
    const startU = pagePointU(event.clientX, event.clientY);
    if (!startU || !editorOverlayRef.current) { onClick(); return; }
    controller.cancel('superseded');
    event.preventDefault();
    editorOverlayRef.current.setPointerCapture?.(event.pointerId);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    marqueeRef.current = {
      pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startU, additive,
      base: additive ? editorState.selectedObjectIds : [], active: false, onClick,
    };
  };
  const moveMarquee = (event: React.PointerEvent<HTMLElement>) => {
    const current = marqueeRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.active && Math.hypot(event.clientX - current.startClientX, event.clientY - current.startClientY) < 5) return;
    const point = pagePointU(event.clientX, event.clientY);
    if (!point) return;
    current.active = true;
    setMarquee(normalizeRect(current.startU, point));
  };
  const finishMarquee = (event: React.PointerEvent<HTMLElement>) => {
    const current = marqueeRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    marqueeRef.current = null;
    setMarquee(null);
    const point = pagePointU(event.clientX, event.clientY);
    if (!current.active || !point) { current.onClick(); return; }
    if (!prepareAuthoringForContextChangeRef.current()) return;
    if (editorState.mode === 'table-grid') leaveTableGrid('');
    const inside = objectsInsideRect(selectedPage, normalizeRect(current.startU, point));
    const ids = [...new Set([...current.base, ...inside])];
    setEditorState((state) => ({ ...state, selectedObjectIds: ids, mode: 'select' }));
    setStatusMessage(inside.length === 0
      ? 'Nenhum objeto ficou inteiro dentro da caixa. Objetos travados não entram: destrave em Camadas.'
      : ids.length === 1 ? 'Um objeto selecionado.' : ids.length + ' objetos selecionados. Arraste um deles para mover todos juntos.');
  };
  const cancelMarquee = () => { marqueeRef.current = null; setMarquee(null); };
  /** Double click on a group: edit the text of the group that is under the pointer, where it is. */
  const editGroupedTextAt = (event: React.MouseEvent<HTMLElement>, group: Extract<EditorialObject, { type: 'group' }>) => {
    const point = pagePointU(event.clientX, event.clientY);
    const groupFrame = frameToU(group.frame);
    const texts = [...group.objects].reverse().filter((child) => child.type === 'text');
    const hit = point
      ? texts.find((child) => {
        const own = frameToU(child.frame);
        return point.xU >= groupFrame.xU + own.xU && point.xU <= groupFrame.xU + own.xU + own.widthU
          && point.yU >= groupFrame.yU + own.yU && point.yU <= groupFrame.yU + own.yU + own.heightU;
      })
      : texts[0];
    if (hit) startTextEdit(hit, group.id);
  };

  const beginGesture = (event: React.PointerEvent<HTMLElement>, clickedObject: EditorialObject, kind: GestureKind) => {
    if (event.button !== 0) return;
    pendingTextEditRef.current = null;
    collapseOnClickRef.current = null;
    event.preventDefault();
    event.stopPropagation();
    if (textEditRef.current) return;
    // What the pointer reaches: transparent parts of images and locked objects let the click through;
    // Alt+click goes to the next object below under the pointer.
    let object = clickedObject;
    let cycledStack: EditorialObject[] | undefined;
    const point = kind.type === 'move' ? pagePointU(event.clientX, event.clientY) : undefined;
    if (point && !(editorState.mode === 'table-grid' && selectedTableObject?.id === clickedObject.id)) {
      // Only objects from the one the browser hit downwards: what is above it on screen already had its chance.
      const stack = objectsAtPoint(selectedPage, point);
      const from = stack.findIndex((entry) => entry.id === clickedObject.id);
      if (from >= 0) {
        if (event.altKey) {
          object = nextObjectBelow(stack, selectedObjectId) ?? clickedObject;
          cycledStack = stack;
        } else {
          object = resolvePlainClickTarget(stack.slice(from), transparencyProbe, point) ?? clickedObject;
        }
      }
    }
    lastPointerTargetRef.current = { pageId: selectedPage.id, objectId: object.id };
    if (editorState.mode === 'table-grid') {
      if (selectedTableObject?.id === object.id) return;
      leaveTableGrid('');
    }
    if (cycledStack) {
      controller.cancel('superseded');
      selectObject(object.id);
      event.currentTarget.focus();
      const index = cycledStack.findIndex((entry) => entry.id === object.id);
      setStatusMessage(describeLayer(object, ' Objeto ' + (index + 1) + ' de ' + cycledStack.length + ' sob o ponteiro: Alt+clique de novo pega o de baixo.'));
      return;
    }
    if (kind.type === 'move' && multiSelectArmed) {
      controller.cancel('superseded');
      toggleObjectSelection(object.id);
      event.currentTarget.focus();
      return;
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
      if (isSecondActivation && event.detail >= 2) {
        controller.cancel('superseded');
        startTextEdit(object);
        return;
      }
      // A quick second press that turns into a drag moves the text (Onda 3.5, S03); released in place, it edits.
      if (isSecondActivation) pendingTextEditRef.current = { objectId: object.id, clientX: event.clientX, clientY: event.clientY };
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
    if (kind.type === 'move' && (event.ctrlKey || event.metaKey || event.shiftKey)) {
      controller.cancel('superseded');
      toggleObjectSelection(object.id);
      event.currentTarget.focus();
      return;
    }
    if (kind.type === 'resize' && object.type === 'group') return;
    // Dragging one of several selected objects moves all of them together (one undo step).
    const companions = kind.type === 'move' && editorState.selectedObjectIds.length > 1 && editorState.selectedObjectIds.includes(object.id)
      ? editorState.selectedObjectIds.filter((id) => id !== object.id)
      : [];
    const closureLockedId = objectClosureLockedId(object);
    if (closureLockedId && kind.type === 'move' && point && !groupHasLockedDescendant(object)) {
      // A locked object does not move: dragging on it draws a selection box; a click selects it (to unlock it).
      beginEmptyAreaPointer(event, () => {
        selectObject(object.id);
        setStatusMessage(describeLayer(object, ' Está travado: destrave pelo cadeado (aqui ou em Camadas) para mover.'));
      });
      return;
    }
    if (companions.length === 0) selectObject(object.id);
    collapseOnClickRef.current = companions.length > 0 ? object.id : null;
    event.currentTarget.focus();
    if (companions.some((id) => {
      const companion = selectedPage.objects.find((entry) => entry.id === id);
      return !companion || Boolean(objectClosureLockedId(companion));
    })) {
      setStatusMessage('Um dos objetos selecionados está travado. Destrave-o em Camadas para mover todos juntos.');
      return;
    }
    if (closureLockedId) {
      setStatusMessage(groupHasLockedDescendant(object)
        ? 'Este grupo contém um objeto interno bloqueado e não pode ser organizado nesta versão.'
        : 'Objeto bloqueado. Desbloqueie para mover ou redimensionar.');
      return;
    }
    const stage = event.currentTarget.closest('[data-vnext-page-stage]') as HTMLElement | null;
    const canonicalPage = stage?.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
    const rect = canonicalPage?.getBoundingClientRect();
    if (!rect) { startPendingTextEdit(); return; }
    try {
      const started = controller.begin({
        pointerId: event.pointerId, objectId: object.id, pageId: selectedPage.id, kind,
        clientX: event.clientX, clientY: event.clientY, pageClientWidthPx: rect.width, pageClientHeightPx: rect.height,
        snapThresholdPx: SNAP_RADIUS_PX, companionObjectIds: companions,
      });
      if (!started) {
        if (startPendingTextEdit()) return;
        setStatusMessage('Este objeto não pode ser movido agora.');
        return;
      }
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
      setStatusMessage(result.action.type === 'objects.move' ? 'Objetos movidos juntos.'
        : result.action.type === 'object.move' ? 'Objeto movido.' : 'Objeto redimensionado.');
    }
    else if (result.status === 'cancelled') setStatusMessage('Gesto cancelado porque o documento mudou.');
    else if (result.status === 'failed') setStatusMessage('A alteração final não pôde ser aplicada.');
  };

  const finishGesture = (event: React.PointerEvent<HTMLElement>) => {
    if (!controller.isActive()) return;
    const collapseTo = collapseOnClickRef.current;
    collapseOnClickRef.current = null;
    const pending = pendingTextEditRef.current;
    // Released within a few pixels (a double click, even a shaky one): edit the text, do not move it.
    if (pending && Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY) <= 6) {
      startPendingTextEdit();
      return;
    }
    pendingTextEditRef.current = null;
    try {
      const result = controller.finish(event.pointerId, event.clientX, event.clientY);
      // A click (no drag) on one of several selected objects keeps only that one selected.
      if (result.status === 'noop' && collapseTo) selectObject(collapseTo);
      describeFinish(result);
    }
    catch { controller.cancel('capture-loss'); setStatusMessage('Gesto cancelado.'); }
  };

  const cancelPointerGesture = () => { if (controller.cancel('pointercancel')) setStatusMessage('Gesto cancelado.'); };
  const cancelCaptureLoss = () => { if (controller.cancel('capture-loss')) setStatusMessage('Gesto cancelado.'); };

  const liveInspectorObject = (): EditorialObject | undefined => {
    const target = inspectorTargetRef.current;
    if (!target) return undefined;
    return session.getSnapshot().document.pages.find((page) => page.id === target.pageId)
      ?.objects.find((object) => object.id === target.objectId);
  };
  const resetInspectorDraft = () => {
    const frame = liveInspectorObject()?.frame ?? inspectorTargetRef.current?.expectedFrame;
    if (!frame) return;
    inspectorDraftRef.current = inspectorDraftFromFrame(frame);
    setInspectorDraft(inspectorDraftRef.current);
    persistence?.runtime.workspace.notifyDraftStateChanged();
  };
  /** Applies valid typed values ("12,5" or "12.5") and puts back invalid ones. Never leaves a blocking draft. */
  const settleInspectorDraft = (fields: readonly InspectorFrameField[] = INSPECTOR_FRAME_FIELDS) => {
    const object = liveInspectorObject();
    if (!object) { resetInspectorDraft(); return; }
    const plan = planInspectorDraft(inspectorDraftRef.current, object.frame, fields, { sizeLocked: object.type === 'group' });
    const errors = [...plan.errors];
    const { x, y, width, height } = plan.changes;
    if (x !== undefined || y !== undefined || width !== undefined || height !== undefined) {
      if (objectClosureLockedId(object)) {
        setStatusMessage('Objeto bloqueado. Desbloqueie para alterar a posição ou o tamanho.');
      } else {
        controller.cancel('superseded');
        const current = frameToU(object.frame);
        let action: ApplicationAction | undefined;
        try {
          action = width !== undefined || height !== undefined
            ? { type: 'object.resize', objectId: object.id, xU: x === undefined ? current.xU : mmToU(x), yU: y === undefined ? current.yU : mmToU(y), widthU: width === undefined ? current.widthU : mmToU(width), heightU: height === undefined ? current.heightU : mmToU(height) }
            : { type: 'object.move', objectId: object.id, xU: x === undefined ? current.xU : mmToU(x), yU: y === undefined ? current.yU : mmToU(y) };
        } catch {
          errors.push({ field: fields.find((field) => plan.changes[field] !== undefined) ?? 'x', message: INSPECTOR_INVALID_NUMBER_MESSAGE });
        }
        if (action) {
          const result = session.execute(action);
          setStatusMessage(result.ok ? 'Posição e tamanho atualizados.' : 'Não foi possível alterar a posição ou o tamanho. O valor anterior foi mantido.');
        }
      }
    }
    setInspectorFieldError(errors[0] ? { objectId: object.id, ...errors[0], frame: liveInspectorObject()?.frame ?? object.frame } : null);
    settleNoticeRef.current = errors[0] ? inspectorDiscardedNotice(errors[0]) : null;
    if (errors[0]) setStatusMessage(inspectorErrorStatus(errors[0]));
    resetInspectorDraft();
  };
  /** Leaving a field settles every typed field at once (one coherent change), so none is silently dropped. */
  const commitInspector = () => {
    if (!inspectorDraftIsPending()) { resetInspectorDraft(); return; } // "88.0" means 88: just show "88".
    if (!finishCellDraftForContextChange()) return;
    if (textEditRef.current && !commitTextEdit()) return;
    if (!applyTableTitleDraft().ok) return;
    settleInspectorDraft();
  };
  const revertInspectorField = (field: InspectorFrameField) => {
    setInspectorFieldError(null);
    settleNoticeRef.current = null;
    if (!inspectorDraftIsPending()) return;
    resetInspectorDraft();
    setStatusMessage(`${inspectorFieldLabel(field)}: valor anterior restaurado.`);
  };

  const runObjectShortcut = (shortcut: Exclude<EditorShortcut, { type: 'save' }>) => {
    if (shortcut.type === 'duplicate') {
      duplicateSelected();
      return;
    }
    if (!finishTextEditBeforeCommand()) return;
    const page = session.getSnapshot().document.pages.find((entry) => entry.id === editorState.activePageId);
    if (!page) return;
    const ids = editorState.selectedObjectIds;
    const plan = shortcut.type === 'delete' ? planKeyboardDelete(page, ids) : planKeyboardNudge(page, ids, shortcut.dxMm, shortcut.dyMm);
    if (!plan.ok) {
      if (plan.reason === 'LOCKED') setStatusMessage(`Objeto bloqueado. Desbloqueie para ${shortcut.type === 'delete' ? 'excluir' : 'mover'}.`);
      return;
    }
    controller.cancel('superseded');
    const transactionId = `teclado:${shortcut.type}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const ok = plan.actions.every((action) => session.execute(action, { transactionId }).ok);
    if (shortcut.type === 'delete' && ok) setEditorState((current) => ({ ...current, selectedObjectIds: [] }));
    const many = plan.actions.length > 1;
    setStatusMessage(!ok
      ? `Não foi possível ${shortcut.type === 'delete' ? 'excluir' : 'mover'} ${many ? 'todos os objetos' : 'o objeto'}.`
      : shortcut.type === 'delete' ? `${many ? 'Objetos excluídos' : 'Objeto excluído'}. Para recuperar, use Desfazer.` : (many ? 'Objetos movidos.' : 'Objeto movido.'));
  };

  // Ctrl+S saves the catalog anywhere in the editor and never opens the browser's "Save page as".
  // When focus fell to the page body (e.g. the deleted object had it), only Ctrl+Z/Ctrl+Y still work:
  // Delete, arrows and Ctrl+D act only from an object on the page (see cancelOnRootKey).
  const windowShortcutRef = React.useRef<(event: KeyboardEvent) => void>(() => undefined);
  windowShortcutRef.current = (event) => {
    if (resolveEditorShortcut(event, { typingInField: true, mode: 'select', hasSelection: false })?.type === 'save') {
      event.preventDefault();
      if (event.repeat) return;
      if (!persistence) setStatusMessage('Este rascunho fica só nesta aba e não é salvo.');
      else if (persistence.save.phase === 'saving') setStatusMessage('Salvando… aguarde um instante.');
      else if (persistence.save.canSave) void persistence.runtime.manualSave();
      else setStatusMessage(persistence.save.phase === 'idle' ? 'Não é possível salvar agora.' : fatherSaveExplanation(persistence.save));
      return;
    }
    const doc = window.document;
    if ((event.target !== doc.body && event.target !== doc.documentElement) || doc.querySelector('[aria-modal="true"]')) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
      event.preventDefault();
      if (key === 'y' || event.shiftKey) redo(); else undo();
    }
  };
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => windowShortcutRef.current(event);
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const objectPreviewFrame = (object: EditorialObject): FrameU => {
    if (preview?.objectId === object.id && preview.pageId === selectedPage.id) return preview.frameU;
    const companion = preview?.pageId === selectedPage.id ? preview.companions?.find((entry) => entry.objectId === object.id) : undefined;
    if (companion) return companion.frameU;
    return frameToU(object.frame);
  };
  const selectionBoxes: SelectionBox[] = selectedPage.objects
    .filter((object) => !object.hidden && editorState.selectedObjectIds.includes(object.id))
    .map((object) => ({
      object,
      frameU: objectPreviewFrame(object),
      resizable: object.type !== 'group' && editorState.mode === 'select' && editorState.selectedObjectIds.length === 1 && !objectClosureLockedId(object),
      previewing: preview?.objectId === object.id || Boolean(preview?.companions?.some((entry) => entry.objectId === object.id)),
    }));

  const cancelOnRootKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const isNativeInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      || target.getAttribute(['content', 'editable'].join('')) === 'true';
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && cellDraftRef.current) {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && cellDraftRef.current) {
      event.preventDefault();
      event.stopPropagation();
      redo();
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
        // Like PowerPoint: Esc leaves the text box keeping what was typed ("Cancelar" discards).
        event.preventDefault();
        event.stopPropagation();
        commitTextEdit();
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
        if (navigation.exited && event.key === 'Tab' && !event.shiftKey) {
          // FR-30, as in Excel: Tab on the last cell adds a row, also when the cell is only selected.
          const rows = selectedTableObject.table.rows;
          runGridCommand({ type: 'insert', axis: 'row', position: 'after', referenceAxisId: rows[rows.length - 1].id, selectFirstCell: true });
        } else if (navigation.exited) {
          leaveTableGrid('Fim da grade; manipulação do objeto restaurada.');
        } else {
          tableSelectionRef.current = navigation.selection;
          tableHistoryContextRef.current = { table: selectedTableObject.table, selection: navigation.selection };
          setTableSelection(navigation.selection);
        }
        return;
      }
    }
    // Only an object on the page (focused by clicking it) takes Delete, arrows and Ctrl+D;
    // buttons, the page list and the side panels never act on the selection.
    const shortcut = resolveEditorShortcut(event, {
      typingInField: !isCanvasKeyboardTarget(target),
      mode: editorState.mode,
      hasSelection: editorState.selectedObjectIds.length > 0,
    });
    if (shortcut && shortcut.type !== 'save') {
      event.preventDefault();
      runObjectShortcut(shortcut);
      return;
    }
    if (event.key === 'Enter' && selectedObject?.type === 'text') {
      if (!['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(target.tagName)) {
        event.preventDefault();
        startTextEdit(selectedObject);
        return;
      }
    }
    if (event.key === 'Enter' && selectedObject?.type === 'table' && !isNativeInput && !target.closest('button, a[href]')) {
      event.preventDefault();
      startTableGrid(selectedObject);
      return;
    }
    if (event.key === 'Escape' && controller.cancel('escape')) {
      event.preventDefault();
      setStatusMessage('Gesto cancelado.');
      return;
    }
    if (event.key === 'Escape' && marqueeRef.current) {
      event.preventDefault();
      cancelMarquee();
      return;
    }
    // Esc on the page (or in "Camadas") lets go of the selection.
    if (event.key === 'Escape' && editorState.mode === 'select' && editorState.selectedObjectIds.length > 0
        && !isNativeInput && (isCanvasKeyboardTarget(target) || target.closest('[data-layers-panel]') || target === globalThis.document.body)) {
      event.preventDefault();
      setEditorState((current) => ({ ...current, selectedObjectIds: [] }));
      setStatusMessage('Seleção desfeita.');
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
      if (selectedTableObject && target.closest('[data-editor-action="toggle-object-lock"]')) return;
      if (!finishCellDraftForContextChange()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (textEditRef.current) {
      if (target.closest('[data-text-edit-session]')) return;
      if (target.closest('[data-persistence-save-action]')) return;
      if (target.closest('[data-editor-action="undo"], [data-editor-action="redo"]')) return;
      if (!commitTextEdit()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (tableTitleDraftRef.current) {
      if (target.closest('[data-table-title-session]')) return;
      if (target.closest('[data-persistence-save-action]')) return;
      if (target.closest('[data-editor-action="undo"], [data-editor-action="redo"]')) return;
      const titleResult = applyTableTitleDraft();
      if (!titleResult.ok) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    // Clicking away from a position/size field applies a valid value and puts
    // back an invalid one (with a visible message). It never blocks the click.
    if (inspectorDraftIsPending() && !target.closest('[data-inspector-authoring]')) settleInspectorDraft();
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
    if (!inspectorDraftIsPending()
      && (cellDraftRef.current || textEditRef.current || tableTitleDraftRef.current)) {
      setStatusMessage('Conclua a autoria atual antes de editar a geometria.');
      return;
    }
    const next = { ...inspectorDraftRef.current, [field]: value };
    inspectorDraftRef.current = next;
    setInspectorDraft(next);
    if (inspectorFieldError?.field === field) setInspectorFieldError(null);
    settleNoticeRef.current = null;
    persistence?.runtime.workspace.notifyDraftStateChanged();
  };

  const selectedCellsById = selectedTableObject && tableSelection
    ? new Map(selectedTableObject.table.cells.map((cell) => [cell.id, cell]))
    : undefined;
  const selectedAnchorCells = selectedTableObject && tableSelection
    ? selectedTableAnchorIds(selectedTableObject.table, tableSelection)
      .map((cellId) => selectedCellsById?.get(cellId))
      .filter((cell): cell is Cell => Boolean(cell))
    : [];
  const selectedSemanticCell = selectedAnchorCells.length === 1 && !selectedAnchorCells[0].coveredBy
    ? selectedAnchorCells[0]
    : undefined;
  React.useEffect(() => {
    const image = selectedSemanticCell?.content.type === 'image'
      ? selectedSemanticCell.contentPresentation?.image
      : undefined;
    setImageCellAssetChoice(selectedSemanticCell?.content.type === 'image' ? selectedSemanticCell.content.assetId : '');
    setImageCellFit(image?.fit ?? 'contain');
    setImageCellWidthMm(String(image?.targetWidthMm ?? DEFAULT_IMAGE_CELL_WIDTH_U / 10_000));
    setImageCellHeightMm(String(image?.targetHeightMm ?? DEFAULT_IMAGE_CELL_HEIGHT_U / 10_000));
  }, [
    selectedSemanticCell?.id,
    selectedSemanticCell?.content,
    selectedSemanticCell?.contentPresentation?.image,
  ]);
  const commonWrapPolicy = selectedAnchorCells.length > 0
    && selectedAnchorCells.every((cell) => cell.contentPresentation?.wrapPolicy === selectedAnchorCells[0].contentPresentation?.wrapPolicy)
    ? selectedAnchorCells[0].contentPresentation?.wrapPolicy
    : undefined;
  const tableStyleScope: TableStyleScope | undefined = selectedTableObject
    ? tableStyleRoleScope
      ? { kind: 'role', role: tableStyleRoleScope }
      : tableSelection
        ? defaultStyleScopeFromSelection(selectedTableObject.table, tableSelection)
        : { kind: 'table' }
    : undefined;
  const tableStyleDisabledReason = tableStyleDisabledGuidance(Boolean(cellDraft), Boolean(selectedTableObject?.locked));
  const tableStyleDisabled = tableStyleDisabledReason !== undefined;
  const tableStyleDisabledReasonId = tableStyleDisabled && selectedTableObject
    ? `table-style-disabled-${selectedTableObject.id}`
    : undefined;
  const tableSemanticDisabledReason = tableSemanticDisabledGuidance(Boolean(cellDraft), Boolean(selectedTableObject?.locked));
  const tableSemanticDisabled = tableSemanticDisabledReason !== undefined;
  const tableSemanticDisabledReasonId = tableSemanticDisabled && selectedTableObject
    ? `table-semantic-disabled-${selectedTableObject.id}`
    : undefined;

  const currentSelectedTableForPresentation = (): {
    document: CatalogDocument;
    pageId: string;
    object: TableObject;
    scope: TableStyleScope;
  } | undefined => {
    if (!selectedObjectId) return undefined;
    const liveDocument = session.getSnapshot().document;
    const page = liveDocument.pages.find((entry) => entry.id === editorState.activePageId);
    const object = page?.objects.find((entry): entry is TableObject =>
      entry.id === selectedObjectId && entry.type === 'table'
    );
    if (!object) return undefined;
    const selection = tableSelectionRef.current;
    const scope = tableStyleRoleScope
      ? { kind: 'role' as const, role: tableStyleRoleScope }
      : selection
        && selection.identity.pageId === page!.id
        && selection.identity.objectId === object.id
        && selection.identity.tableId === object.table.id
        ? defaultStyleScopeFromSelection(object.table, selection)
        : { kind: 'table' as const };
    return { document: liveDocument, pageId: page!.id, object, scope };
  };

  const tableStyleActionMessage = (code: string): string => {
    if (code === 'TARGET_STALE') return 'A apresentação mudou enquanto a ação era preparada. Nada foi alterado.';
    if (code === 'OBJECT_LOCKED') return 'Tabela bloqueada não pode ser alterada.';
    if (code === 'ACTION_INVALID') return 'A apresentação solicitada não é válida para os recursos atuais do documento.';
    return 'Não foi possível alterar a apresentação da tabela com segurança.';
  };

  const executeTableStyleAction = (action: ApplicationAction, successMessage: string): boolean => {
    if (cellDraftRef.current || editorState.mode === 'cell-edit') {
      setStatusMessage('Conclua ou cancele a edição da célula para alterar a apresentação da tabela.');
      return false;
    }
    const result = session.execute(action);
    if (!result.ok) {
      setStatusMessage(tableStyleActionMessage(result.error.code));
      return false;
    }
    setStatusMessage(result.metadata.changed ? successMessage : 'Sem alterações.');
    return result.metadata.changed;
  };

  const runTableStylePatch = (patch: CellStylePatch) => {
    const live = currentSelectedTableForPresentation();
    if (!live) return;
    const identity = tableSelectionIdentity(live.pageId, live.object.id, live.object.table.id);
    try {
      executeTableStyleAction(
        prepareStyleAction(identity, live.object.table, live.scope, patch),
        'Apresentação atualizada.'
      );
    } catch {
      setStatusMessage('Não foi possível preparar a alteração de apresentação.');
    }
  };

  const runTableBorderPreset = (preset: BorderQuickPreset) => {
    const live = currentSelectedTableForPresentation();
    if (!live) return;
    const identity = tableSelectionIdentity(live.pageId, live.object.id, live.object.table.id);
    const color = live.document.style.palette[0] ?? '#172033';
    try {
      if (live.scope.kind === 'cells') {
        executeTableStyleAction(
          prepareCellBorderPresetAction(identity, live.object.table, live.scope.cellIds, preset, color),
          'Bordas atualizadas.'
        );
        return;
      }
      if (preset === 'outer' || preset === 'inner') {
        setStatusMessage('Selecione células para aplicar bordas Externas ou Internas.');
        return;
      }
      executeTableStyleAction(
        prepareStyleAction(identity, live.object.table, live.scope, simpleBorderQuickPatch(preset, color)),
        'Bordas atualizadas.'
      );
    } catch {
      setStatusMessage('Não foi possível preparar esta configuração de borda.');
    }
  };

  /** FR-33 "Estilo": a preset, a switch or the text size, as one undo step built from existing actions. */
  const runTableLook = (request: TableLookRequest, successMessage: string) => {
    const live = currentSelectedTableForPresentation();
    if (!live) return;
    if (cellDraftRef.current || editorState.mode === 'cell-edit') {
      setStatusMessage('Conclua ou cancele a edição da célula para alterar a apresentação da tabela.');
      return;
    }
    const steps = tableLookSteps(request, projectTableLook(live.object.table, live.document.style), live.document.style);
    const outcome = runTableSteps(session, { pageId: live.pageId, objectId: live.object.id }, steps, newTableTransactionId());
    if (!outcome.ok) setStatusMessage(tableStyleActionMessage(outcome.code));
    else setStatusMessage(outcome.changed ? successNotice(successMessage) : 'Sem alterações.');
  };

  const runAnnotationGap = (annotationGapMm: number) => {
    const live = currentSelectedTableForPresentation();
    if (!live || live.scope.kind !== 'table') return;
    const identity = tableSelectionIdentity(live.pageId, live.object.id, live.object.table.id);
    executeTableStyleAction(
      prepareAnnotationGapAction(identity, live.object.table, annotationGapMm),
      'Espaçamento de notas/legenda atualizado.'
    );
  };

  const selectedRowAxisIds = selectedTableObject && tableSelection
    ? explicitTableAxisIds(selectedTableObject.table, tableSelection, 'row')
    : [];
  const selectedColumnAxisIds = selectedTableObject && tableSelection
    ? explicitTableAxisIds(selectedTableObject.table, tableSelection, 'column')
    : [];
  const selectedRowDimensionKey = selectedRowAxisIds.join('\u0000');
  // FR-34: the bar above the page and "Estrutura" share one rule (rows and columns of the selected cell or range).
  const tableStructure = selectedTableObject
    ? tableStructureAvailability(selectedTableObject.table, tableSelection, editorState.mode === 'cell-edit')
    : undefined;
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
    if (code === 'TARGET_STALE') return 'A tabela mudou enquanto a alteração era preparada. Nada foi alterado.';
    if (code === 'TABLE_WIDTH_INFEASIBLE' || code === 'COLUMN_LIMIT_INVALID') return 'As larguras e limites atuais não cabem na largura da tabela.';
    if (code === 'COLUMN_WEIGHT_INVALID') return 'A proporção da largura deve ser um número inteiro maior que zero.';
    if (code === 'MERGE_INTERSECTION') return 'Esta mudança cruza uma célula mesclada. Desfaça a mesclagem antes de mover a linha ou coluna.';
    if (code === 'MERGE_HEADER_BOUNDARY') return 'Esta alteração faria uma célula mesclada cruzar cabeçalho e corpo.';
    if (code === 'OBJECT_LOCKED') return 'Tabela bloqueada não pode ser alterada.';
    if (code === 'AXIS_ORDER_INVALID') return 'A nova ordem de linhas ou colunas é inválida.';
    return 'Não foi possível aplicar esta alteração na tabela. Nada foi alterado.';
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
      if (!Number.isSafeInteger(value)) { setStatusMessage('A proporção da largura deve ser um número inteiro maior que zero.'); return; }
      runColumnProperties({ width: { mode: 'flex', weight: value } }, 'Proporção da largura atualizada.');
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
      setStatusMessage(error instanceof TableDimensionAuthoringError ? error.message : 'Não foi possível mover a linha ou coluna.');
    }
  };
  const runColumnBoundaryDrag = (leftColumnIndex: number, deltaU: number) => {
    const live = currentSelectedTableForStructure();
    const identity = dimensionIdentity();
    if (!live || !identity) return;
    try {
      executeTableDimensionAction(
        prepareColumnBoundaryDrag(
          identity, live.object.table, frameToU(live.object.frame).widthU, live.object.frame.widthMm,
          leftColumnIndex, deltaU
        ),
        'Larguras adjacentes atualizadas.'
      );
    } catch (error) {
      setStatusMessage(error instanceof TableDimensionAuthoringError ? error.message : 'Não foi possível ajustar o limite da coluna.');
    }
  };
  const runRowBoundaryDrag = (rowIndex: number, deltaU: number) => {
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
        prepareRowBoundaryDrag(identity, live.object.table, row.id, resolvedHeightU, deltaU),
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
  const goToIssue = useIssueNavigation({ document, request: locateRequest, prepare: () => prepareAuthoringForContextChangeRef.current(),
    // FR-17: a problem chosen on purpose shows "Propriedades", where its list opens (the assistant stays mounted).
    locate: (target) => { setAssistantOpen(false); locateLayoutDiagnostic(target); },
    showPage: setActivePage, openDiagnostics: () => setDiagnosticsOpen(true), announce: setStatusMessage,
    selectedObjectId, selectedHasProblems: projectedSelectedDiagnostics.length > 0 });

  return (
    <>
    <div
      className="vnext-shell"
      data-vnext-shell=""
      data-simple-by-default={simpleByDefault ? 'true' : undefined}
      data-assistant-open={assistantOpen ? 'true' : undefined}
      data-assistant-wide={assistantOpen && assistantWide ? 'true' : undefined}
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
            <div className="vnext-title-row"><CatalogTitleButton session={session} title={document.title} /></div>
            {simpleByDefault && persistence && <SaveSummary save={persistence.save} />}
            {persistence && <LibraryNavigationNotice runtime={persistence.runtime} />}
          </div>
        </div>
        <div className="vnext-actions" aria-label="Ações do documento">
          {simpleByDefault && <button
            type="button" className="vnext-action-assistant" data-editor-action="assistant-toggle"
            aria-controls="vnext-assistant-chat" aria-expanded={assistantOpen}
            aria-label={assistantOpen ? 'Fechar assistente de edição' : 'Abrir assistente de edição'}
            onClick={() => setAssistantOpen(value => !value)}
          ><span aria-hidden="true">✦</span><span>{assistantOpen ? 'Fechar assistente' : 'Assistente IA'}</span></button>}
          {persistence && onRequestLibrary && (
            <button
              type="button"
              className="vnext-action-library"
              data-editor-action="library"
              data-authoring-context-transition=""
              onClick={onRequestLibrary}
              aria-label="Voltar aos catálogos"
            >
              <FolderOpen size={17} aria-hidden="true" />
              <span>{LIBRARY_BUTTON_LABEL}</span>
            </button>
          )}
          {persistence && (
            <button
              type="button"
              className="vnext-action-save"
              data-editor-action="save"
              data-persistence-save-action=""
              onClick={() => { void persistence.runtime.manualSave(); }}
              disabled={!persistence.save.canSave || persistence.save.phase === 'saving'}
              aria-label={fatherSaveLabel(persistence.save.label)}
            >
              <SaveIcon size={17} aria-hidden="true" />
              <span>{simpleByDefault ? 'Salvar' : fatherSaveLabel(persistence.save.label)}</span>
            </button>
          )}
          <span className="vnext-history-actions" aria-label="Histórico de alterações">
            <button type="button" data-editor-action="undo" data-authoring-context-transition="" onClick={undo} disabled={!canUndo && !cellDraft && !textEdit && !tableTitleDraft && !inspectorDraftIsPending()} aria-label="Desfazer última alteração"><Undo2 size={17} aria-hidden="true" /><span>Desfazer</span></button>
            <button type="button" data-editor-action="redo" data-authoring-context-transition="" onClick={redo} disabled={!canRedo && !cellDraft && !textEdit && !tableTitleDraft && !inspectorDraftIsPending()} aria-label="Refazer última alteração"><Redo2 size={17} aria-hidden="true" /><span>Refazer</span></button>
          </span>
          {onRequestTranslation && <button type="button" className="vnext-action-translate" data-editor-action="translate" data-authoring-context-transition=""
            onClick={() => { if (prepareAuthoringForContextChangeRef.current()) onRequestTranslation(); }}>Traduzir</button>}
          {onRequestPublication && <PublishAction prepare={() => prepareAuthoringForContextChangeRef.current()} onOpen={onRequestPublication} onMessage={setStatusMessage}
            save={persistence && { phase: persistence.save.phase, run: () => persistence.runtime.manualSave() }} />}
        </div>
      </header>
      <EditorNotices message={statusMessage} onDismissMessage={() => setStatusMessage(null)}
        save={persistence?.save} localProtectionUnavailable={persistence?.localProtection === 'unavailable'} />

      <div className="vnext-workspace">
        <PagePanel pages={document.pages} currentPageId={selectedPage.id} session={session}
          prepareForChange={() => { if (!prepareAuthoringForContextChangeRef.current()) return false; controller.cancel('superseded'); return true; }}
          onSelectPage={setActivePage} onAddPage={addPage} onStatus={(message) => setStatusMessage(withSettleNotice(message))}
          thumbnails={{ document, assetUrls: persistence?.assetUrls ?? W2C_DEMO_ASSET_URLS }}>
          {simpleByDefault && (
            <button
              type="button"
              className="vnext-page-reuse-toggle"
              data-editor-action="toggle-page-reuse"
              aria-expanded={pageReuseOpen}
              aria-controls="vnext-page-reuse"
              onClick={() => setPageReuseOpen((open) => !open)}
            >
              {pageReuseOpen ? 'Ocultar modelos' : 'Usar modelo…'}
            </button>
          )}
          {pageReuseOpen && (
            <div id="vnext-page-reuse" className="vnext-page-reuse">
              {officialPageReuse && <PageTemplateGallery value={pageTemplateChoice} onChange={setPageTemplateChoice} disabled={pageTemplateBusy} onClose={simpleByDefault ? () => setPageReuseOpen(false) : undefined} />}
              <button type="button" className="vnext-page-reuse-action" data-editor-action="insert-template" data-authoring-context-transition="" onClick={() => { void insertPageTemplate(); }} disabled={pageTemplateBusy} aria-label="Inserir modelo após a página atual"><Plus size={17} aria-hidden="true" />{pageTemplateBusy ? 'Preparando imagem…' : 'Inserir modelo'}</button>
            </div>
          )}
        </PagePanel>

        <main className="vnext-canvas-area">
          <CanvasHeader pageNumber={selectedPageIndex + 1} pageCount={document.pages.length} pageWidthMm={selectedPage.widthMm}
            issues={{ document, diagnostics: canonicalDiagnostics, simple: simpleByDefault, onLocate: goToIssue, session,
              measurement: measuredLayout?.source === document ? measuredLayout : null,
              prepare: () => prepareAuthoringForContextChangeRef.current(), onMessage: setStatusMessage }}
            memoryStatus={simpleByDefault ? undefined : persistence ? fatherSaveLabel(persistence.save.label) : 'Rascunho nesta aba'}
            pageActions={<button type="button" className="vnext-show-layers" data-editor-action="show-layers" onClick={showLayers}
              title="Lista de todos os objetos da página: selecionar, esconder, travar e mudar a ordem"><Layers size={16} aria-hidden="true" />Camadas</button>} />
          <div className="vnext-authoring-toolbar" aria-label="Ferramentas de edição">
            <div className="vnext-tool-group vnext-toolbar-primary" aria-label="Adicionar conteúdo">
              <button type="button" data-editor-action="add-text" onClick={() => insertObject('text')}>{simpleByDefault ? 'Texto' : 'Adicionar texto'}</button>
              <button type="button" data-editor-action="add-image" onClick={() => insertObject('image')}>{simpleByDefault ? 'Imagem' : 'Adicionar imagem'}</button>
              <button type="button" data-editor-action="add-table" onClick={() => insertObject('table')}>{simpleByDefault ? 'Tabela' : 'Adicionar tabela'}</button>
              <button type="button" className="vnext-more-options" data-editor-action="new-table-size" aria-expanded={newTableSizeOpen} aria-controls="vnext-new-table-size" onClick={() => setNewTableSizeOpen((open) => !open)}>Tamanho da nova tabela</button>
              <button type="button" data-editor-action="paste-table-from-excel" aria-expanded={pasteTableAreaOpen} aria-controls="vnext-paste-table-area" onClick={() => setPasteTableAreaOpen((open) => !open)}>Colar tabela do Excel</button>
              {(!simpleByDefault || selectedObjects.length > 0) && (
                <>
                  <button type="button" data-editor-action="duplicate" disabled={selectedObjects.length === 0 || selectedHasLockedClosure} onClick={duplicateSelected}>Duplicar</button>
                  <button type="button" data-editor-action="delete" disabled={selectedObjects.length === 0 || selectedHasLockedClosure} onClick={deleteSelected}>Excluir</button>
                </>
              )}
              {(!simpleByDefault || selectedObject?.type === 'text') && (
                <button type="button" data-editor-action="edit-text" disabled={selectedObject?.type !== 'text' || selectedMutationLocked || projectEditableRichText(selectedObject.text) === null} onClick={() => selectedObject && startTextEdit(selectedObject)}>Editar texto</button>
              )}
              {(!simpleByDefault || selectedObject?.type === 'table') && (
                <button type="button" data-editor-action="edit-table" disabled={selectedObject?.type !== 'table' || selectedMutationLocked} onClick={() => selectedObject && startTableGrid(selectedObject)}>Editar tabela</button>
              )}
            </div>
            {simpleByDefault && (
              <button
                type="button"
                className="vnext-more-options"
                data-editor-action="toggle-advanced-tools"
                aria-expanded={advancedToolsOpen}
                aria-controls="vnext-advanced-tools"
                onClick={() => setAdvancedToolsOpen((open) => !open)}
              >
                {advancedToolsOpen ? 'Ocultar opções' : 'Mais opções'}
              </button>
            )}
            {advancedToolsOpen && (
              <div id="vnext-advanced-tools" className="vnext-toolbar-advanced" data-advanced-tools="">
                <div className="vnext-tool-group" aria-label="Adicionar elementos avançados">
                  <button type="button" data-editor-action="add-shape" onClick={() => insertObject('shape')}>{simpleByDefault ? 'Forma' : 'Adicionar forma'}</button>
                  <button type="button" data-editor-action="add-line" onClick={() => insertObject('line')}>{simpleByDefault ? 'Linha' : 'Adicionar linha'}</button>
                </div>
                <div className="vnext-tool-group" aria-label="Seleção e posicionamento">
                  <button type="button" data-editor-action="toggle-snapping" aria-pressed={snappingEnabled} className={snappingEnabled ? 'is-active' : undefined} onClick={toggleSnapping}>
                    {simpleByDefault ? (snappingEnabled ? 'Encaixe ligado' : 'Encaixe desligado') : (snappingEnabled ? 'Encaixe: ligado' : 'Encaixe: desligado')}
                  </button>
                  <button
                    type="button"
                    data-editor-action="toggle-multi-select"
                    aria-pressed={multiSelectArmed}
                    className={multiSelectArmed ? 'is-active' : undefined}
                    disabled={editorState.mode !== 'select'}
                    onClick={() => {
                      controller.cancel('superseded');
                      setMultiSelectArmed((armed) => !armed);
                      setStatusMessage(multiSelectArmed ? 'Seleção múltipla desativada.' : 'Selecione os objetos que deseja organizar.');
                    }}
                  >Selecionar vários</button>
                </div>
                <div className="vnext-tool-group" aria-label="Organização avançada">
                  <button type="button" data-editor-action="group" disabled={editorState.selectedObjectIds.length < 2} onClick={groupSelected}>Agrupar</button>
                  <button type="button" data-editor-action="ungroup" disabled={selectedObject?.type !== 'group' || selectedMutationLocked} onClick={ungroupSelected}>Desagrupar</button>
                  <button type="button" data-editor-action="send-back" disabled={!selectedObject || selectedMutationLocked || selectedVisualIndex <= 0} onClick={() => reorderSelected('back')}>{simpleByDefault ? 'Enviar ao fundo' : 'Enviar para o fundo'}</button>
                  <button type="button" data-editor-action="send-backward" disabled={!selectedObject || selectedMutationLocked || selectedVisualIndex <= 0} onClick={() => reorderSelected('backward')}>{simpleByDefault ? 'Recuar camada' : 'Recuar uma camada'}</button>
                  <button type="button" data-editor-action="bring-forward" disabled={!selectedObject || selectedMutationLocked || selectedVisualIndex < 0 || selectedVisualIndex >= selectedVisualOrder.length - 1} onClick={() => reorderSelected('forward')}>{simpleByDefault ? 'Avançar camada' : 'Avançar uma camada'}</button>
                  <button type="button" data-editor-action="bring-front" disabled={!selectedObject || selectedMutationLocked || selectedVisualIndex < 0 || selectedVisualIndex >= selectedVisualOrder.length - 1} onClick={() => reorderSelected('front')}>{simpleByDefault ? 'Trazer à frente' : 'Trazer para frente'}</button>
                  <button type="button" data-editor-action="replace-image" disabled={selectedObject?.type !== 'image' || selectedMutationLocked} onClick={replaceSelectedImage}>Substituir imagem</button>
                  <button type="button" data-editor-action="upload-image" disabled={selectedObject?.type !== 'image' || selectedMutationLocked} onClick={replaceSelectedImage}>{simpleByDefault ? 'Enviar imagem' : 'Upload imagem'}</button>
                </div>
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              data-editor-action="upload-image-input"
              accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
              style={{ display: 'none' }}
              onChange={handleImageFileChange}
              aria-hidden="true"
            />
          </div>

          {newTableSizeOpen && (
            <div id="vnext-new-table-size" className="vnext-new-table-size" role="region" aria-label="Tamanho da nova tabela">
              <label>Linhas <input type="number" aria-label="Linhas da nova tabela" min="1" max={MAX_NEW_TABLE_ROWS} step="1" value={newTableRows} onChange={(event) => setNewTableRows(event.target.value)} /></label>
              <label>Colunas <input type="number" aria-label="Colunas da nova tabela" min="1" max={MAX_NEW_TABLE_COLUMNS} step="1" value={newTableColumns} onChange={(event) => setNewTableColumns(event.target.value)} /></label>
              <p>Escolha o tamanho e clique em {simpleByDefault ? 'Tabela' : 'Adicionar tabela'}. Tabelas extensas precisam ser organizadas em várias páginas; a criação não divide o conteúdo automaticamente.</p>
            </div>
          )}

          {pasteTableAreaOpen && (
            <PasteTableArea onCreate={(text, header) => createTableFromText(text, header)} onCancel={() => setPasteTableAreaOpen(false)} />
          )}

          {pasteGrowOffer && editorState.mode === 'table-grid' && selectedTableObject?.id === pasteGrowOffer.objectId && (
            <PasteGrowOffer label={pasteGrowOffer.label} onConfirm={runGrowAndPaste} onCancel={() => setPasteGrowOffer(null)} />
          )}

          {(editorState.mode === 'table-grid' || editorState.mode === 'cell-edit') && selectedTableObject && !selectedTableObject.locked && (
            <TableGridToolbar
              simple={simpleByDefault} mode={editorState.mode} tableSelection={tableSelection}
              tableOptionsOpen={tableOptionsOpen} setTableOptionsOpen={setTableOptionsOpen}
              rowAxisReason={tableStructure?.rowReason} columnAxisReason={tableStructure?.columnReason}
              rowAxisCount={tableStructure?.rowIds.length} columnAxisCount={tableStructure?.columnIds.length}
              removeRowReason={tableStructure?.removeRowReason} removeColumnReason={tableStructure?.removeColumnReason}
              runTableAxisInsert={runTableAxisInsert} runTableAxisRemove={runTableAxisRemove}
              tableRowsToInsert={tableRowsToInsert} setTableRowsToInsert={setTableRowsToInsert}
              currentMergeEligibility={currentMergeEligibility} currentUnmergeEligibility={currentUnmergeEligibility}
              runTableMerge={runTableMerge} runTableUnmerge={runTableUnmerge}
              tableRangeExtensionArmed={tableRangeExtensionArmed} toggleTableRangeExtension={toggleTableRangeExtension}
              runTableBulkClear={runTableBulkClear} setMarkerPanelOpen={setMarkerPanelOpen} runVisibleTableCopy={runVisibleTableCopy}
              setTablePasteFallbackOpen={setTablePasteFallbackOpen} leaveTableGrid={leaveTableGrid}
            />
          )}

          {tablePasteFallbackOpen && editorState.mode === 'table-grid' && selectedTableObject && !selectedTableObject.locked && (
            <TableGridPasteFallback tablePasteFallbackText={tablePasteFallbackText} setTablePasteFallbackText={setTablePasteFallbackText}
              setTablePasteFallbackOpen={setTablePasteFallbackOpen} applyNativePasteFallback={applyNativePasteFallback} />
          )}

          <div className="vnext-document-preview" tabIndex={-1} data-table-auto-fit={pendingTableFit ? 'pending' : undefined} aria-label={'Editor da página ' + (selectedPageIndex + 1)}
            onPointerDown={(event) => {
              // The grey margin around the page: a click deselects, a drag draws a selection box (covers that fill the page).
              if (event.button !== 0 || event.target !== event.currentTarget) return;
              if (textEditRef.current || editorState.mode === 'cell-edit') return;
              beginEmptyAreaPointer(event);
            }}>
            <div ref={pageStageRef} className="vnext-page-stage" data-vnext-page-stage="" style={{ width: qCss(uToQ(pageWidthU)), height: qCss(uToQ(pageHeightU)) }}>
              <DocumentRenderer document={previewDocument} plans={plans} assetUrls={persistence?.assetUrls ?? W2C_DEMO_ASSET_URLS} />
              <div ref={editorOverlayRef} className="vnext-editor-overlay" data-editor-overlay="" aria-label="Camada de interação do editor"
                onPointerDown={(event) => {
                  const target = event.target as HTMLElement;
                  if (event.button !== 0 || (target !== event.currentTarget && !target.matches('[data-editor-hit-layer], [data-selection-layer]'))) return;
                  beginEmptyAreaPointer(event);
                }}
                onPointerMove={moveMarquee}
                onPointerUp={finishMarquee}
                onPointerCancel={cancelMarquee}>
                {textEdit && editingObject && (
                  <div
                    className="vnext-text-edit-session"
                    data-text-edit-session=""
                    data-text-edit-object-id={editingObject.id}
                    style={frameStyle(editingEntry?.frameU ?? frameToU(editingObject.frame))}
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
                    {/* FR-16b: the bar is drawn outside the zoomed page, at its real size. */}
                    <TextEditToolbar symbols={technicalSymbols} onSymbol={insertTechnicalSymbol}
                      onCancel={() => cancelTextEdit()} onCommit={() => commitTextEdit()} />
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
                <div className="vnext-hit-layer" data-editor-hit-layer="">
                {selectedPage.objects.map((object) => {
                  if (object.hidden) return null;
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
                      style={{ ...frameStyle(displayedFrame), zIndex: object.zIndex }}
                      onPointerDown={(event) => beginGesture(event, object, { type: 'move' })}
                      onDoubleClick={(event) => {
                        // The double click acts on the object the first click reached (it may be below this box).
                        const resolved = lastPointerTargetRef.current;
                        const target = resolved && resolved.pageId === selectedPage.id
                          ? selectedPage.objects.find((entry) => entry.id === resolved.objectId) ?? object : object;
                        if (target.type === 'text') startTextEdit(target);
                        if (target.type === 'table' && editorState.mode === 'select') startTableGrid(target);
                        if (target.type === 'group') editGroupedTextAt(event, target);
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
                      {object.type === 'image' && persistence && (
                        <PhotoStatusMark objectId={object.id} assetId={object.assetId} runtime={persistence.runtime}
                          state={persistence.assetRuntimeStates?.get(object.assetId)} bridge={persistence.assetBridge} />
                      )}
                      {selected && (
                        <>
                          {object.type === 'table'
                            && (editorState.mode === 'table-grid' || editorState.mode === 'cell-edit')
                            && !object.locked
                            && tableSelection
                            && object.id === selectedTableObject?.id
                            && gridPlan
                            && (
                              <TableGridOverlay
                                table={object.table}
                                plan={gridPlan}
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
                                onTypeToEdit={(text) => {
                                  if (editorState.mode === 'table-grid') startCellEdit(undefined, text);
                                }}
                                onCellPressWhileEditing={(point) => commitCellEditAndMove(undefined, point)}
                                onGridCommand={(command) => {
                                  if (editorState.mode === 'table-grid') runGridCommand(command);
                                }}
                                renderCellEditor={(cell) => cellDraft && (
                                  <CellInlineEditor draft={cellDraft} draftRef={cellDraftRef} fieldRef={cellEditorFieldRef} cell={cell}
                                    onDraftChange={notifyCellDraftChanged} onCommit={commitCellEditAndMove} onCancel={() => cancelCellEdit()} />
                                )}
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
                                pageWidthU={pageWidthU}
                                pageHeightU={pageHeightU}
                                onRowBoundaryCommit={runRowBoundaryDrag}
                                onColumnBoundaryCommit={runColumnBoundaryDrag}
                                onStaleGesture={() => {
                                  setTableRangeExtensionArmed(false);
                                  setStatusMessage('Gesto descartado porque o documento mudou.');
                                }}
                              />
                            )}
                        </>
                      )}
                    </div>
                  );
                })}
                </div>
                <SelectionLayer boxes={selectionBoxes} marquee={marquee} handlers={{
                  onHandlePointerDown: (event, object, handle) => beginGesture(event, object, { type: 'resize', handle }),
                  onPointerMove: moveGesture, onPointerUp: finishGesture,
                  onPointerCancel: cancelPointerGesture, onLostPointerCapture: cancelCaptureLoss,
                }} />
              </div>
            </div>
          </div>
        </main>

        {/* FR-17: the right column shows "Propriedades" or "Assistente", chosen by the tabs on top. */}
        <SidePanelColumn showTabs={simpleByDefault} active={assistantOpen ? 'assistant' : 'properties'} onChange={(panel) => setAssistantOpen(panel === 'assistant')}>
        <aside className="vnext-info" id={SIDE_PROPERTIES_PANEL_ID} aria-label="Propriedades do objeto" hidden={simpleByDefault && assistantOpen}>
          <span className="vnext-info-kicker">{simpleByDefault ? 'Propriedades' : 'Inspector'}</span>
          <h2>{selectedObject
            ? simpleByDefault
              ? selectedObject.type === 'text' ? 'Texto'
                : selectedObject.type === 'image' ? 'Imagem'
                  : selectedObject.type === 'table' ? 'Tabela'
                    : selectedObject.type === 'shape' ? 'Forma'
                      : selectedObject.type === 'line' ? 'Linha'
                        : selectedObject.type === 'group' ? 'Grupo'
                          : 'Objeto'
              : 'Geometria do objeto'
            : selectedObjects.length > 1
              ? `${selectedObjects.length} objetos selecionados`
              : 'Selecione um objeto'}</h2>
          {simpleByDefault && selectedObject && (
            <p className="vnext-context-help" data-inspector-context-help="">
              {selectedObject.type === 'text' ? 'Use Editar texto na barra acima da página ou dê dois cliques no texto.'
                : selectedObject.type === 'image' ? 'Ajuste o enquadramento ou escolha outra imagem abaixo.'
                  : selectedObject.type === 'table' ? 'Use Editar tabela para alterar células, linhas e colunas. O título e a aparência ficam aqui.'
                    : 'Arraste na página para mover. Use as alças para mudar o tamanho.'}
            </p>
          )}
          {simpleByDefault && persistence && (persistence.save.phase === 'unavailable' || persistence.save.phase === 'ambiguous') && (
            <p className="vnext-status" data-tone="warning" role="alert" data-save-guidance="">
              {persistence.save.phase === 'ambiguous'
                ? 'O salvamento ainda não foi confirmado. Mantenha esta aba aberta e use Salvar para verificar novamente.'
                : 'Não foi possível salvar agora. Mantenha esta aba aberta, confira a conexão e tente Salvar novamente.'}
            </p>
          )}
          {selectedObjects.length > 1 ? (
            <section className="vnext-arrangement-inspector" data-object-arrangement="">
              <h3>Alinhar e distribuir</h3>
              {selectedHasLockedClosure && (
                <p id="vnext-arrangement-lock-reason" className="vnext-authoring-guidance">
                  {selectedHasInternalLockedGroup
                    ? 'Um dos grupos selecionados contém um objeto interno bloqueado.'
                    : 'Desbloqueie todos os objetos selecionados para organizar.'}
                </p>
              )}
              <div className="vnext-arrangement-actions" aria-label="Alinhar objetos">
                <button type="button" data-editor-action="align-left" disabled={selectedHasLockedClosure}
                  aria-describedby={selectedHasLockedClosure ? 'vnext-arrangement-lock-reason' : undefined}
                  onClick={() => runAlignSelected('left')}>Alinhar à esquerda</button>
                <button type="button" data-editor-action="align-horizontal-center" disabled={selectedHasLockedClosure}
                  aria-describedby={selectedHasLockedClosure ? 'vnext-arrangement-lock-reason' : undefined}
                  onClick={() => runAlignSelected('horizontal-center')}>Centralizar horizontalmente</button>
                <button type="button" data-editor-action="align-right" disabled={selectedHasLockedClosure}
                  aria-describedby={selectedHasLockedClosure ? 'vnext-arrangement-lock-reason' : undefined}
                  onClick={() => runAlignSelected('right')}>Alinhar à direita</button>
                <button type="button" data-editor-action="align-top" disabled={selectedHasLockedClosure}
                  aria-describedby={selectedHasLockedClosure ? 'vnext-arrangement-lock-reason' : undefined}
                  onClick={() => runAlignSelected('top')}>Alinhar ao topo</button>
                <button type="button" data-editor-action="align-vertical-center" disabled={selectedHasLockedClosure}
                  aria-describedby={selectedHasLockedClosure ? 'vnext-arrangement-lock-reason' : undefined}
                  onClick={() => runAlignSelected('vertical-center')}>Centralizar verticalmente</button>
                <button type="button" data-editor-action="align-bottom" disabled={selectedHasLockedClosure}
                  aria-describedby={selectedHasLockedClosure ? 'vnext-arrangement-lock-reason' : undefined}
                  onClick={() => runAlignSelected('bottom')}>Alinhar à base</button>
              </div>
              <div className="vnext-arrangement-actions" aria-label="Distribuir objetos">
                <button type="button" data-editor-action="distribute-horizontal"
                  disabled={selectedObjects.length < 3 || selectedHasLockedClosure}
                  aria-describedby={selectedHasLockedClosure ? 'vnext-arrangement-lock-reason' : undefined}
                  onClick={() => runDistributeSelected('horizontal')}>Distribuir horizontalmente</button>
                <button type="button" data-editor-action="distribute-vertical"
                  disabled={selectedObjects.length < 3 || selectedHasLockedClosure}
                  aria-describedby={selectedHasLockedClosure ? 'vnext-arrangement-lock-reason' : undefined}
                  onClick={() => runDistributeSelected('vertical')}>Distribuir verticalmente</button>
              </div>
            </section>
          ) : selectedObject ? (
            <>
              {simpleByDefault && (
                <button
                  type="button"
                  className="vnext-inspector-action vnext-inspector-disclosure"
                  data-editor-action="toggle-inspector-details"
                  aria-expanded={inspectorDetailsOpen}
                  aria-controls="vnext-object-details"
                  onClick={() => setInspectorDetailsOpen((open) => !open)}
                >
                  {inspectorDetailsOpen ? 'Ocultar propriedades' : 'Mais propriedades'}
                </button>
              )}
              {(!simpleByDefault || inspectorDetailsOpen) && <div id="vnext-object-details" data-inspector-details="">
              <section className="vnext-object-locking" data-object-locking="">
                <h3>Objeto</h3>
                <button
                  type="button"
                  className="vnext-inspector-action"
                  data-editor-action="toggle-object-lock"
                  aria-pressed={selectedOwnLocked}
                  onClick={() => setSelectedObjectLock(!selectedOwnLocked)}
                >
                  {selectedOwnLocked ? 'Desbloquear objeto' : 'Bloquear objeto'}
                </button>
                {selectedOwnLocked && (
                  <p id="vnext-object-lock-reason" className="vnext-authoring-guidance">
                    Objeto bloqueado. Desbloqueie para mover, redimensionar ou organizar este objeto.
                  </p>
                )}
                {groupHasLockedDescendant(selectedObject) && (
                  <p id="vnext-object-closure-lock-reason" className="vnext-authoring-guidance">
                    Este grupo contém um objeto interno bloqueado e não pode ser organizado nesta versão.
                  </p>
                )}
              </section>
              <div className="vnext-divider" />
              {/* J4 P2: every field below shows "mm"; say once what it means. */}
              <p data-inspector-units="">Posição e tamanho, em mm (mm = milímetros).</p>
              <div className="vnext-inspector-grid" data-inspector-authoring="">
                {INSPECTOR_FRAME_FIELDS.map((field) => (
                  <InspectorNumberField key={field} field={field} label={inspectorFieldLabel(field)} value={inspectorDraft[field]}
                    error={inspectorFieldError?.objectId === selectedObject.id && inspectorFieldError.field === field ? inspectorFieldError.message : undefined}
                    disabled={selectedMutationLocked}
                    describedBy={selectedMutationLocked
                      ? groupHasLockedDescendant(selectedObject) ? 'vnext-object-closure-lock-reason' : 'vnext-object-lock-reason'
                      : undefined}
                    readOnly={selectedObject.type === 'group' && (field === 'width' || field === 'height')}
                    onFocus={() => {
                      if (!inspectorDraftIsPending()) prepareAuthoringForContextChangeRef.current();
                    }}
                    onChange={(value) => updateInspectorDraft(field, value)}
                    onCommit={commitInspector}
                    onRevert={() => revertInspectorField(field)}
                  />
                ))}
              </div>
              </div>}
              {selectedObject.type === 'text' && (
                <TextInspectorSection object={selectedObject} simple={simpleByDefault} disabled={selectedMutationLocked} session={session}
                  measurement={measuredLayout?.source === document ? measuredLayout : null}
                  prepare={() => { if (!prepareAuthoringForContextChangeRef.current()) return false; controller.cancel('superseded'); return true; }}
                  onMessage={setStatusMessage} />
              )}
              {selectedObject.type === 'image' && (
                <>
                  <div className="vnext-divider" />
                  <section className="vnext-image-inspector" data-image-professional-authoring="">
                    <h3>Imagem</h3>
                    <label className="vnext-image-field">
                      <span>Ajuste</span>
                      <select
                        data-image-fit=""
                        value={imageFitDraft}
                        disabled={selectedObject.locked === true}
                        aria-describedby={selectedObject.locked ? 'vnext-image-locked-reason' : undefined}
                        onChange={(event) => {
                          const fit = event.target.value as 'contain' | 'cover';
                          setImageFitDraft(fit);
                          runImageFitChange(fit);
                        }}
                      >
                        <option value="contain">Conter</option>
                        <option value="cover">Preencher</option>
                      </select>
                    </label>

                    <div className="vnext-image-position-heading">
                      <span>Posição da imagem</span>
                      <output data-image-focal-output="">
                        {Math.round(imageFocalDraft.x * 1000) / 10}% · {Math.round(imageFocalDraft.y * 1000) / 10}%
                      </output>
                    </div>

                    <div
                      className="vnext-image-focal-pad"
                      data-image-focal-pad=""
                      data-disabled={selectedObject.locked || imageFitDraft === 'contain' ? 'true' : 'false'}
                      aria-label="Posição da imagem"
                      onPointerDown={(event) => {
                        if (selectedObject.locked || imageFitDraft === 'contain') return;
                        if (!beginImageFocalGesture(event.pointerId)) return;
                        event.preventDefault();
                        event.currentTarget.setPointerCapture?.(event.pointerId);
                        updateImageFocalFromPointer(event);
                      }}
                      onPointerMove={(event) => {
                        if (imageFocalGestureRef.current?.pointerId !== event.pointerId) return;
                        updateImageFocalFromPointer(event);
                      }}
                      onPointerUp={(event) => {
                        if (imageFocalGestureRef.current?.pointerId !== event.pointerId) return;
                        updateImageFocalFromPointer(event);
                        commitImageFocalGesture();
                      }}
                      onPointerCancel={cancelImageFocalGesture}
                      onLostPointerCapture={() => {
                        if (imageFocalGestureRef.current?.pointerId !== undefined) cancelImageFocalGesture();
                      }}
                    >
                      <span
                        className="vnext-image-focal-marker"
                        style={{ left: `${imageFocalDraft.x * 100}%`, top: `${imageFocalDraft.y * 100}%` }}
                        aria-hidden="true"
                      />
                    </div>

                    {([
                      ['x', 'Horizontal'],
                      ['y', 'Vertical'],
                    ] as const).map(([axis, label]) => (
                      <label key={axis} className="vnext-image-range-field">
                        <span>{label}</span>
                        <div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            data-image-focal-axis={axis}
                            value={imageFocalDraft[axis] * 100}
                            disabled={selectedObject.locked === true || imageFitDraft === 'contain'}
                            aria-valuetext={`${Math.round(imageFocalDraft[axis] * 1000) / 10}%`}
                            aria-describedby={selectedObject.locked
                              ? 'vnext-image-locked-reason'
                              : imageFitDraft === 'contain'
                                ? 'vnext-image-contain-guidance'
                                : undefined}
                            onPointerDown={(event) => {
                              if (!beginImageFocalGesture(event.pointerId)) return;
                              event.currentTarget.setPointerCapture?.(event.pointerId);
                            }}
                            onChange={(event) => {
                              if (!imageFocalGestureRef.current && !beginImageFocalGesture()) return;
                              setCanonicalImageFocalDraft({
                                ...imageFocalDraftRef.current,
                                [axis]: Number(event.target.value) / 100,
                              });
                            }}
                            onPointerUp={() => commitImageFocalGesture()}
                            onPointerCancel={cancelImageFocalGesture}
                            onLostPointerCapture={(event) => {
                              if (imageFocalGestureRef.current?.pointerId === event.pointerId) cancelImageFocalGesture();
                            }}
                            onKeyDown={(event) => {
                              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                                beginImageFocalGesture();
                              }
                            }}
                            onKeyUp={(event) => {
                              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                                commitImageFocalGesture();
                              }
                            }}
                            onBlur={() => commitImageFocalGesture()}
                          />
                          <output>{Math.round(imageFocalDraft[axis] * 1000) / 10}%</output>
                        </div>
                      </label>
                    ))}

                    {imageFitDraft === 'contain' && (
                      <p id="vnext-image-contain-guidance" data-image-contain-guidance="">
                        A posição é usada no modo Preencher e será preservada.
                      </p>
                    )}

                    <button
                      type="button"
                      className="vnext-inspector-action"
                      data-editor-action="center-image"
                      disabled={selectedObject.locked === true}
                      aria-describedby={selectedObject.locked ? 'vnext-image-locked-reason' : undefined}
                      onClick={runImageCenter}
                    >
                      Centralizar
                    </button>

                    <label className="vnext-image-field">
                      <span>Imagem do catálogo</span>
                      <select
                        data-image-asset-choice=""
                        value={imageAssetChoice}
                        disabled={selectedObject.locked === true}
                        aria-describedby={selectedObject.locked ? 'vnext-image-locked-reason' : undefined}
                        onChange={(event) => setImageAssetChoice(event.target.value)}
                      >
                        <option value="">Escolha uma imagem</option>
                        {document.assets.map((asset) => (
                          <option key={asset.id} value={asset.id}>{asset.name} — {asset.alt}</option>
                        ))}
                      </select>
                    </label>

                    <div className="vnext-image-actions">
                      <button
                        type="button"
                        data-editor-action="use-image-asset"
                        disabled={selectedObject.locked === true || !imageAssetChoice}
                        aria-describedby={selectedObject.locked ? 'vnext-image-locked-reason' : undefined}
                        onClick={replaceSelectedImageWithAsset}
                      >
                        Usar imagem
                      </button>
                      <button
                        type="button"
                        className="vnext-inspector-action"
                        data-editor-action="upload-image-inspector"
                        disabled={selectedObject.locked === true || (persistence ? !persistence.assetBridge : false)}
                        aria-describedby={selectedObject.locked ? 'vnext-image-locked-reason' : undefined}
                        onClick={replaceSelectedImage}
                      >
                        Enviar nova imagem…
                      </button>
                    </div>

                    {selectedObject.locked && (
                      <p id="vnext-image-locked-reason" data-image-locked-reason="">
                        Esta imagem está bloqueada e não pode ser alterada.
                      </p>
                    )}
                  </section>
                </>
              )}
              {selectedObject.type === 'table' && (
                <TableInspectorPanel
                  tableObject={selectedObject} documentStyle={document.style} assets={document.assets}
                  simple={simpleByDefault} mode={editorState.mode} tableSelection={tableSelection}
                  tableInspectorAdvancedOpen={tableInspectorAdvancedOpen} setTableInspectorAdvancedOpen={setTableInspectorAdvancedOpen}
                  tableSemanticDisabled={tableSemanticDisabled} tableSemanticDisabledReason={tableSemanticDisabledReason}
                  tableSemanticDisabledReasonId={tableSemanticDisabledReasonId}
                  selectedTableTitleValue={selectedTableTitleValue} hasTableTitleDraft={Boolean(tableTitleDraft)}
                  updateTableTitleDraft={updateTableTitleDraft} setTableTitleComposition={setTableTitleComposition}
                  applyTableTitleDraft={applyTableTitleDraft} cancelTableTitleDraft={cancelTableTitleDraft} runTableTitleSet={runTableTitleSet}
                  startTableGrid={startTableGrid} markerPanelOpen={markerPanelOpen} setMarkerPanelOpen={setMarkerPanelOpen}
                  fitHeightPreparation={fitHeightPreparation} runFitHeight={runFitHeight}
                  continuation={{ session, document, measurement: measuredLayout?.source === document ? measuredLayout : null,
                    prepare: () => prepareAuthoringForContextChangeRef.current(), onMessage: setStatusMessage }}
                  tableStyleScope={tableStyleScope} tableStyleRoleScope={tableStyleRoleScope} tableStyleDisabled={tableStyleDisabled}
                  tableStyleDisabledReasonId={tableStyleDisabledReasonId} tableStyleDisabledReason={tableStyleDisabledReason}
                  tableStyleAdvancedOpen={tableStyleAdvancedOpen} tableStylePaddingLinked={tableStylePaddingLinked}
                  setTableStyleRoleScope={setTableStyleRoleScope} setTableStyleAdvancedOpen={setTableStyleAdvancedOpen}
                  setTableStylePaddingLinked={setTableStylePaddingLinked} runTableStylePatch={runTableStylePatch}
                  runTableBorderPreset={runTableBorderPreset} runTableLook={runTableLook} runAnnotationGap={runAnnotationGap}
                  runTableAxisInsert={runTableAxisInsert} runTableAxisRemove={runTableAxisRemove}
                  addQuickNote={addQuickNote} removeQuickNote={removeQuickNote}
                  rowDimensionProjection={rowDimensionProjection} effectiveRowHeightMode={effectiveRowHeightMode}
                  selectedRowAxisIds={selectedRowAxisIds} runRowProperties={runRowProperties} runRowHeightMode={runRowHeightMode}
                  runRowHeightValue={runRowHeightValue} runAxisReorder={runAxisReorder}
                  columnDimensionProjection={columnDimensionProjection} selectedColumnAxisIds={selectedColumnAxisIds}
                  columnDimensionsAdvancedOpen={columnDimensionsAdvancedOpen} setColumnDimensionsAdvancedOpen={setColumnDimensionsAdvancedOpen}
                  runColumnMode={runColumnMode} runColumnNumber={runColumnNumber} runEqualizeColumns={runEqualizeColumns}
                  selectedAnchorCells={selectedAnchorCells} selectedSemanticCell={selectedSemanticCell}
                  cellEditing={Boolean(cellDraft)} startCellEdit={startCellEdit}
                  cellEditor={cellDraft && (
                    <TableCellEditorSection cellDraft={cellDraft} cellDraftRef={cellDraftRef} cellEditorFieldRef={cellEditorFieldRef}
                      simple={simpleByDefault} notifyCellDraftChanged={notifyCellDraftChanged} commitCellEdit={commitCellEdit} cancelCellEdit={cancelCellEdit} />
                  )}
                  imageCellAssetChoice={imageCellAssetChoice} setImageCellAssetChoice={setImageCellAssetChoice}
                  imageCellFit={imageCellFit} setImageCellFit={setImageCellFit}
                  imageCellWidthMm={imageCellWidthMm} setImageCellWidthMm={setImageCellWidthMm}
                  imageCellHeightMm={imageCellHeightMm} setImageCellHeightMm={setImageCellHeightMm}
                  canUploadCellImage={Boolean(persistence?.assetBridge)} runImageCellSet={runImageCellSet}
                  runImageCellUpload={runImageCellUpload} runImageCellClear={runImageCellClear}
                  newAnnotationKind={newAnnotationKind} setNewAnnotationKind={setNewAnnotationKind}
                  newAnnotationTarget={newAnnotationTarget} setNewAnnotationTarget={setNewAnnotationTarget}
                  newAnnotationText={newAnnotationText} setNewAnnotationText={setNewAnnotationText}
                  runAnnotationCreate={runAnnotationCreate} runAnnotationUpdate={runAnnotationUpdate}
                  runAnnotationReference={runAnnotationReference} runAnnotationReorder={runAnnotationReorder} runAnnotationRemove={runAnnotationRemove}
                  markerLegendChoice={markerLegendChoice} setMarkerLegendChoice={setMarkerLegendChoice}
                  runExistingMarkerAssignment={runExistingMarkerAssignment} runMarkerDetach={runMarkerDetach}
                  newMarkerCode={newMarkerCode} setNewMarkerCode={setNewMarkerCode} newMarkerText={newMarkerText} setNewMarkerText={setNewMarkerText}
                  runNewMarkerAssignment={runNewMarkerAssignment} runLegendCreateOnly={runLegendCreateOnly}
                  runLegendUpdate={runLegendUpdate} runLegendRemove={runLegendRemove} runLegendReorder={runLegendReorder}
                  locateLegendUsage={locateLegendUsage}
                  commonWrapPolicy={commonWrapPolicy} runCellPropertyPatch={runCellPropertyPatch}
                />
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
                        {(diagnostic.rowId || diagnostic.cellId) && selectedTableObject && (
                          <small>{describeTableLocation(selectedTableObject.table, diagnostic.rowId, diagnostic.cellId)}</small>
                        )}
                        <div className="vnext-diagnostic-actions">
                          {diagnostic.action === 'FIT_HEIGHT' && fitHeightPreparation?.ok && !fitHeightPreparation.prepared.tallerThanPage && !fitHeightPreparation.prepared.wouldExceedPage && (
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
          ) : <p className="vnext-context-help">{simpleByDefault
            ? 'Clique em um texto, imagem ou tabela para editar. Para adicionar conteúdo, use a barra acima da página.'
            : 'Clique em um objeto da página para mover, redimensionar ou ajustar sua geometria.'}</p>}
          {selectedObject && (() => {
            const where = layerPosition(selectedPage, selectedObject.id);
            return where ? <p className="vnext-layer-position" data-layer-position="">Camada {where.position} de {where.count} (1 = mais ao fundo)</p> : null;
          })()}
          {/* While a table grid or a text is being edited the layers are not offered (the panel stays short). */}
          {editorState.mode === 'select' && <LayersPanel page={selectedPage} document={document} selectedIds={editorState.selectedObjectIds}
            onSelect={selectFromLayers} onToggleHidden={toggleLayerHidden} onToggleLocked={toggleLayerLocked}
            open={layersOpen} onOpenChange={setLayersOpen}
            onReorder={reorderFromLayers} onEditGroupedText={(childId, groupId) => {
              const child = findPageText(selectedPage, childId);
              if (child) startTextEdit(child.object, groupId);
            }} />}
          {!simpleByDefault && <>
          <div className="vnext-divider" />
          <h3>Salvamento</h3>
          <p>
            {persistence
              ? fatherSaveExplanation(persistence.save)
              : 'Este documento continua somente em memória nesta aba.'}
          </p>
          </>}
        </aside>
        {simpleByDefault && (
          <AssistantDock open={assistantOpen} onClose={() => setAssistantOpen(false)}>
            <CatalogNativeComposer
              key={document.id + ':gemini'} session={session} documentId={document.id}
              ownerScope={persistence?.runtime.workspace.getSnapshot().activeAuthorityScopeId}
              client={composerClient}
              factExtraction={factExtraction}
              selected={selectedObject?.type === 'text'
                ? { objectId: selectedObject.id, text: selectedObject.text, locked: selectedObject.locked }
                : undefined}
              selectedTable={selectedTableObject && !selectedTableObject.locked
                ? { pageId: selectedPage.id, objectId: selectedTableObject.id }
                : undefined}
              selectionLabel={editorState.selectedObjectIds.length
                ? assistantSelectionLabel({ count: editorState.selectedObjectIds.length, type: selectedObject?.type }) : undefined}
              onBeforeMutation={() => prepareAuthoringForContextChangeRef.current()}
              measurement={measuredLayout?.source === document ? measuredLayout : null} activePageId={selectedPage.id}
              onShowTable={(pageId, objectId) => { setActivePage(pageId); selectObject(objectId); }}
              onClose={() => setAssistantOpen(false)} wide={assistantWide} onWideChange={setAssistantWide}
              canPublish={Boolean(onRequestPublication) && (!persistence || (!persistence.runtime.workspace.getSnapshot().dirty &&
                persistence.save.phase === 'idle' && !conflictResolutionBusy))}
              onPublication={onRequestPublication ? () => {
                if (prepareAuthoringForContextChangeRef.current()) onRequestPublication();
              } : undefined}
            />
          </AssistantDock>
        )}
        </SidePanelColumn>
      </div>
      <EditorDiagnosticsProbe
        document={document}
        assetUrls={persistence?.assetUrls ?? W2C_DEMO_ASSET_URLS}
        onDiagnostics={receiveMeasuredDiagnostics}
        onMeasuredLayout={receiveMeasuredLayout}
      />
    </div>
    {/* FR-43: next to the shell, not inside it, so the shell's key and pointer handlers never act on the dialog. */}
    <SaveConflictDialog save={persistence?.save} documentTitle={document.title} state={conflictResolutionState}
      resolution={persistence?.runtime.conflictResolutionCoordinator} />
    {persistence && <PhotoLoadingAnnouncer runtime={persistence.runtime} />}
    </>
  );
}
