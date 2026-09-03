// src/components/library/product-workspace/WorkspaceTechnicalTablesTab.tsx
// FASE 12 & PIM.REUSE1.5: Tab Tabelas Técnicas Estruturadas com Reuse, Copy, Clone & Templates

import React, { useState } from 'react';
import {
  Table,
  Copy,
  GitBranch,
  LayoutTemplate,
  Trash2
} from 'lucide-react';
import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  CANONICAL_DATASET_TEMPLATES,
  DatasetTemplate,
  copyDatasetStructure,
  cloneDataset,
  instantiateDatasetFromTemplate,
  getDatasetCellKey,
  formatTechnicalValue,
  deleteDataset
} from '../../../domain/product-workbook';
import { Product } from '../../../domain/product.schema';

interface WorkspaceTechnicalTablesTabProps {
  product: Product;
  workbook: ProductWorkbookV2;
  effectiveKnowledge: ResolvedProductKnowledge;
  onUpdateWorkbook: (updated: ProductWorkbookV2) => void;
  availableProducts?: readonly Product[];
}

export const WorkspaceTechnicalTablesTab: React.FC<WorkspaceTechnicalTablesTabProps> = ({
  workbook,
  effectiveKnowledge,
  onUpdateWorkbook
}) => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(
    workbook.datasets.length > 0 ? workbook.datasets[0].id : null
  );

  // Modal de Templates
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  const currentDataset = workbook.datasets.find((d) => d.id === selectedDatasetId) ?? workbook.datasets[0];

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

  const handleCopyStructure = (sourceDataset: typeof currentDataset) => {
    if (!sourceDataset) return;
    try {
      const suffix = Math.random().toString(36).slice(2, 6);
      const { updatedWorkbook, createdDataset } = copyDatasetStructure({
        sourceDataset,
        targetWorkbook: workbook,
        targetModuleId: sourceDataset.moduleId,
        options: {
          newSemanticKey: `${sourceDataset.semanticKey}.cp_${suffix}`,
          newLabel: `${sourceDataset.label} (Estrutura Vazia)`
        }
      });
      onUpdateWorkbook(updatedWorkbook);
      setSelectedDatasetId(createdDataset.id);
      alert('Estrutura copiada com sucesso! Células limpas prontas para novos valores.');
    } catch (err: any) {
      alert(`Erro ao copiar estrutura: ${err.message}`);
    }
  };

  const handleCloneIndependent = (sourceDataset: typeof currentDataset) => {
    if (!sourceDataset) return;
    try {
      const suffix = Math.random().toString(36).slice(2, 6);
      const { updatedWorkbook, createdDataset } = cloneDataset({
        sourceDataset,
        sourceWorkbook: workbook,
        targetWorkbook: workbook,
        targetModuleId: sourceDataset.moduleId,
        options: {
          newSemanticKey: `${sourceDataset.semanticKey}.cl_${suffix}`,
          newLabel: `${sourceDataset.label} (Clone Independente)`,
          preserveEvidence: false
        }
      });
      onUpdateWorkbook(updatedWorkbook);
      setSelectedDatasetId(createdDataset.id);
      alert('Tabela clonada com sucesso com novos datum IDs independentes.');
    } catch (err: any) {
      alert(`Erro ao clonar tabela: ${err.message}`);
    }
  };

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

  return (
    <div className="space-y-4">
      {/* Topo: Seletor de Tabelas e Ações Globais */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
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
            onClick={() => setIsTemplateModalOpen(true)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded flex items-center gap-1.5 transition-colors border border-slate-300 cursor-pointer"
          >
            <LayoutTemplate className="w-3.5 h-3.5 text-[#003366]" />
            <span>Usar Modelo Padronizado</span>
          </button>
        </div>
      </div>

      {/* Exibição da Tabela Selecionada */}
      {currentDataset ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
          {/* Header da Tabela */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
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

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyStructure(currentDataset)}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
                title="Copiar apenas a estrutura (colunas e linhas) com células vazias"
              >
                <Copy className="w-3 h-3 text-[#003366]" />
                <span>Copiar Estrutura</span>
              </button>

              <button
                onClick={() => handleCloneIndependent(currentDataset)}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
                title="Clonar tabela completa com novos TechnicalDatum IDs isolados"
              >
                <GitBranch className="w-3 h-3 text-emerald-600" />
                <span>Clonar Tabela</span>
              </button>

              <button
                onClick={() => handleDeleteDataset(currentDataset.id)}
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                title="Excluir tabela"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Grid Renderizado */}
          <div className="overflow-x-auto p-2">
            <table className="w-full text-left border-collapse border border-slate-200 text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="p-2.5 border-r border-slate-200 bg-slate-200/60 w-40">
                    Parâmetro / Linha
                  </th>
                  {currentDataset.columns.map((col) => (
                    <th key={col.id} className="p-2.5 border-r border-slate-200 min-w-[140px]">
                      <div>{col.label}</div>
                      <div className="text-[10px] font-mono font-normal text-slate-400">
                        {col.valueType}{col.unit ? ` (${col.unit})` : ''}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentDataset.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="p-2.5 font-bold text-slate-800 bg-slate-50/80 border-r border-slate-200">
                      <div>{row.label || row.semanticKey}</div>
                      {row.semanticKey && (
                        <div className="text-[10px] font-mono text-slate-400">{row.semanticKey}</div>
                      )}
                    </td>

                    {currentDataset.columns.map((col) => {
                      const cellKey = getDatasetCellKey(row.id, col.id);
                      const cell = currentDataset.cells[cellKey];
                      const datum = cell ? workbook.data[cell.datumId] : null;

                      return (
                        <td key={col.id} className="p-2.5 border-r border-slate-200">
                          {datum ? (
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-slate-900">
                                {formatTechnicalValue(datum.value)}
                              </span>
                              <span className={`text-[9px] font-bold px-1 rounded ${
                                datum.status === 'verified'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}>
                                {datum.status === 'verified' ? '✓' : 'draft'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">— vazio —</span>
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
                      Esta tabela ainda não possui linhas configuradas.
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
            Utilize os modelos padronizados acima para criar matrizes de exatidão, tabelas de acessórios ou códigos de pedido.
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
    </div>
  );
};
