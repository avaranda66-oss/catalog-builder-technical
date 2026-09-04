// src/components/library-v2/sections/SourcesEvidenceSection.tsx
// Seção 5 da Library V2: Rastreabilidade de Fontes e Evidências Documentais.

import React from 'react';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import {
  FileCheck2,
  BookOpen,
  CheckCircle2,
  FileText
} from 'lucide-react';

export interface SourcesEvidenceSectionProps {
  currentFamily: string;
}

export const SourcesEvidenceSection: React.FC<SourcesEvidenceSectionProps> = ({ currentFamily }) => {
  const evidences = [
    {
      id: 'ev-1',
      datumLabel: `Faixa de Temperatura (${currentFamily || 'TA-25N'})`,
      observedValue: '-25 °C a 155 °C',
      docName: 'Manual de Instruções Série TA-N',
      page: 12,
      section: 'Item 2.1 — Especificações Técnicas Gerais',
      confidence: '100% (Consenso Oficial)',
      date: 'Jan/2026'
    },
    {
      id: 'ev-2',
      datumLabel: 'Exatidão com Termômetro Interno',
      observedValue: '± 0,1 °C',
      docName: 'Manual de Instruções Série TA-N',
      page: 13,
      section: 'Tabela 2.3 — Exatidão e Incertezas de Medição',
      confidence: '100% (Consenso Oficial)',
      date: 'Jan/2026'
    },
    {
      id: 'ev-3',
      datumLabel: 'Tensão de Alimentação',
      observedValue: '115 / 230 Vac, 50/60 Hz',
      docName: 'Folha de Dados Comerciais',
      page: 2,
      section: 'Características Elétricas',
      confidence: '100% (Verificado)',
      date: 'Dez/2025'
    }
  ];

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
            Evidências Documentais Auditáveis
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Nenhuma informação técnica existe sem uma <TermHelp helpId="evidence" label="Evidência Documental" /> associada.
            Audite trechos, páginas e documentos originais em segundos.
          </p>
        </div>
      </div>

      {/* Lista de Evidências */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <FileCheck2 size={16} className="text-indigo-600" />
            <span>Evidências Vinculadas à Família ({evidences.length})</span>
          </span>
          <span className="text-xs text-slate-500 font-mono">Status: 100% Auditado</span>
        </div>

        <div className="divide-y divide-slate-100">
          {evidences.map((ev) => (
            <div
              key={ev.id}
              className="p-5 hover:bg-indigo-50/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">{ev.datumLabel}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 size={10} />
                    {ev.confidence}
                  </span>
                </div>

                <div className="text-xs text-slate-700 font-mono font-bold bg-slate-50 p-2 rounded-lg border border-slate-200/80 inline-block">
                  Valor Observado: <span className="text-indigo-700">{ev.observedValue}</span>
                </div>

                <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    <FileText size={12} className="text-slate-400" />
                    {ev.docName}
                  </span>
                  <span>•</span>
                  <span>Página {ev.page}</span>
                  <span>•</span>
                  <span>{ev.section}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                >
                  <BookOpen size={13} className="text-indigo-600" />
                  <span>Ver no PDF</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
