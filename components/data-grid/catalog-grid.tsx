'use client'

import React, { useState } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import { Plus, Search, Trash2 } from 'lucide-react'

export const CatalogGrid: React.FC = () => {
  const {
    products,
    selectedProductId,
    setSelectedProductId,
    updateProductData,
    updateProductField,
    addProduct,
    deleteProduct,
    catalog,
  } = useEditorStore()

  const [searchTerm, setSearchTerm] = useState('')

  const filteredProducts = products.filter(
    (p) =>
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAddNewRow = () => {
    const nextNum = products.length + 1
    addProduct({
      catalog_id: catalog?.id || 'a0000000-0000-0000-0000-000000000001',
      sku: `NOVO-${nextNum}`,
      name: `Novo Instrumento #${nextNum}`,
      family: 'Custom',
      status: 'draft',
      sort_order: nextNum,
      data: {
        marketing: {
          title: 'Novo Produto',
          overview: 'Descrição do novo instrumento.',
        },
        specs: [],
        electrical: [],
        general: [],
        accessories: [],
      },
    })
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FFFFFF] overflow-hidden select-none">
      {/* Grid Toolbar */}
      <div className="h-10 border-b border-[#D4D4D4] bg-[#FAFAFA] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[#525252]">
            Planilha de Dados Técnicos ({products.length} linhas)
          </span>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 text-[#737373]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por SKU ou nome..."
              className="pl-7 pr-2 py-0.5 text-xs bg-[#FFFFFF] border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none w-56"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddNewRow}
          className="flex items-center gap-1 px-2.5 py-1 bg-[#1A1A2E] hover:bg-[#2D2D44] text-white text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" />
          Inserir Linha
        </button>
      </div>

      {/* Editable Table Matrix */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs text-left">
          <thead>
            <tr className="bg-[#1A1A2E] text-white font-semibold sticky top-0 z-10">
              <th className="p-2.5 border-r border-[#374151] w-12 text-center">#</th>
              <th className="p-2.5 border-r border-[#374151] w-36">SKU / Modelo</th>
              <th className="p-2.5 border-r border-[#374151] w-64">Nome do Instrumento</th>
              <th className="p-2.5 border-r border-[#374151] w-28">Família</th>
              <th className="p-2.5 border-r border-[#374151] w-72">Título Comercial</th>
              <th className="p-2.5 border-r border-[#374151] w-20">Specs</th>
              <th className="p-2.5 border-r border-[#374151] w-24">Status</th>
              <th className="p-2.5 w-12 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E5] font-mono-data">
            {filteredProducts.map((p, idx) => {
              const isSelected = p.id === selectedProductId
              const specsCount = (p.data?.specs as any[])?.length || 0

              return (
                <tr
                  key={p.id}
                  onClick={() => setSelectedProductId(p.id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#EFF6FF]' : idx % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#FAFAFA]'
                  } hover:bg-[#F5F5F5]`}
                >
                  {/* Row index */}
                  <td className="p-2 border-r border-[#E5E5E5] text-center text-[#737373]">
                    {idx + 1}
                  </td>

                  {/* SKU */}
                  <td className="p-1.5 border-r border-[#E5E5E5] font-bold text-[#171717]">
                    <input
                      type="text"
                      value={p.sku}
                      onChange={(e) => updateProductField(p.id, { sku: e.target.value })}
                      className="w-full bg-transparent px-1 py-0.5 border border-transparent focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none"
                    />
                  </td>

                  {/* Name */}
                  <td className="p-1.5 border-r border-[#E5E5E5] font-sans">
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => updateProductField(p.id, { name: e.target.value })}
                      className="w-full bg-transparent px-1 py-0.5 border border-transparent focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none truncate"
                    />
                  </td>

                  {/* Family */}
                  <td className="p-1.5 border-r border-[#E5E5E5] font-sans">
                    <input
                      type="text"
                      value={p.family}
                      onChange={(e) => updateProductField(p.id, { family: e.target.value })}
                      className="w-full bg-transparent px-1 py-0.5 border border-transparent focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none"
                    />
                  </td>

                  {/* Commercial Title */}
                  <td className="p-1.5 border-r border-[#E5E5E5] font-sans">
                    <input
                      type="text"
                      value={p.data.marketing?.title || ''}
                      onChange={(e) =>
                        updateProductData(p.id, 'marketing.title', e.target.value)
                      }
                      className="w-full bg-transparent px-1 py-0.5 border border-transparent focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none truncate"
                    />
                  </td>

                  {/* Specs Count */}
                  <td className="p-1.5 border-r border-[#E5E5E5] text-center">
                    <span className="text-[10px] bg-[#F5F5F5] text-[#525252] px-1.5 py-0.5 border border-[#D4D4D4]">
                      {specsCount} linhas
                    </span>
                  </td>

                  {/* Status */}
                  <td className="p-1.5 border-r border-[#E5E5E5] font-sans">
                    <select
                      value={p.status}
                      onChange={(e) => updateProductField(p.id, { status: e.target.value as any })}
                      className={`w-full px-1.5 py-0.5 text-[11px] font-semibold border border-transparent focus:border-[#2563EB] focus:outline-none ${
                        p.status === 'published'
                          ? 'bg-[#ECFDF5] text-[#059669]'
                          : 'bg-[#F5F5F5] text-[#737373]'
                      }`}
                    >
                      <option value="draft">Rascunho</option>
                      <option value="review">Revisão</option>
                      <option value="approved">Aprovado</option>
                      <option value="published">Publicado</option>
                    </select>
                  </td>

                  {/* Actions */}
                  <td className="p-1.5 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteProduct(p.id)
                      }}
                      className="p-1 text-[#DC2626] hover:bg-[#FEF2F2]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
