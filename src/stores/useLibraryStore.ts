import { create } from 'zustand';
import {
  Product,
  LibraryColumn,
  ProductFamily,
  ProductFamilyField,
  LibraryChangeEvent,
  LibraryPresenceUser
} from '../domain/product.schema';
import { INITIAL_PRODUCTS } from '../data/initialProducts';
import { StorageService } from '../services/storage.service';
import { SupabaseService, getSupabase } from '../services/supabase.service';
import { useAuthStore } from './useAuthStore';
import { RealtimeChannel } from '@supabase/supabase-js';
import { resolveFamilySelectionAfterDelete, slugifyFamilyName } from '../domain/family-selection.helper';

export type SyncStatus = 'synced' | 'dirty' | 'saving' | 'conflict' | 'error' | 'offline';

export interface PendingProductEdit {
  productId: string;
  latestProductSnapshot: Product;
  expectedVersion: number;
  changedFields: Set<string>;
  timestamp: number;
}

export type LibrarySaveReason = 'manual' | 'automatic';

interface LibraryPatch {
  op: 'set' | 'delete';
  path: string[];
  value?: unknown;
  beforeExists: boolean;
  beforeValue?: unknown;
}

export interface LibraryInFlightSave {
  requestId: string;
  generation: number;
  expectedRevision: number;
  sentSnapshot: Product;
  postSendDelta: LibraryPatch[];
}

export interface LibraryFailureBarrier {
  generation: number;
  message: string;
  sentSnapshot: Product;
  postSendDelta: LibraryPatch[];
}

export interface LibraryConflictBarrier {
  message: string;
  remoteRevision: number | null;
  remoteSnapshot: Product | null;
  remoteDeletion: boolean;
}

export interface LibraryReconciliationBarrier {
  reason: 'structural-replay' | 'canonical-verification' | 'same-revision-divergence' | 'invalid-ack';
  message: string;
  generation: number;
  acceptedRevision: number | null;
  sentSnapshot: Product;
  canonicalSnapshot: Product | null;
  localDraft: Product;
  postSendDelta: LibraryPatch[];
  canonicalVerificationReadAttempted?: boolean;
}

export interface LibraryDiscardToken {
  id: string;
  authIdentity: string;
  ownerKey: string;
  epoch: number;
  generation: number;
  baseRevision: number | null;
  readEpoch: number;
  navigationEpoch: number;
}

export interface LibraryProductSession {
  key: string;
  ownerKey: string;
  authIdentity: string;
  productId: string;
  epoch: number;
  readEpoch: number;
  verified: boolean;
  baseSnapshot: Product | null;
  baseRevision: number | null;
  remoteSnapshot: Product | null;
  remoteRevision: number | null;
  remoteDeletion: boolean;
  localGeneration: number;
  acknowledgedGeneration: number;
  draft: Product;
  inFlight: LibraryInFlightSave | null;
  pendingGeneration: number | null;
  failure: LibraryFailureBarrier | null;
  conflict: LibraryConflictBarrier | null;
  reconciliationRequired: LibraryReconciliationBarrier | null;
  discardToken: LibraryDiscardToken | null;
}

export type LibraryDataProvenance = 'cloud_official' | 'offline_cache' | 'demo_seed';

interface LibraryState {
  products: Product[];
  families: ProductFamily[];
  familyFields: Record<string, ProductFamilyField[]>; // keyed by family_id and family name
  familyColumns?: Record<string, LibraryColumn[]>; // backward compat alias
  changeEvents: LibraryChangeEvent[];
  selectedProductId: string | null;
  searchQuery: string;
  selectedFamily: string; // family name or slug
  workspaceLoaded: boolean;
  workspaceSource: 'cloud' | 'offline';
  dataProvenance: LibraryDataProvenance;
  
  // Status de Sincronização
  syncStatus: SyncStatus;
  syncError: string | null;
  isDirty: boolean;
  isSaving: boolean;
  productSessions: Record<string, LibraryProductSession>;
  
  // Realtime & Presence
  cellPresence: Record<string, LibraryPresenceUser[]>; // key: `${productId}:${colKey}`
  familyPresence: Record<string, LibraryPresenceUser[]>; // key: `${familyId}`
  recentEditedCells: Record<string, { editorName: string; timestamp: number }>;
  
  // Actions de Navegação
  setSearchQuery: (query: string) => void;
  setSelectedFamily: (family: string) => void;
  setSelectedProduct: (id: string | null) => void;
  
  // Presence Actions
  setFocusedCell: (productId: string | null, columnKey: string | null, isEditing?: boolean) => void;
  
  // CRUD de Famílias
  createFamily: (name: string, description?: string) => Promise<{ success: boolean; data?: ProductFamily; error?: string }>;
  renameFamily: (familyId: string, newName: string) => Promise<{ success: boolean; error?: string }>;
  deleteFamily: (familyId: string) => Promise<{ success: boolean; error?: string }>;
  
  // CRUD de Colunas
  getColumnsForFamily: (family: string) => LibraryColumn[];
  addFamilyColumn: (familyIdOrName: string, fieldKey: string, label: string, fieldType?: string) => Promise<{ success: boolean; data?: ProductFamilyField; error?: string }>;
  renameFamilyColumn: (fieldId: string, familyIdOrName: string, newLabel: string) => Promise<{ success: boolean; error?: string }>;
  removeFamilyColumn: (fieldId: string, familyIdOrName: string, fieldKey?: string) => Promise<{ success: boolean; error?: string }>;
  
  // CRUD de Produtos
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'version'>) => Promise<{ success: boolean; data?: Product; error?: string }>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  updateProductCell: (productId: string, fieldKey: string, value: string, immediateFlush?: boolean) => void;
  deleteProduct: (id: string) => Promise<{ success: boolean; error?: string }>;
  getProduct: (id: string) => Product | undefined;
  
  // Flush & Persistência
  flushLibraryEdits: (reason?: LibrarySaveReason) => Promise<boolean>;
  getProductSession: (productId: string) => LibraryProductSession | undefined;
  verifyCanonicalProductAck: (productId: string) => Promise<boolean>;
  discardProductWithRefresh: (productId: string, navigationEpoch: number) => Promise<boolean>;
  invalidateDiscardTokens: () => void;
  loadWorkspace: () => Promise<void>;
  loadProducts: () => Promise<void>;
  initRealtimeSubscription: () => () => void;
  resetToInitial: () => void;
}

// 1. Identidade de Sessão Única e Estável por Aba
function getStableLibraryClientId(): string {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    let id = window.sessionStorage.getItem('cb_client_instance_id');
    if (!id) {
      id = 'client_' + Math.random().toString(36).slice(2, 9);
      window.sessionStorage.setItem('cb_client_instance_id', id);
    }
    return id;
  }
  return 'client_' + Math.random().toString(36).slice(2, 9);
}

const libraryClientInstanceId = getStableLibraryClientId();

// 2. Sessões de persistência e scheduler finito por aba
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let debounceEditSequence = 0;
let editSequence = 0;
let requestSequence = 0;
let discardSequence = 0;
let workspaceReadSequence = 0;
let activeLibraryDrain: Promise<boolean> | null = null;
let activeWorkspaceLoad: { authIdentity: string; promise: Promise<void> } | null = null;

const PRODUCT_EDITABLE_ROOTS = ['family_id', 'code', 'model', 'family', 'description', 'specs', 'imageUrl'] as const;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getLibraryAuthIdentity(): string {
  return useAuthStore.getState().userId || `session:${libraryClientInstanceId}`;
}

function getLibrarySessionKey(productId: string, authIdentity = getLibraryAuthIdentity()): string {
  return `${authIdentity}:product:${productId}`;
}

function createLibrarySession(product: Product, authIdentity = getLibraryAuthIdentity(), verified = true): LibraryProductSession {
  const baseRevision = Number.isInteger(product.version) && product.version > 0 ? product.version : null;
  return {
    key: getLibrarySessionKey(product.id, authIdentity),
    ownerKey: `product:${product.id}`,
    authIdentity,
    productId: product.id,
    epoch: 1,
    readEpoch: 1,
    verified: verified && baseRevision !== null,
    baseSnapshot: cloneJson(product),
    baseRevision,
    remoteSnapshot: cloneJson(product),
    remoteRevision: baseRevision,
    remoteDeletion: false,
    localGeneration: 0,
    acknowledgedGeneration: 0,
    draft: cloneJson(product),
    inFlight: null,
    pendingGeneration: null,
    failure: null,
    conflict: null,
    reconciliationRequired: null,
    discardToken: null
  };
}

function getCurrentLibrarySession(state: LibraryState, productId: string): LibraryProductSession | undefined {
  return state.productSessions[getLibrarySessionKey(productId)];
}

function patchValueKind(value: unknown): 'array' | 'object' | 'scalar' | 'missing' {
  if (value === undefined) return 'missing';
  if (Array.isArray(value)) return 'array';
  if (isRecord(value)) return 'object';
  return 'scalar';
}

function diffProductValue(before: unknown, after: unknown, path: string[], patches: LibraryPatch[]): void {
  if (deepEqual(before, after)) return;

  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      diffProductValue(before[key], after[key], [...path, key], patches);
    }
    return;
  }

  if (after === undefined) {
    patches.push({
      op: 'delete',
      path,
      beforeExists: before !== undefined,
      beforeValue: cloneJson(before)
    });
    return;
  }

  patches.push({
    op: 'set',
    path,
    value: cloneJson(after),
    beforeExists: before !== undefined,
    beforeValue: before === undefined ? undefined : cloneJson(before)
  });
}

