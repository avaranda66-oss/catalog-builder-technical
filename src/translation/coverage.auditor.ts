// src/translation/coverage.auditor.ts
// Auditor Fail-Safe de Cobertura de Texto Imprimível para o Translation Center

import { Catalog } from '@/domain/catalog.schema';
import { CoverageAuditResult, PrintableLocalizationMetrics, PrintableTextNode, TranslationApplierResult } from './types';
import { PrintableTextRegistry } from './printable-text.registry';
import { PrintStringRegistry } from './print-strings.registry';

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

  /**
   * Avalia as 4 métricas rigorosas de completude de localização:
   * 1. Printable Mapping (100% dos nós mapeados e classificados)
   * 2. Translation Applied (100% dos nós editoriais traduzidos aplicados)
   * 3. System Localization (100% das strings de sistema resolvidas no idioma target)
   * 4. Protected Integrity (100% dos nós de proteção inalterados)
   * 5. Unclassified printable = 0
   */
  static evaluateLocalizationCompleteness(
    sourceCatalog: Catalog,
    targetCatalog: Catalog,
    appliedResult?: TranslationApplierResult
  ): PrintableLocalizationMetrics {
    const audit = this.auditCatalog(sourceCatalog);
    const targetNodes = PrintableTextRegistry.extractCatalogNodes(targetCatalog);
    const targetNodeMap = new Map<string, PrintableTextNode>(targetNodes.map((n) => [n.id, n]));

    // 1. Printable Mapping: porcentagem de nós que não são 'unclassified'
    const printableMappingPercent =
      audit.printableTextCount > 0 && audit.unclassifiedCount === 0
        ? 100
        : audit.printableTextCount > 0
        ? Math.max(0, Math.round(((audit.printableTextCount - audit.unclassifiedCount) / audit.printableTextCount) * 100))
        : 0;

    // 2. Translation Applied: nós traduzidos aplicados sem pendências
    let translationAppliedPercent = 100;
    if (appliedResult) {
      const totalToApply = appliedResult.appliedCount + appliedResult.unappliedCount;
      translationAppliedPercent =
        totalToApply === 0 || appliedResult.unappliedCount === 0
          ? 100
          : Math.max(0, Math.round((appliedResult.appliedCount / totalToApply) * 100));
    }

    // 3. System Localization: verifica se o target locale possui strings de sistema registradas
    const targetLocale = targetCatalog.locale || 'pt-BR';
    let systemLocalizationPercent = 100;
    const requiredSystemKeys = ['legend_title', 'legend_filled_square', 'legend_empty_square', 'legend_dash', 'page_label'];
    let resolvedSystemKeys = 0;
    for (const key of requiredSystemKeys) {
      const fromDoc = targetCatalog.localizedSystemStrings?.[key];
      const fromReg = PrintStringRegistry.get(key, targetLocale);
      if (fromDoc || (fromReg && fromReg !== key)) {
        resolvedSystemKeys++;
      }
    }
    systemLocalizationPercent = Math.round((resolvedSystemKeys / requiredSystemKeys.length) * 100);

    // 4. Protected Integrity: verifica se nós com policy 'protect' continuam idênticos
    let protectedMatches = 0;
    let totalProtected = 0;
    for (const sourceNode of audit.nodes) {
      if (sourceNode.policy === 'protect') {
        totalProtected++;
        const targetNode = targetNodeMap.get(sourceNode.id);
        if (targetNode && targetNode.sourceText === sourceNode.sourceText) {
          protectedMatches++;
        }
      }
    }
    const protectedIntegrityPercent =
      totalProtected === 0 ? 100 : Math.round((protectedMatches / totalProtected) * 100);

    const unclassifiedPrintableCount = audit.unclassifiedCount;

    const isFullyLocalized =
      printableMappingPercent === 100 &&
      translationAppliedPercent === 100 &&
      systemLocalizationPercent === 100 &&
      protectedIntegrityPercent === 100 &&
      unclassifiedPrintableCount === 0;

    return {
      printableMappingPercent,
      translationAppliedPercent,
      systemLocalizationPercent,
      protectedIntegrityPercent,
      unclassifiedPrintableCount,
      isFullyLocalized
    };
  }
}
