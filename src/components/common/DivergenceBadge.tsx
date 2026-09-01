import React, { useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { FieldDivergence } from '../../domain/divergence';

interface DivergenceBadgeProps {
  divergence: FieldDivergence | null;
  onRestore?: () => void;
}

export const DivergenceBadge: React.FC<DivergenceBadgeProps> = ({ divergence, onRestore }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!divergence || !divergence.hasDivergence) return null;

  return (
    <div className="relative inline-block ml-1 align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="p-0.5 text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
        title="Divergente da Biblioteca Oficial"
        aria-label="Ver divergência em relação à biblioteca"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-xl border border-slate-700 pointer-events-auto"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="font-semibold text-amber-400 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Diferente da Biblioteca</span>
          </div>
          <div className="space-y-1 text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Campo:</span>
              <span className="font-medium text-slate-200">{divergence.fieldLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">No Catálogo:</span>
              <span className="font-semibold text-amber-300">{divergence.localValue}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Oficial (Ref):</span>
              <span className="font-semibold text-emerald-300">{divergence.libraryValue}</span>
            </div>
          </div>

          {onRestore && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
                setIsOpen(false);
              }}
              className="mt-2.5 w-full flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-slate-600 rounded text-[11px] font-medium transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restaurar valor oficial</span>
            </button>
          )}

          {/* Seta do Tooltip */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
};
