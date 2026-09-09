import type { Catalog, CatalogPage, ContentBlock } from './catalog.schema';
import type { PageFlowIssueCode, PageFlowPlan, ProjectedPage } from './page-flow-planner';
import type { TablePaginationSlice } from './table-core/table.pagination';

export interface A4RenderBlock {
  id: string;
  canonicalPageId: string;
  canonicalBlockId: string;
  block: ContentBlock;
  slice?: TablePaginationSlice;
  isContinuationSlice: boolean;
}

export interface A4RenderPage {
  id: string;
  pageNumber: number;
  canonicalPageId: string;
  canonicalPageIndex: number;
  canonicalPage: CatalogPage;
  isCover: boolean;
  isDerivedContinuation: boolean;
  blocks: A4RenderBlock[];
  issues: ProjectedPage['issues'];
}

export interface A4RenderPlan {
  flowPlan: PageFlowPlan;
  pages: A4RenderPage[];
  hasIntegrityDefect: boolean;
}

const addIntegrityIssue = (
  plan: PageFlowPlan,
  pageNumber: number,
  code: Extract<PageFlowIssueCode, 'TABLE_ROW_LOSS' | 'TABLE_ROW_DUPLICATION' | 'LAYOUT_MEASUREMENT_MISSING'>,
  message: string
) => {
  if (!plan.unresolvedIssues.some((issue) => issue.code === code && issue.message === message)) {
    plan.unresolvedIssues.push({ pageNumber, code, message });
  }
};

export function buildA4RenderPlan(catalog: Catalog, pageFlowPlan: PageFlowPlan): A4RenderPlan {
  const flowPlan: PageFlowPlan = {
    ...pageFlowPlan,
    unresolvedIssues: [...pageFlowPlan.unresolvedIssues]
  };
  let hasIntegrityDefect = false;

  const pages = pageFlowPlan.projectedPages.flatMap<A4RenderPage>((projectedPage) => {
    const canonicalPageIndex = catalog.pages.findIndex((page) => page.id === projectedPage.canonicalPageId);
    const canonicalPage = catalog.pages[canonicalPageIndex];
    if (!canonicalPage) {
      hasIntegrityDefect = true;
      addIntegrityIssue(flowPlan, projectedPage.pageNumber, 'LAYOUT_MEASUREMENT_MISSING', `A projeção ${projectedPage.pageId} não resolve uma página canônica.`);
      return [];
    }

    const blocks = projectedPage.blocks.flatMap<A4RenderBlock>((projected) => {
      const block = canonicalPage.blocks.find((candidate) => candidate.id === projected.canonicalBlockId);
      if (!block) {
        hasIntegrityDefect = true;
        addIntegrityIssue(flowPlan, projectedPage.pageNumber, 'LAYOUT_MEASUREMENT_MISSING', `A projeção ${projected.id} não resolve o bloco canônico ${projected.canonicalBlockId}.`);
        return [];
      }
      return [{
        id: projected.id,
        canonicalPageId: canonicalPage.id,
        canonicalBlockId: block.id,
        block,
        slice: projected.slice,
        isContinuationSlice: Boolean(projected.isContinuationSlice)
      }];
    });

    return [{
      id: projectedPage.pageId,
      pageNumber: projectedPage.pageNumber,
      canonicalPageId: canonicalPage.id,
      canonicalPageIndex,
      canonicalPage,
      isCover: projectedPage.isCover,
      isDerivedContinuation: projectedPage.isDerivedContinuation,
      blocks,
      issues: projectedPage.issues
    }];
  });

  for (const page of catalog.pages) {
    for (const block of page.blocks) {
      if (!block.tableRows?.length) continue;
      const projectedSlices = pages.flatMap((renderPage) =>
        renderPage.blocks.filter((renderBlock) => renderBlock.canonicalBlockId === block.id && renderBlock.slice)
      );
      if (projectedSlices.length === 0) continue;

      const canonicalIds = block.tableRows.map((row) => row.id);
      const renderedIds = projectedSlices.flatMap((renderBlock) => renderBlock.slice?.includedRowIds ?? []);
      const duplicateIds = renderedIds.filter((id, index, all) => all.indexOf(id) !== index);
      const missingIds = canonicalIds.filter((id) => !renderedIds.includes(id));
      const firstPageNumber = pages.find((renderPage) => renderPage.blocks.some((renderBlock) => renderBlock.canonicalBlockId === block.id))?.pageNumber ?? 1;

      if (duplicateIds.length > 0) {
        hasIntegrityDefect = true;
        addIntegrityIssue(flowPlan, firstPageNumber, 'TABLE_ROW_DUPLICATION', `Tabela ${block.id} duplicou linhas canônicas: ${[...new Set(duplicateIds)].join(', ')}.`);
      }
      if (missingIds.length > 0 || renderedIds.length !== canonicalIds.length) {
        hasIntegrityDefect = true;
        addIntegrityIssue(flowPlan, firstPageNumber, 'TABLE_ROW_LOSS', `Tabela ${block.id} não conservou todas as linhas canônicas.`);
      }
    }
  }

  flowPlan.hasUnresolvedOverflow = flowPlan.hasUnresolvedOverflow || hasIntegrityDefect;
  return { flowPlan, pages, hasIntegrityDefect };
}
