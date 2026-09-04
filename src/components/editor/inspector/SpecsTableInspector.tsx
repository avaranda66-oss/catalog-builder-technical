// src/components/editor/inspector/SpecsTableInspector.tsx
// Inspector Canônico para o Piloto de specs_table (Table Core V2 - Production Experience & Advanced Presentation).
// Suporta: 9 estados semânticos de fonte, desvinculação segura (keep_value vs clear),
// restauração condicional somente para overrides em células vinculadas, linhas manuais/híbridas/vinculadas,
// e seleção de temas de apresentação industriais.
// Zero explicit any.

import React, { useState, useEffect } from 'react';
import {
  Table as TableIcon,
  RotateCcw,
  Check,
  ChevronLeft,
  Link,
  Unlink,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  Edit3,
  Database,
  Palette,
  ShieldAlert,
  AlertCircle,
  Save,
  BookOpen,
  Copy,
  Clipboard
} from 'lucide-react';
import { ContentBlock, TableColumnConfig } from '../../../domain/catalog.schema';
import { TableSetCellContentCommand } from '../../../domain/document-commands/table-commands.types';
import {
  adaptLegacyBlockToTableCore,
  executeTableCommandOnLegacyBlock,
  LegacyBridgeCommandContext,
  LegacyTableCoordinateBridge,
  TablePresetId,
  TablePresentationModel,
  TableColorToken,
  TableDensityToken,
  TableBorderToken,
  TableStripeToken,
  getTablePreset
} from '../../../domain/table-core';
import { TableColorValue } from '../../../domain/table-core/table.types';
import { TableCellLiteralContent } from '../../../domain/table-values';
import {
  CURATED_PALETTES,
  CuratedPalette,
  SavedPalette,
  SavedTableStyle,
  getSavedPalettes,
  saveUserPalette,
  getSavedTableStyles,
  saveUserTableStyle,
  applyPaletteToTable,
  copyTableAppearance,
  hasTableAppearanceInClipboard,
  pasteTableAppearance,
  resetToActivePreset,
  resetToSystemDefault,
  calculateContrastRatio,
  autoFixContrast
} from '../../../domain/appearance/catalog-appearance';
import {
  TABLE_COLOR_TOKEN_HEX_MAP,
  isHexColor,
  normalizeHexColor
} from '../table-core/table-tokens';
import { resolveLegacyProductField, AVAILABLE_DEFAULT_FIELDS } from '../../../domain/table-binding';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useLibraryStore } from '../../../stores/useLibraryStore';
import { useUIStore } from '../../../stores/useUIStore';

export interface SpecsTableInspectorProps {
  block: ContentBlock;
  pageId: string;
  selectedCellId?: string | null;
  onSelectCell?: (cellId: string | null) => void;
}

