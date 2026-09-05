// src/components/library-v2/sections/ConflictsSection.tsx
// Seção 6 da Library V2: Gestão de Conflitos e Decisões Canônicas de Engenharia.
// Zero alertas simulados. Escape hatch para o Modo Clássico.

import React from 'react';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import { EmptyStateV2 } from '../common/EmptyStateV2';
import {
  AlertTriangle,
  ArrowUpRight
} from 'lucide-react';

export interface ConflictsSectionProps {
  currentFamily: string;
  onSwitchToClassic?: () => void;
}

export const ConflictsSection: React.FC<ConflictsSectionProps> = ({
  currentFamily: _currentFamily,
  onSwitchToClassic
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Auditoria de Qualidade & Governança
            </span>
            <ContextHelpTrigger helpId="conflict" variant="subtle" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Conflitos de Evidências & Decisões Canônicas
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quando duas fontes oficiais informam valores diferentes, a engenharia arbitra registrando uma{' '}
            <TermHelp helpId="canonical-decision" label="Decisão Canônica" />.
          </p>
        </div>

        {onSwitchToClassic && (
          <button
            type="button"
            onClick={onSwitchToClassic}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors"
          >
            <span>Gerenciar Conflitos no Modo Clássico</span>
            <ArrowUpRight size={13} className="text-slate-500" />
          </button>
        )}
      </div>

      {/* Estado atual de conflitos ativos */}
      <EmptyStateV2
        icon={AlertTriangle}
        title="Conflitos não auditados"
        whatIsIt="Esta área registra divergências entre fontes e permite consultar o conceito de decisão canônica quando houver autoridade de auditoria carregada."
        whyIsEmpty="A Library V2 não possui uma auditoria de conflitos carregada para afirmar presença, ausência ou resolução de divergências."
        conceptId="conflict"
        primaryActionLabel={onSwitchToClassic ? 'Abrir Auditoria no Modo Clássico' : undefined}
        onPrimaryAction={onSwitchToClassic}
      />
    </div>
  );
};
