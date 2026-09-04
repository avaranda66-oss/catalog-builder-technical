// src/components/library/product-workspace/WorkspaceTechnicalTablesTab.tsx
// FASE 12 & PIM.PRODUCTION.CORE1.1: Editor Completo de Tabelas Técnicas, Reordenação,
// Editor de Células Tipado por TechnicalValue e Transferência Cross-Product (Itens 7, 8 e 9).

import React, { useState } from 'react';
import {
  Table,
  Plus,
  Copy,
  GitBranch,
  LayoutTemplate,
  Trash2,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Edit2
} from 'lucide-react';
import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  CANONICAL_DATASET_TEMPLATES,
  DatasetTemplate,
  TechnicalDataset,
  TechnicalDatum,
  DatasetColumn,
  DatasetRow,
  TechnicalValue,
  DatumStatus,
  instantiateDatasetFromTemplate,
  getDatasetCellKey,
  formatTechnicalValue,
  deleteDataset,
  addDataset,
  addDatasetColumn,
  deleteDatasetColumn,
  addDatasetRow,
  deleteDatasetRow,
  reorderDatasetColumns,
  reorderDatasetRows,
  setDatasetCell,
  clearDatasetCell,
  addDatum,
  updateDatumValue
} from '../../../domain/product-workbook';
import { Product } from '../../../domain/product.schema';
import { ProductWorkbookRepository } from '../../../services/product-workbook/persistence.types';
import { CellEditorModal } from './CellEditorModal';
import { NewDatasetModal } from './NewDatasetModal';
import { CrossProductTransferModal } from './CrossProductTransferModal';

interface WorkspaceTechnicalTablesTabProps {
  product: Product;
  workbook: ProductWorkbookV2;
  effectiveKnowledge: ResolvedProductKnowledge;
  onUpdateWorkbook: (updated: ProductWorkbookV2) => void;
  availableProducts?: readonly Product[];
  repository?: ProductWorkbookRepository;
}

