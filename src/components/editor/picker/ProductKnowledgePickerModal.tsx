// src/components/editor/picker/ProductKnowledgePickerModal.tsx
// Modal de Seleção de Conhecimento Técnico / PIM para Table Core V2.
// Fail-closed por padrão: NUNCA exibe dados mockados em produção quando o provider está indisponível.
// Zero explicit any.

import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Database,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import {
  ProductKnowledgeProvider,
  ProductKnowledgeSearchResult,
  UnavailableProductKnowledgeProvider
} from '../../../domain/table-binding/product-knowledge-provider.types';
import { TableCellLiteralContent } from '../../../domain/table-core/table.types';
import { CatalogCellBinding } from '../../../domain/catalog.schema';

interface ProductKnowledgePickerModalProps {
  provider?: ProductKnowledgeProvider;
}

export const ProductKnowledgePickerModal: React.FC<ProductKnowledgePickerModalProps> = ({
  provider = new UnavailableProductKnowledgeProvider()
}) => {
  const {
    isProductKnowledgePickerModalOpen,
    knowledgePickerTarget,
    closeProductKnowledgePickerModal
  } = useUIStore();

  const {
    setTableCellBinding,
    addTableColumn
  } = useCatalogStore();

  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'datum' | 'dataset' | 'saved_view'>('all');
  const [results, setResults] = useState<ProductKnowledgeSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ProductKnowledgeSearchResult | null>(null);

  const isAvailable = provider.isAvailable ? provider.isAvailable() : false;

  useEffect(() => {
    if (!isProductKnowledgePickerModalOpen || !isAvailable) {
      setResults([]);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const targetProductId = knowledgePickerTarget?.targetCell
      ? undefined
      : undefined;

    provider
      .search(targetProductId, query)
      .then((res: ProductKnowledgeSearchResult[]) => {
        if (isMounted) {
          const filtered = kindFilter === 'all'
            ? res
            : res.filter((r) => r.kind === kindFilter);
          setResults(filtered);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setResults([]);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isProductKnowledgePickerModalOpen, query, kindFilter, isAvailable, provider, knowledgePickerTarget]);

  if (!isProductKnowledgePickerModalOpen) return null;

  const handleBindToTargetCell = (item: ProductKnowledgeSearchResult) => {
    if (!knowledgePickerTarget || !knowledgePickerTarget.targetCell) return;
    const { blockId, targetCell } = knowledgePickerTarget;

    const binding: CatalogCellBinding = {
      sourceKind: item.kind === 'dataset' ? 'dataset' : 'pim_datum',
      productId: item.productId,
      semanticKey: item.semanticKey,
      datasetId: item.datasetId,
      bindingMode: 'live',
      snapshot: typeof item.preview !== 'string' ? item.preview : undefined
    };

    setTableCellBinding(blockId, targetCell.rowId, targetCell.columnId, binding);
    closeProductKnowledgePickerModal();
  };

  const handleAddAsColumn = (item: ProductKnowledgeSearchResult) => {
    if (!knowledgePickerTarget) return;
    const { blockId } = knowledgePickerTarget;

    addTableColumn(blockId, {
      key: item.semanticKey,
      label: item.label,
      visible: true,
      width: 140,
      isCustom: false
    });

    // Se houver uma linha alvo, vincula diretamente
    if (knowledgePickerTarget.targetCell) {
      const binding: CatalogCellBinding = {
        sourceKind: item.kind === 'dataset' ? 'dataset' : 'pim_datum',
        productId: item.productId,
        semanticKey: item.semanticKey,
        datasetId: item.datasetId,
        bindingMode: 'live',
        snapshot: typeof item.preview !== 'string' ? item.preview : undefined
      };

      setTableCellBinding(blockId, knowledgePickerTarget.targetCell.rowId, item.semanticKey, binding);
    }

    closeProductKnowledgePickerModal();
  };

  const renderStatusBadge = (status?: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Aprovado
          </span>
        );
      case 'conflicting':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" /> Conflito
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" /> Rascunho
          </span>
        );
    }
  };

  const renderPreviewValue = (preview: string | TableCellLiteralContent) => {
    if (typeof preview === 'string') {
      return <span className="font-mono text-slate-900 text-[11px]">{preview}</span>;
    }

    switch (preview.kind) {
      case 'text':
        return <span className="font-medium text-slate-800 text-[11px]">{preview.text}</span>;
      case 'number':
        return <span className="font-mono text-slate-900 text-[11px]">{preview.value}</span>;
      case 'value_unit':
        return (
          <span className="font-mono text-slate-900 text-[11px]">
            {preview.qualifier ? `${preview.qualifier} ` : ''}
            {preview.amount} {preview.unit}
          </span>
        );
      case 'range':
        return (
          <span className="font-mono text-slate-900 text-[11px]">
            {preview.lower !== undefined ? preview.lower : ''} a {preview.upper !== undefined ? preview.upper : ''}{' '}
            {preview.unit || ''}
          </span>
        );
      case 'boolean':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-800">
            {preview.value ? 'SIM' : 'NÃO'}
          </span>
        );
      case 'technical_token':
        return (
          <span className="font-mono px-1.5 py-0.5 rounded text-[9px] bg-slate-100 text-slate-800 border border-slate-200">
            {preview.token}
          </span>
        );
      case 'enum':
        return <span className="text-[11px] text-slate-700">{preview.label || preview.code}</span>;
      default:
        return <span className="text-slate-400 text-[11px]">—</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#001f3f] text-white flex items-center justify-center shadow-sm">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-none">
                Conhecimento Técnico & PIM
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Vincule pontos de dados técnicos ou datasets de produtos à tabela.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeProductKnowledgePickerModal}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FAIL-CLOSED EM PRODUÇÃO QUANDO DESCONECTADO */}
        {!isAvailable ? (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-3 flex-1 min-h-[300px]">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="text-base font-bold text-slate-800">
                Conhecimento Técnico Indisponível
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                O serviço de conhecimento técnico / PIM não está conectado neste ambiente.
                Por segurança corporativa e rastreabilidade metrológica, dados simulados não são
                exibidos como dados oficiais.
              </p>
            </div>
            <div className="pt-3">
              <button
                type="button"
                onClick={closeProductKnowledgePickerModal}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                Entendido, Fechar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Barra de Busca e Filtros */}
            <div className="p-4 border-b border-slate-200 bg-white space-y-3 flex-shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por parâmetro, código, modelo (ex: range, exatidão, PCON)..."
                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-500 mr-1">Tipo:</span>
                {(
                  [
                    { key: 'all', label: 'Todos' },
                    { key: 'datum', label: 'Pontos de Dado' },
                    { key: 'dataset', label: 'Tabelas Técnicas' },
                    { key: 'saved_view', label: 'Visões Salvas' }
                  ] as const
                ).map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setKindFilter(f.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      kindFilter === f.key
                        ? 'bg-[#001f3f] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de Resultados */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
              {isLoading ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Consultando conhecimento técnico...
                </div>
              ) : results.length === 0 ? (
                <div className="py-12 text-center space-y-1">
                  <p className="text-xs font-medium text-slate-600">Nenhum dado encontrado.</p>
                  <p className="text-[11px] text-slate-400">
                    Tente buscar por termos como "range", "exatidão", "pressão" ou código de modelo.
                  </p>
                </div>
              ) : (
                results.map((item) => {
                  const isSelected = selectedResult?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedResult(item)}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-slate-900">
                              {item.label}
                            </span>
                            {item.productModel && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-100 text-slate-700">
                                {item.productModel}
                              </span>
                            )}
                            {renderStatusBadge(item.status)}
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono truncate">
                            {item.semanticKey}
                          </p>
                        </div>

                        <div className="text-right flex-shrink-0 space-y-1">
                          <div>{renderPreviewValue(item.preview)}</div>
                          {item.sourceCount > 1 && (
                            <div className="text-[9px] text-slate-400">
                              {item.sourceCount} fontes verificadas
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Ações quando o item está selecionado */}
                      {isSelected && (
                        <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-end gap-2">
                          {knowledgePickerTarget?.targetCell && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBindToTargetCell(item);
                              }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
                            >
                              <span>Vincular à Célula</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddAsColumn(item);
                            }}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
                          >
                            <span>Adicionar como Coluna</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
