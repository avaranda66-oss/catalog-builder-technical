'use client'

import React, { useState, useRef } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import { DynamicCatalogRenderer } from './dynamic-renderer'
import {
  ZoomIn,
  ZoomOut,
  Printer,
  SlidersHorizontal,
  Save,
  Check,
  Eye,
  Type,
} from 'lucide-react'

export const CatalogDocument: React.FC = () => {
  const {
    products,
    selectedProductId,
    pages,
    designTokens,
    setDesignTokens,
    contact,
    isVisualEditMode,
    setIsVisualEditMode,
    markSaved,
    saveStatus,
  } = useEditorStore()

  const [zoom, setZoom] = useState<number>(0.65)
  const [savedBadge, setSavedBadge] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const product = products.find((p) => p.id === selectedProductId) || products[0] || null

  const handlePrint = () => {
    window.print()
  }

  const handleManualSave = () => {
    markSaved()
    setSavedBadge(true)
    setTimeout(() => setSavedBadge(false), 2000)
  }

  const visiblePages = pages.filter((p) => p.visible)

  return (
    <div className="flex-1 flex flex-col h-full bg-[#E5E5E5] overflow-hidden select-none">
      {/* 1. Preview Control Bar */}
      <div className="h-11 border-b border-[#D4D4D4] bg-[#FFFFFF] px-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[#525252]">
            Visualização Editorial A4
          </span>
          <span className="text-[11px] bg-[#EFF6FF] text-[#2563EB] px-1.5 py-0.5 border border-[#BFDBFE] font-mono-data font-semibold">
            210 × 297 mm
          </span>
          <span className="text-[11px] bg-[#F5F5F5] text-[#525252] px-1.5 py-0.5 border border-[#D4D4D4] font-mono-data">
            {visiblePages.length} pág(s)
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Visual Edit Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsVisualEditMode(!isVisualEditMode)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold border transition-all ${
              isVisualEditMode
                ? 'bg-[#2563EB] text-white border-[#1D4ED8] shadow-xs'
                : 'bg-[#FAFAFA] text-[#171717] border-[#D4D4D4] hover:bg-[#F0F0F0]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {isVisualEditMode ? 'Sair do Modo Edição' : 'Modo Edição Visual'}
          </button>

          {/* Manual Save Button */}
          <button
            type="button"
            onClick={handleManualSave}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold border transition-colors ${
              savedBadge
                ? 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]'
                : 'bg-[#059669] hover:bg-[#047857] text-white border-[#059669]'
            }`}
          >
            {savedBadge ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Salvo!
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Salvar
              </>
            )}
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center border border-[#D4D4D4] bg-[#FAFAFA]">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.1).toFixed(2))))}
              title="Reduzir zoom"
              className="p-1 hover:bg-[#E5E5E5] text-[#525252]"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-mono-data font-semibold text-[#171717]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.2, Number((z + 0.1).toFixed(2))))}
              title="Aumentar zoom"
              className="p-1 hover:bg-[#E5E5E5] text-[#525252]"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Print / PDF button */}
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#1A1A2E] hover:bg-[#2D2D44] text-white text-xs font-semibold"
          >
            <Printer className="w-3.5 h-3.5" />
            PDF / Imprimir
          </button>
        </div>
      </div>

      {/* 2. Visual Edit Banner (shown when active) */}
      {isVisualEditMode && (
        <div className="bg-[#EFF6FF] border-b border-[#BFDBFE] px-4 py-1.5 flex items-center justify-between text-xs text-[#1E40AF]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
            <span className="font-semibold">Modo de Edição Visual Ativo:</span>
            <span className="text-[11px] text-[#3B82F6]">
              Use as alças de cada bloco para mover (↑/↓), excluir ou adicionar seções. Clique em Salvar para fixar as mudanças.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleManualSave}
              className="flex items-center gap-1 bg-[#2563EB] text-white text-[11px] font-bold px-2.5 py-0.5 hover:bg-[#1D4ED8]"
            >
              <Save className="w-3 h-3" />
              Salvar Alterações
            </button>
          </div>
        </div>
      )}

      {/* 3. Scaled Preview Sheet Viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-8 flex justify-center items-start bg-[#E5E5E5]"
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            marginBottom: `${(1 - zoom) * -150}px`,
          }}
          className="transition-transform duration-100 ease-out"
        >
          <DynamicCatalogRenderer
            pages={pages}
            product={product}
            allProducts={products}
            tokens={designTokens}
            contact={contact}
          />
        </div>
      </div>
    </div>
  )
}
