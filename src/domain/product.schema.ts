import { z } from 'zod';

export interface LibraryColumn {
  id?: string;
  key: string;
  label: string;
  fieldType?: 'text' | 'number' | 'badge' | 'boolean';
  unit?: string | null;
  visible?: boolean;
  width?: number;
  isCustom?: boolean;
  isSystem?: boolean;
  sortOrder?: number;
}

export interface ProductFamily {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface ProductFamilyField {
  id: string;
  family_id: string;
  field_key: string;
  label: string;
  field_type: string;
  unit?: string | null;
  sort_order: number;
  width: number;
  visible: boolean;
  is_system: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LibraryChangeEvent {
  id: string;
  entity_type: 'product' | 'cell' | 'family' | 'column';
  entity_id: string;
  family_id?: string | null;
  product_id?: string | null;
  field_key?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  action: 'CREATE_PRODUCT' | 'UPDATE_CELL' | 'DELETE_PRODUCT' | 'CREATE_FAMILY' | 'RENAME_FAMILY' | 'DELETE_FAMILY' | 'ADD_COLUMN' | 'RENAME_COLUMN' | 'DELETE_COLUMN';
  summary?: string | null;
  actor_id?: string | null;
  actor_email?: string | null;
  actor_name?: string | null;
  created_at: string;
}

export interface LibraryPresenceUser {
  userId: string;
  clientInstanceId: string;
  userName?: string;
  userEmail?: string;
  familyId?: string;
  productId?: string;
  columnKey?: string;
  activity: 'viewing' | 'editing';
  lastSeenAt: number;
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
  family_id: z.string().optional().nullable(),
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
