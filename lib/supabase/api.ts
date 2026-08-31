import { supabase, isSupabaseConfigured } from './client'
import { getAuthenticatedUser } from './auth'
import type { Catalog, Product, FieldDefinition } from '../types/database'
import type { CatalogPage, DesignTokens, ContactInfo, CatalogPreset } from '../types/catalog-builder'
import type { TeamUser, AuditLogItem } from '../types/auth-user'
import { setItemWithQuotaRecovery } from '../storage/safe-storage'

const LS_KEY = 'catalog-builder-state'
const LS_VERSION = 3
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface WorkspaceState {
  catalog: Catalog | null
  products: Product[]
  fieldDefinitions: FieldDefinition[]
  pages: CatalogPage[]
  designTokens: DesignTokens
  contact: ContactInfo
  presets?: CatalogPreset[]
  auditLogs?: AuditLogItem[]
}

export interface PersistedState extends WorkspaceState {
  version: number
  savedAt: string
}

export type PersistenceErrorCode = 'local_storage' | 'unauthenticated' | 'forbidden' | 'conflict' | 'network' | 'invalid_data' | 'not_found' | 'migration_required'

export class PersistenceError extends Error {
  constructor(public readonly code: PersistenceErrorCode, message: string) {
    super(message)
    this.name = 'PersistenceError'
  }
}

export interface SaveResult {
  supabase: boolean
  localStorage: boolean
  status: 'cloud' | 'local' | 'conflict' | 'error'
  catalog?: Catalog
  products?: Product[]
  fieldDefinitions?: FieldDefinition[]
  error?: { code: PersistenceErrorCode; message: string }
}

export interface CatalogVersion {
  id: string
  catalog_id: string
  version: number
  status: Catalog['status']
  snapshot: { catalog: Catalog; products: Product[]; fieldDefinitions: FieldDefinition[] }
  created_by: string
  created_at: string
  summary: string
}

type InitialState = WorkspaceState & { catalog: Catalog }
export type LoadedWorkspace = PersistedState & {
  catalog: Catalog
  source: 'supabase' | 'localStorage' | 'initial'
  lastUpdatedBy?: { name: string; area: string; timestamp: string }
}

function cacheKey(catalogId?: string, userId?: string): string {
  return catalogId ? `${LS_KEY}:${userId || 'local'}:${catalogId}` : LS_KEY
}

export function saveToLocalStorage(state: WorkspaceState, userId?: string): boolean {
  try {
    const payload: PersistedState = { ...state, version: LS_VERSION, savedAt: new Date().toISOString() }
    return setItemWithQuotaRecovery(localStorage, cacheKey(state.catalog?.id, userId), JSON.stringify(payload))
  } catch {
    return false
  }
}

export function loadFromLocalStorage(catalogId?: string, userId?: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(cacheKey(catalogId, userId))
      || (!userId ? localStorage.getItem(LS_KEY) : null)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || ![2, LS_VERSION].includes(Number(parsed.version))) return null
    if (!isRecord(parsed.catalog) || (catalogId && parsed.catalog.id !== catalogId)) return null
    if (!Array.isArray(parsed.products) || !Array.isArray(parsed.pages) || !Array.isArray(parsed.fieldDefinitions)) return null
    if (!isRecord(parsed.designTokens) || !isRecord(parsed.contact)) return null
    return parsed as unknown as PersistedState
  } catch {
    return null
  }
}

