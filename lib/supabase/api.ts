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

// ---------------------------------------------------------------------------
// FULL SAVE — Save everything: catalog + products + localStorage
// ---------------------------------------------------------------------------

export async function saveAll(state: {
  catalog: Catalog | null
  products: Product[]
  fieldDefinitions: FieldDefinition[]
  pages: CatalogPage[]
  designTokens: DesignTokens
  contact: ContactInfo
}): Promise<{ supabase: boolean; localStorage: boolean }> {
  const result = { supabase: false, localStorage: false }

  // 1. Always save to localStorage
  saveToLocalStorage(state)
  result.localStorage = true

  // 2. Try Supabase if configured
  if (isSupabaseConfigured() && state.catalog) {
    const catalogOk = await saveCatalog(state.catalog)
    const productsOk = await saveAllProducts(state.products)
    result.supabase = catalogOk && productsOk
  }

  return result
}

// ---------------------------------------------------------------------------
// FULL LOAD — Load from localStorage (working session) → Supabase → INITIAL_DATA
// ---------------------------------------------------------------------------

export async function loadAll(initialData: {
  catalog: Catalog
  products: Product[]
  fieldDefinitions: FieldDefinition[]
  pages: CatalogPage[]
  designTokens: DesignTokens
  contact: ContactInfo
}): Promise<PersistedState & { source: 'supabase' | 'localStorage' | 'initial' }> {
  // 1. Try localStorage FIRST — user's local edits and working session must never be lost
  const cached = loadFromLocalStorage()
  if (cached && cached.catalog && cached.products && cached.products.length > 0) {
    console.log('[Persistence] Loaded active working session from localStorage, savedAt:', cached.savedAt)
    return { ...cached, source: 'localStorage' }
  }

  // 2. If localStorage is empty, try loading initial dataset from Supabase
  if (isSupabaseConfigured()) {
    try {
      const catalog = await fetchFirstCatalog()
      if (catalog) {
        const products = await fetchProducts(catalog.id)
        const fieldDefs = await fetchFieldDefinitions(catalog.id)

        if (products.length > 0) {
          console.log('[Persistence] Loaded initial data from Supabase:', catalog.name)
          const supabaseState = {
            catalog,
            products,
            fieldDefinitions: fieldDefs.length > 0 ? fieldDefs : initialData.fieldDefinitions,
            pages: initialData.pages,
            designTokens: initialData.designTokens,
            contact: initialData.contact,
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
      console.warn('[Persistence] Supabase load failed, falling back to seed:', err)
    }
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