function diffProductDraft(before: Product, after: Product): LibraryPatch[] {
  const patches: LibraryPatch[] = [];
  for (const root of PRODUCT_EDITABLE_ROOTS) {
    diffProductValue(before[root], after[root], [root], patches);
  }
  return patches;
}

function replayProductDelta(canonical: Product, patches: readonly LibraryPatch[]): { ok: true; draft: Product } | { ok: false; reason: string } {
  const draft = cloneJson(canonical) as unknown as Record<string, unknown>;

  for (const patch of patches) {
    if (patch.path.length === 0) return { ok: false, reason: 'patch sem caminho' };

    let parent: Record<string, unknown> = draft;
    for (let index = 0; index < patch.path.length - 1; index += 1) {
      const segment = patch.path[index];
      const next = parent[segment];
      if (!isRecord(next)) {
        return { ok: false, reason: `estrutura canônica incompatível em ${patch.path.slice(0, index + 1).join('.')}` };
      }
      parent = next;
    }

    const leaf = patch.path[patch.path.length - 1];
    const current = parent[leaf];
    const currentExists = Object.prototype.hasOwnProperty.call(parent, leaf);

    if (!patch.beforeExists && currentExists) {
      return { ok: false, reason: `servidor criou alvo localmente adicionado em ${patch.path.join('.')}` };
    }

    const beforeKind = patchValueKind(patch.beforeValue);
    const currentKind = patchValueKind(current);
    if ((beforeKind === 'array' || beforeKind === 'object') && currentExists && currentKind !== beforeKind) {
      return { ok: false, reason: `tipo estrutural mudou em ${patch.path.join('.')}` };
    }

    if (patch.op === 'delete') {
      delete parent[leaf];
    } else {
      parent[leaf] = cloneJson(patch.value);
    }
  }

  return { ok: true, draft: draft as unknown as Product };
}

function mapLibraryRowToProduct(row: any, fallback?: Product): Product | null {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.id !== 'string' || typeof row.sku !== 'string' || typeof row.name !== 'string') return null;
  if (!Number.isInteger(row.version) || row.version <= 0) return null;
  if (!('data' in row)) return null;

  const data = isRecord(row.data) ? row.data : {};
  return {
    id: row.id,
    family_id: typeof row.family_id === 'string' ? row.family_id : null,
    code: row.sku,
    model: row.name,
    family: typeof row.family === 'string' ? row.family : (fallback?.family || 'Geral'),
    description: fallback?.description || row.name,
    specs: (isRecord(data.specs) ? data.specs : data) as Product['specs'],
    imageUrl: fallback?.imageUrl || '',
    version: row.version,
    createdAt: typeof row.created_at === 'string' ? row.created_at : fallback?.createdAt,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : fallback?.updatedAt
  };
}

function persistedProductProjection(product: Product): unknown {
  return {
    id: product.id,
    family_id: product.family_id ?? null,
    code: product.code,
    model: product.model,
    family: product.family,
    specs: product.specs,
    version: product.version
  };
}

function sameCanonicalProduct(a: Product, b: Product): boolean {
  return deepEqual(persistedProductProjection(a), persistedProductProjection(b));
}

function replaceProduct(products: Product[], product: Product): Product[] {
  let found = false;
  const next = products.map((candidate) => {
    if (candidate.id !== product.id) return candidate;
    found = true;
    return product;
  });
  return found ? next : [product, ...next];
}

function isSessionClean(session: LibraryProductSession): boolean {
  return session.verified
    && session.localGeneration === session.acknowledgedGeneration
    && session.inFlight === null
    && session.failure === null
    && session.conflict === null
    && session.reconciliationRequired === null;
}

function canAutomaticLibrarySave(session: LibraryProductSession): boolean {
  return session.verified
    && session.baseRevision !== null
    && session.baseRevision > 0
    && session.inFlight === null
    && session.failure === null
    && session.conflict === null
    && session.reconciliationRequired === null
    && session.localGeneration > session.acknowledgedGeneration;
}

function isCurrentAuthLibraryClean(sessions: Record<string, LibraryProductSession>): boolean {
  const authIdentity = getLibraryAuthIdentity();
  const current = Object.values(sessions).filter((session) => session.authIdentity === authIdentity);
  return current.every(isSessionClean);
}

function applyRemoteProductObservation(
  session: LibraryProductSession,
  remote: Product | null,
  remoteRevision: number | null,
  deleted: boolean
): LibraryProductSession {
  const acceptsRemoteSnapshot = Boolean(
    remote
      && remoteRevision !== null
      && (session.remoteRevision === null || remoteRevision >= session.remoteRevision)
  );
  const next: LibraryProductSession = {
    ...session,
    remoteSnapshot: acceptsRemoteSnapshot ? cloneJson(remote) : session.remoteSnapshot,
    remoteRevision: remoteRevision !== null && (session.remoteRevision === null || remoteRevision >= session.remoteRevision)
      ? remoteRevision
      : session.remoteRevision,
    remoteDeletion: deleted || session.remoteDeletion
  };

  if (deleted) {
    if (isSessionClean(session)) {
      return {
        ...next,
        verified: true,
        baseSnapshot: null,
        baseRevision: null,
        remoteSnapshot: null,
        remoteDeletion: true,
        readEpoch: session.readEpoch + 1
      };
    }
    if (!isSessionClean(session)) {
      next.conflict = {
        message: 'O produto foi removido remotamente enquanto há alterações locais.',
        remoteRevision: next.remoteRevision,
        remoteSnapshot: next.remoteSnapshot,
        remoteDeletion: true
      };
    }
    return next;
  }

  if (!remote || remoteRevision === null) return next;
  if (session.baseRevision !== null && remoteRevision < session.baseRevision) return next;

  if (isSessionClean(session)) {
    if (session.baseRevision === null || remoteRevision > session.baseRevision) {
      return {
        ...next,
        verified: true,
        baseSnapshot: cloneJson(remote),
        baseRevision: remoteRevision,
        draft: cloneJson(remote),
        readEpoch: session.readEpoch + 1,
        remoteDeletion: false
      };
    }
    if (remoteRevision === session.baseRevision && session.baseSnapshot && !sameCanonicalProduct(session.baseSnapshot, remote)) {
      return {
        ...next,
        reconciliationRequired: {
          reason: 'same-revision-divergence',
          message: 'O servidor retornou conteúdo incompatível para a mesma revisão do produto.',
          generation: session.localGeneration,
          acceptedRevision: remoteRevision,
          sentSnapshot: cloneJson(session.baseSnapshot),
          canonicalSnapshot: cloneJson(remote),
          localDraft: cloneJson(session.draft),
          postSendDelta: []
        }
      };
    }
    return next;
  }

  if (session.baseRevision !== null && remoteRevision > session.baseRevision && session.inFlight === null) {
    next.conflict = {
      message: `O servidor possui revisão ${remoteRevision}, mais recente que a base local ${session.baseRevision}.`,
      remoteRevision,
      remoteSnapshot: cloneJson(remote),
      remoteDeletion: false
    };
  }

  return next;
}

function deriveLibrarySessionStatus(sessions: Record<string, LibraryProductSession>): Pick<LibraryState, 'isDirty' | 'isSaving' | 'syncStatus' | 'syncError'> {
  const authIdentity = getLibraryAuthIdentity();
  const current = Object.values(sessions).filter((session) => session.authIdentity === authIdentity);
  const conflict = current.find((session) => session.conflict || session.reconciliationRequired);
  const failure = current.find((session) => session.failure);
  const saving = current.some((session) => session.inFlight !== null);
  const dirty = current.some((session) => session.localGeneration > session.acknowledgedGeneration);
  const unverified = current.some((session) => !session.verified);

  if (conflict) {
    return {
      isDirty: dirty,
      isSaving: saving,
      syncStatus: 'conflict',
      syncError: conflict.conflict?.message || conflict.reconciliationRequired?.message || 'Reconciliação necessária.'
    };
  }
  if (failure) {
    return { isDirty: dirty, isSaving: saving, syncStatus: 'error', syncError: failure.failure?.message || 'Falha ao salvar.' };
  }
  if (saving) return { isDirty: dirty, isSaving: true, syncStatus: 'saving', syncError: null };
  if (dirty) return { isDirty: true, isSaving: false, syncStatus: 'dirty', syncError: null };
  if (unverified) return { isDirty: false, isSaving: false, syncStatus: 'offline', syncError: null };
  return { isDirty: false, isSaving: false, syncStatus: 'synced', syncError: null };
}

function recordLibraryEdit(
  state: LibraryState,
  productId: string,
  updatedProduct: Product
): Partial<LibraryState> {
  const authIdentity = getLibraryAuthIdentity();
  const key = getLibrarySessionKey(productId, authIdentity);
  const visibleBaseline = state.products.find((product) => product.id === productId);
  const existing = state.productSessions[key]
    || (visibleBaseline
      ? createLibrarySession(visibleBaseline, authIdentity, state.workspaceLoaded && state.dataProvenance === 'cloud_official')
      : undefined);
  if (!existing) return {};

  const nextGeneration = existing.localGeneration + 1;
  const patches = diffProductDraft(existing.draft, updatedProduct);
  const nextInFlight = existing.inFlight
    ? {
        ...existing.inFlight,
        postSendDelta: [...existing.inFlight.postSendDelta, ...patches]
      }
    : null;
  const nextSession: LibraryProductSession = {
    ...existing,
    localGeneration: nextGeneration,
    draft: cloneJson(updatedProduct),
    inFlight: nextInFlight,
    pendingGeneration: nextGeneration,
    discardToken: null
  };
  const productSessions = { ...state.productSessions, [key]: nextSession };
  return {
    productSessions,
    products: replaceProduct(state.products, updatedProduct),
    ...deriveLibrarySessionStatus(productSessions)
  };
}

