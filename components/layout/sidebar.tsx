'use client'

import React, { useState } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import { PageManager } from '../pages/page-manager'
import { PresetManager } from '../presets/preset-manager'
import { Plus, Search, Trash2, Layers, FileText, Palette, X } from 'lucide-react'

type SidebarTab = 'products' | 'pages' | 'themes'

interface SidebarProps {
  isOpenMobile?: boolean
  onCloseMobile?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpenMobile, onCloseMobile }) => {
  const {
    products,
    selectedProductId,
    setSelectedProductId,
    addProduct,
    deleteProduct,
    catalog,
    currentUser,
  } = useEditorStore()

  const [activeTab, setActiveTab] = useState<SidebarTab>('products')
  const [search, setSearch] = useState('')

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.name.toLowerCase().includes(search.toLowerCase())
    return matchesSearch
  })

  const handleAddNew = () => {
    const skuNumber = products.length + 1
    addProduct({
      catalog_id: catalog?.id || 'a0000000-0000-0000-0000-000000000001',
      sku: `NOVO-${skuNumber}`,
      name: `Novo Instrumento #${skuNumber}`,
      family: 'Custom',
      status: 'draft',
      sort_order: skuNumber,
      data: {
        marketing: {
          title: 'Novo Produto',
          overview: 'Descrição do novo instrumento.',
          features: [],
        },
        specs: [],
        electrical: [],
        general: [],
        accessories: [],
      },
    })
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-2xs transition-opacity"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-[#FAFAFA] flex flex-col h-full border-r border-[#D4D4D4] shadow-2xl lg:shadow-none lg:static lg:w-68 lg:z-auto transition-transform duration-200 select-none shrink-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Mobile Header with Close Button */}
        <div className="flex lg:hidden items-center justify-between px-4 h-12 bg-[#1A1A2E] text-white shrink-0">
          <span className="font-bold text-xs uppercase tracking-wider">Menu de Navegação</span>
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1 hover:bg-[#2D2D44] text-white rounded-xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      {/* Tab Switcher */}
      <div className="flex border-b border-[#D4D4D4] bg-[#FFFFFF]">
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[10.5px] font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'products'
              ? 'border-b-2 border-[#2563EB] text-[#2563EB] bg-[#EFF6FF]'
              : 'text-[#525252] hover:text-[#171717] hover:bg-[#F5F5F5]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Produtos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pages')}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[10.5px] font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'pages'
              ? 'border-b-2 border-[#2563EB] text-[#2563EB] bg-[#EFF6FF]'
              : 'text-[#525252] hover:text-[#171717] hover:bg-[#F5F5F5]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Páginas
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('themes')}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[10.5px] font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'themes'
              ? 'border-b-2 border-[#2563EB] text-[#2563EB] bg-[#EFF6FF]'
              : 'text-[#525252] hover:text-[#171717] hover:bg-[#F5F5F5]'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          Temas
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'products' ? (
        <>
          {/* Search Header */}
          <div className="p-3 border-b border-[#E5E5E5] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#525252]">
                Instrumentos ({products.length})
              </span>
              <button
                type="button"
                onClick={handleAddNew}
                className="flex items-center gap-1 px-2 py-0.5 bg-[#1A1A2E] hover:bg-[#2D2D44] text-white text-[11px] font-semibold"
              >
                <Plus className="w-3 h-3" />
                Adicionar
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#737373]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por SKU ou Nome..."
                className="w-full pl-8 pr-2.5 py-1 text-xs bg-[#FFFFFF] border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none placeholder:text-[#A3A3A3]"
              />
            </div>
          </div>

          {/* Products List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#E5E5E5]">
            {filteredProducts.map((p) => {
              const isSelected = p.id === selectedProductId
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProductId(p.id)}
                  className={`p-3 cursor-pointer transition-colors relative group flex items-start justify-between ${
                    isSelected
                      ? 'bg-[#EFF6FF] border-l-4 border-l-[#2563EB]'
                      : 'bg-[#FFFFFF] hover:bg-[#F5F5F5]'
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-mono-data font-bold text-xs text-[#171717]">
                        {p.sku}
                      </span>
                      {p.status === 'published' ? (
                        <span className="text-[10px] bg-[#ECFDF5] text-[#059669] px-1 font-medium border border-[#A7F3D0]">
                          Aprovado
                        </span>
                      ) : (
                        <span className="text-[10px] bg-[#F5F5F5] text-[#737373] px-1 font-medium border border-[#D4D4D4]">
                          Rascunho
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[#525252] truncate font-normal">
                      {p.name}
                    </span>
                    <span className="text-[11px] text-[#737373] font-mono-data mt-1">
                      Família: {p.family}
                    </span>
                  </div>

                  {products.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteProduct(p.id)
                      }}
                      title="Excluir produto"
                      className="opacity-0 group-hover:opacity-100 p-1 text-[#DC2626] hover:bg-[#FEF2F2] transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })}

            {filteredProducts.length === 0 && (
              <div className="p-4 text-center text-xs text-[#737373]">
                Nenhum produto encontrado.
              </div>
            )}
          </div>
        </>
      ) : activeTab === 'pages' ? (
        <PageManager />
      ) : (
        <PresetManager />
      )}

      {/* Footer info with Active User */}
      <div className="p-2.5 bg-[#FAFAFA] border-t border-[#E5E5E5] text-[11px] text-[#737373] flex items-center justify-between">
        {currentUser ? (
          <div className="flex items-center gap-1.5 truncate max-w-[170px]">
            <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" title="Online na nuvem" />
            <span className="font-semibold text-[#0F172A] truncate">{currentUser.name}</span>
            <span className="text-[10px] text-[#64748B] truncate">({currentUser.area})</span>
          </div>
        ) : (
          <span>Catalog Builder</span>
        )}
        <span className="font-mono-data text-[10px] text-[#94A3B8]">Cloud Sync</span>
      </div>
    </aside>
    </>
  )
}
