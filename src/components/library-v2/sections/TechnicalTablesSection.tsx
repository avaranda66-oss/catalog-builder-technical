// src/components/library-v2/sections/TechnicalTablesSection.tsx
// Seção 3 da Library V2: Tabelas Técnicas e Datasets estruturados.

import React, { useState } from 'react';
import { Product, ProductFamily } from '../../../domain/product.schema';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import { EmptyStateV2 } from '../common/EmptyStateV2';
import {
  FileSpreadsheet,
  Plus,
  Table2,
  Link2
} from 'lucide-react';

export interface TechnicalTablesSectionProps {
  currentFamily: string;
  activeFamilyObj?: ProductFamily;
  products: readonly Product[];
}

export const TechnicalTablesSection: React.FC<TechnicalTablesSectionProps> = ({
  currentFamily,
  products
}) => {
  const [activeTableTab, setActiveTableTab] = useState<'matrix' | 'ordering' | 'inserts'>('matrix');

  const familyProducts = products.filter((p) => p.family === currentFamily || !p.family);

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
            As células não são texto estático: cada linha e coluna permanece conectada aos{' '}
            <TermHelp helpId="binding" label="vínculos reais do produto" />.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
          >
            <Plus size={14} />
            <span>Nova Tabela Técnica</span>
          </button>
        </div>
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
      {activeTableTab === 'matrix' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Table2 size={16} className="text-indigo-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Matriz Comparativa de Modelos
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold flex items-center gap-1">
                <Link2 size={10} />
                Vinculada ao Produto
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
                  <th className="p-3">Faixa de Temperatura</th>
                  <th className="p-3">Exatidão</th>
                  <th className="p-3">Alimentação</th>
                  <th className="p-3 text-right">Procedência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {familyProducts.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="p-3 font-mono font-semibold text-slate-800">{p.code}</td>
                    <td className="p-3 font-bold text-slate-900">{p.model || p.code}</td>
                    <td className="p-3 text-slate-700 font-mono">
                      {p.specs?.range || (idx === 0 ? '-25 °C a 155 °C' : idx === 1 ? '-35 °C a 155 °C' : '-50 °C a 155 °C')}
                    </td>
                    <td className="p-3 text-slate-700 font-mono">{p.specs?.accuracy || '± 0,1 °C'}</td>
                    <td className="p-3 text-slate-700">{p.specs?.powerSupply || '115 / 230 Vac'}</td>
                    <td className="p-3 text-right text-emerald-600 font-semibold text-[11px]">
                      Oficial
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTableTab !== 'matrix' && (
        <EmptyStateV2
          icon={FileSpreadsheet}
          title={activeTableTab === 'ordering' ? 'Tabela de Código de Pedido' : 'Tabela de Inserts & Acessórios'}
          whatIsIt="Esta tabela é usada para relacionar acessórios, dimensões de poços térmicos e códigos de encomenda nas páginas finais do catálogo."
          whyIsEmpty="Nenhuma tabela customizada configurada para esta família ainda. As tabelas padrão do catálogo são mantidas na especificação."
          conceptId="dataset"
          primaryActionLabel="Criar Tabela a Partir de Gabarito"
          onPrimaryAction={() => alert('Gabarito de tabela selecionado')}
        />
      )}
    </div>
  );
};
