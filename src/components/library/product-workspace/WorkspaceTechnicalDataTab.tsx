// src/components/library/product-workspace/WorkspaceTechnicalDataTab.tsx
// FASE 11: Tab Dados Técnicos Canônicos com CRUD, Filtros e Formatação Tipada

import React, { useState } from 'react';
import {
  Plus,
  Search,
  Trash2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Layers
} from 'lucide-react';
import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  TechnicalValue,
  UnitCode,
  formatTechnicalValue,
  addDatum,
  deleteDatum
} from '../../../domain/product-workbook';
import { NewModuleModal } from './NewModuleModal';

interface WorkspaceTechnicalDataTabProps {
  workbook: ProductWorkbookV2;
  effectiveKnowledge: ResolvedProductKnowledge;
  onUpdateWorkbook: (updated: ProductWorkbookV2) => void;
}

export const WorkspaceTechnicalDataTab: React.FC<WorkspaceTechnicalDataTabProps> = ({
  workbook,
  effectiveKnowledge,
  onUpdateWorkbook
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [isNewModuleModalOpen, setIsNewModuleModalOpen] = useState(false);

  // Modal de Adicionar Dado
  const [isAdding, setIsAdding] = useState(false);
  const [newSemanticKey, setNewSemanticKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newModuleId, setNewModuleId] = useState('');
  const [newValueType, setNewValueType] = useState<TechnicalValue['type']>('text');
  const [newTextVal, setNewTextVal] = useState('');
  const [newAmountVal, setNewAmountVal] = useState<number>(0);
  const [newUnitVal, setNewUnitVal] = useState<UnitCode>('°C');
  const [newLowerVal, setNewLowerVal] = useState<number>(0);
  const [newUpperVal, setNewUpperVal] = useState<number>(100);

  const allEffective = Array.from(effectiveKnowledge.effectiveData.values());

  const filtered = allEffective.filter((eff) => {
    if (selectedModuleId !== 'all' && eff.datum.moduleId !== selectedModuleId) {
      return false;
    }
    if (statusFilter !== 'all' && eff.effectiveStatus !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchKey = eff.datum.semanticKey.toLowerCase().includes(q);
      const matchLabel = eff.datum.label.toLowerCase().includes(q);
      const matchVal = formatTechnicalValue(eff.datum.value).toLowerCase().includes(q);
      if (!matchKey && !matchLabel && !matchVal) return false;
    }
    return true;
  });

  const handleCreateDatum = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSemanticKey || !newLabel || !newModuleId) return;

    let value: TechnicalValue;
    if (newValueType === 'text') {
      value = { type: 'text', value: newTextVal };
    } else if (newValueType === 'quantity') {
      value = { type: 'quantity', amount: Number(newAmountVal), unit: newUnitVal };
    } else if (newValueType === 'range') {
      value = { type: 'range', lower: Number(newLowerVal), upper: Number(newUpperVal), unit: newUnitVal };
    } else if (newValueType === 'boolean') {
      value = { type: 'boolean', value: newTextVal === 'true' };
    } else {
      value = { type: 'technical_token', token: newTextVal };
    }

    try {
      const updated = addDatum(
        workbook,
        {
          semanticKey: newSemanticKey,
          moduleId: newModuleId,
          label: newLabel,
          value,
          evidence: [],
          status: 'draft'
        }
      ) as ProductWorkbookV2;

      onUpdateWorkbook(updated);
      setIsAdding(false);
      setNewSemanticKey('');
      setNewLabel('');
      setNewTextVal('');
    } catch (err: any) {
      alert(`Erro ao criar dado técnico: ${err.message}`);
    }
  };

  const handleDelete = (datumId: string) => {
    if (confirm('Deseja realmente remover este dado técnico do produto?')) {
      try {
        const updated = deleteDatum(workbook, datumId) as ProductWorkbookV2;
        onUpdateWorkbook(updated);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de Filtros e Busca */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por chave, rótulo ou valor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:border-[#003366]"
            />
          </div>

          <select
            value={selectedModuleId}
            onChange={(e) => setSelectedModuleId(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:bg-white focus:outline-none focus:border-[#003366]"
          >
            <option value="all">Todos os Módulos</option>
            {effectiveKnowledge.modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:bg-white focus:outline-none focus:border-[#003366]"
          >
            <option value="all">Todos os Status</option>
            <option value="verified">Verificado</option>
            <option value="draft">Rascunho</option>
            <option value="conflicting">Em Conflito</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsNewModuleModalOpen(true)}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-[#003366]" />
            <span>Novo Módulo</span>
          </button>

          <button
            type="button"
            disabled={effectiveKnowledge.modules.length === 0}
            onClick={() => {
              if (effectiveKnowledge.modules.length > 0) {
                setNewModuleId(effectiveKnowledge.modules[0].id);
              }
              setIsAdding(true);
            }}
            title={effectiveKnowledge.modules.length === 0 ? 'Crie um módulo primeiro' : 'Criar dado técnico'}
            className={`px-3 py-1.5 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer ${
              effectiveKnowledge.modules.length === 0
                ? 'bg-slate-400 cursor-not-allowed opacity-60'
                : 'bg-[#003366] hover:bg-[#002244]'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Dado Técnico</span>
          </button>
        </div>
      </div>

      {effectiveKnowledge.modules.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-lg text-xs text-amber-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Nenhum módulo técnico disponível:</strong> Para adicionar dados técnicos canônicos ou tabelas, você deve primeiro criar ao menos um módulo.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsNewModuleModalOpen(true)}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold shrink-0 cursor-pointer shadow-xs"
          >
            Criar Primeiro Módulo
          </button>
        </div>
      )}

      {/* Tabela de Dados Técnicos */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold">
              <th className="py-2.5 px-3">Chave Semântica / Módulo</th>
              <th className="py-2.5 px-3">Rótulo / Descrição</th>
              <th className="py-2.5 px-3">Valor Canônico</th>
              <th className="py-2.5 px-3 text-center">Origem</th>
              <th className="py-2.5 px-3 text-center">Status</th>
              <th className="py-2.5 px-3 text-center">Evidências</th>
              <th className="py-2.5 px-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((eff) => {
              const datum = eff.datum;
              const formattedVal = formatTechnicalValue(datum.value);
              const isLocal = eff.origin === 'product_local';

              return (
                <tr key={datum.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="font-mono text-xs font-semibold text-slate-900">{datum.semanticKey}</div>
                    <div className="text-[10px] text-slate-400">
                      {effectiveKnowledge.modules.find((m) => m.id === datum.moduleId)?.label ?? datum.moduleId}
                    </div>
                  </td>

                  <td className="py-2.5 px-3">
                    <div className="font-medium text-slate-800">{datum.label}</div>
                    {datum.description && (
                      <div className="text-[10px] text-slate-500 truncate max-w-xs">{datum.description}</div>
                    )}
                  </td>

                  <td className="py-2.5 px-3">
                    <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {formattedVal}
                    </span>
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    {eff.origin === 'family' && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        Família
                      </span>
                    )}
                    {eff.origin === 'product_local' && (
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        Local
                      </span>
                    )}
                    {eff.origin === 'product_override' && (
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                        Override
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    {eff.effectiveStatus === 'verified' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Verificado
                      </span>
                    )}
                    {eff.effectiveStatus === 'draft' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        <Clock className="w-3 h-3" />
                        Rascunho
                      </span>
                    )}
                    {eff.effectiveStatus === 'conflicting' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                        <AlertTriangle className="w-3 h-3" />
                        Conflito
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    <span className="text-xs font-mono text-slate-600">
                      {datum.evidence.length} {datum.evidence.length === 1 ? 'fonte' : 'fontes'}
                    </span>
                  </td>

                  <td className="py-2.5 px-3 text-right">
                    {isLocal && (
                      <button
                        onClick={() => handleDelete(datum.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Remover dado local"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                  Nenhum dado técnico encontrado para os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Criar Novo Dado Técnico */}
      {isAdding && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 font-bold text-xs text-slate-800 flex justify-between items-center">
              <span>Adicionar Novo Dado Técnico Canônico</span>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleCreateDatum} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Módulo Pai</label>
                <select
                  value={newModuleId}
                  onChange={(e) => setNewModuleId(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded bg-slate-50 focus:bg-white"
                  required
                >
                  {effectiveKnowledge.modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.semanticKey})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Chave Semântica (namespace.segment)</label>
                <input
                  type="text"
                  placeholder="ex: metrology.temperature.range"
                  value={newSemanticKey}
                  onChange={(e) => setNewSemanticKey(e.target.value.toLowerCase())}
                  className="w-full p-2 border border-slate-300 rounded font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Rótulo / Nome Técnico</label>
                <input
                  type="text"
                  placeholder="ex: Faixa de Operação"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Valor</label>
                <select
                  value={newValueType}
                  onChange={(e) => setNewValueType(e.target.value as any)}
                  className="w-full p-2 border border-slate-300 rounded bg-slate-50"
                >
                  <option value="text">Texto Técnico</option>
                  <option value="quantity">Quantidade com Unidade</option>
                  <option value="range">Faixa Numérica (Range)</option>
                  <option value="boolean">Booleano</option>
                  <option value="technical_token">Token Técnico / Código</option>
                </select>
              </div>

              {newValueType === 'text' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Valor Texto</label>
                  <input
                    type="text"
                    value={newTextVal}
                    onChange={(e) => setNewTextVal(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded"
                    required
                  />
                </div>
              )}

              {newValueType === 'quantity' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Quantidade</label>
                    <input
                      type="number"
                      step="any"
                      value={newAmountVal}
                      onChange={(e) => setNewAmountVal(Number(e.target.value))}
                      className="w-full p-2 border border-slate-300 rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Unidade</label>
                    <input
                      type="text"
                      value={newUnitVal}
                      onChange={(e) => setNewUnitVal(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded"
                      required
                    />
                  </div>
                </div>
              )}

              {newValueType === 'range' && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Mínimo</label>
                    <input
                      type="number"
                      step="any"
                      value={newLowerVal}
                      onChange={(e) => setNewLowerVal(Number(e.target.value))}
                      className="w-full p-2 border border-slate-300 rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Máximo</label>
                    <input
                      type="number"
                      step="any"
                      value={newUpperVal}
                      onChange={(e) => setNewUpperVal(Number(e.target.value))}
                      className="w-full p-2 border border-slate-300 rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Unidade</label>
                    <input
                      type="text"
                      value={newUnitVal}
                      onChange={(e) => setNewUnitVal(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#003366] text-white rounded font-bold hover:bg-[#002244]"
                >
                  Criar Dado Técnico
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <NewModuleModal
        workbook={workbook}
        isOpen={isNewModuleModalOpen}
        onClose={() => setIsNewModuleModalOpen(false)}
        onUpdateWorkbook={onUpdateWorkbook}
      />
    </div>
  );
};
