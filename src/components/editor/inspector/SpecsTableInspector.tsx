// src/components/editor/inspector/SpecsTableInspector.tsx
// Inspector Canônico para o Piloto de specs_table (Fase CORE.T2C.1).
// Gerencia seleção semântica de célula, distingue override vs binding vs vazia,
// e despacha Document Commands estritamente tipados através da Bridge.
// Zero acoplamento de escrita dentro do TableCoreRenderer.

import React, { useState, useEffect } from 'react';
import {
  Table as TableIcon,
  RotateCcw,
  Check,
  ChevronLeft,
  Link,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  Edit3
} from 'lucide-react';
import { ContentBlock, TableColumnConfig } from '../../../domain/catalog.schema';
import {
  adaptLegacyBlockToTableCore,
  executeTableCommandOnLegacyBlock,
  LegacyBridgeCommandContext,
  LegacyTableCoordinateBridge
} from '../../../domain/table-core';
import {
  TableSetCellContentCommand,
  TableRestoreCellCommand
} from '../../../domain/document-commands/table-commands.types';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useLibraryStore } from '../../../stores/useLibraryStore';

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
  const { updateBlock, updateCellOverride, restoreCellToLibrary } = useCatalogStore();
  const { getProduct } = useLibraryStore();

  // Adaptação pura do bloco legado para TableCore + Bridge
  const adaptRes = adaptLegacyBlockToTableCore(block);
  let bridge: LegacyTableCoordinateBridge | null = adaptRes.supported ? adaptRes.bridge : null;

  // Estado local para o input de edição da célula
  const [cellInputValue, setCellInputValue] = useState<string>('');
  const [isSavedRecently, setIsSavedRecently] = useState<boolean>(false);

  // Identifica a célula selecionada via bridge
  const cellMapping = selectedCellId && bridge ? bridge.getByCellId(selectedCellId) : undefined;

  const lastSelectedCellIdRef = React.useRef<string | null>(null);

  // Sincroniza o input quando a seleção de célula mudar
  useEffect(() => {
    if (selectedCellId !== lastSelectedCellIdRef.current) {
      lastSelectedCellIdRef.current = selectedCellId ?? null;

      if (!cellMapping) {
        setCellInputValue('');
        return;
      }

      if (cellMapping.isOverride && cellMapping.content.kind === 'text') {
        setCellInputValue(cellMapping.content.text);
      } else if (cellMapping.hasProductBinding && cellMapping.productRefId) {
        const product = getProduct(cellMapping.productRefId);
        const fieldKey = cellMapping.legacyColKey;
        const specs = (product?.specs || {}) as Record<string, unknown>;
        const customSpecs = (specs.customSpecs || {}) as Record<string, unknown>;
        const rawVal =
          (product as unknown as Record<string, unknown>)?.[fieldKey] ??
          specs[fieldKey] ??
          customSpecs[fieldKey];
        setCellInputValue(rawVal !== undefined && rawVal !== null ? String(rawVal) : '');
      } else if (cellMapping.content.kind === 'text') {
        setCellInputValue(cellMapping.content.text);
      } else {
        setCellInputValue('');
      }
      setIsSavedRecently(false);
    }
  }, [selectedCellId, cellMapping]);

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
      content: { kind: 'text', text: cellInputValue },
      origin: 'inspector',
      timestamp: new Date().toISOString()
    };

    const result = executeTableCommandOnLegacyBlock(command, commandContext);
    if (result.success) {
      setIsSavedRecently(true);
      setTimeout(() => setIsSavedRecently(false), 2000);
    }
  };

  // Despacho de TABLE_RESTORE_CELL
  const handleRestoreCell = () => {
    if (!cellMapping) return;

    const command: TableRestoreCellCommand = {
      type: 'TABLE_RESTORE_CELL',
      tableId: bridge.tableId,
      rowId: cellMapping.rowId,
      columnId: cellMapping.columnId,
      origin: 'inspector',
      timestamp: new Date().toISOString()
    };

    const result = executeTableCommandOnLegacyBlock(command, commandContext);
    if (result.success) {
      setIsSavedRecently(true);
      setTimeout(() => setIsSavedRecently(false), 2000);
    }
  };

  // Ações de Gerenciamento de Colunas da Tabela
  const columns = block.tableColumns || [];

  const handleToggleColumn = (colKey: string, colLabel: string) => {
    const existing = columns.find((c) => c.key === colKey);
    let updated: TableColumnConfig[];
    if (existing) {
      updated = columns.map((c) => (c.key === colKey ? { ...c, visible: !c.visible } : c));
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

  // =========================================================================
  // VISTA 1: INSPECIONAR CÉLULA ESPECÍFICA SELECIONADA
  // =========================================================================
  if (selectedCellId && cellMapping) {
    const colConfig = columns.find((c) => c.key === cellMapping.legacyColKey);
    const colLabel = colConfig?.label || cellMapping.legacyColKey;
    const rowConfig = block.tableRows?.find((r) => r.id === cellMapping.legacyRowId);
    const product = rowConfig?.productRefId ? getProduct(rowConfig.productRefId) : undefined;
    const rowTitle = product?.code || product?.model || rowConfig?.id || cellMapping.legacyRowId;

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

        {/* Status Semântico de Capability */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Origem & Capability
          </label>
          <div className="flex items-center gap-2">
            {cellMapping.isOverride ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                <Edit3 className="w-3 h-3" />
                Override Local
              </span>
            ) : cellMapping.hasProductBinding ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <Link className="w-3 h-3" />
                Dado da Biblioteca
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                Célula Vazia
              </span>
            )}
          </div>
          <p className="text-[10.5px] text-slate-500 leading-snug">
            {cellMapping.isOverride
              ? 'Esta célula possui um valor customizado que sobrepõe o dado original do produto.'
              : cellMapping.hasProductBinding
              ? 'Valor resolvido dinamicamente da Biblioteca de Produtos. Nenhum dado foi mutado ao selecionar.'
              : 'Célula sem valor atribuído. Digite um valor abaixo para defini-la.'}
          </p>
        </div>

        {/* Edição de Conteúdo via Typed Document Command */}
        <div className="space-y-1.5 pt-1 border-t border-slate-100">
          <label className="block text-xs font-semibold text-slate-700">
            {cellMapping.isOverride ? 'Editar Valor do Override:' : 'Definir Valor Personalizado:'}
          </label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={cellInputValue}
              onChange={(e) => setCellInputValue(e.target.value)}
              onInput={(e) => setCellInputValue((e.target as HTMLInputElement).value)}
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

        {/* Ação de Restore to Library (Habilitada apenas quando houver override e binding de produto) */}
        {cellMapping.isOverride && cellMapping.hasProductBinding && (
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleRestoreCell}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-red-700 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded transition-colors"
              title="Remove o override local e restaura o valor canônico da Biblioteca"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Padrão da Biblioteca</span>
            </button>
          </div>
        )}
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
            Clique em qualquer célula da tabela no Canvas para inspecionar, editar overrides ou restaurar dados da Biblioteca.
          </p>
        </div>
      </div>

      {/* Gerenciador de Colunas (Capacidade Legada Preservada) */}
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
      </div>
    </div>
  );
};