export function clearLocalStorage(catalogId?: string, userId?: string): void {
  localStorage.removeItem(cacheKey(catalogId, userId))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function persistenceError(error: unknown): PersistenceError {
  if (error instanceof PersistenceError) return error
  const code = isRecord(error) ? error.code : undefined
  const message = isRecord(error) && typeof error.message === 'string' ? error.message : ''
  if (code === '40001') return new PersistenceError('conflict', 'Outra pessoa alterou este catálogo ou um produto. Suas edições locais foram preservadas. Compare com a versão da nuvem antes de tentar novamente.')
  if (code === '42501') {
    if (/Aprovação exige administrador diferente/i.test(message)) return new PersistenceError('forbidden', 'Aprovação exige um administrador diferente de quem fez a última alteração.')
    if (/Publicação exige revisão aprovada/i.test(message)) return new PersistenceError('forbidden', 'Publicação exige uma revisão aprovada e nenhum conteúdo alterado depois dela.')
    if (/A aprovação ocorre na revisão/i.test(message)) return new PersistenceError('forbidden', 'A aprovação é feita na revisão do documento, não diretamente no cadastro do produto.')
    if (/Sem permissão de edição/i.test(message)) return new PersistenceError('forbidden', 'Sua sessão não tem permissão de edição. Entre novamente com um perfil editor ou administrador.')
    return new PersistenceError('forbidden', 'Seu perfil não permite esta operação ou esta aprovação exige outro revisor.')
  }
  if (code === 'PGRST202' || code === '42883' || code === '42P01') return new PersistenceError('migration_required', 'O banco ainda não recebeu a migração de colaboração. Nenhum salvamento remoto foi confirmado.')
  if (code === '23505') return new PersistenceError('invalid_data', 'Já existe um produto com este código no cadastro de origem. Revise os códigos antes de salvar.')
  if (code === '22023' || code === '22P02' || code === '23514') return new PersistenceError('invalid_data', message || 'Os dados não atendem ao contrato de persistência.')
  return new PersistenceError('network', 'Não foi possível confirmar a operação na nuvem. Suas edições locais não foram descartadas.')
}

async function requireUser(write = false): Promise<TeamUser> {
  const user = await getAuthenticatedUser()
  if (!user) throw new PersistenceError('unauthenticated', 'Entre com sua conta corporativa para acessar a nuvem.')
  if (write && user.role === 'viewer') throw new PersistenceError('forbidden', 'Seu perfil permite apenas consulta.')
  return user
}

export async function fetchCatalog(catalogId: string): Promise<Catalog | null> {
  if (!isSupabaseConfigured()) return null
  await requireUser()
  const { data, error } = await supabase.from('catalogs').select('*').eq('id', catalogId).maybeSingle()
  if (error) throw persistenceError(error)
  return data as Catalog | null
}

export async function fetchCatalogs(): Promise<Catalog[]> {
  if (!isSupabaseConfigured()) return []
  await requireUser()
  const { data, error } = await supabase.from('catalogs').select('*').order('updated_at', { ascending: false })
  if (error) throw persistenceError(error)
  return (data || []) as Catalog[]
}

export async function createCatalog(name: string): Promise<Catalog> {
  await requireUser(true)
  if (!name.trim()) throw new PersistenceError('invalid_data', 'Informe um nome para o catálogo.')
  const { data, error } = await supabase.rpc('create_catalog_workspace', { p_name: name.trim() })
  if (error) throw persistenceError(error)
  return data as Catalog
}

export async function fetchProducts(catalogId: string): Promise<Product[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await supabase.from('catalog_products')
    .select('sort_order,product:products(*)').eq('catalog_id', catalogId).order('sort_order', { ascending: true })
  if (error) throw persistenceError(error)
  return ((data || []) as unknown as Array<{ sort_order: number; product: Product }>).map(({ product, sort_order }) => ({ ...product, sort_order }))
}

export async function fetchProductLibrary(options: { search?: string; offset?: number; limit?: number } = {}): Promise<Product[]> {
  if (!isSupabaseConfigured()) return []
  await requireUser()
  const offset = Math.max(0, options.offset || 0)
  const limit = Math.min(100, Math.max(1, options.limit || 50))
  let query = supabase.from('products').select('*').order('name').order('id').range(offset, offset + limit - 1)
  if (options.search?.trim()) query = query.ilike('name', `%${options.search.trim().replace(/[%_]/g, '')}%`)
  const { data, error } = await query
  if (error) throw persistenceError(error)
  return refreshMediaUrls((data || []) as Product[])
}

export async function fetchFieldDefinitions(catalogId: string): Promise<FieldDefinition[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await supabase.from('field_definitions').select('*').eq('catalog_id', catalogId).order('sort_order')
  if (error) throw persistenceError(error)
  return (data || []) as FieldDefinition[]
}

export async function fetchCatalogVersions(catalogId: string): Promise<CatalogVersion[]> {
  await requireUser()
  const { data, error } = await supabase.from('catalog_versions').select('*').eq('catalog_id', catalogId).order('version', { ascending: false }).limit(100)
  if (error) throw persistenceError(error)
  return (data || []) as CatalogVersion[]
}

/** Open an immutable historical snapshot without applying it to current state. */
export async function materializeCatalogVersion(version: CatalogVersion, defaults: InitialState): Promise<InitialState> {
  const { catalog, products, fieldDefinitions } = version.snapshot
  const brand: Record<string, unknown> = isRecord(catalog.brand) ? catalog.brand : {}
  return refreshMediaUrls({
    catalog,
    products,
    fieldDefinitions,
    pages: Array.isArray(brand.pages) ? brand.pages as CatalogPage[] : [],
    designTokens: isRecord(brand.designTokens) ? brand.designTokens as unknown as DesignTokens : defaults.designTokens,
    contact: isRecord(brand.contact) ? brand.contact as unknown as ContactInfo : defaults.contact,
    presets: Array.isArray(brand.presets) ? brand.presets as CatalogPreset[] : [],
  })
}

export async function fetchAuditLogs(catalogId: string): Promise<AuditLogItem[]> {
  const { data, error } = await supabase.from('catalog_versions')
    .select('id,created_at,created_by,summary,status,version').eq('catalog_id', catalogId).order('created_at', { ascending: false }).limit(100)
  if (error) throw persistenceError(error)
  const actorIds = [...new Set((data || []).map((row) => row.created_by as string))]
  const profiles = actorIds.length ? await supabase.from('profiles').select('id,full_name,role').in('id', actorIds) : { data: [], error: null }
  if (profiles.error) throw persistenceError(profiles.error)
  const actors = new Map((profiles.data || []).map((profile) => [profile.id, profile]))
  return (data || []).map((row) => ({
    id: row.id,
    user_name: actors.get(row.created_by)?.full_name || row.created_by,
    user_area: actors.get(row.created_by)?.role || 'Equipe',
    action: row.summary || 'Revisão salva',
    entity_type: 'general',
    timestamp: row.created_at,
    details: `Revisão ${row.version} · ${row.status} · autoria validada no servidor`,
  }))
}

/** Local checkpoint first; the server commits the whole workspace atomically. */
export async function saveAll(state: WorkspaceState, user?: TeamUser | null, description = 'Salvamento do catálogo'): Promise<SaveResult> {
  const localStorageSaved = saveToLocalStorage(state, user?.id)
  const result: SaveResult = { supabase: false, localStorage: localStorageSaved, status: localStorageSaved ? 'local' : 'error' }
  if (!localStorageSaved) result.error = { code: 'local_storage', message: 'O navegador não conseguiu gravar o backup local. Exporte um backup; o armazenamento pode estar cheio.' }
  if (!isSupabaseConfigured() || !user) return result
  try {
    const verifiedUser = await requireUser(true)
    if (verifiedUser.id !== user.id) throw new PersistenceError('unauthenticated', 'A conta ativa mudou. Entre novamente antes de salvar.')
    if (!state.catalog) throw new PersistenceError('invalid_data', 'Selecione um catálogo antes de salvar.')
    const brand: Record<string, unknown> = isRecord(state.catalog.brand) ? { ...state.catalog.brand } : {}
    delete brand.products
    delete brand.audit_trail
    delete brand.last_updated_by
    const canonical = canonicalizeMediaUrls({
      ...state.catalog,
      brand: { ...brand, pages: state.pages, designTokens: state.designTokens, contact: state.contact, presets: state.presets || [] },
    })
    const { data, error } = await supabase.rpc('save_catalog_workspace', {
      p_catalog_id: state.catalog.id,
      p_expected_version: state.catalog.version,
      p_catalog: canonical,
      p_products: canonicalizeMediaUrls(state.products),
      p_fields: state.fieldDefinitions,
      p_description: description,
    })
    if (error) throw persistenceError(error)
    if (!isRecord(data) || !isRecord(data.catalog) || !Array.isArray(data.products)) throw new PersistenceError('invalid_data', 'A nuvem não retornou uma confirmação válida.')
    const catalog = data.catalog as unknown as Catalog
    let mediaWarning = false
    const products = await refreshMediaUrls(data.products as Product[]).catch(() => { mediaWarning = true; return data.products as Product[] })
    const fields = Array.isArray(data.fieldDefinitions) ? data.fieldDefinitions as FieldDefinition[] : state.fieldDefinitions
    const refreshedCatalog = await refreshMediaUrls(catalog).catch(() => { mediaWarning = true; return catalog })
    const checkpoint = saveToLocalStorage({ ...state, catalog: refreshedCatalog, products, fieldDefinitions: fields }, verifiedUser.id)
    return { supabase: true, localStorage: checkpoint, status: 'cloud', catalog: refreshedCatalog, products, fieldDefinitions: fields,
      ...(!checkpoint ? { error: { code: 'local_storage' as const, message: 'Salvo na nuvem, mas o backup local não pôde ser atualizado.' } }
        : mediaWarning ? { error: { code: 'network' as const, message: 'Salvo na nuvem. Algumas imagens não puderam ser renovadas; sincronize novamente para carregá-las.' } } : {}) }
  } catch (error) {
    const failure = persistenceError(error)
    return { ...result, status: failure.code === 'conflict' ? 'conflict' : 'error', error: { code: failure.code, message: failure.message } }
  }
}

export async function syncFromCloud(initial: InitialState, catalogId = initial.catalog.id): Promise<LoadedWorkspace> {
  if (!isSupabaseConfigured()) return loadLocal(initial, catalogId)
  const user = await requireUser()
  // One RPC snapshot avoids mixing an older catalog revision with newer products.
  const { data, error } = await supabase.rpc('get_catalog_workspace', { p_catalog_id: catalogId })
  if (error) throw persistenceError(error)
  if (!isRecord(data) || !isRecord(data.catalog)) throw new PersistenceError('not_found', 'Catálogo não encontrado. Escolha um catálogo acessível.')
  const catalog = data.catalog as unknown as Catalog
  const brand: Record<string, unknown> = isRecord(catalog.brand) ? catalog.brand : {}
  const state: InitialState = {
    catalog,
    products: Array.isArray(data.products) ? data.products as Product[] : [],
    fieldDefinitions: Array.isArray(data.fieldDefinitions) ? data.fieldDefinitions as FieldDefinition[] : [],
    pages: Array.isArray(brand.pages) ? brand.pages as CatalogPage[] : initial.pages,
    designTokens: isRecord(brand.designTokens) ? brand.designTokens as unknown as DesignTokens : initial.designTokens,
    contact: isRecord(brand.contact) ? brand.contact as unknown as ContactInfo : initial.contact,
    presets: Array.isArray(brand.presets) ? brand.presets as CatalogPreset[] : [],
    auditLogs: await fetchAuditLogs(catalogId),
  }
  const refreshed = await refreshMediaUrls(state)
  saveToLocalStorage(refreshed, user.id)
  const latest = refreshed.auditLogs?.[0]
  return { ...refreshed, version: LS_VERSION, savedAt: catalog.updated_at, source: 'supabase',
    ...(latest ? { lastUpdatedBy: { name: latest.user_name, area: latest.user_area, timestamp: latest.timestamp } } : {}) }
}

function loadLocal(initial: InitialState, catalogId: string): LoadedWorkspace {
  const cached = loadFromLocalStorage(catalogId)
  if (cached?.catalog) return { ...cached, catalog: cached.catalog, source: 'localStorage' }
  return { ...initial, version: LS_VERSION, savedAt: new Date().toISOString(), source: 'initial' }
}

export async function loadAll(initial: InitialState): Promise<LoadedWorkspace> {
  return isSupabaseConfigured() ? syncFromCloud(initial) : loadLocal(initial, initial.catalog.id)
}

function imagePath(value: string): string | null {
  if (value.startsWith('storage://catalog-images/')) return value.slice('storage://catalog-images/'.length)
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!baseUrl) return null
    const parsed = new URL(value)
    if (parsed.origin !== new URL(baseUrl).origin) return null
    const match = parsed.pathname.match(/^\/storage\/v1\/object\/(?:sign|public)\/catalog-images\/(.+)$/)
    return match ? decodeURIComponent(match[1]) : null
  } catch { return null }
}

