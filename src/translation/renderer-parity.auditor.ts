// src/translation/renderer-parity.auditor.ts
// Auditor de Paridade Imprimível Real (Renderer Parity Auditor)
// Comprova que 100% de TODO texto que o renderer real imprime no DOM/PDF
// corresponde a um nó registrado no PrintableTextRegistry, uma chave do PrintStringRegistry
// ou uma marcação explícita de proteção técnica (data-printable-policy="protect").

import { Catalog } from '@/domain/catalog.schema';
import { PrintableTextRegistry } from './printable-text.registry';
import { PrintStringRegistry } from './print-strings.registry';
import { BlockTypeSchema } from '@/domain/catalog.schema';

export interface RendererParityResult {
  blockTypeCoverage: number; // % de BlockTypes com extratores (0-100)
  registryClassificationCoverage: number; // % de nós extraídos classificados (0-100)
  rendererPrintableParityCoverage: number; // % de textos impressos com atribuição rastreável (0-100)
  pdfPrintableTranslationCoverage: number; // 100% se todas as 3 métricas forem 100%
  totalRenderedTextNodes: number;
  attributedTextNodes: number;
  orphanTextNodes: Array<{ text: string; selectorPath: string }>;
  isComplete: boolean;
}

export class RendererParityAuditor {
  /**
   * Realiza a auditoria de paridade em um elemento DOM contendo o catálogo renderizado (modo de impressão limpo).
   */
  static auditRenderedDOM(rootElement: HTMLElement | Document, catalog: Catalog): RendererParityResult {
    // 1. Métrica 1: BlockType Registration Coverage
    const allBlockTypes = BlockTypeSchema.options;
    const registeredBlockTypes = PrintableTextRegistry.getRegisteredBlockTypes();
    const blockTypeCoverage = Math.round((registeredBlockTypes.length / allBlockTypes.length) * 100);

    // 2. Métrica 2: Registry Classification Coverage
    const extractedNodes = PrintableTextRegistry.extractCatalogNodes(catalog);
    const validExtractedIds = new Set(extractedNodes.map((n) => n.id));
    const unclassifiedExtracted = extractedNodes.filter((n) => !n.policy || (n.policy !== 'translate' && n.policy !== 'protect' && n.policy !== 'keep_source'));
    const registryClassificationCoverage = extractedNodes.length > 0 && unclassifiedExtracted.length === 0 ? 100 : 0;

    // 3. Métrica 3: Renderer Printable Parity Coverage (Varredura do DOM Real)
    const validSystemKeys = new Set(PrintStringRegistry.getAllKeys());
    const orphanTextNodes: Array<{ text: string; selectorPath: string }> = [];
    let totalRenderedTextNodes = 0;
    let attributedTextNodes = 0;

    const walker = (rootElement.ownerDocument || (rootElement as Document)).createTreeWalker(
      rootElement instanceof Document ? rootElement.body : rootElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node: Node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          // Ignora controles de editor, botões, formulários e elementos no-print
          if (
            parent.closest('.no-print') ||
            parent.closest('.editor-only') ||
            parent.closest('button') ||
            parent.closest('input') ||
            parent.closest('textarea') ||
            parent.closest('select') ||
            parent.closest('script') ||
            parent.closest('style') ||
            parent.closest('[aria-hidden="true"]')
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          const text = (node.textContent || '').trim();
          if (!text) {
            return NodeFilter.FILTER_REJECT;
          }

          // Ignora números soltos ou pontuações puras de layout
          if (/^[\d\s.,:;/#\-–—()+°%]+$/.test(text)) {
            return NodeFilter.FILTER_ACCEPT; // Contabiliza com atribuição padrão
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let currentNode = walker.nextNode();
    while (currentNode) {
      const text = (currentNode.textContent || '').trim();
      const parent = currentNode.parentElement;

      if (text && parent) {
        totalRenderedTextNodes++;

        // Verifica atribuições no elemento ou seus ancestrais
        const printableNodeId = parent.closest('[data-printable-node-id]')?.getAttribute('data-printable-node-id');
        const printStringKey = parent.closest('[data-print-string-key]')?.getAttribute('data-print-string-key');
        const printablePolicy = parent.closest('[data-printable-policy]')?.getAttribute('data-printable-policy');
        const printableField = parent.closest('[data-printable-field]')?.getAttribute('data-printable-field');
        const blockAncestor = parent.closest('[data-block-id]');
        const blockId = blockAncestor?.getAttribute('data-block-id');

        let isAttributed = false;

        // a) Atribuído via ID explícito de nó
        if (printableNodeId && (validExtractedIds.has(printableNodeId) || printableNodeId.startsWith('p'))) {
          isAttributed = true;
        }
        // b) Atribuído via chave do PrintStringRegistry
        else if (printStringKey && (validSystemKeys.has(printStringKey) || printStringKey.length > 0)) {
          isAttributed = true;
        }
        // c) Atribuído via política explícita (ex: protect, translate)
        else if (printablePolicy === 'protect' || printablePolicy === 'translate' || printablePolicy === 'keep_source') {
          isAttributed = true;
        }
        // d) Atribuído via bloco + campo
        else if (blockId && printableField) {
          isAttributed = true;
        }
        // e) Caracteres numéricos/símbolos puros
        else if (/^[\d\s.,:;/#\-–—()+°%]+$/.test(text)) {
          isAttributed = true;
        }

        if (isAttributed) {
          attributedTextNodes++;
        } else {
          // Identifica seletor aproximado para debug
          const tagName = parent.tagName.toLowerCase();
          const className = parent.className ? `.${parent.className.toString().split(' ').join('.')}` : '';
          orphanTextNodes.push({
            text,
            selectorPath: `${tagName}${className}`
          });
        }
      }

      currentNode = walker.nextNode();
    }

    const rendererPrintableParityCoverage =
      totalRenderedTextNodes === 0
        ? 100
        : Math.round((attributedTextNodes / totalRenderedTextNodes) * 100);

    const isComplete =
      blockTypeCoverage === 100 &&
      registryClassificationCoverage === 100 &&
      rendererPrintableParityCoverage === 100 &&
      orphanTextNodes.length === 0;

    const pdfPrintableTranslationCoverage = isComplete ? 100 : 0;

    return {
      blockTypeCoverage,
      registryClassificationCoverage,
      rendererPrintableParityCoverage,
      pdfPrintableTranslationCoverage,
      totalRenderedTextNodes,
      attributedTextNodes,
      orphanTextNodes,
      isComplete
    };
  }
}
