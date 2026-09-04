// src/components/library-v2/sections/DocumentsSection.tsx
// Seção 4 da Library V2: Documentos Oficiais Fonte (Manuais, Catálogos, Certificados).
// Transparência de exemplos e escape hatch para o modo clássico.

import React from 'react';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import {
  FileText,
  Upload,
  ArrowUpRight,
  Info
} from 'lucide-react';

export interface DocumentsSectionProps {
  currentFamily: string;
  onSwitchToClassic?: () => void;
}

export const DocumentsSection: React.FC<DocumentsSectionProps> = ({
  currentFamily,
  onSwitchToClassic
}) => {
  // Exemplos didáticos representativos de manuais industriais
  const exampleDocuments = [
    {
      id: 'doc-manual-ta',
      title: `Manual de Instruções e Especificações Técnicas - ${currentFamily || 'Série TA-N'}`,
      version: 'Rev. 2.4 (Exemplo)',
      fileType: 'PDF',
      size: '2.8 MB',
      pages: 48,
      evidencesCount: 16
    },
    {
      id: 'doc-datasheet-ta',
      title: `Folha de Dados Comerciais e Metrológicos - ${currentFamily || 'TA-25N / TA-35N / TA-50N'}`,
      version: 'Rev. 1.1 (Exemplo)',
      fileType: 'PDF',
      size: '1.2 MB',
      pages: 4,
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

      {/* Banner Informativo */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3 text-xs text-slate-700">
        <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Os documentos exibidos abaixo são <strong>estruturas de demonstração didática</strong>. O upload, indexação de texto e vinculação real de PDFs de engenharia são gerenciados operacionalmente através da aba de documentos do <strong>Modo Clássico</strong>.
        </p>
      </div>

      {/* Lista de Documentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exampleDocuments.map((doc) => (
          <div
            key={doc.id}
            className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <span className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700">
                  <FileText size={22} />
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-900 border border-amber-200">
                  EXEMPLO DIDÁTICO
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
              <span className="text-xs text-indigo-600 font-semibold">
                {doc.evidencesCount} trechos indexados
              </span>
              {onSwitchToClassic ? (
                <button
                  type="button"
                  onClick={onSwitchToClassic}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                >
                  <span>Abrir no Modo Clássico</span>
                  <ArrowUpRight size={12} className="text-slate-500" />
                </button>
              ) : (
                <span
                  className="px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-xs font-semibold cursor-not-allowed"
                  title="Upload e gestão no Modo Clássico"
                >
                  Em Homologação
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
