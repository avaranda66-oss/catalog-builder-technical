import React from 'react';
import type { Catalog } from '@/domain/catalog.schema';
import { buildA4RenderPlan, type A4RenderPlan } from '@/domain/a4-render-plan';
import { auditLayoutPreflight, type LayoutPreflightReport } from '@/domain/layout-preflight';
import { computePageFlowPlan, type FlowMode, type PageFlowPlan } from '@/domain/page-flow-planner';
import { measureCanonicalA4Pages, verifyRenderedA4Plan } from './a4-layout-measurement';

const canonicalMeasurementPlan = (catalog: Catalog, flowMode: FlowMode): PageFlowPlan => ({
  flowMode,
  projectedPages: catalog.pages.map((page, pageIndex) => ({
    pageId: page.id,
    canonicalPageId: page.id,
    pageNumber: pageIndex + 1,
    isCover: page.blocks.length === 1 && page.blocks[0]?.type === 'full_page_cover',
    isDerivedContinuation: false,
    blocks: page.blocks.map((block) => ({
      id: block.id,
      canonicalPageId: page.id,
      canonicalBlockId: block.id,
      canonicalBlockType: block.type
    })),
    hasOverflow: false,
    overflowMm: 0,
    issues: []
  })),
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
  const initialRenderPlan = React.useMemo(
    () => buildA4RenderPlan(catalog, canonicalMeasurementPlan(catalog, flowMode)),
    [catalog, flowMode]
  );
  const [renderPlan, setRenderPlan] = React.useState<A4RenderPlan>(initialRenderPlan);
  const [phase, setPhase] = React.useState<'measure' | 'verify' | 'ready'>('measure');
  const documentKey = `${catalog.id}:${catalog.version}:${catalog.updatedAt}:${flowMode}`;
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
          const facts = measureCanonicalA4Pages(rootRef.current, catalog);
          const next = buildA4RenderPlan(catalog, computePageFlowPlan(catalog, facts, { flowMode }));
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
  }, [catalog, flowMode, phase, rootRef]);

  const layoutPreflight = React.useMemo(
    () => phase === 'ready' && isCurrentDocument
      ? auditLayoutPreflight(catalog, renderPlan.flowPlan)
      : auditLayoutPreflight(catalog),
    [catalog, isCurrentDocument, phase, renderPlan]
  );

  return {
    renderPlan,
    layoutPreflight,
    isLayoutComplete: phase === 'ready' && isCurrentDocument,
    isLayoutReady: phase === 'ready' && isCurrentDocument && layoutPreflight.canPublish
  };
}
