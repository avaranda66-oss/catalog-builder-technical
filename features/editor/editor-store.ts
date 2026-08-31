import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import { Product, Catalog, FieldDefinition, AiRun, AuditLog } from '../../lib/types/database'
import { TeamUser, AuditLogItem } from '../../lib/types/auth-user'
import {
  CatalogPage,
  PageSection,
  CatalogPreset,
  DesignTokens,
  ContactInfo,
  createSection,
  createPage,
  SectionType,
} from '../../lib/types/catalog-builder'
import {
  PRESYS_DESIGN_TOKENS,
  PRESYS_CONTACT,
  DEFAULT_PAGES,
  SYSTEM_PRESETS,
  INITIAL_CATALOG,
  INITIAL_PRODUCTS,
  INITIAL_FIELD_DEFINITIONS,
} from '../../lib/data/initial-data'
import { validateCatalogPage, validatePageSection } from '../../lib/validators/catalog-schemas'
import { applyAcceptedChanges } from '../../lib/domain/proposal-application'

export type EditorMode = 'form' | 'grid'
export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export interface StagedPatch {
  id?: string
  summary: string
  changes: Array<{
    path: string
    fieldLabel: string
    oldValue: any
    newValue: any
    reason?: string
    accepted?: boolean
  }>
}

export type NewProductPayload = Omit<
  Product,
  'id' | 'created_at' | 'updated_at' | 'version' | 'updated_by'
> & {
  updated_by?: string | null
}

export interface EditorSnapshot {
  products: Product[]
  pages: CatalogPage[]
  designTokens: DesignTokens
  contact: ContactInfo
  selectedProductId: string | null
  selectedPageId: string | null
}

const MAX_HISTORY = 50

/**
 * Utilitário seguro para navegação e escrita de caminhos aninhados,
 * com suporte a arrays numéricos (ex: "specs.0.value") e preservação de tipos.
 */
function setNestedPath(root: any, path: string, value: any) {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  let current = root

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    const nextKey = keys[i + 1]
    const isNextNumeric = /^\d+$/.test(nextKey)

    if (current[k] === undefined || current[k] === null || typeof current[k] !== 'object') {
      current[k] = isNextNumeric ? [] : {}
    }
    current = current[k]
  }

  const lastKey = keys[keys.length - 1]
  const isNumericIndex = /^\d+$/.test(lastKey)

  // Preservar tipo numérico se o campo original era número e o valor é numérico válido
  let formattedValue = value
  if (typeof current[lastKey] === 'number' && typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') {
    formattedValue = Number(value)
  }

  if (isNumericIndex && Array.isArray(current)) {
    current[parseInt(lastKey, 10)] = formattedValue
  } else {
    current[lastKey] = formattedValue
  }
}

/**
 * Cria um snapshot completo e desacoplado do estado do editor
 */
function createSnapshot(state: {
  products: Product[]
  pages: CatalogPage[]
  designTokens: DesignTokens
  contact: ContactInfo
  selectedProductId: string | null
  selectedPageId: string | null
}): EditorSnapshot {
  return {
    products: JSON.parse(JSON.stringify(state.products)),
    pages: JSON.parse(JSON.stringify(state.pages)),
    designTokens: JSON.parse(JSON.stringify(state.designTokens)),
    contact: JSON.parse(JSON.stringify(state.contact)),
    selectedProductId: state.selectedProductId,
    selectedPageId: state.selectedPageId,
  }
}

interface EditorState {
  catalog: Catalog | null
  products: Product[]
  selectedProductId: string | null
  mode: EditorMode
  fieldDefinitions: FieldDefinition[]
  
  // === Dynamic Pages ===
  pages: CatalogPage[]
  selectedPageId: string | null
  designTokens: DesignTokens
  contact: ContactInfo

  // === Visual Direct Edit Mode ===
  isVisualEditMode: boolean

  // === Presets ===
  presets: CatalogPreset[]

  // Autosave & Status
  saveStatus: SaveStatus
  lastSavedAt: Date | null
  dirtyProductIds: string[]
  
  // History for Undo/Redo (Atomic full snapshot)
  history: EditorSnapshot[]
  historyIndex: number

  // AI Staged Changes
  stagedPatch: StagedPatch | null
  isAiLoading: boolean
  aiLogs: AiRun[]

