// src/components/library-v2/sections/SourcesEvidenceSection.tsx
// Seção 5 da Library V2: Rastreabilidade de Fontes e Evidências Documentais.
// Zero métricas fabricadas de confiança. Marcação explícita de exemplos didáticos.

import React from 'react';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import { EmptyStateV2 } from '../common/EmptyStateV2';
import {
  FileCheck2,
  ArrowUpRight,
  Info
} from 'lucide-react';

export interface SourcesEvidenceSectionProps {
  currentFamily: string;
  onSwitchToClassic?: () => void;
}

export const SourcesEvidenceSection: React.FC<SourcesEvidenceSectionProps> = ({
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
              Rastreabilidade & Procedência
            </span>
            <ContextHelpTrigger helpId="evidence" variant="subtle" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Fontes & Evidências
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Uma <TermHelp helpId="evidence" label="Evidência Documental" /> pode sustentar um valor quando existir um vínculo auditável carregado.
          </p>
        </div>

        {onSwitchToClassic && (
          <button
            type="button"
            onClick={onSwitchToClassic}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors"
          >
            <span>Auditar Fontes no Modo Clássico</span>
            <ArrowUpRight size={13} className="text-slate-500" />
          </button>
        )}
      </div>

      {/* Aviso de Transparência Metodológica */}
      <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 flex items-start gap-3 text-xs text-indigo-950">
        <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold block">Transparência de Metadados:</span>
          <p className="text-slate-600 leading-relaxed">
            A Library V2 só apresenta procedência quando houver uma fonte realmente carregada e vinculada ao dado.
            Na ausência dessa autoridade, a seção permanece sem registros operacionais.
          </p>
        </div>
      </div>

      <EmptyStateV2
        icon={FileCheck2}
        title="Evidências não carregadas"
        whatIsIt="Esta área lista somente fontes e evidências realmente vinculadas aos dados técnicos."
        whyIsEmpty={`Nenhum conjunto de evidências auditáveis foi carregado para ${currentFamily || 'a família atual'}.`}
        conceptId="evidence"
        primaryActionLabel={onSwitchToClassic ? 'Auditar no Modo Clássico' : undefined}
        onPrimaryAction={onSwitchToClassic}
      />
    </div>
  );
};
