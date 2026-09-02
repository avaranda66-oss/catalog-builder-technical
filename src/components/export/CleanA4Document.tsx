import React from 'react';
import { Catalog, CatalogPage } from '../../domain/catalog.schema';
import { TextBlock } from '../editor/blocks/TextBlock';
import { ImageBlock } from '../editor/blocks/ImageBlock';
import { BoxBlock } from '../editor/blocks/BoxBlock';
import { TechnicalTableBlock } from '../editor/blocks/TechnicalTableBlock';
import { HeroBannerBlock } from '../editor/blocks/HeroBannerBlock';
import { FeaturesListBlock } from '../editor/blocks/FeaturesListBlock';
import { ElectricalTableBlock } from '../editor/blocks/ElectricalTableBlock';
import { AccessoriesTableBlock } from '../editor/blocks/AccessoriesTableBlock';
import { OrderingCodesBlock } from '../editor/blocks/OrderingCodesBlock';
import { ImageGalleryBlock } from '../editor/blocks/ImageGalleryBlock';
import { ContactFooterBlock } from '../editor/blocks/ContactFooterBlock';
import { CustomTableBlock } from '../editor/blocks/CustomTableBlock';
import { AdditelTwoColBlock } from '../editor/blocks/AdditelTwoColBlock';
import { FlukeHeaderBlock } from '../editor/blocks/FlukeHeaderBlock';
import { InsertsVisualBlock } from '../editor/blocks/InsertsVisualBlock';
import { MultiModeCalibratorBlock } from '../editor/blocks/MultiModeCalibratorBlock';
import { FullPageCoverBlock } from '../editor/blocks/FullPageCoverBlock';
import { BottomHeaderBlock } from '../editor/blocks/BottomHeaderBlock';
import { MatrixSpecTableBlock } from '../editor/blocks/MatrixSpecTableBlock';
import { SoftwareConnectivityBlock } from '../editor/blocks/SoftwareConnectivityBlock';
import { StructuralSectionBlock } from '../editor/blocks/StructuralSectionBlock';

import { FontManager } from '../../translation/font-manager';
import { applyBidiIsolationToElement } from '../../translation/bidi-helper';
import { PrintLocalizationProvider } from '../../translation/PrintLocalizationContext';
import { getCanonicalPagePaddingCss } from '../../domain/page-geometry';
import { A4DocumentFooter } from '../shared/A4DocumentFooter';

export interface CleanA4DocumentProps {
  document: Catalog;
  className?: string;
}

export const CleanA4Document: React.FC<CleanA4DocumentProps> = ({ document: catalog, className = '' }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const locale = catalog?.locale || 'pt-BR';
  const direction = FontManager.getDirectionForLocale(locale);
  const fontFamily = FontManager.getFontFamilyForLocale(locale);

  React.useEffect(() => {
    if (direction === 'rtl' && containerRef.current) {
      applyBidiIsolationToElement(containerRef.current);
    }
  }, [catalog, direction]);

  if (!catalog || !catalog.pages || catalog.pages.length === 0) {
    return null;
  }

  return (
    <PrintLocalizationProvider locale={locale} localizedSystemStrings={catalog.localizedSystemStrings}>
      <div
        ref={containerRef}
        lang={locale}
        dir={direction}
        className={`clean-export-root ${className}`}
        style={{ fontFamily }}
      >
      {catalog.pages.map((page: CatalogPage, index: number) => {
        const isSingleFullCover =
          page.blocks?.length === 1 && page.blocks[0].type === 'full_page_cover';

        return (
          <div
            key={page.id || `export-page-${index}`}
            data-page-id={page.id}
            data-page-index={index}
            lang={locale}
            dir={direction}
            className="clean-export-page a4-page-container bg-white text-slate-900 mx-auto"
            style={{
              width: '794px',
              minHeight: '1123px',
              maxHeight: '1123px',
              height: '1123px',
              boxSizing: 'border-box',
              overflow: 'hidden',
              pageBreakAfter: 'always',
              breakAfter: 'page',
              position: 'relative',
              backgroundColor: '#ffffff',
              fontFamily
            }}
          >
            <div
              className="h-full flex flex-col justify-between"
              style={{
                height: '1123px',
                boxSizing: 'border-box',
                padding: getCanonicalPagePaddingCss(isSingleFullCover)
              }}
            >
              {/* Viewport Documental Canônico (Fase 3A.5C) */}
              <div
                data-a4-block-flow-viewport
                className="flex-1 min-h-0 relative overflow-hidden"
              >
                {/* Conteúdo Editorial da Página em Altura Natural */}
                <div
                  data-a4-block-flow-content
                  className="space-y-3 flex flex-col h-auto min-h-full"
                >
                  {page.blocks?.map((block) => (
                    <div
                      key={block.id}
                      data-block-id={block.id}
                      data-block-type={block.type}
                      className="export-block-wrapper relative"
                      style={{ zIndex: block.position?.zIndex || 1 }}
                    >
                      {block.type === 'full_page_cover' && (
                        <FullPageCoverBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'bottom_header' && (
                        <BottomHeaderBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'matrix_spec_table' && (
                        <MatrixSpecTableBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'software_connectivity' && (
                        <SoftwareConnectivityBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'structural_section' && (
                        <StructuralSectionBlock block={block} pageId={page.id} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'hero_banner' && (
                        <HeroBannerBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'additel_two_col_hero' && (
                        <AdditelTwoColBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'fluke_header' && (
                        <FlukeHeaderBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'inserts_visual' && (
                        <InsertsVisualBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'multi_mode_calibrator' && (
                        <MultiModeCalibratorBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'features_list' && (
                        <FeaturesListBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {(block.type === 'table' || block.type === 'specs_table') && (
                        <TechnicalTableBlock block={block} pageId={page.id} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'electrical_table' && (
                        <ElectricalTableBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'accessories_table' && (
                        <AccessoriesTableBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'ordering_codes' && (
                        <OrderingCodesBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'image_gallery' && (
                        <ImageGalleryBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'contact_footer' && (
                        <ContactFooterBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'custom_table' && (
                        <CustomTableBlock block={block} pageId={page.id} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'text' && (
                        <TextBlock block={block} pageId={page.id} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'image' && (
                        <ImageBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                      {block.type === 'box' && (
                        <BoxBlock block={block} pageId={page.id} isSelected={false} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rodapé Técnico Editorial Compartilhado (Oculto se for Capa Full Page) */}
              {!isSingleFullCover && (
                <A4DocumentFooter
                  locale={locale}
                  pageNumber={page.pageNumber || index + 1}
                  localizedSystemStrings={catalog.localizedSystemStrings}
                />
              )}
            </div>
          </div>
        );
      })}
      </div>
    </PrintLocalizationProvider>
  );
};
