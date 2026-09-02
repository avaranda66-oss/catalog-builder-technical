import { Catalog } from '@/domain/catalog.schema';
import { CoverageAuditResult } from './types';
import { PrintableTextRegistry } from './printable-text.registry';

export class CoverageAuditor {
  /**
   * Audita a cobertura completa de texto imprimível do catálogo.
   * Regra absoluta: unclassifiedCount MUST equal 0 para autorizar tradução.
   */
  static auditCatalog(catalog: Catalog): CoverageAuditResult {
    const nodes = PrintableTextRegistry.extractCatalogNodes(catalog);

    let translateCount = 0;
    let protectedCount = 0;
    let systemCount = 0;
    let unclassifiedCount = 0;

    for (const node of nodes) {
      if (node.source?.field === 'unclassified') {
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
  }
}
