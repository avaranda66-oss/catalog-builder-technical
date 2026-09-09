import type { Catalog, CatalogPage, ContentBlock } from './catalog.schema';
import { getPageContentBox } from './page-geometry';
import {
  type TablePaginationMeasurementInput,
  type TablePaginationPlan,
  type TablePaginationSlice,
  computeTablePaginationPlan
} from './table-core/table.pagination';
import type { TablePaginationPolicy } from './table-core/table.types';

export type FlowMode = 'smart' | 'manual';
export type TableDensityToken = 'comfortable' | 'compact' | 'dense';

export const READABILITY_FLOOR = {
  minFontSizePt: 8,
  minLineHeight: 1.15,
  minCellPaddingVerticalMm: 0.5,
  minCellPaddingHorizontalMm: 1
} as const;

/** R1.1 does not advertise density selection without measured candidates. */
export const COMPACTION_DEFERRED = true as const;

export type PageFlowIssueCode =
  | 'MIXED_FULL_PAGE_COVER'
  | 'VERTICAL_OVERFLOW'
  | 'HORIZONTAL_OVERFLOW'
  | 'UNRESOLVED_OVERSIZED_BLOCK'
  | 'UNRESOLVED_OVERSIZED_ROW'
  | 'LAYOUT_MEASUREMENT_MISSING'
  | 'ROW_CLIPPED'
  | 'TABLE_ROW_LOSS'
  | 'TABLE_ROW_DUPLICATION'
  | 'MALFORMED_TABLE_STRUCTURE'
  | 'MALFORMED_PAGE_BLOCKS';

export interface BlockLayoutFact {
  blockId: string;
  blockType: string;
  measuredHeightMm?: number;
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
  /** Actual residual spacing between root block boxes in the printable flow. */
  blockGapMm?: number;
  blocks: BlockLayoutFact[];
}

export interface ProjectedBlock {
  id: string;
  canonicalPageId: string;
  canonicalBlockId: string;
  canonicalBlockType: string;
  isContinuationSlice?: boolean;
  sliceIndex?: number;
  totalSlices?: number;
  slice?: TablePaginationSlice;
  density?: TableDensityToken;
}

export interface ProjectedPage {
  pageId: string;
  canonicalPageId: string;
  pageNumber: number;
  isCover: boolean;
  isDerivedContinuation: boolean;
  blocks: ProjectedBlock[];
  hasOverflow: boolean;
  overflowMm: number;
  issues: Array<{ code: PageFlowIssueCode; message: string; severity: 'warning' | 'error' }>;
}

export interface PageFlowPlan {
  flowMode: FlowMode;
  projectedPages: ProjectedPage[];
  totalProjectedPages: number;
  tablePaginationPlans: Record<string, TablePaginationPlan>;
  measurementStatus: 'ready' | 'missing';
  hasUnresolvedOverflow: boolean;
  hasHorizontalOverflow: boolean;
  unresolvedIssues: Array<{ pageNumber: number; code: PageFlowIssueCode; message: string }>;
}

export interface PageFlowPlannerOptions {
  flowMode?: FlowMode;
  tablePaginationPolicy?: Partial<TablePaginationPolicy>;
  manualTableBreaks?: Record<string, string[]>;
}

const TECHNICAL_CONTENT_BOX = getPageContentBox();
const DEFAULT_TECHNICAL_HEIGHT_MM = TECHNICAL_CONTENT_BOX.availableHeightMm;
const DEFAULT_TECHNICAL_WIDTH_MM = TECHNICAL_CONTENT_BOX.availableWidthMm;
const TOLERANCE_MM = 1;

const isTableBlock = (block: ContentBlock, fact?: BlockLayoutFact) =>
  fact?.isSplittableTable ?? ['custom_table', 'specs_table', 'table'].includes(block.type);

const densityFor = (block: ContentBlock, fact?: BlockLayoutFact): TableDensityToken => {
  const requested = fact?.density ?? block.customData?.density;
  return requested === 'comfortable' || requested === 'dense' || requested === 'compact'
    ? requested
    : 'compact';
};

