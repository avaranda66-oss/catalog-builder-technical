import React from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';

export const SaveStatusBadge: React.FC = () => {
  const isSaving = useCatalogStore((state) => state.isSaving);

  if (isSaving) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span>Salvando...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md">
      <CheckCircle2 className="w-3.5 h-3.5" />
      <span>Salvo</span>
    </div>
  );
};
