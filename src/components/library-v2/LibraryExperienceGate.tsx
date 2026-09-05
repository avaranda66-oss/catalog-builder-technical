// src/components/library-v2/LibraryExperienceGate.tsx
// Gate comutador entre a Library Classic / Pro (padrão mantido 100%) e a Library V2 Guided.
// Suporta comutação em runtime e parâmetro de URL (?library=v2).

import React, { useState } from 'react';
import { LibraryView } from '../library/LibraryView';
import { LibraryV2Container } from './LibraryV2Container';
import { Sparkles } from 'lucide-react';

export interface LibraryExperienceGateProps {
  forcedExperience?: 'classic' | 'v2';
}

export const LibraryExperienceGate: React.FC<LibraryExperienceGateProps> = ({ forcedExperience }) => {
  const [experience, setExperience] = useState<'classic' | 'v2'>(() => {
    if (forcedExperience) return forcedExperience;

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('library') === 'v2') return 'v2';
    }

    // Padrão de segurança estrito: Library Classic sempre ativa por padrão
    return 'classic';
  });

  const handleSwitchToV2 = () => {
    setExperience('v2');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('library', 'v2');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const handleSwitchToClassic = () => {
    setExperience('classic');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('library');
      window.history.replaceState({}, '', url.toString());
    }
  };

  if (experience === 'v2') {
    return <LibraryV2Container onSwitchToClassic={handleSwitchToClassic} />;
  }

  return (
    <div className="relative h-full flex flex-col">
      {/* Banner discreto de opt-in para a Library V2 sobre a Library Classic */}
      <div className="absolute top-3 right-24 z-30 pointer-events-auto">
        <button
          type="button"
          onClick={handleSwitchToV2}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold shadow-md transition-all hover:scale-105 active:scale-95 border border-white/20"
          title="Experimentar a nova Library V2 Guided com sistema de aprendizado contextual"
        >
          <Sparkles size={13} className="text-amber-300" />
          <span>✨ Testar Library V2 Guided</span>
          <span className="bg-white/25 text-[10px] px-1 rounded font-mono font-semibold">BETA</span>
        </button>
      </div>

      {/* Library Classic preservada 100% como referência operacional */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <LibraryView />
      </div>
    </div>
  );
};
