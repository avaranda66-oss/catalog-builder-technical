// src/domain/canvas-layout.engine.ts
// Engine Matemático e de Validação do Canvas Estrutural PRESYS (Fase 3A.1)
// Executa cálculos em milímetros, conversões canônicas float, gerador de UUIDs e validação contra constraints físicas.

import {
  StructuralSectionData,
  StructuralCardData,
  StructuralLayoutConfig,
  StructuralLayoutConfigSchema,
  SPACING_MM_MAP
} from './canvas-layout.schema';

// ============================================================================
// 1. Dimensões Físicas Padronizadas da Folha A4 (ISO 216)
// ============================================================================

export const A4_PAGE_WIDTH_MM = 210;
export const A4_PAGE_HEIGHT_MM = 297;

// ============================================================================
// 2. Conversões Canônicas Bidirecionais (Retornam Float Puro sem Truncamento)
// ============================================================================

export function mmToPx(mm: number, dpi: number = 96): number {
  return (mm * dpi) / 25.4;
}

export function pxToMm(px: number, dpi: number = 96): number {
  return (px * 25.4) / dpi;
}

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
    clonedStructuralData = {
      ...block.structuralData,
      layout: { ...block.structuralData.layout },
      children: Array.isArray(block.structuralData.children)
        ? block.structuralData.children.map((child) => duplicateStructuralElement(child))
        : []
    };
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

  // Validação estrita via Zod schema (impede fixedWidthMm <= 0 quando fixed)
  const validatedLayout = StructuralLayoutConfigSchema.parse(mergedLayout);

  return {
    ...structuralData,
    layout: validatedLayout
  };
}
