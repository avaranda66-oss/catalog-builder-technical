'use client'

import React, { useState } from 'react'
import { useEditorStore } from '@/features/editor/editor-store'
import { Product } from '@/lib/types/database'
import { CatalogPage } from '@/lib/types/catalog-builder'
import {
  Globe,
  X,
  Sparkles,
  Check,
  Loader2,
  Languages,
  ArrowRight,
  ShieldCheck,
  FileText,
} from 'lucide-react'

interface TranslationModalProps {
  isOpen: boolean
  onClose: () => void
}

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English (US)', flag: '🇺🇸', desc: 'Padrão Internacional Técnico / Datasheet' },
  { code: 'pt', name: 'Português (Brasil)', flag: '🇧🇷', desc: 'Catálogos e Manuais Nacionais Presys' },
  { code: 'es', name: 'Español', flag: '🇪🇸', desc: 'Mercado Latino-Americano e Espanha' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', desc: 'Mercados Europeus e Francófonos' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', desc: 'Indústria Alemã e Centro-Europeia' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹', desc: 'Normas Industriais Italianas' },
]

export const TranslationModal: React.FC<TranslationModalProps> = ({ isOpen, onClose }) => {
  const {
    products,
    selectedProductId,
    pages,
    setProducts,
    setPages,
    addAuditLog,
    currentUser,
  } = useEditorStore()

  const [selectedLang, setSelectedLang] = useState<string>('en')
  const [translateAllProducts, setTranslateAllProducts] = useState(true)
  const [translatePageTitles, setTranslatePageTitles] = useState(true)
  const [isTranslating, setIsTranslating] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const currentProduct = products.find((p) => p.id === selectedProductId) || products[0]

  const handleTranslate = async () => {
    if (!currentProduct) return
    setIsTranslating(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const targetLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLang)
      const langName = targetLangObj?.name || selectedLang

      let updatedProducts = [...products]
      let updatedPages = [...pages]

      if (translateAllProducts) {
        for (let i = 0; i < updatedProducts.length; i++) {
          const prod = updatedProducts[i]
          const resp = await fetch('/api/ai/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product: prod,
              pages: i === 0 && translatePageTitles ? pages : undefined,
              targetLanguage: selectedLang,
            }),
          })

          if (resp.ok) {
            const data = await resp.json()
            if (data.translatedProduct) {
              updatedProducts[i] = data.translatedProduct
            }
            if (data.translatedPages && translatePageTitles) {
              updatedPages = data.translatedPages
            }
          }
        }
      } else {
        const resp = await fetch('/api/ai/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product: currentProduct,
            pages: translatePageTitles ? pages : undefined,
            targetLanguage: selectedLang,
          }),
        })

        if (!resp.ok) {
          throw new Error('Falha na resposta do serviço de tradução por IA.')
        }

        const data = await resp.json()
        if (data.translatedProduct) {
          updatedProducts = updatedProducts.map((p) =>
            p.id === currentProduct.id ? data.translatedProduct : p
          )
        }
        if (data.translatedPages && translatePageTitles) {
          updatedPages = data.translatedPages
        }
      }

      setProducts(updatedProducts)
      if (translatePageTitles) {
        setPages(updatedPages)
      }

      addAuditLog(
        `Traduziu catálogo para ${langName} com IA`,
        'product',
        translateAllProducts ? 'Todos os Produtos' : currentProduct.sku,
        `Tradução automática técnica de títulos, descrições, grandezas e páginas A4 para ${langName}.`
      )

      setSuccessMessage(`Catálogo traduzido com sucesso para ${langName}!`)
      setTimeout(() => {
        onClose()
      }, 1200)
    } catch (err: any) {
      console.error('[Translation Error]:', err)
      setErrorMessage(err.message || 'Erro ao traduzir catálogo com IA.')
    } finally {
      setIsTranslating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#FFFFFF] border-2 border-[#1A1A2E] shadow-2xl w-full max-w-lg overflow-hidden rounded-xs flex flex-col">
        {/* Header */}
        <div className="bg-[#1A1A2E] text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#2563EB] rounded-xs flex items-center justify-center text-white shadow-md">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Tradução Técnica com Inteligência Artificial
              </h2>
              <span className="text-[11px] text-[#94A3B8]">
                Converta todo o catálogo para Inglês, Espanhol, Francês e mais
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-[#2D2D44] text-white rounded-xs"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C] rounded-xs">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] font-semibold flex items-center gap-2 rounded-xs">
              <Check className="w-4 h-4 text-[#059669]" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Language Selection Grid */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[#475569] flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Selecione o Idioma de Destino:</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSelected = selectedLang === lang.code
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setSelectedLang(lang.code)}
                    className={`p-2.5 text-left border rounded-xs transition-all flex items-start gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'border-[#2563EB] bg-[#EFF6FF] shadow-xs'
                        : 'border-[#CBD5E1] bg-[#FAFAFA] hover:bg-[#F1F5F9]'
                    }`}
                  >
                    <span className="text-xl">{lang.flag}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#0F172A]">{lang.name}</span>
                        {isSelected && <Check className="w-3 h-3 text-[#2563EB]" />}
                      </div>
                      <span className="text-[10px] text-[#64748B] block truncate">
                        {lang.desc}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Scope Options */}
          <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 rounded-xs text-xs">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-[#334155]">
              <input
                type="checkbox"
                checked={translateAllProducts}
                onChange={(e) => setTranslateAllProducts(e.target.checked)}
                className="w-4 h-4 text-[#2563EB] accent-[#2563EB]"
              />
              <span>
                Traduzir todos os produtos ({products.length} itens no catálogo)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer font-medium text-[#334155]">
              <input
                type="checkbox"
                checked={translatePageTitles}
                onChange={(e) => setTranslatePageTitles(e.target.checked)}
                className="w-4 h-4 text-[#2563EB] accent-[#2563EB]"
              />
              <span>
                Traduzir títulos das páginas A4 e cabeçalhos técnicos
              </span>
            </label>
          </div>

          {/* Metrological Guarantee Badge */}
          <div className="p-2.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xs flex items-start gap-2 text-[11px] text-[#1E40AF]">
            <ShieldCheck className="w-4 h-4 shrink-0 text-[#2563EB] mt-0.5" />
            <div>
              <strong>Preservação Metrológica Rigorosa:</strong> Grandezas, unidades (bar, °C, mA), faixas e valores numéricos serão mantidos com 100% de integridade física.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#FAFAFA] border-t border-[#E2E8F0] flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isTranslating}
            className="px-3.5 py-1.5 border border-[#CBD5E1] hover:bg-[#F1F5F9] text-xs font-semibold text-[#475569] rounded-xs cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleTranslate}
            disabled={isTranslating}
            className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#93C5FD] text-white text-xs font-bold rounded-xs cursor-pointer shadow-sm transition-all"
          >
            {isTranslating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>IA Traduzindo Catálogo...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Traduzir com IA Agora</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
