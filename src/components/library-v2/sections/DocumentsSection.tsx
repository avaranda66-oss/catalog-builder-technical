// src/components/library-v2/sections/DocumentsSection.tsx
// Seção 4 da Library V2: Documentos Oficiais Fonte (Manuais, Catálogos, Certificados).
// Transparência de exemplos e escape hatch para o modo clássico.

import React from 'react';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import { EmptyStateV2 } from '../common/EmptyStateV2';
import {
  FileText,
  Upload,
  ArrowUpRight
} from 'lucide-react';

export interface DocumentsSectionProps {
  currentFamily: string;
  onSwitchToClassic?: () => void;
}

export const DocumentsSection: React.FC<DocumentsSectionProps> = ({
  currentFamily,
  onSwitchToClassic
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner de Documentos */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Documentos Fonte & Certificados
            </span>
            <ContextHelpTrigger helpId="source-document" variant="subtle" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Documentos da Família
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Um <TermHelp helpId="source-document" label="Documento Fonte" /> pode apoiar auditoria quando estiver realmente carregado e vinculado.
          </p>
        </div>

        {onSwitchToClassic && (
          <button
            type="button"
            onClick={onSwitchToClassic}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <Upload size={14} />
            <span>Gerenciar Documentos no Modo Clássico</span>
            <ArrowUpRight size={13} className="text-indigo-200" />
          </button>
        )}
      </div>

      <EmptyStateV2
        icon={FileText}
        title="Documentos não carregados"
        whatIsIt="Esta área apresenta documentos reais associados à família quando houver dados documentais disponíveis."
        whyIsEmpty={`Nenhum documento auditável foi carregado para ${currentFamily || 'a família atual'} na Library V2.`}
        conceptId="source-document"
        primaryActionLabel={onSwitchToClassic ? 'Gerenciar no Modo Clássico' : undefined}
        onPrimaryAction={onSwitchToClassic}
      />
    </div>
  );
};
