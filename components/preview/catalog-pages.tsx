import React from 'react'
import type { CatalogPage, PageSection, DesignTokens, ContactInfo, SectionType } from '@/lib/types/catalog-builder'
import type { Product } from '@/lib/types/database'
import { sectionProduct } from '@/lib/catalog/section-data'
import { getLocalizedProduct, getLocalizedPageTitle } from '@/lib/ai/translations'
import { BlockErrorBoundary } from './block-error-boundary'
import {
  HeroBannerSection, FeaturesListSection, TextBlockSection, SpecsTableSection, ElectricalTableSection,
  GeneralSpecsTableSection, AccessoriesTableSection, ComparisonGridSection, CustomTableSection,
  ContactFooterSection, ImageGallerySection, SingleImageSection, OrderingCodesSection, BlankSpacerSection,
  type SectionProps,
} from './sections/catalog-sections'

export const SECTION_COMPONENTS: Record<SectionType, React.ComponentType<SectionProps>> = {
  hero_banner: HeroBannerSection, features_list: FeaturesListSection, text_block: TextBlockSection,
  specs_table: SpecsTableSection, electrical_table: ElectricalTableSection, general_specs_table: GeneralSpecsTableSection,
  accessories_table: AccessoriesTableSection, comparison_grid: ComparisonGridSection, custom_table: CustomTableSection,
  contact_footer: ContactFooterSection, image_gallery: ImageGallerySection, single_image: SingleImageSection,
  ordering_codes: OrderingCodesSection, blank_spacer: BlankSpacerSection,
}

export interface CatalogPagesProps {
  pages: CatalogPage[]
  product: Product | null
  allProducts: Product[]
  tokens: DesignTokens
  contact: ContactInfo
  locale?: string
  renderControls?: (page: CatalogPage, section: PageSection, visible: PageSection[]) => React.ReactNode
  onContentChange?: (page: CatalogPage, section: PageSection, field: string, value: unknown) => void
}

/** Pure document renderer: no store, save, authentication or browser effects. */
export function CatalogPages({ pages, product, allProducts, tokens, contact, locale, renderControls, onContentChange }: CatalogPagesProps) {
  const visiblePages = pages.filter(page => page.visible).toSorted((a, b) => a.sort_order - b.sort_order)
  const localizedProducts = allProducts.map(item => getLocalizedProduct(item, locale))
  const localizedSelected = product ? getLocalizedProduct(product, locale) : null
  return <div className="catalog-pages">
    {visiblePages.map((page, pageIndex) => {
      const sections = page.sections.filter(section => section.visible).toSorted((a, b) => a.sort_order - b.sort_order)
      const title = product ? getLocalizedPageTitle(product, page.id, page.title, locale) : page.title
      return <section key={page.id} data-page-id={page.id} aria-label={title} className="a4-page-sheet relative flex flex-col bg-white" style={{ width: '210mm', height: '297mm', padding: `${tokens.spacing.pageMarginMm ?? 15}mm`, fontFamily: tokens.fonts.body }}>
        <div className="catalog-page-content grid grid-cols-12 content-start" style={{ gap: `${tokens.spacing.sectionGapMm ?? 6}mm` }}>
          {sections.map(section => {
            const Renderer = SECTION_COMPONENTS[section.type]
            const selected = sectionProduct(section, localizedSelected, localizedProducts)
            const span = section.style?.widthPercent === 50 ? 6 : section.style?.widthPercent === 33 ? 4 : 12
            return <div key={section.id} data-section-id={section.id} role="region" aria-label={section.title} className="min-w-0 relative" style={{ gridColumn: `span ${span}` }}>
              {renderControls?.(page, section, sections)}
              <BlockErrorBoundary key={`${section.id}-${section.type}`} blockTitle={section.title}>
                {Renderer ? <Renderer section={section} product={selected} allProducts={localizedProducts} tokens={tokens} contact={contact} onContentChange={onContentChange ? (field, value) => onContentChange(page, section, field, value) : undefined} /> : <p data-empty-block="true">Tipo de bloco não suportado: {section.type}</p>}
              </BlockErrorBoundary>
            </div>
          })}
        </div>
        <footer className="catalog-page-footer mt-auto flex shrink-0 items-center justify-between gap-2 border-t pt-2 text-[9px]" style={{ borderColor: tokens.colors.border, color: '#666' }}>
          <span>{contact.companyName} — {title}</span><span>{pageIndex + 1} / {visiblePages.length}</span>
        </footer>
      </section>
    })}
  </div>
}
