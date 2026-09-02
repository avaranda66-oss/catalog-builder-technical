import React, { useState } from 'react';
import { X, History, User, Clock, ArrowRight } from 'lucide-react';
import { LibraryChangeEvent } from '../../domain/product.schema';
import { useAuthStore } from '../../stores/useAuthStore';

interface LibraryHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  events: LibraryChangeEvent[];
  currentFamilyName?: string;
  selectedProductId?: string | null;
}

export const LibraryHistoryDrawer: React.FC<LibraryHistoryDrawerProps> = ({
  isOpen,
  onClose,
  events,
  currentFamilyName,
  selectedProductId
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'family' | 'product' | 'my'>('all');
  const currentUserId = useAuthStore((state) => state.userId);
  const currentUserEmail = useAuthStore((state) => state.email);

  if (!isOpen) return null;

  const filteredEvents = events.filter((ev) => {
    if (activeFilter === 'my') {
      return ev.actor_id === currentUserId || (currentUserEmail && ev.actor_email === currentUserEmail);
    }
    if (activeFilter === 'family' && currentFamilyName) {
      return ev.summary?.toLowerCase().includes(currentFamilyName.toLowerCase());
    }
    if (activeFilter === 'product' && selectedProductId) {
      return ev.product_id === selectedProductId || ev.entity_id === selectedProductId;
    }
    return true;
  });

  const formatTimeAgo = (dateStr: string) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return 'agora mesmo';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `há ${diffMin} min`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `há ${diffHours} h`;
      const diffDays = Math.floor(diffHours / 24);
      return `há ${diffDays} dias`;
    } catch {
      return dateStr;
    }
  };

  const getActionBadge = (action: string) => {
    if (action.includes('CREATE')) {
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Criado</span>;
    }
    if (action.includes('DELETE')) {
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">Excluído</span>;
    }
    if (action.includes('RENAME') || action.includes('COLUMN')) {
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">Coluna</span>;
    }
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Edição</span>;
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 bg-white shadow-2xl border-l border-slate-200 flex flex-col text-slate-800 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[#003366]" />
          <h2 className="font-bold text-sm text-slate-900">Histórico de Atividades</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filtros */}
      <div className="p-3 border-b border-slate-200 bg-white flex items-center gap-1 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-2.5 py-1 rounded font-medium transition-colors ${
            activeFilter === 'all'
              ? 'bg-[#003366] text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Todos
        </button>
        <button
          onClick={() => setActiveFilter('family')}
          className={`px-2.5 py-1 rounded font-medium transition-colors ${
            activeFilter === 'family'
              ? 'bg-[#003366] text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Família Atual
        </button>
        <button
          onClick={() => setActiveFilter('my')}
          className={`px-2.5 py-1 rounded font-medium transition-colors ${
            activeFilter === 'my'
              ? 'bg-[#003366] text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Minhas
        </button>
      </div>

      {/* Lista de Eventos */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredEvents.map((ev) => (
          <div
            key={ev.id}
            className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded border border-slate-200 transition-colors space-y-1.5"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                <User className="w-3 h-3 text-slate-400" />
                <span>{ev.actor_name || ev.actor_email?.split('@')[0] || 'Colaborador'}</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Clock className="w-3 h-3" />
                <span>{formatTimeAgo(ev.created_at)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {getActionBadge(ev.action)}
              <span className="text-xs font-semibold text-slate-800 line-clamp-1">{ev.summary}</span>
            </div>

            {ev.old_value !== null && ev.new_value !== null && ev.action === 'UPDATE_CELL' && (
              <div className="flex items-center gap-1.5 text-[11px] bg-white p-1.5 rounded border border-slate-200 font-mono text-slate-700">
                <span className="text-rose-600 line-through truncate max-w-[120px]">{ev.old_value || '(vazio)'}</span>
                <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-emerald-700 font-bold truncate max-w-[120px]">{ev.new_value || '(vazio)'}</span>
              </div>
            )}
          </div>
        ))}

        {filteredEvents.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-xs italic">
            Nenhuma atividade registrada no período selecionado.
          </div>
        )}
      </div>
    </div>
  );
};
