'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '../features/editor/editor-store'
import { saveAll, syncFromCloud } from '../lib/supabase/api'
import { Toolbar } from '../components/layout/toolbar'
import { Sidebar } from '../components/layout/sidebar'
import { StatusBar } from '../components/layout/status-bar'
import { ProductForm } from '../components/forms/product-form'
import { CatalogGrid } from '../components/data-grid/catalog-grid'
import { CatalogDocument } from '../components/preview/catalog-document'
import { AiPanel } from '../components/ai/ai-panel'
import { StagedChangesModal } from '../components/ai/staged-changes'
import { ExcelImportModal } from '../components/forms/excel-import-modal'
import { PdfImporterModal } from '../components/ai/pdf-importer-modal'
import { UserGateModal, getStoredUser, clearStoredUser } from '../components/auth/user-gate-modal'
import { AuditLogModal } from '../components/audit/audit-log-modal'
import {
  INITIAL_CATALOG,
  INITIAL_PRODUCTS,
  INITIAL_FIELD_DEFINITIONS,
  DEFAULT_PAGES,
  PRESYS_DESIGN_TOKENS,
  PRESYS_CONTACT,
} from '../lib/data/initial-data'
import {
  Loader2,
  FormInput,
  Eye,
  Layers,
  Sparkles,
  Save,
  FileSpreadsheet,
} from 'lucide-react'

