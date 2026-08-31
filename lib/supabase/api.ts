// ============================================================================
// SUPABASE API — CRUD for Catalogs, Products, Pages, and Images
// ============================================================================

import { supabase, isSupabaseConfigured } from './client'
import { Catalog, Product, FieldDefinition } from '../types/database'
import { CatalogPage, DesignTokens, ContactInfo } from '../types/catalog-builder'

// ---------------------------------------------------------------------------
// Local Storage Keys
// ---------------------------------------------------------------------------

const LS_KEY = 'catalog-builder-state'
const LS_VERSION = 2

export interface PersistedState {
  version: number
  catalog: Catalog | null
  products: Product[]
  fieldDefinitions: FieldDefinition[]
  pages: CatalogPage[]
  designTokens: DesignTokens
  contact: ContactInfo
  savedAt: string
}

// ---------------------------------------------------------------------------
// LOCAL STORAGE — Fallback / Offline Cache
// ---------------------------------------------------------------------------

export function saveToLocalStorage(state: Omit<PersistedState, 'version' | 'savedAt'>): void {
  try {
    const payload: PersistedState = {
      ...state,
      version: LS_VERSION,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(LS_KEY, JSON.stringify(payload))
    console.log('[Persistence] Saved to localStorage at', payload.savedAt)
  } catch (err) {
    console.error('[Persistence] Failed to save to localStorage:', err)
  }
}

export function loadFromLocalStorage(): PersistedState | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed: PersistedState = JSON.parse(raw)
    if (parsed.version !== LS_VERSION) {
      console.warn('[Persistence] localStorage version mismatch, ignoring cache')
      return null
    }
    console.log('[Persistence] Loaded from localStorage, saved at', parsed.savedAt)
    return parsed
  } catch (err) {
    console.error('[Persistence] Failed to load from localStorage:', err)
    return null
  }
}

export function clearLocalStorage(): void {
  localStorage.removeItem(LS_KEY)
}

// ---------------------------------------------------------------------------
// SUPABASE — Catalog CRUD
// ---------------------------------------------------------------------------

export async function fetchCatalog(catalogId: string): Promise<Catalog | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const { data, error } = await supabase
      .from('catalogs')
      .select('*')
      .eq('id', catalogId)
      .single()
    if (error) throw error
    return data as Catalog
  } catch (err) {
    console.error('[Supabase] fetchCatalog error:', err)
    return null
  }
}

export async function fetchFirstCatalog(): Promise<Catalog | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const { data, error } = await supabase
      .from('catalogs')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    if (error) throw error
    return data as Catalog
  } catch (err) {
    console.error('[Supabase] fetchFirstCatalog error:', err)
    return null
  }
}

export async function saveCatalog(catalog: Catalog): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  try {
    const { error } = await supabase
      .from('catalogs')
      .upsert({
        id: catalog.id,
        name: catalog.name,
        locale: catalog.locale,
        status: catalog.status,
        template_key: catalog.template_key,
        brand: catalog.brand as any,
        version: catalog.version,
        updated_at: new Date().toISOString(),
      })
    if (error) throw error
    console.log('[Supabase] Catalog saved:', catalog.id)
    return true
  } catch (err) {
    console.error('[Supabase] saveCatalog error:', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// SUPABASE — Products CRUD
// ---------------------------------------------------------------------------

export async function fetchProducts(catalogId: string): Promise<Product[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('catalog_id', catalogId)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data || []) as Product[]
  } catch (err) {
    console.error('[Supabase] fetchProducts error:', err)
    return []
  }
}

export async function saveProduct(product: Product): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  try {
    const { error } = await supabase
      .from('products')
      .upsert({
        id: product.id,
        catalog_id: product.catalog_id,
        sku: product.sku,
        name: product.name,
        family: product.family,
        status: product.status,
        sort_order: product.sort_order,
        data: product.data as any,
        version: product.version,
        updated_at: new Date().toISOString(),
      })
    if (error) throw error
    console.log('[Supabase] Product saved:', product.sku)
    return true
  } catch (err) {
    console.error('[Supabase] saveProduct error:', err)
    return false
  }
}

