// src/labs/product-workspace-ux/components/FactGridBlock.tsx
import React from 'react';
import { FileText, Pencil, Tag, Users } from 'lucide-react';
import { FactItem, WorkspaceMode } from '../types';

interface FactGridBlockProps {
  facts: FactItem[];
  mode?: WorkspaceMode;
  variant?: 'hero' | 'key_value';
  onEditFact: (fact: FactItem) => void;
  onOpenSource: (fact: FactItem) => void;
  onOpenSemantic: (fact: FactItem) => void;
}

export const FactGridBlock: React.FC<FactGridBlockProps> = ({
  facts,
  mode: _mode,
  variant = 'key_value',
  onEditFact,
  onOpenSource,
  onOpenSemantic
}) => {
  if (variant === 'hero') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {facts.map((fact) => (
          <div
            key={fact.id}
            className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs hover:shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between group relative"
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
                  {fact.label}
                </span>

                <div className="flex items-center gap-1">
                  {fact.originScope === 'family' && (
                    <span
                      title="Compartilhado com toda a Linha TA"
                      className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded cursor-help"
                    >
                      <Users className="w-2.5 h-2.5 text-slate-400" />
                      Linha TA
                    </span>
                  )}
                  {fact.source && (
                    <button
                      onClick={() => onOpenSource(fact)}
                      title={`Fonte: ${fact.source.documentCode} (pág. ${fact.source.page})`}
                      className="p-1 text-slate-400 hover:text-[#003366] hover:bg-slate-100 rounded transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight font-mono">
                  {fact.value}
                </span>
                {fact.unit && (
                  <span className="text-sm font-semibold text-slate-500">
                    {fact.unit}
                  </span>
                )}
              </div>
            </div>

            {/* Ações de Edição e Semântica (Discretas no hover ou no Edit Mode) */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-mono text-[10px] text-slate-400 truncate max-w-[140px]">
                {fact.semanticKey}
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onOpenSemantic(fact)}
                  title="Ver identidade semântica e aliases"
                  className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                >
                  <Tag className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onEditFact(fact)}
                  title="Editar valor ou escopo"
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 font-medium text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                >
                  <Pencil className="w-2.5 h-2.5" />
                  Editar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Variant: Key-Value Grid (denso, calmo e organizado)
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {facts.map((fact) => (
        <div
          key={fact.id}
          className="bg-white border border-slate-200/80 rounded-lg p-3 hover:border-slate-300 transition-all flex flex-col justify-between group"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">
              {fact.label}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {fact.originScope === 'family' && (
                <span
                  title="Compartilhado com toda a Linha TA"
                  className="inline-flex items-center gap-0.5 text-[9px] font-medium text-slate-400 bg-slate-50 px-1 py-0.2 rounded"
                >
                  Linha
                </span>
              )}
              {fact.source && (
                <button
                  onClick={() => onOpenSource(fact)}
                  title={`Fonte: ${fact.source.documentCode} (pág. ${fact.source.page})`}
                  className="p-0.5 text-slate-400 hover:text-[#003366] rounded transition-colors"
                >
                  <FileText className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="text-sm font-bold text-slate-900">
              {fact.value} {fact.unit && <span className="text-xs font-normal text-slate-500">{fact.unit}</span>}
            </div>

            <button
              onClick={() => onEditFact(fact)}
              title="Editar valor"
              className="p-1 text-slate-400 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity rounded"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