  // Collaborative Team & Audit Logs
  currentUser: TeamUser | null
  auditLogs: AuditLogItem[]
  lastCloudSync: string | null
  lastUpdatedBy: { name: string; area: string; timestamp: string } | null

  // ---- Core Actions ----
  setCurrentUser: (user: TeamUser | null) => void
  setAuditLogs: (logs: AuditLogItem[]) => void
  addAuditLog: (action: string, entity_type?: any, entity_name?: string, details?: string) => void
  setLastCloudSync: (time: string) => void
  setLastUpdatedBy: (info: { name: string; area: string; timestamp: string } | null) => void

  setCatalog: (catalog: Catalog) => void
  setProducts: (products: Product[]) => void
  setSelectedProductId: (id: string | null) => void
  setMode: (mode: EditorMode) => void
  setFieldDefinitions: (defs: FieldDefinition[]) => void
  
  updateProductData: (productId: string, path: string, value: any) => void
  updateProductField: (productId: string, updates: Partial<Product>) => void
  addProduct: (product: NewProductPayload) => void
  deleteProduct: (productId: string) => void

  // ---- Page Management ----
  setPages: (pages: CatalogPage[]) => void
  setSelectedPageId: (id: string | null) => void
  addPage: (title?: string, sections?: PageSection[]) => void
  removePage: (pageId: string) => void
  reorderPages: (fromIndex: number, toIndex: number) => void
  updatePage: (pageId: string, updates: Partial<CatalogPage>) => void

  // ---- Section Management (within a page) ----
  addSection: (pageId: string, type: SectionType) => void
  removeSection: (pageId: string, sectionId: string) => void
  reorderSections: (pageId: string, fromIndex: number, toIndex: number) => void
  updateSection: (pageId: string, sectionId: string, updates: Partial<PageSection>) => void
  updateSectionContent: (pageId: string, sectionId: string, content: any) => void

  // ---- Design Tokens & Visual Edit Mode ----
  setDesignTokens: (tokens: DesignTokens) => void
  setContact: (contact: ContactInfo) => void
  setIsVisualEditMode: (enabled: boolean) => void

  // ---- Presets ----
  loadPreset: (preset: CatalogPreset) => void
  saveCurrentAsPreset: (name: string, description: string) => void

  // ---- Undo / Redo ----
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // ---- Autosave ----
  setSaveStatus: (status: SaveStatus) => void
  markSaved: () => void

  // ---- AI ----
  setStagedPatch: (patch: StagedPatch | null) => void
  setIsAiLoading: (loading: boolean) => void
  applyStagedPatch: () => void
  rejectStagedPatch: () => void
  toggleChangeAccepted: (index: number) => void
}

function pushHistorySnapshot(state: any) {
  const snapshot = createSnapshot(state)
  state.history = state.history.slice(0, state.historyIndex + 1)
  state.history.push(snapshot)
  if (state.history.length > MAX_HISTORY) {
    state.history.shift()
  }
  state.historyIndex = state.history.length - 1
}

