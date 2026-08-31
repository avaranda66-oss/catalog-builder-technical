'use client'

import React, { useCallback } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import { saveAll } from '../../lib/supabase/api'
import {
  Save,
  Undo2,
  Redo2,
  FileSpreadsheet,
  FormInput,
  Printer,
  Upload,
  Bot,
  Layers,
  History,
  Download,
} from 'lucide-react'

interface ToolbarProps {
  onOpenAiPanel: () => void
  onImportClick: () => void
  onOpenPdfImport: () => void
  onExportPdfClick: () => void
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onOpenAiPanel,
  onImportClick,
  onOpenPdfImport,
  onExportPdfClick,
}) => {
  const {
    catalog,
    mode,
    setMode,
    saveStatus,
    setSaveStatus,
    markSaved,
    undo,
    redo,
    canUndo,
    canRedo,
    products,
    fieldDefinitions,
    pages,
    designTokens,
    contact,
  } = useEditorStore()

  const handleSave = useCallback(async () => {
    if (!catalog) return
    setSaveStatus('saving')
    try {
      await saveAll({
        catalog,
        products,
        fieldDefinitions,
        pages,
        designTokens,
        contact,
      })
      markSaved()
    } catch (err) {
      console.error('[Save] Failed:', err)
      setSaveStatus('unsaved')
    }
  }, [catalog, products, fieldDefinitions, pages, designTokens, contact, setSaveStatus, markSaved])

  return (
    <header className="h-14 border-b border-[#D4D4D4] bg-[#FFFFFF] px-4 flex items-center justify-between select-none shrink-0 z-20">
      {/* Brand & Catalog Title */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 pr-4 border-r border-[#E5E5E5]">
          <div className="w-7 h-7 bg-[#003366] flex items-center justify-center text-white font-bold text-xs tracking-wider">
            PCON
          </div>
          <span className="font-semibold text-sm text-[#171717] tracking-tight">
            Catalog Builder
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-semibold text-[#171717] truncate max-w-xs">
            {catalog?.name || 'Catálogo PCON'}
          </span>
          <span className="text-[11px] text-[#737373]">
            {products.length} produtos cadastrados • v{catalog?.version || 1}.0
          </span>
        </div>
      </div>

      {/* Mode Switcher Tabs (Form vs Grid) */}
      <div className="flex items-center bg-[#F5F5F5] p-1 border border-[#D4D4D4]">
        <button
          type="button"
          onClick={() => setMode('form')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors ${
            mode === 'form'
              ? 'bg-[#1A1A2E] text-white shadow-xs'
              : 'text-[#525252] hover:text-[#171717]'
          }`}
        >
          <FormInput className="w-3.5 h-3.5" />
          Formulário Assistido
        </button>
        <button
          type="button"
          onClick={() => setMode('grid')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors ${
            mode === 'grid'
              ? 'bg-[#1A1A2E] text-white shadow-xs'
              : 'text-[#525252] hover:text-[#171717]'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Planilha Técnica
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {/* Undo / Redo */}
        <div className="flex items-center border border-[#D4D4D4] mr-2">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo()}
            title="Desfazer alteração"
            className="p-1.5 hover:bg-[#F5F5F5] disabled:opacity-30 border-r border-[#E5E5E5] text-[#525252]"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo()}
            title="Refazer alteração"
            className="p-1.5 hover:bg-[#F5F5F5] disabled:opacity-30 text-[#525252]"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Import PDF via AI */}
        <button
          type="button"
          onClick={onOpenPdfImport}
          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-[#2563EB] bg-[#EFF6FF] hover:bg-[#DBEAFE] text-xs font-semibold text-[#1E40AF] transition-colors"
          title="Importar catálogo em PDF e clonar para sua marca com IA"
        >
          <Upload className="w-3.5 h-3.5 text-[#2563EB]" />
          Importar PDF
        </button>

        {/* Import Excel */}
        <button
          type="button"
          onClick={onImportClick}
          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-[#D4D4D4] bg-[#FFFFFF] hover:bg-[#F5F5F5] text-xs font-medium text-[#171717]"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-[#525252]" />
          Importar Excel
        </button>

        {/* AI Assistant */}
        <button
          type="button"
          onClick={onOpenAiPanel}
          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-[#1A1A2E] bg-[#FAFAFA] hover:bg-[#F5F5F5] text-xs font-medium text-[#1A1A2E]"
        >
          <Bot className="w-3.5 h-3.5 text-[#003366]" />
          Assistente Técnico
        </button>

        {/* Print / PDF */}
        <button
          type="button"
          onClick={onExportPdfClick}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#D4D4D4] bg-[#FFFFFF] hover:bg-[#F5F5F5] text-xs font-medium text-[#171717]"
        >
          <Printer className="w-3.5 h-3.5 text-[#525252]" />
          Imprimir / PDF
        </button>

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors ${
            saveStatus === 'unsaved'
              ? 'bg-[#059669] hover:bg-[#047857]'
              : 'bg-[#1A1A2E] hover:bg-[#2D2D44]'
          }`}
        >
          <Save className="w-3.5 h-3.5" />
          {saveStatus === 'saving'
            ? 'Salvando...'
            : saveStatus === 'unsaved'
            ? 'Salvar Alterações'
            : 'Salvo'}
        </button>
      </div>
    </header>
  )
}
