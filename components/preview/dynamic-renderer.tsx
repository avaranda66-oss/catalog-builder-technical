'use client'

import React, { useState } from 'react'
import { ChevronUp, ChevronDown, Trash2, Palette } from 'lucide-react'
import { useEditorStore } from '@/features/editor/editor-store'
import { moveSectionIndices, productPath, record, sectionDataSource, sectionProduct } from '@/lib/catalog/section-data'
import { CatalogPages, type CatalogPagesProps } from './catalog-pages'
import { BlockInspector } from './block-inspector'

export function DynamicCatalogRenderer(props: CatalogPagesProps) {
  const { isVisualEditMode, reorderSections, removeSection, updateSectionContent, updateProductData } = useEditorStore()
  const [inspected, setInspected] = useState<{ pageId: string; sectionId: string } | null>(null)
  const inspectedSection = props.pages.find(page => page.id === inspected?.pageId)?.sections.find(section => section.id === inspected?.sectionId)
  return <>
    {!props.pages.some(page => page.visible) && <p className="bg-white p-8">Adicione ou mostre uma página para visualizar o documento.</p>}
    <CatalogPages {...props}
      renderControls={isVisualEditMode ? (page, section, visible) => {
        const index = visible.findIndex(item => item.id === section.id)
        const move = (direction: number) => {
          const target = visible[index + direction]
          if (!target) return
          const indices = moveSectionIndices(page.sections, section.id, target.id)
          if (indices) reorderSections(page.id, ...indices)
        }
        return <div className="no-print mb-2 flex items-center justify-end gap-1 border border-dashed border-blue-300 bg-blue-50 px-1 py-1 text-[10px] text-blue-800">
          <button type="button" onClick={() => setInspected({ pageId: page.id, sectionId: section.id })} className="mr-auto flex items-center gap-1"><Palette size={12} />{section.title}</button>
          <button type="button" aria-label="Subir bloco" disabled={index === 0} onClick={() => move(-1)} className="disabled:opacity-25"><ChevronUp size={14} /></button>
          <button type="button" aria-label="Descer bloco" disabled={index === visible.length - 1} onClick={() => move(1)} className="disabled:opacity-25"><ChevronDown size={14} /></button>
          <button type="button" aria-label="Remover bloco" onClick={() => removeSection(page.id, section.id)}><Trash2 size={12} /></button>
        </div>
      } : undefined}
      onContentChange={isVisualEditMode ? (page, section, field, value) => {
        const product = sectionProduct(section, props.product, props.allProducts)
        const path = productPath(section.type, field)
        if (sectionDataSource(section) === 'product') {
          if (product && path) updateProductData(product.id, path, value)
        } else updateSectionContent(page.id, section.id, { ...record(section.content), [field]: value })
      } : undefined}
    />
    {inspected && inspectedSection && <BlockInspector pageId={inspected.pageId} section={inspectedSection} onClose={() => setInspected(null)} />}
  </>
}
