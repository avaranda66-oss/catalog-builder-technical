// src/components/library-v2/sections/OrganizationSection.tsx
// Seção 7 da Library V2: Organização de Módulos e Ordenação de Especificações.

import React from 'react';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import {
  Plus,
  MoveVertical,
  Edit2
} from 'lucide-react';

export interface OrganizationSectionProps {
  currentFamily: string;
}

export const OrganizationSection: React.FC<OrganizationSectionProps> = ({ currentFamily: _currentFamily }) => {
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
          >
            <Plus size={14} />
            <span>Novo Módulo</span>
          </button>
        </div>
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
              <button
                type="button"
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Reordenar Módulo"
              >
                <MoveVertical size={16} />
              </button>
              <button
                type="button"
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Editar Nome do Módulo"
              >
                <Edit2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
