// src/components/library-v2/sections/ConflictsSection.tsx
// Seção 6 da Library V2: Gestão de Conflitos e Decisões Canônicas de Engenharia.
// Zero alertas simulados. Escape hatch para o Modo Clássico.

import React from 'react';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import { EmptyStateV2 } from '../common/EmptyStateV2';
import {
  CheckCircle2,
  ShieldCheck,
  History,
  ArrowUpRight
} from 'lucide-react';

export interface ConflictsSectionProps {
  currentFamily: string;
  onSwitchToClassic?: () => void;
}

export const ConflictsSection: React.FC<ConflictsSectionProps> = ({
  currentFamily,
  onSwitchToClassic
}) => {
  const exampleDecisionsHistory = [
    {
      id: 'dec-1',
      datumTitle: `Potência Máxima Consumida (${currentFamily || 'TA-25N'})`,
      selectedVal: '300 W',
      rejectedVal: '250 W (Manual 2024 obsoleto)',
      justification: 'Adotado 300 W conforme medição em bancada e boletim técnico de engenharia de Jan/2026.',
      author: 'Eng. Carlos Eduardo',
      date: '15/01/2026',
      status: 'resolved'
    }
  ];

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
        icon={ShieldCheck}
        title="Nenhum Conflito Ativo no Momento"
        whatIsIt="Esta área lista todas as informações técnicas em que duas ou mais fontes oficiais divergem (ex: potências ou pesos diferentes em manuais distintos)."
        whyIsEmpty="Todos os dados cadastrados nesta família possuem evidências convergentes ou decisões canônicas já registradas pela engenharia."
        conceptId="conflict"
        primaryActionLabel={onSwitchToClassic ? 'Abrir Auditoria no Modo Clássico' : undefined}
        onPrimaryAction={onSwitchToClassic}
      />

      {/* Trilha de Auditoria de Decisões Canônicas Anteriores */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <History size={16} className="text-indigo-600" />
            <span>Exemplo de Decisão Canônica Registrada ({exampleDecisionsHistory.length})</span>
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200">
            EXEMPLO DIDÁTICO
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {exampleDecisionsHistory.map((dec) => (
            <div key={dec.id} className="p-5 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-900">{dec.datumTitle}</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                  <CheckCircle2 size={10} />
                  Resolvido Oficialmente
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <span className="font-bold text-emerald-900 block mb-0.5">Valor Adotado pela Engenharia:</span>
                  <span className="font-mono text-emerald-950 font-bold text-sm">{dec.selectedVal}</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="font-bold text-slate-600 block mb-0.5">Valor Descartado:</span>
                  <span className="font-mono text-slate-500 line-through">{dec.rejectedVal}</span>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-700">
                <span className="font-bold text-slate-800 block mb-1">Justificativa Técnica:</span>
                <span>{dec.justification}</span>
              </div>

              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                <span>Registrado por: {dec.author}</span>
                <span>•</span>
                <span>Data: {dec.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