export async function saveAllProducts(products: Product[]): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  try {
    const upsertData = products.map((p) => ({
      id: p.id,
      catalog_id: p.catalog_id,
      sku: p.sku,
      name: p.name,
      family: p.family,
      status: p.status,
      sort_order: p.sort_order,
      data: p.data as any,
      version: p.version,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from('products')
      .upsert(upsertData)
    if (error) throw error
    console.log('[Supabase] All products saved:', products.length)
    return true
  } catch (err) {
    console.error('[Supabase] saveAllProducts error:', err)
    return false
  }
}

export async function deleteProduct(productId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
    if (error) throw error
    return true
  } catch (err) {
    console.error('[Supabase] deleteProduct error:', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// SUPABASE — Field Definitions CRUD
// ---------------------------------------------------------------------------

export async function fetchFieldDefinitions(catalogId: string): Promise<FieldDefinition[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const { data, error } = await supabase
      .from('field_definitions')
      .select('*')
      .eq('catalog_id', catalogId)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data || []) as FieldDefinition[]
  } catch (err) {
    console.error('[Supabase] fetchFieldDefinitions error:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// SUPABASE — Image Storage
// ---------------------------------------------------------------------------

export async function uploadImage(
  file: File,
  path: string
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const { error } = await supabase.storage
      .from('catalog-images')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      })
    if (error) throw error

    const { data: urlData } = supabase.storage
      .from('catalog-images')
      .getPublicUrl(path)

    console.log('[Supabase] Image uploaded:', path)
    return urlData.publicUrl
  } catch (err) {
    console.error('[Supabase] uploadImage error:', err)
    return null
  }
}

export async function deleteImage(path: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  try {
    const { error } = await supabase.storage
      .from('catalog-images')
      .remove([path])
    if (error) throw error
    return true
  } catch (err) {
    console.error('[Supabase] deleteImage error:', err)
    return false
  }
}

import { TeamUser, AuditLogItem } from '../types/auth-user'
import { CatalogPreset } from '../types/catalog-builder'

// ---------------------------------------------------------------------------
// FULL SAVE — Save everything: catalog + products + pages + themes + cloud audit
// ---------------------------------------------------------------------------

export async function saveAll(
  state: {
    catalog: Catalog | null
    products: Product[]
    fieldDefinitions: FieldDefinition[]
    pages: CatalogPage[]
    designTokens: DesignTokens
    contact: ContactInfo
    presets?: CatalogPreset[]
    auditLogs?: AuditLogItem[]
  },
  user?: TeamUser | null,
  actionDescription: string = 'Salvação manual de catálogo e produtos'
): Promise<{ supabase: boolean; localStorage: boolean }> {
  const result = { supabase: false, localStorage: false }
  const now = new Date().toISOString()

  // 1. Prepare Audit Item
  const newAuditItem: AuditLogItem = {
    id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    user_name: user?.name || 'Colaborador Presys',
    user_area: user?.area || 'Engenharia',
    action: actionDescription,
    entity_type: 'general',
    timestamp: now,
    details: `${state.products.length} produtos • ${state.pages.length} páginas salvas na nuvem`,
  }

  const updatedAuditLogs = [newAuditItem, ...(state.auditLogs || [])].slice(0, 50)

  // 2. Always save to localStorage
  saveToLocalStorage({
    catalog: state.catalog,
    products: state.products,
    fieldDefinitions: state.fieldDefinitions,
    pages: state.pages,
    designTokens: state.designTokens,
    contact: state.contact,
  })
  result.localStorage = true

  // 3. Save to Supabase Cloud if configured
  if (isSupabaseConfigured() && state.catalog) {
    try {
      // Pack full visual bundle into brand JSONB column for multi-device sync
      const brandPayload = {
        ...(typeof state.catalog.brand === 'object' ? state.catalog.brand : {}),
        companyName: state.contact.companyName,
        website: state.contact.website,
        phone: state.contact.phone,
        email: state.contact.email,
        primaryColor: state.designTokens.colors.primary,
        darkColor: state.designTokens.colors.dark,
        accentColor: state.designTokens.colors.accent,
        headerBg: state.designTokens.colors.headerBg,
        products: state.products,
        pages: state.pages,
        designTokens: state.designTokens,
        contact: state.contact,
        presets: state.presets || [],
        audit_trail: updatedAuditLogs,
        last_updated_by: {
          name: user?.name || 'Colaborador Presys',
          area: user?.area || 'Engenharia',
          timestamp: now,
        },
      }

      const { error: catErr } = await supabase.from('catalogs').upsert({
        id: state.catalog.id,
        name: state.catalog.name,
        locale: state.catalog.locale || 'pt-BR',
        status: state.catalog.status || 'published',
        template_key: state.catalog.template_key || 'presys-premium',
        brand: brandPayload,
        version: (state.catalog.version || 1) + 1,
        updated_at: now,
      })

      if (catErr) {
        console.error('[Supabase] Catalog save error:', catErr)
      } else {
        result.supabase = true
        console.log('[Supabase Cloud Sync] Successfully saved catalog bundle to cloud for team!')
      }
    } catch (err) {
      console.error('[Supabase Cloud Sync] Failed:', err)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// SYNC FROM CLOUD — Pull latest cloud state for multi-device collaboration
// ---------------------------------------------------------------------------

export async function syncFromCloud(initialData: {
  catalog: Catalog
  products: Product[]
  fieldDefinitions: FieldDefinition[]
  pages: CatalogPage[]
  designTokens: DesignTokens
  contact: ContactInfo
}): Promise<{
  catalog: Catalog
  products: Product[]
  fieldDefinitions: FieldDefinition[]
  pages: CatalogPage[]
  designTokens: DesignTokens
  contact: ContactInfo
  presets?: CatalogPreset[]
  auditLogs?: AuditLogItem[]
  lastUpdatedBy?: { name: string; area: string; timestamp: string }
  source: 'supabase' | 'localStorage' | 'initial'
}> {
  if (isSupabaseConfigured()) {
    try {
      const catalog = await fetchFirstCatalog()
      if (catalog) {
        const brandData = (typeof catalog.brand === 'object' && catalog.brand !== null ? catalog.brand : {}) as any

        // Pull full state from cloud bundle
        const cloudProducts = Array.isArray(brandData.products) && brandData.products.length > 0
          ? brandData.products
          : initialData.products

        const fieldDefs = await fetchFieldDefinitions(catalog.id)
        const cloudPages = Array.isArray(brandData.pages) && brandData.pages.length > 0 ? brandData.pages : initialData.pages
        const cloudTokens = brandData.designTokens || initialData.designTokens
        const cloudContact = brandData.contact || initialData.contact
        const cloudPresets = Array.isArray(brandData.presets) ? brandData.presets : []
        const cloudAudit = Array.isArray(brandData.audit_trail) ? brandData.audit_trail : []
        const lastUpdatedBy = brandData.last_updated_by || null

        console.log('[Supabase Cloud Sync] Pulled active cloud state:', catalog.name, 'Products:', cloudProducts.length)

        return {
          catalog,
          products: cloudProducts,
          fieldDefinitions: fieldDefs.length > 0 ? fieldDefs : initialData.fieldDefinitions,
          pages: cloudPages,
          designTokens: cloudTokens,
          contact: cloudContact,
          presets: cloudPresets,
          auditLogs: cloudAudit,
          lastUpdatedBy,
          source: 'supabase',
        }
      }
    } catch (err) {
      console.warn('[Supabase Cloud Sync] Fetch failed:', err)
    }
  }

  // Fallback to localStorage or initial
  const loaded = await loadAll(initialData)
  return {
    catalog: loaded.catalog || initialData.catalog,
    products: loaded.products.length > 0 ? loaded.products : initialData.products,
    fieldDefinitions: loaded.fieldDefinitions,
    pages: loaded.pages,
    designTokens: loaded.designTokens,
    contact: loaded.contact,
    source: loaded.source,
  }
}

// ---------------------------------------------------------------------------
// FULL LOAD — Load from Supabase Cloud (team-first) → localStorage → INITIAL_DATA
// ---------------------------------------------------------------------------

export async function loadAll(initialData: {
  catalog: Catalog
  products: Product[]
  fieldDefinitions: FieldDefinition[]
  pages: CatalogPage[]
  designTokens: DesignTokens
  contact: ContactInfo
}): Promise<PersistedState & { source: 'supabase' | 'localStorage' | 'initial' }> {
  // 1. Try Supabase Cloud first so team edits are always synchronized across devices
  if (isSupabaseConfigured()) {
    try {
      const catalog = await fetchFirstCatalog()
      if (catalog) {
        const products = await fetchProducts(catalog.id)
        const fieldDefs = await fetchFieldDefinitions(catalog.id)
        const brandData = (typeof catalog.brand === 'object' && catalog.brand !== null ? catalog.brand : {}) as any

        const cloudPages = Array.isArray(brandData.pages) && brandData.pages.length > 0 ? brandData.pages : initialData.pages
        const cloudTokens = brandData.designTokens || initialData.designTokens
        const cloudContact = brandData.contact || initialData.contact

        if (products.length > 0) {
          console.log('[Persistence] Loaded synchronized team dataset from Supabase Cloud')
          const supabaseState = {
            catalog,
            products,
            fieldDefinitions: fieldDefs.length > 0 ? fieldDefs : initialData.fieldDefinitions,
            pages: cloudPages,
            designTokens: cloudTokens,
            contact: cloudContact,
          }
          saveToLocalStorage(supabaseState)

          return {
            ...supabaseState,
            version: LS_VERSION,
            savedAt: new Date().toISOString(),
            source: 'supabase',
          }
        }
      }
    } catch (err) {
      console.warn('[Persistence] Supabase load failed, trying local cache:', err)
    }
  }

  // 2. Try localStorage if offline or Supabase not reachable
  const cached = loadFromLocalStorage()
  if (cached && cached.catalog && cached.products && cached.products.length > 0) {
    console.log('[Persistence] Loaded offline working session from localStorage, savedAt:', cached.savedAt)
    return { ...cached, source: 'localStorage' }
  }

  // 3. Fallback to initial seed data
  console.log('[Persistence] Using initial seed data')
  const defaultState = {
    ...initialData,
    version: LS_VERSION,
    savedAt: new Date().toISOString(),
    source: 'initial' as const,
  }
  saveToLocalStorage(defaultState)
  return defaultState
}

// ---------------------------------------------------------------------------
// IMAGE FILE → DATA URL (for offline/local usage without Supabase Storage)
// ---------------------------------------------------------------------------

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
