// src/components/editor/hooks/useVerticalOverflowGuard.ts
// Hook Editor-Only para Diagnóstico Reativo de Overflow Vertical (Fase 3A.5C)
// Utiliza ResizeObserver desacoplado por requestAnimationFrame, medição invariante de escala,
// integração com document.fonts.ready e zero mutação no Store/Catalog.

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PageVerticalOverflowResult,
  PageLayoutGuardIssue,
  calculateVerticalOverflow,
  identifyFirstOffendingBlock,
  BlockRectMetric
} from '../../../domain/overflow-guard';

export interface UseVerticalOverflowGuardOptions {
  pageId: string;
  viewportRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLElement | null>;
  locale?: string;
  blocksCount: number;
  isSingleFullCover: boolean;
  hasMixedFullCover: boolean;
}

export function useVerticalOverflowGuard({
  pageId,
  viewportRef,
  contentRef,
  locale = 'pt-BR',
  blocksCount,
  isSingleFullCover,
  hasMixedFullCover
}: UseVerticalOverflowGuardOptions): PageVerticalOverflowResult {
  const [result, setResult] = useState<PageVerticalOverflowResult>(() => ({
    pageId,
    overflowY: false,
    overflowMm: 0,
    contentHeightPx: 0,
    viewportHeightPx: 0,
    firstOffendingBlockId: undefined,
    firstOffendingBlockType: undefined,
    issues: hasMixedFullCover ? [{ code: 'MIXED_FULL_PAGE_COVER', severity: 'warning' }] : []
  }));

  const rafIdRef = useRef<number | null>(null);
  const cancelledRef = useRef<boolean>(false);

  // Derivação da escala real de renderização da folha A4 (zoom do editor)
  const getActualScale = useCallback((): number => {
    if (!viewportRef.current) return 1;
    const pageContainer = viewportRef.current.closest('.a4-page-container') as HTMLElement | null;
    if (!pageContainer || !pageContainer.offsetWidth) return 1;
    return pageContainer.getBoundingClientRect().width / pageContainer.offsetWidth;
  }, [viewportRef]);

  // Medição síncrona/desacoplada
  const measure = useCallback(() => {
    if (cancelledRef.current) return;

    // Caso 1: Página vazia ou Capa isolada full_page_cover
    if (blocksCount === 0 || isSingleFullCover) {
      const issues: PageLayoutGuardIssue[] = [];
      if (hasMixedFullCover) {
        issues.push({ code: 'MIXED_FULL_PAGE_COVER', severity: 'warning' });
      }

      setResult({
        pageId,
        overflowY: false,
        overflowMm: 0,
        contentHeightPx: 0,
        viewportHeightPx: 0,
        firstOffendingBlockId: undefined,
        firstOffendingBlockType: undefined,
        issues
      });
      return;
    }

    const viewportEl = viewportRef.current;
    const contentEl = contentRef.current;
    if (!viewportEl || !contentEl) return;

    // Métricas físicas internas de layout CSS (invariantes de transform scale)
    const contentHeightPx = contentEl.scrollHeight;
    const viewportHeightPx = viewportEl.clientHeight;

    const { overflowY, overflowMm } = calculateVerticalOverflow(contentHeightPx, viewportHeightPx);

    let firstOffendingBlockId: string | undefined;
    let firstOffendingBlockType: string | undefined;

    // Identificação precisa do primeiro bloco ofensor (root page block wrappers diretos)
    if (overflowY) {
      const viewportRect = viewportEl.getBoundingClientRect();
      const actualScale = getActualScale();

      // Busca apenas filhos diretos do content que sejam root blocks
      let blockElements: HTMLElement[] = [];
      try {
        blockElements = Array.from(contentEl.querySelectorAll<HTMLElement>(':scope > [data-block-id]'));
      } catch {
        // Fallback defensivo caso :scope não esteja disponível em JSDOM
        blockElements = Array.from(contentEl.children).filter(
          (c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-block-id')
        );
      }

      const blockMetrics: BlockRectMetric[] = blockElements.map((el) => ({
        id: el.getAttribute('data-block-id') || '',
        type: el.getAttribute('data-block-type') || '',
        bottom: el.getBoundingClientRect().bottom
      }));

      const offender = identifyFirstOffendingBlock(
        viewportRect.top,
        viewportHeightPx,
        blockMetrics,
        actualScale
      );

      firstOffendingBlockId = offender.firstOffendingBlockId;
      firstOffendingBlockType = offender.firstOffendingBlockType;
    }

    // Diagnósticos estruturados desacoplados de copy de UI
    const issues: PageLayoutGuardIssue[] = [];
    if (overflowY) {
      issues.push({ code: 'VERTICAL_OVERFLOW', severity: 'warning' });
    }
    if (hasMixedFullCover) {
      issues.push({ code: 'MIXED_FULL_PAGE_COVER', severity: 'warning' });
    }

    setResult({
      pageId,
      overflowY,
      overflowMm,
      contentHeightPx,
      viewportHeightPx,
      firstOffendingBlockId,
      firstOffendingBlockType,
      issues
    });
  }, [
    pageId,
    blocksCount,
    isSingleFullCover,
    hasMixedFullCover,
    viewportRef,
    contentRef,
    getActualScale
  ]);

  // Agendador com coalescing via requestAnimationFrame
  const scheduleMeasure = useCallback(() => {
    if (cancelledRef.current) return;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      if (!cancelledRef.current) {
        measure();
      }
    });
  }, [measure]);

  // Lifecycle do ResizeObserver
  useEffect(() => {
    cancelledRef.current = false;

    if (typeof ResizeObserver === 'undefined') {
      scheduleMeasure();
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleMeasure();
    });

    if (viewportRef.current) {
      observer.observe(viewportRef.current);
    }
    if (contentRef.current) {
      observer.observe(contentRef.current);
    }

    scheduleMeasure();

    return () => {
      cancelledRef.current = true;
      observer.disconnect();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [viewportRef, contentRef, scheduleMeasure]);

  // Re-medição quando fontes corporativas/locais são carregadas
  useEffect(() => {
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!cancelledRef.current) {
          scheduleMeasure();
        }
      });
    }
  }, [locale, scheduleMeasure]);

  return result;
}
