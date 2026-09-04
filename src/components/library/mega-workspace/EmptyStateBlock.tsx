// src/components/library/mega-workspace/EmptyStateBlock.tsx
// Componente de Empty State puro para Mega Workspace (Emenda H: ZERO fallback para product.specs).
// Exibe mensagem clara e humana informando ausência de dados no PIM.

import React from 'react';
import { Database, AlertCircle, ArrowLeft } from 'lucide-react';
import { ProductPresentationVM } from '../../../domain/product-workspace/view-model';

interface EmptyStateBlockProps {
  product: ProductPresentationVM;
  onClose?: () => void;
}

export const EmptyStateBlock: React.FC<EmptyStateBlockProps> = ({ product, onClose }) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center max-w-lg mx-auto min-h-[420px]">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-6 shadow-xs">
        <Database className="w-8 h-8" />
      </div>

      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100/80 text-amber-800 mb-3">
        <AlertCircle className="w-3.5 h-3.5" />
        Sem Conhecimento PIM Estruturado
      </span>

      <h3 className="text-xl font-bold text-slate-900 mb-2">
        Nenhum dado técnico cadastrado para {product.displayName}
      </h3>

      <p className="text-sm text-slate-600 mb-8 leading-relaxed">
        Este produto ainda não possui dados estruturados no Catálogo Técnico PIM
        {product.familyLabel ? ` nem na família ${product.familyLabel}` : ''}.
        O Mega Workspace opera estritamente com base nas informações técnicas verificadas do PIM.
      </p>

      {onClose && (
        <button
          onClick={onClose}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Lista de Produtos
        </button>
      )}
    </div>
  );
};
