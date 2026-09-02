// src/translation/coverage.auditor.ts
// Auditor Fail-Safe de Cobertura de Texto Imprimível para o Translation Center

import { Catalog } from '@/domain/catalog.schema';
import { CoverageAuditResult, PrintableTextNode } from './types';
import { PrintableTextRegistry } from './printable-text.registry';

export class CoverageAuditor {
  /**
   * Audita a cobertura completa de texto imprimível do catálogo.
   * Regra absoluta: unclassifiedCount MUST equal 0 e isComplete === true para autorizar tradução.
   * Nunca lança exceção para a UI.
   */
  static auditCatalog(catalog: Catalog): CoverageAuditResult {
    if (!catalog || typeof catalog !== 'object') {
      return {
        printableTextCount: 0,
        translateCount: 0,
        protectedCount: 0,
        systemCount: 0,
        unclassifiedCount: 0,
        nodes: [],
        isComplete: false
      };
    }

    try {
      const nodes: PrintableTextNode[] = PrintableTextRegistry.extractCatalogNodes(catalog);

      let translateCount = 0;
      let protectedCount = 0;
      let systemCount = 0;
      let unclassifiedCount = 0;

      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;

        if (node.source?.field === 'unclassified' || node.path === 'unclassified') {
          unclassifiedCount++;
        } else if (node.policy === 'translate') {
          translateCount++;
        } else if (node.policy === 'protect') {
          protectedCount++;
        } else if (node.policy === 'system') {
          systemCount++;
        }
      }

      const printableTextCount = nodes.length;
      const isComplete = unclassifiedCount === 0 && printableTextCount > 0;

      return {
        printableTextCount,
        translateCount,
        protectedCount,
        systemCount,
        unclassifiedCount,
        nodes,
        isComplete
      };
    } catch (err) {
      console.warn('[CoverageAuditor] Erro inesperado ao auditar catálogo:', err);
      return {
        printableTextCount: 0,
        translateCount: 0,
        protectedCount: 0,
        systemCount: 0,
        unclassifiedCount: 1,
        nodes: [],
        isComplete: false
      };
    }
  }
}
