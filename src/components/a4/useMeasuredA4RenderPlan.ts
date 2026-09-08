import React from 'react';
import type { Catalog } from '@/domain/catalog.schema';
import { buildA4RenderPlan, type A4RenderPlan } from '@/domain/a4-render-plan';
import { auditLayoutPreflight, type LayoutPreflightReport } from '@/domain/layout-preflight';
import { computePageFlowPlan, type FlowMode, type PageFlowPlan } from '@/domain/page-flow-planner';
import { measureCanonicalA4Pages, verifyRenderedA4Plan } from './a4-layout-measurement';

const canonicalMeasurementPlan = (catalog: Catalog, flowMode: FlowMode): PageFlowPlan => ({
  flowMode,
  projectedPages: catalog.pages.map((page, pageIndex) => {
    const blocks = Array.isArray(page.blocks) ? page.blocks : [];
    return {
      pageId: page.id,
      canonicalPageId: page.id,
      pageNumber: pageIndex + 1,
      isCover: blocks.length === 1 && blocks[0]?.type === 'full_page_cover',
      isDerivedContinuation: false,
      blocks: blocks.map((block) => ({
        id: block.id,
        canonicalPageId: page.id,
        canonicalBlockId: block.id,
        canonicalBlockType: block.type
      })),
      hasOverflow: false,
      overflowMm: 0,
      issues: []
    };
  }),
  totalProjectedPages: catalog.pages.length,
  tablePaginationPlans: {},
  measurementStatus: 'missing',
  hasUnresolvedOverflow: true,
  hasHorizontalOverflow: false,
  unresolvedIssues: []
});

export interface MeasuredA4RenderPlanState {
  renderPlan: A4RenderPlan;
  layoutPreflight: LayoutPreflightReport;
  isLayoutComplete: boolean;
  isLayoutReady: boolean;
}

export function useMeasuredA4RenderPlan(
  catalog: Catalog,
  rootRef: React.RefObject<HTMLElement | null>,
  flowMode: FlowMode
): MeasuredA4RenderPlanState {
  const runtimeCatalog = React.useMemo<Catalog>(() => {
    if (catalog.pages.every((page) => Array.isArray(page.blocks))) return catalog;
    return {
      ...catalog,
      pages: catalog.pages.map((page) => ({
        ...page,
        blocks: Array.isArray(page.blocks) ? page.blocks : []
      }))
    };
  }, [catalog]);

  const initialRenderPlan = React.useMemo(
    () => buildA4RenderPlan(runtimeCatalog, canonicalMeasurementPlan(runtimeCatalog, flowMode)),
    [runtimeCatalog, flowMode]
  );
  const [renderPlan, setRenderPlan] = React.useState<A4RenderPlan>(initialRenderPlan);
  const [phase, setPhase] = React.useState<'measure' | 'verify' | 'ready'>('measure');
  const documentKey = `${runtimeCatalog.id}:${runtimeCatalog.version}:${runtimeCatalog.updatedAt}:${flowMode}`;
  const previousKey = React.useRef(documentKey);
  const isCurrentDocument = previousKey.current === documentKey;

  React.useLayoutEffect(() => {
    if (previousKey.current === documentKey) return;
    previousKey.current = documentKey;
    setRenderPlan(initialRenderPlan);
    setPhase('measure');
  }, [documentKey, initialRenderPlan]);

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let frame = 0;

    const run = async () => {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        try { await document.fonts.ready; } catch { /* physical audit remains fail-closed */ }
      }
      frame = requestAnimationFrame(() => {
        if (cancelled || !rootRef.current) return;
        if (phase === 'measure') {
          const facts = measureCanonicalA4Pages(rootRef.current, runtimeCatalog);
          const next = buildA4RenderPlan(runtimeCatalog, computePageFlowPlan(runtimeCatalog, facts, { flowMode }));
          setRenderPlan(next);
          setPhase('verify');
        } else if (phase === 'verify') {
          setRenderPlan((current) => verifyRenderedA4Plan(rootRef.current!, current));
          setPhase('ready');
        }
      });
    };
    void run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [flowMode, phase, rootRef, runtimeCatalog]);

  const layoutPreflight = React.useMemo(
    () => phase === 'ready' && isCurrentDocument
      ? auditLayoutPreflight(runtimeCatalog, renderPlan.flowPlan)
      : auditLayoutPreflight(runtimeCatalog),
    [isCurrentDocument, phase, renderPlan, runtimeCatalog]
  );

  return {
    renderPlan,
    layoutPreflight,
    isLayoutComplete: phase === 'ready' && isCurrentDocument,
    isLayoutReady: phase === 'ready' && isCurrentDocument && layoutPreflight.canPublish
  };
}
