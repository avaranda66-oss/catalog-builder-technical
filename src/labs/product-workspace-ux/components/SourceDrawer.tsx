// src/labs/product-workspace-ux/components/SourceDrawer.tsx
import React, { useState } from 'react';
import { X, FileText, ChevronDown, ChevronUp, ExternalLink, ShieldCheck } from 'lucide-react';
import { FactItem } from '../types';

interface SourceDrawerProps {
  fact: FactItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SourceDrawer: React.FC<SourceDrawerProps> = ({
  fact,
  isOpen,
  onClose
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  if (!isOpen || !fact || !fact.source) return null;

  const source = fact.source;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-2xs flex justify-end">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Origem da Informação
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              {fact.label}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Evidências */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Valor Atual */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <span className="text-[11px] font-medium text-slate-500">Valor Atual no Catálogo:</span>
            <div className="text-xl font-bold text-slate-900 font-mono mt-0.5">
              {fact.value} {fact.unit || ''}
            </div>
          </div>

          {/* Dados do Manual / Fonte */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-50 text-[#003366] rounded-lg mt-0.5">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  {source.documentTitle}
                </h4>
                <div className="flex items-center gap-2 mt-1 text-slate-500 font-mono">
                  <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-bold">
                    {source.documentCode}
                  </span>
                  <span>Página {source.page}</span>
                </div>
              </div>
            </div>

            {/* Trecho Transcrito / Evidência */}
            <div className="bg-amber-50/40 border border-amber-200/80 rounded-xl p-3.5 space-y-1.5">
              <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                Trecho Oficial Identificado:
              </span>
              <p className="text-xs text-slate-700 leading-relaxed italic">
                &ldquo;{source.excerpt}&rdquo;
              </p>
            </div>

            {/* Status de Verificação */}
            <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Verificado e homologado pela equipe de engenharia metrológica</span>
            </div>
          </div>

          {/* Ações */}
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => alert(`Abrindo documento ${source.documentCode} na página ${source.page}...`)}
              className="w-full py-2.5 px-4 bg-[#003366] hover:bg-[#00254d] text-white font-semibold rounded-lg flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Abrir documento na página {source.page}</span>
            </button>
            <button
              onClick={() => alert('Listando todas as 94 referências deste manual...')}
              className="w-full py-2 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition-colors"
            >
              Ver todas as fontes deste produto
            </button>
          </div>

          {/* Detalhes Técnicos (Colapsável) */}
          <div className="border-t border-slate-200 pt-3">
            <button
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="flex items-center justify-between w-full text-slate-400 hover:text-slate-600 font-semibold"
            >
              <span>Detalhes técnicos de auditoria</span>
              {showTechnicalDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showTechnicalDetails && (
              <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 font-mono text-[11px] text-slate-600">
                <div>Document ID: {source.documentId}</div>
                <div>Status: {source.verifiedStatus}</div>
                {source.technicalMetadata?.ocrConfidence && (
                  <div>OCR Confidence: {(source.technicalMetadata.ocrConfidence * 100).toFixed(1)}%</div>
                )}
                {source.technicalMetadata?.uploadedAt && (
                  <div>Ingested At: {source.technicalMetadata.uploadedAt}</div>
                )}
                <div>Semantic Target: {fact.semanticKey}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
