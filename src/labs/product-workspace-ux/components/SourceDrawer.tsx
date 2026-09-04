// src/labs/product-workspace-ux/components/SourceDrawer.tsx
/**
 * Painel Lateral (Drawer) de Evidências e Origem da Informação.
 * 
 * Regras & Emendas (AMENDMENT 1, 7, 8, 9 & UX1.2):
 * - Suporta 0 fontes, 1 fonte, 2 fontes, até 5 fontes concordantes com visualização limpa.
 * - Suporta distinção explícita entre evidência e origem (product_override).
 * - Tom rigorosamente neutro em conflitos:
 *   "O sistema encontrou informações oficiais divergentes." (zero uso de "erro" ou "falha").
 * - Acessibilidade: role="dialog", aria-modal="true", foco inicial, tecla Escape e foco de retorno.
 * - Componente 100% agnóstico a produto.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  FileQuestion,
  Users,
  CheckCircle2,
  Bookmark
} from 'lucide-react';
import { FactItem, getFactSources, getFactSourceState } from '../types';

interface SourceDrawerProps {
  fact: FactItem | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenConflictReview?: (fact: FactItem) => void;
}

export const SourceDrawer: React.FC<SourceDrawerProps> = ({
  fact,
  isOpen,
  onClose,
  onOpenConflictReview
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
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

  // Fechar com Escape
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

  const sources = getFactSources(fact);
  const sourceState = getFactSourceState(fact);

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-2xs flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Origem da informação para ${fact.label}`}
    >
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Origem da Informação & Evidências
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              {fact.label}
            </h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar painel de evidências"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
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
            <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5">
              <span>Origem:</span>
              <span className="font-semibold text-slate-700">{fact.originLabel}</span>
            </div>
          </div>

          {/* Banner de Especificação Própria (Override da Família) */}
          {fact.originKind === 'product_override' && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center gap-2.5 text-purple-900">
              <Bookmark className="w-5 h-5 text-purple-600 shrink-0" />
              <div>
                <span className="font-bold">Especificação Própria (Override)</span>
                <p className="text-[11px] text-purple-800 mt-0.5">
                  Este produto possui valor homologado exclusivo que prevalece sobre o padrão da linha.
                </p>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* CASO 1: NO SOURCE (Nenhuma fonte vinculada) */}
          {/* ================================================================= */}
          {sourceState === 'no_source' && (
            <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-3 text-center">
              <div className="mx-auto w-10 h-10 bg-slate-200/70 text-slate-500 rounded-full flex items-center justify-center">
                <FileQuestion className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Nenhuma Fonte Vinculada</h4>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                  Esta especificação técnica ainda não possui manual de instrução, catálogo ou certificado associado como evidência comprobatória.
                </p>
              </div>
              <button
                type="button"
                onClick={() => alert('Vincular a um documento do catálogo...')}
                className="w-full py-2 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition-colors shadow-2xs"
              >
                + Vincular a um documento oficial
              </button>
            </div>
          )}

          {/* ================================================================= */}
          {/* CASO 2: CONFLICTING SOURCES (Fontes Divergentes - Tom Neutro) */}
          {/* ================================================================= */}
          {sourceState === 'conflicting_sources' && (
            <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-xl space-y-3">
              <div className="flex items-start gap-2.5 text-amber-900">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">O sistema encontrou informações oficiais divergentes.</h4>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    Documentos oficiais apresentam valores diferentes para esta especificação. O sistema mantém postura neutra e <strong>não assume arbitrariamente qual valor é verdadeiro</strong> até que ocorra validação técnica de engenharia.
                  </p>
                </div>
              </div>

              {onOpenConflictReview && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenConflictReview(fact);
                  }}
                  className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-2xs transition-colors text-center"
                >
                  Revisar e Decidir Valor Oficial
                </button>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* CASO 3: MULTIPLE AGREEING SOURCES (2 ou até 5 fontes concordantes) */}
          {/* ================================================================= */}
          {sourceState === 'multiple_agreeing' && (
            <div className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-900 font-medium">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold">{sources.length} fontes técnicas concordantes</span> confirmam esta especificação no catálogo com lastro consistente.
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* CASO 4: INHERITED SOURCE */}
          {/* ================================================================= */}
          {sourceState === 'inherited_source' && (
            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center gap-2.5 text-blue-900">
              <Users className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <span className="font-bold">Origem Compartilhada: {fact.originLabel}</span>
                <p className="text-[11px] text-blue-800 mt-0.5">
                  Esta evidência comprobatória foi herdada da documentação mestre da família de produtos.
                </p>
              </div>
            </div>
          )}

          {/* LISTA DE FONTES / EVIDÊNCIAS (Legível mesmo com 5 fontes) */}
          {sources.length > 0 && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Documentos Comprobatórios ({sources.length}):
                </span>
              </div>

              {sources.map((src, idx) => (
                <div
                  key={src.documentId || idx}
                  className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 text-[#003366] rounded-lg mt-0.5 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="font-bold text-slate-900 text-xs truncate">
                        {src.documentTitle}
                      </h5>
                      <div className="flex items-center gap-2 mt-1 text-slate-500 font-mono text-[11px] flex-wrap">
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-bold">
                          {src.documentCode}
                        </span>
                        {src.page && <span>Pág. {src.page}</span>}
                        {src.claimValue && (
                          <span className="font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                            Valor afirmado: {src.claimValue}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {src.excerpt && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-700 italic leading-relaxed">
                      &ldquo;{src.excerpt}&rdquo;
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      {src.verifiedStatus === 'verified' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Homologado
                        </span>
                      ) : src.verifiedStatus === 'review_required' ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Revisão necessária
                        </span>
                      ) : (
                        <span className="text-slate-500">Pendente de verificação</span>
                      )}
                    </div>

                    {src.page && (
                      <button
                        type="button"
                        onClick={() => alert(`Abrindo documento ${src.documentCode} na página ${src.page}...`)}
                        className="inline-flex items-center gap-1 text-[#003366] font-semibold hover:underline focus:outline-none"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Abrir pág. {src.page}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ações Globais */}
          {sources.length > 0 && (
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => alert('Listando todas as referências cruzadas deste produto...')}
                className="w-full py-2 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition-colors shadow-2xs"
              >
                Ver todas as fontes vinculadas a este instrumento
              </button>
            </div>
          )}

          {/* Detalhes Técnicos de Auditoria (Colapsável) */}
          <div className="border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="flex items-center justify-between w-full text-slate-400 hover:text-slate-600 font-semibold text-[11px]"
            >
              <span>Detalhes técnicos de auditoria</span>
              {showTechnicalDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showTechnicalDetails && (
              <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 font-mono text-[11px] text-slate-600">
                <div>Semantic Target: {fact.semanticKey}</div>
                <div>Origin Scope: {fact.originScope} ({fact.originLabel})</div>
                <div>Origin Kind: {fact.originKind || 'product_local'}</div>
                <div>Sources Count: {sources.length}</div>
                {sources.map((s, i) => (
                  <div key={i} className="pl-2 border-l border-slate-300 space-y-0.5">
                    <div>Doc ID: {s.documentId || 'N/A'}</div>
                    <div>Status: {s.verifiedStatus}</div>
                    {s.technicalMetadata?.ocrConfidence && (
                      <div>OCR Confidence: {(s.technicalMetadata.ocrConfidence * 100).toFixed(1)}%</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
