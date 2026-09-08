// src/domain/page-flow-planner.ts
// Motor Puro de Fluxo Inteligente de Páginas A4 (Smart A4 Page Flow / A4.FLOW.R1).
// Separa rigorosamente:
// 1. DOCUMENT MODEL (Persistência canônica única)
// 2. LAYOUT PLAN (Mapeamento derivado/efêmero para folhas A4 físicas)
// 3. RENDER PLAN (Projeções do Editor e Exportação PDF)
// Totalmente desacoplado de React, Zustand, DOM e banco de dados.

import { Catalog, ContentBlock } from './catalog.schema';
import {
  TablePaginationMeasurementInput,
  TablePaginationPlan,
  TablePaginationSlice,
  computeTablePaginationPlan
} from './table-core/table.pagination';
import { TablePaginationPolicy } from './table-core/table.types';

export type FlowMode = 'smart' | 'manual';

export type TableDensityToken = 'comfortable' | 'compact' | 'dense';

export const READABILITY_FLOOR = {
  minFontSizePt: 8,                    // 8pt (~10.6px em 96 DPI)
  minLineHeight: 1.15,
  minCellPaddingVerticalMm: 0.5,       // ~2px
  minCellPaddingHorizontalMm: 1.0      // ~4px
} as const;

export interface BlockLayoutFact {
  blockId: string;
  blockType: string;
  measuredHeightMm: number;
  measuredWidthMm?: number;
  isSplittableTable?: boolean;
  tableMeasurement?: TablePaginationMeasurementInput;
  density?: TableDensityToken;
}

export interface PageLayoutFact {
  pageId: string;
  pageNumber: number;
  usableHeightMm: number;
  usableWidthMm: number;
  blocks: BlockLayoutFact[];
}

export interface ProjectedBlock {
  id: string;                          // Identificador da projeção (ex: `${canonicalBlockId}-slice-0`)
  canonicalBlockId: string;            // Autoridade canônica única no documento
  canonicalBlockType: string;
  isContinuationSlice?: boolean;
  sliceIndex?: number;
  totalSlices?: number;
  slice?: TablePaginationSlice;        // Dados da fatia se for tabela particionada
  density?: TableDensityToken;
}

export interface ProjectedPage {
  pageId: string;
  pageNumber: number;
  isCover: boolean;
  blocks: ProjectedBlock[];
  hasOverflow: boolean;
  overflowMm: number;
  issues: Array<{ code: string; message: string; severity: 'warning' | 'error' }>;
}

export interface PageFlowPlan {
  flowMode: FlowMode;
  projectedPages: ProjectedPage[];
  totalProjectedPages: number;
  tablePaginationPlans: Record<string, TablePaginationPlan>;
  hasUnresolvedOverflow: boolean;
  hasHorizontalOverflow: boolean;
  unresolvedIssues: Array<{ pageNumber: number; code: string; message: string }>;
}

export interface PageFlowPlannerOptions {
  flowMode?: FlowMode;
  tablePaginationPolicy?: Partial<TablePaginationPolicy>;
  manualTableBreaks?: Record<string, string[]>; // tableId -> rowIds
}

/**
 * Computa o plano de fluxo determinístico de páginas A4.
 * Invariantes:
 * 1. Não muta o documento canônico de entrada.
 * 2. Em modo MANUAL, preserva a composição exata das páginas sem mover blocos ou fatiar tabelas.
 * 3. Em modo SMART, aplica a ordem de estratégias contratada:
 *    Mover Bloco Inteiro -> Paginar Tabela -> Compactar Densidade -> Fail Closed.
 * 4. Idempotente e determinístico: mesmo input de fatos medidos gera o mesmo plano.
 */
