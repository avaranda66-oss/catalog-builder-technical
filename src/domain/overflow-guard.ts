// src/domain/overflow-guard.ts
// Motor Puro de Diagnóstico de Overflow Vertical e Composição A4 (Fase 3A.5C)
// Funções puras desacopladas de DOM e de UI, usando physical-units.ts canônico.
// Zero document mutations, zero persistência, zero dependência de offsetParent.

import { pxToMm } from './physical-units';

export type PageLayoutIssueCode = 'VERTICAL_OVERFLOW' | 'MIXED_FULL_PAGE_COVER';

export interface PageLayoutGuardIssue {
  code: PageLayoutIssueCode;
  severity: 'warning' | 'error';
}

export interface PageVerticalOverflowResult {
  pageId: string;
  overflowY: boolean;
  overflowMm: number;
  contentHeightPx: number;
  viewportHeightPx: number;
  firstOffendingBlockId?: string;
  firstOffendingBlockType?: string;
  issues: PageLayoutGuardIssue[];
}

export interface BlockRectMetric {
  id: string;
  type: string;
  bottom: number;
}

/**
 * Calcula se há overflow vertical e a extensão em milímetros físicos (96 DPI).
 * Aplica tolerância pequena (padrão 1px) contra artefatos de subpixel rounding.
 */
export function calculateVerticalOverflow(
  contentHeightPx: number,
  viewportHeightPx: number,
  tolerancePx: number = 1
): { overflowY: boolean; overflowMm: number; overflowPx: number } {
  const overflowPx = Math.max(0, contentHeightPx - viewportHeightPx);
  const overflowY = overflowPx > tolerancePx;
  const overflowMm = overflowY ? Number(pxToMm(overflowPx, 96).toFixed(1)) : 0;
  return { overflowY, overflowMm, overflowPx };
}

/**
 * Atribui com precisão o primeiro bloco que ultrapassou a borda inferior do viewport.
 * Usa coordenadas absolutas do boundingClientRect normalizadas pela escala real do canvas,
 * sem qualquer dependência de offsetParent.
 */
export function identifyFirstOffendingBlock(
  viewportTop: number,
  viewportHeightPx: number,
  blocks: BlockRectMetric[],
  actualScale: number = 1,
  tolerancePx: number = 1
): { firstOffendingBlockId?: string; firstOffendingBlockType?: string } {
  const safeScale = actualScale > 0 ? actualScale : 1;

  for (const block of blocks) {
    const relativeBottom = (block.bottom - viewportTop) / safeScale;
    if (relativeBottom > viewportHeightPx + tolerancePx) {
      return {
        firstOffendingBlockId: block.id,
        firstOffendingBlockType: block.type
      };
    }
  }

  return {};
}

/**
 * Detecta se uma capa full_page_cover está indevidamente combinada com outros blocos
 * em fluxo na mesma página (dívida arquitetural para futuro Canvas de Camadas).
 */
export function detectMixedFullPageCover(blocks?: Array<{ type: string }>): boolean {
  if (!blocks || blocks.length <= 1) return false;
  return blocks.some((b) => b.type === 'full_page_cover');
}
