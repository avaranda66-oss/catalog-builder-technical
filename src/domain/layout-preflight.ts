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

export async function waitForLayoutPreflight(
  readCurrent: () => LayoutPreflightReport | null,
  timeoutMs = 8000
): Promise<LayoutPreflightReport> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = readCurrent();
    if (current) return current;
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
  return {
    canPublish: false,
    blockCount: 1,
    warnCount: 0,
    issues: [{
      code: 'LAYOUT_MEASUREMENT_MISSING',
      severity: 'block',
      message: 'A medição física do layout não convergiu dentro do prazo de publicação.'
    }]
  };
}

/**
 * Audita o plano de layout projetado para garantir qualidade e conformidade física de impressão A4.
 */
export function auditLayoutPreflight(
  catalog: Catalog,
  plan?: PageFlowPlan
): LayoutPreflightReport {
  const issues: LayoutPreflightIssue[] = [];

  // 1. Verificação Estática de Exclusividade de Capa e Formato dos Blocos
  catalog.pages.forEach((page, idx) => {
    const pageNumber = idx + 1;
    if (page.blocks !== undefined && page.blocks !== null && !Array.isArray(page.blocks)) {
      issues.push({
        code: 'MALFORMED_PAGE_BLOCKS',
        severity: 'block',
        pageNumber,
        message: `Página ${pageNumber} contém estrutura de blocos malformada (não é array).`
      });
      return;
    }
    const blocks = Array.isArray(page.blocks) ? page.blocks : [];
    const coverBlock = blocks.find((b) => b.type === 'full_page_cover');

    if (coverBlock && blocks.length > 1) {
      issues.push({
        code: 'COVER_EXCLUSIVITY_VIOLATION',
        severity: 'block',
        pageNumber,
        message: `Página ${pageNumber} contém uma Capa A4 exclusiva misturada com outros ${blocks.length - 1} blocos de conteúdo.`
      });
      issues.push({
        code: 'MIXED_FULL_PAGE_COVER',
        severity: 'block',
        pageNumber,
        message: `Página ${pageNumber} viola o contrato físico de capa exclusiva.`
      });
    }
  });

  // 2. A ausência de um plano físico atual nunca equivale a aprovação de layout.
  if (!plan) {
    issues.push({
      code: 'LAYOUT_MEASUREMENT_MISSING',
      severity: 'block',
      message: 'A publicação final exige um plano de layout derivado de medições físicas atuais.'
    });
  } else {
    const blockingPlanCodes = new Set([
      'VERTICAL_OVERFLOW',
      'UNRESOLVED_OVERSIZED_BLOCK',
      'UNRESOLVED_OVERSIZED_ROW',
      'LAYOUT_MEASUREMENT_MISSING',
      'ROW_CLIPPED',
      'TABLE_ROW_LOSS',
      'TABLE_ROW_DUPLICATION',
      'MALFORMED_TABLE_STRUCTURE',
      'MALFORMED_PAGE_BLOCKS',
      'LAYOUT_UNSTABLE'
    ]);

    for (const unres of plan.unresolvedIssues) {
      if (blockingPlanCodes.has(unres.code)) {
        issues.push({
          code: unres.code,
          severity: 'block',
          pageNumber: unres.pageNumber,
          message: unres.message
        });
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
      if (tPlan.hasDuplicateRowIds) {
        issues.push({
          code: 'TABLE_ROW_DUPLICATION',
          severity: 'block',
          tableId,
          message: `A tabela ${tableId} contém IDs canônicos duplicados: ${(tPlan.duplicateRowIds || []).join(', ')}.`
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
