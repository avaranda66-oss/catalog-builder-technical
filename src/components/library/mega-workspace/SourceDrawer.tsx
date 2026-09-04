// src/components/library/mega-workspace/SourceDrawer.tsx
// Painel lateral de rastreabilidade de fontes para o Mega Workspace (Produção).
// Emendas implementadas:
// - Emenda E: Zero fabricated confidence. Mostra apenas atributos canônicos reais existentes.
// - Emenda L: Partial provenance fail-soft. Documento ausente mostra "Documento de origem indisponível".
// - Zero explicit any.

import React, { useEffect, useRef } from 'react';
import {
  X,
  FileText,
  AlertTriangle,
  FileQuestion,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Building
} from 'lucide-react';
import {
  ProjectedFactVM,
  ProjectedSourceVM
} from '../../../domain/product-workspace/view-model';

interface SourceDrawerProps {
  fact: ProjectedFactVM | null;
  sourcesById: Readonly<Record<string, ProjectedSourceVM>>;
  isOpen: boolean;
  onClose: () => void;
  onOpenSemanticAdvanced?: (fact: ProjectedFactVM) => void;
}

export const SourceDrawer: React.FC<SourceDrawerProps> = ({
  fact,
  sourcesById,
  isOpen,
  onClose,
  onOpenSemanticAdvanced
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
    } else if (!isOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !fact) return null;

  const docIds = fact.sourceDocumentIds || [];
  const associatedSources = docIds.map((id) => sourcesById[id] || {
    id,
    title: 'Documento de origem indisponível',
    documentType: 'unknown',
    citationCount: 1,
    isUnavailable: true
  });

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Origem da informação para ${fact.canonicalLabel}`}
    >
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Rastreabilidade de Fontes & Evidências
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              {fact.canonicalLabel}
            </h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar painel de evidências"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Card de Fato Atual */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Valor Factual Vigente
            </span>
            <div className="text-xl font-bold text-slate-900 mt-1">
              {fact.formattedValue}
            </div>

            {/* Origem e Herança */}
            <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1.5 font-medium">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                Origem:
              </span>
              <span className="font-semibold text-slate-800">
                {fact.originLabel}
              </span>
            </div>

            {/* Aviso de Override Pendente (Emenda G) */}
            {fact.isPendingOverride && (
              <div className="mt-3 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
                <span className="font-semibold">Existe uma alteração em revisão:</span>
                <span className="block mt-0.5 text-blue-900 font-medium">
                  {fact.pendingOverrideValue || 'Novo valor em rascunho'}
                </span>
                <span className="block text-[11px] text-blue-600 mt-1">
                  O valor comprovado da família continua ativo para segurança metrológica.
                </span>
              </div>
            )}
          </div>

          {/* Aviso de Conflito Técnico */}
          {fact.hasConflict && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
              <div className="flex items-center gap-2 font-semibold text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Informações Técnicas Concorrentes
              </div>
              <p className="text-xs text-amber-700 mt-1.5 leading-relaxed">
                Foram encontradas fontes documentais com dados divergentes para esta característica.
                A engenharia deve verificar as evidências abaixo para consenso.
              </p>
            </div>
          )}

          {/* Lista de Documentos Comprobatórios */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Fontes Referenciadas ({associatedSources.length})
              </h4>
              {fact.evidenceState === 'multiple_agreeing' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" />
                  Múltiplas Fontes Concordam
                </span>
              )}
            </div>

            {associatedSources.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center">
                <FileQuestion className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                <p className="text-xs font-medium text-slate-600">
                  Nenhuma fonte técnica vinculada a este dado.
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Dado inserido diretamente ou herdado sem anexo de evidência.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {associatedSources.map((source, index) => (
                  <div
                    key={source.id || index}
                    className={`p-4 rounded-xl border transition-all ${
                      source.isUnavailable
                        ? 'bg-amber-50/50 border-amber-200 text-amber-900'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <div className="p-2 rounded-lg bg-slate-100 text-slate-600 shrink-0 mt-0.5">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <h5 className="text-sm font-semibold text-slate-900 leading-snug">
                            {source.title}
                          </h5>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                            {source.documentType && (
                              <span className="capitalize">{source.documentType}</span>
                            )}
                            {source.revision && (
                              <span>Rev. {source.revision}</span>
                            )}
                            {source.language && (
                              <span className="uppercase">{source.language}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {source.externalUrl && (
                        <a
                          href={source.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                          title="Abrir documento original"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>

                    {source.isUnavailable && (
                      <p className="text-xs text-amber-700 mt-2 font-medium">
                        ⚠ Documento original não disponível na biblioteca local ativa.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Auditado pelo PIM
          </div>

          {onOpenSemanticAdvanced && (
            <button
              onClick={() => onOpenSemanticAdvanced(fact)}
              className="text-xs font-semibold text-[#003366] hover:underline"
            >
              Ver Detalhes Avançados
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