export default function CatalogBuilderApp() {
  const {
    catalog,
    products,
    mode,
    fieldDefinitions,
    pages,
    designTokens,
    contact,
    presets,
    saveStatus,
    setSaveStatus,
    markSaved,
    currentUser,
    setCurrentUser,
    auditLogs,
    setAuditLogs,
    addAuditLog,
    setProducts,
    setPages,
    setDesignTokens,
    setContact,
    setLastCloudSync,
    setLastUpdatedBy,
  } = useEditorStore()

  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false)
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false)
  const [mobileView, setMobileView] = useState<'editor' | 'preview'>('editor')
  const [isHydrated, setIsHydrated] = useState(false)
  const [isSyncingCloud, setIsSyncingCloud] = useState(false)

  // Cloud sync handler (Stable reference with getState to prevent re-render cascades)
  const handleCloudSync = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setIsSyncingCloud(true)
      const store = useEditorStore.getState()
      const cloudData = await syncFromCloud({
        catalog: store.catalog || INITIAL_CATALOG,
        products: store.products.length > 0 ? store.products : INITIAL_PRODUCTS,
        fieldDefinitions: store.fieldDefinitions.length > 0 ? store.fieldDefinitions : INITIAL_FIELD_DEFINITIONS,
        pages: store.pages.length > 0 ? store.pages : DEFAULT_PAGES,
        designTokens: store.designTokens || PRESYS_DESIGN_TOKENS,
        contact: store.contact || PRESYS_CONTACT,
      })

      if (cloudData && cloudData.products && cloudData.products.length > 0) {
        store.setProducts(cloudData.products)
        if (cloudData.pages) store.setPages(cloudData.pages)
        if (cloudData.designTokens) store.setDesignTokens(cloudData.designTokens)
        if (cloudData.contact) store.setContact(cloudData.contact)
        if (cloudData.auditLogs) store.setAuditLogs(cloudData.auditLogs)
        if (cloudData.lastUpdatedBy) store.setLastUpdatedBy(cloudData.lastUpdatedBy)
        store.setLastCloudSync(new Date().toISOString())
      }
    } catch (err) {
      console.warn('[Cloud Sync] Failed to sync:', err)
    } finally {
      if (!isSilent) setIsSyncingCloud(false)
    }
  }, [])

  // Hydration & Initial Load (Run once on mount)
  useEffect(() => {
    setIsHydrated(true)
    const storedUser = getStoredUser()
    if (storedUser) {
      setCurrentUser(storedUser)
      handleCloudSync(true)
    }
  }, [setCurrentUser, handleCloudSync])

  // Periodic Auto-Sync (Every 60s & on focus, ONLY when user is logged in)
  useEffect(() => {
    if (!currentUser) return

    const interval = setInterval(() => {
      handleCloudSync(true)
    }, 60000)

    const onFocus = () => handleCloudSync(true)
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [currentUser, handleCloudSync])

  const handleLogout = useCallback(() => {
    clearStoredUser()
    setCurrentUser(null)
  }, [setCurrentUser])

  const handleManualSave = useCallback(async () => {
    if (!catalog) return
    setSaveStatus('saving')
    try {
      await saveAll(
        {
          catalog,
          products,
          fieldDefinitions,
          pages,
          designTokens,
          contact,
          presets,
          auditLogs,
        },
        currentUser,
        `Salvação de ${products.length} produtos e ${pages.length} páginas`
      )
      addAuditLog(`Salvou catálogo e produtos na nuvem`, 'general', catalog.name)
      setLastCloudSync(new Date().toISOString())
      markSaved()
    } catch (err) {
      console.error('[Save] Failed:', err)
      setSaveStatus('unsaved')
    }
  }, [
    catalog,
    products,
    fieldDefinitions,
    pages,
    designTokens,
    contact,
    presets,
    auditLogs,
    currentUser,
    setSaveStatus,
    markSaved,
    addAuditLog,
    setLastCloudSync,
  ])

  if (!isHydrated) {
    return (
      <div className="flex flex-col h-screen w-screen bg-[#FAFAFA] items-center justify-center gap-4 select-none">
        <Loader2 className="w-8 h-8 text-[#003366] animate-spin" />
        <span className="text-sm text-[#525252] font-medium">
          Carregando catálogo e preferências...
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#FAFAFA] text-[#171717] overflow-hidden">
      {/* 1. Top Precision Toolbar with Mobile Support */}
      <Toolbar
        onOpenAiPanel={() => setIsAiPanelOpen(true)}
        onImportClick={() => setIsImportModalOpen(true)}
        onOpenPdfImport={() => setIsPdfModalOpen(true)}
        onExportPdfClick={() => window.print()}
        onOpenAuditModal={() => setIsAuditModalOpen(true)}
        onSyncCloud={() => handleCloudSync(false)}
        onLogout={handleLogout}
        onToggleSidebarMobile={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
        mobileView={mobileView}
        onChangeMobileView={(v) => setMobileView(v)}
      />

      {/* 2. Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar Navigation (Desktop left pane + Mobile slide-over drawer) */}
        <Sidebar
          isOpenMobile={isSidebarOpenMobile}
          onCloseMobile={() => setIsSidebarOpenMobile(false)}
        />

        {/* Workspace Central Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* DESKTOP VIEW (>= lg): Dual-Pane Side-by-Side */}
          <div className="hidden lg:flex flex-1 overflow-hidden">
            {mode === 'form' ? (
              <div className="flex-1 flex overflow-hidden">
                {/* Left Column: Form Editor (45%) */}
                <div className="w-[45%] border-r border-[#D4D4D4] flex flex-col overflow-hidden bg-[#FFFFFF]">
                  <ProductForm />
                </div>

                {/* Right Column: Live A4 Preview (55%) */}
                <div className="w-[55%] flex flex-col overflow-hidden bg-[#E5E5E5]">
                  <CatalogDocument />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                {/* Left Column: Technical Grid Spreadsheet (55%) */}
                <div className="w-[55%] border-r border-[#D4D4D4] flex flex-col overflow-hidden bg-[#FFFFFF]">
                  <CatalogGrid />
                </div>

                {/* Right Column: Live A4 Preview (45%) */}
                <div className="w-[45%] flex flex-col overflow-hidden bg-[#E5E5E5]">
                  <CatalogDocument />
                </div>
              </div>
            )}
          </div>

          {/* MOBILE VIEW (< lg): Single Full-Width Active Pane */}
          <div className="flex lg:hidden flex-1 overflow-hidden pb-14">
            {mobileView === 'editor' ? (
              <div className="w-full flex flex-col overflow-hidden bg-[#FFFFFF]">
                {mode === 'form' ? <ProductForm /> : <CatalogGrid />}
              </div>
            ) : (
              <div className="w-full flex flex-col overflow-hidden bg-[#E5E5E5]">
                <CatalogDocument />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* 3. Bottom Status Bar (Desktop only) */}
      <div className="hidden lg:block">
        <StatusBar />
      </div>

      {/* 4. Mobile Bottom Sticky Navigation Bar (< lg) */}
      <nav className="flex lg:hidden fixed bottom-0 inset-x-0 h-14 bg-[#FFFFFF] border-t border-[#D4D4D4] z-30 select-none shadow-lg">
        <button
          type="button"
          onClick={() => setMobileView('editor')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
            mobileView === 'editor'
              ? 'text-[#2563EB] font-bold'
              : 'text-[#64748B] hover:text-[#1E293B]'
          }`}
        >
          <FormInput className="w-4 h-4" />
          <span className="text-[10px]">Editor</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileView('preview')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
            mobileView === 'preview'
              ? 'text-[#2563EB] font-bold'
              : 'text-[#64748B] hover:text-[#1E293B]'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span className="text-[10px]">Visualizar A4</span>
        </button>

        <button
          type="button"
          onClick={() => setIsSidebarOpenMobile(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-[#64748B] hover:text-[#1E293B] transition-colors"
        >
          <Layers className="w-4 h-4" />
          <span className="text-[10px]">Menu</span>
        </button>

        <button
          type="button"
          onClick={() => setIsAiPanelOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-[10px] font-semibold">Jarvis</span>
        </button>

        <button
          type="button"
          onClick={handleManualSave}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
            saveStatus === 'unsaved'
              ? 'text-[#059669] font-bold'
              : 'text-[#64748B]'
          }`}
        >
          <Save className="w-4 h-4" />
          <span className="text-[10px]">
            {saveStatus === 'saving' ? '...' : saveStatus === 'unsaved' ? 'Salvar' : 'Salvo'}
          </span>
        </button>
      </nav>

      {/* 5. Drawers & Modals (Responsive on all screen sizes) */}
      <UserGateModal
        currentUser={currentUser}
        onLogin={(user) => {
          setCurrentUser(user)
          handleCloudSync(true)
        }}
      />
      <AuditLogModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        logs={auditLogs}
      />
      <AiPanel
        isOpen={isAiPanelOpen}
        onClose={() => setIsAiPanelOpen(false)}
        onOpenPdfImport={() => {
          setIsAiPanelOpen(false)
          setIsPdfModalOpen(true)
        }}
      />
      <StagedChangesModal />
      <ExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
      <PdfImporterModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
      />
    </div>
  )
}
