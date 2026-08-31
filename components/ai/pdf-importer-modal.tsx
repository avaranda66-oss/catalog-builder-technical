'use client'

import React, { useState, useRef } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import {
  Upload,
  FileText,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  ArrowRight,
  Layers,
  Table,
  BookmarkPlus,
  Palette,
  CheckSquare,
  Square,
} from 'lucide-react'
import { CatalogPage } from '../../lib/types/catalog-builder'

interface PdfImporterModalProps {
  isOpen: boolean
  onClose: () => void
}

export const PdfImporterModal: React.FC<PdfImporterModalProps> = ({ isOpen, onClose }) => {
  const {
    addProduct,
    catalog,
    setPages,
    saveCurrentAsPreset,
    setSelectedProductId,
    setSelectedPageId,
    addAuditLog,
  } = useEditorStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extractedProduct, setExtractedProduct] = useState<any | null>(null)
  const [extractedPages, setExtractedPages] = useState<CatalogPage[] | null>(null)
  const [stepMessage, setStepMessage] = useState('')

  // Cloner Options
  const [applyLayout, setApplyLayout] = useState(true)
  const [saveAsPreset, setSaveAsPreset] = useState(true)
  const [customPresetName, setCustomPresetName] = useState('')

  if (!isOpen) return null

  const handleReset = () => {
    setFile(null)
    setIsProcessing(false)
    setError(null)
    setExtractedProduct(null)
    setExtractedPages(null)
    setStepMessage('')
    setCustomPresetName('')
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  const processFile = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Por favor, selecione um arquivo em formato PDF.')
      return
    }

    setFile(selectedFile)
    setIsProcessing(true)
    setError(null)
    setExtractedProduct(null)
    setExtractedPages(null)
    setStepMessage('Lendo documento PDF e extraindo especificações...')

    try {
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(selectedFile)
      })

      const base64Data = await base64Promise
      setStepMessage('IA analisando seções, tabelas técnicas e faixas metrológicas...')

      const response = await fetch('/api/ai/import-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64Data,
          fileName: selectedFile.name,
          mimeType: 'application/pdf',
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Falha ao processar o arquivo PDF.')
      }

      setStepMessage('Construindo estrutura de páginas e layout predefinido...')
      setExtractedProduct(data.product)
      setExtractedPages(data.pages || null)
      setCustomPresetName(`Layout ${data.product.sku || selectedFile.name.replace(/\.pdf$/i, '')}`)
    } catch (err: any) {
      console.error('[PDF Importer Error]:', err)
      setError(err.message || 'Ocorreu um erro ao processar o PDF.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0])
    }
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0])
    }
  }

  const handleConfirmAdd = () => {
    if (!extractedProduct) return

    const newSku = extractedProduct.sku || `IMPORT-${Date.now().toString().slice(-4)}`
    const productPayload = {
      catalog_id: catalog?.id || 'a0000000-0000-0000-0000-000000000001',
      sku: newSku,
      name: extractedProduct.name || extractedProduct.data?.marketing?.title || newSku,
      family: extractedProduct.family || 'PCON',
      status: 'draft' as const,
      sort_order: 99,
      data: extractedProduct.data || {},
    }

    // 1. Add Product
    addProduct(productPayload)

    // 2. Apply Cloned Layout Pages if selected
    if (applyLayout && extractedPages && extractedPages.length > 0) {
      setPages(extractedPages)
      setSelectedPageId(extractedPages[0]?.id || null)
    }

    // 3. Save as Predefined Preset if selected
    if (saveAsPreset && customPresetName.trim()) {
      saveCurrentAsPreset(
        customPresetName.trim(),
        `Layout predefinido estruturado a partir do catálogo PDF ${file?.name || newSku}.`
      )
    }

    addAuditLog(
      `Importou e clonou catálogo PDF: ${file?.name || newSku}`,
      'pdf_import',
      newSku,
      `Estruturou ${extractedPages?.length || 1} página(s) e especificações metrológicas`
    )

    handleClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#FFFFFF] border border-[#D4D4D4] shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="h-14 bg-[#1A1A2E] text-white px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xs bg-[#2563EB] flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm leading-tight">
                Clonador de Datasheet PDF & Gerador de Layout
              </h2>
              <p className="text-[11px] text-[#A3A3A3]">
                Extrai dados técnicos, replica a estrutura exata e salva como layout predefinido
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 hover:bg-[#2D2D44] text-white rounded-xs transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Dropzone */}
          {!extractedProduct && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                dragOver
                  ? 'border-[#2563EB] bg-[#EFF6FF]'
                  : 'border-[#D4D4D4] bg-[#FAFAFA] hover:border-[#2563EB] hover:bg-[#F8FAFC]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileInput}
              />

              <div className="w-14 h-14 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shadow-xs">
                {isProcessing ? (
                  <Loader2 className="w-7 h-7 animate-spin" />
                ) : (
                  <Upload className="w-7 h-7" />
                )}
              </div>

              <div>
                <p className="font-bold text-sm text-[#171717]">
                  {isProcessing
                    ? 'Processando com Inteligência Artificial...'
                    : 'Arraste o catálogo em PDF aqui ou clique para selecionar'}
                </p>
                <p className="text-xs text-[#737373] mt-1">
                  Suporta catálogos da Fluke, Additel, Isotech e outros fabricantes
                </p>
              </div>

              {stepMessage && (
                <div className="mt-2 text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] px-3 py-1.5 border border-[#BFDBFE] animate-pulse">
                  {stepMessage}
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3.5 bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B] text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Erro ao processar documento</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Preview of Extracted Structure */}
          {extractedProduct && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="p-3 bg-[#F0FDF4] border border-[#86EFAC] text-[#166534] text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 text-[#16A34A]" />
                <span className="font-semibold">
                  Estrutura e dados do PDF identificados com sucesso!
                </span>
              </div>

              {/* Product Card Details */}
              <div className="border border-[#D4D4D4] bg-[#FFFFFF] p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-2.5">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block">
                      Modelo Identificado (SKU)
                    </span>
                    <span className="font-mono-data font-bold text-base text-[#003366]">
                      {extractedProduct.sku}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block">
                      Família
                    </span>
                    <span className="text-xs font-semibold text-[#171717]">
                      {extractedProduct.family || 'PCON'}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block">
                    Título Comercial
                  </span>
                  <p className="text-xs font-bold text-[#171717]">
                    {extractedProduct.data?.marketing?.title || extractedProduct.name}
                  </p>
                  <p className="text-[11px] text-[#525252] mt-0.5">
                    {extractedProduct.data?.marketing?.subtitle || ''}
                  </p>
                </div>

                {/* Badges of extracted items */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E5E5E5] text-xs">
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-2 text-center">
                    <span className="block font-bold text-[#003366] text-sm font-mono-data">
                      {extractedProduct.data?.specs?.length || 0}
                    </span>
                    <span className="text-[10px] text-[#737373]">Especificações</span>
                  </div>
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-2 text-center">
                    <span className="block font-bold text-[#003366] text-sm font-mono-data">
                      {extractedProduct.data?.marketing?.features?.length || 0}
                    </span>
                    <span className="text-[10px] text-[#737373]">Destaques</span>
                  </div>
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-2 text-center">
                    <span className="block font-bold text-[#003366] text-sm font-mono-data">
                      {extractedProduct.data?.electrical?.length || 0}
                    </span>
                    <span className="text-[10px] text-[#737373]">Canais Elétricos</span>
                  </div>
                </div>
              </div>

              {/* Detected Multi-Page Layout Structure */}
              <div className="border border-[#BFDBFE] bg-[#EFF6FF] p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-[#1E40AF]">
                  <Layers className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Estrutura de Páginas Gerada (3 Páginas A4):
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-white p-2.5 border border-[#BFDBFE] rounded-xs shadow-2xs">
                    <span className="font-bold text-[#1E3A8A] block">Página 1: Capa</span>
                    <span className="text-[10px] text-[#475569] block mt-0.5">
                      • Banner Hero & Foto
                      <br />• Destaques e Recursos
                      <br />• Texto de Aplicação
                    </span>
                  </div>
                  <div className="bg-white p-2.5 border border-[#BFDBFE] rounded-xs shadow-2xs">
                    <span className="font-bold text-[#1E3A8A] block">Página 2: Metrologia</span>
                    <span className="text-[10px] text-[#475569] block mt-0.5">
                      • Tabela de Faixas & FS
                      <br />• Estabilidade & Exatidão
                      <br />• Sinais Elétricos (mA/V)
                    </span>
                  </div>
                  <div className="bg-white p-2.5 border border-[#BFDBFE] rounded-xs shadow-2xs">
                    <span className="font-bold text-[#1E3A8A] block">Página 3: Acessórios</span>
                    <span className="text-[10px] text-[#475569] block mt-0.5">
                      • Especificações Gerais
                      <br />• Lista de Acessórios
                      <br />• Matriz de Pedido
                    </span>
                  </div>
                </div>
              </div>

              {/* Layout & Preset Options */}
              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
                <label className="flex items-center gap-2 text-xs font-medium text-[#171717] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyLayout}
                    onChange={(e) => setApplyLayout(e.target.checked)}
                    className="w-4 h-4 text-[#2563EB] rounded-xs"
                  />
                  <span>Aplicar esta estrutura de páginas e seções ao Editor</span>
                </label>

                <div className="space-y-1.5 pt-1 border-t border-[#E2E8F0]">
                  <label className="flex items-center gap-2 text-xs font-medium text-[#171717] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveAsPreset}
                      onChange={(e) => setSaveAsPreset(e.target.checked)}
                      className="w-4 h-4 text-[#2563EB] rounded-xs"
                    />
                    <span className="flex items-center gap-1 font-semibold text-[#003366]">
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      Salvar como Preset Predefinido na Galeria de Temas
                    </span>
                  </label>

                  {saveAsPreset && (
                    <input
                      type="text"
                      value={customPresetName}
                      onChange={(e) => setCustomPresetName(e.target.value)}
                      placeholder="Nome do Preset (ex: Layout Fluke 9140)"
                      className="w-full text-xs p-2 bg-white border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="h-14 border-t border-[#D4D4D4] bg-[#FAFAFA] px-5 flex items-center justify-between shrink-0">
          {extractedProduct ? (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 border border-[#D4D4D4] text-xs font-semibold text-[#525252] hover:bg-[#FFFFFF]"
              >
                Escolher outro PDF
              </button>
              <button
                type="button"
                onClick={handleConfirmAdd}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold shadow-xs transition-colors"
              >
                <span>Clonar Estrutura & Criar no Editor</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <span className="text-xs text-[#737373]">
                Formatos aceitos: PDF técnico (Fluke, Additel, Isotech, etc.)
              </span>
              <button
                type="button"
                onClick={handleClose}
                className="px-3.5 py-1.5 border border-[#D4D4D4] bg-[#FFFFFF] hover:bg-[#F5F5F5] text-xs font-medium text-[#171717]"
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
