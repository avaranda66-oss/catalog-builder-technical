import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Plus } from 'lucide-react';

export interface HoverTooltipItem {
  id: string;
  title: string;
  categoryLabel: string;
  badge: string;
  description: string;
  renderPreview: () => React.ReactNode;
}

export interface TooltipPosition {
  x: number;
  y: number;
  menuLeft?: number;
}

interface BlockHoverTooltipProps {
  item: HoverTooltipItem | null;
  position: TooltipPosition | null;
  targetPageNumber: number;
}

export const BlockHoverTooltip: React.FC<BlockHoverTooltipProps> = ({
  item,
  position,
  targetPageNumber
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !item || !position || typeof document === 'undefined') return null;

  const tooltipWidth = 620;
  const tooltipHeight = 440;

  // Posicionamento lateral: se couber à direita do menu, posiciona à direita; senão à esquerda
  let left = position.x + 16;
  if (left + tooltipWidth > window.innerWidth - 20) {
    if (position.menuLeft) {
      left = position.menuLeft - tooltipWidth - 16;
    } else {
      left = window.innerWidth - tooltipWidth - 20;
    }
  }
  if (left < 20) left = 20;

  // Alinhamento vertical estável ancorado na linha do menu
  let top = Math.max(20, Math.min(position.y - 60, window.innerHeight - tooltipHeight - 20));

  const tooltipContent = (
    <div
      style={{
        top: `${top}px`,
        left: `${left}px`,
        width: `${tooltipWidth}px`,
        height: `${tooltipHeight}px`
      }}
      className="fixed z-[9999] bg-white rounded-2xl shadow-2xl border-2 border-[#003366] pointer-events-none transition-all duration-100 overflow-hidden flex flex-col select-none"
    >
      {/* Header do Tooltip */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-slate-900 via-[#002244] to-slate-900 text-white flex items-center justify-between border-b border-slate-700 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h4 className="font-bold text-sm text-white">{item.title}</h4>
          </div>
          <span className="text-[10px] text-slate-300 font-mono">{item.categoryLabel}</span>
        </div>
        <span className="bg-brand-500/30 border border-brand-400/40 text-brand-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full font-mono">
          {item.badge}
        </span>
      </div>

      {/* Container de Preview Fixo e Estável */}
      <div className="flex-1 bg-slate-100/90 p-3 flex items-center justify-center overflow-hidden border-b border-slate-200">
        <div
          style={{
            width: '740px',
            transform: 'scale(0.72)',
            transformOrigin: 'top center'
          }}
          className="shadow-lg rounded-xl overflow-hidden bg-white border border-slate-200 flex-shrink-0"
        >
          {item.renderPreview()}
        </div>
      </div>

      {/* Footer com Instrução de Inserção */}
      <div className="px-4 py-2 bg-white flex items-center justify-between text-xs flex-shrink-0">
        <p className="text-[11px] text-slate-600 max-w-[360px] leading-snug line-clamp-2">
          {item.description}
        </p>
        <span className="flex items-center gap-1.5 font-bold text-[#003366] text-xs bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 shadow-2xs">
          <Plus className="w-3.5 h-3.5" />
          <span>Clique para Inserir na Folha {targetPageNumber}</span>
        </span>
      </div>
    </div>
  );

  return createPortal(tooltipContent, document.body);
};
