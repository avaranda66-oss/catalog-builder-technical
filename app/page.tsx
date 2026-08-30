'use client'

import React, { useState, useEffect } from 'react'
import { useEditorStore } from '../features/editor/editor-store'
import { INITIAL_CATALOG, INITIAL_FIELD_DEFINITIONS, INITIAL_PRODUCTS } from '../lib/data/initial-data'
import { Toolbar } from '../components/layout/toolbar'
import { Sidebar } from '../components/layout/sidebar'
import { StatusBar } from '../components/layout/status-bar'
import { ProductForm } from '../components/forms/product-form'
import { CatalogGrid } from '../components/data-grid/catalog-grid'
import { CatalogDocument } from '../components/preview/catalog-document'
import { AiPanel } from '../components/ai/ai-panel'
import { StagedChangesModal } from '../components/ai/staged-changes'
import { ExcelImportModal } from '../components/forms/excel-import-modal'

export default function CatalogBuilderApp() {
  const {
    catalog,
    products,
    mode,
    setCatalog,
    setProducts,
    setFieldDefinitions,
  } = useEditorStore()

  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  // Initialize store with default seed products & catalog
  useEffect(() => {
    if (!catalog) {
      setCatalog(INITIAL_CATALOG)
      setProducts(INITIAL_PRODUCTS)
      setFieldDefinitions(INITIAL_FIELD_DEFINITIONS)
    }
  }, [catalog, setCatalog, setProducts, setFieldDefinitions])

  return (
    <div className="flex flex-col h-screen w-screen bg-[#FAFAFA] text-[#171717] overflow-hidden">
      {/* 1. Top Precision Toolbar */}
      <Toolbar
        onOpenAiPanel={() => setIsAiPanelOpen(true)}
        onImportClick={() => setIsImportModalOpen(true)}
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
      <AiPanel isOpen={isAiPanelOpen} onClose={() => setIsAiPanelOpen(false)} />
      <StagedChangesModal />
      <ExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  )
}
