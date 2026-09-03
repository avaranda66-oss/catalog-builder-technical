import React, { useEffect, useRef } from 'react';
import { AlertCircle, Trash2, X, Loader2 } from 'lucide-react';
import { ProductFamily } from '../../domain/product.schema';

export interface DeleteFamilyModalProps {
  isOpen: boolean;
  family: ProductFamily | null;
  productCount: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting?: boolean;
  errorMessage?: string | null;
}

export const DeleteFamilyModal: React.FC<DeleteFamilyModalProps> = ({
  isOpen,
  family,
  productCount,
  onClose,
  onConfirm,
  isDeleting = false,
  errorMessage = null
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  // Focus inicial no botão Cancelar e suporte à tecla Escape
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isDeleting) {
          e.preventDefault();
          onClose();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen || !family) return null;

  const hasProducts = productCount > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-family-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                hasProducts ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {hasProducts ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </div>
            <h3
              id="delete-family-modal-title"
              className="text-sm font-bold text-slate-800"
            >
              {hasProducts
                ? 'Não é possível excluir a família'
                : `Excluir família "${family.name}"?`}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 text-xs text-slate-600 space-y-3">
          {errorMessage && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {hasProducts ? (
            <div className="space-y-2">
              <p className="font-semibold text-slate-800">
                Esta família contém{' '}
                <span className="font-bold text-amber-800">
                  {productCount} {productCount === 1 ? 'produto associado' : 'produtos associados'}
                </span>
                .
              </p>
              <p className="text-slate-600 leading-relaxed">
                Para excluir esta família, você deve primeiro mover ou remover todos os seus produtos.
                A exclusão de famílias com produtos em cascata não é permitida nesta fase para proteger o catálogo.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-slate-700 leading-relaxed">
                Esta ação remove permanentemente a família da biblioteca corporativa. A família e sua configuração de colunas serão removidas.
              </p>
              <p className="text-slate-500 font-medium">
                Esta operação é irreversível no banco de dados Supabase.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          {hasProducts ? (
            <button
              ref={cancelButtonRef}
              onClick={onClose}
              className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded text-xs hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#003366] transition-all"
            >
              Entendido
            </button>
          ) : (
            <>
              <button
                ref={cancelButtonRef}
                onClick={onClose}
                disabled={isDeleting}
                className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded text-xs hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => void onConfirm()}
                disabled={isDeleting}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50 flex items-center gap-1.5 transition-all shadow-2xs"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir família</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
