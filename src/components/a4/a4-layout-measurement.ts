import type { Catalog } from '@/domain/catalog.schema';
import type { A4RenderPlan } from '@/domain/a4-render-plan';
import type { PageFlowIssueCode, PageLayoutFact } from '@/domain/page-flow-planner';
import { pxToMm } from '@/domain/physical-units';

const pxHeight = (element: HTMLElement, scale: number) =>
  element.offsetHeight || element.getBoundingClientRect().height / scale;

const pxWidth = (element: HTMLElement, scale: number) =>
  element.offsetWidth || element.getBoundingClientRect().width / scale;

const getLogicalScale = (page: HTMLElement) => {
  if (!page.offsetWidth) return 1;
  const scale = page.getBoundingClientRect().width / page.offsetWidth;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
};

const selectorValue = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function measureCanonicalA4Pages(root: HTMLElement, catalog: Catalog): PageLayoutFact[] {
  const facts: PageLayoutFact[] = [];
  for (const page of catalog.pages) {
    const pageElement = root.querySelector<HTMLElement>(
      `[data-a4-page][data-canonical-page-id="${selectorValue(page.id)}"]`
    );
    if (!pageElement) continue;
    const viewport = pageElement.querySelector<HTMLElement>('[data-a4-block-flow-viewport]');
    const content = pageElement.querySelector<HTMLElement>('[data-a4-block-flow-content]');
    if (!viewport || !content || viewport.clientHeight <= 0 || viewport.clientWidth <= 0) continue;

    const scale = getLogicalScale(pageElement);
    const blockElements = Array.from(content.querySelectorAll<HTMLElement>(':scope > [data-canonical-block-id]'));
    const measuredGapsPx = blockElements.slice(1).map((element, index) => {
      const previous = blockElements[index];
      const previousBottom = previous.offsetTop + pxHeight(previous, scale);
      return Math.max(0, element.offsetTop - previousBottom);
    });
    const blockGapPx = measuredGapsPx.length > 0
      ? measuredGapsPx.reduce((sum, gap) => sum + gap, 0) / measuredGapsPx.length
      : 0;

    facts.push({
      pageId: page.id,
      pageNumber: page.pageNumber,
      usableHeightMm: pxToMm(viewport.clientHeight),
      usableWidthMm: pxToMm(viewport.clientWidth),
      blockGapMm: pxToMm(blockGapPx),
      blocks: page.blocks.flatMap((block) => {
        const blockElement = blockElements.find((element) => element.dataset.canonicalBlockId === block.id);
        if (!blockElement) return [];
        const measuredHeightMm = pxToMm(pxHeight(blockElement, scale));
        const measuredWidthMm = pxToMm(pxWidth(blockElement, scale));
        const canonicalRowIds = new Set(block.tableRows?.map((row) => row.id) ?? []);
        const rowElements = Array.from(blockElement.querySelectorAll<HTMLElement>('[data-canonical-row-id]'))
          .filter((element) => canonicalRowIds.has(element.dataset.canonicalRowId || ''))
          .filter((element, index, all) => all.findIndex((candidate) => candidate.dataset.canonicalRowId === element.dataset.canonicalRowId) === index);
        const headerElements = Array.from(blockElement.querySelectorAll<HTMLElement>('thead'));
        const headerHeightPx = headerElements.reduce((sum, element) => sum + pxHeight(element, scale), 0);
        const rowHeights = rowElements.map((element) => ({
          rowId: element.dataset.canonicalRowId || '',
          measuredHeightMm: pxToMm(pxHeight(element, scale)),
          kind: block.tableRows?.find((row) => row.id === element.dataset.canonicalRowId)?.kind
        }));
        const rowsHeightMm = rowHeights.reduce((sum, row) => sum + row.measuredHeightMm, 0);
        const headerHeightMm = pxToMm(headerHeightPx);
        const fixedChromeHeightMm = Math.max(0, measuredHeightMm - rowsHeightMm - headerHeightMm);

        return [{
          blockId: block.id,
          blockType: block.type,
          measuredHeightMm,
          measuredWidthMm,
          isSplittableTable: ['custom_table', 'specs_table', 'table'].includes(block.type),
          density: block.customData?.density,
          tableMeasurement: block.tableRows && rowHeights.length === block.tableRows.length
            ? {
                tableId: block.id,
                fixedChromeHeightMm,
                headerHeightMm,
                rowHeights,
                availableHeightOnFirstPageMm: pxToMm(viewport.clientHeight),
                availableHeightOnSubsequentPagesMm: pxToMm(viewport.clientHeight)
              }
            : undefined
        }];
      })
    });
  }
  return facts;
}

