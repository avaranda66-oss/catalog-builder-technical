import React, { useState } from 'react';
import { X, Sparkles, CheckCircle2, Search, Bot } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { AIService, ComplianceReport } from '../../services/ai.service';

export const AIAssistantDrawer: React.FC = () => {
  const { isAIAssistantOpen, setAIAssistantOpen } = useUIStore();
  const { currentCatalog } = useCatalogStore();
  const { products } = useLibraryStore();

  const [activeTab, setActiveTab] = useState<'compliance' | 'query'>('compliance');
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [queryText, setQueryText] = useState('');
  const [queryResult, setQueryResult] = useState<{ answer: string; confidence: string } | null>(null);

  if (!isAIAssistantOpen) return null;

  const handleRunCompliance = () => {
    if (!currentCatalog) return;
    const res = AIService.checkCatalogCompliance(currentCatalog, products);
    setReport(res);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryText.trim()) return;
    const res = AIService.queryLibrary(queryText, products);
    setQueryResult({ answer: res.answer, confidence: res.confidence });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-end">
      <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Assistente de IA Factual</h2>
              <p className="text-[11px] text-slate-500 font-mono">Conferência & Consulta sem Alucinações</p>
            </div>
          </div>
          <button
            onClick={() => setAIAssistantOpen(false)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas da IA */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 p-1">
          <button
            onClick={() => setActiveTab('compliance')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'compliance'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Conferir Conformidade
          </button>
          <button
            onClick={() => setActiveTab('query')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'query'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Consultar Biblioteca
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {activeTab === 'compliance' ? (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
                <p className="font-semibold mb-1 flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-amber-600" />
                  <span>Verificador de Integridade Factual</span>
                </p>
                <p className="text-[11px] leading-relaxed">
                  A IA varre todas as tabelas do catálogo e compara cada especificação contra a Biblioteca Oficial, apontando valores customizados e potenciais divergências.
                </p>
              </div>

              <button
                onClick={handleRunCompliance}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Executar Varredura de Conformidade</span>
              </button>

              {report && (
                <div className="space-y-3 pt-2">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between font-mono text-[11px]">
                    <div>
                      <span className="text-slate-500">Linhas Verificadas: </span>
                      <span className="font-bold text-slate-800">{report.totalRowsChecked}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Divergências: </span>
                      <span
                        className={`font-bold ${
                          report.divergenceCount > 0 ? 'text-amber-600' : 'text-emerald-600'
                        }`}
                      >
                        {report.divergenceCount}
                      </span>
                    </div>
                  </div>

                  {report.isFullyCompliant ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      <div>
                        <p className="font-bold">100% em Conformidade</p>
                        <p className="text-[11px] text-emerald-700">
                          Todos os dados tabulares do catálogo correspondem com exatidão à Biblioteca Oficial de Produtos.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h3 className="font-bold text-slate-800 text-xs">Divergências Identificadas:</h3>
                      {report.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg space-y-1.5"
                        >
                          <div className="flex items-center justify-between font-semibold text-amber-900 text-[11px]">
                            <span>Folha {item.pageNumber} — {item.productCode} ({item.productModel})</span>
                          </div>

                          {item.divergences.map((d, dIdx) => (
                            <div key={dIdx} className="text-[11px] text-slate-700 pl-2 border-l-2 border-amber-400">
                              <span className="font-medium text-slate-900">{d.fieldLabel}: </span>
                              <span className="text-amber-800 font-mono font-semibold">{d.localValue}</span>
                              <span className="text-slate-400"> (Oficial: </span>
                              <span className="text-emerald-700 font-mono font-semibold">{d.libraryValue}</span>
                              <span className="text-slate-400">)</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={handleSearch} className="space-y-2">
                <label className="block font-semibold text-slate-700">Dúvida Técnica sobre Sensores</label>
                <div className="relative">
                  <input
                    type="text"
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    placeholder="Ex: Qual a precisão do PCON-200?"
                    className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-brand-600 hover:text-brand-700"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </form>

              {queryResult && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="whitespace-pre-wrap leading-relaxed text-slate-800 text-[11px]">
                    {queryResult.answer}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={() => setAIAssistantOpen(false)}
            className="px-4 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
