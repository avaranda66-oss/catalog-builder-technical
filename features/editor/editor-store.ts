import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { Product, Catalog, FieldDefinition, AiRun, AuditLog } from '../../lib/types/database'
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
import { PRESYS_DESIGN_TOKENS, PRESYS_CONTACT, DEFAULT_PAGES, SYSTEM_PRESETS } from '../../lib/data/initial-data'

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
  
  // History for Undo/Redo
  history: Product[][]
  historyIndex: number

  // AI Staged Changes
  stagedPatch: StagedPatch | null
  isAiLoading: boolean
  aiLogs: AiRun[]

  // Audit Logs
  auditLogs: AuditLog[]

  // ---- Core Actions ----
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

export const useEditorStore = create<EditorState>()(
  immer((set, get) => ({
    catalog: null,
    products: [],
    selectedProductId: null,
    mode: 'form',
    fieldDefinitions: [],
    
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
    auditLogs: [],

    // =====================================================================
    // CORE ACTIONS
    // =====================================================================

    setCatalog: (catalog) => set((state) => { state.catalog = catalog }),
    setProducts: (products) => set((state) => {
      state.products = products
      if (!state.selectedProductId && products.length > 0) {
        state.selectedProductId = products[0].id
      }
      state.history = [JSON.parse(JSON.stringify(products))]
      state.historyIndex = 0
    }),
    setSelectedProductId: (id) => set((state) => { state.selectedProductId = id }),
    setMode: (mode) => set((state) => { state.mode = mode }),
    setFieldDefinitions: (defs) => set((state) => { state.fieldDefinitions = defs }),

    updateProductData: (productId, path, value) => set((state) => {
      const product = state.products.find((p) => p.id === productId)
      if (!product) return

      const currentProducts = JSON.parse(JSON.stringify(state.products))
      state.history = state.history.slice(0, state.historyIndex + 1)
      state.history.push(currentProducts)
      state.historyIndex++

      const keys = path.split('.')
      let target: any = product.data
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]
        if (!target[k] || typeof target[k] !== 'object') {
          target[k] = {}
        }
        target = target[k]
      }
      target[keys[keys.length - 1]] = value
      product.updated_at = new Date().toISOString()
      state.saveStatus = 'unsaved'
      if (!state.dirtyProductIds.includes(productId)) {
        state.dirtyProductIds.push(productId)
      }
    }),

    updateProductField: (productId, updates) => set((state) => {
      const product = state.products.find((p) => p.id === productId)
      if (!product) return

      const currentProducts = JSON.parse(JSON.stringify(state.products))
      state.history = state.history.slice(0, state.historyIndex + 1)
      state.history.push(currentProducts)
      state.historyIndex++

      Object.assign(product, updates)
      product.updated_at = new Date().toISOString()
      state.saveStatus = 'unsaved'
      if (!state.dirtyProductIds.includes(productId)) {
        state.dirtyProductIds.push(productId)
      }
    }),

    addProduct: (newProd) => set((state) => {
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
    }),

    deleteProduct: (productId) => set((state) => {
      const index = state.products.findIndex((p) => p.id === productId)
      if (index !== -1) {
        state.products.splice(index, 1)
      }
      if (state.selectedProductId === productId) {
        state.selectedProductId = state.products[0]?.id || null
      }
      state.saveStatus = 'unsaved'
    }),

    // =====================================================================
    // PAGE MANAGEMENT
    // =====================================================================

    setPages: (pages) => set((state) => {
      state.pages = pages
      if (!state.selectedPageId && pages.length > 0) {
        state.selectedPageId = pages[0].id
      }
    }),

    setSelectedPageId: (id) => set((state) => { state.selectedPageId = id }),

    addPage: (title, sections) => set((state) => {
      const page = createPage(
        title || `Página ${state.pages.length + 1}`,
        sections || []
      )
      page.sort_order = state.pages.length
      state.pages.push(page)
      state.selectedPageId = page.id
      state.saveStatus = 'unsaved'
    }),

    removePage: (pageId) => set((state) => {
      const index = state.pages.findIndex((p) => p.id === pageId)
      if (index !== -1) {
        state.pages.splice(index, 1)
      }
      if (state.selectedPageId === pageId) {
        state.selectedPageId = state.pages[0]?.id || null
      }
      // Renumber sort_order
      state.pages.forEach((p, i) => { p.sort_order = i })
      state.saveStatus = 'unsaved'
    }),

    reorderPages: (fromIndex, toIndex) => set((state) => {
      const [moved] = state.pages.splice(fromIndex, 1)
      state.pages.splice(toIndex, 0, moved)
      state.pages.forEach((p, i) => { p.sort_order = i })
      state.saveStatus = 'unsaved'
    }),

    updatePage: (pageId, updates) => set((state) => {
      const page = state.pages.find((p) => p.id === pageId)
      if (page) {
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
      const section = createSection(type)
      section.sort_order = page.sections.length
      page.sections.push(section)
      state.saveStatus = 'unsaved'
    }),

    removeSection: (pageId, sectionId) => set((state) => {
      const page = state.pages.find((p) => p.id === pageId)
      if (!page) return
      const sIdx = page.sections.findIndex((s) => s.id === sectionId)
      if (sIdx !== -1) {
        page.sections.splice(sIdx, 1)
      }
      page.sections.forEach((s, i) => { s.sort_order = i })
      state.saveStatus = 'unsaved'
    }),

    reorderSections: (pageId, fromIndex, toIndex) => set((state) => {
      const page = state.pages.find((p) => p.id === pageId)
      if (!page) return
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
      state.designTokens = tokens
      state.saveStatus = 'unsaved'
    }),

    setContact: (contact) => set((state) => {
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
    // UNDO / REDO
    // =====================================================================

    undo: () => set((state) => {
      if (state.historyIndex > 0) {
        state.historyIndex--
        state.products = JSON.parse(JSON.stringify(state.history[state.historyIndex]))
        state.saveStatus = 'unsaved'
      }
    }),

    redo: () => set((state) => {
      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++
        state.products = JSON.parse(JSON.stringify(state.history[state.historyIndex]))
        state.saveStatus = 'unsaved'
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

      const currentProducts = JSON.parse(JSON.stringify(state.products))
      state.history = state.history.slice(0, state.historyIndex + 1)
      state.history.push(currentProducts)
      state.historyIndex++

      state.stagedPatch.changes.forEach((change) => {
        if (change.accepted !== false) {
          const keys = change.path.split('.')
          let target: any = product.data
          for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i]
            if (!target[k] || typeof target[k] !== 'object') {
              target[k] = {}
            }
            target = target[k]
          }
          target[keys[keys.length - 1]] = change.newValue
        }
      })

      product.updated_at = new Date().toISOString()
      state.saveStatus = 'unsaved'
      if (!state.dirtyProductIds.includes(product.id)) {
        state.dirtyProductIds.push(product.id)
      }
      state.stagedPatch = null
    }),

    rejectStagedPatch: () => set((state) => {
      state.stagedPatch = null
    }),
  }))
)