export function verifyRenderedA4Plan(root: HTMLElement, renderPlan: A4RenderPlan): A4RenderPlan {
  const runtimeCodes = new Set<PageFlowIssueCode>(['VERTICAL_OVERFLOW', 'HORIZONTAL_OVERFLOW', 'ROW_CLIPPED']);
  const flowPlan = {
    ...renderPlan.flowPlan,
    unresolvedIssues: renderPlan.flowPlan.unresolvedIssues.filter((issue) => !runtimeCodes.has(issue.code))
  };

  for (const renderPage of renderPlan.pages) {
    const pageElement = root.querySelector<HTMLElement>(`[data-a4-page-id="${selectorValue(renderPage.id)}"]`);
    const viewport = pageElement?.querySelector<HTMLElement>('[data-a4-block-flow-viewport]');
    const content = pageElement?.querySelector<HTMLElement>('[data-a4-block-flow-content]');
    if (!pageElement || !viewport || !content || viewport.clientHeight <= 0 || viewport.clientWidth <= 0) {
      flowPlan.unresolvedIssues.push({
        pageNumber: renderPage.pageNumber,
        code: 'LAYOUT_MEASUREMENT_MISSING',
        message: `A folha física ${renderPage.pageNumber} não pôde ser verificada no DOM atual.`
      });
      continue;
    }
    if (content.scrollHeight > viewport.clientHeight + 1) {
      flowPlan.unresolvedIssues.push({
        pageNumber: renderPage.pageNumber,
        code: 'VERTICAL_OVERFLOW',
        message: `A folha física ${renderPage.pageNumber} excede verticalmente o viewport renderizado.`
      });
    }
    if (content.scrollWidth > viewport.clientWidth + 1) {
      flowPlan.unresolvedIssues.push({
        pageNumber: renderPage.pageNumber,
        code: 'HORIZONTAL_OVERFLOW',
        message: `A folha física ${renderPage.pageNumber} excede horizontalmente o viewport renderizado.`
      });
    }
  }

  const renderedRowIds = Array.from(root.querySelectorAll<HTMLElement>('[data-canonical-row-id]'))
    .map((element) => element.dataset.canonicalRowId)
    .filter((id): id is string => Boolean(id));
  for (const renderPage of renderPlan.pages) {
    for (const renderBlock of renderPage.blocks) {
      if (!renderBlock.slice) continue;
      for (const rowId of renderBlock.slice.includedRowIds) {
        if (!renderedRowIds.includes(rowId)) {
          flowPlan.unresolvedIssues.push({
            pageNumber: renderPage.pageNumber,
            code: 'ROW_CLIPPED',
            message: `A linha ${rowId} não está presente no DOM físico da fatia renderizada.`
          });
        }
      }
    }
  }

  flowPlan.hasHorizontalOverflow = flowPlan.unresolvedIssues.some((issue) => issue.code === 'HORIZONTAL_OVERFLOW');
  flowPlan.hasUnresolvedOverflow = flowPlan.unresolvedIssues.some((issue) => issue.code !== 'HORIZONTAL_OVERFLOW');
  flowPlan.measurementStatus = flowPlan.unresolvedIssues.some((issue) => issue.code === 'LAYOUT_MEASUREMENT_MISSING') ? 'missing' : 'ready';
  return { ...renderPlan, flowPlan };
}
