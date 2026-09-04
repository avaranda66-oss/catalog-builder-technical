// src/labs/product-workspace-ux/components/TransformCardsSuggestionBanner.tsx
import React from 'react';
import { Table as TableIcon, X, ArrowRight } from 'lucide-react';

interface TransformCardsSuggestionBannerProps {
  show: boolean;
  onDismiss: () => void;
  onPreviewTransform: () => void;
}

export const TransformCardsSuggestionBanner: React.FC<TransformCardsSuggestionBannerProps> = ({
  show,
  onDismiss,
  onPreviewTransform
}) => {
  if (!show) return null;

  return (
    <div className="bg-gradient-to-r from-blue-50 via-indigo-50/50 to-purple-50 border border-blue-200/80 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-[#003366] text-white rounded-lg shrink-0">
          <TableIcon className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <span>Estas informações parecem formar uma tabela estruturada</span>
            <span className="text-[10px] bg-blue-100 text-[#003366] font-semibold px-1.5 py-0.2 rounded">
              Sugestão de Layout
            </span>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Detectamos 6 especificações com padrões uniformes de tolerância e resolução.
            Organizar como tabela melhora a leitura técnica em 40%.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onPreviewTransform}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#003366] hover:bg-[#00254d] rounded-lg shadow-2xs transition-colors"
        >
          <span>Pré-visualizar tabela</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDismiss}
          className="p-1 text-slate-400 hover:text-slate-600 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
