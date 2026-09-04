// src/components/library-v2/sections/DocumentsSection.tsx
// Seção 4 da Library V2: Documentos Oficiais Fonte (Manuais, Catálogos, Certificados).

import React from 'react';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import {
  FileText,
  Upload,
  ShieldCheck,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';

export interface DocumentsSectionProps {
  currentFamily: string;
}

export const DocumentsSection: React.FC<DocumentsSectionProps> = ({ currentFamily }) => {
  const documents = [
    {
      id: 'doc-manual-ta',
      title: `Manual de Instruções e Especificações Técnicas - ${currentFamily || 'Série TA-N'}`,
      version: 'Rev. 2.4 (Jan/2026)',
      fileType: 'PDF',
      size: '2.8 MB',
      pages: 48,
      status: 'verified',
      evidencesCount: 16
    },
    {
      id: 'doc-datasheet-ta',
      title: `Folha de Dados Comerciais e Metrológicos - ${currentFamily || 'TA-25N / TA-35N / TA-50N'}`,
      version: 'Rev. 1.1 (2025)',
      fileType: 'PDF',
      size: '1.2 MB',
      pages: 4,
      status: 'verified',
      evidencesCount: 8
    }
  ];

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
            Documentação Técnica Oficial de Fábrica
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cada <TermHelp helpId="source-document" label="Documento Fonte" /> registrado serve como base para
            extração e auditoria das especificações técnicas da família.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
          >
            <Upload size={14} />
            <span>Registrar Novo Documento</span>
          </button>
        </div>
      </div>

      {/* Lista de Documentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <span className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700">
                  <FileText size={22} />
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                  <ShieldCheck size={11} />
                  Oficial Verificado
                </span>
              </div>

              <h3 className="text-sm font-bold text-slate-900 leading-snug mb-1">
                {doc.title}
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-2 font-mono">
                <span>{doc.version}</span>
                <span>•</span>
                <span>{doc.pages} páginas</span>
                <span>•</span>
                <span>{doc.size}</span>
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-indigo-600 font-semibold flex items-center gap-1">
                <CheckCircle2 size={13} />
                {doc.evidencesCount} evidências ativas
              </span>
              <button
                type="button"
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
              >
                <span>Visualizar PDF</span>
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
