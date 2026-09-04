// src/components/library-v2/sections/OrganizationSection.tsx
// Seção 7 da Library V2: Organização de Módulos e Ordenação de Especificações.
// Foco estrito em ordenação e estrutura de produto/workspace. Escape hatch para o modo clássico.

import React from 'react';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import {
  Layers,
  MoveVertical,
  ArrowUpRight,
  Info
} from 'lucide-react';

export interface OrganizationSectionProps {
  currentFamily: string;
  onSwitchToClassic?: () => void;
}

export const OrganizationSection: React.FC<OrganizationSectionProps> = ({
  currentFamily: _currentFamily,
  onSwitchToClassic
}) => {
  const modules = [
    {
      id: 'mod-general',
      title: 'Informações Gerais & Identificação',
      order: 1,
      semanticKey: 'general.info',
      fieldsCount: 4,
      description: 'Código de pedido, modelo comercial, descrição resumida e fotos oficiais.'
    },
    {
      id: 'mod-metrology',
      title: 'Especificações Metrológicas',
      order: 2,
      semanticKey: 'metrology.specs',
      fieldsCount: 7,
      description: 'Faixa térmica, estabilidade, exatidão instrumental e poços de calibração.'
    },
    {
      id: 'mod-electrical',
      title: 'Características Elétricas & Comunicação',
      order: 3,
      semanticKey: 'electrical.specs',
      fieldsCount: 5,
      description: 'Tensão de alimentação, consumo máximo em watts e portas RS-232 / USB.'
    },
    {
      id: 'mod-mechanical',
      title: 'Construção Mecânica & Dimensões',
      order: 4,
      semanticKey: 'mechanical.specs',
      fieldsCount: 6,
      description: 'Dimensões externas (A x L x P), peso aproximado e grau de proteção IP.'
    }
  ];

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
            Organização dos Módulos do Caderno Técnico
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Organize os dados em <TermHelp helpId="module" label="Módulos" /> coerentes. A ordem definida aqui é
            a mesma adotada na diagramação das páginas do catálogo.
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

      {/* Aviso de Transparência */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3 text-xs text-slate-700">
        <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Esta tela reflete a estrutura de módulos técnicos e ordenação das especificações. A reorganização interativa e adição de novos capítulos de engenharia são gerenciadas diretamente no <strong>Modo Clássico</strong>.
        </p>
      </div>

      {/* Lista de Módulos */}
      <div className="space-y-3">
        {modules.map((m) => (
          <div
            key={m.id}
            className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center font-mono shrink-0">
                #{m.order}
              </span>
              <div>
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <span>{m.title}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {m.fieldsCount} propriedades
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onSwitchToClassic ? (
                <button
                  type="button"
                  onClick={onSwitchToClassic}
                  className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors"
                  title="Abrir no Modo Clássico para reordenar"
                >
                  <MoveVertical size={13} />
                  <span>Reordenar</span>
                </button>
              ) : (
                <span
                  className="px-2.5 py-1.5 bg-slate-50 text-slate-400 rounded-lg text-xs font-medium inline-flex items-center gap-1 cursor-not-allowed"
                  title="Reordenação no Modo Clássico"
                >
                  <MoveVertical size={13} />
                  <span>Modo Clássico</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