export const useEditorStore = create<EditorState>()(
  persist(
    immer((set, get) => ({
      catalog: INITIAL_CATALOG,
      products: INITIAL_PRODUCTS,
      selectedProductId: INITIAL_PRODUCTS[0]?.id || null,
      mode: 'form',
      fieldDefinitions: INITIAL_FIELD_DEFINITIONS,
      
      pages: DEFAULT_PAGES,
      selectedPageId: DEFAULT_PAGES[0]?.id || null,
      designTokens: PRESYS_DESIGN_TOKENS,
      contact: PRESYS_CONTACT,

      isVisualEditMode: false,

      presets: SYSTEM_PRESETS,

      saveStatus: 'saved',
      lastSavedAt: new Date(),
      dirtyProductIds: [],

      history: [],
      historyIndex: -1,

      stagedPatch: null,
      isAiLoading: false,
      aiLogs: [],

      // Team Auth & Cloud Audit State
      currentUser: null,
      auditLogs: [],
      lastCloudSync: null,
      lastUpdatedBy: null,

      setCurrentUser: (user) => set((state) => { state.currentUser = user }),
      setAuditLogs: (logs) => set((state) => { state.auditLogs = logs }),
      addAuditLog: (action, entity_type = 'general', entity_name, details) => set((state) => {
        const item: AuditLogItem = {
          id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          user_name: state.currentUser?.name || 'Colaborador Presys',
          user_area: state.currentUser?.area || 'Engenharia',
          action,
          entity_type,
          entity_name,
          timestamp: new Date().toISOString(),
          details,
        }
        state.auditLogs = [item, ...state.auditLogs].slice(0, 50)
      }),
      setLastCloudSync: (time) => set((state) => { state.lastCloudSync = time }),
      setLastUpdatedBy: (info) => set((state) => { state.lastUpdatedBy = info }),

    // =====================================================================
    // CORE ACTIONS
    // =====================================================================

    setCatalog: (catalog) => set((state) => { state.catalog = catalog }),
    
    setProducts: (products) => set((state) => {
      state.products = products
      if (!state.selectedProductId && products.length > 0) {
        state.selectedProductId = products[0].id
      }
      state.history = [createSnapshot(state)]
      state.historyIndex = 0
    }),

    setSelectedProductId: (id) => set((state) => { state.selectedProductId = id }),
    setMode: (mode) => set((state) => { state.mode = mode }),
    setFieldDefinitions: (defs) => set((state) => { state.fieldDefinitions = defs }),

    updateProductData: (productId, path, value) => set((state) => {
      const product = state.products.find((p) => p.id === productId)
      if (!product) return

      pushHistorySnapshot(state)

      if (!product.data) product.data = {}
      setNestedPath(product.data, path, value)
      product.updated_at = new Date().toISOString()
      state.saveStatus = 'unsaved'
      if (!state.dirtyProductIds.includes(productId)) {
        state.dirtyProductIds.push(productId)
      }

      // Auto-register detailed audit log entry
      const readableField =
        path.startsWith('marketing.title') ? 'Título Comercial' :
        path.startsWith('marketing.subtitle') ? 'Subtítulo Técnico' :
        path.startsWith('marketing.overview') ? 'Descrição / Visão Geral' :
        path.startsWith('marketing.heroImages') ? 'Fotos do Produto (Banner)' :
        path.startsWith('marketing.features') ? 'Recursos & Destaques' :
        path.startsWith('specs') ? 'Tabela de Especificações' :
        path.startsWith('electrical') ? 'Tabela de Sinais Elétricos' :
        path.startsWith('general') ? 'Especificações Gerais' :
        path.startsWith('accessories') ? 'Tabela de Acessórios' :
        path.startsWith('ordering') ? 'Código de Encomenda' : path

      const item: AuditLogItem = {
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_name: state.currentUser?.name || 'Colaborador Presys',
        user_area: state.currentUser?.area || 'Engenharia',
        action: `Alterou ${readableField} (${product.sku})`,
        entity_type: 'product',
        entity_name: product.sku,
        timestamp: new Date().toISOString(),
        details: typeof value === 'string' && value.length < 80
          ? `Definiu como: "${value}"`
          : Array.isArray(value)
          ? `Atualizou lista com ${value.length} item(ns)`
          : `Modificou o campo ${path}`,
      }
      state.auditLogs = [item, ...state.auditLogs].slice(0, 60)
    }),

    updateProductField: (productId, updates) => set((state) => {
      const product = state.products.find((p) => p.id === productId)
      if (!product) return

      pushHistorySnapshot(state)

      Object.assign(product, updates)
      product.updated_at = new Date().toISOString()
      state.saveStatus = 'unsaved'
      if (!state.dirtyProductIds.includes(productId)) {
        state.dirtyProductIds.push(productId)
      }

      const item: AuditLogItem = {
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_name: state.currentUser?.name || 'Colaborador Presys',
        user_area: state.currentUser?.area || 'Engenharia',
        action: `Atualizou dados cadastrais de ${product.sku}`,
        entity_type: 'product',
        entity_name: product.sku,
        timestamp: new Date().toISOString(),
        details: `Campos modificados: ${Object.keys(updates).join(', ')}`,
      }
      state.auditLogs = [item, ...state.auditLogs].slice(0, 60)
    }),

    addProduct: (newProd) => set((state) => {
      pushHistorySnapshot(state)

      const id = 'prod-' + Math.random().toString(36).substring(2, 9)
      const now = new Date().toISOString()
      const product: Product = {
        ...newProd,
        id,
        version: 1,
        created_at: now,
        updated_at: now,
        updated_by: newProd.updated_by || null,
      }
      state.products.push(product)
      state.selectedProductId = id
      state.saveStatus = 'unsaved'
      if (!state.dirtyProductIds.includes(id)) {
        state.dirtyProductIds.push(id)
      }

      const item: AuditLogItem = {
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_name: state.currentUser?.name || 'Colaborador Presys',
        user_area: state.currentUser?.area || 'Engenharia',
        action: `Criou novo produto: ${newProd.sku}`,
        entity_type: 'product',
        entity_name: newProd.sku,
        timestamp: now,
        details: `Cadastrado na família ${newProd.family || 'PCON'}: "${newProd.name}"`,
      }
      state.auditLogs = [item, ...state.auditLogs].slice(0, 60)
    }),

    deleteProduct: (productId) => set((state) => {
      pushHistorySnapshot(state)

      const index = state.products.findIndex((p) => p.id === productId)
      const deletedProd = state.products[index]
      if (index !== -1) {
        state.products.splice(index, 1)
      }
      if (state.selectedProductId === productId) {
        state.selectedProductId = state.products[0]?.id || null
      }
      state.saveStatus = 'unsaved'

      if (deletedProd) {
        const item: AuditLogItem = {
          id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          user_name: state.currentUser?.name || 'Colaborador Presys',
          user_area: state.currentUser?.area || 'Engenharia',
          action: `Excluiu produto: ${deletedProd.sku}`,
          entity_type: 'product',
          entity_name: deletedProd.sku,
          timestamp: new Date().toISOString(),
          details: `Removido do catálogo: "${deletedProd.name}"`,
        }
        state.auditLogs = [item, ...state.auditLogs].slice(0, 60)
      }
    }),

    // =====================================================================
    // PAGE MANAGEMENT
    // =====================================================================

    setPages: (pages) => set((state) => {
      pushHistorySnapshot(state)
      state.pages = pages
      if (!state.selectedPageId && pages.length > 0) {
        state.selectedPageId = pages[0].id
      }
    }),

    setSelectedPageId: (id) => set((state) => { state.selectedPageId = id }),

    addPage: (title, sections) => set((state) => {
      pushHistorySnapshot(state)

      const pageTitle = title || `Página ${state.pages.length + 1}`
      const page = createPage(pageTitle, sections || [])
      page.sort_order = state.pages.length
      state.pages.push(page)
      state.selectedPageId = page.id
      state.saveStatus = 'unsaved'

      const item: AuditLogItem = {
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_name: state.currentUser?.name || 'Colaborador Presys',
        user_area: state.currentUser?.area || 'Engenharia',
        action: `Adicionou página A4: "${pageTitle}"`,
        entity_type: 'page',
        entity_name: pageTitle,
        timestamp: new Date().toISOString(),
        details: `Criada com ${sections?.length || 0} seção(ões) e ordem ${page.sort_order + 1}`,
      }
      state.auditLogs = [item, ...state.auditLogs].slice(0, 60)
    }),

    removePage: (pageId) => set((state) => {
      pushHistorySnapshot(state)

      const index = state.pages.findIndex((p) => p.id === pageId)
      const removedPage = state.pages[index]
      if (index !== -1) {
        state.pages.splice(index, 1)
      }
      if (state.selectedPageId === pageId) {
        state.selectedPageId = state.pages[0]?.id || null
      }
      // Renumber sort_order
      state.pages.forEach((p, i) => { p.sort_order = i })
      state.saveStatus = 'unsaved'

      if (removedPage) {
        const item: AuditLogItem = {
          id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          user_name: state.currentUser?.name || 'Colaborador Presys',
          user_area: state.currentUser?.area || 'Engenharia',
          action: `Excluiu página A4: "${removedPage.title}"`,
          entity_type: 'page',
          entity_name: removedPage.title,
          timestamp: new Date().toISOString(),
          details: `Removida da paginação do catálogo`,
        }
        state.auditLogs = [item, ...state.auditLogs].slice(0, 60)
      }
    }),

    reorderPages: (fromIndex, toIndex) => set((state) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= state.pages.length || toIndex >= state.pages.length) {
        return
      }
      pushHistorySnapshot(state)

      const [moved] = state.pages.splice(fromIndex, 1)
      state.pages.splice(toIndex, 0, moved)
      state.pages.forEach((p, i) => { p.sort_order = i })
      state.saveStatus = 'unsaved'

      const item: AuditLogItem = {
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_name: state.currentUser?.name || 'Colaborador Presys',
        user_area: state.currentUser?.area || 'Engenharia',
        action: `Reordenou páginas A4: "${moved.title}"`,
        entity_type: 'page',
        entity_name: moved.title,
        timestamp: new Date().toISOString(),
        details: `Movida da posição ${fromIndex + 1} para a posição ${toIndex + 1}`,
      }
      state.auditLogs = [item, ...state.auditLogs].slice(0, 60)
    }),

    updatePage: (pageId, updates) => set((state) => {
      const page = state.pages.find((p) => p.id === pageId)
      if (page) {
        pushHistorySnapshot(state)
        Object.assign(page, updates)
        state.saveStatus = 'unsaved'
      }
    }),

    // =====================================================================
    // SECTION MANAGEMENT
    // =====================================================================

    addSection: (pageId, type) => set((state) => {
      const page = state.pages.find((p) => p.id === pageId)
      if (!page) return
      pushHistorySnapshot(state)

      const section = createSection(type)
      section.sort_order = page.sections.length
      page.sections.push(section)
      state.saveStatus = 'unsaved'
    }),

    removeSection: (pageId, sectionId) => set((state) => {
      const page = state.pages.find((p) => p.id === pageId)
      if (!page) return
      pushHistorySnapshot(state)

      const sIdx = page.sections.findIndex((s) => s.id === sectionId)
      if (sIdx !== -1) {
        page.sections.splice(sIdx, 1)
      }
      page.sections.forEach((s, i) => { s.sort_order = i })
      state.saveStatus = 'unsaved'
    }),

    reorderSections: (pageId, fromIndex, toIndex) => set((state) => {
      const page = state.pages.find((p) => p.id === pageId)
      if (!page || fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= page.sections.length || toIndex >= page.sections.length) {
        return
      }
      pushHistorySnapshot(state)

      const [moved] = page.sections.splice(fromIndex, 1)
      page.sections.splice(toIndex, 0, moved)
      page.sections.forEach((s, i) => { s.sort_order = i })
      state.saveStatus = 'unsaved'
    }),

    updateSection: (pageId, sectionId, updates) => set((state) => {
      const page = state.pages.find((p) => p.id === pageId)
      if (!page) return
      const section = page.sections.find((s) => s.id === sectionId)
      if (section) {
        pushHistorySnapshot(state)
        Object.assign(section, updates)
        state.saveStatus = 'unsaved'
      }
    }),

    updateSectionContent: (pageId, sectionId, content) => set((state) => {
      const page = state.pages.find((p) => p.id === pageId)
      if (!page) return
      const section = page.sections.find((s) => s.id === sectionId)
      if (section) {
        section.content = content
        state.saveStatus = 'unsaved'
      }
    }),

    // =====================================================================
    // DESIGN TOKENS & VISUAL EDIT MODE
    // =====================================================================

    setDesignTokens: (tokens) => set((state) => {
      pushHistorySnapshot(state)
      state.designTokens = tokens
      state.saveStatus = 'unsaved'
    }),

    setContact: (contact) => set((state) => {
      pushHistorySnapshot(state)
      state.contact = contact
      state.saveStatus = 'unsaved'
    }),

    setIsVisualEditMode: (enabled) => set((state) => {
      state.isVisualEditMode = enabled
    }),

    // =====================================================================
    // PRESETS
    // =====================================================================

    loadPreset: (preset) => set((state) => {
      pushHistorySnapshot(state)
      state.pages = JSON.parse(JSON.stringify(preset.default_pages))
      state.designTokens = JSON.parse(JSON.stringify(preset.design_tokens))
      state.contact = JSON.parse(JSON.stringify(preset.contact))
      state.selectedPageId = state.pages[0]?.id || null
      state.saveStatus = 'unsaved'
    }),

    saveCurrentAsPreset: (name, description) => set((state) => {
      const now = new Date().toISOString()
      const preset: CatalogPreset = {
        id: `preset-${Date.now()}`,
        name,
        description,
        design_tokens: JSON.parse(JSON.stringify(state.designTokens)),
        contact: JSON.parse(JSON.stringify(state.contact)),
        default_pages: JSON.parse(JSON.stringify(state.pages)),
        is_system: false,
        created_at: now,
        updated_at: now,
      }
      state.presets.push(preset)
    }),

    // =====================================================================
    // UNDO / REDO (Global Atomic Restore)
    // =====================================================================

    undo: () => set((state) => {
      if (state.historyIndex > 0) {
        state.historyIndex--
        const snap = state.history[state.historyIndex]
        if (snap) {
          state.products = JSON.parse(JSON.stringify(snap.products))
          state.pages = JSON.parse(JSON.stringify(snap.pages))
          state.designTokens = JSON.parse(JSON.stringify(snap.designTokens))
          state.contact = JSON.parse(JSON.stringify(snap.contact))
          state.selectedProductId = snap.selectedProductId
          state.selectedPageId = snap.selectedPageId
          state.saveStatus = 'unsaved'
        }
      }
    }),

    redo: () => set((state) => {
      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++
        const snap = state.history[state.historyIndex]
        if (snap) {
          state.products = JSON.parse(JSON.stringify(snap.products))
          state.pages = JSON.parse(JSON.stringify(snap.pages))
          state.designTokens = JSON.parse(JSON.stringify(snap.designTokens))
          state.contact = JSON.parse(JSON.stringify(snap.contact))
          state.selectedProductId = snap.selectedProductId
          state.selectedPageId = snap.selectedPageId
          state.saveStatus = 'unsaved'
        }
      }
    }),

    canUndo: () => {
      const { historyIndex } = get()
      return historyIndex > 0
    },

    canRedo: () => {
      const { historyIndex, history } = get()
      return historyIndex < history.length - 1
    },

    // =====================================================================
    // AUTOSAVE
    // =====================================================================

    setSaveStatus: (status) => set((state) => { state.saveStatus = status }),
    markSaved: () => set((state) => {
      state.saveStatus = 'saved'
      state.lastSavedAt = new Date()
      state.dirtyProductIds = []
    }),

    // =====================================================================
    // AI
    // =====================================================================

    setStagedPatch: (patch) => set((state) => { state.stagedPatch = patch }),
    setIsAiLoading: (loading) => set((state) => { state.isAiLoading = loading }),

    toggleChangeAccepted: (index) => set((state) => {
      if (state.stagedPatch && state.stagedPatch.changes[index]) {
        state.stagedPatch.changes[index].accepted = !state.stagedPatch.changes[index].accepted
      }
    }),

    applyStagedPatch: () => set((state) => {
      if (!state.stagedPatch || !state.selectedProductId) return
      const product = state.products.find((p) => p.id === state.selectedProductId)
      if (!product) return

      if (!product.data) product.data = {}

      const proposal = state.stagedPatch
      const application = applyAcceptedChanges(
        product.data,
        proposal.changes.map((change) => ({ ...change, accepted: change.accepted !== false })),
      )

      if (application.applied.length > 0) {
        pushHistorySnapshot(state)
        product.data = application.next
        product.updated_at = new Date().toISOString()
        state.saveStatus = 'unsaved'
        if (!state.dirtyProductIds.includes(product.id)) {
          state.dirtyProductIds.push(product.id)
        }
      }

      if (application.conflicts.length > 0) {
        const conflictPaths = new Set(application.conflicts.map((change) => change.path))
        state.stagedPatch = {
          ...proposal,
          summary: `${proposal.summary} — ${application.conflicts.length} conflito(s) precisam de revisão.`,
          changes: proposal.changes
            .filter((change) => conflictPaths.has(change.path))
            .map((change) => {
              const conflict = application.conflicts.find((item) => item.path === change.path)
              return {
                ...change,
                oldValue: conflict?.currentValue,
                accepted: false,
                reason: 'O valor foi alterado desde a criação da proposta. Revise o valor atual antes de aceitar novamente.',
              }
            }),
        }
        if (application.applied.length === 0) state.saveStatus = 'error'
        return
      }

      state.stagedPatch = null
    }),

    rejectStagedPatch: () => set((state) => {
      state.stagedPatch = null
    }),
  })),
  {
    name: 'pcon-catalog-builder-v3',
    partialize: (state) => ({
      catalog: state.catalog,
      products: state.products,
      selectedProductId: state.selectedProductId,
      pages: state.pages,
      selectedPageId: state.selectedPageId,
      designTokens: state.designTokens,
      contact: state.contact,
      fieldDefinitions: state.fieldDefinitions,
      presets: state.presets,
      currentUser: state.currentUser,
      auditLogs: state.auditLogs,
      lastCloudSync: state.lastCloudSync,
      lastUpdatedBy: state.lastUpdatedBy,
    }),
  }
)
)
