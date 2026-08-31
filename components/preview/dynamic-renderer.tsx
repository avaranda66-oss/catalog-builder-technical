'use client'

import React, { useState } from 'react'
import { CatalogPage, PageSection, DesignTokens, ContactInfo, SectionType } from '@/lib/types/catalog-builder'
import { Product } from '@/lib/types/database'
import { useEditorStore } from '@/features/editor/editor-store'
import { BlockInspector } from './block-inspector'
import { BlockErrorBoundary } from './block-error-boundary'
import {
  HeroBannerSection,
  FeaturesListSection,
  TextBlockSection,
  SpecsTableSection,
  ElectricalTableSection,
  GeneralSpecsTableSection,
  AccessoriesTableSection,
  ComparisonGridSection,
  CustomTableSection,
  ContactFooterSection,
  ImageGallerySection,
  SingleImageSection,
  OrderingCodesSection,
  BlankSpacerSection,
  SectionProps,
} from '@/components/preview/sections/catalog-sections'
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Sliders,
  Plus,
  Palette,
} from 'lucide-react'

// ============================================================================
// SECTION → COMPONENT MAP
// ============================================================================

const SECTION_COMPONENTS: Record<SectionType, React.FC<SectionProps & { allProducts?: Product[] }>> = {
  hero_banner: HeroBannerSection,
  features_list: FeaturesListSection,
  text_block: TextBlockSection,
  specs_table: SpecsTableSection,
  comparison_grid: ComparisonGridSection,
  electrical_table: ElectricalTableSection,
  general_specs_table: GeneralSpecsTableSection,
  accessories_table: AccessoriesTableSection,
  custom_table: CustomTableSection,
  contact_footer: ContactFooterSection,
  image_gallery: ImageGallerySection,
  single_image: SingleImageSection,
  ordering_codes: OrderingCodesSection,
  blank_spacer: BlankSpacerSection,
}

// ============================================================================
// PROPS
// ============================================================================

interface DynamicRendererProps {
  pages: CatalogPage[]
  product: Product | null
  allProducts: Product[]
  tokens: DesignTokens
  contact: ContactInfo
}

// ============================================================================
// DYNAMIC RENDERER — with Visual Direct Editing & Block Inspector
// ============================================================================

