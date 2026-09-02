import { z } from 'zod';

export const AssetKindSchema = z.enum(['image', 'diagram', 'document', 'logo', 'other']);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetSourceTypeSchema = z.enum(['uploaded', 'imported', 'generated', 'legacy']);
export type AssetSourceType = z.infer<typeof AssetSourceTypeSchema>;

export const AssetApprovalStatusSchema = z.enum(['draft', 'approved', 'rejected', 'archived']);
export type AssetApprovalStatus = z.infer<typeof AssetApprovalStatusSchema>;

export const ProductAssetRoleSchema = z.enum([
  'hero',
  'front',
  'rear',
  'left',
  'right',
  'top',
  'detail',
  'display',
  'terminals',
  'well',
  'application',
  'accessory',
  'diagram',
  'datasheet',
  'other'
]);
export type ProductAssetRole = z.infer<typeof ProductAssetRoleSchema>;

export const AssetAngleSchema = z.enum([
  'front',
  'rear',
  'left',
  'right',
  'three_quarter_front',
  'three_quarter_rear',
  'top',
  'detail',
  'unknown'
]);
export type AssetAngle = z.infer<typeof AssetAngleSchema>;

export interface AssetRecord {
  id: string;
  storage_bucket: string;
  storage_path: string;
  original_filename?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  width_px?: number | null;
  height_px?: number | null;
  sha256?: string | null;
  kind?: AssetKind | null;
  source_type?: AssetSourceType | null;
  approval_status?: AssetApprovalStatus | null;
  parent_asset_id?: string | null;
  generation_provider?: string | null;
  generation_model?: string | null;
  generation_metadata?: Record<string, any> | null;
  generation_prompt_version?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at?: string;
  // Campos legados mantidos para compatibilidade retroativa
  product_id?: string | null;
  role?: string | null;
  alt_text?: string | null;
  sort_order?: number | null;
}

export interface ProductAssetRecord {
  id: string;
  product_id: string;
  asset_id: string;
  role: ProductAssetRole;
  angle?: AssetAngle | null;
  sort_order: number;
  is_primary: boolean;
  is_official: boolean;
  caption?: string | null;
  alt_text?: string | null;
  created_by?: string | null;
  created_at: string;
  // Resolved Asset Join (quando carregado em memória)
  asset?: AssetRecord;
}

export interface AssetAuditLogRecord {
  id: string;
  asset_id?: string | null;
  product_id?: string | null;
  action:
    | 'ASSET_UPLOAD'
    | 'ASSET_LINK_PRODUCT'
    | 'ASSET_UNLINK_PRODUCT'
    | 'ASSET_SET_PRIMARY'
    | 'ASSET_METADATA_UPDATE'
    | 'ASSET_ARCHIVE';
  actor_id?: string | null;
  actor_email?: string | null;
  actor_name?: string | null;
  summary?: string | null;
  details?: Record<string, any>;
  created_at: string;
}

export interface MediaSelection {
  assetId?: string;
  url: string;
  originalFilename?: string;
  role?: ProductAssetRole;
}

export const ROLE_LABELS: Record<ProductAssetRole, string> = {
  hero: 'Foto Principal (Hero)',
  front: 'Vista Frontal',
  rear: 'Vista Traseira',
  left: 'Lateral Esquerda',
  right: 'Lateral Direita',
  top: 'Vista Superior',
  detail: 'Detalhe Construtivo',
  display: 'Display & Teclado',
  terminals: 'Terminais & Conexões',
  well: 'Poço Termométrico',
  application: 'Aplicação Industrial',
  accessory: 'Acessório / Opcional',
  diagram: 'Diagrama Técnico',
  datasheet: 'Certificado / Folha de Dados',
  other: 'Geral / Outros'
};

export const ANGLE_LABELS: Record<AssetAngle, string> = {
  front: 'Frontal (0°)',
  rear: 'Traseira (180°)',
  left: 'Lateral Esquerda (90°)',
  right: 'Lateral Direita (90°)',
  three_quarter_front: 'Perspectiva 3/4 Frontal',
  three_quarter_rear: 'Perspectiva 3/4 Traseira',
  top: 'Superior (Top-down)',
  detail: 'Close-up / Detalhe',
  unknown: 'Não especificado'
};
