// src/components/library-v2/sections/OverviewSection.tsx
// Seção 1 da Library V2: Visão Geral e Gestão de Famílias / Modelos.

import React from 'react';
import { Product, ProductFamily } from '../../../domain/product.schema';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import {
  Layers,
  Package,
  FileSpreadsheet,
  FileCheck2,
  AlertTriangle,
  Plus,
  ArrowRight,
  ChevronRight
} from 'lucide-react';

export interface OverviewSectionProps {
  currentFamily: string;
  activeFamilyObj?: ProductFamily;
  families: readonly ProductFamily[];
  products: readonly Product[];
  selectedProduct: Product | null;
  onSelectFamily: (family: string) => void;
  onSelectProduct: (product: Product | null) => void;
  onOpenAddProduct: () => void;
  onNavigateSection: (sectionId: string) => void;
  onSwitchToClassic?: () => void;
}

const countPopulatedTechnicalFacts = (value: unknown): number => {
  if (value == null) return 0;
  if (typeof value === 'string') return value.trim().length > 0 ? 1 : 0;
  if (Array.isArray(value)) {
    return value.reduce<number>((total, item) => total + countPopulatedTechnicalFacts(item), 0);
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (total, item) => total + countPopulatedTechnicalFacts(item),
      0
    );
  }
  return 1;
};

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  currentFamily,
  activeFamilyObj,
  families,
  products,
  selectedProduct,
  onSelectFamily,
  onSelectProduct,
  onOpenAddProduct,
  onNavigateSection,
  onSwitchToClassic
}) => {
  // Produtos filtrados da família ativa
  const familyProducts = products.filter((p) => {
    if (activeFamilyObj) {
      return (
        p.family_id === activeFamilyObj.id ||
        (!p.family_id && p.family?.trim().toLowerCase() === activeFamilyObj.name.trim().toLowerCase())
      );
    }
    return p.family === currentFamily || p.family?.toLowerCase() === currentFamily.toLowerCase();
  });

  // Estatísticas agregadas
  const totalProducts = familyProducts.length;
  const sampleProduct = familyProducts[0];
  const specsCount = sampleProduct ? countPopulatedTechnicalFacts(sampleProduct.specs) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner da Família */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-lg border border-indigo-900/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-mono font-semibold border border-indigo-500/30">
                Família Ativa
              </span>
              <ContextHelpTrigger helpId="family" variant="subtle" className="text-indigo-200 hover:text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span>{currentFamily || 'Linha Geral de Produtos'}</span>
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl mt-1.5 leading-relaxed">
              {activeFamilyObj?.description ||
                'Consulte os modelos e as informações disponíveis para esta família. Estados sem autoridade carregada permanecem explicitamente indisponíveis.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenAddProduct}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-all hover:scale-105 active:scale-95"
            >
              <Plus size={15} />
              <span>Novo Modelo</span>
            </button>
            {onSwitchToClassic && (
              <button
                type="button"
                onClick={onSwitchToClassic}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 transition-colors"
                title="Alternar para a visualização clássica em tabela"
              >
                <span>Modo Clássico</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid de Métricas Técnicas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigateSection('technical-data')}
          className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Modelos Físicos
            </span>
            <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Package size={16} />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">{totalProducts}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span>Modelos cadastrados</span>
            <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        <div
          onClick={() => onNavigateSection('technical-data')}
          className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              <TermHelp helpId="technical-datum" label="Fatos Técnicos" />
            </span>
            <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <FileSpreadsheet size={16} />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">{specsCount}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span>Propriedades por modelo</span>
            <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        <div
          onClick={() => onNavigateSection('sources')}
          className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              <TermHelp helpId="evidence" label="Evidências" />
            </span>
            <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <FileCheck2 size={16} />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">—</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span>Não carregado</span>
            <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        <div
          onClick={() => onNavigateSection('conflicts')}
          className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              <TermHelp helpId="conflict" label="Conflitos" />
            </span>
            <span className="p-2 rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <AlertTriangle size={16} />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">—</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span>Não auditado</span>
            <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>

      {/* Seletor Rápido de Famílias */}
      {families.length > 1 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Layers size={14} className="text-indigo-600" />
              Alternar Família
            </span>
            <span className="text-xs text-slate-400">{families.length} famílias disponíveis</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {families.map((f) => (
              <button
                key={f.id}
                onClick={() => onSelectFamily(f.name)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                  f.name === currentFamily
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                    : 'bg-slate-50 hover:bg-indigo-50/50 text-slate-700 border-slate-200'
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lista de Modelos Físicos da Família */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Package size={16} className="text-indigo-600" />
              <span>Modelos Físicos desta Família ({familyProducts.length})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Clique em um modelo para inspecionar as informações técnicas armazenadas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ContextHelpTrigger helpId="product" variant="subtle" />
          </div>
        </div>

        {familyProducts.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-xs text-slate-500 mb-3">Nenhum modelo cadastrado nesta família ainda.</p>
            <button
              onClick={onOpenAddProduct}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-xs"
            >
              <Plus size={14} />
              <span>Cadastrar Primeiro Modelo</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {familyProducts.map((prod) => {
              const isSelected = selectedProduct?.id === prod.id;
              return (
                <div
                  key={prod.id}
                  onClick={() => onSelectProduct(isSelected ? null : prod)}
                  className={`p-4 flex items-center justify-between gap-4 hover:bg-indigo-50/40 transition-colors cursor-pointer ${
                    isSelected ? 'bg-indigo-50/80 border-l-4 border-indigo-600' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 font-mono">
                      {prod.model?.slice(0, 4) || 'PCON'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{prod.model || prod.code}</span>
                        <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {prod.code}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] font-bold uppercase bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                            Selecionado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                        {prod.description || 'Sem descrição cadastrada'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProduct(prod);
                        onNavigateSection('technical-data');
                      }}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                    >
                      <span>Abrir Dados</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
