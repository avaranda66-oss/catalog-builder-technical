// src/domain/canvas-layout.engine.ts
// Engine Matemático e de Validação do Canvas Estrutural PRESYS (Fase 3A.1)
// Executa cálculos em milímetros, conversões canônicas float, gerador de UUIDs e validação contra constraints físicas.

import {
  StructuralSectionData,
  StructuralCardData,
  StructuralLayoutConfig,
  StructuralLayoutConfigSchema,
  StructuralCardDataSchema,
  StructuralSectionDataSchema,
  SPACING_MM_MAP
} from './canvas-layout.schema';
import type { Catalog, ContentBlock } from './catalog.schema';

// ============================================================================
// 1. Dimensões Físicas Padronizadas da Folha A4 (ISO 216)
// ============================================================================

export { mmToPx, pxToMm } from './physical-units';
import {
  CANONICAL_A4_GEOMETRY,
  getPageContentBox,
  getCanonicalPagePaddingCss
} from './page-geometry';
export {
  CANONICAL_A4_GEOMETRY,
  getPageContentBox,
  getCanonicalPagePaddingCss
};
export type {
  A4PageGeometry,
  PageMarginsMm,
  PageContentBox
} from './page-geometry';

export {
  calculateSnappedResizeWidthMm,
  moveStructuralChildToIndex,
  moveStructuralSectionOnBlocks
} from './structural-interaction';
export type {
  ResizeCalculationParams,
  MoveChildResult,
  MoveSectionResult
} from './structural-interaction';

// ============================================================================
// 1. Dimensões Físicas Padronizadas da Folha A4 (ISO 216)
// ============================================================================

export const A4_PAGE_WIDTH_MM = CANONICAL_A4_GEOMETRY.pageWidthMm;
export const A4_PAGE_HEIGHT_MM = CANONICAL_A4_GEOMETRY.pageHeightMm;


// ============================================================================
// 3. Gerador Centralizado de UUIDs Estáveis (RFC 4122 v4)
// ============================================================================

let fallbackCounter = 0;

export function generateStableId(): string {
  // 1. API padrão do navegador / Node.js
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // 2. crypto.getRandomValues com formatação estrita RFC 4122 v4
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Versão 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variante RFC 4122
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // 3. Fallback determinístico seguro com contador sequencial + timestamp para garantir unicidade em loop
  fallbackCounter = (fallbackCounter + 1) % 0xffff;
  const now = Date.now().toString(16).padStart(12, '0');
  const count = fallbackCounter.toString(16).padStart(4, '0');
  return `00000000-${count}-4000-8000-${now}`;
}

// ============================================================================
// 4. Contratos de Duplicação Estrutural (Garantia de Árvore de IDs Desacoplada)
// ============================================================================

/**
 * Duplica um elemento card gerando um novo UUID estável e preservando conteúdo e semântica.
 */
export function duplicateStructuralElement(card: StructuralCardData): StructuralCardData {
  return {
    ...card,
    id: generateStableId()
  };
}

/**
 * Duplica um bloco structural_section completo:
 * - Gera um novo ContentBlock.id (raiz da seção)
 * - Gera novos IDs para TODOS os cards filhos descendentes
 * - Preserva rigorosamente conteúdo, layout, iconId e badges
 */
export function duplicateStructuralSectionBlock<T extends { id: string; type: string; structuralData?: StructuralSectionData }>(
  block: T
): T {
  const newBlockId = generateStableId();

  let clonedStructuralData: StructuralSectionData | undefined = undefined;
  if (block.structuralData) {
    const rawCloned = {
      ...block.structuralData,
      layout: { ...block.structuralData.layout },
      children: Array.isArray(block.structuralData.children)
        ? block.structuralData.children.map((child) => duplicateStructuralElement(child))
        : []
    };
    clonedStructuralData = StructuralSectionDataSchema.parse(rawCloned);
  }

  return {
    ...block,
    id: newBlockId,
    structuralData: clonedStructuralData
  };
}

