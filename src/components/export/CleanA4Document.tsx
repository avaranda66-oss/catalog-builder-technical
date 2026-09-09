import React from 'react';
import { Catalog } from '../../domain/catalog.schema';
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
import type { TableDatumResolver } from '../../domain/table-core';
import type { A4RenderPlan } from '../../domain/a4-render-plan';
import type { LayoutPreflightReport } from '../../domain/layout-preflight';
import { useMeasuredA4RenderPlan } from '../a4/useMeasuredA4RenderPlan';

export interface CleanA4DocumentProps {
  document: Catalog;
  className?: string;
  resolveDatum?: TableDatumResolver;
  renderPlan?: A4RenderPlan;
  onLayoutPreflightChange?: (report: LayoutPreflightReport, plan: A4RenderPlan, isComplete: boolean) => void;
}

export const CleanA4Document: React.FC<CleanA4DocumentProps> = ({
  document: catalog,
  className = '',
  resolveDatum,
  renderPlan: suppliedRenderPlan,
  onLayoutPreflightChange
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const measured = useMeasuredA4RenderPlan(
    catalog,
    containerRef,
    catalog.layoutFlowMode === 'manual' ? 'manual' : 'smart'
  );
  const renderPlan = suppliedRenderPlan ?? measured.renderPlan;

  const locale = catalog?.locale || 'pt-BR';
  const direction = FontManager.getDirectionForLocale(locale);
  const fontFamily = FontManager.getFontFamilyForLocale(locale);

  React.useEffect(() => {
    if (direction === 'rtl' && containerRef.current) {
      applyBidiIsolationToElement(containerRef.current);
    }
  }, [catalog, direction]);

  React.useEffect(() => {
    onLayoutPreflightChange?.(measured.layoutPreflight, renderPlan, measured.isLayoutComplete);
  }, [measured.isLayoutComplete, measured.layoutPreflight, onLayoutPreflightChange, renderPlan]);

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
        data-layout-state={measured.isLayoutReady ? 'ready' : measured.layoutPreflight.canPublish ? 'pending' : 'blocked'}
        data-layout-block-count={measured.layoutPreflight.blockCount}
        style={{ fontFamily }}
      >
      {renderPlan.pages.map((renderPage, index: number) => {
        const isSingleFullCover = renderPage.isCover && renderPage.blocks.length === 1;

        return (
          <div
            key={renderPage.id || `export-page-${index}`}
            data-a4-page
            data-a4-page-id={renderPage.id}
            data-page-id={renderPage.id}
            data-canonical-page-id={renderPage.canonicalPageId}
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
                  className={`flex flex-col ${
                    isSingleFullCover ? 'p-0 h-full w-full space-y-0' : 'space-y-3 h-auto min-h-full'
                  }`}
                >
                  {renderPage.blocks.map(({ block, slice, id: projectedBlockId }) => (
                    <div
                      key={projectedBlockId}
                      data-block-id={block.id}
                      data-canonical-block-id={block.id}
                      data-block-type={block.type}
                      className={`export-block-wrapper relative ${
                        isSingleFullCover ? 'h-full w-full' : ''
                      }`}
                      style={{ zIndex: block.position?.zIndex || 1 }}
                    >
                      {block.type === 'full_page_cover' && (
                        <FullPageCoverBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} />
                      )}
                      {block.type === 'bottom_header' && (
                        <BottomHeaderBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'matrix_spec_table' && (
                        <MatrixSpecTableBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} />
                      )}
                      {block.type === 'software_connectivity' && (
                        <SoftwareConnectivityBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'structural_section' && (
                        <StructuralSectionBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'hero_banner' && (
                        <HeroBannerBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'additel_two_col_hero' && (
                        <AdditelTwoColBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'fluke_header' && (
                        <FlukeHeaderBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'inserts_visual' && (
                        <InsertsVisualBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} />
                      )}
                      {block.type === 'multi_mode_calibrator' && (
                        <MultiModeCalibratorBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'features_list' && (
                        <FeaturesListBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {(block.type === 'table' || block.type === 'specs_table') && (
                        <TechnicalTableBlock
                          block={block}
                          pageId={renderPage.canonicalPageId}
                          isSelected={false}
                          isExport={true}
                          resolveDatumOverride={resolveDatum}
                          slice={slice}
                        />
                      )}
                      {block.type === 'electrical_table' && (
                        <ElectricalTableBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'accessories_table' && (
                        <AccessoriesTableBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'ordering_codes' && (
                        <OrderingCodesBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} />
                      )}
                      {block.type === 'image_gallery' && (
                        <ImageGalleryBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'contact_footer' && (
                        <ContactFooterBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} />
                      )}
                      {block.type === 'custom_table' && (
                        <CustomTableBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} slice={slice} />
                      )}
                      {block.type === 'text' && (
                        <TextBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'image' && (
                        <ImageBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} isExport={true} />
                      )}
                      {block.type === 'box' && (
                        <BoxBlock block={block} pageId={renderPage.canonicalPageId} isSelected={false} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rodapé Técnico Editorial Compartilhado (Oculto se for Capa Full Page) */}
              {!isSingleFullCover && (
                <A4DocumentFooter
                  locale={locale}
                  pageNumber={renderPage.pageNumber}
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
