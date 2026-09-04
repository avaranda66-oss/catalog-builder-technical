// src/labs/product-workspace-ux/components/AIImportModal.tsx
import React from 'react';
import { X, Sparkles, FileText, CheckCircle2, ShieldCheck } from 'lucide-react';

interface AIImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIImportModal: React.FC<AIImportModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-purple-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Importação e Extração Inteligente de Documento
              </h3>
              <p className="text-xs text-slate-500">
                Análise automática de manuais técnicos e catálogos em PDF
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-4 text-xs">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
            <FileText className="w-8 h-8 text-[#003366] shrink-0" />
            <div>
              <div className="font-bold text-slate-900 text-sm">
                Manual de Instruções e Operação TA-25N.pdf
              </div>
              <div className="text-slate-500 text-xs">
                Código: EM0291-04 · 48 páginas · Processado via OCR industrial
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Classificação por Política de Verdade:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* 1. FACTS */}
              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider">Fatos Verificados</span>
                  <span className="text-xs px-1.5 py-0.2 bg-emerald-200/80 text-emerald-900 rounded-full font-mono font-bold">84</span>
                </div>
                <div className="text-lg font-bold text-emerald-950">Homologados</div>
                <p className="text-[11px] text-emerald-800 leading-tight">
                  Evidência textual direta de 100% de precisão nos manuais técnicos oficiais.
                </p>
              </div>

              {/* 2. CONFLICTS */}
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-amber-800 tracking-wider">Conflitos</span>
                  <span className="text-xs px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded-full font-mono font-bold">2</span>
                </div>
                <div className="text-lg font-bold text-amber-950">Divergências</div>
                <p className="text-[11px] text-amber-800 leading-tight">
                  Fontes oficiais declaram valores diferentes. O sistema não assume verdade automática.
                </p>
              </div>

              {/* 3. REVIEW CANDIDATES */}
              <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-purple-800 tracking-wider">Sugestões IA</span>
                  <span className="text-xs px-1.5 py-0.2 bg-purple-200 text-purple-900 rounded-full font-mono font-bold">12</span>
                </div>
                <div className="text-lg font-bold text-purple-950">Aguardando Avaliação</div>
                <p className="text-[11px] text-purple-800 leading-tight">
                  Candidatos a fatos extraídos de tabelas não padronizadas que requerem aprovação prévia.
                </p>
              </div>
            </div>
          </div>

          {/* Mapeamento de Destino */}
          <div className="space-y-2 pt-1">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Organização Sugerida para o Workspace:
            </span>
            <div className="space-y-1.5 font-medium text-slate-700">
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <span>→ 19 sensores mapeados para a seção &quot;Entradas e Sensores&quot;</span>
                <span className="text-emerald-700 font-bold text-[11px]">99% confiança</span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <span>→ 6 especificações físicas para &quot;Construção e Dimensões&quot;</span>
                <span className="text-emerald-700 font-bold text-[11px]">98% confiança</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] leading-relaxed flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>Política de Verdade do Sistema:</strong> Sugestões da IA e divergências entre documentos
              <strong> nunca são promovidas a fatos verificados</strong> sem decisão explícita da equipe técnica.
            </span>
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              alert('Fluxo de importação IA: informações aprovadas e vinculadas com proveniência!');
              onClose();
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-xs flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Revisar e Aplicar Aprovadas</span>
          </button>
        </div>
      </div>
    </div>
  );
};
