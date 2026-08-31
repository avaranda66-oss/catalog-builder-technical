'use client'

import { useState } from 'react'
import { ZoomIn, ZoomOut, Printer, SlidersHorizontal, Save } from 'lucide-react'
import { useEditorStore } from '@/features/editor/editor-store'
import { saveWorkspace } from '@/features/editor/save-workspace'
import { openPrintDocument } from '@/lib/pdf/print-document'
import { DynamicCatalogRenderer } from './dynamic-renderer'

export function CatalogDocument() {
  const { catalog, products, selectedProductId, pages, designTokens, contact, isVisualEditMode, setIsVisualEditMode, saveStatus } = useEditorStore()
  const [zoom, setZoom] = useState(0.65)
  const [error, setError] = useState('')
  const selected = products.find(product => product.id === selectedProductId) ?? products[0] ?? null
  const visible = pages.filter(page => page.visible).length
  const save = async () => {
    setError('')
    try { await saveWorkspace() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar.') }
  }
  const print = async () => {
    setError('')
    try { await openPrintDocument({ catalog, products, selectedProductId, pages, designTokens, contact }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao preparar o PDF.') }
  }
  return <div className="flex h-full flex-1 flex-col overflow-hidden bg-gray-200">
    <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-white p-3 text-xs">
      <span className="font-bold">A4 · {visible} página(s) · {catalog?.locale ?? 'pt-BR'}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setIsVisualEditMode(!isVisualEditMode)} className={`flex items-center gap-1 rounded border px-2 py-1 ${isVisualEditMode ? 'bg-blue-800 text-white' : ''}`}><SlidersHorizontal size={14} />{isVisualEditMode ? 'Concluir edição' : 'Editar blocos'}</button>
        <button type="button" disabled={saveStatus === 'saving'} onClick={() => void save()} className="flex items-center gap-1 rounded border px-2 py-1"><Save size={14} />{saveStatus === 'saving' ? 'Salvando…' : 'Salvar'}</button>
        <button type="button" aria-label="Diminuir zoom" onClick={() => setZoom(value => Math.max(.3, value-.05))}><ZoomOut size={15} /></button><span>{Math.round(zoom*100)}%</span><button type="button" aria-label="Aumentar zoom" onClick={() => setZoom(value => Math.min(1.2,value+.05))}><ZoomIn size={15} /></button>
        <button type="button" onClick={print} className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1 text-white"><Printer size={14} />Preparar PDF</button>
      </div>
    </header>
    {error && <p role="alert" className="no-print shrink-0 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
    {isVisualEditMode && <p className="no-print bg-blue-50 px-3 py-2 text-[11px] text-blue-900">Edite os valores nos blocos e use a paleta para estilos. Cada bloco informa a origem dos dados no formulário.</p>}
    <div className="flex-1 overflow-auto p-5">
      <div className="mx-auto" style={{ width: `${210 * 96/25.4 * zoom}px`, height: `${Math.max(1, visible) * (297*96/25.4 + 24) * zoom}px` }}>
        <div style={{ width: '210mm', transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
          <DynamicCatalogRenderer pages={pages} product={selected} allProducts={products} tokens={designTokens} contact={contact} locale={catalog?.locale} />
        </div>
      </div>
    </div>
  </div>
}
