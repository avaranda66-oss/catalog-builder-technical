// src/components/library-v2/sections/SourcesEvidenceSection.tsx
// Seção 5 da Library V2: Rastreabilidade de Fontes e Evidências Documentais.
// Zero métricas fabricadas de confiança. Marcação explícita de exemplos didáticos.

import React from 'react';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import {
  FileCheck2,
  BookOpen,
  FileText,
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
  // Exemplos didáticos para demonstrar o modelo de citação e rastreabilidade visual
  const exampleEvidences = [
    {
      id: 'demo-ev-1',
      datumLabel: `Faixa de Temperatura (${currentFamily || 'TA-25N'})`,
      observedValue: '-25 °C a 155 °C',
      docName: 'Manual de Instruções Série TA-N (Exemplo)',
      page: 12,
      section: 'Item 2.1 — Especificações Técnicas Gerais'
    },
    {
      id: 'demo-ev-2',
      datumLabel: 'Exatidão Instrumental',
      observedValue: '± 0,1 °C',
      docName: 'Manual de Instruções Série TA-N (Exemplo)',
      page: 13,
      section: 'Tabela 2.3 — Exatidão e Incertezas de Medição'
    },
    {
      id: 'demo-ev-3',
      datumLabel: 'Tensão de Alimentação',
      observedValue: '115 / 230 Vac, 50/60 Hz',
      docName: 'Folha de Dados Comerciais (Exemplo)',
      page: 2,
      section: 'Características Elétricas'
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
            Cada informação técnica deve possuir uma <TermHelp helpId="evidence" label="Evidência Documental" /> de apoio.
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
            Os itens abaixo são <strong>exemplos didáticos</strong> que demonstram como as citações de engenharia
            são estruturadas visualmente. O sistema <strong>não exibe pontuações artificiais de confiança</strong>.
            A verificação formal de documentos e extração automatizada de snippets ocorre através dos fluxos de auditoria no Modo Clássico.
          </p>
        </div>
      </div>

      {/* Lista de Evidências */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <FileCheck2 size={16} className="text-indigo-600" />
            <span>Exemplos de Evidências Vinculadas ({exampleEvidences.length})</span>
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200">
            EXEMPLO DIDÁTICO
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {exampleEvidences.map((ev) => (
            <div
              key={ev.id}
              className="p-5 hover:bg-indigo-50/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">{ev.datumLabel}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                    EXEMPLO
                  </span>
                </div>

                <div className="text-xs text-slate-700 font-mono font-bold bg-slate-50 p-2 rounded-lg border border-slate-200/80 inline-block">
                  Valor Extraído: <span className="text-indigo-700">{ev.observedValue}</span>
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
                {onSwitchToClassic ? (
                  <button
                    type="button"
                    onClick={onSwitchToClassic}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                  >
                    <BookOpen size={13} className="text-indigo-600" />
                    <span>Ver no Modo Clássico</span>
                  </button>
                ) : (
                  <span
                    className="px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-400 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-not-allowed"
                    title="Visualizador de PDF integrado em homologação."
                  >
                    <BookOpen size={13} />
                    <span>PDF em Homologação</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
