// src/components/guided-help/LearnModeToggle.tsx
// Nível 3: Toggle interativo do Modo Aprender 🎓.
// Liga/desliga hotspots explicativos na interface sem poluir a rotina do usuário avançado.

import React from 'react';
import { useLearnMode } from '../../features/guided-help';
import { GraduationCap } from 'lucide-react';

export interface LearnModeToggleProps {
  className?: string;
}

export const LearnModeToggle: React.FC<LearnModeToggleProps> = ({ className = '' }) => {
  const { isLearnModeActive, toggleLearnMode } = useLearnMode();

  return (
    <button
      type="button"
      onClick={toggleLearnMode}
      role="switch"
      aria-checked={isLearnModeActive}
      aria-label="Alternar Modo Aprender"
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
        isLearnModeActive
          ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-xs ring-2 ring-amber-400/40'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
      } ${className}`}
      title={
        isLearnModeActive
          ? 'Modo Aprender ATIVO: hotspots explicativos visíveis'
          : 'Modo Aprender DESATIVADO: interface limpa de alto desempenho'
      }
    >
      <span
        className={`p-1 rounded-full transition-colors ${
          isLearnModeActive ? 'bg-amber-400 text-amber-950' : 'bg-slate-300 text-slate-700'
        }`}
      >
        <GraduationCap size={13} />
      </span>
      <span>Modo Aprender</span>
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold ${
          isLearnModeActive ? 'bg-amber-500 text-white' : 'bg-slate-300/80 text-slate-600'
        }`}
      >
        {isLearnModeActive ? 'ON' : 'OFF'}
      </span>
    </button>
  );
};
