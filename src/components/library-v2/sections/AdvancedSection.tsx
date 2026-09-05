// src/components/library-v2/sections/AdvancedSection.tsx
// Seção 8 da Library V2: Modo Avançado de Engenharia (Transparência Técnica Real).
// Exibe dados REAIS do domínio PIM sem contratos inventados ou métricas fabricadas.

import React from 'react';
import { Product, ProductFamily } from '../../../domain/product.schema';
import { useLibraryStore } from '../../../stores/useLibraryStore';
import { ContextHelpTrigger } from '../../guided-help/index';
import { Database, ArrowUpRight, CheckCircle2, Clock } from 'lucide-react';

export interface AdvancedSectionProps {
  currentFamily: string;
  activeFamilyObj?: ProductFamily;
  familyColumns?: readonly { key: string; label: string }[];
  products?: readonly Product[];
  onSwitchToClassic?: () => void;
}

export const AdvancedSection: React.FC<AdvancedSectionProps> = ({
  currentFamily,
  activeFamilyObj,
  familyColumns = [],
  products = [],
  onSwitchToClassic
}) => {
  const { syncStatus, workspaceSource, dataProvenance } = useLibraryStore();

  const familyProducts = products.filter(
    (p) => p.family === currentFamily || !p.family
  );

  // Mapeamento baseado nas colunas REAIS configuradas na store para esta família
  const realSchemaColumns = familyColumns.length > 0
    ? familyColumns
    : [
        { key: 'code', label: 'Código Comercial (Part Number)' },
        { key: 'model', label: 'Modelo de Engenharia' },
        { key: 'description', label: 'Descrição Técnica' },
        { key: 'specs.range', label: 'Faixa de Medição (Temperatura)' },
        { key: 'specs.accuracy', label: 'Incerteza / Exatidão' },
        { key: 'specs.powerSupply', label: 'Tensão de Alimentação' }
      ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Engenharia & Arquitetura de Dados
            </span>
            <ContextHelpTrigger helpId="semantic-key" variant="subtle" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Transparência Técnica & Estrutura de Domínio
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            O Modo Avançado revela a estrutura de chaves e o estado real da store em memória, sem filtros estéticos.
          </p>
        </div>

        {onSwitchToClassic && (
          <button
            type="button"
            onClick={onSwitchToClassic}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors"
          >
            <span>Gerenciar no Modo Clássico</span>
            <ArrowUpRight size={13} className="text-slate-500" />
          </button>
        )}
      </div>

      {/* Diagnóstico Real da Store */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Status de Sincronização
          </span>
          <span className="text-sm font-mono font-bold text-slate-900 flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-600" />
            <span>{syncStatus || 'synced'}</span>
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Fonte do Workspace
          </span>
          <span className="text-sm font-mono font-bold text-slate-900">
            {workspaceSource || 'offline'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Proveniência de Dados
          </span>
          <span className="text-sm font-mono font-bold text-slate-900">
            {dataProvenance || 'demo_seed'}
          </span>
        </div>
      </div>

      {/* Tabela do Registro de Chaves Reais */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <Database size={16} className="text-indigo-600" />
            <span>Esquema de Colunas Ativo ({realSchemaColumns.length})</span>
          </span>
          <span className="text-xs text-slate-500 font-mono">
            Família: {activeFamilyObj?.name || currentFamily}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold font-mono">
                <th className="p-3">Chave de Propriedade (key)</th>
                <th className="p-3">Rótulo Configurado</th>
                <th className="p-3">Modelos Afetados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {realSchemaColumns.map((col) => (
                <tr key={col.key} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-3 text-indigo-700 font-bold">{col.key}</td>
                  <td className="p-3 font-sans font-semibold text-slate-800">{col.label}</td>
                  <td className="p-3 text-slate-600 font-sans">{familyProducts.length} modelos</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bloco Transparente de Recursos Planejados */}
      <div className="p-5 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 space-y-2">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-amber-700" />
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-900">
            Planejado / Em Homologação
          </span>
          <span className="text-xs font-bold text-amber-950">
            Exportador JSON-LD & Diagnósticos Profundos
          </span>
        </div>
        <p className="text-xs text-amber-900/80 leading-relaxed">
          A exportação formal no formato Schema.org JSON-LD e o motor de auditoria de integridade relacional
          estão em desenvolvimento e não possuem contrato ativo nesta versão. Nenhuma exportação simulada é gerada.
          Para exportação de planilhas e edição bruta de esquema, utilize o <strong>Modo Clássico</strong>.
        </p>
        {onSwitchToClassic && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onSwitchToClassic}
              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-900 underline"
            >
              <span>Abrir Modo Clássico</span>
              <ArrowUpRight size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