let libraryRealtimeChannel: RealtimeChannel | null = null;
let libraryPresenceChannel: RealtimeChannel | null = null;

// 3. Colunas Estruturais Obrigatórias de Todo Produto
export const CORE_PRODUCT_COLUMNS: LibraryColumn[] = [
  { key: 'code', label: 'Código', visible: true, width: 110, isSystem: true, isCustom: false },
  { key: 'model', label: 'Modelo', visible: true, width: 130, isSystem: true, isCustom: false }
];

export const DEFAULT_FALLBACK_COLUMNS: LibraryColumn[] = [
  { key: 'code', label: 'Código', visible: true, width: 110, isSystem: true, isCustom: false },
  { key: 'model', label: 'Modelo', visible: true, width: 130, isSystem: true, isCustom: false },
  { key: 'range', label: 'Faixa de Medição', visible: true, width: 130, isCustom: false },
  { key: 'unit', label: 'Unidade', visible: true, width: 70, isCustom: false },
  { key: 'accuracy', label: 'Exatidão', visible: true, width: 100, isCustom: false },
  { key: 'output', label: 'Sinal de Saída', visible: true, width: 120, isCustom: false },
  { key: 'processConnection', label: 'Conexão de Processo', visible: true, width: 150, isCustom: false }
];

export const useLibraryStore = create<LibraryState>((set, get) => ({
  products: INITIAL_PRODUCTS,
  families: [],
  familyFields: {},
  familyColumns: {},
  changeEvents: [],
  selectedProductId: null,
  searchQuery: '',
  selectedFamily: '',
  workspaceLoaded: false,
  workspaceSource: 'cloud',
  dataProvenance: 'demo_seed',
  
  syncStatus: 'synced',
  syncError: null,
  isDirty: false,
  isSaving: false,
  productSessions: {},
  
  cellPresence: {},
  familyPresence: {},
  recentEditedCells: {},

  loadProducts: async () => {
    await get().loadWorkspace();
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  
  setSelectedFamily: (selectedFamily) => {
    set({ selectedFamily });
    const current = get();
    const famObj = current.families.find(f => f.name === selectedFamily || f.slug === selectedFamily || f.id === selectedFamily);
    if (famObj && libraryPresenceChannel) {
      const user = useAuthStore.getState();
      const actorName = user.email ? user.email.split('@')[0] : 'Colaborador';
      void libraryPresenceChannel.track({
        userId: user.userId || 'anon',
        clientInstanceId: libraryClientInstanceId,
        userName: actorName,
        userEmail: user.email || '',
        familyId: famObj.id,
        activity: 'viewing',
        lastSeenAt: Date.now()
      });
    }
  },
  
  setSelectedProduct: (selectedProductId) => set({ selectedProductId }),

  setFocusedCell: (productId, columnKey, isEditing = false) => {
    if (!libraryPresenceChannel) return;
    const user = useAuthStore.getState();
    const actorName = user.email ? user.email.split('@')[0] : 'Colaborador';
    const currentFam = get().families.find(f => f.name === get().selectedFamily || f.slug === get().selectedFamily);
    
    void libraryPresenceChannel.track({
      userId: user.userId || 'anon',
      clientInstanceId: libraryClientInstanceId,
      userName: actorName,
      userEmail: user.email || '',
      familyId: currentFam?.id || null,
      productId: productId || null,
      columnKey: columnKey || null,
      activity: isEditing ? 'editing' : 'viewing',
      lastSeenAt: Date.now()
    });
  },

  createFamily: async (name, description = '') => {
    const tempId = 'fam_' + Date.now();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tempFam: ProductFamily = {
      id: tempId,
      name,
      slug,
      description,
      sort_order: get().families.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const previousFamilies = get().families;
    set((state) => ({
      families: [...state.families, tempFam],
      selectedFamily: name,
      syncStatus: 'saving'
    }));

    const res = await SupabaseService.saveProductFamily({ name, description });
    if (res.success && res.data) {
      const confirmed: ProductFamily = res.data;
      set((state) => ({
        families: state.families.map(f => f.id === tempId ? confirmed : f),
        selectedFamily: confirmed.name,
        ...deriveLibrarySessionStatus(state.productSessions)
      }));
      return { success: true, data: confirmed };
    }

    // Rollback em caso de falha no servidor
    set({
      families: previousFamilies,
      syncStatus: 'error',
      syncError: res.error || 'Erro ao criar família no servidor'
    });
    return { success: false, error: res.error || 'Falha ao salvar família no servidor' };
  },

  renameFamily: async (familyId, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return { success: false, error: 'O nome da família não pode ser vazio.' };
    }

    const currentFamilies = get().families;
    const target = currentFamilies.find(f => f.id === familyId);
    if (!target) {
      return { success: false, error: 'Família não encontrada.' };
    }

    if (trimmed === target.name) {
      return { success: true };
    }

    const isDuplicate = currentFamilies.some(
      f => f.id !== familyId && (f.name.trim().toLowerCase() === trimmed.toLowerCase() || f.slug === slugifyFamilyName(trimmed))
    );
    if (isDuplicate) {
      return { success: false, error: 'Já existe uma família com este nome.' };
    }

    const userRole = useAuthStore.getState().role;
    if (userRole !== 'admin') {
      return { success: false, error: 'Permissão negada: apenas administradores podem alterar famílias de produtos.' };
    }

    set({ syncStatus: 'saving' });

    // CLOUD-FIRST: chama SupabaseService com expected_updated_at (CAS)
    const res = await SupabaseService.saveProductFamily({
      id: familyId,
      name: trimmed,
      expected_updated_at: target.updated_at
    });

    if (res.success && res.data) {
      const confirmed = res.data;
      const oldName = target.name;
      const oldSlug = target.slug;

      const wasSelected =
        get().selectedFamily === oldName ||
        get().selectedFamily === oldSlug ||
        get().selectedFamily === familyId;

      const nextSelected = wasSelected ? confirmed.name : get().selectedFamily;

      // Atualiza familyFields: ID é a autoridade canônica estável
      const updatedFields = { ...get().familyFields };
      const targetFields = updatedFields[familyId] || (oldName ? updatedFields[oldName] : []) || [];
      updatedFields[familyId] = targetFields;
      updatedFields[confirmed.name] = targetFields;
      if (confirmed.slug) updatedFields[confirmed.slug] = targetFields;
      if (oldName && oldName !== confirmed.name) delete updatedFields[oldName];
      if (oldSlug && oldSlug !== confirmed.slug) delete updatedFields[oldSlug];

      set((state) => {
        const authIdentity = getLibraryAuthIdentity();
        const productSessions = { ...state.productSessions };
        const updatedProducts = state.products.map((product) => {
          const affected = product.family_id === familyId
            || (product.family && product.family.trim().toLowerCase() === oldName.trim().toLowerCase());
          if (!affected) return product;
          const key = getLibrarySessionKey(product.id, authIdentity);
          const session = productSessions[key];
          if (session && !isSessionClean(session)) return product;

          const renamed = { ...product, family_id: familyId, family: confirmed.name };
          if (session) {
            productSessions[key] = {
              ...session,
              draft: { ...session.draft, family_id: familyId, family: confirmed.name },
              baseSnapshot: session.baseSnapshot
                ? { ...session.baseSnapshot, family_id: familyId, family: confirmed.name }
                : null,
              remoteSnapshot: session.remoteSnapshot
                ? { ...session.remoteSnapshot, family_id: familyId, family: confirmed.name }
                : null
            };
          }
          return renamed;
        });
        return {
          families: state.families.map(f => f.id === familyId ? confirmed : f),
          products: updatedProducts,
          productSessions,
          familyFields: updatedFields,
          selectedFamily: nextSelected,
          ...deriveLibrarySessionStatus(productSessions)
        };
      });

      void StorageService.saveProducts(get().products);
      return { success: true };
    }

    set({
      syncStatus: res.conflict ? 'conflict' : 'error',
      syncError: res.error || 'Erro ao renomear família no servidor.'
    });
    return { success: false, error: res.error || 'Falha ao renomear família no servidor.' };
  },

  deleteFamily: async (familyId) => {
    const currentFamilies = get().families;
    const target = currentFamilies.find(f => f.id === familyId);
    if (!target) {
      return { success: false, error: 'Família não encontrada.' };
    }

    const userRole = useAuthStore.getState().role;
    if (userRole !== 'admin') {
      return { success: false, error: 'Permissão negada: apenas administradores podem excluir famílias de produtos.' };
    }

    // Client-side guard (informativo / rápido)
    const hasProducts = get().products.some(
      p => p.family_id === familyId || (p.family && p.family.trim().toLowerCase() === target.name.trim().toLowerCase())
    );
    if (hasProducts) {
      return {
        success: false,
        error: 'Esta família contém produtos associados e não pode ser excluída.'
      };
    }

    set({ syncStatus: 'saving' });

    // CLOUD-FIRST: chama delete_product_family_v2 com expected_updated_at (CAS)
    const res = await SupabaseService.deleteProductFamily(familyId, target.updated_at);
    if (res.success) {
      const nextSelected = resolveFamilySelectionAfterDelete(currentFamilies, familyId, get().selectedFamily);
      const remaining = currentFamilies.filter(f => f.id !== familyId);

      // Limpeza de chaves de familyFields
      const updatedFields = { ...get().familyFields };
      delete updatedFields[familyId];
      delete updatedFields[target.name];
      if (target.slug) delete updatedFields[target.slug];

      set((state) => ({
        families: remaining,
        selectedFamily: nextSelected,
        familyFields: updatedFields,
        ...deriveLibrarySessionStatus(state.productSessions)
      }));

      return { success: true };
    }

    set({
      syncStatus: res.conflict ? 'conflict' : 'error',
      syncError: res.error || 'Erro ao excluir família no servidor.'
    });
    return { success: false, error: res.error || 'Falha ao excluir família no servidor.' };
  },

  getColumnsForFamily: (family: string) => {
    const famObj = get().families.find(f => f.name === family || f.slug === family || f.id === family);
    const familyKey = famObj?.id || family;
    const customFields = (famObj?.id && get().familyFields[famObj.id]) || (famObj?.name && get().familyFields[famObj.name]) || get().familyFields[familyKey] || [];
    
    const familyCols: LibraryColumn[] = customFields.map(f => ({
      id: f.id,
      key: f.field_key,
      label: f.label,
      visible: f.visible,
      width: f.width || 130,
      isSystem: f.is_system,
      isCustom: !f.is_system,
      fieldType: (f.field_type as any) || 'text'
    }));

    // Se já existem campos persistidos para a família (seja materializados ou novos):
    // Garante que Código e Modelo NUNCA desapareçam e anexa os campos da família
    if (familyCols.length > 0) {
      const coreKeys = new Set(CORE_PRODUCT_COLUMNS.map(c => c.key));
      const nonCoreFamilyCols = familyCols.filter(c => !coreKeys.has(c.key));
      return [...CORE_PRODUCT_COLUMNS, ...nonCoreFamilyCols];
    }

    // Modo offline / sem conexão caso nunca tenha sincronizado
    if (get().syncStatus === 'offline' && get().families.length === 0) {
      return DEFAULT_FALLBACK_COLUMNS;
    }

    // Família sem campos específicos: retorna as colunas universais (Código + Modelo)
    return [...CORE_PRODUCT_COLUMNS];
  },

  addFamilyColumn: async (familyIdOrName, fieldKey, label, fieldType = 'text') => {
    const famObj = get().families.find(f => f.id === familyIdOrName || f.name === familyIdOrName || f.slug === familyIdOrName);
    const familyKey = famObj?.id || familyIdOrName;
    const previousFields = get().familyFields[familyKey] || [];
    const tempFieldId = 'col_' + Date.now();
    
    const newField: ProductFamilyField = {
      id: tempFieldId,
      family_id: familyKey,
      field_key: fieldKey,
      label,
      field_type: fieldType,
      unit: null,
      sort_order: previousFields.length + 1,
      width: 130,
      visible: true,
      is_system: false
    };

    // Atualização otimista local
    set((state) => {
      const existing = state.familyFields[familyKey] || [];
      const updated = existing.some(f => f.field_key === fieldKey) ? existing : [...existing, newField];
      return {
        familyFields: {
          ...state.familyFields,
          [familyKey]: updated,
          ...(famObj ? { [famObj.name]: updated } : {})
        },
        syncStatus: 'saving'
      };
    });

    const res = await SupabaseService.saveFamilyField({
      family_id: famObj?.id || familyKey,
      field_key: fieldKey,
      label,
      field_type: fieldType,
      sort_order: newField.sort_order,
      width: 130,
      visible: true,
      is_system: false
    });

    if (res.success && res.data) {
      const confirmed: ProductFamilyField = res.data;
      set((state) => {
        const existing = state.familyFields[familyKey] || [];
        const updated = existing.map(f => f.id === tempFieldId ? confirmed : f);
        return {
          familyFields: {
            ...state.familyFields,
            [familyKey]: updated,
            ...(famObj ? { [famObj.name]: updated } : {})
          },
          ...deriveLibrarySessionStatus(state.productSessions)
        };
      });
      return { success: true, data: confirmed };
    }

    // Rollback em caso de erro no servidor
    set((state) => ({
      familyFields: {
        ...state.familyFields,
        [familyKey]: previousFields,
        ...(famObj ? { [famObj.name]: previousFields } : {})
      },
      syncStatus: 'error',
      syncError: res.error || 'Erro ao salvar coluna no servidor'
    }));
    return { success: false, error: res.error || 'Falha ao salvar coluna no servidor' };
  },

  renameFamilyColumn: async (fieldIdOrFamily, familyOrFieldKey, newLabel) => {
    let familyKey = fieldIdOrFamily;
    let targetKey = familyOrFieldKey;
    let labelVal = newLabel;

    if (newLabel === undefined) {
      labelVal = familyOrFieldKey;
    }

    const previousFields = { ...get().familyFields };

    set((state) => {
      const newFields = { ...state.familyFields };
      for (const [fKey, list] of Object.entries(newFields)) {
        newFields[fKey] = list.map(f => {
          if (f.id === fieldIdOrFamily || f.field_key === familyOrFieldKey || f.id === familyOrFieldKey || (f.field_key === targetKey && fKey === familyKey)) {
            return { ...f, label: labelVal };
          }
          return f;
        });
      }
      return { familyFields: newFields, syncStatus: 'saving' };
    });

    const res = await SupabaseService.saveFamilyField({ id: fieldIdOrFamily, label: labelVal });
    if (res.success) {
      set((state) => ({ ...deriveLibrarySessionStatus(state.productSessions) }));
      return { success: true };
    }

    // Rollback em caso de falha no servidor
    set({
      familyFields: previousFields,
      syncStatus: 'error',
      syncError: res.error || 'Erro ao renomear coluna no servidor'
    });
    return { success: false, error: res.error || 'Falha ao renomear coluna no servidor' };
  },

  removeFamilyColumn: async (fieldIdOrFamily, familyOrFieldKey, fieldKey) => {
    const targetKey = fieldKey || familyOrFieldKey;
    const targetId = fieldIdOrFamily;
    const previousFields = { ...get().familyFields };

    set((state) => {
      const newFields = { ...state.familyFields };
      for (const [fKey, list] of Object.entries(newFields)) {
        newFields[fKey] = list.filter(f => f.id !== targetId && f.field_key !== targetKey && f.id !== targetKey);
      }
      return { familyFields: newFields, syncStatus: 'saving' };
    });

    const res = await SupabaseService.deleteFamilyField(targetId);
    if (res.success) {
      set((state) => ({ ...deriveLibrarySessionStatus(state.productSessions) }));
      return { success: true };
    }

    // Rollback em caso de falha no servidor
    set({
      familyFields: previousFields,
      syncStatus: 'error',
      syncError: res.error || 'Erro ao excluir coluna no servidor'
    });
    return { success: false, error: res.error || 'Falha ao excluir coluna no servidor' };
  },

  addProduct: async (productData) => {
    const tempId = 'prod_' + Date.now();
    const newProduct: Product = {
      ...productData,
      id: tempId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    set((state) => ({
      products: [newProduct, ...state.products],
      syncStatus: 'saving'
    }));

    const res = await SupabaseService.saveProduct(newProduct, 0, undefined, `Criação do produto ${newProduct.model}`);
    if (res.success && res.data) {
      const confirmed = mapLibraryRowToProduct(res.data, newProduct);
      if (!confirmed) {
        set((state) => ({
          products: state.products.filter((product) => product.id !== tempId),
          syncStatus: 'error',
          syncError: 'Resposta inválida ao criar produto.'
        }));
        return { success: false, error: 'Resposta inválida ao criar produto.' };
      }

      set((state) => {
        const authIdentity = getLibraryAuthIdentity();
        const session = createLibrarySession(confirmed, authIdentity, true);
        const productSessions = { ...state.productSessions, [session.key]: session };
        return {
          products: state.products.map(p => p.id === tempId ? confirmed : p),
          productSessions,
          ...deriveLibrarySessionStatus(productSessions)
        };
      });
      void StorageService.saveProducts(get().products);
      return { success: true, data: confirmed };
    }

    // Rollback se falhar no servidor
    set((state) => ({
      products: state.products.filter(p => p.id !== tempId),
      syncStatus: 'error',
      syncError: res.error || 'Erro ao salvar produto no servidor'
    }));
    return { success: false, error: res.error || 'Falha ao salvar produto no servidor' };
  },

  updateProduct: async (id, updates) => {
    const current = get().getProductSession(id)?.draft || get().products.find(p => p.id === id);
    if (!current) return;

    const updatedProd: Product = {
      ...current,
      ...updates,
      specs: {
        ...current.specs,
        ...(updates.specs || {})
      },
      updatedAt: new Date().toISOString()
    };

    editSequence += 1;
    set((state) => recordLibraryEdit(state, id, updatedProd));

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceEditSequence = editSequence;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void get().flushLibraryEdits('automatic');
    }, 500);
  },

  updateProductCell: (productId, fieldKey, value, immediateFlush = false) => {
    const currentProd = get().getProductSession(productId)?.draft || get().products.find(p => p.id === productId);
    if (!currentProd) return;

    const isStandardProp = ['code', 'model', 'description', 'family', 'imageUrl'].includes(fieldKey);
    const updatedProd: Product = {
      ...currentProd,
      ...(isStandardProp ? { [fieldKey]: value } : {}),
      specs: {
        ...currentProd.specs,
        ...(!isStandardProp ? { [fieldKey]: value } : {}),
        customSpecs: {
          ...(currentProd.specs?.customSpecs || {}),
          ...(!isStandardProp && !['range', 'unit', 'accuracy', 'output', 'powerSupply', 'processConnection', 'protectionDegree'].includes(fieldKey) ? { [fieldKey]: value } : {})
        }
      },
      updatedAt: new Date().toISOString()
    };

    editSequence += 1;
    set((state) => recordLibraryEdit(state, productId, updatedProd));

    if (immediateFlush) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      debounceEditSequence = editSequence;
      void get().flushLibraryEdits('automatic');
      return;
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceEditSequence = editSequence;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void get().flushLibraryEdits('automatic');
    }, 500);
  },

  getProductSession: (productId) => getCurrentLibrarySession(get(), productId),

  flushLibraryEdits: async (reason = 'manual') => {
    if (activeLibraryDrain) return activeLibraryDrain;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    const authIdentity = getLibraryAuthIdentity();
    const capturedOwnerIds = Object.values(get().productSessions)
      .filter((session) => session.authIdentity === authIdentity)
      .filter((session) => session.localGeneration > session.acknowledgedGeneration)
      .filter((session) => session.verified && session.baseRevision !== null && session.baseRevision > 0)
      .filter((session) => !session.inFlight && !session.conflict && !session.reconciliationRequired)
      .filter((session) => reason === 'manual' || !session.failure)
      .map((session) => session.productId);

    if (capturedOwnerIds.length === 0) {
      set((state) => ({ ...deriveLibrarySessionStatus(state.productSessions) }));
      return isCurrentAuthLibraryClean(get().productSessions);
    }

    const runSaveAttempt = async (productId: string, allowFailureRetry: boolean): Promise<boolean> => {
      const session = get().productSessions[getLibrarySessionKey(productId, authIdentity)];
      if (!session) return false;
      if (session.authIdentity !== authIdentity || session.inFlight || session.conflict || session.reconciliationRequired) return false;
      if (session.failure && !allowFailureRetry) return false;
      if (!session.verified || session.baseRevision === null || session.baseRevision <= 0) return false;
      if (session.localGeneration <= session.acknowledgedGeneration) return true;
      if (session.remoteDeletion || (session.remoteRevision !== null && session.remoteRevision > session.baseRevision)) {
        set((state) => {
          const current = state.productSessions[session.key];
          if (!current || current.epoch !== session.epoch) return {};
          const next: LibraryProductSession = {
            ...current,
            conflict: {
              message: 'Há evidência remota mais recente; o salvamento automático foi bloqueado.',
              remoteRevision: current.remoteRevision,
              remoteSnapshot: current.remoteSnapshot,
              remoteDeletion: current.remoteDeletion
            }
          };
          const productSessions = { ...state.productSessions, [session.key]: next };
          return { productSessions, ...deriveLibrarySessionStatus(productSessions) };
        });
        return false;
      }

      const generation = session.localGeneration;
      const expectedRevision = session.baseRevision;
      const requestId = `library-save-${++requestSequence}`;
      const sentSnapshot = cloneJson({ ...session.draft, version: expectedRevision });
      const changedFields = session.baseSnapshot
        ? diffProductDraft(session.baseSnapshot, sentSnapshot).map((patch) => patch.path[0]).filter(Boolean)
        : [];
      const uniqueChangedFields = Array.from(new Set(changedFields));

      set((state) => {
        const current = state.productSessions[session.key];
        if (!current || current.epoch !== session.epoch || current.inFlight) return {};
        const next: LibraryProductSession = {
          ...current,
          inFlight: {
            requestId,
            generation,
            expectedRevision,
            sentSnapshot,
            postSendDelta: []
          },
          pendingGeneration: null,
          failure: allowFailureRetry ? null : current.failure,
          discardToken: null
        };
        const productSessions = { ...state.productSessions, [session.key]: next };
        return { productSessions, ...deriveLibrarySessionStatus(productSessions) };
      });

      const res = await SupabaseService.saveProduct(
        sentSnapshot,
        expectedRevision,
        uniqueChangedFields[0],
        `Edição em ${sentSnapshot.model}: ${uniqueChangedFields.join(', ') || 'produto'}`
      );

      let attemptSucceeded = false;
      set((state) => {
        const current = state.productSessions[session.key];
        if (!current || current.authIdentity !== authIdentity || current.epoch !== session.epoch) return {};
        if (!current.inFlight || current.inFlight.requestId !== requestId) return {};

        const inFlight = current.inFlight;
        if (!res.success) {
          const next: LibraryProductSession = res.conflict
            ? {
                ...current,
                inFlight: null,
                pendingGeneration: current.localGeneration,
                conflict: {
                  message: `Conflito no produto ${current.draft.model}: alterado em outro dispositivo.`,
                  remoteRevision: current.remoteRevision,
                  remoteSnapshot: current.remoteSnapshot,
                  remoteDeletion: current.remoteDeletion
                },
                discardToken: null
              }
            : {
                ...current,
                inFlight: null,
                pendingGeneration: current.localGeneration,
                failure: {
                  generation: inFlight.generation,
                  message: res.error || 'Erro ao persistir alteração na biblioteca.',
                  sentSnapshot: cloneJson(inFlight.sentSnapshot),
                  postSendDelta: cloneJson(inFlight.postSendDelta)
                },
                discardToken: null
              };
          const productSessions = { ...state.productSessions, [session.key]: next };
          return { productSessions, ...deriveLibrarySessionStatus(productSessions) };
        }

        const acceptedRevision = Number.isInteger(res.data?.version) ? Number(res.data.version) : null;
        if (acceptedRevision !== expectedRevision + 1) {
          const next: LibraryProductSession = {
            ...current,
            inFlight: null,
            pendingGeneration: current.localGeneration,
            reconciliationRequired: {
              reason: 'invalid-ack',
              message: 'ACK de produto inválido ou sem a revisão CAS esperada.',
              generation: inFlight.generation,
              acceptedRevision,
              sentSnapshot: cloneJson(inFlight.sentSnapshot),
              canonicalSnapshot: null,
              localDraft: cloneJson(current.draft),
              postSendDelta: cloneJson(inFlight.postSendDelta),
              canonicalVerificationReadAttempted: false
            },
            discardToken: null
          };
          const productSessions = { ...state.productSessions, [session.key]: next };
          return { productSessions, ...deriveLibrarySessionStatus(productSessions) };
        }

        const canonical = mapLibraryRowToProduct(res.data, inFlight.sentSnapshot);
        if (!canonical || canonical.id !== current.productId) {
          const next: LibraryProductSession = {
            ...current,
            inFlight: null,
            pendingGeneration: current.localGeneration,
            remoteRevision: current.remoteRevision === null ? acceptedRevision : Math.max(current.remoteRevision, acceptedRevision),
            reconciliationRequired: {
              reason: 'canonical-verification',
              message: 'O servidor aceitou a revisão, mas não retornou um documento canônico completo. Verificação explícita necessária.',
              generation: inFlight.generation,
              acceptedRevision,
              sentSnapshot: cloneJson(inFlight.sentSnapshot),
              canonicalSnapshot: null,
              localDraft: cloneJson(current.draft),
              postSendDelta: cloneJson(inFlight.postSendDelta)
            },
            discardToken: null
          };
          const productSessions = { ...state.productSessions, [session.key]: next };
          return { productSessions, ...deriveLibrarySessionStatus(productSessions) };
        }

        const replayed = replayProductDelta(canonical, inFlight.postSendDelta);
        if (!replayed.ok) {
          const next: LibraryProductSession = {
            ...current,
            inFlight: null,
            pendingGeneration: current.localGeneration,
            remoteSnapshot: cloneJson(canonical),
            remoteRevision: current.remoteRevision === null ? acceptedRevision : Math.max(current.remoteRevision, acceptedRevision),
            reconciliationRequired: {
              reason: 'structural-replay',
              message: `Não foi possível reaplicar alterações pós-envio com segurança: ${replayed.reason}`,
              generation: inFlight.generation,
              acceptedRevision,
              sentSnapshot: cloneJson(inFlight.sentSnapshot),
              canonicalSnapshot: cloneJson(canonical),
              localDraft: cloneJson(current.draft),
              postSendDelta: cloneJson(inFlight.postSendDelta)
            },
            discardToken: null
          };
          const productSessions = { ...state.productSessions, [session.key]: next };
          return { productSessions, ...deriveLibrarySessionStatus(productSessions) };
        }

        let conflict = current.conflict;
        let reconciliationRequired: LibraryReconciliationBarrier | null = null;
        if (current.remoteDeletion) {
          conflict = {
            message: 'O produto foi removido remotamente durante o salvamento.',
            remoteRevision: current.remoteRevision,
            remoteSnapshot: current.remoteSnapshot,
            remoteDeletion: true
          };
        } else if (current.remoteRevision !== null && current.remoteRevision > acceptedRevision) {
          conflict = {
            message: `Foi observada revisão remota ${current.remoteRevision} após o ACK ${acceptedRevision}.`,
            remoteRevision: current.remoteRevision,
            remoteSnapshot: current.remoteSnapshot,
            remoteDeletion: false
          };
        } else if (
          current.remoteRevision === acceptedRevision
          && current.remoteSnapshot
          && !sameCanonicalProduct(current.remoteSnapshot, canonical)
        ) {
          reconciliationRequired = {
            reason: 'same-revision-divergence',
            message: 'O ACK e a observação remota divergem para a mesma revisão.',
            generation: inFlight.generation,
            acceptedRevision,
            sentSnapshot: cloneJson(inFlight.sentSnapshot),
            canonicalSnapshot: cloneJson(canonical),
            localDraft: cloneJson(current.draft),
            postSendDelta: cloneJson(inFlight.postSendDelta)
          };
        }

        const next: LibraryProductSession = {
          ...current,
          verified: true,
          baseSnapshot: cloneJson(canonical),
          baseRevision: acceptedRevision,
          remoteSnapshot: current.remoteRevision !== null && current.remoteRevision > acceptedRevision
            ? current.remoteSnapshot
            : cloneJson(canonical),
          remoteRevision: current.remoteRevision === null ? acceptedRevision : Math.max(current.remoteRevision, acceptedRevision),
          remoteDeletion: current.remoteDeletion,
          acknowledgedGeneration: inFlight.generation,
          draft: cloneJson(replayed.draft),
          inFlight: null,
          pendingGeneration: current.localGeneration > inFlight.generation ? current.localGeneration : null,
          failure: null,
          conflict,
          reconciliationRequired,
          discardToken: null,
          readEpoch: current.readEpoch + 1
        };
        const productSessions = { ...state.productSessions, [session.key]: next };
        attemptSucceeded = conflict === null && reconciliationRequired === null;
        return {
          productSessions,
          products: authIdentity === getLibraryAuthIdentity() ? replaceProduct(state.products, next.draft) : state.products,
          ...deriveLibrarySessionStatus(productSessions)
        };
      });

      return attemptSucceeded;
    };

    const drain = (async () => {
      const passOneSuccess = new Set<string>();
      for (const productId of capturedOwnerIds) {
        const ok = await runSaveAttempt(productId, reason === 'manual');
        if (ok) passOneSuccess.add(productId);
      }

      for (const productId of capturedOwnerIds) {
        if (!passOneSuccess.has(productId)) continue;
        const session = get().productSessions[getLibrarySessionKey(productId, authIdentity)];
        if (!session || !canAutomaticLibrarySave(session)) continue;
        if (session.remoteDeletion || (session.remoteRevision !== null && session.baseRevision !== null && session.remoteRevision > session.baseRevision)) continue;
        await runSaveAttempt(productId, false);
      }

      const finalCutoff = editSequence;
      if (debounceTimer && debounceEditSequence <= finalCutoff) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      set((state) => ({ ...deriveLibrarySessionStatus(state.productSessions) }));
      void StorageService.saveProducts(get().products);
      return isCurrentAuthLibraryClean(get().productSessions);
    })();

    activeLibraryDrain = drain;
    try {
      return await drain;
    } finally {
      if (activeLibraryDrain === drain) activeLibraryDrain = null;
    }
  },

  verifyCanonicalProductAck: async (productId) => {
    const authIdentity = getLibraryAuthIdentity();
    const key = getLibrarySessionKey(productId, authIdentity);
    const session = get().productSessions[key];
    const barrier = session?.reconciliationRequired;
    if (
      !session
      || !barrier
      || barrier.reason !== 'canonical-verification'
      || barrier.acceptedRevision === null
      || barrier.canonicalVerificationReadAttempted
    ) return false;
    const acceptedRevision = barrier.acceptedRevision;
    const capturedEpoch = session.epoch;
    const capturedReadEpoch = session.readEpoch;
    let verificationReadAuthorized = false;
    set((state) => {
      const current = state.productSessions[key];
      const currentBarrier = current?.reconciliationRequired;
      if (
        !current
        || current.authIdentity !== authIdentity
        || current.epoch !== capturedEpoch
        || current.readEpoch !== capturedReadEpoch
        || !currentBarrier
        || currentBarrier.reason !== 'canonical-verification'
        || currentBarrier.acceptedRevision !== acceptedRevision
        || currentBarrier.canonicalVerificationReadAttempted
      ) return {};
      verificationReadAuthorized = true;
      return {
        productSessions: {
          ...state.productSessions,
          [key]: {
            ...current,
            reconciliationRequired: {
              ...currentBarrier,
              canonicalVerificationReadAttempted: true
            }
          }
        }
      };
    });
    if (!verificationReadAuthorized) return false;
    const res = await SupabaseService.listLibraryWorkspace();
    if (!res.success || !res.data) return false;
    const row = res.data.products.find((product: any) => product?.id === productId);
    if (!row) return false;
    const canonical = mapLibraryRowToProduct(row, barrier.sentSnapshot);
    if (!canonical) return false;

    let verified = false;
    set((state) => {
      const current = state.productSessions[key];
      if (!current || current.epoch !== capturedEpoch || current.readEpoch !== capturedReadEpoch) return {};
      const currentBarrier = current.reconciliationRequired;
      if (!currentBarrier || currentBarrier.reason !== 'canonical-verification' || currentBarrier.acceptedRevision !== acceptedRevision) return {};
      if (canonical.version > acceptedRevision) {
        const next: LibraryProductSession = {
          ...current,
          remoteSnapshot: cloneJson(canonical),
          remoteRevision: canonical.version,
          conflict: {
            message: `A verificação encontrou revisão remota ${canonical.version}, superior ao ACK aceito ${acceptedRevision}.`,
            remoteRevision: canonical.version,
            remoteSnapshot: cloneJson(canonical),
            remoteDeletion: false
          }
        };
        const productSessions = { ...state.productSessions, [key]: next };
        return { productSessions, ...deriveLibrarySessionStatus(productSessions) };
      }
      if (canonical.version !== acceptedRevision) return {};

      const replayed = replayProductDelta(canonical, currentBarrier.postSendDelta);
      if (!replayed.ok) {
        const next: LibraryProductSession = {
          ...current,
          remoteSnapshot: cloneJson(canonical),
          remoteRevision: canonical.version,
          reconciliationRequired: {
            ...currentBarrier,
            reason: 'structural-replay',
            canonicalSnapshot: cloneJson(canonical),
            message: `Verificação canônica concluída, mas o replay é inseguro: ${replayed.reason}`
          }
        };
        const productSessions = { ...state.productSessions, [key]: next };
        return { productSessions, ...deriveLibrarySessionStatus(productSessions) };
      }

      const next: LibraryProductSession = {
        ...current,
        verified: true,
        baseSnapshot: cloneJson(canonical),
        baseRevision: canonical.version,
        remoteSnapshot: cloneJson(canonical),
        remoteRevision: canonical.version,
        remoteDeletion: false,
        acknowledgedGeneration: currentBarrier.generation,
        draft: cloneJson(replayed.draft),
        pendingGeneration: current.localGeneration > currentBarrier.generation ? current.localGeneration : null,
        reconciliationRequired: null,
        failure: null,
        readEpoch: current.readEpoch + 1
      };
      const productSessions = { ...state.productSessions, [key]: next };
      verified = true;
      return {
        productSessions,
        products: replaceProduct(state.products, next.draft),
        ...deriveLibrarySessionStatus(productSessions)
      };
    });
    return verified;
  },

  discardProductWithRefresh: async (productId, navigationEpoch) => {
    const authIdentity = getLibraryAuthIdentity();
    const key = getLibrarySessionKey(productId, authIdentity);
    const session = get().productSessions[key];
    if (!session || session.inFlight) return false;
    const token: LibraryDiscardToken = {
      id: `library-discard-${++discardSequence}`,
      authIdentity,
      ownerKey: session.ownerKey,
      epoch: session.epoch,
      generation: session.localGeneration,
      baseRevision: session.baseRevision,
      readEpoch: session.readEpoch,
      navigationEpoch
    };
    set((state) => {
      const current = state.productSessions[key];
      if (!current || current.inFlight || current.epoch !== session.epoch) return {};
      const next = { ...current, discardToken: token };
      return { productSessions: { ...state.productSessions, [key]: next } };
    });

    const res = await SupabaseService.listLibraryWorkspace();
    if (!res.success || !res.data) {
      set((state) => {
        const current = state.productSessions[key];
        if (!current || current.discardToken?.id !== token.id) return {};
        const next = { ...current, discardToken: null };
        const productSessions = { ...state.productSessions, [key]: next };
        return { productSessions, ...deriveLibrarySessionStatus(productSessions) };
      });
      return false;
    }

    const row = res.data.products.find((product: any) => product?.id === productId);
    const canonical = row ? mapLibraryRowToProduct(row, session.baseSnapshot || session.draft) : null;
    let discarded = false;
    set((state) => {
      const current = state.productSessions[key];
      const currentToken = current?.discardToken;
      if (!current || !currentToken || currentToken.id !== token.id) return {};
      const tokenStillExact = current.authIdentity === token.authIdentity
        && current.ownerKey === token.ownerKey
        && current.epoch === token.epoch
        && current.localGeneration === token.generation
        && current.baseRevision === token.baseRevision
        && current.readEpoch === token.readEpoch
        && current.inFlight === null;
      if (!tokenStillExact) return {};

      const nextEpoch = current.epoch + 1;
      if (!canonical) {
        const next: LibraryProductSession = {
          ...current,
          epoch: nextEpoch,
          readEpoch: current.readEpoch + 1,
          verified: true,
          baseSnapshot: null,
          baseRevision: null,
          remoteSnapshot: null,
          remoteRevision: current.remoteRevision,
          remoteDeletion: true,
          localGeneration: 0,
          acknowledgedGeneration: 0,
          inFlight: null,
          pendingGeneration: null,
          failure: null,
          conflict: null,
          reconciliationRequired: null,
          discardToken: null
        };
        const productSessions = { ...state.productSessions, [key]: next };
        discarded = true;
        return {
          productSessions,
          products: state.products.filter((product) => product.id !== productId),
          ...deriveLibrarySessionStatus(productSessions)
        };
      }

      const next: LibraryProductSession = {
        ...createLibrarySession(canonical, authIdentity, true),
        key,
        ownerKey: current.ownerKey,
        epoch: nextEpoch,
        readEpoch: current.readEpoch + 1
      };
      const productSessions = { ...state.productSessions, [key]: next };
      discarded = true;
      return {
        productSessions,
        products: replaceProduct(state.products, canonical),
        ...deriveLibrarySessionStatus(productSessions)
      };
    });
    return discarded;
  },

  invalidateDiscardTokens: () => {
    set((state) => {
      let changed = false;
      const productSessions = { ...state.productSessions };
      for (const [key, session] of Object.entries(productSessions)) {
        if (!session.discardToken) continue;
        productSessions[key] = { ...session, discardToken: null };
        changed = true;
      }
      return changed ? { productSessions } : {};
    });
  },

  deleteProduct: async (id) => {
    const existingSession = get().getProductSession(id);
    if (existingSession && !isSessionClean(existingSession)) {
      return {
        success: false,
        error: 'Este produto possui alterações locais pendentes. Salve ou descarte explicitamente o rascunho antes de excluir.'
      };
    }
    const previousProducts = get().products;
    set((state) => ({
      products: state.products.filter(p => p.id !== id),
      isSaving: true,
      syncStatus: 'saving'
    }));

    const res = await SupabaseService.deleteProduct(id);
    if (res.success) {
      set((state) => {
        const key = getLibrarySessionKey(id);
        const productSessions = { ...state.productSessions };
        delete productSessions[key];
        return { productSessions, ...deriveLibrarySessionStatus(productSessions) };
      });
      void StorageService.saveProducts(get().products);
      return { success: true };
    } else {
      // Rollback se falhar no servidor
      set({
        products: previousProducts,
        isSaving: false,
        syncStatus: 'error',
        syncError: res.error || 'Erro ao excluir produto no servidor'
      });
      return { success: false, error: res.error };
    }
  },

  getProduct: (id) => {
    return get().products.find(p => p.id === id);
  },

  loadWorkspace: async () => {
    const authIdentity = getLibraryAuthIdentity();
    if (activeWorkspaceLoad?.authIdentity === authIdentity) {
      return activeWorkspaceLoad.promise;
    }

    const readId = ++workspaceReadSequence;
    const promise = (async () => {
      try {
        const res = await SupabaseService.listLibraryWorkspace();
        if (res.success && res.data) {
          if (readId !== workspaceReadSequence || getLibraryAuthIdentity() !== authIdentity) return;
          const { families = [], fields = [], products = [], events = [] } = res.data;

          const fieldMap: Record<string, ProductFamilyField[]> = {};
          fields.forEach((fld: any) => {
            const fid = fld.family_id;
            if (!fieldMap[fid]) fieldMap[fid] = [];
            fieldMap[fid].push(fld);

            const parentFam = families.find((family: any) => family.id === fid);
            if (parentFam) {
              if (!fieldMap[parentFam.name]) fieldMap[parentFam.name] = [];
              fieldMap[parentFam.name].push(fld);
            }
          });

          const remoteProducts = products
            .map((row: any) => mapLibraryRowToProduct(row))
            .filter((product: Product | null): product is Product => product !== null);
          const remoteIds = new Set(remoteProducts.map((product) => product.id));
          const currentSelected = get().selectedFamily;
          const matchingFam = families.find((family: any) => (
            family.name === currentSelected || family.id === currentSelected || family.slug === currentSelected
          ));
          const activeFam = matchingFam ? matchingFam.name : (families[0]?.name || '');

          set((state) => {
            const productSessions = { ...state.productSessions };

            for (const remoteProduct of remoteProducts) {
              const key = getLibrarySessionKey(remoteProduct.id, authIdentity);
              const existing = productSessions[key];
              productSessions[key] = existing
                ? applyRemoteProductObservation(existing, remoteProduct, remoteProduct.version, false)
                : createLibrarySession(remoteProduct, authIdentity, true);
            }

            for (const [key, session] of Object.entries(productSessions)) {
              if (session.authIdentity !== authIdentity || remoteIds.has(session.productId)) continue;
              productSessions[key] = applyRemoteProductObservation(session, null, session.remoteRevision, true);
            }

            const visibleProducts: Product[] = [];
            for (const remoteProduct of remoteProducts) {
              const session = productSessions[getLibrarySessionKey(remoteProduct.id, authIdentity)];
              if (session?.remoteDeletion && isSessionClean(session)) continue;
              visibleProducts.push(session?.draft || remoteProduct);
            }
            for (const session of Object.values(productSessions)) {
              if (session.authIdentity !== authIdentity || remoteIds.has(session.productId)) continue;
              if (session.localGeneration > session.acknowledgedGeneration || session.inFlight || session.failure || session.conflict || session.reconciliationRequired) {
                visibleProducts.push(session.draft);
              }
            }

            return {
              workspaceLoaded: true,
              workspaceSource: 'cloud' as const,
              dataProvenance: 'cloud_official' as const,
              families,
              familyFields: fieldMap,
              products: visibleProducts,
              productSessions,
              changeEvents: events,
              selectedFamily: activeFam,
              ...deriveLibrarySessionStatus(productSessions)
            };
          });

          void StorageService.saveProducts(get().products);
          return;
        }
      } catch (error) {
        console.warn('Falha na consulta cloud da biblioteca, usando cache:', error);
      }

      if (readId !== workspaceReadSequence || getLibraryAuthIdentity() !== authIdentity) return;
      const saved = await StorageService.loadProducts();
      if (readId !== workspaceReadSequence || getLibraryAuthIdentity() !== authIdentity) return;
      const fallbackProducts = saved && saved.length > 0 ? saved : INITIAL_PRODUCTS;
      const derivedFamilies = Array.from(new Set(fallbackProducts.map((product) => product.family || 'Geral')));

      set((state) => {
        let visibleProducts = [...fallbackProducts];
        for (const session of Object.values(state.productSessions)) {
          if (session.authIdentity !== authIdentity) continue;
          if (session.localGeneration > session.acknowledgedGeneration || session.inFlight || session.failure || session.conflict || session.reconciliationRequired) {
            visibleProducts = replaceProduct(visibleProducts, session.draft);
          }
        }
        const derived = deriveLibrarySessionStatus(state.productSessions);
        const hasOwnedLineage = derived.isDirty || derived.isSaving || derived.syncStatus === 'conflict' || derived.syncStatus === 'error';
        return {
          workspaceLoaded: true,
          workspaceSource: 'offline' as const,
          dataProvenance: saved && saved.length > 0 ? 'offline_cache' as const : 'demo_seed' as const,
          products: visibleProducts,
          selectedFamily: derivedFamilies[0] || '',
          ...(hasOwnedLineage
            ? derived
            : {
                isDirty: false,
                isSaving: false,
                syncStatus: 'offline' as const,
                syncError: saved && saved.length > 0
                  ? 'Modo Offline: exibindo cache local'
                  : 'Modo Offline: dados de demonstração'
              })
        };
      });
    })();

    activeWorkspaceLoad = { authIdentity, promise };
    try {
      await promise;
    } finally {
      if (activeWorkspaceLoad?.promise === promise) activeWorkspaceLoad = null;
    }
  },

  initRealtimeSubscription: () => {
    const supabase = getSupabase();
    if (!supabase || typeof supabase.channel !== 'function') return () => {};

    if (libraryRealtimeChannel && typeof supabase.removeChannel === 'function') {
      supabase.removeChannel(libraryRealtimeChannel);
      libraryRealtimeChannel = null;
    }
    if (libraryPresenceChannel && typeof supabase.removeChannel === 'function') {
      supabase.removeChannel(libraryPresenceChannel);
      libraryPresenceChannel = null;
    }

    // 1. Canal de Dados Postgres Changes para Biblioteca
    libraryRealtimeChannel = supabase.channel('realtime:library')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        const { eventType, new: newRec, old: oldRec } = payload;
        set((state) => {
          const authIdentity = getLibraryAuthIdentity();
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const productId = newRec?.id as string | undefined;
            if (!productId) return {};
            const fallback = state.productSessions[getLibrarySessionKey(productId, authIdentity)]?.draft
              || state.products.find((product) => product.id === productId);
            const remote = mapLibraryRowToProduct(newRec, fallback);
            if (!remote) return {};
            const key = getLibrarySessionKey(productId, authIdentity);
            const existing = state.productSessions[key];
            const nextSession = existing
              ? applyRemoteProductObservation(existing, remote, remote.version, false)
              : createLibrarySession(remote, authIdentity, true);
            const productSessions = { ...state.productSessions, [key]: nextSession };
            const editorName = newRec.updated_by ? 'Colaborador' : 'Servidor';
            return {
              productSessions,
              products: replaceProduct(state.products, nextSession.draft),
              recentEditedCells: {
                ...state.recentEditedCells,
                [productId]: { editorName, timestamp: Date.now() }
              },
              ...deriveLibrarySessionStatus(productSessions)
            };
          }

          if (eventType === 'DELETE') {
            const productId = oldRec?.id as string | undefined;
            if (!productId) return {};
            const key = getLibrarySessionKey(productId, authIdentity);
            const existing = state.productSessions[key];
            if (!existing) {
              return { products: state.products.filter((product) => product.id !== productId) };
            }
            const nextSession = applyRemoteProductObservation(existing, null, existing.remoteRevision, true);
            const productSessions = { ...state.productSessions, [key]: nextSession };
            const keepLocalDraft = nextSession.localGeneration > nextSession.acknowledgedGeneration
              || nextSession.inFlight !== null
              || nextSession.failure !== null
              || nextSession.conflict !== null
              || nextSession.reconciliationRequired !== null;
            return {
              productSessions,
              products: keepLocalDraft
                ? replaceProduct(state.products, nextSession.draft)
                : state.products.filter((product) => product.id !== productId),
              ...deriveLibrarySessionStatus(productSessions)
            };
          }

          return {};
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_families' }, (payload) => {
        const eventType = payload.eventType;
        const newFam = payload.new as any;
        const oldFam = payload.old as any;
        set((state) => {
          if (eventType === 'INSERT') {
            if (state.families.some(f => f.id === newFam.id)) return state;
            const updatedFamilies = [...state.families, newFam as ProductFamily];
            const nextSelected = state.selectedFamily || (newFam as ProductFamily).name;
            return { families: updatedFamilies, selectedFamily: nextSelected };
          }
          if (eventType === 'UPDATE') {
            const confirmed = newFam as ProductFamily;
            const oldTarget = state.families.find(f => f.id === confirmed.id);
            const oldName = oldTarget?.name;
            const oldSlug = oldTarget?.slug;

            const wasSelected = oldTarget && (
              state.selectedFamily === oldName ||
              state.selectedFamily === oldSlug ||
              state.selectedFamily === confirmed.id
            );
            const nextSelected = wasSelected ? confirmed.name : state.selectedFamily;

            const authIdentity = getLibraryAuthIdentity();
            const productSessions = { ...state.productSessions };
            const updatedProducts = state.products.map((product) => {
              const affected = product.family_id === confirmed.id
                || (oldName && product.family && product.family.trim().toLowerCase() === oldName.trim().toLowerCase());
              if (!affected) return product;
              const key = getLibrarySessionKey(product.id, authIdentity);
              const session = productSessions[key];
              if (session && !isSessionClean(session)) return product;

              const renamed = { ...product, family_id: confirmed.id, family: confirmed.name };
              if (session) {
                productSessions[key] = {
                  ...session,
                  draft: { ...session.draft, family_id: confirmed.id, family: confirmed.name },
                  baseSnapshot: session.baseSnapshot
                    ? { ...session.baseSnapshot, family_id: confirmed.id, family: confirmed.name }
                    : null,
                  remoteSnapshot: session.remoteSnapshot
                    ? { ...session.remoteSnapshot, family_id: confirmed.id, family: confirmed.name }
                    : null
                };
              }
              return renamed;
            });

            // Atualiza familyFields: ID é autoridade estável, aliases atualizados, antigos removidos
            const updatedFields = { ...state.familyFields };
            const targetFields = updatedFields[confirmed.id] || (oldName ? updatedFields[oldName] : []) || [];
            updatedFields[confirmed.id] = targetFields;
            updatedFields[confirmed.name] = targetFields;
            if (confirmed.slug) updatedFields[confirmed.slug] = targetFields;
            if (oldName && oldName !== confirmed.name) delete updatedFields[oldName];
            if (oldSlug && oldSlug !== confirmed.slug) delete updatedFields[oldSlug];

            return {
              families: state.families.map(f => f.id === confirmed.id ? confirmed : f),
              products: updatedProducts,
              productSessions,
              familyFields: updatedFields,
              selectedFamily: nextSelected,
              ...deriveLibrarySessionStatus(productSessions)
            };
          }
          if (eventType === 'DELETE') {
            const deletedId = oldFam?.id;
            if (!deletedId || !state.families.some(f => f.id === deletedId)) {
              return state; // Idempotente
            }

            const target = state.families.find(f => f.id === deletedId);
            const nextSelected = resolveFamilySelectionAfterDelete(state.families, deletedId, state.selectedFamily);
            const remaining = state.families.filter(f => f.id !== deletedId);

            const updatedFields = { ...state.familyFields };
            delete updatedFields[deletedId];
            if (target) {
              delete updatedFields[target.name];
              if (target.slug) delete updatedFields[target.slug];
            }

            return {
              families: remaining,
              selectedFamily: nextSelected,
              familyFields: updatedFields
            };
          }
          return state;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_family_fields' }, (payload) => {
        const eventType = payload.eventType;
        const newFld = payload.new as any;
        const oldFld = payload.old as any;
        set((state) => {
          let familyId = (newFld?.family_id || oldFld?.family_id) as string;
          if (!familyId) {
            for (const [fId, list] of Object.entries(state.familyFields)) {
              if (list.some(f => f.id === oldFld?.id || f.field_key === oldFld?.field_key)) {
                familyId = fId;
                break;
              }
            }
          }
          if (!familyId) return state;

          const parentFam = state.families.find(f => f.id === familyId || f.name === familyId || f.slug === familyId);
          const currentList = state.familyFields[familyId] || (parentFam ? (state.familyFields[parentFam.id] || state.familyFields[parentFam.name]) : []) || [];
          let updatedList = currentList;

          if (eventType === 'INSERT') {
            if (!currentList.some(f => f.id === newFld.id || f.field_key === newFld.field_key)) {
              updatedList = [...currentList, newFld as ProductFamilyField];
            }
          } else if (eventType === 'UPDATE') {
            updatedList = currentList.map(f => (f.id === newFld.id || f.field_key === newFld.field_key) ? (newFld as ProductFamilyField) : f);
          } else if (eventType === 'DELETE') {
            updatedList = currentList.filter(f => f.id !== oldFld?.id && f.field_key !== oldFld?.field_key);
          }

          const updatedMap = {
            ...state.familyFields,
            [familyId]: updatedList
          };
          if (parentFam) {
            updatedMap[parentFam.id] = updatedList;
            updatedMap[parentFam.name] = updatedList;
            if (parentFam.slug) updatedMap[parentFam.slug] = updatedList;
          }
          return { familyFields: updatedMap };
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'library_change_events' }, (payload) => {
        const newEvent = payload.new as LibraryChangeEvent;
        set((state) => ({
          changeEvents: [newEvent, ...state.changeEvents.slice(0, 99)]
        }));
      })
      .subscribe();

    // 2. Canal de Presença com Chave de Sessão Estável (userId:clientInstanceId)
    const currentUserId = useAuthStore.getState().userId || 'anon';
    libraryPresenceChannel = supabase.channel('presence:library', {
      config: { presence: { key: `${currentUserId}:${libraryClientInstanceId}` } }
    });

    libraryPresenceChannel.on('presence', { event: 'sync' }, () => {
      const state = libraryPresenceChannel?.presenceState() || {};
      const newCellPresence: Record<string, LibraryPresenceUser[]> = {};
      const newFamilyPresence: Record<string, LibraryPresenceUser[]> = {};

      Object.values(state).forEach((presences: any) => {
        presences.forEach((p: LibraryPresenceUser) => {
          if (p.productId && p.columnKey) {
            const cellKey = `${p.productId}:${p.columnKey}`;
            if (!newCellPresence[cellKey]) newCellPresence[cellKey] = [];
            // Deduplica presença por userId e clientInstanceId
            if (!newCellPresence[cellKey].some(item => item.clientInstanceId === p.clientInstanceId)) {
              newCellPresence[cellKey].push(p);
            }
          }
          if (p.familyId) {
            if (!newFamilyPresence[p.familyId]) newFamilyPresence[p.familyId] = [];
            if (!newFamilyPresence[p.familyId].some(item => item.clientInstanceId === p.clientInstanceId)) {
              newFamilyPresence[p.familyId].push(p);
            }
          }
        });
      });

      set({ cellPresence: newCellPresence, familyPresence: newFamilyPresence });
    });

    libraryPresenceChannel.subscribe();

    return () => {
      if (libraryRealtimeChannel && typeof supabase.removeChannel === 'function') supabase.removeChannel(libraryRealtimeChannel);
      if (libraryPresenceChannel && typeof supabase.removeChannel === 'function') supabase.removeChannel(libraryPresenceChannel);
      libraryRealtimeChannel = null;
      libraryPresenceChannel = null;
    };
  },

  resetToInitial: () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    debounceEditSequence = 0;
    editSequence = 0;
    requestSequence = 0;
    discardSequence = 0;
    workspaceReadSequence += 1;
    activeLibraryDrain = null;
    activeWorkspaceLoad = null;
    StorageService.saveProducts(INITIAL_PRODUCTS);
    set({
      products: INITIAL_PRODUCTS,
      productSessions: {},
      dataProvenance: 'demo_seed',
      workspaceLoaded: false,
      isDirty: false,
      isSaving: false,
      syncStatus: 'synced',
      syncError: null
    });
  }
}));

let libraryBeforeUnloadBound = false;
const libraryBeforeUnloadHandler = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  event.returnValue = '';
};

useLibraryStore.subscribe((state) => {
  if (typeof window === 'undefined') return;
  const shouldWarn = state.isDirty || state.isSaving;
  if (shouldWarn && !libraryBeforeUnloadBound) {
    window.addEventListener('beforeunload', libraryBeforeUnloadHandler);
    libraryBeforeUnloadBound = true;
  } else if (!shouldWarn && libraryBeforeUnloadBound) {
    window.removeEventListener('beforeunload', libraryBeforeUnloadHandler);
    libraryBeforeUnloadBound = false;
  }
});
