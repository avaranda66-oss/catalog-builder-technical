import type { UserRole } from './database'

export interface TeamUser {
  id: string
  name: string
  area: string
  email?: string
  loggedAt: string
  /** Loaded from public.profiles after the access token is verified by Auth. */
  role: UserRole
}

export interface AuditLogItem {
  id: string
  user_name: string
  user_area: string
  action: string
  entity_type: 'product' | 'page' | 'theme' | 'pdf_import' | 'general'
  entity_name?: string
  timestamp: string
  details?: string
}

export const PREDEFINED_AREAS = [
  'Metrologia & Laboratório',
  'Engenharia de Produto',
  'Automação & Firmware',
  'Vendas Técnicas & Comercial',
  'Qualidade & Garantia',
  'Diretoria & Gestão',
  'Marketing & Catálogos',
] as const
