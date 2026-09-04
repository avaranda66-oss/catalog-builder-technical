// src/components/library/product-workspace/CrossProductTransferModal.tsx
// Modal para Copiar Estrutura e Clonar Tabela entre Produtos (PIM.PRODUCTION.CORE1.1 - Itens 8 e 9).

import React, { useState } from 'react';
import { Copy, GitBranch, Check, X, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import {
  TechnicalDataset,
  ProductWorkbookV2,
  copyDatasetStructure,
  cloneDataset,
  createWorkbook,
  ensureWorkbookV2,
  addModule
} from '../../../domain/product-workbook';
import { Product } from '../../../domain/product.schema';
import { ProductWorkbookRepository, WorkbookConflictError } from '../../../services/product-workbook/persistence.types';

interface CrossProductTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceDataset: TechnicalDataset;
  sourceWorkbook: ProductWorkbookV2;
  currentProduct: Product;
  availableProducts?: readonly Product[];
  repository?: ProductWorkbookRepository;
  mode: 'copy' | 'clone';
}

export const CrossProductTransferModal: React.FC<CrossProductTransferModalProps> = ({
  isOpen,
  onClose,
  sourceDataset,
  sourceWorkbook,
  currentProduct,
  availableProducts = [],
  repository,
  mode
}) => {
  const otherProducts = availableProducts.filter((p) => p.id !== currentProduct.id);

  const [selectedProductId, setSelectedProductId] = useState<string>(
    otherProducts.length > 0 ? otherProducts[0].id : ''
  );
  const [newLabel, setNewLabel] = useState<string>(
    mode === 'copy' ? `${sourceDataset.label} (Estrutura)` : `${sourceDataset.label} (Cópia)`
  );
  const [newSemanticKey, setNewSemanticKey] = useState<string>(
    mode === 'copy' ? `${sourceDataset.semanticKey}.struct` : `${sourceDataset.semanticKey}.cloned`
  );
  const [preserveEvidence, setPreserveEvidence] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedProductId) {
      setErrorMsg('Selecione um produto de destino.');
      return;
    }

    if (!repository) {
      setErrorMsg('Repositório de workbooks não disponível neste contexto.');
      return;
    }

    const targetProduct = otherProducts.find((p) => p.id === selectedProductId);
    if (!targetProduct) {
      setErrorMsg('Produto de destino selecionado não encontrado.');
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Carrega workbook do produto alvo
      const rawTargetWb = await repository.getWorkbook({ kind: 'product', id: targetProduct.id });
      let targetWb: ProductWorkbookV2;

      if (rawTargetWb) {
        targetWb = ensureWorkbookV2(rawTargetWb);
      } else {
        // Inicializa workbook limpo para o produto destino
        const emptyBase = createWorkbook({
          owner: { kind: 'product', id: targetProduct.id },
          revision: 0
        });
        targetWb = ensureWorkbookV2(emptyBase);
      }

      // 2. Garante que o target workbook tenha ao menos um módulo de destino compatível
      let targetModuleId: string;
      if (targetWb.modules.length > 0) {
        // Tenta encontrar um módulo com semanticKey equivalente à do sourceDataset
        const sourceModule = sourceWorkbook.modules.find((m) => m.id === sourceDataset.moduleId);
        const match = sourceModule
          ? targetWb.modules.find((m) => m.semanticKey === sourceModule.semanticKey)
          : undefined;
        targetModuleId = match ? match.id : targetWb.modules[0].id;
      } else {
        // Cria módulo compatível no target workbook
        const sourceModule = sourceWorkbook.modules.find((m) => m.id === sourceDataset.moduleId);
        const newModId = `mod_auto_${Date.now()}`;
        targetWb = addModule(targetWb, {
          id: newModId,
          semanticKey: sourceModule ? sourceModule.semanticKey : 'general.specs',
          label: sourceModule ? sourceModule.label : 'Especificações Técnicas',
          kind: sourceModule ? sourceModule.kind : 'matrix',
          order: 0
        }) as ProductWorkbookV2;
        targetModuleId = newModId;
      }

      // 3. Executa a operação de domínio pura (Copy ou Clone)
      let updatedTargetWb: ProductWorkbookV2;

      if (mode === 'copy') {
        const result = copyDatasetStructure({
          sourceDataset,
          targetWorkbook: targetWb,
          targetModuleId,
          options: {
            newSemanticKey: newSemanticKey.trim() || undefined,
            newLabel: newLabel.trim() || undefined
          }
        });
        updatedTargetWb = result.updatedWorkbook;
      } else {
        const result = cloneDataset({
          sourceDataset,
          sourceWorkbook,
          targetWorkbook: targetWb,
          targetModuleId,
          options: {
            newSemanticKey: newSemanticKey.trim() || undefined,
            newLabel: newLabel.trim() || undefined,
            preserveEvidence
          }
        });
        updatedTargetWb = result.updatedWorkbook;
      }

      // 4. Salva o workbook no produto alvo via CAS
      const saveResult = await repository.saveWorkbook({
        workbook: updatedTargetWb,
        expectedRevision: targetWb.revision,
        actorRef: 'ui_cross_product_transfer'
      });

      if (!saveResult.success) {
        throw new Error('Falha ao salvar produto de destino.');
      }

      const targetDisplayName = targetProduct.model || targetProduct.code || targetProduct.id;
      setSuccessMsg(
        mode === 'copy'
          ? `Estrutura tabular copiada com sucesso para "${targetDisplayName}" (revisão ${saveResult.revision})! Células prontas vazias.`
          : `Tabela clonada com sucesso para "${targetDisplayName}" com novos TechnicalDatum IDs isolados (revisão ${saveResult.revision})!`
      );
    } catch (err: any) {
      if (err instanceof WorkbookConflictError) {
        setErrorMsg(`Conflito de versão (CAS): O workbook do produto destino foi alterado concorrentemente (esperado: ${err.expectedRevision}, atual: ${err.actualRevision}). Recarregue e tente novamente.`);
      } else {
        setErrorMsg(err.message || 'Erro inesperado durante a transferência.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'copy' ? (
              <Copy className="w-4 h-4 text-[#003366]" />
            ) : (
              <GitBranch className="w-4 h-4 text-emerald-600" />
            )}
            <h3 className="text-xs font-bold text-slate-800">
              {mode === 'copy'
                ? 'Copiar Estrutura para Outro Produto (PIM.REUSE1.1)'
                : 'Clonar Tabela Completa para Outro Produto (PIM.REUSE1.2)'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleExecute} className="p-4 space-y-3.5 text-xs">
          {/* Informação do modo */}
          {mode === 'copy' ? (
            <div className="bg-blue-50 border border-blue-200 rounded p-2.5 text-blue-900 text-[11px] leading-relaxed">
              <strong>Cópia de Estrutura:</strong> Clona todas as colunas, tipagens e linhas da tabela selecionada,
              mas inicializa <strong>todas as células rigorosamente vazias (ZERO valores copiados)</strong>.
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 text-emerald-900 text-[11px] leading-relaxed">
              <strong>Clonagem Independente:</strong> Duplica a tabela e todos os seus dados técnicos para o produto alvo, gerando novos <code>TechnicalDatum</code> IDs únicos. O produto de origem permanece intacto.
            </div>
          )}

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-[11px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-[11px] flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {otherProducts.length === 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-[11px]">
              Nenhum outro produto disponível na biblioteca para replicação tabular.
            </div>
          ) : (
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Selecionar Produto de Destino *
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white focus:border-[#003366] focus:outline-none"
                disabled={isProcessing}
              >
                {otherProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.model || p.code} {p.code && p.model ? `(${p.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Novo Rótulo da Tabela
              </label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs focus:border-[#003366] focus:outline-none"
                disabled={isProcessing}
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Nova Chave Semântica
              </label>
              <input
                type="text"
                value={newSemanticKey}
                onChange={(e) => setNewSemanticKey(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-xs focus:border-[#003366] focus:outline-none"
                disabled={isProcessing}
              />
            </div>
          </div>

          {mode === 'clone' && (
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={preserveEvidence}
                  onChange={(e) => setPreserveEvidence(e.target.checked)}
                  className="mt-0.5"
                  disabled={isProcessing}
                />
                <span>
                  Preservar evidências de documentos fonte (se autorizados no destino)
                </span>
              </label>
              <div className="text-[10px] text-slate-500 pl-5 flex items-start gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Regra de Segurança Item 9:</strong> Decisões canônicas dependentes de evidências não autorizadas no destino serão limpas e o dado voltará a rascunho (zero orphan decision).
                </span>
              </div>
            </div>
          )}

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs font-medium cursor-pointer"
              disabled={isProcessing}
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={isProcessing || otherProducts.length === 0}
              className={`px-3.5 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs ${
                mode === 'copy'
                  ? 'bg-[#003366] hover:bg-[#002244] text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              } disabled:opacity-50`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Transferindo...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {mode === 'copy' ? 'Copiar Estrutura' : 'Clonar Tabela'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
