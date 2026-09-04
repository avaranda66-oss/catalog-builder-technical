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

          <div className="space-y-2">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Dados Identificados com Alta Confiança:
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2.5 bg-purple-50/80 border border-purple-200 rounded-xl">
                <div className="text-xl font-bold text-purple-900">84</div>
                <div className="text-[10px] text-purple-700">Fatos Técnicos</div>
              </div>
              <div className="p-2.5 bg-purple-50/80 border border-purple-200 rounded-xl">
                <div className="text-xl font-bold text-purple-900">3</div>
                <div className="text-[10px] text-purple-700">Tabelas</div>
              </div>
              <div className="p-2.5 bg-purple-50/80 border border-purple-200 rounded-xl">
                <div className="text-xl font-bold text-purple-900">7</div>
                <div className="text-[10px] text-purple-700">Recursos</div>
              </div>
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-xl font-bold text-amber-800">2</div>
                <div className="text-[10px] text-amber-700">Divergências</div>
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
              Cada informação importada virá acompanhada da página e trecho textual de evidência,
              permitindo validação posterior a qualquer momento.
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