// ============================================================================
// 5. Constraints de Layout e Engine de Validação
// ============================================================================

export interface LayoutConstraints {
  /** Largura máxima disponível no content box no contexto da validação (em mm) */
  availableWidthMm: number;
  /** Altura máxima disponível no content box (opcional) */
  availableHeightMm?: number;
}

export type LayoutIssueCode =
  | 'OUTSIDE_SAFE_WIDTH'
  | 'INVALID_COLUMNS'
  | 'NEGATIVE_SIZE'
  | 'MISSING_FIXED_WIDTH'
  | 'EMPTY_SECTION';

export interface LayoutIssue {
  code: LayoutIssueCode;
  severity: 'error' | 'warning';
  message: string;
  field?: string;
  details?: Record<string, any>;
}

export interface LayoutValidationResult {
  valid: boolean;
  issues: LayoutIssue[];
}

export class A4LayoutEngine {
  /**
   * Valida uma seção estrutural contra as restrições físicas fornecidas.
   * Não esconde a ausência de contexto: constraints é obrigatório.
   */
  static validateSection(
    sectionData: StructuralSectionData,
    constraints: LayoutConstraints
  ): LayoutValidationResult {
    const issues: LayoutIssue[] = [];

    if (!sectionData || !sectionData.layout) {
      issues.push({
        code: 'NEGATIVE_SIZE',
        severity: 'error',
        message: 'Configuração de layout inexistente ou corrompida'
      });
      return { valid: false, issues };
    }

    const { layout, children } = sectionData;

    // 1. Validação de Colunas
    if (!Number.isInteger(layout.columns) || layout.columns < 1 || layout.columns > 6) {
      issues.push({
        code: 'INVALID_COLUMNS',
        severity: 'error',
        field: 'layout.columns',
        message: `Número de colunas inválido (${layout.columns}). O permitido é de 1 a 6 colunas.`
      });
    }

    // 2. Validação de Largura Condicional (fill vs fixed)
    if (layout.widthMode === 'fixed') {
      if (layout.fixedWidthMm === undefined || layout.fixedWidthMm === null || layout.fixedWidthMm <= 0) {
        issues.push({
          code: 'MISSING_FIXED_WIDTH',
          severity: 'error',
          field: 'layout.fixedWidthMm',
          message: 'fixedWidthMm é obrigatório e deve ser maior que 0 quando widthMode é "fixed"'
        });
      } else if (layout.fixedWidthMm > constraints.availableWidthMm) {
        issues.push({
          code: 'OUTSIDE_SAFE_WIDTH',
          severity: 'error',
          field: 'layout.fixedWidthMm',
          message: `Largura fixa de ${layout.fixedWidthMm} mm excede o espaço disponível de ${constraints.availableWidthMm} mm.`,
          details: { requested: layout.fixedWidthMm, available: constraints.availableWidthMm }
        });
      }
    } else if (layout.widthMode === 'fill') {
      // fill ocupa 100% da largura disponível informada
      if (constraints.availableWidthMm <= 0) {
        issues.push({
          code: 'OUTSIDE_SAFE_WIDTH',
          severity: 'error',
          field: 'constraints.availableWidthMm',
          message: 'Espaço disponível deve ser positivo'
        });
      }
    }

    // 3. Validação de Seção Vazia (Warning Editorial, Não Erro Fatal)
    if (!Array.isArray(children) || children.length === 0) {
      issues.push({
        code: 'EMPTY_SECTION',
        severity: 'warning',
        field: 'children',
        message: 'A seção não possui elementos filhos cadastrados.'
      });
    }

    const valid = !issues.some((i) => i.severity === 'error');
    return { valid, issues };
  }

