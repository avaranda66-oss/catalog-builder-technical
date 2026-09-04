// src/labs/product-workspace-ux/components/FactGridBlock.tsx
import React from 'react';
import {
  FileText,
  Pencil,
  Tag,
  Users,
  AlertTriangle,
  CheckCircle2,
  FileQuestion,
  Eye,
  EyeOff
} from 'lucide-react';
import { FactItem, WorkspaceMode, getFactSources, getFactSourceState } from '../types';

interface FactGridBlockProps {
  facts: FactItem[];
  mode?: WorkspaceMode;
  variant?: 'hero' | 'key_value';
  onEditFact: (fact: FactItem) => void;
  onOpenSource: (fact: FactItem) => void;
  onOpenSemantic: (fact: FactItem) => void;
  onToggleFactVisibility?: (factId: string) => void;
}

export const FactGridBlock: React.FC<FactGridBlockProps> = ({
  facts,
  mode = 'view',
  variant = 'key_value',
  onEditFact,
  onOpenSource,
  onOpenSemantic,
  onToggleFactVisibility
}) => {
  const visibleFacts = mode === 'edit_workspace' ? facts : facts.filter((f) => !f.isHidden);

  const renderSourceIndicator = (fact: FactItem) => {
    const sources = getFactSources(fact);
    const state = getFactSourceState(fact);

    if (state === 'no_source') {
      return (
        <button
          onClick={() => onOpenSource(fact)}
          title="Sem fonte técnica vinculada"
          className="p-1 text-slate-300 hover:text-slate-500 rounded transition-colors"
        >
          <FileQuestion className="w-3.5 h-3.5" />
        </button>
      );
    }

    if (state === 'conflicting_sources') {
      return (
        <button
          onClick={() => onOpenSource(fact)}
          title="⚠ Atenção: Fontes divergentes identificadas"
          className="p-1 text-amber-600 hover:text-amber-700 bg-amber-50 rounded transition-colors"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
        </button>
      );
    }

    if (state === 'multiple_agreeing') {
      return (
        <button
          onClick={() => onOpenSource(fact)}
          title={`✓ ${sources.length} fontes técnicas concordam com este dado`}
          className="inline-flex items-center gap-0.5 p-1 text-emerald-700 hover:bg-emerald-50 rounded transition-colors font-mono text-[10px] font-bold"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>{sources.length}</span>
        </button>
      );
    }

    // single_source or inherited_source
    const primary = sources[0];
    return (
      <button
        onClick={() => onOpenSource(fact)}
        title={
          primary?.page
            ? `Fonte: ${primary.documentCode} (pág. ${primary.page})`
            : `Fonte: ${primary?.documentCode || 'Manual'}`
        }
        className="p-1 text-slate-400 hover:text-[#003366] hover:bg-slate-100 rounded transition-colors"
      >
        <FileText className="w-3.5 h-3.5" />
      </button>
    );
  };

  if (variant === 'hero') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {visibleFacts.map((fact) => (
          <div
            key={fact.id}
            className={`bg-white border rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group relative ${
              fact.isHidden ? 'border-dashed border-slate-300 opacity-60 bg-slate-50/70' : 'border-slate-200/90'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
                  {fact.label}
                </span>

                <div className="flex items-center gap-1">
                  {fact.isHidden && (
                    <span className="text-[10px] bg-slate-200 text-slate-600 px-1 rounded font-medium">
                      Oculto
                    </span>
                  )}

                  {fact.originScope === 'family' && (
                    <span
                      title={`Compartilhado com toda a ${fact.originLabel || 'Linha'}`}
                      className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded cursor-help"
                    >
                      <Users className="w-2.5 h-2.5 text-slate-400" />
                      {fact.originLabel || 'Linha'}
                    </span>
                  )}

                  {fact.originKind === 'product_override' && (
                    <span
                      title="Especificação própria deste produto (override da linha)"
                      className="inline-flex items-center gap-0.5 text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded"
                    >
                      Próprio
                    </span>
                  )}

                  {renderSourceIndicator(fact)}
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

            {/* Ações de Edição e Semântica */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-mono text-[10px] text-slate-400 truncate max-w-[120px]">
                {fact.semanticKey}
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onToggleFactVisibility && mode === 'edit_workspace' && (
                  <button
                    onClick={() => onToggleFactVisibility(fact.id)}
                    title={fact.isHidden ? 'Reexibir neste resumo' : 'Ocultar deste resumo'}
                    className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                  >
                    {fact.isHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                )}
                <button
                  onClick={() => onOpenSemantic(fact)}
                  title="Ver identidade semântica e aliases"
                  className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                >
                  <Tag className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onEditFact(fact)}
                  title="Editar valor ou escopo no rascunho"
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

  // Variant: Key-Value Grid
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {visibleFacts.map((fact) => (
        <div
          key={fact.id}
          className={`bg-white border rounded-lg p-3 hover:border-slate-300 transition-all flex flex-col justify-between group ${
            fact.isHidden ? 'border-dashed border-slate-300 opacity-60 bg-slate-50/70' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600 truncate">
              {fact.label}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {fact.isHidden && (
                <span className="text-[9px] bg-slate-200 text-slate-600 px-1 rounded font-medium">
                  Oculto
                </span>
              )}
              {fact.originScope === 'family' && (
                <span
                  title={`Compartilhado com toda a ${fact.originLabel || 'Linha'}`}
                  className="inline-flex items-center gap-0.5 text-[9px] font-medium text-slate-400 bg-slate-50 px-1 py-0.2 rounded"
                >
                  Linha
                </span>
              )}
              {renderSourceIndicator(fact)}
            </div>
          </div>

          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="text-sm font-bold text-slate-900">
              {fact.value} {fact.unit && <span className="text-xs font-normal text-slate-500">{fact.unit}</span>}
            </div>

            <div className="flex items-center gap-1">
              {onToggleFactVisibility && mode === 'edit_workspace' && (
                <button
                  onClick={() => onToggleFactVisibility(fact.id)}
                  title={fact.isHidden ? 'Reexibir' : 'Ocultar'}
                  className="p-1 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity rounded"
                >
                  {fact.isHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>
              )}
              <button
                onClick={() => onEditFact(fact)}
                title="Editar especificação"
                className="p-1 text-slate-400 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity rounded"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