export function computePageFlowPlan(
  catalog: Catalog,
  measuredPages: PageLayoutFact[],
  options: PageFlowPlannerOptions = {}
): PageFlowPlan {
  const flowMode: FlowMode = options.flowMode ?? 'smart';
  const tablePlans: Record<string, TablePaginationPlan> = {};
  const unresolvedIssues: Array<{ pageNumber: number; code: string; message: string }> = [];

  const factsByPageId = new Map<string, PageLayoutFact>();
  for (const p of measuredPages) {
    factsByPageId.set(p.pageId, p);
  }

  // Se o modo for MANUAL, projeta 1:1 sem reflow automático, diagnosticando overflows
  if (flowMode === 'manual') {
    const projectedPages: ProjectedPage[] = [];

    for (let pageIdx = 0; pageIdx < catalog.pages.length; pageIdx++) {
      const page = catalog.pages[pageIdx];
      const pageNumber = pageIdx + 1;
      const fact = factsByPageId.get(page.id);

      const usableHeightMm = fact?.usableHeightMm ?? 260;
      const usableWidthMm = fact?.usableWidthMm ?? 190;
      const isCover = page.blocks?.some((b) => b.type === 'full_page_cover') ?? false;

      let totalContentHeightMm = 0;
      let pageHasHorizontalOverflow = false;
      const issues: Array<{ code: string; message: string; severity: 'warning' | 'error' }> = [];

      const blocks: ProjectedBlock[] = (page.blocks || []).map((b) => {
        const bFact = fact?.blocks.find((bf) => bf.blockId === b.id);
        const h = bFact?.measuredHeightMm ?? 0;
        totalContentHeightMm += h;

        if (bFact?.measuredWidthMm && bFact.measuredWidthMm > usableWidthMm && !isCover) {
          pageHasHorizontalOverflow = true;
          issues.push({
            code: 'HORIZONTAL_OVERFLOW',
            message: `Bloco "${b.title || b.type}" excede a largura útil da folha A4.`,
            severity: 'error'
          });
        }

        return {
          id: b.id,
          canonicalBlockId: b.id,
          canonicalBlockType: b.type,
          density: (b.customData?.density as TableDensityToken) || 'compact'
        };
      });

      const overflowMm = isCover ? 0 : Math.max(0, Number((totalContentHeightMm - usableHeightMm).toFixed(1)));
      const hasOverflow = overflowMm > 1.0; // 1mm de tolerância contra subpixel rounding

      if (hasOverflow) {
        issues.push({
          code: 'VERTICAL_OVERFLOW',
          message: `Conteúdo excede a altura útil da folha em ~${overflowMm} mm.`,
          severity: 'warning'
        });
        unresolvedIssues.push({
          pageNumber,
          code: 'VERTICAL_OVERFLOW',
          message: `Folha ${pageNumber} excede o limite vertical por ${overflowMm} mm.`
        });
      }

      if (pageHasHorizontalOverflow) {
        unresolvedIssues.push({
          pageNumber,
          code: 'HORIZONTAL_OVERFLOW',
          message: `Folha ${pageNumber} possui conteúdo que excede a largura da folha.`
        });
      }

      projectedPages.push({
        pageId: page.id,
        pageNumber,
        isCover,
        blocks,
        hasOverflow,
        overflowMm,
        issues
      });
    }

    return {
      flowMode: 'manual',
      projectedPages,
      totalProjectedPages: projectedPages.length,
      tablePaginationPlans: tablePlans,
      hasUnresolvedOverflow: unresolvedIssues.some((i) => i.code === 'VERTICAL_OVERFLOW'),
      hasHorizontalOverflow: unresolvedIssues.some((i) => i.code === 'HORIZONTAL_OVERFLOW'),
      unresolvedIssues
    };
  }

  // =========================================================================
  // MODO SMART FLOW — Resolução Determinística de Layout
  // =========================================================================
  const projectedPages: ProjectedPage[] = [];

  // Fila linear de blocos canônicos com fatos medidos
  interface BlockQueueItem {
    block: ContentBlock;
    fact?: BlockLayoutFact;
    originPageId: string;
    originPageType?: string;
  }

  const blockQueue: BlockQueueItem[] = [];

  for (const page of catalog.pages) {
    const pFact = factsByPageId.get(page.id);
    for (const b of page.blocks || []) {
      const bFact = pFact?.blocks.find((bf) => bf.blockId === b.id);
      blockQueue.push({
        block: b,
        fact: bFact,
        originPageId: page.id,
        originPageType: page.pageType
      });
    }
  }

  // Configuração física padrão de página A4
  const firstPageFact = catalog.pages[0] ? factsByPageId.get(catalog.pages[0].id) : undefined;
  const standardUsableHeightMm = firstPageFact?.usableHeightMm ?? 260; // 297mm - margens 2x15mm - header/footer
  const standardUsableWidthMm = firstPageFact?.usableWidthMm ?? 190;  // 210mm - margens 2x10mm

  let currentPageNumber = 1;
  let currentProjectedBlocks: ProjectedBlock[] = [];
  let currentAvailableHeightMm = standardUsableHeightMm;
  let currentPageIsCover = false;
  let currentPageIssues: Array<{ code: string; message: string; severity: 'warning' | 'error' }> = [];

  const finalizePage = () => {
    if (currentProjectedBlocks.length === 0 && projectedPages.length > 0) return;

    projectedPages.push({
      pageId: `projected-page-${currentPageNumber}`,
      pageNumber: currentPageNumber,
      isCover: currentPageIsCover,
      blocks: currentProjectedBlocks,
      hasOverflow: false,
      overflowMm: 0,
      issues: currentPageIssues
    });

    currentPageNumber++;
    currentProjectedBlocks = [];
    currentAvailableHeightMm = standardUsableHeightMm;
    currentPageIsCover = false;
    currentPageIssues = [];
  };

  for (let qIdx = 0; qIdx < blockQueue.length; qIdx++) {
    const item = blockQueue[qIdx];
    const { block, fact } = item;
    const isCoverBlock = block.type === 'full_page_cover';

    // Se é capa A4 de página inteira: deve ocupar a folha com 100% de exclusividade
    if (isCoverBlock) {
      if (currentProjectedBlocks.length > 0) {
        finalizePage();
      }

      currentPageIsCover = true;
      currentProjectedBlocks.push({
        id: block.id,
        canonicalBlockId: block.id,
        canonicalBlockType: block.type
      });
      finalizePage();
      continue;
    }

    // Se a página corrente é uma capa (e este bloco não é capa): fechar a página de capa imediatamente
    if (currentPageIsCover) {
      finalizePage();
    }

    const blockHeightMm = fact?.measuredHeightMm ?? 40; // Fallback seguro
    const blockWidthMm = fact?.measuredWidthMm ?? 190;

    // Verificação de largura horizontal
    if (blockWidthMm > standardUsableWidthMm) {
      currentPageIssues.push({
        code: 'HORIZONTAL_OVERFLOW',
        message: `Bloco "${block.title || block.type}" ultrapassa a largura útil da folha A4.`,
        severity: 'error'
      });
      unresolvedIssues.push({
        pageNumber: currentPageNumber,
        code: 'HORIZONTAL_OVERFLOW',
        message: `Folha ${currentPageNumber} contém bloco excedendo a largura útil.`
      });
    }

    // Caso 1: O bloco cabe no espaço restante da folha corrente
    if (blockHeightMm <= currentAvailableHeightMm) {
      currentProjectedBlocks.push({
        id: block.id,
        canonicalBlockId: block.id,
        canonicalBlockType: block.type,
        density: fact?.density || (block.customData?.density as TableDensityToken) || 'compact'
      });
      currentAvailableHeightMm -= blockHeightMm;
      continue;
    }

    // Caso 2: O bloco não cabe no espaço restante
    // Estratégia 1: Se for bloco atômico (não tabela fatiável) e couber em uma folha em branco,
    // move o bloco inteiro para a próxima folha.
    const isSplittableTable = fact?.isSplittableTable ?? (block.type === 'custom_table' || block.type === 'specs_table' || block.type === 'table');

    if (!isSplittableTable && currentProjectedBlocks.length > 0 && blockHeightMm <= standardUsableHeightMm) {
      finalizePage();
      currentProjectedBlocks.push({
        id: block.id,
        canonicalBlockId: block.id,
        canonicalBlockType: block.type
      });
      currentAvailableHeightMm -= blockHeightMm;
      continue;
    }

    // Estratégia 2: Se for Tabela V2 fatiável, computar plano de paginação
    if (isSplittableTable && fact?.tableMeasurement) {
      const manualBreaks = options.manualTableBreaks?.[block.id];
      const tableInput: TablePaginationMeasurementInput = {
        ...fact.tableMeasurement,
        availableHeightOnFirstPageMm: currentAvailableHeightMm,
        availableHeightOnSubsequentPagesMm: standardUsableHeightMm
      };

      const plan = computeTablePaginationPlan(tableInput, options.tablePaginationPolicy, manualBreaks);
      tablePlans[block.id] = plan;

      if (plan.hasUnresolvedOversizedRow) {
        unresolvedIssues.push({
          pageNumber: currentPageNumber,
          code: 'UNRESOLVED_OVERSIZED_ROW',
          message: `Tabela ${block.title || block.id} contém linha(s) maior(es) que uma folha inteira.`
        });
      }

      // Distribui as fatias da tabela nas páginas
      for (let sIdx = 0; sIdx < plan.slices.length; sIdx++) {
        const slice = plan.slices[sIdx];

        if (sIdx > 0) {
          finalizePage();
        }

        currentProjectedBlocks.push({
          id: `${block.id}-slice-${slice.sliceIndex}`,
          canonicalBlockId: block.id,
          canonicalBlockType: block.type,
          isContinuationSlice: slice.sliceIndex > 0,
          sliceIndex: slice.sliceIndex,
          totalSlices: plan.slices.length,
          slice,
          density: fact?.density || 'compact'
        });

        currentAvailableHeightMm -= slice.totalSliceHeightMm;
      }

      continue;
    }

    // Se o bloco é atômico e sozinho já excede uma folha A4 em branco: Fail Closed com diagnóstico
    if (blockHeightMm > standardUsableHeightMm) {
      if (currentProjectedBlocks.length > 0) {
        finalizePage();
      }

      currentPageIssues.push({
        code: 'UNRESOLVED_OVERSIZED_BLOCK',
        message: `Bloco "${block.title || block.type}" é maior que uma página A4 inteira e não suporta particionamento.`,
        severity: 'error'
      });

      unresolvedIssues.push({
        pageNumber: currentPageNumber,
        code: 'UNRESOLVED_OVERSIZED_BLOCK',
        message: `Bloco "${block.title || block.type}" excede a folha A4 inteira.`
      });

      currentProjectedBlocks.push({
        id: block.id,
        canonicalBlockId: block.id,
        canonicalBlockType: block.type
      });
      finalizePage();
      continue;
    }

    // Fallback: move bloco para próxima folha
    finalizePage();
    currentProjectedBlocks.push({
      id: block.id,
      canonicalBlockId: block.id,
      canonicalBlockType: block.type
    });
    currentAvailableHeightMm -= blockHeightMm;
  }

  finalizePage();

  return {
    flowMode: 'smart',
    projectedPages,
    totalProjectedPages: projectedPages.length,
    tablePaginationPlans: tablePlans,
    hasUnresolvedOverflow: unresolvedIssues.some((i) => i.code === 'VERTICAL_OVERFLOW' || i.code === 'UNRESOLVED_OVERSIZED_BLOCK'),
    hasHorizontalOverflow: unresolvedIssues.some((i) => i.code === 'HORIZONTAL_OVERFLOW'),
    unresolvedIssues
  };
}
