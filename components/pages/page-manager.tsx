'use client'

import React, { useState } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import { SECTION_TYPE_CATALOG, SectionType } from '../../lib/types/catalog-builder'
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  GripVertical,
  FileText,
  X,
} from 'lucide-react'

// ============================================================================
// SECTION PICKER MODAL
// ============================================================================

interface SectionPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (type: SectionType) => void
}

const SectionPicker: React.FC<SectionPickerProps> = ({ isOpen, onClose, onSelect }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white w-[480px] max-h-[80vh] border border-[#D4D4D4] shadow-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#D4D4D4] bg-[#FAFAFA]">
          <span className="text-xs font-bold uppercase tracking-wider text-[#171717]">
            Adicionar Bloco de Seção
          </span>
          <button type="button" onClick={onClose} className="p-1 hover:bg-[#E5E5E5] text-[#525252]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section Grid */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2">
          {SECTION_TYPE_CATALOG.map((info) => (
            <button
              key={info.type}
              type="button"
              onClick={() => {
                onSelect(info.type)
                onClose()
              }}
              className="flex items-start gap-3 p-3 border border-[#E5E5E5] bg-white hover:bg-[#F5F5F5] hover:border-[#2563EB] text-left transition-colors"
            >
              <div className="w-8 h-8 bg-[#1A1A2E] text-white flex items-center justify-center text-xs font-bold shrink-0">
                {info.label.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-[#171717] truncate">{info.label}</span>
                <span className="block text-[10px] text-[#737373] mt-0.5 leading-tight">{info.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// PAGE MANAGER — controls pages and their sections
// ============================================================================

export const PageManager: React.FC = () => {
  const {
    pages,
    selectedPageId,
    setSelectedPageId,
    addPage,
    removePage,
    reorderPages,
    updatePage,
    addSection,
    removeSection,
    reorderSections,
    updateSection,
  } = useEditorStore()

  const [pickerPageId, setPickerPageId] = useState<string | null>(null)
  const [expandedPageId, setExpandedPageId] = useState<string | null>(selectedPageId)

  const handleAddPage = () => {
    addPage()
  }

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[#E5E5E5] flex items-center justify-between bg-[#FAFAFA]">
        <span className="text-xs font-bold uppercase tracking-wider text-[#525252]">
          Páginas ({pages.length})
        </span>
        <button
          type="button"
          onClick={handleAddPage}
          className="flex items-center gap-1 px-2 py-0.5 bg-[#1A1A2E] hover:bg-[#2D2D44] text-white text-[11px] font-semibold"
        >
          <Plus className="w-3 h-3" />
          Página
        </button>
      </div>

      {/* Pages List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#E5E5E5]">
        {pages.map((page, pageIndex) => {
          const isExpanded = expandedPageId === page.id
          const isSelected = selectedPageId === page.id

          return (
            <div key={page.id} className="bg-white">
              {/* Page Row */}
              <div
                className={`flex items-center gap-1 px-2 py-2 cursor-pointer transition-colors group ${
                  isSelected ? 'bg-[#EFF6FF] border-l-4 border-l-[#2563EB]' : 'hover:bg-[#F5F5F5]'
                }`}
                onClick={() => {
                  setSelectedPageId(page.id)
                  setExpandedPageId(isExpanded ? null : page.id)
                }}
              >
                <GripVertical className="w-3 h-3 text-[#A3A3A3] shrink-0 cursor-grab" />

                <FileText className="w-3.5 h-3.5 text-[#525252] shrink-0" />

                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={page.title}
                    onChange={(e) => {
                      e.stopPropagation()
                      updatePage(page.id, { title: e.target.value })
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full text-xs font-semibold text-[#171717] bg-transparent border-b border-transparent hover:border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none px-0.5 py-0 truncate"
                  />
                  <span className="text-[10px] text-[#A3A3A3] font-mono-data">
                    {page.sections.length} seção(ões)
                  </span>
                </div>

                {/* Page Controls */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    title={page.visible ? 'Ocultar' : 'Mostrar'}
                    onClick={(e) => {
                      e.stopPropagation()
                      updatePage(page.id, { visible: !page.visible })
                    }}
                    className="p-0.5 text-[#737373] hover:text-[#171717]"
                  >
                    {page.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                  {pageIndex > 0 && (
                    <button
                      type="button"
                      title="Mover para cima"
                      onClick={(e) => {
                        e.stopPropagation()
                        reorderPages(pageIndex, pageIndex - 1)
                      }}
                      className="p-0.5 text-[#737373] hover:text-[#171717]"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                  )}
                  {pageIndex < pages.length - 1 && (
                    <button
                      type="button"
                      title="Mover para baixo"
                      onClick={(e) => {
                        e.stopPropagation()
                        reorderPages(pageIndex, pageIndex + 1)
                      }}
                      className="p-0.5 text-[#737373] hover:text-[#171717]"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  )}
                  {pages.length > 1 && (
                    <button
                      type="button"
                      title="Excluir página"
                      onClick={(e) => {
                        e.stopPropagation()
                        removePage(page.id)
                      }}
                      className="p-0.5 text-[#DC2626] hover:bg-[#FEF2F2] rounded-xs"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Sections (expanded) */}
              {isExpanded && (
                <div className="pl-6 pr-2 pb-2 bg-[#FAFAFA] border-t border-[#E5E5E5]">
                  {page.sections
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((section, secIndex) => (
                      <div
                        key={section.id}
                        className="flex items-center gap-1.5 py-1 text-[11px] text-[#525252] group/sec"
                      >
                        <GripVertical className="w-2.5 h-2.5 text-[#A3A3A3] cursor-grab shrink-0" />
                        <span className="w-5 h-5 bg-[#E5E5E5] text-[#737373] flex items-center justify-center text-[9px] font-bold shrink-0">
                          {section.title.charAt(0)}
                        </span>
                        <span className="flex-1 truncate">{section.title}</span>

                        <div className="flex items-center gap-0.5 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                          <button
                            type="button"
                            title={section.visible ? 'Ocultar seção' : 'Mostrar seção'}
                            onClick={() =>
                              updateSection(page.id, section.id, { visible: !section.visible })
                            }
                            className="p-0.5 text-[#737373] hover:text-[#171717]"
                          >
                            {section.visible ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                          </button>
                          {secIndex > 0 && (
                            <button
                              type="button"
                              title="Subir"
                              onClick={() => reorderSections(page.id, secIndex, secIndex - 1)}
                              className="p-0.5 text-[#737373] hover:text-[#171717]"
                            >
                              <ChevronUp className="w-2.5 h-2.5" />
                            </button>
                          )}
                          {secIndex < page.sections.length - 1 && (
                            <button
                              type="button"
                              title="Descer"
                              onClick={() => reorderSections(page.id, secIndex, secIndex + 1)}
                              className="p-0.5 text-[#737373] hover:text-[#171717]"
                            >
                              <ChevronDown className="w-2.5 h-2.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Remover seção"
                            onClick={() => removeSection(page.id, section.id)}
                            className="p-0.5 text-[#DC2626] hover:bg-[#FEF2F2]"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                  {/* Add Section Button */}
                  <button
                    type="button"
                    onClick={() => setPickerPageId(page.id)}
                    className="flex items-center gap-1 mt-1 px-2 py-1 text-[11px] text-[#2563EB] font-semibold hover:bg-[#EFF6FF] w-full"
                  >
                    <Plus className="w-3 h-3" />
                    Adicionar Seção
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Section Picker Modal */}
      <SectionPicker
        isOpen={!!pickerPageId}
        onClose={() => setPickerPageId(null)}
        onSelect={(type) => {
          if (pickerPageId) {
            addSection(pickerPageId, type)
          }
        }}
      />
    </div>
  )
}
