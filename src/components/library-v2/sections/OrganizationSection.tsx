// src/components/library-v2/sections/OrganizationSection.tsx
// Seção 7 da Library V2: Organização de Módulos e Ordenação de Especificações.
// Foco estrito em ordenação e estrutura de produto/workspace. Escape hatch para o modo clássico.

import React from 'react';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import { EmptyStateV2 } from '../common/EmptyStateV2';
import {
  Layers,
  ArrowUpRight
} from 'lucide-react';

export interface OrganizationSectionProps {
  currentFamily: string;
  onSwitchToClassic?: () => void;
}

export const OrganizationSection: React.FC<OrganizationSectionProps> = ({
  currentFamily,
  onSwitchToClassic
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Estruturação & Capítulos
            </span>
            <ContextHelpTrigger helpId="module" variant="subtle" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Organização Técnica
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            <TermHelp helpId="module" label="Módulos" /> podem estruturar informações quando uma organização real estiver carregada.
          </p>
        </div>

        {onSwitchToClassic && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSwitchToClassic}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <Layers size={14} />
              <span>Reorganizar Módulos no Modo Clássico</span>
              <ArrowUpRight size={13} className="text-indigo-200" />
            </button>
          </div>
        )}
      </div>

      <EmptyStateV2
        icon={Layers}
        title="Organização não carregada"
        whatIsIt="Esta área apresenta módulos e sua ordenação somente quando uma estrutura real estiver disponível."
        whyIsEmpty={`Nenhuma estrutura de módulos foi carregada para ${currentFamily || 'a família atual'}.`}
        conceptId="module"
        primaryActionLabel={onSwitchToClassic ? 'Reorganizar no Modo Clássico' : undefined}
        onPrimaryAction={onSwitchToClassic}
      />
    </div>
  );
};
