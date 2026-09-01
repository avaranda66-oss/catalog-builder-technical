import { z } from 'zod';

export interface LibraryColumn {
  key: string;
  label: string;
  visible?: boolean;
  width?: number;
  isCustom?: boolean;
}

export const TechnicalSpecSchema = z.object({
  range: z.string().optional().default(''),
  unit: z.string().optional().default(''),
  accuracy: z.string().optional().default(''),
  output: z.string().optional().default(''),
  powerSupply: z.string().optional().default(''),
  processConnection: z.string().optional().default(''),
  protectionDegree: z.string().optional().default(''),
  customSpecs: z.record(z.string()).optional().default({})
});

export const ProductSchema = z.object({
  id: z.string(),
  code: z.string().min(1, 'Código é obrigatório'),
  family: z.string().min(1, 'Família é obrigatória'),
  model: z.string().min(1, 'Modelo é obrigatório'),
  description: z.string().optional().default(''),
  specs: TechnicalSpecSchema,
  imageUrl: z.string().optional().default(''),
  createdAt: z.string().optional().default(() => new Date().toISOString()),
  updatedAt: z.string().optional().default(() => new Date().toISOString()),
  version: z.number().int().positive().optional().default(1)
});

export type TechnicalSpec = z.infer<typeof TechnicalSpecSchema>;
export type Product = z.infer<typeof ProductSchema>;
