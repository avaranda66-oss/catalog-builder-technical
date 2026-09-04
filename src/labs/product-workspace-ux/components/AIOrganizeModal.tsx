// src/labs/product-workspace-ux/components/AIOrganizeModal.tsx
import React, { useState } from 'react';
import { X, Sparkles, Check, CheckCircle2, ShieldCheck } from 'lucide-react';
import { AIOrganizeDiff } from '../types';

interface AIOrganizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: () => AIOrganizeDiff;
}

export const AIOrganizeModal: React.FC<AIOrganizeModalProps> = ({
  isOpen,
  onClose,
  onApply
}) => {
  const [hasApplied, setHasApplied] = useState(false);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply();
    setHasApplied(true);
    setTimeout(() => {
      onClose();
      setHasApplied(false);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-purple-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Organização Inteligente de Visualização
              </h3>
              <p className="text-xs text-slate-500">
                Otimização da hierarquia visual do TA-25N
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Analisamos a densidade e o tipo das 129 especificações técnicas deste produto e encontramos
            uma estrutura visual mais lógica e confortável para navegação:
          </p>

          {/* Resumo em Números */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-lg font-bold text-purple-700">+2</div>
              <div className="text-[10px] text-slate-500">Seções Lógicas</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-lg font-bold text-purple-700">1</div>
              <div className="text-[10px] text-slate-500">Mega Tabela (19 lin.)</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-lg font-bold text-purple-700">12</div>
              <div className="text-[10px] text-slate-500">Cards Agrupados</div>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-lg font-bold text-emerald-700">0</div>
              <div className="text-[10px] text-emerald-600">Dados Removidos</div>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Prioriza Resumo Metrológico no topo (Faixa, Exatidão e Estabilidade).</span>
            </div>
            <div className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Converte dezenas de cards de sensores em uma Mega Tabela com cabeçalho fixo.</span>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] leading-relaxed flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>Garantia de Integridade:</strong> A IA reorganiza apenas a apresentação visual.
              Nenhum valor, unidade ou vínculo com manuais é alterado.
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
            onClick={handleApply}
            disabled={hasApplied}
            className="px-4 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors disabled:bg-emerald-600"
          >
            {hasApplied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Organização aplicada!</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Aplicar organização sugerida</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