export const WorkspaceTechnicalTablesTab: React.FC<WorkspaceTechnicalTablesTabProps> = ({
  product,
  workbook,
  effectiveKnowledge,
  onUpdateWorkbook,
  availableProducts = [],
  repository
}) => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(
    workbook.datasets.length > 0 ? workbook.datasets[0].id : null
  );

  // Modais de Controle
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isNewDatasetModalOpen, setIsNewDatasetModalOpen] = useState(false);
  const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
  const [isAddRowModalOpen, setIsAddRowModalOpen] = useState(false);

  // Modal Cross-Product
  const [crossProductMode, setCrossProductMode] = useState<'copy' | 'clone' | null>(null);

  // Modal de Edição de Célula
  const [editingCellCoords, setEditingCellCoords] = useState<{
    row: DatasetRow;
    col: DatasetColumn;
  } | null>(null);

  // Estados dos formulários de nova coluna e nova linha
  const [newColLabel, setNewColLabel] = useState('');
  const [newColSemanticKey, setNewColSemanticKey] = useState('');
  const [newColType, setNewColType] = useState<TechnicalValue['type']>('number');
  const [newColUnit, setNewColUnit] = useState('');

  const [newRowLabel, setNewRowLabel] = useState('');
  const [newRowSemanticKey, setNewRowSemanticKey] = useState('');

  const currentDataset = workbook.datasets.find((d) => d.id === selectedDatasetId) ?? workbook.datasets[0];

  // Aplicar Template
  const handleApplyTemplate = (tpl: DatasetTemplate) => {
    if (effectiveKnowledge.modules.length === 0) {
      alert('Crie ao menos um módulo técnico antes de adicionar tabelas.');
      return;
    }
    const targetMod = effectiveKnowledge.modules[0];
    try {
      const { updatedWorkbook, createdDataset } = instantiateDatasetFromTemplate({
        template: tpl,
        targetWorkbook: workbook,
        targetModuleId: targetMod.id
      });
      onUpdateWorkbook(updatedWorkbook);
      setSelectedDatasetId(createdDataset.id);
      setIsTemplateModalOpen(false);
    } catch (err: any) {
      alert(`Erro ao instanciar modelo: ${err.message}`);
    }
  };

  // Criar Tabela Vazia (Item 7)
  const handleCreateEmptyDataset = (data: Omit<TechnicalDataset, 'id' | 'order'>) => {
    try {
      const newDatasetId = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newDs: TechnicalDataset = {
        ...data,
        id: newDatasetId,
        order: workbook.datasets.length
      };
      const updated = addDataset(workbook, newDs);
      onUpdateWorkbook(updated);
      setSelectedDatasetId(newDatasetId);
    } catch (err: any) {
      alert(`Erro ao criar tabela vazia: ${err.message}`);
    }
  };

  // Excluir Dataset
  const handleDeleteDataset = (datasetId: string) => {
    if (confirm('Deseja realmente remover esta tabela técnica do produto?')) {
      try {
        const updated = deleteDataset(workbook, datasetId);
        onUpdateWorkbook(updated);
        setSelectedDatasetId(updated.datasets.length > 0 ? updated.datasets[0].id : null);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  // Adicionar Coluna
  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDataset) return;

    const label = newColLabel.trim();
    const semanticKey = newColSemanticKey.trim().toLowerCase();
    if (!label || !semanticKey) {
      alert('Preencha o rótulo e a chave semântica da coluna.');
      return;
    }

    try {
      const colId = `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const updated = addDatasetColumn(workbook, currentDataset.id, {
        id: colId,
        semanticKey,
        label,
        valueType: newColType,
        unit: (newColUnit.trim() as any) || undefined,
        order: currentDataset.columns.length
      });
      onUpdateWorkbook(updated);
      setIsAddColumnModalOpen(false);
      setNewColLabel('');
      setNewColSemanticKey('');
      setNewColUnit('');
    } catch (err: any) {
      alert(`Erro ao adicionar coluna: ${err.message}`);
    }
  };

  // Excluir Coluna
  const handleDeleteColumn = (colId: string, colLabel: string) => {
    if (!currentDataset) return;
    if (confirm(`Remover a coluna "${colLabel}" e todos os dados associados a ela?`)) {
      try {
        const updated = deleteDatasetColumn(workbook, currentDataset.id, colId);
        onUpdateWorkbook(updated);
      } catch (err: any) {
        alert(`Erro ao remover coluna: ${err.message}`);
      }
    }
  };

  // Reordenar Colunas
  const handleMoveColumn = (colIndex: number, direction: 'left' | 'right') => {
    if (!currentDataset) return;
    const targetIndex = direction === 'left' ? colIndex - 1 : colIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentDataset.columns.length) return;

    const newCols = [...currentDataset.columns];
    const temp = newCols[colIndex];
    newCols[colIndex] = newCols[targetIndex];
    newCols[targetIndex] = temp;

    const updated = reorderDatasetColumns(
      workbook,
      currentDataset.id,
      newCols.map((c) => c.id)
    );
    onUpdateWorkbook(updated);
  };

  // Adicionar Linha
  const handleAddRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDataset) return;

    const label = newRowLabel.trim();
    if (!label) {
      alert('Preencha o rótulo da linha.');
      return;
    }

    try {
      const rowId = `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const updated = addDatasetRow(workbook, currentDataset.id, {
        id: rowId,
        semanticKey: newRowSemanticKey.trim().toLowerCase() || undefined,
        label,
        order: currentDataset.rows.length
      });
      onUpdateWorkbook(updated);
      setIsAddRowModalOpen(false);
      setNewRowLabel('');
      setNewRowSemanticKey('');
    } catch (err: any) {
      alert(`Erro ao adicionar linha: ${err.message}`);
    }
  };

  // Excluir Linha
  const handleDeleteRow = (rowId: string, rowLabel: string) => {
    if (!currentDataset) return;
    if (confirm(`Remover a linha "${rowLabel}" e todos os dados associados a ela?`)) {
      try {
        const updated = deleteDatasetRow(workbook, currentDataset.id, rowId);
        onUpdateWorkbook(updated);
      } catch (err: any) {
        alert(`Erro ao remover linha: ${err.message}`);
      }
    }
  };

  // Reordenar Linhas
  const handleMoveRow = (rowIndex: number, direction: 'up' | 'down') => {
    if (!currentDataset) return;
    const targetIndex = direction === 'up' ? rowIndex - 1 : rowIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentDataset.rows.length) return;

    const newRows = [...currentDataset.rows];
    const temp = newRows[rowIndex];
    newRows[rowIndex] = newRows[targetIndex];
    newRows[targetIndex] = temp;

    const updated = reorderDatasetRows(
      workbook,
      currentDataset.id,
      newRows.map((r) => r.id)
    );
    onUpdateWorkbook(updated);
  };

  // Salvar Valor de Célula Tipada (Item 7)
  const handleSaveCell = (
    value: TechnicalValue,
    datumLabel?: string,
    status: DatumStatus = 'draft'
  ) => {
    if (!currentDataset || !editingCellCoords) return;
    const { row, col } = editingCellCoords;
    const cellKey = getDatasetCellKey(row.id, col.id);
    const existingCell = currentDataset.cells[cellKey];

    try {
      let updatedWb = workbook;

      if (existingCell && updatedWb.data[existingCell.datumId]) {
        // Atualiza valor do TechnicalDatum existente
        const updatedRaw = updateDatumValue(updatedWb, existingCell.datumId, value);
        updatedWb = {
          ...updatedWb,
          data: updatedRaw.data
        };

        // Atualiza label/status se fornecidos
        if (datumLabel || status) {
          const currentDatum = updatedWb.data[existingCell.datumId];
          const updatedDatum: TechnicalDatum = {
            ...currentDatum,
            label: datumLabel || currentDatum.label,
            status: status ?? currentDatum.status,
            audit: {
              ...currentDatum.audit,
              createdAt: currentDatum.audit?.createdAt ?? new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          };

          updatedWb = {
            ...updatedWb,
            data: {
              ...updatedWb.data,
              [existingCell.datumId]: updatedDatum
            }
          };
        }
      } else {
        // Cria novo TechnicalDatum canônico e associa à célula
        const datumId = `dtm_${currentDataset.id}_${row.id}_${col.id}_${Date.now()}`;
        const datumSemanticKey = `${currentDataset.semanticKey}.${row.id}.${col.id}`;

        const newDatum = {
          semanticKey: datumSemanticKey,
          moduleId: currentDataset.moduleId,
          label: datumLabel || `${row.label || row.semanticKey || 'Linha'} — ${col.label}`,
          value,
          evidence: [],
          status,
          audit: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        };

        const wbWithDatum = addDatum(updatedWb, newDatum, datumId) as ProductWorkbookV2;
        updatedWb = setDatasetCell(wbWithDatum, currentDataset.id, {
          rowId: row.id,
          columnId: col.id,
          datumId
        });
      }

      onUpdateWorkbook(updatedWb);
    } catch (err: any) {
      alert(`Erro ao salvar célula: ${err.message}`);
    }
  };

  // Limpar Célula
  const handleClearCell = () => {
    if (!currentDataset || !editingCellCoords) return;
    const { row, col } = editingCellCoords;
    try {
      const updated = clearDatasetCell(workbook, currentDataset.id, row.id, col.id);
      onUpdateWorkbook(updated);
    } catch (err: any) {
      alert(`Erro ao limpar célula: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Topo: Seletor de Tabelas e Ações Globais */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 max-w-2xl">
          {workbook.datasets.map((ds) => {
            const isActive = ds.id === currentDataset?.id;
            return (
              <button
                key={ds.id}
                onClick={() => setSelectedDatasetId(ds.id)}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-[#003366] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                <span>{ds.label}</span>
                <span className="text-[10px] opacity-75 font-mono">
                  ({ds.columns.length}x{ds.rows.length})
                </span>
              </button>
            );
          })}

          {workbook.datasets.length === 0 && (
            <span className="text-xs text-slate-400 italic">
              Nenhuma tabela técnica definida neste produto.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsNewDatasetModalOpen(true)}
            className="px-3 py-1.5 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Tabela Vazia</span>
          </button>

          <button
            onClick={() => setIsTemplateModalOpen(true)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded flex items-center gap-1.5 transition-colors border border-slate-300 cursor-pointer"
          >
            <LayoutTemplate className="w-3.5 h-3.5 text-[#003366]" />
            <span>Usar Modelo Padronizado</span>
          </button>
        </div>
      </div>

      {/* Exibição e Edição da Tabela Selecionada */}
      {currentDataset ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
          {/* Header da Tabela */}
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">{currentDataset.label}</h3>
                <span className="text-[10px] font-mono text-[#003366] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-bold">
                  {currentDataset.kind}
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {currentDataset.semanticKey}
                </span>
              </div>
              {currentDataset.description && (
                <p className="text-xs text-slate-500 mt-0.5">{currentDataset.description}</p>
              )}
            </div>

            {/* Ações da Tabela */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsAddColumnModalOpen(true)}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 text-[#003366]" />
                <span>Adicionar Coluna</span>
              </button>

              <button
                onClick={() => setIsAddRowModalOpen(true)}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-600" />
                <span>Adicionar Linha</span>
              </button>

              <div className="h-4 w-px bg-slate-300 mx-1" />

              <button
                onClick={() => setCrossProductMode('copy')}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="Copiar apenas a estrutura tabular (colunas/linhas vazias) para outro produto"
              >
                <Copy className="w-3.5 h-3.5 text-[#003366]" />
                <span>Copiar Estrutura...</span>
              </button>

              <button
                onClick={() => setCrossProductMode('clone')}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="Clonar tabela completa com novos TechnicalDatum IDs para outro produto"
              >
                <GitBranch className="w-3.5 h-3.5 text-emerald-600" />
                <span>Clonar Tabela...</span>
              </button>

              <button
                onClick={() => handleDeleteDataset(currentDataset.id)}
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                title="Excluir tabela técnica"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Grid Renderizado e Interativo */}
          <div className="overflow-x-auto p-2">
            <table className="w-full text-left border-collapse border border-slate-200 text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="p-2.5 border-r border-slate-200 bg-slate-200/60 w-44">
                    <div className="flex items-center justify-between">
                      <span>Parâmetro / Linha</span>
                      <button
                        onClick={() => setIsAddRowModalOpen(true)}
                        className="p-1 hover:bg-slate-300/60 rounded text-slate-600 cursor-pointer"
                        title="Adicionar Linha"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </th>

                  {currentDataset.columns.map((col, colIdx) => (
                    <th key={col.id} className="p-2.5 border-r border-slate-200 min-w-[150px]">
                      <div className="flex items-center justify-between gap-1">
                        <div>
                          <div className="font-bold text-slate-900">{col.label}</div>
                          <div className="text-[10px] font-mono font-normal text-slate-500">
                            {col.valueType}{col.unit ? ` (${col.unit})` : ''}
                          </div>
                        </div>

                        {/* Ações da Coluna (Reordenar e Excluir) */}
                        <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
                          <button
                            disabled={colIdx === 0}
                            onClick={() => handleMoveColumn(colIdx, 'left')}
                            className="p-1 hover:bg-slate-200 rounded disabled:opacity-20 cursor-pointer"
                            title="Mover coluna para esquerda"
                          >
                            <ArrowLeft className="w-3 h-3" />
                          </button>
                          <button
                            disabled={colIdx === currentDataset.columns.length - 1}
                            onClick={() => handleMoveColumn(colIdx, 'right')}
                            className="p-1 hover:bg-slate-200 rounded disabled:opacity-20 cursor-pointer"
                            title="Mover coluna para direita"
                          >
                            <ArrowRight className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteColumn(col.id, col.label)}
                            className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Remover coluna"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}

                  {currentDataset.columns.length === 0 && (
                    <th className="p-3 text-center text-slate-400 italic font-normal">
                      Nenhuma coluna definida nesta tabela. Clique em "+ Adicionar Coluna".
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {currentDataset.rows.map((row, rowIdx) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="p-2.5 font-bold text-slate-800 bg-slate-50/80 border-r border-slate-200">
                      <div className="flex items-center justify-between gap-1">
                        <div>
                          <div>{row.label || row.semanticKey}</div>
                          {row.semanticKey && (
                            <div className="text-[10px] font-mono font-normal text-slate-400">{row.semanticKey}</div>
                          )}
                        </div>

                        {/* Ações da Linha (Reordenar e Excluir) */}
                        <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
                          <button
                            disabled={rowIdx === 0}
                            onClick={() => handleMoveRow(rowIdx, 'up')}
                            className="p-1 hover:bg-slate-200 rounded disabled:opacity-20 cursor-pointer"
                            title="Mover linha para cima"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            disabled={rowIdx === currentDataset.rows.length - 1}
                            onClick={() => handleMoveRow(rowIdx, 'down')}
                            className="p-1 hover:bg-slate-200 rounded disabled:opacity-20 cursor-pointer"
                            title="Mover linha para baixo"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteRow(row.id, row.label || row.id)}
                            className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Remover linha"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Células de Dados */}
                    {currentDataset.columns.map((col) => {
                      const cellKey = getDatasetCellKey(row.id, col.id);
                      const cell = currentDataset.cells[cellKey];
                      const datum = cell ? workbook.data[cell.datumId] : null;

                      return (
                        <td
                          key={col.id}
                          onClick={() => setEditingCellCoords({ row, col })}
                          className="p-2 border-r border-slate-200 cursor-pointer hover:bg-blue-50/50 transition-colors group"
                        >
                          {datum ? (
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono font-bold text-slate-900">
                                {formatTechnicalValue(datum.value)}
                              </span>
                              <div className="flex items-center gap-1">
                                <span
                                  className={`text-[9px] font-bold px-1 rounded ${
                                    datum.status === 'verified'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}
                                >
                                  {datum.status === 'verified' ? '✓' : 'draft'}
                                </span>
                                <Edit2 className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between text-slate-300 group-hover:text-[#003366] text-[11px]">
                              <span className="italic">— vazio —</span>
                              <span className="opacity-0 group-hover:opacity-100 text-[10px] font-bold bg-blue-100 text-[#003366] px-1 rounded">
                                + Preencher
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {currentDataset.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={currentDataset.columns.length + 1}
                      className="p-6 text-center text-slate-400 italic"
                    >
                      Esta tabela ainda não possui linhas configuradas. Clique em "+ Adicionar Linha".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-slate-400">
          <Table className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-xs font-bold text-slate-600">Nenhuma tabela técnica selecionada</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Crie uma tabela técnica vazia ou utilize um modelo padronizado para estruturar especificações e matrizes.
          </p>
        </div>
      )}

      {/* Modal de Modelos Padronizados (CANONICAL_DATASET_TEMPLATES) */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 font-bold text-xs text-slate-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="w-4 h-4 text-[#003366]" />
                <span>Modelos Padronizados de Tabelas Técnicas (PIM.REUSE1.4)</span>
              </div>
              <button onClick={() => setIsTemplateModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-blue-900 text-[11px] leading-relaxed">
                <strong>Garantia de Integridade:</strong> Templates definem apenas a estrutura, colunas e tipagem.
                Eles contêm <strong>ZERO fatos técnicos fabricados</strong>. As células são criadas vazias para preenchimento auditado.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CANONICAL_DATASET_TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="border border-slate-200 rounded-lg p-3 hover:border-[#003366] transition-colors flex flex-col justify-between bg-slate-50/50"
                  >
                    <div>
                      <div className="font-bold text-slate-900 mb-0.5">{tpl.name}</div>
                      <div className="text-[11px] text-slate-500 mb-2 leading-tight">
                        {tpl.description}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mb-3">
                        {tpl.columns.length} colunas · tipo: {tpl.kind}
                      </div>
                    </div>

                    <button
                      onClick={() => handleApplyTemplate(tpl)}
                      className="w-full py-1.5 bg-[#003366] hover:bg-[#002244] text-white font-bold rounded text-xs transition-colors cursor-pointer"
                    >
                      Instanciar neste Produto
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Criar Nova Tabela Vazia (Item 7) */}
      <NewDatasetModal
        isOpen={isNewDatasetModalOpen}
        onClose={() => setIsNewDatasetModalOpen(false)}
        modules={effectiveKnowledge.modules}
        existingSemanticKeys={workbook.datasets.map((d) => d.semanticKey)}
        onCreateDataset={handleCreateEmptyDataset}
      />

      {/* Modal Adicionar Coluna (Item 7) */}
      {isAddColumnModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800">Adicionar Coluna à Tabela</h3>
              <button onClick={() => setIsAddColumnModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleAddColumn} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Rótulo da Coluna *</label>
                <input
                  type="text"
                  value={newColLabel}
                  onChange={(e) => {
                    setNewColLabel(e.target.value);
                    if (!newColSemanticKey) {
                      setNewColSemanticKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '.').slice(0, 30));
                    }
                  }}
                  placeholder="Ex: Exatidão Calibrada"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Chave Semântica (semanticKey) *</label>
                <input
                  type="text"
                  value={newColSemanticKey}
                  onChange={(e) => setNewColSemanticKey(e.target.value)}
                  placeholder="Ex: col.accuracy"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Dado *</label>
                  <select
                    value={newColType}
                    onChange={(e) => setNewColType(e.target.value as any)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                  >
                    <option value="number">Numérico</option>
                    <option value="text">Texto</option>
                    <option value="range">Faixa (Range)</option>
                    <option value="boolean">Booleano</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unidade (opcional)</label>
                  <input
                    type="text"
                    value={newColUnit}
                    onChange={(e) => setNewColUnit(e.target.value)}
                    placeholder="Ex: °C, bar, %"
                    className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddColumnModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded text-xs font-bold"
                >
                  Adicionar Coluna
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adicionar Linha (Item 7) */}
      {isAddRowModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800">Adicionar Linha à Tabela</h3>
              <button onClick={() => setIsAddRowModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleAddRow} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Rótulo da Linha *</label>
                <input
                  type="text"
                  value={newRowLabel}
                  onChange={(e) => {
                    setNewRowLabel(e.target.value);
                    if (!newRowSemanticKey) {
                      setNewRowSemanticKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '.').slice(0, 30));
                    }
                  }}
                  placeholder="Ex: Faixa 0 a 100 °C"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Chave Semântica (opcional)</label>
                <input
                  type="text"
                  value={newRowSemanticKey}
                  onChange={(e) => setNewRowSemanticKey(e.target.value)}
                  placeholder="Ex: row.temp_0_100"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-xs"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddRowModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded text-xs font-bold"
                >
                  Adicionar Linha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição de Célula Tipada (Item 7) */}
      {editingCellCoords && currentDataset && (
        <CellEditorModal
          isOpen={Boolean(editingCellCoords)}
          onClose={() => setEditingCellCoords(null)}
          dataset={currentDataset}
          row={editingCellCoords.row}
          column={editingCellCoords.col}
          currentDatum={
            (() => {
              const cellKey = getDatasetCellKey(editingCellCoords.row.id, editingCellCoords.col.id);
              const cell = currentDataset.cells[cellKey];
              return cell ? workbook.data[cell.datumId] : null;
            })()
          }
          onSaveCell={handleSaveCell}
          onClearCell={handleClearCell}
        />
      )}

      {/* Modal Cross-Product Copy / Clone (Itens 8 e 9) */}
      {crossProductMode && currentDataset && (
        <CrossProductTransferModal
          isOpen={Boolean(crossProductMode)}
          onClose={() => setCrossProductMode(null)}
          sourceDataset={currentDataset}
          sourceWorkbook={workbook}
          currentProduct={product}
          availableProducts={availableProducts}
          repository={repository}
          mode={crossProductMode}
        />
      )}
    </div>
  );
};
