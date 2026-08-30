'use client'

import React, { useState } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import { parseExcelFile, ParsedExcelResult } from '../../features/import/excel-parser'
import { Upload, FileSpreadsheet, X, Check, AlertCircle } from 'lucide-react'

interface ExcelImportModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ isOpen, onClose }) => {
  const { catalog, products, setProducts, setSelectedProductId, markSaved } = useEditorStore()
  const [file, setFile] = useState<File | null>(null)
  const [parsedResult, setParsedResult] = useState<ParsedExcelResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  if (!isOpen) return null

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    setFile(selected)
    setIsProcessing(true)

    try {
      const buffer = await selected.arrayBuffer()
      const result = parseExcelFile(
        buffer,
        catalog?.id || 'a0000000-0000-0000-0000-000000000001'
      )
      setParsedResult(result)
    } catch (err: any) {
      alert(`Erro ao ler planilha: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleConfirmImport = () => {
    if (!parsedResult || parsedResult.products.length === 0) return

    const newProds = parsedResult.products.map((p, idx) => ({
      id: `imported-${Date.now()}-${idx}`,
      catalog_id: catalog?.id || 'a0000000-0000-0000-0000-000000000001',
      sku: p.sku || `PCON-IMP-${idx + 1}`,
      name: p.name || `Produto Importado #${idx + 1}`,
      family: p.family || 'PCON',
      status: 'draft' as const,
      sort_order: products.length + idx + 1,
      version: 1,
      updated_by: null,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      data: p.data || {},
    }))

    setProducts([...products, ...newProds])
    setSelectedProductId(newProds[0].id)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#FFFFFF] border-2 border-[#1A1A2E] shadow-2xl w-full max-w-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#1A1A2E] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#2563EB]" />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Importar Planilha Excel Master
            </h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-[#2D2D44]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-[#525252] leading-relaxed">
            Selecione uma planilha do Excel (<code className="font-mono-data bg-[#F5F5F5] px-1">.xlsx</code>)
            ou arquivo <code className="font-mono-data bg-[#F5F5F5] px-1">.csv</code> com as
            especificações dos instrumentos da família PCON.
          </p>

          {/* Upload Dropzone */}
          <label className="border-2 border-dashed border-[#D4D4D4] hover:border-[#003366] bg-[#FAFAFA] hover:bg-[#F0F7FF] p-8 flex flex-col items-center justify-center cursor-pointer transition-colors">
            <Upload className="w-8 h-8 text-[#003366] mb-2" />
            <span className="text-xs font-semibold text-[#171717]">
              {file ? file.name : 'Clique para selecionar o arquivo Excel'}
            </span>
            <span className="text-[11px] text-[#737373] mt-1">
              Suporta planilhas master com abas de produtos e listas de preços
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {/* Processing status or summary */}
          {isProcessing && (
            <div className="text-xs text-[#003366] font-semibold text-center animate-pulse">
              Processando e mapeando colunas do Excel...
            </div>
          )}

          {parsedResult && (
            <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4 text-[#059669]" />
                {parsedResult.products.length} produtos identificados na planilha!
              </div>
              <div className="text-[11px] text-[#047857]">
                Abas encontradas: {parsedResult.sheetNames.join(', ')}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-[#FAFAFA] border-t border-[#D4D4D4] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 border border-[#D4D4D4] bg-[#FFFFFF] hover:bg-[#F5F5F5] text-xs font-semibold text-[#171717]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={!parsedResult || parsedResult.products.length === 0}
            className="px-4 py-1.5 bg-[#1A1A2E] hover:bg-[#2D2D44] disabled:opacity-40 text-white text-xs font-bold"
          >
            Confirmar Importação
          </button>
        </div>
      </div>
    </div>
  )
}
