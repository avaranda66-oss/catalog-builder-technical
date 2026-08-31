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
  Menu,
  Eye,
  FileText,
  Sparkles,
} from 'lucide-react'

interface ToolbarProps {
  onOpenAiPanel: () => void
  onImportClick: () => void
  onOpenPdfImport: () => void
  onExportPdfClick: () => void
  onOpenAuditModal?: () => void
  onSyncCloud?: () => void
  onLogout?: () => void
  onToggleSidebarMobile?: () => void
  mobileView?: 'editor' | 'preview'
  onChangeMobileView?: (view: 'editor' | 'preview') => void
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onOpenAiPanel,
  onImportClick,
  onOpenPdfImport,
  onExportPdfClick,
  onOpenAuditModal,
  onSyncCloud,
  onLogout,
  onToggleSidebarMobile,
  mobileView = 'editor',
  onChangeMobileView,
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
    presets,
    currentUser,
    auditLogs,
    addAuditLog,
    setLastCloudSync,
  } = useEditorStore()

  const handleSave = useCallback(async () => {
    const store = useEditorStore.getState()
    if (!store.catalog) return
    store.setSaveStatus('saving')
    try {
      const skus = store.products.map((p) => p.sku).join(', ')
      const saveAction = `Salvou e sincronizou catálogo na nuvem`
      const saveDetails = `Produtos (${store.products.length}): ${skus} • ${store.pages.length} página(s) A4 • Cor primária: ${store.designTokens.colors.primary}`

      store.addAuditLog(saveAction, 'general', store.catalog.name, saveDetails)

      const updatedStore = useEditorStore.getState()
      await saveAll(
        {
          catalog: updatedStore.catalog,
          products: updatedStore.products,
          fieldDefinitions: updatedStore.fieldDefinitions,
          pages: updatedStore.pages,
          designTokens: updatedStore.designTokens,
          contact: updatedStore.contact,
          presets: updatedStore.presets,
          auditLogs: updatedStore.auditLogs,
        },
        updatedStore.currentUser,
        saveDetails
      )
      store.setLastCloudSync(new Date().toISOString())
      store.markSaved()
    } catch (err) {
      console.error('[Save] Failed:', err)
      store.setSaveStatus('unsaved')
    }
  }, [])

  return (
    <header className="border-b border-[#D4D4D4] bg-[#FFFFFF] flex flex-col select-none shrink-0 z-20">
      {/* Main Bar */}
      <div className="h-14 px-3 sm:px-4 flex items-center justify-between gap-2">
        {/* Left: Mobile Menu Button + Brand Logo & Title */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {/* Hamburger Menu on Mobile */}
          <button
            type="button"
            onClick={onToggleSidebarMobile}
            className="p-1.5 hover:bg-[#F5F5F5] text-[#171717] border border-[#D4D4D4] lg:hidden shrink-0 rounded-xs"
            title="Abrir Menu de Produtos e Temas"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 pr-2 sm:pr-4 border-r border-[#E5E5E5] shrink-0">
            <div className="w-7 h-7 bg-[#003366] flex items-center justify-center text-white font-bold text-xs tracking-wider rounded-xs">
              PCON
            </div>
            <span className="font-semibold text-xs sm:text-sm text-[#171717] tracking-tight hidden xs:inline">
              Catalog Builder
            </span>
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-[#171717] truncate max-w-[120px] sm:max-w-xs">
              {catalog?.name || 'Catálogo PCON'}
            </span>
            <span className="text-[10px] text-[#737373] truncate hidden sm:inline">
              {products.length} produto(s) • v{catalog?.version || 1}.0
            </span>
          </div>
        </div>

        {/* Center: Mode Switcher Tabs (Form vs Grid) */}
        <div className="hidden md:flex items-center bg-[#F5F5F5] p-1 border border-[#D4D4D4]">
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

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Active User Badge & Profile */}
          {currentUser && (
            <div className="hidden xl:flex items-center gap-1.5 px-2 py-1 bg-[#F1F5F9] border border-[#CBD5E1] rounded-xs text-xs text-[#334155]">
              <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" title="Conectado na nuvem" />
              <span className="font-bold text-[#0F172A] truncate max-w-[100px]">{currentUser.name}</span>
              <span className="text-[10px] text-[#64748B] border-l border-[#CBD5E1] pl-1.5 truncate max-w-[90px]">
                {currentUser.area}
              </span>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-[10px] text-[#94A3B8] hover:text-[#EF4444] ml-1 font-semibold"
                  title="Trocar de Usuário / Sair"
                >
                  Sair
                </button>
              )}
            </div>
          )}

          {/* Audit History Modal Button */}
          {onOpenAuditModal && (
            <button
              type="button"
              onClick={onOpenAuditModal}
              className="flex items-center gap-1 px-2 py-1.5 border border-[#CBD5E1] bg-[#FFFFFF] hover:bg-[#F8FAFC] text-xs font-semibold text-[#475569] rounded-xs shadow-2xs"
              title="Ver histórico de edições da equipe"
            >
              <History className="w-3.5 h-3.5 text-[#2563EB]" />
              <span className="hidden sm:inline">Histórico</span>
              {auditLogs.length > 0 && (
                <span className="w-4 h-4 bg-[#2563EB] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {auditLogs.length > 9 ? '9+' : auditLogs.length}
                </span>
              )}
            </button>
          )}

          {/* Cloud Sync Button */}
          {onSyncCloud && (
            <button
              type="button"
              onClick={onSyncCloud}
              className="hidden sm:flex items-center gap-1 px-2 py-1.5 border border-[#CBD5E1] bg-[#FFFFFF] hover:bg-[#F8FAFC] text-xs font-semibold text-[#475569] rounded-xs shadow-2xs"
              title="Sincronizar dados mais recentes da nuvem"
            >
              <Layers className="w-3.5 h-3.5 text-[#059669]" />
              <span className="hidden md:inline">Nuvem</span>
            </button>
          )}

          {/* Undo / Redo (Desktop only) */}
          <div className="hidden lg:flex items-center border border-[#D4D4D4] mr-1">
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
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 border border-[#2563EB] bg-[#EFF6FF] hover:bg-[#DBEAFE] text-xs font-semibold text-[#1E40AF] transition-colors rounded-xs shadow-2xs"
            title="Importar catálogo em PDF e clonar para sua marca com IA"
          >
            <Upload className="w-3.5 h-3.5 text-[#2563EB]" />
            <span className="hidden sm:inline">Importar PDF</span>
          </button>

          {/* Import Excel (Desktop only) */}
          <button
            type="button"
            onClick={onImportClick}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 border border-[#D4D4D4] bg-[#FFFFFF] hover:bg-[#F5F5F5] text-xs font-medium text-[#171717] rounded-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#525252]" />
            <span>Excel</span>
          </button>

          {/* AI Assistant */}
          <button
            type="button"
            onClick={onOpenAiPanel}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 border border-[#1A1A2E] bg-[#FAFAFA] hover:bg-[#F5F5F5] text-xs font-medium text-[#1A1A2E] rounded-xs"
            title="Assistente Técnico com IA e Reconhecimento de Voz"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
            <span className="hidden sm:inline">Jarvis IA</span>
          </button>

          {/* Print / PDF (Desktop only) */}
          <button
            type="button"
            onClick={onExportPdfClick}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 border border-[#D4D4D4] bg-[#FFFFFF] hover:bg-[#F5F5F5] text-xs font-medium text-[#171717] rounded-xs"
            title="Imprimir ou Exportar PDF"
          >
            <Printer className="w-3.5 h-3.5 text-[#525252]" />
            <span className="hidden md:inline">PDF</span>
          </button>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-xs font-semibold text-white transition-colors rounded-xs shadow-2xs ${
              saveStatus === 'unsaved'
                ? 'bg-[#059669] hover:bg-[#047857]'
                : 'bg-[#1A1A2E] hover:bg-[#2D2D44]'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {saveStatus === 'saving'
                ? '...'
                : saveStatus === 'unsaved'
                ? 'Salvar'
                : 'Salvo'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Segmented View Switcher Control */}
      <div className="flex lg:hidden border-t border-[#E5E5E5] bg-[#F8FAFC]">
        <button
          type="button"
          onClick={() => onChangeMobileView && onChangeMobileView('editor')}
          className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
            mobileView === 'editor'
              ? 'border-[#2563EB] text-[#2563EB] bg-[#EFF6FF]'
              : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
          }`}
        >
          <FormInput className="w-3.5 h-3.5" />
          <span>Formulário / Editor</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeMobileView && onChangeMobileView('preview')}
          className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
            mobileView === 'preview'
              ? 'border-[#2563EB] text-[#2563EB] bg-[#EFF6FF]'
              : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Visualizar A4 (Preview)</span>
        </button>
      </div>
    </header>
  )
}