export const DynamicCatalogRenderer: React.FC<DynamicRendererProps> = ({
  pages,
  product,
  allProducts,
  tokens,
  contact,
}) => {
  const {
    isVisualEditMode,
    reorderSections,
    removeSection,
    addSection,
  } = useEditorStore()

  const [inspectingSection, setInspectingSection] = useState<{ pageId: string; section: PageSection } | null>(null)

  const visiblePages = pages.filter((p) => p.visible).slice().sort((a, b) => a.sort_order - b.sort_order)
  const totalPages = visiblePages.length

  if (totalPages === 0) {
    return (
      <div className="bg-[#FFFFFF] text-[#171717] w-[210mm] min-h-[297mm] mx-auto shadow-md flex items-center justify-center">
        <div className="text-center text-sm text-[#737373]">
          <p className="font-bold">Catálogo Vazio</p>
          <p className="mt-1">Adicione páginas usando o gerenciador na barra lateral.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-[#FFFFFF] text-[#171717] w-[210mm] min-h-[297mm] mx-auto select-none shadow-md print:shadow-none print:w-full">
        {visiblePages.map((page, pageIndex) => {
          const sections = page.sections.filter((s) => s.visible).slice().sort((a, b) => a.sort_order - b.sort_order)

          return (
            <section
              key={page.id}
              className="a4-page-sheet p-[15mm] flex flex-col min-h-[297mm] border-b border-[#E5E5E5] print:border-none relative transition-all"
            >
              {/* Page Header Indicator (only in Visual Edit Mode) */}
              {isVisualEditMode && (
                <div className="mb-3 pb-1 border-b border-dashed border-[#2563EB] flex items-center justify-between text-[10px] font-mono-data text-[#2563EB] bg-[#EFF6FF] px-2 py-1">
                  <span className="font-bold">📄 {page.title || `Página ${pageIndex + 1}`} (Edição Visual)</span>
                  <button
                    type="button"
                    onClick={() => addSection(page.id, 'specs_table')}
                    className="flex items-center gap-1 font-sans text-[11px] bg-[#2563EB] text-white px-2 py-0.5 hover:bg-[#1D4ED8]"
                  >
                    <Plus className="w-3 h-3" />
                    Inserir Bloco nesta Página
                  </button>
                </div>
              )}

              {/* Page Content Sections (natural tight vertical flow) */}
              <div className="flex-1 space-y-3.5">
                {sections.map((section, secIndex) => {
                  const Component = SECTION_COMPONENTS[section.type]
                  if (!Component) {
                    return (
                      <div key={section.id} className="w-full p-2 border border-dashed border-[#D4D4D4] text-[11px] text-[#A3A3A3] italic">
                        Seção desconhecida: {section.type}
                      </div>
                    )
                  }

                  return (
                    <BlockErrorBoundary key={section.id} blockTitle={section.title}>
                      <div
                        role="region"
                        aria-label={section.title}
                        className={`relative group/visual ${
                          isVisualEditMode
                            ? 'p-2 border border-dashed border-[#93C5FD] hover:border-[#2563EB] hover:bg-[#F8FAFC] transition-all rounded-xs'
                            : ''
                        }`}
                      >
                        {/* Visual Edit Toolbar overlay for this section */}
                        {isVisualEditMode && (
                          <div className="absolute -top-3.5 right-2 bg-[#1A1A2E] text-white px-2 py-0.5 text-[10px] flex items-center gap-1.5 shadow-md z-30 opacity-90 group-hover/visual:opacity-100">
                            <button
                              type="button"
                              onClick={() => setInspectingSection({ pageId: page.id, section })}
                              className="flex items-center gap-1 font-bold text-[10px] text-[#93C5FD] hover:text-white"
                              title="Personalizar Cores, Fontes e Layout deste Bloco"
                            >
                              <Palette className="w-3 h-3 text-[#60A5FA]" />
                              <span>{section.title}</span>
                            </button>

                            <div className="flex items-center gap-1 border-l border-[#374151] pl-1.5">
                              {secIndex > 0 && (
                                <button
                                  type="button"
                                  title="Subir bloco"
                                  onClick={() => reorderSections(page.id, secIndex, secIndex - 1)}
                                  className="p-0.5 hover:text-[#93C5FD]"
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                              )}
                              {secIndex < sections.length - 1 && (
                                <button
                                  type="button"
                                  title="Descer bloco"
                                  onClick={() => reorderSections(page.id, secIndex, secIndex + 1)}
                                  className="p-0.5 hover:text-[#93C5FD]"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                title="Excluir este bloco"
                                onClick={() => removeSection(page.id, section.id)}
                                className="p-0.5 text-[#F87171] hover:text-[#EF4444]"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Section Rendered Content */}
                        <Component
                          section={section}
                          product={product}
                          tokens={tokens}
                          contact={contact}
                          allProducts={allProducts}
                        />
                      </div>
                    </BlockErrorBoundary>
                  )
                })}

                {sections.length === 0 && (
                  <div className="w-full flex flex-col items-center justify-center min-h-[220px] border border-dashed border-[#D4D4D4] text-center p-6">
                    <p className="text-xs font-semibold text-[#525252]">Esta página está vazia</p>
                    <button
                      type="button"
                      onClick={() => addSection(page.id, 'specs_table')}
                      className="mt-2 flex items-center gap-1 text-xs bg-[#1A1A2E] text-white px-3 py-1 font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar Primeiro Bloco
                    </button>
                  </div>
                )}
              </div>

              {/* Page Footer with page number */}
              <div className="pt-3 flex items-center justify-between text-[10px] text-[#737373]" style={{ borderTop: `1px solid ${tokens.colors.border}` }}>
                <span>{contact.companyName} — Catálogo Técnico</span>
                <span style={{ fontFamily: tokens.fonts.data, fontWeight: 600 }}>
                  Página {pageIndex + 1} de {totalPages}
                </span>
              </div>
            </section>
          )
        })}
      </div>

      {/* Block Inspector Drawer Modal */}
      {inspectingSection && (
        <BlockInspector
          pageId={inspectingSection.pageId}
          section={
            pages.find((p) => p.id === inspectingSection.pageId)?.sections.find((s) => s.id === inspectingSection.section.id) ||
            inspectingSection.section
          }
          onClose={() => setInspectingSection(null)}
        />
      )}
    </>
  )
}
