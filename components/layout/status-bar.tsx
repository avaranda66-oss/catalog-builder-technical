'use client'

import React, { useState, useEffect } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import { CheckCircle, AlertTriangle, Clock, Database, ShieldCheck } from 'lucide-react'

export const StatusBar: React.FC = () => {
  const { saveStatus, lastSavedAt, products, selectedProductId } = useEditorStore()
  const selectedProduct = products.find((p) => p.id === selectedProductId)

  const [formattedTime, setFormattedTime] = useState('--:--:--')

  useEffect(() => {
    if (lastSavedAt) {
      setFormattedTime(
        new Intl.DateTimeFormat('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(lastSavedAt)
      )
    }
  }, [lastSavedAt])

  return (
    <footer className="h-8 border-t border-[#D4D4D4] bg-[#FFFFFF] px-4 flex items-center justify-between text-xs text-[#525252] select-none shrink-0 z-20">
      {/* Left: Product & Validation Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 font-medium text-[#171717]">
          <Database className="w-3.5 h-3.5 text-[#003366]" />
          <span>Ativo:</span>
          <span className="font-mono-data font-bold">
            {selectedProduct ? selectedProduct.sku : 'Nenhum'}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[#059669]">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Metrologia Auditada</span>
        </div>
      </div>

      {/* Right: Autosave status & Clock */}
      <div className="flex items-center gap-4">
        {saveStatus === 'saving' && (
          <div className="flex items-center gap-1.5 text-[#D97706]">
            <span className="w-2 h-2 rounded-full bg-[#D97706] animate-pulse" />
            <span>Gravando alterações...</span>
          </div>
        )}

        {saveStatus === 'unsaved' && (
          <div className="flex items-center gap-1.5 text-[#D97706]">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Alterações pendentes de salvamento</span>
          </div>
        )}

        {saveStatus === 'saved' && (
          <div className="flex items-center gap-1.5 text-[#059669]">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Salvo às {formattedTime}</span>
          </div>
        )}

        <div className="flex items-center gap-1 border-l border-[#E5E5E5] pl-3 text-[#737373] font-mono-data">
          <span>v2.0</span>
        </div>
      </div>
    </footer>
  )
}
