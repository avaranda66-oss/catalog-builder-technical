import React from 'react';
import type { Catalog } from '@/domain/catalog.schema';
import { buildA4RenderPlan, type A4RenderPlan } from '@/domain/a4-render-plan';
import { auditLayoutPreflight, type LayoutPreflightReport } from '@/domain/layout-preflight';
import { computePageFlowPlan, type FlowMode, type PageFlowPlan } from '@/domain/page-flow-planner';
import { measureCanonicalA4Pages, verifyRenderedA4Plan, getPrintableMeasureRoot } from './a4-layout-measurement';

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
  generationToken: string;
}

export async function waitForPhysicalAssetsReady(root: HTMLElement): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* physical audit remains fail-closed */
    }
  }

  if (typeof root.querySelectorAll !== 'function') return;

  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  if (images.length === 0) return;

  const pending = images.map((img) => {
    if (img.complete) {
      if (img.naturalWidth > 0) {
        if (typeof img.decode === 'function') {
          return img.decode().catch(() => {});
        }
        return Promise.resolve();
      }
      // Image already settled in error (complete === true, naturalWidth === 0). Settle deterministically!
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
        if (img.naturalWidth > 0 && typeof img.decode === 'function') {
          img.decode().catch(() => {}).finally(() => resolve());
        } else {
          resolve();
        }
      };
      const onLoad = () => done();
      const onError = () => done();
      img.addEventListener('load', onLoad);
      img.addEventListener('error', onError);
    });
  });

  await Promise.all(pending);
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
  const [generationTokenCount, setGenerationTokenCount] = React.useState<number>(0);
  const [isLayoutUnstable, setIsLayoutUnstable] = React.useState<boolean>(false);
  const revalidationsCountRef = React.useRef(0);
  const lastVerifiedHeightsRef = React.useRef<Map<HTMLElement, number>>(new Map());

  const documentKey = `${runtimeCatalog.id}:${runtimeCatalog.version}:${runtimeCatalog.updatedAt}:${flowMode}`;
  const previousKey = React.useRef(documentKey);
  const isCurrentDocument = previousKey.current === documentKey;

  React.useLayoutEffect(() => {
    if (previousKey.current === documentKey) return;
    previousKey.current = documentKey;
    revalidationsCountRef.current = 0;
    lastVerifiedHeightsRef.current.clear();
    setIsLayoutUnstable(false);
    setRenderPlan(initialRenderPlan);
    setPhase('measure');
    setGenerationTokenCount((c) => c + 1);
  }, [documentKey, initialRenderPlan]);

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let frame = 0;

    const run = async () => {
      await waitForPhysicalAssetsReady(root);
      frame = requestAnimationFrame(() => {
        if (cancelled || !rootRef.current) return;
        if (phase === 'measure') {
          const facts = measureCanonicalA4Pages(rootRef.current, runtimeCatalog);
          const next = buildA4RenderPlan(runtimeCatalog, computePageFlowPlan(runtimeCatalog, facts, { flowMode }));
          setRenderPlan(next);
          setPhase('verify');
        } else if (phase === 'verify') {
          setRenderPlan((current) => verifyRenderedA4Plan(rootRef.current!, current));
          const blockMap = new Map<HTMLElement, number>();
          const blocks = rootRef.current.querySelectorAll<HTMLElement>('[data-block-id], [data-canonical-block-id]');
          blocks.forEach((el) => {
            const measureRoot = getPrintableMeasureRoot(el);
            blockMap.set(measureRoot, measureRoot.offsetHeight);
          });
          lastVerifiedHeightsRef.current = blockMap;
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

  // P1-A: Invalidação de geração física se assets ou dimensões mudarem após verificação
  React.useEffect(() => {
    if (phase !== 'ready' || !rootRef.current) return;
    const root = rootRef.current;
    let observer: ResizeObserver | null = null;

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        let hasMaterialChange = false;
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          const previousHeight = lastVerifiedHeightsRef.current.get(target);
          if (previousHeight === undefined) {
            lastVerifiedHeightsRef.current.set(target, target.offsetHeight);
          } else if (Math.abs(target.offsetHeight - previousHeight) > 1) { // Guardado por igualdade (>1px)
            hasMaterialChange = true;
            break;
          }
        }
        if (hasMaterialChange) {
          if (revalidationsCountRef.current < 5) {
            revalidationsCountRef.current += 1;
            setPhase('measure');
            setGenerationTokenCount((c) => c + 1);
          } else {
            // Limite de convergência excedido: fail-closed sem tempestade de revalidações
            setIsLayoutUnstable(true);
          }
        }
      });

      const blocks = root.querySelectorAll<HTMLElement>('[data-block-id], [data-canonical-block-id]');
      blocks.forEach((el) => observer?.observe(getPrintableMeasureRoot(el)));
    }

    const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
    const handleImageLoadOrError = () => {
      if (revalidationsCountRef.current < 5) {
        revalidationsCountRef.current += 1;
        setPhase('measure');
        setGenerationTokenCount((c) => c + 1);
      } else {
        setIsLayoutUnstable(true);
      }
    };
    images.forEach((img) => {
      if (!img.complete) {
        img.addEventListener('load', handleImageLoadOrError, { once: true });
        img.addEventListener('error', handleImageLoadOrError, { once: true });
      }
    });

    return () => {
      observer?.disconnect();
      images.forEach((img) => {
        img.removeEventListener('load', handleImageLoadOrError);
        img.removeEventListener('error', handleImageLoadOrError);
      });
    };
  }, [phase, rootRef]);

  const layoutPreflight = React.useMemo(() => {
    const basePreflight = phase === 'ready' && isCurrentDocument
      ? auditLayoutPreflight(catalog, renderPlan.flowPlan)
      : auditLayoutPreflight(catalog);

    if (isLayoutUnstable) {
      const issues = [
        ...basePreflight.issues,
        {
          code: 'LAYOUT_UNSTABLE',
          severity: 'block' as const,
          message: 'O layout físico não convergiu dentro do orçamento de revalidação (instabilidade geométrica detectada).'
        }
      ];
      return {
        canPublish: false,
        blockCount: issues.filter((i) => i.severity === 'block').length,
        warnCount: issues.filter((i) => i.severity === 'warn').length,
        issues
      };
    }

    return basePreflight;
  }, [catalog, isCurrentDocument, isLayoutUnstable, phase, renderPlan]);

  const generationToken = `${documentKey}:gen-${generationTokenCount}:${phase}${isLayoutUnstable ? ':unstable' : ''}`;

  return {
    renderPlan,
    layoutPreflight,
    isLayoutComplete: phase === 'ready' && isCurrentDocument && !isLayoutUnstable,
    isLayoutReady: phase === 'ready' && isCurrentDocument && !isLayoutUnstable && layoutPreflight.canPublish,
    generationToken
  };
}
