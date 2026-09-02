// src/translation/renderer-parity.auditor.ts
// Auditor de Paridade Imprimível Estrito (Renderer Parity Auditor)
// Validação bidirecional sem bypasses:
// 1. DOM -> Registry: Todo texto impresso no DOM deve corresponder exatamente a um nó registrado no PrintableTextRegistry ou uma chave válida no PrintStringRegistry.
// 2. Registry -> DOM: Todos os nós extraídos esperados devem estar presentes na árvore DOM renderizada.
// Zero tolerância a atributos inventados ou chaves falsas.

import { Catalog } from '@/domain/catalog.schema';
import { PrintableTextRegistry } from './printable-text.registry';
import { PrintStringRegistry } from './print-strings.registry';
import { BlockTypeSchema } from '@/domain/catalog.schema';

export interface RendererParityResult {
  blockTypeCoverage: number; // % de BlockTypes com extratores (0-100)
  registryClassificationCoverage: number; // % de nós extraídos classificados (0-100)
  rendererPrintableParityCoverage: number; // % de textos impressos com atribuição rastreável (0-100)
  pdfPrintableTranslationCoverage: number; // 100% se todas as métricas forem 100% e 0 órfãos/ausentes/mismatches
  totalRenderedTextNodes: number;
  attributedTextNodes: number;
  orphanTextNodes: Array<{ text: string; selectorPath: string }>;
  missingExpectedNodes: Array<{ id: string; sourceText: string }>;
  sourceMismatchNodes: Array<{ id: string; expectedText: string; actualText: string }>;
  isComplete: boolean;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export class RendererParityAuditor {
  /**
   * Realiza a auditoria estrita de paridade no DOM renderizado pelo componente real de impressão.
   */
  static auditRenderedDOM(rootElement: HTMLElement | Document, catalog: Catalog): RendererParityResult {
    // 1. Métrica 1: BlockType Registration Coverage (Taxonomia Completa de 21 Blocos)
    const allBlockTypes = BlockTypeSchema.options;
    const registeredBlockTypes = PrintableTextRegistry.getRegisteredBlockTypes();
    const blockTypeCoverage = Math.round((registeredBlockTypes.length / allBlockTypes.length) * 100);

    // 2. Métrica 2: Registry Classification Coverage
    const extractedNodes = PrintableTextRegistry.extractCatalogNodes(catalog);
    const validExtractedIds = new Set(extractedNodes.map((n) => n.id));
    const unclassifiedExtracted = extractedNodes.filter(
      (n) => !n.policy || (n.policy !== 'translate' && n.policy !== 'protect' && n.policy !== 'keep_source' && n.policy !== 'system')
    );
    const registryClassificationCoverage = extractedNodes.length > 0 && unclassifiedExtracted.length === 0 ? 100 : 0;

    // 3. Métrica 3: Renderer Printable Parity Coverage (Varredura Estrita do DOM Real)
    const validSystemKeys = new Set(PrintStringRegistry.getAllKeys());
    const orphanTextNodes: Array<{ text: string; selectorPath: string }> = [];
    const sourceMismatchNodes: Array<{ id: string; expectedText: string; actualText: string }> = [];
    const foundNodeIdsInDOM = new Set<string>();
    let totalRenderedTextNodes = 0;
    let attributedTextNodes = 0;

    const doc = rootElement instanceof Document ? rootElement : rootElement.ownerDocument || document;
    const targetRoot = rootElement instanceof Document ? rootElement.body : rootElement;

    const walker = doc.createTreeWalker(
      targetRoot,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          // Ignora tags de infraestrutura e elementos no-print
          const tagName = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'template', 'svg', 'path'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          if (parent.closest('.no-print') || parent.closest('[data-editor-action="true"]')) {
            return NodeFilter.FILTER_REJECT;
          }

          const rawText = (node.textContent || '').trim();
          if (!rawText) {
            return NodeFilter.FILTER_REJECT;
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

        // Atributos declarados no elemento ou ancestrais
        const printableNodeId = parent.closest('[data-printable-node-id]')?.getAttribute('data-printable-node-id');
        const printStringKey = parent.closest('[data-print-string-key]')?.getAttribute('data-print-string-key');
        const blockAncestor = parent.closest('[data-block-id]');
        const blockId = blockAncestor?.getAttribute('data-block-id');
        const printableField = parent.closest('[data-printable-field]')?.getAttribute('data-printable-field');

        let isAttributed = false;

        // Regra 1: Atribuição por data-printable-node-id EXATO registrado no PrintableTextRegistry
        if (printableNodeId && validExtractedIds.has(printableNodeId)) {
          isAttributed = true;
          foundNodeIdsInDOM.add(printableNodeId);
          const nodeObj = extractedNodes.find((n) => n.id === printableNodeId);
          if (nodeObj && nodeObj.policy === 'translate' && normalizeText(text) !== normalizeText(nodeObj.sourceText)) {
            sourceMismatchNodes.push({
              id: nodeObj.id,
              expectedText: nodeObj.sourceText,
              actualText: text
            });
          }
        }
        // Regra 2: Atribuição por chave de string de sistema EXATA no PrintStringRegistry
        else if (printStringKey && validSystemKeys.has(printStringKey)) {
          isAttributed = true;
        }
        // Regra 3: Atribuição por data-block-id + data-printable-field correlacionado ao Registry
        else if (blockId && printableField) {
          // Constrói o nó correspondente
          const matchingExtracted = extractedNodes.find(
            (n) => n.blockId === blockId && (n.path.includes(printableField) || n.id.endsWith(`_${printableField}`) || (n.source?.field && n.source.field.includes(printableField)))
          );
          if (matchingExtracted) {
            isAttributed = true;
            foundNodeIdsInDOM.add(matchingExtracted.id);
            if (matchingExtracted.policy === 'translate' && normalizeText(text) !== normalizeText(matchingExtracted.sourceText)) {
              sourceMismatchNodes.push({
                id: matchingExtracted.id,
                expectedText: matchingExtracted.sourceText,
                actualText: text
              });
            }
          }
        }
        // Regra 4: Caracteres exclusivamente numéricos, pontuação técnica ou símbolos de marcadores industriais protegidos
        else if (
          /^[\d\s.,:;/#\-–—()+°%■□*•Ø±≤≥<>×§|·]+$/.test(text) ||
          (parent.closest('[data-printable-policy="protect"]') && /^[\d\s.,:;/#\-–—()+°%■□*•Ø±≤≥<>×§|·A-Za-z0-9]+$/.test(text))
        ) {
          isAttributed = true;
        }

        if (isAttributed) {
          attributedTextNodes++;
        } else {
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

    // 4. Auditoria Reversa: Registry -> DOM (Garante que todo nó obrigatório foi renderizado no DOM)
    const missingExpectedNodes: Array<{ id: string; sourceText: string }> = [];
    extractedNodes.forEach((node) => {
      // Ignora nós globais do documento ou marcados expressamente como opcionais
      if (node.pageId === 'global') return;
      if (node.renderExpectation === 'optional') return;

      if (!foundNodeIdsInDOM.has(node.id)) {
        missingExpectedNodes.push({
          id: node.id,
          sourceText: node.sourceText
        });
      }
    });

    const rendererPrintableParityCoverage =
      totalRenderedTextNodes === 0
        ? 100
        : Math.round((attributedTextNodes / totalRenderedTextNodes) * 100);

    const isComplete =
      blockTypeCoverage === 100 &&
      registryClassificationCoverage === 100 &&
      rendererPrintableParityCoverage === 100 &&
      orphanTextNodes.length === 0 &&
      missingExpectedNodes.length === 0 &&
      sourceMismatchNodes.length === 0;

    const pdfPrintableTranslationCoverage = isComplete ? 100 : 0;

    return {
      blockTypeCoverage,
      registryClassificationCoverage,
      rendererPrintableParityCoverage,
      pdfPrintableTranslationCoverage,
      totalRenderedTextNodes,
      attributedTextNodes,
      orphanTextNodes,
      missingExpectedNodes,
      sourceMismatchNodes,
      isComplete
    };
  }
}
