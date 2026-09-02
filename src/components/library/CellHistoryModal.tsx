import React from 'react';
import { X, Clock, User, ArrowRight, ShieldCheck } from 'lucide-react';
import { LibraryChangeEvent } from '../../domain/product.schema';

interface CellHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  productModel: string;
  fieldLabel: string;
  fieldKey: string;
  currentValue: string;
  events: LibraryChangeEvent[];
}

export const CellHistoryModal: React.FC<CellHistoryModalProps> = ({
  isOpen,
  onClose,
  productModel,
  fieldLabel,
  fieldKey,
  currentValue,
  events
}) => {
  if (!isOpen) return null;

  const cellEvents = events.filter((ev) => ev.field_key === fieldKey && ev.action === 'UPDATE_CELL');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#003366]" />
              Histórico da Célula
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {productModel} · <span className="font-semibold text-slate-700">{fieldLabel}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Value Card */}
        <div className="p-4 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-blue-900 tracking-wider">Valor Atual</span>
            <div className="text-sm font-mono font-bold text-slate-900 mt-0.5">
              {currentValue || <span className="italic text-slate-400 font-sans font-normal">(vazio)</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2 py-1 rounded text-xs font-bold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Confirmado</span>
          </div>
        </div>

        {/* Timeline of Edits */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          <span className="text-xs font-bold text-slate-700 block">Linha do Tempo de Alterações</span>

          {cellEvents.map((ev, idx) => (
            <div key={ev.id || idx} className="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" />
                  {ev.actor_name || ev.actor_email?.split('@')[0] || 'Colaborador'}
                </span>
                <span className="text-[11px] text-slate-500">
                  {new Date(ev.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px] bg-white p-1.5 rounded border border-slate-200">
                <span className="text-rose-600 line-through truncate max-w-[120px]">{ev.old_value || '(vazio)'}</span>
                <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-emerald-700 font-bold truncate max-w-[120px]">{ev.new_value || '(vazio)'}</span>
              </div>
            </div>
          ))}

          {cellEvents.length === 0 && (
            <div className="text-center py-6 text-slate-400 text-xs italic">
              Nenhuma alteração anterior registrada para esta célula no banco.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