export const SpecsTableInspector: React.FC<SpecsTableInspectorProps> = ({
  block,
  pageId,
  selectedCellId,
  onSelectCell
}) => {
  const {
    updateBlock,
    updateCellOverride,
    restoreCellToLibrary,
    removeRowFromTable,
    addManualRowToTable,
    unlinkTableCell,
    unlinkTableRow,
    applyTablePresentationTemplate,
    applyPresentationToAllTableCoreV2
  } = useCatalogStore();

  const { getProduct } = useLibraryStore();
  const {
    openAddProductToTableModal,
    openProductKnowledgePickerModal,
    openProductKnowledgeWorkspace,
    setTablePresentationDraft
  } = useUIStore();

  // Adaptação pura do bloco legado para TableCore + Bridge
  const adaptRes = adaptLegacyBlockToTableCore(block);
  let bridge: LegacyTableCoordinateBridge | null = adaptRes.supported ? adaptRes.bridge : null;

  // Identifica a célula selecionada via bridge
  const cellMapping = selectedCellId && bridge ? bridge.getByCellId(selectedCellId) : undefined;

  // Falha segura contra seleção stale (ex.: coluna removida): limpa a seleção de forma controlada
  const isStaleSelection = Boolean(selectedCellId && !cellMapping);
  useEffect(() => {
    if (isStaleSelection && onSelectCell) {
      onSelectCell(null);
    }
  }, [isStaleSelection, onSelectCell]);

  // Estado local para o input de edição da célula e controle de dirty
  const [inputDraft, setInputDraft] = useState<string>('');
  const [isInputDirty, setIsInputDirty] = useState<boolean>(false);
  const [isSavedRecently, setIsSavedRecently] = useState<boolean>(false);
  const [isCustomizingColors, setIsCustomizingColors] = useState<boolean>(false);
  const [colorDraftPresentation, setColorDraftPresentation] = useState<TablePresentationModel | null>(null);
  const [isAdvancedColorsOpen, setIsAdvancedColorsOpen] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [pasteSuccess, setPasteSuccess] = useState<boolean>(false);
  const [applyAllCount, setApplyAllCount] = useState<number | null>(null);
  const [savedPalettesList, setSavedPalettesList] = useState<SavedPalette[]>([]);
  const [savedStylesList, setSavedStylesList] = useState<SavedTableStyle[]>([]);

  useEffect(() => {
    setSavedPalettesList(getSavedPalettes());
    setSavedStylesList(getSavedTableStyles());
  }, []);

  // Resolução pura do valor de origem usando resolver legado compartilhado
  const product = cellMapping?.productRefId ? getProduct(cellMapping.productRefId) : undefined;
  let resolvedSourceValue = '';
  if (cellMapping) {
    if (cellMapping.isOverride && cellMapping.content.kind === 'text') {
      resolvedSourceValue = cellMapping.content.text;
    } else if (cellMapping.hasProductBinding && cellMapping.productRefId) {
      resolvedSourceValue = resolveLegacyProductField(product, cellMapping.legacyColKey) ?? '';
    } else if (cellMapping.content.kind === 'text') {
      resolvedSourceValue = cellMapping.content.text;
    }
  }

  const prevSelectedCellIdRef = React.useRef<string | null>(null);
  const prevResolvedSourceValueRef = React.useRef<string>('');

  // Sincronização inteligente: Live-binding vs Draft do usuário
  useEffect(() => {
    const isNewSelection = selectedCellId !== prevSelectedCellIdRef.current;
    prevSelectedCellIdRef.current = selectedCellId ?? null;

    if (isNewSelection) {
      setInputDraft(resolvedSourceValue);
      setIsInputDirty(false);
      prevResolvedSourceValueRef.current = resolvedSourceValue;
      setIsSavedRecently(false);
    } else {
      if (resolvedSourceValue !== prevResolvedSourceValueRef.current) {
        prevResolvedSourceValueRef.current = resolvedSourceValue;
        if (!isInputDirty) {
          setInputDraft(resolvedSourceValue);
        }
      }
    }
  }, [selectedCellId, resolvedSourceValue, isInputDirty]);

  if (!adaptRes.supported) {
    return (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
        <p className="font-semibold">Tabela não suportada pelo piloto Table Core:</p>
        <p className="mt-1 text-[11px]">{adaptRes.message}</p>
      </div>
    );
  }

  bridge = adaptRes.bridge;

  // Contexto de execução de commands autorizados
  const commandContext: LegacyBridgeCommandContext = {
    block,
    bridge,
    onUpdateOverride: (rowId, colKey, value) => {
      updateCellOverride(block.id, rowId, colKey, value);
    },
    onRestoreOverride: (rowId, colKey) => {
      restoreCellToLibrary(block.id, rowId, colKey);
    }
  };

  // Despacho de TABLE_SET_CELL_CONTENT
  const handleCommitCellEdit = () => {
    if (!cellMapping) return;

    const command: TableSetCellContentCommand = {
      type: 'TABLE_SET_CELL_CONTENT',
      tableId: bridge.tableId,
      rowId: cellMapping.rowId,
      columnId: cellMapping.columnId,
      content: { kind: 'text', text: inputDraft },
      origin: 'inspector',
      timestamp: new Date().toISOString()
    };

    const result = executeTableCommandOnLegacyBlock(command, commandContext);
    if (result.success) {
      setIsInputDirty(false);
      prevResolvedSourceValueRef.current = inputDraft;
      setIsSavedRecently(true);
      setTimeout(() => setIsSavedRecently(false), 2000);
    }
  };

  // Despacho de Restore via TABLE_SET_CELL_CONTENT com canonicalBoundContent (Semântica Unificada BIND.B1)
  const handleRestoreCell = () => {
    if (!cellMapping) return;
    restoreCellToLibrary(block.id, cellMapping.legacyRowId, cellMapping.legacyColKey);
    setIsInputDirty(false);
    setIsSavedRecently(true);
    setTimeout(() => setIsSavedRecently(false), 2000);
  };

  // Ações de Gerenciamento de Colunas e Linhas da Tabela
  const columns = block.tableColumns || [];
  const rows = block.tableRows || [];

  const handleToggleColumn = (colKey: string, colLabel: string) => {
    const existing = columns.find((c) => c.key === colKey);
    let updated: TableColumnConfig[];
    if (existing) {
      updated = columns.map((c) => (c.key === colKey ? { ...c, visible: c.visible === false } : c));
    } else {
      updated = [...columns, { key: colKey, label: colLabel, visible: true }];
    }
    updateBlock(pageId, block.id, { tableColumns: updated });
  };

  const handleColumnLabelChange = (colKey: string, newLabel: string) => {
    const updated = columns.map((c) => (c.key === colKey ? { ...c, label: newLabel } : c));
    updateBlock(pageId, block.id, { tableColumns: updated });
  };

  const handleRemoveColumn = (colKey: string) => {
    if (columns.length <= 1) return;
    const updated = columns.filter((c) => c.key !== colKey);
    updateBlock(pageId, block.id, { tableColumns: updated });
  };

  const handleAddCustomColumn = () => {
    const customKey = `custom_${Date.now()}`;
    const newCol: TableColumnConfig = {
      key: customKey,
      label: 'NOVA COLUNA',
      visible: true,
      isCustom: true
    };
    updateBlock(pageId, block.id, { tableColumns: [...columns, newCol] });
  };

  const currentPresetId =
    (block.customData?.presentationPresetId as TablePresetId) || 'presys_clean_technical';

  const handlePresetChange = (presetId: TablePresetId) => {
    const preset = getTablePreset(presetId);
    const currentPres = (block.customData?.tablePresentation as TablePresentationModel) || preset;
    const updatedPres: TablePresentationModel = {
      ...preset,
      presetId,
      rowStyleOverrides: currentPres.rowStyleOverrides,
      columnStyleOverrides: currentPres.columnStyleOverrides,
      cellStyleOverrides: currentPres.cellStyleOverrides
    };
    // Atômico (Closure 2): Exatamente 1 commitDocumentMutation
    applyTablePresentationTemplate(block.id, updatedPres);
  };

  const currentPresentation: TablePresentationModel =
    (block.customData?.tablePresentation as TablePresentationModel) || getTablePreset(currentPresetId);

  const toHex = (val?: TableColorValue): string => {
    if (!val) return '#ffffff';
    if (isHexColor(val)) return normalizeHexColor(val);
    return TABLE_COLOR_TOKEN_HEX_MAP[val as TableColorToken] || '#ffffff';
  };

  // Handlers para o Color Picker Draft Local (Closure 1)
  const handleOpenColorCustomization = () => {
    const initialDraft = structuredClone(currentPresentation);
    setColorDraftPresentation(initialDraft);
    setTablePresentationDraft({ blockId: block.id, presentation: initialDraft });
    setIsCustomizingColors(true);
  };

  const handleCancelColorChanges = () => {
    setTablePresentationDraft(null);
    setColorDraftPresentation(null);
    setIsCustomizingColors(false);
  };

  const handleColorDraftChange = (key: keyof TablePresentationModel, hexVal: string) => {
    const normalized = normalizeHexColor(hexVal);
    const base = colorDraftPresentation || currentPresentation;
    const updatedDraft: TablePresentationModel = {
      ...base,
      [key]: normalized
    };
    // Preview local imediato sem mutação de documento nem save
    setColorDraftPresentation(updatedDraft);
    setTablePresentationDraft({ blockId: block.id, presentation: updatedDraft });
  };

  const handleConfirmColorChanges = () => {
    if (colorDraftPresentation) {
      // Exatamente 1 commitDocumentMutation ao confirmar (Closure 1)
      applyTablePresentationTemplate(block.id, colorDraftPresentation);
    }
    setTablePresentationDraft(null);
    setColorDraftPresentation(null);
    setIsCustomizingColors(false);
  };

  const handleApplyPalette = (palette: CuratedPalette | SavedPalette) => {
    if (adaptRes.table) {
      const updatedTable = applyPaletteToTable(adaptRes.table, palette);
      applyTablePresentationTemplate(block.id, updatedTable.presentation);
    }
  };

  // =========================================================================
  // VISTA 1: INSPECIONAR CÉLULA ESPECÍFICA SELECIONADA (9 ESTADOS SEMÂNTICOS)
  // =========================================================================
  if (selectedCellId && cellMapping) {
    const colConfig = columns.find((c) => c.key === cellMapping.legacyColKey);
    const colLabel = colConfig?.label || cellMapping.legacyColKey;
    const rowConfig = block.tableRows?.find((r) => r.id === cellMapping.legacyRowId);
    const product = rowConfig?.productRefId ? getProduct(rowConfig.productRefId) : undefined;
    const rowTitle = product?.code || product?.model || (rowConfig?.productRefId ? rowConfig.id : 'Linha Manual');

    // 9 Estados Semânticos de Fonte (Requirements Phase 7, 8, 9, 11)
    type SourceSemanticState =
      | 'product_metadata'
      | 'pim_technical'
      | 'family_inherited'
      | 'local_override'
      | 'manual_value'
      | 'empty'
      | 'source_missing'
      | 'review_required'
      | 'snapshot';

    let semanticState: SourceSemanticState = 'empty';
    let semanticLabel = 'Célula Vazia';
    let semanticDescription = 'Célula sem valor atribuído. Digite um valor abaixo para defini-la.';
    let badgeClass = 'bg-slate-100 text-slate-600 border-slate-200';

    const hasLocalValue = cellMapping.content.kind !== 'empty';

    if (cellMapping.isOverride) {
      semanticState = 'local_override';
      semanticLabel = 'Override Local';
      semanticDescription = 'Esta célula possui um valor customizado que sobrepõe o dado original da fonte.';
      badgeClass = 'bg-blue-100 text-blue-800 border-blue-200';
    } else if (cellMapping.cellBinding?.bindingMode === 'review_required') {
      semanticState = 'review_required';
      semanticLabel = 'Revisão Necessária';
      semanticDescription = 'O dado de origem sofreu alteração e requer confirmação antes da publicação.';
      badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
    } else if (cellMapping.cellBinding?.bindingMode === 'snapshot') {
      semanticState = 'snapshot';
      semanticLabel = 'Snapshot Congelado';
      semanticDescription = 'Valor imutável congelado na publicação ou revisão do documento.';
      badgeClass = 'bg-slate-200 text-slate-800 border-slate-300';
    } else if (cellMapping.cellBinding?.sourceKind === 'pim_datum') {
      semanticState = 'pim_technical';
      semanticLabel = 'PIM Técnico (Live)';
      semanticDescription = 'Dado técnico vinculado em tempo real ao Product Information Management.';
      badgeClass = 'bg-indigo-100 text-indigo-800 border-indigo-200';
    } else if (
      cellMapping.cellBinding?.sourceKind === 'product_metadata' ||
      (cellMapping.hasProductBinding && !cellMapping.isManualRow && !colConfig?.isCustom)
    ) {
      if (cellMapping.productRefId && !product) {
        semanticState = 'source_missing';
        semanticLabel = 'Fonte Ausente';
        semanticDescription = 'O produto ou dado vinculado não foi encontrado na base de dados.';
        badgeClass = 'bg-rose-100 text-rose-800 border-rose-300';
      } else {
        semanticState = 'product_metadata';
        semanticLabel = 'Dado da Biblioteca';
        semanticDescription = 'Valor resolvido dinamicamente da Biblioteca de Produtos.';
        badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
      }
    } else if (cellMapping.isManualValue || (hasLocalValue && !cellMapping.hasProductBinding && !cellMapping.cellBinding)) {
      semanticState = 'manual_value';
      semanticLabel = 'Valor Manual';
      semanticDescription = 'Valor digitado diretamente na tabela sem vínculo a produto ou PIM.';
      badgeClass = 'bg-slate-100 text-slate-700 border-slate-300';
    }

    // Invariante de Segurança: Restaurar da Fonte SÓ pode aparecer se houver override em célula com vínculo!
    const canRestore = cellMapping.isOverride && (cellMapping.hasProductBinding || Boolean(cellMapping.cellBinding));
    const canUnlink = Boolean(cellMapping.hasProductBinding || cellMapping.cellBinding);

    return (
      <div className="space-y-3 pt-2 border-t border-slate-200" data-testid="specs-table-cell-inspector">
        {/* Navegação de Volta à Tabela */}
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <button
            type="button"
            onClick={() => onSelectCell?.(null)}
            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Voltar à Tabela</span>
          </button>
          <span className="text-[10px] font-mono text-slate-400">ID: {cellMapping.cellId.slice(0, 16)}...</span>
        </div>

        {/* Metadados de Coordenadas da Célula */}
        <div className="p-2 bg-slate-50 border border-slate-200 rounded-md space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Coluna:</span>
            <span className="font-bold text-slate-800">{colLabel}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Linha:</span>
            <span className="font-semibold text-slate-700">{rowTitle}</span>
          </div>
        </div>

        {/* Status Semântico de Capability (9 Estados) */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Origem & Semântica da Célula
          </label>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${badgeClass}`}>
              {semanticState === 'local_override' && <Edit3 className="w-3 h-3" />}
              {semanticState === 'product_metadata' && <Link className="w-3 h-3" />}
              {semanticState === 'pim_technical' && <Database className="w-3 h-3" />}
              {semanticState === 'review_required' && <AlertCircle className="w-3 h-3" />}
              {semanticState === 'source_missing' && <ShieldAlert className="w-3 h-3" />}
              {semanticLabel}
            </span>
          </div>
          <p className="text-[10.5px] text-slate-500 leading-snug">
            {semanticDescription}
          </p>
        </div>

        {/* Edição de Conteúdo via Typed Document Command */}
        <div className="space-y-1.5 pt-1 border-t border-slate-100">
          <label className="block text-xs font-semibold text-slate-700">
            {cellMapping.isOverride ? 'Editar Valor do Override:' : 'Definir Valor da Célula:'}
          </label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={inputDraft}
              onChange={(e) => {
                setInputDraft(e.target.value);
                setIsInputDirty(true);
              }}
              onInput={(e) => {
                setInputDraft((e.target as HTMLInputElement).value);
                setIsInputDirty(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCommitCellEdit();
                }
              }}
              placeholder="Digite o valor..."
              className="flex-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
            />
            <button
              type="button"
              onClick={handleCommitCellEdit}
              className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1 transition-colors ${
                isSavedRecently
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#003366] hover:bg-blue-900 text-white'
              }`}
              title="Salvar alteração via Document Command"
            >
              {isSavedRecently ? <Check className="w-3.5 h-3.5" /> : null}
              <span>{isSavedRecently ? 'Salvo' : 'Aplicar'}</span>
            </button>
          </div>
        </div>

        {/* Ação de Restore da Fonte (Habilitada EXCLUSIVAMENTE quando houver override em célula vinculada) */}
        {canRestore && (
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleRestoreCell}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-red-700 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded transition-colors"
              title="Remove o override local e restaura o valor original da fonte"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{cellMapping.cellBinding ? 'Restaurar da Fonte' : 'Restaurar Padrão da Biblioteca'}</span>
            </button>
          </div>
        )}

        {/* Ação de Desvincular Célula da Fonte (Emenda 12: Materializa literal tipado) */}
        {canUnlink && (
          <div className="pt-1.5 space-y-1">
            <button
              type="button"
              onClick={() => {
                const resolvedCellLiteral: TableCellLiteralContent =
                  cellMapping.canonicalBoundContent?.snapshot ??
                  (cellMapping.content.kind !== 'datum_reference' && cellMapping.content.kind !== 'empty'
                    ? cellMapping.content
                    : { kind: 'text', text: resolvedSourceValue });

                unlinkTableCell(
                  block.id,
                  cellMapping.legacyRowId,
                  cellMapping.legacyColKey,
                  'keep_value',
                  resolvedCellLiteral
                );
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded transition-colors"
              title="Desvincula esta célula mantendo o valor atual como manual"
            >
              <Unlink className="w-3.5 h-3.5 text-slate-500" />
              <span>Desvincular (Manter Valor Manual)</span>
            </button>
          </div>
        )}

        {/* Vincular a Dado do PIM (Emenda 1: Coordenadas legadas canônicas + scoping) */}
        <div className="pt-1.5">
          <button
            type="button"
            onClick={() =>
              openProductKnowledgePickerModal({
                kind: 'cell',
                blockId: block.id,
                legacyRowId: cellMapping.legacyRowId,
                legacyColKey: cellMapping.legacyColKey,
                tableCoreCellId: cellMapping.cellId,
                productId: cellMapping.productRefId,
                productModel: product?.model || product?.code
              })
            }
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-indigo-600" />
            <span>Vincular a Dado Técnico / PIM...</span>
          </button>
        </div>

        {/* Abrir Conhecimento do Produto no Workspace (Emendas 14 & 16) */}
        {(cellMapping.productRefId || cellMapping.cellBinding?.productId) && (
          <div className="pt-1">
            <button
              type="button"
              data-testid="inspector-open-workspace-btn"
              onClick={() => {
                const targetProdId = cellMapping.cellBinding?.productId || cellMapping.productRefId;
                if (targetProdId) {
                  openProductKnowledgeWorkspace(targetProdId);
                }
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#003366] hover:text-blue-900 bg-blue-50/80 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
              title="Acessa o Workspace Técnico do Produto no PIM"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#003366]" />
              <span>Abrir Conhecimento do Produto</span>
            </button>
          </div>
        )}

        {/* Metadados de Rastreabilidade Canônica (Emenda 16) */}
        {cellMapping.cellBinding && (
          <div className="p-2 bg-indigo-50/40 border border-indigo-100 rounded text-[10.5px] space-y-1 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Chave Semântica:</span>
              <span className="font-bold text-indigo-900">{cellMapping.cellBinding.semanticKey}</span>
            </div>
            {cellMapping.cellBinding.datasetId && (
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Dataset ID:</span>
                <span className="text-indigo-800">{cellMapping.cellBinding.datasetId}</span>
              </div>
            )}
            {cellMapping.cellBinding.sourceOwnerKind && (
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Origem Canônica:</span>
                <span className="text-indigo-800 font-sans font-medium">
                  {cellMapping.cellBinding.sourceOwnerKind === 'family' ? 'Herdado da Família' : 'Produto'}
                </span>
              </div>
            )}
            {cellMapping.cellBinding.sourceRevision !== undefined && (
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Revisão Gravada:</span>
                <span className="text-slate-700">rev {cellMapping.cellBinding.sourceRevision}</span>
              </div>
            )}
          </div>
        )}

        {/* Estilo Canônico da Célula, Linha e Coluna (Emenda 10: Tokens Canônicos) */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Estilo da Célula (Tokens Canônicos)
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="text-[9px] text-slate-500 block">Fundo:</label>
              <select
                value={block.customData?.tablePresentation?.cellStyleOverrides?.[cellMapping.cellId]?.backgroundColorToken || 'transparent'}
                onChange={(e) => {
                  const currentPres = (block.customData?.tablePresentation as TablePresentationModel) || getTablePreset(currentPresetId);
                  const existingOverrides = currentPres.cellStyleOverrides || {};
                  const token = e.target.value as TableColorToken;
                  const newOverrides = {
                    ...existingOverrides,
                    [cellMapping.cellId]: {
                      ...(existingOverrides[cellMapping.cellId] || {}),
                      backgroundColorToken: token === 'transparent' ? undefined : token
                    }
                  };
                  applyTablePresentationTemplate(block.id, {
                    ...currentPres,
                    cellStyleOverrides: newOverrides
                  });
                }}
                className="w-full px-1 py-1 text-[10.5px] border border-slate-300 rounded bg-white"
              >
                <option value="transparent">Padrão</option>
                <option value="surface_subtle">Cinza Sutil</option>
                <option value="brand_primary">Azul</option>
                <option value="brand_navy">Marinho</option>
                <option value="surface_header">Cabeçalho</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] text-slate-500 block">Texto:</label>
              <select
                value={block.customData?.tablePresentation?.cellStyleOverrides?.[cellMapping.cellId]?.textColorToken || 'text_primary'}
                onChange={(e) => {
                  const currentPres = (block.customData?.tablePresentation as TablePresentationModel) || getTablePreset(currentPresetId);
                  const existingOverrides = currentPres.cellStyleOverrides || {};
                  const token = e.target.value as TableColorToken;
                  const newOverrides = {
                    ...existingOverrides,
                    [cellMapping.cellId]: {
                      ...(existingOverrides[cellMapping.cellId] || {}),
                      textColorToken: token
                    }
                  };
                  applyTablePresentationTemplate(block.id, {
                    ...currentPres,
                    cellStyleOverrides: newOverrides
                  });
                }}
                className="w-full px-1 py-1 text-[10.5px] border border-slate-300 rounded bg-white"
              >
                <option value="text_primary">Preto</option>
                <option value="text_secondary">Cinza</option>
                <option value="text_on_header">Branco</option>
                <option value="brand_primary">Azul</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] text-slate-500 block">Alinhamento:</label>
              <select
                value={block.customData?.tablePresentation?.cellStyleOverrides?.[cellMapping.cellId]?.align || 'left'}
                onChange={(e) => {
                  const currentPres = (block.customData?.tablePresentation as TablePresentationModel) || getTablePreset(currentPresetId);
                  const existingOverrides = currentPres.cellStyleOverrides || {};
                  const align = e.target.value as 'left' | 'center' | 'right';
                  const newOverrides = {
                    ...existingOverrides,
                    [cellMapping.cellId]: {
                      ...(existingOverrides[cellMapping.cellId] || {}),
                      align
                    }
                  };
                  applyTablePresentationTemplate(block.id, {
                    ...currentPres,
                    cellStyleOverrides: newOverrides
                  });
                }}
                className="w-full px-1 py-1 text-[10.5px] border border-slate-300 rounded bg-white"
              >
                <option value="left">Esq</option>
                <option value="center">Centro</option>
                <option value="right">Dir</option>
              </select>
            </div>
          </div>
        </div>

        {/* Estilo Canônico da Linha (Emenda 10) */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Estilo da Linha (Tokens Canônicos)
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-slate-500 block">Fundo da Linha:</label>
              <select
                value={block.customData?.tablePresentation?.rowStyleOverrides?.[cellMapping.rowId]?.backgroundToken || 'transparent'}
                onChange={(e) => {
                  const currentPres = (block.customData?.tablePresentation as TablePresentationModel) || getTablePreset(currentPresetId);
                  const existingOverrides = currentPres.rowStyleOverrides || {};
                  const token = e.target.value as TableColorToken;
                  const newOverrides = {
                    ...existingOverrides,
                    [cellMapping.rowId]: {
                      ...(existingOverrides[cellMapping.rowId] || {}),
                      backgroundToken: token === 'transparent' ? undefined : token
                    }
                  };
                  applyTablePresentationTemplate(block.id, {
                    ...currentPres,
                    rowStyleOverrides: newOverrides
                  });
                }}
                className="w-full px-1.5 py-1 text-[11px] border border-slate-300 rounded bg-white"
              >
                <option value="transparent">Padrão</option>
                <option value="surface_subtle">Cinza Sutil</option>
                <option value="brand_primary">Azul Primário</option>
                <option value="surface_header">Cabeçalho</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] text-slate-500 block">Cor do Texto da Linha:</label>
              <select
                value={block.customData?.tablePresentation?.rowStyleOverrides?.[cellMapping.rowId]?.textColorToken || 'text_primary'}
                onChange={(e) => {
                  const currentPres = (block.customData?.tablePresentation as TablePresentationModel) || getTablePreset(currentPresetId);
                  const existingOverrides = currentPres.rowStyleOverrides || {};
                  const token = e.target.value as TableColorToken;
                  const newOverrides = {
                    ...existingOverrides,
                    [cellMapping.rowId]: {
                      ...(existingOverrides[cellMapping.rowId] || {}),
                      textColorToken: token
                    }
                  };
                  applyTablePresentationTemplate(block.id, {
                    ...currentPres,
                    rowStyleOverrides: newOverrides
                  });
                }}
                className="w-full px-1.5 py-1 text-[11px] border border-slate-300 rounded bg-white"
              >
                <option value="text_primary">Preto Padrão</option>
                <option value="text_secondary">Cinza Secundário</option>
                <option value="text_on_header">Branco</option>
              </select>
            </div>
          </div>
        </div>

        {/* Estilo Canônico da Coluna (Emenda 10) */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Estilo da Coluna (Tokens Canônicos)
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-slate-500 block">Fundo da Coluna:</label>
              <select
                value={block.customData?.tablePresentation?.columnStyleOverrides?.[cellMapping.columnId]?.backgroundToken || 'transparent'}
                onChange={(e) => {
                  const currentPres = (block.customData?.tablePresentation as TablePresentationModel) || getTablePreset(currentPresetId);
                  const existingOverrides = currentPres.columnStyleOverrides || {};
                  const token = e.target.value as TableColorToken;
                  const newOverrides = {
                    ...existingOverrides,
                    [cellMapping.columnId]: {
                      ...(existingOverrides[cellMapping.columnId] || {}),
                      backgroundToken: token === 'transparent' ? undefined : token
                    }
                  };
                  applyTablePresentationTemplate(block.id, {
                    ...currentPres,
                    columnStyleOverrides: newOverrides
                  });
                }}
                className="w-full px-1.5 py-1 text-[11px] border border-slate-300 rounded bg-white"
              >
                <option value="transparent">Padrão</option>
                <option value="surface_subtle">Cinza Sutil</option>
                <option value="brand_primary">Azul Primário</option>
                <option value="surface_header">Cabeçalho</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] text-slate-500 block">Alinhamento Padrão:</label>
              <select
                value={block.customData?.tablePresentation?.columnStyleOverrides?.[cellMapping.columnId]?.align || 'left'}
                onChange={(e) => {
                  const currentPres = (block.customData?.tablePresentation as TablePresentationModel) || getTablePreset(currentPresetId);
                  const existingOverrides = currentPres.columnStyleOverrides || {};
                  const align = e.target.value as 'left' | 'center' | 'right';
                  const newOverrides = {
                    ...existingOverrides,
                    [cellMapping.columnId]: {
                      ...(existingOverrides[cellMapping.columnId] || {}),
                      align
                    }
                  };
                  applyTablePresentationTemplate(block.id, {
                    ...currentPres,
                    columnStyleOverrides: newOverrides
                  });
                }}
                className="w-full px-1.5 py-1 text-[11px] border border-slate-300 rounded bg-white"
              >
                <option value="left">Esquerda</option>
                <option value="center">Centralizado</option>
                <option value="right">Direita</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VISTA 2: INSPECIONAR PROPRIEDADES GLOBAIS DA TABELA
  // =========================================================================
  return (
    <div className="space-y-4 pt-2 border-t border-slate-200" data-testid="specs-table-global-inspector">
      {/* Título da Tabela */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Título da Tabela</label>
        <input
          type="text"
          value={block.title || ''}
          onChange={(e) => updateBlock(pageId, block.id, { title: e.target.value })}
          placeholder="Ex: Tabela de Especificações Técnicas"
          className="w-full px-2.5 py-1.5 text-xs font-bold text-slate-800 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 bg-white"
        />
      </div>

      {/* Dica de Seleção de Célula */}
      <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
        <TableIcon className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
        <div className="leading-snug">
          <p className="font-bold">Edição Precisa de Célula</p>
          <p className="text-[11px] text-blue-800 mt-0.5">
            Clique em qualquer célula da tabela no Canvas para inspecionar, editar overrides ou desvincular dados.
          </p>
        </div>
      </div>

      {/* Gerenciador de Colunas */}
      <div className="space-y-2.5 pt-2 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-800 text-xs">Personalizar Colunas</span>
          <button
            type="button"
            onClick={handleAddCustomColumn}
            className="flex items-center gap-1 text-[10px] text-blue-700 hover:text-blue-900 font-semibold px-2 py-0.5 bg-blue-50 border border-blue-200 rounded"
          >
            <Plus className="w-3 h-3" />
            <span>Nova Coluna</span>
          </button>
        </div>

        <div className="space-y-2 bg-slate-50 p-2 rounded-lg border border-slate-200 max-h-60 overflow-y-auto">
          {columns.map((col) => (
            <div key={col.key} className="p-1.5 bg-white border border-slate-200 rounded-md space-y-1">
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => handleToggleColumn(col.key, col.label)}
                  className="flex items-center gap-1.5 text-slate-700 hover:text-blue-700"
                >
                  {col.visible !== false ? (
                    <CheckSquare className="w-3.5 h-3.5 text-blue-700 flex-shrink-0" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  )}
                  <span className="text-[10px] font-mono text-slate-400">[{col.key}]</span>
                </button>

                {columns.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveColumn(col.key)}
                    className="text-slate-300 hover:text-red-600 p-0.5"
                    title="Remover coluna"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div>
                <label className="text-[9px] text-slate-400 block">Nome da Coluna:</label>
                <input
                  type="text"
                  value={col.label}
                  onChange={(e) => handleColumnLabelChange(col.key, e.target.value)}
                  className="w-full px-2 py-1 text-[11px] font-semibold text-slate-800 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Campos Rápidos da Biblioteca */}
        <div className="pt-2 border-t border-slate-200">
          <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
            Campos Rápidos da Biblioteca
          </span>
          <div className="flex flex-wrap gap-1">
            {AVAILABLE_DEFAULT_FIELDS.map((f) => {
              const exists = columns.some((c) => c.key === f.key);
              const col = columns.find((c) => c.key === f.key);
              const isVis = exists && col?.visible !== false;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => handleToggleColumn(f.key, f.label)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    isVis
                      ? 'bg-blue-100 text-blue-900 border-blue-300 font-semibold'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tema de Apresentação & Design System V2 (TABLE.V2.PRESENTATION1, Emendas 4-20) */}
      <div className="space-y-3 pt-2 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Palette className="w-3.5 h-3.5 text-[#001f3f]" />
            <span>Design System & Apresentação</span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isCustomizingColors) {
                handleCancelColorChanges();
              } else {
                handleOpenColorCustomization();
              }
            }}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors ${
              isCustomizingColors
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
          >
            {isCustomizingColors ? 'Ocultar Cores' : 'Personalizar Cores'}
          </button>
        </div>

        {/* 1. Presets Canônicos Built-in (12 Presets Preservados e Restaurados) */}
        <div>
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
            Preset de Apresentação
          </label>
          <select
            value={currentPresetId}
            onChange={(e) => handlePresetChange(e.target.value as TablePresetId)}
            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white font-medium text-slate-800 focus:ring-1 focus:ring-blue-500"
          >
            <option value="presys_clean_technical">Presys Técnico Limpo (Padrão)</option>
            <option value="dense_spec_matrix">Matriz Densa de Especificações</option>
            <option value="model_comparison">Comparativo de Modelos</option>
            <option value="parameter_value">Parâmetro & Valor (Compacto)</option>
            <option value="presys_dark_navy">Presys Azul Marinho Oficial</option>
            <option value="presys_blue_comparison">Presys Azul Comparativo</option>
            <option value="gray_technical">Cinza Técnico Industrial</option>
            <option value="corporate_slate">Ardósia Corporativa</option>
            <option value="precision_blue">Precision Blue (Classic Metrology)</option>
            <option value="family_header">Family Header (Família & Sessão)</option>
            <option value="minimal_light">Minimal Light (Fundo Claro)</option>
            <option value="high_contrast">Alto Contraste (Zebra Marcada)</option>
          </select>
        </div>

        {/* 2. Paletas de Cores Curadas & Salvas do Usuário (Emendas 9, 10) */}
        <div>
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
            Paleta de Cores da Tabela
          </label>
          <select
            defaultValue=""
            onChange={(e) => {
              const palId = e.target.value;
              if (!palId) return;
              if (palId.startsWith('style:')) {
                const styleId = palId.slice(6);
                const foundStyle = savedStylesList.find((s) => s.id === styleId);
                if (foundStyle) {
                  applyTablePresentationTemplate(block.id, foundStyle.presentation);
                }
                return;
              }
              const curated = CURATED_PALETTES.find((p) => p.id === palId);
              if (curated) {
                handleApplyPalette(curated);
                return;
              }
              const saved = savedPalettesList.find((p) => p.id === palId);
              if (saved) {
                handleApplyPalette(saved);
              }
            }}
            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white font-medium text-slate-800 focus:ring-1 focus:ring-blue-500"
          >
            <option value="" disabled>Selecione uma paleta ou estilo salvo...</option>
            <optgroup label="Paletas Industriais Canônicas">
              {CURATED_PALETTES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            {savedPalettesList.length > 0 && (
              <optgroup label="Minhas Paletas Salvas">
                {savedPalettesList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
            {savedStylesList.length > 0 && (
              <optgroup label="Meus Estilos de Tabela Salvos">
                {savedStylesList.map((s) => (
                  <option key={s.id} value={`style:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* 3. Painel de Cores Customizadas (Live Draft local, Validação HEX e WCAG Contrast) */}
        {/* 3. Painel de Cores Customizadas (Live Draft local, Validação HEX e WCAG Contrast) */}
        {isCustomizingColors && (() => {
          const activeColorPresentation = colorDraftPresentation || currentPresentation;
          const bgHex = toHex(activeColorPresentation.headerBackgroundToken);
          const textHex = toHex(activeColorPresentation.headerTextColorToken);
          const borderHex = toHex(activeColorPresentation.borderColorToken);
          const sectionBgHex = toHex(activeColorPresentation.sectionBackgroundToken);
          const sectionTextHex = toHex(activeColorPresentation.sectionTextColorToken);
          const bodyBgHex = toHex(activeColorPresentation.bodyBackgroundToken);

          return (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-800 block">Personalização Livre de Cores</span>
              <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold">
                Preview Local
              </span>
            </div>

            {/* Aviso de Contraste WCAG (Emenda 20) */}
            {(() => {
              const ratio = calculateContrastRatio(textHex, bgHex);
              const isLow = ratio < 4.5;
              if (!isLow) return null;
              return (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-amber-800 font-bold">⚠ Baixo contraste no cabeçalho — {ratio}:1</span>
                    <button
                      type="button"
                      onClick={() => {
                        const safeColor = autoFixContrast(bgHex);
                        handleColorDraftChange('headerTextColorToken', safeColor);
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors cursor-pointer"
                    >
                      Corrigir automaticamente
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-700">
                    O padrão WCAG AA recomenda razão mínima de 4.5:1 para texto padrão.
                  </p>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-2">
              {/* Header BG */}
              <div>
                <label className="text-[9.5px] font-semibold text-slate-600 block">Fundo Cabeçalho:</label>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="color"
                    value={bgHex}
                    onChange={(e) => handleColorDraftChange('headerBackgroundToken', e.target.value)}
                    className="w-7 h-7 p-0 border border-slate-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={bgHex}
                    onChange={(e) => {
                      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(e.target.value)) {
                        handleColorDraftChange('headerBackgroundToken', e.target.value);
                      }
                    }}
                    className="w-20 px-1.5 py-0.5 text-[11px] font-mono border border-slate-300 rounded bg-white"
                  />
                </div>
              </div>

              {/* Header Text */}
              <div>
                <label className="text-[9.5px] font-semibold text-slate-600 block">Texto Cabeçalho:</label>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="color"
                    value={textHex}
                    onChange={(e) => handleColorDraftChange('headerTextColorToken', e.target.value)}
                    className="w-7 h-7 p-0 border border-slate-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={textHex}
                    onChange={(e) => {
                      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(e.target.value)) {
                        handleColorDraftChange('headerTextColorToken', e.target.value);
                      }
                    }}
                    className="w-20 px-1.5 py-0.5 text-[11px] font-mono border border-slate-300 rounded bg-white"
                  />
                </div>
              </div>

              {/* Border Color */}
              <div>
                <label className="text-[9.5px] font-semibold text-slate-600 block">Cor da Borda:</label>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="color"
                    value={borderHex}
                    onChange={(e) => handleColorDraftChange('borderColorToken', e.target.value)}
                    className="w-7 h-7 p-0 border border-slate-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={borderHex}
                    onChange={(e) => {
                      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(e.target.value)) {
                        handleColorDraftChange('borderColorToken', e.target.value);
                      }
                    }}
                    className="w-20 px-1.5 py-0.5 text-[11px] font-mono border border-slate-300 rounded bg-white"
                  />
                </div>
              </div>

              {/* Section BG */}
              <div>
                <label className="text-[9.5px] font-semibold text-slate-600 block">Fundo da Seção:</label>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="color"
                    value={sectionBgHex}
                    onChange={(e) => handleColorDraftChange('sectionBackgroundToken', e.target.value)}
                    className="w-7 h-7 p-0 border border-slate-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={sectionBgHex}
                    onChange={(e) => {
                      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(e.target.value)) {
                        handleColorDraftChange('sectionBackgroundToken', e.target.value);
                      }
                    }}
                    className="w-20 px-1.5 py-0.5 text-[11px] font-mono border border-slate-300 rounded bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Modo Avançado: Section Text e Body Background (Closure 10) */}
            <div className="pt-1.5 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsAdvancedColorsOpen(!isAdvancedColorsOpen)}
                className="text-[10px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
              >
                <span>{isAdvancedColorsOpen ? '▲ Recolher Modo Avançado' : '▼ Modo Avançado (Texto Seção & Fundo Corpo)'}</span>
              </button>

              {isAdvancedColorsOpen && (
                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100">
                  {/* Section Text */}
                  <div>
                    <label className="text-[9.5px] font-semibold text-slate-600 block">Texto da Seção:</label>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <input
                        type="color"
                        value={sectionTextHex}
                        onChange={(e) => handleColorDraftChange('sectionTextColorToken', e.target.value)}
                        className="w-7 h-7 p-0 border border-slate-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={sectionTextHex}
                        onChange={(e) => {
                          if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(e.target.value)) {
                            handleColorDraftChange('sectionTextColorToken', e.target.value);
                          }
                        }}
                        className="w-20 px-1.5 py-0.5 text-[11px] font-mono border border-slate-300 rounded bg-white"
                      />
                    </div>
                  </div>

                  {/* Body Background */}
                  <div>
                    <label className="text-[9.5px] font-semibold text-slate-600 block">Fundo do Corpo:</label>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <input
                        type="color"
                        value={bodyBgHex}
                        onChange={(e) => handleColorDraftChange('bodyBackgroundToken', e.target.value)}
                        className="w-7 h-7 p-0 border border-slate-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={bodyBgHex}
                        onChange={(e) => {
                          if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(e.target.value)) {
                            handleColorDraftChange('bodyBackgroundToken', e.target.value);
                          }
                        }}
                        className="w-20 px-1.5 py-0.5 text-[11px] font-mono border border-slate-300 rounded bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Ações de Confirmação Atômica e Cancelamento (Closure 1) */}
            <div className="flex gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={handleConfirmColorChanges}
                className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded shadow-xs cursor-pointer transition-colors"
                title="Aplica as cores em 1 única mutação de documento"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirmar e Aplicar</span>
              </button>

              <button
                type="button"
                onClick={handleCancelColorChanges}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded cursor-pointer transition-colors"
                title="Descarta alterações e restaura a aparência anterior"
              >
                <span>Cancelar</span>
              </button>
            </div>

            {/* Ações de Salvar Paleta e Salvar Estilo (Emendas 9, 10, 11) */}
            <div className="flex gap-2 pt-1 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  const name = window.prompt('Nome para sua paleta personalizada:');
                  if (name && name.trim()) {
                    saveUserPalette({
                      name: name.trim(),
                      headerBackground: activeColorPresentation.headerBackgroundToken,
                      headerText: activeColorPresentation.headerTextColorToken,
                      sectionBackground: activeColorPresentation.sectionBackgroundToken,
                      sectionText: activeColorPresentation.sectionTextColorToken,
                      bodyBackground: activeColorPresentation.bodyBackgroundToken,
                      borderColor: activeColorPresentation.borderColorToken
                    });
                    setSavedPalettesList(getSavedPalettes());
                  }
                }}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10.5px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer"
              >
                <Save className="w-3 h-3" />
                <span>Salvar Paleta</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const name = window.prompt('Nome para o seu estilo de tabela:');
                  if (name && name.trim()) {
                    saveUserTableStyle(name.trim(), activeColorPresentation);
                    setSavedStylesList(getSavedTableStyles());
                  }
                }}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10.5px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded cursor-pointer"
              >
                <Save className="w-3 h-3" />
                <span>Salvar Estilo</span>
              </button>
            </div>
          </div>
          );
        })()}

        {/* 4. Densidade, Bordas e Listras */}
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <div>
            <label className="text-[9px] text-slate-500 block">Densidade:</label>
            <select
              value={currentPresentation.density}
              onChange={(e) => {
                applyTablePresentationTemplate(block.id, {
                  ...currentPresentation,
                  density: e.target.value as TableDensityToken
                });
              }}
              className="w-full px-1 py-1 text-[10.5px] border border-slate-300 rounded bg-white"
            >
              <option value="compact">Compacta</option>
              <option value="regular">Regular</option>
              <option value="spacious">Espaçosa</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] text-slate-500 block">Bordas:</label>
            <select
              value={currentPresentation.borderStyle}
              onChange={(e) => {
                applyTablePresentationTemplate(block.id, {
                  ...currentPresentation,
                  borderStyle: e.target.value as TableBorderToken
                });
              }}
              className="w-full px-1 py-1 text-[10.5px] border border-slate-300 rounded bg-white"
            >
              <option value="all">Grade Completa</option>
              <option value="horizontal_only">Apenas Linhas</option>
              <option value="outer_only">Apenas Externa</option>
              <option value="none">Sem Bordas</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] text-slate-500 block">Zebra:</label>
            <select
              value={currentPresentation.stripeStyle}
              onChange={(e) => {
                applyTablePresentationTemplate(block.id, {
                  ...currentPresentation,
                  stripeStyle: e.target.value as TableStripeToken
                });
              }}
              className="w-full px-1 py-1 text-[10.5px] border border-slate-300 rounded bg-white"
            >
              <option value="none">Nenhuma</option>
              <option value="subtle_zebra">Zebra Sutil</option>
              <option value="high_contrast_zebra">Alto Contraste</option>
            </select>
          </div>
        </div>

        {/* 5. Ações de Reset com Semântica Clara (Emenda 12) */}
        <div className="flex gap-2 pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              if (adaptRes.table) {
                const resetTable = resetToActivePreset(adaptRes.table);
                applyTablePresentationTemplate(block.id, resetTable.presentation);
              }
            }}
            className="flex-1 px-2 py-1 text-[10.5px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition-colors"
            title="Remove custom overrides e restaura o built-in preset ativo"
          >
            Restaurar estilo do preset
          </button>
          <button
            type="button"
            onClick={() => {
              if (adaptRes.table) {
                const sysTable = resetToSystemDefault(adaptRes.table);
                // Atômico (Closure 2): Exatamente 1 commitDocumentMutation
                applyTablePresentationTemplate(block.id, sysTable.presentation);
              }
            }}
            className="flex-1 px-2 py-1 text-[10.5px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition-colors"
            title="Restaura o padrão do sistema (presys_clean_technical)"
          >
            Restaurar padrão do sistema
          </button>
        </div>

        {/* 6. Copiar / Colar Aparência no Clipboard Interno (Emenda 13) */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              copyTableAppearance(currentPresentation);
              setCopySuccess(true);
              setTimeout(() => setCopySuccess(false), 2000);
            }}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10.5px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded"
          >
            <Copy className="w-3 h-3" />
            <span>{copySuccess ? 'Copiado!' : 'Copiar Aparência'}</span>
          </button>
          <button
            type="button"
            disabled={!hasTableAppearanceInClipboard()}
            onClick={() => {
              if (adaptRes.table) {
                const pasted = pasteTableAppearance(adaptRes.table);
                if (pasted) {
                  applyTablePresentationTemplate(block.id, pasted.presentation);
                  setPasteSuccess(true);
                  setTimeout(() => setPasteSuccess(false), 2000);
                }
              }
            }}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10.5px] font-semibold rounded border ${
              hasTableAppearanceInClipboard()
                ? 'text-slate-800 bg-white hover:bg-slate-50 border-slate-300 cursor-pointer'
                : 'text-slate-300 bg-slate-50 border-slate-200 cursor-not-allowed'
            }`}
          >
            <Clipboard className="w-3 h-3" />
            <span>{pasteSuccess ? 'Colado!' : 'Colar Aparência'}</span>
          </button>
        </div>

        {/* 7. Escopo de Aplicação: Somente Table Core V2 (Emenda 14 & Closure 3 Batch Atômico) */}
        <div className="pt-1.5 border-t border-slate-100 space-y-1">
          <button
            type="button"
            onClick={() => {
              // Batch Atômico (Closure 3): 1 única transação/mutation no store
              const count = applyPresentationToAllTableCoreV2(currentPresentation);
              setApplyAllCount(count);
              setTimeout(() => setApplyAllCount(null), 3000);
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#003366] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
          >
            <span>Aplicar a todas as Tabelas Técnicas V2 deste catálogo</span>
          </button>
          {applyAllCount !== null && (
            <p className="text-[10px] text-center text-emerald-600 font-bold">
              {applyAllCount} tabela(s) técnica(s) V2 atualizada(s)!
            </p>
          )}
        </div>

        <p className="text-[10px] text-slate-400">
          Altera estilos e apresentação preservando 100% dos dados, células e vínculos intactos.
        </p>
      </div>

      {/* Ações Rápidas de Inserção de Linhas e Dados */}
      <div className="space-y-1.5 pt-2 border-t border-slate-200">
        <span className="block text-xs font-bold text-slate-800">Adicionar à Tabela</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => addManualRowToTable(block.id)}
            className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Linha Manual</span>
          </button>
          <button
            type="button"
            onClick={() => openAddProductToTableModal(block.id)}
            className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Produto</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => openProductKnowledgePickerModal({ kind: 'table', blockId: block.id })}
          className="w-full px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          <Database className="w-3.5 h-3.5 text-indigo-700" />
          <span>Buscar no PIM / Conhecimento Técnico</span>
        </button>
      </div>

      {/* Gerenciador de Linhas (BOUND, HYBRID, MANUAL + Empty State Badge + Unrestricted Delete) */}
      <div className="space-y-2 pt-2 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-800 text-xs">Modelos na Tabela</span>
          <span className="text-[10px] text-slate-500 font-mono">
            {rows.length} linha(s)
          </span>
        </div>

        <div className="space-y-1.5 bg-slate-50 p-2 rounded-lg border border-slate-200 max-h-48 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="text-[10.5px] text-slate-400 italic">Nenhuma linha na tabela. Adicione uma linha manual ou produto acima.</p>
          ) : (
            rows.map((row, idx) => {
              const prod = row.productRefId ? getProduct(row.productRefId) : undefined;
              const rowLabel = prod?.code || prod?.model || (row.productRefId ? row.productRefId : `Linha Manual ${idx + 1}`);

              const isManual = !row.productRefId;
              const hasOverrides = Object.keys(row.localOverrides || {}).length > 0;
              const hasCellBindings = Object.keys(row.cellBindings || {}).length > 0;

              // Detecção de Linha Manual Vazia para o Inspector (Emenda 2)
              const isManualEmpty = isManual && (!row.localOverrides || Object.values(row.localOverrides).every((v) => !v || String(v).trim().length === 0));

              const rowBadge = isManual
                ? { label: 'MANUAL', class: 'bg-slate-200 text-slate-700 border-slate-300' }
                : (hasOverrides || hasCellBindings)
                ? { label: 'HYBRID', class: 'bg-indigo-100 text-indigo-800 border-indigo-300' }
                : { label: 'BOUND', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' };

              return (
                <div key={row.id} className="p-1.5 bg-white border border-slate-200 rounded flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800 truncate">{rowLabel}</span>
                      <span className={`text-[8.5px] font-bold px-1 py-0.2 rounded border ${rowBadge.class}`}>
                        {rowBadge.label}
                      </span>
                      {isManualEmpty && (
                        <span className="text-[8.5px] font-semibold px-1 py-0.2 rounded border bg-amber-50 text-amber-700 border-amber-200">
                          Ainda sem conteúdo
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 truncate block">
                      {prod ? `${prod.model || prod.code} (${prod.family || 'Instrumento'})` : (row.productRefId ? 'Produto da Biblioteca' : 'Linha 100% Manual')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!isManual && (
                      <button
                        type="button"
                        onClick={() => unlinkTableRow(block.id, row.id, 'keep_value')}
                        className="text-[9.5px] font-semibold text-slate-500 hover:text-slate-800 px-1.5 py-0.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded"
                        title="Desvincular linha da biblioteca (mantém valores atuais como manuais)"
                      >
                        Desvincular
                      </button>
                    )}
                    {/* Exclusão sem travas: permite excluir inclusive a última linha (Emenda 2) */}
                    <button
                      type="button"
                      onClick={() => removeRowFromTable(block.id, row.id)}
                      className="text-slate-300 hover:text-red-600 p-1 rounded transition-colors"
                      title="Remover linha da tabela"
                      aria-label={`Remover modelo ${rowLabel}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