  /**
   * Calcula a largura estimada em mm de cada coluna de um grid estrutural,
   * deduzindo o gap entre colunas da largura total disponível.
   */
  static calculateColumnWidthMm(
    totalWidthMm: number,
    columns: number,
    gapToken: keyof typeof SPACING_MM_MAP
  ): number {
    if (columns <= 0) return 0;
    const gapMm = SPACING_MM_MAP[gapToken] ?? 0;
    const totalGapMm = gapMm * (columns - 1);
    const usableWidth = Math.max(0, totalWidthMm - totalGapMm);
    return usableWidth / columns;
  }
}

// ============================================================================
// 6. Helpers de Mutação Imutável (Fase 3A.2 Contextual Inspector)
// ============================================================================

/**
 * Atualiza um card estrutural filho por seu UUID estável (childId).
 * Garante mutação 100% imutável preservando campos irmãos.
 * Retorna { data, found } evitando falhas silenciosas.
 */
export function updateStructuralChildById(
  structuralData: StructuralSectionData,
  childId: string,
  updates: Partial<Omit<StructuralCardData, 'id'>>
): { data: StructuralSectionData; found: boolean } {
  let found = false;
  const newChildren = structuralData.children.map((child) => {
    if (child.id === childId) {
      found = true;
      return {
        ...child,
        ...updates,
        id: child.id // O UUID original é estritamente imutável
      };
    }
    return child;
  });

  if (!found) {
    return { data: structuralData, found: false };
  }

  return {
    data: {
      ...structuralData,
      children: newChildren
    },
    found: true
  };
}

/**
 * Atualiza as configurações de layout de uma seção estrutural de forma imutável.
 * Valida o resultado contra StructuralLayoutConfigSchema.
 */
export function updateStructuralLayout(
  structuralData: StructuralSectionData,
  layoutUpdates: Partial<StructuralLayoutConfig>
): StructuralSectionData {
  const mergedLayout = {
    ...structuralData.layout,
    ...layoutUpdates
  };

  // Se o modo resultante for 'fill', remove fixedWidthMm de forma imutável e type-safe
  const normalizedLayout =
    mergedLayout.widthMode === 'fill'
      ? (() => {
          const { fixedWidthMm, ...rest } = mergedLayout;
          return rest;
        })()
      : mergedLayout;

  // Validação estrita via Zod schema (impede fixedWidthMm <= 0 quando fixed)
  const validatedLayout = StructuralLayoutConfigSchema.parse(normalizedLayout);

  return {
    ...structuralData,
    layout: validatedLayout
  };
}

/**
 * Resolve a seleção atômica de elementos do editor contra a estrutura do catálogo.
 * Garante as invariantes de integridade (Fase 3A.2B):
 * 1. blockId nulo ou catálogo nulo -> { selectedBlockId: null, selectedChildId: null }
 * 2. blockId inexistente no catálogo -> { selectedBlockId: null, selectedChildId: null }
 * 3. blockId para bloco legado (não structural_section) -> { selectedBlockId: blockId, selectedChildId: null }
 * 4. blockId para structural_section:
 *    - Se childId existir em structuralData.children -> { selectedBlockId: blockId, selectedChildId: childId }
 *    - Se childId for nulo ou não existir em children -> { selectedBlockId: blockId, selectedChildId: null }
 */
export function resolveEditorSelection(
  catalog: Catalog | null,
  blockId: string | null,
  childId?: string | null
): { selectedBlockId: string | null; selectedChildId: string | null } {
  if (!catalog || !blockId) {
    return { selectedBlockId: null, selectedChildId: null };
  }

  // Localiza o bloco dentro de qualquer página do catálogo
  let targetBlock: ContentBlock | null = null;
  for (const page of catalog.pages || []) {
    const found = page.blocks?.find((b) => b.id === blockId);
    if (found) {
      targetBlock = found;
      break;
    }
  }

  // Se o blockId não existe no documento ativo, reseta ambas as seleções
  if (!targetBlock) {
    return { selectedBlockId: null, selectedChildId: null };
  }

  // Bloco legado: nunca possui childId
  if (targetBlock.type !== 'structural_section') {
    return { selectedBlockId: blockId, selectedChildId: null };
  }

  // Seção estrutural: valida existência estrita do childId
  if (childId && targetBlock.structuralData?.children?.some((c) => c.id === childId)) {
    return { selectedBlockId: blockId, selectedChildId: childId };
  }

  return { selectedBlockId: blockId, selectedChildId: null };
}

