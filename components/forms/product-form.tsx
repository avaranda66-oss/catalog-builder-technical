'use client'

import React, { useState, useEffect } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import { PageSection } from '../../lib/types/catalog-builder'
import { ImageUploader } from '../ui/image-uploader'
import { TranslationModal } from '../ai/translation-modal'
import {
  Plus,
  Trash2,
  CheckCircle,
  FileText,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Table,
  Zap,
  Package,
  Settings,
  Image,
  ListChecks,
  Globe,
} from 'lucide-react'

export const ProductForm: React.FC = () => {
  const {
    products,
    selectedProductId,
    pages,
    selectedPageId,
    setSelectedPageId,
    updateProductData,
    updateProductField,
    updateSectionContent,
    updateSection,
    addSection,
    removeSection,
    setIsVisualEditMode,
    isVisualEditMode,
  } = useEditorStore()

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [isTranslateModalOpen, setIsTranslateModalOpen] = useState(false)

  // Selected Page
  const currentPage = pages.find((p) => p.id === selectedPageId) || pages[0]

  const product = products.find((p) => p.id === selectedProductId) || products[0]

  // Set default active section when page changes
  useEffect(() => {
    if (currentPage && currentPage.sections.length > 0) {
      if (!activeSectionId || !currentPage.sections.some((s) => s.id === activeSectionId)) {
        setActiveSectionId(currentPage.sections[0].id)
      }
    } else {
      setActiveSectionId(null)
    }
  }, [currentPage, activeSectionId])

  if (!product) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-[#FFFFFF] text-[#737373]">
        Selecione um produto na barra lateral para começar a editar.
      </div>
    )
  }

  const activeSection = currentPage?.sections.find((s) => s.id === activeSectionId)

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FFFFFF] overflow-hidden">
      {/* 1. Header: Product Info & Quick Stats */}
      <div className="border-b border-[#D4D4D4] bg-[#FAFAFA] px-4 sm:px-6 pt-3 sm:pt-4 pb-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <span className="font-mono-data font-bold text-xs sm:text-sm bg-[#1A1A2E] text-white px-2 py-0.5 shrink-0 rounded-xs">
              {product.sku}
            </span>
            <input
              type="text"
              value={product.name}
              onChange={(e) => updateProductField(product.id, { name: e.target.value })}
              className="font-bold text-sm sm:text-base text-[#171717] bg-transparent border-b border-transparent hover:border-[#D4D4D4] focus:border-[#2563EB] focus:bg-[#FFFFFF] px-1 py-0.5 focus:outline-none w-full max-w-xs sm:max-w-sm"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsTranslateModalOpen(true)}
              className="flex items-center gap-1 text-xs font-semibold px-2 sm:px-2.5 py-1 border border-[#2563EB] bg-[#EFF6FF] text-[#1E40AF] hover:bg-[#DBEAFE] rounded-xs shadow-2xs cursor-pointer"
              title="Traduzir dados deste catálogo para Inglês, Espanhol, Francês e outros com IA"
            >
              <Globe className="w-3.5 h-3.5 text-[#2563EB]" />
              <span className="hidden xs:inline">Traduzir (IA)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsVisualEditMode(!isVisualEditMode)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 border transition-colors rounded-xs ${
                isVisualEditMode
                  ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                  : 'bg-[#FFFFFF] text-[#2563EB] border-[#BFDBFE] hover:bg-[#EFF6FF]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{isVisualEditMode ? 'Modo Visual Ativo' : 'Edição Visual'}</span>
            </button>
          </div>
        </div>

        {/* Product SKU, Family, Status */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-bold uppercase text-[#737373]">SKU:</label>
            <input
              type="text"
              value={product.sku}
              onChange={(e) => updateProductField(product.id, { sku: e.target.value })}
              className="w-24 sm:w-28 h-7 px-2 font-mono-data bg-[#FFFFFF] border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-bold uppercase text-[#737373]">Família:</label>
            <input
              type="text"
              value={product.family}
              onChange={(e) => updateProductField(product.id, { family: e.target.value })}
              className="w-20 sm:w-24 h-7 px-2 bg-[#FFFFFF] border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-bold uppercase text-[#737373]">Status:</label>
            <select
              value={product.status}
              onChange={(e) => updateProductField(product.id, { status: e.target.value as any })}
              className="h-7 px-2 bg-[#FFFFFF] border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
            >
              <option value="draft">Rascunho</option>
              <option value="review">Em Revisão</option>
              <option value="approved">Aprovado</option>
              <option value="published">Publicado</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Page Navigation Selector Tabs */}
      <div className="bg-[#F5F5F5] border-b border-[#D4D4D4] px-4 py-1.5 flex items-center gap-2 overflow-x-auto select-none">
        <span className="text-[10px] font-bold uppercase text-[#737373] tracking-wider shrink-0 mr-1">
          Página:
        </span>
        {pages.map((p, idx) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setSelectedPageId(p.id)
              if (p.sections.length > 0) {
                setActiveSectionId(p.sections[0].id)
              }
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-xs border transition-colors shrink-0 flex items-center gap-1 ${
              currentPage?.id === p.id
                ? 'bg-[#1A1A2E] text-white border-[#1A1A2E]'
                : 'bg-white text-[#525252] border-[#D4D4D4] hover:bg-[#E5E5E5]'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>{p.title || `Página ${idx + 1}`}</span>
            <span className="text-[10px] opacity-75 font-mono-data">({p.sections.length})</span>
          </button>
        ))}
      </div>

      {/* 3. Section Tabs of the Current Page (100% Dynamic & Unified) */}
      {currentPage && (
        <div className="border-b border-[#D4D4D4] bg-[#FFFFFF] px-4 pt-2 pb-0 flex items-center gap-1 overflow-x-auto select-none">
          {currentPage.sections.map((section) => {
            const isSelected = section.id === activeSectionId
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSectionId(section.id)}
                className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? 'border-[#003366] text-[#003366] bg-[#FFFFFF]'
                    : 'border-transparent text-[#737373] hover:text-[#171717] hover:bg-[#FAFAFA]'
                }`}
              >
                <span className="w-4 h-4 bg-[#E5E5E5] text-[#525252] flex items-center justify-center text-[9px] font-bold">
                  {section.title.charAt(0)}
                </span>
                <span>{section.title}</span>
              </button>
            )
          })}

          {currentPage.sections.length === 0 && (
            <div className="py-2 text-xs text-[#737373] italic">
              Esta página não possui seções. Adicione uma na aba Páginas ou abaixo.
            </div>
          )}
        </div>
      )}

      {/* 4. Active Section Dynamic Form Editor */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeSection ? (
          <SectionEditor
            key={activeSection.id}
            pageId={currentPage.id}
            section={activeSection}
            product={product}
            updateProductData={updateProductData}
            updateSectionContent={updateSectionContent}
            updateSection={updateSection}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[#737373]">
            <Layers className="w-8 h-8 text-[#A3A3A3] mb-2" />
            <p className="font-semibold text-sm text-[#171717]">Nenhuma seção selecionada</p>
            <p className="text-xs text-[#737373] mt-1 max-w-sm">
              Selecione uma seção nas abas acima ou crie uma nova seção para começar a preencher o conteúdo.
            </p>
          </div>
        )}
      </div>

      <TranslationModal
        isOpen={isTranslateModalOpen}
        onClose={() => setIsTranslateModalOpen(false)}
      />
    </div>
  )
}

// ============================================================================
// DYNAMIC SECTION EDITOR (Handles each Section Type with full fidelity)
// ============================================================================

interface SectionEditorProps {
  pageId: string
  section: PageSection
  product: any
  updateProductData: (productId: string, path: string, value: any) => void
  updateSectionContent: (pageId: string, sectionId: string, content: any) => void
  updateSection: (pageId: string, sectionId: string, updates: Partial<PageSection>) => void
}

const SectionEditor: React.FC<SectionEditorProps> = ({
  pageId,
  section,
  product,
  updateProductData,
  updateSectionContent,
  updateSection,
}) => {
  // Section Title Edit Header
  return (
    <div className="space-y-5 max-w-3xl">
      {/* Title & Visibility Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5] bg-[#FAFAFA] p-3 border">
        <div className="flex items-center gap-2 flex-1 mr-3">
          <label className="text-[10px] font-bold uppercase text-[#737373] shrink-0">Título do Bloco:</label>
          <input
            type="text"
            value={section.title}
            onChange={(e) => updateSection(pageId, section.id, { title: e.target.value })}
            className="flex-1 h-8 px-2 text-xs font-bold text-[#171717] bg-[#FFFFFF] border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
          />
        </div>

        <span className="text-[10px] font-mono-data bg-[#EFF6FF] text-[#2563EB] px-2 py-1 border border-[#BFDBFE]">
          Tipo: {section.type}
        </span>
      </div>

      {/* RENDER BY TYPE */}
      {section.type === 'hero_banner' && (
        <HeroBannerEditor
          product={product}
          updateProductData={updateProductData}
          section={section}
          pageId={pageId}
          updateSectionContent={updateSectionContent}
          updateSection={updateSection}
        />
      )}

      {section.type === 'features_list' && (
        <FeaturesListEditor
          product={product}
          updateProductData={updateProductData}
          section={section}
          pageId={pageId}
          updateSectionContent={updateSectionContent}
        />
      )}

      {section.type === 'text_block' && (
        <TextBlockEditor
          product={product}
          updateProductData={updateProductData}
          section={section}
          pageId={pageId}
          updateSectionContent={updateSectionContent}
        />
      )}

      {section.type === 'specs_table' && (
        <SpecsTableEditor
          product={product}
          updateProductData={updateProductData}
          section={section}
          pageId={pageId}
          updateSectionContent={updateSectionContent}
        />
      )}

      {section.type === 'electrical_table' && (
        <ElectricalTableEditor
          product={product}
          updateProductData={updateProductData}
          section={section}
          pageId={pageId}
          updateSectionContent={updateSectionContent}
        />
      )}

      {section.type === 'general_specs_table' && (
        <GeneralSpecsTableEditor
          product={product}
          updateProductData={updateProductData}
          section={section}
          pageId={pageId}
          updateSectionContent={updateSectionContent}
        />
      )}

      {section.type === 'accessories_table' && (
        <AccessoriesTableEditor
          product={product}
          updateProductData={updateProductData}
          section={section}
          pageId={pageId}
          updateSectionContent={updateSectionContent}
        />
      )}

      {section.type === 'custom_table' && (
        <CustomTableEditor
          section={section}
          pageId={pageId}
          updateSectionContent={updateSectionContent}
        />
      )}

      {section.type === 'image_gallery' && (
        <ImageGalleryEditor
          product={product}
          updateProductData={updateProductData}
          section={section}
          pageId={pageId}
          updateSectionContent={updateSectionContent}
        />
      )}

      {section.type === 'single_image' && (
        <SingleImageEditor
          product={product}
          updateProductData={updateProductData}
          section={section}
          pageId={pageId}
          updateSectionContent={updateSectionContent}
        />
      )}

      {section.type === 'contact_footer' && (
        <ContactFooterEditor
          section={section}
          pageId={pageId}
          updateSectionContent={updateSectionContent}
        />
      )}
    </div>
  )
}

// ============================================================================
// 1. HERO BANNER EDITOR
// ============================================================================
const HeroBannerEditor: React.FC<any> = ({
  product,
  updateProductData,
  section,
  pageId,
  updateSectionContent,
  updateSection,
}) => {
  const marketing = product.data?.marketing || {}
  const images = marketing.images || []
  const currentHeight = section.config?.imageHeightPx || 160
  const currentFit = section.config?.imageFit || 'contain'
  const currentLayout = section.config?.imageLayout || 'auto'

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-[#525252] uppercase tracking-wide">
          Título Comercial do Catálogo
        </label>
        <input
          type="text"
          value={marketing.title || ''}
          onChange={(e) => updateProductData(product.id, 'marketing.title', e.target.value)}
          placeholder="Ex: Controlador e Calibrador Automático de Pressão..."
          className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-[#525252] uppercase tracking-wide">
          Subtítulo / Categoria Técnica
        </label>
        <input
          type="text"
          value={marketing.subtitle || ''}
          onChange={(e) => updateProductData(product.id, 'marketing.subtitle', e.target.value)}
          placeholder="Ex: Calibradores de Pressão Documentadores de Laboratório"
          className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-[#525252] uppercase tracking-wide">
          Tag da Empresa / Ramo
        </label>
        <input
          type="text"
          value={section.content?.companyTag || ''}
          onChange={(e) =>
            updateSectionContent(pageId, section.id, {
              ...section.content,
              companyTag: e.target.value,
            })
          }
          placeholder="Ex: Calibração e Instrumentação"
          className="w-full h-9 px-3 text-xs bg-[#FFFFFF] border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
        />
      </div>

      {/* Image Display & Layout Controls */}
      <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] space-y-3 rounded-xs">
        <span className="text-xs font-bold uppercase text-[#334155] block">
          Ajustes Visuais das Fotos na Capa
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          {/* Height */}
          <div>
            <label className="text-[10px] font-bold text-[#64748B] block uppercase mb-1">
              Altura do Bloco:
            </label>
            <select
              value={currentHeight}
              onChange={(e) =>
                updateSection(pageId, section.id, {
                  config: { ...(section.config || {}), imageHeightPx: Number(e.target.value) },
                })
              }
              className="w-full h-8 px-2 bg-white border border-[#CBD5E1] text-xs focus:border-[#2563EB] focus:outline-none font-mono-data"
            >
              <option value={120}>120px (Compacto)</option>
              <option value={160}>160px (Padrão)</option>
              <option value={200}>200px (Grande)</option>
              <option value={250}>250px (Expandido)</option>
            </select>
          </div>

          {/* Fit */}
          <div>
            <label className="text-[10px] font-bold text-[#64748B] block uppercase mb-1">
              Enquadramento:
            </label>
            <select
              value={currentFit}
              onChange={(e) =>
                updateSection(pageId, section.id, {
                  config: { ...(section.config || {}), imageFit: e.target.value },
                })
              }
              className="w-full h-8 px-2 bg-white border border-[#CBD5E1] text-xs focus:border-[#2563EB] focus:outline-none"
            >
              <option value="contain">Conter (Proporcional / Sem corte)</option>
              <option value="cover">Preencher (Cobrir caixa)</option>
            </select>
          </div>

          {/* Multi-Photo Layout */}
          <div>
            <label className="text-[10px] font-bold text-[#64748B] block uppercase mb-1">
              Disposição (2+ fotos):
            </label>
            <select
              value={currentLayout}
              onChange={(e) =>
                updateSection(pageId, section.id, {
                  config: { ...(section.config || {}), imageLayout: e.target.value },
                })
              }
              className="w-full h-8 px-2 bg-white border border-[#CBD5E1] text-xs focus:border-[#2563EB] focus:outline-none"
            >
              <option value="auto">Lado a Lado (2 Colunas)</option>
              <option value="stacked">Empilhado (Vertical)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Image Uploader for Hero Banner with Reordering */}
      <div className="pt-2 border-t border-[#E5E5E5]">
        <ImageUploader
          images={images}
          onChange={(newImages) => updateProductData(product.id, 'marketing.images', newImages)}
          maxImages={3}
          label="Fotos do Produto na Capa (Capa & Destaque)"
          productSku={product.sku}
        />
      </div>

      {/* Destaques e Recursos Técnicos (Bullets da Capa) */}
      <div className="p-3.5 bg-[#FFFFFF] border border-[#D4D4D4] space-y-3 rounded-xs shadow-2xs">
        <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-2">
          <div>
            <span className="text-xs font-bold uppercase text-[#003366] block">
              Destaques e Recursos Técnicos (Bullets da Capa)
            </span>
            <span className="text-[10px] text-[#737373]">
              Edite, adicione ou remova os marcadores com ícone de checklist exibidos na Capa
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const currentFeatures: string[] = marketing.features || []
              updateProductData(product.id, 'marketing.features', [
                ...currentFeatures,
                'Novo destaque técnico / recurso de alta precisão',
              ])
            }}
            className="flex items-center gap-1 text-xs font-bold bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE] px-2.5 py-1 rounded-xs border border-[#BFDBFE] transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar Destaque</span>
          </button>
        </div>

        <div className="space-y-2">
          {(marketing.features || []).map((feat: string, idx: number) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-5 h-5 bg-[#003366] text-white text-[10px] font-bold flex items-center justify-center rounded-xs shrink-0">
                {idx + 1}
              </span>
              <input
                type="text"
                value={feat}
                onChange={(e) => {
                  const updated = [...(marketing.features || [])]
                  updated[idx] = e.target.value
                  updateProductData(product.id, 'marketing.features', updated)
                }}
                placeholder="Ex: Controle automático de alta exatidão..."
                className="flex-1 h-8 px-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none rounded-xs"
              />
              <button
                type="button"
                onClick={() => {
                  const updated = (marketing.features || []).filter((_: any, i: number) => i !== idx)
                  updateProductData(product.id, 'marketing.features', updated)
                }}
                className="p-1.5 text-[#94A3B8] hover:text-[#EF4444] rounded-xs transition-colors cursor-pointer"
                title="Excluir destaque"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {(!marketing.features || marketing.features.length === 0) && (
            <p className="text-xs text-[#94A3B8] italic text-center py-2">
              Nenhum destaque adicionado. Clique no botão acima para adicionar recursos técnicos.
            </p>
          )}
        </div>
      </div>

      {/* Visão Geral e Aplicação (Overview da Capa) */}
      <div className="p-3.5 bg-[#FFFFFF] border border-[#D4D4D4] space-y-2 rounded-xs shadow-2xs">
        <label className="block text-xs font-bold uppercase text-[#003366]">
          Visão Geral e Descrição de Aplicação (Texto da Capa)
        </label>
        <span className="text-[10px] text-[#737373] block -mt-1">
          Texto descritivo posicionado abaixo dos destaques ou ao lado da foto na primeira página
        </span>
        <textarea
          rows={4}
          value={marketing.overview || ''}
          onChange={(e) => updateProductData(product.id, 'marketing.overview', e.target.value)}
          placeholder="Ex: O Calibrador PCON é ideal para laboratórios de metrologia e calibração de instrumentos de pressão em campo..."
          className="w-full p-2.5 text-xs leading-relaxed bg-[#F8FAFC] border border-[#CBD5E1] focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none rounded-xs"
        />
      </div>
    </div>
  )
}

// ============================================================================
// 2. TEXT BLOCK EDITOR
// ============================================================================
const TextBlockEditor: React.FC<any> = ({ product, updateProductData, section, pageId, updateSectionContent }) => {
  const text = section.content?.text !== undefined ? section.content.text : product.data?.marketing?.overview || ''

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-[#525252] uppercase tracking-wide">
        Texto / Descrição do Bloco
      </label>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => {
          updateSectionContent(pageId, section.id, { ...section.content, text: e.target.value })
          updateProductData(product.id, 'marketing.overview', e.target.value)
        }}
        placeholder="Digite o texto explicativo ou parágrafo descritivo..."
        className="w-full p-3 text-xs leading-relaxed bg-[#FFFFFF] border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
      />
    </div>
  )
}

// ============================================================================
// 3. FEATURES LIST EDITOR
// ============================================================================
const FeaturesListEditor: React.FC<any> = ({ product, updateProductData }) => {
  const features: string[] = product.data?.marketing?.features || []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-[#525252] uppercase tracking-wide">
          Lista de Destaques e Balas (Bullets)
        </label>
        <button
          type="button"
          onClick={() => {
            updateProductData(product.id, 'marketing.features', [
              ...features,
              'Novo destaque técnico do produto',
            ])
          }}
          className="flex items-center gap-1 text-xs text-[#003366] font-semibold hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Destaque
        </button>
      </div>

      <div className="space-y-2">
        {features.map((feat, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-5 text-center font-mono-data text-xs text-[#737373]">{index + 1}.</span>
            <input
              type="text"
              value={feat}
              onChange={(e) => {
                const updated = [...features]
                updated[index] = e.target.value
                updateProductData(product.id, 'marketing.features', updated)
              }}
              className="flex-1 h-9 px-3 text-xs bg-[#FFFFFF] border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const updated = features.filter((_, i) => i !== index)
                updateProductData(product.id, 'marketing.features', updated)
              }}
              className="p-1.5 text-[#DC2626] hover:bg-[#FEF2F2]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {features.length === 0 && (
          <div className="p-4 text-center text-xs text-[#737373] italic border border-dashed border-[#D4D4D4]">
            Nenhum destaque adicionado.
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// 4. SPECS TABLE EDITOR (Generic Param × Value)
// ============================================================================
const SpecsTableEditor: React.FC<any> = ({ product, updateProductData, section, pageId, updateSectionContent }) => {
  const rows = section.content?.rows || product.data?.specs || []

  const handleAdd = () => {
    const newRows = [...rows, { param: 'Novo Parâmetro', value: '' }]
    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
    updateProductData(product.id, 'specs', newRows)
  }

  const handleUpdate = (index: number, field: 'param' | 'value', val: string) => {
    const newRows = [...rows]
    newRows[index] = { ...newRows[index], [field]: val }
    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
    updateProductData(product.id, 'specs', newRows)
  }

  const handleRemove = (index: number) => {
    const newRows = rows.filter((_: any, i: number) => i !== index)
    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
    updateProductData(product.id, 'specs', newRows)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-[#525252] uppercase tracking-wide block">
            Tabela de Parâmetros e Especificações
          </span>
          <span className="text-[10px] text-[#737373]">
            Adicione ou edite qualquer especificação técnica em formato Parâmetro × Valor.
          </span>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 text-xs text-[#003366] font-semibold hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Linha
        </button>
      </div>

      <table className="w-full border-collapse border border-[#D4D4D4] text-left text-xs">
        <thead>
          <tr className="bg-[#1A1A2E] text-white font-semibold">
            <th className="p-2 border-r border-[#374151] w-1/3">Parâmetro</th>
            <th className="p-2 border-r border-[#374151]">Especificação Técnica</th>
            <th className="p-2 w-10 text-center">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E5E5]">
          {rows.map((row: any, idx: number) => (
            <tr key={idx} className="hover:bg-[#F5F5F5]">
              <td className="p-1.5 border-r border-[#E5E5E5]">
                <input
                  type="text"
                  value={row.param || ''}
                  onChange={(e) => handleUpdate(idx, 'param', e.target.value)}
                  placeholder="Ex: Faixa de Controle"
                  className="w-full p-1 text-xs font-semibold border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
                />
              </td>
              <td className="p-1.5 border-r border-[#E5E5E5]">
                <input
                  type="text"
                  value={typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value || '')}
                  onChange={(e) => handleUpdate(idx, 'value', e.target.value)}
                  placeholder="Ex: 0 a 210 bar"
                  className="w-full p-1 text-xs font-mono-data border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
                />
              </td>
              <td className="p-1.5 text-center">
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="p-1 text-[#DC2626] hover:bg-[#FEF2F2]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="p-6 text-center text-[#A3A3A3] italic">
                Tabela vazia. Clique em "Adicionar Linha" para inserir especificações.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// 5. ELECTRICAL TABLE EDITOR
// ============================================================================
const ElectricalTableEditor: React.FC<any> = ({ product, updateProductData, section, pageId, updateSectionContent }) => {
  const rows = section.content?.rows || product.data?.electrical || []

  const handleAdd = () => {
    const newRows = [
      ...rows,
      { signal: 'Sinal', range: '0 a 10 V', resolution: '0.001 V', accuracy: '± 0.01% FS', note: '' },
    ]
    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
    updateProductData(product.id, 'electrical', newRows)
  }

  const handleUpdate = (index: number, field: string, val: string) => {
    const newRows = [...rows]
    newRows[index] = { ...newRows[index], [field]: val }
    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
    updateProductData(product.id, 'electrical', newRows)
  }

  const handleRemove = (index: number) => {
    const newRows = rows.filter((_: any, i: number) => i !== index)
    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
    updateProductData(product.id, 'electrical', newRows)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#525252] uppercase tracking-wide">
          Canais de Medição Elétrica / Calibrador
        </span>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 text-xs text-[#003366] font-semibold hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Canal
        </button>
      </div>

      <table className="w-full border-collapse border border-[#D4D4D4] text-left text-xs">
        <thead>
          <tr className="bg-[#1A1A2E] text-white font-semibold">
            <th className="p-2 border-r border-[#374151]">Sinal</th>
            <th className="p-2 border-r border-[#374151]">Faixa</th>
            <th className="p-2 border-r border-[#374151]">Resolução</th>
            <th className="p-2 border-r border-[#374151]">Exatidão</th>
            <th className="p-2 border-r border-[#374151]">Observação</th>
            <th className="p-2 w-10 text-center">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E5E5]">
          {rows.map((row: any, idx: number) => (
            <tr key={idx} className="hover:bg-[#F5F5F5]">
              {['signal', 'range', 'resolution', 'accuracy', 'note'].map((col) => (
                <td key={col} className="p-1 border-r border-[#E5E5E5]">
                  <input
                    type="text"
                    value={row[col] || ''}
                    onChange={(e) => handleUpdate(idx, col, e.target.value)}
                    className="w-full p-1 text-xs border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
                  />
                </td>
              ))}
              <td className="p-1 text-center">
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="p-1 text-[#DC2626] hover:bg-[#FEF2F2]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// 6. GENERAL SPECS TABLE EDITOR
// ============================================================================
const GeneralSpecsTableEditor: React.FC<any> = ({ product, updateProductData, section, pageId, updateSectionContent }) => {
  const rows = section.content?.rows || product.data?.general || []

  const handleAdd = () => {
    const newRows = [...rows, { param: 'Novo Parâmetro', desc: 'Descrição' }]
    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
    updateProductData(product.id, 'general', newRows)
  }

  const handleUpdate = (index: number, field: 'param' | 'desc', val: string) => {
    const newRows = [...rows]
    newRows[index] = { ...newRows[index], [field]: val }
    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
    updateProductData(product.id, 'general', newRows)
  }

  const handleRemove = (index: number) => {
    const newRows = rows.filter((_: any, i: number) => i !== index)
    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
    updateProductData(product.id, 'general', newRows)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#525252] uppercase tracking-wide">
          Especificações Gerais / Construtivas
        </span>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 text-xs text-[#003366] font-semibold hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Linha
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2 p-2 border border-[#E5E5E5] bg-[#FAFAFA]">
            <input
              type="text"
              value={row.param || ''}
              onChange={(e) => handleUpdate(idx, 'param', e.target.value)}
              placeholder="Parâmetro"
              className="w-1/3 h-8 px-2 text-xs font-semibold bg-[#FFFFFF] border border-[#D4D4D4]"
            />
            <input
              type="text"
              value={row.desc || ''}
              onChange={(e) => handleUpdate(idx, 'desc', e.target.value)}
              placeholder="Descrição"
              className="flex-1 h-8 px-2 text-xs bg-[#FFFFFF] border border-[#D4D4D4]"
            />
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="p-1 text-[#DC2626] hover:bg-[#FEF2F2]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// 7. ACCESSORIES TABLE EDITOR
// ============================================================================
const AccessoriesTableEditor: React.FC<any> = ({ product, updateProductData, section, pageId, updateSectionContent }) => {
  const rows = section.content?.rows || product.data?.accessories || []

  const handleAdd = () => {
    const newRows = [...rows, { code: 'COD-NOVO', description: 'Descrição do acessório', type: 'Standard' }]
    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
    updateProductData(product.id, 'accessories', newRows)
  }

  const handleUpdate = (index: number, field: string, val: string) => {
    const newRows = [...rows]
    newRows[index] = { ...newRows[index], [field]: val }
    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
    updateProductData(product.id, 'accessories', newRows)
  }

  const handleRemove = (index: number) => {
    const newRows = rows.filter((_: any, i: number) => i !== index)
    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
    updateProductData(product.id, 'accessories', newRows)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#525252] uppercase tracking-wide">
          Acessórios e Opcionais
        </span>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 text-xs text-[#003366] font-semibold hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Acessório
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2 p-2 border border-[#E5E5E5] bg-[#FAFAFA]">
            <input
              type="text"
              value={row.code || ''}
              onChange={(e) => handleUpdate(idx, 'code', e.target.value)}
              placeholder="Código"
              className="w-32 h-8 px-2 text-xs font-mono-data font-bold bg-[#FFFFFF] border border-[#D4D4D4]"
            />
            <input
              type="text"
              value={row.description || ''}
              onChange={(e) => handleUpdate(idx, 'description', e.target.value)}
              placeholder="Descrição"
              className="flex-1 h-8 px-2 text-xs bg-[#FFFFFF] border border-[#D4D4D4]"
            />
            <select
              value={row.type || 'Standard'}
              onChange={(e) => handleUpdate(idx, 'type', e.target.value)}
              className="h-8 px-2 text-xs bg-[#FFFFFF] border border-[#D4D4D4]"
            >
              <option value="Standard">Incluso (Std)</option>
              <option value="Optional">Opcional</option>
            </select>
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="p-1 text-[#DC2626] hover:bg-[#FEF2F2]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// 8. CUSTOM TABLE EDITOR
// ============================================================================
const CustomTableEditor: React.FC<any> = ({ section, pageId, updateSectionContent }) => {
  const columns: string[] = section.config?.columns || ['Coluna 1', 'Coluna 2']
  const rows: any[] = section.content?.rows || []

  const handleAddRow = () => {
    const emptyRow: Record<string, string> = {}
    columns.forEach((col) => { emptyRow[col] = '' })
    updateSectionContent(pageId, section.id, { ...section.content, rows: [...rows, emptyRow] })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#525252] uppercase tracking-wide">
          Tabela Livre Personalizada
        </span>
        <button
          type="button"
          onClick={handleAddRow}
          className="flex items-center gap-1 text-xs text-[#003366] font-semibold hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Linha
        </button>
      </div>

      <table className="w-full border-collapse border border-[#D4D4D4] text-xs">
        <thead>
          <tr className="bg-[#1A1A2E] text-white">
            {columns.map((col, ci) => (
              <th key={ci} className="p-2 border-r border-[#374151]">{col}</th>
            ))}
            <th className="p-2 w-10 text-center">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E5E5]">
          {rows.map((row, ri) => (
            <tr key={ri}>
              {columns.map((col, ci) => (
                <td key={ci} className="p-1 border-r border-[#E5E5E5]">
                  <input
                    type="text"
                    value={row[col] || ''}
                    onChange={(e) => {
                      const newRows = [...rows]
                      newRows[ri] = { ...newRows[ri], [col]: e.target.value }
                      updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
                    }}
                    className="w-full p-1 text-xs border border-[#D4D4D4]"
                  />
                </td>
              ))}
              <td className="p-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    const newRows = rows.filter((_, i) => i !== ri)
                    updateSectionContent(pageId, section.id, { ...section.content, rows: newRows })
                  }}
                  className="p-1 text-[#DC2626] hover:bg-[#FEF2F2]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// 9. CONTACT FOOTER EDITOR
// ============================================================================
const ContactFooterEditor: React.FC<any> = ({ section, pageId, updateSectionContent }) => {
  const contact = section.content || {}

  const handleChange = (key: string, val: string) => {
    updateSectionContent(pageId, section.id, { ...contact, [key]: val })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold uppercase text-[#737373] block mb-1">Empresa</label>
          <input
            type="text"
            value={contact.companyName || ''}
            onChange={(e) => handleChange('companyName', e.target.value)}
            placeholder="Nome da Empresa"
            className="w-full h-8 px-2 text-xs bg-white border border-[#D4D4D4]"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-[#737373] block mb-1">Website</label>
          <input
            type="text"
            value={contact.website || ''}
            onChange={(e) => handleChange('website', e.target.value)}
            placeholder="www.exemplo.com.br"
            className="w-full h-8 px-2 text-xs bg-white border border-[#D4D4D4]"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-[#737373] block mb-1">Telefone</label>
          <input
            type="text"
            value={contact.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="+55 (11) 0000-0000"
            className="w-full h-8 px-2 text-xs bg-white border border-[#D4D4D4]"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-[#737373] block mb-1">E-mail</label>
          <input
            type="text"
            value={contact.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="contato@exemplo.com.br"
            className="w-full h-8 px-2 text-xs bg-white border border-[#D4D4D4]"
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 10. IMAGE GALLERY EDITOR
// ============================================================================
const ImageGalleryEditor: React.FC<any> = ({ product, updateProductData, section, pageId, updateSectionContent }) => {
  const images: any[] = section.content?.images || product.data?.marketing?.images || []
  const cols = section.config?.columns || 3

  const handleImagesChange = (newImageUrls: string[]) => {
    // Keep captions if objects existed, or map strings
    const updatedImages = newImageUrls.map((url, i) => {
      const existing = images[i]
      if (typeof existing === 'object' && existing !== null) {
        return { ...existing, url }
      }
      return { url, caption: '' }
    })

    updateSectionContent(pageId, section.id, {
      ...section.content,
      images: updatedImages,
    })
    updateProductData(product.id, 'marketing.images', newImageUrls)
  }

  const handleCaptionChange = (index: number, caption: string) => {
    const updated = [...images].map((img, i) => {
      if (i !== index) return img
      if (typeof img === 'string') return { url: img, caption }
      return { ...img, caption }
    })
    updateSectionContent(pageId, section.id, {
      ...section.content,
      images: updated,
    })
  }

  const imageUrls = images.map((img) => (typeof img === 'string' ? img : img.url || img.src || ''))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-[#525252] uppercase tracking-wide">
            Colunas do Grid:
          </label>
          <select
            value={cols}
            onChange={(e) =>
              updateSectionContent(pageId, section.id, {
                ...section.content,
                // Note: section.config can be updated via updateSection or stored in content
              })
            }
            className="h-8 px-2 text-xs bg-white border border-[#D4D4D4]"
          >
            <option value={2}>2 Colunas</option>
            <option value={3}>3 Colunas</option>
            <option value={4}>4 Colunas</option>
          </select>
        </div>
      </div>

      <ImageUploader
        images={imageUrls.filter(Boolean)}
        onChange={handleImagesChange}
        maxImages={8}
        label="Fotos da Galeria"
        productSku={product.sku}
      />

      {images.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[#E5E5E5]">
          <span className="text-[10px] font-bold uppercase text-[#737373] block">
            Legendas das Imagens
          </span>
          <div className="space-y-2">
            {images.map((img, i) => {
              const caption = typeof img === 'string' ? '' : img.caption || ''
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="font-mono-data text-xs text-[#737373] w-6 text-center">
                    #{i + 1}
                  </span>
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => handleCaptionChange(i, e.target.value)}
                    placeholder={`Legenda da imagem ${i + 1} (opcional)`}
                    className="flex-1 h-8 px-2 text-xs bg-white border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 11. SINGLE IMAGE / DIAGRAM EDITOR
// ============================================================================
const SingleImageEditor: React.FC<any> = ({ product, updateProductData, section, pageId, updateSectionContent }) => {
  const imageUrl = section.content?.imageUrl || section.content?.url || (typeof section.content === 'string' ? section.content : '') || ''
  const caption = section.content?.caption || section.config?.caption || ''
  const align = section.config?.align || 'center'
  const maxHeightMm = section.config?.maxHeightMm || 60

  const handleImageChange = (urls: string[]) => {
    const url = urls[0] || ''
    updateSectionContent(pageId, section.id, {
      ...section.content,
      imageUrl: url,
      url,
    })
  }

  const handleCaptionChange = (newCaption: string) => {
    updateSectionContent(pageId, section.id, {
      ...section.content,
      caption: newCaption,
    })
  }

  return (
    <div className="space-y-4">
      <ImageUploader
        images={imageUrl ? [imageUrl] : []}
        onChange={handleImageChange}
        maxImages={1}
        label="Imagem / Diagrama Técnico"
        productSku={product.sku}
      />

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-[#525252] uppercase tracking-wide">
          Legenda da Imagem (opcional)
        </label>
        <input
          type="text"
          value={caption}
          onChange={(e) => handleCaptionChange(e.target.value)}
          placeholder="Ex: Diagrama Dimensional (em mm) do PCON-Y17"
          className="w-full h-8 px-2 text-xs bg-white border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
        />
      </div>
    </div>
  )
}

