export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'admin' | 'editor' | 'viewer'
export type CatalogStatus = 'draft' | 'review' | 'approved' | 'published'
export type ProductStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived'
export type AiRunStatus = 'proposed' | 'approved' | 'rejected' | 'applied' | 'failed'

export interface Profile {
  id: string
  full_name: string | null
  role: UserRole
  created_at: string
}

export interface CatalogBrand {
  workflow?: { assignee: string; comments: DocumentComment[] }
  [key: string]: unknown
  companyName: string
  primaryColor: string
  darkColor: string
  accentColor: string
  logoUrl: string
  website: string
  phone: string
  email: string
}

export interface DocumentComment {
  id: string
  body: string
  authorId: string | null
  authorName: string
  createdAt: string
  resolved: boolean
  sectionId?: string
}

export interface ProductMedia {
  id: string
  url: string
  kind: 'photo' | 'diagram' | 'drawing' | 'certificate'
  title: string
  locale: string
  revision: string
}

export interface SpecificationRow {
  param: string
  value: string | number
  unit?: string
  source?: string
}

export interface Catalog {
  id: string
  name: string
  locale: string
  status: CatalogStatus
  template_key: string
  brand: CatalogBrand
  version: number
  updated_by: string | null
  updated_at: string
  created_at: string
}

export interface FieldDefinition {
  id: string
  catalog_id: string
  section: string
  key: string
  label: string
  field_type: 'text' | 'multiline' | 'number' | 'measurement' | 'range' | 'accuracy' | 'select' | 'multiselect' | 'boolean' | 'image' | 'matrix'
  unit: string | null
  options?: string[] | null
  validation: {
    min?: number
    max?: number
    pattern?: string
    required?: boolean
    enum?: string[]
    basis?: string
  }
  sort_order: number
  visible_in_catalog: boolean
  created_at: string
}

export interface MeasurementValue {
  value: number
  unit: string
  basis?: string
  note?: string
  display?: string
}

export interface RangeValue {
  min: number
  max: number
  unit: string
  note?: string
  display?: string
}

export interface AccuracyValue {
  value: number
  unit: '%FS' | '%RDG' | '%Span' | 'Pa' | 'mbar' | 'bar' | 'psi' | string
  basis?: 'full_scale' | 'reading' | 'span'
  note?: string
  display?: string
}

export interface ElectricalSpecItem {
  signal: string
  range: string | RangeValue
  resolution: string | MeasurementValue
  accuracy: string | AccuracyValue
  note?: string
}

export interface GeneralSpecItem {
  param: string
  desc: string
}

export interface AccessoryItem {
  code: string
  description: string
  imageUrl?: string
  type: 'Standard' | 'Optional'
}

export interface ProductData {
  specs?: SpecificationRow[]
  electrical?: ElectricalSpecItem[]
  general?: GeneralSpecItem[]
  media?: ProductMedia[]
  marketing?: {
    title?: string
    subtitle?: string
    overview?: string
    overview_en?: string
    features?: string[]
    images?: string[]
  }
  pressure_specs?: {
    control_range?: RangeValue | string
    control_stability?: MeasurementValue | string
    display_accuracy?: AccuracyValue | string
    control_speed?: MeasurementValue | string
    pressure_modules?: string
    media_compatibility?: string
    operating_temperature?: RangeValue | string
    [key: string]: unknown
  }
  electrical_specs?: ElectricalSpecItem[]
  general_specs?: GeneralSpecItem[]
  accessories?: AccessoryItem[]
  ordering?: {
    code_parts?: Array<{
      segment: string
      options?: string[]
      description?: string
    }>
  }
  variations?: Array<{
    model: string
    title: string
    description: string
    imageUrl?: string
    visible?: boolean
  }>
  [sectionKey: string]: unknown
}

export interface Product {
  id: string
  catalog_id: string
  sku: string
  name: string
  family: string
  status: ProductStatus
  sort_order: number
  data: ProductData
  version: number
  updated_by: string | null
  updated_at: string
  created_at: string
}

export interface AuditLog {
  id: number
  actor_id: string | null
  actor_type: 'user' | 'ai' | 'system'
  entity_type: string
  entity_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  before: unknown | null
  after: unknown | null
  source: string
  created_at: string
}

export interface AiRun {
  id: string
  actor_id: string | null
  product_id: string | null
  prompt: string
  audio_transcript?: string | null
  tool_calls?: unknown | null
  proposed_patch: {
    summary: string
    changes: Array<{
      path: string
      fieldLabel: string
      oldValue: unknown
      newValue: unknown
      reason?: string
    }>
  }
  status: AiRunStatus
  approved_by?: string | null
  applied_at?: string | null
  created_at: string
}
