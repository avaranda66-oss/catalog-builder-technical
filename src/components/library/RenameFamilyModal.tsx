import React, { useState, useEffect, useRef } from 'react';
import { Pencil, X, AlertCircle, Loader2 } from 'lucide-react';
import { ProductFamily } from '../../domain/product.schema';
import { slugifyFamilyName } from '../../domain/family-selection.helper';

export interface RenameFamilyModalProps {
  isOpen: boolean;
  family: ProductFamily | null;
  existingFamilies: ProductFamily[];
  onClose: () => void;
  onConfirm: (newName: string) => Promise<void>;
  isRenaming?: boolean;
  errorMessage?: string | null;
}

export const RenameFamilyModal: React.FC<RenameFamilyModalProps> = ({
  isOpen,
  family,
  existingFamilies,
  onClose,
  onConfirm,
  isRenaming = false,
  errorMessage = null
}) => {
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && family) {
      setName(family.name);
      setLocalError(null);
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isRenaming) {
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
  }, [isOpen, family, isRenaming, onClose]);

  if (!isOpen || !family) return null;

  const trimmed = name.trim();
  const isSame = trimmed === family.name;
  const isDuplicate = Boolean(
    trimmed &&
      existingFamilies.some(
        (f) =>
          f.id !== family.id &&
          (f.name.trim().toLowerCase() === trimmed.toLowerCase() ||
            f.slug === slugifyFamilyName(trimmed))
      )
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isRenaming) return;

    if (!trimmed) {
      setLocalError('O nome da família não pode ser vazio.');
      return;
    }

    if (isDuplicate) {
      setLocalError('Já existe uma família com este nome.');
      return;
    }

    if (isSame) {
      onClose();
      return;
    }

    setLocalError(null);
    await onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-family-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRenaming) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003366] flex items-center justify-center shrink-0">
              <Pencil className="w-4 h-4" />
            </div>
            <h3
              id="rename-family-modal-title"
              className="text-sm font-bold text-slate-800"
            >
              Renomear Família
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isRenaming}
            className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-5 text-xs text-slate-600 space-y-4">
            {(errorMessage || localError) && (
              <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{errorMessage || localError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="rename-family-input" className="font-semibold text-slate-700 block">
                Nome da Família:
              </label>
              <input
                id="rename-family-input"
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (localError) setLocalError(null);
                }}
                disabled={isRenaming}
                placeholder="Ex: Transmissores de Pressão"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366] disabled:bg-slate-50 transition-all font-sans"
              />
              <span className="text-[11px] text-slate-400 block">
                Identidade canônica (ID) e vínculos com produtos serão preservados.
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isRenaming}
              className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded text-xs hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isRenaming || !trimmed || isDuplicate}
              className="px-4 py-1.5 bg-[#003366] hover:bg-[#002244] text-white font-semibold rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#003366] disabled:opacity-50 flex items-center gap-1.5 transition-all shadow-2xs"
            >
              {isRenaming ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>Salvar</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
