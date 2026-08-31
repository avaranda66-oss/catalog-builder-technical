// ============================================================================
// TEAM AUTH & COLLABORATIVE AUDIT TYPES
// ============================================================================

export interface TeamUser {
  id: string
  name: string
  area: string
  email?: string
  loggedAt: string
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

export const DEFAULT_ADMIN_PASSWORD = 'presysadmin'
