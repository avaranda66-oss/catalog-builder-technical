// src/domain/page-composition-policy.ts
// Política Pura de Composição de Páginas e Inserção Segura (Fase 3A.6)
// Define regras simétricas para prevenir e recuperar sobreposições entre capas inteiras e blocos em fluxo.
// NOTA ROADMAP: Esta política é provisória até a introdução do Page Composition / Layers System definitivo.

import { CatalogPage, ContentBlock, BlockType } from './catalog.schema';

export type CompositionSafetyResult =
  | { isSafe: true }
  | {
      isSafe: false;
      reason: 'EXISTING_COVER_WITH_FLOW_BLOCK' | 'INCOMING_COVER_ON_NON_EMPTY_PAGE' | 'PAGE_ALREADY_MIXED';
    };

export interface PageContentInsertionSpecPreset {
  kind: 'structural_preset';
  presetId: string;
}

export interface PageContentInsertionSpecBlock {
  kind: 'block';
  blockData: Omit<ContentBlock, 'id'>;
}

export type PageContentInsertionSpec = PageContentInsertionSpecPreset | PageContentInsertionSpecBlock;

/**
 * Avalia de forma puramente funcional se a inserção de um bloco em uma página é segura.
 * Política Simétrica:
 * 1. Página vazia -> sempre seguro (aceita qualquer bloco, inclusive full_page_cover).
 * 2. Página sem capa recebendo bloco normal -> seguro.
 * 3. Página com capa recebendo outro bloco -> INSEGURO (EXISTING_COVER_WITH_FLOW_BLOCK).
 * 4. Página com qualquer bloco recebendo full_page_cover -> INSEGURO (INCOMING_COVER_ON_NON_EMPTY_PAGE).
 * 5. Página já mista recebendo novos blocos -> INSEGURO (PAGE_ALREADY_MIXED).
 */
export function evaluatePageCompositionInsertion(
  page: CatalogPage | undefined,
  incomingBlockType: BlockType
): CompositionSafetyResult {
  if (!page || !page.blocks || page.blocks.length === 0) {
    return { isSafe: true };
  }

  const hasExistingCover = page.blocks.some((b) => b.type === 'full_page_cover');

  // Caso 5: Página já em estado misto
  if (hasExistingCover && page.blocks.length > 1) {
    return { isSafe: false, reason: 'PAGE_ALREADY_MIXED' };
  }

  // Caso 3: Página possui capa e recebe bloco de fluxo
  if (hasExistingCover) {
    return { isSafe: false, reason: 'EXISTING_COVER_WITH_FLOW_BLOCK' };
  }

  // Caso 4: Página possui blocos e recebe capa
  if (!hasExistingCover && incomingBlockType === 'full_page_cover') {
    return { isSafe: false, reason: 'INCOMING_COVER_ON_NON_EMPTY_PAGE' };
  }

  // Caso 2: Fluxo normal
  return { isSafe: true };
}

export interface MixedCoverRecoveryEvaluation {
  eligible: boolean;
  coverCount: number;
  nonCoverCount: number;
}

/**
 * Avalia se uma página com capa mista é elegível para a recuperação atômica segura.
 * Elegibilidade estrita:
 * - Exatamente 1 full_page_cover
 * - Pelo menos 1 bloco que não seja full_page_cover
 * Qualquer outro caso (ex: múltiplas capas, zero blocos não-capa) retorna eligible: false (Fail-Closed).
 */
export function evaluateMixedCoverRecovery(
  page: CatalogPage | undefined
): MixedCoverRecoveryEvaluation {
  if (!page || !page.blocks || page.blocks.length === 0) {
    return { eligible: false, coverCount: 0, nonCoverCount: 0 };
  }

  let coverCount = 0;
  let nonCoverCount = 0;

  for (const block of page.blocks) {
    if (block.type === 'full_page_cover') {
      coverCount++;
    } else {
      nonCoverCount++;
    }
  }

  const eligible = coverCount === 1 && nonCoverCount >= 1;

  return {
    eligible,
    coverCount,
    nonCoverCount
  };
}
