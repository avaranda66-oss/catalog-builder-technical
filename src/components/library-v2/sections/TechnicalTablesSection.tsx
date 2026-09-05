// src/components/library-v2/sections/TechnicalTablesSection.tsx
// Seção 3 da Library V2: Tabelas Técnicas e Datasets estruturados.
// Visualização funcional e escape hatch para o modo clássico.

import React, { useState } from 'react';
import { Product, ProductFamily } from '../../../domain/product.schema';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import { EmptyStateV2 } from '../common/EmptyStateV2';
import {
  FileSpreadsheet,
  Plus,
  Table2,
  ArrowUpRight
} from 'lucide-react';

export interface TechnicalTablesSectionProps {
  currentFamily: string;
  activeFamilyObj?: ProductFamily;
  products: readonly Product[];
  onSwitchToClassic?: () => void;
}

export const TechnicalTablesSection: React.FC<TechnicalTablesSectionProps> = ({
  currentFamily,
  products,
  onSwitchToClassic
}) => {
  const [activeTableTab, setActiveTableTab] = useState<'matrix' | 'ordering' | 'inserts'>('matrix');

  const familyProducts = products.filter((p) => p.family === currentFamily || !p.family);
  const isPopulated = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
  const labels: Record<string, string> = {
    range: 'Faixa de Medição / Trabalho',
    unit: 'Unidade',
    accuracy: 'Exatidão / Incerteza',
    output: 'Sinal de Saída / Comunicação',
    powerSupply: 'Tensão de Alimentação',
    processConnection: 'Conexão ao Processo',
    protectionDegree: 'Grau de Proteção'
  };
  const technicalKeys = Array.from(new Set(familyProducts.flatMap((product) => {
    const specs = product.specs as Record<string, unknown>;
    const customSpecs = specs.customSpecs && typeof specs.customSpecs === 'object'
      ? specs.customSpecs as Record<string, unknown>
      : {};
    return [
      ...Object.entries(specs)
        .filter(([key, value]) => key !== 'customSpecs' && isPopulated(value))
        .map(([key]) => key),
      ...Object.entries(customSpecs)
        .filter(([, value]) => isPopulated(value))
        .map(([key]) => `customSpecs.${key}`)
    ];
  })));
  const valueFor = (product: Product, key: string) => {
    if (key.startsWith('customSpecs.')) {
      const customKey = key.slice('customSpecs.'.length);
      return product.specs.customSpecs?.[customKey] || '—';
    }
    const value = (product.specs as Record<string, unknown>)[key];
    return isPopulated(value) ? value : '—';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner de Tabelas */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Tabelas Técnicas & Datasets
            </span>
            <ContextHelpTrigger helpId="dataset" variant="subtle" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Matrizes Comparativas e Tabelas de Engenharia
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            A matriz exibe somente valores técnicos armazenados nos modelos visíveis. O conceito de{' '}
            <TermHelp helpId="binding" label="vínculo" /> pode ser consultado sem atribuir uma ligação inexistente aos dados atuais.
          </p>
        </div>

        {onSwitchToClassic && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSwitchToClassic}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <Plus size={14} />
              <span>Configurar Tabelas no Modo Clássico</span>
              <ArrowUpRight size={13} className="text-indigo-200" />
            </button>
          </div>
        )}
      </div>

      {/* Seletor de Tabelas da Família */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTableTab('matrix')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            activeTableTab === 'matrix'
              ? 'bg-indigo-100 text-indigo-800'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Matriz de Modelos ({familyProducts.length})
        </button>
        <button
          onClick={() => setActiveTableTab('ordering')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            activeTableTab === 'ordering'
              ? 'bg-indigo-100 text-indigo-800'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Código de Pedido
        </button>
        <button
          onClick={() => setActiveTableTab('inserts')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            activeTableTab === 'inserts'
              ? 'bg-indigo-100 text-indigo-800'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Inserts & Acessórios
        </button>
      </div>

      {/* Renderização da Tabela Ativa */}
      {activeTableTab === 'matrix' && technicalKeys.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Table2 size={16} className="text-indigo-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Matriz Comparativa de Modelos
              </span>
            </div>
            <ContextHelpTrigger helpId="technical-table" variant="subtle" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="p-3">Código</th>
                  <th className="p-3">Modelo</th>
                  {technicalKeys.map((key) => (
                    <th key={key} className="p-3">
                      {key.startsWith('customSpecs.') ? key.slice('customSpecs.'.length) : labels[key] || key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {familyProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="p-3 font-mono font-semibold text-slate-800">{p.code}</td>
                    <td className="p-3 font-bold text-slate-900">{p.model || p.code}</td>
                    {technicalKeys.map((key) => (
                      <td key={key} className="p-3 text-slate-700 font-mono">{valueFor(p, key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTableTab === 'matrix' && technicalKeys.length === 0 && (
        <EmptyStateV2
          icon={Table2}
          title="Tabela técnica indisponível"
          whatIsIt="Esta área compara valores técnicos que estejam efetivamente armazenados nos modelos da família."
          whyIsEmpty="Nenhum valor técnico preenchido foi carregado para compor a matriz."
          conceptId="technical-table"
          primaryActionLabel={onSwitchToClassic ? 'Configurar no Modo Clássico' : undefined}
          onPrimaryAction={onSwitchToClassic}
        />
      )}

      {activeTableTab !== 'matrix' && (
        <EmptyStateV2
          icon={FileSpreadsheet}
          title={activeTableTab === 'ordering' ? 'Tabela de Código de Pedido' : 'Tabela de Inserts & Acessórios'}
          whatIsIt="Esta área reúne tabelas adicionais quando elas estiverem configuradas para a família."
          whyIsEmpty="Nenhuma tabela adicional foi carregada para esta família."
          conceptId="dataset"
          primaryActionLabel={onSwitchToClassic ? 'Configurar no Modo Clássico' : undefined}
          onPrimaryAction={onSwitchToClassic}
        />
      )}
    </div>
  );
};
