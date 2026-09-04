// src/components/editor/picker/ProductKnowledgePickerModal.tsx
// Modal de Seleção de Conhecimento Técnico / PIM para Table Core V2.
// Fail-closed por padrão: NUNCA exibe dados mockados em produção quando o provider está indisponível.
// Discriminated union target, Product scoping, e ações semânticas distintas (Emendas 1, 2, 8, 11, 17).
// Zero explicit any.

import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Database,
  AlertCircle
} from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import {
  ProductKnowledgeProvider,
  ProductKnowledgeSearchResult
} from '../../../domain/table-binding/product-knowledge-provider.types';
import { TableCellLiteralContent } from '../../../domain/table-core/table.types';
import { formatTableCellLiteral } from '../../../domain/table-values';
import { CatalogCellBinding } from '../../../domain/catalog.schema';

interface ProductKnowledgePickerModalProps {
  provider?: ProductKnowledgeProvider;
}

export const ProductKnowledgePickerModal: React.FC<ProductKnowledgePickerModalProps> = ({
  provider: customProvider
}) => {
  const {
    isProductKnowledgePickerModalOpen,
    knowledgePickerTarget,
    closeProductKnowledgePickerModal
  } = useUIStore();

  const {
    setTableCellBinding,
    addTableColumn,
    insertTechnicalDatasetAsTable,
    insertSavedViewAsTable,
    currentCatalog,
    knowledgeProvider: storeProvider
  } = useCatalogStore();

  const provider = customProvider ?? storeProvider;

  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'datum' | 'dataset' | 'saved_view'>('all');
  const [results, setResults] = useState<ProductKnowledgeSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUnavailableState, setIsUnavailableState] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<ProductKnowledgeSearchResult | null>(null);

  const scopedProductId = knowledgePickerTarget?.productId;
  const scopedProductModel = knowledgePickerTarget?.productModel;
  const [scopeToProduct, setScopeToProduct] = useState<boolean>(Boolean(scopedProductId));

  useEffect(() => {
    let isCancelled = false;

    if (provider.isAvailable && !provider.isAvailable()) {
      setIsUnavailableState(true);
      setIsLoading(false);
      setResults([]);
      return;
    }

    setIsUnavailableState(false);
    setSearchError(null);
    setIsLoading(true);

    const targetProductId = scopeToProduct ? scopedProductId : undefined;

    provider
      .search(targetProductId, query)
      .then((items) => {
        if (!isCancelled) {
          const filtered =
            kindFilter === 'all' ? items : items.filter((it) => it.kind === kindFilter);
          setResults(filtered);
          if (filtered.length > 0 && !selectedResult) {
            setSelectedResult(filtered[0]);
          }
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setResults([]);
          const msg = err instanceof Error ? err.message : 'Erro ao consultar conhecimento.';
          if (msg.includes('Indisponível') || msg.includes('unavailable')) {
            setIsUnavailableState(true);
          } else {
            setSearchError(msg);
          }
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [provider, query, kindFilter, scopeToProduct, scopedProductId, selectedResult]);

  if (!isProductKnowledgePickerModalOpen) return null;

  const renderPreviewValue = (preview: string | TableCellLiteralContent) => {
    if (typeof preview === 'string') {
      return (
        <span className="font-mono font-medium text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
          {preview}
        </span>
      );
    }
    return (
      <span className="font-mono font-medium text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
        {formatTableCellLiteral(preview)}
      </span>
    );
  };

  const handleBindToTargetCell = (item: ProductKnowledgeSearchResult) => {
    if (!knowledgePickerTarget || knowledgePickerTarget.kind !== 'cell') return;
    const { blockId, legacyRowId, legacyColKey } = knowledgePickerTarget;

    const previewSnapshot: TableCellLiteralContent | undefined =
      item.preview !== undefined && item.preview !== null
        ? (typeof item.preview === 'object' && 'kind' in item.preview
            ? (item.preview as TableCellLiteralContent)
            : { kind: 'text', text: String(item.preview) })
        : undefined;

    const binding: CatalogCellBinding = {
      sourceKind: 'pim_datum',
      productId: item.productId,
      semanticKey: item.semanticKey,
      datasetId: item.datasetId,
      bindingMode: 'live',
      sourceRevision: item.sourceRevision,
      sourceOwnerKind: item.sourceOwnerKind,
      sourceOwnerId: item.sourceOwnerId,
      snapshot: previewSnapshot
    };

    setTableCellBinding(blockId, legacyRowId, legacyColKey, binding, 'REPLACE_WITH_SOURCE');
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

    if (knowledgePickerTarget.kind === 'cell') {
      const previewSnapshot: TableCellLiteralContent | undefined =
        item.preview !== undefined && item.preview !== null
          ? (typeof item.preview === 'object' && 'kind' in item.preview
              ? (item.preview as TableCellLiteralContent)
              : { kind: 'text', text: String(item.preview) })
          : undefined;

      const binding: CatalogCellBinding = {
        sourceKind: 'pim_datum',
        productId: item.productId,
        semanticKey: item.semanticKey,
        datasetId: item.datasetId,
        bindingMode: 'live',
        sourceRevision: item.sourceRevision,
        sourceOwnerKind: item.sourceOwnerKind,
        sourceOwnerId: item.sourceOwnerId,
        snapshot: previewSnapshot
      };

      setTableCellBinding(blockId, knowledgePickerTarget.legacyRowId, item.semanticKey, binding, 'REPLACE_WITH_SOURCE');
    }

    closeProductKnowledgePickerModal();
  };

  const handleInsertDatasetAsTable = async (item: ProductKnowledgeSearchResult) => {
    if (!knowledgePickerTarget || !item.datasetId) return;

    setIsLoading(true);
    try {
      const datasetProj = await provider.getDataset(item.productId, item.datasetId);
      if (datasetProj && currentCatalog) {
        const activePage = currentCatalog.pages.find((p) =>
          p.blocks?.some((b) => b.id === knowledgePickerTarget.blockId)
        ) || currentCatalog.pages[0];

        if (activePage) {
          insertTechnicalDatasetAsTable(activePage.id, datasetProj, {
            title: item.label || datasetProj.title
          });
          closeProductKnowledgePickerModal();
          return;
        }
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsertSavedViewAsTable = async (item: ProductKnowledgeSearchResult) => {
    if (!knowledgePickerTarget) return;

    setIsLoading(true);
    try {
      const viewId = item.savedViewId || item.id;
      const viewProj = await provider.getSavedView(item.productId, viewId);
      if (viewProj && currentCatalog) {
        const activePage = currentCatalog.pages.find((p) =>
          p.blocks?.some((b) => b.id === knowledgePickerTarget.blockId)
        ) || currentCatalog.pages[0];

        if (activePage) {
          insertSavedViewAsTable(activePage.id, viewProj, {
            title: item.label || viewProj.title
          });
          closeProductKnowledgePickerModal();
          return;
        }
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  };

  const renderStatusBadge = (status?: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Aprovado
          </span>
        );
      case 'conflicting':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Conflito
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Rascunho
          </span>
        );
    }
  };

  const isUnavailable = isUnavailableState || (Boolean(provider.isAvailable) && !provider.isAvailable!());

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100/80 text-blue-700 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Selecionar Conhecimento do Produto (PIM)
              </h2>
              <p className="text-xs text-slate-500">
                {knowledgePickerTarget?.kind === 'cell'
                  ? `Vinculando à célula [Linha: ${knowledgePickerTarget.legacyRowId}, Coluna: ${knowledgePickerTarget.legacyColKey}]`
                  : 'Inserindo tabela ou visão a partir do repositório técnico'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeProductKnowledgePickerModal}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isUnavailable ? (
          <div className="p-8 text-center space-y-3" data-testid="search-unavailable">
            <div className="inline-flex p-3 bg-rose-50 text-rose-600 rounded-full">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Conhecimento técnico indisponível
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              A integração oficial com o catálogo do PIM não está ativa neste ambiente. Nenhum
              dado fictício será apresentado para preservar a integridade das especificações.
            </p>
            <button
              type="button"
              onClick={closeProductKnowledgePickerModal}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-slate-200 space-y-3 bg-white">
              {scopedProductId && (
                <div className="flex items-center justify-between px-3 py-2 bg-blue-50/60 border border-blue-200/80 rounded-lg text-xs">
                  <span className="text-blue-900 font-medium">
                    {scopeToProduct
                      ? `Buscando em: ${scopedProductModel || scopedProductId}`
                      : 'Buscando em: Todos os Produtos'}
                  </span>
                  <button
                    type="button"
                    data-testid="toggle-product-scope"
                    onClick={() => setScopeToProduct(!scopeToProduct)}
                    className="text-blue-700 hover:text-blue-900 font-semibold underline text-[11px]"
                  >
                    {scopeToProduct ? 'Buscar em Todos os Produtos' : `Limitar a ${scopedProductModel || scopedProductId}`}
                  </button>
                </div>
              )}

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por termo..."
                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex gap-2">
                {(['all', 'datum', 'dataset', 'saved_view'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKindFilter(k)}
                    className={`px-3 py-1 rounded text-xs font-medium ${kindFilter === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {k.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {isLoading ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Consultando conhecimento técnico...
                </div>
              ) : isUnavailable ? (
                <div className="py-12 text-center space-y-1" data-testid="search-unavailable">
                  <p className="text-xs font-semibold text-amber-700">Repositório de Conhecimento Indisponível</p>
                  <p className="text-[11px] text-slate-500">A infraestrutura técnica PIM não está acessível no momento.</p>
                </div>
              ) : searchError ? (
                <div className="py-12 text-center space-y-1" data-testid="search-error">
                  <p className="text-xs font-semibold text-red-700">Erro na Consulta de Conhecimento</p>
                  <p className="text-[11px] text-slate-500">{searchError}</p>
                </div>
              ) : results.length === 0 ? (
                <div className="py-12 text-center space-y-1" data-testid="search-empty">
                  <p className="text-xs font-medium text-slate-600">Nenhum dado encontrado.</p>
                </div>
              ) : (
                results.map((item) => {
                  const isSelected = selectedResult?.id === item.id;
                  const isDatum = item.kind === 'datum';
                  const isDataset = item.kind === 'dataset';
                  const isSavedView = item.kind === 'saved_view';

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedResult(item)}
                      className={`p-3 rounded-lg border cursor-pointer ${isSelected ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs">{item.label}</span>
                            {renderStatusBadge(item.status)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">{item.semanticKey}</div>
                        </div>
                        {renderPreviewValue(item.preview)}
                      </div>

                    {isSelected && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200 flex justify-end gap-2">
                        {isDatum && (
                          <>
                            {knowledgePickerTarget?.kind === 'cell' && (
                              <button
                                type="button"
                                data-testid={`picker-bind-cell-${item.semanticKey}`}
                                onClick={(e) => { e.stopPropagation(); handleBindToTargetCell(item); }}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold"
                              >
                                Vincular
                              </button>
                            )}
                            <button
                              type="button"
                              data-testid={`picker-add-col-${item.semanticKey}`}
                              onClick={(e) => { e.stopPropagation(); handleAddAsColumn(item); }}
                              className="px-3 py-1.5 bg-slate-800 text-white rounded text-xs font-semibold"
                            >
                              Coluna
                            </button>
                          </>
                        )}
                        {isDataset && (
                          <button
                            type="button"
                            data-testid={`picker-insert-dataset-${item.datasetId || item.id}`}
                            onClick={(e) => { e.stopPropagation(); handleInsertDatasetAsTable(item); }}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-semibold"
                          >
                            Inserir Dataset
                          </button>
                        )}
                        {isSavedView && (
                          <button
                            type="button"
                            data-testid={`picker-insert-saved-view-${item.savedViewId || item.id}`}
                            onClick={(e) => { e.stopPropagation(); handleInsertSavedViewAsTable(item); }}
                            className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold"
                          >
                            Inserir View
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              }))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
