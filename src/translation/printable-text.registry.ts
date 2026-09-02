import { Catalog, ContentBlock, BlockType } from '@/domain/catalog.schema';
import { PrintableTextNode } from './types';
import { extractTextAndBoxBlocks } from './block-extractors/text.extractor';
import { extractHeroBlocks } from './block-extractors/hero.extractor';
import { extractFeaturesBlocks } from './block-extractors/features.extractor';
import { extractTableBlocks } from './block-extractors/table.extractor';
import { extractOrderingBlocks } from './block-extractors/ordering.extractor';
import { extractGalleryBlocks } from './block-extractors/gallery.extractor';
import { extractContactBlocks } from './block-extractors/contact.extractor';

export type BlockExtractorFn = (block: ContentBlock, pageId: string, pageNumber: number) => PrintableTextNode[];

export class PrintableTextRegistry {
  private static extractors = new Map<BlockType, BlockExtractorFn>();

  static {
    // 1. Text & Box
    this.register('text', extractTextAndBoxBlocks);
    this.register('box', extractTextAndBoxBlocks);

    // 2. Heros, Headers & Cover
    this.register('hero_banner', extractHeroBlocks);
    this.register('additel_two_col_hero', extractHeroBlocks);
    this.register('fluke_header', extractHeroBlocks);
    this.register('bottom_header', extractHeroBlocks);
    this.register('full_page_cover', extractHeroBlocks);

    // 3. Features & Connectivity
    this.register('features_list', extractFeaturesBlocks);
    this.register('software_connectivity', extractFeaturesBlocks);
    this.register('inserts_visual', extractFeaturesBlocks);
    this.register('multi_mode_calibrator', extractFeaturesBlocks);

    // 4. Tables & Matrices
    this.register('table', extractTableBlocks);
    this.register('specs_table', extractTableBlocks);
    this.register('electrical_table', extractTableBlocks);
    this.register('accessories_table', extractTableBlocks);
    this.register('custom_table', extractTableBlocks);
    this.register('matrix_spec_table', extractTableBlocks);

    // 5. Ordering Codes
    this.register('ordering_codes', extractOrderingBlocks);

    // 6. Galleries & Images
    this.register('image', extractGalleryBlocks);
    this.register('image_gallery', extractGalleryBlocks);

    // 7. Contact
    this.register('contact_footer', extractContactBlocks);
  }

  /**
   * Registra um extrator de texto para um determinado tipo de bloco.
   */
  static register(blockType: BlockType, extractor: BlockExtractorFn): void {
    this.extractors.set(blockType, extractor);
  }

  /**
   * Verifica se um BlockType possui extrator registrado.
   */
  static hasExtractor(blockType: BlockType): boolean {
    return this.extractors.has(blockType);
  }

  /**
   * Obtém a lista de todos os BlockTypes com extratores registrados.
   */
  static getRegisteredBlockTypes(): BlockType[] {
    return Array.from(this.extractors.keys());
  }

  /**
   * Extrai nós de um único bloco usando o extrator registrado.
   */
  static extractBlockNodes(block: ContentBlock, pageId = 'p1', pageNumber = 1): PrintableTextNode[] {
    const extractor = this.extractors.get(block.type);
    if (!extractor) return [];
    return extractor(block, pageId, pageNumber);
  }

  /**
   * Extrai 100% dos nós de texto imprimíveis de um catálogo estruturado.
   */
  static extractCatalogNodes(catalog: Catalog): PrintableTextNode[] {
    if (!catalog) return [];

    const nodes: PrintableTextNode[] = [];

    // 1. Metadados Globais do Catálogo
    if (catalog.title && catalog.title.trim()) {
      nodes.push({
        id: 'doc_catalog_title',
        pageId: 'global',
        path: 'title',
        sourceText: catalog.title.trim(),
        kind: 'heading',
        policy: 'translate',
        source: { blockType: 'catalog', field: 'title' }
      });
    }

    if (catalog.subtitle && catalog.subtitle.trim()) {
      nodes.push({
        id: 'doc_catalog_subtitle',
        pageId: 'global',
        path: 'subtitle',
        sourceText: catalog.subtitle.trim(),
        kind: 'body',
        policy: 'translate',
        source: { blockType: 'catalog', field: 'subtitle' }
      });
    }

    // 2. Varredura por Páginas e Blocos
    const pages = catalog.pages || [];
    pages.forEach((page, pIdx) => {
      const pageNum = page.pageNumber || pIdx + 1;

      if (page.title && page.title.trim()) {
        nodes.push({
          id: `p${pageNum}_page_title`,
          pageId: page.id,
          path: 'title',
          sourceText: page.title.trim(),
          kind: 'heading',
          policy: 'translate',
          source: { blockType: 'page', field: 'title' }
        });
      }

      const blocks = page.blocks || [];
      blocks.forEach((block) => {
        const extractor = this.extractors.get(block.type);
        if (extractor) {
          const extracted = extractor(block, page.id, pageNum);
          nodes.push(...extracted);
        } else {
          // Nó não classificado (gerará alerta no coverage auditor)
          nodes.push({
            id: `p${pageNum}_b${block.id}_unclassified`,
            pageId: page.id,
            blockId: block.id,
            path: 'unclassified',
            sourceText: `[Bloco não registrado: ${block.type}]`,
            kind: 'system',
            policy: 'protect',
            source: { blockType: block.type, field: 'unclassified' }
          });
        }
      });
    });

    return nodes;
  }
}