function mapStrings(value: unknown, transform: (value: string) => string): unknown {
  if (typeof value === 'string') return transform(value)
  if (Array.isArray(value)) return value.map((entry) => mapStrings(entry, transform))
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, mapStrings(entry, transform)]))
  return value
}

export function canonicalizeMediaUrls<T>(state: T): T {
  return mapStrings(state, (value) => {
    const path = imagePath(value)
    return path ? `storage://catalog-images/${path}` : value
  }) as T
}

export async function refreshMediaUrls<T>(state: T): Promise<T> {
  if (!isSupabaseConfigured()) return state
  const paths = new Set<string>()
  mapStrings(state, (value) => { const path = imagePath(value); if (path) paths.add(path); return value })
  if (!paths.size) return state
  const { data, error } = await supabase.storage.from('catalog-images').createSignedUrls([...paths], 3600)
  if (error) throw persistenceError(error)
  const urls = new Map((data || []).filter((entry) => entry.signedUrl && !entry.error).map((entry) => [entry.path, entry.signedUrl]))
  return mapStrings(state, (value) => { const path = imagePath(value); return path ? urls.get(path) || value : value }) as T
}

export async function uploadImage(file: File, path: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  if (!IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) throw new PersistenceError('invalid_data', 'Utilize JPG, PNG ou WebP com até 8 MB.')
  const user = await requireUser(true)
  const safePath = path.split('/').filter((part) => part && part !== '.' && part !== '..').map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '_')).join('/')
  const storagePath = `${user.id}/${crypto.randomUUID()}/${safePath}`
  const { error } = await supabase.storage.from('catalog-images').upload(storagePath, file, { cacheControl: '3600', upsert: false })
  if (error) throw persistenceError(error)
  const { data, error: signError } = await supabase.storage.from('catalog-images').createSignedUrl(storagePath, 3600)
  if (signError) throw persistenceError(signError)
  return data.signedUrl
}

export async function deleteImage(path: string): Promise<boolean> {
  await requireUser(true)
  const { error } = await supabase.storage.from('catalog-images').remove([imagePath(path) || path])
  if (error) throw persistenceError(error)
  return true
}

export function fileToDataUrl(file: File): Promise<string> {
  if (!IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) return Promise.reject(new PersistenceError('invalid_data', 'Utilize JPG, PNG ou WebP com até 8 MB.'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
