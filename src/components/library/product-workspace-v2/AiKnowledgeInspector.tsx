// src/components/library/product-workspace-v2/AiKnowledgeInspector.tsx
import React, { useState } from 'react';
import {
  X,
  Bot,
  FileSearch,
  Copy,
  Check
} from 'lucide-react';
import { AiProductKnowledgeEnvelope } from '../../../domain/product-workspace/types';

export interface AiKnowledgeInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  envelope: AiProductKnowledgeEnvelope | null;
}

export const AiKnowledgeInspector: React.FC<AiKnowledgeInspectorProps> = ({
  isOpen,
  onClose,
  envelope
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'facts' | 'json'>('facts');

  if (!isOpen || !envelope) return null;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(envelope, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
        <div className="w-screen max-w-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800">
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400">
                  <Bot className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Contrato de Consumo de IA (Knowledge Envelope)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Visão canônica estruturada e auditável consumida pelos agentes de IA.
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stats Bar */}
          <div className="px-6 py-3.5 bg-purple-50/40 dark:bg-purple-950/20 border-b border-purple-100 dark:border-purple-900/40 grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Total de Fatos</div>
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {envelope.summary.totalFacts}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Com Proveniência</div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {envelope.summary.factsWithProvenance}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Aprovados/Verificados</div>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {envelope.summary.verifiedOrApprovedFacts}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Sem Evidência Direta</div>
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                {envelope.summary.factsWithoutProvenance}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="px-6 pt-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('facts')}
                className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === 'facts'
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Fatos Mapeados ({envelope.items.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('json')}
                className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === 'json'
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                JSON Puro do Envelope
              </button>
            </div>
            {activeTab === 'json' && (
              <button
                type="button"
                onClick={handleCopyJson}
                className="text-xs text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1 hover:underline pb-2"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar JSON'}
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {activeTab === 'facts' ? (
              <div className="space-y-3">
                {envelope.items.map((item) => (
                  <div
                    key={item.datumId}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.displayLabel}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {item.canonicalSemanticKey}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {item.formattedValue}
                        </div>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            item.hasProvenance
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                          }`}
                        >
                          {item.hasProvenance ? 'Com Prova' : 'Sem Prova Direta'}
                        </span>
                      </div>
                    </div>

                    {item.aliases.length > 0 && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span className="font-medium">Aliases: </span>
                        <span>{item.aliases.join(', ')}</span>
                      </div>
                    )}

                    {item.evidenceReferences.length > 0 && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg flex items-center gap-2">
                        <FileSearch className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">
                          {item.evidenceReferences[0].sourceTitle}
                          {item.evidenceReferences[0].page && ` (p. ${item.evidenceReferences[0].page})`}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <pre className="p-4 rounded-xl bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto select-all leading-relaxed">
                {JSON.stringify(envelope, null, 2)}
              </pre>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