const manualBreaksFor = (block: ContentBlock, options: PageFlowPlannerOptions): string[] => {
  const rawBreaks = options.manualTableBreaks?.[block.id] ?? (block.customData?.manualBreakRowIds as string[] | undefined) ?? [];
  const existingRowIds = new Set(block.tableRows?.map((r) => r.id) ?? []);
  return rawBreaks.filter((rowId: string) => existingRowIds.has(rowId));
};

const projectedBlock = (
  canonicalPageId: string,
  block: ContentBlock,
  fact?: BlockLayoutFact,
  slice?: TablePaginationSlice,
  totalSlices?: number
): ProjectedBlock => ({
  id: slice ? `flow:${canonicalPageId}:${block.id}:slice:${slice.sliceIndex}` : block.id,
  canonicalPageId,
  canonicalBlockId: block.id,
  canonicalBlockType: block.type,
  isContinuationSlice: Boolean(slice && slice.sliceIndex > 0),
  sliceIndex: slice?.sliceIndex,
  totalSlices,
  slice,
  density: densityFor(block, fact)
});

/**
 * Pure page-flow authority. Authored page boundaries are preserved; only overflow generated
 * inside an authored page creates deterministic view-only continuation pages.
 */
export function computePageFlowPlan(
  catalog: Catalog,
  measuredPages: PageLayoutFact[],
  options: PageFlowPlannerOptions = {}
): PageFlowPlan {
  const flowMode: FlowMode = options.flowMode ?? catalog.layoutFlowMode ?? 'smart';
  const factsByPageId = new Map(measuredPages.map((fact) => [fact.pageId, fact]));
  const tablePaginationPlans: Record<string, TablePaginationPlan> = {};
  const projectedPages: ProjectedPage[] = [];
  const unresolvedIssues: PageFlowPlan['unresolvedIssues'] = [];

  const addUnresolved = (pageNumber: number, code: PageFlowIssueCode, message: string) => {
    if (!unresolvedIssues.some((issue) => issue.pageNumber === pageNumber && issue.code === code && issue.message === message)) {
      unresolvedIssues.push({ pageNumber, code, message });
    }
  };

  if (flowMode === 'manual') {
    for (let pageIndex = 0; pageIndex < catalog.pages.length; pageIndex += 1) {
      const page = catalog.pages[pageIndex];
      const fact = factsByPageId.get(page.id);
      const pageBlocks = Array.isArray(page.blocks) ? page.blocks : [];
      const isCover = pageBlocks.some((block) => block.type === 'full_page_cover');
      const usableHeightMm = fact?.usableHeightMm ?? (isCover ? 297 : DEFAULT_TECHNICAL_HEIGHT_MM);
      const usableWidthMm = fact?.usableWidthMm ?? (isCover ? 210 : DEFAULT_TECHNICAL_WIDTH_MM);
      const blockGapMm = fact?.blockGapMm ?? 0;
      let currentBlocks: ProjectedBlock[] = [];
      let currentIssues: ProjectedPage['issues'] = [];
      let contentHeightMm = 0;
      let continuationIndex = 0;
      let continuationAnchor = pageBlocks[0]?.id ?? 'empty';

      const finishManualPage = () => {
        const physicalPageNumber = projectedPages.length + 1;
        const overflowMm = isCover ? 0 : Math.max(0, Number((contentHeightMm - usableHeightMm).toFixed(2)));
        const hasOverflow = overflowMm > TOLERANCE_MM;
        if (hasOverflow) {
          const message = `Folha ${physicalPageNumber} excede o limite vertical por ${overflowMm} mm.`;
          currentIssues.push({ code: 'VERTICAL_OVERFLOW', message, severity: 'error' });
          addUnresolved(physicalPageNumber, 'VERTICAL_OVERFLOW', message);
        }
        projectedPages.push({
          pageId: continuationIndex === 0 ? page.id : `flow:${page.id}:${continuationAnchor}:${continuationIndex}`,
          canonicalPageId: page.id,
          pageNumber: physicalPageNumber,
          isCover,
          isDerivedContinuation: continuationIndex > 0,
          blocks: currentBlocks,
          hasOverflow,
          overflowMm,
          issues: currentIssues
        });
        continuationIndex += 1;
        currentBlocks = [];
        currentIssues = [];
        contentHeightMm = 0;
      };

      if (!Array.isArray(page.blocks)) {
        const message = `Folha ${projectedPages.length + 1} contém blocos em formato inválido.`;
        currentIssues.push({ code: 'MALFORMED_PAGE_BLOCKS', message, severity: 'error' });
        addUnresolved(projectedPages.length + 1, 'MALFORMED_PAGE_BLOCKS', message);
      }

      if (!fact && pageBlocks.length > 0) {
        const message = `Folha ${projectedPages.length + 1} ainda não possui medição física atual.`;
        currentIssues.push({ code: 'LAYOUT_MEASUREMENT_MISSING', message, severity: 'error' });
        addUnresolved(projectedPages.length + 1, 'LAYOUT_MEASUREMENT_MISSING', message);
      }

      pageBlocks.forEach((block) => {
        const blockFact = fact?.blocks.find((candidate) => candidate.blockId === block.id);
        continuationAnchor = block.id;
        const gapMm = currentBlocks.length > 0 ? blockGapMm : 0;
        if (blockFact?.measuredHeightMm == null) {
          const message = `Bloco "${block.title || block.type}" ainda não possui medição física atual.`;
          currentIssues.push({ code: 'LAYOUT_MEASUREMENT_MISSING', message, severity: 'error' });
          addUnresolved(projectedPages.length + 1, 'LAYOUT_MEASUREMENT_MISSING', message);
          currentBlocks.push(projectedBlock(page.id, block, blockFact));
          return;
        }

        if (!isCover && blockFact?.measuredWidthMm != null && blockFact.measuredWidthMm > usableWidthMm + TOLERANCE_MM) {
          const message = `Bloco "${block.title || block.type}" excede a largura útil da folha A4.`;
          currentIssues.push({ code: 'HORIZONTAL_OVERFLOW', message, severity: 'error' });
          addUnresolved(projectedPages.length + 1, 'HORIZONTAL_OVERFLOW', message);
        }

        const manualBreaks = manualBreaksFor(block, options);
        if (isTableBlock(block, blockFact) && blockFact.tableMeasurement) {
          const firstPageAvailableMm = Math.max(0, usableHeightMm - contentHeightMm - gapMm);
          const tablePlan = computeTablePaginationPlan(
            {
              ...blockFact.tableMeasurement,
              availableHeightOnFirstPageMm: firstPageAvailableMm,
              availableHeightOnSubsequentPagesMm: usableHeightMm
            },
            { autoSplitOnOverflow: false, ...options.tablePaginationPolicy },
            manualBreaks
          );
          tablePaginationPlans[block.id] = tablePlan;

          if (tablePlan.hasUnresolvedOversizedRow) {
            const message = `Tabela ${block.title || block.id} contém linha maior que uma folha técnica.`;
            currentIssues.push({ code: 'UNRESOLVED_OVERSIZED_ROW', message, severity: 'error' });
            addUnresolved(projectedPages.length + 1, 'UNRESOLVED_OVERSIZED_ROW', message);
          }
          if (tablePlan.hasDuplicateRowIds) {
            const message = `Tabela ${block.title || block.id} contém IDs de linha canônica duplicados.`;
            currentIssues.push({ code: 'TABLE_ROW_DUPLICATION', message, severity: 'error' });
            addUnresolved(projectedPages.length + 1, 'TABLE_ROW_DUPLICATION', message);
          }
          if (tablePlan.hasMalformedTerminalSection) {
            const message = `Tabela ${block.title || block.id} contém seção terminal sem linhas subordinadas.`;
            currentIssues.push({ code: 'MALFORMED_TABLE_STRUCTURE', message, severity: 'error' });
            addUnresolved(projectedPages.length + 1, 'MALFORMED_TABLE_STRUCTURE', message);
          }

          if (tablePlan.slices.length === 0) {
            // P1-E: Block conservation - an authored empty table must still project as a block
            contentHeightMm += Math.max(0, blockFact.measuredHeightMm) + gapMm;
            currentBlocks.push(projectedBlock(page.id, block, blockFact));
          } else {
            tablePlan.slices.forEach((slice, sliceIndex) => {
              if (sliceIndex > 0) finishManualPage();
              currentBlocks.push(projectedBlock(page.id, block, blockFact, slice, tablePlan.slices.length));
              contentHeightMm += slice.totalSliceHeightMm + (sliceIndex === 0 ? gapMm : 0);
            });
          }
          return;
        }

        contentHeightMm += Math.max(0, blockFact.measuredHeightMm) + gapMm;
        currentBlocks.push(projectedBlock(page.id, block, blockFact));
      });

      finishManualPage();
    }
  } else {
    for (const page of catalog.pages) planSmartAuthoredPage(page);
  }

  function planSmartAuthoredPage(page: CatalogPage) {
    const fact = factsByPageId.get(page.id);
    const pageBlocks = Array.isArray(page.blocks) ? page.blocks : [];
    const pageHasCover = pageBlocks.some((block) => block.type === 'full_page_cover');
    const usableHeightMm = fact?.usableHeightMm ?? (pageHasCover ? 297 : DEFAULT_TECHNICAL_HEIGHT_MM);
    const usableWidthMm = fact?.usableWidthMm ?? (pageHasCover ? 210 : DEFAULT_TECHNICAL_WIDTH_MM);
    const technicalFact = measuredPages.find((candidate) => candidate.pageId !== page.id && candidate.usableWidthMm < 210);
    const technicalHeightMm = page.pageType === 'cover' ? (technicalFact?.usableHeightMm ?? DEFAULT_TECHNICAL_HEIGHT_MM) : usableHeightMm;
    const technicalWidthMm = page.pageType === 'cover' ? (technicalFact?.usableWidthMm ?? DEFAULT_TECHNICAL_WIDTH_MM) : usableWidthMm;
    const blockGapMm = fact?.blockGapMm ?? 0;
    let currentBlocks: ProjectedBlock[] = [];
    let currentIssues: ProjectedPage['issues'] = [];
    let currentAvailableMm = pageHasCover ? usableHeightMm : technicalHeightMm;
    let currentIsCover = false;
    let continuationIndex = 0;
    let continuationAnchor = pageBlocks[0]?.id ?? 'empty';

    const finishPage = () => {
      if (currentBlocks.length === 0 && pageBlocks.length > 0) return;
      const isDerivedContinuation = continuationIndex > 0;
      projectedPages.push({
        pageId: isDerivedContinuation ? `flow:${page.id}:${continuationAnchor}:${continuationIndex}` : page.id,
        canonicalPageId: page.id,
        pageNumber: projectedPages.length + 1,
        isCover: currentIsCover,
        isDerivedContinuation,
        blocks: currentBlocks,
        hasOverflow: currentIssues.some((issue) => issue.code === 'VERTICAL_OVERFLOW' || issue.code.startsWith('UNRESOLVED_')),
        overflowMm: 0,
        issues: currentIssues
      });
      continuationIndex += 1;
      currentBlocks = [];
      currentIssues = [];
      currentAvailableMm = technicalHeightMm;
      currentIsCover = false;
    };

    if (!Array.isArray(page.blocks)) {
      const message = `Folha ${projectedPages.length + 1} contém blocos em formato inválido.`;
      currentIssues.push({ code: 'MALFORMED_PAGE_BLOCKS', message, severity: 'error' });
      addUnresolved(projectedPages.length + 1, 'MALFORMED_PAGE_BLOCKS', message);
    }

    if (pageBlocks.length === 0) {
      finishPage();
      return;
    }

    if (!fact) {
      addUnresolved(projectedPages.length + 1, 'LAYOUT_MEASUREMENT_MISSING', `Folha autoral "${page.title || page.id}" ainda não possui medição física atual.`);
    }

    for (const block of pageBlocks) {
      const blockFact = fact?.blocks.find((candidate) => candidate.blockId === block.id);
      continuationAnchor = block.id;

      if (block.type === 'full_page_cover') {
        if (currentBlocks.length > 0) finishPage();
        currentIsCover = true;
        currentBlocks.push(projectedBlock(page.id, block, blockFact));
        finishPage();
        continue;
      }

      const targetPageNumber = projectedPages.length + 1;
      if (blockFact?.measuredHeightMm == null) {
        const message = `Bloco "${block.title || block.type}" ainda não possui medição física atual.`;
        currentIssues.push({ code: 'LAYOUT_MEASUREMENT_MISSING', message, severity: 'error' });
        addUnresolved(targetPageNumber, 'LAYOUT_MEASUREMENT_MISSING', message);
        currentBlocks.push(projectedBlock(page.id, block, blockFact));
        continue;
      }

      if (blockFact.measuredWidthMm != null && blockFact.measuredWidthMm > technicalWidthMm + TOLERANCE_MM) {
        const message = `Bloco "${block.title || block.type}" ultrapassa a largura útil da folha A4.`;
        currentIssues.push({ code: 'HORIZONTAL_OVERFLOW', message, severity: 'error' });
        addUnresolved(targetPageNumber, 'HORIZONTAL_OVERFLOW', message);
      }

      const gapMm = currentBlocks.length > 0 ? blockGapMm : 0;
      const blockHeightMm = Math.max(0, blockFact.measuredHeightMm);
      const breaks = manualBreaksFor(block, options);
      const mustPaginate = isTableBlock(block, blockFact) && Boolean(blockFact.tableMeasurement) && (blockHeightMm + gapMm > currentAvailableMm || breaks.length > 0);

      if (!mustPaginate && blockHeightMm + gapMm <= currentAvailableMm) {
        if (isTableBlock(block, blockFact) && blockFact.tableMeasurement) {
          const tablePlan = computeTablePaginationPlan({
            ...blockFact.tableMeasurement,
            availableHeightOnFirstPageMm: Math.max(0, currentAvailableMm - gapMm),
            availableHeightOnSubsequentPagesMm: technicalHeightMm
          }, options.tablePaginationPolicy, breaks);
          tablePaginationPlans[block.id] = tablePlan;

          if (tablePlan.hasUnresolvedOversizedRow) {
            const message = `Tabela ${block.title || block.id} contém linha maior que uma folha técnica.`;
            currentIssues.push({ code: 'UNRESOLVED_OVERSIZED_ROW', message, severity: 'error' });
            addUnresolved(projectedPages.length + 1, 'UNRESOLVED_OVERSIZED_ROW', message);
          }
          if (tablePlan.hasDuplicateRowIds) {
            const message = `Tabela ${block.title || block.id} contém IDs de linha canônica duplicados.`;
            currentIssues.push({ code: 'TABLE_ROW_DUPLICATION', message, severity: 'error' });
            addUnresolved(projectedPages.length + 1, 'TABLE_ROW_DUPLICATION', message);
          }
          if (tablePlan.hasMalformedTerminalSection) {
            const message = `Tabela ${block.title || block.id} contém seção terminal sem linhas subordinadas.`;
            currentIssues.push({ code: 'MALFORMED_TABLE_STRUCTURE', message, severity: 'error' });
            addUnresolved(targetPageNumber, 'MALFORMED_TABLE_STRUCTURE', message);
          }
        }
        currentAvailableMm -= blockHeightMm + gapMm;
        currentBlocks.push(projectedBlock(page.id, block, blockFact));
        continue;
      }

      if (mustPaginate && blockFact.tableMeasurement) {
        let firstPageAvailableMm = Math.max(0, currentAvailableMm - gapMm);
        const baseMm = blockFact.tableMeasurement.headerHeightMm + (blockFact.tableMeasurement.fixedChromeHeightMm ?? 0);
        const firstRowMm = blockFact.tableMeasurement.rowHeights[0]?.measuredHeightMm ?? 0;
        if (currentBlocks.length > 0 && firstPageAvailableMm < baseMm + firstRowMm) {
          finishPage();
          firstPageAvailableMm = technicalHeightMm;
        }

        const tablePlan = computeTablePaginationPlan({
          ...blockFact.tableMeasurement,
          availableHeightOnFirstPageMm: firstPageAvailableMm,
          availableHeightOnSubsequentPagesMm: technicalHeightMm
        }, options.tablePaginationPolicy, breaks);
        tablePaginationPlans[block.id] = tablePlan;

        if (tablePlan.hasUnresolvedOversizedRow) {
          const message = `Tabela ${block.title || block.id} contém linha maior que uma folha técnica.`;
          currentIssues.push({ code: 'UNRESOLVED_OVERSIZED_ROW', message, severity: 'error' });
          addUnresolved(projectedPages.length + 1, 'UNRESOLVED_OVERSIZED_ROW', message);
        }
        if (tablePlan.hasDuplicateRowIds) {
          const message = `Tabela ${block.title || block.id} contém IDs de linha canônica duplicados.`;
          currentIssues.push({ code: 'TABLE_ROW_DUPLICATION', message, severity: 'error' });
          addUnresolved(projectedPages.length + 1, 'TABLE_ROW_DUPLICATION', message);
        }
        if (tablePlan.hasMalformedTerminalSection) {
          const message = `Tabela ${block.title || block.id} contém seção terminal sem linhas subordinadas.`;
          currentIssues.push({ code: 'MALFORMED_TABLE_STRUCTURE', message, severity: 'error' });
          addUnresolved(targetPageNumber, 'MALFORMED_TABLE_STRUCTURE', message);
        }

        if (tablePlan.slices.length === 0) {
          // P1-E: Block conservation - an authored empty table must still project as a block
          currentAvailableMm -= blockHeightMm + gapMm;
          currentBlocks.push(projectedBlock(page.id, block, blockFact));
        } else {
          tablePlan.slices.forEach((slice, slicePosition) => {
            if (slicePosition > 0) finishPage();
            currentBlocks.push(projectedBlock(page.id, block, blockFact, slice, tablePlan.slices.length));
            currentAvailableMm -= slice.totalSliceHeightMm + (slicePosition === 0 ? gapMm : 0);
            if (currentAvailableMm < -TOLERANCE_MM) {
              const message = `Fatia ${slice.sliceIndex + 1} da tabela ${block.title || block.id} excede a folha técnica.`;
              currentIssues.push({ code: 'VERTICAL_OVERFLOW', message, severity: 'error' });
              addUnresolved(projectedPages.length + 1, 'VERTICAL_OVERFLOW', message);
            }
          });
        }
        continue;
      }

      if (isTableBlock(block, blockFact) && !blockFact.tableMeasurement) {
        const message = `Tabela "${block.title || block.id}" não possui medição física de linhas e chrome.`;
        currentIssues.push({ code: 'LAYOUT_MEASUREMENT_MISSING', message, severity: 'error' });
        addUnresolved(targetPageNumber, 'LAYOUT_MEASUREMENT_MISSING', message);
      }

      if (currentBlocks.length > 0) finishPage();
      currentBlocks.push(projectedBlock(page.id, block, blockFact));
      currentAvailableMm -= blockHeightMm;
      if (blockHeightMm > technicalHeightMm + TOLERANCE_MM) {
        const message = `Bloco "${block.title || block.type}" excede uma folha A4 inteira e não suporta particionamento.`;
        currentIssues.push({ code: 'UNRESOLVED_OVERSIZED_BLOCK', message, severity: 'error' });
        addUnresolved(projectedPages.length + 1, 'UNRESOLVED_OVERSIZED_BLOCK', message);
      }
    }

    if (currentBlocks.length > 0) finishPage();
  }

  const unresolvedVerticalCodes = new Set<PageFlowIssueCode>([
    'VERTICAL_OVERFLOW',
    'UNRESOLVED_OVERSIZED_BLOCK',
    'UNRESOLVED_OVERSIZED_ROW',
    'LAYOUT_MEASUREMENT_MISSING',
    'ROW_CLIPPED',
    'TABLE_ROW_LOSS',
    'TABLE_ROW_DUPLICATION'
  ]);

  return {
    flowMode,
    projectedPages,
    totalProjectedPages: projectedPages.length,
    tablePaginationPlans,
    measurementStatus: unresolvedIssues.some((issue) => issue.code === 'LAYOUT_MEASUREMENT_MISSING') ? 'missing' : 'ready',
    hasUnresolvedOverflow: unresolvedIssues.some((issue) => unresolvedVerticalCodes.has(issue.code)),
    hasHorizontalOverflow: unresolvedIssues.some((issue) => issue.code === 'HORIZONTAL_OVERFLOW'),
    unresolvedIssues
  };
}
