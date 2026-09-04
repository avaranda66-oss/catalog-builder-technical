// src/components/library/product-workspace-v2/WorkspaceSearch.tsx
import React from 'react';
import { Search, X } from 'lucide-react';

export interface WorkspaceSearchProps {
  query: string;
  onQueryChange: (newQuery: string) => void;
  matchesCount?: number;
}

export const WorkspaceSearch: React.FC<WorkspaceSearchProps> = ({
  query,
  onQueryChange,
  matchesCount
}) => {
  return (
    <div className="relative flex items-center w-full max-w-md">
      <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center">
        <Search className="w-4 h-4" />
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Buscar especificação, sensor, faixa, unidade ou termo..."
        className="w-full pl-9 pr-20 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all"
      />
      {query && (
        <div className="absolute right-2.5 flex items-center gap-1.5">
          {matchesCount !== undefined && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              {matchesCount} {matchesCount === 1 ? 'item' : 'itens'}
            </span>
          )}
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Limpar busca"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
