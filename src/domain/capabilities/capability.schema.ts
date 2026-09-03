// src/domain/capabilities/capability.schema.ts
// Validação em tempo de execução via Zod para o contrato de capacidades.
// Garante invariantes lógicas: unidade obrigatória em dimensões, coerência de reset e tradução.

import { z } from 'zod';
import { BlockTypeSchema } from '../catalog.schema';
import { CAPABILITY_IDS } from './capability.ids';

export const CapabilityIdSchema = z.enum(
  Object.values(CAPABILITY_IDS) as [string, ...string[]]
);

export const CapabilityCategorySchema = z.enum([
  'content',
  'media',
  'layout',
  'appearance',
  'data',
  'layers'
]);

export const CapabilityValueKindSchema = z.enum([
  'text',
  'number',
  'boolean',
  'color',
  'enum',
  'dimension',
  'asset',
  'collection',
  'structured'
]);

export const CapabilityControlHintSchema = z.enum([
  'text',
  'textarea',
  'number',
  'dimension',
  'select',
  'segmented',
  'toggle',
  'color',
  'asset_picker',
  'range',
  'custom'
]);

export const CapabilityUnitSchema = z.enum([
  'mm',
  'px',
  'percent',
  'pt',
  'token',
  'none'
]);

export const DefaultSourceSchema = z.enum([
  'none',
  'factory',
  'preset',
  'document',
  'derived'
]);

export const ResetPolicySchema = z.enum([
  'none',
  'to_factory',
  'to_preset'
]);

export const TranslationPolicySchema = z.enum([
  'translate',
  'protect',
  'none'
]);

export const WritePolicySchema = z.enum([
  'user_only',
  'read_only',
  'validated_command'
]);

export const EngineFamilySchema = z.enum([
  'flow',
  'structural',
  'cover_legacy',
  'table_legacy',
  'specialized'
]);

export const InspectorFamilySchema = z.enum([
  'simple_content',
  'media',
  'table',
  'structural',
  'hero',
  'composite'
]);

export const RendererSupportSchema = z.object({
  editor: z.boolean(),
  print: z.boolean()
});

export const UniversalActionsSchema = z.object({
  canDuplicate: z.boolean(),
  canDelete: z.boolean(),
  canReset: z.boolean(),
  canReorder: z.boolean()
});

export const CapabilityNumericConstraintSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional()
});

export const CapabilityOptionConstraintSchema = z.object({
  label: z.string().min(1),
  value: z.union([z.string(), z.number()])
});

export const CapabilityConstraintsSchema = z.object({
  numeric: CapabilityNumericConstraintSchema.optional(),
  options: z.array(CapabilityOptionConstraintSchema).optional()
});

export const PropertyCapabilitySchema = z
  .object({
    id: CapabilityIdSchema,
    label: z.string().min(1),
    category: CapabilityCategorySchema,
    valueKind: CapabilityValueKindSchema,
    controlHint: CapabilityControlHintSchema,
    unit: CapabilityUnitSchema,
    defaultSource: DefaultSourceSchema,
    resetPolicy: ResetPolicySchema,
    rendererSupport: RendererSupportSchema,
    translationPolicy: TranslationPolicySchema,
    writePolicy: WritePolicySchema,
    constraints: CapabilityConstraintsSchema.optional()
  })
  .superRefine((data, ctx) => {
    // 1. Controle do tipo dimensão exige unidade física explícita
    if (data.controlHint === 'dimension' && data.unit === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Capability ${data.id} com controlHint='dimension' exige unit diferente de 'none'.`
      });
    }

    // 2. Reset para factory exige defaultSource compatível
    if (data.resetPolicy === 'to_factory' && data.defaultSource === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Capability ${data.id} com resetPolicy='to_factory' não pode ter defaultSource='none'.`
      });
    }

    // 3. Reset para preset exige defaultSource 'preset' ou 'factory'
    if (data.resetPolicy === 'to_preset' && data.defaultSource !== 'preset' && data.defaultSource !== 'factory' && data.defaultSource !== 'derived') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Capability ${data.id} com resetPolicy='to_preset' exige defaultSource 'preset', 'factory' ou 'derived'.`
      });
    }

    // 4. Tradução marcada como 'translate' exige tipo textual ou coleção textual
    if (data.translationPolicy === 'translate' && data.valueKind !== 'text' && data.valueKind !== 'collection') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Capability ${data.id} com translationPolicy='translate' exige valueKind 'text' ou 'collection'.`
      });
    }
  });

export const ElementCapabilityDefinitionSchema = z
  .object({
    blockType: BlockTypeSchema,
    displayName: z.string().min(1),
    engineFamily: EngineFamilySchema,
    inspectorFamily: InspectorFamilySchema,
    capabilities: z.array(PropertyCapabilitySchema),
    universalActions: UniversalActionsSchema
  })
  .superRefine((data, ctx) => {
    // Garantir que não há CapabilityId duplicado no mesmo elemento
    const seenIds = new Set<string>();
    for (const cap of data.capabilities) {
      if (seenIds.has(cap.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `CapabilityId '${cap.id}' duplicado no elemento '${data.blockType}'.`
        });
      }
      seenIds.add(cap.id);
    }
  });
