'use client'

import React, { useState, useEffect } from 'react'
import { useEditorStore } from '../features/editor/editor-store'
import { INITIAL_CATALOG, INITIAL_FIELD_DEFINITIONS, INITIAL_PRODUCTS, DEFAULT_PAGES, PRESYS_DESIGN_TOKENS, PRESYS_CONTACT } from '../lib/data/initial-data'
import { loadAll, saveToLocalStorage } from '../lib/supabase/api'
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
import { Loader2 } from 'lucide-react'

export default function CatalogBuilderApp() {
  const {
    catalog,
    products,
    mode,
    setCatalog,
    setProducts,
    setFieldDefinitions,
    setPages,
    setDesignTokens,
    setContact,
  } = useEditorStore()

  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadSource, setLoadSource] = useState<string>('')

  // Initialize: Supabase → localStorage → initial seed data
  useEffect(() => {
    if (catalog) {
      setIsLoading(false)
      return
    }

    let cancelled = false

    async function init() {
      try {
        const result = await loadAll({
          catalog: INITIAL_CATALOG,
          products: INITIAL_PRODUCTS,
          fieldDefinitions: INITIAL_FIELD_DEFINITIONS,
          pages: DEFAULT_PAGES,
          designTokens: PRESYS_DESIGN_TOKENS,
          contact: PRESYS_CONTACT,
        })

        if (cancelled) return

        setCatalog(result.catalog!)
        setProducts(result.products)
        setFieldDefinitions(result.fieldDefinitions)
        
        if (result.pages && result.pages.length > 0) {
          setPages(result.pages)
        }
        if (result.designTokens) {
          setDesignTokens(result.designTokens)
        }
        if (result.contact) {
          setContact(result.contact)
        }
        
        setLoadSource(result.source)
        console.log(`[Init] Data loaded from: ${result.source}`)
      } catch (err) {
        console.error('[Init] Failed to load data, using defaults:', err)
        setCatalog(INITIAL_CATALOG)
        setProducts(INITIAL_PRODUCTS)
        setFieldDefinitions(INITIAL_FIELD_DEFINITIONS)
        setLoadSource('initial')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [catalog, setCatalog, setProducts, setFieldDefinitions, setPages, setDesignTokens, setContact])

  // Autosave: debounce 3s after any product change
  useEffect(() => {
    if (!catalog || isLoading) return

    const timer = setTimeout(() => {
      const state = useEditorStore.getState()
      saveToLocalStorage({
        catalog: state.catalog,
        products: state.products,
        fieldDefinitions: state.fieldDefinitions,
        pages: state.pages,
        designTokens: state.designTokens,
        contact: state.contact,
      })
    }, 3000)

    return () => clearTimeout(timer)
  }, [catalog, products, isLoading])

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen w-screen bg-[#FAFAFA] items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-[#003366] animate-spin" />
        <span className="text-sm text-[#525252] font-medium">Carregando catálogo...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#FAFAFA] text-[#171717] overflow-hidden">
      {/* 1. Top Precision Toolbar */}
      <Toolbar
        onOpenAiPanel={() => setIsAiPanelOpen(true)}
        onImportClick={() => setIsImportModalOpen(true)}
        onOpenPdfImport={() => setIsPdfModalOpen(true)}
        onExportPdfClick={() => window.print()}
      />

      {/* 2. Main Workspace (Sidebar + Dual Editor/Preview) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Workspace Central Area */}
        <main className="flex-1 flex overflow-hidden">
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
        </main>
      </div>

      {/* 3. Bottom Status Bar */}
      <StatusBar />

      {/* 4. Drawers & Modals */}
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
