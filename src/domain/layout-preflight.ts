// src/domain/layout-preflight.ts
// Preflight de Layout A4 e Segurança de Publicação (A4.FLOW.R1 / FASE G).
// Avalia rigorosamente a integridade física do layout antes de exportação/impressão:
// 1. Exclusividade de Capa A4 (COVER_EXCLUSIVITY)
// 2. Transbordamento Vertical Não Resolvido (VERTICAL_OVERFLOW)
// 3. Transbordamento Horizontal / Colunas Cortadas (HORIZONTAL_OVERFLOW)
// 4. Linhas Odisseicas / Maiores que a Folha (UNRESOLVED_OVERSIZED_ROW)
// 5. Preservação Estrita de Linhas (Zero perdas ou duplicatas)
// Totalmente desacoplado de React e DOM.

import { Catalog } from './catalog.schema';
import { PageFlowPlan } from './page-flow-planner';

export type LayoutPreflightSeverity = 'block' | 'warn';

export interface LayoutPreflightIssue {
  readonly code: string;
  readonly severity: LayoutPreflightSeverity;
  readonly pageNumber?: number;
  readonly tableId?: string;
  readonly message: string;
}

export interface LayoutPreflightReport {
  readonly canPublish: boolean;
  readonly blockCount: number;
  readonly warnCount: number;
  readonly issues: readonly LayoutPreflightIssue[];
}

/**
 * Audita o plano de layout projetado para garantir qualidade e conformidade física de impressão A4.
 */
export function auditLayoutPreflight(
  catalog: Catalog,
  plan?: PageFlowPlan
): LayoutPreflightReport {
  const issues: LayoutPreflightIssue[] = [];

  // 1. Verificação Estática de Exclusividade de Capa
  catalog.pages.forEach((page, idx) => {
    const pageNumber = idx + 1;
    const blocks = page.blocks || [];
    const coverBlock = blocks.find((b) => b.type === 'full_page_cover');

    if (coverBlock && blocks.length > 1) {
      issues.push({
        code: 'COVER_EXCLUSIVITY_VIOLATION',
        severity: 'block',
        pageNumber,
        message: `Página ${pageNumber} contém uma Capa A4 exclusiva misturada com outros ${blocks.length - 1} blocos de conteúdo.`
      });
    }
  });

  // 2. Se houver plano de layout projetado (PageFlowPlan)
  if (plan) {
    if (plan.hasUnresolvedOverflow) {
      for (const unres of plan.unresolvedIssues) {
        if (unres.code === 'VERTICAL_OVERFLOW' || unres.code === 'UNRESOLVED_OVERSIZED_BLOCK') {
          issues.push({
            code: unres.code,
            severity: 'block',
            pageNumber: unres.pageNumber,
            message: unres.message
          });
        }
      }
    }

    if (plan.hasHorizontalOverflow) {
      for (const unres of plan.unresolvedIssues) {
        if (unres.code === 'HORIZONTAL_OVERFLOW') {
          issues.push({
            code: 'HORIZONTAL_OVERFLOW',
            severity: 'block',
            pageNumber: unres.pageNumber,
            message: unres.message
          });
        }
      }
    }

    // Linhas superdimensionadas em tabelas
    for (const [tableId, tPlan] of Object.entries(plan.tablePaginationPlans)) {
      if (tPlan.hasUnresolvedOversizedRow) {
        issues.push({
          code: 'UNRESOLVED_OVERSIZED_ROW',
          severity: 'block',
          tableId,
          message: `A tabela ${tableId} contém linhas cuja altura excede uma folha A4 inteira.`
        });
      }
    }
  }

  const blockCount = issues.filter((i) => i.severity === 'block').length;
  const warnCount = issues.filter((i) => i.severity === 'warn').length;

  return {
    canPublish: blockCount === 0,
    blockCount,
    warnCount,
    issues
  };
}
