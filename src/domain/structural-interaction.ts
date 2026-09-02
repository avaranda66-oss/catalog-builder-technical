// src/domain/structural-interaction.ts
// Lógica pura de interação, resize snapped e reordenação lógica (Fase 3A.5B)
// Isola a matemática de coordenadas, snap milimétrico e movimentação por Stable IDs sem acoplamento ao DOM.

import { pxToMm } from './physical-units';
import {
  StructuralSectionData,
  StructuralSectionDataSchema
} from './canvas-layout.schema';
import type { ContentBlock } from './catalog.schema';

export interface ResizeCalculationParams {
  initialWidthMm: number;
  deltaXPixels: number;
  actualScale: number;
  anchor: 'left' | 'center' | 'right';
  handleSide: 'left' | 'right';
  availableWidthMm: number;
  stepMm?: number; // Padrão: 0.5 mm
}

/**
 * Calcula a largura em milímetros resultante da interação com um handle de resize.
 * Aplica compensação pela escala real renderizada no DOM, snap de 0.5mm e clamp estrito.
 */
export function calculateSnappedResizeWidthMm({
  initialWidthMm,
  deltaXPixels,
  actualScale,
  anchor,
  handleSide,
  availableWidthMm,
  stepMm = 0.5
}: ResizeCalculationParams): number {
  const safeScale = actualScale > 0 ? actualScale : 1;
  const screenDeltaPx = deltaXPixels / safeScale;
  const deltaMm = pxToMm(screenDeltaPx, 96);

  let rawWidthMm = initialWidthMm;

  if (anchor === 'left') {
    // Ancorado à esquerda: handle ativo na direita (+deltaX aumenta)
    rawWidthMm = initialWidthMm + deltaMm;
  } else if (anchor === 'right') {
    // Ancorado à direita: handle ativo na esquerda (-deltaX aumenta)
    rawWidthMm = initialWidthMm - deltaMm;
  } else {
    // Ancorado ao centro: arrastar uma borda varia ~2X a largura para manter simetria
    if (handleSide === 'right') {
      rawWidthMm = initialWidthMm + 2 * deltaMm;
    } else {
      rawWidthMm = initialWidthMm - 2 * deltaMm;
    }
  }

  // Snap manual restrito ao step de interação do pointer (0.5 mm)
  const snappedWidth = Math.round(rawWidthMm / stepMm) * stepMm;

  // Clamp entre o menor step positivo (0.5 mm) e o availableWidthMm físico
  const clampedWidth = Math.max(stepMm, Math.min(availableWidthMm, snappedWidth));

  return Number(clampedWidth.toFixed(4));
}

export interface MoveChildResult {
  data: StructuralSectionData;
  found: boolean;
  moved: boolean;
}

/**
 * Move um card filho dentro de uma seção estrutural para um índice alvo específico (ID-first).
 * Garante invariantes de limite, no-op se same-index e validação estrita via Zod.
 */
export function moveStructuralChildToIndex(
  structuralData: StructuralSectionData,
  childId: string,
  targetIndex: number
): MoveChildResult {
  const children = structuralData.children || [];
  const currentIndex = children.findIndex((c) => c.id === childId);

  if (currentIndex === -1) {
    return { data: structuralData, found: false, moved: false };
  }

  if (targetIndex < 0 || targetIndex >= children.length || targetIndex === currentIndex) {
    return { data: structuralData, found: true, moved: false };
  }

  const reordered = [...children];
  const [targetChild] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, targetChild);

  const updatedData: StructuralSectionData = {
    ...structuralData,
    children: reordered
  };

  const validated = StructuralSectionDataSchema.parse(updatedData);

  return {
    data: validated,
    found: true,
    moved: true
  };
}

export interface MoveSectionResult {
  blocks: ContentBlock[];
  found: boolean;
  moved: boolean;
}

/**
 * Move uma seção estrutural na lista de blocos de uma página para um targetIndex específico.
 * Fail-closed: bloqueia reorder se a origem não for structural_section, se targetIndex for inválido ou se for o mesmo índice.
 */
export function moveStructuralSectionOnBlocks(
  blocks: ContentBlock[],
  sectionId: string,
  targetIndex: number
): MoveSectionResult {
  const currentIndex = blocks.findIndex((b) => b.id === sectionId);
  if (currentIndex === -1) {
    return { blocks, found: false, moved: false };
  }

  const block = blocks[currentIndex];
  if (block.type !== 'structural_section') {
    return { blocks, found: true, moved: false };
  }

  if (targetIndex < 0 || targetIndex >= blocks.length || targetIndex === currentIndex) {
    return { blocks, found: true, moved: false };
  }

  const reordered = [...blocks];
  const [targetBlock] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, targetBlock);

  return {
    blocks: reordered,
    found: true,
    moved: true
  };
}