// ============================================================================
// 8. Factories Canônicas de Criação (Geração Interna Estrita de Stable IDs)
// ============================================================================

export interface CreateCardOptions {
  title?: string;
  body?: string;
  badge?: string;
  iconId?: string;
  emphasis?: 'normal' | 'highlight' | 'informative' | 'technical';
}

/**
 * Cria um elemento feature_card com novo UUID RFC 4122 v4 gerado internamente.
 * A API pública NÃO aceita ID externo; qualquer tentativa de injeção runtime via cast é ignorada.
 * Por padrão, campos de texto printable nascem vazios para evitar vazamento de locale.
 */
export function createStructuralFeatureCard(options?: CreateCardOptions): StructuralCardData {
  const freshId = generateStableId();

  return StructuralCardDataSchema.parse({
    id: freshId,
    type: 'feature_card',
    title: options?.title ?? '',
    body: options?.body ?? '',
    emphasis: options?.emphasis ?? 'normal',
    badge: options?.badge?.trim() || undefined,
    iconId: options?.iconId?.trim() || undefined
  });
}

export interface CreateSectionOptions {
  title?: string;
  subtitle?: string;
  badgeText?: string;
  iconId?: string;
  layout?: Partial<StructuralLayoutConfig>;
  cards?: CreateCardOptions[];
}

/**
 * Cria um ContentBlock do tipo structural_section com novo UUID RFC 4122 v4 gerado internamente.
 * A API pública NÃO aceita ID externo nem cards materializados com IDs próprios.
 * Cada card template em options.cards gera uma nova instância via createStructuralFeatureCard.
 */
export function createStructuralSectionBlock(options?: CreateSectionOptions): ContentBlock {
  const freshBlockId = generateStableId();

  const layout = StructuralLayoutConfigSchema.parse({
    mode: 'grid',
    columns: 4,
    widthMode: 'fill',
    gap: 'sm',
    padding: 'md',
    density: 'normal',
    align: 'left',
    background: 'soft',
    border: 'subtle',
    radius: 'sm',
    ...(options?.layout || {})
  });

  const children = (options?.cards || []).map((cardOptions) =>
    createStructuralFeatureCard(cardOptions)
  );

  return {
    id: freshBlockId,
    type: 'structural_section',
    title: options?.title ?? '',
    subtitle: options?.subtitle ?? '',
    badgeText: options?.badgeText ?? '',
    structuralData: StructuralSectionDataSchema.parse({
      version: 1,
      iconId: options?.iconId?.trim() || undefined,
      layout,
      children
    })
  };
}

// ============================================================================
// 9. Helpers de Ciclo de Vida de Cards (Fail-Closed, ID-First, Schema Validado)
// ============================================================================

/**
 * Adiciona um novo card ao final de structuralData.children.
 * Retorna o structuralData atualizado e o card criado com seu novo UUID.
 */
export function appendStructuralChild(
  structuralData: StructuralSectionData,
  cardOptions?: CreateCardOptions
): { data: StructuralSectionData; createdChild: StructuralCardData } {
  const newCard = createStructuralFeatureCard(cardOptions);
  const updatedData: StructuralSectionData = {
    ...structuralData,
    children: [...structuralData.children, newCard]
  };

  return {
    data: StructuralSectionDataSchema.parse(updatedData),
    createdChild: newCard
  };
}

/**
 * Insere um novo card imediatamente após o card identificado por targetChildId.
 * Contrato Fail-Closed: Se targetChildId não existir, retorna found: false sem mutar dados (NÃO faz append silencioso).
 */
