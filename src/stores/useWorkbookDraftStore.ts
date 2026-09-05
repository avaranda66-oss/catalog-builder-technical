import { create } from 'zustand';
import {
  ProductWorkbookV2,
  WorkbookOwner,
  createWorkbook,
  ensureWorkbookV2
} from '@/domain/product-workbook';
import {
  ProductWorkbookRepository,
  WorkbookConflictError
} from '@/services/product-workbook';
import { useAuthStore } from '@/stores/useAuthStore';

type WorkbookPathSegment =
  | { kind: 'key'; key: string }
  | { kind: 'entity'; id: string };

type WorkbookPatch =
  | {
      op: 'set' | 'delete';
      path: WorkbookPathSegment[];
      value?: unknown;
      beforeExists: boolean;
      beforeValue?: unknown;
    }
  | {
      op: 'array-add';
      path: WorkbookPathSegment[];
      entityId: string;
      entity: unknown;
    }
  | {
      op: 'array-remove';
      path: WorkbookPathSegment[];
      entityId: string;
    }
  | {
      op: 'array-order';
      path: WorkbookPathSegment[];
      beforeIds: string[];
      afterIds: string[];
    };

export interface WorkbookInFlightSave {
  requestId: string;
  generation: number;
  expectedRevision: number;
  sentSnapshot: ProductWorkbookV2;
  postSendDelta: WorkbookPatch[];
}

export interface WorkbookFailureBarrier {
  generation: number;
  message: string;
  sentSnapshot: ProductWorkbookV2;
  postSendDelta: WorkbookPatch[];
}

export interface WorkbookConflictBarrier {
  message: string;
  actualRevision: number | null;
  remoteRevision: number | null;
  remoteSnapshot: ProductWorkbookV2 | null;
  remoteDeletion: boolean;
}

export interface WorkbookReconciliationBarrier {
  reason: 'structural-replay' | 'same-revision-divergence' | 'invalid-ack';
  message: string;
  generation: number;
  acceptedRevision: number | null;
  sentSnapshot: ProductWorkbookV2;
  canonicalSnapshot: ProductWorkbookV2 | null;
  localDraft: ProductWorkbookV2;
  postSendDelta: WorkbookPatch[];
}

export interface WorkbookDiscardToken {
  id: string;
  authIdentity: string;
  ownerKey: string;
  epoch: number;
  generation: number;
  baseRevision: number | null;
  readEpoch: number;
  navigationEpoch: number;
}

export interface WorkbookDraftSession {
  key: string;
  ownerKey: string;
  authIdentity: string;
  owner: WorkbookOwner;
  epoch: number;
  readEpoch: number;
  verified: boolean;
  baseSnapshot: ProductWorkbookV2 | null;
  baseRevision: number | null;
  remoteSnapshot: ProductWorkbookV2 | null;
  remoteRevision: number | null;
  remoteDeletion: boolean;
  localGeneration: number;
  acknowledgedGeneration: number;
  draft: ProductWorkbookV2;
  inFlight: WorkbookInFlightSave | null;
  pendingGeneration: number | null;
  failure: WorkbookFailureBarrier | null;
  conflict: WorkbookConflictBarrier | null;
  reconciliationRequired: WorkbookReconciliationBarrier | null;
  discardToken: WorkbookDiscardToken | null;
  loadError: string | null;
  isLoading: boolean;
}

interface WorkbookDraftState {
  sessions: Record<string, WorkbookDraftSession>;
  getSession: (owner: WorkbookOwner) => WorkbookDraftSession | undefined;
  load: (owner: WorkbookOwner, repository: ProductWorkbookRepository) => Promise<boolean>;
  refresh: (owner: WorkbookOwner, repository: ProductWorkbookRepository) => Promise<boolean>;
  edit: (owner: WorkbookOwner, draft: ProductWorkbookV2) => void;
  save: (owner: WorkbookOwner, repository: ProductWorkbookRepository) => Promise<boolean>;
  discardWithRefresh: (owner: WorkbookOwner, repository: ProductWorkbookRepository, navigationEpoch: number) => Promise<boolean>;
  invalidateDiscardTokens: () => void;
  resetForTests: () => void;
}

