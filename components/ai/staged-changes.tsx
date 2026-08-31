'use client'

import React from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import { Check, X, AlertTriangle, ShieldCheck } from 'lucide-react'
import { readTextPath } from '../../lib/ai/contracts'

export const StagedChangesModal: React.FC = () => {
  const {
    stagedPatch,
    applyStagedPatch,
    rejectStagedPatch,
    toggleChangeAccepted,
    products,
    lastError,
  } = useEditorStore()

  if (!stagedPatch) return null

  const product = products.find((p) => p.id === stagedPatch.productId)
  const stale = !product || product.version !== stagedPatch.baseVersion || stagedPatch.changes.some((change) => change.accepted === true && readTextPath(product.data, change.path) !== change.oldValue)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">
      <div className="bg-[#FFFFFF] border-2 border-[#1A1A2E] shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden rounded-xs">
        {/* Modal Header */}
        <div className="bg-[#1A1A2E] text-white p-3 sm:p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#059669]" />
            <div>
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider">
                Revisão de proposta de redação
              </h2>
              <span className="text-[10px] sm:text-xs text-[#A3A3A3]">
                Alvo: {product?.sku} — {product?.name} · revisão {stagedPatch.baseVersion}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={rejectStagedPatch}
            className="p-1 hover:bg-[#2D2D44] text-white rounded-xs"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Banner */}
        <div className="p-3 bg-[#FFFBEB] border-b border-[#FDE68A] text-xs text-[#92400E] flex items-start gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Resumo da proposta: </span>
            <span>{stagedPatch.summary}</span>
            <p className="mt-1">Selecione explicitamente os campos revisados. A IA não certifica conformidade técnica.</p>
            {stale && <p role="alert" className="mt-1 font-bold">O produto foi alterado ou removido. Descarte e gere uma nova proposta.</p>}
            {lastError && <p role="alert" className="mt-1 font-bold">{lastError}</p>}
          </div>
        </div>

        {/* Changes Diff Table */}
        <div className="flex-1 overflow-x-auto overflow-y-auto p-2 sm:p-4">
          <table className="min-w-[480px] w-full border-collapse border border-[#D4D4D4] text-xs text-left">
            <thead>
              <tr className="bg-[#FAFAFA] text-[#525252] font-semibold border-b border-[#D4D4D4]">
                <th className="p-2.5 w-10 text-center">Sel</th>
                <th className="p-2.5 w-36 border-r border-[#E5E5E5]">Campo Técnico</th>
                <th className="p-2.5 border-r border-[#E5E5E5] w-1/3">Valor Atual</th>
                <th className="p-2.5 w-1/3">Novo Valor Proposto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5] font-mono-data">
              {stagedPatch.changes.map((change, idx) => {
                const isAccepted = change.accepted === true
                return (
                  <tr
                    key={idx}
                    className={`transition-colors ${
                      isAccepted ? 'bg-[#FFFFFF]' : 'bg-[#FAFAFA] opacity-50'
                    }`}
                  >
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={isAccepted}
                        onChange={() => toggleChangeAccepted(idx)}
                        className="w-4 h-4 text-[#1A1A2E] rounded-none focus:ring-0 cursor-pointer"
                      />
                    </td>
                    <td className="p-2 border-r border-[#E5E5E5] font-sans font-semibold text-[#171717]">
                      {change.fieldLabel || change.path}
                    </td>
                    <td className="p-2 border-r border-[#E5E5E5] text-[#DC2626] bg-[#FEF2F2]">
                      {typeof change.oldValue === 'object'
                        ? JSON.stringify(change.oldValue)
                        : String(change.oldValue ?? '(Vazio)')}
                    </td>
                    <td className="p-2 text-[#059669] bg-[#ECFDF5] font-bold">
                      {typeof change.newValue === 'object'
                        ? JSON.stringify(change.newValue)
                        : String(change.newValue)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Modal Actions */}
        <div className="p-3 bg-[#FAFAFA] border-t border-[#D4D4D4] flex items-center justify-between">
          <span className="text-xs text-[#737373]">
            {stagedPatch.changes.filter((c) => c.accepted === true).length} de{' '}
            {stagedPatch.changes.length} campos selecionados para aplicação.
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={rejectStagedPatch}
              className="px-3 py-1.5 border border-[#D4D4D4] bg-[#FFFFFF] hover:bg-[#F5F5F5] text-xs font-semibold text-[#171717]"
            >
              Descartar Proposta
            </button>
            <button
              type="button"
              onClick={applyStagedPatch}
              disabled={stale || !stagedPatch.changes.some((change) => change.accepted === true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold shadow-xs"
            >
              <Check className="w-4 h-4" />
              Aplicar campos revisados
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