export function insertStructuralChildAfter(
  structuralData: StructuralSectionData,
  targetChildId: string,
  cardOptions?: CreateCardOptions
): { data: StructuralSectionData; found: boolean; createdChild?: StructuralCardData } {
  const targetIndex = structuralData.children.findIndex((c) => c.id === targetChildId);
  if (targetIndex === -1) {
    return { data: structuralData, found: false };
  }

  const newCard = createStructuralFeatureCard(cardOptions);
  const newChildren = [...structuralData.children];
  newChildren.splice(targetIndex + 1, 0, newCard);

  const updatedData: StructuralSectionData = {
    ...structuralData,
    children: newChildren
  };

  return {
    data: StructuralSectionDataSchema.parse(updatedData),
    found: true,
    createdChild: newCard
  };
}

/**
 * Duplica um card existente por seu childId gerando um novo UUID estável.
 * Insere a cópia imediatamente após o card original.
 * Contrato Fail-Closed: Se childId não existir, retorna found: false sem mutar dados (NÃO cria card).
 */
export function duplicateStructuralChildById(
  structuralData: StructuralSectionData,
  childId: string
): { data: StructuralSectionData; found: boolean; createdChild?: StructuralCardData } {
  const targetIndex = structuralData.children.findIndex((c) => c.id === childId);
  if (targetIndex === -1) {
    return { data: structuralData, found: false };
  }

  const targetCard = structuralData.children[targetIndex];
  const clonedCard = duplicateStructuralElement(targetCard);

  const newChildren = [...structuralData.children];
  newChildren.splice(targetIndex + 1, 0, clonedCard);

  const updatedData: StructuralSectionData = {
    ...structuralData,
    children: newChildren
  };

  return {
    data: StructuralSectionDataSchema.parse(updatedData),
    found: true,
    createdChild: clonedCard
  };
}

/**
 * Remove um card por seu childId.
 * Contrato Fail-Closed: Se childId não existir, retorna found: false sem mutar dados.
 */
export function removeStructuralChildById(
  structuralData: StructuralSectionData,
  childId: string
): { data: StructuralSectionData; found: boolean; removedChild?: StructuralCardData } {
  const targetIndex = structuralData.children.findIndex((c) => c.id === childId);
  if (targetIndex === -1) {
    return { data: structuralData, found: false };
  }

  const removedCard = structuralData.children[targetIndex];
  const updatedData: StructuralSectionData = {
    ...structuralData,
    children: structuralData.children.filter((c) => c.id !== childId)
  };

  return {
    data: StructuralSectionDataSchema.parse(updatedData),
    found: true,
    removedChild: removedCard
  };
}

/**
 * Reordena um card por seu childId na direção 'up' ou 'down'.
 * Contrato Fail-Closed:
 * - Se childId não existir: retorna { data, found: false, moved: false }.
 * - Se estiver no limite (ex: 'up' no primeiro ou 'down' no último): retorna { data, found: true, moved: false }.
 * - Caso contrário: permuta as posições preservando 100% dos IDs e retorna { data, found: true, moved: true }.
 */
export function moveStructuralChild(
  structuralData: StructuralSectionData,
  childId: string,
  direction: 'up' | 'down'
): { data: StructuralSectionData; found: boolean; moved: boolean } {
  const index = structuralData.children.findIndex((c) => c.id === childId);
  if (index === -1) {
    return { data: structuralData, found: false, moved: false };
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= structuralData.children.length) {
    return { data: structuralData, found: true, moved: false };
  }

  const newChildren = [...structuralData.children];
  const [targetChild] = newChildren.splice(index, 1);
  newChildren.splice(targetIndex, 0, targetChild);

  const updatedData: StructuralSectionData = {
    ...structuralData,
    children: newChildren
  };

  return {
    data: StructuralSectionDataSchema.parse(updatedData),
    found: true,
    moved: true
  };
}
