// src/domain/canvas-layout.schema.ts
// Fundação de Domínio do Canvas Estrutural PRESYS (Fase 3A.1)
// Define tokens corporativos, contratos de layout em milímetros e schemas Zod estritos.

import { z } from 'zod';

// ============================================================================
// 1. Tokens Corporativos de Layout e Tipografia (Sem CSS Livre / Sem Valores Arbitrários)
// ============================================================================

export const CanvasSpacingTokenSchema = z.enum(['none', 'xs', 'sm', 'md', 'lg', 'xl']);
export type CanvasSpacingToken = z.infer<typeof CanvasSpacingTokenSchema>;

export const CanvasDensityTokenSchema = z.enum(['compact', 'normal', 'comfortable']);
export type CanvasDensityToken = z.infer<typeof CanvasDensityTokenSchema>;

export const CanvasRadiusTokenSchema = z.enum(['none', 'sm', 'md', 'lg']);
export type CanvasRadiusToken = z.infer<typeof CanvasRadiusTokenSchema>;

export const CanvasBorderTokenSchema = z.enum(['none', 'subtle', 'solid', 'accent']);
export type CanvasBorderToken = z.infer<typeof CanvasBorderTokenSchema>;

export const CanvasBackgroundTokenSchema = z.enum(['transparent', 'surface', 'soft', 'technical']);
export type CanvasBackgroundToken = z.infer<typeof CanvasBackgroundTokenSchema>;

export const CanvasTypographyRoleSchema = z.enum([
  'heading',
  'subheading',
  'body',
  'caption',
  'technical',
  'badge'
]);
export type CanvasTypographyRole = z.infer<typeof CanvasTypographyRoleSchema>;

// Mapeamento canônico: tokens corporativos para milímetros de espaçamento
export const SPACING_MM_MAP: Record<CanvasSpacingToken, number> = {
  none: 0,
  xs: 2,
  sm: 3,
  md: 4,
  lg: 6,
  xl: 8
};

// ============================================================================
// 2. Configuração de Layout Estrutural (Fill-First com Validação Condicional)
// ============================================================================

const BaseStructuralLayoutConfigSchema = z.object({
  mode: z.enum(['grid', 'stack']).default('grid'),
  columns: z.number().int().min(1).max(6).default(4),
  widthMode: z.enum(['fill', 'fixed']).default('fill'),
  fixedWidthMm: z.number().optional(),
  minHeightMm: z.number().min(0).optional(),
  gap: CanvasSpacingTokenSchema.default('sm'),
  padding: CanvasSpacingTokenSchema.default('md'),
  density: CanvasDensityTokenSchema.default('normal'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  background: CanvasBackgroundTokenSchema.default('transparent'),
  border: CanvasBorderTokenSchema.default('none'),
  radius: CanvasRadiusTokenSchema.default('none')
});

export const StructuralLayoutConfigSchema = BaseStructuralLayoutConfigSchema.superRefine((data, ctx) => {
  if (data.widthMode === 'fixed') {
    if (data.fixedWidthMm === undefined || data.fixedWidthMm === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fixedWidthMm'],
        message: 'fixedWidthMm é obrigatório quando widthMode é "fixed"'
      });
    } else if (data.fixedWidthMm <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fixedWidthMm'],
        message: 'fixedWidthMm deve ser maior que 0 mm'
      });
    }
  }
});

export type StructuralLayoutConfig = z.infer<typeof StructuralLayoutConfigSchema>;

// ============================================================================
// 3. Card Estrutural (Elemento Filho com UUID Estável e Semântica Fechada)
// ============================================================================

export const StructuralCardDataSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('feature_card'),
  title: z.string().default(''),
  body: z.string().default(''),
  badge: z.string().optional(),
  iconId: z.string().optional(), // Identificador semântico corporativo ('network', 'monitor', etc.)
  emphasis: z.enum(['normal', 'highlight', 'informative', 'technical']).default('normal')
});

export type StructuralCardData = z.infer<typeof StructuralCardDataSchema>;
export type StructuralElement = StructuralCardData;

// ============================================================================
// 4. Dados Estruturais da Seção (ContentBlock.title/subtitle/badgeText Reutilizados)
// ============================================================================

export const BaseStructuralSectionDataSchema = z.object({
  version: z.literal(1).default(1),
  iconId: z.string().optional(),
  layout: StructuralLayoutConfigSchema.default(() => StructuralLayoutConfigSchema.parse({})),
  children: z.array(StructuralCardDataSchema).default([])
});

export const StructuralSectionDataSchema = BaseStructuralSectionDataSchema.superRefine((data, ctx) => {
  const seenIds = new Set<string>();
  data.children.forEach((child, index) => {
    if (seenIds.has(child.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['children', index, 'id'],
        message: `ID de card duplicado detectado na seção: ${child.id}`
      });
    }
    seenIds.add(child.id);
  });
});

export type StructuralSectionData = z.infer<typeof StructuralSectionDataSchema>;
