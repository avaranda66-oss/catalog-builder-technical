// src/components/library/product-workspace/WorkspaceSummaryTab.tsx
// FASE 10: Tab Resumo Técnico do Workspace PIM

import React from 'react';
import {
  FileCheck,
  AlertTriangle,
  HelpCircle,
  Table,
  BookOpen,
  GitFork
} from 'lucide-react';
import {
  ProductWorkbookV2,
  ResolvedProductKnowledge
} from '../../../domain/product-workbook';
import { Product, ProductFamily } from '../../../domain/product.schema';

interface WorkspaceSummaryTabProps {
  product: Product;
  family?: ProductFamily;
  workbook: ProductWorkbookV2;
  effectiveKnowledge: ResolvedProductKnowledge;
  onNavigateTab: (tab: 'technical_data' | 'technical_tables' | 'documents') => void;
}

export const WorkspaceSummaryTab: React.FC<WorkspaceSummaryTabProps> = ({
  product: _product,
  family,
  workbook,
  effectiveKnowledge,
  onNavigateTab
}) => {
  const allDatums = Array.from(effectiveKnowledge.effectiveData.values());
  const verifiedCount = allDatums.filter((d) => d.effectiveStatus === 'verified').length;
  const draftCount = allDatums.filter((d) => d.effectiveStatus === 'draft').length;
  const conflictCount = allDatums.filter((d) => d.effectiveStatus === 'conflicting').length;
  const familyCount = allDatums.filter((d) => d.origin === 'family').length;
  const localCount = allDatums.filter((d) => d.origin === 'product_local').length;
  const overrideCount = allDatums.filter((d) => d.origin === 'product_override').length;
  const datasetsCount = workbook.datasets.length;

  return (
    <div className="space-y-6">
      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total de Fatos</span>
            <BookOpen className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{allDatums.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {localCount} locais · {familyCount} herdados · {overrideCount} overrides
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Verificados</span>
            <FileCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{verifiedCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            Com evidências rastreáveis
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Rascunhos / Revisão</span>
            <HelpCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600">{draftCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            Requerem aferição oficial
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Tabelas Técnicas</span>
            <Table className="w-4 h-4 text-[#003366]" />
          </div>
          <div className="text-2xl font-black text-[#003366]">{datasetsCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            Datasets estruturados V2
          </div>
        </div>
      </div>

      {/* Alerta de Conflitos se houver */}
      {conflictCount > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-rose-900">
              {conflictCount} {conflictCount === 1 ? 'dado com divergência técnica' : 'dados com divergências técnicas'}
            </h4>
            <p className="text-xs text-rose-700 mt-0.5">
              Existem documentos contraditórios para os mesmos parâmetros. Acesse a aba de Dados Técnicos para registrar a Decisão Canônica.
            </p>
          </div>
        </div>
      )}

      {/* Módulos Técnicos do Conhecimento */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Módulos de Conhecimento Estruturado</h3>
            <p className="text-xs text-slate-500">Agrupamento semântico dos fatos de engenharia deste produto</p>
          </div>
          <button
            onClick={() => onNavigateTab('technical_data')}
            className="text-xs font-bold text-[#003366] hover:underline"
          >
            Ver todos os dados →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {effectiveKnowledge.modules.map((mod) => {
            const modDatums = allDatums.filter((d) => d.datum.moduleId === mod.id);
            const modDatasets = workbook.datasets.filter((ds) => ds.moduleId === mod.id);

            return (
              <div
                key={mod.id}
                className="border border-slate-200 rounded-md p-3 hover:border-[#003366] transition-colors bg-slate-50/50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-800 truncate" title={mod.label}>
                    {mod.label}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    {mod.kind}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 mb-2 truncate">
                  {mod.semanticKey}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 pt-2 border-t border-slate-200/60">
                  <span>{modDatums.length} fatos</span>
                  {modDatasets.length > 0 && (
                    <span className="text-[#003366] font-semibold">{modDatasets.length} tabelas</span>
                  )}
                </div>
              </div>
            );
          })}

          {effectiveKnowledge.modules.length === 0 && (
            <div className="col-span-full text-center py-6 text-slate-400 text-xs italic">
              Nenhum módulo cadastrado. Adicione módulos na aba de Dados Técnicos.
            </div>
          )}
        </div>
      </div>

      {/* Governança de Herança de Família */}
      {family && (
        <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-900 text-xs font-bold mb-1">
            <GitFork className="w-4 h-4 text-blue-700" />
            <span>Herança da Família "{family.name}"</span>
          </div>
          <p className="text-xs text-blue-800 leading-relaxed">
            Este produto herda {familyCount} fatos técnicos compartilhados da família sem duplicação física.
            Qualquer alteração na família reflete automaticamente aqui, a menos que um override local seja definido.
          </p>
        </div>
      )}
    </div>
  );
};
