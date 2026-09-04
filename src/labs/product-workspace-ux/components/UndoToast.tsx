// src/labs/product-workspace-ux/components/UndoToast.tsx
import React from 'react';
import { RotateCcw, X } from 'lucide-react';

interface UndoToastProps {
  message: string | null;
  onUndo: () => void;
  onDismiss: () => void;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  message,
  onUndo,
  onDismiss
}) => {
  if (!message) return null;

  return (
    <aside
      aria-label="Notificações do sistema"
      className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in slide-in-from-bottom-3 duration-200"
    >
      <span className="text-xs font-medium text-slate-200">{message}</span>
      <div className="flex items-center gap-1 border-l border-slate-700 pl-3">
        <button
          onClick={onUndo}
          className="inline-flex items-center gap-1 px-2 py-1 bg-[#003366] hover:bg-[#002850] text-blue-200 font-bold text-xs rounded transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Desfazer</span>
        </button>
        <button
          onClick={onDismiss}
          className="p-1 text-slate-400 hover:text-white rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