const runtimeIdentity = `workbook-session-${Math.random().toString(36).slice(2, 10)}`;
let requestSequence = 0;
let discardSequence = 0;
const activeLoads = new Map<string, Promise<boolean>>();
const activeSaves = new Map<string, Promise<boolean>>();

function authIdentity(): string {
  return useAuthStore.getState().userId || runtimeIdentity;
}

function ownerKey(owner: WorkbookOwner): string {
  return `${owner.kind}:${owner.id}`;
}

function sessionKey(owner: WorkbookOwner, identity = authIdentity()): string {
  return `${identity}:${ownerKey(owner)}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function stableEntityId(value: unknown): string | null {
  return isRecord(value) && typeof value.id === 'string' ? value.id : null;
}

function isStableEntityArray(value: unknown): value is Array<Record<string, unknown> & { id: string }> {
  return Array.isArray(value) && value.every((entry) => stableEntityId(entry) !== null);
}

function keyPath(path: WorkbookPathSegment[], key: string): WorkbookPathSegment[] {
  return [...path, { kind: 'key', key }];
}

function entityPath(path: WorkbookPathSegment[], id: string): WorkbookPathSegment[] {
  return [...path, { kind: 'entity', id }];
}

function diffWorkbookValue(before: unknown, after: unknown, path: WorkbookPathSegment[], patches: WorkbookPatch[]): void {
  if (deepEqual(before, after)) return;

  if (isStableEntityArray(before) && isStableEntityArray(after)) {
    const beforeById = new Map(before.map((entry) => [entry.id, entry]));
    const afterById = new Map(after.map((entry) => [entry.id, entry]));

    for (const entry of before) {
      if (!afterById.has(entry.id)) {
        patches.push({ op: 'array-remove', path, entityId: entry.id });
      }
    }
    for (const entry of after) {
      if (!beforeById.has(entry.id)) {
        patches.push({ op: 'array-add', path, entityId: entry.id, entity: cloneJson(entry) });
      }
    }
    for (const entry of after) {
      const previous = beforeById.get(entry.id);
      if (previous) diffWorkbookValue(previous, entry, entityPath(path, entry.id), patches);
    }

    const beforeIds = before.map((entry) => entry.id);
    const afterIds = after.map((entry) => entry.id);
    if (!deepEqual(beforeIds, afterIds)) {
      patches.push({ op: 'array-order', path, beforeIds, afterIds });
    }
    return;
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (key === 'revision') continue;
      diffWorkbookValue(before[key], after[key], keyPath(path, key), patches);
    }
    return;
  }

  if (after === undefined) {
    patches.push({
      op: 'delete',
      path,
      beforeExists: before !== undefined,
      beforeValue: before === undefined ? undefined : cloneJson(before)
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

function diffWorkbook(before: ProductWorkbookV2, after: ProductWorkbookV2): WorkbookPatch[] {
  const patches: WorkbookPatch[] = [];
  diffWorkbookValue(before, after, [], patches);
  return patches;
}

function resolvePath(root: unknown, path: WorkbookPathSegment[]): { ok: true; value: unknown } | { ok: false; reason: string } {
  let current = root;
  for (const segment of path) {
    if (segment.kind === 'key') {
      if (!isRecord(current)) return { ok: false, reason: `estrutura incompatível antes de ${segment.key}` };
      current = current[segment.key];
      continue;
    }
    if (!Array.isArray(current)) return { ok: false, reason: `coleção ausente para entidade ${segment.id}` };
    const entry = current.find((candidate) => stableEntityId(candidate) === segment.id);
    if (!entry) return { ok: false, reason: `entidade ${segment.id} removida ou reidentificada pelo servidor` };
    current = entry;
  }
  return { ok: true, value: current };
}

function resolveParent(
  root: unknown,
  path: WorkbookPathSegment[]
): { ok: true; parent: Record<string, unknown> | unknown[]; leaf: WorkbookPathSegment } | { ok: false; reason: string } {
  if (path.length === 0) return { ok: false, reason: 'patch raiz não suportado' };
  const parentPath = path.slice(0, -1);
  const resolved = resolvePath(root, parentPath);
  if (!resolved.ok) return resolved;
  if (!isRecord(resolved.value) && !Array.isArray(resolved.value)) {
    return { ok: false, reason: 'pai estrutural incompatível' };
  }
  return { ok: true, parent: resolved.value, leaf: path[path.length - 1] };
}

function valueKind(value: unknown): 'array' | 'object' | 'scalar' | 'missing' {
  if (value === undefined) return 'missing';
  if (Array.isArray(value)) return 'array';
  if (isRecord(value)) return 'object';
  return 'scalar';
}

function replayWorkbookDelta(
  canonical: ProductWorkbookV2,
  patches: readonly WorkbookPatch[]
): { ok: true; draft: ProductWorkbookV2 } | { ok: false; reason: string } {
  const root = cloneJson(canonical) as unknown;

  for (const patch of patches) {
    if (patch.op === 'array-add' || patch.op === 'array-remove' || patch.op === 'array-order') {
      const resolved = resolvePath(root, patch.path);
      if (!resolved.ok) return resolved;
      if (!Array.isArray(resolved.value)) return { ok: false, reason: 'alvo de coleção mudou de tipo' };
      const collection = resolved.value;

      if (patch.op === 'array-add') {
        if (collection.some((entry) => stableEntityId(entry) === patch.entityId)) {
          return { ok: false, reason: `entidade ${patch.entityId} já existe no ACK canônico` };
        }
        collection.push(cloneJson(patch.entity));
        continue;
      }

      if (patch.op === 'array-remove') {
        const index = collection.findIndex((entry) => stableEntityId(entry) === patch.entityId);
        if (index >= 0) collection.splice(index, 1);
        continue;
      }

      const currentIds = collection.map(stableEntityId);
      if (currentIds.some((id) => id === null)) return { ok: false, reason: 'coleção perdeu identidade estável' };
      const currentIdStrings = currentIds as string[];
      const expectedMembership = new Set(patch.afterIds);
      if (currentIdStrings.length !== patch.afterIds.length || currentIdStrings.some((id) => !expectedMembership.has(id))) {
        return { ok: false, reason: 'membership canônico divergiu durante replay de ordem' };
      }
      const byId = new Map(collection.map((entry) => [stableEntityId(entry) as string, entry]));
      collection.splice(0, collection.length, ...patch.afterIds.map((id) => byId.get(id)!));
      continue;
    }

    const parentResolved = resolveParent(root, patch.path);
    if (!parentResolved.ok) return parentResolved;
    const { parent, leaf } = parentResolved;
    if (leaf.kind === 'entity') {
      return { ok: false, reason: `substituição estrutural direta da entidade ${leaf.id} não é suportada` };
    }
    if (!isRecord(parent)) return { ok: false, reason: `pai de ${leaf.key} não é objeto` };
    const currentExists = Object.prototype.hasOwnProperty.call(parent, leaf.key);
    const current = parent[leaf.key];
    if (!patch.beforeExists && currentExists) {
      return { ok: false, reason: `servidor criou o mesmo alvo local em ${leaf.key}` };
    }
    const beforeKind = valueKind(patch.beforeValue);
    const currentKind = valueKind(current);
    if ((beforeKind === 'array' || beforeKind === 'object') && currentExists && currentKind !== beforeKind) {
      return { ok: false, reason: `tipo estrutural mudou em ${leaf.key}` };
    }
    if (patch.op === 'delete') delete parent[leaf.key];
    else parent[leaf.key] = cloneJson(patch.value);
  }

  return { ok: true, draft: root as ProductWorkbookV2 };
}

function emptyWorkbook(owner: WorkbookOwner): ProductWorkbookV2 {
  return ensureWorkbookV2(createWorkbook({ owner, revision: 0 }));
}

function createSession(owner: WorkbookOwner, workbook: ProductWorkbookV2, identity = authIdentity()): WorkbookDraftSession {
  return {
    key: sessionKey(owner, identity),
    ownerKey: ownerKey(owner),
    authIdentity: identity,
    owner,
    epoch: 1,
    readEpoch: 1,
    verified: true,
    baseSnapshot: cloneJson(workbook),
    baseRevision: workbook.revision,
    remoteSnapshot: cloneJson(workbook),
    remoteRevision: workbook.revision,
    remoteDeletion: false,
    localGeneration: 0,
    acknowledgedGeneration: 0,
    draft: cloneJson(workbook),
    inFlight: null,
    pendingGeneration: null,
    failure: null,
    conflict: null,
    reconciliationRequired: null,
    discardToken: null,
    loadError: null,
    isLoading: false
  };
}

function isClean(session: WorkbookDraftSession): boolean {
  return session.verified
    && session.localGeneration === session.acknowledgedGeneration
    && session.inFlight === null
    && session.failure === null
    && session.conflict === null
    && session.reconciliationRequired === null;
}

function sameWorkbookCanonical(a: ProductWorkbookV2, b: ProductWorkbookV2): boolean {
  return deepEqual(a, b);
}

function applyRemoteEvidence(
  session: WorkbookDraftSession,
  remote: ProductWorkbookV2 | null
): WorkbookDraftSession {
  const deletion = remote === null && (session.baseRevision ?? 0) > 0;
  const remoteRevision = remote?.revision ?? (deletion ? session.remoteRevision : 0);
  const acceptsRemoteSnapshot = Boolean(
    remote
      && (session.remoteRevision === null || remote.revision >= session.remoteRevision)
  );
  let next: WorkbookDraftSession = {
    ...session,
    remoteSnapshot: acceptsRemoteSnapshot ? cloneJson(remote) : session.remoteSnapshot,
    remoteRevision: remoteRevision !== null && (session.remoteRevision === null || remoteRevision >= session.remoteRevision)
      ? remoteRevision
      : session.remoteRevision,
    remoteDeletion: deletion || session.remoteDeletion,
    loadError: null,
    isLoading: false
  };

  if (deletion) {
    if (isClean(session)) {
      return {
        ...next,
        verified: true,
        baseSnapshot: null,
        baseRevision: null,
        remoteSnapshot: null,
        remoteDeletion: true,
        draft: emptyWorkbook(session.owner),
        readEpoch: session.readEpoch + 1
      };
    }
    if (!isClean(session)) {
      next.conflict = {
        message: 'O workbook foi removido remotamente enquanto há alterações locais.',
        actualRevision: null,
        remoteRevision: next.remoteRevision,
        remoteSnapshot: next.remoteSnapshot,
        remoteDeletion: true
      };
    }
    return next;
  }

  if (!remote) return next;
  if (session.baseRevision !== null && remote.revision < session.baseRevision) return next;

  if (isClean(session)) {
    if (session.baseRevision === null || remote.revision > session.baseRevision) {
      return {
        ...next,
        verified: true,
        baseSnapshot: cloneJson(remote),
        baseRevision: remote.revision,
        draft: cloneJson(remote),
        remoteDeletion: false,
        readEpoch: session.readEpoch + 1
      };
    }
    if (remote.revision === session.baseRevision && session.baseSnapshot && !sameWorkbookCanonical(session.baseSnapshot, remote)) {
      return {
        ...next,
        reconciliationRequired: {
          reason: 'same-revision-divergence',
          message: 'O servidor retornou conteúdo incompatível para a mesma revisão do workbook.',
          generation: session.localGeneration,
          acceptedRevision: remote.revision,
          sentSnapshot: cloneJson(session.baseSnapshot),
          canonicalSnapshot: cloneJson(remote),
          localDraft: cloneJson(session.draft),
          postSendDelta: []
        }
      };
    }
    return next;
  }

  if (session.inFlight === null && session.baseRevision !== null && remote.revision > session.baseRevision) {
    next.conflict = {
      message: `O servidor possui revisão ${remote.revision}, mais recente que a base local ${session.baseRevision}.`,
      actualRevision: remote.revision,
      remoteRevision: remote.revision,
      remoteSnapshot: cloneJson(remote),
      remoteDeletion: false
    };
  }
  return next;
}

export const useWorkbookDraftStore = create<WorkbookDraftState>((set, get) => ({
  sessions: {},

  getSession: (owner) => get().sessions[sessionKey(owner)],

  load: async (owner, repository) => {
    const identity = authIdentity();
    const key = sessionKey(owner, identity);
    const existing = get().sessions[key];
    if (existing && (existing.localGeneration > 0 || existing.inFlight || existing.failure || existing.conflict || existing.reconciliationRequired)) {
      return true;
    }
    const active = activeLoads.get(key);
    if (active) return active;

    const capturedEpoch = existing?.epoch ?? 1;
    const capturedReadEpoch = existing?.readEpoch ?? 0;
    set((state) => {
      const current = state.sessions[key];
      if (current) return { sessions: { ...state.sessions, [key]: { ...current, isLoading: true, loadError: null } } };
      const initial = createSession(owner, emptyWorkbook(owner), identity);
      initial.verified = false;
      initial.baseSnapshot = null;
      initial.baseRevision = null;
      initial.remoteSnapshot = null;
      initial.remoteRevision = null;
      initial.isLoading = true;
      return { sessions: { ...state.sessions, [key]: initial } };
    });

    const promise = (async () => {
      try {
        const loaded = await repository.getWorkbook(owner);
        const canonical = loaded ? ensureWorkbookV2(loaded) : emptyWorkbook(owner);
        let applied = false;
        set((state) => {
          const current = state.sessions[key];
          if (!current || current.authIdentity !== identity || current.epoch !== capturedEpoch) return {};
          if (existing && current.readEpoch !== capturedReadEpoch) return {};
          if (current.localGeneration > current.acknowledgedGeneration || current.inFlight || current.failure || current.conflict || current.reconciliationRequired) {
            const next = applyRemoteEvidence(current, loaded ? canonical : null);
            return { sessions: { ...state.sessions, [key]: next } };
          }
          const next = {
            ...createSession(owner, canonical, identity),
            epoch: current.epoch,
            readEpoch: current.readEpoch + 1
          };
          applied = true;
          return { sessions: { ...state.sessions, [key]: next } };
        });
        return applied || Boolean(get().sessions[key]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao carregar workbook técnico do produto.';
        set((state) => {
          const current = state.sessions[key];
          if (!current || current.epoch !== capturedEpoch) return {};
          return { sessions: { ...state.sessions, [key]: { ...current, isLoading: false, loadError: message } } };
        });
        return false;
      }
    })();

    activeLoads.set(key, promise);
    try {
      return await promise;
    } finally {
      if (activeLoads.get(key) === promise) activeLoads.delete(key);
    }
  },

  refresh: async (owner, repository) => {
    const identity = authIdentity();
    const key = sessionKey(owner, identity);
    const session = get().sessions[key];
    if (!session) return get().load(owner, repository);
    const active = activeLoads.get(key);
    if (active) return active;
    const capturedEpoch = session.epoch;
    const capturedReadEpoch = session.readEpoch;
    set((state) => {
      const current = state.sessions[key];
      if (!current) return {};
      return { sessions: { ...state.sessions, [key]: { ...current, isLoading: true, loadError: null } } };
    });

    const promise = (async () => {
      try {
        const loaded = await repository.getWorkbook(owner);
        const canonical = loaded ? ensureWorkbookV2(loaded) : null;
        let accepted = false;
        set((state) => {
          const current = state.sessions[key];
          if (!current || current.epoch !== capturedEpoch || current.readEpoch !== capturedReadEpoch) return {};
          const next = applyRemoteEvidence(current, canonical);
          accepted = true;
          return { sessions: { ...state.sessions, [key]: next } };
        });
        return accepted;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao atualizar workbook.';
        set((state) => {
          const current = state.sessions[key];
          if (!current || current.epoch !== capturedEpoch) return {};
          return { sessions: { ...state.sessions, [key]: { ...current, isLoading: false, loadError: message } } };
        });
        return false;
      }
    })();
    activeLoads.set(key, promise);
    try {
      return await promise;
    } finally {
      if (activeLoads.get(key) === promise) activeLoads.delete(key);
    }
  },

  edit: (owner, draft) => {
    const identity = authIdentity();
    const key = sessionKey(owner, identity);
    set((state) => {
      const existing = state.sessions[key] || createSession(owner, emptyWorkbook(owner), identity);
      if (draft.owner.kind !== owner.kind || draft.owner.id !== owner.id) return {};
      const normalizedDraft = cloneJson({ ...draft, revision: existing.baseRevision ?? draft.revision });
      const patches = diffWorkbook(existing.draft, normalizedDraft);
      const generation = existing.localGeneration + 1;
      const inFlight = existing.inFlight
        ? { ...existing.inFlight, postSendDelta: [...existing.inFlight.postSendDelta, ...patches] }
        : null;
      const next: WorkbookDraftSession = {
        ...existing,
        localGeneration: generation,
        draft: normalizedDraft,
        inFlight,
        pendingGeneration: generation,
        discardToken: null
      };
      return { sessions: { ...state.sessions, [key]: next } };
    });
  },

  save: async (owner, repository) => {
    const identity = authIdentity();
    const key = sessionKey(owner, identity);
    const joined = activeSaves.get(key);
    if (joined) return joined;

    const initial = get().sessions[key];
    if (!initial || initial.inFlight) return false;
    if (!initial.verified || initial.baseRevision === null) return false;
    if (initial.conflict || initial.reconciliationRequired) return false;
    if (initial.localGeneration <= initial.acknowledgedGeneration) return true;
    if (initial.remoteDeletion || (initial.remoteRevision !== null && initial.remoteRevision > initial.baseRevision)) {
      set((state) => {
        const current = state.sessions[key];
        if (!current) return {};
        const next: WorkbookDraftSession = {
          ...current,
          conflict: {
            message: 'Há evidência remota mais recente; o salvamento foi bloqueado.',
            actualRevision: current.remoteRevision,
            remoteRevision: current.remoteRevision,
            remoteSnapshot: current.remoteSnapshot,
            remoteDeletion: current.remoteDeletion
          }
        };
        return { sessions: { ...state.sessions, [key]: next } };
      });
      return false;
    }

    const promise = (async () => {
      const currentBeforeDispatch = get().sessions[key];
      if (!currentBeforeDispatch) return false;
      const generation = currentBeforeDispatch.localGeneration;
      const expectedRevision = currentBeforeDispatch.baseRevision!;
      const requestId = `workbook-save-${++requestSequence}`;
      const sentSnapshot = cloneJson({ ...currentBeforeDispatch.draft, revision: expectedRevision });
      const capturedEpoch = currentBeforeDispatch.epoch;

      set((state) => {
        const current = state.sessions[key];
        if (!current || current.epoch !== capturedEpoch || current.inFlight) return {};
        const next: WorkbookDraftSession = {
          ...current,
          inFlight: { requestId, generation, expectedRevision, sentSnapshot, postSendDelta: [] },
          pendingGeneration: null,
          failure: null,
          discardToken: null
        };
        return { sessions: { ...state.sessions, [key]: next } };
      });

      try {
        const result = await repository.saveWorkbook({ workbook: sentSnapshot, expectedRevision });
        let cleanResult = false;
        set((state) => {
          const current = state.sessions[key];
          if (!current || current.authIdentity !== identity || current.epoch !== capturedEpoch) return {};
          if (!current.inFlight || current.inFlight.requestId !== requestId) return {};
          const inFlight = current.inFlight;
          const canonical = ensureWorkbookV2(result.workbook);
          const validIdentity = canonical.owner.kind === owner.kind && canonical.owner.id === owner.id;
          const acceptedRevision = result.revision;
          if (!validIdentity || acceptedRevision !== expectedRevision + 1 || canonical.revision !== acceptedRevision) {
            const next: WorkbookDraftSession = {
              ...current,
              inFlight: null,
              pendingGeneration: current.localGeneration,
              reconciliationRequired: {
                reason: 'invalid-ack',
                message: 'ACK do workbook não corresponde ao owner/revisão enviados.',
                generation: inFlight.generation,
                acceptedRevision,
                sentSnapshot: cloneJson(inFlight.sentSnapshot),
                canonicalSnapshot: cloneJson(canonical),
                localDraft: cloneJson(current.draft),
                postSendDelta: cloneJson(inFlight.postSendDelta)
              }
            };
            return { sessions: { ...state.sessions, [key]: next } };
          }

          const replayed = replayWorkbookDelta(canonical, inFlight.postSendDelta);
          if (!replayed.ok) {
            const next: WorkbookDraftSession = {
              ...current,
              inFlight: null,
              pendingGeneration: current.localGeneration,
              remoteSnapshot: cloneJson(canonical),
              remoteRevision: acceptedRevision,
              reconciliationRequired: {
                reason: 'structural-replay',
                message: `Não foi possível reaplicar alterações pós-envio com segurança: ${replayed.reason}`,
                generation: inFlight.generation,
                acceptedRevision,
                sentSnapshot: cloneJson(inFlight.sentSnapshot),
                canonicalSnapshot: cloneJson(canonical),
                localDraft: cloneJson(current.draft),
                postSendDelta: cloneJson(inFlight.postSendDelta)
              }
            };
            return { sessions: { ...state.sessions, [key]: next } };
          }

          let conflict = current.conflict;
          let reconciliationRequired: WorkbookReconciliationBarrier | null = null;
          if (current.remoteDeletion) {
            conflict = {
              message: 'O workbook foi removido remotamente durante o salvamento.',
              actualRevision: null,
              remoteRevision: current.remoteRevision,
              remoteSnapshot: current.remoteSnapshot,
              remoteDeletion: true
            };
          } else if (current.remoteRevision !== null && current.remoteRevision > acceptedRevision) {
            conflict = {
              message: `Foi observada revisão remota ${current.remoteRevision} após o ACK ${acceptedRevision}.`,
              actualRevision: current.remoteRevision,
              remoteRevision: current.remoteRevision,
              remoteSnapshot: current.remoteSnapshot,
              remoteDeletion: false
            };
          } else if (
            current.remoteRevision === acceptedRevision
            && current.remoteSnapshot
            && !sameWorkbookCanonical(current.remoteSnapshot, canonical)
          ) {
            reconciliationRequired = {
              reason: 'same-revision-divergence',
              message: 'O ACK e a leitura remota divergem para a mesma revisão.',
              generation: inFlight.generation,
              acceptedRevision,
              sentSnapshot: cloneJson(inFlight.sentSnapshot),
              canonicalSnapshot: cloneJson(canonical),
              localDraft: cloneJson(current.draft),
              postSendDelta: cloneJson(inFlight.postSendDelta)
            };
          }

          const next: WorkbookDraftSession = {
            ...current,
            verified: true,
            baseSnapshot: cloneJson(canonical),
            baseRevision: acceptedRevision,
            remoteSnapshot: current.remoteRevision !== null && current.remoteRevision > acceptedRevision
              ? current.remoteSnapshot
              : cloneJson(canonical),
            remoteRevision: current.remoteRevision === null ? acceptedRevision : Math.max(current.remoteRevision, acceptedRevision),
            acknowledgedGeneration: inFlight.generation,
            draft: cloneJson({ ...replayed.draft, revision: acceptedRevision }),
            inFlight: null,
            pendingGeneration: current.localGeneration > inFlight.generation ? current.localGeneration : null,
            failure: null,
            conflict,
            reconciliationRequired,
            discardToken: null,
            readEpoch: current.readEpoch + 1
          };
          cleanResult = conflict === null
            && reconciliationRequired === null
            && next.localGeneration === next.acknowledgedGeneration;
          return { sessions: { ...state.sessions, [key]: next } };
        });
        return cleanResult;
      } catch (error) {
        set((state) => {
          const current = state.sessions[key];
          if (!current || current.epoch !== capturedEpoch || current.inFlight?.requestId !== requestId) return {};
          const inFlight = current.inFlight;
          if (error instanceof WorkbookConflictError) {
            const next: WorkbookDraftSession = {
              ...current,
              inFlight: null,
              pendingGeneration: current.localGeneration,
              conflict: {
                message: error.message,
                actualRevision: error.actualRevision ?? null,
                remoteRevision: error.actualRevision ?? current.remoteRevision,
                remoteSnapshot: current.remoteSnapshot,
                remoteDeletion: current.remoteDeletion
              }
            };
            return { sessions: { ...state.sessions, [key]: next } };
          }
          const message = error instanceof Error ? error.message : 'Falha ao salvar workbook.';
          const next: WorkbookDraftSession = {
            ...current,
            inFlight: null,
            pendingGeneration: current.localGeneration,
            failure: {
              generation: inFlight.generation,
              message,
              sentSnapshot: cloneJson(inFlight.sentSnapshot),
              postSendDelta: cloneJson(inFlight.postSendDelta)
            }
          };
          return { sessions: { ...state.sessions, [key]: next } };
        });
        return false;
      }
    })();

    activeSaves.set(key, promise);
    try {
      return await promise;
    } finally {
      if (activeSaves.get(key) === promise) activeSaves.delete(key);
    }
  },

  discardWithRefresh: async (owner, repository, navigationEpoch) => {
    const identity = authIdentity();
    const key = sessionKey(owner, identity);
    const session = get().sessions[key];
    if (!session || session.inFlight) return false;
    const token: WorkbookDiscardToken = {
      id: `workbook-discard-${++discardSequence}`,
      authIdentity: identity,
      ownerKey: session.ownerKey,
      epoch: session.epoch,
      generation: session.localGeneration,
      baseRevision: session.baseRevision,
      readEpoch: session.readEpoch,
      navigationEpoch
    };
    set((state) => {
      const current = state.sessions[key];
      if (!current || current.inFlight || current.epoch !== session.epoch) return {};
      return { sessions: { ...state.sessions, [key]: { ...current, discardToken: token } } };
    });

    try {
      const loaded = await repository.getWorkbook(owner);
      const canonical = loaded ? ensureWorkbookV2(loaded) : emptyWorkbook(owner);
      let discarded = false;
      set((state) => {
        const current = state.sessions[key];
        if (!current || current.discardToken?.id !== token.id) return {};
        const exact = current.authIdentity === token.authIdentity
          && current.ownerKey === token.ownerKey
          && current.epoch === token.epoch
          && current.localGeneration === token.generation
          && current.baseRevision === token.baseRevision
          && current.readEpoch === token.readEpoch
          && current.inFlight === null;
        if (!exact) return {};
        const next: WorkbookDraftSession = {
          ...createSession(owner, canonical, identity),
          epoch: current.epoch + 1,
          readEpoch: current.readEpoch + 1
        };
        discarded = true;
        return { sessions: { ...state.sessions, [key]: next } };
      });
      return discarded;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao recarregar workbook para descarte.';
      set((state) => {
        const current = state.sessions[key];
        if (!current || current.discardToken?.id !== token.id) return {};
        return {
          sessions: {
            ...state.sessions,
            [key]: { ...current, discardToken: null, loadError: message }
          }
        };
      });
      return false;
    }
  },

  invalidateDiscardTokens: () => {
    set((state) => {
      let changed = false;
      const sessions = { ...state.sessions };
      for (const [key, session] of Object.entries(sessions)) {
        if (!session.discardToken) continue;
        sessions[key] = { ...session, discardToken: null };
        changed = true;
      }
      return changed ? { sessions } : {};
    });
  },

  resetForTests: () => {
    activeLoads.clear();
    activeSaves.clear();
    requestSequence = 0;
    discardSequence = 0;
    set({ sessions: {} });
  }
}));

let workbookBeforeUnloadBound = false;
const workbookBeforeUnloadHandler = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  event.returnValue = '';
};

useWorkbookDraftStore.subscribe((state) => {
  if (typeof window === 'undefined') return;
  const identity = authIdentity();
  const shouldWarn = Object.values(state.sessions).some((session) => (
    session.authIdentity === identity
      && (session.localGeneration > session.acknowledgedGeneration || session.inFlight !== null)
  ));
  if (shouldWarn && !workbookBeforeUnloadBound) {
    window.addEventListener('beforeunload', workbookBeforeUnloadHandler);
    workbookBeforeUnloadBound = true;
  } else if (!shouldWarn && workbookBeforeUnloadBound) {
    window.removeEventListener('beforeunload', workbookBeforeUnloadHandler);
    workbookBeforeUnloadBound = false;
  }
});
