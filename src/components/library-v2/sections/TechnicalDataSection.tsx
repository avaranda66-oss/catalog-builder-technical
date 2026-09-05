// src/components/library-v2/sections/TechnicalDataSection.tsx
// Seção 2 da Library V2: Informações Técnicas estruturadas com herança e overrides.
// Transparência de dados e escape hatch para o modo clássico.

import React, { useState } from 'react';
import { Product, ProductFamily } from '../../../domain/product.schema';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import {
  Plus,
  Code2,
  Layers,
  Tag,
  ArrowUpRight
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
  familyColumns,
  onSwitchToClassic
}) => {
  const [showSemanticKeys, setShowSemanticKeys] = useState(false);

  const specs = (selectedProduct?.specs || {}) as Record<string, unknown>;
  const configuredColumnFor = (key: string) => familyColumns.find((column) => {
    const normalizedKey = column.key.startsWith('specs.') ? column.key.slice('specs.'.length) : column.key;
    return normalizedKey === key;
  });
  const defaultLabels: Record<string, string> = {
    range: 'Faixa de Medição / Trabalho',
    unit: 'Unidade',
    accuracy: 'Exatidão / Incerteza',
    output: 'Sinal de Saída / Comunicação',
    powerSupply: 'Tensão de Alimentação',
    processConnection: 'Conexão ao Processo',
    protectionDegree: 'Grau de Proteção'
  };
  const isPopulated = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
  const customSpecs = specs.customSpecs && typeof specs.customSpecs === 'object'
    ? specs.customSpecs as Record<string, unknown>
    : {};
  const populatedFacts = [
    ...Object.entries(specs)
      .filter(([key, value]) => key !== 'customSpecs' && isPopulated(value))
      .map(([key, value]) => {
        const configuredColumn = configuredColumnFor(key);
        return {
          key,
          label: configuredColumn?.label || defaultLabels[key] || key,
          value: value as string,
          semanticKey: configuredColumn?.key
        };
      }),
    ...Object.entries(customSpecs)
      .filter(([, value]) => isPopulated(value))
      .map(([key, value]) => {
        const configuredColumn = configuredColumnFor(key);
        return {
          key: `customSpecs.${key}`,
          label: configuredColumn?.label || key,
          value: value as string,
          semanticKey: configuredColumn?.key
        };
      })
  ];

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
                ? `Informações técnicas de: ${selectedProduct.model || selectedProduct.code}`
                : `Informações técnicas: ${currentFamily || '—'}`}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Somente valores técnicos materialmente armazenados são exibidos nesta área.
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

      {/* Ajuda conceitual sem classificar dados ativos */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 flex items-start gap-3 text-xs text-indigo-950">
        <span className="p-1.5 bg-indigo-200/80 text-indigo-800 rounded-lg shrink-0 mt-0.5">
          <Layers size={16} />
        </span>
        <div className="space-y-1">
          <span className="font-bold block">
            Conceitos disponíveis para consulta:
          </span>
          <p className="text-slate-600 leading-relaxed">
            <TermHelp helpId="inheritance" label="Herança" /> e{' '}
            <TermHelp helpId="override" label="override" /> são conceitos do modelo de dados. Sem autoridade carregada,
            os valores legados exibidos abaixo permanecem sem classificação de origem, herança ou aprovação.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">Valores armazenados</span>
          <span className="text-[11px] text-slate-500 font-mono">{populatedFacts.length} fatos carregados</span>
        </div>

        {!selectedProduct ? (
          <div className="p-8 text-center text-xs text-slate-500">Selecione um modelo para consultar seus valores armazenados.</div>
        ) : populatedFacts.length === 0 ? (
          <div className="p-8 text-center space-y-1">
            <p className="text-sm font-bold text-slate-800">Informações técnicas não carregadas</p>
            <p className="text-xs text-slate-500">Nenhum valor técnico preenchido está disponível para este modelo.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {populatedFacts.map((fact) => (
              <div key={fact.key} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-900">{fact.label}</span>
                  {showSemanticKeys && fact.semanticKey && (
                    <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                      <Tag size={11} className="text-slate-400" />
                      <span>Chave: {fact.semanticKey}</span>
                    </div>
                  )}
                </div>
                <span className="text-sm font-bold text-slate-900 font-mono">{fact.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
