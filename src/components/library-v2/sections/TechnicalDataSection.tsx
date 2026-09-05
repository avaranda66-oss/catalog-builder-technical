// src/components/library-v2/sections/TechnicalDataSection.tsx
// Seção 2 da Library V2: Informações Técnicas estruturadas com herança e overrides.
// Transparência de dados e escape hatch para o modo clássico.

import React, { useState } from 'react';
import { Product, ProductFamily } from '../../../domain/product.schema';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import {
  Plus,
  ShieldCheck,
  Code2,
  CheckCircle2,
  Layers,
  Sparkles,
  Tag,
  ArrowUpRight,
  Search
} from 'lucide-react';

export interface TechnicalDataSectionProps {
  currentFamily: string;
  activeFamilyObj?: ProductFamily;
  selectedProduct: Product | null;
  familyColumns: readonly { key: string; label: string }[];
  onOpenAddDatum?: () => void;
  onOpenSourceDrawer?: (fieldKey: string) => void;
  onSwitchToClassic?: () => void;
  onNavigateSection?: (sectionId: string) => void;
}

export const TechnicalDataSection: React.FC<TechnicalDataSectionProps> = ({
  currentFamily,
  selectedProduct,
  onSwitchToClassic,
  onNavigateSection
}) => {
  const [showSemanticKeys, setShowSemanticKeys] = useState(false);

  // Mapeamento de especificações do produto
  const specs = (selectedProduct?.specs || {}) as Record<string, any>;
  const standardFields = [
    { key: 'range', label: 'Faixa de Medição / Trabalho', defaultVal: specs.range || '-25 °C a 155 °C', module: 'Metrologia' },
    { key: 'accuracy', label: 'Exatidão / Incerteza', defaultVal: specs.accuracy || '± 0,1 °C', module: 'Metrologia' },
    { key: 'stability', label: 'Estabilidade Térmica', defaultVal: '± 0,05 °C', module: 'Metrologia' },
    { key: 'powerSupply', label: 'Tensão de Alimentação', defaultVal: specs.powerSupply || '115 / 230 Vac', module: 'Elétrica' },
    { key: 'output', label: 'Sinal de Saída / Comunicação', defaultVal: specs.output || 'RS-232 / USB', module: 'Elétrica' },
    { key: 'processConnection', label: 'Conexão ao Processo', defaultVal: specs.processConnection || 'Insert 6 furos', module: 'Mecânica' },
    { key: 'protectionDegree', label: 'Grau de Proteção', defaultVal: specs.protectionDegree || 'IP-54', module: 'Mecânica' }
  ];

  const modules = ['Metrologia', 'Elétrica', 'Mecânica'];

  const handleInspectSources = () => {
    if (onNavigateSection) {
      onNavigateSection('sources');
    } else if (onSwitchToClassic) {
      onSwitchToClassic();
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Barra de Ações Superior */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Informações Técnicas & Fatos
            </span>
            <ContextHelpTrigger helpId="technical-datum" variant="subtle" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>
              {selectedProduct
                ? `Especificações de: ${selectedProduct.model || selectedProduct.code}`
                : `Especificações Canônicas da Família: ${currentFamily}`}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cada fato técnico possui procedência documental e identidade única reutilizável em tabelas e catálogos.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowSemanticKeys(!showSemanticKeys)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
              showSemanticKeys
                ? 'bg-indigo-600 text-white border-indigo-700'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            <Code2 size={13} />
            <span>Chaves Técnicas</span>
          </button>

          {onSwitchToClassic && (
            <button
              type="button"
              onClick={onSwitchToClassic}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
            >
              <Plus size={14} />
              <span>Gerenciar Esquema no Modo Clássico</span>
              <ArrowUpRight size={13} className="text-indigo-200" />
            </button>
          )}
        </div>
      </div>

      {/* Banner Didático de Herança e Override */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 flex items-start gap-3 text-xs text-indigo-950">
        <span className="p-1.5 bg-indigo-200/80 text-indigo-800 rounded-lg shrink-0 mt-0.5">
          <Layers size={16} />
        </span>
        <div className="space-y-1">
          <span className="font-bold block">
            Entenda como funciona a <TermHelp helpId="inheritance" label="Herança" /> nesta tela:
          </span>
          <p className="text-slate-600 leading-relaxed">
            Propriedades marcadas com o selo azul são <strong>Herdadas da Família</strong> e compartilhadas por todos os modelos.
            Caso este produto específico possua um valor exclusivo, ele é assinalado como{' '}
            <strong><TermHelp helpId="override" label="Exceção do Modelo (Override)" /></strong>, sem alterar os demais modelos.
          </p>
        </div>
      </div>

      {/* Grupos de Módulos */}
      <div className="space-y-6">
        {modules.map((moduleName) => {
          const moduleFields = standardFields.filter((f) => f.module === moduleName);

          return (
            <div key={moduleName} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Header do Módulo */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Módulo: {moduleName}
                  </h3>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  {moduleFields.length} propriedades
                </span>
              </div>

              {/* Tabela de Especificações do Módulo */}
              <div className="divide-y divide-slate-100">
                {moduleFields.map((field) => {
                  const isOverride = selectedProduct && field.key === 'range';
                  const semanticKey = `metrology.${field.key.toLowerCase()}`;

                  return (
                    <div
                      key={field.key}
                      className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900">{field.label}</span>

                          {isOverride ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                              <Sparkles size={11} className="text-amber-600" />
                              <span>Exceção do Modelo (Override)</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
                              <ShieldCheck size={11} className="text-indigo-600" />
                              <span>Herdado da Família</span>
                            </span>
                          )}
                        </div>

                        {showSemanticKeys && (
                          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                            <Tag size={11} className="text-slate-400" />
                            <span>Chave: {semanticKey}</span>
                          </div>
                        )}
                      </div>

                      {/* Valor e Procedência */}
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-sm font-bold text-slate-900 font-mono block">
                            {field.defaultVal}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1 justify-end">
                            <CheckCircle2 size={10} className="text-slate-400" />
                            <span>Dado PIM</span>
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={handleInspectSources}
                          className="px-2.5 py-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-700 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors"
                          title="Inspecionar evidências e fontes documentais"
                        >
                          <Search size={12} />
                          <span>Ver Fontes</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
